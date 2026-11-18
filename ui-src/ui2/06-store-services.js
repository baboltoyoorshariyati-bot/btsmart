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
// Partial store orders are a single independent shipment, not the two daily services.
function srPartialSheet(o){
 const body=$('#wh38Body');if(!body)return;body.dataset.sheet='1';app.wh38.sheetOrder=o;
 const items=activeItemsOf(o),view=new Map((o.storeRun?.items||[]).map(v=>[v.itemId,v]));
 const ready=items.every(i=>i.runCompleted||i.shortageClosed),hasWeight=items.some(i=>Number(view.get(i.id)?.totalKg)>0);
 const rows=items.map((it,k)=>{const v=view.get(it.id)||{},closed=!!(it.runCompleted||it.shortageClosed),weight=Number(v.totalKg||0);
  return `<article class="wh38-prep-item sr38-item sr318-row" ${closed?'':'data-sr318-row="1"'}><span class="wh38-prep-num">${fa(k+1)}</span><strong class="sr318-name">${esc(it.product?.name||'—')}</strong><span>درخواست: ${qty(it.requestedQty)} ${esc(it.requestedUnit||'')}</span><span>وزن ثبت‌شده: ${qty(weight)} کیلوگرم</span>${(it.voidedRunWeighings||[]).length?`<button type="button" class="btn btn-secondary btn-sm" data-action="sr38-history" data-item="${esc(it.id)}">سوابق وزن</button>`:''}${closed?`<span>${it.runCompleted?'تکمیل‌شده':'عدم موجودی / کسری'}</span>${it.runCompleted&&!v.reopenRun?'<span>بازگشت از صفر ممکن نیست؛ وزن ارسال شده یا سرویس بسته است.</span>':''}${it.runCompleted&&v.reopenRun?`<button type="button" class="btn btn-secondary btn-sm" data-action="sr38-reopen" data-id="${esc(o.id)}" data-item="${esc(it.id)}">بازگشت به وزن‌کشی</button>`:''}`:`<div class="sr38-ops sr318-ops"><div class="wh38-cell-box sr38-weight-box sr318-wbox"><input type="text" inputmode="decimal" autocomplete="off" placeholder="۰٫۰۰۰" aria-label="وزن خالص ${esc(it.product?.name||'محصول')}" data-sr38-weight="${esc(it.id)}"><b>کیلوگرم</b></div><button type="button" class="btn btn-secondary btn-sm" data-action="wh-weight-details">ناخالصی</button><button type="button" class="btn btn-primary btn-sm" data-action="sr38-weight" data-id="${esc(o.id)}" data-item="${esc(it.id)}" data-run="1">ذخیره وزن</button><button type="button" class="btn btn-secondary btn-sm" data-action="sr38-oos" data-id="${esc(o.id)}" data-item="${esc(it.id)}">عدم موجودی / کسری</button></div>`}</article>`;
 }).join('');
 body.innerHTML=`<section class="wh38-sheet st-run-sheet"><div class="wh38-sheet-head wh38-sheet-head-compact">${wh38StoreHeader(o)}</div><h3>آماده‌سازی سفارش جزئی</h3><p>هر محصول یک‌بار وزن‌کشی می‌شود؛ ثبت وزن یا عدم موجودی، کار همان ردیف را تمام می‌کند. ذخیره وزن به معنی تحویل به راننده نیست.</p><div class="sr318-rows">${rows}</div><div class="wh38-sheet-foot"><div>پس از تعیین تکلیف همه اقلام، محموله را آماده ارسال کنید.</div><div class="toolbar"><button type="button" class="btn btn-secondary" data-action="sr38-back" data-id="${esc(o.id)}">بازگشت</button><button type="button" class="btn btn-secondary" data-action="wh38-return" data-id="${esc(o.id)}">ارجاع به فروش</button><button type="button" class="btn btn-primary" data-action="sr38-send-run" data-id="${esc(o.id)}" data-run="1" ${ready&&hasWeight&&(o.transportWorkflow!==1||o.transportAssignments?.['1']?.driverId)?'':'disabled'}>آماده ارسال محموله</button>${sr38WarehouseDocuments(o)}</div></div></section>`;
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
    const head=`<span class="wh38-prep-num sr318-num">${fa(String(k+1))}</span><strong class="sr318-name" title="${esc(it.product?.name||'—')}">${esc(it.product?.name||'—')}</strong><span class="st-run-chip st-run-${esc(v.runStatus||'AWAITING_R1')}">${esc(SR38_STATUS_LABEL[v.runStatus]||'')}</span><span class="sr318-req">درخواست <b>${qty(it.requestedQty)} ${esc(it.requestedUnit||'')}</b></span>${wts}`;
    if(closed){ closedRows.push(`<article class="wh38-prep-item sr38-item sr318-row sr318-closed ${v.runStatus==='COMPLETED'?'sr38-done':''}${v.runStatus==='CLOSED_SHORT'?'sr38-short':''}">${head}<span class="sr318-final">${it.runCompleted?`تکمیل‌شده — وزن ذخیره‌شده ${qty(v.totalKg||0)} کیلوگرم`:`بسته با کسری — وزن ذخیره‌شده ${qty(v.totalKg||0)} کیلوگرم${it.shortageClosed.note?` · ${esc(it.shortageClosed.note)}`:''}`}</span>${it.runCompleted&&!v.reopenRun?'<span>بازگشت از صفر ممکن نیست؛ وزن ارسال شده یا سرویس بسته است.</span>':''}${it.runCompleted&&v.reopenRun?`<button type="button" class="btn btn-secondary btn-sm" data-action="sr38-reopen" data-id="${esc(o.id)}" data-item="${esc(it.id)}">بازگشت به وزن‌کشی${v.reopenRun===2?' سرویس دوم':''}</button>`:''}</article>`); return; }
    groups[run].push(`<article class="wh38-prep-item sr38-item sr318-row" data-sr318-row="${run}">${head}<div class="sr38-ops sr318-ops"><div class="wh38-cell-box sr38-weight-box sr318-wbox"><input type="text" inputmode="decimal" autocomplete="off" placeholder="۰٫۰۰۰" aria-label="وزن خالص ${esc(it.product?.name||'محصول')} به کیلوگرم" data-sr38-weight="${it.id}"><b>کیلوگرم</b></div><button type="button" class="btn btn-secondary btn-sm wh-weight-open" data-action="wh-weight-details">ناخالصی</button><button type="button" class="btn btn-primary btn-sm" data-action="sr38-weight" data-id="${o.id}" data-item="${it.id}" data-run="${run}">${icon('scale',13)} ذخیره وزن</button>${!it.movedToR2?`<button type="button" class="btn btn-secondary btn-sm" data-action="sr38-move" data-id="${o.id}" data-item="${it.id}">${icon('arrow',13)} سرویس دوم</button>`:''}<button type="button" class="btn btn-secondary btn-sm" data-action="sr38-complete" data-id="${o.id}" data-item="${it.id}">${icon('check',13)} تکمیل محصول</button><button type="button" class="btn btn-ghost btn-sm danger-text" data-action="sr38-oos" data-id="${o.id}" data-item="${it.id}">${icon('trash',13)} عدم موجودی</button></div></article>`);
  });
  const groupHtml=(run,title,sub)=>`<section class="sr318-group" data-sr318-group="${run}"><header class="sr318-group-head"><b>سرویس ${title}</b><small>${sub}</small><span class="sr318-gcount">${qty(groups[run].length)} قلم فعال</span></header><div class="sr318-rows">${groups[run].join('')||'<div class="sr318-empty">قلم فعالی در این سرویس نیست.</div>'}</div></section>`;
  body.innerHTML=`<section class="wh38-sheet st-run-sheet st-run-sheet-v318">
    <div class="wh38-sheet-head wh38-sheet-head-compact wh38-store-sheet-head">${wh38StoreHeader(o)}</div>
    <div class="sr318-summary"><span>وضعیت کلی: <b>${esc(sr.overallLabel||'—')}</b></span><span>سرویس اول: <b>${esc(sr.r1StatusLabel||'—')}</b></span><span>سرویس دوم: <b>${esc(sr.r2StatusLabel||'—')}</b></span><span>جمع وزن ذخیره‌شده: <b>${qty(totalSent)} کیلوگرم</b></span><span>حل‌نشده: <b>${qty(unresolved.length)} قلم</b></span></div>
    <div class="sr318-sendnote">وزن هر قلم با «ذخیره وزن» برای سرویس مربوط در سامانه می‌ماند؛ هر ثبت، یک نوبت تازه به جمع همان سرویس اضافه می‌کند و به‌تنهایی ثبت تحویل نیست.</div><div class="sr318-sendline">${sr38SendBtn(o,1,sr.items)}${sr38SendBtn(o,2,sr.items)}${sr38WarehouseDocuments(o)}<span class="sr318-sendnote">سند (فاکتور) هر سرویس جدا و فقط با اقلام همان سرویس صادر می‌شود. با ثبت وزن: قلم کامل یا ناقص، به مقدار ثبت‌شده وارد فاکتور همان سرویس می‌شود؛ وزن صفر، قلم را به سرویس دوم می‌برد و ماندهٔ قلم ناقص هم با دکمهٔ «سرویس دوم» منتقل می‌شود؛ اگر بعد از ارسال یک سرویس، قلم تازه‌ای برای همان سرویس وزن شود، دکمهٔ «ارسال قلم جدید» آن را به همان محمولهٔ نزد فروش می‌افزاید.</span></div>
    ${groupHtml(1,'اول','ثبت وزن و ارسال صبح')}
    ${groupHtml(2,'دوم','ماندهٔ اقلام منتقل‌شده و ارسال ظهر')}
    ${closedRows.length?`<details class="sr318-done-box"><summary>اقلام تعیین‌تکلیف‌شده (${qty(closedRows.length)})</summary><div class="sr318-rows">${closedRows.join('')}</div></details>`:''}
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
  return `<tr><td>${fa(String(i+1))}</td><td>${esc(line.productName||'قلم')}</td><td>${qty(net)}</td><td>${gross==null?'<span title="وزن ناخالص در سابقه موجود نیست">—</span>':qty(gross)}</td><td>${st38WeighingDetailsHtml(item,d.run,snapshot)}</td></tr>`;
 }).join('')
 :lines.map((line,i)=>`<tr><td>${fa(String(i+1))}</td><td>${esc(line.productName||'قلم')}</td><td>${qty(line.deliveredKg)}</td><td>${qty(line.returnKg||0)}</td><td>${qty(line.shortageKg||0)}</td><td>${qty(line.netKg||0)}</td><td>${esc(line.reason||'—')}</td><td>${money(line.unitPrice||0)}</td><td>${money(line.amountDue??line.grossAmount??0)}</td></tr>`).join('');
 const paid=freeFlow?'':methods.map(m=>`${esc(labels[m.type]||m.type)} ${money(m.amount)}${m.deviceSnapshot?` • ${esc(m.deviceSnapshot.title)} / پایانه ${esc(m.deviceSnapshot.terminalNumber)}`:''}${m.reference?` • پیگیری ${esc(m.reference)}`:''}`).join('، ');
 const summaryCell=freeFlow
   ?`<span>جمع وزن سند <b>${qty((lines||[]).reduce((sm,l)=>sm+Number(l.deliveredKg||0),0))} کیلوگرم</b></span><span>سند تحویل <b>${esc(fa(o.transportWorkflow===1?(d.warehouseDocumentNo||'—'):(o.payment?.invoiceNumber||'پس از تأیید نهایی فروش')))}</b></span>`
   :`<span>مبلغ قابل تسویه <b>${money(payable)}</b></span><span>فاکتور <b>${esc(fa(o.payment?.invoiceNumber||'پس از تأیید نهایی فروش'))}</b></span>${paid?`<span>روش‌های دریافت <b>${paid}</b></span>`:''}`;
 return `<article class="st38-delivered-card st38-delivered-details"><header><div><span class="order-code">${esc(fa(o.orderNo||'—'))}</span>${runChip}<h3>${esc(o.storeName||'فروشگاه')} </h3><p>${o.transportWorkflow===1?'تأیید فروشگاه':'ثبت تحویل راننده'}: ${formatDateTime24(d.deliveredAt)} • راننده: ${esc(d.driverName||'—')}</p></div><span class="badge ${confirmed?'green':'orange'}">${confirmed?'دریافت تأیید شد':'منتظر تأیید فروشگاه'}</span></header><div class="st38-delivered-items table-wrap"><table class="table store-shipment-table"><thead><tr><th>ردیف</th><th>محصول</th>${freeFlow?'<th>خالص (کیلوگرم)</th><th>ناخالص (کیلوگرم)</th><th>ناخالصی‌های ثبت‌شده در توزین انبار</th>':'<th>تحویلی (کیلو)</th><th>مرجوعی</th><th>کسری</th><th>خالص</th><th>علت</th><th>فی</th><th>مبلغ</th>'}</tr></thead><tbody>${rows||`<tr><td colspan="${freeFlow?5:9}">ریز اقلام تحویل در دسترس نیست.</td></tr>`}</tbody></table></div><div class="st38-delivered-summary">${summaryCell}</div>${d.note?`<p class="st38-delivered-note"><b>یادداشت راننده:</b> ${esc(d.note)}</p>`:''}<footer>${confirmed?`<span class="st38-confirmed-stamp">تأیید شما: ${formatDateTime24(confirmedAt)}</span>`:`<span class="subtle">${o.storeOrderKind==='PARTIAL'?'اقلام همین سفارش جزئی را کنترل و دریافت را تأیید کنید.':isRun?'اقلام همین محموله را کنترل و دریافت را تأیید کنید؛ محمولهٔ دیگر جداگانه تأیید می‌شود.':'لطفاً اقلام تحویلی را کنترل و دریافت را تأیید کنید.'}</span><button type="button" class="btn btn-primary" data-action="store-confirm-delivery" data-partial="${o.storeOrderKind==='PARTIAL'?'1':'0'}" data-id="${esc(o.id)}"${isRun?` data-run="${d.run}"`:''}>${icon('check',16)} تأیید دریافت ${o.storeOrderKind==='PARTIAL'?'سفارش جزئی':isRun?'محمولهٔ سرویس '+(d.run===2?'دوم':'اول'):'تحویل'}</button>`}</footer></article>`;
}
function st38DeliveredRow(o){
 const d=o.dispatch||{},run=Number(d.run)||0;
 return orderSummaryRow(o,{className:'st38-delivered-card order-compact-row',statusHtml:`<span class="badge ${d.storeReceiptConfirmedAt?'green':'orange'}">${d.storeReceiptConfirmedAt?'دریافت تأیید شد':'منتظر تأیید دریافت'}</span>`,itemCount:(d.lines||[]).length,extras:[...(run?[{html:`سرویس ${run===2?'دوم':'اول'}`}]:[]),{html:`زمان تحویل: ${esc(formatDateTime24(d.deliveredAt))}`}],actionsHtml:`<button type="button" class="btn btn-secondary btn-sm" data-action="store-delivery-details" data-id="${esc(o.id)}" data-run="${run}">جزئیات سفارش</button>`});
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
 const rows=items.map((i,k)=>`<tr><td>${fa(String(k+1))}</td><td>${esc(i.product?.name||'—')}</td><td>${qty(i.requestedQty)} ${esc(i.requestedUnit||'')}</td><td>${weightOf(i)}</td><td>${esc(i.description||'—')}</td></tr>`).join('');
 return `<div class="store-shipment-details"><div class="store-shipment-meta"><span>شماره سفارش: <b>${esc(fa(o.orderNo||'—'))}</b></span><span>${o.storeOrderKind==='PARTIAL'?'سفارش جزئی':d.run?`سرویس ${d.run===2?'دوم':'اول'}`:'محموله'}</span><span>راننده: <b>${esc(d.driverName||'—')}</b></span>${st38OrderBadge(o)}</div><div class="table-wrap"><table class="table store-shipment-table"><thead><tr><th>ردیف</th><th>محصول</th><th>مقدار درخواستی</th><th>${o.storeOrderKind==='PARTIAL'?'وزن محموله':'وزن این سرویس'} (کیلوگرم)</th><th>توضیحات</th></tr></thead><tbody>${rows||'<tr><td colspan="5">قلمی برای این محموله ثبت نشده است.</td></tr>'}</tbody></table></div><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button>${o.transportWorkflow===1&&d.status==='IN_TRANSIT'?`<button type="button" class="btn btn-primary" data-action="store-confirm-delivery" data-partial="${o.storeOrderKind==='PARTIAL'?'1':'0'}" data-id="${esc(o.id)}" data-run="${Number(d.run)||0}">${o.storeOrderKind==='PARTIAL'?'تأیید دریافت سفارش':'تأیید دریافت همین سرویس'}</button>`:''}</div></div>`;
}
function st38OrderBadge(o){const d=o.dispatch;if(!d)return badge(o.status);const labels={ASSIGNED:'به راننده واگذار شد',DRIVER_EXIT_REPORTED:'منتظر تأیید خروج',IN_TRANSIT:'در حال ارسال'};const tone={ASSIGNED:'orange',DRIVER_EXIT_REPORTED:'purple',IN_TRANSIT:'blue'};return `<span class="badge ${tone[d.status]||'gray'}">${esc(labels[d.status]||d.status)}</span>`}
function st38Row(o){
 const run=Number(o.dispatch?.run)||0;
 return orderSummaryRow(o,{className:'st38-row order-compact-row',statusHtml:st38OrderBadge(o),itemCount:o.dispatch?dspScopedItems(o).length:activeItemsOf(o).length,extras:run?[{html:o.storeOrderKind==='PARTIAL'?'سفارش جزئی':`سرویس ${run===2?'دوم':'اول'}`}]:[],actionsHtml:`<button type="button" class="btn btn-secondary btn-sm" data-action="${o.dispatch?'store-delivery-details':'store-order-details'}" data-id="${esc(o.id)}" data-run="${run}">جزئیات سفارش</button>`});
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
  const actions=`<button type="button" class="btn btn-secondary btn-sm" data-action="store-order-details" data-id="${esc(o.id)}">${icon('eye',13)} جزئیات سفارش</button>${o.status==='STORE_PENDING_SALES'?`<button type="button" class="btn btn-secondary btn-sm" data-action="edit-store-order" data-id="${esc(o.id)}">${icon('edit',13)} ویرایش</button><button type="button" class="btn btn-ghost btn-sm danger-text" data-action="cancel-store-order" data-id="${esc(o.id)}">${icon('trash',13)} لغو</button>`:''}`;
  return orderSummaryRow(o,{className:'st-registered-card',statusHtml:`<span class="badge ${o.status==='CANCELLED'?'gray':o.status==='CLOSED'?'green':'blue'}">${esc(status)}</span>`,itemCount:items.length,extras,actionsHtml:actions}).replace(' data-order=', ' data-store-order-id="'+esc(o.id)+'" data-order=');
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
        $('#storeRegisteredList').innerHTML=(data.orders||[]).map(stRegisteredRow).join('')||sdEmpty('receipt','هنوز سفارشی ثبت نشده است','سفارش‌های ثبت‌شدهٔ همین حساب فروشگاه در این بخش نمایش داده می‌شوند.');
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
      </section></div><section class="sd-panel st-registered-panel"><header class="st-registered-head"><div><h2>سفارش‌های ${isPartial?'جزئی':'روزانه'} ثبت‌شده</h2><p>هر سفارش را به‌صورت مستقل پیگیری کنید.</p></div></header><div class="st-registered-scroll"><div id="storeKindList" class="st-registered-list" aria-live="polite">در حال دریافت…</div></div><div id="storeKindPages" class="st-registered-pages"></div></section>`:''}    ${isDeliveryView?`<section class="st38-delivery-panel sd-panel"><header class="st38-delivery-heading"><div><span class="eyebrow">STORE DELIVERY</span><h2>تحویل سفارش‌ها</h2><p>وضعیت ارسال سفارش‌ها و محموله‌های فروشگاه را از این بخش پیگیری کنید.</p></div></header><nav class="store-delivery-tabs" aria-label="وضعیت تحویل"><button type="button" class="${app.storeDeliveryTab==='inProgress'?'active':''}" data-store-delivery-tab="inProgress">در حال تحویل <b>${qty(transitOrders.length)}</b></button><button type="button" class="${app.storeDeliveryTab==='delivered'?'active':''}" data-store-delivery-tab="delivered">تحویل شده <b>${qty(deliveredViews.length)}</b></button></nav><div id="storeDeliveryRows" class="st38-delivery-list">${app.storeDeliveryTab==='delivered'?deliveredViews.map(st38DeliveredRow).join('')||sdEmpty('check','محموله‌ای تحویل نشده است','پس از ثبت تحویل راننده در این بخش نمایش داده می‌شود.'):transitOrders.map(st38Row).join('')||sdEmpty('truck','سفارشی در حال تحویل نیست','سفارش پس از واگذاری به راننده در این بخش قرار می‌گیرد.')}</div></section>`:''}
  </div>`;
  bindStoreScope();
  if(isDeliveryView){$('#content #storeOrderForm')?.remove();$('#content .st38-grid')?.remove();}else{app.storeDraft=[defaultOrderLine()];renderOrderLineArea('store','storeDraft');}
  let kindOffset=0,kindSeq=0;
  async function loadKindList(){
    const request=++kindSeq,host=$('#storeKindList');if(!host)return;
    try{const data=await api(`/api/store/orders?kind=${isPartial?'PARTIAL':'BULK'}&offset=${kindOffset}&limit=25${storeScopeQuery()}`);
      if(request!==kindSeq||!host.isConnected)return;
      if(kindOffset>0&&kindOffset>=data.total){kindOffset=data.total?Math.floor((data.total-1)/25)*25:0;return loadKindList();}
      host.innerHTML=(data.orders||[]).map(stRegisteredRow).join('')||'<div class="empty">سفارشی از این نوع ثبت نشده است.</div>';
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
  app.timer=setInterval(async()=>{try{if(document.activeElement?.closest?.('#storeOrderForm, #storeKindList, #storeKindPages'))return;if(!isDeliveryView)void loadKindList();const x=(await storeAllOrders()).orders||[];const done=x.flatMap((o)=>st38ViewsOf(o)).filter(v=>v.dispatch&&['DELIVERED','SALES_FINALIZED','CLOSED'].includes(v.dispatch.status)).sort((a,b)=>String(b.dispatch.deliveredAt||'').localeCompare(String(a.dispatch.deliveredAt||'')));const moving=x.filter(o=>o.dispatch&&['ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT'].includes(o.dispatch.status)).sort((a,b)=>String(b.dispatch.assignedAt||b.updatedAt||'').localeCompare(String(a.dispatch.assignedAt||a.updatedAt||'')));const staged=new Set(x.filter((o)=>{const vs=st38ViewsOf(o);return vs.some(v=>v.dispatch&&['DELIVERED','SALES_FINALIZED','CLOSED','ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT'].includes(v.dispatch.status))||(o.dispatch&&['ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT'].includes(o.dispatch.status));}));const incoming=x.filter(o=>!staged.has(o)&&o.status!=='CANCELLED'&&o.approvalStatus!=='CANCELLED').sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));const deliveryEl=$('#storeDeliveryRows');if(deliveryEl){const transitViews=x.flatMap(o=>st38ViewsOf(o)).filter(v=>v.dispatch&&['ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT'].includes(v.dispatch.status));const deliveredNow=x.flatMap(o=>st38ViewsOf(o)).filter(v=>v.dispatch&&['DELIVERED','SALES_FINALIZED','CLOSED'].includes(v.dispatch.status));deliveryEl.innerHTML=app.storeDeliveryTab==='delivered'?(deliveredNow.map(st38DeliveredRow).join('')||sdEmpty('check','محموله‌ای تحویل نشده است','پس از ثبت تحویل راننده در این بخش نمایش داده می‌شود.')):(transitViews.map(st38Row).join('')||sdEmpty('truck','سفارشی در حال تحویل نیست','سفارش پس از واگذاری به راننده در این بخش قرار می‌گیرد.'));const dtabs=$$('.store-delivery-tabs b');if(dtabs[0])dtabs[0].textContent=qty(transitViews.length);if(dtabs[1])dtabs[1].textContent=qty(deliveredNow.length);}const inEl=$('#storeIncomingList'),movingEl=$('#storeTransitList'),doneEl=$('#storeDeliveredList');if(inEl)inEl.innerHTML=incoming.map(st38Row).join('')||sdEmpty('receipt','سفارش ورودی ندارید','سفارش‌های تازه پس از ثبت در این ستون دیده می‌شوند.');if(movingEl)movingEl.innerHTML=moving.map(st38Row).join('')||sdEmpty('truck','سفارشی در مسیر نیست','پس از واگذاری سفارش به راننده در این ستون ظاهر می‌شود.');if(doneEl)doneEl.innerHTML=done.map(st38DeliveredRow).join('')||sdEmpty('check','سفارشی تحویل نشده است','پس از ثبت تحویل راننده در این ستون نمایش داده می‌شود.');const counts=$$('.st38-store-stage .sd-count strong');if(counts[0])counts[0].textContent=qty(incoming.length);if(counts[1])counts[1].textContent=qty(moving.length);if(counts[2])counts[2].textContent=qty(done.length);}catch{}},3500);
}

/* ================================================================
   قدم ۴ — داشبورد + گزارش‌ها + مدیریت (v38)
   ================================================================ */

