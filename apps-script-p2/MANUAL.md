# San Jose Operational System — Apps Script Manual

Workbook: **San Jose Optimized Operational Database v1**

Spreadsheet ID: `1uAY5LW6SFvEGHf1NxHpB7mOYR28TMlTusadHc-KG3EM`

Time zone: `America/Chicago`

## 1. What this backend does

The backend connects the website to the live Google Sheet. It provides:

- signed user sessions;
- role and permission checks on every mutation;
- products, units, customers, and vendors;
- unified sales and purchase orders;
- payments and balance updates;
- current inventory, searches, and movement history;
- receiving, moving, counting, and correcting inventory;
- warehouse work tasks;
- demand, website, and dashboard metrics;
- schema and inventory health checks;
- a secondary audit log.

GET requests are read-only. All writes use POST, require the global write switch, require authorization, and execute under a script lock when concurrent writes could collide.

## 2. Live workbook analysis

The code was designed against the current workbook contents on August 12, 2026.

| Table | Current records | Important finding |
| --- | ---: | --- |
| USERS | 1 | one active ADMIN user |
| PRODUCTS | 198 | all active; 182 LB and 16 UNIT products |
| PRODUCT_UNITS | 371 | all conversions are positive |
| PARTIES | 68 | 7 vendors, 60 customers, 1 both |
| LOCATIONS | 453 | 450 rack spaces, 2 floor spaces, 1 packing space |
| ORDERS | 1,252 | 88 purchases and 1,164 sales; all currently COMPLETE historical records |
| ORDER_LINES | 2,253 | 319 purchase lines and 1,934 sale lines |
| PAYMENTS | 235 | all POSTED |
| LOTS | 318 | all ACTIVE; all have cost; none currently have expiration dates |
| INVENTORY_BALANCES | 318 | all positive; 55 stocked products; 318 occupied locations |
| INVENTORY_MOVEMENTS | 318 | opening migration events only |
| WAREHOUSE_TASKS | 0 | ready for live task creation |
| DAILY_PRODUCT_METRICS | 1,889 | formula-backed daily history |
| AUDIT_LOG | 0 | ready for backend mutations |
| DEMAND | 198 | 96 products have demand; 67 have suggested orders |

Current on-hand inventory is `458,412.68 LB`. The current rack occupancy is `318 / 450 = 70.7%`.

Shopify is already part of the unified order tables through party `CUST-52` (`SHOPIFY`). The live data contains 850 Shopify orders, 1,083 completed Shopify sale lines, `12,399.505` base pounds sold, and `$45,553.47` in line sales. Demand formulas include these rows because they include every completed `SALE` order without excluding `CUST-52`.

### Demand formulas currently used

- Recent demand: completed sale base quantity from the previous 14 days ÷ 2 weeks.
- Mid demand: completed sale base quantity from days 15–42 ÷ 4 weeks.
- Historical demand: completed sale base quantity from days 43–98 ÷ 8 weeks.
- Weighted demand: `recent × 0.50 + mid × 0.30 + historical × 0.20`.
- Service level: `90%`, whose normal factor is approximately `1.28155`.
- Safety stock: `NORM.S.INV(0.90) × STDEV(recent, mid, historical) × SQRT(lead time weeks)`.
- Reorder point: `weighted weekly demand × lead time weeks + safety stock`.
- Inventory position: `free inventory + incoming inventory`.
- Order quantity: `MAX(reorder point − inventory position, 0)`.
- Confidence: GOOD when variation ÷ demand is at most 0.25, MID through 0.60, otherwise LOW.

Every current product reports LOW confidence. This is not a script failure: the historical orders end before the current date, inventory exists for only 55 of 198 products, and confidence currently compares three broad window averages rather than daily observations. The backend reports the live calculation faithfully; changing the forecasting model should be a separate formula decision.

## 3. Data ownership rules

