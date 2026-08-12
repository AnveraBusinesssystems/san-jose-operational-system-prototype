/** Locked, idempotent, append-only inventory mutations. */

function sjExistingLotQuantity_(product, lot, quantity, unitCode) {
  var entered = sjPositive_(quantity, 'quantity');
  var unit = sjUpper_(unitCode || product.base_unit);
  var base = sjUpper_(product.base_unit);
  var lotUnit = sjUpper_(lot.unit_code);
  var conversion = unit === base ? 1 : (unit === lotUnit ? sjNumber_(lot.conversion_to_base) : 0);
  if (!(conversion > 0)) throw new Error('Quantity must be entered as ' + base + ' or ' + lotUnit + '.');
  return {entered_qty: entered, entered_unit: unit, conversion_to_base: conversion, quantity_base: entered * conversion};
}

function sjInboundQuantity_(context, product, payload) {
  var entered = sjPositive_(payload.quantity, 'quantity');
  var unit = sjUpper_(payload.unit_code || product.base_unit);
  var conversion = unit === sjUpper_(product.base_unit) ? 1 : sjNumber_(payload.conversion_to_base);
  if (!(conversion > 0)) {
    var unitRow = context.units.find(function (row) { return sjString_(row.product_id) === sjString_(product.product_id) && sjUpper_(row.unit_code) === unit; });
    conversion = unitRow ? sjNumber_(unitRow.conversion_to_base) : 0;
  }
  if (!(conversion > 0)) throw new Error('A valid conversion_to_base is required for ' + unit + '.');
  return {entered_qty: entered, entered_unit: unit, conversion_to_base: conversion, quantity_base: entered * conversion};
}

function sjFindOperation_(context, operationId) {
  return context.movements.find(function (movement) { return sjString_(movement.operation_id) === sjString_(operationId); }) || null;
}

function sjDuplicateMovement_(movement) {
  return {duplicate: true, operation_id: sjString_(movement.operation_id), movement_id: sjString_(movement.movement_id), movement_sequence: sjNumber_(movement.movement_sequence), movement_type: sjUpper_(movement.movement_type)};
}

function sjExpectedSequence_(balance, expected) {
  if (expected === undefined || expected === null || expected === '') return;
  var value = Number(expected);
  if (!isFinite(value)) throw new Error('expected_source_sequence must be numeric.');
  var current = balance ? sjNumber_(balance.last_movement_sequence) : 0;
  if (current !== value) throw new Error('Inventory changed after the screen loaded. Refresh the stock line.');
}

function sjNextMovementSequence_(context) {
  return context.movements.reduce(function (max, row) { return Math.max(max, sjNumber_(row.movement_sequence)); }, 0) + 1;
}

function sjBalanceSnapshot_(context, productId, lotId, locationId, newQuantity, sequence, now) {
  var existing = sjBalance_(context, productId, lotId, locationId);
  var snapshot = {table: context.balancesTable, existed: Boolean(existing), row: existing ? existing._sheet_row : null, old: existing ? Object.assign({}, existing) : null, appended: false};
  if (newQuantity > SJ_CONFIG.EPSILON) {
    var record = {balance_key: sjBalanceKey_(productId, lotId, locationId), product_id: productId, lot_id: lotId, location_id: sjUpper_(locationId), current_base_qty: newQuantity, last_movement_sequence: sequence, updated_at: now};
    if (existing) sjUpdate_(context.balancesTable, existing._sheet_row, record);
    else { snapshot.row = sjAppend_(context.balancesTable, record); snapshot.appended = true; }
  } else if (existing) {
    sjClear_(context.balancesTable, existing._sheet_row);
  }
  return snapshot;
}

function sjRollback_(snapshots) {
  snapshots.slice().reverse().forEach(function (snapshot) {
    try {
      if (snapshot.appended) sjClear_(snapshot.table, snapshot.row);
      else if (snapshot.existed) sjUpdate_(snapshot.table, snapshot.row, snapshot.old);
    } catch (_error) {}
  });
}

