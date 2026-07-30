import { createSupplier, listSuppliers } from "../js/api-smooth1.js?v=parties1";
import { can } from "../js/permissions.js";
import { escapeHtml, formToObject, notice } from "../js/utils.js";

const DEFAULT_PAGE_SIZE = 10;

export async function render(ctx) {
  ctx.setTitle("Customers & Vendors", "Manage the companies you buy from and sell to");
  const parties = await listSuppliers();

  ctx.view.innerHTML = `
    <div class="products-modern-page parties-products-style">
      ${can(ctx.user, "suppliers:create") ? supplierForm() : ""}
      ${partyDirectory(parties)}
    </div>
  `;

  bindSupplierForm(ctx);
  bindDirectoryControls(ctx.view);
  bindDirectorySorting(ctx.view);
}

function supplierForm() {
  return `
    <section class="product-panel">
      <div class="product-panel-heading">
        <div class="product-panel-title">
          <span class="panel-icon" aria-hidden="true">⊕</span>
          <h2>Add Customer or Vendor</h2>
        </div>
      </div>
      <form id="supplierForm" class="product-create-form parties-form-grid">
        <div class="product-field">
          <label for="partyType">Business Type</label>
          <select id="partyType" name="party_type" required>
            <option value="CUSTOMER">Customer</option>
            <option value="VENDOR" selected>Vendor</option>
          </select>
        </div>
        <div class="product-field">
          <label for="partyRecordId">Record ID</label>
          <input id="partyRecordId" name="supplier_id" placeholder="Auto if blank">
        </div>
        <div class="product-field">
          <label for="partyName">Business Name</label>
          <input id="partyName" name="supplier_name" required>
        </div>
        <div class="product-field">
          <label for="partyContact">Contact Name</label>
          <input id="partyContact" name="contact_name">
        </div>
        <div class="product-field">
          <label for="partyEmail">Email</label>
          <input id="partyEmail" name="email" type="email">
        </div>
        <div class="product-field">
          <label for="partyPhone">Phone</label>
          <input id="partyPhone" name="phone">
        </div>
        <div class="product-field">
          <label for="partyTerms">Payment Terms</label>
          <select id="partyTerms" name="payment_terms" required>
            <option>Net 15</option>
            <option>Net 21</option>
            <option selected>Net 30</option>
          </select>
        </div>
        <div class="product-field">
          <label for="partyCurrency">Currency</label>
          <input id="partyCurrency" name="default_currency" value="USD">
        </div>
        <div class="product-field parties-wide-field">
          <label for="partyAddress">Address</label>
          <input id="partyAddress" name="address">
        </div>
        <div class="product-field parties-wide-field">
          <label for="partyNotes">Notes</label>
          <input id="partyNotes" name="notes">
        </div>
        <div class="product-field parties-wide-field">
          <button class="save-product-button" type="submit">Save Business</button>
        </div>
      </form>
    </section>
  `;
}

