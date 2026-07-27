var PRODUCT_DASHBOARD_VERSION = "product-dashboard-v4-2026-07-25";
var PRODUCT_DASHBOARD_SAFETY_FACTOR = 0.30;
var PRODUCT_DASHBOARD_TARGET_WEEKS = 4;

/**
 * Sole Product Analytics endpoint.
 *
 * Financial rules:
 * 1. Sales line unit_cost is a cost per sold package/unit, never cost per lb.
 * 2. Pounds sold come from inventory_qty_required first.
 * 3. New operational sales use the frozen sales-line cost first.
 * 4. Historical imports are checked against a matching purchase package size.
 * 5. Missing or incompatible costs stay null and are excluded from margin rankings.
 */
function getOperationalReports(payload) {
  payload = payload || {};
  var products = readTable_("PRODUCTS").filter(pdActive_);
  var productMap = pdMap_(products, "product_id");
  var suppliers = pdMap_(readTable_("SUPPLIERS"), "supplier_id");
  var purchaseOrders = pdMap_(readTable_("PURCHASE_ORDERS"), "po_id");
  var salesOrders = pdMap_(readTable_("SALES_ORDERS"), "sales_order_id");
  var lots = pdMap_(readTable_("LOTS"), "internal_lot_id");
  var purchaseLines = readTable_("PURCHASE_ORDER_LINES");
  var salesLines = readTable_("SALES_ORDER_LINES");

  var purchases = pdPurchases_(purchaseLines, purchaseOrders, suppliers, productMap);
  var purchasesByProduct = pdGroup_(purchases, "product_id");
  var sales = pdSales_(salesLines, salesOrders, lots, purchasesByProduct, productMap, payload);
  var salesByProduct = pdGroup_(sales, "product_id");
  var inventory = pdGroup_(inventorySnapshot(), "product_id");
  var incoming = pdIncoming_(purchaseOrders, purchaseLines);
  var committed = pdCommitted_(salesOrders, salesLines);
  var analytics = {};
  var list = [];

  products.forEach(function(product) {
    var id = String(product.product_id || "");
    if (!id) return;
    analytics[id] = pdProduct_(
      product,
      inventory[id] || [],
      salesByProduct[id] || [],
      purchasesByProduct[id] || [],
      pdNum_(incoming[id]),
      pdNum_(committed[id]),
      suppliers
    );
    list.push({
      product_id: id,
      product_name: product.product_name || id,
      category: product.product_category || "Uncategorized"
    });
  });

  list.sort(function(a, b) {
    return String(a.product_name).localeCompare(String(b.product_name), undefined, { sensitivity: "base" });
  });

  return {
    version: PRODUCT_DASHBOARD_VERSION,
    calculated_at: new Date().toISOString(),
    products: list,
    productAnalytics: analytics,
    overview: pdOverview_(analytics),
    filters: {
      categories: pdUnique_(list.map(function(row) { return row.category; })).sort()
    }
  };
}

