const P2_SPREADSHEET_ID = '1uAY5LW6SFvEGHf1NxHpB7mOYR28TMlTusadHc-KG3EM';
const P2_INVENTORY_API_VERSION = 'inventory-v2-2026-08-10';
const P2_EPSILON = 0.000001;
const P2_MAX_HISTORY = 200;

const P2_READ_ACTIONS = Object.freeze({
  inventoryHealth: p2InventoryHealth,
  inventoryBootstrap: p2InventoryBootstrap,
  getLocationInventory: p2GetLocationInventory,
  getRackInventory: p2GetRackInventory,
  getProductInventory: p2GetProductInventory,
  getMovementHistory: p2GetMovementHistory,
  inventoryContract: p2InventoryContract
});

const P2_WRITE_ACTIONS = Object.freeze({
  moveInventory: p2MoveInventory,
  adjustInventoryIn: p2AdjustInventoryIn,
  adjustInventoryOut: p2AdjustInventoryOut,
  physicalCount: p2PhysicalCount,
  packingDeduct: p2PackingDeduct
});

function doGet(e) {
  const action = String(e && e.parameter && e.parameter.action || 'inventoryHealth').trim();
  const callback = String(e && e.parameter && e.parameter.callback || '').trim();
  try {
    if (!P2_READ_ACTIONS[action]) throw new Error('GET action is not allowed: ' + action);
    const payload = p2ParsePayload_(e && e.parameter && e.parameter.payload);
    return p2Output_({ok:true, action:action, result:P2_READ_ACTIONS[action](payload)}, callback);
  } catch (error) {
    return p2Output_({ok:false, action:action, error:p2ErrorMessage_(error)}, callback);
  }
}

function doPost(e) {
  let action = '';
  try {
    const bodyText = String(e && e.postData && e.postData.contents || '').trim();
    const body = bodyText ? JSON.parse(bodyText) : {};
    action = String(body.action || '').trim();
    if (!P2_WRITE_ACTIONS[action]) throw new Error('POST action is not allowed: ' + action);
    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    return p2Output_({ok:true, action:action, result:P2_WRITE_ACTIONS[action](payload)}, '');
  } catch (error) {
    return p2Output_({ok:false, action:action, error:p2ErrorMessage_(error)}, '');
  }
}

