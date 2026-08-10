const P2_SPREADSHEET_ID = '1uAY5LW6SFvEGHf1NxHpB7mOYR28TMlTusadHc-KG3EM';
const P2_INVENTORY_API_VERSION = 'inventory-v3-2026-08-10';
const P2_INVENTORY_SCHEMA_VERSION = 'inventory-schema-v1';
const P2_EPSILON = 0.000001;
const P2_MAX_HISTORY = 500;
const P2_MAX_SEARCH_RESULTS = 100;
const P2_MAX_BATCH_OPERATIONS = 50;

const P2_READ_ACTIONS = Object.freeze({
  apiInfo: p2ApiInfo,
  ping: p2ApiInfo,
  inventoryHealth: p2InventoryHealth,
  inventoryBootstrap: p2InventoryBootstrap,
  inventoryMetrics: p2InventoryMetrics,
  getInventoryMetrics: p2InventoryMetrics,
  inventoryFormOptions: p2InventoryFormOptions,
  getLocationInventory: p2GetLocationInventory,
  getRackInventory: p2GetRackInventory,
  getProductInventory: p2GetProductInventory,
  getLotInventory: p2GetLotInventory,
  getMovementHistory: p2GetMovementHistory,
  lookupInventory: p2LookupInventory,
  inventoryContract: p2InventoryContract
});

const P2_WRITE_ACTIONS = Object.freeze({
  moveInventory: p2MoveInventory,
  transferInventory: p2MoveInventory,
  moveToPacking: p2MoveToPacking,
  moveFromPacking: p2MoveFromPacking,
  receiveInventory: p2ReceiveInventory,
  adjustInventoryIn: p2AdjustInventoryIn,
  foundInventory: p2FoundInventory,
  adjustInventoryOut: p2AdjustInventoryOut,
  physicalCount: p2PhysicalCount,
  packingDeduct: p2PackingDeduct,
  batchInventory: p2BatchInventory
});

function doGet(e) {
  let callback = '';
  let action = '';
  try {
    callback = p2ValidateCallback_(e && e.parameter && e.parameter.callback);
    action = p2String_(e && e.parameter && e.parameter.action) || 'inventoryHealth';
    if (!P2_READ_ACTIONS[action]) throw new Error('GET action is not allowed: ' + action);
    const payload = p2ParsePayload_(e && e.parameter && e.parameter.payload);
    const result = P2_READ_ACTIONS[action](payload);
    return p2Output_({ok:true, action:action, version:P2_INVENTORY_API_VERSION, result:result}, callback);
  } catch (error) {
    return p2Output_({ok:false, action:action, version:P2_INVENTORY_API_VERSION, error:p2ErrorMessage_(error)}, callback);
  }
}

function doPost(e) {
  let action = '';
  try {
    const parsed = p2ParsePost_(e);
    action = parsed.action;
    if (!P2_WRITE_ACTIONS[action]) throw new Error('POST action is not allowed: ' + action);
    const result = P2_WRITE_ACTIONS[action](parsed.payload || {});
    return p2Output_({ok:true, action:action, version:P2_INVENTORY_API_VERSION, result:result}, '');
  } catch (error) {
    return p2Output_({ok:false, action:action, version:P2_INVENTORY_API_VERSION, error:p2ErrorMessage_(error)}, '');
  }
}

function p2ParsePost_(e) {
  const params = e && e.parameter ? e.parameter : {};
  const text = p2String_(e && e.postData && e.postData.contents);
  const type = p2String_(e && e.postData && e.postData.type).toLowerCase();
  if (text && (type.indexOf('application/json') >= 0 || text.charAt(0) === '{')) {
    const body = JSON.parse(text);
    return {action:p2String_(body.action), payload:body.payload && typeof body.payload === 'object' ? body.payload : {}};
  }
  const action = p2String_(params.action);
  let payload = p2ParsePayload_(params.payload);
  if (!params.payload) {
    payload = {};
    Object.keys(params).forEach(function(key) {
      if (key !== 'action' && key !== 'callback') payload[key] = params[key];
    });
  }
  return {action:action, payload:payload};
}

