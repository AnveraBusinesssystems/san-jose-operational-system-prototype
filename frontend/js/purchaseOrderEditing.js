import { clearApiCache, getPurchaseOrderDetail, listProducts, listSuppliers } from "./api-smooth1.js?v=po-edit1";
import { GOOGLE_SCRIPT_WEB_APP_URL } from "./config.js?v=rack-inventory2";
import { escapeHtml, notice } from "./utils.js?v=login-repair1";

const EDITABLE = new Set(["DRAFT", "SENT", "ORDERED", "IN_TRANSIT", "OPEN"]);
const UNITS = ["BOX", "CASE", "BAG", "PALLET", "EACH", "DRUM", "TOTE", "LB"];

export function installPurchaseOrderEditing(ctx, refresh) {
  if (String(ctx.user?.role || "").toUpperCase() !== "ADMIN") return;
  ctx.view.querySelectorAll("tbody tr").forEach((row) => {
    const poId = text(row.querySelector('[data-label="PO"]')) || text(row.cells?.[0]);
    const poStatus = text(row.querySelector('[data-label="Status"]')).toUpperCase();
    const actions = row.querySelector('[data-label="Actions"]') || row.cells?.[row.cells.length - 1];
    if (!poId || !actions || !EDITABLE.has(poStatus) || actions.querySelector("[data-edit-po]")) return;
    actions.insertAdjacentHTML("afterbegin", `<button class="btn secondary" data-edit-po="${escapeHtml(poId)}" type="button">Edit</button>`);
  });
  ctx.view.querySelectorAll("[data-edit-po]").forEach((button) => {
    button.addEventListener("click", () => openEditor(ctx, button.dataset.editPo, refresh));
  });
}

async function openEditor(ctx, poId, refresh) {
  try {
    const [detail, products, suppliers] = await Promise.all([getPurchaseOrderDetail(poId), listProducts(), listSuppliers()]);
    if (!detail) throw new Error("Purchase Order was not found.");
    assertEditable(detail);
    const activeProducts = products.filter(active).sort((a, b) => String(a.product_name || "").localeCompare(String(b.product_name || "")));
    const vendors = suppliers.filter(active).filter((x) => String(x.party_type || "VENDOR").toUpperCase() === "VENDOR");
    const overlay = document.createElement("div");
    overlay.className = "po-edit-overlay";
    overlay.innerHTML = editorHtml(detail, activeProducts, vendors);
    document.body.appendChild(overlay);
    const form = overlay.querySelector("form");
    const lines = overlay.querySelector("[data-edit-lines]");
    const close = () => overlay.remove();
    overlay.querySelectorAll("[data-close-edit-po]").forEach((b) => b.addEventListener("click", close));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector("[data-add-edit-line]").addEventListener("click", () => {
      lines.insertAdjacentHTML("beforeend", lineHtml({}, activeProducts));
      totals(form);
    });
    form.addEventListener("click", (e) => {
      const remove = e.target.closest("[data-remove-edit-line]");
      if (!remove) return;
      if (lines.querySelectorAll("[data-edit-line]").length <= 1) return notice("A Purchase Order needs at least one product.");
      remove.closest("[data-edit-line]").remove();
      totals(form);
    });
    form.addEventListener("input", () => totals(form));
    form.addEventListener("change", (e) => {
      if (e.target.name === "tax_enabled") form.elements.tax_rate_percent.disabled = !e.target.checked;
      totals(form);
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = "Saving...";
      try {
        const result = await updatePurchaseOrder(ctx.user, collect(form, poId));
        clearApiCache();
        close();
        notice(`${result.po_id || poId} updated.`);
        await refresh?.();
      } catch (error) {
        notice(error.message);
        submit.disabled = false;
        submit.textContent = "Save Changes";
      }
    });
    totals(form);
  } catch (error) {
    notice(error.message);
  }
}

