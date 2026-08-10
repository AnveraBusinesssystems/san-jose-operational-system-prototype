(() => {
  const phoneQuery = window.matchMedia('(max-width: 760px)');
  const isPhone = () => phoneQuery.matches;

  const base = {
    renderOverview,
    renderReceiving,
    renderShipping,
    renderInventory,
    renderScanner,
    bindPageInteractions,
    renderPage,
    openRackSpace
  };

  state.selectedRack = /^R\d{2}$/.test(state.selectedRack || '') ? state.selectedRack : 'R12';
  state.mobileReceiveProgress = state.mobileReceiveProgress || {};

  const warehouseSpaceContents = {
    'R08-L2-F': [{product:'Jamaica Flor', lot:'JAL-7741', units:'36 bags', lbs:900}],
    'R08-L2-M': [{product:'Jamaica Flor', lot:'JAL-7810', units:'30 bags', lbs:750}],
    'R12-L1-F': [{product:'Chile Ancho', lot:'MX-A4832', units:'32 bags', lbs:800}],
    'R12-L1-M': [
      {product:'Chile Ancho', lot:'MX-A4920', units:'20 bags', lbs:500},
      {product:'Comino Entero', lot:'CM-3108', units:'8 bags', lbs:200}
    ],
    'R12-L2-F': [{product:'Chile Ancho', lot:'MX-A5018', units:'40 cases', lbs:1000}],
    'R13-L1-F': [{product:'Tamarindo Entero', lot:'TM-5510', units:'40 bags', lbs:1000}],
    'R15-L2-M': [{product:'Chile Ancho', lot:'MX-A4920', units:'44 bags', lbs:1100}],
    'R18-L3-M': [{product:'Frijol Peruano', lot:'FP-6621', units:'60 bags', lbs:1500}],
    'R22-L1-B': [{product:'Ciruela Pasa', lot:'CP-2218', units:'25 cases', lbs:500}]
  };

  const shipmentLines = {
    'SO-22698': [
      {product:'Tamarindo Entero', need:'20 bags', source:'R13-L1-F', lot:'TM-5510', available:'40 bags · 1,000 LB'},
      {product:'Chile Ancho', need:'12 bags', source:'R12-L1-F', lot:'MX-A4832', available:'32 bags · 800 LB'},
      {product:'Jamaica Flor', need:'8 bags', source:'R08-L2-F', lot:'JAL-7741', available:'36 bags · 900 LB'}
    ],
    'SO-22697': [
      {product:'Frijol Peruano', need:'18 bags', source:'R18-L3-M', lot:'FP-6621', available:'60 bags · 1,500 LB'},
      {product:'Chile Ancho', need:'16 bags', source:'R15-L2-M', lot:'MX-A4920', available:'44 bags · 1,100 LB'}
    ]
  };

  function workerIcon(symbol, label) {
    return `<span class="worker-icon" aria-hidden="true">${symbol}</span><span class="sr-only">${label}</span>`;
  }

  function todayLabel() {
    return new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'});
  }

  function mobileOrderStatus(order, purchase = false) {
    const due = purchase ? order.expected : order.due;
    const label = purchase ? 'Expected' : 'Due';
    return `<div class="mobile-order-meta"><span>${label} ${fmtDate(due)}</span>${statusPill(order.status)}</div>`;
  }

  function renderWorkerHome() {
    setHeading('Warehouse', 'Worker Home');
    return `<div class="worker-mobile-page worker-home">
      <section class="worker-welcome">
        <span class="worker-kicker">WAREHOUSE</span>
        <h2>${todayLabel()}</h2>
        <p>Choose what you are doing. Each flow keeps the order, lot and location together.</p>
      </section>

      <section class="worker-action-grid" aria-label="Warehouse actions">
        <button class="worker-action-card receive" type="button" data-mobile-go="receiving">
          ${workerIcon('↓','Receive')}
          <strong>Receive</strong>
          <span>3 orders expected</span>
          <em>PO → product → space</em>
        </button>
        <button class="worker-action-card ship" type="button" data-mobile-go="shipping">
          ${workerIcon('↑','Ship')}
          <strong>Ship</strong>
          <span>5 orders ready</span>
          <em>Order → stock → send</em>
        </button>
        <button class="worker-action-card move" type="button" data-mobile-move>
          ${workerIcon('↔','Move')}
          <strong>Move</strong>
          <span>Space to space</span>
          <em>Scan source + destination</em>
        </button>
        <button class="worker-action-card stock" type="button" data-mobile-go="inventory">
          ${workerIcon('⌕','Find stock')}
          <strong>Find Stock</strong>
          <span>Rack, product or lot</span>
          <em>50 racks · 450 spaces</em>
        </button>
      </section>

      <section class="worker-section">
        <div class="worker-section-head"><div><span class="worker-kicker">NEXT UP</span><h3>Today’s work</h3></div><button type="button" class="worker-text-btn" data-mobile-go="scanner">Scan</button></div>
        <div class="worker-task-list">
          <button type="button" class="worker-task-row" data-mobile-go="receiving"><span class="task-number">01</span><div><strong>Receive PO-22714</strong><small>El Mexicano Foods · expected today</small></div><span class="task-arrow">›</span></button>
          <button type="button" class="worker-task-row" data-mobile-ship="SO-22698"><span class="task-number">02</span><div><strong>Ship SO-22698</strong><small>Publico General · ready now</small></div><span class="task-arrow">›</span></button>
          <button type="button" class="worker-task-row" data-mobile-space="R12-L1-M"><span class="task-number">03</span><div><strong>Review mixed space</strong><small>R12-L1-M · 2 stock lines</small></div><span class="task-arrow">›</span></button>
        </div>
      </section>
    </div>`;
  }

  function receiveCard(order) {
    const progress = state.mobileReceiveProgress[order.id] || 0;
    return `<article class="mobile-order-card ${progress ? 'active-job' : ''}">
      <button type="button" class="mobile-order-main" data-mobile-receive="${order.id}">
        <div class="mobile-order-title"><div><span class="worker-kicker">${progress ? 'ACTIVE RECEIPT' : 'PURCHASE ORDER'}</span><strong>${order.id}</strong></div>${statusPill(progress ? 'PARTIAL' : order.status)}</div>
        <h3>${order.supplier}</h3>
        <div class="mobile-order-facts"><span><b>${order.products}</b> products</span><span><b>${fmtMoney.format(order.total)}</b> value</span></div>
        ${mobileOrderStatus(order, true)}
        ${progress ? `<div class="mobile-progress-line"><span style="width:${Math.min(100, progress * 34)}%"></span></div><small>${progress} space${progress === 1 ? '' : 's'} placed · tap to continue</small>` : '<small>Tap to start receiving</small>'}
      </button>
    </article>`;
  }

  function renderWorkerReceiving() {
    setHeading('Warehouse', 'Receiving');
    const queue = data.purchaseOrders.filter(o => o.status !== 'RECEIVED');
    return `<div class="worker-mobile-page">
      <section class="mobile-page-intro">
        <div><span class="worker-kicker">RECEIVING</span><h2>What arrived?</h2><p>Open a PO, enter what arrived, then place one space at a time.</p></div>
        <button type="button" class="mobile-scan-square" data-mobile-go="scanner" aria-label="Open scanner">⌗</button>
      </section>
      <div class="mobile-summary-strip">
        <div><strong>3</strong><span>Due today</span></div><div><strong>2</strong><span>Active</span></div><div><strong>3,420</strong><span>LB today</span></div>
      </div>
      <label class="mobile-search"><span>⌕</span><input type="search" placeholder="Search PO or vendor" data-mobile-card-search></label>
      <section class="mobile-order-list" data-mobile-card-list>${queue.map(receiveCard).join('')}</section>
    </div>`;
  }

  function shipCard(order) {
    return `<article class="mobile-order-card" data-card-search="${`${order.id} ${order.customer} ${order.status}`.toLowerCase()}">
      <button type="button" class="mobile-order-main" data-mobile-ship="${order.id}">
        <div class="mobile-order-title"><div><span class="worker-kicker">SALES ORDER</span><strong>${order.id}</strong></div>${statusPill(order.status)}</div>
        <h3>${order.customer}</h3>
        <div class="mobile-order-facts"><span><b>${order.products}</b> products</span><span><b>${fmtMoney.format(order.total)}</b> total</span></div>
        ${mobileOrderStatus(order, false)}
        <small>${['READY','PICKED'].includes(order.status) ? 'Tap to select locations and ship' : 'Tap to review order'}</small>
      </button>
    </article>`;
  }

  function renderWorkerShipping() {
    setHeading('Warehouse', 'Shipping');
    const queue = data.salesOrders.filter(o => o.status !== 'SHIPPED');
    return `<div class="worker-mobile-page">
      <section class="mobile-page-intro">
        <div><span class="worker-kicker">SHIPPING</span><h2>What is leaving?</h2><p>Pick the real lot and rack space. The system never forces FIFO.</p></div>
        <button type="button" class="mobile-scan-square" data-mobile-go="scanner" aria-label="Open scanner">⌗</button>
      </section>
      <div class="mobile-filter-pills" role="group" aria-label="Shipping filters">
        <button type="button" class="active" data-mobile-status-filter="">All <b>${queue.length}</b></button>
        <button type="button" data-mobile-status-filter="READY">Ready</button>
        <button type="button" data-mobile-status-filter="PARTIAL">Partial</button>
        <button type="button" data-mobile-status-filter="HOLD">Hold</button>
      </div>
      <label class="mobile-search"><span>⌕</span><input type="search" placeholder="Search SO or customer" data-mobile-card-search></label>
      <section class="mobile-order-list" data-mobile-card-list>${queue.map(shipCard).join('')}</section>
    </div>`;
  }

  function rackSpaceButton(rack, level, position) {
    const id = `${rack}-${level}-${position}`;
    const lines = warehouseSpaceContents[id] || [];
    const total = lines.reduce((sum, row) => sum + row.lbs, 0);
    if (!lines.length) return `<button type="button" class="mobile-rack-space empty-space" data-mobile-space="${id}"><small>${level}-${position}</small><strong>EMPTY</strong><span>Available</span></button>`;
    if (lines.length > 1) return `<button type="button" class="mobile-rack-space mixed-space" data-mobile-space="${id}"><small>${level}-${position}</small><strong>MIXED · ${lines.length}</strong><span>${fmtNum.format(total)} LB</span></button>`;
    return `<button type="button" class="mobile-rack-space" data-mobile-space="${id}"><small>${level}-${position}</small><strong>${lines[0].product}</strong><span>${lines[0].units}</span></button>`;
  }

  function rackSelector() {
    const racks = Array.from({length:50}, (_, i) => `R${String(i + 1).padStart(2,'0')}`);
    return `<div class="mobile-rack-selector" data-mobile-rack-selector>${racks.map(r => `<button type="button" class="${r === state.selectedRack ? 'active' : ''}" data-mobile-rack="${r}">${r}</button>`).join('')}<button type="button" data-mobile-special-location="FLOOR-1">FLOOR-1</button><button type="button" data-mobile-special-location="FLOOR-2">FLOOR-2</button><button type="button" data-mobile-special-location="PACKING">PACKING</button></div>`;
  }

  function renderWorkerInventory() {
    setHeading('Warehouse', 'Inventory');
    const rack = state.selectedRack;
    return `<div class="worker-mobile-page mobile-inventory-page">
      <section class="mobile-page-intro compact-intro">
        <div><span class="worker-kicker">FIND STOCK</span><h2>Where is it?</h2><p>Search a product, lot or location, or open a rack below.</p></div>
        <button type="button" class="mobile-scan-square" data-mobile-go="scanner" aria-label="Open scanner">⌗</button>
      </section>
      <label class="mobile-search stock-search"><span>⌕</span><input id="mobileStockSearch" type="search" placeholder="Product, supplier lot, rack..." data-stock-search></label>
      <div class="mobile-stock-results" data-stock-results hidden></div>
      <section class="mobile-rack-card">
        <div class="mobile-rack-heading"><div><span class="worker-kicker">WAREHOUSE RACK</span><h3>${rack}</h3></div><button type="button" class="worker-text-btn" data-mobile-move>Move stock</button></div>
        <div class="mobile-rack-axis"><span></span><b>FRONT</b><b>MIDDLE</b><b>BACK</b></div>
        <div class="mobile-rack-grid">
          ${['L3','L2','L1'].map(level => `<b class="mobile-level-label">${level}</b>${['F','M','B'].map(pos => rackSpaceButton(rack, level, pos)).join('')}`).join('')}
        </div>
        ${rackSelector()}
      </section>
      <section class="worker-section compact-section">
        <div class="worker-section-head"><div><span class="worker-kicker">OTHER AREAS</span><h3>Floor & Packing</h3></div></div>
        <div class="mobile-location-shortcuts"><button type="button" data-mobile-special-location="FLOOR-1"><strong>FLOOR-1</strong><span>Multi-product storage</span></button><button type="button" data-mobile-special-location="FLOOR-2"><strong>FLOOR-2</strong><span>Multi-product storage</span></button><button type="button" data-mobile-special-location="PACKING"><strong>PACKING</strong><span>Temporary staging</span></button></div>
      </section>
    </div>`;
  }

  function renderWorkerScanner() {
    setHeading('Tools', 'Scanner');
    return `<div class="worker-mobile-page">
      <section class="mobile-page-intro"><div><span class="worker-kicker">SCANNER</span><h2>Scan anything</h2><p>Location QR, product barcode, lot or order reference.</p></div></section>
      <section class="mobile-scanner-card">
        <div class="scanner-frame"><span></span><span></span><span></span><span></span><strong>CAMERA / SCANNER AREA</strong><small>Prototype display</small></div>
        <label class="mobile-search"><span>⌗</span><input id="scanInput" inputmode="text" autofocus placeholder="Or type / scan code"></label>
        <div id="scanResult" class="mobile-scan-result">Waiting for a scan.</div>
      </section>
    </div>`;
  }

  renderOverview = function() { return isPhone() ? renderWorkerHome() : base.renderOverview(); };
  renderReceiving = function() { return isPhone() ? renderWorkerReceiving() : base.renderReceiving(); };
  renderShipping = function() { return isPhone() ? renderWorkerShipping() : base.renderShipping(); };
  renderInventory = function() { return isPhone() ? renderWorkerInventory() : base.renderInventory(); };
  renderScanner = function() { return isPhone() ? renderWorkerScanner() : base.renderScanner(); };

  function openReceiveFlow(orderId) {
    const order = data.purchaseOrders.find(o => o.id === orderId);
    if (!order) return;
    const products = ['Tamarindo Entero','Chile Ancho','Jamaica Flor','Frijol Peruano'];
    openDrawer('RECEIVE PRODUCT', `${order.id} · ${order.supplier}`, `
      <section class="mobile-flow-steps"><span class="active">1</span><i></i><span>2</span><i></i><span>3</span><small>Count</small><small>Place</small><small>Finish</small></section>
      <section class="drawer-section mobile-flow-section">
        <div class="mobile-order-context"><span>Expected ${fmtDate(order.expected)}</span>${statusPill(order.status)}</div>
        <div class="field full"><label>Product</label><select id="mReceiveProduct">${products.slice(0, Math.min(4, order.products)).map(p => `<option>${p}</option>`).join('')}</select></div>
        <div class="mobile-two-col">
          <div class="field"><label>Quantity arrived</label><input id="mReceiveQty" type="number" inputmode="decimal" value="120"></div>
          <div class="field"><label>Unit</label><select id="mReceiveUnit"><option>CASE</option><option>BAG</option><option>LB</option></select></div>
          <div class="field"><label>LB / unit</label><input id="mReceiveLb" type="number" inputmode="decimal" value="25"></div>
          <div class="field"><label>Damaged</label><input id="mReceiveDamaged" type="number" inputmode="decimal" value="0"></div>
        </div>
        <div class="field full"><label>Supplier lot</label><input id="mReceiveLot" value="77891" autocomplete="off"></div>
        <div class="mobile-calc-banner" id="mReceivePreview"><strong>120 CASE</strong><span>3,000 LB accepted · 3 spaces at 40 cases</span></div>
      </section>
      <div class="drawer-actions mobile-sticky-actions"><button type="button" class="primary-btn mobile-primary" data-mobile-placement-next="${order.id}">Continue to placement →</button></div>
    `);
    const q = document.getElementById('mReceiveQty');
    const unit = document.getElementById('mReceiveUnit');
    const lb = document.getElementById('mReceiveLb');
    const damaged = document.getElementById('mReceiveDamaged');
    const preview = document.getElementById('mReceivePreview');
    const update = () => {
      const accepted = Math.max(0, Number(q.value || 0) - Number(damaged.value || 0));
      const totalLb = accepted * Number(lb.value || 0);
      const spaces = Math.max(1, Math.ceil(accepted / 40));
      preview.innerHTML = `<strong>${fmtNum.format(accepted)} ${unit.value}</strong><span>${fmtNum.format(totalLb)} LB accepted · ${spaces} space${spaces === 1 ? '' : 's'} at ~40 ${unit.value.toLowerCase()}</span>`;
    };
    [q, unit, lb, damaged].forEach(el => el?.addEventListener('input', update));
    document.querySelector('[data-mobile-placement-next]')?.addEventListener('click', () => openPlacementFlow(orderId, {
      product: document.getElementById('mReceiveProduct')?.value || products[0],
      qty: Number(q?.value || 0) - Number(damaged?.value || 0),
      unit: unit?.value || 'CASE',
      lbPer: Number(lb?.value || 0),
      lot: document.getElementById('mReceiveLot')?.value || ''
    }));
  }

  function openPlacementFlow(orderId, receipt) {
    const placed = state.mobileReceiveProgress[orderId] || 0;
    const spaces = Math.max(1, Math.ceil(receipt.qty / 40));
    const remainingSpaces = Math.max(1, spaces - placed);
    const remainingQty = Math.max(0, receipt.qty - placed * 40);
    const thisQty = Math.min(40, remainingQty || receipt.qty);
    const defaultRack = ['R12-L1-B','R12-L2-M','R13-L2-F'][placed % 3];
    openDrawer('PLACE INVENTORY', `${orderId} · ${receipt.product}`, `
      <section class="mobile-flow-steps"><span class="done">✓</span><i class="done"></i><span class="active">2</span><i></i><span>3</span><small>Count</small><small>Place</small><small>Finish</small></section>
      <section class="drawer-section mobile-flow-section">
        <div class="mobile-placement-summary"><div><span>Supplier lot</span><strong>${receipt.lot || '—'}</strong></div><div><span>Still to place</span><strong>${fmtNum.format(remainingQty)} ${receipt.unit}</strong></div></div>
        <div class="mobile-space-progress"><span>${placed} of ${spaces} spaces completed</span><b>${remainingSpaces} remaining</b></div>
        <div class="mobile-progress-line"><span style="width:${spaces ? placed / spaces * 100 : 0}%"></span></div>
        <div class="field full scan-field"><label>Destination location</label><div><input id="mPlacementLocation" value="${defaultRack}" autocomplete="off"><button type="button" data-focus-location>SCAN</button></div></div>
        <div class="field full"><label>Quantity in this space</label><div class="mobile-qty-stepper"><button type="button" data-qty-minus>−</button><input id="mPlacementQty" type="number" inputmode="decimal" value="${thisQty}"><button type="button" data-qty-plus>+</button></div></div>
        <div class="mobile-calc-banner"><strong>${fmtNum.format(thisQty * receipt.lbPer)} LB</strong><span>${thisQty} ${receipt.unit} × ${receipt.lbPer} LB</span></div>
        <div class="mobile-location-picks"><button type="button" data-pick-location="R12-L1-B">R12-L1-B</button><button type="button" data-pick-location="R12-L2-M">R12-L2-M</button><button type="button" data-pick-location="FLOOR-1">FLOOR-1</button></div>
      </section>
      <div class="drawer-actions mobile-sticky-actions"><button type="button" class="primary-btn mobile-primary" data-place-confirm>Place here & ${placed + 1 < spaces ? 'continue' : 'finish'}</button></div>
    `);
    document.querySelectorAll('[data-pick-location]').forEach(btn => btn.addEventListener('click', () => { document.getElementById('mPlacementLocation').value = btn.dataset.pickLocation; }));
    document.querySelector('[data-focus-location]')?.addEventListener('click', () => document.getElementById('mPlacementLocation')?.focus());
    document.querySelector('[data-qty-minus]')?.addEventListener('click', () => { const el = document.getElementById('mPlacementQty'); el.value = Math.max(0, Number(el.value || 0) - 1); });
    document.querySelector('[data-qty-plus]')?.addEventListener('click', () => { const el = document.getElementById('mPlacementQty'); el.value = Number(el.value || 0) + 1; });
    document.querySelector('[data-place-confirm]')?.addEventListener('click', () => {
      state.mobileReceiveProgress[orderId] = placed + 1;
      toast(`Placement ${placed + 1} of ${spaces} recorded in preview`);
      if (placed + 1 < spaces) openPlacementFlow(orderId, receipt);
      else { closeDrawer(); navigate('receiving'); }
    });
  }

  function openShipFlow(orderId) {
    const order = data.salesOrders.find(o => o.id === orderId);
    if (!order) return;
    const lines = shipmentLines[orderId] || [
      {product:'Chile Ancho', need:'10 bags', source:'R12-L1-F', lot:'MX-A4832', available:'32 bags · 800 LB'},
      {product:'Tamarindo Entero', need:'8 bags', source:'R13-L1-F', lot:'TM-5510', available:'40 bags · 1,000 LB'}
    ];
    openDrawer('PICK & SHIP', `${order.id} · ${order.customer}`, `
      <section class="mobile-flow-steps ship-steps"><span class="active">1</span><i></i><span>2</span><i></i><span>3</span><small>Choose stock</small><small>Review</small><small>Ship</small></section>
      <section class="drawer-section mobile-flow-section">
        <div class="mobile-order-context"><span>Due ${fmtDate(order.due)}</span>${statusPill(order.status)}</div>
        <div class="mobile-rule-note"><strong>You choose the physical stock.</strong><span>No forced FIFO. Tap a line to change the source location or lot.</span></div>
        <div class="mobile-pick-list">${lines.map((line, index) => `<button type="button" class="mobile-pick-row selected" data-pick-line="${index}"><span class="pick-check">✓</span><div><strong>${line.product}</strong><small>Need ${line.need}</small><em>${line.source} · ${line.lot}</em><small>${line.available} available</small></div><span class="task-arrow">›</span></button>`).join('')}</div>
      </section>
      <div class="drawer-actions mobile-sticky-actions"><button type="button" class="primary-btn mobile-primary" data-ship-review="${orderId}">Review shipment →</button></div>
    `);
    document.querySelectorAll('[data-pick-line]').forEach(btn => btn.addEventListener('click', () => btn.classList.toggle('selected')));
    document.querySelector('[data-ship-review]')?.addEventListener('click', () => openShipReview(order, lines));
  }

  function openShipReview(order, lines) {
    openDrawer('REVIEW SHIPMENT', order.id, `
      <section class="mobile-flow-steps ship-steps"><span class="done">✓</span><i class="done"></i><span class="active">2</span><i></i><span>3</span><small>Choose stock</small><small>Review</small><small>Ship</small></section>
      <section class="drawer-section mobile-flow-section">
        <div class="mobile-review-hero"><span>Customer</span><strong>${order.customer}</strong><small>${lines.length} selected stock lines · ${fmtMoney.format(order.total)}</small></div>
        <div class="mobile-review-list">${lines.map(line => `<div><span>${line.product}</span><strong>${line.need}</strong><small>${line.source} · ${line.lot}</small></div>`).join('')}</div>
        <div class="mobile-rule-note success-note"><strong>Ready to post shipment</strong><span>Inventory will be deducted from the exact product + lot + location selected above.</span></div>
      </section>
      <div class="drawer-actions mobile-sticky-actions"><button type="button" class="primary-btn mobile-primary" data-ship-confirm>Mark shipped</button></div>
    `);
    document.querySelector('[data-ship-confirm]')?.addEventListener('click', () => { toast(`${order.id} marked shipped in preview`); closeDrawer(); navigate('shipping'); });
  }

  function contentsForLocation(location) {
    if (warehouseSpaceContents[location]) return warehouseSpaceContents[location];
    if (location === 'PACKING') return [
      {product:'Tamarindo Entero', lot:'TM-5510', units:'23 bags', lbs:575},
      {product:'Chile Ancho', lot:'MX-A4832', units:'40 bags', lbs:1000}
    ];
    if (location === 'FLOOR-1') return [{product:'Frijol Peruano', lot:'FP-6621', units:'80 bags', lbs:2000}];
    if (location === 'FLOOR-2') return [{product:'Maiz Pozolero', lot:'MP-1174', units:'60 bags', lbs:1500}];
    return [];
  }

  function openMobileSpace(location) {
    const lines = contentsForLocation(location);
    openDrawer('LOCATION', location, `
      <section class="drawer-section mobile-flow-section">
        <div class="mobile-location-state"><span>${lines.length ? (lines.length > 1 ? 'MIXED LOCATION' : 'OCCUPIED') : 'EMPTY LOCATION'}</span><strong>${lines.reduce((sum,row)=>sum+row.lbs,0).toLocaleString()} LB</strong></div>
        ${lines.length ? `<div class="mobile-space-lines">${lines.map((row, i) => `<article><div><span class="worker-kicker">STOCK LINE ${i + 1}</span><strong>${row.product}</strong><small>Supplier lot ${row.lot}</small></div><div class="space-line-qty"><b>${row.units}</b><span>${fmtNum.format(row.lbs)} LB</span></div><button type="button" data-move-stock-line="${i}">MOVE</button></article>`).join('')}</div>` : `<div class="mobile-empty-location"><strong>Available space</strong><span>No positive inventory balance exists here.</span></div>`}
      </section>
      <div class="drawer-actions mobile-sticky-actions"><button type="button" class="secondary-btn mobile-primary" data-mobile-move-from="${location}">${lines.length ? 'Move inventory from here' : 'Move inventory here'}</button></div>
    `);
    document.querySelectorAll('[data-move-stock-line]').forEach(btn => btn.addEventListener('click', () => openMoveFlow({source:location, line:lines[Number(btn.dataset.moveStockLine)]})));
    document.querySelector('[data-mobile-move-from]')?.addEventListener('click', () => openMoveFlow({source:location, line:lines[0]}));
  }

  function openMoveFlow(prefill = {}) {
    const source = prefill.source || 'R12-L1-M';
    const lines = contentsForLocation(source);
    const selected = prefill.line || lines[0] || {product:'Chile Ancho', lot:'MX-A4920', units:'20 bags', lbs:500};
    openDrawer('MOVE INVENTORY', 'Space → space', `
      <section class="mobile-flow-steps move-steps"><span class="active">1</span><i></i><span>2</span><small>Select</small><small>Confirm</small></section>
      <section class="drawer-section mobile-flow-section">
        <div class="field full scan-field"><label>From location</label><div><input id="mMoveFrom" value="${source}" autocomplete="off"><button type="button" data-focus-move="from">SCAN</button></div></div>
        <div class="mobile-rule-note"><strong>${lines.length > 1 ? `Mixed space · ${lines.length} stock lines` : 'Choose the exact stock line'}</strong><span>A physical location can contain multiple products or lots.</span></div>
        <div class="mobile-stock-radio-list">${(lines.length ? lines : [selected]).map((row, i) => `<label><input type="radio" name="moveStock" value="${i}" ${i === 0 ? 'checked' : ''}><span><strong>${row.product}</strong><small>${row.lot} · ${row.units} · ${fmtNum.format(row.lbs)} LB</small></span></label>`).join('')}</div>
        <div class="mobile-two-col"><div class="field"><label>Quantity</label><input id="mMoveQty" type="number" inputmode="decimal" value="10"></div><div class="field"><label>Unit</label><select id="mMoveUnit"><option>BAG</option><option>CASE</option><option>LB</option></select></div></div>
        <div class="field full scan-field"><label>To location</label><div><input id="mMoveTo" value="R12-L1-B" autocomplete="off"><button type="button" data-focus-move="to">SCAN</button></div></div>
        <div class="mobile-location-picks"><button type="button" data-move-dest="R12-L1-B">R12-L1-B</button><button type="button" data-move-dest="PACKING">PACKING</button><button type="button" data-move-dest="FLOOR-1">FLOOR-1</button></div>
      </section>
      <div class="drawer-actions mobile-sticky-actions"><button type="button" class="primary-btn mobile-primary" data-move-review>Review move →</button></div>
    `);
    document.querySelectorAll('[data-focus-move]').forEach(btn => btn.addEventListener('click', () => document.getElementById(btn.dataset.focusMove === 'from' ? 'mMoveFrom' : 'mMoveTo')?.focus()));
    document.querySelectorAll('[data-move-dest]').forEach(btn => btn.addEventListener('click', () => { document.getElementById('mMoveTo').value = btn.dataset.moveDest; }));
    document.querySelector('[data-move-review]')?.addEventListener('click', () => {
      const lineIndex = Number(document.querySelector('input[name="moveStock"]:checked')?.value || 0);
      const line = (lines.length ? lines : [selected])[lineIndex];
      openMoveReview({
        from: document.getElementById('mMoveFrom')?.value || source,
        to: document.getElementById('mMoveTo')?.value || '',
        qty: Number(document.getElementById('mMoveQty')?.value || 0),
        unit: document.getElementById('mMoveUnit')?.value || 'BAG',
        line
      });
    });
  }

  function openMoveReview(move) {
    openDrawer('CONFIRM MOVE', `${move.line.product} · ${move.line.lot}`, `
      <section class="mobile-flow-steps move-steps"><span class="done">✓</span><i class="done"></i><span class="active">2</span><small>Select</small><small>Confirm</small></section>
      <section class="drawer-section mobile-flow-section">
        <div class="mobile-move-route"><div><span>FROM</span><strong>${move.from}</strong></div><b>→</b><div><span>TO</span><strong>${move.to}</strong></div></div>
        <div class="mobile-review-hero"><span>Stock line</span><strong>${move.line.product}</strong><small>${move.line.lot} · ${move.qty} ${move.unit}</small></div>
        <div class="mobile-rule-note success-note"><strong>Total company inventory will not change.</strong><span>This only changes the location of the selected product + lot balance.</span></div>
      </section>
      <div class="drawer-actions mobile-sticky-actions"><button type="button" class="primary-btn mobile-primary" data-move-confirm>Confirm move</button></div>
    `);
    document.querySelector('[data-move-confirm]')?.addEventListener('click', () => { toast(`Move ${move.from} → ${move.to} recorded in preview`); closeDrawer(); if (state.page === 'inventory') renderPage(); });
  }

  openRackSpace = function(id) { return isPhone() ? openMobileSpace(id) : base.openRackSpace(id); };

  function renderSpecialLocation(location) {
    state.selectedRack = /^R\d{2}$/.test(state.selectedRack) ? state.selectedRack : 'R12';
    openMobileSpace(location);
  }

  function bindMobileSearch() {
    const input = document.querySelector('[data-mobile-card-search]');
    const list = document.querySelector('[data-mobile-card-list]');
    if (input && list) {
      input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        [...list.children].forEach(card => {
          const haystack = (card.dataset.cardSearch || card.textContent || '').toLowerCase();
          card.hidden = Boolean(q && !haystack.includes(q));
        });
      });
    }
    const stockInput = document.querySelector('[data-stock-search]');
    const result = document.querySelector('[data-stock-results]');
    if (stockInput && result) {
      stockInput.addEventListener('input', () => {
        const q = stockInput.value.trim().toLowerCase();
        if (!q) { result.hidden = true; result.innerHTML = ''; return; }
        const matches = Object.entries(warehouseSpaceContents).flatMap(([location, rows]) => rows.map(row => ({...row, location}))).filter(row => `${row.product} ${row.lot} ${row.location}`.toLowerCase().includes(q)).slice(0, 6);
        result.hidden = false;
        result.innerHTML = matches.length ? matches.map(row => `<button type="button" data-mobile-space="${row.location}"><div><strong>${row.product}</strong><span>${row.lot} · ${row.units}</span></div><b>${row.location}</b></button>`).join('') : '<div class="mobile-no-results">No preview stock matches.</div>';
        result.querySelectorAll('[data-mobile-space]').forEach(btn => btn.addEventListener('click', () => openMobileSpace(btn.dataset.mobileSpace)));
      });
    }
  }

  bindPageInteractions = function() {
    base.bindPageInteractions();
    if (!isPhone()) return;

    document.querySelectorAll('[data-mobile-go]').forEach(btn => btn.addEventListener('click', () => navigate(btn.dataset.mobileGo)));
    document.querySelectorAll('[data-mobile-receive]').forEach(btn => btn.addEventListener('click', () => openReceiveFlow(btn.dataset.mobileReceive)));
    document.querySelectorAll('[data-mobile-ship]').forEach(btn => btn.addEventListener('click', () => openShipFlow(btn.dataset.mobileShip)));
    document.querySelectorAll('[data-mobile-move]').forEach(btn => btn.addEventListener('click', () => openMoveFlow()));
    document.querySelectorAll('[data-mobile-space]').forEach(btn => btn.addEventListener('click', () => openMobileSpace(btn.dataset.mobileSpace)));
    document.querySelectorAll('[data-mobile-rack]').forEach(btn => btn.addEventListener('click', () => { state.selectedRack = btn.dataset.mobileRack; renderPage(); requestAnimationFrame(() => document.querySelector('[data-mobile-rack].active')?.scrollIntoView({inline:'center', block:'nearest', behavior:'smooth'})); }));
    document.querySelectorAll('[data-mobile-special-location]').forEach(btn => btn.addEventListener('click', () => renderSpecialLocation(btn.dataset.mobileSpecialLocation)));
    document.querySelectorAll('[data-mobile-status-filter]').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('[data-mobile-status-filter]').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      const status = btn.dataset.mobileStatusFilter;
      document.querySelectorAll('.mobile-order-card').forEach(card => { card.hidden = Boolean(status && !card.textContent.toUpperCase().includes(status)); });
    }));
    bindMobileSearch();
  };

  function ensureMobileChrome() {
    const workspace = document.querySelector('.workspace');
    if (!workspace) return;
    document.querySelector('.mobile-worker-header')?.remove();
    document.querySelector('.mobile-bottom-nav')?.remove();
    document.body.classList.toggle('worker-phone', isPhone());
    if (!isPhone()) return;

    const header = document.createElement('header');
    header.className = 'mobile-worker-header';
    header.innerHTML = `<button type="button" class="mobile-brand" data-mobile-chrome-home aria-label="Worker home"><img src="./logo_San_Jose.png" alt=""><span><b>San Jose</b><small id="mobilePageName">Warehouse</small></span></button><button type="button" class="mobile-header-scan" data-mobile-chrome-scan aria-label="Scanner">⌗</button>`;
    workspace.insertBefore(header, workspace.firstChild);

    const nav = document.createElement('nav');
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Worker navigation');
    nav.innerHTML = `
      <button type="button" data-mobile-nav="overview"><span>⌂</span><b>Home</b></button>
      <button type="button" data-mobile-nav="receiving"><span>↓</span><b>Receive</b></button>
      <button type="button" class="move-nav" data-mobile-nav="move"><span>↔</span><b>Move</b></button>
      <button type="button" data-mobile-nav="shipping"><span>↑</span><b>Ship</b></button>
      <button type="button" data-mobile-nav="inventory"><span>▦</span><b>Stock</b></button>`;
    document.body.appendChild(nav);

    const pageLabels = {overview:'Worker Home', receiving:'Receiving', shipping:'Shipping', inventory:'Inventory', scanner:'Scanner', packing:'Packing'};
    header.querySelector('#mobilePageName').textContent = pageLabels[state.page] || document.getElementById('pageTitle')?.textContent || 'Warehouse';
    nav.querySelectorAll('[data-mobile-nav]').forEach(btn => {
      if (btn.dataset.mobileNav === state.page) btn.classList.add('active');
      btn.addEventListener('click', () => btn.dataset.mobileNav === 'move' ? openMoveFlow() : navigate(btn.dataset.mobileNav));
    });
    header.querySelector('[data-mobile-chrome-home]').addEventListener('click', () => navigate('overview'));
    header.querySelector('[data-mobile-chrome-scan]').addEventListener('click', () => navigate('scanner'));
  }

  renderPage = function() {
    base.renderPage();
    ensureMobileChrome();
  };

  phoneQuery.addEventListener?.('change', () => renderPage());
  window.addEventListener('orientationchange', () => setTimeout(ensureMobileChrome, 150));

  renderPage();
})();
