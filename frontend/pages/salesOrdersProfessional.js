import { render as renderLegacySalesOrders } from "./salesOrders.js?v=delivery1";
import { getSalesOrderDetail, listSalesOrders } from "../js/api-smooth1.js?v=orders1";
import { deliveryButton, installDeliveryActions, isDeliverableStatus, replaceAdminDeliveryActions } from "../js/salesDelivery.js?v=delivery1";

export async function render(ctx) {
  await renderLegacySalesOrders(ctx);

  const role = normalizeRole(ctx.user?.role);
  ctx.view.classList.add("sales-orders-professional");
  installGroupedLotPricing(ctx.view);

  if (role === "ADMIN") {
    replaceAdminDeliveryActions(ctx.view);
    ctx.setTitle("Sales Orders", "Customer orders, fulfillment progress, and commercial analysis");
  } else {
    ctx.setTitle(
      "Sales Orders",
      role === "MANAGER"
        ? "Review open customer orders and confirm delivery"
        : "Open customer orders and fulfillment status"
    );
    removeOrderBuilder(ctx.view);
    simplifyCustomerOrders(ctx.view, role);
  }

  const orders = await listSalesOrders();
  installSalesOrderExplorer(ctx.view, orders || []);
  installDeliveryActions(ctx, () => render(ctx));
}

function installSalesOrderExplorer(root, orders) {
  const table = root.querySelector("table");
  if (!table) return;

  ensureSalesOrderExplorerStyles();

  const orderMap = new Map(orders.map((order) => [String(order.sales_order_id || ""), order]));
  const headers = Array.from(table.tHead?.rows?.[0]?.cells || []);
  const indexes = {
    order: 0,
    date: findHeaderIndex(headers, "Date"),
    customer: findHeaderIndex(headers, "Customer"),
    products: findHeaderIndex(headers, "Products"),
    total: findHeaderIndex(headers, "Total"),
    status: findHeaderIndex(headers, "Status"),
    actions: findHeaderIndex(headers, "Actions")
  };

  if (headers[indexes.order]) headers[indexes.order].textContent = "Folio";
  if (headers[indexes.products]) removeColumnByIndex(table, indexes.products);

  const refreshedHeaders = Array.from(table.tHead?.rows?.[0]?.cells || []);
  indexes.total = findHeaderIndex(refreshedHeaders, "Total");
  indexes.status = findHeaderIndex(refreshedHeaders, "Status");
  indexes.actions = findHeaderIndex(refreshedHeaders, "Actions");

  const rows = Array.from(table.tBodies?.[0]?.rows || []);
  const customers = new Set();
  const statuses = new Set();
  const folios = new Set();

  rows.forEach((row) => {
    const actionOrderId = row.querySelector("[data-sales-order-id]")?.dataset.salesOrderId;
    const originalOrderId = String(actionOrderId || row.cells[0]?.textContent || "").trim();
    const order = orderMap.get(originalOrderId) || {};
    const folio = String(order.bl_folio || order.quickbooks_invoice_id || originalOrderId).trim();
    const customer = String(order.customer?.supplier_name || order.customer_name || order.customer_id || cellText(row, "Customer")).trim();
    const status = String(order.status || cellText(row, "Status")).trim().toUpperCase();
    const date = normalizedDate(order.order_date || cellText(row, "Date"));

    row.dataset.salesOrderId = originalOrderId;
    row.dataset.salesFolio = folio;
    row.dataset.salesCustomer = customer;
    row.dataset.salesStatus = status;
    row.dataset.salesDate = date;

    const folioCell = row.cells[0];
    if (folioCell) {
      folioCell.dataset.label = "Folio";
      folioCell.innerHTML = `<button class="sales-folio-link" type="button" data-sales-folio-filter="${escapeHtml(folio)}">${escapeHtml(folio)}</button>`;
    }

    const actionCell = indexes.actions >= 0 ? row.cells[indexes.actions] : row.cells[row.cells.length - 1];
    if (actionCell) {
      const existingActions = actionCell.innerHTML;
      actionCell.innerHTML = `
        <div class="sales-row-actions">
          <button class="sales-view-link" type="button" data-sales-detail="${escapeHtml(originalOrderId)}">View/Edit</button>
          <div class="sales-existing-actions">${existingActions}</div>
        </div>
      `;
    }

    if (customer) customers.add(customer);
    if (status) statuses.add(status);
    if (folio) folios.add(folio);
  });

  const filterBar = document.createElement("div");
  filterBar.className = "sales-order-filter-bar";
  filterBar.innerHTML = `
    ${filterSelect("Status", "sales-status-filter", "All statuses", Array.from(statuses).sort(), displayValue)}
    <label class="sales-filter-field"><span>Date from</span><input type="date" data-sales-date-from></label>
    <label class="sales-filter-field"><span>Date to</span><input type="date" data-sales-date-to></label>
    ${filterSelect("Customer", "sales-customer-filter", "All customers", Array.from(customers).sort())}
    ${filterSelect("Folio", "sales-folio-filter", "All folios", Array.from(folios).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })))}
    <button class="sales-clear-filters" type="button" data-clear-sales-filters>Clear</button>
    <span class="sales-filter-count" data-sales-filter-count></span>
  `;

  const tableContainer = table.parentElement;
  (tableContainer || table).before(filterBar);

  const controls = {
    status: filterBar.querySelector("[data-sales-status-filter]"),
    dateFrom: filterBar.querySelector("[data-sales-date-from]"),
    dateTo: filterBar.querySelector("[data-sales-date-to]"),
    customer: filterBar.querySelector("[data-sales-customer-filter]"),
    folio: filterBar.querySelector("[data-sales-folio-filter]"),
    count: filterBar.querySelector("[data-sales-filter-count]")
  };

  const applyFilters = () => {
    let visible = 0;
    rows.forEach((row) => {
      const matchesStatus = !controls.status.value || row.dataset.salesStatus === controls.status.value;
      const matchesCustomer = !controls.customer.value || row.dataset.salesCustomer === controls.customer.value;
      const matchesFolio = !controls.folio.value || row.dataset.salesFolio === controls.folio.value;
      const matchesFrom = !controls.dateFrom.value || row.dataset.salesDate >= controls.dateFrom.value;
      const matchesTo = !controls.dateTo.value || row.dataset.salesDate <= controls.dateTo.value;
      const show = matchesStatus && matchesCustomer && matchesFolio && matchesFrom && matchesTo;
      row.hidden = !show;
      if (show) visible += 1;
    });
    controls.count.textContent = `${visible} of ${rows.length}`;
  };

  filterBar.querySelectorAll("select,input").forEach((control) => control.addEventListener("change", applyFilters));
  filterBar.querySelector("[data-clear-sales-filters]")?.addEventListener("click", () => {
    filterBar.querySelectorAll("select,input").forEach((control) => { control.value = ""; });
    applyFilters();
  });

  table.addEventListener("click", async (event) => {
    const folioButton = event.target.closest("[data-sales-folio-filter]");
    if (folioButton) {
      controls.folio.value = folioButton.dataset.salesFolioFilter || "";
      applyFilters();
      return;
    }

    const detailButton = event.target.closest("[data-sales-detail]");
    if (!detailButton) return;

    detailButton.disabled = true;
    const originalText = detailButton.textContent;
    detailButton.textContent = "Loading...";
    try {
      showSalesOrderDetail(await getSalesOrderDetail(detailButton.dataset.salesDetail));
    } catch (error) {
      window.alert(error?.message || "Could not load the sales order.");
    } finally {
      detailButton.disabled = false;
      detailButton.textContent = originalText;
    }
  });

  applyFilters();
}

