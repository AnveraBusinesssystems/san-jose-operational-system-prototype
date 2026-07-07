import { createSalesOrder, inventorySnapshot, listLocations, warmOperationalCache } from "./api-smooth1.js?v=lotpick2";
import { getSession, signIn, signOut } from "./auth.js?v=pin1";
import { renderNavigation, renderRoute, configureRouter, navigate } from "./router.js?v=mobilehome1";
import { allowedPages } from "./permissions.js?v=mobilehome1";
import { enableTableFilters, enableTableSorting, formatQuantity, notice } from "./utils.js?v=buttons1";
import * as dashboard from "../pages/dashboard.js?v=refine1";
import * as products from "../pages/products.js?v=qa1";
import * as suppliers from "../pages/suppliers.js?v=parties3";
import * as orders from "../pages/orders.js?v=orders1";
import * as purchaseOrders from "../pages/purchaseOrders.js?v=qa1";
import * as salesOrders from "../pages/salesOrders.js?v=lotpick2";
import * as receiving from "../pages/receiving.js?v=refine1";
import * as openingInventory from "../pages/openingInventory.js?v=qa1";
import * as inventory from "../pages/inventory.js?v=qa1";
import * as scanner from "../pages/scannerTest.js?v=parties1";
import * as amazon from "../pages/amazon.js?v=refine1";
import * as reports from "../pages/reports.js?v=refine1";
import * as admin from "../pages/admin.js?v=pin1";
import * as mobileHome from "../pages/mobileHome.js?v=mobilehome1";

const view = document.getElementById("view");
const title = document.getElementById("pageTitle");
const subtitle = document.getElementById("pageSubtitle");
let user = getSession();
let renderToken = 0;
let inactivityTimer;
const INACTIVITY_LIMIT_MS = 5 * 60 * 1000;

const routes = {
  mobileHome,
  dashboard,
  products,
  suppliers,
  orders,
  purchaseOrders,
  salesOrders,
  receiving,
  openingInventory,
  inventory,
  scanner,
  amazon,
  reports,
  admin
};

function context() {
  return {
    user,
    view,
    setTitle(nextTitle, nextSubtitle) {
      title.textContent = nextTitle;
      subtitle.textContent = nextSubtitle;
    }
  };
}

function renderSessionIdentity() {
  document.getElementById("userAvatar").textContent = String(user.full_name || "A").trim().charAt(0).toUpperCase();
  document.getElementById("currentUserName").textContent = `${user.full_name} · ${user.role}`;
}

async function renderAppRoute(page) {
  const token = ++renderToken;
  if (page === "mobileHome" && !usesWarehouseHome()) {
    navigate("dashboard");
    return;
  }
  const allowed = allowedPages(user);
  const allowedIds = allowed.map((item) => item.id);
  const safePage = allowedIds.includes(page) ? page : allowed[0]?.id || "dashboard";
  if (safePage !== page) {
    window.location.hash = safePage;
    return;
  }

  const label = allowed.find((item) => item.id === safePage)?.label || "Page";
  document.body.classList.toggle("mobile-home-mode", safePage === "mobileHome");
  renderNavigation(user);
  title.textContent = label;
  subtitle.textContent = "Loading...";
  view.classList.add("view-loading");
  view.innerHTML = loadingScreen(label);

  try {
    await routes[safePage].render(context());
    if (token !== renderToken) return;
    enableTableFilters(view);
    enableTableSorting(view);
    sortProductSelects(view);
    if (safePage === "salesOrders") await enhanceSalesLotPicker(context());
    view.classList.remove("view-loading");
  } catch (error) {
    if (token !== renderToken) return;
    title.textContent = label;
    subtitle.textContent = "Connection issue";
    view.classList.remove("view-loading");
    view.innerHTML = `
      <section class="panel">
        <div class="panel-header"><h2>Could not load this screen</h2></div>
        <p class="muted">${error.message}</p>
        <p class="muted">If you just updated Apps Script, deploy a new Web App version and refresh this page.</p>
      </section>
    `;
  }
  renderNavigation(user);
}

