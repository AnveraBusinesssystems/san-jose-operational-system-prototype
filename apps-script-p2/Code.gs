const P2_SPREADSHEET_ID = '1uAY5LW6SFvEGHf1NxHpB7mOYR28TMlTusadHc-KG3EM';
const P2_BACKEND_VERSION = 'p2-inventory-v1-2026-08-10';

const P2_ALLOWED_UNITS = ['UNIT','LB','OZ','KG','G','CASE','BOX','BAG','BUCKET','PALLET','PACK','JAR','GAL','L','FL_OZ'];

function doGet(e) {
  const action = String(e && e.parameter && e.parameter.action || '').trim();
  if (!action) return ContentService.createTextOutput('San Jose P2 backend: ' + P2_BACKEND_VERSION);
  return p2Handle_(action, e.parameter.payload || '', e.parameter.callback || '');
}

function doPost(e) {
  const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  return p2Handle_(body.action, JSON.stringify(body.payload || {}), '');
}

function p2Handle_(action, payloadText, callback) {
  try {
    const payload = payloadText ? JSON.parse(payloadText) : {};
    const routes = {
      inventoryBootstrap: p2InventoryBootstrap,
      addCountedStock: p2AddCountedStock,
      createInventoryProduct: p2CreateInventoryProduct,
      inventoryHealth: p2InventoryHealth
    };
    if (!routes[action]) throw new Error('Unknown P2 action: ' + action);
    return p2Json_({ok:true,result:routes[action](payload)}, callback);
  } catch (error) {
    return p2Json_({ok:false,error:error && error.message ? error.message : String(error)}, callback);
  }
}