function p2Output_(value, callback) {
  const json = JSON.stringify(value);
  if (callback) {
    if (!/^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) throw new Error('Invalid callback name.');
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function p2ParsePayload_(text) {
  if (!text) return {};
  try { return JSON.parse(String(text)); }
  catch (_error) { throw new Error('payload must be valid JSON.'); }
}

function p2ErrorMessage_(error) {
  return error && error.message ? String(error.message) : String(error || 'Unknown error');
}

function p2Book_() {
  return SpreadsheetApp.openById(P2_SPREADSHEET_ID);
}

function p2Sheet_(name) {
  const sheet = p2Book_().getSheetByName(name);
  if (!sheet) throw new Error('Missing required sheet: ' + name);
  return sheet;
}

function p2Table_(sheetName, requiredHeader) {
  const sheet = p2Sheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  const headerIndex = values.findIndex(function(row) {
    return row.map(function(v){ return String(v || '').trim(); }).indexOf(requiredHeader) >= 0;
  });
  if (headerIndex < 0) throw new Error('Header ' + requiredHeader + ' not found in ' + sheetName + '.');

  const rawHeaders = values[headerIndex].map(function(v){ return String(v || '').trim(); });
  let lastHeader = rawHeaders.length - 1;
  while (lastHeader >= 0 && !rawHeaders[lastHeader]) lastHeader -= 1;
  const headers = rawHeaders.slice(0, lastHeader + 1);
  const records = [];

  for (let i = headerIndex + 1; i < values.length; i += 1) {
    const row = values[i].slice(0, headers.length);
    const hasValue = row.some(function(v){ return v !== '' && v !== null; });
    if (!hasValue) continue;
    const record = {_sheet_row:i + 1};
    headers.forEach(function(header, col) {
      if (header) record[header] = row[col];
    });
    records.push(record);
  }

  return {sheet:sheet, sheetName:sheetName, headerRow:headerIndex + 1, headers:headers, records:records};
}

function p2RecordRow_(table, record) {
  return table.headers.map(function(header) {
    return header && record[header] !== undefined ? record[header] : '';
  });
}

function p2Append_(table, record) {
  table.sheet.appendRow(p2RecordRow_(table, record));
  return table.sheet.getLastRow();
}

function p2Write_(table, rowNumber, record) {
  table.sheet.getRange(rowNumber, 1, 1, table.headers.length).setValues([p2RecordRow_(table, record)]);
}

function p2Clear_(table, rowNumber) {
  table.sheet.getRange(rowNumber, 1, 1, table.headers.length).clearContent();
}

function p2Bool_(value) {
  return value === true || String(value || '').trim().toUpperCase() === 'TRUE';
}

function p2Num_(value) {
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  const n = Number(String(value || '').replace(/[$,%\s,]/g, ''));
  return isFinite(n) ? n : 0;
}

function p2String_(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function p2Upper_(value) {
  return p2String_(value).toUpperCase();
}

function p2Norm_(value) {
  return p2String_(value).toLowerCase().replace(/\s+/g, ' ');
}

function p2Now_() { return new Date(); }

function p2DateOrBlank_(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value).length <= 10 ? String(value) + 'T12:00:00' : value);
  if (isNaN(date.getTime())) throw new Error('Invalid date: ' + value);
  return date;
}

function p2JsonText_(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function p2CompactId_(records, idColumn, prefix) {
  let max = 0;
  records.forEach(function(record) {
    const match = p2String_(record[idColumn]).match(/(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]) || 0);
  });
  return prefix + '-' + (max + 1);
}

function p2NextMovementSequence_(movementRecords) {
  return movementRecords.reduce(function(max, row) {
    return Math.max(max, p2Num_(row.movement_sequence));
  }, 0) + 1;
}

function p2BalanceKey_(productId, lotId, locationId) {
  return productId + '|' + lotId + '|' + locationId;
}

function p2RequireOperationId_(payload) {
  const operationId = p2String_(payload.operation_id);
  if (!operationId) throw new Error('operation_id is required for every inventory write.');
  if (operationId.length > 100) throw new Error('operation_id is too long.');
  return operationId;
}

function p2RequireActiveUser_(userId, allowedRoles) {
  const id = p2String_(userId);
  if (!id) throw new Error('user_id is required.');
  const users = p2Table_('USERS', 'user_id').records;
  const user = users.find(function(row) {
    return p2String_(row.user_id) === id && p2Bool_(row.is_active);
  });
  if (!user) throw new Error('Active user not found: ' + id);
  const role = p2Upper_(user.role);
  if (allowedRoles && allowedRoles.length && allowedRoles.indexOf(role) < 0) {
    throw new Error(role + ' is not allowed to perform this inventory action.');
  }
  return {user_id:id, full_name:p2String_(user.full_name), role:role};
}

function p2InventoryContext_() {
  const products = p2Table_('PRODUCTS', 'product_id');
  const units = p2Table_('PRODUCT_UNITS', 'product_unit_id');
  const locations = p2Table_('LOCATIONS', 'location_id');
  const lots = p2Table_('LOTS', 'lot_id');
  const balances = p2Table_('INVENTORY_BALANCES', 'balance_key');
  const movements = p2Table_('INVENTORY_MOVEMENTS', 'movement_sequence');
  return {
    productsTable:products, unitsTable:units, locationsTable:locations, lotsTable:lots, balancesTable:balances, movementsTable:movements,
    products:products.records, units:units.records, locations:locations.records, lots:lots.records, balances:balances.records, movements:movements.records
  };
}

function p2ActiveProduct_(ctx, productId) {
  const id = p2String_(productId);
  const row = ctx.products.find(function(product) {
    return p2String_(product.product_id) === id && p2Bool_(product.is_active);
  });
  if (!row) throw new Error('Active product not found: ' + id);
  return row;
}

function p2ActiveLocation_(ctx, locationId) {
  const id = p2Upper_(locationId);
  const row = ctx.locations.find(function(location) {
    return p2Upper_(location.location_id) === id && p2Bool_(location.is_active);
  });
  if (!row) throw new Error('Active location not found: ' + id);
  return row;
}

function p2Lot_(ctx, lotId, productId) {
  const id = p2String_(lotId);
  const row = ctx.lots.find(function(lot) { return p2String_(lot.lot_id) === id; });
  if (!row) throw new Error('Lot not found: ' + id);
  if (productId && p2String_(row.product_id) !== p2String_(productId)) throw new Error('Lot ' + id + ' does not belong to product ' + productId + '.');
  if (['CLOSED','REJECTED'].indexOf(p2Upper_(row.lot_status)) >= 0) throw new Error('Lot ' + id + ' is not available for inventory activity.');
  return row;
}

function p2Balance_(ctx, productId, lotId, locationId) {
  const key = p2BalanceKey_(p2String_(productId), p2String_(lotId), p2Upper_(locationId));
  return ctx.balances.find(function(balance) { return p2String_(balance.balance_key) === key; }) || null;
}

function p2FindOperation_(ctx, operationId) {
  const id = p2String_(operationId);
  return ctx.movements.find(function(movement) { return p2String_(movement.operation_id) === id; }) || null;
}

function p2CheckExpectedSequence_(balance, expectedSequence) {
  if (expectedSequence === undefined || expectedSequence === null || expectedSequence === '') return;
  const expected = Number(expectedSequence);
  if (!Number.isFinite(expected)) throw new Error('expected_source_sequence must be numeric.');
  const current = balance ? p2Num_(balance.last_movement_sequence) : 0;
  if (current !== expected) throw new Error('Inventory changed since this screen was loaded. Expected movement sequence ' + expected + ', current sequence is ' + current + '. Refresh the stock line.');
}

function p2ProductUnits_(ctx, productId) {
  return ctx.units.filter(function(unit) { return p2String_(unit.product_id) === p2String_(productId); }).map(function(unit) {
    return {
      product_unit_id:p2String_(unit.product_unit_id), unit_code:p2Upper_(unit.unit_code), conversion_to_base:p2Num_(unit.conversion_to_base),
      purchase_enabled:p2Bool_(unit.purchase_enabled), sales_enabled:p2Bool_(unit.sales_enabled),
      is_default_purchase:p2Bool_(unit.is_default_purchase), is_default_sales:p2Bool_(unit.is_default_sales)
    };
  });
}

function p2ExistingLotQuantity_(product, lot, enteredQty, enteredUnit) {
  const qty = Number(enteredQty);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Quantity must be greater than zero.');
  const unit = p2Upper_(enteredUnit);
  const baseUnit = p2Upper_(product.base_unit);
  const lotUnit = p2Upper_(lot.unit_code);
  let conversion = 0;
  if (unit === baseUnit) conversion = 1;
  else if (unit === lotUnit) conversion = p2Num_(lot.conversion_to_base);
  else throw new Error('For this lot, quantity must be entered as ' + baseUnit + ' or ' + lotUnit + '.');
  if (!(conversion > 0)) throw new Error('Lot conversion_to_base is invalid for ' + lot.lot_id + '.');
  return {entered_qty:qty, entered_unit:unit, conversion_to_base:conversion, quantity_base:qty * conversion};
}

function p2NewLotQuantity_(ctx, product, enteredQty, enteredUnit, suppliedConversion) {
  const qty = Number(enteredQty);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('Quantity must be greater than zero.');
  const unit = p2Upper_(enteredUnit);
  const baseUnit = p2Upper_(product.base_unit);
  let conversion = 0;
  if (unit === baseUnit) conversion = 1;
  else if (Number(suppliedConversion) > 0) conversion = Number(suppliedConversion);
  else {
    const productUnit = p2ProductUnits_(ctx, product.product_id).find(function(row) { return row.unit_code === unit; });
    conversion = productUnit ? productUnit.conversion_to_base : 0;
  }
  if (!(conversion > 0)) throw new Error('A valid conversion_to_base is required for ' + unit + '.');
  return {entered_qty:qty, entered_unit:unit, conversion_to_base:conversion, quantity_base:qty * conversion};
}

function p2LatestLotCost_(ctx, productId) {
  const rows = ctx.lots.filter(function(lot) { return p2String_(lot.product_id) === p2String_(productId) && p2Num_(lot.cost_per_base) > 0; });
  rows.sort(function(a, b) {
    const ad = a.received_at instanceof Date ? a.received_at.getTime() : new Date(a.received_at || 0).getTime();
    const bd = b.received_at instanceof Date ? b.received_at.getTime() : new Date(b.received_at || 0).getTime();
    return bd - ad;
  });
  return rows.length ? p2Num_(rows[0].cost_per_base) : 0;
}

function p2DecoratedBalance_(ctx, balance) {
  const product = ctx.products.find(function(row){ return p2String_(row.product_id) === p2String_(balance.product_id); }) || {};
  const lot = ctx.lots.find(function(row){ return p2String_(row.lot_id) === p2String_(balance.lot_id); }) || {};
  const location = ctx.locations.find(function(row){ return p2Upper_(row.location_id) === p2Upper_(balance.location_id); }) || {};
  const conversion = p2Num_(lot.conversion_to_base) || 1;
  const baseQty = p2Num_(balance.current_base_qty);
  return {
    balance_key:p2String_(balance.balance_key), product_id:p2String_(balance.product_id), product_name:p2String_(product.product_name), category:p2String_(product.category), base_unit:p2Upper_(product.base_unit),
    lot_id:p2String_(balance.lot_id), supplier_lot_number:p2String_(lot.supplier_lot_number), lot_unit:p2Upper_(lot.unit_code), lot_conversion_to_base:conversion,
    current_base_qty:baseQty, current_lot_unit_qty:baseQty / conversion, cost_per_base:p2Num_(lot.cost_per_base), expiration_date:lot.expiration_date || '', quality_status:p2Upper_(lot.quality_status), lot_status:p2Upper_(lot.lot_status),
    location_id:p2Upper_(balance.location_id), location_type:p2Upper_(location.location_type), rack:p2Upper_(location.rack), level:p2Upper_(location.level), position:p2Upper_(location.position),
    last_movement_sequence:p2Num_(balance.last_movement_sequence), updated_at:balance.updated_at || ''
  };
}

function p2PositiveBalances_(ctx) {
  return ctx.balances.filter(function(balance) { return p2Num_(balance.current_base_qty) > P2_EPSILON; });
}

function p2Summary_(ctx, decoratedBalances) {
  const byBaseUnit = {};
  const occupiedRackLocations = {};
  const locationProducts = {};
  decoratedBalances.forEach(function(balance) {
    const unit = balance.base_unit || 'UNKNOWN';
    byBaseUnit[unit] = (byBaseUnit[unit] || 0) + balance.current_base_qty;
    if (balance.location_type === 'RACK') occupiedRackLocations[balance.location_id] = true;
    if (!locationProducts[balance.location_id]) locationProducts[balance.location_id] = {};
    locationProducts[balance.location_id][balance.product_id] = true;
  });
  const activeRackLocations = ctx.locations.filter(function(location) { return p2Bool_(location.is_active) && p2Upper_(location.location_type) === 'RACK'; }).length;
  const occupiedRackCount = Object.keys(occupiedRackLocations).length;
  const mixedLocations = Object.keys(locationProducts).filter(function(locationId) { return Object.keys(locationProducts[locationId]).length > 1; }).length;
  return {
    by_base_unit:byBaseUnit, positive_balance_lines:decoratedBalances.length,
    active_locations:ctx.locations.filter(function(l){ return p2Bool_(l.is_active); }).length,
    active_rack_locations:activeRackLocations, occupied_rack_locations:occupiedRackCount,
    open_rack_locations:Math.max(0, activeRackLocations - occupiedRackCount),
    rack_utilization_pct:activeRackLocations ? occupiedRackCount / activeRackLocations * 100 : 0,
    mixed_locations:mixedLocations
  };
}

function p2InventoryBootstrap() {
  const ctx = p2InventoryContext_();
  const balances = p2PositiveBalances_(ctx).map(function(balance){ return p2DecoratedBalance_(ctx, balance); });
  const unitsByProduct = {};
  ctx.units.forEach(function(unit) {
    const productId = p2String_(unit.product_id);
    if (!unitsByProduct[productId]) unitsByProduct[productId] = [];
    unitsByProduct[productId].push({
      product_unit_id:p2String_(unit.product_unit_id), unit_code:p2Upper_(unit.unit_code), conversion_to_base:p2Num_(unit.conversion_to_base),
      purchase_enabled:p2Bool_(unit.purchase_enabled), sales_enabled:p2Bool_(unit.sales_enabled),
      is_default_purchase:p2Bool_(unit.is_default_purchase), is_default_sales:p2Bool_(unit.is_default_sales)
    });
  });
  const balanceTotals = {};
  balances.forEach(function(balance) { balanceTotals[balance.product_id] = (balanceTotals[balance.product_id] || 0) + balance.current_base_qty; });
  return {
    version:P2_INVENTORY_API_VERSION, generated_at:p2Now_(),
    products:ctx.products.filter(function(product){ return p2Bool_(product.is_active); }).map(function(product) {
      const productId = p2String_(product.product_id);
      return {
        product_id:productId, product_name:p2String_(product.product_name), category:p2String_(product.category),
        inventory_dimension:p2Upper_(product.inventory_dimension), base_unit:p2Upper_(product.base_unit), sku:p2String_(product.sku), barcode:p2String_(product.barcode),
        on_hand_base:balanceTotals[productId] || 0, units:unitsByProduct[productId] || []
      };
    }),
    locations:ctx.locations.filter(function(location){ return p2Bool_(location.is_active); }).map(function(location) {
      return {location_id:p2Upper_(location.location_id), location_type:p2Upper_(location.location_type), rack:p2Upper_(location.rack), level:p2Upper_(location.level), position:p2Upper_(location.position), scan_code:p2String_(location.scan_code), notes:p2String_(location.notes)};
    }),
    balances:balances, summary:p2Summary_(ctx, balances)
  };
}

function p2GetLocationInventory(payload) {
  const ctx = p2InventoryContext_();
  const location = p2ActiveLocation_(ctx, payload.location_id);
  const balances = p2PositiveBalances_(ctx).filter(function(balance){ return p2Upper_(balance.location_id) === p2Upper_(location.location_id); }).map(function(balance){ return p2DecoratedBalance_(ctx, balance); });
  return {
    version:P2_INVENTORY_API_VERSION,
    location:{location_id:p2Upper_(location.location_id), location_type:p2Upper_(location.location_type), rack:p2Upper_(location.rack), level:p2Upper_(location.level), position:p2Upper_(location.position), scan_code:p2String_(location.scan_code), notes:p2String_(location.notes)},
    stock_lines:balances, is_empty:balances.length === 0,
    product_count:Object.keys(balances.reduce(function(map, line){ map[line.product_id] = true; return map; }, {})).length,
    total_by_base_unit:balances.reduce(function(map, line){ map[line.base_unit] = (map[line.base_unit] || 0) + line.current_base_qty; return map; }, {})
  };
}

function p2GetRackInventory(payload) {
  const ctx = p2InventoryContext_();
  const rack = p2Upper_(payload.rack);
  if (!/^R(?:0[1-9]|[1-4]\d|50)$/.test(rack)) throw new Error('Rack must be R01 through R50.');
  const rackLocations = ctx.locations.filter(function(location) { return p2Bool_(location.is_active) && p2Upper_(location.rack) === rack; });
  if (!rackLocations.length) throw new Error('Active rack not found: ' + rack);
  const lines = p2PositiveBalances_(ctx).map(function(balance){ return p2DecoratedBalance_(ctx, balance); });
  return {
    version:P2_INVENTORY_API_VERSION, rack:rack,
    spaces:rackLocations.map(function(location) {
      const locationId = p2Upper_(location.location_id);
      const stock = lines.filter(function(line){ return line.location_id === locationId; });
      return {location_id:locationId, level:p2Upper_(location.level), position:p2Upper_(location.position), stock_lines:stock, is_empty:stock.length === 0, product_count:Object.keys(stock.reduce(function(map, line){ map[line.product_id] = true; return map; }, {})).length};
    })
  };
}

function p2GetProductInventory(payload) {
  const ctx = p2InventoryContext_();
  const product = p2ActiveProduct_(ctx, payload.product_id);
  const balances = p2PositiveBalances_(ctx).filter(function(balance){ return p2String_(balance.product_id) === p2String_(product.product_id); }).map(function(balance){ return p2DecoratedBalance_(ctx, balance); });
  return {
    version:P2_INVENTORY_API_VERSION,
    product:{product_id:p2String_(product.product_id), product_name:p2String_(product.product_name), category:p2String_(product.category), inventory_dimension:p2Upper_(product.inventory_dimension), base_unit:p2Upper_(product.base_unit), sku:p2String_(product.sku), barcode:p2String_(product.barcode)},
    units:p2ProductUnits_(ctx, product.product_id), stock_lines:balances,
    on_hand_base:balances.reduce(function(sum, line){ return sum + line.current_base_qty; }, 0)
  };
}

function p2GetMovementHistory(payload) {
  const ctx = p2InventoryContext_();
  const productId = p2String_(payload.product_id);
  const lotId = p2String_(payload.lot_id);
  const locationId = p2Upper_(payload.location_id);
  const limit = Math.max(1, Math.min(P2_MAX_HISTORY, Number(payload.limit) || 50));
  return ctx.movements.filter(function(movement) {
    if (productId && p2String_(movement.product_id) !== productId) return false;
    if (lotId && p2String_(movement.lot_id) !== lotId) return false;
    if (locationId && p2Upper_(movement.from_location_id) !== locationId && p2Upper_(movement.to_location_id) !== locationId) return false;
    return true;
  }).sort(function(a, b) { return p2Num_(b.movement_sequence) - p2Num_(a.movement_sequence); }).slice(0, limit).map(function(movement) {
    return {
      movement_sequence:p2Num_(movement.movement_sequence), movement_id:p2String_(movement.movement_id), movement_type:p2Upper_(movement.movement_type), occurred_at:movement.occurred_at || '',
      product_id:p2String_(movement.product_id), lot_id:p2String_(movement.lot_id), quantity_base:p2Num_(movement.quantity_base), entered_qty:p2Num_(movement.entered_qty), entered_unit:p2Upper_(movement.entered_unit), conversion_to_base:p2Num_(movement.conversion_to_base),
      from_location_id:p2Upper_(movement.from_location_id), to_location_id:p2Upper_(movement.to_location_id), operation_id:p2String_(movement.operation_id), user_id:p2String_(movement.user_id), approval_status:p2Upper_(movement.approval_status), notes:p2String_(movement.notes)
    };
  });
}

function p2InventoryHealth() {
  const ctx = p2InventoryContext_();
  const allBalances = ctx.balances;
  const positive = p2PositiveBalances_(ctx);
  const productIds = {};
  const lotIds = {};
  const locationIds = {};
  ctx.products.forEach(function(row){ productIds[p2String_(row.product_id)] = true; });
  ctx.lots.forEach(function(row){ lotIds[p2String_(row.lot_id)] = p2String_(row.product_id); });
  ctx.locations.forEach(function(row){ locationIds[p2Upper_(row.location_id)] = true; });
  const keyCounts = {};
  let orphanProduct = 0, orphanLot = 0, wrongLotProduct = 0, orphanLocation = 0, negative = 0;
  allBalances.forEach(function(balance) {
    const key = p2String_(balance.balance_key);
    keyCounts[key] = (keyCounts[key] || 0) + 1;
    if (!productIds[p2String_(balance.product_id)]) orphanProduct += 1;
    if (!lotIds[p2String_(balance.lot_id)]) orphanLot += 1;
    else if (lotIds[p2String_(balance.lot_id)] !== p2String_(balance.product_id)) wrongLotProduct += 1;
    if (!locationIds[p2Upper_(balance.location_id)]) orphanLocation += 1;
    if (p2Num_(balance.current_base_qty) < -P2_EPSILON) negative += 1;
  });
  const decorated = positive.map(function(balance){ return p2DecoratedBalance_(ctx, balance); });
  return {
    version:P2_INVENTORY_API_VERSION, spreadsheet_id:P2_SPREADSHEET_ID,
    active_products:ctx.products.filter(function(row){ return p2Bool_(row.is_active); }).length,
    active_locations:ctx.locations.filter(function(row){ return p2Bool_(row.is_active); }).length,
    positive_balance_lines:positive.length, movement_rows:ctx.movements.length,
    duplicate_balance_keys:Object.keys(keyCounts).filter(function(key){ return keyCounts[key] > 1; }).length,
    orphan_product_balances:orphanProduct, orphan_lot_balances:orphanLot, wrong_product_lot_balances:wrongLotProduct, orphan_location_balances:orphanLocation, negative_balance_lines:negative,
    summary:p2Summary_(ctx, decorated)
  };
}

function p2InventoryContract() {
  return {
    version:P2_INVENTORY_API_VERSION,
    reads:['inventoryHealth','inventoryBootstrap','getLocationInventory','getRackInventory','getProductInventory','getMovementHistory'],
    writes:['moveInventory','adjustInventoryIn','adjustInventoryOut','physicalCount','packingDeduct'],
    rules:{
      GET:'read only', POST:'inventory writes only', balance_key:'product_id|lot_id|location_id', zero_balances:'cleared from INVENTORY_BALANCES', mixed_locations:'allowed',
      move:'does not change total company inventory', adjust_in:'increases total company inventory', adjust_out:'decreases total company inventory', packing_deduct:'decreases total company inventory from PACKING',
      idempotency:'operation_id is mandatory on every write', concurrency:'optional expected_source_sequence rejects stale stock selections'
    }
  };
}

function p2WithInventoryLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); }
  finally { lock.releaseLock(); }
}

