import {
  clearApiCache,
  getPurchaseOrderDetail,
  listLocations,
  listPurchaseOrders,
  receiveProduct
} from "../js/api-smooth1.js?v=receiving-pallets1";
import { recommendPutawayLocations } from "../js/receiving-api.js?v=1";
import { handleKeyboardScan, startCameraScanner, stopCameraScanner } from "../js/scanner.js?v=smooth1";
import { escapeHtml, formatQuantity, notice } from "../js/utils.js";

const RECEIVABLE_STATUSES = ["DRAFT", "SENT", "CONFIRMED", "ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED"];
const EPSILON = 0.01;
let activeOrder = null;
let warehouseLocations = [];
let selectedLineId = "";
let scannedLineId = "";
let palletPlacements = [];
let activeScanPallet = null;
let recommendationRequestId = 0;
let submitting = false;
let pageContext = null;

export async function render(ctx) {
  pageContext = ctx;
  ensureReceivingStyles();
  ctx.setTitle("Receive Product", "Receive each physical pallet into its own verified warehouse location");

  const [orders, locations] = await Promise.all([listPurchaseOrders(), listLocations()]);
  const purchaseOrders = orders.filter((po) => RECEIVABLE_STATUSES.includes(normalizeStatus(po.po_status)));
  warehouseLocations = locations;
  activeOrder = null;
  selectedLineId = "";
  scannedLineId = "";
  palletPlacements = [];
  activeScanPallet = null;
  submitting = false;

  ctx.view.innerHTML = `
    <div class="receiving-v2-page">
      <section class="panel receiving-v2-scan-panel">
        <div class="receiving-v2-header">
          <div><span class="receiving-v2-eyebrow">Step 1</span><h2>Find the purchase-order product</h2><p class="muted">Scan its PO label or choose the purchase order manually.</p></div>
          <button id="scanReceiveQr" class="btn" type="button">Scan product QR</button>
        </div>
        <div class="receiving-v2-scan-grid">
          <div class="field"><label>PO / Product QR</label><input id="receiveScan" autocomplete="off" placeholder="Scan or paste the PO product QR"></div>
          <div class="field"><label>Purchase Order</label><select id="poSelect"><option value="">Select purchase order</option>${purchaseOrders.map(poOption).join("")}</select></div>
        </div>
        <div id="cameraReader"></div>
        <div id="receiveResult" class="result">Scan a product QR or select a purchase order.</div>
      </section>

      <section class="panel receiving-v2-workspace">
        <div class="receiving-v2-order-header">
          <div><span class="receiving-v2-eyebrow">Step 2</span><h2 id="receivingOrderTitle">Purchase Order</h2><p id="receivingOrderMeta" class="muted">No purchase order selected.</p></div>
          <span id="receivingOrderStatus" class="status">WAITING</span>
        </div>
        <form id="receiveForm">
          <input id="receiveScanValue" name="scan_code" type="hidden">
          <div id="poLines" class="receiving-v2-order-lines"><div class="empty">Products from the purchase order will appear here.</div></div>
          <section id="receivingDetails" class="receiving-v2-details" hidden>
            <div class="receiving-v2-section-heading">
              <div><span class="receiving-v2-eyebrow">Step 3</span><h3 id="selectedProductName">Product</h3></div>
              <span id="scanLockStatus" class="receiving-v2-badge" hidden>Selected by QR</span>
            </div>
            <div class="receiving-v2-facts">
              <div><span>Product ID</span><strong id="selectedProductId"></strong></div>
              <div><span>Expected</span><strong id="selectedExpectedQty"></strong></div>
              <div><span>Already received</span><strong id="selectedReceivedQty"></strong></div>
              <div><span>Remaining</span><strong id="selectedRemainingQty"></strong></div>
              <div><span>Unit weight</span><strong id="selectedUnitWeight"></strong></div>
              <div><span>Remaining weight</span><strong id="selectedExpectedWeight"></strong></div>
            </div>
            <div class="receiving-v2-entry-grid">
              <div class="field"><label>Quantity received</label><input name="qty_received" type="number" min="0.01" step="0.01" required></div>
              <div class="field"><label>Damaged / rejected</label><input name="qty_damaged" type="number" min="0" step="0.01" value="0" required></div>
              <div class="field"><label>Physical pallets</label><input name="pallet_count" type="number" min="1" max="100" step="1" value="1" required></div>
              <div class="field"><label>Quality status</label><select name="quality_status" required><option value="PASS">Pass</option><option value="HOLD">Hold for review</option><option value="REJECTED">Rejected</option></select></div>
              <div class="field receiving-v2-lot-field"><label>Supplier lot number</label><input name="supplier_lot_number" autocomplete="off" required></div>
            </div>
            <input name="quality_score" type="hidden" value="5">
            <div id="receivingQuantityPreview" class="receiving-v2-quantity-preview"></div>
            <div id="overReceiptApproval" class="receiving-v2-over-receipt" hidden>
              <label><input name="allow_over_receipt" type="checkbox" value="true"> <span id="overReceiptText">Approve over-receipt</span></label>
            </div>

            <section id="palletWorkspace" class="receiving-v2-pallet-workspace">
              <div class="receiving-v2-pallet-toolbar">
                <div><span class="receiving-v2-eyebrow">Step 4</span><h3>Place every pallet</h3><p class="muted">Each pallet becomes its own lot and needs a unique warehouse location.</p></div>
                <div class="receiving-v2-toolbar-actions"><button id="distributePallets" class="btn secondary" type="button">Distribute evenly</button><button id="refreshRecommendations" class="btn secondary" type="button">Refresh locations</button></div>
              </div>
              <div id="recommendationStatus" class="receiving-v2-recommendation-status">Enter the accepted quantity and pallet count to get locations.</div>
              <div id="palletGrid" class="receiving-v2-pallet-grid"></div>
              <div id="palletTotals" class="receiving-v2-pallet-totals"></div>
            </section>

            <div class="field receiving-v2-notes"><label>Receiving notes</label><textarea name="notes" placeholder="Optional damage, quality, unloading, or override notes"></textarea></div>
            <div class="receiving-v2-submit-bar">
              <div><strong id="receivingReadiness">Complete all receiving details</strong><div id="receivingCompletionNote" class="muted"></div></div>
              <button id="completeReceiving" class="btn" type="submit">Complete receiving</button>
            </div>
          </section>
        </form>
      </section>
    </div>`;

  document.getElementById("poSelect").addEventListener("change", (event) => loadPurchaseOrder(event.target.value).catch(showError));
  handleKeyboardScan(document.getElementById("receiveScan"), (value) => handleReceivingScan(value).catch(showError));
  document.getElementById("scanReceiveQr").addEventListener("click", () => startReceivingCamera("product"));
  document.getElementById("distributePallets").addEventListener("click", () => rebuildPallets(true));
  document.getElementById("refreshRecommendations").addEventListener("click", () => requestRecommendations(true));

  const form = document.getElementById("receiveForm");
  form.addEventListener("input", handleFormInput);
  form.addEventListener("change", handleFormChange);
  form.addEventListener("click", handleWorkspaceClick);
  form.addEventListener("submit", submitReceiving);
}