function loadingScreen(label) {
  return `
    <section class="panel loading-panel">
      <div>
        <h2>${label}</h2>
        <p class="muted">Getting the latest spreadsheet data...</p>
      </div>
      <div class="loading-lines" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </section>
  `;
}

function sortProductSelects(root = document) {
  root.querySelectorAll("select[data-product-search], select[data-product-choice]").forEach((select) => {
    const selectedValue = select.value;
    const options = Array.from(select.options);
    const placeholder = options.find((option) => option.value === "") || null;
    const productOptions = options
      .filter((option) => option !== placeholder)
      .sort((a, b) => a.textContent.trim().localeCompare(b.textContent.trim(), undefined, { numeric: true, sensitivity: "base" }));
    select.replaceChildren(...[placeholder, ...productOptions].filter(Boolean));
    select.value = selectedValue;
  });
}

async function enhanceSalesLotPicker(ctx) {
  const form = view.querySelector("#salesOrderForm");
  if (!form || form.dataset.lotPickerReady) return;
  form.dataset.lotPickerReady = "1";
  const [rows, locations] = await Promise.all([inventorySnapshot(), listLocations()]);
  const choices = buildSalesPickChoices(rows, locations);
  const byKey = new Map(choices.map((choice) => [choice.key, choice]));
  const box = form.querySelector("#salesLineItems");
  enhanceSalesLines(box, choices);
  form.querySelector("#addSalesLine")?.addEventListener("click", () => setTimeout(() => enhanceSalesLines(box, choices), 0));
  box?.addEventListener("change", (event) => {
    const line = event.target.closest(".sales-line-item");
    if (!line) return;
    if (event.target.matches("[data-product-choice]")) fillSalesLots(line, choices, false);
    if (event.target.matches("[data-sales-lot-choice]")) fillSalesSpaces(line, choices, false);
    updateSalesPickPreview(line, choices);
  });
  box?.addEventListener("input", (event) => {
    const line = event.target.closest(".sales-line-item");
    if (!line) return;
    fillSalesLots(line, choices, true);
    updateSalesPickPreview(line, choices);
  });
  const button = form.querySelector('button[type="submit"]');
  if (button) {
    button.type = "button";
    button.addEventListener("click", async () => {
      try {
        const saved = await createSalesOrder(ctx.user, collectSalesPickOrder(form, byKey, choices));
        notice(`${saved.sales_order_id} created with selected supplier lot and warehouse space. Refresh to see it in the table.`);
        form.reset();
      } catch (error) {
        notice(error.message);
      }
    });
  }
}

function enhanceSalesLines(box, choices) {
  box?.querySelectorAll(".sales-line-item").forEach((line) => {
    if (line.dataset.lotPicker) return;
    line.dataset.lotPicker = "1";
    const productField = line.querySelector("[data-product-choice]")?.closest(".field");
    productField?.after(makeSalesPickField("Supplier Lot", "data-sales-lot-choice"), makeSalesPickField("Warehouse Space", "data-sales-location-choice"));
    fillSalesLots(line, choices, false);
  });
}

function makeSalesPickField(labelText, marker) {
  const wrap = document.createElement("div");
  const label = document.createElement("label");
  const select = document.createElement("select");
  wrap.className = "field";
  label.textContent = labelText;
  select.setAttribute(marker, "");
  select.required = true;
  resetSalesPickSelect(select, marker.includes("lot") ? "Choose product first" : "Choose supplier lot first");
  wrap.append(label, select);
  return wrap;
}

function fillSalesLots(line, choices, keep) {
  const productId = salesPickProduct(line);
  const lotSelect = line.querySelector("[data-sales-lot-choice]");
  if (!productId) return resetSalesPickSelect(lotSelect, "Choose product first"), resetSalesPickSelect(line.querySelector("[data-sales-location-choice]"), "Choose supplier lot first");
  const lots = salesLotOptions(productId, choices, salesPickNeed(line));
  if (!lots.length) return resetSalesPickSelect(lotSelect, "No supplier lots"), resetSalesPickSelect(line.querySelector("[data-sales-location-choice]"), "No spaces");
  const previous = keep ? lotSelect.value : "";
  const selected = lots.some((lot) => lot.id === previous) ? previous : lots[0].id;
  lotSelect.disabled = false;
  lotSelect.replaceChildren(...lots.map((lot, index) => salesPickOption(lot.id, `${index === 0 ? "[FIFO] " : ""}${lot.id} | ${formatQuantity(lot.qty)} LB | Best ${lot.best.label}`)));
  lotSelect.value = selected;
  fillSalesSpaces(line, choices, keep);
}

