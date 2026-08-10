(() => {
  const phoneQuery = window.matchMedia('(max-width: 760px)');
  const isPhone = () => phoneQuery.matches;

  const flowState = {
    receipts: {},
    shipments: {}
  };

  const baseBalances = [
    {key:'B1',product:'Jamaica Flor',lot:'JAL-7741',location:'R08-L2-F',unit:'BAG',unitQty:36,lbPer:25,lbs:900},
    {key:'B2',product:'Jamaica Flor',lot:'JAL-7810',location:'R08-L2-M',unit:'BAG',unitQty:30,lbPer:25,lbs:750},
    {key:'B3',product:'Chile Ancho',lot:'MX-A4832',location:'R12-L1-F',unit:'BAG',unitQty:32,lbPer:25,lbs:800},
    {key:'B4',product:'Chile Ancho',lot:'MX-A4920',location:'R12-L1-M',unit:'BAG',unitQty:20,lbPer:25,lbs:500},
    {key:'B5',product:'Comino Entero',lot:'CM-3108',location:'R12-L1-M',unit:'BAG',unitQty:8,lbPer:25,lbs:200},
    {key:'B6',product:'Chile Ancho',lot:'MX-A5018',location:'R12-L2-F',unit:'CASE',unitQty:40,lbPer:25,lbs:1000},
    {key:'B7',product:'Tamarindo Entero',lot:'TM-5510',location:'R13-L1-F',unit:'BAG',unitQty:40,lbPer:25,lbs:1000},
    {key:'B8',product:'Tamarindo Entero',lot:'TM-5572',location:'R13-L1-M',unit:'BAG',unitQty:28,lbPer:25,lbs:700},
    {key:'B9',product:'Chile Ancho',lot:'MX-A4920',location:'R15-L2-M',unit:'BAG',unitQty:44,lbPer:25,lbs:1100},
    {key:'B10',product:'Frijol Peruano',lot:'FP-6621',location:'R18-L3-M',unit:'BAG',unitQty:60,lbPer:25,lbs:1500},
    {key:'B11',product:'Ciruela Pasa',lot:'CP-2218',location:'R22-L1-B',unit:'CASE',unitQty:25,lbPer:20,lbs:500}
  ];

  const receiveProducts = {
    'PO-22714':['Tamarindo Entero','Chile Ancho','Jamaica Flor'],
    'PO-22713':['Jamaica Flor','Chile Ancho'],
    'PO-22712':['Frijol Peruano','Tamarindo Entero']
  };

  const salesLines = {
    'SO-22698':[
      {product:'Tamarindo Entero',qty:20,unit:'BAG'},
      {product:'Chile Ancho',qty:12,unit:'BAG'},
      {product:'Jamaica Flor',qty:8,unit:'BAG'}
    ],
    'SO-22697':[
      {product:'Frijol Peruano',qty:18,unit:'BAG'},
      {product:'Chile Ancho',qty:16,unit:'BAG'}
    ],
    'SO-22696':[
      {product:'Chile Ancho',qty:24,unit:'BAG'},
      {product:'Tamarindo Entero',qty:15,unit:'BAG'}
    ]
  };

  const rackOf = location => /^R\d{2}-/.test(location || '') ? String(location).slice(0,3) : '';
  const fmtQty = n => fmtNum.format(Number(n || 0));
  const normalizeUnit = u => String(u || '').toUpperCase().replace(/S$/,'');

  function currentBalances() {
    const received = [];
    Object.values(flowState.receipts).forEach(job => {
      (job.placements || []).forEach((p, i) => received.push({
        key:`REC-${job.orderId}-${i}`,
        product:job.receipt.product,
        lot:job.receipt.lot || 'NEW LOT',
        location:p.location,
        unit:job.receipt.unit,
        unitQty:p.qty,
        lbPer:job.receipt.lbPer,
        lbs:p.qty * job.receipt.lbPer
      }));
    });
    return baseBalances.concat(received);
  }

  function balancesAt(location) {
    return currentBalances().filter(b => b.location === location);
  }

  function spaceState(location) {
    const rows = balancesAt(location);
    if (!rows.length) return {tone:'empty',label:'EMPTY',detail:'Available'};
    const products = new Set(rows.map(r => r.product));
    const total = rows.reduce((s,r)=>s+r.lbs,0);
    if (products.size > 1) return {tone:'mixed',label:`MIXED · ${products.size}`,detail:`${fmtQty(total)} LB`};
    return {tone:'occupied',label:rows[0].product,detail:`${rows.length > 1 ? rows.length+' lots · ' : ''}${fmtQty(total)} LB`};
  }

  function rackTabs(activeRack, attribute) {
    const racks = Array.from({length:50}, (_, i) => `R${String(i + 1).padStart(2,'0')}`);
    return `<div class="physical-rack-tabs">${racks.map(r => `<button type="button" class="${r === activeRack ? 'active':''}" ${attribute}="${r}">${r}</button>`).join('')}<button type="button" ${attribute}="FLOOR-1">FLOOR-1</button><button type="button" ${attribute}="FLOOR-2">FLOOR-2</button><button type="button" ${attribute}="PACKING">PACKING</button></div>`;
  }

  function rackBoard(rack, selectedLocation = '', selectable = null, attr = 'data-destination-space') {
    if (!/^R\d{2}$/.test(rack)) return `<div class="physical-selection ${selectedLocation ? '' : 'warn'}"><span>SPECIAL LOCATION</span><strong>${rack}</strong><small>Multi-product area. Confirm the exact area before posting.</small></div>`;
    return `<div class="physical-rack-board">
      <div class="physical-rack-label"><strong>${rack}</strong><span>Tap the physical square</span></div>
      <div class="physical-rack-axis"><span></span><span>FRONT</span><span>MIDDLE</span><span>BACK</span></div>
      <div class="physical-rack-grid">
        ${['L3','L2','L1'].map(level => `<b class="physical-level">${level}</b>${['F','M','B'].map(pos => {
          const loc = `${rack}-${level}-${pos}`;
          const st = spaceState(loc);
          const allowed = !selectable || selectable.includes(loc);
          return `<button type="button" class="physical-space ${st.tone} ${selectedLocation===loc?'selected':''}" ${attr}="${loc}" ${allowed?'':'disabled'} style="${allowed?'':'opacity:.32'}"><span class="ps-id">${level}-${pos}</span><strong>${st.label}</strong><small>${allowed ? st.detail : 'Not this product'}</small></button>`;
        }).join('')}`).join('')}
      </div>
    </div>`;
  }

  function receiveCount(orderId) {
    const order = data.purchaseOrders.find(o => o.id === orderId);
    if (!order) return;
    const products = receiveProducts[orderId] || ['Chile Ancho','Tamarindo Entero'];
    openDrawer('RECEIVE PRODUCT', `${order.id} · ${order.supplier}`, `
      <section class="mobile-flow-steps"><span class="active">1</span><i></i><span>2</span><i></i><span>3</span><small>Count</small><small>Choose spots</small><small>Finish</small></section>
      <section class="drawer-section mobile-flow-section">
        <div class="mobile-order-context"><span>Expected ${fmtDate(order.expected)}</span>${statusPill(order.status)}</div>
        <div class="field full"><label>Product</label><select id="locRecProduct">${products.map(p=>`<option>${p}</option>`).join('')}</select></div>
        <div class="mobile-two-col">
          <div class="field"><label>Quantity arrived</label><input id="locRecQty" type="number" inputmode="decimal" value="120"></div>
          <div class="field"><label>Unit</label><select id="locRecUnit"><option>CASE</option><option>BAG</option><option>LB</option></select></div>
          <div class="field"><label>LB / unit</label><input id="locRecLb" type="number" inputmode="decimal" value="25"></div>
          <div class="field"><label>Units / space</label><input id="locRecPerSpace" type="number" inputmode="decimal" value="40"></div>
        </div>
        <div class="field full"><label>Damaged / rejected</label><input id="locRecDamaged" type="number" inputmode="decimal" value="0"></div>
        <div class="field full"><label>Supplier lot</label><input id="locRecLot" value="77891" autocomplete="off"></div>
        <div class="mobile-calc-banner" id="locRecPreview"></div>
      </section>
      <div class="drawer-actions mobile-sticky-actions"><button type="button" class="primary-btn mobile-primary" data-location-receive-next>Choose destination spots →</button></div>
    `);
    const update = () => {
      const qty = Math.max(0, Number(document.getElementById('locRecQty')?.value || 0) - Number(document.getElementById('locRecDamaged')?.value || 0));
      const unit = document.getElementById('locRecUnit')?.value || 'CASE';
      const lbPer = Number(document.getElementById('locRecLb')?.value || 0);
      const per = Math.max(1, Number(document.getElementById('locRecPerSpace')?.value || 1));
      const spaces = Math.ceil(qty/per);
      document.getElementById('locRecPreview').innerHTML = `<strong>${fmtQty(qty)} ${unit} · ${fmtQty(qty*lbPer)} LB</strong><span>${spaces} physical space${spaces===1?'':'s'} expected at up to ${fmtQty(per)} ${unit} per space</span>`;
    };
    ['locRecQty','locRecDamaged','locRecUnit','locRecLb','locRecPerSpace'].forEach(id => document.getElementById(id)?.addEventListener('input',update));
    update();
    document.querySelector('[data-location-receive-next]')?.addEventListener('click', () => {
      const qty = Math.max(0, Number(document.getElementById('locRecQty')?.value || 0) - Number(document.getElementById('locRecDamaged')?.value || 0));
      const receipt = {
        product:document.getElementById('locRecProduct')?.value || products[0],
        qty,
        unit:normalizeUnit(document.getElementById('locRecUnit')?.value || 'CASE'),
        lbPer:Number(document.getElementById('locRecLb')?.value || 0),
        perSpace:Math.max(1,Number(document.getElementById('locRecPerSpace')?.value || 1)),
        lot:document.getElementById('locRecLot')?.value || ''
      };
      flowState.receipts[orderId] = {orderId,receipt,placements:[]};
      receiveDestination(orderId, 'R12', '');
    });
  }

  function receiveDestination(orderId, activeRack = 'R12', selectedLocation = '') {
    const job = flowState.receipts[orderId];
    if (!job) return receiveCount(orderId);
    const {receipt,placements} = job;
    const placedQty = placements.reduce((s,p)=>s+p.qty,0);
    const remaining = Math.max(0,receipt.qty-placedQty);
    const suggested = Math.min(receipt.perSpace,remaining);
    const selectedRows = selectedLocation ? balancesAt(selectedLocation) : [];
    const selectedState = selectedLocation ? spaceState(selectedLocation) : null;
    const placementNo = placements.length + 1;
    openDrawer('CHOOSE DESTINATION', `${receipt.product} · ${receipt.lot || 'No supplier lot'}`, `
      <section class="mobile-flow-steps"><span class="done">✓</span><i class="done"></i><span class="active">2</span><i></i><span>3</span><small>Count</small><small>Choose spots</small><small>Finish</small></section>
      <section class="drawer-section physical-picker">
        <div class="physical-picker-head"><div><span class="worker-kicker">PLACEMENT ${placementNo}</span><h3>Where are you putting it?</h3><p>Scan the location QR or tap the exact rack square.</p></div><span class="physical-picker-badge">${fmtQty(remaining)} ${receipt.unit} LEFT</span></div>
        <div class="receive-place-summary"><div><span>Product</span><strong>${receipt.product}</strong></div><div><span>Lot</span><strong>${receipt.lot || '—'}</strong></div><div><span>LB / unit</span><strong>${fmtQty(receipt.lbPer)}</strong></div></div>
        <div class="physical-scan-row"><input id="destinationScan" placeholder="Scan e.g. R12-L1-F" value="${selectedLocation}"><button type="button" data-use-destination-scan>USE CODE</button></div>
        ${rackTabs(activeRack,'data-destination-rack')}
        ${rackBoard(activeRack,selectedLocation,null,'data-destination-space')}
        ${selectedLocation ? `<div class="physical-selection ${selectedRows.length?'warn':''}"><span>SELECTED DESTINATION</span><strong>${selectedLocation}</strong><small>${selectedRows.length ? `${selectedState.label} now · ${selectedRows.map(r=>`${r.product} / ${r.lot} / ${fmtQty(r.unitQty)} ${r.unit}`).join(' · ')}` : 'Empty space · available for placement'}</small></div>` : `<div class="physical-selection warn"><span>NO LOCATION SELECTED</span><strong>Choose a physical spot</strong><small>The receipt cannot be posted until a destination location is confirmed.</small></div>`}
        <div class="physical-qty-row"><div class="field"><label>Quantity in this spot</label><input id="destinationQty" type="number" inputmode="decimal" value="${fmtQty(suggested)}"></div><div class="field"><label>Unit</label><input value="${receipt.unit}" disabled></div></div>
        ${selectedRows.length ? `<label class="location-confirm-line"><input id="confirmOccupiedDestination" type="checkbox"> I can see existing stock here and still want to place this product in ${selectedLocation}.</label>` : ''}
      </section>
      <div class="drawer-actions mobile-sticky-actions"><button type="button" class="primary-btn mobile-primary" data-confirm-destination ${selectedLocation?'':'disabled'}>Confirm ${selectedLocation || 'destination'}</button></div>
    `);
    document.querySelectorAll('[data-destination-rack]').forEach(btn => btn.addEventListener('click', () => {
      const target = btn.dataset.destinationRack;
      if (/^R\d{2}$/.test(target)) receiveDestination(orderId,target,'');
      else receiveDestination(orderId,target,target);
    }));
    document.querySelectorAll('[data-destination-space]').forEach(btn => btn.addEventListener('click', () => receiveDestination(orderId,activeRack,btn.dataset.destinationSpace)));
    document.querySelector('[data-use-destination-scan]')?.addEventListener('click', () => {
      const loc = String(document.getElementById('destinationScan')?.value || '').trim().toUpperCase();
      if (/^R\d{2}-L[123]-[FMB]$/.test(loc)) receiveDestination(orderId,rackOf(loc),loc);
      else if (['FLOOR-1','FLOOR-2','PACKING'].includes(loc)) receiveDestination(orderId,loc,loc);
      else toast('Location code not recognized');
    });
    document.querySelector('[data-confirm-destination]')?.addEventListener('click', () => {
      if (!selectedLocation) return toast('Choose a destination location');
      if (selectedRows.length && !document.getElementById('confirmOccupiedDestination')?.checked) return toast('Confirm the occupied/mixed space first');
      const qty = Math.max(0,Math.min(remaining,Number(document.getElementById('destinationQty')?.value || 0)));
      if (!qty) return toast('Enter a quantity for this location');
      placements.push({location:selectedLocation,qty});
      const after = receipt.qty - placements.reduce((s,p)=>s+p.qty,0);
      if (after > 0.0001) receiveDestination(orderId,/^R\d{2}$/.test(activeRack)?activeRack:'R12','');
      else finishReceipt(orderId);
    });
  }

  function finishReceipt(orderId) {
    const job = flowState.receipts[orderId];
    const {receipt,placements} = job;
    openDrawer('RECEIPT READY', `${orderId} · ${receipt.product}`, `
      <section class="mobile-flow-steps"><span class="done">✓</span><i class="done"></i><span class="done">✓</span><i class="done"></i><span class="active">3</span><small>Count</small><small>Choose spots</small><small>Finish</small></section>
      <section class="drawer-section mobile-flow-section">
        <div class="mobile-review-hero"><span>TOTAL RECEIVED</span><strong>${fmtQty(receipt.qty)} ${receipt.unit} · ${fmtQty(receipt.qty*receipt.lbPer)} LB</strong><small>Supplier lot ${receipt.lot || '—'}</small></div>
        <div class="allocation-list">${placements.map(p=>`<div class="allocation-row"><strong>${p.location}</strong><span>${fmtQty(p.qty)} ${receipt.unit}</span><small>${fmtQty(p.qty*receipt.lbPer)} LB will be added to this exact location</small></div>`).join('')}</div>
        <div class="mobile-rule-note success-note"><strong>What the backend will record</strong><span>One RECEIVE movement per destination plus one current balance for Product + Lot + Location. If a space is mixed, it remains one physical space with multiple balance rows.</span></div>
      </section>
      <div class="drawer-actions mobile-sticky-actions"><button type="button" class="primary-btn mobile-primary" data-post-location-receipt>Post receipt</button></div>
    `);
    document.querySelector('[data-post-location-receipt]')?.addEventListener('click',()=>{
      state.mobileReceiveProgress[orderId] = placements.length;
      toast(`Receipt recorded across ${placements.length} physical spot${placements.length===1?'':'s'} in prototype`);
      closeDrawer();navigate('receiving');
    });
  }

  function getSalesLines(orderId) {
    return salesLines[orderId] || [{product:'Chile Ancho',qty:10,unit:'BAG'},{product:'Tamarindo Entero',qty:8,unit:'BAG'}];
  }

  function shipmentJob(orderId) {
    if (!flowState.shipments[orderId]) flowState.shipments[orderId] = {orderId,lines:getSalesLines(orderId),allocations:{}};
    return flowState.shipments[orderId];
  }

  function allocatedQty(job,index) {
    return (job.allocations[index] || []).reduce((s,a)=>s+a.qty,0);
  }

  function sourceUsedQty(job,balanceKey) {
    return Object.values(job.allocations).flat().filter(a=>a.balanceKey===balanceKey).reduce((s,a)=>s+a.qty,0);
  }

  function openLocationAwareShip(orderId) {
    const order = data.salesOrders.find(o=>o.id===orderId);
    if (!order) return;
    const job = shipmentJob(orderId);
    const complete = job.lines.every((line,i)=>allocatedQty(job,i) >= line.qty - 0.0001);
    openDrawer('PICK FROM LOCATION', `${order.id} · ${order.customer}`, `
      <section class="mobile-flow-steps"><span class="active">1</span><i></i><span>2</span><i></i><span>3</span><small>Pick spots</small><small>Review</small><small>Ship</small></section>
      <section class="drawer-section mobile-flow-section">
        <div class="mobile-order-context"><span>Due ${fmtDate(order.due)}</span>${statusPill(order.status)}</div>
        <div class="mobile-rule-note"><strong>Pick where you physically took it from.</strong><span>Every product must have a source location and lot. One order line can be split across multiple spots.</span></div>
        <div class="mobile-pick-list">${job.lines.map((line,i)=>{
          const done = allocatedQty(job,i), left=Math.max(0,line.qty-done);
          const allocs=job.allocations[i]||[];
          return `<button type="button" class="mobile-pick-row ${left<=0?'selected':''}" data-choose-source="${i}"><span class="pick-check">${left<=0?'✓':'+'}</span><div><strong>${line.product}</strong><small>Need ${fmtQty(line.qty)} ${line.unit} · ${left<=0?'complete':fmtQty(left)+' '+line.unit+' left'}</small>${allocs.length?`<em>${allocs.map(a=>a.location).join(' + ')}</em><small>${allocs.map(a=>`${a.location}: ${fmtQty(a.qty)} ${line.unit} · ${a.lot}`).join(' | ')}</small>`:'<em>Choose physical source spot</em>'}</div><span class="task-arrow">›</span></button>`;
        }).join('')}</div>
      </section>
      <div class="drawer-actions mobile-sticky-actions"><button type="button" class="primary-btn mobile-primary" data-location-ship-review ${complete?'':'disabled'}>${complete?'Review shipment →':'Choose all source spots first'}</button></div>
    `);
    document.querySelectorAll('[data-choose-source]').forEach(btn=>btn.addEventListener('click',()=>chooseShipSource(orderId,Number(btn.dataset.chooseSource))));
    document.querySelector('[data-location-ship-review]')?.addEventListener('click',()=>reviewLocationAwareShip(orderId));
  }

  function chooseShipSource(orderId,index,selectedKey='') {
    const order=data.salesOrders.find(o=>o.id===orderId);const job=shipmentJob(orderId);const line=job.lines[index];
    const already=allocatedQty(job,index);const remaining=Math.max(0,line.qty-already);
    const sources=currentBalances().filter(b=>b.product===line.product && normalizeUnit(b.unit)===normalizeUnit(line.unit)).map(b=>({...b,freeUnits:Math.max(0,b.unitQty-sourceUsedQty(job,b.key))})).filter(b=>b.freeUnits>0);
    const selected=sources.find(s=>s.key===selectedKey) || null;
    const selectable=sources.map(s=>s.location);
    const activeRack=selected?rackOf(selected.location):(sources[0]?rackOf(sources[0].location):'R12');
    openDrawer('CHOOSE SOURCE SPOT', `${line.product} · ${order.id}`, `
      <section class="physical-picker">
        <div class="physical-picker-head"><div><span class="worker-kicker">PHYSICAL PICK</span><h3>Where did you take it from?</h3><p>Tap one of the spaces that actually contains this product, or scan its location QR.</p></div><span class="physical-picker-badge">${fmtQty(remaining)} ${line.unit} LEFT</span></div>
        <div class="need-banner"><span>ORDER NEED</span><strong>${fmtQty(line.qty)} ${line.unit}</strong></div>
        <div class="physical-scan-row"><input id="sourceScan" placeholder="Scan source location"><button type="button" data-use-source-scan>USE CODE</button></div>
        <div class="source-options">${sources.length?sources.map(s=>`<button type="button" class="source-option ${selectedKey===s.key?'selected':''}" data-source-balance="${s.key}"><div class="source-option-head"><strong>${s.location}</strong><b>${fmtQty(s.freeUnits)} ${s.unit} free</b></div><span>Lot ${s.lot}</span><em>${fmtQty(s.lbs)} LB in this balance · ${fmtQty(s.lbPer)} LB/${s.unit}</em></button>`).join(''):'<div class="mobile-empty-location"><strong>No matching stock</strong><span>This product/unit is not available in the prototype balances.</span></div>'}</div>
        ${selected&&activeRack?rackBoard(activeRack,selected.location,selectable,'data-ship-rack-space'):''}
        ${selected?`<div class="physical-selection"><span>SELECTED SOURCE</span><strong>${selected.location} · Lot ${selected.lot}</strong><small>${fmtQty(selected.freeUnits)} ${selected.unit} available to this shipment after previous picks.</small></div><div class="physical-qty-row"><div class="field"><label>Quantity taken from this spot</label><input id="sourceQty" type="number" inputmode="decimal" value="${fmtQty(Math.min(remaining,selected.freeUnits))}"></div><div class="field"><label>Unit</label><input value="${line.unit}" disabled></div></div><label class="location-confirm-line"><input id="confirmPhysicalPick" type="checkbox"> I physically took this product from ${selected.location}.</label>`:''}
        <div class="split-source-note">If this spot does not have enough, record what you took here. The system will bring you back to choose the next source spot for the remaining quantity.</div>
      </section>
      <div class="drawer-actions mobile-sticky-actions"><button type="button" class="primary-btn mobile-primary" data-confirm-source ${selected?'':'disabled'}>${selected?'Use '+selected.location:'Select a source spot'}</button></div>
    `);
    document.querySelectorAll('[data-source-balance]').forEach(btn=>btn.addEventListener('click',()=>chooseShipSource(orderId,index,btn.dataset.sourceBalance)));
    document.querySelectorAll('[data-ship-rack-space]').forEach(btn=>btn.addEventListener('click',()=>{
      const loc=btn.dataset.shipRackSpace;const src=sources.find(s=>s.location===loc);if(src)chooseShipSource(orderId,index,src.key);
    }));
    document.querySelector('[data-use-source-scan]')?.addEventListener('click',()=>{
      const loc=String(document.getElementById('sourceScan')?.value||'').trim().toUpperCase();const src=sources.find(s=>s.location===loc);if(src)chooseShipSource(orderId,index,src.key);else toast('That location does not contain this product');
    });
    document.querySelector('[data-confirm-source]')?.addEventListener('click',()=>{
      if(!selected)return;if(!document.getElementById('confirmPhysicalPick')?.checked)return toast('Confirm the physical source spot');
      const qty=Math.max(0,Math.min(remaining,selected.freeUnits,Number(document.getElementById('sourceQty')?.value||0)));if(!qty)return toast('Enter the quantity taken');
      if(!job.allocations[index])job.allocations[index]=[];job.allocations[index].push({balanceKey:selected.key,location:selected.location,lot:selected.lot,qty,unit:line.unit,lbPer:selected.lbPer,lbs:qty*selected.lbPer});
      const left=Math.max(0,line.qty-allocatedQty(job,index));if(left>0.0001)chooseShipSource(orderId,index,'');else openLocationAwareShip(orderId);
    });
  }

  function reviewLocationAwareShip(orderId){
    const order=data.salesOrders.find(o=>o.id===orderId);const job=shipmentJob(orderId);const allocations=Object.entries(job.allocations).flatMap(([idx,rows])=>rows.map(r=>({...r,product:job.lines[Number(idx)].product})));
    openDrawer('REVIEW PHYSICAL PICKS', `${order.id} · ${order.customer}`, `
      <section class="mobile-flow-steps"><span class="done">✓</span><i class="done"></i><span class="active">2</span><i></i><span>3</span><small>Pick spots</small><small>Review</small><small>Ship</small></section>
      <section class="drawer-section mobile-flow-section">
        <div class="mobile-review-hero"><span>SHIPMENT</span><strong>${order.id} · ${order.customer}</strong><small>Each deduction below is tied to the location and lot the worker selected.</small></div>
        <div class="allocation-list">${allocations.map(a=>`<div class="allocation-row"><strong>${a.product} · ${a.location}</strong><span>${fmtQty(a.qty)} ${a.unit}</span><small>Lot ${a.lot} · ${fmtQty(a.lbs)} LB deducted from this exact balance</small></div>`).join('')}</div>
        <div class="mobile-rule-note success-note"><strong>What the backend will record</strong><span>One SALE movement for each Product + Lot + Source Location allocation. That is what makes rack inventory stay accurate after shipping.</span></div>
      </section>
      <div class="drawer-actions mobile-sticky-actions"><button type="button" class="primary-btn mobile-primary" data-post-location-shipment>Confirm & ship</button></div>
    `);
    document.querySelector('[data-post-location-shipment]')?.addEventListener('click',()=>{toast(`Shipment ${order.id} posted from ${allocations.length} physical stock line${allocations.length===1?'':'s'} in prototype`);closeDrawer();navigate('shipping');});
  }

  document.addEventListener('click', e => {
    if (!isPhone()) return;
    const receive = e.target.closest('[data-mobile-receive]');
    if (receive) {
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      receiveCount(receive.dataset.mobileReceive);
      return;
    }
    const ship = e.target.closest('[data-mobile-ship]');
    if (ship) {
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      openLocationAwareShip(ship.dataset.mobileShip);
    }
  }, true);
})();
