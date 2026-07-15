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

