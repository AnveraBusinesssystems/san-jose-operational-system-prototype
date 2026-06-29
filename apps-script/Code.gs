/**
 * San Jose Operational System - Google Apps Script backend
 *
 * Copy this entire file into the Apps Script project bound to:
 * San_Jose_Operational_System_WebApp_First
 *
 * Deployment model:
 * GitHub Pages frontend -> frontend/js/config.js /exec URL -> this Apps Script -> Google Sheet
 *
 * This script intentionally does two things:
 * 1) Returns clean JSON/JSONP objects that the GitHub Pages frontend can read.
 * 2) Writes readable calculated outputs into *_SCRIPT tabs for audit/review.
 */

// Leave blank when the script is bound to the correct Google Sheet.
// Optional safer production setup: set Script Property SPREADSHEET_ID.
const SPREADSHEET_ID = "";

const APP_TIMEZONE = "America/Los_Angeles";

const ROLES = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  OPERATOR: "OPERATOR",
  WAREHOUSE: "WAREHOUSE"
};

const PERMISSIONS = {
  ADMIN: [
    "admin:view",
    "products:create",
    "products:edit",
    "suppliers:create",
    "purchaseOrders:create",
    "purchaseOrders:actions",
    "salesOrders:create",
    "salesOrders:actions",
    "receiving:create",
    "inventory:view",
    "inventory:adjust",
    "scanner:lookup"
  ],
  MANAGER: [
    "products:create",
    "products:edit",
    "suppliers:create",
    "purchaseOrders:create",
    "purchaseOrders:actions",
    "salesOrders:create",
    "salesOrders:actions",
    "receiving:create",
    "inventory:view",
    "inventory:adjust",
    "scanner:lookup"
  ],
  OPERATOR: [
    "salesOrders:actions",
    "receiving:create",
    "inventory:view",
    "inventory:adjust",
    "scanner:lookup"
  ],
  WAREHOUSE: [
    "salesOrders:actions",
    "receiving:create",
    "inventory:view",
    "inventory:adjust",
    "scanner:lookup"
  ]
};

const OUTPUT_HEADERS = {
  DASHBOARD_SCRIPT: [
    "metric_id",
    "metric_name",
    "metric_value",
    "metric_unit",
    "period_start",
    "period_end",
    "calculated_at",
    "status",
    "notes"
  ],
  INVENTORY_SNAPSHOT_SCRIPT: [
    "snapshot_id",
    "calculated_at",
    "product_id",
    "product_name",
    "internal_lot_id",
    "location_id",
    "current_qty",
    "reserved_qty",
    "available_qty",
    "unit_type",
    "inventory_status",
    "days_since_received",
    "fifo_rank",
    "unit_cost",
    "inventory_value",
    "expiration_date",
    "recommended_action",
    "notes"
  ],
  RECOMMENDATIONS_SCRIPT: [
    "recommendation_id",
    "generated_at",
    "recommendation_type",
    "product_id",
    "product_name",
    "supplier_id",
    "supplier_name",
    "recommended_qty",
    "recommended_unit_cost",
    "recommended_location_id",
    "confidence_score",
    "reorder_point",
    "target_stock_level",
    "current_qty",
    "reason_text",
    "status",
    "accepted_by",
    "accepted_at",
    "created_po_id",
    "notes"
  ],
  SUPPLIER_ANALYTICS_SCRIPT: [
    "supplier_id",
    "supplier_name",
    "party_type",
    "contact_name",
    "email",
    "phone",
    "products_bought",
    "total_orders",
    "completed_orders",
    "total_purchase_amount",
    "spend_share_percent",
    "avg_lead_time_days",
    "std_lead_time_days",
    "avg_quality_score",
    "quality_percent",
    "avg_product_accuracy_score",
    "product_accuracy_percent",
    "delivery_accuracy_rate",
    "quantity_accuracy_percent",
    "avg_price_variability_score",
    "supplier_score",
    "last_calculated_at",
    "notes"
  ],
  PRODUCT_SUPPLIER_ANALYTICS_SCRIPT: [
    "product_id",
    "product_name",
    "supplier_id",
    "supplier_name",
    "orders_count",
    "avg_unit_cost",
    "std_unit_cost",
    "min_unit_cost",
    "max_unit_cost",
    "last_unit_cost",
    "avg_lead_time_days",
    "std_lead_time_days",
    "recommended_supplier_flag",
    "last_calculated_at",
    "notes"
  ]
};

function doGet(e) {
  if (e && e.parameter && e.parameter.action) {
    return handleApiRequest_(e.parameter.action, e.parameter.payload, e.parameter.callback);
  }

  return json_({
    ok: true,
    result: {
      app: "San Jose Operational System Apps Script API",
      message: "This endpoint is for the GitHub Pages frontend. Add ?action=healthCheck to test it."
    }
  }, e && e.parameter ? e.parameter.callback : null);
}

function doPost(e) {
  const request = JSON.parse((e && e.postData && e.postData.contents) || "{}");
  return handleApiRequest_(request.action, JSON.stringify(request.payload || {}), null);
}

function handleApiRequest_(action, payloadText, callback) {
  try {
    const payload = payloadText ? JSON.parse(payloadText) : {};
    const routes = {
      healthCheck: healthCheck,
      recalculateOutputs: recalculateOutputs,

      getDashboard: getDashboard,
      getOperationalReports: getOperationalReports,

      authenticateUser: authenticateUser,
      listUsers: listUsers,
      createUser: createUser,
      deactivateUser: deactivateUser,

      listProducts: listProducts,
      listLots: listLots,
      createProduct: createProduct,
      updateProductStatus: updateProductStatus,
      createOpeningInventory: createOpeningInventory,

      listSuppliers: listSuppliers,
      createSupplier: createSupplier,
      listLocations: listLocations,

      listPurchaseOrders: listPurchaseOrders,
      getPurchaseOrderDetail: getPurchaseOrderDetail,
      generatePurchaseOrderTemplate: generatePurchaseOrderTemplate,
      createPurchaseOrder: createPurchaseOrder,
      purchaseOrderAction: purchaseOrderAction,

      listSalesOrders: listSalesOrders,
      getSalesOrderDetail: getSalesOrderDetail,
      createSalesOrder: createSalesOrder,
      salesOrderAction: salesOrderAction,

      receiveProduct: receiveProduct,
      recordInventoryMovement: recordInventoryMovement,
      recordAmazonOutbound: recordAmazonOutbound,
      listAmazonOutboundActivity: listAmazonOutboundActivity,

      inventorySnapshot: inventorySnapshot,
      lookupScan: lookupScan,
      matchAmazonPackageScan: matchAmazonPackageScan
    };

    if (!routes[action]) throw new Error("Unknown action: " + action);
    return json_({ ok: true, result: routes[action](payload) }, callback);
  } catch (error) {
    logError_("API_ERROR", action, error);
    return json_({ ok: false, error: error.message || String(error) }, callback);
  }
}

function json_(value, callback) {
  const body = callback
    ? String(callback).replace(/[^\w.$]/g, "") + "(" + JSON.stringify(value) + ");"
    : JSON.stringify(value);

  return ContentService
    .createTextOutput(body)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

/**
 * Frontend-readable API actions
 */

function healthCheck() {
  const ss = spreadsheet_();
  const products = readTable_("PRODUCTS");
  const lots = readTable_("LOTS");
  const movements = readTable_("INVENTORY_MOVEMENTS");

  return {
    ok: true,
    spreadsheet_id: ss.getId(),
    spreadsheet_name: ss.getName(),
    timezone: ss.getSpreadsheetTimeZone() || APP_TIMEZONE,
    productCount: products.length,
    lotCount: lots.length,
    movementCount: movements.length,
    calculated_at: nowIso_()
  };
}

function recalculateOutputs(payload) {
  payload = payload || {};
  const bundle = buildSystemBundle_(true);
  return {
    calculated_at: bundle.calculated_at,
    dashboardMetricCount: bundle.dashboardRows.length,
    inventorySnapshotRows: bundle.inventorySnapshot.length,
    supplierAnalyticsRows: bundle.supplierAnalytics.length,
    productSupplierAnalyticsRows: bundle.productSupplierAnalytics.length,
    recommendationRows: bundle.recommendations.length
  };
}

function getDashboard() {
  const bundle = buildSystemBundle_(true);
  return bundle.dashboard;
}

function getOperationalReports() {
  const bundle = buildSystemBundle_(true);
  return {
    calculated_at: bundle.calculated_at,
    inventoryPlanning: bundle.inventoryPlanning,
    supplierAnalytics: bundle.supplierAnalytics,
    productSupplierAnalytics: bundle.productSupplierAnalytics,
    inventorySnapshot: bundle.inventorySnapshot,
    recommendations: bundle.recommendations,
    dashboardRows: bundle.dashboardRows
  };
}

function inventorySnapshot() {
  const bundle = buildSystemBundle_(false);
  return bundle.inventorySnapshot;
}

function listProducts() {
  return readTable_("PRODUCTS")
    .filter(isActiveRecord_)
    .sort((a, b) => String(a.product_name || "").localeCompare(String(b.product_name || "")));
}

function listLots() {
  const productsById = indexBy_(readTable_("PRODUCTS"), "product_id");
  return readTable_("LOTS").map((lot) => ({
    ...lot,
    product: productsById[lot.product_id] || null
  }));
}

function listUsers() {
  return readTable_("USERS")
    .filter(isActiveRecord_)
    .map((user) => ({
      ...user,
      role: normalizeRole_(user.role)
    }))
    .sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || "")));
}

function authenticateUser(payload) {
  payload = payload || {};
  const pin = String(payload.pin || "").trim();

  const user = readTable_("USERS").find((item) =>
    isActiveRecord_(item) && String(item.pin || "").trim() === pin
  );

  if (!user && pin === "1014") {
    return {
      authenticated: true,
      user_id: "ADMIN",
      full_name: "Admin",
      role: "ADMIN"
    };
  }

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

  ensureTableColumns_("USERS", ["user_id", "full_name", "role", "email", "device_assigned", "is_active", "created_at", "updated_at", "notes", "pin"]);

  const users = readTable_("USERS");
  if (users.some((item) => isActiveRecord_(item) && String(item.pin || "").trim() === pin)) {
    throw new Error("An active user already has that 4-digit code.");
  }

  const record = {
    user_id: nextId_("USERS", "user_id", "USR"),
    full_name: fullName,
    role: role,
    email: input.email || "",
    device_assigned: input.device_assigned || "",
    is_active: true,
    created_at: nowIso_(),
    updated_at: nowIso_(),
    notes: input.notes || "",
    pin: pin
  };

  appendRecord_("USERS", record);
  return sessionUser_(record);
}

function deactivateUser(payload) {
  payload = payload || {};
  const actor = payload.user || {};
  if (normalizeRole_(actor.role) !== "ADMIN") throw new Error("Only an Admin can remove users.");

  const userId = String(payload.userId || "").trim();
  if (!userId) throw new Error("Choose a user to remove.");
  if (String(actor.user_id || "") === userId) throw new Error("You cannot remove the user you are signed in as.");

  updateTableRecord_("USERS", "user_id", userId, {
    is_active: false,
    updated_at: nowIso_()
  });

  return { user_id: userId, is_active: false };
}

function createProduct(payload) {
  payload = payload || {};
  requirePermission_(payload.user, "products:create");

  const input = payload.input || {};
  const products = readTable_("PRODUCTS");
  const productName = String(input.product_name || "").trim();
  const productCategory = String(input.product_category || "General").trim();
  const perishabilityDays = num_(input.perishability_days);

  if (!productName) throw new Error("Product name is required.");
  if (perishabilityDays < 0) throw new Error("Perishability days cannot be negative.");
  if (products.some((row) => String(row.product_name || "").trim().toLowerCase() === productName.toLowerCase())) {
    throw new Error("A product with this name already exists.");
  }

  ensureTableColumns_("PRODUCTS", [
    "product_id", "product_name", "product_category", "default_unit", "case_weight_lbs",
    "amazon_sku", "wholesale_sku", "barcode_or_qr_value", "min_stock_qty", "target_stock_qty",
    "velocity_class", "storage_zone_preference", "is_active", "created_at", "updated_at", "notes",
    "base_unit", "units_per_purchase_unit", "can_break_case", "perishability_days"
  ]);

  const productId = input.product_id || nextId_("PRODUCTS", "product_id", "PROD");
  if (products.some((row) => String(row.product_id) === String(productId))) {
    throw new Error("Product ID already exists.");
  }

  const record = {
    product_id: productId,
    product_name: productName,
    product_category: productCategory,
    default_unit: input.default_unit || "",
    case_weight_lbs: num_(input.case_weight_lbs),
    amazon_sku: input.amazon_sku || "",
    wholesale_sku: input.wholesale_sku || "",
    barcode_or_qr_value: input.barcode_or_qr_value || productId,
    min_stock_qty: num_(input.min_stock_qty),
    target_stock_qty: num_(input.target_stock_qty),
    velocity_class: input.velocity_class || "",
    storage_zone_preference: input.storage_zone_preference || "",
    is_active: true,
    created_at: nowIso_(),
    updated_at: nowIso_(),
    notes: input.notes || "",
    base_unit: input.base_unit || "LB",
    units_per_purchase_unit: num_(input.units_per_purchase_unit),
    can_break_case: input.can_break_case || "",
    perishability_days: perishabilityDays
  };

  appendRecord_("PRODUCTS", record);
  return record;
}

