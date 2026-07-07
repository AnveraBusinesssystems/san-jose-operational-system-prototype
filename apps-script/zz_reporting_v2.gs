// Reporting V2 for the current San Jose Apps Script project.
// This file intentionally overrides the original report functions in Code.gs
// without creating a separate Apps Script project.

function lotUnitCost_(lot) {
  const originalQty = n_(lot.original_qty, 0);
  const purchaseQty = n_(lot.purchase_qty_received, 0);
  const costPerPurchaseUnit = n_(lot.unit_cost, 0);
  return originalQty > 0 && purchaseQty > 0
    ? costPerPurchaseUnit / (originalQty / purchaseQty)
    : costPerPurchaseUnit;
}

function lotPurchaseUnitCost_(lot) {
  return n_(lot.unit_cost, 0);
}

function lotLbsPerPurchaseUnit_(lot) {
  const originalQty = n_(lot.original_qty, 0);
  const purchaseQty = n_(lot.purchase_qty_received, 0);
  return originalQty > 0 && purchaseQty > 0 ? originalQty / purchaseQty : 0;
}

function simpleLotSnapshot_() {
  const products = byId_(readTable_("PRODUCTS"), "product_id");
  return readTable_("LOTS")
    .filter(lot => ["ACTIVE", "AVAILABLE", ""].indexOf(upper_(lot.status || "ACTIVE")) >= 0)
    .map(lot => {
      const product = products[lot.product_id] || {};
      const qty = lotQty_(lot);
      const lbsPerPurchaseUnit = lotLbsPerPurchaseUnit_(lot);
      const costPerLb = lotUnitCost_(lot);
      const purchaseUnitCost = lotPurchaseUnitCost_(lot);
      const missingCost = purchaseUnitCost <= 0 || lbsPerPurchaseUnit <= 0;
      return {
        product_id: lot.product_id || "",
        product_name: product.product_name || lot.product_id || "",
        product_category: product.product_category || "",
        internal_lot_id: lot.internal_lot_id || "",
        location_id: lot.current_location_id || "",
        current_qty: qty,
        qty,
        unit_type: lot.unit_type || product.base_unit || "LB",
        expiration_date: lot.expiration_date || "",
        unit_cost: costPerLb,
        cost_per_lb: costPerLb,
        purchase_unit_cost: purchaseUnitCost,
        purchase_unit_type: lot.purchase_unit_type || "",
        purchase_qty_received: n_(lot.purchase_qty_received, 0),
        lbs_per_purchase_unit: lbsPerPurchaseUnit,
        inventory_value: Math.max(0, qty) * costPerLb,
        missing_cost: missingCost,
        value_status: missingCost ? "MISSING_COST" : "OK",
        product,
        lot,
        inventory_status: qty > 0 ? "AVAILABLE" : "EMPTY",
        days_since_received: daysSince_(lot.received_date),
        recommended_action: recommendedLotAction_(lot, qty)
      };
    })
    .filter(row => row.current_qty > 0);
}

function inventoryValueByProductV2_(products, snapshot) {
  const productMap = byId_(products, "product_id");
  const map = {};
  snapshot.forEach(row => {
    const key = row.product_id;
    if (!key) return;
    if (!map[key]) {
      const product = productMap[key] || row.product || {};
      map[key] = {
        product_id: key,
        product_name: product.product_name || row.product_name || key,
        product_category: product.product_category || row.product_category || "",
        total_qty_lb: 0,
        current_qty: 0,
        total_inventory_value: 0,
        inventory_value: 0,
        avg_cost_per_lb: 0,
        active_lots: 0,
        locations: {},
        locations_used: 0,
        missing_cost_lots: 0,
        value_status: "OK"
      };
    }
    map[key].total_qty_lb += n_(row.current_qty, 0);
    map[key].current_qty = map[key].total_qty_lb;
    map[key].total_inventory_value += n_(row.inventory_value, 0);
    map[key].inventory_value = map[key].total_inventory_value;
    map[key].active_lots += 1;
    if (row.location_id) map[key].locations[row.location_id] = true;
    if (row.missing_cost) map[key].missing_cost_lots += 1;
  });

  return Object.keys(map).map(key => {
    const row = map[key];
    row.avg_cost_per_lb = row.total_qty_lb > 0 ? row.total_inventory_value / row.total_qty_lb : 0;
    row.locations_used = Object.keys(row.locations).length;
    row.location_list = Object.keys(row.locations).join(", ");
    row.value_status = row.missing_cost_lots > 0 ? "MISSING_COST" : "OK";
    delete row.locations;
    return row;
  }).sort((a, b) => String(a.product_name || "").localeCompare(String(b.product_name || "")));
}

