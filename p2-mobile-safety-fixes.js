(() => {
  const phoneQuery = window.matchMedia('(max-width: 760px)');
  const isPhone = () => phoneQuery.matches;
  const validLocation = value => /^R(?:0[1-9]|[1-4]\d|50)-L[123]-[FMB]$/.test(value) || ['FLOOR-1','FLOOR-2','PACKING'].includes(value);
  const norm = value => String(value || '').trim().toUpperCase();

  function showSafety(message) {
    if (typeof toast === 'function') toast(message);
  }

  function selectedMoveAvailability() {
    const checked = document.querySelector('input[name="moveStock"]:checked');
    const label = checked?.closest('label');
    const detail = label?.querySelector('small')?.textContent || '';
    const unitMatch = detail.match(/([\d,.]+)\s+(bags?|cases?)/i);
    const lbMatch = detail.match(/([\d,.]+)\s+LB/i);
    return {
      stockUnit: unitMatch ? unitMatch[2].toUpperCase().replace(/S$/,'') : '',
      units: unitMatch ? Number(unitMatch[1].replace(/,/g,'')) : null,
      lbs: lbMatch ? Number(lbMatch[1].replace(/,/g,'')) : null
    };
  }

  function annotateMoveDrawer() {
    const from = document.getElementById('mMoveFrom');
    if (from && !from.dataset.initializedSafety) {
      from.dataset.initializedSafety = '1';
      from.dataset.originalSource = norm(from.value);
      from.addEventListener('change', () => {
        if (norm(from.value) !== from.dataset.originalSource) {
          showSafety('Source changed. Reopen the move from that location so its stock lines refresh.');
        }
      });
    }
  }

  function enforceReceiveConversion() {
    const unit = document.getElementById('locRecUnit');
    const lb = document.getElementById('locRecLb');
    if (!unit || !lb || unit.dataset.safetyBound) return;
    unit.dataset.safetyBound = '1';
    const apply = () => {
      if (norm(unit.value) === 'LB') {
        lb.value = '1';
        lb.readOnly = true;
        lb.setAttribute('aria-label','LB conversion fixed at 1');
        lb.dispatchEvent(new Event('input',{bubbles:true}));
      } else {
        lb.readOnly = false;
      }
    };
    unit.addEventListener('change', apply);
    apply();
  }

  const observer = new MutationObserver(() => {
    if (!isPhone()) return;
    annotateMoveDrawer();
    enforceReceiveConversion();
  });
  observer.observe(document.documentElement,{subtree:true,childList:true});

  document.addEventListener('click', event => {
    if (!isPhone()) return;

    const receiveNext = event.target.closest('[data-location-receive-next]');
    if (receiveNext) {
      const arrived = Number(document.getElementById('locRecQty')?.value || 0);
      const damaged = Number(document.getElementById('locRecDamaged')?.value || 0);
      const accepted = arrived - damaged;
      const lbPer = Number(document.getElementById('locRecLb')?.value || 0);
      const perSpace = Number(document.getElementById('locRecPerSpace')?.value || 0);
      if (arrived <= 0 || damaged < 0 || damaged > arrived || accepted <= 0) {
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        return showSafety('Check received and damaged quantities. Accepted quantity must be greater than zero.');
      }
      if (lbPer <= 0) {
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        return showSafety('LB per unit must be greater than zero.');
      }
      if (perSpace <= 0) {
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        return showSafety('Units per space must be greater than zero.');
      }
    }

    const moveFromLocation = event.target.closest('[data-mobile-move-from]');
    if (moveFromLocation) {
      const drawerText = document.querySelector('.mobile-location-state span')?.textContent || '';
      if (drawerText.includes('EMPTY')) {
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        return showSafety('This location is empty, so it cannot be the source. Start Move from an occupied location.');
      }
    }

    const reviewMove = event.target.closest('[data-move-review]');
    if (reviewMove) {
      const fromInput = document.getElementById('mMoveFrom');
      const toInput = document.getElementById('mMoveTo');
      const qtyInput = document.getElementById('mMoveQty');
      const unitInput = document.getElementById('mMoveUnit');
      const from = norm(fromInput?.value);
      const to = norm(toInput?.value);
      const qty = Number(qtyInput?.value || 0);
      const unit = norm(unitInput?.value);
      const available = selectedMoveAvailability();

      let error = '';
      if (!validLocation(from)) error = 'Source location is not valid.';
      else if (!validLocation(to)) error = 'Destination location is not valid.';
      else if (from === to) error = 'Source and destination must be different.';
      else if (fromInput?.dataset.originalSource && from !== fromInput.dataset.originalSource) error = 'Source changed without refreshing its stock lines. Reopen Move from the correct location.';
      else if (!(qty > 0)) error = 'Move quantity must be greater than zero.';
      else if (unit === 'LB' && available.lbs != null && qty > available.lbs) error = `Only ${available.lbs.toLocaleString()} LB are available in the selected stock line.`;
      else if (unit !== 'LB' && available.stockUnit && unit !== available.stockUnit) error = `Selected stock is stored as ${available.stockUnit}. Choose ${available.stockUnit} or LB.`;
      else if (unit !== 'LB' && available.units != null && qty > available.units) error = `Only ${available.units.toLocaleString()} ${available.stockUnit} are available in the selected stock line.`;

      if (error) {
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        return showSafety(error);
      }
    }

    const close = event.target.closest('[data-close-drawer]');
    if (close) {
      const eyebrow = norm(document.getElementById('drawerEyebrow')?.textContent);
      if (['CHOOSE DESTINATION','RECEIPT READY'].includes(eyebrow)) {
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        return showSafety('Finish this receipt before closing so unposted placements cannot be mistaken for available stock. Refresh the page only if you intentionally want to cancel the prototype receipt.');
      }
    }
  }, true);
})();
