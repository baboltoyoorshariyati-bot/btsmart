function whDashUnitsPlain(units){const parts=Object.entries(units||{}).filter(([,v])=>Number(v)>0).map(([u,v])=>`${qty(v)} ${u}`);return parts.length?parts.join(' • '):'—'}
function whDashUnitsText(units){return esc(whDashUnitsPlain(units))}
function whDashProductKey(p,i){return String(p.productId||`${p.productName||'product'}-${i}`)}
function whDashProductLabelHtml(p){return `${p.quickCode?`<span class="code-pill">${esc(p.quickCode)}</span>`:''}${esc(p.productName||'—')}`}
function whDashProductRowHtml(p,i,kind){
  const key=`${kind}:${whDashProductKey(p,i)}`;
  const values=kind==='orders'?[p.productName,p.quickCode,whDashUnitsPlain(p.units),Number(p.orders||0),Number(p.lines||0)]:[p.productName,p.quickCode,Number(p.deliveredKg||0),Number(p.orders||0),Number(p.outOfStock||0)];
  const signature=esc(JSON.stringify(values));
  const product=kind==='orders'?`<button type="button" class="wh-dash-product-link" data-wh-dash-product data-cartable="incoming" data-role-page="warehouse">${whDashProductLabelHtml(p)}</button>`:`<span class="wh-dash-product-name" data-wh-dash-product>${whDashProductLabelHtml(p)}</span>`;
  const cells=kind==='orders'
    ?`<td class="wh-dash-rank-cell">${fa(i+1)}</td><td>${product}</td><td>${whDashUnitsText(p.units)}</td><td>${qty(p.orders||0)}</td><td>${qty(p.lines||0)}</td>`
    :`<td class="wh-dash-rank-cell">${fa(i+1)}</td><td>${product}</td><td>${qty(p.deliveredKg||0)} کیلوگرم</td><td>${qty(p.orders||0)}</td><td>${p.outOfStock?qty(p.outOfStock):'—'}</td>`;
  return `<tr data-wh-dash-key="${esc(key)}" data-wh-dash-signature="${signature}">${cells}</tr>`;
}
function whDashProductRowsHtml(products,kind){
  if(!products.length)return `<tr class="wh-dash-empty-row"><td colspan="5">${kind==='orders'?'امروز هنوز سفارشی وارد انبار نشده است.':'امروز هنوز محصولی به‌عنوان تحویل‌شده ثبت نشده است.'}</td></tr>`;
  return products.map((p,i)=>whDashProductRowHtml(p,i,kind)).join('');
}
function whDashProductTableHtml(products,kind,live=false){
  const orders=kind==='orders',bodyData=live?(orders?' data-wh-dash-orders':' data-wh-dash-delivered'):'';
  return `<div class="wh-dash-table-wrap"><table class="wh-dash-table"><thead><tr><th>#</th><th>محصول</th><th>${orders?'مقدار سفارش':'وزن تحویلی'}</th><th>تعداد سفارش</th><th>${orders?'ردیف کالا':'ناموجود'}</th></tr></thead><tbody${bodyData}>${whDashProductRowsHtml(products,kind)}</tbody></table></div>`;
}
function whDashLiveBodyHtml(s){
  if(!s)return `<div class="wh-dash-empty" data-wh-dash-load-error>دریافت آمار زنده در این لحظه ممکن نشد؛ چند ثانیه دیگر خودکار دوباره تلاش می‌شود.</div>`;
  const t=s.totals||{},prods=Array.isArray(s.byProduct)?s.byProduct:[],top=prods.slice(0,10);
  const delivered=Array.isArray(s.deliveredByProduct)?s.deliveredByProduct:[],dt=s.deliveredTotals||{};
  const updated=serverNow().toLocaleTimeString('fa-IR');
  return `<div class="wh-dash-content" data-wh-dash-layout>
    <div class="wh-dash-totals">
      <div class="wh-dash-total"><span>سفارش‌های ورودی امروز</span><b data-wh-dash-value="orders">${qty(t.orders||0)}</b></div>
      <div class="wh-dash-total"><span>ردیف کالا</span><b data-wh-dash-value="items">${qty(t.items||0)}</b></div>
      <div class="wh-dash-total"><span>محصول متمایز</span><b data-wh-dash-value="products">${qty(t.products||0)}</b></div>
      <div class="wh-dash-total is-wide"><span>مجموع مقدار سفارش</span><b data-wh-dash-units>${whDashUnitsText(t.units)}</b></div>
    </div>
    <div class="wh-dash-status">
      <span class="wh-dash-chip is-pending">در صف انبار: <b data-wh-dash-value="pending">${qty(t.pending||0)}</b></span>
      <span class="wh-dash-chip is-preparing">در حال آماده‌سازی: <b data-wh-dash-value="preparing">${qty(t.preparing||0)}</b></span>
      <span class="wh-dash-chip is-done">انجام‌شده: <b data-wh-dash-value="done">${qty(t.done||0)}</b></span>
      <span class="wh-dash-updated">آخرین به‌روزرسانی: <b data-wh-dash-updated>${esc(updated)}</b></span>
      <span class="wh-dash-refresh-error" data-wh-dash-refresh-error hidden>به‌روزرسانی تازه دریافت نشد؛ آمار قبلی حفظ شده است.</span>
    </div>
    <div class="wh-dash-tables">
      <section class="wh-dash-table-card" aria-label="سفارش‌های امروز به تفکیک محصول">
        <header class="wh-dash-table-heading"><div><h4>سفارش‌های امروز به تفکیک محصول</h4><p>۱۰ محصول پرفروش در این نما؛ کلیک روی نام محصول، صف سفارش‌های ورودی را باز می‌کند.</p></div><span data-wh-dash-order-count>${qty(prods.length)} محصول</span></header>
        ${whDashProductTableHtml(top,'orders',true)}
        <button type="button" class="wh-dash-all-products" data-wh-dash-all-orders ${prods.length>10?'':'hidden'}>مشاهدهٔ همهٔ ${qty(prods.length)} محصول</button>
      </section>
      <section class="wh-dash-table-card wh-dash-delivered-card" aria-label="محصولات تحویل‌شدهٔ امروز">
        <header class="wh-dash-table-heading"><div><h4>محصولات تحویل‌شدهٔ امروز</h4><p>مقدار نهایی ثبت‌شده در انبار، به تفکیک محصول</p></div><span data-wh-dash-delivered-count>${qty(dt.products||delivered.length)} محصول</span></header>
        ${whDashProductTableHtml(delivered,'delivered',true)}
        <div class="wh-dash-delivered-total">جمع وزن تحویلی: <b data-wh-dash-delivered-total>${qty(dt.deliveredKg||0)} کیلوگرم</b> <span>در <b data-wh-dash-delivered-orders>${qty(dt.orders||0)}</b> سفارش</span></div>
      </section>
    </div>
  </div>`;
}
function whDashUpdateRows(tbody,products,kind){
  if(!tbody)return;
  const current=new Map([...tbody.querySelectorAll('tr[data-wh-dash-key]')].map(row=>[row.dataset.whDashKey,row]));
  const wanted=(products||[]).map((p,i)=>{
    const key=`${kind}:${whDashProductKey(p,i)}`;
    let row=current.get(key);
    if(!row){const template=document.createElement('template');template.innerHTML=whDashProductRowHtml(p,i,kind);row=template.content.firstElementChild;}
    const values=kind==='orders'?[p.productName,p.quickCode,whDashUnitsPlain(p.units),Number(p.orders||0),Number(p.lines||0)]:[p.productName,p.quickCode,Number(p.deliveredKg||0),Number(p.orders||0),Number(p.outOfStock||0)];
    const signature=JSON.stringify(values);
    if(row.dataset.whDashSignature!==signature){
      row.querySelector('[data-wh-dash-product]').innerHTML=whDashProductLabelHtml(p);
      if(kind==='orders'){
        row.children[2].textContent=whDashUnitsPlain(p.units);row.children[3].textContent=qty(p.orders||0);row.children[4].textContent=qty(p.lines||0);
      }else{
        row.children[2].textContent=qty(p.deliveredKg||0)+' کیلوگرم';row.children[3].textContent=qty(p.orders||0);row.children[4].textContent=p.outOfStock?qty(p.outOfStock):'—';
      }
      row.dataset.whDashSignature=signature;
    }
    row.dataset.whDashKey=key;row.children[0].textContent=fa(i+1);current.delete(key);return row;
  });
  let empty=null;
  if(!wanted.length){const template=document.createElement('template');template.innerHTML=whDashProductRowsHtml([],kind);empty=template.content.firstElementChild;}
  const ordered=empty?[empty]:wanted;
  let cursor=tbody.firstElementChild;
  for(const row of ordered){if(row!==cursor)tbody.insertBefore(row,cursor);cursor=row.nextElementSibling;}
  while(cursor){const next=cursor.nextElementSibling;cursor.remove();cursor=next;}
}
function whDashApplyData(host,s){
  if(!host)return;
  if(!s){const warning=host.querySelector('[data-wh-dash-refresh-error]');if(warning)warning.hidden=false;else if(!host.querySelector('[data-wh-dash-load-error]'))host.innerHTML=whDashLiveBodyHtml(null);return;}
  app.whDashData=s;
  if(!host.querySelector('[data-wh-dash-layout]')){host.innerHTML=whDashLiveBodyHtml(s);return;}
  const t=s.totals||{},prods=Array.isArray(s.byProduct)?s.byProduct:[],delivered=Array.isArray(s.deliveredByProduct)?s.deliveredByProduct:[],dt=s.deliveredTotals||{};
  for(const key of ['orders','items','products','pending','preparing','done']){const el=host.querySelector(`[data-wh-dash-value="${key}"]`);if(el)el.textContent=qty(t[key]||0);}
  const units=host.querySelector('[data-wh-dash-units]');if(units)units.innerHTML=whDashUnitsText(t.units);
  const updated=host.querySelector('[data-wh-dash-updated]');if(updated)updated.textContent=serverNow().toLocaleTimeString('fa-IR');
  const orderCount=host.querySelector('[data-wh-dash-order-count]');if(orderCount)orderCount.textContent=qty(prods.length)+' محصول';
  const deliveredCount=host.querySelector('[data-wh-dash-delivered-count]');if(deliveredCount)deliveredCount.textContent=qty(dt.products||delivered.length)+' محصول';
  const deliveredTotal=host.querySelector('[data-wh-dash-delivered-total]');if(deliveredTotal)deliveredTotal.textContent=qty(dt.deliveredKg||0)+' کیلوگرم';
  const all=host.querySelector('[data-wh-dash-all-orders]');if(all){all.hidden=prods.length<=10;all.textContent='مشاهدهٔ همهٔ '+qty(prods.length)+' محصول';}
  whDashUpdateRows(host.querySelector('[data-wh-dash-orders]'),prods.slice(0,10),'orders');
  whDashUpdateRows(host.querySelector('[data-wh-dash-delivered]'),delivered,'delivered');
  const deliveredOrders=host.querySelector('[data-wh-dash-delivered-orders]');if(deliveredOrders)deliveredOrders.textContent=qty(dt.orders||0);
  const warning=host.querySelector('[data-wh-dash-refresh-error]');if(warning)warning.hidden=true;
}
function whDashLiveHtml(s){
  if(s)app.whDashData=s;
  return `<section class="wh-dash-live tone-red" aria-label="آمار زندهٔ سفارش‌های انبار"><div class="wh-dash-head"><span class="wh-dash-ico">${icon('package',22)}</span><div class="wh-dash-title"><h3>سفارش‌های انبار امروز</h3><p>سفارش‌های ورودی به تفکیک محصول و محصولاتی که امروز در انبار تحویل‌شده ثبت شده‌اند؛ جدول‌ها بدون خالی‌شدن ناگهانی به‌روز می‌شوند.</p></div><span class="role-dash-live"><i></i> زنده</span><button type="button" class="btn btn-primary btn-sm" data-cartable="incoming" data-role-page="warehouse">مشاهدهٔ سفارش‌های ورودی ←</button></div><div id="whDashLiveBody">${whDashLiveBodyHtml(s)}</div></section>`;
}
function openWhDashAllOrders(){
  const products=app.whDashData?.byProduct||[];
  if(products.length<=10)return;
  openModal('همهٔ محصولات سفارش‌های ورودی امروز',`<div class="wh-dash-all-modal"><p>همهٔ ${qty(products.length)} محصولِ مرتب‌شده بر اساس مقدار سفارش.</p>${whDashProductTableHtml(products,'orders')}</div>`);
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-wh-dash-all-orders]');if(b){e.preventDefault();openWhDashAllOrders();}});
async function refreshWhDashToday(){
  const host=$('#whDashLiveBody');if(!host||app.whDashRefreshBusy)return;
  app.whDashRefreshBusy=true;
  try{const s=await api('/api/warehouse/today-stats');if(host.isConnected)whDashApplyData(host,s);}catch{if(host.isConnected)whDashApplyData(host,null);}finally{app.whDashRefreshBusy=false;}
}

