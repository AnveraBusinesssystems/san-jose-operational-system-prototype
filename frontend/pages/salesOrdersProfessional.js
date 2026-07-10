import { render as renderLegacySalesOrders } from "./salesOrders.js?v=login-repair1";
import { navigate } from "../js/router.js?v=login-repair1";

const SENDABLE_STATUSES = new Set(["CONFIRMED", "PARTIALLY_PICKED", "PARTIAL"]);

export async function render(ctx) {
  await renderLegacySalesOrders(ctx);

  const role = normalizeRole(ctx.user?.role);
  ctx.view.classList.add("sales-orders-professional");

  if (role === "ADMIN") {
    ctx.setTitle(
      "Sales Orders",
      "Customer orders, fulfillment progress, and commercial analysis"
    );
    return;
  }

  ctx.setTitle(
    "Sales Orders",
    "Open customer orders ready for warehouse fulfillment"
  );

  removeOrderBuilder(ctx.view);
  simplifyWarehouseTable(ctx.view);
}

function removeOrderBuilder(root) {
  root.querySelector(".sales-order-builder")?.remove();
}

function simplifyWarehouseTable(root) {
  const table = root.querySelector("table");
  if (!table) return;

  removeColumn(table, "Total");
  replaceActionColumn(table);

  Array.from(table.tBodies[0]?.rows || []).forEach((row) => {
    const status = String(
      row.querySelector('[data-label="Status"]')?.textContent || ""
    ).trim().toUpperCase();

    if (!SENDABLE_STATUSES.has(status)) {
      row.hidden = true;
    }
  });
}

function removeColumn(table, label) {
  const headers = Array.from(table.tHead?.rows[0]?.cells || []);
  const index = headers.findIndex(
    (cell) => String(cell.textContent || "").trim().toUpperCase() === label.toUpperCase()
  );
  if (index < 0) return;

  headers[index].remove();
  Array.from(table.tBodies[0]?.rows || []).forEach((row) => {
    row.cells[index]?.remove();
  });
}

function replaceActionColumn(table) {
  const headers = Array.from(table.tHead?.rows[0]?.cells || []);
  const index = headers.findIndex(
    (cell) => String(cell.textContent || "").trim().toUpperCase() === "ACTIONS"
  );
  if (index < 0) return;

  Array.from(table.tBodies[0]?.rows || []).forEach((row) => {
    const cell = row.cells[index];
    const orderId = String(
      row.querySelector('[data-label="SO"]')?.textContent || row.cells[0]?.textContent || ""
    ).trim();
    const status = String(
      row.querySelector('[data-label="Status"]')?.textContent || ""
    ).trim().toUpperCase();

    if (!cell) return;
    cell.innerHTML = SENDABLE_STATUSES.has(status)
      ? `<button class="btn" type="button" data-send-sales-order="${escapeAttribute(orderId)}">Send Product</button>`
      : '<span class="muted">Not ready</span>';
  });

  table.addEventListener("click", (event) => {
    const button = event.target.closest("[data-send-sales-order]");
    if (!button) return;
    navigate(`sendProduct:${button.dataset.sendSalesOrder}`);
  });
}

function normalizeRole(role) {
  const normalized = String(role || "OPERATOR").trim().toUpperCase();
  if (normalized === "OWNER") return "ADMIN";
  if (["WAREHOUSE", "WORKER", "WAREHOUSE WORKER", "STAFF"].includes(normalized)) {
    return "OPERATOR";
  }
  return normalized;
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
