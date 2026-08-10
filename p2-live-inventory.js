(() => {
  const API_URL = String(window.SAN_JOSE_P2_API_URL || '').trim();
  const phoneQuery = window.matchMedia('(max-width:760px)');
  const isPhone = () => phoneQuery.matches;
  const liveState = {boot:null, loading:false, query:'', selectedProduct:null, selectedLocation:'', error:''};

  function api(action,payload={}){
    if(!API_URL) return Promise.reject(new Error('Live inventory backend has not been deployed yet.'));
    return new Promise((resolve,reject)=>{
      const cb='sjp2_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      const script=document.createElement('script');
      const url=new URL(API_URL);
      url.searchParams.set('action',action);
      url.searchParams.set('payload',JSON.stringify(payload));
      url.searchParams.set('callback',cb);
      const clean=()=>{delete window[cb];script.remove();};
      window[cb]=data=>{clean();data&&data.ok?resolve(data.result):reject(new Error(data?.error||'Live inventory request failed.'));};
      script.onerror=()=>{clean();reject(new Error('Could not reach the live inventory backend.'));};
      script.src=url.toString();document.body.appendChild(script);
    });
  }

  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmt=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(n||0));
  const session=()=>window.SAN_JOSE_SESSION||null;
  const isAdmin=()=>String(session()?.role||'').toUpperCase()==='ADMIN';
  const opId=()=>`COUNT-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;

  async function load(force=false){
    if(liveState.loading)return;
    if(liveState.boot&&!force)return;
    liveState.loading=true;liveState.error='';
    try{liveState.boot=await api('inventoryBootstrap');}
    catch(e){liveState.error=e.message;}
    finally{liveState.loading=false;}
  }

  function productById(id){return liveState.boot?.products?.find(p=>p.product_id===id)||null;}
  function productRows(){
    const rows=liveState.boot?.products||[];
    const q=liveState.query.trim().toLowerCase();
    if(!q)return rows.slice().sort((a,b)=>a.product_name.localeCompare(b.product_name));
    return rows.filter(p=>`${p.product_id} ${p.product_name} ${p.category}`.toLowerCase().includes(q)).sort((a,b)=>a.product_name.localeCompare(b.product_name));
  }
  function locations(){return liveState.boot?.locations||[];}

  function liveBanner(){
    if(liveState.boot)return `<div class="count-live-banner"><span class="count-live-dot"></span><div style="flex:1"><strong>LIVE INVENTORY CONNECTED</strong><span>${fmt(liveState.boot.total_on_hand_base)} LB · ${liveState.boot.balance_count} stock lines · ${liveState.boot.products.length} active products</span></div></div>`;
    return `<div class="count-live-banner offline"><span class="count-live-dot"></span><div style="flex:1"><strong>${liveState.loading?'CONNECTING TO LIVE INVENTORY':'LIVE BACKEND NOT CONNECTED'}</strong><span>${esc(liveState.error||'Deploy the new P2 Apps Script backend and set SAN_JOSE_P2_API_URL before physical counts can post.')}</span></div></div>`;
  }

  function renderLiveInventory(){
    setHeading('Warehouse','Inventory');
    const rows=productRows();
    const phone=isPhone();
    const content=`<div class="${phone?'worker-mobile-page':'page-stack'}">
      <section class="${phone?'mobile-page-intro compact-intro':'hero-row'}"><div><span class="worker-kicker">PHYSICAL INVENTORY</span><h2>${phone?'Find or add stock':'Count against the real product master'}</h2><p>Search every active product, including items that currently show zero inventory. Add only what you physically find.</p></div>${isAdmin()?`<button class="count-add-btn" type="button" data-count-new-product>+ New product</button>`:''}</section>
      ${liveBanner()}
      <section class="${phone?'':'panel'}" style="${phone?'':'padding:14px'}">
        <div class="count-toolbar"><label class="${phone?'mobile-search':''} field"><${phone?'span>⌕</span><input':'label>Search all products</label><input'} data-count-search type="search" value="${esc(liveState.query)}" placeholder="Product name or ID..."></label>${!isAdmin()?'<div></div>':''}</div>
        <div class="count-product-list" style="margin-top:10px">${rows.slice(0,120).map(p=>`<article class="count-product-row"><button type="button" data-count-product="${esc(p.product_id)}"><strong>${esc(p.product_name)}</strong><small>${esc(p.product_id)} · ${esc(p.category||'Uncategorized')}</small></button><div class="count-stock-figure ${p.on_hand_base>0?'count-stock':'count-zero'}"><b>${fmt(p.on_hand_base)} ${esc(p.base_unit||'')}</b><span>${p.on_hand_base>0?`${p.stock.length} location/lot line${p.stock.length===1?'':'s'}`:'SYSTEM SHOWS ZERO'}</span></div></article>`).join('')||'<div class="count-empty-stock"><strong>No products match</strong><span>Check spelling, or an Admin can create a truly new product.</span></div>'}</div>
      </section>
    </div>`;
    return content;
  }

  function bindLiveInventory(){
    document.querySelector('[data-count-search]')?.addEventListener('input',e=>{liveState.query=e.target.value;document.getElementById('pageView').innerHTML=renderLiveInventory();bindLiveInventory();});
    document.querySelectorAll('[data-count-product]').forEach(b=>b.addEventListener('click',()=>openProduct(b.dataset.countProduct)));
    document.querySelector('[data-count-new-product]')?.addEventListener('click',openNewProduct);
  }

  function openProduct(id){
    const p=productById(id);if(!p)return;
    liveState.selectedProduct=p;
    const stock=p.stock||[];
    openDrawer('PHYSICAL COUNT',`${p.product_name} · ${p.product_id}`,`<div class="count-product-detail">
      <div class="count-detail-hero"><span>SYSTEM QUANTITY</span><strong>${fmt(p.on_hand_base)} ${esc(p.base_unit)}</strong><small>${stock.length?`${stock.length} current stock line${stock.length===1?'':'s'}`:'This product exists in PRODUCTS but currently has no positive inventory balance.'}</small></div>
      ${stock.length?`<div class="count-existing-lines">${stock.map(s=>`<div class="count-existing-line"><div><strong>${esc(s.location_id)}</strong><small>Lot ${esc(s.supplier_lot_number||s.lot_id)} · ${esc(s.unit_code)} × ${fmt(s.conversion_to_base)}</small></div><span>${fmt(s.current_base_qty)} ${esc(p.base_unit)}</span></div>`).join('')}</div><div class="count-step-note">This product already has inventory. Only use “Add found stock” for an additional quantity that is physically present but missing from the system.</div>`:`<div class="count-empty-stock"><strong>No inventory currently recorded</strong><span>If you physically found this product, add the count below.</span></div>`}
      <button type="button" class="primary-btn mobile-primary" data-add-found-stock>Add found stock</button>
    </div>`);
    document.querySelector('[data-add-found-stock]')?.addEventListener('click',()=>openFoundStock(p.product_id));
  }

  function defaultUnit(p){
    const options=p.units||[];
    return options.find(u=>u.is_default_purchase)||options.find(u=>u.unit_code===p.base_unit)||options[0]||{unit_code:p.base_unit||'LB',conversion_to_base:1};
  }

  function openFoundStock(id){
    const p=productById(id);if(!p)return;
    const def=defaultUnit(p);const unitOptions=(p.units||[]).filter(u=>u.purchase_enabled||u.sales_enabled);
    const choices=unitOptions.length?unitOptions:[def];
    openDrawer('ADD FOUND STOCK',p.product_name,`<div class="count-product-detail">
      <div class="count-step-note good">Use this during a physical inventory count when stock is physically present but missing from the system. This posts an ADJUST_IN, not a purchase receipt.</div>
      <div class="count-form-grid">
        <div class="field"><label>Quantity found</label><input id="countQty" type="number" min="0" step="0.01" inputmode="decimal" value="1"></div>
        <div class="field"><label>Unit</label><select id="countUnit">${choices.map(u=>`<option value="${esc(u.unit_code)}" data-conv="${Number(u.conversion_to_base||1)}" ${u.unit_code===def.unit_code?'selected':''}>${esc(u.unit_code)}</option>`).join('')}</select></div>
        <div class="field"><label>LB / unit</label><input id="countConv" type="number" min="0" step="0.0001" inputmode="decimal" value="${Number(def.conversion_to_base||1)}"></div>
        <div class="field"><label>Supplier lot #</label><input id="countSupplierLot" autocomplete="off" placeholder="Optional / if visible"></div>
        <div class="field full"><label>Expiration date</label><input id="countExpiry" type="date"></div>
        <div class="field full"><label>Exact location</label><input id="countLocation" autocomplete="off" placeholder="Scan or type R01-L1-F, FLOOR-1..."></div>
        <div class="field full"><label>Notes</label><textarea id="countNotes" placeholder="Optional count note"></textarea></div>
      </div>
      <div id="countTotal" class="count-total"></div>
      <div id="countLocationWarning"></div>
      <div class="drawer-actions mobile-sticky-actions"><button type="button" class="primary-btn mobile-primary" data-post-found-stock>Post found stock</button></div>
    </div>`);
    const qty=document.getElementById('countQty'),unit=document.getElementById('countUnit'),conv=document.getElementById('countConv'),loc=document.getElementById('countLocation');
    const update=()=>{if(unit.value===p.base_unit)conv.value='1';const total=Number(qty.value||0)*Number(conv.value||0);document.getElementById('countTotal').innerHTML=`<strong>${fmt(total)} ${esc(p.base_unit)}</strong><span>${fmt(qty.value)} ${esc(unit.value)} × ${fmt(conv.value)} ${esc(p.base_unit)}/${esc(unit.value)}</span>`;warnLocation(p,loc.value);};
    unit.addEventListener('change',()=>{const o=unit.options[unit.selectedIndex];conv.value=unit.value===p.base_unit?'1':String(o.dataset.conv||1);update();});
    [qty,conv,loc].forEach(x=>x.addEventListener('input',update));update();
    document.querySelector('[data-post-found-stock]')?.addEventListener('click',()=>postFoundStock(p));
  }

  function warnLocation(p,value){
    const root=document.getElementById('countLocationWarning');if(!root)return;
    const location=String(value||'').trim().toUpperCase();
    if(!location){root.innerHTML='';return;}
    const valid=locations().some(l=>l.location_id===location);
    const existing=(liveState.boot?.products||[]).flatMap(prod=>(prod.stock||[]).map(s=>({...s,product_name:prod.product_name}))).filter(s=>s.location_id===location);
    root.innerHTML=!valid?`<div class="count-existing-warning">${esc(location)} is not an active warehouse location.</div>`:existing.length?`<div class="count-existing-warning"><strong>${esc(location)} already contains stock.</strong><br>${existing.map(s=>`${esc(s.product_name)} · lot ${esc(s.supplier_lot_number||s.lot_id)} · ${fmt(s.current_base_qty)} LB`).join('<br>')}<br>Mixed storage is allowed, but verify the physical space before posting.</div>`:'';
  }

  async function postFoundStock(p){
    const user=session();if(!user)return toast('Sign in again before changing inventory.');
    const qty=Number(document.getElementById('countQty')?.value||0),unit=String(document.getElementById('countUnit')?.value||'').toUpperCase(),conv=Number(document.getElementById('countConv')?.value||0),location=String(document.getElementById('countLocation')?.value||'').trim().toUpperCase();
    if(!(qty>0))return toast('Enter the physical quantity found.');if(!(conv>0))return toast('Enter the unit weight/conversion.');if(!locations().some(l=>l.location_id===location))return toast('Choose a valid active location.');
    const btn=document.querySelector('[data-post-found-stock]');if(btn){btn.disabled=true;btn.textContent='Posting…';}
    try{
      const result=await api('addCountedStock',{user_id:user.user_id,product_id:p.product_id,quantity:qty,unit_code:unit,conversion_to_base:unit===p.base_unit?1:conv,supplier_lot_number:document.getElementById('countSupplierLot')?.value||'',expiration_date:document.getElementById('countExpiry')?.value||'',location_id:location,notes:document.getElementById('countNotes')?.value||'',operation_id:opId()});
      await load(true);closeDrawer();toast(`${p.product_name}: ${fmt(result.quantity_base)} ${p.base_unit} added to ${location}`);renderPage();
    }catch(e){toast(e.message);if(btn){btn.disabled=false;btn.textContent='Post found stock';}}
  }

  function openNewProduct(){
    if(!isAdmin())return toast('Only an Admin can create a master product.');
    openDrawer('NEW PRODUCT','Create from physical count',`<div class="count-new-product"><div class="count-new-product-warning">Search the product master first. Creating a duplicate product name will be blocked by the backend.</div><div class="count-form-grid"><div class="field full"><label>Product name</label><input id="newCountName" autocomplete="off"></div><div class="field"><label>Category</label><input id="newCountCategory" value="Uncategorized"></div><div class="field"><label>Base unit</label><select id="newCountBase"><option>LB</option><option>UNIT</option></select></div><div class="field"><label>SKU</label><input id="newCountSku"></div><div class="field"><label>Barcode</label><input id="newCountBarcode"></div></div><button type="button" class="primary-btn mobile-primary" data-create-count-product>Create & continue to count</button></div>`);
    document.querySelector('[data-create-count-product]')?.addEventListener('click',createProductAndCount);
  }

  async function createProductAndCount(){
    const user=session();if(!user)return toast('Sign in again.');const name=String(document.getElementById('newCountName')?.value||'').trim();if(!name)return toast('Enter the product name.');
    const btn=document.querySelector('[data-create-count-product]');if(btn){btn.disabled=true;btn.textContent='Creating…';}
    try{const r=await api('createInventoryProduct',{user_id:user.user_id,product_name:name,category:document.getElementById('newCountCategory')?.value||'Uncategorized',base_unit:document.getElementById('newCountBase')?.value||'LB',sku:document.getElementById('newCountSku')?.value||'',barcode:document.getElementById('newCountBarcode')?.value||''});await load(true);const product=productById(r.product_id);toast(r.duplicate?'That product already existed. Opening it now.':'Product created. Add the physical stock now.');openFoundStock(product.product_id);}catch(e){toast(e.message);if(btn){btn.disabled=false;btn.textContent='Create & continue to count';}}
  }

  const previousRenderInventory=typeof renderInventory==='function'?renderInventory:null;
  if(previousRenderInventory){renderInventory=function(){if(!liveState.boot&&!liveState.loading&&!liveState.error)load().then(()=>{if(state.page==='inventory')renderPage();});return renderLiveInventory();};}
  const previousBind=typeof bindPageInteractions==='function'?bindPageInteractions:null;
  if(previousBind){bindPageInteractions=function(){previousBind();if(state.page==='inventory')bindLiveInventory();};}

  window.SanJoseLiveInventory={reload:()=>load(true),getState:()=>liveState};
})();
