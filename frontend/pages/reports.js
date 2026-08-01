import { clearApiCache, getOperationalReports } from "../js/api-smooth1.js?v=data-audit1";
import { escapeHtml, formatMoney, formatQuantity } from "../js/utils.js";

let dashboardData = null;
let state = {
  mode: "overview",
  productId: "",
  category: "ALL",
  period: "90",
  tab: "summary",
  transactionType: "sales",
  comparison: "margin-volume"
};

export async function render(ctx) {
  ctx.setTitle("Product Analytics", "Clear inventory, demand, margin, and purchasing decisions");
  dashboardData = await getOperationalReports();
  const routeProduct = decodeURIComponent(String(window.location.hash || "").split(":")[1] || "");
  if (routeProduct && dashboardData.productAnalytics?.[routeProduct]) {
    state.productId = routeProduct;
    state.mode = "product";
  }
  if (!state.productId) state.productId = dashboardData.products?.[0]?.product_id || "";
  draw(ctx.view, ctx);
}

function draw(root, ctx) {
  root.innerHTML = `
    <div class="product-dashboard">
      ${header()}
      <main id="productDashboardBody" class="product-dashboard-body">
        ${state.mode === "overview" ? overview() : productView()}
      </main>
    </div>
  `;
  bind(root, ctx);
}

