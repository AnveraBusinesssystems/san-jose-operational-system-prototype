import { inventorySnapshot } from "./api-smooth1.js?v=orders1";

let inventoryRows = [];
let loadPromise = null;

function loadInventory() {
  if (!loadPromise) {
    loadPromise = inventorySnapshot()
      .then((rows) => {
        inventoryRows = Array.isArray(rows) ? rows : [];
        return inventoryRows;
      })
      .catch(() => {
        inventoryRows = [];
        return inventoryRows;
      });
  }
  return loadPromise;
}

function availableQty(row) {
  return Number(row.available_qty ?? row.qty ?? row.current_qty ?? 0) || 0;
}

function rowLot(row) {
  return row.lot || {};
}

function productIdForLine(line) {
  return line.querySelector("[data-product-choice]")?.value || line.dataset.productId || "";
}

function choiceKey(row) {
  const productId = String(row.product_id || "");
  const lotId = String(row.internal_lot_id || "");
  const locationId = String(row.location_id || "");
  return `${productId}|${lotId}|${locationId}`;
}

function supplierLotKey(row) {
  const lot = rowLot(row);
  const productId = String(row.product_id || "");
  const lotId = String(row.internal_lot_id || "");
  const displayLot = String(lot.supplier_lot_number || row.supplier_lot_number || lotId || "UNKNOWN LOT").trim();
  return `${productId}|${displayLot}`;
}

function refreshSpaces(line, preserveCurrent = true) {
  const select = line.querySelector("[data-location-choice]");
  const productId = productIdForLine(line);
  if (!select || !productId) return;

  const current = preserveCurrent ? select.value : "";
  const rows = inventoryRows
    .filter((row) => String(row.product_id || "") === productId)
    .filter((row) => availableQty(row) > 0)
    .filter((row) => {
      const status = String(rowLot(row).status || "ACTIVE").toUpperCase();
      return status === "ACTIVE" || status === "AVAILABLE";
    })
    .sort((a, b) => String(a.location_id || "").localeCompare(String(b.location_id || ""), undefined, { numeric: true }));

  if (!rows.length) {
    select.disabled = true;
    select.innerHTML = '<option value="">No spaces available</option>';
    return;
  }

  select.disabled = false;
  select.innerHTML = rows.map((row) => {
    const lot = rowLot(row);
    const lotId = String(row.internal_lot_id || "");
    const supplierLot = String(lot.supplier_lot_number || row.supplier_lot_number || lotId || "Unknown lot");
    const locationId = String(row.location_id || "Unknown space");
    const qty = availableQty(row).toLocaleString(undefined, { maximumFractionDigits: 2 });
    return `<option value="${choiceKey(row)}" data-supplier-lot-key="${supplierLotKey(row)}">${locationId} | ${supplierLot} | ${lotId} | ${qty} LB</option>`;
  }).join("");

  const stillValid = rows.some((row) => choiceKey(row) === current);
  if (stillValid) select.value = current;
}

function syncLotToSpace(line) {
  const spaceSelect = line.querySelector("[data-location-choice]");
  const lotSelect = line.querySelector("[data-supplier-lot-choice]");
  const selected = spaceSelect?.selectedOptions?.[0];
  const lotKey = selected?.dataset?.supplierLotKey || "";
  if (!lotSelect || !lotKey) return;

  const exists = Array.from(lotSelect.options).some((option) => option.value === lotKey);
  if (exists && lotSelect.value !== lotKey) lotSelect.value = lotKey;
}

function upgradeSalesOrderView(root = document) {
  root.querySelectorAll(".sales-line-item").forEach((line) => refreshSpaces(line));
}

document.addEventListener("change", async (event) => {
  const line = event.target.closest?.(".sales-line-item");
  if (!line) return;

  if (event.target.matches("[data-product-choice], [data-supplier-lot-choice]")) {
    await loadInventory();
    setTimeout(() => refreshSpaces(line, false), 0);
  }

  if (event.target.matches("[data-location-choice]")) {
    syncLotToSpace(line);
  }
}, true);

const observer = new MutationObserver(async () => {
  if (!document.querySelector(".sales-order-builder")) return;
  await loadInventory();
  upgradeSalesOrderView(document);
});

window.addEventListener("DOMContentLoaded", async () => {
  observer.observe(document.body, { childList: true, subtree: true });
  await loadInventory();
  upgradeSalesOrderView(document);
});
