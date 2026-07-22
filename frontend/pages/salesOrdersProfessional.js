import { render as renderLegacySalesOrders } from "./salesOrders.js?v=delivery1";
import { getSalesOrderDetail, listSalesOrders } from "../js/api-smooth1.js?v=orders1";
import { installDeliveryActions, replaceAdminDeliveryActions } from "../js/salesDelivery.js?v=delivery1";

export async function render(ctx) {
  await renderLegacySalesOrders(ctx);

  const role = normalizeRole(ctx.user?.role);
  ctx.view.classList.add("sales-orders-professional");
  installGroupedLotPricing(ctx.view);

  if (role === "ADMIN") {
    replaceAdminDeliveryActions(ctx.view);
    ctx.setTitle("Sales Orders", "Customer orders, fulfillment progress, and commercial analysis");
  } else {
    ctx.setTitle("Sales Orders", role === "MANAGER"
      ? "Review open customer orders and confirm delivery"
      : "Open customer orders and fulfillment status");
    removeOrderBuilder(ctx.view);
  }

  installSalesOrderExplorer(ctx.view, await listSalesOrders());
  installDeliveryActions(ctx, () => render(ctx));
}

function installSalesOrderExplorer(root, orders = []) {
  const table = root.querySelector("table");
  if (!table) return;

  root.querySelectorAll(".sales-order-filter-bar").forEach((element) => element.remove());
  table.closest(".panel")?.querySelector(".table-tools")?.remove();
  ensureStyles();

  const orderMap = new Map(orders.map((order) => [String(order.sales_order_id || ""), order]));
  const headers = Array.from(table.tHead?.rows?.[0]?.cells || []);
  const productsIndex = headerIndex(headers, "Products");
  if (productsIndex >= 0) removeColumn(table, productsIndex);

  const currentHeaders = Array.from(table.tHead?.rows?.[0]?.cells || []);
  const actionIndex = headerIndex(currentHeaders, "Actions");
  if (currentHeaders[0]) currentHeaders[0].textContent = "Folio";

  const rows = Array.from(table.tBodies?.[0]?.rows || []);
  const customerValues = new Set();
  const statusValues = new Set();
  const folioValues = new Set();

  rows.forEach((row) => {
    const idFromAction = row.querySelector("[data-sales-order-id]")?.dataset.salesOrderId;
    const orderId = String(idFromAction || row.cells[0]?.textContent || "").trim();
    const order = orderMap.get(orderId) || {};
    const folio = String(order.bl_folio || order.quickbooks_invoice_id || orderId).trim();
    const customer = String(order.customer?.supplier_name || order.customer_name || order.customer_id || labeledText(row, "Customer")).trim();
    const status = String(order.status || labeledText(row, "Status")).trim().toUpperCase();
    const date = normalizedDate(order.order_date || labeledText(row, "Date"));

    row.dataset.salesOrderId = orderId;
    row.dataset.salesFolio = folio;
    row.dataset.salesCustomer = customer;
    row.dataset.salesStatus = status;
    row.dataset.salesDate = date;

    if (row.cells[0]) {
      row.cells[0].dataset.label = "Folio";
      row.cells[0].innerHTML = `<a href="#" class="sales-folio-link" data-folio-link="${escapeHtml(folio)}">${escapeHtml(folio)}</a>`;
    }

    const actionCell = actionIndex >= 0 ? row.cells[actionIndex] : row.cells[row.cells.length - 1];
    if (actionCell) {
      removeDuplicateDetailActions(actionCell);
      const remaining = actionCell.innerHTML.trim();
      actionCell.innerHTML = `<div class="sales-row-actions">
        <a href="#" class="sales-view-link" data-sales-detail="${escapeHtml(orderId)}">View/Edit</a>
        ${remaining ? `<div class="sales-secondary-actions">${remaining}</div>` : ""}
      </div>`;
    }

    if (customer) customerValues.add(customer);
    if (status) statusValues.add(status);
    if (folio) folioValues.add(folio);
  });

  const filters = document.createElement("div");
  filters.className = "sales-order-filter-bar";
  filters.innerHTML = `
    ${selectFilter("Status", "status", "All statuses", Array.from(statusValues).sort(), displayValue)}
    <label class="sales-filter-field"><span>Date from</span><input type="date" data-filter-date-from></label>
    <label class="sales-filter-field"><span>Date to</span><input type="date" data-filter-date-to></label>
    ${selectFilter("Customer", "customer", "All customers", Array.from(customerValues).sort())}
    ${selectFilter("Folio", "folio", "All folios", Array.from(folioValues).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })))}
    <button class="sales-clear-filters" type="button" data-clear-filters>Clear</button>
    <span class="sales-filter-count" data-filter-count></span>
  `;

  table.closest(".table-wrap")?.before(filters);

  const controls = {
    status: filters.querySelector("[data-filter-status]"),
    from: filters.querySelector("[data-filter-date-from]"),
    to: filters.querySelector("[data-filter-date-to]"),
    customer: filters.querySelector("[data-filter-customer]"),
    folio: filters.querySelector("[data-filter-folio]"),
    count: filters.querySelector("[data-filter-count]")
  };

  const applyFilters = () => {
    let visible = 0;
    rows.forEach((row) => {
      const show = (!controls.status.value || row.dataset.salesStatus === controls.status.value)
        && (!controls.customer.value || row.dataset.salesCustomer === controls.customer.value)
        && (!controls.folio.value || row.dataset.salesFolio === controls.folio.value)
        && (!controls.from.value || row.dataset.salesDate >= controls.from.value)
        && (!controls.to.value || row.dataset.salesDate <= controls.to.value);
      row.hidden = !show;
      if (show) visible += 1;
    });
    controls.count.textContent = `${visible} of ${rows.length}`;
  };

  filters.querySelectorAll("select,input").forEach((control) => control.addEventListener("change", applyFilters));
  filters.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
    filters.querySelectorAll("select,input").forEach((control) => { control.value = ""; });
    applyFilters();
  });

  table.addEventListener("click", async (event) => {
    const folioLink = event.target.closest("[data-folio-link]");
    if (folioLink) {
      event.preventDefault();
      controls.folio.value = folioLink.dataset.folioLink || "";
      applyFilters();
      return;
    }

    const detailLink = event.target.closest("[data-sales-detail]");
    if (!detailLink) return;
    event.preventDefault();
    const original = detailLink.textContent;
    detailLink.textContent = "Loading...";
    try {
      showDetail(await getSalesOrderDetail(detailLink.dataset.salesDetail));
    } catch (error) {
      window.alert(error?.message || "Could not load the sales order.");
    } finally {
      detailLink.textContent = original;
    }
  });

  applyFilters();
}