function p2DuplicateOperationResult_(movement) {
  return {duplicate:true, operation_id:p2String_(movement.operation_id), movement_id:p2String_(movement.movement_id), movement_sequence:p2Num_(movement.movement_sequence), movement_type:p2Upper_(movement.movement_type)};
}

function p2BalanceMutation_(ctx, productId, lotId, locationId, newQty, movementSequence, now) {
  const key = p2BalanceKey_(productId, lotId, locationId);
  const existing = p2Balance_(ctx, productId, lotId, locationId);
  const snapshot = {table:ctx.balancesTable, existed:Boolean(existing), row:existing ? existing._sheet_row : null, oldRecord:existing ? Object.assign({}, existing) : null, appended:false};
  if (newQty > P2_EPSILON) {
    const record = {balance_key:key, product_id:productId, lot_id:lotId, location_id:locationId, current_base_qty:newQty, last_movement_sequence:movementSequence, updated_at:now};
    if (existing) p2Write_(ctx.balancesTable, existing._sheet_row, record);
    else { snapshot.row = p2Append_(ctx.balancesTable, record); snapshot.appended = true; }
  } else if (existing) p2Clear_(ctx.balancesTable, existing._sheet_row);
  return snapshot;
}

function p2RollbackBalances_(snapshots) {
  snapshots.slice().reverse().forEach(function(snapshot) {
    try {
      if (snapshot.appended) p2Clear_(snapshot.table, snapshot.row);
      else if (snapshot.existed) p2Write_(snapshot.table, snapshot.row, snapshot.oldRecord);
    } catch (_ignore) {}
  });
}

