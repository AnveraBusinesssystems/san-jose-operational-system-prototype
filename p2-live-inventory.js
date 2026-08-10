(() => {
  const API_URL=String(window.SAN_JOSE_P2_API_URL||'').trim();
  const WRITES_ENABLED=window.SAN_JOSE_P2_INVENTORY_WRITES_ENABLED===true;
  const liveState={boot:null,loading:false,error:'',query:'',selectedArea:'R01',lastLoadedAt:null};
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
      let finished=false;
      const cleanup=()=>{if(finished)return;finished=true;clearTimeout(timer);try{delete window[cb];}catch(_e){}script.remove();};
      const timer=setTimeout(()=>{cleanup();reject(new Error('Inventory API timed out after 20 seconds.'));},20000);
      window[cb]=data=>{
        cleanup();
        if(data&&data.ok)resolve(data.result);
        else reject(new Error(data?.error||'Inventory API returned an error.'));
      };
      script.onerror=()=>{cleanup();reject(new Error('Could not execute the Apps Script inventory response. Check deployment access and version.'));};
      script.src=url.toString();
      document.body.appendChild(script);
    });
  }

  function number(v){const n=Number(v);return Number.isFinite(n)?n:0;}

  function normalizeBoot(raw){
    raw=raw&&typeof raw==='object'?raw:{};
    const products=Array.isArray(raw.products)?raw.products.map(p=>({...p})):[];
    const locations=Array.isArray(raw.locations)?raw.locations.map(l=>({...l,location_id:String(l.location_id||'').toUpperCase(),location_type:String(l.location_type||'').toUpperCase(),rack:String(l.rack||'').toUpperCase(),level:String(l.level||'').toUpperCase(),position:String(l.position||'').toUpperCase()})):[];
    let balances=Array.isArray(raw.balances)?raw.balances.map(b=>({...b})):[];

    // Backward compatibility with the immediately previous P2 inventory deployment,
    // where stock lines were nested inside each product instead of returned as boot.balances.
    if(!balances.length){
      products.forEach(p=>{
        (Array.isArray(p.stock)?p.stock:[]).forEach(s=>balances.push({
          ...s,
          product_id:p.product_id,
          product_name:p.product_name,
          category:p.category,
          base_unit:p.base_unit,
          lot_unit:s.lot_unit||s.unit_code||'',
          lot_conversion_to_base:number(s.lot_conversion_to_base||s.conversion_to_base||1),
          last_movement_sequence:number(s.last_movement_sequence||0)
        }));
      });
    }

    const productMap=new Map(products.map(p=>[String(p.product_id||''),p]));
    const locationMap=new Map(locations.map(l=>[String(l.location_id||''),l]));
    balances=balances.filter(b=>number(b.current_base_qty)>0).map(b=>{
      const p=productMap.get(String(b.product_id||''))||{};
      const l=locationMap.get(String(b.location_id||'').toUpperCase())||{};
      return {
        ...b,
        product_id:String(b.product_id||''),
        product_name:String(b.product_name||p.product_name||''),
        category:String(b.category||p.category||''),
        base_unit:String(b.base_unit||p.base_unit||'').toUpperCase(),
        location_id:String(b.location_id||'').toUpperCase(),
        location_type:String(b.location_type||l.location_type||'').toUpperCase(),
        rack:String(b.rack||l.rack||'').toUpperCase(),
        level:String(b.level||l.level||'').toUpperCase(),
        position:String(b.position||l.position||'').toUpperCase(),
        lot_unit:String(b.lot_unit||b.unit_code||'').toUpperCase(),
        lot_conversion_to_base:number(b.lot_conversion_to_base||b.conversion_to_base||1),
        current_base_qty:number(b.current_base_qty),
        last_movement_sequence:number(b.last_movement_sequence||0)
      };
    });

    const byProduct={};
    balances.forEach(b=>{byProduct[b.product_id]=(byProduct[b.product_id]||0)+b.current_base_qty;});
    products.forEach(p=>{p.base_unit=String(p.base_unit||'').toUpperCase();p.on_hand_base=Number.isFinite(Number(p.on_hand_base))?Number(p.on_hand_base):(byProduct[p.product_id]||0);});

    const summary=raw.summary&&typeof raw.summary==='object'?{...raw.summary}:{};
    if(!summary.by_base_unit){
      summary.by_base_unit={};
      balances.forEach(b=>{const unit=b.base_unit||'UNKNOWN';summary.by_base_unit[unit]=(summary.by_base_unit[unit]||0)+b.current_base_qty;});
    }
    const activeRack=locations.filter(l=>l.location_type==='RACK').length;
    const occupiedRack=new Set(balances.filter(b=>b.location_type==='RACK'||String(b.location_id).startsWith('R')).map(b=>b.location_id)).size;
    if(summary.positive_balance_lines==null)summary.positive_balance_lines=balances.length;
    if(summary.active_rack_locations==null)summary.active_rack_locations=activeRack;
    if(summary.occupied_rack_locations==null)summary.occupied_rack_locations=occupiedRack;
    if(summary.open_rack_locations==null)summary.open_rack_locations=Math.max(0,activeRack-occupiedRack);
    if(summary.active_locations==null)summary.active_locations=locations.length;

    return {...raw,version:String(raw.version||'legacy-inventory-api'),products,locations,balances,summary};
  }

  async function load(force=false){
    if(liveState.loading)return;
    if(liveState.boot&&!force)return;
    liveState.loading=true;
    liveState.error='';
    if(force)liveState.boot=null;
    try{
      const raw=await api('inventoryBootstrap');
      liveState.boot=normalizeBoot(raw);
      liveState.lastLoadedAt=new Date();
      if(!liveState.boot.products.length)throw new Error('Inventory API connected but returned zero active products.');
      if(!liveState.boot.locations.length)throw new Error('Inventory API connected but returned zero active locations.');
    }catch(e){
      liveState.boot=null;
      liveState.error=e?.message||String(e);
    }finally{
      liveState.loading=false;
    }
  }

  function balancesForProduct(productId){return (liveState.boot?.balances||[]).filter(b=>b.product_id===productId);}
  function productRows(){
    const rows=(liveState.boot?.products||[]).map(p=>({...p,stock:balancesForProduct(p.product_id)}));
    const q=liveState.query.trim().toLowerCase();
    return rows.filter(p=>!q||`${p.product_id} ${p.product_name} ${p.category} ${p.barcode||''}`.toLowerCase().includes(q)).sort((a,b)=>String(a.product_name||'').localeCompare(String(b.product_name||'')));
  }
  function storageSpaces(area){
    const locations=liveState.boot?.locations||[];
    const balances=liveState.boot?.balances||[];
    if(/^R\d{2}$/.test(area)){
      return locations.filter(l=>l.rack===area).map(l=>({...l,stock:balances.filter(b=>b.location_id===l.location_id)}));
    }
    const l=locations.find(x=>x.location_id===area);
    return l?[{...l,stock:balances.filter(b=>b.location_id===area)}]:[];
  }

  function statusBanner(){
    if(liveState.loading)return `<div class="count-live-banner offline"><span class="count-live-dot"></span><div style="flex:1"><strong>CONNECTING TO LIVE INVENTORY</strong><span>Reading PRODUCTS, LOCATIONS, LOTS and INVENTORY_BALANCES…</span></div></div>`;
    if(liveState.error)return `<div class="count-live-banner offline"><span class="count-live-dot"></span><div style="flex:1"><strong>LIVE INVENTORY CONNECTION ERROR</strong><span>${esc(liveState.error)}</span></div><button class="secondary-btn" type="button" data-live-retry>Retry</button></div>`;
    if(!liveState.boot)return `<div class="count-live-banner offline"><span class="count-live-dot"></span><div style="flex:1"><strong>LIVE INVENTORY NOT LOADED</strong><span>No mock or fallback inventory is displayed.</span></div><button class="secondary-btn" type="button" data-live-retry>Connect</button></div>`;
    const s=liveState.boot.summary||{};
    const totals=Object.entries(s.by_base_unit||{}).map(([unit,qty])=>`${fmt(qty)} ${esc(unit)}`).join(' · ');
    const when=liveState.lastLoadedAt?liveState.lastLoadedAt.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';
    return `<div class="count-live-banner"><span class="count-live-dot"></span><div style="flex:1"><strong>LIVE INVENTORY CONNECTED · READ ONLY</strong><span>${totals||'No positive stock'} · ${fmt(s.positive_balance_lines)} stock lines · ${fmt(liveState.boot.products?.length)} active products · ${fmt(s.occupied_rack_locations)}/${fmt(s.active_rack_locations)} rack spaces occupied · API ${esc(liveState.boot.version)}${when?` · loaded ${esc(when)}`:''}</span></div><button class="secondary-btn" type="button" data-live-refresh>Refresh</button><span class="status gray">WRITES OFF</span></div>`;
  }

  function renderStorage(){
    const area=liveState.selectedArea;
    const spaces=storageSpaces(area);
    if(!spaces.length)return `<div class="count-empty-stock"><strong>${esc(area)} not loaded</strong><span>No active location record was returned for this storage area.</span></div>`;
    if(/^R\d{2}$/.test(area)){
      return `<div class="rack-grid">${spaces.map(space=>`<button class="rack-space ${space.stock.length?'occupied':'available'}" type="button" data-live-location="${esc(space.location_id)}"><div class="rack-space-label"><strong>${esc(space.location_id)}</strong><span>${space.stock.length?`${space.stock.length} stock line${space.stock.length===1?'':'s'}`:'EMPTY'}</span></div>${space.stock.slice(0,3).map(s=>`<div class="rack-stock-line"><b>${esc(s.product_name)}</b><span>${fmt(s.current_base_qty)} ${esc(s.base_unit)} · ${esc(s.supplier_lot_number||s.lot_id)}</span></div>`).join('')}${space.stock.length>3?`<small>+${space.stock.length-3} more</small>`:''}</button>`).join('')}</div>`;
    }
    const space=spaces[0];
    return `<button class="rack-space ${space.stock.length?'occupied':'available'}" style="width:100%;min-height:180px;text-align:left" type="button" data-live-location="${esc(space.location_id)}"><div class="rack-space-label"><strong>${esc(space.location_id)}</strong><span>${space.stock.length?`${space.stock.length} stock line${space.stock.length===1?'':'s'}`:'EMPTY'}</span></div>${space.stock.slice(0,8).map(s=>`<div class="rack-stock-line"><b>${esc(s.product_name)}</b><span>${fmt(s.current_base_qty)} ${esc(s.base_unit)} · ${esc(s.supplier_lot_number||s.lot_id)}</span></div>`).join('')}${space.stock.length>8?`<small>+${space.stock.length-8} more</small>`:''}</button>`;
  }

  function renderLiveInventory(){
    setHeading('Warehouse','Inventory');
    const rows=productRows();
    const areas=[...Array.from({length:50},(_,i)=>`R${String(i+1).padStart(2,'0')}`),'FLOOR-1','FLOOR-2','PACKING'];
    return `<div class="page-stack">
      <div class="hero-row"><div class="hero-copy"><span class="worker-kicker">LIVE INVENTORY</span><h2>Current warehouse stock</h2><p>Real product, lot, quantity and location balances from the optimized operational database.</p></div><div>${WRITES_ENABLED?'<span class="status amber">WRITES ENABLED</span>':'<span class="status gray">SAFE READ ONLY</span>'}</div></div>
      ${statusBanner()}
      <section class="grid-2">
        <div class="panel" style="padding:14px"><div class="panel-head"><div><h3>Products</h3><p>All active products, including zero-stock items.</p></div></div><div class="field"><label>Search</label><input data-live-search type="search" value="${esc(liveState.query)}" placeholder="Product name, ID or barcode"></div><div class="count-product-list" style="margin-top:10px">${rows.slice(0,75).map(p=>`<article class="count-product-row"><button type="button" data-live-product="${esc(p.product_id)}"><strong>${esc(p.product_name)}</strong><small>${esc(p.product_id)} · ${esc(p.category||'')}</small></button><div class="count-stock-figure ${number(p.on_hand_base)>0?'count-stock':'count-zero'}"><b>${fmt(p.on_hand_base)} ${esc(p.base_unit)}</b><span>${p.stock.length?`${p.stock.length} stock line${p.stock.length===1?'':'s'}`:'ZERO STOCK'}</span></div></article>`).join('')||'<div class="count-empty-stock"><strong>No matching products</strong><span>Search checks the complete live product list.</span></div>'}</div></div>
        <div class="panel" style="padding:14px"><div class="panel-head"><div><h3>Storage view</h3><p>R01–R50 plus floor and packing locations.</p></div><select data-live-area>${areas.map(a=>`<option value="${a}" ${a===liveState.selectedArea?'selected':''}>${a}</option>`).join('')}</select></div>${renderStorage()}</div>
      </section>
    </div>`;
  }

  function openProduct(productId){
    const p=(liveState.boot?.products||[]).find(x=>x.product_id===productId);if(!p)return;
    const stock=balancesForProduct(productId);
    openDrawer('LIVE PRODUCT',`${p.product_name} · ${p.product_id}`,`<div class="count-product-detail"><div class="count-detail-hero"><span>CURRENT ON HAND</span><strong>${fmt(p.on_hand_base)} ${esc(p.base_unit)}</strong><small>${stock.length} positive balance line${stock.length===1?'':'s'}</small></div>${stock.length?`<div class="count-existing-lines">${stock.map(s=>`<div class="count-existing-line"><div><strong>${esc(s.location_id)}</strong><small>Lot ${esc(s.supplier_lot_number||s.lot_id)} · ${esc(s.lot_unit||'BASE')} × ${fmt(s.lot_conversion_to_base||1)}${s.last_movement_sequence?` · sequence ${fmt(s.last_movement_sequence)}`:''}</small></div><span>${fmt(s.current_base_qty)} ${esc(s.base_unit)}</span></div>`).join('')}</div>`:`<div class="count-empty-stock"><strong>Zero stock</strong><span>This active product currently has no positive inventory balance.</span></div>`}<div class="count-step-note">Read-only validation is active. No inventory changes can be submitted from this screen.</div></div>`);
  }

  function openLocation(locationId){
    const lines=(liveState.boot?.balances||[]).filter(b=>b.location_id===locationId);
    openDrawer('LIVE LOCATION',locationId,lines.length?`<div class="count-existing-lines">${lines.map(s=>`<div class="count-existing-line"><div><strong>${esc(s.product_name)}</strong><small>${esc(s.product_id)} · Lot ${esc(s.supplier_lot_number||s.lot_id)}</small></div><span>${fmt(s.current_base_qty)} ${esc(s.base_unit)}</span></div>`).join('')}</div>`:`<div class="count-empty-stock"><strong>Empty space</strong><span>No positive inventory balance currently exists in this location.</span></div>`);
  }

  function bind(){
    const search=document.querySelector('[data-live-search]');
    search?.addEventListener('input',e=>{liveState.query=e.target.value;renderPage();requestAnimationFrame(()=>{const n=document.querySelector('[data-live-search]');n?.focus();try{n?.setSelectionRange(n.value.length,n.value.length)}catch(_e){}});});
    document.querySelector('[data-live-area]')?.addEventListener('change',e=>{liveState.selectedArea=e.target.value;renderPage();});
    document.querySelectorAll('[data-live-product]').forEach(b=>b.addEventListener('click',()=>openProduct(b.dataset.liveProduct)));
    document.querySelectorAll('[data-live-location]').forEach(b=>b.addEventListener('click',()=>openLocation(b.dataset.liveLocation)));
    document.querySelector('[data-live-retry]')?.addEventListener('click',async()=>{liveState.error='';renderPage();await load(true);if(state.page==='inventory')renderPage();});
    document.querySelector('[data-live-refresh]')?.addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;b.textContent='Refreshing…';await load(true);if(state.page==='inventory')renderPage();});
  }

  renderInventory=function(){
    if(!liveState.boot&&!liveState.loading&&!liveState.error){load().then(()=>{if(state.page==='inventory')renderPage();});}
    return renderLiveInventory();
  };
  const baseBind=bindPageInteractions;
  bindPageInteractions=function(){baseBind();if(state.page==='inventory')bind();};

  window.SanJoseLiveInventory={reload:async()=>{await load(true);if(state.page==='inventory')renderPage();},getState:()=>liveState,api};

  // p2.js renders once before this deferred module runs. If the browser opens or refreshes
  // directly on #inventory, force a second render so the live adapter actually takes control.
  if(state.page==='inventory')renderPage();
})();
