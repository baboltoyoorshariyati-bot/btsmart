/* واحد پخش، کارتابل راننده و مرجوعی‌ها — گردش پخش نسخهٔ فروش‌محور
   جریان: فروش راننده را انتخاب می‌کند ← نگهبانی فقط خروج پیش از حرکت را تأیید می‌کند
         ← راننده تحویل را ثبت می‌کند ← فروش تحویل را بازبینی و نهایی می‌کند.
   مرجوعی: راننده به فروش می‌دهد ← فروش به انبار ارجاع می‌دهد ← انبار دریافت می‌کند.
   صفحه‌های زنده هر چند ثانیه داده را می‌گیرند و فقط وقتی تغییر کرده باشد دوباره می‌سازند. */

const DSP_STATUS = { PENDING_ASSIGN: 'در انتظار تخصیص راننده', ASSIGNED: 'تخصیص‌یافته؛ منتظر اعلام خروج راننده', DRIVER_EXIT_REPORTED: 'خروج راننده ثبت شد؛ منتظر تأیید نگهبان', IN_TRANSIT: 'در حال ارسال به مشتری', DELIVERED: 'تحویل ثبت شد؛ منتظر تأیید نهایی فروش', SALES_FINALIZED: 'ثبت نهایی فروش انجام شد', CLOSED: 'بسته شده (نسخهٔ قدیمی)' };
const DSP_STATUS_CLASS = { PENDING_ASSIGN: 'orange', ASSIGNED: 'orange', DRIVER_EXIT_REPORTED: 'purple', IN_TRANSIT: 'blue', DELIVERED: 'orange', SALES_FINALIZED: 'green', CLOSED: 'gray' };
const DSP_RET_STATUS = { AT_SALES: 'نزد واحد فروش', AT_WAREHOUSE: 'ارجاع به انبار', RECEIVED: 'دریافت‌شده توسط انبار' };
const DSP_SETTLE = { CASH: 'نقدی', CREDIT: 'معوق' };
const DSP_LIVE_MS = 4000;
const dsp = { tab: 'pending', driverTab:'assigned', retTab: '', planTab: 'incoming', orders: [], counts: {}, drivers: [], open: [], driverData:null, sig: null, sigs: {} };

/* fallback plateViewHtml for standalone dispatch — will be overridden by app.js if loaded */
if(typeof plateViewHtml === 'undefined'){
  function plateViewHtml(value, fallback='—', compact=false){
    const raw=String(value||'').trim();
    if(!raw) return `<span style="color:var(--muted);font-size:12px;font-weight:700">${typeof esc==='function'?esc(fallback):fallback}</span>`;
    // use global parsePlate/formatPlate if available, else simple split
    let a='',letter='',c='',prov='';
    try{
      if(typeof parsePlate==='function'){
        const pr=parsePlate(raw);
        a=pr.a||''; letter=pr.letter||''; c=pr.c||''; prov=pr.province||'';
      } else throw new Error('no parse');
    } catch(e){
      // fallback simple parse: try to extract parts via regex 2digits letter 3digits - 2digits
      const m=raw.match(/(\d{1,2})\s*([^\d\s\-\.]+)?\s*(\d{1,3})?\s*[-\s]*\s*(\d{1,2})?/);
      if(m){ a=m[1]||''; letter=m[2]||''; c=m[3]||''; prov=m[4]||''; }
      else { a=raw; }
    }
    const escFn = typeof esc==='function' ? esc : (v=>String(v||''));
    const cls = compact ? 'iran-plate is-readonly is-compact' : 'iran-plate is-readonly';
    return `<div class="${cls}" style="display:inline-grid;vertical-align:middle" dir="ltr" aria-label="پلاک ${escFn(raw)}"><div class="blue-strip"><span>IR<br>ایران</span></div><div class="plate-part"><span>${escFn(a)}</span></div><div class="plate-part"><span>${escFn(letter)}</span></div><div class="plate-part"><span>${escFn(c)}</span></div><div class="plate-part plate-code"><span>${escFn(prov)}</span></div></div>`;
  }
}

