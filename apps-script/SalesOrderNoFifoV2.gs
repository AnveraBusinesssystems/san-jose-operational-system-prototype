// SalesOrderNoFifoV2.gs
// New operational Sales Orders describe what the customer bought.
// Physical lot/location selection happens later in Send Product.

function createSalesOrderNoFifoV2(payload) {
  payload = payload || {};
  const user = payload.user || {};
  requirePermission_(user, "salesOrders:create");
  const input = payload.input || payload;
  const requestedLines = Array.isArray(input.lines) ? input.lines : [];
  if (!requestedLines.length) throw new Error("Add at least one product line.");

  return withScriptLock_(function () {
    ensureTableColumns_("SALES_ORDERS", CORE_SCHEMA.SALES_ORDERS);
    ensureTableColumns_("SALES_ORDER_LINES", CORE_SCHEMA.SALES_ORDER_LINES);

    const customers = byId_(readTable_("SUPPLIERS"), "supplier_id");
    const products = byId_(readTable_("PRODUCTS").filter(isActiveRecord_), "product_id");
    const customer = customers[String(input.customer_id || "")] || null;
    if (!customer || String(customer.party_type || "").toUpperCase() !== "CUSTOMER") {
      throw new Error("Select a valid customer.");
    }

    const snapshot = inventorySnapshot();
    const availableByProduct = {};
    const valueByProduct = {};
    snapshot.forEach(function (row) {
      const productId = String(row.product_id || "");
      if (!productId) return;
      availableByProduct[productId] = number_(availableByProduct[productId], 0) + number_(row.available_qty, row.current_qty);
      valueByProduct[productId] = number_(valueByProduct[productId], 0) + number_(row.inventory_value, 0);
    });

    const requestedBaseByProduct = {};
    const salesOrderId = input.sales_order_id || nextId_("SALES_ORDERS", "sales_order_id", "SO");
    const lineIds = nextIdBatch_("SALES_ORDER_LINES", "sales_order_line_id", "SOL", requestedLines.length);
    const currency = input.currency || customer.default_currency || "USD";
    let subtotal = 0;
    let grossProfit = 0;

    const lines = requestedLines.map(function (source, index) {
      source = source || {};
      const productId = String(source.product_id || "").trim();
      const product = products[productId] || null;
      if (!product) throw new Error("Select a valid product on line " + (index + 1) + ".");

      const qty = number_(source.qty_ordered !== undefined ? source.qty_ordered : source.quantity, 0);
      const unit = String(source.unit_type || product.default_unit || "CASE").trim().toUpperCase();
      const unitWeight = unit === "LB" ? 1 : firstPositiveNumber_(source.unit_weight_lbs, source.case_weight_lbs, source.units_per_purchase_unit);
      const price = number_(source.unit_price !== undefined ? source.unit_price : source.price, 0);
      if (!(qty > 0)) throw new Error("Quantity must be greater than zero on line " + (index + 1) + ".");
      if (!unit) throw new Error("Sales unit is required on line " + (index + 1) + ".");
      if (!(unitWeight > 0)) throw new Error("LB per case/unit must be greater than zero on line " + (index + 1) + ".");
      if (price < 0) throw new Error("Unit price cannot be negative on line " + (index + 1) + ".");

      const baseQty = unit === "LB" ? qty : qty * unitWeight;
      requestedBaseByProduct[productId] = number_(requestedBaseByProduct[productId], 0) + baseQty;
      if (requestedBaseByProduct[productId] > number_(availableByProduct[productId], 0) + 0.0001) {
        throw new Error((product.product_name || productId) + " exceeds currently available inventory.");
      }

      const productAvailable = number_(availableByProduct[productId], 0);
      const averageCostPerLb = productAvailable > 0 ? number_(valueByProduct[productId], 0) / productAvailable : 0;
      const estimatedUnitCost = source.unit_cost !== undefined && source.unit_cost !== ""
        ? number_(source.unit_cost, 0)
        : averageCostPerLb * unitWeight;
      const lineTotal = qty * price;
      const lineProfit = qty * (price - estimatedUnitCost);
      subtotal += lineTotal;
      grossProfit += lineProfit;

      return {
        sales_order_line_id: lineIds[index],
        sales_order_id: salesOrderId,
        channel: input.channel || input.sales_channel || "BULK",
        amazon_order_item_id: source.amazon_order_item_id || "",
        product_id: productId,
        amazon_sku: source.amazon_sku || product.amazon_sku || "",
        wholesale_sku: source.wholesale_sku || product.wholesale_sku || "",
        qty_ordered: qty,
        qty_picked: 0,
        qty_remaining: qty,
        unit_type: unit,
        unit_price: price,
        currency: currency,
        line_total: lineTotal,
        preferred_internal_lot_id: "",
        preferred_location_id: "",
        line_status: "DRAFT",
        notes: source.notes || "",
        unit_weight_lbs: unitWeight,
        inventory_qty_required: baseQty,
        inventory_unit_type: source.inventory_unit_type || product.base_unit || "LB",
        unit_cost: estimatedUnitCost,
        estimated_gross_profit: lineProfit,
        expiration_date: "",
        fefo_status: "NOT_USED"
      };
    });

    const taxEnabled = input.tax_enabled === true || String(input.tax_enabled || "").toUpperCase() === "TRUE";
    const taxRate = number_(input.tax_rate_percent !== undefined ? input.tax_rate_percent : input.tax_rate, 0);
    const tax = taxEnabled ? subtotal * taxRate / 100 : number_(input.tax_amount, 0);
    const shipping = number_(input.shipping_amount, 0);
    const order = {
      sales_order_id: salesOrderId,
      channel: input.channel || input.sales_channel || "BULK",
      order_source: input.order_source || "WEB_APP",
      customer_name: input.customer_name || customer.supplier_name || "",
      customer_email: input.customer_email || customer.email || "",
      customer_phone: input.customer_phone || customer.phone || "",
      amazon_order_id: input.amazon_order_id || "",
      order_date: input.order_date || today_(),
      ship_by_date: input.ship_by_date || input.requested_delivery_date || "",
      status: "DRAFT",
      currency: currency,
      subtotal_amount: subtotal,
      tax_amount: tax,
      shipping_amount: shipping,
      total_amount: subtotal + tax + shipping,
      invoice_status: input.invoice_status || "NOT_CREATED",
      quickbooks_invoice_id: input.quickbooks_invoice_id || "",
      created_by: user.user_id || user.role,
      created_at: today_(),
      updated_at: today_(),
      notes: input.notes || "",
      customer_id: customer.supplier_id,
      ship_method: input.ship_method || "CUSTOMER_PICKUP",
      payment_terms: input.payment_terms || customer.payment_terms || "Net 30",
      tax_enabled: taxEnabled,
      tax_rate: taxRate,
      estimated_gross_profit: grossProfit,
      estimated_gross_margin_percent: subtotal ? grossProfit / subtotal * 100 : 0,
      confirmed_at: "",
      picked_at: "",
      shipped_at: "",
      delivered_at: "",
      delivered_by: "",
      delivery_notes: "",
      bl_folio: input.bl_folio || nextBlFolio_(),
      shipping_address: input.shipping_address || customer.address || ""
    };

    const writes = [];
    try {
      writes.push(appendRecords_("SALES_ORDERS", [order]));
      writes.push(appendRecords_("SALES_ORDER_LINES", lines));
    } catch (error) {
      writes.reverse().forEach(rollbackAppendedRange_);
      throw error;
    }

    writeAuditLog_({
      user_id: user.user_id,
      role: user.role,
      action_type: "CREATE_SALES_ORDER_NO_FIFO",
      table_name: "SALES_ORDERS",
      record_id: salesOrderId,
      source_screen: "SALES_ORDERS_V2",
      notes: lines.length + " product line(s); no lot/location allocated at creation."
    });
    return { ...order, customer: customer, lines: lines, pickTasks: [] };
  });
}

