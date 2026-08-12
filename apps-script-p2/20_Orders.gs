/** Unified PURCHASE and SALE orders, lines, totals, statuses, and payments. */

function sjOrderContext_() {
  return {
    orders: sjTable_('ORDERS'),
    lines: sjTable_('ORDER_LINES'),
    parties: sjTable_('PARTIES'),
    products: sjTable_('PRODUCTS'),
    units: sjTable_('PRODUCT_UNITS'),
    payments: sjTable_('PAYMENTS')
  };
}

function sjOrderPublic_(context, order, includeLines) {
  var result = sjPublicRecord_(order);
  var party = sjFind_(context.parties, order.party_id);
  result.party = party ? sjPublicRecord_(party) : null;
  if (includeLines) {
    result.lines = context.lines.records.filter(function (line) {
      return sjString_(line.order_id) === sjString_(order.order_id);
    }).map(function (line) {
      var value = sjPublicRecord_(line);
      var product = sjFind_(context.products, line.product_id);
      value.product_name = product ? sjString_(product.product_name) : '';
      value.base_unit = product ? sjUpper_(product.base_unit) : '';
      return value;
    });
  }
  return result;
}

function sjListOrders(payload) {
  payload = payload || {};
  var context = sjOrderContext_();
  var type = sjUpper_(payload.order_type);
  var status = sjUpper_(payload.status);
  var partyId = sjString_(payload.party_id);
  var query = sjNormalizeText_(payload.query);
  var rows = context.orders.records.filter(function (order) {
    if (type && sjUpper_(order.order_type) !== type) return false;
    if (status && sjUpper_(order.status) !== status) return false;
    if (partyId && sjString_(order.party_id) !== partyId) return false;
    if (!query) return true;
    var party = sjFind_(context.parties, order.party_id) || {};
    return sjNormalizeText_([order.order_id, order.external_reference, order.party_id, party.party_name, order.notes].join(' ')).indexOf(query) >= 0;
  });
  rows.sort(function (left, right) { return sjDateMs_(right.order_date) - sjDateMs_(left.order_date); });
  return sjPaginate_(rows.map(function (order) { return sjOrderPublic_(context, order, false); }), payload);
}

function sjGetOrder(payload) {
  var context = sjOrderContext_();
  var order = sjFind_(context.orders, sjRequired_(payload && payload.order_id, 'order_id'));
  if (!order) throw new Error('Order was not found.');
  var result = sjOrderPublic_(context, order, true);
  result.payments = context.payments.records.filter(function (payment) {
    return sjString_(payment.order_id) === sjString_(order.order_id);
  }).map(sjPublicRecord_);
  return result;
}

function sjOrderParty_(context, partyId, orderType) {
  var party = sjFind_(context.parties, partyId);
  if (!party || !sjActive_(party)) throw new Error('Active party was not found: ' + partyId + '.');
  var type = sjUpper_(party.party_type);
  var valid = orderType === 'SALE' ? ['CUSTOMER', 'BOTH'] : ['VENDOR', 'BOTH'];
  if (valid.indexOf(type) < 0) throw new Error(party.party_id + ' cannot be used on a ' + orderType + ' order.');
  return party;
}

function sjUnitConversion_(context, product, unitCode) {
  var code = sjUpper_(unitCode || product.base_unit);
  if (code === sjUpper_(product.base_unit)) return 1;
  var unit = context.units.records.find(function (record) {
    return sjString_(record.product_id) === sjString_(product.product_id) && sjUpper_(record.unit_code) === code;
  });
  if (!unit || !(sjNumber_(unit.conversion_to_base) > 0)) throw new Error('No valid conversion exists for ' + product.product_id + ' in ' + code + '.');
  return sjNumber_(unit.conversion_to_base);
}