- `PRODUCTS`, `PRODUCT_UNITS`, `PARTIES`, and `LOCATIONS` are master tables.
- `ORDERS` owns header totals, dates, status, and balances.
- `ORDER_LINES` owns product quantities, conversions, prices, completion, and gross profit snapshots.
- `LOTS` owns historical unit conversion and cost for received stock.
- `INVENTORY_BALANCES` is the authoritative current inventory state.
- `INVENTORY_MOVEMENTS` is the append-only inventory event ledger.
- `AUDIT_LOG` is the secondary record of administrative changes.
- `DEMAND`, `OPERATIONS_METRICS`, and `WEBSITE_METRICS` remain formula-backed read models.

Never delete or edit a saved inventory movement. Correct inventory by posting another movement or a physical count.

## 4. Security and setup

### Script properties

| Property | Purpose |
| --- | --- |
| `SESSION_SECRET` | signs session tokens; generated automatically if missing |
| `OPERATIONS_WRITES_ENABLED` | global kill switch; must equal `TRUE` for writes |
| `ALLOW_LEGACY_WRITE_TOKEN` | optional temporary compatibility switch |
| `INVENTORY_WRITE_TOKEN` | optional temporary legacy token; do not store in source code |

The normal path is username/password login and a signed `session_token`. Legacy token support is disabled unless explicitly enabled.

Users sign in with only a unique four-digit numeric PIN. PINs use the existing workbook format: `sha256$salt$digest`, and the server never returns `credential_hash`.

### Roles

`ADMIN` can manage users, catalogs, orders, payments, inventory, tasks, and reports.

`WAREHOUSE` can receive, move, and count inventory, work tasks, and read reports. It cannot create catalog records, edit financial orders, post payments, or perform unrestricted inventory adjustments.

Existing `MANAGER` or `OPERATOR` role text is normalized to `WAREHOUSE` for compatibility.

## 5. HTTP format

### Read

```text
GET WEB_APP_URL?action=inventoryBootstrap&payload={}
```

The website may add a JSONP `callback` parameter. Callback names are validated.

### Write

```json
{
  "action": "moveInventory",
  "payload": {
    "session_token": "SIGNED_SESSION",
    "operation_id": "WEB-UNIQUE-ID",
    "product_id": "PROD-1",
    "lot_id": "LOT-1",
    "from_location_id": "R03-L1-F",
    "to_location_id": "PACKING",
    "quantity": 1,
    "unit_code": "CASE",
    "expected_source_sequence": 1
  }
}
```

Every response has `ok`, `action`, `version`, and either `result` or `error`.

## 6. Public read functions

### `sjApiInfo()` / actions `apiInfo`, `ping`

Returns version, schema version, spreadsheet ID, available actions, write-switch state, authentication mode, and the Shopify party ID. It performs no table mutation.

### `sjSchemaHealth()` / action `schemaHealth`

Checks every declared core tab, exact required headers, record counts, and duplicate primary IDs. Use this after any column rename or workbook restructuring.

### `sjListProducts(payload)` / action `listProducts`

Filters active products by default, searches ID/name/category/SKU/barcode, attaches product-unit rows, sorts by name, and paginates. Inputs: `query`, `include_inactive`, `offset`, `limit`.

### `sjGetProduct(payload)` / action `getProduct`

Returns one product plus its unit conversions. Requires `product_id`.

### `sjListParties(payload)` / action `listParties`

Returns customers, vendors, or both. Inputs: `party_type`, `query`, `include_inactive`, pagination. A `BOTH` party qualifies for either customer or vendor filtering.

### `sjListLocations(payload)` / action `listLocations`

Returns active locations by default. Inputs: `location_type`, `rack`, `include_inactive`, and pagination.

### `sjListOrders(payload)` / action `listOrders`

Returns order headers with party details. Inputs: `order_type`, `status`, `party_id`, `query`, and pagination. Results sort newest first.

### `sjGetOrder(payload)` / action `getOrder`

Returns one order, its party, all lines with product names/base units, and all related payments. Requires `order_id`.

### `sjListPayments(payload)` / action `listPayments`