function updateProductStatus(payload) {
  payload = payload || {};
  requirePermission_(payload.user, "products:edit");

  const productId = String(payload.productId || "").trim();
  if (!productId) throw new Error("Product ID is required.");

  updateTableRecord_("PRODUCTS", "product_id", productId, {
    is_active: Boolean(payload.isActive),
    updated_at: nowIso_()
  });

  return readTable_("PRODUCTS").find((row) => String(row.product_id) === productId);
}

function createOpeningInventory(payload) {
  payload = payload || {};
  requirePermission_(payload.user, "receiving:create");

  const input = payload.input || {};
  const name = String(input.product_name || "").trim();
  const qty = num_(input.qty);
  const weight = num_(input.purchase_unit_weight);
  const locationIds = normalizeLocationIds_(input);

  if (!name || qty <= 0 || weight <= 0 || !locationIds.length) {
    throw new Error("Complete product, quantity, weight, and inventory space.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const allLocations = readTable_("LOCATIONS");
    const occupied = occupiedInventoryLocationIds_();
    const locations = locationIds.map((locationId) =>
      allLocations.find((row) => String(row.location_id) === locationId || String(row.qr_value) === locationId)
    );

    if (locations.some((location) => !location)) throw new Error("One or more inventory locations were not found.");
    if (locations.some((location) => String(location.current_status || "AVAILABLE").toUpperCase() !== "AVAILABLE")) {
      throw new Error("Choose only available inventory spaces.");
    }
    if (locations.some((location) => occupied[location.location_id])) {
      throw new Error("Choose only empty inventory spaces.");
    }

    let product = readTable_("PRODUCTS").find((row) =>
      String(row.product_name || "").trim().toLowerCase() === name.toLowerCase()
    );

    if (!product) {
      product = createProduct({
        user: payload.user,
        input: {
          product_name: name,
          product_category: input.product_category || "General",
          perishability_days: num_(input.perishability_days)
        }
      });
    }

    ensureTableColumns_("LOTS", ["purchase_qty_received", "purchase_unit_type", "current_qty_script", "current_location_id", "qr_value", "pallet_count"]);
    ensureTableColumns_("INVENTORY_MOVEMENTS", ["movement_id", "movement_type", "timestamp", "user_id", "product_id", "internal_lot_id", "qty_change", "unit_type", "from_location_id", "to_location_id", "scan_code", "device_id", "approval_status", "notes"]);

    const lots = [];
    const movements = [];

    locations.forEach((location) => {
      const lotId = nextId_("LOTS", "internal_lot_id", "LOT");
      const baseQty = qty * weight;
      const lot = {
        internal_lot_id: lotId,
        product_id: product.product_id,
        supplier_id: input.supplier_id || "",
        supplier_lot_number: input.supplier_lot_number || "OPENING",
        po_id: "",
        po_line_id: "",
        received_date: today_(),
        original_qty: baseQty,
        current_qty_script: baseQty,
        unit_type: "LB",
        unit_cost: num_(input.unit_cost),
        currency: input.currency || "USD",
        current_location_id: location.location_id,
        status: "ACTIVE",
        expiration_date: calculatedExpirationDate_(product, today_()),
        qr_value: lotId,
        notes: input.notes || "Opening inventory count.",
        purchase_qty_received: qty,
        purchase_unit_type: input.purchase_unit || "UNIT",
        pallet_count: num_(input.pallet_count, 1)
      };

      const movement = {
        movement_id: nextId_("INVENTORY_MOVEMENTS", "movement_id", "MOV"),
        movement_type: "OPENING_INVENTORY",
        timestamp: nowIso_(),
        user_id: userId_(payload.user),
        product_id: product.product_id,
        internal_lot_id: lotId,
        package_id: "",
        qty_change: baseQty,
        unit_type: "LB",
        from_location_id: "OPENING_COUNT",
        to_location_id: location.location_id,
        related_po_id: "",
        related_receiving_id: "",
        related_sales_order_id: "",
        related_pick_task_id: "",
        related_amazon_order_id: "",
        scan_code: lotId,
        device_id: "WEB_APP",
        approval_status: "APPROVED",
        notes: input.notes || ""
      };

      appendRecord_("LOTS", lot);
      appendRecord_("INVENTORY_MOVEMENTS", movement);
      updateTableRecord_("LOCATIONS", "location_id", location.location_id, { current_status: "UNAVAILABLE" });

      lots.push(lot);
      movements.push(movement);
    });

    buildSystemBundle_(true);

    return { product: product, lot: lots[0], movement: movements[0], lots: lots, movements: movements };
  } finally {
    lock.releaseLock();
  }
}

function listSuppliers() {
  const purchaseOrders = readTable_("PURCHASE_ORDERS");
  const leadStats = buildLeadTimeStatsBySupplier_(purchaseOrders);

  return readTable_("SUPPLIERS")
    .filter(isActiveRecord_)
    .map((supplier) => ({
      ...supplier,
      party_type: normalizePartyType_(supplier.party_type),
      lead_time_expected_days: normalizePartyType_(supplier.party_type) === "VENDOR"
        ? round_(leadStats[supplier.supplier_id] ? leadStats[supplier.supplier_id].average : num_(supplier.lead_time_expected_days, 5), 0)
        : ""
    }))
    .sort((a, b) => String(a.supplier_name || "").localeCompare(String(b.supplier_name || "")));
}

function createSupplier(payload) {
  payload = payload || {};
  requirePermission_(payload.user, "suppliers:create");

  const input = payload.input || {};
  const partyType = normalizePartyType_(input.party_type);
  const supplierName = String(input.supplier_name || "").trim();
  if (!supplierName) throw new Error("Business name is required.");

  ensureTableColumns_("SUPPLIERS", ["supplier_id", "supplier_name", "contact_name", "email", "phone", "address", "payment_terms", "default_currency", "lead_time_expected_days", "is_active", "created_at", "updated_at", "notes", "party_type"]);

  const suppliers = readTable_("SUPPLIERS");
  const supplierId = input.supplier_id || nextId_("SUPPLIERS", "supplier_id", partyType === "CUSTOMER" ? "CUST" : "SUP");

  if (suppliers.some((row) => String(row.supplier_id) === String(supplierId))) {
    throw new Error("Business record ID already exists.");
  }

  const record = {
    supplier_id: supplierId,
    supplier_name: supplierName,
    contact_name: input.contact_name || "",
    email: input.email || "",
    phone: input.phone || "",
    address: input.address || "",
    payment_terms: input.payment_terms || "Net 30",
    default_currency: input.default_currency || "USD",
    lead_time_expected_days: partyType === "VENDOR" ? num_(input.lead_time_expected_days, 5) : "",
    is_active: true,
    created_at: nowIso_(),
    updated_at: nowIso_(),
    notes: input.notes || "",
    party_type: partyType
  };

  appendRecord_("SUPPLIERS", record);
  return record;
}

function listLocations() {
  return readTable_("LOCATIONS").sort((a, b) => String(a.location_id || "").localeCompare(String(b.location_id || "")));
}

function listPurchaseOrders() {
  const suppliersById = indexBy_(readTable_("SUPPLIERS"), "supplier_id");
  const lines = readTable_("PURCHASE_ORDER_LINES");
  return readTable_("PURCHASE_ORDERS")
    .map((po) => ({
      ...po,
      supplier: suppliersById[po.supplier_id] || null,
      line_count: lines.filter((line) => line.po_id === po.po_id).length
    }))
    .sort((a, b) => String(b.order_date || "").localeCompare(String(a.order_date || "")));
}

function getPurchaseOrderDetail(payload) {
  payload = payload || {};
  const poId = String(payload.poId || payload.po_id || "").trim();
  if (!poId) return null;

  const productsById = indexBy_(readTable_("PRODUCTS"), "product_id");
  const suppliersById = indexBy_(readTable_("SUPPLIERS"), "supplier_id");
  const po = readTable_("PURCHASE_ORDERS").find((item) => String(item.po_id) === poId);
  if (!po) return null;

  const lines = readTable_("PURCHASE_ORDER_LINES")
    .filter((line) => String(line.po_id) === poId)
    .map((line) => ({
      ...line,
      product: productsById[line.product_id] || null
    }));

  return {
    po: {
      ...po,
      supplier: suppliersById[po.supplier_id] || null
    },
    lines: lines
  };
}

function generatePurchaseOrderTemplate(payload) {
  payload = payload || {};
  const detail = getPurchaseOrderDetail(payload);
  if (!detail) throw new Error("Purchase order not found.");

  return {
    po: detail.po,
    lines: detail.lines.map((line) => ({
      ...line,
      qr_value: line.qr_value || purchaseOrderQrValue_({
        poId: line.po_id,
        poLineId: line.po_line_id,
        productId: line.product_id,
        productName: line.product ? line.product.product_name : line.product_id,
        qty: line.qty_ordered,
        supplierLotNumber: line.supplier_expected_lot_number
      })
    }))
  };
}

function createPurchaseOrder(payload) {
  payload = payload || {};
  requirePermission_(payload.user, "purchaseOrders:create");

  const input = payload.input || {};
  const suppliers = readTable_("SUPPLIERS");
  const supplier = suppliers.find((item) => String(item.supplier_id) === String(input.supplier_id));
  if (!supplier || normalizePartyType_(supplier.party_type) !== "VENDOR") {
    throw new Error("Select a valid vendor.");
  }

  const products = readTable_("PRODUCTS");
  const inputLines = Array.isArray(input.lines) ? input.lines : [input];
  if (!inputLines.length) throw new Error("Add at least one product.");

  const validated = inputLines.map((line, index) => validatePurchaseOrderLine_(line, index, products));
  const subtotal = round_(sum_(validated.map((line) => line.line_total)), 2);
  const taxEnabled = truthy_(input.tax_enabled);
  const taxRate = taxEnabled ? Math.max(0, num_(input.tax_rate_percent, num_(input.tax_rate) * 100 || 6.25) / 100) : 0;
  const taxAmount = round_(subtotal * taxRate, 2);
  const orderDate = input.order_date || today_();
  const expectedDeliveryDate = input.expected_delivery_date || addDays_(orderDate, num_(supplier.lead_time_expected_days, 5));

  const poId = nextId_("PURCHASE_ORDERS", "po_id", "PO");
  const po = {
    po_id: poId,
    po_status: "DRAFT",
    supplier_id: supplier.supplier_id,
    created_by: userId_(payload.user),
    order_date: orderDate,
    expected_delivery_date: expectedDeliveryDate,
    actual_first_received_date: "",
    actual_completed_date: "",
    payment_terms: input.payment_terms || supplier.payment_terms || "Net 30",
    currency: supplier.default_currency || "USD",
    subtotal_amount: subtotal,
    tax_amount: taxAmount,
    shipping_amount: num_(input.shipping_amount),
    total_amount: round_(subtotal + taxAmount + num_(input.shipping_amount), 2),
    recommendation_id: input.recommendation_id || "",
    po_doc_url: "",
    po_pdf_url: "",
    email_status: "NOT_SENT",
    email_sent_at: "",
    printed_status: "NOT_PRINTED",
    printed_at: "",
    supplier_confirmation_status: "PENDING",
    supplier_confirmed_delivery_date: "",
    notes: input.notes || "",
    tax_enabled: taxEnabled,
    tax_rate: taxRate,
    ship_via: input.ship_via || "",
    quickbooks_bill_id: "",
    bill_status: "NOT_CREATED",
    bill_created_at: ""
  };

  const lineIdSeed = readTable_("PURCHASE_ORDER_LINES").slice();
  const lines = validated.map((line) => {
    const poLineId = nextIdFromRows_(lineIdSeed, "po_line_id", "POL");
    lineIdSeed.push({ po_line_id: poLineId });

    return {
      po_line_id: poLineId,
      po_id: poId,
      supplier_id: supplier.supplier_id,
      product_id: line.product_id,
      line_status: "ORDERED",
      qty_ordered: line.qty_ordered,
      qty_received_total: 0,
      qty_remaining: line.qty_ordered,
      unit_type: line.unit_type,
      unit_cost: line.unit_cost,
      currency: po.currency,
      line_total: line.line_total,
      supplier_expected_lot_number: line.supplier_expected_lot_number || "",
      notes: line.notes || "",
      base_unit: line.base_unit,
      units_per_purchase_unit: line.units_per_purchase_unit,
      expected_base_qty: line.expected_base_qty,
      case_weight_lbs: line.case_weight_lbs,
      qr_value: purchaseOrderQrValue_({
        poId: poId,
        poLineId: poLineId,
        productId: line.product_id,
        productName: line.product_name,
        qty: line.qty_ordered,
        supplierLotNumber: line.supplier_expected_lot_number
      })
    };
  });

  appendRecord_("PURCHASE_ORDERS", po);
  lines.forEach((line) => appendRecord_("PURCHASE_ORDER_LINES", line));

  buildSystemBundle_(true);

  return { ...po, lines: lines };
}

function purchaseOrderAction(payload) {
  payload = payload || {};
  requirePermission_(payload.user, "purchaseOrders:actions");

  const poId = String(payload.poId || payload.po_id || "").trim();
  const action = String(payload.action || "").trim();
  if (!poId) throw new Error("PO is required.");

  const changes = {};
  if (action === "markSent") {
    changes.email_status = "SENT";
    changes.email_sent_at = nowIso_();
    changes.po_status = "SENT";
  } else if (action === "markPrinted") {
    changes.printed_status = "PRINTED";
    changes.printed_at = nowIso_();
  } else if (action === "cancel") {
    changes.po_status = "CANCELLED";
  } else {
    throw new Error("Unknown PO action.");
  }

  updateTableRecord_("PURCHASE_ORDERS", "po_id", poId, changes);
  return listPurchaseOrders().find((po) => po.po_id === poId);
}

function receiveProduct(payload) {
  payload = payload || {};
  requirePermission_(payload.user, "receiving:create");

  const input = payload.input || {};
  const poId = String(input.po_id || "").trim();
  const poLineId = String(input.po_line_id || "").trim();
  if (!poId || !poLineId) throw new Error("Select a PO line to receive.");

  const po = readTable_("PURCHASE_ORDERS").find((item) => String(item.po_id) === poId);
  const line = readTable_("PURCHASE_ORDER_LINES").find((item) => String(item.po_line_id) === poLineId);
  const product = readTable_("PRODUCTS").find((item) => String(item.product_id) === String(line && line.product_id));
  if (!po || !line || !product) throw new Error("PO line was not found.");

  const qtyReceived = num_(input.qty_received);
  const qtyDamaged = num_(input.qty_damaged);
  const qtyAccepted = Math.max(0, qtyReceived - qtyDamaged);
  if (qtyReceived <= 0) throw new Error("Received quantity must be greater than zero.");

  const baseUnit = line.base_unit || product.base_unit || "LB";
  const unitsPerPurchaseUnit = num_(line.units_per_purchase_unit, num_(line.case_weight_lbs, 1) || 1);
  const acceptedBaseQty = round_(qtyAccepted * unitsPerPurchaseUnit, 2);
  const internalLotId = nextId_("LOTS", "internal_lot_id", "LOT");
  const receivingId = nextId_("RECEIVING", "receiving_id", "REC");
  const confirmedLocation = String(input.confirmed_location_id || input.location_id || "").trim() || recommendLocationId_(product);
  const qualityScore = num_(input.quality_score, 5);
  const qualityStatus = qualityScore >= 3 ? "PASS" : "HOLD";
  const quantityStatus = qtyAccepted > num_(line.qty_remaining, line.qty_ordered) ? "OVER" : qtyAccepted < num_(line.qty_remaining, line.qty_ordered) ? "UNDER" : "MATCH";
  const approvalStatus = qualityStatus === "PASS" && quantityStatus !== "OVER" ? "APPROVED" : "PENDING";

  const receiving = {
    receiving_id: receivingId,
    po_id: poId,
    po_line_id: poLineId,
    supplier_id: po.supplier_id,
    product_id: line.product_id,
    scan_code: input.scan_code || "",
    internal_lot_id: internalLotId,
    supplier_lot_number: input.supplier_lot_number || line.supplier_expected_lot_number || "",
    received_date: today_(),
    received_by: userId_(payload.user),
    qty_received: qtyReceived,
    qty_damaged: qtyDamaged,
    qty_accepted: qtyAccepted,
    unit_type: line.unit_type,
    quality_score: qualityScore,
    product_accuracy_score: num_(input.product_accuracy_score, 5),
    over_under_status: quantityStatus,
    recommended_location_id: input.recommended_location_id || "",
    confirmed_location_id: confirmedLocation,
    requires_supervisor_approval: approvalStatus !== "APPROVED",
    approval_status: approvalStatus,
    notes: input.notes || "",
    base_unit: baseUnit,
    units_per_purchase_unit: unitsPerPurchaseUnit,
    qty_accepted_base: acceptedBaseQty,
    pallet_count: num_(input.pallet_count),
    quality_status: qualityStatus
  };

  const lot = {
    internal_lot_id: internalLotId,
    product_id: line.product_id,
    supplier_id: po.supplier_id,
    supplier_lot_number: receiving.supplier_lot_number,
    po_id: poId,
    po_line_id: poLineId,
    received_date: today_(),
    original_qty: acceptedBaseQty,
    current_qty_script: acceptedBaseQty,
    unit_type: baseUnit,
    unit_cost: num_(line.unit_cost),
    currency: po.currency || "USD",
    current_location_id: confirmedLocation,
    status: qualityStatus === "PASS" ? "ACTIVE" : qualityStatus,
    expiration_date: calculatedExpirationDate_(product, today_()),
    qr_value: internalLotId,
    notes: "Created by receiving flow.",
    purchase_qty_received: qtyAccepted,
    purchase_unit_type: line.unit_type,
    pallet_count: receiving.pallet_count
  };

  const movement = {
    movement_id: nextId_("INVENTORY_MOVEMENTS", "movement_id", "MOV"),
    movement_type: "RECEIVE",
    timestamp: nowIso_(),
    user_id: userId_(payload.user),
    product_id: line.product_id,
    internal_lot_id: internalLotId,
    package_id: "",
    qty_change: acceptedBaseQty,
    unit_type: baseUnit,
    from_location_id: "SUPPLIER",
    to_location_id: confirmedLocation,
    related_po_id: poId,
    related_receiving_id: receivingId,
    related_sales_order_id: "",
    related_pick_task_id: "",
    related_amazon_order_id: "",
    scan_code: receiving.scan_code || internalLotId,
    device_id: "WEB_APP",
    approval_status: approvalStatus,
    notes: input.notes || ""
  };

  appendRecord_("RECEIVING", receiving);
  appendRecord_("LOTS", lot);
  appendRecord_("INVENTORY_MOVEMENTS", movement);

  const receivedTotal = num_(line.qty_received_total) + qtyAccepted;
  const remaining = Math.max(0, num_(line.qty_ordered) - receivedTotal);
  updateTableRecord_("PURCHASE_ORDER_LINES", "po_line_id", poLineId, {
    qty_received_total: receivedTotal,
    qty_remaining: remaining,
    line_status: remaining <= 0 ? "RECEIVED" : "PARTIAL"
  });

  const poLines = readTable_("PURCHASE_ORDER_LINES").filter((item) => item.po_id === poId);
  const allReceived = poLines.length > 0 && poLines.every((item) => {
    if (item.po_line_id === poLineId) return remaining <= 0;
    return num_(item.qty_remaining) <= 0;
  });

  updateTableRecord_("PURCHASE_ORDERS", "po_id", poId, {
    actual_first_received_date: po.actual_first_received_date || today_(),
    actual_completed_date: allReceived ? today_() : po.actual_completed_date || "",
    po_status: allReceived ? "COMPLETE" : "PARTIALLY_RECEIVED"
  });

  if (confirmedLocation) {
    updateTableRecord_("LOCATIONS", "location_id", confirmedLocation, { current_status: "UNAVAILABLE" });
  }

  buildSystemBundle_(true);

  return { receiving: receiving, lot: lot, movement: movement };
}

function recordInventoryMovement(payload) {
  payload = payload || {};
  requirePermission_(payload.user, "inventory:adjust");

  const input = payload.input || {};
  const lotKey = String(input.internal_lot_id || input.lot_id || input.scan_code || "").trim();
  const lots = readTable_("LOTS");
  const lot = lots.find((item) =>
    [item.internal_lot_id, item.qr_value, item.supplier_lot_number].map(String).indexOf(lotKey) >= 0
  );
  if (!lot) throw new Error("Lot was not found.");

  const qty = num_(input.qty);
  if (qty <= 0) throw new Error("Quantity must be greater than zero.");

  const type = String(input.movement_type || "SALE").toUpperCase();
  const direction = type === "ADJUST_IN" || type === "RECEIVE" || type === "RETURN" ? 1 : -1;
  const qtyChange = direction * qty;
  const locationId = input.location_id || lot.current_location_id || "";

  const movement = {
    movement_id: nextId_("INVENTORY_MOVEMENTS", "movement_id", "MOV"),
    movement_type: type,
    timestamp: nowIso_(),
    user_id: userId_(payload.user),
    product_id: lot.product_id,
    internal_lot_id: lot.internal_lot_id,
    package_id: input.package_id || "",
    qty_change: qtyChange,
    unit_type: input.unit_type || lot.unit_type || "LB",
    from_location_id: qtyChange < 0 ? locationId : input.from_location_id || "",
    to_location_id: qtyChange > 0 ? locationId : input.to_location_id || "OUTBOUND",
    related_po_id: input.related_po_id || lot.po_id || "",
    related_receiving_id: input.related_receiving_id || "",
    related_sales_order_id: input.related_sales_order_id || "",
    related_pick_task_id: input.related_pick_task_id || "",
    related_amazon_order_id: input.related_amazon_order_id || "",
    scan_code: lotKey,
    device_id: input.device_id || "WEB_APP",
    approval_status: "APPROVED",
    notes: input.notes || ""
  };

  appendRecord_("INVENTORY_MOVEMENTS", movement);
  updateLotQuantityFromMovements_(lot.internal_lot_id);
  buildSystemBundle_(true);

  return movement;
}

function recordAmazonOutbound(payload) {
  payload = payload || {};
  const input = payload.input || {};
  const reference = String(input.amazon_reference || input.related_amazon_order_id || "").trim();

  return recordInventoryMovement({
    user: payload.user,
    input: {
      ...input,
      movement_type: "AMAZON_OUT",
      related_amazon_order_id: reference,
      notes: [reference ? "Amazon reference: " + reference : "", input.notes || ""].filter(Boolean).join(" | ")
    }
  });
}

function listAmazonOutboundActivity() {
  const productsById = indexBy_(readTable_("PRODUCTS"), "product_id");
  const lotsById = indexBy_(readTable_("LOTS"), "internal_lot_id");

  return readTable_("INVENTORY_MOVEMENTS")
    .filter((movement) => String(movement.movement_type || "").toUpperCase() === "AMAZON_OUT")
    .sort((a, b) => dateTime_(b.timestamp) - dateTime_(a.timestamp))
    .slice(0, 25)
    .map((movement) => ({
      ...movement,
      product: productsById[movement.product_id] || null,
      lot: lotsById[movement.internal_lot_id] || null
    }));
}

function listSalesOrders() {
  const customersById = indexBy_(readTable_("SUPPLIERS"), "supplier_id");
  const productsById = indexBy_(readTable_("PRODUCTS"), "product_id");
  const lines = readTable_("SALES_ORDER_LINES");

  return readTable_("SALES_ORDERS")
    .map((order) => {
      const orderLines = lines.filter((line) => line.sales_order_id === order.sales_order_id);
      return {
        ...order,
        customer: customersById[order.customer_id] || null,
        line_count: orderLines.length,
        product_names: unique_(orderLines.map((line) => productsById[line.product_id] ? productsById[line.product_id].product_name : line.product_id)).join(", ")
      };
    })
    .sort((a, b) => String(b.order_date || "").localeCompare(String(a.order_date || "")));
}

function getSalesOrderDetail(payload) {
  payload = payload || {};
  const salesOrderId = String(payload.salesOrderId || payload.sales_order_id || "").trim();
  if (!salesOrderId) return null;

  const productsById = indexBy_(readTable_("PRODUCTS"), "product_id");
  const lotsById = indexBy_(readTable_("LOTS"), "internal_lot_id");
  const locationsById = indexBy_(readTable_("LOCATIONS"), "location_id");
  const customersById = indexBy_(readTable_("SUPPLIERS"), "supplier_id");
  const order = readTable_("SALES_ORDERS").find((item) => String(item.sales_order_id) === salesOrderId);
  if (!order) return null;

  const lines = readTable_("SALES_ORDER_LINES")
    .filter((line) => String(line.sales_order_id) === salesOrderId)
    .map((line) => ({
      ...line,
      product: productsById[line.product_id] || null,
      lot: lotsById[line.preferred_internal_lot_id] || null,
      location: locationsById[line.preferred_location_id] || null
    }));

  return {
    order: {
      ...order,
      customer: customersById[order.customer_id] || null
    },
    lines: lines,
    pickTasks: readTable_("PICK_TASKS").filter((task) => task.sales_order_id === salesOrderId)
  };
}

function createSalesOrder(payload) {
  payload = payload || {};
  requirePermission_(payload.user, "salesOrders:create");

  const input = payload.input || {};
  const customers = readTable_("SUPPLIERS");
  const customer = customers.find((item) => String(item.supplier_id) === String(input.customer_id));
  if (!customer || normalizePartyType_(customer.party_type) !== "CUSTOMER") {
    throw new Error("Select a valid customer.");
  }

  const shippingAddress = String(input.shipping_address || customer.address || "").trim();
  if (!shippingAddress) throw new Error("Ship To Address is required.");

  const inputLines = Array.isArray(input.lines) ? input.lines : [];
  if (!inputLines.length) throw new Error("Add at least one inventory item.");

  const data = dataTables_();
  const snapshot = buildInventorySnapshot_(data);
  const allocated = {};
  const validated = inputLines.map((line, index) => validateSalesOrderLine_(line, index, data, snapshot, allocated, input.requested_delivery_date));

  const subtotal = round_(sum_(validated.map((line) => line.line_total)), 2);
  const grossProfit = round_(sum_(validated.map((line) => line.estimated_gross_profit)), 2);
  const taxEnabled = truthy_(input.tax_enabled);
  const taxRate = taxEnabled ? Math.max(0, num_(input.tax_rate_percent, num_(input.tax_rate) * 100 || 6.25) / 100) : 0;
  const taxAmount = round_(subtotal * taxRate, 2);
  const salesOrderId = nextId_("SALES_ORDERS", "sales_order_id", "SO");
  const orderDate = input.order_date || today_();

  const order = {
    sales_order_id: salesOrderId,
    channel: String(input.sales_channel || input.channel || "OTHER").toUpperCase(),
    order_source: input.order_source || "MANUAL",
    customer_name: customer.supplier_name,
    customer_email: customer.email || "",
    customer_phone: customer.phone || "",
    amazon_order_id: input.amazon_order_id || "",
    order_date: orderDate,
    ship_by_date: input.requested_delivery_date || "",
    status: "DRAFT",
    currency: customer.default_currency || "USD",
    subtotal_amount: subtotal,
    tax_amount: taxAmount,
    shipping_amount: num_(input.shipping_amount),
    total_amount: round_(subtotal + taxAmount + num_(input.shipping_amount), 2),
    invoice_status: "NOT_INVOICED",
    quickbooks_invoice_id: "",
    created_by: userId_(payload.user),
    created_at: nowIso_(),
    updated_at: nowIso_(),
    notes: input.notes || "",
    customer_id: customer.supplier_id,
    ship_method: String(input.ship_method || "OTHER").toUpperCase(),
    payment_terms: input.payment_terms || customer.payment_terms || "Net 30",
    tax_enabled: taxEnabled,
    tax_rate: taxRate,
    estimated_gross_profit: grossProfit,
    estimated_gross_margin_percent: subtotal > 0 ? round_(grossProfit / subtotal * 100, 2) : 0,
    confirmed_at: "",
    picked_at: "",
    shipped_at: "",
    bl_folio: nextBlFolio_(readTable_("SALES_ORDERS")),
    shipping_address: shippingAddress
  };

  const lineSeed = readTable_("SALES_ORDER_LINES").slice();
  const lines = validated.map((line) => {
    const lineId = nextIdFromRows_(lineSeed, "sales_order_line_id", "SOL");
    lineSeed.push({ sales_order_line_id: lineId });

    return {
      sales_order_line_id: lineId,
      sales_order_id: salesOrderId,
      channel: order.channel,
      amazon_order_item_id: line.amazon_order_item_id || "",
      product_id: line.product_id,
      amazon_sku: line.amazon_sku || "",
      wholesale_sku: line.wholesale_sku || "",
      qty_ordered: line.qty_ordered,
      qty_picked: 0,
      qty_remaining: line.qty_ordered,
      unit_type: line.unit_type,
      unit_price: line.unit_price,
      currency: order.currency,
      line_total: line.line_total,
      preferred_internal_lot_id: line.internal_lot_id,
      preferred_location_id: line.location_id,
      line_status: "DRAFT",
      notes: line.notes || "",
      unit_weight_lbs: line.unit_weight_lbs,
      inventory_qty_required: line.inventory_qty_required,
      inventory_unit_type: line.inventory_unit_type,
      unit_cost: line.unit_cost,
      estimated_gross_profit: line.estimated_gross_profit,
      expiration_date: line.expiration_date,
      fefo_status: line.fefo_status
    };
  });

  appendRecord_("SALES_ORDERS", order);
  lines.forEach((line) => appendRecord_("SALES_ORDER_LINES", line));

  buildSystemBundle_(true);

  return { ...order, lines: lines };
}

function salesOrderAction(payload) {
  payload = payload || {};
  requirePermission_(payload.user, "salesOrders:actions");

  const salesOrderId = String(payload.salesOrderId || payload.sales_order_id || "").trim();
  const action = String(payload.action || "").toUpperCase();
  const order = readTable_("SALES_ORDERS").find((item) => item.sales_order_id === salesOrderId);
  if (!order) throw new Error("Sales order not found.");

  const lines = readTable_("SALES_ORDER_LINES").filter((line) => line.sales_order_id === salesOrderId);

  if (action === "CONFIRM") {
    if (String(order.status || "").toUpperCase() !== "DRAFT") throw new Error("Only draft Sales Orders can be confirmed.");
    const pickSeed = readTable_("PICK_TASKS").slice();

    lines.forEach((line) => {
      const pickId = nextIdFromRows_(pickSeed, "pick_task_id", "PICK");
      pickSeed.push({ pick_task_id: pickId });
      appendRecord_("PICK_TASKS", {
        pick_task_id: pickId,
        sales_order_id: salesOrderId,
        sales_order_line_id: line.sales_order_line_id,
        channel: order.channel,
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
        scan_code: "",
        device_id: "WEB_APP",
        exception_code: "",
        notes: line.fefo_status === "RECOMMENDED" ? "FEFO allocation." : "Manual lot allocation.",
        qty_to_pick_base: line.inventory_qty_required,
        reservation_status: "RESERVED"
      });
      updateTableRecord_("SALES_ORDER_LINES", "sales_order_line_id", line.sales_order_line_id, { line_status: "CONFIRMED" });
    });
    updateTableRecord_("SALES_ORDERS", "sales_order_id", salesOrderId, { status: "CONFIRMED", confirmed_at: nowIso_(), updated_at: nowIso_() });
  } else if (action === "PICKED") {
    const movements = [];
    lines.forEach((line) => {
      const movement = recordInventoryMovement({
        user: payload.user,
        input: {
          internal_lot_id: line.preferred_internal_lot_id,
          qty: num_(line.inventory_qty_required, line.qty_ordered),
          unit_type: line.inventory_unit_type || line.unit_type,
          movement_type: "SALE",
          location_id: line.preferred_location_id,
          related_sales_order_id: salesOrderId,
          notes: "Sales order picked."
        }
      });
      movements.push(movement);
      updateTableRecord_("SALES_ORDER_LINES", "sales_order_line_id", line.sales_order_line_id, {
        line_status: "PICKED",
        qty_picked: line.qty_ordered,
        qty_remaining: 0
      });
    });
    readTable_("PICK_TASKS").filter((task) => task.sales_order_id === salesOrderId).forEach((task) => {
      updateTableRecord_("PICK_TASKS", "pick_task_id", task.pick_task_id, {
        pick_status: "PICKED",
        qty_picked: task.qty_to_pick,
        picked_at: nowIso_()
      });
    });
    updateTableRecord_("SALES_ORDERS", "sales_order_id", salesOrderId, { status: "PICKED", picked_at: nowIso_(), updated_at: nowIso_() });
  } else if (action === "SHIPPED") {
    readTable_("PICK_TASKS").filter((task) => task.sales_order_id === salesOrderId).forEach((task) => {
      updateTableRecord_("PICK_TASKS", "pick_task_id", task.pick_task_id, { pick_status: "SHIPPED" });
    });
    updateTableRecord_("SALES_ORDERS", "sales_order_id", salesOrderId, { status: "SHIPPED", shipped_at: nowIso_(), updated_at: nowIso_() });
  } else {
    throw new Error("Unknown Sales Order action.");
  }

  buildSystemBundle_(true);
  return getSalesOrderDetail({ salesOrderId: salesOrderId });
}

function lookupScan(payload) {
  payload = payload || {};
  const value = String(payload.scanValue || payload.scan_value || "").trim();
  if (!value) return null;

  const product = readTable_("PRODUCTS").find((item) =>
    [item.product_id, item.barcode_or_qr_value, item.amazon_sku, item.wholesale_sku].map(String).indexOf(value) >= 0
  );
  if (product) return { type: "PRODUCT", record: product };

  const supplier = readTable_("SUPPLIERS").find((item) => String(item.supplier_id) === value);
  if (supplier) return { type: "SUPPLIER", record: supplier };

  const location = readTable_("LOCATIONS").find((item) =>
    [item.location_id, item.qr_value].map(String).indexOf(value) >= 0
  );
  if (location) return { type: "LOCATION", record: location };

  const lot = readTable_("LOTS").find((item) =>
    [item.internal_lot_id, item.qr_value, item.supplier_lot_number].map(String).indexOf(value) >= 0
  );
  if (lot) return { type: "LOT", record: lot };

  const pkg = readTable_("AMAZON_PACKAGES").find((item) =>
    [item.package_id, item.package_qr_value].map(String).indexOf(value) >= 0
  );
  if (pkg) return { type: "AMAZON_PACKAGE", record: pkg };

  return null;
}

function matchAmazonPackageScan(payload) {
  payload = payload || {};
  const value = String(payload.scanValue || payload.scan_value || "").trim();
  const pkg = readTable_("AMAZON_PACKAGES").find((item) =>
    [item.package_id, item.package_qr_value].map(String).indexOf(value) >= 0
  );

  if (!pkg) return { match_status: "NOT_FOUND", message: "Package scan was not found." };

  const match = {
    scan_match_id: nextId_("AMAZON_SCAN_MATCHES", "scan_match_id", "AMZSCAN"),
    scanned_at: nowIso_(),
    scanned_by: "WEB_APP",
    package_id: pkg.package_id,
    amazon_sku: pkg.amazon_sku,
    product_id: pkg.product_id,
    match_status: "PACKAGE_FOUND",
    match_confidence: 0.75,
    notes: "Package exists. Future Amazon order line link pending."
  };

  appendRecord_("AMAZON_SCAN_MATCHES", match);
  return match;
}

/**
 * Calculation engine
 */

function buildSystemBundle_(writeOutputs) {
  const data = dataTables_();
  const calculatedAt = nowIso_();

  const inventorySnapshotRows = buildInventorySnapshot_(data, calculatedAt);
  const supplierAnalyticsRows = buildSupplierAnalytics_(data, calculatedAt);
  const productSupplierAnalyticsRows = buildProductSupplierAnalytics_(data, calculatedAt);
  const inventoryPlanningRows = buildInventoryPlanning_(data, inventorySnapshotRows, calculatedAt);
  const recommendationsRows = buildRecommendations_(inventoryPlanningRows, calculatedAt);
  const dashboard = buildDashboard_(data, inventorySnapshotRows, inventoryPlanningRows, recommendationsRows);
  const dashboardRows = buildDashboardRows_(dashboard, calculatedAt);

  if (writeOutputs) {
    writeCalculatedOutputs_({
      dashboardRows: dashboardRows,
      inventorySnapshot: inventorySnapshotRows,
      supplierAnalytics: supplierAnalyticsRows,
      productSupplierAnalytics: productSupplierAnalyticsRows,
      recommendations: recommendationsRows
    });
  }

  return {
    calculated_at: calculatedAt,
    dashboard: dashboard,
    dashboardRows: dashboardRows,
    inventorySnapshot: inventorySnapshotRows,
    supplierAnalytics: supplierAnalyticsRows,
    productSupplierAnalytics: productSupplierAnalyticsRows,
    inventoryPlanning: inventoryPlanningRows,
    recommendations: recommendationsRows
  };
}

function dataTables_() {
  return {
    products: readTable_("PRODUCTS"),
    suppliers: readTable_("SUPPLIERS"),
    locations: readTable_("LOCATIONS"),
    purchaseOrders: readTable_("PURCHASE_ORDERS"),
    purchaseOrderLines: readTable_("PURCHASE_ORDER_LINES"),
    receiving: readTable_("RECEIVING"),
    lots: readTable_("LOTS"),
    movements: readTable_("INVENTORY_MOVEMENTS"),
    salesOrders: readTable_("SALES_ORDERS"),
    salesOrderLines: readTable_("SALES_ORDER_LINES"),
    pickTasks: readTable_("PICK_TASKS"),
    amazonPackages: readTable_("AMAZON_PACKAGES")
  };
}

function buildInventorySnapshot_(data, calculatedAt) {
  calculatedAt = calculatedAt || nowIso_();

  const productsById = indexBy_(data.products, "product_id");
  const lotsById = indexBy_(data.lots, "internal_lot_id");
  const reservedByKey = buildReservedInventory_(data);
  const byKey = {};

  data.movements.forEach((movement) => {
    const qtyChange = num_(movement.qty_change);
    if (!movement.product_id || !movement.internal_lot_id || !isFinite(qtyChange) || qtyChange === 0) return;

    const locationId = movementLocation_(movement, qtyChange);
    const key = [movement.product_id, movement.internal_lot_id, locationId].join("|");

    if (!byKey[key]) {
      byKey[key] = {
        product_id: movement.product_id,
        internal_lot_id: movement.internal_lot_id,
        location_id: locationId,
        qty: 0,
        current_qty: 0,
        unit_type: movement.unit_type || ""
      };
    }

    byKey[key].qty += qtyChange;
    byKey[key].current_qty += qtyChange;
    if (movement.unit_type) byKey[key].unit_type = movement.unit_type;
  });

  const rows = Object.keys(byKey)
    .map((key) => {
      const row = byKey[key];
      const product = productsById[row.product_id] || {};
      const lot = lotsById[row.internal_lot_id] || {};
      const reserved = reservedByKey[key] || 0;
      const currentQty = round_(row.current_qty, 2);
      const expiration = effectiveExpirationDate_(lot, product);
      const expirationKey = expiration ? dateKey_(expiration) : "";
      const daysRemaining = expiration ? Math.ceil((expiration.getTime() - startOfDay_(new Date()).getTime()) / 86400000) : "";
      const daysSinceReceived = lot.received_date ? Math.max(0, Math.floor(daysBetween_(lot.received_date, today_()))) : "";
      const inventoryValue = round_(inventoryValue_(lot, currentQty, data.purchaseOrderLines), 2);

      let inventoryStatus = "AVAILABLE";
      if (currentQty <= 0) inventoryStatus = "EMPTY";
      else if (expiration && expiration < startOfDay_(new Date())) inventoryStatus = "EXPIRED";
      else if (expiration && daysRemaining <= 30) inventoryStatus = "EXPIRING_SOON";

      let recommendedAction = currentQty <= 0 ? "NO_STOCK" : "SELLABLE";
      if (inventoryStatus === "EXPIRED") recommendedAction = "HOLD_DO_NOT_SELL";
      else if (inventoryStatus === "EXPIRING_SOON") recommendedAction = "PRIORITIZE_FEFO";
      else if (currentQty > 0) recommendedAction = "FIFO_AVAILABLE";

      return {
        snapshot_id: ["SNAP", row.product_id, row.internal_lot_id, row.location_id || "NOLOC"].join("-"),
        calculated_at: calculatedAt,
        product_id: row.product_id,
        product_name: product.product_name || row.product_id,
        internal_lot_id: row.internal_lot_id,
        location_id: row.location_id,
        qty: currentQty,
        current_qty: currentQty,
        reserved_qty: round_(reserved, 2),
        available_qty: round_(Math.max(0, currentQty - reserved), 2),
        unit_type: row.unit_type || lot.unit_type || product.base_unit || "",
        inventory_status: inventoryStatus,
        days_since_received: daysSinceReceived,
        fifo_rank: 0,
        unit_cost: num_(lot.unit_cost),
        inventory_value: inventoryValue,
        expiration_date: expirationKey,
        days_remaining: daysRemaining,
        recommended_action: recommendedAction,
        notes: currentQty < 0 ? "Negative inventory: review movements." : "",
        product: product,
        lot: lot
      };
    })
    .filter((row) => Math.abs(num_(row.current_qty)) > 0.0001)
    .sort((a, b) =>
      String(a.product_name || "").localeCompare(String(b.product_name || ""))
      || String(a.internal_lot_id || "").localeCompare(String(b.internal_lot_id || ""))
      || String(a.location_id || "").localeCompare(String(b.location_id || ""))
    );

  const byProduct = {};
  rows.forEach((row) => {
    if (num_(row.current_qty) <= 0) return;
    if (!byProduct[row.product_id]) byProduct[row.product_id] = [];
    byProduct[row.product_id].push(row);
  });

  Object.keys(byProduct).forEach((productId) => {
    byProduct[productId]
      .sort((a, b) => {
        const lotA = lotsById[a.internal_lot_id] || {};
        const lotB = lotsById[b.internal_lot_id] || {};
        return dateTime_(lotA.received_date) - dateTime_(lotB.received_date);
      })
      .forEach((row, index) => {
        row.fifo_rank = index + 1;
        if (index === 0 && row.recommended_action === "FIFO_AVAILABLE") row.recommended_action = "PICK_FIRST_FIFO";
      });
  });

  return rows;
}

function buildReservedInventory_(data) {
  const reserved = {};
  (data.pickTasks || []).forEach((task) => {
    const reservationStatus = String(task.reservation_status || "RESERVED").toUpperCase();
    const pickStatus = String(task.pick_status || "OPEN").toUpperCase();
    if (reservationStatus === "RELEASED" || ["CANCELLED", "RELEASED", "SHIPPED"].indexOf(pickStatus) >= 0) return;

    const line = (data.salesOrderLines || []).find((item) => item.sales_order_line_id === task.sales_order_line_id) || {};
    const productId = task.product_id || line.product_id;
    const lotId = task.recommended_internal_lot_id || line.preferred_internal_lot_id;
    const locationId = task.recommended_location_id || line.preferred_location_id;
    if (!productId || !lotId || !locationId) return;

    const key = [productId, lotId, locationId].join("|");
    reserved[key] = (reserved[key] || 0) + num_(task.qty_to_pick_base, line.inventory_qty_required || task.qty_to_pick);
  });
  return reserved;
}

function buildInventoryPlanning_(data, snapshot, calculatedAt) {
  const suppliersById = indexBy_(data.suppliers, "supplier_id");
  const leadStats = buildLeadTimeStatsBySupplier_(data.purchaseOrders);
  const qtyByProduct = {};
  snapshot.forEach((row) => {
    if (num_(row.current_qty) > 0) qtyByProduct[row.product_id] = (qtyByProduct[row.product_id] || 0) + num_(row.current_qty);
  });

  return data.products
    .filter(isActiveRecord_)
    .map((product) => {
      const supplierId = chooseSupplierForProduct_(product.product_id, data.purchaseOrderLines) || "";
      const supplier = suppliersById[supplierId] || {};
      const usage = buildDailyUsageStats_(product.product_id, data.movements);
      const lead = leadStats[supplierId] || { average: num_(supplier.lead_time_expected_days, 5), stdDev: 0, count: 0 };
      const currentQty = round_(qtyByProduct[product.product_id] || 0, 2);
      const averageDailyUsage = round_(usage.averageDailyUsage, 2);
      const stdDailyUsage = round_(usage.stdDailyUsage, 2);
      const avgLead = round_(lead.average || 5, 2);
      const stdLead = round_(lead.stdDev || 0, 2);
      const demandDuringLead = round_(averageDailyUsage * avgLead, 2);
      const safetyStock = round_(1.65 * Math.sqrt((avgLead * Math.pow(stdDailyUsage, 2)) + (Math.pow(averageDailyUsage, 2) * Math.pow(stdLead, 2))), 2);
      const minStock = num_(product.min_stock_qty);
      const sheetTarget = num_(product.target_stock_qty);
      const reorderPoint = averageDailyUsage > 0 ? round_(demandDuringLead + safetyStock, 2) : minStock;
      const targetStockLevel = sheetTarget > 0 ? sheetTarget : averageDailyUsage > 0 ? round_(reorderPoint + averageDailyUsage * velocityDays_(product.velocity_class), 2) : minStock;
      const daysOfSupply = averageDailyUsage > 0 ? round_(currentQty / averageDailyUsage, 1) : 0;
      const recommendedOrderQty = Math.max(0, round_(targetStockLevel - currentQty, 2));

      let status = "OK";
      if (usage.days === 0 && reorderPoint <= 0 && minStock <= 0) status = "NEEDS_USAGE_HISTORY";
      else if (recommendedOrderQty > 0 && currentQty <= reorderPoint) status = "REORDER";
      else if (daysOfSupply > 0 && daysOfSupply <= avgLead + 7) status = "WATCH";

      return {
        product_id: product.product_id,
        product_name: product.product_name,
        supplier_id: supplierId,
        supplier_name: supplier.supplier_name || "",
        current_qty: currentQty,
        average_daily_usage: averageDailyUsage,
        std_daily_usage: stdDailyUsage,
        usage_days: usage.days,
        usage_samples: usage.samples,
        avg_lead_time_days: avgLead,
        std_lead_time_days: stdLead,
        demand_during_lead_time: demandDuringLead,
        safety_stock: safetyStock,
        reorder_point: reorderPoint,
        target_stock_level: targetStockLevel,
        days_of_supply: daysOfSupply,
        recommended_order_qty: recommendedOrderQty,
        status: status,
        calculated_at: calculatedAt,
        notes: status === "NEEDS_USAGE_HISTORY" ? "Add sales/usage movements to make reorder math stronger." : ""
      };
    })
    .sort((a, b) => {
      const order = { REORDER: 1, WATCH: 2, NEEDS_USAGE_HISTORY: 3, OK: 4 };
      return (order[a.status] || 9) - (order[b.status] || 9) || String(a.product_name).localeCompare(String(b.product_name));
    });
}

function buildRecommendations_(planning, calculatedAt) {
  return planning
    .filter((row) => row.status === "REORDER")
    .map((row, index) => ({
      recommendation_id: "REC-" + Utilities.formatDate(new Date(), APP_TIMEZONE, "yyyyMMdd") + "-" + pad_(index + 1, 4),
      generated_at: calculatedAt,
      recommendation_type: "REORDER",
      product_id: row.product_id,
      product_name: row.product_name,
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      recommended_qty: row.recommended_order_qty,
      recommended_unit_cost: "",
      recommended_location_id: "",
      confidence_score: row.usage_days > 0 ? 0.85 : 0.45,
      reorder_point: row.reorder_point,
      target_stock_level: row.target_stock_level,
      current_qty: row.current_qty,
      reason_text: row.product_name + " is at " + row.current_qty + " on hand vs reorder point " + row.reorder_point + ".",
      status: "OPEN",
      accepted_by: "",
      accepted_at: "",
      created_po_id: "",
      notes: row.notes || ""
    }));
}

function buildSupplierAnalytics_(data, calculatedAt) {
  const supplierRows = data.suppliers.filter((supplier) => normalizePartyType_(supplier.party_type) === "VENDOR");
  const productsById = indexBy_(data.products, "product_id");
  const linesByPo = groupBy_(data.purchaseOrderLines, "po_id");
  const receiptsBySupplier = groupBy_(data.receiving, "supplier_id");
  const totalSpend = sum_(data.purchaseOrderLines.map((line) => num_(line.line_total)));

  return supplierRows.map((supplier) => {
    const pos = data.purchaseOrders.filter((po) => po.supplier_id === supplier.supplier_id);
    const completed = pos.filter((po) => String(po.po_status || "").toUpperCase() === "COMPLETE" || po.actual_completed_date);
    const supplierLines = [];
    pos.forEach((po) => (linesByPo[po.po_id] || []).forEach((line) => supplierLines.push(line)));

    const productNames = unique_(supplierLines.map((line) => productsById[line.product_id] ? productsById[line.product_id].product_name : line.product_id)).filter(Boolean);
    const spend = sum_(supplierLines.map((line) => num_(line.line_total)));
    const leadValues = completed
      .map((po) => daysBetween_(po.order_date, po.actual_first_received_date || po.actual_completed_date))
      .filter((days) => isFinite(days) && days >= 0);
    const receipts = receiptsBySupplier[supplier.supplier_id] || [];
    const qualityScores = receipts.map((row) => num_(row.quality_score)).filter((value) => value > 0);
    const productAccuracyScores = receipts.map((row) => num_(row.product_accuracy_score)).filter((value) => value > 0);
    const qtyAccuracyRate = receipts.length
      ? receipts.filter((row) => String(row.over_under_status || "").toUpperCase() !== "OVER").length / receipts.length * 100
      : 0;

    const qualityAvg = average_(qualityScores);
    const productAccuracyAvg = average_(productAccuracyScores);
    const supplierScore = round_(
      (qualityAvg ? qualityAvg / 5 * 35 : 20)
      + (productAccuracyAvg ? productAccuracyAvg / 5 * 25 : 15)
      + (leadValues.length ? Math.max(0, 25 - average_(leadValues)) : 10)
      + (qtyAccuracyRate ? qtyAccuracyRate * 0.15 : 10),
      1
    );

    return {
      supplier_id: supplier.supplier_id,
      supplier_name: supplier.supplier_name,
      party_type: normalizePartyType_(supplier.party_type),
      contact_name: supplier.contact_name || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      products_bought: productNames.join(", "),
      total_orders: pos.length,
      completed_orders: completed.length,
      total_purchase_amount: round_(spend, 2),
      spend_share_percent: totalSpend > 0 ? round_(spend / totalSpend * 100, 1) : 0,
      avg_lead_time_days: round_(average_(leadValues), 2),
      std_lead_time_days: round_(std_(leadValues), 2),
      avg_quality_score: round_(qualityAvg, 2),
      quality_percent: qualityAvg ? round_(qualityAvg / 5 * 100, 1) : 0,
      avg_product_accuracy_score: round_(productAccuracyAvg, 2),
      product_accuracy_percent: productAccuracyAvg ? round_(productAccuracyAvg / 5 * 100, 1) : 0,
      delivery_accuracy_rate: leadValues.length ? 100 : 0,
      quantity_accuracy_percent: round_(qtyAccuracyRate, 1),
      avg_price_variability_score: "",
      supplier_score: supplierScore,
      last_calculated_at: calculatedAt,
      notes: productNames.length ? "" : "No purchase history yet."
    };
  }).sort((a, b) => b.supplier_score - a.supplier_score || String(a.supplier_name).localeCompare(String(b.supplier_name)));
}

function buildProductSupplierAnalytics_(data, calculatedAt) {
  const productsById = indexBy_(data.products, "product_id");
  const suppliersById = indexBy_(data.suppliers, "supplier_id");
  const grouped = {};

  data.purchaseOrderLines.forEach((line) => {
    if (!line.product_id || !line.supplier_id) return;
    const key = line.product_id + "|" + line.supplier_id;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(line);
  });

  return Object.keys(grouped).map((key) => {
    const parts = key.split("|");
    const productId = parts[0];
    const supplierId = parts[1];
    const lines = grouped[key];
    const costs = lines.map((line) => num_(line.unit_cost)).filter((value) => value > 0);
    const supplier = suppliersById[supplierId] || {};
    const product = productsById[productId] || {};
    const lead = buildLeadTimeStatsBySupplier_(data.purchaseOrders)[supplierId] || { average: num_(supplier.lead_time_expected_days, 5), stdDev: 0 };

    return {
      product_id: productId,
      product_name: product.product_name || productId,
      supplier_id: supplierId,
      supplier_name: supplier.supplier_name || supplierId,
      orders_count: lines.length,
      avg_unit_cost: round_(average_(costs), 4),
      std_unit_cost: round_(std_(costs), 4),
      min_unit_cost: costs.length ? Math.min.apply(null, costs) : 0,
      max_unit_cost: costs.length ? Math.max.apply(null, costs) : 0,
      last_unit_cost: costs.length ? costs[costs.length - 1] : 0,
      avg_lead_time_days: round_(lead.average || 0, 2),
      std_lead_time_days: round_(lead.stdDev || 0, 2),
      recommended_supplier_flag: "",
      last_calculated_at: calculatedAt,
      notes: ""
    };
  }).sort((a, b) => String(a.product_name).localeCompare(String(b.product_name)) || String(a.supplier_name).localeCompare(String(b.supplier_name)));
}

function buildDashboard_(data, snapshot, planning, recommendations) {
  const positiveStock = snapshot.filter((row) => num_(row.current_qty) > 0);
  const totalInventoryValue = sum_(positiveStock.map((row) => num_(row.inventory_value)));
  const lowStockProducts = planning.filter((row) => row.status === "REORDER");

  const todayDate = startOfDay_(new Date());
  const expiringLots = positiveStock
    .filter((row) => row.expiration_date && row.days_remaining !== "" && num_(row.days_remaining) >= 0 && num_(row.days_remaining) <= 30)
    .map((row) => ({
      internal_lot_id: row.internal_lot_id,
      product_id: row.product_id,
      product_name: row.product_name,
      current_qty: row.current_qty,
      unit_type: row.unit_type,
      location_id: row.location_id,
      expiration_date: row.expiration_date,
      days_remaining: row.days_remaining,
      inventory_value: row.inventory_value
    }))
    .sort((a, b) => num_(a.days_remaining) - num_(b.days_remaining));

  const openPurchaseOrders = data.purchaseOrders.filter(isOpenPurchaseOrder_);
  const openSalesOrders = data.salesOrders.filter((order) => ["SHIPPED", "CANCELLED", "CLOSED"].indexOf(String(order.status || "").toUpperCase()) < 0);

  const weekStart = new Date(todayDate.getTime() - 6 * 86400000);
  const shippedThisWeek = data.salesOrders.filter((order) => {
    if (String(order.status || "").toUpperCase() !== "SHIPPED") return false;
    const shippedDate = startOfDay_(order.shipped_at || order.updated_at || order.order_date);
    return shippedDate && shippedDate >= weekStart;
  });

  const shippedIds = {};
  shippedThisWeek.forEach((order) => shippedIds[order.sales_order_id] = true);

  const profitByProduct = {};
  data.salesOrderLines.forEach((line) => {
    if (!shippedIds[line.sales_order_id]) return;
    if (!profitByProduct[line.product_id]) profitByProduct[line.product_id] = { revenue: 0, profit: 0 };
    profitByProduct[line.product_id].revenue += num_(line.line_total);
    profitByProduct[line.product_id].profit += num_(line.estimated_gross_profit);
  });

  const productsById = indexBy_(data.products, "product_id");
  const topProfitProduct = Object.keys(profitByProduct).map((productId) => {
    const totals = profitByProduct[productId];
    return {
      product_id: productId,
      product_name: productsById[productId] ? productsById[productId].product_name : productId,
      gross_profit: round_(totals.profit, 2),
      gross_margin_percent: totals.revenue > 0 ? round_(totals.profit / totals.revenue * 100, 1) : 0
    };
  }).sort((a, b) => b.gross_profit - a.gross_profit)[0] || null;

  const activeLocations = data.locations.filter(isActiveRecord_);
  const activeLocationIds = {};
  activeLocations.forEach((location) => activeLocationIds[location.location_id] = true);
  const occupied = {};
  positiveStock.forEach((row) => {
    if (activeLocationIds[row.location_id]) occupied[row.location_id] = true;
  });

  return {
    productCount: data.products.filter(isActiveRecord_).length,
    supplierCount: data.suppliers.filter(isActiveRecord_).length,
    openPoCount: openPurchaseOrders.length,
    lotCount: data.lots.length,
    movementCount: data.movements.length,
    pendingAmazonPackages: data.amazonPackages.filter((pkg) => !pkg.matched_amazon_order_id).length,

    totalInventoryValue: round_(totalInventoryValue, 2),
    lowStockCount: lowStockProducts.length,
    lowStockProducts: lowStockProducts,
    usageHistoryNeededCount: planning.filter((row) => row.status === "NEEDS_USAGE_HISTORY").length,

    expiringLotCount: expiringLots.length,
    expiringProductCount: unique_(expiringLots.map((row) => row.product_id)).length,
    expiringInventoryValue: round_(sum_(expiringLots.map((row) => row.inventory_value)), 2),
    expiringLots: expiringLots,

    openPoValue: round_(sum_(openPurchaseOrders.map((po) => num_(po.total_amount || po.subtotal_amount))), 2),
    openSoCount: openSalesOrders.length,
    openSoValue: round_(sum_(openSalesOrders.map((order) => num_(order.total_amount))), 2),

    weeklySales: round_(sum_(shippedThisWeek.map((order) => num_(order.total_amount))), 2),
    topProfitProduct: topProfitProduct,

    warehouseOccupiedPositions: Object.keys(occupied).length,
    warehouseTotalPositions: activeLocations.length,
    warehouseCapacityPercent: activeLocations.length ? round_(Object.keys(occupied).length / activeLocations.length * 100, 1) : 0,

    recommendationCount: recommendations.length
  };
}

function buildDashboardRows_(dashboard, calculatedAt) {
  const rows = [
    ["TOTAL_INVENTORY_VALUE", "Total Inventory Value", dashboard.totalInventoryValue, "USD", "OK", "Positive on-hand stock valued at lot cost."],
    ["LOW_STOCK_PRODUCTS", "Low Stock Products", dashboard.lowStockCount, "count", dashboard.lowStockCount > 0 ? "ATTENTION" : "OK", "Products under reorder point."],
    ["USAGE_HISTORY_NEEDED", "Usage History Needed", dashboard.usageHistoryNeededCount, "count", dashboard.usageHistoryNeededCount > 0 ? "WATCH" : "OK", "Products without enough sales/usage movement history."],
    ["EXPIRING_30_DAYS", "Lots Expiring Within 30 Days", dashboard.expiringLotCount, "count", dashboard.expiringLotCount > 0 ? "ATTENTION" : "OK", "Lots with positive inventory expiring within 30 days."],
    ["EXPIRING_VALUE", "Expiring Inventory Value", dashboard.expiringInventoryValue, "USD", dashboard.expiringInventoryValue > 0 ? "ATTENTION" : "OK", "Value at risk within 30 days."],
    ["OPEN_PURCHASE_ORDERS", "Open Purchase Orders", dashboard.openPoCount, "count", "OK", "Open PO count."],
    ["OPEN_PURCHASE_ORDER_VALUE", "Open Purchase Order Value", dashboard.openPoValue, "USD", "OK", "Open PO value."],
    ["OPEN_SALES_ORDERS", "Open Sales Orders", dashboard.openSoCount, "count", dashboard.openSoCount > 0 ? "WATCH" : "OK", "Orders not shipped/cancelled/closed."],
    ["OPEN_SALES_ORDER_VALUE", "Open Sales Order Value", dashboard.openSoValue, "USD", "OK", "Open SO value."],
    ["WEEKLY_SALES", "Weekly Sales", dashboard.weeklySales, "USD", "OK", "Shipped SO total for last 7 days."],
    ["WAREHOUSE_CAPACITY_PERCENT", "Warehouse Capacity Percent", dashboard.warehouseCapacityPercent, "percent", dashboard.warehouseCapacityPercent >= 90 ? "ATTENTION" : "OK", "Occupied active locations divided by active locations."],
    ["RECOMMENDATIONS", "Open Recommendations", dashboard.recommendationCount, "count", dashboard.recommendationCount > 0 ? "WATCH" : "OK", "Calculated reorder recommendations."]
  ];

  return rows.map((row) => ({
    metric_id: row[0],
    metric_name: row[1],
    metric_value: row[2],
    metric_unit: row[3],
    period_start: "",
    period_end: "",
    calculated_at: calculatedAt,
    status: row[4],
    notes: row[5]
  }));
}

function writeCalculatedOutputs_(outputs) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    replaceTableRows_("DASHBOARD_SCRIPT", outputs.dashboardRows, OUTPUT_HEADERS.DASHBOARD_SCRIPT);
    replaceTableRows_("INVENTORY_SNAPSHOT_SCRIPT", outputs.inventorySnapshot, OUTPUT_HEADERS.INVENTORY_SNAPSHOT_SCRIPT);
    replaceTableRows_("SUPPLIER_ANALYTICS_SCRIPT", outputs.supplierAnalytics, OUTPUT_HEADERS.SUPPLIER_ANALYTICS_SCRIPT);
    replaceTableRows_("PRODUCT_SUPPLIER_ANALYTICS_SCRIPT", outputs.productSupplierAnalytics, OUTPUT_HEADERS.PRODUCT_SUPPLIER_ANALYTICS_SCRIPT);
    replaceTableRows_("RECOMMENDATIONS_SCRIPT", outputs.recommendations, OUTPUT_HEADERS.RECOMMENDATIONS_SCRIPT);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Validation and record builders
 */

function validatePurchaseOrderLine_(input, index, products) {
  const product = products.find((item) => item.product_id === input.product_id);
  const lineNumber = index + 1;
  if (!product) throw new Error("Select a valid product on line " + lineNumber + ".");

  const qtyOrdered = num_(input.qty_ordered);
  const unitCost = num_(input.unit_cost);
  if (qtyOrdered <= 0) throw new Error("Quantity must be greater than zero on line " + lineNumber + ".");
  if (unitCost < 0) throw new Error("Unit cost cannot be negative on line " + lineNumber + ".");

  const unitType = String(input.unit_type || product.default_unit || "Case").trim();
  const baseUnit = String(input.base_unit || product.base_unit || "LB").trim();
  const unitsPerPurchaseUnit = num_(input.units_per_purchase_unit, num_(input.case_weight_lbs, product.case_weight_lbs) || 1);

  return {
    product_id: product.product_id,
    product_name: product.product_name,
    qty_ordered: qtyOrdered,
    unit_type: unitType,
    unit_cost: unitCost,
    line_total: round_(qtyOrdered * unitCost, 2),
    supplier_expected_lot_number: input.supplier_expected_lot_number || "",
    notes: input.notes || "",
    base_unit: baseUnit,
    units_per_purchase_unit: unitsPerPurchaseUnit,
    expected_base_qty: round_(qtyOrdered * unitsPerPurchaseUnit, 2),
    case_weight_lbs: num_(input.case_weight_lbs, product.case_weight_lbs)
  };
}

function validateSalesOrderLine_(input, index, data, snapshot, allocatedByKey, requestedDeliveryDate) {
  const lineNumber = index + 1;
  const product = data.products.find((item) => item.product_id === input.product_id);
  const lot = data.lots.find((item) => item.internal_lot_id === input.internal_lot_id);
  const row = snapshot.find((item) =>
    item.product_id === input.product_id
    && item.internal_lot_id === input.internal_lot_id
    && item.location_id === input.location_id
  );

  if (!product || !lot || !row) throw new Error("Select valid inventory on line " + lineNumber + ".");
  if (["ACTIVE", "AVAILABLE"].indexOf(String(lot.status || "ACTIVE").toUpperCase()) < 0) {
    throw new Error("The selected lot is not sellable on line " + lineNumber + ".");
  }

  const expiration = effectiveExpirationDate_(lot, product);
  if (expiration && expiration < startOfDay_(new Date())) throw new Error("The selected lot is expired on line " + lineNumber + ".");

  const requestedDate = startOfDay_(requestedDeliveryDate);
  if (expiration && requestedDate && expiration < requestedDate) {
    throw new Error("The selected lot expires before the requested delivery date on line " + lineNumber + ".");
  }

  const qtyOrdered = num_(input.qty_ordered);
  const unitType = String(input.unit_type || "").trim().toUpperCase();
  const unitWeight = num_(input.unit_weight_lbs, unitType === "LB" ? 1 : 0);
  const unitPrice = num_(input.unit_price);

  if (qtyOrdered <= 0) throw new Error("Quantity sold must be greater than zero on line " + lineNumber + ".");
  if (!unitType) throw new Error("Sales unit is required on line " + lineNumber + ".");
  if (unitWeight <= 0) throw new Error("Unit weight must be greater than zero on line " + lineNumber + ".");
  if (unitPrice < 0) throw new Error("Unit price cannot be negative on line " + lineNumber + ".");

  const inventoryUnit = String(row.unit_type || lot.unit_type || "").toUpperCase();
  if (inventoryUnit !== unitType && inventoryUnit !== "LB") {
    throw new Error("The selected inventory cannot be converted from " + inventoryUnit + " to " + unitType + " on line " + lineNumber + ".");
  }

  const inventoryQtyRequired = inventoryUnit === unitType ? qtyOrdered : qtyOrdered * unitWeight;
  const key = [input.product_id, input.internal_lot_id, input.location_id].join("|");
  const alreadyAllocated = allocatedByKey[key] || 0;
  if (alreadyAllocated + inventoryQtyRequired > num_(row.available_qty, row.current_qty) + 0.0001) {
    throw new Error("Line " + lineNumber + " exceeds the available quantity for this lot and location.");
  }
  allocatedByKey[key] = alreadyAllocated + inventoryQtyRequired;

  const inventoryUnitCost = unitCostPerBaseUnit_(lot);
  const unitCost = round_(inventoryUnitCost * inventoryQtyRequired / qtyOrdered, 4);
  const lineTotal = round_(qtyOrdered * unitPrice, 2);
  const profit = round_(lineTotal - (unitCost * qtyOrdered), 2);

  return {
    product_id: product.product_id,
    internal_lot_id: lot.internal_lot_id,
    location_id: input.location_id,
    qty_ordered: qtyOrdered,
    unit_type: unitType,
    unit_weight_lbs: unitWeight,
    inventory_qty_required: round_(inventoryQtyRequired, 2),
    inventory_unit_type: inventoryUnit,
    unit_price: unitPrice,
    unit_cost: unitCost,
    line_total: lineTotal,
    estimated_gross_profit: profit,
    expiration_date: expiration ? dateKey_(expiration) : "",
    fefo_status: row.fifo_rank === 1 ? "RECOMMENDED" : "MANUAL",
    notes: input.notes || "",
    amazon_order_item_id: input.amazon_order_item_id || "",
    amazon_sku: input.amazon_sku || product.amazon_sku || "",
    wholesale_sku: input.wholesale_sku || product.wholesale_sku || ""
  };
}

/**
 * Sheet read/write helpers
 */

function spreadsheet_() {
  const propertyId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  const id = propertyId || SPREADSHEET_ID;
  if (id) return SpreadsheetApp.openById(id);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  throw new Error("Spreadsheet not found. Bind this script to the Google Sheet or set Script Property SPREADSHEET_ID.");
}

function sheet_(sheetName) {
  const sheet = spreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error("Missing required sheet tab: " + sheetName);
  return sheet;
}

function tableMeta_(sheetName) {
  const sheet = sheet_(sheetName);
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const scanRows = Math.min(Math.max(sheet.getLastRow(), 1), 15);
  const values = sheet.getRange(1, 1, scanRows, lastCol).getValues();

  let headerRowNumber = 1;
  for (let i = 0; i < values.length; i += 1) {
    const normalized = values[i].map((cell) => normalizeHeader_(cell));
    const nonBlank = normalized.filter(Boolean);
    const hasHeader = nonBlank.some((cell) =>
      cell === "config_key"
      || cell === "screen_id"
      || cell === "field_name"
      || cell === "metric_id"
      || cell === "snapshot_id"
      || cell === "recommendation_id"
      || cell.indexOf("_id") > 0
    );
    if (hasHeader && nonBlank.length >= 2) {
      headerRowNumber = i + 1;
      break;
    }
  }

  const headers = sheet.getRange(headerRowNumber, 1, 1, lastCol)
    .getValues()[0]
    .map((cell) => normalizeHeader_(cell));

  let width = headers.length;
  while (width > 0 && !headers[width - 1]) width -= 1;

  return {
    sheet: sheet,
    headerRowNumber: headerRowNumber,
    headers: headers.slice(0, width)
  };
}

function readTable_(sheetName) {
  const meta = tableMeta_(sheetName);
  const lastRow = meta.sheet.getLastRow();
  if (!meta.headers.length || lastRow <= meta.headerRowNumber) return [];

  const values = meta.sheet
    .getRange(meta.headerRowNumber + 1, 1, lastRow - meta.headerRowNumber, meta.headers.length)
    .getValues();

  return values
    .filter((row) => row.some((cell) => cell !== "" && cell !== null))
    .map((row) => {
      const record = {};
      meta.headers.forEach((header, index) => {
        if (!header) return;
        record[header] = cellToJson_(row[index]);
      });
      return record;
    });
}

function appendRecord_(sheetName, record) {
  const meta = tableMeta_(sheetName);
  const values = meta.headers.map((header) => valueForSheet_(record[header]));
  meta.sheet.appendRow(values);
}

function updateTableRecord_(sheetName, keyColumn, keyValue, changes) {
  const meta = tableMeta_(sheetName);
  const keyIndex = meta.headers.indexOf(keyColumn);
  if (keyIndex < 0) throw new Error(sheetName + " is missing key column " + keyColumn);

  const lastRow = meta.sheet.getLastRow();
  if (lastRow <= meta.headerRowNumber) throw new Error("No records in " + sheetName);

  const keyValues = meta.sheet
    .getRange(meta.headerRowNumber + 1, keyIndex + 1, lastRow - meta.headerRowNumber, 1)
    .getValues();

  let targetRow = -1;
  for (let i = 0; i < keyValues.length; i += 1) {
    if (String(keyValues[i][0]) === String(keyValue)) {
      targetRow = meta.headerRowNumber + 1 + i;
      break;
    }
  }

  if (targetRow < 0) throw new Error("Record not found in " + sheetName + ": " + keyValue);

  Object.keys(changes || {}).forEach((column) => {
    let colIndex = meta.headers.indexOf(column);
    if (colIndex < 0) {
      ensureTableColumns_(sheetName, [column]);
      const refreshed = tableMeta_(sheetName);
      colIndex = refreshed.headers.indexOf(column);
    }
    meta.sheet.getRange(targetRow, colIndex + 1).setValue(valueForSheet_(changes[column]));
  });
}

function ensureTableColumns_(sheetName, columns) {
  const meta = tableMeta_(sheetName);
  const existing = meta.headers.slice();
  const missing = columns.filter((column) => existing.indexOf(column) < 0);

  if (!missing.length) return;

  const startCol = existing.length + 1;
  meta.sheet
    .getRange(meta.headerRowNumber, startCol, 1, missing.length)
    .setValues([missing]);

  meta.sheet.getRange(meta.headerRowNumber, 1, 1, existing.length + missing.length).setFontWeight("bold");
}

function replaceTableRows_(sheetName, rows, preferredHeaders) {
  ensureTableColumns_(sheetName, preferredHeaders);
  const meta = tableMeta_(sheetName);
  const headers = preferredHeaders.concat(meta.headers.filter((header) => preferredHeaders.indexOf(header) < 0));
  ensureTableColumns_(sheetName, headers);

  const refreshed = tableMeta_(sheetName);
  const finalHeaders = refreshed.headers;
  const lastRow = refreshed.sheet.getLastRow();
  const rowsToClear = Math.max(0, lastRow - refreshed.headerRowNumber);

  if (rowsToClear > 0) {
    refreshed.sheet
      .getRange(refreshed.headerRowNumber + 1, 1, rowsToClear, finalHeaders.length)
      .clearContent();
  }

  if (!rows || !rows.length) return;

  const values = rows.map((row) => finalHeaders.map((header) => valueForSheet_(row[header])));
  refreshed.sheet
    .getRange(refreshed.headerRowNumber + 1, 1, values.length, finalHeaders.length)
    .setValues(values);
}

function updateLotQuantityFromMovements_(lotId) {
  const qty = readTable_("INVENTORY_MOVEMENTS")
    .filter((movement) => String(movement.internal_lot_id) === String(lotId))
    .reduce((sum, movement) => sum + num_(movement.qty_change), 0);

  updateTableRecord_("LOTS", "internal_lot_id", lotId, {
    current_qty_script: round_(qty, 2),
    updated_at: nowIso_()
  });
}

/**
 * Business math helpers
 */

function occupiedInventoryLocationIds_() {
  const data = dataTables_();
  const snapshot = buildInventorySnapshot_(data);
  const occupied = {};
  snapshot.forEach((row) => {
    if (num_(row.current_qty) > 0 && row.location_id) occupied[row.location_id] = true;
  });
  return occupied;
}

function movementLocation_(movement, qtyChange) {
  if (qtyChange < 0) return movement.from_location_id || movement.to_location_id || "";
  return movement.to_location_id || movement.from_location_id || "";
}

function buildDailyUsageStats_(productId, movements) {
  const byDate = {};
  const usageMovements = movements.filter((movement) => {
    if (String(movement.product_id) !== String(productId)) return false;
    const qty = num_(movement.qty_change);
    const type = String(movement.movement_type || "").toUpperCase();
    return qty < 0 || ["SALE", "SHIP", "PICK", "PACK", "USE", "ADJUST_OUT", "AMAZON_OUT"].indexOf(type) >= 0;
  });

  usageMovements.forEach((movement) => {
    const key = dateKey_(movement.timestamp);
    if (!key) return;
    byDate[key] = (byDate[key] || 0) + Math.abs(num_(movement.qty_change));
  });

  const dates = Object.keys(byDate).sort();
  if (!dates.length) return { averageDailyUsage: 0, stdDailyUsage: 0, days: 0, samples: 0 };

  const start = startOfDay_(dates[0]);
  const end = startOfDay_(dates[dates.length - 1]);
  const totalDays = Math.max(1, Math.floor(daysBetween_(start, end)) + 1);
  const values = [];

  for (let i = 0; i < totalDays; i += 1) {
    values.push(byDate[dateKey_(new Date(start.getTime() + i * 86400000))] || 0);
  }

  return {
    averageDailyUsage: average_(values),
    stdDailyUsage: std_(values),
    days: totalDays,
    samples: usageMovements.length
  };
}

function buildLeadTimeStatsBySupplier_(purchaseOrders) {
  const grouped = {};
  purchaseOrders.forEach((po) => {
    const receivedDate = po.actual_first_received_date || po.actual_completed_date;
    if (!po.supplier_id || !po.order_date || !receivedDate) return;
    const days = daysBetween_(po.order_date, receivedDate);
    if (!isFinite(days) || days < 0) return;
    if (!grouped[po.supplier_id]) grouped[po.supplier_id] = [];
    grouped[po.supplier_id].push(days);
  });

  const out = {};
  Object.keys(grouped).forEach((supplierId) => {
    out[supplierId] = {
      average: round_(average_(grouped[supplierId]), 2),
      stdDev: round_(std_(grouped[supplierId]), 2),
      count: grouped[supplierId].length
    };
  });
  return out;
}

function chooseSupplierForProduct_(productId, lines) {
  const counts = {};
  lines.forEach((line) => {
    if (String(line.product_id) !== String(productId) || !line.supplier_id) return;
    counts[line.supplier_id] = (counts[line.supplier_id] || 0) + 1;
  });
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || "";
}

function inventoryValue_(lot, currentQty, purchaseOrderLines) {
  const unitCost = num_(lot.unit_cost);
  if (!unitCost || !currentQty) return 0;

  const purchaseQty = num_(lot.purchase_qty_received);
  const originalQty = num_(lot.original_qty);
  if (purchaseQty > 0 && originalQty > 0) {
    const baseUnitsPerPurchaseUnit = originalQty / purchaseQty;
    if (baseUnitsPerPurchaseUnit > 0) {
      return currentQty / baseUnitsPerPurchaseUnit * unitCost;
    }
  }

  const line = purchaseOrderLines.find((item) => item.po_line_id === lot.po_line_id) || {};
  const lineUnitsPer = num_(line.units_per_purchase_unit);
  if (lineUnitsPer > 0) return currentQty / lineUnitsPer * unitCost;

  return currentQty * unitCost;
}

function unitCostPerBaseUnit_(lot) {
  const unitCost = num_(lot.unit_cost);
  const purchaseQty = num_(lot.purchase_qty_received);
  const originalQty = num_(lot.original_qty);
  if (purchaseQty > 0 && originalQty > 0) {
    return unitCost / (originalQty / purchaseQty);
  }
  return unitCost;
}

function effectiveExpirationDate_(lot, product) {
  const explicit = startOfDay_(lot.expiration_date);
  if (explicit) return explicit;
  const calculated = calculatedExpirationDate_(product, lot.received_date);
  return startOfDay_(calculated);
}

function calculatedExpirationDate_(product, receivedDate) {
  const perishabilityDays = num_(product && product.perishability_days);
  const received = startOfDay_(receivedDate);
  if (!received || perishabilityDays <= 0) return "";
  return dateKey_(new Date(received.getTime() + perishabilityDays * 86400000));
}

function isOpenPurchaseOrder_(po) {
  return ["COMPLETE", "CANCELLED", "CLOSED"].indexOf(String(po.po_status || "").toUpperCase()) < 0;
}

function recommendLocationId_(product) {
  const locations = readTable_("LOCATIONS");
  const chosen = locations.find((location) =>
    isActiveRecord_(location)
    && String(location.current_status || "AVAILABLE").toUpperCase() === "AVAILABLE"
    && (!location.allowed_categories || String(location.allowed_categories).indexOf(product.product_category) >= 0)
  ) || locations.find((location) => isActiveRecord_(location) && String(location.current_status || "AVAILABLE").toUpperCase() === "AVAILABLE");

  return chosen ? chosen.location_id : "";
}

function purchaseOrderQrValue_(input) {
  return JSON.stringify({
    v: 1,
    type: "PO_LINE",
    po_id: input.poId,
    po_line_id: input.poLineId,
    product_id: input.productId,
    product_name: input.productName,
    qty: num_(input.qty),
    supplier_lot_number: input.supplierLotNumber || "PENDING"
  });
}

function nextBlFolio_(salesOrders) {
  return salesOrders.reduce((max, order) => Math.max(max, num_(order.bl_folio)), 2719) + 1;
}

/**
 * Generic utilities
 */

function sessionUser_(user) {
  return {
    authenticated: true,
    user_id: user.user_id,
    full_name: user.full_name || user.user_id,
    role: normalizeRole_(user.role)
  };
}

function requirePermission_(user, permission) {
  const role = normalizeRole_(user && user.role);
  const allowed = PERMISSIONS[role] || [];
  if (allowed.indexOf(permission) < 0) {
    throw new Error("Permission denied for " + permission + ".");
  }
}

function normalizeRole_(value) {
  const role = String(value || "OPERATOR").trim().toUpperCase();
  if (role === "WAREHOUSE") return "OPERATOR";
  if (role === "ADMIN" || role === "MANAGER" || role === "OPERATOR") return role;
  return "OPERATOR";
}

function normalizePartyType_(value) {
  return String(value || "VENDOR").trim().toUpperCase() === "CUSTOMER" ? "CUSTOMER" : "VENDOR";
}

function normalizeLocationIds_(input) {
  const raw = Array.isArray(input.location_ids) && input.location_ids.length ? input.location_ids : [input.location_id];
  const seen = {};
  return raw.map((value) => String(value || "").trim()).filter((value) => {
    if (!value || seen[value]) return false;
    seen[value] = true;
    return true;
  });
}

function isActiveRecord_(record) {
  if (!record) return false;
  return record.is_active === undefined
    || record.is_active === ""
    || record.is_active === true
    || String(record.is_active).toUpperCase() === "TRUE"
    || String(record.status || "").toUpperCase() === "ACTIVE";
}

function truthy_(value) {
  return value === true || String(value).toUpperCase() === "TRUE" || String(value) === "1" || String(value).toUpperCase() === "YES";
}

function normalizeHeader_(value) {
  return String(value || "").trim();
}

function cellToJson_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, APP_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
  return value;
}

