/**
 * PRODUCT REPORTS V3
 * Paste this block into Code.gs after removing the old report-only helpers:
 * parseDateV2_, dateKeyV2_, currentQtyByProductV2_, inventoryValueByProductV2_,
 * numberOrNullV2_, avgV2_, stddevV2_, dailyUsageStatsFromMovementsV2_,
 * histogramV2_, trendLineV2_, productPriceAnalyticsV2_, planningRowsV2_,
 * expirationRowsV2_, supplierAnalyticsV2_, getOperationalReports,
 * buildInventoryPlanning_, estimateDailyUsage_, and buildSupplierAnalytics_.
 *
 * Existing operational helpers used here: readTable_, inventorySnapshot, number_,
 * byId_, and today_.
 */

const PRODUCT_REPORTS_VERSION = "product-reports-v3-2026-07-24";
const PRODUCT_REPORTS_DEFAULTS = {
  safety_factor: 0.30,
  freight_per_order: 100,
  annual_carrying_rate: 0.25,
  fallback_lead_days: 7,
  winsor_lower_percentile: 0.05,
  winsor_upper_percentile: 0.95,
  minimum_winsor_observations: 20
};

function getOperationalReports(payload) {
  return buildProductReportsV3_(payload || {});
}

function buildProductReportsV3_(payload) {
  const products = readTable_("PRODUCTS").filter(isActiveRecord_);
  const suppliers = readTable_("SUPPLIERS").filter(isActiveRecord_);
  const purchaseOrders = readTable_("PURCHASE_ORDERS");
  const purchaseLines = readTable_("PURCHASE_ORDER_LINES");
  const salesOrders = readTable_("SALES_ORDERS");
  const salesLines = readTable_("SALES_ORDER_LINES");
  const snapshot = inventorySnapshot();

  const settings = {
    safety_factor: positiveProductNumber_(payload.safety_factor, PRODUCT_REPORTS_DEFAULTS.safety_factor),
    freight_per_order: positiveProductNumber_(payload.freight_per_order, PRODUCT_REPORTS_DEFAULTS.freight_per_order),
    annual_carrying_rate: positiveProductNumber_(payload.annual_carrying_rate, PRODUCT_REPORTS_DEFAULTS.annual_carrying_rate),
    fallback_lead_days: positiveProductNumber_(payload.fallback_lead_days, PRODUCT_REPORTS_DEFAULTS.fallback_lead_days)
  };

  const productMap = byId_(products, "product_id");
  const supplierMap = byId_(suppliers, "supplier_id");
  const normalizedSales = normalizeProductSalesV3_(salesOrders, salesLines, productMap);
  const normalizedPurchases = normalizeProductPurchasesV3_(purchaseOrders, purchaseLines, productMap);
  const inventory = inventoryPositionByProductV3_(products, snapshot, purchaseOrders, purchaseLines, salesOrders, salesLines);
  const expiration = expirationRiskV3_(snapshot, productMap, normalizedSales);

  const analytics = {};
  products.forEach((product) => {
    analytics[product.product_id] = buildSingleProductAnalyticsV3_({
      product,
      suppliers: supplierMap,
      sales: normalizedSales.filter((row) => row.product_id === product.product_id),
      purchases: normalizedPurchases.filter((row) => row.product_id === product.product_id),
      inventory: inventory[product.product_id] || emptyInventoryV3_(product),
      expiring_lots: expiration.filter((row) => row.product_id === product.product_id),
      settings
    });
  });

  const productRows = Object.keys(analytics).map((productId) => analytics[productId]);
  const overview = buildProductsOverviewV3_(productRows, expiration);

  return {
    calculated_at: today_(),
    version: PRODUCT_REPORTS_VERSION,
    productsOverview: overview,
    productAnalytics: analytics,
    products: products.map((product) => ({
      product_id: product.product_id,
      product_name: product.product_name,
      product_category: product.product_category || ""
    })),
    settings,
    recommendations: productRows.reduce((all, row) => all.concat(row.recommendations || []), []),
    inventorySnapshot: snapshot,
    report_notes: {
      price_rule: "Revenue divided by pounds sold after consolidating each product within each sales order.",
      cost_rule: "Purchase line amount divided by expected pounds purchased.",
      recency_rule: "0-7 days 40%, 8-30 days 30%, 31-60 days 20%, 61+ days 10%; missing buckets are renormalized.",
      margin_rule: "Historical selling price per pound compared with the latest known purchase cost on or before the sale date.",
      outlier_rule: "5th/95th percentile winsorization is available only with at least 20 observations. Raw source data is never changed."
    }
  };
}