function editorHtml(detail, products, vendors) {
  const po = detail.po;
  const taxEnabled = truthy(po.tax_enabled);
  return `<section class="po-edit-dialog" role="dialog" aria-modal="true">
    <header class="po-edit-header"><div><p class="eyebrow">PURCHASE ORDER</p><h2>Edit ${escapeHtml(po.po_id)}</h2><p class="muted">Editing locks automatically after receiving starts.</p></div><button class="btn secondary" data-close-edit-po type="button">Close</button></header>
    <form class="po-edit-form">
      <div class="po-edit-header-grid">
        <label>Supplier<select name="supplier_id" required>${vendors.map((v) => `<option value="${escapeHtml(v.supplier_id)}" ${String(v.supplier_id) === String(po.supplier_id) ? "selected" : ""}>${escapeHtml(v.supplier_name)}</option>`).join("")}</select></label>
        <label>Purchase Date<input name="order_date" type="date" value="${escapeHtml(dateValue(po.order_date))}" required></label>
        <label>Expected Delivery<input name="expected_delivery_date" type="date" value="${escapeHtml(dateValue(po.expected_delivery_date))}"></label>
        <label>Ship Via<input name="ship_via" value="${escapeHtml(po.ship_via || "")}" required></label>
        <label>Apply Tax<input name="tax_enabled" type="checkbox" ${taxEnabled ? "checked" : ""}></label>
        <label>Tax Rate %<input name="tax_rate_percent" type="number" min="0" step="0.01" value="${escapeHtml(taxRate(po.tax_rate))}" ${taxEnabled ? "" : "disabled"}></label>
      </div>
      <div class="po-edit-lines-heading"><h3>Products</h3><button class="btn secondary" data-add-edit-line type="button">Add Product</button></div>
      <div class="po-edit-lines" data-edit-lines>${detail.lines.map((line) => lineHtml(line, products)).join("")}</div>
      <footer class="po-edit-footer"><div class="po-edit-totals"><span>Subtotal <strong data-edit-subtotal>$0.00</strong></span><span>Tax <strong data-edit-tax>$0.00</strong></span><span>Total <strong data-edit-total>$0.00</strong></span></div><div class="actions"><button class="btn secondary" data-close-edit-po type="button">Cancel</button><button class="btn" type="submit">Save Changes</button></div></footer>
    </form>
  </section>`;
}

function lineHtml(line, products) {
  return `<article class="po-edit-line" data-edit-line data-po-line-id="${escapeHtml(line.po_line_id || "")}">
    <label>Product<select data-field="product_id" required><option value="">Select product</option>${products.map((p) => `<option value="${escapeHtml(p.product_id)}" ${String(p.product_id) === String(line.product_id || "") ? "selected" : ""}>${escapeHtml(p.product_name || p.product_id)}</option>`).join("")}</select></label>
    <label>Quantity<input data-field="qty_ordered" type="number" min="0.01" step="0.01" value="${escapeHtml(line.qty_ordered ?? 1)}" required></label>
    <label>Unit<select data-field="unit_type">${UNITS.map((u) => `<option ${u === String(line.unit_type || "CASE").toUpperCase() ? "selected" : ""}>${u}</option>`).join("")}</select></label>
    <label>Unit Weight Lbs<input data-field="case_weight_lbs" type="number" min="0.01" step="0.01" value="${escapeHtml(line.case_weight_lbs || line.units_per_purchase_unit || "")}" required></label>
    <label>Unit Cost<input data-field="unit_cost" type="number" min="0" step="0.01" value="${escapeHtml(line.unit_cost ?? 0)}" required></label>
    <label>Expected Lot<input data-field="supplier_expected_lot_number" value="${escapeHtml(line.supplier_expected_lot_number || "")}"></label>
    <button class="po-edit-remove" data-remove-edit-line type="button">×</button>
  </article>`;
}

