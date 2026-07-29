import { getPurchaseOrderDetail, listLocations, listPurchaseOrders } from "../js/api-smooth1.js?v=rack-inventory4";
import { getWarehouseCapabilities, getReceivingSession, listOpenReceivingSessions, newOperationId, placeReceivingInventory, startReceivingSession } from "../js/warehouse-v2-api.js?v=warehouse-v2";
import { escapeHtml, formatQuantity, notice } from "../js/utils.js";
import { render as renderLegacy } from "./receiving-simple.js?v=receiving-capacity1";

const RECEIVABLE = new Set(["DRAFT", "SENT", "CONFIRMED", "ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED", "PARTIAL"]);
const LEVELS = ["L3", "L2", "L1"];
const BINS = ["F", "M", "B"];
let ctx;
let purchaseOrders = [];
let locations = [];
let detail = null;
let selectedLine = null;
let session = null;
let selectedRack = "";
let selectedLocation = "";
let busy = false;

export async function render(context) {
  ctx = context;
  try {
    const capabilities = await getWarehouseCapabilities();
    if (!capabilities?.receiving_sessions) throw new Error("Warehouse backend upgrade required.");
  } catch (error) {
    if (String(error.message || "").includes("backend upgrade required") || String(error.message || "").includes("Unknown action")) {
      return renderLegacy(context);
    }
    throw error;
  }

  context.setTitle("Receive Product", "Receive quantity, then place it one storage space at a time");
  [purchaseOrders, locations] = await Promise.all([listPurchaseOrders(), listLocations()]);
  const openSessions = await listOpenReceivingSessions(context.user).catch(() => []);
  context.view.innerHTML = pageHtml(openSessions);
  bindBaseEvents();
  if (openSessions.length) {
    const latest = openSessions[openSessions.length - 1];
    await resumeSession(latest.receiving?.receiving_id);
  }
}

function pageHtml(openSessions) {
  const orders = purchaseOrders.filter((po) => RECEIVABLE.has(status(po.po_status)));
  return `
    <section class="panel receiving-v2">
      <div class="panel-header">
        <div><p class="eyebrow">WAREHOUSE RECEIVING</p><h2>Receive → choose space → place</h2></div>
        ${openSessions.length ? `<span class="status-pill">${openSessions.length} open receiving job${openSessions.length === 1 ? "" : "s"}</span>` : ""}
      </div>
      <div id="receivingStartPanel">
        <div class="form-grid receiving-start-grid">
          <label>Purchase Order<select id="rv2Po"><option value="">Select PO</option>${orders.map((po) => `<option value="${escapeHtml(po.po_id)}">${escapeHtml(po.po_id)} · ${escapeHtml(po.supplier?.supplier_name || po.supplier_id || "")}</option>`).join("")}</select></label>
          <label>Product<select id="rv2Line" disabled><option value="">Select product</option></select></label>
          <label>Quantity received<input id="rv2Qty" inputmode="decimal" type="number" min="0" step="any"></label>
          <label>Damaged / rejected<input id="rv2Damaged" inputmode="decimal" type="number" min="0" step="any" value="0"></label>
          <label>Cases / units per space<input id="rv2PerSpace" inputmode="decimal" type="number" min="0" step="any" placeholder="e.g. 40"></label>
          <label>Supplier lot<input id="rv2SupplierLot" autocomplete="off"></label>
        </div>
        <div id="rv2Plan" class="receiving-v2-plan"></div>
        <button id="rv2Start" class="primary" type="button" disabled>Start placement</button>
      </div>
      <div id="receivingPlacementPanel" hidden></div>
    </section>
  `;
}

function bindBaseEvents() {
  document.getElementById("rv2Po")?.addEventListener("change", async (event) => {
    await loadPurchaseOrder(event.target.value);
  });
  ["rv2Line", "rv2Qty", "rv2Damaged", "rv2PerSpace", "rv2SupplierLot"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", updatePlan);
    document.getElementById(id)?.addEventListener("change", updatePlan);
  });
  document.getElementById("rv2Line")?.addEventListener("change", () => {
    selectedLine = detail?.lines?.find((line) => String(line.po_line_id) === document.getElementById("rv2Line").value) || null;
    if (selectedLine) {
      document.getElementById("rv2Qty").value = clean(lineRemaining(selectedLine));
      document.getElementById("rv2SupplierLot").value = selectedLine.supplier_expected_lot_number || "";
    }
    updatePlan();
  });
  document.getElementById("rv2Start")?.addEventListener("click", startSession);
}