function normalizeProductSalesV3_(salesOrders, salesLines, productMap) {
  const orders = byId_(salesOrders, "sales_order_id");
  const grouped = {};

  (salesLines || []).forEach((line) => {
    const order = orders[line.sales_order_id] || {};
    const status = String(order.status || line.line_status || "").toUpperCase();
    if (!["DELIVERED", "SHIPPED"].includes(status)) return;
    if (!line.product_id || !productMap[line.product_id]) return;

    const qty = Math.max(0, productNumber_(line.qty_ordered));
    const unitWeight = Math.max(0, productNumber_(line.unit_weight_lbs));
    const inventoryRequired = Math.max(0, productNumber_(line.inventory_qty_required));
    const pounds = inventoryRequired > 0 ? inventoryRequired : qty * unitWeight;
    const revenue = Math.max(0, productNumber_(line.line_total));
    if (pounds <= 0 || revenue <= 0) return;

    const key = [line.sales_order_id, line.product_id].join("|");
    if (!grouped[key]) {
      grouped[key] = {
        sales_order_id: line.sales_order_id,
        product_id: line.product_id,
        product_name: productMap[line.product_id].product_name || line.product_id,
        date: productDateV3_(order.order_date || order.delivered_at || order.shipped_at),
        customer_name: order.customer_name || "",
        pounds: 0,
        revenue: 0,
        source_lines: 0
      };
    }
    grouped[key].pounds += pounds;
    grouped[key].revenue += revenue;
    grouped[key].source_lines += 1;
  });

  return Object.keys(grouped).map((key) => {
    const row = grouped[key];
    row.price_per_lb = row.pounds > 0 ? row.revenue / row.pounds : 0;
    return row;
  }).filter((row) => row.date && row.price_per_lb > 0)
    .sort((a, b) => a.date - b.date);
}

function normalizeProductPurchasesV3_(purchaseOrders, purchaseLines, productMap) {
  const orders = byId_(purchaseOrders, "po_id");
  const grouped = {};

  (purchaseLines || []).forEach((line) => {
    const order = orders[line.po_id] || {};
    const status = String(order.po_status || line.line_status || "").toUpperCase();
    if (["CANCELLED", "CANCELED", "VOID"].includes(status)) return;
    if (!line.product_id || !productMap[line.product_id]) return;

    const qty = Math.max(0, productNumber_(line.qty_ordered));
    const unitWeight = Math.max(0, positiveProductNumber_(line.case_weight_lbs, line.units_per_purchase_unit));
    const expectedBase = Math.max(0, productNumber_(line.expected_base_qty));
    const pounds = expectedBase > 0 ? expectedBase : qty * unitWeight;
    const spend = Math.max(0, productNumber_(line.line_total));
    if (pounds <= 0 || spend <= 0) return;

    const key = [line.po_id, line.product_id].join("|");
    if (!grouped[key]) {
      grouped[key] = {
        po_id: line.po_id,
        product_id: line.product_id,
        product_name: productMap[line.product_id].product_name || line.product_id,
        supplier_id: line.supplier_id || order.supplier_id || "",
        date: productDateV3_(order.order_date || order.actual_completed_date || order.actual_first_received_date),
        pounds: 0,
        spend: 0,
        source_lines: 0
      };
    }
    grouped[key].pounds += pounds;
    grouped[key].spend += spend;
    grouped[key].source_lines += 1;
  });

  return Object.keys(grouped).map((key) => {
    const row = grouped[key];
    row.cost_per_lb = row.pounds > 0 ? row.spend / row.pounds : 0;
    return row;
  }).filter((row) => row.date && row.cost_per_lb > 0)
    .sort((a, b) => a.date - b.date);
}