function p2Json_(value, callback) {
  const body = callback ? callback + '(' + JSON.stringify(value) + ');' : JSON.stringify(value);
  return ContentService.createTextOutput(body).setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function p2Book_() { return SpreadsheetApp.openById(P2_SPREADSHEET_ID); }
function p2Sheet_(name) {
  const sheet = p2Book_().getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet: ' + name);
  return sheet;
}

function p2Table_(sheetName, requiredHeader) {
  const sheet = p2Sheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  const headerIndex = values.findIndex(row => row.map(v => String(v || '').trim()).indexOf(requiredHeader) >= 0);
  if (headerIndex < 0) throw new Error('Could not find ' + requiredHeader + ' header in ' + sheetName + '.');
  const raw = values[headerIndex].map(v => String(v || '').trim());
  let last = raw.length - 1;
  while (last >= 0 && !raw[last]) last -= 1;
  const headers = raw.slice(0,last + 1);
  const rows = values.slice(headerIndex + 1).filter(row => row.some(v => v !== '' && v !== null));
  return {sheet:sheet, headerRow:headerIndex + 1, headers:headers, rows:rows};
}

function p2Records_(sheetName, requiredHeader) {
  const meta = p2Table_(sheetName, requiredHeader);
  return meta.rows.map((row, offset) => {
    const record = {_sheet_row: meta.headerRow + 1 + offset};
    meta.headers.forEach((h,i) => { if (h) record[h] = row[i]; });
    return record;
  });
}

function p2Append_(sheetName, requiredHeader, record) {
  const meta = p2Table_(sheetName, requiredHeader);
  const row = meta.headers.map(h => h && record[h] !== undefined ? record[h] : '');
  meta.sheet.appendRow(row);
  return meta.sheet.getLastRow();
}

function p2SetRecord_(sheetName, requiredHeader, rowNumber, record) {
  const meta = p2Table_(sheetName, requiredHeader);
  const row = meta.headers.map(h => h && record[h] !== undefined ? record[h] : '');
  meta.sheet.getRange(rowNumber,1,1,row.length).setValues([row]);
}

function p2NextId_(sheetName, requiredHeader, idColumn, prefix) {
  const rows = p2Records_(sheetName, requiredHeader);
  const max = rows.reduce((m,row) => {
    const match = String(row[idColumn] || '').match(/(\d+)$/);
    return match ? Math.max(m, Number(match[1])) : m;
  },0);
  return prefix + '-' + (max + 1);
}

function p2NextMovementSequence_() {
  return p2Records_('INVENTORY_MOVEMENTS','movement_sequence').reduce((m,r) => Math.max(m, Number(r.movement_sequence) || 0),0) + 1;
}

function p2Bool_(v) { return v === true || String(v || '').toUpperCase() === 'TRUE'; }
function p2Num_(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = Number(String(v || '').replace(/[$,%\s,]/g,''));
  return isFinite(n) ? n : 0;
}
function p2Norm_(v) { return String(v || '').trim().toLowerCase().replace(/\s+/g,' '); }
function p2Now_() { return new Date(); }
function p2Date_(v) { return v ? new Date(String(v) + (String(v).length <= 10 ? 'T12:00:00' : '')) : ''; }

function p2RequireUser_(userId, adminOnly) {
  const user = p2Records_('USERS','user_id').find(r => String(r.user_id) === String(userId) && p2Bool_(r.is_active));
  if (!user) throw new Error('Active user not found. Sign in again.');
  const role = String(user.role || '').toUpperCase();
  if (adminOnly && role !== 'ADMIN') throw new Error('Only an Admin can create a new master product.');
  if (['ADMIN','MANAGER','OPERATOR'].indexOf(role) < 0) throw new Error('This user role cannot change inventory.');
  return user;
}

function p2CurrentCost_(productId) {
  try {
    const metric = p2Records_('OPERATIONS_METRICS','Product ID').find(r => String(r['Product ID']) === String(productId));
    return metric ? p2Num_(metric['Current Cost / LB']) : 0;
  } catch (_e) { return 0; }
}

function p2InventoryBootstrap() {
  const products = p2Records_('PRODUCTS','product_id').filter(p => p2Bool_(p.is_active));
  const units = p2Records_('PRODUCT_UNITS','product_unit_id');
  const locations = p2Records_('LOCATIONS','location_id').filter(l => p2Bool_(l.is_active));
  const lots = p2Records_('LOTS','lot_id');
  const balances = p2Records_('INVENTORY_BALANCES','balance_key').filter(b => p2Num_(b.current_base_qty) > 0);
  const metrics = p2Records_('OPERATIONS_METRICS','Product ID');

  const unitMap = {};
  units.forEach(u => {
    if (!unitMap[u.product_id]) unitMap[u.product_id] = [];
    unitMap[u.product_id].push({
      product_unit_id:String(u.product_unit_id || ''),
      unit_code:String(u.unit_code || ''),
      conversion_to_base:p2Num_(u.conversion_to_base),
      purchase_enabled:p2Bool_(u.purchase_enabled),
      sales_enabled:p2Bool_(u.sales_enabled),
      is_default_purchase:p2Bool_(u.is_default_purchase),
      is_default_sales:p2Bool_(u.is_default_sales)
    });
  });
  const lotMap = {};
  lots.forEach(l => { lotMap[l.lot_id] = l; });
  const metricMap = {};
  metrics.forEach(m => { metricMap[m['Product ID']] = m; });
  const balanceMap = {};
  balances.forEach(b => {
    if (!balanceMap[b.product_id]) balanceMap[b.product_id] = [];
    const lot = lotMap[b.lot_id] || {};
    const conv = p2Num_(lot.conversion_to_base) || 1;
    balanceMap[b.product_id].push({
      balance_key:String(b.balance_key || ''),
      lot_id:String(b.lot_id || ''),
      supplier_lot_number:String(lot.supplier_lot_number || ''),
      location_id:String(b.location_id || ''),
      current_base_qty:p2Num_(b.current_base_qty),
      unit_code:String(lot.unit_code || ''),
      conversion_to_base:conv,
      current_unit_qty:p2Num_(b.current_base_qty) / conv,
      cost_per_base:p2Num_(lot.cost_per_base),
      expiration_date:lot.expiration_date || '',
      quality_status:String(lot.quality_status || ''),
      lot_status:String(lot.lot_status || '')
    });
  });

  const productRows = products.map(p => {
    const stock = balanceMap[p.product_id] || [];
    const onHand = stock.reduce((s,b) => s + b.current_base_qty,0);
    const metric = metricMap[p.product_id] || {};
    return {
      product_id:String(p.product_id || ''),
      product_name:String(p.product_name || ''),
      category:String(p.category || ''),
      inventory_dimension:String(p.inventory_dimension || ''),
      base_unit:String(p.base_unit || ''),
      sku:String(p.sku || ''),
      barcode:String(p.barcode || ''),
      on_hand_base:onHand,
      current_cost_per_base:p2Num_(metric['Current Cost / LB']),
      status:String(metric.Status || (onHand > 0 ? 'IN STOCK' : 'ZERO STOCK')),
      units:unitMap[p.product_id] || [],
      stock:stock
    };
  });

  const positiveLots = lots.map(l => {
    const lotBalances = balances.filter(b => String(b.lot_id) === String(l.lot_id));
    const current = lotBalances.reduce((s,b) => s + p2Num_(b.current_base_qty),0);
    if (current <= 0) return null;
    return {
      lot_id:String(l.lot_id || ''), product_id:String(l.product_id || ''), supplier_lot_number:String(l.supplier_lot_number || ''),
      received_at:l.received_at || '', unit_code:String(l.unit_code || ''), conversion_to_base:p2Num_(l.conversion_to_base),
      cost_per_base:p2Num_(l.cost_per_base), expiration_date:l.expiration_date || '', quality_status:String(l.quality_status || ''), lot_status:String(l.lot_status || ''),
      current_base_qty:current, locations:lotBalances.map(b => String(b.location_id || ''))
    };
  }).filter(Boolean);

  return {
    version:P2_BACKEND_VERSION,
    generated_at:p2Now_(),
    products:productRows,
    locations:locations.map(l => ({location_id:String(l.location_id || ''),location_type:String(l.location_type || ''),rack:String(l.rack || ''),level:String(l.level || ''),position:String(l.position || ''),scan_code:String(l.scan_code || '')})),
    lots:positiveLots,
    balance_count:balances.length,
    total_on_hand_base:balances.reduce((s,b) => s + p2Num_(b.current_base_qty),0)
  };
}

function p2InventoryHealth() {
  const boot = p2InventoryBootstrap();
  return {version:boot.version,products:boot.products.length,locations:boot.locations.length,balances:boot.balance_count,total_on_hand_base:boot.total_on_hand_base};
}

function p2AddCountedStock(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return p2AddCountedStockUnlocked_(payload || {}); }
  finally { lock.releaseLock(); }
}