function sjOrderLines_(context, orderType, orderId, payloadLines, prefix) {
  if (!Array.isArray(payloadLines) || !payloadLines.length) throw new Error('Order requires at least one line.');
  var next = sjNextIdFromRows_(context.lines.records, 'order_line_id', prefix);
  var nextNumber = Number(next.match(/(\d+)$/)[1]);
  return payloadLines.map(function (input, index) {
    var product = sjFind_(context.products, sjRequired_(input.product_id, 'product_id'));
    if (!product || !sjActive_(product)) throw new Error('Active product was not found: ' + sjString_(input.product_id) + '.');
    var quantity = sjPositive_(input.quantity, 'quantity');
    var unitCode = sjUpper_(input.unit_code || product.base_unit);
    var conversion = sjUnitConversion_(context, product, unitCode);
    var baseQuantity = quantity * conversion;
    var unitPrice = sjPositive_(input.unit_price, 'unit_price', true);
    var lineTotal = quantity * unitPrice;
    var cost = orderType === 'SALE' ? sjLatestProductCost_(product.product_id) : (baseQuantity > 0 ? lineTotal / baseQuantity : 0);
    return {
      order_line_id: prefix + '-' + (nextNumber + index), order_id: orderId, product_id: product.product_id,
      quantity: quantity, unit_code: unitCode, conversion_to_base: conversion, base_quantity: baseQuantity,
      unit_price: unitPrice, line_total: lineTotal, cost_per_base_snapshot: cost,
      gross_profit: orderType === 'SALE' ? lineTotal - baseQuantity * cost : '',
      quantity_completed_base: 0, status: 'OPEN', notes: sjString_(input.notes)
    };
  });
}

function sjOrderTotals_(lines, payload) {
  var subtotal = lines.reduce(function (sum, line) { return sum + sjNumber_(line.line_total); }, 0);
  var tax = sjPositive_(payload.tax_amount || 0, 'tax_amount', true);
  var shipping = sjPositive_(payload.shipping_amount || 0, 'shipping_amount', true);
  return {subtotal: subtotal, tax: tax, shipping: shipping, total: subtotal + tax + shipping};
}

function sjCreateOrder(payload) {
  var actor = sjRequirePermission_(payload, 'orders.write');
  return sjWithLock_(function () {
    var context = sjOrderContext_();
    var orderType = sjOneOf_(payload.order_type, ['PURCHASE', 'SALE'], 'order_type');
    var prefix = orderType === 'SALE' ? 'SO' : 'PO';
    var linePrefix = orderType === 'SALE' ? 'SOL' : 'POL';
    var orderId = payload.order_id ? sjUpper_(payload.order_id) : sjNextId_(context.orders, prefix);
    if (sjFind_(context.orders, orderId)) throw new Error('Order already exists: ' + orderId + '.');
    var party = sjOrderParty_(context, sjRequired_(payload.party_id, 'party_id'), orderType);
    var lines = sjOrderLines_(context, orderType, orderId, payload.lines, linePrefix);
    var totals = sjOrderTotals_(lines, payload);
    var now = sjNow_();
    var record = {
      order_id: orderId, order_type: orderType, party_id: party.party_id,
      order_date: sjDate_(payload.order_date || now, true), expected_or_ship_date: sjDate_(payload.expected_or_ship_date, false),
      status: sjOneOf_(payload.status || 'OPEN', ['OPEN', 'CONFIRMED', 'PARTIAL', 'COMPLETE', 'CANCELLED', 'VOID'], 'status'),
      currency: sjUpper_(payload.currency || party.currency || 'USD'), subtotal_amount: totals.subtotal,
      tax_amount: totals.tax, shipping_amount: totals.shipping, total_amount: totals.total,
      amount_paid: 0, balance_due: totals.total, payment_status: totals.total > 0 ? 'UNPAID' : 'PAID',
      external_reference: sjString_(payload.external_reference), created_by: actor.user_id,
      created_at: now, updated_at: now, notes: sjString_(payload.notes)
    };
    sjAppend_(context.orders, record);
    try {
      sjAppendMany_(context.lines, lines);
    } catch (error) {
      sjClear_(context.orders, context.orders.sheet.getLastRow());
      throw error;
    }
    sjAudit_(actor, 'CREATE_ORDER', 'ORDERS', orderId, null, {order: record, lines: lines}, 'Order created.');
    return sjOrderPublic_({orders: context.orders, lines: {records: lines}, parties: context.parties, products: context.products}, record, true);
  });
}

function sjUpdateOrder(payload) {
  var actor = sjRequirePermission_(payload, 'orders.write');
  return sjWithLock_(function () {
    var context = sjOrderContext_();
    var order = sjFind_(context.orders, sjRequired_(payload.order_id, 'order_id'));
    if (!order) throw new Error('Order was not found.');
    if (['COMPLETE', 'CANCELLED', 'VOID'].indexOf(sjUpper_(order.status)) >= 0) throw new Error('Closed orders cannot be edited.');
    var fields = {updated_at: sjNow_()};
    if (payload.expected_or_ship_date !== undefined) fields.expected_or_ship_date = sjDate_(payload.expected_or_ship_date, false);
    if (payload.external_reference !== undefined) fields.external_reference = sjString_(payload.external_reference);
    if (payload.notes !== undefined) fields.notes = sjString_(payload.notes);
    if (payload.status !== undefined) fields.status = sjOneOf_(payload.status, ['OPEN', 'CONFIRMED', 'PARTIAL', 'COMPLETE'], 'status');
    var updated = sjUpdate_(context.orders, order._sheet_row, fields);
    sjAudit_(actor, 'UPDATE_ORDER', 'ORDERS', order.order_id, sjPublicRecord_(order), sjPublicRecord_(updated), sjString_(payload.reason));
    return sjOrderPublic_(context, updated, true);
  });
}

