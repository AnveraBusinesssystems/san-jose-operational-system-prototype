import { allowedPages } from "./permissions.js?v=nav-orders2";

let currentPage = "dashboard";
let routes = {};
let onRoute;
let ordersExpanded = false;

export function configureRouter(routeMap, routeCallback) {
  routes = routeMap;
  onRoute = routeCallback;
  window.addEventListener("hashchange", renderRoute);
}

export function currentRoute() {
  return currentPage;
}

export function navigate(page) {
  const nextHash = `#${page}`;
  if (window.location.hash === nextHash) {
    renderRoute();
    return;
  }
  window.location.hash = page;
}

export function renderNavigation(user) {
  const nav = document.getElementById("nav");
  const pages = allowedPages(user);
  const visiblePages = pages.filter((page) => !page.hidden);
  const pageIds = new Set(pages.map((page) => page.id));
  const orderChildren = [
    pageIds.has("purchaseOrders") ? { id: "purchaseOrders", label: "Purchase Orders" } : null,
    pageIds.has("salesOrders") ? { id: "salesOrders", label: "Sales Orders" } : null
  ].filter(Boolean);

  if (["orders", "purchaseOrders", "salesOrders"].includes(currentPage)) ordersExpanded = true;

  nav.innerHTML = visiblePages.map((page) => {
    if (page.id !== "orders") {
      return navigationButton(page.id, page.label, isActiveNavigationPage(page.id));
    }

    return `
      <div class="nav-group ${ordersExpanded ? "open" : ""}" data-nav-group="orders">
        <button type="button" class="nav-parent ${isActiveNavigationPage("orders") ? "active" : ""}" data-nav-toggle="orders" aria-expanded="${ordersExpanded}">
          <span>Orders</span><span class="nav-caret" aria-hidden="true">›</span>
        </button>
        <div class="nav-submenu" ${ordersExpanded ? "" : "hidden"}>
          ${orderChildren.map((child) => navigationButton(child.id, child.label, currentPage === child.id, "nav-child")).join("")}
        </div>
      </div>
    `;
  }).join("");

  nav.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      document.body.classList.remove("menu-open");
      navigate(button.dataset.route);
    });
  });

  nav.querySelector("[data-nav-toggle='orders']")?.addEventListener("click", () => {
    ordersExpanded = !ordersExpanded;
    renderNavigation(user);
  });
}

function navigationButton(id, label, active, extraClass = "") {
  return `
    <button type="button" data-route="${id}" class="${extraClass} ${active ? "active" : ""}">
      ${label}
    </button>
  `;
}

function isActiveNavigationPage(pageId) {
  return pageId === currentPage
    || (pageId === "orders" && ["purchaseOrders", "salesOrders"].includes(currentPage));
}

export async function renderRoute() {
  const requestedRoute = window.location.hash.replace("#", "") || "dashboard";
  const pageId = requestedRoute.split(":")[0];
  currentPage = routes[pageId] ? pageId : "dashboard";
  await onRoute(requestedRoute);
}
