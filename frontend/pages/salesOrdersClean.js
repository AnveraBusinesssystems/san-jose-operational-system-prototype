import { render as renderProfessional } from "./salesOrdersProfessional.js?v=warehouse-v2";
import { createSalesOrder, listSuppliers } from "../js/api-smooth1.js?v=warehouse-v2-sales";
import { listSalesProductAvailability } from "../js/warehouse-v2-api.js?v=warehouse-v2-sales";
import { escapeHtml, formatMoney, notice } from "../js/utils.js?v=filters1";

const SALES_UNITS = ["CASE", "BAG", "BOX", "UNIT", "EACH", "LB", "PALLET"];
const SALES_CHANNELS = ["BULK", "AMAZON", "RETAIL", "DISTRIBUTOR", "OTHER"];
const SHIP_METHODS = ["CUSTOMER_PICKUP", "SAN_JOSE_DELIVERY", "LTL_FREIGHT", "PARCEL", "AMAZON_FBA", "OTHER"];
let lineCounter = 0;

export async function render(ctx) {
  await renderProfessional(ctx);
  if (normalizeRole(ctx.user?.role) !== "ADMIN") return;

  const [parties, availability] = await Promise.all([listSuppliers(), listSalesProductAvailability()]);
  const customers = parties.filter((row) => isActive(row) && String(row.party_type || "").toUpperCase() === "CUSTOMER");
  const productChoices = (availability || []).filter((row) => number(row.free_base_qty) > 0.0001);
  replaceLegacyBuilder(ctx, customers, productChoices);
  ctx.setTitle("Sales Orders", "Create customer requirements; warehouse chooses the actual storage spaces when sending");
}

function replaceLegacyBuilder(ctx, customers, productChoices) {
  ctx.view.querySelector(".sales-order-builder")?.remove();
  const grid = ctx.view.querySelector(".grid") || ctx.view;
  const section = document.createElement("section");
  section.className = "panel po-builder sales-order-builder sales-order-builder-v2";
  section.innerHTML = `
    <div class="panel-header">
      <div><p class="eyebrow">NEW SALES ORDER</p><h2>Create Sales Order</h2><p class="muted">Enter what the customer bought. The warehouse chooses the lot and space later.</p></div>
      <span class="status-pill">No FIFO</span>
    </div>
    <form id="salesOrderFormV2">
      <div class="sales-order-header-grid">
        <div class="field"><label>Customer</label><select name="customer_id" required><option value="">Select customer</option>${customers.map((customer) => `<option value="${escapeHtml(customer.supplier_id)}">${escapeHtml(customer.supplier_name)}</option>`).join("")}</select></div>
        <div class="field"><label>Order Date</label><input name="order_date" type="date" value="${localToday()}" required></div>
        <div class="field"><label>Requested Delivery / Pickup</label><input name="requested_delivery_date" type="date" required></div>
        <div class="field"><label>Sales Channel</label><select name="sales_channel">${SALES_CHANNELS.map((value) => `<option>${value}</option>`).join("")}</select></div>
        <div class="field"><label>Ship Method</label><select name="ship_method">${SHIP_METHODS.map((value) => `<option>${value}</option>`).join("")}</select></div>
        <div class="field"><label>Payment Terms</label><select name="payment_terms"><option>Net 15</option><option>Net 21</option><option selected>Net 30</option></select></div>
        <div class="field full"><label>Ship To Address</label><textarea name="shipping_address" placeholder="Select a customer to load the saved address"></textarea></div>
        <div class="field"><label>Tax</label><label class="switch po-tax-switch"><input name="tax_enabled" type="checkbox"><span>Apply tax</span></label></div>
        <div class="field"><label>Tax Rate</label><div class="input-suffix"><input name="tax_rate_percent" type="number" min="0" step="0.01" value="6.25" disabled><span>%</span></div></div>
        <div class="field full"><label>Notes</label><textarea name="notes"></textarea></div>
      </div>
      <div class="po-lines-heading"><div><h3>Products Ordered</h3><p class="muted">Free stock already subtracts product quantity committed to other confirmed orders.</p></div><button id="addSalesLineV2" class="btn secondary" type="button">Add Product</button></div>
      <div id="salesLineItemsV2" class="sales-v2-builder-lines"></div>
      <div class="po-footer sales-order-footer"><div class="po-totals"><div><span>Subtotal</span><strong id="salesSubtotalV2">$0.00</strong></div><div><span>Tax</span><strong id="salesTaxV2">$0.00</strong></div><div class="po-grand-total"><span>Total</span><strong id="salesTotalV2">$0.00</strong></div></div><button id="createSalesOrderV2" class="btn" type="submit" ${productChoices.length ? "" : "disabled"}>Create Sales Order</button></div>
    </form>`;
  grid.prepend(section);
  ensureStyles();

  const form = section.querySelector("#salesOrderFormV2");
  const lines = section.querySelector("#salesLineItemsV2");
  const customerMap = new Map(customers.map((row) => [String(row.supplier_id), row]));
  const productMap = new Map(productChoices.map((row) => [String(row.product_id), row]));
  if (productChoices.length) addLine(lines, productChoices);

  section.querySelector("#addSalesLineV2")?.addEventListener("click", () => addLine(lines, productChoices));
  form.elements.customer_id.addEventListener("change", () => {
    const customer = customerMap.get(String(form.elements.customer_id.value));
    if (customer?.payment_terms) form.elements.payment_terms.value = customer.payment_terms;
    form.elements.shipping_address.value = customer?.address || "";
  });
  form.elements.tax_enabled.addEventListener("change", () => {
    form.elements.tax_rate_percent.disabled = !form.elements.tax_enabled.checked;
    updateTotals(form);
  });
  form.addEventListener("input", (event) => {
    const row = event.target.closest("[data-sales-v2-line]");
    if (row) updateLine(row, productMap);
    updateTotals(form);
  });
  form.addEventListener("change", (event) => {
    const row = event.target.closest("[data-sales-v2-line]");
    if (row && event.target.matches("[data-sales-product]")) applyProduct(row, productMap.get(event.target.value));
    if (row && event.target.matches("[data-sales-unit]") && event.target.value === "LB") row.querySelector("[data-sales-weight]").value = "1";
    if (row) updateLine(row, productMap);
    updateTotals(form);
  });
  form.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-sales-v2]");
    if (!remove) return;
    remove.closest("[data-sales-v2-line]")?.remove();
    if (!lines.children.length && productChoices.length) addLine(lines, productChoices);
    updateTotals(form);
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = section.querySelector("#createSalesOrderV2");
    if (button.disabled) return;
    try {
      const input = collectOrder(form, customerMap, productMap);
      button.disabled = true;
      button.textContent = "Creating…";
      const result = await createSalesOrder(ctx.user, input);
      notice(`${result.sales_order_id} created. Warehouse locations will be chosen when the order is sent.`);
      await render(ctx);
    } catch (error) {
      notice(error.message);
      button.disabled = false;
      button.textContent = "Create Sales Order";
    }
  });
}