function removeDuplicateDetailActions(cell) {
  cell.querySelectorAll("[data-sales-detail], .sales-view-link").forEach((element) => element.remove());
  Array.from(cell.querySelectorAll("button,a")).forEach((element) => {
    if (/^view\/?edit$/i.test(String(element.textContent || "").trim())) element.remove();
  });
}

function showDetail(detail) {
  if (!detail?.order) throw new Error("Sales Order was not found.");
  document.querySelector("[data-sales-detail-modal]")?.remove();

  const { order } = detail;
  const lines = detail.lines || [];
  const customer = order.customer?.supplier_name || order.customer_name || order.customer_id || "";
  const folio = order.bl_folio || order.quickbooks_invoice_id || order.sales_order_id || "";
  const modal = document.createElement("div");
  modal.className = "sales-detail-modal";
  modal.dataset.salesDetailModal = "true";
  modal.innerHTML = `
    <div class="sales-detail-backdrop" data-close-detail></div>
    <section class="sales-detail-card" role="dialog" aria-modal="true">
      <header class="sales-detail-header">
        <div><span>Sales Order</span><h2>Folio ${escapeHtml(folio)}</h2><p>${escapeHtml(customer)} · ${escapeHtml(order.sales_order_id || "")}</p></div>
        <button class="sales-detail-close" type="button" data-close-detail>×</button>
      </header>
      <div class="sales-detail-summary">
        ${fact("Order date", formatDate(order.order_date))}
        ${fact("Ship by", formatDate(order.ship_by_date || order.requested_delivery_date))}
        ${fact("Status", displayValue(order.status))}
        ${fact("Payment terms", order.payment_terms || "—")}
        ${fact("Ship method", displayValue(order.ship_method))}
        ${fact("Total", money(order.total_amount))}
      </div>
      <section class="sales-detail-section"><h3>Customer and shipping</h3><p><strong>${escapeHtml(customer)}</strong></p><p>${escapeHtml(order.shipping_address || order.customer?.address || "No address recorded")}</p></section>
      <section class="sales-detail-section"><h3>Products and charges</h3><div class="sales-detail-lines-wrap"><table class="sales-detail-lines"><thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th>Price</th><th>Total</th></tr></thead><tbody>
        ${lines.map((line) => `<tr><td>${escapeHtml(line.product?.product_name || line.product_name || financialName(line) || line.product_id || "Line item")}</td><td>${number(line.qty_ordered)}</td><td>${escapeHtml(line.unit_type || "")}</td><td>${money(line.unit_price)}</td><td>${money(line.line_total)}</td></tr>`).join("") || '<tr><td colspan="5">No line items found.</td></tr>'}
      </tbody></table></div></section>
      ${order.notes ? `<section class="sales-detail-section"><h3>Notes</h3><p>${escapeHtml(order.notes)}</p></section>` : ""}
    </section>`;

  const close = () => modal.remove();
  modal.querySelectorAll("[data-close-detail]").forEach((element) => element.addEventListener("click", close));
  document.body.appendChild(modal);
}

