# San Jose Modular Apps Script Backend

This folder is one Google Apps Script project. Apps Script loads every `.gs` file into the same runtime; the numeric filename prefixes keep the editor organized.

## File map

| File | Change it when… |
| --- | --- |
| `00_Config.gs` | a table header, permission, role, or deployment setting changes |
| `01_Utilities.gs` | shared validation, dates, IDs, pagination, or locking changes |
| `02_DataAccess.gs` | Google Sheet reading/writing rules change |
| `03_Auth.gs` | login, password hashes, sessions, or permissions change |
| `04_Api.gs` | a public API action is added or renamed |
| `05_Audit.gs` | secondary audit logging changes |
| `10_Catalog.gs` | products, product units, parties, or locations change |
| `20_Orders.gs` | sales orders, purchase orders, lines, or payments change |
| `30_Inventory_Read.gs` | inventory display and search payloads change |
| `31_Inventory_Write.gs` | inventory movement rules change |
| `40_WarehouseTasks.gs` | warehouse task workflows change |
| `50_Metrics.gs` | website, dashboard, or demand metric responses change |
| `90_Maintenance.gs` | setup and diagnostic functions change |

The detailed operating and function manual is in `MANUAL.md`.

## Safe first deployment

1. Copy every `.gs` file and `appsscript.json` into one Apps Script project attached to the live workbook.
2. Run `setupOperationalBackend()` once and approve permissions.
3. Keep `OPERATIONS_WRITES_ENABLED=FALSE` while testing GET actions.
4. Deploy a Web App as the script owner, accessible to the intended users.
5. Run `validateOperationalBackend()` and review its returned schema and inventory health.
6. Test login and one non-production inventory movement.
7. Run `enableOperationalWrites()` only after validation.

Never put `SESSION_SECRET`, passwords, or legacy write tokens in GitHub.
