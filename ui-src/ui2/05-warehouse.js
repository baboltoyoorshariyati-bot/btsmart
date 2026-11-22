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
      const rows=active==='preparing'?prepRows:incRows;
      const empty=active==='preparing'
        ?'<div class="sd-empty"><div>'+icon('scale',26)+'</div><strong>سفارش فروشگاهی در حال آماده‌سازی نیست</strong><span>پس از تأیید دریافت، سفارش فروشگاه برای سرویس‌بندی و ثبت وزن اینجا قرار می‌گیرد.</span></div>'
        :'<div class="sd-empty"><div>'+icon('store',26)+'</div><strong>سفارش فروشگاهی ورودی نیست</strong><span>وقتی فروش سفارش فروشگاه را به انبار ارسال کند، در همین سربرگ نمایش داده می‌شود.</span></div>';
      host.innerHTML=`<div class="wh38-store-pane">${wh38StoreTabs(active,counts)}<section class="wh38-store-panel" role="tabpanel" data-wh38-store-panel="${active}">${rows.length?wh38StoreList(rows,active):empty}</section></div>`;
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
  return `<div class="whd-doc whd-store-doc${print?' whd-store-print':''}"><div class="whd-head"><div class="whd-meta whd-store-meta"><span class="whd-store-identity">${print?'':'<span class="whd-label">نام فروشگاه:</span>'}<b>${shopHeader}</b></span><span><span class="whd-label">تحویل‌گیرنده:</span><b>${driver}</b></span><span><span class="whd-label">تاریخ ثبت سفارش:</span><b>${esc(formatDateTime24(o.createdAt))}</b></span><span><span class="whd-label">شماره سفارش:</span><b dir="ltr">${esc(fa(o.orderNo))}</b></span><span class="whd-document-number"><span>شماره سند انبار</span><b dir="ltr">${esc(fa(o.warehouseDocumentNo||'—'))}</b></span><span><span class="whd-label">نوع سفارش:</span><b>${o.storeOrderKind==='PARTIAL'?`جزئی${o.customerName?' — نام مشتری: '+esc(o.customerName):''}`:`روزانه — سرویس: ${run}`}</b></span></div></div>${whDocumentProducts(o.lines,print)}<section class="whd-acknowledgement"><p class="whd-declaration">اینجانب <strong style="text-decoration:underline;text-underline-offset:3px">${driver}</strong> اقلام فوق را صحیح و سالم از انبار جهت حمل و تحویل به ${shop} دریافت نمودم.</p><div class="whd-signature"><span>امضاء تحویل‌گیرنده</span><b>${driver}</b></div></section></div>`;
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
  if(pickup&&!confirm(`آیا کالا را واقعاً به ${selected.visit.recipient?.name||'تحویل‌گیرنده ثبت‌شده'} (${selected.visit.recipient?.phone||'—'}) داده‌اید؟ پس از ثبت، سند برای امضای دستی چاپ می‌شود.`))return;
  if(!pickup&&!confirm(selected?.deliveryMode==='DELIVERY'?'ارسال به معنی تحویل فیزیکی به راننده پخش است. کالا را تحویل داده‌اید؟ سند برای امضای راننده چاپ می‌شود.':'ارسال به معنی تحویل فیزیکی کالا به مشتری یا تحویل‌گیرنده است. تأیید می‌کنید؟ سند برای امضا چاپ می‌شود.'))return;
  try{if(pickup)result=await api('/api/pickup/'+encodeURIComponent(id)+'/handover',{method:'POST',body:JSON.stringify({items,draftRevision,physicalHandoverConfirmed:true})});else result=await api('/api/orders/'+id+'/warehouse',{method:'POST',body:JSON.stringify({items,draftRevision,physicalHandoverConfirmed:true})});}
  catch(e){toast(e.message);return;}
  if(pickup){try{whPrintDocument(result.handover.document,0);}catch(e){toast('تحویل ثبت شد؛ چاپ را از بخش تحویل‌شده تکرار کنید.');}if(app.page==='warehouse'){toast('تحویل واقعی ثبت شد؛ سند را چاپ و امضای دستی تحویل‌گیرنده را دریافت کنید.');wh38Shell('preparing');void refreshIndicators();}return;}
  if(app.page!=='warehouse')return;
  void refreshIndicators();
  if(!items.some(i=>!i.outOfStock&&i.deliveredKg>0)){toast('عدم موجودی ثبت و برای فروش ارسال شد؛ کالایی تحویل نشده است.');wh38Shell('preparing');return;}
  app.sub.warehouse='delivered';renderNav();wh38Shell('delivered');
  try{const doc=result.handover?.document||(await api('/api/warehouse/delivered/'+encodeURIComponent(id))).order;whPrintDocument(doc,0);toast('تحویل فیزیکی ثبت شد؛ سند را چاپ و امضای تحویل‌گیرنده را دریافت کنید.');}catch(e){toast('تحویل ثبت شد؛ چاپ را از بخش تحویل‌شده تکرار کنید: '+e.message);}


}
/* ---------------- v37.4.0 — سفارش فروشگاه: برگهٔ دو سرویس ارسال انبار ---------------- */
const SR38_STATUS_LABEL={AWAITING_R1:'در انتظار سرویس اول',IN_SHIPPING:'وزن ذخیره‌شده',MOVED_R2:'در انتظار سرویس دوم',COMPLETED:'تکمیل‌شده',CLOSED_SHORT:'بسته با کسری'};
