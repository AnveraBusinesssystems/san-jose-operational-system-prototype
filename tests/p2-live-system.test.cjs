const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const system = fs.readFileSync(path.join(root, 'p2-system.js'), 'utf8');
const inventory = fs.readFileSync(path.join(root, 'p2-live-inventory.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'p2-config.js'), 'utf8');
const ownerAnalyticsCss = fs.readFileSync(path.join(root, 'p2-owner-analytics.css'), 'utf8');

assert.match(html, /p2-system\.css\?v=5/);
assert.match(html, /p2-system\.js\?v=11/);
assert.match(html, /p2\.js\?v=4/);
assert.match(html, /p2-live-inventory\.js\?v=10/);
assert.match(html, /p2-owner-analytics\.css\?v=4/);
assert.match(html, /p2-config\.js\?v=11/);
assert.match(config, /AKfycbwV-78yi9qOG-59HsDXye0Fy-6i47DNem2qQu5gBjygb7t6CGnKoqYATI6NrkXijqE0jw/);
assert.doesNotMatch(html, /p2-owner-analytics\.js/);
assert.match(html, /id="p2LoginScreen"/);
assert.match(html, /id="p2LoginForm"/);
assert.match(html, /Enter your team PIN/);
assert.doesNotMatch(html, /name="user_id"/);
assert.match(system, /Print bill/);
assert.match(system, /QR lot labels/);
assert.match(system, /PURCHASE_LOT/);
assert.match(system, /purchaseReference/);

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
assert.doesNotMatch(inventory, /showToast/);
assert.doesNotMatch(system, /INVENTORY_WRITE_TOKEN/);
assert.match(system, /owner_analytics/);
assert.match(system, /Products Losing Money/);
assert.match(system, /Shopify/);
assert.match(system, /Inventory Decisions/);
assert.match(system, /sales_with_cost/);
assert.match(system, /Price List Builder/);
assert.match(system, /logo_San_Jose\.png/);
assert.match(system, /Categoría/);
assert.match(system, /Precio Total/);
assert.match(system, /Precio x Libra/);
assert.match(system, /size:A4 portrait/);
assert.match(ownerAnalyticsCss, /border-bottom:3px solid #e87524/);
assert.match(ownerAnalyticsCss, /\.price-builder\{[^}]*border-radius:0/);
assert.match(system, /data-price-default-margin/);
assert.match(system, /data-price-weight/);
assert.match(system, /data-price-margin/);
assert.match(system, /printPriceList/);
assert.match(system, /owner\.price_list/);
assert.match(system, /function loadAllOrders/);
assert.match(system, /data-order-filter-form/);
assert.match(system, /total Sheet orders/);
assert.match(system, />View<\/button>/);
assert.match(system, /scan\.elements\.namedItem\('query'\)/);
assert.match(html, /pattern="\[0-9\]\{4\}"/);
assert.match(system, /Enter your 4-digit PIN/);
console.log('P2 live system integration checks passed.');