function fillSalesSpaces(line, choices, keep) {
  const spaces = choices.filter((choice) => choice.product === salesPickProduct(line) && choice.supplierLot === (line.querySelector("[data-sales-lot-choice]")?.value || "")).sort((a, b) => salesSpaceSort(a, b, salesPickNeed(line)));
  const spaceSelect = line.querySelector("[data-sales-location-choice]");
  if (!spaces.length) return resetSalesPickSelect(spaceSelect, "No spaces for supplier lot");
  const previous = keep ? spaceSelect.value : "";
  const selected = spaces.some((space) => space.key === previous) ? previous : spaces[0].key;
  spaceSelect.disabled = false;
  spaceSelect.replaceChildren(...spaces.map((space, index) => salesPickOption(space.key, `${index === 0 ? "[Recommended] " : ""}${space.label} | ${formatQuantity(space.qty)} LB${space.front ? " | Front" : ""}`)));
  spaceSelect.value = selected;
}

function updateSalesPickPreview(line, choices) {
  const chosen = choices.find((choice) => choice.key === (line.querySelector("[data-sales-location-choice]")?.value || ""));
  const preview = line.querySelector("[data-allocation-preview]");
  const fact = line.querySelector("[data-fefo]");
  if (!preview || !fact) return;
  if (!salesPickProduct(line)) { preview.textContent = "Choose a product to see recommended supplier lots and spaces."; fact.textContent = "Choose product"; return; }
  if (!chosen) { preview.textContent = "Choose a supplier lot and warehouse space for this product."; fact.textContent = "Choose supplier lot/space"; return; }
  const best = choices.filter((choice) => choice.product === salesPickProduct(line)).sort((a, b) => salesChoiceSort(a, b, salesPickNeed(line)))[0];
  const short = salesPickNeed(line) > chosen.qty + 0.0001;
  fact.textContent = short ? "Short space" : best?.key === chosen.key ? "FIFO/front pick" : "Manual override";
  preview.textContent = `${short ? "Selected space is short. " : ""}Selected supplier lot ${chosen.supplierLot} @ ${chosen.label}. System recommends supplier lot ${best?.supplierLot || ""} @ ${best?.label || ""}.`;
}

function collectSalesPickOrder(form, byKey, choices) {
  if (!form.elements.customer_id.value) throw new Error("Select a customer.");
  const used = new Map();
  const lines = [...form.querySelectorAll(".sales-line-item")].map((line, index) => {
    const chosen = byKey.get(line.querySelector("[data-sales-location-choice]")?.value || "");
    const qty = salesPickNumber(line, "qty_ordered");
    const weight = salesPickNumber(line, "unit_weight_lbs");
    const required = qty * weight;
    if (!salesPickProduct(line)) throw new Error(`Select a product on line ${index + 1}.`);
    if (!line.querySelector("[data-sales-lot-choice]")?.value) throw new Error(`Select a supplier lot on line ${index + 1}.`);
    if (!chosen) throw new Error(`Select a warehouse space on line ${index + 1}.`);
    const remaining = chosen.qty - (used.get(chosen.key) || 0);
    if (required > remaining + 0.0001) throw new Error(`Line ${index + 1} needs ${formatQuantity(required)} LB, but ${chosen.label} only has ${formatQuantity(remaining)} LB.`);
    used.set(chosen.key, (used.get(chosen.key) || 0) + required);
    const best = choices.filter((choice) => choice.product === salesPickProduct(line)).sort((a, b) => salesChoiceSort(a, b, required))[0];
    return { product_id: chosen.product, internal_lot_id: chosen.internalLot, location_id: chosen.location, qty_ordered: qty, unit_type: salesPickUnit(line), unit_weight_lbs: weight, unit_price: salesPickNumber(line, "unit_price"), unit_cost: Number((chosen.cost * weight).toFixed(4)), notes: best?.key === chosen.key ? `System recommended supplier lot ${chosen.supplierLot} and front-pick space.` : `Manual override. Recommended supplier lot ${best?.supplierLot || ""} @ ${best?.location || ""}.` };
  });
  return { customer_id: form.elements.customer_id.value, order_date: form.elements.order_date.value, requested_delivery_date: form.elements.requested_delivery_date.value, sales_channel: form.elements.sales_channel.value, ship_method: form.elements.ship_method.value, payment_terms: form.elements.payment_terms.value, shipping_address: form.elements.shipping_address.value.trim(), tax_enabled: form.elements.tax_enabled.checked, tax_rate_percent: Number(form.elements.tax_rate_percent.value || 6.25), notes: form.elements.notes.value, lines };
}

