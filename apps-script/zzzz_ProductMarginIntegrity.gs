/**
 * Product margin integrity patch for codex/professional-ui-refresh.
 * Loaded after zz_ProductDashboard.gs so the assignments below replace only
 * the margin-sensitive helpers without changing the rest of the dashboard.
 */
var PMF_CANCELLED_STATUSES = ["CANCELLED", "CANCELED", "VOID", "DELETED"];
var PMF_COMPLETED_SALES = ["DELIVERED", "SHIPPED"];
var PMF_COST_ELIGIBLE_PURCHASES = ["COMPLETE", "COMPLETED", "RECEIVED", "CLOSED", "PARTIAL", "PARTIALLY_RECEIVED"];
var PMF_AUDIT_BY_PRODUCT = {};

function pmfAudit_(productId) {
  var id = String(productId || "");
  if (!PMF_AUDIT_BY_PRODUCT[id]) PMF_AUDIT_BY_PRODUCT[id] = { cancelled: 0, missing_purchase_weight: 0, missing_purchase_cost: 0, missing_sales_weight: 0, missing_sales_cost: 0, invalid_sales: 0 };
  return PMF_AUDIT_BY_PRODUCT[id];
}

function pmfUnit_(value) {
  var unit = String(value || "").trim().toUpperCase();
  if (["LBS", "POUND", "POUNDS"].indexOf(unit) >= 0) return "LB";
  if (["UNITS", "EA", "EACH", "PIECE", "PIECES", "PCS"].indexOf(unit) >= 0) return "UNIT";
  return unit;
}

function pmfBaseUnit_(product) {
  return pmfUnit_((product || {}).base_unit || "LB") || "LB";
}

function pmfPurchaseConversion_(line, product) {
  return pdNum_(line.case_weight_lbs) || pdNum_(line.units_per_purchase_unit) || pdNum_((product || {}).case_weight_lbs) || pdNum_((product || {}).units_per_purchase_unit);
}

function pmfSalesConversion_(line, product) {
  return pdNum_(line.unit_weight_lbs) || pdNum_((product || {}).case_weight_lbs) || pdNum_((product || {}).units_per_purchase_unit);
}

function pmfPurchaseQty_(line, product) {
  var expected = pdNum_(line.expected_base_qty);
  if (expected > 0) return expected;
  var qty = pdNum_(line.qty_ordered);
  if (qty <= 0) return 0;
  if (pmfUnit_(line.unit_type) === pmfBaseUnit_(product)) return qty;
  var conversion = pmfPurchaseConversion_(line, product);
  return conversion > 0 ? qty * conversion : 0;
}

function pmfSalesQty_(line, product) {
  var required = pdNum_(line.inventory_qty_required);
  if (required > 0) return required;
  var qty = pdNum_(line.qty_ordered);
  if (qty <= 0) return 0;
  if (pmfUnit_(line.unit_type) === pmfBaseUnit_(product)) return qty;
  var conversion = pmfSalesConversion_(line, product);
  return conversion > 0 ? qty * conversion : 0;
}

function pmfLotCost_(lot) {
  var purchaseQty = pdNum_((lot || {}).purchase_qty_received);
  var originalQty = pdNum_((lot || {}).original_qty);
  var unitCost = pdNum_((lot || {}).unit_cost);
  return unitCost > 0 && purchaseQty > 0 && originalQty > 0 ? unitCost / (originalQty / purchaseQty) : 0;
}

