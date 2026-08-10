(() => {
  const phone = () => window.matchMedia('(max-width: 760px)').matches;
  const isAdmin = () => document.body.classList.contains('admin-phone');

  function openWarehouseMove() {
    if (!phone() || !isAdmin()) return;
    if (state.page !== 'inventory') {
      navigate('inventory');
      requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector('[data-mobile-move]')?.click()));
    } else {
      document.querySelector('[data-mobile-move]')?.click();
    }
  }

  document.addEventListener('click', event => {
    if (!phone() || !isAdmin()) return;
    const move = event.target.closest('[data-admin-move],[data-admin-nav="move"]');
    if (!move) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openWarehouseMove();
  }, true);
})();
