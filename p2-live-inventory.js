(() => {
  const API_URL=String(window.SAN_JOSE_P2_API_URL||'').trim();
  const WRITES_ENABLED=window.SAN_JOSE_P2_INVENTORY_WRITES_ENABLED===true;
  const liveState={boot:null,loading:false,error:'',query:'',selectedRack:'R01'};
  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmt=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(n||0));

  function api(action,payload={}){
    if(!API_URL)return Promise.reject(new Error('Inventory API URL is not configured.'));
    return new Promise((resolve,reject)=>{
      const cb='sjp2_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      const script=document.createElement('script');
      const url=new URL(API_URL);
      url.searchParams.set('action',action);
      url.searchParams.set('payload',JSON.stringify(payload));
      url.searchParams.set('callback',cb);
      const timer=setTimeout(()=>{cleanup();reject(new Error('Inventory API timed out.'));},15000);
      const cleanup=()=>{clearTimeout(timer);delete window[cb];script.remove();};
      window[cb]=data=>{cleanup();data&&data.ok?resolve(data.result):reject(new Error(data?.error||'Inventory API request failed.'));};
      script.onerror=()=>{cleanup();reject(new Error('Could not reach the inventory API.'));};
      script.src=url.toString();document.body.appendChild(script);
    });
  }

  async function load(force=false){
    if(liveState.loading)return;
    if(liveState.boot&&!force)return;
    liveState.loading=true;liveState.error='';
    try{liveState.boot=await api('inventoryBootstrap');}
    catch(e){liveState.error=e.message||String(e);}
    finally{liveState.loading=false;}
  }

  function balancesForProduct(productId){return (liveState.boot?.balances||[]).filter(b=>b.product_id===productId);}
  function productRows(){
    const rows=(liveState.boot?.products||[]).map(p=>({...p,stock:balancesForProduct(p.product_id)}));
    const q=liveState.query.trim().toLowerCase();
    return rows.filter(p=>!q||`${p.product_id} ${p.product_name} ${p.category} ${p.barcode||''}`.toLowerCase().includes(q)).sort((a,b)=>a.product_name.localeCompare(b.product_name));
  }
  function rackSpaces(rack){
    const locations=(liveState.boot?.locations||[]).filter(l=>l.rack===rack);
    const balances=liveState.boot?.balances||[];
    return locations.map(l=>({...l,stock:balances.filter(b=>b.location_id===l.location_id)}));
  }

  function statusBanner(){
    if(liveState.loading)return `<div class="count-live-banner offline"><span class="count-live-dot"></span><div><strong>CONNECTING TO LIVE INVENTORY</strong><span>Reading the optimized operational database…</span></div></div>`;
    if(liveState.error)return `<div class="count-live-banner offline"><span class="count-live-dot"></span><div><strong>LIVE INVENTORY CONNECTION ERROR</strong><span>${esc(liveState.error)}</span></div></div>`;
    if(!liveState.boot)return `<div class="count-live-banner offline"><span class="count-live-dot"></span><div><strong>LIVE INVENTORY NOT LOADED</strong><span>No fallback or mock inventory is displayed.</span></div></div>`;
    const s=liveState.boot.summary||{};
    const lb=Number(s.by_base_unit?.LB||0);
    return `<div class="count-live-banner"><span class="count-live-dot"></span><div style="flex:1"><strong>LIVE INVENTORY CONNECTED · READ ONLY</strong><span>${fmt(lb)} LB · ${fmt(s.positive_balance_lines)} stock lines · ${fmt(liveState.boot.products?.length)} active products · ${fmt(s.occupied_rack_locations)}/${fmt(s.active_rack_locations)} rack spaces occupied</span></div><span class="status gray">WRITES OFF</span></div>`;
  }

  function renderRack(){
    const rack=liveState.selectedRack;
    const spaces=rackSpaces(rack);
    if(!spaces.length)return `<div class="count-empty-stock"><strong>${rack} not loaded</strong><span>No active locations returned for this rack.</span></div>`;
    return `<div class="rack-grid">${spaces.map(space=>`<button class="rack-space ${space.stock.length?'occupied':'available'}" type="button" data-live-location="${esc(space.location_id)}"><div class="rack-space-label"><strong>${esc(space.location_id)}</strong><span>${space.stock.length?`${space.stock.length} stock line${space.stock.length===1?'':'s'}`:'EMPTY'}</span></div>${space.stock.slice(0,3).map(s=>`<div class="rack-stock-line"><b>${esc(s.product_name)}</b><span>${fmt(s.current_base_qty)} ${esc(s.base_unit)} · ${esc(s.supplier_lot_number||s.lot_id)}</span></div>`).join('')}${space.stock.length>3?`<small>+${space.stock.length-3} more</small>`:''}</button>`).join('')}</div>`;
  }

  function renderLiveInventory(){
    setHeading('Warehouse','Inventory');
    const rows=productRows();
    const rackOptions=Array.from({length:50},(_,i)=>`R${String(i+1).padStart(2,'0')}`);
    return `<div class="page-stack">
      <div class="hero-row"><div class="hero-copy"><span class="worker-kicker">LIVE INVENTORY</span><h2>Current warehouse stock</h2><p>Products, lots, quantities and physical locations are read directly from the optimized inventory database.</p></div><div>${WRITES_ENABLED?'<span class="status amber">WRITES ENABLED</span>':'<span class="status gray">READ ONLY VALIDATION</span>'}</div></div>
      ${statusBanner()}
      <section class="grid-2">
        <div class="panel" style="padding:14px"><div class="panel-head"><div><h3>Products</h3><p>Includes active products with zero stock.</p></div></div><div class="field"><label>Search</label><input data-live-search type="search" value="${esc(liveState.query)}" placeholder="Product name, ID or barcode"></div><div class="count-product-list" style="margin-top:10px">${rows.slice(0,50).map(p=>`<article class="count-product-row"><button type="button" data-live-product="${esc(p.product_id)}"><strong>${esc(p.product_name)}</strong><small>${esc(p.product_id)} · ${esc(p.category||'')}</small></button><div class="count-stock-figure ${p.on_hand_base>0?'count-stock':'count-zero'}"><b>${fmt(p.on_hand_base)} ${esc(p.base_unit)}</b><span>${p.stock.length?`${p.stock.length} stock line${p.stock.length===1?'':'s'}`:'ZERO STOCK'}</span></div></article>`).join('')||'<div class="count-empty-stock"><strong>No matching products</strong></div>'}</div></div>
        <div class="panel" style="padding:14px"><div class="panel-head"><div><h3>Rack view</h3><p>Exact live contents by physical space.</p></div><select data-live-rack>${rackOptions.map(r=>`<option ${r===liveState.selectedRack?'selected':''}>${r}</option>`).join('')}</select></div>${renderRack()}</div>
      </section>
    </div>`;
  }

  function openProduct(productId){
    const p=(liveState.boot?.products||[]).find(x=>x.product_id===productId);if(!p)return;
    const stock=balancesForProduct(productId);
    openDrawer('LIVE PRODUCT',`${p.product_name} · ${p.product_id}`,`<div class="count-product-detail"><div class="count-detail-hero"><span>CURRENT ON HAND</span><strong>${fmt(p.on_hand_base)} ${esc(p.base_unit)}</strong><small>${stock.length} positive balance line${stock.length===1?'':'s'}</small></div>${stock.length?`<div class="count-existing-lines">${stock.map(s=>`<div class="count-existing-line"><div><strong>${esc(s.location_id)}</strong><small>Lot ${esc(s.supplier_lot_number||s.lot_id)} · ${esc(s.lot_unit)} × ${fmt(s.lot_conversion_to_base)} · sequence ${fmt(s.last_movement_sequence)}</small></div><span>${fmt(s.current_base_qty)} ${esc(s.base_unit)}</span></div>`).join('')}</div>`:`<div class="count-empty-stock"><strong>Zero stock</strong><span>This active product currently has no positive INVENTORY_BALANCES rows.</span></div>`}<div class="count-step-note">Inventory changes remain disabled during read-only validation.</div></div>`);
  }

  function openLocation(locationId){
    const lines=(liveState.boot?.balances||[]).filter(b=>b.location_id===locationId);
    openDrawer('LIVE LOCATION',locationId,lines.length?`<div class="count-existing-lines">${lines.map(s=>`<div class="count-existing-line"><div><strong>${esc(s.product_name)}</strong><small>${esc(s.product_id)} · Lot ${esc(s.supplier_lot_number||s.lot_id)}</small></div><span>${fmt(s.current_base_qty)} ${esc(s.base_unit)}</span></div>`).join('')}</div>`:`<div class="count-empty-stock"><strong>Empty space</strong><span>No positive inventory balance currently exists in this location.</span></div>`);
  }

  function bind(){
    const search=document.querySelector('[data-live-search]');
    search?.addEventListener('input',e=>{liveState.query=e.target.value;renderPage();requestAnimationFrame(()=>{const n=document.querySelector('[data-live-search]');n?.focus();try{n?.setSelectionRange(n.value.length,n.value.length)}catch(_e){}});});
    document.querySelector('[data-live-rack]')?.addEventListener('change',e=>{liveState.selectedRack=e.target.value;renderPage();});
    document.querySelectorAll('[data-live-product]').forEach(b=>b.addEventListener('click',()=>openProduct(b.dataset.liveProduct)));
    document.querySelectorAll('[data-live-location]').forEach(b=>b.addEventListener('click',()=>openLocation(b.dataset.liveLocation)));
  }

  const baseRender=renderInventory;
  renderInventory=function(){
    if(!liveState.boot&&!liveState.loading&&!liveState.error){load().then(()=>{if(state.page==='inventory')renderPage();});}
    return renderLiveInventory();
  };
  const baseBind=bindPageInteractions;
  bindPageInteractions=function(){baseBind();if(state.page==='inventory')bind();};

  window.SanJoseLiveInventory={reload:async()=>{await load(true);if(state.page==='inventory')renderPage();},getState:()=>liveState,api};
})();
