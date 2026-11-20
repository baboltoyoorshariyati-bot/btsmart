/* ================================================================
   v38 UI LAYER — بازطراحی رابط کاربری (قدم اول: شل + کارتابل فروش)
   این فایل بعد از app.js بارگذاری می‌شود و رندررهای کارتابل فروش را
   با طراحی جدید جایگزین می‌کند. همه‌ی شناسه‌ها و data-actionهایی که
   منطق برنامه به آن‌ها وابسته است، حفظ شده‌اند.
   ================================================================ */
window.BT_UI_BUILD='37.7.4';

/* ---------- کمکی ---------- */
/* fallback plateViewHtml for ui2 — will be overridden by app.js if loaded */
if(typeof plateViewHtml === 'undefined'){
  function plateViewHtml(value, fallback='—', compact=false){
    const raw=String(value||'').trim();
    if(!raw) return `<span style="color:var(--muted);font-size:12px;font-weight:700">${typeof esc==='function'?esc(fallback):fallback}</span>`;
    let a='',letter='',c='',prov='';
    try{
      if(typeof parsePlate==='function'){ const pr=parsePlate(raw); a=pr.a||''; letter=pr.letter||''; c=pr.c||''; prov=pr.province||''; }
      else throw new Error('no parse');
    } catch(e){
      const m=raw.match(/(\d{1,2})\s*([^\d\s\-\.]+)?\s*(\d{1,3})?\s*[-\s]*\s*(\d{1,2})?/);
      if(m){ a=m[1]||''; letter=m[2]||''; c=m[3]||''; prov=m[4]||''; } else { a=raw; }
    }
    const escFn = typeof esc==='function' ? esc : (v=>String(v||''));
    const cls = compact ? 'iran-plate is-readonly is-compact' : 'iran-plate is-readonly';
    return `<div class="${cls}" style="display:inline-grid;vertical-align:middle" dir="ltr"><div class="blue-strip"><span>IR<br>ایران</span></div><div class="plate-part"><span>${escFn(a)}</span></div><div class="plate-part"><span>${escFn(letter)}</span></div><div class="plate-part"><span>${escFn(c)}</span></div><div class="plate-part plate-code"><span>${escFn(prov)}</span></div></div>`;
  }
}

function sdEmpty(name, title, subtitle){
  return `<div class="sd-empty"><div>${icon(name,26)}</div><strong>${esc(title)}</strong><span>${esc(subtitle||'')}</div>`;
}
function sdStatusAccent(status){
  return ({WAREHOUSE_PENDING:'is-orange',WAREHOUSE_PREPARING:'is-purple',RETURNED_TO_SALES:'is-red',ORDERED:'is-blue',SETTLEMENT_PENDING:'is-blue',SETTLED:'is-green',EXITED:'is-green',SCHEDULED_REMOTE:'is-purple',STORE_PENDING_SALES:'is-orange'})[status]||'is-gray';
}
function sdTypeBadge(o){
  if(o?.orderType==='ONSITE') return '<span class="sd-type onsite">حضوری</span>';
  if(o?.orderType==='STORE') return `<span class="sd-type store">${o.storeOrderKind==='PARTIAL'?'سفارش جزئی فروشگاه':'سفارش روزانه فروشگاه'}</span>`;
  return '<span class="sd-type phone">تلفنی</span>';
}

/* جایگزین‌های سبک‌تر برای عنوان/خالی/نوع سفارش */
function salesEmptyV25(name,title,subtitle){ return sdEmpty(name,title,subtitle); }
function salesKindBadge(o){ return sdTypeBadge(o); }
function salesSectionTitle(kicker,title,subtitle,count=''){
  return `<div class="sd-head"><div class="sd-head-main"><h2>${esc(title)}</h2><p>${esc(subtitle||'')}</p></div>${count!==''?`<div class="sd-count"><strong>${qty(count)}</strong><span>مورد</span></div>`:''}</div>`;
}

/* ---------- نوار کناری ---------- */
/* renderNav is centralized in app.js; do not override the role-specific cartable sidebar here. */

/* ---------- نوار تب‌های هفت‌گانه فروش ---------- */
function renderSalesTabsV29(tab){
  const counts=Object.fromEntries(SALES_TABS_V29.map(id=>[id,navUnread('sales',id)]));
  return `<nav class="sd-tabs sd-sales-tabs" aria-label="هفت بخش کارتابل فروش">${SALES_TABS_V29.map((id,i)=>{
    const [label,sub,ico]=SALES_LABELS_V29[id],count=counts[id];
    return `<button type="button" class="sd-tab ${tab===id?'active':''}" data-sales-tab="${id}"><span class="sd-tab-index">${fa(String(i+1).padStart(2,'0'))}</span><span class="sd-tab-ico">${icon(ico,19)}</span><span class="sd-tab-copy"><strong>${esc(label)}</strong><small>${esc(sub)}</small></span><b class="sd-tab-count ${count>0?'show':''}" data-sales-count="${id}">${count>0?qty(count):''}</b></button>`;
  }).join('')}</nav>`;
}

/* ---------- تب ۱: حضوری ---------- */
function renderSalesOnsiteV25(visits){
  return `<section class="sd-pane">
    <section class="sd-panel">
      <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico">${icon('gate',20)}</span><div><h2>مشتریان حضوری</h2><p>فقط مراجعانی که نگهبانی ثبت کرده و در صف فروش قرار دارند. برای ثبت سفارش، مشتری را انتخاب کنید.</p></div></div><div class="sd-count"><strong>${qty(visits.length)}</strong><span>در صف</span></div></div>
      <label class="sd-search">${icon('search',18)}<input id="salesSearchV25" placeholder="جستجوی نام، شماره تماس یا پلاک..."></label>
      <div id="salesOnsiteListV25" class="sd-queue">${salesOnsiteRowsV25(visits)}</div>
    </section>
  </section>`;
}
function salesOnsiteRowsV25(visits){
  const rows=visits.map(v=>`<tr data-onsite-visit="${esc(v.id)}">
    <td data-label="مشتری"><span class="bt-cell-main">${esc(v.customer?.name||'—')}</span><span class="bt-cell-sub">${esc(v.customer?.phone||'—')}</span></td>
    <td data-label="پلاک">${plateViewHtml(v.customer?.plate, 'بدون پلاک', true)}</td>
    <td data-label="منطقه">${v.district?`<span class="sd-chip">${esc(v.district)}</span>`:'—'}</td>
    <td data-label="زمان ورود">${formatDateTime24(v.createdAt)}</td>
    <td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-primary btn-sm" data-action="open-order" data-id="${esc(v.id)}">ثبت سفارش ${icon('arrow',14)}</button></td>
  </tr>`).join('');
  return `<div class="bt-table-wrap"><table class="bt-table sd-queue-table"><thead><tr><th>مشتری</th><th>پلاک</th><th>منطقه</th><th>زمان ورود</th><th>عملیات</th></tr></thead><tbody>${rows||`<tr><td colspan="5">${sdEmpty('user','صف حضوری خالی است','با ثبت مراجعه جدید در نگهبانی، مشتری در این فهرست قرار می‌گیرد.')}</td></tr>`}</tbody></table></div>`;
}