function sjExecuteMovement_(input) {
  var context = input.context;
  var sequence = sjNextMovementSequence_(context);
  var now = sjNow_();
  var snapshots = [];
  var movementRow = null;
  try {
    if (input.source) snapshots.push(sjBalanceSnapshot_(context, input.productId, input.lotId, input.source.locationId, input.source.newQuantity, sequence, now));
    if (input.destination) snapshots.push(sjBalanceSnapshot_(context, input.productId, input.lotId, input.destination.locationId, input.destination.newQuantity, sequence, now));
    var quantity = input.quantity || {quantity_base: 0, entered_qty: 0, entered_unit: '', conversion_to_base: 1};
    var movement = {
      movement_sequence: sequence, movement_id: sjNextId_(context.movementsTable, 'MOV', 'movement_id'),
      movement_type: input.movementType, occurred_at: now, product_id: input.productId, lot_id: input.lotId,
      quantity_base: sjNumber_(quantity.quantity_base), entered_qty: sjNumber_(quantity.entered_qty),
      entered_unit: sjUpper_(quantity.entered_unit), conversion_to_base: sjNumber_(quantity.conversion_to_base) || 1,
      from_location_id: input.fromLocation || '', to_location_id: input.toLocation || '',
      order_id: sjString_(input.orderId), order_line_id: sjString_(input.orderLineId), task_id: sjString_(input.taskId),
      operation_id: input.operationId, user_id: input.actor.user_id,
      approval_status: sjUpper_(input.approvalStatus || 'APPROVED'), notes: sjString_(input.notes)
    };
    movementRow = sjAppend_(context.movementsTable, movement);
    SpreadsheetApp.flush();
    sjAudit_(input.actor, input.auditAction || input.movementType, 'INVENTORY_BALANCES', input.productId + '|' + input.lotId, input.auditOld || {}, input.auditNew || {}, input.operationId);
    return Object.assign({duplicate: false}, sjPublicRecord_(movement));
  } catch (error) {
    if (movementRow) { try { sjClear_(context.movementsTable, movementRow); } catch (_ignore) {} }
    sjRollback_(snapshots);
    try { SpreadsheetApp.flush(); } catch (_flushError) {}
    throw error;
  }
}

function sjLatestProductCost_(productId) {
  var rows = sjTable_('LOTS').records.filter(function (lot) { return sjString_(lot.product_id) === sjString_(productId) && sjNumber_(lot.cost_per_base) > 0; });
  rows.sort(function (left, right) { return sjDateMs_(right.received_at) - sjDateMs_(left.received_at); });
  return rows.length ? sjNumber_(rows[0].cost_per_base) : 0;
}

function sjApplyOrderLineCompletion_(orderLineId, completedBaseQuantity) {
  if (!orderLineId) return null;
  var lines = sjTable_('ORDER_LINES');
  var line = sjFind_(lines, orderLineId);
  if (!line) throw new Error('Order line was not found: ' + orderLineId + '.');
  var ordered = sjNumber_(line.base_quantity);
  var completed = Math.min(ordered, sjNumber_(line.quantity_completed_base) + completedBaseQuantity);
  var status = completed >= ordered - SJ_CONFIG.EPSILON ? 'COMPLETE' : (completed > 0 ? 'PARTIAL' : 'OPEN');
  var updated = sjUpdate_(lines, line._sheet_row, {quantity_completed_base: completed, status: status});
  var orders = sjTable_('ORDERS');
  var order = sjFind_(orders, line.order_id);
  if (order) {
    var siblingStatuses = lines.records.filter(function (row) { return sjString_(row.order_id) === sjString_(order.order_id); }).map(function (row) {
      return row._sheet_row === line._sheet_row ? status : sjUpper_(row.status);
    });
    var orderStatus = siblingStatuses.every(function (value) { return value === 'COMPLETE'; }) ? 'COMPLETE' : (siblingStatuses.some(function (value) { return value === 'PARTIAL' || value === 'COMPLETE'; }) ? 'PARTIAL' : sjUpper_(order.status));
    sjUpdate_(orders, order._sheet_row, {status: orderStatus, updated_at: sjNow_()});
  }
  return updated;
}

