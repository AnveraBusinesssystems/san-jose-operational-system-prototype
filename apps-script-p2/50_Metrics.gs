/** Read-only metrics. Sheet formulas remain the forecasting calculation engine. */

function sjReadDisplayTable_(sheetName, headerText) {
  var sheet = sjSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  var headerIndex = values.findIndex(function (row) { return row.map(sjString_).indexOf(headerText) >= 0; });
  if (headerIndex < 0) throw new Error('Metric header was not found in ' + sheetName + '.');
  var headers = values[headerIndex].map(sjString_);
  var lastHeader = headers.length - 1;
  while (lastHeader >= 0 && !headers[lastHeader]) lastHeader--;
  headers = headers.slice(0, lastHeader + 1);
  return values.slice(headerIndex + 1).filter(function (row) { return row.slice(0, headers.length).some(function (value) { return value !== '' && value !== null; }); }).map(function (row) {
    var record = {};
    headers.forEach(function (header, index) { if (header) record[header] = row[index]; });
    return record;
  });
}

function sjGetDemandMetrics(payload) {
  payload = payload || {};
  var rows = sjReadDisplayTable_('DEMAND', 'Product ID');
  var confidence = sjUpper_(payload.confidence);
  var productId = sjString_(payload.product_id);
  rows = rows.filter(function (row) {
    if (productId && sjString_(row['Product ID']) !== productId) return false;
    if (confidence && sjUpper_(row.Confidence) !== confidence) return false;
    if (payload.reorder_only && !(sjNumber_(row['Order Quantity']) > 0)) return false;
    return true;
  });
  return {
    methodology: {
      windows: [{name: 'recent', days: 14, weeks: 2, weight: 0.5}, {name: 'mid', days: 28, weeks: 4, weight: 0.3}, {name: 'historical', days: 56, weeks: 8, weight: 0.2}],
      includes_shopify: true, shopify_party_id: SJ_CONFIG.SHOPIFY_PARTY_ID,
      service_level: 0.9, service_factor: 1.2815515655446004,
      lead_time_source: 'OPERATIONS_METRICS!D2',
      formulas: {weighted_demand: '0.50×recent + 0.30×mid + 0.20×historical', safety_stock: 'NORM.S.INV(0.90) × demand_std_dev × √lead_time_weeks', reorder_point: 'weighted_demand × lead_time_weeks + safety_stock', order_quantity: 'MAX(reorder_point − inventory_position, 0)'}
    },
    data: sjPaginate_(rows, payload)
  };
}

function sjGetWebsiteMetrics() {
  return sjReadDisplayTable_('WEBSITE_METRICS', 'metric_key');
}

function sjGetDashboard() {
  var metrics = sjGetWebsiteMetrics();
  var byKey = {};
  metrics.forEach(function (metric) { byKey[metric.metric_key] = metric; });
  return {generated_at: sjNow_(), metrics: metrics, by_key: byKey, inventory: sjInventoryMetrics(), owner_analytics: sjGetOwnerAnalytics_(metrics, byKey)};
}

/** Owner-facing read model. Reads formula tabs only; never modifies source data. */
function sjMetricProductRows_(sheetName) {
  var sheet = sjSheet_(sheetName);
  var lastRow = Math.max(3, sheet.getLastRow());
  var values = sheet.getRange(3, 17, lastRow - 2, 10).getValues(); // Q:Z
  return values.filter(function (row) { return sjString_(row[0]); }).map(function (row) {
    return {
      product_id: sjString_(row[0]), base_qty_sold: sjNumber_(row[1]), sales: sjNumber_(row[2]),
      gross_profit: row[3] === '' || row[3] === null ? null : sjNumber_(row[3]), product_name: sjString_(row[4]),
      margin_pct: row[5] === '' || row[5] === null ? null : sjNumber_(row[5]),
      sale_per_lb: row[6] === '' || row[6] === null ? null : sjNumber_(row[6]),
      cost_per_lb: row[7] === '' || row[7] === null ? null : sjNumber_(row[7]),
      recent_sale_per_lb: row[8] === '' || row[8] === null ? null : sjNumber_(row[8]),
      recent_cost_per_lb: row[9] === '' || row[9] === null ? null : sjNumber_(row[9])
    };
  });
}

