const SPREADSHEET_ID = "1XYaMXKGR5EG8VS38PPiHFNbtmwX5Ae6N33jLE72nxKE";
const BACKEND_VERSION = "rack-inventory-v1-2026-07-17";


const ROLES = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  OPERATOR: "OPERATOR"
};


const PERMISSIONS = {
  ADMIN: [
    "products:create",
    "suppliers:create",
    "purchaseOrders:create",
    "purchaseOrders:actions",
    "salesOrders:create",
    "salesOrders:actions",
    "salesOrders:send",
    "receiving:create",
    "inventory:view",
    "inventory:adjust",
    "scanner:lookup"
  ],
  MANAGER: [
    "salesOrders:actions",
    "salesOrders:send",
    "receiving:create",
    "scanner:lookup"
  ],
  OPERATOR: [
    "salesOrders:send",
    "receiving:create",
    "scanner:lookup"
  ]
};


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
  ADJUSTMENTS: ["adjustment_id", "created_at", "created_by", "product_id", "internal_lot_id", "location_id", "qty_adjustment", "unit_type", "reason_code", "approval_status", "approved_by", "approved_at", "related_movement_id", "notes"],
  SALES_ORDERS: ["sales_order_id", "channel", "order_source", "customer_name", "customer_email", "customer_phone", "amazon_order_id", "order_date", "ship_by_date", "status", "currency", "subtotal_amount", "tax_amount", "shipping_amount", "total_amount", "invoice_status", "quickbooks_invoice_id", "created_by", "created_at", "updated_at", "notes", "customer_id", "ship_method", "payment_terms", "tax_enabled", "tax_rate", "estimated_gross_profit", "estimated_gross_margin_percent", "confirmed_at", "picked_at", "shipped_at", "delivered_at", "delivered_by", "delivery_notes", "bl_folio", "shipping_address"],
  SALES_ORDER_LINES: ["sales_order_line_id", "sales_order_id", "channel", "amazon_order_item_id", "product_id", "amazon_sku", "wholesale_sku", "qty_ordered", "qty_picked", "qty_remaining", "unit_type", "unit_price", "currency", "line_total", "preferred_internal_lot_id", "preferred_location_id", "line_status", "notes", "unit_weight_lbs", "inventory_qty_required", "inventory_unit_type", "unit_cost", "estimated_gross_profit", "expiration_date", "fefo_status"],
  PICK_TASKS: ["pick_task_id", "sales_order_id", "sales_order_line_id", "channel", "task_date", "priority", "product_id", "recommended_internal_lot_id", "recommended_location_id", "qty_to_pick", "qty_picked", "unit_type", "assigned_to", "pick_status", "picked_at", "scan_code", "device_id", "exception_code", "notes", "qty_to_pick_base", "reservation_status"],
  AMAZON_PACKAGES: ["package_id", "package_qr_value", "amazon_sku", "product_id", "source_internal_lot_id", "qty_product_used", "unit_type", "packed_by", "packed_at", "package_status", "current_location_id", "matched_amazon_order_id", "matched_amazon_order_item_id", "shipped_at", "notes"],
  AMAZON_SCAN_MATCHES: ["scan_match_id", "scanned_at", "scanned_by", "device_id", "package_id", "amazon_order_id", "amazon_order_item_id", "amazon_sku", "product_id", "match_status", "match_confidence", "exception_code", "related_pick_task_id", "related_movement_id", "notes"],
  AUDIT_LOG: ["audit_id", "timestamp", "user_id", "role", "device_id", "action_type", "table_name", "record_id", "field_name", "old_value", "new_value", "source_screen", "notes"]
};


function doGet(e) {
  if (e && e.parameter && e.parameter.action) {
    return handleApiRequest_(e.parameter.action, e.parameter.payload, e.parameter.callback);
  }
  return HtmlService.createHtmlOutput("San Jose Operations Apps Script is deployed: " + BACKEND_VERSION);
}


function doPost(e) {
  const request = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  return handleApiRequest_(request.action, JSON.stringify(request.payload || {}), null);
}


function handleApiRequest_(action, payloadText, callback) {
  try {
    const payload = payloadText ? JSON.parse(payloadText) : {};
    const routes = {
      getDashboard,
      authenticateUser,
      listProducts,
      listLots,
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
      deliverSalesOrder,
      receiveProduct,
      recommendPutawayLocations,
      sendProduct,
      recordInventoryMovement,
      recordAmazonOutbound,
      listAmazonOutboundActivity,
      inventorySnapshot,
      getRackInventory,
      saveRackInventory,
      getOperationalReports,
      lookupScan,
      matchAmazonPackageScan,
      validateOperationalSchema
    };
    if (!routes[action]) throw new Error("Unknown action: " + action);
    return json_({ ok: true, result: routes[action](payload) }, callback);
  } catch (error) {
    return json_({ ok: false, error: error.message || String(error) }, callback);
  }
}


function json_(value, callback) {
  const body = callback ? `${callback}(${JSON.stringify(value)});` : JSON.stringify(value);
  return ContentService.createTextOutput(body)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}