function showSalesOrderDetail(detail) {
  if (!detail?.order) throw new Error("Sales Order was not found.");
  document.querySelector("[data-sales-detail-modal]")?.remove();

  const order = detail.order;
  const lines = detail.lines || [];
  const folio = order.bl_folio || order.quickbooks_invoice_id || order.sales_order_id || "";
  const customer = order.customer?.supplier_name || order.customer_name || order.customer_id || "";

  const modal = document.createElement("div");
  modal.className = "sales-detail-modal";
  modal.dataset.salesDetailModal = "true";
  modal.innerHTML = `
    <div class="sales-detail-backdrop" data-close-sales-detail></div>
    <section class="sales-detail-card" role="dialog" aria-modal="true" aria-labelledby="salesDetailTitle">
      <header class="sales-detail-header">
        <div>
          <span>Sales Order</span>
          <h2 id="salesDetailTitle">Folio ${escapeHtml(folio)}</h2>
          <p>${escapeHtml(customer)} · ${escapeHtml(order.sales_order_id || "")}</p>
        </div>
        <button class="sales-detail-close" type="button" data-close-sales-detail aria-label="Close">×</button>
      </header>

      <div class="sales-detail-summary">
        ${detailFact("Order date", formatDate(order.order_date))}
        ${detailFact("Ship by", formatDate(order.ship_by_date || order.requested_delivery_date))}
        ${detailFact("Status", displayValue(order.status))}
        ${detailFact("Payment terms", order.payment_terms || "—")}
        ${detailFact("Ship method", displayValue(order.ship_method))}
        ${detailFact("Total", formatMoney(order.total_amount))}
      </div>

      <section class="sales-detail-section">
        <h3>Customer and shipping</h3>
        <p><strong>${escapeHtml(customer)}</strong></p>
        <p>${escapeHtml(order.shipping_address || order.customer?.address || "No address recorded")}</p>
      </section>

      <section class="sales-detail-section">
        <h3>Products and charges</h3>
        <div class="sales-detail-lines-wrap">
          <table class="sales-detail-lines">
            <thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th>Price</th><th>Total</th></tr></thead>
            <tbody>
              ${lines.map((line) => `
                <tr>
                  <td>${escapeHtml(line.product?.product_name || line.product_name || financialLineName(line) || line.product_id || "Line item")}</td>
                  <td>${formatNumber(line.qty_ordered)}</td>
                  <td>${escapeHtml(line.unit_type || "")}</td>
                  <td>${formatMoney(line.unit_price)}</td>
                  <td>${formatMoney(line.line_total)}</td>
                </tr>
              `).join("") || '<tr><td colspan="5">No line items found.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

      ${order.notes ? `<section class="sales-detail-section"><h3>Notes</h3><p>${escapeHtml(order.notes)}</p></section>` : ""}
    </section>
  `;

  const close = () => {
    modal.remove();
    document.removeEventListener("keydown", onKeydown);
  };
  const onKeydown = (event) => { if (event.key === "Escape") close(); };
  modal.querySelectorAll("[data-close-sales-detail]").forEach((element) => element.addEventListener("click", close));
  document.addEventListener("keydown", onKeydown);
  document.body.appendChild(modal);
  modal.querySelector(".sales-detail-close")?.focus();
}

