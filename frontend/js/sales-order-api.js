import * as base from "./api.js?v=pin1";
import { GOOGLE_SCRIPT_WEB_APP_URL } from "./config.js?v=opening1";

const USES_APPS_SCRIPT = Boolean(GOOGLE_SCRIPT_WEB_APP_URL && GOOGLE_SCRIPT_WEB_APP_URL.includes("/exec"));
const SALES_ORDER_WRITE_TIMEOUT_MS = 60000;

export async function createSalesOrderReliable(user, input) {
  if (!USES_APPS_SCRIPT) return base.createSalesOrder(user, input);
  return callAppsScriptWrite("createSalesOrder", { user, input }, SALES_ORDER_WRITE_TIMEOUT_MS);
}

function callAppsScriptWrite(action, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const callback = `sjopsSalesWrite_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try { delete window[callback]; } catch (_error) {}
      script.remove();
    };

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Sales Order creation is taking longer than expected. Check the Sales Orders list before submitting again."));
    }, timeoutMs);

    window[callback] = (data) => {
      cleanup();
      if (!data?.ok) {
        reject(new Error(data?.error || "Apps Script could not create the Sales Order."));
        return;
      }
      resolve(data.result);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Could not reach Apps Script while creating the Sales Order."));
    };

    const url = new URL(GOOGLE_SCRIPT_WEB_APP_URL);
    url.searchParams.set("action", action);
    url.searchParams.set("payload", JSON.stringify(payload || {}));
    url.searchParams.set("callback", callback);
    url.searchParams.set("_", Date.now());
    script.src = url.toString();
    document.body.appendChild(script);
  });
}
