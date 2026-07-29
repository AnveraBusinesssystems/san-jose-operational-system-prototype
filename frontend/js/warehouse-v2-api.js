import { GOOGLE_SCRIPT_WEB_APP_URL } from "./config.js?v=rack-inventory2";

const TIMEOUT_MS = 20000;
const WAREHOUSE_ACTION = "warehouseV2Api";

function appsUrl() {
  if (!GOOGLE_SCRIPT_WEB_APP_URL || !GOOGLE_SCRIPT_WEB_APP_URL.includes("/exec")) {
    throw new Error("Google Apps Script is not configured.");
  }
  return GOOGLE_SCRIPT_WEB_APP_URL;
}

async function call(operation, payload = {}, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const callback = `sjopsWarehouseV2_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Warehouse request timed out."));
    }, timeoutMs);
    const url = new URL(appsUrl());
    url.searchParams.set("action", WAREHOUSE_ACTION);
    url.searchParams.set("payload", JSON.stringify({ operation, ...payload }));
    url.searchParams.set("callback", callback);

    function cleanup() {
      window.clearTimeout(timer);
      delete window[callback];
      script.remove();
    }

    window[callback] = (response) => {
      cleanup();
      if (!response?.ok) {
        const message = response?.error || "Warehouse request failed.";
        if (message.includes("Unknown action") || message.includes("Unknown warehouse operation")) {
          reject(new Error("Warehouse backend upgrade required. Redeploy the latest Apps Script code before using this workflow."));
          return;
        }
        reject(new Error(message));
        return;
      }
      resolve(response.result);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("Could not reach the warehouse backend."));
    };
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

export function newOperationId(prefix = "OP") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const getWarehouseCapabilities = () => call("getWarehouseCapabilities");
export const startReceivingSession = (user, input) => call("startReceivingSession", { user, input });
export const getReceivingSession = (receivingId) => call("getReceivingSession", { receiving_id: receivingId });
export const listOpenReceivingSessions = (user) => call("listOpenReceivingSessions", { user });
export const placeReceivingInventory = (user, input) => call("placeReceivingInventory", { user, input });
export const listProductStorage = (productId, salesOrderId = "") => call("listProductStorageSafe", { product_id: productId, sales_order_id: salesOrderId });
export const sendSalesOrderSelections = (user, input) => call("sendSalesOrderSelectionsSafe", { user, input });
export const moveInventory = (user, input) => call("moveInventory", { user, input });
export const getPackingActivity = (date = "") => call("getPackingActivity", { date });
export const recordPackingUsage = (user, input) => call("recordPackingUsage", { user, input });
export const listSalesProductAvailability = () => call("listSalesProductAvailabilityNoFifoV2");