function financialLineName(line) {
  const notes = String(line.notes || "");
  if (notes.includes("FREIGHT")) return "Freight";
  if (notes.includes("FEES")) return "Fees";
  return "";
}

function filterSelect(label, attribute, placeholder, values, formatter = (value) => value) {
  return `
    <label class="sales-filter-field">
      <span>${escapeHtml(label)}</span>
      <select data-${attribute}>
        <option value="">${escapeHtml(placeholder)}</option>
        ${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(formatter(value))}</option>`).join("")}
      </select>
    </label>
  `;
}

function findHeaderIndex(headers, label) {
  return headers.findIndex((cell) => String(cell.textContent || "").trim().toUpperCase() === label.toUpperCase());
}

function removeColumnByIndex(table, index) {
  if (index < 0) return;
  table.tHead?.rows?.[0]?.cells?.[index]?.remove();
  Array.from(table.tBodies?.[0]?.rows || []).forEach((row) => row.cells[index]?.remove());
}

function cellText(row, label) {
  return String(row.querySelector(`[data-label="${label}"]`)?.textContent || "").trim();
}

function normalizedDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function detailFact(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>`;
}

function ensureSalesOrderExplorerStyles() {
  if (document.getElementById("salesOrderExplorerStyles")) return;
  const style = document.createElement("style");
  style.id = "salesOrderExplorerStyles";
  style.textContent = `
    .sales-orders-professional table{border-collapse:collapse;background:#fff}
    .sales-orders-professional thead th{background:#fff;border-bottom:2px solid #dfe3e8;color:#394149;font-size:.75rem;letter-spacing:.035em;text-transform:uppercase;padding:12px 10px}
    .sales-orders-professional tbody td{border-bottom:1px solid #e5e7eb;padding:13px 10px;vertical-align:middle}
    .sales-orders-professional tbody tr:hover{background:#f8fbfa}
    .sales-order-filter-bar{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin:4px 0 14px;padding:0 0 14px;border-bottom:1px solid #e5e7eb}
    .sales-filter-field{display:grid;gap:5px;min-width:145px}
    .sales-filter-field span{font-size:.76rem;color:#5f6b76;font-weight:700}
    .sales-filter-field select,.sales-filter-field input{height:38px;border:1px solid #b8c0c8;border-radius:4px;background:#fff;padding:0 10px;color:#20252a;font:inherit}
    .sales-filter-field select:focus,.sales-filter-field input:focus{outline:2px solid rgba(35,131,111,.18);border-color:#23836f}
    .sales-clear-filters{height:38px;border:1px solid #aeb7bf;background:#fff;border-radius:4px;padding:0 14px;color:#176b5b;font-weight:700;cursor:pointer}
    .sales-filter-count{margin-left:auto;padding-bottom:10px;color:#66717c;font-size:.82rem}
    .sales-folio-link,.sales-view-link{border:0;background:transparent;padding:0;color:#176b8f;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}
    .sales-folio-link:hover,.sales-view-link:hover{text-decoration:underline}
    .sales-row-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;white-space:nowrap}
    .sales-existing-actions{display:flex;align-items:center;gap:7px}
    .sales-existing-actions:empty{display:none}
    .sales-detail-modal{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px}
    .sales-detail-backdrop{position:absolute;inset:0;background:rgba(25,31,36,.48)}
    .sales-detail-card{position:relative;width:min(960px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:8px;box-shadow:0 18px 55px rgba(0,0,0,.22);padding:24px}
    .sales-detail-header{display:flex;justify-content:space-between;gap:20px;padding-bottom:18px;border-bottom:1px solid #dfe3e8}
    .sales-detail-header span{font-size:.75rem;color:#68737d;text-transform:uppercase;font-weight:700;letter-spacing:.05em}
    .sales-detail-header h2{margin:4px 0}.sales-detail-header p{margin:0;color:#68737d}
    .sales-detail-close{border:0;background:transparent;font-size:28px;line-height:1;cursor:pointer;color:#4d5963}
    .sales-detail-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin:18px 0;border:1px solid #dfe3e8;border-radius:6px;overflow:hidden}
    .sales-detail-summary div{display:grid;gap:4px;padding:12px 14px;border-right:1px solid #dfe3e8;border-bottom:1px solid #dfe3e8}
    .sales-detail-summary span{font-size:.74rem;color:#68737d}.sales-detail-summary strong{font-size:.94rem}
    .sales-detail-section{margin-top:20px}.sales-detail-section h3{margin:0 0 10px;font-size:1rem}.sales-detail-section p{margin:5px 0;white-space:pre-line;color:#3f4850}
    .sales-detail-lines-wrap{overflow:auto;border-top:1px solid #dfe3e8}
    .sales-detail-lines{width:100%;border-collapse:collapse}.sales-detail-lines th,.sales-detail-lines td{padding:11px 9px;border-bottom:1px solid #e5e7eb;text-align:left;white-space:nowrap}
    .sales-detail-lines th{font-size:.74rem;color:#5f6973;text-transform:uppercase}.sales-detail-lines td:first-child{white-space:normal;min-width:240px}
    @media(max-width:900px){.sales-filter-count{margin-left:0;width:100%;padding:0}.sales-detail-summary{grid-template-columns:1fr 1fr}}
    @media(max-width:650px){.sales-filter-field{width:100%}.sales-detail-modal{padding:0}.sales-detail-card{width:100%;height:100%;max-height:none;border-radius:0;padding:16px}.sales-detail-summary{grid-template-columns:1fr}.sales-row-actions{justify-content:flex-start;flex-wrap:wrap}}
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
        const priceInputs = group.map((card) => card.querySelector('[data-line-field="unit_price"]')).filter(Boolean);
        const primaryPrice = priceInputs[0];
        group.slice(1).forEach((card) => {
          card.classList.add("sales-lot-group-duplicate");
          card.hidden = true;
          const duplicatePrice = card.querySelector('[data-line-field="unit_price"]');
          if (duplicatePrice && primaryPrice) duplicatePrice.value = primaryPrice.value;
        });
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
      if (other.querySelector("[data-product-choice]")?.value !== productId) return;
      if (other.querySelector("[data-supplier-lot-choice]")?.value !== lotKey) return;
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
  style.textContent = `.sales-lot-group-duplicate{display:none!important}.sales-lot-group-primary{border-color:#78a89d}`;
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
    if (!["CONFIRMED", "PARTIALLY_PICKED", "PARTIAL", "PICKED", "SHIPPED", "DELIVERED"].includes(status)) row.hidden = true;
  });
}

