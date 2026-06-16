import { createProduct, listProducts } from "../js/api.js?v=opsupdate1";
import { can } from "../js/permissions.js";
import { escapeHtml, formToObject, notice, status, table } from "../js/utils.js";

export async function render(ctx) {
  ctx.setTitle("Products", "Add products and test the QR/barcode value");
  const products = await listProducts();
  ctx.view.innerHTML = `
    <div class="grid">
      ${can(ctx.user, "products:create") ? productForm() : ""}
      <section class="panel">
        <div class="panel-header"><h2>Product Catalog</h2></div>
        ${table([
          { label: "Product ID", key: "product_id" },
          { label: "Name", key: "product_name" },
          { label: "Category", key: "product_category" },
          { label: "Unit", key: "default_unit" },
          { label: "QR / Barcode", key: "barcode_or_qr_value" },
          { label: "Status", render: (row) => status(row.is_active ? "ACTIVE" : "INACTIVE") }
        ], products)}
      </section>
    </div>
  `;

  document.getElementById("productForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const product = await createProduct(ctx.user, formToObject(event.currentTarget));
      notice(`Product saved: ${product.product_id}. Auto stock: min ${product.min_stock_qty}, target ${product.target_stock_qty}.`);
      await render(ctx);
    } catch (error) {
      notice(error.message);
    }
  });
}

function productForm() {
  return `
    <section class="panel">
      <div class="panel-header"><h2>Add Product</h2></div>
      <form id="productForm" class="form-grid">
        <div class="field"><label>Product ID</label><input name="product_id" placeholder="Auto if blank"></div>
        <div class="field"><label>Product Name</label><input name="product_name" required></div>
        <div class="field"><label>Category</label><input name="product_category" placeholder="Packaging, Produce, Supply"></div>
        <div class="field"><label>Default Unit</label><input name="default_unit" value="BOX"></div>
        <div class="field"><label>QR / Barcode Value</label><input name="barcode_or_qr_value" placeholder="Usually product_id"></div>
        <div class="field"><label>Velocity Class</label><select name="velocity_class"><option value="">Auto/Unknown</option><option>FAST</option><option>MEDIUM</option><option>SLOW</option></select></div>
        <div class="field"><label>Amazon SKU</label><input name="amazon_sku"></div>
        <div class="field"><label>Wholesale SKU</label><input name="wholesale_sku"></div>
        <div class="field"><label>Case Weight Lbs</label><input name="case_weight_lbs" type="number" min="0" step="0.01"></div>
        <div class="field full"><p class="muted">Min stock and target stock are calculated automatically from velocity/category and later inventory history.</p></div>
        <div class="field full"><label>Notes</label><textarea name="notes"></textarea></div>
        <div class="field full"><button class="btn" type="submit">Save Product</button></div>
      </form>
    </section>
  `;
}