function selectFilter(label, name, placeholder, values, formatter = (value) => value) {
  return `<label class="sales-filter-field"><span>${escapeHtml(label)}</span><select data-filter-${name}><option value="">${escapeHtml(placeholder)}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(formatter(value))}</option>`).join("")}</select></label>`;
}

function ensureStyles() {
  document.getElementById("salesOrderExplorerStyles")?.remove();
  const style = document.createElement("style");
  style.id = "salesOrderExplorerStyles";
  style.textContent = `
    .sales-orders-professional .table-tools{display:none!important}
    .sales-orders-professional table{border-collapse:collapse;background:#fff}
    .sales-orders-professional thead th{background:#fff;border-bottom:2px solid #dfe3e8;color:#394149;font-size:.75rem;letter-spacing:.035em;text-transform:uppercase;padding:12px 10px}
    .sales-orders-professional tbody td{border-bottom:1px solid #e5e7eb;padding:13px 10px;vertical-align:middle}
    .sales-orders-professional tbody tr:hover{background:#f8fbfa}
    .sales-order-filter-bar{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin:4px 0 14px;padding-bottom:14px;border-bottom:1px solid #e5e7eb}
    .sales-filter-field{display:grid;gap:5px;min-width:145px}.sales-filter-field span{font-size:.76rem;color:#5f6b76;font-weight:700}
    .sales-filter-field select,.sales-filter-field input{height:38px;border:1px solid #b8c0c8;border-radius:4px;background:#fff;padding:0 10px;color:#20252a;font:inherit}
    .sales-clear-filters{height:38px;border:1px solid #aeb7bf;background:#fff;border-radius:4px;padding:0 14px;color:#176b5b;font-weight:700;cursor:pointer}
    .sales-filter-count{margin-left:auto;padding-bottom:10px;color:#66717c;font-size:.82rem}
    .sales-folio-link,.sales-view-link{display:inline!important;background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important;color:#176b8f!important;font:inherit!important;font-weight:700!important;text-decoration:none!important;cursor:pointer!important;border-radius:0!important}
    .sales-folio-link:hover,.sales-view-link:hover{text-decoration:underline!important}
    .sales-row-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px;white-space:nowrap}.sales-secondary-actions{display:flex;align-items:center;gap:7px}
    .sales-detail-modal{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px}.sales-detail-backdrop{position:absolute;inset:0;background:rgba(25,31,36,.48)}
    .sales-detail-card{position:relative;width:min(960px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:8px;box-shadow:0 18px 55px rgba(0,0,0,.22);padding:24px}
    .sales-detail-header{display:flex;justify-content:space-between;gap:20px;padding-bottom:18px;border-bottom:1px solid #dfe3e8}.sales-detail-header span{font-size:.75rem;color:#68737d;text-transform:uppercase;font-weight:700}.sales-detail-header h2{margin:4px 0}.sales-detail-header p{margin:0;color:#68737d}.sales-detail-close{border:0;background:transparent;font-size:28px;cursor:pointer}
    .sales-detail-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:18px 0;border:1px solid #dfe3e8;border-radius:6px;overflow:hidden}.sales-detail-summary div{display:grid;gap:4px;padding:12px 14px;border-right:1px solid #dfe3e8;border-bottom:1px solid #dfe3e8}.sales-detail-summary span{font-size:.74rem;color:#68737d}
    .sales-detail-section{margin-top:20px}.sales-detail-section h3{margin:0 0 10px;font-size:1rem}.sales-detail-section p{margin:5px 0;white-space:pre-line}.sales-detail-lines-wrap{overflow:auto;border-top:1px solid #dfe3e8}.sales-detail-lines{width:100%;border-collapse:collapse}.sales-detail-lines th,.sales-detail-lines td{padding:11px 9px;border-bottom:1px solid #e5e7eb;text-align:left}.sales-detail-lines td:first-child{min-width:240px}
    @media(max-width:650px){.sales-filter-field{width:100%}.sales-filter-count{margin-left:0;width:100%;padding:0}.sales-detail-modal{padding:0}.sales-detail-card{width:100%;height:100%;max-height:none;border-radius:0}.sales-detail-summary{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function installGroupedLotPricing(root) {
  const form = root.querySelector("#salesOrderForm");
  const container = root.querySelector("#salesLineItems");
  if (!form || !container) return;
  let observer;
  const regroup = () => {
    const cards = Array.from(container.querySelectorAll(".sales-line-item"));
    const seen = new Set();
    cards.forEach((card, index) => {
      card.hidden = false;
      const product = card.querySelector("[data-product-choice]")?.value || "";
      const lot = card.querySelector("[data-supplier-lot-choice]")?.value || "";
      const key = product && lot ? `${product}|${lot}` : `row-${index}`;
      if (seen.has(key)) card.hidden = true;
      else seen.add(key);
    });
  };
  form.addEventListener("change", () => queueMicrotask(regroup));
  observer = new MutationObserver(regroup);
  observer.observe(container, { childList: true, subtree: true });
  regroup();
}

function removeOrderBuilder(root) { root.querySelector(".sales-order-builder")?.remove(); }
function headerIndex(headers, label) { return headers.findIndex((cell) => String(cell.textContent || "").trim().toUpperCase() === label.toUpperCase()); }
function removeColumn(table, index) { table.tHead?.rows?.[0]?.cells?.[index]?.remove(); Array.from(table.tBodies?.[0]?.rows || []).forEach((row) => row.cells[index]?.remove()); }
function labeledText(row, label) { return String(row.querySelector(`[data-label="${label}"]`)?.textContent || "").trim(); }
function normalizedDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10); }
function financialName(line) { const notes = String(line.notes || ""); return notes.includes("FREIGHT") ? "Freight" : notes.includes("FEES") ? "Fees" : ""; }
function fact(label, value) { return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "—")}</strong></div>`; }
function normalizeRole(role) { const value = String(role || "OPERATOR").toUpperCase(); return value === "OWNER" ? "ADMIN" : value; }
function formatDate(value) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(); }
function money(value) { return Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "USD" }); }
function number(value) { return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function displayValue(value) { return String(value || "—").replaceAll("_", " "); }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
