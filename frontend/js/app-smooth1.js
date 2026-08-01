import { warmOperationalCache } from "./api-smooth1.js?v=data-audit1";
import { getSession, signIn, signOut } from "./auth.js?v=rack-inventory1";
import { renderNavigation, renderRoute, configureRouter, navigate } from "./router.js?v=rack-inventory1";
import { allowedPages } from "./permissions.js?v=warehouse-v2";
import { enableTableFilters, enableTableSorting } from "./utils.js?v=readiness2";
import * as dashboard from "../pages/dashboard.js?v=readiness1";
import * as products from "../pages/products.js?v=products-modern2";
import * as suppliers from "../pages/suppliers.js?v=parties-modern2";
import * as orders from "../pages/orders.js?v=login-repair1";
import * as purchaseOrders from "../pages/purchaseOrders.js?v=data-audit1";
import * as salesOrders from "../pages/salesOrdersClean.js?v=readiness2";
import * as receiving from "../pages/receiving.js?v=warehouse-v2";
import * as inventory from "../pages/inventory.js?v=data-audit1";
import * as packing from "../pages/packing.js?v=warehouse-v2";
import * as scanner from "../pages/scannerTest.js?v=login-repair1";
import * as amazon from "../pages/amazon.js?v=login-repair1";
import * as reports from "../pages/reports.js?v=data-audit1";
import * as admin from "../pages/admin.js?v=readiness1";
import * as mobileHome from "../pages/mobileHome.js?v=warehouse-v2";
import * as sendProduct from "../pages/sendProductSafe.js?v=warehouse-v2";

const view = document.getElementById("view");
const title = document.getElementById("pageTitle");
const subtitle = document.getElementById("pageSubtitle");
const pinForm = document.getElementById("pinForm");
const pinInput = document.getElementById("pinInput");
const pinError = document.getElementById("pinError");
const loginButton = pinForm?.querySelector('button[type="submit"]');

let user = getSession();
let renderToken = 0;
let inactivityTimer;
const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;

const routes = {
  mobileHome,
  dashboard,
  products,
  suppliers,
  orders,
  purchaseOrders,
  salesOrders,
  sendProduct,
  receiving,
  inventory,
  packing,
  scanner,
  amazon,
  reports,
  admin
};

function context(routeToken) {
  const staleView = document.createElement("section");
  const routeUser = user;
  return {
    user: routeUser,
    get view() {
      return routeToken === renderToken ? view : staleView;
    },
    isCurrent() {
      return routeToken === renderToken;
    },
    setTitle(nextTitle, nextSubtitle) {
      if (routeToken !== renderToken) return;
      title.textContent = nextTitle;
      subtitle.textContent = nextSubtitle;
    }
  };
}

function renderSessionIdentity() {
  const name = user?.full_name || user?.user_id || "User";
  document.getElementById("userAvatar").textContent = String(name).trim().charAt(0).toUpperCase();
  document.getElementById("currentUserName").textContent = `${name} · ${user?.role || "OPERATOR"}`;
}

async function renderAppRoute(requestedRoute) {
  const token = ++renderToken;
  const requestedPage = String(requestedRoute || "dashboard").split(":")[0];
  const allowed = allowedPages(user);
  const allowedIds = allowed.map((item) => item.id);
  const fallback = defaultPageForUser(allowedIds);
  const safePage = allowedIds.includes(requestedPage) ? requestedPage : fallback;

  if (safePage !== requestedPage) {
    window.location.hash = safePage;
    return;
  }

  const pageModule = routes[safePage];
  if (!pageModule?.render) {
    window.location.hash = fallback;
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
    await pageModule.render(context(token));
    if (token !== renderToken) return;
    enableTableFilters(view);
    enableTableSorting(view);
    sortProductSelects(view);
    enhanceFormAccessibility(view);
    view.classList.remove("view-loading");
  } catch (error) {
    if (token !== renderToken) return;
    title.textContent = label;
    subtitle.textContent = "Unable to load current data";
    view.classList.remove("view-loading");
    view.innerHTML = `
      <section class="panel route-error" role="alert">
        <div class="panel-header"><h2>This screen could not load</h2></div>
        <p class="muted">${escapeHtml(error?.message || String(error))}</p>
        <p class="muted">Check the connection, then try loading this screen again.</p>
        <div class="route-error-actions"><button class="btn" id="retryRoute" type="button">Try again</button></div>
      </section>
    `;
    view.querySelector("#retryRoute")?.addEventListener("click", renderRoute);
  }

  renderNavigation(user);
}