function salesHistoryRow(o){
 return `<tr data-order="${esc(o.id)}"><td data-label="مشتری">${esc(o.customerName||'—')}</td><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="تاریخ ثبت">${esc(formatDateTime24(o.createdAt))}</td><td data-label="وضعیت">${badge(o.status)}</td><td data-label="شماره تماس">${esc(o.phone||'—')}</td><td data-label="فاکتورها">${qty(o.invoiceCount||0)} فاکتور</td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-secondary btn-sm" data-sales-history-id="${esc(o.id)}">جزئیات و رویدادها</button></td></tr>`;
}
function salesHistoryTable(rows){
 if(!rows.length)return '';
 return `<div class="bt-table-wrap"><table class="bt-table sales-history-table"><caption class="bt-caption">سوابق سفارش و فاکتور</caption><thead><tr><th scope="col">مشتری</th><th scope="col">شماره سفارش</th><th scope="col">تاریخ ثبت</th><th scope="col">وضعیت</th><th scope="col">شماره تماس</th><th scope="col">فاکتورها</th><th scope="col">عملیات</th></tr></thead><tbody>${rows.map(salesHistoryRow).join('')}</tbody></table></div>`;
}

async function refreshSalesOverview(){
 const host=$('[data-dash-role="sales"]');if(!host)return;
 const results=await Promise.allSettled([api('/api/sales/daily-products'),api('/api/workload')]);if(!host.isConnected)return;
 if(results[1].status==='fulfilled'){
  const work=results[1].value,keys=['salesIntake','salesRemote','salesFlow','store','salesSettlement','salesFuture'],counts=keys.map(k=>Number(work.counts?.[k]||0)),max=Math.max(1,...counts);
  host.querySelectorAll('[data-cartable].role-dash-card').forEach((card,i)=>{const number=card.querySelector(':scope > strong'),bar=card.querySelector('.role-dash-bar i');if(number)number.textContent=qty(counts[i]);if(bar)bar.style.width=Math.max(6,Math.round(counts[i]*100/max))+'%';});
 }
 for(const card of host.querySelectorAll('[data-sales-daily]')){
  const number=card.querySelector('strong');if(results[0].status!=='fulfilled'){number.textContent='خطا در دریافت';continue;}
  const d=results[0].value;number.textContent=card.dataset.salesDaily==='sales'?money(d.sales.total):qty(d.orders.kg)+' کیلوگرم';
 }
}
async function openSalesDaily(kind){
 try{
  const d=await api('/api/sales/daily-products');
  if(kind==='sales'){
   const s=d.sales;
   openModal('فروش روز به تفکیک محصولات',`<div class="sales-daily-detail"><p>مجموع نهایی فاکتورهای تسویه یا بسته‌شده در روز محلی سرور، نه وصول نقدی. سفارش لغوشده و فاکتور پخشِ صرفاً آماده حذف شده‌اند.</p><div class="sales-daily-total"><span>جمع فاکتورها</span><b>${money(s.total)}</b></div><p>مبالغ محصولات از ریز فاکتور و پیش از تعدیلات کلی فاکتور هستند.</p>${s.rows.map(r=>`<div class="sales-daily-row"><span>${esc(r.productName)}</span><b>${money(r.amount)}</b></div>`).join('')||'<p>ریز محصولی موجود نیست.</p>'}<div class="sales-daily-row"><span>تخفیف، اضافات، مرجوعی و سایر اختلاف‌ها</span><b>${money(s.adjustments)}</b></div><div class="sales-daily-row"><span>فاکتورهای فاقد ریز قابل انتساب</span><b>${money(s.unallocated)}</b></div></div>`);
  }else{
   const o=d.orders,units=u=>Object.entries(u).map(([unit,n])=>`${qty(n)} ${esc(unit)}`).join('، ');
   openModal('سفارش روز به تفکیک محصولات',`<div class="sales-daily-detail"><p>اقلام فعال سفارش‌های ثبت‌شده امروز بر اساس تاریخ محلی سرور؛ به‌جز سفارش لغوشده. مقادیر مطابق وضعیت فعلی سفارش‌اند و سابقه تغییرات نیستند.</p><div class="sales-daily-total"><span>جمع وزن سفارش‌های کیلویی</span><b>${qty(o.kg)} کیلوگرم</b></div><p>واحدهای بسته، عدد و کارتن به وزن تبدیل نمی‌شوند و جداگانه نمایش داده شده‌اند.</p>${o.rows.map(r=>`<div class="sales-daily-row"><span>${esc(r.productName)}</span><b>${units(r.units)}</b></div>`).join('')||'<p>سفارشی برای امروز وجود ندارد.</p>'}</div>`);
  }
 }catch(e){toast('خطا در دریافت آمار روز: '+e.message)}
}
document.addEventListener('click',e=>{const card=e.target.closest('[data-sales-daily]');if(card){e.preventDefault();void openSalesDaily(card.dataset.salesDaily);}});
const SALES_EVENT_LABELS={CREATE_VISIT:'ثبت مراجعه اولیه',CREATE_ORDER:'ثبت سفارش حضوری',CREATE_REMOTE_ORDER:'ثبت سفارش غیرحضوری',CREATE_STORE_ORDER:'ثبت سفارش فروشگاه',UPDATE_STORE_ORDER:'ویرایش سفارش فروشگاه',SALES_EDIT_STORE_ORDER:'اصلاح سفارش فروشگاه',APPROVE_STORE_ORDER:'تأیید سفارش فروشگاه',QUICK_SEND_STORE_ORDER:'ارسال سریع سفارش فروشگاه',UPDATE_REMOTE_ORDER:'ویرایش برنامه سفارش',CANCEL_REMOTE_ORDER:'لغو سفارش',CANCEL_STORE_ORDER:'لغو سفارش فروشگاه',ACTIVATE_REMOTE_ORDER:'ارسال زمان‌بندی‌شده به انبار',WAREHOUSE_ACCEPT_ORDER:'دریافت در انبار',WAREHOUSE_START_PREPARING:'شروع آماده‌سازی',WAREHOUSE_DRAFT_SAVED:'ذخیره پیش‌نویس وزن',WAREHOUSE_FINALIZE:'ثبت وزن نهایی انبار',WAREHOUSE_DOCUMENT_EDITED:'اصلاح سند انبار',WAREHOUSE_DOCUMENT_EDIT_REQUESTED:'درخواست اصلاح سند انبار',RETURN_TO_SALES:'ارجاع به فروش',REOPEN_WAREHOUSE_PREPARING:'بازگشایی آماده‌سازی',ADD_ORDER_ITEM:'افزودن قلم',UPDATE_ORDER_ITEM:'ویرایش قلم',DELETE_ORDER_ITEM:'حذف قلم',SAVE_RETURNED_ORDER_EDIT:'ثبت اصلاح سفارش',RESUBMIT_TO_WAREHOUSE:'ارسال مجدد به انبار',FINAL_SETTLEMENT:'تسویه و صدور فاکتور',FINAL_EXIT:'ثبت خروج',DEPOSIT_REFUNDED_MANUALLY:'ثبت استرداد بیعانه',DEPOSIT_PARTIAL_REFUND_MANUALLY:'ثبت استرداد بخشی از بیعانه',SEND_TO_DISPATCH:'ارسال به پخش',TRANSPORT_PLAN_ASSIGNED:'تخصیص خودرو و راننده',TRANSPORT_WAREHOUSE_HANDOVER:'تحویل به راننده از انبار',TRANSPORT_INVOICE_PREPARED:'آماده‌سازی سند پخش',TRANSPORT_DEPARTURE:'ثبت خروج محموله',TRANSPORT_INVOICE_CLOSED:'بستن سند پخش',DISPATCH_ASSIGN:'تخصیص راننده',DISPATCH_DRIVER_EXIT:'ثبت خروج راننده',DISPATCH_GATE_EXIT:'تأیید خروج راننده',DISPATCH_DELIVERED:'ثبت تحویل راننده',DISPATCH_SALES_FINALIZE:'تأیید تحویل و صدور فاکتور',DISPATCH_PRICE_APPROVE:'تأیید قیمت پخش',DISPATCH_PRICE_ADJUST:'اصلاح قیمت پخش',RETURN_REFERRED_TO_WAREHOUSE:'ارجاع مرجوعی به انبار',RETURN_RECEIVED:'دریافت مرجوعی',STORE_RUN_R1_WEIGHT:'ثبت وزن سرویس اول',STORE_RUN_R2_WEIGHT:'ثبت وزن سرویس دوم',STORE_RUN_R1_SEND:'ارسال سرویس اول',STORE_RUN_R2_SEND:'ارسال سرویس دوم',STORE_RUN_R1_SEND_APPEND:'ارسال تکمیلی سرویس اول',STORE_RUN_R2_SEND_APPEND:'ارسال تکمیلی سرویس دوم',STORE_RUN_R1_DISPATCHED:'تخصیص سرویس اول',STORE_RUN_R2_DISPATCHED:'تخصیص سرویس دوم',STORE_RUN_MOVE_R2:'انتقال به سرویس دوم',STORE_RUN_DAY_FINALIZED:'پایان عملیات روز فروشگاه',STORE_RUN_OUT_OF_STOCK:'ثبت عدم موجودی',STORE_RUN_ITEM_COMPLETED:'تکمیل قلم فروشگاه',STORE_RUN_RECEIPT_CONFIRMED:'تأیید دریافت فروشگاه',PICKUP_ENTRY:'ثبت ورود تحویل‌گیرنده',PICKUP_PHYSICAL_HANDOVER:'تحویل فیزیکی سفارش',PICKUP_GOODS_EXIT:'ثبت خروج کالا'};
function salesHistoryValue(value){if(value==null||value==='')return '—';if(typeof value==='object')return JSON.stringify(value);return String(value);}
function salesHistoryEventHtml(event){
 const actor=event.actor?.name||event.username||'سامانه',details=event.details||{},hasDetails=Object.keys(details).length>0;
 return `<li><b>${esc(SALES_EVENT_LABELS[event.action]||event.action||'اقدام ثبت‌شده')}</b><small>${esc(formatDateTime24(event.createdAt))} · ثبت‌کننده: ${esc(actor)}${event.seq?` · ردیف ${fa(event.seq)}`:''}</small>${event.entityType?`<small>موجودیت: ${esc(event.entityType)}${event.entityId?` · ${esc(String(event.entityId))}`:''}</small>`:''}${hasDetails?`<details class="sales-history-event-details"><summary>مشاهدهٔ جزئیات کامل این اقدام</summary><pre dir="ltr">${esc(JSON.stringify(details,null,2))}</pre></details>`:''}</li>`;
}
function salesHistoryOrderItems(items){
 return `<div class="table-wrap"><table class="table sales-history-items"><thead><tr><th>کالا</th><th>مقدار درخواستی</th><th>وضعیت انبار</th><th>وزن نهایی</th></tr></thead><tbody>${(items||[]).map(item=>{
  const runs=[...(item.runR1||[]).map(row=>({...row,service:'سرویس اول'})),...(item.runR2||[]).map(row=>({...row,service:'سرویس دوم'}))];
  const weightLog=runs.length?`<details class="sales-history-event-details"><summary>سوابق وزن‌کشی و کاربران</summary>${runs.map(row=>`<p>${row.service}: ${qty(row.kg)} کیلوگرم · ${esc(formatDateTime24(row.at))} · ${esc(row.byName||row.by||'ثبت‌کننده نامشخص')}</p>${row.weighings?`<pre dir="ltr">${esc(JSON.stringify(row.weighings,null,2))}</pre>`:''}`).join('')}</details>`:'';
  const whNote=String(item.warehouseNote||'').trim();
  return `<tr><td><b>${esc(item.productName||'—')}</b>${item.description?`<small>${esc(item.description)}</small>`:''}${whNote?`<small class="stl-warehouse-note" title="توضیح انبار${item.warehouseNoteByName?` — ${esc(item.warehouseNoteByName)}`:''}">${icon('clipboard',12)} <b>توضیح انبار:</b> ${esc(whNote)}</small>`:''}</td><td>${qty(item.requestedQty)} ${esc(item.requestedUnit||'')}</td><td>${esc(item.warehouseStatus||item.itemStatus||'—')}</td><td>${item.deliveredKg==null?'—':`${qty(item.deliveredKg)} کیلوگرم`}${weightLog}</td></tr>`;
 }).join('')||'<tr><td colspan="4">ریز اقلام در دسترس نیست.</td></tr>'}</tbody></table></div>`;
}
async function openSalesHistory(id){
 try{
  const isManager=normalizeRole(app.user?.roleCode)==='admin';
  const path=isManager?'/api/admin/orders/'+encodeURIComponent(id)+'/history':'/api/sales/history/'+encodeURIComponent(id);
  const d=await api(path),o=d.order||{},customer=o.customer||{};
  const typeLabels={ONSITE:'حضوری',REMOTE:'غیرحضوری',STORE:'فروشگاهی'};
  const profileFields=[['کد مشتری',customer.code],['مشتری',customer.name||o.customerName],['تلفن',customer.phone||o.phone],['تلفن دوم',customer.phone2],['کد ملی',customer.nationalId],['شرکت / واحد',customer.company],['پلاک',customer.plate],['وسیله',customer.vehicleType],['نوع خودرو',customer.carType],['محله',customer.district],['نشانی',customer.address],['یادداشت',customer.notes]];
  const customerHtml=customer.name||customer.phone?`<section><h3>اطلاعات مشتری</h3><div class="sales-history-info-grid">${profileFields.filter(([,value])=>value).map(([label,value])=>`<div><small>${label}</small><b>${esc(label==='تلفن'||label==='تلفن دوم'||label==='کد ملی'||label==='کد مشتری'?fa(value):value)}</b></div>`).join('')||'<p class="subtle">اطلاعات کامل مشتری ثبت نشده است.</p>'}</div></section>`:'';
  const type=esc(o.orderTypeLabel||typeLabels[o.orderType]||o.orderType||'—');
  // v37.50.0 — پروندهٔ کامل: نوع و وضعیت اولیه، کاربر هر مرحله و وضعیت ترابری هم اضافه شد.
  const orderFields=[['نوع سفارش',type],['وضعیت فعلی',esc(o.status||'—')],['وضعیت هنگام ثبت',esc(o.statusAtCreation||'')],['تاریخ ثبت',esc(formatDateTime24(o.createdAt))],['ثبت‌کننده',esc(o.createdBy?.name||o.createdBy?.username||'—')],['آخرین تغییر',esc(formatDateTime24(o.updatedAt))],['فروشگاه',esc(o.storeName||'')],['زمان برنامه‌ریزی',esc(formatDateTime24(o.scheduledAt||o.scheduledDate))],['تاریخ تحویل',esc(formatDateTime24(o.deliveryDate))],['محل ارسال',esc(o.dispatchPlace||'')],['روش تحویل',esc(o.deliveryMode==='DELIVERY'?'ارسال با پخش':o.deliveryMode==='PICKUP'?'تحویل در انبار':'')],['شماره سند انبار',esc(fa(o.warehouseDocumentNo||''))],['دریافت در انبار',esc(formatDateTime24(o.warehouseAcceptedAt))],['دریافت‌کنندهٔ انبار',esc(o.warehouseAcceptedBy?.name||'')],['شروع آماده‌سازی',esc(formatDateTime24(o.warehousePreparationStartedAt))],['شروع‌کننده',esc(o.warehousePreparationStartedBy?.name||'')],['ثبت وزن نهایی',esc(formatDateTime24(o.warehouseCompletedAt))],['ثبت‌کنندهٔ وزن نهایی',esc(o.warehouseCompletedBy?.name||'')],['پایان کار',esc(formatDateTime24(o.completedAt))],['یادداشت سفارش',esc(o.notes||'')]];
  const orderHtml=`<section><h3>مشخصات سفارش</h3><div class="sales-history-info-grid">${orderFields.filter(([,value])=>value&&value!=='—').map(([label,value])=>`<div><small>${label}</small><b>${value}</b></div>`).join('')}</div></section>`;
  const invoices=(o.invoices||[]).map(payment=>`<div class="sales-history-row"><div><b>${esc(payment.number||'—')}</b><small>${esc(formatDateTime24(payment.verifiedAt))} · ${money(payment.total)}</small></div><button type="button" class="btn btn-secondary btn-sm" data-action="invoice" data-id="${esc(o.id)}" data-run="${Number(payment.run)||0}">نمایش فاکتور</button></div>`).join('')||'<p class="subtle">فاکتوری صادر نشده است.</p>';
  const visit=o.visit?`<section><h3>مراجعهٔ مرتبط</h3><p>${esc(formatDateTime24(o.visit.createdAt))} · ثبت‌کننده: ${esc(o.visit.createdBy?.name||'—')} · ${esc(o.visit.purpose||'')}</p></section>`:'';
  const items=isManager?`<section><h3>اقلام سفارش و وزن‌ها</h3>${salesHistoryOrderItems(d.items)}</section>`:'';
  // v37.50.0 — مسیر ترابری: راننده و خودروی هر سرویس و کاربر تخصیص‌دهنده.
  const transportRows=Object.values(o.transportAssignments||{});
  const transport=isManager&&transportRows.length?`<section><h3>ارسال و ترابری</h3><div class="sales-history-info-grid">${transportRows.map(a=>`<div><small>${a.run?`سرویس ${fa(a.run===1?'اول':'دوم')}`:'سفارش مشتری'}</small><b>${esc(a.driverName||'—')}${a.vehiclePlate?` • ${esc(fa(a.vehiclePlate))}`:''}<br><span class="subtle">تخصیص: ${esc(formatDateTime24(a.assignedAt))}${a.assignedBy?.name?` · ${esc(a.assignedBy.name)}`:''}</span></b></div>`).join('')}</div></section>`:'';
  const events=(d.events||[]).map(salesHistoryEventHtml).join('')||'<li>رویداد ثبت‌شده‌ای برای این سفارش موجود نیست.</li>';
  openModal(`سوابق سفارش ${fa(o.orderNo||'—')}`,`<div class="sales-history-detail"><div class="sales-history-summary"><b>${esc(o.customerName||customer.name||o.storeName||'—')}</b><span>${badge(o.status)}</span><span>نوع سفارش: ${type}</span><span>شماره سفارش: ${esc(fa(o.orderNo||'—'))}</span></div>${orderHtml}${customerHtml}${visit}${items}${transport}<section><h3>فاکتورها</h3>${invoices}</section><section><h3>مسیر کامل سفارش و کاربران ثبت‌کننده</h3><p class="subtle">رویدادها به ترتیب ثبت در سامانه نمایش داده می‌شوند. برای هر مرحله، جزئیات ممیزی و ثبت‌کننده قابل مشاهده است؛ سوابق قدیمی ممکن است اطلاعاتی نداشته باشند.</p><ol class="sales-history-timeline">${events}</ol></section></div>`);
 }catch(e){toast(e.message)}
}
async function renderSalesHistory(q='',offset=0){
 const root=$('#content');root.onclick=null;root.innerHTML='<div class="empty">در حال دریافت سوابق…</div>';
 try{const d=await api('/api/sales/history?limit=25&offset='+offset+'&q='+encodeURIComponent(q));if(app.page!=='sales'||app.sub.sales!=='history')return;root.innerHTML=`<section class="sales-history-panel"><div class="sales-live-head"><div><h2>سوابق سفارش و فاکتور</h2><p>همهٔ سفارش‌های ثبت‌شده، وضعیت فعلی، فاکتورها و گردش ثبت‌شده</p></div><span class="badge blue">${qty(d.total)} سفارش</span></div><form id="salesHistorySearch" class="sales-history-search"><input name="q" value="${esc(q)}" placeholder="نام مشتری، تلفن، شماره سفارش یا فاکتور" aria-label="جستجو در سوابق"><button class="btn btn-primary" type="submit">جستجو</button></form><div class="sales-history-list">${salesHistoryTable(d.orders)||'<div class="empty">سابقه‌ای یافت نشد.</div>'}</div><div class="sales-history-pages"><button class="btn btn-secondary" data-history-offset="${Math.max(0,offset-25)}" ${offset===0?'disabled':''}>صفحه قبل</button><span>${qty(offset+1)}–${qty(Math.min(d.total,offset+25))} از ${qty(d.total)}</span><button class="btn btn-secondary" data-history-offset="${offset+25}" ${offset+25>=d.total?'disabled':''}>صفحه بعد</button></div></section>`;$('#salesHistorySearch').onsubmit=e=>{e.preventDefault();renderSalesHistory(e.currentTarget.elements.q.value.trim(),0)};root.onclick=e=>{const p=e.target.closest('[data-history-offset]');if(p)renderSalesHistory(q,Number(p.dataset.historyOffset));};}catch(e){root.innerHTML=`<div class="empty">خطا در دریافت سوابق: ${esc(e.message)}</div>`;}
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-sales-history-id]');if(b){e.preventDefault();openSalesHistory(b.dataset.salesHistoryId);}});

