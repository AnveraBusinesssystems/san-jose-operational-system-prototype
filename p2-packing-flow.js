(() => {
  // P2 movement rule: marketplaces do not create separate warehouse workflows.
  // Packing is the single workspace for move in -> deduct -> return.
  const toolSection = navSections.find(([label]) => label === 'TOOLS');
  if (toolSection) toolSection[1] = toolSection[1].filter(([id]) => id !== 'amazon');

  const packingRows = [
    {product:'Tamarindo Entero',lot:'TM-5510',source:'R13-L1-F',units:'40 bags',moved:1000,deducted:425,remaining:575,movedAt:'9:12 AM'},
    {product:'Jamaica Flor',lot:'JAL-7741',source:'R08-L2-F',units:'32 bags',moved:800,deducted:320,remaining:480,movedAt:'9:46 AM'},
    {product:'Chile Ancho',lot:'MX-A4832',source:'R12-L1-F',units:'40 bags',moved:1000,deducted:0,remaining:1000,movedAt:'10:18 AM'},
    {product:'Frijol Peruano',lot:'FP-6621',source:'R18-L3-M',units:'28 bags',moved:700,deducted:350,remaining:350,movedAt:'11:46 AM'}
  ];
  const packingHistory = [
    {time:'9:12 AM',type:'move',product:'Tamarindo Entero',lot:'TM-5510',qty:1000,from:'R13-L1-F',to:'Packing'},
    {time:'10:02 AM',type:'deduct',product:'Tamarindo Entero',lot:'TM-5510',qty:425,from:'Packing',to:'Used / Sold'},
    {time:'10:34 AM',type:'return',product:'Chile Ancho',lot:'MX-A4832',qty:300,from:'Packing',to:'R12-L1-F'},
    {time:'11:18 AM',type:'deduct',product:'Jamaica Flor',lot:'JAL-7741',qty:320,from:'Packing',to:'Used / Sold'},
    {time:'11:46 AM',type:'move',product:'Frijol Peruano',lot:'FP-6621',qty:700,from:'R18-L3-M',to:'Packing'}
  ];

  const totalMoved = packingRows.reduce((sum,row)=>sum+row.moved,0);
  const totalDeducted = packingRows.reduce((sum,row)=>sum+row.deducted,0);
  const totalRemaining = packingRows.reduce((sum,row)=>sum+row.remaining,0);
  const returnedToday = 300;

  function packingCurrentTable(){
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Product</th><th>Lot</th><th>Moved From</th><th>Moved In</th><th>Deducted</th><th>Remaining</th><th>Actions</th></tr></thead><tbody>${packingRows.map((row,i)=>`<tr><td><strong>${row.product}</strong><span class="packing-row-note">Moved ${row.movedAt}</span></td><td>${row.lot}</td><td>${row.source}</td><td>${fmtNum.format(row.moved)} LB</td><td>${row.deducted?fmtNum.format(row.deducted)+' LB':'—'}</td><td><strong>${fmtNum.format(row.remaining)} LB</strong></td><td><div class="packing-action-group"><button class="packing-mini-btn primary" data-pack-deduct="${i}">Deduct</button><button class="packing-mini-btn" data-pack-return="${i}">Return</button></div></td></tr>`).join('')}</tbody></table></div>`;
  }

  function packingHistoryTable(){
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Time</th><th>Action</th><th>Product</th><th>Lot</th><th>Quantity</th><th>From</th><th>To</th></tr></thead><tbody>${packingHistory.map(row=>`<tr><td>${row.time}</td><td><span class="movement-type ${row.type}">${titleCase(row.type)}</span></td><td><strong>${row.product}</strong></td><td>${row.lot}</td><td>${fmtNum.format(row.qty)} LB</td><td>${row.from}</td><td>${row.to}</td></tr>`).join('')}</tbody></table></div>`;
  }

  renderPacking = function(){
    setHeading('Warehouse','Packing Area');
    return `<div class="page-stack">
      <div class="hero-row"><div class="hero-copy"><h2>Packing inventory</h2><p>One workspace for inventory temporarily moved out of storage. Move it in, deduct what was used, then return what remains.</p></div>${button('+ Move to Packing','primary-btn','data-pack-move')}</div>
      <div class="packing-guide"><strong>Storage</strong><span class="arrow">→</span><strong>Move to Packing</strong><span class="arrow">→</span><strong>Deduct used / sold</strong><span class="arrow">→</span><strong>Return remainder</strong></div>
      <section class="metric-grid">${metric('In Packing',fmtNum.format(totalRemaining)+' LB','Expected physical quantity now')}${metric('Moved in today',fmtNum.format(totalMoved)+' LB','Recorded transfers into Packing')}${metric('Deducted today',fmtNum.format(totalDeducted)+' LB','Inventory removed as used / sold')}${metric('Returned today',fmtNum.format(returnedToday)+' LB','Moved back into warehouse storage')}</section>
      <section class="packing-command-grid">
        <section class="panel"><header class="panel-head"><div><h3>Current in Packing</h3><p>Work from this list. No marketplace-specific movement screens.</p></div></header>${packingCurrentTable()}</section>
        <aside class="panel packing-reconcile"><div class="packing-reconcile-head"><div><span class="eyebrow">TODAY</span><h3>Packing reconciliation</h3></div><span class="balance-pill">Balanced</span></div><div class="reconcile-equation"><div class="reconcile-line"><span>Moved into Packing</span><strong>${fmtNum.format(totalMoved)} LB</strong></div><div class="reconcile-line"><span>− Deducted / used</span><strong>${fmtNum.format(totalDeducted)} LB</strong></div><div class="reconcile-line"><span>− Returned to storage</span><strong>${fmtNum.format(returnedToday)} LB</strong></div><div class="reconcile-line total"><span>Expected in Packing</span><strong>${fmtNum.format(totalMoved-totalDeducted-returnedToday)} LB</strong></div></div><div class="notice-banner">Movement changes location. Deduction is the only action here that reduces total company inventory.</div></aside>
      </section>
      <section class="panel packing-history-panel"><header class="panel-head"><div><h3>Today's Movement History</h3><p>A simple audit trail of everything that entered, left, or returned from Packing.</p></div></header>${packingHistoryTable()}</section>
    </div>`;
  };

  const originalBindPageInteractions = bindPageInteractions;
  bindPageInteractions = function(){
    originalBindPageInteractions();
    document.querySelector('[data-pack-move]')?.addEventListener('click',()=>openDrawer('MOVE TO PACKING','Move inventory into Packing',`<section class="drawer-section"><div class="edit-grid"><div class="field full"><label>Product</label><select><option>Tamarindo Entero</option><option>Chile Ancho</option><option>Jamaica Flor</option><option>Frijol Peruano</option></select></div><div class="field"><label>From location</label><select><option>R13-L1-F</option><option>R12-L1-F</option><option>R08-L2-F</option><option>R18-L3-M</option></select></div><div class="field"><label>Quantity</label><input type="number" value="40"></div><div class="field"><label>Unit</label><select><option>Bags</option><option>Cases</option><option>LB</option></select></div><div class="field"><label>LB / unit</label><input type="number" value="25"></div></div><div class="drawer-amount-preview"><strong>40 bags × 25 LB = 1,000 LB</strong><br>Inventory will move location only; total inventory will not change.</div></section><div class="drawer-actions">${button('Move to Packing','primary-btn','data-save-demo')}</div>`));
    document.querySelectorAll('[data-pack-deduct]').forEach(btn=>btn.addEventListener('click',()=>{const row=packingRows[Number(btn.dataset.packDeduct)];openDrawer('DEDUCT FROM PACKING',row.product,`<section class="drawer-section"><div class="drawer-grid"><div class="kv"><span>Lot</span><strong>${row.lot}</strong></div><div class="kv"><span>Currently in Packing</span><strong>${fmtNum.format(row.remaining)} LB</strong></div></div></section><section class="drawer-section"><div class="edit-grid"><div class="field"><label>Amount used / sold</label><input type="number" value="${Math.min(250,row.remaining)}"></div><div class="field"><label>Unit</label><select><option>LB</option><option>Bags</option><option>Cases</option></select></div></div><div class="drawer-amount-preview">This action <strong>reduces total inventory</strong>. No Shopify or Amazon selection is required for the warehouse movement.</div></section><div class="drawer-actions">${button('Post deduction','primary-btn','data-save-demo')}</div>`)}));
    document.querySelectorAll('[data-pack-return]').forEach(btn=>btn.addEventListener('click',()=>{const row=packingRows[Number(btn.dataset.packReturn)];openDrawer('RETURN TO STORAGE',row.product,`<section class="drawer-section"><div class="drawer-grid"><div class="kv"><span>Lot</span><strong>${row.lot}</strong></div><div class="kv"><span>Available to return</span><strong>${fmtNum.format(row.remaining)} LB</strong></div></div></section><section class="drawer-section"><div class="edit-grid"><div class="field"><label>Return quantity</label><input type="number" value="${row.remaining}"></div><div class="field"><label>Destination</label><select><option>${row.source}</option><option>R15-L2-M</option><option>R12-L1-B</option><option>FLOOR-1</option><option>FLOOR-2</option></select></div></div><div class="drawer-amount-preview">The remainder can return to the <strong>same location or a different one</strong>. Total inventory does not change.</div></section><div class="drawer-actions">${button('Return inventory','primary-btn','data-save-demo')}</div>`)}));
  };

  // Re-render once so the simplified nav and Packing override appear immediately.
  renderNav();
  if (state.page === 'amazon') state.page = 'packing';
  renderPage();
})();