function p2Audit_(actor, actionType, tableName, recordId, oldValue, newValue, notes) {
  try {
    const audit = p2Table_('AUDIT_LOG', 'audit_id');
    const auditId = p2CompactId_(audit.records, 'audit_id', 'AUD');
    p2Append_(audit, {audit_id:auditId, occurred_at:p2Now_(), user_id:actor.user_id, action_type:actionType, table_name:tableName, record_id:recordId, old_value:p2JsonText_(oldValue), new_value:p2JsonText_(newValue), notes:notes || ''});
  } catch (_auditError) {}
}

function p2ExecuteMovement_(args) {
  const ctx = args.ctx;
  const movementSequence = p2NextMovementSequence_(ctx.movements);
  const now = p2Now_();
  const snapshots = [];
  let movementRowNumber = null;
  try {
    if (args.source) snapshots.push(p2BalanceMutation_(ctx, args.productId, args.lotId, args.source.locationId, args.source.newQty, movementSequence, now));
    if (args.destination) snapshots.push(p2BalanceMutation_(ctx, args.productId, args.lotId, args.destination.locationId, args.destination.newQty, movementSequence, now));
    const movementId = p2CompactId_(ctx.movements, 'movement_id', 'MOV');
    const movementRow = {
      movement_sequence:movementSequence, movement_id:movementId, movement_type:args.movementType, occurred_at:now,
      product_id:args.productId, lot_id:args.lotId, quantity_base:args.quantity.quantity_base, entered_qty:args.quantity.entered_qty, entered_unit:args.quantity.entered_unit, conversion_to_base:args.quantity.conversion_to_base,
      from_location_id:args.fromLocation || '', to_location_id:args.toLocation || '', order_id:'', order_line_id:'', task_id:'', operation_id:args.operationId, user_id:args.actor.user_id, approval_status:'APPROVED', notes:args.notes || ''
    };
    movementRowNumber = p2Append_(ctx.movementsTable, movementRow);
    SpreadsheetApp.flush();
    p2Audit_(args.actor, args.auditAction || args.movementType, 'INVENTORY_BALANCES', args.productId + '|' + args.lotId, args.auditOld || {}, args.auditNew || {}, args.operationId);
    return {
      duplicate:false, operation_id:args.operationId, movement_id:movementId, movement_sequence:movementSequence, movement_type:args.movementType,
      product_id:args.productId, lot_id:args.lotId, quantity_base:args.quantity.quantity_base, entered_qty:args.quantity.entered_qty, entered_unit:args.quantity.entered_unit, conversion_to_base:args.quantity.conversion_to_base,
      from_location_id:args.fromLocation || '', to_location_id:args.toLocation || ''
    };
  } catch (error) {
    if (movementRowNumber) { try { p2Clear_(ctx.movementsTable, movementRowNumber); } catch (_ignoreMovement) {} }
    p2RollbackBalances_(snapshots);
    try { SpreadsheetApp.flush(); } catch (_ignoreFlush) {}
    throw error;
  }
}

