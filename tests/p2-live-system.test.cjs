const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const system = fs.readFileSync(path.join(root, 'p2-system.js'), 'utf8');
const inventory = fs.readFileSync(path.join(root, 'p2-live-inventory.js'), 'utf8');

assert.match(html, /p2-system\.css\?v=2/);
assert.match(html, /p2-system\.js\?v=2/);
assert.match(html, /p2-live-inventory\.js\?v=8/);
assert.match(html, /id="p2LoginScreen"/);
assert.match(html, /id="p2LoginForm"/);
assert.match(html, /Use your account from the USERS tab/);

for (const action of [
  'apiInfo', 'login', 'sessionInfo', 'getDashboard', 'listOrders', 'getOrder',
  'createOrder', 'updateOrder', 'cancelOrder', 'recordPayment', 'listProducts',
  'createProduct', 'updateProduct', 'listParties', 'createParty', 'updateParty',
  'getDemandMetrics', 'lookupInventory', 'listWarehouseTasks',
  'createWarehouseTask', 'updateWarehouseTask', 'schemaHealth', 'inventoryHealth',
  'getLocationInventory', 'receiveInventory', 'packingDeduct'
]) assert.ok(system.includes(`'${action}'`), `missing live action ${action}`);

for (const page of [
  'renderOverview', 'renderOrders', 'renderReceiving', 'renderShipping',
  'renderPacking', 'renderReplenishment', 'renderProducts', 'renderParties',
  'renderAnalytics', 'renderScanner', 'renderAdmin'
]) assert.ok(system.includes(page), `missing page connector ${page}`);

assert.match(system, /session_token/);
assert.match(system, /setAuthScreen/);
assert.match(inventory, /SanJoseSystem\?\.getSessionToken/);
assert.match(inventory, /openMoveEditor/);
assert.match(inventory, /'moveInventory'/);
assert.doesNotMatch(system, /INVENTORY_WRITE_TOKEN/);
console.log('P2 live system integration checks passed.');