function dispatchStatusLabel(s) { return DSP_STATUS[s] || s || ''; }
/* برچسب کوتاه وضعیت برای نمایش یک‌خطی در کارت‌ها؛ متن کامل در title */
const DSP_STATUS_BADGE = { PENDING_ASSIGN: 'در انتظار تخصیص', ASSIGNED: 'تخصیص‌یافته', DRIVER_EXIT_REPORTED: 'خروج ثبت شد', IN_TRANSIT: 'در مسیر', DELIVERED: 'تحویل شد', SALES_FINALIZED: 'ثبت نهایی شد', CLOSED: 'بسته شده' };
function dspBadge(s) { const full = dispatchStatusLabel(s); return `<span class="badge ${DSP_STATUS_CLASS[s] || 'gray'}" title="${esc(full)}">${esc(DSP_STATUS_BADGE[s] || full)}</span>`; }
function dspKg(v) { return `${qty(v)} کیلو`; }
function dspCustomer(o) { return o.orderType==='STORE' ? (o.storeName || 'فروشگاه') : (o.customer?.name || o.storeName || '—'); }
function dspPhone(o) { return o.orderType==='STORE' ? '' : (o.customer?.phone || '—'); }
/* v37.17.0 — اقلام نمای هر محموله فقط اقلام همان سرویس‌اند و وزن نمایشی، وزن همان سرویس است */
function dspScopedItems(o) {
  const d = o.dispatch || {};
  const ids = Array.isArray(d.shipmentItemIds) ? d.shipmentItemIds : [];
  let items = (o.items || []).filter((i) => i.itemStatus !== 'CANCELLED');
  if (ids.length) {
    const set = new Set(ids); const w = d.shipmentWeights || {};
    items = items.filter((i) => set.has(i.id)).map((i) => ({ ...i, deliveredKg: Number(w[i.id] ?? i.deliveredKg ?? 0) }));
  } else if (d.run) {
    const w=d.shipmentWeights||{};
    items=items.map(i=>{const entries=(d.run===2?i.runR2:i.runR1)||[];const kg=Object.prototype.hasOwnProperty.call(w,i.id)?Number(w[i.id]):entries.reduce((sum,e)=>sum+Number(e.kg||0),0);return {...i,deliveredKg:kg};}).filter(i=>i.deliveredKg>0);
  }
  return items;
}
function dspItems(o) {
  const rows = dspScopedItems(o);
  return rows.map((i) => `<li><span>${esc(i.product?.name || '—')}</span><b>${dspKg(i.deliveredKg ?? i.requestedQty)}</b></li>`).join('')
    || '<li><span>قلمی ثبت نشده است</span></li>';
}
function dspInvoiceMarkup(o, compact = false) {
  const d=o.dispatch||{};
  const items=dspScopedItems(o); // v37.17.0
  const totalKg=items.reduce((sum,i)=>sum+Number(i.deliveredKg||0),0);
  const approvedTotal=Number(d.approvedTotalAmount??items.reduce((sum,i)=>sum+Number(i.finalAmount||Math.round(Number(i.deliveredKg||0)*Number(i.unitPrice||0))),0));
  const amountDue=Number(d.amountDue??approvedTotal);
  const rows=items.map((i,index)=>{
    const weight=Number(i.deliveredKg||0), unitPrice=Number(i.unitPrice||0);
    const amount=Number(i.finalAmount??Math.round(weight*unitPrice));
    return `<tr><td><b>${fa(String(index+1))}</b> ${esc(i.product?.name||'—')}</td><td>${dspKg(weight)}</td><td>${unitPrice>0?`${money(unitPrice)} / کیلو`:'—'}</td><td><strong>${money(amount)}</strong></td></tr>`;
  }).join('');
  return `<section class="dsp-invoice ${compact?'is-compact':''}"><header><div><span class="dsp-invoice-kicker">SALES PRICE APPROVAL</span><h3>وزن و مبلغ تأییدشده</h3></div><span class="badge ${d.priceApprovedAt?'green':'orange'}">${d.priceApprovedAt?'تأیید فروش':'در انتظار تأیید'}</span></header><div class="dsp-invoice-scroll"><table><thead><tr><th>قلم</th><th>وزن تحویلی</th><th>قیمت هر کیلو</th><th>مبلغ قلم</th></tr></thead><tbody>${rows||'<tr><td colspan="4">قلمی ثبت نشده است.</td></tr>'}</tbody></table></div><footer><span>جمع وزن <b>${dspKg(totalKg)}</b></span><span>جمع مبلغ تأییدشده <strong>${money(approvedTotal)}</strong></span>${d.returnDeduction>0?`<span>کسر مرجوعی <b>${money(d.returnDeduction)}</b></span>`:''}<span class="dsp-invoice-payable">قابل تسویه <strong>${money(amountDue)}</strong></span></footer></section>`;
}
function dspPriceFree(o) { return o.orderType === 'STORE'; } // v37.6.0 — فلوی فروشگاه کاملاً بدون قیمت
function dspQtyInvoiceMarkup(o, compact = false) { // v37.6.0 — پنل وزنی فروشگاه
  const items = dspScopedItems(o); // v37.17.0 — فقط وزن همین محموله
  const merged = new Map();
  for (const i of items) {
    const key = i.productId || i.product?.name || i.id;
    const prev = merged.get(key) || { name: i.product?.name || '—', weight: 0 };
    prev.weight += Number(i.deliveredKg || 0); merged.set(key, prev);
  }
  const rows = [...merged.values()].map((m, index) => `<tr><td><b>${fa(String(index + 1))}</b> ${esc(m.name)}</td><td>${dspKg(m.weight)}</td></tr>`).join('');
  const totalKg = items.reduce((sum, i) => sum + Number(i.deliveredKg || 0), 0);
  return `<section class="dsp-invoice ${compact ? 'is-compact' : ''}"><header><div><span class="dsp-invoice-kicker">DELIVERY WEIGHT DOC</span><h3>وزن‌های این محموله (بدون مبلغ)</h3></div><span class="badge green">فلوی فروشگاه</span></header><div class="dsp-invoice-scroll"><table><thead><tr><th>قلم</th><th>وزن تحویلی</th></tr></thead><tbody>${rows || '<tr><td colspan="2">قلمی ثبت نشده است.</td></tr>'}</tbody></table></div><footer><span>جمع وزن محموله <strong>${dspKg(totalKg)}</strong></span></footer></section>`;
}
async function dspOrderDetails(orderId, run = null) { // v37.6.0 — جزئیات محموله (وزن‌محور برای فروشگاه)
  const notices=captureEntityNotices('order',orderId,run);
  try {
    // Gate and dispatch have deliberately restricted access to the generic order
    // endpoint. Use their own live, authorization-scoped lists instead.
    let o;
    if (app.page === 'gate') {
      const data = await api('/api/gate/dispatch');
      o = [...(data.awaitingDriver || []), ...(data.leaving || []), ...(data.inTransit || [])].find(v => v.id === orderId && (!run || Number(v.dispatch?.run) === run));
    } else if (app.page === 'drivers' || normalizeRole(app.user?.roleCode) === 'dispatch') {
      const data = await api(dspDispatchUrl());
      o = (data.orders || []).find(v => v.id === orderId && Number(v.dispatch?.run || 0) === Number(run || 0));
    } else {
      const det = await api('/api/orders/' + encodeURIComponent(orderId) + (run ? '?run=' + encodeURIComponent(run) : ''));
      o = det.order;
    }
    if (!o) return toast('این محموله دیگر در فهرست جاری نیست.');
    // v37.17.0 — جزئیات هر محموله با پروندهٔ همان سرویس (حتی پس از آرشیوشدن سرویس اول)
    if (run) {
      const all = [...(Array.isArray(o.dispatchRuns) ? o.dispatchRuns : []), ...(o.dispatch ? [o.dispatch] : [])];
      const dRun = all.find((d) => d && d.run === run);
      if (dRun) o = { ...o, dispatch: dRun };
    }
    const store = o.orderType === 'STORE', weightOnly=store||app.page==='gate';
    const items = dspScopedItems(o);
    const merged = new Map();
    for (const i of items) {
      const key = i.productId || i.product?.name || i.id;
      const prev = merged.get(key) || { name: i.product?.name || '—', requested: 0, weight: 0, amount: 0, descriptions: [] };
      prev.requested += Number(i.requestedQty || 0); if(i.description)prev.descriptions.push(i.description); prev.weight += Number(i.deliveredKg || 0); prev.amount += Number(i.finalAmount ?? Math.round(Number(i.deliveredKg || 0) * Number(i.unitPrice || 0))); merged.set(key, prev);
    }
    const rows = [...merged.values()].map((m, idx) => `<tr><td>${fa(String(idx + 1))}</td><td><b>${esc(m.name)}</b></td><td>${qty(m.requested)} کیلوگرم</td><td>${dspKg(m.weight)}</td><td>${esc(m.descriptions.join(' • ')||'—')}</td>${weightOnly ? '' : `<td>${m.amount > 0 ? money(m.amount) : '—'}</td>`}</tr>`).join('');
    const ops = o.storeRunOps || {};
    const labels = { PENDING_SALES: 'منتظر تعیین راننده', DISPATCHED: 'واگذارشده', FINALIZED: 'نهایی‌شده' };
    const opsLine = (sh, label) => sh ? `<div class="dsp-ops-line"><span class="st-run-chip st-run-r${label === 'دوم' ? 2 : 1}">سرویس ${label}</span> وضعیت: <b>${esc(labels[sh.status] || sh.status || '—')}</b>${sh.sentAt ? ` • ارسال انبار: ${esc(formatDateTime24(sh.sentAt))}` : ''}</div>` : '';
    openModal(`جزئیات محموله — ${esc(store ? (o.storeName || 'فروشگاه') : dspCustomer(o))}`, `<div class="dsp-order-details">
      <div class="dsp-delivery-head dsp-detail-head"><div class="dsp-head-cell"><span>${store ? 'فروشگاه' : 'مشتری'}</span><b>${esc(dspCustomer(o))}</b><small>${esc(dspPhone(o) || (o.dispatchPlace || ''))}</small></div><div class="dsp-head-cell"><span>شماره سفارش</span><b>${esc(fa(o.orderNo || '—'))}</b><small>${o.dispatch?.run ? `سرویس ${o.dispatch.run === 2 ? 'دوم' : 'اول'}` : 'محموله تکی'}</small></div></div>
      ${o.dispatch?.driverName ? `<div class="dsp-driver">راننده: <b>${esc(o.dispatch.driverName)}</b> ${plateViewHtml(o.dispatch.driverPlate, '—', true)}</div>` : ''}
      ${store ? opsLine(ops.r1Shipment, 'اول') + opsLine(ops.r2Shipment, 'دوم') : ''}
      ${(o.dispatch?.events?.length) ? `<details class="dsp-log"><summary>سوابق این سفارش</summary><ol>${dspEvents(o.dispatch)}</ol></details>` : ''}
      <div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>محصول</th><th>مقدار درخواستی</th><th>وزن محموله</th><th>توضیحات</th>${weightOnly ? '' : '<th>مبلغ</th>'}</tr></thead><tbody>${rows || `<tr><td colspan="5">قلمی ثبت نشده است.</td></tr>`}</tbody></table></div>
      ${!weightOnly&&o.dispatch?.priceApprovedAt?(store?dspQtyInvoiceMarkup(o,true):dspInvoiceMarkup(o,true)):''}
      ${!weightOnly&&['DELIVERED','SALES_FINALIZED','CLOSED'].includes(o.dispatch?.status)?dspDeliverySummary(o.dispatch,store):''}
      <p class="adm-note">${weightOnly ? 'اقلام و وزن را با بار واقعی تطبیق دهید.' : 'ارزش ریالی فقط برای مشتریان عادی نمایش داده می‌شود.'}</p>
      <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button></div></div>`);
    finishEntityNotices(notices);return true;
  } catch (err) { toast(err.message);return false; }
}
function dspPaymentRows(devices, due){return [{type:'CASH',amount:due}];}
function dspBindPayments(devices, dueFn){
 const host=$('#dspPayRows');if(!host)return;
 const build=r=>{const type=r.querySelector('[data-pay-type]').value,detail=r.querySelector('.dsp-pay-detail');let h='';
  if(type==='POS')h=`<label class="cust-field"><span>دستگاه فعال *</span><select data-device><option value="">انتخاب دستگاه</option>${devices.map(d=>`<option value="${esc(d.id)}">${esc(d.title)} • ${esc(d.bank)} • ${esc(d.terminalNumber)}</option>`).join('')}</select></label><label class="cust-field"><span>شماره پیگیری</span><input data-reference placeholder="اختیاری"></label>`;
  if(type==='CARD_TRANSFER')h='<label class="cust-field"><span>بانک مقصد *</span><input data-bank></label><label class="cust-field"><span>شناسه پیگیری *</span><input data-reference></label>';
  if(type==='CHECK')h='<label class="cust-field"><span>بانک *</span><input data-bank></label><label class="cust-field"><span>شماره چک *</span><input data-check></label><label class="cust-field"><span>سررسید *</span><input type="date" data-due></label>';
  detail.innerHTML=h;detail.hidden=!h;
 };
 const refresh=()=>{let sum=0;host.querySelectorAll('[data-pay-amount]').forEach(x=>sum+=dspParseAmount(x.value));const due=dueFn();$('#dspPaySum').textContent=money(sum);$('#dspPayBalance').textContent=money(due-sum);};
 const bind=()=>host.querySelectorAll('.dsp-pay-row').forEach(r=>{if(r.dataset.bound)return;r.dataset.bound='1';build(r);r.querySelector('[data-pay-type]').onchange=()=>build(r);r.querySelector('[data-pay-amount]').oninput=e=>{const v=String(e.target.value).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,\s]/g,'').replace(/\D/g,'');e.target.value=v?Number(v).toLocaleString('fa-IR'):'';r.dataset.touched='1';refresh();};r.querySelector('[data-pay-del]').onclick=()=>{if(host.querySelectorAll('.dsp-pay-row').length<2)return toast('حداقل یک روش دریافت الزامی است.');r.remove();refresh();};});
 bind();const add=$('#dspPayAdd');if(add)add.onclick=()=>{const r=host.querySelector('.dsp-pay-row').cloneNode(true);r.dataset.bound='';r.querySelector('[data-pay-type]').value='CASH';r.querySelector('[data-pay-amount]').value='';r.querySelector('.dsp-pay-detail').innerHTML='';r.querySelector('.dsp-pay-detail').hidden=true;r.dataset.touched='1';host.appendChild(r);bind();refresh();};
 window.dspRefreshPaymentTotals=refresh;
}
function dspCollectPayments(){return [...document.querySelectorAll('#dspPayRows .dsp-pay-row')].map(r=>{const get=s=>r.querySelector(`[data-${s}]`)?.value||'';return {type:get('pay-type'),amount:dspParseAmount(get('pay-amount')),deviceId:get('device'),reference:get('reference'),bank:get('bank'),checkNumber:get('check'),dueDate:get('due'),reason:get('reason')};});}
function dspParseAmount(value) {
  const ascii=String(value??'').replace(/[۰-۹]/g,(d)=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,\s]/g,'').trim();
  const n=Number(ascii); return Number.isFinite(n)&&n>0?n:0;
}
function dspEvents(d) {
  return (d.events || []).map((e) => `<li><small>${esc(formatDateTime24(e.at))} • ${esc(e.actor)}</small><span>${esc(e.text)}</span></li>`).join('') || '<li><span>رویدادی ثبت نشده است</span></li>';
}
function dspDeliverySummary(d, priceFree = false) {
  const lines = d.lines || [];
  if(priceFree){const sum=k=>lines.reduce((s,l)=>s+Number(l[k]||0),0);return `<div class="dsp-summary"><span>مرجوعی ${dspKg(sum('returnKg'))}</span><span>کسری ${dspKg(sum('shortageKg'))}</span><span>خالص ${dspKg(sum('netKg'))}</span>${d.note?`<small>یادداشت: ${esc(d.note)}</small>`:''}</div>`;}

  const payLabels={CASH:'نقدی',POS:'پوز',CARD_TRANSFER:'کارت‌به‌کارت',CHECK:'چک',CREDIT:'معوق'};
  const paymentRows=(d.settlementMethods||[]).map(m=>`<span>${esc(payLabels[m.type]||m.type)}${m.deviceSnapshot?` • ${esc(m.deviceSnapshot.title)} (${esc(m.deviceSnapshot.terminalNumber)})`:''}${m.checkNumber?` • چک ${esc(m.checkNumber)}`:''}${m.reference?` • پیگیری ${esc(m.reference)}`:''}: <b>${money(m.amount)}</b></span>`).join('');
  const sum = (k) => lines.reduce((s, l) => s + Number(l[k] || 0), 0);
  const gross=Number(d.grossAmount??d.approvedTotalAmount??0);
  const deduction=Number(d.returnDeduction??0);
  const due=Number(d.amountDue??Math.max(0,gross-deduction));
  return `<div class="dsp-summary"><span class="badge ${d.settlementType === 'CASH' ? 'green' : 'blue'}">${DSP_SETTLE[d.settlementType] || '—'}</span>${paymentRows?`<div class="dsp-pay-summary">${paymentRows}</div>`:''}
    <span>${d.fullReturn ? 'مرجوعی کلی' : `مرجوعی ${dspKg(sum('returnKg'))}`}</span><span>کسری ${dspKg(sum('shortageKg'))}</span><span>خالص ${dspKg(sum('netKg'))}</span>
    <span>مبلغ اولیه ${money(gross)}</span><span>کسر مرجوعی ${money(deduction)}</span><b>قابل تسویه ${money(due)}</b>
    ${d.note ? `<small>یادداشت: ${esc(d.note)}</small>` : ''}</div>`;
}

