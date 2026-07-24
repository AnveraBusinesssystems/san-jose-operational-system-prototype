import { getOperationalReports } from "../js/api-smooth1.js?v=product-reports3";
import { escapeHtml, formatMoney, formatQuantity, status, table } from "../js/utils.js";

const VIEW_TABS = [
  ["summary", "Summary"],
  ["inventory", "Inventory"],
  ["demand", "Demand"],
  ["financial", "Financial"],
  ["compare", "Compare"]
];

export async function render(ctx) {
  ensureStyles();
  ctx.setTitle("Products", "Demand, inventory planning, pricing, cost, and margin analysis");

  const reports = await getOperationalReports();
  const products = (reports.products || []).slice().sort((a, b) =>
    String(a.product_name || "").localeCompare(String(b.product_name || ""), undefined, { sensitivity: "base" })
  );

  ctx.view.innerHTML = `
    <div class="product-reports-page">
      <section class="panel report-toolbar">
        <div>
          <span class="eyebrow">Product analysis</span>
          <h2 id="productReportTitle">Overview</h2>
          <p id="productReportSubtitle" class="muted">Updated ${formatDate(reports.calculated_at)}</p>
        </div>
        <label class="product-picker">
          <span>View</span>
          <select id="productReportSelect">
            <option value="overview">Overview</option>
            ${products.map((product) => `<option value="${escapeHtml(product.product_id)}">${escapeHtml(product.product_name)}</option>`).join("")}
          </select>
        </label>
      </section>
      <section id="productReportContent"></section>
    </div>
  `;

  const select = document.getElementById("productReportSelect");
  const content = document.getElementById("productReportContent");
  const title = document.getElementById("productReportTitle");
  const subtitle = document.getElementById("productReportSubtitle");

  const draw = () => {
    if (select.value === "overview") {
      title.textContent = "Overview";
      subtitle.textContent = `Portfolio view · Updated ${formatDate(reports.calculated_at)}`;
      content.innerHTML = overviewView(reports.productsOverview || {});
      return;
    }

    const analytics = (reports.productAnalytics || {})[select.value];
    if (!analytics) {
      content.innerHTML = emptyState("No analysis available", "This product does not yet have enough usable sales, purchase, or inventory data.");
      return;
    }
    title.textContent = analytics.product_name || "Product";
    subtitle.textContent = productSubtitle(analytics);
    content.innerHTML = productView(analytics);
    bindProductTabs(content, analytics);
  };

  select.addEventListener("change", draw);
  draw();
}

function overviewView(overview) {
  const portfolio = overview.portfolio || {};
  return `
    <section class="metric-grid overview-metrics">
      ${metricCard("Average selling price", money(portfolio.weighted_average_price_per_lb), "per lb")}
      ${metricCard("Average product cost", money(portfolio.weighted_average_cost_per_lb), "per lb")}
      ${metricCard("Portfolio margin", percent(portfolio.gross_margin_percent), "estimated gross margin")}
      ${metricCard("Inventory value", money(portfolio.inventory_value), "current active lots")}
      ${metricCard("Expiring value", money(portfolio.expiring_inventory_value), "within 30 days", portfolio.expiring_inventory_value > 0 ? "warn" : "")}
      ${metricCard("Reorder alerts", quantity(portfolio.reorder_products), "products")}
    </section>

    <section class="overview-grid">
      ${rankingCard("Highest demand", overview.highestDemand || [], "demand")}
      ${rankingCard("Best margins", overview.topMargins || [], "margin")}
      ${rankingCard("Lowest margins", overview.lowestMargins || [], "margin-low")}
      ${expirationCard(overview.expiringWithin30Days || [])}
    </section>
  `;
}

function rankingCard(title, rows, type) {
  return `
    <article class="panel ranking-panel">
      <div class="section-heading">
        <div><span class="eyebrow">Top 10</span><h3>${escapeHtml(title)}</h3></div>
      </div>
      ${rows.length ? `
        <div class="ranking-list">
          ${rows.map((row, index) => `
            <div class="ranking-row">
              <span class="rank-number">${index + 1}</span>
              <div class="rank-name"><strong>${escapeHtml(row.product_name || "Product")}</strong><small>${rankDetail(row, type)}</small></div>
              <div class="rank-value">${rankValue(row, type)}</div>
            </div>
          `).join("")}
        </div>
      ` : emptyState("Not enough data", "Completed sales and purchase history will populate this ranking.")}
    </article>
  `;
}