function p2AddCountedStockUnlocked_(payload) {
  const user = p2RequireUser_(payload.user_id, false);
  const productId = String(payload.product_id || '').trim();
  const locationId = String(payload.location_id || '').trim().toUpperCase();
  const unitCode = String(payload.unit_code || '').trim().toUpperCase();
  const operationId = String(payload.operation_id || '').trim();
  let qty = p2Num_(payload.quantity);
  let conversion = p2Num_(payload.conversion_to_base);
  if (!operationId) throw new Error('operation_id is required.');
  if (!productId) throw new Error('Choose a product.');
  if (!locationId) throw new Error('Choose the exact physical location.');
  if (P2_ALLOWED_UNITS.indexOf(unitCode) < 0) throw new Error('Unsupported unit: ' + unitCode);
  if (!(qty > 0)) throw new Error('Quantity must be greater than zero.');
  if (!(conversion > 0)) throw new Error('LB / unit conversion must be greater than zero.');

  const movements = p2Records_('INVENTORY_MOVEMENTS','movement_sequence');
  const existingOperation = movements.find(m => String(m.operation_id || '') === operationId);
  if (existingOperation) return {duplicate:true,movement_id:String(existingOperation.movement_id || ''),operation_id:operationId};

  const product = p2Records_('PRODUCTS','product_id').find(p => String(p.product_id) === productId && p2Bool_(p.is_active));
  if (!product) throw new Error('Active product not found: ' + productId);
  const baseUnit = String(product.base_unit || '').toUpperCase();
  if (unitCode === baseUnit) conversion = 1;

  const location = p2Records_('LOCATIONS','location_id').find(l => String(l.location_id).toUpperCase() === locationId && p2Bool_(l.is_active));
  if (!location) throw new Error('Active location not found: ' + locationId);

  const baseQty = qty * conversion;
  const supplierLot = String(payload.supplier_lot_number || '').trim();
  const notes = String(payload.notes || '').trim();
  const lotRows = p2Records_('LOTS','lot_id');
  let lot = null;
  if (supplierLot) {
    lot = lotRows.find(l => String(l.product_id) === productId && p2Norm_(l.supplier_lot_number) === p2Norm_(supplierLot) && String(l.unit_code || '').toUpperCase() === unitCode && Math.abs(p2Num_(l.conversion_to_base) - conversion) < 0.000001 && ['ACTIVE','HOLD'].indexOf(String(l.lot_status || '').toUpperCase()) >= 0) || null;
  }

  let newLotRow = null;
  if (!lot) {
    const lotId = p2NextId_('LOTS','lot_id','lot_id','LOT');
    lot = {
      lot_id:lotId,
      product_id:productId,
      vendor_party_id:'',
      source_order_line_id:'',
      supplier_lot_number:supplierLot,
      received_at:p2Now_(),
      received_base_qty:baseQty,
      received_unit_qty:qty,
      unit_code:unitCode,
      conversion_to_base:conversion,
      cost_per_base:p2Num_(payload.cost_per_base) || p2CurrentCost_(productId),
      currency:'USD',
      expiration_date:p2Date_(payload.expiration_date),
      quality_status:'PASS',
      lot_status:'ACTIVE',
      created_at:p2Now_(),
      notes:'Created from physical inventory count. Original receipt record was not available.' + (notes ? ' ' + notes : '')
    };
    newLotRow = p2Append_('LOTS','lot_id',lot);
  }

  const sequence = p2NextMovementSequence_();
  const movementId = p2NextId_('INVENTORY_MOVEMENTS','movement_sequence','movement_id','MOV');
  const movement = {
    movement_sequence:sequence,
    movement_id:movementId,
    movement_type:'ADJUST_IN',
    occurred_at:p2Now_(),
    product_id:productId,
    lot_id:lot.lot_id,
    quantity_base:baseQty,
    entered_qty:qty,
    entered_unit:unitCode,
    conversion_to_base:conversion,
    from_location_id:'',
    to_location_id:locationId,
    order_id:'',
    order_line_id:'',
    task_id:'',
    operation_id:operationId,
    user_id:String(user.user_id || ''),
    approval_status:'APPROVED',
    notes:'PHYSICAL_COUNT_FOUND_STOCK' + (notes ? ' · ' + notes : '')
  };

  let movementRow = null;
  try {
    movementRow = p2Append_('INVENTORY_MOVEMENTS','movement_sequence',movement);
    const balances = p2Records_('INVENTORY_BALANCES','balance_key');
    const key = productId + '|' + lot.lot_id + '|' + locationId;
    const existing = balances.find(b => String(b.balance_key) === key);
    const balanceRecord = {
      balance_key:key,
      product_id:productId,
      lot_id:lot.lot_id,
      location_id:locationId,
      current_base_qty:(existing ? p2Num_(existing.current_base_qty) : 0) + baseQty,
      last_movement_sequence:sequence,
      updated_at:p2Now_()
    };
    if (existing) p2SetRecord_('INVENTORY_BALANCES','balance_key',existing._sheet_row,balanceRecord);
    else p2Append_('INVENTORY_BALANCES','balance_key',balanceRecord);

    try {
      p2Append_('AUDIT_LOG','audit_id',{
        audit_id:p2NextId_('AUDIT_LOG','audit_id','audit_id','AUD'),
        occurred_at:p2Now_(), user_id:String(user.user_id || ''), action_type:'PHYSICAL_COUNT_ADJUST_IN', table_name:'INVENTORY_BALANCES', record_id:key,
        old_value:existing ? String(p2Num_(existing.current_base_qty)) : '0', new_value:String(balanceRecord.current_base_qty), notes:operationId
      });
    } catch (_auditError) {}

    return {duplicate:false,operation_id:operationId,movement_id:movementId,movement_sequence:sequence,product_id:productId,lot_id:String(lot.lot_id),location_id:locationId,entered_qty:qty,entered_unit:unitCode,quantity_base:baseQty,new_balance_base_qty:balanceRecord.current_base_qty,created_new_lot:Boolean(newLotRow)};
  } catch (error) {
    if (movementRow) p2Sheet_('INVENTORY_MOVEMENTS').getRange(movementRow,1,1,p2Table_('INVENTORY_MOVEMENTS','movement_sequence').headers.length).clearContent();
    if (newLotRow) p2Sheet_('LOTS').getRange(newLotRow,1,1,p2Table_('LOTS','lot_id').headers.length).clearContent();
    throw error;
  }
}

