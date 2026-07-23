import { getSalesOrderDetail, listProducts, listSalesOrders } from "../js/api-smooth1.js?v=product-analytics1";
import { escapeHtml, formatMoney, formatQuantity } from "../js/utils.js";

const detailCache = new Map();

export async function renderProductSalesAnalytics(container, options = {}) {
  const products = await listProducts();
  const orders = await listSalesOrders();
  const selectedProductId = options.productId || productIdFromHash() || products[0]?.product_id || "";
  const selectedProduct = products.find((product) => product.product_id === selectedProductId) || products[0] || {};
  const defaultStart = new Date();
  defaultStart.setMonth(defaultStart.getMonth() - 12);

  container.innerHTML = analyticsShell(products, selectedProduct, {
    startDate: options.startDate || isoDate(defaultStart),
    endDate: options.endDate || isoDate(new Date()),
    source: options.source || "ALL",
    customer: options.customer || "ALL"
  });

  bindFilters(container, products, orders);
  await loadAndRender(container, products, orders);
}

function analyticsShell(products, selectedProduct, filters) {
  return `
    <div class="panel-header product-analytics-title">
      <div>
        <p class="muted">Reports / Product Sales Analytics</p>
        <h2>${escapeHtml(selectedProduct.product_name || "Product analytics")}</h2>
        <p class="muted">${escapeHtml(selectedProduct.product_id || "")} · Historical and operational sales</p>
      </div>
    </div>
    <form id="productAnalyticsFilters" class="product-analytics-filters">
      <label>Product<select name="product_id">${products.map((product) => `<option value="${escapeHtml(product.product_id)}" ${product.product_id === selectedProduct.product_id ? "selected" : ""}>${escapeHtml(product.product_name)}</option>`).join("")}</select></label>
      <label>Start date<input type="date" name="start_date" value="${filters.startDate}"></label>
      <label>End date<input type="date" name="end_date" value="${filters.endDate}"></label>
      <label>Data source<select name="source"><option value="ALL">All sales</option><option value="OPERATIONAL">Operational</option><option value="HISTORICAL">Historical</option></select></label>
      <label>Customer<select name="customer"><option value="ALL">All customers</option></select></label>
      <button class="btn" type="submit">Apply filters</button>
    </form>
    <div id="productAnalyticsStatus" class="notice muted">Loading product sales history…</div>
    <div id="productAnalyticsContent"></div>
  `;
}

function bindFilters(container, products, orders) {
  const form = container.querySelector("#productAnalyticsFilters");
  const customerSelect = form.elements.customer;
  const customers = Array.from(new Set((orders || []).map((order) => String(order.customer_name || "").trim()).filter(Boolean))).sort();
  customerSelect.insertAdjacentHTML("beforeend", customers.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join(""));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await loadAndRender(container, products, orders);
  });
  form.elements.product_id.addEventListener("change", () => {
    const id = form.elements.product_id.value;
    window.location.hash = `reports?product=${encodeURIComponent(id)}`;
  });
}

async function loadAndRender(container, products, orders) {
  const form = container.querySelector("#productAnalyticsFilters");
  const status = container.querySelector("#productAnalyticsStatus");
  const content = container.querySelector("#productAnalyticsContent");
  const filters = Object.fromEntries(new FormData(form).entries());
  const selectedProduct = products.find((product) => product.product_id === filters.product_id) || {};
  const relevantHeaders = (orders || []).filter((order) => orderInFilters(order, filters));
  status.textContent = `Loading ${relevantHeaders.length} matching orders…`;
  content.innerHTML = skeleton();

  const details = await mapWithConcurrency(relevantHeaders, 8, async (order, index) => {
    status.textContent = `Loading sales lines ${index + 1} of ${relevantHeaders.length}…`;
    if (detailCache.has(order.sales_order_id)) return detailCache.get(order.sales_order_id);
    const detail = await getSalesOrderDetail(order.sales_order_id);
    detailCache.set(order.sales_order_id, detail);
    return detail;
  });

  const report = buildReport(selectedProduct, relevantHeaders, details, filters);
  status.remove();
  content.innerHTML = reportMarkup(report);
  bindAllocationButtons(content, report);
}

function orderInFilters(order, filters) {
  const date = String(order.order_date || "").slice(0, 10);
  if (filters.start_date && date && date < filters.start_date) return false;
  if (filters.end_date && date && date > filters.end_date) return false;
  if (filters.customer !== "ALL" && String(order.customer_name || "") !== filters.customer) return false;
  const historical = String(order.order_source || "").toUpperCase().includes("HISTORICAL");
  if (filters.source === "HISTORICAL" && !historical) return false;
  if (filters.source === "OPERATIONAL" && historical) return false;
  return true;
}