async function loadPurchaseOrder(poId) {
  detail = poId ? await getPurchaseOrderDetail(poId) : null;
  selectedLine = null;
  const select = document.getElementById("rv2Line");
  if (!select) return;
  if (!detail) {
    select.disabled = true;
    select.innerHTML = `<option value="">Select product</option>`;
    updatePlan();
    return;
  }
  const lines = detail.lines.filter((line) => lineRemaining(line) > 0.0001);
  select.disabled = false;
  select.innerHTML = `<option value="">Select product</option>${lines.map((line) => `<option value="${escapeHtml(line.po_line_id)}">${escapeHtml(line.product?.product_name || line.product_id)} · ${escapeHtml(formatQuantity(lineRemaining(line)))} ${escapeHtml(line.unit_type || "units")} remaining</option>`).join("")}`;
  updatePlan();
}

function updatePlan() {
  const lineId = document.getElementById("rv2Line")?.value || "";
  selectedLine = detail?.lines?.find((line) => String(line.po_line_id) === lineId) || null;
  const qty = number(document.getElementById("rv2Qty")?.value);
  const damaged = number(document.getElementById("rv2Damaged")?.value);
  const accepted = Math.max(0, qty - damaged);
  const perSpace = number(document.getElementById("rv2PerSpace")?.value);
  const lot = String(document.getElementById("rv2SupplierLot")?.value || "").trim();
  const spaces = accepted > 0 && perSpace > 0 ? Math.ceil(accepted / perSpace - 1e-9) : 0;
  const plan = document.getElementById("rv2Plan");
  if (plan) {
    plan.innerHTML = selectedLine && accepted > 0 && perSpace > 0
      ? `<strong>${formatQuantity(accepted)} ${escapeHtml(selectedLine.unit_type || "units")}</strong><span>${spaces} space${spaces === 1 ? "" : "s"} required · ${formatQuantity(perSpace)} per full space · ${formatQuantity(unitWeight(selectedLine))} LB each</span>`
      : `<span>Select a product and enter the amount per space.</span>`;
  }
  const valid = Boolean(selectedLine && qty > 0 && damaged >= 0 && damaged < qty && perSpace > 0 && lot && unitWeight(selectedLine) > 0);
  const button = document.getElementById("rv2Start");
  if (button) button.disabled = !valid || busy;
}

async function startSession() {
  if (busy || !selectedLine || !detail) return;
  busy = true;
  updatePlan();
  try {
    session = await startReceivingSession(ctx.user, {
      po_id: detail.po.po_id,
      po_line_id: selectedLine.po_line_id,
      qty_received: number(document.getElementById("rv2Qty").value),
      qty_damaged: number(document.getElementById("rv2Damaged").value),
      cases_per_space: number(document.getElementById("rv2PerSpace").value),
      supplier_lot_number: document.getElementById("rv2SupplierLot").value.trim(),
      quality_status: "PASS",
      operation_id: newOperationId("RCVSTART"),
      source_screen: "RECEIVING_V2"
    });
    selectedLocation = "";
    renderPlacement();
  } catch (error) {
    notice(error.message);
  } finally {
    busy = false;
    updatePlan();
  }
}

async function resumeSession(receivingId) {
  const next = await getReceivingSession(receivingId);
  if (!next) return;
  session = next;
  const poId = session.receiving.po_id;
  detail = await getPurchaseOrderDetail(poId);
  selectedLine = detail?.lines?.find((line) => String(line.po_line_id) === String(session.receiving.po_line_id)) || null;
  document.getElementById("rv2Po").value = poId;
  await loadPurchaseOrder(poId);
  selectedLine = detail?.lines?.find((line) => String(line.po_line_id) === String(session.receiving.po_line_id)) || null;
  renderPlacement();
}