function header() {
  const categories = dashboardData.filters?.categories || [];
  return `
    <section class="panel product-dashboard-header">
      <div class="product-dashboard-title">
        <div>
          <span class="eyebrow">MANAGEMENT DASHBOARD</span>
          <h2>Product Analytics</h2>
          <p>See what needs attention, what is profitable, and what to buy next.</p>
        </div>
        <div class="dashboard-updated">
          <span>Last refreshed</span>
          <strong>${dateTime(dashboardData.calculated_at)}</strong>
        </div>
      </div>
      <div class="dashboard-toolbar">
        <div class="dashboard-mode" role="tablist">
          <button class="${state.mode === "overview" ? "active" : ""}" data-dashboard-mode="overview" type="button">Overview</button>
          <button class="${state.mode === "product" ? "active" : ""}" data-dashboard-mode="product" type="button">Product Analysis</button>
        </div>
        <label class="dashboard-field product-field">
          <span>Product</span>
          <select data-dashboard-product>
            ${(dashboardData.products || []).map((row) => `<option value="${escapeHtml(row.product_id)}" ${row.product_id === state.productId ? "selected" : ""}>${escapeHtml(row.product_name)}</option>`).join("")}
          </select>
        </label>
        <label class="dashboard-field">
          <span>Category</span>
          <select data-dashboard-category>
            <option value="ALL">All categories</option>
            ${categories.map((category) => `<option value="${escapeHtml(category)}" ${category === state.category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
          </select>
        </label>
        <label class="dashboard-field">
          <span>Period</span>
          <select data-dashboard-period>
            ${[["30","Last 30 days"],["90","Last 90 days"],["180","Last 6 months"],["365","Last 12 months"],["YTD","Year to date"],["ALL","All history"]].map(([value,label]) => `<option value="${value}" ${value === state.period ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
        <button class="dashboard-refresh" data-dashboard-refresh type="button">Refresh</button>
      </div>
    </section>
  `;
}

function overview() {
  const overview = filteredOverview();
  const k = overview.kpis;
  return `
    <section class="dashboard-kpis">
      ${kpi("Selling price", moneyPerLb(k.weighted_selling_price_per_lb), "Weighted by pounds sold")}
      ${kpi("Product cost", moneyPerLb(k.weighted_cost_per_lb), "Estimated weighted cost")}
      ${kpi("Gross margin", percent(k.gross_margin_percent), "Estimated portfolio margin", marginTone(k.gross_margin_percent))}
      ${kpi("Inventory value", money(k.inventory_value), "Current available inventory")}
      ${kpi("Reorder alerts", whole(k.reorder_alert_count), "Products below reorder point", k.reorder_alert_count ? "warning" : "success")}
      ${kpi("Expiring value", money(k.expiring_inventory_value), "Estimated value at risk", k.expiring_inventory_value ? "danger" : "success")}
    </section>
    <section class="panel attention-panel">
      <div class="section-heading">
        <div><span class="eyebrow">PRIORITY</span><h3>Needs Attention</h3></div>
        <span>${overview.attention.length} item${overview.attention.length === 1 ? "" : "s"}</span>
      </div>
      <div class="attention-list">
        ${overview.attention.length ? overview.attention.slice(0, 8).map(attentionRow).join("") : empty("Nothing urgent", "Inventory, demand, and margin are currently within range.")}
      </div>
    </section>
    <section class="dashboard-ranking-grid">
      ${ranking("Highest Demand", overview.highest_demand, "demand")}
      ${ranking("Best Margins", overview.best_margins, "margin")}
      ${ranking("Lowest Margins", overview.lowest_margins, "margin")}
    </section>
    <section class="panel expiration-panel">
      <div class="section-heading"><div><span class="eyebrow">RISK</span><h3>Expiring Inventory</h3></div></div>
      ${expirationTable(overview.expiration_risk)}
    </section>
  `;
}

function productView() {
  const product = selectedProduct();
  if (!product) return empty("No product selected", "Choose a product above to open its analysis.");
  return `
    <section class="product-hero">
      <div>
        <span class="eyebrow">PRODUCT ANALYSIS</span>
        <h2>${escapeHtml(product.product_name)}</h2>
        <p>${escapeHtml(product.category)} · Updated ${dateTime(dashboardData.calculated_at)}</p>
      </div>
      <div class="recommendation recommendation-${escapeHtml(product.recommendation?.tone || "neutral")}">
        <span>Recommended action</span>
        <strong>${escapeHtml(product.recommendation?.action || "Review product")}</strong>
        <p>${escapeHtml(product.recommendation?.reason || "")}</p>
        <em>${escapeHtml(product.recommendation?.metric || "")}</em>
      </div>
    </section>
    <section class="dashboard-kpis product-kpis">
      ${kpi("Available inventory", pounds(product.summary.available_inventory), "Ready to use")}
      ${kpi("Inventory value", money(product.summary.inventory_value), "Current estimated cost")}
      ${kpi("Weekly demand", pounds(product.summary.weekly_demand), product.demand.trend_label)}
      ${kpi("Weeks of supply", decimal(product.summary.weeks_of_supply), "At current demand")}
      ${kpi("Selling price", moneyPerLb(product.summary.selling_price_per_lb), "Weighted average")}
      ${kpi("Product cost", moneyPerLb(product.summary.cost_per_lb), "Estimated weighted cost")}
      ${kpi("Gross margin", percent(product.summary.gross_margin_percent), moneyPerLb(product.summary.profit_per_lb) + " profit", marginTone(product.summary.gross_margin_percent))}
      ${kpi("Gross profit", money(product.summary.estimated_gross_profit), "Selected period")}
    </section>
    <nav class="product-tabs" aria-label="Product analysis sections">
      ${[["summary","Summary"],["inventory","Inventory"],["demand","Demand"],["financial","Financial"],["compare","Compare"],["transactions","Transactions"]].map(([id,label]) => `<button type="button" data-product-tab="${id}" class="${state.tab === id ? "active" : ""}">${label}</button>`).join("")}
    </nav>
    <section class="panel product-tab-content">${productTab(product)}</section>
  `;
}

function productTab(product) {
  if (state.tab === "inventory") return inventoryTab(product);
  if (state.tab === "demand") return demandTab(product);
  if (state.tab === "financial") return financialTab(product);
  if (state.tab === "compare") return compareTab(product);
  if (state.tab === "transactions") return transactionsTab(product);
  return summaryTab(product);
}

function summaryTab(p) {
  return `
    <div class="two-column-dashboard">
      <div>
        <div class="section-heading"><div><span class="eyebrow">POSITION</span><h3>Inventory Position</h3></div></div>
        <div class="metric-stack">
          ${metricRow("Available inventory", pounds(p.summary.available_inventory))}
          ${metricRow("Incoming purchases", pounds(p.summary.incoming_purchases))}
          ${metricRow("Committed sales", `− ${pounds(p.summary.committed_sales)}`)}
          ${metricRow("Inventory position", pounds(p.summary.inventory_position), true)}
        </div>
      </div>
      <div>
        <div class="section-heading"><div><span class="eyebrow">PLAN</span><h3>Purchase Planning</h3></div></div>
        <div class="metric-stack">
          ${metricRow("Reorder point", pounds(p.planning.reorder_point))}
          ${metricRow("Target stock", pounds(p.planning.target_stock))}
          ${metricRow("Recommended purchase", pounds(p.planning.recommended_purchase_lb), true)}
          ${metricRow("Purchase units", whole(p.planning.recommended_purchase_units))}
        </div>
      </div>
    </div>
    ${planningBar(p)}
    ${qualityNote(p.data_quality)}
  `;
}

function inventoryTab(p) {
  return `
    ${planningBar(p)}
    <div class="dashboard-kpis compact-kpis">
      ${kpi("Safety stock", pounds(p.planning.safety_stock), "Demand protection")}
      ${kpi("Lead-time demand", pounds(p.planning.demand_during_lead_time), `${decimal(p.planning.lead_time_days)} days lead time`)}
      ${kpi("Recommended buy", pounds(p.planning.recommended_purchase_lb), `${whole(p.planning.recommended_purchase_units)} purchase units`)}
      ${kpi("After purchase", pounds(p.planning.projected_stock_after_purchase), "Projected inventory position")}
    </div>
    <div class="section-heading"><div><span class="eyebrow">LOTS</span><h3>Inventory by Lot and Location</h3></div></div>
    ${table(["Lot","Location","Available","Received","Expiration","Cost / lb","Value"], p.inventory.map(row => [row.supplier_lot_number || row.internal_lot_id, row.location_id, pounds(row.available_qty), date(row.received_date), date(row.expiration_date), moneyPerLb(row.cost_per_lb), money(row.inventory_value)]))}
  `;
}

function demandTab(p) {
  return `
    <div class="dashboard-kpis compact-kpis">
      ${kpi("Weighted weekly demand", pounds(p.demand.recency_weighted_weekly_demand), "Recent weeks count more")}
      ${kpi("Average weekly demand", pounds(p.demand.average_weekly_demand), "All available history")}
      ${kpi("Average order", pounds(p.demand.average_order_volume_lb), `${whole(p.demand.sales_order_count)} orders`)}
      ${kpi("Order frequency", `${decimal(p.demand.average_days_between_orders)} days`, "Average time between orders")}
    </div>
    <div class="section-heading"><div><span class="eyebrow">TREND</span><h3>Weekly Pounds Sold</h3></div><span class="trend-${trendTone(p.demand.trend_percent)}">${signedPercent(p.demand.trend_percent)} · ${escapeHtml(p.demand.trend_label)}</span></div>
    ${lineChart(p.demand.weekly_series || [])}
  `;
}

function financialTab(p) {
  return `
    <div class="dashboard-kpis compact-kpis">
      ${kpi("Selling price", moneyPerLb(p.financial.weighted_selling_price_per_lb), "Weighted by pounds sold")}
      ${kpi("Product cost", moneyPerLb(p.financial.weighted_cost_per_lb), "Estimated weighted cost")}
      ${kpi("Profit / lb", moneyPerLb(p.financial.profit_per_lb), "Selling price minus cost")}
      ${kpi("Gross margin", percent(p.financial.gross_margin_percent), marginTone(p.financial.gross_margin_percent), marginTone(p.financial.gross_margin_percent))}
      ${kpi("Revenue", money(p.financial.total_revenue), "Selected history")}
      ${kpi("Estimated cost", money(p.financial.estimated_total_cost), "Matched historical cost")}
      ${kpi("Gross profit", money(p.financial.estimated_gross_profit), "Revenue minus estimated cost")}
      ${kpi("Sales volume", pounds(p.summary.sales_volume_lb), "Total pounds sold")}
    </div>
    ${qualityNote(p.data_quality)}
  `;
}

function compareTab(p) {
  const rows = filteredProducts();
  return `
    <div class="comparison-controls">
      <label class="dashboard-field"><span>Comparison</span><select data-comparison-mode>
        ${[["margin-volume","Margin vs volume"],["price-volume","Price vs volume"],["cost-margin","Cost vs margin"],["inventory-demand","Inventory vs demand"]].map(([value,label]) => `<option value="${value}" ${state.comparison === value ? "selected" : ""}>${label}</option>`).join("")}
      </select></label>
    </div>
    ${scatterPlot(rows, p.product_id)}
  `;
}

function transactionsTab(p) {
  const rows = state.transactionType === "sales" ? periodRows(p.sales || []) : periodRows(p.purchases || []);
  return `
    <div class="transaction-tabs">
      <button type="button" data-transaction-type="sales" class="${state.transactionType === "sales" ? "active" : ""}">Sales</button>
      <button type="button" data-transaction-type="purchases" class="${state.transactionType === "purchases" ? "active" : ""}">Purchases</button>
    </div>
    ${state.transactionType === "sales"
      ? table(["Date","Customer","Quantity","Price / lb","Revenue","Cost","Margin","Status"], rows.map(row => [date(row.date), row.customer, pounds(row.quantity_lb), moneyPerLb(row.selling_price_per_lb), money(row.revenue), money(row.estimated_cost), percent(row.estimated_margin_percent), row.status]))
      : table(["Date","Supplier","Quantity","Cost / lb","Total cost","Status"], rows.map(row => [date(row.date), row.supplier, pounds(row.quantity_lb), moneyPerLb(row.cost_per_lb), money(row.total_cost), row.status]))}
  `;
}

function filteredOverview() {
  const rows = filteredProducts();
  const revenue = sum(rows, row => row.summary.revenue);
  const volume = sum(rows, row => row.summary.sales_volume_lb);
  const cost = sum(rows, row => row.financial.estimated_total_cost);
  const attention = [];
  rows.forEach(row => {
    if (row.expiration.inventory_at_risk > 0) attention.push({ product_id: row.product_id, product_name: row.product_name, type: "EXPIRATION", priority: 100, title: "Move expiring inventory", reason: `${whole(row.expiration.inventory_at_risk)} lb may remain at expiration.` });
    if (row.summary.inventory_position <= row.planning.reorder_point && row.summary.weekly_demand > 0) attention.push({ product_id: row.product_id, product_name: row.product_name, type: "REORDER", priority: 85, title: "Reorder now", reason: "Inventory position is below the calculated reorder point." });
    if (row.summary.gross_margin_percent !== null && row.summary.gross_margin_percent < 5) attention.push({ product_id: row.product_id, product_name: row.product_name, type: "LOW_MARGIN", priority: 75, title: "Review price or cost", reason: `${decimal(row.summary.gross_margin_percent)}% estimated margin.` });
    if (row.summary.weeks_of_supply !== null && row.summary.weeks_of_supply > 16) attention.push({ product_id: row.product_id, product_name: row.product_name, type: "EXCESS", priority: 65, title: "Reduce purchasing", reason: `${decimal(row.summary.weeks_of_supply)} weeks of supply.` });
  });
  attention.sort((a,b) => b.priority - a.priority);
  const rank = (source, key, descending = true) => [...source].sort((a,b) => (Number(a.summary[key]) - Number(b.summary[key])) * (descending ? -1 : 1)).slice(0,10).map(row => ({ product_id: row.product_id, product_name: row.product_name, weekly_demand: row.summary.weekly_demand, weeks_of_supply: row.summary.weeks_of_supply, margin_percent: row.summary.gross_margin_percent, profit_per_lb: row.summary.profit_per_lb, sales_volume_lb: row.summary.sales_volume_lb, selling_price_per_lb: row.summary.selling_price_per_lb, cost_per_lb: row.summary.cost_per_lb }));
  const marginRows = rows.filter((row) => row.summary.gross_margin_percent !== null
    && Number.isFinite(Number(row.summary.gross_margin_percent))
    && Number(row.summary.cost_coverage_percent || 0) >= 50);
  return {
    kpis: { weighted_selling_price_per_lb: volume ? revenue / volume : 0, weighted_cost_per_lb: volume ? cost / volume : 0, gross_margin_percent: revenue ? (revenue-cost)/revenue*100 : null, inventory_value: sum(rows,row=>row.summary.inventory_value), reorder_alert_count: rows.filter(row=>row.summary.inventory_position<=row.planning.reorder_point && row.summary.weekly_demand>0).length, expiring_inventory_value: sum(rows,row=>row.expiration.value_at_risk) },
    attention,
    highest_demand: rank(rows, "weekly_demand"),
    best_margins: rank(marginRows, "gross_margin_percent"),
    lowest_margins: rank(marginRows, "gross_margin_percent", false),
    expiration_risk: rows.filter(row=>row.expiration.inventory_at_risk>0).map(row=>({product_id:row.product_id,product_name:row.product_name,inventory_at_risk:row.expiration.inventory_at_risk,value_at_risk:row.expiration.value_at_risk,nearest_expiration_date:row.expiration.nearest_expiration_date,days_remaining:row.expiration.days_remaining,risk_level:row.expiration.risk_level})).sort((a,b)=>b.value_at_risk-a.value_at_risk)
  };
}

function filteredProducts() {
  return Object.values(dashboardData.productAnalytics || {}).filter(row => state.category === "ALL" || row.category === state.category).map(row => ({...row, sales: periodRows(row.sales || []), purchases: periodRows(row.purchases || [])}));
}
function selectedProduct() { return dashboardData.productAnalytics?.[state.productId] || null; }
function periodRows(rows) { const start = periodStart(); return !start ? rows : rows.filter(row => new Date(row.date) >= start); }
function periodStart() { if (state.period === "ALL") return null; const now = new Date(); if (state.period === "YTD") return new Date(now.getFullYear(),0,1); return new Date(now.getTime() - Number(state.period)*86400000); }

function bind(root, ctx) {
  root.querySelectorAll("[data-dashboard-mode]").forEach(button => button.addEventListener("click", () => { state.mode = button.dataset.dashboardMode; draw(root, ctx); }));
  root.querySelector("[data-dashboard-product]")?.addEventListener("change", event => { state.productId = event.target.value; state.mode = "product"; window.location.hash = `reports:${encodeURIComponent(state.productId)}`; draw(root, ctx); });
  root.querySelector("[data-dashboard-category]")?.addEventListener("change", event => { state.category = event.target.value; draw(root, ctx); });
  root.querySelector("[data-dashboard-period]")?.addEventListener("change", event => { state.period = event.target.value; draw(root, ctx); });
  root.querySelector("[data-dashboard-refresh]")?.addEventListener("click", async event => {
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = "Refreshing...";
    clearApiCache();
    const refreshed = await getOperationalReports();
    if (!ctx.isCurrent()) return;
    dashboardData = refreshed;
    draw(root, ctx);
  });
  root.querySelectorAll("[data-open-product]").forEach(button => button.addEventListener("click", () => { state.productId = button.dataset.openProduct; state.mode = "product"; state.tab = "summary"; window.location.hash = `reports:${encodeURIComponent(state.productId)}`; draw(root, ctx); }));
  root.querySelectorAll("[data-product-tab]").forEach(button => button.addEventListener("click", () => { state.tab = button.dataset.productTab; draw(root, ctx); }));
  root.querySelectorAll("[data-transaction-type]").forEach(button => button.addEventListener("click", () => { state.transactionType = button.dataset.transactionType; draw(root, ctx); }));
  root.querySelector("[data-comparison-mode]")?.addEventListener("change", event => { state.comparison = event.target.value; draw(root, ctx); });
}

function kpi(label,value,subtitle,tone="") { return `<article class="dashboard-kpi ${tone ? `kpi-${tone}` : ""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(subtitle || "")}</small></article>`; }
function attentionRow(row) { return `<button class="attention-row attention-${row.type.toLowerCase()}" data-open-product="${escapeHtml(row.product_id)}" type="button"><span class="attention-icon">${attentionIcon(row.type)}</span><span><strong>${escapeHtml(row.product_name)}</strong><em>${escapeHtml(row.title)}</em><small>${escapeHtml(row.reason)}</small></span><b>View</b></button>`; }
function attentionIcon(type) { return ({EXPIRATION:"!",REORDER:"↓",LOW_MARGIN:"%",EXCESS:"↑",MISSING_DATA:"?"})[type] || "•"; }
function ranking(title,rows,type) { return `<section class="panel ranking-card"><div class="section-heading"><div><h3>${escapeHtml(title)}</h3></div></div><div class="ranking-list">${rows.length ? rows.map((row,index)=>`<button type="button" data-open-product="${escapeHtml(row.product_id)}"><b>${index+1}</b><span><strong>${escapeHtml(row.product_name)}</strong><small>${type === "demand" ? `${pounds(row.weekly_demand)} / week · ${decimal(row.weeks_of_supply)} weeks supply` : `${percent(row.margin_percent)} margin · ${moneyPerLb(row.profit_per_lb)} profit`}</small></span><em>${type === "demand" ? pounds(row.weekly_demand) : percent(row.margin_percent)}</em></button>`).join("") : empty("No ranked products", "More sales history is needed.")}</div></section>`; }
function expirationTable(rows) { return rows.length ? table(["Product","Expiration","Days","Inventory at risk","Value at risk","Risk"], rows.slice(0,10).map(row => [`<button class="link-button" data-open-product="${escapeHtml(row.product_id)}">${escapeHtml(row.product_name)}</button>`,date(row.nearest_expiration_date),whole(row.days_remaining),pounds(row.inventory_at_risk),money(row.value_at_risk),`<span class="risk risk-${String(row.risk_level).toLowerCase()}">${escapeHtml(row.risk_level)}</span>`])) : empty("No expiring inventory risk", "No current lot is projected to remain after expiration."); }
function metricRow(label,value,strong=false) { return `<div class="metric-row ${strong ? "strong" : ""}"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`; }
function planningBar(p) { const max = Math.max(p.summary.inventory_position,p.planning.target_stock,1); const reorder = Math.min(100,p.planning.reorder_point/max*100); const target = Math.min(100,p.planning.target_stock/max*100); const current = Math.min(100,p.summary.inventory_position/max*100); return `<div class="planning-visual"><div class="section-heading"><div><span class="eyebrow">STOCK RANGE</span><h3>Current Position vs Plan</h3></div></div><div class="planning-track"><span class="zone-danger" style="width:${reorder}%"></span><span class="zone-warning" style="left:${reorder}%;width:${Math.max(0,target-reorder)}%"></span><span class="zone-success" style="left:${target}%;width:${Math.max(0,100-target)}%"></span><i class="marker reorder" style="left:${reorder}%"><small>Reorder</small></i><i class="marker target" style="left:${target}%"><small>Target</small></i><i class="marker current" style="left:${current}%"><small>Current</small></i></div><div class="planning-values"><span>${pounds(p.planning.reorder_point)} reorder</span><span>${pounds(p.planning.target_stock)} target</span><strong>${pounds(p.summary.inventory_position)} current</strong></div></div>`; }
function qualityNote(q) { return q?.is_ready ? "" : `<div class="quality-note"><strong>Data quality</strong><span>${escapeHtml(q?.summary || "Some information is missing.")}</span></div>`; }
function lineChart(rows) { if (!rows.length) return empty("No demand history", "Delivered sales will appear here as weekly demand."); const width=900,height=260,pad=36,max=Math.max(...rows.map(r=>Number(r.quantity_lb)||0),1); const points=rows.map((r,i)=>`${pad+(i/(Math.max(rows.length-1,1)))*(width-pad*2)},${height-pad-(Number(r.quantity_lb)||0)/max*(height-pad*2)}`).join(" "); return `<div class="chart-wrap"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Weekly demand chart"><line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}" class="chart-axis"></line><polyline points="${points}" class="chart-line"></polyline>${rows.map((r,i)=>{const x=pad+(i/(Math.max(rows.length-1,1)))*(width-pad*2),y=height-pad-(Number(r.quantity_lb)||0)/max*(height-pad*2);return `<circle cx="${x}" cy="${y}" r="4" class="chart-dot"><title>${escapeHtml(r.period)}: ${pounds(r.quantity_lb)}</title></circle>`}).join("")}</svg><div class="chart-labels"><span>${escapeHtml(rows[0].period)}</span><span>${escapeHtml(rows[rows.length-1].period)}</span></div></div>`; }
function scatterPlot(rows,selectedId) { const config={"margin-volume":["sales_volume_lb","gross_margin_percent","Sales volume (lb)","Margin %"],"price-volume":["sales_volume_lb","selling_price_per_lb","Sales volume (lb)","Price / lb"],"cost-margin":["cost_per_lb","gross_margin_percent","Cost / lb","Margin %"],"inventory-demand":["weekly_demand","inventory_position","Weekly demand","Inventory position"]}[state.comparison]; const [xKey,yKey,xLabel,yLabel]=config; const pts=rows.map(r=>({id:r.product_id,name:r.product_name,x:Number(r.summary[xKey]??r.financial[xKey]??0),y:Number(r.summary[yKey]??r.financial[yKey]??0)})); const maxX=Math.max(...pts.map(p=>p.x),1),maxY=Math.max(...pts.map(p=>p.y),1),minY=Math.min(...pts.map(p=>p.y),0),width=900,height=360,pad=50; return `<div class="scatter-title"><span>${escapeHtml(yLabel)}</span><span>${escapeHtml(xLabel)}</span></div><div class="chart-wrap scatter-wrap"><svg viewBox="0 0 ${width} ${height}"><line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}" class="chart-axis"></line><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height-pad}" class="chart-axis"></line>${pts.map(p=>{const x=pad+p.x/maxX*(width-pad*2),y=height-pad-(p.y-minY)/(Math.max(maxY-minY,1))*(height-pad*2);return `<circle cx="${x}" cy="${y}" r="${p.id===selectedId?9:6}" class="scatter-dot ${p.id===selectedId?"selected":""}"><title>${escapeHtml(p.name)} · ${decimal(p.x)} / ${decimal(p.y)}</title></circle>`}).join("")}</svg></div>`; }
function table(headers,rows) { return `<div class="dashboard-table-wrap"><table class="dashboard-table"><thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell ?? "—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`; }
function empty(title,text) { return `<div class="dashboard-empty"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div>`; }
function sum(rows,getter) { return rows.reduce((total,row)=>total+(Number(getter(row))||0),0); }
function money(value) { return value === null || value === undefined || Number.isNaN(Number(value)) ? "—" : formatMoney(Number(value)); }
function moneyPerLb(value) { return value === null || value === undefined || Number.isNaN(Number(value)) ? "—" : `${formatMoney(Number(value))} / lb`; }
function pounds(value) { return value === null || value === undefined || Number.isNaN(Number(value)) ? "—" : `${formatQuantity(Number(value))} lb`; }
function percent(value) { return value === null || value === undefined || Number.isNaN(Number(value)) ? "—" : `${Number(value).toFixed(1)}%`; }
function signedPercent(value) { const n=Number(value)||0; return `${n>0?"+":""}${n.toFixed(1)}%`; }
function decimal(value) { return value === null || value === undefined || Number.isNaN(Number(value)) ? "—" : Number(value).toFixed(1); }
function whole(value) { return value === null || value === undefined || Number.isNaN(Number(value)) ? "0" : Math.round(Number(value)).toLocaleString(); }
function date(value) { if (!value) return "—"; const d=new Date(value); return Number.isNaN(d.getTime()) ? escapeHtml(String(value)) : d.toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}); }
function dateTime(value) { if (!value) return "—"; const d=new Date(value); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}); }
function marginTone(value) { const n=Number(value); if (!Number.isFinite(n)) return "neutral"; return n<5?"danger":n<12?"warning":"success"; }
function trendTone(value) { const n=Number(value)||0; return n>10?"up":n<-10?"down":"flat"; }