function buildReport(product, headers, details, filters) {
  const headerMap = Object.fromEntries(headers.map((order) => [order.sales_order_id, order]));
  const rawLines = [];
  details.forEach((detail) => {
    const order = detail?.salesOrder || detail?.order || detail || {};
    const orderId = order.sales_order_id || detail?.sales_order_id;
    const header = headerMap[orderId] || order;
    const lines = detail?.lines || detail?.salesOrderLines || detail?.items || [];
    lines.filter((line) => String(line.product_id) === String(product.product_id)).forEach((line) => rawLines.push({ ...line, order: header }));
  });

  const groups = new Map();
  rawLines.forEach((line) => {
    const key = [line.sales_order_id, line.unit_type || "", numeric(line.unit_price)].join("|");
    const current = groups.get(key) || {
      sales_order_id: line.sales_order_id,
      order: line.order,
      qty: 0,
      revenue: 0,
      grossProfit: 0,
      validGrossProfit: 0,
      missingCostLines: 0,
      unit_type: line.unit_type || "",
      unit_price: numeric(line.unit_price),
      allocations: []
    };
    current.qty += numeric(line.qty_ordered);
    current.revenue += numeric(line.line_total) || numeric(line.qty_ordered) * numeric(line.unit_price);
    const hasCost = numeric(line.unit_cost) > 0;
    if (hasCost) {
      current.grossProfit += numeric(line.estimated_gross_profit) || Math.max(0, current.revenue - numeric(line.qty_ordered) * numeric(line.unit_cost));
      current.validGrossProfit += numeric(line.estimated_gross_profit) || 0;
    } else {
      current.missingCostLines += 1;
    }
    current.allocations.push(line);
    groups.set(key, current);
  });

  const orders = Array.from(groups.values()).sort((a, b) => String(b.order?.order_date || "").localeCompare(String(a.order?.order_date || "")));
  const revenue = sum(orders, "revenue");
  const comparable = mostCommonUnit(orders);
  const comparableOrders = orders.filter((row) => row.unit_type === comparable);
  const comparableQty = sum(comparableOrders, "qty");
  const validRevenue = orders.filter((row) => row.missingCostLines === 0).reduce((total, row) => total + row.revenue, 0);
  const validProfit = orders.filter((row) => row.missingCostLines === 0).reduce((total, row) => total + row.grossProfit, 0);
  const missingCostLines = orders.reduce((total, row) => total + row.missingCostLines, 0);
  const customers = new Set(orders.map((row) => row.order?.customer_name).filter(Boolean));
  const monthly = aggregateMonthly(orders, comparable);
  const customerRows = aggregateCustomers(orders).slice(0, 8);
  return {
    product,
    filters,
    orders,
    revenue,
    distinctOrders: new Set(orders.map((row) => row.sales_order_id)).size,
    uniqueCustomers: customers.size,
    comparableUnit: comparable,
    comparableQty,
    weightedAveragePrice: comparableQty ? comparableOrders.reduce((total, row) => total + row.revenue, 0) / comparableQty : 0,
    averageOrderValue: orders.length ? revenue / new Set(orders.map((row) => row.sales_order_id)).size : 0,
    grossMargin: validRevenue ? validProfit / validRevenue * 100 : null,
    missingCostLines,
    mixedUnits: Array.from(new Set(orders.map((row) => row.unit_type).filter(Boolean))),
    monthly,
    customerRows
  };
}

function reportMarkup(report) {
  return `
    <div class="analytics-kpis">
      ${kpi("Total Revenue", formatMoney(report.revenue), "All matching sales")}
      ${kpi("Distinct Orders", formatQuantity(report.distinctOrders), "Grouped by sales order")}
      ${kpi("Unique Customers", formatQuantity(report.uniqueCustomers), "Selected period")}
      ${kpi("Weighted Avg Price", report.weightedAveragePrice ? `${formatMoney(report.weightedAveragePrice)} / ${escapeHtml(report.comparableUnit || "unit")}` : "—", "Comparable units only")}
      ${kpi("Average Order Value", formatMoney(report.averageOrderValue), "Product revenue per order")}
      ${kpi("Estimated Gross Margin", report.grossMargin === null ? "—" : `${formatQuantity(report.grossMargin, { maximumFractionDigits: 1 })}%`, report.missingCostLines ? `${report.missingCostLines} missing-cost lines excluded` : "Valid cost lines")}
    </div>
    ${warnings(report)}
    <div class="analytics-chart-grid">
      ${lineChart("Monthly Revenue Trend", report.monthly, "revenue", "$", "")}
      ${lineChart("Average Selling Price", report.monthly, "averagePrice", "$", "")}
      ${barChart("Top Customers", report.customerRows)}
      ${sourceSummary(report.orders)}
    </div>
    <section class="panel analytics-orders-panel">
      <div class="panel-header"><div><h2>Aggregated Orders</h2><p class="muted">One commercial row per order, product, unit and price.</p></div></div>
      ${ordersTable(report.orders)}
    </section>
    ${insights(report)}
  `;
}

