/** Inventory read model built from PRODUCTS, LOTS, BALANCES, and LOCATIONS. */

function sjInventoryContext_() {
  var products = sjTable_('PRODUCTS');
  var units = sjTable_('PRODUCT_UNITS');
  var locations = sjTable_('LOCATIONS');
  var lots = sjTable_('LOTS');
  var balances = sjTable_('INVENTORY_BALANCES');
  var movements = sjTable_('INVENTORY_MOVEMENTS');
  return {
    productsTable: products, unitsTable: units, locationsTable: locations, lotsTable: lots,
    balancesTable: balances, movementsTable: movements, products: products.records,
    units: units.records, locations: locations.records, lots: lots.records,
    balances: balances.records, movements: movements.records
  };
}

function sjInventoryProduct_(context, productId) {
  var product = context.products.find(function (row) { return sjString_(row.product_id) === sjString_(productId) && sjActive_(row); });
  if (!product) throw new Error('Active product was not found: ' + sjString_(productId) + '.');
  return product;
}

function sjInventoryLocation_(context, locationId) {
  var wanted = sjUpper_(locationId);
  var location = context.locations.find(function (row) { return sjUpper_(row.location_id) === wanted && sjActive_(row); });
  if (!location) throw new Error('Active location was not found: ' + wanted + '.');
  return location;
}

function sjInventoryLot_(context, lotId, productId) {
  var lot = context.lots.find(function (row) { return sjString_(row.lot_id) === sjString_(lotId); });
  if (!lot) throw new Error('Lot was not found: ' + sjString_(lotId) + '.');
  if (productId && sjString_(lot.product_id) !== sjString_(productId)) throw new Error('Lot does not belong to the selected product.');
  if (['CLOSED', 'REJECTED'].indexOf(sjUpper_(lot.lot_status)) >= 0) throw new Error('Lot is not available for inventory activity.');
  return lot;
}

function sjBalance_(context, productId, lotId, locationId) {
  var key = sjBalanceKey_(productId, lotId, locationId);
  return context.balances.find(function (row) { return sjString_(row.balance_key) === key; }) || null;
}

function sjDecoratedBalance_(context, balance) {
  var product = context.products.find(function (row) { return sjString_(row.product_id) === sjString_(balance.product_id); }) || {};
  var lot = context.lots.find(function (row) { return sjString_(row.lot_id) === sjString_(balance.lot_id); }) || {};
  var location = context.locations.find(function (row) { return sjUpper_(row.location_id) === sjUpper_(balance.location_id); }) || {};
  var conversion = sjNumber_(lot.conversion_to_base) || 1;
  var quantity = sjNumber_(balance.current_base_qty);
  var cost = sjNumber_(lot.cost_per_base);
  return {
    balance_key: sjString_(balance.balance_key), product_id: sjString_(balance.product_id),
    product_name: sjString_(product.product_name), category: sjString_(product.category),
    inventory_dimension: sjUpper_(product.inventory_dimension), base_unit: sjUpper_(product.base_unit),
    lot_id: sjString_(balance.lot_id), supplier_lot_number: sjString_(lot.supplier_lot_number),
    lot_unit: sjUpper_(lot.unit_code), lot_conversion_to_base: conversion,
    current_base_qty: quantity, current_lot_unit_qty: quantity / conversion,
    cost_per_base: cost, inventory_value: quantity * cost, received_at: lot.received_at || '',
    expiration_date: lot.expiration_date || '', quality_status: sjUpper_(lot.quality_status),
    lot_status: sjUpper_(lot.lot_status), location_id: sjUpper_(balance.location_id),
    location_type: sjUpper_(location.location_type), rack: sjUpper_(location.rack),
    level: sjUpper_(location.level), position: sjUpper_(location.position), scan_code: sjString_(location.scan_code),
    last_movement_sequence: sjNumber_(balance.last_movement_sequence), updated_at: balance.updated_at || ''
  };
}

function sjPositiveBalanceRows_(context) {
  return context.balances.filter(function (row) { return sjNumber_(row.current_base_qty) > SJ_CONFIG.EPSILON; });
}