function pdProduct_(product, inventory, sales, purchases, incoming, committed, suppliers) {
  sales.sort(pdDateSort_);
  purchases.sort(pdDateSort_);

  var available = pdSum_(inventory, function(row) {
    return pdNum_(row.available_qty !== undefined ? row.available_qty : row.current_qty);
  });
  var reserved = pdSum_(inventory, function(row) { return pdNum_(row.reserved_qty); });
  var inventoryValue = pdSum_(inventory, function(row) { return pdNum_(row.inventory_value); });
  var inventoryCost = available > 0 ? inventoryValue / available : pdWeighted_(purchases, "cost_per_lb", "quantity_lb");
  var demand = pdDemand_(sales);
  var leadDays = pdLead_(purchases, suppliers);
  var leadWeeks = Math.max(leadDays / 7, 1 / 7);
  var safety = demand.weekly * leadWeeks * PRODUCT_DASHBOARD_SAFETY_FACTOR;
  var reorder = demand.weekly * leadWeeks + safety;
  var target = reorder + demand.weekly * PRODUCT_DASHBOARD_TARGET_WEEKS;
  var position = available + incoming - committed;
  var unitWeight = pdUnitWeight_(product, purchases);
  var recommended = Math.max(0, target - position);
  var roundedRecommended = unitWeight > 0 ? Math.ceil(recommended / unitWeight) * unitWeight : Math.ceil(recommended);

  var volume = pdSum_(sales, function(row) { return row.quantity_lb; });
  var revenue = pdSum_(sales, function(row) { return row.revenue; });
  var costedSales = sales.filter(function(row) { return row.estimated_cost !== null && row.estimated_cost !== undefined; });
  var costedVolume = pdSum_(costedSales, function(row) { return row.quantity_lb; });
  var costedRevenue = pdSum_(costedSales, function(row) { return row.revenue; });
  var cost = pdSum_(costedSales, function(row) { return row.estimated_cost; });
  var sellingPrice = costedVolume > 0 ? costedRevenue / costedVolume : (volume > 0 ? revenue / volume : 0);
  var salesCost = costedVolume > 0 ? cost / costedVolume : null;
  var margin = costedRevenue > 0 ? (costedRevenue - cost) / costedRevenue * 100 : null;
  var profitPerLb = costedVolume > 0 ? (costedRevenue - cost) / costedVolume : null;
  var weeks = demand.weekly > 0 ? available / demand.weekly : null;
  var expiration = pdExpiration_(inventory, demand.average_daily_demand, inventoryCost);
  var missingSalesCost = sales.length - costedSales.length;
  var missingInventoryCost = inventory.filter(function(row) {
    return pdNum_(row.cost_per_lb !== undefined ? row.cost_per_lb : row.unit_cost) <= 0;
  }).length;
  var missingWeight = purchases.filter(function(row) { return row.purchase_unit_weight_lb <= 0; }).length;
  var coverage = revenue > 0 ? costedRevenue / revenue * 100 : 0;

  return {
    product_id: product.product_id,
    product_name: product.product_name || product.product_id,
    category: product.product_category || "Uncategorized",
    summary: {
      available_inventory: pdRound_(available, 2),
      reserved_inventory: pdRound_(reserved, 2),
      incoming_purchases: pdRound_(incoming, 2),
      committed_sales: pdRound_(committed, 2),
      inventory_position: pdRound_(position, 2),
      inventory_value: pdRound_(inventoryValue, 2),
      weekly_demand: pdRound_(demand.weekly, 2),
      weeks_of_supply: weeks === null ? null : pdRound_(weeks, 2),
      selling_price_per_lb: pdRound_(sellingPrice, 4),
      cost_per_lb: salesCost === null ? null : pdRound_(salesCost, 4),
      profit_per_lb: profitPerLb === null ? null : pdRound_(profitPerLb, 4),
      gross_margin_percent: margin === null ? null : pdRound_(margin, 2),
      revenue: pdRound_(revenue, 2),
      estimated_gross_profit: margin === null ? null : pdRound_(costedRevenue - cost, 2),
      sales_volume_lb: pdRound_(volume, 2),
      costed_revenue: pdRound_(costedRevenue, 2),
      costed_sales_volume_lb: pdRound_(costedVolume, 2),
      cost_coverage_percent: pdRound_(coverage, 2),
      last_sale_date: sales.length ? sales[sales.length - 1].date : "",
      last_purchase_date: purchases.length ? purchases[purchases.length - 1].date : ""
    },
    planning: {
      lead_time_days: pdRound_(leadDays, 1),
      safety_stock: pdRound_(safety, 2),
      demand_during_lead_time: pdRound_(demand.weekly * leadWeeks, 2),
      reorder_point: pdRound_(reorder, 2),
      target_stock: pdRound_(target, 2),
      recommended_purchase_lb: pdRound_(roundedRecommended, 2),
      recommended_purchase_units: unitWeight > 0 ? Math.ceil(roundedRecommended / unitWeight) : 0,
      purchase_unit_weight_lb: pdRound_(unitWeight, 2),
      projected_stock_after_purchase: pdRound_(position + roundedRecommended, 2)
    },
    demand: demand,
    financial: {
      weighted_selling_price_per_lb: pdRound_(sellingPrice, 4),
      weighted_cost_per_lb: salesCost === null ? null : pdRound_(salesCost, 4),
      profit_per_lb: profitPerLb === null ? null : pdRound_(profitPerLb, 4),
      gross_margin_percent: margin === null ? null : pdRound_(margin, 2),
      total_revenue: pdRound_(revenue, 2),
      costed_revenue: pdRound_(costedRevenue, 2),
      estimated_total_cost: margin === null ? null : pdRound_(cost, 2),
      estimated_gross_profit: margin === null ? null : pdRound_(costedRevenue - cost, 2),
      cost_coverage_percent: pdRound_(coverage, 2)
    },
    inventory: inventory.map(pdInventoryRow_),
    expiration: expiration,
    sales: sales,
    purchases: purchases,
    recommendation: pdRecommendation_({
      expiration: expiration,
      position: position,
      reorder: reorder,
      recommended: roundedRecommended,
      margin: margin,
      weeks: weeks,
      salesCount: sales.length,
      missingCost: missingSalesCost + missingInventoryCost,
      missingWeight: missingWeight,
      coverage: coverage
    }),
    data_quality: {
      missing_cost_count: missingSalesCost + missingInventoryCost,
      missing_weight_count: missingWeight,
      sales_observation_count: sales.length,
      costed_sales_observation_count: costedSales.length,
      purchase_observation_count: purchases.length,
      cost_coverage_percent: pdRound_(coverage, 2),
      is_ready: coverage >= 95 && sales.length > 0,
      summary: pdQualitySummary_(missingSalesCost + missingInventoryCost, missingWeight, sales.length, coverage)
    }
  };
}

