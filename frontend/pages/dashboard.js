import { getDashboard, getOperationalReports } from "../js/api-smooth1.js?v=data-audit1";
import { can } from "../js/permissions.js";
import { escapeHtml, formatMoney, formatQuantity, table } from "../js/utils.js?v=readiness1";

export async function render(ctx) {
  const isAdmin = can(ctx.user, "admin:view");
  const [dashboardMetrics, reportData] = await Promise.all([
    getDashboard(),
    isAdmin ? getOperationalReports() : Promise.resolve(null)
  ]);
  const metrics = isAdmin ? mergeReportMetrics(dashboardMetrics, reportData) : dashboardMetrics;
  if (!isAdmin) {
    renderOperationalDashboard(ctx, metrics);
    return;
  }

  ctx.setTitle("Admin Dashboard", "Live inventory, purchasing, and warehouse exceptions");
  ctx.view.innerHTML = `
    <div class="dashboard-layout">
      <section class="dashboard-metrics" aria-label="Administrative quick metrics">
        ${metricCard("Total Inventory Value", money(metrics.totalInventoryValue), "On-hand inventory valued at current lot cost")}
        ${metricCard("Low Stock Products", number(metrics.lowStockCount), metrics.lowStockDetail || `${number(metrics.usageHistoryNeededCount)} still need usage history`, "attention")}
        ${metricCard("Expiring in Next 30 Days", number(metrics.expiringLotCount), `${number(metrics.expiringProductCount)} products | ${money(metrics.expiringInventoryValue)} at risk`, "attention")}
        ${metricCard("Open Purchase Orders", number(metrics.openPoCount), `${money(metrics.openPoValue)} currently open`)}
        ${metricCard("Open Sales Orders", number(metrics.openSoCount), `${money(metrics.openSoValue)} currently open`)}
        ${placeholderCard("Accounts Payable", "Vendor invoice and payment data is not connected yet")}
        ${placeholderCard("Accounts Receivable", "Customer invoice and payment data is not connected yet")}
        ${metricCard("Sales in Last 7 Days", money(metrics.weeklySales), "Shipped Sales Orders during the last 7 days")}
        ${metrics.topProfitProduct
          ? metricCard("Top Product by Gross Profit", metrics.topProfitProduct.product_name, `${money(metrics.topProfitProduct.gross_profit)} profit | ${number(metrics.topProfitProduct.gross_margin_percent)}% margin`)
          : placeholderCard("Top Product by Gross Profit", "No shipped Sales Orders yet")}
        ${capacityCard(metrics)}
      </section>

      <section class="dashboard-exceptions">
        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>Low Stock Exceptions</h2>
              <p class="muted">Demand-based reorder alerts with usage history.</p>
            </div>
          </div>
          ${table([
            { label: "Product", render: (row) => `${escapeHtml(row.product_name)}<br><small>${escapeHtml(row.product_id)}</small>` },
            { label: "On Hand", render: (row) => number(row.current_qty) },
            { label: "Daily Use", render: (row) => number(row.average_daily_usage) },
            { label: "Reorder Point", render: (row) => number(row.reorder_point) },
            { label: "Days Cover", render: (row) => row.days_of_supply === null || row.days_of_supply === undefined ? "—" : `${number(row.days_of_supply)} days` },
            { label: "Order Qty", render: (row) => number(row.recommended_order_qty) }
          ], metrics.lowStockProducts || [])}
        </div>

        <div class="panel">
          <div class="panel-header">
            <div>
              <h2>Expiration Risk</h2>
              <p class="muted">Positive inventory expiring within the next 30 days.</p>
            </div>
          </div>
          ${table([
            { label: "Product", render: (row) => escapeHtml(row.product_name) },
            { label: "Lot", render: (row) => escapeHtml(row.internal_lot_id) },
            { label: "On Hand", render: (row) => `${number(row.current_qty)} ${escapeHtml(row.unit_type)}` },
            { label: "Location", render: (row) => escapeHtml(row.location_id) },
            { label: "Expires", render: (row) => escapeHtml(row.expiration_date) },
            { label: "Days", render: (row) => number(row.days_remaining) },
            { label: "Value at Risk", render: (row) => money(row.inventory_value) }
          ], metrics.expiringLots || [], { emptyMessage: "No inventory expires within the next 30 days." })}
        </div>
      </section>
    </div>
  `;
}