function inventoryPositionByProductV3_(products, snapshot, purchaseOrders, purchaseLines, salesOrders, salesLines) {
  const result = {};
  products.forEach((product) => result[product.product_id] = emptyInventoryV3_(product));

  (snapshot || []).forEach((row) => {
    if (!result[row.product_id]) return;
    result[row.product_id].on_hand_lb += Math.max(0, productNumber_(row.current_qty));
    result[row.product_id].reserved_lb += Math.max(0, productNumber_(row.reserved_qty));
    result[row.product_id].available_lb += Math.max(0, productNumber_(row.available_qty !== undefined ? row.available_qty : row.current_qty));
    result[row.product_id].inventory_value += Math.max(0, productNumber_(row.inventory_value));
    result[row.product_id].active_lots += 1;
  });

  const poMap = byId_(purchaseOrders, "po_id");
  (purchaseLines || []).forEach((line) => {
    const order = poMap[line.po_id] || {};
    const status = String(order.po_status || "").toUpperCase();
    if (!["DRAFT", "CREATED", "SENT", "CONFIRMED", "ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED", "PARTIAL"].includes(status)) return;
    if (!result[line.product_id]) return;
    const hasRemaining = line.qty_remaining !== "" && line.qty_remaining !== null && line.qty_remaining !== undefined;
    const remainingUnits = hasRemaining
      ? Math.max(0, productNumber_(line.qty_remaining))
      : Math.max(0, productNumber_(line.qty_ordered) - productNumber_(line.qty_received_total));
    const unitWeight = positiveProductNumber_(line.case_weight_lbs, line.units_per_purchase_unit);
    result[line.product_id].incoming_lb += remainingUnits * unitWeight;
  });

  const soMap = byId_(salesOrders, "sales_order_id");
  (salesLines || []).forEach((line) => {
    const order = soMap[line.sales_order_id] || {};
    const status = String(order.status || "").toUpperCase();
    if (!["DRAFT", "CONFIRMED", "OPEN", "PARTIAL", "PARTIALLY_PICKED", "PICKED"].includes(status)) return;
    if (!result[line.product_id]) return;
    const remaining = Math.max(0, productNumber_(line.qty_remaining));
    const weight = positiveProductNumber_(line.unit_weight_lbs, 0);
    result[line.product_id].committed_lb += remaining * weight;
  });

  Object.keys(result).forEach((productId) => {
    const row = result[productId];
    row.inventory_position_lb = row.available_lb + row.incoming_lb - row.committed_lb;
    row.avg_inventory_cost_per_lb = row.on_hand_lb > 0 ? row.inventory_value / row.on_hand_lb : 0;
  });
  return result;
}

function emptyInventoryV3_(product) {
  return {
    product_id: product.product_id,
    product_name: product.product_name,
    on_hand_lb: 0,
    reserved_lb: 0,
    available_lb: 0,
    incoming_lb: 0,
    committed_lb: 0,
    inventory_position_lb: 0,
    inventory_value: 0,
    avg_inventory_cost_per_lb: 0,
    active_lots: 0
  };
}

