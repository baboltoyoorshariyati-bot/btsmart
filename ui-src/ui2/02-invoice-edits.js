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
 return `<div class="document-edit-method-row" data-doc-method-row data-protected-receipt="${protectedReceipt?'1':'0'}"><label class="document-edit-method-type"><span>روش تسویه</span><select data-doc-method-type ${typeLock}>${DOCUMENT_EDIT_METHODS.map(([value,label])=>`<option value="${value}" ${type===value?'selected':''}>${label}${value==='CREDIT'?' — بدون دریافت وجه':''}</option>`).join('')}</select></label><label class="document-edit-method-amount"><span>مبلغ (ریال)</span><input data-doc-method-amount inputmode="numeric" value="${method.amount==null?'':esc(String(method.amount))}" ${protectedReceipt?'disabled':''}></label><div class="document-edit-method-extra" data-doc-method-extra>${documentEditMethodDetails({...method,type},devices,protectedReceipt)}</div><button type="button" class="btn btn-ghost btn-sm document-edit-remove" data-doc-remove-method ${protectedReceipt?'disabled title="دریافت واقعی حفظ می‌شود"':''}>حذف</button></div>`;
}
function documentEditInvoiceHtml(data,devices){
 const {order,payment,lines}=data,review=data.edit?.status==='PENDING_SALES_REVIEW'||payment.settlementReviewRequired;
 const methods=Array.isArray(payment.settlementMethods)?payment.settlementMethods:[];
 const methodSum=methods.reduce((sum,row)=>sum+Number(row.amount||0),0);
 const itemRows=lines.map((line,index)=>`<article class="document-edit-invoice-line" data-doc-invoice-line data-item-id="${esc(line.itemId)}" data-kg="${esc(line.deliveredKg)}" data-return-kg="${esc(line.returnKg||0)}"><span class="document-edit-line-number">${fa(index+1)}</span><div class="document-edit-line-name"><b>${esc(line.productName||'—')}</b><small>${qty(line.deliveredKg)} کیلوگرم${Number(line.returnKg)>0?` • مرجوعی ${qty(line.returnKg)} کیلوگرم`:''}</small></div><label><span>قیمت هر کیلو (ریال)</span><input data-doc-unit-price inputmode="numeric" value="${esc(String(line.unitPrice||0))}" required></label><strong data-doc-line-total>${money(line.amount||0)}</strong></article>`).join('');
 const methodsHtml=methods.map(row=>documentEditMethodRow(row,devices,review)).join('')||documentEditMethodRow({type:review?'CREDIT':'CASH',amount:''},devices,review);
 const expiry=data.expiresAt?`مهلت ویرایش تا ${esc(formatDateTime24(data.expiresAt))}`:'مهلت ثبت‌شده نیست؛ ویرایش فقط با تأیید مدیر';
 const noEdit=!data.canEdit;
 return `<form id="salesInvoiceEditForm" class="document-edit-form" data-order-id="${esc(order.id)}" data-payment-id="${esc(payment.id)}" data-review="${review?'1':'0'}" data-can-edit="${data.canEdit?'1':'0'}">
  <section class="document-edit-notice ${review?'is-review':''}"><div><b>${review?'بازبینی پس از اصلاح انبار':'ویرایش قیمت و روش تسویه'}</b><span>${esc(order.customerName||'—')} • سفارش ${esc(fa(order.orderNo||'—'))} • فاکتور ${esc(fa(payment.invoiceNumber||'—'))}</span></div><small>${expiry}</small><p>${review?'دریافت‌ها و چک‌های قبلی قفل و حفظ شده‌اند. در صورت افزایش مبلغ، تفاوت را به‌عنوان معوق ثبت کنید؛ اگر مبلغ جدید از دریافت واقعی کمتر باشد، ابتدا بازپرداخت را جداگانه تعیین تکلیف کنید.':'ویرایش مالی نیاز به تأیید انبار ندارد. ثبت تغییرات به‌تنهایی پولی دریافت یا جابه‌جا نمی‌کند.'}</p>${payment.settlementReviewReason?`<p class="document-edit-reason">${esc(payment.settlementReviewReason)}</p>`:''}</section>
  ${data.waitingForWarehouse?'<p class="document-edit-error" role="alert">این فاکتور اکنون در صف اصلاح انبار است و تا بازگشت سند قابل ویرایش نیست.</p>':''}
  <section class="document-edit-section"><header><div><b>اقلام و قیمت قبلی</b><small>وزن نهایی انبار و شناسهٔ قلم تغییر نمی‌کند.</small></div></header><div class="document-edit-invoice-lines">${itemRows||'<div class="empty">قلم قیمت‌گذاری‌شده‌ای در این فاکتور نیست.</div>'}</div></section>
  <section class="document-edit-finance"><label><span>تخفیف (ریال)</span><input data-doc-discount inputmode="numeric" value="${esc(String(payment.discountAmount||0))}"></label><label><span>اضافات (ریال)</span><input data-doc-additions inputmode="numeric" value="${esc(String(payment.additionsAmount||0))}"></label></section>
  <section class="document-edit-totals"><div><span>جمع اقلام</span><b data-doc-subtotal>${money(payment.subtotalAmount||0)}</b></div><div><span>کسر مرجوعی</span><b data-doc-returns>${money(payment.returnDeduction||0)}</b></div><div><span>مبلغ نهایی</span><b data-doc-total>${money(payment.totalAmount||0)}</b></div><div><span>بیعانهٔ لحاظ‌شده</span><b data-doc-deposit>${money(payment.depositAmount||0)}</b></div><div class="document-edit-due"><span>مبلغ قابل تطبیق با روش‌های تسویه</span><b data-doc-due>${money(payment.amountDue||0)}</b></div><div><span>جمع روش‌های فعلی</span><b data-doc-method-sum>${money(methodSum)}</b></div><p data-doc-method-message role="status"></p></section>
  <section class="document-edit-section document-edit-settlement"><header><div><b>${review?'روش‌های باقی‌ماندهٔ فاکتور':'روش‌های تسویه'}</b><small>${review?'دریافت‌های واقعی قبلی قابل حذف یا کاهش نیستند؛ ماندهٔ جدید را به معوق تخصیص دهید.':'روش‌ها را متناسب با مبلغ نهایی فاکتور اصلاح کنید.'}</small></div></header><div id="documentEditMethods">${methodsHtml}</div><div class="document-edit-method-actions">${review?'<button type="button" class="btn btn-secondary btn-sm" data-doc-fill-credit>تطبیق مانده با معوق</button><button type="button" class="btn btn-ghost btn-sm" data-doc-add-credit>افزودن ردیف معوق</button>':'<button type="button" class="btn btn-secondary btn-sm" data-doc-add-method>افزودن روش تسویه</button>'}</div></section>
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
   const row=button.closest('[data-doc-method-row]');if(row&&!row.dataset.protectedReceipt){row.remove();documentEditRecalc(form);}
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
 return `<article class="document-edit-warehouse-line" data-wh-edit-line data-item-id="${esc(line.itemId)}" data-out-of-stock="${out?'1':'0'}"><span class="document-edit-line-number">${fa(index+1)}</span><div class="document-edit-line-name"><b>${esc(line.productName||'—')}</b><small>${out?'ناموجود — وضعیت موجودی قفل است':`${qty(line.deliveredKg)} کیلوگرم`} · درخواست ${esc(line.description||'')}</small>${weights}</div><label><span>محصول</span><select data-wh-edit-product required>${productOptions}</select></label><label><span>وزن نهایی (کیلوگرم)</span><input data-wh-edit-weight type="number" inputmode="decimal" min="0.001" step="0.001" max="100000" value="${out?'':Number.isFinite(weight)?String(weight):''}" ${out?'disabled':''} ${out?'':'required'}></label></article>`;
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
   <section class="document-edit-section"><header><div><b>اقلام سند</b><small>وزن با حداکثر سه رقم اعشار ثبت می‌شود؛ وزن صفر برای قلم موجود مجاز نیست.</small></div></header><div class="document-edit-warehouse-lines">${items.map((line,index)=>warehouseEditLineHtml(line,index,products)).join('')||'<div class="empty">قلمی برای اصلاح وجود ندارد.</div>'}</div></section>
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
