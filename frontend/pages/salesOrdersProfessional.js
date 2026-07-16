import { render as renderLegacySalesOrders } from "./salesOrders.js?v=delivery1";
import { deliveryButton, installDeliveryActions, isDeliverableStatus, replaceAdminDeliveryActions } from "../js/salesDelivery.js?v=delivery1";

export async function render(ctx) {
  await renderLegacySalesOrders(ctx);

  const role = normalizeRole(ctx.user?.role);
  ctx.view.classList.add("sales-orders-professional");
  installGroupedLotPricing(ctx.view);

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

function installGroupedLotPricing(root) {
  const form = root.querySelector("#salesOrderForm");
  const container = root.querySelector("#salesLineItems");
  if (!form || !container) return;

  ensureGroupedLotStyles();
  let applying = false;

  const regroup = () => {
    if (applying) return;
    applying = true;
    try {
      const cards = Array.from(container.querySelectorAll(".sales-line-item"));
      cards.forEach((card) => {
        card.classList.remove("sales-lot-group-primary", "sales-lot-group-duplicate");
        card.hidden = false;
        card.querySelector("[data-lot-group-summary]")?.remove();
      });

      const groups = new Map();
      cards.forEach((card, index) => {
        const productId = card.querySelector("[data-product-choice]")?.value || "";
        const lotKey = card.querySelector("[data-supplier-lot-choice]")?.value || "";
        const key = productId && lotKey ? `${productId}|||${lotKey}` : `ungrouped-${index}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(card);
      });

      groups.forEach((group) => {
        const primary = group[0];
        if (!primary) return;

        primary.classList.add("sales-lot-group-primary");
        const priceInputs = group
          .map((card) => card.querySelector('[data-line-field="unit_price"]'))
          .filter(Boolean);
        const primaryPrice = priceInputs[0];

        group.slice(1).forEach((card) => {
          card.classList.add("sales-lot-group-duplicate");
          card.hidden = true;
          const duplicatePrice = card.querySelector('[data-line-field="unit_price"]');
          if (duplicatePrice && primaryPrice) duplicatePrice.value = primaryPrice.value;
        });

        if (group.length > 1) {
          const spaces = group
            .map((card) => {
              const select = card.querySelector("[data-location-choice]");
              return select?.selectedOptions?.[0]?.textContent?.split("|")[0]?.trim()
                || select?.value
                || "Recommended space";
            })
            .filter(Boolean);

          const summary = document.createElement("div");
          summary.dataset.lotGroupSummary = "true";
          summary.className = "sales-lot-group-summary";
          summary.innerHTML = `
            <div>
              <strong>One price for this product and lot</strong>
              <span>${group.length} warehouse space${group.length === 1 ? "" : "s"} in the pick plan</span>
            </div>
            <div class="sales-lot-group-spaces">
              ${Array.from(new Set(spaces)).map((space) => `<span>${escapeHtml(space)}</span>`).join("")}
            </div>
          `;
          primary.querySelector(".sales-allocation-preview")?.before(summary);
        }
      });
    } finally {
      applying = false;
    }
  };

  form.addEventListener("input", (event) => {
    const price = event.target.closest('[data-line-field="unit_price"]');
    if (!price) return;
    const card = price.closest(".sales-line-item");
    if (!card || card.hidden) return;

    const productId = card.querySelector("[data-product-choice]")?.value || "";
    const lotKey = card.querySelector("[data-supplier-lot-choice]")?.value || "";
    if (!productId || !lotKey) return;

    Array.from(container.querySelectorAll(".sales-line-item")).forEach((other) => {
      if (other === card) return;
      const sameProduct = other.querySelector("[data-product-choice]")?.value === productId;
      const sameLot = other.querySelector("[data-supplier-lot-choice]")?.value === lotKey;
      if (!sameProduct || !sameLot) return;
      const otherPrice = other.querySelector('[data-line-field="unit_price"]');
      if (otherPrice) otherPrice.value = price.value;
    });
  }, true);

  form.addEventListener("change", () => queueMicrotask(regroup));
  form.addEventListener("click", () => window.setTimeout(regroup, 0));

  const observer = new MutationObserver(() => window.setTimeout(regroup, 0));
  observer.observe(container, { childList: true, subtree: true });

  regroup();
}

function ensureGroupedLotStyles() {
  if (document.getElementById("salesLotGroupedStyles")) return;
  const style = document.createElement("style");
  style.id = "salesLotGroupedStyles";
  style.textContent = `
    .sales-lot-group-duplicate{display:none!important}
    .sales-lot-group-primary{border-color:#78a89d}
    .sales-lot-group-summary{
      display:grid;
      gap:10px;
      margin-top:12px;
      padding:12px 14px;
      border:1px solid #b9d5ce;
      border-radius:12px;
      background:#f3faf8
    }
    .sales-lot-group-summary>div:first-child{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      flex-wrap:wrap
    }
    .sales-lot-group-summary span{color:#64748b;font-size:.82rem}
    .sales-lot-group-spaces{display:flex;gap:7px;flex-wrap:wrap}
    .sales-lot-group-spaces span{
      display:inline-flex;
      padding:5px 9px;
      border-radius:999px;
      background:#fff;
      border:1px solid #cbded9;
      color:#315e54;
      font-weight:700
    }
    @media(max-width:760px){
      .sales-lot-group-summary>div:first-child{align-items:flex-start;flex-direction:column}
      .sales-lot-group-spaces{display:grid;grid-template-columns:1fr;width:100%}
      .sales-lot-group-spaces span{border-radius:9px}
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