function buildSalesPickChoices(rows, locations) {
  const locs = new Map(locations.map((location) => [String(location.location_id || ""), location]));
  const now = salesPickDay(new Date()).getTime();
  return rows.map((row) => {
    const lot = row.lot || {};
    const item = row.product || {};
    const location = String(row.location_id || lot.current_location_id || "");
    const loc = locs.get(location) || {};
    const exp = salesPickExpires(lot, item);
    const unit = String(row.unit_type || lot.unit_type || "LB").toUpperCase();
    const pack = String(lot.purchase_unit_type || item.default_unit || unit).toUpperCase();
    const weight = salesLotWeight(lot);
    const priority = salesPriority(loc, location);
    const internalLot = String(row.internal_lot_id || lot.internal_lot_id || "");
    const supplierLot = String(lot.supplier_lot_number || row.supplier_lot_number || row.supplier_lot || lot.lot_number || internalLot || "");
    return { key: `${row.product_id}|${internalLot}|${location}`, product: row.product_id, supplierLot, internalLot, lot: supplierLot, location, label: salesLocationLabel(loc, location), qty: Number(row.available_qty ?? row.qty ?? row.current_qty ?? 0), cost: unit === pack ? Number(lot.unit_cost || 0) : Number(lot.unit_cost || 0) / weight, expSort: exp ? exp.getTime() : Number.MAX_SAFE_INTEGER, receivedSort: new Date(lot.received_date || 0).getTime(), priority, front: priority <= 2, status: String(lot.status || "ACTIVE").toUpperCase() };
  }).filter((choice) => choice.product && choice.supplierLot && choice.internalLot && choice.location && choice.qty > 0 && ["ACTIVE", "AVAILABLE", ""].includes(choice.status) && (!Number.isFinite(choice.expSort) || choice.expSort >= now));
}

function salesLotOptions(productId, choices, required) {
  const lots = new Map();
  choices.filter((choice) => choice.product === productId).forEach((choice) => {
    const lot = lots.get(choice.supplierLot) || { id: choice.supplierLot, qty: 0, expSort: choice.expSort, receivedSort: choice.receivedSort, spaces: [] };
    lot.qty += choice.qty;
    lot.spaces.push(choice);
    lots.set(choice.supplierLot, lot);
  });
  return [...lots.values()].map((lot) => ({ ...lot, best: [...lot.spaces].sort((a, b) => salesSpaceSort(a, b, required))[0] })).sort((a, b) => a.expSort - b.expSort || a.receivedSort - b.receivedSort || (a.qty >= required ? 0 : 1) - (b.qty >= required ? 0 : 1) || salesSpaceSort(a.best, b.best, required));
}

