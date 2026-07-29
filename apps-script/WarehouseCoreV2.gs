// WarehouseCoreV2.gs
// Clean warehouse workflow layered on top of the existing sheet helpers in Code.gs.
// Inventory rule: INVENTORY_MOVEMENTS is the immutable event history; LOTS is current state.

const WAREHOUSE_V2_VERSION = "warehouse-v2-2026-07-29";
const RECEIVING_PLACEMENT_SCHEMA_V2 = [
  "placement_id", "receiving_id", "po_id", "po_line_id", "product_id",
  "internal_lot_id", "supplier_lot_number", "location_id", "purchase_qty",
  "purchase_unit_type", "unit_weight_lbs", "base_qty", "operation_id",
  "placed_by", "placed_at", "notes"
];

function getWarehouseCapabilities() {
  return {
    version: WAREHOUSE_V2_VERSION,
    receiving_sessions: true,
    manual_putaway: true,
    sales_location_choice: true,
    fifo_required: false,
    packing: true,
    floor_storage: true,
    idempotency: true
  };
}

function warehouseOperationIdV2_(value, prefix) {
  const supplied = String(value || "").trim();
  if (supplied) return supplied;
  return `${prefix || "OP"}-${Utilities.getUuid()}`;
}

function warehouseFindByOperationV2_(sheetName, operationId) {
  const key = String(operationId || "").trim();
  if (!key) return null;
  try {
    return readTable_(sheetName).find((row) => String(row.operation_id || "").trim() === key) || null;
  } catch (_error) {
    return null;
  }
}

function warehouseActiveLotQtyV2_(lot) {
  if (!lot) return 0;
  return number_(lot.current_qty_script !== "" && lot.current_qty_script !== undefined ? lot.current_qty_script : lot.original_qty, 0);
}

function warehouseActiveLotsV2_() {
  return readTable_("LOTS").filter((lot) => {
    const status = String(lot.status || "ACTIVE").trim().toUpperCase();
    return warehouseActiveLotQtyV2_(lot) > 0.0001 && ["ACTIVE", "AVAILABLE", "HOLD"].includes(status);
  });
}

function warehouseLocationIsMultiV2_(location) {
  const type = String((location || {}).location_type || "").trim().toUpperCase();
  return type === "FLOOR_STORAGE" || type === "PACKING_AREA";
}

function warehouseValidateDestinationV2_(locationId, productId, options) {
  options = options || {};
  const location = readTable_("LOCATIONS").find((row) => String(row.location_id || "") === String(locationId || ""));
  if (!location || !isActiveRecord_(location)) throw new Error(`Location ${locationId} was not found or is inactive.`);
  const hardBlock = locationHardBlockReason_(location);
  if (hardBlock) throw new Error(`Location ${locationId} is unavailable (${hardBlock}).`);
  const product = readTable_("PRODUCTS").find((row) => String(row.product_id || "") === String(productId || "")) || {};
  if (!locationAllowsProduct_(location, product)) throw new Error(`Location ${locationId} does not allow this product.`);
  if (!warehouseLocationIsMultiV2_(location)) {
    const occupied = warehouseActiveLotsV2_().filter((lot) => String(lot.current_location_id || "") === String(locationId));
    const allowedLotId = String(options.allow_lot_id || "");
    const conflicts = occupied.filter((lot) => !allowedLotId || String(lot.internal_lot_id) !== allowedLotId);
    if (conflicts.length) throw new Error(`Rack space ${locationId} already contains inventory.`);
  }
  return location;
}

function warehouseAppendMovementV2_(user, input) {
  ensureTableColumns_("INVENTORY_MOVEMENTS", [
    "operation_id", "purchase_qty_change", "purchase_unit_type", "source_screen"
  ]);
  const operationId = warehouseOperationIdV2_(input.operation_id, "MOVOP");
  const existing = warehouseFindByOperationV2_("INVENTORY_MOVEMENTS", operationId);
  if (existing) return { ...existing, duplicate_request: true };
  const movement = {
    movement_id: nextId_("INVENTORY_MOVEMENTS", "movement_id", "MOV"),
    movement_type: String(input.movement_type || "ADJUSTMENT").toUpperCase(),
    timestamp: today_(),
    user_id: user.user_id || user.role || "SYSTEM",
    product_id: input.product_id || "",
    internal_lot_id: input.internal_lot_id || "",
    package_id: input.package_id || "",
    qty_change: number_(input.qty_change, 0),
    unit_type: input.unit_type || "LB",
    from_location_id: input.from_location_id || "",
    to_location_id: input.to_location_id || "",
    related_po_id: input.related_po_id || "",
    related_receiving_id: input.related_receiving_id || "",
    related_sales_order_id: input.related_sales_order_id || "",
    related_pick_task_id: input.related_pick_task_id || "",
    related_amazon_order_id: input.related_amazon_order_id || "",
    scan_code: input.scan_code || input.internal_lot_id || "",
    device_id: input.device_id || "WEB_APP",
    approval_status: input.approval_status || "APPROVED",
    notes: input.notes || "",
    operation_id: operationId,
    purchase_qty_change: input.purchase_qty_change !== undefined ? number_(input.purchase_qty_change, 0) : "",
    purchase_unit_type: input.purchase_unit_type || "",
    source_screen: input.source_screen || "WAREHOUSE_V2"
  };
  const writeInfo = appendRecord_("INVENTORY_MOVEMENTS", movement);
  return { ...movement, _write_info: writeInfo };
}

