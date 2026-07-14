import { render as renderLegacySalesOrders } from "./salesOrders.js?v=delivery1";
import { deliveryButton, installDeliveryActions, isDeliverableStatus, replaceAdminDeliveryActions } from "../js/salesDelivery.js?v=delivery1";

export async function render(ctx) {
  await renderLegacySalesOrders(ctx);

  const role = normalizeRole(ctx.user?.role);
  ctx.view.classList.add("sales-orders-professional");

  if (role === "ADMIN") {
    replaceAdminDeliveryActions(ctx.view);
    installDeliveryActions(ctx, () => render(ctx));
    ctx.setTitle(
      "Sales Orders",
      "Customer orders, fulfillment progress, and commercial analysis"
    );
    return;
  }

  ctx.setTitle(
    "Sales Orders",
    role === "MANAGER"
      ? "Review open customer orders and confirm delivery"
      : "Open customer orders and fulfillment status"
  );

  removeOrderBuilder(ctx.view);
  simplifyCustomerOrders(ctx.view, role);
  installDeliveryActions(ctx, () => render(ctx));
}

function removeOrderBuilder(root) {
  root.querySelector(".sales-order-builder")?.remove();
}

function simplifyCustomerOrders(root, role) {
  const table = root.querySelector("table");
  if (!table) return;

  removeColumn(table, "Total");
  replaceActionColumn(table, role);

  Array.from(table.tBodies[0]?.rows || []).forEach((row) => {
    const status = rowStatus(row);
    if (!["CONFIRMED", "PARTIALLY_PICKED", "PARTIAL", "PICKED", "SHIPPED", "DELIVERED"].includes(status)) {
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

function replaceActionColumn(table, role) {
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
    const status = rowStatus(row);

    if (!cell) return;
    if (status === "DELIVERED") {
      cell.innerHTML = '<span class="status">Delivered ✓</span>';
    } else if (role === "MANAGER" && isDeliverableStatus(status)) {
      cell.innerHTML = deliveryButton(orderId);
    } else {
      cell.innerHTML = '<span class="muted">Admin or Manager confirms delivery</span>';
    }
  });
}

function rowStatus(row) {
  return String(
    row.querySelector('[data-label="Status"]')?.textContent || ""
  ).trim().toUpperCase();
}

function normalizeRole(role) {
  const normalized = String(role || "OPERATOR").trim().toUpperCase();
  if (normalized === "OWNER") return "ADMIN";
  if (["WAREHOUSE", "WORKER", "WAREHOUSE WORKER", "STAFF"].includes(normalized)) {
    return "OPERATOR";
  }
  return normalized;
}