function sjCreateLot_(context, product, quantity, payload, kind) {
  var now = sjNow_();
  var record = {
    lot_id: sjNextId_(context.lotsTable, 'LOT'), product_id: product.product_id,
    vendor_party_id: sjString_(payload.vendor_party_id), source_order_line_id: sjString_(payload.source_order_line_id || payload.order_line_id),
    supplier_lot_number: sjRequired_(payload.supplier_lot_number, 'supplier_lot_number'),
    received_at: sjDate_(payload.received_at || now, true), received_base_qty: quantity.quantity_base,
    received_unit_qty: quantity.entered_qty, unit_code: quantity.entered_unit,
    conversion_to_base: quantity.conversion_to_base,
    cost_per_base: payload.cost_per_base === undefined || payload.cost_per_base === '' ? sjLatestProductCost_(product.product_id) : sjPositive_(payload.cost_per_base, 'cost_per_base', true),
    currency: sjUpper_(payload.currency || 'USD'), expiration_date: sjDate_(payload.expiration_date, false),
    quality_status: sjUpper_(payload.quality_status || 'PASS'), lot_status: sjUpper_(payload.lot_status || 'ACTIVE'),
    created_at: now, notes: sjString_(kind) + ' · ' + sjString_(payload.notes)
  };
  var row = sjAppend_(context.lotsTable, record);
  record._sheet_row = row;
  return record;
}

function sjResolveInboundLot_(context, product, payload, kind) {
  if (payload.lot_id) {
    var existing = sjInventoryLot_(context, payload.lot_id, product.product_id);
    return {lot: existing, quantity: sjExistingLotQuantity_(product, existing, payload.quantity, payload.unit_code), created: false};
  }
  var quantity = sjInboundQuantity_(context, product, payload);
  var supplierLot = sjNormalizeText_(payload.supplier_lot_number);
  var match = supplierLot ? context.lots.find(function (lot) {
    return sjString_(lot.product_id) === sjString_(product.product_id) && sjNormalizeText_(lot.supplier_lot_number) === supplierLot && sjUpper_(lot.unit_code) === quantity.entered_unit && Math.abs(sjNumber_(lot.conversion_to_base) - quantity.conversion_to_base) <= SJ_CONFIG.EPSILON && ['ACTIVE', 'HOLD', ''].indexOf(sjUpper_(lot.lot_status)) >= 0;
  }) : null;
  if (match) return {lot: match, quantity: quantity, created: false};
  return {lot: sjCreateLot_(context, product, quantity, payload, kind), quantity: quantity, created: true};
}

function sjAddToLotReceipt_(context, lot, quantity) {
  if (!lot || !lot._sheet_row) return null;
  var snapshot = Object.assign({}, lot);
  var conversion = sjNumber_(lot.conversion_to_base) || 1;
  sjUpdate_(context.lotsTable, lot._sheet_row, {
    received_base_qty: sjNumber_(lot.received_base_qty) + quantity.quantity_base,
    received_unit_qty: sjNumber_(lot.received_unit_qty) + quantity.quantity_base / conversion
  });
  return snapshot;
}

function sjMoveInventory(payload) {
  var actor = sjRequirePermission_(payload, 'inventory.move');
  return sjWithLock_(function () {
    var operationId = sjOperationId_(payload), context = sjInventoryContext_(), duplicate = sjFindOperation_(context, operationId);
    if (duplicate) return sjDuplicateMovement_(duplicate);
    var product = sjInventoryProduct_(context, payload.product_id), lot = sjInventoryLot_(context, payload.lot_id, product.product_id);
    var from = sjUpper_(sjInventoryLocation_(context, payload.from_location_id).location_id), to = sjUpper_(sjInventoryLocation_(context, payload.to_location_id).location_id);
    if (from === to) throw new Error('Source and destination must be different.');
    var source = sjBalance_(context, product.product_id, lot.lot_id, from);
    if (!source || sjNumber_(source.current_base_qty) <= SJ_CONFIG.EPSILON) throw new Error('No positive source balance exists.');
    sjExpectedSequence_(source, payload.expected_source_sequence);
    var quantity = sjExistingLotQuantity_(product, lot, payload.quantity, payload.unit_code), sourceOld = sjNumber_(source.current_base_qty);
    if (quantity.quantity_base - sourceOld > SJ_CONFIG.EPSILON) throw new Error('Move exceeds the available source balance.');
    var destination = sjBalance_(context, product.product_id, lot.lot_id, to), destinationOld = destination ? sjNumber_(destination.current_base_qty) : 0;
    return sjExecuteMovement_({context: context, actor: actor, operationId: operationId, movementType: 'MOVE', productId: product.product_id, lotId: lot.lot_id, quantity: quantity, fromLocation: from, toLocation: to, source: {locationId: from, newQuantity: sourceOld - quantity.quantity_base}, destination: {locationId: to, newQuantity: destinationOld + quantity.quantity_base}, orderId: payload.order_id, orderLineId: payload.order_line_id, taskId: payload.task_id, notes: payload.notes, auditOld: {from: sourceOld, to: destinationOld}, auditNew: {from: sourceOld - quantity.quantity_base, to: destinationOld + quantity.quantity_base}});
  });
}