function startReceivingSession(payload) {
  payload = payload || {};
  const user = payload.user || {};
  requirePermission_(user, "receiving:create");
  const input = payload.input || payload;
  return withScriptLock_(function () {
    ensureTableColumns_("RECEIVING", [
      "cases_per_space", "spaces_required", "spaces_completed", "receiving_status", "operation_id", "updated_at"
    ]);
    ensureTableColumns_("RECEIVING_PLACEMENTS", RECEIVING_PLACEMENT_SCHEMA_V2);
    const operationId = warehouseOperationIdV2_(input.operation_id, "RCVSTART");
    const duplicate = warehouseFindByOperationV2_("RECEIVING", operationId);
    if (duplicate) return getReceivingSession({ receiving_id: duplicate.receiving_id });

    const poLineId = String(input.po_line_id || "").trim();
    const line = readTable_("PURCHASE_ORDER_LINES").find((row) => String(row.po_line_id || "") === poLineId);
    if (!line) throw new Error("Choose a valid Purchase Order product line.");
    const po = readTable_("PURCHASE_ORDERS").find((row) => String(row.po_id || "") === String(line.po_id || ""));
    if (!po) throw new Error("Purchase Order was not found.");
    const poStatus = normalizePurchaseOrderStatus_(po.po_status);
    if (["CANCELLED", "COMPLETE"].includes(poStatus)) throw new Error(`This Purchase Order cannot be received in ${poStatus} status.`);

    const products = byId_(readTable_("PRODUCTS"), "product_id");
    const product = products[line.product_id] || {};
    const unitWeight = resolvePurchaseUnitWeight_(line, product);
    if (!(unitWeight > 0)) throw new Error("This PO line is missing a valid weight per purchase unit.");

    const qtyReceived = number_(input.qty_received, 0);
    const qtyDamaged = number_(input.qty_damaged, 0);
    const qtyAccepted = Math.max(0, qtyReceived - qtyDamaged);
    if (qtyReceived <= 0) throw new Error("Received quantity must be greater than zero.");
    if (qtyDamaged < 0 || qtyDamaged > qtyReceived) throw new Error("Damaged quantity cannot exceed quantity received.");
    if (qtyAccepted <= 0) throw new Error("Use the rejected-delivery workflow when no inventory is accepted.");

    const remaining = Math.max(0, number_(line.qty_remaining, number_(line.qty_ordered, 0) - number_(line.qty_received_total, 0)));
    if (qtyAccepted > remaining + 0.0001) {
      const role = normalizeRole_(user.role);
      if (!isTruthy_(input.allow_over_receipt) || !["ADMIN", "MANAGER"].includes(role)) {
        throw new Error(`Accepted quantity exceeds the remaining PO quantity by ${qtyAccepted - remaining}.`);
      }
    }

    const supplierLot = String(input.supplier_lot_number || "").trim();
    if (!supplierLot) throw new Error("Supplier lot number is required.");
    const casesPerSpace = number_(input.cases_per_space !== undefined ? input.cases_per_space : input.units_per_space, 0);
    if (!(casesPerSpace > 0)) throw new Error("Enter cases/units per space.");
    const spacesRequired = Math.ceil(qtyAccepted / casesPerSpace - 1e-9);
    const receivingId = nextId_("RECEIVING", "receiving_id", "RCV");
    const now = today_();
    const row = {
      receiving_id: receivingId,
      po_id: line.po_id,
      po_line_id: poLineId,
      supplier_id: line.supplier_id,
      product_id: line.product_id,
      scan_code: input.scan_code || poLineId,
      internal_lot_id: "",
      supplier_lot_number: supplierLot,
      received_date: now,
      received_by: user.user_id || user.role,
      qty_received: qtyReceived,
      qty_damaged: qtyDamaged,
      qty_accepted: qtyAccepted,
      unit_type: line.unit_type,
      quality_score: input.quality_score || 5,
      product_accuracy_score: input.product_accuracy_score || "",
      over_under_status: qtyAccepted > remaining + 0.0001 ? "OVER" : qtyAccepted < remaining - 0.0001 ? "UNDER" : "MATCH",
      recommended_location_id: "",
      confirmed_location_id: "",
      requires_supervisor_approval: false,
      approval_status: "APPROVED",
      notes: input.notes || "",
      base_unit: line.base_unit || product.base_unit || "LB",
      units_per_purchase_unit: unitWeight,
      qty_accepted_base: qtyAccepted * unitWeight,
      pallet_count: spacesRequired,
      quality_status: String(input.quality_status || "PASS").toUpperCase(),
      cases_per_space: casesPerSpace,
      spaces_required: spacesRequired,
      spaces_completed: 0,
      receiving_status: "IN_PROGRESS",
      operation_id: operationId,
      updated_at: now
    };
    appendRecord_("RECEIVING", row);
    writeAuditLog_({ user_id: user.user_id, role: user.role, action_type: "START_RECEIVING_SESSION", table_name: "RECEIVING", record_id: receivingId, source_screen: "RECEIVING_V2" });
    return getReceivingSession({ receiving_id: receivingId });
  });
}

