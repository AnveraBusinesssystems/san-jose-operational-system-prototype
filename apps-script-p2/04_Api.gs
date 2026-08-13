/** Public web-app routing. GET is read-only; POST contains all mutations. */

var SJ_READ_ACTIONS = Object.freeze({
  apiInfo: sjApiInfo,
  ping: sjApiInfo,
  schemaHealth: sjSchemaHealth,
  listProducts: sjListProducts,
  getProduct: sjGetProduct,
  listParties: sjListParties,
  listLocations: sjListLocations,
  listOrders: sjListOrders,
  getOrder: sjGetOrder,
  listPayments: sjListPayments,
  inventoryHealth: sjInventoryHealth,
  inventoryBootstrap: sjInventoryBootstrap,
  inventoryMetrics: sjInventoryMetrics,
  getInventoryMetrics: sjInventoryMetrics,
  inventoryFormOptions: sjInventoryFormOptions,
  getLocationInventory: sjGetLocationInventory,
  getRackInventory: sjGetRackInventory,
  getProductInventory: sjGetProductInventory,
  getLotInventory: sjGetLotInventory,
  getMovementHistory: sjGetMovementHistory,
  lookupInventory: sjLookupInventory,
  inventoryContract: sjInventoryContract,
  listWarehouseTasks: sjListWarehouseTasks,
  getDemandMetrics: sjGetDemandMetrics,
  getWebsiteMetrics: sjGetWebsiteMetrics,
  getDashboard: sjGetDashboard
});

var SJ_WRITE_ACTIONS = Object.freeze({
  login: sjLogin,
  sessionInfo: sjSessionInfo,
  createUser: sjCreateUser,
  setUserStatus: sjSetUserStatus,
  createProduct: sjCreateProduct,
  updateProduct: sjUpdateProduct,
  createParty: sjCreateParty,
  updateParty: sjUpdateParty,
  createOrder: sjCreateOrder,
  updateOrder: sjUpdateOrder,
  cancelOrder: sjCancelOrder,
  recordPayment: sjRecordPayment,
  moveInventory: sjMoveInventory,
  transferInventory: sjMoveInventory,
  moveToPacking: sjMoveToPacking,
  moveFromPacking: sjMoveFromPacking,
  receiveInventory: sjReceiveInventory,
  adjustInventoryIn: sjAdjustInventoryIn,
  foundInventory: sjFoundInventory,
  adjustInventoryOut: sjAdjustInventoryOut,
  physicalCount: sjPhysicalCount,
  packingDeduct: sjPackingDeduct,
  createWarehouseTask: sjCreateWarehouseTask,
  updateWarehouseTask: sjUpdateWarehouseTask
});

function doGet(event) {
  var callback = '';
  var action = '';
  try {
    callback = sjCallback_(event && event.parameter && event.parameter.callback);
    action = sjString_(event && event.parameter && event.parameter.action) || 'apiInfo';
    if (!SJ_READ_ACTIONS[action]) throw new Error('GET action is not allowed: ' + action + '.');
    var payload = sjParseJson_(event && event.parameter && event.parameter.payload, 'payload');
    return sjOutput_({ok: true, action: action, version: SJ_CONFIG.API_VERSION, result: SJ_READ_ACTIONS[action](payload)}, callback);
  } catch (error) {
    return sjOutput_({ok: false, action: action, version: SJ_CONFIG.API_VERSION, error: sjErrorMessage_(error)}, callback);
  }
}

function doPost(event) {
  var action = '';
  try {
    var request = sjPostRequest_(event);
    action = request.action;
    if (!SJ_WRITE_ACTIONS[action]) throw new Error('POST action is not allowed: ' + action + '.');
    return sjOutput_({ok: true, action: action, version: SJ_CONFIG.API_VERSION, result: SJ_WRITE_ACTIONS[action](request.payload || {})}, '');
  } catch (error) {
    return sjOutput_({ok: false, action: action, version: SJ_CONFIG.API_VERSION, error: sjErrorMessage_(error)}, '');
  }
}

function sjPostRequest_(event) {
  var parameters = event && event.parameter ? event.parameter : {};
  var bodyText = sjString_(event && event.postData && event.postData.contents);
  var contentType = sjLower_(event && event.postData && event.postData.type);
  if (bodyText && (contentType.indexOf('application/json') >= 0 || bodyText.charAt(0) === '{')) {
    var body = sjParseJson_(bodyText, 'request body');
    return {action: sjString_(body.action), payload: body.payload && typeof body.payload === 'object' ? body.payload : {}};
  }
  var payload = parameters.payload ? sjParseJson_(parameters.payload, 'payload') : {};
  if (!parameters.payload) {
    Object.keys(parameters).forEach(function (key) {
      if (key !== 'action' && key !== 'callback') payload[key] = parameters[key];
    });
  }
  return {action: sjString_(parameters.action), payload: payload};
}

function sjCallback_(value) {
  var callback = sjString_(value);
  if (!callback) return '';
  if (!/^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) throw new Error('Invalid callback name.');
  return callback;
}

function sjOutput_(value, callback) {
  var json = JSON.stringify(value);
  if (callback) return ContentService.createTextOutput(callback + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function sjApiInfo() {
  return {
    service: 'San Jose Operational System',
    version: SJ_CONFIG.API_VERSION,
    schema_version: SJ_CONFIG.SCHEMA_VERSION,
    spreadsheet_id: SJ_CONFIG.SPREADSHEET_ID,
    reads: Object.keys(SJ_READ_ACTIONS),
    writes: Object.keys(SJ_WRITE_ACTIONS),
    writes_enabled: sjWritesEnabled_(),
    write_security: {
      writes_enabled: sjWritesEnabled_(),
      session_authentication: true,
      legacy_write_token_configured: Boolean(sjString_(sjScriptProperties_().getProperty(SJ_SCRIPT_PROPERTIES.LEGACY_WRITE_TOKEN))),
      legacy_write_token_enabled: sjUpper_(sjScriptProperties_().getProperty(SJ_SCRIPT_PROPERTIES.ALLOW_LEGACY_WRITE_TOKEN)) === 'TRUE'
    },
    session_authentication: true,
    pin_only_login: true,
    shopify_party_id: SJ_CONFIG.SHOPIFY_PARTY_ID
  };
}