function pdOverview_(analytics) {
  var rows = Object.keys(analytics).map(function(key) { return analytics[key]; });
  var revenue = pdSum_(rows, function(row) { return row.summary.revenue; });
  var volume = pdSum_(rows, function(row) { return row.summary.sales_volume_lb; });
  var costedRevenue = pdSum_(rows, function(row) { return row.summary.costed_revenue; });
  var costedVolume = pdSum_(rows, function(row) { return row.summary.costed_sales_volume_lb; });
  var cost = pdSum_(rows, function(row) { return row.financial.estimated_total_cost; });
  var attention = [];
  rows.forEach(function(row) {
    pdAttention_(row).forEach(function(item) { attention.push(item); });
  });
  attention.sort(function(a, b) { return b.priority - a.priority; });
  var marginRows = rows.filter(function(row) {
    return row.summary.gross_margin_percent !== null && row.summary.cost_coverage_percent >= 50;
  });

  return {
    kpis: {
      weighted_selling_price_per_lb: costedVolume > 0 ? pdRound_(costedRevenue / costedVolume, 4) : (volume > 0 ? pdRound_(revenue / volume, 4) : 0),
      weighted_cost_per_lb: costedVolume > 0 ? pdRound_(cost / costedVolume, 4) : null,
      gross_margin_percent: costedRevenue > 0 ? pdRound_((costedRevenue - cost) / costedRevenue * 100, 2) : null,
      inventory_value: pdRound_(pdSum_(rows, function(row) { return row.summary.inventory_value; }), 2),
      reorder_alert_count: rows.filter(function(row) {
        return row.summary.inventory_position <= row.planning.reorder_point && row.summary.weekly_demand > 0;
      }).length,
      expiring_inventory_value: pdRound_(pdSum_(rows, function(row) { return row.expiration.value_at_risk; }), 2),
      revenue: pdRound_(revenue, 2),
      sales_volume_lb: pdRound_(volume, 2),
      costed_revenue: pdRound_(costedRevenue, 2),
      costed_sales_volume_lb: pdRound_(costedVolume, 2),
      cost_coverage_percent: revenue > 0 ? pdRound_(costedRevenue / revenue * 100, 2) : 0
    },
    attention: attention.slice(0, 50),
    highest_demand: pdRank_(rows, "weekly_demand", true),
    best_margins: pdRank_(marginRows, "gross_margin_percent", true),
    lowest_margins: pdRank_(marginRows, "gross_margin_percent", false),
    expiration_risk: rows.filter(function(row) {
      return row.expiration.inventory_at_risk > 0;
    }).map(function(row) {
      return {
        product_id: row.product_id,
        product_name: row.product_name,
        category: row.category,
        inventory_at_risk: row.expiration.inventory_at_risk,
        value_at_risk: row.expiration.value_at_risk,
        nearest_expiration_date: row.expiration.nearest_expiration_date,
        days_remaining: row.expiration.days_remaining,
        risk_level: row.expiration.risk_level
      };
    }).sort(function(a, b) { return b.value_at_risk - a.value_at_risk; }),
    comparison: rows.map(function(row) {
      return {
        product_id: row.product_id,
        product_name: row.product_name,
        category: row.category,
        volume_lb: row.summary.sales_volume_lb,
        weekly_demand: row.summary.weekly_demand,
        margin_percent: row.summary.gross_margin_percent,
        selling_price_per_lb: row.summary.selling_price_per_lb,
        cost_per_lb: row.summary.cost_per_lb,
        inventory_position: row.summary.inventory_position,
        weeks_of_supply: row.summary.weeks_of_supply,
        observation_count: row.demand.sales_order_count,
        cost_coverage_percent: row.summary.cost_coverage_percent
      };
    })
  };
}

