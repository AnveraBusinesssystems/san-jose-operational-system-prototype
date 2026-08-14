const fmtMoney=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
const fmtMoney2=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const fmtNum=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});

const navSections=[
  ['OVERVIEW',[['overview','◫','Operations Center']]],
  ['ORDERS',[['purchase','↙','Purchase Orders'],['sales','↗','Sales Orders']]],
  ['WAREHOUSE',[['receiving','⇩','Receiving'],['shipping','⇧','Shipping'],['inventory','▦','Inventory'],['packing','▣','Packing Area']]],
  ['PLANNING',[['replenishment','↻','Replenishment']]],
  ['MASTER DATA',[['products','□','Products'],['parties','♧','Customers & Vendors']]],
  ['INTELLIGENCE',[['analytics','⌁','Analytics']]],
  ['TOOLS',[['scanner','⌗','Scanner']]],
  ['SYSTEM',[['admin','⚙','Admin']]]
];

const state={page:'overview',inventoryTab:'racks',filters:{},compact:false,selectedRack:'R01'};

// Intentionally empty until the P2 live API is connected.
// No operational page may invent records, quantities, KPIs, orders, parties, lots, or balances.
const data={
  kpis:null,
  purchaseOrders:[],
  salesOrders:[],
  products:[],
  lots:[],
  parties:[]
};

function titleCase(value){return String(value||'').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())}
function statusTone(status){const s=String(status||'').toUpperCase();if(['COMPLETE','RECEIVED','SHIPPED','READY','ACTIVE','PASS','OK'].includes(s))return'green';if(['OVERDUE','HOLD','REJECTED','OUT OF STOCK'].includes(s))return'red';if(['PARTIAL','PARTIALLY_RECEIVED','EXPIRING','REORDER','SHORT'].includes(s))return'amber';if(['CONFIRMED','OPEN','IN TRANSIT'].includes(s))return'blue';return'gray'}
function statusPill(status){return `<span class="status ${statusTone(status)}">${titleCase(status||'Unknown')}</span>`}
function button(label,kind='secondary-btn',attrs=''){return `<button class="${kind}" type="button" ${attrs}>${label}</button>`}
function panel(title,subtitle,body,action=''){return `<section class="panel"><header class="panel-head"><div><h3>${title}</h3>${subtitle?`<p>${subtitle}</p>`:''}</div>${action}</header>${body}</section>`}
function metric(label,value='—',note='Waiting for live data',trend='',tone='good'){return `<article class="metric-card"><span class="metric-label">${label}</span><strong>${value}</strong><small>${note}</small>${trend?`<em class="metric-trend ${tone}">${trend}</em>`:''}</article>`}
function fmtDate(value){if(!value)return'—';const d=new Date(String(value).length<=10?`${value}T12:00:00`:value);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
function setHeading(breadcrumb,title){document.getElementById('breadcrumb').textContent=breadcrumb;document.getElementById('pageTitle').textContent=title}
function emptyState(title,note,action=''){return `<div class="empty" style="padding:34px 22px;text-align:center"><strong style="display:block;font-size:16px">${title}</strong><span style="display:block;margin-top:7px;max-width:560px;margin-left:auto;margin-right:auto">${note}</span>${action?`<div style="margin-top:14px">${action}</div>`:''}</div>`}
function livePending(label='Live data'){return `<span class="status gray">${label} not connected</span>`}

function renderNav(){const root=document.getElementById('sidebarNav');if(!root)return;const allowed=page=>window.SanJoseSystem?.canAccessPage?.(page)!==false;root.innerHTML=navSections.map(([label,items])=>[label,items.filter(([id])=>allowed(id))]).filter(([,items])=>items.length).map(([label,items])=>`<section class="nav-section"><div class="nav-label">${label}</div>${items.map(([id,icon,name])=>`<button class="nav-item ${state.page===id?'active':''}" data-nav="${id}" type="button"><span class="nav-icon">${icon}</span><span>${name}</span></button>`).join('')}</section>`).join('');root.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav))}
function navigate(page){if(window.SanJoseSystem?.canAccessPage?.(page)===false)page='overview';state.page=page;state.filters={};location.hash=page;window.scrollTo({top:0,left:0,behavior:'auto'});renderNav();renderPage()}

function renderOverview(){setHeading('Overview','Operations Center');return `<div class="page-stack"><div class="hero-row"><div class="hero-copy"><h2>Operations Center</h2><p>The interface is ready for the San Jose live database. No demo operational values are being displayed.</p></div><div>${livePending()}</div></div><section class="metric-grid">${metric('Inventory value')}${metric('Open sales')}${metric('Open purchases')}${metric('Warehouse usage')}</section><section class="grid-2">${panel('Needs Attention','Will populate from live operational exceptions',emptyState('No live alerts loaded','Connect the P2 read API to show reorder, overdue, expiry, receiving and shipping exceptions.'))}${panel("Today's Activity",'Will populate from real movements and order activity',emptyState('No live activity loaded','Warehouse movements and order activity will appear here after connection.'))}</section>${panel('Operational Flow','Purchasing → receiving → warehouse → shipping',emptyState('Live workflow counts not loaded','This section will calculate directly from real orders, tasks and inventory state.'))}</div>`}