pdPurchases_ = function(lines, orders, suppliers, products) {
  PMF_AUDIT_BY_PRODUCT = {};
  return (lines || []).map(function(line) {
    var productId = String(line.product_id || "");
    var product = products[productId];
    if (!productId || !product) return null;
    var order = orders[line.po_id] || {};
    var status = String(order.po_status || line.line_status || "OPEN").toUpperCase();
    var audit = pmfAudit_(productId);
    if (PMF_CANCELLED_STATUSES.indexOf(status) >= 0) {
      audit.cancelled += 1;
      return null;
    }
    var quantity = pmfPurchaseQty_(line, product);
    var total = pdNum_(line.line_total) || pdNum_(line.qty_ordered) * pdNum_(line.unit_cost);
    if (quantity <= 0) {
      audit.missing_purchase_weight += 1;
      return null;
    }
    if (total <= 0) {
      audit.missing_purchase_cost += 1;
      return null;
    }
    var supplierId = line.supplier_id || order.supplier_id || "";
    var conversion = pmfPurchaseConversion_(line, product);
    return {
      product_id: productId,
      po_id: line.po_id || "",
      date: pdDate_(order.order_date || order.actual_first_received_date || order.actual_completed_date),
      supplier: (suppliers[supplierId] || {}).supplier_name || supplierId || "Supplier",
      supplier_id: supplierId,
      status: status,
      cost_eligible: PMF_COST_ELIGIBLE_PURCHASES.indexOf(status) >= 0,
      base_unit: pmfBaseUnit_(product),
      quantity_lb: pdRound_(quantity, 4),
      quantity_base: pdRound_(quantity, 4),
      cost_per_lb: pdRound_(total / quantity, 4),
      cost_per_base_unit: pdRound_(total / quantity, 4),
      total_cost: pdRound_(total, 2),
      purchase_units: pdRound_(pdNum_(line.qty_ordered), 2),
      purchase_unit_type: line.unit_type || "",
      purchase_unit_weight_lb: pdRound_(conversion, 4),
      purchase_unit_weight_base: pdRound_(conversion, 4)
    };
  }).filter(Boolean);
};

pdHistoricalCost_ = function(productId, date, lotId, lots, purchases) {
  if (lotId && lots[lotId]) {
    var exact = pmfLotCost_(lots[lotId]);
    if (exact > 0) return exact;
  }
  var target = pdParseDate_(date);
  var prior = (purchases || []).filter(function(row) {
    var purchaseDate = pdParseDate_(row.date);
    return row.product_id === productId && row.cost_eligible && row.cost_per_base_unit > 0 && (!target || !purchaseDate || purchaseDate <= target);
  }).sort(pdDateSort_);
  if (prior.length) return prior[prior.length - 1].cost_per_base_unit;

  var productLots = Object.keys(lots || {}).map(function(key) { return lots[key]; }).filter(function(lot) {
    var lotDate = pdParseDate_(lot.received_date || lot.created_at);
    return String(lot.product_id || "") === String(productId) && pmfLotCost_(lot) > 0 && (!target || !lotDate || lotDate <= target);
  }).sort(function(a, b) {
    var left = pdParseDate_(a.received_date || a.created_at);
    var right = pdParseDate_(b.received_date || b.created_at);
    return (left ? left.getTime() : 0) - (right ? right.getTime() : 0);
  });
  return productLots.length ? pmfLotCost_(productLots[productLots.length - 1]) : 0;
};

pdSales_ = function(lines, orders, lots, purchases, products) {
  return (lines || []).map(function(line) {
    var productId = String(line.product_id || "");
    var product = products[productId];
    if (!productId || !product) return null;
    var order = orders[line.sales_order_id] || {};
    var status = String(order.status || line.line_status || "OPEN").toUpperCase();
    if (PMF_CANCELLED_STATUSES.indexOf(status) >= 0 || PMF_COMPLETED_SALES.indexOf(status) < 0) return null;
    var audit = pmfAudit_(productId);
    var quantity = pmfSalesQty_(line, product);
    var revenue = pdNum_(line.line_total) || pdNum_(line.qty_ordered) * pdNum_(line.unit_price);
    if (quantity <= 0 || revenue <= 0) {
      audit.invalid_sales += 1;
      if (quantity <= 0) audit.missing_sales_weight += 1;
      return null;
    }
    var date = pdDate_(order.order_date || order.delivered_at || order.shipped_at || order.created_at);
    var costPerBase = pdHistoricalCost_(productId, date, line.preferred_internal_lot_id, lots, purchases);
    if (costPerBase <= 0) audit.missing_sales_cost += 1;
    var estimatedCost = costPerBase > 0 ? quantity * costPerBase : null;
    return {
      product_id: productId,
      sales_order_id: line.sales_order_id || "",
      date: date,
      customer: order.customer_name || order.customer_id || "Customer",
      source: order.order_source || order.channel || line.channel || "Sales Order",
      status: status,
      base_unit: pmfBaseUnit_(product),
      quantity_lb: pdRound_(quantity, 4),
      quantity_base: pdRound_(quantity, 4),
      selling_price_per_lb: pdRound_(revenue / quantity, 4),
      selling_price_per_base_unit: pdRound_(revenue / quantity, 4),
      revenue: pdRound_(revenue, 2),
      cost_per_lb: costPerBase > 0 ? pdRound_(costPerBase, 4) : null,
      cost_per_base_unit: costPerBase > 0 ? pdRound_(costPerBase, 4) : null,
      estimated_cost: estimatedCost === null ? null : pdRound_(estimatedCost, 2),
      estimated_margin_percent: estimatedCost === null ? null : pdRound_((revenue - estimatedCost) / revenue * 100, 2),
      cost_status: estimatedCost === null ? "MISSING" : "VERIFIED",
      lot_id: line.preferred_internal_lot_id || "",
      location_id: line.preferred_location_id || ""
    };
  }).filter(Boolean);
};