function p2MoveInventory(payload) {
  return p2WithInventoryLock_(function() {
    const actor = p2RequireActiveUser_(payload.user_id, ['ADMIN','MANAGER','OPERATOR']);
    const operationId = p2RequireOperationId_(payload);
    const ctx = p2InventoryContext_();
    const duplicate = p2FindOperation_(ctx, operationId);
    if (duplicate) return p2DuplicateOperationResult_(duplicate);
    const product = p2ActiveProduct_(ctx, payload.product_id);
    const lot = p2Lot_(ctx, payload.lot_id, product.product_id);
    const from = p2ActiveLocation_(ctx, payload.from_location_id);
    const to = p2ActiveLocation_(ctx, payload.to_location_id);
    const fromId = p2Upper_(from.location_id), toId = p2Upper_(to.location_id);
    if (fromId === toId) throw new Error('Source and destination must be different.');
    const source = p2Balance_(ctx, product.product_id, lot.lot_id, fromId);
    if (!source || p2Num_(source.current_base_qty) <= P2_EPSILON) throw new Error('No positive source balance exists at ' + fromId + '.');
    p2CheckExpectedSequence_(source, payload.expected_source_sequence);
    const quantity = p2ExistingLotQuantity_(product, lot, payload.quantity, payload.unit_code);
    const sourceQty = p2Num_(source.current_base_qty);
    if (quantity.quantity_base - sourceQty > P2_EPSILON) throw new Error('Only ' + sourceQty + ' ' + p2Upper_(product.base_unit) + ' are available at ' + fromId + '.');
    const destination = p2Balance_(ctx, product.product_id, lot.lot_id, toId);
    const destinationQty = destination ? p2Num_(destination.current_base_qty) : 0;
    return p2ExecuteMovement_({
      ctx:ctx, actor:actor, operationId:operationId, movementType:'MOVE', productId:p2String_(product.product_id), lotId:p2String_(lot.lot_id), quantity:quantity,
      fromLocation:fromId, toLocation:toId, source:{locationId:fromId, newQty:sourceQty - quantity.quantity_base}, destination:{locationId:toId, newQty:destinationQty + quantity.quantity_base},
      notes:'INVENTORY_MOVE' + (payload.notes ? ' · ' + p2String_(payload.notes) : ''), auditOld:{from:sourceQty,to:destinationQty}, auditNew:{from:sourceQty - quantity.quantity_base,to:destinationQty + quantity.quantity_base}
    });
  });
}

