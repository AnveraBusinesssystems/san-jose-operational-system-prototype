import { escapeHtml, formatQuantity } from "../js/utils.js";

export function ensureReceivingStyles() {
  if (document.getElementById("receivingPalletStyles")) return;
  const link = document.createElement("link");
  link.id = "receivingPalletStyles";
  link.rel = "stylesheet";
  link.href = "./css/receiving-pallets.css?v=2";
  document.head.appendChild(link);
}

export function pageHtml(purchaseOrders) {
  return `<div class="receiving-simple-page">
    <section class="panel receiving-simple-scan">
      <div class="receiving-simple-header"><div><span class="receiving-simple-eyebrow">Receive product</span><h2>Scan or select a purchase order</h2></div><button id="scanReceiveQr" class="btn" type="button">Scan product QR</button></div>
      <div class="receiving-simple-scan-grid">
        <div class="field"><label>PO / Product QR</label><input id="receiveScan" autocomplete="off" placeholder="Scan or paste QR"></div>
        <div class="field"><label>Purchase Order</label><select id="poSelect"><option value="">Select purchase order</option>${purchaseOrders.map(poOption).join("")}</select></div>
      </div>
      <div id="cameraReader"></div><div id="receiveResult" class="result">Select a purchase order or scan a product.</div>
    </section>
    <section class="panel receiving-simple-workspace">
      <div class="receiving-simple-order-header"><div><h2 id="receivingOrderTitle">Purchase Order</h2><p id="receivingOrderMeta" class="muted">No purchase order selected.</p></div><span id="receivingOrderStatus" class="status">WAITING</span></div>
      <form id="receiveForm">
        <input id="receiveScanValue" name="scan_code" type="hidden">
        <div id="poLines" class="receiving-simple-order-lines"><div class="empty">Products from the purchase order will appear here.</div></div>
        <section id="receivingDetails" class="receiving-simple-details" hidden>
          <div class="receiving-simple-product-header"><div><span class="receiving-simple-eyebrow">Selected product</span><h3 id="selectedProductName">Product</h3><p id="selectedProductSummary" class="muted"></p></div><span id="scanLockStatus" class="receiving-simple-badge" hidden>QR selected</span></div>
          <div class="receiving-simple-entry-grid">
            <div class="field"><label>Quantity received</label><input name="qty_received" type="number" min="0.01" step="0.01" required></div>
            <div class="field"><label>Damaged / rejected</label><input name="qty_damaged" type="number" min="0" step="0.01" value="0" required></div>
            <div id="palletCapacityField" class="field"><label id="unitsPerPalletLabel">Cases / units per pallet</label><input name="units_per_pallet" type="number" min="0.01" step="0.01" placeholder="Example: 40" required></div>
            <div class="field"><label>Quality</label><select name="quality_status" required><option value="PASS">Pass</option><option value="HOLD">Hold</option><option value="REJECTED">Rejected</option></select></div>
            <div class="field receiving-simple-lot-field"><label>Supplier lot number</label><input name="supplier_lot_number" autocomplete="off" required></div>
          </div>
          <input name="quality_score" type="hidden" value="5">
          <div id="receivingSummary" class="receiving-simple-summary"></div>
          <div id="overReceiptApproval" class="receiving-simple-over-receipt" hidden><label><input name="allow_over_receipt" type="checkbox" value="true"><span id="overReceiptText">Approve over-receipt</span></label></div>
          <section id="palletWorkspace" class="receiving-simple-pallet-workspace">
            <div class="receiving-simple-pallet-heading"><div><h3 id="palletHeading">Pallets</h3><p id="recommendationStatus" class="muted">Enter units per pallet.</p></div><button id="refreshRecommendations" class="btn secondary" type="button">Refresh locations</button></div>
            <div id="palletGrid" class="receiving-simple-pallet-grid"></div>
          </section>
          <details class="receiving-simple-notes"><summary>Add receiving notes</summary><div class="field"><textarea name="notes" placeholder="Optional damage, quality, unloading, or location override notes"></textarea></div></details>
          <div class="receiving-simple-submit-bar"><div><strong id="receivingReadiness">Enter the receiving details</strong><small id="receivingCompletionNote"></small></div><button id="completeReceiving" class="btn" type="submit" disabled>Receive inventory</button></div>
        </section>
      </form>
    </section>
  </div>`;
}