function kpi(label, value, note) {
  return `<article class="analytics-kpi"><span>${escapeHtml(label)}</span><strong>${value}</strong><small>${escapeHtml(note)}</small></article>`;
}

function warnings(report) {
  const split = report.orders.filter((row) => row.allocations.length > 1).sort((a, b) => b.allocations.length - a.allocations.length)[0];
  const items = [];
  if (split) items.push(`${split.sales_order_id} is split across ${split.allocations.length} lot allocations`);
  if (report.missingCostLines) items.push(`${report.missingCostLines} sales allocation lines have missing costs`);
  if (report.mixedUnits.length > 1) items.push(`Mixed units detected: ${report.mixedUnits.join(", ")}`);
  if (!items.length) return "";
  return `<div class="analytics-warning"><strong>Data checks</strong><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
}

function lineChart(title, rows, key, prefix, suffix) {
  if (!rows.length) return emptyChart(title);
  const values = rows.map((row) => numeric(row[key]));
  const max = Math.max(...values, 1);
  const points = rows.map((row, index) => {
    const x = rows.length === 1 ? 50 : 8 + index * (84 / (rows.length - 1));
    const y = 88 - values[index] / max * 68;
    return `${x},${y}`;
  }).join(" ");
  return `<article class="analytics-chart"><h3>${escapeHtml(title)}</h3><svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="8" y1="88" x2="95" y2="88" class="chart-axis"></line><polyline points="${points}" class="chart-line"></polyline>${rows.map((row, index) => { const x = rows.length === 1 ? 50 : 8 + index * (84 / (rows.length - 1)); const y = 88 - values[index] / max * 68; return `<circle cx="${x}" cy="${y}" r="1.6" class="chart-dot"></circle>`; }).join("")}</svg><div class="chart-labels">${rows.map((row) => `<span>${escapeHtml(row.label)}</span>`).join("")}</div><p class="muted">Latest: ${prefix}${formatQuantity(values.at(-1) || 0, { maximumFractionDigits: 2 })}${suffix}</p></article>`;
}

function barChart(title, rows) {
  if (!rows.length) return emptyChart(title);
  const max = Math.max(...rows.map((row) => row.revenue), 1);
  return `<article class="analytics-chart"><h3>${escapeHtml(title)}</h3><div class="customer-bars">${rows.map((row) => `<div><span title="${escapeHtml(row.customer)}">${escapeHtml(row.customer)}</span><i style="width:${Math.max(2, row.revenue / max * 100)}%"></i><strong>${formatMoney(row.revenue)}</strong></div>`).join("")}</div></article>`;
}

function sourceSummary(orders) {
  const operational = orders.filter((row) => !String(row.order?.order_source || "").toUpperCase().includes("HISTORICAL")).reduce((sum, row) => sum + row.revenue, 0);
  const historical = orders.reduce((sum, row) => sum + row.revenue, 0) - operational;
  const total = operational + historical || 1;
  return `<article class="analytics-chart"><h3>Revenue by Source</h3><div class="source-donut" style="--operational:${operational / total * 360}deg"></div><div class="source-legend"><span><i class="operational"></i>Operational <strong>${formatMoney(operational)}</strong></span><span><i class="historical"></i>Historical <strong>${formatMoney(historical)}</strong></span></div></article>`;
}

function ordersTable(rows) {
  if (!rows.length) return `<p class="muted">No sales lines match these filters.</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Order</th><th>Customer</th><th>Qty</th><th>Unit</th><th>Price</th><th>Revenue</th><th>Gross Profit</th><th>Source</th><th>Actions</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${escapeHtml(String(row.order?.order_date || "").slice(0, 10))}</td><td>${escapeHtml(row.sales_order_id)}</td><td>${escapeHtml(row.order?.customer_name || "Unknown customer")}</td><td>${formatQuantity(row.qty)}</td><td>${escapeHtml(row.unit_type)}</td><td>${formatMoney(row.unit_price)}</td><td>${formatMoney(row.revenue)}</td><td>${row.missingCostLines ? `<span class="status warn">Cost incomplete</span>` : formatMoney(row.grossProfit)}</td><td><span class="status">${String(row.order?.order_source || "").toUpperCase().includes("HISTORICAL") ? "Historical" : "Operational"}</span></td><td><button class="btn secondary" data-allocation-index="${index}" type="button">View ${row.allocations.length} allocation${row.allocations.length === 1 ? "" : "s"}</button></td></tr><tr class="allocation-row" data-allocation-row="${index}" hidden><td colspan="10">${allocationMarkup(row.allocations)}</td></tr>`).join("")}</tbody></table></div>`;
}