function getReceivingSession(payload) {
  payload = payload || {};
  const receivingId = String(payload.receiving_id || payload.receivingId || "").trim();
  if (!receivingId) return null;
  const receiving = readTable_("RECEIVING").find((row) => String(row.receiving_id || "") === receivingId);
  if (!receiving) return null;
  const placements = readTable_("RECEIVING_PLACEMENTS").filter((row) => String(row.receiving_id || "") === receivingId);
  const products = byId_(readTable_("PRODUCTS"), "product_id");
  const placedQty = placements.reduce((sum, row) => sum + number_(row.purchase_qty, 0), 0);
  const acceptedQty = number_(receiving.qty_accepted, 0);
  const remainingQty = Math.max(0, acceptedQty - placedQty);
  const perSpace = number_(receiving.cases_per_space, 0);
  return {
    receiving,
    product: products[receiving.product_id] || null,
    placements,
    placed_qty: placedQty,
    remaining_qty: remainingQty,
    next_qty: remainingQty > 0 ? Math.min(perSpace || remainingQty, remainingQty) : 0,
    spaces_required: number_(receiving.spaces_required, 0),
    spaces_completed: placements.length,
    complete: remainingQty <= 0.0001 || String(receiving.receiving_status || "").toUpperCase() === "COMPLETE"
  };
}

function listOpenReceivingSessions(payload) {
  payload = payload || {};
  const rows = readTable_("RECEIVING").filter((row) => String(row.receiving_status || "").toUpperCase() === "IN_PROGRESS");
  return rows.map((row) => getReceivingSession({ receiving_id: row.receiving_id })).filter(Boolean);
}

