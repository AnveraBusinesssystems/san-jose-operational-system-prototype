import { getOperationalReports } from "../js/api-smooth1.js?v=parties1";
import { enableTableFilters, escapeHtml, formatMoney, formatQuantity, status, table } from "../js/utils.js";

const REPORT_BLOCKS = [
  {
    id: "planning",
    title: "Inventory Planning",
    subtitle: "Current LB, inventory value, and planning readiness.",
    metric: "Products reviewed"
  },
  {
    id: "suppliers",
    title: "Supplier Analytics",
    subtitle: "Vendor spend, order count, quality, and contact details.",
    metric: "Suppliers reviewed"
  },
  {
    id: "recommendations",
    title: "Recommendations",
    subtitle: "Reorder actions only after enough movement history exists.",
    metric: "Suggested actions"
  },
  {
    id: "snapshot",
    title: "Inventory Snapshot",
    subtitle: "Active lots currently in inventory by location.",
    metric: "Active lots"
  }
];

export async function render(ctx) {
  ensureReportStyles();
  ctx.setTitle("Reports", "Inventory planning, supplier analytics, and lot-level stock");
  const reports = await getOperationalReports();
  const initialReport = chooseInitialReport(reports);

  ctx.view.innerHTML = `
    <div class="reports-page">
      <section class="panel reports-overview">
        <div class="panel-header reports-header">
          <div>
            <h2>Reports</h2>
            <p class="muted">Updated ${formatDate(reports.calculated_at)}</p>
          </div>
          <div class="reports-health-pill">${healthSummary(reports)}</div>
        </div>

        <div class="formula-strip" aria-label="Inventory planning formula summary">
          <div><span>Current LB</span><strong>Sum of active lots on hand</strong></div>
          <div><span>Inventory Value</span><strong>LB × calculated cost per LB</strong></div>
          <div><span>Cost Rule</span><strong>Case cost ÷ LB per case</strong></div>
          <div><span>Planning</span><strong>Locked until real usage history exists</strong></div>
        </div>

        <div class="report-summary-grid">
          ${REPORT_BLOCKS.map((block) => reportBlockButton(block, reports)).join("")}
        </div>
      </section>
      <section id="reportDetail" class="panel report-detail-panel"></section>
    </div>
  `;

  const detail = document.getElementById("reportDetail");
  const showReport = (id) => {
    detail.innerHTML = reportDetail(id, reports);
    enableTableFilters(detail);
    enableProductAnalytics(detail, reports);
    document.querySelectorAll("[data-report-block]").forEach((button) => {
      button.classList.toggle("selected", button.dataset.reportBlock === id);
    });
  };

  document.querySelectorAll("[data-report-block]").forEach((button) => {
    button.addEventListener("click", () => showReport(button.dataset.reportBlock));
  });
  showReport(initialReport);
}

function chooseInitialReport(reports) {
  if ((reports.inventoryPlanning || []).length || (reports.recommendations || []).length) return "planning";
  if ((reports.supplierAnalytics || []).length) return "suppliers";
  return "snapshot";
}

function healthSummary(reports) {
  const valueRows = reports.inventoryValueByProduct || [];
  const inventoryValue = valueRows.reduce((sum, row) => sum + Number(row.total_inventory_value || row.inventory_value || 0), 0);
  const notReady = countStatus(reports.inventoryPlanning || [], "NOT_READY");
  const reorder = countStatus(reports.inventoryPlanning || [], "REORDER");
  const watch = countStatus(reports.inventoryPlanning || [], "WATCH");
  if (reorder) return `${reorder} reorder alert${reorder === 1 ? "" : "s"}`;
  if (watch) return `${watch} watch item${watch === 1 ? "" : "s"}`;
  if (inventoryValue) return `${money(inventoryValue)} inventory value · ${notReady} planning not ready`;
  return "No reorder alerts";
}

function reportBlockButton(block, reports) {
  return `
    <button class="report-summary-card" data-report-block="${block.id}" type="button">
      <span class="report-card-label">${escapeHtml(block.metric)}</span>
      <strong>${reportCount(block.id, reports)}</strong>
      <h3>${escapeHtml(block.title)}</h3>
      <small>${escapeHtml(block.subtitle)}</small>
      <em>Open report</em>
    </button>
  `;
}