function sjCancelOrder(payload) {
  var actor = sjRequirePermission_(payload, 'orders.write');
  return sjWithLock_(function () {
    var context = sjOrderContext_();
    var order = sjFind_(context.orders, sjRequired_(payload.order_id, 'order_id'));
    if (!order) throw new Error('Order was not found.');
    if (sjUpper_(order.status) === 'COMPLETE') throw new Error('Completed orders cannot be cancelled.');
    var reason = sjRequired_(payload.reason, 'reason');
    var updated = sjUpdate_(context.orders, order._sheet_row, {status: 'CANCELLED', updated_at: sjNow_(), notes: sjString_(order.notes) + ' · CANCELLED: ' + reason});
    context.lines.records.filter(function (line) { return sjString_(line.order_id) === sjString_(order.order_id); }).forEach(function (line) {
      if (sjUpper_(line.status) !== 'COMPLETE') sjUpdate_(context.lines, line._sheet_row, {status: 'CANCELLED'});
    });
    sjAudit_(actor, 'CANCEL_ORDER', 'ORDERS', order.order_id, sjPublicRecord_(order), sjPublicRecord_(updated), reason);
    return sjOrderPublic_(context, updated, true);
  });
}

function sjListPayments(payload) {
  payload = payload || {};
  var rows = sjTable_('PAYMENTS').records.filter(function (payment) {
    return !payload.order_id || sjString_(payment.order_id) === sjString_(payload.order_id);
  });
  rows.sort(function (left, right) { return sjDateMs_(right.payment_date) - sjDateMs_(left.payment_date); });
  return sjPaginate_(rows.map(sjPublicRecord_), payload);
}

function sjRecordPayment(payload) {
  var actor = sjRequirePermission_(payload, 'payments.write');
  return sjWithLock_(function () {
    var orders = sjTable_('ORDERS');
    var order = sjFind_(orders, sjRequired_(payload.order_id, 'order_id'));
    if (!order) throw new Error('Order was not found.');
    if (['CANCELLED', 'VOID'].indexOf(sjUpper_(order.status)) >= 0) throw new Error('Payments cannot be applied to a cancelled or void order.');
    var amount = sjPositive_(payload.amount, 'amount');
    var balance = sjNumber_(order.balance_due);
    if (amount - balance > SJ_CONFIG.EPSILON) throw new Error('Payment exceeds the current balance of ' + balance + '.');
    var payments = sjTable_('PAYMENTS');
    var now = sjNow_();
    var record = {
      payment_id: sjNextId_(payments, 'PAY'), order_id: order.order_id,
      payment_direction: sjUpper_(order.order_type) === 'SALE' ? 'RECEIVED' : 'PAID_OUT',
      payment_date: sjDate_(payload.payment_date || now, true),
      payment_method: sjOneOf_(payload.payment_method, ['CARD', 'TRANSFER', 'CHECK', 'CASH'], 'payment_method'),
      amount: amount, reference_number: sjString_(payload.reference_number), status: 'POSTED',
      entered_by: actor.user_id, created_at: now, notes: sjString_(payload.notes)
    };
    var paymentRow = sjAppend_(payments, record);
    var paid = sjNumber_(order.amount_paid) + amount;
    var remaining = Math.max(0, sjNumber_(order.total_amount) - paid);
    var paymentStatus = remaining <= SJ_CONFIG.EPSILON ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'UNPAID');
    try {
      sjUpdate_(orders, order._sheet_row, {amount_paid: paid, balance_due: remaining, payment_status: paymentStatus, updated_at: now});
    } catch (error) {
      sjClear_(payments, paymentRow);
      throw error;
    }
    sjAudit_(actor, 'RECORD_PAYMENT', 'PAYMENTS', record.payment_id, null, record, 'Payment posted to ' + order.order_id + '.');
    return sjPublicRecord_(record);
  });
}
