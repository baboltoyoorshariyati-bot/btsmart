function stlReset(){ app.stl = {orderId:null, order:null, items:[], prices:[], priceMap:Object.create(null), drivers:[], devices:[], discountAmount:0, additionsAmount:0, sig:false, fp:'', manual:false, busy:false, dispatchBusy:false, paymentRows:[{type:'CASH',amount:''}]}; Object.assign(stl, app.stl); app.selectedSettlement=null; }
function stlPrice(v){ return Number(en(String(v ?? '')).replace(/[^0-9]/g,'')) || 0; }
function stlFmtPrice(v){ return v ? new Intl.NumberFormat('fa-IR').format(v) : ''; }
function stlFormatPriceInput(input){
  const raw=input.value, caret=input.selectionStart ?? raw.length;
  const digitsBefore=en(raw.slice(0,caret)).replace(/[^0-9]/g,'').length;
  const digits=en(raw).replace(/[^0-9]/g,'');
  input.value=digits ? stlFmtPrice(stlPrice(digits)) || '۰' : '';
  let position=0,count=0;
  while(position<input.value.length && count<digitsBefore){
    if(/[0-9]/.test(en(input.value[position]))) count++;
    position++;
  }
  input.setSelectionRange(position,position);
}
function stlActive(it){ return !it.voided && !it.skip; }
function stlSubtotal(){ return stl.items.filter(stlActive).reduce((s,i)=>s+Math.round(i.delivered*i.price),0); }
function stlTotal(){ return stlSubtotal()-Number(stl.discountAmount||0)+Number(stl.additionsAmount||0); }
function stlDeposit(){return stl.order?.deposit?.status==='RECEIVED'?Number(stl.order.deposit.amount||0)-Number(stl.order.deposit.refundedAmount||0):0;}
function stlDue(){return stlTotal()-stlDeposit();}
function stlAdjustmentsHtml(o){
 const locked=o.dispatch?.priceApprovedAt?'disabled':'';
 return `<div class="stl-adjustments stl-money-summary"><div class="stl-summary-line"><span>جمع اقلام</span><b id="stlSubtotalAmount">${money(stlSubtotal())}</b></div><label>تخفیفات (ریال)<input class="stl-input" type="text" inputmode="numeric" data-stl-adjust="discountAmount" value="${esc(stlFmtPrice(stl.discountAmount))}" ${locked} placeholder="۰"></label><label>اضافات (ریال)<input class="stl-input" type="text" inputmode="numeric" data-stl-adjust="additionsAmount" value="${esc(stlFmtPrice(stl.additionsAmount))}" ${locked} placeholder="۰"></label><div class="stl-summary-line stl-summary-grand"><span>مبلغ نهایی فاکتور</span><b id="stlTotalAmount">${money(stlTotal())}</b></div>${stlDeposit()?`<div class="stl-summary-line"><span>بیعانه پس از استرداد</span><b id="stlDepositAmount">${money(stlDeposit())}</b></div><div class="stl-summary-line"><span>مانده قابل دریافت</span><b id="stlDueAmount">${money(stlDue())}</b></div><div class="deposit-excess" id="stlDepositExcess" hidden><span>بیعانه بیش از مبلغ فاکتور است؛ ابتدا اضافه‌پرداخت را دستی برگردانید.</span><button type="button" class="btn btn-secondary btn-sm" data-stl="refund-deposit-excess">ثبت استرداد دستی اضافه‌پرداخت</button></div>`:''}</div>`;
}
function stlKg(){ return stl.items.filter(stlActive).reduce((s,i)=>s+i.delivered,0); }
function stlItemsOf(o, prices){
  const map = Object.fromEntries((prices||[]).map(x=>[x.productId, Number(x.price)]));
  return (o.items||[]).map(i=>{
    const status = i.itemStatus || 'PENDING';
    const voided = status === 'CANCELLED';
    const delivered = Number(i.deliveredKg || 0);
    const listedPrice = Number(map[i.productId] || 0);
    const savedPrice = Number(i.unitPrice || 0);
    // Pending settlement should start from today's product-list price; stale or
    // zero item snapshots must not force sales staff to re-enter that price.
    const price = listedPrice > 0 ? listedPrice : (savedPrice > 0 ? savedPrice : 0);
    return { id:i.id, productId:i.productId, name:i.product?.name || i.productId || 'کالا', status, voided, skip:false, delivered, outOfStock: !voided && (status === 'OUT_OF_STOCK' || delivered <= 0), price, warehouseNote: String(i.warehouseNote||''), warehouseNoteByName: String(i.warehouseNoteByName||'') };
  });
}
// A compact, read-only row of all available customer details (shared by warehouse/sales).
function orderCustomerFields(o){
  const c=o.customer||{},v=o.visit||{};
  const plate=typeof formatDispatchVehiclePlate==='function'?formatDispatchVehiclePlate(c.plate,'بدون پلاک'):(c.plate||'بدون پلاک');
  const fields=[['نام مشتری',c.name||o.storeName||'—'],['کد مشتری',c.code||'—'],['شماره تماس',c.phone||'—'],['پلاک',plate],['نوع وسیله',c.vehicleType||v.vehicleType||'—'],['محله',c.district||v.district||'—'],['محل ارسال',o.dispatchPlace||c.address||'—'],['شماره سفارش',o.orderNo||'—']];
  for(const [label,value] of [['شماره دوم',c.phone2],['کد ملی',c.nationalId],['شرکت / واحد',c.company],['نشانی مشتری',c.address],['یادداشت مشتری',c.notes]]){
    if(value&&String(value).trim())fields.push([label,value]);
  }
  return fields;
}
function orderCustomerStripHtml(o,settlement=false){
  const fields=orderCustomerFields(o).map(([label,value])=>[label,label==='شماره سفارش'?fa(value):value]).filter(([label])=>!settlement||!['نوع وسیله','پلاک','محله','محل ارسال'].includes(label));
  return `<div class="bt-customer-strip-scroll" role="region" aria-label="مشخصات مشتری" tabindex="0"><div class="bt-customer-strip" style="--customer-fields:${fields.length}">${fields.map(([label,value])=>`<div class="bt-customer-field" tabindex="0" title="${esc(label)}: ${esc(value)}" aria-label="${esc(label)}: ${esc(value)}"><b>${esc(label)}</b><span>${label==='پلاک'?plateViewHtml(o.customer?.plate,'بدون پلاک',true):esc(value)}</span></div>`).join('')}</div></div>`;
}
function stlDispatchControls(o,returnControl=''){
  if(o.transportWorkflow===1&&o.deliveryMode==='PICKUP')return `<div class="stl-dispatch-control">${returnControl}<span>تحویل در انبار؛ ارسال به پخش مجاز نیست.</span></div>`;
  if(o.deposit)return `<div class="stl-dispatch-control deposit-dispatch-block">${returnControl}<span class="deposit-dispatch-message">سفارش بیعانه‌دار به پخش ارسال نمی‌شود.</span></div>`;
  const d=o.dispatch||null;
  if(d && !['PENDING_ASSIGN','ASSIGNED'].includes(d.status)) return `<span class="badge blue">${esc(dispatchStatusLabel(d.status))}</span>`;
  const drivers=Array.isArray(stl.drivers)?stl.drivers:[];
  const options=drivers.map(x=>`<option value="${esc(x.id)}" ${x.id===d?.driverId?'selected':''}>${esc(x.fullName)} — ${esc(formatDispatchVehiclePlate(x.plate,'بدون پلاک'))}</option>`).join('');
  const actionLabel=d?.priceApprovedAt?'تغییر راننده':'تأیید قیمت و ارسال';
  const hint=drivers.length?'':'<small class="stl-dispatch-hint">رانندهٔ فعالی پیدا نشد؛ ابتدا راننده را در مدیریت فعال کنید.</small>';
  return `<div class="stl-dispatch-control"><select class="adm-select" data-stl-driver aria-label="انتخاب راننده برای سفارش"><option value="">انتخاب راننده فعال…</option>${options}</select>${returnControl}<button type="button" class="btn btn-primary btn-sm" data-stl="send-dispatch">${icon('send',14)} ${actionLabel}</button><span data-stl-plate>${plateViewHtml(drivers.find(x=>x.id===d?.driverId)?.plate,'—',true)}</span>${hint}</div>`;
}
// Shared by the live UI layer and the fallback settlement renderer.
function stlFooterHtml(o){
  const dispatched=!!o.dispatch;
  const returnControl=dispatched?'':`<button type="button" class="btn btn-secondary" data-stl="reopen">${icon('scale',15)} برگشت به انبار</button>`;
  return `<footer class="stl-actions stl-actions-bottom"><div class="stl-footer-scroll"><div class="stl-primary-actions">
    ${stlDispatchControls(o,returnControl)}
    ${dispatched?'':`<button type="button" class="stl-submit" id="stlSubmitBtn" data-stl="submit">${icon('receipt',18)} تأیید و صدور فاکتور</button>`}
  </div></div>${dispatched?`<div class="stl-dispatch-lock"><b>مرحلهٔ بعد</b><span>تأیید خروج راننده توسط نگهبان؛ سپس ثبت تحویل و بازبینی نهایی فروش در تب پخش.</span></div>`:''}</footer>`;
}
function stlEmptyHtml(){ return `<div class="stl-empty"><div class="stl-empty-ico">${icon('receipt',24)}</div><b>یک سفارش از فهرست انتخاب کنید</b><span>بعد از انتخاب، اقلام، قیمت‌ها و ثبت تسویه در این بخش انجام می‌شود.</span></div>`; }
function renderSalesSettlementV25(orders){
  const pending = orders.filter(o=>o.status==='SETTLEMENT_PENDING');
  const finalized = orders.filter(o=>['SETTLED','EXITED'].includes(o.status)||((o.payments||[]).length&&!['SETTLEMENT_PENDING','CANCELLED'].includes(o.status)&&!o.payment?.archived)); // v37.5.0 — فاکتور هر سرویس هم در فهرست است
  return `<section class="v26-sales-pane stl-pane">
    <div class="stl-layout">
      <aside class="stl-queue"><div class="stl-block-head"><span class="stl-eyebrow">04 / SETTLEMENT</span><h2>سفارش‌های آماده تسویه</h2></div><div class="v26-settlement-list stl-queue-list">${settlementPendingRowsV27(pending)}</div></aside>
      <section class="stl-main" id="stlMain">${stl.orderId ? '' : stlEmptyHtml()}</section>
    </div>
    <section class="stl-done"><div class="stl-block-head"><span class="stl-eyebrow">INVOICE & EXIT</span><h2>فاکتورهای صادرشده</h2></div><div class="v26-invoice-list">${invoiceRowsV27(finalized)}</div></section>
  </section>`;
}
function settlementPendingRowsV27(rows){
  return rows.map(o=>`<button type="button" class="stl-queue-item stl-queue-item-card ${stl.orderId===o.id?'active':''}" data-stl="select" data-action="select-settlement" data-id="${esc(o.id)}">
    <strong class="stl-queue-customer">${esc(storeAwareOrderName(o))}</strong>
    <span class="stl-queue-order"><span>شماره سفارش</span><bdi>${esc(fa(o.orderNo||'—'))}</bdi></span>
  </button>`).join('') || '<div class="stl-q-empty">سفارشی در انتظار تسویه نیست.</div>';
}
function stlRowHtml(it){
  const priceLocked = !!stl.order?.dispatch?.priceApprovedAt;
  const dis = (it.voided || it.skip || it.outOfStock || priceLocked) ? 'disabled' : '';
  const note = it.voided ? 'لغو شده در انبار' : (it.outOfStock ? 'ناموجود در انبار' : (priceLocked ? 'قیمت توسط فروش تأیید شده' : ''));
  const needs = stlActive(it) && it.delivered > 0 && !(it.price > 0);
  return `<div class="stl-row ${it.voided?'is-void':''} ${it.skip?'is-skip':''} ${needs?'needs-price':''}" data-stl-row="${esc(it.id)}">
    <div class="stl-cell stl-cell-name"><b>${esc(it.name)}</b>${note?`<small>${esc(note)}</small>`:''}${it.warehouseNote?`<small class="stl-warehouse-note" title="توضیح انبار${it.warehouseNoteByName?` — ${esc(it.warehouseNoteByName)}`:''}">${icon('clipboard',12)} <b>توضیح انبار:</b> ${esc(it.warehouseNote)}</small>`:''}</div>
    <div class="stl-cell"><span class="stl-label">تحویلی</span><span class="stl-kg">${qty(it.delivered)} کیلوگرم</span></div>
    <div class="stl-cell"><span class="stl-label">قیمت هر کیلو (ریال)</span><input class="stl-input" type="text" inputmode="numeric" autocomplete="off" data-stl-price="${esc(it.id)}" value="${esc(stlFmtPrice(it.price))}" ${dis} placeholder="${it.outOfStock?'—':'۰'}"></div>
    <div class="stl-cell"><span class="stl-label">مبلغ</span><b class="stl-amount" data-stl-amount="${esc(it.id)}">${money(stlActive(it)?Math.round(it.delivered*it.price):0)}</b></div>
    <div class="stl-cell stl-cell-cancel"><label class="stl-check"><input type="checkbox" data-stl-cancel="${esc(it.id)}" ${it.skip?'checked':''} ${(it.voided||priceLocked)?'disabled':''}> لغو قلم</label></div>
  </div>`;
}
function stlPaymentRowsHtml(){
  const devices=stl.devices||[];
  return `<div class="stl-payments" id="stlPayments"><div class="stl-payment-row" data-payrow><label class="stl-pay-field"><span>روش دریافت</span><select class="adm-select" data-paytype><option value="CASH">نقدی</option><option value="POS">پوز</option><option value="CARD_TRANSFER">کارت‌به‌کارت</option><option value="CHECK">چک</option><option value="CREDIT">معوق</option></select></label><label class="stl-pay-field"><span>مبلغ (ریال)</span><input class="adm-input stl-pay-amount" data-payamount inputmode="numeric" placeholder="مثلاً ۲٬۵۰۰٬۰۰۰"></label><div class="stl-pay-detail" data-paydetail></div><button type="button" class="btn btn-secondary btn-sm" data-payremove aria-label="حذف روش پرداخت">حذف</button></div></div><button type="button" class="btn btn-secondary btn-sm" data-payadd>＋ افزودن روش پرداخت</button><div class="stl-pay-totals"><span>قابل تسویه: <b id="stlPayExpected">${money(Math.max(0,stlDue()))}</b></span><span>جمع ثبت‌شده: <b id="stlPaySum">۰</b></span><strong>مانده: <b id="stlPayBalance">${money(Math.max(0,stlDue()))}</b></strong></div>`;
}
/* v37.40.0 — مبلغ پیش‌فرض روش‌های تسویه: ردیف اول کل مبلغ فاکتور را می‌گیرد؛
   با افزودن تراکنش تازه یا ویرایش مبلغ یک ردیف، ماندهٔ فاکتور به‌صورت خودکار
   در ردیف‌های «خودکار» بعدی می‌نشیند تا جمع دقیقاً برابر مبلغ فاکتور شود. */
