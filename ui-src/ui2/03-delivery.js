function futureOrderRowsV25(orders){
 const rows=(orders||[]).map(o=>{
  const actions=`<button class="btn btn-secondary btn-sm" data-action="order-details" data-id="${esc(o.id)}">${icon('eye',13)} جزئیات سفارش</button>`+(canSalesEditRemote(o)&&o.pickupCancellation?.status!=='PENDING_SALES'?`<button class="btn btn-ghost btn-sm" data-action="future-edit" data-id="${esc(o.id)}">${icon('edit',13)} ویرایش سفارش</button>`:'')+(canSalesCancelRemote(o)?`<button class="btn btn-ghost btn-sm danger-text" data-action="future-cancel" data-id="${esc(o.id)}">${icon('trash',13)} لغو سفارش</button>`:'');
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
 const action=disabled?'':store?`<button type="button" class="btn btn-primary" data-action="order-details" data-id="${esc(o.id)}">بررسی وضعیت و مدارک سرویس</button>`:o.status==='SETTLEMENT_PENDING'?`<button type="button" class="btn btn-primary" data-action="transport-sales-work" data-id="${esc(o.id)}">${o.transportDeparture?'ثبت پرداختی':'بررسی فاکتور و چاپ برگه ارسال'}</button>`:o.status==='CLOSED'&&o.payment?`<button type="button" class="btn btn-primary" data-action="invoice" data-id="${esc(o.id)}">نمایش فاکتور بسته‌شده</button>`:'';
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
    clearIssuedTransportSettlement(data);
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