function sjInventorySummary_(context, lines) {
  var byUnit = {};
  var occupied = {};
  var productsAtLocation = {};
  var value = 0;
  lines.forEach(function (line) {
    var unit = line.base_unit || 'UNKNOWN';
    byUnit[unit] = (byUnit[unit] || 0) + line.current_base_qty;
    value += line.inventory_value || 0;
    if (line.location_type === 'RACK') occupied[line.location_id] = true;
    if (!productsAtLocation[line.location_id]) productsAtLocation[line.location_id] = {};
    productsAtLocation[line.location_id][line.product_id] = true;
  });
  var rackTotal = context.locations.filter(function (location) { return sjActive_(location) && sjUpper_(location.location_type) === 'RACK'; }).length;
  var rackUsed = Object.keys(occupied).length;
  return {
    by_base_unit: byUnit, inventory_value_usd: value, positive_balance_lines: lines.length,
    active_locations: context.locations.filter(sjActive_).length, active_rack_locations: rackTotal,
    occupied_rack_locations: rackUsed, open_rack_locations: Math.max(0, rackTotal - rackUsed),
    rack_utilization_pct: rackTotal ? rackUsed / rackTotal * 100 : 0,
    mixed_locations: Object.keys(productsAtLocation).filter(function (locationId) { return Object.keys(productsAtLocation[locationId]).length > 1; }).length
  };
}

function sjInventoryBootstrap() {
  var context = sjInventoryContext_();
  var lines = sjPositiveBalanceRows_(context).map(function (balance) { return sjDecoratedBalance_(context, balance); });
  var totals = {};
  lines.forEach(function (line) { totals[line.product_id] = (totals[line.product_id] || 0) + line.current_base_qty; });
  var products = context.products.filter(sjActive_).map(function (product) {
    var value = sjPublicRecord_(product);
    value.units = context.units.filter(function (unit) { return sjString_(unit.product_id) === sjString_(product.product_id); }).map(sjPublicRecord_);
    value.on_hand_base = totals[product.product_id] || 0;
    return value;
  });
  return {
    version: SJ_CONFIG.API_VERSION, generated_at: sjNow_(), products: products,
    locations: context.locations.filter(sjActive_).map(sjPublicRecord_), balances: lines,
    summary: sjInventorySummary_(context, lines)
  };
}

function sjInventoryMetrics() {
  var bootstrap = sjInventoryBootstrap();
  return Object.assign({generated_at: bootstrap.generated_at}, bootstrap.summary);
}

function sjInventoryFormOptions() {
  var bootstrap = sjInventoryBootstrap();
  return {products: bootstrap.products, locations: bootstrap.locations};
}

function sjGetLocationInventory(payload) {
  var context = sjInventoryContext_();
  var location = sjInventoryLocation_(context, sjRequired_(payload && payload.location_id, 'location_id'));
  var lines = sjPositiveBalanceRows_(context).filter(function (row) { return sjUpper_(row.location_id) === sjUpper_(location.location_id); }).map(function (row) { return sjDecoratedBalance_(context, row); });
  return {location: sjPublicRecord_(location), lines: lines};
}

function sjGetRackInventory(payload) {
  var context = sjInventoryContext_();
  var rack = sjUpper_(sjRequired_(payload && payload.rack, 'rack'));
  var balances = sjPositiveBalanceRows_(context);
  var spaces = context.locations.filter(function (location) { return sjActive_(location) && sjUpper_(location.rack) === rack; }).map(function (location) {
    return {location: sjPublicRecord_(location), lines: balances.filter(function (row) { return sjUpper_(row.location_id) === sjUpper_(location.location_id); }).map(function (row) { return sjDecoratedBalance_(context, row); })};
  });
  if (!spaces.length) throw new Error('Rack was not found: ' + rack + '.');
  return {rack: rack, spaces: spaces};
}

function sjGetProductInventory(payload) {
  var context = sjInventoryContext_();
  var product = sjInventoryProduct_(context, sjRequired_(payload && payload.product_id, 'product_id'));
  var lines = sjPositiveBalanceRows_(context).filter(function (row) { return sjString_(row.product_id) === sjString_(product.product_id); }).map(function (row) { return sjDecoratedBalance_(context, row); });
  return {product: sjProductPublic_(product, context.units), on_hand_base: lines.reduce(function (sum, line) { return sum + line.current_base_qty; }, 0), lines: lines};
}

function sjGetLotInventory(payload) {
  var context = sjInventoryContext_();
  var lot = sjInventoryLot_(context, sjRequired_(payload && payload.lot_id, 'lot_id'));
  var lines = sjPositiveBalanceRows_(context).filter(function (row) { return sjString_(row.lot_id) === sjString_(lot.lot_id); }).map(function (row) { return sjDecoratedBalance_(context, row); });
  return {lot: sjPublicRecord_(lot), lines: lines};
}