function allocationMarkup(lines) {
  return `<div class="allocation-grid">${lines.map((line) => `<div><strong>${escapeHtml(line.preferred_internal_lot_id || "No lot")}</strong><span>${escapeHtml(line.preferred_location_id || "No location")}</span><span>${formatQuantity(line.qty_ordered)} ${escapeHtml(line.unit_type || "")}</span><span>${numeric(line.unit_cost) > 0 ? `Cost ${formatMoney(line.unit_cost)}` : "Missing cost"}</span></div>`).join("")}</div>`;
}

function bindAllocationButtons(content) {
  content.querySelectorAll("[data-allocation-index]").forEach((button) => button.addEventListener("click", () => {
    const row = content.querySelector(`[data-allocation-row="${button.dataset.allocationIndex}"]`);
    row.hidden = !row.hidden;
  }));
}

function insights(report) {
  const top = report.customerRows[0];
  const messages = [];
  if (top) messages.push(`${top.customer} is the largest customer for ${report.product.product_name}.`);
  if (report.weightedAveragePrice) messages.push(`Weighted average price is ${formatMoney(report.weightedAveragePrice)} per ${report.comparableUnit || "unit"}.`);
  if (report.missingCostLines) messages.push(`Margin excludes ${report.missingCostLines} missing-cost lines and should be treated as provisional.`);
  return `<section class="panel analytics-insights"><div class="panel-header"><h2>Key Insights</h2></div>${messages.map((message) => `<p>${escapeHtml(message)}</p>`).join("")}</section>`;
}

function aggregateMonthly(orders, comparableUnit) {
  const map = new Map();
  orders.forEach((row) => {
    const month = String(row.order?.order_date || "").slice(0, 7);
    if (!month) return;
    const item = map.get(month) || { month, revenue: 0, comparableRevenue: 0, comparableQty: 0 };
    item.revenue += row.revenue;
    if (row.unit_type === comparableUnit) { item.comparableRevenue += row.revenue; item.comparableQty += row.qty; }
    map.set(month, item);
  });
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month)).map((row) => ({ ...row, label: monthLabel(row.month), averagePrice: row.comparableQty ? row.comparableRevenue / row.comparableQty : 0 }));
}

function aggregateCustomers(orders) {
  const map = new Map();
  orders.forEach((row) => {
    const customer = row.order?.customer_name || "Unknown customer";
    const item = map.get(customer) || { customer, revenue: 0, orders: new Set() };
    item.revenue += row.revenue;
    item.orders.add(row.sales_order_id);
    map.set(customer, item);
  });
  return Array.from(map.values()).map((row) => ({ customer: row.customer, revenue: row.revenue, orderCount: row.orders.size })).sort((a, b) => b.revenue - a.revenue);
}

function mostCommonUnit(rows) {
  const totals = {};
  rows.forEach((row) => totals[row.unit_type] = (totals[row.unit_type] || 0) + row.qty);
  return Object.keys(totals).sort((a, b) => totals[b] - totals[a])[0] || "";
}

function skeleton() { return `<div class="analytics-kpis">${Array.from({ length: 6 }, () => `<article class="analytics-kpi skeleton-card"></article>`).join("")}</div>`; }
function emptyChart(title) { return `<article class="analytics-chart"><h3>${escapeHtml(title)}</h3><p class="muted">No comparable data for this selection.</p></article>`; }
function numeric(value) { const number = Number(String(value ?? "").replace(/[$,%]/g, "").replace(/,/g, "")); return Number.isFinite(number) ? number : 0; }
function sum(rows, key) { return rows.reduce((total, row) => total + numeric(row[key]), 0); }
function isoDate(date) { return date.toISOString().slice(0, 10); }
function monthLabel(month) { const date = new Date(`${month}-01T00:00:00`); return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" }); }
function productIdFromHash() { const query = String(window.location.hash || "").split("?")[1] || ""; return new URLSearchParams(query).get("product") || ""; }
async function mapWithConcurrency(items, limit, worker) { const results = new Array(items.length); let cursor = 0; async function run() { while (cursor < items.length) { const index = cursor++; try { results[index] = await worker(items[index], index); } catch (_error) { results[index] = null; } } } await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, run)); return results.filter(Boolean); }