function rankValue(row, type) {
  if (type === "demand") return `${quantity(row.weighted_weekly_demand)} lb/wk`;
  return percent(row.weighted_margin_percent);
}

function rankDetail(row, type) {
  if (type === "demand") return `${escapeHtml(row.demand_direction || "Stable")} · ${quantity(row.weeks_of_supply)} weeks available`;
  return `${money(row.weighted_price_per_lb)}/lb price · ${money(row.weighted_cost_per_lb)}/lb cost`;
}

function expirationCard(rows) {
  return `
    <article class="panel ranking-panel expiration-panel">
      <div class="section-heading">
        <div><span class="eyebrow">Next 30 days</span><h3>Expiration risk</h3></div>
        <span class="count-pill">${rows.length}</span>
      </div>
      ${rows.length ? `
        <div class="ranking-list">
          ${rows.slice(0, 10).map((row) => `
            <div class="ranking-row expiration-row">
              <div class="expiry-days ${row.days_remaining <= 7 ? "urgent" : ""}">${quantity(row.days_remaining)}d</div>
              <div class="rank-name"><strong>${escapeHtml(row.product_name || "Product")}</strong><small>${quantity(row.available_lb)} lb available · ${quantity(row.at_risk_lb)} lb at risk</small></div>
              <div class="rank-value">${formatShortDate(row.expiration_date)}</div>
            </div>
          `).join("")}
        </div>
      ` : emptyState("No near-term expirations", "No active inventory is scheduled to expire during the next 30 days.")}
    </article>
  `;
}

function productView(analytics) {
  return `
    <section class="metric-grid product-metrics">
      ${metricCard("Available inventory", `${quantity(analytics.summary.current_stock_lb)} lb`, `${quantity(analytics.summary.weeks_of_supply)} weeks of supply`)}
      ${metricCard("Weekly demand", `${quantity(analytics.summary.weighted_weekly_demand)} lb`, analytics.demand.demand_direction || "Stable")}
      ${metricCard("Selling price", money(analytics.summary.weighted_price_per_lb), "weighted per lb")}
      ${metricCard("Product cost", money(analytics.summary.weighted_cost_per_lb), "weighted per lb")}
      ${metricCard("Gross margin", percent(analytics.summary.weighted_margin_percent), `${money(analytics.summary.weighted_profit_per_lb)} profit/lb`, analytics.summary.weighted_margin_percent < 0.05 ? "warn" : "")}
      ${metricCard("Inventory status", friendlyStatus(analytics.planning.status), `${quantity(analytics.planning.inventory_position_lb)} lb position`, statusTone(analytics.planning.status))}
    </section>

    <section class="panel product-detail-panel">
      <div class="product-tabs" role="tablist">
        ${VIEW_TABS.map(([id, label], index) => `<button type="button" data-product-tab="${id}" class="${index === 0 ? "selected" : ""}">${label}</button>`).join("")}
      </div>
      <div id="productTabContent">${summaryTab(analytics)}</div>
    </section>
  `;
}

function bindProductTabs(root, analytics) {
  const panel = root.querySelector("#productTabContent");
  root.querySelectorAll("[data-product-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      root.querySelectorAll("[data-product-tab]").forEach((item) => item.classList.toggle("selected", item === button));
      const tab = button.dataset.productTab;
      if (tab === "inventory") panel.innerHTML = inventoryTab(analytics);
      else if (tab === "demand") panel.innerHTML = demandTab(analytics);
      else if (tab === "financial") panel.innerHTML = financialTab(analytics);
      else if (tab === "compare") {
        panel.innerHTML = comparisonTab(analytics);
        bindComparisonControls(panel, analytics);
      } else panel.innerHTML = summaryTab(analytics);
    });
  });
}