function buildSingleProductAnalyticsV3_(context) {
  const product = context.product;
  const sales = context.sales || [];
  const purchases = context.purchases || [];
  const inventory = context.inventory;
  const settings = context.settings;

  const priceRaw = sales.map((row) => row.price_per_lb);
  const costRaw = purchases.map((row) => row.cost_per_lb);
  const volumeRaw = sales.map((row) => row.pounds);
  const priceClean = winsorizeProductValuesV3_(priceRaw);
  const costClean = winsorizeProductValuesV3_(costRaw);
  const volumeClean = winsorizeProductValuesV3_(volumeRaw);

  const weightedPrice = recencyWeightedMetricV3_(sales, "price_per_lb", "pounds");
  const weightedCost = recencyWeightedMetricV3_(purchases, "cost_per_lb", "pounds");
  const weekly = weeklyProductTimelineV3_(sales, purchases);
  const demand = demandStatsV3_(weekly);
  const historicalMargins = marginTimelineV3_(sales, purchases, inventory.avg_inventory_cost_per_lb);
  const weightedMargin = recencyWeightedMetricV3_(historicalMargins, "margin_percent", "pounds");
  const weightedProfitPerLb = recencyWeightedMetricV3_(historicalMargins, "profit_per_lb", "pounds");
  const primarySupplierId = latestSupplierV3_(purchases);
  const supplier = context.suppliers[primarySupplierId] || {};
  const leadDays = positiveProductNumber_(supplier.lead_time_expected_days, settings.fallback_lead_days);
  const planning = inventoryPlanningV3_(product, inventory, demand, weightedCost.value || inventory.avg_inventory_cost_per_lb, leadDays, settings);

  const totalRevenue = sales.reduce((sum, row) => sum + row.revenue, 0);
  const totalSalesLb = sales.reduce((sum, row) => sum + row.pounds, 0);
  const totalPurchaseSpend = purchases.reduce((sum, row) => sum + row.spend, 0);
  const totalPurchaseLb = purchases.reduce((sum, row) => sum + row.pounds, 0);
  const grossProfit = historicalMargins.reduce((sum, row) => sum + row.gross_profit, 0);
  const grossMargin = totalRevenue > 0 ? grossProfit / totalRevenue : 0;

  return {
    product_id: product.product_id,
    product_name: product.product_name,
    product_category: product.product_category || "",
    summary: {
      current_stock_lb: inventory.available_lb,
      inventory_position_lb: inventory.inventory_position_lb,
      inventory_value: inventory.inventory_value,
      weeks_of_supply: demand.weighted_weekly_demand > 0 ? inventory.inventory_position_lb / demand.weighted_weekly_demand : 0,
      weighted_weekly_demand: demand.weighted_weekly_demand,
      weighted_price_per_lb: weightedPrice.value,
      weighted_cost_per_lb: weightedCost.value,
      weighted_margin_percent: weightedMargin.value,
      weighted_profit_per_lb: weightedProfitPerLb.value,
      total_revenue: totalRevenue,
      estimated_gross_profit: grossProfit,
      estimated_gross_margin_percent: grossMargin,
      sales_orders: sales.length,
      purchase_orders: purchases.length,
      last_sale_date: sales.length ? productDateKeyV3_(sales[sales.length - 1].date) : "",
      last_purchase_date: purchases.length ? productDateKeyV3_(purchases[purchases.length - 1].date) : ""
    },
    inventory: inventory,
    planning: planning,
    demand: {
      weighted_weekly_demand: demand.weighted_weekly_demand,
      average_weekly_demand: demand.average_weekly_demand,
      std_weekly_demand: demand.std_weekly_demand,
      average_daily_demand: demand.average_daily_demand,
      demand_trend_percent: demand.demand_trend_percent,
      demand_direction: demand.demand_direction,
      average_days_between_orders: averageDaysBetweenV3_(sales.map((row) => row.date)),
      weekly_timeline: weekly.map((row) => ({
        date: productDateKeyV3_(row.date),
        sales_lb: row.sales_lb,
        purchase_lb: row.purchase_lb,
        moving_average_4w: row.moving_average_4w
      }))
    },
    financial: {
      average_price_per_lb: productAverage_(priceRaw),
      std_price_per_lb: productStdDev_(priceRaw),
      winsorized_average_price_per_lb: productAverage_(priceClean.values),
      winsorized_std_price_per_lb: productStdDev_(priceClean.values),
      weighted_price_per_lb: weightedPrice.value,
      average_cost_per_lb: productAverage_(costRaw),
      std_cost_per_lb: productStdDev_(costRaw),
      winsorized_average_cost_per_lb: productAverage_(costClean.values),
      winsorized_std_cost_per_lb: productStdDev_(costClean.values),
      weighted_cost_per_lb: weightedCost.value,
      average_order_volume_lb: productAverage_(volumeRaw),
      std_order_volume_lb: productStdDev_(volumeRaw),
      winsorized_average_order_volume_lb: productAverage_(volumeClean.values),
      winsorized_std_order_volume_lb: productStdDev_(volumeClean.values),
      median_order_volume_lb: productPercentileV3_(volumeRaw, 0.50),
      total_sales_lb: totalSalesLb,
      total_purchase_lb: totalPurchaseLb,
      total_revenue: totalRevenue,
      total_purchase_spend: totalPurchaseSpend,
      gross_profit: grossProfit,
      gross_margin_percent: grossMargin,
      winsorization_available: priceRaw.length >= PRODUCT_REPORTS_DEFAULTS.minimum_winsor_observations,
      winsorization: {
        price: priceClean.meta,
        cost: costClean.meta,
        order_volume: volumeClean.meta
      },
      margin_timeline: historicalMargins.map((row) => ({
        date: productDateKeyV3_(row.date),
        sales_lb: row.pounds,
        price_per_lb: row.price_per_lb,
        cost_per_lb: row.cost_per_lb,
        profit_per_lb: row.profit_per_lb,
        margin_percent: row.margin_percent
      }))
    },
    expiration: context.expiring_lots || [],
    recommendations: productRecommendationsV3_(product, planning, inventory, demand, context.expiring_lots || [], weightedMargin.value)
  };
}