async function renderRoleCartableDashboard(role,view='dashboard'){
  if (view === 'reports') return renderReportsPage(role);
  const names={gate:'نگهبانی',sales:'فروش',warehouse:'انبار',dispatch:'ترابری',store:'فروشگاه'};let w={...(app.workload||{})};
  if(role==='dispatch'){
    try{const [resources,plans,work]=await Promise.all([api('/api/transport/resources'),api('/api/transport/plans'),api('/api/workload')]);w.activeDrivers=(resources.drivers||[]).filter(d=>d.isActive).length;w.dispatchIncoming=Number(work.counts?.dispatchPending||0);w.dispatchPlanned=(plans.orders||[]).length;}catch{}
  }
  if(role==='store'){
    try{const rows=(await api('/api/store/orders')).orders||[],views=rows.flatMap(o=>st38ViewsOf(o));w.store=rows.filter(o=>o.status==='STORE_PENDING_SALES').length;w.storeDelivery=views.filter(v=>v.dispatch&&['ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT'].includes(v.dispatch.status)).length;w.storeDelivered=views.filter(v=>v.dispatch&&['DELIVERED','SALES_FINALIZED','CLOSED'].includes(v.dispatch.status)).length;}catch{}
  }
  // v37.11.0 — آمار سفارشات ورودی امروز فقط برای داشبورد انبار گرفته می‌شود.
  let whToday=null;
  if(role==='warehouse'&&view==='dashboard'){
    try{whToday=await api('/api/warehouse/today-stats');}catch{}
  }
  // v37.10.0 — کارت‌ها: [برچسب، مقدار، مقصد، آیکن موضوعی، رنگ لهجه]؛ داده‌ها و مقصدها بدون تغییر.
  const sets={
    gate:[['در انتظار فروش',w.gateEntry||0,'waiting','user','red'],['آماده خروج',w.gateExit||0,'exit','exitDoor','green'],['پخش',w.gateDispatchPending||0,'dispatch-leaving','truck','blue'],['سوابق مراجعه',w.visitsTotal||0,'history','history','purple']],
    sales:[['ورودی حضوری',w.salesIntake||0,'onsite','user','red'],['سفارش غیرحضوری',w.salesRemote||0,'remote','phone','blue'],['در جریان',w.salesFlow||0,'flow','flow','orange'],['فروشگاه‌ها',w.store||0,'stores','store','purple'],['آماده تسویه',w.salesSettlement||0,'settlement','receipt','green'],['روزهای آتی',w.salesFuture||0,'future','calendar','teal']],
    warehouse:[['سفارش‌های ورودی',w.warehouseIncoming||0,'incoming','inbox','red'],['تحویل و آماده‌سازی',w.warehousePreparing||0,'preparing','scale','orange'],['فروشگاه‌ها',w.warehouseStores||0,'stores','store','purple'],['سوابق مراجعه',w.visitsTotal||0,'history','history','blue']],
    dispatch:[['رانندگان فعال',w.activeDrivers||0,'transport-resources','driver','blue'],['اقدام‌های ترابری',w.dispatchIncoming||0,'orders','inbox','red'],['سفارش‌های در برنامه',w.dispatchPlanned||0,'orders','route','orange']],
    store:[['در انتظار بررسی',w.store||0,'registered','clipboard','red'],['در حال تحویل',w.storeDelivery||0,'delivery','truck','orange'],['تحویل‌شده',w.storeDelivered||0,'delivery','check','green']]
  };
  const cards=sets[role]||[];
  const roleIcons={gate:'shield',sales:'sales',warehouse:'warehouse',dispatch:'truck',store:'store'};
  const rolePage=role==='dispatch'?'drivers':role;
  const dashHeading=(title,desc,ico)=>`<div class="role-dash-heading"><span class="role-dash-hero-ico">${icon(ico,24)}</span><div class="role-dash-heading-text"><span class="eyebrow">${esc(names[role]||'کارتابل')} / ${view==='reports'?'REPORTS':'OVERVIEW'}</span><h2>${title}</h2><p>${desc}</p></div><span class="role-dash-live"><i></i> به‌روزرسانی زنده</span></div>`;
  const dashMax=Math.max(1,...cards.map(([,value])=>Number(value)||0));
  $('#content').innerHTML=`<section class="role-dash" data-dash-role="${role}">${role==='sales'?'':dashHeading(`داشبورد ${esc(names[role]||'کارتابل')}`,'خلاصهٔ وضعیت جاری و دسترسی سریع به بخش‌های اصلی کارتابل',roleIcons[role]||'dashboard')}<div class="role-dash-grid">${cards.map(([label,value,target,ico,tone],i)=>{const pct=Math.max(Number(value)>0?10:0,Math.round((Number(value)||0)/dashMax*100));return `<button class="role-dash-card tone-${tone||'red'}" style="--d:${i*70}ms" data-cartable="${target}" data-role-page="${rolePage}"><span class="role-dash-top"><span class="role-dash-ico">${icon(ico||'info',22)}</span><span class="role-dash-num">۰${i+1}</span></span><span class="role-dash-label">${esc(label)}</span><strong>${qty(value)}</strong><span class="role-dash-bar" aria-hidden="true"><i style="width:${pct}%"></i></span><small>مشاهدهٔ ${esc(label)} ←</small></button>`}).join('')}${role==='sales'?`<button type="button" class="role-dash-card tone-green" data-sales-daily="sales"><span class="role-dash-top"><span class="role-dash-ico">${icon('receipt',22)}</span></span><span class="role-dash-label">فروش روز</span><strong>در حال دریافت…</strong><small>تفکیک محصولات ←</small></button><button type="button" class="role-dash-card tone-blue" data-sales-daily="orders"><span class="role-dash-top"><span class="role-dash-ico">${icon('package',22)}</span></span><span class="role-dash-label">سفارش روز</span><strong>در حال دریافت…</strong><small>تفکیک محصولات ←</small></button>`:''}</div>${role==='warehouse'?whDashLiveHtml(whToday):''}${role==='sales'?'':`<div class="role-dash-foot"><span class="role-dash-foot-live"><i></i> به‌روزرسانی خودکار وضعیت کارتابل فعال است</span><b>${esc(todayText())}</b></div>`}</section>`;
  if(role==='sales'){ await refreshSalesOverview(); if(app.page==='sales'&&app.sub.sales==='dashboard') app.timer=setInterval(refreshSalesOverview,6000); }
  // v37.11.0 — تازه‌سازی زندهٔ آمار سفارشات امروز تا وقتی داشبورد انبار باز است (هر ۵ ثانیه).
  if(role==='warehouse'){
    if(app.timer)clearInterval(app.timer);
    app.timer=setInterval(()=>{if(!$('#whDashLiveBody')){clearInterval(app.timer);app.timer=null;return}refreshWhDashToday();},5000);
  }
}

