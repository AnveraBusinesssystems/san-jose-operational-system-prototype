import * as base from "./api.js?v=pin1";
import { GOOGLE_SCRIPT_WEB_APP_URL } from "./config.js?v=opening1";

const READ_CACHE_TTL_MS = 45000;
const readCache = new Map();
const pendingReads = new Map();
const USES_APPS_SCRIPT = Boolean(GOOGLE_SCRIPT_WEB_APP_URL && GOOGLE_SCRIPT_WEB_APP_URL.includes("/exec"));
const LEGACY_SENT_STATUSES = new Set(["MARKSENT", "MARK_SENT"]);

export const purchaseOrderQrValue = base.purchaseOrderQrValue;
export const resetToSpreadsheetSeed = base.resetToSpreadsheetSeed;

export function warmOperationalCache() {
  [
    () => getDashboard(),
    () => listProducts(),
    () => listSuppliers(),
    () => listPurchaseOrders(),
    () => listSalesOrders(),
    () => inventorySnapshot()
  ].forEach((load, index) => {
    window.setTimeout(() => load().catch(() => {}), index * 350);
  });
}

export function clearApiCache() {
  readCache.clear();
  pendingReads.clear();
}

export const getDashboard = () => cachedRead("getDashboard", [], base.getDashboard);
export const authenticateUser = (pin) => base.authenticateUser(pin);
export const listProducts = async () => [...await cachedRead("listProducts", [], base.listProducts)]
  .sort((a, b) => String(a.product_name || "").localeCompare(String(b.product_name || ""), undefined, { sensitivity: "base" }));
export const listLots = () => cachedRead("listLots", [], base.listLots);
export const listUsers = () => cachedRead("listUsers", [], base.listUsers);
export const listSuppliers = () => cachedRead("listSuppliers", [], base.listSuppliers);
export const listLocations = () => cachedRead("listLocations", [], base.listLocations);
export const listPurchaseOrders = async () => (await cachedRead("listPurchaseOrders", [], base.listPurchaseOrders))
  .map(normalizePurchaseOrderStatus);
export const listSalesOrders = () => cachedRead("listSalesOrders", [], base.listSalesOrders);
export const inventorySnapshot = () => cachedRead("inventorySnapshot", [], base.inventorySnapshot);
export const getOperationalReports = () => cachedRead("getOperationalReports", [], base.getOperationalReports);
export const getPurchaseOrderDetail = (poId) => cachedRead("getPurchaseOrderDetail", [poId], () => base.getPurchaseOrderDetail(poId));
export const getSalesOrderDetail = (salesOrderId) => cachedRead("getSalesOrderDetail", [salesOrderId], () => base.getSalesOrderDetail(salesOrderId));
export const listAmazonOutboundActivity = () => cachedRead("listAmazonOutboundActivity", [], base.listAmazonOutboundActivity);

export async function createProduct(user, input) {
  return mutate(() => base.createProduct(user, input));
}
export async function createOpeningInventory(user, input) { return mutate(() => base.createOpeningInventory(user, input)); }

export async function createUser(user, input) {
  return mutate(() => base.createUser(user, input));
}

export async function deactivateUser(user, userId) {
  return mutate(() => base.deactivateUser(user, userId));
}

export async function updateProductStatus(user, productId, isActive) {
  return mutate(() => base.updateProductStatus(user, productId, isActive));
}

export async function createSupplier(user, input) {
  return mutate(() => base.createSupplier(user, input));
}

export async function createPurchaseOrder(user, input) {
  return mutate(() => base.createPurchaseOrder(user, input));
}

export async function purchaseOrderAction(user, poId, action) {
  const backendAction = normalizePurchaseOrderAction(action);
  return mutate(() => base.purchaseOrderAction(user, poId, backendAction));
}

export async function createSalesOrder(user, input) {
  return mutate(() => base.createSalesOrder(user, input));
}

export async function salesOrderAction(user, salesOrderId, action) {
  return mutate(() => base.salesOrderAction(user, salesOrderId, action));
}

export async function receiveProduct(user, input) {
  return mutate(() => base.receiveProduct(user, input));
}

export async function recordInventoryMovement(user, input) {
  return mutate(() => base.recordInventoryMovement(user, input));
}

export async function recordAmazonOutbound(user, input) {
  return mutate(() => base.recordAmazonOutbound(user, input));
}

export async function lookupScan(scanValue) {
  return base.lookupScan(scanValue);
}

export async function matchAmazonPackageScan(scanValue) {
  return mutate(() => base.matchAmazonPackageScan(scanValue));
}

async function cachedRead(name, args, load) {
  const key = `${name}:${JSON.stringify(args)}`;
  const cached = readCache.get(key);
  if (cached && Date.now() - cached.savedAt < READ_CACHE_TTL_MS) {
    return cached.value;
  }
  if (pendingReads.has(key)) {
    return pendingReads.get(key);
  }

  const request = load()
    .then((value) => {
      readCache.set(key, { savedAt: Date.now(), value });
      pendingReads.delete(key);
      return value;
    })
    .catch((error) => {
      pendingReads.delete(key);
      throw error;
    });
  pendingReads.set(key, request);
  return request;
}

async function mutate(load) {
  const result = await load();
  clearApiCache();
  return result;
}

function normalizePurchaseOrderAction(action) {
  const token = String(action || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (USES_APPS_SCRIPT && token === "MARKSENT") return "SENT";
  return action;
}

function normalizePurchaseOrderStatus(purchaseOrder) {
  const status = String(purchaseOrder?.po_status || "").trim().toUpperCase();
  if (!LEGACY_SENT_STATUSES.has(status)) return purchaseOrder;
  return { ...purchaseOrder, po_status: "SENT", legacy_po_status: status };
}