function mergeReportMetrics(metrics, reports) {
  const analytics = Object.values(reports?.productAnalytics || {});
  if (!analytics.length) return metrics;

  const lowStockProducts = analytics
    .filter((row) => Number(row.summary?.weekly_demand || 0) > 0
      && Number(row.summary?.inventory_position || 0) <= Number(row.planning?.reorder_point || 0))
    .map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      current_qty: Number(row.summary?.available_inventory || 0),
      average_daily_usage: Number(row.summary?.weekly_demand || 0) / 7,
      reorder_point: Number(row.planning?.reorder_point || 0),
      days_of_supply: row.summary?.weeks_of_supply === null || row.summary?.weeks_of_supply === undefined
        ? null
        : Number(row.summary.weeks_of_supply) * 7,
      recommended_order_qty: Number(row.planning?.recommended_purchase_lb || 0)
    }))
    .sort((a, b) => a.days_of_supply === null ? 1 : b.days_of_supply === null ? -1 : a.days_of_supply - b.days_of_supply);

  const topProfit = analytics
    .filter((row) => row.financial?.estimated_gross_profit !== null
      && row.financial?.estimated_gross_profit !== undefined
      && Number.isFinite(Number(row.financial.estimated_gross_profit)))
    .sort((a, b) => Number(b.financial.estimated_gross_profit) - Number(a.financial.estimated_gross_profit))[0];

  return {
    ...metrics,
    lowStockCount: lowStockProducts.length,
    lowStockDetail: "Calculated from Sales Order demand and current inventory",
    lowStockProducts,
    topProfitProduct: topProfit ? {
      product_name: topProfit.product_name,
      gross_profit: Number(topProfit.financial.estimated_gross_profit || 0),
      gross_margin_percent: Number(topProfit.summary?.gross_margin_percent || 0)
    } : metrics.topProfitProduct
  };
}

function renderOperationalDashboard(ctx, metrics) {
  ctx.setTitle("Dashboard", "Current operational totals");
  ctx.view.innerHTML = `
    <div class="cards">
      ${metricCard("Products", number(metrics.productCount), "Active product catalog")}
      ${metricCard("Customers & Vendors", number(metrics.supplierCount), "Business directory")}
      ${metricCard("Open POs", number(metrics.openPoCount), "Purchase orders requiring completion")}
      ${metricCard("Lots", number(metrics.lotCount), "Tracked inventory lots")}
    </div>
  `;
}

function metricCard(label, value, detail, tone = "") {
  return `
    <article class="dashboard-metric${tone ? ` dashboard-metric--${tone}` : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function placeholderCard(label, detail) {
  return `
    <article class="dashboard-metric dashboard-metric--placeholder">
      <span>${escapeHtml(label)}</span>
      <strong aria-label="Data not connected">—</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `;
}

function capacityCard(metrics) {
  const percent = Math.max(0, Math.min(100, Number(metrics.warehouseCapacityPercent || 0)));
  return `
    <article class="dashboard-metric dashboard-metric--capacity">
      <span>Warehouse Locations Used</span>
      <strong>${escapeHtml(`${number(percent)}%`)}</strong>
      <div class="capacity-bar" aria-label="Warehouse capacity ${escapeHtml(number(percent))} percent">
        <span style="width: ${percent}%"></span>
      </div>
      <small>${escapeHtml(`${number(metrics.warehouseOccupiedPositions)} of ${number(metrics.warehouseTotalPositions)} active locations contain inventory`)}</small>
    </article>
  `;
}

function money(value) {
  return formatMoney(value);
}

function number(value) {
  return formatQuantity(value, { maximumFractionDigits: 1 });
}