async function renderDashboard(){
  const d=await api('/api/dashboard'); const c=d.counts||{};
  $('#content').innerHTML=`
  <div class="v26-dashboard">
    <section class="v26-dashboard-hero">
      <div class="v26-hero-copy">
        <span class="eyebrow">BABOLTOYOOR / CONTROL CENTER</span>
        <h2>مرکز کنترل عملیات</h2>
        <p>نمای لحظه‌ای از ورود مشتری، فروش، انبار، تسویه و خروج؛ با تمرکز روی اقدام بعدی هر واحد.</p>
        <div class="v26-hero-actions"><button class="btn btn-primary" data-page="reports">${icon('reports',17)} گزارش مدیریتی</button><button class="btn btn-secondary" data-page="admin">${icon('settings',17)} تنظیمات</button></div>
      </div>
      <div class="v26-hero-date"><span>امروز</span><strong>${esc(todayText())}</strong><small>ساعت سیستم ${esc(formatDateTime24(serverNow()).split(' • ').pop()||'—')}</small></div>
    </section>
    <section class="v26-kpi-grid">
      ${v26Kpi('ورودی امروز',c.visitsToday||0,'مراجعه ثبت‌شده در نگهبانی','gate','red')}
      ${v26Kpi('منتظر فروش',c.waitingSales||0,'مشتری آماده ثبت سفارش','sales','blue')}
      ${v26Kpi('در صف انبار',c.pendingWarehouse||0,'سفارش آماده اقدام انبار','warehouse','orange')}
      ${v26Kpi('آماده خروج',c.readyExit||0,'فاکتور نهایی و آماده کنترل','check','green')}
      ${v26Kpi('برنامه آینده',c.remoteScheduled||0,'سفارش‌های زمان‌بندی‌شده','calendar','purple')}
    </section>
    <div class="v26-dashboard-grid">
      <section class="v26-board v26-process-board">
        <div class="v26-board-head"><div><span class="eyebrow">LIVE PROCESS</span><h3>جریان عملیات</h3><p>هر مرحله فقط یک اقدام روشن برای واحد مسئول دارد.</p></div><span class="v26-live"><i></i> به‌روزرسانی خودکار</span></div>
        <div class="v26-process-track">${[['gate','ورود','نگهبانی','مراجعه'],['sales','فروش','فروش','سفارش'],['warehouse','انبار','انبار','تحویل'],['receipt','تسویه','فروش','فاکتور'],['check','خروج','نگهبانی','تأیید خروج']].map((x,i)=>`<div class="v26-process-item"><span class="v26-process-number">۰${i+1}</span><div class="v26-process-icon">${icon(x[0],20)}</div><div><strong>${x[1]}</strong><small>${x[3]} توسط ${x[2]}</small></div></div>`).join('<span class="v26-process-line"></span>')}</div>
      </section>
      <section class="v26-board v26-recent-board">
        <div class="v26-board-head"><div><span class="eyebrow">RECENT ACTIVITY</span><h3>آخرین فعالیت‌ها</h3></div><button class="btn btn-ghost btn-sm" data-page="orders-history">مشاهده همه</button></div>
        <div class="v26-activity-list">${(d.recent||[]).map(o=>`<button type="button" class="v26-activity-row" data-sales-history-id="${esc(o.id)}" title="مشاهدهٔ پروندهٔ کامل سفارش"><span class="v26-activity-icon">${icon(o.orderType==='REMOTE'||o.orderType==='STORE'?'calendar':'receipt',16)}</span><div><strong>${esc(storeAwareOrderName(o))}</strong><small>${orderKindLabel(o)} <i>•</i> ${badge(o.status)}</small></div><time>${formatDateTime24(o.createdAt)}</time></button>`).join('')||salesEmptyV25('receipt','فعالیتی ثبت نشده است','با ثبت اولین مراجعه یا سفارش، رویدادها در اینجا دیده می‌شوند.')}</div>
      </section>
    </div>
  </div>`;
}
function v26Kpi(label,value,hint,ico,tone){return `<article class="v26-kpi v26-kpi-${tone}"><span class="v26-kpi-icon">${icon(ico,21)}</span><div><span>${esc(label)}</span><strong>${qty(value)}</strong><small>${esc(hint)}</small></div></article>`}


