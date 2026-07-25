const view = document.getElementById("view");

if (view) {
  const observer = new MutationObserver(() => enhanceReportsPicker());
  observer.observe(view, { childList: true, subtree: true });
  enhanceReportsPicker();
}

function enhanceReportsPicker() {
  const toolbar = view?.querySelector(".product-dashboard .dashboard-toolbar");
  if (!toolbar || toolbar.dataset.reportPickerEnhanced === "true") return;

  const modeControl = toolbar.querySelector(".dashboard-mode");
  const productField = toolbar.querySelector(".product-field");
  const productSelect = productField?.querySelector("[data-dashboard-product]");
  if (!modeControl || !productSelect) return;

  toolbar.dataset.reportPickerEnhanced = "true";
  modeControl.hidden = true;
  productField.hidden = true;

  const isOverview = modeControl.querySelector('[data-dashboard-mode="overview"]')?.classList.contains("active");
  const selectedProduct = productSelect.options[productSelect.selectedIndex];
  const selectedLabel = isOverview ? "Overview" : selectedProduct?.textContent?.trim() || "Choose report";

  const picker = document.createElement("div");
  picker.className = "report-command-picker";
  picker.innerHTML = `
    <span class="report-command-label">Report</span>
    <div class="report-command-input-wrap">
      <span class="report-command-icon" aria-hidden="true">⌕</span>
      <input
        class="report-command-input"
        type="search"
        value="${escapeAttribute(selectedLabel)}"
        placeholder="Search for a product"
        autocomplete="off"
        aria-label="Search for a product or press Enter while blank for Overview"
        aria-expanded="false"
      >
      <span class="report-command-chevron" aria-hidden="true">⌄</span>
    </div>
    <div class="report-command-menu" hidden>
      <button type="button" class="report-command-option ${isOverview ? "selected" : ""}" data-report-kind="overview" data-report-target="overview">
        <span class="report-command-avatar overview">▦</span>
        <span class="report-command-copy"><strong>Overview</strong><small>Portfolio performance and priorities</small></span>
        <span class="report-command-action">${isOverview ? "Current" : "Open"}</span>
      </button>
      <div class="report-command-section" data-product-section>Products</div>
      ${Array.from(productSelect.options).map((option) => {
        const name = option.textContent?.trim() || "Product";
        const selected = !isOverview && option.value === productSelect.value;
        return `
          <button
            type="button"
            class="report-command-option ${selected ? "selected" : ""}"
            data-report-kind="product"
            data-report-target="${escapeAttribute(option.value)}"
            data-search-text="${escapeAttribute(normalizeSearch(name))}"
          >
            <span class="report-command-avatar">${escapeHtml(name.charAt(0).toUpperCase())}</span>
            <span class="report-command-copy"><strong>${escapeHtml(name)}</strong><small>Open product analysis</small></span>
            <span class="report-command-action">${selected ? "Current" : "Open"}</span>
          </button>
        `;
      }).join("")}
      <div class="report-command-empty" hidden>No matching products</div>
    </div>
  `;

  toolbar.prepend(picker);
  bindPicker(picker, modeControl, productSelect);
}

function bindPicker(picker, modeControl, productSelect) {
  const input = picker.querySelector(".report-command-input");
  const menu = picker.querySelector(".report-command-menu");
  const empty = picker.querySelector(".report-command-empty");
  const productSection = picker.querySelector("[data-product-section]");
  const overviewOption = picker.querySelector('[data-report-kind="overview"]');
  const productOptions = Array.from(picker.querySelectorAll('[data-report-kind="product"]'));

  const open = () => {
    menu.hidden = false;
    picker.classList.add("open");
    input.setAttribute("aria-expanded", "true");
  };

  const close = () => {
    menu.hidden = true;
    picker.classList.remove("open");
    input.setAttribute("aria-expanded", "false");
  };

  const filter = () => {
    const query = normalizeSearch(input.value);

    if (!query) {
      overviewOption.hidden = false;
      productSection.hidden = false;
      productOptions.forEach((option) => {
        option.hidden = false;
      });
      empty.hidden = true;
      return;
    }

    overviewOption.hidden = true;
    let visibleProducts = 0;

    productOptions.forEach((option) => {
      const visible = String(option.dataset.searchText || "").includes(query);
      option.hidden = !visible;
      if (visible) visibleProducts += 1;
    });

    productSection.hidden = visibleProducts === 0;
    empty.hidden = visibleProducts > 0;
  };

  const choose = (target) => {
    close();

    if (target === "overview") {
      input.value = "Overview";
      modeControl.querySelector('[data-dashboard-mode="overview"]')?.click();
      return;
    }

    productSelect.value = target;
    productSelect.dispatchEvent(new Event("change", { bubbles: true }));
  };

  input.addEventListener("focus", () => {
    open();
    input.select();
    filter();
  });

  input.addEventListener("click", () => {
    open();
    filter();
  });

  input.addEventListener("input", () => {
    open();
    filter();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
      input.blur();
      return;
    }

    if (event.key !== "Enter") return;

    event.preventDefault();
    const query = normalizeSearch(input.value);

    if (!query) {
      choose("overview");
      return;
    }

    const firstMatch = productOptions.find((option) => !option.hidden);
    if (firstMatch) choose(firstMatch.dataset.reportTarget);
  });

  menu.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  picker.querySelectorAll("[data-report-target]").forEach((option) => {
    option.addEventListener("click", () => choose(option.dataset.reportTarget));
  });

  picker.addEventListener("focusout", () => window.setTimeout(() => {
    if (!picker.contains(document.activeElement)) close();
  }, 80));
}

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