async function loadPurchaseOrder(poId, options = {}) {
  if (!poId) return resetWorkspace();
  const detail = await getPurchaseOrderDetail(poId);
  if (!detail) throw new Error("Purchase order was not found.");
  activeOrder = detail;
  selectedLineId = options.lineId || "";
  scannedLineId = options.scannedLineId || "";
  document.getElementById("poSelect").value = poId;
  document.getElementById("receivingOrderTitle").textContent = poId;
  document.getElementById("receivingOrderMeta").textContent = `${detail.po.supplier?.supplier_name || detail.po.supplier_id} · ${detail.lines.length} product${detail.lines.length === 1 ? "" : "s"}`;
  document.getElementById("receivingOrderStatus").textContent = normalizeStatus(detail.po.po_status) || "OPEN";
  renderOrderLines();
  document.getElementById("receivingDetails").hidden = true;
  if (options.lineId) selectPoLine(options.lineId, Boolean(options.scannedLineId));
}

function renderOrderLines() {
  const target = document.getElementById("poLines");
  if (!activeOrder?.lines?.length) return target.innerHTML = `<div class="empty">This purchase order has no product lines.</div>`;
  target.innerHTML = `<div class="receiving-v2-lines-header"><span>Products in this order</span><small>Select a product when no QR was scanned.</small></div>${activeOrder.lines.map((line) => {
    const remaining = lineRemaining(line);
    const complete = remaining <= EPSILON;
    const selected = line.po_line_id === selectedLineId;
    const scanned = line.po_line_id === scannedLineId;
    return `<label class="receiving-v2-order-line ${selected ? "is-selected" : ""} ${scanned ? "is-scanned" : ""} ${complete ? "is-complete" : ""}">
      <input type="radio" name="po_line_id" value="${escapeHtml(line.po_line_id)}" ${selected ? "checked" : ""} ${complete || (scannedLineId && !scanned) ? "disabled" : ""} required>
      <span class="receiving-v2-product-main"><strong>${escapeHtml(line.product?.product_name || line.product_id)}</strong><small>${escapeHtml(line.product_id)}</small></span>
      <span><small>Expected</small><strong>${formatNumber(line.qty_ordered)} ${escapeHtml(line.unit_type)}</strong></span>
      <span><small>Received</small><strong>${formatNumber(line.qty_received_total)} ${escapeHtml(line.unit_type)}</strong></span>
      <span><small>Remaining</small><strong>${formatNumber(remaining)} ${escapeHtml(line.unit_type)}</strong></span>
      <span class="receiving-v2-line-state">${scanned ? "SCANNED" : complete ? "COMPLETE" : selected ? "SELECTED" : "OPEN"}</span>
    </label>`;
  }).join("")}`;
}