function renderSalesOnsiteV25(visits){
  return `<section class="v26-sales-pane">
    <section class="v26-panel">
      ${salesSectionTitle('01 / ONSITE','مشتریان حضوری','فقط مراجعانی که نگهبانی ثبت کرده و برای فروش ارسال شده‌اند.',visits.length)}
      <div class="v26-toolbar"><label class="v26-search"><span>${icon('search',18)}</span><input id="salesSearchV25" placeholder="نام، شماره تماس یا پلاک را جستجو کنید"></label><span class="v26-live"><i></i> زنده</span></div>
      <div id="salesOnsiteListV25" class="v26-list">${salesOnsiteRowsV25(visits)}</div>
    </section>
  </section>`;
}
function salesOnsiteRowsV25(visits){return visits.map(v=>`<button class="v26-customer-row" data-action="open-order" data-id="${v.id}"><span class="v26-customer-avatar">${esc(initials(v.customer?.name||''))}</span><span class="v26-customer-main"><strong>${esc(v.customer?.name||'—')}</strong><small>${esc(v.customer?.phone||'—')} <i>•</i> ${plateViewHtml(v.customer?.plate, 'بدون پلاک', true)}</small></span><span class="v26-customer-time">${formatDateTime24(v.createdAt)}</span><span class="v26-customer-action">ثبت سفارش ${icon('arrow',16)}</span></button>`).join('')||salesEmptyV25('user','صف حضوری خالی است','مراجعه جدید پس از ثبت نگهبانی در این فهرست قرار می‌گیرد.');}


