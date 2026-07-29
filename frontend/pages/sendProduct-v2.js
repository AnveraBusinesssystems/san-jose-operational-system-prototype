import { getSalesOrderDetail, listSalesOrders } from "../js/api-smooth1.js?v=rack-inventory4";
import { getWarehouseCapabilities, listProductStorage, newOperationId, sendSalesOrderSelections } from "../js/warehouse-v2-api.js?v=warehouse-v2";
import { escapeHtml, formatQuantity, notice } from "../js/utils.js";
import { render as renderLegacy } from "./sendProduct.js?v=login-repair1";

const SENDABLE = new Set(["CONFIRMED", "PARTIALLY_PICKED", "PARTIAL"]);
let ctx;
let orders = [];
let detail = null;
let storageByProduct = {};
let busy = false;

export async function render(context) {
  ctx = context;
  try {
    const capabilities = await getWarehouseCapabilities();
    if (!capabilities?.sales_location_choice || capabilities?.fifo_required) throw new Error("Warehouse backend upgrade required.");
  } catch (error) {
    if (String(error.message || "").includes("backend upgrade required") || String(error.message || "").includes("Unknown action")) {
      return renderLegacy(context);
    }
    throw error;
  }

  context.setTitle("Send Product", "Choose the spaces that actually contain the product — no FIFO required");
  orders = (await listSalesOrders()).filter((order) => {
    const source = String(order.order_source || "").toUpperCase();
    return source !== "QUICKBOOKS_HISTORICAL" && SENDABLE.has(status(order.status));
  });
  context.view.innerHTML = `
    <section class="panel send-v2">
      <div class="panel-header"><div><p class="eyebrow">WAREHOUSE SALES</p><h2>Send from actual storage</h2></div><span class="status-pill">No FIFO</span></div>
      <label class="send-v2-order">Sales Order<select id="sv2Order"><option value="">Select Sales Order</option>${orders.map((order) => `<option value="${escapeHtml(order.sales_order_id)}">${escapeHtml(order.sales_order_id)} · ${escapeHtml(order.customer_name || order.customer?.supplier_name || "Customer")}</option>`).join("")}</select></label>
      <div id="sv2Workspace" class="send-v2-workspace"><p class="muted">Choose a confirmed Sales Order.</p></div>
    </section>
  `;
  document.getElementById("sv2Order")?.addEventListener("change", (event) => loadOrder(event.target.value));
}

async function loadOrder(orderId) {
  if (!orderId) {
    detail = null;
    document.getElementById("sv2Workspace").innerHTML = `<p class="muted">Choose a confirmed Sales Order.</p>`;
    return;
  }
  busy = true;
  renderLoading();
  try {
    detail = await getSalesOrderDetail(orderId);
    if (!detail) throw new Error("Sales Order was not found.");
    storageByProduct = {};
    const productIds = Array.from(new Set(openLines().map((line) => String(line.product_id)).filter(Boolean)));
    await Promise.all(productIds.map(async (productId) => {
      storageByProduct[productId] = await listProductStorage(productId);
    }));
    renderWorkspace();
  } catch (error) {
    notice(error.message);
    document.getElementById("sv2Workspace").innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  } finally {
    busy = false;
  }
}

function renderLoading() {
  const workspace = document.getElementById("sv2Workspace");
  if (workspace) workspace.innerHTML = `<div class="loading-lines"><span></span><span></span><span></span></div>`;
}

function openLines() {
  return (detail?.lines || []).filter((line) => lineRemaining(line) > 0.0001 && !["CANCELLED", "DELIVERED"].includes(status(line.line_status)));
}

function productGroups() {
  const groups = {};
  openLines().forEach((line) => {
    const productId = String(line.product_id || "");
    if (!groups[productId]) groups[productId] = { product_id: productId, product: line.product || {}, lines: [], remaining_base: 0, remaining_order_units: 0 };
    groups[productId].lines.push(line);
    groups[productId].remaining_base += remainingBase(line);
    groups[productId].remaining_order_units += lineRemaining(line);
  });
  return Object.values(groups);
}

