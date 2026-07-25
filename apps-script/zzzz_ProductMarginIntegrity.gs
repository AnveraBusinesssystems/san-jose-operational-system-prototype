// Margin and cost integrity overrides for Product Analytics.
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
function pmfBaseUnit_(product) { return pmfUnit_((product || {}).base_unit || "LB") || "LB"; }
function pmfPurchaseConversion_(line, product) { return pdNum_(line.case_weight_lbs) || pdNum_(line.units_per_purchase_unit) || pdNum_((product || {}).case_weight_lbs) || pdNum_((product || {}).units_per_purchase_unit); }
function pmfSalesConversion_(line, product) { return pdNum_(line.unit_weight_lbs) || pdNum_((product || {}).case_weight_lbs) || pdNum_((product || {}).units_per_purchase_unit); }
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
function pmfAveragePurchaseCost_(productId, purchases) {
  var values = (purchases || []).filter(function(row) {
    return row.product_id === productId && row.cost_eligible && row.cost_per_base_unit > 0;
  }).map(function(row) { return row.cost_per_base_unit; });
  return values.length ? pdAverage_(values) : 0;
}
function pmfResolveSalesCost_(line, productId, quantity, lotId, lots, purchases) {
  var ordered = pdNum_(line.qty_ordered);
  var savedUnitCost = pdNum_(line.unit_cost);
  if (savedUnitCost > 0 && ordered > 0 && quantity > 0) {
    return { cost_per_base_unit: savedUnitCost * ordered / quantity, total_cost: savedUnitCost * ordered, source: "SALES_SNAPSHOT", status: "VERIFIED" };
  }
  if (lotId && lots[lotId]) {
    var lotCost = pmfLotCost_(lots[lotId]);
    if (lotCost > 0) return { cost_per_base_unit: lotCost, total_cost: lotCost * quantity, source: "EXACT_LOT", status: "VERIFIED" };
  }
  var average = pmfAveragePurchaseCost_(productId, purchases);
  if (average > 0) return { cost_per_base_unit: average, total_cost: average * quantity, source: "PRODUCT_AVERAGE", status: "ESTIMATED" };
  return { cost_per_base_unit: null, total_cost: null, source: "MISSING", status: "MISSING" };
}

pdPurchases_ = function(lines, orders, suppliers, products) {
  PMF_AUDIT_BY_PRODUCT = {};
  return (lines || []).map(function(line) {
    var productId = String(line.product_id || ""), product = products[productId];
    if (!productId || !product) return null;
    var order = orders[line.po_id] || {};
    var status = String(order.po_status || line.line_status || "OPEN").toUpperCase();
    var audit = pmfAudit_(productId);
    if (PMF_CANCELLED_STATUSES.indexOf(status) >= 0) { audit.cancelled += 1; return null; }
    var quantity = pmfPurchaseQty_(line, product);
    var total = pdNum_(line.line_total) || pdNum_(line.qty_ordered) * pdNum_(line.unit_cost);
    if (quantity <= 0) { audit.missing_purchase_weight += 1; return null; }
    if (total <= 0) { audit.missing_purchase_cost += 1; return null; }
    var supplierId = line.supplier_id || order.supplier_id || "";
    var conversion = pmfPurchaseConversion_(line, product);
    return { product_id: productId, po_id: line.po_id || "", date: pdDate_(order.order_date || order.actual_first_received_date || order.actual_completed_date), supplier: (suppliers[supplierId] || {}).supplier_name || supplierId || "Supplier", supplier_id: supplierId, status: status, cost_eligible: PMF_COST_ELIGIBLE_PURCHASES.indexOf(status) >= 0, base_unit: pmfBaseUnit_(product), quantity_lb: pdRound_(quantity, 4), quantity_base: pdRound_(quantity, 4), cost_per_lb: pdRound_(total / quantity, 4), cost_per_base_unit: pdRound_(total / quantity, 4), total_cost: pdRound_(total, 2), purchase_units: pdRound_(pdNum_(line.qty_ordered), 2), purchase_unit_type: line.unit_type || "", purchase_unit_weight_lb: pdRound_(conversion, 4), purchase_unit_weight_base: pdRound_(conversion, 4) };
  }).filter(Boolean);
};

