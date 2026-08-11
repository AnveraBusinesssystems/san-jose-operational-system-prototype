(() => {
  function esc(value){return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function weekRange(){
    const now=new Date();
    const day=now.getDay();
    const monday=new Date(now);
    if(day===0) monday.setDate(now.getDate()-6); else monday.setDate(now.getDate()-(day-1));
    monday.setHours(0,0,0,0);
    const saturday=new Date(monday); saturday.setDate(monday.getDate()+5); saturday.setHours(23,59,59,999);
    const f=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    return `${f(monday)}–${f(saturday)}`;
  }
  function updatedLabel(){return new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});}
  function kpi(label,note,jump){return `<article class="overview-kpi"><span>${esc(label)}</span><strong>—</strong><small>${esc(note)}</small>${jump?`<button type="button" data-nav-jump="${esc(jump)}" aria-label="Open ${esc(label)}"></button>`:''}</article>`;}
  function finance(label,note){return `<div class="financial-item"><span>${esc(label)}</span><strong>—</strong><small>${esc(note)}</small></div>`;}
  function monthChart(){
    const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `<section class="monthly-panel"><header class="monthly-head"><div><h3>Monthly Performance</h3><p>Revenue vs cost of goods sold · current year</p></div><div class="monthly-legend"><span><i class="rev"></i>Revenue</span><span><i class="cogs"></i>COGS</span></div></header><div class="monthly-chart-placeholder" style="position:relative">${months.map(m=>`<div class="month-placeholder"><div class="month-bars"><i class="month-bar"></i><i class="month-bar"></i></div><b>${m}</b></div>`).join('')}<div class="monthly-empty-note">Waiting for live monthly financial data</div></div></section>`;
  }
  function empty(title,text){return `<div class="overview-empty"><strong>${esc(title)}</strong><span>${esc(text)}</span></div>`;}
  function flow(label,note,jump){return `<button class="flow-item" type="button" data-nav-jump="${jump}"><span>${esc(label)}</span><strong>—</strong><small>${esc(note)}</small></button>`;}

  window.renderOverview=function(){
    setHeading('Overview','Operations Center');
    return `<div class="overview-page">
      <section class="overview-hero"><div><h2>Operations Center</h2><p>Warehouse, orders and financial position at a glance.</p></div><div class="overview-live"><i></i>LIVE VIEW · ${updatedLabel()}</div></section>

      <section class="overview-kpi-grid">
        ${kpi('Inventory Value','Current inventory valuation','inventory')}
        ${kpi("This Week's Sales",`${weekRange()} · Monday–Saturday`,'sales')}
        ${kpi("This Week's Purchases",`${weekRange()} · Monday–Saturday`,'purchase')}
        ${kpi('Rack Occupancy','Occupied rack spaces / 450','inventory')}
      </section>

      <div class="overview-section-label">Financial Snapshot</div>
      <section class="financial-strip">
        ${finance('Owed to Us','Outstanding customer balances')}
        ${finance('We Owe','Outstanding vendor balances')}
        ${finance('YTD Sales','January 1 through today')}
        ${finance('YTD Purchases','January 1 through today')}
      </section>

      ${monthChart()}

      <section class="overview-two-col">
        <section class="overview-panel"><header class="overview-panel-head"><div><h3>Needs Attention</h3><p>Only operational items that require review or action</p></div></header>${empty('No alert data connected yet','Overdue orders, receiving delays, reorder conditions, inventory corrections and expiration risks will appear here.')}</section>
        <section class="overview-panel"><header class="overview-panel-head"><div><h3>Today's Work</h3><p>Receiving, shipping, counts and packing work</p></div></header>${empty('No task data connected yet','Live warehouse tasks will appear here once the workflow APIs are connected.')}</section>
      </section>

      <section class="overview-panel"><header class="overview-panel-head"><div><h3>Quick Actions</h3><p>Jump directly into the main operating workflows</p></div></header><div style="padding:12px"><div class="quick-actions"><button class="quick-action" type="button" data-nav-jump="purchase">+ Purchase Order</button><button class="quick-action" type="button" data-nav-jump="sales">+ Sales Order</button><button class="quick-action" type="button" data-nav-jump="receiving">Receive</button><button class="quick-action" type="button" data-nav-jump="shipping">Ship</button></div></div></section>

      <section class="overview-panel"><header class="overview-panel-head"><div><h3>Operational Flow</h3><p>Purchasing → receiving → warehouse → shipping</p></div></header><div class="flow-grid">${flow('PURCHASES','Awaiting receipt','purchase')}${flow('RECEIVING','Active / waiting','receiving')}${flow('WAREHOUSE','Occupied rack spaces','inventory')}${flow('SHIPPING','Orders remaining','shipping')}</div></section>

      <section class="overview-panel"><header class="overview-panel-head"><div><h3>Recent Activity</h3><p>Latest operational changes across the system</p></div></header>${empty('No activity feed connected yet','Inventory movements, receipts, shipments and order actions will appear here with user and time.')}</section>
    </div>`;
  };

  if((location.hash.replace('#','')||'overview')==='overview' && typeof window.renderPage==='function') window.renderPage();
})();