function buildProductsOverviewV3_(rows, expiration) {
  const eligibleMargins = rows.filter((row) => row.summary.sales_orders >= 2 && row.summary.weighted_price_per_lb > 0);
  const eligibleDemand = rows.filter((row) => row.summary.sales_orders >= 2 && row.summary.weighted_weekly_demand > 0);
  const topMargins = eligibleMargins.slice().sort((a, b) => b.summary.weighted_margin_percent - a.summary.weighted_margin_percent).slice(0, 10);
  const lowestMargins = eligibleMargins.slice().sort((a, b) => a.summary.weighted_margin_percent - b.summary.weighted_margin_percent).slice(0, 10);
  const highestDemand = eligibleDemand.slice().sort((a, b) => b.summary.weighted_weekly_demand - a.summary.weighted_weekly_demand).slice(0, 10);

  const totalRevenue = rows.reduce((sum, row) => sum + row.financial.total_revenue, 0);
  const totalSalesLb = rows.reduce((sum, row) => sum + row.financial.total_sales_lb, 0);
  const totalSpend = rows.reduce((sum, row) => sum + row.financial.total_purchase_spend, 0);
  const totalPurchaseLb = rows.reduce((sum, row) => sum + row.financial.total_purchase_lb, 0);
  const totalGrossProfit = rows.reduce((sum, row) => sum + row.financial.gross_profit, 0);

  return {
    portfolio: {
      weighted_average_price_per_lb: totalSalesLb > 0 ? totalRevenue / totalSalesLb : 0,
      weighted_average_cost_per_lb: totalPurchaseLb > 0 ? totalSpend / totalPurchaseLb : 0,
      gross_margin_percent: totalRevenue > 0 ? totalGrossProfit / totalRevenue : 0,
      inventory_value: rows.reduce((sum, row) => sum + row.inventory.inventory_value, 0),
      expiring_inventory_value: expiration.reduce((sum, row) => sum + productNumber_(row.inventory_value), 0),
      reorder_products: rows.filter((row) => row.planning.status === "REORDER").length,
      excess_products: rows.filter((row) => row.planning.status === "EXCESS").length
    },
    expiringWithin30Days: expiration.sort((a, b) => a.days_remaining - b.days_remaining),
    topMargins: topMargins.map(productOverviewRowV3_),
    lowestMargins: lowestMargins.map(productOverviewRowV3_),
    highestDemand: highestDemand.map(productOverviewRowV3_)
  };
}

function productOverviewRowV3_(row) {
  return {
    product_name: row.product_name,
    weighted_margin_percent: row.summary.weighted_margin_percent,
    weighted_weekly_demand: row.summary.weighted_weekly_demand,
    weighted_price_per_lb: row.summary.weighted_price_per_lb,
    weighted_cost_per_lb: row.summary.weighted_cost_per_lb,
    current_stock_lb: row.summary.current_stock_lb,
    weeks_of_supply: row.summary.weeks_of_supply,
    demand_direction: row.demand.demand_direction
  };
}