function selectPoLine(poLineId, fromScan) {
  const line = selectedLine(poLineId);
  if (!line) throw new Error("The selected product is not part of this purchase order.");
  if (lineRemaining(line) <= EPSILON) throw new Error("This product has already been fully received.");
  selectedLineId = poLineId;
  if (fromScan) scannedLineId = poLineId;
  renderOrderLines();
  const form = document.getElementById("receiveForm");
  document.getElementById("receivingDetails").hidden = false;
  document.getElementById("selectedProductName").textContent = line.product?.product_name || line.product_id;
  document.getElementById("selectedProductId").textContent = line.product_id;
  document.getElementById("selectedExpectedQty").textContent = `${formatNumber(line.qty_ordered)} ${line.unit_type}`;
  document.getElementById("selectedReceivedQty").textContent = `${formatNumber(line.qty_received_total)} ${line.unit_type}`;
  document.getElementById("selectedRemainingQty").textContent = `${formatNumber(lineRemaining(line))} ${line.unit_type}`;
  document.getElementById("selectedUnitWeight").textContent = `${formatNumber(unitWeight(line))} LB per ${line.unit_type}`;
  document.getElementById("selectedExpectedWeight").textContent = `${formatNumber(lineRemaining(line) * unitWeight(line))} LB`;
  document.getElementById("scanLockStatus").hidden = !scannedLineId;
  form.elements.qty_received.value = cleanNumber(lineRemaining(line));
  form.elements.qty_damaged.value = "0";
  form.elements.pallet_count.value = "1";
  form.elements.quality_status.value = "PASS";
  form.elements.quality_score.value = "5";
  form.elements.supplier_lot_number.value = line.supplier_expected_lot_number || "";
  form.elements.allow_over_receipt.checked = false;
  palletPlacements = [];
  rebuildPallets(true);
}

function handleFormInput(event) {
  if (["qty_received", "qty_damaged", "pallet_count"].includes(event.target.name)) rebuildPallets(false);
  if (event.target.matches("[data-pallet-qty]")) {
    const index = Number(event.target.dataset.palletQty);
    if (palletPlacements[index]) palletPlacements[index].purchase_qty = number(event.target.value);
    updatePalletWorkspace();
  }
  updateReceivingPreview();
}