Returns payments newest first. Optional `order_id` narrows the result.

### `sjInventoryBootstrap()` / action `inventoryBootstrap`

Returns every active product, unit options, every active location, decorated positive balance lines, and the inventory summary. Zero-stock products remain visible.

### `sjInventoryMetrics()` / actions `inventoryMetrics`, `getInventoryMetrics`

Returns quantities by base unit, estimated inventory value, positive balance lines, active/occupied/open rack locations, utilization, and mixed-product locations.

### `sjInventoryFormOptions()` / action `inventoryFormOptions`

Returns products and locations for website selectors.

### `sjGetLocationInventory(payload)` / action `getLocationInventory`

Returns the exact active location and all positive lot lines in it. Requires `location_id`.

### `sjGetRackInventory(payload)` / action `getRackInventory`

Returns every configured space in one rack and its inventory. Requires a rack such as `R03`.

### `sjGetProductInventory(payload)` / action `getProductInventory`

Returns one active product, units, total on hand, and all lot/location lines. Requires `product_id`.

### `sjGetLotInventory(payload)` / action `getLotInventory`

Returns one lot and every location containing it. Requires `lot_id`.

### `sjGetMovementHistory(payload)` / action `getMovementHistory`

Returns the newest movement rows. Filters: `product_id`, `location_id`, `movement_type`, and `limit` up to 500.

### `sjLookupInventory(payload)` / action `lookupInventory`

Searches product IDs, names, SKU/barcode, lot IDs, supplier lots, location IDs, and scan codes. Requires `query` or `scan`.

### `sjInventoryHealth()` / action `inventoryHealth`

Checks duplicate balance keys, missing products/lots/locations, lot/product mismatches, negative balances, and returns inventory summary. It never repairs data automatically.

### `sjInventoryContract()` / action `inventoryContract`

Returns the inventory source-of-truth and audit rules in machine-readable form.

### `sjListWarehouseTasks(payload)` / action `listWarehouseTasks`

Filters tasks by `status`, `assigned_user_id`, and `task_type`; sorts priority first, then oldest first; paginates.

### `sjGetDemandMetrics(payload)` / action `getDemandMetrics`

Reads the live `DEMAND` formulas and returns both rows and the calculation methodology. Filters: `product_id`, `confidence`, `reorder_only`, and pagination.

### `sjGetWebsiteMetrics()` / action `getWebsiteMetrics`

Returns each `WEBSITE_METRICS` row with value, unit, definition, source, and quality.

### `sjGetDashboard()` / action `getDashboard`

Returns website metrics both as a list and keyed object, plus the current inventory summary.

## 7. Public write functions

### `sjLogin(payload)` / action `login`

Accepts a four-digit PIN in `password`, identifies the one active matching user, updates last-login time, and returns a signed six-hour session plus the public user record. Legacy `user_id`/`username` remains optional during migration.

### `sjSessionInfo(payload)` / action `sessionInfo`

Verifies `session_token` and returns the current public user plus write-switch state.

### `sjCreateUser(payload)` / action `createUser`

ADMIN only. Requires `user_id`, `full_name`, `role`, and a PIN containing exactly four numbers. Hashes the PIN and appends the user.

### `sjSetUserStatus(payload)` / action `setUserStatus`

ADMIN only. Activates or deactivates `target_user_id`. The current user cannot deactivate their own account.

### `sjCreateProduct(payload)` / action `createProduct`

ADMIN only. Creates the product and its unit rows in one locked operation. The base unit is always added with conversion 1. Duplicate unit codes or invalid conversions are rejected.

### `sjUpdateProduct(payload)` / action `updateProduct`

ADMIN only. Updates name, category, SKU, barcode, or active status. It intentionally does not change the base unit after inventory exists.

### `sjCreateParty(payload)` / action `createParty`

ADMIN only. Creates a `VENDOR`, `CUSTOMER`, or `BOTH` record with contact, terms, currency, and timestamps.

### `sjUpdateParty(payload)` / action `updateParty`

