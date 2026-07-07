import { warmOperationalCache } from "./api-smooth1.js?v=pin1";
import { getSession, signIn, signOut } from "./auth.js?v=pin1";
import { renderNavigation, renderRoute, configureRouter, navigate } from "./router.js?v=send2";
import { allowedPages } from "./permissions.js?v=send-ui1";
import { enableTableFilters } from "./utils.js?v=qa1";
import * as dashboard from "../pages/dashboard.js?v=refine1";
import * as products from "../pages/products.js?v=qa1";
import * as suppliers from "../pages/suppliers.js?v=parties1";
import * as orders from "../pages/orders.js?v=orders1";
import * as purchaseOrders from "../pages/purchaseOrders.js?v=qa1";
import * as salesOrders from "../pages/salesOrders.js?v=lotspace1";
import * as sendProduct from "../pages/sendProduct.js?v=send-ui1";
import * as receiving from "../pages/receiving.js?v=refine1";
import * as openingInventory from "../pages/openingInventory.js?v=qa1";
import * as inventory from "../pages/inventory.js?v=qa1";
import * as scanner from "../pages/scannerTest.js?v=parties1";
import * as reports from "../pages/reports.js?v=reports-ui7";
import * as admin from "../pages/admin.js?v=pin1";
import * as mobileHome from "../pages/mobileHome.js?v=send-ui1";

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
  sendProduct,
  receiving,
  openingInventory,
  inventory,
  scanner,
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
  const requested = String(page || "dashboard");
  const [pageId] = requested.split(":");
  if (pageId === "mobileHome" && !usesWarehouseHome()) {
    navigate("dashboard");
    return;
  }
  const allowed = allowedPages(user);
  const allowedIds = allowed.map((item) => item.id);
  const safePage = allowedIds.includes(pageId) ? pageId : allowed[0]?.id || "dashboard";
  if (safePage !== pageId) {
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
    sortProductSelects(view);
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

document.getElementById("menuToggle").addEventListener("click", () => {
  document.body.classList.toggle("menu-open");
});

document.getElementById("mobileHomeButton")?.addEventListener("click", () => {
  document.body.classList.remove("menu-open");
  window.location.hash = "mobileHome";
  renderRoute();
});

document.getElementById("mobileMenuSignOut")?.addEventListener("click", () => performSignOut());

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

function setLoginBusy(isBusy) {
  const form = document.getElementById("pinForm");
  form.querySelector("button").disabled = isBusy;
}

document.getElementById("pinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("pinInput");
  const error = document.getElementById("pinError");
  error.textContent = "";
  setLoginBusy(true);
  try {
    user = await signIn(input.value);
    showApp();
  } catch (err) {
    error.textContent = err.message;
  } finally {
    setLoginBusy(false);
  }
});

document.getElementById("signOutButton")?.addEventListener("click", () => performSignOut());
["click", "keydown", "mousemove", "touchstart"].forEach((eventName) => {
  window.addEventListener(eventName, resetInactivityTimer, { passive: true });
});

configureRouter(routes, renderAppRoute);
if (user) showApp();