function avgV2_(values) {
  const clean = (values || []).map(value => n_(value, NaN)).filter(value => Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function stddevV2_(values) {
  const clean = (values || []).map(value => n_(value, NaN)).filter(value => Number.isFinite(value));
  if (clean.length < 2) return 0;
  const mean = avgV2_(clean);
  const variance = clean.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (clean.length - 1);
  return Math.sqrt(variance);
}

function salesUsageMovementTypeV2_(type) {
  return ["SALE", "AMAZON_OUT", "PICK", "SHIP"].indexOf(upper_(type)) >= 0;
}

function dailyUsageStatsFromMovementsV2_(movements) {
  const since = new Date(now_().getTime() - 90 * 86400000);
  const byProductDay = {};
  const movementCounts = {};
  movements.forEach(movement => {
    if (!salesUsageMovementTypeV2_(movement.movement_type)) return;
    const d = date_(movement.timestamp);
    if (d && d < since) return;
    const productId = movement.product_id;
    if (!productId) return;
    const key = dateKey_(d || today_());
    if (!byProductDay[productId]) byProductDay[productId] = {};
    byProductDay[productId][key] = (byProductDay[productId][key] || 0) + Math.abs(n_(movement.qty_change, 0));
    movementCounts[productId] = (movementCounts[productId] || 0) + 1;
  });

  const result = {};
  Object.keys(byProductDay).forEach(productId => {
    const values = Object.keys(byProductDay[productId]).map(day => byProductDay[productId][day]);
    const total = values.reduce((sum, value) => sum + value, 0);
    result[productId] = {
      total_usage_90d: total,
      active_usage_days: values.length,
      movement_count: movementCounts[productId] || values.length,
      average_daily_usage: total / 90,
      std_daily_usage: stddevV2_(values)
    };
  });
  return result;
}

function histogramV2_(values, requestedBins) {
  const clean = (values || []).map(value => n_(value, NaN)).filter(value => Number.isFinite(value));
  if (!clean.length) return [];
  const min = Math.min.apply(null, clean);
  const max = Math.max.apply(null, clean);
  const binCount = Math.max(1, Math.min(requestedBins || 8, clean.length));
  if (min === max) return [{ min, max, count: clean.length }];
  const width = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    min: min + index * width,
    max: index === binCount - 1 ? max : min + (index + 1) * width,
    count: 0
  }));
  clean.forEach(value => {
    const index = Math.min(binCount - 1, Math.floor((value - min) / width));
    bins[index].count += 1;
  });
  return bins;
}

function trendLineV2_(points) {
  const clean = (points || [])
    .filter(point => point && point.date && Number.isFinite(n_(point.price, NaN)))
    .map(point => ({ x: date_(point.date).getTime(), y: n_(point.price, 0), date: point.date }));
  if (clean.length < 2) return [];
  const minX = Math.min.apply(null, clean.map(point => point.x));
  const normalized = clean.map(point => ({ x: (point.x - minX) / 86400000, y: point.y, date: point.date }));
  const meanX = avgV2_(normalized.map(point => point.x));
  const meanY = avgV2_(normalized.map(point => point.y));
  const denominator = normalized.reduce((sum, point) => sum + Math.pow(point.x - meanX, 2), 0);
  if (!denominator) return [];
  const slope = normalized.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator;
  const intercept = meanY - slope * meanX;
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  return [
    { date: first.date, price: intercept + slope * first.x },
    { date: last.date, price: intercept + slope * last.x },
    { slope_per_day: slope }
  ];
}