function renderPlacement() {
  const start = document.getElementById("receivingStartPanel");
  const panel = document.getElementById("receivingPlacementPanel");
  if (!panel || !session) return;
  start.hidden = true;
  panel.hidden = false;
  if (session.complete) {
    panel.innerHTML = `<div class="receiving-complete"><p class="eyebrow">RECEIVING COMPLETE</p><h2>${escapeHtml(session.product?.product_name || session.receiving.product_id)}</h2><p>${session.spaces_completed} of ${session.spaces_required} spaces placed.</p><div class="receiving-placement-history">${historyHtml()}</div><button id="rv2New" class="primary" type="button">Receive another product</button></div>`;
    document.getElementById("rv2New")?.addEventListener("click", () => window.location.reload());
    return;
  }
  const racks = rackNames();
  if (!selectedRack || !racks.includes(selectedRack)) selectedRack = racks[0] || "";
  panel.innerHTML = `
    <div class="receiving-job-header">
      <div><p class="eyebrow">${escapeHtml(session.receiving.po_id)} · ${escapeHtml(session.receiving.supplier_lot_number)}</p><h2>${escapeHtml(session.product?.product_name || session.receiving.product_id)}</h2></div>
      <strong>${session.spaces_completed} / ${session.spaces_required}</strong>
    </div>
    <div class="receiving-progress"><span style="width:${Math.min(100, session.spaces_required ? session.spaces_completed / session.spaces_required * 100 : 0)}%"></span></div>
    <div class="receiving-next-card"><span>Next placement</span><strong>${formatQuantity(session.next_qty)} ${escapeHtml(session.receiving.unit_type || "units")}</strong><small>${formatQuantity(session.remaining_qty)} remaining after completed placements</small></div>
    ${session.placements.length ? `<div class="receiving-placement-history">${historyHtml()}</div>` : ""}
    <div class="receiving-storage-picker">
      <div class="rack-picker-top"><button id="rv2PrevRack" type="button">‹</button><strong>${escapeHtml(selectedRack || "Racks")}</strong><button id="rv2NextRack" type="button">›</button></div>
      <div id="rv2RackGrid">${rackGridHtml(selectedRack)}</div>
      <div class="rack-number-strip">${racks.map((rack) => `<button type="button" data-rv2-rack="${escapeHtml(rack)}" class="${rack === selectedRack ? "active" : ""}">${escapeHtml(rack)}</button>`).join("")}</div>
      <div class="logical-location-row"><button type="button" data-rv2-location="FLOOR-1" class="${selectedLocation === "FLOOR-1" ? "selected" : ""}">Floor 1</button><button type="button" data-rv2-location="FLOOR-2" class="${selectedLocation === "FLOOR-2" ? "selected" : ""}">Floor 2</button></div>
    </div>
    <div class="receiving-selected-location">${selectedLocation ? `Selected: <strong>${escapeHtml(selectedLocation)}</strong>` : "Tap an available space."}</div>
    <button id="rv2Place" class="primary" type="button" ${selectedLocation || busy ? "" : "disabled"}>${busy ? "Placing…" : `Place ${formatQuantity(session.next_qty)} ${escapeHtml(session.receiving.unit_type || "units")}`}</button>
    <button id="rv2CancelView" class="secondary" type="button">Back to receiving list</button>
  `;
  bindPlacementEvents();
}

function bindPlacementEvents() {
  document.querySelectorAll("[data-rv2-rack]").forEach((button) => button.addEventListener("click", () => {
    selectedRack = button.dataset.rv2Rack;
    selectedLocation = "";
    renderPlacement();
  }));
  document.querySelectorAll("[data-rv2-location]").forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.rv2Location;
    if (!isAvailable(id)) return notice(`${id} is not available.`);
    selectedLocation = id;
    renderPlacement();
  }));
  document.getElementById("rv2PrevRack")?.addEventListener("click", () => shiftRack(-1));
  document.getElementById("rv2NextRack")?.addEventListener("click", () => shiftRack(1));
  document.getElementById("rv2Place")?.addEventListener("click", placeNext);
  document.getElementById("rv2CancelView")?.addEventListener("click", () => {
    document.getElementById("receivingStartPanel").hidden = false;
    document.getElementById("receivingPlacementPanel").hidden = true;
  });
}