function removeColumn(table, label) {
  const headers = Array.from(table.tHead?.rows[0]?.cells || []);
  removeColumnByIndex(table, findHeaderIndex(headers, label));
}

function replaceActionColumn(table, role) {
  const headers = Array.from(table.tHead?.rows[0]?.cells || []);
  const index = findHeaderIndex(headers, "Actions");
  if (index < 0) return;
  Array.from(table.tBodies[0]?.rows || []).forEach((row) => {
    const cell = row.cells[index];
    const orderId = String(row.querySelector('[data-label="SO"]')?.textContent || row.cells[0]?.textContent || "").trim();
    const status = rowStatus(row);
    if (!cell) return;
    if (status === "DELIVERED") cell.innerHTML = '<span class="status">Delivered ✓</span>';
    else if (role === "MANAGER" && isDeliverableStatus(status)) cell.innerHTML = deliveryButton(orderId);
    else cell.innerHTML = '<span class="muted">Admin or Manager confirms delivery</span>';
  });
}

function rowStatus(row) {
  return String(row.querySelector('[data-label="Status"]')?.textContent || "").trim().toUpperCase();
}

function normalizeRole(role) {
  const normalized = String(role || "OPERATOR").trim().toUpperCase();
  if (normalized === "OWNER") return "ADMIN";
  if (["WAREHOUSE", "WORKER", "WAREHOUSE WORKER", "STAFF"].includes(normalized)) return "OPERATOR";
  return normalized;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
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