function productPriceAnalyticsV2_(products, salesOrders, salesLines) {
  const productMap = byId_(products, "product_id");
  const orders = byId_(salesOrders, "sales_order_id");
  const byProduct = {};
  salesLines.forEach(line => {
    const price = n_(line.unit_price, 0);
    if (!line.product_id || price <= 0) return;
    const order = orders[line.sales_order_id] || {};
    const orderDate = dateKey_(order.order_date || line.created_at || today_());
    if (!byProduct[line.product_id]) byProduct[line.product_id] = [];
    byProduct[line.product_id].push({
      date: orderDate,
      price,
      qty: n_(line.qty_ordered, 0),
      sales_order_id: line.sales_order_id || "",
      sales_order_line_id: line.sales_order_line_id || ""
    });
  });

  const result = {};
  Object.keys(productMap).forEach(productId => {
    const points = (byProduct[productId] || []).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const prices = points.map(point => point.price);
    result[productId] = {
      product_id: productId,
      product_name: productMap[productId].product_name || productId,
      sales_line_count: points.length,
      average_price: avgV2_(prices),
      avg_sales_price: avgV2_(prices),
      std_price: stddevV2_(prices),
      standard_deviation_price: stddevV2_(prices),
      min_price: prices.length ? Math.min.apply(null, prices) : 0,
      max_price: prices.length ? Math.max.apply(null, prices) : 0,
      price_history: points,
      histogram: histogramV2_(prices, 8),
      trend_line: trendLineV2_(points),
      analytics_status: points.length >= 2 ? "READY" : "NOT_ENOUGH_SALES",
      reason: points.length ? "Add more sales orders to strengthen this analytics view." : "No sales price history yet."
    };
  });
  return result;
}