function handleFormChange(event) {
  if (event.target.name === "po_line_id") selectPoLine(event.target.value, false);
  if (event.target.name === "quality_status") {
    document.getElementById("receiveForm").elements.quality_score.value = qualityScore(event.target.value);
    rebuildPallets(false);
  }
  if (event.target.matches("[data-pallet-location]")) {
    const index = Number(event.target.dataset.palletLocation);
    if (palletPlacements[index]) palletPlacements[index].confirmed_location_id = event.target.value;
    updatePalletWorkspace();
  }
  updateReceivingPreview();
}

function handleWorkspaceClick(event) {
  const button = event.target.closest("[data-scan-pallet]");
  if (!button) return;
  activeScanPallet = Number(button.dataset.scanPallet);
  startReceivingCamera("location");
}

function rebuildPallets(forceDistribution) {
  const form = document.getElementById("receiveForm");
  const line = selectedLine();
  if (!line || !form) return;
  const quality = form.elements.quality_status.value;
  const accepted = acceptedQuantity();
  const count = Math.max(1, Math.floor(number(form.elements.pallet_count.value, 1)));
  document.getElementById("palletWorkspace").hidden = quality === "REJECTED";
  if (quality === "REJECTED") {
    palletPlacements = [];
    updatePalletWorkspace();
    return;
  }
  const prior = palletPlacements;
  palletPlacements = Array.from({ length: count }, (_, index) => ({
    pallet_number: index + 1,
    purchase_qty: prior[index]?.purchase_qty || 0,
    recommended_location_id: prior[index]?.recommended_location_id || "",
    confirmed_location_id: prior[index]?.confirmed_location_id || "",
    reason: prior[index]?.reason || ""
  }));
  if (forceDistribution || Math.abs(palletPlacements.reduce((sum, row) => sum + number(row.purchase_qty), 0) - accepted) > EPSILON) distributeAcceptedQuantity(accepted, line);
  renderPalletCards();
  updatePalletWorkspace();
  requestRecommendations(false);
}

function distributeAcceptedQuantity(accepted, line) {
  const count = palletPlacements.length || 1;
  const wholeUnits = String(line?.unit_type || "").toUpperCase() !== "LB" && Number.isInteger(accepted);
  if (wholeUnits) {
    const base = Math.floor(accepted / count);
    let remainder = Math.round(accepted - base * count);
    palletPlacements.forEach((row) => row.purchase_qty = base + (remainder-- > 0 ? 1 : 0));
  } else {
    const share = round(accepted / count, 2);
    let assigned = 0;
    palletPlacements.forEach((row, index) => {
      row.purchase_qty = index === count - 1 ? round(accepted - assigned, 2) : share;
      assigned += row.purchase_qty;
    });
  }
}

async function requestRecommendations(force) {
  const form = document.getElementById("receiveForm");
  const line = selectedLine();
  if (!form || !line || form.elements.quality_status.value === "REJECTED") return;
  const accepted = acceptedQuantity();
  if (accepted <= EPSILON || palletPlacements.length < 1) return;
  const requestId = ++recommendationRequestId;
  const target = document.getElementById("recommendationStatus");
  target.textContent = "Finding safe available pallet locations…";
  try {
    const result = await recommendPutawayLocations(pageContext.user, {
      po_id: activeOrder.po.po_id,
      po_line_id: line.po_line_id,
      qty_received: number(form.elements.qty_received.value),
      qty_damaged: number(form.elements.qty_damaged.value),
      qty_accepted: accepted,
      pallet_count: palletPlacements.length,
      exclude_location_ids: []
    });
    if (requestId !== recommendationRequestId) return;
    const recommendations = result?.recommendations || [];
    palletPlacements.forEach((row, index) => {
      const recommendation = recommendations[index];
      if (!recommendation) return;
      row.recommended_location_id = recommendation.location_id || recommendation.recommended_location_id || "";
      row.reason = recommendation.reason || "";
      if (force || !row.confirmed_location_id || !isLocationReceivable(row.confirmed_location_id)) row.confirmed_location_id = row.recommended_location_id;
    });
    target.textContent = recommendations.length === palletPlacements.length
      ? `${recommendations.length} unique pallet location${recommendations.length === 1 ? "" : "s"} recommended.`
      : `Only ${recommendations.length} of ${palletPlacements.length} required pallet locations are currently available.`;
    renderPalletCards();
    updatePalletWorkspace();
  } catch (error) {
    if (requestId !== recommendationRequestId) return;
    target.textContent = error.message;
    updatePalletWorkspace();
  }
}