/* ---------- صفحه ثبت سفارش حضوری ---------- */
async function openOrder(visitId){
  const notices=captureEntityNotices('visit',visitId);
  try{
    const visits=(await api('/api/visits?id='+encodeURIComponent(visitId))).visits||[]; const v=visits.find(x=>x.id===visitId && x.status==='WAITING_SALES'); if(!v)return;
    app.orderDraft=[defaultOrderLine()];
    $('#content').innerHTML=renderSalesTabsV29('onsite')+`<div class="v29-sales-shell">
      <div class="sd-oe-banner">
        <div class="sd-oe-banner-right">
          <button class="btn btn-secondary" data-action="back-order-intake">${icon('arrow',15)} بازگشت</button>
          <div><h2>ثبت سفارش مشتری حضوری</h2><p>اقلام را با کد سریع یا نام محصول انتخاب کنید؛ پس از ثبت، سفارش مستقیم به انبار می‌رود.</p></div>
        </div>
        <div class="sd-oe-banner-actions"><div class="sd-stepper"><span class="done">۱ مشتری</span><i></i><span class="active">۲ سفارش</span><i></i><span>۳ انبار</span></div><span class="badge orange">در انتظار ثبت سفارش</span><button class="btn btn-primary btn-lg" data-action="submit-order" data-id="${visitId}">${icon('send',17)} ثبت و ارسال به انبار</button></div>
      </div>
      <div class="sd-oe-customer">
        <div class="onsite-customer-scroll" role="region" aria-label="مشخصات مشتری و روش تحویل" tabindex="0">
          <div class="onsite-customer-facts">
            <div><span>نام مشتری:</span><strong>${esc(v.customer?.name||'—')}</strong></div>
            <div><span>شماره تماس:</span><strong dir="auto">${esc(v.customer?.phone||'—')}</strong></div>
            <div><span>پلاک:</span>${plateViewHtml(v.customer?.plate, 'بدون پلاک', true)}</div>
            <div><span>زمان ورود:</span><strong>${esc(formatDateTime24(v.createdAt))}</strong></div>
            ${app.features?.experimentalTransport?`<div class="sd-onsite-delivery" title="سفارش بیعانه‌دار فقط تحویل در انبار است.">${deliveryModeInputHtml('onsite')}</div>`:''}
          </div>
        </div>
      </div>
      <div class="sd-oe-layout">
        <section class="sd-panel">
          <div class="sd-lines-head"><div><h3>اقلام سفارش</h3><p>محصول را با نام یا کد سریع دو رقمی انتخاب کنید؛ توضیحات هر ردیف جداگانه ثبت می‌شود.</p></div><span class="sd-chip">کیلوگرم / بسته / عدد / کارتن</span></div>
          <div class="sd-lines-body"><div id="orderLines" class="sd-lines"></div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px;flex-wrap:wrap"><button class="btn btn-secondary" data-action="add-line">${icon('plus',16)} افزودن ردیف محصول</button><span style="font-size:11.5px;color:var(--muted)">برای حذف هر ردیف از آیکن سطل استفاده کنید.</span></div>
          </div>
        </section>
        
      </div>
    </div>`;
    renderOrderLines(); updateOrderDraftSummary();finishEntityNotices(notices);return true;
  }catch(e){toast(e.message);return false;}
}
function renderOrderLines(){
  const box=$('#orderLines'); if(!box)return;
  const units=['کیلوگرم','بسته','عدد','کارتن'];
  box.innerHTML=(app.orderDraft||[]).map((x,i)=>`<article class="sd-line sd-line-compact" data-line="${i}">
    <span class="sd-line-no">${fa(String(i+1).padStart(2,'0'))}</span>
    <div class="sd-line-cell cell-product" style="position:relative">
      <div class="input-shell"><span>${icon('search',14)}</span><input data-product-search="${i}" value="${esc(x.productLabel||'')}" placeholder="محصول (نام/کد سریع)" autocomplete="off" aria-label="محصول ردیف ${fa(String(i+1))}"></div>
      <div class="product-suggest" data-suggest-for="${i}"></div>
      ${x.productId?`<span class="sd-picked-inline" title="انتخاب شد">${icon('check',11)}<span class="code-pill">${esc(x.quickCode||'')}</span></span>`:''}
    </div>
    <div class="sd-line-cell cell-qty"><div class="input-shell"><input data-qty="${i}" inputmode="decimal" value="${esc(x.requestedQty||'')}" placeholder="مقدار" aria-label="مقدار ردیف ${fa(String(i+1))}"></div></div>
    <div class="sd-line-cell cell-unit"><div class="input-shell"><select data-unit="${i}" aria-label="واحد ردیف ${fa(String(i+1))}">${units.map(u=>`<option ${x.requestedUnit===u?'selected':''}>${u}</option>`).join('')}</select></div></div>
    <div class="sd-line-cell cell-desc"><div class="input-shell"><input type="text" data-description="${i}" value="${esc(x.description||'')}" maxlength="500" placeholder="توضیح (اختیاری)" aria-label="توضیح ردیف ${fa(String(i+1))}"></div></div>
    <button type="button" class="sd-line-del" data-action="remove-line" data-index="${i}" title="حذف ردیف" aria-label="حذف ردیف">${icon('trash',15)}</button>
  </article>`).join('');
  $$('#orderLines [data-product-search]').forEach(inp=>inp.addEventListener('input',()=>productSearch(inp.dataset.productSearch,inp.value)));
  $$('#orderLines [data-qty]').forEach(inp=>inp.addEventListener('input',()=>{app.orderDraft[Number(inp.dataset.qty)].requestedQty=inp.value;updateOrderDraftSummary()}));
  $$('#orderLines [data-unit]').forEach(sel=>sel.addEventListener('change',()=>{app.orderDraft[Number(sel.dataset.unit)].requestedUnit=sel.value;updateOrderDraftSummary()}));
  $$('#orderLines [data-description]').forEach(inp=>inp.addEventListener('input',()=>{app.orderDraft[Number(inp.dataset.description)].description=inp.value;}));
}
function updateOrderDraftSummary(){
  const box=$('#orderDraftSummary');if(!box)return;
  const valid=(app.orderDraft||[]).filter(x=>x.productId&&n(x.requestedQty)>0);
  const total=valid.reduce((s,x)=>s+n(x.requestedQty),0);
  box.innerHTML=`<div style="margin-top:10px"><div class="sd-summary-stat"><span>قلم معتبر</span><strong>${qty(valid.length)}</strong></div><div class="sd-summary-stat"><span>مجموع مقدار</span><strong>${qty(total)}</strong></div>
  <div class="sd-summary-list">${valid.map(x=>`<div><span><span class="code-pill">${esc(x.quickCode||'')}</span>${esc(x.productLabel||'')}</span><b>${qty(x.requestedQty)} ${esc(x.requestedUnit||'')}</b></div>`).join('')||'<div class="empty" style="padding:16px 8px;font-size:12px">هنوز قلم معتبری ثبت نشده است.</div>'}</div></div>`;
}

