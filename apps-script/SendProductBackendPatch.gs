/**
 * Send Product backend patch for apps-script/Code.gs.
 *
 * Deployment note:
 * 1) Copy this file into the same Apps Script project as Code.gs, OR paste these functions below recordInventoryMovement in Code.gs.
 * 2) Add this line inside handleApiRequest_ routes, near recordInventoryMovement:
 *      sendProduct: sendProduct,
 * 3) Deploy a new Web App version.
 *
 * This keeps Sales Orders as planning/reservation records. Inventory deducts only when
 * warehouse scans physical inventory and confirms Send Product.
 */

function sendProduct(payload) {
  payload = payload || {};
  requirePermission_(payload.user, "inventory:adjust");

  const input = payload.input || {};
  const salesOrderId = String(input.related_sales_order_id || input.sales_order_id || "").trim();
  const salesOrderLineId = String(input.sales_order_line_id || "").trim();
  const lotKey = String(input.internal_lot_id || input.lot_id || input.scan_code || "").trim();
  const qty = num_(input.qty);
  const movementType = String(input.movement_type || (salesOrderId ? "SALE" : "AMAZON_OUT")).toUpperCase();

  if (!lotKey) throw new Error("Scan the physical inventory QR before sending product.");
  if (qty <= 0) throw new Error("Quantity to send must be greater than zero.");

  const lot = readTable_("LOTS").find((item) =>
    [item.internal_lot_id, item.qr_value, item.supplier_lot_number].map(String).indexOf(lotKey) >= 0
  );
  if (!lot) throw new Error("Scanned lot was not found.");

  let line = null;
  let pickTask = null;
  if (salesOrderId) {
    const order = readTable_("SALES_ORDERS").find((item) => String(item.sales_order_id) === salesOrderId);
    if (!order) throw new Error("Sales Order was not found.");

    const lines = readTable_("SALES_ORDER_LINES").filter((item) => String(item.sales_order_id) === salesOrderId);
    line = salesOrderLineId
      ? lines.find((item) => String(item.sales_order_line_id) === salesOrderLineId)
      : lines.find((item) => String(item.product_id) === String(lot.product_id) && String(item.preferred_internal_lot_id) === String(lot.internal_lot_id));

    if (!line) throw new Error("The scanned lot is not assigned to this Sales Order.");
    if (String(line.product_id) !== String(lot.product_id)) throw new Error("Scanned product does not match the Sales Order line.");
    if (String(line.preferred_internal_lot_id) !== String(lot.internal_lot_id)) throw new Error("Scanned lot does not match the recommended Sales Order lot.");

    pickTask = readTable_("PICK_TASKS").find((task) => String(task.sales_order_line_id) === String(line.sales_order_line_id));
  }

  const movement = recordInventoryMovement({
    user: payload.user,
    input: {
      internal_lot_id: lot.internal_lot_id,
      qty: qty,
      unit_type: input.unit_type || lot.unit_type || "LB",
      movement_type: movementType,
      location_id: input.location_id || lot.current_location_id || "",
      related_sales_order_id: salesOrderId,
      related_pick_task_id: pickTask ? pickTask.pick_task_id : input.related_pick_task_id || "",
      related_amazon_order_id: input.related_amazon_order_id || "",
      package_id: input.package_id || "",
      notes: input.notes || "Send Product scan."
    }
  });

  if (salesOrderId && line) {
    updateSalesOrderProgressAfterSend_(salesOrderId, line, pickTask, qty);
  }

  buildSystemBundle_(true);
  return {
    movement: movement,
    salesOrder: salesOrderId ? getSalesOrderDetail({ salesOrderId: salesOrderId }) : null
  };
}

function updateSalesOrderProgressAfterSend_(salesOrderId, line, pickTask, qtySentBase) {
  const requiredBase = num_(line.inventory_qty_required, line.qty_ordered);
  const orderedSalesQty = num_(line.qty_ordered);
  const salesQtySent = requiredBase > 0 ? qtySentBase / requiredBase * orderedSalesQty : qtySentBase;
  const previousPicked = num_(line.qty_picked);
  const newPicked = Math.min(orderedSalesQty, round_(previousPicked + salesQtySent, 4));
  const remaining = Math.max(0, round_(orderedSalesQty - newPicked, 4));
  const lineStatus = remaining <= 0.0001 ? "PICKED" : "PARTIALLY_PICKED";

  updateTableRecord_("SALES_ORDER_LINES", "sales_order_line_id", line.sales_order_line_id, {
    qty_picked: newPicked,
    qty_remaining: remaining,
    line_status: lineStatus
  });

  if (pickTask) {
    const previousTaskPicked = num_(pickTask.qty_picked);
    const taskPicked = Math.min(num_(pickTask.qty_to_pick, orderedSalesQty), round_(previousTaskPicked + salesQtySent, 4));
    updateTableRecord_("PICK_TASKS", "pick_task_id", pickTask.pick_task_id, {
      qty_picked: taskPicked,
      pick_status: lineStatus,
      picked_at: nowIso_(),
      scan_code: line.preferred_internal_lot_id,
      reservation_status: remaining <= 0.0001 ? "PICKED" : "RESERVED"
    });
  }

  const freshLines = readTable_("SALES_ORDER_LINES").filter((item) => String(item.sales_order_id) === salesOrderId);
  const allPicked = freshLines.length > 0 && freshLines.every((item) => num_(item.qty_remaining) <= 0.0001 || String(item.line_status).toUpperCase() === "PICKED");
  const anyPicked = freshLines.some((item) => num_(item.qty_picked) > 0 || ["PICKED", "PARTIALLY_PICKED"].indexOf(String(item.line_status).toUpperCase()) >= 0);

  updateTableRecord_("SALES_ORDERS", "sales_order_id", salesOrderId, {
    status: allPicked ? "PICKED" : anyPicked ? "PARTIALLY_PICKED" : "CONFIRMED",
    picked_at: anyPicked ? nowIso_() : "",
    updated_at: nowIso_()
  });
}
