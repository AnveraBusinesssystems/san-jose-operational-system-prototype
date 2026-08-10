# San Jose P2 Inventory API Contract

Backend: `apps-script-p2/Code.gs`
Spreadsheet: `San Jose Optimized Operational Database v1`
Spreadsheet ID: `1uAY5LW6SFvEGHf1NxHpB7mOYR28TMlTusadHc-KG3EM`

## Scope

This backend is inventory-only. It does not create/edit sales orders, purchase orders, payments, analytics, customers, vendors, or financial data.

## Inventory tabs and columns

### PRODUCTS
Read only for inventory.

- A `product_id`
- B `product_name`
- C `category`
- D `inventory_dimension`
- E `base_unit`
- F `sku`
- G `barcode`
- H `is_active`
- I `created_at`
- J `updated_at`

Inventory uses PRODUCTS to verify that a product exists, is active, and to determine the product base unit.

### PRODUCT_UNITS
Read only for inventory.

- A `product_unit_id`
- B `product_id`
- C `unit_code`
- D `conversion_to_base`
- E `purchase_enabled`
- F `sales_enabled`
- G `is_default_purchase`
- H `is_default_sales`

Important: PRODUCT_UNITS is the current/default conversion table. For stock that already belongs to a historical lot, `LOTS.conversion_to_base` is authoritative.

### LOCATIONS
Read only for inventory configuration.

- A `location_id`
- B `location_type`
- C `rack`
- D `level`
- E `position`
- F `is_active`
- G `scan_code`
- H `notes`

Current location model:

- R01-R50
- 9 spaces per rack
- FLOOR-1
- FLOOR-2
- PACKING

A location is not stored as AVAILABLE/OCCUPIED. It is empty when it has no positive INVENTORY_BALANCES rows.

Mixed storage is valid: multiple product/lot balance rows can share one location.

### LOTS
Read and append only for physical-count stock that has no existing lot.

- A `lot_id`
- B `product_id`
- C `vendor_party_id`
- D `source_order_line_id`
- E `supplier_lot_number`
- F `received_at`
- G `received_base_qty`
- H `received_unit_qty`
- I `unit_code`
- J `conversion_to_base`
- K `cost_per_base`
- L `currency`
- M `expiration_date`
- N `quality_status`
- O `lot_status`
- P `created_at`
- Q `notes`

A lot is a batch/receipt identity, not a location. The same lot can exist in multiple locations.

When `adjustInventoryIn` has no lot_id and cannot safely reuse a matching supplier lot, the backend creates a new lot with a compact ID such as `LOT-319`.

### INVENTORY_BALANCES
This is the authoritative current-state inventory table.

- A `balance_key`
- B `product_id`
- C `lot_id`
- D `location_id`
- E `current_base_qty`
- F `last_movement_sequence`
- G `updated_at`

Key:

`product_id|lot_id|location_id`

Rules:

- one balance row per exact Product + Lot + Location
- only positive balances should remain
- when quantity reaches zero, the row is cleared
- balance quantity is always in the product base unit
- `last_movement_sequence` is used for stale-screen/concurrency checking

### INVENTORY_MOVEMENTS
Append-only inventory audit/event ledger.

- A `movement_sequence`
- B `movement_id`
- C `movement_type`
- D `occurred_at`
- E `product_id`
- F `lot_id`
- G `quantity_base`
- H `entered_qty`
- I `entered_unit`
- J `conversion_to_base`
- K `from_location_id`
- L `to_location_id`
- M `order_id`
- N `order_line_id`
- O `task_id`
- P `operation_id`
- Q `user_id`
- R `approval_status`
- S `notes`

Every inventory write appends one movement row.

`operation_id` is mandatory on every write and is the idempotency key. If the browser retries the same operation_id, the backend returns the existing movement instead of changing stock again.

### AUDIT_LOG
Secondary audit record.

- A `audit_id`
- B `occurred_at`
- C `user_id`
- D `action_type`
- E `table_name`
- F `record_id`
- G `old_value`
- H `new_value`
- I `notes`