function placeReceivingInventory(payload) {
  payload = payload || {};
  const user = payload.user || {};
  requirePermission_(user, "receiving:create");
  const input = payload.input || payload;
  return withScriptLock_(function () {
    ensureTableColumns_("RECEIVING_PLACEMENTS", RECEIVING_PLACEMENT_SCHEMA_V2);
    const operationId = warehouseOperationIdV2_(input.operation_id, "RCVPLACE");
    const duplicate = warehouseFindByOperationV2_("RECEIVING_PLACEMENTS", operationId);
    if (duplicate) return getReceivingSession({ receiving_id: duplicate.receiving_id });

    const receivingId = String(input.receiving_id || "").trim();
    const session = getReceivingSession({ receiving_id: receivingId });
    if (!session) throw new Error("Receiving session was not found.");
    if (session.complete) return session;
    const receiving = session.receiving;
    if (String(receiving.receiving_status || "IN_PROGRESS").toUpperCase() !== "IN_PROGRESS") throw new Error("This receiving session is not active.");

    const locationId = String(input.location_id || input.confirmed_location_id || "").trim();
    if (!locationId) throw new Error("Choose or scan a storage location.");
    const purchaseQty = input.purchase_qty !== undefined ? number_(input.purchase_qty, 0) : number_(session.next_qty, 0);
    if (!(purchaseQty > 0)) throw new Error("Placement quantity must be greater than zero.");
    if (purchaseQty > session.remaining_qty + 0.0001) throw new Error("Placement quantity exceeds the remaining receiving quantity.");

    warehouseValidateDestinationV2_(locationId, receiving.product_id);
    const poLine = readTable_("PURCHASE_ORDER_LINES").find((row) => String(row.po_line_id || "") === String(receiving.po_line_id || ""));
    if (!poLine) throw new Error("Purchase Order line was not found.");
    const unitWeight = number_(receiving.units_per_purchase_unit, 0) || resolvePurchaseUnitWeight_(poLine, {});
    if (!(unitWeight > 0)) throw new Error("Receiving session is missing its unit weight.");
    const baseQty = purchaseQty * unitWeight;
    const lotId = nextId_("LOTS", "internal_lot_id", "LOT");
    const placementId = nextId_("RECEIVING_PLACEMENTS", "placement_id", "RPL");
    const now = today_();
    const lot = {
      internal_lot_id: lotId,
      product_id: receiving.product_id,
      supplier_id: receiving.supplier_id,
      supplier_lot_number: receiving.supplier_lot_number,
      po_id: receiving.po_id,
      po_line_id: receiving.po_line_id,
      received_date: now,
      original_qty: baseQty,
      current_qty_script: baseQty,
      unit_type: receiving.base_unit || "LB",
      unit_cost: poLine.unit_cost,
      currency: poLine.currency || "USD",
      current_location_id: locationId,
      status: String(receiving.quality_status || "PASS").toUpperCase() === "HOLD" ? "HOLD" : "ACTIVE",
      expiration_date: input.expiration_date || "",
      qr_value: lotId,
      label_printed_status: "NOT_PRINTED",
      label_printed_at: "",
      created_at: now,
      updated_at: now,
      notes: `Receiving ${receivingId}; placement ${session.spaces_completed + 1} of ${session.spaces_required}. ${String(input.notes || "").trim()}`.trim(),
      purchase_qty_received: purchaseQty,
      purchase_unit_type: receiving.unit_type,
      pallet_count: 1
    };
    const placement = {
      placement_id: placementId,
      receiving_id: receivingId,
      po_id: receiving.po_id,
      po_line_id: receiving.po_line_id,
      product_id: receiving.product_id,
      internal_lot_id: lotId,
      supplier_lot_number: receiving.supplier_lot_number,
      location_id: locationId,
      purchase_qty: purchaseQty,
      purchase_unit_type: receiving.unit_type,
      unit_weight_lbs: unitWeight,
      base_qty: baseQty,
      operation_id: operationId,
      placed_by: user.user_id || user.role,
      placed_at: now,
      notes: input.notes || ""
    };

    const writes = [];
    try {
      writes.push(appendRecord_("LOTS", lot));
      writes.push(appendRecord_("RECEIVING_PLACEMENTS", placement));
      const movement = warehouseAppendMovementV2_(user, {
        movement_type: "RECEIVE",
        product_id: receiving.product_id,
        internal_lot_id: lotId,
        qty_change: baseQty,
        unit_type: receiving.base_unit || "LB",
        from_location_id: "RECEIVING",
        to_location_id: locationId,
        related_po_id: receiving.po_id,
        related_receiving_id: receivingId,
        operation_id,
        purchase_qty_change: purchaseQty,
        purchase_unit_type: receiving.unit_type,
        source_screen: "RECEIVING_V2",
        notes: `Placed ${purchaseQty} ${receiving.unit_type} in ${locationId}.`
      });
      if (movement._write_info) writes.push(movement._write_info);

      const previousReceived = number_(poLine.qty_received_total, 0);
      const ordered = number_(poLine.qty_ordered, 0);
      const nextReceived = previousReceived + purchaseQty;
      updateTableRecord_("PURCHASE_ORDER_LINES", "po_line_id", receiving.po_line_id, {
        qty_received_total: nextReceived,
        qty_remaining: Math.max(0, ordered - nextReceived),
        line_status: nextReceived >= ordered - 0.0001 ? "RECEIVED" : "PARTIAL"
      });
      refreshPurchaseOrderStatus_(receiving.po_id);

      const completed = session.spaces_completed + 1;
      const remainingAfter = Math.max(0, session.remaining_qty - purchaseQty);
      updateTableRecord_("RECEIVING", "receiving_id", receivingId, {
        spaces_completed: completed,
        confirmed_location_id: locationId,
        internal_lot_id: receiving.internal_lot_id || lotId,
        receiving_status: remainingAfter <= 0.0001 ? "COMPLETE" : "IN_PROGRESS",
        updated_at: now
      });
      syncLocationInventoryStatus_(locationId);
    } catch (error) {
      // LOTS and placement appends can be rolled back. Movement writes are idempotent and retained only if completed.
      writes.reverse().forEach(rollbackAppendedRange_);
      throw error;
    }

    writeAuditLog_({ user_id: user.user_id, role: user.role, action_type: "RECEIVING_PLACEMENT", table_name: "RECEIVING_PLACEMENTS", record_id: placementId, source_screen: "RECEIVING_V2" });
    return getReceivingSession({ receiving_id: receivingId });
  });
}

