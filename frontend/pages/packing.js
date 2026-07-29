import { listLocations, listProducts } from "../js/api-smooth1.js?v=rack-inventory4";
import { getPackingActivity, getWarehouseCapabilities, listProductStorage, moveInventory, newOperationId, recordPackingUsage } from "../js/warehouse-v2-api.js?v=warehouse-v2";
import { escapeHtml, formatQuantity, notice } from "../js/utils.js";

let ctx;
let products = [];
let locations = [];
let activity = null;
let productStorage = [];
let busy = false;
const pendingOps = new Map();

export async function render(context) {
  ctx = context;
  context.setTitle("Packing Area", "Move product in, return it to storage, and post actual usage");
  try {
    const capabilities = await getWarehouseCapabilities();
    if (!capabilities?.packing) throw new Error("Warehouse backend upgrade required.");
  } catch (error) {
    context.view.innerHTML = `<section class="panel"><div class="panel-header"><h2>Packing Area</h2></div><p class="muted">${escapeHtml(error.message)}</p><p class="muted">Redeploy the latest Apps Script backend to enable Packing.</p></section>`;
    return;
  }

  [products, locations, activity] = await Promise.all([
    listProducts(),
    listLocations(),
    getPackingActivity(localTodayKey())
  ]);
  renderPage();
}

function renderPage() {
  const role = String(ctx.user?.role || "OPERATOR").toUpperCase();
  const canPostUsage = ["ADMIN", "MANAGER", "OWNER"].includes(role);
  ctx.view.innerHTML = `
    <section class="panel packing-v2">
      <div class="panel-header"><div><p class="eyebrow">WORKING INVENTORY</p><h2>Packing Area</h2></div><span class="status-pill">${escapeHtml(activity?.date || localTodayKey())}</span></div>
      <div class="packing-actions-grid">
        <div class="packing-move-card">
          <h3>Move product to Packing</h3>
          <label>Product<select id="packingProduct"><option value="">Select product</option>${products.map((product) => `<option value="${escapeHtml(product.product_id)}">${escapeHtml(product.product_name)}</option>`).join("")}</select></label>
          <div id="packingStorageChoices"><p class="muted">Choose a product to see its storage spaces.</p></div>
        </div>
      </div>
      <div class="packing-section">
        <div class="packing-section-title"><div><p class="eyebrow">CURRENTLY IN PACKING</p><h3>${activity?.current_inventory?.length || 0} active lot${activity?.current_inventory?.length === 1 ? "" : "s"}</h3></div></div>
        <div id="packingCurrentList" class="packing-list">${currentInventoryHtml(canPostUsage)}</div>
      </div>
      <div class="packing-section">
        <div class="packing-section-title"><div><p class="eyebrow">TODAY'S MOVEMENT HISTORY</p><h3>What moved through Packing</h3></div></div>
        <div class="packing-list">${activityRowsHtml()}</div>
      </div>
      <datalist id="packingDestinationOptions">${destinationLocations().map((location) => `<option value="${escapeHtml(location.location_id)}">${escapeHtml(locationLabel(location))}</option>`).join("")}</datalist>
    </section>
  `;
  document.getElementById("packingProduct")?.addEventListener("change", (event) => loadProductStorage(event.target.value));
  bindPackingList(canPostUsage);
}

async function loadProductStorage(productId) {
  const box = document.getElementById("packingStorageChoices");
  if (!box) return;
  if (!productId) {
    productStorage = [];
    box.innerHTML = `<p class="muted">Choose a product to see its storage spaces.</p>`;
    return;
  }
  box.innerHTML = `<p class="muted">Loading storage…</p>`;
  try {
    productStorage = (await listProductStorage(productId)).filter((row) => String(row.location_id || "").toUpperCase() !== "PACKING");
    box.innerHTML = productStorage.length ? productStorage.map((row) => `
      <div class="packing-source-row">
        <div><strong>${escapeHtml(row.location_id)}</strong><span>Lot ${escapeHtml(row.supplier_lot_number || row.internal_lot_id)}</span></div>
        <div><strong>${formatQuantity(row.purchase_qty)} ${escapeHtml(row.purchase_unit_type || "units")}</strong><span>${formatQuantity(row.base_qty)} LB</span></div>
        <label class="packing-inline-field"><span>Move</span><input type="number" inputmode="decimal" min="0" max="${escapeHtml(String(row.purchase_qty))}" step="any" value="${escapeHtml(String(row.purchase_qty))}" data-pack-qty="${escapeHtml(row.internal_lot_id)}" aria-label="Quantity to move"></label>
        <button type="button" data-pack-move="${escapeHtml(row.internal_lot_id)}">Move to Packing</button>
      </div>`).join("") : `<p class="muted">No active storage currently contains this product.</p>`;
    document.querySelectorAll("[data-pack-move]").forEach((button) => button.addEventListener("click", () => moveToPacking(button.dataset.packMove, button)));
  } catch (error) {
    box.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  }
}

