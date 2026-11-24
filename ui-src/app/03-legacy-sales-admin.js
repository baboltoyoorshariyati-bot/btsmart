async function refreshSalesTab(tab){
  const role=normalizeRole(app.user?.roleCode);
  if(role!=='sales' && role!=='admin') return;
  try{
    if(app.page!=='sales' || app.sub.sales!==tab) return;
    if(tab==='intake'){
      const visits=(await api('/api/visits')).visits||[];
      const list=$('#salesVisitList');
      if(list && !$('#orderEntryPage')) list.innerHTML=salesVisitRows(visits.filter(v=>v.status==='WAITING_SALES'));
    } else if(tab==='orders'){
      const orders=(await api('/api/orders')).orders||[];
      const body=$('.sales-orders-body');
      if(body) body.innerHTML=renderSalesOrdersBody(orders.filter(o=>['WAREHOUSE_PENDING','RETURNED_TO_SALES'].includes(o.status)));
    } else if(tab==='settlement'){
      const orders=(await api('/api/orders')).orders||[];
      const active=orders.filter(o=>o.status==='SETTLEMENT_PENDING');
      const wrap=$('.settlement-queue-list');
      if(wrap) wrap.innerHTML=active.map(o=>`<button class=\"settlement-queue-row\" data-action=\"select-settlement\" data-id=\"${o.id}\"><div class=\"sq-leading\"><span class=\"sq-number\">${esc(fa(o.orderNo||'—'))}</span><div><strong>${esc(storeAwareOrderName(o))}</strong><span>${plateViewHtml(o.customer?.plate, 'بدون پلاک', true)} • ${esc(storeAwareOrderPhone(o))}</div></div><div class=\"sq-middle\"><span>${qty(o.items.filter(i=>i.itemStatus!=='CANCELLED').length)} قلم</span><span>تحویل ${dt(o.updatedAt||o.createdAt)}</div><div class=\"sq-action\"><span class=\"badge blue\">آماده تسویه</span>${icon('arrow',18)}</div></button>`).join('')||'<div class=\"empty\">سفارشی برای تسویه وجود ندارد.</div>';
    }
    await refreshIndicators();
  }catch{}
}
function htmlToElement(html){const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild||document.createElement('div')}
function renderSalesIntake(visits){return `<div class="workspace-grid"><section class="card workspace-card"><div class="panel-head"><div><span class="eyebrow">SALES INTAKE</span><h2>مراجعه‌کنندگان منتظر ثبت سفارش</h2><p>برای هر مراجعه‌کننده، سفارش در یک فرم مستقل و واضح ثبت می‌شود.</p></div><div class="toolbar"><span class="count-chip">${qty(visits.length)}</div></div><div class="field section-space"><div class="input-shell"><span>${icon('search',17)}</span><input id="salesSearch" placeholder="جستجوی نام، تلفن یا پلاک"></div></div><div id="salesVisitList" class="queue-list section-space">${salesVisitRows(visits)}</div></section></div>`}
function salesVisitRows(visits){return visits.map(v=>`<button class="queue-item" data-action="open-order" data-id="${v.id}"><div class="queue-main"><div class="queue-avatar">${esc(initials(v.customer?.name||''))}</div><div class="queue-copy"><strong>${esc(v.customer?.name||'—')}</strong><span>${plateViewHtml(v.customer?.plate, 'بدون پلاک', true)} • ${esc(v.customer?.phone||'')}</div></div><div class="queue-actions"><span class="subtle">ورود به فرم سفارش</span>${icon('arrow',16)}</div></button>`).join('')||'<div class="empty">مراجعه‌کننده منتظر سفارش وجود ندارد.</div>'}
// یک جست‌وجوی مستقل برای هر ردیف؛ پاسخ قدیمی نباید انتخاب جدید را بازنویسی کند.
const productSearchStates=new WeakMap();
function productPickerInfo(inp){
  if(inp.dataset.productSearch!==undefined){const i=inp.dataset.productSearch;return {box:$(`[data-suggest-for="${i}"]`),row:app.orderDraft?.[i]};}
  if(inp.dataset.opProductSearch!==undefined){const value=inp.dataset.opProductSearch,cut=value.lastIndexOf('-'),prefix=value.slice(0,cut),i=value.slice(cut+1);const key=({phone:'phoneDraft',remote:'remoteDraft',future:'futureDraft',store:'storeDraft',storeedit:'storeEditDraft',storeaddition:'storeAdditionDraft',sales:'orderDraft',onsite:'orderDraft'})[prefix];return {box:$(`[data-op-suggest="${value}"]`),row:app[key]?.[i]};}
  if(inp.dataset.returnProductSearch!==undefined){const i=inp.dataset.returnProductSearch;return {box:$(`[data-return-suggest="${i}"]`),row:app.returnEdit?.items?.[i]};}
  if(inp.dataset.ssProductSearch!==undefined){const i=inp.dataset.ssProductSearch;return {box:$(`[data-ss-suggest="${i}"]`),row:app.salesStoreEdit?.items?.[i]};}
  return null;
}
function searchProductOptions(inp,box,q,render){
  if(!inp||!box)return;let state=productSearchStates.get(inp)||{seq:0};clearTimeout(state.timer);state.seq++;const seq=state.seq;state.active=-1;state.pending=!!q.trim();state.chooseWhenReady=false;productSearchStates.set(inp,state);box.innerHTML='';inp.setAttribute('role','combobox');inp.setAttribute('aria-expanded','false');
  if(!q.trim())return;
  state.timer=setTimeout(async()=>{try{
    const d=await api('/api/products/search?q='+encodeURIComponent(q.trim()));
    if(state.seq!==seq||!inp.isConnected||inp.value!==q)return;
    box.innerHTML=(d.products||[]).map(render).join('')||'<div class="empty compact-empty">محصولی با این عبارت پیدا نشد.</div>';state.pending=false;inp.setAttribute('aria-expanded',String(!!box.querySelector('button')));
    if(state.chooseWhenReady&&document.activeElement===inp){const first=box.querySelector('button');if(first)first.click();else toast('محصولی پیدا نشد.');}
  }catch(e){if(state.seq===seq){box.innerHTML='';state.pending=false;if(state.chooseWhenReady)toast('خطا در جست‌وجوی محصول.');}}},180);
}
document.addEventListener('input',e=>{
  const inp=e.target;if(!inp?.dataset)return;const info=productPickerInfo(inp);if(!info)return;
  if(info.row){info.row.productId='';info.row.productLabel=inp.value;info.row.quickCode='';if(inp.dataset.productSearch!==undefined)updateOrderDraftSummary();else if(inp.dataset.opProductSearch!==undefined){const prefix=inp.dataset.opProductSearch.split('-')[0],key=({phone:'phoneDraft',remote:'remoteDraft',future:'futureDraft',store:'storeDraft'})[prefix];if(key)updateOpSummary(key,`${prefix}-summary`);}}
  const marker=inp.closest('.cell-product,.product-box')?.querySelector('.sd-picked-inline,.sd-picked,.v26-product-picked');if(marker){marker.textContent='هنوز محصول انتخاب نشده است';marker.classList.add('none');}
},true);
document.addEventListener('keydown',e=>{
  if(e.isComposing)return;const inp=e.target;if(!inp?.dataset)return;const info=productPickerInfo(inp);if(!info)return;
  const state=productSearchStates.get(inp),options=Array.from(info.box?.querySelectorAll('button')||[]);
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    if(!options.length)return;e.preventDefault();e.stopImmediatePropagation();const delta=e.key==='ArrowDown'?1:-1;
    state.active=state.active<0?(delta>0?0:options.length-1):(state.active+delta+options.length)%options.length;
    options.forEach((x,i)=>{x.classList.toggle('keyboard-active',i===state.active);x.setAttribute('aria-selected',String(i===state.active));});options[state.active].scrollIntoView?.({block:'nearest'});return;
  }
  if(e.key==='Escape'&&info.box){info.box.innerHTML='';inp.setAttribute('aria-expanded','false');if(state){state.seq++;state.pending=false;}return;}
  if(e.key==='Enter'&&(options.length||(!info.row?.productId&&inp.value.trim()))){
    e.preventDefault();e.stopImmediatePropagation();if(options.length)options[state?.active>=0?state.active:0].click();else if(state?.pending)state.chooseWhenReady=true;else toast('ابتدا محصولی از فهرست انتخاب کنید.');
  }
},true);
function productSearch(i,q){
  const inp=$(`[data-product-search="${i}"]`),box=$(`[data-suggest-for="${i}"]`);
  searchProductOptions(inp,box,q,p=>`<button type="button" class="product-option" data-action="pick-product" data-index="${i}" data-product-id="${esc(p.id)}" data-label="${esc(p.name)}" data-quick="${esc(p.quickCode)}"><span><b>${esc(p.name)}</b><span>${esc(p.quickCode)} • واحد پایه ${esc(p.defaultUnit)}</span></span>${icon('check',15)}</button>`);
}
function pickProduct(i,id,label,quick){const p=app.orderDraft[i];if(!p)return;p.productId=id;p.productLabel=label;p.quickCode=quick||'';const list=$(`[data-suggest-for="${i}"]`);if(list)list.innerHTML='';renderOrderLines();updateOrderDraftSummary();const qtyInput=$(`#orderLines [data-qty="${i}"]`);if(qtyInput){qtyInput.focus();qtyInput.select?.();}toast('محصول انتخاب شد.')}
function renderSalesOrders(orders){return `<section class="card card-pad sales-orders-container"><div class="panel-head"><div><span class="eyebrow">ORDER CONTROL</span><h2>سفارش‌های در جریان</h2><p>جزئیات کامل سفارش، وضعیت انبار و سفارش‌های برگشتی به فروش در این بخش قابل مشاهده است.</p></div><span class="pill"><span class="status-dot"></span> بروزرسانی زنده</span></div><div class="table-wrap section-space"><table class="table"><thead><tr><th>سفارش</th><th>مشتری</th><th>اقلام</th><th>وضعیت</th><th>زمان</th><th>عملیات</th></tr></thead><tbody class="sales-orders-body">${renderSalesOrdersBody(orders)}</tbody></table></div></section>`}
function renderSalesOrdersBody(orders){return orders.map(o=>`<tr><td><b style="color:var(--brand)">${esc(fa(o.orderNo||'—'))}</b></td><td><strong>${esc(storeAwareOrderName(o))}</strong><div class="subtle">${esc(storeAwareOrderPhone(o))}</div></td><td>${qty(o.items.filter(i=>i.itemStatus!=='CANCELLED').length)} قلم<div class="subtle">${qty(o.items.reduce((s,i)=>s+n(i.requestedQty),0))} واحد درخواستی</div></td><td>${badge(o.status)}</td><td>${dt(o.updatedAt||o.createdAt)}</td><td><div class="toolbar"><button class="btn btn-secondary btn-sm" data-action="order-details" data-id="${o.id}">${icon('eye',15)} جزئیات</button>${o.status==='RETURNED_TO_SALES'?`<button class="btn btn-secondary btn-sm" data-action="edit-returned-order" data-id="${o.id}">${icon('edit',15)} اصلاح سفارش</button><button class="btn btn-primary btn-sm" data-action="resubmit-order" data-id="${o.id}">${icon('arrow',15)} ارسال مجدد به انبار</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="6" class="empty">سفارشی در جریان نیست.</td></tr>'}
// The return message is separate from customer notes and survives line edits.
function warehouseReturnNoteHtml(o){
  const note=o?.status==='RETURNED_TO_SALES'&&o.warehouseReturn;
  if(!note?.reason)return '';
  const item=note.itemId?(o.items||[]).find(i=>i.id===note.itemId):null;
  return `<div class="warehouse-return-note"><b>پیام ارجاع به فروش${item?` — ${esc(item.product?.name||'قلم سفارش')}`:''}</b><span>${esc(note.reason)}</span></div>`;
}
async function openReturnedOrderEditor(id){
  try{
    const d=await api('/api/orders/'+id); const o=d.order;
    if(o.status!=='RETURNED_TO_SALES') return toast('این سفارش در وضعیت قابل اصلاح نیست.');
    app.returnEdit={orderId:id,orderType:o.orderType,deletedIds:[],items:(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').map(i=>({id:i.id,productId:i.productId,productLabel:i.product?.name||'',requestedQty:i.requestedQty,requestedUnit:i.requestedUnit,description:i.description||''}))};
    renderReturnedOrderEditor(o);
  }catch(e){toast(e.message)}
}
function renderReturnedOrderEditor(o){
  const items=app.returnEdit?.items||[];
  openModal('اصلاح سفارش برگشتی به فروش',`<div class="returned-editor"><div class="returned-editor-head"><div><span class="eyebrow">ORDER CORRECTION</span><h2>اصلاح سفارش ${esc(fa(o.orderNo||'—'))}</h2><p>${esc(storeAwareOrderName(o))} • ${esc(storeAwareOrderPhone(o))}</p></div><span class="badge orange">برگشتی از انبار</span></div>${warehouseReturnNoteHtml(o)}<div class="returned-editor-note">در این بخش می‌توانید محصول، مقدار، واحد و توضیحات هر ردیف را ویرایش کنید، ردیف جدید اضافه کنید یا ردیف موجود را حذف کنید. همه تغییرات با نام کاربر در سوابق فعالیت ثبت می‌شود.</div><div id="returnedEditLines" class="returned-edit-lines"></div><div class="returned-editor-bottom"><button class="btn btn-secondary btn-lg" data-action="returned-add-line">${icon('plus',17)} افزودن ردیف</button><span class="subtle">تعداد ردیف فعال: ${qty(items.length)}</div><div class="modal-actions"><button class="btn btn-secondary" data-action="close-modal">انصراف</button><button class="btn btn-primary btn-lg" data-action="save-returned-order" data-id="${esc(o.id)}">ذخیره اصلاحات</button></div></div>`);
  const modalCard=$('.modal-card'); if(modalCard) modalCard.classList.add('returned-modal-card');
  renderReturnedEditLines(o);
}
function renderReturnedEditLines(o){
  const box=$('#returnedEditLines'); if(!box)return;
  const items=app.returnEdit?.items||[];
  box.innerHTML=items.map((x,i)=>`<div class="returned-edit-row bt-product-row-v35 bt-returned-order-row-v35" data-edit-row="${i}"><div class="returned-edit-index">${fa(String(i+1))}</div><div class="order-field"><label>محصول</label><div class="input-shell input-xl"><span>${icon('search',16)}</span><input value="${esc(x.productLabel||'')}" data-return-product-search="${i}" placeholder="نام یا کد سریع" autocomplete="off"></div><div class="product-suggest" data-return-suggest="${i}"></div></div><div class="order-field"><label>مقدار درخواستی</label><div class="input-shell input-xl quantity-shell"><input data-return-qty="${i}" inputmode="decimal" type="number" min="0" step="0.001" value="${esc(x.requestedQty)}"></div></div><div class="order-field"><label>واحد</label><div class="input-shell input-xl"><select data-return-unit="${i}"><option ${x.requestedUnit==='کیلوگرم'?'selected':''}>کیلوگرم</option><option ${x.requestedUnit==='بسته'?'selected':''}>بسته</option><option ${x.requestedUnit==='عدد'?'selected':''}>عدد</option><option ${x.requestedUnit==='کارتن'?'selected':''}>کارتن</option></select></div></div><div class="order-field return-description-field"><label>توضیحات</label><div class="input-shell input-xl"><textarea data-return-description="${i}" rows="2" placeholder="توضیحات این ردیف...">${esc(x.description||'')}</textarea></div></div><button class="btn btn-ghost btn-sm returned-delete-btn" data-action="returned-delete-line" data-index="${i}" aria-label="حذف ردیف">${icon('trash',16)} حذف</button></div>`).join('') || '<div class="empty">قلمی برای اصلاح باقی نمانده است.</div>';
  $$('#returnedEditLines [data-return-product-search]').forEach(inp=>inp.addEventListener('input',()=>returnedProductSearch(Number(inp.dataset.returnProductSearch),inp.value)));
  $$('#returnedEditLines [data-return-qty]').forEach(inp=>inp.addEventListener('input',()=>{app.returnEdit.items[Number(inp.dataset.returnQty)].requestedQty=inp.value;}));
  $$('#returnedEditLines [data-return-unit]').forEach(sel=>sel.addEventListener('change',()=>{app.returnEdit.items[Number(sel.dataset.returnUnit)].requestedUnit=sel.value;}));
  $$('#returnedEditLines [data-return-description]').forEach(inp=>inp.addEventListener('input',()=>{app.returnEdit.items[Number(inp.dataset.returnDescription)].description=inp.value;}));
}
function returnedProductSearch(i,q){
  searchProductOptions($(`[data-return-product-search="${i}"]`),$(`[data-return-suggest="${i}"]`),q,p=>`<button type="button" class="product-option" data-action="pick-return-product" data-index="${i}" data-product-id="${esc(p.id)}" data-label="${esc(p.name)}"><span><b>${esc(p.name)}</b><span>${esc(p.defaultUnit)}</span></span>${icon('check',15)}</button>`);
}
function pickReturnedProduct(i,id,label){if(!app.returnEdit?.items?.[i])return;app.returnEdit.items[i].productId=id;app.returnEdit.items[i].productLabel=label;const inp=$(`[data-return-product-search="${i}"]`);if(inp)inp.value=label;const box=$(`[data-return-suggest="${i}"]`);if(box)box.innerHTML='';$(`[data-return-qty="${i}"]`)?.focus();}
function addReturnedLine(){app.returnEdit.items.push({id:null,productId:'',productLabel:'',requestedQty:'',requestedUnit:'کیلوگرم',description:''});const d={customer:{name:'',phone:''}};renderReturnedEditLines(d);toast('ردیف جدید اضافه شد.');}
async function deleteReturnedLine(i){const x=app.returnEdit?.items?.[i];if(!x)return;if(app.returnEdit.items.length<=1)return toast('حداقل یک قلم باید در سفارش باقی بماند.');if(x.id)app.returnEdit.deletedIds.push(x.id);app.returnEdit.items.splice(i,1);renderReturnedEditLines({});toast('ردیف برای حذف علامت‌گذاری شد؛ با ذخیره اصلاحات نهایی می‌شود.');}
function renderSettlement(orders){return `<section class="card card-pad settlement-queue-shell"><div class="settlement-queue-head"><div><span class="eyebrow">FINANCE DESK</span><h2>مرکز تسویه فروش</h2><p>هر سفارش در این مرحله با یک فرم مستقل و رسمی مشابه فاکتور تسویه می‌شود.</p></div><div class="settlement-queue-summary"><strong>${qty(orders.length)}</strong><span>سفارش آماده تسویه</span></div></div><div class="settlement-queue-list section-space">${orders.map(o=>`<button class="settlement-queue-row" data-action="select-settlement" data-id="${o.id}"><div class="sq-leading"><span class="sq-number">${esc(fa(o.orderNo||'—'))}</span><div><strong>${esc(storeAwareOrderName(o))}</strong><span>${plateViewHtml(o.customer?.plate, 'بدون پلاک', true)} • ${esc(storeAwareOrderPhone(o))}</div></div><div class="sq-middle"><span>${qty(o.items.filter(i=>i.itemStatus!=='CANCELLED').length)} قلم</span><span>تحویل ${dt(o.updatedAt||o.createdAt)}</div><div class="sq-action"><span class="badge blue">آماده تسویه</span>${icon('arrow',18)}</div></button>`).join('')||'<div class="empty">سفارشی برای تسویه وجود ندارد.</div>'}</div></section>`}
async function reopenSettlementToWarehouse(id){
  if(!confirm('این سفارش برای بررسی مجدد و آماده‌سازی دوباره به انبار ارجاع شود؟'))return;
  try{
    const r=await api('/api/orders/'+id+'/warehouse/reopen-preparing',{method:'POST',body:'{}'});
    toast('سفارش به مرحله آماده‌سازی انبار برگشت داده شد.');
    app.selectedSettlement=null;
    await renderSales('flow');
  }catch(e){toast(e.message)}
}
async function selectSettlement(id){
  try{
    const [d,priceData]=await Promise.all([api('/api/orders/'+id),api('/api/prices')]);
    const prices=priceData.prices||[]; const priceMap=Object.fromEntries(prices.map(x=>[x.productId,x.price]));
    app.selectedSettlement=id; app.settlementFingerprintRef=''; app.settlementNoFingerprintAllowed=true;
    app.settleDraft=(d.order.items||[]).map(i=>({...i,unitPrice:i.unitPrice||priceMap[i.productId]||0,cancelled:i.itemStatus==='CANCELLED'}));
    renderSettlementForm(d.order);
  }catch(e){toast(e.message)}
}
function totalSettlement(){return (app.settleDraft||[]).reduce((s,i)=>s+(i.cancelled?0:n(i.deliveredKg)*n(i.unitPrice)),0)}
function updateSettlementTotal(){(app.settleDraft||[]).forEach((i,idx)=>{const el=$(`[data-amount="${idx}"]`);if(el)el.textContent=money(i.cancelled?0:n(i.deliveredKg)*n(i.unitPrice))});const sub=$('#settleSubtotal');if(sub)sub.textContent=money(totalSettlement());const t=$('#settleTotal');if(t)t.textContent=money(totalSettlement())}
function bindSettlementFields(){
  $$('[data-price]').forEach(x=>{
    x.addEventListener('focus',()=>{if(n(x.value)===0){x.value='';}});
    x.addEventListener('input',()=>{
      const idx=Number(x.dataset.price);const numeric=n(x.value);
      app.settleDraft[idx].unitPrice=numeric;
      x.value=formatPriceInput(numeric);
      try{x.setSelectionRange(x.value.length,x.value.length)}catch{}
      updateSettlementTotal();
    });
    x.addEventListener('blur',()=>{x.value=formatPriceInput(app.settleDraft[Number(x.dataset.price)].unitPrice)});
  });
  $$('[data-cancel]').forEach(x=>x.addEventListener('change',()=>{app.settleDraft[Number(x.dataset.cancel)].cancelled=x.checked;updateSettlementTotal()}));
  $('#allowNoFingerprint')?.addEventListener('change',e=>{app.settlementNoFingerprintAllowed=e.target.checked;updateVerificationUI()});
}
function bindSettlementCanvas(){const c=$('#signatureCanvas');if(!c)return;const ctx=c.getContext('2d');const scale=Math.max(1,window.devicePixelRatio||1);const rect=c.getBoundingClientRect();c.width=Math.max(1,rect.width*scale);c.height=Math.max(1,rect.height*scale);ctx.scale(scale,scale);ctx.lineWidth=2.3;ctx.lineCap='round';ctx.strokeStyle='#1d222a';let down=false,last=null,strokes=0;const pos=e=>{const r=c.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};c.addEventListener('pointerdown',e=>{e.preventDefault();down=true;strokes++;last=pos(e);c.setPointerCapture?.(e.pointerId)});c.addEventListener('pointermove',e=>{if(!down)return;e.preventDefault();const p=pos(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;app.signature.has=true});c.addEventListener('pointerup',e=>{down=false;c.releasePointerCapture?.(e.pointerId)});c.addEventListener('pointercancel',()=>down=false);c.style.touchAction='none';app.signature={canvas:c,has:false}}
function updateVerificationUI(){
  const status=$('#fingerStatusBadge'), text=$('#fingerStatusText'), result=$('#fingerResult'), summary=$('#verificationSummary');
  const hasFp=!!app.settlementFingerprintRef;
  if(hasFp){ if(status){status.className='verify-badge success';status.textContent='احراز شد'} if(text)text.textContent='اثر انگشت با موفقیت ثبت شده است.'; if(result)result.textContent='مرجع احراز ثبت شد و در فاکتور نمایش داده می‌شود.'; if(summary)summary.textContent='اثر انگشت ثبت شد • آماده تایید'}
  else if(app.settlementNoFingerprintAllowed){if(status){status.className='verify-badge allowed';status.textContent='بدون اثر انگشت'}if(text)text.textContent='این تسویه با مجوز بدون اثر انگشت انجام می‌شود.';if(result)result.textContent='تسویه دستی فعال است.';if(summary)summary.textContent='امضا + مجوز بدون اثر انگشت'}
  else {if(status){status.className='verify-badge pending';status.textContent='نیازمند اثر انگشت'}if(text)text.textContent='برای نهایی‌سازی، احراز اثر انگشت لازم است.';if(result)result.textContent='اثر انگشت ثبت نشده است.';if(summary)summary.textContent='منتظر احراز اثر انگشت'}
}
async function fingerprintCapture(){toast('ثبت اثر انگشت موقتاً غیرفعال است.');}
function clearSignature(){const c=$('#signatureCanvas');const ctx=c?.getContext('2d');if(c&&ctx){ctx.clearRect(0,0,c.width,c.height);app.signature.has=false}updateVerificationUI()}
function renderInvoices(orders){return `<section class="card card-pad"><div class="panel-head"><div><span class="eyebrow">INVOICE CENTER</span><h2>فاکتورهای صادرشده</h2><p>نمایش، چاپ و پیگیری فاکتورهای نهایی</p></div><span class="pill">${qty(orders.length)} فاکتور</span></div><div class="table-wrap section-space"><table class="table"><thead><tr><th>شماره فاکتور</th><th>مشتری</th><th>پلاک</th><th>مبلغ</th><th>اطلاعات</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${orders.flatMap(o=>(o.payments&&o.payments.length>1?o.payments:[o.payment]).filter(Boolean).map(pay=>{const run=pay.deliveryRun||null;return `<tr><td><b style="color:var(--brand)">${esc(fa(pay.invoiceNumber||'—'))}${run?` <span class="st-run-chip st-run-r${run}">سرویس ${run===2?'دوم':'اول'}</span>`:''}</b></td><td>${esc(storeAwareOrderName(o))}</td><td>${plateViewHtml(o.customer?.plate, 'بدون پلاک', true)}</td><td>${o.orderType==='STORE'?'سند وزنی — بدون مبلغ':money(pay.totalAmount)}</td><td>${verificationBadges(pay)}</td><td>${badge(o.status)}</td><td><div class="toolbar"><button class="btn btn-secondary btn-sm" data-action="invoice" data-id="${o.id}"${run?` data-run="${run}"`:''}>${icon('eye',15)} مشاهده</button><button class="btn btn-primary btn-sm" data-action="print-invoice" data-id="${o.id}"${run?` data-run="${run}"`:''}>${icon('receipt',15)} چاپ</button></div></td></tr>`})).join('')||'<tr><td colspan="7" class="empty">فاکتور نهایی ندارید.</td></tr>'}</tbody></table></div></section>`}
function verificationBadges(p){return p ? '<span class="mini-verify">اطلاعات مشتری</span>' : '—';}
function bindSales(tab){$('#content').onclick=async e=>{const sub=e.target.closest('[data-sub]');if(sub){const [k,v]=sub.dataset.sub.split(':');app.sub[k]=v;await renderSales(v);return}const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;if(a==='open-order')return openOrder(el.dataset.id);if(a==='back-order-intake'){app.orderDraft=[];return renderSales('onsite');}if(a==='order-details')return openOrderDetails(el.dataset.id);if(a==='edit-returned-order')return openReturnedOrderEditor(el.dataset.id);if(a==='resubmit-order')return resubmitOrder(el.dataset.id);if(a==='add-line'){app.orderDraft.push({productId:'',requestedQty:'',requestedUnit:'کیلوگرم',description:''});renderOrderLines();return}if(a==='remove-line'){app.orderDraft.splice(Number(el.dataset.index),1);if(!app.orderDraft.length)app.orderDraft=[{productId:'',requestedQty:'',requestedUnit:'کیلوگرم',description:''}];renderOrderLines();return}if(a==='pick-product'){return pickProduct(Number(el.dataset.index),el.dataset.productId,el.dataset.label)}if(a==='submit-order')return submitOrder(el.dataset.id);if(a==='select-settlement')return selectSettlement(el.dataset.id);if(a==='back-settlement')return renderSales('settlement');if(a==='final-settle')return finalSettle(el.dataset.id);if(a==='fingerprint-capture')return fingerprintCapture();if(a==='clear-signature'){clearSignature();return}if(a==='invoice')return previewInvoice(el.dataset.id,Number(el.dataset.run)||null);if(a==='print-invoice')return printInvoice(el.dataset.id,Number(el.dataset.run)||null)};
  const search=$('#salesSearch');if(search)search.addEventListener('input',async()=>{const q=search.value.trim().toLowerCase();const visits=(await api('/api/visits')).visits||[];const filtered=visits.filter(v=>v.status==='WAITING_SALES' && [v.customer?.name,v.customer?.phone,v.customer?.plate].some(x=>String(x||'').toLowerCase().includes(q)));$('#salesVisitList').innerHTML=salesVisitRows(filtered)});
}

/* ---------- Warehouse ---------- */
function warehouseRows(orders){return orders.map(o=>`<button class="warehouse-item ${app.selectedWarehouse===o.id?'selected':''}" data-action="open-warehouse" data-id="${o.id}"><div class="warehouse-top"><strong>${esc(storeAwareOrderName(o))}</strong>${badge(o.status)}</div><div class="warehouse-meta">${plateViewHtml(o.customer?.plate, 'بدون پلاک', true)} • ${qty(o.items.filter(i=>i.itemStatus!=='CANCELLED').length)} قلم • ${dt(o.createdAt)}</div></button>`).join('')||'<div class="empty">سفارش جدیدی در صف انبار نیست.</div>'}
async function fetchWarehouseLive(){try{const orders=(await api('/api/orders?status=WAREHOUSE_PENDING')).orders||[];const list=$('#warehouseList');if(!list)return;list.innerHTML=warehouseRows(orders);if(app.selectedWarehouse&&!orders.find(o=>o.id===app.selectedWarehouse)){app.selectedWarehouse=null;$('#warehouseEditor').innerHTML='<div class="empty"><strong style="display:block;color:var(--ink-2);font-size:19px">صف انبار به‌روز شد</strong><span>این سفارش دیگر در صف انبار نیست.</span></div>'}}catch(e){} }
function renderWarehouseEditor(o){
  const activeItems=(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED');
  const rows=activeItems.map((i,k)=>`<article class="warehouse-delivery-card" data-warehouse-item-card="${i.id}"><div class="warehouse-delivery-index">${fa(String(k+1))}</div><div class="warehouse-delivery-product"><div><strong>${esc(i.product?.name||'—')}</strong><div class="warehouse-request-box"><span>درخواست مشتری</span><b>${qty(i.requestedQty)} ${esc(i.requestedUnit)}</b></div></div><div class="warehouse-delivery-desc"><span>توضیحات ردیف</span><p>${esc(i.description||'بدون توضیحات')}</p></div><div class="warehouse-delivery-inputs"><div class="delivery-input-block"><label>وزن تحویلی نهایی</label><div class="weight-input-large"><input type="number" min="0" step="0.001" data-weight="${i.id}" placeholder="0.000"><span>کیلوگرم</span></div></div><label class="oos-toggle-card"><input type="checkbox" data-oos="${i.id}"><span><b>عدم موجودی</b><small>این قلم موجود نیست</small></span></label></div><div class="warehouse-delivery-row-actions"><button class="btn btn-ghost btn-sm" data-action="return-item-sales" data-id="${o.id}" data-item-id="${i.id}">${icon('arrow',14)} ارجاع این ردیف به فروش</button></div></article>`).join('');
  openModal('فرم تحویل سفارش انبار',`<div class="warehouse-delivery-modal"><div class="warehouse-modal-head"><div><span class="eyebrow">WAREHOUSE DELIVERY FORM</span><h2>ثبت تحویل سفارش ${esc(fa(o.orderNo||'—'))}</h2><p>${esc(storeAwareOrderName(o))} • ${esc(storeAwareOrderPhone(o))}</p></div><div class="warehouse-modal-head-stats"><span class="pill">${qty(activeItems.length)} قلم</span><span class="badge orange">در انتظار اقدام انبار</span></div></div><div class="warehouse-modal-note">برای هر قلم یکی از دو حالت را انتخاب کنید: وزن تحویلی را به کیلوگرم ثبت کنید یا گزینه «عدم موجودی» را فعال کنید. توضیحات سفارش نیز در کنار هر قلم قابل مشاهده است.</div><div class="warehouse-delivery-list">${rows||'<div class="empty">قلم فعالی برای تحویل وجود ندارد.</div>'}</div><div class="warehouse-modal-footer"><div class="warehouse-modal-summary"><span>جمع وزن ثبت‌شده</span><strong id="warehouseTotalKg">۰ کیلوگرم</strong></div><div class="toolbar"><button class="btn btn-secondary btn-lg" data-action="close-modal">لغو</button><button class="btn btn-primary btn-lg" data-action="confirm-warehouse" data-id="${esc(o.id)}">${icon('check',17)} ثبت تحویل و ارسال به تسویه</button></div></div></div>`);
  const modalCard=$('.modal-card'); if(modalCard) modalCard.classList.add('warehouse-modal-card');
  bindWarehouseModal();
}
function bindWarehouseModal(){
  $$('#modal [data-weight]').forEach(inp=>inp.addEventListener('input',updateWarehouseModalTotal));
  $$('#modal [data-oos]').forEach(ch=>ch.addEventListener('change',()=>{const id=ch.dataset.oos;const inp=$(`#modal [data-weight="${id}"]`);if(inp){inp.disabled=ch.checked;if(ch.checked)inp.value='';}updateWarehouseModalTotal();}));
}
function updateWarehouseModalTotal(){const total=$$('#modal [data-weight]').reduce((s,e)=>s+(e.disabled?0:n(e.value)),0);const el=$('#warehouseTotalKg');if(el)el.textContent=qty(total)+' کیلوگرم';}
function bindWarehouse(){$('#content').onclick=async e=>{const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;if(a==='open-warehouse')return openWarehouse(el.dataset.id);if(a==='confirm-warehouse')return confirmWarehouse(el.dataset.id);if(a==='return-sales')return returnSales(el.dataset.id);if(a==='return-item-sales')return returnSales(el.dataset.id,el.dataset.itemId)}}
async function confirmWarehouse(id){const items=[];for(const w of $$('#modal [data-weight]')){const itemId=w.dataset.weight;const oos=$(`#modal [data-oos="${itemId}"]`)?.checked||false;items.push({itemId,deliveredKg:oos?0:n(w.value),outOfStock:oos})}if(items.some(i=>!i.outOfStock&&i.deliveredKg<=0))return toast('برای همه اقلام موجود، وزن تحویلی معتبر وارد کنید.');try{await api('/api/orders/'+id+'/warehouse',{method:'POST',body:JSON.stringify({items})});toast('تحویل ثبت شد و سفارش برای تسویه ارسال شد.');app.selectedWarehouse=null;await renderWarehouse()}catch(e){toast(e.message)}}

/* ---------- Reports ---------- */
function reportCard(label,value,hint,ico,isText=false){return `<div class="card report-card"><div class="kpi-icon">${icon(ico,19)}</div><h3>${label}</h3><div class="value" style="font-size:${isText?'20':'28'}px">${isText?value:qty(value)}</div><small>${hint}</small></div>`}
const AUDIT_LABELS={CUSTOMER_ADDITION_REQUESTED:'درخواست افزودن کالا',CUSTOMER_ADDITION_REVIEWED:'بررسی درخواست افزودن کالا',LOGIN:'ورود به سامانه',LOGIN_FAILED:'تلاش ناموفق ورود',PASSWORD_CHANGED:'تغییر رمز عبور',CREATE_VISIT:'ثبت ورود مشتری',CREATE_ORDER:'ثبت سفارش',CREATE_STORE_ORDER:'ثبت سفارش فروشگاه',APPROVE_STORE_ORDER:'تأیید سفارش فروشگاه',SALES_EDIT_STORE_ORDER:'ویرایش سفارش فروشگاه توسط فروش',CANCEL_STORE_ORDER:'لغو سفارش فروشگاه',CREATE_REMOTE_ORDER:'ثبت سفارش غیرحضوری',UPDATE_REMOTE_ORDER:'ویرایش سفارش غیرحضوری',CANCEL_REMOTE_ORDER:'لغو سفارش غیرحضوری',ACTIVATE_REMOTE_ORDER:'فعال‌سازی سفارش زمان‌بندی‌شده',ADD_ORDER_ITEM:'افزودن قلم سفارش',UPDATE_ORDER_ITEM:'ویرایش قلم سفارش',DELETE_ORDER_ITEM:'حذف قلم سفارش',SAVE_RETURNED_ORDER_EDIT:'ذخیره اصلاح سفارش برگشتی',WAREHOUSE_ACCEPT_ORDER:'تأیید تحویل انبار',WAREHOUSE_START_PREPARING:'شروع آماده‌سازی انبار',WAREHOUSE_FINALIZE:'ثبت وزن نهایی انبار',REOPEN_WAREHOUSE_PREPARING:'بازگشایی آماده‌سازی انبار',RETURN_TO_SALES:'ارجاع سفارش به فروش',RESUBMIT_TO_WAREHOUSE:'ارسال مجدد به انبار',FINAL_SETTLEMENT:'تسویه نهایی و صدور فاکتور',FINAL_EXIT:'تأیید خروج عادی',SEND_TO_DISPATCH:'ارسال سفارش به پخش',DISPATCH_ASSIGN:'تخصیص راننده',DISPATCH_DRIVER_EXIT:'ثبت خروج توسط راننده',DISPATCH_GATE_EXIT:'تأیید خروج پیش از حرکت توسط نگهبانی',DISPATCH_DELIVERED:'ثبت تحویل توسط راننده',DISPATCH_SALES_FINALIZE:'تأیید نهایی تحویل توسط فروش',DISPATCH_FINAL_EXIT:'خروج نهایی تاریخی',USER_CREATED:'ایجاد کاربر',USER_UPDATED:'ویرایش کاربر',USER_ROLE_CHANGED:'تغییر نقش کاربر',USER_DEACTIVATED:'غیرفعال‌سازی کاربر',PRODUCT_CREATED:'ایجاد محصول',UPDATE_PRODUCT:'ویرایش محصول',SET_PRICE:'ثبت قیمت محصول',PRICE_GROUP_CREATED:'ایجاد گروه قیمت',PRICE_GROUP_RENAMED:'تغییر نام گروه قیمت',PRICE_GROUP_DELETED:'حذف گروه قیمت',PRICE_GROUP_ADJUSTED:'تغییر گروهی قیمت‌ها'};
function auditLabel(a){return AUDIT_LABELS[a]||a||'—'}
function auditDetails(x){const d=x.details||{};const parts=[];if(d.orderId)parts.push('سفارش '+String(d.orderId).slice(0,8).toUpperCase());if(d.itemCount!=null)parts.push('تعداد قلم '+d.itemCount);if(d.requestedQty!=null)parts.push('مقدار '+qty(d.requestedQty)+' '+(d.requestedUnit||''));if(d.reason)parts.push('دلیل: '+d.reason);if(d.invoiceNumber)parts.push('فاکتور '+d.invoiceNumber);return parts.join(' • ')||'ثبت شد'}

/* ---------- Admin ---------- */
const ADMIN_SETTINGS_TABS=[['https','دامنه و HTTPS'],['users','کاربران و سمت‌ها'],['products','محصولات'],['audit','ردپای فعالیت‌ها']];
function adminSettingsTabsHtml(){
  return `<nav class="settings-tabs" role="tablist" aria-label="بخش‌های تنظیمات سیستم">${ADMIN_SETTINGS_TABS.map(([id,label])=>`<button type="button" role="tab" id="settings-tab-${id}" aria-controls="settings-panel-${id}" data-settings-tab="${id}">${label}</button>`).join('')}</nav>`;
}
function initAdminSettingsTabs(){
  const root=$('#content'),tabs=[...root.querySelectorAll('[data-settings-tab]')];
  const select=(id,focus=false)=>{
    if(!ADMIN_SETTINGS_TABS.some(([key])=>key===id))id=ADMIN_SETTINGS_TABS[0][0];
    app.adminSettingsTab=id;
    tabs.forEach(tab=>{const selected=tab.dataset.settingsTab===id;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;const panel=document.getElementById(tab.getAttribute('aria-controls'));if(panel)panel.hidden=!selected;if(selected&&focus)tab.focus();});
  };
  tabs.forEach((tab,i)=>{
    tab.addEventListener('click',()=>select(tab.dataset.settingsTab));
    tab.addEventListener('keydown',e=>{let next;if(e.key==='ArrowLeft')next=(i+1)%tabs.length;else if(e.key==='ArrowRight')next=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;e.preventDefault();select(tabs[next].dataset.settingsTab,true);});
  });
  select(app.adminSettingsTab);
}
async function renderAdmin(){
  const [u,a]=await Promise.all([api('/api/admin/users'),api('/api/admin/audit')]);
  if(app.page!=='admin')return;
  const users=u.users||[];
  $('#content').innerHTML=`
  ${adminSettingsTabsHtml()}
  <div class="settings-panel" id="settings-panel-https" role="tabpanel" aria-labelledby="settings-tab-https" tabindex="0">
  <section class="card card-pad section-space tls-settings" id="tlsSettings">
    <div class="panel-head"><div><span class="eyebrow">DOMAIN &amp; HTTPS</span><h2>دامنه و گواهی HTTPS</h2><p>اتصال یک دامنهٔ عمومی و دریافت و تمدید خودکار گواهی رایگان Let’s Encrypt</p></div></div>
    <div class="notice">پیش از شروع، در پنل دامنه رکورد DNS را به IP عمومی این سرور وصل کنید و پورت‌های ۸۰ و ۴۴۳ را از اینترنت تا سرور باز و هدایت کنید. دامنهٔ داخلی، IP و wildcard پشتیبانی نمی‌شوند. باز کردن سامانه روی اینترنت آن را در دسترس عموم قرار می‌دهد؛ رمزهای قوی و محدودیت‌های شبکه را بررسی کنید.</div>
    <div id="tlsStatus" class="tls-status" role="status" aria-live="polite">در حال دریافت وضعیت…</div>
    <form id="tlsSettingsForm" class="form-grid section-space" autocomplete="off">
      <div class="field"><label for="tlsDomain">نام دامنه</label><div class="input-shell"><input id="tlsDomain" name="domain" dir="ltr" placeholder="example.com" required maxlength="253" spellcheck="false"></div><small>بدون https://، پورت یا مسیر</small></div>
      <div class="field"><label for="tlsEmail">ایمیل اطلاع‌رسانی تمدید (اختیاری)</label><div class="input-shell"><input id="tlsEmail" name="email" type="email" dir="ltr" maxlength="254" placeholder="admin@example.com"></div></div>
      <div class="field"><label for="tlsPassword">تأیید رمز مدیر</label><div class="input-shell"><input id="tlsPassword" name="password" type="password" required autocomplete="current-password"></div></div>
      <label class="adm-check"><input type="checkbox" name="terms" required> شرایط <a href="https://letsencrypt.org/repository/" target="_blank" rel="noopener noreferrer">Let’s Encrypt</a> را می‌پذیرم و اتصال عمومی سامانه به اینترنت را تأیید می‌کنم.</label>
      <div class="sticky-actions" style="grid-column:1/-1"><span class="subtle">گواهی خودکار نگهداری می‌شود. دسترسی HTTP با IP داخلی برای سازگاری باقی می‌ماند و رمزگذاری‌شده نیست.</span><button class="btn btn-primary" type="submit">دریافت و فعال‌سازی HTTPS</button></div>
    </form>
  </section>
  </div>
  <div class="settings-panel" id="settings-panel-users" role="tabpanel" aria-labelledby="settings-tab-users" tabindex="0">
    <section class="card admin-form">
      <div class="panel-head"><div><span class="eyebrow">USER DIRECTORY</span><h2>ایجاد حساب کاربری</h2><p>برای هر شخص، نام کامل، سمت سازمانی و سطح دسترسی را مشخص کنید.</p></div><span class="pill">${qty(users.filter(x=>x.isActive).length)} حساب فعال</span></div>
      <p>ساخت و ویرایش حساب‌ها از بخش «کاربران» انجام می‌شود.</p><button class="btn btn-primary" type="button" data-action="manage-users">مدیریت کاربران</button><form id="userForm" class="form-grid section-space" style="display:none">
        <div class="field"><label>نام کاربری</label><div class="input-shell"><input name="username" required autocomplete="off"></div></div>
        <div class="field"><label>نام و نام خانوادگی</label><div class="input-shell"><input name="fullName" required></div></div>
        <div class="field"><label>سمت سازمانی</label><div class="input-shell"><input name="position" required placeholder="مثلاً مسئول فروش، نگهبان، مدیر انبار"></div></div>
        <div class="field store-name-field"><label>نام فروشگاه <span class="subtle">(برای نقش فروشگاه)</span></label><div class="input-shell"><input name="storeName" placeholder="مثلاً فروشگاه مرکزی" autocomplete="organization"></div><small class="field-hint">برای نقش «فروشگاه» این مقدار الزامی است.</small></div>
        <div class="field"><label>سطح دسترسی</label><div class="input-shell"><select name="roleCode"><option value="gate">نگهبانی</option><option value="sales">فروش</option><option value="warehouse">انبار</option><option value="store">فروشگاه</option><option value="dispatch">واحد پخش</option><option value="admin">مدیر سیستم</option></select></div></div>
        <div class="field" data-legacy-driver-field style="display:none"><label>شماره تماس راننده *</label><div class="input-shell"><input name="drvPhone" inputmode="tel" dir="ltr" placeholder="۰۹۱۲ ۰۰۰ ۰۰۰۰"></div></div>
        <div class="field" data-legacy-driver-field style="display:none"><label>نوع خودرو *</label><div class="input-shell"><input name="drvVehicleType" list="drvVehicleTypes" placeholder="مثلاً وانت"></div><datalist id="drvVehicleTypes"><option value="وانت"></option><option value="کامیون"></option><option value="کامیونت"></option><option value="موتورسیکلت"></option><option value="پژو"></option></datalist></div>
        <div class="field" data-legacy-driver-field style="display:none"><label>پلاک خودرو *</label>${plateEditorHtml('','','drvPlate')}</div>
        <div class="field" data-legacy-driver-field style="display:none"><label>پایانه پوز</label><div class="input-shell"><input name="drvPosTerminal" dir="ltr" placeholder="POS-01"></div></div>
        <div class="field" data-legacy-driver-field style="display:none"><label>نام بانک پوز</label><div class="input-shell"><input name="drvPosBank" list="drvPosBanks" placeholder="مثلاً بانک ملت"></div><datalist id="drvPosBanks">${BT_POS_BANKS.map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist><small class="field-hint">راننده با همین مشخصات ساخته می‌شود و در کارتابل ترابری دیده می‌شود.</small></div>
        <div class="field"><label>رمز اولیه</label><div class="input-shell"><input name="password" type="password" required autocomplete="new-password"></div></div>
        <div class="sticky-actions" style="grid-column:1/-1"><span class="subtle">سطح دسترسی مشخص می‌کند کاربر کدام کارتابل را ببیند.</span><button class="btn btn-primary" type="submit">${icon('plus',15)} ایجاد حساب</button></div>
      </form>
    </section>
  <section class="card card-pad section-space">
    <div class="panel-head"><div><span class="eyebrow">USER MANAGEMENT</span><h2>مدیریت کاربران و سمت‌ها</h2><p>فهرست کامل حساب‌ها؛ ویرایش مشخصات، تغییر دسترسی و غیرفعال‌سازی از همین صفحه.</p></div><div class="toolbar"><span class="pill">${qty(users.length)} حساب ثبت‌شده</span></div></div>
    <div class="user-directory bt-table-wrap"><table class="bt-table settings-users-table"><caption class="bt-caption">مدیریت کاربران و سمت‌ها</caption><thead><tr><th>نام</th><th>نام کاربری</th><th>سمت و دسترسی</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>
      ${pageItems('users',users).map(x=>`<tr><td data-label="نام">${esc(x.fullName)}</td><td data-label="نام کاربری"><b dir="ltr">${esc(x.username)}</b></td><td data-label="سمت و دسترسی">${esc(x.position||'—')} • ${esc(ROLE[normalizeRole(x.roleCode)]||x.roleCode)}${x.storeName?`<br>فروشگاه: ${esc(x.storeName)}`:''}</td><td data-label="وضعیت">${x.isActive?'<span class="badge green">فعال</span>':'<span class="badge gray">غیرفعال</span>'}</td><td data-label="عملیات"><div class="bt-actions"><button class="btn btn-secondary btn-sm" data-action="edit-user" data-id="${esc(x.id)}">${icon('edit',14)} ویرایش</button>${x.id===app.user?.id?'<span class="subtle">حساب فعلی</span>':x.isActive?`<button class="btn btn-danger btn-sm" data-action="delete-user" data-id="${esc(x.id)}">${icon('trash',14)} حذف</button>`:'<span class="subtle">حذف/غیرفعال شده</span>'}</div></td></tr>`).join('')||'<tr><td colspan="5" class="empty">کاربری ثبت نشده است.</td></tr>'}
    </tbody></table></div>${pagerHtml('users',users.length)}
  </section>
  </div>
  <div class="settings-panel" id="settings-panel-products" role="tabpanel" aria-labelledby="settings-tab-products" tabindex="0">
    <div id="settings-products-content"></div>
  </div>
  <div class="settings-panel" id="settings-panel-audit" role="tabpanel" aria-labelledby="settings-tab-audit" tabindex="0">
  <div class="admin-grid section-space"><section class="card card-pad"><div class="panel-head"><div><span class="eyebrow">AUDIT TRAIL</span><h2>ردپای فعالیت‌ها</h2></div></div><div class="table-wrap bt-table-wrap section-space"><table class="bt-table audit-table"><caption class="bt-caption">ردپای فعالیت‌ها</caption><thead><tr><th>زمان</th><th>کاربر</th><th>عملیات</th><th>موجودیت</th></tr></thead><tbody>${pageItems('audit',a.audit).map(x=>`<tr><td data-label="زمان">${dt(x.createdAt)}</td><td data-label="کاربر"><strong>${esc(x.username||'—')}</strong></td><td data-label="عملیات"><b>${esc(auditLabel(x.action))}</b><div class="subtle">${esc(auditDetails(x))}</div></td><td data-label="موجودیت">${esc(x.entityType||'—')}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">لاگی وجود ندارد.</td></tr>'}</tbody></table></div>${pagerHtml('audit',a.audit.length)}</section></div>
  </div>`;
  bindAdmin(); bindJalaliDates($('#content')); bindRialInputs($('#content'));
  enhanceAdminCollapsible();
  initAdminSettingsTabs();
  startTlsSettings();
  await renderProductsPage();
}
function showTlsStatus(data){
  const el=$('#tlsStatus');if(!el)return;
  const active=data.active;
  el.innerHTML=active?`<div class="tls-current"><span class="badge ${active.valid?'green':'orange'}">${active.valid?'HTTPS فعال':'گواهی منقضی شده'}</span> دامنه: <b dir="ltr">${esc(active.domain)}</b> · اعتبار تا ${esc(formatDateTime24(active.expiresAt))} · <a href="https://${esc(active.domain)}/" target="_blank" rel="noopener noreferrer">بازکردن سامانه با HTTPS</a></div>`:'<div>هنوز گواهی فعالی تنظیم نشده است.</div>';
  if(data.job?.message)el.innerHTML+=`<div class="${data.job.state==='error'?'form-error':'subtle'}">${esc(data.job.message)}</div>`;
  const form=$('#tlsSettingsForm');if(form){const btn=form.querySelector('button[type=submit]');if(btn)btn.disabled=!!app.tlsSubmitPending||data.job?.state==='working';
    if(!form.dataset.initialized&&active){form.elements.domain.value=active.domain;form.elements.email.value=active.email||'';form.dataset.initialized='1';}}
}
function startTlsSettings(){
  if(app.tlsStatusTimer)clearInterval(app.tlsStatusTimer);
  const refresh=async()=>{if(app.page!=='admin'||!$('#tlsSettings')){clearInterval(app.tlsStatusTimer);app.tlsStatusTimer=null;return;}
    const seq=app.tlsUiSeq=(app.tlsUiSeq||0)+1;
    try{const data=await api('/api/admin/https');if(seq===app.tlsUiSeq)showTlsStatus(data);}catch(e){const el=$('#tlsStatus');if(el&&seq===app.tlsUiSeq)el.textContent='دریافت وضعیت HTTPS ناموفق بود: '+e.message;}};
  $('#tlsSettingsForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const form=e.target;const b={domain:form.elements.domain.value,email:form.elements.email.value,password:form.elements.password.value,terms:form.elements.terms.checked};
    if(!confirm('سامانه از اینترنت عمومی قابل دسترسی خواهد بود. دامنه و هدایت پورت‌ها را بررسی کرده‌اید؟'))return;
    const btn=form.querySelector('button[type=submit]');btn.disabled=true;app.tlsSubmitPending=true;app.tlsUiSeq=(app.tlsUiSeq||0)+1;
    try{const data=await api('/api/admin/https',{method:'POST',body:JSON.stringify(b)});app.tlsUiSeq++;app.tlsSubmitPending=false;form.elements.password.value='';showTlsStatus(data);toast('درخواست گواهی ثبت شد. وضعیت را در همین بخش پیگیری کنید.');}
    catch(err){app.tlsSubmitPending=false;toast(err.message);btn.disabled=false;}
  });
  void refresh();app.tlsStatusTimer=setInterval(refresh,3000);
}
function bindAdmin(){
  $('#content').onclick=async e=>{
    const el=e.target.closest('[data-action]'); const a=el?.dataset.action;
    if(a==='edit-product')return openProductEdit(el.dataset.id);
    if(a==='manage-users'||a==='edit-user')return go('users');
    if(a==='delete-user')return deleteUser(el.dataset.id);
  };
  // v37.38.0 — انتخاب نقش «راننده» فیلد رانندهٔ متصل را نشان می‌دهد و بدون انتخاب آن خطا می‌دهد
  const uf=$('#userForm');
  if(uf){bindPlateEditor(uf,uf.elements.drvVehicleType);const rsel=uf.elements.roleCode;
    const usync=()=>{uf.querySelectorAll('[data-legacy-driver-field]').forEach(f=>{f.style.display=rsel.value==='driver'?'':'none';});};
    rsel?.addEventListener('change',usync); usync();}
  $('#userForm')?.addEventListener('submit',async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));b.roleCode=normalizeRole(b.roleCode);b.username=String(b.username||'').trim();b.fullName=String(b.fullName||'').trim();b.position=String(b.position||'').trim();b.storeName=String(b.storeName||'').trim();if(b.roleCode==='driver'){try{b.drvPlate=plateEditorValue(e.target,{required:true});}catch(err){return toast(err.message);}}if(b.roleCode==='store'&&!b.storeName)return toast('برای کاربر فروشگاه، نام فروشگاه را وارد کنید.');if(b.roleCode==='driver'&&!(String(b.drvPhone||'').trim()&&String(b.drvVehicleType||'').trim()&&String(b.drvPlate||'').trim()))return toast('برای نقش راننده، شماره تماس، نوع خودرو و پلاک را کامل وارد کنید؛ راننده با همین مشخصات ساخته می‌شود.');try{await api('/api/admin/users',{method:'POST',body:JSON.stringify(b)});toast('حساب کاربری با موفقیت ساخته شد.');await renderAdmin()}catch(err){toast(err.message)}});
  bindRialInputs($('#content'));
}
async function openUserEdit(id){
  const d=await api('/api/admin/users'); const u=(d.users||[]).find(x=>String(x.id)===String(id)); if(!u){toast('حساب کاربری موردنظر پیدا نشد؛ فهرست کاربران را تازه‌سازی کنید.');return;}
  // v37.38.0 — فرم ویرایش قدیمی فقط ۴ نقش داشت و ویرایش کاربر فروش/پخش/راننده نقش او را خاموش عوض می‌کرد؛ حالا هر ۷ نقش + رانندهٔ متصل
  const drList=await api('/api/drivers').then(r=>r.drivers||[]).catch(()=>[]);
  const myDrv=drList.find(x=>x.id===u.driverId);
  openModal('ویرایش حساب کاربری',`<form id="userEditForm"><div class="form-grid"><div class="field"><label>نام کاربری</label><div class="input-shell"><input name="username" value="${esc(u.username)}" required></div></div><div class="field"><label>نام و نام خانوادگی</label><div class="input-shell"><input name="fullName" value="${esc(u.fullName)}" required></div></div><div class="field"><label>سمت سازمانی</label><div class="input-shell"><input name="position" value="${esc(u.position||'')}" required placeholder="سمت شخص"></div></div><div class="field"><label>نام فروشگاه <span class="subtle">(برای نقش فروشگاه)</span></label><div class="input-shell"><input name="storeName" value="${esc(u.storeName||'')}" placeholder="مثلاً فروشگاه مرکزی"></div></div><div class="field"><label>سطح دسترسی</label><div class="input-shell"><select name="roleCode">${Object.entries(ROLE).filter(([v])=>v!=='driver'||normalizeRole(u.roleCode)==='driver').map(([v,t])=>`<option value="${v}" ${normalizeRole(u.roleCode)===v?'selected':''}>${t}</option>`).join('')}</select></div></div><div class="field" data-user-edit-driver style="display:${normalizeRole(u.roleCode)==='driver'?'':'none'}"><label>شماره تماس راننده *</label><div class="input-shell"><input name="drvPhone" inputmode="tel" dir="ltr" value="${esc(myDrv?.phone||'')}"></div></div><div class="field" data-user-edit-driver style="display:${normalizeRole(u.roleCode)==='driver'?'':'none'}"><label>نوع خودرو *</label><div class="input-shell"><input name="drvVehicleType" value="${esc(myDrv?.vehicleType||'')}"></div></div><div class="field" data-user-edit-driver style="display:${normalizeRole(u.roleCode)==='driver'?'':'none'}"><label>پلاک خودرو *</label>${plateEditorHtml(myDrv?.plate||'',myDrv?.vehicleType||'','drvPlate')}</div><div class="field" data-user-edit-driver style="display:${normalizeRole(u.roleCode)==='driver'?'':'none'}"><label>پایانه پوز / نام بانک</label><div class="input-shell"><input name="drvPosTerminal" dir="ltr" value="${esc(myDrv?.posTerminal||'')}"></div><div class="input-shell"><input name="drvPosBank" value="${esc(myDrv?.posBank||'')}"></div><small class="field-hint">این مشخصات روی رکورد راننده در کارتابل ترابری به‌روز می‌شود.</small></div><input type="hidden" name="driverId" value="${esc(u.driverId||'')}"><div class="field"><label>رمز جدید <span class="subtle">(اختیاری)</span></label><div class="input-shell"><input name="password" type="password" placeholder="در صورت نیاز تغییر دهید"></div></div><div class="field"><label>وضعیت حساب</label><div class="input-shell"><select name="isActive"><option value="true" ${u.isActive?'selected':''}>فعال</option><option value="false" ${!u.isActive?'selected':''}>غیرفعال</option></select></div></div></div><div class="sticky-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">انصراف</button><button class="btn btn-primary">ذخیره تغییرات</button></div></form>`);
  const uef=$('#userEditForm');
  bindPlateEditor(uef,uef.elements.drvVehicleType);
  const ursel=uef.elements.roleCode;
  ursel.addEventListener('change',()=>{uef.querySelectorAll('[data-user-edit-driver]').forEach(f=>{f.style.display=ursel.value==='driver'?'':'none';});});
  uef.addEventListener('submit',async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));b.isActive=b.isActive==='true';if(!b.password)delete b.password;if(b.roleCode==='driver'){try{b.drvPlate=plateEditorValue(uef,{required:true});}catch(err){return toast(err.message);}}if(b.roleCode==='driver'&&!(String(b.drvPhone||'').trim()&&String(b.drvVehicleType||'').trim()&&String(b.drvPlate||'').trim()))return toast('برای نقش راننده، شماره تماس، نوع خودرو و پلاک را کامل وارد کنید.');try{await api('/api/admin/users/'+id,{method:'PUT',body:JSON.stringify(b)});closeModal();toast('حساب کاربری ویرایش شد.');await renderAdmin()}catch(err){toast(err.message)}})
}
async function deleteUser(id){
  const d=await api('/api/admin/users'); const u=(d.users||[]).find(x=>String(x.id)===String(id)); if(!u){toast('حساب کاربری موردنظر پیدا نشد.');return;}
  if(!confirm(`حساب «${u.fullName}» با سمت «${u.position||'—'}» غیرفعال و از دسترس خارج شود؟`))return;
  try{await api('/api/admin/users/'+id,{method:'DELETE'});toast('حساب کاربری از دسترس خارج شد.');await renderAdmin()}catch(err){toast(err.message)}
}

/* ---------- Invoice ---------- */
function pickInvoicePayment(o,run){ if(run){ const hit=(o.payments||[]).find(p=>(p.deliveryRun||null)===run); return hit||null; } return o.payment||null; } // v37.17.0 — سند سرویس دیگر هرگز جای سند این سرویس نمایش داده نمی‌شود
async function previewInvoice(id,run){try{const d=await api('/api/orders/'+id);const pay=pickInvoicePayment(d.order,run);if(run&&!pay)return toast('سند این سرویس هنوز صادر نشده است.');openModal('پیش‌نمایش فاکتور'+(run?` — سرویس ${run===2?'دوم':'اول'}`:''),invoiceHtml(d.order,pay)+`<div class="toolbar" style="justify-content:flex-end;margin-top:15px"><button class="btn btn-secondary" data-action="close-modal">بستن</button><button class="btn btn-primary" data-action="print-invoice" data-id="${id}"${run?` data-run="${run}"`:''}>${icon('receipt',16)} چاپ فاکتور</button></div>`);BTPrintDigits.convert(document.querySelector('#modal .inv38-sheet'))}catch(e){toast(e.message)}}
async function openInvoicePrint(id,run){
  const key='invoice-print-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  try{
    const d=await api('/api/orders/'+encodeURIComponent(id));
    const pay=pickInvoicePayment(d.order,run);
    if(run&&!pay)return toast('سند این سرویس هنوز صادر نشده است.');
    sessionStorage.setItem(key,JSON.stringify({title:(d.order?.orderType==='STORE'?'سند تحویل وزنی':'فاکتور')+' '+fa(pay?.invoiceNumber||''),html:invoiceHtml(d.order,pay)}));
    await BTPrintFrame.url('/invoice-print.html',{key});
  }catch(e){sessionStorage.removeItem(key);toast(e.message)}
}
async function printInvoice(id,run){return openInvoicePrint(id,run)}
/* v37.17.0 — سطرهای سند هر سرویس فقط از دادهٔ همان سرویس ساخته می‌شوند.
   وزن کل قلم (مجموع سرویس اول و دوم) هرگز نباید در سند یک سرویس نمایش داده شود. */
function storeRunInvoiceLines(o,p){
  const priceLines=Array.isArray(p?.priceLines)?p.priceLines:[];
  if(priceLines.length) return priceLines.map(x=>({productName:x.productName,deliveredKg:Number(x.deliveredKg??0)}));
  const items=(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED');
  const run=p?.deliveryRun||null;
  if(run===1||run===2){
    const key=run===1?'runR1':'runR2';
    const lines=items.map(i=>({productName:i.product?.name,deliveredKg:(Array.isArray(i[key])?i[key]:[]).reduce((sum,e)=>sum+Number(e.kg||0),0)})).filter(x=>x.deliveredKg>0);
    if(lines.length) return lines;
    const ds=[...(Array.isArray(o.dispatchRuns)?o.dispatchRuns:[]),...(o.dispatch?[o.dispatch]:[])].find(d=>d&&d.run===run);
    if(ds&&ds.shipmentWeights) return items.filter(i=>Number(ds.shipmentWeights[i.id]||0)>0).map(i=>({productName:i.product?.name,deliveredKg:Number(ds.shipmentWeights[i.id]||0)}));
    return [];
  }
  return items.map(i=>({productName:i.product?.name,deliveredKg:i.deliveredKg}));
}
function invoiceHtml(o,paySel){
  const p=paySel||o.payment||{}; // v37.5.0 — هر سرویس سفارش فروشگاه فاکتور خودش را دارد (payment.priceLines)
  const pickupDoc=o.pickupHandover?.document;
  const signatureContact=pickupDoc?.recipient?esc(pickupDoc.recipient.name||'—')+' – '+esc(pickupDoc.recipient.phone||'—'):esc((p.customerName ?? o.customer?.name) || '—')+' – '+esc((p.customerPhone ?? o.customer?.phone) || '—');
  const priceLines=Array.isArray(p.priceLines)?p.priceLines:[];
  const items=priceLines.length?priceLines.map(x=>({product:{name:x.productName},deliveredKg:x.deliveredKg,unitPrice:x.unitPrice,finalAmount:x.amount})):(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED');
  const storeDoc = o.orderType === 'STORE'; // v37.6.0 — سند تحویل وزنی فروشگاه: هیچ مبلغی نمایش داده نمی‌شود
  if (storeDoc) {
    const run=p.deliveryRun||null;
    const lines=storeRunInvoiceLines(o,p); // v37.17.0 — فقط اقلام و وزن همان سرویس
    const totalKg=lines.reduce((sum,x)=>sum+Number(x.deliveredKg??0),0);
    return `<div class="inv38-sheet inv38-compact">
  <div class="inv38-head"><div class="inv38-brand"><img src="/logo.png" alt="بابل طیور"><div><b>بابل طیور</b><span>سند تحویل وزنی فروشگاه</span></div></div>
    <div class="inv38-meta"><div><span>شماره سند</span><b>${esc(fa(p.invoiceNumber||'—'))}</b></div><div><span>تاریخ ثبت</span><b>${esc(dt(p.verifiedAt||o.createdAt))}</b></div><div><span>شماره سفارش</span><b>${esc(fa(o.orderNo||'—'))}${run?` · سرویس ${run===2?'دوم':'اول'}`:''}</b></div></div></div>
  <div class="inv38-rule"></div>
  <div class="inv38-cust"><div><span>فروشگاه</span><b>${esc(o.storeName||'—')}</b></div><div><span>محل تحویل</span><b>${esc(o.dispatchPlace||'—')}</b></div><div><span>وضعیت</span><b>سند وزنی — بدون مبلغ</b></div></div>
  <div class="inv38-table-scroll" role="region" tabindex="0"><table class="inv38-table"><thead><tr><th>#</th><th>محصول</th><th>وزن تحویلی</th></tr></thead><tbody>${lines.map((i,k)=>`<tr><td>${fa(String(k+1))}</td><td><b>${esc(i.productName||'—')}</b></td><td>${qty(i.deliveredKg)} کیلوگرم</td></tr>`).join('')}</tbody></table></div>
  <div class="inv38-bottom"><div class="inv38-total"><div class="inv38-total-box"><div><span>جمع وزن محموله</span><b>${qty(totalKg)} کیلوگرم</b></div><div class="grand"><span>نوع سند</span><b>خارج از مسیر پرداخت</b></div><div style="margin-top:6px"><small>این سند صرفاً وزن تحویل‌شده را اعلام می‌کند و ارزش ریالی ندارد.</small></div></div></div>
  <div class="inv38-verify"><div class="inv38-verify-box"><div class="inv38-verify-grid"><div class="inv38-vitem"><span>امضاء</span><strong>${signatureContact}</strong></div></div></div></div></div>
  </div>`;
  }
  const subtotal=items.reduce((sum,i)=>sum+n(i.finalAmount),0);
  const returns=Math.max(0,n(p.returnDeduction||0));
  const difference=n(p.totalAmount)-subtotal+returns;
  const discount=p.discountAmount != null ? n(p.discountAmount) : Math.max(0,-difference);
  const additions=p.additionsAmount != null ? n(p.additionsAmount) : Math.max(0,difference);
  const customerNameRaw=String((pickupDoc?.customerName ?? p.customerName ?? o.customer?.name)||'').trim();const customerPhoneRaw=String((pickupDoc?.customerPhone ?? p.customerPhone ?? o.customer?.phone)||'').trim();
  const customerName=esc(customerNameRaw||'—');const customerPhone=esc(customerPhoneRaw||'—');
  const recipientCandidate=o.pickupHandover?.document?.recipient||null;
  const contactNameKey=value=>String(value||'').normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\u200e\u200f]/g,' ').replace(/\s+/g,' ').trim().toLocaleLowerCase();
  const contactPhoneKey=value=>String(value||'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g,'');
  const customerNameKey=contactNameKey(customerNameRaw);
  const sameRecipientName=!!recipientCandidate&&!!customerNameKey&&contactNameKey(recipientCandidate.name)===customerNameKey;
  const sameRecipientPhone=!!recipientCandidate&&contactPhoneKey(recipientCandidate.phone)===contactPhoneKey(customerPhoneRaw);
  const recipient=sameRecipientName&&sameRecipientPhone?null:recipientCandidate;
  const recipientHeaderMeta=recipient?`<div><span>نام مشتری</span><b>${customerName}</b></div><div><span>شماره</span><b class="inv38-phone" dir="ltr">${customerPhone}</b></div><div><span>تحویل گیرنده</span><b>${esc(recipient.name||'—')}</b></div><div><span>شماره</span><b class="inv38-phone" dir="ltr">${esc(fa(recipient.phone||'—'))}</b></div><div><span>سفارش</span><b>${esc(fa(String(o.orderNo||'—').replace(/^0+(?=\d)/,'')))}</b></div><div><span>فاکتور</span><b>${esc(fa(String(p.invoiceNumber||'—').replace(/^0+(?=\d)/,'')))}</b></div><div><span>تاریخ</span><b>${esc(dt(p.verifiedAt||o.createdAt))}</b></div>`:'';
  const invoiceHeaderMeta=recipient?recipientHeaderMeta:`<div><span>شماره فاکتور</span><b>${esc(fa(p.invoiceNumber||'—'))}</b></div><div><span>تاریخ تسویه</span><b>${esc(dt(p.verifiedAt||o.createdAt))}</b></div><div><span>شماره سفارش</span><b>${esc(fa(o.orderNo||'—'))}</b></div>`;
  const settleLabels=Object.assign(Object.create(null),{CASH:'نقدی',POS:'پوز',CARD_TRANSFER:'کارت‌به‌کارت',CHECK:'چک',CREDIT:'معوق'});
  const methods=Array.isArray(p.settlementMethods)?p.settlementMethods:[];
  const amountKnown=v=>(typeof v==='number'||typeof v==='string')&&String(v).trim()!==''&&Number.isSafeInteger(Number(v))&&Number(v)>=0;
  const methodsComplete=methods.length>0&&methods.every(m=>m&&settleLabels[String(m.type||'').toUpperCase()]&&amountKnown(m.amount));
  const types=[...new Set(methods.map(m=>String(m?.type||'').toUpperCase()).filter(Boolean))];
  const due=amountKnown(p.amountDue)?Number(p.amountDue):(!p.deposit&&(p.depositAmount==null||Number(p.depositAmount)===0)&&amountKnown(p.totalAmount)?Number(p.totalAmount):null);
  const depositOnly=Array.isArray(p.settlementMethods)&&methods.length===0&&due===0&&Number(p.depositAmount)>0;
  const settlementKind=types.length>1?'ترکیبی':types.length===1?(settleLabels[types[0]]||'نامشخص'):(depositOnly?'از محل بیعانه':(settleLabels[p.settlementType]||'ثبت نشده'));
  const credit=methodsComplete?methods.reduce((sum,m)=>sum+(String(m.type).toUpperCase()==='CREDIT'?Number(m.amount):0),0):(depositOnly?0:null);
  const account=p.debtAccount;
  const paid=account&&Array.isArray(account.receipts)&&account.receipts.every(r=>r&&amountKnown(r.amount)&&['CLEARED','PENDING','RETURNED','REVERSED'].includes(r.status))?account.receipts.filter(r=>r.status==='CLEARED').reduce((sum,r)=>sum+Number(r.amount),0):null;
  const adjustment=account&&Object.hasOwn(account,'adjustment')&&Number.isSafeInteger(account.adjustment)?account.adjustment:0;
  const current=account&&amountKnown(account.initial)&&paid!==null&&(Object.hasOwn(account,'adjustment')?Number.isSafeInteger(account.adjustment):paid<=Number(account.initial))?Number(account.initial)+adjustment-paid:null;
  const recordedSum=methodsComplete?methods.reduce((sum,m)=>sum+Number(m.amount),0):null;
  const paymentRows=methods.map(m=>{
    m=m||{};const type=String(m.type||'').toUpperCase();
    const details=[m.deviceSnapshot?.title?`دستگاه ${m.deviceSnapshot.title}`:'',m.deviceSnapshot?.bank?`بانک ${m.deviceSnapshot.bank}`:'',m.bank?`بانک ${m.bank}`:'',m.reference?`پیگیری ${m.reference}`:'',m.checkNumber?`شماره چک ${m.checkNumber}`:'',m.dueDate?`سررسید ${m.dueDate}`:'',type==='CHECK'&&m.checkStatus==='PENDING'?'در انتظار وصول':'',type!=='CREDIT'&&m.reason?`علت ${m.reason}`:''].filter(Boolean).join(' • ');
    return `<div class="inv38-payment-row"><div><span>${esc(settlementMethodLabel(m))}</span>${details?`<small>${esc(details)}</small>`:''}</div><b>${amountKnown(m.amount)?money(m.amount):'نامشخص'}</b></div>`;
  }).join('');
  const paymentBox=`<section class="inv38-payment-box" aria-label="روش‌های تسویه"><h3>روش‌های تسویه</h3><div class="inv38-payment-row"><span>نوع تسویه</span><b>${esc(settlementKind)}</b></div>${due!==null?`<div class="inv38-payment-row"><span>قابل تسویه</span><b>${money(due)}</b></div>`:''}${paymentRows||`<div class="inv38-payment-empty">${depositOnly?'تمام مبلغ از بیعانه لحاظ‌شده تأمین شده است.':'جزئیات روش پرداخت ثبت نشده است.'}</div>`}<div class="inv38-payment-row inv38-payment-balance"><span>${account?(current<0?'بستانکار':'مانده معوق'):'معوق'}</span><b>${account?(current===null?'نامشخص':money(Math.abs(current))):(credit===null?'نامشخص':money(credit))}</b></div>${recordedSum!==null&&due!==null&&recordedSum!==due&&!Object.hasOwn(account||{},'adjustment')?'<small class="inv38-payment-note">جمع روش‌های ثبت‌شده با مبلغ قابل تسویه یکسان نیست؛ بررسی لازم است.</small>':''}</section>`;
  return `<div class="inv38-sheet inv38-compact${recipient?' inv38-pickup-recipient':''}">
  <div class="inv38-head${recipient?' inv38-pickup-header':''}">
    ${recipient?'':`<div class="inv38-sales-title">فاکتور فروش و تحویل</div>`}
    <div class="inv38-meta${recipient?' inv38-pickup-recipient-meta':''}">${invoiceHeaderMeta}</div>
  </div>
  <div class="inv38-rule"></div>
  ${recipient?'':`<div class="inv38-cust"><div><span>مشتری</span><b>${customerName}</b></div><div><span>شماره تماس</span><b class="inv38-phone" dir="ltr">${customerPhone}</b></div><div><span>وضعیت</span><b>تسویه نهایی و آماده خروج</b></div></div>`}
  <p class="inv38-scroll-hint">برای مشاهده همه ستون‌های اقلام، جدول را افقی پیمایش کنید.</p><div class="inv38-table-scroll" role="region" aria-label="اقلام فاکتور؛ برای مشاهده همه ستون‌ها افقی پیمایش کنید" tabindex="0"><table class="inv38-table"><thead><tr><th>#</th><th>محصول</th><th>وزن تحویلی</th><th>فی</th><th>مبلغ</th></tr></thead><tbody>${items.map((i,k)=>`<tr><td>${fa(String(k+1))}</td><td><b>${esc(i.product?.name||'—')}</b></td><td>${qty(i.deliveredKg)} کیلوگرم</td><td>${money(i.unitPrice)}</td><td>${money(i.finalAmount)}</td></tr>`).join('')}</tbody></table></div>
  <div class="inv38-bottom inv38-with-payments"><div class="inv38-total"><div class="inv38-total-box"><div><span>جمع اقلام</span><b>${money(subtotal)}</b></div><div><span>تخفیفات</span><b>${money(discount)}</b></div><div><span>اضافات</span><b>${money(additions)}</b></div>${returns?`<div><span>کسر مرجوعی</span><b>${money(returns)}</b></div>`:''}${p.deposit?`<div><span>بیعانه دریافت‌شده (${esc(settleLabels[p.deposit?.type]||'')})${p.deposit?.reference?` • پیگیری ${esc(p.deposit.reference)}`:''}</span><b>${money(p.deposit.amount)}</b></div>${p.deposit.refundedAmount?`<div><span>استرداد دستی بیعانه</span><b>${money(p.deposit.refundedAmount)}</b></div><div><span>بیعانه لحاظ‌شده</span><b>${money(p.depositAmount)}</b></div>`:''}<div><span>مانده پس از کسر بیعانه (پیش از تسویه)</span><b>${amountKnown(p.amountDue)?money(p.amountDue):'نامشخص'}</b></div>`:''}<div class="grand"><span>مبلغ نهایی</span><b>${money(p.totalAmount)}</b></div></div></div>
  ${paymentBox}
  <div class="inv38-verify">
    <div class="inv38-verify-box inv38-customer-ack"><p class="inv38-delivery-declaration">اینجانب <strong>${esc(String(recipientCandidate?.name||customerNameRaw||'—').trim()||'—')}</strong> اقلام فوق را صحیح و سالم تحویل گرفته و اقلام تحویلی به صورت امانت تا زمان پرداخت مبلغی ریالی آن نزد اینجانب می‌باشد.</p><div class="inv38-verify-grid"><div class="inv38-vitem"><span>${recipient?'امضاء تحویل‌گیرنده':'امضاء'}</span><strong>${signatureContact}</strong></div></div></div>
  </div>
  </div>
  </div>`;
}
function printCss(){return `*{box-sizing:border-box}body{margin:0;padding:18px;font-family:"B Yekan","B Yekan+","BYekan",Tahoma,Arial,sans-serif;color:#1d222a;background:#fff}.print-sheet{max-width:900px;margin:auto}.print-head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #b40f23;padding-bottom:14px}.print-brand{display:flex;align-items:center;gap:10px}.print-brand img{width:58px;height:58px;object-fit:contain}.print-brand b{font-size:21px}.print-brand span,.print-brand small{display:block;color:#777;font-size:10px}.print-meta{text-align:left;font-size:10px;color:#777;line-height:2}.print-customer{display:grid;grid-template-columns:1.2fr 1fr 1.1fr;gap:10px;margin-top:14px}.print-box{border:1px solid #ddd;border-radius:10px;padding:10px}.print-box span{display:block;color:#777;font-size:9px}.print-box b{display:block;margin-top:3px;font-size:12px}.print-table{width:100%;border-collapse:collapse;margin-top:14px}.print-table th,.print-table td{border:1px solid #ddd;padding:8px 7px;font-size:10px}.print-table th{background:#f5f5f6}.print-table td small{display:block;color:#777;margin-top:2px}.print-total{display:flex;justify-content:flex-end;margin-top:14px}.print-total-box{width:300px;border:1px solid #ddd;border-radius:10px;padding:10px}.print-total-box div{display:flex;justify-content:space-between;padding:4px 0;font-size:10px}.print-total-box .grand{border-top:1px solid #ddd;margin-top:4px;padding-top:8px;font-size:14px;font-weight:1000}.invoice-bottom{display:grid;grid-template-columns:1.25fr 1fr;gap:18px;align-items:end;margin-top:22px;direction:ltr}.invoice-bottom>*{direction:rtl}.invoice-verification-bottom{border:1px solid #d8dce0;border-radius:12px;padding:11px;background:#fafbfc}.invoice-verify-title{font-size:12px;font-weight:1000;margin-bottom:8px}.invoice-verify-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.invoice-verify-box{border:1px solid #ddd;border-radius:9px;background:#fff;padding:8px;min-height:72px}.invoice-verify-box>span{display:block;font-size:9px;color:#777}.invoice-verify-box>strong{display:block;margin-top:4px;font-size:10px}.invoice-verify-box .ok{color:#168149}.invoice-verify-box .manual{color:#ad7110}.invoice-verify-box .bad{color:#b40f23}.invoice-verify-box small{display:block;color:#777;margin-top:5px;font-size:7px}.invoice-signature{display:block;max-width:150px;max-height:44px;margin:5px auto 0}.invoice-customer-under{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:5px 8px;margin-top:9px;align-items:center}.invoice-customer-under span{font-size:8px;color:#777}.invoice-customer-under b{font-size:10px}.invoice-sales-sign{border-top:1px solid #bbb;min-height:92px;padding-top:8px;font-size:9px;color:#777}.invoice-sales-sign span{display:block;font-size:11px;font-weight:1000;color:#555}.invoice-sales-sign div{height:32px}.invoice-sales-sign small{font-size:8px;color:#999}@media print{body{padding:0}.print-sheet{max-width:none}.invoice-bottom{break-inside:avoid}.print-table{break-inside:auto}.print-table tr{break-inside:avoid;break-after:auto}}`}

/* ---------- Application Bootstrap / Login ---------- */
