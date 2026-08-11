(() => {
  const icon=(name)=>({
    home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8"></path><path d="M5 10v10h14V10"></path><path d="M9 20v-6h6v6"></path></svg>',
    receive:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 20h14"></path></svg>',
    inventory:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"></path><path d="M4 10h16"></path><path d="M9 5v14"></path><path d="M15 5v14"></path></svg>',
    ship:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V9"></path><path d="m7 14 5-5 5 5"></path><path d="M5 4h14"></path></svg>',
    more:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle></svg>',
    purchase:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18H7z"></path><path d="M9 7h6M9 11h6M9 15h4"></path></svg>',
    sales:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16"></path><path d="m6 15 4-4 3 3 5-7"></path></svg>',
    packing:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 7 8-4 8 4-8 4z"></path><path d="M4 7v10l8 4 8-4V7"></path><path d="M12 11v10"></path></svg>',
    scanner:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"></path><path d="M8 9v6M11 9v6M14 9v6M17 9v6"></path></svg>',
    products:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"></path></svg>',
    analytics:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"></path></svg>',
    admin:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A7 7 0 0 0 15 6l-.3-2.6h-4L10.4 6A7 7 0 0 0 8.8 7L6.4 6l-2 3.4 2 1.5a7 7 0 0 0 0 2.2l-2 1.5 2 3.4 2.4-1A7 7 0 0 0 10.4 18l.3 2.6h4L15 18a7 7 0 0 0 1.6-1l2.4 1 2-3.4-2-1.5c.1-.4.1-.7.1-1.1z"></path></svg>',
    replenishment:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-6V1"></path><path d="M20 7a8 8 0 1 0 1 8"></path></svg>',
    parties:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"></circle><path d="M3 20c0-4 2-6 6-6s6 2 6 6"></path><circle cx="17" cy="9" r="2"></circle><path d="M16 14c3 0 5 2 5 5"></path></svg>'
  }[name]||'');

  const tabs=[
    {page:'overview',label:'Home',icon:'home'},
    {page:'receiving',label:'Receive',icon:'receive'},
    {page:'inventory',label:'Inventory',icon:'inventory'},
    {page:'shipping',label:'Ship',icon:'ship'},
    {page:'more',label:'More',icon:'more'}
  ];
  const moreItems=[
    ['purchase','purchase','Purchase Orders'],['sales','sales','Sales Orders'],['packing','packing','Packing Area'],['scanner','scanner','Scanner'],
    ['replenishment','replenishment','Replenishment'],['products','products','Products'],['parties','parties','Customers & Vendors'],['analytics','analytics','Analytics'],['admin','admin','Admin']
  ];

  function isMobile(){return window.matchMedia('(max-width:820px)').matches;}
  function ensureShell(){
    if(!document.querySelector('.mobile-top-brand')){
      const heading=document.querySelector('.topbar .page-heading');
      if(heading){const brand=document.createElement('div');brand.className='mobile-top-brand';brand.innerHTML='<img src="./logo_San_Jose.png" alt="San Jose">';heading.parentNode.insertBefore(brand,heading);}
    }
    if(!document.getElementById('mobileBottomNav')){
      const nav=document.createElement('nav');nav.id='mobileBottomNav';nav.className='mobile-bottom-nav';nav.setAttribute('aria-label','Mobile navigation');document.body.appendChild(nav);
    }
    if(!document.getElementById('mobileMoreSheet')){
      const sheet=document.createElement('aside');sheet.id='mobileMoreSheet';sheet.className='mobile-more-sheet';sheet.hidden=true;sheet.innerHTML=`<button class="mobile-more-backdrop" data-mobile-more-close aria-label="Close menu"></button><section class="mobile-more-panel"><div class="mobile-more-handle"></div><header class="mobile-more-head"><div><strong>More</strong><span>San Jose Operations</span></div><button class="mobile-more-close" data-mobile-more-close type="button" aria-label="Close menu">×</button></header><div class="mobile-more-grid" id="mobileMoreGrid"></div></section>`;document.body.appendChild(sheet);
      sheet.querySelectorAll('[data-mobile-more-close]').forEach(b=>b.addEventListener('click',closeMore));
    }
  }
  function currentPage(){return window.state?.page||location.hash.replace('#','')||'overview';}
  function render(){
    if(!isMobile())return;ensureShell();const page=currentPage(),nav=document.getElementById('mobileBottomNav');
    nav.innerHTML=tabs.map(t=>`<button class="mobile-nav-btn ${t.page===page?'active':''}" type="button" data-mobile-page="${t.page}">${icon(t.icon)}<span>${t.label}</span></button>`).join('');
    nav.querySelectorAll('[data-mobile-page]').forEach(btn=>btn.addEventListener('click',()=>{const pageId=btn.dataset.mobilePage;if(pageId==='more'){openMore();return;}if(typeof window.navigate==='function')window.navigate(pageId);else location.hash=pageId;closeMore();setTimeout(render,0);}));
    const grid=document.getElementById('mobileMoreGrid');if(grid){grid.innerHTML=moreItems.map(([id,ic,label])=>`<button type="button" class="mobile-more-item ${id===page?'active':''}" data-mobile-more-page="${id}">${icon(ic)}<span>${label}</span></button>`).join('');grid.querySelectorAll('[data-mobile-more-page]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.mobileMorePage;closeMore();if(typeof window.navigate==='function')window.navigate(id);else location.hash=id;setTimeout(render,0);}));}
  }
  function openMore(){ensureShell();const sheet=document.getElementById('mobileMoreSheet');sheet.hidden=false;document.body.classList.add('mobile-menu-open');render();}
  function closeMore(){const sheet=document.getElementById('mobileMoreSheet');if(sheet)sheet.hidden=true;document.body.classList.remove('mobile-menu-open');}
  const originalRenderNav=window.renderNav;
  if(typeof originalRenderNav==='function')window.renderNav=function(){const result=originalRenderNav.apply(this,arguments);setTimeout(render,0);return result;};
  window.addEventListener('hashchange',()=>setTimeout(render,0));window.addEventListener('resize',()=>{if(isMobile())render();else closeMore();});
  document.addEventListener('DOMContentLoaded',render);setTimeout(render,0);
})();
