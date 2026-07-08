import {
  createSalesOrder,
  getSalesOrderDetail,
  inventorySnapshot,
  listLocations,
  listSalesOrders,
  listSuppliers,
  salesOrderAction
} from "../js/api-smooth1.js?v=orders1";
import { can } from "../js/permissions.js?v=orders1";
import { escapeHtml, formatMoney, notice, status, table } from "../js/utils.js?v=filters1";

const SALES_UNITS = ["CASE", "BAG", "BOX", "LB", "EACH", "PALLET"];
const SALES_CHANNELS = ["BULK", "AMAZON", "RETAIL", "DISTRIBUTOR", "OTHER"];
const SHIP_METHODS = ["CUSTOMER_PICKUP", "SAN_JOSE_DELIVERY", "LTL_FREIGHT", "PARCEL", "AMAZON_FBA", "OTHER"];

let nextSalesLineId = 1;

export async function render(ctx) {
  ctx.setTitle("Sales Orders", "Sell inventory with FIFO lot and multi-space pick plans");

  const [orders, parties, inventoryRows, locations] = await Promise.all([
    listSalesOrders(),
    listSuppliers(),
    inventorySnapshot(),
    listLocations()
  ]);

  const customers = parties.filter(isActive).filter(isCustomer);
  const locationMap = new Map((locations || []).map((location) => [String(location.location_id || ""), location]));
  const inventoryChoices = buildInventoryChoices(inventoryRows, locationMap);
  const productChoices = buildProductChoices(inventoryChoices);

  ctx.view.innerHTML = `
    <div class="grid">
      ${can(ctx.user, "salesOrders:create") ? salesOrderForm(customers, productChoices) : ""}
      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Sales Orders</h2>
            <p class="muted">Confirmed orders reserve inventory through pick tasks. Inventory is deducted only through Send Product scans.</p>
          </div>
        </div>
        ${table([
          { label: "SO", key: "sales_order_id" },
          { label: "Date", render: (row) => escapeHtml(formatDate(row.order_date)) },
          { label: "Customer", render: (row) => escapeHtml(row.customer?.supplier_name || row.customer_name || row.customer_id || "") },
          { label: "Channel", render: (row) => escapeHtml(displayValue(row.channel)) },
          { label: "Products", render: (row) => escapeHtml(row.product_names || row.line_count || 0) },
          { label: "Total", render: (row) => money(row.total_amount) },
          { label: "Status", render: (row) => status(row.status) },
          { label: "Actions", render: (row) => actionButtons(ctx, row) }
        ], orders)}
      </section>
    </div>
  `;

  setupSalesOrderBuilder(ctx, customers, inventoryChoices, productChoices);
  setupSalesOrderActions(ctx);
}