function planningRowsV2_(products, suppliers, purchaseOrders, purchaseLines, snapshot, movementStats, priceAnalytics) {
  const qtyByProduct = currentQtyByProduct_(snapshot);
  const valueByProduct = byId_(inventoryValueByProductV2_(products, snapshot), "product_id");
  const supplierMap = byId_(suppliers, "supplier_id");
  const poSupplier = {};
  purchaseOrders.forEach(po => poSupplier[po.po_id] = po.supplier_id);
  const supplierByProduct = {};
  const poCountByProduct = {};
  purchaseLines.forEach(line => {
    if (!supplierByProduct[line.product_id]) supplierByProduct[line.product_id] = line.supplier_id || poSupplier[line.po_id] || "";
    poCountByProduct[line.product_id] = (poCountByProduct[line.product_id] || 0) + 1;
  });

  return products.map(product => {
    const supplierId = supplierByProduct[product.product_id] || "";
    const supplier = supplierMap[supplierId] || {};
    const valueRow = valueByProduct[product.product_id] || {};
    const currentQty = n_(qtyByProduct[product.product_id], 0);
    const usage = movementStats[product.product_id] || { average_daily_usage: 0, std_daily_usage: 0, active_usage_days: 0, movement_count: 0 };
    const analytics = priceAnalytics[product.product_id] || { sales_line_count: 0 };
    const minStock = n_(product.min_stock_qty, 0);
    const targetFromSheet = n_(product.target_stock_qty, 0);
    const hasEnoughUsageHistory = n_(usage.active_usage_days, 0) >= 30 || n_(usage.movement_count, 0) >= 10;
    const hasStockTarget = minStock > 0 || targetFromSheet > 0;
    const hasSupplierHistory = poCountByProduct[product.product_id] > 0 || Boolean(supplierId);
    const canCalculate = hasEnoughUsageHistory && hasStockTarget;
    const reasonParts = [];
    if (!hasEnoughUsageHistory) reasonParts.push("Needs real sales/pick movement history");
    if (!hasStockTarget) reasonParts.push("Needs min or target stock levels");
    if (!hasSupplierHistory) reasonParts.push("No supplier/PO history yet");

    const base = {
      product_id: product.product_id,
      product_name: product.product_name,
      supplier_id: supplierId,
      supplier_name: supplier.supplier_name || "",
      current_qty: currentQty,
      total_qty_lb: currentQty,
      total_inventory_value: n_(valueRow.total_inventory_value, 0),
      inventory_value: n_(valueRow.total_inventory_value, 0),
      avg_cost_per_lb: n_(valueRow.avg_cost_per_lb, 0),
      active_lots: n_(valueRow.active_lots, 0),
      locations_used: n_(valueRow.locations_used, 0),
      location_list: valueRow.location_list || "",
      usage_movements_found: n_(usage.movement_count, 0),
      usage_days_found: n_(usage.active_usage_days, 0),
      sales_price_points: n_(analytics.sales_line_count, 0),
      po_history_found: n_(poCountByProduct[product.product_id], 0)
    };

    if (!canCalculate) {
      return Object.assign({}, base, {
        can_calculate_reorder: false,
        planning_status: "NOT_READY",
        status: "NOT_READY",
        reason: reasonParts.join("; ") || "Opening inventory only",
        average_daily_usage: "",
        std_daily_usage: "",
        avg_lead_time_days: "",
        std_lead_time_days: "",
        demand_during_lead_time: "",
        safety_stock: "",
        reorder_point: "",
        target_stock_level: "",
        recommended_order_qty: ""
      });
    }

    const avgLeadTime = n_(supplier.lead_time_expected_days, 7) || 7;
    const safetyStock = Math.max(minStock, usage.average_daily_usage * 3);
    const reorderPoint = Math.max(minStock, usage.average_daily_usage * avgLeadTime + safetyStock);
    const targetStock = Math.max(targetFromSheet, reorderPoint * 1.5);
    const statusValue = currentQty <= reorderPoint ? "REORDER" : currentQty <= targetStock ? "WATCH" : "OK";
    return Object.assign({}, base, {
      can_calculate_reorder: true,
      planning_status: statusValue,
      reason: "Calculated from sales/pick movement history.",
      average_daily_usage: usage.average_daily_usage,
      std_daily_usage: usage.std_daily_usage,
      avg_lead_time_days: avgLeadTime,
      std_lead_time_days: 0,
      demand_during_lead_time: usage.average_daily_usage * avgLeadTime,
      safety_stock: safetyStock,
      reorder_point: reorderPoint,
      target_stock_level: targetStock,
      recommended_order_qty: Math.max(targetStock - currentQty, 0),
      status: statusValue
    });
  }).sort((a, b) => String(a.product_name || "").localeCompare(String(b.product_name || "")));
}

