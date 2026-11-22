async function renderWarehouse(){
  if(app.timer){clearInterval(app.timer);app.timer=null}
  const whTab=app.sub.warehouse||'incoming';const whStatus=whTab==='preparing'?'WAREHOUSE_PREPARING':'WAREHOUSE_PENDING';let orders=(await fetchPagedList('/api/orders?status='+whStatus,'orders')).orders||[];if(whTab==='stores'){orders=(await fetchPagedList('/api/orders','orders')).orders||[];orders=orders.filter(o=>o.orderType==='STORE'&&['WAREHOUSE_PENDING','WAREHOUSE_PREPARING'].includes(o.status));}if(whTab==='history'){return renderWarehouseHistory();}
  $('#content').innerHTML=`<div class="warehouse-v21"><aside class="warehouse-queue-panel"><div class="queue-panel-head"><div><span class="eyebrow">WAREHOUSE QUEUE</span><h2>صف سفارش‌ها</h2><p>به‌صورت خودکار بروزرسانی می‌شود.</p></div><span class="queue-total"><strong>${qty(orders.length)}</strong><span>منتظر اقدام</span></span></div><div id="warehouseQueueV21">${warehouseQueueRowsV21(orders)}</div></aside><main class="warehouse-workbench"><div id="warehouseEditor" class="warehouse-editor-v21"><div class="workbench-empty"><div class="empty-icon">${icon('scale',28)}</div><h3>یک سفارش را انتخاب کنید</h3><p>فرم تحویل کامل سفارش در همین صفحه باز می‌شود.</p></div></div></main></div>`;
  bindWarehouseV21(); app.timer=setInterval(fetchWarehouseLiveV21,2500);
}
function warehouseQueueRowsV21(orders){return orders.map(o=>`<button class="warehouse-queue-row ${app.selectedWarehouse===o.id?'selected':''}" data-action="open-warehouse" data-id="${o.id}"><span class="warehouse-queue-avatar">${esc(initials(storeAwareOrderName(o)))}</span><span class="warehouse-queue-main"><b>${esc(storeAwareOrderName(o))}</b><small>${orderKindLabel(o)}${o.scheduledDate?' • '+dateLabel(o.scheduledDate):''}</small></span><span class="warehouse-queue-time">${dt(o.updatedAt||o.createdAt)}</span>${icon('arrow',17)}</button>`).join('')||'<div class="empty">صف انبار خالی است.</div>'}
async function fetchWarehouseLiveV21(){try{const orders=(await api('/api/orders?status=WAREHOUSE_PENDING')).orders||[];const q=$('#warehouseQueueV21');if(q)q.innerHTML=warehouseQueueRowsV21(orders);if(app.selectedWarehouse&&!orders.find(o=>o.id===app.selectedWarehouse)){app.selectedWarehouse=null;const ed=$('#warehouseEditor');if(ed)ed.innerHTML='<div class="workbench-empty"><div class="empty-icon">'+icon('check',28)+'</div><h3>صف انبار به‌روز شد</h3><p>سفارش انتخاب‌شده از صف خارج شده است.</p></div>';}}catch{}}
function bindWarehouseV21(){$('#content').onclick=async e=>{const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;if(a==='open-warehouse')return openWarehouse(el.dataset.id);if(a==='confirm-warehouse')return confirmWarehouseV21(el.dataset.id);if(a==='return-item-sales')return returnSales(el.dataset.id,el.dataset.itemId);if(a==='return-sales')return returnSales(el.dataset.id)};}
async function openWarehouse(id){try{app.selectedWarehouse=id;const d=await api('/api/orders/'+id);renderWarehouseEditorV21(d.order)}catch(e){toast(e.message)}}
function renderWarehouseEditorV21(o){
  const items=(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED');
  const totalReq=items.reduce((s,i)=>s+n(i.requestedQty),0);
  $('#warehouseEditor').innerHTML=`<section class="warehouse-sheet-v21"><div class="warehouse-sheet-head"><div><button class="back-link" data-action="return-sales" data-id="" style="display:none"></button><span class="eyebrow">DELIVERY WORKBENCH</span><h2>${esc(storeAwareOrderName(o))}</h2><p>${esc(storeAwareOrderPhone(o))} <span class="dot-sep">•</span> سفارش <b>${esc(fa(o.orderNo||'—'))}</b> ${orderKindBadge(o)}${o.scheduledDate?`<span class="date-chip">ورود به انبار ${esc(dateLabel(o.scheduledDate))}</span>`:''}${o.deliveryDate?`<span class="date-chip">تاریخ تحویل ${esc(dateLabel(o.deliveryDate))}</span>`:''}</p></div><div class="warehouse-head-status"><span class="live-pulse"><i></i> در حال کار</span>${badge(o.status)}</div></div><div class="warehouse-progress"><span class="done">ورود</span><i></i><span class="done">فروش</span><i></i><span class="active">انبار</span><i></i><span>تسویه</span><i></i><span>خروج</span></div><div class="warehouse-note-v21">برای هر قلم وزن واقعی تحویلی را فقط به کیلوگرم وارد کنید. در صورت نبود کالا، «عدم موجودی» را فعال کنید؛ این قلم با وزن صفر برای تسویه ثبت می‌شود.</div><div class="warehouse-items-v21">${items.map((i,k)=>warehouseItemCardV21(o,i,k)).join('')}</div><div class="warehouse-bottom-bar"><div><span>جمع وزن تحویلی</span><strong id="warehouseTotalKgV21">۰ کیلوگرم</strong><small>مقدار درخواستی: ${qty(totalReq)} واحد</small></div><div class="toolbar"><button class="btn btn-secondary btn-lg" data-action="return-sales" data-id="${o.id}">${icon('arrow',17)} ارجاع کل سفارش به فروش</button><button class="btn btn-primary btn-lg" data-action="confirm-warehouse" data-id="${o.id}">${icon('check',18)} ثبت تحویل و ارسال به تسویه</button></div></div></section>`;
  $$('#warehouseEditor [data-weight]').forEach(i=>i.addEventListener('input',updateWarehouseTotalV21));
  $$('#warehouseEditor [data-oos]').forEach(c=>c.addEventListener('change',()=>{const id=c.dataset.oos;const w=$(`#warehouseEditor [data-weight="${id}"]`);if(w){w.disabled=c.checked;if(c.checked)w.value='';}updateWarehouseTotalV21()}));
  updateWarehouseTotalV21();
}
function warehouseItemCardV21(o,i,k){return `<article class="warehouse-item-card-v21"><div class="item-index-v21">${fa(String(k+1))}</div><div class="item-product-v21"><div class="product-title-row"><div><strong>${esc(i.product?.name||'—')}</strong></div>${badge(i.itemStatus)}</div><div class="request-strip"><span>درخواست مشتری</span><b>${qty(i.requestedQty)} ${esc(i.requestedUnit)}</b></div></div><div class="item-description-v21"><span>توضیحات ردیف</span><p>${esc(i.description||'بدون توضیحات')}</p></div><div class="delivery-entry-v21"><label>وزن تحویلی نهایی</label><div class="weight-editor-v21"><input data-weight="${i.id}" type="text" inputmode="decimal" placeholder="۰٫۰۰۰"><span>کیلوگرم</span></div><label class="oos-check-v21"><input data-oos="${i.id}" type="checkbox"><span><b>عدم موجودی</b><small>این قلم موجود نیست</small></span></label></div><div class="item-actions-v21"><button class="btn btn-ghost btn-sm" data-action="return-item-sales" data-id="${o.id}" data-item-id="${i.id}">${icon('arrow',14)} ارجاع این ردیف به فروش</button></div></article>`}
function updateWarehouseTotalV21(){const total=$$('#warehouseEditor [data-weight]').reduce((s,e)=>s+(e.disabled?0:n(e.value)),0);const el=$('#warehouseTotalKgV21');if(el)el.textContent=qty(total)+' کیلوگرم';}
async function confirmWarehouseV21(id){const items=$$('#warehouseEditor [data-weight]').map(w=>{const oos=$(`#warehouseEditor [data-oos="${w.dataset.weight}"]`)?.checked||false;return {itemId:w.dataset.weight,deliveredKg:oos?0:n(w.value),outOfStock:oos}});if(!items.length)return toast('قلمی برای ثبت تحویل وجود ندارد.');if(items.some(x=>!x.outOfStock&&x.deliveredKg<=0))return toast('برای همه اقلام موجود، وزن تحویلی را وارد کنید.');try{await api('/api/orders/'+id+'/warehouse',{method:'POST',body:JSON.stringify({items})});toast('تحویل ثبت شد و سفارش برای تسویه ارسال شد.');app.selectedWarehouse=null;await renderWarehouse();}catch(e){toast(e.message)}}
async function returnSales(id,itemId=''){const reason=prompt('دلیل ارجاع به فروش را وارد کنید:','اصلاح سفارش / اصلاح وزن')||'';if(!reason)return;try{await api('/api/orders/'+id+'/return-sales',{method:'POST',body:JSON.stringify({itemId,reason})});toast('ارجاع به فروش ثبت شد.');app.selectedWarehouse=null;await renderWarehouse()}catch(e){toast(e.message)}}

/* reports — same design language + remote scheduling */
async function renderReports(){
  const d=await api('/api/reports'); const districts=d.gate.byDistrict||[]; const max=Math.max(1,...districts.map(x=>x.count)); const remote=d.remote||{};
  $('#content').innerHTML=`<div class="reports-v21"><section class="report-hero"><div><span class="eyebrow">MANAGEMENT INSIGHTS</span><h2>مرکز گزارش‌گیری</h2><p>عملکرد عملیاتی، سفارش‌های آینده و وضعیت مالی در یک نمای یکپارچه.</p></div><button class="btn btn-primary" data-action="print-page">${icon('receipt',17)} چاپ گزارش</button></section><div class="report-kpis-v21">${reportMetric('ورودی امروز',d.gate.today,'نگهبانی','gate')}${reportMetric('سفارش‌های امروز',d.sales.todayOrders,'فروش','sales')}${reportMetric('تحویل‌شده',d.warehouse.deliveredOrders,'انبار','warehouse')}${reportMetric('درآمد ثبت‌شده',moneyCompact(d.finance.revenue),'مالی','receipt',true)}${reportMetric('غیرحضوری برنامه‌ریزی‌شده',remote.scheduled||0,'آینده','calendar')}</div><div class="report-grid-v21"><section class="report-panel"><div class="section-head"><div><span class="eyebrow">REMOTE SCHEDULE</span><h3>تقویم سفارش‌های غیرحضوری</h3><p>تعداد سفارش‌های برنامه‌ریزی‌شده به تفکیک تاریخ</p></div></div><div class="date-bars">${(remote.byDate||[]).filter(x=>x.date!=='بدون تاریخ').slice(0,12).map(x=>`<div class="date-bar-row"><span>${dateLabel(x.date)}</span><div class="date-track"><div style="width:${Math.max(8,Math.round(x.count/Math.max(1,...(remote.byDate||[]).map(i=>i.count))*100))}%"></div></div><b>${qty(x.count)}</b></div>`).join('')||'<div class="empty">سفارش غیرحضوری برنامه‌ریزی‌شده‌ای ثبت نشده است.</div>'}</div></section><section class="report-panel"><div class="section-head"><div><span class="eyebrow">PROCESS STATUS</span><h3>وضعیت صف‌ها</h3><p>تصویر فعلی عملیات</p></div></div><div class="process-report-grid"><div><strong>${qty(d.sales.pendingWarehouse)}</strong><span>صف انبار</span></div><div><strong>${qty(d.sales.pendingSettlement)}</strong><span>آماده تسویه</span></div><div><strong>${qty(d.finance.readyExit)}</strong><span>آماده خروج</span></div><div><strong>${qty(remote.dueToday||0)}</strong><span>غیرحضوری امروز</span></div></div></section></div><div class="report-grid-v21"><section class="report-panel"><div class="section-head"><div><span class="eyebrow">VISIT DISTRIBUTION</span><h3>ورودی بر اساس محله</h3></div></div><div class="date-bars">${districts.map(x=>`<div class="date-bar-row"><span>${esc(x.district)}</span><div class="date-track"><div style="width:${Math.max(8,Math.round(x.count/max*100))}%"></div></div><b>${qty(x.count)}</b></div>`).join('')||'<div class="empty">داده‌ای برای نمایش نیست.</div>'}</div></section><section class="report-panel remote-highlight"><div><span class="eyebrow">REMOTE ORDERS</span><h3>سفارش‌های غیرحضوری</h3><p>کل ثبت‌شده: <strong>${qty(remote.total||0)}</strong></p></div><div class="remote-highlight-number">${qty(remote.scheduled||0)}</div><span>در انتظار تاریخ تحویل</span></section></div></div>`;
}
function reportMetric(label,val,hint,ico,text=false){return `<article class="report-metric-v21"><span class="metric-icon">${icon(ico,20)}</span><div><small>${esc(label)}</small><strong>${text?val:qty(val)}</strong><span>${esc(hint)}</span></div></article>`}

/* replace legacy warehouse/sales tab timers if referenced */


/* v21 interaction bridge: actions that live outside module-specific binders */
document.addEventListener('click',async e=>{
  const pageBtn=e.target.closest('[data-page]');
  if(pageBtn && pageBtn.closest('#content')){e.preventDefault(); const p=pageBtn.dataset.page; if(p) await go(p); return;}
  const actionEl=e.target.closest('[data-action]');
  if(!actionEl) return;
  if(actionEl.dataset.action==='print-page'){
    try{
      const d=await api('/api/reports');
      const remote=d.remote||{};
      BTPrintFrame.html(BTPrintDigits.documentHtml(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><title>گزارش مدیریتی بابل طیور</title><style>body{font-family:"B Yekan",Tahoma,sans-serif;color:#1b2027;padding:28px}h1{font-size:24px}h2{font-size:17px;border-bottom:1px solid #ddd;padding-bottom:8px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.box{border:1px solid #ddd;border-radius:12px;padding:12px}.box strong{display:block;font-size:22px;color:#b3132a;margin-top:5px}table{width:100%;border-collapse:collapse;margin-top:15px}th,td{border:1px solid #ddd;padding:8px;font-size:11px;text-align:right}@media print{body{padding:0}}</style></head><body><h1>گزارش مدیریتی بابل طیور</h1><p>${esc(todayText())}</p><div class="grid"><div class="box">ورودی امروز<strong>${qty(d.gate?.today||0)}</strong></div><div class="box">سفارش امروز<strong>${qty(d.sales?.todayOrders||0)}</strong></div><div class="box">درآمد<strong>${esc(money(d.finance?.revenue||0))}</strong></div><div class="box">غیرحضوری آینده<strong>${qty(remote.scheduled||0)}</strong></div></div><h2>برنامه سفارش‌های غیرحضوری</h2><table><thead><tr><th>تاریخ</th><th>تعداد سفارش</th></tr></thead><tbody>${(remote.byDate||[]).map(x=>`<tr><td>${dateLabel(x.date)}</td><td>${qty(x.count)}</td></tr>`).join('')}</tbody></table><script src="/print-ready.js"><\/script></body></html>`));
    }catch(err){toast(err.message)}
  }
});
// v21 final UI refinements
function transportOrderServiceHtml(o,canReturn){
 if(o.transportWorkflow!==1||o.deliveryMode!=='DELIVERY')return '';
 const runs=o.orderType==='STORE'?(o.storeOrderKind==='PARTIAL'?[1]:[1,2]):[0];
 return `<section class="section-space"><h3>برنامه ترابری</h3>${runs.map(run=>{const key=String(run),a=o.transportAssignments?.[key],hand=o.transportHandovers?.[key],trip=o.transportStoreTrips?.[key],status=trip?.status==='CLOSED'?'مدارک به فروش بازگشت':trip?.status==='RECEIPT_CONFIRMED'?'دریافت فروشگاه تأیید شد':trip?.status==='IN_TRANSIT'?'در مسیر':o.transportStoreReviews?.[key]?'منتظر تأیید خروج نگهبانی':hand?'منتظر بررسی فروش':'در انتظار تحویل انبار';return `<div class="transport-plan-detail-row"><b>${o.storeOrderKind==='PARTIAL'?'محموله سفارش جزئی':run?`سرویس ${run===1?'اول':'دوم'}`:'سفارش مشتری'}</b><span>راننده: ${esc(a?.driverName||'تعیین نشده')}</span><span>تماس: ${esc(fa(a?.driverPhone||'—'))}</span><span>خودرو: ${esc(a?.vehicleType||'—')} ${esc(fa(a?.vehiclePlate||''))}</span>${run?`<span>${esc(status)}</span>`:''}${run&&hand&&!o.transportStoreReviews?.[key]&&!trip&&canReturn&&app.features?.experimentalTransport?`<button type="button" class="btn btn-primary btn-sm" data-store-review-detail="${run}">بررسی سند و تأیید فروش</button>`:''}${run&&trip?.status==='RECEIPT_CONFIRMED'&&canReturn&&app.features?.experimentalTransport?`<button type="button" class="btn btn-primary btn-sm" data-store-transport-return="${run}">ثبت بازگشت مدارک همین سرویس</button>`:''}</div>`;}).join('')}</section>`;
}
function salesStoreProcessingDetailActions(o){
  const id=esc(o.id);
  const returned=o.status==='RETURNED_TO_SALES'?`<button type="button" class="btn btn-secondary" data-action="edit-returned-order" data-id="${id}">${icon('edit',16)} اصلاح سفارش</button><button type="button" class="btn btn-primary" data-action="resubmit-order" data-id="${id}">${icon('send',16)} ارسال مجدد به انبار</button>`:'';
  const finalize=o.dispatch?.status==='DELIVERED'?`<button type="button" class="btn btn-primary" data-action="sales-finalize-driver-delivery" data-id="${id}">${icon('check',16)} تأیید نهایی تحویل${o.dispatch.run?` سرویس ${o.dispatch.run===2?'دوم':'اول'}`:''}</button>`:'';
  const returns=o.transportWorkflow===1&&o.deliveryMode==='DELIVERY'&&app.features?.experimentalTransport?(o.storeOrderKind==='PARTIAL'?[1]:[1,2]).filter(run=>o.transportStoreTrips?.[String(run)]?.status==='RECEIPT_CONFIRMED').map(run=>`<button type="button" class="btn btn-primary btn-sm" data-store-transport-return="${run}">ثبت بازگشت مدارک ${o.storeOrderKind==='PARTIAL'?'محموله':'سرویس '+(run===1?'اول':'دوم')}</button>`).join(''):'';
  return returned+finalize+storeSalesReviewButtons(o)+storeSalesDocumentButtons(o,false,true)+returns;
}
async function openOrderDetails(id,options={}){
  const notices=captureEntityNotices('order',id);
  try{
    const d=await api('/api/orders/'+id); const o=d.order||{}; const items=o.items||[];
    const activeItems=items.filter(i=>i.itemStatus!=='CANCELLED');
    const storeProcessing=options.storeProcessing&&app.page==='sales'&&can('sales')&&o.orderType==='STORE'&&['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','RETURNED_TO_SALES'].includes(o.status);
    const totalRequested=activeItems.reduce((s,i)=>s+n(i.requestedQty),0);
    const totalDelivered=activeItems.reduce((s,i)=>s+n(i.deliveredKg||0),0);
    // v37.35.0 — وزن هر سرویس ستون جدا در همان فهرست اقلام است؛ «خلاصهٔ» چیپی بالای فرم حذف شد
    // تا اطلاعات سفارش دو تکه نباشد. پیش از شروع وزن‌کشی انبار (مثلاً ورودی فروش) ستونی نمی‌آید
    // و فقط فهرست محصول دیده می‌شود.
    const runView={};((o.storeRun&&o.storeRun.items)||[]).forEach(v=>{runView[v.itemId]=v});
    const showRunCols=o.storeOrderKind!=='PARTIAL'&&!!(o.storeRun&&o.storeRun.enabled)&&(!!o.storeRun.finalizedAt||Object.values(runView).some(v=>n(v.r1Kg)>0||n(v.r2Kg)>0));
    openModal('جزئیات کامل سفارش',`<div class="order-details-modal v21-detail-modal">
      <div class="order-detail-head">
        <div><span class="eyebrow">ORDER DETAIL</span><h2>${esc(fa(o.orderNo||'—'))}</h2><p>${esc(storeAwareOrderName(o))} • ${esc(storeAwareOrderPhone(o))}</p></div>
        <div class="detail-status-stack">${orderKindBadge(o)}${o.scheduledDate?`<span class="date-chip">ورود به انبار ${esc(dateLabel(o.scheduledDate))}</span>`:''}${o.deliveryDate?`<span class="date-chip">تاریخ تحویل ${esc(dateLabel(o.deliveryDate))}</span>`:''}${badge(o.status)}</div>
      </div>
      <div class="detail-grid detail-grid-6">
        <div><span>نوع سفارش</span><b>${orderKindLabel(o)}</b></div>
        <div><span>زمان ثبت</span><b>${dt(o.createdAt)}</b></div>
        <div><span>آخرین اقدام</span><b>${dt(o.updatedAt||o.createdAt)}</b></div>
        <div><span>تعداد اقلام</span><b>${qty(activeItems.length)} قلم</b></div>
        <div><span>مقدار درخواستی</span><b>${qty(totalRequested)}</b></div>
        <div><span>وزن تحویلی</span><b>${qty(totalDelivered)} کیلوگرم</b></div>
        <div><span>محل ارسال</span><b>${esc(o.dispatchPlace||'—')}</b></div>
      </div>
      ${o.transportWorkflow===1?`<p><b>روش تحویل:</b> ${o.deliveryMode==='DELIVERY'?'ارسال توسط پخش':'تحویل در انبار'}</p>`:''}
      ${depositSummaryHtml(o.deposit)}
      ${transportOrderServiceHtml(o,can('sales')&&!storeProcessing)}
      ${warehouseReturnNoteHtml(o)}
      ${app.page==='sales'&&o.orderType==='STORE'?(o.storeCancellationRequests||[]).map(r=>`<div class="detail-note"><div><b>درخواست لغو فروشگاه: ${r.status==='PENDING'?'در انتظار بررسی':'بررسی‌شده'}</b><p>${esc(r.reason)}</p>${r.resolution?`<p>نتیجه: ${esc(r.resolution)}</p>`:''}${r.status==='PENDING'?`<button type="button" class="btn btn-secondary" data-store-cancel-review="${esc(r.id)}">ثبت نتیجه بررسی</button>`:''}</div></div>`).join(''):''}
      ${o.notes?`<div class="detail-note"><span>${icon('info',16)}</span><div><b>یادداشت سفارش</b><p>${esc(o.notes)}</p></div></div>`:''}
      <div class="table-wrap section-space"><table class="table v21-detail-table"><thead><tr><th>#</th><th>محصول</th><th>مقدار درخواستی</th><th>واحد</th><th>توضیحات</th>${showRunCols?'<th>وزن سرویس اول</th><th>وزن سرویس دوم</th>':''}<th>وزن تحویلی</th><th>وضعیت</th></tr></thead><tbody>${items.map((i,k)=>`<tr class="${i.itemStatus==='CANCELLED'?'row-cancelled':''}"><td>${fa(String(k+1))}</td><td><strong>${esc(i.product?.name||'—')}</strong></td><td>${qty(i.requestedQty)}</td><td>${esc(i.requestedUnit||'—')}</td><td>${esc(i.description||'—')}</td>${showRunCols?`<td>${runView[i.id]&&n(runView[i.id].r1Kg)>0?qty(runView[i.id].r1Kg)+' کیلوگرم':'—'}</td><td>${runView[i.id]&&n(runView[i.id].r2Kg)>0?qty(runView[i.id].r2Kg)+' کیلوگرم':'—'}</td>`:''}<td>${i.deliveredKg==null?'—':qty(i.deliveredKg)+' کیلوگرم'}</td><td>${badge(i.itemStatus)}</td></tr>`).join('')}</tbody></table></div>
      <div class="sticky-actions"><span class="subtle">تمام تغییرات و ارجاع‌ها در سوابق مدیریتی ثبت می‌شوند.</span><div class="toolbar"><button class="btn btn-secondary" data-action="close-modal">بستن</button>${app.page==='warehouse'&&o.status==='WAREHOUSE_PENDING'?`<button class="btn btn-primary" data-wh-accept-order>تأیید دریافت و ورود به آماده‌سازی</button>`:''}${app.page==='warehouse'&&o.status==='WAREHOUSE_PREPARING'?`<button class="btn btn-primary" data-wh-start-order>شروع آماده‌سازی</button>`:''}${app.page==='warehouse'&&app.features?.pickupStaging&&o.visit?.status==='PICKUP_PRESENT'&&!o.pickupCancellation?`<button class="btn btn-secondary" data-wh-pickup-cancel>ثبت انصراف بدون تحویل</button>`:''}${o.status==='RETURNED_TO_SALES'&&!storeProcessing?`<button class="btn btn-secondary" data-action="edit-returned-order" data-id="${o.id}">${icon('edit',16)} اصلاح سفارش</button><button class="btn btn-primary" data-action="resubmit-order" data-id="${o.id}">${icon('send',16)} ارسال مجدد به انبار</button>`:''}${storeProcessing?salesStoreProcessingDetailActions(o):''}${app.page==='sales'&&can('sales')&&o.orderType==='STORE'&&o.status==='STORE_PENDING_SALES'?`<button class="btn btn-secondary" data-action="sales-edit-store-order" data-id="${esc(o.id)}">${icon('edit',16)} ویرایش سفارش</button><button class="btn btn-secondary" data-action="store-approve-v25" data-id="${esc(o.id)}">${icon('calendar',16)} ارسال با زمان‌بندی</button><button class="btn btn-primary" data-action="store-quick-send-v40" data-id="${esc(o.id)}">${icon('send',16)} ارسال سریع</button>`:''}</div></div>
    </div>`)
    const reviewCancel=$('#modal [data-store-cancel-review]');if(reviewCancel)reviewCancel.onclick=async()=>{
      const resolution=prompt('نتیجه بررسی، اقدامات انجام‌شده یا اقدامات لازم را بنویسید. این ثبت، سفارش یا اسناد را خودکار لغو نمی‌کند:');if(!resolution?.trim())return;
      if(!confirm('نتیجه بررسی به فروشگاه اطلاع داده شود؟'))return;reviewCancel.disabled=true;
      try{await api('/api/sales/store-cancellation-requests/'+encodeURIComponent(o.id)+'/review',{method:'POST',body:JSON.stringify({requestId:reviewCancel.dataset.storeCancelReview,resolution:resolution.trim()})});toast('نتیجه بررسی ثبت شد؛ وضعیت سفارش تغییر نکرد.');if(app.salesCache)app.salesCache.fetchedAt=0;await fetchSalesCache(true);await renderSales('stores');await openOrderDetails(o.id);await refreshIndicators();}catch(e){reviewCancel.disabled=false;toast(e.message);}
    };
    const accept=$('#modal [data-wh-accept-order]');if(accept)accept.onclick=async()=>{accept.disabled=true;try{await api('/api/orders/'+encodeURIComponent(o.id)+'/warehouse/accept',{method:'POST'});await wh38Shell('incoming');closeModal();await refreshIndicators();}catch(e){accept.disabled=false;toast(e.message);}};
    // v1.1.11 — عملیات ثانویهٔ انبار از جدول به صفحهٔ جزئیات منتقل شد (جدول تک‌دکمه‌ای: فقط «جزئیات سفارش»)
    const whStart=$('#modal [data-wh-start-order]');if(whStart)whStart.onclick=async()=>{whStart.disabled=true;try{const r=await api('/api/orders/'+encodeURIComponent(o.id)+'/warehouse/start-preparing',{method:'POST',body:'{}'});toast('آماده‌سازی سفارش ثبت شد.');closeModal();if(r.order&&r.order.storeRun&&r.order.storeRun.enabled)sr38Sheet(r.order);else wh38Sheet(r.order);}catch(e){whStart.disabled=false;toast(e.message);}};
    const whCancel=$('#modal [data-wh-pickup-cancel]');if(whCancel)whCancel.onclick=async()=>{const reason=prompt('دلیل انصراف را وارد کنید:');if(!reason?.trim())return;if(!confirm('آیا انبار تأیید می‌کند هیچ کالایی به این مراجعه تحویل نشده است؟'))return;whCancel.disabled=true;try{await api('/api/pickup/'+encodeURIComponent(o.id)+'/cancellation',{method:'POST',body:JSON.stringify({reason,confirmedNoGoods:true})});toast('عدم تحویل ثبت شد و در انتظار تأیید فروش است.');closeModal();await refreshIndicators();wh38Shell(app.wh38.phase);}catch(e){whCancel.disabled=false;toast(e.message);}};
    document.querySelectorAll('#modal [data-store-review-detail]').forEach(button=>{button.onclick=()=>salesStoreReview(o.id,Number(button.dataset.storeReviewDetail));});
    document.querySelectorAll('#modal [data-store-transport-return]').forEach(button=>{button.onclick=async()=>{const run=Number(button.dataset.storeTransportReturn);if(!confirm(`آیا مدارک سرویس ${run===1?'اول':'دوم'} پس از دریافت فروشگاه به فروش بازگشته است؟`))return;button.disabled=true;try{const result=await api('/api/sales/store-transport/'+encodeURIComponent(o.id)+'/'+run+'/return',{method:'POST',body:JSON.stringify({documentsReturned:true})});toast(result.orderClosed?'مدارک ثبت شد و سفارش فروشگاه بسته شد.':'بازگشت مدارک این سرویس ثبت شد.');if(app.salesCache)app.salesCache.fetchedAt=0;if(app.page==='sales'&&app.sub.sales==='delivery'){const data=await fetchSalesCache(true);paintSalesPaneV29('delivery',data);}else if(app.page==='sales')await renderSales('stores');await openOrderDetails(o.id,{storeProcessing:!!storeProcessing});}catch(err){button.disabled=false;toast(err.message);}};});
    finishEntityNotices(notices);return true;
  }catch(e){toast(e.message);return false;}
}


function renderRemoteOrdersV21(orders){
  const future=orders.filter(o=>o.status==='SCHEDULED_REMOTE').length;
  const due=orders.filter(o=>o.status!=='SCHEDULED_REMOTE').length;
  return `<div class="remote-workspace remote-workspace-v21">
    <section class="remote-create op-panel">
      <div class="op-panel-head">
        <div><span class="eyebrow">REMOTE ORDER DESK</span><h2>ثبت سفارش غیرحضوری</h2><p>برای مشتریان تلفنی یا هماهنگ‌شده، سفارش را امروز یا برای تاریخ آینده ثبت کنید.</p></div>
        <div class="remote-kpi-mini"><span>برنامه‌ریزی‌شده</span><strong>${qty(future)}</strong><small>تا زمان سررسید در صف جداگانه باقی می‌مانند</small></div>
      </div>
      <form id="remoteOrderForm" class="remote-form">
        <div class="remote-customer-grid">
          <div class="field"><label>نام مشتری</label><div class="input-shell op-input"><span>${icon('user',17)}</span><input name="name" required placeholder="نام و نام خانوادگی"></div></div>
          <div class="field"><label>شماره تماس</label><div class="input-shell op-input"><span>${icon('phone',17)}</span><input name="phone" required inputmode="tel" placeholder="۰۹۱۲ ..."></div></div>
          ${jalaliInput('تاریخ ورود به انبار','scheduledDate',today(),true)}
          <div class="field remote-notes"><label>یادداشت کلی سفارش</label><div class="input-shell op-input op-textarea"><textarea name="notes" rows="2" maxlength="1000" placeholder="زمان مراجعه، هماهنگی مشتری یا نکات مهم سفارش..."></textarea></div></div>
        </div>
        <div class="remote-items-head"><div><span class="eyebrow">ORDER LINES</span><h3>اقلام سفارش</h3><p>هر ردیف محصول، مقدار، واحد و توضیحات اختصاصی خودش را دارد.</p></div></div>
        <div id="remote-lines" class="op-lines"></div>
        <div class="op-add-row"><button type="button" class="btn btn-secondary btn-lg" data-action="remote-add-line">${icon('plus',17)} افزودن ردیف جدید</button><span>واحدهای مجاز: کیلوگرم، بسته، عدد، کارتن</span></div>
        <div class="remote-submit-bar"><div><strong>ثبت و برنامه‌ریزی سفارش</strong><small>سفارش امروز مستقیماً وارد صف انبار می‌شود؛ سفارش آینده در فهرست برنامه‌ریزی می‌ماند و در تاریخ تعیین‌شده فعال می‌شود.</small></div><button class="btn btn-primary btn-lg" type="submit">${icon('send',18)} ثبت سفارش غیرحضوری</button></div>
      </form>
    </section>
    <aside class="remote-list op-panel">
      <div class="op-panel-head compact"><div><span class="eyebrow">PLANNED & DUE</span><h2>سفارش‌های غیرحضوری</h2><p>پیگیری، مشاهده جزئیات و ویرایش سفارش‌های آینده</p></div><span class="queue-total"><strong>${qty(orders.length)}</strong><span>سفارش فعال</span></span></div>
      <div class="remote-filter-bar"><div class="search-bar-v21"><span>${icon('search',17)}</span><input id="remoteSearchV21" placeholder="جستجوی نام مشتری یا شماره تماس"></div><div class="input-shell op-input remote-filter-date"><span>${icon('calendar',16)}</span><input id="remoteDateV21" class="jalali-date-filter" placeholder="جستجوی تاریخ ۱۴۰۵/۰۷/۱۴" inputmode="numeric" autocomplete="off"></div></div>
      <div id="remoteOrderList" class="remote-list-rows">${remoteOrderRows(orders)}</div>
    </aside>
  </div>`;
}

function remoteOrderRows(orders){
  return orders.map(o=>`<article class="remote-row-v21">
    <div class="remote-row-top"><div><span class="order-code">${esc(fa(o.orderNo||'—'))}</span>${orderKindBadge(o)}${o.scheduledDate?`<span class="date-chip">${dateLabel(o.scheduledDate)} • ${esc((o.scheduledAt||'').slice(11,16)||'—')}</span>`:''}</div>${badge(o.status)}</div>
    <div class="remote-row-main"><div class="customer-avatar-v21 small">${esc(initials(storeAwareOrderName(o)))}</div><div><b>${esc(storeAwareOrderName(o))}</b><small>${esc(storeAwareOrderPhone(o))}</small></div></div>
    <div class="remote-row-items">${(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').slice(0,2).map(i=>`<div><span>${esc(i.product?.name||'—')}</span><b>${qty(i.requestedQty)} ${esc(i.requestedUnit||'')}</b></div>`).join('')}${(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').length>2?`<small>+ ${qty((o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').length-2)} قلم دیگر</small>`:''}</div>
    <div class="remote-row-foot"><span>${qty((o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').length)} قلم</span><span>ثبت ${dt(o.createdAt)}</span><div class="toolbar"><button class="btn btn-ghost btn-sm" data-action="order-details" data-id="${o.id}">${icon('eye',14)} جزئیات</button>${o.status==='SCHEDULED_REMOTE'?`<button class="btn btn-ghost btn-sm" data-action="edit-remote" data-id="${o.id}">${icon('edit',14)} ویرایش</button><button class="btn btn-ghost btn-sm danger-text" data-action="cancel-remote" data-id="${o.id}">${icon('trash',14)} لغو</button>`:''}</div></div>
  </article>`).join('')||'<div class="empty">سفارش غیرحضوری فعالی ثبت نشده است.</div>';
}

// Improve remote live filtering while preserving the existing refresh loop.
function bindRemoteV21(){
  $('#content').onclick=async e=>{
    const sub=e.target.closest('[data-sub]'); if(sub){const [k,v]=sub.dataset.sub.split(':');await renderSales(v);return;}
    const ael=e.target.closest('[data-action]'); if(!ael)return; const a=ael.dataset.action;
    if(a==='remote-add-line'){app.remoteDraft.push(defaultOrderLine());renderOrderLineArea('remote','remoteDraft');return;}
    if(a==='op-remove-line' && ael.dataset.prefix==='remote'){const i=Number(ael.dataset.index);if(app.remoteDraft.length>1){app.remoteDraft.splice(i,1);renderOrderLineArea('remote','remoteDraft')}return;}
    if(a==='op-pick-product'&&ael.dataset.prefix==='remote'){pickOperationProduct(Number(ael.dataset.index),ael.dataset.productId,ael.dataset.label,ael.dataset.quick,'remote','remoteDraft');return;}
    if(a==='edit-remote')return editRemoteOrder(ael.dataset.id);
    if(a==='cancel-remote')return cancelRemoteOrder(ael.dataset.id);
    if(a==='order-details')return openOrderDetails(ael.dataset.id);
  };
  app.remoteDraft=[defaultOrderLine()]; renderOrderLineArea('remote','remoteDraft');
  bindJalaliDates($('#remoteOrderForm'));
  const form=$('#remoteOrderForm');
  if(form)form.addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const items=app.remoteDraft.filter(x=>x.productId&&n(x.requestedQty)>0).map(x=>({productId:x.productId,requestedQty:n(x.requestedQty),requestedUnit:x.requestedUnit,description:String(x.description||'').trim()}));if(!items.length)return toast('حداقل یک محصول معتبر وارد کنید.');try{const d=await api('/api/orders/remote',{method:'POST',body:JSON.stringify({...f,items})});toast(d.order?.status==='WAREHOUSE_PENDING'?'سفارش امروز ثبت و در صف انبار قرار گرفت.':'سفارش غیرحضوری برای تاریخ آینده برنامه‌ریزی شد.');e.target.reset();e.target.elements.scheduledDate.value=today();e.target.elements.scheduledTime.value='08:00';app.remoteDraft=[defaultOrderLine()];renderOrderLineArea('remote','remoteDraft');await renderSales('remote')}catch(err){toast(err.message)}});
  const search=$('#remoteSearchV21');
  const date=$('#remoteDateV21');
  if(date)date.addEventListener('input',()=>{date.value=normalizeJalaliText(date.value)});
  const apply=async()=>{const q=(search?.value||'').trim().toLowerCase();const day=jalaliToIso(date?.value||'');const orders=(await api('/api/orders')).orders||[];const filtered=orders.filter(o=>o.orderType==='REMOTE'&&['SCHEDULED_REMOTE','WAREHOUSE_PENDING','RETURNED_TO_SALES'].includes(o.status)&&(!q||[o.customer?.name,o.customer?.phone].some(x=>String(x||'').toLowerCase().includes(q)))&&(!day||o.scheduledDate===day));const l=$('#remoteOrderList');if(l)l.innerHTML=remoteOrderRows(filtered)};
  search?.addEventListener('input',apply); date?.addEventListener('input',()=>{date.value=normalizeJalaliText(date.value)}); date?.addEventListener('blur',apply);
}

/* =========================================================
   v25 — SALES DESK REDESIGN
   Five workspaces: حضوری / غیرحضوری / در جریان / تسویه / روزهای آتی
   Persian dates + strict 24-hour time across the sales UI.
   ========================================================= */
function time24(v){
  if(!v) return '—';
  const m=String(v).match(/(?:T|\s)(\d{1,2}):(\d{2})/);
  if(m)return `${String(Number(m[1])).padStart(2,'0')}:${m[2]}`;
  const s=String(v).match(/^(\d{1,2}):(\d{2})$/);
  return s?`${String(Number(s[1])).padStart(2,'0')}:${s[2]}`:'—';
}
function now24(){const d=serverNow();return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function time24Input(name,value='08:00',required=true,label='ساعت ارسال'){
  const val=time24(value)==='—'?'08:00':time24(value);
  return `<div class="field time24-field"><label>${esc(label)}</label><div class="input-shell op-input time24-shell"><span>${icon('clock',17)}</span><input class="time24-input" name="${esc(name)}" value="${esc(val)}" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="08:30" pattern="(?:[01]\\d|2[0-3]):[0-5]\\d" ${required?'required':''} aria-label="ساعت به صورت 24 ساعته"></div><small class="field-hint">فرمت ۲۴ ساعته: 00:00 تا 23:59</small></div>`;
}
function normalizeTime24(v){
  const s=toAsciiDigits(String(v||'')).replace(/[^0-9:]/g,'').slice(0,5);
  let x=s;
  if(/^\d{3,4}$/.test(x))x=x.slice(0,-2)+':'+x.slice(-2);
  if(/^\d{1,2}:\d{0,2}$/.test(x)){
    const [h,m]=x.split(':'); x=`${h.padStart(2,'0')}:${(m||'').padEnd(2,'0')}`.slice(0,5);
  }
  return x;
}
function bindTime24(root=document){
  $$('.time24-input',root).forEach(input=>{
    const sync=()=>{
      const raw=normalizeTime24(input.value);
      input.value=raw;
      const ok=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw);
      input.classList.toggle('invalid',!!raw&&!ok);
      input.setCustomValidity(ok?'':'ساعت را به صورت 24 ساعته مانند 08:30 وارد کنید.');
    };
    input.addEventListener('input',sync); input.addEventListener('blur',sync); sync();
  });
}
function formatDateTime24(v){
  if(!v)return '—';
  const d=new Date(v);
  if(Number.isNaN(d.getTime())) return String(v);
  const p=faDateParts(d,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  if(!p.year) return String(v);
  return `${p.year}/${p.month}/${p.day} • ${p.hour}:${p.minute}`;
}
// Override global date-time rendering so every visible time is 24-hour.
function dt(v){return v?formatDateTime24(v):'—'}
function salesOrderDateTime(o){return o?.scheduledAt?`${dateLabel(o.scheduledDate)} • ${time24(o.scheduledAt)}`:'—'}
function salesKindLabel(o){return o?.orderType==='STORE'?'فروشگاه':'تلفنی'}
function salesKindBadge(o){return o?.orderType==='STORE'?'<span class="sales-type-badge store">فروشگاه</span>':'<span class="sales-type-badge phone">تلفنی</span>'}
function activeItemsOf(o){return (o?.items||[]).filter(i=>i.itemStatus!=='CANCELLED')}
function salesFlowOrders(orders){return orders.filter(o=>o.orderType!=='STORE'&&['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','RETURNED_TO_SALES'].includes(o.status)).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))} // v37.6.0 — متفرقات فروشگاه در تب مستقل
function salesFutureOrders(orders){
  const todayIso=today();
  return orders.filter(o=>o.orderType==='REMOTE'&&o.status==='SCHEDULED_REMOTE'&&String(o.scheduledDate||'')>=todayIso).sort((a,b)=>String(a.scheduledAt||'').localeCompare(String(b.scheduledAt||'')));
}
// v37.6.1 — سفارش پخش پس از صدور فاکتور از این مجموعه حذف نمی‌شود؛ تا چاپ برگهٔ ارسال در
// صف تسویه می‌ماند و بعد از آن در فهرست «فاکتورهای صادرشده» نمایش داده می‌شود.
function salesAllInSettlement(orders){return orders.filter(o=>o.orderType!=='STORE'&&((['SETTLEMENT_PENDING','SETTLED','EXITED'].includes(o.status)&&!['DELIVERED','SALES_FINALIZED','CLOSED'].includes(o.dispatch?.status))||((o.payments||[]).length>0&&!['SETTLEMENT_PENDING','SETTLED','EXITED'].includes(o.status)))).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))} // v37.6.0 // v37.5.0 — فاکتورهای هر سرویس سفارش فروشگاه بسته‌شده هم دیده می‌شوند


function salesEmptyV25(name,title,subtitle){return `<div class="sales-empty-v25"><div>${icon(name,28)}</div><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></div>`}
function salesSectionTitle(kicker,title,subtitle,count=''){
  return `<div class="sales-section-title-v25"><div><span class="eyebrow">${esc(kicker)}</span><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>${count!==''?`<div class="sales-section-count"><strong>${qty(count)}</strong><span>مورد</span></div>`:''}</div>`;
}




function nextDayIso(){const d=serverNow();d.setDate(d.getDate()+1);return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`}
function futureOrderRowsV25(orders){
  const rows=(orders||[]).map(o=>{
    const typeBadge=o.orderType==='STORE'?salesKindBadge(o):'<span class="sales-type-badge phone">تلفنی</span>';
    const actions=`<button class="btn btn-secondary btn-sm" data-action="order-details" data-id="${o.id}">${icon('eye',14)} جزئیات</button>`+
      (o.orderType==='REMOTE'?`<button class="btn btn-ghost btn-sm" data-action="future-edit" data-id="${o.id}">${icon('edit',14)} ویرایش زمان</button><button class="btn btn-ghost btn-sm danger-text" data-action="future-cancel" data-id="${o.id}">${icon('trash',14)} لغو</button>`:'');
    return `<article class="fx41-row">
      <div class="fx41-row-top">
        <div class="fx41-row-date"><small>ورود به انبار</small><strong>${esc(dateLabel(o.scheduledDate))}</strong><b>${esc(fa(time24(o.scheduledAt)))}</b></div>
        <div class="fx41-row-info"><div class="fx41-row-badges"><span class="order-code">${esc(fa(o.orderNo||'—'))}</span>${typeBadge}</div><h3>${esc(storeAwareOrderName(o))}</h3><p>${esc(storeAwareOrderPhone(o))}</p></div>
        <div class="fx41-row-status">${badge(o.status)}</div>
      </div>
      <div class="fx41-row-meta"><span><b>تاریخ تحویل</b>${o.deliveryDate?esc(dateLabel(o.deliveryDate)):'ثبت نشده'}</span><span><b>مقصد</b>${esc(o.dispatchPlace||'ثبت نشده')}</span><span><b>اقلام</b>${qty(activeItemsOf(o).length)} قلم</span><span><b>ثبت</b>${formatDateTime24(o.createdAt)}</div>
      <div class="fx41-row-actions">${actions}</div>
    </article>`;
  }).join('');
  return rows||salesEmptyV25('calendar','سفارشی برای روزهای آینده برنامه‌ریزی نشده است','سفارش‌های آینده پس از ثبت در این تقویم قرار می‌گیرند.');
}

// A selected record stays linked while its name or phone is edited.
function salesCustomerPickerHtml(prefix){
 const id=prefix+'CustomerSearch';
 return `<div class="sales-customer-picker"><label for="${id}">جستجوی مشتری ثبت‌شده</label><div class="sales-customer-search-row"><div class="sales-customer-search-field"><input id="${id}" type="search" autocomplete="off" maxlength="80" placeholder="نام، شماره تماس یا کد مشتری" aria-controls="${id}Results" aria-expanded="false"><div id="${id}Results" class="sales-customer-results" aria-live="polite"></div></div><button type="button" class="btn btn-secondary btn-sm" data-sales-customer-clear hidden>انتخاب مشتری دیگر</button></div><input type="hidden" name="customerId"><small data-sales-customer-selection>برای مشتری جدید، نام و شماره تماس را وارد کنید.</small></div>`;
}
function syncSalesDispatchPlace(form){
 const mode=form.querySelector('[data-delivery-mode]'),field=form.querySelector('[data-sales-dispatch-place]');if(!field)return;
 const show=!mode||mode.value==='DELIVERY';field.hidden=!show;
 const input=field.querySelector('[name=dispatchPlace]');if(input){input.disabled=!show;input.required=show&&form.id==='futureOrderFormV25';}
}
function bindSalesCustomerPicker(form){
 if(!form||form.dataset.customerPickerBound)return;form.dataset.customerPickerBound='1';
 const input=form.querySelector('.sales-customer-picker input[type=search]'),host=form.querySelector('.sales-customer-results'),id=form.querySelector('[name=customerId]'),notice=form.querySelector('[data-sales-customer-selection]'),clear=form.querySelector('[data-sales-customer-clear]');
 if(!input||!host||!id)return;let seq=0,timer=null,rows=[];
 function clearResults(){host.replaceChildren();input.setAttribute('aria-expanded','false');}
 function clearSelection(){id.value='';clear.hidden=true;notice.textContent='برای مشتری جدید، نام و شماره تماس را وارد کنید.';}
 input.addEventListener('input',()=>{if(id.value){form.querySelector('[name=name]').value='';form.querySelector('[name=phone]').value='';}clearSelection();clearTimeout(timer);const q=input.value.trim(),request=++seq;clearResults();if(!q)return;timer=setTimeout(async()=>{try{const d=await api('/api/customers/search?q='+encodeURIComponent(q));if(request!==seq||!input.isConnected)return;rows=d.customers||[];host.innerHTML=rows.length?rows.map((c,i)=>`<button type="button" data-sales-customer-index="${i}"><b>${esc(c.name||'—')}</b><span>${esc(fa(c.phone||'—'))} · کد ${esc(fa(c.code||'—'))}</span></button>`).join(''):'<p>مشتری یافت نشد؛ می‌توانید مشتری جدید ثبت کنید.</p>';input.setAttribute('aria-expanded',String(rows.length>0));}catch(e){if(request===seq)host.textContent='جستجوی مشتری ناموفق بود؛ دوباره تلاش کنید.';}},200);});
 host.addEventListener('click',e=>{const button=e.target.closest('[data-sales-customer-index]');if(!button)return;const c=rows[Number(button.dataset.salesCustomerIndex)];if(!c)return;++seq;id.value=c.id;form.querySelector('[name=name]').value=c.name||'';form.querySelector('[name=phone]').value=c.phone||'';input.value=c.name||'';notice.textContent='مشتری انتخاب شد: '+(c.name||'')+' · کد '+(c.code||'—')+'؛ تغییر نام یا تماس، پرونده همین مشتری را به‌روزرسانی می‌کند.';clear.hidden=false;clearResults();});
 clear.addEventListener('click',()=>{++seq;clearTimeout(timer);clearSelection();clearResults();input.value='';form.querySelector('[name=name]').value='';form.querySelector('[name=phone]').value='';input.focus();});
 input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){const first=host.querySelector('button');if(first){e.preventDefault();first.focus();}}else if(e.key==='Enter'){e.preventDefault();host.querySelector('button')?.click();}else if(e.key==='Escape'){++seq;clearResults();}});
 form.addEventListener('reset',()=>{++seq;clearTimeout(timer);setTimeout(()=>{clearSelection();clearResults();syncSalesDispatchPlace(form);},0);});
 const mode=form.querySelector('[data-delivery-mode]');mode?.addEventListener('change',()=>syncSalesDispatchPlace(form));syncSalesDispatchPlace(form);
}

// بیعانه صرفاً هنگام ثبت سفارش دریافت می‌شود؛ اطلاعات آن پس از ثبت قابل حذف پنهانی نیست.
// A delivery choice is mandatory in the default workflow. The explicitly
// disabled compatibility mode keeps the old forms available for emergencies.
function deliveryModeInputHtml(prefix){
 const id="delivery-mode-"+String(prefix||"order");
 return `<div class="field transport-delivery-choice"><label for="${esc(id)}">روش تحویل سفارش</label><div class="input-shell"><select id="${esc(id)}" name="deliveryMode" data-delivery-mode required><option value="">روش تحویل را انتخاب کنید</option><option value="DELIVERY">ارسال توسط پخش</option><option value="PICKUP">تحویل در انبار</option></select></div><small>سفارش بیعانه‌دار فقط تحویل در انبار است.</small></div>`;
}
function readDeliveryMode(root,deposit){
 if(!app.features?.experimentalTransport)return {};
 const mode=root?.querySelector('[data-delivery-mode]')?.value||'';
 if(!['DELIVERY','PICKUP'].includes(mode))throw Error('روش تحویل سفارش را انتخاب کنید.');
 if(mode==='DELIVERY'&&deposit)throw Error('سفارش دارای بیعانه قابل ارسال توسط پخش نیست؛ تحویل در انبار را انتخاب کنید.');
 return {transportWorkflow:true,deliveryMode:mode};
}
function depositEntryHtml(){
 return `<section class="deposit-entry"><button type="button" class="btn btn-secondary deposit-toggle" data-deposit-toggle aria-pressed="false">＋ ثبت بیعانه</button><span class="deposit-hint">در صورت دریافت بیعانه فعال کنید؛ سفارش بیعانه‌دار به پخش ارسال نمی‌شود.</span>
 <div class="deposit-fields" data-deposit-fields hidden><label>مبلغ بیعانه (ریال)<input class="adm-input" data-deposit-amount inputmode="numeric" autocomplete="off" placeholder="مبلغ دریافتی"></label><label>نوع پرداخت<select class="adm-select" data-deposit-type><option value="CASH">نقدی</option><option value="POS">پوز</option><option value="CARD_TRANSFER">کارت‌به‌کارت</option></select></label><label data-deposit-pos hidden>دستگاه فعال<select class="adm-select" data-deposit-device><option value="">انتخاب دستگاه</option></select></label><label data-deposit-bank-wrap hidden>بانک / حساب مقصد<input class="adm-input" data-deposit-bank maxlength="100"></label><label data-deposit-reference-wrap hidden>شماره پیگیری<input class="adm-input" data-deposit-reference maxlength="100" placeholder="شناسه تراکنش"></label></div></section>`;
}
function readOrderDeposit(form){
 const box=form.querySelector('[data-deposit-fields]');if(!box||box.hidden)return null;
 const amount=stlPayParse(box.querySelector('[data-deposit-amount]').value),type=box.querySelector('[data-deposit-type]').value;
 if(!Number.isSafeInteger(amount)||amount<=0||amount>1e12)throw Error('مبلغ بیعانه معتبر را به ریال وارد کنید.');
 const deposit={amount,type,deviceId:box.querySelector('[data-deposit-device]').value,bank:box.querySelector('[data-deposit-bank]').value.trim(),reference:box.querySelector('[data-deposit-reference]').value.trim()};
 if(type==='POS'&&!deposit.deviceId)throw Error('دستگاه پوز فعال را انتخاب کنید.');
 if(type==='CARD_TRANSFER'&&(!deposit.bank||!deposit.reference))throw Error('بانک مقصد و شماره پیگیری کارت‌به‌کارت را وارد کنید.');
 return deposit;
}
function depositSummaryHtml(d){
 if(!d)return '';const labels={CASH:'نقدی',POS:'پوز',CARD_TRANSFER:'کارت‌به‌کارت'};
 const info=[labels[d.type]||d.type,d.deviceSnapshot?`${d.deviceSnapshot.title} / ${d.deviceSnapshot.bank}`:'',d.bank||'',d.reference?`پیگیری ${d.reference}`:''].filter(Boolean).map(esc).join(' • ');
 return `<div class="deposit-summary"><b>بیعانه: ${money(d.amount)}</b><span>${info}</span>${d.refundedAmount?`<span>استرداد دستی ثبت‌شده: ${money(d.refundedAmount)}</span>`:''}${d.status==='REFUND_REQUIRED'?`<strong>استرداد دستی در انتظار پیگیری: ${money(Number(d.amount)-Number(d.refundedAmount||0))}</strong>`:d.status==='REFUNDED'?'<strong>استرداد دستی ثبت شد</strong>':''}</div>`;
}
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-deposit-toggle]');if(!button)return;
 const entry=button.closest('.deposit-entry'),fields=entry.querySelector('[data-deposit-fields]');fields.hidden=!fields.hidden;
 button.setAttribute('aria-pressed',String(!fields.hidden));button.textContent=fields.hidden?'＋ ثبت بیعانه':'✓ بیعانه فعال است';
});
document.addEventListener('change',async e=>{
 if(!e.target.matches('[data-deposit-type]'))return;
 const box=e.target.closest('[data-deposit-fields]'),type=e.target.value;
 box.querySelector('[data-deposit-pos]').hidden=type!=='POS';box.querySelector('[data-deposit-bank-wrap]').hidden=type!=='CARD_TRANSFER';box.querySelector('[data-deposit-reference-wrap]').hidden=!['POS','CARD_TRANSFER'].includes(type);
 if(type==='POS'){
   const select=box.querySelector('[data-deposit-device]');const previous=select.value;select.disabled=true;
   try{const {devices=[]}=await api('/api/payment-devices');select.innerHTML='<option value="">انتخاب دستگاه</option>'+devices.map(d=>`<option value="${esc(d.id)}">${esc(d.title)} • ${esc(d.bank)} • پایانه ${esc(d.terminalNumber)}</option>`).join('');select.value=previous;}
   catch(err){toast('دریافت دستگاه‌های پوز انجام نشد؛ دوباره نوع پرداخت را انتخاب کنید.');}finally{select.disabled=false;}
 }
});
document.addEventListener('input',e=>{if(e.target.matches('[data-deposit-amount]'))stlFormatPriceInput(e.target);});
document.addEventListener('reset',e=>{if(e.target.querySelector?.('[data-deposit-fields]'))setTimeout(()=>{const entry=e.target.querySelector('.deposit-entry');if(!entry)return;entry.querySelector('[data-deposit-fields]').hidden=true;const b=entry.querySelector('[data-deposit-toggle]');b.setAttribute('aria-pressed','false');b.textContent='＋ ثبت بیعانه';entry.querySelector('[data-deposit-pos]').hidden=true;entry.querySelector('[data-deposit-bank-wrap]').hidden=true;entry.querySelector('[data-deposit-reference-wrap]').hidden=true;},0);});
function refundRowsHtml(rows){return (rows||[]).map(o=>`<article class="deposit-refund-row"><div><b>${esc(storeAwareOrderName(o))} • سفارش ${esc(fa(o.orderNo||'—'))}</b>${depositSummaryHtml(o.deposit)}</div><button type="button" class="btn btn-secondary btn-sm" data-action="deposit-refunded" data-id="${esc(o.id)}">ثبت استرداد دستی</button></article>`).join('')||'<p class="subtle">استرداد در انتظاری وجود ندارد.</p>';}
async function refreshDepositRefunds(){const host=document.getElementById('depositRefundList');if(!host)return;try{const d=await api('/api/deposit-refunds');if(host.isConnected)host.innerHTML=refundRowsHtml(d.orders);}catch(e){host.textContent='دریافت فهرست استرداد ناموفق بود؛ صفحه را تازه‌سازی کنید.';}}
async function markDepositRefunded(id){const reference=prompt('پس از استرداد واقعی وجه، شماره پیگیری یا توضیح استرداد دستی را وارد کنید:');if(reference===null)return;if(!reference.trim())return toast('شماره پیگیری یا توضیح استرداد الزامی است.');try{await api('/api/orders/'+encodeURIComponent(id)+'/deposit-refund',{method:'POST',body:JSON.stringify({reference})});toast('استرداد دستی ثبت شد.');await refreshDepositRefunds();}catch(e){toast(e.message);}}

async function submitPhoneOrderV25(form){
  const rows=app.phoneDraft||[];
  const incomplete=rows.findIndex(x=>(x.productId || String(x.productLabel||'').trim() || String(x.requestedQty??'').trim() || String(x.description||'').trim()) && (!x.productId || !(n(x.requestedQty)>0)));
  if(incomplete>=0){
    const field=rows[incomplete].productId?'op-qty':'op-product-search';
    form.querySelector(`[data-${field}="phone-${incomplete}"]`)?.focus();
    return toast('محصول و مقدار معتبر ردیف '+fa(String(incomplete+1))+' را تکمیل کنید یا آن را حذف کنید.');
  }
  const items=rows.filter(x=>x.productId&&n(x.requestedQty)>0).map(x=>({productId:x.productId,requestedQty:n(x.requestedQty),requestedUnit:x.requestedUnit,description:String(x.description||'').trim()}));
  if(!items.length)return toast('حداقل یک محصول معتبر برای سفارش تلفنی وارد کنید.');
  const f=Object.fromEntries(new FormData(form));
  try{
    const deposit=readOrderDeposit(form);
    const d=await api('/api/orders/remote',{method:'POST',body:JSON.stringify({name:f.name,phone:f.phone,customerId:f.customerId||undefined,notes:f.notes||'',dispatchPlace:f.dispatchPlace||'',scheduledDate:today(),scheduledTime:'00:00',...(app.features?.pickupStaging?{deliveryDate:f.deliveryDate}:{}),deposit,items,...(app.features?.experimentalTransport?readDeliveryMode(form,deposit):{})})});
    toast(d.order?.status==='WAREHOUSE_PENDING'?(d.order.deliveryMode==='DELIVERY'?'سفارش تلفنی به انبار و ترابری ارسال شد.':'سفارش تلفنی به انبار ارسال شد.'):'سفارش تلفنی ثبت شد.');
    form.reset(); app.phoneDraft=[defaultOrderLine()]; renderOrderLineArea('phone','phoneDraft'); await renderSales('remote');
  }catch(e){toast(e.message)}
}
async function submitFutureOrderV25(form){
  const f=Object.fromEntries(new FormData(form));
  const iso=f.scheduledDate||'';
  if(!iso || iso<today())return toast('تاریخ ارسال نمی‌تواند قبل از امروز باشد.');
  const tm=normalizeTime24(f.scheduledTime||'');
  if(!f.deliveryDate)return toast('تاریخ تحویل شمسی معتبر را انتخاب کنید.');
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(tm))return toast('ساعت ارسال باید با فرمت 24 ساعته مانند 08:30 باشد.');
  if((!app.features?.experimentalTransport||f.deliveryMode==='DELIVERY')&&!String(f.dispatchPlace||'').trim())return toast('محل ارسال را وارد کنید.');
  const items=(app.futureDraft||[]).filter(x=>x.productId&&n(x.requestedQty)>0).map(x=>({productId:x.productId,requestedQty:n(x.requestedQty),requestedUnit:x.requestedUnit,description:String(x.description||'').trim()}));
  if(!items.length)return toast('حداقل یک محصول معتبر برای سفارش آینده وارد کنید.');
  try{
    const deposit=readOrderDeposit(form);
    const d=await api('/api/orders/remote',{method:'POST',body:JSON.stringify({...f,scheduledTime:tm,scheduledAt:`${iso}T${tm}`,deposit,items,...(app.features?.experimentalTransport?readDeliveryMode(form,deposit):{})})});
    toast(d.order?.status==='SCHEDULED_REMOTE'?'سفارش برای تاریخ و ساعت انتخاب‌شده برنامه‌ریزی شد.':'سفارش در صف انبار قرار گرفت.');
    form.reset(); const dateInp=form.querySelector('.jalali-date-input[data-target=scheduledDate]'); if(dateInp){dateInp.value=isoToJalali(iso); dateInp.dispatchEvent(new Event('input',{bubbles:true}));}
    const t=form.querySelector('.time24-input'); if(t)t.value='08:00'; app.futureDraft=[defaultOrderLine()]; renderOrderLineArea('future','futureDraft'); await renderSales('future');
  }catch(e){toast(e.message)}
}
async function openStoreApprovalV25(id){
  try{
    const d=await api('/api/orders/'+id); const o=d.order;
    if(!o||o.orderType!=='STORE'||o.status!=='STORE_PENDING_SALES')return toast('این سفارش دیگر در صف تأیید فروش نیست.');
    openModal('بررسی سفارش فروشگاه و تعیین زمان ارسال',`<form id="storeApprovalFormV25" class="schedule-approval-form"><div class="schedule-approval-hero"><div><span class="eyebrow">STORE APPROVAL</span><h2>${esc(o.storeName||'فروشگاه')}</h2><p>${esc(storeAwareOrderName(o))} • ${esc(storeAwareOrderPhone(o))} • ${esc(fa(o.orderNo||'—'))}</p></div><span class="badge orange">نیازمند تأیید</span></div><div class="schedule-approval-notice">فروشگاه فقط سفارش را ثبت می‌کند. <strong>تاریخ، ساعت ۲۴ ساعته و محل ارسال در این فرم توسط واحد فروش تعیین می‌شود.</strong></div><div class="store-approval-fields-v25">${jalaliInput('تاریخ ارسال','scheduledDate',o.scheduledDate||today(),true)}${time24Input('scheduledTime',time24(o.scheduledAt)||'08:00',true)}<div class="field"><label>محل ارسال</label><div class="input-shell op-input"><span>${icon('truck',17)}</span><input name="dispatchPlace" required value="${esc(o.dispatchPlace||o.storeName||'')}" placeholder="محل ارسال"></div></div></div><div class="store-approval-summary-v25"><span>اقلام <b>${qty(activeItemsOf(o).length)}</b></span><span>ثبت <b>${formatDateTime24(o.createdAt)}</b></span></div><div class="modal-actions"><button class="btn btn-secondary" type="button" data-action="close-modal">انصراف</button><button class="btn btn-primary btn-lg" type="submit">${icon('check',17)} تأیید و ثبت زمان ارسال</button></div></form>`);
    bindJalaliDates($('#storeApprovalFormV25')); bindTime24($('#storeApprovalFormV25'));
    $('#storeApprovalFormV25')?.addEventListener('submit',async e=>{
      e.preventDefault(); if(!e.target.reportValidity())return;
      const f=Object.fromEntries(new FormData(e.target)); const tm=normalizeTime24(f.scheduledTime); if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(tm))return toast('ساعت نامعتبر است.');
      if(!f.scheduledDate)return toast('تاریخ شمسی معتبر وارد کنید.');
      try{const r=await api('/api/store/orders/'+id+'/approve',{method:'POST',body:JSON.stringify({scheduledAt:`${f.scheduledDate}T${tm}`,dispatchPlace:f.dispatchPlace,...(app.features?.experimentalTransport?{transportWorkflow:true}:{})})});closeModal();toast(r.order?.status==='WAREHOUSE_PENDING'?(r.order.transportWorkflow===1?'سفارش تأیید و به انبار و ترابری ارسال شد.':'سفارش تأیید و به صف انبار ارسال شد.'):'سفارش تأیید و برای زمان تعیین‌شده برنامه‌ریزی شد.');await fetchSalesCache(true);await renderSales('stores');await refreshIndicators();}catch(err){toast(err.message)}
    });
  }catch(e){toast(e.message)}
}
async function editFutureV25(id){
 try{
  const o=(await api('/api/orders/'+encodeURIComponent(id))).order;
  if(!canSalesEditRemote(o))return toast('ویرایش مستقیم فقط پیش از تأیید انبار مجاز است.');
  const products=(await api('/api/products')).products.filter(p=>p.isActive!==false);
  const showMode=app.features?.experimentalTransport&&o.transportWorkflow===1&&['PICKUP','DELIVERY'].includes(o.deliveryMode);
  const modeLocked=!!(o.dispatch||o.visitId||o.pickupRecipient||o.pickupCancellation||o.transportInvoice||o.transportDeparture||Object.keys(o.transportAssignments||{}).length||Object.keys(o.transportHandovers||{}).length);
  const modeField=showMode?`<label>روش تحویل سفارش<select name="deliveryMode" data-re-delivery-mode ${modeLocked?'disabled':''}><option value="DELIVERY" ${o.deliveryMode==='DELIVERY'?'selected':''} ${o.deposit?'disabled':''}>ارسال توسط پخش</option><option value="PICKUP" ${o.deliveryMode==='PICKUP'?'selected':''} ${!app.features?.pickupStaging&&o.deliveryMode!=='PICKUP'?'disabled':''}>تحویل در انبار</option></select><small>${modeLocked?'تغییر روش پس از تخصیص پخش یا ثبت مراجعه مجاز نیست.':o.deposit?'سفارش بیعانه‌دار فقط تحویل در انبار است.':'تغییر روش پیش از تأیید انبار و تخصیص پخش امکان‌پذیر است.'}</small></label>`:'';
  const line=x=>`<tr data-remote-edit-line><td><select data-re-product required aria-label="محصول">${products.map(p=>`<option value="${esc(p.id)}" ${p.id===x.productId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></td><td><input data-re-qty aria-label="مقدار" required inputmode="decimal" value="${esc(x.requestedQty??'')}"></td><td><select data-re-unit aria-label="واحد">${['کیلوگرم','بسته','عدد','کارتن'].map(u=>`<option ${u===x.requestedUnit?'selected':''}>${u}</option>`).join('')}</select></td><td><input data-re-desc aria-label="توضیح" maxlength="300" value="${esc(x.description||'')}"></td><td><button type="button" data-re-remove class="btn btn-secondary">حذف</button></td></tr>`;
  openModal('ویرایش سفارش پیش از تأیید انبار',`<form id="remoteFullEdit"><p>${esc(storeAwareOrderName(o))} — ${esc(fa(o.orderNo))}</p><div class="form-grid">${o.status==='SCHEDULED_REMOTE'?jalaliDateTimeInput('ورود به انبار','scheduledDate','scheduledTime',o.scheduledDate,time24(o.scheduledAt)||'08:00',true):''}${modeField}${jalaliInput('تاریخ تحویل','deliveryDate',o.deliveryDate||'',o.deliveryMode==='PICKUP')}<label>محل ارسال<input name="dispatchPlace" value="${esc(o.dispatchPlace||'')}" ${o.deliveryMode==='PICKUP'?'readonly':''}></label><label>یادداشت<input name="notes" maxlength="1000" value="${esc(o.notes||'')}"></label></div><div class="table-wrap"><table class="table remote-edit-table"><thead><tr><th>محصول</th><th>مقدار</th><th>واحد</th><th>توضیح</th><th>عملیات</th></tr></thead><tbody>${(o.items||[]).filter(x=>x.itemStatus!=='CANCELLED').map(line).join('')}</tbody></table></div><button type="button" class="btn btn-secondary" data-re-add>افزودن قلم</button><p data-re-error role="alert"></p><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">انصراف</button><button type="submit" class="btn btn-primary">ذخیره سفارش</button></div></form>`);
  const form=$('#remoteFullEdit');bindJalaliDates(form);bindTime24(form);
  const modeInput=form.querySelector('[data-re-delivery-mode]'),place=form.elements.dispatchPlace,dateInput=form.querySelector('.jalali-date-input[data-target="deliveryDate"]');
  let placeDraft=place.value, lastMode=o.deliveryMode;
  function syncRemoteDelivery(){
   const mode=modeInput?.value||o.deliveryMode, pickup=mode==='PICKUP';
   if(pickup && lastMode!=='PICKUP'){placeDraft=place.value;place.value='';}
   else if(!pickup && lastMode==='PICKUP') place.value=placeDraft;
   place.readOnly=pickup;place.required=mode==='DELIVERY'&&mode!==o.deliveryMode;
   if(dateInput)dateInput.required=pickup;
   lastMode=mode;
  }
  modeInput?.addEventListener('change',syncRemoteDelivery);syncRemoteDelivery();
  form.querySelector('[data-re-add]').onclick=()=>form.querySelector('tbody').insertAdjacentHTML('beforeend',line({requestedUnit:'کیلوگرم'}));
  form.addEventListener('click',e=>{if(e.target.closest('[data-re-remove]'))e.target.closest('tr').remove();});
  form.onsubmit=async e=>{e.preventDefault();const error=form.querySelector('[data-re-error]'),button=form.querySelector('[type=submit]');error.textContent='';try{
   const body=Object.fromEntries(new FormData(form));
   if(modeInput)body.expectedDeliveryMode=o.deliveryMode;
   body.items=[...form.querySelectorAll('[data-remote-edit-line]')].map(r=>({productId:r.querySelector('[data-re-product]').value,requestedQty:toAsciiDigits(r.querySelector('[data-re-qty]').value).replace('٫','.'),requestedUnit:r.querySelector('[data-re-unit]').value,description:r.querySelector('[data-re-desc]').value}));
   if(!body.items.length)throw Error('حداقل یک قلم لازم است.');
   if(body.scheduledTime){body.scheduledTime=normalizeTime24(body.scheduledTime);body.scheduledAt=body.scheduledDate+'T'+body.scheduledTime;}
   button.disabled=true;await api('/api/orders/'+encodeURIComponent(id)+'/remote',{method:'PUT',body:JSON.stringify(body)});closeModal();await fetchSalesCache(true);await renderSales(app.sub.sales);await refreshIndicators();toast('سفارش بدون ارجاع به انبار ویرایش شد.');
  }catch(err){error.textContent=err.message;button.disabled=false;}};
 }catch(e){toast(e.message);}
}
async function cancelFutureV25(id){const order=(app.salesCache?.orders||[]).find(o=>o.id===id);if(!confirm(order?.deposit?'سفارش لغو شود؟ بیعانه به‌صورت خودکار بازگردانده نمی‌شود و باید دستی استرداد و ثبت شود.':'این سفارش آینده لغو شود؟'))return;try{const result=await api('/api/orders/'+id+'/cancel-remote',{method:'POST',body:JSON.stringify({reason:'لغو توسط فروش'})});toast(result.order?.deposit?'سفارش لغو شد؛ استرداد دستی بیعانه را پیگیری کنید.':'سفارش آینده لغو شد.');await renderSales('future');await refreshDepositRefunds();}catch(e){toast(e.message)}}



// Clean, stable refresh strategy: rebuild the active sales pane only when it is not being edited.

// Keep settlement inside the five-tab sales desk while retaining the existing signature/fingerprint engine.
// v37.0.5: the old settlement wrapper (which called itself and caused "Maximum call stack") was removed; see the v37.0.4 settlement block below.

// Return to the five-part sales desk after final settlement, not the removed invoice tab.
async function finalSettle(id){
  try{
    const d=await api('/api/orders/'+id+'/settle',{method:'POST',body:JSON.stringify({items:(app.settleDraft||[]).map(i=>({itemId:i.id,unitPrice:n(i.unitPrice),cancelled:!!i.cancelled}))})});
    toast(`تسویه نهایی شد؛ فاکتور ${d.order?.payment?.invoiceNumber||''} صادر شد.`);app.selectedSettlement=null;app.settlementFingerprintRef='';await renderSales('settlement');
  }catch(e){toast(e.message)}
}

/* v25 final workflow guards */
const _legacySubmitOrderV25=submitOrder;
async function submitOrder(visitId){
  if(app.onsiteSubmitting)return;
  const items=(app.orderDraft||[]).filter(x=>x.productId&&n(x.requestedQty)>0).map(x=>({productId:x.productId,requestedQty:n(x.requestedQty),requestedUnit:x.requestedUnit,description:String(x.description||'').trim()}));
  if(!items.length)return toast('حداقل یک محصول با مقدار معتبر وارد کنید.');
  const buttons=$$('#content [data-action="submit-order"]').filter(b=>b.dataset.id===visitId);
  app.onsiteSubmitting=true;buttons.forEach(b=>b.disabled=true);
  try{
    await api('/api/orders',{method:'POST',body:JSON.stringify({visitId,items,...(app.features?.experimentalTransport?readDeliveryMode(document.querySelector('#content'),null):{})})});
    toast('سفارش ثبت و برای انبار ارسال شد.');
    app.orderDraft=[];
    // Clear the editor immediately and remove the submitted visitor from the cached queue.
    if(app.salesCache){app.salesCache.visits=(app.salesCache.visits||[]).filter(v=>v.id!==visitId);app.salesCache.fetchedAt=0;}
    if(app.page==='sales')renderSales('onsite');
    // Wait out any earlier read, then fetch a post-submission snapshot (no stale queue).
    const pending=app.salesFetchPromise;
    void Promise.resolve(pending).catch(()=>{}).then(()=>fetchSalesCache(true)).then(data=>{
      if(app.page==='sales'&&app.sub.sales==='onsite')paintSalesPaneV29('onsite',data);
    }).catch(()=>{});
  }catch(e){toast(e.message)}
  finally{app.onsiteSubmitting=false;buttons.forEach(b=>b.disabled=false);}
}
const _legacyResubmitOrderV25=resubmitOrder;
async function resubmitOrder(id){try{const result=await api('/api/orders/'+id+'/resubmit-sales',{method:'POST',body:'{}'});toast('سفارش دوباره به صف انبار ارسال شد.');closeModal();if(app.salesCache)app.salesCache.fetchedAt=0;const isStore=result.order?.orderType==='STORE';if(isStore)app.salesStoreTab='processing';await renderSales(isStore?'stores':'flow')}catch(e){toast(e.message)}}
const _legacySaveReturnedOrderV25=saveReturnedOrder;
async function saveReturnedOrder(id){
  const items=(app.returnEdit?.items||[]).filter(i=>i.itemStatus!=='CANCELLED');
  if(!items.length)return toast('حداقل یک قلم معتبر لازم است.');
  if(items.some(item=>!item.productId||n(item.requestedQty)<=0))return toast('برای همه ردیف‌ها محصول و مقدار معتبر وارد کنید.');
  try{
    const payload={items:items.map(item=>({id:item.id||null,productId:item.productId,requestedQty:n(item.requestedQty),requestedUnit:item.requestedUnit,description:String(item.description||'').trim()}))};
    await api('/api/orders/'+id+'/returned-edit',{method:'PUT',body:JSON.stringify(payload)});
    toast('اصلاحات سفارش ثبت شد و در سوابق فعالیت ذخیره گردید.');
    const isStore=app.returnEdit?.orderType==='STORE'; closeModal(); app.returnEdit=null; if(app.salesCache)app.salesCache.fetchedAt=0; if(isStore)app.salesStoreTab='processing'; await renderSales(isStore?'stores':'flow');
  }catch(e){toast(e.message)}
}

/* ---------- v37.20.0 — ویرایش سفارش ورودی فروشگاه در کارتابل فروش ---------- */
async function openSalesStoreOrderEdit(id){
  try{
    const d=await api('/api/orders/'+id); const o=d.order;
    if(!o||o.orderType!=='STORE') return toast('این سفارش از نوع فروشگاهی نیست.');
    if(o.status!=='STORE_PENDING_SALES') return toast('ویرایش سفارش فروشگاه فقط پیش از تأیید فروش امکان‌پذیر است.');
    app.salesStoreEdit={orderId:id,items:(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').map(i=>({id:i.id,productId:i.productId,productLabel:i.product?.name||'',requestedQty:i.requestedQty,requestedUnit:i.requestedUnit,description:i.description||''}))};
    renderSalesStoreEditor(o);
  }catch(e){toast(e.message)}
}
function renderSalesStoreEditor(o){
  const items=app.salesStoreEdit?.items||[];
  openModal('ویرایش سفارش ورودی فروشگاه',`<div class="returned-editor"><div class="returned-editor-head"><div><span class="eyebrow">STORE ORDER EDIT</span><h2>ویرایش سفارش ${esc(fa(o.orderNo||'—'))}</h2><p>${esc(o.storeName||'فروشگاه')}</p></div><span class="badge orange">در انتظار تأیید فروش</span></div><div class="returned-editor-note">پیش از تأیید فروش می‌توانید محصول، مقدار، واحد و توضیحات هر ردیف را تغییر دهید، ردیف جدید اضافه کنید یا ردیف موجود را حذف کنید. همه تغییرات با نام کاربر در سوابق فعالیت ثبت می‌شود.</div><div id="salesStoreEditLines" class="returned-edit-lines"></div><div class="returned-editor-bottom"><button class="btn btn-secondary btn-lg" data-action="sales-store-add-line">${icon('plus',17)} افزودن ردیف</button><span class="subtle">تعداد ردیف فعال: ${qty(items.length)}</span></div><div class="field section-space"><label>یادداشت سفارش</label><div class="input-shell op-input op-textarea"><textarea id="salesStoreEditNotes" rows="2" maxlength="1000" placeholder="یادداشت سفارش">${esc(o.notes||'')}</textarea></div></div><div class="modal-actions"><button class="btn btn-secondary" data-action="close-modal">انصراف</button><button class="btn btn-primary btn-lg" data-action="save-sales-store-order" data-id="${esc(o.id)}">ذخیره تغییرات</button></div></div>`);
  const modalCard=$('.modal-card'); if(modalCard) modalCard.classList.add('returned-modal-card');
  renderSalesStoreEditLines();
}
function renderSalesStoreEditLines(){
  const box=$('#salesStoreEditLines'); if(!box)return;
  const items=app.salesStoreEdit?.items||[];
  box.innerHTML=items.map((x,i)=>`<div class="returned-edit-row bt-product-row-v35 bt-returned-order-row-v35" data-edit-row="${i}"><div class="returned-edit-index">${fa(String(i+1))}</div><div class="order-field"><label>محصول</label><div class="input-shell input-xl"><span>${icon('search',16)}</span><input value="${esc(x.productLabel||'')}" data-ss-product-search="${i}" placeholder="نام یا کد سریع" autocomplete="off"></div><div class="product-suggest" data-ss-suggest="${i}"></div></div><div class="order-field"><label>مقدار درخواستی</label><div class="input-shell input-xl quantity-shell"><input data-ss-qty="${i}" inputmode="decimal" type="number" min="0" step="0.001" value="${esc(x.requestedQty)}"></div></div><div class="order-field"><label>واحد</label><div class="input-shell input-xl"><select data-ss-unit="${i}"><option ${x.requestedUnit==='کیلوگرم'?'selected':''}>کیلوگرم</option><option ${x.requestedUnit==='بسته'?'selected':''}>بسته</option><option ${x.requestedUnit==='عدد'?'selected':''}>عدد</option><option ${x.requestedUnit==='کارتن'?'selected':''}>کارتن</option></select></div></div><div class="order-field return-description-field"><label>توضیحات</label><div class="input-shell input-xl"><textarea data-ss-description="${i}" rows="2" placeholder="توضیحات این ردیف...">${esc(x.description||'')}</textarea></div></div><button type="button" class="btn btn-ghost btn-sm returned-delete-btn" data-action="sales-store-delete-line" data-index="${i}" aria-label="حذف ردیف">${icon('trash',16)} حذف</button></div>`).join('') || '<div class="empty">قلمی در این سفارش باقی نمانده است.</div>';
  $$('#salesStoreEditLines [data-ss-product-search]').forEach(inp=>inp.addEventListener('input',()=>salesStoreProductSearch(Number(inp.dataset.ssProductSearch),inp.value)));
  $$('#salesStoreEditLines [data-ss-qty]').forEach(inp=>inp.addEventListener('input',()=>{app.salesStoreEdit.items[Number(inp.dataset.ssQty)].requestedQty=inp.value;}));
  $$('#salesStoreEditLines [data-ss-unit]').forEach(sel=>sel.addEventListener('change',()=>{app.salesStoreEdit.items[Number(sel.dataset.ssUnit)].requestedUnit=sel.value;}));
  $$('#salesStoreEditLines [data-ss-description]').forEach(inp=>inp.addEventListener('input',()=>{app.salesStoreEdit.items[Number(inp.dataset.ssDescription)].description=inp.value;}));
}
function salesStoreProductSearch(i,q){
  searchProductOptions($(`[data-ss-product-search="${i}"]`),$(`[data-ss-suggest="${i}"]`),q,p=>`<button type="button" class="product-option" data-action="pick-sales-store-product" data-index="${i}" data-product-id="${esc(p.id)}" data-label="${esc(p.name)}"><span><b>${esc(p.name)}</b><span>${esc(p.defaultUnit)}</span></span>${icon('check',15)}</button>`);
}
function pickSalesStoreProduct(i,id,label){if(!app.salesStoreEdit?.items?.[i])return;app.salesStoreEdit.items[i].productId=id;app.salesStoreEdit.items[i].productLabel=label;const inp=$(`[data-ss-product-search="${i}"]`);if(inp)inp.value=label;const box=$(`[data-ss-suggest="${i}"]`);if(box)box.innerHTML='';$(`[data-ss-qty="${i}"]`)?.focus();}
function addSalesStoreLine(){if(!app.salesStoreEdit)return;app.salesStoreEdit.items.push({id:null,productId:'',productLabel:'',requestedQty:'',requestedUnit:'کیلوگرم',description:''});renderSalesStoreEditLines();toast('ردیف جدید اضافه شد.');}
function deleteSalesStoreLine(i){const items=app.salesStoreEdit?.items;if(!items||!items[i])return;if(items.length<=1)return toast('حداقل یک قلم باید در سفارش باقی بماند.');items.splice(i,1);renderSalesStoreEditLines();toast('ردیف حذف شد؛ با ذخیره تغییرات نهایی می‌شود.');}
async function saveSalesStoreOrder(id){
  const items=(app.salesStoreEdit?.items||[]);
  if(!items.length)return toast('حداقل یک قلم معتبر لازم است.');
  if(items.some(item=>!item.productId||n(item.requestedQty)<=0))return toast('برای همه ردیف‌ها محصول و مقدار معتبر وارد کنید.');
  try{
    const payload={items:items.map(item=>({productId:item.productId,requestedQty:n(item.requestedQty),requestedUnit:item.requestedUnit,description:String(item.description||'').trim()})),notes:String($('#salesStoreEditNotes')?.value||'').trim()};
    await api('/api/store/orders/'+id+'/sales-edit',{method:'PUT',body:JSON.stringify(payload)});
    toast('تغییرات سفارش فروشگاه ثبت شد و در سوابق فعالیت ذخیره گردید.');
    closeModal(); app.salesStoreEdit=null; await renderSales('stores'); await refreshIndicators();
  }catch(e){toast(e.message)}
}

/* ================================================================
   v26 — Complete visual redesign / dashboard + sales desk + forms
   ================================================================ */
/* ---------- v37.11.0 — آمار زندهٔ سفارشات ورودی امروز در داشبورد انبار ---------- */
