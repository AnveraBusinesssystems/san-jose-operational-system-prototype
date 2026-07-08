/**
 * Sales Order allocation backend override.
 *
 * This file intentionally overrides createSalesOrder from Code.gs when the
 * Apps Script project is assembled with multiple .gs files. It keeps the
 * existing Google Sheet schema and lets the frontend submit one visible
 * product requirement as multiple allocated SALES_ORDER_LINES, which then
 * become multiple PICK_TASKS on confirmation.
 *
 * No new spreadsheet tab is required.
 */
function createSalesOrder(payload) {
  const user = (payload || {}).user || {};
  const input = (payload || {}).input || {};
  const inputLines = Array.isArray(input.lines) ? input.lines : [];
  require_(user, "salesOrders:create");
  if (!inputLines.length) throw new Error("Add at least one sales line.");

  const products = byId_(readTable_("PRODUCTS"), "product_id");
  const lots = byId_(readTable_("LOTS"), "internal_lot_id");
  const orderId = input.sales_order_id || nextId_("SALES_ORDERS", "sales_order_id", "SO");
  const currency = input.currency || "USD";
  const lineSeed = readTable_("SALES_ORDER_LINES").slice();
  let subtotal = 0;
  let grossProfit = 0;

  const lines = inputLines.map((inputLine) => {
    const product = products[inputLine.product_id] || {};
    const lotId = inputLine.internal_lot_id || inputLine.preferred_internal_lot_id || "";
    const lot = lots[lotId] || {};
    const qty = n_(inputLine.qty_ordered || inputLine.quantity, 0);
    const price = n_(inputLine.unit_price || inputLine.price, 0);
    const cost = n_(inputLine.unit_cost || lot.unit_cost, 0);
    if (!inputLine.product_id || qty <= 0) throw new Error("Complete every sales order line.");

    const lineId = nextIdFromRowsForSalesAllocation_(lineSeed, "sales_order_line_id", "SOL");
    lineSeed.push({ sales_order_line_id: lineId });
    subtotal += qty * price;
    grossProfit += (price - cost) * qty;

    return {
      sales_order_line_id: lineId,
      sales_order_id: orderId,
      channel: input.channel || input.sales_channel || "WHOLESALE",
      amazon_order_item_id: inputLine.amazon_order_item_id || "",
      product_id: inputLine.product_id,
      amazon_sku: inputLine.amazon_sku || product.amazon_sku || "",
      wholesale_sku: inputLine.wholesale_sku || product.wholesale_sku || "",
      qty_ordered: qty,
      qty_picked: 0,
      qty_remaining: qty,
      unit_type: inputLine.unit_type || product.base_unit || "LB",
      unit_price: price,
      currency: currency,
      line_total: qty * price,
      preferred_internal_lot_id: lotId,
      preferred_location_id: inputLine.location_id || inputLine.preferred_location_id || lot.current_location_id || "",
      line_status: "OPEN",
      notes: inputLine.notes || "",
      unit_weight_lbs: n_(inputLine.unit_weight_lbs || product.case_weight_lbs, 1),
      inventory_qty_required: n_(inputLine.inventory_qty_required || qty, qty),
      inventory_unit_type: inputLine.inventory_unit_type || lot.unit_type || product.base_unit || "LB",
      unit_cost: cost,
      estimated_gross_profit: (price - cost) * qty,
      expiration_date: inputLine.expiration_date || lot.expiration_date || "",
      fefo_status: inputLine.fefo_status || ""
    };
  });

  const taxEnabled = input.tax_enabled === true || upper_(input.tax_enabled) === "TRUE";
  const taxRate = n_(input.tax_rate_percent !== undefined ? input.tax_rate_percent : input.tax_rate, 0);
  const tax = taxEnabled ? subtotal * taxRate / 100 : n_(input.tax_amount, 0);
  const shipping = n_(input.shipping_amount, 0);

  const order = {
    sales_order_id: orderId,
    channel: input.channel || input.sales_channel || "WHOLESALE",
    order_source: input.order_source || "WEB_APP",
    customer_name: input.customer_name || "",
    customer_email: input.customer_email || "",
    customer_phone: input.customer_phone || "",
    amazon_order_id: input.amazon_order_id || "",
    order_date: input.order_date || today_(),
    ship_by_date: input.ship_by_date || input.requested_delivery_date || "",
    status: input.status || "DRAFT",
    currency: currency,
    subtotal_amount: subtotal,
    tax_amount: tax,
    shipping_amount: shipping,
    total_amount: subtotal + tax + shipping,
    invoice_status: "NOT_CREATED",
    created_by: user.user_id || user.role || "",
    created_at: now_(),
    updated_at: now_(),
    notes: input.notes || "",
    customer_id: input.customer_id || "",
    ship_method: input.ship_method || "",
    payment_terms: input.payment_terms || "",
    tax_enabled: taxEnabled,
    tax_rate: taxRate,
    estimated_gross_profit: grossProfit,
    estimated_gross_margin_percent: subtotal ? grossProfit / subtotal * 100 : 0,
    bl_folio: input.bl_folio || nextBlFolio_(),
    shipping_address: input.shipping_address || ""
  };

  appendRecord_("SALES_ORDERS", order);
  lines.forEach((line) => appendRecord_("SALES_ORDER_LINES", line));
  return Object.assign({}, order, { lines: lines, pickTasks: [] });
}

function nextIdFromRowsForSalesAllocation_(rows, idColumn, prefix) {
  const maxNumber = (rows || []).reduce((max, row) => {
    const match = String(row[idColumn] || "").match(/(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(maxNumber + 1).padStart(6, "0")}`;
}