function renderSalesFlowV25(orders){
  return `<section class="v26-sales-pane"><section class="v26-panel v26-flow-panel">
    ${salesSectionTitle('03 / IN PROGRESS','سفارش‌های در جریان','تمام سفارش‌هایی که به انبار ارسال شده‌اند در یک فهرست کامل و مرتب دیده می‌شوند.',orders.length)}
    <div class="v26-flow-toolbar"><span class="v26-live"><i></i> مرتب‌سازی بر اساس آخرین اقدام</span><span class="v26-legend"><i class="orange"></i> در صف انبار <i class="gray"></i> برگشت به فروش</span></div>
    <div class="v26-flow-list">${orders.map((o,idx)=>`<article class="v26-flow-card"><div class="v26-flow-index">${fa(String(idx+1).padStart(2,'0'))}</div><div class="v26-flow-main"><div class="v26-flow-top"><div><div class="v26-order-line-head"><span class="v26-order-code">${esc(fa(o.orderNo||'—'))}</span>${o.orderType==='ONSITE'?'<span class="v26-type onsite">حضوری</span>':salesKindBadge(o)}${o.scheduledAt?`<span class="v26-schedule-chip">${salesOrderDateTime(o)}</span>`:''}</div><h3>${esc(storeAwareOrderName(o))}</h3><p>${esc(storeAwareOrderPhone(o))} <i>•</i> ${esc(o.dispatchPlace||'محل ارسال ثبت نشده')}</p></div><div>${badge(o.status)}</div></div>
      <div class="v26-flow-stats"><div><span>اقلام</span><strong>${qty(activeItemsOf(o).length)}</strong></div><div><span>زمان ثبت</span><strong>${formatDateTime24(o.createdAt)}</strong></div><div><span>آخرین اقدام</span><strong>${formatDateTime24(o.updatedAt||o.createdAt)}</strong></div>${o.scheduledAt?`<div><span>زمان ارسال</span><strong>${salesOrderDateTime(o)}</strong></div>`:''}</div>
      <div class="v26-flow-products">${activeItemsOf(o).map((i,k)=>`<div class="v26-flow-product"><span class="v26-line-no">${fa(String(k+1))}</span><span class="v26-product-name">${esc(i.product?.name||'—')}</span><b>${qty(i.requestedQty)} ${esc(i.requestedUnit||'')}</b><small>${esc(i.description||'بدون توضیح')}</small></div>`).join('')||'<div class="empty">قلم فعالی ندارد.</div>'}</div>
      <div class="v26-flow-actions"><button class="btn btn-secondary" data-action="order-details" data-id="${o.id}">${icon('eye',15)} جزئیات کامل</button>${o.status==='RETURNED_TO_SALES'?`<button class="btn btn-secondary" data-action="edit-returned-order" data-id="${o.id}">${icon('edit',15)} اصلاح سفارش</button><button class="btn btn-primary" data-action="resubmit-order" data-id="${o.id}">${icon('send',15)} ارسال مجدد</button>`:''}</div>
    </div></article>`).join('')||salesEmptyV25('truck','سفارشی در جریان نیست','هر سفارشی که به انبار ارسال شود در این فهرست قرار می‌گیرد.')}</div>
  </section></section>`;
}