function renderPalletCards() {
  const line = selectedLine();
  const grid = document.getElementById("palletGrid");
  if (!grid || !line) return;
  grid.innerHTML = palletPlacements.map((row, index) => {
    const recommended = locationById(row.recommended_location_id);
    const confirmed = locationById(row.confirmed_location_id);
    const override = row.recommended_location_id && row.confirmed_location_id && row.recommended_location_id !== row.confirmed_location_id;
    const ready = Boolean(confirmed && isLocationReceivable(confirmed.location_id) && row.purchase_qty > 0);
    return `<article class="receiving-v2-pallet-card ${ready ? "is-ready" : ""}">
      <div class="receiving-v2-pallet-card-header"><div><span class="receiving-v2-pallet-number">Pallet ${index + 1}</span><strong>${formatNumber(row.purchase_qty * unitWeight(line))} LB</strong></div><span class="receiving-v2-badge ${override ? "override" : ready ? "ready" : ""}">${override ? "OVERRIDE" : ready ? "READY" : "INCOMPLETE"}</span></div>
      <div class="field"><label>Quantity on this pallet</label><div class="receiving-v2-input-with-unit"><input data-pallet-qty="${index}" type="number" min="0.01" step="0.01" value="${cleanNumber(row.purchase_qty)}"><span>${escapeHtml(line.unit_type)}</span></div></div>
      <div class="receiving-v2-recommended-location"><span>Recommended</span><strong>${recommended ? escapeHtml(locationLabel(recommended)) : "No location available"}</strong><small>${escapeHtml(row.reason || "Waiting for a recommendation")}</small></div>
      <div class="field"><label>Confirmed location</label><select data-pallet-location="${index}"><option value="">Select or scan a location</option>${warehouseLocations.map((location) => locationOption(location, row.confirmed_location_id)).join("")}</select></div>
      <div class="receiving-v2-location-scan-row"><input data-pallet-scan-input="${index}" autocomplete="off" placeholder="Scan location QR"><button class="btn secondary" data-scan-pallet="${index}" type="button">Scan</button></div>
      <div class="receiving-v2-location-feedback">${confirmed ? `Confirmed: ${escapeHtml(locationLabel(confirmed))}${override ? " · manual override" : ""}` : "Confirm a unique empty location."}</div>
    </article>`;
  }).join("");
  grid.querySelectorAll("[data-pallet-scan-input]").forEach((input) => handleKeyboardScan(input, (value) => handleLocationScan(Number(input.dataset.palletScanInput), value)));
}

function updateReceivingPreview() {
  const line = selectedLine();
  if (!line) return;
  const accepted = acceptedQuantity();
  const remaining = lineRemaining(line);
  const after = Math.max(0, remaining - accepted);
  const variance = accepted - remaining;
  document.getElementById("receivingQuantityPreview").innerHTML = `<div><span>Accepted</span><strong>${formatNumber(accepted)} ${escapeHtml(line.unit_type)}</strong></div><div><span>Inventory weight</span><strong>${formatNumber(accepted * unitWeight(line))} LB</strong></div><div><span>Remaining afterward</span><strong>${formatNumber(after)} ${escapeHtml(line.unit_type)}</strong></div><div><span>Delivery result</span><strong>${variance > EPSILON ? `OVER BY ${formatNumber(variance)}` : after > EPSILON ? "PARTIAL" : "COMPLETE"}</strong></div>`;
  const over = variance > EPSILON;
  const approval = document.getElementById("overReceiptApproval");
  approval.hidden = !over;
  document.getElementById("overReceiptText").textContent = `I approve receiving ${formatNumber(variance)} ${line.unit_type} above the purchase order.`;
  document.getElementById("receivingCompletionNote").textContent = after > EPSILON ? `${formatNumber(after)} ${line.unit_type} will remain open.` : "This product line will be complete after confirmation.";
  updatePalletWorkspace();
}

