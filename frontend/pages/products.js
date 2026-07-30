import { createProduct, inventorySnapshot, listProducts, updateProductStatus } from "../js/api-smooth1.js?v=qa1";
import { can } from "../js/permissions.js";
import { enableTableSorting, escapeHtml, formToObject, formatQuantity, notice } from "../js/utils.js";

const DEFAULT_PAGE_SIZE = 10;

export async function render(ctx) {
  ctx.setTitle("Products", "Manage your product master used across purchasing and inventory");

  const [products, inventoryRows] = await Promise.all([listProducts(), inventorySnapshot()]);
  const inventoryByProduct = inventoryTotalsByProduct(inventoryRows);
  const metrics = buildProductMetrics(products, inventoryByProduct);
  const categories = uniqueCategories(products);

  ctx.view.innerHTML = `
    <div class="products-modern-page">
      ${metricCards(metrics)}
      ${can(ctx.user, "products:create") ? productForm() : ""}
      ${productCatalog(products, inventoryByProduct, categories)}
    </div>
  `;

  bindProductForm(ctx);
  bindProductStatusControls(ctx);
  bindCatalogControls(ctx.view);
  enableTableSorting(ctx.view);
}

function metricCards(metrics) {
  return `
    <section class="product-kpi-grid" aria-label="Product metrics">
      ${metricCard("▣", "Total Products", formatNumber(metrics.totalProducts), "Products in the master list")}
      ${metricCard("✓", "Active Products", formatNumber(metrics.activeProducts), "Currently available for operations")}
      ${metricCard("▦", "Total Inventory", `${formatNumber(metrics.totalInventoryLb)} LB`, "Current inventory converted to pounds")}
    </section>
  `;
}

function metricCard(icon, label, value, note) {
  return `
    <article class="product-kpi-card">
      <div class="product-kpi-icon" aria-hidden="true">${icon}</div>
      <div class="product-kpi-copy">
        <span class="product-kpi-label">${escapeHtml(label)}</span>
        <strong class="product-kpi-value">${escapeHtml(value)}</strong>
        <span class="product-kpi-note">${escapeHtml(note)}</span>
      </div>
    </article>
  `;
}

function productForm() {
  return `
    <section class="product-panel">
      <div class="product-panel-heading">
        <div class="product-panel-title">
          <span class="panel-icon" aria-hidden="true">⊕</span>
          <h2>Add Product</h2>
        </div>
      </div>
      <form id="productForm" class="product-create-form">
        <div class="product-field">
          <label for="productName">Product Name</label>
          <input id="productName" name="product_name" autocomplete="off" placeholder="Enter product name" required>
        </div>
        <div class="product-field">
          <label for="productCategory">Category</label>
          <select id="productCategory" name="product_category" required>
            <option value="">Select category</option>
            <option>Packaging</option>
            <option>Ingredients</option>
            <option>Labels</option>
            <option>Finished Goods</option>
            <option>Supplies</option>
            <option>Hardware</option>
            <option>Other</option>
          </select>
        </div>
        <div class="product-field">
          <label for="perishabilityDays">Perishability Days</label>
          <input id="perishabilityDays" name="perishability_days" type="number" min="0" step="1" value="0" required>
        </div>
        <div class="product-field">
          <label class="sr-only" for="saveProductButton">Save product</label>
          <button id="saveProductButton" class="save-product-button" type="submit">Save Product</button>
        </div>
      </form>
    </section>
  `;
}

function productCatalog(products, inventoryByProduct, categories) {
  return `
    <section class="product-panel" data-product-catalog>
      <div class="product-panel-heading">
        <div class="product-panel-title">
          <span class="panel-icon" aria-hidden="true">▤</span>
          <h2>Product Catalog</h2>
        </div>
        <div class="catalog-toolbar">
          <select class="catalog-filter" data-catalog-category aria-label="Filter products by category">
            <option value="">All Categories</option>
            ${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}
          </select>
          <label class="catalog-search-wrap">
            <span class="sr-only">Search products</span>
            <input class="catalog-search" type="search" data-catalog-search placeholder="Search products..." autocomplete="off">
          </label>
        </div>
      </div>
      <div class="product-table-wrap">
        <table class="product-catalog-table" data-catalog-table>
          <thead>
            <tr>
              ${sortableHeader("Product ID", 0, "text")}
              ${sortableHeader("Name", 1, "text")}
              ${sortableHeader("Category", 2, "text")}
              ${sortableHeader("Perishability", 3, "number")}
              ${sortableHeader("Inventory (LB)", 4, "number", "desc")}
              ${sortableHeader("Status", 5, "text")}
            </tr>
          </thead>
          <tbody>
            ${products.map((row) => productRow(row, inventoryByProduct[row.product_id])).join("")}
            <tr class="catalog-empty-row" data-catalog-empty hidden><td colspan="6">No products match the current filters.</td></tr>
          </tbody>
        </table>
      </div>
      <div class="catalog-footer">
        <span data-catalog-summary></span>
        <div class="catalog-pagination">
          <button type="button" data-page-prev aria-label="Previous page">‹</button>
          <span data-page-buttons></span>
          <button type="button" data-page-next aria-label="Next page">›</button>
          <select class="catalog-page-size" data-page-size aria-label="Rows per page">
            <option value="10">10 / page</option>
            <option value="25">25 / page</option>
            <option value="50">50 / page</option>
          </select>
        </div>
      </div>
    </section>
  `;
}