function renderWorkspace() {
  const workspace = document.getElementById("sv2Workspace");
  if (!workspace || !detail) return;
  const groups = productGroups();
  const totalOpen = groups.reduce((sum, group) => sum + group.remaining_base, 0);
  const order = detail.order || {};
  workspace.innerHTML = `
    <div class="send-v2-header">
      <div><p class="eyebrow">${escapeHtml(order.sales_order_id)}</p><h3>${escapeHtml(order.customer_name || order.customer?.supplier_name || "Customer")}</h3></div>
      <span>${groups.length ? `${groups.length} product${groups.length === 1 ? "" : "s"} remaining` : "Complete"}</span>
    </div>
    ${groups.length ? groups.map(groupHtml).join("") : `<div class="receiving-complete"><h3>Everything has been sent</h3><p>This Sales Order has no remaining warehouse quantity.</p></div>`}
    ${groups.length ? `<div class="send-v2-footer"><span id="sv2SelectedSummary">Select storage spaces.</span><button id="sv2Send" class="primary" type="button" disabled>Send selected</button></div>` : ""}
  `;
  bindWorkspaceEvents();
  updateSelectionSummary();
}

function groupHtml(group) {
  const storage = storageByProduct[group.product_id] || [];
  const unitLabel = group.lines[0]?.unit_type || "units";
  return `
    <article class="send-product-group" data-product-group="${escapeHtml(group.product_id)}">
      <div class="send-product-title">
        <div><h3>${escapeHtml(group.product?.product_name || group.product_id)}</h3><p>Need ${formatQuantity(group.remaining_order_units)} ${escapeHtml(unitLabel)} · ${formatQuantity(group.remaining_base)} LB</p></div>
        <div class="send-group-actions"><button type="button" data-select-enough="${escapeHtml(group.product_id)}">Select enough</button><button type="button" data-select-all="${escapeHtml(group.product_id)}">Select all</button></div>
      </div>
      <div class="send-location-list">
        ${storage.length ? storage.map((row, index) => storageRowHtml(group, row, index)).join("") : `<p class="muted">No active storage space currently contains this product.</p>`}
      </div>
    </article>
  `;
}

function storageRowHtml(group, row, index) {
  const availablePurchase = number(row.purchase_qty);
  return `
    <label class="send-location-row" data-storage-row="${escapeHtml(group.product_id)}|${escapeHtml(row.internal_lot_id)}">
      <input type="checkbox" data-storage-check data-product-id="${escapeHtml(group.product_id)}" data-lot-id="${escapeHtml(row.internal_lot_id)}">
      <div class="send-location-main"><strong>${escapeHtml(row.location_id)}</strong><span>Lot ${escapeHtml(row.supplier_lot_number || row.internal_lot_id)}</span></div>
      <div class="send-location-available"><strong>${formatQuantity(availablePurchase)} ${escapeHtml(row.purchase_unit_type || "units")}</strong><span>${formatQuantity(row.base_qty)} LB available</span></div>
      <label class="send-location-qty">Take<input type="number" min="0" max="${escapeHtml(String(availablePurchase))}" step="any" value="${escapeHtml(String(availablePurchase))}" data-storage-qty data-product-id="${escapeHtml(group.product_id)}" data-lot-id="${escapeHtml(row.internal_lot_id)}"></label>
    </label>
  `;
}

function bindWorkspaceEvents() {
  document.querySelectorAll("[data-storage-check], [data-storage-qty]").forEach((element) => {
    element.addEventListener("input", updateSelectionSummary);
    element.addEventListener("change", updateSelectionSummary);
  });
  document.querySelectorAll("[data-select-enough]").forEach((button) => button.addEventListener("click", () => selectEnough(button.dataset.selectEnough)));
  document.querySelectorAll("[data-select-all]").forEach((button) => button.addEventListener("click", () => selectAll(button.dataset.selectAll)));
  document.getElementById("sv2Send")?.addEventListener("click", sendSelected);
}

function selectEnough(productId) {
  const group = productGroups().find((item) => item.product_id === productId);
  if (!group) return;
  let remainingBase = group.remaining_base;
  const storage = storageByProduct[productId] || [];
  document.querySelectorAll(`[data-storage-check][data-product-id="${cssEscape(productId)}"]`).forEach((checkbox) => checkbox.checked = false);
  storage.forEach((row) => {
    if (remainingBase <= 0.0001) return;
    const checkbox = document.querySelector(`[data-storage-check][data-product-id="${cssEscape(productId)}"][data-lot-id="${cssEscape(row.internal_lot_id)}"]`);
    const input = document.querySelector(`[data-storage-qty][data-product-id="${cssEscape(productId)}"][data-lot-id="${cssEscape(row.internal_lot_id)}"]`);
    if (!checkbox || !input) return;
    const takeBase = Math.min(number(row.base_qty), remainingBase);
    const takePurchase = row.unit_weight_lbs > 0 ? takeBase / row.unit_weight_lbs : number(row.purchase_qty);
    checkbox.checked = true;
    input.value = clean(Math.min(number(row.purchase_qty), takePurchase));
    remainingBase -= takeBase;
  });
  updateSelectionSummary();
}