### USERS
Inventory writes currently use USERS only to confirm the supplied user_id is active and that the role is allowed.

- A `user_id`
- B `full_name`
- C `role`
- D `credential_hash`
- E `is_active`
- F `last_login_at`
- G `created_at`
- H `updated_at`

The inventory API never returns `credential_hash`.

Real authenticated session-token validation should replace direct user_id trust when the login backend is connected.

---

# READ actions

GET is read-only. No GET action is allowed to change the spreadsheet.

## `inventoryHealth`

Reads:

- PRODUCTS
- LOCATIONS
- LOTS
- INVENTORY_BALANCES
- INVENTORY_MOVEMENTS

Returns integrity checks such as:

- active products
- active locations
- positive balance lines
- duplicate balance keys
- orphan product/lot/location balances
- wrong product/lot relationships
- negative balances
- occupied rack spaces
- open rack spaces
- rack utilization
- mixed locations
- totals separated by base unit

Changes: none.

## `inventoryBootstrap`

Reads:

- PRODUCTS
- PRODUCT_UNITS
- LOCATIONS
- LOTS
- INVENTORY_BALANCES

Returns the main inventory payload for P2:

- every active product, including zero-stock products
- unit options
- every active location
- every positive stock line with product/lot/location details
- inventory summary

Changes: none.

## `getLocationInventory`

Payload:

```json
{"location_id":"R03-L1-F"}
```

Reads the exact location and returns all positive product/lot stock lines stored there.

Changes: none.

## `getRackInventory`

Payload:

```json
{"rack":"R03"}
```

Returns all 9 physical spaces for the rack plus all positive stock lines in each space.

Changes: none.

## `getProductInventory`

Payload:

```json
{"product_id":"PROD-1"}
```

Returns the product, product units, current total on hand, and every positive lot/location stock line.

Changes: none.

## `getMovementHistory`

Optional filters:

- `product_id`
- `lot_id`
- `location_id`
- `limit` (max 200)

Changes: none.

---

# WRITE actions

All writes:

1. require POST
2. require `operation_id`
3. use a Script Lock
4. validate product / lot / location
5. reject duplicate operation_id
6. optionally validate `expected_source_sequence`
7. update current-state balance(s)
8. append an INVENTORY_MOVEMENTS row
9. append a secondary AUDIT_LOG record

## `moveInventory`

Purpose: move existing stock from one physical location to another.

Allowed roles: ADMIN, MANAGER, OPERATOR.

Typical payload:

```json
{
  "user_id":"ANGEL",
  "operation_id":"MOVE-CLIENT-12345",
  "product_id":"PROD-1",
  "lot_id":"LOT-1",
  "from_location_id":"R03-L1-F",
  "to_location_id":"R10-L2-M",
  "quantity":10,
  "unit_code":"CASE",
  "expected_source_sequence":1,
  "notes":"Relocated during warehouse organization"
}
```

Reads:

- PRODUCTS
- LOTS
- LOCATIONS
- INVENTORY_BALANCES
- INVENTORY_MOVEMENTS
- USERS

Changes:

Source INVENTORY_BALANCES:

`current_base_qty = old source qty - moved base qty`

Destination INVENTORY_BALANCES:

`current_base_qty = old destination qty + moved base qty`

Both affected balance rows get the new `last_movement_sequence`.

If source reaches zero, its balance row is cleared.

Appends movement:

`movement_type = MOVE`

Company total inventory: NO CHANGE.

## `adjustInventoryIn`

Purpose: add stock that physically exists but is missing from the system.

Allowed roles: ADMIN, MANAGER.

Can use an existing `lot_id`, or create/reuse a count lot when no lot_id exists.

Typical existing-lot payload:

```json
{
  "user_id":"ANGEL",
  "operation_id":"COUNT-FOUND-123",
  "product_id":"PROD-1",
  "lot_id":"LOT-1",
  "location_id":"R03-L1-F",
  "quantity":2,
  "unit_code":"CASE",
  "reason":"PHYSICAL COUNT",
  "notes":"Two extra cases found"
}
```