/* ---------- زنده‌سازی ---------- */
function dspBusy() {
  const m = $('#modal'); if (m && m.classList.contains('open')) return true;
  const ae = document.activeElement;
  return !!(ae && $('#content') && $('#content').contains(ae) && /^(SELECT|INPUT|TEXTAREA)$/.test(ae.tagName));
}
// هر چند ثانیه داده را می‌گیرد؛ فقط اگر تغییر کرده باشد صفحه را دوباره می‌سازد
function dspLive(key, fetcher, painter) {
  if (app.timer) clearInterval(app.timer);
  app.timer = setInterval(async () => {
    if (dspBusy()) return;
    try {
      const data = await fetcher();
      const sig = JSON.stringify(data);
      if (sig === dsp.sigs[key]) return;
      if (dspBusy()) return;
      dsp.sigs[key] = sig; painter(data);
    } catch (err) { /* اتصال موقت؛ دفعه‌ی بعد دوباره تلاش می‌شود */ }
  }, DSP_LIVE_MS);
}

// ارسال از کارتابل فروش (صفحه‌ی تسویه)
async function sendToDispatch(orderId, after) {
  const driverId=document.querySelector('[data-stl-driver]')?.value||'';
  if(!driverId) return toast('ابتدا یک رانندهٔ فعال را انتخاب کنید.');
  if(stl.dispatchBusy) return;
  const alreadyApproved=!!stl.order?.dispatch?.priceApprovedAt;
  if(!alreadyApproved){
    const errors=stlValidateDispatch();
    stlShowErrors(errors);
    if(errors.length) return;
  }
  stl.dispatchBusy=true;
  try {
    const isReassignment=alreadyApproved;
    const path=isReassignment?`/api/dispatch/orders/${orderId}/assign`:`/api/orders/${orderId}/send-dispatch`;
    const items=stl.items.filter((it)=>!it.voided).map((it)=>({
      itemId:it.id, unitPrice:it.outOfStock?0:Number(it.price||0), cancelled:!!it.skip,
    }));
    const body={driverId,...(isReassignment?{}:{items,discountAmount:stl.discountAmount,additionsAmount:stl.additionsAmount})};
    await api(path, { method: 'POST', body: JSON.stringify(body) });
    if(app.salesCache)app.salesCache.fetchedAt=0;
    if(app.salesFetchPromise)await app.salesFetchPromise.catch(()=>{});
    if(app.salesCache)app.salesCache.fetchedAt=0;
    await refreshIndicators();
    toast(isReassignment?'تخصیص راننده در کارتابل فروش ثبت شد.':'قیمت‌ها تأیید شد و سفارش به راننده تخصیص یافت؛ راننده وزن و مبلغ را می‌بیند.');
    if (after) await after();
  } catch (err) { toast(err.message); }
  finally { stl.dispatchBusy=false; }
}

function dspRosterMarkup(drivers=[]) {
  if(!drivers.length) return '';
  const rows=drivers.map(d=>{
    const live=Array.isArray(d.liveOrders)?d.liveOrders:[];
    const orderRows=live.map(o=>`<tr><td data-label="مشتری">${esc(o.customerName||'—')}</td><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="آخرین تغییر">${esc(formatDateTime24(o.updatedAt||o.deliveredAt))}</td><td data-label="وضعیت">${dspBadge(o.status)}</td></tr>`).join('');
    const orders=orderRows?`<div class="bt-table-wrap"><table class="bt-table dsp-roster-orders-table"><caption class="bt-caption">سفارش‌های فعال ${esc(d.fullName||'راننده')}</caption><thead><tr><th scope="col">مشتری</th><th scope="col">شماره سفارش</th><th scope="col">آخرین تغییر</th><th scope="col">وضعیت</th></tr></thead><tbody>${orderRows}</tbody></table></div>`:'سفارش فعالی ندارد.';
    const contacts=(d.phone||d.posTerminal||d.posBank)?`<div class="dsp-roster-foot">${d.phone?`<span><small>تماس راننده</small>${driverPhoneHtml(d.phone)}</span>`:''}${(d.posTerminal||d.posBank)?`<span><small>پایانهٔ پوز</small>${driverPosHtml(d)}</span>`:''}</div>`:'—';
    return `<tr data-driver="${esc(d.id||'')}"><td data-label="راننده"><strong>${esc(d.fullName||'—')}</strong><span class="dsp-active-pill">فعال</span></td><td data-label="وسیله و پلاک">${esc(d.vehicleType||'وسیله نامشخص')}${plateViewHtml(d.plate,'—',true)}</td><td data-label="سفارش فعال">${fa(d.activeOrderCount||0)}</td><td data-label="منتظر نگهبانی">${fa(d.waitingGateCount||0)}</td><td data-label="در مسیر">${fa(d.inTransitCount||0)}</td><td data-label="تحویل امروز">${fa(d.deliveredTodayCount||0)}</td><td data-label="تماس و پوز">${contacts}</td><td data-label="سفارش‌ها">${orders}</td></tr>`;
  }).join('');
  return `<section class="dsp-roster" aria-live="polite"><div class="dsp-roster-head"><div><h3>رانندگان فعال و وضعیت زندهٔ سفارش‌ها</h3><p>مشخصات خودرو و آخرین وضعیت سفارش‌های تخصیص‌یافته؛ به‌روزرسانی خودکار هر ۴ ثانیه</p></div><span>${fa(drivers.length)} رانندهٔ فعال</span></div><div class="bt-table-wrap"><table class="bt-table dsp-roster-table"><caption class="bt-caption">رانندگان فعال و سفارش‌های آن‌ها</caption><thead><tr><th scope="col">راننده</th><th scope="col">وسیله و پلاک</th><th scope="col">سفارش فعال</th><th scope="col">منتظر نگهبانی</th><th scope="col">در مسیر</th><th scope="col">تحویل امروز</th><th scope="col">تماس و پوز</th><th scope="col">سفارش‌ها</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

/* ---------- کارتابل واحد پخش ---------- */
const dspDispatchUrl = () => `/api/dispatch/orders?status=${dsp.tab}`;
async function renderDispatchPage(resetToPending = false) {
  if (resetToPending) dsp.tab = 'pending';
  const host=$('#transportDispatch');
  if(!host)return;
  const data = await api(dspDispatchUrl());
  if($('#transportDispatch')!==host)return;
  dsp.sigs.dispatch = JSON.stringify(data);
  paintDispatch(data);
  dspLive('dispatch', () => api(dspDispatchUrl()), (d) => {if($('#transportDispatch')===host)paintDispatch(d);});
}
function paintDispatch(data) {
  const host=$('#transportDispatch');if(!host)return;
  dsp.orders = data.orders; dsp.counts = data.counts || {}; dsp.drivers = data.drivers || [];
  const tabs = [['pending', 'ورودی', 'pending'], ['assigned', 'تخصیص‌یافته', 'assigned'], ['delivered', 'تحویل‌شده', 'delivered']];
  const cards = dsp.orders.map(dspDispatchCard).join('');
  const drivers=Array.isArray(data.drivers)?data.drivers:[];
  const driverWarning = drivers.length ? '' : `<div class="dsp-driver-warning" role="status"><b>رانندهٔ فعالی ثبت نشده است.</b> تا زمان فعال‌سازی راننده در «ترابری ← رانندگان»، سفارش‌ها در انتظار تخصیص می‌مانند.</div>`;
  host.innerHTML = admHead('send', 'واحد پخش', 'گزارش لحظه‌ای سفارش‌های پخش و رانندگان فعال؛ تخصیص راننده همچنان از کارتابل فروش انجام می‌شود.', dsp.orders.length)
    + dspRosterMarkup(drivers)
    + `<nav class="sd-tabs dsp-tabs" aria-label="وضعیت سفارش‌های پخش">${tabs.map(([k, l, c]) => `<button type="button" class="sd-tab ${dsp.tab === k ? 'active' : ''}" data-dsp="tab" data-tab="${k}"><span class="sd-tab-copy"><strong>${l}</strong><small>${fa(dsp.counts[c] ?? 0)} سفارش</small></span></button>`).join('')}</nav>`
    + driverWarning + dspDispatchTable(cards) + `</section>`;
  host.onclick = dspDispatchClick;
}
function dspDispatchCard(o) {
 const d=o.dispatch||{};
 return `<tr class="dsp-dispatch-row" data-order="${esc(o.id)}"><td data-label="مشتری / فروشگاه"><span class="bt-cell-main">${esc(dspCustomer(o))}</span></td><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="تاریخ">${esc(formatDateTime24(o.createdAt))}</td><td data-label="وضعیت">${dspBadge(d.status)}</td><td data-label="اقلام">${qty(dspScopedItems(o).length)} قلم</td><td data-label="راننده">${esc(d.driverName||'تعیین نشده')}</td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-secondary btn-sm" data-dsp="details" data-id="${esc(o.id)}" data-run="${d.run||''}">جزئیات محموله</button></td></tr>`;
}
function dspDispatchTable(rows){
 return `<div class="bt-table-wrap"><table class="bt-table dsp-dispatch-table"><caption class="bt-caption">سفارش‌های پخش</caption><thead><tr><th scope="col">مشتری / فروشگاه</th><th scope="col">شماره سفارش</th><th scope="col">تاریخ</th><th scope="col">وضعیت</th><th scope="col">اقلام</th><th scope="col">راننده</th><th scope="col">عملیات</th></tr></thead><tbody>${rows||'<tr><td colspan="7">سفارشی در این بخش نیست.</td></tr>'}</tbody></table></div>`;
}
async function dspDispatchClick(e) {
  const el = e.target.closest('[data-dsp]'); if (!el) return;
  if (el.dataset.dsp === 'tab') { dsp.tab = el.dataset.tab; return renderDispatchPage(); }
  if (el.dataset.dsp === 'details') return dspOrderDetails(el.dataset.id, Number(el.dataset.run)||null);
}

