// WarehouseApiV2.gs
// Single Apps Script route entrypoint for the warehouse-v2 frontend.
// Code.gs only needs to expose `warehouseV2Api` in its routes map.

function warehouseV2Api(payload) {
  payload = payload || {};
  const operation = String(payload.operation || "").trim();
  const routes = {
    getWarehouseCapabilities,
    startReceivingSession,
    getReceivingSession,
    listOpenReceivingSessions,
    placeReceivingInventory,
    listProductStorageSafe,
    sendSalesOrderSelectionsSafe,
    moveInventory,
    getPackingActivity,
    recordPackingUsage
  };
  if (!routes[operation]) throw new Error("Unknown warehouse operation: " + operation);
  const forwarded = { ...payload };
  delete forwarded.operation;
  return routes[operation](forwarded);
}
