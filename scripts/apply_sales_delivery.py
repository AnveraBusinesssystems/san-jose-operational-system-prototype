from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"Missing expected anchor: {label}")
    return text.replace(old, new, 1)


code_path = Path("apps-script/Code.gs")
code = code_path.read_text()
code = replace_once(code, 'const BACKEND_VERSION = "sales-orders-v2-2026-07-10";', 'const BACKEND_VERSION = "sales-orders-delivery-v1-2026-07-14";', "backend version")
code = replace_once(code, '  MANAGER: [\n    "salesOrders:send",', '  MANAGER: [\n    "salesOrders:actions",\n    "salesOrders:send",', "manager action permission")
code = replace_once(code, '"confirmed_at", "picked_at", "shipped_at", "bl_folio", "shipping_address"]', '"confirmed_at", "picked_at", "shipped_at", "delivered_at", "delivered_by", "delivery_notes", "bl_folio", "shipping_address"]', "delivery schema")
code = replace_once(code, '      salesOrderAction,\n      receiveProduct,', '      salesOrderAction,\n      deliverSalesOrder,\n      receiveProduct,', "delivery route")
code = replace_once(code, '      shipped_at: "",\n      bl_folio:', '      shipped_at: "",\n      delivered_at: "",\n      delivered_by: "",\n      delivery_notes: "",\n      bl_folio:', "new order delivery fields")
code = replace_once(code, '  if (normalizeRole_(user.role) !== "ADMIN") throw new Error("Only an Admin can change Sales Order status.");', '  if (!["ADMIN", "MANAGER"].includes(normalizeRole_(user.role))) throw new Error("Only an Admin or Manager can change Sales Order status.");', "status role")

anchor = '\n\nfunction confirmSalesOrder_(salesOrderId, user) {'
delivery_backend = r'''

function deliverSalesOrder(payload) {
  payload = payload || {};
  const user = payload.user || {};
  if (!["ADMIN", "MANAGER"].includes(normalizeRole_(user.role))) {
    throw new Error("Only an Admin or Manager can confirm delivery.");
  }
  const input = payload.input || payload;
  const salesOrderId = String(input.sales_order_id || input.salesOrderId || "").trim();
  const requestedLines = Array.isArray(input.lines) ? input.lines : [];
  if (!salesOrderId) throw new Error("Choose a Sales Order.");

  return withScriptLock_(function () {
    ensureTableColumns_("SALES_ORDERS", CORE_SCHEMA.SALES_ORDERS);
    const detail = getSalesOrderDetail({ sales_order_id: salesOrderId });
    if (!detail) throw new Error("Sales Order was not found.");
    const current = String(detail.order.status || "DRAFT").toUpperCase();
    if (current === "DELIVERED") throw new Error("This Sales Order is already delivered.");
    if (current === "CANCELLED") throw new Error("A cancelled Sales Order cannot be delivered.");
    if (!["CONFIRMED", "PARTIALLY_PICKED", "PICKED", "SHIPPED"].includes(current)) {
      throw new Error("Confirm the Sales Order before marking it delivered.");
    }

    const requestedById = requestedLines.reduce((map, line) => {
      map[String(line.sales_order_line_id || "")] = line;
      return map;
    }, {});
    const lots = byId_(readTable_("LOTS"), "internal_lot_id");
    const planned = [];
    const requiredByLot = {};

    detail.lines.forEach((line, index) => {
      const remainingBase = remainingBaseQtyV2_(line);
      if (remainingBase <= 0.0001) return;
      const requested = requestedById[String(line.sales_order_line_id)] || {};
      const lotId = String(requested.internal_lot_id || line.preferred_internal_lot_id || "");
      const locationId = String(requested.location_id || line.preferred_location_id || "");
      const lot = lots[lotId];
      if (!lot) throw new Error(`Line ${index + 1}: selected lot was not found.`);
      if (String(lot.product_id) !== String(line.product_id)) throw new Error(`Line ${index + 1}: selected lot belongs to another product.`);
      if (!['ACTIVE', 'AVAILABLE'].includes(String(lot.status || 'ACTIVE').toUpperCase())) throw new Error(`Line ${index + 1}: selected lot is not active.`);
      if (String(lot.current_location_id || "") !== locationId) throw new Error(`Line ${index + 1}: selected lot is not stored in ${locationId}.`);
      const key = lotId;
      requiredByLot[key] = number_(requiredByLot[key], 0) + remainingBase;
      planned.push({ line, lot, lotId, locationId, remainingBase });
    });

    Object.keys(requiredByLot).forEach((lotId) => {
      const lot = lots[lotId];
      const currentQty = number_(lot.current_qty_script !== "" && lot.current_qty_script !== undefined ? lot.current_qty_script : lot.original_qty, 0);
      if (requiredByLot[lotId] > currentQty + 0.0001) {
        throw new Error(`Not enough inventory in lot ${lotId}. Available ${currentQty}; required ${requiredByLot[lotId]}.`);
      }
    });

    planned.forEach((item) => {
      updateTableRecord_("SALES_ORDER_LINES", "sales_order_line_id", item.line.sales_order_line_id, {
        preferred_internal_lot_id: item.lotId,
        preferred_location_id: item.locationId,
        fefo_status: item.lotId === String(item.line.preferred_internal_lot_id) && item.locationId === String(item.line.preferred_location_id) ? item.line.fefo_status || "RECOMMENDED" : "OVERRIDE"
      });
      const task = detail.pickTasks.find((row) => String(row.sales_order_line_id) === String(item.line.sales_order_line_id));
      if (task) {
        updateTableRecord_("PICK_TASKS", "pick_task_id", task.pick_task_id, {
          recommended_internal_lot_id: item.lotId,
          recommended_location_id: item.locationId
        });
      }
      recordInventoryMovementInternal_(user, {
        movement_type: "SALE",
        internal_lot_id: item.lotId,
        qty: item.remainingBase,
        unit_type: item.line.inventory_unit_type || item.lot.unit_type || "LB",
        location_id: item.locationId,
        related_sales_order_id: salesOrderId,
        related_pick_task_id: task ? task.pick_task_id : "",
        sales_order_line_id: item.line.sales_order_line_id,
        notes: `Delivery confirmed for ${salesOrderId}.`
      });
    });

    detail.lines.forEach((line) => updateTableRecord_("SALES_ORDER_LINES", "sales_order_line_id", line.sales_order_line_id, {
      line_status: "DELIVERED",
      qty_remaining: 0
    }));
    detail.pickTasks.forEach((task) => updateTableRecord_("PICK_TASKS", "pick_task_id", task.pick_task_id, {
      pick_status: "DELIVERED",
      reservation_status: "RELEASED"
    }));
    updateTableRecord_("SALES_ORDERS", "sales_order_id", salesOrderId, {
      status: "DELIVERED",
      delivered_at: today_(),
      delivered_by: user.user_id || user.role,
      delivery_notes: String(input.delivery_notes || ""),
      updated_at: today_()
    });
    writeAuditLog_({ user_id: user.user_id, role: user.role, action_type: "DELIVER_SALES_ORDER", table_name: "SALES_ORDERS", record_id: salesOrderId, notes: String(input.delivery_notes || "") });
    return getSalesOrderDetail({ sales_order_id: salesOrderId });
  });
}
'''
code = replace_once(code, anchor, delivery_backend + anchor, "delivery backend insertion")
code_path.write_text(code)