function reportCount(id, reports) {
  if (id === "planning") return (reports.inventoryPlanning || []).length;
  if (id === "suppliers") return (reports.supplierAnalytics || []).length;
  if (id === "recommendations") return (reports.recommendations || []).length;
  return (reports.inventorySnapshot || []).length;
}

function reportDetail(id, reports) {
  if (id === "suppliers") return supplierAnalytics(reports);
  if (id === "recommendations") return recommendations(reports);
  if (id === "snapshot") return inventorySnapshot(reports);
  return inventoryPlanning(reports);
}

function inventoryPlanning(reports) {
  const rows = reports.inventoryPlanning || [];
  const totalLb = rows.reduce((sum, row) => sum + Number(row.current_qty || row.total_qty_lb || 0), 0);
  const totalValue = rows.reduce((sum, row) => sum + Number(row.total_inventory_value || row.inventory_value || 0), 0);
  return `
    <div class="panel-header report-detail-heading">
      <div>
        <h2>Inventory Planning Metrics</h2>
        <p class="muted">Current inventory value shows now. Reorder math stays blank until real sales/pick history exists.</p>
      </div>
      <div class="actions">
        <span class="status ok">${quantity(totalLb)} LB</span>
        <span class="status ok">${money(totalValue)}</span>
      </div>
    </div>
    <div class="formula-note">
      <strong>How this works:</strong>
      Historical opening inventory cost is treated as cost per purchase unit/case. The backend converts it to cost per LB before calculating inventory value. Avg Daily Usage, Avg Lead, Demand During Lead, Safety Stock, Reorder Point, Target Stock, and Recommended Qty are intentionally blank until the product has real outbound movement history.
    </div>
    <div id="productAnalyticsPanel" class="product-analytics-panel" hidden></div>
    ${rows.length ? table([
      { label: "Product", render: productWithAnalyticsButton },
      { label: "Current LB", render: (row) => quantity(row.current_qty || row.total_qty_lb) },
      { label: "Inventory Value", render: (row) => money(row.total_inventory_value || row.inventory_value) },
      { label: "Avg Cost/LB", render: (row) => money(row.avg_cost_per_lb) },
      { label: "Active Lots", render: (row) => quantity(row.active_lots) },
      { label: "Sales/Pick History", render: (row) => `${quantity(row.usage_movements_found || 0)} movements<br><small>${quantity(row.usage_days_found || 0)} usage days</small>` },
      { label: "Sales Price Points", render: (row) => quantity(row.sales_price_points || 0) },
      { label: "Avg Daily Usage", render: (row) => quantity(row.average_daily_usage) },
      { label: "Avg Lead", render: (row) => quantity(row.avg_lead_time_days) },
      { label: "Demand During Lead", render: (row) => quantity(row.demand_during_lead_time) },
      { label: "Safety Stock", render: (row) => quantity(row.safety_stock) },
      { label: "Reorder Point", render: (row) => quantity(row.reorder_point) },
      { label: "Target Stock", render: (row) => quantity(row.target_stock_level) },
      { label: "Recommended Qty", render: (row) => quantity(row.recommended_order_qty) },
      { label: "Status", render: (row) => status(row.planning_status || row.status) },
      { label: "Reason", render: (row) => escapeHtml(row.reason || "") }
    ], rows) : emptyState("No inventory planning rows yet", "Receive product or add it from Rack Inventory to build the current inventory value report.")}
  `;
}

function productWithAnalyticsButton(row) {
  return `
    <div class="product-planning-cell">
      <button class="analytics-button" type="button" data-product-analytics="${escapeHtml(row.product_id)}">Analytics</button>
      <span>${escapeHtml(row.product_name)}<br><small>${escapeHtml(row.product_id)}</small></span>
    </div>
  `;
}