/* ---------- کارتابل راننده ---------- */
async function renderDriverPage() {
  const data = await api('/api/driver/orders');
  dsp.sigs.driver = JSON.stringify(data);
  dsp.driverData=data;
  paintDriver(data);
  dspLive('driver', () => api('/api/driver/orders'), (d) => {dsp.driverData=d;paintDriver(d);});
}
function paintDriver(data) {
  const d = data.driver||{};
  dsp.driverData=data;dsp.open = data.open||[];
  const assigned=data.assigned||dsp.open.filter(o=>['ASSIGNED','DRIVER_EXIT_REPORTED'].includes(o.dispatch?.status));
  const inTransit=data.inTransit||dsp.open.filter(o=>o.dispatch?.status==='IN_TRANSIT');
  const delivered=data.delivered||((data.todayDone||[]).filter(o=>o.dispatch?.status==='DELIVERED'));
  const history=data.history||((data.todayDone||[]).filter(o=>['SALES_FINALIZED','CLOSED'].includes(o.dispatch?.status)));
  const sections={assigned:{label:'واگذار شده',orders:assigned,render:dspDriverCard,empty:'سفارشی به شما واگذار نشده است.'},inTransit:{label:'در حال ارسال',orders:inTransit,render:dspDriverCard,empty:'سفارشی در مسیر ندارید.'},delivered:{label:'تحویل شده',orders:delivered,render:dspDoneCard,empty:'تحویلی ثبت نشده است.'},history:{label:'سوابق',orders:history,render:dspDoneCard,empty:'سابقه‌ای برای نمایش وجود ندارد.'}};
  if(!sections[dsp.driverTab])dsp.driverTab='assigned';
  const current=sections[dsp.driverTab];
  const info = `${d.fullName||'راننده'} • ${d.phone ? fa(d.phone) + ' • ' : ''}${d.vehicleType || 'خودرو نامشخص'} • پلاک ${formatDispatchVehiclePlate(d.plate)} • پوز ${driverPosText(d)}`;
  const nav=`<nav class="sd-tabs dsp-driver-tabs" aria-label="وضعیت سفارش‌های راننده" dir="rtl">${Object.entries(sections).map(([key,section])=>`<button type="button" class="sd-tab ${dsp.driverTab===key?'active':''}" data-dsp-driver-tab="${key}"><span class="sd-tab-index">${fa(String(Object.keys(sections).indexOf(key)+1).padStart(2,'0'))}</span><span class="sd-tab-copy"><strong>${section.label}</strong><small>${fa(section.orders.length)} سفارش</small></span><b class="sd-tab-count ${section.orders.length>0?'show':''}">${section.orders.length?fa(section.orders.length):''}</b></button>`).join('')}</nav>`;
  const historyHint=dsp.driverTab==='history'&&Number(data.historyTotal)>history.length?`<p class="dsp-history-hint">نمایش ${fa(history.length)} سابقهٔ اخیر از ${fa(data.historyTotal)} مورد.</p>`:'';
  $('#content').innerHTML = admHead('truck', 'کارتابل راننده', info, current.orders.length)
    + nav + `<section class="sd-panel adm-panel dsp-driver-stage"><div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico">${icon(dsp.driverTab==='delivered'||dsp.driverTab==='history'?'receipt':'truck',20)}</span><div><h2>${current.label}</h2><p>${dsp.driverTab==='assigned'?'سفارش‌های واگذارشده و در انتظار اعلام خروج.':dsp.driverTab==='inTransit'?'سفارش‌هایی که خروج آن‌ها تأیید شده و در مسیر مشتری هستند.':dsp.driverTab==='delivered'?'تحویل‌های ثبت‌شده که در انتظار بررسی نهایی فروش هستند.':'سابقهٔ سفارش‌های نهایی‌شده.'}</p></div></div><div class="sd-count"><strong>${fa(current.orders.length)}</strong><span>سفارش</span></div></div>${historyHint}${dspDriverTable(current.orders.map(current.render).join(''),current.empty)}</section>`;
  $('#content').onclick = dspDriverClick;
}
function dspDriverCard(o) { // v37.27.0 — کارت فشردهٔ تک‌ردیفی؛ جزئیات کامل داخل پنجرهٔ «جزئیات محموله»
  const d = o.dispatch;
  const storeFree = dspPriceFree(o);
  const items = dspScopedItems(o);
  const totalKg = items.reduce((sm, i) => sm + Number(i.deliveredKg ?? i.requestedQty ?? 0), 0);
  const summary = `<span class="dsp-card-meta">${qty(items.length)} قلم</span><span class="dsp-card-meta">جمع وزن <b>${dspKg(totalKg)}</b></span>${storeFree ? '' : `<span class="dsp-card-meta">قابل تسویه <b>${money(Number(d.amountDue ?? d.approvedTotalAmount ?? 0))}</b></span>`}`;
  const detailsBtn = `<button type="button" class="btn btn-secondary btn-sm" data-dsp="details" data-id="${esc(o.id)}" data-run="${d.run || ''}">${icon('eye', 14)} جزئیات محموله</button>`;
  const action = (d.status === 'ASSIGNED' && !d.priceApprovedAt && !storeFree)
    ? '<span class="dsp-wait dsp-wait-inline" role="status">منتظر تأیید قیمت فروش</span>'
    : d.status === 'ASSIGNED'
      ? `<button class="btn btn-primary btn-sm" type="button" data-dsp="driver-exit" data-id="${esc(o.id)}">${icon('check', 16)} تأیید دریافت سفارش و اعلام خروج</button>`
      : d.status === 'DRIVER_EXIT_REPORTED'
      ? '<span class="dsp-wait dsp-wait-inline" role="status">خروج ثبت شد؛ منتظر تأیید نگهبان</span>'
      : `<button class="btn btn-success btn-sm" type="button" data-dsp="deliver" data-id="${esc(o.id)}">${icon('check', 16)} ثبت تحویل به مشتری</button>`;
  return `<tr class="dsp-driver-row" data-order="${esc(o.id)}">
    <td data-label="مشتری / فروشگاه"><span class="bt-cell-main">${esc(dspCustomer(o))}</span>${o.orderType==='STORE'?`<span class="dsp-store-customer-box"><small>نام مشتری</small><strong>${esc(o.customer?.name||'—')}</strong></span>`:`<span class="bt-cell-sub" dir="ltr">${esc(dspPhone(o))}</span>`}${o.customer?.plate?plateViewHtml(o.customer.plate,'—',true):''}</td>
    <td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="وضعیت">${dspBadge(d.status)}</td>
    <td data-label="تاریخ سفارش"><span class="dsp-order-date">تاریخ سفارش: ${esc(formatDateTime24(o.createdAt))}</span></td>
    <td data-label="خلاصه"><div class="dsp-table-summary">${summary}</div></td>
    <td data-label="عملیات" class="bt-col-actions"><div class="dsp-table-actions">${detailsBtn}${action}</div></td>
  </tr>`;
}
function dspDoneCard(o) {
 const d=o.dispatch||{};
 return `<tr class="dsp-driver-row" data-order="${esc(o.id)}"><td data-label="مشتری / فروشگاه"><span class="bt-cell-main">${esc(dspCustomer(o))}</span></td><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="وضعیت">${dspBadge(d.status)}</td><td data-label="تاریخ سفارش"><span class="dsp-order-date">تاریخ سفارش: ${esc(formatDateTime24(o.createdAt))}</span></td><td data-label="خلاصه"><span class="dsp-delivered-date">تاریخ تحویل: ${esc(formatDateTime24(d.deliveredAt))}</span><span class="bt-cell-sub">${qty(dspScopedItems(o).length)} قلم</span></td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-secondary btn-sm" data-dsp="details" data-id="${esc(o.id)}" data-run="${d.run||''}">جزئیات محموله</button></td></tr>`;
}
function dspDriverTable(rows,empty){
 return `<div class="bt-table-wrap"><table class="bt-table dsp-driver-table"><caption class="bt-caption">سفارش‌های راننده</caption><thead><tr><th scope="col">مشتری / فروشگاه</th><th scope="col">شماره سفارش</th><th scope="col">وضعیت</th><th scope="col">تاریخ سفارش</th><th scope="col">خلاصه</th><th scope="col">عملیات</th></tr></thead><tbody>${rows||`<tr><td colspan="6">${esc(empty)}</td></tr>`}</tbody></table></div>`;
}
async function dspDriverClick(e) {
  const tab=e.target.closest('[data-dsp-driver-tab]');
  if(tab){dsp.driverTab=tab.dataset.dspDriverTab;if(dsp.driverData)paintDriver(dsp.driverData);return;}
  const el = e.target.closest('[data-dsp]'); if (!el) return;
  if (el.dataset.dsp === 'deliver') return openDeliveryForm(el.dataset.id);
  if (el.dataset.dsp === 'details') return dspOrderDetails(el.dataset.id, Number(el.dataset.run) || null);
  if (el.dataset.dsp === 'driver-exit') {
    el.disabled=true;
    try {
      await api(`/api/driver/orders/${el.dataset.id}/exit`, { method: 'POST', body: '{}' });
      toast('خروج سفارش ثبت شد؛ پس از تأیید نگهبان، ثبت تحویل در مقصد فعال می‌شود.');
      await renderDriverPage();
    } catch (err) { toast(err.message); el.disabled=false; }
  }
}