function partyDirectory(parties) {
  const types = Array.from(new Set(parties.map((party) => partyType(party)))).sort();

  return `
    <section class="product-panel" data-party-directory>
      <div class="product-panel-heading">
        <div class="product-panel-title">
          <span class="panel-icon" aria-hidden="true">▤</span>
          <h2>Business Directory</h2>
        </div>
        <div class="catalog-toolbar">
          <select class="catalog-filter" data-party-type-filter aria-label="Filter by business type">
            <option value="">All Types</option>
            ${types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(titleCase(type))}</option>`).join("")}
          </select>
          <label class="catalog-search-wrap">
            <span class="sr-only">Search customers and vendors</span>
            <input class="catalog-search" type="search" data-party-search placeholder="Search businesses..." autocomplete="off">
          </label>
        </div>
      </div>
      <div class="product-table-wrap">
        <table class="product-catalog-table parties-catalog-table" data-party-table data-no-global-filter="true">
          <thead>
            <tr>
              ${sortableHeader("Type", 0)}
              ${sortableHeader("Record ID", 1)}
              ${sortableHeader("Name", 2)}
              ${sortableHeader("Contact", 3)}
              ${sortableHeader("Email", 4)}
              ${sortableHeader("Phone", 5)}
              ${sortableHeader("Status", 6)}
            </tr>
          </thead>
          <tbody>
            ${parties.map(partyRow).join("")}
            <tr class="catalog-empty-row" data-party-empty hidden><td colspan="7">No businesses match the current filters.</td></tr>
          </tbody>
        </table>
      </div>
      <div class="catalog-footer">
        <span data-party-summary></span>
        <div class="catalog-pagination">
          <button type="button" data-party-prev aria-label="Previous page">‹</button>
          <span data-party-pages></span>
          <button type="button" data-party-next aria-label="Next page">›</button>
          <select class="catalog-page-size" data-party-page-size aria-label="Rows per page">
            <option value="10">10 / page</option>
            <option value="25">25 / page</option>
            <option value="50">50 / page</option>
          </select>
        </div>
      </div>
    </section>
  `;
}

function sortableHeader(label, column) {
  return `
    <th aria-sort="none">
      <button class="catalog-sort party-sort" type="button" data-party-sort-column="${column}" data-party-sort-direction="asc">${escapeHtml(label)}</button>
    </th>
  `;
}

function partyRow(row) {
  const type = partyType(row);
  const active = row.is_active === true || String(row.is_active).toUpperCase() === "TRUE";
  const searchText = [type, row.supplier_id, row.supplier_name, row.contact_name, row.email, row.phone, active ? "active" : "inactive"]
    .map((value) => String(value || "")).join(" ").toLowerCase();

  return `
    <tr data-party-row data-party-type="${escapeHtml(type)}" data-search-text="${escapeHtml(searchText)}">
      <td data-sort-value="${escapeHtml(type)}"><span class="party-type-text">${escapeHtml(titleCase(type))}</span></td>
      <td class="party-id" data-sort-value="${escapeHtml(row.supplier_id || "")}">${escapeHtml(row.supplier_id || "")}</td>
      <td class="party-name" data-sort-value="${escapeHtml(row.supplier_name || "")}"><strong>${escapeHtml(row.supplier_name || "")}</strong></td>
      <td class="party-contact" data-sort-value="${escapeHtml(row.contact_name || "")}">${escapeHtml(row.contact_name || "—")}</td>
      <td class="party-email" data-sort-value="${escapeHtml(row.email || "")}">${escapeHtml(row.email || "—")}</td>
      <td class="party-phone" data-sort-value="${escapeHtml(row.phone || "")}">${escapeHtml(row.phone || "—")}</td>
      <td data-sort-value="${active ? "Active" : "Inactive"}"><span class="product-status-pill ${active ? "" : "off"}">${active ? "Active" : "Inactive"}</span></td>
    </tr>
  `;
}

function bindSupplierForm(ctx) {
  document.getElementById("supplierForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const party = await createSupplier(ctx.user, formToObject(event.currentTarget));
      notice(`${partyType(party) === "CUSTOMER" ? "Customer" : "Vendor"} saved: ${party.supplier_id}.`);
      await render(ctx);
    } catch (error) {
      notice(error.message);
      if (button) button.disabled = false;
    }
  });
}

function bindDirectoryControls(root) {
  const directory = root.querySelector("[data-party-directory]");
  if (!directory) return;
  const search = directory.querySelector("[data-party-search]");
  const typeFilter = directory.querySelector("[data-party-type-filter]");
  const pageSizeControl = directory.querySelector("[data-party-page-size]");
  const previous = directory.querySelector("[data-party-prev]");
  const next = directory.querySelector("[data-party-next]");
  const pages = directory.querySelector("[data-party-pages]");
  const summary = directory.querySelector("[data-party-summary]");
  const emptyRow = directory.querySelector("[data-party-empty]");
  let currentPage = 1;
  let pageSize = DEFAULT_PAGE_SIZE;

  const filteredRows = () => Array.from(directory.querySelectorAll("[data-party-row]")).filter((row) => {
    const query = String(search?.value || "").trim().toLowerCase();
    const selectedType = String(typeFilter?.value || "");
    return (!query || row.dataset.searchText.includes(query)) && (!selectedType || row.dataset.partyType === selectedType);
  });

  const draw = () => {
    const allRows = Array.from(directory.querySelectorAll("[data-party-row]"));
    const rows = filteredRows();
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    const end = Math.min(start + pageSize, rows.length);
    const visible = new Set(rows.slice(start, end));
    allRows.forEach((row) => { row.hidden = !visible.has(row); });
    emptyRow.hidden = rows.length !== 0;
    summary.textContent = rows.length ? `Showing ${start + 1} to ${end} of ${rows.length} businesses` : "Showing 0 businesses";
    previous.disabled = currentPage <= 1;
    next.disabled = currentPage >= totalPages;
    pages.innerHTML = paginationWindow(currentPage, totalPages).map((page) => page === "…"
      ? `<span class="catalog-page-gap">…</span>`
      : `<button type="button" data-party-page="${page}" class="${page === currentPage ? "active" : ""}">${page}</button>`).join("");
  };

  search?.addEventListener("input", () => { currentPage = 1; draw(); });
  typeFilter?.addEventListener("change", () => { currentPage = 1; draw(); });
  pageSizeControl?.addEventListener("change", () => { pageSize = Number(pageSizeControl.value) || DEFAULT_PAGE_SIZE; currentPage = 1; draw(); });
  previous?.addEventListener("click", () => { currentPage = Math.max(1, currentPage - 1); draw(); });
  next?.addEventListener("click", () => { currentPage += 1; draw(); });
  pages?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-party-page]");
    if (!button) return;
    currentPage = Number(button.dataset.partyPage) || 1;
    draw();
  });
  directory.querySelectorAll(".party-sort").forEach((button) => button.addEventListener("click", () => window.setTimeout(draw, 0)));
  draw();
}

function bindDirectorySorting(root) {
  root.querySelectorAll(".party-sort").forEach((button) => {
    button.addEventListener("click", () => {
      const tableElement = button.closest("table");
      const tbody = tableElement?.tBodies?.[0];
      if (!tbody) return;
      const column = Number(button.dataset.partySortColumn);
      const header = button.closest("th");
      const currentDirection = header.getAttribute("aria-sort");
      const direction = currentDirection === "ascending" ? "desc" : currentDirection === "descending" ? "asc" : button.dataset.partySortDirection;
      const multiplier = direction === "desc" ? -1 : 1;
      const emptyRow = tbody.querySelector("[data-party-empty]");
      const rows = Array.from(tbody.querySelectorAll("[data-party-row]")).map((row, index) => ({ row, index }));
      rows.sort((a, b) => {
        const aValue = a.row.cells[column]?.dataset.sortValue ?? "";
        const bValue = b.row.cells[column]?.dataset.sortValue ?? "";
        const comparison = String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: "base" });
        return comparison === 0 ? a.index - b.index : comparison * multiplier;
      });
      rows.forEach(({ row }) => tbody.insertBefore(row, emptyRow || null));
      tableElement.querySelectorAll("th[aria-sort]").forEach((item) => item.setAttribute("aria-sort", "none"));
      header.setAttribute("aria-sort", direction === "desc" ? "descending" : "ascending");
    });
  });
}

function paginationWindow(current, total) {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  const values = new Set([1, total, current, current - 1, current + 1]);
  const sorted = Array.from(values).filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
  const output = [];
  sorted.forEach((page, index) => {
    if (index && page - sorted[index - 1] > 1) output.push("…");
    output.push(page);
  });
  return output;
}

function partyType(record) {
  return String(record.party_type || "VENDOR").toUpperCase() === "CUSTOMER" ? "CUSTOMER" : "VENDOR";
}

function titleCase(value) {
  const text = String(value || "").toLowerCase();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}