function p2CreateInventoryProduct(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const user = p2RequireUser_(payload.user_id, true);
    const name = String(payload.product_name || '').trim();
    const category = String(payload.category || 'Uncategorized').trim();
    const baseUnit = String(payload.base_unit || 'LB').trim().toUpperCase();
    const dimension = String(payload.inventory_dimension || (baseUnit === 'LB' ? 'WEIGHT' : 'COUNT')).trim().toUpperCase();
    if (!name) throw new Error('Product name is required.');
    if (['LB','UNIT'].indexOf(baseUnit) < 0) throw new Error('Base unit must be LB or UNIT.');
    const products = p2Records_('PRODUCTS','product_id');
    const duplicate = products.find(p => p2Norm_(p.product_name) === p2Norm_(name));
    if (duplicate) return {created:false,duplicate:true,product_id:String(duplicate.product_id),product_name:String(duplicate.product_name)};

    const productId = p2NextId_('PRODUCTS','product_id','product_id','PROD');
    const now = p2Now_();
    p2Append_('PRODUCTS','product_id',{
      product_id:productId, product_name:name, category:category, inventory_dimension:dimension, base_unit:baseUnit,
      sku:String(payload.sku || ''), barcode:String(payload.barcode || productId), is_active:true, created_at:now, updated_at:now
    });
    const unitId = p2NextId_('PRODUCT_UNITS','product_unit_id','product_unit_id','PU');
    p2Append_('PRODUCT_UNITS','product_unit_id',{
      product_unit_id:unitId, product_id:productId, unit_code:baseUnit, conversion_to_base:1, purchase_enabled:true, sales_enabled:true,
      is_default_purchase:true, is_default_sales:true, updated_at:now
    });
    try {
      p2Append_('AUDIT_LOG','audit_id',{
        audit_id:p2NextId_('AUDIT_LOG','audit_id','audit_id','AUD'), occurred_at:now, user_id:String(user.user_id || ''), action_type:'CREATE_PRODUCT_FROM_COUNT', table_name:'PRODUCTS', record_id:productId,
        old_value:'', new_value:name, notes:'Created from Inventory physical-count workflow.'
      });
    } catch (_auditError) {}
    return {created:true,duplicate:false,product_id:productId,product_name:name,category:category,base_unit:baseUnit};
  } finally { lock.releaseLock(); }
}