function shiftRack(delta) {
  const racks = rackNames();
  if (!racks.length) return;
  const index = Math.max(0, racks.indexOf(selectedRack));
  selectedRack = racks[(index + delta + racks.length) % racks.length];
  selectedLocation = "";
  renderPlacement();
}

async function placeNext() {
  if (busy || !session || !selectedLocation) return;
  busy = true;
  renderPlacement();
  try {
    session = await placeReceivingInventory(ctx.user, {
      receiving_id: session.receiving.receiving_id,
      location_id: selectedLocation,
      purchase_qty: session.next_qty,
      operation_id: newOperationId("RCVPLACE"),
      source_screen: "RECEIVING_V2"
    });
    notice(`${selectedLocation} updated.`);
    selectedLocation = "";
    locations = await listLocations();
    renderPlacement();
  } catch (error) {
    notice(error.message);
  } finally {
    busy = false;
    renderPlacement();
  }
}

function rackNames() {
  return Array.from(new Set(locations.filter((row) => String(row.location_type || "PALLET_RACK").toUpperCase() === "PALLET_RACK").map((row) => String(row.rack || row.location_id || "").split("-")[0]).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function rackGridHtml(rack) {
  const cells = [];
  LEVELS.forEach((level) => BINS.forEach((bin) => {
    const location = locations.find((row) => String(row.rack || row.location_id || "").split("-")[0] === rack && String(row.level || "").toUpperCase() === level && String(row.bin || "").toUpperCase() === bin);
    const id = location?.location_id || `${rack}-${level}-${bin}`;
    const available = Boolean(location && isAvailable(id));
    cells.push(`<button type="button" class="receiving-rack-cell ${available ? "available" : "occupied"} ${selectedLocation === id ? "selected" : ""}" data-rv2-location="${escapeHtml(id)}" ${available ? "" : "disabled"}><span>${escapeHtml(level)}-${escapeHtml(bin)}</span><strong>${available ? "Available" : "Occupied"}</strong></button>`);
  }));
  return `<div class="receiving-rack-grid">${cells.join("")}</div>`;
}

function historyHtml() {
  return session.placements.map((row) => `<div><span>✓ ${escapeHtml(row.location_id)}</span><strong>${formatQuantity(number(row.purchase_qty))} ${escapeHtml(row.purchase_unit_type || session.receiving.unit_type || "units")}</strong></div>`).join("");
}

function isAvailable(locationId) {
  const row = locations.find((item) => String(item.location_id) === String(locationId));
  if (!row) return false;
  const type = String(row.location_type || "").toUpperCase();
  if (["FLOOR_STORAGE", "PACKING_AREA"].includes(type)) return String(row.current_status || "AVAILABLE").toUpperCase() !== "BLOCKED";
  if (row.is_receivable !== undefined) return row.is_receivable === true || String(row.is_receivable).toUpperCase() === "TRUE";
  const statusValue = String(row.current_status || "AVAILABLE").toUpperCase();
  return !["BLOCKED", "UNAVAILABLE", "OCCUPIED", "FULL", "MAINTENANCE", "INACTIVE"].includes(statusValue);
}

function lineRemaining(line) { return Math.max(0, number(line.qty_remaining !== "" && line.qty_remaining !== undefined ? line.qty_remaining : number(line.qty_ordered) - number(line.qty_received_total))); }
function unitWeight(line) { return firstPositive(line.case_weight_lbs, line.units_per_purchase_unit, line.unit_weight_lbs, line.product?.units_per_purchase_unit, line.product?.case_weight_lbs); }
function firstPositive(...values) { for (const value of values) { const parsed = Number(value); if (Number.isFinite(parsed) && parsed > 0) return parsed; } return 0; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function clean(value) { return String(Math.round(number(value) * 10000) / 10000); }
function status(value) { return String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_"); }