/* ---------- ردیف محصول مشترک (تلفنی / آینده) ---------- */
function renderProductPickerLine(x,i,prefix='sales'){
  const idx=String(i);
  const units=['کیلوگرم','بسته','عدد','کارتن'];
  const draftKey=({remote:'remoteDraft',phone:'phoneDraft',future:'futureDraft',store:'storeDraft',storeedit:'storeEditDraft',sales:'orderDraft',onsite:'orderDraft'})[prefix]||'orderDraft';
  if(prefix==='store'){ /* v37.5.0 — ردیف تک‌خطی فشرده فرم فروشگاه: کادر محصول باریک‌تر، مقدار/واحد/توضیح در یک خط، کمینه ارتفاع */
    return `<article class="sd-line sd-line-compact" data-line="${idx}">
    <span class="sd-line-no">${fa(String(i+1).padStart(2,'0'))}</span>
    <div class="sd-line-cell cell-product" style="position:relative">
      <div class="input-shell"><span>${icon('search',14)}</span><input data-op-product-search="store-${idx}" value="${esc(x.productLabel||'')}" placeholder="محصول (نام/کد)" autocomplete="off" aria-label="محصول ردیف ${fa(String(i+1))}"></div>
      <div class="product-suggest" data-op-suggest="store-${idx}"></div>
      ${x.productId?`<span class="sd-picked-inline" title="انتخاب شد">${icon('check',11)}<span class="code-pill">${esc(x.quickCode||'')}</span></span>`:''}
    </div>
    <div class="sd-line-cell cell-qty"><div class="input-shell"><input data-op-qty="store-${idx}" inputmode="decimal" value="${esc(x.requestedQty||'')}" placeholder="مقدار" aria-label="مقدار ردیف ${fa(String(i+1))}"></div></div>
    <div class="sd-line-cell cell-unit"><div class="input-shell"><select data-op-unit="store-${idx}" aria-label="واحد ردیف ${fa(String(i+1))}">${units.map(u=>`<option ${x.requestedUnit===u?'selected':''}>${u}</option>`).join('')}</select></div></div>
    <div class="sd-line-cell cell-desc"><div class="input-shell"><input type="text" data-op-desc="store-${idx}" value="${esc(x.description||'')}" maxlength="500" placeholder="توضیح (اختیاری)" aria-label="توضیح ردیف ${fa(String(i+1))}"></div></div>
    <button type="button" class="sd-line-del" data-action="op-remove-line" data-prefix="${prefix}" data-draft-key="${draftKey}" data-index="${idx}" title="حذف ردیف" aria-label="حذف ردیف">${icon('trash',15)}</button>
  </article>`;
  }
  return `<article class="sd-line" data-line="${idx}">
    <span class="sd-line-no">${fa(String(i+1).padStart(2,'0'))}</span>
    <div class="sd-line-cell cell-product" style="position:relative"><label>محصول (نام یا کد سریع)</label>
      <div class="input-shell"><span>${icon('search',15)}</span><input data-op-product-search="${prefix}-${idx}" aria-label="محصول ردیف ${fa(String(i+1))}" value="${esc(x.productLabel||'')}" placeholder="مثلاً 01 یا ران مرغ" autocomplete="off"></div>
      <div class="product-suggest" data-op-suggest="${prefix}-${idx}"></div>
      <div class="sd-picked ${x.productId?'':'none'}">${x.productId?`${icon('check',13)} انتخاب شد <span class="code-pill">${esc(x.quickCode||'')}</span>`:'هنوز محصولی انتخاب نشده'}</div>
    </div>
    <div class="sd-line-cell cell-qty"><label>مقدار</label><div class="input-shell"><input data-op-qty="${prefix}-${idx}" aria-label="مقدار ردیف ${fa(String(i+1))}" inputmode="decimal" value="${esc(x.requestedQty||'')}" placeholder="۰"></div></div>
    <div class="sd-line-cell cell-unit"><label>واحد</label><div class="input-shell"><select data-op-unit="${prefix}-${idx}" aria-label="واحد ردیف ${fa(String(i+1))}">${units.map(u=>`<option ${x.requestedUnit===u?'selected':''}>${u}</option>`).join('')}</select></div></div>
    <div class="sd-line-cell cell-desc"><label>توضیحات ردیف</label><div class="input-shell"><input type="text" data-op-desc="${prefix}-${idx}" aria-label="توضیح ردیف ${fa(String(i+1))}" value="${esc(x.description||'')}" maxlength="500" placeholder="توضیح برای انبار..."></div></div>
    <button type="button" class="sd-line-del" data-action="op-remove-line" data-prefix="${prefix}" data-draft-key="${draftKey}" data-index="${idx}" title="حذف ردیف" aria-label="حذف ردیف">${icon('trash',16)}</button>
  </article>`;
}
function renderFutureLineRow(x,i){ return renderProductPickerLine(x,i,'future'); }

