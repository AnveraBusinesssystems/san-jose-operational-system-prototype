(() => {
  const usedInvoices = new Set(['INV-22698','INV-22697','INV-22694','BILL-22713','BILL-22709']);
  const salesLots = {
    'Chile Ancho': ['MX-A4832 · R12-L1-F · 800 LB','MX-A4920 · R15-L2-M · 1,100 LB'],
    'Jamaica Flor': ['JAL-7741 · R08-L2-F · 900 LB'],
    'Tamarindo Entero': ['TM-5510 · R13-L1-F · 1,000 LB'],
    'Frijol Peruano': ['FP-6621 · R18-L3-M · 1,500 LB'],
    'Ciruela Pasa': ['CP-2218 · R22-L1-B · 500 LB']
  };
  const productDefaults = {
    'Chile Ancho': { unit:'CASE', per:25, price:64.50, cost:52.75 },
    'Jamaica Flor': { unit:'BAG', per:25, price:60.50, cost:45.75 },
    'Tamarindo Entero': { unit:'BAG', per:25, price:34.50, cost:27.25 },
    'Frijol Peruano': { unit:'BAG', per:5, price:7.95, cost:6.10 },
    'Ciruela Pasa': { unit:'BOX', per:20, price:53.60, cost:48.40 }
  };

  function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function money(v){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v)||0)}
  function productOptions(selected='Chile Ancho'){return Object.keys(productDefaults).map(p=>`<option ${p===selected?'selected':''}>${esc(p)}</option>`).join('')}
  function salesLotOptions(product){return (salesLots[product]||[]).map(l=>`<option>${esc(l)}</option>`).join('')}

  function lineTemplate(type,index,product='Chile Ancho'){
    const purchase=type==='purchase', d=productDefaults[product]||productDefaults['Chile Ancho'];
    return `<article class="order-line" data-order-line>
      <div class="order-line-top"><strong>Product ${index+1}</strong><button type="button" class="line-remove" data-remove-line aria-label="Remove product line">×</button></div>
      <div class="order-line-grid">
        <div class="field product-cell"><label>Product</label><select data-line-product>${productOptions(product)}</select></div>
        <div class="field"><label>Quantity</label><input data-line-qty type="number" min="0" step="1" value="24"></div>
        <div class="field"><label>Unit</label><select data-line-unit><option ${d.unit==='CASE'?'selected':''}>CASE</option><option ${d.unit==='BAG'?'selected':''}>BAG</option><option ${d.unit==='BOX'?'selected':''}>BOX</option><option ${d.unit==='PALLET'?'selected':''}>PALLET</option><option ${d.unit==='LB'?'selected':''}>LB</option></select></div>
        <div class="field" data-per-unit-field><label>LB / Unit</label><input data-line-per type="number" min="0" step="0.01" value="${d.per}"></div>
        <div class="field"><label>${purchase?'Unit Cost':'Unit Price'}</label><input data-line-price type="number" min="0" step="0.01" value="${purchase?d.cost:d.price}"></div>
        <div class="field lot-cell"><label>${purchase?'Supplier Lot #':'Inventory Lot'}</label>${purchase?'<input data-line-lot placeholder="Enter supplier lot #" value="MX-A5018">':`<select data-line-lot>${salesLotOptions(product)}</select>`}</div>
      </div>
      <div class="order-line-summary"><span data-line-equation></span><strong data-line-total></strong></div>
    </article>`;
  }

  function orderMarkup(type){
    const purchase=type==='purchase';
    return `<div class="order-builder" data-smart-order="${type}">
      <section class="drawer-section">
        <div class="order-header-grid">
          <div class="field"><label>${purchase?'Supplier':'Customer'}</label><select><option>${purchase?'El Mexicano Foods':'Mercado La Estrella'}</option><option>${purchase?'La Costeña USA':'Publico General'}</option><option>${purchase?'Goya Foods':'Fiesta Foods Houston'}</option></select></div>
          <div class="field"><label>Order Date</label><input type="date" value="2026-08-08"></div>
          <div class="field"><label>${purchase?'Expected Delivery':'Requested Delivery'}</label><input type="date" value="2026-08-11"></div>
          <div class="field invoice-field"><label>${purchase?'Vendor Invoice / Bill #':'Invoice #'}</label><input class="invoice-input" data-invoice-number placeholder="${purchase?'BILL-22715':'INV-22699'}"><div class="invoice-state" data-invoice-state>Must be unique.</div></div>
        </div>
      </section>
      <section class="drawer-section"><div class="order-section-head"><div><h3>Products</h3><p>Record the selling/purchase unit and exactly how many pounds each unit represents.</p></div><button type="button" class="secondary-btn" data-add-line>+ Add Product</button></div><div class="order-lines" data-order-lines>${lineTemplate(type,0)}</div></section>
      <section class="drawer-section"><div class="order-foot-summary"><div><span>Total Weight</span><strong data-order-weight>0 LB</strong></div><div><span>Subtotal</span><strong data-order-subtotal>$0.00</strong></div><div><span>Tax</span><strong>$0.00</strong></div><div class="grand"><span>Total</span><strong data-order-total>$0.00</strong></div></div></section>
      <div class="drawer-actions"><button type="button" class="primary-btn" data-create-smart disabled>${purchase?'Create Purchase Order':'Create Sales Order'}</button><button type="button" class="secondary-btn" data-save-smart>Save Draft</button></div>
    </div>`;
  }

  function attachLine(line,type){
    const product=line.querySelector('[data-line-product]'), unit=line.querySelector('[data-line-unit]'), perField=line.querySelector('[data-per-unit-field]'), per=line.querySelector('[data-line-per]'), price=line.querySelector('[data-line-price]'), lot=line.querySelector('[data-line-lot]');
    const syncProduct=()=>{
      const d=productDefaults[product.value]; if(!d)return;
      unit.value=d.unit; per.value=d.per; price.value=type==='purchase'?d.cost:d.price;
      if(type==='sales'&&lot){lot.innerHTML=salesLotOptions(product.value)}
      syncUnit(); updateTotals(line.closest('[data-smart-order]'));
    };
    const syncUnit=()=>{const isLb=unit.value==='LB'; perField.hidden=isLb; if(isLb) per.value=1; updateTotals(line.closest('[data-smart-order]'))};
    product.addEventListener('change',syncProduct); unit.addEventListener('change',syncUnit);
    line.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',()=>updateTotals(line.closest('[data-smart-order]'))));
    line.querySelector('[data-remove-line]').addEventListener('click',()=>{line.remove();renumber(line.closest('[data-smart-order]'));updateTotals(line.closest('[data-smart-order]'))});
    syncUnit();
  }

  function renumber(root){root?.querySelectorAll('[data-order-line]').forEach((line,i)=>{const title=line.querySelector('.order-line-top strong');if(title)title.textContent=`Product ${i+1}`})}
  function updateTotals(root){if(!root)return;let lbs=0,subtotal=0;root.querySelectorAll('[data-order-line]').forEach(line=>{const qty=Number(line.querySelector('[data-line-qty]')?.value||0),unit=line.querySelector('[data-line-unit]')?.value||'LB',per=unit==='LB'?1:Number(line.querySelector('[data-line-per]')?.value||0),price=Number(line.querySelector('[data-line-price]')?.value||0),lineLbs=qty*per,lineTotal=qty*price;lbs+=lineLbs;subtotal+=lineTotal;line.querySelector('[data-line-equation]').textContent=unit==='LB'?`${qty} LB total`:`${qty} ${unit.toLowerCase()} × ${per} LB = ${lineLbs.toLocaleString()} LB`;line.querySelector('[data-line-total]').textContent=money(lineTotal)});root.querySelector('[data-order-weight]').textContent=`${lbs.toLocaleString()} LB`;root.querySelector('[data-order-subtotal]').textContent=money(subtotal);root.querySelector('[data-order-total]').textContent=money(subtotal)}

  function bindInvoice(root){const input=root.querySelector('[data-invoice-number]'),state=root.querySelector('[data-invoice-state]'),create=root.querySelector('[data-create-smart]');if(!input)return;const check=()=>{const value=input.value.trim().toUpperCase();input.classList.remove('error','ok');state.className='invoice-state';if(!value){state.textContent='Must be unique.';create.disabled=true;return}if(usedInvoices.has(value)){input.classList.add('error');state.classList.add('error');state.textContent='This invoice number already exists.';create.disabled=true}else{input.classList.add('ok');state.classList.add('ok');state.textContent='Available invoice number.';create.disabled=false}};input.addEventListener('input',check);check()}

  function bindOrder(root,type){root.querySelectorAll('[data-order-line]').forEach(line=>attachLine(line,type));bindInvoice(root);updateTotals(root);root.querySelector('[data-add-line]')?.addEventListener('click',()=>{const wrap=root.querySelector('[data-order-lines]'),index=wrap.querySelectorAll('[data-order-line]').length;wrap.insertAdjacentHTML('beforeend',lineTemplate(type,index,'Jamaica Flor'));attachLine(wrap.lastElementChild,type);updateTotals(root)});root.querySelector('[data-save-smart]')?.addEventListener('click',()=>window.toast?.('Draft saved')||void 0);root.querySelector('[data-create-smart]')?.addEventListener('click',e=>{if(e.currentTarget.disabled)return;const invoice=root.querySelector('[data-invoice-number]').value.trim().toUpperCase();usedInvoices.add(invoice);window.toast?.(`${type==='purchase'?'Purchase':'Sales'} order created in mock mode`)||void 0;window.closeDrawer?.()})}

  function openSmartOrder(type){const drawer=document.getElementById('detailDrawer');drawer.classList.add('order-builder-mode');window.openDrawer(type==='purchase'?'NEW PURCHASE ORDER':'NEW SALES ORDER',type==='purchase'?'Create Purchase Order':'Create Sales Order',orderMarkup(type));const root=document.querySelector('[data-smart-order]');if(root)bindOrder(root,type)}

  const originalOpenCreate=window.openCreate;
  window.openCreate=function(type){if(type==='purchase'||type==='sales')return openSmartOrder(type);return originalOpenCreate(type)};
  const originalClose=window.closeDrawer;
  window.closeDrawer=function(){document.getElementById('detailDrawer')?.classList.remove('order-builder-mode');return originalClose()};
})();