export function orderLinesHtml(order, selectedLineId, scannedLineId, remainingFor) {
  if (!order?.lines?.length) return `<div class="empty">This purchase order has no product lines.</div>`;
  return order.lines.map((line) => {
    const remaining = remainingFor(line);
    const complete = remaining <= .01;
    const selected = line.po_line_id === selectedLineId;
    const scanned = line.po_line_id === scannedLineId;
    const locked = Boolean(scannedLineId) && !scanned;
    return `<label class="receiving-simple-order-line ${selected ? "is-selected" : ""} ${complete ? "is-complete" : ""}">
      <input type="radio" name="po_line_id" value="${escapeHtml(line.po_line_id)}" ${selected ? "checked" : ""} ${complete || locked ? "disabled" : ""} required>
      <span class="receiving-simple-product-name"><strong>${escapeHtml(line.product?.product_name || line.product_id)}</strong><small>${escapeHtml(line.product_id)}</small></span>
      <span><small>Remaining</small><strong>${formatQuantity(remaining)} ${escapeHtml(line.unit_type)}</strong></span>
      <span class="receiving-simple-line-status">${complete ? "COMPLETE" : scanned ? "SCANNED" : selected ? "SELECTED" : "OPEN"}</span>
    </label>`;
  }).join("");
}

export function palletCardsHtml(line, placements, locations, isReceivable) {
  return placements.map((pallet, index) => {
    const confirmed = locations.find((row) => String(row.location_id) === String(pallet.confirmed_location_id));
    const override = pallet.recommended_location_id && pallet.confirmed_location_id && pallet.recommended_location_id !== pallet.confirmed_location_id;
    const options = locations.filter((row) => isReceivable(row.location_id) || row.location_id === pallet.confirmed_location_id).map((row) => `<option value="${escapeHtml(row.location_id)}" ${String(row.location_id) === String(pallet.confirmed_location_id) ? "selected" : ""}>${escapeHtml(row.location_id)}</option>`).join("");
    return `<article class="receiving-simple-pallet-card ${confirmed ? "is-ready" : ""}">
      <div class="receiving-simple-pallet-top"><strong>Pallet ${index + 1}</strong><span>${formatQuantity(pallet.purchase_qty)} ${escapeHtml(line.unit_type)}</span></div>
      <div class="receiving-simple-location-row"><select data-pallet-location="${index}" aria-label="Location for pallet ${index + 1}"><option value="">Choose location</option>${options}</select><button class="btn secondary" data-scan-pallet="${index}" type="button">Scan</button></div>
      ${override ? `<small class="receiving-simple-override">Location changed from recommendation</small>` : ""}
    </article>`;
  }).join("");
}

export function poOption(po) {
  return `<option value="${escapeHtml(po.po_id)}">${escapeHtml(po.po_id)} — ${escapeHtml(po.supplier?.supplier_name || po.supplier_id)} (${escapeHtml(normalizeStatus(po.po_status))})</option>`;
}

export function normalizeStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  if (["MARKSENT", "MARK_SENT"].includes(status)) return "SENT";
  if (["RECEIVED", "CLOSED"].includes(status)) return "COMPLETE";
  return status;
}

export function friendlyUnit(unit) {
  const value = String(unit || "unit").trim();
  const token = value.toUpperCase();
  if (["CASE", "CASES"].includes(token)) return "Cases";
  if (["BOX", "BOXES"].includes(token)) return "Boxes";
  if (["UNIT", "UNITS", "EA", "EACH", "PCS", "PIECES"].includes(token)) return "Units";
  return `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`;
}