/* ---------- تب ۲: غیرحضوری ---------- */
function sdStoreCard(o){
  return `<article class="sd-store-card">
    <div class="sd-store-top">
      <div><div class="sd-chips"><span class="order-code">${esc(fa(o.orderNo||'—'))}</span>${sdTypeBadge(o)}</div>
        <h3>${esc(o.storeName||'فروشگاه')}</h3><p></p></div>
      <span class="badge orange">در انتظار تأیید</span>
    </div>
    <div class="sd-store-items">${activeItemsOf(o).map((it,k)=>`<div><span class="sd-row-no">${fa(String(k+1))}</span><span>${esc(it.product?.name||'—')}</span><b>${qty(it.requestedQty)} ${esc(it.requestedUnit||'')}</b></div>`).join('')||'<div class="empty" style="padding:14px">قلمی در این سفارش ثبت نشده است.</div>'}</div>
    <div class="sd-store-meta"><span><b>ثبت سفارش:</b> ${formatDateTime24(o.createdAt)}</span><span><b>یادداشت:</b> ${esc(o.notes||'بدون یادداشت')}</div>
    <div class="sd-store-foot"><div class="toolbar"><button class="btn btn-secondary btn-sm" data-action="store-order-details-v25" data-id="${o.id}">${icon('eye',14)} جزئیات</button><button class="btn btn-secondary btn-sm" data-action="sales-edit-store-order" data-id="${o.id}">${icon('edit',14)} ویرایش سفارش</button><button class="btn btn-primary btn-sm" data-action="store-approve-v25" data-id="${o.id}">${icon('calendar',14)} تأیید و تعیین زمان</button></div></div>
  </article>`;
}
function remotePhoneQueueRowsV40(orders){
  const queue=(Array.isArray(orders)?orders:[]).filter(o=>o&&o.orderType==='REMOTE'&&['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','RETURNED_TO_SALES','SETTLEMENT_PENDING'].includes(o.status));
  const rows=queue.map(o=>orderSummaryRow(o,{className:'phone-queue-card-v40',statusHtml:badge(o.status),itemCount:activeItemsOf(o).length,extras:[{html:`شماره تماس: ${esc(storeAwareOrderPhone(o)||'—')}`}],actionsHtml:`<button class="btn btn-secondary btn-sm" data-action="order-details" data-id="${esc(o.id)}">${icon('eye',14)} جزئیات سفارش</button>${canSalesEditRemote(o)?`<button type="button" class="btn btn-secondary btn-sm" data-action="future-edit" data-id="${esc(o.id)}">ویرایش سفارش</button>`:''}`})).join('');
  return {queue,html:rows||salesEmptyV25('phone','سفارش تلفنی فعالی در روند نیست','پس از ثبت سفارش غیرحضوری، اینجا قابل پیگیری است.')};
}
function renderSalesRemoteV32(orders){
  const all=Array.isArray(orders)?orders:[];
  const {queue,html:queueHtml}=remotePhoneQueueRowsV40(all);
  const phoneQueue=queue;
  return `<section class="sales-pane-v25 sales-pane-v40" data-sales-pane="remote"><div class="sales-panel-v25 telephone-form-v25">
    <div class="sales-section-title-v25 phone-form-title"><h2>ثبت سفارش غیرحضوری</h2></div>
    <form id="phoneOrderFormV25" class="sales-form-v25 sales-form-v40">
      ${salesCustomerPickerHtml('phone')}
      <div class="sales-customer-grid-v25 sales-remote-customer-grid-v40">
        <div class="field contact-field-v41"><label for="phoneCustomerName">نام مشتری</label><div class="input-shell"><span>${icon('user',18)}</span><input id="phoneCustomerName" name="name" required placeholder="نام و نام خانوادگی"></div></div>
        <div class="field contact-field-v41"><label for="phoneCustomerPhone">شماره تماس</label><div class="input-shell"><span>${icon('phone',18)}</span><input id="phoneCustomerPhone" name="phone" required inputmode="tel" placeholder="۰۹۱۲ ..."></div></div>
        ${app.features?.experimentalTransport?deliveryModeInputHtml('phone'):''}
        <div class="field sales-remote-place-v40" data-sales-dispatch-place><label for="phoneDispatchPlace">محل ارسال</label><div class="input-shell"><span>${icon('truck',18)}</span><input id="phoneDispatchPlace" name="dispatchPlace" placeholder="مقصد یا آدرس ارسال"></div></div>

      </div>
      ${app.features?.pickupStaging?jalaliInput('تاریخ تحویل در انبار','deliveryDate',today(),true):''}
      <div class="sales-items-head-v25"><div><span class="eyebrow">ORDER LINES</span><h3>اقلام سفارش</h3><p>با کلیدهای جهت‌دار محصول را انتخاب کنید؛ Enter از مقدار و واحد به توضیح می‌رود و در پایان ردیف، قلم بعدی را باز می‌کند. Insert نیز ردیف جدید می‌افزاید؛ ارسال فقط با دکمهٔ ثبت انجام می‌شود.</p></div></div>
      <div id="phone-lines" class="op-lines"></div>
      <div class="sales-lines-add-v41"><button type="button" class="btn btn-secondary" data-action="phone-add-line">${icon('plus',18)} افزودن ردیف محصول</button></div>
      <div class="sd-note-box sales-phone-notes-v40"><div class="sd-note-head"><span>${icon('info',17)}</span><div><strong>یادداشت تکمیلی</strong><small>هماهنگی مشتری، بسته‌بندی یا نکته‌ای که لازم است فروش و انبار بدانند.</small></div></div><textarea aria-label="یادداشت تکمیلی سفارش" name="notes" maxlength="1000" rows="4" placeholder="توضیحات سفارش را اینجا وارد کنید..."></textarea><div class="sd-note-foot"><span>حداکثر ۱۰۰۰ نویسه</span><span>متن برای واحد فروش و انبار ذخیره می‌شود.</span></div></div>
      ${depositEntryHtml()}
      <div class="sales-form-bottom-v25"><span class="form-helper-v32">واحدهای مجاز: کیلوگرم، بسته، عدد، کارتن</span><button type="submit" class="btn btn-primary btn-lg">${icon('send',18)} ثبت و ارسال به انبار</button></div>
    </form>
  </div><section class="sales-panel-v25 phone-queue-panel-v40"><div class="sales-section-title-v25"><div><span class="eyebrow">REMOTE ORDERS</span><h2>سفارش‌های تلفنی در روند</h2><p>فقط سفارش‌های غیرحضوری؛ برای ریز اقلام و گردش انبار، جزئیات را باز کنید.</p></div><div class="sales-section-count"><strong>${qty(phoneQueue.length)}</strong><span>سفارش</span></div></div><div class="phone-queue-list-v40">${queueHtml}</div></section></section>`;
}
function sdStoreInvoiceChips(o){
  const pays=Array.isArray(o.payments)?o.payments:[];
  if(!pays.length) return '';
  return `<div class="sd-store-invoices">${pays.slice().sort((a,b)=>(a.deliveryRun||0)-(b.deliveryRun||0)).map(p=>{
    const netKg=(p.priceLines||[]).reduce((sum,l)=>sum+Number(l.deliveredKg||0),0);
    const run=p.deliveryRun?` · سرویس ${p.deliveryRun===2?'دوم':'اول'}`:'';
    return `<span class="sd-store-invoice-chip" title="سند تحویل (بدون مبلغ)">${icon('receipt',12)} سند <b>${esc(fa(p.invoiceNumber||'—'))}</b>${run} · <b>${qty(netKg)}</b> کیلوگرم${p.verifiedAt?` · ${esc(formatDateTime24(p.verifiedAt))}`:''}<button class="btn chip-btn" type="button" data-action="invoice" data-id="${esc(o.id)}"${p.deliveryRun?` data-run="${p.deliveryRun}"`:''}>${icon('eye',11)} نمایش</button><button class="btn chip-btn" type="button" data-action="print-invoice" data-id="${esc(o.id)}"${p.deliveryRun?` data-run="${p.deliveryRun}"`:''}>${icon('receipt',11)} چاپ</button></span>`;
  }).join('')}</div>`;
}
function sdStoreTotalsLine(o){
  const items=activeItemsOf(o);
  const requested=items.reduce((sum,i)=>sum+n(i.requestedQty),0);
  const delivered=items.reduce((sum,i)=>sum+n(i.deliveredKg||0),0);
  return `<span>${qty(items.length)} قلم</span><span>درخواستی <b>${qty(requested)} کیلوگرم</b></span>${delivered>0?`<span>تحویلی <b>${qty(delivered)} کیلوگرم</b></span>`:''}`;
}
function storeReceiptEntries(o){
  const ds=[...(o.dispatchRuns||o.dispatches||[]),...(o.dispatch?[o.dispatch]:[])];
  return ds.filter(d=>d&&['DELIVERED','SALES_FINALIZED','CLOSED'].includes(d.status)).map(d=>{const confirmedAt=d.storeReceiptConfirmedAt||(!d.run?o.storeReceiptConfirmedAt:null);return {run:Number(d.run)||0,confirmed:!!confirmedAt,confirmedAt};}).filter((d,i,a)=>a.findIndex(x=>x.run===d.run)===i);
}
function storeReceiptSummary(o){const rows=storeReceiptEntries(o);if(!rows.length)return '';return `<div class="store-receipt-summary">${rows.map(d=>`<span class="badge ${d.confirmed?'green':'orange'}">${d.run?`سرویس ${d.run===2?'دوم':'اول'}: `:''}${d.confirmed?`دریافت فروشگاه تأیید شد · ${esc(formatDateTime24(d.confirmedAt))}`:'منتظر تأیید دریافت فروشگاه'}</span>`).join('')}</div>`;}
function storeReturnPrintButton(o){return o?.hasReturnedGoods?`<button type="button" class="btn btn-secondary btn-sm" data-action="print-store-return" data-id="${esc(o.id)}">${icon('receipt',14)} چاپ مرجوعی</button>`:'';}
function renderSalesStoresV41(orders,deliveries={}){ // v37.7.9 — فروشگاه با چهار سربرگ عمودی
  const all=(Array.isArray(orders)?orders:[]).filter(o=>o&&o.orderType==='STORE');
  const incoming=all.filter(o=>o.status==='STORE_PENDING_SALES').sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  const approved=all.filter(o=>o.status==='SCHEDULED_REMOTE').sort((a,b)=>String(a.scheduledAt||a.createdAt||'').localeCompare(String(b.scheduledAt||b.createdAt||'')));
  const processing=all.filter(o=>['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','RETURNED_TO_SALES'].includes(o.status)).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));
  const history=all.filter(o=>['CLOSED','SETTLED','EXITED','OUT_OF_STOCK'].includes(o.status)||(o.payments||[]).length>0||storeReceiptEntries(o).some(d=>d.confirmed)).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));
  const card=(o,kind)=>{
    const storeSub=o.storeOrderKind==='PARTIAL'?'سفارش جزئی':'سفارش روزانه';
    const customerSub=o.storeOrderKind==='PARTIAL'&&o.storePurpose==='STOCK'?'تأمین تکمیلی فروشگاه':o.customer?.name?`مشتری: ${esc(o.customer?.name||'—')}`:'';
    const actions=`<button class="btn btn-secondary btn-sm" data-action="store-order-details-v25" data-id="${esc(o.id)}">${icon('eye',14)} ${kind==='history'?'جزئیات':'جزئیات سفارش'}</button>${kind==='incoming'?`<button class="btn btn-secondary btn-sm" data-action="sales-edit-store-order" data-id="${esc(o.id)}">${icon('edit',14)} ویرایش سفارش</button><button class="btn btn-primary btn-sm" data-action="store-approve-v25" data-id="${esc(o.id)}">${icon('calendar',14)} تأیید و تعیین زمان</button><button class="btn btn-secondary btn-sm" data-action="store-quick-send-v40" data-id="${esc(o.id)}">${icon('send',14)} تأیید و ارسال سریع</button>`:''}${kind==='approved'?`<button class="btn btn-secondary btn-sm" data-action="store-quick-send-v40" data-id="${esc(o.id)}">${icon('send',14)} ارسال سریع به انبار</button>`:''}${kind==='processing'&&o.status==='RETURNED_TO_SALES'?`<button class="btn btn-secondary btn-sm" data-action="edit-returned-order" data-id="${esc(o.id)}">${icon('edit',14)} اصلاح سفارش</button><button class="btn btn-primary btn-sm" data-action="resubmit-order" data-id="${esc(o.id)}">${icon('send',14)} ارسال مجدد به انبار</button>`:''}${kind==='processing'&&o.dispatch&&o.dispatch.status==='DELIVERED'?`<button class="btn btn-primary btn-sm" data-action="sales-finalize-driver-delivery" data-id="${esc(o.id)}">${icon('check',14)} تأیید نهایی تحویل${o.dispatch.run?` سرویس ${o.dispatch.run===2?'دوم':'اول'}`:''}</button>`:''}${kind==='processing'?storeSalesReviewButtons(o):''}${kind==='processing'||kind==='history'?storeSalesDocumentButtons(o,kind==='history',kind!=='history'):''}${kind==='history'?storeReturnPrintButton(o):''}`;
    const notes=(kind==='processing'&&warehouseReturnNoteHtml(o)?warehouseReturnNoteHtml(o):'')+(kind==='processing'&&storeReceiptSummary(o)?storeReceiptSummary(o):'')+(kind==='history'?storeReceiptSummary(o):'');
    return `<tr data-store-summary-id="${esc(o.id)}">
      <td data-label="فروشگاه"><span class="bt-cell-main">${esc(o.storeName||'فروشگاه')}</span><span class="bt-cell-sub">${storeSub}${customerSub?` · ${customerSub}`:''}</span></td>
      <td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td>
      <td data-label="تاریخ">${esc(formatDateTime24(o.createdAt))}</td>
      <td data-label="وضعیت">${badge(o.status)}</td>
      <td data-label="اقلام">${qty(activeItemsOf(o).length)} قلم</td>
      <td data-label="عملیات" class="bt-col-actions">${actions}${notes?`<div class="bt-cell-notes">${notes}</div>`:''}</td>
    </tr>`;
  };
  // v37.33.0 — محموله‌های ارسالی انبار (هر دو سرویس) در سربرگ «ورودی» فروشگاه‌های فروش نمایش داده می‌شوند (جای قبلی: «در جریان»؛ فروش آن‌ها را در ورودی پیدا نمی‌کرد)
  const shipmentsPanel=renderStoreRunShipmentsPanel(deliveries.storeRunShipments||[]);
  const panel=(id,title,rows,kind,emptyTitle,emptyText,extra='')=>`<section class="sales-store-subpanel-v43" data-store-section="${id}"${(app.salesStoreTab||'incoming')===id?'':' hidden'}><header class="sales-store-subhead-v43"><h2>${title}</h2><span>${qty(rows.length)} سفارش</span></header>${extra}<div class="bt-table-wrap"><table class="bt-table sd-store-table"><thead><tr><th>فروشگاه</th><th>شماره سفارش</th><th>تاریخ</th><th>وضعیت</th><th>اقلام</th><th>عملیات</th></tr></thead><tbody>${rows.map(o=>card(o,kind)).join('')||`<tr><td colspan="6">${salesEmptyV25('sales',emptyTitle,emptyText)}</td></tr>`}</tbody></table></div></section>`;
  const shipCount=(deliveries.storeRunShipments||[]).length;
  const tabs=[['incoming','ورودی',incoming.length+shipCount],['processing','در جریان',processing.length],['approved','تأیید شده',approved.length],['history','سوابق',history.length]];
  const active=(tabs.some(t=>t[0]===app.salesStoreTab)?app.salesStoreTab:'incoming');
  return `<section class="sales-pane-v25 sales-store-pane-v40 sales-store-pane-v41 sales-store-pane-v42 sales-store-pane-v43" data-sales-pane="stores" data-sales-store-layout="v43"><nav class="sales-store-tabs-v43" aria-label="بخش‌های سفارش فروشگاه">${tabs.map(([id,label,count])=>`<button type="button" class="sales-store-tab-v43 ${active===id?'active':''}" data-store-subtab="${id}" aria-selected="${active===id}"><span>${label}</span><b>${qty(count)}</b></button>`).join('')}</nav><div class="sales-store-subpanels-v43">${panel('incoming','ورودی',incoming,'incoming',shipCount?'سفارش تازه‌ای در انتظار تأیید نیست':'سفارش ورودی وجود ندارد',shipCount?'محموله‌های وزن‌شدهٔ انبار در بالای همین بخش نمایش داده شده‌اند و برای هرکدام باید راننده تعیین شود.':'سفارش‌های تازهٔ فروشگاه در این بخش نمایش داده می‌شوند.',shipmentsPanel)}${panel('processing','در جریان',processing,'processing','سفارشی در جریان نیست','سفارش‌های در حال بررسی یا آماده‌سازی در این بخش دیده می‌شوند.')}${panel('approved','تأیید شده',approved,'approved','سفارش تأییدشده‌ای نیست','پس از تأیید و تعیین زمان، سفارش در این بخش قرار می‌گیرد.')}${panel('history','سوابق',history,'history','سابقه‌ای ثبت نشده است','سفارش‌های تکمیل‌شده و تأیید دریافت فروشگاه در این بخش نگهداری می‌شوند.')}</div></section>`;
}
/* ---------- تب ۳: در جریان ---------- */
function pickupSalesActions(o){
 if(!app.features?.pickupStaging||o.orderType!=='REMOTE'||o.deliveryMode!=='PICKUP')return '';
 if(o.pickupCancellation?.status==='PENDING_SALES')return `<button type="button" class="btn btn-primary btn-sm" data-action="pickup-approve" data-id="${esc(o.id)}">تأیید انصراف</button>`;
 if(!o.pickupHandover&&!o.warehouseCompletedAt&&o.visit?.status!=='PICKUP_PRESENT')return `<button type="button" class="btn btn-secondary btn-sm" data-action="pickup-date" data-id="${esc(o.id)}">تعیین تاریخ تحویل</button>`;
 return '';
}
async function pickupChangeDate(id){
 try{const {order:o}=await api('/api/orders/'+encodeURIComponent(id));openModal('تعیین تاریخ تحویل',`<form id="pickupDateForm">${jalaliInput('تاریخ تحویل','deliveryDate',o.deliveryDate||today(),true)}<p>این تاریخ مستقل از زمان ورود سفارش به انبار است.</p><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button><button class="btn btn-primary">ثبت تاریخ</button></div></form>`);const form=$('#pickupDateForm');bindJalaliDates(form);form.addEventListener('submit',async e=>{e.preventDefault();const date=new FormData(form).get('deliveryDate');try{await api('/api/pickup/'+encodeURIComponent(id)+'/delivery-date',{method:'PUT',body:JSON.stringify({deliveryDate:date})});closeModal();toast('تاریخ تحویل ثبت شد.');await fetchSalesCache(true);await renderSales(app.sub.sales);}catch(err){toast(err.message);}});}catch(err){toast(err.message);}
}
async function pickupApprove(id,button){
 if(!confirm('انصراف و عدم تحویل تأیید شود؟ بیعانه برای استرداد دستی در انتظار می‌ماند.'))return;
 button.disabled=true;try{await api('/api/pickup/'+encodeURIComponent(id)+'/cancellation-approval',{method:'POST',body:'{}'});toast('انصراف تأیید شد؛ نگهبانی خروج را ثبت می‌کند.');await fetchSalesCache(true);await renderSales(app.sub.sales);await refreshIndicators();}catch(e){button.disabled=false;toast(e.message);}
}
function sdFlowCard(o,idx){
 const items=activeItemsOf(o);
 const extras=[{html:`شماره تماس: ${esc(storeAwareOrderPhone(o)||'—')}`},{html:`محل ارسال: ${esc(o.dispatchPlace||'ثبت نشده')}`},{html:`آخرین اقدام: ${esc(formatDateTime24(o.updatedAt||o.createdAt))}`}];
 if(o.scheduledAt)extras.push({html:`زمان ارسال: ${esc(salesOrderDateTime(o))}`});
 if(o.storeRun&&o.storeRun.enabled)extras.push({html:sr38Chips(o)});
 if(o.status==='RETURNED_TO_SALES'&&o.warehouseReturn?.reason)extras.push({html:warehouseReturnNoteHtml(o),className:'order-summary-note'});
 const actions=`<button class="btn btn-secondary btn-sm" data-action="order-details" data-id="${esc(o.id)}">${icon('eye',14)} جزئیات سفارش</button>${pickupSalesActions(o)}${o.status==='RETURNED_TO_SALES'&&o.pickupCancellation?.status!=='PENDING_SALES'?`<button class="btn btn-secondary btn-sm" data-action="edit-returned-order" data-id="${esc(o.id)}">${icon('edit',14)} اصلاح سفارش</button><button class="btn btn-primary btn-sm" data-action="resubmit-order" data-id="${esc(o.id)}">${icon('send',14)} ارسال مجدد به انبار</button>`:''}`;
 return orderSummaryRow(o,{className:`sd-flow-card sd-flow-card-1line ${sdStatusAccent(o.status)}`,statusHtml:badge(o.status),itemCount:items.length,extras:[{html:sdTypeBadge(o)},...extras],actionsHtml:actions});
}
function salesFlowRowsV27(orders){ return (orders||[]).map(sdFlowCard).join(''); }
function renderSalesFlowV25(orders){
  return `<section class="sd-pane"><section class="sd-panel">
    <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico" style="background:var(--blue-bg);color:var(--blue)">${icon('truck',20)}</span><div><h2>سفارش‌های در جریان</h2><p>تمام سفارش‌هایی که به انبار ارسال شده‌اند یا برای اصلاح برگشته‌اند.</p></div></div><div class="sd-count"><strong>${qty(orders.length)}</strong><span>سفارش</span></div></div>
    <div class="sd-flow-toolbar"><span class="sd-live"><i></i> مرتب بر اساس آخرین اقدام</span><span class="sd-legend"><span><i class="orange"></i>در صف انبار</span><span><i class="purple"></i>در حال آماده‌سازی</span><span><i class="gray"></i>برگشت به فروش</span></span></div>
    <div class="v26-flow-list sd-flow-list" style="padding:10px 14px 12px">${salesFlowRowsV27(orders)||sdEmpty('truck','سفارشی در جریان نیست','هر سفارشی که به انبار ارسال شود در این فهرست قرار می‌گیرد.')}</div>
  </section></section>`;
}

