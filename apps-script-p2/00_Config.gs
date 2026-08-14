/**
 * San Jose Operational System — server configuration and live workbook schema.
 *
 * Keep deployment settings here. Business logic belongs in its own module.
 */
var SJ_CONFIG = Object.freeze({
  SPREADSHEET_ID: '1uAY5LW6SFvEGHf1NxHpB7mOYR28TMlTusadHc-KG3EM',
  API_VERSION: 'operations-v1-2026-08-12',
  SCHEMA_VERSION: 'san-jose-operational-v1',
  TIME_ZONE: 'America/Chicago',
  SESSION_TTL_SECONDS: 21600,
  MAX_PAGE_SIZE: 250,
  MAX_HISTORY: 500,
  MAX_BATCH_ROWS: 200,
  LOCK_TIMEOUT_MS: 25000,
  EPSILON: 0.000001,
  SHOPIFY_PARTY_ID: 'CUST-52',
  ROLES: Object.freeze(['ADMIN', 'WAREHOUSE'])
});

var SJ_SHEETS = Object.freeze({
  USERS: Object.freeze({
    id: 'user_id',
    headers: ['user_id', 'full_name', 'role', 'credential_hash', 'is_active', 'last_login_at', 'created_at', 'updated_at']
  }),
  PRODUCTS: Object.freeze({
    id: 'product_id',
    headers: ['product_id', 'product_name', 'category', 'inventory_dimension', 'base_unit', 'sku', 'barcode', 'is_active', 'created_at', 'updated_at']
  }),
  PRODUCT_UNITS: Object.freeze({
    id: 'product_unit_id',
    headers: ['product_unit_id', 'product_id', 'unit_code', 'conversion_to_base', 'purchase_enabled', 'sales_enabled', 'is_default_purchase', 'is_default_sales', 'updated_at']
  }),
  PARTIES: Object.freeze({
    id: 'party_id',
    headers: ['party_id', 'party_type', 'party_name', 'contact_name', 'email', 'phone', 'address', 'payment_terms', 'currency', 'is_active', 'created_at', 'updated_at']
  }),
  LOCATIONS: Object.freeze({
    id: 'location_id',
    headers: ['location_id', 'location_type', 'rack', 'level', 'position', 'is_active', 'scan_code', 'notes']
  }),
  ORDERS: Object.freeze({
    id: 'order_id',
    headers: ['order_id', 'order_type', 'party_id', 'order_date', 'expected_or_ship_date', 'status', 'currency', 'subtotal_amount', 'tax_amount', 'shipping_amount', 'total_amount', 'amount_paid', 'balance_due', 'payment_status', 'external_reference', 'created_by', 'created_at', 'updated_at', 'notes']
  }),
  ORDER_LINES: Object.freeze({
    id: 'order_line_id',
    headers: ['order_line_id', 'order_id', 'product_id', 'quantity', 'unit_code', 'conversion_to_base', 'base_quantity', 'unit_price', 'line_total', 'cost_per_base_snapshot', 'gross_profit', 'quantity_completed_base', 'status', 'notes']
  }),
  PAYMENTS: Object.freeze({
    id: 'payment_id',
    headers: ['payment_id', 'order_id', 'payment_direction', 'payment_date', 'payment_method', 'amount', 'reference_number', 'status', 'entered_by', 'created_at', 'notes']
  }),
  LOTS: Object.freeze({
    id: 'lot_id',
    headers: ['lot_id', 'product_id', 'vendor_party_id', 'source_order_line_id', 'supplier_lot_number', 'received_at', 'received_base_qty', 'received_unit_qty', 'unit_code', 'conversion_to_base', 'cost_per_base', 'currency', 'expiration_date', 'quality_status', 'lot_status', 'created_at', 'notes']
  }),
  INVENTORY_BALANCES: Object.freeze({
    id: 'balance_key',
    headers: ['balance_key', 'product_id', 'lot_id', 'location_id', 'current_base_qty', 'last_movement_sequence', 'updated_at']
  }),
  INVENTORY_MOVEMENTS: Object.freeze({
    id: 'movement_sequence',
    headers: ['movement_sequence', 'movement_id', 'movement_type', 'occurred_at', 'product_id', 'lot_id', 'quantity_base', 'entered_qty', 'entered_unit', 'conversion_to_base', 'from_location_id', 'to_location_id', 'order_id', 'order_line_id', 'task_id', 'operation_id', 'user_id', 'approval_status', 'notes']
  }),
  WAREHOUSE_TASKS: Object.freeze({
    id: 'task_id',
    headers: ['task_id', 'task_type', 'source_order_id', 'source_order_line_id', 'product_id', 'requested_base_qty', 'from_location_id', 'to_location_id', 'assigned_user_id', 'status', 'priority', 'created_at', 'started_at', 'completed_at', 'notes']
  }),
  DAILY_PRODUCT_METRICS: Object.freeze({
    id: 'metric_date',
    unique: Object.freeze(['metric_date', 'product_id']),
    headers: ['metric_date', 'product_id', 'opening_qty', 'received_qty', 'sold_qty', 'amazon_consumed_qty', 'returned_qty', 'waste_qty', 'closing_qty', 'purchase_cost', 'sales_revenue', 'cogs', 'gross_profit', 'closing_inventory_value', 'through_movement_sequence', 'calculated_at']
  }),
  AUDIT_LOG: Object.freeze({
    id: 'audit_id',
    headers: ['audit_id', 'occurred_at', 'user_id', 'action_type', 'table_name', 'record_id', 'old_value', 'new_value', 'notes']
  })
});

var SJ_PERMISSIONS = Object.freeze({
  ADMIN: Object.freeze([
    'admin.users', 'catalog.write', 'orders.write', 'payments.write',
    'inventory.move', 'inventory.receive', 'inventory.adjust', 'inventory.count',
    'tasks.write', 'reports.read'
  ]),
  WAREHOUSE: Object.freeze([
    'inventory.move', 'inventory.receive', 'inventory.count',
    'tasks.write', 'reports.read'
  ])
});

var SJ_SCRIPT_PROPERTIES = Object.freeze({
  SESSION_SECRET: 'SESSION_SECRET',
  WRITES_ENABLED: 'OPERATIONS_WRITES_ENABLED',
  LEGACY_WRITE_TOKEN: 'INVENTORY_WRITE_TOKEN',
  ALLOW_LEGACY_WRITE_TOKEN: 'ALLOW_LEGACY_WRITE_TOKEN'
});
