import { inventorySnapshot } from "./api-smooth1.js?v=orders1";
import { notice } from "./utils.js?v=filters1";

let inventoryPromise = null;

function loadInventory() {
  if (!inventoryPromise) {
    inventoryPromise = inventorySnapshot().then((rows) => Array.isArray(rows) ? rows : []);
  }
  return inventoryPromise;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function naturalCompare(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function numberValue(line, field) {
  return Number(line.querySelector(`[data-line-field="${field}"]`)?.value || 0);
}

function productIdForLine(line) {
  return String(line.querySelector("[data-product-choice]")?.value || line.dataset.productId || "");
}

function lotForRow(row) {
  return row.lot || {};
}

function availableLb(row) {
  return Number(row.available_qty ?? row.qty ?? row.current_qty ?? 0) || 0;
}

function rowChoice(row) {
  const lot = lotForRow(row);
  const productId = String(row.product_id || "");
  const lotId = String(row.internal_lot_id || "");
  const locationId = String(row.location_id || "");
  const supplierLot = String(lot.supplier_lot_number || row.supplier_lot_number || lotId || "Unknown lot").trim();
  return {
    key: `${productId}|${lotId}|${locationId}`,
    productId,
    lotId,
    locationId,
    supplierLot,
    supplierLotKey: `${productId}|${supplierLot}`,
    availableLb: availableLb(row)
  };
}

function activeProductChoices(rows, productId) {
  return rows
    .filter((row) => String(row.product_id || "") === productId)
    .filter((row) => availableLb(row) > 0)
    .filter((row) => {
      const status = String(lotForRow(row).status || "ACTIVE").toUpperCase();
      return status === "ACTIVE" || status === "AVAILABLE";
    })
    .map(rowChoice)
    .sort((a, b) => naturalCompare(a.locationId, b.locationId)
      || naturalCompare(a.supplierLot, b.supplierLot)
      || naturalCompare(a.lotId, b.lotId));
}

function ensureEditButton(line) {
  if (!line || line.querySelector("[data-edit-spaces]")) return;
  const title = line.querySelector(".po-line-title");
  const removeButton = title?.querySelector("[data-remove-sales-line]");
  if (!title || !removeButton) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn secondary sales-space-edit-button";
  button.dataset.editSpaces = "true";
  button.textContent = "Edit Spaces";
  title.insertBefore(button, removeButton);
}

function closeEditor(line) {
  line?.querySelector("[data-space-editor]")?.remove();
}

function editorRowsHtml(choices, weight, selectedSpaceKey, requestedQty) {
  return choices.map((choice) => {
    const availableUnits = weight > 0 ? choice.availableLb / weight : 0;
    const preselected = choice.key === selectedSpaceKey && requestedQty <= availableUnits + 0.0001;
    return `
      <div class="sales-space-row" data-space-key="${escapeHtml(choice.key)}"
           data-product-id="${escapeHtml(choice.productId)}"
           data-lot-id="${escapeHtml(choice.lotId)}"
           data-location-id="${escapeHtml(choice.locationId)}"
           data-supplier-lot="${escapeHtml(choice.supplierLot)}"
           data-supplier-lot-key="${escapeHtml(choice.supplierLotKey)}"
           data-available-lb="${choice.availableLb}">
        <label class="sales-space-check">
          <input type="checkbox" data-space-check ${preselected ? "checked" : ""}>
          <span><strong>${escapeHtml(choice.locationId)}</strong> · ${escapeHtml(choice.supplierLot)} · ${escapeHtml(choice.lotId)}</span>
        </label>
        <div class="sales-space-quantity">
          <input type="number" min="0" step="0.01" max="${availableUnits.toFixed(4)}" data-space-qty value="${preselected ? requestedQty : ""}" placeholder="0">
          <span>of ${formatNumber(availableUnits)} available</span>
          <button class="btn secondary" type="button" data-use-space-available>Use available</button>
        </div>
      </div>`;
  }).join("");
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number)
    ? number.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "0";
}

function selectedEditorTotal(editor) {
  return Array.from(editor.querySelectorAll(".sales-space-row")).reduce((sum, row) => {
    const checked = row.querySelector("[data-space-check]")?.checked;
    const qty = Number(row.querySelector("[data-space-qty]")?.value || 0);
    return checked && qty > 0 ? sum + qty : sum;
  }, 0);
}

function updateEditorSummary(editor) {
  const requested = Number(editor.dataset.requestedQty || 0);
  const weight = Number(editor.dataset.unitWeight || 0);
  const selected = selectedEditorTotal(editor);
  const difference = requested - selected;
  const summary = editor.querySelector("[data-space-summary]");
  if (!summary) return;

  const status = Math.abs(difference) <= 0.01
    ? "Ready to apply"
    : difference > 0
      ? `${formatNumber(difference)} remaining`
      : `${formatNumber(Math.abs(difference))} over the order quantity`;
  summary.textContent = `${formatNumber(selected)} selected (${formatNumber(selected * weight)} LB) · ${status}`;
  summary.classList.toggle("is-ready", Math.abs(difference) <= 0.01);
  summary.classList.toggle("is-error", difference < -0.01);
}

async function openEditor(line) {
  const productId = productIdForLine(line);
  if (!productId) {
    notice("Select a product before editing warehouse spaces.");
    return;
  }

  closeEditor(line);
  const rows = await loadInventory();
  const choices = activeProductChoices(rows, productId);
  if (!choices.length) {
    notice("No available warehouse spaces were found for this product.");
    return;
  }

  const requestedQty = numberValue(line, "qty_ordered");
  const weight = numberValue(line, "unit_weight_lbs");
  if (requestedQty <= 0 || weight <= 0) {
    notice("Enter the order quantity and LB per unit before editing spaces.");
    return;
  }

  const selectedSpaceKey = line.querySelector("[data-location-choice]")?.value || "";
  const editor = document.createElement("section");
  editor.className = "sales-space-editor";
  editor.dataset.spaceEditor = "true";
  editor.dataset.requestedQty = String(requestedQty);
  editor.dataset.unitWeight = String(weight);
  editor.innerHTML = `
    <div class="sales-space-editor-header">
      <div>
        <strong>Edit Exact Warehouse Spaces</strong>
        <p>Select the spaces already used and distribute exactly ${formatNumber(requestedQty)} units (${formatNumber(requestedQty * weight)} LB).</p>
      </div>
      <button class="po-remove-line" data-close-space-editor type="button" aria-label="Close space editor">&times;</button>
    </div>
    <div class="sales-space-editor-list">${editorRowsHtml(choices, weight, selectedSpaceKey, requestedQty)}</div>
    <div class="sales-space-editor-footer">
      <strong data-space-summary></strong>
      <div class="actions">
        <button class="btn secondary" data-cancel-space-editor type="button">Cancel</button>
        <button class="btn" data-apply-space-editor type="button">Apply Selected Spaces</button>
      </div>
    </div>`;

  line.querySelector("[data-allocation-preview]")?.insertAdjacentElement("afterend", editor);
  updateEditorSummary(editor);
}

function allocationFromRow(row, weight) {
  const qty = Number(row.querySelector("[data-space-qty]")?.value || 0);
  const availableLbValue = Number(row.dataset.availableLb || 0);
  return {
    key: row.dataset.spaceKey || "",
    productId: row.dataset.productId || "",
    lotId: row.dataset.lotId || "",
    locationId: row.dataset.locationId || "",
    supplierLot: row.dataset.supplierLot || "",
    supplierLotKey: row.dataset.supplierLotKey || "",
    qty,
    baseQty: qty * weight,
    availableLb: availableLbValue
  };
}

function configureLineForAllocation(line, allocation, values) {
  const productSelect = line.querySelector("[data-product-choice]");
  productSelect.value = allocation.productId;
  productSelect.dispatchEvent(new Event("change", { bubbles: true }));

  const unitSelect = line.querySelector('[data-line-field="unit_type"]');
  const weightInput = line.querySelector('[data-line-field="unit_weight_lbs"]');
  const priceInput = line.querySelector('[data-line-field="unit_price"]');
  unitSelect.value = values.unit;
  weightInput.value = values.weight;
  priceInput.value = values.price;

  const lotSelect = line.querySelector("[data-supplier-lot-choice]");
  lotSelect.value = allocation.supplierLotKey;
  lotSelect.dispatchEvent(new Event("change", { bubbles: true }));

  const locationSelect = line.querySelector("[data-location-choice]");
  locationSelect.value = allocation.key;
  locationSelect.dispatchEvent(new Event("change", { bubbles: true }));

  const qtyInput = line.querySelector('[data-line-field="qty_ordered"]');
  qtyInput.value = allocation.qty.toFixed(4).replace(/\.?(?:0+)$/, "");
  qtyInput.dispatchEvent(new Event("input", { bubbles: true }));
  line.dataset.manualSpaceSelection = "true";
  ensureEditButton(line);
}

function refreshRemoveButtons(form) {
  const buttons = Array.from(form.querySelectorAll("[data-remove-sales-line]"));
  buttons.forEach((button) => {
    button.disabled = buttons.length <= 1;
  });
}

function applyEditor(line, editor) {
  const requestedQty = Number(editor.dataset.requestedQty || 0);
  const weight = Number(editor.dataset.unitWeight || 0);
  const selectedRows = Array.from(editor.querySelectorAll(".sales-space-row"))
    .filter((row) => row.querySelector("[data-space-check]")?.checked);
  const allocations = selectedRows
    .map((row) => allocationFromRow(row, weight))
    .filter((allocation) => allocation.qty > 0);

  if (!allocations.length) {
    notice("Select at least one warehouse space and enter a quantity.");
    return;
  }

  const invalid = allocations.find((allocation) => allocation.baseQty > allocation.availableLb + 0.0001);
  if (invalid) {
    notice(`${invalid.locationId} does not have enough inventory for the quantity entered.`);
    return;
  }

  const selectedTotal = allocations.reduce((sum, allocation) => sum + allocation.qty, 0);
  if (Math.abs(selectedTotal - requestedQty) > 0.01) {
    notice(`Selected spaces total ${formatNumber(selectedTotal)} units. They must equal the order quantity of ${formatNumber(requestedQty)}.`);
    return;
  }

  const form = line.closest("form");
  const container = line.parentElement;
  const values = {
    unit: line.querySelector('[data-line-field="unit_type"]')?.value || "CASE",
    weight,
    price: numberValue(line, "unit_price")
  };

  editor.remove();
  const targetLines = [line];
  let insertAfter = line;
  allocations.slice(1).forEach((allocation, index) => {
    const clone = line.cloneNode(true);
    clone.dataset.draftLineId = `manual-space-${Date.now()}-${index}`;
    clone.querySelector("[data-space-editor]")?.remove();
    insertAfter.insertAdjacentElement("afterend", clone);
    insertAfter = clone;
    targetLines.push(clone);
  });

  targetLines.forEach((targetLine, index) => configureLineForAllocation(targetLine, allocations[index], values));
  refreshRemoveButtons(form);
  notice(`Applied ${allocations.length} exact warehouse space${allocations.length === 1 ? "" : "s"} to this product.`);
  container?.scrollIntoView({ block: "nearest" });
}

document.addEventListener("focusin", (event) => {
  const line = event.target.closest?.(".sales-line-item");
  if (line) ensureEditButton(line);
});

document.addEventListener("change", (event) => {
  const line = event.target.closest?.(".sales-line-item");
  if (!line) return;
  ensureEditButton(line);

  if (event.target.matches("[data-product-choice]")) {
    line.dataset.manualSpaceSelection = "";
    closeEditor(line);
  }
});

document.addEventListener("click", async (event) => {
  const editButton = event.target.closest?.("[data-edit-spaces]");
  if (editButton) {
    event.preventDefault();
    await openEditor(editButton.closest(".sales-line-item"));
    return;
  }

  const closeButton = event.target.closest?.("[data-close-space-editor], [data-cancel-space-editor]");
  if (closeButton) {
    event.preventDefault();
    closeButton.closest("[data-space-editor]")?.remove();
    return;
  }

  const availableButton = event.target.closest?.("[data-use-space-available]");
  if (availableButton) {
    event.preventDefault();
    const row = availableButton.closest(".sales-space-row");
    const editor = availableButton.closest("[data-space-editor]");
    const weight = Number(editor?.dataset.unitWeight || 0);
    const available = Number(row?.dataset.availableLb || 0) / weight;
    const checkbox = row?.querySelector("[data-space-check]");
    const qtyInput = row?.querySelector("[data-space-qty]");
    if (checkbox) checkbox.checked = true;
    if (qtyInput) qtyInput.value = available.toFixed(4).replace(/\.?(?:0+)$/, "");
    if (editor) updateEditorSummary(editor);
    return;
  }

  const applyButton = event.target.closest?.("[data-apply-space-editor]");
  if (applyButton) {
    event.preventDefault();
    const editor = applyButton.closest("[data-space-editor]");
    const line = applyButton.closest(".sales-line-item");
    if (line && editor) applyEditor(line, editor);
  }
});

document.addEventListener("input", (event) => {
  const editor = event.target.closest?.("[data-space-editor]");
  if (!editor || !event.target.matches("[data-space-qty]")) return;
  const row = event.target.closest(".sales-space-row");
  const checkbox = row?.querySelector("[data-space-check]");
  if (checkbox) checkbox.checked = Number(event.target.value || 0) > 0;
  updateEditorSummary(editor);
});

document.addEventListener("change", (event) => {
  const editor = event.target.closest?.("[data-space-editor]");
  if (!editor || !event.target.matches("[data-space-check]")) return;
  const row = event.target.closest(".sales-space-row");
  const qtyInput = row?.querySelector("[data-space-qty]");
  if (!event.target.checked && qtyInput) qtyInput.value = "";
  updateEditorSummary(editor);
});