function collect(form, poId) {
  const lines = Array.from(form.querySelectorAll("[data-edit-line]")).map((row, index) => {
    const get = (name) => row.querySelector(`[data-field="${name}"]`)?.value;
    const qty = Number(get("qty_ordered") || 0);
    const weight = Number(get("case_weight_lbs") || 0);
    const cost = Number(get("unit_cost") || 0);
    if (!get("product_id")) throw new Error(`Select a product on line ${index + 1}.`);
    if (qty <= 0 || weight <= 0 || cost < 0) throw new Error(`Complete quantity, weight, and cost on line ${index + 1}.`);
    return { po_line_id: row.dataset.poLineId || "", product_id: get("product_id"), qty_ordered: qty, unit_type: get("unit_type"), case_weight_lbs: weight, unit_cost: cost, supplier_expected_lot_number: String(get("supplier_expected_lot_number") || "").trim() };
  });
  return { po_id: poId, supplier_id: form.elements.supplier_id.value, order_date: form.elements.order_date.value, expected_delivery_date: form.elements.expected_delivery_date.value, ship_via: form.elements.ship_via.value.trim(), tax_enabled: form.elements.tax_enabled.checked, tax_rate_percent: Number(form.elements.tax_rate_percent.value || 0), lines };
}

function totals(form) {
  const subtotal = Array.from(form.querySelectorAll("[data-edit-line]")).reduce((sum, row) => sum + Number(row.querySelector('[data-field="qty_ordered"]')?.value || 0) * Number(row.querySelector('[data-field="unit_cost"]')?.value || 0), 0);
  const tax = form.elements.tax_enabled.checked ? subtotal * Number(form.elements.tax_rate_percent.value || 0) / 100 : 0;
  form.querySelector("[data-edit-subtotal]").textContent = money(subtotal);
  form.querySelector("[data-edit-tax]").textContent = money(tax);
  form.querySelector("[data-edit-total]").textContent = money(subtotal + tax);
}

async function updatePurchaseOrder(user, input) {
  if (!GOOGLE_SCRIPT_WEB_APP_URL?.includes("/exec")) throw new Error("Purchase Order editing requires the deployed Apps Script.");
  return jsonp("purchaseOrderAction", { user, poId: input.po_id, action: "UPDATE", input });
}

function jsonp(action, payload) {
  return new Promise((resolve, reject) => {
    const callback = `sjopsPoEdit_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const cleanup = () => { clearTimeout(timer); delete window[callback]; script.remove(); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Apps Script request timed out. Redeploy Code.gs and try again.")); }, 15000);
    window[callback] = (data) => { cleanup(); data?.ok ? resolve(data.result) : reject(new Error(data?.error || "Could not update Purchase Order.")); };
    script.onerror = () => { cleanup(); reject(new Error("Could not reach Apps Script.")); };
    const url = new URL(GOOGLE_SCRIPT_WEB_APP_URL);
    url.searchParams.set("action", action);
    url.searchParams.set("payload", JSON.stringify(payload));
    url.searchParams.set("callback", callback);
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function assertEditable(detail) {
  const state = String(detail.po?.po_status || "DRAFT").toUpperCase();
  if (!EDITABLE.has(state)) throw new Error(`This Purchase Order cannot be edited in ${state} status.`);
  if (detail.lines.some((line) => Number(line.qty_received_total || 0) > 0)) throw new Error("This Purchase Order cannot be edited because receiving has already started.");
}
function active(x) { return x && x.is_active !== false && String(x.is_active ?? "TRUE").toUpperCase() !== "FALSE"; }
function truthy(x) { return x === true || String(x || "").toUpperCase() === "TRUE"; }
function text(x) { return String(x?.textContent || "").trim(); }
function dateValue(x) { const d = x instanceof Date ? x : x ? new Date(x) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : ""; }
function taxRate(x) { const n = Number(x || 0); return n > 0 && n < 1 ? n * 100 : n; }
function money(x) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(x || 0)); }
