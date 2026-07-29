// SalesAvailabilityNoFifoV2.gs
// Product-level availability for Sales Order creation. No lot or rack is reserved here.

function listSalesProductAvailabilityNoFifoV2(payload) {
  payload = payload || {};
  const physical = salesPhysicalBaseByProductNoFifoV2_();
  const committed = salesCommittedBaseByProductNoFifoV2_(String(payload.exclude_sales_order_id || ""));
  const free = salesFreeBaseByProductNoFifoV2_(physical, committed);
  const products = byId_(readTable_("PRODUCTS"), "product_id");
  const lotsByProduct = {};
  warehouseActiveLotsV2_().forEach(function (lot) {
    if (String(lot.status || "ACTIVE").toUpperCase() === "HOLD") return;
    const productId = String(lot.product_id || "");
    if (!lotsByProduct[productId]) lotsByProduct[productId] = [];
    lotsByProduct[productId].push(lot);
  });

  return Object.keys(physical).map(function (productId) {
    const product = products[productId] || {};
    const optionMap = {};
    (lotsByProduct[productId] || []).forEach(function (lot) {
      const weight = lotUnitWeightV2_(lot);
      const unitType = String(lot.purchase_unit_type || product.default_unit || "UNIT").trim().toUpperCase();
      if (!(weight > 0)) return;
      const key = unitType + "|" + weight;
      if (!optionMap[key]) optionMap[key] = { unit_type: unitType, unit_weight_lbs: weight, base_qty: 0 };
      optionMap[key].base_qty += warehouseActiveLotQtyV2_(lot);
    });
    const unitOptions = Object.keys(optionMap).map(function (key) { return optionMap[key]; })
      .sort(function (a, b) { return b.base_qty - a.base_qty; });
    const primary = unitOptions[0] || {};
    return {
      product_id: productId,
      product_name: product.product_name || productId,
      physical_base_qty: number_(physical[productId], 0),
      committed_base_qty: number_(committed[productId], 0),
      free_base_qty: number_(free[productId], 0),
      base_unit: product.base_unit || "LB",
      default_sales_unit: primary.unit_type || String(product.default_unit || "CASE").toUpperCase(),
      default_unit_weight_lbs: number_(primary.unit_weight_lbs, firstPositiveNumber_(product.case_weight_lbs, product.units_per_purchase_unit, 1)),
      unit_options: unitOptions
    };
  }).filter(function (row) { return row.physical_base_qty > 0.0001; })
    .sort(function (a, b) { return String(a.product_name).localeCompare(String(b.product_name), undefined, { sensitivity: "base" }); });
}