function addLine(container, products) {
  lineCounter += 1;
  container.insertAdjacentHTML("beforeend", `
    <section class="sales-v2-builder-line" data-sales-v2-line="${lineCounter}">
      <div class="sales-v2-line-main">
        <label>Product<select data-sales-product required><option value="">Select product</option>${products.map((product) => `<option value="${escapeHtml(product.product_id)}">${escapeHtml(product.product_name)} · ${formatNumber(product.free_base_qty)} LB free</option>`).join("")}</select></label>
        <label>Quantity<input data-sales-qty type="number" inputmode="decimal" min="0.01" step="any" value="1" required></label>
        <label>Sales Unit<select data-sales-unit>${SALES_UNITS.map((unit) => `<option>${unit}</option>`).join("")}</select></label>
        <label>LB / Unit<input data-sales-weight type="number" inputmode="decimal" min="0.01" step="any" value="1" required></label>
        <label>Unit Price<input data-sales-price type="number" inputmode="decimal" min="0" step="0.01" value="0" required></label>
        <button class="po-remove-line" type="button" data-remove-sales-v2 aria-label="Remove product">×</button>
      </div>
      <div class="sales-v2-line-facts"><span data-sales-availability>Choose a product.</span><strong data-sales-line-total>$0.00</strong></div>
    </section>`);
}

function applyProduct(row, product) {
  if (!product) return;
  const unitSelect = row.querySelector("[data-sales-unit]");
  const defaultUnit = String(product.default_sales_unit || "CASE").toUpperCase();
  if (![...unitSelect.options].some((option) => option.value === defaultUnit)) {
    unitSelect.add(new Option(defaultUnit, defaultUnit));
  }
  unitSelect.value = defaultUnit;
  row.querySelector("[data-sales-weight]").value = formatNumber(number(product.default_unit_weight_lbs) || 1);
}

function updateLine(row, productMap) {
  const product = productMap.get(String(row.querySelector("[data-sales-product]")?.value || ""));
  const qty = number(row.querySelector("[data-sales-qty]")?.value);
  const unit = row.querySelector("[data-sales-unit]")?.value || "CASE";
  const weight = unit === "LB" ? 1 : number(row.querySelector("[data-sales-weight]")?.value);
  const price = number(row.querySelector("[data-sales-price]")?.value);
  const required = qty * weight;
  const availability = row.querySelector("[data-sales-availability]");
  if (product) {
    availability.textContent = `${formatNumber(required)} LB required · ${formatNumber(product.free_base_qty)} LB free${number(product.committed_base_qty) > 0 ? ` · ${formatNumber(product.committed_base_qty)} LB committed` : ""}${required > number(product.free_base_qty) + .0001 ? " · SHORT" : ""}`;
  } else availability.textContent = "Choose a product.";
  row.querySelector("[data-sales-line-total]").textContent = formatMoney(qty * price);
}

