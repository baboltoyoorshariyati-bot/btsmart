'use strict';
// A preparation draft is not a delivery, a warehouse document or a final weight.
const {fail}=require('./http');
const validate=require('./validate');
const {weighingsFor}=require('./warehouse-weighing');
const itemNote=require('./warehouse-item-note');
function revision(order){return Number.isSafeInteger(order.warehouseWeightDraft?.revision)?order.warehouseWeightDraft.revision:0;}
function checkRevision(order,expected,required=false){
 if(expected===undefined&&!required)return;
 if(!Number.isSafeInteger(expected)||expected<0)fail(400,'نسخهٔ وزن ذخیره‌شده معتبر نیست.');
 if(expected!==revision(order))fail(409,'وزن ذخیره‌شده توسط کاربر دیگری تغییر کرده است؛ سفارش را دوباره باز کنید.');
}
function prepare(order,items,body,actor,now){
 if(order.orderType==='STORE')fail(409,'وزن فروشگاه در سرویس مربوط ثبت می‌شود.');
 if(order.status!=='WAREHOUSE_PREPARING'||order.pickupHandover||order.transportHandovers?.['0']||order.pickupCancellation)fail(409,'در وضعیت فعلی ذخیرهٔ وزن آماده‌سازی مجاز نیست.');
 checkRevision(order,body?.revision,true);
 if(!Array.isArray(body?.items)||body.items.length>100)fail(400,'فهرست وزن‌های آماده‌سازی معتبر نیست.');
 const active=new Map(items.filter(i=>i.orderId===order.id&&i.itemStatus!=='CANCELLED').map(i=>[i.id,i])),seen=new Set();
 const rows=body.items.map(x=>{
  if(!x||typeof x.itemId!=='string'||!active.has(x.itemId)||seen.has(x.itemId))fail(400,'اقلام وزن آماده‌سازی نامعتبر یا تکراری است.');
  seen.add(x.itemId);
  const note=itemNote.normalize(x.note);
  if(x.outOfStock===true)return {itemId:x.itemId,outOfStock:true,deliveredKg:0,weighings:null,note};
  if(x.outOfStock!==undefined&&x.outOfStock!==false)fail(400,'وضعیت موجودی معتبر نیست.');
  const weighing=weighingsFor(x.weighings);
  const kg=weighing?weighing.netKg:validate.number(x.deliveredKg,{field:'وزن خالص',min:0.001,max:validate.MAX_QTY});
  if(Math.abs(kg*1000-Math.round(kg*1000))>0.000001)fail(400,'وزن خالص حداکثر سه رقم اعشار دارد.');
  return {itemId:x.itemId,outOfStock:false,deliveredKg:kg,weighings:weighing?.rows||null,note};
 });
 const sealNumbers=require('./warehouse-seals').fromBody(body,order.warehouseWeightDraft?.sealNumbers||[]);
 return {revision:revision(order)+1,items:rows,sealNumbers,savedAt:now,savedBy:actor.id};
}
module.exports={revision,checkRevision,prepare};