function sjMoveToPacking(payload) { return sjMoveInventory(Object.assign({}, payload, {to_location_id: 'PACKING'})); }
function sjMoveFromPacking(payload) { return sjMoveInventory(Object.assign({}, payload, {from_location_id: 'PACKING'})); }

function sjReceiveInventory(payload) {
  var actor = sjRequirePermission_(payload, 'inventory.receive');
  return sjWithLock_(function () {
    var operationId = sjOperationId_(payload), context = sjInventoryContext_(), duplicate = sjFindOperation_(context, operationId);
    if (duplicate) return sjDuplicateMovement_(duplicate);
    var product = sjInventoryProduct_(context, payload.product_id), location = sjInventoryLocation_(context, payload.location_id || payload.to_location_id);
    var completionLineId = sjString_(payload.order_line_id || payload.source_order_line_id);
    if (completionLineId && !sjFind_(sjTable_('ORDER_LINES'), completionLineId)) throw new Error('Order line was not found: ' + completionLineId + '.');
    var resolved = sjResolveInboundLot_(context, product, payload, 'RECEIVE');
    var lotSnapshot = resolved.created ? null : sjAddToLotReceipt_(context, resolved.lot, resolved.quantity);
    var result;
    try {
      var balance = sjBalance_(context, product.product_id, resolved.lot.lot_id, location.location_id), old = balance ? sjNumber_(balance.current_base_qty) : 0;
      result = sjExecuteMovement_({context: context, actor: actor, operationId: operationId, movementType: 'RECEIVE', productId: product.product_id, lotId: resolved.lot.lot_id, quantity: resolved.quantity, toLocation: location.location_id, destination: {locationId: location.location_id, newQuantity: old + resolved.quantity.quantity_base}, orderId: payload.order_id, orderLineId: completionLineId, taskId: payload.task_id, notes: payload.notes, auditOld: {location: location.location_id, quantity: old}, auditNew: {location: location.location_id, quantity: old + resolved.quantity.quantity_base}});
    } catch (error) {
      if (resolved.created) sjClear_(context.lotsTable, resolved.lot._sheet_row);
      else if (lotSnapshot) sjUpdate_(context.lotsTable, resolved.lot._sheet_row, lotSnapshot);
      throw error;
    }
    result.created_lot = resolved.created;
    sjApplyOrderLineCompletion_(completionLineId, resolved.quantity.quantity_base);
    return result;
  });
}

function sjAdjustInventoryIn(payload) {
  var actor = sjRequirePermission_(payload, 'inventory.adjust');
  return sjWithLock_(function () {
    var operationId = sjOperationId_(payload), context = sjInventoryContext_(), duplicate = sjFindOperation_(context, operationId);
    if (duplicate) return sjDuplicateMovement_(duplicate);
    var product = sjInventoryProduct_(context, payload.product_id), location = sjInventoryLocation_(context, payload.location_id);
    var resolved = sjResolveInboundLot_(context, product, payload, 'ADJUST_IN');
    try {
      var balance = sjBalance_(context, product.product_id, resolved.lot.lot_id, location.location_id), old = balance ? sjNumber_(balance.current_base_qty) : 0;
      return sjExecuteMovement_({context: context, actor: actor, operationId: operationId, movementType: 'ADJUST_IN', productId: product.product_id, lotId: resolved.lot.lot_id, quantity: resolved.quantity, toLocation: location.location_id, destination: {locationId: location.location_id, newQuantity: old + resolved.quantity.quantity_base}, notes: sjRequired_(payload.reason || payload.notes, 'reason'), auditOld: {quantity: old}, auditNew: {quantity: old + resolved.quantity.quantity_base}});
    } catch (error) { if (resolved.created) sjClear_(context.lotsTable, resolved.lot._sheet_row); throw error; }
  });
}

function sjFoundInventory(payload) { return sjAdjustInventoryIn(Object.assign({}, payload, {reason: payload.reason || 'PHYSICAL_FOUND'})); }