/* ---------- فرم ثبت تحویل: امضا، تسویه، مرجوعی کلی یا قلم‌به‌قلم، کسری ---------- */
async function openDeliveryForm(orderId) {
  const o = dsp.open.find((x) => x.id === orderId);
  if (!o) return toast('سفارش پیدا نشد؛ صفحه را تازه کنید.');
  const priceFree = dspPriceFree(o); // v37.6.0 — فلوی فروشگاه بدون قیمت
  if (!priceFree && !o.dispatch?.priceApprovedAt) return toast('قیمت‌های سفارش هنوز توسط فروش تأیید نشده است.');
  let payDevices=[]; if (!priceFree) { try { payDevices=(await api('/api/payment-devices')).devices||[]; } catch(e) { return toast('فهرست دستگاه‌های پرداخت دریافت نشد.'); } }
  const items = dspScopedItems(o); // v37.17.0 — فرم تحویل فقط اقلام همین محموله
  // v37.29.0 — مرجوعی/کسری/علت داخل همان فهرست اقلام تحویلی است، نه بخش جدا
  const totalKgAll = items.reduce((s, i) => s + Number(i.deliveredKg || 0), 0);
  const lines = items.map((i, idx) => {
    const price=Number(i.unitPrice||0), weight=Number(i.deliveredKg||0);
    return `<tr data-line="${esc(i.id)}"><td>${fa(String(idx + 1))}</td><td><b>${esc(i.product?.name||'—')}</b></td><td>${dspKg(weight)}</td>${priceFree ? '' : `<td>${money(price)} / کیلو</td><td><strong>${money(i.finalAmount??Math.round(weight*price))}</strong><small class="dsp-line-ded">کسر: <b data-return-deduction="${esc(i.id)}">${money(0)}</b></small></td>`}<td><input inputmode="decimal" data-f="returnKg" data-id="${esc(i.id)}" value="0" aria-label="مرجوعی (کیلو)"></td><td><input inputmode="decimal" data-f="shortageKg" data-id="${esc(i.id)}" value="0" aria-label="کسری (کیلو)"></td><td><input maxlength="300" data-f="reason" data-id="${esc(i.id)}" placeholder="علت (در صورت مرجوعی/کسری)" aria-label="علت مرجوعی یا کسری"></td></tr>`;
  }).join('');
  const itemsTable = `<section class="dsp-block dsp-deliver-block"><div class="dsp-returns-head"><h4>${priceFree ? 'اقلام تحویلی (سند وزنی — بدون مبلغ)' : 'اقلام تحویلی'}</h4><span class="badge ${priceFree ? 'green' : (o.dispatch?.priceApprovedAt ? 'green' : 'orange')}">${priceFree ? 'فلوی فروشگاه' : (o.dispatch?.priceApprovedAt ? 'تأیید فروش' : 'در انتظار تأیید')}</span><label class="adm-check"><input type="checkbox" id="dspFull"> مرجوعی کلی سفارش (همهٔ اقلام برمی‌گردد)</label></div>
    <label class="cust-field" id="dspFullReasonWrap" hidden><span>علت مرجوعی کلی *</span><input id="dspFullReason" maxlength="300"></label>
    <div id="dspLines"><div class="table-wrap dsp-deliver-table-wrap"><table class="table dsp-deliver-table"><thead><tr><th>#</th><th>قلم</th><th>وزن تحویلی</th>${priceFree ? '' : '<th>قیمت هر کیلو</th><th>مبلغ قلم</th>'}<th>مرجوعی (کیلو)</th><th>کسری (کیلو)</th><th>علت مرجوعی یا کسری</th></tr></thead><tbody>${lines || `<tr><td colspan="${priceFree ? 6 : 8}">قلمی برای تحویل وجود ندارد.</td></tr>`}</tbody><tfoot><tr><td colspan="2">جمع وزن محموله</td><td><b>${dspKg(totalKgAll)}</b></td>${priceFree ? '' : `<td></td><td><b>${money(Number(o.dispatch?.approvedTotalAmount ?? items.reduce((s, i) => s + Number(i.finalAmount ?? Math.round(Number(i.deliveredKg || 0) * Number(i.unitPrice || 0))), 0)))}</b></td>`}<td colspan="3"></td></tr></tfoot></table></div></div>
    <p class="adm-note">${priceFree ? 'مرجوعی و کسری هر قلم را در همان ردیف خودش بنویسید؛ وزن مرجوعی از وزن سند تحویل کسر می‌شود و کسری وزن فقط ثبتی است.' : 'مرجوعی و کسری هر قلم را در همان ردیف خودش بنویسید؛ فقط وزن مرجوعی از مبلغ قلم و مبلغ نهایی کسر می‌شود و کسری وزن اثری بر مبلغ ندارد.'}</p></section>`;
  const approvedTotal=Number(o.dispatch.approvedTotalAmount||0);
  const body = `<div class="dsp-deliver">
    <div class="dsp-delivery-head"><div class="dsp-head-cell"><span>${o.orderType==='STORE'?'فروشگاه':'مشتری'}</span><b>${esc(dspCustomer(o))}</b><small>${esc(dspPhone(o))}</small></div><div class="dsp-head-cell"><span>شماره سفارش</span><b>${esc(fa(o.orderNo||'—'))}</b><small>${priceFree ? 'تحویل محموله (بدون تسویه مالی)' : 'تحویل و تسویه'}</small></div><div class="dsp-head-cell"><span>راننده / خودرو</span><b>${esc(o.dispatch.driverName||'—')}</b><small>${plateViewHtml(o.dispatch.driverPlate, '—', true)}</small></div></div>
    ${itemsTable}
    ${priceFree ? '' : `<section class="dsp-payable-preview"><div><span>مبلغ اولیهٔ فاکتور</span><b>${money(approvedTotal)}</b></div><div><span>کسر مرجوعی</span><b id="dspReturnDeduction">${money(0)}</b></div><div class="dsp-payable-final"><span>مبلغ قابل تسویه</span><strong id="dspPayableAmount">${money(approvedTotal)}</strong></div><small>کسری وزن فقط ثبت می‌شود و به‌تنهایی مبلغ را کاهش نمی‌دهد.</small></section>`}
    ${priceFree ? '' : `<section class="dsp-block"><h4>روش‌های دریافت وجه *</h4><p class="adm-note">پرداخت ترکیبی مجاز است؛ جمع مبالغ باید با مبلغ قابل تسویه برابر باشد.</p><div id="dspPayRows"><div class="dsp-pay-row"><label class="cust-field"><span>روش دریافت</span><select data-pay-type><option value="CASH">نقدی</option><option value="POS">پوز</option><option value="CARD_TRANSFER">کارت‌به‌کارت</option><option value="CHECK">چک</option><option value="CREDIT">معوق</option></select></label><label class="cust-field"><span>مبلغ (ریال)</span><input inputmode="numeric" data-pay-amount value="${Number(approvedTotal).toLocaleString('fa-IR')}"></label><div class="dsp-pay-detail"></div><button type="button" class="btn btn-secondary btn-sm" data-pay-del>حذف</button></div></div><button type="button" class="btn btn-secondary btn-sm" id="dspPayAdd">＋ افزودن روش پرداخت</button><div class="dsp-pay-summary">جمع پرداخت: <b id="dspPaySum">${money(approvedTotal)}</b>　•　مانده: <b id="dspPayBalance">${money(0)}</b></div></section>`}
    <label class="cust-field"><span>یادداشت تحویل</span><input name="note" maxlength="500"></label>
  </div>`;
  openModal(`ثبت تحویل — سفارش ${o.orderNo || ''}`, admModalForm('dspDeliverForm', body, priceFree ? 'ثبت تحویل محموله' : 'ثبت تحویل و ثبت تسویه'));
  const modalCard=$('#modal .modal-card'); if(modalCard) modalCard.classList.add('dsp-delivery-modal-card');
  admBindClose();
  const full = $('#dspFull');
  const getField=(name,id)=>$('#dspDeliverForm')?.querySelector(`[data-f="${name}"][data-id="${CSS.escape(id)}"]`)?.value??'';
  const refreshAmounts=()=>{
    if (priceFree) return; // v37.6.0 — فلوی فروشگاه بدون مبالغ است
    const deduction=full.checked?approvedTotal:items.reduce((sum,i)=>sum+dspParseAmount(getField('returnKg',i.id))*Number(i.unitPrice||0),0);
    const due=Math.max(0,approvedTotal-deduction);
    const deductionNode=$('#dspReturnDeduction'), dueNode=$('#dspPayableAmount');
    if(deductionNode) deductionNode.textContent=money(deduction);
    if(dueNode) dueNode.textContent=money(due);
    const firstPay=$('#dspPayRows .dsp-pay-row');if(firstPay&&!firstPay.dataset.touched&&$('#dspPayRows .dsp-pay-row').length===1){const amount=firstPay.querySelector('[data-pay-amount]');if(amount)amount.value=Number(due).toLocaleString('fa-IR');}
    window.dspRefreshPaymentTotals?.();
    items.forEach((i)=>{const el=$(`[data-return-deduction="${CSS.escape(i.id)}"]`); if(el)el.textContent=money(full.checked?Math.round(Number(i.deliveredKg||0)*Number(i.unitPrice||0)):Math.round(dspParseAmount(getField('returnKg',i.id))*Number(i.unitPrice||0)));});
  };
  dspBindPayments(payDevices,()=>Math.max(0,approvedTotal-(full.checked?approvedTotal:items.reduce((sum,i)=>sum+dspParseAmount(getField('returnKg',i.id))*Number(i.unitPrice||0),0))));
  full.addEventListener('change', () => {
    $('#dspFullReasonWrap').hidden = !full.checked;
    $('#dspLines').hidden = full.checked;
    refreshAmounts();
  });
  $('#dspDeliverForm').addEventListener('input',(e)=>{if(e.target.matches('[data-f="returnKg"]'))refreshAmounts();});
  $('#dspDeliverForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fail = (m) => { $('#admFormMsg').textContent = m; };
    const form = e.target;
    let settlementMethods=dspCollectPayments();
    const payable=approvedTotal-(full.checked?approvedTotal:items.reduce((sum,i)=>sum+dspParseAmount(getField('returnKg',i.id))*Number(i.unitPrice||0),0));
    if(payable===0)settlementMethods=[];
    if(payable>0&&(!settlementMethods.length||settlementMethods.some(x=>!x.type||x.amount<=0)))return fail('روش و مبلغ معتبر را برای همه ردیف‌های دریافت وارد کنید.');
    if(settlementMethods.reduce((s,x)=>s+x.amount,0)!==payable)return fail('جمع روش‌های پرداخت باید دقیقاً برابر مبلغ قابل تسویه باشد.');
    if(settlementMethods.some(x=>x.type==='POS'&&!x.deviceId))return fail('برای پرداخت پوز، دستگاه فعال را انتخاب کنید.');
    if(settlementMethods.some(x=>x.type==='CARD_TRANSFER'&&(!x.bank||!x.reference)))return fail('برای کارت‌به‌کارت، بانک مقصد و شناسه پیگیری الزامی است.');
    if(settlementMethods.some(x=>x.type==='CHECK'&&(!x.bank||!x.checkNumber||!x.dueDate)))return fail('برای چک، بانک، شماره و سررسید الزامی است.');
    const settlementType=settlementMethods.some(x=>x.type==='CREDIT')?'CREDIT':'CASH';
    const fullReturn = full.checked;
    const fullReason = $('#dspFullReason').value.trim();
    if (fullReturn && !fullReason) return fail('علت مرجوعی کلی را بنویسید.');
    const field = (name, id) => form.querySelector(`[data-f="${name}"][data-id="${CSS.escape(id)}"]`)?.value ?? '';
    const payload = {
      settlementType, settlementMethods, fullReturn,
      note: form.querySelector('[name="note"]').value || '',
      lines: items.map((i) => ({
        itemId: i.id,
        returnKg: fullReturn ? 0 : field('returnKg', i.id),
        shortageKg: fullReturn ? 0 : field('shortageKg', i.id),
        reason: fullReturn ? fullReason : field('reason', i.id),
      })),
    };
    const btn = form.querySelector('[type="submit"]'); if (btn) btn.disabled = true;
    try {
      await api(`/api/driver/orders/${o.id}/deliver`, { method: 'POST', body: JSON.stringify(payload) });
      toast('تحویل ثبت شد و برای بازبینی و تأیید نهایی به واحد فروش ارسال شد.'); closeModal(); renderDriverPage();
    } catch (err) { fail(err.message); if (btn) btn.disabled = false; }
  });
}

