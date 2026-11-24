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
          ${app.features?.pickupStaging?`<div class="gt-order-search" data-pickup-search><label for="pickupOrderSearch">جست‌وجوی سفارش غیرحضوری برای تحویل در انبار</label><div class="cust-code-row"><input id="pickupOrderSearch" type="search" maxlength="80" placeholder="شماره سفارش، نام یا شماره تماس صاحب سفارش"><button type="button" class="btn btn-secondary" data-pickup-list>لیست سفارش</button><button type="button" class="btn btn-secondary" data-pickup-clear hidden>بازگشت به ورود عادی</button></div><div data-pickup-results aria-live="polite"></div><div data-pickup-selected></div></div>`:''}
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
  </section>${app.features?.pickupStaging?`<section class="sd-panel gt-pickup-list-page" data-pickup-list-page hidden aria-labelledby="pickupListTitle">
    <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico">${icon('receipt',20)}</span><div><h2 id="pickupListTitle" tabindex="-1">فهرست سفارش‌های قابل تحویل امروز</h2><p>سفارش‌های غیرحضوری تحویل در انبار، بدون مراجعهٔ باز، برای ثبت ورود نمایش داده می‌شوند.</p></div></div><button type="button" class="btn btn-secondary" data-pickup-list-back>بازگشت به ثبت ورود</button></div>
    <div class="gt-pickup-list-body"><label for="pickupListSearch">جستجو در سفارش‌های امروز</label><input id="pickupListSearch" type="search" maxlength="80" autocomplete="off" placeholder="شماره سفارش، نام یا شماره تماس"><div data-pickup-list-results aria-live="polite"></div></div>
  </section>`:''}`;
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
 let timer=0,seq=0;app.pickupSelected=null;
 const listButton=document.querySelector('[data-pickup-list]'),entryPanel=document.querySelector('.gt-entry-panel'),listPanel=document.querySelector('[data-pickup-list-page]'),listResults=document.querySelector('[data-pickup-list-results]'),listSearch=$('#pickupListSearch');
 const resultRows=new Map();
 function renderPickupResults(host,data,list=false){
  const rows=data.orders||[];resultRows.set(host,rows);
  host.innerHTML=`<div class="bt-table-wrap"><table class="bt-table gt-pickup-search-table"><caption class="bt-caption">${list?'سفارش‌های امروز در انتظار ثبت ورود':'نتایج جستجوی سفارش'}</caption><thead><tr><th scope="col">شماره سفارش</th><th scope="col">مشتری</th><th scope="col">شماره تماس</th><th scope="col">تاریخ تحویل</th><th scope="col">عملیات</th></tr></thead><tbody>${rows.map((o,i)=>`<tr><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="مشتری">${esc(o.customerName||'—')}</td><td data-label="شماره تماس">${esc(fa(o.customerPhone||''))}</td><td data-label="تاریخ تحویل">${esc(o.deliveryDate?dateLabel(o.deliveryDate):'تعیین نشده')}</td><td data-label="عملیات" class="bt-col-actions"><div class="bt-actions"><button type="button" class="btn btn-secondary btn-sm" data-pickup-details="${i}">جزئیات سفارش</button><button type="button" class="btn btn-secondary btn-sm" data-pickup-choose="${i}" ${o.hasOpenVisit?'disabled':''}>${o.hasOpenVisit?'مراجعه باز دارد':'انتخاب سفارش'}</button></div></td></tr>`).join('')||'<tr><td colspan="5">سفارشی یافت نشد.</td></tr>'}</tbody></table></div>`;
  if(list){const offset=data.offset||0,limit=data.limit||50,total=data.total||0;host.insertAdjacentHTML('beforeend',`<nav class="gt-pickup-list-pages" aria-label="صفحات سفارش‌ها"><span>${total?qty(offset+1)+' تا '+qty(Math.min(offset+rows.length,total))+' از '+qty(total):'۰ سفارش'}</span> <button type="button" class="btn btn-secondary btn-sm" data-pickup-page="${Math.max(0,offset-limit)}" ${offset===0?'disabled':''}>صفحه قبل</button> <button type="button" class="btn btn-secondary btn-sm" data-pickup-page="${offset+limit}" ${offset+limit>=total?'disabled':''}>صفحه بعد</button></nav>`);}
 }
 async function loadPickupResults(host,url,list,id){
  resultRows.delete(host);host.textContent='در حال دریافت سفارش‌ها…';
  try{const data=await api(url);if(seq!==id||!host.isConnected)return;renderPickupResults(host,data,list);}
  catch(e){if(seq===id&&host.isConnected){host.textContent='خطا در دریافت سفارش‌ها: '+e.message;if(list)host.insertAdjacentHTML('beforeend',' <button type="button" class="btn btn-secondary btn-sm" data-pickup-retry>تلاش مجدد</button>');}}
 }
 function loadList(offset=0){const q=listSearch.value.trim();loadPickupResults(listResults,'/api/pickup/orders?view=entry&offset='+encodeURIComponent(offset)+'&q='+encodeURIComponent(q),true,++seq);}
 function showEntry(){++seq;clearTimeout(timer);listPanel.hidden=true;entryPanel.hidden=false;listButton?.focus();}
 input.addEventListener('input',()=>{clearTimeout(timer);const search=input.value.trim(),id=++seq;if(search.length<2){results.innerHTML='';return;}timer=setTimeout(()=>loadPickupResults(results,'/api/pickup/orders?q='+encodeURIComponent(search),false,id),250);});
 listButton?.addEventListener('click',()=>{clearTimeout(timer);++seq;results.innerHTML='';entryPanel.hidden=true;listPanel.hidden=false;listSearch.value='';$('#pickupListTitle').focus();loadList();});
 listPanel?.querySelector('[data-pickup-list-back]').addEventListener('click',showEntry);
 listSearch?.addEventListener('input',()=>{clearTimeout(timer);++seq;timer=setTimeout(()=>loadList(),250);});
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
 function handlePickupResultClick(e,host){
  const page=e.target.closest('[data-pickup-page]');if(page&&!page.disabled){clearTimeout(timer);loadList(Number(page.dataset.pickupPage)||0);return;}
  if(e.target.closest('[data-pickup-retry]')){loadList();return;}
  const rows=resultRows.get(host)||[];
  const details=e.target.closest('[data-pickup-details]');
  if(details){const o=rows[Number(details.dataset.pickupDetails)];if(!o)return;const lines=(o.items||[]).map(i=>`<tr><td data-label="محصول">${esc(i.productName||'—')}</td><td data-label="مقدار درخواستی">${qty(i.requestedQty)} ${esc(i.requestedUnit||'')}</td></tr>`).join('');openModal('جزئیات سفارش غیرحضوری',`<div class="gate-pickup-search-detail"><p>سفارش ${esc(fa(o.orderNo||'—'))} • ${esc(o.customerName||'—')} • ${esc(fa(o.customerPhone||'—'))}</p><p>تاریخ تحویل: ${esc(o.deliveryDate?dateLabel(o.deliveryDate):'تعیین نشده')} • وضعیت: ${badge(o.status)}</p><div class="bt-table-wrap"><table class="bt-table"><caption class="bt-caption">اقلام سفارش</caption><thead><tr><th>محصول</th><th>مقدار درخواستی</th></tr></thead><tbody>${lines||'<tr><td colspan="2">قلمی ثبت نشده است.</td></tr>'}</tbody></table></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button></div></div>`);return;}
  const button=e.target.closest('[data-pickup-choose]');if(!button)return;
  const o=rows[Number(button.dataset.pickupChoose)];if(!o)return;
  if(host===listResults)showEntry();
  ++seq;clearTimeout(timer);app.pickupSelected=o;otherDraft={name:'',phone:''};resetPickupVehicle();
  selected.innerHTML=`<p>سفارش ${esc(fa(o.orderNo||'—'))} • صاحب سفارش: ${esc(o.customerName||'—')} • ${esc(fa(o.customerPhone||''))}</p><label class="gt-switch"><input type="checkbox" data-pickup-other> ثبت تحویل‌گیرنده</label> <span data-pickup-mode-help></span>`;
  results.innerHTML='';input.disabled=true;if(listButton)listButton.disabled=true;clear.hidden=false;
  $('#gateCustCode').value='';$('#gateCustCode').disabled=true;document.querySelector('.cust-code-entry').style.display='none';
  $('#gateCustId').value='';$('#gateCustomerCodeValue').value='';$('#gateCustomerResults').innerHTML='';$('#gateCustChip').innerHTML='';$('#plateSuggest').innerHTML='';app.customerMatches=[];
  document.querySelector('[data-gate-entry-title]').textContent='ثبت ورود برای تحویل سفارش';
  document.querySelector('[data-gate-entry-help]').textContent='اگر شخص دیگری برای تحویل مراجعه کرده، گزینه ثبت تحویل‌گیرنده را فعال کنید.';
  document.querySelector('[data-gate-entry-badge]').textContent='مراجعه برای تحویل در انبار';
  document.querySelector('[data-gate-entry-submit-help]').textContent='پس از ثبت، به انبار اطلاع داده می‌شود؛ سفارش تازه‌ای ساخته نمی‌شود.';
  $('#gateForm button[type=submit]').textContent='ثبت ورود برای تحویل';setRecipientMode(false);
 }
 results.addEventListener('click',e=>handlePickupResultClick(e,results));
 listResults?.addEventListener('click',e=>handlePickupResultClick(e,listResults));
 clear.addEventListener('click',()=>{
  ++seq;clearTimeout(timer);app.pickupSelected=null;otherDraft={name:'',phone:''};selected.innerHTML='';results.innerHTML='';input.disabled=false;if(listButton)listButton.disabled=false;input.value='';clear.hidden=true;
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