function loadingScreen(label) {
  return `
    <section class="panel loading-panel" role="status" aria-live="polite" aria-busy="true">
      <div>
        <h2>${escapeHtml(label)}</h2>
        <p class="muted">Loading current operational data...</p>
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
      .sort((a, b) => a.textContent.trim().localeCompare(
        b.textContent.trim(),
        undefined,
        { numeric: true, sensitivity: "base" }
      ));

    select.replaceChildren(...[placeholder, ...productOptions].filter(Boolean));
    select.value = selectedValue;
  });
}

function enhanceFormAccessibility(root = document) {
  root.querySelectorAll("input, select, textarea").forEach((control) => {
    if (control.type === "hidden"
      || control.labels?.length
      || control.hasAttribute("aria-label")
      || control.hasAttribute("aria-labelledby")) return;

    const field = control.closest(".field, .order-table-field, .sales-filter-field, .packing-inline-field");
    const visibleLabel = field?.querySelector("label, :scope > span");
    const labelText = visibleLabel?.textContent?.trim()
      || control.getAttribute("placeholder")?.trim()
      || String(control.name || control.id || "Field").replaceAll("_", " ");
    control.setAttribute("aria-label", labelText);
  });
}

function defaultPageForUser(allowedIds = allowedPages(user).map((item) => item.id)) {
  if (prefersWarehouseHome() && allowedIds.includes("mobileHome")) return "mobileHome";
  if (allowedIds.includes("dashboard")) return "dashboard";
  return allowedIds[0] || "mobileHome";
}

function prefersWarehouseHome() {
  const role = String(user?.role || "OPERATOR").trim().toUpperCase();
  return role !== "ADMIN"
    || window.innerWidth <= 900
    || (window.innerWidth <= 1366 && window.matchMedia("(pointer: coarse)").matches);
}

function showApp() {
  document.body.classList.remove("login-mode");
  document.getElementById("loginScreen").hidden = true;
  document.getElementById("app").hidden = false;
  renderSessionIdentity();
  renderNavigation(user);

  const allowedIds = allowedPages(user).map((item) => item.id);
  const currentPage = String(window.location.hash || "").replace(/^#/, "").split(":")[0];
  if (!allowedIds.includes(currentPage)) {
    window.location.hash = defaultPageForUser(allowedIds);
  } else {
    renderRoute();
  }

  resetInactivityTimer();
  window.setTimeout(warmOperationalCache, 1000);
}

function resetInactivityTimer() {
  window.clearTimeout(inactivityTimer);
  if (!user) return;
  inactivityTimer = window.setTimeout(
    () => performSignOut("Signed out after 30 minutes of inactivity."),
    INACTIVITY_LIMIT_MS
  );
}

function performSignOut(message = "") {
  window.clearTimeout(inactivityTimer);
  signOut();
  user = null;
  document.body.classList.add("login-mode");
  document.body.classList.remove("menu-open", "mobile-home-mode");
  document.getElementById("app").hidden = true;
  document.getElementById("loginScreen").hidden = false;
  pinInput.value = "";
  pinError.textContent = message;
  setLoginBusy(false);
  pinInput.focus();
}

function setLoginBusy(isBusy) {
  if (!loginButton) return;
  loginButton.disabled = isBusy;
  loginButton.textContent = isBusy ? "Checking code..." : "Unlock workspace";
  pinForm?.setAttribute("aria-busy", isBusy ? "true" : "false");
}

async function completeLogin() {
  const pin = String(pinInput.value || "").trim();
  if (!/^\d{4}$/.test(pin)) {
    pinError.textContent = "Enter a valid 4-digit user code.";
    pinInput.select();
    return;
  }

  setLoginBusy(true);
  pinError.textContent = "";

  try {
    user = await signIn(pin);
    const allowedIds = allowedPages(user).map((item) => item.id);
    window.location.hash = defaultPageForUser(allowedIds);
    showApp();
  } catch (error) {
    pinError.textContent = error?.message || "Could not sign in.";
    pinInput.select();
  } finally {
    setLoginBusy(false);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.getElementById("menuToggle")?.addEventListener("click", () => {
  document.body.classList.toggle("menu-open");
});

document.getElementById("mobileHomeButton")?.addEventListener("click", () => {
  navigate(defaultPageForUser());
});

document.getElementById("mobileMenuSignOut")?.addEventListener("click", () => {
  performSignOut();
});

document.getElementById("signOutButton")?.addEventListener("click", () => {
  performSignOut();
});

["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
  document.addEventListener(eventName, resetInactivityTimer, { passive: true });
});

window.sjopsCompleteLogin = completeLogin;
pinForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  completeLogin();
});

configureRouter(routes, renderAppRoute);

if (user) {
  showApp();
} else {
  document.body.classList.add("login-mode");
  pinInput?.focus();
}