function p2CreateCountLot_(ctx, product, quantity, payload) {
  const lotId = p2CompactId_(ctx.lots, 'lot_id', 'LOT');
  const suppliedCostText = payload.cost_per_base === undefined || payload.cost_per_base === null ? '' : String(payload.cost_per_base).trim();
  const suppliedCost = suppliedCostText === '' ? NaN : Number(suppliedCostText);
  const fallbackCost = p2LatestLotCost_(ctx, product.product_id);
  const cost = Number.isFinite(suppliedCost) && suppliedCost >= 0 ? suppliedCost : fallbackCost;
  const row = {
    lot_id:lotId, product_id:p2String_(product.product_id), vendor_party_id:'', source_order_line_id:'', supplier_lot_number:p2String_(payload.supplier_lot_number),
    received_at:p2Now_(), received_base_qty:quantity.quantity_base, received_unit_qty:quantity.entered_qty, unit_code:quantity.entered_unit, conversion_to_base:quantity.conversion_to_base,
    cost_per_base:cost, currency:'USD', expiration_date:p2DateOrBlank_(payload.expiration_date), quality_status:'PASS', lot_status:'ACTIVE', created_at:p2Now_(),
    notes:'PHYSICAL COUNT LOT. Historical receipt record unavailable.' + (cost > 0 ? ' Cost seeded from supplied/latest known lot cost.' : ' VALUATION REQUIRED.') + (payload.notes ? ' ' + p2String_(payload.notes) : '')
  };
  const rowNumber = p2Append_(ctx.lotsTable, row);
  return {row:row,rowNumber:rowNumber,created:true};
}

