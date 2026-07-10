import { render as renderLegacySendProduct } from "./sendProduct.js?v=send-ui1";

export async function render(ctx) {
  await renderLegacySendProduct(ctx);

  const form = document.getElementById("sendProductForm");
  if (!form) return;

  ensureHiddenInput(form, "internal_lot_id");
  ensureHiddenInput(form, "location_id");
  restrictOpenOrders();

  const role = String(ctx.user?.role || "OPERATOR").toUpperCase();