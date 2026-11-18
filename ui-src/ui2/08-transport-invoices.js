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
function transportShipmentNoteHtml(order){
 const invoice=order.transportInvoice||{},hand=order.transportHandovers?.['0']||{},doc=hand.document||{};
 const source=Array.isArray(invoice.priceLines)&&invoice.priceLines.length?invoice.priceLines:(doc.items||[]).filter(i=>!i.outOfStock&&Number(i.deliveredKg)>0);
 const lines=source.map(i=>({productName:i.productName||'—',deliveredKg:Number(i.deliveredKg||0)}));
 const totalKg=lines.reduce((sum,line)=>sum+line.deliveredKg,0),driver=hand.driverName||invoice.driverName||'—';
 const customerName=invoice.customerName||order.customer?.name||'—',customerPhone=invoice.customerPhone||order.customer?.phone||'—';
 const rows=lines.map((line,index)=>`<tr><td>${fa(String(index+1))}</td><td><b>${esc(line.productName)}</b></td><td>${qty(line.deliveredKg)} کیلوگرم</td></tr>`).join('');
 const header=`<div class="inv38-head"><div class="inv38-meta inv38-distribution-meta"><div class="inv38-distribution-contacts"><div><span>نام مشتری</span><b>${esc(customerName)}</b></div><div><span>شماره تماس</span><b class="inv38-phone" dir="ltr">${esc(fa(customerPhone))}</b></div></div><div><span>محل ارسال</span><b>${esc(order.dispatchPlace||'—')}</b></div><div><span>شماره سفارش</span><b>${esc(fa(order.orderNo||'—'))}</b></div><div><span>شماره فاکتور</span><b>${esc(fa(invoice.invoiceNumber||'—'))}</b></div><div><span>تاریخ</span><b>${esc(dt(invoice.createdAt||order.createdAt))}</b></div></div></div>`;
 const handover=`<div class="inv38-cust tr-shipment-handover"><div><span>راننده</span><b>${esc(driver)}</b></div><div><span>خودرو و پلاک</span><b>${esc(hand.vehicleType||'—')} ${esc(fa(hand.vehiclePlate||''))}</b></div><div><span>سند انبار</span><b>${esc(fa(doc.warehouseDocumentNo||'—'))}</b></div></div>`;
 return `<div class="inv38-sheet inv38-compact inv38-distribution tr-shipment-note">${header}<div class="inv38-rule"></div>${handover}<div class="inv38-table-scroll"><table class="inv38-table"><thead><tr><th>#</th><th>محصول</th><th>وزن ارسالی</th></tr></thead><tbody>${rows||'<tr><td colspan="3">قلمی برای ارسال ثبت نشده است.</td></tr>'}</tbody><tfoot><tr><th colspan="2">جمع وزن ارسالی</th><th>${qty(totalKg)} کیلوگرم</th></tr></tfoot></table></div><div class="tr-shipment-note-footer"><p>برگه ارسال پخش همراه محموله است و به‌تنهایی ثبت پرداخت یا تأیید دریافت محسوب نمی‌شود.</p><div><span>نام و امضای تحویل‌گیرنده</span><span>تاریخ و ساعت تحویل</span></div></div></div>`;
}
async function transportShipmentNotePrint(id){
 try{
  const data=await api('/api/orders/'+encodeURIComponent(id)),order=data.order;
  if(!order?.transportInvoice||!order.transportHandovers?.['0']?.document)throw Error('برگه ارسال پس از صدور فاکتور و ثبت سند انبار در دسترس است.');
  return BTPrintFrame.html(BTPrintDigits.documentHtml(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><link rel="stylesheet" href="/design.css"><link rel="stylesheet" href="/invoice-compact.css?v=37.3.21"><title>برگه ارسال ${esc(fa(order.orderNo||'—'))}</title><style>body{margin:0;padding:12mm;font-family:"Vazirmatn",Tahoma,sans-serif}.tr-shipment-note-footer{margin-top:22px}.tr-shipment-note-footer>p{margin:0}.tr-shipment-note-footer>div{display:flex;justify-content:space-between;gap:24px;margin-top:32px}.tr-shipment-note-footer>div span{flex:1;border-top:1px solid #555;padding-top:8px;text-align:center}@page{size:A4;margin:0}</style></head><body>${transportShipmentNoteHtml(order)}<script src="/print-ready.js"><\/script></body></html>`));
 }catch(e){toast(e.message);return false;}
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
 const listedPrice=productId==null?0:Number(stl.priceMap?.[String(productId)]||0);
 const savedPrice=Number(line.unitPrice??item?.unitPrice??0);
 const amount=listedPrice>0?listedPrice:savedPrice;
 return Number.isSafeInteger(amount)&&amount>0?fa(amount.toLocaleString('en-US').replace(/,/g,'٬')):'';
}
function transportSalesInvoicePanel(order,host=$('#stlMain'),reload=()=>stlOpen(order.id),onClosed=null){
 const hand=order.transportHandovers?.['0'],invoice=order.transportInvoice;
 if(!hand){host.innerHTML='<section class="sd-panel sd-pad"><h2>فاکتور پخش</h2><p>در انتظار ثبت تحویل فیزیکی کالا به راننده در انبار.</p></section>';return;}
 if(invoice){
  const canRecordPayment=!!onClosed&&!!order.transportDeparture;
  const stage=canRecordPayment?transportClosureFormHtml(order):order.transportDeparture?'<p>خروج ثبت شده است؛ ثبت پرداختی در کارتابل پخش انجام می‌شود.</p>':'<p>فاکتور صادر شد؛ برگهٔ ارسال را چاپ کنید. ثبت خروج در کارتابل نگهبانی انجام می‌شود.</p>';
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
  const items=o.transportWorkflow===1&&Array.isArray(o.transportInvoice?.priceLines)?o.transportInvoice.priceLines.map(l=>({product:{name:l.productName},deliveredKg:l.deliveredKg,unitPrice:l.unitPrice,finalAmount:l.amount})):(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').map(i=>{const snap=pickupDoc?.items?.find(x=>x.itemId===i.id);return snap?{...i,product:{...i.product,name:snap.productName}}:i;});
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