function p2ResolveAdjustInLot_(ctx, product, payload) {
  if (payload.lot_id) {
    const lot = p2Lot_(ctx, payload.lot_id, product.product_id);
    const quantity = p2ExistingLotQuantity_(product, lot, payload.quantity, payload.unit_code);
    return {lot:lot, quantity:quantity, createdLot:null};
  }
  const unit = p2Upper_(payload.unit_code || product.base_unit);
  const quantity = p2NewLotQuantity_(ctx, product, payload.quantity, unit, payload.conversion_to_base);
  const supplierLot = p2Norm_(payload.supplier_lot_number);
  let existingLot = null;
  if (supplierLot) {
    existingLot = ctx.lots.find(function(lot) {
      return p2String_(lot.product_id) === p2String_(product.product_id) && p2Norm_(lot.supplier_lot_number) === supplierLot && p2Upper_(lot.unit_code) === quantity.entered_unit &&
        Math.abs(p2Num_(lot.conversion_to_base) - quantity.conversion_to_base) <= P2_EPSILON && ['ACTIVE','HOLD',''].indexOf(p2Upper_(lot.lot_status)) >= 0;
    }) || null;
  }
  if (existingLot) return {lot:existingLot, quantity:quantity, createdLot:null};
  const createdLot = p2CreateCountLot_(ctx, product, quantity, payload);
  return {lot:createdLot.row, quantity:quantity, createdLot:createdLot};
}

function p2AdjustInventoryIn(payload) {
  return p2WithInventoryLock_(function() {
    const actor = p2RequireActiveUser_(payload.user_id, ['ADMIN','MANAGER']);
    const operationId = p2RequireOperationId_(payload);
    const ctx = p2InventoryContext_();
    const duplicate = p2FindOperation_(ctx, operationId);
    if (duplicate) return p2DuplicateOperationResult_(duplicate);
    const product = p2ActiveProduct_(ctx, payload.product_id);
    const location = p2ActiveLocation_(ctx, payload.location_id);
    const locationId = p2Upper_(location.location_id);
    let resolved = null;
    try {
      resolved = p2ResolveAdjustInLot_(ctx, product, payload);
      const lot = resolved.lot, quantity = resolved.quantity;
      const balance = p2Balance_(ctx, product.product_id, lot.lot_id, locationId);
      const oldQty = balance ? p2Num_(balance.current_base_qty) : 0;
      const result = p2ExecuteMovement_({
        ctx:ctx, actor:actor, operationId:operationId, movementType:'ADJUST_IN', productId:p2String_(product.product_id), lotId:p2String_(lot.lot_id), quantity:quantity,
        fromLocation:'', toLocation:locationId, destination:{locationId:locationId, newQty:oldQty + quantity.quantity_base},
        notes:'MANUAL_INVENTORY_ADJUST_IN' + (payload.reason ? ' · ' + p2String_(payload.reason) : '') + (payload.notes ? ' · ' + p2String_(payload.notes) : ''),
        auditOld:{location:locationId,qty:oldQty}, auditNew:{location:locationId,qty:oldQty + quantity.quantity_base}
      });
      result.created_lot = Boolean(resolved.createdLot);
      result.new_balance_base_qty = oldQty + quantity.quantity_base;
      return result;
    } catch (error) {
      if (resolved && resolved.createdLot) { try { p2Clear_(ctx.lotsTable, resolved.createdLot.rowNumber); } catch (_ignoreLot) {} }
      throw error;
    }
  });
}

function p2AdjustInventoryOut(payload) {
  return p2WithInventoryLock_(function() {
    const actor = p2RequireActiveUser_(payload.user_id, ['ADMIN','MANAGER']);
    const operationId = p2RequireOperationId_(payload);
    const ctx = p2InventoryContext_();
    const duplicate = p2FindOperation_(ctx, operationId);
    if (duplicate) return p2DuplicateOperationResult_(duplicate);
    const product = p2ActiveProduct_(ctx, payload.product_id);
    const lot = p2Lot_(ctx, payload.lot_id, product.product_id);
    const location = p2ActiveLocation_(ctx, payload.location_id);
    const locationId = p2Upper_(location.location_id);
    const balance = p2Balance_(ctx, product.product_id, lot.lot_id, locationId);
    if (!balance || p2Num_(balance.current_base_qty) <= P2_EPSILON) throw new Error('No positive balance exists for this product/lot/location.');
    p2CheckExpectedSequence_(balance, payload.expected_source_sequence);
    const quantity = p2ExistingLotQuantity_(product, lot, payload.quantity, payload.unit_code);
    const oldQty = p2Num_(balance.current_base_qty);
    if (quantity.quantity_base - oldQty > P2_EPSILON) throw new Error('Cannot remove more than the current balance of ' + oldQty + ' ' + p2Upper_(product.base_unit) + '.');
    const result = p2ExecuteMovement_({
      ctx:ctx, actor:actor, operationId:operationId, movementType:'ADJUST_OUT', productId:p2String_(product.product_id), lotId:p2String_(lot.lot_id), quantity:quantity,
      fromLocation:locationId, toLocation:'', source:{locationId:locationId, newQty:oldQty - quantity.quantity_base},
      notes:'MANUAL_INVENTORY_ADJUST_OUT' + (payload.reason ? ' · ' + p2String_(payload.reason) : '') + (payload.notes ? ' · ' + p2String_(payload.notes) : ''),
      auditOld:{location:locationId,qty:oldQty}, auditNew:{location:locationId,qty:oldQty - quantity.quantity_base}
    });
    result.new_balance_base_qty = Math.max(0, oldQty - quantity.quantity_base);
    return result;
  });
}