pdProduct_ = function(product, inventory, sales, purchases, incoming, committed, suppliers) {
  sales.sort(pdDateSort_);
  purchases.sort(pdDateSort_);
  var baseUnit = pmfBaseUnit_(product);
  var audit = pmfAudit_(product.product_id);
  var available = pdSum_(inventory, function(row) { return pdNum_(row.available_qty !== undefined ? row.available_qty : row.current_qty); });
  var reserved = pdSum_(inventory, function(row) { return pdNum_(row.reserved_qty); });
  var inventoryValue = pdSum_(inventory, function(row) { return pdNum_(row.inventory_value); });
  var validPurchases = purchases.filter(function(row) { return row.cost_eligible && row.cost_per_base_unit > 0; });
  var inventoryCost = available > 0 ? inventoryValue / available : pdWeighted_(validPurchases, "cost_per_base_unit", "quantity_base");
  var demand = pdDemand_(sales);
  var leadDays = pdLead_(purchases, suppliers);
  var leadWeeks = Math.max(leadDays / 7, 1 / 7);
  var safety = demand.weekly * leadWeeks * PRODUCT_DASHBOARD_SAFETY_FACTOR;
  var reorder = demand.weekly * leadWeeks + safety;
  var target = reorder + demand.weekly * PRODUCT_DASHBOARD_TARGET_WEEKS;
  var position = available + incoming - committed;
  var unitWeight = validPurchases.length ? pdMedian_(validPurchases.map(function(row) { return row.purchase_unit_weight_base; }).filter(function(value) { return value > 0; })) : pmfPurchaseConversion_({}, product);
  var recommended = Math.max(0, target - position);
  var roundedRecommended = unitWeight > 0 ? Math.ceil(recommended / unitWeight) * unitWeight : Math.ceil(recommended);
  var volume = pdSum_(sales, function(row) { return row.quantity_base; });
  var totalRevenue = pdSum_(sales, function(row) { return row.revenue; });
  var costedSales = sales.filter(function(row) { return row.estimated_cost !== null; });
  var verifiedRevenue = pdSum_(costedSales, function(row) { return row.revenue; });
  var verifiedVolume = pdSum_(costedSales, function(row) { return row.quantity_base; });
  var verifiedCost = pdSum_(costedSales, function(row) { return row.estimated_cost; });
  var coverage = totalRevenue > 0 ? verifiedRevenue / totalRevenue * 100 : 0;
  var supportedDisplayUnit = baseUnit === "LB";
  var complete = totalRevenue > 0 && coverage >= 99.999 && supportedDisplayUnit;
  var sellingPrice = volume > 0 ? totalRevenue / volume : 0;
  var verifiedPrice = verifiedVolume > 0 ? verifiedRevenue / verifiedVolume : 0;
  var costPerBase = complete && verifiedVolume > 0 ? verifiedCost / verifiedVolume : null;
  var margin = complete ? (verifiedRevenue - verifiedCost) / verifiedRevenue * 100 : null;
  var coveredMargin = verifiedRevenue > 0 ? (verifiedRevenue - verifiedCost) / verifiedRevenue * 100 : null;
  var weeks = demand.weekly > 0 ? available / demand.weekly : null;
  var expiration = pdExpiration_(inventory, demand.daily, inventoryCost);
  var missingCost = audit.missing_purchase_cost + audit.missing_sales_cost;
  var missingWeight = audit.missing_purchase_weight + audit.missing_sales_weight + (supportedDisplayUnit ? 0 : 1);
  var qualityParts = [];
  if (!supportedDisplayUnit) qualityParts.push("base unit is " + baseUnit + "; current dashboard labels are weight-based");
  if (totalRevenue > 0 && coverage < 99.999) qualityParts.push(pdRound_(coverage, 1) + "% of revenue has matched cost");
  if (missingCost) qualityParts.push(missingCost + " records missing cost");
  if (missingWeight) qualityParts.push(missingWeight + " records missing or incompatible unit conversion");
  if (audit.cancelled) qualityParts.push(audit.cancelled + " cancelled purchase lines excluded");
  if (audit.invalid_sales) qualityParts.push(audit.invalid_sales + " invalid sales lines excluded");
  if (!sales.length) qualityParts.push("no completed sales history");

  return {
    product_id: product.product_id,
    product_name: product.product_name || product.product_id,
    category: product.product_category || "Uncategorized",
    base_unit: baseUnit,
    summary: {
      available_inventory: pdRound_(available, 2), reserved_inventory: pdRound_(reserved, 2), incoming_purchases: pdRound_(incoming, 2), committed_sales: pdRound_(committed, 2), inventory_position: pdRound_(position, 2), inventory_value: pdRound_(inventoryValue, 2), weekly_demand: pdRound_(demand.weekly, 2), weeks_of_supply: weeks === null ? null : pdRound_(weeks, 2),
      selling_price_per_lb: pdRound_(sellingPrice, 4), cost_per_lb: costPerBase === null ? null : pdRound_(costPerBase, 4), profit_per_lb: costPerBase === null ? null : pdRound_(verifiedPrice - costPerBase, 4), gross_margin_percent: margin === null ? null : pdRound_(margin, 2),
      revenue: pdRound_(verifiedRevenue, 2), total_revenue_all: pdRound_(totalRevenue, 2), estimated_gross_profit: margin === null ? null : pdRound_(verifiedRevenue - verifiedCost, 2), covered_margin_percent: coveredMargin === null ? null : pdRound_(coveredMargin, 2), cost_coverage_percent: pdRound_(coverage, 2), sales_volume_lb: pdRound_(verifiedVolume, 2), total_sales_volume_all: pdRound_(volume, 2), last_sale_date: sales.length ? sales[sales.length - 1].date : "", last_purchase_date: purchases.length ? purchases[purchases.length - 1].date : ""
    },
    planning: { lead_time_days: pdRound_(leadDays, 1), safety_stock: pdRound_(safety, 2), demand_during_lead_time: pdRound_(demand.weekly * leadWeeks, 2), reorder_point: pdRound_(reorder, 2), target_stock: pdRound_(target, 2), recommended_purchase_lb: pdRound_(roundedRecommended, 2), recommended_purchase_units: unitWeight > 0 ? Math.ceil(roundedRecommended / unitWeight) : 0, purchase_unit_weight_lb: pdRound_(unitWeight, 2), projected_stock_after_purchase: pdRound_(position + roundedRecommended, 2) },
    demand: demand,
    financial: { weighted_selling_price_per_lb: pdRound_(verifiedPrice, 4), weighted_cost_per_lb: costPerBase === null ? null : pdRound_(costPerBase, 4), profit_per_lb: costPerBase === null ? null : pdRound_(verifiedPrice - costPerBase, 4), gross_margin_percent: margin === null ? null : pdRound_(margin, 2), covered_margin_percent: coveredMargin === null ? null : pdRound_(coveredMargin, 2), cost_coverage_percent: pdRound_(coverage, 2), total_revenue: pdRound_(verifiedRevenue, 2), total_revenue_all: pdRound_(totalRevenue, 2), estimated_total_cost: pdRound_(verifiedCost, 2), estimated_gross_profit: margin === null ? null : pdRound_(verifiedRevenue - verifiedCost, 2), covered_gross_profit: pdRound_(verifiedRevenue - verifiedCost, 2) },
    inventory: inventory.map(pdInventoryRow_), expiration: expiration, sales: sales, purchases: purchases,
    recommendation: pdRecommendation_({ expiration: expiration, position: position, reorder: reorder, recommended: roundedRecommended, margin: margin, weeks: weeks, salesCount: sales.length, missingCost: missingCost, missingWeight: missingWeight }),
    data_quality: { missing_cost_count: missingCost, missing_weight_count: missingWeight, sales_observation_count: sales.length, purchase_observation_count: validPurchases.length, costed_sales_observation_count: costedSales.length, cost_coverage_percent: pdRound_(coverage, 2), cancelled_purchase_count: audit.cancelled, excluded_sales_count: audit.invalid_sales, is_ready: complete, summary: qualityParts.length ? qualityParts.join("; ") : "Data is ready for verified margin analysis." }
  };
};

pdPurchaseQty_ = function(line, product) { return pmfPurchaseQty_(line, product); };
pdSalesQty_ = function(line, product) { return pmfSalesQty_(line, product); };
pdUnitWeightLine_ = function(line, product) { return pmfPurchaseConversion_(line, product); };
