(() => {
  const phoneQuery = window.matchMedia('(max-width: 760px)');
  const isPhone = () => phoneQuery.matches;
  const adminRole = () => {
    const explicit = String(window.SAN_JOSE_USER_ROLE || '').toLowerCase();
    if (explicit) return ['admin','manager','operations_admin','operations admin'].includes(explicit);
    return /admin|manager/i.test(document.querySelector('.signed-user span')?.textContent || '');
  };
  const isAdminPhone = () => isPhone() && adminRole();

  const workerOverview = renderOverview;
  const baseRenderOrders = renderOrders;
  const baseReplenishment = renderReplenishment;
  const baseProducts = renderProducts;
  const baseParties = renderParties;
  const baseAnalytics = renderAnalytics;
  const baseAdmin = renderAdmin;
  const workerRenderPage = renderPage;

  const adminMetrics = {
    inventoryValue:750821,
    inventoryLb:458412.68,
    occupied:318,
    totalRack:450,
    openSales:186430,
    openPurchases:94120,
    alerts:49,
    suggestedBuy:75099.5,
    margin:17.8
  };

  const warehouseUsage = () => adminMetrics.occupied / adminMetrics.totalRack * 100;
  const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  const num = value => new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value);

  function adminAlert(dot,title,note,target){
    return `<button type="button" class="admin-alert-row" data-admin-go="${target}"><i class="admin-alert-dot ${dot}"></i><div><strong>${title}</strong><small>${note}</small></div><span>›</span></button>`;
  }

  function renderAdminPhoneHome(){
    setHeading('Admin','Operations');
    return `<div class="admin-phone-page">
      <section class="admin-phone-hero">
        <div class="admin-phone-hero-row"><div><span class="worker-kicker">OPERATIONS ADMIN</span><h2>San Jose today</h2><p>Management visibility on your phone, with warehouse execution still one tap away.</p></div><div class="admin-user-chip"><b>AR</b><span>Admin</span></div></div>
      </section>

      <section class="admin-kpi-grid">
        <article class="admin-kpi"><span>Inventory value</span><strong>${money(adminMetrics.inventoryValue)}</strong><small>${num(adminMetrics.inventoryLb)} LB current stock</small></article>
        <article class="admin-kpi good"><span>Warehouse usage</span><strong>${warehouseUsage().toFixed(1)}%</strong><small>${adminMetrics.occupied} of ${adminMetrics.totalRack} rack spaces occupied</small></article>
        <article class="admin-kpi"><span>Open sales</span><strong>${money(adminMetrics.openSales)}</strong><small>${data.salesOrders.filter(x=>x.status!=='SHIPPED').length} visible open orders</small></article>
        <article class="admin-kpi alert"><span>Reorder / OOS</span><strong>${adminMetrics.alerts}</strong><small>${num(adminMetrics.suggestedBuy)} LB suggested buy</small></article>
      </section>

      <section class="admin-section">
        <header class="admin-section-head"><div><span class="worker-kicker">WAREHOUSE</span><h3>Quick operations</h3><p>Use the same simple execution flows as workers.</p></div></header>
        <div class="admin-quick-grid">
          <button type="button" data-admin-go="receiving"><span>↓</span><b>Receive</b><small>PO → spot</small></button>
          <button type="button" data-admin-go="shipping"><span>↑</span><b>Ship</b><small>SO → source</small></button>
          <button type="button" data-admin-move><span>↔</span><b>Move</b><small>Space → space</small></button>
          <button type="button" data-admin-go="inventory"><span>▦</span><b>Stock</b><small>Find location</small></button>
        </div>
      </section>

      <section class="admin-section">
        <header class="admin-section-head"><div><span class="worker-kicker">ATTENTION</span><h3>Needs review</h3></div><button class="admin-link-btn" type="button" data-admin-go="replenishment">Planning</button></header>
        <div class="admin-alert-list">
          ${adminAlert('red','49 products need inventory attention','Reorder or out-of-stock based on current operations metrics','replenishment')}
          ${adminAlert('amber','PO-22710 is overdue','Expected Aug 7 · purchasing follow-up required','purchase')}
          ${adminAlert('amber','SO-22698 is due now','Publico General · ready for physical picking','shipping')}
          ${adminAlert('green','Inventory balances reconciled','458,412.68 LB current modeled inventory','inventory')}
        </div>
      </section>

      <section class="admin-section">
        <header class="admin-section-head"><div><span class="worker-kicker">ORDERS</span><h3>Open workflow</h3></div><button class="admin-link-btn" type="button" data-admin-go="sales">All sales</button></header>
        <div class="admin-order-mini-list">
          ${data.salesOrders.filter(x=>x.status!=='SHIPPED').slice(0,3).map(o=>`<article class="admin-order-card"><div class="admin-order-top"><div><strong>${o.id}</strong><small>${o.customer}</small></div>${statusPill(o.status)}</div><div class="admin-order-facts"><div><span>Due</span><b>${fmtDate(o.due)}</b></div><div><span>Products</span><b>${o.products}</b></div><div><span>Value</span><b>${money(o.total)}</b></div></div><div class="admin-order-actions"><button type="button" data-admin-order="so:${o.id}">Details</button><button type="button" class="primary" data-admin-ship="${o.id}">Fulfill</button></div></article>`).join('')}
        </div>
      </section>

      <section class="admin-section">
        <header class="admin-section-head"><div><span class="worker-kicker">PERFORMANCE</span><h3>Operating snapshot</h3></div><button class="admin-link-btn" type="button" data-admin-go="analytics">Analytics</button></header>
        <div class="admin-analytics-grid"><article class="admin-analytics-box"><span>Gross margin</span><strong>${adminMetrics.margin}%</strong><small>Portfolio operating signal</small><div class="admin-bar"><i style="width:${Math.min(100,adminMetrics.margin*3)}%"></i></div></article><article class="admin-analytics-box"><span>Open purchases</span><strong>${money(adminMetrics.openPurchases)}</strong><small>Not fully received</small></article></div>
      </section>

      <div class="admin-role-note">This admin view is role-aware. Warehouse workers keep the simplified worker phone UI; users identified as Admin/Manager get this management layer plus warehouse actions.</div>
    </div>`;
  }

  function orderCard(o,purchase){
    return `<article class="admin-order-card"><div class="admin-order-top"><div><strong>${o.id}</strong><small>${purchase?o.supplier:o.customer}</small></div>${statusPill(o.status)}</div><div class="admin-order-facts"><div><span>${purchase?'Expected':'Due'}</span><b>${fmtDate(purchase?o.expected:o.due)}</b></div><div><span>Products</span><b>${o.products}</b></div><div><span>Value</span><b>${money(o.total)}</b></div></div><div class="admin-order-actions"><button type="button" data-admin-order="${purchase?'po':'so'}:${o.id}">Details</button><button type="button" class="primary" ${purchase?`data-admin-receive="${o.id}"`:`data-admin-ship="${o.id}"`}>${purchase?'Receive':'Fulfill'}</button></div></article>`;
  }

  function renderAdminOrders(kind){
    const purchase=kind==='purchase';
    setHeading('Admin',purchase?'Purchase Orders':'Sales Orders');
    const rows=(purchase?data.purchaseOrders:data.salesOrders).filter(x=>purchase?x.status!=='RECEIVED':x.status!=='SHIPPED');
    return `<div class="admin-phone-page"><section class="mobile-page-intro compact-intro"><div><span class="worker-kicker">${purchase?'PURCHASING':'SALES'}</span><h2>${purchase?'Incoming orders':'Customer orders'}</h2><p>${purchase?'Review vendor commitments and jump directly into receiving.':'See fulfillment status and send workers into physical picking.'}</p></div></section><label class="mobile-search"><span>⌕</span><input type="search" placeholder="Search order or party" data-admin-order-search></label><section class="admin-section"><div data-admin-order-list>${rows.map(o=>orderCard(o,purchase)).join('')}</div></section></div>`;
  }

  function renderAdminPlanning(){
    setHeading('Admin','Replenishment');
    const rows=[
      ['Maiz Pozolero Blanco','2.1 weeks cover','4,625 LB'],
      ['Chile Ancho','Below target coverage','8,400 LB'],
      ['Ajo Pelado','Free stock below reorder','2,180 LB'],
      ['Jamaica','Demand above free coverage','3,250 LB'],
      ['Frijol Peruano','Review margin + coverage','5,100 LB']
    ];
    return `<div class="admin-phone-page"><section class="mobile-page-intro compact-intro"><div><span class="worker-kicker">PLANNING</span><h2>Replenishment</h2><p>49 products currently flagged as reorder or out of stock.</p></div></section><div class="mobile-summary-strip"><div><strong>49</strong><span>Alerts</span></div><div><strong>75,099.5</strong><span>Suggested LB</span></div><div><strong>8 wk</strong><span>Demand window</span></div></div><section class="admin-section"><header class="admin-section-head"><div><h3>Highest-priority products</h3><p>Preview of the live operations-metric logic.</p></div></header>${rows.map(r=>`<div class="admin-planning-row"><div><strong>${r[0]}</strong><small>${r[1]}</small></div><b>${r[2]}<span>suggested buy</span></b></div>`).join('')}</section></div>`;
  }

  function renderAdminMore(){
    setHeading('Admin','More');
    const group=(label,items)=>`<section class="admin-more-group"><div class="admin-more-label">${label}</div><div class="admin-more-list">${items.map(([icon,title,note,target])=>`<button type="button" data-admin-go="${target}"><span class="admin-more-icon">${icon}</span><div><strong>${title}</strong><small>${note}</small></div><em>›</em></button>`).join('')}</div></section>`;
    return `<div class="admin-phone-page"><section class="mobile-page-intro compact-intro"><div><span class="worker-kicker">ADMIN TOOLS</span><h2>More</h2><p>Management screens that workers do not need in their daily warehouse flow.</p></div></section><section class="admin-section">${group('ORDERS',[['↙','Purchase Orders','Vendor orders and incoming commitments','purchase'],['↗','Sales Orders','Customer orders and fulfillment','sales']])}${group('PLANNING & INTELLIGENCE',[['↻','Replenishment','Reorder, cover and suggested buy','replenishment'],['⌁','Analytics','Sales, margin and product performance','analytics']])}${group('MASTER DATA',[['□','Products','Catalog, units and product settings','products'],['♧','Customers & Vendors','Parties, terms and contacts','parties']])}${group('SYSTEM',[['⌗','Scanner','Open warehouse scanner','scanner'],['⚙','Administration','Users and configuration','admin']])}</section></div>`;
  }

  function renderAdminPlaceholder(type,title,subtitle,items){
    setHeading('Admin',title);
    return `<div class="admin-phone-page"><section class="mobile-page-intro compact-intro"><div><span class="worker-kicker">${type}</span><h2>${title}</h2><p>${subtitle}</p></div></section><label class="mobile-search"><span>⌕</span><input type="search" placeholder="Search ${title.toLowerCase()}" data-admin-generic-search></label><section class="admin-section"><div data-admin-generic-list>${items.map(item=>`<div class="admin-search-card"><div><strong>${item[0]}</strong><small>${item[1]}</small></div><b>${item[2]||'›'}</b></div>`).join('')}</div></section></div>`;
  }

  renderOverview=function(){return isAdminPhone()?renderAdminPhoneHome():workerOverview();};
  renderOrders=function(kind){return isAdminPhone()?renderAdminOrders(kind):baseRenderOrders(kind);};
  renderReplenishment=function(){return isAdminPhone()?renderAdminPlanning():baseReplenishment();};
  renderProducts=function(){return isAdminPhone()?renderAdminPlaceholder('MASTER DATA','Products','Quick mobile catalog visibility. Full editing remains available on desktop.',data.products.map(p=>[p.name,`${p.id} · ${p.category}`,`${num(p.onHand)} LB`])):baseProducts();};
  renderParties=function(){return isAdminPhone()?renderAdminPlaceholder('MASTER DATA','Customers & Vendors','Account visibility for managers on the move.',data.parties.map(p=>[p.name,`${p.id} · ${p.type}`,money(p.balance)])):baseParties();};
  renderAnalytics=function(){return isAdminPhone()?`<div class="admin-phone-page"><section class="mobile-page-intro compact-intro"><div><span class="worker-kicker">INTELLIGENCE</span><h2>Analytics</h2><p>Fast management signals optimized for a phone.</p></div></section><section class="admin-kpi-grid"><article class="admin-kpi"><span>Inventory value</span><strong>${money(adminMetrics.inventoryValue)}</strong><small>${num(adminMetrics.inventoryLb)} LB</small></article><article class="admin-kpi good"><span>Gross margin</span><strong>${adminMetrics.margin}%</strong><small>Current portfolio signal</small></article><article class="admin-kpi"><span>Suggested buy</span><strong>${num(adminMetrics.suggestedBuy)} LB</strong><small>49 reorder / OOS alerts</small></article><article class="admin-kpi"><span>Warehouse</span><strong>${warehouseUsage().toFixed(1)}%</strong><small>${adminMetrics.occupied} occupied spots</small></article></section><section class="admin-section"><header class="admin-section-head"><div><h3>High-level actions</h3><p>Use desktop Analytics for deeper comparisons and scatterplots.</p></div></header><div class="admin-alert-list">${adminAlert('green','Inventory metrics available','Current balances now support live operational KPIs','inventory')}${adminAlert('amber','49 inventory alerts','Review replenishment priorities','replenishment')}${adminAlert('green','Sales metrics available','Non-Shopify and Shopify metrics remain separated','sales')}</div></section></div>`:baseAnalytics();};
  renderAdmin=function(){return isAdminPhone()?renderAdminMore():baseAdmin();};

  function bindAdminInteractions(){
    if(!isAdminPhone())return;
    document.querySelectorAll('[data-admin-go]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.adminGo)));
    document.querySelectorAll('[data-admin-move]').forEach(btn=>btn.addEventListener('click',()=>document.querySelector('[data-mobile-nav="move"]')?.click()));
    document.querySelectorAll('[data-admin-order]').forEach(btn=>btn.addEventListener('click',()=>openRecord(btn.dataset.adminOrder)));
    document.querySelectorAll('[data-admin-ship]').forEach(btn=>btn.addEventListener('click',()=>{
      const proxy=document.createElement('button');proxy.dataset.mobileShip=btn.dataset.adminShip;proxy.style.display='none';document.body.appendChild(proxy);proxy.click();proxy.remove();
    }));
    document.querySelectorAll('[data-admin-receive]').forEach(btn=>btn.addEventListener('click',()=>{
      const proxy=document.createElement('button');proxy.dataset.mobileReceive=btn.dataset.adminReceive;proxy.style.display='none';document.body.appendChild(proxy);proxy.click();proxy.remove();
    }));
    const search=document.querySelector('[data-admin-order-search]');const list=document.querySelector('[data-admin-order-list]');
    if(search&&list)search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();[...list.children].forEach(x=>x.hidden=Boolean(q&&!x.textContent.toLowerCase().includes(q)));});
    const generic=document.querySelector('[data-admin-generic-search]');const genericList=document.querySelector('[data-admin-generic-list]');
    if(generic&&genericList)generic.addEventListener('input',()=>{const q=generic.value.trim().toLowerCase();[...genericList.children].forEach(x=>x.hidden=Boolean(q&&!x.textContent.toLowerCase().includes(q)));});
  }

  function decorateAdminChrome(){
    document.body.classList.toggle('admin-phone',isAdminPhone());
    if(!isAdminPhone())return;
    const brandText=document.querySelector('.mobile-brand b');if(brandText&&!brandText.querySelector('.admin-mobile-badge'))brandText.insertAdjacentHTML('beforeend','<span class="admin-mobile-badge">ADMIN</span>');
    const nav=document.querySelector('.mobile-bottom-nav');if(!nav)return;
    nav.innerHTML=`<button type="button" data-admin-nav="overview"><span>⌂</span><b>Home</b></button><button type="button" data-admin-nav="sales"><span>↗</span><b>Orders</b></button><button type="button" class="move-nav" data-admin-nav="move"><span>↔</span><b>Move</b></button><button type="button" data-admin-nav="inventory"><span>▦</span><b>Stock</b></button><button type="button" data-admin-nav="admin"><span>•••</span><b>More</b></button>`;
    nav.querySelectorAll('[data-admin-nav]').forEach(btn=>{if(btn.dataset.adminNav===state.page||(btn.dataset.adminNav==='sales'&&['sales','purchase'].includes(state.page)))btn.classList.add('active');btn.addEventListener('click',()=>btn.dataset.adminNav==='move'?document.querySelector('[data-mobile-move]')?.click()||navigate('inventory'):navigate(btn.dataset.adminNav));});
    const pageName=document.getElementById('mobilePageName');if(pageName)pageName.textContent='Admin · '+(document.getElementById('pageTitle')?.textContent||'Operations');
    bindAdminInteractions();
  }

  renderPage=function(){workerRenderPage();decorateAdminChrome();};
  phoneQuery.addEventListener?.('change',()=>setTimeout(()=>renderPage(),0));
  renderPage();
})();
