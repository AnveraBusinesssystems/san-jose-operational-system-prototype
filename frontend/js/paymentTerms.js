const PAYMENT_TERM_OPTIONS = ["Net 0", "Net 7", "Net 15", "Net 21", "Net 30", "Net 45", "Net 60", "Due on Receipt"];
const DATALIST_ID = "sjops-payment-terms-options";

function ensureDatalist() {
  if (document.getElementById(DATALIST_ID)) return;
  const datalist = document.createElement("datalist");
  datalist.id = DATALIST_ID;
  datalist.innerHTML = PAYMENT_TERM_OPTIONS.map((value) => `<option value="${value}"></option>`).join("");
  document.body.appendChild(datalist);
}

function upgradePaymentTerms(root = document) {
  ensureDatalist();
  root.querySelectorAll('select[name="payment_terms"]').forEach((select) => {
    const input = document.createElement("input");
    input.type = "text";
    input.name = "payment_terms";
    input.value = select.value || "Net 30";
    input.setAttribute("list", DATALIST_ID);
    input.setAttribute("autocomplete", "off");
    input.setAttribute("placeholder", "Net 0, Net 15, Net 30, etc.");
    input.required = select.required;
    input.className = select.className;
    select.replaceWith(input);
  });
}

const observer = new MutationObserver(() => upgradePaymentTerms(document.getElementById("view") || document));

window.addEventListener("DOMContentLoaded", () => {
  const view = document.getElementById("view");
  if (view) observer.observe(view, { childList: true, subtree: true });
  upgradePaymentTerms(view || document);
});

upgradePaymentTerms(document);