function sjGetMovementHistory(payload) {
  payload = payload || {};
  var limit = sjClamp_(Math.floor(sjNumber_(payload.limit, 50)), 1, SJ_CONFIG.MAX_HISTORY);
  var productId = sjString_(payload.product_id);
  var locationId = sjUpper_(payload.location_id);
  var type = sjUpper_(payload.movement_type);
  var rows = sjTable_('INVENTORY_MOVEMENTS').records.filter(function (movement) {
    if (productId && sjString_(movement.product_id) !== productId) return false;
    if (type && sjUpper_(movement.movement_type) !== type) return false;
    if (locationId && sjUpper_(movement.from_location_id) !== locationId && sjUpper_(movement.to_location_id) !== locationId) return false;
    return true;
  });
  rows.sort(function (left, right) { return sjNumber_(right.movement_sequence) - sjNumber_(left.movement_sequence); });
  return rows.slice(0, limit).map(sjPublicRecord_);
}

function sjLookupInventory(payload) {
  var query = sjNormalizeText_(sjRequired_(payload && (payload.query || payload.scan), 'query'));
  var bootstrap = sjInventoryBootstrap();
  return {
    products: bootstrap.products.filter(function (product) { return sjNormalizeText_([product.product_id, product.product_name, product.sku, product.barcode].join(' ')).indexOf(query) >= 0; }).slice(0, 25),
    locations: bootstrap.locations.filter(function (location) { return sjNormalizeText_([location.location_id, location.scan_code].join(' ')).indexOf(query) >= 0; }).slice(0, 25),
    balances: bootstrap.balances.filter(function (line) { return sjNormalizeText_([line.product_id, line.product_name, line.lot_id, line.supplier_lot_number, line.location_id, line.scan_code].join(' ')).indexOf(query) >= 0; }).slice(0, 50)
  };
}

function sjInventoryHealth() {
  var context = sjInventoryContext_();
  var productIds = {};
  var lotById = {};
  var locations = {};
  context.products.forEach(function (row) { productIds[sjString_(row.product_id)] = true; });
  context.lots.forEach(function (row) { lotById[sjString_(row.lot_id)] = row; });
  context.locations.forEach(function (row) { locations[sjUpper_(row.location_id)] = true; });
  var keys = {};
  var duplicateKeys = [];
  var orphanProducts = [];
  var orphanLots = [];
  var wrongLots = [];
  var orphanLocations = [];
  var negative = [];
  context.balances.forEach(function (row) {
    var key = sjString_(row.balance_key);
    if (keys[key]) duplicateKeys.push(key); keys[key] = true;
    if (!productIds[sjString_(row.product_id)]) orphanProducts.push(key);
    var lot = lotById[sjString_(row.lot_id)];
    if (!lot) orphanLots.push(key); else if (sjString_(lot.product_id) !== sjString_(row.product_id)) wrongLots.push(key);
    if (!locations[sjUpper_(row.location_id)]) orphanLocations.push(key);
    if (sjNumber_(row.current_base_qty) < -SJ_CONFIG.EPSILON) negative.push(key);
  });
  var lines = sjPositiveBalanceRows_(context).map(function (row) { return sjDecoratedBalance_(context, row); });
  return {ok: !duplicateKeys.length && !orphanProducts.length && !orphanLots.length && !wrongLots.length && !orphanLocations.length && !negative.length, duplicate_balance_keys: duplicateKeys, orphan_product_balances: orphanProducts, orphan_lot_balances: orphanLots, wrong_product_lot_balances: wrongLots, orphan_location_balances: orphanLocations, negative_balance_lines: negative, summary: sjInventorySummary_(context, lines)};
}

function sjInventoryContract() {
  return {version: SJ_CONFIG.API_VERSION, source_of_truth: 'INVENTORY_BALANCES', audit_ledger: 'INVENTORY_MOVEMENTS', balance_key: 'product_id|lot_id|location_id', rules: {base_units_only: true, existing_lot_conversion: 'LOTS.conversion_to_base', idempotency: 'operation_id required', concurrency: 'expected_source_sequence supported', deletion: 'movement rows are never edited or deleted'}};
}