function renderSalesSettlementV25(orders){
  const pending=orders.filter(o=>o.status==='SETTLEMENT_PENDING'); const finalized=orders.filter(o=>['SETTLED','EXITED'].includes(o.status)||((o.payments||[]).length&&!['SETTLEMENT_PENDING','CANCELLED'].includes(o.status))); // v37.5.0 — سفارش‌های فروشگاهِ بسته‌شده با فاکتور سرویس
  return `<section class="v26-sales-pane"><div class="v26-settlement-layout"><section class="v26-panel">${salesSectionTitle('04 / SETTLEMENT','تسویه سفارش‌ها','قیمت‌گذاری، ثبت تسویه و صدور فاکتور در این بخش انجام می‌شود.',pending.length)}<div class="v26-settlement-list">${pending.map(o=>`<button class="v26-settlement-row" data-action="select-settlement" data-id="${o.id}"><span class="v26-settlement-icon">${icon('receipt',18)}</span><span class="v26-settlement-main"><strong>${esc(storeAwareOrderName(o))}</strong><small>${esc(storeAwareOrderPhone(o))} <i>•</i> ${qty(activeItemsOf(o).length)} قلم</small></span><span class="v26-settlement-time"><small>تحویل</small>${formatDateTime24(o.updatedAt||o.createdAt)}</span><span class="badge blue">آماده تسویه</span><span class="toolbar inline"><button type="button" class="btn btn-secondary btn-sm" data-action="settlement-reopen-prep" data-id="${o.id}">${icon('scale',14)} ارجاع به آماده‌سازی</button>${icon('arrow',17)}</span></button>`).join('')||salesEmptyV25('receipt','صف تسویه خالی است','بعد از تأیید تحویل در انبار، سفارش در این بخش قرار می‌گیرد.')}</div></section>
  <section class="v26-panel">${salesSectionTitle('INVOICE & EXIT','فاکتور و تأییدیه خروج','فاکتورهای نهایی و وضعیت ارسال تأیید خروج برای نگهبانی.',finalized.length)}<div class="v26-invoice-list">${invoiceRowsV27(finalized)}</div></section></div></section>`;
}


function renderProductPickerLine(x,i,prefix='sales'){
  const idx=String(i);
  if(prefix==='future') return renderFutureLineRow(x,i);
  return `<article class="v26-product-line op-line" data-line="${idx}">
    <span class="v26-product-index">${fa(String(i+1).padStart(2,'0'))}</span>
    <div class="v26-product-line-main">
      <div class="field op-product-field"><label>محصول <small>نام یا کد سریع دو رقمی</small></label><div class="input-shell v26-input"><span>${icon('search',17)}</span><input data-op-product-search="${prefix}-${idx}" aria-label="محصول ردیف ${fa(String(i+1))}" value="${esc(x.productLabel||'')}" placeholder="مثلاً 01 یا مرغ بسته‌بندی" autocomplete="off"></div><div class="product-suggest" data-op-suggest="${prefix}-${idx}"></div><div class="v26-product-picked">${x.productId?`<span>انتخاب شد</span>`:'هنوز محصول انتخاب نشده است'}</div></div>
      <div class="field"><label>مقدار درخواستی <small>عدد / وزن</small></label><div class="input-shell v26-input quantity-shell"><input data-op-qty="${prefix}-${idx}" aria-label="مقدار ردیف ${fa(String(i+1))}" inputmode="decimal" value="${esc(x.requestedQty||'')}" placeholder="۰٫۰۰۰"></div></div>
      <div class="field"><label>واحد</label><div class="input-shell v26-input"><select data-op-unit="${prefix}-${idx}" aria-label="واحد ردیف ${fa(String(i+1))}"><option ${x.requestedUnit==='کیلوگرم'?'selected':''}>کیلوگرم</option><option ${x.requestedUnit==='بسته'?'selected':''}>بسته</option><option ${x.requestedUnit==='عدد'?'selected':''}>عدد</option><option ${x.requestedUnit==='کارتن'?'selected':''}>کارتن</option></select></div></div>
      <div class="field op-desc"><label>توضیحات ردیف <small>برای انبار و تحویل</small></label><div class="input-shell v26-input v26-textarea"><textarea data-op-desc="${prefix}-${idx}" aria-label="توضیح ردیف ${fa(String(i+1))}" rows="2" maxlength="500" placeholder="توضیح بسته‌بندی، نحوه تحویل یا نکته مشتری...">${esc(x.description||'')}</textarea></div></div>
    </div>
    <button type="button" class="v26-delete-line" data-action="op-remove-line" data-prefix="${prefix}" data-draft-key="${({remote:'remoteDraft',phone:'phoneDraft',future:'futureDraft',store:'storeDraft',storeedit:'storeEditDraft',sales:'orderDraft',onsite:'orderDraft'})[prefix]||'orderDraft'}" data-index="${idx}" title="حذف ردیف">${icon('trash',16)}</button>
  </article>`;
}