function supplierAnalytics(reports) {
  const rows = reports.supplierAnalytics || [];
  return `
    <div class="panel-header report-detail-heading">
      <div>
        <h2>Supplier Analytics</h2>
        <p class="muted">Vendor performance and buying history from purchase orders and receiving.</p>
      </div>
    </div>
    ${rows.length ? table([
      { label: "Supplier", render: supplierName },
      { label: "Contact", render: (row) => contact(row) },
      { label: "Products Bought", render: (row) => escapeHtml(row.products_bought || "No product history") },
      { label: "Orders", render: (row) => quantity(row.total_orders) },
      { label: "Completed", render: (row) => quantity(row.completed_orders) },
      { label: "Purchase Amount", render: (row) => money(row.total_purchase_amount) },
      { label: "Spend Share", render: (row) => percent(row.spend_share_percent) },
      { label: "Avg Lead", render: (row) => quantity(row.avg_lead_time_days) },
      { label: "Quality", render: (row) => percent(row.quality_percent) },
      { label: "Product Accuracy", render: (row) => percent(row.product_accuracy_percent) },
      { label: "Qty Accuracy", render: (row) => percent(row.quantity_accuracy_percent) }
    ], rows) : emptyState("No supplier analytics yet", "Create purchase orders and receiving records to build supplier performance history.")}
  `;
}

function recommendations(reports) {
  const rows = reports.recommendations || [];
  return `
    <div class="panel-header report-detail-heading">
      <div>
        <h2>Recommendations</h2>
        <p class="muted">Suggested purchase actions generated only when planning has enough history.</p>
      </div>
    </div>
    ${rows.length ? table([
      { label: "Action", key: "recommendation_type" },
      { label: "Product", render: (row) => `${escapeHtml(row.product_name)}<br><small>${escapeHtml(row.product_id)}</small>` },
      { label: "Supplier", render: (row) => escapeHtml(row.supplier_name || row.supplier_id || "No supplier history") },
      { label: "Recommended Qty", render: (row) => quantity(row.recommended_qty) },
      { label: "Reorder Point", render: (row) => quantity(row.reorder_point) },
      { label: "Target", render: (row) => quantity(row.target_stock_level) },
      { label: "Confidence", render: (row) => percent(Number(row.confidence_score || 0) * 100) },
      { label: "Reason", key: "reason_text" }
    ], rows) : emptyState("No recommendations right now", "This is expected while the system only has opening inventory or not enough sales/pick history.")}
  `;
}

function inventorySnapshot(reports) {
  const rows = reports.inventorySnapshot || [];
  return `
    <div class="panel-header report-detail-heading">
      <div>
        <h2>Inventory Snapshot</h2>
        <p class="muted">Active lots currently available by product, lot, and location.</p>
      </div>
      <span class="status ok">${rows.length} active lots</span>
    </div>
    ${rows.length ? table([
      { label: "Product", render: (row) => `${escapeHtml(row.product?.product_name || row.product_name || row.product_id)}<br><small>${escapeHtml(row.product_id)}</small>` },
      { label: "Lot", render: (row) => escapeHtml(row.internal_lot_id || "") },
      { label: "Location", render: (row) => escapeHtml(row.location_id || "") },
      { label: "Qty", render: (row) => quantity(row.current_qty ?? row.qty ?? 0) },
      { label: "Unit", key: "unit_type" },
      { label: "Purchase Unit Cost", render: (row) => money(row.purchase_unit_cost || row.lot?.unit_cost || 0) },
      { label: "Cost/LB", render: (row) => money(row.cost_per_lb || row.unit_cost || 0) },
      { label: "Inventory Value", render: (row) => money(row.inventory_value || 0) },
      { label: "Status", render: (row) => status(row.value_status || row.inventory_status || "AVAILABLE") },
      { label: "Days Since Received", render: (row) => quantity(row.days_since_received ?? "") }
    ], rows) : emptyState("No active lots found", "Receive product or add it from Rack Inventory to build the stock snapshot.")}
  `;
}

function enableProductAnalytics(root, reports) {
  root.querySelectorAll("[data-product-analytics]").forEach((button) => {
    button.addEventListener("click", () => showProductAnalytics(button.dataset.productAnalytics, reports));
  });
}

