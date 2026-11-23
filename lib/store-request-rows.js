'use strict';
// Reconstruct the individual approved request rows without inventing a weight
// allocation. Weights are measured per order item, not per request line.
function storeRequestRows(order,items,getProduct){
 if(order?.orderType!=='STORE'||order.storeOrderKind!=='PARTIAL')return [];
 const requests=(order.storeAdditionRequests||[]).filter(r=>r.status==='ACCEPTED');
 const result=[];
 for(const item of items.filter(i=>i.itemStatus!=='CANCELLED')){
  const changes=requests.flatMap(r=>(r.changes||[]).filter(c=>c.itemId===item.id).map(c=>({r,c})));
  const name=getProduct(item.productId)?.name||item.product?.name||'کالای حذف‌شده';
  const first=changes[0]?.c;
  if(!first||Object.hasOwn(first,'before'))result.push({itemId:item.id,productName:name,requestedQty:first?first.before:item.requestedQty,requestedUnit:item.requestedUnit||'',description:item.description||'',source:'ORIGINAL'});
  for(const {r} of changes)for(const line of r.items||[]){
   if(line.productId!==item.productId || line.requestedUnit!==item.requestedUnit)continue;
   result.push({itemId:item.id,productName:line.productName||name,requestedQty:line.requestedQty,requestedUnit:line.requestedUnit||'',description:line.description||'',source:'ADDITION',requestedAt:r.requestedAt||null});
  }
 }
 return result;
}
module.exports=storeRequestRows;