function stlPayParse(v){return Number(en(String(v ?? '')).replace(/[^0-9]/g,'')) || 0;}
function stlPayFmt(v){return v ? Number(v).toLocaleString('fa-IR') : '';}
function stlPayRows(){return [...document.querySelectorAll('#stlPayments [data-payrow]')];}
function stlPayBalance(exceptRow){const paid=stlPayRows().filter(r=>r!==exceptRow).reduce((s,r)=>s+stlPayParse(r.querySelector('[data-payamount]')?.value),0);return Math.max(0,stlDue()-paid);}
function stlPayAutoFill(row){const input=row?.querySelector('[data-payamount]');if(!input)return;row.dataset.autopay='1';input.value=stlPayFmt(stlPayBalance(row));}
function stlRefreshAutoPayments(){stlPayRows().forEach(r=>{if(r.dataset.autopay==='1')stlPayAutoFill(r);});stlPayUpdate();}
function stlPayUpdate(){const rows=stlPayRows(),sum=rows.reduce((n,r)=>n+stlPayParse(r.querySelector('[data-payamount]')?.value),0),expected=Math.max(0,stlDue());const a=document.getElementById('stlPaySum'),b=document.getElementById('stlPayExpected'),c=document.getElementById('stlPayBalance');if(a)a.textContent=money(sum);if(b)b.textContent=money(expected);if(c)c.textContent=money(expected-sum);}
function stlBindPayments(){
 const host=document.getElementById('stlPayments');if(!host)return;
 const devices=stl.devices||[];
 const makeDetail=(row)=>{const type=row.querySelector('[data-paytype]').value,box=row.querySelector('[data-paydetail]');let h='';
  if(type==='POS')h=`<label>دستگاه فعال<select class="adm-select" data-device><option value="">انتخاب دستگاه</option>${devices.map(d=>`<option value="${esc(d.id)}">${esc(d.bank)} ${esc(d.terminalNumber)}</option>`).join('')}</select></label><label>شماره پیگیری<input class="adm-input" data-reference placeholder="اختیاری"></label>`;
  if(type==='CARD_TRANSFER')h='<label>بانک / حساب مقصد<input class="adm-input" data-bank placeholder="بانک یا حساب مقصد"></label><label>شناسه پیگیری<input class="adm-input" data-reference placeholder="شناسه تراکنش"></label>';
  if(type==='CHECK')h='<label>بانک<input class="adm-input" data-bank placeholder="نام بانک"></label><label>شماره چک<input class="adm-input" data-check placeholder="شماره چک"></label><label>سررسید<input class="adm-input" data-due type="date"></label>';
  box.innerHTML=h;box.hidden=!h;};
 const upd=stlPayUpdate;
 const bindRow=(r)=>{if(r.dataset.bound)return;r.dataset.bound='1';makeDetail(r);const amt=r.querySelector('[data-payamount]');r.querySelector('[data-paytype]').onchange=()=>{makeDetail(r);stlPayAutoFill(r);upd();};amt.oninput=e=>{r.dataset.autopay='';const v=stlPayParse(e.target.value);e.target.value=stlPayFmt(v);stlRefreshAutoPayments();upd();};r.querySelector('[data-payremove]').onclick=()=>{if(host.querySelectorAll('[data-payrow]').length<=1)return toast('حداقل یک روش تسویه لازم است.');r.remove();stlRefreshAutoPayments();upd();};if(!amt.value.trim())stlPayAutoFill(r);};
 host.querySelectorAll('[data-payrow]').forEach(bindRow);
 const add=document.querySelector('[data-payadd]');if(add)add.onclick=()=>{const tpl=host.querySelector('[data-payrow]').cloneNode(true);delete tpl.dataset.bound;delete tpl.dataset.autopay;tpl.querySelector('[data-payamount]').value='';tpl.querySelector('[data-paytype]').value='CASH';tpl.querySelector('[data-paydetail]').innerHTML='';tpl.querySelector('[data-paydetail]').hidden=true;host.appendChild(tpl);bindRow(tpl);stlPayAutoFill(tpl);upd();const inp=tpl.querySelector('[data-payamount]');if(inp){inp.focus();inp.select?.();}};upd();
}
function stlCollectPayments(){const rows=[...document.querySelectorAll('#stlPayments [data-payrow]')];if(stlDue()===0 && rows.every(r=>!stlPayParse(r.querySelector('[data-payamount]')?.value)))return [];return rows.map(r=>{const value=s=>r.querySelector(`[data-${s}]`)?.value||'';const amount=Number(value('payamount').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,\s]/g,''))||0;return {type:value('paytype'),amount,deviceId:value('device'),reference:value('reference'),bank:value('bank'),checkNumber:value('check'),dueDate:value('due'),reason:value('reason')};});}
function stlFormHtml(o){
  const dispatchStarted=!!o.dispatch;
  const priceApproved=!!o.dispatch?.priceApprovedAt;
  const approvedBanner=priceApproved
    ? `<div class="stl-approved-banner"><strong>قیمت‌ها توسط فروش تأیید شد</strong><span>تأیید ${esc(formatDateTime24(o.dispatch.priceApprovedAt))} • ${esc(o.dispatch.priceApprovedBy||'فروش')}</span><b>جمع مبلغ برای راننده: ${money(o.dispatch.approvedTotalAmount||stlTotal())}</b></div>`
    : o.deposit?`<div class="stl-approval-prompt">سفارش بیعانه دارد؛ تسویه در فروش انجام می‌شود و ارسال به پخش امکان‌پذیر نیست.</div>${depositSummaryHtml(o.deposit)}`:`<div class="stl-approval-prompt">برای ارسال به پخش، قیمت هر کیلو برای تمام اقلام تحویلی را بررسی کنید؛ سفارش تا زمان تأیید فروش برای راننده قابل مشاهده نیست.</div>`;
  return `<section class="stl-card">
    <header class="stl-form-head stl-form-head-inline">
      <span class="stl-inline-title">${dispatchStarted?'قیمت‌گذاری و پخش':'فرم تسویه'}</span>${orderCustomerStripHtml(o,true)}
      <button type="button" class="btn btn-secondary btn-sm" data-stl="close">${icon('close',14)} بستن</button>
    </header>
    <div class="stl-section">
      ${approvedBanner}
      <div class="stl-section-head"><h3>${icon('scale',17)} اقلام و قیمت‌گذاری</h3><span class="stl-hint-inline">${priceApproved?'قیمت تأییدشده برای راننده قفل شده است.':'قیمت واحد را بر اساس هر کیلوگرم وارد و پیش از ارسال بازبینی کنید.'}</span></div>
      <div class="stl-table">${stl.items.length?`<div class="stl-grid-head"><span>قلم</span><span>وزن تحویلی</span><span>قیمت هر کیلو</span><span>مبلغ</span><span>لغو</span></div>`:''}${stl.items.map(stlRowHtml).join('') || '<div class="stl-q-empty">قلمی برای این سفارش ثبت نشده است.</div>'}</div>
      <div class="stl-weight-summary">جمع وزن تحویلی: <b id="stlTotalKg">${qty(stlKg())} کیلوگرم</b></div>
    </div>
    <div class="stl-invoice-bottom"><div class="stl-totals stl-financial-column">${stlAdjustmentsHtml(o)}</div><div class="stl-verification-column">
    ${dispatchStarted?`<div class="stl-dispatch-lock"><b>سفارش به پخش واگذار شده است.</b><span>از این فرم برای صدور فاکتور یا برگشت به انبار استفاده نمی‌شود. راننده مبلغ و وزن را می‌بیند؛ پس از تحویل، بازبینی نهایی در تب «پخش» انجام می‌شود.</span></div>`:`<div class="stl-section"><div class="stl-section-head"><h3>اطلاعات مشتری</h3></div><div>${esc(o.customer?.name||'—')} – ${esc(o.customer?.phone||'—')}</div></div>`}
    </div></div>
    ${dispatchStarted?'':`<div class="stl-section stl-payment-section"><div class="stl-section-head"><h3>${icon('receipt',17)} روش‌های تسویه</h3><span class="stl-hint-inline">پرداخت ترکیبی مجاز است؛ جمع مبالغ باید با مانده پس از کسر بیعانه برابر باشد.</span></div>${stlPaymentRowsHtml()}</div>`}
    <div id="stlErrors" class="stl-errors" hidden style="margin-top:8px"></div>
    ${stlFooterHtml(o)}
  </section>`;
}
window.BTSettlementRenderers={row:stlRowHtml,form:stlFormHtml};
function stlPaintForm(){
  const host = $('#stlMain'); if(!host || !stl.order) return;
  if(stl.order.transportWorkflow===1&&stl.order.deliveryMode==='DELIVERY'&&typeof transportSalesInvoicePanel==='function'){transportSalesInvoicePanel(stl.order);return;}
  host.innerHTML = stlFormHtml(stl.order);
  const driverSelect=host.querySelector('[data-stl-driver]');if(driverSelect)driverSelect.addEventListener('change',()=>{host.querySelector('[data-stl-plate]').innerHTML=plateViewHtml(stl.drivers.find(x=>x.id===driverSelect.value)?.plate,'—',true);});
  stlRecalc(); stlBindPayments();
}
function stlRecalc(){
  stl.items.forEach(it=>{
    const amt = document.querySelector(`[data-stl-amount="${CSS.escape(it.id)}"]`);
    if(amt) amt.textContent = money(stlActive(it)?Math.round(it.delivered*it.price):0);
    const row = document.querySelector(`[data-stl-row="${CSS.escape(it.id)}"]`);
    if(row){
      row.classList.toggle('is-skip', !!it.skip);
      row.classList.toggle('needs-price', stlActive(it) && it.delivered>0 && !(it.price>0));
    }
    const cancel=document.querySelector(`[data-stl-cancel="${CSS.escape(it.id)}"]`); if(cancel)cancel.disabled=!!(it.voided||stl.order?.dispatch?.priceApprovedAt);
    const inp = document.querySelector(`[data-stl-price="${CSS.escape(it.id)}"]`);
    if(inp) inp.disabled = !!(it.voided || it.skip || it.outOfStock || stl.order?.dispatch?.priceApprovedAt);
  });
  const sub=document.getElementById('stlSubtotalAmount'); if(sub) sub.textContent=money(stlSubtotal());
  const kg=document.getElementById('stlTotalKg'); if(kg) kg.textContent = qty(stlKg())+' کیلوگرم';
  const tot=document.getElementById('stlTotalAmount'); if(tot) tot.textContent = money(stlTotal());
  const due=document.getElementById('stlDueAmount');if(due)due.textContent=money(stlDue());
  const dep=document.getElementById('stlDepositAmount');if(dep)dep.textContent=money(stlDeposit());
  const excess=document.getElementById('stlDepositExcess');if(excess)excess.hidden=!(stlDue()<0&&stlTotal()>0);
  stlRefreshAutoPayments();
}
function stlUpdateSigState(){
  const el=document.getElementById('stlSigState'); if(!el) return;
  el.textContent = stl.sig ? 'امضا ثبت شد' : 'امضای مشتری را روی کادر بکشید';
  el.classList.toggle('ok', !!stl.sig);
}
function stlUpdateFpState(){
  const el=document.getElementById('stlFpState'); if(!el) return;
  if(stl.fp){ el.textContent='اثر انگشت احراز شد.'; el.className='stl-state ok'; }
  else if(stl.manual){ el.textContent='تسویه بدون اثر انگشت (با مجوز دستی).'; el.className='stl-state warn'; }
  else { el.textContent='احراز اثر انگشت یا فعال‌کردن تسویه دستی الزامی است.'; el.className='stl-state'; }
}
function stlBindSig(){
  stl.signaturePad?.dispose();
  const c=document.getElementById('stlSig'); if(!c)return;
  stl.signaturePad=btSignaturePad(c,ink=>{stl.sig=ink;stlUpdateSigState();});
}
function stlClearSig(){ stl.signaturePad?.clear(); stl.sig=false; stlUpdateSigState();
}
let stlOpenSequence=0;
async function stlOpen(id){
  const notices=captureEntityNotices('order',id);
  const host=$('#stlMain'); if(!host || !id)return;
  const seq=++stlOpenSequence;
  const current=()=>seq===stlOpenSequence && host.isConnected && $('#stlMain')===host;
  host.innerHTML='<div class="stl-empty" role="status">در حال دریافت اطلاعات سفارش…</div>';
  try{
    const d=await api('/api/orders/'+encodeURIComponent(id));
    if(!current())return;
    const o=d.order;
    if(!o || o.status!=='SETTLEMENT_PENDING'){
      stlReset();host.innerHTML=stlEmptyHtml();toast('این سفارش دیگر در مرحله تسویه نیست.');
      if(app.page==='sales'&&app.sub.sales==='settlement')await renderSales('settlement');
      return;
    }
    const transport=o.transportWorkflow===1&&o.deliveryMode==='DELIVERY'&&o.orderType!=='STORE';
    let prices=[],drivers=[],devices=[],devicesError=false;
    if(transport){
      // The dispatch invoice is priced from today's product list. Keep that
      // lookup best-effort so a temporary price-list outage does not hide the
      // handover or prevent staff from entering a price manually.
      try{prices=(await api('/api/prices')).prices||[];}catch(_){}
      // POS devices are only needed when the documents have returned.
      if(o.transportReturn){
        try{devices=(await api('/api/payment-devices')).devices||[];}catch(_){devicesError=true;}
      }
    }else{
      const [p,driverData,deviceData]=await Promise.all([api('/api/prices'),api('/api/dispatch/drivers'),api('/api/payment-devices')]);
      prices=p.prices||[];drivers=driverData.drivers||[];devices=deviceData.devices||[];
    }
    if(!current())return;
    Object.assign(stl, {orderId:id, order:o, items:stlItemsOf(o,prices), prices, priceMap:Object.fromEntries(prices.map(x=>[x.productId,Number(x.price)])), drivers, devices, devicesError, paymentRows:[{type:'CASH',amount:''}], discountAmount:0, additionsAmount:0, sig:false, fp:'', manual:false, busy:false});
    stl.discountAmount=Number(o.payment?.discountAmount ?? o.dispatch?.discountAmount ?? 0);
    stl.additionsAmount=Number(o.payment?.additionsAmount ?? o.dispatch?.additionsAmount ?? 0);
    app.selectedSettlement=id;
    document.querySelectorAll('.stl-queue-item').forEach(b=>b.classList.toggle('active', b.dataset.id===id));
    stlPaintForm();
    finishEntityNotices(notices);return true;
  }catch(e){
    if(!current())return;
    host.innerHTML=`<div class="stl-load-error" role="alert"><b>فرم سفارش باز نشد.</b><span>${esc(e.message||'خطا در دریافت اطلاعات سفارش')}</span><button type="button" class="btn btn-secondary btn-sm" data-stl="retry" data-id="${esc(id)}">تلاش دوباره</button></div>`;
    toast(e.message||'خطا در دریافت اطلاعات سفارش');
  }
}

