# San Jose Produce & Imports Operations System

Internal, phone-first operations software for purchasing, receiving, storage, sales fulfillment, packing, inventory control, and operational reporting.

The production architecture is:

```text
GitHub Pages frontend
        ↓ commands / authoritative responses
Google Apps Script web API
        ↓ validation, locking, and inventory mutations
Google Sheets operational database
```

The active GitHub Pages deployment branch is `codex/professional-ui-refresh`.

## One clean inventory truth

The browser displays state, collects a worker action, sends a command, receives the authoritative result, and rerenders. It does not own or independently mutate inventory.

- `LOTS` is the current physical inventory state. Active rows and `current_qty_script` determine what is present now.
- `INVENTORY_MOVEMENTS` is the immutable event/audit history. Inventory-changing commands append movements such as `RECEIVE`, `SALE`, `TRANSFER`, `PACKING_IN`, `PACKING_OUT`, `PACKING_USAGE`, `ADJUST_IN`, and `ADJUST_OUT`.
- Apps Script owns validation and inventory mutation. Inventory-changing V2 functions use `ScriptLock` and `operation_id` idempotency.

`LOCATIONS.current_status` is synchronized for convenience, but rack availability is derived from active LOT inventory so a zeroed cell becomes available immediately.

## Operational data

The Apps Script project uses spreadsheet ID `1XYaMXKGR5EG8VS38PPiHFNbtmwX5Ae6N33jLE72nxKE`. Connector metadata may call it `San Jose Operations Database` or `San_Jose_Operational_System_WebApp_First`.

Major operational tables:

- `PRODUCTS` and `SUPPLIERS`: product, vendor, and customer master data.
- `PURCHASE_ORDERS` and `PURCHASE_ORDER_LINES`: commercial purchasing and received totals.
- `RECEIVING`: resumable receiving-session headers.
- `RECEIVING_PLACEMENTS`: every independently saved physical placement.
- `LOTS`: current inventory by lot and location.
- `LOCATIONS`: rack cells and logical storage locations.
- `INVENTORY_MOVEMENTS`: immutable inventory history and operation IDs.
- `SALES_ORDERS` and `SALES_ORDER_LINES`: customer demand and fulfillment progress.
- `PICK_TASKS`: retained for historical compatibility and fulfillment progress; new no-FIFO orders do not require a recommended lot or location.
- `ADJUSTMENTS`, `AUDIT_LOG`, Amazon tables, and reporting data support control and analysis.

Schema validation is exposed through `validateOperationalSchema`. It reports missing sheets or headers; it does not delete or rewrite historical rows.

## Quantity and weight model

Base inventory is pounds:

```text
purchase quantity × pounds per purchase unit = base inventory quantity
```

For example, `49 BOX × 25 LB/BOX = 1,225 LB`.

Transaction-specific weight wins over the Product master:

1. PO line weight (`case_weight_lbs`, `units_per_purchase_unit`, or compatible transaction field).
2. Lot-derived weight (`original_qty / purchase_qty_received`).
3. Positive Product default only as a fallback.

Zero or stale Product defaults never overwrite a valid PO/lot conversion. Receiving placements persist both purchase quantity and base quantity; partial transfers preserve the same conversion on the split lot.

## Warehouse workflows

### Receiving V2

Choose a PO and line, enter received/damaged quantity, supplier lot, and units per space, then start a session. The backend resolves the PO-line weight and calculates required spaces. Each rack or Floor placement is saved immediately to `RECEIVING_PLACEMENTS`, creates its own `LOT` and `RECEIVE` movement, and increments the PO line. An interrupted job can be reopened with its completed and remaining spaces intact.

### Rack Inventory

Rack locations use the existing 3×3 cell view. Active LOTS determine occupancy. Setting a lot to zero marks it `EMPTY`, synchronizes the cell to `AVAILABLE`, keeps the worker on the same rack, and returns refreshed state. Conflicting active lots are surfaced instead of silently selecting one.

### Sales Orders and Send Product V2

New Sales Orders capture product, sales quantity/unit, price, inventory/base requirement, transaction weight, and commercial fields. Creation and confirmation do not choose a physical lot, location, FIFO, or FEFO recommendation.

At send time the worker sees current storage, chooses one or several lots/locations, and enters partial quantities. The backend revalidates the order, lines, products, locations, current lot balances, remaining order need, and protected demand before decrementing LOTS and writing `SALE` movements. Retried operation IDs return the already-applied authoritative result.

### Transfers, Floor storage, and Packing

`moveInventory` supports rack, Floor, and Packing in either direction. A full move relocates the lot. A partial move leaves the source balance and creates a split lot with the same pounds-per-purchase-unit conversion.

Moving to/from `PACKING` creates `PACKING_IN`/`PACKING_OUT` history without changing total warehouse inventory. Only `PACKING_USAGE` removes usable stock. The Packing page uses inline mobile controls rather than browser prompts and shows movement-based daily history even when Packing is empty.