function inventoryPlanningV3_(product, inventory, demand, costPerLb, leadDays, settings) {
  const dailyDemand = Math.max(0, demand.average_daily_demand);
  const dailyStd = Math.max(0, demand.std_daily_demand);
  const safetyStock = settings.safety_factor * dailyStd * Math.sqrt(leadDays);
  const demandDuringLead = dailyDemand * leadDays;
  const reorderPoint = demandDuringLead + safetyStock;
  const annualDemand = Math.max(0, demand.weighted_weekly_demand * 52);
  const annualHoldingCost = Math.max(0.0001, costPerLb * settings.annual_carrying_rate);
  const eoqLb = annualDemand > 0 ? Math.sqrt((2 * annualDemand * settings.freight_per_order) / annualHoldingCost) : 0;
  const purchaseUnitWeight = positiveProductNumber_(product.case_weight_lbs, product.units_per_purchase_unit, 1);
  const roundedOrderLb = eoqLb > 0 ? Math.ceil(eoqLb / purchaseUnitWeight) * purchaseUnitWeight : 0;
  const orderUnits = purchaseUnitWeight > 0 ? roundedOrderLb / purchaseUnitWeight : 0;
  const targetStock = reorderPoint + roundedOrderLb;
  const position = inventory.inventory_position_lb;
  const status = position <= reorderPoint ? "REORDER" : position > targetStock * 1.5 && targetStock > 0 ? "EXCESS" : position <= targetStock ? "WATCH" : "HEALTHY";

  return {
    status,
    lead_time_days: leadDays,
    safety_factor: settings.safety_factor,
    average_daily_demand: dailyDemand,
    demand_during_lead_time: demandDuringLead,
    safety_stock_lb: safetyStock,
    reorder_point_lb: reorderPoint,
    recommended_order_lb: roundedOrderLb,
    recommended_order_units: orderUnits,
    purchase_unit_weight_lb: purchaseUnitWeight,
    target_stock_lb: targetStock,
    inventory_position_lb: position,
    expected_stockout_days: dailyDemand > 0 ? Math.max(0, position / dailyDemand) : 0,
    freight_per_order: settings.freight_per_order,
    annual_carrying_rate: settings.annual_carrying_rate
  };
}

function demandStatsV3_(weekly) {
  const values = weekly.map((row) => row.sales_lb);
  const recent = weekly.slice(-4).map((row) => row.sales_lb);
  const previous = weekly.slice(-8, -4).map((row) => row.sales_lb);
  const recentAvg = productAverage_(recent);
  const previousAvg = productAverage_(previous);
  const change = previousAvg > 0 ? (recentAvg - previousAvg) / previousAvg : recentAvg > 0 ? 1 : 0;
  const weightedDemand = recencyWeightedWeeklyDemandV3_(weekly);
  const stdWeekly = productStdDev_(values);

  return {
    weighted_weekly_demand: weightedDemand,
    average_weekly_demand: productAverage_(values),
    std_weekly_demand: stdWeekly,
    average_daily_demand: weightedDemand / 7,
    std_daily_demand: stdWeekly / Math.sqrt(7),
    demand_trend_percent: change,
    demand_direction: change > 0.10 ? "Increasing" : change < -0.10 ? "Declining" : "Stable"
  };
}

function weeklyProductTimelineV3_(sales, purchases) {
  const map = {};
  sales.forEach((row) => {
    const key = productWeekKeyV3_(row.date);
    if (!map[key]) map[key] = { date: productWeekStartV3_(row.date), sales_lb: 0, purchase_lb: 0, revenue: 0, purchase_spend: 0 };
    map[key].sales_lb += row.pounds;
    map[key].revenue += row.revenue;
  });
  purchases.forEach((row) => {
    const key = productWeekKeyV3_(row.date);
    if (!map[key]) map[key] = { date: productWeekStartV3_(row.date), sales_lb: 0, purchase_lb: 0, revenue: 0, purchase_spend: 0 };
    map[key].purchase_lb += row.pounds;
    map[key].purchase_spend += row.spend;
  });
  const rows = Object.keys(map).map((key) => map[key]).sort((a, b) => a.date - b.date);
  rows.forEach((row, index) => {
    const slice = rows.slice(Math.max(0, index - 3), index + 1);
    row.moving_average_4w = productAverage_(slice.map((item) => item.sales_lb));
  });
  return rows;
}