function getDashboard() {
  const products = readTable_("PRODUCTS").filter(active_);
  const suppliers = readTable_("SUPPLIERS").filter(active_);
  const purchaseOrders = readTable_("PURCHASE_ORDERS");
  const salesOrders = readTable_("SALES_ORDERS");
  const salesLines = readTable_("SALES_ORDER_LINES");
  const purchaseLines = readTable_("PURCHASE_ORDER_LINES");
  const locations = readTable_("LOCATIONS").filter(active_);
  const amazonPackages = readTable_("AMAZON_PACKAGES");
  const movements = readTable_("INVENTORY_MOVEMENTS");
  const snapshot = simpleLotSnapshot_();
  const productPriceAnalytics = productPriceAnalyticsV2_(products, salesOrders, salesLines);
  const planning = planningRowsV2_(products, suppliers, purchaseOrders, purchaseLines, snapshot, dailyUsageStatsFromMovementsV2_(movements), productPriceAnalytics);
  const lowStockProducts = planning.filter(row => ["REORDER", "WATCH"].indexOf(row.status) >= 0);
  const expiringLots = expirationRows_(snapshot);
  const openPo = purchaseOrders.filter(po => ["DRAFT", "SENT", "ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED", "PARTIAL"].indexOf(upper_(po.po_status)) >= 0);
  const openSo = salesOrders.filter(order => ["DRAFT", "CONFIRMED", "PICKED", "OPEN", "PARTIAL", "PARTIALLY_PICKED"].indexOf(upper_(order.status)) >= 0);
  const occupied = {};
  snapshot.forEach(row => { if (row.location_id) occupied[row.location_id] = true; });
  const inventoryValue = snapshot.reduce((sum, row) => sum + n_(row.inventory_value, 0), 0);
  const weeklySales = salesOrders
    .filter(order => upper_(order.status) === "SHIPPED" && (!order.order_date || date_(order.order_date) >= new Date(now_().getTime() - 7 * 86400000)))
    .reduce((sum, order) => sum + n_(order.total_amount, 0), 0);

  return {
    productCount: products.length,
    supplierCount: suppliers.length,
    openPoCount: openPo.length,
    lotCount: readTable_("LOTS").length,
    movementCount: movements.length,
    pendingAmazonPackages: amazonPackages.filter(pkg => !pkg.matched_amazon_order_id).length,
    inventoryValue,
    lowStockCount: lowStockProducts.length,
    openSalesOrderCount: openSo.length,
    totalInventoryValue: inventoryValue,
    usageHistoryNeededCount: planning.filter(row => row.status === "NOT_READY").length,
    expiringLotCount: expiringLots.length,
    expiringProductCount: unique_(expiringLots.map(row => row.product_id)).length,
    expiringInventoryValue: expiringLots.reduce((sum, row) => sum + n_(row.inventory_value, 0), 0),
    openPoValue: sum_(openPo, "total_amount"),
    openSoCount: openSo.length,
    openSoValue: sum_(openSo, "total_amount"),
    weeklySales,
    topProfitProduct: null,
    warehouseCapacityPercent: locations.length ? Object.keys(occupied).length / locations.length * 100 : 0,
    warehouseOccupiedPositions: Object.keys(occupied).length,
    warehouseTotalPositions: locations.length,
    lowStockProducts,
    expiringLots
  };
}

function getOperationalReports() {
  const products = readTable_("PRODUCTS").filter(active_);
  const suppliers = readTable_("SUPPLIERS").filter(active_);
  const purchaseOrders = readTable_("PURCHASE_ORDERS");
  const purchaseLines = readTable_("PURCHASE_ORDER_LINES");
  const salesOrders = readTable_("SALES_ORDERS");
  const salesLines = readTable_("SALES_ORDER_LINES");
  const receiving = readTable_("RECEIVING");
  const movements = readTable_("INVENTORY_MOVEMENTS");
  const snapshot = simpleLotSnapshot_();
  const productPriceAnalytics = productPriceAnalyticsV2_(products, salesOrders, salesLines);
  const inventoryValueByProduct = inventoryValueByProductV2_(products, snapshot);
  const inventoryPlanning = planningRowsV2_(products, suppliers, purchaseOrders, purchaseLines, snapshot, dailyUsageStatsFromMovementsV2_(movements), productPriceAnalytics);
  const supplierAnalytics = supplierAnalytics_(suppliers, purchaseOrders, purchaseLines, receiving);
  const recommendations = inventoryPlanning
    .filter(row => row.can_calculate_reorder && ["REORDER", "WATCH"].indexOf(row.status) >= 0)
    .map(row => ({
      recommendation_id: "REC-" + row.product_id,
      recommendation_type: row.status,
      product_id: row.product_id,
      product_name: row.product_name,
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      recommended_qty: row.recommended_order_qty,
      reorder_point: row.reorder_point,
      target_stock_level: row.target_stock_level,
      confidence_score: 0.75,
      reason_text: row.status === "REORDER" ? "Available inventory is at or below reorder point." : "Available inventory is below target stock."
    }));

  return {
    calculated_at: now_(),
    inventoryValueByProduct,
    inventoryPlanning,
    supplierAnalytics,
    recommendations,
    inventorySnapshot: snapshot,
    productPriceAnalytics,
    report_notes: {
      inventory_value_rule: "unit_cost is cost per purchase unit/case; cost per LB = unit_cost / (original_qty / purchase_qty_received).",
      planning_rule: "Reorder planning is not calculated until the product has real sales/pick movement history and stock targets."
    }
  };
}