function sortableHeader(label, column, type, direction = "asc") {
  return `
    <th aria-sort="none">
      <button
        class="table-sort-button catalog-sort"
        type="button"
        data-sort-column="${column}"
        data-sort-type="${type}"
        data-sort-direction="${direction}"
      >${escapeHtml(label)}</button>
    </th>
  `;
}

function productRow(row, inventoryTotal) {
  const inventoryValue = inventorySortValue(inventoryTotal);
  const active = isProductActive(row);
  const category = row.product_category || "Uncategorized";

  return `
    <tr
      data-catalog-row
      data-category="${escapeHtml(category)}"
      data-search-text="${escapeHtml(`${row.product_id || ""} ${row.product_name || ""} ${category}`.toLowerCase())}"
    >
      <td data-sort-value="${escapeHtml(row.product_id || "")}">${escapeHtml(row.product_id || "")}</td>
      <td data-sort-value="${escapeHtml(row.product_name || "")}"><strong>${escapeHtml(row.product_name || "")}</strong></td>
      <td data-sort-value="${escapeHtml(category)}">${escapeHtml(category)}</td>
      <td data-sort-value="${Number(row.perishability_days || 0)}">${formatPerishability(row.perishability_days)}</td>
      <td data-sort-value="${inventoryValue}">${inventoryText(inventoryTotal)}</td>
      <td data-sort-value="${active ? "Active" : "Off"}">${productStatus(row)}</td>
    </tr>
  `;
}

function productStatus(row) {
  const checked = isProductActive(row);
  return `
    <label class="status-toggle" title="${checked ? "Active" : "Off"}">
      <input data-product-status="${escapeHtml(row.product_id)}" type="checkbox" ${checked ? "checked" : ""}>
      <span class="product-status-pill ${checked ? "" : "off"}">${checked ? "Active" : "Off"}</span>
    </label>
  `;
}

function bindProductForm(ctx) {
  document.getElementById("productForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    try {
      const product = await createProduct(ctx.user, formToObject(event.currentTarget));
      notice(`Product saved: ${product.product_id}.`);
      await render(ctx);
    } catch (error) {
      notice(error.message);
      if (button) button.disabled = false;
    }
  });
}

function bindProductStatusControls(ctx) {
  document.querySelectorAll("[data-product-status]").forEach((control) => {
    if (!can(ctx.user, "products:edit")) {
      control.disabled = true;
      return;
    }

    control.addEventListener("change", async (event) => {
      const checkbox = event.currentTarget;
      checkbox.disabled = true;
      try {
        await updateProductStatus(ctx.user, checkbox.dataset.productStatus, checkbox.checked);
        notice(`${checkbox.dataset.productStatus} is now ${checkbox.checked ? "active" : "off"}.`);
        await render(ctx);
      } catch (error) {
        checkbox.checked = !checkbox.checked;
        checkbox.disabled = false;
        notice(error.message);
      }
    });
  });
}

