import {
  getSalesOrderDetail,
  inventorySnapshot,
  listSalesOrders,
  lookupScan,
  recordInventoryMovement
} from "../js/api-smooth1.js?v=send2";
import { handleKeyboardScan, startCameraScanner, stopCameraScanner } from "../js/scanner.js?v=send2";
import { escapeHtml, formatQuantity, notice } from "../js/utils.js?v=send2";

let activeDetail = null;
let activeInventoryRows = [];
let selectedLot = null;
let selectedLineId = "";
let activeMode = "SO";

const MODE_LABELS = {
  SO: "Sales Order",
  AMAZON: "Amazon",
  QUICK: "Quick Sale"
};

const MODE_DESCRIPTIONS = {
  SO: "Guided customer pick",
  AMAZON: "FBA / Amazon send",
  QUICK: "Fast manual send"
};

export async function render(ctx) {
  ctx.setTitle("Send Product", "Ship Sales Orders, Amazon orders, and quick/manual sends");
  const [orders, inventoryRows] = await Promise.all([listSalesOrders(), inventorySnapshot()]);
  activeInventoryRows = inventoryRows;
  activeDetail = null;
  selectedLot = null;
  selectedLineId = "";
  activeMode = "SO";
  const routeSalesOrderId = routeId();
  const openOrders = orders.filter((order) => !["SHIPPED", "CANCELLED", "CLOSED"].includes(String(order.status || "").toUpperCase()));

  ctx.view.innerHTML = `
    <div class="send-product-page">
      <section class="panel send-panel send-panel-intake">
        <div class="panel-header send-panel-header">
          <div>
            <h2>1. Choose outbound type</h2>
            <p class="muted">One screen for Sales Orders, Amazon outbound, and quick/manual sends.</p>
          </div>
          <button id="scanSendQr" class="btn" type="button">Scan QR</button>
        </div>

        <div class="send-mode-picker" aria-label="Outbound type">
          ${Object.entries(MODE_LABELS).map(([mode, label]) => `
            <button class="btn outbound-mode-btn ${mode === "SO" ? "is-active" : "secondary"}" type="button" data-mode="${mode}" aria-pressed="${mode === "SO" ? "true" : "false"}">
              <strong>${label}</strong>
              <small>${MODE_DESCRIPTIONS[mode]}</small>
            </button>
          `).join("")}
        </div>

        <div class="send-card send-card-scan">
          <div class="field mode-field mode-so-field">
            <label>Sales Order</label>
            <select id="salesOrderSelect">
              <option value="">Choose Sales Order</option>
              ${openOrders.map((order) => `<option value="${escapeHtml(order.sales_order_id)}" ${order.sales_order_id === routeSalesOrderId ? "selected" : ""}>${escapeHtml(order.sales_order_id)} - ${escapeHtml(order.customer?.supplier_name || order.customer_name || order.customer_id || "Customer")} (${escapeHtml(order.status || "DRAFT")})</option>`).join("")}
            </select>
          </div>

          <div class="field">
            <label>Lot / Pallet / Box QR</label>
            <input id="sendScan" autocomplete="off" placeholder="Scan or paste physical inventory QR">
          </div>
        </div>

        <div class="send-card send-mode-details mode-field mode-amazon-field" hidden>
          <div class="field">
            <label>Amazon Order / FBA Reference</label>
            <input name="amazon_reference" form="sendProductForm" autocomplete="off" placeholder="Amazon order, FBA shipment, or package ref">
          </div>
          <div class="field">
            <label>Amazon SKU / Item ID</label>
            <input name="amazon_item_reference" form="sendProductForm" autocomplete="off" placeholder="Optional SKU or order item">
          </div>
        </div>

        <div class="send-card send-mode-details mode-field mode-quick-field" hidden>
          <div class="field">
            <label>Customer / Person Name</label>
            <input name="quick_customer_name" form="sendProductForm" autocomplete="off" placeholder="Who is taking this product?">
          </div>
          <div class="field">
            <label>Phone / Contact</label>
            <input name="quick_customer_contact" form="sendProductForm" autocomplete="off" placeholder="Optional phone, email, or company">
          </div>
          <div class="field">
            <label>Quick Reference</label>
            <input name="quick_reference" form="sendProductForm" autocomplete="off" placeholder="Invoice, cash sale, sample, or note">
          </div>
          <div class="field">
            <label>Unit Price</label>
            <input name="quick_unit_price" form="sendProductForm" type="number" min="0" step="0.01" placeholder="Optional">
          </div>
        </div>

        <div id="cameraReader"></div>
        <div id="sendScanResult" class="result send-scan-result">Scan the exact lot, pallet, or box that is leaving the warehouse.</div>
      </section>

      <section class="panel send-panel send-panel-workspace">
        <div class="panel-header receiving-order-header send-panel-header">
          <div>
            <h2 id="sendOrderTitle">2. Confirm product send</h2>
            <p id="sendOrderMeta" class="muted">Choose a mode, scan inventory, then confirm the quantity.</p>
          </div>
          <span id="sendOrderStatus" class="status">WAITING</span>
        </div>

        <form id="sendProductForm" class="send-product-form">
          <input type="hidden" name="movement_type" value="SALE">
          <div id="sendLines" class="receiving-order-lines send-lines">
            <div class="empty">Sales Order pick lines will appear here.</div>
          </div>

          <section id="sendDetails" class="receiving-details send-details-card">
            <div class="receiving-section-heading">
              <div>
                <span class="receiving-eyebrow">Scanned inventory</span>
                <h3 id="sendProductName">Scan inventory to continue</h3>
              </div>
              <span id="sendMatchStatus" class="receiving-scan-badge" hidden>MATCHED</span>
            </div>
            <div class="receiving-facts send-facts">
              <div><span>Product ID</span><strong id="sendProductId">—</strong></div>
              <div><span>Lot</span><strong id="sendLotId">—</strong></div>
              <div><span>Available</span><strong id="sendAvailableQty">—</strong></div>
              <div><span>Location</span><strong id="sendLocationId">—</strong></div>
              <div><span>Order Need</span><strong id="sendOrderNeed">Depends on mode</strong></div>
              <div><span>Inventory Unit</span><strong id="sendInventoryUnit">LB</strong></div>
            </div>
            <div class="receiving-entry-grid send-entry-grid">
              <div class="field">
                <label>Quantity to Send</label>
                <input name="qty" type="number" min="0.01" step="0.01" required>
              </div>
              <div class="field">
                <label>Unit</label>
                <input name="unit_type" value="LB" required>
              </div>
              <div class="field full">
                <label>Notes</label>
                <textarea name="notes" placeholder="Optional: partial pick, Amazon reference, quick sale note, or substitution approval"></textarea>
              </div>
            </div>
            <div id="sendValidation" class="receiving-quantity-preview send-validation"></div>
            <div class="receiving-submit-row send-submit-row">
              <div class="muted">Inventory is deducted only after confirmation.</div>
              <button class="btn" type="submit">Confirm Send Product</button>
            </div>
          </section>
        </form>
      </section>
    </div>
  `;

  document.querySelectorAll(".outbound-mode-btn").forEach((button) => {
    button.addEventListener("click", () => setOutboundMode(button.dataset.mode));
  });
  document.getElementById("salesOrderSelect").addEventListener("change", (event) => {
    setOutboundMode("SO", { keepSelection: true });
    loadSalesOrder(event.target.value).catch((error) => notice(error.message));
  });
  handleKeyboardScan(document.getElementById("sendScan"), (value) => handleSendScan(value).catch((error) => notice(error.message)));
  document.getElementById("scanSendQr").addEventListener("click", startSendCamera);
  document.getElementById("sendProductForm").addEventListener("change", handleFormChange);
  document.getElementById("sendProductForm").addEventListener("input", updateSendValidation);
  document.getElementById("sendProductForm").addEventListener("submit", (event) => submitSendProduct(event, ctx));

  setOutboundMode(routeSalesOrderId ? "SO" : "SO", { keepSelection: true });
  if (routeSalesOrderId) await loadSalesOrder(routeSalesOrderId);
}