function sjOperationalProductRows_() {
  var sheet = sjSheet_('OPERATIONS_METRICS');
  var lastRow = Math.max(5, Math.min(sheet.getLastRow(), 300));
  var values = sheet.getRange(5, 1, lastRow - 4, 18).getValues(); // A:R
  return values.filter(function (row) { return sjString_(row[0]); }).map(function (row) {
    return {
      product_id: sjString_(row[0]), product_name: sjString_(row[1]), category: sjString_(row[2]),
      on_hand_lb: sjNumber_(row[3]), committed_lb: sjNumber_(row[4]), free_lb: sjNumber_(row[5]), incoming_lb: sjNumber_(row[6]),
      avg_weekly_demand_lb: sjNumber_(row[7]), weeks_cover: row[8] === '' || row[8] === null ? null : sjNumber_(row[8]),
      reorder_point_lb: sjNumber_(row[9]), suggested_buy_lb: sjNumber_(row[10]),
      current_cost_per_lb: row[11] === '' || row[11] === null ? null : sjNumber_(row[11]),
      current_sell_per_lb: row[12] === '' || row[12] === null ? null : sjNumber_(row[12]),
      margin_pct: row[13] === '' || row[13] === null ? null : sjNumber_(row[13]),
      inventory_value: row[14] === '' || row[14] === null ? null : sjNumber_(row[14]), expiring_qty_lb: sjNumber_(row[15]),
      at_risk_value: row[16] === '' || row[16] === null ? null : sjNumber_(row[16]), status: sjUpper_(row[17]) || 'OK'
    };
  });
}

function sjAnalyticsTotals_(rows) {
  var totals = {products: rows.length, base_qty_sold: 0, sales: 0, sales_with_cost: 0, gross_profit: 0, products_with_cost: 0, products_missing_cost: 0};
  rows.forEach(function (row) {
    totals.base_qty_sold += row.base_qty_sold; totals.sales += row.sales;
    if (row.gross_profit === null) totals.products_missing_cost++;
    else { totals.gross_profit += row.gross_profit; totals.sales_with_cost += row.sales; totals.products_with_cost++; }
  });
  totals.margin_pct = totals.sales_with_cost ? totals.gross_profit / totals.sales_with_cost : null;
  return totals;
}

function sjGetOwnerAnalytics_(metrics, byKey) {
  var wholesale = sjMetricProductRows_('SALES_METRICS');
  var shopify = sjMetricProductRows_('SHOPIFY_METRICS');
  var operations = sjOperationalProductRows_();
  return {
    generated_at: sjNow_(),
    methodology: {
      wholesale: 'Completed positive-pound sales excluding Shopify customer ' + SJ_CONFIG.SHOPIFY_PARTY_ID + '.',
      shopify: 'Completed positive-pound sales for Shopify customer ' + SJ_CONFIG.SHOPIFY_PARTY_ID + '.',
      margin: 'Gross profit divided only by sales with reliable product cost.',
      ranking_period: 'All valid transactions currently represented by the formula-backed metric tabs.'
    },
    website_metrics: {rows: metrics, by_key: byKey},
    channels: {wholesale: {totals: sjAnalyticsTotals_(wholesale), products: wholesale}, shopify: {totals: sjAnalyticsTotals_(shopify), products: shopify}},
    operations: {
      products: operations,
      summary: {
        products: operations.length,
        reorder: operations.filter(function (row) { return row.status === 'REORDER'; }).length,
        out_of_stock: operations.filter(function (row) { return row.status === 'OUT OF STOCK'; }).length,
        no_recent_demand: operations.filter(function (row) { return row.status === 'NO RECENT DEMAND'; }).length,
        expiring: operations.filter(function (row) { return row.status === 'EXPIRING'; }).length,
        suggested_buy_lb: operations.reduce(function (sum, row) { return sum + row.suggested_buy_lb; }, 0),
        at_risk_value: operations.reduce(function (sum, row) { return sum + (row.at_risk_value || 0); }, 0)
      }
    }
  };
}
