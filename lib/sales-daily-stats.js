'use strict';
// The summary uses recorded invoice totals, not money collected. Item values
// are shown before invoice-wide adjustments; never invent weights or allocations.
function salesDailyStats(db,day,dayOf){
 const products=new Map((db.products||[]).map(p=>[p.id,p]));
 const orders=new Map((db.orders||[]).map(o=>[o.id,o]));
 const itemsByOrder=new Map(),itemsById=new Map();
 for(const item of db.orderItems||[]){if(!itemsByOrder.has(item.orderId))itemsByOrder.set(item.orderId,[]);itemsByOrder.get(item.orderId).push(item);itemsById.set(item.id,item);}
 const orderRows=new Map(),units=Object.create(null),round=n=>Math.round((n+Number.EPSILON)*1000)/1000;
 function nameFor(id,fallback){return products.get(id)?.name||fallback||'کالای نامشخص';}
 for(const o of orders.values()){
  if(o.status==='CANCELLED'||dayOf(o.createdAt)!==day)continue;
  for(const item of itemsByOrder.get(o.id)||[]){
   if(item.itemStatus==='CANCELLED')continue;
   const quantity=Number(item.requestedQty),unit=String(item.requestedUnit||'نامشخص');if(!Number.isFinite(quantity)||quantity<=0)continue;
   const key=item.productId||'unknown';if(!orderRows.has(key))orderRows.set(key,{productId:item.productId||'',productName:nameFor(item.productId,item.productName),units:Object.create(null)});
   const row=orderRows.get(key);row.units[unit]=round((row.units[unit]||0)+quantity);units[unit]=round((units[unit]||0)+quantity);
  }
 }
 const activePayments=(db.payments||[]).filter(p=>!p.archived&&dayOf(p.verifiedAt||p.createdAt)===day&&orders.has(p.orderId)&&orders.get(p.orderId).status!=='CANCELLED');
 const paymentCounts=new Map();for(const p of (db.payments||[]).filter(p=>!p.archived))paymentCounts.set(p.orderId,(paymentCounts.get(p.orderId)||0)+1);
 const saleRows=new Map();let total=0,adjustments=0,unallocated=0;
 for(const p of activePayments){
  const final=Number(p.totalAmount)||0;total+=final;
  const order=orders.get(p.orderId),hasSnapshot=Array.isArray(p.priceLines)&&p.priceLines.length>0;
  let lines=hasSnapshot?p.priceLines:[];
  // Only a unique ordinary invoice can safely use the current order items.
  if(!hasSnapshot&&paymentCounts.get(p.orderId)===1&&!p.deliveryRun&&order.orderType!=='STORE')lines=(itemsByOrder.get(order.id)||[]).filter(i=>!['CANCELLED','OUT_OF_STOCK'].includes(i.itemStatus)).map(i=>({itemId:i.id,amount:i.finalAmount??Math.round(Number(i.deliveredKg||0)*Number(i.unitPrice||0))}));
  let lineSum=0,known=false;
  for(const line of lines){
   if(line.amount===null||line.amount===undefined||!Number.isFinite(Number(line.amount)))continue;
   const amount=Number(line.amount),item=itemsById.get(line.itemId),id=item?.productId||line.productId||'';
   const key=id||('snapshot:'+String(line.productName||line.itemId||'unknown'));
   if(!saleRows.has(key))saleRows.set(key,{productId:id,productName:nameFor(id,line.productName),amount:0});
   saleRows.get(key).amount+=amount;lineSum+=amount;known=true;
  }
  if(known)adjustments+=final-lineSum;else unallocated+=final;
 }
 const sort=(a,b)=>a.productName.localeCompare(b.productName,'fa');
 return {day,sales:{total,invoices:activePayments.length,rows:[...saleRows.values()].sort(sort),adjustments,unallocated},orders:{kg:units['کیلوگرم']||0,units,rows:[...orderRows.values()].sort(sort)}};
}
module.exports={salesDailyStats};