/* ---------- تب ۴: تسویه ---------- */
// v37.6.1 — مرز «آماده تسویه» و «فاکتور صادرشده» در گردش پخش:
// به‌محض چاپ برگهٔ ارسال، فاکتور صادرشده است؛ سفارش از صف تسویه بیرون می‌رود و
// در فهرست فاکتورهای صادرشده می‌نشیند (پیش از این در هیچ‌کدام دیده نمی‌شد).
function salesTransportInvoiceIssued(o){const inv=o&&o.transportInvoice;return !!inv&&(inv.status==='CLOSED'||!!inv.printedAt);}
function salesSettlementPendingOrders(orders){return (orders||[]).filter(o=>o.status==='SETTLEMENT_PENDING'&&!salesTransportInvoiceIssued(o));}
function salesSettlementIssuedOrders(orders){return (orders||[]).filter(o=>['SETTLED','EXITED'].includes(o.status)||((o.payments||[]).length&&!['SETTLEMENT_PENDING','CANCELLED'].includes(o.status)&&!o.payment?.archived)||salesTransportInvoiceIssued(o));}
function renderSalesSettlementV25(orders){
  const pending=salesSettlementPendingOrders(orders);
  const finalized=salesSettlementIssuedOrders(orders); // v37.5.0 — فاکتور هر سرویس سفارش فروشگاه هم دیده می‌شود
  return `<section class="sd-pane stl-pane">
    <div class="stl-layout stl-layout-table">
      <aside class="sd-panel stl-queue-panel stl-queue-panel-table">
        <div class="stl-block-head"><div><span class="stl-eyebrow">۰۴ / تسویه</span><h2>آماده تسویه</h2></div><span class="sd-count" style="min-width:56px"><strong>${qty(pending.length)}</strong><span>سفارش</span></span></div>
        <div class="v26-settlement-list stl-queue-list">${settlementPendingRowsV27(pending)}</div>
      </aside>
      <section class="stl-main" id="stlMain">${stl.orderId ? '' : stlEmptyHtml()}</section>
    </div>
    <section class="sd-panel">
      <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico" style="background:var(--green-bg);color:var(--green)">${icon('receipt',19)}</span><div><h2>فاکتورهای صادرشده</h2><p>نمایش، چاپ و پیگیری وضعیت تأیید خروج نزد نگهبانی.</p></div></div><div class="sd-count"><strong>${qty(finalized.length)}</strong><span>فاکتور</span></div></div>
      <div class="v26-invoice-list sd-invoice-list">${invoiceRowsV27(finalized)}</div>
    </section>
  </section>`;
}
function settlementPendingRowsV27(rows){
 const body=rows.map(o=>{
  const name=storeAwareOrderName(o),number=fa(o.orderNo||'—');
  const description=`${name}، شماره سفارش ${number}، تاریخ ${formatDateTime24(o.createdAt)}، ${qty(activeItemsOf(o).length)} قلم، آماده تسویه`;
  return `<tr class="stl-queue-row ${stl.orderId===o.id?'active':''}" data-stl="select" data-action="select-settlement" data-id="${esc(o.id)}" title="${esc(description)}" aria-label="${esc(description)}">
    <td data-label="نام مشتری"><span class="bt-cell-main">${esc(name)}</span></td>
    <td data-label="شماره سفارش"><bdi>${esc(number)}</bdi></td>
    <td data-label="تاریخ">${formatDateTime24(o.createdAt)}</td>
    <td data-label="اقلام">${qty(activeItemsOf(o).length)} قلم</td>
    <td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-primary btn-sm" data-stl="select" data-action="select-settlement" data-id="${esc(o.id)}">تسویه</button></td>
  </tr>`;
 }).join('');
 return `<div class="bt-table-wrap"><table class="bt-table stl-queue-table"><thead><tr><th>نام مشتری</th><th>شماره سفارش</th><th>تاریخ</th><th>اقلام</th><th>عملیات</th></tr></thead><tbody>${body||'<tr><td colspan="5"><div class="stl-q-empty">سفارشی در انتظار تسویه نیست.</div></td></tr>'}</tbody></table></div>`;
}