pdSales_ = function(lines, orders, lots, purchases, products) {
  return (lines || []).map(function(line) {
    var productId = String(line.product_id || ""), product = products[productId];
    if (!productId || !product) return null;
    var order = orders[line.sales_order_id] || {};
    var status = String(order.status || line.line_status || "OPEN").toUpperCase();
    if (PMF_CANCELLED_STATUSES.indexOf(status) >= 0 || PMF_COMPLETED_SALES.indexOf(status) < 0) return null;
    var audit = pmfAudit_(productId), quantity = pmfSalesQty_(line, product);
    var revenue = pdNum_(line.line_total) || pdNum_(line.qty_ordered) * pdNum_(line.unit_price);
    if (quantity <= 0 || revenue <= 0) { audit.invalid_sales += 1; if (quantity <= 0) audit.missing_sales_weight += 1; return null; }
    var resolved = pmfResolveSalesCost_(line, productId, quantity, line.preferred_internal_lot_id, lots, purchases);
    if (resolved.status === "MISSING") audit.missing_sales_cost += 1;
    return { product_id: productId, sales_order_id: line.sales_order_id || "", date: pdDate_(order.order_date || order.delivered_at || order.shipped_at || order.created_at), customer: order.customer_name || order.customer_id || "Customer", source: order.order_source || order.channel || line.channel || "Sales Order", status: status, base_unit: pmfBaseUnit_(product), quantity_lb: pdRound_(quantity, 4), quantity_base: pdRound_(quantity, 4), selling_price_per_lb: pdRound_(revenue / quantity, 4), selling_price_per_base_unit: pdRound_(revenue / quantity, 4), revenue: pdRound_(revenue, 2), cost_per_lb: resolved.cost_per_base_unit === null ? null : pdRound_(resolved.cost_per_base_unit, 4), cost_per_base_unit: resolved.cost_per_base_unit === null ? null : pdRound_(resolved.cost_per_base_unit, 4), estimated_cost: resolved.total_cost === null ? null : pdRound_(resolved.total_cost, 2), estimated_margin_percent: resolved.total_cost === null ? null : pdRound_((revenue - resolved.total_cost) / revenue * 100, 2), cost_source: resolved.source, cost_status: resolved.status, lot_id: line.preferred_internal_lot_id || "", location_id: line.preferred_location_id || "" };
  }).filter(Boolean);
};