function listProductStorage(payload) {
  payload = payload || {};
  const productId = String(payload.product_id || (payload.input || {}).product_id || "").trim();
  if (!productId) return [];
  const products = byId_(readTable_("PRODUCTS"), "product_id");
  return warehouseActiveLotsV2_()
    .filter((lot) => String(lot.product_id || "") === productId && String(lot.status || "ACTIVE").toUpperCase() !== "HOLD")
    .map((lot) => {
      const baseQty = warehouseActiveLotQtyV2_(lot);
      const unitWeight = lotUnitWeightV2_(lot);
      return {
        product_id: productId,
        product_name: (products[productId] || {}).product_name || productId,
        internal_lot_id: lot.internal_lot_id,
        supplier_lot_number: lot.supplier_lot_number || "",
        location_id: lot.current_location_id || "",
        base_qty: baseQty,
        base_unit: lot.unit_type || "LB",
        purchase_qty: unitWeight > 0 ? baseQty / unitWeight : 0,
        purchase_unit_type: lot.purchase_unit_type || "UNIT",
        unit_weight_lbs: unitWeight,
        lot
      };
    })
    .sort((a, b) => String(a.location_id).localeCompare(String(b.location_id), undefined, { numeric: true }));
}

function sendSalesOrderSelections(payload) {
  payload = payload || {};
  const user = payload.user || {};
  requirePermission_(user, "salesOrders:send");
  const input = payload.input || payload;
  const salesOrderId = String(input.sales_order_id || "").trim();
  const selections = Array.isArray(input.selections) ? input.selections : [];
  if (!salesOrderId) throw new Error("Choose a Sales Order.");
  if (!selections.length) throw new Error("Select at least one storage space to send.");

  return withScriptLock_(function () {
    const order = readTable_("SALES_ORDERS").find((row) => String(row.sales_order_id || "") === salesOrderId);
    if (!order) throw new Error("Sales Order was not found.");
    const orderStatus = String(order.status || "").toUpperCase();
    if (!["CONFIRMED", "PARTIALLY_PICKED", "PARTIAL", "PICKED"].includes(orderStatus)) throw new Error("Confirm the Sales Order before sending inventory.");

    const lines = readTable_("SALES_ORDER_LINES").filter((row) => String(row.sales_order_id || "") === salesOrderId);
    const lots = byId_(readTable_("LOTS"), "internal_lot_id");
    const planned = [];
    const byLot = {};
    const byLine = {};
    selections.forEach((selection, index) => {
      const line = lines.find((row) => String(row.sales_order_line_id || "") === String(selection.sales_order_line_id || ""));
      if (!line) throw new Error(`Selection ${index + 1} does not belong to this Sales Order.`);
      const lot = lots[String(selection.internal_lot_id || "")];
      if (!lot) throw new Error(`Selection ${index + 1}: inventory lot was not found.`);
      if (String(lot.product_id) !== String(line.product_id)) throw new Error(`Selection ${index + 1}: product does not match the Sales Order line.`);
      if (warehouseActiveLotQtyV2_(lot) <= 0.0001) throw new Error(`Selection ${index + 1}: inventory is empty.`);
      if (String(lot.status || "ACTIVE").toUpperCase() === "HOLD") throw new Error(`Selection ${index + 1}: inventory is on hold.`);
      const unitWeight = lotUnitWeightV2_(lot);
      const purchaseQty = selection.purchase_qty !== undefined ? number_(selection.purchase_qty, 0) : 0;
      const baseQty = selection.base_qty !== undefined ? number_(selection.base_qty, 0) : purchaseQty * unitWeight;
      if (!(baseQty > 0)) throw new Error(`Selection ${index + 1}: quantity must be greater than zero.`);
      const lotId = lot.internal_lot_id;
      byLot[lotId] = number_(byLot[lotId], 0) + baseQty;
      byLine[line.sales_order_line_id] = number_(byLine[line.sales_order_line_id], 0) + baseQty;
      planned.push({ selection, line, lot, baseQty, unitWeight, purchaseQty: purchaseQty || (unitWeight > 0 ? baseQty / unitWeight : 0) });
    });

    Object.keys(byLot).forEach((lotId) => {
      if (byLot[lotId] > warehouseActiveLotQtyV2_(lots[lotId]) + 0.0001) throw new Error(`Not enough inventory in ${lotId}.`);
    });
    Object.keys(byLine).forEach((lineId) => {
      const line = lines.find((row) => String(row.sales_order_line_id) === String(lineId));
      const remainingBase = remainingBaseQtyV2_(line);
      if (byLine[lineId] > remainingBase + 0.0001) throw new Error(`Selected quantity exceeds the remaining need for ${line.product_id}.`);
    });

    const movements = [];
    planned.forEach((item, index) => {
      const operationId = warehouseOperationIdV2_(item.selection.operation_id || `${input.operation_id || "SEND"}-${index + 1}`, "SEND");
      const duplicate = warehouseFindByOperationV2_("INVENTORY_MOVEMENTS", operationId);
      if (duplicate) {
        movements.push({ ...duplicate, duplicate_request: true });
        return;
      }
      const currentQty = warehouseActiveLotQtyV2_(item.lot);
      const nextQty = Math.max(0, currentQty - item.baseQty);
      updateTableRecord_("LOTS", "internal_lot_id", item.lot.internal_lot_id, {
        current_qty_script: nextQty,
        status: nextQty <= 0.0001 ? "EMPTY" : item.lot.status || "ACTIVE",
        updated_at: today_()
      });
      const movement = warehouseAppendMovementV2_(user, {
        movement_type: "SALE",
        product_id: item.lot.product_id,
        internal_lot_id: item.lot.internal_lot_id,
        qty_change: -item.baseQty,
        unit_type: item.lot.unit_type || "LB",
        from_location_id: item.lot.current_location_id || "",
        to_location_id: "OUTBOUND",
        related_sales_order_id: salesOrderId,
        operation_id: operationId,
        purchase_qty_change: -item.purchaseQty,
        purchase_unit_type: item.lot.purchase_unit_type || item.line.unit_type || "",
        source_screen: "SEND_PRODUCT_V2",
        notes: item.selection.notes || `Sent from ${item.lot.current_location_id || "storage"}.`
      });
      movements.push(movement);
      const pickTask = readTable_("PICK_TASKS").find((task) => String(task.sales_order_line_id || "") === String(item.line.sales_order_line_id || "")) || null;
      updateSalesOrderProgressV2_(salesOrderId, item.line, pickTask, item.baseQty, user);
      syncLocationInventoryStatus_(item.lot.current_location_id);
      // Refresh in-memory quantities so two selections from the same lot are safe.
      item.lot.current_qty_script = nextQty;
    });

    writeAuditLog_({ user_id: user.user_id, role: user.role, action_type: "SEND_SALES_ORDER_SELECTIONS", table_name: "SALES_ORDERS", record_id: salesOrderId, source_screen: "SEND_PRODUCT_V2", notes: `${movements.length} storage selection(s).` });
    return { movements, salesOrder: getSalesOrderDetail({ sales_order_id: salesOrderId }) };
  });
}

