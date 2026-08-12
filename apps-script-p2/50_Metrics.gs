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
  return {generated_at: sjNow_(), metrics: metrics, by_key: byKey, inventory: sjInventoryMetrics()};
}