function marginTimelineV3_(sales, purchases, fallbackCost) {
  const sortedPurchases = purchases.slice().sort((a, b) => a.date - b.date);
  return sales.map((sale) => {
    const prior = sortedPurchases.filter((purchase) => purchase.date <= sale.date);
    const costPerLb = prior.length ? prior[prior.length - 1].cost_per_lb : fallbackCost || 0;
    const profitPerLb = sale.price_per_lb - costPerLb;
    const marginPercent = sale.price_per_lb > 0 ? profitPerLb / sale.price_per_lb : 0;
    return {
      date: sale.date,
      pounds: sale.pounds,
      revenue: sale.revenue,
      price_per_lb: sale.price_per_lb,
      cost_per_lb: costPerLb,
      profit_per_lb: profitPerLb,
      margin_percent: marginPercent,
      gross_profit: profitPerLb * sale.pounds
    };
  });
}

function expirationRiskV3_(snapshot, productMap, normalizedSales) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today.getTime() + 30 * 86400000);
  const demandByProduct = {};
  Object.keys(productMap).forEach((productId) => {
    demandByProduct[productId] = demandStatsV3_(weeklyProductTimelineV3_(normalizedSales.filter((row) => row.product_id === productId), [])).weighted_weekly_demand;
  });

  return (snapshot || []).filter((row) => {
    const expiration = productDateV3_(row.expiration_date);
    return expiration && expiration >= today && expiration <= limit && productNumber_(row.available_qty !== undefined ? row.available_qty : row.current_qty) > 0;
  }).map((row) => {
    const expiration = productDateV3_(row.expiration_date);
    const daysRemaining = Math.ceil((expiration - today) / 86400000);
    const available = productNumber_(row.available_qty !== undefined ? row.available_qty : row.current_qty);
    const weeklyDemand = demandByProduct[row.product_id] || 0;
    const expectedDemand = weeklyDemand * daysRemaining / 7;
    return {
      product_id: row.product_id,
      product_name: (productMap[row.product_id] || {}).product_name || row.product_name || "Product",
      expiration_date: productDateKeyV3_(expiration),
      days_remaining: daysRemaining,
      available_lb: available,
      inventory_value: productNumber_(row.inventory_value),
      expected_demand_before_expiration_lb: expectedDemand,
      at_risk_lb: Math.max(0, available - expectedDemand),
      risk: available > expectedDemand ? "At risk" : "Likely to sell"
    };
  });
}

function productRecommendationsV3_(product, planning, inventory, demand, expiration, margin) {
  const rows = [];
  if (planning.status === "REORDER") rows.push({ category: "Inventory", product_name: product.product_name, priority: "High", action: "Reorder now", reason: "Inventory position is at or below the reorder point." });
  if (planning.status === "EXCESS") rows.push({ category: "Inventory", product_name: product.product_name, priority: "Medium", action: "Reduce purchasing", reason: "Inventory is materially above the target stock level." });
  if (demand.demand_direction === "Increasing" && planning.status !== "EXCESS") rows.push({ category: "Demand", product_name: product.product_name, priority: "Medium", action: "Watch demand growth", reason: "Recent weekly demand is increasing." });
  if (demand.demand_direction === "Declining" && inventory.inventory_position_lb > planning.target_stock_lb) rows.push({ category: "Demand", product_name: product.product_name, priority: "Medium", action: "Avoid overbuying", reason: "Demand is declining while stock is above target." });
  if (margin < 0.05 && margin !== 0) rows.push({ category: "Margin", product_name: product.product_name, priority: "High", action: "Review pricing", reason: "Recency-weighted gross margin is below 5%." });
  if (expiration.some((row) => row.at_risk_lb > 0)) rows.push({ category: "Expiration", product_name: product.product_name, priority: "High", action: "Move expiring stock", reason: "Available inventory may exceed expected demand before expiration." });
  return rows;
}

