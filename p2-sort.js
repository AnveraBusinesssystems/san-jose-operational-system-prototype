(() => {
  const NON_SORTABLE_HEADERS = new Set(['action', 'actions']);
  const DATE_HEADERS = new Set(['date', 'order date', 'expected', 'due', 'received', 'expiration', 'expires']);
  const NUMBER_HINTS = [
    'product', 'products', 'qty', 'quantity', 'on hand', 'committed', 'free', 'incoming',
    'week', 'weeks', 'cover', 'value', 'total', 'cost', 'sell', 'price', 'margin',
    'balance', 'orders', 'lb', 'lbs', 'demand', 'reorder', 'suggested', 'inventory'
  ];

  const cleanText = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const headerLabel = th => cleanText(th.textContent).toLowerCase();

  function columnType(table, index, th) {
    const label = headerLabel(th);
    if (DATE_HEADERS.has(label) || /(date|expected|due|received|expiration)/.test(label)) return 'date';
    if (NUMBER_HINTS.some(hint => label === hint || label.includes(hint))) return 'number';

    const sample = [...table.tBodies[0]?.rows || []]
      .slice(0, 6)
      .map(row => cleanText(row.cells[index]?.textContent))
      .filter(Boolean);
    if (sample.length && sample.every(value => numericValue(value) !== null)) return 'number';
    return 'text';
  }

  function numericValue(value) {
    const text = cleanText(value);
    if (!text || text === '—' || text === '-') return null;
    const normalized = text
      .replace(/\$/g, '')
      .replace(/,/g, '')
      .replace(/%/g, '')
      .replace(/\([^)]*\)/g, '')
      .trim();
    const match = normalized.match(/^-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function dateValue(value) {
    const text = cleanText(value);
    if (!text || text === '—') return null;
    const parsed = Date.parse(text);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function cellValue(row, index, type) {
    const cell = row.cells[index];
    if (!cell) return type === 'text' ? '' : null;
    if (cell.dataset.sortValue !== undefined) {
      if (type === 'number') return numericValue(cell.dataset.sortValue);
      if (type === 'date') return dateValue(cell.dataset.sortValue);
      return cleanText(cell.dataset.sortValue);
    }
    const value = cleanText(cell.textContent);
    if (type === 'number') return numericValue(value);
    if (type === 'date') return dateValue(value);
    return value;
  }

  function compareValues(a, b, type) {
    const aEmpty = a === null || a === undefined || a === '';
    const bEmpty = b === null || b === undefined || b === '';
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    if (type === 'number' || type === 'date') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  }

  function sortTable(table, index, type, direction) {
    const tbody = table.tBodies[0];
    if (!tbody) return;
    const rows = [...tbody.rows].map((row, originalIndex) => ({ row, originalIndex }));
    const multiplier = direction === 'asc' ? 1 : -1;

    rows.sort((left, right) => {
      const result = compareValues(
        cellValue(left.row, index, type),
        cellValue(right.row, index, type),
        type
      );
      return result ? result * multiplier : left.originalIndex - right.originalIndex;
    });

    const fragment = document.createDocumentFragment();
    rows.forEach(({ row }) => fragment.appendChild(row));
    tbody.appendChild(fragment);
  }

  function enhanceTable(table) {
    if (table.dataset.sortEnhanced === 'true' || !table.tHead || !table.tBodies.length) return;
    table.dataset.sortEnhanced = 'true';
    table.classList.add('sortable-table');

    const headers = [...table.tHead.querySelectorAll('th')];
    headers.forEach((th, index) => {
      const label = headerLabel(th);
      if (!label || NON_SORTABLE_HEADERS.has(label)) {
        th.classList.add('sort-disabled');
        return;
      }

      const type = columnType(table, index, th);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'table-sort-control';
      button.dataset.column = String(index);
      button.dataset.type = type;
      button.dataset.direction = '';
      button.setAttribute('aria-label', `Sort by ${cleanText(th.textContent)}`);
      button.innerHTML = `<span class="sort-label">${th.innerHTML}</span><span class="sort-mark" aria-hidden="true"></span>`;
      th.replaceChildren(button);
      th.setAttribute('aria-sort', 'none');

      button.addEventListener('click', () => {
        const wasActive = button.classList.contains('active');
        const current = button.dataset.direction;
        const firstDirection = type === 'text' ? 'asc' : 'desc';
        const nextDirection = wasActive
          ? (current === 'asc' ? 'desc' : 'asc')
          : firstDirection;

        headers.forEach(otherTh => {
          otherTh.setAttribute('aria-sort', 'none');
          const otherButton = otherTh.querySelector('.table-sort-control');
          if (!otherButton) return;
          otherButton.classList.remove('active', 'ascending', 'descending');
          otherButton.dataset.direction = '';
        });

        button.classList.add('active', nextDirection === 'asc' ? 'ascending' : 'descending');
        button.dataset.direction = nextDirection;
        th.setAttribute('aria-sort', nextDirection === 'asc' ? 'ascending' : 'descending');
        sortTable(table, index, type, nextDirection);
      });
    });
  }

  function enhanceAllTables(root = document) {
    root.querySelectorAll?.('table.data-table').forEach(enhanceTable);
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('table.data-table')) enhanceTable(node);
        enhanceAllTables(node);
      }
    }
  });

  function start() {
    enhanceAllTables();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
