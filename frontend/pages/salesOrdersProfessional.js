import { render as renderLegacySalesOrders } from "./salesOrders.js?v=lotspace1";
import { escapeHtml, formatMoney } from "../js/utils.js?v=filters1";

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

  if (