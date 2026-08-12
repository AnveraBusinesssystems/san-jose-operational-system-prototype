/** Products, units, parties, and warehouse locations. */

function sjActive_(record) {
  return sjBoolean_(record && record.is_active);
}

function sjProductPublic_(product, unitRows) {
  var result = sjPublicRecord_(product);
  result.units = (unitRows || []).filter(function (unit) {
    return sjString_(unit.product_id) === sjString_(product.product_id);
  }).map(sjPublicRecord_);
  return result;
}

function sjListProducts(payload) {
  payload = payload || {};
  var products = sjTable_('PRODUCTS').records;
  var units = sjTable_('PRODUCT_UNITS').records;
  var query = sjNormalizeText_(payload.query);
  var rows = products.filter(function (product) {
    if (!payload.include_inactive && !sjActive_(product)) return false;
    if (!query) return true;
    return sjNormalizeText_([product.product_id, product.product_name, product.category, product.sku, product.barcode].join(' ')).indexOf(query) >= 0;
  }).map(function (product) { return sjProductPublic_(product, units); });
  rows.sort(function (left, right) { return sjString_(left.product_name).localeCompare(sjString_(right.product_name)); });
  return sjPaginate_(rows, payload);
}

function sjGetProduct(payload) {
  var products = sjTable_('PRODUCTS');
  var product = sjFind_(products, sjRequired_(payload && payload.product_id, 'product_id'));
  if (!product) throw new Error('Product was not found.');
  return sjProductPublic_(product, sjTable_('PRODUCT_UNITS').records);
}

function sjWriteProductUnits_(productId, baseUnit, units, now) {
  var table = sjTable_('PRODUCT_UNITS');
  var requested = Array.isArray(units) ? units.slice() : [];
  if (!requested.some(function (unit) { return sjUpper_(unit.unit_code) === baseUnit; })) {
    requested.unshift({unit_code: baseUnit, conversion_to_base: 1, purchase_enabled: true, sales_enabled: true});
  }
  var seen = {};
  var nextId = Number(sjNextId_(table, 'PU').match(/(\d+)$/)[1]);
  var records = requested.map(function (unit, index) {
    var code = sjUpper_(sjRequired_(unit.unit_code, 'unit_code'));
    if (seen[code]) throw new Error('Duplicate product unit: ' + code + '.');
    seen[code] = true;
    var conversion = sjPositive_(unit.conversion_to_base, 'conversion_to_base');
    if (code === baseUnit && Math.abs(conversion - 1) > SJ_CONFIG.EPSILON) throw new Error('The base unit conversion must equal 1.');
    return {
      product_unit_id: 'PU-' + (nextId + index),
      product_id: productId,
      unit_code: code,
      conversion_to_base: conversion,
      purchase_enabled: unit.purchase_enabled === undefined ? true : sjBoolean_(unit.purchase_enabled),
      sales_enabled: unit.sales_enabled === undefined ? true : sjBoolean_(unit.sales_enabled),
      is_default_purchase: sjBoolean_(unit.is_default_purchase),
      is_default_sales: sjBoolean_(unit.is_default_sales),
      updated_at: now
    };
  });
  sjAppendMany_(table, records);
  return records;
}

function sjCreateProduct(payload) {
  var actor = sjRequirePermission_(payload, 'catalog.write');
  return sjWithLock_(function () {
    var products = sjTable_('PRODUCTS');
    var productId = payload.product_id ? sjUpper_(payload.product_id) : sjNextId_(products, 'PROD');
    if (sjFind_(products, productId)) throw new Error('Product already exists: ' + productId + '.');
    var baseUnit = sjUpper_(sjRequired_(payload.base_unit, 'base_unit'));
    var now = sjNow_();
    var record = {
      product_id: productId,
      product_name: sjRequired_(payload.product_name, 'product_name'),
      category: sjRequired_(payload.category, 'category'),
      inventory_dimension: sjOneOf_(payload.inventory_dimension || (baseUnit === 'UNIT' ? 'COUNT' : 'WEIGHT'), ['WEIGHT', 'COUNT', 'VOLUME'], 'inventory_dimension'),
      base_unit: baseUnit,
      sku: sjString_(payload.sku),
      barcode: sjString_(payload.barcode || productId),
      is_active: true,
      created_at: now,
      updated_at: now
    };
    var productRow = sjAppend_(products, record);
    var unitRecords;
    try {
      unitRecords = sjWriteProductUnits_(productId, baseUnit, payload.units, now);
    } catch (error) {
      sjClear_(products, productRow);
      throw error;
    }
    sjAudit_(actor, 'CREATE_PRODUCT', 'PRODUCTS', productId, null, record, 'Product and ' + unitRecords.length + ' units created.');
    return sjProductPublic_(record, unitRecords);
  });
}

