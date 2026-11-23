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
    <td data-label="نام مشتری"><span class="bt-cell-main">${esc(v.customer?.name||'—')}</span></td>
    <td data-label="نوع خودرو">${esc(v.vehicleType||v.customer?.vehicleType||'—')}</td>
    <td data-label="زمان ورود">${formatDateTime24(v.createdAt)}</td>
    <td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-primary btn-sm" data-action="open-order" data-id="${esc(v.id)}">ثبت سفارش ${icon('arrow',14)}</button> <button type="button" class="btn btn-secondary btn-sm" data-action="cancel-onsite" data-id="${esc(v.id)}">لغو مراجعه</button></td>
  </tr>`).join('');
  return `<div class="bt-table-wrap"><table class="bt-table sd-queue-table"><thead><tr><th>نام مشتری</th><th>نوع خودرو</th><th>زمان ورود</th><th>عملیات</th></tr></thead><tbody>${rows||`<tr><td colspan="4">${sdEmpty('user','صف حضوری خالی است','با ثبت مراجعه جدید در نگهبانی، مشتری در این فهرست قرار می‌گیرد.')}</td></tr>`}</tbody></table></div>`;
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
  box.innerHTML=renderDraftLinesTable((app.orderDraft||[]).map((x,i)=>renderDraftLine(x,i,'onsite')));
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

/* جدول مستقل اقلام قابل ویرایش در تمام فرم‌های سفارش. */
function renderDraftLinesTable(rows){
  return `<div class="bt-table-wrap draft-lines-wrap"><table class="bt-table draft-lines-table"><caption class="bt-caption">اقلام سفارش</caption><thead><tr>${['ردیف','محصول','مقدار','واحد','توضیحات','عملیات'].map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function renderDraftLine(x,i,prefix){
  const idx=String(i), onsite=prefix==='onsite';
  const key=onsite?idx:`${prefix}-${idx}`;
  const draftKey=({remote:'remoteDraft',phone:'phoneDraft',future:'futureDraft',store:'storeDraft',storeedit:'storeEditDraft',sales:'orderDraft',onsite:'orderDraft'})[prefix]||'orderDraft';
  const units=['کیلوگرم','بسته','عدد','کارتن'];
  return `<tr data-line="${idx}">
    <td data-label="ردیف"><span class="sd-line-no">${fa(String(i+1).padStart(2,'0'))}</span></td>
    <td data-label="محصول"><div class="sd-line-cell cell-product draft-product">
      <div class="input-shell"><span>${icon('search',14)}</span><input ${onsite?'data-product-search':'data-op-product-search'}="${key}" value="${esc(x.productLabel||'')}" placeholder="محصول (نام/کد سریع)" autocomplete="off" aria-label="محصول ردیف ${fa(String(i+1))}"></div>
      <div class="product-suggest" ${onsite?'data-suggest-for':'data-op-suggest'}="${key}"></div>
      ${!['onsite','phone','remote','future','store','storeedit'].includes(prefix)?(x.productId?`<span class="sd-picked-inline" title="انتخاب شد">${icon('check',11)}<span class="code-pill">${esc(x.quickCode||'')}</span></span>`:(prefix!=='store'?'<span class="draft-not-picked">هنوز محصولی انتخاب نشده</span>':'')):''}
    </div></td>
    <td data-label="مقدار"><div class="sd-line-cell cell-qty"><div class="input-shell"><input ${onsite?'data-qty':'data-op-qty'}="${key}" inputmode="decimal" value="${esc(x.requestedQty||'')}" placeholder="مقدار" aria-label="مقدار ردیف ${fa(String(i+1))}"></div></div></td>
    <td data-label="واحد"><div class="sd-line-cell cell-unit"><div class="input-shell"><select ${onsite?'data-unit':'data-op-unit'}="${key}" aria-label="واحد ردیف ${fa(String(i+1))}">${units.map(u=>`<option ${x.requestedUnit===u?'selected':''}>${u}</option>`).join('')}</select></div></div></td>
    <td data-label="توضیحات"><div class="sd-line-cell cell-desc"><div class="input-shell"><input type="text" ${onsite?'data-description':'data-op-desc'}="${key}" value="${esc(x.description||'')}" maxlength="500" placeholder="توضیح (اختیاری)" aria-label="توضیح ردیف ${fa(String(i+1))}"></div></div></td>
    <td data-label="عملیات"><button type="button" class="sd-line-del" data-action="${onsite?'remove-line':'op-remove-line'}" ${onsite?'':`data-prefix="${prefix}" data-draft-key="${draftKey}"`} data-index="${idx}" title="حذف ردیف" aria-label="حذف ردیف">${icon('trash',15)}</button></td>
  </tr>`;
}
function renderProductPickerLine(x,i,prefix='sales'){return renderDraftLine(x,i,prefix);}
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
  const rows=queue.map(o=>`<tr data-order="${esc(o.id)}">
    <td data-label="نام مشتری"><span class="bt-cell-main">${esc(storeAwareOrderName(o)||'—')}</span><span class="bt-cell-sub">${esc(storeAwareOrderPhone(o)||'—')}</span></td>
    <td data-label="شماره سفارش"><bdi>${esc(fa(o.orderNo||'—'))}</bdi></td>
    <td data-label="تاریخ">${esc(formatDateTime24(o.createdAt))}</td>
    <td data-label="وضعیت">${badge(o.status)}</td>
    <td data-label="اقلام">${qty(activeItemsOf(o).length)} قلم</td>
    <td data-label="عملیات" class="bt-col-actions"><div class="bt-actions"><button class="btn btn-secondary btn-sm" data-action="order-details" data-id="${esc(o.id)}">${icon('eye',14)} جزئیات سفارش</button>${canSalesEditRemote(o)?`<button type="button" class="btn btn-secondary btn-sm" data-action="future-edit" data-id="${esc(o.id)}">ویرایش سفارش</button>`:''}</div></td>
  </tr>`).join('');
  const empty=`<tr><td colspan="6">${salesEmptyV25('phone','سفارش تلفنی فعالی در روند نیست','پس از ثبت سفارش غیرحضوری، اینجا قابل پیگیری است.')}</td></tr>`;
  return {queue,html:`<div class="bt-table-wrap"><table class="bt-table phone-queue-table"><caption class="bt-caption">سفارش‌های تلفنی در روند</caption><thead><tr><th scope="col">نام مشتری</th><th scope="col">شماره سفارش</th><th scope="col">تاریخ</th><th scope="col">وضعیت</th><th scope="col">اقلام</th><th scope="col">عملیات</th></tr></thead><tbody>${rows||empty}</tbody></table></div>`};
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
    const actions=`<button class="btn btn-secondary btn-sm" data-action="store-order-details-v25" data-id="${esc(o.id)}">${icon('eye',14)} ${kind==='history'?'جزئیات':'جزئیات سفارش'}</button>${kind==='approved'?`<button class="btn btn-secondary btn-sm" data-action="store-quick-send-v40" data-id="${esc(o.id)}">${icon('send',14)} ارسال سریع به انبار</button>`:''}${kind==='history'?storeSalesDocumentButtons(o,true,false):''}${kind==='history'?storeReturnPrintButton(o):''}`;
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
  const requests=all.filter(o=>(o.storeCancellationRequests||[]).some(r=>r.status==='PENDING'));
  const cancellationPanel=requests.length?`<section class="sd-panel"><h3>درخواست‌های لغو فروشگاه</h3><p>درخواست به‌تنهایی سفارش یا اسناد را لغو نمی‌کند و عملیات تحویل را متوقف نمی‌کند؛ وضعیت کالا، تحویل و امور مالی را بررسی و نتیجه را ثبت کنید.</p>${requests.map(o=>{const r=o.storeCancellationRequests.find(x=>x.status==='PENDING');return `<article data-store-cancel-queue="${esc(o.id)}"><b>${esc(o.storeName||'فروشگاه')} — سفارش ${esc(fa(o.orderNo||'—'))}</b><p>${esc(r.reason)}</p><button type="button" class="btn btn-secondary" data-action="store-order-details-v25" data-id="${esc(o.id)}">بررسی درخواست و جزئیات</button></article>`;}).join('')}</section>`:'';
  const additions=all.filter(o=>(o.storeAdditionRequests||[]).some(r=>r.status==='PENDING_SALES'));
  const additionPanel=additions.length?`<section class="sd-panel"><h3>کالاهای افزوده‌شده به سفارش جزئی</h3><p>پس از تأیید فروش، درخواست برای تأیید انبار ارسال می‌شود.</p>${additions.map(o=>{const r=o.storeAdditionRequests.find(x=>x.status==='PENDING_SALES');return `<article data-store-addition-sales="${esc(o.id)}" data-request="${esc(r.id)}"><b>${esc(o.storeName||'فروشگاه')} — سفارش ${esc(fa(o.orderNo||'—'))}</b><ul>${r.items.map(i=>`<li>${esc(i.productName)} — ${qty(i.requestedQty)} ${esc(i.requestedUnit)} ${i.description?`· ${esc(i.description)}`:''}</li>`).join('')}</ul><button class="btn btn-primary btn-sm" data-action="store-addition-sales" data-id="${esc(o.id)}" data-request="${esc(r.id)}" data-decision="APPROVE">تأیید و ارسال به انبار</button> <button class="btn btn-secondary btn-sm" data-action="store-addition-sales" data-id="${esc(o.id)}" data-request="${esc(r.id)}" data-decision="REJECT">رد درخواست</button></article>`;}).join('')}</section>`:'';
  const shipmentsPanel=additionPanel+cancellationPanel+renderStoreRunShipmentsPanel(deliveries.storeRunShipments||[]);
  const panel=(id,title,rows,kind,emptyTitle,emptyText,extra='')=>`<section class="sales-store-subpanel-v43" data-store-section="${id}"${(app.salesStoreTab||'incoming')===id?'':' hidden'}><header class="sales-store-subhead-v43"><h2>${title}</h2><span>${qty(rows.length)} سفارش</span></header>${extra}<div class="bt-table-wrap"><table class="bt-table sd-store-table"><thead><tr><th>فروشگاه</th><th>شماره سفارش</th><th>تاریخ</th><th>وضعیت</th><th>اقلام</th><th>عملیات</th></tr></thead><tbody>${rows.map(o=>card(o,kind)).join('')||`<tr><td colspan="6">${salesEmptyV25('sales',emptyTitle,emptyText)}</td></tr>`}</tbody></table></div></section>`;
  const shipCount=(deliveries.storeRunShipments||[]).length;
  const tabs=[['incoming','ورودی',incoming.length+shipCount+additions.length],['processing','در جریان',processing.length],['approved','تأیید شده',approved.length],['history','سوابق',history.length]];
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
 const actions=`<button class="btn btn-secondary btn-sm" data-action="order-details" data-id="${esc(o.id)}">${icon('eye',14)} جزئیات سفارش</button>${pickupSalesActions(o)}${o.orderType==='ONSITE'&&o.visitId?`<button type="button" class="btn btn-secondary btn-sm" data-action="cancel-onsite" data-id="${esc(o.visitId)}">لغو سفارش حضوری</button>`:''}${o.status==='RETURNED_TO_SALES'&&o.pickupCancellation?.status!=='PENDING_SALES'?`<button class="btn btn-secondary btn-sm" data-action="edit-returned-order" data-id="${esc(o.id)}">${icon('edit',14)} اصلاح سفارش</button><button class="btn btn-primary btn-sm" data-action="resubmit-order" data-id="${esc(o.id)}">${icon('send',14)} ارسال مجدد به انبار</button>`:''}`;
 return `<tr class="sd-flow-row ${sdStatusAccent(o.status)}" data-order="${esc(o.id)}">
   <td data-label="نام مشتری"><span class="bt-cell-main"><strong>${esc(storeAwareOrderName(o)||'—')}</strong></span></td>
   <td data-label="شماره سفارش"><bdi>${esc(fa(o.orderNo||'—'))}</bdi></td>
   <td data-label="تاریخ">${esc(formatDateTime24(o.createdAt))}</td>
   <td data-label="وضعیت">${badge(o.status)} ${sdTypeBadge(o)} <span>${qty(items.length)} قلم</span></td>
   <td data-label="عملیات" class="bt-col-actions"><div class="bt-actions">${actions}</div></td>
 </tr>`;
}
function salesFlowRowsV27(orders){
 const rows=(orders||[]).map(sdFlowCard).join('');
 return `<div class="bt-table-wrap"><table class="bt-table sd-flow-table"><caption class="bt-caption">سفارش‌های در جریان</caption><thead><tr><th scope="col">نام مشتری</th><th scope="col">شماره سفارش</th><th scope="col">تاریخ</th><th scope="col">وضعیت</th><th scope="col">عملیات</th></tr></thead><tbody>${rows||`<tr><td colspan="5">${sdEmpty('truck','سفارشی در جریان نیست','هر سفارشی که به انبار ارسال شود در این فهرست قرار می‌گیرد.')}</td></tr>`}</tbody></table></div>`;
}
function renderSalesFlowV25(orders){
  return `<section class="sd-pane"><section class="sd-panel">
    <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico" style="background:var(--blue-bg);color:var(--blue)">${icon('truck',20)}</span><div><h2>سفارش‌های در جریان</h2><p>تمام سفارش‌هایی که به انبار ارسال شده‌اند یا برای اصلاح برگشته‌اند.</p></div></div><div class="sd-count"><strong>${qty(orders.length)}</strong><span>سفارش</span></div></div>
    <div class="sd-flow-toolbar"><span class="sd-live"><i></i> مرتب بر اساس آخرین اقدام</span><span class="sd-legend"><span><i class="orange"></i>در صف انبار</span><span><i class="purple"></i>در حال آماده‌سازی</span><span><i class="gray"></i>برگشت به فروش</span></span></div>
    <div class="v26-flow-list sd-flow-list" style="padding:10px 14px 12px">${salesFlowRowsV27(orders)}</div>
  </section></section>`;
}

/* ---------- تب ۴: تسویه ---------- */
// v37.6.1 — مرز «آماده تسویه» و «فاکتور صادرشده» در گردش پخش:
// به‌محض چاپ برگهٔ ارسال، فاکتور صادرشده است؛ سفارش از صف تسویه بیرون می‌رود و
// در فهرست فاکتورهای صادرشده می‌نشیند (پیش از این در هیچ‌کدام دیده نمی‌شد).
function salesTransportInvoiceIssued(o){const inv=o&&o.transportInvoice;return !!inv&&(inv.status==='CLOSED'||!!inv.printedAt);}
function salesNoGoodsLegacy(o){const items=(o?.items||[]).filter(i=>i.itemStatus!=='CANCELLED');return o?.status==='SETTLEMENT_PENDING'&&!o.transportInvoice&&items.length>0&&items.every(i=>i.itemStatus==='OUT_OF_STOCK'&&i.warehouseStatus==='OUT_OF_STOCK'&&i.deliveredKg!=null&&Number(i.deliveredKg)===0);}
function salesSettlementPendingOrders(orders){return (orders||[]).filter(o=>o.status==='SETTLEMENT_PENDING'&&!salesTransportInvoiceIssued(o)&&!salesNoGoodsLegacy(o));}
function salesNoGoodsRows(orders){const rows=(orders||[]).filter(salesNoGoodsLegacy);return rows.length?`<section class="sd-panel"><h3>سفارش‌های قدیمی بدون کالای تحویلی — نیازمند بررسی</h3><p>این سفارش‌ها قابل تسویه نیستند. پس از بررسی کالا و اسناد، آنها را برای تعیین تکلیف به فروش برگردانید.</p><div class="bt-table-wrap"><table class="bt-table"><thead><tr><th>مشتری</th><th>شماره سفارش</th><th>عملیات</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${esc(storeAwareOrderName(o))}</td><td>${esc(fa(o.orderNo||'—'))}</td><td><button type="button" class="btn btn-secondary btn-sm" data-action="recover-no-goods" data-id="${esc(o.id)}">بررسی و بازگشت به فروش</button></td></tr>`).join('')}</tbody></table></div></section>`:'';}
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
    <div class="sales-no-goods-list">${salesNoGoodsRows(orders)}</div>
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
  return `<tr class="stl-queue-row ${stl.orderId===o.id?'active':''}" data-action="select-settlement" data-id="${esc(o.id)}" title="${esc(description)}" aria-label="${esc(description)}">
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
function documentEditNumber(value){const raw=en(String(value??'')).trim().replace(/٫/g,'.').replace(/[٬,\s]/g,'');if(!raw)return null;return /^\d+(?:\.\d+)?$/.test(raw)?Number(raw):NaN;}
function documentEditMethodDetails(method,devices,disabled=false){
 const type=method?.type||'CASH',lock=disabled?'disabled':'';
 if(type==='POS'){
  const existing=method?.deviceId&&!devices.some(row=>row.id===method.deviceId)?`<option value="${esc(method.deviceId)}" selected>${esc(method.deviceSnapshot?.bank||'')} ${esc(method.deviceSnapshot?.terminalNumber||'')}</option>`:'';
  return `<label class="document-edit-method-detail"><span>دستگاه پوز</span><select data-doc-device ${lock}><option value="">انتخاب دستگاه</option>${existing}${devices.filter(row=>row.isActive!==false).map(row=>`<option value="${esc(row.id)}" ${row.id===method?.deviceId?'selected':''}>${esc(row.bank||'')} ${esc(row.terminalNumber||'')}</option>`).join('')}</select></label><label class="document-edit-method-detail"><span>شماره پیگیری</span><input data-doc-reference value="${esc(method?.reference||'')}" ${lock}></label>`;
 }
 if(type==='CARD_TRANSFER')return `<label class="document-edit-method-detail"><span>بانک مقصد</span><input data-doc-bank value="${esc(method?.bank||'')}" ${lock}></label><label class="document-edit-method-detail"><span>شناسه پیگیری</span><input data-doc-reference value="${esc(method?.reference||'')}" ${lock}></label>`;
 if(type==='CHECK')return `<label class="document-edit-method-detail"><span>بانک چک</span><input data-doc-bank value="${esc(method?.bank||'')}" ${lock}></label><label class="document-edit-method-detail"><span>شماره چک</span><input data-doc-check value="${esc(method?.checkNumber||'')}" ${lock}></label><label class="document-edit-method-detail"><span>سررسید</span><input type="date" data-doc-due value="${esc(method?.dueDate||'')}" ${lock}></label>`;
 if(type==='CREDIT')return `<label class="document-edit-method-detail document-edit-method-reason"><span>توضیح ماندهٔ معوق</span><input data-doc-reason maxlength="250" value="${esc(method?.reason||'')}" placeholder="ماندهٔ ناشی از بازبینی فاکتور" ${lock}></label>`;
 return '';
}
function documentEditMethodRow(method={},devices=[],review=false){
 const type=DOCUMENT_EDIT_METHODS.some(row=>row[0]===method.type)?method.type:'CASH';
 const protectedReceipt=review&&['CASH','POS','CARD_TRANSFER','CHECK'].includes(type),typeLock=protectedReceipt||(review&&type==='CREDIT')?'disabled':'';
 return `<tr data-doc-method-row data-protected-receipt="${protectedReceipt?'1':'0'}"><td data-label="روش تسویه"><label><span class="bt-caption">روش تسویه</span><select data-doc-method-type ${typeLock}>${DOCUMENT_EDIT_METHODS.map(([value,label])=>`<option value="${value}" ${type===value?'selected':''}>${label}${value==='CREDIT'?' — بدون دریافت وجه':''}</option>`).join('')}</select></label></td><td data-label="مبلغ (ریال)"><label><span class="bt-caption">مبلغ (ریال)</span><input data-doc-method-amount inputmode="numeric" value="${method.amount==null?'':esc(String(method.amount))}" ${protectedReceipt?'disabled':''}></label></td><td data-label="جزئیات"><div class="document-edit-method-extra" data-doc-method-extra>${documentEditMethodDetails({...method,type},devices,protectedReceipt)}</div></td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-ghost btn-sm document-edit-remove" data-doc-remove-method ${protectedReceipt?'disabled title="دریافت واقعی حفظ می‌شود"':''}>حذف</button></td></tr>`;
}
function documentEditInvoiceHtml(data,devices){
 const {order,payment,lines}=data,review=data.edit?.status==='PENDING_SALES_REVIEW'||payment.settlementReviewRequired;
 const methods=Array.isArray(payment.settlementMethods)?payment.settlementMethods:[];
 const methodSum=methods.reduce((sum,row)=>sum+Number(row.amount||0),0);
 const itemRows=lines.map((line,index)=>`<tr data-doc-invoice-line data-item-id="${esc(line.itemId)}" data-kg="${esc(line.deliveredKg)}" data-return-kg="${esc(line.returnKg||0)}"><td data-label="ردیف">${fa(index+1)}</td><td data-label="محصول"><div class="document-edit-line-name"><b>${esc(line.productName||'—')}</b><small>${qty(line.deliveredKg)} کیلوگرم${Number(line.returnKg)>0?` • مرجوعی ${qty(line.returnKg)} کیلوگرم`:''}</small></div></td><td data-label="قیمت هر کیلو (ریال)"><label><span class="bt-caption">قیمت هر کیلو (ریال) برای ${esc(line.productName||'محصول')}</span><input data-doc-unit-price inputmode="numeric" value="${esc(String(line.unitPrice||0))}" required></label></td><td data-label="مبلغ"><strong data-doc-line-total>${money(line.amount||0)}</strong></td></tr>`).join('');
 const methodsHtml=methods.map(row=>documentEditMethodRow(row,devices,review)).join('')||documentEditMethodRow({type:review?'CREDIT':'CASH',amount:''},devices,review);
 const expiry=data.expiresAt?`مهلت ویرایش تا ${esc(formatDateTime24(data.expiresAt))}`:'مهلت ثبت‌شده نیست؛ ویرایش فقط با تأیید مدیر';
 const noEdit=!data.canEdit;
 return `<form id="salesInvoiceEditForm" class="document-edit-form" data-order-id="${esc(order.id)}" data-payment-id="${esc(payment.id)}" data-review="${review?'1':'0'}" data-can-edit="${data.canEdit?'1':'0'}">
  <section class="document-edit-notice ${review?'is-review':''}"><div><b>${review?'بازبینی پس از اصلاح انبار':'ویرایش قیمت و روش تسویه'}</b><span>${esc(order.customerName||'—')} • سفارش ${esc(fa(order.orderNo||'—'))} • فاکتور ${esc(fa(payment.invoiceNumber||'—'))}</span></div><small>${expiry}</small><p>${review?'دریافت‌ها و چک‌های قبلی قفل و حفظ شده‌اند. در صورت افزایش مبلغ، تفاوت را به‌عنوان معوق ثبت کنید؛ اگر مبلغ جدید از دریافت واقعی کمتر باشد، ابتدا بازپرداخت را جداگانه تعیین تکلیف کنید.':'ویرایش مالی نیاز به تأیید انبار ندارد. ثبت تغییرات به‌تنهایی پولی دریافت یا جابه‌جا نمی‌کند.'}</p>${payment.settlementReviewReason?`<p class="document-edit-reason">${esc(payment.settlementReviewReason)}</p>`:''}</section>
  ${data.waitingForWarehouse?'<p class="document-edit-error" role="alert">این فاکتور اکنون در صف اصلاح انبار است و تا بازگشت سند قابل ویرایش نیست.</p>':''}
  <section class="document-edit-section"><header><div><b>اقلام و قیمت قبلی</b><small>وزن نهایی انبار و شناسهٔ قلم تغییر نمی‌کند.</small></div></header><div class="bt-table-wrap"><table class="bt-table document-edit-invoice-table"><caption class="bt-caption">اقلام و قیمت فاکتور</caption><thead><tr><th scope="col">ردیف</th><th scope="col">محصول</th><th scope="col">قیمت هر کیلو (ریال)</th><th scope="col">مبلغ</th></tr></thead><tbody>${itemRows||'<tr><td colspan="4">قلم قیمت‌گذاری‌شده‌ای در این فاکتور نیست.</td></tr>'}</tbody></table></div></section>
  <section class="document-edit-finance"><label><span>تخفیف (ریال)</span><input data-doc-discount inputmode="numeric" value="${esc(String(payment.discountAmount||0))}"></label><label><span>اضافات (ریال)</span><input data-doc-additions inputmode="numeric" value="${esc(String(payment.additionsAmount||0))}"></label></section>
  <section class="document-edit-totals"><div><span>جمع اقلام</span><b data-doc-subtotal>${money(payment.subtotalAmount||0)}</b></div><div><span>کسر مرجوعی</span><b data-doc-returns>${money(payment.returnDeduction||0)}</b></div><div><span>مبلغ نهایی</span><b data-doc-total>${money(payment.totalAmount||0)}</b></div><div><span>بیعانهٔ لحاظ‌شده</span><b data-doc-deposit>${money(payment.depositAmount||0)}</b></div><div class="document-edit-due"><span>مبلغ قابل تطبیق با روش‌های تسویه</span><b data-doc-due>${money(payment.amountDue||0)}</b></div><div><span>جمع روش‌های فعلی</span><b data-doc-method-sum>${money(methodSum)}</b></div><p data-doc-method-message role="status"></p></section>
  <section class="document-edit-section document-edit-settlement"><header><div><b>${review?'روش‌های باقی‌ماندهٔ فاکتور':'روش‌های تسویه'}</b><small>${review?'دریافت‌های واقعی قبلی قابل حذف یا کاهش نیستند؛ ماندهٔ جدید را به معوق تخصیص دهید.':'روش‌ها را متناسب با مبلغ نهایی فاکتور اصلاح کنید.'}</small></div></header><div class="bt-table-wrap"><table class="bt-table document-edit-methods-table"><caption class="bt-caption">روش‌های تسویه فاکتور</caption><thead><tr><th scope="col">روش تسویه</th><th scope="col">مبلغ (ریال)</th><th scope="col">جزئیات</th><th scope="col">عملیات</th></tr></thead><tbody id="documentEditMethods">${methodsHtml}</tbody></table></div><div class="document-edit-method-actions">${review?'<button type="button" class="btn btn-secondary btn-sm" data-doc-fill-credit>تطبیق مانده با معوق</button><button type="button" class="btn btn-ghost btn-sm" data-doc-add-credit>افزودن ردیف معوق</button>':'<button type="button" class="btn btn-secondary btn-sm" data-doc-add-method>افزودن روش تسویه</button>'}</div></section>
  ${noEdit?'<p class="document-edit-error" role="alert">مهلت ۷۲ ساعته پایان یافته یا زمان صدور ثبت نشده است؛ فقط مدیر سیستم مجاز به ویرایش است.</p>':''}
  <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button><button type="submit" class="btn btn-primary" ${noEdit?'disabled':''}>${icon('check',15)} ${review?'تأیید بازبینی و ثبت نهایی':'ذخیره ویرایش فاکتور'}</button></div>
 </form>`;
}
function documentEditPaymentMethods(form){
 return [...form.querySelectorAll('[data-doc-method-row]')].map(row=>{
  const value=selector=>row.querySelector(selector)?.value||'';
  const amount=documentEditNumber(value('[data-doc-method-amount]'));
  if(amount===null||amount===0)return null;
  return {type:value('[data-doc-method-type]'),amount,deviceId:value('[data-doc-device]'),reference:value('[data-doc-reference]'),bank:value('[data-doc-bank]'),checkNumber:value('[data-doc-check]'),dueDate:value('[data-doc-due]'),reason:value('[data-doc-reason]')};
 }).filter(Boolean);
}
function documentEditRecalc(form){
 if(!form)return;
 let subtotal=0,returns=0,invalid=false;
 for(const row of form.querySelectorAll('[data-doc-invoice-line]')){
  const kg=Number(row.dataset.kg),returnKg=Number(row.dataset.returnKg||0),price=documentEditNumber(row.querySelector('[data-doc-unit-price]')?.value);
  if(price===null||!Number.isSafeInteger(price)||price<0||(kg>0&&price<=0)){invalid=true;}
  const unit=Number.isFinite(price)?price:0,amount=Math.round(Math.max(0,kg-returnKg)*unit);
  subtotal+=Math.round(kg*unit);returns+=Math.round(returnKg*unit);
  const total=row.querySelector('[data-doc-line-total]');if(total)total.textContent=money(amount);
 }
 const discount=documentEditNumber(form.querySelector('[data-doc-discount]')?.value),additions=documentEditNumber(form.querySelector('[data-doc-additions]')?.value);
 if(discount===null||additions===null||!Number.isSafeInteger(discount)||!Number.isSafeInteger(additions)||discount<0||additions<0)invalid=true;
 const gross=subtotal-(Number(discount)||0)+(Number(additions)||0),total=Math.max(0,gross-returns),deposit=Number(form.dataset.deposit||0),due=total-deposit;
 const safeDue=Math.max(0,due),methods=documentEditPaymentMethods(form),methodSum=methods.reduce((sum,row)=>sum+Number(row.amount||0),0),gap=safeDue-methodSum;
 const set=(selector,value)=>{const node=form.querySelector(selector);if(node)node.textContent=value;};
 set('[data-doc-subtotal]',money(subtotal));set('[data-doc-returns]',money(returns));set('[data-doc-total]',money(total));set('[data-doc-due]',money(safeDue));set('[data-doc-method-sum]',money(methodSum));
 form.dataset.due=String(safeDue);form.dataset.invalid=invalid||due<0?'1':'0';
 const message=form.querySelector('[data-doc-method-message]');
 if(message){message.className=gap===0&&!invalid&&due>=0?'is-balanced':'is-unbalanced';message.textContent=invalid?'قیمت، تخفیف یا اضافات را به‌صورت مبلغ صحیح و معتبر وارد کنید.':due<0?'بیعانه از مبلغ نهایی بیشتر است؛ ویرایش بدون استرداد دستی ممکن نیست.':gap===0?'جمع روش‌های تسویه با مبلغ قابل پرداخت برابر است.':gap>0?`روش‌های تسویه هنوز ${money(gap)} کمتر از مبلغ قابل پرداخت هستند.`:`روش‌های فعلی ${money(-gap)} بیشتر از مبلغ قابل پرداخت‌اند؛ دریافت واقعی را کاهش ندهید و بازپرداخت را جداگانه ثبت کنید.`;}
 const fill=form.querySelector('[data-doc-fill-credit]');if(fill)fill.disabled=invalid||due<0||gap===0;
 const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=form.dataset.canEdit!=='1'||invalid||due<0||gap!==0;
}
function documentEditBindMethodRow(row,devices,review){
 const type=row.querySelector('[data-doc-method-type]');
 type?.addEventListener('change',()=>{const current={type:type.value,amount:row.querySelector('[data-doc-method-amount]')?.value||''};const host=row.querySelector('[data-doc-method-extra]');if(host)host.innerHTML=documentEditMethodDetails(current,devices,false);documentEditRecalc(row.closest('form'));});
 row.querySelector('[data-doc-method-amount]')?.addEventListener('input',()=>documentEditRecalc(row.closest('form')));
}
function documentEditAddMethod(form,devices,review,type='CASH',amount=''){
 const host=form.querySelector('#documentEditMethods');if(!host)return;
 if(host.querySelectorAll('[data-doc-method-row]').length>=20)return toast('حداکثر ۲۰ ردیف تسویه مجاز است.');
 host.insertAdjacentHTML('beforeend',documentEditMethodRow({type,amount,...(type==='CREDIT'&&review?{reason:'ماندهٔ ناشی از بازبینی فاکتور'}:{})},devices,review));
 documentEditBindMethodRow(host.lastElementChild,devices,review);documentEditRecalc(form);
}
function documentEditFillCredit(form,devices){
 const due=Number(form.dataset.due||0),methods=documentEditPaymentMethods(form),sum=methods.reduce((total,row)=>total+Number(row.amount||0),0),gap=due-sum;
 if(!gap)return;
 const host=form.querySelector('#documentEditMethods'),credits=[...host.querySelectorAll('[data-doc-method-row]')].filter(row=>row.querySelector('[data-doc-method-type]')?.value==='CREDIT');
 if(gap>0){
  if(credits.length){const input=credits.at(-1).querySelector('[data-doc-method-amount]'),value=documentEditNumber(input.value)||0;input.value=String(value+gap);}
  else documentEditAddMethod(form,devices,true,'CREDIT',String(gap));
 }else{
  let remove=-gap;
  for(const row of credits.reverse()){
   const input=row.querySelector('[data-doc-method-amount]'),value=documentEditNumber(input.value)||0,take=Math.min(value,remove);input.value=String(value-take);remove-=take;if(remove<=0)break;
  }
  if(remove>0)return toast('دریافت واقعی از مبلغ جدید بیشتر است؛ بازپرداخت دستی را جداگانه تعیین تکلیف کنید.');
 }
 documentEditRecalc(form);
}
function documentEditRefreshSalesPane(data){if(app.page!=='sales')return;const tab=app.sub.sales;if(tab==='settlement'||tab==='stores')paintSalesPaneV29(tab,data);}
async function salesInvoiceEditOpen(orderId,paymentId){
 try{
  const [data,deviceResult]=await Promise.all([api(`/api/sales/orders/${encodeURIComponent(orderId)}/invoices/${encodeURIComponent(paymentId)}/edit`),api('/api/payment-devices').catch(()=>({devices:[]}))]);
  app.documentEditInvoice={data,devices:deviceResult.devices||[]};
  openModal(data.edit?.status==='PENDING_SALES_REVIEW'?'بازبینی فاکتور پس از اصلاح انبار':'ویرایش فاکتور',documentEditInvoiceHtml(data,app.documentEditInvoice.devices));
  $('#modal .modal-card')?.classList.add('document-edit-modal');
  const form=$('#salesInvoiceEditForm');if(!form)return;
  form.dataset.deposit=String(data.payment.depositAmount||0);
  const review=form.dataset.review==='1';
  form.querySelectorAll('[data-doc-method-row]').forEach(row=>documentEditBindMethodRow(row,app.documentEditInvoice.devices,review));
  form.addEventListener('input',event=>{if(event.target.matches('[data-doc-unit-price],[data-doc-discount],[data-doc-additions]'))documentEditRecalc(form);});
  form.addEventListener('click',event=>{
   const button=event.target.closest('[data-doc-fill-credit],[data-doc-add-credit],[data-doc-add-method],[data-doc-remove-method]');if(!button)return;
   if(button.matches('[data-doc-fill-credit]')){documentEditFillCredit(form,app.documentEditInvoice.devices);return;}
   if(button.matches('[data-doc-add-credit]')){documentEditAddMethod(form,app.documentEditInvoice.devices,true,'CREDIT','');return;}
   if(button.matches('[data-doc-add-method]')){documentEditAddMethod(form,app.documentEditInvoice.devices,false,'CASH','');return;}
   const row=button.closest('[data-doc-method-row]');if(row&&row.dataset.protectedReceipt!=='1'){row.remove();documentEditRecalc(form);}
  });
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(form.dataset.canEdit!=='1')return;
   documentEditRecalc(form);if(form.dataset.invalid==='1')return toast('مقادیر مالی را بررسی کنید.');
   const due=Number(form.dataset.due||0),settlementMethods=documentEditPaymentMethods(form);
   if(settlementMethods.reduce((sum,row)=>sum+Number(row.amount||0),0)!==due)return toast('جمع روش‌های تسویه باید دقیقاً با مبلغ قابل تطبیق برابر باشد.');
   const items=[...form.querySelectorAll('[data-doc-invoice-line]')].map(row=>({itemId:row.dataset.itemId,unitPrice:documentEditNumber(row.querySelector('[data-doc-unit-price]')?.value)}));
   if(items.some(row=>row.unitPrice===null||!Number.isSafeInteger(row.unitPrice)))return toast('قیمت همهٔ اقلام باید مبلغ صحیح ریال باشد.');
   const body={items,discountAmount:documentEditNumber(form.querySelector('[data-doc-discount]')?.value),additionsAmount:documentEditNumber(form.querySelector('[data-doc-additions]')?.value),settlementMethods};
   const button=form.querySelector('[type="submit"]');button.disabled=true;
   try{
    const result=await api(`/api/sales/orders/${encodeURIComponent(orderId)}/invoices/${encodeURIComponent(paymentId)}`,{method:'PUT',body:JSON.stringify(body)});
    closeModal();toast(review?'بازبینی فروش ثبت شد؛ دریافت‌های قبلی حفظ شدند. هیچ وجهی جابه‌جا نشد.':'ویرایش فاکتور ثبت شد؛ هیچ وجهی جابه‌جا نشد.');
    const refreshed=await fetchSalesCache(true);documentEditRefreshSalesPane(refreshed);await refreshIndicators();
    return result;
   }catch(error){button.disabled=false;toast(error.message);}
  });
  documentEditRecalc(form);
 }catch(error){toast(error.message);}
}
async function salesWarehouseEditRequestOpen(orderId,paymentId){
 const order=(app.salesCache?.orders||[]).find(row=>row.id===orderId),payment=[...(order?.payments||[]),...(order?.payment?[order.payment]:[])].find(row=>row?.id===paymentId);
 const orderLabel=order?.orderNo?fa(order.orderNo):'—',invoiceLabel=payment?.invoiceNumber?fa(payment.invoiceNumber):'—';
 openModal('ارجاع اصلاح وزن یا محصول به انبار',`<form id="warehouseDocumentRequestForm" class="document-edit-form document-edit-request-form" data-order-id="${esc(orderId)}" data-payment-id="${esc(paymentId)}">
  <section class="document-edit-notice"><div><b>ارجاع از فروش به انبار</b><span>سفارش ${esc(orderLabel)} • فاکتور ${esc(invoiceLabel)}</span></div><p>این اقدام فقط درخواست اصلاح وزن یا محصول ایجاد می‌کند. تحویل فیزیکی، تسویه، خروج و دریافت‌های واقعی حذف یا دوباره اجرا نمی‌شوند. پس از اصلاح، فاکتور برای بازبینی مانده به فروش برمی‌گردد.</p></section>
  <label class="document-edit-request-reason"><span>دلیل ارجاع (الزامی)</span><textarea name="reason" maxlength="300" required rows="3" placeholder="برای نمونه: وزن ثبت‌شده با وزن تأییدشدهٔ تحویل مغایرت دارد"></textarea></label>
  <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">انصراف</button><button type="submit" class="btn btn-primary">${icon('scale',15)} ارسال به صف اصلاح انبار</button></div>
 </form>`);
 $('#modal .modal-card')?.classList.add('document-edit-modal');
 const form=$('#warehouseDocumentRequestForm');if(!form)return;
 form.addEventListener('submit',async event=>{
  event.preventDefault();const reason=form.elements.reason.value.trim();if(!reason)return toast('دلیل ارجاع را وارد کنید.');
  const button=form.querySelector('[type="submit"]');button.disabled=true;
  try{
   await api(`/api/sales/orders/${encodeURIComponent(orderId)}/invoices/${encodeURIComponent(paymentId)}/warehouse-edit`,{method:'POST',body:JSON.stringify({reason})});
   closeModal();toast('درخواست اصلاح به انبار ارجاع شد؛ سند تا تکمیل اصلاح از فهرست نهایی جدا شده است.');
   const refreshed=await fetchSalesCache(true);documentEditRefreshSalesPane(refreshed);await refreshIndicators();
  }catch(error){button.disabled=false;toast(error.message);}
 });
}
function warehouseEditLineHtml(line,index,products){
 const current=products.find(row=>row.id===line.productId),productOptions=(line.productId?`<option value="${esc(line.productId)}" selected>${esc(current?.name||line.productName||'محصول قبلی')}${current?.quickCode?` — ${esc(current.quickCode)}`:''}${current?'':' — غیرفعال؛ حفظ محصول فعلی'}</option>`:'<option value="" selected disabled>محصول قبلی نامشخص است</option>')+products.filter(row=>row.id!==line.productId).map(product=>`<option value="${esc(product.id)}">${esc(product.name)}${product.quickCode?` — ${esc(product.quickCode)}`:''}</option>`).join('');
 const weight=Number(line.deliveredKg),out=!!line.outOfStock;
 const weights=Array.isArray(line.weighings)&&line.weighings.length?`<details class="document-edit-old-weighings"><summary>سوابق توزین قبلی</summary>${whDocumentTares(line)}</details>`:'';
 return `<tr data-wh-edit-line data-item-id="${esc(line.itemId)}" data-out-of-stock="${out?'1':'0'}"><td data-label="ردیف">${fa(index+1)}</td><td data-label="قلم فعلی"><div class="document-edit-line-name"><b>${esc(line.productName||'—')}</b><small>${out?'ناموجود — وضعیت موجودی قفل است':`${qty(line.deliveredKg)} کیلوگرم`} · درخواست ${esc(line.description||'')}</small>${weights}</div></td><td data-label="محصول"><label><span class="bt-caption">محصول جایگزین برای ${esc(line.productName||'قلم')}</span><select data-wh-edit-product required>${productOptions}</select></label></td><td data-label="وزن نهایی (کیلوگرم)"><label><span class="bt-caption">وزن نهایی ${esc(line.productName||'قلم')} (کیلوگرم)</span><input data-wh-edit-weight type="number" inputmode="decimal" min="0.001" step="0.001" max="100000" value="${out?'':Number.isFinite(weight)?String(weight):''}" ${out?'disabled':''} ${out?'':'required'}></label></td></tr>`;
}
async function warehouseDocumentEditOpen(orderId,paymentId){
 try{
  const data=await api(`/api/warehouse/document-edits/${encodeURIComponent(orderId)}/${encodeURIComponent(paymentId)}`);
  const items=Array.isArray(data.edit?.items)?data.edit.items:[],products=Array.isArray(data.products)?data.products:[];
  app.warehouseDocumentEdit={orderId,paymentId,data};
  const run=data.edit?.run?` • سرویس ${data.edit.run===2?'دوم':'اول'}`:'';
  const title=data.orderType==='STORE'?'اصلاح سند وزنی فروشگاه':'اصلاح سند انبار';
  openModal(title,`<form id="warehouseDocumentEditForm" class="document-edit-form warehouse-document-edit-form" data-order-id="${esc(orderId)}" data-payment-id="${esc(paymentId)}" data-order-type="${esc(data.orderType||'')}">
   <section class="document-edit-notice is-review"><div><b>${esc(data.orderType==='STORE'?'سند فروشگاه':'سفارش')} ${esc(fa(data.orderNo||'—'))} • سند ${esc(fa(data.edit?.warehouseDocumentNo||data.invoiceNumber||'—'))}${run}</b><span>ارجاع از فروش: ${esc(data.edit?.reason||'اصلاح وزن یا محصول')}</span></div><p>فقط محصول و وزن قابل اصلاح‌اند. وضعیت موجودی، تحویل فیزیکی، تسویه و خروج قفل هستند. تغییر وزن، دریافت‌های قبلی را دست‌نخورده نگه می‌دارد و فاکتور عادی را برای بازبینی به فروش برمی‌گرداند.</p></section>
   <section class="document-edit-section"><header><div><b>اقلام سند</b><small>وزن با حداکثر سه رقم اعشار ثبت می‌شود؛ وزن صفر برای قلم موجود مجاز نیست.</small></div></header><div class="bt-table-wrap"><table class="bt-table document-edit-warehouse-table"><caption class="bt-caption">اقلام اصلاح سند انبار</caption><thead><tr><th scope="col">ردیف</th><th scope="col">قلم فعلی</th><th scope="col">محصول</th><th scope="col">وزن نهایی (کیلوگرم)</th></tr></thead><tbody>${items.map((line,index)=>warehouseEditLineHtml(line,index,products)).join('')||'<tr><td colspan="4">قلمی برای اصلاح وجود ندارد.</td></tr>'}</tbody></table></div></section>
   <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">انصراف</button><button type="submit" class="btn btn-primary" ${items.length?'':'disabled'}>${icon('check',15)} ثبت اصلاح سند</button></div>
  </form>`);
  $('#modal .modal-card')?.classList.add('document-edit-modal');
  const form=$('#warehouseDocumentEditForm');if(!form)return;
  form.addEventListener('submit',async event=>{
   event.preventDefault();const corrected=[];
   for(const row of form.querySelectorAll('[data-wh-edit-line]')){
    const itemId=row.dataset.itemId,productId=row.querySelector('[data-wh-edit-product]')?.value||'',outOfStock=row.dataset.outOfStock==='1';
    const raw=row.querySelector('[data-wh-edit-weight]')?.value||'';
    if(!productId)return toast('برای همهٔ اقلام یک محصول فعال انتخاب کنید.');
    let deliveredKg=0;
    if(!outOfStock){deliveredKg=Number(raw);if(!Number.isFinite(deliveredKg)||deliveredKg<0.001||Math.abs(deliveredKg*1000-Math.round(deliveredKg*1000))>1e-7)return toast('وزن هر قلم موجود باید بیشتر از صفر و حداکثر سه رقم اعشار باشد.');}
    corrected.push({itemId,productId,deliveredKg,outOfStock});
   }
   const button=form.querySelector('[type="submit"]');button.disabled=true;
   try{
    const result=await api(`/api/warehouse/document-edits/${encodeURIComponent(orderId)}/${encodeURIComponent(paymentId)}`,{method:'PUT',body:JSON.stringify({items:corrected})});
    closeModal();toast(data.orderType==='STORE'?'اصلاح سند فروشگاه ثبت شد و سابقهٔ تغییر حفظ شد.':'اصلاح ثبت شد؛ فاکتور برای بازبینی فروش برگشت. دریافت‌های واقعی، تحویل و خروج حفظ شدند؛ هیچ وجهی جابه‌جا نشد.');
    await refreshIndicators();
    if(app.page==='warehouse'){
     if(app.wh38.phase==='document-edits')void whDocumentEditsPaint($('#wh38Body'));
     else if(data.orderType==='STORE')loadWhStoreDocuments();
     else if(app.wh38.phase==='delivered')whDeliveredLoad();
     else if(app.wh38.phase==='history')loadWhStoreHistory();
    }
    return result;
   }catch(error){button.disabled=false;toast(error.message);}
  });
 }catch(error){toast(error.message);}
}
function stlEmptyHtml(){
  return `<div class="stl-empty"><div class="stl-empty-ico">${icon('receipt',26)}</div><b>یک سفارش از فهرست انتخاب کنید</b><span>بعد از انتخاب، قیمت‌گذاری اقلام و ثبت تسویه در همین بخش انجام می‌شود.</span></div>`;
}
function stlRowHtml(o){
  return window.BTSettlementRenderers.row(o);
}
function stlFormHtml(o){
  return window.BTSettlementRenderers.form(o);
}

/* ---------- تب ۵: سفارش‌های روزهای آتی ---------- */
function futureOrderRowsV25(orders){
 const rows=(orders||[]).map(o=>{
  const actions=`<button class="btn btn-secondary btn-sm" data-action="order-details" data-id="${esc(o.id)}">${icon('eye',13)} جزئیات سفارش</button>`+(canSalesEditRemote(o)&&o.pickupCancellation?.status!=='PENDING_SALES'?`<button class="btn btn-ghost btn-sm" data-action="future-edit" data-id="${esc(o.id)}">${icon('edit',13)} ویرایش سفارش</button>${o.visit?.status!=='PICKUP_PRESENT'?`<button class="btn btn-ghost btn-sm danger-text" data-action="future-cancel" data-id="${esc(o.id)}">${icon('trash',13)} لغو</button>`:''}`:'');
  return `<tr class="fx-table-row" data-order="${esc(o.id)}"><td data-label="مشتری">${esc(storeAwareOrderName(o))}<small>${esc(storeAwareOrderPhone(o)||'—')}</small></td><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="تاریخ ثبت">${esc(formatDateTime24(o.createdAt))}</td><td data-label="وضعیت">${badge(o.status)} ${sdTypeBadge(o)}</td><td data-label="اقلام">${qty(activeItemsOf(o).length)} قلم</td><td data-label="زمان‌بندی"><span>ورود به انبار: ${esc(dateLabel(o.scheduledDate))} ${esc(fa(time24(o.scheduledAt)))}</span><br><span>تاریخ تحویل: ${o.deliveryDate?esc(dateLabel(o.deliveryDate)):'ثبت نشده'}</span></td><td data-label="مقصد و بیعانه"><span>${esc(o.dispatchPlace||'ثبت نشده')}</span>${o.deposit?depositSummaryHtml(o.deposit):''}</td><td data-label="عملیات" class="bt-col-actions"><div class="fx-table-actions">${actions+pickupSalesActions(o)}</div></td></tr>`;
 }).join('');
 const empty=`<tr class="future-empty-row"><td colspan="8" class="future-empty-cell">${sdEmpty('calendar','سفارشی برای روزهای آینده برنامه‌ریزی نشده است','سفارش‌های آینده پس از ثبت در این تقویم قرار می‌گیرند.')}</td></tr>`;
 return `<div class="bt-table-wrap"><table class="bt-table future-order-table"><caption class="bt-caption">سفارش‌های آینده</caption><thead><tr><th scope="col">مشتری</th><th scope="col">شماره سفارش</th><th scope="col">تاریخ ثبت</th><th scope="col">وضعیت</th><th scope="col">اقلام</th><th scope="col">زمان‌بندی</th><th scope="col">مقصد و بیعانه</th><th scope="col">عملیات</th></tr></thead><tbody>${rows||empty}</tbody></table></div>`;
}

function futureFormV38(orders){
  const future=salesFutureOrders(orders||[]);
  return `<div class="fx-grid fx-future-layout"><section class="fx-form fx-future-form">
    <div class="fx-card">
      <div class="fx-card-head"><span class="fx-ico">${icon('calendar',16)}</span><h3>ثبت سفارش برنامه‌ریزی‌شده</h3><span class="fx-list-count">${qty(future.length)} برنامه فعال</span></div>
      <div class="fx-card-body fx-body-compact"><p class="fx-intro">مشتری، <b>زمان ورود به کارتابل انبار</b> و اقلام را وارد کنید؛ سفارش در زمان سررسید خودکار وارد صف انبار می‌شود.</p>
        <form id="futureOrderFormV25" class="fx-form fx-form-compact">
          ${salesCustomerPickerHtml('future')}
          <div class="fx-grid-2 future-contact-grid-v40 fx-top-grid">
            <div class="field future-contact-field-v40 contact-field-v41"><label for="futureCustomerName">نام مشتری</label><div class="input-shell"><span>${icon('user',16)}</span><input id="futureCustomerName" name="name" required placeholder="نام و نام خانوادگی"></div></div>
            <div class="field future-contact-field-v40 contact-field-v41"><label for="futureCustomerPhone">شماره تماس</label><div class="input-shell"><span>${icon('phone',16)}</span><input id="futureCustomerPhone" name="phone" required inputmode="tel" placeholder="۰۹۱۲ ..."></div></div>
            ${jalaliDateTimeInput('زمان ورود به کارتابل انبار','scheduledDate','scheduledTime',nextDayIso(),'08:00',true)}
            ${jalaliInput('تاریخ تحویل','deliveryDate','',true)}
            <div class="field fx-addr-field" data-sales-dispatch-place><label for="futureDispatchPlace">محل ارسال</label><div class="input-shell"><span>${icon('truck',16)}</span><input id="futureDispatchPlace" name="dispatchPlace" required placeholder="آدرس یا محل ارسال"></div></div>
            ${app.features?.experimentalTransport?deliveryModeInputHtml('future'):''}
          </div>
          <div class="sd-lines-head fx-lines-head"><h3>اقلام سفارش</h3></div>
          <div id="future-lines" class="sd-lines"></div>
          <div class="fx-lines-add">
            <button type="button" class="btn btn-secondary btn-sm" data-action="future-add-line">${icon('plus',15)} افزودن قلم جدید</button>
            <small>واحدهای مجاز: کیلوگرم، بسته، عدد، کارتن</small>
          </div>
          <div class="field future-note-v40 fx-note"><label for="futureNotes">یادداشت و توضیحات</label><textarea name="notes" maxlength="1000" rows="1" id="futureNotes" placeholder="هماهنگی، بسته‌بندی، محدودیت تحویل یا نکته مهم..."></textarea></div>
          ${depositEntryHtml()}
          <div class="fx-foot fx-foot-compact">
            <button type="submit" class="btn btn-primary">${icon('send',16)} ثبت برنامه ارسال</button>
            <button type="reset" class="btn btn-secondary">${icon('refresh',15)} پاک کردن فرم</button>
          </div>
        </form>
      </div>
    </div>
  </section>
  <section class="fx-card fx-future-registered"><div class="fx-card-head"><span class="fx-ico" style="background:var(--purple-bg);color:var(--purple)">${icon('calendar',16)}</span><h3>سفارش‌های ثبت‌شده</h3><span class="fx-list-count">${qty(future.length)} مورد</span></div>
    <div class="fx-card-body"><div id="futureOrderListV25" class="fx-list-grid">${futureOrderRowsV25(future)}</div></div>
  </section><section class="fx-card deposit-refund-panel"><div class="fx-card-head"><h3>استرداد بیعانه سفارش‌های لغوشده</h3></div><div class="fx-card-body" id="depositRefundList">در حال دریافت…</div></section></div>`;
}
window.renderSalesFutureV25=function(orders){ return futureFormV38(orders); };
function renderSalesStoreDeliveryDetails(o,finalized=false){
 const d=o.dispatch||{}, lines=Array.isArray(d.lines)?d.lines:[];
 const rows=lines.map((l,i)=>`<tr><td data-label="ردیف">${fa(String(i+1))}</td><td data-label="محصول">${esc(l.productName||'قلم')}</td><td data-label="تحویلی">${qty(l.deliveredKg)} کیلوگرم</td><td data-label="مرجوعی">${qty(l.returnKg||0)} کیلوگرم</td><td data-label="کسری">${qty(l.shortageKg||0)} کیلوگرم</td><td data-label="علت">${esc(l.reason||'—')}</td></tr>`).join('');
 const confirmed=d.storeReceiptConfirmedAt||(!d.run&&o.storeReceiptConfirmedAt);
 return `<article class="sales-store-delivery-details"><div class="sales-delivery-card-head"><div><span class="order-code">${esc(fa(o.orderNo||'—'))}</span><h3>${esc(o.storeName||'فروشگاه')}</h3></div><span class="badge blue">${o.storeOrderKind==='PARTIAL'?'سفارش جزئی':d.run?`سرویس ${d.run===2?'دوم':'اول'}`:'محموله'} — بدون مبلغ</span></div><div class="sales-delivery-meta"><span><small>راننده</small><b>${esc(d.driverName||'—')}</b></span><span><small>پلاک</small>${plateViewHtml(d.driverPlate,'—',true)}</span><span><small>زمان تحویل</small><b>${esc(formatDateTime24(d.deliveredAt))}</b></span><span><small>تأیید دریافت فروشگاه</small><b>${confirmed?`دریافت توسط فروشگاه تأیید شد • ${esc(formatDateTime24(confirmed))}`:'در انتظار تأیید'}</b></span></div><div class="bt-table-wrap"><table class="bt-table sales-store-delivery-items-table"><caption class="bt-caption">اقلام تحویل فروشگاه</caption><thead><tr><th scope="col">ردیف</th><th scope="col">محصول</th><th scope="col">تحویلی</th><th scope="col">مرجوعی</th><th scope="col">کسری</th><th scope="col">علت</th></tr></thead><tbody>${rows||'<tr><td colspan="6">اقلام تحویل ثبت نشده است.</td></tr>'}</tbody></table></div>${d.note?`<p class="sales-delivery-note">${esc(d.note)}</p>`:''}<footer class="sales-delivery-actions">${finalized?`<span class="sales-finalized-stamp">ثبت نهایی ${esc(formatDateTime24(d.salesFinalizedAt||d.closedAt))}</span>`:`<button type="button" class="btn btn-primary" data-action="sales-finalize-driver-delivery" data-id="${esc(o.id)}">تأیید نهایی فروش</button>`}</footer></article>`;
}
function renderSalesDeliveryCardV38(o, finalized = false) {
  if(o.orderType==='STORE')return renderSalesStoreDeliveryDetails(o,finalized);
  const d=o.dispatch||{};
  const lines=d.lines||[];
  const sum=(key)=>lines.reduce((n,line)=>n+Number(line[key]||0),0);
  const gross=Number(d.grossAmount??d.approvedTotalAmount??o.payment?.grossAmount??o.payment?.totalAmount??0);
  const returnDeduction=Number(d.returnDeduction??o.payment?.returnDeduction??0);
  const payable=Number(d.amountDue??o.payment?.totalAmount??Math.max(0,gross-returnDeduction));
  const paymentLabels={CASH:'نقدی',POS:'پوز',CARD_TRANSFER:'کارت‌به‌کارت',CHECK:'چک',CREDIT:'معوق'};
  const paymentRows=(d.settlementMethods||o.payment?.settlementMethods||[]).map((m,i)=>{const details=[m.deviceSnapshot?`دستگاه ${m.deviceSnapshot.title} • پایانه ${m.deviceSnapshot.terminalNumber} • ${m.deviceSnapshot.bank}`:'',m.bank?`بانک ${m.bank}`:'',m.reference?`پیگیری ${m.reference}`:'',m.checkNumber?`چک ${m.checkNumber}`:'',m.dueDate?`سررسید ${fa(m.dueDate)}`:'',m.type!=='CREDIT'&&m.reason?`علت: ${m.reason}`:'',m.checkStatus?`وضعیت چک: ${m.checkStatus==='PENDING'?'در انتظار وصول':m.checkStatus}`:''].filter(Boolean).join(' • ');return `<tr><td>${fa(String(i+1))}</td><td><b>${esc(paymentLabels[m.type]||m.type||'—')}</b></td><td>${money(m.amount)}</td><td>${esc(details||'—')}</td></tr>`}).join('');
  const paymentCount=(d.settlementMethods||o.payment?.settlementMethods||[]).length;
  const lineRows=lines.map((line,i)=>`<tr><td data-label="ردیف">${fa(String(i+1))}</td><td data-label="محصول">${esc(line.productName||'قلم')}</td><td data-label="تحویلی">${qty(line.deliveredKg)} کیلو</td><td data-label="فی">${money(line.unitPrice||0)}</td><td data-label="مرجوعی">${qty(line.returnKg)}</td><td data-label="کسری">${qty(line.shortageKg)}</td><td data-label="خالص">${qty(line.netKg)}</td><td data-label="مبلغ">${money(line.grossAmount??Math.round(Number(line.deliveredKg||0)*Number(line.unitPrice||0)))}</td><td data-label="علت">${esc(line.reason||'—')}</td></tr>`).join('');
  return `<article class="sd-panel sales-delivery-card">
    <header class="sales-delivery-card-head"><div><span class="order-code">${esc(fa(o.orderNo||'—'))}</span><h3>${esc(storeAwareOrderName(o))}</h3>${o.orderType==='STORE'?'':`<small>${esc(storeAwareOrderPhone(o))}</small>`}</div><div class="sales-delivery-badges">${d.run?`<span class="badge blue">سرویس ${d.run===2?'دوم':'اول'}</span>`:''}<span class="badge ${finalized?'green':'orange'}">${finalized?(d.status==='CLOSED'?'بسته‌شده؛ سابقه قدیمی':'نهایی‌شده توسط فروش'):'منتظر تأیید فروش'}</span>${o.orderType==='STORE'?`<span class="badge ${(d.storeReceiptConfirmedAt||(!d.run&&o.storeReceiptConfirmedAt))?'green':'orange'}">${(d.storeReceiptConfirmedAt||(!d.run&&o.storeReceiptConfirmedAt))?'دریافت توسط فروشگاه تأیید شد':'منتظر تأیید فروشگاه'}</span>`:''}</div></header>
    <div class="sales-delivery-meta"><span><small>راننده</small><b>${esc(d.driverName||'—')}</b></span><span><small>پلاک</small>${plateViewHtml(d.driverPlate, '—', true)}</span><span><small>زمان تحویل</small><b>${esc(formatDateTime24(d.deliveredAt))}</b></span><span><small>روش‌های ثبت‌شده</small><b>${(d.settlementMethods||o.payment?.settlementMethods||[]).map(x=>paymentLabels[x.type]||x.type).join('، ')|| (d.settlementType==='CASH'?'نقدی':d.settlementType==='CREDIT'?'معوق':'—')}</b></span><span><small>شمارهٔ فاکتور</small><b>${esc(fa(o.payment?.invoiceNumber||'پس از تأیید نهایی فروش'))}</b></span>${o.orderType==='STORE'?`<span><small>تأیید دریافت فروشگاه${d.run?` — محمولهٔ سرویس ${d.run===2?'دوم':'اول'}`:''}</small><b>${(d.storeReceiptConfirmedAt||(!d.run&&o.storeReceiptConfirmedAt))?`تأیید شد • ${esc(formatDateTime24(d.storeReceiptConfirmedAt||o.storeReceiptConfirmedAt))}`:'در انتظار تأیید فروشگاه'}</b></span>`:''}</div>
    <div class="bt-table-wrap"><table class="bt-table sales-delivery-items-table"><caption class="bt-caption">اقلام تحویل مشتری</caption><thead><tr><th scope="col">ردیف</th><th scope="col">محصول</th><th scope="col">تحویلی</th><th scope="col">فی</th><th scope="col">مرجوعی</th><th scope="col">کسری</th><th scope="col">خالص</th><th scope="col">مبلغ</th><th scope="col">علت</th></tr></thead><tbody>${lineRows||'<tr><td colspan="9">جزئیات اقلام تحویل ثبت نشده است.</td></tr>'}</tbody></table></div>
    <div class="sales-delivery-summary"><span><small>${d.fullReturn?'مرجوعی کلی':'مرجوعی'}</small><b>${qty(sum('returnKg'))} کیلو</b></span><span><small>کسری</small><b>${qty(sum('shortageKg'))} کیلو</b></span><span><small>مبلغ اولیه</small><b>${money(gross)}</b></span><span><small>کسر مرجوعی</small><b>${money(returnDeduction)}</b></span><span class="payable"><small>قابل تسویه</small><b>${money(payable)}</b></span></div>
    <details class="sales-delivery-payments"><summary>جزئیات روش‌ها و تراکنش‌های دریافت‌شده${paymentCount?` (${fa(String(paymentCount))} روش)`:''}</summary>${paymentRows?`<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>روش</th><th>مبلغ</th><th>مشخصات تراکنش</th></tr></thead><tbody>${paymentRows}</tbody></table></div>`:'<div class="empty">جزئیات تراکنش‌ها در این تحویل ثبت نشده است.</div>'}</details>
    ${d.note?`<p class="sales-delivery-note"><b>یادداشت راننده:</b> ${esc(d.note)}</p>`:''}
    <footer class="sales-delivery-actions">${finalized?`<span class="sales-finalized-stamp">ثبت نهایی ${esc(formatDateTime24(d.salesFinalizedAt||d.closedAt))} • ${esc(d.salesFinalizedBy||d.closedBy||'فروش')}</span>`:`<button type="button" class="btn btn-primary btn-lg" data-action="sales-finalize-driver-delivery" data-id="${esc(o.id)}">${icon('check',17)} تأیید نهایی فروش</button>`}</footer>
  </article>`;
}
function renderSalesDeliveryTrackingV18(o) {
  const d=o.dispatch||{};
  const labels={ASSIGNED:'تخصیص‌یافته؛ منتظر اعلام خروج راننده',DRIVER_EXIT_REPORTED:'اعلام خروج راننده؛ منتظر تأیید نگهبانی',IN_TRANSIT:'در مسیر مشتری'};
  return `<article class="sd-panel sales-delivery-card sales-delivery-tracking" data-delivery-order="${esc(o.id)}">
    <header class="sales-delivery-card-head"><div><span class="order-code">${esc(fa(o.orderNo||'—'))}</span><h3>${esc(storeAwareOrderName(o))}</h3>${o.orderType==='STORE'?'':`<small dir="ltr">${esc(storeAwareOrderPhone(o))}</small>`}</div><span class="badge blue">${d.run?`سرویس ${d.run===2?'دوم':'اول'} » `:''}${esc(labels[d.status]||'در حال ارسال')}</span></header>
    <div class="sales-delivery-meta"><span><small>راننده</small><b>${esc(d.driverName||'—')}</b></span><span><small>پلاک</small>${plateViewHtml(d.driverPlate,'—',true)}</span><span><small>زمان تخصیص</small><b>${esc(formatDateTime24(d.assignedAt))}</b></span><span><small>آخرین تغییر</small><b>${esc(formatDateTime24(o.updatedAt||d.assignedAt))}</b></span>${o.orderType==='STORE'?'':`<span><small>مبلغ تأییدشده فروش</small><b>${money(d.approvedTotalAmount||0)}</b></span>`}</div>
    <p class="sales-delivery-note">این سفارش هنوز تحویل مشتری نشده است؛ پس از ثبت تحویل توسط راننده به بخش «منتظر تأیید فروش» منتقل می‌شود.</p>
  </article>`;
}
function renderStoreRunShipmentsPanel(shipments){ // v37.5.0
  const list=Array.isArray(shipments)?shipments:[];
  if(!list.length)return '';
  const chips=list.map(s=>`<tr class="sr-ship-row" data-ship-order="${esc(s.orderId)}"><td data-label="شماره سفارش">${esc(fa(s.orderNo||'—'))}</td><td data-label="فروشگاه"><span class="bt-cell-main">${esc(s.storeName||'فروشگاه')}</span></td><td data-label="سرویس">سرویس ${s.run===2?'دوم':'اول'}</td><td data-label="اقلام">${qty((s.items||[]).length)} قلم</td><td data-label="وزن سرویس">${qty((s.items||[]).reduce((sum,l)=>sum+Number(l.serviceKg??l.deliveredKg??0),0))} کیلوگرم</td><td data-label="زمان ارسال">${esc(formatDateTime24(s.sentAt||''))}</td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-primary btn-sm" data-action="sr-ship-open" data-order="${esc(s.orderId)}" data-run="${s.run}">جزئیات و تعیین راننده</button></td></tr>`).join('');
  return `<section class="sr-ship-panel" data-delivery-section="storeRunShipments"><header><div><span class="sales-delivery-column-index">۰۰</span><h2>اقلام سرویس ارسال‌شده از انبار</h2><p>انبار اقلام وزن‌شدهٔ همان سرویس را فرستاده است؛ برای هر محموله راننده تعیین کنید تا سند تحویل وزنی همان سرویس صادر شود.</p></div><span class="sd-count"><strong>${qty(list.length)}</strong><span>درخواست</span></span></header><div class="bt-table-wrap"><table class="bt-table sr-ship-table"><caption class="bt-caption">سرویس‌های ارسال‌شده از انبار</caption><thead><tr><th scope="col">شماره سفارش</th><th scope="col">فروشگاه</th><th scope="col">سرویس</th><th scope="col">اقلام</th><th scope="col">وزن سرویس</th><th scope="col">زمان ارسال</th><th scope="col">عملیات</th></tr></thead><tbody>${chips}</tbody></table></div></section>`;
}

function salesDeliverySummaryRow(o){
 const service=o.transportService,d=o.dispatch||{},run=Number(service?.run??d.run??0)||0;
 const state=service?`<span class="badge blue">${esc(service.label||'—')}</span>`:dspBadge(d.status);
 const driver=service?.driverName||d.driverName||'تعیین نشده';
 const lineCount=(service?.lines||d.lines||o.items||[]).length;
 // Every actual order/service uses the same compact structure as the store desk;
 // each field is separate so the divider stays visible even on narrow screens.
 return `<tr class="sales-delivery-summary-row" data-delivery-order="${esc(o.id)}" data-delivery-run="${run}"><td data-label="مشتری / فروشگاه"><strong>${esc(storeAwareOrderName(o))}</strong>${o.orderType==='STORE'&&o.customer?.name?`<small>مشتری: ${esc(o.customer.name)}</small>`:''}</td><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="تاریخ ثبت">${esc(formatDateTime24(o.createdAt))}</td><td data-label="سرویس">${run?(o.storeOrderKind==='PARTIAL'?'جزئی':'سرویس '+(run===2?'دوم':'اول')):'عادی'}</td><td data-label="وضعیت">${state}</td><td data-label="راننده">${esc(driver)}</td><td data-label="تعداد اقلام">${qty(lineCount)}</td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="sales-delivery-details" data-id="${esc(o.id)}" data-run="${run}">جزئیات سفارش</button></td></tr>`;

}
async function openSalesDeliveryDetails(id,run){
 const notices=captureEntityNotices('order',id,Number(run)||null);
 const data=app.salesCache?.dispatchDeliveries||{};const views=[...(data.active||[]),...(data.pending||[]),...(data.finalized||[])];
 const o=views.find(v=>v.id===id&&Number(v.transportService?.run??v.dispatch?.run??0)===Number(run||0));if(!o)return toast('محموله دیگر در فهرست نیست؛ صفحه را تازه کنید.');
 if(o.transportService){openModal('جزئیات فاکتور پخش',transportSalesDetailsHtml(o));finishEntityNotices(notices);return true;}
 const completed=['DELIVERED','SALES_FINALIZED','CLOSED'].includes(o.dispatch?.status);
 openModal('جزئیات تحویل سفارش',completed?renderSalesDeliveryCardV38(o,o.dispatch.status!=='DELIVERED'):renderSalesDeliveryTrackingV18(o)+`<button type="button" class="btn btn-secondary" data-action="order-details" data-id="${esc(o.id)}">جزئیات اقلام سفارش</button>`);
 finishEntityNotices(notices);return true;
}
function transportSalesDetailsHtml(o){
 const s=o.transportService||{},store=o.orderType==='STORE',lines=Array.isArray(s.lines)?s.lines:[];
 const rows=lines.map((l,i)=>`<tr><td>${fa(String(i+1))}</td><td>${esc(l.productName||'—')}</td><td>${qty(l.deliveredKg)} کیلوگرم</td></tr>`).join('');
 const disabled=app.features?.experimentalTransport===false&&(store||s.section!=='history');
 const action=disabled?'':store?`<button type="button" class="btn btn-primary" data-action="order-details" data-id="${esc(o.id)}">بررسی وضعیت و مدارک سرویس</button>`:o.status==='SETTLEMENT_PENDING'?`<button type="button" class="btn btn-primary" data-action="transport-sales-work" data-id="${esc(o.id)}">ثبت پرداختی</button>`:o.status==='CLOSED'&&o.payment?`<button type="button" class="btn btn-primary" data-action="invoice" data-id="${esc(o.id)}">نمایش فاکتور بسته‌شده</button>`:'';
 return `<article class="sd-panel sales-delivery-card"><header><span class="order-code">${esc(fa(o.orderNo||'—'))}</span><h3>${esc(storeAwareOrderName(o))}</h3><span class="badge blue">${esc(s.label||'—')}</span>${s.run?` <span>سرویس ${s.run===2?'دوم':'اول'} — بدون تسویه مالی</span>`:''}</header><div class="sales-delivery-meta"><span><small>راننده</small><b>${esc(s.driverName||'تعیین نشده')}</b></span><span><small>تماس</small><b>${esc(fa(s.driverPhone||'—'))}</b></span><span><small>خودرو و پلاک</small><b>${esc(s.vehicleType||'—')} ${esc(fa(s.vehiclePlate||''))}</b></span><span><small>سند انبار</small><b>${esc(fa(s.warehouseDocumentNo||'—'))}</b></span>${!store?`<span><small>فاکتور</small><b>${esc(fa(s.invoiceNumber||'ثبت نشده'))}</b></span>`:''}</div>${disabled?'<p role="alert">گردش آزمایشی غیرفعال است؛ اطلاعات فقط برای مشاهده نمایش داده می‌شود.</p>':''}<p>${s.section==='assigned'?'خروج ثبت نشده و هیچ تحویل یا امضای مشتری تأیید نشده است.':s.section==='inTransit'?'خروج ثبت شده؛ روش پرداخت و مرجوعی را در کارتابل فروش ثبت کنید.':s.outcome==='NOT_DELIVERED'?'این سفارش به مشتری تحویل نشده است.':''}</p><div class="table-wrap"><table class="table"><thead><tr><th>ردیف</th><th>محصول</th><th>وزن سند انبار</th></tr></thead><tbody>${rows||'<tr><td colspan="3">سند وزن این سرویس هنوز در دسترس نیست.</td></tr>'}</tbody></table></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button>${action}</div></article>`;
}
function renderSalesDeliveryV38(data={}) {
  const active=Array.isArray(data.active)?data.active:[];
  const assigned=Array.isArray(data.assigned)?data.assigned:active.filter(o=>['ASSIGNED','DRIVER_EXIT_REPORTED'].includes(o.dispatch?.status));
  const inTransit=Array.isArray(data.inTransit)?data.inTransit:active.filter(o=>o.dispatch?.status==='IN_TRANSIT');
  const delivered=Array.isArray(data.pending)?data.pending:[];
  const history=Array.isArray(data.finalized)?data.finalized:[];
  const total=Math.max(0,Number(data.finalizedTotal??history.length));
  const offset=Math.max(0,Number(data.finalizedOffset)||0),limit=Math.max(1,Number(data.finalizedLimit)||30);
  const modern=!!app.features?.experimentalTransport||[...assigned,...inTransit,...delivered,...history].some(o=>o.transportService);
  const columns=[
    {id:'assigned',title:'واگذار شده',desc:modern?'ارسال‌های آماده یا منتظر تخصیص و خروج.':'به راننده واگذار شده یا منتظر تأیید خروج نگهبانی است.',rows:assigned,empty:'سفارش واگذارشده‌ای نیست'},
    {id:'inTransit',title:'در حال ارسال',desc:'خروج تأیید شده و سفارش در مسیر است.',rows:inTransit,empty:'سفارشی در مسیر نیست'},
    {id:'delivered',title:modern?'تحویل شده / بازگشت':'تحویل شده',desc:modern?'ثبت پرداختی پخش یا دریافت فروشگاه را پیگیری کنید.':'تحویل راننده را بررسی و در صورت صحت نهایی کنید.',rows:delivered,empty:'موردی منتظر بررسی نیست'},
    {id:'history',title:'سوابق',desc:modern?'ارسال‌های بسته‌شده، شامل موارد تحویل‌نشده.':'تحویل‌های نهایی‌شده و بسته‌شده.',rows:history,empty:'سابقهٔ نهایی‌شده‌ای نیست'},
  ];
  const selected=columns.some(c=>c.id===app.salesDeliveryTab)?app.salesDeliveryTab:'assigned';
  const pages=`<nav class="sales-delivery-pages" aria-label="صفحه‌بندی سوابق تحویل"><button type="button" class="btn btn-secondary btn-sm" data-action="sales-delivery-history-page" data-offset="${Math.max(0,offset-limit)}" ${offset===0?'disabled':''}>صفحه قبل</button><span>${total?`${qty(offset+1)} تا ${qty(Math.min(offset+history.length,total))} از ${qty(total)} محموله`:'۰ محموله'}</span><button type="button" class="btn btn-secondary btn-sm" data-action="sales-delivery-history-page" data-offset="${offset+limit}" ${offset+limit>=total?'disabled':''}>صفحه بعد</button></nav>`;
  return `<section class="sd-pane sales-delivery-pane">${data.error?'<div class="sales-delivery-error" role="alert">دریافت فهرست پخش ناموفق بود. اطلاعات قبلی، در صورت وجود، حفظ شده و ممکن است قدیمی باشد؛ نوسازی خودکار دوباره تلاش می‌کند.</div>':''}
    <nav class="sales-delivery-tabs" role="tablist" aria-label="مراحل پخش">${columns.map(c=>`<button type="button" role="tab" id="delivery-tab-${c.id}" aria-controls="delivery-panel-${c.id}" aria-selected="${c.id===selected}" tabindex="${c.id===selected?'0':'-1'}" class="sales-delivery-tab ${c.id===selected?'active':''}" data-delivery-tab="${c.id}"><span>${c.title}</span>${c.id==='history'?'':`<b>${qty(c.rows.length)}</b>`}</button>`).join('')}</nav>
    ${columns.map(c=>`<section class="sales-delivery-panel" role="tabpanel" id="delivery-panel-${c.id}" aria-labelledby="delivery-tab-${c.id}" data-delivery-section="${c.id}" ${c.id===selected?'':'hidden'}><header class="sales-delivery-panel-head"><div><h2>${c.title}</h2><p>${c.desc}</p></div><span>${qty(c.id==='history'?total:c.rows.length)} محموله</span></header><div class="sales-delivery-column-list">${c.rows.length?`<div class="bt-table-wrap"><table class="bt-table sales-distribution-table"><caption class="bt-caption">محموله‌های پخش فروش</caption><thead><tr>${['مشتری / فروشگاه','شماره سفارش','تاریخ ثبت','سرویس','وضعیت','راننده','تعداد اقلام','عملیات'].map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${c.rows.map(salesDeliverySummaryRow).join('')}</tbody></table></div>`:sdEmpty(c.id==='assigned'||c.id==='inTransit'?'truck':'receipt',c.empty,data.error?'دریافت اطلاعات ناموفق بود؛ نوسازی خودکار دوباره تلاش می‌کند.':'')}</div>${c.id==='history'?pages:''}</section>`).join('')}</section>`;
}
async function salesDeliveryHistoryPage(button){
  if(button.disabled)return;
  button.disabled=true;
  const previous=Number(app.salesDeliveryHistoryOffset)||0;
  try{
    if(app.salesFetchPromise)await app.salesFetchPromise;
    app.salesDeliveryHistoryOffset=Number(button.dataset.offset)||0;
    const data=await fetchSalesCache(true);
    if(data.dispatchDeliveries?.error)throw new Error('دریافت سوابق ناموفق بود.');
    app.salesDeliveryHistoryOffset=data.dispatchDeliveries.finalizedOffset||0;
    if(app.page==='sales'&&app.sub.sales==='delivery')paintSalesPaneV29('delivery',data);
  }catch(err){app.salesDeliveryHistoryOffset=previous;button.disabled=false;toast(err.message);}
}

async function salesViewDeliverySignatureV38(id,run=0) {
  try {
    const data=await api(`/api/sales/dispatch-deliveries/${encodeURIComponent(id)}${run?`?run=${encodeURIComponent(run)}`:''}`);
    if(!data.signatureData)return toast('برای این تحویل امضای دیجیتال ثبت نشده است.');
    const d=data.order?.dispatch||{};
    openModal(`امضای مشتری — سفارش ${data.order?.orderNo||''}`,`<div class="sales-delivery-signature"><img src="${esc(data.signatureData)}" alt="امضای ثبت‌شدهٔ مشتری"><small>ثبت‌شده توسط ${esc(d.deliveredBy||'راننده')} • ${esc(formatDateTime24(d.deliveredAt))}</small></div>`);
  } catch(err) { toast(err.message); }
}
document.addEventListener('click',e=>{const el=e.target.closest('#modal [data-action]');if(!el)return;const a=el.dataset.action;if(a==='sales-finalize-driver-delivery')void salesFinalizeDeliveryV38(el.dataset.id,el).then(ok=>{if(ok)closeModal()});else if(a==='sales-view-driver-signature')void salesViewDeliverySignatureV38(el.dataset.id,Number(el.dataset.run)||0);else if(a==='order-details')void openOrderDetails(el.dataset.id);});
async function srSalesOpenShip(orderId, run) { // v37.6.0
  const notices=captureEntityNotices('order',orderId,run);
  try {
    const [det, drv] = await Promise.all([api('/api/orders/'+encodeURIComponent(orderId)), api('/api/dispatch/drivers')]);
    const o = det.order || {};
    const ops = o.storeRunOps || {};
    const sh = run === 2 ? ops.r2Shipment : ops.r1Shipment;
    const label = run === 2 ? 'دوم' : 'اول';
    if (!sh || sh.status !== 'PENDING_SALES') { toast('این درخواست ارسال دیگر در انتظار نیست؛ فهرست نوسازی می‌شود.'); const data = await fetchSalesCache(true); if (app.page === 'sales' && app.sub.sales === 'delivery') paintSalesPaneV29('delivery', data); if (app.page === 'sales' && app.sub.sales === 'stores') paintSalesPaneV29('stores', data); return; }
    const items = (o.items || []).filter((i) => (sh.itemIds || []).includes(i.id));
    // v37.33.0 — مودال فقط وزن همان سرویس را نشان می‌دهد (نه جمع انباشتهٔ دو سرویس در deliveredKg)
    const runKgOf = (i) => { const v = ((o.storeRun && o.storeRun.items) || []).find((x) => x.itemId === i.id); return v ? Number(run === 2 ? v.r2Kg || 0 : v.r1Kg || 0) : Number(i.deliveredKg || 0); };
    // v37.6.0 — فلوی فروشگاه کاملاً بدون قیمت: فقط اقلام/وزن + انتخاب راننده
    openModal(`تعیین رانندهٔ محمولهٔ سرویس ${label}`, `<form id="srShipForm" class="sr-ship-form">
      <div class="sr-ship-modal-order"><span class="order-code">${esc(fa(o.orderNo||'—'))}</span><b>${esc(o.storeName||'فروشگاه')}</b><span class="st-run-chip st-run-r${run===2?2:1}">سرویس ${label}</span></div>
      <p class="sr-ship-hint">این محموله با رانندهٔ همین سرویس به فروشگاه ارسال می‌شود؛ فاکتور سرویس به‌صورت سند تحویل وزنی (بدون مبلغ) صادر می‌گردد.</p>
      <div class="bt-table-wrap"><table class="bt-table sr-ship-items-table"><caption class="bt-caption">اقلام محمولهٔ سرویس ${label}</caption><thead><tr><th scope="col">محصول</th><th scope="col">وزن سرویس</th>${run===2?'<th scope="col">ماندهٔ سرویس دوم</th>':''}</tr></thead><tbody>${items.map((i) => `<tr><td data-label="محصول">${esc(i.product?.name || 'قلم')}</td><td data-label="وزن سرویس">وزن سرویس: <b>${qty(runKgOf(i))} کیلوگرم</b></td>${run===2?`<td data-label="ماندهٔ سرویس دوم">ماندهٔ سرویس دوم: <b>${qty(Math.max(0,Number(i.requestedQty||0)-Number(((o.storeRun?.items||[]).find(x=>x.itemId===i.id)?.r1Kg)||0)))} ${esc(i.requestedUnit||'')}</b></td>`:''}</tr>`).join('')||`<tr><td colspan="${run===2?3:2}">قلمی یافت نشد.</td></tr>`}</tbody></table></div>
      <div class="field"><label>رانندهٔ محمولهٔ سرویس ${label}</label><div class="input-shell"><select id="srShipDriver" required><option value="">— انتخاب راننده —</option>${(drv.drivers || []).map((d) => `<option value="${esc(d.id)}">${esc(d.fullName)} — ${esc(d.plate || 'بدون پلاک')}</option>`).join('')}</select></div><div id="srShipPlate">${plateViewHtml('','—',true)}</div></div>
      <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">انصراف</button><button type="submit" class="btn btn-primary">${icon('send',16)} واگذاری به راننده</button></div>
    </form>`);
    $('#srShipDriver')?.addEventListener('change',e=>{$('#srShipPlate').innerHTML=plateViewHtml((drv.drivers||[]).find(d=>d.id===e.target.value)?.plate,'—',true);});
    $('#srShipForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const driverId = $('#srShipDriver')?.value || '';
      if (!driverId) return toast('رانندهٔ این محموله را انتخاب کنید.');
      if (!confirm(`محمولهٔ سرویس ${label} (${items.length} قلم) به رانندهٔ انتخاب‌شده واگذار می‌شود. ادامه می‌دهید؟`)) return;
      try {
        await api('/api/orders/' + encodeURIComponent(orderId) + '/send-dispatch', { method: 'POST', body: JSON.stringify({ driverId, run }) });
        closeModal(); toast(`محمولهٔ سرویس ${label} به راننده واگذار شد.`);
        const data = await fetchSalesCache(true); if (app.page === 'sales' && app.sub.sales === 'delivery') paintSalesPaneV29('delivery', data); if (app.page === 'sales' && app.sub.sales === 'stores') paintSalesPaneV29('stores', data); await refreshIndicators();
      } catch (err) { toast(err.message); }
    });
    finishEntityNotices(notices);return true;
  } catch (err) { toast(err.message);return false; }
}
async function salesFinalizeDeliveryV38(id,button) {
  if(button?.disabled)return false;
  if(button)button.disabled=true;
  try {
    await api(`/api/sales/dispatch-deliveries/${encodeURIComponent(id)}/finalize`,{method:'POST',body:'{}'});
  } catch(err) {
    toast(err.message);
    if(button)button.disabled=false;
    return false;
  }
  toast('تحویل بازبینی و ثبت نهایی شد؛ به نگهبانی ارجاعی ارسال نشد.');
  try {
    const data=await fetchSalesCache(true);
    if(app.page==='sales'&&app.sub.sales==='delivery')paintSalesPaneV29('delivery',data);
    if(app.page==='sales'&&app.sub.sales==='stores')paintSalesPaneV29('stores',data);
    await refreshIndicators();
  } catch(err) { toast('تحویل ثبت شد، اما تازه‌سازی صفحه ناموفق بود: '+err.message); }
  return true;
}
window.salesV29RenderPane=function(tab,data){
  if(tab==='onsite') return renderSalesOnsiteV25((data.visits||[]).filter(v=>v.status==='WAITING_SALES'));
  if(tab==='remote') return renderSalesRemoteV32(data.orders||[]);
  if(tab==='stores') return renderSalesStoresV41(data.orders||[], data.dispatchDeliveries||{});
  if(tab==='flow') return renderSalesFlowV25(salesFlowOrders(data.orders||[]));
  if(tab==='settlement') return renderSalesSettlementV25(salesAllInSettlement(data.orders||[]));
  if(tab==='delivery') return renderSalesDeliveryV38(data.dispatchDeliveries||{});
  if(tab==='future') return futureFormV38(data.orders||[]);
  return renderSalesOnsiteV25((data.visits||[]).filter(v=>v.status==='WAITING_SALES'));
};

/* ---------- به‌روزرسانی زنده (اصولِ یکسان با رندر اولیه) ---------- */
function paintSalesPaneV29(tab,data){
  const pane=app.salesV29.panes?.[tab]; if(!pane)return;
  if(pane.dataset.renderedV29!=='1'){
    pane.innerHTML=salesV29RenderPane(tab,data);
    pane.dataset.renderedV29='1';
    bindSalesPaneV29(tab);
    if(tab==='settlement' && stl.orderId) void stlOpen(stl.orderId);
    return;
  }
  if(tab==='onsite'){
    const list=pane.querySelector('#salesOnsiteListV25'); if(list)list.innerHTML=salesOnsiteRowsV25((data.visits||[]).filter(v=>v.status==='WAITING_SALES'));
  }else if(tab==='remote'){
    const live=remotePhoneQueueRowsV40(data.orders||[]);
    const host=pane.querySelector('.phone-queue-list-v40'); if(host)host.innerHTML=live.html;
    const count=pane.querySelector('.phone-queue-panel-v40 .sales-section-count strong'); if(count)count.textContent=qty(live.queue.length);
  }else if(tab==='stores'){
    pane.innerHTML=salesV29RenderPane(tab,data);
  }else if(tab==='flow'){
    const list=pane.querySelector('.v26-flow-list'); if(list)list.innerHTML=salesFlowRowsV27(salesFlowOrders(data.orders||[]))||sdEmpty('truck','سفارشی در جریان نیست','هر سفارشی که به انبار ارسال شود در این فهرست قرار می‌گیرد.');
  }else if(tab==='settlement'){
    const all=salesAllInSettlement(data.orders||[]);
    const p=pane.querySelector('.v26-settlement-list'); if(p)p.innerHTML=settlementPendingRowsV27(salesSettlementPendingOrders(all));
    const noGoods=pane.querySelector('.sales-no-goods-list'); if(noGoods)noGoods.innerHTML=salesNoGoodsRows(all);
    const i=pane.querySelector('.v26-invoice-list'); if(i)i.innerHTML=invoiceRowsV27(salesSettlementIssuedOrders(all)); // v37.5.0 // v37.6.1
  }else if(tab==='delivery'){
    pane.innerHTML=renderSalesDeliveryV38(data.dispatchDeliveries||{});
  }else if(tab==='future'){
    const list=pane.querySelector('#futureOrderListV25'); if(list)list.innerHTML=futureOrderRowsV25(salesFutureOrders(data.orders||[]));
    void refreshDepositRefunds();
  }
}

/* ================================================================
   قدم ۲ — بازطراحی کارتابل نگهبانی (v38)
   قراردادها حفظ شده‌اند: #gateForm, #noVehicle, #plateBox,
   #plateSuggest, #exitEditor, [data-exit-item], data-sub="gate:*"
   + رفع باگ قدیمی: اتصال کلیک پیشنهادهای پلاک (pick-customer)
   ================================================================ */

/* جلوگیری از تداخل هندلر فروش با دکمه‌های نگهبانی */
(function(){
  const _salesClick = salesV29ClickHandler;
  window.salesV29ClickHandler = function(e){ if(app.page==='gate') return; return _salesClick(e); };
  const _refresh = refreshIndicators;
  window.refreshIndicators = async function(){ await _refresh(); $$('.sd-tab-count[data-badge-key]').forEach(el=>el.classList.toggle('show',!!String(el.textContent).trim())); };
})();

function gtQueueRow(v){
 return `<tr data-visit="${esc(v.id)}"><td data-label="مشتری">${esc(v.customer?.name||'—')}${v.customer?.code?` <span class="sd-chip cust-code-chip">${esc(v.customer.code)}</span>`:''}</td><td data-label="پلاک">${plateViewHtml(v.customer?.plate,'بدون پلاک',true)}</td><td data-label="شماره تماس">${esc(v.customer?.phone||'—')}</td><td data-label="وضعیت">${badge(v.status)}</td></tr>`;
}
function gtWaitingTable(rows){
 if(!rows.length)return '';
 return `<div class="bt-table-wrap"><table class="bt-table gt-waiting-table"><caption class="bt-caption">مراجعه‌های در انتظار اقدام فروش</caption><thead><tr><th scope="col">مشتری</th><th scope="col">پلاک</th><th scope="col">شماره تماس</th><th scope="col">وضعیت</th></tr></thead><tbody>${rows.map(gtQueueRow).join('')}</tbody></table></div>`;
}

function gateDispatchTableRow(o){
  const d=o.dispatch||{};
  const cell=(field,label,value)=>`<td class="gate-dispatch-cell gate-dispatch-cell-${field}" data-field="${field}" data-label="${label}">${value}</td>`;
  const type=o.gateTransportShipment?'پخش':o.orderType==='STORE'?'فروشگاه':o.orderType==='ONSITE'?'حضوری':o.orderType==='REMOTE'?'غیرحضوری':'—';
  const typeHtml=`<span class="gate-dispatch-order-type">${type}</span>${o.orderType==='STORE'?'<small class="gate-dispatch-table-note">بدون مبلغ</small>':''}`;
  const service=o.gateStoreService?(o.storeOrderKind==='PARTIAL'?'سفارش جزئی':`سرویس ${d.run===2?'دوم':'اول'}`):d.run?`سرویس ${d.run===2?'دوم':'اول'}`:'—';
  const statusHtml=o.gateTransportShipment?'<span class="badge orange">آماده ثبت خروج نگهبان</span>':o.gateStoreService?'<span class="badge purple">منتظر تأیید خروج نگهبانی</span>':dspBadge(d.status);
  const itemCount=o.gateStoreService?(d.lines||[]).length:dspScopedItems(o).length;
  const actions=o.gateTransportShipment
    ?`<button type="button" class="btn btn-secondary btn-sm" data-gate="details" data-id="${esc(o.id)}">جزئیات اقلام</button><button type="button" class="btn btn-primary btn-sm" data-gate="transport-exit" data-id="${esc(o.id)}">ثبت خروج پخش</button>`
    :o.gateStoreService
      ?`<button type="button" class="btn btn-secondary btn-sm" data-gate="store-details" data-id="${esc(o.id)}" data-run="${d.run}">جزئیات محموله</button><button type="button" class="btn btn-primary btn-sm" data-gate="store-exit" data-id="${esc(o.id)}" data-run="${d.run}">تأیید خروج سرویس</button>`
      :`<button type="button" class="btn btn-secondary btn-sm" data-gate="details" data-id="${esc(o.id)}" data-run="${Number(d.run)||0}">جزئیات محموله</button><button type="button" class="btn btn-primary btn-sm" data-gate="exit" data-id="${esc(o.id)}">تأیید خروج راننده</button>`;
  return `<tr class="gate-dispatch-table-row" data-order="${esc(o.id)}">${cell('customer','مشتری / فروشگاه',`<strong>${esc(dspCustomer(o)||'—')}</strong>`)}${cell('order','شماره سفارش',`<bdi>${esc(fa(o.orderNo||'—'))}</bdi>`)}${cell('date','تاریخ ثبت',`<span>${esc(formatDateTime24(o.createdAt))}</span>`)}${cell('type','نوع سفارش',typeHtml)}${cell('service','سرویس',`<span>${esc(service)}</span>`)}${cell('driver','راننده',`<span>${esc(d.driverName||'—')}</span>`)}${cell('plate','پلاک',`<div class="gate-dispatch-table-plate">${plateViewHtml(d.driverPlate,'—',true)}</div>`)}${cell('status','وضعیت',statusHtml)}${cell('items','اقلام',`<span>${qty(itemCount)} قلم</span>`)}${cell('actions','عملیات',`<div class="gate-dispatch-table-actions">${actions}</div>`)}</tr>`;
}
function gateDispatchTableMarkup(rows){
  const empty='<tr class="gate-dispatch-table-empty"><td colspan="10">'+sdEmpty('truck','سفارشی در انتظار تأیید خروج نیست','پس از ثبت خروج راننده یا تأیید سرویس فروشگاه توسط فروش، محموله برای کنترل در این بخش نمایش داده می‌شود.')+'</td></tr>';
  return `<div class="bt-table-wrap gate-dispatch-table-wrap"><table class="bt-table gate-dispatch-table" aria-label="فهرست پخش در انتظار تأیید خروج"><thead><tr><th scope="col">مشتری / فروشگاه</th><th scope="col">شماره سفارش</th><th scope="col">تاریخ ثبت</th><th scope="col">نوع سفارش</th><th scope="col">سرویس</th><th scope="col">راننده</th><th scope="col">پلاک</th><th scope="col">وضعیت</th><th scope="col">اقلام</th><th scope="col">عملیات</th></tr></thead><tbody>${rows.map(gateDispatchTableRow).join('')||empty}</tbody></table></div>`;
}
function gateDispatchFocusMarkup(data){
  const rows=data.leaving||[];
  return `<section class="sd-panel gate-dispatch-focus" aria-label="در انتظار تأیید خروج"><div class="gate-tab-context"><p>خروج پخش و سرویس‌های تأییدشده فروش را پس از کنترل تأیید کنید.</p><span class="sd-count"><strong>${qty(rows.length)}</strong><span>سفارش</span></span></div>${gateDispatchTableMarkup(rows)}</section>`;
}
function gateDispatchTabsHtml(data,active,error=''){
  const nav=`<div class="gate-dispatch-tabs" role="tablist" aria-label="مراحل پخش"><button type="button" role="tab" aria-selected="true" class="active" data-gate-dispatch-tab="leaving">در انتظار تأیید خروج <b class="gate-dispatch-count" data-gate-dispatch-count="leaving">${qty((data.leaving||[]).length)}</b></button></div>`;
  const panel=error?`<div class="gate-dispatch-load-error" role="alert">صف خروج پخش بارگذاری نشد: ${esc(error)}</div>`:gateDispatchFocusMarkup(data);
  return nav+`<div id="gateDispatchPanel" role="tabpanel" aria-label="در انتظار تأیید خروج">${panel}</div>`;
}

async function renderGate(tab){
  if(app.timer){clearInterval(app.timer);app.timer=null;}
  app.sub.gate=tab;
  app.gateRenderSeq=(Number(app.gateRenderSeq)||0)+1;
  const renderSeq=app.gateRenderSeq;
  const visits=(await api('/api/visits'+(tab==='history'&&app.gateHistoryQ?'?q='+encodeURIComponent(app.gateHistoryQ):''))).visits||[];
  let dispatchData={awaitingDriver:[],leaving:[],inTransit:[]};
  let dispatchError='';
  try{dispatchData=await api('/api/gate/dispatch');}
  catch(err){dispatchError=err.message||'صف خروج ارسالی بارگذاری نشد.';}
  const exitOrders=tab==='exit'?(await fetchPagedList('/api/orders?status=SETTLED','orders')).orders:[];
  const cancelledVisits=tab==='exit'?(await fetchPagedList('/api/visits?status=CANCELLED_EXIT_PENDING','visits')).visits:[];
  const pickupExits=tab==='exit'&&app.features?.pickupStaging?(await fetchPagedList('/api/pickup/active','orders')).orders:[];
  if(app.page!=='gate'||app.sub.gate!==tab||app.gateRenderSeq!==renderSeq)return;
  let html='<span class="gate-ui-build" data-ui-build="37.3.18" hidden></span><div class="gate-workspace-content">';
  if(tab==='entry')html+=renderGateEntry();
  else if(tab==='waiting')html+=renderGateWaiting(visits.filter(v=>v.status==='WAITING_SALES'));
  else if(tab==='history')html+=`<div class="gate-history-search"><label for="gateHistorySearch">جستجوی سوابق مراجعه</label><input id="gateHistorySearch" type="search" maxlength="80" value="${esc(app.gateHistoryQ||'')}" placeholder="نام، شماره تماس، پلاک، کد یا شماره سفارش" autocomplete="off"><small>آخرین ۱۰۰ نتیجه نمایش داده می‌شود.</small></div><div id="gateHistoryLive" aria-live="polite">${renderGateHistory(visits,true)}</div>`;
  else if(tab==='exit'){app.gateExitPickups=pickupExits;html+=renderGateExit(exitOrders,pickupExits,cancelledVisits);}
  else if(tab==='dispatch'){app.gateDispatchTab='leaving';html+=gateDispatchTabsHtml(dispatchData,app.gateDispatchTab,dispatchError);}
  html+='</div>';
  $('#content').innerHTML=html; bindGate(tab); if(tab==='entry')bindPlate();
  dsp.sigs.gate=JSON.stringify(dispatchData);
  const sync=document.createElement('div');sync.id='gateSyncState';sync.className='bt-sync-state';sync.setAttribute('role','status');sync.textContent='آخرین به‌روزرسانی: '+(typeof serverNow==='function'?serverNow():new Date()).toLocaleTimeString('fa-IR');$('#content').append(sync);
  startGateDispatchLive();
}

function renderGateEntry(){
  return `<section class="sd-panel gt-entry-panel">
    <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico">${icon('gate',20)}</span><div><h2 data-gate-entry-title>ثبت ورود مشتری</h2><p data-gate-entry-help>مشتری را با شماره تماس جستجو و اطلاعات وسیله را جداگانه ثبت کنید.</p></div></div><span class="badge blue" data-gate-entry-badge>ورود مستقیم به صف فروش</span></div>

    <form id="gateForm" autocomplete="on">
      <section class="gt-search-panel" aria-labelledby="gateSearchTitle">
        <h3 id="gateSearchTitle">جست‌وجوی مشتری و سفارش</h3>
        <div class="gt-search-grid">
          ${app.features?.pickupStaging?`<div class="gt-order-search" data-pickup-search><label for="pickupOrderSearch">جست‌وجوی سفارش غیرحضوری برای تحویل در انبار</label><div class="cust-code-row"><input id="pickupOrderSearch" type="search" maxlength="80" placeholder="شماره سفارش، نام یا شماره تماس صاحب سفارش"><button type="button" class="btn btn-secondary" data-pickup-clear hidden>بازگشت به ورود عادی</button></div><div data-pickup-results aria-live="polite"></div><div data-pickup-selected></div></div>`:''}
          <div class="cust-code-entry"><div class="field"><label for="gateCustCode">جستجوی مشتری <small>(کد، نام، تماس یا پلاک)</small></label><div class="cust-code-row"><div class="input-shell"><span>${icon('search',16)}</span><input id="gateCustCode" name="customerSearch" autocomplete="off" placeholder="کد، نام، تماس یا پلاک" aria-controls="gateCustomerResults" aria-autocomplete="list" aria-expanded="false" role="combobox"></div><button type="button" class="btn btn-secondary" data-action="gate-code-lookup">جستجو</button></div></div><input type="hidden" name="customerId" id="gateCustId"><input type="hidden" name="customerCode" id="gateCustomerCodeValue"><div id="gateCustomerResults" class="gate-customer-results" aria-live="polite"></div><div id="gateCustChip"></div></div>
        </div>
      </section>
      <div class="sd-pad gt-entry-pad">
        <div class="gt-fieldset">
          <div class="gt-fieldset-title" data-gate-person-title>${icon('user',16)} مشخصات مشتری</div>
          <div class="gt-entry-cust">

            <div class="field"><label for="gateCustomerName">نام و نام خانوادگی</label><div class="input-shell"><span>${icon('user',16)}</span><input id="gateCustomerName" name="name" required placeholder="نام مشتری"></div></div>
            <div class="field"><label for="gateCustomerPhone">شماره تماس</label><div class="input-shell"><span>${icon('phone',16)}</span><input id="gateCustomerPhone" name="phone" required inputmode="tel" placeholder="۰۹۱۲ ..."></div></div>
          </div>
        </div>
        <div class="gt-fieldset">
          <div class="gt-fieldset-title">${icon('truck',16)} وسیله نقلیه <small>پلاک با قالب استاندارد ایران</small><label class="gt-switch"><input type="checkbox" id="noVehicle"> بدون وسیله</label></div>
          <div class="gt-entry-vehicle">
            <div class="gt-plate-col"><div id="plateBox"></div><div id="plateSuggest" class="gt-suggest"></div></div>
            <div class="gt-entry-vehicle-fields">
              <div class="field" id="gateVehicleTypeField"><label for="gateVehicleType">نوع وسیله</label><div class="input-shell"><select id="gateVehicleType" name="vehicleType"><option>خودرو</option><option>موتورسیکلت</option></select></div></div>
              <div class="field" id="gateCarTypeField"><label for="gateCarType">نوع خودرو</label><div class="input-shell"><input id="gateCarType" name="carType" maxlength="80" required placeholder="مثلاً پژو یا وانت"></div></div>
              <div class="field"><label for="gatePurpose">هدف مراجعه</label><div class="input-shell"><input id="gatePurpose" name="purpose" placeholder="خرید، دریافت سفارش یا توضیح کوتاه"></div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="sd-submit-bar"><small data-gate-entry-submit-help>پس از ثبت، اعلان فوری برای کارتابل فروش ارسال می‌شود.</small><button class="btn btn-primary btn-lg" type="submit">${icon('send',16)} ثبت ورود و ارسال به فروش</button></div>
      <div id="gateMsg" class="form-error" style="padding:0 22px 12px"></div>
    </form>
  </section>`;
}

/* v37.15.0 — «در انتظار اقدام فروش» منوی مستقل کارتابل نگهبانی است (قبلاً ستون کنار فرم ثبت ورود بود) */
function renderGateWaiting(queue){
  return `<section class="sd-panel" id="gateWaitingPanel">
    <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico" style="background:var(--orange-bg);color:var(--orange)">${icon('bell',19)}</span><div><h2>در انتظار اقدام فروش</h2><p>ورودی‌هایی که نگهبانی ثبت کرده و فروش هنوز برایشان سفارش ثبت نکرده است.</p></div></div><div class="sd-count"><strong>${qty(queue.length)}</strong><span>در صف</span></div></div>
    <div class="sd-queue gt-waiting-list" id="gateWaitingRows">${gtWaitingTable(queue)||sdEmpty('user','صف فعالی وجود ندارد','با ثبت ورود مشتری، وضعیت مراجعه در این فهرست دیده می‌شود.')}</div>
    <div style="padding:0 20px 18px"><div class="sd-live-note"><i></i> پس از ثبت سفارش توسط فروش، مورد از این فهرست خارج می‌شود؛ این نما به‌صورت خودکار به‌روز می‌شود.</div></div>
  </section>`;
}

function renderGateHistory(visits,hideHeading=false,detailsAction='gate-order-history'){
  return `<section class="sd-panel gate-customer-history">
    ${hideHeading?'':`<div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico" style="background:var(--blue-bg);color:var(--blue)">${icon('reports',19)}</span><div><h2>سوابق مراجعه</h2><p>مشتری، پلاک و سفارش‌های مرتبط با مراجعه.</p></div></div><div class="sd-count"><strong>${qty(visits.length)}</strong><span>مراجعه</span></div></div>`}
    <div class="gt-table-pad"><div class="bt-table-wrap"><table class="bt-table gt-customer-history-table"><caption class="bt-caption">سوابق مراجعه</caption><thead><tr><th>مشتری</th><th>پلاک</th><th>شماره سفارش</th><th>جزئیات سفارش</th></tr></thead><tbody>${visits.map(v=>{const order=v.order||null,orderId=order?.id,canOpen=!!orderId&&!!order.gateExitAvailable;return `<tr data-gate-visit="${esc(v.id)}"><td data-label="مشتری"><div class="gt-cust-cell"><span class="sd-avatar">${esc(initials(v.customer?.name||''))}</span><div><strong>${esc(v.customer?.name||'—')}</strong><small>${esc(v.customer?.phone||'')}</small></div></div></td><td data-label="پلاک">${plateViewHtml(v.plate ?? v.customer?.plate, 'بدون پلاک', true)}</td><td data-label="شماره سفارش">${order?esc(fa(order.orderNo||'—')):'—'}</td><td data-label="جزئیات سفارش"><button type="button" class="btn btn-secondary btn-sm" data-action="${esc(detailsAction)}"${orderId?` data-id="${esc(orderId)}"`: ''} ${canOpen?'':'disabled title="جزئیات پس از تسویه یا ثبت خروج سفارش در دسترس است"'}>${icon('eye',14)} جزئیات سفارش</button></td></tr>`;}).join('')||'<tr><td colspan="4" class="empty">سابقه‌ای ثبت نشده است.</td></tr>'}</tbody></table></div></div>
  </section>`;
}

function gateExitRow(o){
 const phone=storeAwareOrderPhone(o),name=storeAwareOrderName(o);
 return `<tr data-order="${esc(o.id)}"><td data-label="مشتری">${esc(name)}</td><td data-label="شماره و تاریخ سفارش">${esc(fa(o.orderNo||'—'))} • ${esc(dt(o.createdAt))}</td><td data-label="پلاک">${plateViewHtml(o.customer?.plate,'بدون پلاک',true)}</td><td data-label="شماره تماس">${esc(fa(phone))}</td><td data-label="تعداد اقلام">${qty(activeItemsOf(o).length)} قلم</td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-success btn-sm" data-action="open-exit" data-id="${esc(o.id)}">${icon('check',14)} ثبت خروج</button></td></tr>`;
}
function gatePickupExitRow(o){
 const recipient=o.recipient||{},cancelled=o.cancellation?.status==='EXIT_APPROVED';
 return `<tr data-order="${esc(o.id)}" data-pickup-exit="${esc(o.id)}"><td data-label="مشتری">${esc(o.customerName||'—')}<small class="gt-pickup-recipient">تحویل‌گیرنده: ${esc(recipient.name||'—')}</small></td><td data-label="شماره و تاریخ سفارش">${esc(fa(o.orderNo||'—'))} • ${esc(dt(o.enteredAt))}</td><td data-label="پلاک">${plateViewHtml(recipient.plate,'بدون پلاک',true)}</td><td data-label="شماره تماس">${esc(fa(recipient.phone||o.customerPhone||'—'))}</td><td data-label="تعداد اقلام">${cancelled?'خروج بدون کالا':qty((o.items||[]).length)+' قلم'}</td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-success btn-sm" data-action="open-pickup-exit" data-id="${esc(o.id)}">${icon('check',14)} ثبت خروج</button></td></tr>`;
}
function gateCancelledVisitRow(v){
 return `<tr data-cancelled-visit="${esc(v.id)}"><td data-label="مشتری">${esc(v.customer?.name||'—')}</td><td data-label="شماره و تاریخ سفارش">${esc(fa(v.order?.orderNo||'بدون سفارش'))} • ${esc(dt(v.createdAt))}</td><td data-label="پلاک">${plateViewHtml(v.plate||v.customer?.plate,'بدون پلاک',true)}</td><td data-label="شماره تماس">${esc(fa(v.customer?.phone||'—'))}</td><td data-label="تعداد اقلام">لغو؛ خروج بدون کالا</td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-success btn-sm" data-action="cancelled-onsite-exit" data-id="${esc(v.id)}">کنترل و ثبت خروج</button></td></tr>`;
}
function gateExitTable(rows,pickups=[],cancelled=[]){
 if(!rows.length&&!pickups.length&&!cancelled.length)return '';
 return `<div class="bt-table-wrap"><table class="bt-table gt-exit-table"><caption class="bt-caption">سفارش‌های آماده خروج</caption><thead><tr><th scope="col">مشتری</th><th scope="col">شماره و تاریخ سفارش</th><th scope="col">پلاک</th><th scope="col">شماره تماس</th><th scope="col">تعداد اقلام</th><th scope="col">عملیات</th></tr></thead><tbody>${rows.map(gateExitRow).join('')}${pickups.map(gatePickupExitRow).join('')}${cancelled.map(gateCancelledVisitRow).join('')}</tbody></table></div>`;
}
function renderGateExit(orders,pickups=[],cancelled=[]){
 const activeIds=new Set(pickups.map(o=>o.id));
 const regular=orders.filter(o=>!activeIds.has(o.id));
 const ready=pickups.filter(o=>o.cancellation?.status==='EXIT_APPROVED'||(o.status==='SETTLED'&&o.handover));
 return `<section class="sd-panel gt-exit-panel"><div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico" style="background:var(--green-bg);color:var(--green)">${icon('check',19)}</span><div><h2>سفارش‌های آماده خروج</h2><p>اقلام و وزن سفارش‌های مجاز به خروج را با بار واقعی تطبیق دهید.</p></div></div><div class="sd-count"><strong>${qty(regular.length+ready.length+cancelled.length)}</strong><span>آماده</span></div></div><div class="gt-exit-list" id="gateExitRows">${gateExitTable(regular,ready,cancelled)||sdEmpty('check','سفارشی آماده خروج نیست','پس از تسویه یا تأیید انصراف، سفارش برای کنترل خروج اینجا قرار می‌گیرد.')}</div><div id="exitEditor" style="padding:0 20px 20px"></div></section>`;
}
async function openPickupExit(id,btn){
 const host=$('#exitEditor');if(!host)return;const seq=app.gateExitEditorSeq=(Number(app.gateExitEditorSeq)||0)+1;
 host.innerHTML='<section class="sd-panel gt-exit-editor"><div class="gt-exit-loading" role="status">در حال دریافت جزئیات سفارش…</div></section>';
 if(btn){btn.disabled=true;btn.setAttribute('aria-busy','true');}
 try{
  const rows=(await fetchPagedList('/api/pickup/active','orders')).orders;
  const o=rows.find(x=>x.id===id&&(x.cancellation?.status==='EXIT_APPROVED'||(x.status==='SETTLED'&&x.handover)));
  if(!o)throw Error('این سفارش دیگر آماده خروج نیست؛ فهرست را به‌روزرسانی کنید.');
  if(!document.contains(host)||app.gateExitEditorSeq!==seq)return;
  const cancelled=o.cancellation?.status==='EXIT_APPROVED',person=o.recipient||{};
  const items=(o.items||[]).map(i=>`<tr><td data-label="تطبیق"><label class="gt-check"><input type="checkbox" data-pickup-check="${esc(i.itemId)}"><span>تطبیق ${esc(i.productName||'قلم')}</span></label></td><td data-label="محصول">${esc(i.productName||'—')}</td><td data-label="وزن تحویلی">${qty(i.deliveredKg)} کیلوگرم</td></tr>`).join('');
  host.innerHTML=`<section class="sd-panel gt-exit-editor" data-pickup-exit-editor="${esc(o.id)}"><div class="sd-head"><div><h2>کنترل خروج سفارش ${esc(fa(o.orderNo||'—'))}</h2><p>صاحب سفارش: ${esc(o.customerName||'—')} • ${esc(fa(o.customerPhone||'—'))}</p><p>تحویل‌گیرنده: ${esc(person.name||'—')} • ${esc(fa(person.phone||'—'))} • ${esc([person.vehicleType,person.carType,person.plate].filter(Boolean).join(' — ')||'بدون وسیله')}</p></div></div><div class="sd-pad">${cancelled?`<p>خروج بدون کالا؛ انصراف توسط انبار و فروش تأیید شده است.</p>${o.cancellation.returnedGoods?'<label class="gt-check"><input type="checkbox" data-pickup-no-goods><span>کنترل کردم مراجعه‌کننده هیچ کالایی همراه ندارد.</span></label>':''}`:`<div class="bt-table-wrap"><table class="bt-table gt-exit-items-table"><caption class="bt-caption">کنترل اقلام خروج</caption><thead><tr><th>تطبیق</th><th>محصول</th><th>وزن تحویلی</th></tr></thead><tbody>${items||'<tr><td colspan="3">قلمی برای کنترل نیست.</td></tr>'}</tbody></table></div>`}</div><p id="exitMsg" class="form-error gt-exit-msg" role="alert" hidden></p><div class="sd-submit-bar"><small>${cancelled?'خروج بدون کالا ثبت می‌شود.':'همه اقلام را با بار واقعی تطبیق دهید.'}</small><button type="button" class="btn btn-success btn-lg" data-action="${cancelled?'pickup-cancellation-exit':'pickup-goods-exit'}" data-id="${esc(o.id)}">ثبت خروج نهایی${cancelled?' بدون کالا':''}</button></div></section>`;
  host.scrollIntoView({behavior:'smooth',block:'nearest'});
 }catch(e){if(document.contains(host)&&app.gateExitEditorSeq===seq){host.innerHTML=`<section class="sd-panel gt-exit-editor"><p class="form-error" role="alert">${esc(e.message||'دریافت اطلاعات ناموفق بود.')}</p></section>`;toast(e.message);}}
 finally{if(btn&&document.contains(btn)){btn.disabled=false;btn.removeAttribute('aria-busy');}}
}
async function confirmPickupExit(button){
 const editor=button.closest('[data-pickup-exit-editor]');if(!editor||button.disabled)return;
 const checks=[...editor.querySelectorAll('[data-pickup-check]')],missing=checks.filter(x=>!x.checked),msg=editor.querySelector('#exitMsg');
 checks.forEach(x=>x.closest('.gt-check')?.classList.toggle('gt-check-missing',!x.checked));
 if(editor.querySelector('[data-pickup-no-goods]')&&!editor.querySelector('[data-pickup-no-goods]').checked){msg.textContent='ابتدا خروج بدون کالا را کنترل و تأیید کنید.';msg.hidden=false;return;}
 if(missing.length){msg.textContent='ابتدا همهٔ اقلام بار را کنترل و تیک بزنید.';msg.hidden=false;missing[0].scrollIntoView({behavior:'smooth',block:'center'});return;}
 const action=button.dataset.action==='pickup-goods-exit'?'goods-exit':'cancellation-exit';button.disabled=true;button.setAttribute('aria-busy','true');
 try{await api('/api/pickup/'+encodeURIComponent(button.dataset.id)+'/'+action,{method:'POST',body:JSON.stringify({checkedItems:checks.filter(x=>x.checked).map(x=>x.dataset.pickupCheck),...(action==='cancellation-exit'?{confirmedNoGoods:true}:{})})});toast('خروج نهایی ثبت شد.');await renderGate('exit');await refreshIndicators();}
 catch(e){button.disabled=false;button.removeAttribute('aria-busy');msg.hidden=false;msg.textContent=e.message||'ثبت خروج انجام نشد؛ دوباره تلاش کنید.';toast(msg.textContent);}
}
function bindGate(tab){
  const c=$('#content');
  c.onclick=async e=>{
    const dispatchTab=e.target.closest('[data-gate-dispatch-tab]');
    if(dispatchTab){app.gateDispatchTab='leaving';return;}
    const b=e.target.closest('[data-sub]');
    if(b){const [k,v]=b.dataset.sub.split(':'); if(k==='gate'){app.sub.gate=v; return renderGate(v);} return;}
    const gateAction=e.target.closest('[data-gate]');
    if(gateAction&&c.contains(gateAction))return handleGateDispatchAction(gateAction);
    const el=e.target.closest('[data-action]'); if(!el||!c.contains(el))return;
    const a=el.dataset.action;
    if(a==='pickup-goods-exit'||a==='pickup-cancellation-exit')return confirmPickupExit(el);
    if(a==='open-pickup-exit')return openPickupExit(el.dataset.id,el);
    if(a==='gate-order-history')return gateOrderHistory(el.dataset.id);
    if(a==='cancelled-onsite-exit')return confirmCancelledOnsiteExit(el);
    if(a==='open-exit')return openExit(el.dataset.id,el);
    if(a==='confirm-exit')return confirmExit(el.dataset.id);
    if(a==='pick-customer')return pickCustomer(Number(el.dataset.index));
  };
  const f=$('#gateForm'); if(f)f.addEventListener('submit',submitGate);
  if(app.features?.pickupStaging)bindPickupGateEntry();
  const nv=$('#noVehicle'); if(nv)nv.addEventListener('change',()=>{const box=$('#plateBox');if(box)box.hidden=nv.checked;if(nv.checked&&$('#plateSuggest'))$('#plateSuggest').innerHTML='';syncGateVehicleFields();});
  f?.elements.vehicleType?.addEventListener('change',syncGateVehicleFields);syncGateVehicleFields();
  const history=$('#gateHistorySearch');if(history)history.addEventListener('input',()=>queueGateHistorySearch(history));
  if($('#plateBox'))$('#plateBox').innerHTML=plateEditorHtml('',f?.elements.vehicleType?.value||'');
}

function bindWarehouseVisitHistory(content=$('#content')){
  if(!content)return;
  content.onclick=async e=>{
    const button=e.target.closest('[data-action="warehouse-visit-order-details"]');
    if(!button||!content.contains(button))return;
    return warehouseVisitOrderHistory(button.dataset.id);
  };
}

function bindPickupGateEntry(){
 const input=$('#pickupOrderSearch'),results=document.querySelector('[data-pickup-results]'),selected=document.querySelector('[data-pickup-selected]'),clear=document.querySelector('[data-pickup-clear]');
 if(!input||!results||!selected||!clear)return;
 let timer=0,seq=0,rows=[];app.pickupSelected=null;
 input.addEventListener('input',()=>{clearTimeout(timer);const search=input.value.trim(),id=++seq;if(search.length<2){results.innerHTML='';return;}
  timer=setTimeout(async()=>{try{const data=await api('/api/pickup/orders?q='+encodeURIComponent(search));if(seq!==id||!input.isConnected)return;rows=data.orders||[];results.innerHTML=`<div class="bt-table-wrap"><table class="bt-table gt-pickup-search-table"><caption class="bt-caption">نتایج جستجوی سفارش</caption><thead><tr><th scope="col">شماره سفارش</th><th scope="col">مشتری</th><th scope="col">شماره تماس</th><th scope="col">تاریخ تحویل</th><th scope="col">عملیات</th></tr></thead><tbody>${rows.map((o,i)=>`<tr><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="مشتری">${esc(o.customerName||'—')}</td><td data-label="شماره تماس">${esc(fa(o.customerPhone||''))}</td><td data-label="تاریخ تحویل">${esc(o.deliveryDate?dateLabel(o.deliveryDate):'تعیین نشده')}</td><td data-label="عملیات" class="bt-col-actions"><div class="bt-actions"><button type="button" class="btn btn-secondary btn-sm" data-pickup-details="${i}">جزئیات سفارش</button><button type="button" class="btn btn-secondary btn-sm" data-pickup-choose="${i}" ${o.hasOpenVisit?'disabled':''}>${o.hasOpenVisit?'مراجعه باز دارد':'انتخاب سفارش'}</button></div></td></tr>`).join('')||'<tr><td colspan="5">سفارشی یافت نشد.</td></tr>'}</tbody></table></div>`;}catch(e){if(seq===id)results.textContent='خطا در جست‌وجو: '+e.message;}},250);
 });
 const name=$('#gateCustomerName'),phone=$('#gateCustomerPhone');
 let otherDraft={name:'',phone:''};
 function resetPickupVehicle(){
  const form=$('#gateForm');form.elements.vehicleType.value='خودرو';form.elements.carType.value='';form.elements.purpose.value='';$('#noVehicle').checked=false;$('#plateBox').hidden=false;
  app.plate={a:'',letter:'ب',c:'',province:''};$('#plateBox').innerHTML=plateEditorHtml('','خودرو');$('#plateSuggest').innerHTML='';app.customerMatches=[];bindPlate();syncGateVehicleFields();
 }
 function setRecipientMode(other){
  if(!app.pickupSelected)return;
  name.readOnly=!other;phone.readOnly=!other;
  name.value=other?otherDraft.name:app.pickupSelected.customerName||'';
  phone.value=other?otherDraft.phone:app.pickupSelected.customerPhone||'';
  document.querySelector('label[for=gateCustomerName]').textContent=other?'نام تحویل‌گیرنده':'نام صاحب سفارش';
  document.querySelector('label[for=gateCustomerPhone]').textContent=other?'شماره تماس تحویل‌گیرنده':'شماره تماس صاحب سفارش';
  document.querySelector('[data-gate-person-title]').textContent=other?'مشخصات تحویل‌گیرنده':'مشخصات صاحب سفارش';
  document.querySelector('[data-pickup-mode-help]').textContent=other?'مشخصات شخصی که واقعاً برای تحویل مراجعه کرده است را وارد کنید.':'خود صاحب سفارش برای تحویل مراجعه کرده است.';
 }
 selected.addEventListener('change',e=>{
  if(!e.target.matches('[data-pickup-other]'))return;
  if(!e.target.checked)otherDraft={name:name.value,phone:phone.value};
  setRecipientMode(e.target.checked);if(e.target.checked)name.focus();
 });
 results.addEventListener('click',e=>{
  const details=e.target.closest('[data-pickup-details]');
  if(details){const o=rows[Number(details.dataset.pickupDetails)];if(!o)return;const lines=(o.items||[]).map(i=>`<tr><td data-label="محصول">${esc(i.productName||'—')}</td><td data-label="مقدار درخواستی">${qty(i.requestedQty)} ${esc(i.requestedUnit||'')}</td></tr>`).join('');openModal('جزئیات سفارش غیرحضوری',`<div class="gate-pickup-search-detail"><p>سفارش ${esc(fa(o.orderNo||'—'))} • ${esc(o.customerName||'—')} • ${esc(fa(o.customerPhone||'—'))}</p><p>تاریخ تحویل: ${esc(o.deliveryDate?dateLabel(o.deliveryDate):'تعیین نشده')} • وضعیت: ${badge(o.status)}</p><div class="bt-table-wrap"><table class="bt-table"><caption class="bt-caption">اقلام سفارش</caption><thead><tr><th>محصول</th><th>مقدار درخواستی</th></tr></thead><tbody>${lines||'<tr><td colspan="2">قلمی ثبت نشده است.</td></tr>'}</tbody></table></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button></div></div>`);return;}
  const button=e.target.closest('[data-pickup-choose]');if(!button)return;
  const o=rows[Number(button.dataset.pickupChoose)];if(!o)return;
  ++seq;clearTimeout(timer);app.pickupSelected=o;otherDraft={name:'',phone:''};resetPickupVehicle();
  selected.innerHTML=`<p>سفارش ${esc(fa(o.orderNo||'—'))} • صاحب سفارش: ${esc(o.customerName||'—')} • ${esc(fa(o.customerPhone||''))}</p><label class="gt-switch"><input type="checkbox" data-pickup-other> ثبت تحویل‌گیرنده</label> <span data-pickup-mode-help></span>`;
  results.innerHTML='';input.disabled=true;clear.hidden=false;
  $('#gateCustCode').value='';$('#gateCustCode').disabled=true;document.querySelector('.cust-code-entry').style.display='none';
  $('#gateCustId').value='';$('#gateCustomerCodeValue').value='';$('#gateCustomerResults').innerHTML='';$('#gateCustChip').innerHTML='';$('#plateSuggest').innerHTML='';app.customerMatches=[];
  document.querySelector('[data-gate-entry-title]').textContent='ثبت ورود برای تحویل سفارش';
  document.querySelector('[data-gate-entry-help]').textContent='اگر شخص دیگری برای تحویل مراجعه کرده، گزینه ثبت تحویل‌گیرنده را فعال کنید.';
  document.querySelector('[data-gate-entry-badge]').textContent='مراجعه برای تحویل در انبار';
  document.querySelector('[data-gate-entry-submit-help]').textContent='پس از ثبت، به انبار اطلاع داده می‌شود؛ سفارش تازه‌ای ساخته نمی‌شود.';
  $('#gateForm button[type=submit]').textContent='ثبت ورود برای تحویل';setRecipientMode(false);
 });
 clear.addEventListener('click',()=>{
  ++seq;clearTimeout(timer);app.pickupSelected=null;otherDraft={name:'',phone:''};selected.innerHTML='';results.innerHTML='';input.disabled=false;input.value='';clear.hidden=true;
  name.readOnly=false;phone.readOnly=false;name.value='';phone.value='';resetPickupVehicle();
  document.querySelector('label[for=gateCustomerName]').textContent='نام و نام خانوادگی';document.querySelector('label[for=gateCustomerPhone]').textContent='شماره تماس';
  $('#gateCustCode').disabled=false;document.querySelector('.cust-code-entry').style.display='';
  document.querySelector('[data-gate-entry-title]').textContent='ثبت ورود مشتری';document.querySelector('[data-gate-entry-help]').textContent='مشتری را با شماره تماس جستجو و اطلاعات وسیله را جداگانه ثبت کنید.';
  document.querySelector('[data-gate-entry-badge]').textContent='ورود مستقیم به صف فروش';document.querySelector('[data-gate-person-title]').textContent='مشخصات مشتری';
  document.querySelector('[data-gate-entry-submit-help]').textContent='پس از ثبت، اعلان فوری برای کارتابل فروش ارسال می‌شود.';$('#gateForm button[type=submit]').textContent='ثبت ورود و ارسال به فروش';
 });
}

function syncGateVehicleFields(){
 const f=$('#gateForm'),field=$('#gateCarTypeField'),input=$('#gateCarType');if(!f||!field||!input)return;
 const none=!!$('#noVehicle')?.checked,vehicleField=$('#gateVehicleTypeField'),plateCol=f.querySelector('.gt-plate-col'),grid=f.querySelector('.gt-entry-vehicle');
 if(vehicleField)vehicleField.hidden=none;if(plateCol)plateCol.hidden=none;if(grid)grid.classList.toggle('is-no-vehicle',none);f.elements.vehicleType.disabled=none;
 const show=!none&&f.elements.vehicleType.value==='خودرو';field.hidden=!show;input.disabled=!show;input.required=show;
}
let gateHistoryTimer=null,gateHistorySeq=0;
function queueGateHistorySearch(input){
 clearTimeout(gateHistoryTimer);const seq=++gateHistorySeq;app.gateHistoryQ=input.value.trim();
 gateHistoryTimer=setTimeout(async()=>{try{const q=app.gateHistoryQ;const result=await api('/api/visits'+(q?'?q='+encodeURIComponent(q):''));if(seq!==gateHistorySeq||!input.isConnected||app.sub.gate!=='history'||q!==app.gateHistoryQ)return;const host=$('#gateHistoryLive');if(host)host.innerHTML=renderGateHistory(result.visits||[],true);}catch(e){if(seq===gateHistorySeq&&input.isConnected){const host=$('#gateHistoryLive');if(host)host.innerHTML=`<p role="alert">جستجو ناموفق بود: ${esc(e.message||'خطای دریافت')}</p>`;}}},200);
}

/* پلاک ایران — ظاهر جدید، همان کلاس‌ها */
function plateMarkup(p){
  const letters=['ب','پ','ت','ث','ج','چ','ح','خ','د','ذ','ر','ز','ژ','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ک','گ','ل','م','ن','و','ه','ی'];
  return `<div class="iran-plate"><div class="blue-strip"><span>IR<br>ایران</span></div><div class="plate-part"><input class="plate-a" maxlength="2" inputmode="numeric" value="${esc(p.a||'')}" placeholder="۱۲" aria-label="دو رقم اول"></div><div class="plate-part"><select class="plate-letter" aria-label="حرف پلاک">${letters.map(l=>`<option ${l===(p.letter||'ب')?'selected':''}>${l}</option>`).join('')}</select></div><div class="plate-part"><input class="plate-c" maxlength="3" inputmode="numeric" value="${esc(p.c||'')}" placeholder="۳۴۵" aria-label="سه رقم"></div><div class="plate-part plate-code"><input class="plate-province" maxlength="2" inputmode="numeric" value="${esc(p.province||'')}" placeholder="۶۷" aria-label="کد استان"></div></div><div class="plate-preview">${formatPlate(p)||'نمونه: ۱۲ ب ۴۵ - ۷'}</div>`;
}

/* کنترل خروج — برگه بررسی مدرن */
async function openExit(id,btn){
  const notices=captureEntityNotices('order',id);
  const host=$('#exitEditor');if(!host)return;
  const seq=app.gateExitEditorSeq=(Number(app.gateExitEditorSeq)||0)+1;
  // v37.34.0 — بازخورد فوری: کلیک «کنترل خروج» هرگز بی‌واکنش به نظر نمی‌رسد؛
  // برگه بلافاصله با وضعیت بارگذاری باز می‌شود و دکمه تا پایان دریافت اطلاعات قفل است.
  if(host){host.innerHTML=`<section class="sd-panel gt-exit-editor"><div class="gt-exit-loading" role="status">در حال دریافت اطلاعات فاکتور…</div></section>`;host.scrollIntoView({behavior:'smooth',block:'nearest'});}
  if(btn){btn.disabled=true;btn.setAttribute('aria-busy','true');}
  try{
    const d=await api('/api/orders/'+id); const o=d.order;
    if(!document.contains(host)||app.gateExitEditorSeq!==seq)return;
    host.innerHTML=`<section class="sd-panel gt-exit-editor">
      <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico" style="background:var(--green-bg);color:var(--green)">${icon('truck',19)}</span><div><h2>کنترل خروج — ${esc(fa(o.payment?.invoiceNumber||o.orderNo||'—'))}</h2><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px"><span>${esc(storeAwareOrderName(o))}</span>${plateViewHtml(o.customer?.plate, 'بدون پلاک', true)}</div></div></div></div>
      <div class="sd-pad">
        <div class="bt-table-wrap"><table class="bt-table gt-exit-items-table"><caption class="bt-caption">کنترل اقلام خروج</caption><thead><tr><th scope="col">تطبیق</th><th scope="col">محصول</th><th scope="col">وزن تحویلی</th><th scope="col">وضعیت</th></tr></thead><tbody>${o.items.filter(i=>i.itemStatus!=='CANCELLED').map(i=>`<tr><td data-label="تطبیق"><label class="gt-check"><input type="checkbox" data-exit-item="${esc(i.id)}" checked><span>تطبیق ${esc(i.product?.name||'قلم')}</span></label></td><td data-label="محصول">${esc(i.product?.name||'—')}</td><td data-label="وزن تحویلی">${qty(i.deliveredKg)} کیلوگرم</td><td data-label="وضعیت">${badge(i.itemStatus)}</td></tr>`).join('')||'<tr><td colspan="4">قلمی برای کنترل نیست.</td></tr>'}</tbody></table></div>
      </div>
      <p id="exitMsg" class="form-error gt-exit-msg" role="alert" hidden></p>
      <div class="sd-submit-bar"><small>همه اقلام فاکتور را با بار واقعی تطبیق دهید.</small><button class="btn btn-success btn-lg" data-action="confirm-exit" data-id="${id}">${icon('check',16)} ثبت خروج نهایی</button></div>
    </section>`;
    host.scrollIntoView({behavior:'smooth',block:'nearest'});
    finishEntityNotices(notices);return true;
  }catch(e){
    // v37.34.0 — خطا هم داخل خود برگه دیده می‌شود، نه فقط پیام گذرا
    if(document.contains(host)&&app.gateExitEditorSeq===seq){host.innerHTML=`<section class="sd-panel gt-exit-editor"><p class="form-error gt-exit-msg" role="alert">دریافت اطلاعات فاکتور انجام نشد: ${esc(e.message||'خطای نامشخص')} — دوباره روی «کنترل خروج» بزنید.</p></section>`;toast(e.message);}
  }finally{
    if(btn&&document.contains(btn)){btn.disabled=false;btn.removeAttribute('aria-busy');}
  }
}

/* ================================================================
   قدم ۳ — بازطراحی انبار (دومرحله‌ای) + کارتابل فروشگاه (v38)
   ================================================================ */

/* ---------------- انبار ---------------- */
app.wh38 = app.wh38 || { phase:'incoming', timer:null, storeTab:'incoming' };
if(!['incoming','preparing','history'].includes(app.wh38.storeTab)) app.wh38.storeTab='incoming'; // v37.36.0 — سربرگ «سوابق و گزارشات» هم مجاز است


/* v37.50.0 — «جزئیات سفارش» کارتابل انبار: پروندهٔ کامل سفارش به‌جای فهرست دوستونی اقلام.
   نوع سفارش، اطلاعات کامل مشتری، ثبت سفارش و کاربر ثبت‌کننده، سند و وزن‌کشی هر قلم
   با نام کاربر، مراحل و همهٔ رویدادهای مرتبط نمایش داده می‌شود.
   ردیف‌های اقلام ورودی (records) پشتیبانِ پاسخ‌های قدیمی/نگهبانی است. */
const WH_VISIT_EVENT_LABELS={CREATE_VISIT:'ثبت مراجعهٔ اولیه',CREATE_ORDER:'ثبت سفارش حضوری',CREATE_REMOTE_ORDER:'ثبت سفارش غیرحضوری',CREATE_STORE_ORDER:'ثبت سفارش فروشگاه',UPDATE_STORE_ORDER:'ویرایش سفارش فروشگاه',SALES_EDIT_STORE_ORDER:'اصلاح سفارش فروشگاه',APPROVE_STORE_ORDER:'تأیید سفارش توسط فروش',QUICK_SEND_STORE_ORDER:'ارسال سریع به انبار',ACTIVATE_REMOTE_ORDER:'فعال‌سازی سفارش زمان‌بندی‌شده',WAREHOUSE_ACCEPT_ORDER:'دریافت سفارش در انبار',WAREHOUSE_START_PREPARING:'شروع آماده‌سازی',WAREHOUSE_DRAFT_SAVED:'ذخیرهٔ پیش‌نویس وزن',WAREHOUSE_FINALIZE:'ثبت وزن نهایی انبار',WAREHOUSE_DOCUMENT_EDITED:'اصلاح سند انبار',WAREHOUSE_DOCUMENT_EDIT_REQUESTED:'درخواست اصلاح سند',REOPEN_WAREHOUSE_PREPARING:'بازگشایی آماده‌سازی',RETURN_TO_SALES:'ارجاع به فروش',RESUBMIT_TO_WAREHOUSE:'ارسال مجدد به انبار',WAREHOUSE_PHYSICAL_HANDOVER:'تحویل فیزیکی از انبار',TRANSPORT_WAREHOUSE_HANDOVER:'تحویل کالا به راننده',TRANSPORT_PLAN_ASSIGNED:'تخصیص راننده و خودرو',PICKUP_ENTRY:'ثبت ورود تحویل‌گیرنده',PICKUP_PHYSICAL_HANDOVER:'تحویل فیزیکی سفارش',PICKUP_GOODS_EXIT:'ثبت خروج کالا',STORE_ORDER_OUT_OF_STOCK:'ثبت ناموجودی',STORE_PARTIAL_OUT_OF_STOCK:'ثبت ناموجودی سفارش جزئی'};
function whVisitActor(user){return esc(user?.name||user?.username||'ثبت‌کنندهٔ نامشخص')}
function whVisitTypeLabel(order){return ({ONSITE:'حضوری',REMOTE:'غیرحضوری',STORE:'فروشگاهی'})[order?.orderType]||order?.orderType||'—'}
function openVisitOrderDetailsModal(order,records){
 const o=order||{},customer=o.customer||{},visit=o.visit||{},items=o.items||[],stages=o.stages||[],events=o.events||[];
 const cell=(label,value)=>`<div class="whh-detail-cell"><small>${esc(label)}</small><b>${value==null||value===''?'—':value}</b></div>`;
 const customerFields=[['کد مشتری',esc(fa(customer.code||''))],['نام و نام خانوادگی',esc(customer.name||'')],['شماره تماس',esc(fa(customer.phone||''))],['شماره تماس دوم',esc(fa(customer.phone2||''))],['کد ملی',esc(fa(customer.nationalId||''))],['شرکت / واحد',esc(customer.company||'')],['پلاک',esc(fa(customer.plate||''))],['نوع وسیله',esc(customer.vehicleType||'')],['نوع خودرو',esc(customer.carType||'')],['نشانی',esc(customer.address||'')],['یادداشت مشتری',esc(customer.notes||'')]];
 const orderFields=[['نوع سفارش',esc(whVisitTypeLabel(o))],['وضعیت فعلی',badge(o.status)],['شماره سفارش',esc(fa(o.orderNo||'—'))],['شماره سند انبار',esc(fa(o.warehouseDocumentNo||''))],['فروشگاه',esc(o.storeName||'')],['تاریخ و ساعت ثبت سفارش',esc(formatDateTime24(o.createdAt))],['ثبت‌کنندهٔ سفارش',whVisitActor(o.createdBy)],['آخرین تغییر',esc(formatDateTime24(o.updatedAt))],['زمان برنامه‌ریزی‌شده',esc(formatDateTime24(o.scheduledAt||o.scheduledDate))],['تاریخ تحویل',esc(formatDateTime24(o.deliveryDate))],['محل ارسال',esc(o.dispatchPlace||'')],['یادداشت سفارش',esc(o.notes||'')],['دریافت در انبار',esc(formatDateTime24(o.warehouseAcceptedAt))],['ثبت‌کنندهٔ دریافت انبار',whVisitActor(o.warehouseAcceptedBy)],['شروع آماده‌سازی',esc(formatDateTime24(o.warehousePreparationStartedAt))],['شروع‌کنندهٔ آماده‌سازی',whVisitActor(o.warehousePreparationStartedBy)],['ثبت وزن نهایی',esc(formatDateTime24(o.warehouseCompletedAt))],['ثبت‌کنندهٔ وزن نهایی',whVisitActor(o.warehouseCompletedBy)]];
 const profileCell=(label,value)=>`<div class="whh-detail-cell"><small>${esc(label)}</small><b>${value||'—'}</b></div>`;
 const customerHtml=customerFields.some(([,value])=>value&&value!=='—')?`<section><h3>اطلاعات کامل مشتری</h3><div class="whh-detail-grid">${customerFields.map(([label,value])=>profileCell(label,value)).join('')}</div></section>`:'';
 const visitHtml=visit.id?`<section><h3>مراجعهٔ مرتبط</h3><div class="whh-detail-grid">${cell('هدف مراجعه',esc(visit.purpose||''))}${cell('زمان مراجعه',esc(formatDateTime24(visit.createdAt)))}${cell('ثبت‌کنندهٔ مراجعه',whVisitActor(visit.createdBy))}${cell('پلاک ثبت‌شده',esc(fa(visit.plate||'')))}${cell('نوع وسیله',esc(visit.vehicleType||''))}${cell('نوع خودرو',esc(visit.carType||''))}</div></section>`:'';
 const weighLog=(rows,label)=>(rows||[]).map(row=>`<div class="whh-weight-log"><b>${label}${row.note?` — ${esc(row.note)}`:''}</b><span>${qty(row.kg)} کیلوگرم${row.tareCount?` · ${qty(row.tareCount)} توزین`:''}</span><small>${esc(formatDateTime24(row.at))} · ثبت‌کننده: ${esc(row.user?.name||row.user?.username||row.byName||'نامشخص')}</small></div>`).join('');
 const itemRows=items.length?items.map((item,index)=>{
  const weights=[weighLog(item.runR1,'وزن سرویس اول'),weighLog(item.runR2,'وزن سرویس دوم')].join('');
  return `<tr><td data-label="ردیف">${fa(String(index+1))}</td><td data-label="کالا"><b>${esc(item.productName||item.product?.name||'—')}</b>${item.description?`<small class="whh-item-description">${esc(item.description)}</small>`:''}</td><td data-label="مقدار درخواستی">${qty(item.requestedQty)} ${esc(item.requestedUnit||'')}</td><td data-label="وزن نهایی">${item.outOfStock?'ناموجود':`${qty(item.deliveredKg)} کیلوگرم`}</td><td data-label="وضعیت و ثبت‌کننده">${badge(item.status||item.itemStatus||'—')}${weights?`<details class="whh-event-details"><summary>سوابق وزن‌کشی و کاربر ثبت‌کننده</summary>${weights}</details>`:''}</td></tr>`;
 }).join(''):'';
 const legacyItems=(records||[]).flatMap(record=>(record.items||[]).filter(item=>item.itemStatus!=='CANCELLED').map(item=>({serviceRun:record.serviceRun||record.dispatch?.run||null,...item})));
 const legacyRows=!items.length&&legacyItems.length?legacyItems.map(item=>`<tr><td data-label="ردیف">${item.serviceRun?`سرویس ${fa(item.serviceRun)}`:'—'}</td><td data-label="کالا"><b>${esc(item.product?.name||'—')}</b></td><td data-label="مقدار درخواستی">—</td><td data-label="وزن نهایی">${qty(item.deliveredKg)} کیلوگرم</td><td data-label="وضعیت و ثبت‌کننده">${badge(item.itemStatus||'—')}</td></tr>`).join(''):'';
 const itemsHtml=`<section><h3>اقلام سفارش و وزن‌کشی</h3><div class="bt-table-wrap"><table class="bt-table whh-order-items"><caption class="bt-caption">اقلام سفارش و وزن‌کشی</caption><thead><tr><th>#</th><th>کالا</th><th>مقدار درخواستی</th><th>وزن نهایی</th><th>وضعیت و ثبت‌کننده</th></tr></thead><tbody>${items.length?itemRows:legacyRows||'<tr><td colspan="5">قلمی در سفارش ثبت نشده است.</td></tr>'}</tbody></table></div></section>`;
 const stagesHtml=stages.length?`<section><h3>مراحل سفارش</h3><ol class="whh-order-timeline">${stages.map(stage=>`<li><b>${esc(stage.label)}</b><small>${esc(formatDateTime24(stage.at))} · ثبت‌کننده: ${whVisitActor(stage.user)}</small></li>`).join('')}</ol></section>`:'';
 const actorNames=events.filter(event=>event.user).map(event=>`${event.user.name||event.user.username||''}`).filter(Boolean);
 const distinctActors=[...new Set(actorNames)];
 const eventsHtml=`<section><h3>همهٔ رویدادهای ثبت‌شده</h3>${distinctActors.length?`<p class="whh-detail-actor"><b>کاربران دخیل در این سفارش:</b> ${esc(distinctActors.join('، '))}</p>`:''}<ol class="whh-order-events">${events.map(event=>`<li><div class="whh-event-head"><b>${esc(event.label||WH_VISIT_EVENT_LABELS[event.action]||event.action||'اقدام ثبت‌شده')}</b><small>${esc(formatDateTime24(event.createdAt))} · ثبت‌کننده: ${whVisitActor(event.user)}</small></div></li>`).join('')||'<li>رویداد ثبت‌شده‌ای برای این سفارش موجود نیست.</li>'}</ol></section>`;
 openModal(`جزئیات سفارش ${fa(o.orderNo||'—')}`,`<div class="whh-order-detail">
   <section><h3>مشخصات سفارش</h3><div class="whh-detail-grid">${orderFields.map(([label,value])=>cell(label,value)).join('')}</div>${o.warehouseReturn?.reason?`<p class="whh-detail-actor"><b>ارجاع به فروش:</b> ${esc(o.warehouseReturn.reason)}</p>`:''}</section>
   ${customerHtml}${visitHtml}${itemsHtml}${stagesHtml}${eventsHtml}
   <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button></div>
 </div>`);
}
async function gateOrderHistory(id){
 try{
  const exitRows=(await api('/api/gate/exit-history?id='+encodeURIComponent(id))).orders||[];
  const exited=exitRows.filter(row=>row.id===id||String(row.id||'').startsWith(id+':'));
  let order=exited[0]||null;
  if(!order)order=(await api('/api/orders/'+encodeURIComponent(id))).order;
  if(!order)throw Error('جزئیات سفارش در دسترس نیست.');
  openVisitOrderDetailsModal(order,exited.length?exited:[order]);
 }catch(e){toast(e.message);}
}
async function warehouseVisitOrderHistory(id){
 try{
  const result=await api('/api/warehouse/visit-order-details/'+encodeURIComponent(id));
  if(!result.order)throw Error('جزئیات سفارش در دسترس نیست.');
  openVisitOrderDetailsModal(result.order,result.records||[]);
 }catch(e){toast(e.message);}
}

async function confirmCancelledOnsiteExit(button){
 if(!confirm('آیا مشتری و وسیله را کنترل کرده‌اید و خروج بدون کالا را تأیید می‌کنید؟'))return;
 if(button.disabled)return;button.disabled=true;
 try{await api('/api/visits/'+encodeURIComponent(button.dataset.id)+'/cancelled-exit',{method:'POST',body:JSON.stringify({confirmedNoGoods:true})});toast('خروج بدون کالا ثبت شد.');await renderGate('exit');}
 catch(e){toast(e.message);}finally{button.disabled=false;}
}
/* ── bt-table: سیستم جدول مشترک کارتابل‌ها ─────────────────────────────────
   همهٔ فهرست‌های کارتابلی با همین الگو ساخته می‌شوند: هدر ثابت، ستون‌های
   مشخص، «مشخصات» هر آیتم در خط دوم همان سلول، و ستون عملیات در انتها.
   در عرض ≤۹۰۰px هر ردیف با CSS (نه با HTML) به کارت برچسب‌دار تبدیل می‌شود. */
function btDate(v){ const s=String(v||''); return /^\d{4}-\d{2}-\d{2}/.test(s)?dateLabel(s.slice(0,10)):'—'; }
function btTime(v){ const m=String(v||'').match(/[T ](\d{2}):(\d{2})/); return m?fa(m[1]+':'+m[2]):''; }
function wh38OrdersTable(orders,kind){
  const rows=orders.map(o=>{
    const name=storeAwareOrderName(o)||'—';
    const delivery=o.deliveryDate||o.scheduledDate||'';
    // v1.1.12 — همهٔ دکمه‌های قبلی همان ردیف برگشتند (جزئیات / شروع آماده‌سازی /
    // ثبت انصراف) و فقط «تاریخ تحویل» بدون ساعت نمایش داده می‌شود.
    const actions=[
      `<button type="button" class="btn btn-secondary btn-sm" data-action="wh38-order-details" data-id="${esc(o.id)}">${icon('eye',14)} جزئیات سفارش</button>`,
      app.features?.pickupStaging&&o.visit?.status==='PICKUP_PRESENT'&&!o.pickupCancellation?`<button type="button" class="btn btn-secondary btn-sm" data-action="pickup-cancel" data-id="${esc(o.id)}">ثبت انصراف بدون تحویل</button>`:'',
      o.pickupCancellation?.status==='PENDING_SALES'?'<span class="bt-cell-note">در انتظار تأیید انصراف فروش</span>':kind==='incoming'?'':`<button type="button" class="btn btn-primary btn-sm" data-action="wh38-start" data-id="${esc(o.id)}">شروع آماده‌سازی</button>`
    ].filter(Boolean).join('');
    return `<tr data-order="${esc(o.id)}">
      <td data-label="شماره سفارش"><span class="bt-cell-main order-code">${esc(fa(o.orderNo||'—'))}</span></td>
      <td data-label="نام مشتری"><span class="bt-cell-main" title="${esc(name)}">${esc(name)}</span></td>
      <td data-label="تاریخ سفارش"><span class="bt-cell-main">${btDate(o.createdAt)}</span><span class="bt-cell-sub">${btTime(o.createdAt)||'—'}</span></td>
      <td data-label="تاریخ تحویل"><span class="bt-cell-main">${btDate(delivery)}</span></td>
      <td data-label="عملیات" class="bt-col-actions"><div class="bt-actions">${actions}</div></td>
    </tr>`;
  }).join('');
  return `<div class="bt-table-wrap"><table class="bt-table wh-orders-table">
    <caption class="bt-caption">${kind==='incoming'?'سفارش‌های ورودی انبار':'سفارش‌های در حال آماده‌سازی انبار'}</caption>
    <thead><tr><th scope="col">شماره سفارش</th><th scope="col">نام مشتری</th><th scope="col">تاریخ سفارش</th><th scope="col">تاریخ تحویل</th><th scope="col" class="bt-col-actions">عملیات</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}
function wh38Tabs(active){
  const inc=badgeCount('warehouseIncomingRegular')||badgeCount('warehouseIncoming'), prep=badgeCount('warehousePreparingRegular')||badgeCount('warehousePreparing'), st=badgeCount('warehouseStores');
  return `<div class="wh38-tabs">
    <button type="button" class="wh38-tab ${active==='incoming'?'active':''}" data-wh38-tab="incoming"><span class="wh38-tab-idx">۰۱</span><span>${icon('truck',22)}</span><div><b>سفارش‌های ورودی</b><small>فقط مشتریان عادی — تأیید ورود به آماده‌سازی</small></div><em>${qty(inc)}</em></button>
    <button type="button" class="wh38-tab ${active==='preparing'?'active':''}" data-wh38-tab="preparing"><span class="wh38-tab-idx">۰۲</span><span>${icon('scale',22)}</span><div><b>آماده‌سازی و تحویل</b><small>فقط مشتریان عادی — ثبت وزن و ارسال به تسویه فروش</small></div><em>${qty(prep)}</em></button>
    <button type="button" class="wh38-tab ${active==='stores'?'active':''}" data-wh38-tab="stores" data-testid="wh-stores-tab"><span class="wh38-tab-idx">۰۳</span><span>${icon('store',22)}</span><div><b>فروشگاه‌ها</b><small>تأیید، آماده‌سازی و سرویس‌های ارسال فروشگاه‌ها</small></div><em>${qty(st)}</em></button>
    <button type="button" class="wh38-tab wh38-tab-history ${active==='history'?'active':''}" data-wh38-tab="history"><span class="wh38-tab-idx">۰۴</span><span>${icon('reports',22)}</span><div><b>سوابق و گزارش</b><small>سفارش‌های تحویل‌شده، خلاصهٔ کالاها و چاپ گزارش</small></div></button>
  </div>`;
}
/* v37.3.18 — compact incoming header: customer and three equal metadata cells. */
function wh38IncomingHeader(o){
  const name=storeAwareOrderName(o);
  const created=formatDateTime24(o.createdAt);
  const updated=formatDateTime24(o.updatedAt||o.createdAt);
  // محل ارسال را واحد فروش تعیین می‌کند؛ «محله» پروندهٔ مشتری معیار تحویل نیست.
  const place=String(o.dispatchPlace||'').trim();
  const contact=[storeAwareOrderPhone(o),place?`محل ارسال: ${place}`:''].filter(Boolean).join(' • ');
  const storeContact=place;
  return `<div class="wh38-incoming-heading"><div class="sd-chips"><span class="order-code">${esc(fa(o.orderNo||'—'))}</span>${sdTypeBadge(o)}</div>${badge(o.status)}</div>
    <div class="wh38-incoming-summary-scroll"><div class="wh38-incoming-summary">
      <div class="wh38-incoming-cell wh38-incoming-customer"><b>${o.orderType==='STORE'?'فروشگاه':'مشتری'}</b><h3 title="${esc(name)}">${esc(name)}</h3></div>
      <div class="wh38-incoming-cell"><b>اقلام</b><span>${qty(activeItemsOf(o).length)} قلم</span></div>
      <div class="wh38-incoming-cell"><b>ثبت</b><span title="${esc(created)}">${esc(created)}</span></div>
      <div class="wh38-incoming-cell"><b>آخرین اقدام</b><span title="${esc(updated)}">${esc(updated)}</span></div>
    </div></div>
    <p class="wh38-incoming-contact">${esc((o.orderType==='STORE'?storeContact:contact)||'محل ارسال ثبت نشده')}${o.deliveryDate?` <span class="wh38-delivery-date"> • تاریخ تحویل: <b>${esc(dateLabel(o.deliveryDate))}</b></span>`:''}</p>`;
}
/* v37.9.0 — Warehouse > Stores: horizontal sub-tabs (like Guard/Sales) + vertical forms.
   The order header is deliberately one line: order no. + store + items + time (+place).
   Full timestamps stay in the title tooltip; the 4-cell summary is not used for stores. */
function wh38StoreTabs(active,counts){
  // سربرگ سوم، فقط برای سفارش‌ها و اسناد فروشگاهی که در انبار ثبت شده‌اند.
  const tabs=[['incoming','ورودی'],['preparing','آماده‌سازی و سرویس‌ها'],['history','سوابق سفارش‌های ثبت‌شده']];
  return `<nav class="wh38-store-tabs" role="tablist" aria-label="بخش‌های فروشگاه در انبار">${tabs.map(([id,label])=>`<button type="button" role="tab" class="wh38-store-tab ${active===id?'active':''}" data-wh38-store-tab="${id}" aria-selected="${active===id}"><span>${label}</span><b>${qty(counts[id]||0)}</b></button>`).join('')}</nav>`;
}
function wh38StoreHeader(o){
  const name=storeAwareOrderName(o);
  const created=formatDateTime24(o.createdAt);
  const updated=formatDateTime24(o.updatedAt||o.createdAt);
  const place=String(o.dispatchPlace||'').trim();
  const tip=`ثبت: ${created} • آخرین اقدام: ${updated}${place?` • محل ارسال: ${place}`:''}`;
  return `<div class="wh38-store-head" title="${esc(tip)}"><span class="order-code">${esc(fa(o.orderNo||'—'))}</span><strong class="wh38-store-name" title="${esc(name)}">${esc(name)}</strong><span>${o.storeOrderKind==='PARTIAL'?'سفارش جزئی':'سفارش روزانه'}</span><span class="wh38-store-meta">${qty(activeItemsOf(o).length)} قلم • ${esc(created)}${place?` • ${esc(place)}`:''}</span>${badge(o.status)}</div>`;
}
function wh38StoreList(orders,kind){
  const incoming=kind==='incoming';
  const rows=orders.map(o=>{
    const store=String(o.storeName||'فروشگاه'),stock=o.storeOrderKind==='PARTIAL'&&o.storePurpose==='STOCK';
    const identity=stock?'تأمین تکمیلی فروشگاه':(o.customer?.name?'مشتری: '+o.customer.name:'—');
    const orderKind=o.storeOrderKind==='PARTIAL'?'سفارش جزئی':'سفارش روزانه';
    const created=formatDateTime24(o.createdAt),scheduled=o.scheduledAt?formatDateTime24(o.scheduledAt):'';
    const action=incoming
      ?`<button type="button" class="btn btn-secondary btn-sm" data-action="wh38-store-details" data-id="${esc(o.id)}">${icon('eye',14)} جزئیات</button>`
      :`<button type="button" class="btn btn-primary btn-sm" data-action="wh38-start" data-id="${esc(o.id)}">${icon('eye',14)} جزئیات آماده‌سازی</button>`;
    return `<tr data-store-order="${esc(o.id)}"><td data-label="فروشگاه / مشتری"><div class="wh38-store-table-identity"><strong title="${esc(store)}">${esc(store)}</strong><small>${esc(identity)}</small></div></td><td data-label="شماره سفارش"><span class="order-code">${esc(fa(o.orderNo||'—'))}</span></td><td data-label="نوع سفارش">${orderKind}</td><td data-label="تاریخ ثبت"><time title="${esc(created)}">${esc(created)}</time>${scheduled?`<small class="wh38-store-table-scheduled">ارسال: ${esc(scheduled)}</small>`:''}</td><td data-label="وضعیت">${badge(o.status)}</td><td data-label="محل ارسال">${esc(String(o.dispatchPlace||'').trim()||'—')}</td><td data-label="اقلام">${qty(activeItemsOf(o).length)} قلم</td><td data-label="اقدامات"><div class="wh38-store-table-actions">${action}</div></td></tr>`;
  }).join('');
  return wh38StockPreviewLinks(orders)+`<div class="wh38-store-list wh38-store-table-wrap"><table class="wh38-store-table wh38-store-${incoming?'incoming':'preparing'}"><thead><tr><th>فروشگاه / مشتری</th><th>شماره سفارش</th><th>نوع سفارش</th><th>تاریخ ثبت</th><th>وضعیت</th><th>محل ارسال</th><th>اقلام</th><th>اقدامات</th></tr></thead><tbody>${rows||'<tr><td colspan="8">سفارشی برای نمایش وجود ندارد.</td></tr>'}</tbody></table></div>`;
}
/* v37.22.0 — جزئیات کامل سفارش ورودی فروشگاه در انبار؛ تأیید در پایان فهرست اقلام و ورود به آماده‌سازی */
/* v37.35.0 — همان فرم، فشرده: سربرگ و مشخصات در دو خط، برچسب ستون‌ها فقط در سطر عنوان،
   ردیف‌های تک‌خطی کوتاه‌تر؛ شبکهٔ شش‌خانه و تکرار نام فروشگاه/مشتری حذف شد تا ارتفاع کم شود. */
async function wh38StoreDetails(id){
  const notices=captureEntityNotices('order',id);
  try{
    const d=await api('/api/orders/'+id); const o=d.order||{};
    if(o.orderType!=='STORE') return toast('این سفارش از نوع فروشگاهی نیست.');
    const items=activeItemsOf(o);
    const canAccept=o.status==='WAREHOUSE_PENDING';
    openModal('جزئیات سفارش فروشگاه',`<div class="whsin22-detail whd35-detail"><div class="whd35-head"><div class="whd35-title"><h2>${esc(o.storeName||'فروشگاه')}</h2><span>${o.storeOrderKind==='PARTIAL'&&o.storePurpose==='STOCK'?'تأمین تکمیلی فروشگاه':'مشتری: '+esc(o.customer?.name||'—')}</span></div>${badge(o.status)}</div><div class="whd35-meta"><span>شماره سفارش <b>${esc(fa(o.orderNo||'—'))}</b></span><span>ثبت <b>${esc(formatDateTime24(o.createdAt))}</b></span>${o.scheduledAt?`<span>زمان ارسال <b>${esc(formatDateTime24(o.scheduledAt))}</b></span>`:''}${o.dispatchPlace?`<span>محل ارسال <b>${esc(o.dispatchPlace)}</b></span>`:''}</div>${o.notes?`<div class="detail-note whd35-note"><span>${icon('info',14)}</span><div><b>یادداشت سفارش</b><p>${esc(o.notes)}</p></div></div>`:''}<div class="whd23-list whd35-list"><div class="whd23-row whd35-headrow" aria-hidden="true"><span></span><span>محصول</span><span>مقدار</span><span>واحد</span><span>توضیحات</span></div>${items.map((it,k)=>`<div class="whd23-row"><span class="whd23-num">${fa(String(k+1))}</span><div class="whd23-box whd23-product"><b title="${esc(it.product?.name||'—')}">${esc(it.product?.name||'—')}</b></div><div class="whd23-box"><b>${qty(it.requestedQty)}</b></div><div class="whd23-box"><b>${esc(it.requestedUnit||'')}</b></div><div class="whd23-box whd23-desc"><b title="${esc(it.description||'بدون توضیح')}">${esc(it.description||'بدون توضیح')}</b></div></div>`).join('')||'<div class="empty">قلمی در این سفارش ثبت نشده است.</div>'}</div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button>${canAccept?`<button type="button" class="btn btn-primary" data-action="wh38-accept-details" data-id="${o.id}">${icon('check',16)} تأیید دریافت و ورود به آماده‌سازی</button>`:''}</div></div>`);
    finishEntityNotices(notices);return true;
  }catch(e){toast(e.message);return false;}
}
async function wh38AcceptFromDetails(id,btn){
  const notices=captureEntityNotices('order',id);
  if(btn)btn.disabled=true;
  try{
    await api('/api/orders/'+id+'/warehouse/accept',{method:'POST'});
    finishEntityNotices(notices);
    closeModal();
    toast('سفارش تأیید شد و وارد مرحله آماده‌سازی شد.');
    await refreshIndicators();
    if(app.wh38.phase==='stores') wh38Paint('stores');
  }catch(e){ toast(e.message); if(btn)btn.disabled=false; }
}
// Informational only: this is not an operational service, a document, or a
// weight-entry form. The server recomputes the complete branch view on click.
function wh38StockPreviewLinks(orders){
 const branches=[...new Set(orders.filter(o=>o.orderType==='STORE'&&o.storeOrderKind==='PARTIAL'&&o.storePurpose==='STOCK'&&!o.customerId).map(o=>Number(o.branchNo)).filter(n=>Number.isInteger(n)&&n>=1&&n<=59))].sort((a,b)=>a-b);
 if(!branches.length)return '';
 return `<section class="sd-panel" aria-label="پیش‌نمایش فقط خواندنی درخواست‌ها"><h3>پیش‌نمایش درخواست‌های تکمیل فروشگاه</h3><p>فقط محاسبهٔ اطلاعات است؛ سفارش‌ها هنوز جداگانه پردازش می‌شوند و سند یا سرویس مشترک صادر نشده است.</p><div class="wh-stock-preview-links">${branches.map(branch=>`<button type="button" class="btn btn-secondary btn-sm" data-action="wh-stock-preview" data-branch="${branch}">پیش‌نمایش شعبه ${esc(fa(branch))}</button>`).join('')}</div></section>`;
}
function wh38StockPreviewHtml(preview){
 const lines=(preview.products||[]).map(line=>{
  const quantities=(line.amounts||[]).map(a=>`${esc(fa(String(a.quantity)))} ${esc(a.unit)}`).join('، ');
  const sources=(line.sources||[]).map(s=>`<li>سفارش ${esc(fa(s.orderNo||'—'))}: ${esc(fa(String(s.requestedQty)))} ${esc(s.requestedUnit||'')}${s.description?' — '+esc(s.description):''}</li>`).join('');
  return `<tr><td data-label="محصول">${esc(line.productName||'—')}</td><td data-label="درخواست">${quantities||'—'}</td><td data-label="وزن ثبت‌شده">${esc(fa(String(line.weightKg||0)))} کیلوگرم</td><td data-label="منشأ"><details><summary>درخواست‌های اصلی (${esc(fa((line.sources||[]).length))})</summary><ul>${sources}</ul></details></td></tr>`;
 }).join('');
 return `<section class="sd-panel wh-stock-preview" aria-label="پیش‌نمایش فقط خواندنی"><p><b>فقط پیش‌نمایش:</b> این محاسبه سرویس یا سند مشترک نیست و وزن‌کشی و تحویل را ثبت نمی‌کند. سفارش‌ها در گردش فعلی جداگانه پردازش می‌شوند.</p><p>شعبه ${esc(fa(preview.branchNo))} — ${esc(fa((preview.orderIds||[]).length))} سفارش تأییدشده و آمادهٔ انبار؛ سفارش‌های در انتظار تأیید یا زمان‌بندی‌شده در این نما نیستند.</p>${lines?`<div class="bt-table-wrap"><table class="bt-table"><thead><tr><th>محصول</th><th>درخواست به تفکیک واحد</th><th>وزن ثبت‌شدهٔ فعلی</th><th>منشأ درخواست</th></tr></thead><tbody>${lines}</tbody></table></div>`:'<p>در حال حاضر سفارش واجد شرایطی برای نمایش وجود ندارد.</p>'}<div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button></div></section>`;
}
async function wh38StockPreview(branch){
 const n=Number(branch);if(!Number.isInteger(n)||n<1||n>59)return toast('شماره شعبه معتبر نیست.');
 try{const data=await api('/api/store-stock-consolidation/branches/'+n+'/preview');if(data.readOnly!==true||!data.preview)throw new Error('پیش‌نمایش معتبر نیست.');openModal('پیش‌نمایش فقط خواندنی شعبه '+fa(n),wh38StockPreviewHtml(data.preview));}
 catch(e){toast(e.message||'پیش‌نمایش در دسترس نیست.');}
}
function wh38List(orders,kind){
 if(!orders.length)return sdEmpty(kind==='incoming'?'truck':'scale',kind==='incoming'?'سفارش ورودی جدیدی نیست':'سفارشی در مرحله آماده‌سازی نیست','');
 // v1.1.11 — فهرست‌های ورودی/آماده‌سازی انبار به جدول واحد bt-table منتقل شدند؛
 // عملیات هر ردیف فقط «جزئیات سفارش» است و «شروع آماده‌سازی»/«ثبت انصراف»
 // از داخل همان صفحهٔ جزئیات انجام می‌شود تا جدول تک‌دکمه‌ای و یکدست بماند.
 return wh38OrdersTable(orders,kind);
}
async function wh38Paint(phase){
  if(phase==='history') return; // سوابق با فیلترهای کاربر؛ نوسازی خودکار ۷ ثانیه‌ای فیلترها را به‌هم نمی‌زند
  const host=$('#wh38Body'); if(!host||host.dataset.sheet==='1'||host.querySelector('[data-return-order] input:checked'))return;
  try{
    if(phase==='delivered'){ await whDeliveredPaint(host); return; }
    if(phase==='document-edits'){ await whDocumentEditsPaint(host); return; }
    if(phase==='stores'){ // v37.9.0 — فروشگاه‌های انبار: سربرگ افقی، فرم/فهرست عمودی زیر آن
      const active=['incoming','preparing','history'].includes(app.wh38.storeTab)?app.wh38.storeTab:'incoming'; app.wh38.storeTab=active;
      if(active==='history'&&host.querySelector('[data-wh38-store-history]')) return; // v37.36.0 — فیلترهای سوابق با تازه‌سازی خودکار ۷ ثانیه‌ای به‌هم نمی‌ریزد
      const [inc,prep,histAll]=(await Promise.all([fetchPagedList('/api/orders?status=WAREHOUSE_PENDING','orders'),fetchPagedList('/api/orders?status=WAREHOUSE_PREPARING','orders'),api('/api/warehouse/history?from=2000-01-01&to='+today()+'&orderType=STORE')]));
      const incRows=((inc&&inc.orders)||[]).filter(o=>o.orderType==='STORE');
      // v37.19.0 — سفارشی که عملیات انبارش پایان یافته (finalizedAt) دیگر کار انباری ندارد و تا نهایی‌شدن محموله‌ها نزد فروش می‌ماند؛ در فهرست آماده‌سازی انبار نمی‌ماند.
      const prepRows=((prep&&prep.orders)||[]).filter(o=>o.orderType==='STORE'&&!(o.storeRunOps&&o.storeRunOps.finalizedAt));
      const counts={incoming:incRows.length,preparing:prepRows.length,history:(histAll&&histAll.summary&&histAll.summary.orders)||0};
      if(active==='history'){
        host.innerHTML=`<div class="wh38-store-pane">${wh38StoreTabs(active,counts)}<section class="wh38-store-panel" role="tabpanel" data-wh38-store-panel="history"><div data-wh38-store-history></div></section></div>`;
        renderWhStoreHistory();
        return;
      }
      const additions=[...incRows,...prepRows].filter(o=>(o.storeAdditionRequests||[]).some(r=>r.status==='PENDING_WAREHOUSE'));
      const additionPanel=additions.length?`<section class="sd-panel"><h3>کالاهای اضافه در انتظار تأیید انبار</h3>${additions.map(o=>{const r=o.storeAdditionRequests.find(x=>x.status==='PENDING_WAREHOUSE');return `<article data-store-addition-warehouse="${esc(o.id)}" data-request="${esc(r.id)}"><b>${esc(o.storeName||'فروشگاه')} — سفارش ${esc(fa(o.orderNo||'—'))}</b><ul>${r.items.map(i=>`<li>${esc(i.productName)} — ${qty(i.requestedQty)} ${esc(i.requestedUnit)} ${i.description?`· ${esc(i.description)}`:''}</li>`).join('')}</ul><button type="button" class="btn btn-primary btn-sm" data-action="store-addition-warehouse" data-id="${esc(o.id)}" data-request="${esc(r.id)}" data-decision="APPROVE">تأیید و افزودن به سفارش</button> <button type="button" class="btn btn-secondary btn-sm" data-action="store-addition-warehouse" data-id="${esc(o.id)}" data-request="${esc(r.id)}" data-decision="REJECT">رد درخواست</button></article>`;}).join('')}</section>`:'';
      const rows=active==='preparing'?prepRows:incRows;
      const empty=active==='preparing'
        ?'<div class="sd-empty"><div>'+icon('scale',26)+'</div><strong>سفارش فروشگاهی در حال آماده‌سازی نیست</strong><span>پس از تأیید دریافت، سفارش فروشگاه برای سرویس‌بندی و ثبت وزن اینجا قرار می‌گیرد.</span></div>'
        :'<div class="sd-empty"><div>'+icon('store',26)+'</div><strong>سفارش فروشگاهی ورودی نیست</strong><span>وقتی فروش سفارش فروشگاه را به انبار ارسال کند، در همین سربرگ نمایش داده می‌شود.</span></div>';
      host.innerHTML=`<div class="wh38-store-pane">${wh38StoreTabs(active,counts)}<section class="wh38-store-panel" role="tabpanel" data-wh38-store-panel="${active}">${additionPanel}${rows.length?wh38StoreList(rows,active):empty}</section></div>`;
      return;
    }
    const status=phase==='incoming'?'WAREHOUSE_PENDING':'WAREHOUSE_PREPARING';
    const orders=(((await fetchPagedList('/api/orders?status='+encodeURIComponent(status),'orders')).orders)||[]).filter(o=>o.orderType!=='STORE'); // v37.6.0 — سفارش‌های فروشگاه از تب‌های عادی انبار جدا شدند
    let waiting='';
    if(app.features?.pickupStaging&&phase==='incoming'){
      const active=(await fetchPagedList('/api/pickup/active','orders')).orders;
      const early=active.filter(o=>['SCHEDULED_REMOTE','RETURNED_TO_SALES'].includes(o.status)&&!o.cancellation);
      if(early.length)waiting=`<section class="sd-panel"><h3>مراجعهٔ سفارش‌های هنوز فعال‌نشده در انبار</h3><div class="bt-table-wrap"><table class="bt-table wh-early-pickup-table"><caption class="bt-caption">مراجعه‌های زودهنگام انبار</caption><thead><tr><th scope="col">شماره سفارش</th><th scope="col">صاحب سفارش</th><th scope="col">تحویل‌گیرنده</th><th scope="col">عملیات</th></tr></thead><tbody>${early.map(o=>`<tr><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="صاحب سفارش">${esc(o.customerName)}</td><td data-label="تحویل‌گیرنده">${esc(o.recipient?.name||'—')}</td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="pickup-cancel" data-id="${esc(o.id)}">ثبت انصراف بدون تحویل</button></td></tr>`).join('')}</tbody></table></div></section>`;
    }
    let returns='';
    if(phase==='incoming'){
      const requests=(await fetchPagedList('/api/warehouse/settlement-cancellations','orders')).orders;
      if(requests.length)returns=`<section class="sd-panel"><h3>انصراف از تسویه — بررسی بازگشت کالا</h3><p>برای هر قلم وزن‌دار بازگشت کامل و نداشتن کالا نزد مراجعه‌کننده را کنترل کنید.</p>${requests.map(o=>`<article class="sd-panel" data-return-order="${esc(o.id)}"><h4>سفارش ${esc(fa(o.orderNo||'—'))} — ${esc(o.customerName||'—')}</h4><p>سند انبار: ${esc(fa(o.warehouseDocumentNo||'—'))} · دلیل: ${esc(o.reason)}</p>${o.items.filter(i=>Number(i.deliveredKg)>0).map(i=>`<label><input type="checkbox" data-return-item="${esc(i.itemId)}"> بازگشت کامل ${esc(i.productName)} — ${qty(i.deliveredKg)} کیلوگرم</label><br>`).join('')}<label><input type="checkbox" data-return-no-goods> تأیید می‌کنم مراجعه‌کننده هیچ کالایی همراه ندارد.</label><br><button type="button" class="btn btn-primary" data-action="confirm-settlement-return" data-id="${esc(o.id)}">تأیید بازگشت و لغو سفارش</button></article>`).join('')}</section>`;
    }
    host.innerHTML=returns+waiting+wh38List(orders,phase);
  }
  catch{ host.innerHTML='<div class="empty">خطا در دریافت صف انبار.</div>'; }
}
// Completed regular warehouse orders: this is a read-only warehouse document,
// The printed acknowledgement requires the customer's handwritten signature;
// producing it alone does not record or verify a signature.
app.whDelivered=app.whDelivered||{q:'',offset:0,seq:0};
async function whDeliveredPaint(host){
  if(!host.querySelector('[data-wh-delivered]')){
    host.innerHTML=`<section class="wh-delivered" data-wh-delivered><div class="wh-delivered-heading"><div><h2>تحویل شده</h2><p>اسناد نهایی مشتریان عادی پس از ثبت وزن انبار؛ سفارش‌های فروشگاه در بخش فروشگاه‌ها هستند. اصلاح وزن/محصول فقط از درخواست فروش انجام می‌شود.</p></div></div><section class="wh-document-edit-queue" aria-label="درخواست‌های اصلاح سند انبار"><div class="wh-document-edit-queue-head"><div><b>درخواست‌های اصلاح رسیده از فروش</b><small>این اسناد تا پایان اصلاح از فهرست نهایی جدا می‌شوند.</small></div><span data-wh-edit-count>۰</span></div><div id="whDocumentEditQueue" aria-live="polite">در حال دریافت درخواست‌ها…</div></section><form class="wh-delivered-search"><label for="whDeliveredQ">جستجوی سند، سفارش، مشتری یا کالا</label><div><input id="whDeliveredQ" type="search" maxlength="80" value="${esc(app.whDelivered.q)}" placeholder="شماره سند یا سفارش، نام یا شماره تماس"><button class="btn btn-secondary" type="submit">جستجو</button></div></form><div id="whDeliveredRows" aria-live="polite">در حال دریافت سفارش‌ها…</div></section>`;
    host.querySelector('form').addEventListener('submit',e=>{e.preventDefault();app.whDelivered.q=host.querySelector('#whDeliveredQ').value.trim();app.whDelivered.offset=0;whDeliveredLoad();});
  }
  await whDeliveredLoad();
}
function whDeliveredRow(o){
 const handover=o.deliveryMode==='DELIVERY'?(o.handedOverToDriver?'تحویل به راننده ثبت شد':(o.driverName?'در انتظار تحویل به راننده':'در انتظار تعیین راننده')):'وزن نهایی ثبت شد';
 return `<tr class="wh-delivered-row" data-order="${esc(o.id)}"><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="شماره سند">${esc(fa(o.warehouseDocumentNo||'—'))}</td><td data-label="نام مشتری">${esc(o.customerName||'—')}</td><td data-label="تاریخ سفارش">${esc(btDate(o.createdAt))}</td><td data-label="وضعیت"><span class="badge blue">${handover}</span></td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="wh-delivered-details" data-id="${esc(o.id)}" ${o.deliveryMode==='DELIVERY'&&!o.driverName?'disabled title="پس از تعیین راننده قابل چاپ است"':''}>${icon('eye',14)} جزئیات و چاپ</button></td></tr>`;
}
function whDeliveredTable(rows){
 if(!rows.length)return '';
 return `<div class="bt-table-wrap"><table class="bt-table wh-delivered-table"><caption class="bt-caption">اسناد نهایی مشتریان</caption><thead><tr><th scope="col">شماره سفارش</th><th scope="col">شماره سند</th><th scope="col">نام مشتری</th><th scope="col">تاریخ سفارش</th><th scope="col">وضعیت</th><th scope="col">عملیات</th></tr></thead><tbody>${rows.map(whDeliveredRow).join('')}</tbody></table></div>`;
}

function whDocumentEditExpired(request){const explicit=Date.parse(request.expiresAt||'');if(Number.isFinite(explicit))return serverEpoch()>explicit;const base=Date.parse(request.baseAt||'');return !Number.isFinite(base)||serverEpoch()>base+72*60*60*1000;}
function whDocumentEditQueueRow(request){
 const managerOnly=whDocumentEditExpired(request)&&normalizeRole(app.user?.roleCode)!=='admin';
 const number=request.warehouseDocumentNo||request.invoiceNumber||'—',run=request.run?` · سرویس ${request.run===2?'دوم':'اول'}`:'';
 return `<tr data-order="${esc(request.orderId)}"><td data-label="مشتری">${esc(request.customerName||'—')}</td><td data-label="شماره سفارش">${esc(fa(request.orderNo||'—'))}</td><td data-label="سند و سرویس">سند ${esc(fa(number))}${run}</td><td data-label="زمان درخواست و مهلت">ارجاع ${esc(formatDateTime24(request.requestedAt))}${request.expiresAt?`<br>مهلت ${esc(formatDateTime24(request.expiresAt))}`:''}</td><td data-label="علت">${esc(request.reason||'اصلاح وزن یا محصول')}${managerOnly?'<br><em>مهلت گذشته؛ فقط مدیر مجاز به اصلاح است</em>':''}</td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-primary btn-sm" data-action="warehouse-document-edit" data-id="${esc(request.orderId)}" data-payment-id="${esc(request.paymentId)}" ${managerOnly?'disabled title="پس از ۷۲ ساعت فقط مدیر سیستم می‌تواند اصلاح کند"':''}>${icon('scale',14)} ${managerOnly?'فقط مدیر':'اصلاح سند'}</button></td></tr>`;
}
function whDocumentEditQueueTable(rows){
 if(!rows.length)return '';
 return `<div class="bt-table-wrap"><table class="bt-table wh-document-edit-table"><caption class="bt-caption">درخواست‌های اصلاح سند انبار</caption><thead><tr><th scope="col">مشتری</th><th scope="col">شماره سفارش</th><th scope="col">سند و سرویس</th><th scope="col">زمان درخواست و مهلت</th><th scope="col">علت</th><th scope="col">عملیات</th></tr></thead><tbody>${rows.map(whDocumentEditQueueRow).join('')}</tbody></table></div>`;
}

app.whDocumentEdits=app.whDocumentEdits||{seq:0};
async function whDocumentEditsPaint(host){
 if(!host)return;
 if(!host.querySelector('[data-wh-document-edits]'))host.innerHTML=`<section class="wh-delivered" data-wh-document-edits><div class="wh-delivered-heading"><div><h2>درخواست‌های اصلاح سند</h2><p>فقط اسنادی که از مسیر فروش ارجاع شده‌اند در اینجا اصلاح می‌شوند؛ پس از ثبت، سابقهٔ ممیزی حفظ و سند برای بازبینی فروش بازمی‌گردد.</p></div><button type="button" class="btn btn-secondary btn-sm" data-wh-document-edits-refresh>به‌روزرسانی</button></div><section class="wh-document-edit-queue" aria-label="صف کنترل‌شدهٔ اصلاح اسناد"><div class="wh-document-edit-queue-head"><div><b>صف ارجاع فروش به انبار</b><small>مهلت ۷۲ ساعته؛ پس از آن فقط مدیر سیستم مجاز است.</small></div><span data-wh-edit-count>۰</span></div><div data-wh-document-edit-rows aria-live="polite">در حال دریافت درخواست‌ها…</div></section></section>`;
 const seq=++app.whDocumentEdits.seq;
 try{
  const {requests=[]}=await api('/api/warehouse/document-edits');
  if(seq!==app.whDocumentEdits.seq||app.page!=='warehouse'||app.wh38.phase!=='document-edits')return;
  const count=host.querySelector('[data-wh-edit-count]'),rows=host.querySelector('[data-wh-document-edit-rows]');
  if(count)count.textContent=qty(requests.length);
  if(rows)rows.innerHTML=whDocumentEditQueueTable(requests)||'<div class="empty">درخواست اصلاحی از فروش در صف نیست.</div>';
 }catch(error){
  if(seq!==app.whDocumentEdits.seq)return;
  const rows=host.querySelector('[data-wh-document-edit-rows]');if(rows)rows.innerHTML=`<div class="empty">خطا در دریافت صف اصلاح سند: ${esc(error.message)}</div>`;
 }
}
async function whDeliveredLoad(){
  const st=app.whDelivered,seq=++st.seq;
  try{
    const [docsResult,queueResult]=await Promise.allSettled([api('/api/warehouse/delivered?'+new URLSearchParams({q:st.q,offset:String(st.offset)})),api('/api/warehouse/document-edits')]);
    if(seq!==st.seq||app.wh38.phase!=='delivered')return;
    const queue=$('#whDocumentEditQueue'),count=$('[data-wh-edit-count]');
    if(queueResult.status==='fulfilled'){
      const requests=(queueResult.value.requests||[]).filter(row=>row.orderType!=='STORE');if(count)count.textContent=qty(requests.length);
      if(queue)queue.innerHTML=whDocumentEditQueueTable(requests)||'<div class="empty">درخواست اصلاحی در صف نیست.</div>';
    }else if(queue)queue.innerHTML=`<div class="empty">خطا در دریافت درخواست‌ها: ${esc(queueResult.reason?.message||'خطای نامشخص')}</div>`;
    if(docsResult.status==='rejected')throw docsResult.reason;
    const d=docsResult.value;
    if(d.offset>=d.total&&d.offset>0){st.offset=Math.max(0,Math.ceil(d.total/d.limit-1)*d.limit);return whDeliveredLoad();}
    const host=$('#whDeliveredRows');if(!host)return;
    host.innerHTML=`${whDeliveredTable(d.orders)||'<div class="empty">سفارش وزن‌نهایی‌شده‌ای یافت نشد.</div>'}<div class="wh-delivered-pages"><button type="button" class="btn btn-secondary btn-sm" data-action="wh-delivered-prev" ${d.offset===0?'disabled':''}>قبلی</button><span>${qty(d.total)} سفارش${d.total?` • ${qty(d.offset+1)} تا ${qty(Math.min(d.offset+d.limit,d.total))}`:''}</span><button type="button" class="btn btn-secondary btn-sm" data-action="wh-delivered-next" ${d.offset+d.limit>=d.total?'disabled':''}>بعدی</button></div>`;
  }catch(e){const host=$('#whDeliveredRows');if(host&&seq===st.seq)host.innerHTML=`<div class="empty">خطا در دریافت سفارش‌ها: ${esc(e.message)}</div>`;}
}
// The interactive document keeps every recorded weighing separate; print omits them entirely.
function whDocumentTares(line){
 const types=[['basket18','سبد ۱٫۸ کیلوگرمی',true],['basket25','سبد ۲٫۵ کیلوگرمی',true],['box300','کارتن ۳۰۰ گرمی',true],['box600','کارتن ۶۰۰ گرمی',true],['rackKg','راک',false],['cartKg','گاری',false]];
 const rows=Array.isArray(line.weighings)?line.weighings:[];
 const batches=rows.map((row,index)=>{
  const chips=types.map(([key,label,count])=>{const amount=Number(row[key]);return Number.isFinite(amount)&&amount>0?`<span class="whd-tare-chip"><span>${label}</span><b>${qty(amount)} ${count?'عدد':'کیلوگرم'}</b></span>`:'';}).join('');
  const weight=key=>row[key]==null||!Number.isFinite(Number(row[key]))?'نامشخص':qty(row[key]);
  return `<div class="whd-tare-batch"><b>نوبت ${fa(index+1)}</b><span>ناخالص ${weight('grossKg')} کیلوگرم · کسر ${weight('tareKg')} کیلوگرم · خالص ${weight('netKg')} کیلوگرم</span><div class="whd-tare-list">${chips||'<span class="whd-tare-empty">بدون ناخالصی</span>'}</div></div>`;
 }).join('');
 const incomplete=line.missingWeighings?'<span class="whd-tare-unknown">بخشی از جزئیات ثبت نشده</span>':(!Array.isArray(line.weighings)?'<span class="whd-tare-unknown">جزئیات ثبت نشده</span>':'');
 return batches||incomplete?batches+incomplete:'<span class="whd-tare-empty">—</span>';
}
function whDocumentProducts(lines,print=false){
 // اقلام ناموجود انبار در سند انبار نمی‌آیند (نه در چاپ و نه در فهرست اسناد).
 lines=(Array.isArray(lines)?lines:[]).filter(line=>!line||!line.outOfStock);
 let grams=0,unknown=!lines.length;
 const rows=lines.map((line,index)=>{
  const available=!line.outOfStock, n=line.deliveredKg==null?NaN:Number(line.deliveredKg);
  if(available){if(Number.isFinite(n)&&n>=0)grams+=Math.round(n*1000);else unknown=true;}
  return `<tr><td class="whd-number">${fa(index+1)}</td><td class="whd-product"><b>${esc(line.productName||'—')}</b></td>${print?'':`<td class="whd-tare-cell"><div class="whd-tare-scroll">${available?whDocumentTares(line):'<span class="whd-tare-empty">—</span>'}</div></td>`}<td class="whd-quantity whd-net">${available?(Number.isFinite(n)&&n>=0?qty(n):'نامشخص'):'ناموجود'}</td></tr>`;
 }).join('')||`<tr><td colspan="${print?3:4}">جزئیات اقلام در سابقه موجود نیست.</td></tr>`;
 return `<div class="whd-table-scroll"><table class="whd-products${print?' whd-print-products':''}"><colgroup><col class="whd-col-number"><col class="whd-col-product">${print?'':'<col class="whd-col-tares">'}<col class="whd-col-weight"></colgroup><thead><tr><th>ردیف</th><th>محصول</th>${print?'':'<th>ناخالصی‌های کسرشده</th>'}<th>جمع خالص (کیلوگرم)</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="${print?2:3}" class="whd-total-label">جمع کل خالص</td><td><div class="whd-total"><strong>${unknown?'نامشخص':qty(grams/1000)+' کیلوگرم'}</strong></div></td></tr></tfoot></table></div>`;
}
function whDeliveredDocument(o,print=false){
  const customerRaw=o.customerName||'—',customer=esc(customerRaw),phone=esc(fa(o.customerPhone||'—'));
  const driver=o.deliveryMode==='DELIVERY'?esc(o.driverName||'—'):'';
  const pickupRecipient=o.deliveryMode==='PICKUP'?(o.recipient?.name?o.recipient:(o.pickupRecipient?.name?o.pickupRecipient:null)):null;
  const sameOwner=pickupRecipient?.name?.trim()===customerRaw.trim()&&String(pickupRecipient?.phone||'').trim()===String(o.customerPhone||'').trim();
  const deliveryReceiver=o.deliveryMode==='DELIVERY'&&o.driverName?{name:o.driverName,phone:o.driverPhone,vehicleType:o.vehicleType,plate:o.vehiclePlate}:null;
  const documentReceiver=pickupRecipient||deliveryReceiver||{name:customerRaw,phone:o.customerPhone,vehicleType:'',carType:'',plate:''};
  const customerPhoneRaw=String(o.customerPhone||'').trim();
  const receiverNameRaw=String(documentReceiver.name||customerRaw),receiverPhoneRaw=String(documentReceiver.phone||customerPhoneRaw||'').trim();
  const receiverName=esc(receiverNameRaw),receiverPhone=esc(fa(receiverPhoneRaw||'—'));
  const vehicleNameRaw=String(documentReceiver.carType||documentReceiver.vehicleType||'—'),vehicleName=esc(vehicleNameRaw);
  const receiverPlateRaw=String(documentReceiver.plate||'—'),receiverPlate=esc(fa(receiverPlateRaw));
  const deliveryAtRaw=formatDateTime24(o.handedOverAt||o.completedAt||o.warehouseCompletedAt||'')||'—',deliveryAt=esc(deliveryAtRaw);
  const receiverIsCustomer=receiverNameRaw.trim()===String(customerRaw).trim()&&(!receiverPhoneRaw||receiverPhoneRaw===customerPhoneRaw);
  const receiverSummary=receiverIsCustomer?'همان مشتری':receiverName,receiverContact=receiverIsCustomer?(customerPhoneRaw?'مشتری':'—'):receiverPhone,receiverContactRaw=receiverIsCustomer?(customerPhoneRaw?'مشتری':'—'):receiverPhoneRaw||'—';
  const documentNumberRaw=String(o.warehouseDocumentNo||'—'),orderNumberRaw=String(o.orderNo||'—');
  const documentNumber=esc(fa(documentNumberRaw)),orderNumber=esc(fa(orderNumberRaw));
  const remoteGroups=[
    {name:'customer',fields:[['مشتری',customer,customerRaw,''],['تماس',phone,customerPhoneRaw||'—','ltr']]},
    {name:'recipient',fields:[['گیرنده',receiverSummary,receiverIsCustomer?'همان مشتری':receiverNameRaw,''],['تماس',receiverContact,receiverContactRaw,receiverIsCustomer?'':'ltr']]},
    {name:'vehicle',fields:[['خودرو',vehicleName,vehicleNameRaw,''],['پلاک',receiverPlate,receiverPlateRaw,'ltr']]},
    {name:'order',fields:[['سند',documentNumber,documentNumberRaw,'ltr'],['سفارش',orderNumber,orderNumberRaw,'ltr']]},
    {name:'time',fields:[['تحویل',deliveryAt,deliveryAtRaw,'']]},
  ];
  const remoteWeight=group=>group.fields.reduce((sum,[label,,value])=>sum+String(label).length+String(value||'—').length+3,0);
  const remoteHeaderChars=remoteGroups.reduce((sum,group)=>sum+remoteWeight(group),0);
  // سربرگ سند انبار: اندازهٔ متن با فضای کادر تراز می‌شود؛ کف و سقف بزرگ‌تر شد تا
  // برچسب‌ها در کادرهای کوتاه ریز و ناخوانا نمانند (قبلاً حداکثر ۸px بود).
  const remoteFontSize=Math.max(7.5,Math.min(9.5,9.5-Math.max(0,remoteHeaderChars-150)*0.014));
  const remoteStyle=`--whd-remote-font:${remoteFontSize.toFixed(1)}px;--whd-remote-columns:${remoteGroups.map(group=>`minmax(0,${remoteWeight(group)}fr)`).join(' ')};`;
  const compactPair=([label,value,,dir])=>`<span class="whd-remote-pair"><span class="whd-remote-label">${label}:</span><b${dir?' dir="ltr"':''} title="${value}">${value}</b></span>`;
  const remoteHeader=`<div class="whd-head whd-remote-head"><div class="whd-remote-meta" style="${remoteStyle}" aria-label="اطلاعات سفارش و تحویل">
    ${remoteGroups.map(group=>`<span class="whd-remote-group whd-remote-${group.name}">${group.fields.map(compactPair).join('')}</span>`).join('')}
  </div></div>`;
  const legacyHeader=`<div class="whd-head"><div class="whd-document-number"><span>شماره سند انبار</span><b dir="ltr">${esc(fa(o.warehouseDocumentNo||'—'))}</b></div><div class="whd-meta"><span><span class="whd-label">نام مشتری:</span><b>${customer}</b></span><span><span class="whd-label">شماره تماس:</span><b dir="ltr">${phone}</b></span><span><span class="whd-label">شماره سفارش:</span><b dir="ltr">${esc(fa(o.orderNo||'—'))}</b></span><span><span class="whd-label">تاریخ ثبت سفارش:</span><b>${esc(formatDateTime24(o.createdAt))}</b></span></div></div>`;
  const header=o.orderType==='REMOTE'?remoteHeader:legacyHeader;
  return `<div class="whd-doc">${header}${whDocumentProducts(o.items,print)}<section class="whd-acknowledgement">${driver?`<p class="whd-declaration">اینجانب <strong style="text-decoration:underline;text-underline-offset:3px">${driver}</strong> اقلام فوق را صحیح و سالم از انبار برای حمل و تحویل به مشتری <strong style="text-decoration:underline;text-underline-offset:3px">${customer}</strong> دریافت نمودم.</p><div class="whd-signature"><span>نام و امضاء راننده پخش هنگام دریافت از انبار</span><b>${driver} – ${esc(fa(o.driverPhone||'—'))}</b></div>`:`<p class="whd-declaration">اینجانب <strong style="text-decoration:underline;text-underline-offset:3px">${receiverName}</strong> ${pickupRecipient&&!sameOwner?`به عنوان تحویل‌گیرنده سفارش مشتری <strong style="text-decoration:underline;text-underline-offset:3px">${customer}</strong> `:''}اقلام فوق را صحیح و سالم تحویل گرفته و اقلام تحویلی به صورت امانت تا زمان پرداخت مبلغی ریالی آن نزد اینجانب می‌باشد.</p><div class="whd-signature"><span>${pickupRecipient?'امضاء تحویل‌گیرنده':'نام و امضاء مشتری'}</span><b>${receiverName} – ${receiverPhone}</b></div>`}</section></div>`;
}
function whCanRegisterHandover(){return app.page==='warehouse' && ['warehouse','admin'].includes(normalizeRole(app.user?.roleCode));}
async function whDeliveredDetails(id){
  const notices=captureEntityNotices('order',id);
  try{
    const {order}=await api('/api/warehouse/delivered/'+encodeURIComponent(id));
    openModal('جزئیات سند انبار',whDeliveredDocument(order)+`<div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button><button type="button" class="btn btn-primary" data-wh-delivered-print>${icon('receipt',16)} چاپ سند انبار</button>${order.handoverToken&&whCanRegisterHandover()?'<button type="button" class="btn btn-primary" data-wh-handover>ثبت تحویل و چاپ سند</button>':''}</div>`);
    $('#modal [data-wh-delivered-print]').addEventListener('click',()=>whDeliveredPrint(id));
    $('#modal [data-wh-handover]')?.addEventListener('click',e=>whTransportHandover(e.currentTarget,id,0,order.handoverToken));
    BTPrintDigits.convert(document.querySelector('#modal .whd-doc'));
    finishEntityNotices(notices);return true;
  }catch(e){toast(e.message);return false;}
}
async function whTransportHandover(button,id,run,token){
  if(!confirm('آیا کالا را واقعاً به راننده تحویل داده‌اید؟ پس از ثبت، سند برای چاپ باز می‌شود؛ امضای دستی راننده را روی نسخه چاپی بگیرید. این ثبت، تحویل به مشتری یا تسویه نیست.'))return;
  button.disabled=true;
  let result;
  try{result=await api('/api/warehouse/transport-handovers/'+encodeURIComponent(id),{method:'POST',body:JSON.stringify({run,handoverToken:token,physicalHandoverConfirmed:true})});}
  catch(e){button.disabled=false;toast(e.message);return;}
  closeModal();
  toast('تحویل فیزیکی ثبت شد. سند را چاپ و امضای دستی راننده را دریافت کنید.');
  try{whPrintDocument(result.handover.document,run);}catch(e){toast('تحویل ثبت شد اما چاپ باز نشد؛ از جزئیات سند دوباره چاپ کنید.');}
  if(run)void loadWhStoreDocuments();else void whDeliveredLoad();
}
function whPrintDocument(doc,run){
  const body=run?whStoreDocument(doc,true):whDeliveredDocument(doc,true);
  const started=BTPrintFrame.html(BTPrintDigits.documentHtml(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="/warehouse-document.css?v=37.50.0"><title>سند انبار ${esc(fa(doc.warehouseDocumentNo||'—'))}</title><style>body{margin:0;padding:0;font-family:"Vazirmatn",Tahoma,sans-serif}@page{size:A4;margin:12mm}</style></head><body>${body}<script src="/print-ready.js"><\/script></body></html>`));
  if(!started)throw new Error('چاپ قبلی هنوز در حال آماده‌سازی است؛ سند را از جزئیات دوباره چاپ کنید.');
}
async function whDeliveredPrint(id){
  try{const {order}=await api('/api/warehouse/delivered/'+encodeURIComponent(id));whPrintDocument(order,0);}catch(e){toast(e.message);}
}
/* سوابق فروشگاه‌ها: فهرست اسناد سفارش‌هایی که برای انبار ثبت شده‌اند؛ بدون گزارش پایین و فیلترهای بازه‌ای. */
function renderWhStoreHistory(){
  const host=document.querySelector('[data-wh38-store-history]'); if(!host) return;
  host.innerHTML='<div data-wh-store-documents></div>';
  renderWhStoreDocuments();
}
// Individual store-service handover documents remain available even while the
// order is still being prepared or after it leaves the preparation list.
app.whStoreDocs=app.whStoreDocs||{q:'',offset:0,seq:0};
function renderWhStoreDocuments(){
  const host=document.querySelector('[data-wh-store-documents]');if(!host)return;
  const st=app.whStoreDocs;
  host.innerHTML=`<section class="wh-delivered wh-store-documents"><div class="wh-delivered-heading"><div><h2>سوابق سفارش‌های ثبت‌شدهٔ فروشگاه‌ها</h2><p>فقط سرویس‌هایی که برای انبار ثبت شده‌اند نمایش داده می‌شوند؛ جزئیات هر سفارش شامل محصول و ناخالصی‌هاست.</p></div><button type="button" class="btn btn-secondary btn-sm" data-store-doc-action="refresh">به‌روزرسانی</button></div><section class="wh-document-edit-queue wh-document-edit-queue-store" aria-label="درخواست‌های اصلاح سند فروشگاه"><div class="wh-document-edit-queue-head"><div><b>درخواست‌های اصلاح سرویس فروشگاه</b><small>سند تا پایان اصلاح از فهرست چاپ جدا می‌شود.</small></div><span data-wh-store-edit-count>۰</span></div><div data-wh-store-edit-rows aria-live="polite">در حال دریافت درخواست‌ها…</div></section><form class="wh-delivered-search"><label for="whStoreDocsQ">جستجوی سند، سفارش، فروشگاه، راننده یا کالا</label><div><input id="whStoreDocsQ" type="search" maxlength="80" value="${esc(st.q)}"><button class="btn btn-secondary" type="submit">جستجو</button></div></form><div data-wh-store-doc-rows aria-live="polite">در حال دریافت اسناد…</div></section>`;
  host.querySelector('form').addEventListener('submit',e=>{e.preventDefault();st.q=host.querySelector('#whStoreDocsQ').value.trim();st.offset=0;loadWhStoreDocuments();});
  host.addEventListener('click',e=>{const btn=e.target.closest('[data-store-doc-action]');if(!btn)return;e.stopPropagation();if(btn.dataset.storeDocAction==='refresh'){loadWhStoreDocuments();}else if(btn.dataset.storeDocAction==='prev'){st.offset=Math.max(0,st.offset-50);loadWhStoreDocuments();}else if(btn.dataset.storeDocAction==='next'){st.offset+=50;loadWhStoreDocuments();}else if(btn.dataset.storeDocAction==='details'){whStoreDocumentDetails(btn.dataset.id,Number(btn.dataset.run));}});
  loadWhStoreDocuments();
}
function whStoreDocumentRow(x){
 const driver=x.driverName?'تحویل‌گیرنده: '+esc(x.driverName):(x.driverStatus==='PENDING'?'در انتظار تعیین راننده':'نام راننده در سوابق موجود نیست');
 const status=typeof x.handedOverToDriver==='boolean'?(x.handedOverToDriver?'تحویل به راننده ثبت شد':'در انتظار تحویل به راننده'):(x.driverName?'راننده تعیین شده':'در انتظار راننده');
 return `<tr class="wh-delivered-row" data-order="${esc(x.orderId)}"><td data-label="فروشگاه">${esc(x.storeName||'—')}</td><td data-label="شماره سفارش">${esc(fa(x.orderNo||'—'))}</td><td data-label="تاریخ سفارش">${esc(formatDateTime24(x.createdAt))}</td><td data-label="وضعیت"><span class="badge blue">${status}</span></td><td data-label="اقلام">${qty(x.itemCount)} قلم</td><td data-label="شماره سند">${esc(fa(x.warehouseDocumentNo||'—'))}</td><td data-label="سرویس">${x.storeOrderKind==='PARTIAL'?'سفارش جزئی':`سرویس ${x.run===2?'دوم':'اول'}`}</td><td data-label="راننده">${driver}</td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-secondary btn-sm" data-store-doc-action="details" data-id="${esc(x.orderId)}" data-run="${x.run}" ${x.driverName?'':(x.driverStatus==='PENDING'?'disabled title="پس از تعیین راننده قابل چاپ است"':'disabled title="نام راننده در سوابق موجود نیست"')}>${icon('eye',14)} جزئیات</button></td></tr>`;
}
function whStoreDocumentTable(rows){
 if(!rows.length)return '';
 return `<div class="bt-table-wrap"><table class="bt-table wh-store-document-table"><caption class="bt-caption">اسناد سرویس فروشگاه</caption><thead><tr><th scope="col">فروشگاه</th><th scope="col">شماره سفارش</th><th scope="col">تاریخ سفارش</th><th scope="col">وضعیت</th><th scope="col">اقلام</th><th scope="col">شماره سند</th><th scope="col">سرویس</th><th scope="col">راننده</th><th scope="col">عملیات</th></tr></thead><tbody>${rows.map(whStoreDocumentRow).join('')}</tbody></table></div>`;
}

async function loadWhStoreDocuments(){
  const st=app.whStoreDocs,seq=++st.seq;
  try{
    const params=new URLSearchParams({q:st.q,offset:String(st.offset)}),[docsResult,queueResult]=await Promise.allSettled([api('/api/warehouse/store-documents?'+params),api('/api/warehouse/document-edits')]);
    if(seq!==st.seq)return;
    const queue=document.querySelector('[data-wh-store-edit-rows]'),count=document.querySelector('[data-wh-store-edit-count]');
    if(queueResult.status==='fulfilled'){
      const requests=(queueResult.value.requests||[]).filter(row=>row.orderType==='STORE');if(count)count.textContent=qty(requests.length);
      if(queue)queue.innerHTML=whDocumentEditQueueTable(requests)||'<div class="empty">درخواست اصلاح سرویس فروشگاه در صف نیست.</div>';
    }else if(queue)queue.innerHTML=`<div class="empty">خطا در دریافت درخواست‌های اصلاح: ${esc(queueResult.reason?.message||'خطای نامشخص')}</div>`;
    if(docsResult.status==='rejected')throw docsResult.reason;
    const d=docsResult.value;
    if(d.offset>=d.total&&d.offset>0){st.offset=Math.max(0,Math.ceil(d.total/d.limit-1)*d.limit);return loadWhStoreDocuments();}
    const host=document.querySelector('[data-wh-store-doc-rows]');if(!host)return;
    host.innerHTML=`${whStoreDocumentTable(d.documents)||'<div class="empty">سند سرویس فروشگاهی یافت نشد.</div>'}<div class="wh-delivered-pages"><button type="button" class="btn btn-secondary btn-sm" data-store-doc-action="prev" ${d.offset===0?'disabled':''}>قبلی</button><span>${qty(d.total)} سند${d.total?` • ${qty(d.offset+1)} تا ${qty(Math.min(d.offset+d.limit,d.total))}`:''}</span><button type="button" class="btn btn-secondary btn-sm" data-store-doc-action="next" ${d.offset+d.limit>=d.total?'disabled':''}>بعدی</button></div>`;
  }catch(e){const host=document.querySelector('[data-wh-store-doc-rows]');if(host&&seq===st.seq)host.innerHTML=`<div class="empty">خطا در دریافت اسناد: ${esc(e.message)}</div>`;}
}
function whStoreDocument(o,print=false){
  const fullShopName=String(o.storeName||'—').trim()||'—';
  const shop=esc(fullShopName),shopHeader=esc(fullShopName),driver=esc(o.driverName||'—'),run=o.run===2?'دوم':'اول';
  return `<div class="whd-doc whd-store-doc${print?' whd-store-print':''}"><div class="whd-head"><div class="whd-meta whd-store-meta"><span class="whd-store-identity">${print?'':'<span class="whd-label">نام فروشگاه:</span>'}<b>${shopHeader}</b></span><span><span class="whd-label">تحویل‌گیرنده:</span><b>${driver}</b></span><span><span class="whd-label">تاریخ ثبت سفارش:</span><b>${esc(formatDateTime24(o.createdAt))}</b></span><span><span class="whd-label">شماره سفارش:</span><b dir="ltr">${esc(fa(o.orderNo))}</b></span><span class="whd-document-number"><span>شماره سند انبار</span><b dir="ltr">${esc(fa(o.warehouseDocumentNo||'—'))}</b></span><span><span class="whd-label">نوع سفارش:</span><b>${o.storeOrderKind==='PARTIAL'?`جزئی${o.customerName?' — نام مشتری: '+esc(o.customerName):''}`:`روزانه — سرویس: ${run}`}</b></span></div></div>${whDocumentProducts(print&&o.storeOrderKind==='PARTIAL'?groupStorePrintLines(o.lines):o.lines,print)}${!print&&o.storeOrderKind==='PARTIAL'?storeRequestRowsHtml(o.requestRows||(o.lines||[]).map(l=>({...l,source:'ORIGINAL'}))):''}<section class="whd-acknowledgement"><p class="whd-declaration">اینجانب <strong style="text-decoration:underline;text-underline-offset:3px">${driver}</strong> اقلام فوق را صحیح و سالم از انبار جهت حمل و تحویل به ${shop} دریافت نمودم.</p><div class="whd-signature"><span>امضاء تحویل‌گیرنده</span><b>${driver}</b></div></section></div>`;
}
async function whStoreDocumentDetails(id,run){
  try{const {document:doc}=await api('/api/warehouse/store-documents/'+encodeURIComponent(id)+'/'+run);openModal(doc.storeOrderKind==='PARTIAL'?'سند انبار سفارش جزئی':'سند انبار سرویس '+(run===2?'دوم':'اول'),whStoreDocument(doc)+`<div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button><button type="button" class="btn btn-primary" data-wh-store-print>${icon('receipt',16)} چاپ سند انبار</button>${doc.handoverToken&&whCanRegisterHandover()?'<button type="button" class="btn btn-primary" data-wh-handover>ثبت تحویل و چاپ سند</button>':''}</div>`);$('#modal [data-wh-store-print]').addEventListener('click',()=>whStoreDocumentPrint(id,run));$('#modal [data-wh-handover]')?.addEventListener('click',e=>whTransportHandover(e.currentTarget,id,run,doc.handoverToken));}catch(e){toast(e.message);}
}
async function whStoreDocumentPrint(id,run){
  try{const {document:doc}=await api('/api/warehouse/store-documents/'+encodeURIComponent(id)+'/'+run);whPrintDocument(doc,run);}catch(e){toast(e.message);}
}
function wh38Shell(phase){
  const c=$('#content'); if(!c)return;
  app.wh38.phase=phase;
  // The delivery rail entry groups preparation and completed deliveries without removing either workflow.
  const deliveryTabs=['preparing','delivered'].includes(phase)?`<nav class="cartable-section-tabs" aria-label="بخش‌های تحویل">${[['preparing','تحویل و آماده‌سازی'],['delivered','تحویل‌شده']].map(([key,label])=>`<button type="button" data-wh38-tab="${key}" class="${phase===key?'active':''}" aria-current="${phase===key?'page':'false'}">${label}</button>`).join('')}</nav>`:'';
  c.innerHTML=`<section class="wh38-shell">${deliveryTabs}<div id="wh38Body"></div></section>`;
  c.onclick=async e=>{
    const st=e.target.closest('[data-wh38-store-tab]');
    if(st){ app.wh38.storeTab=['incoming','preparing','history'].includes(st.dataset.wh38StoreTab)?st.dataset.wh38StoreTab:'incoming'; wh38Paint('stores'); return; }
    const t=e.target.closest('[data-wh38-tab]');
    if(t){ app.wh38.phase=t.dataset.wh38Tab; app.sub.warehouse=app.wh38.phase; renderNav(); wh38Shell(app.wh38.phase); return; }
    if(e.target.closest('[data-wh-document-edits-refresh]')){void whDocumentEditsPaint($('#wh38Body'));return;}
    const el=e.target.closest('[data-action]'); if(!el)return;
    const a=el.dataset.action, id=el.dataset.id;
    try{
      if(a==='confirm-settlement-return'){
        const box=el.closest('[data-return-order]'),checks=[...box.querySelectorAll('[data-return-item]')];
        if(checks.some(x=>!x.checked)||!box.querySelector('[data-return-no-goods]')?.checked)return toast('ابتدا بازگشت همه اقلام و نبود کالا نزد مراجعه‌کننده را تأیید کنید.');
        if(!confirm('بازگشت کامل کالا و خروج بدون کالا تأیید و سفارش لغو شود؟'))return;
        el.disabled=true;await api('/api/warehouse/settlement-cancellations/'+encodeURIComponent(id)+'/confirm',{method:'POST',body:JSON.stringify({returnedItems:checks.map(x=>x.dataset.returnItem),confirmedNoGoods:true})});toast('انصراف ثبت شد؛ خروج بدون کالا به نگهبانی ارجاع شد.');await refreshIndicators();wh38Shell(app.wh38.phase);return;
      }
      if(a==='pickup-cancel'){ const reason=prompt('دلیل انصراف را وارد کنید:');if(!reason?.trim())return;if(!confirm('آیا انبار تأیید می‌کند هیچ کالایی به این مراجعه تحویل نشده است؟'))return;el.disabled=true;await api('/api/pickup/'+encodeURIComponent(id)+'/cancellation',{method:'POST',body:JSON.stringify({reason,confirmedNoGoods:true})});toast('عدم تحویل ثبت شد و در انتظار تأیید فروش است.');await refreshIndicators();wh38Shell(app.wh38.phase);return;}
      if(a==='store-addition-warehouse'){
        if(!confirm(el.dataset.decision==='APPROVE'?'کالاها به همین سفارش اضافه شوند؟':'درخواست افزودن کالا رد شود؟'))return;
        el.disabled=true;await api('/api/warehouse/store-orders/'+encodeURIComponent(id)+'/additions/review',{method:'POST',body:JSON.stringify({requestId:el.dataset.request,decision:el.dataset.decision})});toast('نتیجه بررسی انبار ثبت شد.');await refreshIndicators();await wh38Paint('stores');return;
      }
      if(a==='wh-stock-preview')return wh38StockPreview(el.dataset.branch);
      if(a==='wh-history-document')return whDeliveredDetails(id);
      if(a==='wh-history-store-document')return whStoreDocumentDetails(id,Number(el.dataset.run)||1);
      if(a==='wh-delivered-details'){ return whDeliveredDetails(id); }
      if(a==='warehouse-document-edit'){ return warehouseDocumentEditOpen(id,el.dataset.paymentId); }
      if(a==='wh-delivered-prev'){ app.whDelivered.offset=Math.max(0,app.whDelivered.offset-50); return whDeliveredLoad(); }
      if(a==='wh-delivered-next'){ app.whDelivered.offset+=50; return whDeliveredLoad(); }
      if(a==='print-store-service'){ return printStoreService(id,Number(el.dataset.run)); }
      if(a==='wh38-accept'){ const notices=captureEntityNotices('order',id); el.disabled=true; await api('/api/orders/'+id+'/warehouse/accept',{method:'POST'}); finishEntityNotices(notices); toast('سفارش تأیید شد و وارد مرحله آماده‌سازی شد.'); await refreshIndicators(); if(app.page==='warehouse'&&app.wh38.phase==='incoming')wh38Shell('incoming'); else if(app.wh38.phase==='stores')wh38Paint('stores'); }
      else if(a==='wh38-store-details'){ wh38StoreDetails(id); }
      else if(a==='wh38-order-details'){ await openOrderDetails(id); }
      else if(a==='wh38-start'){ el.disabled=true; const r=await api('/api/orders/'+id+'/warehouse/start-preparing',{method:'POST',body:'{}'}); toast('آماده‌سازی سفارش ثبت شد.'); if(r.order&&r.order.storeRun&&r.order.storeRun.enabled) sr38Sheet(r.order); else wh38Sheet(r.order); }
      else if(a==='wh-weight-details'){whOpenWeighing(el.closest('tr[data-wh38-item],tr[data-sr318-row],article')?.querySelector('[data-wh38-weight],[data-sr38-weight]'));}
      else if(a==='wh38-save-draft'){ el.disabled=true;try{await wh38SaveDraft(id);}finally{el.disabled=false;} }
      else if(a==='wh38-finalize'){ await wh38Finalize(id); }
      else if(a==='wh38-return'){ const reason=prompt('دلیل ارجاع به فروش را وارد کنید:','اصلاح سفارش / اصلاح وزن')||''; if(!reason)return; await api('/api/orders/'+id+'/return-sales',{method:'POST',body:JSON.stringify({reason})}); toast('سفارش به فروش ارجاع شد.'); await refreshIndicators(); if(app.wh38.phase==='stores'){app.wh38.storeTab='preparing'; wh38Shell('stores');}else wh38Shell('preparing'); }
      else if(a==='sr38-handover-document'){ await whStoreDocumentDetails(id,Number(el.dataset.run)); }
      else if(a==='sr38-history'){const it=(app.wh38.sheetOrder?.items||[]).find(x=>x.id===el.dataset.item);if(it)openModal('سوابق وزن‌کشی — '+(it.product?.name||'محصول'),sr38Hist(it));}
      else if(a==='sr38-back'){ if(app.wh38.phase==='stores'){app.wh38.storeTab='preparing'; wh38Shell('stores');}else wh38Shell('preparing'); }
      else if(a==='sr38-weight'){ const inp=el.closest('.sr-table-ops,.sr38-ops')?.querySelector('input[data-sr38-weight]'); const raw=String(inp?inp.value:'').trim(); const kg=whWeightNet(inp); const run=Number(el.dataset.run)===2?2:1; if(raw===''||!Number.isFinite(kg)||kg<0){ toast('وزن واقعی را وارد کنید؛ برای انتقال این قلم به سرویس دوم، وزن صفر ثبت کنید.'); return; } if(kg===0){ if(app.wh38.sheetOrder?.storeOrderKind==='PARTIAL'){toast('برای کالای ناموجود گزینه عدم موجودی را انتخاب کنید.');return;} if(run===2){ toast('در سرویس دوم وزن صفر ثبت نمی‌شود؛ اگر کالا موجود نیست «عدم موجودی» و اگر تمام شده «تکمیل محصول» را بزنید.'); return; } if(!confirm('وزن صفر وارد شده است؛ این قلم به سرویس دوم منتقل شود؟'))return; el.disabled=true; if(await sr38Post(id,'move',{itemId:el.dataset.item})) toast('وزن صفر ثبت شد؛ قلم به سرویس دوم منتقل شد.'); return; } el.disabled=true; if(await sr38Post(id,'weights',{run,items:[{itemId:el.dataset.item,deliveredKg:kg,weighings:whWeightPayload(inp)}]})) toast(app.wh38.sheetOrder?.storeOrderKind==='PARTIAL'?'وزن ذخیره شد؛ تحویل فیزیکی هنوز ثبت نشده است.':'وزن واقعی سرویس '+(run===2?'دوم':'اول')+' ثبت شد؛ این وزن ذخیره شد؛ تا ارسال سرویس و تحویل به راننده، تحویل فیزیکی ثبت نمی‌شود.'); }
      else if(a==='sr38-move'){ if(!confirm('این محصول به سرویس دوم منتقل شود؟ وزن‌های ثبت‌شده سرویس اول حفظ می‌شود.'))return; el.disabled=true; if(await sr38Post(id,'move',{itemId:el.dataset.item})) toast('قلم به سرویس دوم منتقل شد.'); }
      else if(a==='sr38-complete'){ if(!confirm('ارسال این محصول نهایی و «تکمیل‌شده» ثبت شود؟'))return; el.disabled=true; if(await sr38Post(id,'complete',{itemId:el.dataset.item})) toast('ارسال قلم تکمیل شد.'); }
      else if(a==='sr38-oos'){ const reason=prompt('توضیح «عدم موجودی / بسته با کسری» برای این قلم (اختیاری):','مانده درخواست در انبار موجود نیست'); if(reason===null)return; el.disabled=true; if(await sr38Post(id,'out-of-stock',{itemId:el.dataset.item,note:reason||''})) toast('قلم با «عدم موجودی» بسته شد.'); }
      else if(a==='sr38-reopen'){ if(!confirm('وزن‌های ارسال‌نشده این محصول از جمع حذف شود و وزن‌کشی از صفر آغاز شود؟ سوابق ابطال‌شده حفظ می‌شود.'))return;el.disabled=true;if(await sr38Post(id,'reopen-item',{itemId:el.dataset.item}))toast('وزن‌کشی محصول از صفر باز شد.');else el.disabled=false; }
      else if(a==='sr38-send-run'){const run=Number(el.dataset.run)===2?2:1;const partial=app.wh38.sheetOrder?.storeOrderKind==='PARTIAL';if(!confirm(`ارسال ${partial?'محموله سفارش جزئی':'سرویس '+(run===2?'دوم':'اول')} به معنی تحویل فیزیکی کالا به راننده است. تأیید می‌کنید؟`))return;el.disabled=true;const sent=await sr38Post(id,'send-run',{run,physicalHandoverConfirmed:true});if(!sent){el.disabled=false;return;}toast('ارسال و تحویل به راننده ثبت شد؛ سند را چاپ و امضای دستی راننده را دریافت کنید.');await whStoreDocumentPrint(id,run);}


    }catch(err){ toast(err.message); el.disabled=false; }
  };
  if(app.wh38.timer){clearInterval(app.wh38.timer);app.wh38.timer=null}
  app.wh38.timer=setInterval(()=>{ if(app.page==='warehouse') wh38Paint(app.wh38.phase); },7000);
  if(phase==='history') renderWarehouseHistory(); else wh38Paint(phase);
}
// A small modal keeps the preparation row single-line; the draft stays local
// until the existing explicit weight/finalize action succeeds on the server.
const whWeighingDrafts=new WeakMap();
function whParseWeight(s){const v=String(s).trim().replace(/[۰-۹٠-٩]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.includes(d)?'۰۱۲۳۴۵۶۷۸۹'.indexOf(d):'٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/٫/g,'.');return /^(?:\d+|\d{1,3}(?:[,٬]\d{3})+)(?:\.\d+)?$/.test(v)?Number(v.replace(/[,٬]/g,'')):NaN;}
function whWeightNet(input){const draft=whWeighingDrafts.get(input);return draft?draft.reduce((s,r)=>s+Math.round(r.netKg*1000),0)/1000:(input.value.trim()?whParseWeight(input.value):0);}
function whWeightPayload(input){const draft=whWeighingDrafts.get(input);return draft?draft.map(({netKg,...row})=>row):[{grossKg:input.value,basket18:0,basket25:0,box300:0,box600:0,rackKg:0,cartKg:0}];}
function whOpenWeighing(input){
 if(!input||input.disabled)return;
 const original=whWeighingDrafts.get(input),initial=original?original.map(x=>({...x})):[{grossKg:input.value}];
 const tareTypes=[['basket18','سبد ۱٫۸ کیلویی',true],['basket25','سبد ۲٫۵ کیلویی',true],['box300','کارتن ۳۰۰ گرمی',true],['box600','کارتن ۶۰۰ گرمی',true],['rackKg','راک',false],['cartKg','گاری',false]];
 const group=(key='',value='')=>{
  const type=tareTypes.find(x=>x[0]===key);
  return `<div class="wh-tare-group" data-wt-group><label class="wh-tare-kind"><span>نوع ناخالصی</span><select data-wt-type aria-label="نوع ناخالصی"><option value="">بدون ناخالصی</option>${tareTypes.map(([k,label])=>`<option value="${k}" ${key===k?'selected':''}>${label}</option>`).join('')}</select></label><label class="wh-tare-amount" data-wt-amount-label ${type?'':'hidden'}><span>${type?.[2]?'تعداد':'وزن (کیلوگرم)'}</span><input type="text" inputmode="decimal" autocomplete="off" data-wt-value value="${esc(String(value))}" aria-label="${type?.[2]?'تعداد':'وزن ناخالصی به کیلوگرم'}" ${type?'':'disabled'}></label><button type="button" class="btn btn-secondary btn-sm wh-tare-remove" data-wt-remove-tare aria-label="حذف ناخالصی">×</button></div>`;
 };
 const line=(row={})=>{
  const selected=tareTypes.filter(([key])=>Number(row[key])>0);
  return `<tr class="wh-weight-table-row" data-wt-line><td data-label="نوبت"><button type="button" class="btn btn-secondary btn-sm wh-wt-select" data-wt-select-line aria-pressed="false">نوبت</button></td><td data-label="وزن ناخالص (کیلوگرم)"><label class="wh-gross"><span>وزن ناخالص (کیلوگرم)</span><input type="text" inputmode="decimal" autocomplete="off" data-wt-field="grossKg" value="${esc(String(row.grossKg??''))}" aria-label="وزن ناخالص"></label></td><td data-label="ناخالصی‌ها"><div class="wh-tare-groups" data-wt-groups>${selected.length?selected.map(([key])=>group(key,row[key])).join(''):group()}</div></td><td data-label="وزن خالص"><div class="wh-weight-net"><span>وزن خالص</span><b data-wt-net>—</b></div></td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-secondary btn-sm" data-wt-remove>حذف نوبت</button></td></tr>`;
 };
 openModal('وزن ناخالص و ناخالصی‌ها',`<div class="wh-weight-dialog"><p>نوع ناخالصی را انتخاب کنید و تعداد یا وزن آن را وارد کنید؛ برای ترکیب چند نوع از «افزودن ناخالصی» استفاده کنید. وزن‌ها به کیلوگرم است.</p><div class="wh-weight-scroll bt-table-wrap"><table class="bt-table wh-weight-table"><caption class="bt-caption">نوبت‌های وزن‌کشی</caption><thead><tr><th scope="col">نوبت</th><th scope="col">وزن ناخالص (کیلوگرم)</th><th scope="col">ناخالصی‌ها</th><th scope="col">وزن خالص</th><th scope="col">عملیات</th></tr></thead><tbody data-wt-lines>${initial.map(line).join('')}</tbody></table></div><div class="wh-weight-summary">جمع وزن خالص: <b data-wt-total>—</b></div><p data-wt-error role="alert"></p><div class="modal-actions"><button type="button" class="btn btn-secondary" data-wt-add-tare>افزودن ناخالصی</button><button type="button" class="btn btn-secondary" data-wt-add>افزودن نوبت</button><button type="button" class="btn btn-secondary" data-wt-clear>پاک کردن جزئیات</button><button type="button" class="btn btn-primary" data-wt-apply>تأیید وزن</button></div></div>`);
 const host=$('#modal .wh-weight-dialog'),container=host.querySelector('[data-wt-lines]');
 let activeLine=container.querySelector('[data-wt-line]');
 function selectLine(line){
  if(line&&container.contains(line))activeLine=line;
  const lines=[...container.querySelectorAll('[data-wt-line]')];
  if(!lines.includes(activeLine))activeLine=lines[0];
  lines.forEach((el,i)=>{const selected=el===activeLine,btn=el.querySelector('[data-wt-select-line]');el.classList.toggle('is-active',selected);btn.textContent='نوبت '+fa(i+1);btn.setAttribute('aria-pressed',String(selected));});
  host.querySelector('[data-wt-add-tare]').textContent=lines.length>1?'افزودن ناخالصی به نوبت '+fa(lines.indexOf(activeLine)+1):'افزودن ناخالصی';
 }
 function syncOptions(el){const selects=[...el.querySelectorAll('[data-wt-type]')],used=new Set(selects.map(x=>x.value).filter(Boolean));for(const select of selects)for(const option of select.options)option.disabled=!!option.value&&option.value!==select.value&&used.has(option.value);}
 function calculate(){let sum=0,error='',rows=[];for(const el of container.querySelectorAll('[data-wt-line]')){
  const v={grossKg:whParseWeight(el.querySelector('[data-wt-field=grossKg]').value),basket18:0,basket25:0,box300:0,box600:0,rackKg:0,cartKg:0},seen=new Set();let duplicate=false;
  for(const entry of el.querySelectorAll('[data-wt-group]')){const key=entry.querySelector('[data-wt-type]').value;if(!key)continue;if(seen.has(key))duplicate=true;seen.add(key);v[key]=whParseWeight(entry.querySelector('[data-wt-value]').value);}
  const kg=['grossKg','rackKg','cartKg'],counts=['basket18','basket25','box300','box600'];
  const good=!duplicate&&kg.every(k=>Number.isFinite(v[k])&&v[k]>=0&&v[k]<=100000&&Math.abs(v[k]*1000-Math.round(v[k]*1000))<.000001)&&counts.every(k=>Number.isInteger(v[k])&&v[k]>=0&&v[k]<=100000);
  const gross=Math.round(v.grossKg*1000),tare=v.basket18*1800+v.basket25*2500+v.box300*300+v.box600*600+Math.round(v.rackKg*1000)+Math.round(v.cartKg*1000),net=(gross-tare)/1000;
  if(!good||!(net>0)){error=duplicate?'هر نوع ناخالصی در هر نوبت فقط یک بار قابل انتخاب است.':'اعداد معتبر و حداکثر سه رقم اعشار وارد کنید؛ مجموع ناخالصی باید کمتر از ناخالص باشد.';el.querySelector('[data-wt-net]').textContent='—';continue;}
  v.netKg=net;sum+=net;rows.push(v);el.querySelector('[data-wt-net]').textContent=qty(net);
 }if(!rows.length||sum>100000)error=error||'جمع وزن خالص نامعتبر است.';host.querySelector('[data-wt-error]').textContent=error;host.querySelector('[data-wt-total]').textContent=error?'—':qty(sum)+' کیلوگرم';return error?null:rows;}
 for(const el of container.querySelectorAll('[data-wt-line]'))syncOptions(el);
 selectLine(activeLine);
 host.addEventListener('focusin',e=>{const line=e.target.closest('[data-wt-line]');if(line)selectLine(line);});
 host.addEventListener('input',calculate);
 host.addEventListener('change',e=>{if(!e.target.matches('[data-wt-type]'))return;const entry=e.target.closest('[data-wt-group]'),type=tareTypes.find(x=>x[0]===e.target.value),label=entry.querySelector('[data-wt-amount-label]'),amount=entry.querySelector('[data-wt-value]');label.hidden=!type;amount.disabled=!type;amount.value='';label.querySelector('span').textContent=type?.[2]?'تعداد':'وزن (کیلوگرم)';amount.setAttribute('aria-label',type?.[2]?'تعداد':'وزن ناخالصی به کیلوگرم');syncOptions(entry.closest('[data-wt-line]'));calculate();if(type)amount.focus();});
 host.addEventListener('click',e=>{
  const el=e.target.closest('[data-wt-line]');
  if(e.target.closest('[data-wt-select-line]'))selectLine(el);
  if(e.target.closest('[data-wt-add-tare]')){const row=activeLine,list=row.querySelector('[data-wt-groups]'),blank=[...list.querySelectorAll('[data-wt-type]')].find(x=>!x.value);if(blank){blank.focus();return;}if(list.children.length>=tareTypes.length)return;list.insertAdjacentHTML('beforeend',group());syncOptions(row);list.lastElementChild.querySelector('select').focus();calculate();}
  if(e.target.closest('[data-wt-remove-tare]')){const entry=e.target.closest('[data-wt-group]'),list=entry.parentElement;entry.remove();if(!list.children.length)list.insertAdjacentHTML('beforeend',group());syncOptions(el);calculate();}
  if(e.target.closest('[data-wt-add]')){if(container.children.length>=100)return;container.insertAdjacentHTML('beforeend',line());selectLine(container.lastElementChild);activeLine.querySelector('[data-wt-field=grossKg]').focus();calculate();}
  if(e.target.closest('[data-wt-remove]')){if(container.children.length>1){el.remove();selectLine(null);}calculate();}
  if(e.target.closest('[data-wt-clear]')){whWeighingDrafts.delete(input);input.readOnly=false;input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));closeModal();}
  if(e.target.closest('[data-wt-apply]')){const rows=calculate();if(!rows)return;whWeighingDrafts.set(input,rows);input.value=String(rows.reduce((s,r)=>s+Math.round(r.netKg*1000),0)/1000);input.readOnly=true;input.dispatchEvent(new Event('input',{bubbles:true}));closeModal();}
 });calculate();
}
function wh38Sheet(o){
  const body=$('#wh38Body'); if(!body)return;
  body.dataset.sheet='1';
  app.wh38.sheetOrder=o;
  const items=activeItemsOf(o);
  body.innerHTML=`<section class="wh38-sheet">
    <div class="wh38-sheet-head wh38-sheet-head-compact"><div class="wh38-sheet-heading"><span class="stl-eyebrow">آماده‌سازی و تحویل</span></div>${orderCustomerStripHtml(o,false,['نام مشتری','شماره تماس','شماره سفارش','محل ارسال'])}</div>
    ${app.features?.pickupStaging&&o.visit?.status==='PICKUP_PRESENT'?`<div class="wh38-note"><b>تحویل‌گیرنده: ${esc(o.visit.recipient?.name||'—')}</b><span>تماس: ${esc(fa(o.visit.recipient?.phone||'—'))} • ${esc([o.visit.recipient?.vehicleType,o.visit.recipient?.carType,o.visit.recipient?.plate].filter(Boolean).join(' — '))}</span></div>`:''}
    <div class="wh38-progress"><span class="done">۱ سفارش ورودی</span><i></i><span class="active">۲ آماده‌سازی</span><i></i><span>۳ ارسال به تسویه فروش</span></div>
    <div class="bt-table-wrap wh-prep-table-wrap"><table class="bt-table wh-prep-table"><caption class="bt-caption">اقلام آماده‌سازی انبار</caption><thead><tr><th scope="col">ردیف</th><th scope="col">محصول</th><th scope="col">مقدار درخواستی</th><th scope="col">توضیحات ردیف</th><th scope="col">وزن خالص</th><th scope="col">عدم موجودی</th><th scope="col">توضیح انبار برای فروش</th></tr></thead><tbody>${items.map((it,k)=>`<tr data-wh38-item="${esc(it.id)}">
      <td data-label="ردیف">${fa(String(k+1))}</td>
      <td data-label="محصول"><div class="wh38-cell-box wh38-prep-title" title="${esc(it.product?.name||'—')}"><strong>${esc(it.product?.name||'—')}</strong></div></td>
      <td data-label="مقدار درخواستی"><div class="wh38-cell-box wh38-req"><b>${qty(it.requestedQty)} ${esc(it.requestedUnit||'')}</b></div></td>
      <td data-label="توضیحات ردیف"><div class="wh38-cell-box wh38-prep-desc" title="${esc(it.description||'بدون توضیح')}">${esc(it.description||'بدون توضیح')}</div></td>
      <td data-label="وزن خالص"><div class="wh38-weight"><div class="wh38-cell-box wh-weight-main"><input id="wh38-weight-${esc(it.id)}" type="text" inputmode="decimal" autocomplete="off" aria-label="وزن خالص ${esc(it.product?.name||'محصول')} به کیلوگرم" data-wh38-weight="${esc(it.id)}" placeholder="۰٫۰۰۰"><button type="button" class="btn btn-secondary btn-sm wh-weight-open" data-action="wh-weight-details">ناخالصی</button></div></div></td>
      <td data-label="عدم موجودی"><div class="wh38-stock-cell"><label class="wh38-oos" title="عدم موجودی ${esc(it.product?.name||'محصول')}"><input type="checkbox" aria-label="عدم موجودی ${esc(it.product?.name||'محصول')}" data-wh38-oos="${esc(it.id)}"></label></div></td>
      <td data-label="توضیح انبار برای فروش"><div class="wh38-note-box"><textarea id="wh38-note-${esc(it.id)}" rows="2" maxlength="300" autocomplete="off" dir="auto" placeholder="اختیاری — مثلاً: دو کارتن نمدار بود" aria-label="توضیح انبار برای فروش دربارهٔ ${esc(it.product?.name||'محصول')}" data-wh38-note="${esc(it.id)}">${esc(it.warehouseNote||'')}</textarea><span class="wh38-note-count" data-wh38-note-count aria-hidden="true"></span></div></td>
    </tr>`).join('')||'<tr><td colspan="7">قلمی برای آماده‌سازی نیست.</td></tr>'}</tbody></table></div>
    <div class="wh38-sheet-foot"><div><span>جمع وزن نهایی</span><strong id="wh38Total">۰ کیلوگرم</strong><small data-wh38-draft-status aria-live="polite">${o.warehouseWeightDraft?.revision?'وزن‌ها ذخیره شده‌اند.':'تغییرات هنوز ذخیره نشده است.'}</small></div>
      <div class="toolbar"><button type="button" class="btn btn-secondary btn-lg" data-action="wh38-save-draft" data-id="${o.id}">ذخیره وزن‌ها</button><button type="button" class="btn btn-secondary btn-lg" data-action="wh38-return" data-id="${o.id}">${icon('arrow',16)} ارجاع به فروش</button><button type="button" class="btn btn-primary btn-lg" data-action="wh38-finalize" data-id="${o.id}">${icon('send',17)} ${app.features?.pickupStaging&&o.deliveryMode==='PICKUP'&&o.orderType==='REMOTE'?'ثبت وزن و تحویل واقعی و چاپ':'ثبت وزن، تحویل و چاپ سند'}</button></div></div>
  </section>`;
  const saved=new Map((o.warehouseWeightDraft?.items||[]).map(x=>[x.itemId,x]));
  $$('#wh38Body [data-wh38-weight]').forEach(el=>{
    const row=saved.get(el.dataset.wh38Weight);if(row){const check=$(`#wh38Body [data-wh38-oos="${el.dataset.wh38Weight}"]`);if(row.outOfStock){check.checked=true;el.disabled=true;}else{el.value=String(row.deliveredKg);if(Array.isArray(row.weighings)&&row.weighings.length){whWeighingDrafts.set(el,row.weighings.map(x=>({...x})));el.readOnly=true;}}}
    el.addEventListener('input',()=>{wh38Total();const status=$('#wh38Body [data-wh38-draft-status]');if(status)status.textContent='تغییرات جدید هنوز ذخیره نشده است.';});
  });
  $$('#wh38Body [data-wh38-note]').forEach(el=>{
    const row=saved.get(el.dataset.wh38Note);
    if(row&&typeof row.note==='string')el.value=row.note;
    const count=el.parentElement.querySelector('[data-wh38-note-count]');
    const paint=()=>{if(count)count.textContent=el.value.trim()?fa(String(el.value.trim().length)):'';};
    paint();
    el.addEventListener('input',()=>{paint();const status=$('#wh38Body [data-wh38-draft-status]');if(status)status.textContent='تغییرات جدید هنوز ذخیره نشده است.';});
  });
  $$('#wh38Body [data-wh38-oos]').forEach(ch=>ch.addEventListener('change',()=>{ const w=$(`#wh38Body [data-wh38-weight="${ch.dataset.wh38Oos}"]`); if(w){w.disabled=ch.checked; if(ch.checked){w.value='';w.readOnly=false;whWeighingDrafts.delete(w);}} wh38Total();const status=$('#wh38Body [data-wh38-draft-status]');if(status)status.textContent='تغییرات جدید هنوز ذخیره نشده است.'; }));
  wh38Total();
}
async function wh38SaveDraft(id){
  const selected=app.wh38.sheetOrder;if(!selected||selected.id!==id)return toast('سفارش مجدداً باز شود.');
  const noteOf=id=>{const el=$(`#wh38Body [data-wh38-note="${id}"]`);return el?el.value:'';};
  const collect=()=>$$('#wh38Body [data-wh38-weight]').flatMap(w=>{
    const out=$(`#wh38Body [data-wh38-oos="${w.dataset.wh38Weight}"]`)?.checked||false;
    if(out)return [{itemId:w.dataset.wh38Weight,outOfStock:true,note:noteOf(w.dataset.wh38Weight)}];
    if(!w.value.trim())return [];
    return [{itemId:w.dataset.wh38Weight,outOfStock:false,deliveredKg:whWeightNet(w),note:noteOf(w.dataset.wh38Weight),...(whWeighingDrafts.has(w)?{weighings:whWeightPayload(w)}:{})}];
  });
  const items=collect();
  if(items.some(x=>!x.outOfStock&&(!Number.isFinite(x.deliveredKg)||x.deliveredKg<=0)))return toast('وزن‌های واردشده باید معتبر و مثبت باشند.');
  try{const {draft}=await api('/api/orders/'+encodeURIComponent(id)+'/warehouse/draft',{method:'POST',body:JSON.stringify({revision:selected.warehouseWeightDraft?.revision||0,items})});selected.warehouseWeightDraft=draft;const status=$('#wh38Body [data-wh38-draft-status]');if(status)status.textContent=JSON.stringify(collect())===JSON.stringify(items)?'وزن آماده‌سازی ذخیره شده است.':'تغییرات جدید هنوز ذخیره نشده است.';toast('وزن‌ها ذخیره شد؛ تحویل کالا هنوز ثبت نشده است.');}
  catch(e){toast(e.message);}
}
function wh38Total(){ const total=$$('#wh38Body [data-wh38-weight]').reduce((s,e)=>s+(e.disabled?0:whWeightNet(e)),0); const el=$('#wh38Total'); if(el)el.textContent=Number.isFinite(total)?qty(total)+' کیلوگرم':'وزن نامعتبر'; }
async function wh38Finalize(id){
  const noteOf=id=>{const el=$(`#wh38Body [data-wh38-note="${id}"]`);return el?el.value:'';};
  const items=$$('#wh38Body [data-wh38-weight]').map(w=>{ const out=$(`#wh38Body [data-wh38-oos="${w.dataset.wh38Weight}"]`)?.checked||false; return {itemId:w.dataset.wh38Weight, deliveredKg:out?0:whWeightNet(w), outOfStock:out, note:noteOf(w.dataset.wh38Weight), ...(!out?{weighings:whWeightPayload(w)}:{})}; });
  if(!items.length)return toast('قلمی برای ثبت وزن وجود ندارد.');
  if(items.some(x=>!x.outOfStock&&(!Number.isFinite(x.deliveredKg)||x.deliveredKg<=0)))return toast('برای همه اقلام موجود وزن نهایی معتبر وارد کنید.');
  let result;
  const draftRevision=app.wh38.sheetOrder?.warehouseWeightDraft?.revision||0;
  let selected=app.wh38.sheetOrder;
  if(app.features?.pickupStaging&&selected?.id===id&&selected.orderType==='REMOTE'&&selected.deliveryMode==='PICKUP'){
    try{selected=(await api('/api/orders/'+encodeURIComponent(id))).order;}catch(e){return toast(e.message);}
  }
  const pickup=app.features?.pickupStaging&&selected?.id===id&&selected.orderType==='REMOTE'&&selected.deliveryMode==='PICKUP'&&(selected.pickupWorkflow===1||selected.visit?.status==='PICKUP_PRESENT'||!selected.warehouseCompletedAt);
  if(pickup&&selected.visit?.status!=='PICKUP_PRESENT')return toast('ابتدا نگهبانی ورود تحویل‌گیرنده را برای این سفارش ثبت کند.');
  const hasGoods=items.some(i=>!i.outOfStock&&i.deliveredKg>0);
  if(!hasGoods&&!confirm('همه اقلام ناموجودند. سفارش بدون ثبت تحویل یا تسویه برای تعیین تکلیف به فروش برگردد؟'))return;
  if(hasGoods&&pickup&&!confirm(`آیا کالا را واقعاً به ${selected.visit.recipient?.name||'تحویل‌گیرنده ثبت‌شده'} (${selected.visit.recipient?.phone||'—'}) داده‌اید؟ پس از ثبت، سند برای امضای دستی چاپ می‌شود.`))return;
  if(hasGoods&&!pickup&&!confirm(selected?.deliveryMode==='DELIVERY'?'ارسال به معنی تحویل فیزیکی به راننده پخش است. کالا را تحویل داده‌اید؟ سند برای امضای راننده چاپ می‌شود.':'ارسال به معنی تحویل فیزیکی کالا به مشتری یا تحویل‌گیرنده است. تأیید می‌کنید؟ سند برای امضا چاپ می‌شود.'))return;
  try{if(pickup)result=await api('/api/pickup/'+encodeURIComponent(id)+'/handover',{method:'POST',body:JSON.stringify({items,draftRevision,physicalHandoverConfirmed:hasGoods})});else result=await api('/api/orders/'+id+'/warehouse',{method:'POST',body:JSON.stringify({items,draftRevision,physicalHandoverConfirmed:hasGoods})});}
  catch(e){toast(e.message);return;}
  if(result.allUnavailable){toast('همه اقلام ناموجود است؛ سفارش بدون تحویل برای تعیین تکلیف به فروش برگشت.');if(app.page==='warehouse')wh38Shell('preparing');void refreshIndicators();return;}
  if(pickup){try{whPrintDocument(result.handover.document,0);}catch(e){toast('تحویل ثبت شد؛ چاپ را از بخش تحویل‌شده تکرار کنید.');}if(app.page==='warehouse'){toast('تحویل واقعی ثبت شد؛ سند را چاپ و امضای دستی تحویل‌گیرنده را دریافت کنید.');wh38Shell('preparing');void refreshIndicators();}return;}
  if(app.page!=='warehouse')return;
  void refreshIndicators();
  if(!items.some(i=>!i.outOfStock&&i.deliveredKg>0)){toast('عدم موجودی ثبت و برای فروش ارسال شد؛ کالایی تحویل نشده است.');wh38Shell('preparing');return;}
  app.sub.warehouse='delivered';renderNav();wh38Shell('delivered');
  try{const doc=result.handover?.document||(await api('/api/warehouse/delivered/'+encodeURIComponent(id))).order;whPrintDocument(doc,0);toast('تحویل فیزیکی ثبت شد؛ سند را چاپ و امضای تحویل‌گیرنده را دریافت کنید.');}catch(e){toast('تحویل ثبت شد؛ چاپ را از بخش تحویل‌شده تکرار کنید: '+e.message);}


}
/* ---------------- v37.4.0 — سفارش فروشگاه: برگهٔ دو سرویس ارسال انبار ---------------- */
const SR38_STATUS_LABEL={AWAITING_R1:'در انتظار سرویس اول',IN_SHIPPING:'وزن ذخیره‌شده',MOVED_R2:'در انتظار سرویس دوم',COMPLETED:'تکمیل‌شده',CLOSED_SHORT:'بسته با کسری'};
function sr38Chips(o){ const sr=o&&o.storeRun; if(!sr||!sr.enabled)return ''; if(o.storeOrderKind==='PARTIAL')return `<div class="st-run-chips"><span class="st-run-chip">سفارش جزئی</span><span class="st-run-chip">${esc(sr.r1StageLabel||'در حال پیگیری')}</span></div>`; const c=sr.counts||{total:0,completed:0,remaining:0,short:0};
  return `<div class="st-run-chips"><span class="st-run-chip st-run-overall">${esc(sr.overallLabel||'')}</span><span class="st-run-chip st-run-r1 st-run-${esc(sr.r1Status||'PENDING')}">سرویس اول: ${esc(sr.r1StatusLabel||'')}</span><span class="st-run-chip st-run-r2 st-run-${esc(sr.r2Status||'NOT_NEEDED')}">سرویس دوم: ${esc(sr.r2StatusLabel||'')}</span><span class="st-run-chip">اقلام ${qty(c.completed)}/${qty(c.total)} تکمیل${c.short?` · ${qty(c.short)} بسته با کسری`:''}</span>${sr.r1StageLabel?`<span class="st-run-chip st-run-stage">سرویس اول ← فروش: ${esc(sr.r1StageLabel)}</span>`:''}${sr.r2StageLabel?`<span class="st-run-chip st-run-stage">سرویس دوم ← فروش: ${esc(sr.r2StageLabel)}</span>`:''}</div>`; }

/* ---------- v37.5.0 — ارسال هر سرویس وزن‌شده به فروش (تعیین راننده و تحویل فیزیکی) ---------- */
function sr38SendBtn(o,run,view){ const ops=o.storeRunOps||{}; const sh=run===2?ops.r2Shipment:ops.r1Shipment;
  const items=view||[]; const label=run===2?'دوم':'اول';
  const missingDriver=o.transportWorkflow===1&&!o.transportAssignments?.[String(run)]?.driverId;
  if(missingDriver&&(!sh||sh.status==='PENDING_SALES'))return `<button type="button" class="btn btn-secondary btn-lg" disabled title="ابتدا رانندهٔ همین سرویس را در ترابری تعیین کنید">ارسال سرویس ${label} — منتظر تعیین راننده</button>`;
  if(sh){ // v37.33.0 — اگر پس از ارسال، قلم تازه‌ای برای همین سرویس وزن شده باشد، «ارسال قلم‌های جدید» به همان محموله فعال می‌شود
    const fresh=items.filter(v=>Number(run===2?v.r2Kg||0:v.r1Kg||0)>0&&!(run===2?v.sentInR2:v.sentInR1));
    if(sh.status==='PENDING_SALES'&&fresh.length){ return `<span class="st-run-chip st-run-stage" title="اقلام این سرویس به فروش ارسال شده‌اند">${icon('check',13)} سرویس ${label} به فروش ارسال شد</span><button type="button" class="btn btn-primary btn-lg" data-action="sr38-send-run" data-id="${o.id}" data-run="${run}" title="این قلم‌های تازه به همان محمولهٔ نزد فروش افزوده می‌شوند">${icon('send',16)} ارسال ${qty(fresh.length)} قلم جدید سرویس ${label} به فروش</button>`; }
    return `<span class="st-run-chip st-run-stage" title="اقلام این سرویس به فروش ارسال شده‌اند">${icon('check',13)} سرویس ${label} به فروش ارسال شد</span>`; }
  const ready=run===1?items.some(v=>Number(v.r1Kg||0)>0&&!v.sentInR1):items.some(v=>Number(v.r2Kg||0)>0&&!v.sentInR2);
  // v37.33.0 — سرویس دوم پیش از ارسال سرویس اول واقعاً غیرفعال است (قبلاً کلیک فقط خطای سرور می‌داد)
  // و عنوان راهنما همیشه با وضعیت واقعی دکمه یکی است.
  const blocked=run===2&&!ops.r1Shipment;
  const off=blocked||!ready;
  const why=blocked?'نخست اقلام سرویس اول را به فروش ارسال کنید':(!ready?'پس از ثبت وزن این سرویس فعال می‌شود':'');
  return `<button type="button" class="btn btn-secondary btn-lg" data-action="sr38-send-run" data-id="${o.id}" data-run="${run}" ${off?'disabled':''} ${why?`title="${esc(why)}"`:''}>${icon('send',16)} ارسال سرویس ${label} به فروش</button>`; }
function sr38Hist(it){ const rows=[...((it.runR1)||[]).map(e=>({run:1,e})),...((it.runR2)||[]).map(e=>({run:2,e})),...(it.voidedRunWeighings||[]).flatMap(v=>[...(v.runR1||[]).map(e=>({run:1,e,voided:true})),...(v.runR2||[]).map(e=>({run:2,e,voided:true}))])].sort((a,b)=>String(a.e.at).localeCompare(String(b.e.at)));
  if(!rows.length)return '<div class="st-run-hist-empty">هنوز وزنی ثبت نشده است.</div>';
  return `<ul class="sr38-hist">${rows.map(({run,e,voided})=>`<li><b>${voided?'ابطال‌شده:': '+'} ${qty(e.kg)} کیلوگرم</b><span>سرویس ${fa(String(run))}</span><span>${esc((e.at||'').slice(11,16)||'')}</span><span>${esc(e.byName||'')}</span>${e.note?`<small>${esc(e.note)}</small>`:''}</li>`).join('')}</ul>`; }
// Shared table for active and completed store preparation lines.
function sr318Table(rows,empty='قلمی در این بخش نیست.'){
 return `<div class="bt-table-wrap sr318-table-wrap"><table class="bt-table sr318-table"><caption class="bt-caption">اقلام آماده‌سازی فروشگاه</caption><thead><tr><th scope="col">ردیف</th><th scope="col">محصول</th><th scope="col">وضعیت</th><th scope="col">درخواست</th><th scope="col">وزن و سوابق</th><th scope="col">عملیات</th></tr></thead><tbody>${rows||`<tr><td colspan="6">${empty}</td></tr>`}</tbody></table></div>`;
}
// Partial store orders are a single independent shipment, not the two daily services.
function srPartialSheet(o){
 const body=$('#wh38Body');if(!body)return;body.dataset.sheet='1';app.wh38.sheetOrder=o;
 const items=activeItemsOf(o),view=new Map((o.storeRun?.items||[]).map(v=>[v.itemId,v]));
 const pendingAddition=(o.storeAdditionRequests||[]).some(r=>['PENDING_SALES','PENDING_WAREHOUSE'].includes(r.status));
 const ready=items.every(i=>i.runCompleted||i.shortageClosed),hasWeight=items.some(i=>Number(view.get(i.id)?.totalKg)>0);
 const rows=items.map((it,k)=>{const v=view.get(it.id)||{},closed=!!(it.runCompleted||it.shortageClosed),weight=Number(v.totalKg||0);
  const history=(it.voidedRunWeighings||[]).length?`<button type="button" class="btn btn-secondary btn-sm" data-action="sr38-history" data-item="${esc(it.id)}">سوابق وزن</button>`:'';
  const operations=closed?`${it.runCompleted&&!v.reopenRun?'<span>بازگشت از صفر ممکن نیست؛ وزن ارسال شده یا سرویس بسته است.</span>':''}${it.runCompleted&&v.reopenRun?`<button type="button" class="btn btn-secondary btn-sm" data-action="sr38-reopen" data-id="${esc(o.id)}" data-item="${esc(it.id)}">بازگشت به وزن‌کشی</button>`:''}`:`<div class="sr-table-ops"><div class="sr-table-weight"><input type="text" inputmode="decimal" autocomplete="off" placeholder="۰٫۰۰۰" aria-label="وزن خالص ${esc(it.product?.name||'محصول')}" data-sr38-weight="${esc(it.id)}"><b>کیلوگرم</b></div><button type="button" class="btn btn-secondary btn-sm" data-action="wh-weight-details">ناخالصی</button><button type="button" class="btn btn-primary btn-sm" data-action="sr38-weight" data-id="${esc(o.id)}" data-item="${esc(it.id)}" data-run="1">ذخیره وزن</button><button type="button" class="btn btn-secondary btn-sm" data-action="sr38-oos" data-id="${esc(o.id)}" data-item="${esc(it.id)}">عدم موجودی / کسری</button></div>`;
  return `<tr class="sr318-table-row" ${closed?'':'data-sr318-row="1"'}><td data-label="ردیف">${fa(k+1)}</td><td data-label="محصول"><strong class="sr318-product">${esc(it.product?.name||'—')}</strong></td><td data-label="وضعیت">${closed?(it.runCompleted?'تکمیل‌شده':'عدم موجودی / کسری'):'در حال آماده‌سازی'}</td><td data-label="درخواست">${qty(it.requestedQty)} ${esc(it.requestedUnit||'')}</td><td data-label="وزن و سوابق">وزن ثبت‌شده: ${qty(weight)} کیلوگرم ${history}</td><td data-label="عملیات" class="bt-col-actions">${operations}</td></tr>`;
 }).join('');
 body.innerHTML=`<section class="wh38-sheet st-run-sheet"><div class="wh38-sheet-head wh38-sheet-head-compact">${wh38StoreHeader(o)}</div><h3>آماده‌سازی سفارش جزئی</h3>${pendingAddition?'<p class="notice">درخواست افزودن کالا در انتظار تأیید است؛ صدور سند تا تعیین تکلیف متوقف است. برای بررسی به فهرست سفارش‌ها بازگردید.</p>':''}<p>هر محصول پس از ثبت وزن تعیین تکلیف می‌شود؛ ثبت وزن یا عدم موجودی، کار همان ردیف را تمام می‌کند. ذخیره وزن به معنی تحویل به راننده نیست.</p>${sr318Table(rows)}<div class="wh38-sheet-foot"><div>پس از تعیین تکلیف همه اقلام، محموله را آماده ارسال کنید.</div><div class="toolbar"><button type="button" class="btn btn-secondary" data-action="sr38-back" data-id="${esc(o.id)}">بازگشت</button><button type="button" class="btn btn-secondary" data-action="wh38-return" data-id="${esc(o.id)}">ارجاع به فروش</button><button type="button" class="btn btn-primary" data-action="sr38-send-run" data-id="${esc(o.id)}" data-run="1" ${!pendingAddition&&ready&&hasWeight&&(o.transportWorkflow!==1||o.transportAssignments?.['1']?.driverId)?'':'disabled'}>آماده ارسال محموله</button>${sr38WarehouseDocuments(o)}</div></div></section>`;
}
// Expose the actual per-service handover document from the preparation sheet.
function sr38WarehouseDocuments(o){
 if(o.transportWorkflow!==1)return storeServicePrintButtons(o.id,storeAvailableRuns(o),o.storeOrderKind);
 return `<div class="store-service-print">${(o.storeOrderKind==='PARTIAL'?[1]:[1,2]).map(run=>{
  const sh=run===1?o.storeRunOps?.r1Shipment:o.storeRunOps?.r2Shipment,assigned=o.transportAssignments?.[String(run)]?.driverId,hand=o.transportHandovers?.[String(run)];
  const label=o.storeOrderKind==='PARTIAL'?'محموله':`سرویس ${run===1?'اول':'دوم'}`;
  return `<button type="button" class="btn btn-secondary btn-sm" data-action="sr38-handover-document" data-id="${esc(o.id)}" data-run="${run}" ${!sh?'disabled title="ابتدا سرویس را ارسال کنید"':(!assigned?'title="پس از تعیین راننده می‌توانید سند را باز کنید"':'')}>${hand?'مشاهده و چاپ سند':'تحویل به راننده و چاپ سند'} ${label}</button>`;
 }).join('')}</div>`;
}
function sr38Sheet(o){
  if(o.storeOrderKind==='PARTIAL')return srPartialSheet(o);
  const body=$('#wh38Body'); if(!body)return;
  body.dataset.sheet='1';
  app.wh38.sheetOrder=o;
  const sr=o.storeRun||{};
  const items=activeItemsOf(o);
  const viewById={};(sr.items||[]).forEach(v=>{viewById[v.itemId]=v});
  const unresolved=(sr.items||[]).filter(v=>v.runStatus!=='COMPLETED'&&v.runStatus!=='CLOSED_SHORT');
  const totalSent=items.reduce((sum,it)=>{const v=viewById[it.id]||{};return sum+Number(v.totalKg||0)},0);
  const closedRows=[],groups={1:[],2:[]};
  items.forEach((it,k)=>{
    const v=viewById[it.id]||{}; const closed=!!(it.runCompleted||it.shortageClosed); const run=it.movedToR2?2:1;
    const hist=(it.runR1||[]).length+(it.runR2||[]).length+(it.voidedRunWeighings||[]).reduce((n,v)=>n+(v.runR1||[]).length+(v.runR2||[]).length,0);
    const wts=`<span class="sr318-weights" aria-label="وزن و سوابق"><span class="sr318-wts">س۱ <b>${qty(v.r1Kg||0)}</b> • س۲ <b>${qty(v.r2Kg||0)}</b> • جمع <b>${qty(v.totalKg||0)} کیلوگرم</b></span>${hist?`<button type="button" class="btn btn-secondary btn-sm sr318-history-button" data-action="sr38-history" data-item="${esc(it.id)}">سوابق (${qty(hist)})</button>`:''}</span>`;
    const head=`<td data-label="ردیف">${fa(String(k+1))}</td><td data-label="محصول"><strong class="sr318-product" title="${esc(it.product?.name||'—')}">${esc(it.product?.name||'—')}</strong></td><td data-label="وضعیت"><span class="st-run-chip st-run-${esc(v.runStatus||'AWAITING_R1')}">${esc(SR38_STATUS_LABEL[v.runStatus]||'')}</span></td><td data-label="درخواست">${qty(it.requestedQty)} ${esc(it.requestedUnit||'')}</td><td data-label="وزن و سوابق">${wts}</td>`;
    if(closed){ closedRows.push(`<tr class="sr318-table-row sr318-closed ${v.runStatus==='COMPLETED'?'sr38-done':''}${v.runStatus==='CLOSED_SHORT'?'sr38-short':''}">${head}<td data-label="عملیات" class="bt-col-actions"><span class="sr318-final">${it.runCompleted?`تکمیل‌شده — وزن ذخیره‌شده ${qty(v.totalKg||0)} کیلوگرم`:`بسته با کسری — وزن ذخیره‌شده ${qty(v.totalKg||0)} کیلوگرم${it.shortageClosed.note?` · ${esc(it.shortageClosed.note)}`:''}`}</span>${it.runCompleted&&!v.reopenRun?'<span>بازگشت از صفر ممکن نیست؛ وزن ارسال شده یا سرویس بسته است.</span>':''}${it.runCompleted&&v.reopenRun?`<button type="button" class="btn btn-secondary btn-sm" data-action="sr38-reopen" data-id="${esc(o.id)}" data-item="${esc(it.id)}">بازگشت به وزن‌کشی${v.reopenRun===2?' سرویس دوم':''}</button>`:''}</td></tr>`); return; }
    groups[run].push(`<tr class="sr318-table-row" data-sr318-row="${run}">${head}<td data-label="عملیات" class="bt-col-actions"><div class="sr-table-ops"><div class="sr-table-weight"><input type="text" inputmode="decimal" autocomplete="off" placeholder="۰٫۰۰۰" aria-label="وزن خالص ${esc(it.product?.name||'محصول')} به کیلوگرم" data-sr38-weight="${esc(it.id)}"><b>کیلوگرم</b></div><button type="button" class="btn btn-secondary btn-sm wh-weight-open" data-action="wh-weight-details">ناخالصی</button><button type="button" class="btn btn-primary btn-sm" data-action="sr38-weight" data-id="${esc(o.id)}" data-item="${esc(it.id)}" data-run="${run}">${icon('scale',13)} ذخیره وزن</button>${!it.movedToR2?`<button type="button" class="btn btn-secondary btn-sm" data-action="sr38-move" data-id="${esc(o.id)}" data-item="${esc(it.id)}">${icon('arrow',13)} سرویس دوم</button>`:''}<button type="button" class="btn btn-secondary btn-sm" data-action="sr38-complete" data-id="${esc(o.id)}" data-item="${esc(it.id)}">${icon('check',13)} تکمیل محصول</button><button type="button" class="btn btn-ghost btn-sm danger-text" data-action="sr38-oos" data-id="${esc(o.id)}" data-item="${esc(it.id)}">${icon('trash',13)} عدم موجودی</button></div></td></tr>`);
  });
  const groupHtml=(run,title,sub)=>`<section class="sr318-group" data-sr318-group="${run}"><header class="sr318-group-head"><b>سرویس ${title}</b><small>${sub}</small><span class="sr318-gcount">${qty(groups[run].length)} قلم فعال</span></header>${sr318Table(groups[run].join(''),'قلم فعالی در این سرویس نیست.')}</section>`;
  body.innerHTML=`<section class="wh38-sheet st-run-sheet st-run-sheet-v318">
    <div class="wh38-sheet-head wh38-sheet-head-compact wh38-store-sheet-head">${wh38StoreHeader(o)}</div>
    <div class="sr318-summary"><span>وضعیت کلی: <b>${esc(sr.overallLabel||'—')}</b></span><span>سرویس اول: <b>${esc(sr.r1StatusLabel||'—')}</b></span><span>سرویس دوم: <b>${esc(sr.r2StatusLabel||'—')}</b></span><span>جمع وزن ذخیره‌شده: <b>${qty(totalSent)} کیلوگرم</b></span><span>حل‌نشده: <b>${qty(unresolved.length)} قلم</b></span></div>
    <div class="sr318-sendnote">وزن هر قلم با «ذخیره وزن» برای سرویس مربوط در سامانه می‌ماند؛ هر ثبت، یک نوبت تازه به جمع همان سرویس اضافه می‌کند و به‌تنهایی ثبت تحویل نیست.</div><div class="sr318-sendline">${sr38SendBtn(o,1,sr.items)}${sr38SendBtn(o,2,sr.items)}${sr38WarehouseDocuments(o)}<span class="sr318-sendnote">سند (فاکتور) هر سرویس جدا و فقط با اقلام همان سرویس صادر می‌شود. با ثبت وزن: قلم کامل یا ناقص، به مقدار ثبت‌شده وارد فاکتور همان سرویس می‌شود؛ وزن صفر، قلم را به سرویس دوم می‌برد و ماندهٔ قلم ناقص هم با دکمهٔ «سرویس دوم» منتقل می‌شود؛ اگر بعد از ارسال یک سرویس، قلم تازه‌ای برای همان سرویس وزن شود، دکمهٔ «ارسال قلم جدید» آن را به همان محمولهٔ نزد فروش می‌افزاید.</span></div>
    ${groupHtml(1,'اول','ثبت وزن و ارسال صبح')}
    ${groupHtml(2,'دوم','ماندهٔ اقلام منتقل‌شده و ارسال ظهر')}
    ${closedRows.length?`<details class="sr318-done-box"><summary>اقلام تعیین‌تکلیف‌شده (${qty(closedRows.length)})</summary>${sr318Table(closedRows.join(''))}</details>`:''}
    <div class="wh38-sheet-foot sr318-foot"><div><span>اقلام حل‌نشده</span><strong>${qty(unresolved.length)} قلم</strong></div>
      <div class="toolbar sr38-sendbar"><button type="button" class="btn btn-secondary" data-action="sr38-back" data-id="${o.id}">${icon('arrow',15)} بازگشت به فهرست</button><button type="button" class="btn btn-secondary" data-action="wh38-return" data-id="${o.id}">${icon('arrow',15)} ارجاع به فروش</button>${sr38SendBtn(o,1,sr.items)}${sr38SendBtn(o,2,sr.items)}</div></div>
  </section>`;
}
async function sr38Post(id,ep,payload){
 // Repainting a saved row must not discard other rows the operator is still editing.
 const pending=$$('#wh38Body [data-sr38-weight]').filter(w=>w.value.trim()&&w.dataset.sr38Weight!==(payload.itemId||payload.items?.[0]?.itemId)).map(w=>({id:w.dataset.sr38Weight,value:w.value,rows:whWeighingDrafts.get(w)}));
 const restore=()=>pending.forEach(x=>{const w=$$('#wh38Body [data-sr38-weight]').find(el=>el.dataset.sr38Weight===x.id);if(w){w.value=x.value;if(x.rows){whWeighingDrafts.set(w,x.rows);w.readOnly=true;}}});
 try{ const result=await api('/api/orders/'+id+'/store-run/'+ep,{method:'POST',body:JSON.stringify(payload)}); const fresh=result.order?result:await api('/api/orders/'+id); if(fresh.order&&fresh.order.storeRun&&fresh.order.storeRun.finalizedAt){ toast(fresh.order.status==='OUT_OF_STOCK'?'همه اقلام ناموجود بود؛ نتیجه برای فروشگاه و فروش ثبت شد.':'کار انبار این سفارش پایان یافت و سفارش به سوابق انبار رفت.'); await refreshIndicators(); if(app.wh38.phase==='stores'){app.wh38.storeTab='preparing'; wh38Shell('stores');}else wh38Shell('preparing'); return fresh.order||true; } if(fresh.order&&fresh.order.storeRun&&$('#wh38Body[data-sheet="1"]')){sr38Sheet(fresh.order);restore();} await refreshIndicators(); return fresh.order||true; }catch(e){ toast(e.message); try{ const fresh=await api('/api/orders/'+id); if(fresh.order&&fresh.order.storeRun&&$('#wh38Body[data-sheet="1"]')){sr38Sheet(fresh.order);restore();} }catch(_){} return false; } } // v37.33.0 — هنگام خطا هم برگه از سرور بازرندر می‌شود تا عدد ردشده روی صفحه نماند و «ثبت‌شده» به نظر نرسد
// v37.35.0 — همین‌که سرور کار انبار را پایان‌یافته اعلام کند (ثبت وزن سرویس دوم و ارسال آن، یا آخرین «تکمیل محصول»)، برگه بسته و فهرست آماده‌سازی نشان داده می‌شود؛ سفارش دیگر آنجا نمی‌ماند.
window.renderWarehouse=async function(){
  if(app.timer){clearInterval(app.timer);app.timer=null}
  app.page='warehouse';
  if(app.whV33&&app.whV33.timer){clearInterval(app.whV33.timer);app.whV33.timer=null}
  wh38Shell(app.wh38.phase||'incoming');
};

/* ---------------- فروشگاه ---------------- */
// v37.5.0 — نمای هر محموله (سرویس) از یک سفارش؛ فاکتور و تأیید دریافت به‌ازای هر محموله
function st38ViewsOf(o){
  const ds=o.transportWorkflow===1&&o.orderType==='STORE'?Object.values(o.transportStoreTrips||{}).map(t=>{
    const sh=t.run===1?o.storeRunOps?.r1Shipment:o.storeRunOps?.r2Shipment;
    return {...t,status:t.status==='RECEIPT_CONFIRMED'?'DELIVERED':t.status,deliveredAt:t.storeReceiptConfirmedAt||null,shipmentItemIds:sh?.itemIds||[],shipmentWeights:sh?.weights||{}};
  }):[...(Array.isArray(o.dispatchRuns)?o.dispatchRuns:[]),...(o.dispatch?[o.dispatch]:[])].filter(Boolean);
  if(!ds.length)return [o];
  return ds.map((d)=>{
    const pay=d.run?(o.payments||[]).find((p)=>(p.deliveryRun||null)===(d.run||null)):o.payment;
    const view=Object.assign({},o,{dispatch:d,payment:pay||o.payment});
    delete view.dispatchRuns;
    return view;
  });
}
function st38RunSummaryHtml(o){ // v37.5.0 — جمع‌بندی هر محمولهٔ سرویس در جزئیات سفارش
  const ds=(o.transportWorkflow===1?st38ViewsOf(o).map(v=>v.dispatch):[...(Array.isArray(o.dispatchRuns)?o.dispatchRuns:[]),...(o.dispatch?[o.dispatch]:[])]).filter((d)=>d&&d.status);
  if(!ds.length)return '';
  const labels={RECEIPT_CONFIRMED:'دریافت فروشگاه تأیید شد',ASSIGNED:'به راننده واگذار شد',DRIVER_EXIT_REPORTED:'منتظر تأیید خروج نگهبان',IN_TRANSIT:'در حال ارسال به فروشگاه',DELIVERED:'تحویل ثبت شد (منتظر نهایی فروش)',SALES_FINALIZED:'نهایی‌شده نزد فروش',CLOSED:'بسته‌شده'};
  const lines=ds.map((d,i)=>`<div class="st-run-run-line"><span class="st-run-chip st-run-r${d.run===2?2:1}">${o.storeOrderKind==='PARTIAL'?'محموله سفارش جزئی':d.run===2?'محمولهٔ سرویس دوم':d.run===1?'محمولهٔ سرویس اول':'محموله'}</span><span>${esc(labels[d.status]||d.status)}</span><span>راننده: <b>${esc(d.driverName||'—')}</b></span><span>تحویل: <b>${esc(formatDateTime24(d.deliveredAt||''))}</b></span><span>تأیید دریافت: <b>${d.storeReceiptConfirmedAt?`تأیید شد • ${esc(formatDateTime24(d.storeReceiptConfirmedAt))}`:'نیامده'}</b></span></div>`).join('');
  return `<div class="st-run-runs-summary">${lines}</div>`;
}
function st38WeighingDetailsHtml(item,run,correction){
 const key=Number(run)===2?'runR2':'runR1';
 if(correction?.missingWeighings)return '';
 const records=correction?Array.isArray(correction.weighings)?[{kg:correction.deliveredKg,weighings:correction.weighings}]:[]:(Array.isArray(item?.[key])?item[key]:[]);
 const types=[['basket18','سبد ۱٫۸ کیلوگرمی',true],['basket25','سبد ۲٫۵ کیلوگرمی',true],['box300','کارتن ۳۰۰ گرمی',true],['box600','کارتن ۶۰۰ گرمی',true],['rackKg','راک',false],['cartKg','گاری',false]];
 const details=records.map((record,recordIndex)=>{
  const rounds=(Array.isArray(record.weighings)?record.weighings:[]).map((row,index)=>{
   const impurities=types.map(([field,label,isCount])=>{const value=Number(row[field]||0);return Number.isFinite(value)&&value>0?`${label}: ${qty(value)} ${isCount?'عدد':'کیلوگرم'}`:'';}).filter(Boolean).join('، ');
   if(!impurities&&!(Number(row.tareKg)>0))return '';
   return `<div class="st38-weighing-round"><b>نوبت ${fa(String(index+1))}</b>${impurities?`<span>جزئیات ناخالصی: ${esc(impurities)}</span>`:''}${Number(row.tareKg)>0?`<span>کسر کل ${qty(row.tareKg)} کیلوگرم</span>`:''}</div>`;
  }).join('');
  return rounds?`<section class="st38-weighing-record"><b>ثبت وزن ${fa(String(recordIndex+1))}${record.at?` · ${esc(formatDateTime24(record.at))}`:''}</b>${rounds}</section>`:'';
 }).join('');
 return details?`<div class="st38-weighing-details">${details}</div>`:'';
}

function st38DeliveredDetails(o){
 const d=o.dispatch||{},lines=Array.isArray(d.lines)?d.lines:[];
 const payable=Number(d.amountDue??o.payment?.totalAmount??d.approvedTotalAmount??0);
 const methods=d.settlementMethods||o.payment?.settlementMethods||[];
 const labels={CASH:'نقدی',POS:'پوز',CARD_TRANSFER:'کارت‌به‌کارت',CHECK:'چک',CREDIT:'معوق'};
 const isRun = d.run === 1 || d.run === 2;
 const runChip = o.storeOrderKind==='PARTIAL'?'<span class="st-run-chip">سفارش جزئی</span>':isRun ? `<span class="st-run-chip st-run-r${d.run === 2 ? 2 : 1}">محمولهٔ سرویس ${d.run === 2 ? 'دوم' : 'اول'}</span>` : '';
 const confirmed = !!d.storeReceiptConfirmedAt;
 const confirmedAt = d.storeReceiptConfirmedAt || '';
 const freeFlow=o.orderType==='STORE'; // v37.6.0 — فلوی فروشگاه بدون هیچ مبالغی؛ سند این عرضه وزنی است
 const rows=freeFlow?lines.map((line,i)=>{
  const item=(o.items||[]).find(row=>row.id===line.itemId),correction=(o.storeDocumentCorrections?.[String(d.run)]||[]).find(row=>row.itemId===line.itemId);
  const snapshot=correction||(Array.isArray(line.weighings)?{deliveredKg:line.deliveredKg,weighings:line.weighings,missingWeighings:line.missingWeighings}:null);
  const records=snapshot?(snapshot.missingWeighings?[]:[{weighings:snapshot.weighings}]):(item?.[Number(d.run)===2?'runR2':'runR1']||[]);
  // A gross total is known only when every weighing in this service is available.
  const known=records.length>0&&records.every(r=>Array.isArray(r.weighings)&&r.weighings.length>0&&r.weighings.every(w=>w.grossKg!=null&&Number.isFinite(Number(w.grossKg))&&Number(w.grossKg)>=0));
  const gross=known?records.reduce((sum,r)=>sum+r.weighings.reduce((n,w)=>n+Math.round(Number(w.grossKg)*1000),0),0)/1000:null;
  const net=correction?(correction.outOfStock?0:correction.deliveredKg):line.deliveredKg;
  return `<tr><td data-label="ردیف">${fa(String(i+1))}</td><td data-label="محصول">${esc(line.productName||'قلم')}</td><td data-label="خالص (کیلوگرم)">${qty(net)}</td><td data-label="ناخالص (کیلوگرم)">${gross==null?'<span title="وزن ناخالص در سابقه موجود نیست">—</span>':qty(gross)}</td><td data-label="ناخالصی‌های ثبت‌شده در توزین انبار">${st38WeighingDetailsHtml(item,d.run,snapshot)}</td></tr>`;
 }).join('')
 :lines.map((line,i)=>`<tr><td data-label="ردیف">${fa(String(i+1))}</td><td data-label="محصول">${esc(line.productName||'قلم')}</td><td data-label="تحویلی (کیلو)">${qty(line.deliveredKg)}</td><td data-label="مرجوعی">${qty(line.returnKg||0)}</td><td data-label="کسری">${qty(line.shortageKg||0)}</td><td data-label="خالص">${qty(line.netKg||0)}</td><td data-label="علت">${esc(line.reason||'—')}</td><td data-label="فی">${money(line.unitPrice||0)}</td><td data-label="مبلغ">${money(line.amountDue??line.grossAmount??0)}</td></tr>`).join('');
 const paid=freeFlow?'':methods.map(m=>`${esc(labels[m.type]||m.type)} ${money(m.amount)}${m.deviceSnapshot?` • ${esc(m.deviceSnapshot.title)} / پایانه ${esc(m.deviceSnapshot.terminalNumber)}`:''}${m.reference?` • پیگیری ${esc(m.reference)}`:''}`).join('، ');
 const summaryCell=freeFlow
   ?`<span>جمع وزن سند <b>${qty((lines||[]).reduce((sm,l)=>sm+Number(l.deliveredKg||0),0))} کیلوگرم</b></span><span>سند تحویل <b>${esc(fa(o.transportWorkflow===1?(d.warehouseDocumentNo||'—'):(o.payment?.invoiceNumber||'پس از تأیید نهایی فروش')))}</b></span>`
   :`<span>مبلغ قابل تسویه <b>${money(payable)}</b></span><span>فاکتور <b>${esc(fa(o.payment?.invoiceNumber||'پس از تأیید نهایی فروش'))}</b></span>${paid?`<span>روش‌های دریافت <b>${paid}</b></span>`:''}`;
 return `<article class="st38-delivered-card st38-delivered-details"><header><div><span class="order-code">${esc(fa(o.orderNo||'—'))}</span>${runChip}<h3>${esc(o.storeName||'فروشگاه')} </h3><p>${o.transportWorkflow===1?'تأیید فروشگاه':'ثبت تحویل راننده'}: ${formatDateTime24(d.deliveredAt)} • راننده: ${esc(d.driverName||'—')}</p></div><span class="badge ${confirmed?'green':'orange'}">${confirmed?'دریافت تأیید شد':'منتظر تأیید فروشگاه'}</span></header><div class="st38-delivered-items bt-table-wrap"><table class="bt-table store-shipment-table"><caption class="bt-caption">اقلام سند تحویل فروشگاه</caption><thead><tr><th>ردیف</th><th>محصول</th>${freeFlow?'<th>خالص (کیلوگرم)</th><th>ناخالص (کیلوگرم)</th><th>ناخالصی‌های ثبت‌شده در توزین انبار</th>':'<th>تحویلی (کیلو)</th><th>مرجوعی</th><th>کسری</th><th>خالص</th><th>علت</th><th>فی</th><th>مبلغ</th>'}</tr></thead><tbody>${rows||`<tr><td colspan="${freeFlow?5:9}">ریز اقلام تحویل در دسترس نیست.</td></tr>`}</tbody></table></div><div class="st38-delivered-summary">${summaryCell}</div>${o.storeOrderKind==='PARTIAL'?storeRequestRowsHtml(o.storeRequestRows):''}${d.note?`<p class="st38-delivered-note"><b>یادداشت راننده:</b> ${esc(d.note)}</p>`:''}<footer>${confirmed?`<span class="st38-confirmed-stamp">تأیید شما: ${formatDateTime24(confirmedAt)}</span>`:`<span class="subtle">${o.storeOrderKind==='PARTIAL'?'اقلام همین سفارش جزئی را کنترل و دریافت را تأیید کنید.':isRun?'اقلام همین محموله را کنترل و دریافت را تأیید کنید؛ محمولهٔ دیگر جداگانه تأیید می‌شود.':'لطفاً اقلام تحویلی را کنترل و دریافت را تأیید کنید.'}</span><button type="button" class="btn btn-primary" data-action="store-confirm-delivery" data-partial="${o.storeOrderKind==='PARTIAL'?'1':'0'}" data-id="${esc(o.id)}"${isRun?` data-run="${d.run}"`:''}>${icon('check',16)} تأیید دریافت ${o.storeOrderKind==='PARTIAL'?'سفارش جزئی':isRun?'محمولهٔ سرویس '+(d.run===2?'دوم':'اول'):'تحویل'}</button>`}</footer></article>`;
}
function st38DeliveredRow(o){
 const d=o.dispatch||{},run=Number(d.run)||0;
 return `<tr data-order="${esc(o.id)}"><td data-label="فروشگاه">${esc(storeAwareOrderName(o))}</td><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="تاریخ ثبت">${esc(formatDateTime24(o.createdAt))}</td><td data-label="وضعیت"><span class="badge ${d.storeReceiptConfirmedAt?'green':'orange'}">${d.storeReceiptConfirmedAt?'دریافت تأیید شد':'منتظر تأیید دریافت'}</span></td><td data-label="اقلام">${qty((d.lines||[]).length)} قلم</td><td data-label="سرویس">${run?`سرویس ${run===2?'دوم':'اول'}`:'—'}</td><td data-label="زمان تحویل">${esc(formatDateTime24(d.deliveredAt))}</td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="store-delivery-details" data-id="${esc(o.id)}" data-run="${run}">جزئیات سفارش</button></td></tr>`;
}
function stDeliveryTable(rows,delivered=false){
 if(!rows.length)return '';
 return `<div class="bt-table-wrap"><table class="bt-table st-delivery-table"><caption class="bt-caption">${delivered?'محموله‌های تحویل‌شده':'سفارش‌های در حال تحویل'}</caption><thead><tr><th scope="col">فروشگاه</th><th scope="col">شماره سفارش</th><th scope="col">تاریخ ثبت</th><th scope="col">وضعیت</th><th scope="col">اقلام</th><th scope="col">سرویس</th>${delivered?'<th scope="col">زمان تحویل</th>':''}<th scope="col">عملیات</th></tr></thead><tbody>${rows.map(delivered?st38DeliveredRow:st38Row).join('')}</tbody></table></div>`;
}

async function confirmStoreDelivery(el){
 const run=Number(el.dataset.run)||0,label=run===2?'سرویس دوم':run===1?'سرویس اول':'';
 if(!confirm(el.dataset.partial==='1'?'اقلام و وزن سفارش جزئی را کنترل کرده‌اید و دریافت آن را تأیید می‌کنید؟':run?`اقلام و وزن محمولهٔ ${label} را کنترل کرده‌اید و دریافت همین محموله را تأیید می‌کنید؟ (محمولهٔ دیگر جداگانه تأیید می‌شود)`:'اقلام و وزن تحویل‌شده را کنترل کرده‌اید و دریافت این سفارش را تأیید می‌کنید؟'))return;
 el.disabled=true;try{await api('/api/store/orders/'+encodeURIComponent(el.dataset.id)+'/confirm-receipt',{method:'POST',body:JSON.stringify(run?{run}:{})});closeModal();toast(el.dataset.partial==='1'?'دریافت سفارش جزئی تأیید شد.':run?`دریافت محمولهٔ ${label} تأیید شد.`:'دریافت سفارش تأیید شد.');await renderStorePortal();}catch(err){el.disabled=false;toast(err.message)}
}
document.addEventListener('click',e=>{const el=e.target.closest('#modal [data-action=store-confirm-delivery]');if(el)void confirmStoreDelivery(el)});

async function openStoreDeliveryDetails(id,run){
 const notices=captureEntityNotices('order',id,run||null);
 try{const o=(await api('/api/store/orders/'+encodeURIComponent(id))).order;const views=st38ViewsOf(o);const view=views.find(v=>Number(v.dispatch?.run||0)===Number(run||0));if(!view)return toast('این محموله در دسترس نیست.');openModal('جزئیات محموله', ['DELIVERED','SALES_FINALIZED','CLOSED'].includes(view.dispatch?.status)?st38DeliveredDetails(view):st38TransitDetails(view));finishEntityNotices(notices);return true;}
 catch(e){toast(e.message);return false;}
}

function st38TransitDetails(o){
 const d=o.dispatch||{},weights=d.shipmentWeights||{},ids=new Set(d.shipmentItemIds||[]);
 if(!ids.size&&d.run){for(const id of Object.keys(weights))ids.add(id);if(!ids.size)for(const i of o.items||[]){if((d.run===2?i.runR2:i.runR1)?.some(e=>Number(e.kg)>0))ids.add(i.id);}}
 const items=(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED'&&(!d.run||ids.has(i.id)));
 const weightOf=i=>Object.prototype.hasOwnProperty.call(weights,i.id)?qty(weights[i.id]):d.run?qty(((d.run===2?i.runR2:i.runR1)||[]).reduce((sum,e)=>sum+Number(e.kg||0),0)):'—';
 const rows=items.map((i,k)=>`<tr><td data-label="ردیف">${fa(String(k+1))}</td><td data-label="محصول">${esc(i.product?.name||'—')}</td><td data-label="مقدار درخواستی">${qty(i.requestedQty)} ${esc(i.requestedUnit||'')}</td><td data-label="${o.storeOrderKind==='PARTIAL'?'وزن محموله':'وزن این سرویس'} (کیلوگرم)">${weightOf(i)}</td><td data-label="توضیحات">${esc(i.description||'—')}</td></tr>`).join('');
 return `<div class="store-shipment-details"><div class="store-shipment-meta"><span>شماره سفارش: <b>${esc(fa(o.orderNo||'—'))}</b></span><span>${o.storeOrderKind==='PARTIAL'?'سفارش جزئی':d.run?`سرویس ${d.run===2?'دوم':'اول'}`:'محموله'}</span><span>راننده: <b>${esc(d.driverName||'—')}</b></span>${st38OrderBadge(o)}</div><div class="bt-table-wrap"><table class="bt-table store-shipment-table"><caption class="bt-caption">اقلام محموله فروشگاه</caption><thead><tr><th>ردیف</th><th>محصول</th><th>مقدار درخواستی</th><th>${o.storeOrderKind==='PARTIAL'?'وزن محموله':'وزن این سرویس'} (کیلوگرم)</th><th>توضیحات</th></tr></thead><tbody>${rows||'<tr><td colspan="5">قلمی برای این محموله ثبت نشده است.</td></tr>'}</tbody></table></div>${o.storeOrderKind==='PARTIAL'?storeRequestRowsHtml(o.storeRequestRows):''}<div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button>${o.transportWorkflow===1&&d.status==='IN_TRANSIT'?`<button type="button" class="btn btn-primary" data-action="store-confirm-delivery" data-partial="${o.storeOrderKind==='PARTIAL'?'1':'0'}" data-id="${esc(o.id)}" data-run="${Number(d.run)||0}">${o.storeOrderKind==='PARTIAL'?'تأیید دریافت سفارش':'تأیید دریافت همین سرویس'}</button>`:''}</div></div>`;
}
function st38OrderBadge(o){const d=o.dispatch;if(!d)return badge(o.status);const labels={ASSIGNED:'به راننده واگذار شد',DRIVER_EXIT_REPORTED:'منتظر تأیید خروج',IN_TRANSIT:'در حال ارسال'};const tone={ASSIGNED:'orange',DRIVER_EXIT_REPORTED:'purple',IN_TRANSIT:'blue'};return `<span class="badge ${tone[d.status]||'gray'}">${esc(labels[d.status]||d.status)}</span>`}
function st38Row(o){
 const run=Number(o.dispatch?.run)||0;
 const service=run?(o.storeOrderKind==='PARTIAL'?'سفارش جزئی':`سرویس ${run===2?'دوم':'اول'}`):'—';
 return `<tr data-order="${esc(o.id)}"><td data-label="فروشگاه">${esc(storeAwareOrderName(o))}</td><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="تاریخ ثبت">${esc(formatDateTime24(o.createdAt))}</td><td data-label="وضعیت">${st38OrderBadge(o)}</td><td data-label="اقلام">${qty(o.dispatch?dspScopedItems(o).length:activeItemsOf(o).length)} قلم</td><td data-label="سرویس">${service}</td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-secondary btn-sm" data-action="${o.dispatch?'store-delivery-details':'store-order-details'}" data-id="${esc(o.id)}" data-run="${run}">جزئیات سفارش</button></td></tr>`;
}

// All orders remain visible as one order even when their two services progress separately.
const ST_REGISTERED_LABELS={
  STORE_PENDING_SALES:'در انتظار بررسی فروش', SCHEDULED_REMOTE:'تأیید شده، در انتظار زمان ارسال به انبار',
  WAREHOUSE_PENDING:'در صف دریافت انبار', WAREHOUSE_PREPARING:'در حال آماده‌سازی در انبار',
  RETURNED_TO_SALES:'برگشت به فروش برای اصلاح', SETTLEMENT_PENDING:'آماده بررسی فروش',
  SETTLED:'تأیید شده', EXITED:'خروج ثبت شده', CLOSED:'تکمیل و بسته‌شده',
  CANCELLED:'لغو شده', OUT_OF_STOCK:'عدم موجودی', DELIVERED:'تحویل ثبت شده'
};
function stRegisteredRow(o){
  const showProgress=!['STORE_PENDING_SALES','CANCELLED'].includes(o.status);
  const items=(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED');
  const status=ST_REGISTERED_LABELS[o.status]||o.status||'نامشخص';
  const stageLabels={SENT_TO_SALES:'منتظر راننده',ASSIGNED:'راننده تعیین شد',DRIVER_EXIT_REPORTED:'منتظر خروج',IN_TRANSIT:'در مسیر',DELIVERED:'تحویل ثبت شد',SALES_FINALIZED:'نهایی‌شده نزد فروش',CLOSED:'نهایی‌شده نزد فروش',RECEIPT_CONFIRMED:'دریافت تأیید شد'};
  const service=(run)=>{const sr=o.storeRun||{},stage=run===1?sr.r1Stage:sr.r2Stage,full=run===1?sr.r1StageLabel:sr.r2StageLabel;const weights=(sr.items||[]).some(v=>Number(run===1?v.r1Kg:v.r2Kg)>0);const label=stage?(stageLabels[stage]||full||stage):(weights?'وزن‌کشی ثبت شده':'در انتظار');return `<span class="st-registered-service" title="${esc(full||label)}">سرویس ${run===1?'اول':'دوم'}: ${esc(label)}</span>`;};
  const extras=showProgress&&o.storeRun?.enabled?(o.storeOrderKind==='PARTIAL'?[{html:`سفارش جزئی · ${esc(stageLabels[o.storeRun.r1Stage]||ST_REGISTERED_LABELS[o.status]||'در حال پیگیری')}`}]:[{html:'سفارش روزانه'},{html:service(1)},{html:service(2)}]):[{html:o.storeOrderKind==='PARTIAL'?'سفارش جزئی':'سفارش روزانه'}];
  const addition=(o.storeAdditionRequests||[]).find(r=>['PENDING_SALES','PENDING_WAREHOUSE'].includes(r.status));
  const canAdd=o.storeOrderKind==='PARTIAL'&&['SCHEDULED_REMOTE','WAREHOUSE_PENDING','WAREHOUSE_PREPARING'].includes(o.status)&&!o.storeRunOps?.r1Shipment&&!o.storeRunOps?.finalizedAt&&!o.warehouseCompletedAt&&!o.storeWarehouseDocumentNos?.['1'];
  const actions=`<button type="button" class="btn btn-secondary btn-sm" data-action="store-order-details" data-id="${esc(o.id)}">${icon('eye',13)} جزئیات سفارش</button>${o.status==='STORE_PENDING_SALES'?`<button type="button" class="btn btn-secondary btn-sm" data-action="edit-store-order" data-id="${esc(o.id)}">${icon('edit',13)} ویرایش</button><button type="button" class="btn btn-ghost btn-sm danger-text" data-action="cancel-store-order" data-id="${esc(o.id)}">${icon('trash',13)} لغو</button>`:''}${canAdd&&!addition?`<button type="button" class="btn btn-primary btn-sm" data-action="store-request-addition" data-id="${esc(o.id)}">افزودن کالا</button>`:''}${addition?`<span class="badge orange">${addition.status==='PENDING_SALES'?'افزودن کالا در انتظار فروش':'افزودن کالا در انتظار انبار'}</span>`:''}`;
  return `<tr data-store-order-id="${esc(o.id)}" data-order="${esc(o.id)}"><td data-label="فروشگاه">${esc(storeAwareOrderName(o))}</td><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="تاریخ ثبت">${esc(formatDateTime24(o.createdAt))}</td><td data-label="وضعیت"><span class="badge ${o.status==='CANCELLED'?'gray':o.status==='CLOSED'?'green':'blue'}">${esc(status)}</span></td><td data-label="اقلام">${qty(items.length)} قلم</td><td data-label="پیگیری"><div class="st-table-progress">${extras.map(x=>x.html).join(' ')}</div></td><td data-label="عملیات" class="bt-col-actions"><div class="st-table-actions">${actions}</div></td></tr>`;
}
function stRegisteredTable(rows){
 if(!rows.length)return '';
 return `<div class="bt-table-wrap"><table class="bt-table st-registered-table"><caption class="bt-caption">سفارش‌های ثبت‌شده فروشگاه</caption><thead><tr><th scope="col">فروشگاه</th><th scope="col">شماره سفارش</th><th scope="col">تاریخ ثبت</th><th scope="col">وضعیت</th><th scope="col">اقلام</th><th scope="col">پیگیری</th><th scope="col">عملیات</th></tr></thead><tbody>${rows.map(stRegisteredRow).join('')}</tbody></table></div>`;
}

function storeScopeQuery(){return app.user.roleCode==='admin'&&app.storeBranchNo?'&branchNo='+encodeURIComponent(app.storeBranchNo):'';}
function storeScopeHeader(){
 if(app.user.roleCode!=='admin')return '';
 return `<section class="sd-panel sd-pad"><label for="adminStoreBranch">نمایش اطلاعات شعبه</label><select id="adminStoreBranch"><option value="">همه شعبه‌ها (شامل سوابق قدیمی)</option>${(app.storeScope?.branches||[]).map(b=>`<option value="${esc(b.branchNo)}" ${String(b.branchNo)===String(app.storeBranchNo)?'selected':''}>${esc(b.storeName)}</option>`).join('')}</select></section>`;
}
function bindStoreScope(){const el=$('#adminStoreBranch');if(el)el.onchange=async()=>{app.storeBranchNo=el.value;app.storeRegisteredOffset=0;await renderStorePortal();};}
async function storeAllOrders(){
 const orders=[];let offset=0;
 for(;;){const data=await api('/api/store/orders?limit=100&offset='+offset+storeScopeQuery());orders.push(...data.orders);offset+=data.orders.length;if(offset>=data.total||!data.orders.length)return {orders};}
}
async function renderStoreRegistered(){
  const root=$('#content'),limit=25,generation=app.storeRenderGeneration;
  let offset=Math.max(0,Math.floor(Number(app.storeRegisteredOffset)||0)),seq=0,signature='';
  root.innerHTML=`<section class="sd-panel st-registered-panel"><header class="st-registered-head"><div><h2>سفارش‌های ثبت‌شده</h2><p class="st38-store-identity">${esc(app.user.roleCode==='admin'?(app.storeScope?.branches.find(b=>String(b.branchNo)===String(app.storeBranchNo))?.storeName||'همه شعبه‌های فروشگاه'):app.user.storeName||app.user.fullName||'فروشگاه')}</p><p>از بررسی فروش تا آماده‌سازی انبار و تحویل؛ هر سفارش و سرویس‌های آن را اینجا پیگیری کنید.</p></div><span class="st-registered-live" role="status">در حال دریافت اطلاعات…</span></header><p class="st-registered-scroll-hint">برای دیدن تمام ستون‌ها در صفحهٔ کوچک، فهرست را افقی جابه‌جا کنید.</p><div class="st-registered-scroll" tabindex="0" role="region" aria-label="فهرست افقی سفارش‌ها"><div id="storeRegisteredList" class="st-registered-list"><div class="empty">در حال دریافت سفارش‌ها…</div></div></div><div id="storeRegisteredPages" class="st-registered-pages"></div></section>`;
  root.insertAdjacentHTML('afterbegin',storeScopeHeader());bindStoreScope();
  const current=()=>generation===app.storeRenderGeneration&&root.isConnected && app.page==='store' && app.sub.store==='registered';
  async function refresh(force=false){
    const request=++seq;
    try{
      const data=await api(`/api/store/orders?offset=${offset}&limit=${limit}${storeScopeQuery()}`);
      if(!current()||request!==seq)return;
      if(offset>0&&offset>=data.total){offset=data.total?Math.floor((data.total-1)/limit)*limit:0;app.storeRegisteredOffset=offset;return refresh(true);}
      const nextSignature=JSON.stringify([data.orders,data.total,offset]);
      if(force||nextSignature!==signature){
        const focused=document.activeElement, focusedCard=focused?.closest?.('[data-store-order-id]');
        const focusOrder=focusedCard?.dataset.storeOrderId, focusAction=focused?.dataset?.action;
        const focusPage=focused?.dataset?.registeredPage;
        signature=nextSignature;
        $('#storeRegisteredList').innerHTML=stRegisteredTable(data.orders||[])||sdEmpty('receipt','هنوز سفارشی ثبت نشده است','سفارش‌های ثبت‌شدهٔ همین حساب فروشگاه در این بخش نمایش داده می‌شوند.');
        $('#storeRegisteredPages').innerHTML=`<button type="button" class="btn btn-secondary btn-sm" data-registered-page="previous" ${offset===0?'disabled':''}>صفحه قبل</button><span>${data.total?`${qty(offset+1)} تا ${qty(Math.min(offset+limit,data.total))} از ${qty(data.total)} سفارش`:'۰ سفارش'}</span><button type="button" class="btn btn-secondary btn-sm" data-registered-page="next" ${offset+limit>=data.total?'disabled':''}>صفحه بعد</button>`;
        if(focusOrder){const card=[...root.querySelectorAll('[data-store-order-id]')].find(x=>x.dataset.storeOrderId===focusOrder);const button=[...(card?.querySelectorAll('[data-action]')||[])].find(x=>x.dataset.action===focusAction)||card?.querySelector('[data-action=store-order-details]');button?.focus({preventScroll:true});}
        else if(focusPage){const button=[...root.querySelectorAll('[data-registered-page]')].find(x=>x.dataset.registeredPage===focusPage&&!x.disabled);button?.focus({preventScroll:true});}
      }
      root.querySelector('.st-registered-live').textContent='به‌روزرسانی خودکار • '+formatDateTime24(new Date().toISOString());
    }catch(e){if(current()&&request===seq){root.querySelector('.st-registered-live').textContent='به‌روزرسانی ناموفق؛ تلاش مجدد خودکار';if(!signature)$('#storeRegisteredList').innerHTML=`<div class="empty">دریافت سفارش‌ها ناموفق بود: ${esc(e.message)}</div>`;}}
  }
  root.onclick=async e=>{
    const page=e.target.closest('[data-registered-page]');
    if(page){offset=Math.max(0,offset+(page.dataset.registeredPage==='next'?limit:-limit));app.storeRegisteredOffset=offset;signature='';await refresh(true);return;}
    const el=e.target.closest('[data-action]');if(!el)return;
    if(el.dataset.action==='store-order-details')return openStoreOrderDetails(el.dataset.id);
    if(el.dataset.action==='edit-store-order')return openStoreOrderEdit(el.dataset.id);
    if(el.dataset.action==='store-request-addition')return openStoreAddition(el.dataset.id);
    if(el.dataset.action==='cancel-store-order'&&confirm('این سفارش لغو شود؟')){el.disabled=true;try{await api('/api/store/orders/'+encodeURIComponent(el.dataset.id)+'/cancel',{method:'POST',body:JSON.stringify({reason:'لغو توسط فروشگاه'})});toast('سفارش لغو شد.');el.blur();await refresh(true);}catch(err){el.disabled=false;toast(err.message);}}
  };
  await refresh(true);
  if(current()){let polling=false;app.timer=setInterval(()=>{if(polling)return;polling=true;refresh().finally(()=>{polling=false;});},3500);}
}

async function renderStorePortal(){
  app.storeRenderGeneration=(app.storeRenderGeneration||0)+1;
  if(app.timer){clearInterval(app.timer);app.timer=null}
  if(app.user.roleCode==='admin')app.storeScope=await api('/api/store/scope');
  if(app.sub.store==='registered')return renderStoreRegistered();
  const d=await storeAllOrders(); const orders=d.orders||[];const isPartial=app.sub.store==='partial';const isDeliveryView=app.sub.store==='delivery';app.storePortalTab=isDeliveryView?'delivery':'create';app.storeDeliveryTab=app.storeDeliveryTab==='delivered'?'delivered':'inProgress';
  const deliveredViews=orders.flatMap((o)=>st38ViewsOf(o)).filter((v)=>v.dispatch&&['DELIVERED','SALES_FINALIZED','CLOSED'].includes(v.dispatch.status)).sort((a,b)=>String(b.dispatch.deliveredAt||'').localeCompare(String(a.dispatch.deliveredAt||''))); // v37.5.0 — هر محموله کارت جدا
  const transitOrders=orders.flatMap(o=>st38ViewsOf(o)).filter(v=>v.dispatch&&['ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT'].includes(v.dispatch.status)).sort((a,b)=>String(b.dispatch.assignedAt||b.updatedAt||'').localeCompare(String(a.dispatch.assignedAt||a.updatedAt||'')));
  const allDispatchViews=orders.flatMap((o)=>st38ViewsOf(o));
  const stagedOrders=new Set(orders.filter((o)=>{ const vs=allDispatchViews.filter((v)=>v.id===o.id); return vs.some((v)=>v.dispatch&&['DELIVERED','SALES_FINALIZED','CLOSED','ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT'].includes(v.dispatch.status))||o.dispatch&&['ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT'].includes(o.dispatch.status); }));
  const incomingOrders=orders.filter(o=>!stagedOrders.has(o)&&o.status!=='CANCELLED'&&o.approvalStatus!=='CANCELLED').sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  $('#content').innerHTML=`<div style="display:grid;gap:18px">${storeScopeHeader()}
    <section class="sd-panel"><div class="sd-pad st38-hero">
      <div class="sd-head-main" style="align-items:center"><span class="sd-head-ico" style="background:var(--orange-bg);color:var(--orange)">${icon('sales',20)}</span><div><h2 style="font-size:20px;font-weight:1000;margin:0">ثبت سفارش و پیگیری تحویل</h2><p style="margin:4px 0 0;font-size:13px;color:var(--muted)">ثبت سفارش توسط فروشگاه، بررسی توسط واحد فروش و ورود به انبار پس از تعیین زمان ارسال.</p></div></div>
      <div class="st38-hero-badge"><span>${esc(app.user.roleCode==='admin'?(app.storeScope?.branches.find(b=>String(b.branchNo)===String(app.storeBranchNo))?.storeName||'همه شعبه‌های فروشگاه'):app.user.storeName||app.user.fullName||'فروشگاه')}</span><small>دسترسی اختصاصی فروشگاه</small></div>
    </div></section>
    ${!isDeliveryView?`    <div class="st38-grid">
      <section class="sd-panel">
        <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico">${icon('plus',19)}</span><div><h2>ثبت سفارش ${isPartial?'جزئی':'روزانه'}</h2><p>${isPartial?'این سفارش مستقل از سرویس‌های سفارش روزانه و بدون تسویه مالی است.':'سفارش روزانه در دو سرویس آماده و ارسال می‌شود.'} زمان ارسال توسط فروش تعیین می‌شود.</p></div></div></div>
        <form id="storeOrderForm" style="display:contents">${app.user.roleCode==='admin'?`<div class="field"><label for="adminStoreOwner">ثبت سفارش برای حساب فروشگاه</label><select id="adminStoreOwner" name="storeId" required><option value="">انتخاب حساب مقصد</option>${(app.storeScope?.stores||[]).filter(u=>u.isActive&&(!app.storeBranchNo||String(u.branchNo)===String(app.storeBranchNo))).map(u=>`<option value="${esc(u.id)}">${esc(u.storeName)}</option>`).join('')}</select></div>`:''}
          <div class="sd-pad" style="padding-bottom:6px"><div class="store-partial-customer-row">
            ${isPartial?`<div class="field"><label for="storePurpose">هدف سفارش جزئی</label><select id="storePurpose" name="storePurpose"><option value="CUSTOMER">مشتری مشخص</option><option value="STOCK">تأمین تکمیلی فروشگاه</option></select></div>`:''}
            ${isPartial?`<div class="gt-grid2" data-store-customer>
              <div class="field"><label for="storeCustomerName">نام مشتری</label><div class="input-shell"><span>${icon('user',16)}</span><input id="storeCustomerName" name="name" required placeholder="نام و نام خانوادگی مشتری"></div></div>
              <div class="field"><label for="storeCustomerPhone">شماره تماس</label><div class="input-shell"><span>${icon('phone',16)}</span><input id="storeCustomerPhone" name="phone" required inputmode="tel" placeholder="۰۹۱۲ ..."></div></div>
            </div>`:''}
            </div><div class="st38-lock" style="margin-top:13px"><span>${icon('lock',17)}</span><div><strong>زمان ارسال</strong><span>توسط واحد فروش تعیین می‌شود؛ فروشگاه مستقیم به انبار دسترسی ندارد.</span></div></div>
          </div>
          <div class="sd-lines-head"><div><h3>اقلام سفارش</h3><p>محصول، مقدار، واحد و توضیح هر ردیف.</p></div></div>
          <div class="sd-lines-body"><div id="store-lines" class="sd-lines"></div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:13px;flex-wrap:wrap"><button type="button" class="btn btn-secondary" data-action="store-add-line">${icon('plus',15)} افزودن ردیف</button><small style="font-size:11px;color:var(--muted)">واحدهای مجاز: کیلوگرم، بسته، عدد، کارتن</small></div>
            <div class="field" style="margin-top:15px"><label for="storeOrderNotes">یادداشت سفارش</label><textarea id="storeOrderNotes" name="notes" rows="2" maxlength="1000" placeholder="توضیحات برای فروش یا انبار..."></textarea></div>
          </div>
          <div class="sd-submit-bar"><div><strong style="font-size:13.5px">ارسال برای تأیید فروش</strong><small style="display:block;font-size:11px;color:var(--muted)">فروشگاه مستقیماً به انبار دسترسی ندارد.</small></div><button class="btn btn-primary btn-lg" type="submit">${icon('send',16)} ثبت سفارش</button></div>
        </form>
      </section></div><section class="sd-panel st-registered-panel"><header class="st-registered-head"><div><h2>سفارش‌های ${isPartial?'جزئی':'روزانه'} ثبت‌شده</h2><p>هر سفارش را به‌صورت مستقل پیگیری کنید.</p></div></header><div class="st-registered-scroll"><div id="storeKindList" class="st-registered-list" aria-live="polite">در حال دریافت…</div></div><div id="storeKindPages" class="st-registered-pages"></div></section>`:''}    ${isDeliveryView?`<section class="st38-delivery-panel sd-panel"><header class="st38-delivery-heading"><div><span class="eyebrow">STORE DELIVERY</span><h2>تحویل سفارش‌ها</h2><p>وضعیت ارسال سفارش‌ها و محموله‌های فروشگاه را از این بخش پیگیری کنید.</p></div></header><nav class="store-delivery-tabs" aria-label="وضعیت تحویل"><button type="button" class="${app.storeDeliveryTab==='inProgress'?'active':''}" data-store-delivery-tab="inProgress">در حال تحویل <b>${qty(transitOrders.length)}</b></button><button type="button" class="${app.storeDeliveryTab==='delivered'?'active':''}" data-store-delivery-tab="delivered">تحویل شده <b>${qty(deliveredViews.length)}</b></button></nav><div id="storeDeliveryRows" class="st38-delivery-list">${app.storeDeliveryTab==='delivered'?stDeliveryTable(deliveredViews,true)||sdEmpty('check','محموله‌ای تحویل نشده است','پس از ثبت تحویل راننده در این بخش نمایش داده می‌شود.'):stDeliveryTable(transitOrders)||sdEmpty('truck','سفارشی در حال تحویل نیست','سفارش پس از واگذاری به راننده در این بخش قرار می‌گیرد.')}</div></section>`:''}
  </div>`;
  bindStoreScope();
  if(isDeliveryView){$('#content #storeOrderForm')?.remove();$('#content .st38-grid')?.remove();}else{app.storeDraft=[defaultOrderLine()];renderOrderLineArea('store','storeDraft');}
  let kindOffset=0,kindSeq=0;
  async function loadKindList(){
    const request=++kindSeq,host=$('#storeKindList');if(!host)return;
    try{const data=await api(`/api/store/orders?kind=${isPartial?'PARTIAL':'BULK'}&offset=${kindOffset}&limit=25${storeScopeQuery()}`);
      if(request!==kindSeq||!host.isConnected)return;
      if(kindOffset>0&&kindOffset>=data.total){kindOffset=data.total?Math.floor((data.total-1)/25)*25:0;return loadKindList();}
      host.innerHTML=stRegisteredTable(data.orders||[])||'<div class="empty">سفارشی از این نوع ثبت نشده است.</div>';
      $('#storeKindPages').innerHTML=`<button type="button" class="btn btn-secondary btn-sm" data-kind-page="prev" ${kindOffset===0?'disabled':''}>صفحه قبل</button><span>${data.total?`${qty(kindOffset+1)} تا ${qty(Math.min(kindOffset+25,data.total))} از ${qty(data.total)}`:'۰ سفارش'}</span><button type="button" class="btn btn-secondary btn-sm" data-kind-page="next" ${kindOffset+25>=data.total?'disabled':''}>صفحه بعد</button>`;
    }catch(err){if(host.isConnected)host.innerHTML=`<div role="alert">دریافت سفارش‌ها ناموفق بود: ${esc(err.message)}</div>`;}
  }
  if(!isDeliveryView)void loadKindList();
  $('#content').onclick=async e=>{
    const pager=e.target.closest('[data-kind-page]');if(pager){kindOffset=Math.max(0,kindOffset+(pager.dataset.kindPage==='next'?25:-25));return loadKindList();}
    const tab=e.target.closest('[data-store-delivery-tab]');if(tab){app.storeDeliveryTab=tab.dataset.storeDeliveryTab==='delivered'?'delivered':'inProgress';app.storePortalTab='delivery';await renderStorePortal();return;}
    const el=e.target.closest('[data-action]'); if(!el)return; const a=el.dataset.action;
    if(a==='store-add-line'){app.storeDraft.push(defaultOrderLine());renderOrderLineArea('store','storeDraft');}
    else if(a==='op-remove-line'&&el.dataset.prefix==='store'){const i=Number(el.dataset.index);if(app.storeDraft.length>1){app.storeDraft.splice(i,1);renderOrderLineArea('store','storeDraft')}}
    else if(a==='op-pick-product'&&el.dataset.prefix==='store'){pickOperationProduct(Number(el.dataset.index),el.dataset.productId,el.dataset.label,el.dataset.quick,'store','storeDraft')}
    else if(a==='store-order-details'){return openStoreOrderDetails(el.dataset.id)}
    else if(a==='store-delivery-details'){return openStoreDeliveryDetails(el.dataset.id,Number(el.dataset.run)||0)}
    else if(a==='edit-store-order'){return openStoreOrderEdit(el.dataset.id)}
    else if(a==='store-request-addition'){return openStoreAddition(el.dataset.id)}
    else if(a==='store-confirm-delivery'){return confirmStoreDelivery(el)}
    else if(a==='cancel-store-order'){if(confirm('این سفارش لغو شود؟')){try{await api('/api/store/orders/'+el.dataset.id+'/cancel',{method:'POST',body:JSON.stringify({reason:'لغو توسط فروشگاه'})});toast('سفارش لغو شد.');await renderStorePortal()}catch(err){toast(err.message)}}}
  };
  const purpose=$('#storePurpose');if(purpose){const sync=()=>{const stock=purpose.value==='STOCK',fields=$('[data-store-customer]');fields.hidden=stock;fields.style.display=stock?'none':'';fields.querySelectorAll('input').forEach(x=>{x.required=!stock;x.disabled=stock;});};purpose.addEventListener('change',sync);sync();}
  $('#storeOrderForm')?.addEventListener('submit',async e=>{
    e.preventDefault(); const f=Object.fromEntries(new FormData(e.target));
    const items=app.storeDraft.filter(x=>x.productId&&n(x.requestedQty)>0).map(x=>({productId:x.productId,requestedQty:n(x.requestedQty),requestedUnit:x.requestedUnit,description:String(x.description||'').trim()}));
    if(!items.length)return toast('حداقل یک محصول معتبر وارد کنید.');
    try{ await api('/api/store/orders',{method:'POST',body:JSON.stringify({...f,items,storeOrderKind:isPartial?'PARTIAL':'BULK'})}); toast('سفارش ثبت و برای بررسی فروش ارسال شد.'); app.storeRegisteredOffset=0; await go('store','registered'); }catch(err){ toast(err.message); }
  });
  app.timer=setInterval(async()=>{try{if(document.activeElement?.closest?.('#storeOrderForm, #storeKindList, #storeKindPages'))return;if(!isDeliveryView)void loadKindList();const x=(await storeAllOrders()).orders||[];const done=x.flatMap((o)=>st38ViewsOf(o)).filter(v=>v.dispatch&&['DELIVERED','SALES_FINALIZED','CLOSED'].includes(v.dispatch.status)).sort((a,b)=>String(b.dispatch.deliveredAt||'').localeCompare(String(a.dispatch.deliveredAt||'')));const moving=x.filter(o=>o.dispatch&&['ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT'].includes(o.dispatch.status)).sort((a,b)=>String(b.dispatch.assignedAt||b.updatedAt||'').localeCompare(String(a.dispatch.assignedAt||a.updatedAt||'')));const staged=new Set(x.filter((o)=>{const vs=st38ViewsOf(o);return vs.some(v=>v.dispatch&&['DELIVERED','SALES_FINALIZED','CLOSED','ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT'].includes(v.dispatch.status))||(o.dispatch&&['ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT'].includes(o.dispatch.status));}));const incoming=x.filter(o=>!staged.has(o)&&o.status!=='CANCELLED'&&o.approvalStatus!=='CANCELLED').sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));const deliveryEl=$('#storeDeliveryRows');if(deliveryEl){const transitViews=x.flatMap(o=>st38ViewsOf(o)).filter(v=>v.dispatch&&['ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT'].includes(v.dispatch.status));const deliveredNow=x.flatMap(o=>st38ViewsOf(o)).filter(v=>v.dispatch&&['DELIVERED','SALES_FINALIZED','CLOSED'].includes(v.dispatch.status));deliveryEl.innerHTML=app.storeDeliveryTab==='delivered'?(stDeliveryTable(deliveredNow,true)||sdEmpty('check','محموله‌ای تحویل نشده است','پس از ثبت تحویل راننده در این بخش نمایش داده می‌شود.')):(stDeliveryTable(transitViews)||sdEmpty('truck','سفارشی در حال تحویل نیست','سفارش پس از واگذاری به راننده در این بخش قرار می‌گیرد.'));const dtabs=$$('.store-delivery-tabs b');if(dtabs[0])dtabs[0].textContent=qty(transitViews.length);if(dtabs[1])dtabs[1].textContent=qty(deliveredNow.length);}const inEl=$('#storeIncomingList'),movingEl=$('#storeTransitList'),doneEl=$('#storeDeliveredList');if(inEl)inEl.innerHTML=stDeliveryTable(incoming)||sdEmpty('receipt','سفارش ورودی ندارید','سفارش‌های تازه پس از ثبت در این ستون دیده می‌شوند.');if(movingEl)movingEl.innerHTML=stDeliveryTable(moving)||sdEmpty('truck','سفارشی در مسیر نیست','پس از واگذاری سفارش به راننده در این ستون ظاهر می‌شود.');if(doneEl)doneEl.innerHTML=stDeliveryTable(done,true)||sdEmpty('check','سفارشی تحویل نشده است','پس از ثبت تحویل راننده در این ستون نمایش داده می‌شود.');const counts=$$('.st38-store-stage .sd-count strong');if(counts[0])counts[0].textContent=qty(incoming.length);if(counts[1])counts[1].textContent=qty(moving.length);if(counts[2])counts[2].textContent=qty(done.length);}catch{}},3500);
}

/* ================================================================
   قدم ۴ — داشبورد + گزارش‌ها + مدیریت (v38)
   ================================================================ */


async function openStoreAddition(id){
 try{
  const o=(await api('/api/store/orders/'+encodeURIComponent(id))).order;
  app.storeAdditionDraft=[defaultOrderLine()];
  openModal('افزودن کالا به سفارش '+fa(o.orderNo||''),`<form id="storeAdditionForm"><p>کالاهای جدید برای تأیید به فروش و سپس انبار ارسال می‌شوند. محصول تکراری با واحد یکسان به ردیف موجود اضافه می‌شود؛ واحد متفاوت ردیف مستقل دارد. وزن‌کشی همه ردیف‌ها به کیلوگرم است.</p><div id="store-addition-lines"></div><button type="button" class="btn btn-secondary" id="storeAdditionAdd">افزودن ردیف</button><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">انصراف</button><button class="btn btn-primary" type="submit">ارسال به فروش</button></div></form>`);
  const paint=()=>{const el=$('#store-addition-lines');if(el){el.innerHTML=renderDraftLinesTable(app.storeAdditionDraft.map((x,i)=>renderProductPickerLine(x,i,'storeaddition')));bindOperationLines('storeaddition','storeAdditionDraft')}};paint();
  $('#storeAdditionAdd').onclick=()=>{app.storeAdditionDraft.push(defaultOrderLine());paint()};
  $('#storeAdditionForm').addEventListener('click',e=>{const p=e.target.closest('[data-action=op-pick-product]');if(p){pickOperationProduct(+p.dataset.index,p.dataset.productId,p.dataset.label,p.dataset.quick,'storeaddition','storeAdditionDraft');return;}const x=e.target.closest('[data-action=op-remove-line]');if(x){app.storeAdditionDraft.splice(+x.dataset.index,1);if(!app.storeAdditionDraft.length)app.storeAdditionDraft.push(defaultOrderLine());paint();}});
  $('#storeAdditionForm').addEventListener('submit',async e=>{e.preventDefault();const lines=app.storeAdditionDraft.map(x=>({productId:x.productId,requestedQty:n(x.requestedQty),requestedUnit:x.requestedUnit,description:String(x.description||'').trim()}));if(lines.some(x=>!x.productId||!(x.requestedQty>0)))return toast('همه ردیف‌ها باید محصول و مقدار معتبر داشته باشند.');const btn=e.submitter;btn.disabled=true;try{await api('/api/store/orders/'+encodeURIComponent(id)+'/addition-requests',{method:'POST',body:JSON.stringify({items:lines})});closeModal();toast('درخواست به فروش ارسال شد.');await renderStorePortal();}catch(err){btn.disabled=false;toast(err.message);}});
 }catch(e){toast(e.message);}
}
function mg38Kpi(label,value,hint,ico,tone,text=false){
  return `<article class="mg38-kpi t-${tone}"><span class="mg38-accent" aria-hidden="true"></span><span class="mg38-ico">${icon(ico,20)}</span><div class="mg38-copy"><span class="mg38-lbl">${esc(label)}</span><b class="mg38-val">${text?value:qty(value)}</b><small>${esc(hint)}</small></div></article>`;
}

/* ---------------- داشبورد ---------------- */
async function renderDashboard(){
  if(app.timer){clearInterval(app.timer);app.timer=null}
  const d=await api('/api/dashboard'); const c=d.counts||{};
  $('#content').innerHTML=`<div style="display:grid;gap:16px">
    <div class="db38-hero">
      <div class="db38-hero-right"><span class="db38-logo db38-logo-img"><img src="/logo.png" alt="بابل طیور"></span><div><h2>مرکز کنترل عملیات</h2><p>نمای لحظه‌ای از ورود مشتری، فروش، انبار، تسویه و خروج؛ با تمرکز روی اقدام بعدی هر واحد.</p></div></div>
      <div class="db38-hero-left">
        <span class="db38-live"><i></i> نمای زندهٔ سامانه</span>
        <div class="db38-date"><small>امروز</small><b>${esc(todayText())}</b></div>
        <button class="btn btn-primary" data-page="reports">${icon('reports',16)} گزارش مدیریتی</button>
        <button class="btn btn-secondary" data-page="admin">${icon('settings',16)} تنظیمات</button>
      </div>
    </div>
    <div class="mg38-kpis">
      ${mg38Kpi('ورودی امروز',c.visitsToday||0,'مراجعه ثبت‌شده در نگهبانی','gate','red')}
      ${mg38Kpi('منتظر فروش',c.waitingSales||0,'مشتری آماده ثبت سفارش','sales','blue')}
      ${mg38Kpi('در صف انبار',c.pendingWarehouse||0,'سفارش آماده اقدام انبار','warehouse','orange')}
      ${mg38Kpi('آماده خروج',c.readyExit||0,'فاکتور نهایی و آماده کنترل','check','green')}
      ${mg38Kpi('برنامه آینده',c.remoteScheduled||0,'سفارش‌های زمان‌بندی‌شده','calendar','purple')}
    </div>
    <section class="dbc-section" id="dbCharts" aria-label="تحلیل محصولات">${dbcShell()}</section>
    <div class="db38-grid db38-grid-single">
      <section class="sd-panel">
        <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico" style="background:var(--blue-bg);color:var(--blue)">${icon('receipt',19)}</span><div><h2>آخرین فعالیت‌ها</h2><p>تازه‌ترین سفارش‌های ثبت‌شده در سامانه.</p></div></div><button class="btn btn-ghost btn-sm" data-page="reports">مشاهده همه ${icon('arrow',13)}</button></div>
        <div class="sd-pad"><div class="db38-activity">${(d.recent||[]).slice(0,7).map(o=>`<div class="db38-act"><span class="db38-aico">${icon(o.orderType==='REMOTE'||o.orderType==='STORE'?'calendar':'receipt',16)}</span><div><b>${esc(storeAwareOrderName(o))}</b><small>${orderKindLabel(o)} ${badge(o.status)}</small></div><time>${formatDateTime24(o.createdAt)}</time></div>`).join('')||sdEmpty('receipt','فعالیتی ثبت نشده است','با ثبت اولین مراجعه یا سفارش، رویدادها در اینجا دیده می‌شوند.')}</div></div>
      </section>
    </div>
  </div>`;
  dbcLoad();
}

/* ---------------- v37.3.18 — نمودارهای داشبورد به تفکیک محصول ----------------
   جایگزین بخش «جریان عملیات». سه نمودار میله‌ای افقی (بدون کتابخانهٔ بیرونی، کاملاً آفلاین):
   ۱) فروش (مبلغ خالص فاکتورهای تسویه‌شده)  ۲) سفارش‌ها (تعداد سفارش)  ۳) تحویل انبار (کیلوگرم) */
app.dbc = app.dbc || { days:30, seq:0 };
const DBC_TOP = 7;
function dbcMoney(v){
  const n=Number(v||0), f=(x,d=1)=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:d}).format(x);
  if(n>=1e10) return `${f(n/1e9,2)} میلیارد`;
  if(n>=1e9) return `${f(n/1e6,0)} میلیون`;
  if(n>=1e6) return `${f(n/1e6)} میلیون`;
  return qty(n);
}
function dbcShell(){
  const ranges=[[1,'امروز'],[7,'۷ روز'],[30,'۳۰ روز'],[90,'۹۰ روز']];
  return `<div class="dbc-head"><div class="sd-head-main"><span class="sd-head-ico">${icon('reports',19)}</span><div><h2>تحلیل محصولات</h2><p id="dbcRangeText">آمار فروش، سفارش‌ها و تحویل انبار به تفکیک محصول</p></div></div>
    <div class="dbc-ranges" role="group" aria-label="بازهٔ زمانی نمودارها">${ranges.map(([d,l])=>`<button type="button" class="dbc-range ${app.dbc.days===d?'active':''}" data-dbc-days="${d}">${l}</button>`).join('')}</div></div>
    <div class="dbc-grid" id="dbcGrid">${['sales','orders','warehouse'].map(k=>`<article class="dbc-card t-${k} is-loading"><div class="dbc-skel"></div><div class="dbc-skel"></div><div class="dbc-skel"></div></article>`).join('')}</div>`;
}
function dbcBars(rows, valueOf, labelOf, subOf, tone){
  if(!rows.length) return `<div class="dbc-empty">${icon('reports',22)}<b>داده‌ای در این بازه نیست</b><span>بازهٔ بلندتری انتخاب کنید.</span></div>`;
  let list=rows.slice(0,DBC_TOP);
  const rest=rows.slice(DBC_TOP);
  const total=rows.reduce((t,r)=>t+valueOf(r),0)||1;
  if(rest.length){ list=list.concat([{ _other:true, productName:`سایر محصولات (${fa(rest.length)} کالا)`, _v:rest.reduce((t,r)=>t+valueOf(r),0), _rows:rest }]); }
  const max=Math.max(1,...list.map(r=>r._other?r._v:valueOf(r)));
  return `<ol class="dbc-bars">${list.map((r,i)=>{
    const v=r._other?r._v:valueOf(r); const pct=Math.round(v/total*100); const w=Math.max(2,Math.round(v/max*100));
    const tip=r._other?r._rows.map(x=>`${x.productName}: ${labelOf(x)}`).join('\n'):`${r.productName}\n${labelOf(r)}${subOf?` • ${subOf(r)}`:''}`;
    return `<li class="dbc-bar ${r._other?'is-other':''}" title="${esc(tip)}">
      <div class="dbc-bar-top"><span class="dbc-rank">${r._other?'…':fa(i+1)}</span><span class="dbc-name">${esc(r.productName)}</span><b class="dbc-val">${r._other?esc(labelOf({_sum:v})):esc(labelOf(r))}</b></div>
      <div class="dbc-track"><i style="width:${w}%"></i><em>${fa(pct)}٪</em></div>
      ${!r._other&&subOf?`<small class="dbc-sub">${esc(subOf(r))}</small>`:''}
    </li>`; }).join('')}</ol>`;
}
function dbcUnits(u){ return Object.entries(u||{}).filter(([,v])=>v>0).map(([k,v])=>`${qty(v)} ${k}`).join(' + ') || '—'; }
function dbcRender(d){
  const S=d.sales, O=d.orders, W=d.warehouse;
  const card=(k,ico,title,metric,totalHtml,totalSub,body)=>`<article class="dbc-card t-${k}">
    <header class="dbc-card-head"><span class="dbc-ico">${icon(ico,18)}</span><div><h3>${title}</h3><small>${metric}</small></div></header>
    <div class="dbc-total"${k==='sales'?` title="${esc(money(S.totalAmount))}"`:''}><b>${totalHtml}</b><span>${totalSub}</span></div>${body}</article>`;
  const salesLabel=(r)=>r._sum!=null?`${dbcMoney(r._sum)} ریال`:`${dbcMoney(r.amount)} ریال`;
  const ordersLabel=(r)=>r._sum!=null?`${qty(r._sum)} سفارش`:`${qty(r.orders)} سفارش`;
  const whLabel=(r)=>r._sum!=null?`${qty(r._sum)} کیلوگرم`:`${qty(r.kg)} کیلوگرم`;
  $('#dbcGrid').innerHTML=
    card('sales','sales','آمار فروش به تفکیک محصول','مبلغ خالص فاکتورهای تسویه‌شده (پس از کسر مرجوعی)',`${dbcMoney(S.totalAmount)} <em>ریال</em>`,`${qty(S.invoices)} فاکتور • ${qty(S.totalKg)} کیلوگرم`,
      dbcBars(S.rows,r=>r.amount,salesLabel,r=>`${qty(r.kg)} کیلوگرم • ${qty(r.orders)} فاکتور`))
    +card('orders','receipt','آمار سفارشات به تفکیک محصول','تعداد سفارش‌های ثبت‌شده‌ای که هر محصول را دارند',`${qty(O.totalOrders)} <em>سفارش</em>`,`${qty(O.totalLines)} ردیف کالا`,
      dbcBars(O.rows,r=>r.orders,ordersLabel,r=>`درخواستی: ${dbcUnits(r.units)}`))
    +card('warehouse','warehouse','تحویل انبار به تفکیک محصول','وزن نهایی ثبت‌شده در انبار',`${qty(W.totalKg)} <em>کیلوگرم</em>`,`${qty(W.orders)} سفارش${W.outOfStock?` • ${qty(W.outOfStock)} قلم ناموجود`:''}`,
      dbcBars(W.rows.filter(r=>r.kg>0||r.outOfStock),r=>r.kg,whLabel,r=>`${qty(r.orders)} سفارش${r.outOfStock?` • ${qty(r.outOfStock)} بار ناموجود`:''}`));
  const t=$('#dbcRangeText'); if(t) t.textContent=d.from===d.to?`امروز، ${todayText()}`:`از ${dateLabel(d.from).replace(/<[^>]+>/g,'')} تا ${dateLabel(d.to).replace(/<[^>]+>/g,'')}`;
}
async function dbcLoad(){
  const host=$('#dbCharts'); if(!host) return;
  if(!host.dataset.bound){ host.dataset.bound='1'; host.addEventListener('click',e=>{ const b=e.target.closest('[data-dbc-days]'); if(!b) return; e.stopPropagation(); app.dbc.days=Number(b.dataset.dbcDays); $$('.dbc-range').forEach(x=>x.classList.toggle('active',x===b)); dbcLoad(); }); }
  const seq=++app.dbc.seq;
  try{ const d=await api('/api/dashboard/products?days='+app.dbc.days); if(seq!==app.dbc.seq||!$('#dbcGrid')) return; dbcRender(d); }
  catch(err){ const g=$('#dbcGrid'); if(g) g.innerHTML=`<div class="empty">خطا در دریافت آمار محصولات: ${esc(err.message)}</div>`; }
}

/* ---------------- گزارش‌ها ---------------- */
async function renderReports(){
  if(app.timer){clearInterval(app.timer);app.timer=null}
  const d=await api('/api/reports'); const districts=d.gate.byDistrict||[]; const max=Math.max(1,...districts.map(x=>x.count)); const remote=d.remote||{};
  const barMax=Math.max(1,...(remote.byDate||[]).map(i=>i.count));
  const bars=(rows,fmt)=>rows.map(x=>`<div class="rp38-bar"><span>${esc(fmt(x))}</span><div class="rp38-track"><i style="width:${Math.max(8,Math.round(x.count/barMax*100))}%"></i></div><b>${qty(x.count)}</b></div>`).join('');
  $('#content').innerHTML=`<div style="display:grid;gap:16px">
    <div class="db38-hero">
      <div class="db38-hero-right"><span class="db38-logo db38-logo-img"><img src="/logo.png" alt="بابل طیور"></span><div><h2>مرکز گزارش‌گیری</h2><p>عملکرد عملیاتی، سفارش‌های آینده و وضعیت مالی در یک نمای یکپارچه.</p></div></div>
      <div class="db38-hero-left"><button class="btn btn-primary" data-action="rp38-print">${icon('receipt',16)} چاپ گزارش</button></div>
    </div>
    <div class="mg38-kpis">
      ${mg38Kpi('ورودی امروز',d.gate.today,'نگهبانی','gate','red')}
      ${mg38Kpi('سفارش‌های امروز',d.sales.todayOrders,'فروش','sales','blue')}
      ${mg38Kpi('تحویل‌شده',d.warehouse.deliveredOrders,'انبار','warehouse','orange')}
      ${mg38Kpi('درآمد ثبت‌شده',moneyCompact(d.finance.revenue),'مالی','receipt','green',true)}
      ${mg38Kpi('غیرحضوری برنامه‌ریزی‌شده',remote.scheduled||0,'آینده','calendar','purple')}
    </div>
    <div class="rp38-grid">
      <section class="sd-panel">
        <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico" style="background:var(--purple-bg);color:var(--purple)">${icon('calendar',19)}</span><div><h2>تقویم سفارش‌های غیرحضوری</h2><p>تعداد سفارش‌های برنامه‌ریزی‌شده به تفکیک تاریخ.</p></div></div></div>
        <div class="sd-pad">${(remote.byDate||[]).filter(x=>x.date!=='بدون تاریخ').slice(0,12).length?bars((remote.byDate||[]).filter(x=>x.date!=='بدون تاریخ').slice(0,12),x=>dateLabel(x.date)):'<div class="empty">سفارش غیرحضوری برنامه‌ریزی‌شده‌ای ثبت نشده است.</div>'}</div>
      </section>
      <section class="sd-panel">
        <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico" style="background:var(--orange-bg);color:var(--orange)">${icon('scale',19)}</span><div><h2>وضعیت صف‌ها</h2><p>تصیر فعلی عملیات در یک نگاه.</p></div></div></div>
        <div class="sd-pad"><div class="rp38-minis">
          <div class="rp38-mini"><b>${qty(d.sales.pendingWarehouse)}</b><span>صف انبار</span></div>
          <div class="rp38-mini"><b>${qty(d.sales.pendingSettlement)}</b><span>آماده تسویه</span></div>
          <div class="rp38-mini"><b>${qty(d.finance.readyExit)}</b><span>آماده خروج</span></div>
          <div class="rp38-mini"><b>${qty(remote.dueToday||0)}</b><span>غیرحضوری امروز</span></div>
        </div></div>
      </section>
      <section class="sd-panel">
        <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico">${icon('gate',19)}</span><div><h2>ورودی بر اساس محله</h2><p>پراکنش جغرافیایی مراجعه‌کنندگان نگهبانی.</p></div></div></div>
        <div class="sd-pad">${districts.length?districts.map(x=>`<div class="rp38-bar"><span>${esc(x.district)}</span><div class="rp38-track"><i style="width:${Math.max(8,Math.round(x.count/max*100))}%"></i></div><b>${qty(x.count)}</b></div>`).join(''):'<div class="empty">داده‌ای برای نمایش نیست.</div>'}</div>
      </section>
      <section class="sd-panel rp38-highlight">
        <div class="sd-pad" style="text-align:center">
          <span class="stl-eyebrow" style="color:var(--purple)">REMOTE ORDERS</span>
          <div class="rp38-big">${qty(remote.scheduled||0)}</div>
          <b style="font-size:14px">سفارش غیرحضوری در انتظار تاریخ تحویل</b>
          <p style="margin:6px 0 0;font-size:12px;color:var(--muted)">کل ثبت‌شده: <strong>${qty(remote.total||0)}</strong> سفارش غیرحضوری</p>
        </div>
      </section>
    </div>
  </div>`;
}

/* ---------------- مدیریت ---------------- */
function ad38TabClick(e){
  const t=e.target.closest('[data-ad38-tab]'); if(!t)return;
  app.ad38Tab=t.dataset.ad38Tab;
  $$('#content [data-ad38-tab]').forEach(b=>b.classList.toggle('active',b.dataset.ad38Tab===app.ad38Tab));
  $$('#content [data-ad38-pane]').forEach(s=>s.classList.toggle('hidden-pane',s.dataset.ad38Pane!==app.ad38Tab));
}

/* ---------------- قالب چاپ فاکتور (v38) ---------------- */
/* v37.17.0 — سطرهای سند هر سرویس فقط از دادهٔ همان سرویس ساخته می‌شوند.
   وزن کل قلم (مجموع سرویس اول و دوم) هرگز نباید در سند یک سرویس نمایش داده شود. */
function storeRunInvoiceLines(o,p){
  const priceLines=Array.isArray(p?.priceLines)?p.priceLines:[];
  if(priceLines.length) return priceLines.map(x=>({productName:x.productName,deliveredKg:Number(x.deliveredKg??0)}));
  const items=(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED'&&i.itemStatus!=='OUT_OF_STOCK');
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
function transportDeliverySignatureHtml(customerName,driverName){
 const customer=esc(String(customerName||'').trim()||'—'),driver=esc(String(driverName||'').trim()||'—');
 return `<div class="inv38-verify-box inv38-delivery-signature"><p class="inv38-delivery-declaration">اینجانب <strong>${customer}</strong>، تأیید می‌کنم اقلام فوق توسط رانندهٔ پخش <strong>${driver}</strong> به اینجانب تحویل شد.</p><div class="inv38-delivery-signer"><span>محل امضا</span><div class="inv38-delivery-signature-line" aria-hidden="true"></div><strong>${customer}</strong><small>نام مشتری</small></div></div>`;
}
// The distribution invoice is compact, identifies the delivery destination and
// leaves a customer signature line beneath the declaration.
function transportDraftInvoiceHtml(order,invoice){
 const lines=Array.isArray(invoice.priceLines)?invoice.priceLines:[];
 const customerName=invoice.customerName||'—';
 const driverName=invoice.driverName||order.transportHandovers?.['0']?.driverName||'—';
 return `<div class="inv38-sheet inv38-compact inv38-distribution"><div class="inv38-head"><div class="inv38-meta inv38-distribution-meta"><div class="inv38-distribution-contacts"><div><span>نام مشتری</span><b>${esc(customerName)}</b></div><div><span>شماره تماس</span><b class="inv38-phone" dir="ltr">${esc(fa(invoice.customerPhone||'—'))}</b></div></div><div><span>محل ارسال</span><b>${esc(order.dispatchPlace||'—')}</b></div><div><span>شماره سفارش</span><b>${esc(fa(order.orderNo||'—'))}</b></div><div><span>شماره فاکتور</span><b>${esc(fa(invoice.invoiceNumber||'—'))}</b></div><div><span>تاریخ</span><b>${esc(dt(invoice.createdAt))}</b></div></div></div><div class="inv38-rule"></div><div class="inv38-table-scroll"><table class="inv38-table"><thead><tr><th>#</th><th>محصول</th><th>وزن ارسالی</th><th>فی</th><th>مبلغ</th></tr></thead><tbody>${lines.map((l,i)=>`<tr><td>${fa(String(i+1))}</td><td>${esc(l.productName||'—')}</td><td>${qty(l.deliveredKg)} کیلوگرم</td><td>${money(l.unitPrice)}</td><td>${money(l.amount)}</td></tr>`).join('')}</tbody></table></div><div class="inv38-bottom"><div class="inv38-total"><div class="inv38-total-box"><div><span>جمع اقلام</span><b>${money(invoice.subtotalAmount)}</b></div><div><span>تخفیف</span><b>${money(invoice.discountAmount)}</b></div><div><span>اضافات</span><b>${money(invoice.additionsAmount)}</b></div><div class="grand"><span>مبلغ پیش از مرجوعی</span><b>${money(invoice.totalAmount)}</b></div></div></div><div class="inv38-verify">${transportDeliverySignatureHtml(customerName,driverName)}</div></div></div>`;
}
async function transportDraftPreview(id){
 try{const data=await api('/api/sales/transport-invoices/'+encodeURIComponent(id));openModal('فاکتور پیش از خروج',transportDraftInvoiceHtml(data,data.invoice)+`<div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button><button type="button" class="btn btn-primary" data-ti-print>چاپ فاکتور</button></div>`);$('#modal [data-ti-print]').addEventListener('click',async e=>{const button=e.currentTarget;button.disabled=true;const requested=await transportDraftPrint(id);button.disabled=false;if(requested)toast('فاکتور برای چاپ باز شد؛ نسخه چاپی را به راننده بدهید. تأیید خروج در نگهبانی انجام می‌شود.');});BTPrintDigits.convert(document.querySelector('#modal .inv38-sheet'));}catch(e){toast(e.message);}
}
async function transportDraftPrint(id){
 try{const data=await api('/api/sales/transport-invoices/'+encodeURIComponent(id));return BTPrintFrame.html(BTPrintDigits.documentHtml(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="/design.css"><link rel="stylesheet" href="/invoice-compact.css?v=37.3.21"><title>فاکتور ${esc(fa(data.invoice.invoiceNumber))}</title><style>body{margin:0;padding:12mm;font-family:"Vazirmatn",Tahoma,sans-serif}@page{size:A4;margin:0}</style></head><body>${transportDraftInvoiceHtml(data,data.invoice)}<script src="/print-ready.js"><\/script></body></html>`));}catch(e){toast(e.message);return false;}
}
// The printed handover note and the dispatch invoice share one identity block,
// so the sheet is assembled from the exact invoice header markup and labels.
/* برگهٔ ارسال پخش دقیقاً با همان چیدمان «فاکتور تحویل» چاپ می‌شود:
   همان سربرگ، همان جدول اقلام با وزن و مبلغ، همان جمع‌بندی مالی و همان
   اظهارنامه/جای امضای تحویل‌گیرنده؛ تفاوت فقط ردیف اطلاعات تحویل به راننده است. */
function transportShipmentNoteHtml(order){
 const invoice=order.transportInvoice||{},hand=order.transportHandovers?.['0']||{},doc=hand.document||{};
 const source=Array.isArray(invoice.priceLines)&&invoice.priceLines.length?invoice.priceLines:(doc.items||[]).filter(i=>!i.outOfStock&&Number(i.deliveredKg)>0);
 const lines=source.map(i=>{const kg=Number(i.deliveredKg||0),unitPrice=Number(i.unitPrice||0);return {productName:i.productName||'—',deliveredKg:kg,unitPrice,amount:Number(i.amount??Math.round(kg*unitPrice))||0};});
 const totalKg=lines.reduce((sum,line)=>sum+line.deliveredKg,0);
 const subtotal=lines.reduce((sum,line)=>sum+line.amount,0);
 const discount=Number(invoice.discountAmount||0),additions=Number(invoice.additionsAmount||0);
 const total=Number.isFinite(Number(invoice.totalAmount))?Number(invoice.totalAmount):subtotal-discount+additions;
 const driver=hand.driverName||invoice.driverName||'—';
 const customerNameRaw=String(invoice.customerName||order.customer?.name||'').trim(),customerPhoneRaw=String(invoice.customerPhone||order.customer?.phone||'').trim();
 const customerName=esc(customerNameRaw||'—'),customerPhone=esc(customerPhoneRaw||'—');
 const header=`<div class="inv38-head"><div class="inv38-meta inv38-distribution-meta"><div class="inv38-distribution-contacts"><div><span>نام مشتری</span><b>${customerName}</b></div><div><span>شماره تماس</span><b class="inv38-phone" dir="ltr">${customerPhone}</b></div></div><div><span>محل ارسال</span><b>${esc(order.dispatchPlace||'—')}</b></div><div><span>شماره سفارش</span><b>${esc(fa(order.orderNo||'—'))}</b></div><div><span>شماره فاکتور</span><b>${esc(fa(invoice.invoiceNumber||'—'))}</b></div><div><span>تاریخ</span><b>${esc(dt(invoice.createdAt||order.createdAt))}</b></div></div></div>`;
 const handover=`<div class="inv38-cust tr-shipment-handover"><div><span>راننده</span><b>${esc(driver)}</b></div><div><span>خودرو و پلاک</span><b>${esc(hand.vehicleType||'—')} ${esc(fa(hand.vehiclePlate||''))}</b></div><div><span>سند انبار</span><b dir="ltr">${esc(fa(doc.warehouseDocumentNo||'—'))}</b></div></div>`;
 const rows=lines.map((line,index)=>`<tr><td>${fa(String(index+1))}</td><td><b>${esc(line.productName)}</b></td><td>${qty(line.deliveredKg)} کیلوگرم</td><td>${line.unitPrice>0?money(line.unitPrice):'—'}</td><td>${line.amount>0?money(line.amount):'—'}</td></tr>`).join('');
 const table=`<p class="inv38-scroll-hint">برای مشاهده همه ستون‌های اقلام، جدول را افقی پیمایش کنید.</p><div class="inv38-table-scroll" role="region" aria-label="اقلام برگهٔ ارسال"><table class="inv38-table"><thead><tr><th>#</th><th>محصول</th><th>وزن ارسالی</th><th>قیمت هر کیلو</th><th>مبلغ</th></tr></thead><tbody>${rows||'<tr><td colspan="5">قلمی برای ارسال ثبت نشده است.</td></tr>'}</tbody><tfoot><tr><th colspan="2">جمع وزن ارسالی</th><th colspan="3">${qty(totalKg)} کیلوگرم</th></tr></tfoot></table></div>`;
 const totals=`<div class="inv38-bottom"><div class="inv38-total"><div class="inv38-total-box"><div><span>جمع اقلام</span><b>${money(subtotal)}</b></div><div><span>تخفیفات</span><b>${money(discount)}</b></div><div><span>اضافات</span><b>${money(additions)}</b></div><div class="inv38-total-final"><span>مبلغ فاکتور</span><b>${money(total)}</b></div></div></div></div>`;
 const signature=`<div class="inv38-verify">${transportDeliverySignatureHtml(customerNameRaw||'—',driver)}</div>`;
 // عنوان کوتاه سند تا راننده/انباردار برگهٔ ارسال را از فاکتور مشتری تشخیص دهد؛
 // سربرگ و بدنه مو‌به‌مو همان فاکتور تحویل است.
 const title=`<div class="tr-shipment-title"><b>برگه ارسال پخش</b><span>همراه محموله — نسخهٔ راننده</span></div>`;
 return `<div class="inv38-sheet inv38-compact inv38-distribution inv38-settlement tr-shipment-note">${title}${header}<div class="inv38-rule"></div>${handover}${table}${totals}${signature}
   <div class="tr-shipment-note-footer"><p>این برگه همراه محموله است و به‌تنهایی ثبت پرداخت یا تأیید دریافت محسوب نمی‌شود.</p></div></div>`;
}
async function transportShipmentNotePrint(id){
 try{
  const data=await api('/api/orders/'+encodeURIComponent(id)),order=data.order;
  if(!order?.transportInvoice||!order.transportHandovers?.['0']?.document)throw Error('برگه ارسال پس از صدور فاکتور و ثبت سند انبار در دسترس است.');
  const requested=BTPrintFrame.html(BTPrintDigits.documentHtml(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="/design.css"><link rel="stylesheet" href="/invoice-compact.css?v=37.3.21"><title>برگه ارسال ${esc(fa(order.orderNo||'—'))}</title><style>body{margin:0;padding:12mm;font-family:"Vazirmatn",Tahoma,sans-serif}@page{size:A4;margin:0}</style></head><body>${transportShipmentNoteHtml(order)}<script src="/print-ready.js"><\/script></body></html>`));
  if(requested)await transportShipmentNoteMarkPrinted(id);
  return requested;
 }catch(e){toast(e.message);return false;}
}
// v37.6.1 — چاپ برگهٔ ارسال، سفارش را از «آماده تسویه» به «فاکتورهای صادرشده» می‌برد.
// نشانهٔ چاپ روی فاکتور ثبت می‌شود تا این جابه‌جایی برای همهٔ کاربران و پس از رفرش هم بماند.
async function transportShipmentNoteMarkPrinted(id){
 try{await api('/api/sales/transport-invoices/'+encodeURIComponent(id)+'/printed',{method:'POST',body:'{}'});}catch(_){return;}
 try{
  const fresh=await fetchSalesCache(true);
  if(app.page==='sales'&&app.sub.sales==='settlement'){
   paintSalesPaneV29('settlement',fresh);
   if(stl.orderId===id&&$('#stlMain'))void stlOpen(id);
  }
  if(typeof refreshIndicators==='function')await refreshIndicators();
 }catch(_){}
}

// Register transport payment and optional returns in one sales action.
async function openTransportDeliveryWork(id){
 const notices=captureEntityNotices('order',id);
 openModal('ثبت پرداختی پخش','<div id="transportDeliveryWork" role="region">در حال دریافت اطلاعات سفارش…</div>');
 const host=$('#transportDeliveryWork');
 async function load(){
  if(!host?.isConnected)return;
  host.innerHTML='<div role="status">در حال دریافت اطلاعات سفارش…</div>';
  try{
   const data=await api('/api/orders/'+encodeURIComponent(id));
   if(!host.isConnected||$('#transportDeliveryWork')!==host)return;
   const order=data.order;
   if(!order||order.status!=='SETTLEMENT_PENDING'||!order.transportInvoice)throw Error('این فاکتور دیگر در مرحله کار پخش نیست.');
   let devices=[],devicesError=false;
   if(order.transportDeparture){try{devices=(await api('/api/payment-devices')).devices||[];}catch(_){devicesError=true;}}
   if(!host.isConnected||$('#transportDeliveryWork')!==host)return;
   Object.assign(stl,{orderId:id,order,devices,devicesError});
   const done=async()=>{closeModal();stlReset();app.salesDeliveryTab='history';try{if(app.salesFetchPromise)await app.salesFetchPromise.catch(()=>{});const fresh=await fetchSalesCache(true);if(app.page==='sales'&&app.sub.sales==='delivery')paintSalesPaneV29('delivery',fresh);}catch(e){toast('پرداختی ثبت شد اما نوسازی فهرست ناموفق بود.');}};
   transportSalesInvoicePanel(order,host,load,done);
   finishEntityNotices(notices);
   return true;
  }catch(e){
   if(!host.isConnected||$('#transportDeliveryWork')!==host)return;
   host.innerHTML=`<div class="stl-load-error" role="alert"><b>فاکتور پخش باز نشد.</b><span>${esc(e.message||'خطا در دریافت اطلاعات')}</span><button type="button" class="btn btn-secondary" data-tr-work-retry>تلاش دوباره</button></div>`;
   host.querySelector('[data-tr-work-retry]').onclick=load;
  }
 }
 return load();
}
function transportInvoicePriceDefault(order,line){
 const item=(order.items||[]).find(row=>String(row.id)===String(line.itemId));
 const productId=line.productId??item?.productId;
 const hasListedPrice=productId!=null&&Object.hasOwn(stl.priceMap||{},String(productId));
 const listedPrice=hasListedPrice?Number(stl.priceMap[String(productId)]):0;
 const savedPrice=Number(line.unitPrice??item?.unitPrice??0);
 const amount=hasListedPrice?listedPrice:savedPrice;
 return Number.isSafeInteger(amount)&&amount>0?fa(amount.toLocaleString('en-US').replace(/,/g,'٬')):'';
}
function transportSalesInvoicePanel(order,host=$('#stlMain'),reload=()=>stlOpen(order.id),onClosed=null){
 const hand=order.transportHandovers?.['0'],invoice=order.transportInvoice;
 if(!hand){host.innerHTML='<section class="sd-panel sd-pad"><h2>فاکتور پخش</h2><p>در انتظار ثبت تحویل فیزیکی کالا به راننده در انبار.</p></section>';return;}
 if(invoice){
  const canRecordPayment=!!onClosed&&!!order.transportDeparture;
  const stage=canRecordPayment?transportClosureFormHtml(order):order.transportDeparture?'<p>خروج ثبت شده است؛ ثبت پرداختی در کارتابل پخش انجام می‌شود.</p>':invoice.printedAt?'<p>برگهٔ ارسال چاپ شد و فاکتور در فهرست «فاکتورهای صادرشده» ثبت است؛ ثبت خروج در کارتابل نگهبانی انجام می‌شود.</p>':'<p>فاکتور صادر شد؛ برگهٔ ارسال را چاپ کنید. ثبت خروج در کارتابل نگهبانی انجام می‌شود.</p>';
  const deviceWarning=canRecordPayment&&stl.devicesError?`<div class="stl-load-error" role="alert"><b>فهرست دستگاه‌های پوز دریافت نشد.</b><span>سایر روش‌های پرداخت قابل استفاده‌اند؛ برای انتخاب پوز، فهرست دستگاه‌ها را دوباره دریافت کنید.</span><button type="button" class="btn btn-secondary btn-sm" data-ts-devices-retry>دریافت دوباره دستگاه‌ها</button></div>`:'';
  const shipmentPrintButton=!order.transportDeparture?`<button type="button" class="btn btn-primary" data-ti-shipment-print>چاپ برگهٔ ارسال</button>`:'';
  host.innerHTML=`<section class="sd-panel sd-pad tr-invoice-panel"><h2>فاکتور پخش ${esc(fa(invoice.invoiceNumber))}</h2>${transportOrderServiceHtml(order,false)}${shipmentPrintButton}${deviceWarning}${stage}</section>`;
  const printButton=host.querySelector('[data-ti-shipment-print]');
  if(printButton)printButton.onclick=async e=>{const button=e.currentTarget;button.disabled=true;const requested=await transportShipmentNotePrint(order.id);button.disabled=false;if(requested)toast('برگهٔ ارسال برای چاپ آماده شد.');};
  if(canRecordPayment)bindTransportClosure(host,order,onClosed);
  return;
 }
 const lines=(hand.document?.items||[]).filter(i=>!i.outOfStock&&Number(i.deliveredKg)>0);
 host.innerHTML=`<section class="sd-panel sd-pad tr-invoice-panel"><h2>فاکتور پیش از خروج</h2><p>پس از ثبت، فاکتور هنوز تسویه‌شده یا تحویل‌شده نیست. قیمت اقلام را وارد کنید.</p><form data-ti-form class="tr-form"><div class="tr-table-scroll"><table class="table tr-invoice-table"><thead><tr><th>محصول</th><th>وزن</th><th>قیمت هر کیلو (ریال)</th></tr></thead><tbody>${lines.map(l=>`<tr><td>${esc(l.productName||'—')}</td><td>${qty(l.deliveredKg)}</td><td><input required inputmode="numeric" data-ti-price="${esc(l.itemId||'')}" data-ti-weight="${esc(String(l.deliveredKg))}" value="${esc(transportInvoicePriceDefault(order,l))}" aria-label="قیمت ${esc(l.productName||'قلم')}" placeholder="ریال"></td></tr>`).join('')}</tbody></table></div><div class="tr-adjustments"><label class="tr-field"><span>تخفیف (ریال)</span><input name="discountAmount" inputmode="numeric" value="۰"></label><label class="tr-field"><span>اضافات (ریال)</span><input name="additionsAmount" inputmode="numeric" value="۰"></label></div><div class="tr-totals" data-ti-summary aria-live="polite">مبلغ پس از تکمیل قیمت‌ها نمایش داده می‌شود.</div><div class="modal-actions"><button type="submit" class="btn btn-primary">ثبت فاکتور پیش از خروج</button></div><p data-ti-error role="alert"></p></form></section>`;
 const form=host.querySelector('[data-ti-form]'),moneyInputs=[...form.querySelectorAll('[data-ti-price], [name=discountAmount], [name=additionsAmount]')];
 const recalc=()=>{
  const prices=[...form.querySelectorAll('[data-ti-price]')],raw=el=>transportMoneyNumber(el.value),summary=form.querySelector('[data-ti-summary]');
  if(prices.some(x=>!x.value.trim()||raw(x)===null||raw(x)<=0)||moneyInputs.some(x=>raw(x)===null)){summary.textContent='مبلغ پس از تکمیل قیمت‌های معتبر نمایش داده می‌شود.';return false;}
  const lineAmounts=prices.map(x=>Math.round(Number(x.dataset.tiWeight)*raw(x))),subtotal=lineAmounts.reduce((sum,x)=>sum+x,0),total=subtotal-raw(form.elements.discountAmount)+raw(form.elements.additionsAmount);
  if(moneyInputs.some(x=>raw(x)>1e12)||lineAmounts.some(x=>!Number.isSafeInteger(x)||x>1e12)||!Number.isSafeInteger(subtotal)||subtotal>1e12||!Number.isSafeInteger(total)||total<=0||total>1e12){summary.textContent='قیمت‌ها و مبلغ نهایی باید در محدوده مجاز باشند و مبلغ نهایی مثبت باشد.';return false;}
  summary.textContent=`جمع اقلام: ${money(subtotal)} • مبلغ فاکتور: ${money(total)}`;return true;
 };
 moneyInputs.forEach(input=>input.addEventListener('input',()=>{transportFormatMoneyInput(input);form.querySelector('[data-ti-error]').textContent='';recalc();}));
 form.onsubmit=async e=>{e.preventDefault();if(!recalc()){form.querySelector('[data-ti-error]').textContent='قیمت‌ها و مبالغ فاکتور را بررسی کنید.';return;}const button=form.querySelector('[type=submit]');button.disabled=true;try{const body={items:[...form.querySelectorAll('[data-ti-price]')].map(i=>({itemId:i.dataset.tiPrice,unitPrice:transportMoneyNumber(i.value)})),discountAmount:transportMoneyNumber(form.elements.discountAmount.value),additionsAmount:transportMoneyNumber(form.elements.additionsAmount.value)};await api('/api/sales/transport-invoices/'+encodeURIComponent(order.id),{method:'POST',body:JSON.stringify(body)});toast('فاکتور ثبت شد؛ پرداختی پس از خروج در کارتابل فروش ثبت می‌شود.');await stlOpen(order.id);}catch(err){form.querySelector('[data-ti-error]').textContent=err.message;button.disabled=false;}};
}
function transportClosureFormHtml(order){
 const notDelivered=order.transportReturn?.outcome==='NOT_DELIVERED',lines=order.transportInvoice.priceLines||[];
 return `<form data-ts-close class="tr-form tr-close-form"><h3>ثبت پرداختی</h3><p>روش یا روش‌های پرداخت را ثبت کنید. اگر مرجوعی وجود دارد، تیک آن را بزنید و وزن اقلام برگشتی را وارد کنید.</p><label class="tr-return-toggle"><input type="checkbox" name="returnsEnabled" data-ts-returns ${notDelivered?'checked disabled':''}> مرجوعی دارد${notDelivered?' — مرجوعی کامل از قبل ثبت شده است':''}</label><div data-ts-return-fields ${notDelivered?'':'hidden'}><div class="tr-table-scroll"><table class="table tr-return-table"><thead><tr><th>محصول</th><th>وزن ارسالی</th><th>مرجوعی (کیلوگرم)</th><th>علت (اختیاری)</th></tr></thead><tbody>${lines.map(l=>`<tr data-ts-line data-id="${esc(l.itemId)}"><td>${esc(l.productName)}</td><td>${qty(l.deliveredKg)}</td><td><input data-ts-kg aria-label="وزن مرجوعی ${esc(l.productName)}" inputmode="decimal" value="${notDelivered?esc(fa(String(l.deliveredKg))):'۰'}" ${notDelivered?'readonly':''}></td><td><input data-ts-reason aria-label="علت مرجوعی ${esc(l.productName)}" maxlength="300"></td></tr>`).join('')}</tbody></table></div></div><p>مبلغ فاکتور: <b>${money(order.transportInvoice.totalAmount)}</b> — مبلغ پس از مرجوعی: <b data-ts-total>—</b></p><p>در مرجوعی کامل مبلغ فاکتور صفر می‌شود؛ در مرجوعی جزئی، مبلغ مرجوعی از فاکتور کسر می‌شود. چک تا زمان وصول، پرداخت‌شده محسوب نمی‌شود.</p><h4>روش‌های پرداخت</h4><div data-ts-payments></div><button type="button" class="btn btn-secondary" data-ts-add>افزودن روش پرداخت</button><p data-ts-sum aria-live="polite"></p><div class="modal-actions"><button type="submit" class="btn btn-primary">ثبت پرداختی</button></div><p data-ts-error role="alert"></p></form>`;
}
function transportClosureAmount(invoice,rows){
 if(rows.length!==(invoice.priceLines||[]).length)return null;
 let returned=0,all=true;
 for(let i=0;i<rows.length;i++){
  const raw=en(String(rows[i]??'')).trim().replace(/٫/g,'.');if(!/^\d+(?:\.\d{1,3})?$/.test(raw))return null;
  const kg=Number(raw),line=invoice.priceLines[i];if(!Number.isFinite(kg)||kg<0||kg>Number(line.deliveredKg))return null;
  if(kg!==Number(line.deliveredKg))all=false;returned+=Math.round(kg*Number(line.unitPrice));
 }
 return Number(invoice.totalAmount)-(all?Number(invoice.totalAmount):Math.min(returned,Number(invoice.totalAmount)));
}
// Format only valid digits and grouping; invalid characters remain visible and block submission.
function transportMoneyNumber(value){const text=en(String(value??'')).trim();if(!text)return 0;if(!/^[0-9,٬\s]+$/.test(text))return null;const digits=text.replace(/[,٬\s]/g,'');if(!digits)return null;const n=Number(digits);return Number.isSafeInteger(n)?n:null;}
function transportFormatMoneyInput(input){const raw=en(input.value),caret=input.selectionStart??raw.length;if(!/^[0-9,٬\s]*$/.test(raw)){input.setCustomValidity('فقط عدد معتبر وارد کنید.');return;}input.setCustomValidity('');const before=raw.slice(0,caret).replace(/\D/g,'').length,digits=raw.replace(/\D/g,'');input.value=fa(digits.replace(/\B(?=(\d{3})+(?!\d))/g,'٬'));let pos=0,count=0;while(pos<input.value.length&&count<before){if(/[0-9]/.test(en(input.value[pos])))count++;pos++;}input.setSelectionRange(pos,pos);}
function transportPaymentRowHtml(devices){return `<div data-ts-payrow class="stl-payment-row tr-payment-row"><label class="tr-field"><span>روش</span><select data-ts-type><option value="CASH">نقدی</option><option value="POS">پوز</option><option value="CARD_TRANSFER">کارت‌به‌کارت</option><option value="CHECK">چک</option><option value="CREDIT">معوق</option></select></label><label class="tr-field"><span>مبلغ (ریال)</span><input data-ts-amount inputmode="numeric" required></label><div data-ts-extra hidden></div><button type="button" class="btn btn-secondary btn-sm" data-ts-remove>حذف</button></div>`;}

function bindTransportClosure(host,order,onClosed=null){
 const f=host.querySelector('[data-ts-close]'),invoice=order.transportInvoice,devices=stl.devices||[],paymentHost=f.querySelector('[data-ts-payments]'),returnToggle=f.querySelector('[data-ts-returns]'),returnFields=f.querySelector('[data-ts-return-fields]');
 const retryDevices=host.querySelector('[data-ts-devices-retry]');
 if(retryDevices)retryDevices.onclick=async()=>{
  retryDevices.disabled=true;
  try{
   const data=await api('/api/payment-devices');if(!host.isConnected||stl.orderId!==order.id)return;
   devices.splice(0,devices.length,...(data.devices||[]));stl.devicesError=false;
   f.querySelectorAll('[data-ts-device]').forEach(select=>{const previous=select.value;select.innerHTML='<option value="">انتخاب کنید</option>'+devices.filter(d=>d.isActive!==false).map(d=>`<option value="${esc(d.id)}">${esc(d.bank||'')} ${esc(d.terminalNumber||'')}</option>`).join('');select.value=previous;});
   retryDevices.closest('.stl-load-error')?.remove();
  }catch(err){toast(err.message||'دریافت دستگاه‌ها ناموفق بود.');retryDevices.disabled=false;}
 };
 const recalc=()=>{const lines=[...f.querySelectorAll('[data-ts-line]')],returnRows=returnToggle.checked?lines.map(r=>r.querySelector('[data-ts-kg]').value):(invoice.priceLines||[]).map(()=>0),total=transportClosureAmount(invoice,returnRows);f.querySelector('[data-ts-total]').textContent=total===null?'وزن مرجوعی نامعتبر است':money(total);const sum=f.querySelector('[data-ts-sum]');if(sum){const rows=[...f.querySelectorAll('[data-ts-payrow]')],values=rows.map(r=>transportMoneyNumber(r.querySelector('[data-ts-amount]')?.value));sum.textContent=values.some(x=>x===null)?'مبلغ روش پرداخت نامعتبر است.':`جمع روش‌های پرداخت: ${money(values.reduce((a,b)=>a+b,0))}${total===null?'':` • اختلاف با مبلغ قابل تسویه: ${money(total-values.reduce((a,b)=>a+b,0))}`}`;}return total;};
 const details=row=>{const type=row.querySelector('[data-ts-type]').value,box=row.querySelector('[data-ts-extra]');let h='';if(type==='POS')h=`<label class="tr-field"><span>دستگاه پوز</span><select data-ts-device><option value="">انتخاب کنید</option>${devices.filter(d=>d.isActive!==false).map(d=>`<option value="${esc(d.id)}">${esc(d.bank||'')} ${esc(d.terminalNumber||'')}</option>`).join('')}</select></label><label class="tr-field"><span>شماره پیگیری</span><input data-ts-reference></label>`;if(type==='CARD_TRANSFER')h='<label class="tr-field"><span>بانک مقصد</span><input data-ts-bank></label><label class="tr-field"><span>شناسه پیگیری</span><input data-ts-reference></label>';if(type==='CHECK')h='<label class="tr-field"><span>بانک</span><input data-ts-bank></label><label class="tr-field"><span>شماره چک</span><input data-ts-check></label><label class="tr-field"><span>تاریخ سررسید</span><input type="date" data-ts-due></label>';box.innerHTML=h;box.hidden=!h;};
 const wireRow=row=>{row.querySelector('[data-ts-type]').onchange=()=>details(row);row.querySelector('[data-ts-amount]').oninput=e=>{transportFormatMoneyInput(e.target);recalc();};row.querySelector('[data-ts-remove]').onclick=()=>{row.remove();recalc();};};
 returnToggle.onchange=()=>{returnFields.hidden=!returnToggle.checked;if(!returnToggle.checked)f.querySelectorAll('[data-ts-line]').forEach(row=>{row.querySelector('[data-ts-kg]').value='۰';row.querySelector('[data-ts-reason]').value='';});recalc();};
 f.querySelectorAll('[data-ts-kg]').forEach(el=>el.addEventListener('input',recalc));
 f.querySelector('[data-ts-add]').onclick=()=>{if(paymentHost.querySelectorAll('[data-ts-payrow]').length>=20)return toast('حداکثر ۲۰ ردیف پرداخت مجاز است.');paymentHost.insertAdjacentHTML('beforeend',transportPaymentRowHtml(devices));wireRow(paymentHost.lastElementChild);recalc();};
 f.onsubmit=async e=>{
  e.preventDefault();const total=recalc(),error=f.querySelector('[data-ts-error]');
  if(total===null){error.textContent='وزن مرجوعی را بررسی کنید.';return;}
  const lines=[...f.querySelectorAll('[data-ts-line]')],returns=returnToggle.checked?lines.map(row=>({itemId:row.dataset.id,returnKg:en(row.querySelector('[data-ts-kg]').value).trim().replace(/٫/g,'.'),reason:row.querySelector('[data-ts-reason]').value})):[];
  if(returnToggle.checked&&!returns.some(row=>Number(en(row.returnKg).replace(/٫/g,'.'))>0)){error.textContent='برای ثبت مرجوعی، وزن برگشتی دست‌کم یک قلم را وارد کنید.';return;}
  const rows=[...f.querySelectorAll('[data-ts-payrow]')],methods=rows.map(row=>{const v=k=>row.querySelector('[data-ts-'+k+']')?.value||'';return {type:v('type'),amount:transportMoneyNumber(v('amount')),deviceId:v('device'),reference:v('reference'),bank:v('bank'),checkNumber:v('check'),dueDate:v('due')};});
  if(total>0&&!methods.length){error.textContent='برای مبلغ قابل تسویه حداقل یک روش پرداخت مشخص کنید.';return;}
  if(total===0&&methods.length){error.textContent='برای مبلغ صفر، ردیف پرداخت ثبت نکنید.';return;}
  if(methods.some(m=>m.amount===null||m.amount<1||m.amount>1e12)){error.textContent='مبلغ هر روش باید عدد صحیح بین ۱ و ۱٬۰۰۰٬۰۰۰٬۰۰۰٬۰۰۰ ریال باشد.';return;}
  if(methods.reduce((sum,m)=>sum+m.amount,0)!==total){error.textContent='جمع روش‌های پرداخت باید دقیقاً برابر مبلغ قابل تسویه باشد.';return;}
  if(methods.some(m=>m.type==='POS'&&!m.deviceId)){error.textContent='دستگاه پوز فعال را انتخاب کنید.';return;}
  if(methods.some(m=>m.type==='CARD_TRANSFER'&&(!m.bank.trim()||!m.reference.trim()))){error.textContent='بانک مقصد و شناسه پیگیری کارت‌به‌کارت الزامی است.';return;}
  if(methods.some(m=>m.type==='CHECK'&&(!m.bank.trim()||!m.checkNumber.trim()||!m.dueDate))){error.textContent='بانک، شماره و تاریخ سررسید چک الزامی است.';return;}
  const button=f.querySelector('[type=submit]');button.disabled=true;
  try{await api('/api/sales/transport-invoices/'+encodeURIComponent(order.id)+'/close',{method:'POST',body:JSON.stringify({returns,settlementMethods:methods})});toast('پرداختی و مرجوعی ثبت شد؛ چک‌های وصول‌نشده جداگانه پیگیری می‌شوند.');if(app.salesCache)app.salesCache.fetchedAt=0;if(onClosed)await onClosed();else{stlClose();await renderSales('settlement');}}
  catch(err){error.textContent=err.message;button.disabled=false;}
 };
 recalc();
}
function invoiceHtml(o,paySel){
  const p=paySel||o.payment||{};
  const pickupDoc=o.pickupHandover?.document;
  const signatureContact=pickupDoc?.recipient?esc(pickupDoc.recipient.name||'—')+' – '+esc(pickupDoc.recipient.phone||'—'):esc((p.customerName ?? o.customer?.name) || '—')+' – '+esc((p.customerPhone ?? o.customer?.phone) || '—');
  if(o.orderType==='STORE'){ // v37.6.0 — سند تحویل وزنی فروشگاه (بدون هیچ مبلغی)
    const run=p.deliveryRun||null;
    const lines=storeRunInvoiceLines(o,p); // v37.17.0 — فقط اقلام و وزن همان سرویس
    const totalKg=lines.reduce((sum,x)=>sum+Number(x.deliveredKg??0),0);
    return `<div class="inv38-sheet inv38-compact"><div class="inv38-head"><div class="inv38-brand"><img src="/logo.png" alt="بابل طیور"><div><b>بابل طیور</b><span>سند تحویل وزنی فروشگاه — بدون مبلغ</span></div></div><div class="inv38-meta"><div><span>شماره سند</span><b>${esc(fa(p.invoiceNumber||'—'))}</b></div><div><span>تاریخ ثبت</span><b>${esc(dt(p.verifiedAt||o.createdAt))}</b></div><div><span>شماره سفارش</span><b>${esc(fa(o.orderNo||'—'))}${run?` · سرویس ${run===2?'دوم':'اول'}`:''}</b></div></div></div><div class="inv38-rule"></div><div class="inv38-cust"><div><span>فروشگاه</span><b>${esc(o.storeName||'—')}</b></div><div><span>محل تحویل</span><b>${esc(o.dispatchPlace||'—')}</b></div><div><span>وضعیت</span><b>سند وزنی — خارج از مسیر پرداخت</b></div></div><div class="inv38-table-scroll" role="region" tabindex="0"><table class="inv38-table"><thead><tr><th>#</th><th>محصول</th><th>وزن تحویلی</th></tr></thead><tbody>${lines.map((i,k)=>`<tr><td>${fa(String(k+1))}</td><td><b>${esc(i.productName||'—')}</b></td><td>${qty(i.deliveredKg)} کیلوگرم</td></tr>`).join('')}</tbody></table></div><div class="inv38-bottom"><div class="inv38-total"><div class="inv38-total-box"><div><span>جمع وزن محموله</span><b>${qty(totalKg)} کیلوگرم</b></div><div class="grand"><span>نوع سند</span><b>سند تحویل وزنی</b></div><div style="margin-top:6px"><small>این سند صرفاً وزن تحویل‌شده را اعلام می‌کند و ارزش ریالی ندارد.</small></div></div></div><div class="inv38-verify"><div class="inv38-verify-box"><div class="inv38-verify-grid"><div class="inv38-vitem"><span>امضاء</span><strong>${signatureContact}</strong></div></div></div></div></div></div>`;
  }
  const items=o.transportWorkflow===1&&Array.isArray(o.transportInvoice?.priceLines)?o.transportInvoice.priceLines.map(l=>({product:{name:l.productName},deliveredKg:l.deliveredKg,unitPrice:l.unitPrice,finalAmount:l.amount})):(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED'&&i.itemStatus!=='OUT_OF_STOCK').map(i=>{const snap=pickupDoc?.items?.find(x=>x.itemId===i.id);return snap?{...i,product:{...i.product,name:snap.productName}}:i;});
  const subtotal=items.reduce((sum,i)=>sum+n(i.finalAmount),0);
  const returns=Math.max(0,n(p.returnDeduction||0));
  const difference=n(p.totalAmount)-subtotal+returns;
  const discount=p.discountAmount != null ? n(p.discountAmount) : Math.max(0,-difference);
  const additions=p.additionsAmount != null ? n(p.additionsAmount) : Math.max(0,difference);
  const customerNameRaw=String((pickupDoc?.customerName ?? p.customerName ?? o.customer?.name)||'').trim();const customerPhoneRaw=String((pickupDoc?.customerPhone ?? p.customerPhone ?? o.customer?.phone)||'').trim();
  const customerName=esc(customerNameRaw||'—');const customerPhone=esc(customerPhoneRaw||'—');
  const recipientCandidate=pickupDoc?.recipient||null;
  const contactNameKey=value=>String(value||'').normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\u200e\u200f]/g,' ').replace(/\s+/g,' ').trim().toLocaleLowerCase();
  const contactPhoneKey=value=>String(value||'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g,'');
  const customerNameKey=contactNameKey(customerNameRaw);
  const sameRecipientName=!!recipientCandidate&&!!customerNameKey&&contactNameKey(recipientCandidate.name)===customerNameKey;
  const sameRecipientPhone=!!recipientCandidate&&contactPhoneKey(recipientCandidate.phone)===contactPhoneKey(customerPhoneRaw);
  const recipient=sameRecipientName&&sameRecipientPhone?null:recipientCandidate;
  const distributionDelivery=o.deliveryMode==='DELIVERY'&&!recipient;
  const orderNumber=fa(String(o.orderNo||'—').replace(/^0+(?=\d)/,''));
  const invoiceNumber=fa(String(p.invoiceNumber||'—').replace(/^0+(?=\d)/,''));
  const invoiceDate=dt(p.verifiedAt||o.transportInvoice?.createdAt||o.createdAt);
  const invoiceHeaderMeta=recipient
    ? `<div><span>نام مشتری</span><b>${customerName}</b></div><div><span>شماره</span><b class="inv38-phone" dir="ltr">${customerPhone}</b></div><div><span>تحویل گیرنده</span><b>${esc(recipient.name||'—')}</b></div><div><span>شماره</span><b class="inv38-phone" dir="ltr">${esc(fa(recipient.phone||'—'))}</b></div><div><span>سفارش</span><b>${esc(orderNumber)}</b></div><div><span>فاکتور</span><b>${esc(invoiceNumber)}</b></div><div><span>تاریخ</span><b>${esc(invoiceDate)}</b></div>`
    : distributionDelivery
      ? `<div class="inv38-distribution-contacts"><div><span>نام مشتری</span><b>${customerName}</b></div><div><span>شماره تماس</span><b class="inv38-phone" dir="ltr">${customerPhone}</b></div></div><div><span>محل ارسال</span><b>${esc(o.dispatchPlace||'—')}</b></div><div><span>شماره سفارش</span><b>${esc(orderNumber)}</b></div><div><span>شماره فاکتور</span><b>${esc(invoiceNumber)}</b></div><div><span>تاریخ</span><b>${esc(invoiceDate)}</b></div>`
      : `<div><span>مشتری</span><b>${customerName}</b></div><div><span>تماس</span><b class="inv38-phone" dir="ltr">${customerPhone}</b></div><div><span>فاکتور</span><b>${esc(invoiceNumber)}</b></div><div><span>سفارش</span><b>${esc(orderNumber)}</b></div><div><span>${o.deliveryMode==='DELIVERY'?'تاریخ فاکتور':'تاریخ تسویه'}</span><b>${esc(invoiceDate)}</b></div>`;

  const settleLabels=Object.assign(Object.create(null),{CASH:'نقدی',POS:'پوز',CARD_TRANSFER:'کارت‌به‌کارت',CHECK:'چک',CREDIT:'معوق'});
  const methods=Array.isArray(p.settlementMethods)?p.settlementMethods:[];
  const amountKnown=v=>(typeof v==='number'||typeof v==='string')&&String(v).trim()!==''&&Number.isSafeInteger(Number(v))&&Number(v)>=0;
  const methodsComplete=methods.length>0&&methods.every(m=>m&&settleLabels[String(m.type||'').toUpperCase()]&&amountKnown(m.amount));
  const types=[...new Set(methods.map(m=>String(m?.type||'').toUpperCase()).filter(Boolean))];
  const due=amountKnown(p.amountDue)?Number(p.amountDue):(!p.deposit&&(p.depositAmount==null||Number(p.depositAmount)===0)&&amountKnown(p.totalAmount)?Number(p.totalAmount):null);
  const depositOnly=Array.isArray(p.settlementMethods)&&methods.length===0&&due===0&&Number(p.depositAmount)>0;
  const noCollection=o.transportWorkflow===1&&Number(p.totalAmount)===0&&methods.length===0;
  const settlementKind=noCollection?'بدون دریافتی؛ مرجوعی کامل':types.length>1?'ترکیبی':types.length===1?(settleLabels[types[0]]||'نامشخص'):(depositOnly?'از محل بیعانه':(settleLabels[p.settlementType]||'ثبت نشده'));
  const credit=noCollection?0:methodsComplete?methods.reduce((sum,m)=>sum+(String(m.type).toUpperCase()==='CREDIT'?Number(m.amount):0),0):(depositOnly?0:null);
  const account=p.debtAccount;
  const paid=account&&Array.isArray(account.receipts)&&account.receipts.every(r=>r&&amountKnown(r.amount)&&['CLEARED','PENDING','RETURNED','REVERSED'].includes(r.status))?account.receipts.filter(r=>r.status==='CLEARED').reduce((sum,r)=>sum+Number(r.amount),0):null;
  const current=account&&amountKnown(account.initial)&&paid!==null&&paid<=Number(account.initial)?Number(account.initial)-paid:null;
  const recordedSum=methodsComplete?methods.reduce((sum,m)=>sum+Number(m.amount),0):null;
  const checksKnown=methods.every(m=>String(m?.type||'').toUpperCase()!=='CHECK'||['CLEARED','PENDING','RETURNED','REVERSED'].includes(m.checkStatus));
  const outstandingChecks=methodsComplete&&checksKnown?methods.reduce((sum,m)=>sum+(String(m.type).toUpperCase()==='CHECK'&&m.checkStatus!=='CLEARED'?Number(m.amount):0),0):null;
  const balance=account?current:credit===null||!checksKnown?null:credit+(outstandingChecks||0);
  const paymentConsistent=recordedSum===null||due===null||recordedSum===due;
  const collected=paymentConsistent&&balance!==null&&amountKnown(p.totalAmount)&&balance<=Number(p.totalAmount)?Number(p.totalAmount)-balance:null;
  const paymentRows=methods.map(m=>{
    m=m||{};const type=String(m.type||'').toUpperCase();
    return `<div class="inv38-payment-row"><span>${esc(settlementMethodLabel(m))}</span><b>${amountKnown(m.amount)?money(m.amount):'نامشخص'}</b></div>`;
  }).join('');
  const paymentBox=`<section class="inv38-payment-box" aria-label="روش‌های تسویه"><h3>روش‌های تسویه</h3>${paymentRows||'<div class="inv38-payment-empty">تراکنشی ثبت نشده است.</div>'}</section>`;
  return `<div class="inv38-sheet inv38-compact inv38-settlement${recipient?' inv38-pickup-recipient':''}${distributionDelivery?' inv38-distribution':''}">
  <div class="inv38-head${recipient?' inv38-pickup-header':''}"><div class="inv38-meta inv38-settlement-meta${recipient?' inv38-pickup-recipient-meta':''}${distributionDelivery?' inv38-distribution-meta':''}">${invoiceHeaderMeta}
  </div></div><div class="inv38-rule"></div>

  <p class="inv38-scroll-hint">برای مشاهده همه ستون‌های اقلام، جدول را افقی پیمایش کنید.</p><div class="inv38-table-scroll" role="region" aria-label="اقلام فاکتور؛ برای مشاهده همه ستون‌ها افقی پیمایش کنید" tabindex="0"><table class="inv38-table"><thead><tr><th>#</th><th>محصول</th><th>وزن تحویلی</th><th>فی</th><th>مبلغ</th></tr></thead><tbody>${items.map((i,k)=>`<tr><td>${fa(String(k+1))}</td><td><b>${esc(i.product?.name||'—')}</b></td><td>${qty(i.deliveredKg)} کیلوگرم</td><td>${money(i.unitPrice)}</td><td>${money(i.finalAmount)}</td></tr>`).join('')}</tbody></table></div>
  <div class="inv38-bottom inv38-with-payments"><div class="inv38-total"><div class="inv38-total-box"><div><span>جمع اقلام</span><b>${money(subtotal)}</b></div><div><span>تخفیفات</span><b>${money(discount)}</b></div><div><span>اضافات</span><b>${money(additions)}</b></div>${returns?`<div><span>کسر مرجوعی</span><b>${money(returns)}</b></div>`:''}${p.deposit?`<div><span>بیعانه دریافت‌شده (${esc(({CASH:'نقدی',POS:'پوز',CARD_TRANSFER:'کارت‌به‌کارت'})[p.deposit?.type]||'')})${p.deposit?.reference?` • پیگیری ${esc(p.deposit.reference)}`:''}</span><b>${money(p.deposit.amount)}</b></div>${p.deposit.refundedAmount?`<div><span>استرداد دستی بیعانه</span><b>${money(p.deposit.refundedAmount)}</b></div><div><span>بیعانه لحاظ‌شده</span><b>${money(p.depositAmount)}</b></div>`:''}<div><span>مانده پس از کسر بیعانه (پیش از تسویه)</span><b>${amountKnown(p.amountDue)?money(p.amountDue):'نامشخص'}</b></div>`:''}<div class="grand"><span>مبلغ نهایی</span><b>${money(p.totalAmount)}</b></div><div class="inv38-collected"><span>مبلغ پرداختی</span><b>${collected===null?'نامشخص':money(collected)}</b></div><div class="inv38-payment-balance"><span>مانده حساب</span><b>${balance===null?'نامشخص':money(balance)}</b></div>${!paymentConsistent?'<small class="inv38-payment-note">جمع روش‌های ثبت‌شده با مبلغ قابل تسویه یکسان نیست؛ بررسی لازم است.</small>':''}</div></div>
  ${paymentBox}
  <div class="inv38-verify">
    ${o.deliveryMode==='DELIVERY'?transportDeliverySignatureHtml(customerNameRaw,p.driverName||o.transportInvoice?.driverName||o.transportHandovers?.['0']?.driverName||o.dispatch?.driverName):`<div class="inv38-verify-box"><div class="inv38-verify-grid"><div class="inv38-vitem"><span>${recipient?'امضاء تحویل‌گیرنده':'امضاء'}</span><strong>${signatureContact}</strong></div></div></div>`}
  </div>
  </div>
  </div>`;
}
async function printInvoice(id,run){return openInvoicePrint(id,run)}

/* ---------------- چاپ گزارش مدیریتی (v38) ---------------- */
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-action="rp38-print"]'); if(!el)return;
  try{
    const d=await api('/api/reports'); const remote=d.remote||{};
    BTPrintFrame.html(BTPrintDigits.documentHtml(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><title>گزارش مدیریتی بابل طیور</title><link rel="stylesheet" href="/design.css"><style>html{background:#fff}body{margin:0;padding:22px;background:#fff}@media print{body{padding:0}}</style></head><body>
    <div class="inv38-sheet">
      <div class="rpt38-head"><div class="inv38-brand"><img src="/logo.png" alt="بابل طیور"><div><h1>گزارش مدیریتی بابل طیور</h1><p>${esc(todayText())} • سامانه یکپارچه عملیات مشتریان</p></div></div></div>
      <div class="inv38-rule"></div>
      <div class="rpt38-kpis">
        <div><span>ورودی امروز</span><strong>${qty(d.gate?.today||0)}</strong></div>
        <div><span>سفارش‌های امروز</span><strong>${qty(d.sales?.todayOrders||0)}</strong></div>
        <div><span>درآمد ثبت‌شده</span><strong>${esc(moneyCompact(d.finance?.revenue||0))}</strong></div>
        <div><span>غیرحضوری آینده</span><strong>${qty(remote.scheduled||0)}</strong></div>
      </div>
      <h2 class="rpt38-h2">برنامه سفارش‌های غیرحضوری</h2>
      <table class="rpt38-table"><thead><tr><th>تاریخ</th><th>تعداد سفارش</th></tr></thead><tbody>${(remote.byDate||[]).map(x=>`<tr><td>${esc(dateLabel(x.date))}</td><td>${qty(x.count)}</td></tr>`).join('')||'<tr><td colspan="2">موردی ثبت نشده است.</td></tr>'}</tbody></table>
      <h2 class="rpt38-h2">ورودی بر اساس محله</h2>
      <table class="rpt38-table"><thead><tr><th>محله</th><th>تعداد مراجعه</th></tr></thead><tbody>${(d.gate.byDistrict||[]).map(x=>`<tr><td>${esc(x.district)}</td><td>${qty(x.count)}</td></tr>`).join('')||'<tr><td colspan="2">موردی ثبت نشده است.</td></tr>'}</tbody></table>
      <div class="inv38-foot">بابل طیور • گزارش داخلی • ${esc(todayText())}</div>
    </div>
    <script src="/print-ready.js"><\/script></body></html>`));
    }catch(err){toast(err.message)}
});