function summaryTab(analytics) {
  return `
    <div class="detail-grid">
      <div class="analysis-card">
        <span class="eyebrow">Planning</span>
        <h3>${friendlyStatus(analytics.planning.status)}</h3>
        <dl class="compact-list">
          ${definition("Reorder point", `${quantity(analytics.planning.reorder_point_lb)} lb`)}
          ${definition("Recommended order", `${quantity(analytics.planning.recommended_order_lb)} lb`)}
          ${definition("Purchase units", quantity(analytics.planning.recommended_order_units))}
          ${definition("Target stock", `${quantity(analytics.planning.target_stock_lb)} lb`)}
        </dl>
      </div>
      <div class="analysis-card">
        <span class="eyebrow">Performance</span>
        <h3>${percent(analytics.financial.gross_margin_percent)} total margin</h3>
        <dl class="compact-list">
          ${definition("Revenue", money(analytics.financial.total_revenue))}
          ${definition("Estimated gross profit", money(analytics.financial.gross_profit))}
          ${definition("Sales volume", `${quantity(analytics.financial.total_sales_lb)} lb`)}
          ${definition("Sales orders", quantity(analytics.summary.sales_orders))}
        </dl>
      </div>
      <div class="analysis-card recommendations-card">
        <span class="eyebrow">Recommendations</span>
        <h3>What needs attention</h3>
        ${recommendationList(analytics.recommendations || [])}
      </div>
    </div>
    ${timelinePanel("Demand and margin trend", analytics, ["sales_lb", "margin_percent"])}
  `;
}

function inventoryTab(analytics) {
  const inventory = analytics.inventory || {};
  const planning = analytics.planning || {};
  return `
    <div class="detail-grid inventory-grid">
      ${analysisListCard("Inventory position", [
        ["On hand", `${quantity(inventory.on_hand_lb)} lb`],
        ["Reserved", `${quantity(inventory.reserved_lb)} lb`],
        ["Available", `${quantity(inventory.available_lb)} lb`],
        ["Incoming", `${quantity(inventory.incoming_lb)} lb`],
        ["Committed", `${quantity(inventory.committed_lb)} lb`],
        ["Position", `${quantity(inventory.inventory_position_lb)} lb`]
      ])}
      ${analysisListCard("Replenishment plan", [
        ["Lead time", `${quantity(planning.lead_time_days)} days`],
        ["Demand during lead", `${quantity(planning.demand_during_lead_time)} lb`],
        ["Safety stock", `${quantity(planning.safety_stock_lb)} lb`],
        ["Reorder point", `${quantity(planning.reorder_point_lb)} lb`],
        ["Recommended quantity", `${quantity(planning.recommended_order_lb)} lb`],
        ["Target stock", `${quantity(planning.target_stock_lb)} lb`]
      ])}
      ${analysisListCard("Stock coverage", [
        ["Weeks of supply", quantity(analytics.summary.weeks_of_supply)],
        ["Expected stockout", planning.expected_stockout_days ? `${quantity(planning.expected_stockout_days)} days` : "No demand estimate"],
        ["Inventory value", money(inventory.inventory_value)],
        ["Average inventory cost", `${money(inventory.avg_inventory_cost_per_lb)}/lb`],
        ["Active lots", quantity(inventory.active_lots)],
        ["Status", friendlyStatus(planning.status)]
      ])}
    </div>
    ${expirationTable(analytics.expiration || [])}
  `;
}

function demandTab(analytics) {
  const demand = analytics.demand || {};
  return `
    <div class="detail-grid">
      ${analysisListCard("Demand profile", [
        ["Weighted weekly demand", `${quantity(demand.weighted_weekly_demand)} lb`],
        ["Historical weekly average", `${quantity(demand.average_weekly_demand)} lb`],
        ["Weekly standard deviation", `${quantity(demand.std_weekly_demand)} lb`],
        ["Average daily demand", `${quantity(demand.average_daily_demand)} lb`],
        ["Average days between orders", quantity(demand.average_days_between_orders)],
        ["Current direction", demand.demand_direction || "Stable"]
      ])}
      <div class="analysis-card insight-card">
        <span class="eyebrow">Recent behavior</span>
        <h3>${signedPercent(demand.demand_trend_percent)}</h3>
        <p>Change in the recent four-week average compared with the preceding four weeks.</p>
      </div>
    </div>
    ${timelinePanel("Weekly demand", analytics, ["sales_lb", "moving_average_4w"])}
  `;
}