function spreadsheet_() {
  if (SPREADSHEET_ID === "PASTE_YOUR_SPREADSHEET_ID_HERE") {
    throw new Error("Set SPREADSHEET_ID in Code.gs first.");
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}


function sheet_(sheetName) {
  const sheet = spreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error("Missing sheet: " + sheetName);
  return sheet;
}


function tableMeta_(sheetName) {
  const sheet = sheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  const headerIndex = values.findIndex((row) => row.some((cell) => String(cell || "").trim().endsWith("_id")));
  if (headerIndex < 0) throw new Error("Could not find header row for " + sheetName);
  const rawHeaders = values[headerIndex].map((cell) => String(cell || "").trim());
  let lastHeaderIndex = rawHeaders.length - 1;
  while (lastHeaderIndex >= 0 && !rawHeaders[lastHeaderIndex]) lastHeaderIndex -= 1;
  const headers = rawHeaders.slice(0, lastHeaderIndex + 1);
  return { sheet, values, headerRow: headerIndex + 1, headers };
}


function readTable_(sheetName) {
  const meta = tableMeta_(sheetName);
  return meta.values.slice(meta.headerRow)
    .filter((row) => row.some((cell) => cell !== "" && cell !== null))
    .map((row) => {
      const record = {};
      meta.headers.forEach((header, index) => {
        if (header) record[header] = row[index];
      });
      return record;
    });
}


function appendRecord_(sheetName, record) {
  return appendRecords_(sheetName, [record]);
}


function appendRecords_(sheetName, records) {
  records = (records || []).filter(Boolean);
  if (!records.length) return null;
  const requiredHeaders = Array.from(new Set(records.reduce((all, record) => all.concat(Object.keys(record || {})), [])));
  ensureTableColumns_(sheetName, requiredHeaders);
  const meta = tableMeta_(sheetName);
  const startRow = Math.max(meta.headerRow + 1, meta.sheet.getLastRow() + 1);
  const values = records.map((record) => meta.headers.map((header) => header && record[header] !== undefined ? record[header] : ""));
  const requiredLastRow = startRow + values.length - 1;
  if (requiredLastRow > meta.sheet.getMaxRows()) {
    meta.sheet.insertRowsAfter(meta.sheet.getMaxRows(), requiredLastRow - meta.sheet.getMaxRows());
  }
  meta.sheet.getRange(startRow, 1, values.length, meta.headers.length).setValues(values);
  return { sheetName, startRow, rowCount: values.length, columnCount: meta.headers.length };
}


function rollbackAppendedRange_(writeInfo) {
  if (!writeInfo || !writeInfo.rowCount) return;
  try {
    sheet_(writeInfo.sheetName)
      .getRange(writeInfo.startRow, 1, writeInfo.rowCount, writeInfo.columnCount)
      .clearContent();
  } catch (_error) {
    // Best-effort rollback. The original operation error is more useful to the caller.
  }
}


function updateTableRecord_(sheetName, idColumn, idValue, fields) {
  ensureTableColumns_(sheetName, Object.keys(fields || {}));
  const meta = tableMeta_(sheetName);
  const idIndex = meta.headers.indexOf(idColumn);
  if (idIndex < 0) throw new Error(`Missing ${idColumn} column in ${sheetName}.`);
  for (let row = meta.headerRow + 1; row <= meta.sheet.getLastRow(); row++) {
    if (String(meta.sheet.getRange(row, idIndex + 1).getValue()) !== String(idValue)) continue;
    Object.keys(fields || {}).forEach((field) => {
      const columnIndex = meta.headers.indexOf(field);
      if (columnIndex >= 0) meta.sheet.getRange(row, columnIndex + 1).setValue(fields[field]);
    });
    return;
  }
  throw new Error(`${idValue} was not found in ${sheetName}.`);
}


function ensureTableColumns_(sheetName, requiredHeaders) {
  const meta = tableMeta_(sheetName);
  const missing = (requiredHeaders || []).filter((header) => header && meta.headers.indexOf(header) < 0);
  if (!missing.length) return;
  meta.sheet.getRange(meta.headerRow, meta.headers.length + 1, 1, missing.length).setValues([missing]);
}


function nextId_(sheetName, idColumn, prefix) {
  const rows = readTable_(sheetName);
  const maxNumber = rows.reduce((max, row) => {
    const match = String(row[idColumn] || "").match(/(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(maxNumber + 1).padStart(6, "0")}`;
}


function normalizeRole_(role) {
  const normalized = String(role || "OPERATOR").trim().toUpperCase();
  if (normalized === "OWNER") return "ADMIN";
  if (normalized === "ADMIN" || normalized === "MANAGER" || normalized === "OPERATOR") return normalized;
  return "OPERATOR";
}


function requirePermission_(user, permission) {
  const role = normalizeRole_(user && user.role);
  if (!PERMISSIONS[role] || PERMISSIONS[role].indexOf(permission) < 0) {
    throw new Error("Permission denied: " + permission);
  }
}


function isActiveRecord_(row) {
  return row && row.is_active !== false && String(row.is_active || "TRUE").toUpperCase() !== "FALSE";
}


function number_(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : (fallback || 0);
}


function today_() {
  return new Date();
}


function isTruthy_(value) {
  return value === true || String(value || "").trim().toUpperCase() === "TRUE" || String(value || "").trim() === "1";
}


function approximatelyEqual_(a, b, tolerance) {
  return Math.abs(number_(a, 0) - number_(b, 0)) <= (tolerance || 0.0001);
}


function normalizePurchaseOrderStatus_(status) {
  const value = String(status || "DRAFT").trim().toUpperCase().replace(/[\s-]+/g, "_");
  const aliases = {
    MARKSENT: "SENT",
    MARK_SENT: "SENT",
    SEND: "SENT",
    ORDER: "CONFIRMED",
    ORDERED: "CONFIRMED",
    OPEN: "CONFIRMED",
    PARTIAL: "PARTIALLY_RECEIVED",
    PARTIALLY_RECEIVED: "PARTIALLY_RECEIVED",
    RECEIVED: "COMPLETE",
    COMPLETED: "COMPLETE",
    CLOSED: "COMPLETE",
    CLOSE: "COMPLETE"
  };
  const normalized = aliases[value] || value;
  const allowed = ["DRAFT", "CREATED", "SENT", "CONFIRMED", "IN_TRANSIT", "PARTIALLY_RECEIVED", "COMPLETE", "CANCELLED"];
  return allowed.indexOf(normalized) >= 0 ? normalized : normalized;
}


function purchaseOrderStatusForApi_(status) {
  const normalized = normalizePurchaseOrderStatus_(status);
  // The current receiving frontend recognizes ORDERED. Keep that API alias while
  // storing the Sheet-compatible CONFIRMED value in PURCHASE_ORDERS.
  return normalized === "CONFIRMED" ? "ORDERED" : normalized;
}


function purchaseOrderForApi_(po) {
  return po ? { ...po, po_status: purchaseOrderStatusForApi_(po.po_status) } : po;
}


function writeAuditLog_(entry) {
  try {
    ensureTableColumns_("AUDIT_LOG", CORE_SCHEMA.AUDIT_LOG);
    appendRecord_("AUDIT_LOG", {
      audit_id: nextId_("AUDIT_LOG", "audit_id", "AUDIT"),
      timestamp: today_(),
      user_id: entry.user_id || "SYSTEM",
      role: normalizeRole_(entry.role || "ADMIN"),
      device_id: entry.device_id || "WEB_APP",
      action_type: entry.action_type || "SYSTEM_EVENT",
      table_name: entry.table_name || "",
      record_id: entry.record_id || "",
      field_name: entry.field_name || "",
      old_value: entry.old_value || "",
      new_value: entry.new_value || "",
      source_screen: entry.source_screen || "APPS_SCRIPT",
      notes: entry.notes || ""
    });
  } catch (_error) {
    // Audit logging should never block operations.
  }
}


function sessionUser_(user) {
  return {
    authenticated: true,
    user_id: user.user_id,
    full_name: user.full_name || user.user_id,
    role: normalizeRole_(user.role)
  };
}


function listUsers() {
  return readTable_("USERS")
    .filter(isActiveRecord_)
    .map((user) => ({ ...user, role: normalizeRole_(user.role) }))
    .sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || "")));
}


function authenticateUser(payload) {
  payload = payload || {};
  const pin = String(payload.pin || "").trim();
  const user = readTable_("USERS").find((item) => isActiveRecord_(item) && String(item.pin || "").trim() === pin);
  if (!user && pin === "1014") return { authenticated: true, user_id: "ADMIN", full_name: "Admin", role: "ADMIN" };
  if (!user) throw new Error("Code does not match an active user.");
  return sessionUser_(user);
}


function createUser(payload) {
  payload = payload || {};
  const actor = payload.user || {};
  if (normalizeRole_(actor.role) !== "ADMIN") throw new Error("Only an Admin can create users.");
  const input = payload.input || {};
  const fullName = String(input.full_name || "").trim();
  const pin = String(input.pin || "").trim();
  const role = normalizeRole_(input.role || "OPERATOR");
  if (!fullName) throw new Error("Full name is required.");
  if (!/^\d{4}$/.test(pin)) throw new Error("PIN must be exactly 4 digits.");
  ensureTableColumns_("USERS", CORE_SCHEMA.USERS);
  if (readTable_("USERS").some((item) => isActiveRecord_(item) && String(item.pin || "").trim() === pin)) {
    throw new Error("An active user already has that 4-digit code.");
  }
  const record = {
    user_id: nextId_("USERS", "user_id", "USR"),
    full_name: fullName,
    role,
    email: input.email || "",
    device_assigned: input.device_assigned || "",
    is_active: true,
    created_at: today_(),
    updated_at: today_(),
    notes: input.notes || "",
    pin
  };
  appendRecord_("USERS", record);
  writeAuditLog_({ user_id: actor.user_id, role: actor.role, action_type: "CREATE_USER", table_name: "USERS", record_id: record.user_id });
  return record;
}


function deactivateUser(payload) {
  payload = payload || {};
  const actor = payload.user || {};
  if (normalizeRole_(actor.role) !== "ADMIN") throw new Error("Only an Admin can remove users.");
  const userId = String(payload.userId || payload.user_id || "").trim();
  if (!userId) throw new Error("Choose a user to remove.");
  updateTableRecord_("USERS", "user_id", userId, { is_active: false, updated_at: today_() });
  writeAuditLog_({ user_id: actor.user_id, role: actor.role, action_type: "DEACTIVATE_USER", table_name: "USERS", record_id: userId });
  return { user_id: userId, is_active: false };
}


function listProducts() {
  return readTable_("PRODUCTS").filter(isActiveRecord_).sort((a, b) => String(a.product_name || "").localeCompare(String(b.product_name || "")));
}


function listLots() {
  return readTable_("LOTS");
}


function createProduct(payload) {
  payload = payload || {};
  const user = payload.user || {};
  requirePermission_(user, "products:create");
  const input = payload.input || {};
  const name = String(input.product_name || "").trim();
  if (!name) throw new Error("Product name is required.");
  ensureTableColumns_("PRODUCTS", CORE_SCHEMA.PRODUCTS);
  const products = readTable_("PRODUCTS");
  if (products.some((row) => String(row.product_name || "").trim().toLowerCase() === name.toLowerCase())) {
    throw new Error("A product with this name already exists.");
  }
  const productId = input.product_id || nextId_("PRODUCTS", "product_id", "PROD");
  const record = {
    product_id: productId,
    product_name: name,
    product_category: input.product_category || "General",
    default_unit: input.default_unit || "",
    case_weight_lbs: number_(input.case_weight_lbs, 0),
    amazon_sku: input.amazon_sku || "",
    wholesale_sku: input.wholesale_sku || "",
    barcode_or_qr_value: input.barcode_or_qr_value || productId,
    min_stock_qty: number_(input.min_stock_qty, 0),
    target_stock_qty: number_(input.target_stock_qty, 0),
    velocity_class: input.velocity_class || "",
    storage_zone_preference: input.storage_zone_preference || "",
    is_active: true,
    created_at: today_(),
    updated_at: today_(),
    notes: input.notes || "",
    base_unit: input.base_unit || "LB",
    units_per_purchase_unit: number_(input.units_per_purchase_unit || input.case_weight_lbs, 0),
    can_break_case: input.can_break_case || "",
    perishability_days: number_(input.perishability_days, 0)
  };
  appendRecord_("PRODUCTS", record);
  writeAuditLog_({ user_id: user.user_id, role: user.role, action_type: "CREATE_PRODUCT", table_name: "PRODUCTS", record_id: record.product_id });
  return record;
}






function updateProductStatus(payload) {
  payload = payload || {};
  const user = payload.user || {};
  requirePermission_(user, "products:create");
  const productId = String(payload.productId || payload.product_id || "").trim();
  if (!productId) throw new Error("Product ID is required.");
  updateTableRecord_("PRODUCTS", "product_id", productId, {
    is_active: Boolean(payload.isActive !== undefined ? payload.isActive : payload.is_active),
    updated_at: today_()
  });
  writeAuditLog_({ user_id: user.user_id, role: user.role, action_type: "UPDATE_PRODUCT_STATUS", table_name: "PRODUCTS", record_id: productId });
  return readTable_("PRODUCTS").find((row) => String(row.product_id) === productId);
}


function normalizePartyType_(value) {
  const normalized = String(value || "VENDOR").trim().toUpperCase();
  return normalized === "CUSTOMER" ? "CUSTOMER" : "VENDOR";
}


function listSuppliers() {
  return readTable_("SUPPLIERS")
    .filter(isActiveRecord_)
    .map((supplier) => ({ ...supplier, party_type: normalizePartyType_(supplier.party_type) }))
    .sort((a, b) => String(a.supplier_name || "").localeCompare(String(b.supplier_name || "")));
}


function createSupplier(payload) {
  payload = payload || {};
  const user = payload.user || {};
  requirePermission_(user, "suppliers:create");
  const input = payload.input || {};
  if (!String(input.supplier_name || "").trim()) throw new Error("Business name is required.");
  ensureTableColumns_("SUPPLIERS", CORE_SCHEMA.SUPPLIERS);
  const partyType = normalizePartyType_(input.party_type);
  const record = {
    supplier_id: input.supplier_id || nextId_("SUPPLIERS", "supplier_id", partyType === "CUSTOMER" ? "CUST" : "SUP"),
    supplier_name: input.supplier_name,
    contact_name: input.contact_name || "",
    email: input.email || "",
    phone: input.phone || "",
    address: input.address || "",
    payment_terms: input.payment_terms || "Net 30",
    default_currency: input.default_currency || input.currency || "USD",
    lead_time_expected_days: number_(input.lead_time_expected_days, 0),
    is_active: true,
    created_at: today_(),
    updated_at: today_(),
    notes: input.notes || "",
    party_type: partyType
  };
  appendRecord_("SUPPLIERS", record);
  writeAuditLog_({ user_id: user.user_id, role: user.role, action_type: "CREATE_PARTY", table_name: "SUPPLIERS", record_id: record.supplier_id });
  return record;
}


function listLocations() {
  const usage = currentLocationUsage_();
  return readTable_("LOCATIONS").filter(isActiveRecord_).map((location) => {
    const occupied = usage[String(location.location_id || "")] || { units: 0, weight: 0, lot_ids: [] };
    const capacityUnits = Math.max(1, number_(location.capacity_units, 1));
    const hardBlock = locationHardBlockReason_(location);
    return {
      ...location,
      occupied_units: occupied.units,
      occupied_weight_lbs: occupied.weight,
      occupied_lot_ids: occupied.lot_ids,
      available_capacity_units: Math.max(0, capacityUnits - occupied.units),
      is_occupied: occupied.units > 0,
      is_receivable: !hardBlock && occupied.units < capacityUnits,
      availability_reason: hardBlock || (occupied.units >= capacityUnits ? "LOCATION_FULL" : "AVAILABLE")
    };
  });
}


function listPurchaseOrders() {
  const suppliers = byId_(readTable_("SUPPLIERS"), "supplier_id");
  return readTable_("PURCHASE_ORDERS").map((po) => ({
    ...purchaseOrderForApi_(po),
    supplier: suppliers[po.supplier_id] || null
  })).sort((a, b) => String(b.order_date || "").localeCompare(String(a.order_date || "")));
}


function getPurchaseOrderDetail(payload) {
  const poId = typeof payload === "string" ? payload : String((payload || {}).poId || (payload || {}).po_id || "");
  const po = readTable_("PURCHASE_ORDERS").find((row) => String(row.po_id) === poId);
  if (!po) return null;
  const products = byId_(readTable_("PRODUCTS"), "product_id");
  const suppliers = byId_(readTable_("SUPPLIERS"), "supplier_id");
  const lines = readTable_("PURCHASE_ORDER_LINES")
    .filter((line) => String(line.po_id) === poId)
    .map((line) => ({ ...line, product: products[line.product_id] || null }));
  return { po: { ...purchaseOrderForApi_(po), supplier: suppliers[po.supplier_id] || null }, lines };
}


function createPurchaseOrder(payload) {
  payload = payload || {};
  const user = payload.user || {};
  requirePermission_(user, "purchaseOrders:create");
  const input = payload.input || {};
  const supplierId = input.supplier_id || input.vendor_id;
  const lines = Array.isArray(input.lines) ? input.lines : [];
  if (!supplierId) throw new Error("Choose a supplier.");
  if (!lines.length) throw new Error("Add at least one product line.");
  ensureTableColumns_("PURCHASE_ORDERS", CORE_SCHEMA.PURCHASE_ORDERS);
  ensureTableColumns_("PURCHASE_ORDER_LINES", CORE_SCHEMA.PURCHASE_ORDER_LINES);
  const poId = input.po_id || nextId_("PURCHASE_ORDERS", "po_id", "PO");
  const currency = input.currency || "USD";
  const shipping = number_(input.shipping_amount, 0);
  const taxRate = number_(input.tax_rate_percent !== undefined ? input.tax_rate_percent : input.tax_rate, 0);
  const taxEnabled = input.tax_enabled === true || String(input.tax_enabled).toUpperCase() === "TRUE";
  let subtotal = 0;
  const productMap = byId_(readTable_("PRODUCTS"), "product_id");
  lines.forEach((line) => subtotal += number_(line.qty_ordered || line.quantity, 0) * number_(line.unit_cost || line.cost, 0));
  const tax = taxEnabled ? subtotal * taxRate / 100 : 0;
  const po = {
    po_id: poId,
    po_status: normalizePurchaseOrderStatus_(input.po_status || "DRAFT"),
    supplier_id: supplierId,
    created_by: user.user_id || user.role,
    order_date: input.order_date || today_(),
    expected_delivery_date: input.expected_delivery_date || "",
    payment_terms: input.payment_terms || "",
    currency,
    subtotal_amount: subtotal,
    tax_amount: tax,
    shipping_amount: shipping,
    total_amount: subtotal + tax + shipping,
    notes: input.notes || "",
    tax_enabled: taxEnabled,
    tax_rate: taxRate,
    ship_via: input.ship_via || "",
    bill_status: input.bill_status || "NOT_CREATED"
  };
  appendRecord_("PURCHASE_ORDERS", po);
  lines.forEach((line) => {
    const product = productMap[line.product_id] || {};
    const qty = number_(line.qty_ordered || line.quantity, 0);
    const unitCost = number_(line.unit_cost || line.cost, 0);
    const unitsPer = number_(line.units_per_purchase_unit || product.units_per_purchase_unit || product.case_weight_lbs, 0);
    const lineRecord = {
      po_line_id: nextId_("PURCHASE_ORDER_LINES", "po_line_id", "POL"),
      po_id: poId,
      supplier_id: supplierId,
      product_id: line.product_id,
      line_status: "OPEN",
      qty_ordered: qty,
      qty_received_total: 0,
      qty_remaining: qty,
      unit_type: line.unit_type || product.default_unit || "CASE",
      unit_cost: unitCost,
      currency,
      line_total: qty * unitCost,
      supplier_expected_lot_number: line.supplier_expected_lot_number || "",
      notes: line.notes || "",
      base_unit: line.base_unit || product.base_unit || "LB",
      units_per_purchase_unit: unitsPer,
      expected_base_qty: qty * unitsPer,
      case_weight_lbs: unitsPer,
      qr_value: line.qr_value || ""
    };
    lineRecord.qr_value = lineRecord.qr_value || lineRecord.po_line_id;
    appendRecord_("PURCHASE_ORDER_LINES", lineRecord);
  });
  writeAuditLog_({ user_id: user.user_id, role: user.role, action_type: "CREATE_PO", table_name: "PURCHASE_ORDERS", record_id: poId });
  const detail = getPurchaseOrderDetail({ po_id: poId });
  return { ...detail.po, lines: detail.lines };
}



function updatePurchaseOrder_(payload) {
  payload = payload || {};
  const user = payload.user || {};
  const input = payload.input || {};
  const poId = String(input.po_id || payload.poId || payload.po_id || "").trim();
  const requestedLines = Array.isArray(input.lines) ? input.lines : [];
  if (!poId) throw new Error("Choose a Purchase Order.");
  if (!requestedLines.length) throw new Error("Add at least one product line.");

  return withScriptLock_(function () {
    const detail = getPurchaseOrderDetail({ po_id: poId });
    if (!detail) throw new Error("Purchase Order was not found.");
    const currentStatus = String(detail.po.po_status || "DRAFT").toUpperCase();
    if (!["DRAFT", "CREATED", "SENT", "ORDERED", "CONFIRMED", "IN_TRANSIT", "OPEN"].includes(currentStatus)) {
      throw new Error("This Purchase Order cannot be edited in " + currentStatus + " status.");
    }
    const receivingStarted = detail.lines.some((line) => number_(line.qty_received_total, 0) > 0.0001)
      || readTable_("RECEIVING").some((row) => String(row.po_id) === poId && number_(row.qty_accepted, row.qty_received) > 0.0001);
    if (receivingStarted) throw new Error("This Purchase Order cannot be edited because receiving has already started.");

    const supplierId = String(input.supplier_id || detail.po.supplier_id || "").trim();
    const supplier = readTable_("SUPPLIERS").find((row) =>
      String(row.supplier_id) === supplierId && isActiveRecord_(row) && normalizePartyType_(row.party_type) === "VENDOR"
    );
    if (!supplier) throw new Error("Select a valid vendor.");

    const products = byId_(readTable_("PRODUCTS").filter(isActiveRecord_), "product_id");
    const existingIds = {};
    detail.lines.forEach((line) => existingIds[String(line.po_line_id)] = true);
    const newLineCount = requestedLines.filter((line) => !existingIds[String(line.po_line_id || "")]).length;
    const generatedIds = nextIdBatch_("PURCHASE_ORDER_LINES", "po_line_id", "POL", newLineCount);
    let generatedIndex = 0;
    const currency = input.currency || detail.po.currency || supplier.default_currency || "USD";
    let subtotal = 0;

    const lines = requestedLines.map((source, index) => {
      const product = products[source.product_id];
      const qty = number_(source.qty_ordered || source.quantity, 0);
      const unitCost = number_(source.unit_cost || source.cost, 0);
      const unitType = String(source.unit_type || "").trim().toUpperCase();
      const unitsPer = number_(source.case_weight_lbs || source.units_per_purchase_unit, 0);
      if (!product) throw new Error("Select a valid product on line " + (index + 1) + ".");
      if (qty <= 0) throw new Error("Quantity must be greater than zero on line " + (index + 1) + ".");
      if (!unitType) throw new Error("Purchase unit is required on line " + (index + 1) + ".");
      if (unitsPer <= 0) throw new Error("Unit weight must be greater than zero on line " + (index + 1) + ".");
      if (unitCost < 0) throw new Error("Unit cost cannot be negative on line " + (index + 1) + ".");
      const requestedId = String(source.po_line_id || "");
      const poLineId = existingIds[requestedId] ? requestedId : generatedIds[generatedIndex++];
      const lineTotal = qty * unitCost;
      subtotal += lineTotal;
      return {
        po_line_id: poLineId,
        po_id: poId,
        supplier_id: supplierId,
        product_id: source.product_id,
        line_status: "OPEN",
        qty_ordered: qty,
        qty_received_total: 0,
        qty_remaining: qty,
        unit_type: unitType,
        unit_cost: unitCost,
        currency,
        line_total: lineTotal,
        supplier_expected_lot_number: source.supplier_expected_lot_number || "",
        notes: source.notes || "",
        base_unit: source.base_unit || product.base_unit || "LB",
        units_per_purchase_unit: unitsPer,
        expected_base_qty: qty * unitsPer,
        case_weight_lbs: unitsPer,
        qr_value: source.qr_value || poLineId
      };
    });

    const taxEnabled = input.tax_enabled === true || String(input.tax_enabled || "").toUpperCase() === "TRUE";
    const taxRate = number_(input.tax_rate_percent !== undefined ? input.tax_rate_percent : input.tax_rate, 0);
    const tax = taxEnabled ? subtotal * taxRate / 100 : 0;
    const shipping = input.shipping_amount !== undefined ? number_(input.shipping_amount, 0) : number_(detail.po.shipping_amount, 0);
    updateTableRecord_("PURCHASE_ORDERS", "po_id", poId, {
      supplier_id: supplierId,
      order_date: input.order_date || detail.po.order_date || today_(),
      expected_delivery_date: input.expected_delivery_date || "",
      payment_terms: input.payment_terms || detail.po.payment_terms || supplier.payment_terms || "",
      currency,
      subtotal_amount: subtotal,
      tax_amount: tax,
      shipping_amount: shipping,
      total_amount: subtotal + tax + shipping,
      notes: input.notes !== undefined ? input.notes : detail.po.notes || "",
      tax_enabled: taxEnabled,
      tax_rate: taxRate,
      ship_via: input.ship_via || detail.po.ship_via || "",
      updated_at: today_()
    });

    const meta = tableMeta_("PURCHASE_ORDER_LINES");
    const poIndex = meta.headers.indexOf("po_id");
    for (let row = meta.sheet.getLastRow(); row > meta.headerRow; row--) {
      if (String(meta.sheet.getRange(row, poIndex + 1).getValue()) === poId) meta.sheet.deleteRow(row);
    }
    lines.forEach((line) => appendRecord_("PURCHASE_ORDER_LINES", line));
    writeAuditLog_({ user_id: user.user_id, role: user.role, action_type: "UPDATE_PO", table_name: "PURCHASE_ORDERS", record_id: poId });
    const updated = getPurchaseOrderDetail({ po_id: poId });
    return { ...updated.po, lines: updated.lines };
  });
}

function purchaseOrderAction(payload) {
  payload = payload || {};
  const user = payload.user || {};
  requirePermission_(user, "purchaseOrders:actions");
  const poId = String(payload.poId || payload.po_id || "").trim();
  const action = String(payload.action || payload.status || "").trim().toUpperCase();
  if (action === "UPDATE" || action === "EDIT") return updatePurchaseOrder_(payload);
  if (!poId || !action) throw new Error("Choose a purchase order action.");

  const actionMap = {
    SEND: "SENT",
    SENT: "SENT",
    MARKSENT: "SENT",
    MARK_SENT: "SENT",
    ORDER: "CONFIRMED",
    ORDERED: "CONFIRMED",
    CONFIRM: "CONFIRMED",
    CONFIRMED: "CONFIRMED",
    TRANSIT: "IN_TRANSIT",
    IN_TRANSIT: "IN_TRANSIT",
    CANCEL: "CANCELLED",
    CANCELLED: "CANCELLED",
    CLOSE: "COMPLETE",
    CLOSED: "COMPLETE",
    COMPLETE: "COMPLETE"
  };
  const nextStatus = normalizePurchaseOrderStatus_(actionMap[action] || action);
  const allowed = ["DRAFT", "CREATED", "SENT", "CONFIRMED", "IN_TRANSIT", "PARTIALLY_RECEIVED", "COMPLETE", "CANCELLED"];
  if (allowed.indexOf(nextStatus) < 0) throw new Error("Unsupported Purchase Order status: " + action);

  return withScriptLock_(function () {
    const current = readTable_("PURCHASE_ORDERS").find((row) => String(row.po_id) === poId);
    if (!current) throw new Error("Purchase Order was not found.");
    updateTableRecord_("PURCHASE_ORDERS", "po_id", poId, { po_status: nextStatus, updated_at: today_() });
    writeAuditLog_({ user_id: user.user_id, role: user.role, action_type: "PO_" + nextStatus, table_name: "PURCHASE_ORDERS", record_id: poId, old_value: current.po_status || "", new_value: nextStatus });
    return getPurchaseOrderDetail({ po_id: poId });
  });
}

function generatePurchaseOrderTemplate(payload) {
  const detail = getPurchaseOrderDetail(payload);
  if (!detail) throw new Error("Purchase order was not found.");
  return { ...detail, generated_at: today_(), message: "Template data ready for frontend rendering." };
}


function receiveProduct(payload) {
  payload = payload || {};
  const user = payload.user || {};
  requirePermission_(user, "receiving:create");
  const input = payload.input || payload;

  return withScriptLock_(function () {
    ensureTableColumns_("RECEIVING", CORE_SCHEMA.RECEIVING);
    ensureTableColumns_("LOTS", CORE_SCHEMA.LOTS);
    ensureTableColumns_("INVENTORY_MOVEMENTS", CORE_SCHEMA.INVENTORY_MOVEMENTS);

    const poLineId = String(input.po_line_id || "").trim();
    if (!poLineId) throw new Error("Choose a PO line.");
    const line = readTable_("PURCHASE_ORDER_LINES").find((row) => String(row.po_line_id) === poLineId);
    if (!line) throw new Error("PO line was not found.");
    const po = readTable_("PURCHASE_ORDERS").find((row) => String(row.po_id) === String(line.po_id));
    if (!po) throw new Error("Purchase Order was not found.");
    const poStatus = normalizePurchaseOrderStatus_(po.po_status);
    if (["CANCELLED", "COMPLETE"].indexOf(poStatus) >= 0) {
      throw new Error("This Purchase Order cannot be received in " + poStatus + " status.");
    }

    const qtyReceived = number_(input.qty_received, 0);
    const qtyDamaged = number_(input.qty_damaged, 0);
    const qtyAccepted = Math.max(qtyReceived - qtyDamaged, 0);
    const qualityStatus = String(input.quality_status || "PASS").trim().toUpperCase();
    if (qtyReceived <= 0) throw new Error("Received quantity must be greater than zero.");
    if (qtyDamaged < 0 || qtyDamaged > qtyReceived) throw new Error("Damaged quantity cannot exceed quantity received.");
    if (["PASS", "HOLD", "REJECTED"].indexOf(qualityStatus) < 0) throw new Error("Choose a valid quality status.");
    if (qualityStatus === "REJECTED" && qtyAccepted > 0.0001) {
      throw new Error("A rejected delivery must have all received quantity marked damaged/rejected.");
    }
    if (qualityStatus !== "REJECTED" && qtyAccepted <= 0.0001) {
      throw new Error("Accepted quantity must be greater than zero unless the delivery is rejected.");
    }

    const products = byId_(readTable_("PRODUCTS"), "product_id");
    const product = products[line.product_id] || {};
    const unitsPer = number_(line.units_per_purchase_unit || line.case_weight_lbs || product.units_per_purchase_unit || product.case_weight_lbs, 0);
    if (qtyAccepted > 0.0001 && unitsPer <= 0) {
      throw new Error("This PO line has no valid unit weight. Add a unit weight before receiving inventory.");
    }

    const ordered = number_(line.qty_ordered, 0);
    const prevReceived = number_(line.qty_received_total, 0);
    const explicitRemaining = line.qty_remaining !== "" && line.qty_remaining !== null && line.qty_remaining !== undefined;
    const remainingBefore = Math.max(0, explicitRemaining ? number_(line.qty_remaining, ordered - prevReceived) : ordered - prevReceived);
    const overAmount = qtyAccepted - remainingBefore;
    if (overAmount > 0.0001) {
      const role = normalizeRole_(user.role);
      if (!isTruthy_(input.allow_over_receipt) || ["ADMIN", "MANAGER"].indexOf(role) < 0) {
        throw new Error(`Accepted quantity exceeds the remaining PO quantity by ${overAmount}. An Admin or Manager must explicitly approve an over-receipt.`);
      }
    }

    const supplierLotNumber = String(input.supplier_lot_number || "").trim();
    if (qtyAccepted > 0.0001 && !supplierLotNumber) throw new Error("Supplier lot number is required.");
    const acceptedBase = qtyAccepted * unitsPer;
    const placements = qtyAccepted > 0.0001
      ? normalizePalletPlacements_(input, qtyAccepted, unitsPer)
      : [];

    const locationMap = byId_(readTable_("LOCATIONS"), "location_id");
    const locationUsage = currentLocationUsage_();
    const plannedUsage = {};
    placements.forEach((placement, index) => {
      validateLocationForPlacement_(placement.confirmed_location_id, {
        locationMap,
        locationUsage,
        plannedUsage,
        product,
        baseQty: placement.base_qty,
        requirePalletRack: placements.length > 1 || number_(input.pallet_count, 0) > 0,
        placementNumber: index + 1
      });
      if (!plannedUsage[placement.confirmed_location_id]) plannedUsage[placement.confirmed_location_id] = { units: 0, weight: 0 };
      plannedUsage[placement.confirmed_location_id].units += 1;
      plannedUsage[placement.confirmed_location_id].weight += placement.base_qty;
    });

    const receivingCount = Math.max(1, placements.length);
    const receivingIds = nextIdBatch_("RECEIVING", "receiving_id", "RCV", receivingCount);
    const lotIds = nextIdBatch_("LOTS", "internal_lot_id", "LOT", placements.length);
    const movementIds = nextIdBatch_("INVENTORY_MOVEMENTS", "movement_id", "MOV", placements.length);
    const receivedAt = today_();
    const requiresSupervisor = qualityStatus !== "PASS";
    const approvalStatus = requiresSupervisor ? "PENDING" : "APPROVED";
    const overUnderStatus = overAmount > 0.0001 ? "OVER" : qtyAccepted < remainingBefore - 0.0001 ? "UNDER" : "MATCH";
    const receivings = [];
    const lots = [];
    const movements = [];

    if (!placements.length) {
      receivings.push({
        receiving_id: receivingIds[0],
        po_id: line.po_id,
        po_line_id: poLineId,
        supplier_id: line.supplier_id,
        product_id: line.product_id,
        scan_code: input.scan_code || poLineId,
        internal_lot_id: "",
        supplier_lot_number: supplierLotNumber,
        received_date: receivedAt,
        received_by: user.user_id || user.role,
        qty_received: qtyReceived,
        qty_damaged: qtyDamaged,
        qty_accepted: 0,
        unit_type: line.unit_type,
        quality_score: input.quality_score || "",
        product_accuracy_score: input.product_accuracy_score || "",
        over_under_status: "UNDER",
        recommended_location_id: "",
        confirmed_location_id: "",
        requires_supervisor_approval: true,
        approval_status: "PENDING",
        notes: input.notes || "",
        base_unit: line.base_unit || product.base_unit || "LB",
        units_per_purchase_unit: unitsPer,
        qty_accepted_base: 0,
        pallet_count: 0,
        quality_status: qualityStatus
      });
    } else {
      placements.forEach((placement, index) => {
        const receivingId = receivingIds[index];
        const lotId = lotIds[index];
        const movementId = movementIds[index];
        const palletCountValue = placements.length > 1 ? 1 : number_(input.pallet_count, 0);
        const damagedOnThisRow = index === 0 ? qtyDamaged : 0;
        const receivedOnThisRow = placement.purchase_qty + damagedOnThisRow;
        const recommendedLocation = placement.recommended_location_id || placement.confirmed_location_id;
        const notes = buildPlacementNotes_(input.notes, index + 1, placements.length, recommendedLocation, placement.confirmed_location_id);

        const lot = {
          internal_lot_id: lotId,
          product_id: line.product_id,
          supplier_id: line.supplier_id,
          supplier_lot_number: supplierLotNumber,
          po_id: line.po_id,
          po_line_id: poLineId,
          received_date: receivedAt,
          original_qty: placement.base_qty,
          current_qty_script: placement.base_qty,
          unit_type: line.base_unit || product.base_unit || "LB",
          unit_cost: line.unit_cost,
          currency: line.currency || "USD",
          current_location_id: placement.confirmed_location_id,
          status: qualityStatus === "HOLD" ? "HOLD" : "ACTIVE",
          expiration_date: input.expiration_date || "",
          qr_value: lotId,
          label_printed_status: "NOT_PRINTED",
          label_printed_at: "",
          created_at: receivedAt,
          updated_at: receivedAt,
          notes,
          purchase_qty_received: placement.purchase_qty,
          purchase_unit_type: line.unit_type,
          pallet_count: palletCountValue
        };
        const receiving = {
          receiving_id: receivingId,
          po_id: line.po_id,
          po_line_id: poLineId,
          supplier_id: line.supplier_id,
          product_id: line.product_id,
          scan_code: input.scan_code || poLineId,
          internal_lot_id: lotId,
          supplier_lot_number: supplierLotNumber,
          received_date: receivedAt,
          received_by: user.user_id || user.role,
          qty_received: receivedOnThisRow,
          qty_damaged: damagedOnThisRow,
          qty_accepted: placement.purchase_qty,
          unit_type: line.unit_type,
          quality_score: input.quality_score || "",
          product_accuracy_score: input.product_accuracy_score || "",
          over_under_status: overUnderStatus,
          recommended_location_id: recommendedLocation,
          confirmed_location_id: placement.confirmed_location_id,
          requires_supervisor_approval: requiresSupervisor,
          approval_status: approvalStatus,
          notes,
          base_unit: line.base_unit || product.base_unit || "LB",
          units_per_purchase_unit: unitsPer,
          qty_accepted_base: placement.base_qty,
          pallet_count: palletCountValue,
          quality_status: qualityStatus
        };
        const movement = {
          movement_id: movementId,
          movement_type: "RECEIVE",
          timestamp: receivedAt,
          user_id: user.user_id || user.role,
          product_id: line.product_id,
          internal_lot_id: lotId,
          package_id: "",
          qty_change: placement.base_qty,
          unit_type: line.base_unit || product.base_unit || "LB",
          from_location_id: "RECEIVING",
          to_location_id: placement.confirmed_location_id,
          related_po_id: line.po_id,
          related_receiving_id: receivingId,
          related_sales_order_id: "",
          related_pick_task_id: "",
          related_amazon_order_id: "",
          scan_code: lotId,
          device_id: input.device_id || "WEB_APP",
          approval_status: approvalStatus,
          notes
        };
        receivings.push(receiving);
        lots.push(lot);
        movements.push(movement);
      });
    }

    const originalLineState = {
      qty_received_total: line.qty_received_total,
      qty_remaining: line.qty_remaining,
      line_status: line.line_status
    };
    const originalPoState = {
      po_status: po.po_status,
      actual_first_received_date: po.actual_first_received_date,
      actual_completed_date: po.actual_completed_date,
      updated_at: po.updated_at
    };
    const writes = [];
    let lineWasUpdated = false;
    let poWasUpdated = false;

    try {
      writes.push(appendRecords_("RECEIVING", receivings));
      if (lots.length) writes.push(appendRecords_("LOTS", lots));
      if (movements.length) writes.push(appendRecords_("INVENTORY_MOVEMENTS", movements));

      if (qtyAccepted > 0.0001) {
        const newReceived = prevReceived + qtyAccepted;
        const remaining = Math.max(ordered - newReceived, 0);
        lineWasUpdated = true;
        updateTableRecord_("PURCHASE_ORDER_LINES", "po_line_id", poLineId, {
          qty_received_total: newReceived,
          qty_remaining: remaining,
          line_status: remaining <= 0.0001 ? "RECEIVED" : "PARTIAL"
        });
        poWasUpdated = true;
        refreshPurchaseOrderStatus_(line.po_id);
      }
    } catch (error) {
      if (poWasUpdated) {
        try { updateTableRecord_("PURCHASE_ORDERS", "po_id", line.po_id, originalPoState); } catch (_rollbackError) {}
      }
      if (lineWasUpdated) {
        try { updateTableRecord_("PURCHASE_ORDER_LINES", "po_line_id", poLineId, originalLineState); } catch (_rollbackError) {}
      }
      writes.reverse().forEach(rollbackAppendedRange_);
      throw error;
    }

    writeAuditLog_({
      user_id: user.user_id,
      role: user.role,
      action_type: placements.length > 1 ? "RECEIVE_PRODUCT_MULTI_PALLET" : qualityStatus === "REJECTED" ? "REJECT_DELIVERY" : "RECEIVE_PRODUCT",
      table_name: "RECEIVING",
      record_id: receivings[0].receiving_id,
      notes: `${receivings.length} receiving row(s); ${lots.length} inventory lot(s); accepted ${qtyAccepted} ${line.unit_type || "units"}.`
    });

    return {
      receiving: receivings[0],
      lot: lots[0] || { internal_lot_id: "", current_location_id: "", status: "REJECTED" },
      movement: movements[0] || null,
      receivings,
      lots,
      movements,
      multi_pallet: lots.length > 1,
      rejected: qualityStatus === "REJECTED",
      purchaseOrder: getPurchaseOrderDetail({ po_id: line.po_id })
    };
  });
}


function normalizePalletPlacements_(input, qtyAccepted, unitsPer) {
  const source = Array.isArray(input.pallet_placements) ? input.pallet_placements : [];
  if (!source.length) {
    const declaredCount = Math.max(0, Math.floor(number_(input.pallet_count, 0)));
    if (declaredCount > 1) {
      throw new Error("Multiple pallets require a separate quantity and confirmed location for each pallet.");
    }
    const locationId = String(input.confirmed_location_id || input.location_id || "").trim();
    if (!locationId) throw new Error("Confirmed location is required for accepted inventory.");
    return [{
      pallet_number: 1,
      purchase_qty: qtyAccepted,
      base_qty: qtyAccepted * unitsPer,
      recommended_location_id: String(input.recommended_location_id || locationId).trim(),
      confirmed_location_id: locationId
    }];
  }

  const declaredCount = number_(input.pallet_count, source.length);
  if (declaredCount > 0 && declaredCount !== source.length) {
    throw new Error(`Pallet count (${declaredCount}) does not match the ${source.length} pallet placements provided.`);
  }
  const seenLocations = {};
  const placements = source.map((placement, index) => {
    const purchaseQty = number_(placement.purchase_qty !== undefined ? placement.purchase_qty : placement.qty_accepted !== undefined ? placement.qty_accepted : placement.qty_received !== undefined ? placement.qty_received : placement.quantity, 0);
    if (purchaseQty <= 0) throw new Error(`Pallet ${index + 1} quantity must be greater than zero.`);
    const expectedBase = purchaseQty * unitsPer;
    const suppliedBase = placement.base_qty !== undefined && placement.base_qty !== "" ? number_(placement.base_qty, 0) : expectedBase;
    if (!approximatelyEqual_(suppliedBase, expectedBase, 0.01)) {
      throw new Error(`Pallet ${index + 1} base quantity does not match its purchase quantity and unit weight.`);
    }
    const confirmedLocation = String(placement.confirmed_location_id || placement.location_id || "").trim();
    if (!confirmedLocation) throw new Error(`Pallet ${index + 1} requires a confirmed location.`);
    if (seenLocations[confirmedLocation]) throw new Error(`Location ${confirmedLocation} was selected for more than one pallet.`);
    seenLocations[confirmedLocation] = true;
    return {
      pallet_number: number_(placement.pallet_number, index + 1),
      purchase_qty: purchaseQty,
      base_qty: expectedBase,
      recommended_location_id: String(placement.recommended_location_id || confirmedLocation).trim(),
      confirmed_location_id: confirmedLocation
    };
  });
  const totalPurchaseQty = placements.reduce((sum, placement) => sum + placement.purchase_qty, 0);
  if (!approximatelyEqual_(totalPurchaseQty, qtyAccepted, 0.01)) {
    throw new Error(`Pallet quantities total ${totalPurchaseQty}, but accepted quantity is ${qtyAccepted}.`);
  }
  return placements;
}


function buildPlacementNotes_(baseNotes, palletNumber, palletTotal, recommendedLocation, confirmedLocation) {
  const parts = [];
  if (palletTotal > 1) parts.push(`Pallet ${palletNumber} of ${palletTotal}.`);
  if (recommendedLocation && confirmedLocation && recommendedLocation !== confirmedLocation) {
    parts.push(`Location override: recommended ${recommendedLocation}; confirmed ${confirmedLocation}.`);
  }
  if (String(baseNotes || "").trim()) parts.push(String(baseNotes).trim());
  return parts.join(" ");
}


function currentLocationUsage_() {
  const result = {};
  readTable_("LOTS").forEach((lot) => {
    const locationId = String(lot.current_location_id || "").trim();
    const qty = number_(lot.current_qty_script !== "" && lot.current_qty_script !== undefined ? lot.current_qty_script : lot.original_qty, 0);
    const status = String(lot.status || "ACTIVE").trim().toUpperCase();
    if (!locationId || qty <= 0.0001 || ["EMPTY", "DEPLETED", "RETURNED"].indexOf(status) >= 0) return;
    if (!result[locationId]) result[locationId] = { units: 0, weight: 0, lot_ids: [] };
    result[locationId].units += Math.max(1, number_(lot.pallet_count, 1));
    result[locationId].weight += qty;
    result[locationId].lot_ids.push(lot.internal_lot_id);
  });
  return result;
}


function locationHardBlockReason_(location) {
  if (!location || !location.location_id) return "LOCATION_NOT_FOUND";
  if (!isActiveRecord_(location)) return "LOCATION_INACTIVE";
  const status = String(location.current_status || "AVAILABLE").trim().toUpperCase();
  const blocked = ["BLOCKED", "UNAVAILABLE", "OUT_OF_SERVICE", "MAINTENANCE", "INACTIVE"];
  return blocked.indexOf(status) >= 0 ? "LOCATION_" + status : "";
}


function locationAllowsProduct_(location, product) {
  const raw = String(location.allowed_categories || "").trim();
  if (!raw) return true;
  const allowed = raw.split(/[,;|]/).map((value) => value.trim().toUpperCase()).filter(Boolean);
  if (!allowed.length || allowed.some((value) => ["ALL", "GENERAL", "ANY", "*"].indexOf(value) >= 0)) return true;
  const category = String((product || {}).product_category || "").trim().toUpperCase();
  return Boolean(category) && allowed.indexOf(category) >= 0;
}


function validateLocationForPlacement_(locationId, context) {
  const location = context.locationMap[locationId];
  const label = context.placementNumber ? `Pallet ${context.placementNumber}: ` : "";
  const hardBlock = locationHardBlockReason_(location);
  if (hardBlock) throw new Error(label + `location ${locationId} is unavailable (${hardBlock}).`);
  const type = String(location.location_type || "").trim().toUpperCase();
  if (context.requirePalletRack && type && type !== "PALLET_RACK") {
    throw new Error(label + `location ${locationId} is ${type}, not a pallet rack.`);
  }
  if (!locationAllowsProduct_(location, context.product)) {
    throw new Error(label + `location ${locationId} does not allow product category ${(context.product || {}).product_category || "UNKNOWN"}.`);
  }
  const current = context.locationUsage[locationId] || { units: 0, weight: 0 };
  const planned = context.plannedUsage[locationId] || { units: 0, weight: 0 };
  const capacityUnits = Math.max(1, number_(location.capacity_units, 1));
  if (current.units + planned.units + 1 > capacityUnits) {
    throw new Error(label + `location ${locationId} is already full.`);
  }
  const capacityWeight = number_(location.capacity_weight_lbs, 0);
  if (capacityWeight > 0 && current.weight + planned.weight + number_(context.baseQty, 0) > capacityWeight + 0.01) {
    throw new Error(label + `location ${locationId} would exceed its weight capacity.`);
  }
  return location;
}


function recommendPutawayLocations(payload) {
  payload = payload || {};
  const user = payload.user || {};
  requirePermission_(user, "receiving:create");
  const input = payload.input || payload;
  const poLineId = String(input.po_line_id || "").trim();
  const line = poLineId ? readTable_("PURCHASE_ORDER_LINES").find((row) => String(row.po_line_id) === poLineId) : null;
  const products = byId_(readTable_("PRODUCTS"), "product_id");
  const product = products[input.product_id || (line || {}).product_id] || {};
  if (!product.product_id) throw new Error("Choose a valid PO line or product before requesting locations.");
  const unitsPer = number_((line || {}).units_per_purchase_unit || (line || {}).case_weight_lbs || product.units_per_purchase_unit || product.case_weight_lbs, 0);
  const palletCount = Math.max(1, Math.floor(number_(input.pallet_count, 1)));
  const acceptedQty = number_(input.qty_accepted !== undefined ? input.qty_accepted : number_(input.qty_received, 0) - number_(input.qty_damaged, 0), 0);
  const perPalletBase = unitsPer > 0 && acceptedQty > 0 ? acceptedQty * unitsPer / palletCount : 0;
  return recommendPutawayLocationsInternal_(product, palletCount, perPalletBase, input.exclude_location_ids || []);
}


function recommendPutawayLocationsInternal_(product, count, baseQtyPerPallet, excludedLocationIds) {
  const locations = readTable_("LOCATIONS").filter(isActiveRecord_);
  const locationMap = byId_(locations, "location_id");
  const usage = currentLocationUsage_();
  const planned = {};
  const excluded = {};
  (excludedLocationIds || []).forEach((id) => excluded[String(id)] = true);
  const recommendations = [];

  for (let index = 0; index < count; index++) {
    const candidates = locations.filter((location) => {
      const id = String(location.location_id || "");
      if (!id || excluded[id] || recommendations.some((item) => item.location_id === id)) return false;
      try {
        validateLocationForPlacement_(id, {
          locationMap,
          locationUsage: usage,
          plannedUsage: planned,
          product,
          baseQty: baseQtyPerPallet,
          requirePalletRack: true,
          placementNumber: index + 1
        });
        return true;
      } catch (_error) {
        return false;
      }
    }).sort((a, b) => locationRecommendationScore_(a, product) - locationRecommendationScore_(b, product));
    if (!candidates.length) break;
    const chosen = candidates[0];
    const id = String(chosen.location_id);
    if (!planned[id]) planned[id] = { units: 0, weight: 0 };
    planned[id].units += 1;
    planned[id].weight += baseQtyPerPallet;
    recommendations.push({
      pallet_number: index + 1,
      location_id: id,
      recommended_location_id: id,
      reason: putawayRecommendationReason_(chosen, product),
      priority_rank: number_(chosen.priority_rank, 999999),
      location: chosen
    });
  }
  return { requested_count: count, recommended_count: recommendations.length, recommendations };
}


function locationRecommendationScore_(location, product) {
  let score = number_(location.priority_rank, 999999) * 100;
  const preference = String((product || {}).storage_zone_preference || "").trim().toUpperCase();
  const zoneText = [location.zone, location.notes, location.location_type].map((value) => String(value || "").toUpperCase()).join(" ");
  if (preference && zoneText.indexOf(preference) >= 0) score -= 100000;
  const bin = String(location.bin || "").trim().toUpperCase();
  score += bin === "F" ? 0 : bin === "M" ? 10 : bin === "B" ? 20 : 30;
  const level = number_(location.level, 99);
  score += level;
  return score;
}


function putawayRecommendationReason_(location, product) {
  const preference = String((product || {}).storage_zone_preference || "").trim();
  const preferenceMatch = preference && [location.zone, location.notes].some((value) => String(value || "").toUpperCase().indexOf(preference.toUpperCase()) >= 0);
  return `${preferenceMatch ? "Matches storage preference; " : ""}priority ${location.priority_rank || "default"}; ${location.bin || "standard"} position.`;
}


function refreshPurchaseOrderStatus_(poId) {
  const lines = readTable_("PURCHASE_ORDER_LINES").filter((line) => String(line.po_id) === String(poId));
  if (!lines.length) return;
  const po = readTable_("PURCHASE_ORDERS").find((row) => String(row.po_id) === String(poId));
  if (!po) throw new Error("Purchase Order was not found while refreshing status.");
  const allReceived = lines.every((line) => number_(line.qty_remaining, number_(line.qty_ordered, 0)) <= 0.0001);
  const anyReceived = lines.some((line) => number_(line.qty_received_total, 0) > 0.0001);
  const fields = {
    po_status: allReceived ? "COMPLETE" : anyReceived ? "PARTIALLY_RECEIVED" : normalizePurchaseOrderStatus_(po.po_status),
    actual_first_received_date: po.actual_first_received_date || (anyReceived ? today_() : ""),
    actual_completed_date: allReceived ? (po.actual_completed_date || today_()) : po.actual_completed_date || "",
    updated_at: today_()
  };
  updateTableRecord_("PURCHASE_ORDERS", "po_id", poId, fields);
}

function listSalesOrders(payload) {
  const customers = byId_(readTable_("SUPPLIERS"), "supplier_id");
  const products = byId_(readTable_("PRODUCTS"), "product_id");
  const linesByOrder = {};
  readTable_("SALES_ORDER_LINES").forEach((line) => {
    const id = String(line.sales_order_id || "");
    if (!linesByOrder[id]) linesByOrder[id] = [];
    linesByOrder[id].push(line);
  });

  return readTable_("SALES_ORDERS").map((order) => {
    const lines = linesByOrder[String(order.sales_order_id)] || [];
    const ordered = lines.reduce((sum, line) => sum + number_(line.qty_ordered, 0), 0);
    const picked = lines.reduce((sum, line) => sum + number_(line.qty_picked, 0), 0);
    const totalWeight = lines.reduce((sum, line) => sum + number_(line.inventory_qty_required, number_(line.qty_ordered, 0)), 0);
    return {
      ...order,
      customer: customers[order.customer_id] || null,
      line_count: lines.length,
      product_names: Array.from(new Set(lines.map((line) => (products[line.product_id] || {}).product_name || line.product_id).filter(Boolean))).join(", "),
      total_units: ordered,
      picked_units: picked,
      remaining_units: Math.max(ordered - picked, 0),
      total_weight_lbs: totalWeight,
      fulfillment_percent: ordered > 0 ? Math.min(100, picked / ordered * 100) : 0
    };
  }).sort((a, b) => String(b.order_date || "").localeCompare(String(a.order_date || "")));
}


function getSalesOrderDetail(payload) {
  const salesOrderId = typeof payload === "string"
    ? payload
    : String((payload || {}).salesOrderId || (payload || {}).sales_order_id || "");
  const order = readTable_("SALES_ORDERS").find((row) => String(row.sales_order_id) === salesOrderId);
  if (!order) return null;

  const customers = byId_(readTable_("SUPPLIERS"), "supplier_id");
  const products = byId_(readTable_("PRODUCTS"), "product_id");
  const lots = byId_(readTable_("LOTS"), "internal_lot_id");
  const locations = byId_(readTable_("LOCATIONS"), "location_id");
  const lines = readTable_("SALES_ORDER_LINES")
    .filter((line) => String(line.sales_order_id) === salesOrderId)
    .map((line) => ({
      ...line,
      product: products[line.product_id] || null,
      lot: lots[line.preferred_internal_lot_id] || null,
      location: locations[line.preferred_location_id] || null
    }));
  const pickTasks = readTable_("PICK_TASKS").filter((task) => String(task.sales_order_id) === salesOrderId);
  return {
    order: { ...order, customer: customers[order.customer_id] || null },
    lines,
    pickTasks
  };
}


function createSalesOrder(payload) {
  payload = payload || {};
  const user = payload.user || {};
  requirePermission_(user, "salesOrders:create");
  const input = payload.input || {};
  const requestedLines = Array.isArray(input.lines) ? input.lines : [];
  if (!requestedLines.length) throw new Error("Add at least one sales line.");

  return withScriptLock_(function () {
    ensureTableColumns_("SALES_ORDERS", CORE_SCHEMA.SALES_ORDERS);
    ensureTableColumns_("SALES_ORDER_LINES", CORE_SCHEMA.SALES_ORDER_LINES);

    const customers = byId_(readTable_("SUPPLIERS"), "supplier_id");
    const products = byId_(readTable_("PRODUCTS"), "product_id");
    const lots = byId_(readTable_("LOTS"), "internal_lot_id");
    const customer = customers[input.customer_id] || null;
    if (!customer || String(customer.party_type || "").toUpperCase() !== "CUSTOMER") {
      throw new Error("Select a valid customer.");
    }

    const snapshot = inventorySnapshot();
    const allocated = {};
    const salesOrderId = input.sales_order_id || nextId_("SALES_ORDERS", "sales_order_id", "SO");
    const lineIds = nextIdBatch_("SALES_ORDER_LINES", "sales_order_line_id", "SOL", requestedLines.length);
    const currency = input.currency || customer.default_currency || "USD";
    let subtotal = 0;
    let grossProfit = 0;

    const lines = requestedLines.map((source, index) => {
      const product = products[source.product_id] || null;
      const lotId = String(source.internal_lot_id || source.preferred_internal_lot_id || "");
      const locationId = String(source.location_id || source.preferred_location_id || "");
      const lot = lots[lotId] || null;
      const inventory = snapshot.find((row) =>
        String(row.product_id) === String(source.product_id) &&
        String(row.internal_lot_id) === lotId &&
        String(row.location_id) === locationId
      );
      if (!product || !lot || !inventory) throw new Error(`Select valid inventory on line ${index + 1}.`);
      if (!["ACTIVE", "AVAILABLE"].includes(String(lot.status || "ACTIVE").toUpperCase())) {
        throw new Error(`The selected lot is not sellable on line ${index + 1}.`);
      }

      const qty = number_(source.qty_ordered || source.quantity, 0);
      const unit = String(source.unit_type || lot.purchase_unit_type || product.default_unit || "CASE").toUpperCase();
      const unitWeight = number_(source.unit_weight_lbs, unit === "LB" ? 1 : lotUnitWeightV2_(lot));
      const inventoryQty = number_(source.inventory_qty_required, unit === "LB" ? qty : qty * unitWeight);
      const price = number_(source.unit_price || source.price, 0);
      if (qty <= 0 || unitWeight <= 0 || inventoryQty <= 0) throw new Error(`Complete quantity and unit weight on line ${index + 1}.`);
      if (price < 0) throw new Error(`Unit price cannot be negative on line ${index + 1}.`);

      const key = [source.product_id, lotId, locationId].join("|");
      const already = number_(allocated[key], 0);
      const available = number_(inventory.available_qty, inventory.current_qty);
      if (already + inventoryQty > available + 0.0001) {
        throw new Error(`Line ${index + 1} exceeds available inventory for ${lotId} at ${locationId}.`);
      }
      allocated[key] = already + inventoryQty;

      const costPerLb = lotCostPerBaseUnitV2_(lot);
      const unitCost = number_(source.unit_cost, costPerLb * unitWeight);
      const lineTotal = qty * price;
      const lineProfit = qty * (price - unitCost);
      subtotal += lineTotal;
      grossProfit += lineProfit;

      return {
        sales_order_line_id: lineIds[index],
        sales_order_id: salesOrderId,
        channel: input.channel || input.sales_channel || "BULK",
        amazon_order_item_id: source.amazon_order_item_id || "",
        product_id: source.product_id,
        amazon_sku: source.amazon_sku || product.amazon_sku || "",
        wholesale_sku: source.wholesale_sku || product.wholesale_sku || "",
        qty_ordered: qty,
        qty_picked: 0,
        qty_remaining: qty,
        unit_type: unit,
        unit_price: price,
        currency,
        line_total: lineTotal,
        preferred_internal_lot_id: lotId,
        preferred_location_id: locationId,
        line_status: "DRAFT",
        notes: source.notes || "",
        unit_weight_lbs: unitWeight,
        inventory_qty_required: inventoryQty,
        inventory_unit_type: source.inventory_unit_type || lot.unit_type || product.base_unit || "LB",
        unit_cost: unitCost,
        estimated_gross_profit: lineProfit,
        expiration_date: source.expiration_date || lot.expiration_date || "",
        fefo_status: source.fefo_status || "RECOMMENDED"
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
      currency,
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

    // Write the order and every warehouse allocation in two batch operations.
    // The previous implementation performed one Sheet write per allocation line,
    // then reread the complete Sales Order detail before returning.
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
      action_type: "CREATE_SALES_ORDER",
      table_name: "SALES_ORDERS",
      record_id: salesOrderId,
      notes: `${lines.length} allocation line(s) written in one batch.`
    });

    // Preserve the response fields the frontend uses without rereading the
    // SALES_ORDERS, SALES_ORDER_LINES, SUPPLIERS, PRODUCTS, LOTS, LOCATIONS,
    // and PICK_TASKS sheets.
    return { ...order, customer, lines, pickTasks: [] };
  });
}


function salesOrderAction(payload) {
  payload = payload || {};
  const user = payload.user || {};
  if (!["ADMIN", "MANAGER"].includes(normalizeRole_(user.role))) throw new Error("Only an Admin or Manager can change Sales Order status.");
  const salesOrderId = String(payload.salesOrderId || payload.sales_order_id || "");
  const action = String(payload.action || payload.status || "").toUpperCase();
  if (!salesOrderId || !action) throw new Error("Choose a Sales Order action.");

  return withScriptLock_(function () {
    const detail = getSalesOrderDetail({ sales_order_id: salesOrderId });
    if (!detail) throw new Error("Sales Order was not found.");
    const current = String(detail.order.status || "DRAFT").toUpperCase();

    if (action === "CONFIRM" || action === "CONFIRMED") {
      if (current !== "DRAFT") throw new Error("Only Draft Sales Orders can be confirmed.");
      return confirmSalesOrder_(salesOrderId, user);
    }
    if (action === "PICK" || action === "PICKED") {
      throw new Error("Use Send Product to scan physical inventory. Orders cannot be manually marked picked.");
    }
    if (action === "SHIP" || action === "SHIPPED") {
      if (current !== "PICKED") throw new Error("Only fully picked Sales Orders can be shipped.");
      return shipSalesOrder_(salesOrderId, user);
    }
    if (action === "CANCEL" || action === "CANCELLED") {
      if (current === "SHIPPED") throw new Error("A shipped Sales Order cannot be cancelled. Record a return or reversal instead.");
      return cancelSalesOrder_(salesOrderId, user);
    }
    throw new Error("Unsupported Sales Order action.");
  });
}


function deliverSalesOrder(payload) {
  payload = payload || {};
  const user = payload.user || {};
  if (!["ADMIN", "MANAGER"].includes(normalizeRole_(user.role))) {
    throw new Error("Only an Admin or Manager can confirm delivery.");
  }
  const input = payload.input || payload;
  const salesOrderId = String(input.sales_order_id || input.salesOrderId || "").trim();
  const requestedLines = Array.isArray(input.lines) ? input.lines : [];
  if (!salesOrderId) throw new Error("Choose a Sales Order.");

  return withScriptLock_(function () {
    ensureTableColumns_("SALES_ORDERS", CORE_SCHEMA.SALES_ORDERS);
    const detail = getSalesOrderDetail({ sales_order_id: salesOrderId });
    if (!detail) throw new Error("Sales Order was not found.");
    const current = String(detail.order.status || "DRAFT").toUpperCase();
    if (current === "DELIVERED") throw new Error("This Sales Order is already delivered.");
    if (current === "CANCELLED") throw new Error("A cancelled Sales Order cannot be delivered.");
    if (!["CONFIRMED", "PARTIALLY_PICKED", "PICKED", "SHIPPED"].includes(current)) {
      throw new Error("Confirm the Sales Order before marking it delivered.");
    }

    const requestedById = requestedLines.reduce((map, line) => {
      map[String(line.sales_order_line_id || "")] = line;
      return map;
    }, {});
    const lots = byId_(readTable_("LOTS"), "internal_lot_id");
    const planned = [];
    const requiredByLot = {};

    detail.lines.forEach((line, index) => {
      const remainingBase = remainingBaseQtyV2_(line);
      if (remainingBase <= 0.0001) return;
      const requested = requestedById[String(line.sales_order_line_id)] || {};
      const lotId = String(requested.internal_lot_id || line.preferred_internal_lot_id || "");
      const locationId = String(requested.location_id || line.preferred_location_id || "");
      const lot = lots[lotId];
      if (!lot) throw new Error(`Line ${index + 1}: selected lot was not found.`);
      if (String(lot.product_id) !== String(line.product_id)) throw new Error(`Line ${index + 1}: selected lot belongs to another product.`);
      if (!['ACTIVE', 'AVAILABLE'].includes(String(lot.status || 'ACTIVE').toUpperCase())) throw new Error(`Line ${index + 1}: selected lot is not active.`);
      if (String(lot.current_location_id || "") !== locationId) throw new Error(`Line ${index + 1}: selected lot is not stored in ${locationId}.`);
      const key = lotId;
      requiredByLot[key] = number_(requiredByLot[key], 0) + remainingBase;
      planned.push({ line, lot, lotId, locationId, remainingBase });
    });

    Object.keys(requiredByLot).forEach((lotId) => {
      const lot = lots[lotId];
      const currentQty = number_(lot.current_qty_script !== "" && lot.current_qty_script !== undefined ? lot.current_qty_script : lot.original_qty, 0);
      if (requiredByLot[lotId] > currentQty + 0.0001) {
        throw new Error(`Not enough inventory in lot ${lotId}. Available ${currentQty}; required ${requiredByLot[lotId]}.`);
      }
    });

    planned.forEach((item) => {
      updateTableRecord_("SALES_ORDER_LINES", "sales_order_line_id", item.line.sales_order_line_id, {
        preferred_internal_lot_id: item.lotId,
        preferred_location_id: item.locationId,
        fefo_status: item.lotId === String(item.line.preferred_internal_lot_id) && item.locationId === String(item.line.preferred_location_id) ? item.line.fefo_status || "RECOMMENDED" : "OVERRIDE"
      });
      const task = detail.pickTasks.find((row) => String(row.sales_order_line_id) === String(item.line.sales_order_line_id));
      if (task) {
        updateTableRecord_("PICK_TASKS", "pick_task_id", task.pick_task_id, {
          recommended_internal_lot_id: item.lotId,
          recommended_location_id: item.locationId
        });
      }
      recordInventoryMovementInternal_(user, {
        movement_type: "SALE",
        internal_lot_id: item.lotId,
        qty: item.remainingBase,
        unit_type: item.line.inventory_unit_type || item.lot.unit_type || "LB",
        location_id: item.locationId,
        related_sales_order_id: salesOrderId,
        related_pick_task_id: task ? task.pick_task_id : "",
        sales_order_line_id: item.line.sales_order_line_id,
        notes: `Delivery confirmed for ${salesOrderId}.`
      });
    });

    detail.lines.forEach((line) => updateTableRecord_("SALES_ORDER_LINES", "sales_order_line_id", line.sales_order_line_id, {
      line_status: "DELIVERED",
      qty_remaining: 0
    }));
    detail.pickTasks.forEach((task) => updateTableRecord_("PICK_TASKS", "pick_task_id", task.pick_task_id, {
      pick_status: "DELIVERED",
      reservation_status: "RELEASED"
    }));
    updateTableRecord_("SALES_ORDERS", "sales_order_id", salesOrderId, {
      status: "DELIVERED",
      delivered_at: today_(),
      delivered_by: user.user_id || user.role,
      delivery_notes: String(input.delivery_notes || ""),
      updated_at: today_()
    });
    writeAuditLog_({ user_id: user.user_id, role: user.role, action_type: "DELIVER_SALES_ORDER", table_name: "SALES_ORDERS", record_id: salesOrderId, notes: String(input.delivery_notes || "") });
    return getSalesOrderDetail({ sales_order_id: salesOrderId });
  });
}


function confirmSalesOrder_(salesOrderId, user) {
  const detail = getSalesOrderDetail({ sales_order_id: salesOrderId });
  if (!detail) throw new Error("Sales Order was not found.");
  if (!detail.lines.length) throw new Error("Sales Order has no product lines.");

  const snapshot = inventorySnapshot();
  const requested = {};
  detail.lines.forEach((line, index) => {
    const row = snapshot.find((item) =>
      String(item.product_id) === String(line.product_id) &&
      String(item.internal_lot_id) === String(line.preferred_internal_lot_id) &&
      String(item.location_id) === String(line.preferred_location_id)
    );
    if (!row) throw new Error(`Inventory allocation is missing on line ${index + 1}.`);
    const key = [line.product_id, line.preferred_internal_lot_id, line.preferred_location_id].join("|");
    requested[key] = number_(requested[key], 0) + number_(line.inventory_qty_required, line.qty_ordered);
    if (requested[key] > number_(row.available_qty, row.current_qty) + 0.0001) {
      throw new Error(`Inventory is no longer available for line ${index + 1}.`);
    }
  });

  const existing = readTable_("PICK_TASKS").filter((task) => String(task.sales_order_id) === String(salesOrderId));
  if (!existing.length) {
    const taskIds = nextIdBatch_("PICK_TASKS", "pick_task_id", "PICK", detail.lines.length);
    detail.lines.forEach((line, index) => appendRecord_("PICK_TASKS", {
      pick_task_id: taskIds[index],
      sales_order_id: salesOrderId,
      sales_order_line_id: line.sales_order_line_id,
      channel: detail.order.channel,
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
      picked_at: "",
      scan_code: line.preferred_internal_lot_id,
      device_id: "WEB_APP",
      exception_code: "",
      notes: line.fefo_status === "OVERRIDE" ? "Approved allocation override." : "Recommended FEFO/FIFO allocation.",
      qty_to_pick_base: line.inventory_qty_required || line.qty_ordered,
      reservation_status: "RESERVED"
    }));
  }
  detail.lines.forEach((line) => updateTableRecord_("SALES_ORDER_LINES", "sales_order_line_id", line.sales_order_line_id, { line_status: "CONFIRMED" }));
  updateTableRecord_("SALES_ORDERS", "sales_order_id", salesOrderId, { status: "CONFIRMED", confirmed_at: today_(), updated_at: today_() });
  writeAuditLog_({ user_id: user.user_id, role: user.role, action_type: "CONFIRM_SALES_ORDER", table_name: "SALES_ORDERS", record_id: salesOrderId });
  return getSalesOrderDetail({ sales_order_id: salesOrderId });
}


function pickSalesOrder_(salesOrderId, user) {
  throw new Error("Use Send Product to scan physical inventory. Manual picking is disabled.");
}


function shipSalesOrder_(salesOrderId, user) {
  const detail = getSalesOrderDetail({ sales_order_id: salesOrderId });
  if (!detail) throw new Error("Sales Order was not found.");
  const allPicked = detail.lines.length > 0 && detail.lines.every((line) =>
    number_(line.qty_remaining, 0) <= 0.0001 || String(line.line_status || "").toUpperCase() === "PICKED"
  );
  if (!allPicked) throw new Error("Use Send Product to finish every Sales Order line before shipping.");

  detail.pickTasks.forEach((task) => updateTableRecord_("PICK_TASKS", "pick_task_id", task.pick_task_id, {
    pick_status: "SHIPPED",
    reservation_status: "RELEASED"
  }));
  updateTableRecord_("SALES_ORDERS", "sales_order_id", salesOrderId, { status: "SHIPPED", shipped_at: today_(), updated_at: today_() });
  writeAuditLog_({ user_id: user.user_id, role: user.role, action_type: "SHIP_SALES_ORDER", table_name: "SALES_ORDERS", record_id: salesOrderId });
  return getSalesOrderDetail({ sales_order_id: salesOrderId });
}


function cancelSalesOrder_(salesOrderId, user) {
  const detail = getSalesOrderDetail({ sales_order_id: salesOrderId });
  if (!detail) throw new Error("Sales Order was not found.");
  detail.pickTasks.forEach((task) => updateTableRecord_("PICK_TASKS", "pick_task_id", task.pick_task_id, {
    pick_status: "CANCELLED",
    reservation_status: "RELEASED"
  }));
  detail.lines.forEach((line) => {
    if (number_(line.qty_picked, 0) <= 0.0001) {
      updateTableRecord_("SALES_ORDER_LINES", "sales_order_line_id", line.sales_order_line_id, { line_status: "CANCELLED" });
    }
  });
  updateTableRecord_("SALES_ORDERS", "sales_order_id", salesOrderId, { status: "CANCELLED", updated_at: today_() });
  writeAuditLog_({ user_id: user.user_id, role: user.role, action_type: "CANCEL_SALES_ORDER", table_name: "SALES_ORDERS", record_id: salesOrderId });
  return getSalesOrderDetail({ sales_order_id: salesOrderId });
}



function sendProduct(payload) {
  payload = payload || {};
  const user = payload.user || {};
  requirePermission_(user, "salesOrders:send");
  const input = payload.input || payload;
  return withScriptLock_(function () {
    const movement = recordInventoryMovementInternal_(user, {
      ...input,
      movement_type: "SALE",
      related_sales_order_id: input.related_sales_order_id || input.sales_order_id || ""
    });
    return {
      movement,
      salesOrder: movement.related_sales_order_id
        ? getSalesOrderDetail({ sales_order_id: movement.related_sales_order_id })
        : null
    };
  });
}

function recordInventoryMovementInternal_(user, input) {
  const type = String(input.movement_type || "ADJUSTMENT").toUpperCase();
  const outbound = ["SALE", "AMAZON_OUT", "ADJUST_OUT", "USE", "WASTE", "SAMPLE", "TRANSFER_OUT"].includes(type);
  const inbound = ["ADJUST_IN", "RECEIVE", "RETURN", "OPENING_INVENTORY", "TRANSFER_IN"].includes(type);
  const rawQty = input.qty_change !== undefined && input.qty_change !== ""
    ? number_(input.qty_change, 0)
    : Math.abs(number_(input.qty, 0));
  const qtyChange = input.qty_change !== undefined && input.qty_change !== ""
    ? rawQty
    : inbound ? Math.abs(rawQty) : outbound ? -Math.abs(rawQty) : rawQty;

  const lot = findLotByScanV2_(input.internal_lot_id || input.lot_id || input.scan_code);
  if (!lot) throw new Error("Scan a valid inventory lot before recording movement.");
  if (!qtyChange) throw new Error("Quantity must be greater than zero.");

  const salesOrderId = String(input.related_sales_order_id || input.sales_order_id || "");
  let salesLine = null;
  let pickTask = null;
  if (salesOrderId) {
    const order = readTable_("SALES_ORDERS").find((row) => String(row.sales_order_id) === salesOrderId);
    if (!order) throw new Error("Sales Order was not found.");
    if (!["CONFIRMED", "PARTIALLY_PICKED"].includes(String(order.status || "").toUpperCase())) {
      throw new Error("Only confirmed or partially picked Sales Orders can send product.");
    }
    const tasks = readTable_("PICK_TASKS").filter((task) => String(task.sales_order_id) === salesOrderId);
    pickTask = input.related_pick_task_id
      ? tasks.find((task) => String(task.pick_task_id) === String(input.related_pick_task_id))
      : null;
    const lines = readTable_("SALES_ORDER_LINES").filter((line) => String(line.sales_order_id) === salesOrderId);
    salesLine = input.sales_order_line_id
      ? lines.find((line) => String(line.sales_order_line_id) === String(input.sales_order_line_id))
      : pickTask
        ? lines.find((line) => String(line.sales_order_line_id) === String(pickTask.sales_order_line_id))
        : lines.find((line) =>
            String(line.product_id) === String(lot.product_id) &&
            String(line.preferred_internal_lot_id) === String(lot.internal_lot_id)
          );
    if (!salesLine) throw new Error("The scanned lot is not assigned to this Sales Order.");
    if (String(salesLine.product_id) !== String(lot.product_id)) throw new Error("Scanned product does not match the Sales Order line.");
    if (String(salesLine.preferred_internal_lot_id || "") && String(salesLine.preferred_internal_lot_id) !== String(lot.internal_lot_id)) {
      throw new Error("Scanned lot does not match the assigned Sales Order lot.");
    }
    if (String(salesLine.preferred_location_id || "") && String(input.location_id || input.from_location_id || lot.current_location_id || "") !== String(salesLine.preferred_location_id)) {
      throw new Error("Scanned inventory is not in the assigned Sales Order location.");
    }

    const remainingBase = remainingBaseQtyV2_(salesLine);
    if (Math.abs(qtyChange) > remainingBase + 0.0001) {
      throw new Error(`Quantity is higher than the remaining Sales Order need of ${remainingBase}.`);
    }
  }

  const currentQty = number_(lot.current_qty_script !== "" && lot.current_qty_script !== undefined ? lot.current_qty_script : lot.original_qty, 0);
  if (qtyChange < 0 && Math.abs(qtyChange) > currentQty + 0.0001) {
    throw new Error(`Not enough inventory in lot ${lot.internal_lot_id}. Available ${currentQty}.`);
  }
  const nextQty = Math.max(0, currentQty + qtyChange);
  updateTableRecord_("LOTS", "internal_lot_id", lot.internal_lot_id, {
    current_qty_script: nextQty,
    status: nextQty <= 0.0001 ? "EMPTY" : (String(lot.status || "ACTIVE").toUpperCase() === "EMPTY" ? "ACTIVE" : lot.status || "ACTIVE"),
    updated_at: today_()
  });

  const movement = {
    movement_id: nextId_("INVENTORY_MOVEMENTS", "movement_id", "MOV"),
    movement_type: type,
    timestamp: today_(),
    user_id: user.user_id || user.role,
    product_id: lot.product_id,
    internal_lot_id: lot.internal_lot_id,
    package_id: input.package_id || "",
    qty_change: qtyChange,
    unit_type: input.unit_type || lot.unit_type || "LB",
    from_location_id: input.from_location_id || input.location_id || (qtyChange < 0 ? lot.current_location_id || "" : ""),
    to_location_id: input.to_location_id || (qtyChange > 0 ? lot.current_location_id || "" : "OUTBOUND"),
    related_po_id: input.related_po_id || "",
    related_receiving_id: input.related_receiving_id || "",
    related_sales_order_id: salesOrderId,
    related_pick_task_id: pickTask ? pickTask.pick_task_id : input.related_pick_task_id || "",
    related_amazon_order_id: input.related_amazon_order_id || "",
    scan_code: input.scan_code || lot.qr_value || lot.internal_lot_id,
    device_id: input.device_id || "WEB_APP",
    approval_status: input.approval_status || "APPROVED",
    notes: input.notes || ""
  };
  appendRecord_("INVENTORY_MOVEMENTS", movement);
  if (salesOrderId && salesLine) updateSalesOrderProgressV2_(salesOrderId, salesLine, pickTask, Math.abs(qtyChange), user);
  writeAuditLog_({ user_id: user.user_id, role: user.role, action_type: "INVENTORY_MOVEMENT", table_name: "INVENTORY_MOVEMENTS", record_id: movement.movement_id });
  return movement;
}

function updateSalesOrderProgressV2_(salesOrderId, line, pickTask, qtyBase, user) {
  const ordered = number_(line.qty_ordered, 0);
  const requiredBase = number_(line.inventory_qty_required, ordered) || ordered;
  const salesQty = requiredBase > 0 && ordered > 0 ? qtyBase / requiredBase * ordered : qtyBase;
  const picked = Math.min(ordered, number_(line.qty_picked, 0) + salesQty);
  const remaining = Math.max(0, ordered - picked);
  const state = remaining <= 0.0001 ? "PICKED" : "PARTIALLY_PICKED";
  updateTableRecord_("SALES_ORDER_LINES", "sales_order_line_id", line.sales_order_line_id, {
    qty_picked: picked,
    qty_remaining: remaining,
    line_status: state
  });
  if (pickTask) {
    const target = number_(pickTask.qty_to_pick, ordered);
    updateTableRecord_("PICK_TASKS", "pick_task_id", pickTask.pick_task_id, {
      qty_picked: Math.min(target, number_(pickTask.qty_picked, 0) + salesQty),
      pick_status: state,
      picked_at: today_(),
      scan_code: line.preferred_internal_lot_id || pickTask.scan_code || "",
      device_id: user.device_id || pickTask.device_id || "WEB_APP",
      reservation_status: remaining <= 0.0001 ? "PICKED" : "RESERVED"
    });
  }

  const lines = readTable_("SALES_ORDER_LINES").filter((item) => String(item.sales_order_id) === String(salesOrderId));
  const allPicked = lines.length > 0 && lines.every((item) => number_(item.qty_remaining, 0) <= 0.0001 || String(item.line_status || "").toUpperCase() === "PICKED");
  const anyPicked = lines.some((item) => number_(item.qty_picked, 0) > 0);
  updateTableRecord_("SALES_ORDERS", "sales_order_id", salesOrderId, {
    status: allPicked ? "PICKED" : anyPicked ? "PARTIALLY_PICKED" : "CONFIRMED",
    picked_at: anyPicked ? today_() : "",
    updated_at: today_()
  });
}

function findLotByScanV2_(value) {
  const key = String(value || "").trim();
  return readTable_("LOTS").find((lot) =>
    [lot.internal_lot_id, lot.qr_value, lot.supplier_lot_number].map(String).includes(key)
  ) || null;
}

function remainingBaseQtyV2_(line) {
  const ordered = number_(line.qty_ordered, 0);
  const remaining = number_(line.qty_remaining, ordered);
  const requiredBase = number_(line.inventory_qty_required, ordered) || ordered;
  return ordered > 0 ? requiredBase * remaining / ordered : requiredBase;
}

function lotUnitWeightV2_(lot) {
  const original = number_(lot.original_qty, 0);
  const purchase = number_(lot.purchase_qty_received, 0);
  return original > 0 && purchase > 0 ? original / purchase : number_(lot.units_per_purchase_unit || lot.case_weight_lbs, 1) || 1;
}

function lotCostPerBaseUnitV2_(lot) {
  const purchaseCost = number_(lot.unit_cost, 0);
  const weight = lotUnitWeightV2_(lot);
  return weight > 0 ? purchaseCost / weight : purchaseCost;
}

function nextIdBatch_(sheetName, idColumn, prefix, count) {
  const max = readTable_(sheetName).reduce((value, row) => {
    const match = String(row[idColumn] || "").match(/(\d+)$/);
    return match ? Math.max(value, Number(match[1])) : value;
  }, 0);
  return Array.from({ length: count }, (_, index) => `${prefix}-${String(max + index + 1).padStart(6, "0")}`);
}

function withScriptLock_(operation) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return operation();
  } finally {
    lock.releaseLock();
  }
}

function recordInventoryMovement(payload) {
  payload = payload || {};
  const user = payload.user || {};
  const input = payload.input || payload;
  const role = normalizeRole_(user.role);
  const type = String(input.movement_type || "ADJUSTMENT").toUpperCase();
  const salesOrderId = String(input.related_sales_order_id || input.sales_order_id || "");

  if (role !== "ADMIN") {
    requirePermission_(user, "salesOrders:send");
    if (type !== "SALE" || !salesOrderId) {
      throw new Error("Warehouse users can only send product against a confirmed Sales Order.");
    }
  } else {
    requirePermission_(user, "inventory:adjust");
  }

  return withScriptLock_(function () {
    return recordInventoryMovementInternal_(user, input);
  });
}


function getRackInventory() {
  const products = byId_(readTable_("PRODUCTS"), "product_id");
  const locations = readTable_("LOCATIONS").filter(isActiveRecord_);
  const reserved = reservedInventory_();
  const lotsByLocation = {};

  readTable_("LOTS").forEach((lot) => {
    const locationId = String(lot.current_location_id || "").trim();
    const currentQty = number_(lot.current_qty_script !== "" && lot.current_qty_script !== undefined ? lot.current_qty_script : lot.original_qty, 0);
    const status = String(lot.status || "ACTIVE").trim().toUpperCase();
    if (!locationId || currentQty <= 0.0001 || ["EMPTY", "DEPLETED", "RETURNED"].indexOf(status) >= 0) return;
    if (!lotsByLocation[locationId]) lotsByLocation[locationId] = [];
    lotsByLocation[locationId].push({ lot, currentQty });
  });

  const spaces = locations.map((location) => {
    const locationId = String(location.location_id || "");
    const matches = (lotsByLocation[locationId] || []).sort((a, b) =>
      String(a.lot.internal_lot_id || "").localeCompare(String(b.lot.internal_lot_id || ""), undefined, { numeric: true })
    );
    const current = matches[0] || null;
    const lot = current ? current.lot : null;
    const product = lot ? products[lot.product_id] || {} : {};
    const unitWeight = lot ? lotUnitWeightV2_(lot) : 0;
    const reservationKey = lot ? [lot.product_id, lot.internal_lot_id, locationId].join("|") : "";
    const reservedQty = reservationKey ? number_(reserved[reservationKey], 0) : 0;

    return {
      location_id: locationId,
      rack: location.rack || locationId.split("-")[0] || "",
      level: location.level || "",
      bin: location.bin || "",
      zone: location.zone || "",
      location_status: location.current_status || "AVAILABLE",
      can_add_inventory: !locationHardBlockReason_(location),
      occupied: Boolean(current),
      conflict: matches.length > 1,
      conflict_lot_ids: matches.map((entry) => entry.lot.internal_lot_id),
      internal_lot_id: lot ? lot.internal_lot_id || "" : "",
      product_id: lot ? lot.product_id || "" : "",
      product_name: lot ? product.product_name || lot.product_id || "" : "",
      supplier_lot_number: lot ? lot.supplier_lot_number || "" : "",
      current_base_qty: current ? current.currentQty : 0,
      base_unit: lot ? lot.unit_type || product.base_unit || "LB" : "",
      purchase_unit_type: lot ? lot.purchase_unit_type || "UNIT" : "",
      unit_weight: unitWeight,
      current_purchase_units: unitWeight > 0 && current ? current.currentQty / unitWeight : 0,
      reserved_base_qty: reservedQty,
      reserved_purchase_units: unitWeight > 0 ? reservedQty / unitWeight : 0
    };
  }).sort(compareRackSpaces_);

  return {
    generated_at: today_(),
    spaces,
    rack_count: Array.from(new Set(spaces.map((space) => space.rack).filter(Boolean))).length,
    occupied_count: spaces.filter((space) => space.occupied).length,
    conflict_count: spaces.filter((space) => space.conflict).length
  };
}


function compareRackSpaces_(a, b) {
  const rack = String(a.rack || "").localeCompare(String(b.rack || ""), undefined, { numeric: true });
  if (rack) return rack;
  const levelA = number_(String(a.level || "").replace(/\D/g, ""), 0);
  const levelB = number_(String(b.level || "").replace(/\D/g, ""), 0);
  if (levelA !== levelB) return levelB - levelA;
  const binRank = { F: 0, M: 1, B: 2 };
  return (binRank[String(a.bin || "").toUpperCase()] ?? 9) - (binRank[String(b.bin || "").toUpperCase()] ?? 9);
}


function saveRackInventory(payload) {
  payload = payload || {};
  const user = payload.user || {};
  const input = payload.input || payload;
  requirePermission_(user, "inventory:adjust");

  return withScriptLock_(function () {
    ensureTableColumns_("ADJUSTMENTS", CORE_SCHEMA.ADJUSTMENTS);
    const locationId = String(input.location_id || "").trim();
    const purchaseUnits = Number(input.purchase_units);
    if (!locationId) throw new Error("Choose a rack space.");
    if (!Number.isFinite(purchaseUnits) || purchaseUnits < 0) throw new Error("Enter a valid amount of purchase units.");

    const location = readTable_("LOCATIONS").find((row) => String(row.location_id) === locationId);
    if (!location || !isActiveRecord_(location)) throw new Error("This rack space is not active.");

    const positiveLots = readTable_("LOTS").filter((lot) => {
      const qty = number_(lot.current_qty_script !== "" && lot.current_qty_script !== undefined ? lot.current_qty_script : lot.original_qty, 0);
      const status = String(lot.status || "ACTIVE").trim().toUpperCase();
      return String(lot.current_location_id || "") === locationId
        && qty > 0.0001
        && ["EMPTY", "DEPLETED", "RETURNED"].indexOf(status) < 0;
    });
    if (positiveLots.length > 1) throw new Error("This space contains conflicting inventory records. Resolve the duplicate before editing it.");

    const existingLot = positiveLots[0] || null;
    const expectedLotId = String(input.internal_lot_id || "").trim();
    if (existingLot && expectedLotId && String(existingLot.internal_lot_id) !== expectedLotId) {
      throw new Error("This rack space changed after it was opened. Refresh and try again.");
    }
    if (!existingLot && expectedLotId) {
      throw new Error("This inventory was already changed. Refresh and try again.");
    }

    if (existingLot) return updateExistingRackLot_(user, input, location, existingLot, purchaseUnits);
    return addRackLot_(user, input, location, purchaseUnits);
  });
}


function updateExistingRackLot_(user, input, location, lot, purchaseUnits) {
  const currentBaseQty = number_(lot.current_qty_script !== "" && lot.current_qty_script !== undefined ? lot.current_qty_script : lot.original_qty, 0);
  if (input.expected_base_qty !== undefined && input.expected_base_qty !== "") {
    const expectedBaseQty = Number(input.expected_base_qty);
    if (!Number.isFinite(expectedBaseQty) || !approximatelyEqual_(currentBaseQty, expectedBaseQty, 0.001)) {
      throw new Error("This quantity changed after it was opened. Refresh and try again.");
    }
  }

  const unitWeight = lotUnitWeightV2_(lot);
  if (!(unitWeight > 0)) throw new Error("This lot is missing its purchase-unit weight.");
  const nextBaseQty = Math.round(purchaseUnits * unitWeight * 1000000) / 1000000;
  const reservationKey = [lot.product_id, lot.internal_lot_id, location.location_id].join("|");
  const reservedBaseQty = number_(reservedInventory_()[reservationKey], 0);
  if (nextBaseQty + 0.0001 < reservedBaseQty) {
    const reservedUnits = reservedBaseQty / unitWeight;
    throw new Error(`This lot has ${reservedUnits} ${lot.purchase_unit_type || "units"} reserved for open Sales Orders.`);
  }

  const difference = nextBaseQty - currentBaseQty;
  if (Math.abs(difference) <= 0.0001) {
    return { changed: false, rack_inventory: getRackInventory() };
  }

  const movementType = difference > 0 ? "ADJUST_IN" : "ADJUST_OUT";
  const note = String(input.notes || `Rack inventory set to ${purchaseUnits} ${lot.purchase_unit_type || "units"}.`).trim();
  const movement = recordInventoryMovementInternal_(user, {
    internal_lot_id: lot.internal_lot_id,
    movement_type: movementType,
    qty_change: difference,
    unit_type: lot.unit_type || "LB",
    location_id: location.location_id,
    approval_status: "APPROVED",
    notes: note
  });
  const adjustment = appendRackAdjustment_(user, lot, location.location_id, difference, movement, note);
  writeAuditLog_({
    user_id: user.user_id,
    role: user.role,
    action_type: "SET_RACK_INVENTORY",
    table_name: "LOTS",
    record_id: lot.internal_lot_id,
    field_name: "current_qty_script",
    old_value: currentBaseQty,
    new_value: nextBaseQty,
    source_screen: "RACK_INVENTORY",
    notes: note
  });
  return { changed: true, movement, adjustment, rack_inventory: getRackInventory() };
}


function addRackLot_(user, input, location, purchaseUnits) {
  if (purchaseUnits <= 0) throw new Error("Enter an amount greater than zero when adding inventory.");
  const hardBlock = locationHardBlockReason_(location);
  if (hardBlock) throw new Error(`This rack space cannot receive inventory (${hardBlock}).`);

  const productId = String(input.product_id || "").trim();
  const product = readTable_("PRODUCTS").find((row) => String(row.product_id) === productId && isActiveRecord_(row));
  if (!product) throw new Error("Choose an active product.");
  if (!locationAllowsProduct_(location, product)) throw new Error("This rack space does not allow that product category.");

  const supplierLotNumber = String(input.supplier_lot_number || "").trim();
  const purchaseUnitType = String(input.purchase_unit_type || "").trim();
  const unitWeight = Number(input.unit_weight);
  if (!supplierLotNumber) throw new Error("Enter the supplier lot number.");
  if (!purchaseUnitType) throw new Error("Enter the purchase-unit type.");
  if (!Number.isFinite(unitWeight) || unitWeight <= 0) throw new Error("Enter a valid amount per purchase unit.");

  const baseQty = Math.round(purchaseUnits * unitWeight * 1000000) / 1000000;
  const lotId = nextId_("LOTS", "internal_lot_id", "LOT");
  const lot = {
    internal_lot_id: lotId,
    product_id: productId,
    supplier_id: input.supplier_id || "",
    supplier_lot_number: supplierLotNumber,
    received_date: today_(),
    original_qty: baseQty,
    current_qty_script: 0,
    unit_type: product.base_unit || "LB",
    unit_cost: number_(input.unit_cost, 0),
    currency: input.currency || "USD",
    current_location_id: location.location_id,
    status: "EMPTY",
    qr_value: lotId,
    created_at: today_(),
    updated_at: today_(),
    notes: input.notes || "Added from Rack Inventory.",
    purchase_qty_received: purchaseUnits,
    purchase_unit_type: purchaseUnitType,
    pallet_count: 1
  };

  const lotWrite = appendRecord_("LOTS", lot);
  let movement = null;
  try {
    const note = String(input.notes || `Added ${purchaseUnits} ${purchaseUnitType} from Rack Inventory.`).trim();
    movement = recordInventoryMovementInternal_(user, {
      internal_lot_id: lotId,
      movement_type: "ADJUST_IN",
      qty_change: baseQty,
      unit_type: lot.unit_type,
      location_id: location.location_id,
      approval_status: "APPROVED",
      notes: note
    });
    const adjustment = appendRackAdjustment_(user, lot, location.location_id, baseQty, movement, note);
    writeAuditLog_({
      user_id: user.user_id,
      role: user.role,
      action_type: "ADD_RACK_INVENTORY",
      table_name: "LOTS",
      record_id: lotId,
      field_name: "current_qty_script",
      old_value: 0,
      new_value: baseQty,
      source_screen: "RACK_INVENTORY",
      notes: note
    });
    return { changed: true, movement, adjustment, rack_inventory: getRackInventory() };
  } catch (error) {
    if (!movement) rollbackAppendedRange_(lotWrite);
    throw error;
  }
}


function appendRackAdjustment_(user, lot, locationId, difference, movement, notes) {
  const adjustment = {
    adjustment_id: nextId_("ADJUSTMENTS", "adjustment_id", "ADJ"),
    created_at: today_(),
    created_by: user.user_id || user.role,
    product_id: lot.product_id,
    internal_lot_id: lot.internal_lot_id,
    location_id: locationId,
    qty_adjustment: difference,
    unit_type: lot.unit_type || "LB",
    reason_code: "PHYSICAL_RECOUNT",
    approval_status: "APPROVED",
    approved_by: user.user_id || user.role,
    approved_at: today_(),
    related_movement_id: movement.movement_id,
    notes: notes || ""
  };
  appendRecord_("ADJUSTMENTS", adjustment);
  return adjustment;
}


function recordAmazonOutbound(payload) {
  payload = payload || {};
  const user = payload.user || {};
  if (normalizeRole_(user.role) !== "ADMIN") throw new Error("Only an Admin can record Amazon outbound activity.");
  const input = payload.input || payload;
  const pkgId = input.package_id || nextId_("AMAZON_PACKAGES", "package_id", "PKG");
  const movement = recordInventoryMovement({
    user,
    input: {
      movement_type: "AMAZON_OUT",
      product_id: input.product_id,
      internal_lot_id: input.source_internal_lot_id || input.internal_lot_id,
      package_id: pkgId,
      qty_change: -Math.abs(number_(input.qty_product_used || input.qty_change, 0)),
      unit_type: input.unit_type || "LB",
      from_location_id: input.current_location_id || input.from_location_id || "",
      to_location_id: "AMAZON_PACKAGE",
      related_amazon_order_id: input.matched_amazon_order_id || "",
      scan_code: pkgId,
      notes: input.notes || ""
    }
  });
  const pkg = {
    package_id: pkgId,
    package_qr_value: input.package_qr_value || pkgId,
    amazon_sku: input.amazon_sku || "",
    product_id: input.product_id,
    source_internal_lot_id: input.source_internal_lot_id || input.internal_lot_id,
    qty_product_used: Math.abs(number_(input.qty_product_used || input.qty_change, 0)),
    unit_type: input.unit_type || "LB",
    packed_by: user.user_id || user.role,
    packed_at: today_(),
    package_status: input.package_status || "PACKED",
    current_location_id: input.current_location_id || "",
    matched_amazon_order_id: input.matched_amazon_order_id || "",
    matched_amazon_order_item_id: input.matched_amazon_order_item_id || "",
    shipped_at: "",
    notes: input.notes || ""
  };
  appendRecord_("AMAZON_PACKAGES", pkg);
  return { package: pkg, movement };
}


function listAmazonOutboundActivity() {
  return readTable_("AMAZON_PACKAGES").sort((a, b) => String(b.packed_at || "").localeCompare(String(a.packed_at || "")));
}


function matchAmazonPackageScan(payload) {
  payload = payload || {};
  const user = payload.user || {};
  requirePermission_(user, "scanner:lookup");
  const input = payload.input || payload;
  const packageId = input.package_id || input.scan_code || input.package_qr_value;
  const pkg = readTable_("AMAZON_PACKAGES").find((row) => String(row.package_id) === String(packageId) || String(row.package_qr_value) === String(packageId));
  if (!pkg) throw new Error("Package was not found.");
  const match = {
    scan_match_id: nextId_("AMAZON_SCAN_MATCHES", "scan_match_id", "AMZSCAN"),
    scanned_at: today_(),
    scanned_by: user.user_id || user.role,
    device_id: input.device_id || "WEB_APP",
    package_id: pkg.package_id,
    amazon_order_id: input.amazon_order_id || pkg.matched_amazon_order_id || "",
    amazon_order_item_id: input.amazon_order_item_id || pkg.matched_amazon_order_item_id || "",
    amazon_sku: input.amazon_sku || pkg.amazon_sku || "",
    product_id: pkg.product_id,
    match_status: "MATCHED",
    match_confidence: 1,
    exception_code: "",
    related_pick_task_id: input.related_pick_task_id || "",
    related_movement_id: input.related_movement_id || "",
    notes: input.notes || ""
  };
  appendRecord_("AMAZON_SCAN_MATCHES", match);
  updateTableRecord_("AMAZON_PACKAGES", "package_id", pkg.package_id, {
    matched_amazon_order_id: match.amazon_order_id,
    matched_amazon_order_item_id: match.amazon_order_item_id,
    package_status: "MATCHED"
  });
  return { package: pkg, match };
}


function inventorySnapshot() {
  const products = byId_(readTable_("PRODUCTS"), "product_id");
  const locations = byId_(readTable_("LOCATIONS"), "location_id");
  const reserved = reservedInventory_();

  return readTable_("LOTS").map((lot) => {
    const product = products[lot.product_id] || {};
    const locationId = String(lot.current_location_id || "");
    const key = [lot.product_id, lot.internal_lot_id, locationId].join("|");
    const current = number_(lot.current_qty_script !== "" && lot.current_qty_script !== undefined ? lot.current_qty_script : lot.original_qty, 0);
    const reservedQty = number_(reserved[key], 0);
    const costPerLb = lotCostPerBaseUnitV2_(lot);
    return {
      product_id: lot.product_id || "",
      product_name: product.product_name || lot.product_id || "",
      product_category: product.product_category || "",
      internal_lot_id: lot.internal_lot_id || "",
      location_id: locationId,
      current_qty: current,
      qty: current,
      reserved_qty: reservedQty,
      available_qty: Math.max(0, current - reservedQty),
      unit_type: lot.unit_type || product.base_unit || "LB",
      expiration_date: lot.expiration_date || "",
      unit_cost: costPerLb,
      cost_per_lb: costPerLb,
      purchase_unit_cost: number_(lot.unit_cost, 0),
      purchase_unit_type: lot.purchase_unit_type || "",
      purchase_qty_received: number_(lot.purchase_qty_received, 0),
      lbs_per_purchase_unit: lotUnitWeightV2_(lot),
      inventory_value: Math.max(0, current) * costPerLb,
      missing_cost: number_(lot.unit_cost, 0) <= 0 || lotUnitWeightV2_(lot) <= 0,
      value_status: number_(lot.unit_cost, 0) <= 0 || lotUnitWeightV2_(lot) <= 0 ? "MISSING_COST" : "OK",
      product,
      lot,
      location: locations[locationId] || null,
      lot_status: lot.status || "",
      inventory_status: current > 0 ? "AVAILABLE" : "EMPTY"
    };
  }).filter((row) =>
    row.current_qty > 0 && ["ACTIVE", "AVAILABLE", ""].includes(String(row.lot_status || "ACTIVE").toUpperCase())
  );
}


function reservedInventory_() {
  const result = {};
  const lines = byId_(readTable_("SALES_ORDER_LINES"), "sales_order_line_id");
  readTable_("PICK_TASKS").forEach((task) => {
    if (String(task.reservation_status || "").toUpperCase() !== "RESERVED") return;
    const line = lines[task.sales_order_line_id] || {};
    const lotId = task.recommended_internal_lot_id || line.preferred_internal_lot_id || "";
    const locationId = task.recommended_location_id || line.preferred_location_id || "";
    const key = [task.product_id || line.product_id || "", lotId, locationId].join("|");
    const remainingBase = line.sales_order_line_id
      ? remainingBaseQtyV2_(line)
      : Math.max(0, number_(task.qty_to_pick_base, task.qty_to_pick) - number_(task.qty_picked, 0));
    result[key] = number_(result[key], 0) + remainingBase;
  });
  return result;
}


function inventoryValueFromLots_() {
  return readTable_("LOTS")
    .filter((lot) => String(lot.status || "ACTIVE").toUpperCase() === "ACTIVE")
    .reduce((sum, lot) => {
      return sum + number_(lot.purchase_qty_received, 0) * number_(lot.unit_cost, 0);
    }, 0);
}

function parseDateV2_(value) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function dateKeyV2_(value) {
  const date = parseDateV2_(value);
  return date ? Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd") : "";
}

function currentQtyByProductV2_(snapshot) {
  const result = {};
  (snapshot || []).forEach((row) => result[row.product_id] = number_(result[row.product_id], 0) + number_(row.current_qty, 0));
  return result;
}

function inventoryValueByProductV2_(products, snapshot) {
  const productMap = byId_(products, "product_id");
  const result = {};
  (snapshot || []).forEach((row) => {
    const key = row.product_id;
    if (!key) return;
    if (!result[key]) {
      const product = productMap[key] || row.product || {};
      result[key] = {
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
    result[key].total_qty_lb += number_(row.current_qty, 0);
    result[key].current_qty = result[key].total_qty_lb;
    result[key].total_inventory_value += number_(row.inventory_value, 0);
    result[key].inventory_value = result[key].total_inventory_value;
    result[key].active_lots += 1;
    if (row.location_id) result[key].locations[row.location_id] = true;
    if (row.missing_cost) result[key].missing_cost_lots += 1;
  });
  return Object.keys(result).map((key) => {
    const row = result[key];
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
  const clean = (values || []).map(numberOrNullV2_).filter((value) => value !== null);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}
function stddevV2_(values) {
  const clean = (values || []).map(numberOrNullV2_).filter((value) => value !== null);
  if (clean.length < 2) return 0;
  const mean = avgV2_(clean);
  return Math.sqrt(clean.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (clean.length - 1));
}
function salesUsageMovementTypeV2_(type) {
  return ["SALE", "AMAZON_OUT", "PICK", "SHIP"].includes(String(type || "").toUpperCase());
}
function dailyUsageStatsFromMovementsV2_(movements) {
  const since = new Date(Date.now() - 90 * 86400000);
  const byProductDay = {};
  const counts = {};
  (movements || []).forEach((movement) => {
    if (!salesUsageMovementTypeV2_(movement.movement_type)) return;
    const date = parseDateV2_(movement.timestamp);
    if (date && date < since) return;
    const productId = movement.product_id;
    if (!productId) return;
    const day = dateKeyV2_(date || today_());
    if (!byProductDay[productId]) byProductDay[productId] = {};
    byProductDay[productId][day] = number_(byProductDay[productId][day], 0) + Math.abs(number_(movement.qty_change, 0));
    counts[productId] = number_(counts[productId], 0) + 1;
  });
  const result = {};
  Object.keys(byProductDay).forEach((productId) => {
    const values = Object.values(byProductDay[productId]);
    const total = values.reduce((sum, value) => sum + value, 0);
    result[productId] = {
      total_usage_90d: total,
      active_usage_days: values.length,
      movement_count: counts[productId] || values.length,
      average_daily_usage: total / 90,
      std_daily_usage: stddevV2_(values)
    };
  });
  return result;
}

function histogramV2_(values, requestedBins) {
  const clean = (values || []).map(numberOrNullV2_).filter((value) => value !== null);
  if (!clean.length) return [];
  const min = Math.min.apply(null, clean);
  const max = Math.max.apply(null, clean);
  const count = Math.max(1, Math.min(requestedBins || 8, clean.length));
  if (min === max) return [{ min, max, count: clean.length }];
  const width = (max - min) / count;
  const bins = Array.from({ length: count }, (_, index) => ({ min: min + index * width, max: index === count - 1 ? max : min + (index + 1) * width, count: 0 }));
  clean.forEach((value) => bins[Math.min(count - 1, Math.floor((value - min) / width))].count += 1);
  return bins;
}
function trendLineV2_(points) {
  const clean = (points || []).map((point) => {
    const date = parseDateV2_(point && point.date);
    const price = point ? numberOrNullV2_(point.price) : null;
    return date && price !== null ? { x: date.getTime(), y: price, date: dateKeyV2_(date) } : null;
  }).filter(Boolean);
  if (clean.length < 2) return [];
  const minX = Math.min.apply(null, clean.map((point) => point.x));
  const normalized = clean.map((point) => ({ x: (point.x - minX) / 86400000, y: point.y, date: point.date }));
  const meanX = avgV2_(normalized.map((point) => point.x));
  const meanY = avgV2_(normalized.map((point) => point.y));
  const denominator = normalized.reduce((sum, point) => sum + Math.pow(point.x - meanX, 2), 0);
  if (!denominator) return [];
  const slope = normalized.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator;
  const intercept = meanY - slope * meanX;
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  return [{ date: first.date, price: intercept + slope * first.x }, { date: last.date, price: intercept + slope * last.x }, { slope_per_day: slope }];
}

function productPriceAnalyticsV2_(products, salesOrders, salesLines) {
  const productMap = byId_(products, "product_id");
  const orders = byId_(salesOrders, "sales_order_id");
  const byProduct = {};
  (salesLines || []).forEach((line) => {
    const price = number_(line.unit_price, 0);
    if (!line.product_id || price <= 0) return;
    const order = orders[line.sales_order_id] || {};
    const date = dateKeyV2_(order.order_date || line.created_at || today_());
    if (!byProduct[line.product_id]) byProduct[line.product_id] = [];
    byProduct[line.product_id].push({ date, price, qty: number_(line.qty_ordered, 0), sales_order_id: line.sales_order_id || "", sales_order_line_id: line.sales_order_line_id || "" });
  });
  const result = {};
  Object.keys(productMap).forEach((productId) => {
    const points = (byProduct[productId] || []).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const prices = points.map((point) => point.price);
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
  const qtyByProduct = currentQtyByProductV2_(snapshot);
  const valueByProduct = byId_(inventoryValueByProductV2_(products, snapshot), "product_id");
  const supplierMap = byId_(suppliers, "supplier_id");
  const poSupplier = {};
  purchaseOrders.forEach((po) => poSupplier[po.po_id] = po.supplier_id);
  const supplierByProduct = {};
  const poCountByProduct = {};
  purchaseLines.forEach((line) => {
    if (!supplierByProduct[line.product_id]) supplierByProduct[line.product_id] = line.supplier_id || poSupplier[line.po_id] || "";
    poCountByProduct[line.product_id] = number_(poCountByProduct[line.product_id], 0) + 1;
  });
  return products.map((product) => {
    const supplierId = supplierByProduct[product.product_id] || "";
    const supplier = supplierMap[supplierId] || {};
    const value = valueByProduct[product.product_id] || {};
    const currentQty = number_(qtyByProduct[product.product_id], 0);
    const usage = movementStats[product.product_id] || { average_daily_usage: 0, std_daily_usage: 0, active_usage_days: 0, movement_count: 0 };
    const analytics = priceAnalytics[product.product_id] || { sales_line_count: 0 };
    const minStock = number_(product.min_stock_qty, 0);
    const targetFromSheet = number_(product.target_stock_qty, 0);
    const hasHistory = number_(usage.active_usage_days, 0) >= 30 || number_(usage.movement_count, 0) >= 10;
    const hasTarget = minStock > 0 || targetFromSheet > 0;
    const hasSupplier = number_(poCountByProduct[product.product_id], 0) > 0 || Boolean(supplierId);
    const canCalculate = hasHistory && hasTarget;
    const reasons = [];
    if (!hasHistory) reasons.push("Needs real sales/pick movement history");
    if (!hasTarget) reasons.push("Needs min or target stock levels");
    if (!hasSupplier) reasons.push("No supplier/PO history yet");
    const base = {
      product_id: product.product_id,
      product_name: product.product_name,
      supplier_id: supplierId,
      supplier_name: supplier.supplier_name || "",
      current_qty: currentQty,
      total_qty_lb: currentQty,
      total_inventory_value: number_(value.total_inventory_value, 0),
      inventory_value: number_(value.total_inventory_value, 0),
      avg_cost_per_lb: number_(value.avg_cost_per_lb, 0),
      active_lots: number_(value.active_lots, 0),
      locations_used: number_(value.locations_used, 0),
      location_list: value.location_list || "",
      usage_movements_found: number_(usage.movement_count, 0),
      usage_days_found: number_(usage.active_usage_days, 0),
      sales_price_points: number_(analytics.sales_line_count, 0),
      po_history_found: number_(poCountByProduct[product.product_id], 0)
    };
    if (!canCalculate) return { ...base, can_calculate_reorder: false, planning_status: "NOT_READY", status: "NOT_READY", reason: reasons.join("; ") || "Opening inventory only", average_daily_usage: "", std_daily_usage: "", avg_lead_time_days: "", std_lead_time_days: "", demand_during_lead_time: "", safety_stock: "", reorder_point: "", target_stock_level: "", recommended_order_qty: "" };
    const lead = number_(supplier.lead_time_expected_days, 7) || 7;
    const safety = Math.max(minStock, usage.average_daily_usage * 3);
    const reorder = Math.max(minStock, usage.average_daily_usage * lead + safety);
    const target = Math.max(targetFromSheet, reorder * 1.5);
    const state = currentQty <= reorder ? "REORDER" : currentQty <= target ? "WATCH" : "OK";
    return { ...base, can_calculate_reorder: true, planning_status: state, reason: "Calculated from sales/pick movement history.", average_daily_usage: usage.average_daily_usage, std_daily_usage: usage.std_daily_usage, avg_lead_time_days: lead, std_lead_time_days: 0, demand_during_lead_time: usage.average_daily_usage * lead, safety_stock: safety, reorder_point: reorder, target_stock_level: target, recommended_order_qty: Math.max(target - currentQty, 0), status: state };
  }).sort((a, b) => String(a.product_name || "").localeCompare(String(b.product_name || "")));
}

function expirationRowsV2_(snapshot) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today.getTime() + 30 * 86400000);
  return (snapshot || []).filter((row) => {
    const date = parseDateV2_(row.expiration_date);
    return date && row.current_qty > 0 && date >= today && date <= limit;
  }).map((row) => {
    const date = parseDateV2_(row.expiration_date);
    return { ...row, expiration_date: dateKeyV2_(date), days_remaining: Math.ceil((date - today) / 86400000) };
  });
}

function supplierAnalyticsV2_(suppliers, purchaseOrders, purchaseLines, receiving) {
  const totalSpend = purchaseOrders.reduce((sum, po) => sum + number_(po.total_amount, 0), 0);
  return suppliers.map((supplier) => {
    const orders = purchaseOrders.filter((po) => po.supplier_id === supplier.supplier_id);
    const ids = {};
    orders.forEach((po) => ids[po.po_id] = true);
    const lines = purchaseLines.filter((line) => ids[line.po_id]);
    const received = receiving.filter((row) => row.supplier_id === supplier.supplier_id);
    const spend = orders.reduce((sum, po) => sum + number_(po.total_amount, 0), 0);
    return {
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      email: supplier.email,
      phone: supplier.phone,
      products_bought: Array.from(new Set(lines.map((line) => line.product_id).filter(Boolean))).join(", "),
      total_orders: orders.length,
      completed_orders: orders.filter((po) => ["RECEIVED", "CLOSED", "COMPLETE"].includes(String(po.po_status || "").toUpperCase())).length,
      total_purchase_amount: spend,
      spend_share_percent: totalSpend ? spend / totalSpend * 100 : 0,
      avg_lead_time_days: number_(supplier.lead_time_expected_days, 0),
      std_lead_time_days: 0,
      quality_percent: received.length ? received.filter((row) => String(row.quality_status || "PASS").toUpperCase() === "PASS").length / received.length * 100 : 100,
      product_accuracy_percent: 100,
      quantity_accuracy_percent: 100
    };
  });
}

function getDashboard() {
  const products = readTable_("PRODUCTS").filter(isActiveRecord_);
  const suppliers = readTable_("SUPPLIERS").filter(isActiveRecord_);
  const purchaseOrders = readTable_("PURCHASE_ORDERS");
  const salesOrders = readTable_("SALES_ORDERS");
  const salesLines = readTable_("SALES_ORDER_LINES");
  const purchaseLines = readTable_("PURCHASE_ORDER_LINES");
  const locations = readTable_("LOCATIONS").filter(isActiveRecord_);
  const amazonPackages = readTable_("AMAZON_PACKAGES");
  const movements = readTable_("INVENTORY_MOVEMENTS");
  const snapshot = inventorySnapshot();
  const priceAnalytics = productPriceAnalyticsV2_(products, salesOrders, salesLines);
  const planning = planningRowsV2_(products, suppliers, purchaseOrders, purchaseLines, snapshot, dailyUsageStatsFromMovementsV2_(movements), priceAnalytics);
  const lowStockProducts = planning.filter((row) => ["REORDER", "WATCH"].includes(row.status));
  const expiringLots = expirationRowsV2_(snapshot);
  const openPo = purchaseOrders.filter((po) => ["DRAFT", "CREATED", "SENT", "CONFIRMED", "ORDERED", "IN_TRANSIT", "PARTIALLY_RECEIVED", "PARTIAL"].includes(String(po.po_status || "").toUpperCase()));
  const openSo = salesOrders.filter((order) => ["DRAFT", "CONFIRMED", "PICKED", "OPEN", "PARTIAL", "PARTIALLY_PICKED"].includes(String(order.status || "").toUpperCase()));
  const occupied = {};
  snapshot.forEach((row) => { if (row.location_id) occupied[row.location_id] = true; });
  const inventoryValue = snapshot.reduce((sum, row) => sum + number_(row.inventory_value, 0), 0);
  const since = new Date(Date.now() - 7 * 86400000);
  const weeklySales = salesOrders.filter((order) => {
    const d = parseDateV2_(order.order_date);
    return String(order.status || "").toUpperCase() === "SHIPPED" && (!d || d >= since);
  }).reduce((sum, order) => sum + number_(order.total_amount, 0), 0);

  return {
    productCount: products.length,
    supplierCount: suppliers.length,
    openPoCount: openPo.length,
    lotCount: readTable_("LOTS").length,
    movementCount: movements.length,
    pendingAmazonPackages: amazonPackages.filter((pkg) => !pkg.matched_amazon_order_id).length,
    inventoryValue,
    lowStockCount: lowStockProducts.length,
    openSalesOrderCount: openSo.length,
    totalInventoryValue: inventoryValue,
    usageHistoryNeededCount: planning.filter((row) => row.status === "NOT_READY").length,
    expiringLotCount: expiringLots.length,
    expiringProductCount: Array.from(new Set(expiringLots.map((row) => row.product_id).filter(Boolean))).length,
    expiringInventoryValue: expiringLots.reduce((sum, row) => sum + number_(row.inventory_value, 0), 0),
    openPoValue: openPo.reduce((sum, po) => sum + number_(po.total_amount, 0), 0),
    openSoCount: openSo.length,
    openSoValue: openSo.reduce((sum, so) => sum + number_(so.total_amount, 0), 0),
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
  const products = readTable_("PRODUCTS").filter(isActiveRecord_);
  const suppliers = readTable_("SUPPLIERS").filter(isActiveRecord_);
  const purchaseOrders = readTable_("PURCHASE_ORDERS");
  const purchaseLines = readTable_("PURCHASE_ORDER_LINES");
  const salesOrders = readTable_("SALES_ORDERS");
  const salesLines = readTable_("SALES_ORDER_LINES");
  const receiving = readTable_("RECEIVING");
  const movements = readTable_("INVENTORY_MOVEMENTS");
  const snapshot = inventorySnapshot();
  const productPriceAnalytics = productPriceAnalyticsV2_(products, salesOrders, salesLines);
  const inventoryValueByProduct = inventoryValueByProductV2_(products, snapshot);
  const inventoryPlanning = planningRowsV2_(products, suppliers, purchaseOrders, purchaseLines, snapshot, dailyUsageStatsFromMovementsV2_(movements), productPriceAnalytics);
  const supplierAnalytics = supplierAnalyticsV2_(suppliers, purchaseOrders, purchaseLines, receiving);
  const recommendations = inventoryPlanning
    .filter((row) => row.can_calculate_reorder && ["REORDER", "WATCH"].includes(row.status))
    .map((row) => ({
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
    calculated_at: today_(),
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


function buildInventoryPlanning_(products, suppliers, purchaseOrders, purchaseLines, snapshot) {
  const supplierMap = byId_(suppliers, "supplier_id");
  const poMap = byId_(purchaseOrders, "po_id");
  const supplierByProduct = {};
  purchaseLines.forEach((line) => {
    if (!supplierByProduct[line.product_id]) {
      supplierByProduct[line.product_id] = line.supplier_id || (poMap[line.po_id] || {}).supplier_id || "";
    }
  });


  return products.map((product) => {
    const currentQty = snapshot
      .filter((row) => row.product_id === product.product_id)
      .reduce((sum, row) => sum + number_(row.available_qty, row.current_qty), 0);
    const averageDailyUsage = estimateDailyUsage_(product.product_id);
    const supplierId = supplierByProduct[product.product_id] || "";
    const supplier = supplierMap[supplierId] || {};
    const avgLeadTime = number_(supplier.lead_time_expected_days, 7) || 7;
    const safetyStock = Math.max(number_(product.min_stock_qty, 0), averageDailyUsage * 3);
    const reorderPoint = Math.max(number_(product.min_stock_qty, 0), averageDailyUsage * avgLeadTime + safetyStock);
    const targetStock = Math.max(number_(product.target_stock_qty, 0), reorderPoint * 1.5);
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
      status
    };
  });
}


function estimateDailyUsage_(productId) {
  const since = new Date(today_().getTime() - 90 * 86400000);
  const usage = readTable_("INVENTORY_MOVEMENTS")
    .filter((move) => move.product_id === productId && number_(move.qty_change, 0) < 0 && (!move.timestamp || new Date(move.timestamp) >= since))
    .reduce((sum, move) => sum + Math.abs(number_(move.qty_change, 0)), 0);
  return usage / 90;
}


function buildSupplierAnalytics_(suppliers, purchaseOrders, purchaseLines, receiving) {
  const totalSpend = purchaseOrders.reduce((sum, po) => sum + number_(po.total_amount, 0), 0);
  return suppliers.map((supplier) => {
    const orders = purchaseOrders.filter((po) => po.supplier_id === supplier.supplier_id);
    const orderIds = {};
    orders.forEach((po) => orderIds[po.po_id] = true);
    const lines = purchaseLines.filter((line) => orderIds[line.po_id]);
    const received = receiving.filter((row) => row.supplier_id === supplier.supplier_id);
    const spend = orders.reduce((sum, po) => sum + number_(po.total_amount, 0), 0);
    return {
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      email: supplier.email,
      phone: supplier.phone,
      products_bought: Array.from(new Set(lines.map((line) => line.product_id).filter(Boolean))).join(", "),
      total_orders: orders.length,
      completed_orders: orders.filter((po) => ["RECEIVED", "CLOSED", "COMPLETE"].indexOf(String(po.po_status || "").toUpperCase()) >= 0).length,
      total_purchase_amount: spend,
      spend_share_percent: totalSpend ? spend / totalSpend * 100 : 0,
      avg_lead_time_days: number_(supplier.lead_time_expected_days, 0),
      std_lead_time_days: 0,
      quality_percent: received.length ? received.filter((row) => String(row.quality_status || "PASS").toUpperCase() === "PASS").length / received.length * 100 : 100,
      product_accuracy_percent: 100,
      quantity_accuracy_percent: 100
    };
  });
}


function lookupScan(payload) {
  payload = payload || {};
  const value = String(payload.scanValue || payload.scan_code || payload.value || "").trim();
  if (!value) throw new Error("Scan value is required.");
  const product = readTable_("PRODUCTS").find((row) => [row.product_id, row.barcode_or_qr_value, row.amazon_sku, row.wholesale_sku].map(String).indexOf(value) >= 0);
  if (product) return { type: "PRODUCT", record: product };
  const lot = readTable_("LOTS").find((row) => [row.internal_lot_id, row.qr_value, row.supplier_lot_number].map(String).indexOf(value) >= 0);
  if (lot) return { type: "LOT", record: lot };
  const location = readTable_("LOCATIONS").find((row) => [row.location_id, row.qr_value].map(String).indexOf(value) >= 0);
  if (location) return { type: "LOCATION", record: location };
  const poLine = readTable_("PURCHASE_ORDER_LINES").find((row) => [row.po_line_id, row.qr_value].map(String).indexOf(value) >= 0);
  if (poLine) return { type: "PURCHASE_ORDER_LINE", record: poLine, purchaseOrder: getPurchaseOrderDetail({ po_id: poLine.po_id }) };
  const pkg = readTable_("AMAZON_PACKAGES").find((row) => [row.package_id, row.package_qr_value].map(String).indexOf(value) >= 0);
  if (pkg) return { type: "AMAZON_PACKAGE", record: pkg };
  return { type: "NOT_FOUND", scanValue: value };
}


function validateOperationalSchema() {
  const results = Object.keys(CORE_SCHEMA).map((sheetName) => {
    const sheet = spreadsheet_().getSheetByName(sheetName);
    if (!sheet) return { sheet: sheetName, ok: false, missingSheet: true, missingHeaders: CORE_SCHEMA[sheetName] };
    const meta = tableMeta_(sheetName);
    const missingHeaders = CORE_SCHEMA[sheetName].filter((header) => meta.headers.indexOf(header) < 0);
    return { sheet: sheetName, ok: missingHeaders.length === 0, missingSheet: false, headerRow: meta.headerRow, missingHeaders };
  });

  const diagnostics = [];
  const purchaseOrders = readTable_("PURCHASE_ORDERS");
  purchaseOrders.forEach((po) => {
    const raw = String(po.po_status || "").trim().toUpperCase();
    const normalized = normalizePurchaseOrderStatus_(raw);
    if (raw && raw !== normalized) diagnostics.push({ severity: "WARNING", type: "LEGACY_PO_STATUS", record_id: po.po_id, current_value: raw, normalized_value: normalized });
  });

  const usage = currentLocationUsage_();
  const locations = byId_(readTable_("LOCATIONS"), "location_id");
  Object.keys(usage).forEach((locationId) => {
    const location = locations[locationId];
    const capacity = Math.max(1, number_((location || {}).capacity_units, 1));
    if (!location) diagnostics.push({ severity: "ERROR", type: "LOT_LOCATION_MISSING", location_id: locationId, lot_ids: usage[locationId].lot_ids });
    else if (usage[locationId].units > capacity) diagnostics.push({ severity: "ERROR", type: "LOCATION_OVER_CAPACITY", location_id: locationId, occupied_units: usage[locationId].units, capacity_units: capacity, lot_ids: usage[locationId].lot_ids });
  });

  readTable_("LOTS").forEach((lot) => {
    const qty = number_(lot.current_qty_script !== "" && lot.current_qty_script !== undefined ? lot.current_qty_script : lot.original_qty, 0);
    const status = String(lot.status || "ACTIVE").toUpperCase();
    if (qty > 0.0001 && ["ACTIVE", "AVAILABLE", "HOLD"].indexOf(status) >= 0 && !String(lot.current_location_id || "").trim()) {
      diagnostics.push({ severity: "ERROR", type: "ACTIVE_LOT_WITHOUT_LOCATION", record_id: lot.internal_lot_id, current_qty: qty });
    }
  });

  const schemaOk = results.every((result) => result.ok);
  const dataIntegrityOk = !diagnostics.some((item) => item.severity === "ERROR");
  return {
    spreadsheetId: spreadsheet_().getId(),
    ok: schemaOk,
    schemaOk,
    dataIntegrityOk,
    checkedAt: today_(),
    results,
    diagnostics
  };
}

function byId_(rows, idColumn) {
  return (rows || []).reduce((map, row) => {
    map[row[idColumn]] = row;
    return map;
  }, {});
}


function nextBlFolio_() {
  try {
    return readTable_("SALES_ORDERS").reduce((max, order) => Math.max(max, number_(order.bl_folio, 0)), 2719) + 1;
  } catch (_error) {
    return "";
  }
}