function moveInventory(payload) {
  payload = payload || {};
  const user = payload.user || {};
  const input = payload.input || payload;
  const role = normalizeRole_(user.role);
  if (!["ADMIN", "MANAGER", "OPERATOR"].includes(role)) throw new Error("Warehouse permission required.");
  return withScriptLock_(function () {
    const operationId = warehouseOperationIdV2_(input.operation_id, "MOVE");
    const duplicate = warehouseFindByOperationV2_("INVENTORY_MOVEMENTS", operationId);
    if (duplicate) return { movement: { ...duplicate, duplicate_request: true } };
    const lot = findLotByScanV2_(input.internal_lot_id || input.scan_code);
    if (!lot) throw new Error("Choose or scan an inventory lot.");
    const fromLocation = String(lot.current_location_id || "").trim();
    const toLocation = String(input.to_location_id || "").trim();
    if (!toLocation) throw new Error("Choose a destination location.");
    if (fromLocation === toLocation) throw new Error("Inventory is already in that location.");
    warehouseValidateDestinationV2_(toLocation, lot.product_id);

    const unitWeight = lotUnitWeightV2_(lot);
    const currentBase = warehouseActiveLotQtyV2_(lot);
    const purchaseQty = input.purchase_qty !== undefined ? number_(input.purchase_qty, 0) : 0;
    const baseQty = input.base_qty !== undefined ? number_(input.base_qty, 0) : purchaseQty * unitWeight;
    const qtyToMove = baseQty > 0 ? baseQty : currentBase;
    if (!(qtyToMove > 0) || qtyToMove > currentBase + 0.0001) throw new Error("Move quantity exceeds available inventory.");
    const movedPurchaseQty = unitWeight > 0 ? qtyToMove / unitWeight : 0;
    const destination = readTable_("LOCATIONS").find((row) => String(row.location_id || "") === toLocation) || {};
    const type = String(destination.location_type || "").toUpperCase();
    const movementType = type === "PACKING_AREA" ? "PACKING_IN" : String(fromLocation).toUpperCase() === "PACKING" ? "PACKING_OUT" : "TRANSFER";
    let destinationLotId = lot.internal_lot_id;
    let splitWrite = null;
    const originalState = {
      current_qty_script: currentBase,
      current_location_id: fromLocation,
      status: lot.status || "ACTIVE",
      updated_at: lot.updated_at || ""
    };

    try {
      if (approximatelyEqual_(qtyToMove, currentBase, 0.0001)) {
        updateTableRecord_("LOTS", "internal_lot_id", lot.internal_lot_id, { current_location_id: toLocation, updated_at: today_() });
      } else {
        const remaining = currentBase - qtyToMove;
        updateTableRecord_("LOTS", "internal_lot_id", lot.internal_lot_id, { current_qty_script: remaining, updated_at: today_() });
        destinationLotId = nextId_("LOTS", "internal_lot_id", "LOT");
        splitWrite = appendRecord_("LOTS", {
          ...lot,
          internal_lot_id: destinationLotId,
          original_qty: qtyToMove,
          current_qty_script: qtyToMove,
          current_location_id: toLocation,
          qr_value: destinationLotId,
          created_at: today_(),
          updated_at: today_(),
          notes: `Split from ${lot.internal_lot_id} for transfer to ${toLocation}.`,
          purchase_qty_received: movedPurchaseQty,
          pallet_count: 1
        });
      }

      const movement = warehouseAppendMovementV2_(user, {
        movement_type: movementType,
        product_id: lot.product_id,
        internal_lot_id: destinationLotId,
        qty_change: qtyToMove,
        unit_type: lot.unit_type || "LB",
        from_location_id: fromLocation,
        to_location_id: toLocation,
        operation_id: operationId,
        purchase_qty_change: movedPurchaseQty,
        purchase_unit_type: lot.purchase_unit_type || "",
        source_screen: input.source_screen || (type === "PACKING_AREA" || fromLocation === "PACKING" ? "PACKING" : "MOVE_INVENTORY"),
        notes: input.notes || `Moved ${movedPurchaseQty} ${lot.purchase_unit_type || "units"} from ${fromLocation} to ${toLocation}.`
      });
      syncLocationInventoryStatus_(fromLocation);
      syncLocationInventoryStatus_(toLocation);
      return { movement, source_lot_id: lot.internal_lot_id, destination_lot_id: destinationLotId, from_location_id: fromLocation, to_location_id: toLocation };
    } catch (error) {
      updateTableRecord_("LOTS", "internal_lot_id", lot.internal_lot_id, originalState);
      if (splitWrite) rollbackAppendedRange_(splitWrite);
      syncLocationInventoryStatus_(fromLocation);
      syncLocationInventoryStatus_(toLocation);
      throw error;
    }
  });
}