function financialTab(analytics) {
  const financial = analytics.financial || {};
  return `
    <div class="detail-grid financial-grid">
      ${analysisListCard("Price", [
        ["Weighted price/lb", money(financial.weighted_price_per_lb)],
        ["Average price/lb", money(financial.average_price_per_lb)],
        ["Price standard deviation", money(financial.std_price_per_lb)],
        ["Winsorized average", money(financial.winsorized_average_price_per_lb)],
        ["Winsorized deviation", money(financial.winsorized_std_price_per_lb)]
      ])}
      ${analysisListCard("Cost", [
        ["Weighted cost/lb", money(financial.weighted_cost_per_lb)],
        ["Average cost/lb", money(financial.average_cost_per_lb)],
        ["Cost standard deviation", money(financial.std_cost_per_lb)],
        ["Winsorized average", money(financial.winsorized_average_cost_per_lb)],
        ["Winsorized deviation", money(financial.winsorized_std_cost_per_lb)]
      ])}
      ${analysisListCard("Order volume", [
        ["Average order", `${quantity(financial.average_order_volume_lb)} lb`],
        ["Order standard deviation", `${quantity(financial.std_order_volume_lb)} lb`],
        ["Median order", `${quantity(financial.median_order_volume_lb)} lb`],
        ["Winsorized average", `${quantity(financial.winsorized_average_order_volume_lb)} lb`],
        ["Winsorized deviation", `${quantity(financial.winsorized_std_order_volume_lb)} lb`]
      ])}
    </div>
    <div class="outlier-note ${financial.winsorization_available ? "ready" : ""}">
      <strong>${financial.winsorization_available ? "Outlier adjustment available" : "Raw analysis shown"}</strong>
      <span>${financial.winsorization_available ? "The cleaned metrics cap values at the 5th and 95th percentiles without changing source data." : "At least 20 observations are required before winsorized statistics are used."}</span>
    </div>
    ${timelinePanel("Price, cost, and margin", analytics, ["price_per_lb", "cost_per_lb", "margin_percent"])}
  `;
}

function comparisonTab(analytics) {
  return `
    <div class="comparison-controls">
      <label><span>Primary metric</span><select id="comparePrimary">${comparisonOptions("margin_percent")}</select></label>
      <label><span>Compare with</span><select id="compareSecondary">${comparisonOptions("sales_lb")}</select></label>
    </div>
    <div id="comparisonChart">${comparisonChart(analytics, "margin_percent", "sales_lb")}</div>
  `;
}

function bindComparisonControls(panel, analytics) {
  const primary = panel.querySelector("#comparePrimary");
  const secondary = panel.querySelector("#compareSecondary");
  const chart = panel.querySelector("#comparisonChart");
  const draw = () => chart.innerHTML = comparisonChart(analytics, primary.value, secondary.value);
  primary.addEventListener("change", draw);
  secondary.addEventListener("change", draw);
}

function comparisonOptions(selected) {
  return [
    ["margin_percent", "Gross margin"],
    ["sales_lb", "Sales volume"],
    ["price_per_lb", "Selling price"],
    ["cost_per_lb", "Product cost"],
    ["profit_per_lb", "Profit per pound"]
  ].map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
}

function comparisonChart(analytics, primary, secondary) {
  return timelinePanel("Metric comparison", analytics, [primary, secondary]);
}