pdProduct_ = function(product, inventory, sales, purchases, incoming, committed, suppliers) {
  sales.sort(pdDateSort_); purchases.sort(pdDateSort_);
  var baseUnit = pmfBaseUnit_(product), audit = pmfAudit_(product.product_id);
  var available = pdSum_(inventory, function(row) { return pdNum_(row.available_qty !== undefined ? row.available_qty : row.current_qty); });
  var reserved = pdSum_(inventory, function(row) { return pdNum_(row.reserved_qty); });
  var inventoryValue = pdSum_(inventory, function(row) { return pdNum_(row.inventory_value); });
  var validPurchases = purchases.filter(function(row) { return row.cost_eligible && row.cost_per_base_unit > 0; });
  var inventoryCost = available > 0 ? inventoryValue / available : pdWeighted_(validPurchases, "cost_per_base_unit", "quantity_base");
  var demand = pdDemand_(sales), leadDays = pdLead_(purchases, suppliers), leadWeeks = Math.max(leadDays / 7, 1 / 7);
  var safety = demand.weekly * leadWeeks * PRODUCT_DASHBOARD_SAFETY_FACTOR, reorder = demand.weekly * leadWeeks + safety, target = reorder + demand.weekly * PRODUCT_DASHBOARD_TARGET_WEEKS;
  var position = available + incoming - committed;
  var unitWeight = validPurchases.length ? pdMedian_(validPurchases.map(function(row) { return row.purchase_unit_weight_base; }).filter(function(value) { return value > 0; })) : pmfPurchaseConversion_({}, product);
  var recommended = Math.max(0, target - position), roundedRecommended = unitWeight > 0 ? Math.ceil(recommended / unitWeight) * unitWeight : Math.ceil(recommended);
  var totalRevenue = pdSum_(sales, function(row) { return row.revenue; }), totalVolume = pdSum_(sales, function(row) { return row.quantity_base; });
  var costedSales = sales.filter(function(row) { return row.estimated_cost !== null; });
  var costedRevenue = pdSum_(costedSales, function(row) { return row.revenue; }), costedVolume = pdSum_(costedSales, function(row) { return row.quantity_base; }), cost = pdSum_(costedSales, function(row) { return row.estimated_cost; });
  var sellingPrice = costedVolume > 0 ? costedRevenue / costedVolume : null, costPerBase = costedVolume > 0 ? cost / costedVolume : null, margin = costedRevenue > 0 ? (costedRevenue - cost) / costedRevenue * 100 : null;
  var coverage = totalRevenue > 0 ? costedRevenue / totalRevenue * 100 : 0, weeks = demand.weekly > 0 ? available / demand.weekly : null, expiration = pdExpiration_(inventory, demand.daily, inventoryCost);
  var estimatedCount = costedSales.filter(function(row) { return row.cost_status === "ESTIMATED"; }).length;
  var quality = [];
  if (coverage < 99.999 && totalRevenue > 0) quality.push(pdRound_(coverage, 1) + "% of revenue has a usable cost");
  if (estimatedCount) quality.push(estimatedCount + " sales use estimated product-average cost");
  if (audit.missing_sales_cost) quality.push(audit.missing_sales_cost + " sales are missing cost");
  if (baseUnit !== "LB") quality.push("base unit is " + baseUnit);
  return { product_id: product.product_id, product_name: product.product_name || product.product_id, category: product.product_category || "Uncategorized", base_unit: baseUnit,
    summary: { available_inventory: pdRound_(available, 2), reserved_inventory: pdRound_(reserved, 2), incoming_purchases: pdRound_(incoming, 2), committed_sales: pdRound_(committed, 2), inventory_position: pdRound_(position, 2), inventory_value: pdRound_(inventoryValue, 2), weekly_demand: pdRound_(demand.weekly, 2), weeks_of_supply: weeks === null ? null : pdRound_(weeks, 2), selling_price_per_lb: sellingPrice === null ? null : pdRound_(sellingPrice, 4), cost_per_lb: costPerBase === null ? null : pdRound_(costPerBase, 4), profit_per_lb: costPerBase === null ? null : pdRound_(sellingPrice - costPerBase, 4), gross_margin_percent: margin === null ? null : pdRound_(margin, 2), revenue: pdRound_(costedRevenue, 2), total_revenue_all: pdRound_(totalRevenue, 2), estimated_gross_profit: margin === null ? null : pdRound_(costedRevenue - cost, 2), cost_coverage_percent: pdRound_(coverage, 2), sales_volume_lb: pdRound_(costedVolume, 2), total_sales_volume_all: pdRound_(totalVolume, 2), last_sale_date: sales.length ? sales[sales.length - 1].date : "", last_purchase_date: purchases.length ? purchases[purchases.length - 1].date : "" },
    planning: { lead_time_days: pdRound_(leadDays, 1), safety_stock: pdRound_(safety, 2), demand_during_lead_time: pdRound_(demand.weekly * leadWeeks, 2), reorder_point: pdRound_(reorder, 2), target_stock: pdRound_(target, 2), recommended_purchase_lb: pdRound_(roundedRecommended, 2), recommended_purchase_units: unitWeight > 0 ? Math.ceil(roundedRecommended / unitWeight) : 0, purchase_unit_weight_lb: pdRound_(unitWeight, 2), projected_stock_after_purchase: pdRound_(position + roundedRecommended, 2) },
    demand: demand,
    financial: { weighted_selling_price_per_lb: sellingPrice === null ? null : pdRound_(sellingPrice, 4), weighted_cost_per_lb: costPerBase === null ? null : pdRound_(costPerBase, 4), profit_per_lb: costPerBase === null ? null : pdRound_(sellingPrice - costPerBase, 4), gross_margin_percent: margin === null ? null : pdRound_(margin, 2), cost_coverage_percent: pdRound_(coverage, 2), total_revenue: pdRound_(costedRevenue, 2), total_revenue_all: pdRound_(totalRevenue, 2), estimated_total_cost: pdRound_(cost, 2), estimated_gross_profit: margin === null ? null : pdRound_(costedRevenue - cost, 2) },
    inventory: inventory.map(pdInventoryRow_), expiration: expiration, sales: sales, purchases: purchases,
    recommendation: pdRecommendation_({ expiration: expiration, position: position, reorder: reorder, recommended: roundedRecommended, margin: margin, weeks: weeks, salesCount: sales.length, missingCost: audit.missing_sales_cost, missingWeight: audit.missing_sales_weight }),
    data_quality: { missing_cost_count: audit.missing_sales_cost, missing_weight_count: audit.missing_sales_weight, sales_observation_count: sales.length, costed_sales_observation_count: costedSales.length, estimated_sales_observation_count: estimatedCount, cost_coverage_percent: pdRound_(coverage, 2), is_ready: coverage >= 99.999 && baseUnit === "LB", summary: quality.length ? quality.join("; ") : "All displayed margins have usable cost data." }
  };
};

pdPurchaseQty_ = function(line, product) { return pmfPurchaseQty_(line, product); };
pdSalesQty_ = function(line, product) { return pmfSalesQty_(line, product); };
pdUnitWeightLine_ = function(line, product) { return pmfPurchaseConversion_(line, product); };