api_path = Path("frontend/js/api.js")
api = api_path.read_text()
api_anchor = '\nexport async function salesOrderAction(user, salesOrderId, action) {'
local_delivery = r'''

export async function deliverSalesOrder(user, input) {
  if (useAppsScript()) return callAppsScript("deliverSalesOrder", { user, input });
  requirePermission(user, "salesOrders:actions");
  const data = await db();
  data.salesOrders ||= [];
  data.salesOrderLines ||= [];
  data.inventoryMovements ||= [];
  const salesOrderId = String(input.sales_order_id || input.salesOrderId || "");
  const order = data.salesOrders.find((item) => item.sales_order_id === salesOrderId);
  if (!order) throw new Error("Sales Order was not found.");
  if (String(order.status).toUpperCase() === "DELIVERED") throw new Error("This Sales Order is already delivered.");
  const requested = new Map((input.lines || []).map((line) => [line.sales_order_line_id, line]));
  const lines = data.salesOrderLines.filter((line) => line.sales_order_id === salesOrderId);
  const plans = lines.map((line) => {
    const selected = requested.get(line.sales_order_line_id) || {};
    const lotId = selected.internal_lot_id || line.preferred_internal_lot_id;
    const locationId = selected.location_id || line.preferred_location_id;
    const lot = data.lots.find((item) => item.internal_lot_id === lotId);
    const remaining = numberValue(line.qty_remaining, line.qty_ordered);
    const required = numberValue(line.inventory_qty_required, line.qty_ordered) * (numberValue(line.qty_ordered) ? remaining / numberValue(line.qty_ordered) : 1);
    if (required > 0 && (!lot || lot.product_id !== line.product_id || lot.current_location_id !== locationId)) throw new Error("Review the selected lot and warehouse space.");
    if (required > numberValue(lot?.current_qty_script, lot?.original_qty) + 0.0001) throw new Error(`Not enough inventory in ${lotId}.`);
    return { line, lot, lotId, locationId, required };
  });
  plans.forEach(({ line, lot, lotId, locationId, required }) => {
    if (required > 0) {
      lot.current_qty_script = Math.max(0, numberValue(lot.current_qty_script, lot.original_qty) - required);
      data.inventoryMovements.push({ movement_id: uid("MOV", data.inventoryMovements, "movement_id"), movement_type: "SALE", timestamp: new Date().toISOString(), user_id: user.user_id || user.role, product_id: line.product_id, internal_lot_id: lotId, qty_change: -required, unit_type: line.inventory_unit_type || "LB", from_location_id: locationId, to_location_id: "OUTBOUND", related_sales_order_id: salesOrderId, notes: `Delivery confirmed for ${salesOrderId}.` });
    }
    line.preferred_internal_lot_id = lotId;
    line.preferred_location_id = locationId;
    line.qty_picked = line.qty_ordered;
    line.qty_remaining = 0;
    line.line_status = "DELIVERED";
  });
  order.status = "DELIVERED";
  order.delivered_at = new Date().toISOString();
  order.delivered_by = user.user_id || user.role;
  order.delivery_notes = input.delivery_notes || "";
  order.updated_at = new Date().toISOString();
  save();
  return getSalesOrderDetail(salesOrderId);
}
'''
api = replace_once(api, api_anchor, local_delivery + api_anchor, "frontend API delivery")
api_path.write_text(api)