ADMIN only. Updates party details, type, currency, or active status. It does not delete historical parties.

### `sjCreateOrder(payload)` / action `createOrder`

ADMIN only. Creates either `SALE` or `PURCHASE`, validates the party type, validates product units, snapshots conversions and costs, calculates totals, appends all lines, and audits the operation.

Required line fields: `product_id`, `quantity`, `unit_code`, and `unit_price`. Sales lines receive a current cost snapshot and gross-profit estimate.

### `sjUpdateOrder(payload)` / action `updateOrder`

ADMIN only. Updates open-order date/reference/notes/status fields. COMPLETE, CANCELLED, and VOID orders are immutable.

### `sjCancelOrder(payload)` / action `cancelOrder`

ADMIN only. Requires a reason. Marks the order CANCELLED and cancels incomplete lines. It does not delete the order.

### `sjRecordPayment(payload)` / action `recordPayment`

ADMIN only. Validates the order and payment amount, appends a POSTED payment, updates paid/balance amounts, and derives UNPAID/PARTIAL/PAID. Overpayment is rejected.

### `sjMoveInventory(payload)` / actions `moveInventory`, `transferInventory`

ADMIN or WAREHOUSE. Moves one existing product/lot quantity between active locations without changing company inventory. Requires unique `operation_id`; supports `expected_source_sequence`; rejects overdraw and identical locations.

### `sjMoveToPacking(payload)` / action `moveToPacking`

Same as move, but forces destination `PACKING`.

### `sjMoveFromPacking(payload)` / action `moveFromPacking`

Same as move, but forces source `PACKING`.

### `sjReceiveInventory(payload)` / action `receiveInventory`

ADMIN or WAREHOUSE. Adds stock to an active location. It may reuse an existing lot or create a new lot from supplier lot, unit conversion, cost, received date, and expiration. When linked to an order line, it advances line completion and parent order status.

### `sjAdjustInventoryIn(payload)` / action `adjustInventoryIn`

ADMIN only. Adds verified stock and requires a reason. It creates an append-only ADJUST_IN movement.

### `sjFoundInventory(payload)` / action `foundInventory`

ADMIN only. Convenience wrapper for an inbound adjustment whose default reason is PHYSICAL_FOUND.

### `sjAdjustInventoryOut(payload)` / action `adjustInventoryOut`

ADMIN only. Removes stock with a required reason, stale-sequence check, and overdraw protection.

### `sjPhysicalCount(payload)` / action `physicalCount`

ADMIN or WAREHOUSE. Sets the exact physical quantity for one product/lot/location. A changed balance requires a reason and posts ADJUST_IN or ADJUST_OUT. An unchanged count posts COUNT_VERIFIED.

### `sjPackingDeduct(payload)` / action `packingDeduct`

ADMIN only. Removes inventory from PACKING, optionally advances a sale order line, and remains idempotent.

### `sjCreateWarehouseTask(payload)` / action `createWarehouseTask`

ADMIN or WAREHOUSE. Creates RECEIVE, PUTAWAY, PICK, PACK, COUNT, or MOVE work. Validates product and optional assignee. Priorities are 1–5.

### `sjUpdateWarehouseTask(payload)` / action `updateWarehouseTask`

ADMIN or WAREHOUSE. Sets OPEN, IN_PROGRESS, BLOCKED, COMPLETE, or CANCELLED; records started/completed times automatically; may reassign the task.

## 8. Core internal functions

### Configuration and utilities

- `sjString_`, `sjUpper_`, `sjLower_`: safe text normalization.
- `sjNumber_`, `sjPositive_`: numeric parsing and quantity validation.
- `sjBoolean_`: accepts booleans, TRUE text, or 1.
- `sjDate_`, `sjDateMs_`, `sjNow_`: consistent dates and comparisons.
- `sjRequired_`, `sjOneOf_`: required-field and allowed-value validation.
- `sjParseJson_`, `sjJson_`, `sjErrorMessage_`: safe request/error serialization.
- `sjNextIdFromRows_`, `sjNextId_`: numeric-suffix ID generation while locked.
- `sjPaginate_`: bounded list responses.
- `sjWithLock_`: prevents simultaneous write collisions.
- `sjConstantTimeEquals_`: compares secrets without early exit.
- `sjPublicRecord_`: removes private/internal fields and `credential_hash`.