function dspBindSignature() {
  dsp.sig?.dispose?.();const c=$('#dspSig');if(!c)return;
  dsp.sig=btSignaturePad(c,ink=>{const text=$('#dspSigState');if(text)text.textContent=ink?'امضا ثبت شد.':'با انگشت یا ماوس امضا کنید.';});
  $('#dspSigClear').addEventListener('click',()=>dsp.sig.clear());
}

/* ---------- نگهبانی: خروج ارسالی و خروج نهایی ---------- */
async function renderGateDispatchPage() {
  const data = await api('/api/gate/dispatch');
  dsp.sigs.gate = JSON.stringify(data);
  paintGateDispatch(data);
  dspLive('gate', () => api('/api/gate/dispatch'), (d) => paintGateDispatch(d));
}
function gateDispatchCard(o, action = '') {
 const d=o.dispatch||{};
 const service=o.gateStoreService?(o.storeOrderKind==='PARTIAL'?'سفارش جزئی':`سرویس ${d.run===2?'دوم':'اول'}`):'—';
 const actions=o.gateTransportShipment?`<button type="button" class="btn btn-secondary btn-sm" data-gate="details" data-id="${esc(o.id)}">جزئیات اقلام</button><button type="button" class="btn btn-primary btn-sm" data-gate="transport-exit" data-id="${esc(o.id)}">ثبت خروج پخش</button>`:o.gateStoreService?`<button type="button" class="btn btn-secondary btn-sm" data-gate="store-details" data-id="${esc(o.id)}" data-run="${d.run}">جزئیات محموله</button>${action==='exit'?`<button type="button" class="btn btn-primary btn-sm" data-gate="store-exit" data-id="${esc(o.id)}" data-run="${d.run}">تأیید خروج سرویس</button>`:''}`:`<button type="button" class="btn btn-secondary btn-sm" data-gate="details" data-id="${esc(o.id)}" data-run="${Number(d.run)||0}">جزئیات محموله</button>${action==='exit'?`<button class="btn btn-primary btn-sm" type="button" data-gate="exit" data-id="${esc(o.id)}">تأیید خروج راننده</button>`:''}`;
 const statusHtml=o.gateTransportShipment?'<span class="badge orange">آماده ثبت خروج نگهبان</span>':o.gateStoreService?'<span class="badge purple">منتظر تأیید خروج نگهبانی</span>':dspBadge(d.status);
 return `<tr data-order="${esc(o.id)}"><td data-label="مشتری / فروشگاه">${esc(dspCustomer(o))}${o.orderType==='STORE'?'<span class="badge green">فروشگاه — بدون مبلغ</span>':''}</td><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="تاریخ ثبت">${esc(formatDateTime24(o.createdAt))}</td><td data-label="وضعیت">${statusHtml}</td><td data-label="اقلام">${qty(o.gateStoreService?(d.lines||[]).length:dspScopedItems(o).length)} قلم</td><td data-label="سرویس">${service}</td><td data-label="راننده و پلاک"><span>${esc(d.driverName||'—')}</span>${plateViewHtml(d.driverPlate,'—',true)}</td><td data-label="عملیات" class="bt-col-actions"><div class="gate-legacy-actions">${actions}</div></td></tr>`;
}
function gateLegacyTable(rows){
 if(!rows)return '';
 return `<div class="bt-table-wrap"><table class="bt-table gate-legacy-table"><caption class="bt-caption">فهرست خروج پخش نگهبانی</caption><thead><tr><th scope="col">مشتری / فروشگاه</th><th scope="col">شماره سفارش</th><th scope="col">تاریخ ثبت</th><th scope="col">وضعیت</th><th scope="col">اقلام</th><th scope="col">سرویس</th><th scope="col">راننده و پلاک</th><th scope="col">عملیات</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function gateHomeDispatchMarkup(data) {
  const leaving = data.leaving || [];
  if (!leaving.length) return '';
  return `<section class="sd-panel gate-dispatch-home" aria-live="polite" aria-label="خروج‌های آماده ثبت در نگهبانی">
    <div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico" style="background:var(--orange-bg);color:var(--orange)">${icon('fingerprint',20)}</span><div><h2>آماده ثبت خروج در نگهبانی</h2><p>خروج سفارش پخش را در همین بخش ثبت کنید؛ سفارش برای ثبت پرداختی در کارتابل فروش دیده می‌شود.</p></div></div><div class="sd-count"><strong>${fa(leaving.length)}</strong><span>اقدام</span></div></div>
    <div class="gate-dispatch-home-group"><div class="adm-list dsp-list">${gateLegacyTable(leaving.map((o) => gateDispatchCard(o, 'exit')).join(''))}</div></div>
    <div class="gate-dispatch-home-footer"><button type="button" class="btn btn-secondary" data-sub="gate:dispatch">مشاهدهٔ وضعیت پخش پیش از تحویل</button></div>
  </section>`;
}
// کارتابل نگهبانی — سربرگ تحویل راننده: چهار ستون عمودی کنار هم (راهنما + سه ستون وضعیت)
function gateDispatchMarkup(data) {
  const awaitingDriver = data.awaitingDriver || [];
  const leaving = data.leaving || [];
  const inTransit = data.inTransit || [];
  const total = awaitingDriver.length + leaving.length + inTransit.length;
  const section = (title, desc, list, render, num) => `<section class="sd-panel adm-panel dsp-gate-sec gate-dispatch-col"><header class="gate-dispatch-col-head"><div><span class="sales-delivery-column-index">${fa(String(num).padStart(2, '0'))}</span><h2>${title}</h2></div><span class="sd-count"><strong>${fa(list.length)}</strong><span>مورد</span></span></header><p class="gate-dispatch-col-desc">${desc}</p><div class="adm-list dsp-list gate-dispatch-col-list">${gateLegacyTable(list.map(render).join('')) || sdEmpty('truck', 'موردی نیست', '')}</div></section>`;
  return `<div class="gate-dispatch-board" dir="rtl">`
    + `<section class="sd-panel adm-panel dsp-gate-sec gate-dispatch-col gate-dispatch-guide"><header class="gate-dispatch-col-head"><div><span class="sales-delivery-column-index gate-dispatch-guide-ico">${icon('fingerprint', 15)}</span><h2>ثبت خروج راننده و پخش</h2></div><span class="sd-count"><strong>${fa(total)}</strong><span>مورد</span></span></header><div class="gate-dispatch-guide-body"><p>نگهبان خروج را در همین سربرگ ثبت می‌کند؛ برای سفارش پخش جدید، تأیید جداگانه لازم نیست.</p><ol><li>برای فاکتور آمادهٔ پخش، بار را کنترل و «ثبت خروج پخش» را بزنید.</li><li>سفارش‌های گردش قدیمی نیز در همین فهرست قابل ثبت خروج هستند.</li><li>پس از ثبت، پیگیری پرداختی سفارش در کارتابل فروش انجام می‌شود.</li></ol></div></section>`
    + section('در انتظار اقدام راننده', 'پس از تخصیص، راننده در گردش قدیمی خروج را در کارتابل خود اعلام می‌کند.', awaitingDriver, (o) => gateDispatchCard(o), 2)
    + section('آماده ثبت خروج نگهبانی', 'خروج سفارش پخش یا خروج اعلام‌شدهٔ راننده را ثبت کنید؛ بررسی پرداختی در کارتابل فروش انجام می‌شود.', leaving, (o) => gateDispatchCard(o, 'exit'), 3)
    + section('در حال ارسال به مشتری', 'خروج ثبت شده است؛ ثبت روش پرداخت و مرجوعی بر عهدهٔ فروش است.', inTransit, (o) => gateDispatchCard(o), 4)
    + '</div>';
}
function updateGateDispatchInCartable(data) {
  const home = $('#gateHomeDispatch');
  if (home) home.innerHTML = gateHomeDispatchMarkup(data);
  const full = $('#gateDispatchPanel');
  if (full) full.innerHTML = app.sub.gate==='dispatch' && typeof gateDispatchFocusMarkup==='function' ? gateDispatchFocusMarkup(data,'leaving') : app.sub.gate?.startsWith('dispatch-') && typeof gateDispatchFocusMarkup==='function' ? gateDispatchFocusMarkup(data,app.sub.gate) : gateDispatchMarkup(data);
  const counts={awaiting:(data.awaitingDriver||[]).length,leaving:(data.leaving||[]).length,transit:(data.inTransit||[]).length};
  document.querySelectorAll('[data-gate-dispatch-count]').forEach(el=>{const count=counts[el.dataset.gateDispatchCount]||0;el.textContent=qty(count);});
}
function startGateDispatchLive() {
  if(app.timer)clearInterval(app.timer);
  const seq=app.gateRenderSeq;let busy=false,lastRows='';
  app.timer=setInterval(async()=>{
    if(app.page!=='gate'||app.gateRenderSeq!==seq||busy)return;
    busy=true;const tab=app.sub.gate;
    try{
      const historyQ=tab==='history'?(app.gateHistoryQ||''):'';
      const [dispatch,rows]=await Promise.all([api('/api/gate/dispatch'),tab==='exit'?api('/api/orders?status=SETTLED'):api('/api/visits'+(historyQ?'?q='+encodeURIComponent(historyQ):''))]);
      if(app.page!=='gate'||app.gateRenderSeq!==seq||app.sub.gate!==tab||(tab==='history'&&historyQ!==(app.gateHistoryQ||'')))return;
      const sig=JSON.stringify(dispatch);if(sig!==dsp.sigs.gate){dsp.sigs.gate=sig;updateGateDispatchInCartable(dispatch);}
      const rowSig=JSON.stringify(rows);
      if(rowSig!==lastRows){
        if(tab==='waiting'){
          const queue=(rows.visits||[]).filter(v=>v.status==='WAITING_SALES');
          const list=$('#gateWaitingRows');if(list)list.innerHTML=gtWaitingTable(queue)||sdEmpty('user','صف فعالی وجود ندارد','با ثبت ورود مشتری، وضعیت مراجعه در این فهرست دیده می‌شود.');
          const count=$('#gateWaitingPanel .sd-count strong');if(count)count.textContent=qty(queue.length);
        }else if(tab==='history'){
          const host=$('#gateHistoryLive');if(host)host.innerHTML=renderGateHistory(rows.visits||[],true);
        }else if(tab==='exit'){
          const temp=document.createElement('div');temp.innerHTML=renderGateExit(rows.orders||[]);
          const list=$('#gateExitRows');if(list)list.innerHTML=temp.querySelector('#gateExitRows').innerHTML;
          const count=$('#content .sd-count strong'),fresh=temp.querySelector('.sd-count strong');if(count&&fresh)count.textContent=fresh.textContent;
        }
        lastRows=rowSig;
      }
      if(tab==='exit'&&app.features?.pickupStaging)await refreshPickupExit();
      const state=$('#gateSyncState');if(state)state.textContent='آخرین به‌روزرسانی: '+(typeof serverNow==='function'?serverNow():new Date()).toLocaleTimeString('fa-IR');
    }catch(_){const state=$('#gateSyncState');if(state&&app.gateRenderSeq===seq)state.textContent='به‌روزرسانی ناموفق؛ اطلاعات نمایش‌داده‌شده ممکن است قدیمی باشد.';}
    finally{busy=false;}
  },DSP_LIVE_MS);
}
function paintGateDispatch(data) {
  $('#content').innerHTML = gateDispatchMarkup(data);
  $('#content').onclick = async (e) => {
    const el = e.target.closest('[data-gate]'); if (!el) return;
    await handleGateDispatchAction(el);
  };
}
async function handleGateDispatchAction(el) {
  if(el.dataset.gate==='transport-exit'){el.disabled=true;try{await api('/api/gate/transport-shipments/'+encodeURIComponent(el.dataset.id)+'/depart',{method:'POST',body:'{}'});toast('خروج پخش ثبت شد؛ فروش می‌تواند روش پرداخت و مرجوعی را ثبت کند.');await renderGate('dispatch');await refreshIndicators();}catch(err){el.disabled=false;toast(err.message);}return;}

  if(el.dataset.gate==='store-details'){
    try{const data=await api('/api/gate/dispatch'),o=(data.leaving||[]).find(x=>x.gateStoreService&&x.id===el.dataset.id&&Number(x.dispatch?.run)===Number(el.dataset.run));if(!o)return toast('این سرویس دیگر در انتظار خروج نیست.');const d=o.dispatch,rows=(d.lines||[]).map(l=>`<tr><td>${esc(l.productName||'—')}</td><td>${qty(l.deliveredKg)} کیلوگرم</td></tr>`).join('');openModal('جزئیات خروج سرویس فروشگاه',`<p>فروشگاه: ${esc(o.storeName)} — ${o.storeOrderKind==='PARTIAL'?'سفارش جزئی':`سرویس ${d.run===2?'دوم':'اول'}`}</p><p>راننده: ${esc(d.driverName)} — خودرو: ${esc(d.vehicleType||'—')} ${esc(fa(d.driverPlate||'—'))} — شماره سند: ${esc(fa(d.warehouseDocumentNo||'—'))}</p><div class="table-wrap"><table class="table"><thead><tr><th>محصول</th><th>وزن ارسالی</th></tr></thead><tbody>${rows}</tbody></table></div><p>بررسی فروش ثبت شده است. خروج واقعی باید توسط نگهبانی تأیید شود.</p><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button></div>`);}catch(err){toast(err.message);}return;
  }
  if(el.dataset.gate==='store-exit'){
    if(!confirm('خروج واقعی این سرویس و راننده پس از کنترل تأیید شود؟'))return;
    el.disabled=true;try{await api(`/api/gate/store-shipments/${encodeURIComponent(el.dataset.id)}/${Number(el.dataset.run)}/depart`,{method:'POST',body:JSON.stringify({departureConfirmed:true})});toast('خروج سرویس تأیید شد؛ دریافت فروشگاه هنوز ثبت نشده است.');const data=await api('/api/gate/dispatch');dsp.sigs.gate=JSON.stringify(data);updateGateDispatchInCartable(data);await refreshIndicators();}catch(err){el.disabled=false;toast(err.message);}return;
  }
  if (el.dataset.gate === 'details') return dspOrderDetails(el.dataset.id, Number(el.dataset.run)||null);
  if (el.dataset.gate !== 'exit') {
    return toast('پس از تحویل راننده، تأیید نهایی را واحد فروش انجام می‌دهد.');
  }
  const url = `/api/gate/dispatch/${el.dataset.id}/exit`;
  const inMainCartable = app.page === 'gate';
  el.disabled = true;
  try {
    await api(url, { method: 'POST', body: '{}' });
    toast('خروج راننده تأیید شد؛ سفارش در مسیر مقصد است. پس از تحویل به کارتابل فروش می‌رود.');
    if (inMainCartable) {
      const data = await api('/api/gate/dispatch');
      dsp.sigs.gate = JSON.stringify(data);
      updateGateDispatchInCartable(data);
      await refreshIndicators();
    } else {
      await renderGateDispatchPage();
      await refreshIndicators();
    }
  } catch (err) {
    toast(err.message);
    el.disabled = false;
  }
}

/* ---------- مرجوعی‌ها: راننده → فروش → انبار ---------- */
const dspReturnsUrl = () => `/api/returns?status=${dsp.retTab}`;
async function renderReturnsPage() {
  const role = normalizeRole(app.user?.roleCode);
  if (!dsp.retTab) dsp.retTab = role === 'warehouse' ? 'AT_WAREHOUSE' : 'AT_SALES';
  const data = await api(dspReturnsUrl());
  dsp.sigs.returns = JSON.stringify(data);
  paintReturns(data);
  dspLive('returns', () => api(dspReturnsUrl()), (d) => paintReturns(d));
}
function paintReturns(data) {
  const role = normalizeRole(app.user?.roleCode);
  const tabs = [['AT_SALES', 'نزد فروش', data.counts.atSales], ['AT_WAREHOUSE', 'ارجاع به انبار', data.counts.atWarehouse], ['RECEIVED', 'دریافت‌شده', data.counts.received]];
  const row = (t) => {
    let action = '';
    if (role !== 'warehouse' && t.status === 'AT_SALES') action = `<button class="btn btn-primary btn-sm" type="button" data-ret="refer" data-id="${esc(t.id)}">${icon('send', 14)} ارجاع به انبار</button>`;
    if (role !== 'sales' && t.status === 'AT_WAREHOUSE') action = `<button class="btn btn-success btn-sm" type="button" data-ret="receive" data-id="${esc(t.id)}">${icon('check', 14)} دریافت مرجوعی در انبار</button>`;
    return `<tr data-return-id="${esc(t.id)}"><td data-label="محصول و وزن"><strong>${esc(t.productName)} — ${dspKg(t.kg)}</strong></td><td data-label="مشتری و سفارش">${esc(t.customerName)} • سفارش ${esc(fa(t.orderNo))}${t.fullOrder ? ' • مرجوعی کلی' : ''}</td><td data-label="وضعیت"><span class="badge ${t.status === 'RECEIVED' ? 'green' : t.status === 'AT_WAREHOUSE' ? 'blue' : 'orange'}">${esc(DSP_RET_STATUS[t.status] || t.status)}</span></td><td data-label="علت">${esc(t.reason || '—')}</td><td data-label="راننده">${esc(t.driverName || '—')}</td><td data-label="زمان‌ها"><span>تحویل: ${esc(formatDateTime24(t.deliveredAt))}</span>${t.salesReferredAt ? `<br><span>ارجاع فروش: ${esc(formatDateTime24(t.salesReferredAt))}</span>` : ''}${t.warehouseReceivedAt ? `<br><span>دریافت انبار: ${esc(formatDateTime24(t.warehouseReceivedAt))}</span>` : ''}</td><td data-label="عملیات" class="bt-col-actions">${action||'—'}</td></tr>`;
  };
  const rows=data.returns.map(row).join('');
  $('#content').innerHTML = `<nav class="sd-tabs dsp-tabs" aria-label="وضعیت مرجوعی‌ها">${tabs.map(([k, l, c]) => `<button type="button" class="sd-tab ${dsp.retTab === k ? 'active' : ''}" data-ret="tab" data-tab="${k}"><span class="sd-tab-copy"><strong>${l}</strong><small>${fa(c || 0)} برگه</small></span></button>`).join('')}</nav>`
    + admHead('receipt', 'برگه‌های مرجوعی', 'مرجوعی‌های ثبت‌شده توسط راننده: فروش ارجاع می‌دهد و انبار دریافت می‌کند.', data.returns.length)
    + (rows?`<div class="bt-table-wrap"><table class="bt-table dsp-returns-table"><caption class="bt-caption">برگه‌های مرجوعی</caption><thead><tr><th scope="col">محصول و وزن</th><th scope="col">مشتری و سفارش</th><th scope="col">وضعیت</th><th scope="col">علت</th><th scope="col">راننده</th><th scope="col">زمان‌ها</th><th scope="col">عملیات</th></tr></thead><tbody>${rows}</tbody></table></div>`:sdEmpty('receipt', 'برگه‌ای در این وضعیت نیست', ''))+'</section>';
  $('#content').onclick = async (e) => {
    const el = e.target.closest('[data-ret]'); if (!el) return;
    const a = el.dataset.ret;
    if (a === 'tab') { dsp.retTab = el.dataset.tab; return renderReturnsPage(); }
    try {
      await api(`/api/returns/${el.dataset.id}/${a === 'refer' ? 'refer' : 'receive'}`, { method: 'POST', body: '{}' });
      toast(a === 'refer' ? 'مرجوعی به انبار ارجاع شد.' : 'مرجوعی در انبار دریافت شد.'); renderReturnsPage();
    } catch (err) { toast(err.message); }
  };
}

/* Transport planning; old open dispatches remain separately traceable. */
/* v37.50.0 — سربرگ «سفارشات» ترابری به دو بخش مستقل تقسیم شد:
   «ورودی» = سرویسی که هنوز راننده/خودرو برایش تخصیص نیافته،
   «تخصیص‌یافته» = سرویسی که راننده و خودروی آن مشخص شده است.
   داده، شمارش و اقدام‌ها بدون تغییر مانده‌اند؛ فقط گروه‌بندی قابل تشخیص شد. */
function transportPlanRows(orders,tab){
 const views=transportPlanViews(orders).filter(view=>tab?view.assigned===(tab==='assigned'):true);
 return views.map(({order:o,service:s,assigned})=>{
  const a=s.assignment,label=o.storeOrderKind==='PARTIAL'?'سفارش جزئی':s.run?`سرویس ${s.run===1?'اول':'دوم'}`:'سفارش مشتری';
  const driver=a?`راننده: ${a.driverName||'—'}`:'راننده: تعیین نشده';
  const vehicle=a?`خودرو: ${a.vehicleType||'—'} ${fa(a.vehiclePlate||'')}`:'منتظر انتخاب راننده و خودرو';
  return `<tr class="tp-plan-row" data-order="${esc(o.id)}"><td data-label="مشتری / فروشگاه"><span class="bt-cell-main">${esc(o.customerName||'—')}</span></td><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="سرویس">${esc(label)}</td><td data-label="وضعیت"><span class="badge ${assigned?'blue':'orange'}">${esc(transportPlanStateLabel(s))}</span><span class="bt-cell-sub">${qty((o.items||[]).length)} قلم</span></td><td data-label="راننده و خودرو"><span>${esc(driver)}</span><br><span>${esc(vehicle)}</span></td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-secondary btn-sm" data-tp="details" data-id="${esc(o.id)}" data-run="${s.run}">جزئیات سفارش</button></td></tr>`;
 }).join('');
}