function timelinePanel(title, analytics, keys) {
  const margin = (analytics.financial || {}).margin_timeline || [];
  const weekly = (analytics.demand || {}).weekly_timeline || [];
  const dates = Array.from(new Set([...margin.map((row) => row.date), ...weekly.map((row) => row.date)])).sort();
  const marginByDate = Object.fromEntries(margin.map((row) => [row.date, row]));
  const weeklyByDate = Object.fromEntries(weekly.map((row) => [row.date, row]));
  const points = dates.map((date) => ({ date, ...(weeklyByDate[date] || {}), ...(marginByDate[date] || {}) }));
  return `
    <div class="analysis-card chart-panel">
      <div class="section-heading"><div><span class="eyebrow">Timeline</span><h3>${escapeHtml(title)}</h3></div></div>
      ${lineChart(points, keys)}
      <div class="chart-legend">${keys.map((key, index) => `<span><i class="series-${index + 1}"></i>${metricLabel(key)}</span>`).join("")}</div>
    </div>
  `;
}

function lineChart(points, keys) {
  const usable = points.filter((point) => keys.some((key) => Number.isFinite(Number(point[key]))));
  if (!usable.length) return emptyState("No timeline yet", "Completed sales and purchase history will create this chart.");

  const width = 920;
  const height = 300;
  const left = 54;
  const right = 24;
  const top = 24;
  const bottom = 42;
  const x = (index) => left + index / Math.max(1, usable.length - 1) * (width - left - right);

  const series = keys.map((key) => {
    const values = usable.map((point) => Number(point[key])).filter(Number.isFinite);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);
    const y = (value) => height - bottom - (Number(value || 0) - min) / Math.max(0.0001, max - min) * (height - top - bottom);
    return usable.map((point, index) => Number.isFinite(Number(point[key])) ? `${x(index)},${y(point[key])}` : null).filter(Boolean).join(" ");
  });

  const firstDate = usable[0].date;
  const lastDate = usable[usable.length - 1].date;
  return `
    <svg class="report-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(keys.map(metricLabel).join(" and "))} timeline">
      <line class="chart-axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"></line>
      ${series.map((polyline, index) => polyline ? `<polyline class="chart-series series-${index + 1}" points="${polyline}" fill="none" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></polyline>` : "").join("")}
      <text x="${left}" y="${height - 13}">${escapeHtml(formatShortDate(firstDate))}</text>
      <text text-anchor="end" x="${width - right}" y="${height - 13}">${escapeHtml(formatShortDate(lastDate))}</text>
    </svg>
  `;
}

function expirationTable(rows) {
  return `
    <div class="analysis-card chart-panel">
      <div class="section-heading"><div><span class="eyebrow">Lots</span><h3>Expiration risk</h3></div></div>
      ${rows.length ? table([
        { label: "Expiration", render: (row) => formatShortDate(row.expiration_date) },
        { label: "Days left", render: (row) => quantity(row.days_remaining) },
        { label: "Available", render: (row) => `${quantity(row.available_lb)} lb` },
        { label: "Expected demand", render: (row) => `${quantity(row.expected_demand_before_expiration_lb)} lb` },
        { label: "At risk", render: (row) => `${quantity(row.at_risk_lb)} lb` },
        { label: "Assessment", render: (row) => status(row.risk) }
      ], rows) : emptyState("No near-term expiration", "No available lots expire during the next 30 days.")}
    </div>
  `;
}

function recommendationList(rows) {
  if (!rows.length) return `<p class="muted">No immediate action is indicated by current inventory, demand, margin, or expiration data.</p>`;
  return `<div class="recommendation-list">${rows.slice(0, 5).map((row) => `<div><strong>${escapeHtml(row.action)}</strong><span>${escapeHtml(row.reason)}</span></div>`).join("")}</div>`;
}

function analysisListCard(title, rows) {
  return `<div class="analysis-card"><span class="eyebrow">Analysis</span><h3>${escapeHtml(title)}</h3><dl class="compact-list">${rows.map(([label, value]) => definition(label, value)).join("")}</dl></div>`;
}

function definition(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value ?? ""))}</dd></div>`;
}

function metricCard(label, value, note, tone = "") {
  return `<article class="metric-card ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value ?? ""))}</strong><small>${escapeHtml(note || "")}</small></article>`;
}

function productSubtitle(analytics) {
  const parts = [];
  if (analytics.summary.last_sale_date) parts.push(`Last sale ${formatShortDate(analytics.summary.last_sale_date)}`);
  if (analytics.summary.last_purchase_date) parts.push(`Last purchase ${formatShortDate(analytics.summary.last_purchase_date)}`);
  return parts.length ? parts.join(" · ") : "Current product analysis";
}