function transportIssuedInvoiceRow(o){
 const inv=o.transportInvoice||{},departed=!!o.transportDeparture,closed=inv.status==='CLOSED'||o.status==='CLOSED';
 const status=closed?'<span class="badge green">فاکتور بسته شد</span>':departed?'<span class="badge green">در راه</span>':'<span class="badge orange">در انتظار خروج</span>';
 const stamp=inv.closedAt||o.transportDeparture?.at||inv.printedAt||inv.createdAt;
 const actions=`<button class="btn btn-secondary btn-sm" data-action="transport-invoice-open" data-id="${esc(o.id)}">${icon('eye',13)} فاکتور</button><button class="btn btn-primary btn-sm" data-action="transport-shipment-print" data-id="${esc(o.id)}">${icon('receipt',13)} برگهٔ ارسال</button>`;
 return `<tr data-transport-invoice="${esc(o.id)}"><td data-label="نام مشتری">${esc(storeAwareOrderName(o))}</td><td data-label="شماره تماس">${esc(fa(storeAwareOrderPhone(o)))}</td><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="شماره فاکتور">${esc(fa(inv.invoiceNumber||'—'))}</td><td data-label="مبلغ / نوع سند">${money(inv.totalAmount||0)}</td><td data-label="وضعیت و تاریخ">${status}<small>${esc(formatDateTime24(stamp||''))}</small></td><td data-label="عملیات"><div class="toolbar">${actions}</div></td></tr>`;
}
function invoiceRowsV27(rows){
 const transportRows=rows.filter(o=>salesTransportInvoiceIssued(o)&&!((o.payments||[]).length)).map(transportIssuedInvoiceRow).join('');
 const body=rows.flatMap(o=>(o.payments&&o.payments.length>1?o.payments:[o.payment]).filter(Boolean).map(pay=>{
  const run=pay.deliveryRun||null;
  const edit=(o.documentEdits||[]).slice().reverse().find(row=>row.paymentId===pay.id);
  if(edit?.status==='PENDING_WAREHOUSE')return '';
  const status=o.transportWorkflow===1&&o.status==='CLOSED'?'<span class="badge green">فاکتور بسته شد</span>':o.status==='EXITED'?'<span class="badge green">خروج ثبت شد</span>':(run&&o.status==='CLOSED')?'<span class="badge green">نهایی و بسته‌شده</span>':'<span class="badge orange">آماده خروج</span>';
  const review=pay.settlementReviewRequired||edit?.status==='PENDING_SALES_REVIEW';
  const role=normalizeRole(app.user?.roleCode),stamp=Date.parse(pay.verifiedAt||pay.createdAt||o.warehouseCompletedAt||'');
  const salesExpired=!Number.isFinite(stamp)||serverEpoch()>stamp+72*60*60*1000;
  const warehouseStamp=Date.parse(o.warehouseCompletedAt||pay.verifiedAt||pay.createdAt||'');
  const warehouseExpired=!Number.isFinite(warehouseStamp)||serverEpoch()>warehouseStamp+72*60*60*1000;
  const editLocked=salesExpired&&role!=='admin',warehouseLocked=warehouseExpired&&role!=='admin';
  const editActions=o.orderType==='STORE'?'':`<button class="btn btn-secondary btn-sm" data-action="sales-invoice-edit" data-id="${esc(o.id)}" data-payment-id="${esc(pay.id)}" ${editLocked?'disabled title="مهلت ویرایش گذشته است؛ فقط مدیر مجاز است"':''}>${icon('edit',13)} ${editLocked?'فقط مدیر':review?'بازبینی':'ویرایش تسویه'}</button>`;
  const warehouseAction=edit?.status==='PENDING_SALES_REVIEW'?'':`<button class="btn btn-ghost btn-sm" data-action="sales-warehouse-edit-request" data-id="${esc(o.id)}" data-payment-id="${esc(pay.id)}" ${warehouseLocked?'disabled title="مهلت ارجاع اصلاح گذشته است؛ فقط مدیر مجاز است"':''}>${icon('scale',13)} ${warehouseLocked?'مدیر: اصلاح وزن':'اصلاح وزن'}</button>`;
  const actions=`<button class="btn btn-secondary btn-sm" data-action="invoice" data-id="${esc(o.id)}"${run?` data-run="${run}"`:''}>${icon('eye',13)} فاکتور</button><button class="btn btn-primary btn-sm" data-action="print-invoice" data-id="${esc(o.id)}"${run?` data-run="${run}"`:''}>${icon('receipt',13)} چاپ</button>${editActions}${warehouseAction}`;
  const badges=`${status}${review?'<span class="badge orange">نیازمند بازبینی فروش</span>':''}`;
  return `<tr><td data-label="نام مشتری">${esc(storeAwareOrderName(o))}</td><td data-label="شماره تماس">${esc(fa(storeAwareOrderPhone(o)))}</td><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="شماره فاکتور">${esc(fa(pay.invoiceNumber||'—'))}${run?` · ${o.storeOrderKind==='PARTIAL'?'جزئی':'سرویس '+fa(run)}`:''}</td><td data-label="مبلغ / نوع سند">${o.orderType==='STORE'?'سند وزنی — بدون مبلغ':money(pay.totalAmount||0)}</td><td data-label="وضعیت و تاریخ">${badges}<small>${esc(formatDateTime24(pay.verifiedAt||o.updatedAt||o.createdAt))}</small></td><td data-label="عملیات"><div class="toolbar">${actions}</div></td></tr>`;
 })).join('');
 const allRows=transportRows+body;
 return allRows?`<table class="settlement-invoice-table"><thead><tr>${['نام مشتری','شماره تماس','شماره سفارش','شماره فاکتور','مبلغ / نوع سند','وضعیت و تاریخ','عملیات'].map(t=>`<th scope="col">${t}</th>`).join('')}</tr></thead><tbody>${allRows}</tbody></table>`:sdEmpty('receipt','فاکتور نهایی‌شده‌ای وجود ندارد','پس از تسویه یا چاپ برگهٔ ارسال، فاکتور در این فهرست قرار می‌گیرد.');
}
const DOCUMENT_EDIT_METHODS=[['CASH','نقدی'],['POS','پوز'],['CARD_TRANSFER','کارت‌به‌کارت'],['CHECK','چک'],['CREDIT','معوق']];