Typical new/unknown historical lot payload:

```json
{
  "user_id":"ANGEL",
  "operation_id":"COUNT-FOUND-124",
  "product_id":"PROD-4",
  "location_id":"R20-L3-B",
  "quantity":8,
  "unit_code":"BAG",
  "conversion_to_base":50,
  "supplier_lot_number":"VISIBLE-LOT-77",
  "expiration_date":"2027-06-30"
}
```

Changes:

- may append a LOTS row
- adds quantity to exact Product + Lot + Location balance
- appends `ADJUST_IN` movement

Company total inventory: INCREASES.

## `adjustInventoryOut`

Purpose: remove missing, damaged, wasted, or correction stock from one exact stock line.

Allowed roles: ADMIN, MANAGER.

Typical payload:

```json
{
  "user_id":"ANGEL",
  "operation_id":"ADJ-OUT-123",
  "product_id":"PROD-1",
  "lot_id":"LOT-1",
  "location_id":"R03-L1-F",
  "quantity":1,
  "unit_code":"CASE",
  "expected_source_sequence":1,
  "reason":"DAMAGED"
}
```

Changes:

`current_base_qty = old qty - removed base qty`

Appends `ADJUST_OUT` movement.

Cannot remove more than current balance.

Company total inventory: DECREASES.

## `physicalCount`

Purpose: set one exact Product + Lot + Location stock line to the physical quantity actually counted.

Allowed roles: ADMIN, MANAGER, OPERATOR.

Typical payload:

```json
{
  "user_id":"ANGEL",
  "operation_id":"COUNT-R03-L1-F-001",
  "product_id":"PROD-1",
  "lot_id":"LOT-1",
  "location_id":"R03-L1-F",
  "actual_quantity":40,
  "unit_code":"CASE",
  "expected_source_sequence":1
}
```

Logic:

`actual base qty = actual_quantity × historical LOTS.conversion_to_base`

`difference = actual base qty - current balance`

If difference > 0:

- balance becomes actual count
- append `ADJUST_IN`

If difference < 0:

- balance becomes actual count
- append `ADJUST_OUT`

If difference = 0:

- no INVENTORY_MOVEMENTS row is required
- AUDIT_LOG records that the stock line was verified

Company total inventory changes only by the counted difference.

## `packingDeduct`

Purpose: remove product actually consumed/sold/used from the PACKING staging location.

Allowed roles: ADMIN, MANAGER, OPERATOR.

Typical payload:

```json
{
  "user_id":"ANGEL",
  "operation_id":"PACK-DEDUCT-001",
  "product_id":"PROD-1",
  "lot_id":"LOT-1",
  "quantity":100,
  "unit_code":"LB",
  "expected_source_sequence":320
}
```

Reads only the exact PACKING balance for the product and lot.

Changes:

`PACKING current_base_qty = old qty - deducted base qty`

Appends `PACKING_DEDUCT` movement.

Company total inventory: DECREASES.

Moving stock into PACKING is NOT packingDeduct. Use `moveInventory` with `to_location_id = PACKING`.

Returning stock from PACKING is also `moveInventory` with `from_location_id = PACKING`.

---

# Core inventory accounting rules

- OPENING_INVENTORY / RECEIVE / ADJUST_IN / CUSTOMER_RETURN increase company inventory.
- ADJUST_OUT / SALE / WASTE / PACKING_DEDUCT decrease company inventory.
- MOVE changes physical location only and must never change total company inventory.
- PACKING is an internal location, not an inventory deduction by itself.
- Mixed locations are supported.
- No forced FIFO is used.
- Historical lot conversion in LOTS is authoritative for existing stock.
- PRODUCT_UNITS represents current/default unit options, not historical receipt conversion.
- The frontend must not trust cached quantity when posting. The backend rereads the balance inside the lock.
- `expected_source_sequence` should be sent by the frontend for MOVE, ADJUST_OUT, physicalCount, and packingDeduct to detect stale screens.