function sjUpdateProduct(payload) {
  var actor = sjRequirePermission_(payload, 'catalog.write');
  return sjWithLock_(function () {
    var products = sjTable_('PRODUCTS');
    var product = sjFind_(products, sjRequired_(payload.product_id, 'product_id'));
    if (!product) throw new Error('Product was not found.');
    var allowed = ['product_name', 'category', 'sku', 'barcode', 'is_active'];
    var fields = {updated_at: sjNow_()};
    allowed.forEach(function (key) {
      if (payload[key] !== undefined) fields[key] = key === 'is_active' ? sjBoolean_(payload[key]) : sjString_(payload[key]);
    });
    var updated = sjUpdate_(products, product._sheet_row, fields);
    sjAudit_(actor, 'UPDATE_PRODUCT', 'PRODUCTS', product.product_id, sjPublicRecord_(product), sjPublicRecord_(updated), sjString_(payload.reason));
    return sjProductPublic_(updated, sjTable_('PRODUCT_UNITS').records);
  });
}

function sjListParties(payload) {
  payload = payload || {};
  var type = sjUpper_(payload.party_type);
  var query = sjNormalizeText_(payload.query);
  var rows = sjTable_('PARTIES').records.filter(function (party) {
    if (!payload.include_inactive && !sjActive_(party)) return false;
    var partyType = sjUpper_(party.party_type);
    if (type && partyType !== type && partyType !== 'BOTH') return false;
    return !query || sjNormalizeText_([party.party_id, party.party_name, party.contact_name, party.email, party.phone].join(' ')).indexOf(query) >= 0;
  }).map(sjPublicRecord_);
  rows.sort(function (left, right) { return sjString_(left.party_name).localeCompare(sjString_(right.party_name)); });
  return sjPaginate_(rows, payload);
}

function sjCreateParty(payload) {
  var actor = sjRequirePermission_(payload, 'catalog.write');
  return sjWithLock_(function () {
    var parties = sjTable_('PARTIES');
    var type = sjOneOf_(payload.party_type, ['VENDOR', 'CUSTOMER', 'BOTH'], 'party_type');
    var prefix = type === 'VENDOR' ? 'VEN' : 'CUST';
    var partyId = payload.party_id ? sjUpper_(payload.party_id) : sjNextId_(parties, prefix);
    if (sjFind_(parties, partyId)) throw new Error('Party already exists: ' + partyId + '.');
    var now = sjNow_();
    var record = {
      party_id: partyId, party_type: type, party_name: sjRequired_(payload.party_name, 'party_name'),
      contact_name: sjString_(payload.contact_name), email: sjLower_(payload.email), phone: sjString_(payload.phone),
      address: sjString_(payload.address), payment_terms: sjString_(payload.payment_terms),
      currency: sjUpper_(payload.currency || 'USD'), is_active: true, created_at: now, updated_at: now
    };
    sjAppend_(parties, record);
    sjAudit_(actor, 'CREATE_PARTY', 'PARTIES', partyId, null, record, 'Party created.');
    return sjPublicRecord_(record);
  });
}

function sjUpdateParty(payload) {
  var actor = sjRequirePermission_(payload, 'catalog.write');
  return sjWithLock_(function () {
    var parties = sjTable_('PARTIES');
    var party = sjFind_(parties, sjRequired_(payload.party_id, 'party_id'));
    if (!party) throw new Error('Party was not found.');
    var fields = {updated_at: sjNow_()};
    ['party_name', 'contact_name', 'email', 'phone', 'address', 'payment_terms', 'currency'].forEach(function (key) {
      if (payload[key] !== undefined) fields[key] = key === 'email' ? sjLower_(payload[key]) : sjString_(payload[key]);
    });
    if (payload.party_type !== undefined) fields.party_type = sjOneOf_(payload.party_type, ['VENDOR', 'CUSTOMER', 'BOTH'], 'party_type');
    if (payload.is_active !== undefined) fields.is_active = sjBoolean_(payload.is_active);
    var updated = sjUpdate_(parties, party._sheet_row, fields);
    sjAudit_(actor, 'UPDATE_PARTY', 'PARTIES', party.party_id, sjPublicRecord_(party), sjPublicRecord_(updated), sjString_(payload.reason));
    return sjPublicRecord_(updated);
  });
}

function sjListLocations(payload) {
  payload = payload || {};
  var type = sjUpper_(payload.location_type);
  var rack = sjUpper_(payload.rack);
  var rows = sjTable_('LOCATIONS').records.filter(function (location) {
    if (!payload.include_inactive && !sjActive_(location)) return false;
    if (type && sjUpper_(location.location_type) !== type) return false;
    if (rack && sjUpper_(location.rack) !== rack) return false;
    return true;
  }).map(sjPublicRecord_);
  rows.sort(function (left, right) { return sjString_(left.location_id).localeCompare(sjString_(right.location_id), undefined, {numeric: true}); });
  return sjPaginate_(rows, payload);
}
