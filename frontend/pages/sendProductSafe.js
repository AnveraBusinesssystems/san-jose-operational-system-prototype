import { render as renderLegacySendProduct } from "./sendProduct.js?v=login-repair1";

const SENDABLE_STATUSES = new Set(["CONFIRMED", "PARTIALLY_PICKED", "PARTIAL"]);

export async function render(ctx) {
  await renderLegacySendProduct(ctx);

  const form = document.getElementById("sendProductForm");
  if (!form) return;

  ensureHiddenInput(form, "internal_lot_id");
  ensureHiddenInput(form, "location_id");
  restrictOpenOrders();

  const role = normalizeRole(ctx.user?.role);
  if (role !== "ADMIN") {
    enforceSalesOrderOnly();
    ctx.setTitle(
      "Send Product",
      "Scan inventory and fulfill confirmed customer Sales Orders"
    );
  }
}

function ensureHiddenInput(form, name) {
  if (form.elements[name]) return form.elements[name];

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = "";
  form.prepend(input);
  return input;
}

function restrictOpenOrders() {
  const select = document.getElementById("salesOrderSelect");
  if (!select) return;

  Array.from(select.options).forEach((option, index) => {
    if (index === 0 || !option.value) return;
    const match = String(option.textContent || "").match(/\(([^)]+)\)\s*$/);
    const status = String(match?.[1] || "").trim().toUpperCase();
    if (!SENDABLE_STATUSES.has(status)) option.remove();
  });
}

function enforceSalesOrderOnly() {
  document.querySelectorAll(".outbound-mode-btn").forEach((button) => {
    if (button.dataset.mode !== "SO") button.remove();
  });

  document.querySelectorAll(".mode-amazon-field, .mode-quick-field").forEach((section) => {
    section.remove();
  });

  const modePicker = document.querySelector(".send-mode-picker");
  if (modePicker) modePicker.hidden = true;

  const salesOrderButton = document.querySelector('.outbound-mode-btn[data-mode="SO"]');
  salesOrderButton?.click();
}

function normalizeRole(role) {
  const normalized = String(role || "OPERATOR").trim().toUpperCase();
  if (normalized === "OWNER") return "ADMIN";
  if (["WAREHOUSE", "WORKER", "WAREHOUSE WORKER", "STAFF"].includes(normalized)) {
    return "OPERATOR";
  }
  return normalized;
}