function showProductAnalytics(productId, reports) {
  const panel = document.getElementById("productAnalyticsPanel");
  if (!panel) return;
  const analytics = (reports.productPriceAnalytics || {})[productId];
  if (!analytics) return;
  panel.hidden = false;
  panel.innerHTML = `
    <div class="analytics-header">
      <div>
        <small>Product price analytics</small>
        <h3>${escapeHtml(analytics.product_name || productId)}</h3>
        <p class="muted">Average price, standard deviation, histogram, and price trend from Sales Order lines.</p>
      </div>
      <button class="analytics-close" type="button">Close</button>
    </div>
    ${Number(analytics.sales_line_count || 0) ? analyticsBody(analytics) : emptyState("Analytics not ready", "No Sales Order price history exists for this product yet.")}
  `;
  panel.querySelector(".analytics-close")?.addEventListener("click", () => panel.hidden = true);
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function analyticsBody(analytics) {
  return `
    <div class="analytics-kpis">
      <div><span>Average Price</span><strong>${money(analytics.average_price || analytics.avg_sales_price)}</strong></div>
      <div><span>Std Deviation</span><strong>${money(analytics.std_price || analytics.standard_deviation_price)}</strong></div>
      <div><span>Min Price</span><strong>${money(analytics.min_price)}</strong></div>
      <div><span>Max Price</span><strong>${money(analytics.max_price)}</strong></div>
    </div>
    <div class="analytics-chart-grid">
      <div><h4>Price Histogram</h4>${histogramSvg(analytics.histogram || [])}</div>
      <div><h4>Price Trend</h4>${trendSvg(analytics.price_history || [], analytics.trend_line || [])}</div>
    </div>
  `;
}

function histogramSvg(bins) {
  if (!bins.length) return `<div class="analytics-empty-chart">Need sales price points to build a histogram.</div>`;
  const width = 520;
  const height = 240;
  const maxCount = Math.max(...bins.map((bin) => Number(bin.count || 0)), 1);
  return `<svg class="analytics-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Price histogram">
    ${bins.map((bin, index) => {
      const slot = (width - 40) / bins.length;
      const barWidth = Math.max(8, slot - 8);
      const barHeight = (Number(bin.count || 0) / maxCount) * (height - 62);
      const x = 24 + index * slot;
      const y = height - 34 - barHeight;
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4"><title>${money(bin.min)} - ${money(bin.max)} · ${bin.count}</title></rect>`;
    }).join("")}
  </svg>`;
}

function trendSvg(points, trendLine) {
  const parsed = points.map((point) => ({ x: new Date(point.date).getTime(), y: Number(point.price || 0), date: point.date }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!parsed.length) return `<div class="analytics-empty-chart">Need sales price points to build a trend line.</div>`;
  const width = 520;
  const height = 240;
  const minX = Math.min(...parsed.map((point) => point.x));
  const maxX = Math.max(...parsed.map((point) => point.x));
  const minY = Math.min(...parsed.map((point) => point.y));
  const maxY = Math.max(...parsed.map((point) => point.y));
  const sx = (x) => 24 + ((x - minX) / Math.max(1, maxX - minX)) * (width - 48);
  const sy = (y) => height - 34 - ((y - minY) / Math.max(1, maxY - minY)) * (height - 70);
  const polyline = parsed.length > 1 ? `<polyline points="${parsed.map((point) => `${sx(point.x)},${sy(point.y)}`).join(" ")}" fill="none" stroke-width="2"></polyline>` : "";
  const line = trendLine.length >= 2 ? `<line class="trend-line" x1="${sx(new Date(trendLine[0].date).getTime())}" y1="${sy(Number(trendLine[0].price || 0))}" x2="${sx(new Date(trendLine[1].date).getTime())}" y2="${sy(Number(trendLine[1].price || 0))}" stroke-width="3"></line>` : "";
  const dots = parsed.map((point) => `<circle cx="${sx(point.x)}" cy="${sy(point.y)}" r="4"><title>${escapeHtml(point.date)} · ${money(point.y)}</title></circle>`).join("");
  return `<svg class="analytics-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Price trend">${polyline}${line}${dots}</svg>`;
}

function emptyState(title, body) {
  return `
    <div class="report-empty-state">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(body)}</p>
    </div>
  `;
}

function countStatus(rows, value) {
  return (rows || []).filter((row) => row.status === value || row.planning_status === value).length;
}

function supplierName(row) {
  return `${escapeHtml(row.supplier_name)}<br><small>${escapeHtml(row.supplier_id)}</small>`;
}

function contact(row) {
  const parts = [row.email, row.phone].filter(Boolean);
  return parts.length ? parts.map(escapeHtml).join("<br>") : "No contact";
}

function money(value) {
  return formatMoney(value);
}

function quantity(value) {
  if (value === "" || value === null || value === undefined) return "";
  return formatQuantity(value);
}

function percent(value) {
  return `${formatQuantity(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatDate(value) {
  if (!value) return "now";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "now" : date.toLocaleString();
}

function ensureReportStyles() {
  const existing = document.getElementById("reportsPageStyles");
  const style = existing || document.createElement("style");
  style.id = "reportsPageStyles";
  style.textContent = `
    .reports-page { display: grid; gap: 16px; }
    .reports-overview { overflow: hidden; padding: 18px; }
    .reports-header { align-items: flex-start; margin-bottom: 12px; }
    .reports-health-pill { background: #eef7f1; border: 1px solid #cfe3d6; border-radius: 999px; color: #17613f; font-size: 12px; font-weight: 850; padding: 7px 11px; white-space: nowrap; }
    .formula-strip { background: #edf3ef; border: 1px solid var(--line); border-radius: 12px; display: grid; gap: 1px; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 14px; overflow: hidden; }
    .formula-strip div { background: #ffffff; min-height: 70px; padding: 12px 14px; }
    .formula-strip span { color: #667568; display: block; font-size: 11px; font-weight: 850; letter-spacing: .04em; text-transform: uppercase; }
    .formula-strip strong { color: #17211b; display: block; font-size: 13px; line-height: 1.32; margin-top: 6px; }
    .report-summary-grid { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .report-summary-card,
    .card.report-block,
    button.report-block { background: #226b3d !important; border: 1px solid #1f5f37 !important; border-radius: 12px !important; box-shadow: 0 6px 18px rgba(23,33,27,.08) !important; color: #ffffff !important; min-height: 148px; padding: 15px; text-align: left; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
    .report-summary-card:hover,
    .card.report-block:hover,
    button.report-block:hover { background: #267446 !important; border-color: #1b5231 !important; box-shadow: 0 10px 24px rgba(23,33,27,.12) !important; transform: translateY(-1px); }
    .report-summary-card.selected,
    .card.report-block.selected,
    button.report-block.selected { background: #226b3d !important; border-color: #ffffff !important; box-shadow: inset 0 0 0 2px rgba(255,255,255,.75), 0 10px 24px rgba(23,33,27,.12) !important; color: #ffffff !important; }
    .report-summary-card *,
    .card.report-block *,
    button.report-block * { color: #ffffff !important; }
    .report-summary-card strong,
    .card.report-block strong,
    button.report-block strong { color: #ffffff !important; display: block; font-size: 34px; letter-spacing: -.04em; line-height: 1; margin: 8px 0 11px; }
    .report-summary-card h3,
    .card.report-block span,
    button.report-block span { color: #ffffff !important; font-size: 16px; font-weight: 850; line-height: 1.2; margin: 0 0 6px; }
    .report-summary-card small,
    .card.report-block small,
    button.report-block small,
    .report-card-label,
    .report-summary-card em { color: rgba(255,255,255,.88) !important; }
    .report-summary-card small,
    .card.report-block small,
    button.report-block small { display: block; font-size: 12px; line-height: 1.38; min-height: 33px; }
    .report-summary-card em { display: block; font-size: 12px; font-style: normal; font-weight: 850; margin-top: 12px; }
    .report-card-label { display: block; font-size: 11px; font-weight: 850; letter-spacing: .04em; text-transform: uppercase; }
    .report-detail-panel { min-height: 260px; padding: 18px; }
    .report-detail-heading p { margin: 4px 0 0; }
    .formula-note { background: #f8fbf9; border: 1px solid #d8e1da; border-radius: 10px; color: #607064; font-size: 13px; line-height: 1.45; margin-bottom: 14px; padding: 12px 13px; }
    .formula-note strong { color: #17211b; }
    .report-empty-state { align-items: center; background: #f8fbf9; border: 1px dashed #b9cabe; border-radius: 12px; color: #607064; display: grid; justify-items: center; min-height: 190px; padding: 24px; text-align: center; }
    .report-empty-state strong { color: #17211b; font-size: 18px; }
    .report-empty-state p { max-width: 520px; margin: 8px 0 0; }
    .report-detail-panel .table-tools { align-items: center; background: #ffffff; border: 1px solid #d8e1da; border-radius: 12px; margin: 0 0 12px; padding: 10px; }
    .report-detail-panel .table-filter { min-width: min(320px, 100%); }
    .report-detail-panel table { font-size: 13px; }
    .report-detail-panel th { letter-spacing: .04em; }
    .product-planning-cell { align-items: flex-start; display: flex; gap: 10px; min-width: 220px; }
    .analytics-button,
    .analytics-close { background: #f8fbf9; border: 1px solid #b9cabe; border-radius: 999px; color: #226b3d; cursor: pointer; font-size: 11px; font-weight: 850; padding: 6px 9px; white-space: nowrap; }
    .analytics-button:hover,
    .analytics-close:hover { background: #edf3ef; border-color: #226b3d; }
    .product-analytics-panel { background: #ffffff; border: 1px solid #d8e1da; border-radius: 12px; box-shadow: 0 6px 18px rgba(23,33,27,.08); margin-bottom: 14px; padding: 14px; }
    .analytics-header { align-items: flex-start; display: flex; gap: 12px; justify-content: space-between; margin-bottom: 12px; }
    .analytics-header small,
    .analytics-kpis span { color: #667568; display: block; font-size: 11px; font-weight: 850; letter-spacing: .04em; text-transform: uppercase; }
    .analytics-header h3 { margin: 3px 0 2px; }
    .analytics-kpis { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 14px; }
    .analytics-kpis div { background: #f8fbf9; border: 1px solid #d8e1da; border-radius: 10px; padding: 11px 12px; }
    .analytics-kpis strong { color: #17211b; display: block; font-size: 22px; margin-top: 5px; }
    .analytics-chart-grid { display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .analytics-chart-grid h4 { margin: 0 0 8px; }
    .analytics-chart { background: #f8fbf9; border: 1px solid #d8e1da; border-radius: 10px; height: auto; width: 100%; }
    .analytics-chart rect { fill: currentColor; opacity: .45; }
    .analytics-chart circle { fill: currentColor; }
    .analytics-chart polyline { stroke: currentColor; opacity: .55; }
    .analytics-chart .trend-line { stroke: currentColor; opacity: .9; }
    .analytics-empty-chart { align-items: center; background: #f8fbf9; border: 1px dashed #b9cabe; border-radius: 10px; color: #607064; display: grid; justify-items: center; min-height: 180px; padding: 18px; text-align: center; }
    @media (max-width: 1200px) { .report-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .formula-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); } .analytics-kpis, .analytics-chart-grid { grid-template-columns: 1fr; } }
    @media (max-width: 700px) {
      .reports-overview, .report-detail-panel { padding: 14px; }
      .reports-header { gap: 8px; }
      .reports-health-pill { white-space: normal; width: fit-content; }
      .report-summary-grid, .formula-strip { grid-template-columns: 1fr; }
      .formula-strip div { min-height: auto; padding: 11px 12px; }
      .report-summary-card { min-height: 122px; padding: 14px; }
      .report-summary-card strong { font-size: 30px; }
      .report-detail-panel .table-tools { align-items: stretch; display: grid; justify-content: stretch; }
      .report-detail-panel .table-tools label { align-items: stretch; display: grid; width: 100%; }
      .report-detail-panel .table-filter { min-width: 0; width: 100%; }
    }
  `;
  if (!existing) document.head.appendChild(style);
}