function updatePalletWorkspace() {
  const form = document.getElementById("receiveForm");
  const line = selectedLine();
  if (!form || !line) return;
  const quality = form.elements.quality_status.value;
  const accepted = acceptedQuantity();
  const assigned = palletPlacements.reduce((sum, row) => sum + number(row.purchase_qty), 0);
  const difference = round(accepted - assigned, 2);
  const locations = palletPlacements.map((row) => row.confirmed_location_id).filter(Boolean);
  const unique = new Set(locations);
  const allLocationsValid = palletPlacements.every((row) => row.confirmed_location_id && isLocationReceivable(row.confirmed_location_id));
  const quantitiesValid = palletPlacements.length > 0 && palletPlacements.every((row) => number(row.purchase_qty) > 0) && Math.abs(difference) <= EPSILON;
  const uniqueValid = locations.length === palletPlacements.length && unique.size === locations.length;
  const rejectedValid = quality === "REJECTED" && accepted <= EPSILON && number(form.elements.qty_damaged.value) === number(form.elements.qty_received.value);
  const over = accepted - lineRemaining(line) > EPSILON;
  const overApproved = !over || (form.elements.allow_over_receipt.checked && ["ADMIN", "MANAGER"].includes(String(pageContext?.user?.role || "").toUpperCase()));
  const ready = quality === "REJECTED" ? rejectedValid : accepted > EPSILON && quantitiesValid && uniqueValid && allLocationsValid && overApproved && Boolean(form.elements.supplier_lot_number.value.trim());
  const totals = document.getElementById("palletTotals");
  totals.innerHTML = quality === "REJECTED" ? `<div class="is-good"><span>Rejected delivery</span><strong>No inventory will be added</strong></div>` : `<div><span>Accepted total</span><strong>${formatNumber(accepted)}</strong></div><div><span>Assigned to pallets</span><strong>${formatNumber(assigned)}</strong></div><div class="${Math.abs(difference) <= EPSILON ? "is-good" : "is-bad"}"><span>Difference</span><strong>${formatNumber(difference)}</strong></div><div class="${uniqueValid ? "is-good" : "is-bad"}"><span>Unique locations</span><strong>${unique.size} / ${palletPlacements.length}</strong></div>`;
  const readiness = document.getElementById("receivingReadiness");
  readiness.textContent = ready ? (quality === "REJECTED" ? "Ready to record rejection" : "Ready to receive") : readinessMessage({ quality, accepted, quantitiesValid, uniqueValid, allLocationsValid, overApproved });
  readiness.className = ready ? "is-ready" : "";
  document.getElementById("completeReceiving").disabled = !ready || submitting;
}

async function submitReceiving(event) {
  event.preventDefault();
  if (submitting) return;
  const form = event.currentTarget;
  const line = selectedLine();
  if (!line) return notice("Select or scan a product.");
  updatePalletWorkspace();
  if (document.getElementById("completeReceiving").disabled) return notice("Complete all quantities and pallet locations before receiving.");
  const quality = form.elements.quality_status.value;
  const input = {
    po_id: activeOrder.po.po_id,
    po_line_id: line.po_line_id,
    scan_code: form.elements.scan_code.value,
    qty_received: number(form.elements.qty_received.value),
    qty_damaged: number(form.elements.qty_damaged.value),
    quality_status: quality,
    quality_score: qualityScore(quality),
    supplier_lot_number: form.elements.supplier_lot_number.value.trim(),
    pallet_count: quality === "REJECTED" ? 0 : palletPlacements.length,
    allow_over_receipt: form.elements.allow_over_receipt.checked,
    notes: form.elements.notes.value.trim(),
    pallet_placements: quality === "REJECTED" ? [] : palletPlacements.map((row, index) => ({
      pallet_number: index + 1,
      purchase_qty: round(number(row.purchase_qty), 2),
      base_qty: round(number(row.purchase_qty) * unitWeight(line), 2),
      recommended_location_id: row.recommended_location_id,
      confirmed_location_id: row.confirmed_location_id
    }))
  };
  submitting = true;
  const button = document.getElementById("completeReceiving");
  button.disabled = true;
  button.textContent = "Completing receiving…";
  try {
    const result = await receiveProduct(pageContext.user, input);
    clearApiCache();
    showCompletion(result, line);
    const updated = result.purchaseOrder || await getPurchaseOrderDetail(activeOrder.po.po_id);
    const next = updated?.lines?.find((item) => lineRemaining(item) > EPSILON);
    await loadPurchaseOrder(activeOrder.po.po_id, next ? { lineId: next.po_line_id } : {});
  } catch (error) {
    notice(error.message);
  } finally {
    submitting = false;
    button.textContent = "Complete receiving";
    updatePalletWorkspace();
  }
}