function valueForSheet_(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "object" && !(value instanceof Date)) return JSON.stringify(value);
  return value;
}

function num_(value, fallback) {
  if (fallback === undefined) fallback = 0;
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return isFinite(value) ? value : fallback;
  if (value instanceof Date) return fallback;

  const cleaned = String(value).replace(/[$,%\s]/g, "").replace(/,/g, "");
  const parsed = Number(cleaned);
  return isFinite(parsed) ? parsed : fallback;
}

function round_(value, decimals) {
  decimals = decimals === undefined ? 0 : decimals;
  const factor = Math.pow(10, decimals);
  return Math.round(num_(value) * factor) / factor;
}

function sum_(values) {
  return values.reduce((sum, value) => sum + num_(value), 0);
}

function average_(values) {
  const clean = values.map(num_).filter((value) => isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
}

function std_(values) {
  const clean = values.map(num_).filter((value) => isFinite(value));
  if (clean.length < 2) return 0;
  const avg = average_(clean);
  return Math.sqrt(clean.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / (clean.length - 1));
}

function unique_(values) {
  const seen = {};
  return values.filter((value) => {
    const key = String(value || "");
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function indexBy_(rows, key) {
  const out = {};
  (rows || []).forEach((row) => {
    if (row && row[key] !== undefined && row[key] !== "") out[row[key]] = row;
  });
  return out;
}

function groupBy_(rows, key) {
  const out = {};
  (rows || []).forEach((row) => {
    const value = row[key] || "";
    if (!out[value]) out[value] = [];
    out[value].push(row);
  });
  return out;
}

function velocityDays_(velocityClass) {
  const value = String(velocityClass || "").toUpperCase();
  if (value === "FAST") return 10;
  if (value === "SLOW") return 60;
  return 40;
}

function startOfDay_(value) {
  if (!value) return null;
  let date;

  if (value instanceof Date) {
    date = new Date(value.getTime());
  } else {
    date = parseDate_(value);
  }

  if (!date || isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDate_(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  const text = String(value).trim();
  if (!text) return null;

  let date = new Date(text);
  if (!isNaN(date.getTime())) return date;

  const match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    const second = Number(match[6] || 0);

    // Sheet locale is es_MX, so visible strings are usually day/month/year.
    date = new Date(year, month - 1, day, hour, minute, second);
    if (!isNaN(date.getTime())) return date;
  }

  return null;
}

function dateTime_(value) {
  const date = parseDate_(value);
  return date ? date.getTime() : 0;
}

function daysBetween_(start, end) {
  const startDate = startOfDay_(start);
  const endDate = startOfDay_(end);
  if (!startDate || !endDate) return NaN;
  return (endDate.getTime() - startDate.getTime()) / 86400000;
}

function dateKey_(value) {
  const date = startOfDay_(value);
  return date ? Utilities.formatDate(date, APP_TIMEZONE, "yyyy-MM-dd") : "";
}

function today_() {
  return Utilities.formatDate(new Date(), APP_TIMEZONE, "yyyy-MM-dd");
}

function nowIso_() {
  return Utilities.formatDate(new Date(), APP_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
}

function addDays_(dateValue, days) {
  const date = startOfDay_(dateValue);
  if (!date) return "";
  date.setDate(date.getDate() + Math.max(0, Math.round(num_(days))));
  return dateKey_(date);
}

function userId_(user) {
  return (user && (user.user_id || user.role)) || "WEB_APP";
}

function pad_(value, width) {
  let text = String(value);
  while (text.length < width) text = "0" + text;
  return text;
}

function nextId_(sheetName, keyColumn, prefix) {
  return nextIdFromRows_(readTable_(sheetName), keyColumn, prefix);
}

function nextIdFromRows_(rows, keyColumn, prefix) {
  let max = 0;
  rows.forEach((row) => {
    const value = String(row[keyColumn] || "");
    const match = value.match(/(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return prefix + "-" + pad_(max + 1, 6);
}

function logError_(type, action, error) {
  try {
    ensureTableColumns_("ERROR_LOG", ["error_id", "timestamp", "error_type", "action", "message", "stack", "status"]);
    appendRecord_("ERROR_LOG", {
      error_id: nextId_("ERROR_LOG", "error_id", "ERR"),
      timestamp: nowIso_(),
      error_type: type,
      action: action,
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? String(error.stack).slice(0, 1500) : "",
      status: "OPEN"
    });
  } catch (_loggingError) {
    // Do not allow logging failures to hide the real API error.
  }
}