function confirmSalesOrderNoFifoV2(payload) {
  payload = payload || {};
  const user = payload.user || {};
  if (!["ADMIN", "MANAGER"].includes(normalizeRole_(user.role))) {
    throw new Error("Only an Admin or Manager can confirm Sales Orders.");
  }
  const salesOrderId = String(payload.sales_order_id || payload.salesOrderId || (payload.input || {}).sales_order_id || "").trim();
  if (!salesOrderId) throw new Error("Choose a Sales Order.");

  return withScriptLock_(function () {
    const detail = getSalesOrderDetail({ sales_order_id: salesOrderId });
    if (!detail) throw new Error("Sales Order was not found.");
    if (String(detail.order.status || "DRAFT").toUpperCase() !== "DRAFT") {
      throw new Error("Only Draft Sales Orders can be confirmed.");
    }
    if (!detail.lines.length) throw new Error("Sales Order has no product lines.");

    const availableByProduct = {};
    inventorySnapshot().forEach(function (row) {
      availableByProduct[row.product_id] = number_(availableByProduct[row.product_id], 0) + number_(row.available_qty, row.current_qty);
    });
    const requiredByProduct = {};
    detail.lines.forEach(function (line) {
      requiredByProduct[line.product_id] = number_(requiredByProduct[line.product_id], 0) + remainingBaseQtyV2_(line);
    });
    Object.keys(requiredByProduct).forEach(function (productId) {
      if (requiredByProduct[productId] > number_(availableByProduct[productId], 0) + 0.0001) {
        const product = readTable_("PRODUCTS").find(function (row) { return String(row.product_id) === String(productId); }) || {};
        throw new Error((product.product_name || productId) + " no longer has enough available inventory to confirm this order.");
      }
    });

    detail.lines.forEach(function (line) {
      updateTableRecord_("SALES_ORDER_LINES", "sales_order_line_id", line.sales_order_line_id, {
        line_status: "CONFIRMED",
        preferred_internal_lot_id: "",
        preferred_location_id: "",
        fefo_status: "NOT_USED"
      });
    });
    updateTableRecord_("SALES_ORDERS", "sales_order_id", salesOrderId, {
      status: "CONFIRMED",
      confirmed_at: today_(),
      updated_at: today_()
    });
    writeAuditLog_({
      user_id: user.user_id,
      role: user.role,
      action_type: "CONFIRM_SALES_ORDER_NO_FIFO",
      table_name: "SALES_ORDERS",
      record_id: salesOrderId,
      source_screen: "SALES_ORDERS_V2",
      notes: "Confirmed by product requirement only; storage will be selected during Send Product."
    });
    return getSalesOrderDetail({ sales_order_id: salesOrderId });
  });
}
