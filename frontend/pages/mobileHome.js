import { allowedPages } from "../js/permissions.js?v=rack-inventory1";
import { navigate } from "../js/router.js?v=send2";

const GROUPS = [
  {
    id: "overview",
    label: "Overview",
    icon: "overview",
    pages: [
      ["dashboard", "Dashboard"],
      ["reports", "Reports"]
    ]
  },
  {
    id: "orders",
    label: "Orders",
    icon: "orders",
    pages: [
      ["purchaseOrders", "Purchase Orders"],
      ["salesOrders", "Sales Orders"]
    ]
  },
  {
    id: "receiving",
    label: "Receiving",
    icon: "receiving",
    pages: [
      ["receiving", "Receive Product"]
    ]
  },
  {
    id: "inventory",
    label: "Inventory",
    icon: "inventory",
    pages: [
      ["inventory", "Rack Inventory"],
      ["scanner", "Scanner"],
      ["products", "Products"]
    ]
  },
  {
    id: "shipping",
    label: "Shipping",
    icon: "shipping",
    pages: [
      ["sendProduct", "Send Product"]
    ]
  },
  {
    id: "people",
    label: "People & Setup",
    icon: "people",
    pages: [
      ["suppliers", "Customers & Vendors"],
      ["admin", "Users & Locations"]
    ]
  }
];

export async function render(ctx) {
  const allowed = new Set(allowedPages(ctx.user).map((page) => page.id));
  const groups = GROUPS
    .map((group) => ({ ...group, pages: group.pages.filter(([id]) => allowed.has(id)) }))
    .filter((group) => group.pages.length);

  ctx.setTitle("Warehouse Home", "Choose a work area");
  ctx.view.innerHTML = `
    <section class="warehouse-home" aria-label="Warehouse home">
      <header class="warehouse-home-header">
        <div class="warehouse-home-brand">
          <img src="../logo_San_Jose.png" alt="San Jose">
          <div><span>San Jose Operations</span><strong>${escapeHtml(firstName(ctx.user.full_name))}</strong></div>
        </div>
        <button class="warehouse-sign-out" type="button" data-home-sign-out>Sign out</button>
      </header>
      <div class="warehouse-home-grid">
        ${groups.map((group) => `
          <button class="warehouse-home-tile" type="button" data-home-group="${group.id}" aria-expanded="false">
            <span class="warehouse-home-icon">${icon(group.icon)}</span>
            <strong>${group.label}</strong>
            <small>${group.pages.length} ${group.pages.length === 1 ? "action" : "actions"}</small>
          </button>
        `).join("")}
      </div>
      <section class="warehouse-action-panel" data-home-actions hidden aria-live="polite"></section>
    </section>
  `;

  const panel = ctx.view.querySelector("[data-home-actions]");
  ctx.view.querySelectorAll("[data-home-group]").forEach((button) => {
    button.addEventListener("click", () => {
      const group = groups.find((item) => item.id === button.dataset.homeGroup);
      ctx.view.querySelectorAll("[data-home-group]").forEach((item) => item.setAttribute("aria-expanded", "false"));
      button.setAttribute("aria-expanded", "true");
      panel.hidden = false;
      panel.innerHTML = `
        <div class="warehouse-action-heading">
          <span>${group.label}</span>
          <small>Choose an action</small>
        </div>
        <div class="warehouse-action-list">
          ${group.pages.map(([id, label]) => `<button type="button" data-home-route="${id}">${label}</button>`).join("")}
        </div>
      `;
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });

  panel.addEventListener("click", (event) => {
    const route = event.target.closest("[data-home-route]")?.dataset.homeRoute;
    if (route) navigate(route);
  });
  ctx.view.querySelector("[data-home-sign-out]")?.addEventListener("click", () => {
    document.getElementById("signOutButton")?.click();
  });
}

function firstName(name) {
  return String(name || "Team").trim().split(/\s+/)[0] || "Team";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function icon(name) {
  const paths = {
    overview: '<path d="M4 13h6V4H4z"></path><path d="M14 20h6V4h-6z"></path><path d="M4 20h6v-3H4z"></path>',
    orders: '<path d="M6 3h12l2 4v14H4V7z"></path><path d="M6 7h12"></path><path d="M9 11h6"></path>',
    receiving: '<path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M4 19h16"></path>',
    inventory: '<path d="M4 6h16v13H4z"></path><path d="M4 10h16"></path><path d="M9 6v13"></path>',
    shipping: '<path d="M3 7h11v9H3z"></path><path d="M14 10h4l3 3v3h-7z"></path><circle cx="7" cy="18" r="2"></circle><circle cx="17" cy="18" r="2"></circle>',
    people: '<path d="M16 11a4 4 0 1 0-8 0"></path><path d="M4 21a8 8 0 0 1 16 0"></path>'
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${paths[name]}</svg>`;
}