async function openOrder(visitId){
  try{
    const visits=(await api('/api/visits')).visits||[]; const v=visits.find(x=>x.id===visitId); if(!v)return;
    app.orderDraft=[defaultOrderLine()];
    $('#content').innerHTML=renderSalesTabsV29('onsite')+`<section id="orderEntryPage" class="v26-order-entry"><section class="v26-form-banner"><div class="v26-banner-main"><button class="btn btn-secondary" data-action="back-order-intake">${icon('arrow',16)} بازگشت به ورودی‌ها</button><div><span class="eyebrow">ONSITE ORDER / NEW</span><h2>ثبت سفارش مشتری حضوری</h2><p>سفارش را با ردیف‌های استاندارد و اطلاعات کامل ثبت کنید.</p></div></div><div class="v26-banner-actions"><span class="badge orange">در انتظار ثبت سفارش</span><button class="btn btn-primary btn-lg" data-action="submit-order" data-id="${visitId}">${icon('send',18)} ثبت و ارسال به انبار</button></div></section>
    <section class="v26-customer-card"><span class="v26-customer-avatar large">${esc(initials(v.customer?.name||''))}</span><div class="v26-customer-identity"><span>مشتری</span><strong>${esc(v.customer?.name||'—')}</strong><small>${esc(v.customer?.phone||'—')} <i>•</i> ${plateViewHtml(v.customer?.plate, 'بدون پلاک', true)} <i>•</i> ورود ${formatDateTime24(v.createdAt)}</small></div><div class="v26-order-stage"><span class="done">۱ مشتری</span><i></i><span class="active">۲ سفارش</span><i></i><span>۳ انبار</span></div></section>
    <div class="v26-order-layout"><section class="v26-panel v26-form-panel"><div class="v26-items-head"><div><span class="eyebrow">ORDER ITEMS</span><h3>اقلام سفارش</h3><p>هر ردیف یک واحد اطلاعاتی کامل و مستقل است.</p></div><span class="v26-helper">کیلوگرم / بسته / عدد / کارتن</span></div><div id="orderLines" class="v26-product-lines"></div><div class="v26-add-line-row"><button class="btn btn-secondary btn-lg" data-action="add-line">${icon('plus',17)} افزودن ردیف محصول</button><span>برای حذف یک ردیف از آیکن سطل زباله استفاده کنید.</span></div></section></div></section>`;
    renderOrderLines(); updateOrderDraftSummary();
  }catch(e){toast(e.message)}
}
function renderOrderLines(){
  const box=$('#orderLines'); if(!box)return;
  box.innerHTML=app.orderDraft.map((x,i)=>`<article class="v26-product-line order-line" data-line="${i}"><span class="v26-product-index">${fa(String(i+1).padStart(2,'0'))}</span><div class="v26-product-line-main"><div class="field product-box"><label>محصول <small>نام یا کد سریع دو رقمی</small></label><div class="input-shell v26-input"><span>${icon('search',17)}</span><input data-product-search="${i}" value="${esc(x.productLabel||'')}" placeholder="مثلاً 01 یا مرغ بسته‌بندی" autocomplete="off"></div><div class="product-suggest" data-suggest-for="${i}"></div><div class="v26-product-picked">${x.productId?`<span>انتخاب شد</span>`:'هنوز محصول انتخاب نشده است'}</div></div><div class="field"><label>مقدار درخواستی</label><div class="input-shell v26-input"><input data-qty="${i}" inputmode="decimal" value="${esc(x.requestedQty||'')}" placeholder="۰٫۰۰۰"></div></div><div class="field"><label>واحد درخواست</label><div class="input-shell v26-input"><select data-unit="${i}"><option ${x.requestedUnit==='کیلوگرم'?'selected':''}>کیلوگرم</option><option ${x.requestedUnit==='بسته'?'selected':''}>بسته</option><option ${x.requestedUnit==='عدد'?'selected':''}>عدد</option><option ${x.requestedUnit==='کارتن'?'selected':''}>کارتن</select></div></div><div class="field order-description-field"><label>توضیحات ردیف</label><div class="input-shell v26-input v26-textarea"><textarea data-description="${i}" rows="2" maxlength="500" placeholder="توضیح برای انبار یا نحوه بسته‌بندی...">${esc(x.description||'')}</textarea></div></div></div><button class="v26-delete-line" data-action="remove-line" data-index="${i}" aria-label="حذف ردیف">${icon('trash',16)}</button></article>`).join('');
  $$('#orderLines [data-product-search]').forEach(inp=>inp.addEventListener('input',()=>productSearch(inp.dataset.productSearch,inp.value)));
  $$('#orderLines [data-qty]').forEach(inp=>inp.addEventListener('input',()=>{app.orderDraft[Number(inp.dataset.qty)].requestedQty=inp.value;updateOrderDraftSummary()}));
  $$('#orderLines [data-unit]').forEach(sel=>sel.addEventListener('change',()=>{app.orderDraft[Number(sel.dataset.unit)].requestedUnit=sel.value;updateOrderDraftSummary()}));
  $$('#orderLines [data-description]').forEach(inp=>inp.addEventListener('input',()=>{app.orderDraft[Number(inp.dataset.description)].description=inp.value;}));
}
function updateOrderDraftSummary(){const box=$('#orderDraftSummary');if(!box)return;const valid=(app.orderDraft||[]).filter(x=>x.productId&&n(x.requestedQty)>0);const total=valid.reduce((s,x)=>s+n(x.requestedQty),0);box.innerHTML=`<div class="v26-summary-stat"><span>قلم معتبر</span><strong>${qty(valid.length)}</strong></div><div class="v26-summary-stat"><span>مجموع مقدار</span><strong>${qty(total)}</strong></div><div class="v26-summary-list">${valid.map(x=>`<div><span>${esc(x.productLabel||'')}</span><strong>${qty(x.requestedQty)} ${esc(x.requestedUnit||'')}</strong></div>`).join('')||'<div class="empty">هنوز قلم معتبری ثبت نشده است.</div>'}</div>`}

/* ================================================================
   v27 performance patch — instant sales desk navigation / lighter live refresh
   ================================================================ */
app.salesCache = app.salesCache || {orders:[], visits:[], dispatchDeliveries:{active:[],pending:[],finalized:[],finalizedTotal:0}, fetchedAt:0};
app.salesFetchPromise = null;

// Read all pages rather than comparing a complete workload with only the first 100 rows.