function pdPurchases_(lines, orders, suppliers, products) {
  return (lines || []).map(function(line) {
    var order = orders[String(line.po_id || "")] || {};
    var orderStatus = String(order.po_status || "").toUpperCase();
    var lineStatus = String(line.line_status || "").toUpperCase();
    var eligible = ["COMPLETE", "COMPLETED", "RECEIVED", "CLOSED"].indexOf(orderStatus) >= 0 ||
      ["RECEIVED", "COMPLETE", "COMPLETED"].indexOf(lineStatus) >= 0;
    if (!eligible || ["CANCELLED", "CANCELED", "VOID"].indexOf(orderStatus) >= 0) return null;
    if (String(line.base_unit || "").toUpperCase() !== "LB") return null;

    var qtyLb = pdPurchaseQty_(line, products[line.product_id] || {});
    var purchaseUnits = pdNum_(line.qty_ordered);
    var total = pdNum_(line.line_total) || purchaseUnits * pdNum_(line.unit_cost);
    var weight = purchaseUnits > 0 && qtyLb > 0 ? qtyLb / purchaseUnits : pdUnitWeightLine_(line, products[line.product_id] || {});
    if (!line.product_id || qtyLb <= 0 || total <= 0 || weight <= 0) return null;

    var supplierId = line.supplier_id || order.supplier_id || "";
    return {
      product_id: line.product_id,
      po_id: line.po_id || "",
      po_line_id: line.po_line_id || "",
      date: pdDate_(order.actual_completed_date || order.actual_first_received_date || order.order_date),
      supplier: (suppliers[supplierId] || {}).supplier_name || supplierId || "Supplier",
      supplier_id: supplierId,
      status: orderStatus || lineStatus,
      quantity_lb: pdRound_(qtyLb, 4),
      cost_per_lb: pdRound_(total / qtyLb, 6),
      total_cost: pdRound_(total, 2),
      purchase_units: pdRound_(purchaseUnits, 4),
      purchase_unit_type: line.unit_type || "",
      purchase_unit_weight_lb: pdRound_(weight, 6)
    };
  }).filter(Boolean);
}

function pdSales_(lines, orders, lots, purchasesByProduct, products, payload) {
  return (lines || []).map(function(line) {
    var order = orders[String(line.sales_order_id || "")] || {};
    var status = String(order.status || line.line_status || "").toUpperCase();
    if (!line.product_id || ["DELIVERED", "SHIPPED"].indexOf(status) < 0) return null;

    var product = products[line.product_id] || {};
    var qty = pdNum_(line.qty_ordered);
    var pounds = pdSalesQty_(line, product);
    var revenue = pdNum_(line.line_total) || qty * pdNum_(line.unit_price);
    var date = pdDate_(order.delivered_at || order.shipped_at || order.order_date || order.created_at);
    if (qty <= 0 || pounds <= 0 || revenue <= 0) return null;
    if (!pdDateAllowed_(date, payload)) return null;

    var cost = pdResolveSaleCost_(line, qty, pounds, date, lots, purchasesByProduct[line.product_id] || []);
    var costPerLb = cost.total_cost !== null ? cost.total_cost / pounds : null;
    return {
      product_id: line.product_id,
      sales_order_id: line.sales_order_id || "",
      sales_order_line_id: line.sales_order_line_id || "",
      date: date,
      customer: order.customer_name || order.customer_id || "Customer",
      source: order.order_source || order.channel || line.channel || "Sales Order",
      status: status,
      quantity_lb: pdRound_(pounds, 4),
      selling_price_per_lb: pdRound_(revenue / pounds, 6),
      revenue: pdRound_(revenue, 2),
      cost_per_lb: costPerLb === null ? null : pdRound_(costPerLb, 6),
      estimated_cost: cost.total_cost === null ? null : pdRound_(cost.total_cost, 2),
      estimated_margin_percent: cost.total_cost === null ? null : pdRound_((revenue - cost.total_cost) / revenue * 100, 2),
      cost_source: cost.source,
      lot_id: line.preferred_internal_lot_id || "",
      location_id: line.preferred_location_id || "",
      unit_type: line.unit_type || "",
      unit_weight_lbs: pdNum_(line.unit_weight_lbs),
      qty_ordered: qty
    };
  }).filter(Boolean);
}

function pdResolveSaleCost_(line, qty, pounds, saleDate, lots, purchases) {
  var savedUnitCost = pdNullableNum_(line.unit_cost);
  var savedTotal = savedUnitCost !== null && savedUnitCost > 0 ? qty * savedUnitCost : null;
  var savedPerLb = savedTotal !== null ? savedTotal / pounds : null;
  var historical = /HISTORICAL/i.test(String(line.notes || "")) || String(line.fefo_status || "").toUpperCase() === "HISTORICAL";
  var lot = lots[String(line.preferred_internal_lot_id || "")];
  var lotCost = pdLotCostPerLb_(lot);

  if (!historical && savedTotal !== null) return { total_cost: savedTotal, source: "SALES_LINE" };
  if (lotCost !== null) return { total_cost: pounds * lotCost, source: "EXACT_LOT" };

  var unitWeight = qty > 0 ? pounds / qty : pdNum_(line.unit_weight_lbs);
  var targetDate = pdParseDate_(saleDate);
  var prior = (purchases || []).filter(function(row) {
    var d = pdParseDate_(row.date);
    return row.cost_per_lb > 0 && (!targetDate || !d || d <= targetDate);
  });
  if (!prior.length) prior = (purchases || []).slice();

  var packageMatches = prior.filter(function(row) {
    var tolerance = Math.max(0.25, unitWeight * 0.02);
    return row.purchase_unit_weight_lb > 0 && Math.abs(row.purchase_unit_weight_lb - unitWeight) <= tolerance;
  });
  var packageCost = pdWeightedMedian_(packageMatches, "cost_per_lb", "quantity_lb");

  if (historical) {
    if (packageCost !== null) {
      if (savedPerLb !== null && Math.abs(savedPerLb - packageCost) / packageCost <= 0.10) {
        return { total_cost: savedTotal, source: "HISTORICAL_SALES_LINE" };
      }
      return { total_cost: pounds * packageCost, source: "PURCHASE_PACKAGE" };
    }
    if (unitWeight <= 1.02 && savedTotal !== null) {
      return { total_cost: savedTotal, source: "HISTORICAL_PER_LB" };
    }
    return { total_cost: null, source: "MISSING_PACKAGE_MATCH" };
  }

  if (packageCost !== null) return { total_cost: pounds * packageCost, source: "PURCHASE_PACKAGE" };
  return { total_cost: null, source: "MISSING" };
}

