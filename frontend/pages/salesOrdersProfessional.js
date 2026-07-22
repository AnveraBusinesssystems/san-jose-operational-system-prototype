import { render as renderLegacySalesOrders } from "./salesOrders.js?v=delivery1";
import { getSalesOrderDetail, listSalesOrders } from "../js/api-smooth1.js?v=orders1";
import { deliveryButton, installDeliveryActions, isDeliverableStatus, replaceAdminDeliveryActions } from "../js/salesDelivery.js?v=delivery1";

export async function render(ctx) {
  await renderLegacySalesOrders(ctx);

  const role = normalizeRole(ctx.user?.role);
  ctx.view.classList.add("sales-orders-professional");
  installGroupedLotPricing(ctx.view);

  const orders = await listSalesOrders();
  installSalesOrderExplorer(ctx.view, orders || []);

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

function installSalesOrderExplorer(root, orders) {
  const table = root.querySelector("table");
  if (!table) return;

  ensureSalesOrderExplorerStyles();

  const orderMap = new Map(orders.map((order) => [String(order.sales_order_id || ""), order]));
  const firstHeader = table.tHead?.rows?.[0]?.cells?.[0];
  if (firstHeader) firstHeader.textContent = "Folio";

  const rows = Array.from(table.tBodies?.[0]?.rows || []);
  const folioOptions = [];

  rows.forEach((row) => {
    const originalCell = row.cells[0];
    const actionOrderId = row.querySelector("[data-sales-order-id]")?.dataset.salesOrderId;
    const originalOrderId = String(actionOrderId || originalCell?.textContent || "").trim();
    const order = orderMap.get(originalOrderId) || {};
    const folio = String(order.bl_folio || order.quickbooks_invoice_id || originalOrderId || "").trim();

    row.dataset.salesOrderId = originalOrderId;
    row.dataset.salesFolio = folio;

    if (originalCell) {
      originalCell.dataset.label = "Folio";
      originalCell.innerHTML = `
        <button class="sales-folio-link" type="button" data-sales-folio-filter="${escapeHtml(folio)}" title="Filter by folio ${escapeHtml(folio)}">
          ${escapeHtml(folio || originalOrderId)}
        </button>
        <small class="sales-order-id-subtext">${escapeHtml(originalOrderId)}</small>
      `;
    }

    const actionCell = row.cells[row.cells.length - 1];
    if (actionCell && !actionCell.querySelector("[data-sales-detail]")) {
      actionCell.insertAdjacentHTML(
        "afterbegin",
        `<button class="btn secondary" type="button" data-sales-detail="${escapeHtml(originalOrderId)}">View</button>`
      );
    }

    if (folio) folioOptions.push({ folio, orderId: originalOrderId });
  });

  const panel = table.closest(".panel");
  const tableWrapper = table.parentElement;
  const filterBar = document.createElement("div");
  filterBar.className = "sales-order-filter-bar";
  filterBar.innerHTML = `
    <label>
      <span>Filter by folio</span>
      <select data-sales-folio-select>
        <option value="">All folios</option>
        ${folioOptions
          .sort((a, b) => b.folio.localeCompare(a.folio, undefined, { numeric: true }))
          .map(({ folio }) => `<option value="${escapeHtml(folio)}">${escapeHtml(folio)}</option>`)
          .join("")}
      </select>
    </label>
    <button class="btn secondary" type="button" data-clear-sales-folio hidden>Clear filter</button>
    <span class="muted" data-sales-filter-result>${rows.length} orders</span>
  `;
  (tableWrapper || table).before(filterBar);

  const select = filterBar.querySelector("[data-sales-folio-select]");
  const clearButton = filterBar.querySelector("[data-clear-sales-folio]");
  const result = filterBar.querySelector("[data-sales-filter-result]");

  const applyFilter = (folio = "") => {
    const normalized = String(folio || "").trim();
    let visible = 0;
    rows.forEach((row) => {
      const matches = !normalized || row.dataset.salesFolio === normalized;
      row.hidden = !matches;
      if (matches) visible += 1;
    });
    if (select) select.value = normalized;
    if (clearButton) clearButton.hidden = !normalized;
    if (result) result.textContent = normalized ? `${visible} order for folio ${normalized}` : `${visible} orders`;
  };

  select?.addEventListener("change", () => applyFilter(select.value));
  clearButton?.addEventListener("click", () => applyFilter(""));

  table.addEventListener("click", async (event) => {
    const folioButton = event.target.closest("[data-sales-folio-filter]");
    if (folioButton) {
      const folio = folioButton.dataset.salesFolioFilter || "";
      applyFilter(select?.value === folio ? "" : folio);
      return;
    }

    const detailButton = event.target.closest("[data-sales-detail]");
    if (!detailButton) return;

    detailButton.disabled = true;
    const originalText = detailButton.textContent;
    detailButton.textContent = "Loading...";
    try {
      const detail = await getSalesOrderDetail(detailButton.dataset.salesDetail);
      showSalesOrderDetail(detail);
    } catch (error) {
      window.alert(error?.message || "Could not load the sales order.");
    } finally {
      detailButton.disabled = false;
      detailButton.textContent = originalText;
    }
  });

  if (panel) panel.dataset.salesOrderExplorer = "true";
}

function showSalesOrderDetail(detail) {
  if (!detail?.order) throw new Error("Sales Order was not found.");

  document.querySelector("[data-sales-detail-modal]")?.remove();

  const order = detail.order;
  const lines = detail.lines || [];
  const customer = order.customer?.supplier_name || order.customer_name || order.customer_id || "";
  const folio = order.bl_folio || order.quickbooks_invoice_id || order.sales_order_id || "";

  const modal = document.createElement("div");
  modal.className = "sales-detail-modal";
  modal.dataset.salesDetailModal = "true";
  modal.innerHTML = `
    <div class="sales-detail-backdrop" data-close-sales-detail></div>
    <section class="sales-detail-card" role="dialog" aria-modal="true" aria-labelledby="salesDetailTitle">
      <header class="sales-detail-header">
        <div>
          <span class="sales-detail-eyebrow">Sales Order</span>
          <h2 id="salesDetailTitle">Folio ${escapeHtml(folio)}</h2>
          <p>${escapeHtml(order.sales_order_id || "")} · ${escapeHtml(customer)}</p>
        </div>
        <button class="sales-detail-close" type="button" data-close-sales-detail aria-label="Close">×</button>
      </header>
      <div class="sales-detail-summary">
        ${detailFact("Order date", formatDate(order.order_date))}
        ${detailFact("Ship by", formatDate(order.ship_by_date))}
        ${detailFact("Status", displayValue(order.status))}
        ${detailFact("Payment terms", order.payment_terms || "—")}
        ${detailFact("Ship method", displayValue(order.ship_method))}
        ${detailFact("Total", formatMoney(order.total_amount))}
      </div>
      <div class="sales-detail-address">
        <strong>Ship to</strong>
        <span>${escapeHtml(order.shipping_address || order.customer?.address || "No address recorded")}</span>
      </div>
      <div class="sales-detail-lines-wrap">
        <table class="sales-detail-lines">
          <thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>
            ${lines.map((line) => `
              <tr>
                <td>${escapeHtml(line.product?.product_name || line.product_name || line.notes || line.product_id || "Financial line")}</td>
                <td>${formatNumber(line.qty_ordered)}</td>
                <td>${escapeHtml(line.unit_type || "")}</td>
                <td>${formatMoney(line.unit_price)}</td>
                <td>${formatMoney(line.line_total)}</td>
              </tr>
            `).join("") || '<tr><td colspan="5" class="muted">No line items found.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${order.notes ? `<div class="sales-detail-notes"><strong>Notes</strong><p>${escapeHtml(order.notes)}</p></div>` : ""}
    </section>
  `;

  const close = () => {
    modal.remove();
    document.removeEventListener("keydown", onKeydown);
  };
  const onKeydown = (event) => {
    if (event.key === "Escape") close();
  };

  modal.querySelectorAll("[data-close-sales-detail]").forEach((button) => button.addEventListener("click", close));
  document.addEventListener("keydown", onKeydown);
  document.body.appendChild(modal);
  modal.querySelector(".sales-detail-close")?.focus();
}

function detailFact(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>`;
}

function ensureSalesOrderExplorerStyles() {
  if (document.getElementById("salesOrderExplorerStyles")) return;
  const style = document.createElement("style");
  style.id = "salesOrderExplorerStyles";
  style.textContent = `
    .sales-order-filter-bar{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin:0 0 14px}
    .sales-order-filter-bar label{display:grid;gap:6px;min-width:220px;font-weight:700;color:#334155}
    .sales-order-filter-bar select{min-height:40px;border:1px solid #cbd5e1;border-radius:10px;padding:8px 12px;background:#fff}
    .sales-order-filter-bar [data-sales-filter-result]{margin-left:auto;padding-bottom:9px}
    .sales-folio-link{border:0;background:transparent;color:#176b5b;font:inherit;font-weight:800;padding:0;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
    .sales-folio-link:hover{color:#0f4f43}
    .sales-order-id-subtext{display:block;margin-top:3px;color:#94a3b8;font-size:.72rem}
    .sales-detail-modal{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:20px}
    .sales-detail-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.58);backdrop-filter:blur(3px)}
    .sales-detail-card{position:relative;width:min(980px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,.28);padding:22px}
    .sales-detail-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding-bottom:16px;border-bottom:1px solid #e2e8f0}
    .sales-detail-header h2{margin:3px 0 4px}.sales-detail-header p{margin:0;color:#64748b}
    .sales-detail-eyebrow{font-size:.75rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#418276}
    .sales-detail-close{border:0;background:#f1f5f9;border-radius:999px;width:38px;height:38px;font-size:25px;cursor:pointer}
    .sales-detail-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0}
    .sales-detail-summary div{display:grid;gap:3px;padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}
    .sales-detail-summary span{font-size:.76rem;color:#64748b}.sales-detail-summary strong{color:#0f172a}
    .sales-detail-address,.sales-detail-notes{display:grid;gap:5px;margin:14px 0;padding:13px 15px;border-radius:12px;background:#f3faf8;white-space:pre-line}
    .sales-detail-lines-wrap{overflow:auto;border:1px solid #e2e8f0;border-radius:12px}
    .sales-detail-lines{width:100%;border-collapse:collapse}.sales-detail-lines th,.sales-detail-lines td{padding:11px 12px;border-bottom:1px solid #e2e8f0;text-align:left;white-space:nowrap}
    .sales-detail-lines th{background:#f8fafc;color:#475569;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em}
    .sales-detail-lines td:first-child{white-space:normal;min-width:240px}
    @media(max-width:760px){
      .sales-order-filter-bar{align-items:stretch}.sales-order-filter-bar label{width:100%}.sales-order-filter-bar [data-sales-filter-result]{margin-left:0;padding:4px 0}
      .sales-detail-modal{padding:0}.sales-detail-card{width:100%;height:100%;max-height:none;border-radius:0;padding:16px}
      .sales-detail-summary{grid-template-columns:1fr 1fr}
    }
  `;
  document.head.appendChild(style);
}

function installGroupedLotPricing(root) {
  const form = root.querySelector("#salesOrderForm");
  const container = root.querySelector("#salesLineItems");
  if (!form || !container) return;

  ensureGroupedLotStyles();
  let applying = false;
  let observer = null;

  const regroup = () => {
    if (applying) return;
    applying = true;
    observer?.disconnect();
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
      observer?.observe(container, { childList: true, subtree: true });
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

  observer = new MutationObserver(() => window.setTimeout(regroup, 0));
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
    .sales-lot-group-summary{display:grid;gap:10px;margin-top:12px;padding:12px 14px;border:1px solid #b9d5ce;border-radius:12px;background:#f3faf8}
    .sales-lot-group-summary>div:first-child{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .sales-lot-group-summary span{color:#64748b;font-size:.82rem}
    .sales-lot-group-spaces{display:flex;gap:7px;flex-wrap:wrap}
    .sales-lot-group-spaces span{display:inline-flex;padding:5px 9px;border-radius:999px;background:#fff;border:1px solid #cbded9;color:#315e54;font-weight:700}
    @media(max-width:760px){.sales-lot-group-summary>div:first-child{align-items:flex-start;flex-direction:column}.sales-lot-group-spaces{display:grid;grid-template-columns:1fr;width:100%}.sales-lot-group-spaces span{border-radius:9px}}
  `;
  document.head.appendChild(style);
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
    const orderId = row.dataset.salesOrderId || "";
    const status = rowStatus(row);
    const viewButton = `<button class="btn secondary" type="button" data-sales-detail="${escapeHtml(orderId)}">View</button>`;

    if (!cell) return;
    if (status === "DELIVERED") {
      cell.innerHTML = `<div class="actions">${viewButton}<span class="status">Delivered ✓</span></div>`;
    } else if (role === "MANAGER" && isDeliverableStatus(status)) {
      cell.innerHTML = `<div class="actions">${viewButton}${deliveryButton(orderId)}</div>`;
    } else {
      cell.innerHTML = `<div class="actions">${viewButton}<span class="muted">Admin or Manager confirms delivery</span></div>`;
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

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

function formatMoney(value) {
  const number = Number(value || 0);
  return number.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatNumber(value) {
  const number = Number(value || 0);
  return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function displayValue(value) {
  return String(value || "—").replaceAll("_", " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