function updateTotals(form) {
  let subtotal = 0;
  form.querySelectorAll("[data-sales-v2-line]").forEach((row) => subtotal += number(row.querySelector("[data-sales-qty]")?.value) * number(row.querySelector("[data-sales-price]")?.value));
  const tax = form.elements.tax_enabled.checked ? subtotal * number(form.elements.tax_rate_percent.value) / 100 : 0;
  form.querySelector("#salesSubtotalV2").textContent = formatMoney(subtotal);
  form.querySelector("#salesTaxV2").textContent = formatMoney(tax);
  form.querySelector("#salesTotalV2").textContent = formatMoney(subtotal + tax);
}

function collectOrder(form, customerMap, productMap) {
  const customer = customerMap.get(String(form.elements.customer_id.value));
  if (!customer) throw new Error("Select a customer.");
  const usedByProduct = new Map();
  const lines = Array.from(form.querySelectorAll("[data-sales-v2-line]")).map((row, index) => {
    const productId = String(row.querySelector("[data-sales-product]").value || "");
    const qty = number(row.querySelector("[data-sales-qty]").value);
    const unit = String(row.querySelector("[data-sales-unit]").value || "CASE");
    const weight = unit === "LB" ? 1 : number(row.querySelector("[data-sales-weight]").value);
    const price = number(row.querySelector("[data-sales-price]").value);
    if (!productId || qty <= 0 || weight <= 0) throw new Error(`Complete product, quantity, and weight on line ${index + 1}.`);
    const required = qty * weight;
    const totalRequired = number(usedByProduct.get(productId)) + required;
    usedByProduct.set(productId, totalRequired);
    const product = productMap.get(productId);
    if (product && totalRequired > number(product.free_base_qty) + .0001) throw new Error(`${product.product_name} exceeds free inventory by ${formatNumber(totalRequired - number(product.free_base_qty))} LB.`);
    return { product_id: productId, qty_ordered: qty, unit_type: unit, unit_weight_lbs: weight, unit_price: price };
  });
  return {
    customer_id: customer.supplier_id,
    customer_name: customer.supplier_name,
    customer_email: customer.email || "",
    customer_phone: customer.phone || "",
    order_date: form.elements.order_date.value,
    requested_delivery_date: form.elements.requested_delivery_date.value,
    ship_by_date: form.elements.requested_delivery_date.value,
    sales_channel: form.elements.sales_channel.value,
    channel: form.elements.sales_channel.value,
    ship_method: form.elements.ship_method.value,
    payment_terms: form.elements.payment_terms.value,
    shipping_address: form.elements.shipping_address.value.trim(),
    tax_enabled: form.elements.tax_enabled.checked,
    tax_rate_percent: number(form.elements.tax_rate_percent.value),
    notes: form.elements.notes.value.trim(),
    order_source: "WEB_APP",
    lines
  };
}

function ensureStyles() {
  if (document.getElementById("salesOrdersV2BuilderStyles")) return;
  const style = document.createElement("style");
  style.id = "salesOrdersV2BuilderStyles";
  style.textContent = `
    .sales-order-builder-v2{grid-column:1/-1}.sales-v2-builder-lines{display:grid;gap:10px;margin:12px 0}.sales-v2-builder-line{border:1px solid #dce4df;border-radius:12px;padding:12px;background:#fbfdfc}.sales-v2-line-main{display:grid;grid-template-columns:minmax(220px,2fr) repeat(4,minmax(110px,1fr)) 42px;gap:10px;align-items:end}.sales-v2-line-main label{display:grid;gap:5px;font-size:.78rem;font-weight:700;color:#536159}.sales-v2-line-main input,.sales-v2-line-main select{min-height:44px;width:100%}.sales-v2-line-facts{display:flex;justify-content:space-between;gap:12px;margin-top:8px;color:#66746c;font-size:.82rem}.sales-v2-line-facts strong{color:#173f34}.sales-order-builder-v2 .status-pill{white-space:nowrap}
    @media(max-width:760px){.sales-order-builder-v2{padding:14px}.sales-v2-line-main{grid-template-columns:1fr 1fr}.sales-v2-line-main label:first-child{grid-column:1/-1}.sales-v2-line-main .po-remove-line{grid-column:2;justify-self:end}.sales-v2-line-facts{flex-direction:column}.sales-order-builder-v2 .sales-order-header-grid{grid-template-columns:1fr!important}.sales-order-builder-v2 .po-footer{position:sticky;bottom:0;z-index:4;background:#fff;padding-bottom:calc(10px + env(safe-area-inset-bottom));box-shadow:0 -8px 18px rgba(25,50,42,.08)}.sales-order-builder-v2 .po-footer .btn{min-height:50px;width:100%}}
  `;
  document.head.appendChild(style);
}

function normalizeRole(role) { const value = String(role || "OPERATOR").toUpperCase(); return value === "OWNER" ? "ADMIN" : value; }
function isActive(row) { return row.is_active === undefined || row.is_active === true || String(row.is_active).toUpperCase() === "TRUE"; }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function formatNumber(value) { return String(Math.round(number(value) * 100) / 100); }
function localToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