async function moveToPacking(lotId, button) {
  if (busy) return;
  const row = productStorage.find((item) => String(item.internal_lot_id) === String(lotId));
  const input = document.querySelector(`[data-pack-qty="${cssEscape(lotId)}"]`);
  const qty = Math.min(number(input?.value), number(row?.purchase_qty));
  if (!row || qty <= 0) return notice("Enter an amount to move.");
  const operationKey = `PACKIN:${lotId}:${qty}`;
  busy = true;
  setButtonBusy(button, true, "Moving…");
  try {
    await moveInventory(ctx.user, {
      internal_lot_id: lotId,
      to_location_id: "PACKING",
      purchase_qty: qty,
      operation_id: operationFor(operationKey, "PACKIN"),
      source_screen: "PACKING"
    });
    clearOperation(operationKey);
    notice(`${formatQuantity(qty)} ${row.purchase_unit_type || "units"} moved to Packing.`);
    await refresh();
  } catch (error) {
    notice(`${error.message} You can tap again to retry safely.`);
  } finally {
    busy = false;
    setButtonBusy(button, false, "Move to Packing");
  }
}

function currentInventoryHtml(canPostUsage) {
  const rows = activity?.current_inventory || [];
  if (!rows.length) return `<p class="muted">Packing is currently empty.</p>`;
  return rows.map((row) => `
    <div class="packing-current-row" data-packing-lot="${escapeHtml(row.internal_lot_id)}">
      <div class="packing-current-main"><strong>${escapeHtml(row.product_name || row.product_id)}</strong><span>Lot ${escapeHtml(row.supplier_lot_number || row.internal_lot_id)}</span></div>
      <div class="packing-current-qty"><strong>${formatQuantity(row.purchase_qty)} ${escapeHtml(row.purchase_unit_type || "units")}</strong><span>${formatQuantity(row.base_qty)} LB currently here</span></div>
      <div class="packing-inline-actions">
        <div class="packing-return-controls">
          <label class="packing-inline-field"><span>Return qty</span><input type="number" inputmode="decimal" min="0" max="${escapeHtml(String(row.purchase_qty))}" step="any" value="${escapeHtml(String(row.purchase_qty))}" data-pack-return-qty="${escapeHtml(row.internal_lot_id)}"></label>
          <label class="packing-inline-field packing-destination-field"><span>Return to</span><input list="packingDestinationOptions" autocomplete="off" placeholder="R12-L1-F or FLOOR-1" data-pack-destination="${escapeHtml(row.internal_lot_id)}"></label>
          <button type="button" data-pack-return="${escapeHtml(row.internal_lot_id)}">Return</button>
        </div>
        ${canPostUsage ? `<div class="packing-usage-controls"><label class="packing-inline-field"><span>Used qty</span><input type="number" inputmode="decimal" min="0" max="${escapeHtml(String(row.purchase_qty))}" step="any" placeholder="0" data-pack-use-qty="${escapeHtml(row.internal_lot_id)}"></label><button type="button" data-pack-use="${escapeHtml(row.internal_lot_id)}">Post usage</button></div>` : ""}
      </div>
    </div>`).join("");
}

function activityRowsHtml() {
  const rows = activity?.rows || [];
  if (!rows.length) return `<p class="muted">No Packing movement has been recorded today.</p>`;
  return rows.map((row) => `
    <div class="packing-history-row">
      <div><strong>${escapeHtml(row.product_name || row.product_id)}</strong><span>${escapeHtml(row.internal_lot_id)}</span></div>
      <div><small>Moved in</small><strong>${formatQuantity(row.moved_in_purchase || row.moved_in_base)} ${escapeHtml(row.purchase_unit_type || (row.moved_in_purchase ? "units" : "LB"))}</strong></div>
      <div><small>Returned</small><strong>${formatQuantity(row.returned_purchase || row.returned_base)} ${escapeHtml(row.purchase_unit_type || (row.returned_purchase ? "units" : "LB"))}</strong></div>
      <div><small>Used</small><strong>${formatQuantity(row.used_purchase || row.used_base)} ${escapeHtml(row.purchase_unit_type || (row.used_purchase ? "units" : "LB"))}</strong></div>
    </div>`).join("");
}

