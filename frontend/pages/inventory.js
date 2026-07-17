import { getRackInventory, listProducts, saveRackInventory } from "../js/api-smooth1.js?v=rack-inventory3";
import { can } from "../js/permissions.js?v=rack-inventory3";
import { escapeHtml, formatQuantity, notice } from "../js/utils.js?v=rack-inventory3";

const LEVELS = ["L3", "L2", "L1"];
const BINS = ["F", "M", "B"];
let selectedRack = "";
let productFilter = "";
let inventoryData = null;
let products = [];

export async function render(ctx) {
  ctx.setTitle("Rack Inventory", "View and correct the actual inventory in each warehouse space");
  [inventoryData, products] = await Promise.all([getRackInventory(), listProducts()]);
  renderPage(ctx);
}

function renderPage(ctx, options = {}) {
  const spaces = Array.isArray(inventoryData?.spaces) ? inventoryData.spaces : [];
  let racks = filteredRacks(spaces, productFilter);
  const preferredRack = options.preferredRack || selectedRack;
  const preferredRackExists = spaces.some((space) => space.rack === preferredRack);
  if (options.keepRack && preferredRack && preferredRackExists) {
    selectedRack = preferredRack;
    if (!racks.includes(preferredRack)) {
      racks = [...racks, preferredRack].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    }
  }
  if (!racks.includes(selectedRack)) selectedRack = racks[0] || "";
  const rackSpaces = spaces.filter((space) => space.rack === selectedRack);
  const editable = can(ctx.user, "inventory:adjust");
  const occupied = rackSpaces.filter((space) => space.occupied).length;

  ctx.view.innerHTML = `
    <section class="rack-inventory-page">
      <section class="panel rack-inventory-toolbar">
        <form id="rackProductFilterForm" class="rack-product-filter">
          <div class="field">
            <label for="rackProductFilter">Find product</label>
            <input id="rackProductFilter" list="rackProductFilterOptions" value="${escapeHtml(productFilter)}" placeholder="All products" autocomplete="off">
            <datalist id="rackProductFilterOptions">
              ${products.map((product) => `<option value="${escapeHtml(product.product_name)}"></option>`).join("")}
            </datalist>
          </div>
          <button class="btn" type="submit">Filter racks</button>
          <button id="clearRackFilter" class="btn secondary" type="button" ${productFilter ? "" : "disabled"}>Clear</button>
        </form>
        <div class="rack-inventory-status" aria-live="polite">
          <span><strong>${racks.length}</strong> rack${racks.length === 1 ? "" : "s"}</span>
          <span><strong>${occupied}</strong> / 9 occupied</span>
          ${inventoryData?.conflict_count ? `<span class="rack-conflict-count"><strong>${inventoryData.conflict_count}</strong> conflict${inventoryData.conflict_count === 1 ? "" : "s"}</span>` : ""}
        </div>
      </section>

      ${selectedRack ? `
        <section class="panel rack-board-panel">
          <header class="rack-board-heading">
            <button class="rack-step-button" type="button" data-rack-step="-1" aria-label="Previous rack">‹</button>
            <div>
              <span>Warehouse rack</span>
              <h2>${escapeHtml(selectedRack)}</h2>
            </div>
            <button class="rack-step-button" type="button" data-rack-step="1" aria-label="Next rack">›</button>
          </header>
          <div class="rack-position-note">Front · Middle · Back</div>
          <div class="rack-board" role="grid" aria-label="Inventory spaces for ${escapeHtml(selectedRack)}">
            <div class="rack-axis-corner" aria-hidden="true">Level</div>
            ${BINS.map((bin) => `<div class="rack-bin-heading" role="columnheader">${bin}</div>`).join("")}
            ${LEVELS.map((level) => `
              <div class="rack-level-heading" role="rowheader">${level.replace("L", "")}</div>
              ${BINS.map((bin) => rackSpaceHtml(findSpace(rackSpaces, level, bin), editable)).join("")}
            `).join("")}
          </div>
          <div class="rack-legend">
            <span><i class="is-occupied"></i>Occupied</span>
            <span><i class="is-empty"></i>Empty</span>
            <span><i class="is-blocked"></i>Unavailable</span>
          </div>
        </section>
        <nav class="rack-selector" aria-label="Choose rack">
          ${racks.map((rack) => `<button type="button" data-rack="${escapeHtml(rack)}" class="${rack === selectedRack ? "active" : ""}">${escapeHtml(rack)}</button>`).join("")}
        </nav>
      ` : `
        <section class="panel rack-empty-result">
          <h2>No matching racks</h2>
          <p>Clear the product filter or search for another product.</p>
        </section>
      `}
    </section>
    <section id="rackEditor" class="rack-editor" hidden aria-label="Edit rack inventory">
      <button class="rack-editor-backdrop" type="button" data-close-rack-editor aria-label="Close inventory editor"></button>
      <div class="rack-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="rackEditorTitle">
        <div id="rackEditorContent"></div>
      </div>
    </section>
  `;

  bindPageEvents(ctx, racks, editable);
  restoreRackView(options);
}

