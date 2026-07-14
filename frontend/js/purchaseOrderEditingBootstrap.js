import { installPurchaseOrderEditing } from "./purchaseOrderEditing.js?v=po-edit1";

let observer;

function currentUser() {
  try {
    return JSON.parse(localStorage.getItem("sjops.session") || "null");
  } catch (_error) {
    return null;
  }
}

function arm() {
  observer?.disconnect();
  const view = document.getElementById("view");
  if (!view) return;
  observer = new MutationObserver(() => {
    const user = currentUser();
    const isPurchaseOrders = String(window.location.hash || "").replace(/^#/, "").split(":")[0] === "purchaseOrders";
    const hasTable = Boolean(view.querySelector("tbody tr"));
    if (!user?.authenticated || !isPurchaseOrders || !hasTable) return;
    observer.disconnect();
    installPurchaseOrderEditing({ user, view }, async () => {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      window.setTimeout(arm, 250);
    });
  });
  observer.observe(view, { childList: true, subtree: true });
}

window.addEventListener("hashchange", () => window.setTimeout(arm, 50));
window.addEventListener("DOMContentLoaded", arm);
arm();