function pdPurchaseQty_(line, product) {
  var expected = pdNum_(line.expected_base_qty);
  if (expected > 0) return expected;
  var qty = pdNum_(line.qty_ordered);
  var unitType = String(line.unit_type || "").toUpperCase();
  if (["LB", "LBS", "POUND", "POUNDS"].indexOf(unitType) >= 0) return qty;
  var weight = pdNum_(line.case_weight_lbs) || pdNum_(line.units_per_purchase_unit) || pdNum_(product.case_weight_lbs) || pdNum_(product.units_per_purchase_unit);
  return qty > 0 && weight > 0 ? qty * weight : 0;
}

function pdSalesQty_(line, product) {
  var required = pdNum_(line.inventory_qty_required);
  if (required > 0) return required;
  var qty = pdNum_(line.qty_ordered);
  var inventoryUnit = String(line.inventory_unit_type || "").toUpperCase();
  var saleUnit = String(line.unit_type || "").toUpperCase();
  if (["LB", "LBS", "POUND", "POUNDS"].indexOf(saleUnit) >= 0 && pdNum_(line.unit_weight_lbs) <= 1.02) return qty;
  var weight = pdNum_(line.unit_weight_lbs) || pdNum_(product.case_weight_lbs) || pdNum_(product.units_per_purchase_unit);
  if (inventoryUnit === "LB" && qty > 0 && weight > 0) return qty * weight;
  return 0;
}

function pdLotCostPerLb_(lot) {
  if (!lot) return null;
  var purchaseCost = pdNullableNum_(lot.unit_cost);
  var original = pdNum_(lot.original_qty);
  var purchaseQty = pdNum_(lot.purchase_qty_received);
  if (purchaseCost === null || purchaseCost <= 0 || original <= 0 || purchaseQty <= 0) return null;
  var weight = original / purchaseQty;
  return weight > 0 ? purchaseCost / weight : null;
}

