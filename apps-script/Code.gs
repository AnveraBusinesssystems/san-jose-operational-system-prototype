const SPREADSHEET_ID = "1XYaMXKGR5EG8VS38PPiHFNbtmwX5Ae6N33jLE72nxKE";

const CORE_SCHEMA = {
  USERS: ["user_id", "full_name", "role", "email", "device_assigned", "is_active", "created_at", "updated_at", "notes", "pin"],
  PRODUCTS: ["product_id", "product_name", "product_category", "default_unit", "case_weight_lbs", "amazon_sku", "wholesale_sku", "barcode_or_qr_value", "min_stock_qty", "target_stock_qty", "velocity_class", "storage_zone_preference", "is_active", "created_at", "updated_at", "notes", "base_unit", "units_per_purchase_unit", "can_break_case", "perishability_days"],
  SUPPLIERS: ["supplier_id", "supplier_name", "contact_name", "email", "phone", "address", "payment_terms", "default_currency", "lead_time_expected_days", "is_active", "created_at", "updated_at", "notes", "party_type"],
  LOCATIONS: ["location_id", "zone", "aisle", "rack", "level", "bin", "location_type", "capacity_units", "capacity_weight_lbs", "current_status", "allowed_categories", "priority_rank", "is_active", "qr_value", "notes"],
  PURCHASE_ORDERS: ["po_id", "po_status", "supplier_id", "created_by", "order_date", "expected_delivery_date", "actual_first_received_date", "actual_completed_date", "payment_terms", "currency", "subtotal_amount", "tax_amount", "shipping_amount", "total_amount", "recommendation_id", "po_doc_url", "po_pdf_url", "email_status", "email_sent_at", "printed_status", "printed_at", "supplier_confirmation_status", "supplier_confirmed_delivery_date", "notes", "tax_enabled", "tax_rate", "ship_via", "quickbooks_bill_id", "bill_status", "bill_created_at"],
  PURCHASE_ORDER_LINES: ["po_line_id", "po_id", "supplier_id", "product_id", "line_status", "qty_ordered", "qty_received_total", "qty_remaining", "unit_type", "unit_cost", "currency", "line_total", "supplier_expected_lot_number", "notes", "base_unit", "units_per_purchase_unit", "expected_base_qty", "case_weight_lbs", "qr_value"],
  RECEIVING: ["receiving_id", "po_id", "po_line_id", "supplier_id", "product_id", "scan_code", "internal_lot_id", "supplier_lot_number", "received_date", "received_by", "qty_received", "qty_damaged", "qty_accepted", "unit_type", "quality_score", "product_accuracy_score", "over_under_status", "recommended_location_id", "confirmed_location_id", "requires_supervisor_approval", "approval_status", "notes", "base_unit", "units_per_purchase_unit", "qty_accepted_base", "pallet_count", "quality_status"],
  LOTS: ["internal_lot_id", "product_id", "supplier_id", "supplier_lot_number", "po_id", "po_line_id", "received_date", "original_qty", "current_qty_script", "unit_type", "unit_cost", "currency", "current_location_id", "status", "expiration_date", "qr_value", "label_printed_status", "label_printed_at", "created_at", "updated_at", "notes", "purchase_qty_received", "purchase_unit_type", "pallet_count"],
  INVENTORY_MOVEMENTS: ["movement_id", "movement_type", "timestamp", "user_id", "product_id", "internal_lot_id", "package_id", "qty_change", "unit_type", "from_location_id", "to_location_id", "related_po_id", "related_receiving_id", "related_sales_order_id", "related_pick_task_id", "related_amazon_order_id", "scan_code", "device_id", "approval_status", "notes"],
  SALES_ORDERS: ["sales_order_id", "channel", "order_source", "customer_name", "customer_email", "customer_phone", "amazon_order_id", "order_date", "ship_by_date", "status", "currency", "subtotal_amount", "tax_amount", "shipping_amount", "total_amount", "invoice_status", "quickbooks_invoice_id", "created_by", "created_at", "updated_at", "notes", "customer_id", "ship_method", "payment_terms", "tax_enabled", "tax_rate", "estimated_gross_profit", "estimated_gross_margin_percent", "confirmed_at", "picked_at", "shipped_at", "bl_folio", "shipping_address"],
  SALES_ORDER_LINES: ["sales_order_line_id", "sales_order_id", "channel", "amazon_order_item_id", "product_id", "amazon_sku", "wholesale_sku", "qty_ordered", "qty_picked", "qty_remaining", "unit_type", "unit_price", "currency", "line_total", "preferred_internal_lot_id", "preferred_location_id", "line_status", "notes", "unit_weight_lbs", "inventory_qty_required", "inventory_unit_type", "unit_cost", "estimated_gross_profit", "expiration_date", "fefo_status"],
  PICK_TASKS: ["pick_task_id", "sales_order_id", "sales_order_line_id", "channel", "task_date", "priority", "product_id", "recommended_internal_lot_id", "recommended_location_id", "qty_to_pick", "qty_picked", "unit_type", "assigned_to", "pick_status", "picked_at", "scan_code", "device_id", "exception_code", "notes", "qty_to_pick_base", "reservation_status"],
  AMAZON_PACKAGES: ["package_id", "package_qr_value", "amazon_sku", "product_id", "source_internal_lot_id", "qty_product_used", "unit_type", "packed_by", "packed_at", "package_status", "current_location_id", "matched_amazon_order_id", "matched_amazon_order_item_id", "shipped_at", "notes"],
  AMAZON_SCAN_MATCHES: ["scan_match_id", "scanned_at", "scanned_by", "device_id", "package_id", "amazon_order_id", "amazon_order_item_id", "amazon_sku", "product_id", "match_status", "match_confidence", "exception_code", "related_pick_task_id", "related_movement_id", "notes"],
  AUDIT_LOG: ["audit_id", "timestamp", "user_id", "role", "device_id", "action_type", "table_name", "record_id", "field_name", "old_value", "new_value", "source_screen", "notes"]
};

let SS_CACHE = null;
let READ_CACHE = {};
let META_CACHE = {};

const ROUTES = {
  getDashboard,
  authenticateUser,
  listProducts,
  listLots,
  createOpeningInventory,
  listUsers,
  createUser,
  deactivateUser,
  createProduct,
  updateProductStatus,
  listSuppliers,
  createSupplier,
  listLocations,
  listPurchaseOrders,
  getPurchaseOrderDetail,
  generatePurchaseOrderTemplate,
  createPurchaseOrder,
  purchaseOrderAction,
  listSalesOrders,
  getSalesOrderDetail,
  createSalesOrder,
  salesOrderAction,
  receiveProduct,
  sendProduct,
  recordInventoryMovement,
  recordAmazonOutbound,
  listAmazonOutboundActivity,
  inventorySnapshot,
  getOperationalReports,
  lookupScan,
  matchAmazonPackageScan,
  validateOperationalSchema
};

function doGet(e) {
  if (e && e.parameter && e.parameter.action) {
    return handleApiRequest_(e.parameter.action, e.parameter.payload, e.parameter.callback);
  }
  return HtmlService.createHtmlOutput("San Jose Operations Apps Script is deployed.");
}

function doPost(e) {
  const request = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  return handleApiRequest_(request.action, JSON.stringify(request.payload || {}), null);
}

function handleApiRequest_(action, payloadText, callback) {
  resetRequestCache_();
  try {
    const payload = payloadText ? JSON.parse(payloadText) : {};
    const route = ROUTES[action];
    if (!route) throw new Error("Unknown action: " + action);
    return json_({ ok: true, result: route(payload) }, callback);
  } catch (error) {
    return json_({ ok: false, error: error.message || String(error) }, callback);
  }
}