function restoreRackView(options) {
  if (!options.updatedLocationId && !Number.isFinite(options.scrollTop)) return;
  window.requestAnimationFrame(() => {
    if (Number.isFinite(options.scrollTop)) window.scrollTo({ top: options.scrollTop, behavior: "auto" });
    const updatedCard = Array.from(document.querySelectorAll("[data-location-id]"))
      .find((card) => card.dataset.locationId === options.updatedLocationId);
    if (updatedCard) updatedCard.classList.add("rack-space-updated");
  });
}

function filteredRacks(spaces, query) {
  const normalized = String(query || "").trim().toLowerCase();
  const source = normalized
    ? spaces.filter((space) => space.occupied && String(space.product_name || "").toLowerCase().includes(normalized))
    : spaces;
  return Array.from(new Set(source.map((space) => space.rack).filter(Boolean)))
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}

function findSpace(spaces, level, bin) {
  return spaces.find((space) => normalizeLevel(space.level) === level && String(space.bin || "").toUpperCase() === bin) || null;
}

function normalizeLevel(value) {
  const number = String(value || "").match(/\d+/)?.[0] || "";
  return number ? `L${number}` : "";
}

function rackSpaceHtml(space, editable) {
  if (!space) return `<div class="rack-space rack-space-missing" role="gridcell"><span>Not configured</span></div>`;
  const classes = ["rack-space", space.occupied ? "rack-space-occupied" : "rack-space-empty"];
  if (space.conflict) classes.push("rack-space-conflict");
  if (!space.occupied && !space.can_add_inventory) classes.push("rack-space-blocked");
  const action = editable ? "Edit" : "View";
  return `
    <button class="${classes.join(" ")}" type="button" role="gridcell" data-location-id="${escapeHtml(space.location_id)}" aria-label="${action} ${escapeHtml(space.location_id)}">
      <small class="rack-space-id">${escapeHtml(space.location_id)}</small>
      ${space.occupied ? `
        <strong>${escapeHtml(space.product_name)}</strong>
        <span class="rack-space-lot">Lot ${escapeHtml(space.supplier_lot_number || "—")}</span>
        <span class="rack-space-quantity">${escapeHtml(formatPurchaseUnits(space.current_purchase_units))} ${escapeHtml(space.purchase_unit_type || "units")}</span>
        ${space.conflict ? `<em>Inventory conflict</em>` : ""}
      ` : `
        <strong>${space.can_add_inventory ? "Empty" : "Unavailable"}</strong>
        <span>${space.can_add_inventory ? "Tap to add" : escapeHtml(space.location_status)}</span>
      `}
    </button>
  `;
}