function selectAll(productId) {
  document.querySelectorAll(`[data-storage-check][data-product-id="${cssEscape(productId)}"]`).forEach((checkbox) => checkbox.checked = true);
  updateSelectionSummary();
}

function selectedStorage() {
  return Array.from(document.querySelectorAll("[data-storage-check]:checked")).map((checkbox) => {
    const productId = checkbox.dataset.productId;
    const lotId = checkbox.dataset.lotId;
    const row = (storageByProduct[productId] || []).find((item) => String(item.internal_lot_id) === lotId);
    const input = document.querySelector(`[data-storage-qty][data-product-id="${cssEscape(productId)}"][data-lot-id="${cssEscape(lotId)}"]`);
    const purchaseQty = Math.min(number(input?.value), number(row?.purchase_qty));
    return row && purchaseQty > 0 ? { row, purchase_qty: purchaseQty, base_qty: purchaseQty * number(row.unit_weight_lbs) } : null;
  }).filter(Boolean);
}

function updateSelectionSummary() {
  const selected = selectedStorage();
  const button = document.getElementById("sv2Send");
  const summary = document.getElementById("sv2SelectedSummary");
  if (button) button.disabled = busy || !selected.length;
  if (summary) summary.textContent = selected.length ? `${selected.length} storage space${selected.length === 1 ? "" : "s"} selected.` : "Select storage spaces.";
}

function buildSelections() {
  const selected = selectedStorage();
  const lineQueues = {};
  productGroups().forEach((group) => {
    lineQueues[group.product_id] = group.lines.map((line) => ({ line, remaining: remainingBase(line) })).filter((item) => item.remaining > 0.0001);
  });
  const result = [];
  selected.forEach(({ row, base_qty }) => {
    let available = base_qty;
    const queue = lineQueues[row.product_id] || [];
    for (const item of queue) {
      if (available <= 0.0001) break;
      if (item.remaining <= 0.0001) continue;
      const take = Math.min(available, item.remaining);
      result.push({
        sales_order_line_id: item.line.sales_order_line_id,
        internal_lot_id: row.internal_lot_id,
        location_id: row.location_id,
        base_qty: take,
        purchase_qty: row.unit_weight_lbs > 0 ? take / row.unit_weight_lbs : 0,
        operation_id: newOperationId("SEND")
      });
      item.remaining -= take;
      available -= take;
    }
  });
  return result;
}

async function sendSelected() {
  if (busy || !detail) return;
  const selections = buildSelections();
  if (!selections.length) return notice("Select inventory to send.");
  busy = true;
  const button = document.getElementById("sv2Send");
  if (button) { button.disabled = true; button.textContent = "Sending…"; }
  try {
    await sendSalesOrderSelections(ctx.user, {
      sales_order_id: detail.order.sales_order_id,
      selections,
      operation_id: newOperationId("SENDBATCH")
    });
    notice(`${selections.length} inventory selection${selections.length === 1 ? "" : "s"} sent.`);
    await loadOrder(detail.order.sales_order_id);
    document.getElementById("sv2Order").value = detail.order.sales_order_id;
  } catch (error) {
    notice(error.message);
    busy = false;
    updateSelectionSummary();
    if (button) button.textContent = "Send selected";
    return;
  }
  busy = false;
}

function lineRemaining(line) { return Math.max(0, number(line.qty_remaining !== "" && line.qty_remaining !== undefined ? line.qty_remaining : number(line.qty_ordered) - number(line.qty_picked))); }
function remainingBase(line) { const ordered = number(line.qty_ordered); const remaining = lineRemaining(line); const requiredBase = number(line.inventory_qty_required) || ordered; return ordered > 0 ? requiredBase * remaining / ordered : requiredBase; }
function status(value) { return String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_"); }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function clean(value) { return String(Math.round(number(value) * 10000) / 10000); }
function cssEscape(value) { return globalThis.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
