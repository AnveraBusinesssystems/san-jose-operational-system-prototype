import { render as renderLegacySalesOrders } from "./salesOrders.js?v=lotspace1";
import { escapeHtml, formatMoney, status } from "../js/utils.js?v=filters1";

const ACTIVE = new Set(["DRAFT", "CONFIRMED", "PARTIAL", "PARTIALLY_PICKED", "PICKED", "OPEN"]);

export async function render(ctx) {
  const role = String(ctx.user?.role || "OPERATOR").toUpperCase();
  await renderLegacySalesOrders(ctx);
  const root = ctx.view;
  root.classList.add("sales-orders-professional");

  if (role === "ADMIN") {
    enhanceAdminView(ctx, root);
  } else {
    enhanceWarehouseView(ctx, root);
  }
}

function enhanceAdminView(ctx, root) {
  ctx.setTitle("Sales Orders", "Customer orders, fulfillment progress, and commercial analysis");
  const builder = root.querySelector(".sales-order-builder");
  const listPanel = Array.from(root.querySelectorAll(".panel")).find((panel) => panel !== builder);
  if (!listPanel) return;

  if (builder) {
    builder.hidden = true;
    builder.classList.add("sales-order-create-panel");
  }

  const rows = getRows(listPanel);
  const summary = summarizeRows(rows);
  const header = document.createElement("section");
  header.className = "so-command-bar";
  header.innerHTML = `
    <div>
      <span class="so-eyebrow">CUSTOMER FULFILLMENT</span>
      <h2>Sales Order Center</h2>
      <p>Review the active queue, fulfillment progress, order value, and the next required action.</p>
    </div>
    <button class="btn" type="button" data-new-sales-order>New Sales Order</button>`;

  const metrics = document.createElement("section");
  metrics.className = "so-metrics";
  metrics.innerHTML = [
    metric("Active", summary.active, "Orders still in progress", "ACTIVE"),
    metric("Awaiting Pick", summary.awaiting, "Confirmed warehouse work", "CONFIRMED"),
    metric("Ready to Ship", summary.ready, "Fully picked orders", "PICKED"),
    metric("Open Value", money(summary.value), "Active customer orders", "ACTIVE"),
    metric("Avg. Margin", `${summary.margin.toFixed(1)}%`, "Based on available order data", "ALL")
  ].join("");

  const controls = document.createElement("div");
  controls.className = "so-controls";
  controls.innerHTML = `
    <div class="so-tabs" role="tablist">
      <button class="is-active" data-so-filter="ACTIVE" type="button">Active</button>
      <button data-so-filter="PICKED" type="button">Ready to Ship</button>
      <button data-so-filter="SHIPPED" type="button">Completed</button>
      <button data-so-filter="ALL" type="button">All</button>
    </div>
    <label class="so-search"><span>Search</span><input type="search" placeholder="SO number or customer" data-so-search></label>`;

  listPanel.before(header, metrics);
  listPanel.querySelector(".panel-header")?.after(controls);
  listPanel.classList.add("so-list-panel");
  addNextActionButtons(root);
  installFilters(root);

  header.querySelector("[data-new-sales-order]")?.addEventListener("click", () => {
    if (!builder) return;
    builder.hidden = !builder.hidden;
    header.querySelector("[data-new-sales-order]").textContent = builder.hidden ? "New Sales Order" : "Close Form";
    if (!builder.hidden) builder.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function enhanceWarehouseView(ctx, root) {
  ctx.setTitle("Open Sales Orders", "Review assigned customer orders and send product");
  root.querySelector(".sales-order-builder")?.remove();
  const panel = root.querySelector(".panel");
  if (!panel) return;

  removeTableColumn(panel, "Total");
  removeTableColumn(panel, "Channel");
  panel.querySelector(".panel-header")?.insertAdjacentHTML("beforeend", `
    <button class="btn" type="button" data-open-send-product>Send Product</button>`);
  panel.querySelector(".panel-header h2").textContent = "Open Customer Orders";
  const description = panel.querySelector(".panel-header .muted");
  if (description) description.textContent = "Only orders that require warehouse attention are shown. Financial information is restricted to Admin.";

  getRows(panel).forEach((row) => {
    const state = rowStatus(row);
    row.hidden = !["CONFIRMED", "PARTIAL", "PARTIALLY_PICKED", "PICKED", "OPEN"].includes(state);
  });
  addNextActionButtons(root);
  panel.querySelector("[data-open-send-product]")?.addEventListener("click", () => { window.location.hash = "sendProduct"; });
}

function addNextActionButtons(root) {
  root.querySelectorAll("tbody tr").forEach((row) => {
    const state = rowStatus(row);
    const id = row.cells?.[0]?.textContent?.trim();
    const actions = row.querySelector(".actions");
    if (!actions || !id || actions.querySelector("[data-so-next]")) return;
    if (["CONFIRMED", "PARTIAL", "PARTIALLY_PICKED", "OPEN"].includes(state)) {
      actions.insertAdjacentHTML("afterbegin", `<button class="btn" type="button" data-so-next="${escapeHtml(id)}">${state.includes("PART") ? "Continue Picking" : "Start Picking"}</button>`);
    }
  });
  root.querySelectorAll("[data-so-next]").forEach((button) => {
    button.addEventListener("click", () => { window.location.hash = `sendProduct:${button.dataset.soNext}`; });
  });
}

function installFilters(root) {
  let filter = "ACTIVE";
  let search = "";
  const apply = () => {
    root.querySelectorAll(".so-list-panel tbody tr").forEach((row) => {
      const state = rowStatus(row);
      const matchesFilter = filter === "ALL" || (filter === "ACTIVE" ? ACTIVE.has(state) : state === filter);
      const matchesSearch = !search || row.textContent.toLowerCase().includes(search);
      row.hidden = !(matchesFilter && matchesSearch);
    });
  };
  root.querySelectorAll("[data-so-filter]").forEach((button) => button.addEventListener("click", () => {
    filter = button.dataset.soFilter;
    root.querySelectorAll("[data-so-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
    apply();
  }));
  root.querySelector("[data-so-search]")?.addEventListener("input", (event) => { search = event.target.value.trim().toLowerCase(); apply(); });
  apply();
}

function removeTableColumn(panel, label) {
  const headers = Array.from(panel.querySelectorAll("thead th"));
  const index = headers.findIndex((cell) => cell.textContent.trim() === label);
  if (index < 0) return;
  headers[index].remove();
  panel.querySelectorAll("tbody tr").forEach((row) => row.cells[index]?.remove());
}

function summarizeRows(rows) {
  const result = { active: 0, awaiting: 0, ready: 0, value: 0, margin: 0, margins: 0 };
  rows.forEach((row) => {
    const state = rowStatus(row);
    if (ACTIVE.has(state)) result.active += 1;
    if (["CONFIRMED", "OPEN"].includes(state)) result.awaiting += 1;
    if (state === "PICKED") result.ready += 1;
    const totalCell = Array.from(row.cells).find((cell) => /^\$/.test(cell.textContent.trim()));
    if (ACTIVE.has(state) && totalCell) result.value += Number(totalCell.textContent.replace(/[^0-9.-]/g, "")) || 0;
  });
  return result;
}

function metric(label, value, note, filter) {
  return `<button class="so-metric" type="button" data-so-filter="${filter}"><span>${label}</span><strong>${value}</strong><small>${note}</small></button>`;
}

function getRows(panel) { return Array.from(panel.querySelectorAll("tbody tr")); }
function rowStatus(row) { return String(row.querySelector(".status")?.textContent || "").trim().toUpperCase().replace(/\s+/g, "_"); }
function money(value) { return formatMoney ? formatMoney(Number(value || 0)) : `$${Number(value || 0).toFixed(2)}`; }
