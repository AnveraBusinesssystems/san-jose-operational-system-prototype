from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# 1) Wire the editor into the Purchase Orders page.
page_path = ROOT / "frontend/pages/purchaseOrders.js"
page = page_path.read_text()
import_line = 'import { installPurchaseOrderEditing } from "../js/purchaseOrderEditing.js?v=po-edit1";\n'
if import_line not in page:
    marker = 'import { can } from "../js/permissions.js";\n'
    if marker not in page:
        raise SystemExit("Purchase Orders import marker not found")
    page = page.replace(marker, marker + import_line, 1)
hook = '  installPurchaseOrderEditing(ctx, () => render(ctx));\n'
if hook not in page:
    marker = '  setupPurchaseOrderActions(ctx);\n'
    if marker not in page:
        raise SystemExit("Purchase Orders action hook marker not found")
    page = page.replace(marker, marker + hook, 1)
page_path.write_text(page)

# 2) Add backend UPDATE support while preserving all existing Code.gs logic.
code_path = ROOT / "apps-script/Code.gs"
code = code_path.read_text()
helper = r'''
function updatePurchaseOrder_(payload) {
  payload = payload || {};
  const user = payload.user || {};
  const input = payload.input || {};
  requirePermission_(user, "purchaseOrders:actions");
  const poId = String(input.po_id || payload.poId || payload.po_id || "").trim();
  const requestedLines = Array.isArray(input.lines) ? input.lines : [];
  if (!poId) throw new Error("Choose a Purchase Order.");
  if (!requestedLines.length) throw new Error("Add at least one product line.");

  return withScriptLock_(function () {
    const detail = getPurchaseOrderDetail({ po_id: poId });
    if (!detail) throw new Error("Purchase Order was not found.");
    const currentStatus = String(detail.po.po_status || "DRAFT").toUpperCase();
    if (!["DRAFT", "SENT", "ORDERED", "IN_TRANSIT", "OPEN"].includes(currentStatus)) {
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
    const newCount = requestedLines.filter((line) => !existingIds[String(line.po_line_id || "")]).length;
    const generatedIds = nextIdBatch_("PURCHASE_ORDER_LINES", "po_line_id", "POL", newCount);
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

'''
if "function updatePurchaseOrder_(payload)" not in code:
    marker = "function purchaseOrderAction(payload) {"
    if marker not in code:
        raise SystemExit("purchaseOrderAction marker not found")
    code = code.replace(marker, helper + marker, 1)
route = '  if (action === "UPDATE" || action === "EDIT") return updatePurchaseOrder_(payload);\n'
if route not in code:
    marker = '  const action = String(payload.action || payload.status || "").toUpperCase();\n'
    if marker not in code:
        raise SystemExit("Purchase Order action marker not found")
    code = code.replace(marker, marker + route, 1)
code_path.write_text(code)

# 3) Add compact modal styling.
css_path = ROOT / "frontend/css/professional-nav-fix.css"
css = css_path.read_text()
style_marker = "/* purchase-order-edit-modal */"
if style_marker not in css:
    css += r'''

/* purchase-order-edit-modal */
.po-edit-overlay { align-items: flex-start; background: rgba(8, 24, 15, .66); display: flex; inset: 0; justify-content: center; overflow: auto; padding: 28px 16px; position: fixed; z-index: 1000; }
.po-edit-dialog { background: #fff; border-radius: 14px; box-shadow: 0 24px 70px rgba(0,0,0,.28); max-width: 1180px; padding: 22px; width: 100%; }
.po-edit-header, .po-edit-lines-heading, .po-edit-footer { align-items: center; display: flex; gap: 16px; justify-content: space-between; }
.po-edit-header h2, .po-edit-lines-heading h3 { margin: 0; }
.po-edit-header-grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 20px 0; }
.po-edit-header-grid label, .po-edit-line label { display: grid; font-size: 12px; font-weight: 700; gap: 5px; }
.po-edit-lines { display: grid; gap: 10px; margin: 12px 0 20px; }
.po-edit-line { align-items: end; background: #f7faf7; border: 1px solid #dbe5dd; border-radius: 10px; display: grid; gap: 10px; grid-template-columns: 2fr repeat(5, minmax(100px, 1fr)) 36px; padding: 12px; }
.po-edit-remove { align-items: center; background: #fff; border: 1px solid #d7dfd9; border-radius: 7px; cursor: pointer; display: flex; font-size: 22px; height: 38px; justify-content: center; }
.po-edit-totals { display: flex; flex-wrap: wrap; gap: 18px; }
.po-edit-totals strong { margin-left: 6px; }
@media (max-width: 900px) { .po-edit-header-grid { grid-template-columns: 1fr 1fr; } .po-edit-line { grid-template-columns: 1fr 1fr; } .po-edit-remove { width: 100%; } }
@media (max-width: 560px) { .po-edit-overlay { padding: 0; } .po-edit-dialog { border-radius: 0; min-height: 100%; } .po-edit-header-grid, .po-edit-line { grid-template-columns: 1fr; } .po-edit-footer { align-items: stretch; flex-direction: column; } }
'''
css_path.write_text(css)

# Remove the one-time patch files after they have done their job.
for relative in [".github/workflows/po-edit-once.yml", ".github/scripts/patch_po_edit.py"]:
    target = ROOT / relative
    if target.exists():
        target.unlink()