function transportPlanTable(rows,empty='سفارشی یافت نشد'){
 return `<div class="bt-table-wrap"><table class="bt-table tp-plan-table"><caption class="bt-caption">برنامهٔ ترابری</caption><thead><tr><th scope="col">مشتری / فروشگاه</th><th scope="col">شماره سفارش</th><th scope="col">سرویس</th><th scope="col">وضعیت</th><th scope="col">راننده و خودرو</th><th scope="col">عملیات</th></tr></thead><tbody>${rows||`<tr><td colspan="6">${esc(empty)}</td></tr>`}</tbody></table></div>`;
}

/* کمک‌تابع‌های تفکیک «ورودی/تخصیص‌یافته» عمداً بعد از transportPlanRows تعریف شده‌اند؛
   به این ترتیب تست واحد می‌تواند از همین نقطه تا انتهای فایل را ایزوله اجرا کند. */
function transportPlanStateLabel(service){
 const a=service.assignment;
 return service.tripStatus==='CLOSED'?'مدارک بازگشته':service.tripStatus==='RECEIPT_CONFIRMED'?'دریافت فروشگاه تأیید شد':service.departed?'در مسیر':service.awaitingGate?'منتظر تأیید خروج نگهبانی':service.canDepart?'آماده ثبت خروج':service.handedOver&&service.run?(service.salesReviewed?'منتظر خروج نگهبانی':'منتظر بررسی فروش'):service.handedOver?'در انتظار فاکتور':transportPlanServiceAssigned(service)?'تخصیص‌یافته — منتظر تحویل انبار':'در انتظار تخصیص راننده';
}
function transportPlanServiceAssigned(service){
 const a=service&&service.assignment;
 return !!(a&&(a.driverId||a.driverName));
}
function transportPlanViews(orders){
 return (Array.isArray(orders)?orders:[]).flatMap(o=>(o.services||[]).map(s=>({order:o,service:s,assigned:transportPlanServiceAssigned(s)})));
}

