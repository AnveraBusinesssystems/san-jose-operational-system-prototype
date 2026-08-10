(() => {
  document.addEventListener('input', e => {
    const input=e.target.closest?.('[data-count-search]');
    if(!input)return;
    e.stopImmediatePropagation();
    const q=String(input.value||'').trim().toLowerCase();
    const state=window.SanJoseLiveInventory?.getState?.();
    if(state)state.query=input.value;
    document.querySelectorAll('.count-product-row').forEach(row=>{row.hidden=Boolean(q&&!row.textContent.toLowerCase().includes(q));});
  },true);
})();