function bindPackingList(canPostUsage) {
  document.querySelectorAll("[data-pack-return]").forEach((button) => button.addEventListener("click", () => returnToStorage(button.dataset.packReturn, button)));
  if (canPostUsage) document.querySelectorAll("[data-pack-use]").forEach((button) => button.addEventListener("click", () => postUsage(button.dataset.packUse, button)));
}

async function returnToStorage(lotId, button) {
  if (busy) return;
  const row = (activity?.current_inventory || []).find((item) => String(item.internal_lot_id) === String(lotId));
  const destinationInput = document.querySelector(`[data-pack-destination="${cssEscape(lotId)}"]`);
  const qtyInput = document.querySelector(`[data-pack-return-qty="${cssEscape(lotId)}"]`);
  const destination = String(destinationInput?.value || "").trim().toUpperCase();
  const qty = Math.min(number(qtyInput?.value), number(row?.purchase_qty));
  if (!destination) return notice("Choose a rack or Floor location to return this product to.");
  if (!destinationLocations().some((location) => String(location.location_id || "").toUpperCase() === destination)) return notice(`${destination} is not an active return destination.`);
  if (qty <= 0) return notice("Enter an amount to return.");
  const operationKey = `PACKOUT:${lotId}:${destination}:${qty}`;
  busy = true;
  setButtonBusy(button, true, "Returning…");
  try {
    await moveInventory(ctx.user, { internal_lot_id: lotId, to_location_id: destination, purchase_qty: qty, operation_id: operationFor(operationKey, "PACKOUT"), source_screen: "PACKING" });
    clearOperation(operationKey);
    notice(`${formatQuantity(qty)} ${row?.purchase_unit_type || "units"} returned to ${destination}.`);
    await refresh();
  } catch (error) {
    notice(`${error.message} You can tap again to retry safely.`);
  } finally {
    busy = false;
    setButtonBusy(button, false, "Return");
  }
}

async function postUsage(lotId, button) {
  if (busy) return;
  const row = (activity?.current_inventory || []).find((item) => String(item.internal_lot_id) === String(lotId));
  const qtyInput = document.querySelector(`[data-pack-use-qty="${cssEscape(lotId)}"]`);
  const qty = Math.min(number(qtyInput?.value), number(row?.purchase_qty));
  if (qty <= 0) return notice("Enter the amount actually used.");
  const operationKey = `PACKUSE:${lotId}:${qty}`;
  busy = true;
  setButtonBusy(button, true, "Posting…");
  try {
    await recordPackingUsage(ctx.user, { internal_lot_id: lotId, purchase_qty: qty, operation_id: operationFor(operationKey, "PACKUSE"), notes: "Packing usage." });
    clearOperation(operationKey);
    notice(`${formatQuantity(qty)} ${row?.purchase_unit_type || "units"} posted as used.`);
    await refresh();
  } catch (error) {
    notice(`${error.message} You can tap again to retry safely.`);
  } finally {
    busy = false;
    setButtonBusy(button, false, "Post usage");
  }
}

async function refresh() {
  activity = await getPackingActivity(localTodayKey());
  const selectedProduct = document.getElementById("packingProduct")?.value || "";
  renderPage();
  if (selectedProduct) {
    document.getElementById("packingProduct").value = selectedProduct;
    await loadProductStorage(selectedProduct);
  }
}

function destinationLocations() {
  return (locations || []).filter((location) => {
    const id = String(location.location_id || "").toUpperCase();
    const type = String(location.location_type || "PALLET_RACK").toUpperCase();
    const active = location.is_active === undefined || location.is_active === true || String(location.is_active).toUpperCase() === "TRUE";
    const status = String(location.current_status || "AVAILABLE").toUpperCase();
    return active && id && id !== "PACKING" && ["PALLET_RACK", "FLOOR_STORAGE"].includes(type) && !["BLOCKED", "MAINTENANCE", "INACTIVE"].includes(status);
  });
}

function locationLabel(location) {
  const id = String(location.location_id || "");
  if (String(location.location_type || "").toUpperCase() === "FLOOR_STORAGE") return `${id} · Floor storage`;
  return id;
}

function operationFor(key, prefix) {
  if (!pendingOps.has(key)) pendingOps.set(key, newOperationId(prefix));
  return pendingOps.get(key);
}
function clearOperation(key) { pendingOps.delete(key); }
function setButtonBusy(button, isBusy, text) { if (button) { button.disabled = isBusy; button.textContent = text; } }
function localTodayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function cssEscape(value) { return globalThis.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