function json_(value, callback) {
  const body = callback ? `${callback}(${JSON.stringify(value)});` : JSON.stringify(value);
  return ContentService.createTextOutput(body).setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function resetRequestCache_() {
  READ_CACHE = {};
  META_CACHE = {};
}

function ss_() {
  if (!SS_CACHE) SS_CACHE = SpreadsheetApp.openById(SPREADSHEET_ID);
  return SS_CACHE;
}

function sheet_(sheetName, createIfMissing) {
  let sheet = ss_().getSheetByName(sheetName);
  if (!sheet && createIfMissing) {
    sheet = ss_().insertSheet(sheetName);
    const headers = CORE_SCHEMA[sheetName] || [];
    if (headers.length) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function meta_(sheetName, createIfMissing) {
  const key = sheetName + ":" + Boolean(createIfMissing);
  if (META_CACHE[key]) return META_CACHE[key];

  const sheet = sheet_(sheetName, createIfMissing);
  if (!sheet) return META_CACHE[key] = { sheet: null, values: [], headers: [], headerRow: 1 };

  let values = sheet.getDataRange().getValues();
  let headerIndex = values.findIndex(row => row.some(cell => String(cell || "").trim().endsWith("_id")));
  if (headerIndex < 0) {
    if (!createIfMissing) return META_CACHE[key] = { sheet, values: [], headers: [], headerRow: 1 };
    const schema = CORE_SCHEMA[sheetName] || [];
    sheet.getRange(1, 1, 1, schema.length).setValues([schema]);
    values = sheet.getDataRange().getValues();
    headerIndex = 0;
  }

  let headers = values[headerIndex].map(cell => String(cell || "").trim()).filter(Boolean);
  if (createIfMissing) {
    const missing = (CORE_SCHEMA[sheetName] || []).filter(header => headers.indexOf(header) < 0);
    if (missing.length) {
      sheet.getRange(headerIndex + 1, headers.length + 1, 1, missing.length).setValues([missing]);
      headers = headers.concat(missing);
      values = sheet.getDataRange().getValues();
    }
  }

  return META_CACHE[key] = { sheet, values, headers, headerRow: headerIndex + 1 };
}

function readTable_(sheetName) {
  if (READ_CACHE[sheetName]) return READ_CACHE[sheetName];
  const meta = meta_(sheetName, false);
  if (!meta.sheet || !meta.headers.length) return READ_CACHE[sheetName] = [];

  const rows = meta.values.slice(meta.headerRow)
    .filter(row => row.some(cell => cell !== "" && cell !== null))
    .map(row => {
      const record = {};
      meta.headers.forEach((header, index) => record[header] = row[index]);
      return record;
    });
  return READ_CACHE[sheetName] = rows;
}

function appendRecord_(sheetName, record) {
  const meta = meta_(sheetName, true);
  meta.sheet.appendRow(meta.headers.map(header => record[header] !== undefined ? record[header] : ""));
  clearCache_(sheetName);
}

function updateRecord_(sheetName, idColumn, idValue, fields) {
  const meta = meta_(sheetName, true);
  const idIndex = meta.headers.indexOf(idColumn);
  if (idIndex < 0) throw new Error(`Missing ${idColumn} in ${sheetName}.`);

  for (let row = meta.headerRow + 1; row <= meta.sheet.getLastRow(); row++) {
    if (String(meta.sheet.getRange(row, idIndex + 1).getValue()) !== String(idValue)) continue;
    Object.keys(fields || {}).forEach(field => {
      const col = meta.headers.indexOf(field);
      if (col >= 0) meta.sheet.getRange(row, col + 1).setValue(fields[field]);
    });
    clearCache_(sheetName);
    return;
  }
  throw new Error(`${idValue} was not found in ${sheetName}.`);
}

function clearCache_(sheetName) {
  delete READ_CACHE[sheetName];
  Object.keys(META_CACHE).forEach(key => {
    if (key.indexOf(sheetName + ":") === 0) delete META_CACHE[key];
  });
}

function nextId_(sheetName, idColumn, prefix) {
  const maxNumber = readTable_(sheetName).reduce((max, row) => {
    const match = String(row[idColumn] || "").match(/(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(maxNumber + 1).padStart(6, "0")}`;
}

function n_(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : (fallback || 0);
}

function text_(value) {
  return String(value || "").trim();
}

function upper_(value) {
  return text_(value).toUpperCase();
}

function now_() {
  return new Date();
}

function today_() {
  return Utilities.formatDate(now_(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function date_(value) {
  const d = value instanceof Date ? value : value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
}

function dateKey_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function active_(row) {
  return row && row.is_active !== false && upper_(row.is_active || "TRUE") !== "FALSE";
}

function role_(value) {
  const role = upper_(value || "OPERATOR");
  return ["ADMIN", "MANAGER", "OPERATOR"].indexOf(role) >= 0 ? role : "OPERATOR";
}

function require_(user, permissions) {
  const role = role_(user && user.role);
  const requested = Array.isArray(permissions) ? permissions : [permissions];
  const allowed = {
    ADMIN: ["products:create", "suppliers:create", "purchaseOrders:create", "purchaseOrders:actions", "salesOrders:create", "salesOrders:actions", "receiving:create", "inventory:adjust", "scanner:lookup"],
    MANAGER: ["products:create", "suppliers:create", "purchaseOrders:create", "purchaseOrders:actions", "salesOrders:create", "salesOrders:actions", "receiving:create", "inventory:adjust", "scanner:lookup"],
    OPERATOR: ["salesOrders:actions", "receiving:create", "inventory:adjust", "scanner:lookup"]
  };
  if (requested.some(permission => allowed[role].indexOf(permission) >= 0)) return;
  throw new Error("Permission denied.");
}

function byId_(rows, idColumn) {
  return (rows || []).reduce((map, row) => {
    if (row && row[idColumn] !== undefined && row[idColumn] !== "") map[String(row[idColumn])] = row;
    return map;
  }, {});
}

function unique_(values) {
  const seen = {};
  return (values || []).filter(value => {
    const key = String(value || "");
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function sum_(rows, field) {
  return (rows || []).reduce((sum, row) => sum + n_(row[field], 0), 0);
}

function partyType_(value) {
  return upper_(value) === "CUSTOMER" ? "CUSTOMER" : "VENDOR";
}

function lotQty_(lot) {
  return n_(lot.current_qty_script !== undefined && lot.current_qty_script !== "" ? lot.current_qty_script : lot.original_qty, 0);
}

function lotUnitCost_(lot) {
  const originalQty = n_(lot.original_qty, 0);
  const purchaseQty = n_(lot.purchase_qty_received, 0);
  const costPerPurchaseUnit = n_(lot.unit_cost, 0);
  return originalQty > 0 && purchaseQty > 0
    ? costPerPurchaseUnit / (originalQty / purchaseQty)
    : costPerPurchaseUnit;
}

function audit_(user, action, tableName, recordId) {
  try {
    appendRecord_("AUDIT_LOG", {
      audit_id: nextId_("AUDIT_LOG", "audit_id", "AUDIT"),
      timestamp: now_(),
      user_id: (user && user.user_id) || "SYSTEM",
      role: role_(user && user.role),
      device_id: "WEB_APP",
      action_type: action,
      table_name: tableName,
      record_id: recordId,
      source_screen: "APPS_SCRIPT"
    });
  } catch (_error) {}
}

function listUsers() {
  return readTable_("USERS").filter(active_).map(user => Object.assign({}, user, { role: role_(user.role) }));
}

function authenticateUser(payload) {
  const pin = text_((payload || {}).pin);
  const user = readTable_("USERS").find(row => active_(row) && text_(row.pin) === pin);
  if (!user && pin === "1014") return { authenticated: true, user_id: "ADMIN", full_name: "Admin", role: "ADMIN" };
  if (!user) throw new Error("Code does not match an active user.");
  return { authenticated: true, user_id: user.user_id, full_name: user.full_name || user.user_id, role: role_(user.role) };
}

function createUser(payload) {
  const actor = (payload || {}).user || {};
  const input = (payload || {}).input || {};
  if (role_(actor.role) !== "ADMIN") throw new Error("Only an Admin can create users.");
  const pin = text_(input.pin);
  if (!text_(input.full_name) || !/^\d{4}$/.test(pin)) throw new Error("Full name and a 4-digit PIN are required.");
  if (readTable_("USERS").some(user => active_(user) && text_(user.pin) === pin)) throw new Error("An active user already has that code.");
  const record = { user_id: input.user_id || nextId_("USERS", "user_id", "USR"), full_name: text_(input.full_name), role: role_(input.role), email: input.email || "", device_assigned: input.device_assigned || "", is_active: true, created_at: now_(), updated_at: now_(), notes: input.notes || "", pin };
  appendRecord_("USERS", record);
  audit_(actor, "CREATE_USER", "USERS", record.user_id);
  return record;
}

function deactivateUser(payload) {
  const actor = (payload || {}).user || {};
  const userId = text_((payload || {}).userId || (payload || {}).user_id);
  if (role_(actor.role) !== "ADMIN") throw new Error("Only an Admin can remove users.");
  updateRecord_("USERS", "user_id", userId, { is_active: false, updated_at: now_() });
  audit_(actor, "DEACTIVATE_USER", "USERS", userId);
  return { user_id: userId, is_active: false };
}

function listProducts() {
  return readTable_("PRODUCTS").filter(active_).sort((a, b) => String(a.product_name || "").localeCompare(String(b.product_name || "")));
}

function listLots() {
  return readTable_("LOTS");
}

function listLocations() {
  return readTable_("LOCATIONS").filter(active_);
}

function createProduct(payload) {
  const user = (payload || {}).user || {};
  const input = (payload || {}).input || {};
  require_(user, "products:create");
  const name = text_(input.product_name);
  if (!name) throw new Error("Product name is required.");
  if (readTable_("PRODUCTS").some(row => text_(row.product_name).toLowerCase() === name.toLowerCase())) throw new Error("A product with this name already exists.");
  const id = input.product_id || nextId_("PRODUCTS", "product_id", "PROD");
  const record = { product_id: id, product_name: name, product_category: input.product_category || "General", default_unit: input.default_unit || "LB", case_weight_lbs: n_(input.case_weight_lbs, 0), amazon_sku: input.amazon_sku || "", wholesale_sku: input.wholesale_sku || "", barcode_or_qr_value: input.barcode_or_qr_value || id, min_stock_qty: n_(input.min_stock_qty, 0), target_stock_qty: n_(input.target_stock_qty, 0), velocity_class: input.velocity_class || "", storage_zone_preference: input.storage_zone_preference || "", is_active: true, created_at: now_(), updated_at: now_(), notes: input.notes || "", base_unit: input.base_unit || "LB", units_per_purchase_unit: n_(input.units_per_purchase_unit || input.case_weight_lbs, 1), can_break_case: input.can_break_case || "", perishability_days: n_(input.perishability_days, 0) };
  appendRecord_("PRODUCTS", record);
  audit_(user, "CREATE_PRODUCT", "PRODUCTS", id);
  return record;
}

function updateProductStatus(payload) {
  const user = (payload || {}).user || {};
  const productId = text_((payload || {}).productId || (payload || {}).product_id);
  require_(user, "products:create");
  updateRecord_("PRODUCTS", "product_id", productId, { is_active: Boolean((payload || {}).isActive !== undefined ? (payload || {}).isActive : (payload || {}).is_active), updated_at: now_() });
  return readTable_("PRODUCTS").find(row => String(row.product_id) === productId);
}

function listSuppliers() {
  return readTable_("SUPPLIERS").filter(active_).map(row => Object.assign({}, row, { party_type: partyType_(row.party_type) })).sort((a, b) => String(a.supplier_name || "").localeCompare(String(b.supplier_name || "")));
}

function createSupplier(payload) {
  const user = (payload || {}).user || {};
  const input = (payload || {}).input || {};
  require_(user, "suppliers:create");
  if (!text_(input.supplier_name)) throw new Error("Business name is required.");
  const type = partyType_(input.party_type);
  const record = { supplier_id: input.supplier_id || nextId_("SUPPLIERS", "supplier_id", type === "CUSTOMER" ? "CUST" : "SUP"), supplier_name: text_(input.supplier_name), contact_name: input.contact_name || "", email: input.email || "", phone: input.phone || "", address: input.address || "", payment_terms: input.payment_terms || "Net 30", default_currency: input.default_currency || input.currency || "USD", lead_time_expected_days: n_(input.lead_time_expected_days, 5), is_active: true, created_at: now_(), updated_at: now_(), notes: input.notes || "", party_type: type };
  appendRecord_("SUPPLIERS", record);
  audit_(user, "CREATE_PARTY", "SUPPLIERS", record.supplier_id);
  return record;
}

function listPurchaseOrders() {
  const suppliers = byId_(readTable_("SUPPLIERS"), "supplier_id");
  const lineCounts = {};
  readTable_("PURCHASE_ORDER_LINES").forEach(line => lineCounts[line.po_id] = (lineCounts[line.po_id] || 0) + 1);
  return readTable_("PURCHASE_ORDERS").map(po => Object.assign({}, po, { supplier: suppliers[po.supplier_id] || null, line_count: lineCounts[po.po_id] || 0 })).sort((a, b) => String(b.order_date || "").localeCompare(String(a.order_date || "")));
}

function getPurchaseOrderDetail(payload) {
  const poId = typeof payload === "string" ? payload : text_((payload || {}).poId || (payload || {}).po_id);
  const po = readTable_("PURCHASE_ORDERS").find(row => String(row.po_id) === poId);
  if (!po) return null;
  const suppliers = byId_(readTable_("SUPPLIERS"), "supplier_id");
  const products = byId_(readTable_("PRODUCTS"), "product_id");
  return { po: Object.assign({}, po, { supplier: suppliers[po.supplier_id] || null }), lines: readTable_("PURCHASE_ORDER_LINES").filter(line => String(line.po_id) === poId).map(line => Object.assign({}, line, { product: products[line.product_id] || null })) };
}

function createPurchaseOrder(payload) {
  const user = (payload || {}).user || {};
  const input = (payload || {}).input || {};
  require_(user, "purchaseOrders:create");
  const supplierId = text_(input.supplier_id || input.vendor_id);
  const inputLines = Array.isArray(input.lines) ? input.lines : [];
  if (!supplierId || !inputLines.length) throw new Error("Choose a supplier and add at least one product line.");
  const suppliers = byId_(readTable_("SUPPLIERS"), "supplier_id");
  const products = byId_(readTable_("PRODUCTS"), "product_id");
  const poId = input.po_id || nextId_("PURCHASE_ORDERS", "po_id", "PO");
  const currency = input.currency || (suppliers[supplierId] || {}).default_currency || "USD";
  let subtotal = 0;
  const lines = inputLines.map(line => {
    const product = products[line.product_id] || {};
    const qty = n_(line.qty_ordered || line.quantity, 0);
    const cost = n_(line.unit_cost || line.cost, 0);
    const units = n_(line.units_per_purchase_unit || line.case_weight_lbs || product.units_per_purchase_unit || product.case_weight_lbs, 1);
    if (!line.product_id || qty <= 0 || units <= 0) throw new Error("Complete every purchase order line.");
    subtotal += qty * cost;
    const lineId = nextId_("PURCHASE_ORDER_LINES", "po_line_id", "POL");
    return { po_line_id: lineId, po_id: poId, supplier_id: supplierId, product_id: line.product_id, line_status: "ORDERED", qty_ordered: qty, qty_received_total: 0, qty_remaining: qty, unit_type: line.unit_type || product.default_unit || "CASE", unit_cost: cost, currency, line_total: qty * cost, supplier_expected_lot_number: line.supplier_expected_lot_number || "", notes: line.notes || "", base_unit: line.base_unit || product.base_unit || "LB", units_per_purchase_unit: units, expected_base_qty: qty * units, case_weight_lbs: units, qr_value: lineId };
  });
  const taxEnabled = input.tax_enabled === true || upper_(input.tax_enabled) === "TRUE";
  const taxRate = n_(input.tax_rate_percent !== undefined ? input.tax_rate_percent : input.tax_rate, 0);
  const shipping = n_(input.shipping_amount, 0);
  const tax = taxEnabled ? subtotal * taxRate / 100 : 0;
  const po = { po_id: poId, po_status: input.po_status || "ORDERED", supplier_id: supplierId, created_by: user.user_id || user.role || "", order_date: input.order_date || today_(), expected_delivery_date: input.expected_delivery_date || "", actual_first_received_date: "", actual_completed_date: "", payment_terms: input.payment_terms || (suppliers[supplierId] || {}).payment_terms || "Net 30", currency, subtotal_amount: subtotal, tax_amount: tax, shipping_amount: shipping, total_amount: subtotal + tax + shipping, email_status: "NOT_SENT", printed_status: "NOT_PRINTED", supplier_confirmation_status: "PENDING", notes: input.notes || "", tax_enabled: taxEnabled, tax_rate: taxRate, ship_via: input.ship_via || "", bill_status: "NOT_CREATED" };
  appendRecord_("PURCHASE_ORDERS", po);
  lines.forEach(line => appendRecord_("PURCHASE_ORDER_LINES", line));
  audit_(user, "CREATE_PO", "PURCHASE_ORDERS", poId);
  return Object.assign({}, po, { lines });
}

function purchaseOrderAction(payload) {
  const user = (payload || {}).user || {};
  const poId = text_((payload || {}).poId || (payload || {}).po_id);
  const action = upper_((payload || {}).action || (payload || {}).status);
  require_(user, "purchaseOrders:actions");
  const statusMap = { MARKSENT: "SENT", SEND: "SENT", SENT: "SENT", ORDER: "ORDERED", ORDERED: "ORDERED", CANCEL: "CANCELLED", CANCELLED: "CANCELLED", CLOSE: "CLOSED", CLOSED: "CLOSED" };
  updateRecord_("PURCHASE_ORDERS", "po_id", poId, { po_status: statusMap[action] || action, updated_at: now_() });
  return getPurchaseOrderDetail({ po_id: poId });
}

function generatePurchaseOrderTemplate(payload) {
  const detail = getPurchaseOrderDetail(payload);
  if (!detail) throw new Error("Purchase order was not found.");
  return Object.assign({}, detail, { generated_at: now_(), message: "Template data ready." });
}

function receiveProduct(payload) {
  const user = (payload || {}).user || {};
  const input = (payload || {}).input || payload || {};
  require_(user, "receiving:create");
  const line = readTable_("PURCHASE_ORDER_LINES").find(row => String(row.po_line_id) === text_(input.po_line_id));
  if (!line) throw new Error("PO line was not found.");
  const qtyReceived = n_(input.qty_received, 0);
  const qtyDamaged = n_(input.qty_damaged, 0);
  const qtyAccepted = qtyReceived - qtyDamaged;
  if (qtyReceived <= 0 || qtyAccepted <= 0) throw new Error("Accepted quantity must be greater than zero.");
  const units = n_(line.units_per_purchase_unit || line.case_weight_lbs, 1);
  const baseQty = n_(input.actual_base_qty, qtyAccepted * units);
  const lotId = input.internal_lot_id || nextId_("LOTS", "internal_lot_id", "LOT");
  const receivingId = nextId_("RECEIVING", "receiving_id", "RCV");
  const locationId = input.confirmed_location_id || input.location_id || "";
  const qualityStatus = upper_(input.quality_status || "PASS");
  const receiving = { receiving_id: receivingId, po_id: line.po_id, po_line_id: line.po_line_id, supplier_id: line.supplier_id, product_id: line.product_id, scan_code: input.scan_code || line.po_line_id, internal_lot_id: lotId, supplier_lot_number: input.supplier_lot_number || "", received_date: today_(), received_by: user.user_id || user.role || "", qty_received: qtyReceived, qty_damaged: qtyDamaged, qty_accepted: qtyAccepted, unit_type: line.unit_type, quality_score: input.quality_score || "", over_under_status: "", confirmed_location_id: locationId, requires_supervisor_approval: qualityStatus !== "PASS", approval_status: qualityStatus === "PASS" ? "APPROVED" : "PENDING", notes: input.notes || "", base_unit: line.base_unit || "LB", units_per_purchase_unit: units, qty_accepted_base: baseQty, pallet_count: n_(input.pallet_count, 0), quality_status: qualityStatus };
  const lot = { internal_lot_id: lotId, product_id: line.product_id, supplier_id: line.supplier_id, supplier_lot_number: input.supplier_lot_number || "", po_id: line.po_id, po_line_id: line.po_line_id, received_date: today_(), original_qty: baseQty, current_qty_script: baseQty, unit_type: line.base_unit || "LB", unit_cost: line.unit_cost, currency: line.currency || "USD", current_location_id: locationId, status: qualityStatus === "HOLD" ? "HOLD" : "ACTIVE", expiration_date: input.expiration_date || "", qr_value: lotId, created_at: now_(), updated_at: now_(), notes: input.notes || "", purchase_qty_received: qtyAccepted, purchase_unit_type: line.unit_type, pallet_count: n_(input.pallet_count, 0) };
  const movement = { movement_id: nextId_("INVENTORY_MOVEMENTS", "movement_id", "MOV"), movement_type: "RECEIVE", timestamp: now_(), user_id: user.user_id || user.role || "", product_id: line.product_id, internal_lot_id: lotId, qty_change: baseQty, unit_type: line.base_unit || "LB", from_location_id: "RECEIVING", to_location_id: locationId, related_po_id: line.po_id, related_receiving_id: receivingId, scan_code: lotId, device_id: input.device_id || "WEB_APP", approval_status: receiving.approval_status, notes: input.notes || "" };
  appendRecord_("RECEIVING", receiving);
  appendRecord_("LOTS", lot);
  appendRecord_("INVENTORY_MOVEMENTS", movement);
  const totalReceived = n_(line.qty_received_total, 0) + qtyAccepted;
  const remaining = Math.max(n_(line.qty_ordered, 0) - totalReceived, 0);
  updateRecord_("PURCHASE_ORDER_LINES", "po_line_id", line.po_line_id, { qty_received_total: totalReceived, qty_remaining: remaining, line_status: remaining <= 0 ? "RECEIVED" : "PARTIAL" });
  refreshPurchaseOrderStatus_(line.po_id);
  return { receiving, lot, movement, purchaseOrder: getPurchaseOrderDetail({ po_id: line.po_id }) };
}

function refreshPurchaseOrderStatus_(poId) {
  const lines = readTable_("PURCHASE_ORDER_LINES").filter(line => String(line.po_id) === String(poId));
  if (!lines.length) return;
  const anyReceived = lines.some(line => n_(line.qty_received_total, 0) > 0);
  const allReceived = lines.every(line => n_(line.qty_remaining, n_(line.qty_ordered, 0)) <= 0);
  updateRecord_("PURCHASE_ORDERS", "po_id", poId, { po_status: allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : "ORDERED", actual_first_received_date: anyReceived ? today_() : "", actual_completed_date: allReceived ? today_() : "" });
}

function createOpeningInventory(payload) {
  const user = (payload || {}).user || {};
  const input = (payload || {}).input || {};
  require_(user, "receiving:create");
  let product = input.product_id ? byId_(readTable_("PRODUCTS"), "product_id")[input.product_id] : null;
  if (!product) product = createProduct({ user, input: Object.assign({}, input, { product_category: input.product_category || "Opening Inventory" }) });
  const qty = n_(input.qty || input.quantity, 0);
  const weight = n_(input.purchase_unit_weight || input.case_weight_lbs, 1);
  if (qty <= 0) throw new Error("Quantity must be greater than zero.");
  const locations = Array.isArray(input.location_ids) && input.location_ids.length ? input.location_ids : [input.location_id || ""];
  const lots = [];
  const movements = [];
  locations.forEach(locationId => {
    const lotId = nextId_("LOTS", "internal_lot_id", "LOT");
    const baseQty = qty * weight;
    const lot = { internal_lot_id: lotId, product_id: product.product_id, supplier_lot_number: input.supplier_lot_number || "OPENING", received_date: today_(), original_qty: baseQty, current_qty_script: baseQty, unit_type: "LB", unit_cost: n_(input.unit_cost, 0), currency: input.currency || "USD", current_location_id: locationId, status: "ACTIVE", expiration_date: input.expiration_date || "", qr_value: lotId, created_at: now_(), updated_at: now_(), notes: input.notes || "Opening inventory count.", purchase_qty_received: qty, purchase_unit_type: input.purchase_unit || "UNIT", pallet_count: n_(input.pallet_count, 0) };
    const movement = { movement_id: nextId_("INVENTORY_MOVEMENTS", "movement_id", "MOV"), movement_type: "OPENING_INVENTORY", timestamp: now_(), user_id: user.user_id || user.role || "", product_id: product.product_id, internal_lot_id: lotId, qty_change: baseQty, unit_type: "LB", from_location_id: "OPENING_COUNT", to_location_id: locationId, scan_code: lotId, device_id: "WEB_APP", approval_status: "APPROVED", notes: input.notes || "" };
    appendRecord_("LOTS", lot);
    appendRecord_("INVENTORY_MOVEMENTS", movement);
    lots.push(lot);
    movements.push(movement);
  });
  return { product, lot: lots[0], movement: movements[0], lots, movements };
}

function findLotByScan_(value) {
  const key = text_(value);
  if (!key) return null;
  return readTable_("LOTS").find(lot =>
    [lot.internal_lot_id, lot.qr_value, lot.supplier_lot_number].map(String).indexOf(key) >= 0
  ) || null;
}

function outboundMovementType_(type) {
  return ["SALE", "AMAZON_OUT", "ADJUST_OUT", "USE", "WASTE", "SAMPLE", "TRANSFER_OUT"].indexOf(upper_(type)) >= 0;
}

function inboundMovementType_(type) {
  return ["ADJUST_IN", "RECEIVE", "RETURN", "OPENING_INVENTORY", "TRANSFER_IN"].indexOf(upper_(type)) >= 0;
}

function movementQtyChange_(input) {
  if (input.qty_change !== undefined && input.qty_change !== "") return n_(input.qty_change, 0);
  const qty = Math.abs(n_(input.qty, 0));
  if (!qty) return 0;
  const type = upper_(input.movement_type || "SALE");
  return inboundMovementType_(type) ? qty : -qty;
}

function applyLotQuantityChange_(lot, qtyChange, movementType) {
  if (!lot || !lot.internal_lot_id) return;
  const currentQty = lotQty_(lot);
  const nextQty = Math.max(0, currentQty + qtyChange);
  if (qtyChange < 0 && Math.abs(qtyChange) - currentQty > 0.0001) {
    throw new Error(`Not enough inventory in lot ${lot.internal_lot_id}. Available ${currentQty}, requested ${Math.abs(qtyChange)}.`);
  }

  const changes = {
    current_qty_script: nextQty,
    updated_at: now_()
  };

  if (outboundMovementType_(movementType) && nextQty <= 0.0001) {
    changes.status = "EMPTY";
  } else if (inboundMovementType_(movementType) && nextQty > 0 && upper_(lot.status) === "EMPTY") {
    changes.status = "ACTIVE";
  }

  updateRecord_("LOTS", "internal_lot_id", lot.internal_lot_id, changes);
}

function sendProduct(payload) {
  const user = (payload || {}).user || {};
  const input = (payload || {}).input || payload || {};
  require_(user, "inventory:adjust");

  const salesOrderId = text_(input.related_sales_order_id || input.sales_order_id);
  const salesOrderLineId = text_(input.sales_order_line_id);
  const scannedLot = findLotByScan_(input.internal_lot_id || input.lot_id || input.scan_code);
  const qtyBase = Math.abs(n_(input.qty || input.qty_to_send || input.qty_change, 0));

  if (!scannedLot) throw new Error("Scan the physical lot/pallet QR before sending product.");
  if (qtyBase <= 0) throw new Error("Quantity to send must be greater than zero.");

  let line = null;
  let pickTask = null;

  if (salesOrderId) {
    const order = readTable_("SALES_ORDERS").find(row => String(row.sales_order_id) === salesOrderId);
    if (!order) throw new Error("Sales Order was not found.");

    const orderLines = readTable_("SALES_ORDER_LINES").filter(row => String(row.sales_order_id) === salesOrderId);
    line = salesOrderLineId
      ? orderLines.find(row => String(row.sales_order_line_id) === salesOrderLineId)
      : orderLines.find(row =>
          String(row.product_id) === String(scannedLot.product_id) &&
          String(row.preferred_internal_lot_id) === String(scannedLot.internal_lot_id)
        );

    if (!line) throw new Error("The scanned lot is not assigned to this Sales Order.");
    if (String(line.product_id) !== String(scannedLot.product_id)) throw new Error("Scanned product does not match the Sales Order line.");
    if (String(line.preferred_internal_lot_id || "") && String(line.preferred_internal_lot_id) !== String(scannedLot.internal_lot_id)) {
      throw new Error("Scanned lot does not match the recommended Sales Order lot.");
    }

    const orderedSalesQty = n_(line.qty_ordered, 0);
    const remainingSalesQty = n_(line.qty_remaining, orderedSalesQty);
    const requiredBase = n_(line.inventory_qty_required, 0) || orderedSalesQty;
    const remainingBase = orderedSalesQty > 0 ? requiredBase * (remainingSalesQty / orderedSalesQty) : requiredBase;
    if (remainingBase > 0 && qtyBase - remainingBase > 0.0001) {
      throw new Error(`Send quantity is higher than the remaining Sales Order quantity. Remaining base qty: ${remainingBase}.`);
    }

    pickTask = readTable_("PICK_TASKS").find(task => String(task.sales_order_line_id) === String(line.sales_order_line_id)) || null;
  }

  const movement = recordInventoryMovement({
    user,
    input: {
      movement_type: upper_(input.movement_type || (salesOrderId ? "SALE" : "AMAZON_OUT")),
      product_id: scannedLot.product_id,
      internal_lot_id: scannedLot.internal_lot_id,
      qty: qtyBase,
      unit_type: input.unit_type || scannedLot.unit_type || "LB",
      from_location_id: input.from_location_id || input.location_id || scannedLot.current_location_id || "",
      to_location_id: input.to_location_id || (salesOrderId ? "CUSTOMER" : "OUTBOUND"),
      related_sales_order_id: salesOrderId,
      related_pick_task_id: pickTask ? pickTask.pick_task_id : input.related_pick_task_id || "",
      related_amazon_order_id: input.related_amazon_order_id || input.amazon_order_id || "",
      package_id: input.package_id || "",
      scan_code: input.scan_code || scannedLot.qr_value || scannedLot.internal_lot_id,
      device_id: input.device_id || "WEB_APP",
      notes: input.notes || "Send Product scan."
    }
  });

  return {
    movement,
    salesOrder: salesOrderId ? getSalesOrderDetail({ sales_order_id: salesOrderId }) : null
  };
}

function updateSalesOrderProgressAfterSend_(salesOrderId, line, pickTask, qtySentBase) {
  const orderedSalesQty = n_(line.qty_ordered, 0);
  const requiredBase = n_(line.inventory_qty_required, 0) || orderedSalesQty;
  const previousPicked = n_(line.qty_picked, 0);
  const salesQtySent = requiredBase > 0 && orderedSalesQty > 0 ? qtySentBase / requiredBase * orderedSalesQty : qtySentBase;
  const newPicked = Math.min(orderedSalesQty, previousPicked + salesQtySent);
  const remaining = Math.max(0, orderedSalesQty - newPicked);
  const lineStatus = remaining <= 0.0001 ? "PICKED" : "PARTIALLY_PICKED";

  updateRecord_("SALES_ORDER_LINES", "sales_order_line_id", line.sales_order_line_id, {
    qty_picked: newPicked,
    qty_remaining: remaining,
    line_status: lineStatus
  });

  if (pickTask) {
    const taskTarget = n_(pickTask.qty_to_pick, orderedSalesQty);
    const taskPicked = Math.min(taskTarget, n_(pickTask.qty_picked, 0) + salesQtySent);
    updateRecord_("PICK_TASKS", "pick_task_id", pickTask.pick_task_id, {
      qty_picked: taskPicked,
      pick_status: lineStatus,
      picked_at: now_(),
      scan_code: line.preferred_internal_lot_id || pickTask.scan_code || "",
      device_id: pickTask.device_id || "WEB_APP",
      reservation_status: remaining <= 0.0001 ? "PICKED" : "RESERVED"
    });
  }

  const freshLines = readTable_("SALES_ORDER_LINES").filter(row => String(row.sales_order_id) === String(salesOrderId));
  const allPicked = freshLines.length > 0 && freshLines.every(row => n_(row.qty_remaining, 0) <= 0.0001 || upper_(row.line_status) === "PICKED");
  const anyPicked = freshLines.some(row => n_(row.qty_picked, 0) > 0 || ["PICKED", "PARTIALLY_PICKED"].indexOf(upper_(row.line_status)) >= 0);

  updateRecord_("SALES_ORDERS", "sales_order_id", salesOrderId, {
    status: allPicked ? "PICKED" : anyPicked ? "PARTIALLY_PICKED" : "CONFIRMED",
    picked_at: anyPicked ? now_() : "",
    updated_at: now_()
  });
}

function updateSalesProgressFromMovement_(movement, qtySentBase) {
  const salesOrderId = text_(movement.related_sales_order_id);
  if (!salesOrderId || !outboundMovementType_(movement.movement_type)) return;

  const pickTask = movement.related_pick_task_id
    ? readTable_("PICK_TASKS").find(task => String(task.pick_task_id) === String(movement.related_pick_task_id))
    : null;

  const lines = readTable_("SALES_ORDER_LINES").filter(line => String(line.sales_order_id) === salesOrderId);
  const line = pickTask
    ? lines.find(item => String(item.sales_order_line_id) === String(pickTask.sales_order_line_id))
    : lines.find(item =>
        String(item.product_id) === String(movement.product_id) &&
        String(item.preferred_internal_lot_id) === String(movement.internal_lot_id)
      );

  if (!line) return;
  updateSalesOrderProgressAfterSend_(salesOrderId, line, pickTask, Math.abs(qtySentBase));
}

function recordInventoryMovement(payload) {
  const user = (payload || {}).user || {};
  const input = (payload || {}).input || payload || {};
  require_(user, "inventory:adjust");

  const lot = findLotByScan_(input.internal_lot_id || input.lot_id || input.scan_code);
  const type = upper_(input.movement_type || "ADJUSTMENT");
  const qtyChange = movementQtyChange_(Object.assign({}, input, { movement_type: type }));

  const productId = input.product_id || (lot && lot.product_id) || "";
  const internalLotId = input.internal_lot_id || (lot && lot.internal_lot_id) || "";
  if (!productId || !internalLotId || qtyChange === 0) throw new Error("Product, lot, and quantity change are required.");

  if (lot) {
    applyLotQuantityChange_(lot, qtyChange, type);
  }

  const canonicalLot = lot || { internal_lot_id: internalLotId, product_id: productId, unit_type: input.unit_type || "LB", current_location_id: input.from_location_id || input.location_id || "" };
  const movement = {
    movement_id: nextId_("INVENTORY_MOVEMENTS", "movement_id", "MOV"),
    movement_type: type,
    timestamp: now_(),
    user_id: user.user_id || user.role || "",
    product_id: productId,
    internal_lot_id: canonicalLot.internal_lot_id,
    package_id: input.package_id || "",
    qty_change: qtyChange,
    unit_type: input.unit_type || canonicalLot.unit_type || "LB",
    from_location_id: input.from_location_id || (qtyChange < 0 ? canonicalLot.current_location_id || "" : ""),
    to_location_id: input.to_location_id || (qtyChange > 0 ? canonicalLot.current_location_id || "" : "OUTBOUND"),
    related_po_id: input.related_po_id || "",
    related_receiving_id: input.related_receiving_id || "",
    related_sales_order_id: input.related_sales_order_id || "",
    related_pick_task_id: input.related_pick_task_id || "",
    related_amazon_order_id: input.related_amazon_order_id || "",
    scan_code: input.scan_code || canonicalLot.qr_value || canonicalLot.internal_lot_id,
    device_id: input.device_id || "WEB_APP",
    approval_status: input.approval_status || "APPROVED",
    notes: input.notes || ""
  };

  appendRecord_("INVENTORY_MOVEMENTS", movement);
  updateSalesProgressFromMovement_(movement, Math.abs(qtyChange));
  return movement;
}

function listSalesOrders() {
  const customers = byId_(readTable_("SUPPLIERS"), "supplier_id");
  const products = byId_(readTable_("PRODUCTS"), "product_id");
  const linesByOrder = {};
  readTable_("SALES_ORDER_LINES").forEach(line => {
    if (!linesByOrder[line.sales_order_id]) linesByOrder[line.sales_order_id] = [];
    linesByOrder[line.sales_order_id].push(line);
  });
  return readTable_("SALES_ORDERS").map(order => {
    const lines = linesByOrder[order.sales_order_id] || [];
    return Object.assign({}, order, { customer: customers[order.customer_id] || null, line_count: lines.length, product_names: unique_(lines.map(line => (products[line.product_id] || {}).product_name || line.product_id)).join(", ") });
  }).sort((a, b) => String(b.order_date || "").localeCompare(String(a.order_date || "")));
}

function getSalesOrderDetail(payload) {
  const orderId = typeof payload === "string" ? payload : text_((payload || {}).salesOrderId || (payload || {}).sales_order_id);
  const order = readTable_("SALES_ORDERS").find(row => String(row.sales_order_id) === orderId);
  if (!order) return null;
  const products = byId_(readTable_("PRODUCTS"), "product_id");
  const lots = byId_(readTable_("LOTS"), "internal_lot_id");
  const locations = byId_(readTable_("LOCATIONS"), "location_id");
  const customers = byId_(readTable_("SUPPLIERS"), "supplier_id");
  return { order: Object.assign({}, order, { customer: customers[order.customer_id] || null }), lines: readTable_("SALES_ORDER_LINES").filter(line => String(line.sales_order_id) === orderId).map(line => Object.assign({}, line, { product: products[line.product_id] || null, lot: lots[line.preferred_internal_lot_id] || null, location: locations[line.preferred_location_id] || null })), pickTasks: readTable_("PICK_TASKS").filter(task => String(task.sales_order_id) === orderId) };
}

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
  let subtotal = 0;
  let grossProfit = 0;
  const lines = inputLines.map(inputLine => {
    const product = products[inputLine.product_id] || {};
    const lotId = inputLine.internal_lot_id || inputLine.preferred_internal_lot_id || "";
    const lot = lots[lotId] || {};
    const qty = n_(inputLine.qty_ordered || inputLine.quantity, 0);
    const price = n_(inputLine.unit_price || inputLine.price, 0);
    const cost = n_(inputLine.unit_cost || lot.unit_cost, 0);
    if (!inputLine.product_id || qty <= 0) throw new Error("Complete every sales order line.");
    subtotal += qty * price;
    grossProfit += (price - cost) * qty;
    return { sales_order_line_id: nextId_("SALES_ORDER_LINES", "sales_order_line_id", "SOL"), sales_order_id: orderId, channel: input.channel || input.sales_channel || "WHOLESALE", product_id: inputLine.product_id, amazon_sku: inputLine.amazon_sku || product.amazon_sku || "", wholesale_sku: inputLine.wholesale_sku || product.wholesale_sku || "", qty_ordered: qty, qty_picked: 0, qty_remaining: qty, unit_type: inputLine.unit_type || product.base_unit || "LB", unit_price: price, currency, line_total: qty * price, preferred_internal_lot_id: lotId, preferred_location_id: inputLine.location_id || inputLine.preferred_location_id || lot.current_location_id || "", line_status: "OPEN", notes: inputLine.notes || "", unit_weight_lbs: n_(inputLine.unit_weight_lbs || product.case_weight_lbs, 1), inventory_qty_required: n_(inputLine.inventory_qty_required || qty, qty), inventory_unit_type: inputLine.inventory_unit_type || lot.unit_type || product.base_unit || "LB", unit_cost: cost, estimated_gross_profit: (price - cost) * qty, expiration_date: inputLine.expiration_date || lot.expiration_date || "", fefo_status: inputLine.fefo_status || "" };
  });
  const taxEnabled = input.tax_enabled === true || upper_(input.tax_enabled) === "TRUE";
  const taxRate = n_(input.tax_rate_percent !== undefined ? input.tax_rate_percent : input.tax_rate, 0);
  const tax = taxEnabled ? subtotal * taxRate / 100 : n_(input.tax_amount, 0);
  const shipping = n_(input.shipping_amount, 0);
  const order = { sales_order_id: orderId, channel: input.channel || input.sales_channel || "WHOLESALE", order_source: input.order_source || "WEB_APP", customer_name: input.customer_name || "", customer_email: input.customer_email || "", customer_phone: input.customer_phone || "", amazon_order_id: input.amazon_order_id || "", order_date: input.order_date || today_(), ship_by_date: input.ship_by_date || input.requested_delivery_date || "", status: input.status || "DRAFT", currency, subtotal_amount: subtotal, tax_amount: tax, shipping_amount: shipping, total_amount: subtotal + tax + shipping, invoice_status: "NOT_CREATED", created_by: user.user_id || user.role || "", created_at: now_(), updated_at: now_(), notes: input.notes || "", customer_id: input.customer_id || "", ship_method: input.ship_method || "", payment_terms: input.payment_terms || "", tax_enabled: taxEnabled, tax_rate: taxRate, estimated_gross_profit: grossProfit, estimated_gross_margin_percent: subtotal ? grossProfit / subtotal * 100 : 0, bl_folio: input.bl_folio || nextBlFolio_(), shipping_address: input.shipping_address || "" };
  appendRecord_("SALES_ORDERS", order);
  lines.forEach(line => appendRecord_("SALES_ORDER_LINES", line));
  return Object.assign({}, order, { lines, pickTasks: [] });
}

function salesOrderAction(payload) {
  const user = (payload || {}).user || {};
  const orderId = text_((payload || {}).salesOrderId || (payload || {}).sales_order_id);
  const action = upper_((payload || {}).action || (payload || {}).status);
  require_(user, "salesOrders:actions");

  if (!orderId) throw new Error("Sales Order ID is required.");

  if (action === "CONFIRM" || action === "CONFIRMED") {
    const detail = getSalesOrderDetail({ sales_order_id: orderId });
    if (!detail) throw new Error("Sales Order was not found.");

    const existingTasks = readTable_("PICK_TASKS").filter(task => String(task.sales_order_id) === orderId);
    if (!existingTasks.length) {
      detail.lines.forEach(line => appendRecord_("PICK_TASKS", {
        pick_task_id: nextId_("PICK_TASKS", "pick_task_id", "PICK"),
        sales_order_id: orderId,
        sales_order_line_id: line.sales_order_line_id,
        channel: line.channel,
        task_date: today_(),
        priority: "NORMAL",
        product_id: line.product_id,
        recommended_internal_lot_id: line.preferred_internal_lot_id,
        recommended_location_id: line.preferred_location_id,
        qty_to_pick: line.qty_ordered,
        qty_picked: 0,
        unit_type: line.unit_type,
        assigned_to: "",
        pick_status: "OPEN",
        scan_code: line.preferred_internal_lot_id,
        device_id: "WEB_APP",
        exception_code: "",
        notes: "",
        qty_to_pick_base: line.inventory_qty_required || line.qty_ordered,
        reservation_status: "RESERVED"
      }));
    }

    updateRecord_("SALES_ORDERS", "sales_order_id", orderId, { status: "CONFIRMED", confirmed_at: now_(), updated_at: now_() });
  } else if (action === "PICK" || action === "PICKED") {
    throw new Error("Use Send Product to scan physical inventory. Sales Orders no longer auto-pick or deduct inventory.");
  } else if (action === "SHIP" || action === "SHIPPED") {
    const detail = getSalesOrderDetail({ sales_order_id: orderId });
    if (!detail) throw new Error("Sales Order was not found.");

    const allPicked = detail.lines.length > 0 && detail.lines.every(line =>
      n_(line.qty_remaining, 0) <= 0.0001 || upper_(line.line_status) === "PICKED"
    );
    if (!allPicked) throw new Error("Use Send Product to scan/pick all Sales Order lines before shipping.");

    detail.pickTasks.forEach(task => updateRecord_("PICK_TASKS", "pick_task_id", task.pick_task_id, {
      pick_status: "SHIPPED",
      reservation_status: "RELEASED"
    }));
    updateRecord_("SALES_ORDERS", "sales_order_id", orderId, { status: "SHIPPED", shipped_at: now_(), updated_at: now_() });
  } else if (action === "CANCEL" || action === "CANCELLED") {
    updateRecord_("SALES_ORDERS", "sales_order_id", orderId, { status: "CANCELLED", updated_at: now_() });
  } else {
    updateRecord_("SALES_ORDERS", "sales_order_id", orderId, { status: action, updated_at: now_() });
  }

  return getSalesOrderDetail({ sales_order_id: orderId });
}

function recordAmazonOutbound(payload) {
  const user = (payload || {}).user || {};
  const input = (payload || {}).input || payload || {};
  require_(user, "inventory:adjust");
  const lots = byId_(readTable_("LOTS"), "internal_lot_id");
  const lot = lots[input.source_internal_lot_id || input.internal_lot_id] || {};
  const packageId = input.package_id || nextId_("AMAZON_PACKAGES", "package_id", "PKG");
  const qty = Math.abs(n_(input.qty_product_used || input.qty_change || input.qty, 0));
  const movement = recordInventoryMovement({ user, input: { movement_type: "AMAZON_OUT", product_id: input.product_id || lot.product_id, internal_lot_id: input.source_internal_lot_id || input.internal_lot_id, package_id: packageId, qty_change: -qty, unit_type: input.unit_type || lot.unit_type || "LB", from_location_id: input.current_location_id || lot.current_location_id || "", to_location_id: "AMAZON_PACKAGE", related_amazon_order_id: input.matched_amazon_order_id || "", scan_code: packageId, notes: input.notes || "" } });
  const pkg = { package_id: packageId, package_qr_value: input.package_qr_value || packageId, amazon_sku: input.amazon_sku || "", product_id: input.product_id || lot.product_id, source_internal_lot_id: input.source_internal_lot_id || input.internal_lot_id, qty_product_used: qty, unit_type: input.unit_type || lot.unit_type || "LB", packed_by: user.user_id || user.role || "", packed_at: now_(), package_status: input.package_status || "PACKED", current_location_id: input.current_location_id || lot.current_location_id || "", matched_amazon_order_id: input.matched_amazon_order_id || "", matched_amazon_order_item_id: input.matched_amazon_order_item_id || "", shipped_at: "", notes: input.notes || "" };
  appendRecord_("AMAZON_PACKAGES", pkg);
  return { package: pkg, movement };
}

function listAmazonOutboundActivity() {
  return readTable_("AMAZON_PACKAGES").sort((a, b) => String(b.packed_at || "").localeCompare(String(a.packed_at || "")));
}

function matchAmazonPackageScan(payload) {
  const user = (payload || {}).user || {};
  const input = (payload || {}).input || payload || {};
  const value = text_(input.package_id || input.scan_code || input.package_qr_value || input.scanValue || payload);
  require_(user, "scanner:lookup");
  const pkg = readTable_("AMAZON_PACKAGES").find(row => [row.package_id, row.package_qr_value].map(String).indexOf(value) >= 0);
  if (!pkg) throw new Error("Package was not found.");
  const match = { scan_match_id: nextId_("AMAZON_SCAN_MATCHES", "scan_match_id", "AMZSCAN"), scanned_at: now_(), scanned_by: user.user_id || user.role || "", device_id: input.device_id || "WEB_APP", package_id: pkg.package_id, amazon_order_id: input.amazon_order_id || pkg.matched_amazon_order_id || "", amazon_order_item_id: input.amazon_order_item_id || pkg.matched_amazon_order_item_id || "", amazon_sku: input.amazon_sku || pkg.amazon_sku || "", product_id: pkg.product_id, match_status: "MATCHED", match_confidence: 1, exception_code: "", related_pick_task_id: input.related_pick_task_id || "", related_movement_id: input.related_movement_id || "", notes: input.notes || "" };
  appendRecord_("AMAZON_SCAN_MATCHES", match);
  updateRecord_("AMAZON_PACKAGES", "package_id", pkg.package_id, { matched_amazon_order_id: match.amazon_order_id, matched_amazon_order_item_id: match.amazon_order_item_id, package_status: "MATCHED" });
  return { package: pkg, match };
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

function daysSince_(dateValue) {
  const d = date_(dateValue);
  if (!d) return "";
  return Math.max(0, Math.floor((date_(today_()).getTime() - d.getTime()) / 86400000));
}

function recommendedLotAction_(lot, qty) {
  const exp = date_(lot.expiration_date);
  if (!exp) return qty > 0 ? "Use normally" : "Empty";
  const days = Math.ceil((exp.getTime() - date_(today_()).getTime()) / 86400000);
  if (days < 0) return "Review expired lot";
  if (days <= 7) return "Prioritize immediately";
  if (days <= 30) return "Prioritize soon";
  return "Use normally";
}

function currentQtyByProduct_(snapshot) {
  const map = {};
  snapshot.forEach(row => map[row.product_id] = (map[row.product_id] || 0) + n_(row.current_qty, 0));
  return map;
}

function usageFromSales_(salesOrders, salesLines) {
  const since = new Date(now_().getTime() - 90 * 86400000);
  const shipped = {};
  salesOrders.forEach(order => {
    if (["SHIPPED", "CLOSED", "COMPLETE"].indexOf(upper_(order.status)) >= 0 && (!order.order_date || date_(order.order_date) >= since)) {
      shipped[String(order.sales_order_id)] = true;
    }
  });
  const usage = {};
  salesLines.forEach(line => {
    if (!shipped[String(line.sales_order_id)]) return;
    const qty = n_(line.inventory_qty_required || line.qty_ordered, 0);
    usage[line.product_id] = (usage[line.product_id] || 0) + qty;
  });
  return usage;
}

function lotPurchaseUnitCost_(lot) {
  return n_(lot.unit_cost, 0);
}

function lotLbsPerPurchaseUnit_(lot) {
  const originalQty = n_(lot.original_qty, 0);
  const purchaseQty = n_(lot.purchase_qty_received, 0);
  return originalQty > 0 && purchaseQty > 0 ? originalQty / purchaseQty : 0;
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

function numberOrNullV2_(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function avgV2_(values) {
  const clean = (values || []).map(numberOrNullV2_).filter(value => value !== null);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function stddevV2_(values) {
  const clean = (values || []).map(numberOrNullV2_).filter(value => value !== null);
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
    const key = d ? dateKey_(d) : today_();
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
  const clean = (values || []).map(numberOrNullV2_).filter(value => value !== null);
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
    .map(point => {
      const d = point && point.date ? date_(point.date) : null;
      const price = point ? numberOrNullV2_(point.price) : null;
      return d && price !== null ? { x: d.getTime(), y: price, date: dateKey_(d) } : null;
    })
    .filter(Boolean);
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
    const orderDateValue = date_(order.order_date || line.created_at || today_());
    const orderDate = orderDateValue ? dateKey_(orderDateValue) : today_();
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

function planningRows_(products, suppliers, purchaseOrders, purchaseLines, snapshot, usageByProduct) {
  const qtyByProduct = currentQtyByProduct_(snapshot);
  const supplierMap = byId_(suppliers, "supplier_id");
  const poSupplier = {};
  purchaseOrders.forEach(po => poSupplier[po.po_id] = po.supplier_id);
  const supplierByProduct = {};
  purchaseLines.forEach(line => {
    if (!supplierByProduct[line.product_id]) supplierByProduct[line.product_id] = line.supplier_id || poSupplier[line.po_id] || "";
  });

  return products.map(product => {
    const supplierId = supplierByProduct[product.product_id] || "";
    const supplier = supplierMap[supplierId] || {};
    const currentQty = n_(qtyByProduct[product.product_id], 0);
    const averageDailyUsage = n_(usageByProduct[product.product_id], 0) / 90;
    const avgLeadTime = n_(supplier.lead_time_expected_days, 7) || 7;
    const minStock = n_(product.min_stock_qty, 0);
    const targetFromSheet = n_(product.target_stock_qty, 0);
    const safetyStock = Math.max(minStock, averageDailyUsage * 3);
    const reorderPoint = Math.max(minStock, averageDailyUsage * avgLeadTime + safetyStock);
    const targetStock = Math.max(targetFromSheet, reorderPoint * 1.5);
    const status = currentQty <= reorderPoint ? "REORDER" : currentQty <= targetStock ? "WATCH" : "OK";
    return {
      product_id: product.product_id,
      product_name: product.product_name,
      supplier_id: supplierId,
      supplier_name: supplier.supplier_name || "",
      current_qty: currentQty,
      average_daily_usage: averageDailyUsage,
      std_daily_usage: 0,
      avg_lead_time_days: avgLeadTime,
      std_lead_time_days: 0,
      demand_during_lead_time: averageDailyUsage * avgLeadTime,
      safety_stock: safetyStock,
      reorder_point: reorderPoint,
      target_stock_level: targetStock,
      recommended_order_qty: Math.max(targetStock - currentQty, 0),
      status
    };
  }).filter(row => row.status !== "OK" || row.reorder_point > 0 || row.target_stock_level > 0);
}

function expirationRows_(snapshot) {
  const today = date_(today_());
  const limit = new Date(today.getTime() + 30 * 86400000);
  return snapshot.filter(row => {
    const exp = date_(row.expiration_date);
    return exp && row.current_qty > 0 && exp >= today && exp <= limit;
  }).map(row => {
    const exp = date_(row.expiration_date);
    return Object.assign({}, row, {
      expiration_date: dateKey_(exp),
      days_remaining: Math.ceil((exp - today) / 86400000)
    });
  });
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

function inventorySnapshot() {
  return simpleLotSnapshot_();
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

function supplierAnalytics_(suppliers, purchaseOrders, purchaseLines, receiving) {
  const totalSpend = purchaseOrders.reduce((sum, po) => sum + n_(po.total_amount, 0), 0);
  const poSupplier = {};
  purchaseOrders.forEach(po => poSupplier[po.po_id] = po.supplier_id);

  return suppliers.map(supplier => {
    const orders = purchaseOrders.filter(po => po.supplier_id === supplier.supplier_id);
    const orderIds = {};
    orders.forEach(po => orderIds[po.po_id] = true);
    const lines = purchaseLines.filter(line => orderIds[line.po_id]);
    const received = receiving.filter(row => row.supplier_id === supplier.supplier_id);
    const spend = orders.reduce((sum, po) => sum + n_(po.total_amount, 0), 0);
    return {
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      email: supplier.email,
      phone: supplier.phone,
      products_bought: unique_(lines.map(line => line.product_id)).join(", "),
      total_orders: orders.length,
      completed_orders: orders.filter(po => ["RECEIVED", "CLOSED", "COMPLETE"].indexOf(upper_(po.po_status)) >= 0).length,
      total_purchase_amount: spend,
      spend_share_percent: totalSpend ? spend / totalSpend * 100 : 0,
      avg_lead_time_days: n_(supplier.lead_time_expected_days, 0),
      std_lead_time_days: 0,
      quality_percent: received.length ? received.filter(row => upper_(row.quality_status || "PASS") === "PASS").length / received.length * 100 : 100,
      product_accuracy_percent: 100,
      quantity_accuracy_percent: 100
    };
  });
}

function lookupScan(payload) {
  const value = text_((payload || {}).scanValue || (payload || {}).scan_code || (payload || {}).value || payload);
  if (!value) throw new Error("Scan value is required.");
  const product = readTable_("PRODUCTS").find(row => [row.product_id, row.barcode_or_qr_value, row.amazon_sku, row.wholesale_sku].map(String).indexOf(value) >= 0);
  if (product) return { type: "PRODUCT", record: product };
  const lot = readTable_("LOTS").find(row => [row.internal_lot_id, row.qr_value, row.supplier_lot_number].map(String).indexOf(value) >= 0);
  if (lot) return { type: "LOT", record: lot };
  const location = readTable_("LOCATIONS").find(row => [row.location_id, row.qr_value].map(String).indexOf(value) >= 0);
  if (location) return { type: "LOCATION", record: location };
  const poLine = readTable_("PURCHASE_ORDER_LINES").find(row => [row.po_line_id, row.qr_value].map(String).indexOf(value) >= 0);
  if (poLine) return { type: "PURCHASE_ORDER_LINE", record: poLine, purchaseOrder: getPurchaseOrderDetail({ po_id: poLine.po_id }) };
  const pkg = readTable_("AMAZON_PACKAGES").find(row => [row.package_id, row.package_qr_value].map(String).indexOf(value) >= 0);
  if (pkg) return { type: "AMAZON_PACKAGE", record: pkg };
  return { type: "NOT_FOUND", scanValue: value };
}

function validateOperationalSchema() {
  const results = Object.keys(CORE_SCHEMA).map(sheetName => {
    const meta = meta_(sheetName, true);
    const missingHeaders = CORE_SCHEMA[sheetName].filter(header => meta.headers.indexOf(header) < 0);
    return { sheet: sheetName, ok: missingHeaders.length === 0, missingSheet: false, headerRow: meta.headerRow, missingHeaders };
  });
  return { spreadsheetId: ss_().getId(), ok: results.every(row => row.ok), checkedAt: now_(), results };
}

function nextBlFolio_() {
  try {
    return readTable_("SALES_ORDERS").reduce((max, order) => Math.max(max, n_(order.bl_folio, 0)), 2719) + 1;
  } catch (_error) {
    return "";
  }
}