function bindPageEvents(ctx, racks, editable) {
  document.getElementById("rackProductFilterForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    productFilter = document.getElementById("rackProductFilter").value.trim();
    selectedRack = "";
    renderPage(ctx);
  });
  document.getElementById("clearRackFilter")?.addEventListener("click", () => {
    productFilter = "";
    selectedRack = "";
    renderPage(ctx);
  });
  ctx.view.querySelectorAll("[data-rack]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedRack = button.dataset.rack;
      renderPage(ctx);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
  ctx.view.querySelectorAll("[data-rack-step]").forEach((button) => {
    button.addEventListener("click", () => {
      const current = Math.max(0, racks.indexOf(selectedRack));
      const next = (current + Number(button.dataset.rackStep) + racks.length) % racks.length;
      selectedRack = racks[next];
      renderPage(ctx);
    });
  });
  ctx.view.querySelectorAll("[data-location-id]").forEach((button) => {
    button.addEventListener("click", () => openEditor(ctx, button.dataset.locationId, editable));
  });
  ctx.view.querySelectorAll("[data-close-rack-editor]").forEach((button) => button.addEventListener("click", closeEditor));
}

function openEditor(ctx, locationId, editable) {
  const space = inventoryData.spaces.find((item) => item.location_id === locationId);
  if (!space) return;
  const editor = document.getElementById("rackEditor");
  const content = document.getElementById("rackEditorContent");
  content.innerHTML = space.occupied
    ? occupiedEditorHtml(space, editable)
    : emptyEditorHtml(space, editable);
  editor.hidden = false;
  document.body.classList.add("rack-editor-open");
  content.querySelector("[data-close-rack-editor]")?.addEventListener("click", closeEditor);
  const form = content.querySelector("form");
  if (form && editable) form.addEventListener("submit", (event) => submitEditor(event, ctx, space));
  if (!space.occupied) bindNewInventoryDefaults(content);
  window.setTimeout(() => content.querySelector("input:not([type='hidden']), select")?.focus(), 50);
}

function occupiedEditorHtml(space, editable) {
  return `
    <header class="rack-editor-header">
      <div><span>${escapeHtml(space.location_id)}</span><h2 id="rackEditorTitle">${escapeHtml(space.product_name)}</h2></div>
      <button type="button" data-close-rack-editor aria-label="Close">×</button>
    </header>
    <div class="rack-editor-summary">
      <div><span>Supplier lot</span><strong>${escapeHtml(space.supplier_lot_number || "—")}</strong></div>
      <div><span>Current amount</span><strong>${escapeHtml(formatPurchaseUnits(space.current_purchase_units))} ${escapeHtml(space.purchase_unit_type)}</strong></div>
      <div><span>Per purchase unit</span><strong>${escapeHtml(formatQuantity(space.unit_weight))} ${escapeHtml(space.base_unit)}</strong></div>
    </div>
    ${space.conflict ? `<div class="rack-editor-warning">This location contains multiple positive lots and cannot be edited until the conflict is resolved.</div>` : ""}
    ${space.reserved_purchase_units > 0 ? `<div class="rack-editor-warning">${escapeHtml(formatPurchaseUnits(space.reserved_purchase_units))} ${escapeHtml(space.purchase_unit_type)} reserved for open Sales Orders.</div>` : ""}
    ${editable ? `
      <form id="rackInventoryForm" class="rack-editor-form">
        <input type="hidden" name="location_id" value="${escapeHtml(space.location_id)}">
        <input type="hidden" name="internal_lot_id" value="${escapeHtml(space.internal_lot_id)}">
        <input type="hidden" name="expected_base_qty" value="${escapeHtml(space.current_base_qty)}">
        <div class="field full">
          <label>Actual amount now (${escapeHtml(space.purchase_unit_type)})</label>
          <input name="purchase_units" type="number" min="0" step="0.01" value="${escapeHtml(cleanNumber(space.current_purchase_units))}" required ${space.conflict ? "disabled" : ""}>
          <small>Enter zero to empty this rack space.</small>
        </div>
        <div class="field full"><label>Reason / note</label><textarea name="notes" placeholder="Example: Weekly physical check"></textarea></div>
        <button class="btn rack-editor-save" type="submit" ${space.conflict ? "disabled" : ""}>Save actual amount</button>
      </form>
    ` : `<p class="rack-view-only">You have view-only inventory access.</p>`}
  `;
}