function setOutboundMode(mode, options = {}) {
  activeMode = ["SO", "AMAZON", "QUICK"].includes(mode) ? mode : "SO";
  const form = document.getElementById("sendProductForm");
  if (!form) return;
  const movementType = activeMode === "AMAZON" ? "AMAZON_OUT" : "SALE";
  form.elements.movement_type.value = movementType;

  document.querySelectorAll(".outbound-mode-btn").forEach((button) => {
    const isActive = button.dataset.mode === activeMode;
    button.classList.toggle("secondary", !isActive);
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  document.querySelectorAll(".mode-field").forEach((section) => {
    section.hidden = true;
  });
  document.querySelectorAll(`.mode-${activeMode.toLowerCase()}-field`).forEach((section) => {
    section.hidden = false;
  });

  if (activeMode !== "SO") {
    activeDetail = null;
    selectedLineId = "";
    if (!options.keepSelection && document.getElementById("salesOrderSelect")) document.getElementById("salesOrderSelect").value = "";
    document.getElementById("sendLines").innerHTML = activeMode === "AMAZON"
      ? `<div class="empty">Amazon mode records the Amazon/FBA reference and deducts the scanned inventory.</div>`
      : `<div class="empty">Quick Sale mode records the customer/person in the movement notes and deducts the scanned inventory.</div>`;
    document.getElementById("sendOrderTitle").textContent = MODE_LABELS[activeMode];
    document.getElementById("sendOrderMeta").textContent = activeMode === "AMAZON"
      ? "Enter Amazon order/FBA/package reference, scan the lot, and send."
      : "Enter customer/person details, scan the lot, and send without creating a full Sales Order first.";
    document.getElementById("sendOrderStatus").textContent = activeMode;
    document.getElementById("sendOrderNeed").textContent = activeMode === "AMAZON" ? "Amazon reference" : "Quick customer send";
  } else if (!activeDetail) {
    document.getElementById("sendLines").innerHTML = `<div class="empty">Sales Order pick lines will appear here.</div>`;
    document.getElementById("sendOrderTitle").textContent = "Sales Order Pick";
    document.getElementById("sendOrderMeta").textContent = "Choose a Sales Order for guided picking.";
    document.getElementById("sendOrderStatus").textContent = "WAITING";
    document.getElementById("sendOrderNeed").textContent = "Choose SO line";
  }

  updateSendValidation();
}

async function loadSalesOrder(salesOrderId) {
  activeDetail = null;
  selectedLineId = "";
  selectedLot = null;
  setOutboundMode("SO", { keepSelection: true });
  document.getElementById("sendLines").innerHTML = `<div class="empty">Sales Order pick lines will appear here.</div>`;
  document.getElementById("sendOrderTitle").textContent = "Sales Order Pick";
  document.getElementById("sendOrderMeta").textContent = "Choose a Sales Order for guided picking.";
  document.getElementById("sendOrderStatus").textContent = "WAITING";
  if (!salesOrderId) {
    updateSendValidation();
    return;
  }

  const detail = await getSalesOrderDetail(salesOrderId);
  if (!detail) throw new Error("Sales Order was not found.");
  activeDetail = detail;
  document.getElementById("sendOrderTitle").textContent = salesOrderId;
  document.getElementById("sendOrderMeta").textContent = `${detail.order.customer?.supplier_name || detail.order.customer_name || "Customer"} | ${detail.lines.length} pick line${detail.lines.length === 1 ? "" : "s"}`;
  document.getElementById("sendOrderStatus").textContent = detail.order.status || "DRAFT";
  renderSalesOrderLines();
  updateSendValidation();
}

function renderSalesOrderLines() {
  const target = document.getElementById("sendLines");
  if (!activeDetail?.lines?.length) {
    target.innerHTML = `<div class="empty">This Sales Order has no pick lines.</div>`;
    return;
  }
  target.innerHTML = `
    <div class="receiving-lines-header send-lines-header">
      <span>Recommended lots and spaces</span>
      <small>Select the line that matches the scanned inventory.</small>
    </div>
    ${activeDetail.lines.map((line) => {
      const selected = line.sales_order_line_id === selectedLineId;
      const matchesScan = selectedLot && String(selectedLot.product_id) === String(line.product_id) && String(selectedLot.internal_lot_id) === String(line.preferred_internal_lot_id);
      return `<label class="receiving-order-line send-order-line ${selected ? "is-selected" : ""} ${matchesScan ? "is-scanned" : ""}">
        <input class="receiving-line-radio" type="radio" name="sales_order_line_id" value="${escapeHtml(line.sales_order_line_id)}" ${selected ? "checked" : ""}>
        <span class="receiving-product-main"><strong>${escapeHtml(line.product?.product_name || line.product_id)}</strong><small>${escapeHtml(line.product_id)}</small></span>
        <span><small>Order Qty</small><strong>${formatNumber(line.qty_ordered)} ${escapeHtml(line.unit_type)}</strong></span>
        <span><small>Pick Weight</small><strong>${formatNumber(line.inventory_qty_required || 0)} ${escapeHtml(line.inventory_unit_type || "LB")}</strong></span>
        <span><small>Lot</small><strong>${escapeHtml(line.preferred_internal_lot_id || "")}</strong></span>
        <span><small>Space</small><strong>${escapeHtml(line.preferred_location_id || "")}</strong></span>
        <span class="receiving-line-state">${matchesScan ? "MATCH" : selected ? "SELECTED" : line.line_status || "OPEN"}</span>
      </label>`;
    }).join("")}
  `;
}

async function handleSendScan(value) {
  const match = await lookupScan(value);
  if (!match || match.type !== "LOT") throw new Error("Scan an inventory lot/pallet/box QR created during receiving.");
  selectedLot = match.record;
  const snapshotRow = findInventoryRow(selectedLot.internal_lot_id);
  const form = document.getElementById("sendProductForm");
  form.elements.internal_lot_id.value = selectedLot.internal_lot_id || "";
  form.elements.location_id.value = snapshotRow?.location_id || selectedLot.current_location_id || "";
  form.elements.unit_type.value = snapshotRow?.unit_type || selectedLot.unit_type || "LB";
  document.getElementById("sendProductName").textContent = snapshotRow?.product?.product_name || selectedLot.product_id || "Scanned Product";
  document.getElementById("sendProductId").textContent = selectedLot.product_id || "—";
  document.getElementById("sendLotId").textContent = selectedLot.internal_lot_id || "—";
  document.getElementById("sendAvailableQty").textContent = snapshotRow ? `${formatNumber(snapshotRow.available_qty ?? snapshotRow.current_qty ?? 0)} ${snapshotRow.unit_type || "LB"}` : "Review inventory";
  document.getElementById("sendLocationId").textContent = form.elements.location_id.value || "—";
  document.getElementById("sendInventoryUnit").textContent = form.elements.unit_type.value || "LB";

  const matchingLine = activeMode === "SO" ? activeDetail?.lines?.find((line) => String(line.product_id) === String(selectedLot.product_id) && String(line.preferred_internal_lot_id) === String(selectedLot.internal_lot_id)) : null;
  if (matchingLine) {
    selectedLineId = matchingLine.sales_order_line_id;
    form.elements.qty.value = formatInputNumber(matchingLine.inventory_qty_required || matchingLine.qty_ordered || 0);
    form.elements.unit_type.value = matchingLine.inventory_unit_type || form.elements.unit_type.value || "LB";
    document.getElementById("sendOrderNeed").textContent = `${formatNumber(matchingLine.inventory_qty_required || 0)} ${matchingLine.inventory_unit_type || "LB"}`;
  } else if (activeMode !== "SO") {
    document.getElementById("sendOrderNeed").textContent = activeMode === "AMAZON" ? "Amazon reference" : "Quick customer send";
  }

  if (activeMode === "SO") renderSalesOrderLines();
  document.getElementById("sendScanResult").innerHTML = `
    <strong>${escapeHtml(snapshotRow?.product?.product_name || selectedLot.product_id || "Scanned lot")}</strong>
    <span>Lot ${escapeHtml(selectedLot.internal_lot_id || "—")} · ${snapshotRow ? `${formatNumber(snapshotRow.available_qty ?? snapshotRow.current_qty ?? 0)} ${escapeHtml(snapshotRow.unit_type || "LB")} available` : "inventory review needed"}</span>
  `;
  updateSendValidation();
}

function handleFormChange(event) {
  if (event.target.name === "sales_order_line_id") {
    selectedLineId = event.target.value;
    const line = activeDetail?.lines?.find((item) => item.sales_order_line_id === selectedLineId);
    if (line) {
      const form = document.getElementById("sendProductForm");
      form.elements.qty.value = formatInputNumber(line.inventory_qty_required || line.qty_ordered || 0);
      form.elements.unit_type.value = line.inventory_unit_type || "LB";
      document.getElementById("sendOrderNeed").textContent = `${formatNumber(line.inventory_qty_required || 0)} ${line.inventory_unit_type || "LB"}`;
    }
    renderSalesOrderLines();
  }
  updateSendValidation();
}

async function startSendCamera() {
  try {
    await startCameraScanner("sendScan", (value) => {
      handleSendScan(value).catch((error) => notice(error.message));
      stopCameraScanner();
    });
  } catch (error) {
    notice(error.message);
  }
}

async function submitSendProduct(event, ctx) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.elements.internal_lot_id.value) return notice("Scan the physical lot QR first.");
  const qty = Number(form.elements.qty.value || 0);
  if (qty <= 0) return notice("Quantity to send must be greater than zero.");
  const line = selectedLineId ? activeDetail?.lines?.find((item) => item.sales_order_line_id === selectedLineId) : null;
  const snapshotRow = selectedLot ? findInventoryRow(selectedLot.internal_lot_id) : null;
  const available = Number(snapshotRow?.available_qty ?? snapshotRow?.current_qty ?? snapshotRow?.qty ?? 0);
  if (snapshotRow && qty - available > 0.0001) {
    return notice(`Only ${formatNumber(available)} ${snapshotRow.unit_type || "LB"} is available from this lot.`);
  }

  if (activeMode === "SO") {
    if (!activeDetail) return notice("Choose a Sales Order first.");
    if (!line) return notice("Select the Sales Order line this scanned product is fulfilling.");
    if (line && selectedLot) {
      if (String(line.product_id) !== String(selectedLot.product_id)) return notice("Scanned product does not match the selected Sales Order line.");
      if (String(line.preferred_internal_lot_id) !== String(selectedLot.internal_lot_id)) return notice("Scanned lot does not match the recommended Sales Order lot. Add a manager-approved exception before sending a substitute.");
    }
    const remainingBaseQty = Number(line.inventory_qty_required || line.qty_remaining || line.qty_ordered || 0);
    if (remainingBaseQty > 0 && qty - remainingBaseQty > 0.0001) {
      return notice(`Quantity is higher than the Sales Order need of ${formatNumber(remainingBaseQty)} ${line.inventory_unit_type || form.elements.unit_type.value || "LB"}.`);
    }
  }

  const amazonReference = String(form.elements.amazon_reference?.value || "").trim();
  const amazonItemReference = String(form.elements.amazon_item_reference?.value || "").trim();
  const quickCustomerName = String(form.elements.quick_customer_name?.value || "").trim();
  const quickCustomerContact = String(form.elements.quick_customer_contact?.value || "").trim();
  const quickReference = String(form.elements.quick_reference?.value || "").trim();
  const quickUnitPrice = String(form.elements.quick_unit_price?.value || "").trim();

  if (activeMode === "AMAZON" && !amazonReference) return notice("Enter the Amazon order, FBA, or package reference.");
  if (activeMode === "QUICK" && !quickCustomerName) return notice("Enter the customer/person name for the quick sale.");

  try {
    const movementType = activeMode === "AMAZON" ? "AMAZON_OUT" : "SALE";
    const notes = [
      `Outbound mode: ${MODE_LABELS[activeMode]}`,
      line ? `SO line ${line.sales_order_line_id}` : "",
      activeMode === "AMAZON" ? `Amazon reference: ${amazonReference}` : "",
      activeMode === "AMAZON" && amazonItemReference ? `Amazon item/SKU: ${amazonItemReference}` : "",
      activeMode === "QUICK" ? `Quick customer: ${quickCustomerName}` : "",
      activeMode === "QUICK" && quickCustomerContact ? `Contact: ${quickCustomerContact}` : "",
      activeMode === "QUICK" && quickReference ? `Quick reference: ${quickReference}` : "",
      activeMode === "QUICK" && quickUnitPrice ? `Unit price: ${quickUnitPrice}` : "",
      form.elements.notes.value.trim()
    ].filter(Boolean).join(" | ");
    const input = {
      internal_lot_id: form.elements.internal_lot_id.value,
      qty,
      unit_type: form.elements.unit_type.value || "LB",
      movement_type: movementType,
      location_id: form.elements.location_id.value,
      related_sales_order_id: activeMode === "SO" ? activeDetail?.order?.sales_order_id || "" : "",
      related_pick_task_id: activeMode === "SO" ? relatedPickTaskId(line) : "",
      related_amazon_order_id: activeMode === "AMAZON" ? amazonReference : "",
      package_id: activeMode === "AMAZON" ? amazonItemReference : "",
      notes
    };
    const movement = await recordInventoryMovement(ctx.user, input);
    notice(`Sent product through ${MODE_LABELS[activeMode]} and deducted inventory movement ${movement.movement_id}.`);
    await render(ctx);
  } catch (error) {
    notice(error.message);
  }
}