function p2PhysicalCount(payload) {
  return p2WithInventoryLock_(function() {
    const actor = p2RequireActiveUser_(payload.user_id, ['ADMIN','MANAGER','OPERATOR']);
    const operationId = p2RequireOperationId_(payload);
    const ctx = p2InventoryContext_();
    const duplicate = p2FindOperation_(ctx, operationId);
    if (duplicate) return p2DuplicateOperationResult_(duplicate);
    const product = p2ActiveProduct_(ctx, payload.product_id);
    const lot = p2Lot_(ctx, payload.lot_id, product.product_id);
    const location = p2ActiveLocation_(ctx, payload.location_id);
    const locationId = p2Upper_(location.location_id);
    const balance = p2Balance_(ctx, product.product_id, lot.lot_id, locationId);
    const currentQty = balance ? p2Num_(balance.current_base_qty) : 0;
    p2CheckExpectedSequence_(balance, payload.expected_source_sequence);
    const actual = Number(payload.actual_quantity);
    if (!Number.isFinite(actual) || actual < 0) throw new Error('actual_quantity must be zero or greater.');
    const unit = p2Upper_(payload.unit_code || product.base_unit);
    let conversion = 0;
    if (unit === p2Upper_(product.base_unit)) conversion = 1;
    else if (unit === p2Upper_(lot.unit_code)) conversion = p2Num_(lot.conversion_to_base);
    else throw new Error('Physical count must be entered as ' + p2Upper_(product.base_unit) + ' or ' + p2Upper_(lot.unit_code) + '.');
    if (!(conversion > 0)) throw new Error('Lot conversion is invalid.');
    const actualBase = actual * conversion;
    const delta = actualBase - currentQty;
    if (Math.abs(delta) <= P2_EPSILON) {
      p2Audit_(actor, 'PHYSICAL_COUNT_VERIFIED', 'INVENTORY_BALANCES', p2BalanceKey_(product.product_id, lot.lot_id, locationId), {qty:currentQty}, {qty:currentQty}, operationId + ' · no difference');
      return {duplicate:false, operation_id:operationId, movement_id:'', movement_type:'NO_CHANGE', product_id:p2String_(product.product_id), lot_id:p2String_(lot.lot_id), location_id:locationId, previous_base_qty:currentQty, actual_base_qty:actualBase, difference_base_qty:0};
    }
    const movementType = delta > 0 ? 'ADJUST_IN' : 'ADJUST_OUT';
    const differenceBase = Math.abs(delta);
    const quantity = {entered_qty:differenceBase / conversion, entered_unit:unit, conversion_to_base:conversion, quantity_base:differenceBase};
    const result = p2ExecuteMovement_({
      ctx:ctx, actor:actor, operationId:operationId, movementType:movementType, productId:p2String_(product.product_id), lotId:p2String_(lot.lot_id), quantity:quantity,
      fromLocation:delta < 0 ? locationId : '', toLocation:delta > 0 ? locationId : '', source:delta < 0 ? {locationId:locationId,newQty:actualBase} : null, destination:delta > 0 ? {locationId:locationId,newQty:actualBase} : null,
      notes:'PHYSICAL_COUNT · actual ' + actual + ' ' + unit + (payload.notes ? ' · ' + p2String_(payload.notes) : ''), auditAction:'PHYSICAL_COUNT_' + movementType,
      auditOld:{location:locationId,qty:currentQty}, auditNew:{location:locationId,qty:actualBase}
    });
    result.location_id = locationId;
    result.previous_base_qty = currentQty;
    result.actual_base_qty = actualBase;
    result.difference_base_qty = delta;
    return result;
  });
}

function p2PackingDeduct(payload) {
  return p2WithInventoryLock_(function() {
    const actor = p2RequireActiveUser_(payload.user_id, ['ADMIN','MANAGER','OPERATOR']);
    const operationId = p2RequireOperationId_(payload);
    const ctx = p2InventoryContext_();
    const duplicate = p2FindOperation_(ctx, operationId);
    if (duplicate) return p2DuplicateOperationResult_(duplicate);
    const product = p2ActiveProduct_(ctx, payload.product_id);
    const lot = p2Lot_(ctx, payload.lot_id, product.product_id);
    p2ActiveLocation_(ctx, 'PACKING');
    const balance = p2Balance_(ctx, product.product_id, lot.lot_id, 'PACKING');
    if (!balance || p2Num_(balance.current_base_qty) <= P2_EPSILON) throw new Error('No positive PACKING balance exists for this product and lot.');
    p2CheckExpectedSequence_(balance, payload.expected_source_sequence);
    const quantity = p2ExistingLotQuantity_(product, lot, payload.quantity, payload.unit_code);
    const oldQty = p2Num_(balance.current_base_qty);
    if (quantity.quantity_base - oldQty > P2_EPSILON) throw new Error('Cannot deduct more than ' + oldQty + ' ' + p2Upper_(product.base_unit) + ' from PACKING.');
    const result = p2ExecuteMovement_({
      ctx:ctx, actor:actor, operationId:operationId, movementType:'PACKING_DEDUCT', productId:p2String_(product.product_id), lotId:p2String_(lot.lot_id), quantity:quantity,
      fromLocation:'PACKING', toLocation:'', source:{locationId:'PACKING', newQty:oldQty - quantity.quantity_base},
      notes:'PACKING_DEDUCT' + (payload.notes ? ' · ' + p2String_(payload.notes) : ''), auditOld:{location:'PACKING',qty:oldQty}, auditNew:{location:'PACKING',qty:oldQty - quantity.quantity_base}
    });
    result.new_packing_balance_base_qty = Math.max(0, oldQty - quantity.quantity_base);
    return result;
  });
}