### Data access

- `sjBook_`, `sjSheet_`: open the configured workbook/tab.
- `sjTable_`: finds the header row, validates exact required headers, and returns header-driven records with source row numbers.
- `sjFind_`: exact primary-key lookup.
- `sjRecordValues_`: maps record fields back to physical columns.
- `sjAppend_`, `sjAppendMany_`, `sjUpdate_`, `sjClear_`: bounded table mutations.
- `sjSchemaHealth_`: internal schema validator used by the public wrapper.

### Authentication

- `sjSessionSecret_`, `sjSign_`, `sjIssueSession_`, `sjVerifySession_`: signed expiring sessions.
- `sjActiveUser_`, `sjRole_`, `sjRequirePermission_`: active-user and authorization enforcement.
- `sjVerifyCredential_`, `sjCreateCredentialHash_`: password verification and hashing.
- `sjLegacyTokenUser_`: opt-in temporary compatibility only.

### Inventory internals

- `sjInventoryContext_`: loads all inventory tables once for an operation.
- `sjInventoryProduct_`, `sjInventoryLot_`, `sjInventoryLocation_`: active and relationship validation.
- `sjDecoratedBalance_`: joins product, lot, location, conversion, and value fields.
- `sjExistingLotQuantity_`: uses the historical lot conversion for existing stock.
- `sjInboundQuantity_`: resolves a new receipt unit conversion.
- `sjFindOperation_`: enforces idempotency.
- `sjExpectedSequence_`: rejects a stale screen.
- `sjBalanceSnapshot_`, `sjRollback_`: reversible balance mutations if the movement append fails.
- `sjExecuteMovement_`: updates balances, appends the movement, flushes, and audits.
- `sjResolveInboundLot_`, `sjCreateLot_`, `sjAddToLotReceipt_`: lot reuse/creation and receipt totals.
- `sjApplyOrderLineCompletion_`: advances linked line and order completion.

## 9. Maintenance functions

### `setupOperationalBackend()`

Run once from the Apps Script editor. Creates a session secret if missing, defaults writes to disabled, and returns schema/inventory health.

### `validateOperationalBackend()`

Runs API, schema, inventory, and demand sample diagnostics without changing business data.

### `enableOperationalWrites()`

Sets the global write switch to TRUE. Run only after read-only validation and a controlled test.

### `disableOperationalWrites()`

Immediately blocks all business mutations. Read endpoints remain available.

## 10. Failure and recovery behavior

- A duplicated `operation_id` returns the original movement instead of applying inventory twice.
- A stale `expected_source_sequence` rejects the request before changing stock.
- Inventory balances are rolled back if movement creation fails.
- New lots are cleared if their inventory movement fails.
- Orders, movements, payments, and audit rows are never exposed through delete actions.
- `OPERATIONS_WRITES_ENABLED=FALSE` is the emergency stop.
- `inventoryHealth` and `schemaHealth` diagnose but never silently repair data.

## 11. Deployment checklist

1. Back up the workbook.
2. Put every file in this folder into one Apps Script project.
3. Confirm the spreadsheet ID and time zone in `00_Config.gs`.
4. Run `setupOperationalBackend()`.
5. Confirm schema health is true.
6. Confirm inventory health is true.
7. Deploy a new Web App version.
8. Test `apiInfo`, `schemaHealth`, and `inventoryBootstrap`.
9. Test `login` with a real account.
10. Enable writes.
11. Test a small move and its retry using the same `operation_id`.
12. Confirm only one movement was recorded.
13. Test a physical count with no difference.
14. Confirm COUNT_VERIFIED appears in movement history.
15. Connect the website only after these checks pass.