function stlClose(){ stlOpenSequence++; stl.signaturePad?.dispose(); stlReset(); const host=$('#stlMain'); if(host) host.innerHTML=stlEmptyHtml(); document.querySelectorAll('.stl-queue-item.active').forEach(b=>b.classList.remove('active')); }
function stlValidateDispatch(){
  const errs=[];
  const active=stl.items.filter(stlActive);
  if(!active.some(i=>i.delivered>0)) errs.push('حداقل یک قلم تحویلی برای ارسال به پخش لازم است.');
  const noPrice=active.filter(i=>i.delivered>0&&!(i.price>0)).map(i=>i.name);
  if(noPrice.length) errs.push('قیمت هر کیلو را برای همهٔ اقلام تحویلی وارد کنید: '+noPrice.join('، ')+'.');
  if(stl.order?.deposit) errs.push('سفارش دارای بیعانه به پخش ارسال نمی‌شود.');
  if(stlTotal()<=0) errs.push('جمع مبلغ سفارش باید بیشتر از صفر باشد.');
  return errs;
}
function stlValidate(){
  const errs=[];
  const act=stl.items.filter(stlActive);
  if(!act.length) errs.push('هیچ قلم فعالی برای تسویه باقی نمانده است.');
  if(!act.some(i=>i.delivered>0)) errs.push('هیچ قلم تحویلی با وزن معتبر وجود ندارد.');
  const noPrice=act.filter(i=>i.delivered>0 && !(i.price>0)).map(i=>i.name);
  if(noPrice.length) errs.push('قیمت هر کیلو را برای این اقلام وارد کنید: '+noPrice.join('، ')+'.');
  if(!Number.isSafeInteger(stlTotal())||stlTotal()<=0||stlTotal()>1e12) errs.push('مبلغ نهایی پس از تخفیف و اضافات معتبر نیست.');
  const payments=stlCollectPayments();
  if(stlDue()<0) errs.push('بیعانه از مبلغ نهایی بیشتر است؛ ابتدا اضافه‌پرداخت را دستی تعیین تکلیف کنید.');
  if((stlDue()>0&&!payments.length)||payments.some(p=>!p.type||p.amount<=0)) errs.push('برای هر روش تسویه، روش و مبلغ معتبر وارد کنید.');
  const paid=payments.reduce((s,p)=>s+p.amount,0);
  if(paid!==Math.max(0,stlDue())) errs.push('جمع روش‌های تسویه باید دقیقاً برابر مانده پس از کسر بیعانه باشد.');
  if(payments.some(p=>p.type==='POS'&&!p.deviceId)) errs.push('برای هر پرداخت پوز، دستگاه فعال انتخاب کنید.');
  if(payments.some(p=>p.type==='CARD_TRANSFER'&&(!p.bank||!p.reference))) errs.push('برای کارت‌به‌کارت، بانک مقصد و شناسه پیگیری را وارد کنید.');
  if(payments.some(p=>p.type==='CHECK'&&(!p.bank||!p.checkNumber||!p.dueDate))) errs.push('برای چک، بانک، شماره چک و تاریخ سررسید را وارد کنید.');
  return errs;
}
function stlShowErrors(list){
  const box=document.getElementById('stlErrors'); if(!box) return;
  if(!list.length){ box.hidden=true; box.innerHTML=''; return; }
  box.hidden=false; box.innerHTML='<b>برای تسویه:</b><ul>'+list.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>';
  box.scrollIntoView({block:'nearest'});
}
async function stlRefundExcess(){
 const id=stl.orderId, amount=-stlDue();if(!id||amount<=0||stlTotal()<=0||stl.refundBusy)return;
 if(!confirm(`آیا ${money(amount)} اضافه‌پرداخت را واقعاً به مشتری بازگردانده‌اید؟ این دکمه انتقال وجه انجام نمی‌دهد.`))return;
 const reference=prompt('شماره پیگیری یا توضیح استرداد دستی را وارد کنید:');if(reference===null)return;if(!reference.trim())return toast('شماره پیگیری یا توضیح استرداد الزامی است.');
 stl.refundBusy=true;try{const result=await api('/api/orders/'+encodeURIComponent(id)+'/deposit-partial-refund',{method:'POST',body:JSON.stringify({amount,reference,expectedRefundedAmount:Number(stl.order.deposit.refundedAmount||0)})});if(stl.orderId!==id)return;stl.order=result.order;const summary=document.querySelector('#stlMain .deposit-summary');if(summary)summary.outerHTML=depositSummaryHtml(stl.order.deposit);stlRecalc();stlShowErrors([]);toast('استرداد دستی ثبت شد.');}catch(e){toast(e.message);}finally{stl.refundBusy=false;}
}
async function stlSubmit(){
  if(!stl.orderId || stl.busy) return;
  const errs=stlValidate(); stlShowErrors(errs); if(errs.length) return;
  const items=stl.items.map(it=>({ itemId:it.id, unitPrice: (it.voided||it.skip)?0:Number(it.price||0), cancelled: !!(it.voided||it.skip) }));
  const btn=document.getElementById('stlSubmitBtn'); stl.busy=true; if(btn){ btn.disabled=true; btn.textContent='در حال صدور فاکتور...'; }
  try{
    const d=await api('/api/orders/'+stl.orderId+'/settle',{method:'POST',body:JSON.stringify({items,discountAmount:stl.discountAmount,additionsAmount:stl.additionsAmount,settlementMethods:stlCollectPayments()})});
    const no=d.order?.payment?.invoiceNumber||'';
    toast(`تسویه نهایی شد؛ فاکتور ${no} صادر شد.`);
    const doneId=d.order?.id;
    stlClose();
    await renderSales('settlement');
    if(doneId) previewInvoice(doneId);
  }catch(e){
    stl.busy=false; if(btn){ btn.disabled=false; btn.textContent='تایید و صدور فاکتور'; }
    stlShowErrors([e.message]);
  }
}
async function stlCapture(){
  const id=stl.orderId;if(!id||stl.captureBusy)return;
  stl.captureBusy=true; const el=document.getElementById('stlFpState');
  const button=document.querySelector('[data-stl="fp"]');if(button)button.disabled=true;
  if(el){el.textContent='در حال دریافت احراز از حسگر مورد اعتماد سمت سرور…';el.className='stl-state';}
  try{
    const d=await api('/api/fingerprint/capture',{method:'POST',body:JSON.stringify({orderId:id})});
    if(stl.orderId!==id)return;
    stl.fp=d.fingerprintRef;stl.manual=false;stlUpdateFpState();
    toast(d.mock?'توجه: احراز آزمایشی ثبت شد؛ برای محیط واقعی معتبر نیست.':'احراز اثر انگشت با موفقیت ثبت شد.');
  }catch(err){
    if(stl.orderId!==id)return;
    stl.fp='';if(el&&el.isConnected){el.textContent=err.message;el.className='stl-state warn';}toast(err.message);
  }finally{
    stl.captureBusy=false;if(button?.isConnected)button.disabled=false;
    if(stl.orderId===id){const m=document.querySelector('[data-stl-manual]');if(m)m.checked=stl.manual;}
  }
}
// Overrides for the older names (last definition wins). None of these recurse.
function renderSettlementForm(o){ if(!o || stl.orderId!==o.id) return; stlPaintForm(); }
function selectSettlement(id){ return stlOpen(id); }
function finalSettle(id){ if(id && stl.orderId!==id) return stlOpen(id); return stlSubmit(); }
if(!window.__stlBoundV374){
  window.__stlBoundV374=true;
  document.addEventListener('click', e=>{
    const t=e.target.closest && e.target.closest('[data-stl]'); if(!t) return;
    const a=t.dataset.stl;
    if(a==='select'&&t.dataset.action==='select-settlement')return;
    if(a==='select'||a==='retry') return stlOpen(t.dataset.id);
    if(a==='close') return stlClose();
    if(a==='send-dispatch') return sendToDispatch(stl.orderId, ()=>stlOpen(stl.orderId));
    if(a==='sig-clear') return stlClearSig();
    if(a==='fp') return stlCapture();
    if(a==='reopen'){ if(stl.orderId) return reopenSettlementToWarehouse(stl.orderId); return; }
    if(a==='refund-deposit-excess') return stlRefundExcess();
    if(a==='submit') return stlSubmit();
  });
  document.addEventListener('input', e=>{
    const t=e.target;
    if(t.matches?.('[data-stl-adjust]')){stlFormatPriceInput(t);stl[t.dataset.stlAdjust]=stlPrice(t.value);stlRecalc();stlShowErrors([]);return;}
    if(!t.matches || !t.matches('[data-stl-price]')) return;
    const it=stl.items.find(x=>x.id===t.dataset.stlPrice); if(!it) return;
    stlFormatPriceInput(t); it.price=stlPrice(t.value); stlRecalc(); stlShowErrors([]);
  });
  document.addEventListener('focusout', e=>{
    const t=e.target; if(!t.matches || !t.matches('[data-stl-price]')) return;
    const it=stl.items.find(x=>x.id===t.dataset.stlPrice); if(it) t.value=stlFmtPrice(it.price);
  });
  document.addEventListener('change', e=>{
    const t=e.target; if(!t.matches) return;
    if(t.matches('[data-stl-cancel]')){ if(stl.order?.dispatch?.priceApprovedAt){t.checked=false;t.disabled=true;return;} const it=stl.items.find(x=>x.id===t.dataset.stlCancel); if(it){ it.skip=t.checked; stlRecalc(); stlShowErrors([]); } return; }
    if(t.matches('[data-stl-manual]')){ stl.manual=t.checked; if(stl.manual) stl.fp=''; stlUpdateFpState(); stlShowErrors([]); }
  });
}

/* ================================================================
   v37.0.6 — کارتابل باسکول (ورود/خروج وسیله، وزن خالص، کالا)
   - وزن زنده از عامل سریال (PU 850) یا شبیه‌ساز می‌آید؛ بخش زنده فقط اعداد را به‌روز می‌کند و فرم را پاک نمی‌کند
   - تشخیص خودکار: اولین وزن «ورود»، وزن دوم «خروج»؛ سنگین‌تر بار و سبک‌تر خالی است (بدون آستانه)
   ================================================================ */
app.sc = app.sc || { state:null, sig:'', busy:false };
const SC_UNITS = ['کیلوگرم','بسته','عدد','کارتن'];
