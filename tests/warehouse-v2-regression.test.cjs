const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadAppsScript() {
  const directory = path.join(process.cwd(), "apps-script");
  const source = fs.readdirSync(directory)
    .filter((name) => name.endsWith(".gs"))
    .sort()
    .map((name) => fs.readFileSync(path.join(directory, name), "utf8"))
    .join("\n");
  const context = vm.createContext({
    console,
    Utilities: { getUuid: () => "test-uuid" }
  });
  vm.runInContext(source, context, { filename: "apps-script-combined.js" });
  return context;
}

function evaluate(context, expression) {
  return vm.runInContext(expression, context);
}

test("transaction and lot weights beat incomplete Product defaults", () => {
  const context = loadAppsScript();
  assert.equal(evaluate(context, "resolvePurchaseUnitWeight_({case_weight_lbs: 55}, {case_weight_lbs: 25})"), 55);
  assert.equal(evaluate(context, "resolvePurchaseUnitWeight_({case_weight_lbs: 0, units_per_purchase_unit: 41.89}, {case_weight_lbs: 25})"), 41.89);
  assert.equal(evaluate(context, "lotUnitWeightV2_({original_qty: 1100, purchase_qty_received: 20, purchase_unit_type: 'BAG'})"), 55);
  [55, 25, 22, 44, 41.89, 4.4].forEach((weight) => {
    context.weightUnderTest = weight;
    assert.equal(evaluate(context, "lotUnitWeightV2_({original_qty: weightUnderTest * 10, purchase_qty_received: 10})"), weight);
  });
});

test("Floor and Packing ignore stale occupancy status but preserve real blocks", () => {
  const context = loadAppsScript();
  context.locationUnderTest = { location_id: "FLOOR-1", location_type: "FLOOR_STORAGE", current_status: "UNAVAILABLE", is_active: true };
  assert.equal(evaluate(context, "locationHardBlockReason_(locationUnderTest)"), "");
  context.locationUnderTest.current_status = "MAINTENANCE";
  assert.equal(evaluate(context, "locationHardBlockReason_(locationUnderTest)"), "LOCATION_MAINTENANCE");
  context.locationUnderTest = { location_id: "R01-L1-F", location_type: "PALLET_RACK", current_status: "UNAVAILABLE", is_active: true };
  assert.equal(evaluate(context, "locationHardBlockReason_(locationUnderTest)"), "LOCATION_UNAVAILABLE");
});

test("special-location synchronization keeps MULTI while an empty rack becomes AVAILABLE", () => {
  const context = loadAppsScript();
  context.tables = {
    LOCATIONS: [
      { location_id: "PACKING", location_type: "PACKING_AREA", current_status: "UNAVAILABLE", is_active: true },
      { location_id: "R01-L1-F", location_type: "PALLET_RACK", current_status: "UNAVAILABLE", is_active: true }
    ],
    LOTS: []
  };
  evaluate(context, `
    readTable_ = function (name) { return tables[name] || []; };
    updateTableRecord_ = function (name, idColumn, idValue, fields) {
      const row = tables[name].find(function (item) { return String(item[idColumn]) === String(idValue); });
      Object.assign(row, fields);
      return row;
    };
  `);
  assert.equal(evaluate(context, "syncLocationInventoryStatus_('PACKING')"), "MULTI");
  assert.equal(context.tables.LOCATIONS[0].current_status, "MULTI");
  assert.equal(evaluate(context, "syncLocationInventoryStatus_('R01-L1-F')"), "AVAILABLE");
  assert.equal(context.tables.LOCATIONS[1].current_status, "AVAILABLE");
});

test("a complete sales retry returns the prior result before stale inventory validation", () => {
  const context = loadAppsScript();
  context.tables = {
    INVENTORY_MOVEMENTS: [{ operation_id: "SENDBATCH-1", movement_id: "MOV-1", movement_type: "SALE" }]
  };
  evaluate(context, `
    readTable_ = function (name) { return tables[name] || []; };
    withScriptLock_ = function (operation) { return operation(); };
    getSalesOrderDetail = function (input) { return { order: { sales_order_id: input.sales_order_id, status: 'PICKED' }, lines: [] }; };
    validateWarehouseSalesReservationsV2_ = function () { throw new Error('retry should not revalidate stale lots'); };
  `);
  const result = evaluate(context, `sendSalesOrderSelectionsSafe({
    input: {
      sales_order_id: 'SO-1',
      operation_id: 'SENDBATCH',
      selections: [{ operation_id: 'SENDBATCH-1', internal_lot_id: 'EMPTY-LOT', base_qty: 100 }]
    }
  })`);
  assert.equal(result.duplicate_request, true);
  assert.equal(result.movements.length, 1);
  assert.equal(result.salesOrder.order.status, "PICKED");
});