function updateSendValidation() {
  const form = document.getElementById("sendProductForm");
  const target = document.getElementById("sendValidation");
  if (!form || !target) return;
  const line = selectedLineId ? activeDetail?.lines?.find((item) => item.sales_order_line_id === selectedLineId) : null;
  const snapshotRow = selectedLot ? findInventoryRow(selectedLot.internal_lot_id) : null;
  const qty = Number(form.elements.qty.value || 0);
  const available = Number(snapshotRow?.available_qty ?? snapshotRow?.current_qty ?? snapshotRow?.qty ?? 0);
  const movementType = activeMode === "AMAZON" ? "AMAZON_OUT" : "SALE";
  const matchText = activeMode === "SO"
    ? line && selectedLot ? lineMatchesLot(line, selectedLot) ? "OK" : "MISMATCH" : "Choose SO line"
    : activeMode === "AMAZON" ? "Amazon outbound" : "Quick/manual send";
  const messages = [];
  messages.push(`<div><span>Mode</span><strong>${escapeHtml(MODE_LABELS[activeMode])}</strong></div>`);
  messages.push(`<div><span>Action</span><strong>${escapeHtml(movementType)}</strong></div>`);
  messages.push(`<div><span>Available</span><strong>${snapshotRow ? `${formatNumber(available)} ${escapeHtml(snapshotRow.unit_type || "LB")}` : "Scan inventory"}</strong></div>`);
  messages.push(`<div><span>Qty to Send</span><strong>${formatNumber(qty)} ${escapeHtml(form.elements.unit_type.value || "LB")}</strong></div>`);
  messages.push(`<div><span>Match</span><strong>${escapeHtml(matchText)}</strong></div>`);
  target.innerHTML = messages.join("");
  document.getElementById("sendMatchStatus").hidden = !(activeMode === "SO" && line && selectedLot && lineMatchesLot(line, selectedLot));
}

function lineMatchesLot(line, lot) {
  return String(line.product_id) === String(lot.product_id) && String(line.preferred_internal_lot_id) === String(lot.internal_lot_id);
}

function findInventoryRow(lotId) {
  return activeInventoryRows.find((row) => String(row.internal_lot_id) === String(lotId) && Number(row.current_qty || row.qty || row.available_qty || 0) > 0) || null;
}

function relatedPickTaskId(line) {
  if (!line || !activeDetail?.pickTasks) return "";
  const task = activeDetail.pickTasks.find((item) => item.sales_order_line_id === line.sales_order_line_id);
  return task?.pick_task_id || "";
}

function routeId() {
  const hash = String(window.location.hash || "").replace(/^#/, "");
  const parts = hash.split(":");
  return parts[0] === "sendProduct" ? parts[1] || "" : "";
}

function formatNumber(value) {
  return formatQuantity(value);
}

function formatInputNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "";
  return String(Number(number.toFixed(2)));
}