function getPackingActivity(payload) {
  payload = payload || {};
  const requestedDate = String(payload.date || (payload.input || {}).date || Utilities.formatDate(today_(), Session.getScriptTimeZone(), "yyyy-MM-dd"));
  const products = byId_(readTable_("PRODUCTS"), "product_id");
  const movements = readTable_("INVENTORY_MOVEMENTS").filter((movement) => dateKeyV2_(movement.timestamp) === requestedDate);
  const rows = {};
  movements.forEach((movement) => {
    const type = String(movement.movement_type || "").toUpperCase();
    if (!["PACKING_IN", "PACKING_OUT", "PACKING_USAGE"].includes(type)) return;
    const key = [movement.product_id, movement.internal_lot_id].join("|");
    if (!rows[key]) rows[key] = {
      product_id: movement.product_id,
      product_name: (products[movement.product_id] || {}).product_name || movement.product_id,
      internal_lot_id: movement.internal_lot_id,
      moved_in_base: 0,
      returned_base: 0,
      used_base: 0,
      moved_in_purchase: 0,
      returned_purchase: 0,
      used_purchase: 0,
      purchase_unit_type: movement.purchase_unit_type || ""
    };
    const base = Math.abs(number_(movement.qty_change, 0));
    const purchase = Math.abs(number_(movement.purchase_qty_change, 0));
    if (type === "PACKING_IN") { rows[key].moved_in_base += base; rows[key].moved_in_purchase += purchase; }
    if (type === "PACKING_OUT") { rows[key].returned_base += base; rows[key].returned_purchase += purchase; }
    if (type === "PACKING_USAGE") { rows[key].used_base += base; rows[key].used_purchase += purchase; }
  });
  const current = listProductStorage({ product_id: "__NONE__" }); // keep helper loaded without altering state
  const packingLots = warehouseActiveLotsV2_().filter((lot) => String(lot.current_location_id || "").toUpperCase() === "PACKING");
  const currentByKey = {};
  packingLots.forEach((lot) => currentByKey[[lot.product_id, lot.internal_lot_id].join("|")] = warehouseActiveLotQtyV2_(lot));
  return {
    date: requestedDate,
    rows: Object.keys(rows).map((key) => ({ ...rows[key], currently_packing_base: number_(currentByKey[key], 0) })),
    current_inventory: packingLots.map((lot) => ({
      product_id: lot.product_id,
      product_name: (products[lot.product_id] || {}).product_name || lot.product_id,
      internal_lot_id: lot.internal_lot_id,
      supplier_lot_number: lot.supplier_lot_number || "",
      base_qty: warehouseActiveLotQtyV2_(lot),
      purchase_qty: lotUnitWeightV2_(lot) > 0 ? warehouseActiveLotQtyV2_(lot) / lotUnitWeightV2_(lot) : 0,
      purchase_unit_type: lot.purchase_unit_type || "UNIT"
    }))
  };
}