function showCompletion(result, line) {
  if (result?.rejected) return notice(`Rejected delivery recorded for ${line.product?.product_name || line.product_id}. No inventory was added.`);
  const lots = result?.lots || (result?.lot ? [result.lot] : []);
  const placements = lots.map((lot) => `${lot.internal_lot_id} → ${lot.current_location_id}`).join(" · ");
  notice(`${lots.length} pallet${lots.length === 1 ? "" : "s"} received. ${placements}`);
}

async function handleReceivingScan(value) {
  const parsed = parsePurchaseOrderQr(value);
  if (!parsed) throw new Error("This is not a valid purchase-order product QR.");
  const poId = parsed.poId || activeOrder?.po?.po_id || "";
  if (!poId) throw new Error("Select the purchase order before scanning this legacy QR.");
  await loadPurchaseOrder(poId);
  const line = activeOrder.lines.find((item) => parsed.poLineId ? item.po_line_id === parsed.poLineId : item.product_id === parsed.productId);
  if (!line) throw new Error("The scanned product is not part of this purchase order.");
  scannedLineId = line.po_line_id;
  selectPoLine(line.po_line_id, true);
  document.getElementById("receiveForm").elements.supplier_lot_number.value = parsed.supplierLot || line.supplier_expected_lot_number || "";
  document.getElementById("receiveScanValue").value = value;
  document.getElementById("receiveResult").innerHTML = `<strong>${escapeHtml(line.product?.product_name || line.product_id)} selected</strong><br>${escapeHtml(poId)} · ${escapeHtml(formatNumber(lineRemaining(line)))} ${escapeHtml(line.unit_type)} remaining`;
}

function handleLocationScan(index, value) {
  const location = warehouseLocations.find((row) => [row.location_id, row.qr_value].map(String).includes(String(value || "").trim()));
  if (!location) return notice(`Location QR not found: ${value}`);
  if (!isLocationReceivable(location.location_id)) return notice(`${location.location_id} is not currently available for receiving.`);
  if (palletPlacements.some((row, rowIndex) => rowIndex !== index && row.confirmed_location_id === location.location_id)) return notice(`${location.location_id} is already assigned to another pallet.`);
  palletPlacements[index].confirmed_location_id = location.location_id;
  renderPalletCards();
  updatePalletWorkspace();
}

async function startReceivingCamera(mode) {
  try {
    const inputId = mode === "location" ? `palletScanCameraTarget` : "receiveScan";
    if (mode === "location") {
      document.getElementById(inputId) || document.body.appendChild(Object.assign(document.createElement("input"), { id: inputId, type: "hidden" }));
    }
    await startCameraScanner(inputId, (value) => {
      if (mode === "location") handleLocationScan(activeScanPallet, value);
      else handleReceivingScan(value).catch(showError);
      stopCameraScanner();
    });
  } catch (error) { showError(error); }
}

function isLocationReceivable(locationId) {
  const location = locationById(locationId);
  if (!location) return false;
  if (location.is_receivable !== undefined) return location.is_receivable === true || String(location.is_receivable).toUpperCase() === "TRUE";
  const active = location.is_active === undefined || location.is_active === true || String(location.is_active).toUpperCase() === "TRUE";
  const status = String(location.current_status || "AVAILABLE").toUpperCase();
  return active && !["BLOCKED", "UNAVAILABLE", "OCCUPIED", "FULL", "MAINTENANCE", "INACTIVE"].includes(status);
}

