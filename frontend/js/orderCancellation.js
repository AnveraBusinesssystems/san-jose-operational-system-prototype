import { clearApiCache, getPurchaseOrderDetail, getSalesOrderDetail } from "./api-smooth1.js?v=order-cancel1";
import { GOOGLE_SCRIPT_WEB_APP_URL } from "./config.js?v=rack-inventory2";
import { escapeHtml, notice } from "./utils.js?v=login-repair1";

const SALES_REMOVABLE = new Set(["DRAFT", "CONFIRMED"]);
const PURCHASE_REMOVABLE = new Set(["DRAFT", "SENT", "ORDERED", "IN_TRANSIT", "OPEN"]);

let observer;

function currentUser() {
  try {
    return JSON.parse(localStorage.getItem("sjops.session") || "null");
  } catch (_error) {
    return null;
  }
}

function currentPage() {
  return String(window.location.hash || "").replace(/^#/, "").split(":")[0];
}

function arm() {
  observer?.disconnect();
  const view = document.getElementById("view");
  if (!view) return;

  observer = new MutationObserver(() => install(view));
  observer.observe(view, { childList: true, subtree: true });
  install(view);
}

function install(view) {
  const user = currentUser();
  if (!user?.authenticated || String(user.role || "").toUpperCase() !== "ADMIN") return;

  const page = currentPage();
  if (page === "salesOrders") installSalesButtons(view, user);
  if (page === "purchaseOrders") installPurchaseButtons(view, user);
}

function installSalesButtons(view, user) {
  view.querySelectorAll("tbody tr").forEach((row) => {
    const orderId = text(row.querySelector('[data-label="SO"]')) || text(row.cells?.[0]);
    const status = text(row.querySelector('[data-label="Status"]')).toUpperCase();
    const actions = row.querySelector('[data-label="Actions"]') || row.cells?.[row.cells.length - 1];

    if (status === "CANCELLED") {
      row.hidden = true;
      return;
    }
    if (!orderId || !actions || !SALES_REMOVABLE.has(status) || actions.querySelector("[data-remove-sales-order]")) return;

    actions.insertAdjacentHTML(
      "beforeend",
      `<button class="btn secondary" data-remove-sales-order="${escapeHtml(orderId)}" type="button">Remove</button>`
    );
  });

  view.querySelectorAll("[data-remove-sales-order]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => removeSalesOrder(button, user));
  });
}

function installPurchaseButtons(view, user) {
  view.querySelectorAll("tbody tr").forEach((row) => {
    const poId = text(row.querySelector('[data-label="PO"]')) || text(row.cells?.[0]);
    const status = text(row.querySelector('[data-label="Status"]')).toUpperCase();
    const actions = row.querySelector('[data-label="Actions"]') || row.cells?.[row.cells.length - 1];

    if (status === "CANCELLED") {
      row.hidden = true;
      return;
    }
    if (!poId || !actions || !PURCHASE_REMOVABLE.has(status) || actions.querySelector("[data-remove-purchase-order]")) return;

    actions.insertAdjacentHTML(
      "beforeend",
      `<button class="btn secondary" data-remove-purchase-order="${escapeHtml(poId)}" type="button">Remove</button>`
    );
  });

  view.querySelectorAll("[data-remove-purchase-order]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => removePurchaseOrder(button, user));
  });
}

async function removeSalesOrder(button, user) {
  const salesOrderId = button.dataset.removeSalesOrder;
  try {
    button.disabled = true;
    const detail = await getSalesOrderDetail(salesOrderId);
    if (!detail?.order) throw new Error("Sales Order was not found.");

    const status = String(detail.order.status || "DRAFT").toUpperCase();
    if (!SALES_REMOVABLE.has(status)) {
      throw new Error(`This Sales Order cannot be removed in ${status} status.`);
    }

    const picked = (detail.lines || []).some((line) => Number(line.qty_picked || 0) > 0);
    if (picked) throw new Error("This Sales Order cannot be removed because picking has already started.");

    if (!window.confirm(`Remove ${salesOrderId} from open Sales Orders? It will be kept as CANCELLED for audit history.`)) return;

    await jsonp("salesOrderAction", { user, salesOrderId, action: "CANCEL" });
    clearApiCache();
    notice(`${salesOrderId} removed from open Sales Orders.`);
    refreshPage();
  } catch (error) {
    notice(error.message);
  } finally {
    button.disabled = false;
  }
}

async function removePurchaseOrder(button, user) {
  const poId = button.dataset.removePurchaseOrder;
  try {
    button.disabled = true;
    const detail = await getPurchaseOrderDetail(poId);
    if (!detail?.po) throw new Error("Purchase Order was not found.");

    const status = String(detail.po.po_status || "DRAFT").toUpperCase();
    if (!PURCHASE_REMOVABLE.has(status)) {
      throw new Error(`This Purchase Order cannot be removed in ${status} status.`);
    }

    const received = (detail.lines || []).some((line) => Number(line.qty_received_total || 0) > 0);
    if (received) throw new Error("This Purchase Order cannot be removed because receiving has already started.");

    if (!window.confirm(`Remove ${poId} from open Purchase Orders? It will be kept as CANCELLED for audit history.`)) return;

    await jsonp("purchaseOrderAction", { user, poId, action: "CANCEL" });
    clearApiCache();
    notice(`${poId} removed from open Purchase Orders.`);
    refreshPage();
  } catch (error) {
    notice(error.message);
  } finally {
    button.disabled = false;
  }
}

function refreshPage() {
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  window.setTimeout(arm, 200);
}

function jsonp(action, payload) {
  if (!GOOGLE_SCRIPT_WEB_APP_URL?.includes("/exec")) {
    return Promise.reject(new Error("Order removal requires the deployed Apps Script."));
  }

  return new Promise((resolve, reject) => {
    const callback = `sjopsOrderCancel_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const cleanup = () => {
      window.clearTimeout(timer);
      delete window[callback];
      script.remove();
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Apps Script request timed out."));
    }, 15000);

    window[callback] = (data) => {
      cleanup();
      data?.ok ? resolve(data.result) : reject(new Error(data?.error || "Could not remove order."));
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("Could not reach Apps Script."));
    };

    const url = new URL(GOOGLE_SCRIPT_WEB_APP_URL);
    url.searchParams.set("action", action);
    url.searchParams.set("payload", JSON.stringify(payload));
    url.searchParams.set("callback", callback);
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function text(element) {
  return String(element?.textContent || "").trim();
}

window.addEventListener("hashchange", () => window.setTimeout(arm, 50));
window.addEventListener("DOMContentLoaded", arm);
arm();