function ordersTable(rows,purchase){if(!rows.length)return emptyState(purchase?'No purchase orders loaded':'No sales orders loaded','This page will display real orders after the P2 order API is connected.');return `<div class="table-wrap"><table class="data-table"><thead><tr>${purchase?'<th>PO</th><th>Date</th><th>Supplier</th><th>Total</th><th>Expected</th><th>Status</th>':'<th>SO</th><th>Date</th><th>Customer</th><th>Total</th><th>Due</th><th>Status</th>'}</tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${r.id||r.order_id}</strong></td><td>${fmtDate(r.date||r.order_date)}</td><td>${purchase?(r.supplier||r.party_name):(r.customer||r.party_name)}</td><td>${fmtMoney2.format(Number(r.total||r.total_amount||0))}</td><td>${fmtDate(purchase?(r.expected||r.expected_or_ship_date):(r.due||r.expected_or_ship_date))}</td><td>${statusPill(r.status)}</td></tr>`).join('')}</tbody></table></div>`}
function renderOrders(kind){const purchase=kind==='purchase';setHeading('Orders',purchase?'Purchase Orders':'Sales Orders');const rows=purchase?data.purchaseOrders:data.salesOrders;return `<div class="page-stack"><div class="hero-row"><div class="hero-copy"><h2>${purchase?'Purchasing pipeline':'Customer fulfillment'}</h2><p>${purchase?'Real vendor orders will appear here.':'Real customer orders will appear here.'}</p></div>${livePending('Orders')}</div><section class="metric-grid">${metric('Open orders')}${metric(purchase?'In transit':'Due today')}${metric(purchase?'Partial receipts':'Committed stock')}${metric('Open value')}</section><section class="panel">${ordersTable(rows,purchase)}</section></div>`}

function renderReceiving(){setHeading('Warehouse','Receiving');return `<div class="page-stack"><div class="hero-row"><div class="hero-copy"><h2>Receive → count → place</h2><p>Receiving will use real open purchase-order lines and save each confirmed physical placement to the backend.</p></div>${livePending('Receiving')}</div>${panel('Receiving queue','No fake receiving jobs are shown.',emptyState('No live purchase orders loaded','Connect the receiving API to start or resume a real receipt.'))}</div>`}
function renderShipping(){setHeading('Warehouse','Shipping');return `<div class="page-stack"><div class="hero-row"><div class="hero-copy"><h2>Fulfill from actual storage</h2><p>Shipping will show real sales-order requirements and real available product + lot + location balances.</p></div>${livePending('Shipping')}</div>${panel('Shipping queue','No fake sales orders or stock selections are shown.',emptyState('No live shipping queue loaded','Connect the shipping API to select actual source locations.'))}</div>`}
function renderInventory(){setHeading('Warehouse','Inventory');return `<div class="page-stack"><div class="hero-row"><div class="hero-copy"><h2>Inventory</h2><p>Inventory will load from PRODUCTS, LOTS, LOCATIONS and INVENTORY_BALANCES.</p></div>${livePending('Inventory')}</div>${panel('Current inventory','No fallback inventory is displayed.',emptyState('Live inventory backend not connected','Once connected, this page will show the complete product master including zero-stock products.'))}</div>`}
function renderPacking(){setHeading('Warehouse','Packing Area');return `<div class="page-stack"><div class="hero-row"><div class="hero-copy"><h2>Packing Area</h2><p>Real inventory temporarily staged in PACKING will appear here.</p></div>${livePending('Packing')}</div>${panel('Current in Packing','MOVE changes location; PACKING_DEDUCT reduces company inventory.',emptyState('No live packing balances loaded','Connect the warehouse transaction API to use Packing.'))}</div>`}
function renderReplenishment(){setHeading('Planning','Replenishment');return `<div class="page-stack"><div class="hero-row"><div class="hero-copy"><h2>Replenishment</h2><p>Suggested purchases will come from OPERATIONS_METRICS, not browser calculations or sample products.</p></div>${livePending('Planning')}</div><section class="metric-grid">${metric('Reorder alerts')}${metric('Suggested buy')}${metric('Incoming')}${metric('At-risk value')}</section>${panel('Purchase priorities','Waiting for the live read model.',emptyState('No live replenishment data loaded','Connect OPERATIONS_METRICS to populate this queue.'))}</div>`}
function renderProducts(){setHeading('Master Data','Products');return `<div class="page-stack"><div class="hero-row"><div class="hero-copy"><h2>Product master</h2><p>All active products will come from PRODUCTS and PRODUCT_UNITS.</p></div>${livePending('Products')}</div>${panel('Products','No sample catalog is displayed.',emptyState('No live product master loaded','Connect the product read API to search and edit the real catalog.'))}</div>`}
function renderParties(){setHeading('Master Data','Customers & Vendors');return `<div class="page-stack"><div class="hero-row"><div class="hero-copy"><h2>Customers & Vendors</h2><p>Accounts will come from PARTIES.</p></div>${livePending('Parties')}</div>${panel('Business directory','No sample customers or vendors are displayed.',emptyState('No live parties loaded','Connect the parties API to populate this directory.'))}</div>`}
function renderAnalytics(){setHeading('Intelligence','Analytics');return `<div class="page-stack"><div class="hero-row"><div class="hero-copy"><h2>Analytics</h2><p>Management metrics will come from the formula-backed read models.</p></div>${livePending('Analytics')}</div><section class="metric-grid">${metric('Revenue · 30d')}${metric('Gross profit')}${metric('Gross margin')}${metric('Inventory value')}</section>${panel('Analysis','No generated chart uses invented values.',emptyState('No live analytics loaded','Connect SALES_METRICS, SHOPIFY_METRICS, PRODUCT_COSTS and OPERATIONS_METRICS.'))}</div>`}
function renderScanner(){setHeading('Tools','Scanner');return `<div class="page-stack"><div class="hero-copy"><h2>Scanner</h2><p>Scanner UI is available, but lookup results will not be invented.</p></div><section class="panel panel-pad" style="max-width:720px"><div class="field"><label>Scan value</label><input id="scanInput" autofocus placeholder="Scan barcode / QR code here"></div><div id="scanResult" class="notice-banner" style="margin-top:12px">Live scanner lookup is not connected.</div></section></div>`}
function renderAdmin(){setHeading('System','Admin');return `<div class="page-stack"><div class="hero-row"><div class="hero-copy"><h2>System administration</h2><p>User, permission and warehouse configuration screens are waiting for the live backend.</p></div>${livePending('Admin')}</div><section class="grid-3">${panel('Users','USERS table',emptyState('Not connected','Real user administration will load here.'))}${panel('Warehouse','LOCATIONS table',emptyState('Not connected','Real location configuration will load here.'))}${panel('Preferences','Operational settings',emptyState('Not connected','No placeholder thresholds are being shown.'))}</section></div>`}

function renderPage(){const view=document.getElementById('pageView');const renders={overview:renderOverview,purchase:()=>renderOrders('purchase'),sales:()=>renderOrders('sales'),receiving:renderReceiving,shipping:renderShipping,inventory:renderInventory,packing:renderPacking,replenishment:renderReplenishment,products:renderProducts,parties:renderParties,analytics:renderAnalytics,scanner:renderScanner,admin:renderAdmin};view.innerHTML=(renders[state.page]||renderOverview)();bindPageInteractions()}

function bindPageInteractions(){
  document.querySelectorAll('[data-nav-jump]').forEach(b=>b.onclick=()=>navigate(b.dataset.navJump));
  const scan=document.getElementById('scanInput');if(scan)scan.oninput=()=>{document.getElementById('scanResult').textContent=scan.value?'Live lookup is not connected. No result was assumed.':'Live scanner lookup is not connected.'};
}
function openDrawer(eyebrow,title,html){document.getElementById('drawerEyebrow').textContent=eyebrow;document.getElementById('drawerTitle').textContent=title;document.getElementById('drawerBody').innerHTML=html;document.getElementById('detailDrawer').hidden=false;document.body.style.overflow='hidden';document.querySelectorAll('[data-close-drawer]').forEach(b=>b.onclick=closeDrawer)}
function closeDrawer(){document.getElementById('detailDrawer').hidden=true;document.body.style.overflow=''}
function openSimpleDrawer(eyebrow,title,html){openDrawer(eyebrow,title,html)}
function openRecord(){toast('Live record details are not connected yet.')}
function openRackSpace(id){openDrawer('LOCATION',id,emptyState('Live location contents not loaded','No product, lot or quantity is being assumed for this space.'))}
function openCreate(type){openDrawer('NOT CONNECTED','Create '+titleCase(type),emptyState('Live write not connected','This action is disabled until the authenticated P2 backend is ready.'))}
function toast(msg){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove('show'),2200)}
function globalSearch(){toast('Global search will activate with live orders, products, lots and parties.')}

document.getElementById('globalSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter')globalSearch()});
document.getElementById('densityToggle')?.addEventListener('click',()=>{state.compact=!state.compact;document.body.classList.toggle('compact',state.compact);toast(state.compact?'Compact table density':'Comfortable table density')});
document.getElementById('quickCreate')?.addEventListener('click',()=>openDrawer('NOT CONNECTED','Create new',emptyState('Live writes are disabled','Order, product and party creation will be enabled only after the authenticated backend is connected.')));
document.getElementById('notifyButton')?.addEventListener('click',()=>openDrawer('NOTIFICATIONS','Needs Attention',emptyState('No live alerts loaded','Notifications will come from real operational exceptions.')));

const initial=location.hash.replace('#','');
if(navSections.some(([,items])=>items.some(([id])=>id===initial)))state.page=initial;
window.addEventListener('hashchange',()=>{const page=location.hash.replace('#','');if(page&&page!==state.page){state.page=page;renderNav();renderPage()}});
renderNav();renderPage();