function locationOption(location, selectedId) {
  const receivable = isLocationReceivable(location.location_id);
  const selected = String(location.location_id) === String(selectedId);
  const reason = location.availability_reason || (receivable ? "AVAILABLE" : String(location.current_status || "UNAVAILABLE"));
  return `<option value="${escapeHtml(location.location_id)}" ${selected ? "selected" : ""} ${!receivable && !selected ? "disabled" : ""}>${escapeHtml(locationLabel(location))} — ${escapeHtml(reason)}</option>`;
}
function locationLabel(location) { return `${location.location_id}${location.location_type ? ` · ${location.location_type}` : ""}`; }
function locationById(id) { return warehouseLocations.find((row) => String(row.location_id) === String(id)); }
function selectedLine(id = selectedLineId) { return activeOrder?.lines?.find((row) => String(row.po_line_id) === String(id)); }
function acceptedQuantity() { const form = document.getElementById("receiveForm"); return Math.max(0, number(form?.elements.qty_received?.value) - number(form?.elements.qty_damaged?.value)); }
function unitWeight(line) { return number(line?.case_weight_lbs || line?.units_per_purchase_unit, 0); }
function lineRemaining(line) { const explicit = Number(line?.qty_remaining); return line?.qty_remaining !== "" && Number.isFinite(explicit) ? Math.max(0, explicit) : Math.max(0, number(line?.qty_ordered) - number(line?.qty_received_total)); }
function normalizeStatus(value) { const status = String(value || "").trim().toUpperCase(); return status === "MARKSENT" || status === "MARK_SENT" ? "SENT" : status === "RECEIVED" || status === "CLOSED" ? "COMPLETE" : status; }
function qualityScore(status) { return status === "PASS" ? 5 : status === "HOLD" ? 3 : 1; }
function number(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function round(value, decimals = 2) { const factor = 10 ** decimals; return Math.round((number(value) + Number.EPSILON) * factor) / factor; }
function cleanNumber(value) { return String(round(value, 2)); }
function formatNumber(value) { return formatQuantity(value); }
function poOption(po) { return `<option value="${escapeHtml(po.po_id)}">${escapeHtml(po.po_id)} — ${escapeHtml(po.supplier?.supplier_name || po.supplier_id)} (${escapeHtml(normalizeStatus(po.po_status))})</option>`; }
function showError(error) { notice(error?.message || String(error)); }
function parsePurchaseOrderQr(value) { try { const parsed = JSON.parse(String(value || "")); if (parsed?.type === "PO_LINE" && parsed.product_id) return { poId: parsed.po_id || "", poLineId: parsed.po_line_id || "", productId: parsed.product_id, supplierLot: parsed.supplier_lot_number === "PENDING" ? "" : parsed.supplier_lot_number || "" }; } catch (_) {} const parts = String(value || "").split("|").map((part) => part.trim()); if (parts.length < 2 || !parts[1].startsWith("QTY:")) return null; return { poId: "", poLineId: "", productId: parts[0], supplierLot: parts.find((part) => part.startsWith("SUPLOT:"))?.replace("SUPLOT:", "") || "" }; }
function readinessMessage({ quality, accepted, quantitiesValid, uniqueValid, allLocationsValid, overApproved }) { if (quality === "REJECTED") return "Mark the full received quantity as rejected"; if (accepted <= EPSILON) return "Accepted quantity must be greater than zero"; if (!quantitiesValid) return "Pallet quantities must equal the accepted total"; if (!uniqueValid) return "Every pallet needs a different location"; if (!allLocationsValid) return "Confirm an available location for every pallet"; if (!overApproved) return "Manager approval is required for the over-receipt"; return "Complete all receiving details"; }
function resetWorkspace() { activeOrder = null; selectedLineId = ""; scannedLineId = ""; palletPlacements = []; document.getElementById("receivingOrderTitle").textContent = "Purchase Order"; document.getElementById("receivingOrderMeta").textContent = "No purchase order selected."; document.getElementById("receivingOrderStatus").textContent = "WAITING"; document.getElementById("poLines").innerHTML = `<div class="empty">Products from the purchase order will appear here.</div>`; document.getElementById("receivingDetails").hidden = true; }
function ensureReceivingStyles() { if (document.getElementById("receivingPalletStyles")) return; const link = document.createElement("link"); link.id = "receivingPalletStyles"; link.rel = "stylesheet"; link.href = "./css/receiving-pallets.css?v=1"; document.head.appendChild(link); }
