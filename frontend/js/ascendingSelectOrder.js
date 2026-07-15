const SORTABLE_SALES_ORDER_SELECTS = [
  'select[name="customer_id"]',
  'select[data-product-choice]',
  'select[data-supplier-lot-choice]',
  'select[data-location-choice]'
].join(",");

function naturalCompare(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

function sortSelect(select) {
  if (!select || !select.matches(SORTABLE_SALES_ORDER_SELECTS)) return;

  const selectedValue = select.value;
  const options = Array.from(select.options);
  const fixed = options.filter((option) => option.value === "");
  const sortable = options
    .filter((option) => option.value !== "")
    .sort((a, b) => naturalCompare(a.textContent, b.textContent));

  [...fixed, ...sortable].forEach((option) => select.appendChild(option));
  if (Array.from(select.options).some((option) => option.value === selectedValue)) {
    select.value = selectedValue;
  }
}

function sortLineSelects(line) {
  if (!line) return;
  line.querySelectorAll(SORTABLE_SALES_ORDER_SELECTS).forEach(sortSelect);
}

document.addEventListener("focusin", (event) => {
  const select = event.target.closest?.(SORTABLE_SALES_ORDER_SELECTS);
  if (select) sortSelect(select);
});

document.addEventListener("change", (event) => {
  const select = event.target.closest?.(SORTABLE_SALES_ORDER_SELECTS);
  if (!select) return;

  const line = select.closest(".sales-line-item");
  setTimeout(() => {
    if (line) sortLineSelects(line);
    else sortSelect(select);
  }, 0);
});