function recencyWeightedMetricV3_(rows, valueKey, volumeKey) {
  const now = new Date();
  const buckets = [
    { min: 0, max: 7, weight: 0.40 },
    { min: 8, max: 30, weight: 0.30 },
    { min: 31, max: 60, weight: 0.20 },
    { min: 61, max: Infinity, weight: 0.10 }
  ];
  const available = buckets.map((bucket) => {
    const matches = rows.filter((row) => {
      const days = Math.floor((now - row.date) / 86400000);
      return days >= bucket.min && days <= bucket.max;
    });
    const numerator = matches.reduce((sum, row) => sum + productNumber_(row[valueKey]) * Math.max(0.0001, productNumber_(row[volumeKey]) || 1), 0);
    const denominator = matches.reduce((sum, row) => sum + Math.max(0.0001, productNumber_(row[volumeKey]) || 1), 0);
    return { ...bucket, value: denominator > 0 ? numerator / denominator : null, observations: matches.length };
  }).filter((bucket) => bucket.value !== null);
  const totalWeight = available.reduce((sum, bucket) => sum + bucket.weight, 0);
  return {
    value: totalWeight > 0 ? available.reduce((sum, bucket) => sum + bucket.value * bucket.weight / totalWeight, 0) : 0,
    buckets: available
  };
}

function recencyWeightedWeeklyDemandV3_(weekly) {
  const now = new Date();
  const periods = [
    { min: 0, max: 7, weight: 0.40 },
    { min: 8, max: 30, weight: 0.30 },
    { min: 31, max: 60, weight: 0.20 },
    { min: 61, max: Infinity, weight: 0.10 }
  ];
  const available = periods.map((period) => {
    const matches = weekly.filter((row) => {
      const days = Math.floor((now - row.date) / 86400000);
      return days >= period.min && days <= period.max;
    });
    return { ...period, value: matches.length ? productAverage_(matches.map((row) => row.sales_lb)) : null };
  }).filter((period) => period.value !== null);
  const weight = available.reduce((sum, period) => sum + period.weight, 0);
  return weight > 0 ? available.reduce((sum, period) => sum + period.value * period.weight / weight, 0) : 0;
}

function winsorizeProductValuesV3_(values) {
  const clean = values.map(productNumber_).filter((value) => Number.isFinite(value));
  if (clean.length < PRODUCT_REPORTS_DEFAULTS.minimum_winsor_observations) {
    return { values: clean, meta: { applied: false, observation_count: clean.length, lower_cap: null, upper_cap: null, adjusted_count: 0 } };
  }
  const lower = productPercentileV3_(clean, PRODUCT_REPORTS_DEFAULTS.winsor_lower_percentile);
  const upper = productPercentileV3_(clean, PRODUCT_REPORTS_DEFAULTS.winsor_upper_percentile);
  let adjusted = 0;
  const result = clean.map((value) => {
    if (value < lower) { adjusted += 1; return lower; }
    if (value > upper) { adjusted += 1; return upper; }
    return value;
  });
  return { values: result, meta: { applied: true, observation_count: clean.length, lower_cap: lower, upper_cap: upper, adjusted_count: adjusted } };
}

function productPercentileV3_(values, percentile) {
  const clean = values.map(productNumber_).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const index = (clean.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return clean[lower];
  return clean[lower] + (clean[upper] - clean[lower]) * (index - lower);
}

function productAverage_(values) {
  const clean = values.map(productNumber_).filter((value) => Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function productStdDev_(values) {
  const clean = values.map(productNumber_).filter((value) => Number.isFinite(value));
  if (clean.length < 2) return 0;
  const average = productAverage_(clean);
  return Math.sqrt(clean.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / (clean.length - 1));
}

function averageDaysBetweenV3_(dates) {
  const sorted = dates.filter(Boolean).sort((a, b) => a - b);
  if (sorted.length < 2) return 0;
  const gaps = [];
  for (let index = 1; index < sorted.length; index += 1) gaps.push((sorted[index] - sorted[index - 1]) / 86400000);
  return productAverage_(gaps);
}

function latestSupplierV3_(purchases) {
  const sorted = purchases.slice().sort((a, b) => a.date - b.date);
  return sorted.length ? sorted[sorted.length - 1].supplier_id : "";
}

function productDateV3_(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function productDateKeyV3_(value) {
  const date = productDateV3_(value);
  return date ? Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd") : "";
}

function productWeekStartV3_(value) {
  const date = productDateV3_(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return date;
}

function productWeekKeyV3_(value) {
  return productDateKeyV3_(productWeekStartV3_(value));
}

function productNumber_(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function positiveProductNumber_() {
  for (let index = 0; index < arguments.length; index += 1) {
    const value = Number(arguments[index]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}
