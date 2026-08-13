const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const moduleDir = path.join(root, 'apps-script-p2');
const files = fs.readdirSync(moduleDir).filter((file) => file.endsWith('.gs')).sort();
const source = files.map((file) => fs.readFileSync(path.join(moduleDir, file), 'utf8')).join('\n');
const read = (file) => fs.readFileSync(path.join(moduleDir, file), 'utf8');

test('Apps Script modules parse together and routed functions exist', () => {
  assert.doesNotThrow(() => new Function(source));
  const definitions = new Set([...source.matchAll(/function\s+(sj[A-Za-z0-9_]+)\s*\(/g)].map((match) => match[1]));
  const routed = [...source.matchAll(/:\s*(sj[A-Za-z0-9_]+)\s*[,}]/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(routed.filter((name) => !definitions.has(name)))], []);
});

test('shared normalization and pagination functions behave correctly', () => {
  const runtime = new Function(`${source}; return {sjNumber_, sjBoolean_, sjBalanceKey_, sjPaginate_, sjRole_};`)();
  assert.equal(runtime.sjNumber_('$1,234.50'), 1234.5);
  assert.equal(runtime.sjBoolean_('TRUE'), true);
  assert.equal(runtime.sjBalanceKey_('PROD-1', 'LOT-1', 'r03-l1-f'), 'PROD-1|LOT-1|R03-L1-F');
  assert.deepEqual(runtime.sjPaginate_([1, 2, 3, 4], {offset: 1, limit: 2}), {rows: [2, 3], total: 4, offset: 1, limit: 2, has_more: true});
  assert.equal(runtime.sjRole_('OPERATOR'), 'WAREHOUSE');
});

test('backend is split into maintainable business modules', () => {
  for (const file of ['00_Config.gs', '02_DataAccess.gs', '03_Auth.gs', '10_Catalog.gs', '20_Orders.gs', '30_Inventory_Read.gs', '31_Inventory_Write.gs', '40_WarehouseTasks.gs', '50_Metrics.gs']) {
    assert.ok(files.includes(file), `${file} is missing`);
  }
  assert.ok(files.length >= 12);
});

test('all live workbook tables are declared with exact headers', () => {
  const config = read('00_Config.gs');
  for (const table of ['USERS', 'PRODUCTS', 'PRODUCT_UNITS', 'PARTIES', 'LOCATIONS', 'ORDERS', 'ORDER_LINES', 'PAYMENTS', 'LOTS', 'INVENTORY_BALANCES', 'INVENTORY_MOVEMENTS', 'WAREHOUSE_TASKS', 'DAILY_PRODUCT_METRICS', 'AUDIT_LOG']) {
    assert.match(config, new RegExp(`\\b${table}: Object\\.freeze`));
  }
});

test('GET is read-only and mutations require POST routing', () => {
  const api = read('04_Api.gs');
  assert.match(api, /SJ_READ_ACTIONS/);
  assert.match(api, /SJ_WRITE_ACTIONS/);
  assert.match(api, /GET action is not allowed/);
  assert.match(api, /POST action is not allowed/);
  assert.doesNotMatch(api.match(/var SJ_READ_ACTIONS[\s\S]*?\}\);/)?.[0] || '', /create|update|cancel|recordPayment|moveInventory/);
});

test('writes use signed sessions, permissions, write switch, and locking', () => {
  const auth = read('03_Auth.gs');
  assert.match(auth, /computeHmacSha256Signature/);
  assert.match(auth, /SESSION_TTL_SECONDS/);
  assert.match(auth, /OPERATIONS_WRITES_ENABLED/);
  assert.match(auth, /sjRequirePermission_/);
  assert.match(auth, /\^\\d\{4\}\$/);
  assert.match(auth, /PIN must contain exactly 4 numbers/);
  assert.match(read('01_Utilities.gs'), /getScriptLock/);
});

test('inventory is idempotent, concurrency checked, and append-only', () => {
  const inventory = read('31_Inventory_Write.gs');
  assert.match(inventory, /sjOperationId_/);
  assert.match(inventory, /sjFindOperation_/);
  assert.match(inventory, /expected_source_sequence/);
  assert.match(inventory, /sjExecuteMovement_/);
  assert.doesNotMatch(source, /deleteMovement|removeMovement|deleteInventoryMovement/);
});

test('Shopify demand is included and formulas are documented by the API', () => {
  const metrics = read('50_Metrics.gs');
  assert.match(metrics, /includes_shopify: true/);
  assert.match(metrics, /0\.50×recent \+ 0\.30×mid \+ 0\.20×historical/);
  assert.match(metrics, /NORM\.S\.INV\(0\.90\)/);
  assert.match(metrics, /MAX\(reorder_point − inventory_position, 0\)/);
});

test('owner analytics stays in the read-only metrics module', () => {
  const metrics = read('50_Metrics.gs');
  assert.match(metrics, /owner_analytics: sjGetOwnerAnalytics_/);
  assert.match(metrics, /SALES_METRICS/);
  assert.match(metrics, /SHOPIFY_METRICS/);
  assert.match(metrics, /OPERATIONS_METRICS/);
  assert.match(metrics, /sales_with_cost/);
  assert.doesNotMatch(metrics, /setValue|setValues|appendRow|clearContent/);
});

test('no credential hash is returned by public record serializers', () => {
  assert.match(read('01_Utilities.gs'), /key === 'credential_hash'/);
});