async function renderTransportPlanQueue(){
 const host=$('#transportPlans');if(!host)return;
 try{
  const capability=await api('/api/transport/capabilities');if($('#transportPlans')!==host||!capability.experimentalWorkflow)return;
  const [data,resources]=await Promise.all([api('/api/transport/plans'),api('/api/transport/resources')]);if($('#transportPlans')!==host)return;
  const orders=data.orders||[];
  if(!['incoming','assigned'].includes(dsp.planTab))dsp.planTab='incoming';
  const views=transportPlanViews(orders),counts={incoming:views.filter(v=>!v.assigned).length,assigned:views.filter(v=>v.assigned).length};
  const tabs=[['incoming','ورودی','سفارش‌های بدون راننده؛ آمادهٔ تخصیص'],['assigned','تخصیص‌یافته','سرویس‌هایی که راننده و خودروی آن‌ها مشخص شده است']];
  const rows=transportPlanRows(orders,dsp.planTab);
  const empty=dsp.planTab==='assigned'?'سرویس تخصیص‌یافته‌ای نیست':'سفارش ورودی بدون راننده‌ای نیست';
  host.innerHTML=`<section class="sd-panel sd-pad"><div class="stl-block-head"><h2>برنامه‌ریزی و خروج ترابری</h2><button type="button" class="btn btn-secondary btn-sm" data-tp="refresh">به‌روزرسانی</button></div><p>تخصیص هر سرویس مستقل است؛ خروج فروشگاه پس از بررسی فروش توسط نگهبانی تأیید می‌شود.</p>`
   +`<nav class="sd-tabs tp-plan-tabs" role="tablist" aria-label="سفارش‌های ترابری">${tabs.map(([key,label,desc])=>`<button type="button" role="tab" aria-selected="${dsp.planTab===key}" aria-controls="tpPlanPanel" class="sd-tab ${dsp.planTab===key?'active':''}" data-tp="plan-tab" data-tab="${key}"><span class="sd-tab-copy"><strong>${label}</strong><small>${desc}</small></span><b class="sd-tab-count ${counts[key]?'show':''}">${counts[key]?fa(counts[key]):''}</b></button>`).join('')}</nav>`
   +`<div id="tpPlanPanel" role="tabpanel" data-tp-panel="${dsp.planTab}"><div class="adm-list order-compact-scroll tp-plan-list">${transportPlanTable(rows,empty)}</div></div></section>`;
  host.onclick=e=>{
   const b=e.target.closest('[data-tp]');if(!b)return;
   if(b.dataset.tp==='refresh')return renderTransportPlanQueue();
   if(b.dataset.tp==='plan-tab'){dsp.planTab=b.dataset.tab==='assigned'?'assigned':'incoming';return renderTransportPlanQueue();}
   const order=orders.find(o=>o.id===b.dataset.id),service=order?.services?.find(s=>s.run===Number(b.dataset.run));
   if(order&&service)transportPlanDetails(order,service,resources);
  };
 }catch(err){if($('#transportPlans')===host)host.innerHTML=`<section class="sd-panel sd-pad" role="alert">خطا در دریافت برنامه ترابری: ${esc(err.message)} <button type="button" class="btn btn-secondary btn-sm" data-tp-retry>تلاش مجدد</button></section>`;host.querySelector('[data-tp-retry]')?.addEventListener('click',renderTransportPlanQueue);}
}
function transportPlanDetails(order,service,resources){
 const notices=captureEntityNotices('order',order.id,service.run||null);
 const a=service.assignment,vehicles=new Map((resources.vehicles||[]).filter(v=>v.isActive).map(v=>[v.id,v]));
 const pairs=(resources.drivers||[]).filter(d=>d.isActive&&vehicles.has(d.vehicleId)).map(d=>({driver:d,vehicle:vehicles.get(d.vehicleId)}));
 const items=(order.items||[]).map((i,index)=>`<tr><td>${fa(index+1)}</td><td>${esc(i.productName||'—')}</td><td>${qty(i.requestedQty)} ${esc(i.requestedUnit||'')}</td></tr>`).join('');
 const select=service.handedOver?'':`<form id="tpAssign" class="tp-assign"><label><span>راننده و خودروی تحویلی</span><select name="driverId" required><option value="">انتخاب راننده و پلاک خودرو</option>${pairs.map(({driver:d,vehicle:v})=>`<option value="${esc(d.id)}" data-vehicle-id="${esc(v.id)}" ${d.id===a?.driverId&&v.id===a?.vehicleId?'selected':''}>${esc(d.fullName)} — ${esc(v.vehicleType)} — ${esc(fa(v.plate))}</option>`).join('')}</select></label><button class="btn btn-primary btn-sm" type="submit" ${pairs.length?'':'disabled'}>ثبت تخصیص</button>${pairs.length?'':'<p>برای تعیین راننده ابتدا در «خودروهای پخش» خودرو را به راننده فعال تخصیص دهید.</p>'}${a&&!pairs.some(({driver:d,vehicle:v})=>d.id===a.driverId&&v.id===a.vehicleId)?'<p>تخصیص قبلی حفظ شده است؛ برای تغییر، راننده و خودروی فعلی را انتخاب کنید.</p>':''}<p data-tp-error role="alert"></p></form>`;
 const depart=service.awaitingGate?'<p>فاکتور فروش آماده است؛ تأیید خروج فقط در کارتابل نگهبانی انجام می‌شود.</p>':'';
 const fact=(label,value)=>`<div class="tp-detail-cell"><dt>${label}</dt><dd>${esc(value||'—')}</dd></div>`;
 openModal('جزئیات برنامه ترابری',`<section class="tp-detail"><dl class="tp-detail-grid">${fact('شماره سفارش',fa(order.orderNo||'—'))}${fact('مشتری / فروشگاه',order.customerName)}${service.run?fact(order.storeOrderKind==='PARTIAL'?'نوع سفارش':'سرویس',order.storeOrderKind==='PARTIAL'?'سفارش جزئی':service.run===1?'سرویس اول':'سرویس دوم'):''}${fact('محل ارسال',order.dispatchPlace)}${fact('راننده',a?.driverName||'تعیین نشده')}${fact('خودرو و پلاک',`${a?.vehicleType||'—'} ${fa(a?.vehiclePlate||'')}`)}${fact('سند انبار',fa(service.warehouseDocumentNo||'—'))}${service.invoiceNumber?fact('شماره فاکتور',fa(service.invoiceNumber)):''}</dl><section class="tp-items"><h3>اقلام سفارش</h3><div class="table-wrap"><table class="tp-items-table"><thead><tr><th>ردیف</th><th>محصول</th><th>مقدار درخواستی</th></tr></thead><tbody>${items||'<tr><td colspan="3">قلمی ثبت نشده است.</td></tr>'}</tbody></table></div></section>${service.handedOver?'<p>تحویل انبار ثبت شده و تخصیص این سرویس دیگر قابل تغییر نیست.</p>':select}<div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button>${depart}</div><p data-tp-depart-error role="alert"></p></section>`);
 finishEntityNotices(notices);
 const form=$('#tpAssign');if(form)form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;try{await api('/api/transport/plans/'+encodeURIComponent(order.id)+'/assign',{method:'POST',body:JSON.stringify({run:service.run,driverId:form.elements.driverId.value,vehicleId:form.elements.driverId.selectedOptions[0]?.dataset.vehicleId||''})});closeModal();toast('تخصیص ترابری ثبت شد.');await renderTransportPlanQueue();}catch(err){form.querySelector('[data-tp-error]').textContent=err.message;button.disabled=false;}};

}