function pdDateAllowed_(dateValue, payload) {
  payload = payload || {};
  var date = pdParseDate_(dateValue);
  if (!date) return true;
  var start = pdParseDate_(payload.start_date || payload.startDate);
  var end = pdParseDate_(payload.end_date || payload.endDate);
  var period = String(payload.period || payload.period_days || "ALL").toUpperCase();
  var now = new Date();
  if (!start && /^\d+$/.test(period)) start = new Date(now.getTime() - Number(period) * 86400000);
  if (!start && period === "YTD") start = new Date(now.getFullYear(), 0, 1);
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function pdAttention_(row) {
  var out = [];
  if (row.expiration.inventory_at_risk > 0) out.push(pdAttentionRow_(row, "EXPIRATION", 100, "Move expiring inventory", pdRound_(row.expiration.inventory_at_risk, 0) + " lb may remain at expiration."));
  if (row.summary.inventory_position <= row.planning.reorder_point && row.summary.weekly_demand > 0) out.push(pdAttentionRow_(row, "REORDER", 85, "Reorder now", "Inventory position is below the calculated reorder point."));
  if (row.summary.gross_margin_percent !== null && row.summary.cost_coverage_percent >= 50 && row.summary.gross_margin_percent < 5) out.push(pdAttentionRow_(row, "LOW_MARGIN", 75, "Review price or cost", "Gross margin is " + pdRound_(row.summary.gross_margin_percent, 1) + "% on costed sales."));
  if (row.summary.weeks_of_supply !== null && row.summary.weeks_of_supply > 16) out.push(pdAttentionRow_(row, "EXCESS", 65, "Reduce purchasing", pdRound_(row.summary.weeks_of_supply, 1) + " weeks of supply are currently available."));
  if (row.data_quality.cost_coverage_percent < 95 && row.data_quality.sales_observation_count > 0) out.push(pdAttentionRow_(row, "MISSING_DATA", 45, "Complete cost data", pdRound_(row.data_quality.cost_coverage_percent, 1) + "% of sales revenue has a usable cost."));
  return out;
}

function pdAttentionRow_(row, type, priority, title, reason) {
  return { product_id: row.product_id, product_name: row.product_name, category: row.category, type: type, priority: priority, title: title, reason: reason };
}

function pdRank_(rows, key, desc) {
  return rows.slice().sort(function(a, b) {
    var d = pdNum_(a.summary[key]) - pdNum_(b.summary[key]);
    return desc ? -d : d;
  }).slice(0, 10).map(function(row) {
    return {
      product_id: row.product_id,
      product_name: row.product_name,
      category: row.category,
      weekly_demand: row.summary.weekly_demand,
      weeks_of_supply: row.summary.weeks_of_supply,
      margin_percent: row.summary.gross_margin_percent,
      profit_per_lb: row.summary.profit_per_lb,
      sales_volume_lb: row.summary.sales_volume_lb,
      selling_price_per_lb: row.summary.selling_price_per_lb,
      cost_per_lb: row.summary.cost_per_lb,
      cost_coverage_percent: row.summary.cost_coverage_percent
    };
  });
}

function pdInventoryRow_(row) {
  return {
    internal_lot_id: row.internal_lot_id || "",
    supplier_lot_number: row.lot && row.lot.supplier_lot_number || "",
    location_id: row.location_id || "",
    available_qty: pdRound_(pdNum_(row.available_qty !== undefined ? row.available_qty : row.current_qty), 2),
    reserved_qty: pdRound_(pdNum_(row.reserved_qty), 2),
    received_date: pdDate_(row.lot && row.lot.received_date || row.received_date),
    expiration_date: pdDate_(row.expiration_date || row.lot && row.lot.expiration_date),
    cost_per_lb: pdRound_(pdNum_(row.cost_per_lb !== undefined ? row.cost_per_lb : row.unit_cost), 4),
    inventory_value: pdRound_(pdNum_(row.inventory_value), 2),
    status: row.inventory_status || row.value_status || "AVAILABLE"
  };
}

function pdDemand_(sales) {
  var weeks = {}, dates = [], quantities = [];
  sales.forEach(function(row) {
    var date = pdParseDate_(row.date);
    if (!date) return;
    var key = pdWeek_(date);
    weeks[key] = pdNum_(weeks[key]) + pdNum_(row.quantity_lb);
    dates.push(date.getTime());
    quantities.push(pdNum_(row.quantity_lb));
  });
  var keys = Object.keys(weeks).sort();
  var values = keys.map(function(key) { return weeks[key]; });
  var recent = pdAverage_(values.slice(-4));
  var previous = pdAverage_(values.slice(-8, -4));
  var weighted = 0, weights = 0;
  values.slice(-26).forEach(function(value, index, arr) {
    var age = arr.length - 1 - index;
    var weight = age < 4 ? 3 : age < 12 ? 2 : 1;
    weighted += value * weight;
    weights += weight;
  });
  dates.sort(function(a, b) { return a - b; });
  var gaps = dates.slice(1).map(function(date, index) { return (date - dates[index]) / 86400000; });
  var weekly = weights ? weighted / weights : 0;
  return {
    recency_weighted_weekly_demand: pdRound_(weekly, 2),
    weekly: pdRound_(weekly, 2),
    average_weekly_demand: pdRound_(pdAverage_(values), 2),
    average_daily_demand: pdRound_(pdAverage_(values) / 7, 2),
    weekly_variability: pdRound_(pdStd_(values), 2),
    trend_percent: previous > 0 ? pdRound_((recent - previous) / previous * 100, 2) : 0,
    trend_label: previous > 0 && (recent - previous) / previous > .1 ? "Increasing" : previous > 0 && (recent - previous) / previous < -.1 ? "Declining" : "Stable",
    average_order_volume_lb: pdRound_(pdAverage_(quantities), 2),
    median_order_volume_lb: pdRound_(pdMedian_(quantities), 2),
    order_volume_variability: pdRound_(pdStd_(quantities), 2),
    average_days_between_orders: pdRound_(pdAverage_(gaps), 1),
    sales_order_count: sales.length,
    weekly_series: keys.map(function(key) { return { period: key, quantity_lb: pdRound_(weeks[key], 2) }; })
  };
}

function pdExpiration_(inventory, dailyDemand, fallbackCost) {
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var atRisk = 0, value = 0, nearest = "", nearestDays = null, rows = [];
  inventory.forEach(function(row) {
    var date = pdParseDate_(row.expiration_date || row.lot && row.lot.expiration_date);
    if (!date) return;
    date.setHours(0, 0, 0, 0);
    var days = Math.ceil((date - today) / 86400000);
    var available = pdNum_(row.available_qty !== undefined ? row.available_qty : row.current_qty);
    var expected = Math.max(0, dailyDemand * Math.max(days, 0));
    var risk = Math.max(0, available - expected);
    var cost = pdNum_(row.cost_per_lb !== undefined ? row.cost_per_lb : row.unit_cost) || fallbackCost;
    if (nearestDays === null || days < nearestDays) { nearestDays = days; nearest = pdDate_(date); }
    atRisk += risk; value += risk * cost;
    rows.push({ lot_id: row.internal_lot_id || "", location_id: row.location_id || "", expiration_date: pdDate_(date), days_remaining: days, available_qty: pdRound_(available, 2), expected_sales_before_expiration: pdRound_(expected, 2), inventory_at_risk: pdRound_(risk, 2), value_at_risk: pdRound_(risk * cost, 2), risk_level: days <= 14 && risk > 0 ? "HIGH" : days <= 30 && risk > 0 ? "MEDIUM" : "LOW" });
  });
  return { inventory_at_risk: pdRound_(atRisk, 2), value_at_risk: pdRound_(value, 2), nearest_expiration_date: nearest, days_remaining: nearestDays, risk_level: atRisk <= 0 ? "LOW" : nearestDays !== null && nearestDays <= 14 ? "HIGH" : "MEDIUM", lots: rows.sort(function(a, b) { return a.days_remaining - b.days_remaining; }) };
}

function pdRecommendation_(x) {
  if (x.coverage < 95 && x.salesCount) return { action: "Complete cost data", tone: "warning", reason: pdRound_(x.coverage, 1) + "% of sales revenue currently has a usable product cost.", metric: "Cost coverage" };
  if (x.expiration.inventory_at_risk > 0) return { action: "Move expiring inventory", tone: "danger", reason: pdRound_(x.expiration.inventory_at_risk, 0) + " lb may remain at expiration.", metric: "$" + pdRound_(x.expiration.value_at_risk, 0) + " value at risk" };
  if (x.position <= x.reorder && x.salesCount) return { action: "Reorder now", tone: "danger", reason: "Inventory position is below the calculated reorder point.", metric: pdRound_(x.recommended, 0) + " lb recommended" };
  if (x.margin !== null && x.margin < 5) return { action: "Review price or negotiate cost", tone: "warning", reason: "Gross margin is below 5% on costed sales.", metric: pdRound_(x.margin, 1) + "% margin" };
  if (x.weeks !== null && x.weeks > 16) return { action: "Reduce purchasing", tone: "warning", reason: "Current inventory is well above the calculated target.", metric: pdRound_(x.weeks, 1) + " weeks of supply" };
  if (x.salesCount < 3) return { action: "Wait for more sales history", tone: "neutral", reason: "More transactions are needed for a strong demand recommendation.", metric: x.salesCount + " sales observations" };
  return { action: "Maintain current plan", tone: "success", reason: "Inventory, demand, and margin are within the current range.", metric: x.weeks === null ? "Demand not established" : pdRound_(x.weeks, 1) + " weeks of supply" };
}

function pdIncoming_(orders, lines) {
  var out = {};
  lines.forEach(function(line) {
    var order = orders[line.po_id] || {};
    var status = String(order.po_status || line.line_status || "").toUpperCase();
    if (["CANCELLED", "CANCELED", "VOID", "CLOSED", "COMPLETE", "RECEIVED"].indexOf(status) >= 0) return;
    var remaining = pdNum_(line.qty_remaining);
    if (remaining <= 0) remaining = Math.max(0, pdNum_(line.qty_ordered) - pdNum_(line.qty_received_total));
    out[line.product_id] = pdNum_(out[line.product_id]) + remaining * pdUnitWeightLine_(line, {});
  });
  return out;
}

function pdCommitted_(orders, lines) {
  var out = {};
  lines.forEach(function(line) {
    var order = orders[line.sales_order_id] || {};
    var status = String(order.status || line.line_status || "").toUpperCase();
    if (["DELIVERED", "SHIPPED", "CANCELLED", "CANCELED", "VOID", "DRAFT"].indexOf(status) >= 0) return;
    var remaining = pdNum_(line.qty_remaining);
    if (remaining <= 0) remaining = Math.max(0, pdNum_(line.qty_ordered) - pdNum_(line.qty_picked));
    var required = pdNum_(line.inventory_qty_required), ordered = pdNum_(line.qty_ordered);
    out[line.product_id] = pdNum_(out[line.product_id]) + (ordered > 0 && required > 0 ? required * remaining / ordered : remaining * (pdNum_(line.unit_weight_lbs) || 1));
  });
  return out;
}

function pdUnitWeightLine_(line, product) {
  return pdNum_(line.case_weight_lbs) || pdNum_(line.units_per_purchase_unit) || pdNum_(product.case_weight_lbs) || pdNum_(product.units_per_purchase_unit);
}
function pdUnitWeight_(product, purchases) {
  var values = purchases.map(function(row) { return row.purchase_unit_weight_lb; }).filter(function(value) { return value > 0; });
  return values.length ? pdMedian_(values) : pdNum_(product.case_weight_lbs) || pdNum_(product.units_per_purchase_unit);
}
function pdLead_(purchases, suppliers) {
  var last = purchases.length ? purchases[purchases.length - 1] : {}, supplier = suppliers[last.supplier_id] || {};
  return pdNum_(supplier.lead_time_expected_days, 7) || 7;
}
function pdQualitySummary_(cost, weight, sales, coverage) {
  var parts = [];
  if (!sales) parts.push("no completed sales history");
  if (cost) parts.push(cost + " records missing a usable cost");
  if (weight) parts.push(weight + " purchase records missing unit weight");
  if (sales && coverage < 95) parts.push(pdRound_(coverage, 1) + "% revenue cost coverage");
  return parts.length ? parts.join("; ") : "Data is ready for analysis.";
}
function pdWeightedMedian_(rows, valueKey, weightKey) {
  var clean = (rows || []).filter(function(row) { return pdNum_(row[valueKey]) > 0 && pdNum_(row[weightKey]) > 0; }).sort(function(a, b) { return pdNum_(a[valueKey]) - pdNum_(b[valueKey]); });
  if (!clean.length) return null;
  var total = pdSum_(clean, function(row) { return row[weightKey]; });
  var cumulative = 0;
  for (var i = 0; i < clean.length; i++) {
    cumulative += pdNum_(clean[i][weightKey]);
    if (cumulative >= total / 2) return pdNum_(clean[i][valueKey]);
  }
  return pdNum_(clean[clean.length - 1][valueKey]);
}
function pdMap_(rows, key) { return (rows || []).reduce(function(map, row) { map[String(row[key] || "")] = row; return map; }, {}); }
function pdGroup_(rows, key) { return (rows || []).reduce(function(map, row) { var id = String(row[key] || ""); if (!map[id]) map[id] = []; map[id].push(row); return map; }, {}); }
function pdActive_(row) { return row.is_active !== false && String(row.is_active || "TRUE").toUpperCase() !== "FALSE" && String(row.is_active || "1") !== "0"; }
function pdNullableNum_(value) { if (value === "" || value === null || value === undefined) return null; var n = Number(value); return Number.isFinite(n) ? n : null; }
function pdNum_(value, fallback) { var n = Number(value); return Number.isFinite(n) ? n : (fallback === undefined ? 0 : fallback); }
function pdRound_(value, digits) { if (value === null || value === undefined) return null; var f = Math.pow(10, digits === undefined ? 2 : digits); return Math.round((pdNum_(value) + Number.EPSILON) * f) / f; }
function pdSum_(rows, getter) { return (rows || []).reduce(function(sum, row) { return sum + pdNum_(getter(row)); }, 0); }
function pdAverage_(values) { return values && values.length ? values.reduce(function(sum, value) { return sum + pdNum_(value); }, 0) / values.length : 0; }
function pdMedian_(values) { var rows = (values || []).map(pdNum_).sort(function(a, b) { return a - b; }); if (!rows.length) return 0; var m = Math.floor(rows.length / 2); return rows.length % 2 ? rows[m] : (rows[m - 1] + rows[m]) / 2; }
function pdStd_(values) { if (!values || values.length < 2) return 0; var avg = pdAverage_(values); return Math.sqrt(values.reduce(function(sum, value) { return sum + Math.pow(pdNum_(value) - avg, 2); }, 0) / (values.length - 1)); }
function pdWeighted_(rows, valueKey, weightKey) { var n = 0, d = 0; (rows || []).forEach(function(row) { var value = pdNum_(row[valueKey]), weight = pdNum_(row[weightKey]); if (value > 0 && weight > 0) { n += value * weight; d += weight; } }); return d > 0 ? n / d : 0; }
function pdUnique_(rows) { var seen = {}; return (rows || []).filter(function(value) { var key = String(value || ""); if (!key || seen[key]) return false; seen[key] = true; return true; }); }
function pdParseDate_(value) { if (!value) return null; var date = value instanceof Date ? new Date(value.getTime()) : new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
function pdDate_(value) { var date = pdParseDate_(value); return date ? Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd") : ""; }
function pdWeek_(date) { var copy = new Date(date.getTime()), day = (copy.getDay() + 6) % 7; copy.setDate(copy.getDate() - day); return pdDate_(copy); }
function pdDateSort_(a, b) { return String(a.date || "").localeCompare(String(b.date || "")); }