smooth_path = Path("frontend/js/api-smooth1.js")
smooth = smooth_path.read_text()
smooth_anchor = '\nexport async function salesOrderAction(user, salesOrderId, action) {'
smooth_delivery = '\nexport async function deliverSalesOrder(user, input) {\n  return mutate(() => base.deliverSalesOrder(user, input));\n}\n'
smooth = replace_once(smooth, smooth_anchor, smooth_delivery + smooth_anchor, "smooth API delivery")
smooth_path.write_text(smooth)

sales_path = Path("frontend/pages/salesOrders.js")
sales = sales_path.read_text()
sales = replace_once(sales, '  createSalesOrder,\n  getSalesOrderDetail,', '  createSalesOrder,\n  deliverSalesOrder,\n  getSalesOrderDetail,', "sales import")
sales = replace_once(sales, '  setupSalesOrderActions(ctx);', '  setupSalesOrderActions(ctx, inventoryRows);', "action setup args")
sales = replace_once(sales, 'function setupSalesOrderActions(ctx) {', 'function setupSalesOrderActions(ctx, inventoryRows) {', "action function args")
sales = replace_once(sales, '      if (["blSjp", "pickList"].includes(salesAction)) {', '      if (salesAction === "DELIVER") {\n        await openDeliveryReview(ctx, salesOrderId, inventoryRows);\n        return;\n      }\n      if (["blSjp", "pickList"].includes(salesAction)) {', "delivery click")
sales = replace_once(sales, '      ${orderStatus === "CONFIRMED" ? actionButton(order, "PICKED", "Mark Picked") : ""}\n      ${!operator && orderStatus === "PICKED" ? actionButton(order, "SHIPPED", "Mark Shipped") : ""}', '      ${!operator && ["CONFIRMED", "PARTIALLY_PICKED", "PICKED", "SHIPPED"].includes(orderStatus) ? actionButton(order, "DELIVER", "Mark Delivered") : ""}\n      ${orderStatus === "DELIVERED" ? `<span class="status">Delivered ✓</span>` : ""}', "delivery button")
modal_anchor = '\nexport function printableBillOfLading(detail) {'
modal_code = r'''

async function openDeliveryReview(ctx, salesOrderId, inventoryRows) {
  try {
    const detail = await getSalesOrderDetail(salesOrderId);
    if (!detail) throw new Error("Sales Order was not found.");
    const physicalChoices = inventoryRows.filter((row) => Number(row.current_qty ?? row.qty ?? 0) > 0);
    const overlay = document.createElement("div");
    overlay.className = "delivery-review-overlay";
    overlay.innerHTML = `
      <style>
        .delivery-review-overlay{position:fixed;inset:0;z-index:1000;background:rgba(15,24,19,.62);display:grid;place-items:center;padding:18px}.delivery-review-dialog{width:min(760px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.3);padding:22px}.delivery-review-head{display:flex;justify-content:space-between;gap:16px;align-items:start}.delivery-review-head h2{margin:0}.delivery-review-copy{margin:8px 0 18px}.delivery-review-line{display:grid;grid-template-columns:minmax(160px,1fr) minmax(240px,1.5fr);gap:12px;padding:14px 0;border-top:1px solid #dce5df}.delivery-review-product strong,.delivery-review-product small{display:block}.delivery-review-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.delivery-review-close{border:0;background:transparent;font-size:26px;cursor:pointer}@media(max-width:640px){.delivery-review-dialog{padding:17px}.delivery-review-line{grid-template-columns:1fr}.delivery-review-actions .btn{flex:1}}
      </style>
      <section class="delivery-review-dialog" role="dialog" aria-modal="true" aria-labelledby="deliveryReviewTitle">
        <div class="delivery-review-head"><div><h2 id="deliveryReviewTitle">Confirm Delivery — ${escapeHtml(salesOrderId)}</h2><p class="muted delivery-review-copy">Review the products, lots, and warehouse spaces. Change a selection only when it is incorrect, then confirm once.</p></div><button class="delivery-review-close" type="button" aria-label="Close">&times;</button></div>
        <form id="deliveryReviewForm">
          <div>${detail.lines.map((line, index) => deliveryReviewLine(line, index, physicalChoices)).join("")}</div>
          <div class="field"><label>Delivery Notes</label><textarea name="delivery_notes" placeholder="Optional"></textarea></div>
          <div class="delivery-review-actions"><button class="btn secondary" data-close-delivery type="button">Cancel</button><button class="btn" type="submit">Confirm Delivered</button></div>
        </form>
      </section>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector(".delivery-review-close").addEventListener("click", close);
    overlay.querySelector("[data-close-delivery]").addEventListener("click", close);
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    overlay.querySelector("#deliveryReviewForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.submitter;
      button.disabled = true;
      button.textContent = "Confirming...";
      try {
        const lines = [...overlay.querySelectorAll("[data-delivery-line]")].map((row) => {
          const selected = row.querySelector("select").selectedOptions[0];
          return { sales_order_line_id: row.dataset.deliveryLine, internal_lot_id: selected.dataset.lotId, location_id: selected.dataset.locationId };
        });
        await deliverSalesOrder(ctx.user, { sales_order_id: salesOrderId, delivery_notes: event.currentTarget.elements.delivery_notes.value.trim(), lines });
        close();
        notice(`${salesOrderId} marked delivered and inventory updated.`);
        await render(ctx);
      } catch (error) {
        notice(error.message);
        button.disabled = false;
        button.textContent = "Confirm Delivered";
      }
    });
  } catch (error) {
    notice(error.message);
  }
}

function deliveryReviewLine(line, index, rows) {
  const remaining = Number(line.qty_remaining ?? line.qty_ordered ?? 0);
  const candidates = rows.filter((row) => String(row.product_id) === String(line.product_id));
  const options = candidates.map((row) => {
    const lotId = String(row.internal_lot_id || row.lot?.internal_lot_id || "");
    const locationId = String(row.location_id || row.lot?.current_location_id || "");
    const selected = lotId === String(line.preferred_internal_lot_id || "") && locationId === String(line.preferred_location_id || "");
    const available = Number(row.current_qty ?? row.qty ?? 0);
    return `<option value="${escapeHtml(`${lotId}|${locationId}`)}" data-lot-id="${escapeHtml(lotId)}" data-location-id="${escapeHtml(locationId)}" ${selected ? "selected" : ""}>${escapeHtml(lotId)} · ${escapeHtml(locationId)} · ${escapeHtml(formatNumber(available))} ${escapeHtml(row.unit_type || "LB")} physically available</option>`;
  }).join("");
  return `<div class="delivery-review-line" data-delivery-line="${escapeHtml(line.sales_order_line_id)}"><div class="delivery-review-product"><strong>${escapeHtml(line.product?.product_name || line.product_id)}</strong><small>${escapeHtml(formatNumber(line.qty_ordered))} ${escapeHtml(line.unit_type)} · ${escapeHtml(formatNumber(line.inventory_qty_required || 0))} ${escapeHtml(line.inventory_unit_type || "LB")}</small><small>${remaining <= 0.0001 ? "Inventory already deducted; confirmation will not deduct again." : "Inventory will be deducted when confirmed."}</small></div><div class="field"><label>Lot / Warehouse Space</label><select required>${options || `<option value="">No active inventory found</option>`}</select></div></div>`;
}
'''
sales = replace_once(sales, modal_anchor, modal_code + modal_anchor, "delivery modal")
sales_path.write_text(sales)

print("Sales delivery flow patched successfully.")
