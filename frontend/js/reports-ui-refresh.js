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
        placeholder="Search overview or product"
        autocomplete="off"
        aria-label="Choose Overview or search for a product"
        aria-expanded="false"
      >
      <span class="report-command-chevron" aria-hidden="true">⌄</span>
    </div>
    <div class="report-command-menu" hidden>
      <button type="button" class="report-command-option ${isOverview ? "selected" : ""}" data-report-target="overview" data-search-text="overview portfolio dashboard">
        <span class="report-command-avatar overview">▦</span>
        <span class="report-command-copy"><strong>Overview</strong><small>Portfolio performance and priorities</small></span>
        <span class="report-command-action">${isOverview ? "Current" : "Open"}</span>
      </button>
      <div class="report-command-section">Products</div>
      ${Array.from(productSelect.options).map((option) => {
        const name = option.textContent?.trim() || "Product";
        const selected = !isOverview && option.value === productSelect.value;
        return `
          <button type="button" class="report-command-option ${selected ? "selected" : ""}" data-report-target="${escapeAttribute(option.value)}" data-search-text="${escapeAttribute(name.toLowerCase())}">
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
  const options = Array.from(picker.querySelectorAll("[data-report-target]"));

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
    const query = input.value.trim().toLowerCase();
    let visibleCount = 0;
    options.forEach((option) => {
      const visible = !query || String(option.dataset.searchText || "").includes(query);
      option.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    empty.hidden = visibleCount > 0;
  };

  const choose = (target) => {
    if (target === "overview") {
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
  input.addEventListener("click", open);
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
    if (event.key === "Enter") {
      const firstVisible = options.find((option) => !option.hidden);
      if (firstVisible) {
        event.preventDefault();
        choose(firstVisible.dataset.reportTarget);
      }
    }
  });

  options.forEach((option) => option.addEventListener("click", () => choose(option.dataset.reportTarget)));
  picker.addEventListener("focusout", () => window.setTimeout(() => {
    if (!picker.contains(document.activeElement)) close();
  }, 80));
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
