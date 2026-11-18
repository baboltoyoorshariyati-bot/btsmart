'use strict';
// Serialize old order mutations against the new pickup transactions, then
// reject shortcuts while a pickup visit or cancellation is in progress.
const store=require('./store');
const {fail}=require('./http');
const transaction=require('./transport-transaction');
function pickup(o){return o?.orderType==='REMOTE'&&o.deliveryMode==='PICKUP';}
function withPickupOrderLock(ctx, work){
 const initial=store.get().orders.find(o=>o.id===ctx.params.id);
 if(!pickup(initial)) return work();
 return transaction(()=>{
  const db=store.get(),o=db.orders.find(x=>x.id===ctx.params.id);
  if(!o) fail(404,'سفارش یافت نشد.');
  if(!pickup(o)) fail(409,'روش تحویل سفارش تغییر کرده است؛ دوباره بررسی کنید.');
  const path=ctx.url.pathname;
  const openVisits=db.visits.filter(v=>v.orderId===o.id&&v.status==='PICKUP_PRESENT');
  const visit=openVisits.find(v=>v.id===o.visitId);
  if(openVisits.length && (!visit || openVisits.length!==1)) fail(409,'اطلاعات مراجعهٔ باز سفارش ناسازگار است؛ ابتدا باید بررسی شود.');
  if(o.pickupCancellation?.status==='PENDING_SALES') fail(409,'درخواست انصراف در انتظار بررسی فروش است؛ سایر عملیات متوقف است.');
  if(visit && /\/(cancel-remote|send-dispatch)$/.test(path)) fail(409,'مراجعهٔ باز باید از گردش انصراف و خروج تعیین تکلیف شود.');
  if((visit || o.pickupWorkflow===1 || (require('./pickup-feature').enabled() && !o.warehouseCompletedAt)) && /\/warehouse$/.test(path)) fail(409,'وزن و تحویل واقعی این مراجعه باید هم‌زمان از گردش تحویل ثبت شود.');
  if((visit||o.pickupHandover) && /\/exit$/.test(path)) fail(409,'خروج این مراجعه باید از کنترل خروج سفارش غیرحضوری انجام شود.');
  if(o.pickupHandover && /\/(reopen-preparing|send-dispatch)$/.test(path)) fail(409,'پس از تحویل واقعی، تغییر مسیر سفارش مجاز نیست.');
  if(visit && /\/remote$/.test(path) && Object.hasOwn(ctx.body,'deliveryDate') && (ctx.body.deliveryDate||null)!==(o.deliveryDate||null)) fail(409,'تاریخ تحویل با مراجعهٔ باز قابل تغییر نیست.');
  if(o.pickupHandover && /\/settle$/.test(path)) {
   const lines=o.pickupHandover.document?.items||[];
   if((Array.isArray(ctx.body.items)?ctx.body.items:[]).some(i=>i?.cancelled && lines.some(x=>x.itemId===i.itemId && !x.outOfStock && Number(x.deliveredKg)>0))) fail(409,'قلم تحویل‌شده را نمی‌توان در تسویه لغو کرد.');
  }
  return work();
 });
}
module.exports={withPickupOrderLock};