function bindCatalogControls(root) {
  const catalog = root.querySelector("[data-product-catalog]");
  if (!catalog) return;

  const search = catalog.querySelector("[data-catalog-search]");
  const category = catalog.querySelector("[data-catalog-category]");
  const pageSizeControl = catalog.querySelector("[data-page-size]");
  const previous = catalog.querySelector("[data-page-prev]");
  const next = catalog.querySelector("[data-page-next]");
  const pageButtons = catalog.querySelector("[data-page-buttons]");
  const summary = catalog.querySelector("[data-catalog-summary]");
  const emptyRow = catalog.querySelector("[data-catalog-empty]");

  let currentPage = 1;
  let pageSize = DEFAULT_PAGE_SIZE;

  const visibleRows = () => Array.from(catalog.querySelectorAll("[data-catalog-row]")).filter((row) => {
    const query = String(search?.value || "").trim().toLowerCase();
    const selectedCategory = String(category?.value || "");
    const matchesSearch = !query || row.dataset.searchText.includes(query);
    const matchesCategory = !selectedCategory || row.dataset.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const draw = () => {
    const allRows = Array.from(catalog.querySelectorAll("[data-catalog-row]"));
    const rows = visibleRows();
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, rows.length);
    const visibleSet = new Set(rows.slice(start, end));

    allRows.forEach((row) => {
      row.hidden = !visibleSet.has(row);
    });

    emptyRow.hidden = rows.length !== 0;
    summary.textContent = rows.length
      ? `Showing ${start + 1} to ${end} of ${rows.length} products`
      : "Showing 0 products";

    previous.disabled = currentPage <= 1;
    next.disabled = currentPage >= totalPages;

    const pages = paginationWindow(currentPage, totalPages);
    pageButtons.innerHTML = pages.map((page) => page === "…"
      ? `<span class="catalog-page-gap">…</span>`
      : `<button type="button" data-page-number="${page}" class="${page === currentPage ? "active" : ""}">${page}</button>`
    ).join("");
  };

  search?.addEventListener("input", () => {
    currentPage = 1;
    draw();
  });

  category?.addEventListener("change", () => {
    currentPage = 1;
    draw();
  });

  pageSizeControl?.addEventListener("change", () => {
    pageSize = Number(pageSizeControl.value) || DEFAULT_PAGE_SIZE;
    currentPage = 1;
    draw();
  });

  previous?.addEventListener("click", () => {
    currentPage = Math.max(1, currentPage - 1);
    draw();
  });

  next?.addEventListener("click", () => {
    currentPage += 1;
    draw();
  });

  pageButtons?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page-number]");
    if (!button) return;
    currentPage = Number(button.dataset.pageNumber) || 1;
    draw();
  });

  catalog.querySelectorAll(".table-sort-button").forEach((button) => {
    button.addEventListener("click", () => window.setTimeout(draw, 0));
  });

  draw();
}

function paginationWindow(current, total) {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = Array.from(pages).filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const output = [];
  sorted.forEach((page, index) => {
    if (index && page - sorted[index - 1] > 1) output.push("…");
    output.push(page);
  });
  return output;
}

function buildProductMetrics(products, inventoryByProduct) {
  return {
    totalProducts: products.length,
    activeProducts: products.filter(isProductActive).length,
    totalInventoryLb: Object.values(inventoryByProduct).reduce((sum, total) => sum + Number(total?.lbs || 0), 0)
  };
}

function uniqueCategories(products) {
  return Array.from(new Set(products.map((product) => product.product_category || "Uncategorized")))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function inventoryTotalsByProduct(rows) {
  return rows.reduce((totals, row) => {
    const key = row.product_id;
    if (!key) return totals;
    const baseUnit = row.unit_type || row.product?.base_unit || "";
    const total = totals[key] || { lbs: 0, otherQty: 0, otherUnit: "" };
    const qty = Number(row.qty || row.current_qty || 0);
    const lbsPerUnit = Number(row.product?.case_weight_lbs || row.product?.units_per_purchase_unit || 0);

    if (String(baseUnit).toUpperCase() === "LB") {
      total.lbs += qty;
    } else if (lbsPerUnit > 0) {
      total.lbs += qty * lbsPerUnit;
    } else {
      total.otherQty += qty;
      total.otherUnit = baseUnit;
    }

    totals[key] = total;
    return totals;
  }, {});
}

function inventoryText(total) {
  if (!total) return "0";
  const values = [];
  if (total.lbs) values.push(`${formatNumber(total.lbs)} LB`);
  if (total.otherQty) values.push(`${formatNumber(total.otherQty)} ${escapeHtml(total.otherUnit)}`.trim());
  return values.join(" / ") || "0";
}

function inventorySortValue(total) {
  return total ? total.lbs || total.otherQty : 0;
}

function formatPerishability(value) {
  const days = Number(value || 0);
  return days > 0 ? `${formatNumber(days)} days` : "Non-perishable";
}

function isProductActive(row) {
  return row.is_active === true || String(row.is_active).toUpperCase() === "TRUE";
}

function formatNumber(value) {
  return formatQuantity(value);
}