function salesChoiceSort(a, b, required) { return a.expSort - b.expSort || a.receivedSort - b.receivedSort || salesSpaceSort(a, b, required); }
function salesSpaceSort(a, b, required) { return (a.qty >= required ? 0 : 1) - (b.qty >= required ? 0 : 1) || a.priority - b.priority || b.qty - a.qty || a.location.localeCompare(b.location); }
function salesPickOption(value, text) { const item = document.createElement("option"); item.value = value; item.textContent = text; return item; }
function resetSalesPickSelect(select, text) { if (!select) return; select.disabled = true; select.replaceChildren(salesPickOption("", text)); }
function salesPickProduct(line) { return line.querySelector("[data-product-choice]")?.value || ""; }
function salesPickUnit(line) { return line.querySelector('[data-line-field="unit_type"]')?.value || "LB"; }
function salesPickNumber(line, field) { return Number(line.querySelector(`[data-line-field="${field}"]`)?.value || 0); }
function salesPickNeed(line) { return salesPickNumber(line, "qty_ordered") * salesPickNumber(line, "unit_weight_lbs"); }
function salesPickDay(value) { const date = new Date(value); return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function salesPickExpires(lot, product) { if (lot.expiration_date) return salesPickDay(lot.expiration_date); const received = lot.received_date ? salesPickDay(lot.received_date) : null; const days = Number(product.perishability_days || 0); return received && days > 0 ? new Date(received.getTime() + days * 86400000) : null; }
function salesLotWeight(lot) { const original = Number(lot.original_qty || 0); const purchased = Number(lot.purchase_qty_received || 0); return original > 0 && purchased > 0 ? original / purchased : 1; }
function salesPriority(loc, id) { const explicit = Number(loc.priority_rank || loc.pick_priority || loc.priority || 0); if (explicit > 0) return explicit; const text = `${id} ${loc.location_type || ""} ${loc.notes || ""}`.toUpperCase(); if (text.includes("FRONT") || text.includes("PICK")) return 1; if (text.includes("BACK") || text.includes("RESERVE")) return 10; return 5; }
function salesLocationLabel(loc, id) { const parts = [loc.zone, loc.aisle, loc.rack, loc.level, loc.bin].filter(Boolean); return parts.length ? `${id} (${parts.join("-")})` : id; }

document.getElementById("menuToggle").addEventListener("click", () => {
  document.body.classList.toggle("menu-open");
});

function usesWarehouseHome() {
  return window.innerWidth <= 900
    || (window.innerWidth <= 1366 && window.matchMedia("(pointer: coarse)").matches);
}

function showApp() {
  document.body.classList.remove("login-mode");
  document.getElementById("loginScreen").hidden = true;
  document.getElementById("app").hidden = false;
  renderSessionIdentity();
  renderNavigation(user);
  renderRoute();
  resetInactivityTimer();
  window.setTimeout(warmOperationalCache, 1000);
}

function resetInactivityTimer() {
  window.clearTimeout(inactivityTimer);
  if (!user) return;
  inactivityTimer = window.setTimeout(() => performSignOut("Signed out after 5 minutes of inactivity."), INACTIVITY_LIMIT_MS);
}

function performSignOut(message = "") {
  window.clearTimeout(inactivityTimer);
  signOut();
  user = null;
  document.body.classList.add("login-mode");
  document.body.classList.remove("menu-open", "mobile-home-mode");
  document.getElementById("app").hidden = true;
  document.getElementById("loginScreen").hidden = false;
  document.getElementById("pinInput").value = "";
  document.getElementById("pinError").textContent = message;
  document.getElementById("pinInput").focus();
}

["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
  document.addEventListener(eventName, resetInactivityTimer, { passive: true });
});

async function completeLogin() {
  try {
    document.getElementById("pinError").textContent = "";
    user = await signIn(document.getElementById("pinInput").value);
    if (usesWarehouseHome()) window.location.hash = "mobileHome";
    showApp();
  } catch (error) {
    document.getElementById("pinError").textContent = error.message;
    document.getElementById("pinInput").select();
  }
}
window.sjopsCompleteLogin = completeLogin;
document.getElementById("pinForm").addEventListener("submit", (event) => {
  event.preventDefault();
  completeLogin();
});
document.getElementById("signOutButton").addEventListener("click", () => performSignOut());

configureRouter(routes, renderAppRoute);
if (user) {
  if (usesWarehouseHome() && !window.location.hash) window.location.hash = "mobileHome";
  showApp();
}
else {
  document.body.classList.add("login-mode");
  document.getElementById("pinInput").focus();
}
