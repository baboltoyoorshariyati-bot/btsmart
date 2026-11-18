'use strict';
// Missing kind denotes the historical two-service store order.  Keep the
// discriminator immutable after creation so existing orders cannot be
// reinterpreted halfway through warehouse or transport operations.
const BULK='BULK', PARTIAL='PARTIAL', CUSTOMER='CUSTOMER', STOCK='STOCK';
function kind(order){return order?.storeOrderKind===PARTIAL?PARTIAL:BULK;}
function isPartial(order){return order?.orderType==='STORE'&&kind(order)===PARTIAL;}
function normalizeNew(body){
 const k=body?.storeOrderKind===undefined?BULK:body.storeOrderKind;
 if(![BULK,PARTIAL].includes(k))throw Object.assign(new Error('نوع سفارش فروشگاه معتبر نیست.'),{status:400});
 if(k===BULK){
  if(body?.storePurpose!==undefined&&body.storePurpose!==null&&body.storePurpose!=='')throw Object.assign(new Error('هدف فقط برای سفارش جزئی تعیین می‌شود.'),{status:400});
  return {storeOrderKind:BULK,storePurpose:null};
 }
 if(![CUSTOMER,STOCK].includes(body?.storePurpose))throw Object.assign(new Error('هدف سفارش جزئی را انتخاب کنید.'),{status:400});
 return {storeOrderKind:PARTIAL,storePurpose:body.storePurpose};
}
function allowedRuns(order){return isPartial(order)?[1]:[1,2];}
module.exports={BULK,PARTIAL,CUSTOMER,STOCK,kind,isPartial,normalizeNew,allowedRuns};
