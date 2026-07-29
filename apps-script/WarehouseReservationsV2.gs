// WarehouseReservationsV2.gs
// Compatibility layer while legacy Sales Orders still create location-specific reservations.
// Workers are free to choose physical inventory, but one Sales Order cannot consume stock
// reserved by another open Sales Order.

function warehouseReservedByOtherOrdersV2_(salesOrderId) {
  const result = {};
  const lineMap = byId_(readTable_("SALES_ORDER_LINES"), "sales_order_line_id");
  readTable_("PICK_TASKS").forEach((task) => {
    if (String(task.reservation_status || "").toUpperCase() !== "RESERVED") return;
    if (String(task.sales_order_id || "") === String(salesOrderId || "")) return;
    const line = lineMap[task.sales_order_line_id] || {};
    const productId = String(task.product_id || line.product_id || "");
    const lotId = String(task.recommended_internal_lot_id || line.preferred_internal_lot_id || "");
    const locationId = String(task.recommended_location_id || line.preferred_location_id || "");
    if (!productId || !lotId || !locationId) return;
    const key = [productId, lotId, locationId].join("|");
    const remainingBase = line.sales_order_line_id
      ? remainingBaseQtyV2_(line)
      : Math.max(0, number_(task.qty_to_pick_base, task.qty_to_pick) - number_(task.qty_picked, 0));
    result[key] = number_(result[key], 0) + remainingBase;
  });
  return result;
}

function listProductStorageSafe(payload) {
  payload = payload || {};
  const productId = String(payload.product_id || (payload.input || {}).product_id || "").trim();
  const salesOrderId = String(payload.sales_order_id || (payload.input || {}).sales_order_id || "").trim();
  if (!productId) return [];
  const otherReserved = warehouseReservedByOtherOrdersV2_(salesOrderId);
  return listProductStorage({ product_id: productId }).map((row) => {
    const key = [row.product_id, row.internal_lot_id, row.location_id].join("|");
    const reservedByOthers = number_(otherReserved[key], 0);
    const availableBase = Math.max(0, number_(row.base_qty, 0) - reservedByOthers);
    const unitWeight = number_(row.unit_weight_lbs, 0);
    return {
      ...row,
      reserved_by_other_orders_base: reservedByOthers,
      base_qty: availableBase,
      purchase_qty: unitWeight > 0 ? availableBase / unitWeight : 0
    };
  }).filter((row) => number_(row.base_qty, 0) > 0.0001);
}

function validateWarehouseSalesReservationsV2_(salesOrderId, selections) {
  const otherReserved = warehouseReservedByOtherOrdersV2_(salesOrderId);
  const lots = byId_(readTable_("LOTS"), "internal_lot_id");
  const requestedByKey = {};
  (selections || []).forEach((selection, index) => {
    const lot = lots[String(selection.internal_lot_id || "")];
    if (!lot) throw new Error(`Selection ${index + 1}: inventory lot was not found.`);
    const currentLocation = String(lot.current_location_id || "");
    if (selection.location_id && String(selection.location_id) !== currentLocation) {
      throw new Error(`Selection ${index + 1}: ${lot.internal_lot_id} is no longer stored in ${selection.location_id}.`);
    }
    const unitWeight = lotUnitWeightV2_(lot);
    const baseQty = selection.base_qty !== undefined
      ? number_(selection.base_qty, 0)
      : number_(selection.purchase_qty, 0) * unitWeight;
    const key = [lot.product_id, lot.internal_lot_id, currentLocation].join("|");
    requestedByKey[key] = number_(requestedByKey[key], 0) + baseQty;
  });
  Object.keys(requestedByKey).forEach((key) => {
    const parts = key.split("|");
    const lot = lots[parts[1]];
    const current = warehouseActiveLotQtyV2_(lot);
    const protectedQty = number_(otherReserved[key], 0);
    const available = Math.max(0, current - protectedQty);
    if (requestedByKey[key] > available + 0.0001) {
      throw new Error(`Selected inventory is reserved by another open Sales Order. Available here: ${available} ${lot.unit_type || "LB"}.`);
    }
  });
}

function sendSalesOrderSelectionsSafe(payload) {
  return sendSalesOrderSelections(payload || {});
}

function warehouseSalesSelectionOperationIdV2_(input, selection, index) {
  return warehouseOperationIdV2_(
    (selection || {}).operation_id || `${(input || {}).operation_id || "SEND"}-${index + 1}`,
    "SEND"
  );
}