function friendlyStatus(value) {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "REORDER") return "Reorder now";
  if (normalized === "WATCH") return "Approaching reorder";
  if (normalized === "EXCESS") return "Excess inventory";
  if (normalized === "HEALTHY" || normalized === "OK") return "Healthy";
  return value || "Not available";
}

function statusTone(value) {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "REORDER") return "danger";
  if (normalized === "WATCH" || normalized === "EXCESS") return "warn";
  return "good";
}

function metricLabel(key) {
  return ({
    sales_lb: "Sales volume",
    moving_average_4w: "4-week average",
    price_per_lb: "Selling price/lb",
    cost_per_lb: "Cost/lb",
    profit_per_lb: "Profit/lb",
    margin_percent: "Gross margin"
  })[key] || key;
}

function money(value) {
  return formatMoney(Number(value || 0));
}

function quantity(value) {
  return formatQuantity(Number(value || 0), { maximumFractionDigits: 1 });
}

function percent(value) {
  return `${formatQuantity(Number(value || 0) * 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function signedPercent(value) {
  const number = Number(value || 0) * 100;
  return `${number > 0 ? "+" : ""}${formatQuantity(number, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "now" : date.toLocaleString();
}

function formatShortDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function emptyState(title, body) {
  return `<div class="report-empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(body)}</p></div>`;
}

function ensureStyles() {
  let style = document.getElementById("productReportStylesV3");
  if (!style) {
    style = document.createElement("style");
    style.id = "productReportStylesV3";
    document.head.appendChild(style);
  }
  style.textContent = `
    .product-reports-page { display:grid; gap:16px; }
    .report-toolbar { align-items:center; display:flex; justify-content:space-between; padding:18px; }
    .report-toolbar h2 { margin:3px 0 2px; }
    .eyebrow { color:#68776c; display:block; font-size:11px; font-weight:850; letter-spacing:.06em; text-transform:uppercase; }
    .product-picker { display:grid; gap:5px; min-width:min(340px,100%); }
    .product-picker span,.comparison-controls span { color:#68776c; font-size:11px; font-weight:850; text-transform:uppercase; }
    .product-picker select,.comparison-controls select { background:#fff; border:1px solid #cfdad2; border-radius:10px; color:#17211b; font:inherit; min-height:42px; padding:0 12px; }
    .metric-grid { display:grid; gap:10px; grid-template-columns:repeat(6,minmax(0,1fr)); }
    .metric-card { background:#fff; border:1px solid #d8e1da; border-radius:12px; padding:14px; }
    .metric-card span { color:#68776c; display:block; font-size:11px; font-weight:800; text-transform:uppercase; }
    .metric-card strong { color:#17211b; display:block; font-size:22px; letter-spacing:-.025em; margin:7px 0 4px; }
    .metric-card small { color:#6c796f; display:block; font-size:12px; line-height:1.35; }
    .metric-card.warn { background:#fff9ed; border-color:#ecd39d; }
    .metric-card.danger { background:#fff1f0; border-color:#efc0bd; }
    .metric-card.good { background:#eef8f2; border-color:#c9e2d2; }
    .overview-grid { display:grid; gap:14px; grid-template-columns:repeat(2,minmax(0,1fr)); }
    .ranking-panel { padding:16px; }
    .section-heading { align-items:flex-start; display:flex; justify-content:space-between; margin-bottom:12px; }
    .section-heading h3 { margin:3px 0 0; }
    .count-pill { background:#edf4ef; border-radius:999px; color:#226b3d; font-size:12px; font-weight:850; padding:6px 9px; }
    .ranking-list { display:grid; }
    .ranking-row { align-items:center; border-top:1px solid #edf0ee; display:grid; gap:10px; grid-template-columns:34px minmax(0,1fr) auto; min-height:58px; }
    .ranking-row:first-child { border-top:0; }
    .rank-number,.expiry-days { align-items:center; background:#eef5f0; border-radius:50%; color:#226b3d; display:flex; font-size:12px; font-weight:900; height:28px; justify-content:center; width:28px; }
    .expiry-days { border-radius:8px; width:38px; }
    .expiry-days.urgent { background:#fde8e6; color:#a8322d; }
    .rank-name strong,.rank-name small { display:block; }
    .rank-name small { color:#708077; font-size:11px; margin-top:3px; }
    .rank-value { font-size:13px; font-weight:850; text-align:right; }
    .product-detail-panel { overflow:hidden; padding:0; }
    .product-tabs { border-bottom:1px solid #d8e1da; display:flex; gap:3px; overflow:auto; padding:10px 12px 0; }
    .product-tabs button { background:transparent; border:0; border-bottom:3px solid transparent; color:#65736a; cursor:pointer; font:inherit; font-size:13px; font-weight:800; padding:10px 14px; }
    .product-tabs button.selected { border-color:#226b3d; color:#1d5d37; }
    #productTabContent { display:grid; gap:14px; padding:16px; }
    .detail-grid { display:grid; gap:12px; grid-template-columns:repeat(3,minmax(0,1fr)); }
    .analysis-card { background:#fff; border:1px solid #d8e1da; border-radius:12px; padding:15px; }
    .analysis-card h3 { margin:5px 0 12px; }
    .compact-list { display:grid; gap:0; margin:0; }
    .compact-list div { align-items:center; border-top:1px solid #edf0ee; display:flex; justify-content:space-between; min-height:38px; }
    .compact-list div:first-child { border-top:0; }
    .compact-list dt { color:#68776c; font-size:12px; }
    .compact-list dd { font-size:13px; font-weight:850; margin:0; text-align:right; }
    .recommendation-list { display:grid; gap:8px; }
    .recommendation-list div { background:#f7faf8; border-radius:9px; padding:10px; }
    .recommendation-list strong,.recommendation-list span { display:block; }
    .recommendation-list span { color:#68776c; font-size:12px; line-height:1.4; margin-top:3px; }
    .chart-panel { padding:15px; }
    .report-chart { background:#fbfcfb; border:1px solid #e1e7e2; border-radius:10px; height:auto; width:100%; }
    .report-chart text { fill:#718078; font-size:11px; }
    .chart-axis { stroke:#cbd5cd; }
    .chart-series.series-1,.chart-legend .series-1 { stroke:#226b3d; background:#226b3d; }
    .chart-series.series-2,.chart-legend .series-2 { stroke:#8b6b2c; background:#8b6b2c; }
    .chart-series.series-3,.chart-legend .series-3 { stroke:#5b65a8; background:#5b65a8; }
    .chart-legend { display:flex; flex-wrap:wrap; gap:14px; margin-top:9px; }
    .chart-legend span { align-items:center; color:#65736a; display:flex; font-size:11px; gap:6px; }
    .chart-legend i { border-radius:999px; display:inline-block; height:3px; width:20px; }
    .comparison-controls { display:flex; flex-wrap:wrap; gap:12px; }
    .comparison-controls label { display:grid; gap:5px; min-width:220px; }
    .outlier-note { background:#f7faf8; border:1px solid #d8e1da; border-radius:10px; display:grid; gap:3px; padding:12px; }
    .outlier-note.ready { background:#eef8f2; border-color:#c9e2d2; }
    .outlier-note strong { font-size:13px; }
    .outlier-note span { color:#68776c; font-size:12px; }
    .report-empty-state { align-content:center; background:#f8fbf9; border:1px dashed #bdcbc1; border-radius:10px; color:#65736a; display:grid; justify-items:center; min-height:145px; padding:20px; text-align:center; }
    .report-empty-state strong { color:#17211b; font-size:16px; }
    .report-empty-state p { margin:6px 0 0; max-width:520px; }
    @media (max-width:1100px) { .metric-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } .detail-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media (max-width:760px) { .report-toolbar { align-items:stretch; flex-direction:column; gap:14px; } .overview-grid,.detail-grid { grid-template-columns:1fr; } .metric-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .product-picker { min-width:0; } }
    @media (max-width:480px) { .metric-grid { grid-template-columns:1fr; } }
  `;
}