function p2Output_(value, callback) {
  const json = JSON.stringify(value);
  if (callback) return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function p2ValidateCallback_(value) {
  const callback = p2String_(value);
  if (!callback) return '';
  if (!/^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) throw new Error('Invalid callback name.');
  return callback;
}

function p2ParsePayload_(text) {
  if (!text) return {};
  if (typeof text === 'object') return text;
  try { return JSON.parse(String(text)); }
  catch (_error) { throw new Error('payload must be valid JSON.'); }
}

function p2ErrorMessage_(error) { return error && error.message ? String(error.message) : String(error || 'Unknown error'); }
function p2Book_() { return SpreadsheetApp.openById(P2_SPREADSHEET_ID); }
function p2Sheet_(name) { const s=p2Book_().getSheetByName(name); if(!s) throw new Error('Missing required sheet: '+name); return s; }

function p2Table_(sheetName, requiredHeader) {
  const sheet = p2Sheet_(sheetName), values = sheet.getDataRange().getValues();
  const headerIndex = values.findIndex(function(row){ return row.map(function(v){return p2String_(v);}).indexOf(requiredHeader)>=0; });
  if (headerIndex < 0) throw new Error('Header '+requiredHeader+' not found in '+sheetName+'.');
  const rawHeaders=values[headerIndex].map(function(v){return p2String_(v);});
  let lastHeader=rawHeaders.length-1; while(lastHeader>=0&&!rawHeaders[lastHeader]) lastHeader--;
  const headers=rawHeaders.slice(0,lastHeader+1), records=[];
  for(let i=headerIndex+1;i<values.length;i++){
    const row=values[i].slice(0,headers.length); if(!row.some(function(v){return v!==''&&v!==null;})) continue;
    const record={_sheet_row:i+1}; headers.forEach(function(h,c){if(h)record[h]=row[c];}); records.push(record);
  }
  return {sheet:sheet,sheetName:sheetName,headerRow:headerIndex+1,headers:headers,records:records};
}

function p2RecordRow_(table,record){return table.headers.map(function(h){return h&&record[h]!==undefined?record[h]:'';});}
function p2Append_(table,record){table.sheet.appendRow(p2RecordRow_(table,record));return table.sheet.getLastRow();}
function p2Write_(table,rowNumber,record){table.sheet.getRange(rowNumber,1,1,table.headers.length).setValues([p2RecordRow_(table,record)]);}
function p2Clear_(table,rowNumber){table.sheet.getRange(rowNumber,1,1,table.headers.length).clearContent();}
function p2Bool_(v){return v===true||p2Upper_(v)==='TRUE'||String(v)==='1';}
function p2Num_(v){if(typeof v==='number')return isFinite(v)?v:0;const n=Number(String(v===undefined||v===null?'':v).replace(/[$,%\s,]/g,''));return isFinite(n)?n:0;}
function p2String_(v){return String(v===undefined||v===null?'':v).trim();}
function p2Upper_(v){return p2String_(v).toUpperCase();}
function p2Norm_(v){return p2String_(v).toLowerCase().replace(/\s+/g,' ');}
function p2Now_(){return new Date();}
function p2DateOrBlank_(v){if(!v)return '';const d=v instanceof Date?v:new Date(String(v).length<=10?String(v)+'T12:00:00':v);if(isNaN(d.getTime()))throw new Error('Invalid date: '+v);return d;}
function p2DateMs_(v){if(!v)return 0;const d=v instanceof Date?v:new Date(v);return isNaN(d.getTime())?0:d.getTime();}
function p2JsonText_(v){return JSON.stringify(v===undefined?null:v);}
function p2CompactId_(records,idColumn,prefix){let max=0;records.forEach(function(r){const m=p2String_(r[idColumn]).match(/(\d+)$/);if(m)max=Math.max(max,Number(m[1])||0);});return prefix+'-'+(max+1);}
function p2NextMovementSequence_(records){return records.reduce(function(max,r){return Math.max(max,p2Num_(r.movement_sequence));},0)+1;}
function p2BalanceKey_(productId,lotId,locationId){return p2String_(productId)+'|'+p2String_(lotId)+'|'+p2Upper_(locationId);}
function p2RequireOperationId_(payload){const id=p2String_(payload.operation_id);if(!id)throw new Error('operation_id is required for every inventory write.');if(id.length>120)throw new Error('operation_id is too long.');return id;}

function p2WriteSecurity_(){
  const props=PropertiesService.getScriptProperties();
  return {writes_enabled:p2Upper_(props.getProperty('INVENTORY_WRITES_ENABLED'))==='TRUE',write_token_configured:Boolean(p2String_(props.getProperty('INVENTORY_WRITE_TOKEN')))};
}
function p2RequireWriteSecurity_(payload){
  const props=PropertiesService.getScriptProperties();
  if(p2Upper_(props.getProperty('INVENTORY_WRITES_ENABLED'))!=='TRUE')throw new Error('Inventory writes are disabled. Set Script Property INVENTORY_WRITES_ENABLED=TRUE after read validation and authentication setup.');
  const expected=p2String_(props.getProperty('INVENTORY_WRITE_TOKEN'));if(!expected)throw new Error('Inventory writes require Script Property INVENTORY_WRITE_TOKEN.');
  const supplied=p2String_(payload.write_token);if(!supplied||supplied!==expected)throw new Error('Inventory write authorization failed.');
}
function p2RequireActiveUser_(userId,allowedRoles){
  const id=p2String_(userId);if(!id)throw new Error('user_id is required.');
  const user=p2Table_('USERS','user_id').records.find(function(r){return p2String_(r.user_id)===id&&p2Bool_(r.is_active);});
  if(!user)throw new Error('Active user not found: '+id);const role=p2Upper_(user.role);
  if(allowedRoles&&allowedRoles.length&&allowedRoles.indexOf(role)<0)throw new Error(role+' is not allowed to perform this inventory action.');
  return {user_id:id,full_name:p2String_(user.full_name),role:role};
}
function p2Actor_(payload,roles){p2RequireWriteSecurity_(payload);return p2RequireActiveUser_(payload.user_id,roles);}

function p2InventoryContext_(){
  const products=p2Table_('PRODUCTS','product_id'),units=p2Table_('PRODUCT_UNITS','product_unit_id'),locations=p2Table_('LOCATIONS','location_id'),lots=p2Table_('LOTS','lot_id'),balances=p2Table_('INVENTORY_BALANCES','balance_key'),movements=p2Table_('INVENTORY_MOVEMENTS','movement_sequence');
  return {productsTable:products,unitsTable:units,locationsTable:locations,lotsTable:lots,balancesTable:balances,movementsTable:movements,products:products.records,units:units.records,locations:locations.records,lots:lots.records,balances:balances.records,movements:movements.records};
}
function p2ActiveProduct_(ctx,id){const r=ctx.products.find(function(x){return p2String_(x.product_id)===p2String_(id)&&p2Bool_(x.is_active);});if(!r)throw new Error('Active product not found: '+p2String_(id));return r;}
function p2ActiveLocation_(ctx,id){const x=p2Upper_(id),r=ctx.locations.find(function(v){return p2Upper_(v.location_id)===x&&p2Bool_(v.is_active);});if(!r)throw new Error('Active location not found: '+x);return r;}
function p2Lot_(ctx,lotId,productId){const id=p2String_(lotId),r=ctx.lots.find(function(x){return p2String_(x.lot_id)===id;});if(!r)throw new Error('Lot not found: '+id);if(productId&&p2String_(r.product_id)!==p2String_(productId))throw new Error('Lot '+id+' does not belong to product '+productId+'.');if(['CLOSED','REJECTED'].indexOf(p2Upper_(r.lot_status))>=0)throw new Error('Lot '+id+' is not available for inventory activity.');return r;}
function p2Balance_(ctx,p,l,loc){const k=p2BalanceKey_(p,l,loc);return ctx.balances.find(function(b){return p2String_(b.balance_key)===k;})||null;}
function p2FindOperation_(ctx,id){id=p2String_(id);return ctx.movements.find(function(m){return p2String_(m.operation_id)===id;})||null;}
function p2CheckExpectedSequence_(balance,expected){if(expected===undefined||expected===null||expected==='')return;const e=Number(expected);if(!Number.isFinite(e))throw new Error('expected_source_sequence must be numeric.');const c=balance?p2Num_(balance.last_movement_sequence):0;if(c!==e)throw new Error('Inventory changed since this screen was loaded. Expected movement sequence '+e+', current sequence is '+c+'. Refresh the stock line.');}
function p2ProductUnits_(ctx,productId){return ctx.units.filter(function(u){return p2String_(u.product_id)===p2String_(productId);}).map(function(u){return {product_unit_id:p2String_(u.product_unit_id),unit_code:p2Upper_(u.unit_code),conversion_to_base:p2Num_(u.conversion_to_base),purchase_enabled:p2Bool_(u.purchase_enabled),sales_enabled:p2Bool_(u.sales_enabled),is_default_purchase:p2Bool_(u.is_default_purchase),is_default_sales:p2Bool_(u.is_default_sales)};});}

function p2ExistingLotQuantity_(product,lot,enteredQty,enteredUnit){
  const qty=Number(enteredQty);if(!Number.isFinite(qty)||qty<=0)throw new Error('Quantity must be greater than zero.');
  const unit=p2Upper_(enteredUnit||product.base_unit),base=p2Upper_(product.base_unit),lotUnit=p2Upper_(lot.unit_code);let conversion=0;
  if(unit===base)conversion=1;else if(unit===lotUnit)conversion=p2Num_(lot.conversion_to_base);else throw new Error('For this lot, quantity must be entered as '+base+' or '+lotUnit+'.');
  if(!(conversion>0))throw new Error('Lot conversion_to_base is invalid for '+p2String_(lot.lot_id)+'.');
  return {entered_qty:qty,entered_unit:unit,conversion_to_base:conversion,quantity_base:qty*conversion};
}
function p2NewLotQuantity_(ctx,product,enteredQty,enteredUnit,suppliedConversion){
  const qty=Number(enteredQty);if(!Number.isFinite(qty)||qty<=0)throw new Error('Quantity must be greater than zero.');
  const unit=p2Upper_(enteredUnit||product.base_unit),base=p2Upper_(product.base_unit);let conversion=0;
  if(unit===base)conversion=1;else if(Number(suppliedConversion)>0)conversion=Number(suppliedConversion);else{const f=p2ProductUnits_(ctx,product.product_id).find(function(r){return r.unit_code===unit;});conversion=f?f.conversion_to_base:0;}
  if(!(conversion>0))throw new Error('A valid conversion_to_base is required for '+unit+'.');return {entered_qty:qty,entered_unit:unit,conversion_to_base:conversion,quantity_base:qty*conversion};
}
function p2LatestLotCost_(ctx,productId){const rows=ctx.lots.filter(function(l){return p2String_(l.product_id)===p2String_(productId)&&p2Num_(l.cost_per_base)>0;}).slice();rows.sort(function(a,b){return p2DateMs_(b.received_at)-p2DateMs_(a.received_at);});return rows.length?p2Num_(rows[0].cost_per_base):0;}

function p2DecoratedBalance_(ctx,b){
  const product=ctx.products.find(function(r){return p2String_(r.product_id)===p2String_(b.product_id);})||{},lot=ctx.lots.find(function(r){return p2String_(r.lot_id)===p2String_(b.lot_id);})||{},location=ctx.locations.find(function(r){return p2Upper_(r.location_id)===p2Upper_(b.location_id);})||{};
  const conv=p2Num_(lot.conversion_to_base)||1,qty=p2Num_(b.current_base_qty),cost=p2Num_(lot.cost_per_base);
  return {balance_key:p2String_(b.balance_key),product_id:p2String_(b.product_id),product_name:p2String_(product.product_name),category:p2String_(product.category),inventory_dimension:p2Upper_(product.inventory_dimension),base_unit:p2Upper_(product.base_unit),lot_id:p2String_(b.lot_id),supplier_lot_number:p2String_(lot.supplier_lot_number),lot_unit:p2Upper_(lot.unit_code),lot_conversion_to_base:conv,current_base_qty:qty,current_lot_unit_qty:qty/conv,cost_per_base:cost,inventory_value:qty*cost,received_at:lot.received_at||'',expiration_date:lot.expiration_date||'',quality_status:p2Upper_(lot.quality_status),lot_status:p2Upper_(lot.lot_status),location_id:p2Upper_(b.location_id),location_type:p2Upper_(location.location_type),rack:p2Upper_(location.rack),level:p2Upper_(location.level),position:p2Upper_(location.position),scan_code:p2String_(location.scan_code),last_movement_sequence:p2Num_(b.last_movement_sequence),updated_at:b.updated_at||''};
}
function p2PositiveBalances_(ctx){return ctx.balances.filter(function(b){return p2Num_(b.current_base_qty)>P2_EPSILON;});}
function p2Summary_(ctx,lines){
  const by={},occupied={},lp={};let value=0;lines.forEach(function(b){const u=b.base_unit||'UNKNOWN';by[u]=(by[u]||0)+b.current_base_qty;value+=b.inventory_value||0;if(b.location_type==='RACK')occupied[b.location_id]=true;if(!lp[b.location_id])lp[b.location_id]={};lp[b.location_id][b.product_id]=true;});
  const rackTotal=ctx.locations.filter(function(l){return p2Bool_(l.is_active)&&p2Upper_(l.location_type)==='RACK';}).length,rackUsed=Object.keys(occupied).length;
  return {by_base_unit:by,inventory_value_usd:value,positive_balance_lines:lines.length,active_locations:ctx.locations.filter(function(l){return p2Bool_(l.is_active);}).length,active_rack_locations:rackTotal,occupied_rack_locations:rackUsed,open_rack_locations:Math.max(0,rackTotal-rackUsed),rack_utilization_pct:rackTotal?rackUsed/rackTotal*100:0,mixed_locations:Object.keys(lp).filter(function(id){return Object.keys(lp[id]).length>1;}).length};
}
function p2LocationPublic_(l){return {location_id:p2Upper_(l.location_id),location_type:p2Upper_(l.location_type),rack:p2Upper_(l.rack),level:p2Upper_(l.level),position:p2Upper_(l.position),scan_code:p2String_(l.scan_code),notes:p2String_(l.notes)};}
function p2ProductPublic_(ctx,p,onHand){const id=p2String_(p.product_id);return {product_id:id,product_name:p2String_(p.product_name),category:p2String_(p.category),inventory_dimension:p2Upper_(p.inventory_dimension),base_unit:p2Upper_(p.base_unit),sku:p2String_(p.sku),barcode:p2String_(p.barcode),on_hand_base:Number(onHand||0),units:p2ProductUnits_(ctx,id)};}
function p2MovementPublic_(m){return {movement_sequence:p2Num_(m.movement_sequence),movement_id:p2String_(m.movement_id),movement_type:p2Upper_(m.movement_type),occurred_at:m.occurred_at||'',product_id:p2String_(m.product_id),lot_id:p2String_(m.lot_id),quantity_base:p2Num_(m.quantity_base),entered_qty:p2Num_(m.entered_qty),entered_unit:p2Upper_(m.entered_unit),conversion_to_base:p2Num_(m.conversion_to_base),from_location_id:p2Upper_(m.from_location_id),to_location_id:p2Upper_(m.to_location_id),order_id:p2String_(m.order_id),order_line_id:p2String_(m.order_line_id),task_id:p2String_(m.task_id),operation_id:p2String_(m.operation_id),user_id:p2String_(m.user_id),approval_status:p2Upper_(m.approval_status),notes:p2String_(m.notes)};}

function p2ApiInfo(){return {version:P2_INVENTORY_API_VERSION,schema_version:P2_INVENTORY_SCHEMA_VERSION,spreadsheet_id:P2_SPREADSHEET_ID,server_time:p2Now_(),transport:{GET:'read-only + JSONP callback support',POST:'writes; JSON body or form payload supported'},reads:Object.keys(P2_READ_ACTIONS),writes:Object.keys(P2_WRITE_ACTIONS),write_security:p2WriteSecurity_()};}
function p2InventoryBootstrap(){
  const ctx=p2InventoryContext_(),balances=p2PositiveBalances_(ctx).map(function(b){return p2DecoratedBalance_(ctx,b);}),totals={};balances.forEach(function(b){totals[b.product_id]=(totals[b.product_id]||0)+b.current_base_qty;});
  return {version:P2_INVENTORY_API_VERSION,schema_version:P2_INVENTORY_SCHEMA_VERSION,generated_at:p2Now_(),products:ctx.products.filter(function(p){return p2Bool_(p.is_active);}).map(function(p){return p2ProductPublic_(ctx,p,totals[p2String_(p.product_id)]||0);}),locations:ctx.locations.filter(function(l){return p2Bool_(l.is_active);}).map(p2LocationPublic_),balances:balances,summary:p2Summary_(ctx,balances),capabilities:{mixed_locations:true,historical_lot_conversion:true,floor_storage:true,packing_storage:true,scanner_lookup:true,physical_count:true,batch_writes:true}};
}

function p2InventoryMetrics(payload){
  payload=payload||{};const ctx=p2InventoryContext_(),lines=p2PositiveBalances_(ctx).map(function(b){return p2DecoratedBalance_(ctx,b);}),active=ctx.products.filter(function(p){return p2Bool_(p.is_active);}),pa={},ca={},la={},lp={},lots={},now=Date.now(),days=Math.max(1,Math.min(3650,Number(payload.expiry_days)||90));let expired=0,expiring=0;
  lines.forEach(function(x){if(!pa[x.product_id])pa[x.product_id]={product_id:x.product_id,product_name:x.product_name,category:x.category,base_unit:x.base_unit,on_hand_base:0,inventory_value_usd:0,balance_lines:0,locations:{},lots:{}};const p=pa[x.product_id];p.on_hand_base+=x.current_base_qty;p.inventory_value_usd+=x.inventory_value;p.balance_lines++;p.locations[x.location_id]=true;p.lots[x.lot_id]=true;const c=x.category||'Uncategorized';if(!ca[c])ca[c]={category:c,inventory_value_usd:0,by_base_unit:{}};ca[c].inventory_value_usd+=x.inventory_value;ca[c].by_base_unit[x.base_unit]=(ca[c].by_base_unit[x.base_unit]||0)+x.current_base_qty;const t=x.location_type||'UNKNOWN';if(!la[t])la[t]={location_type:t,balance_lines:0,inventory_value_usd:0,by_base_unit:{}};la[t].balance_lines++;la[t].inventory_value_usd+=x.inventory_value;la[t].by_base_unit[x.base_unit]=(la[t].by_base_unit[x.base_unit]||0)+x.current_base_qty;if(!lp[x.location_id])lp[x.location_id]={};lp[x.location_id][x.product_id]=true;if(!lots[x.lot_id]){lots[x.lot_id]=true;const e=p2DateMs_(x.expiration_date);if(e){const d=(e-now)/86400000;if(d<0)expired++;else if(d<=days)expiring++;}}});
  const pm=active.map(function(p){const id=p2String_(p.product_id),a=pa[id]||{on_hand_base:0,inventory_value_usd:0,balance_lines:0,locations:{},lots:{}};return {product_id:id,product_name:p2String_(p.product_name),category:p2String_(p.category),base_unit:p2Upper_(p.base_unit),on_hand_base:a.on_hand_base,inventory_value_usd:a.inventory_value_usd,balance_lines:a.balance_lines,location_count:Object.keys(a.locations).length,lot_count:Object.keys(a.lots).length,zero_stock:a.on_hand_base<=P2_EPSILON};}).sort(function(a,b){return a.product_name.localeCompare(b.product_name);});
  return {version:P2_INVENTORY_API_VERSION,generated_at:p2Now_(),summary:p2Summary_(ctx,lines),active_products:active.length,products_with_stock:pm.filter(function(r){return !r.zero_stock;}).length,zero_stock_products:pm.filter(function(r){return r.zero_stock;}).length,active_lots_with_stock:Object.keys(lots).length,expired_lots_with_stock:expired,expiring_lots_within_days:expiring,expiry_window_days:days,mixed_locations:Object.keys(lp).filter(function(id){return Object.keys(lp[id]).length>1;}).length,by_product:pm,by_category:Object.keys(ca).sort().map(function(k){return ca[k];}),by_location_type:Object.keys(la).sort().map(function(k){return la[k];})};
}

function p2InventoryFormOptions(payload){payload=payload||{};const ctx=p2InventoryContext_(),pid=p2String_(payload.product_id);return {version:P2_INVENTORY_API_VERSION,products:ctx.products.filter(function(r){return p2Bool_(r.is_active);}).map(function(p){return p2ProductPublic_(ctx,p,0);}),locations:ctx.locations.filter(function(r){return p2Bool_(r.is_active);}).map(p2LocationPublic_),lots:ctx.lots.filter(function(r){return (!pid||p2String_(r.product_id)===pid)&&['CLOSED','REJECTED'].indexOf(p2Upper_(r.lot_status))<0;}).map(function(l){return {lot_id:p2String_(l.lot_id),product_id:p2String_(l.product_id),supplier_lot_number:p2String_(l.supplier_lot_number),unit_code:p2Upper_(l.unit_code),conversion_to_base:p2Num_(l.conversion_to_base),cost_per_base:p2Num_(l.cost_per_base),received_at:l.received_at||'',expiration_date:l.expiration_date||'',quality_status:p2Upper_(l.quality_status),lot_status:p2Upper_(l.lot_status)};}),write_actions:Object.keys(P2_WRITE_ACTIONS),write_security:p2WriteSecurity_()};}

function p2GetLocationInventory(payload){const ctx=p2InventoryContext_(),loc=p2ActiveLocation_(ctx,payload.location_id),id=p2Upper_(loc.location_id),lines=p2PositiveBalances_(ctx).filter(function(b){return p2Upper_(b.location_id)===id;}).map(function(b){return p2DecoratedBalance_(ctx,b);});return {version:P2_INVENTORY_API_VERSION,location:p2LocationPublic_(loc),stock_lines:lines,is_empty:!lines.length,product_count:Object.keys(lines.reduce(function(m,x){m[x.product_id]=1;return m;},{})).length,lot_count:Object.keys(lines.reduce(function(m,x){m[x.lot_id]=1;return m;},{})).length,total_by_base_unit:lines.reduce(function(m,x){m[x.base_unit]=(m[x.base_unit]||0)+x.current_base_qty;return m;},{}),inventory_value_usd:lines.reduce(function(s,x){return s+x.inventory_value;},0)};}
function p2GetRackInventory(payload){const ctx=p2InventoryContext_(),rack=p2Upper_(payload.rack);if(!/^R(?:0[1-9]|[1-4]\d|50)$/.test(rack))throw new Error('Rack must be R01 through R50.');const locs=ctx.locations.filter(function(l){return p2Bool_(l.is_active)&&p2Upper_(l.rack)===rack;});if(!locs.length)throw new Error('Active rack not found: '+rack);const all=p2PositiveBalances_(ctx).map(function(b){return p2DecoratedBalance_(ctx,b);});return {version:P2_INVENTORY_API_VERSION,rack:rack,spaces:locs.map(function(l){const id=p2Upper_(l.location_id),stock=all.filter(function(x){return x.location_id===id;});return {location_id:id,level:p2Upper_(l.level),position:p2Upper_(l.position),stock_lines:stock,is_empty:!stock.length,product_count:Object.keys(stock.reduce(function(m,x){m[x.product_id]=1;return m;},{})).length,total_by_base_unit:stock.reduce(function(m,x){m[x.base_unit]=(m[x.base_unit]||0)+x.current_base_qty;return m;},{})};})};}
function p2GetProductInventory(payload){const ctx=p2InventoryContext_(),p=p2ActiveProduct_(ctx,payload.product_id),lines=p2PositiveBalances_(ctx).filter(function(b){return p2String_(b.product_id)===p2String_(p.product_id);}).map(function(b){return p2DecoratedBalance_(ctx,b);}),on=lines.reduce(function(s,x){return s+x.current_base_qty;},0);return {version:P2_INVENTORY_API_VERSION,product:p2ProductPublic_(ctx,p,on),stock_lines:lines,on_hand_base:on,inventory_value_usd:lines.reduce(function(s,x){return s+x.inventory_value;},0),location_count:Object.keys(lines.reduce(function(m,x){m[x.location_id]=1;return m;},{})).length,lot_count:Object.keys(lines.reduce(function(m,x){m[x.lot_id]=1;return m;},{})).length};}
function p2GetLotInventory(payload){const ctx=p2InventoryContext_(),l=p2Lot_(ctx,payload.lot_id,payload.product_id||''),p=ctx.products.find(function(r){return p2String_(r.product_id)===p2String_(l.product_id);})||{},lines=p2PositiveBalances_(ctx).filter(function(b){return p2String_(b.lot_id)===p2String_(l.lot_id);}).map(function(b){return p2DecoratedBalance_(ctx,b);});return {version:P2_INVENTORY_API_VERSION,lot:{lot_id:p2String_(l.lot_id),product_id:p2String_(l.product_id),product_name:p2String_(p.product_name),supplier_lot_number:p2String_(l.supplier_lot_number),vendor_party_id:p2String_(l.vendor_party_id),source_order_line_id:p2String_(l.source_order_line_id),received_at:l.received_at||'',received_base_qty:p2Num_(l.received_base_qty),received_unit_qty:p2Num_(l.received_unit_qty),unit_code:p2Upper_(l.unit_code),conversion_to_base:p2Num_(l.conversion_to_base),cost_per_base:p2Num_(l.cost_per_base),currency:p2Upper_(l.currency),expiration_date:l.expiration_date||'',quality_status:p2Upper_(l.quality_status),lot_status:p2Upper_(l.lot_status),notes:p2String_(l.notes)},stock_lines:lines,on_hand_base:lines.reduce(function(s,x){return s+x.current_base_qty;},0),inventory_value_usd:lines.reduce(function(s,x){return s+x.inventory_value;},0)};}
function p2GetMovementHistory(payload){payload=payload||{};const ctx=p2InventoryContext_(),pid=p2String_(payload.product_id),lid=p2String_(payload.lot_id),loc=p2Upper_(payload.location_id),type=p2Upper_(payload.movement_type),op=p2String_(payload.operation_id),uid=p2String_(payload.user_id),limit=Math.max(1,Math.min(P2_MAX_HISTORY,Number(payload.limit)||50));return ctx.movements.filter(function(m){if(pid&&p2String_(m.product_id)!==pid)return false;if(lid&&p2String_(m.lot_id)!==lid)return false;if(loc&&p2Upper_(m.from_location_id)!==loc&&p2Upper_(m.to_location_id)!==loc)return false;if(type&&p2Upper_(m.movement_type)!==type)return false;if(op&&p2String_(m.operation_id)!==op)return false;if(uid&&p2String_(m.user_id)!==uid)return false;return true;}).sort(function(a,b){return p2Num_(b.movement_sequence)-p2Num_(a.movement_sequence);}).slice(0,limit).map(p2MovementPublic_);}
function p2LookupInventory(payload){payload=payload||{};const q=p2Norm_(payload.query||payload.scan||payload.value);if(!q)throw new Error('query is required.');const ctx=p2InventoryContext_(),limit=Math.max(1,Math.min(P2_MAX_SEARCH_RESULTS,Number(payload.limit)||25)),balances=p2PositiveBalances_(ctx).map(function(b){return p2DecoratedBalance_(ctx,b);});const products=ctx.products.filter(function(p){return [p.product_id,p.product_name,p.sku,p.barcode,p.category].map(p2Norm_).join(' ').indexOf(q)>=0;}).slice(0,limit).map(function(p){const id=p2String_(p.product_id),on=balances.filter(function(x){return x.product_id===id;}).reduce(function(s,x){return s+x.current_base_qty;},0);return p2ProductPublic_(ctx,p,on);}),locations=ctx.locations.filter(function(l){return [l.location_id,l.scan_code,l.rack,l.notes].map(p2Norm_).join(' ').indexOf(q)>=0;}).slice(0,limit).map(p2LocationPublic_),lots=ctx.lots.filter(function(l){return [l.lot_id,l.supplier_lot_number,l.product_id].map(p2Norm_).join(' ').indexOf(q)>=0;}).slice(0,limit).map(function(l){return {lot_id:p2String_(l.lot_id),product_id:p2String_(l.product_id),supplier_lot_number:p2String_(l.supplier_lot_number),unit_code:p2Upper_(l.unit_code),conversion_to_base:p2Num_(l.conversion_to_base),lot_status:p2Upper_(l.lot_status)};});return {version:P2_INVENTORY_API_VERSION,query:p2String_(payload.query||payload.scan||payload.value),products:products,locations:locations,lots:lots};}

function p2InventoryHealth(){
  const ctx=p2InventoryContext_(),products={},lots={},locations={},keys={},seqs={},ops={};let orphanP=0,orphanL=0,wrong=0,orphanLoc=0,neg=0,zero=0,badKey=0;
  ctx.products.forEach(function(r){products[p2String_(r.product_id)]=1;});ctx.lots.forEach(function(r){lots[p2String_(r.lot_id)]=p2String_(r.product_id);});ctx.locations.forEach(function(r){locations[p2Upper_(r.location_id)]=1;});
  ctx.balances.forEach(function(b){const k=p2String_(b.balance_key),expected=p2BalanceKey_(b.product_id,b.lot_id,b.location_id);keys[k]=(keys[k]||0)+1;if(k!==expected)badKey++;if(!products[p2String_(b.product_id)])orphanP++;if(!lots[p2String_(b.lot_id)])orphanL++;else if(lots[p2String_(b.lot_id)]!==p2String_(b.product_id))wrong++;if(!locations[p2Upper_(b.location_id)])orphanLoc++;if(p2Num_(b.current_base_qty)<-P2_EPSILON)neg++;if(Math.abs(p2Num_(b.current_base_qty))<=P2_EPSILON)zero++;});
  ctx.movements.forEach(function(m){const s=p2Num_(m.movement_sequence);seqs[s]=(seqs[s]||0)+1;const op=p2String_(m.operation_id),mig=p2Upper_(m.movement_type)==='OPENING_INVENTORY'||/^MIGRATION-/i.test(op);if(op&&!mig)ops[op]=(ops[op]||0)+1;});
  const pos=p2PositiveBalances_(ctx),decorated=pos.map(function(b){return p2DecoratedBalance_(ctx,b);}),dupKeys=Object.keys(keys).filter(function(k){return k&&keys[k]>1;}).length,dupSeq=Object.keys(seqs).filter(function(k){return seqs[k]>1;}).length,dupOps=Object.keys(ops).filter(function(k){return ops[k]>1;}).length,active=ctx.locations.filter(function(r){return p2Bool_(r.is_active);}),critical=dupKeys+dupSeq+dupOps+orphanP+orphanL+wrong+orphanLoc+neg+zero+badKey;
  return {version:P2_INVENTORY_API_VERSION,schema_version:P2_INVENTORY_SCHEMA_VERSION,spreadsheet_id:P2_SPREADSHEET_ID,status:critical===0?'OK':'CHECK',generated_at:p2Now_(),active_products:ctx.products.filter(function(r){return p2Bool_(r.is_active);}).length,active_locations:active.length,active_rack_locations:active.filter(function(r){return p2Upper_(r.location_type)==='RACK';}).length,floor_locations:active.filter(function(r){return p2Upper_(r.location_type)==='FLOOR';}).length,packing_locations:active.filter(function(r){return p2Upper_(r.location_id)==='PACKING';}).length,lots:ctx.lots.length,positive_balance_lines:pos.length,movement_rows:ctx.movements.length,max_movement_sequence:ctx.movements.reduce(function(max,r){return Math.max(max,p2Num_(r.movement_sequence));},0),duplicate_balance_keys:dupKeys,malformed_balance_keys:badKey,duplicate_movement_sequences:dupSeq,duplicate_regular_operation_ids:dupOps,orphan_product_balances:orphanP,orphan_lot_balances:orphanL,wrong_product_lot_balances:wrong,orphan_location_balances:orphanLoc,negative_balance_lines:neg,zero_balance_lines:zero,summary:p2Summary_(ctx,decorated),write_security:p2WriteSecurity_()};
}
function p2InventoryContract(){return {version:P2_INVENTORY_API_VERSION,schema_version:P2_INVENTORY_SCHEMA_VERSION,reads:Object.keys(P2_READ_ACTIONS),writes:Object.keys(P2_WRITE_ACTIONS),rules:{GET:'read only',POST:'inventory writes only',balance_key:'product_id|lot_id|location_id',zero_balances:'cleared from INVENTORY_BALANCES',mixed_locations:'allowed',historical_conversion:'LOTS.conversion_to_base is authoritative for existing stock',move:'does not change total company inventory',receive:'increases total company inventory and creates/reuses a lot',adjust_in:'increases total company inventory',adjust_out:'decreases total company inventory',packing_move:'MOVE only; does not reduce total company inventory',packing_deduct:'decreases total company inventory from PACKING',physical_count:'sets exact product+lot+location quantity and records the difference',idempotency:'operation_id is mandatory on every write',concurrency:'expected_source_sequence rejects stale stock selections',write_security:'INVENTORY_WRITES_ENABLED and INVENTORY_WRITE_TOKEN Script Properties are required before writes execute',batch:'up to '+P2_MAX_BATCH_OPERATIONS+' operations; idempotent per child operation; not globally atomic'}};}

function p2WithInventoryLock_(fn){const lock=LockService.getScriptLock();lock.waitLock(25000);try{return fn();}finally{lock.releaseLock();}}
function p2DuplicateOperationResult_(m){return {duplicate:true,operation_id:p2String_(m.operation_id),movement_id:p2String_(m.movement_id),movement_sequence:p2Num_(m.movement_sequence),movement_type:p2Upper_(m.movement_type)};}
function p2BalanceMutation_(ctx,p,l,loc,newQty,seq,now){const key=p2BalanceKey_(p,l,loc),existing=p2Balance_(ctx,p,l,loc),snap={table:ctx.balancesTable,existed:Boolean(existing),row:existing?existing._sheet_row:null,oldRecord:existing?Object.assign({},existing):null,appended:false};if(newQty>P2_EPSILON){const r={balance_key:key,product_id:p,lot_id:l,location_id:p2Upper_(loc),current_base_qty:newQty,last_movement_sequence:seq,updated_at:now};if(existing)p2Write_(ctx.balancesTable,existing._sheet_row,r);else{snap.row=p2Append_(ctx.balancesTable,r);snap.appended=true;}}else if(existing)p2Clear_(ctx.balancesTable,existing._sheet_row);return snap;}
function p2RollbackRows_(snaps){snaps.slice().reverse().forEach(function(s){try{if(s.appended)p2Clear_(s.table,s.row);else if(s.existed)p2Write_(s.table,s.row,s.oldRecord);}catch(_e){}});}
function p2Audit_(actor,action,tableName,recordId,oldValue,newValue,notes){try{const t=p2Table_('AUDIT_LOG','audit_id'),id=p2CompactId_(t.records,'audit_id','AUD');p2Append_(t,{audit_id:id,occurred_at:p2Now_(),user_id:actor.user_id,action_type:action,table_name:tableName,record_id:recordId,old_value:p2JsonText_(oldValue),new_value:p2JsonText_(newValue),notes:notes||''});}catch(_e){}}

function p2ExecuteMovement_(a){
  const ctx=a.ctx,seq=p2NextMovementSequence_(ctx.movements),now=p2Now_(),snaps=[];let movementRow=null;
  try{if(a.source)snaps.push(p2BalanceMutation_(ctx,a.productId,a.lotId,a.source.locationId,a.source.newQty,seq,now));if(a.destination)snaps.push(p2BalanceMutation_(ctx,a.productId,a.lotId,a.destination.locationId,a.destination.newQty,seq,now));const id=p2CompactId_(ctx.movements,'movement_id','MOV'),q=a.quantity||{quantity_base:0,entered_qty:0,entered_unit:'',conversion_to_base:1},row={movement_sequence:seq,movement_id:id,movement_type:a.movementType,occurred_at:now,product_id:a.productId,lot_id:a.lotId,quantity_base:p2Num_(q.quantity_base),entered_qty:p2Num_(q.entered_qty),entered_unit:p2Upper_(q.entered_unit),conversion_to_base:p2Num_(q.conversion_to_base)||1,from_location_id:a.fromLocation||'',to_location_id:a.toLocation||'',order_id:p2String_(a.orderId),order_line_id:p2String_(a.orderLineId),task_id:p2String_(a.taskId),operation_id:a.operationId,user_id:a.actor.user_id,approval_status:p2Upper_(a.approvalStatus||'APPROVED'),notes:a.notes||''};movementRow=p2Append_(ctx.movementsTable,row);SpreadsheetApp.flush();p2Audit_(a.actor,a.auditAction||a.movementType,'INVENTORY_BALANCES',a.productId+'|'+a.lotId,a.auditOld||{},a.auditNew||{},a.operationId);return {duplicate:false,operation_id:a.operationId,movement_id:id,movement_sequence:seq,movement_type:a.movementType,product_id:a.productId,lot_id:a.lotId,quantity_base:p2Num_(q.quantity_base),entered_qty:p2Num_(q.entered_qty),entered_unit:p2Upper_(q.entered_unit),conversion_to_base:p2Num_(q.conversion_to_base)||1,from_location_id:a.fromLocation||'',to_location_id:a.toLocation||''};}
  catch(error){if(movementRow){try{p2Clear_(ctx.movementsTable,movementRow);}catch(_e){}}p2RollbackRows_(snaps);try{SpreadsheetApp.flush();}catch(_f){}throw error;}
}

function p2CreateLot_(ctx,product,q,payload,kind){const id=p2CompactId_(ctx.lots,'lot_id','LOT'),txt=payload.cost_per_base===undefined||payload.cost_per_base===null?'':String(payload.cost_per_base).trim(),supplied=txt===''?NaN:Number(txt),fallback=p2LatestLotCost_(ctx,product.product_id),cost=Number.isFinite(supplied)&&supplied>=0?supplied:fallback,row={lot_id:id,product_id:p2String_(product.product_id),vendor_party_id:p2String_(payload.vendor_party_id),source_order_line_id:p2String_(payload.source_order_line_id||payload.order_line_id),supplier_lot_number:p2String_(payload.supplier_lot_number),received_at:p2DateOrBlank_(payload.received_at)||p2Now_(),received_base_qty:q.quantity_base,received_unit_qty:q.entered_qty,unit_code:q.entered_unit,conversion_to_base:q.conversion_to_base,cost_per_base:cost,currency:p2Upper_(payload.currency||'USD'),expiration_date:p2DateOrBlank_(payload.expiration_date),quality_status:p2Upper_(payload.quality_status||'PASS'),lot_status:p2Upper_(payload.lot_status||'ACTIVE'),created_at:p2Now_(),notes:(kind||'INVENTORY')+' LOT.'+(cost>0?'':' VALUATION REQUIRED.')+(payload.notes?' '+p2String_(payload.notes):'')},rowNumber=p2Append_(ctx.lotsTable,row);return {row:row,rowNumber:rowNumber,created:true};}
function p2ResolveInboundLot_(ctx,product,payload,kind){if(payload.lot_id){const lot=p2Lot_(ctx,payload.lot_id,product.product_id);return {lot:lot,quantity:p2ExistingLotQuantity_(product,lot,payload.quantity,payload.unit_code),createdLot:null};}const q=p2NewLotQuantity_(ctx,product,payload.quantity,payload.unit_code||product.base_unit,payload.conversion_to_base),supplier=p2Norm_(payload.supplier_lot_number);let existing=null;if(supplier)existing=ctx.lots.find(function(l){return p2String_(l.product_id)===p2String_(product.product_id)&&p2Norm_(l.supplier_lot_number)===supplier&&p2Upper_(l.unit_code)===q.entered_unit&&Math.abs(p2Num_(l.conversion_to_base)-q.conversion_to_base)<=P2_EPSILON&&['ACTIVE','HOLD',''].indexOf(p2Upper_(l.lot_status))>=0;})||null;if(existing)return {lot:existing,quantity:q,createdLot:null};const created=p2CreateLot_(ctx,product,q,payload,kind);return {lot:created.row,quantity:q,createdLot:created};}
function p2UpdateExistingLotReceipt_(ctx,lot,q){if(!lot||!lot._sheet_row)return null;const snap={table:ctx.lotsTable,existed:true,row:lot._sheet_row,oldRecord:Object.assign({},lot),appended:false},u=Object.assign({},lot),conv=p2Num_(lot.conversion_to_base)||1;u.received_base_qty=p2Num_(lot.received_base_qty)+q.quantity_base;u.received_unit_qty=p2Num_(lot.received_unit_qty)+q.quantity_base/conv;p2Write_(ctx.lotsTable,lot._sheet_row,u);return snap;}

function p2MoveInventory(payload){return p2WithInventoryLock_(function(){const actor=p2Actor_(payload,['ADMIN','MANAGER','OPERATOR']),op=p2RequireOperationId_(payload),ctx=p2InventoryContext_(),dup=p2FindOperation_(ctx,op);if(dup)return p2DuplicateOperationResult_(dup);const product=p2ActiveProduct_(ctx,payload.product_id),lot=p2Lot_(ctx,payload.lot_id,product.product_id),from=p2Upper_(p2ActiveLocation_(ctx,payload.from_location_id).location_id),to=p2Upper_(p2ActiveLocation_(ctx,payload.to_location_id).location_id);if(from===to)throw new Error('Source and destination must be different.');const source=p2Balance_(ctx,product.product_id,lot.lot_id,from);if(!source||p2Num_(source.current_base_qty)<=P2_EPSILON)throw new Error('No positive source balance exists at '+from+'.');p2CheckExpectedSequence_(source,payload.expected_source_sequence);const q=p2ExistingLotQuantity_(product,lot,payload.quantity,payload.unit_code),sq=p2Num_(source.current_base_qty);if(q.quantity_base-sq>P2_EPSILON)throw new Error('Only '+sq+' '+p2Upper_(product.base_unit)+' are available at '+from+'.');const destination=p2Balance_(ctx,product.product_id,lot.lot_id,to),dq=destination?p2Num_(destination.current_base_qty):0,result=p2ExecuteMovement_({ctx:ctx,actor:actor,operationId:op,movementType:'MOVE',productId:p2String_(product.product_id),lotId:p2String_(lot.lot_id),quantity:q,fromLocation:from,toLocation:to,source:{locationId:from,newQty:sq-q.quantity_base},destination:{locationId:to,newQty:dq+q.quantity_base},orderId:payload.order_id,orderLineId:payload.order_line_id,taskId:payload.task_id,notes:'INVENTORY_MOVE'+(payload.notes?' · '+p2String_(payload.notes):''),auditOld:{from:sq,to:dq},auditNew:{from:sq-q.quantity_base,to:dq+q.quantity_base}});result.source_balance_base_qty=Math.max(0,sq-q.quantity_base);result.destination_balance_base_qty=dq+q.quantity_base;return result;});}
function p2MoveToPacking(payload){return p2MoveInventory(Object.assign({},payload,{to_location_id:'PACKING'}));}
function p2MoveFromPacking(payload){return p2MoveInventory(Object.assign({},payload,{from_location_id:'PACKING'}));}

function p2ReceiveInventory(payload){return p2WithInventoryLock_(function(){const actor=p2Actor_(payload,['ADMIN','MANAGER','OPERATOR']),op=p2RequireOperationId_(payload),ctx=p2InventoryContext_(),dup=p2FindOperation_(ctx,op);if(dup)return p2DuplicateOperationResult_(dup);const product=p2ActiveProduct_(ctx,payload.product_id),loc=p2Upper_(p2ActiveLocation_(ctx,payload.location_id||payload.to_location_id).location_id);let resolved=null,receiptSnap=null;try{resolved=p2ResolveInboundLot_(ctx,product,payload,'RECEIVING');const lot=resolved.lot,q=resolved.quantity;if(!resolved.createdLot)receiptSnap=p2UpdateExistingLotReceipt_(ctx,lot,q);const b=p2Balance_(ctx,product.product_id,lot.lot_id,loc),old=b?p2Num_(b.current_base_qty):0,result=p2ExecuteMovement_({ctx:ctx,actor:actor,operationId:op,movementType:'RECEIVE',productId:p2String_(product.product_id),lotId:p2String_(lot.lot_id),quantity:q,toLocation:loc,destination:{locationId:loc,newQty:old+q.quantity_base},orderId:payload.order_id,orderLineId:payload.order_line_id||payload.source_order_line_id,taskId:payload.task_id,notes:'RECEIVE'+(payload.notes?' · '+p2String_(payload.notes):''),auditOld:{location:loc,qty:old},auditNew:{location:loc,qty:old+q.quantity_base}});result.created_lot=Boolean(resolved.createdLot);result.new_balance_base_qty=old+q.quantity_base;return result;}catch(error){if(receiptSnap)p2RollbackRows_([receiptSnap]);if(resolved&&resolved.createdLot){try{p2Clear_(ctx.lotsTable,resolved.createdLot.rowNumber);}catch(_e){}}throw error;}});}

function p2AdjustInventoryIn(payload){return p2WithInventoryLock_(function(){const actor=p2Actor_(payload,['ADMIN','MANAGER']),op=p2RequireOperationId_(payload),ctx=p2InventoryContext_(),dup=p2FindOperation_(ctx,op);if(dup)return p2DuplicateOperationResult_(dup);const product=p2ActiveProduct_(ctx,payload.product_id),loc=p2Upper_(p2ActiveLocation_(ctx,payload.location_id).location_id);let resolved=null;try{resolved=p2ResolveInboundLot_(ctx,product,payload,'MANUAL ADJUSTMENT');const lot=resolved.lot,q=resolved.quantity,b=p2Balance_(ctx,product.product_id,lot.lot_id,loc),old=b?p2Num_(b.current_base_qty):0,result=p2ExecuteMovement_({ctx:ctx,actor:actor,operationId:op,movementType:'ADJUST_IN',productId:p2String_(product.product_id),lotId:p2String_(lot.lot_id),quantity:q,toLocation:loc,destination:{locationId:loc,newQty:old+q.quantity_base},notes:'MANUAL_INVENTORY_ADJUST_IN'+(payload.reason?' · '+p2String_(payload.reason):'')+(payload.notes?' · '+p2String_(payload.notes):''),auditOld:{location:loc,qty:old},auditNew:{location:loc,qty:old+q.quantity_base}});result.created_lot=Boolean(resolved.createdLot);result.new_balance_base_qty=old+q.quantity_base;return result;}catch(error){if(resolved&&resolved.createdLot){try{p2Clear_(ctx.lotsTable,resolved.createdLot.rowNumber);}catch(_e){}}throw error;}});}
function p2FoundInventory(payload){const next=Object.assign({},payload);next.reason=p2String_(payload.reason||'FOUND_INVENTORY');return p2AdjustInventoryIn(next);}
function p2AdjustInventoryOut(payload){return p2WithInventoryLock_(function(){const actor=p2Actor_(payload,['ADMIN','MANAGER']),op=p2RequireOperationId_(payload),ctx=p2InventoryContext_(),dup=p2FindOperation_(ctx,op);if(dup)return p2DuplicateOperationResult_(dup);const product=p2ActiveProduct_(ctx,payload.product_id),lot=p2Lot_(ctx,payload.lot_id,product.product_id),loc=p2Upper_(p2ActiveLocation_(ctx,payload.location_id).location_id),b=p2Balance_(ctx,product.product_id,lot.lot_id,loc);if(!b||p2Num_(b.current_base_qty)<=P2_EPSILON)throw new Error('No positive balance exists for this product/lot/location.');p2CheckExpectedSequence_(b,payload.expected_source_sequence);const q=p2ExistingLotQuantity_(product,lot,payload.quantity,payload.unit_code),old=p2Num_(b.current_base_qty);if(q.quantity_base-old>P2_EPSILON)throw new Error('Cannot remove more than the current balance of '+old+' '+p2Upper_(product.base_unit)+'.');const result=p2ExecuteMovement_({ctx:ctx,actor:actor,operationId:op,movementType:'ADJUST_OUT',productId:p2String_(product.product_id),lotId:p2String_(lot.lot_id),quantity:q,fromLocation:loc,source:{locationId:loc,newQty:old-q.quantity_base},notes:'MANUAL_INVENTORY_ADJUST_OUT'+(payload.reason?' · '+p2String_(payload.reason):'')+(payload.notes?' · '+p2String_(payload.notes):''),auditOld:{location:loc,qty:old},auditNew:{location:loc,qty:old-q.quantity_base}});result.new_balance_base_qty=Math.max(0,old-q.quantity_base);return result;});}

function p2PhysicalCount(payload){return p2WithInventoryLock_(function(){const actor=p2Actor_(payload,['ADMIN','MANAGER','OPERATOR']),op=p2RequireOperationId_(payload),ctx=p2InventoryContext_(),dup=p2FindOperation_(ctx,op);if(dup)return p2DuplicateOperationResult_(dup);const product=p2ActiveProduct_(ctx,payload.product_id),lot=p2Lot_(ctx,payload.lot_id,product.product_id),loc=p2Upper_(p2ActiveLocation_(ctx,payload.location_id).location_id),b=p2Balance_(ctx,product.product_id,lot.lot_id,loc),current=b?p2Num_(b.current_base_qty):0;p2CheckExpectedSequence_(b,payload.expected_source_sequence);const actual=Number(payload.actual_quantity);if(!Number.isFinite(actual)||actual<0)throw new Error('actual_quantity must be zero or greater.');const unit=p2Upper_(payload.unit_code||product.base_unit);let conv=0;if(unit===p2Upper_(product.base_unit))conv=1;else if(unit===p2Upper_(lot.unit_code))conv=p2Num_(lot.conversion_to_base);else throw new Error('Physical count must be entered as '+p2Upper_(product.base_unit)+' or '+p2Upper_(lot.unit_code)+'.');if(!(conv>0))throw new Error('Lot conversion is invalid.');const actualBase=actual*conv,delta=actualBase-current;if(Math.abs(delta)<=P2_EPSILON){const verified=p2ExecuteMovement_({ctx:ctx,actor:actor,operationId:op,movementType:'COUNT_VERIFIED',productId:p2String_(product.product_id),lotId:p2String_(lot.lot_id),quantity:{entered_qty:actual,entered_unit:unit,conversion_to_base:conv,quantity_base:0},fromLocation:loc,toLocation:loc,notes:'PHYSICAL_COUNT_VERIFIED · actual '+actual+' '+unit+(payload.notes?' · '+p2String_(payload.notes):''),auditAction:'PHYSICAL_COUNT_VERIFIED',auditOld:{location:loc,qty:current},auditNew:{location:loc,qty:current}});verified.location_id=loc;verified.previous_base_qty=current;verified.actual_base_qty=actualBase;verified.difference_base_qty=0;return verified;}const type=delta>0?'ADJUST_IN':'ADJUST_OUT',diff=Math.abs(delta),q={entered_qty:diff/conv,entered_unit:unit,conversion_to_base:conv,quantity_base:diff},result=p2ExecuteMovement_({ctx:ctx,actor:actor,operationId:op,movementType:type,productId:p2String_(product.product_id),lotId:p2String_(lot.lot_id),quantity:q,fromLocation:delta<0?loc:'',toLocation:delta>0?loc:'',source:delta<0?{locationId:loc,newQty:actualBase}:null,destination:delta>0?{locationId:loc,newQty:actualBase}:null,notes:'PHYSICAL_COUNT · actual '+actual+' '+unit+(payload.notes?' · '+p2String_(payload.notes):''),auditAction:'PHYSICAL_COUNT_'+type,auditOld:{location:loc,qty:current},auditNew:{location:loc,qty:actualBase}});result.location_id=loc;result.previous_base_qty=current;result.actual_base_qty=actualBase;result.difference_base_qty=delta;return result;});}

function p2PackingDeduct(payload){return p2WithInventoryLock_(function(){const actor=p2Actor_(payload,['ADMIN','MANAGER','OPERATOR']),op=p2RequireOperationId_(payload),ctx=p2InventoryContext_(),dup=p2FindOperation_(ctx,op);if(dup)return p2DuplicateOperationResult_(dup);const product=p2ActiveProduct_(ctx,payload.product_id),lot=p2Lot_(ctx,payload.lot_id,product.product_id);p2ActiveLocation_(ctx,'PACKING');const b=p2Balance_(ctx,product.product_id,lot.lot_id,'PACKING');if(!b||p2Num_(b.current_base_qty)<=P2_EPSILON)throw new Error('No positive PACKING balance exists for this product and lot.');p2CheckExpectedSequence_(b,payload.expected_source_sequence);const q=p2ExistingLotQuantity_(product,lot,payload.quantity,payload.unit_code),old=p2Num_(b.current_base_qty);if(q.quantity_base-old>P2_EPSILON)throw new Error('Cannot deduct more than '+old+' '+p2Upper_(product.base_unit)+' from PACKING.');const result=p2ExecuteMovement_({ctx:ctx,actor:actor,operationId:op,movementType:'PACKING_DEDUCT',productId:p2String_(product.product_id),lotId:p2String_(lot.lot_id),quantity:q,fromLocation:'PACKING',source:{locationId:'PACKING',newQty:old-q.quantity_base},orderId:payload.order_id,orderLineId:payload.order_line_id,taskId:payload.task_id,notes:'PACKING_DEDUCT'+(payload.notes?' · '+p2String_(payload.notes):''),auditOld:{location:'PACKING',qty:old},auditNew:{location:'PACKING',qty:old-q.quantity_base}});result.new_packing_balance_base_qty=Math.max(0,old-q.quantity_base);return result;});}

function p2BatchInventory(payload){payload=payload||{};p2RequireWriteSecurity_(payload);const userId=p2String_(payload.user_id);if(!userId)throw new Error('user_id is required for batch inventory.');const batchId=p2String_(payload.batch_operation_id||payload.operation_id);if(!batchId)throw new Error('batch_operation_id or operation_id is required.');const operations=Array.isArray(payload.operations)?payload.operations:[];if(!operations.length)throw new Error('operations must contain at least one inventory action.');if(operations.length>P2_MAX_BATCH_OPERATIONS)throw new Error('A batch may contain at most '+P2_MAX_BATCH_OPERATIONS+' operations.');const cont=p2Bool_(payload.continue_on_error),results=[];for(let i=0;i<operations.length;i++){const item=operations[i]||{},action=p2String_(item.action);if(!action||action==='batchInventory'||!P2_WRITE_ACTIONS[action]){results.push({index:i,action:action,ok:false,error:'Unsupported batch action: '+action});if(!cont)break;continue;}const child=Object.assign({},item.payload||{});child.user_id=child.user_id||userId;child.write_token=child.write_token||payload.write_token;child.operation_id=child.operation_id||batchId+'-'+(i+1);try{results.push({index:i,action:action,ok:true,result:P2_WRITE_ACTIONS[action](child)});}catch(error){results.push({index:i,action:action,ok:false,error:p2ErrorMessage_(error)});if(!cont)break;}}return {batch_operation_id:batchId,atomic:false,requested:operations.length,attempted:results.length,succeeded:results.filter(function(r){return r.ok;}).length,failed:results.filter(function(r){return !r.ok;}).length,results:results};}
