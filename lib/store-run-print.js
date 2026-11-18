'use strict';
const SR=require('./store-runs');
const {storeDisplayName}=require('./store-name');

function runParts(order,run){
 const sh=SR.runShipmentOf(order,run),dispatch=SR.runDispatchOf(order,run);
 const weights=Object.keys(sh?.weights||{}).length?sh.weights:(dispatch?.shipmentWeights||{});
 const ids=sh?.itemIds?.length?sh.itemIds:(dispatch?.shipmentItemIds?.length?dispatch.shipmentItemIds:Object.keys(weights));
 return {sh,dispatch,weights,ids};
}
function applyCorrections(order,run,lines){
 const corrections=order?.storeDocumentCorrections?.[String(run)];
 if(!Array.isArray(corrections)||!corrections.length)return lines;
 const byId=new Map(corrections.map(row=>[String(row.itemId),row]));
 return lines.map(line=>{
  const corrected=byId.get(String(line.itemId||''));
  if(!corrected)return line;
  return {...line,productId:corrected.productId||line.productId,productName:corrected.productName||line.productName,deliveredKg:corrected.outOfStock?0:Number(corrected.deliveredKg),outOfStock:!!corrected.outOfStock,weighings:corrected.weighings??null,missingWeighings:!!corrected.missingWeighings};
 });
}
function serviceDocument(db,order,run,getProduct){
 if(!order||order.orderType!=='STORE'||![1,2].includes(run))return null;
 const {sh,dispatch,weights,ids}=runParts(order,run);
 const pay=db.payments.find(p=>p.orderId===order.id&&Number(p.deliveryRun)===run);
 if(!sh&&!dispatch&&!pay)return null;
 const items=db.orderItems.filter(i=>i.orderId===order.id);
 let lines=ids.map(id=>{
  const item=items.find(i=>i.id===id);if(!item)return null;
  const amount=Object.prototype.hasOwnProperty.call(weights,id)?Number(weights[id]):(run===1?SR.r1Kg(item):SR.r2Kg(item));
  const delivery=Array.isArray(dispatch?.lines)?dispatch.lines.find(x=>x.itemId===id):null;
  return amount>0?{itemId:id,productId:item.productId,productName:dispatch?.priceLines?.find(x=>x.itemId===id)?.productName||getProduct(item.productId)?.name||'کالای حذف‌شده',deliveredKg:amount,returnKg:delivery?Number(delivery.returnKg||0):null,shortageKg:delivery?Number(delivery.shortageKg||0):null,netKg:delivery?.netKg==null?null:Number(delivery.netKg)}:null;
 }).filter(Boolean);
 if(!lines.length&&Array.isArray(pay?.priceLines))lines=pay.priceLines.filter(x=>Number.isFinite(Number(x.deliveredKg))&&Number(x.deliveredKg)>=0).map(x=>({...((x.itemId)?{itemId:x.itemId}:{}),productName:x.productName||'کالا',deliveredKg:null,returnKg:x.returnKg==null?null:Number(x.returnKg),shortageKg:null,netKg:Number(x.deliveredKg)}));
 lines=applyCorrections(order,run,lines);
 if(!lines.length)return null;
 return {storeOrderKind:order.storeOrderKind||'BULK',orderId:order.id,orderNo:order.orderNo||'—',storeName:storeDisplayName(order.storeName,order.branchNo),dispatchPlace:order.dispatchPlace||'',run,sentAt:sh?.sentAt||dispatch?.sentAt||pay?.verifiedAt||null,lines};
}
module.exports={serviceDocument};

// Separate warehouse handover document. Only the outgoing weight belongs here;
// returned/net weights describe later events and must not be substituted for it.
function warehouseServiceDocument(db,order,run,getProduct){
 if(!order||order.orderType!=='STORE'||![1,2].includes(run))return null;
 const {sh,dispatch,weights,ids}=runParts(order,run);
 const customerName=order.storeOrderKind==='PARTIAL'&&order.storePurpose==='CUSTOMER'?String((db.customers||[]).find(c=>c.id===order.customerId)?.name||''):'';
 const saved=order.transportWorkflow===1&&order.transportHandovers?.[String(run)]?.document;
 if(saved){
  const savedLines=(saved.lines||[]).map((line,index)=>({...line,itemId:line.itemId||ids[index]||'',productId:line.productId||db.orderItems.find(item=>item.orderId===order.id&&item.id===(line.itemId||ids[index]))?.productId||''}));
  return {storeOrderKind:order.storeOrderKind||'BULK',customerName,...saved,lines:applyCorrections(order,run,savedLines),handedOverToDriver:true};
 }
 const report=serviceDocument(db,order,run,getProduct);
 if(!report)return null;
 const items=(db.orderItems||[]).filter(i=>i.orderId===order.id);
 let lines=ids.map(id=>{
  const item=items.find(i=>i.id===id);if(!item)return null;
  const amount=Object.prototype.hasOwnProperty.call(weights,id)?Number(weights[id]):(run===1?SR.r1Kg(item):SR.r2Kg(item));
  if(!(amount>0))return null;
  return {itemId:id,productId:item.productId,productName:dispatch?.priceLines?.find(x=>x.itemId===id)?.productName||getProduct(item.productId)?.name||'کالای حذف‌شده',requestedQty:item.requestedQty??null,requestedUnit:item.requestedUnit||'',deliveredKg:amount,weighings:(run===1?item.runR1||[]:item.runR2||[]).flatMap(e=>Array.isArray(e.weighings)?e.weighings:[]),missingWeighings:(run===1?item.runR1||[]:item.runR2||[]).some(e=>!Array.isArray(e.weighings))};
 }).filter(Boolean);
 // Old payment-only records have net, not outgoing, weight. Never invent the missing weight.
 if(!lines.length)lines=report.lines.map(x=>({itemId:x.itemId,productId:x.productId||'',productName:x.productName,requestedQty:null,requestedUnit:'',deliveredKg:x.deliveredKg}));
 lines=applyCorrections(order,run,lines);
 const planned=order.transportWorkflow===1 ? order.transportAssignments?.[String(run)] : null;
 const driverName=String(order.transportWorkflow===1 ? planned?.driverName||'' : dispatch?.driverName||'').trim();
 const driverStatus=driverName?'ASSIGNED':((order.transportWorkflow===1||sh?.status==='PENDING_SALES'||dispatch?.status==='PENDING_ASSIGN')?'PENDING':'UNKNOWN');
 return {...(order.transportWorkflow===1?{handedOverToDriver:false}:{}),driverStatus,customerName,storeOrderKind:order.storeOrderKind||'BULK',orderId:order.id,orderNo:order.orderNo||'—',warehouseDocumentNo:order.storeWarehouseDocumentNos?.[run]||'',storeName:report.storeName,createdAt:order.createdAt||null,run,sentAt:report.sentAt,driverName,lines};
}
module.exports.warehouseServiceDocument=warehouseServiceDocument;