function sjAdjustInventoryOut(payload) {
  var actor = sjRequirePermission_(payload, 'inventory.adjust');
  return sjWithLock_(function () {
    var operationId = sjOperationId_(payload), context = sjInventoryContext_(), duplicate = sjFindOperation_(context, operationId);
    if (duplicate) return sjDuplicateMovement_(duplicate);
    var product = sjInventoryProduct_(context, payload.product_id), lot = sjInventoryLot_(context, payload.lot_id, product.product_id), location = sjInventoryLocation_(context, payload.location_id);
    var balance = sjBalance_(context, product.product_id, lot.lot_id, location.location_id);
    if (!balance || sjNumber_(balance.current_base_qty) <= SJ_CONFIG.EPSILON) throw new Error('No positive balance exists.');
    sjExpectedSequence_(balance, payload.expected_source_sequence);
    var quantity = sjExistingLotQuantity_(product, lot, payload.quantity, payload.unit_code), old = sjNumber_(balance.current_base_qty);
    if (quantity.quantity_base - old > SJ_CONFIG.EPSILON) throw new Error('Adjustment exceeds the current balance.');
    return sjExecuteMovement_({context: context, actor: actor, operationId: operationId, movementType: 'ADJUST_OUT', productId: product.product_id, lotId: lot.lot_id, quantity: quantity, fromLocation: location.location_id, source: {locationId: location.location_id, newQuantity: old - quantity.quantity_base}, notes: sjRequired_(payload.reason || payload.notes, 'reason'), auditOld: {quantity: old}, auditNew: {quantity: old - quantity.quantity_base}});
  });
}

function sjPhysicalCount(payload) {
  var actor = sjRequirePermission_(payload, 'inventory.count');
  return sjWithLock_(function () {
    var operationId = sjOperationId_(payload), context = sjInventoryContext_(), duplicate = sjFindOperation_(context, operationId);
    if (duplicate) return sjDuplicateMovement_(duplicate);
    var product = sjInventoryProduct_(context, payload.product_id), lot = sjInventoryLot_(context, payload.lot_id, product.product_id), location = sjInventoryLocation_(context, payload.location_id);
    var balance = sjBalance_(context, product.product_id, lot.lot_id, location.location_id), old = balance ? sjNumber_(balance.current_base_qty) : 0;
    sjExpectedSequence_(balance, payload.expected_source_sequence);
    var actual = sjPositive_(payload.actual_quantity, 'actual_quantity', true), unit = sjUpper_(payload.unit_code || product.base_unit);
    var conversion = unit === sjUpper_(product.base_unit) ? 1 : (unit === sjUpper_(lot.unit_code) ? sjNumber_(lot.conversion_to_base) : 0);
    if (!(conversion > 0)) throw new Error('Physical count unit is invalid.');
    var actualBase = actual * conversion, delta = actualBase - old, quantity = {entered_qty: Math.abs(delta) / conversion, entered_unit: unit, conversion_to_base: conversion, quantity_base: Math.abs(delta)};
    var changed = Math.abs(delta) > SJ_CONFIG.EPSILON;
    if (changed) sjRequired_(payload.reason || payload.notes, 'reason');
    return sjExecuteMovement_({context: context, actor: actor, operationId: operationId, movementType: changed ? (delta > 0 ? 'ADJUST_IN' : 'ADJUST_OUT') : 'COUNT_VERIFIED', productId: product.product_id, lotId: lot.lot_id, quantity: quantity, fromLocation: delta < 0 ? location.location_id : '', toLocation: delta > 0 ? location.location_id : '', source: delta < 0 ? {locationId: location.location_id, newQuantity: actualBase} : null, destination: delta > 0 ? {locationId: location.location_id, newQuantity: actualBase} : null, notes: 'PHYSICAL_COUNT · ' + sjString_(payload.reason || payload.notes), auditAction: 'PHYSICAL_COUNT', auditOld: {quantity: old}, auditNew: {quantity: actualBase}});
  });
}

function sjPackingDeduct(payload) {
  var result = sjAdjustInventoryOut(Object.assign({}, payload, {location_id: 'PACKING', reason: payload.reason || payload.notes || 'PACKING_DEDUCT'}));
  if (!result.duplicate) sjApplyOrderLineCompletion_(payload.order_line_id, sjNumber_(result.quantity_base));
  return result;
}