`FLOOR-1`, `FLOOR-2`, and `PACKING` are logical multi-product locations. They remain `MULTI` and do not use the one-active-lot rack-cell rule. Explicit `BLOCKED`, `MAINTENANCE`, inactive, or out-of-service states are still enforced.

## Roles and permissions

- `ADMIN`: full administration and inventory adjustment, plus all warehouse workflows.
- `MANAGER`: warehouse operations, Sales Order actions/sending, receiving, and manager-only Packing Usage.
- `OPERATOR`: receiving, physical transfers, scanning, and sending confirmed orders. Operators cannot post destructive Packing Usage.

The frontend hides inappropriate actions for usability. Apps Script repeats the relevant permission checks before writes.

## API routing and endpoint

There is one top-level router: `handleApiRequest_()` in `apps-script/Code.gs`. It exposes the V2 project through the single `warehouseV2Api` route; `apps-script/WarehouseApiV2.gs` dispatches supported V2 operations. This avoids duplicate global Apps Script router functions.

The frontend endpoint is configured in `frontend/js/config.js`. The checked-in value is the intended Apps Script `/exec` deployment URL. Do not replace it with an older URL without verifying the live deployment.

All inventory-changing frontend requests generate an `operation_id` (for example `RCVPLACE-…`, `SENDBATCH-…`, `PACKIN-…`, or `PACKUSE-…`). Apps Script checks persisted operation IDs, under a lock, before changing inventory. A retry or double tap must not apply the movement twice.

## Deployment

### Frontend (automatic)

Pushes to `codex/professional-ui-refresh` are the source for the existing GitHub Pages deployment. The Warehouse V2 workflow also runs `.github/workflows/warehouse-v2-check.yml` for frontend syntax, the combined Apps Script global namespace, route contracts, and mobile entry points.

### Apps Script (manual)

Apps Script source does **not** auto-deploy with GitHub Pages. There is currently no checked-in `.clasp.json` or Apps Script deployment workflow. After backend changes:

1. Open the Apps Script project attached to the operational Sheet.
2. Copy every checked-in `apps-script/*.gs` file into the project, preserving one file per source file. Apps Script shares one global namespace; do not paste a second `handleApiRequest_`.
3. Save and run `validateOperationalSchema` from the editor. Authorize access if prompted and resolve any reported missing headers/sheets without deleting history.
4. Run a syntax check/save in the editor, then choose **Deploy → Manage deployments**.
5. Edit the active Web app deployment, select **New version**, keep the existing execution/access settings, and deploy.
6. Confirm the resulting `/exec` URL matches `GOOGLE_SCRIPT_WEB_APP_URL` in `frontend/js/config.js`. If Google issues a new URL, update the frontend config deliberately and redeploy Pages.
7. Open the `/exec` URL directly and confirm it reports the current backend version, then perform the verification checklist below.

The canonical backend is the checked-in `.gs` source; a GitHub commit alone does not update the live Apps Script deployment.

## Verification after backend deployment

- Receiving: receive `100 BOX` at `25 LB`, `40` per space; confirm placements `40/40/20`, LOT bases `1000/1000/500`, three placements/movements, exact PO totals, and resume after the first placement.
- Rack: remove a full lot; confirm LOT `EMPTY`, zero balance, and the cell immediately `AVAILABLE`.
- Sales: send `49 + 42 + 9 BOX` from three locations; confirm exactly three `SALE` movements, correct pounds, balances, freed cells, and order progress.
- Transfer: move `10` of `40 BOX` to Packing; confirm `30/10`, unchanged total pounds, split conversion, and one movement.
- Packing: return inventory, then post partial usage as Manager/Admin; confirm movement history and that only usage reduces total inventory.
- Idempotency: repeat each command with the same `operation_id`; confirm only one movement and one inventory change.
- Weight regression: verify `55`, `25`, `22`, `44`, `41.89`, and `4.4 LB` transaction weights survive PO → Receiving → LOT → transfer/sale.
- Mobile: at approximately `390px` and `430px`, verify no horizontal overflow, usable 44–48px controls, the 3×3 rack picker, sticky Send action, visible loading, and same-workflow refresh.
- History: confirm `QUICKBOOKS_HISTORICAL` orders remain reportable but do not appear in live Send Product or committed inventory.

## Local and CI checks

Serve the repository locally:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080/frontend/`. Camera scanning generally requires HTTPS or localhost.

The CI workflow documents the exact Node syntax and route checks. No local Google Sheet emulator replaces post-deployment verification against a safe test PO/order in the operational Sheet.

## Known limitations

- Apps Script deployment is manual and can drift from GitHub until the deployment steps are completed.
- Google Sheets has no database transaction primitive. Mutations use `ScriptLock`, ordered writes, idempotency, and best-effort rollback, but deployment verification and audit review remain important.
- Historical location-specific Pick Tasks are preserved. New no-FIFO operations protect demand at product level and select physical stock at send time.
- Product packaging defaults are incomplete; accurate PO and lot transaction weights must continue to be captured.