function recordPackingUsage(payload) {
  payload = payload || {};
  const user = payload.user || {};
  const input = payload.input || payload;
  if (!["ADMIN", "MANAGER"].includes(normalizeRole_(user.role))) throw new Error("Only an Admin or Manager can post packing usage.");
  return withScriptLock_(function () {
    const operationId = warehouseOperationIdV2_(input.operation_id, "PACKUSE");
    const duplicate = warehouseFindByOperationV2_("INVENTORY_MOVEMENTS", operationId);
    if (duplicate) return { movement: { ...duplicate, duplicate_request: true } };
    const lot = findLotByScanV2_(input.internal_lot_id);
    if (!lot || String(lot.current_location_id || "").toUpperCase() !== "PACKING") throw new Error("Packing usage must be posted from inventory currently in PACKING.");
    const unitWeight = lotUnitWeightV2_(lot);
    const purchaseQty = input.purchase_qty !== undefined ? number_(input.purchase_qty, 0) : 0;
    const baseQty = input.base_qty !== undefined ? number_(input.base_qty, 0) : purchaseQty * unitWeight;
    if (!(baseQty > 0)) throw new Error("Usage quantity must be greater than zero.");
    const current = warehouseActiveLotQtyV2_(lot);
    if (baseQty > current + 0.0001) throw new Error("Usage quantity exceeds inventory currently in Packing.");
    const next = Math.max(0, current - baseQty);
    const originalState = { current_qty_script: current, status: lot.status || "ACTIVE", updated_at: lot.updated_at || "" };
    try {
      updateTableRecord_("LOTS", "internal_lot_id", lot.internal_lot_id, { current_qty_script: next, status: next <= 0.0001 ? "EMPTY" : lot.status || "ACTIVE", updated_at: today_() });
      const movement = warehouseAppendMovementV2_(user, {
        movement_type: "PACKING_USAGE",
        product_id: lot.product_id,
        internal_lot_id: lot.internal_lot_id,
        qty_change: -baseQty,
        unit_type: lot.unit_type || "LB",
        from_location_id: "PACKING",
        to_location_id: "OUTBOUND",
        operation_id: operationId,
        purchase_qty_change: -(purchaseQty || (unitWeight > 0 ? baseQty / unitWeight : 0)),
        purchase_unit_type: lot.purchase_unit_type || "",
        source_screen: "PACKING",
        notes: input.notes || "Packing usage."
      });
      syncLocationInventoryStatus_("PACKING");
      return { movement, remaining_base_qty: next };
    } catch (error) {
      updateTableRecord_("LOTS", "internal_lot_id", lot.internal_lot_id, originalState);
      syncLocationInventoryStatus_("PACKING");
      throw error;
    }
  });
}