function emptyEditorHtml(space, editable) {
  const blocked = !space.can_add_inventory;
  return `
    <header class="rack-editor-header">
      <div><span>${escapeHtml(space.location_id)}</span><h2 id="rackEditorTitle">${blocked ? "Unavailable space" : "Add inventory"}</h2></div>
      <button type="button" data-close-rack-editor aria-label="Close">×</button>
    </header>
    ${blocked ? `<div class="rack-editor-warning">This location is marked ${escapeHtml(space.location_status)} and cannot receive inventory.</div>` : ""}
    ${editable && !blocked ? `
      <form id="rackInventoryForm" class="rack-editor-form">
        <input type="hidden" name="location_id" value="${escapeHtml(space.location_id)}">
        <div class="field full">
          <label>Product</label>
          <input id="rackProductName" name="product_name" list="rackEditorProducts" autocomplete="off" required>
          <datalist id="rackEditorProducts">${products.map((product) => `<option value="${escapeHtml(product.product_name)}"></option>`).join("")}</datalist>
        </div>
        <div class="field"><label>Supplier lot number</label><input name="supplier_lot_number" required></div>
        <div class="field"><label>Purchase unit</label><input name="purchase_unit_type" list="purchaseUnitTypes" placeholder="Case, Bag, Bulto" required><datalist id="purchaseUnitTypes"><option value="Case"><option value="Cajas"><option value="Bag"><option value="Bultos"><option value="Sack"></datalist></div>
        <div class="field"><label>Amount per purchase unit</label><input name="unit_weight" type="number" min="0.01" step="0.01" placeholder="Example: 25 LB" required></div>
        <div class="field"><label>Actual quantity</label><input name="purchase_units" type="number" min="0.01" step="0.01" required></div>
        <div class="field full"><label>Reason / note</label><textarea name="notes" placeholder="Example: Product found during physical check"></textarea></div>
        <button class="btn rack-editor-save" type="submit">Add to this space</button>
      </form>
    ` : `<p class="rack-view-only">${editable ? "Choose another available rack space." : "You have view-only inventory access."}</p>`}
  `;
}

function bindNewInventoryDefaults(content) {
  const productInput = content.querySelector("#rackProductName");
  const form = content.querySelector("form");
  if (!productInput || !form) return;
  productInput.addEventListener("change", () => {
    const product = findProduct(productInput.value);
    if (!product) return;
    const example = inventoryData.spaces.find((space) => space.product_id === product.product_id && space.occupied && space.unit_weight > 0);
    if (!example) return;
    form.elements.purchase_unit_type.value = example.purchase_unit_type || "";
    form.elements.unit_weight.value = cleanNumber(example.unit_weight);
  });
}

async function submitEditor(event, ctx, space) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const input = Object.fromEntries(new FormData(form).entries());
  if (!space.occupied) {
    const product = findProduct(input.product_name);
    if (!product) {
      notice("Choose a product from the product list.");
      return;
    }
    input.product_id = product.product_id;
    delete input.product_name;
  }
  button.disabled = true;
  button.textContent = "Saving…";
  const rackBeforeSave = space.rack || selectedRack;
  const scrollBeforeSave = window.scrollY;
  try {
    const result = await saveRackInventory(ctx.user, input);
    inventoryData = result.rack_inventory || await getRackInventory();
    closeEditor();
    notice(result.changed === false ? "Inventory already matches that amount." : `${space.location_id} inventory updated.`);
    selectedRack = rackBeforeSave;
    renderPage(ctx, {
      keepRack: true,
      preferredRack: rackBeforeSave,
      updatedLocationId: space.location_id,
      scrollTop: scrollBeforeSave
    });
  } catch (error) {
    notice(error.message);
    button.disabled = false;
    button.textContent = space.occupied ? "Save actual amount" : "Add to this space";
  }
}

function findProduct(name) {
  const normalized = String(name || "").trim().toLowerCase();
  return products.find((product) => String(product.product_name || "").trim().toLowerCase() === normalized) || null;
}

function closeEditor() {
  const editor = document.getElementById("rackEditor");
  if (editor) editor.hidden = true;
  document.body.classList.remove("rack-editor-open");
}

function cleanNumber(value) {
  return String(Math.round(Number(value || 0) * 100) / 100);
}

function formatPurchaseUnits(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(value || 0));
}