function salesOrderForm(customers, productChoices) {
  return `
    <section class="panel po-builder sales-order-builder">
      <div class="panel-header">
        <div>
          <h2>Create Sales Order</h2>
          <p class="muted">Choose product, quantity, and LB per case. The system builds a FIFO pick plan across one or more spaces.</p>
        </div>
      </div>
      <form id="salesOrderForm">
        <div class="sales-order-header-grid">
          <div class="field">
            <label>Customer</label>
            <select name="customer_id" required>
              <option value="">Select customer</option>
              ${customers.map((customer) => `<option value="${escapeHtml(customer.supplier_id)}">${escapeHtml(customer.supplier_name)} | ${escapeHtml(customer.supplier_id)}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Order Date</label><input name="order_date" type="date" value="${todayValue()}" required></div>
          <div class="field"><label>Requested Delivery / Pickup</label><input name="requested_delivery_date" type="date" required></div>
          <div class="field">
            <label>Sales Channel</label>
            <select name="sales_channel" required>${SALES_CHANNELS.map((value) => `<option>${value}</option>`).join("")}</select>
          </div>
          <div class="field">
            <label>Ship Method</label>
            <select name="ship_method" required>${SHIP_METHODS.map((value) => `<option>${value}</option>`).join("")}</select>
          </div>
          <div class="field">
            <label>Payment Terms</label>
            <select name="payment_terms" required>
              <option>Net 15</option><option>Net 21</option><option selected>Net 30</option>
            </select>
          </div>
          <div class="field full">
            <label>Ship To Address</label>
            <textarea name="shipping_address" placeholder="Select a customer to load the saved address" required></textarea>
          </div>
          <div class="field">
            <label>Tax</label>
            <label class="switch po-tax-switch"><input name="tax_enabled" type="checkbox"><span>Apply tax</span></label>
          </div>
          <div class="field">
            <label>Tax Rate</label>
            <div class="input-suffix"><input name="tax_rate_percent" type="number" min="0" step="0.01" value="6.25" disabled><span>%</span></div>
          </div>
          <div class="field full"><label>Notes</label><textarea name="notes"></textarea></div>
        </div>

        <div class="po-lines-heading">
          <h3>Products Ordered</h3>
          <button id="addSalesLine" class="btn secondary" type="button">Add Product</button>
        </div>
        ${productChoices.length ? "" : `<div class="empty">No sellable inventory is currently available.</div>`}
        <div id="salesLineItems" class="po-line-items"></div>

        <div class="po-footer sales-order-footer">
          <div class="po-totals" aria-live="polite">
            <div><span>Subtotal</span><strong id="salesSubtotal">$0.00</strong></div>
            <div><span>Tax</span><strong id="salesTax">$0.00</strong></div>
            <div><span>Estimated Gross Profit</span><strong id="salesProfit">$0.00</strong></div>
            <div><span>Estimated Gross Margin</span><strong id="salesMargin">0.00%</strong></div>
            <div class="po-grand-total"><span>Total</span><strong id="salesTotal">$0.00</strong></div>
          </div>
          <button class="btn" type="submit" ${productChoices.length ? "" : "disabled"}>Create Sales Order</button>
        </div>
      </form>
    </section>
  `;
}

function setupSalesOrderBuilder(ctx, customers, inventoryChoices, productChoices) {
  const form = document.getElementById("salesOrderForm");
  if (!form) return;

  const container = document.getElementById("salesLineItems");
  const customerMap = new Map(customers.map((customer) => [customer.supplier_id, customer]));
  const productMap = new Map(productChoices.map((product) => [product.productId, product]));

  if (productChoices.length) appendSalesLine(container, productChoices);

  document.getElementById("addSalesLine")?.addEventListener("click", () => {
    appendSalesLine(container, productChoices);
    updateSalesRemoveButtons(container);
  });

  form.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-sales-line]");
    if (!removeButton) return;
    removeButton.closest(".po-line-item")?.remove();
    updateSalesRemoveButtons(container);
    updateSalesTotals(form, inventoryChoices);
  });

  form.addEventListener("change", (event) => {
    if (event.target.name === "customer_id") {
      const customer = customerMap.get(event.target.value);
      if (customer?.payment_terms) form.elements.payment_terms.value = customer.payment_terms;
      form.elements.shipping_address.value = customer?.address || "";
    }

    if (event.target.name === "tax_enabled") {
      form.elements.tax_rate_percent.disabled = !event.target.checked;
    }

    const line = event.target.closest(".po-line-item");
    if (line && event.target.matches("[data-product-choice]")) {
      applyProductChoice(line, productMap.get(event.target.value), inventoryChoices);
      refreshLotSelect(line, inventoryChoices, false);
    }

    if (line && event.target.matches("[data-supplier-lot-choice]")) {
      refreshLocationSelect(line, inventoryChoices, false);
    }

    if (line && event.target.matches('[data-line-field="unit_type"]')) {
      applySalesUnit(line);
    }

    if (line) updateSalesLine(line, inventoryChoices);
    updateSalesTotals(form, inventoryChoices);
  });

  form.addEventListener("input", (event) => {
    const line = event.target.closest(".po-line-item");
    if (line) {
      if (event.target.matches('[data-line-field="qty_ordered"], [data-line-field="unit_weight_lbs"]')) {
        refreshLotSelect(line, inventoryChoices, true);
      }
      updateSalesLine(line, inventoryChoices);
    }
    updateSalesTotals(form, inventoryChoices);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const input = collectSalesOrder(form, inventoryChoices);
      const result = await createSalesOrder(ctx.user, input);
      notice(`${result.sales_order_id} created with ${input.lines.length} pick allocation line${input.lines.length === 1 ? "" : "s"}.`);
      await render(ctx);
    } catch (error) {
      notice(error.message);
    }
  });
}

function appendSalesLine(container, productChoices) {
  const lineId = `draft-sales-line-${nextSalesLineId++}`;
  container.insertAdjacentHTML("beforeend", `
    <section class="po-line-item sales-line-item" data-draft-line-id="${lineId}">
      <div class="po-line-title">
        <strong>Product Requirement</strong>
        <button class="po-remove-line" data-remove-sales-line type="button" aria-label="Remove product" title="Remove product">&times;</button>
      </div>
      <div class="sales-line-grid">
        <div class="field sales-inventory-field">
          <label>Product</label>
          <select data-product-choice required>
            <option value="">Select product</option>
            ${productChoices.map((product) => `<option value="${escapeHtml(product.productId)}">${escapeHtml(product.productName)} | ${formatNumber(product.availableLb)} LB available</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>Quantity Sold</label>
          <input data-line-field="qty_ordered" type="number" min="0.01" step="0.01" value="1" required>
        </div>
        <div class="field">
          <label>Sales Unit</label>
          <select data-line-field="unit_type" required>${SALES_UNITS.map((unit) => `<option>${unit}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label>LB Per Case / Unit</label>
          <input data-line-field="unit_weight_lbs" type="number" min="0.01" step="0.01" value="1" required>
        </div>
        <div class="field">
          <label>Preferred Lot</label>
          <select data-supplier-lot-choice disabled>
            <option value="">Choose product first</option>
          </select>
        </div>
        <div class="field">
          <label>Preferred First Space</label>
          <select data-location-choice disabled>
            <option value="">Choose lot first</option>
          </select>
        </div>
        <div class="field"><label>Unit Price</label><input data-line-field="unit_price" type="number" min="0" step="0.01" value="0" required></div>
        <div class="field"><label>Est. Unit Cost</label><input data-line-field="unit_cost" type="number" step="0.0001" value="0" readonly></div>
      </div>
      <div class="sales-line-facts">
        <span>Available <strong data-available>Choose product</strong></span>
        <span>Total Weight <strong data-total-weight>0 LB</strong></span>
        <span>Pick Plan <strong data-fefo>Choose product</strong></span>
        <span>Line Total <strong data-line-total>$0.00</strong></span>
        <span>Gross Profit <strong data-line-profit>$0.00</strong></span>
      </div>
      <div class="sales-allocation-preview" data-allocation-preview>Choose a product to see the FIFO lot and space pick plan.</div>
    </section>
  `);
  updateSalesRemoveButtons(container);
}

function applyProductChoice(line, product, inventoryChoices) {
  if (!product) {
    line.dataset.productId = "";
    line.dataset.productName = "";
    line.querySelector("[data-available]").textContent = "Choose product";
    line.querySelector("[data-fefo]").textContent = "Choose product";
    line.querySelector("[data-allocation-preview]").textContent = "Choose a product to see the FIFO lot and space pick plan.";
    resetLotAndLocationSelects(line);
    updateSalesLine(line, inventoryChoices);
    return;
  }

  line.dataset.productId = product.productId;
  line.dataset.productName = product.productName;
  line.querySelector('[data-line-field="unit_type"]').value = product.defaultSalesUnit;
  line.querySelector('[data-line-field="unit_weight_lbs"]').value = formatNumber(product.defaultUnitWeight);
  line.querySelector("[data-available]").textContent = `${formatNumber(product.availableLb)} LB across ${product.lotCount} space${product.lotCount === 1 ? "" : "s"}`;
  updateSalesLine(line, inventoryChoices);
}

function applySalesUnit(line) {
  const unit = line.querySelector('[data-line-field="unit_type"]').value;
  const weightInput = line.querySelector('[data-line-field="unit_weight_lbs"]');
  if (unit === "LB") weightInput.value = "1";
}

function refreshLotSelect(line, inventoryChoices, preserveCurrent) {
  const productId = line.dataset.productId || line.querySelector("[data-product-choice]")?.value || "";
  const lotSelect = line.querySelector("[data-supplier-lot-choice]");
  if (!lotSelect) return;

  const current = preserveCurrent ? lotSelect.value : "";
  const summaries = supplierLotSummaries(productId, inventoryChoices, requiredWeight(line));

  if (!productId) {
    resetLotAndLocationSelects(line);
    return;
  }

  if (!summaries.length) {
    lotSelect.disabled = true;
    lotSelect.innerHTML = `<option value="">No supplier lots available</option>`;
    refreshLocationSelect(line, inventoryChoices, false);
    return;
  }

  lotSelect.disabled = false;
  lotSelect.innerHTML = summaries
    .map((summary, index) => `<option value="${escapeHtml(summary.supplierLotKey)}">${escapeHtml(summary.displayLot)} | ${formatNumber(summary.availableInventoryQty)} LB${index === 0 ? " | recommended" : ""}</option>`)
    .join("");

  const stillValid = summaries.some((summary) => summary.supplierLotKey === current);
  lotSelect.value = stillValid ? current : summaries[0].supplierLotKey;
  refreshLocationSelect(line, inventoryChoices, preserveCurrent && stillValid);
}

function refreshLocationSelect(line, inventoryChoices, preserveCurrent) {
  const locationSelect = line.querySelector("[data-location-choice]");
  if (!locationSelect) return;

  const current = preserveCurrent ? locationSelect.value : "";
  const choices = locationChoicesForLine(line, inventoryChoices);

  if (!line.querySelector("[data-supplier-lot-choice]")?.value) {
    locationSelect.disabled = true;
    locationSelect.innerHTML = `<option value="">Choose lot first</option>`;
    return;
  }

  if (!choices.length) {
    locationSelect.disabled = true;
    locationSelect.innerHTML = `<option value="">No spaces available</option>`;
    return;
  }

  locationSelect.disabled = false;
  locationSelect.innerHTML = choices
    .map((choice, index) => `<option value="${escapeHtml(choice.key)}">${escapeHtml(choice.locationLabel)} | ${formatNumber(choice.availableInventoryQty)} LB${index === 0 ? " | recommended" : ""}</option>`)
    .join("");

  const stillValid = choices.some((choice) => choice.key === current);
  locationSelect.value = stillValid ? current : choices[0].key;
}

function resetLotAndLocationSelects(line) {
  const lotSelect = line.querySelector("[data-supplier-lot-choice]");
  const locationSelect = line.querySelector("[data-location-choice]");

  if (lotSelect) {
    lotSelect.disabled = true;
    lotSelect.innerHTML = `<option value="">Choose product first</option>`;
  }
  if (locationSelect) {
    locationSelect.disabled = true;
    locationSelect.innerHTML = `<option value="">Choose lot first</option>`;
  }
}

function updateSalesLine(line, inventoryChoices = []) {
  const qty = numericLineValue(line, "qty_ordered");
  const unitPrice = numericLineValue(line, "unit_price");
  const weight = numericLineValue(line, "unit_weight_lbs");
  const totalWeight = qty * weight;
  const plan = buildAllocationPlan(line, inventoryChoices);
  const unitCost = plan.allocations.length ? weightedUnitCost(plan.allocations, weight) : 0;

  line.querySelector('[data-line-field="unit_cost"]').value = unitCost.toFixed(4);
  line.querySelector("[data-total-weight]").textContent = `${formatNumber(totalWeight)} LB`;
  line.querySelector("[data-fefo]").textContent = planStatus(plan);
  line.querySelector("[data-allocation-preview]").innerHTML = allocationPreviewHtml(plan, qty, weight);
  line.querySelector("[data-line-total]").textContent = money(qty * unitPrice);
  line.querySelector("[data-line-profit]").textContent = money(qty * (unitPrice - unitCost));
}

function buildAllocationPlan(line, inventoryChoices, reservedByChoice = new Map()) {
  const productId = line.dataset.productId || line.querySelector("[data-product-choice]")?.value || "";
  const qty = numericLineValue(line, "qty_ordered");
  const unit = line.querySelector('[data-line-field="unit_type"]')?.value || "CASE";
  const weight = numericLineValue(line, "unit_weight_lbs");
  const neededWeight = qty * weight;
  const selectedLotKey = line.querySelector("[data-supplier-lot-choice]")?.value || "";
  const selectedSpaceKey = line.querySelector("[data-location-choice]")?.value || "";

  const result = {
    productId,
    qty,
    unit,
    weight,
    neededWeight,
    selectedLotKey,
    selectedSpaceKey,
    allocations: [],
    missingWeight: neededWeight,
    hasOverride: false,
    message: ""
  };

  if (!productId) {
    result.message = "Choose a product to see the FIFO lot and space pick plan.";
    return result;
  }
  if (qty <= 0 || weight <= 0) {
    result.message = "Enter quantity and LB per case/unit to calculate the pick plan.";
    return result;
  }

  const productChoices = inventoryChoices.filter((choice) => choice.productId === productId);
  if (!productChoices.length) {
    result.message = "No sellable inventory is available for this product.";
    return result;
  }

  const globallyRecommendedFirst = productChoices[0] || null;
  const selectedSpace = selectedSpaceKey ? productChoices.find((choice) => choice.key === selectedSpaceKey) : null;
  const selectedLotChoices = selectedLotKey
    ? productChoices.filter((choice) => choice.supplierLotKey === selectedLotKey)
    : [];

  const ordered = [];
  const addUnique = (choice, manualReason) => {
    if (!choice || ordered.some((item) => item.choice.key === choice.key)) return;
    ordered.push({ choice, manualReason });
  };

  addUnique(selectedSpace, selectedSpace && globallyRecommendedFirst && selectedSpace.key !== globallyRecommendedFirst.key ? "Manual first space override" : "");

  selectedLotChoices
    .sort((a, b) => compareLocationChoices(a, b, neededWeight))
    .forEach((choice) => addUnique(choice, selectedLotKey && choice.supplierLotKey !== (globallyRecommendedFirst && globallyRecommendedFirst.supplierLotKey) ? "Manual lot override" : ""));

  productChoices
    .sort((a, b) => compareLocationChoices(a, b, neededWeight))
    .forEach((choice) => addUnique(choice, ""));

  let remaining = neededWeight;
  ordered.forEach(({ choice, manualReason }) => {
    if (remaining <= 0.0001) return;
    const reserved = Number(reservedByChoice.get(choice.key) || 0);
    const available = Math.max(0, choice.availableInventoryQty - reserved);
    if (available <= 0.0001) return;

    const qtyBase = Math.min(remaining, available);
    if (qtyBase <= 0.0001) return;

    const isOverride = Boolean(manualReason);
    result.allocations.push({
      choice,
      qtyBase: Number(qtyBase.toFixed(4)),
      isOverride,
      reason: manualReason || "FIFO recommendation"
    });
    if (isOverride) result.hasOverride = true;
    remaining -= qtyBase;
  });

  result.missingWeight = Number(Math.max(0, remaining).toFixed(4));
  if (result.missingWeight > 0.0001) {
    result.message = `Short ${formatNumber(result.missingWeight)} LB after available spaces.`;
  } else if (result.allocations.length > 1) {
    result.message = `Split across ${result.allocations.length} spaces.`;
  } else {
    result.message = result.hasOverride ? "Manual override allocation." : "Recommended FIFO allocation.";
  }

  return result;
}

function allocationPreviewHtml(plan, qty, weight) {
  if (!plan.productId || !plan.allocations.length) {
    return `<div class="sales-allocation-summary ${plan.missingWeight > 0 ? "is-short" : ""}">${escapeHtml(plan.message || "Choose product, quantity, and LB per case/unit.")}</div>`;
  }

  const rows = plan.allocations.map((allocation, index) => {
    const choice = allocation.choice;
    return `
      <div>
        <strong>${index + 1}. ${escapeHtml(choice.displayLot)}</strong>
        <span>${escapeHtml(choice.locationLabel)} · ${formatNumber(allocation.qtyBase)} LB · ${allocation.isOverride ? "Override" : "FIFO"}</span>
      </div>
    `;
  }).join("");

  const shortClass = plan.missingWeight > 0.0001 ? " is-short" : "";
  const summary = plan.missingWeight > 0.0001
    ? `Needs ${formatNumber(qty * weight)} LB, short ${formatNumber(plan.missingWeight)} LB.`
    : `${plan.hasOverride ? "Manual override plan" : "Recommended FIFO plan"} covers ${formatNumber(qty)} ${escapeHtml(plan.unit)} (${formatNumber(qty * weight)} LB).`;

  return `
    <div class="sales-allocation-summary${shortClass}">${summary}</div>
    <div class="sales-allocation-list">${rows}</div>
  `;
}

function planStatus(plan) {
  if (!plan.productId) return "Choose product";
  if (plan.missingWeight > 0.0001) return "Short stock";
  if (plan.hasOverride) return "Override plan";
  if (plan.allocations.length > 1) return "Split FIFO";
  return "Recommended";
}

function weightedUnitCost(allocations, weight) {
  const totalBase = allocations.reduce((sum, allocation) => sum + allocation.qtyBase, 0);
  if (totalBase <= 0) return 0;
  const weightedBaseCost = allocations.reduce((sum, allocation) =>
    sum + allocation.qtyBase * Number(allocation.choice.baseUnitCost || 0), 0) / totalBase;
  return weightedBaseCost * weight;
}

function updateSalesTotals(form, inventoryChoices = []) {
  if (!form) return;
  const totals = Array.from(form.querySelectorAll(".sales-line-item")).reduce((result, line) => {
    const qty = numericLineValue(line, "qty_ordered");
    const price = numericLineValue(line, "unit_price");
    const plan = buildAllocationPlan(line, inventoryChoices);
    const weight = numericLineValue(line, "unit_weight_lbs");
    const cost = plan.allocations.length ? weightedUnitCost(plan.allocations, weight) : numericLineValue(line, "unit_cost");
    result.subtotal += qty * price;
    result.profit += qty * (price - cost);
    return result;
  }, { subtotal: 0, profit: 0 });

  const taxRate = Number(form.elements.tax_rate_percent.value || 0) / 100;
  const tax = form.elements.tax_enabled.checked ? totals.subtotal * taxRate : 0;

  document.getElementById("salesSubtotal").textContent = money(totals.subtotal);
  document.getElementById("salesTax").textContent = money(tax);
  document.getElementById("salesProfit").textContent = money(totals.profit);
  document.getElementById("salesMargin").textContent = `${totals.subtotal > 0 ? (totals.profit / totals.subtotal * 100).toFixed(2) : "0.00"}%`;
  document.getElementById("salesTotal").textContent = money(totals.subtotal + tax);
}

function collectSalesOrder(form, inventoryChoices) {
  if (!form.elements.customer_id.value) throw new Error("Select a customer.");

  const reservedByChoice = new Map();
  const lines = [];
  const draftLines = Array.from(form.querySelectorAll(".sales-line-item"));

  draftLines.forEach((line, index) => {
    const productId = line.querySelector("[data-product-choice]").value;
    if (!productId) throw new Error(`Select a product on line ${index + 1}.`);

    const qty = numericLineValue(line, "qty_ordered");
    const unit = line.querySelector('[data-line-field="unit_type"]').value;
    const weight = numericLineValue(line, "unit_weight_lbs");
    const price = numericLineValue(line, "unit_price");

    if (qty <= 0) throw new Error(`Quantity must be greater than zero on line ${index + 1}.`);
    if (weight <= 0) throw new Error(`LB per case/unit must be greater than zero on line ${index + 1}.`);
    if (price < 0) throw new Error(`Unit price cannot be negative on line ${index + 1}.`);

    const plan = buildAllocationPlan(line, inventoryChoices, reservedByChoice);
    if (!plan.allocations.length) throw new Error(`No available allocation for line ${index + 1}.`);
    if (plan.missingWeight > 0.0001) {
      throw new Error(`Line ${index + 1} is short ${formatNumber(plan.missingWeight)} LB. Choose another lot/space or reduce quantity.`);
    }

    plan.allocations.forEach((allocation, allocationIndex) => {
      const choice = allocation.choice;
      const alreadyReserved = Number(reservedByChoice.get(choice.key) || 0);
      if (alreadyReserved + allocation.qtyBase > choice.availableInventoryQty + 0.0001) {
        throw new Error(`Line ${index + 1} exceeds available quantity for ${choice.displayLot} / ${choice.locationLabel}.`);
      }
      reservedByChoice.set(choice.key, alreadyReserved + allocation.qtyBase);

      const allocationSalesQty = allocation.qtyBase / weight;
      lines.push({
        product_id: choice.productId,
        internal_lot_id: choice.lotId,
        location_id: choice.locationId,
        qty_ordered: Number(allocationSalesQty.toFixed(4)),
        unit_type: unit,
        unit_weight_lbs: weight,
        inventory_qty_required: Number(allocation.qtyBase.toFixed(4)),
        inventory_unit_type: choice.inventoryUnit,
        unit_price: price,
        unit_cost: Number((choice.baseUnitCost * weight).toFixed(4)),
        expiration_date: choice.expirationDate,
        fefo_status: allocation.isOverride ? "OVERRIDE" : "RECOMMENDED",
        notes: [
          `Pick allocation ${allocationIndex + 1}/${plan.allocations.length}`,
          `Original request: ${formatNumber(qty)} ${unit} @ ${formatNumber(weight)} LB = ${formatNumber(qty * weight)} LB`,
          allocation.reason
        ].filter(Boolean).join(" | ")
      });
    });
  });

  if (!lines.length) throw new Error("Add at least one product line.");

  return {
    customer_id: form.elements.customer_id.value,
    order_date: form.elements.order_date.value,
    requested_delivery_date: form.elements.requested_delivery_date.value,
    sales_channel: form.elements.sales_channel.value,
    ship_method: form.elements.ship_method.value,
    payment_terms: form.elements.payment_terms.value,
    shipping_address: form.elements.shipping_address.value.trim(),
    tax_enabled: form.elements.tax_enabled.checked,
    tax_rate_percent: Number(form.elements.tax_rate_percent.value || 6.25),
    notes: form.elements.notes.value,
    lines
  };
}

function buildInventoryChoices(rows, locationMap = new Map()) {
  const today = startOfDay(new Date());
  const choices = (rows || []).map((row) => {
    const lot = row.lot || {};
    const product = row.product || {};
    const location = locationMap.get(String(row.location_id || "")) || {};
    const availableInventoryQty = Number(row.available_qty ?? row.qty ?? row.current_qty ?? 0);
    const expiration = effectiveExpiration(lot, product);
    const unitWeight = lotUnitWeight(lot);
    const inventoryUnit = String(row.unit_type || lot.unit_type || "LB").toUpperCase();
    const salesUnit = String(lot.purchase_unit_type || row.purchase_unit_type || inventoryUnit).toUpperCase();
    const availableSalesQty = inventoryUnit === salesUnit ? availableInventoryQty : inventoryUnit === "LB" ? availableInventoryQty / unitWeight : 0;
    const snapshotUnitCost = Number(row.unit_cost ?? row.cost_per_lb ?? 0);
    const purchaseUnitCost = Number(lot.unit_cost || row.purchase_unit_cost || 0);
    const baseUnitCost = snapshotUnitCost > 0 ? snapshotUnitCost : inventoryUnit === salesUnit ? purchaseUnitCost : purchaseUnitCost / unitWeight;
    const supplierLotNumber = String(lot.supplier_lot_number || row.supplier_lot_number || "").trim();
    const lotId = String(row.internal_lot_id || "").trim();
    const displayLot = supplierLotNumber || lotId || "UNKNOWN LOT";
    const productId = String(row.product_id || "").trim();

    return {
      key: `${productId}|${lotId}|${row.location_id}`,
      productId,
      productName: product.product_name || row.product_name || productId,
      lotId,
      supplierLotNumber,
      supplierLotKey: `${productId}|${displayLot}`,
      displayLot,
      locationId: String(row.location_id || "").trim(),
      locationLabel: locationLabel(location, row.location_id),
      locationPriority: locationPriority(location, row.location_id),
      inventoryUnit,
      salesUnit,
      unitWeight,
      unitCost: baseUnitCost * (salesUnit === "LB" ? 1 : unitWeight),
      baseUnitCost,
      availableInventoryQty,
      availableSalesQty,
      expirationDate: expiration ? dateValue(expiration) : "",
      expirationSort: expiration ? expiration.getTime() : Number.MAX_SAFE_INTEGER,
      receivedSort: receivedSortValue(lot),
      lotStatus: String(lot.status || "ACTIVE").toUpperCase()
    };
  }).filter((choice) =>
    choice.productId
    && choice.lotId
    && choice.locationId
    && choice.inventoryUnit === "LB"
    && choice.availableInventoryQty > 0
    && choice.availableSalesQty > 0
    && ["ACTIVE", "AVAILABLE"].includes(choice.lotStatus)
    && (!choice.expirationDate || startOfDay(choice.expirationDate) >= today)
  ).sort(compareInventoryChoices);

  const recommendedVariations = new Set();
  choices.forEach((choice) => {
    const variation = `${choice.productId}|${choice.salesUnit}|${choice.unitWeight}`;
    choice.recommended = !recommendedVariations.has(variation);
    recommendedVariations.add(variation);
  });

  return choices;
}

function buildProductChoices(inventoryChoices) {
  const products = new Map();

  inventoryChoices.forEach((choice) => {
    if (choice.inventoryUnit !== "LB") return;
    const current = products.get(choice.productId) || {
      productId: choice.productId,
      productName: choice.productName,
      availableLb: 0,
      lotCount: 0,
      defaultSalesUnit: choice.salesUnit || "CASE",
      defaultUnitWeight: choice.unitWeight || 1
    };

    current.availableLb += choice.availableInventoryQty;
    current.lotCount += 1;
    if (choice.recommended) {
      current.defaultSalesUnit = choice.salesUnit || current.defaultSalesUnit;
      current.defaultUnitWeight = choice.unitWeight || current.defaultUnitWeight;
    }
    products.set(choice.productId, current);
  });

  return Array.from(products.values())
    .map((product) => ({ ...product, availableLb: Number(product.availableLb.toFixed(4)) }))
    .sort((a, b) => a.productName.localeCompare(b.productName));
}

function supplierLotSummaries(productId, inventoryChoices, neededWeight) {
  const lots = new Map();

  inventoryChoices
    .filter((choice) => choice.productId === productId)
    .forEach((choice) => {
      const current = lots.get(choice.supplierLotKey) || {
        supplierLotKey: choice.supplierLotKey,
        displayLot: choice.displayLot,
        availableInventoryQty: 0,
        receivedSort: choice.receivedSort,
        expirationSort: choice.expirationSort
      };
      current.availableInventoryQty += choice.availableInventoryQty;
      current.receivedSort = Math.min(current.receivedSort, choice.receivedSort);
      current.expirationSort = Math.min(current.expirationSort, choice.expirationSort);
      lots.set(choice.supplierLotKey, current);
    });

  return Array.from(lots.values()).sort((a, b) => compareSupplierLots(a, b, neededWeight));
}

function compareSupplierLots(a, b, neededWeight) {
  const aCanFill = neededWeight <= 0 || a.availableInventoryQty + 0.0001 >= neededWeight;
  const bCanFill = neededWeight <= 0 || b.availableInventoryQty + 0.0001 >= neededWeight;

  return Number(bCanFill) - Number(aCanFill)
    || a.receivedSort - b.receivedSort
    || a.expirationSort - b.expirationSort
    || a.displayLot.localeCompare(b.displayLot);
}

function locationChoicesForLine(line, inventoryChoices) {
  const productId = line.dataset.productId || "";
  const supplierLotKey = line.querySelector("[data-supplier-lot-choice]")?.value || "";
  const neededWeight = requiredWeight(line);

  return inventoryChoices
    .filter((choice) => choice.productId === productId && choice.supplierLotKey === supplierLotKey)
    .sort((a, b) => compareLocationChoices(a, b, neededWeight));
}

function compareInventoryChoices(a, b) {
  return a.productName.localeCompare(b.productName)
    || a.receivedSort - b.receivedSort
    || a.expirationSort - b.expirationSort
    || a.displayLot.localeCompare(b.displayLot)
    || a.locationPriority - b.locationPriority
    || b.availableInventoryQty - a.availableInventoryQty
    || a.locationLabel.localeCompare(b.locationLabel);
}

function compareLocationChoices(a, b, neededWeight) {
  const aCanFill = neededWeight <= 0 || a.availableInventoryQty + 0.0001 >= neededWeight;
  const bCanFill = neededWeight <= 0 || b.availableInventoryQty + 0.0001 >= neededWeight;

  return Number(bCanFill) - Number(aCanFill)
    || a.receivedSort - b.receivedSort
    || a.expirationSort - b.expirationSort
    || a.locationPriority - b.locationPriority
    || b.availableInventoryQty - a.availableInventoryQty
    || a.locationLabel.localeCompare(b.locationLabel);
}

function requiredWeight(line) {
  return numericLineValue(line, "qty_ordered") * numericLineValue(line, "unit_weight_lbs");
}

function receivedSortValue(lot) {
  const received = new Date(lot.received_date || 0).getTime();
  return Number.isFinite(received) && received > 0 ? received : Number.MAX_SAFE_INTEGER;
}

function locationLabel(location, fallback) {
  return String(location.location_id || fallback || "").trim() || "UNKNOWN SPACE";
}

function locationPriority(location, fallback) {
  const explicit = Number(location.priority_rank || location.pick_priority || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const text = [
    fallback,
    location.location_id,
    location.zone,
    location.aisle,
    location.rack,
    location.level,
    location.bin,
    location.location_type,
    location.current_status,
    location.notes
  ].map((value) => String(value || "").toUpperCase()).join(" ");

  if (/\b(FRONT|PICK|PICKING|STAGE|STAGING|DOCK|FAST)\b/.test(text)) return 1;
  if (/\b(MID|MIDDLE|AISLE)\b/.test(text)) return 5;
  if (/\b(BACK|RESERVE|RESERVED|BULK|DEEP|HIGH)\b/.test(text)) return 10;
  return 6;
}

function setupSalesOrderActions(ctx) {
  document.querySelectorAll("[data-sales-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const { salesOrderId, salesAction } = button.dataset;

      if (["blSjp", "pickList"].includes(salesAction)) {
        const documentWindow = window.open("", "_blank");
        if (!documentWindow) return notice("Pop-up blocked. Allow pop-ups to open Sales Order documents.");

        try {
          documentWindow.document.write("<p>Preparing Sales Order...</p>");
          const detail = await getSalesOrderDetail(salesOrderId);
          documentWindow.document.open();
          documentWindow.document.write(salesAction === "pickList" ? printablePickList(detail) : printableBillOfLading(detail));
          documentWindow.document.close();
        } catch (error) {
          documentWindow.close();
          notice(error.message);
        }
        return;
      }

      try {
        await salesOrderAction(ctx.user, salesOrderId, salesAction);
        notice(`${salesOrderId} marked ${salesAction.toLowerCase()}.`);
        await render(ctx);
      } catch (error) {
        notice(error.message);
      }
    });
  });
}

function actionButtons(ctx, order) {
  if (!can(ctx.user, "salesOrders:view")) return "";
  const orderStatus = String(order.status || "DRAFT").toUpperCase();
  const operator = String(ctx.user.role || "").toUpperCase() === "OPERATOR";

  return `
    <div class="actions po-actions">
      <button class="btn secondary" data-sales-action="blSjp" data-sales-order-id="${escapeHtml(order.sales_order_id)}" type="button">BL SJP</button>
      <button class="btn secondary" data-sales-action="pickList" data-sales-order-id="${escapeHtml(order.sales_order_id)}" type="button">Pick List</button>
      ${!operator && orderStatus === "DRAFT" ? actionButton(order, "CONFIRM", "Mark Confirmed") : ""}
      ${!operator && orderStatus === "PICKED" ? actionButton(order, "SHIPPED", "Mark Shipped") : ""}
    </div>
  `;
}

function actionButton(order, action, label) {
  return `<button class="btn" data-sales-action="${action}" data-sales-order-id="${escapeHtml(order.sales_order_id)}" type="button">${label}</button>`;
}

export function printableBillOfLading(detail) {
  if (!detail) throw new Error("Sales Order was not found.");

  const { order } = detail;
  const lines = groupedSalesLines(detail.lines || []);
  const customerName = order.customer?.supplier_name || order.customer_name || "";
  const shipToAddress = order.shipping_address || order.customer?.address || "";
  const logoUrl = new URL("../logo_San_Jose.png", window.location.href).href;
  const totals = lines.reduce((result, line) => {
    const qty = Number(line.qty_ordered || 0);
    const unit = String(line.unit_type || "").toUpperCase();
    result.weight += qty * Number(line.unit_weight_lbs || 0);
    if (["CASE", "BOX"].includes(unit)) result.boxes += qty;
    return result;
  }, { boxes: 0, weight: 0 });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>BL ${escapeHtml(order.bl_folio || order.sales_order_id)}</title>
  <style>
    @page{size:letter;margin:10mm}
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;color:#050505;margin:0;font-size:12px}
    .toolbar{margin:0 0 14px}.toolbar button{padding:9px 15px}
    .sheet{max-width:760px;margin:auto}
    .header{position:relative;min-height:128px;text-align:center}
    .logo{width:255px;max-height:110px;object-fit:contain}
    .folio{position:absolute;right:4px;top:14px;text-align:left;font-weight:700;font-size:13px}
    .folio strong{display:block;font-size:29px;line-height:1.05}
    .company-address{font-weight:700;font-size:12px;margin-top:-5px}
    .ship-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:20px 0 14px}
    .ship-box{border:2px solid #050505;min-height:100px}
    .ship-box h2{font-size:13px;margin:0;padding:5px 8px;border-bottom:2px solid #050505;background:#f1f1f1}
    .ship-box div{padding:8px;white-space:pre-line}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th,td{border:1px solid #050505;padding:6px;text-align:left}
    th{background:#f1f1f1}
    .totals{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:14px;font-weight:700}
    .signatures{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:55px}
    .sig{border-top:1px solid #050505;padding-top:6px}
    @media print{.toolbar{display:none}.sheet{max-width:none}}
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print</button></div>
  <main class="sheet">
    <header class="header">
      <img class="logo" src="${logoUrl}" alt="San Jose Produce">
      <div class="folio">BL / Folio<strong>${escapeHtml(order.bl_folio || order.sales_order_id || "")}</strong></div>
      <div class="company-address">SAN JOSE PRODUCE · 2501 W Military Hwy Suite D18, McAllen, TX 78503</div>
    </header>
    <section class="ship-grid">
      <div class="ship-box"><h2>Ship To</h2><div>${escapeHtml(customerName)}\n${escapeHtml(shipToAddress)}</div></div>
      <div class="ship-box"><h2>Order</h2><div>SO: ${escapeHtml(order.sales_order_id || "")}\nDate: ${escapeHtml(formatDate(order.order_date))}\nShip By: ${escapeHtml(formatDate(order.ship_by_date))}\nMethod: ${escapeHtml(displayValue(order.ship_method))}</div></div>
    </section>
    <table>
      <thead><tr><th>Qty</th><th>Unit</th><th>Product</th><th>LB/Unit</th><th>Total LB</th></tr></thead>
      <tbody>
        ${lines.map((line) => `<tr><td>${formatNumber(line.qty_ordered)}</td><td>${escapeHtml(line.unit_type || "")}</td><td>${escapeHtml(line.product?.product_name || line.product_name || line.product_id || "")}</td><td>${formatNumber(line.unit_weight_lbs)}</td><td>${formatNumber(Number(line.qty_ordered || 0) * Number(line.unit_weight_lbs || 0))}</td></tr>`).join("")}
      </tbody>
    </table>
    <section class="totals">
      <div>Total Boxes/Cases: ${formatNumber(totals.boxes)}</div>
      <div>Total Weight: ${formatNumber(totals.weight)} LB</div>
      <div>Total: ${money(order.total_amount)}</div>
    </section>
    <section class="signatures">
      <div class="sig">Driver / Carrier</div>
      <div class="sig">Receiver</div>
    </section>
  </main>
</body>
</html>`;
}

export function printablePickList(detail) {
  if (!detail) throw new Error("Sales Order was not found.");

  const { order, pickTasks = [], lines = [] } = detail;
  const lineMap = new Map(lines.map((line) => [String(line.sales_order_line_id), line]));
  const rows = pickTasks.length
    ? pickTasks.map((task) => ({ task, line: lineMap.get(String(task.sales_order_line_id)) || {} }))
    : lines.map((line) => ({
        task: {
          pick_task_id: "",
          recommended_internal_lot_id: line.preferred_internal_lot_id,
          recommended_location_id: line.preferred_location_id,
          qty_to_pick: line.qty_ordered,
          qty_to_pick_base: line.inventory_qty_required,
          unit_type: line.unit_type,
          pick_status: line.line_status
        },
        line
      }));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Pick List ${escapeHtml(order.sales_order_id || "")}</title>
  <style>
    @page{size:letter;margin:10mm}
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;color:#111;margin:0;font-size:12px}
    .toolbar{margin:0 0 14px}.toolbar button{padding:9px 15px}
    .sheet{max-width:760px;margin:auto}
    h1{font-size:24px;margin:0 0 4px}
    .muted{color:#555;margin:0 0 14px}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{border:1px solid #111;padding:6px;text-align:left;vertical-align:top}
    th{background:#f1f1f1}
    .scan{font-weight:700;font-size:14px}
    @media print{.toolbar{display:none}.sheet{max-width:none}}
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print</button></div>
  <main class="sheet">
    <h1>Pick List ${escapeHtml(order.sales_order_id || "")}</h1>
    <p class="muted">Customer: ${escapeHtml(order.customer?.supplier_name || order.customer_name || "")} · Status: ${escapeHtml(order.status || "")}</p>
    <table>
      <thead><tr><th>#</th><th>Product</th><th>Lot / Space</th><th>Qty</th><th>Base Qty</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map(({ task, line }, index) => `<tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(line.product?.product_name || line.product_name || line.product_id || task.product_id || "")}</td>
          <td><div class="scan">${escapeHtml(task.recommended_internal_lot_id || line.preferred_internal_lot_id || "")}</div><div>${escapeHtml(task.recommended_location_id || line.preferred_location_id || "")}</div></td>
          <td>${formatNumber(task.qty_to_pick || line.qty_ordered)} ${escapeHtml(task.unit_type || line.unit_type || "")}</td>
          <td>${formatNumber(task.qty_to_pick_base || line.inventory_qty_required)} ${escapeHtml(line.inventory_unit_type || "LB")}</td>
          <td>${escapeHtml(task.pick_status || line.line_status || "")}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </main>
</body>
</html>`;
}

function groupedSalesLines(lines) {
  const groups = new Map();

  (lines || []).forEach((line) => {
    const key = [
      line.product_id,
      line.unit_type,
      line.unit_price,
      line.unit_weight_lbs
    ].map((value) => String(value || "")).join("|");

    const current = groups.get(key) || {
      ...line,
      qty_ordered: 0,
      line_total: 0,
      estimated_gross_profit: 0
    };
    current.qty_ordered += Number(line.qty_ordered || 0);
    current.line_total += Number(line.line_total || 0);
    current.estimated_gross_profit += Number(line.estimated_gross_profit || 0);
    groups.set(key, current);
  });

  return Array.from(groups.values());
}

function updateSalesRemoveButtons(container) {
  const buttons = Array.from(container.querySelectorAll("[data-remove-sales-line]"));
  buttons.forEach((button) => {
    button.disabled = buttons.length <= 1;
  });
}

function numericLineValue(line, field) {
  return Number(line.querySelector(`[data-line-field="${field}"]`)?.value || 0);
}

function isActive(row) {
  return row && row.is_active !== false && String(row.is_active || "TRUE").toUpperCase() !== "FALSE";
}

function isCustomer(row) {
  return String(row.party_type || "").toUpperCase() === "CUSTOMER";
}

function effectiveExpiration(lot, product) {
  const direct = lot.expiration_date ? new Date(lot.expiration_date) : null;
  if (direct && !Number.isNaN(direct.getTime())) return direct;

  const perishabilityDays = Number(product.perishability_days || 0);
  const received = lot.received_date ? new Date(lot.received_date) : null;
  if (perishabilityDays > 0 && received && !Number.isNaN(received.getTime())) {
    received.setDate(received.getDate() + perishabilityDays);
    return received;
  }

  return null;
}

function lotUnitWeight(lot) {
  const originalQty = Number(lot.original_qty || 0);
  const purchaseQty = Number(lot.purchase_qty_received || 0);
  if (originalQty > 0 && purchaseQty > 0) return originalQty / purchaseQty;
  return Number(lot.units_per_purchase_unit || lot.case_weight_lbs || 1) || 1;
}

function startOfDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateValue(value) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

function displayValue(value) {
  return String(value || "").replace(/_/g, " ");
}

function money(value) {
  return formatMoney ? formatMoney(Number(value || 0)) : `$${Number(value || 0).toFixed(2)}`;
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
