'use strict';
// Experimental stage only. Prepared invoices are NOT payments and departure or
// printing never imply customer delivery. The legacy workflow stays untouched.
const { atomicRoute: route,fail}=require('../http');
const store=require('../store');
const validate=require('../validate');
const {assertEnabled}=require('../transport-planning');
const {createNotification}=require('../domain');
const SALES={roles:['sales']};
const SALES_READ={roles:['sales','admin']};
const TRANSPORT={roles:['dispatch']};
const transaction=require('../transport-transaction');
function orderFor(id){
 try{assertEnabled();}catch(e){fail(e.status||503,e.message);}
 const o=store.get().orders.find(x=>x.id===id);if(!o)fail(404,'سفارش یافت نشد.');
 if(o.transportWorkflow!==1||o.deliveryMode!=='DELIVERY'||o.orderType==='STORE')fail(409,'این مسیر فعلاً فقط برای سفارش عادی پخش است.');
 if(o.deposit)fail(409,'سفارش دارای بیعانه قابل ارسال توسط پخش نیست.');
 return o;
}
function invoiceDraft(order,body){
 if(order.status!=='SETTLEMENT_PENDING')fail(409,'ابتدا وزن نهایی سفارش باید ثبت شود.');
 const handover=order.transportHandovers?.['0'];
 if(!(handover?.physicalHandoverConfirmed||handover?.signedPaperConfirmed)||!handover.document)fail(409,'ابتدا تحویل فیزیکی انبار به راننده ثبت شود و سند برای امضای دستی چاپ شود.');
 const items=(handover.document.items||[]).filter(i=>!i.outOfStock&&Number(i.deliveredKg)>0);
 if(!items.length||items.some(i=>!i.itemId))fail(409,'شناسه اقلام در سند تحویل موجود نیست؛ بررسی مدیر لازم است.');
 if(!Array.isArray(body.items)||body.items.length!==items.length)fail(400,'قیمت تمام اقلام تحویلی را ثبت کنید.');
 const rows=new Map();for(const r of body.items){const id=String(r?.itemId||'');if(!id||rows.has(id))fail(400,'فهرست اقلام فاکتور نامعتبر است.');rows.set(id,r);}
 const priceLines=items.map(i=>{
  const row=rows.get(String(i.itemId));if(!row)fail(400,'قیمت تمام اقلام تحویلی را ثبت کنید.');
  const unitPrice=validate.number(row.unitPrice,{field:'قیمت هر کیلو',min:1,max:validate.MAX_MONEY});
  if(!Number.isSafeInteger(unitPrice))fail(400,'قیمت واحد باید مبلغ صحیح ریال باشد.');
  const deliveredKg=Number(i.deliveredKg),amount=Math.round(deliveredKg*unitPrice);
  if(!Number.isSafeInteger(amount)||amount>validate.MAX_MONEY)fail(400,'مبلغ قلم از حد مجاز بیشتر است.');
  return {itemId:i.itemId,productName:i.productName,deliveredKg,unitPrice,amount};
 });
 const subtotal=priceLines.reduce((sum,i)=>sum+i.amount,0);
 if(!Number.isSafeInteger(subtotal)||subtotal>validate.MAX_MONEY)fail(400,'جمع فاکتور از حد مجاز بیشتر است.');
 const amounts=validate.settlementAmounts(subtotal,body);
 return {priceLines,...amounts,customerName:handover.document.customerName,customerPhone:handover.document.customerPhone,warehouseDocumentNo:handover.document.warehouseDocumentNo,driverName:handover.driverName,vehiclePlate:handover.vehiclePlate};
}
route('POST','/api/sales/transport-invoices/:id', {...SALES,idempotent:true},ctx=>transaction(()=>{
 const order=orderFor(ctx.params.id);
 if(order.transportInvoice)fail(409,'فاکتور پیش از خروج قبلاً ثبت شده است.');
 const draft=invoiceDraft(order,ctx.body||{}); // validate everything before allocating a number
 const now=store.nowIso(),invoice={...draft,invoiceNumber:store.nextInvoiceNumber(),createdAt:now,createdBy:ctx.user.id,status:'PREPARED'};
 order.transportInvoice=invoice;order.updatedAt=now;
 store.audit(ctx.user,'TRANSPORT_INVOICE_PREPARED','order',order.id,{invoiceNumber:invoice.invoiceNumber,warehouseDocumentNo:invoice.warehouseDocumentNo,totalAmount:invoice.totalAmount},ctx);
 createNotification('gate','TRANSPORT_INVOICE_READY','order',order.id,`فاکتور سفارش ${order.orderNo||'—'} برای تحویل به راننده آماده است.`);
 return {status:201,body:{invoice}};
}));
route('GET','/api/sales/transport-invoices/:id',SALES_READ,ctx=>{
 const o=orderFor(ctx.params.id);if(!o.transportInvoice)fail(404,'فاکتور پیش از خروج هنوز ثبت نشده است.');
 return {body:{invoice:o.transportInvoice,orderNo:o.orderNo,orderId:o.id,dispatchPlace:o.dispatchPlace||''}};
});
// چاپ برگهٔ ارسال، پایان کار فروش روی این سفارش است: پس از آن فاکتور «صادرشده»
// شمرده می‌شود و از صف «آماده تسویه» بیرون می‌رود (بازگشت‌پذیر نیست؛ فقط ثبت یک‌بار).
route('POST','/api/sales/transport-invoices/:id/printed',{...SALES,idempotent:true},ctx=>transaction(()=>{
 const order=orderFor(ctx.params.id),invoice=order.transportInvoice;
 if(!invoice)fail(409,'فاکتور پیش از خروج هنوز صادر نشده است.');
 if(invoice.status!=='PREPARED')return {body:{invoice}};
 if(invoice.printedAt)return {body:{invoice}};
 const now=store.nowIso();
 order.transportInvoice={...invoice,printedAt:now,printedBy:ctx.user.id};
 order.updatedAt=now;
 store.audit(ctx.user,'TRANSPORT_SHIPMENT_NOTE_PRINTED','order',order.id,{invoiceNumber:invoice.invoiceNumber},ctx);
 store.save();
 return {body:{invoice:order.transportInvoice}};
}));
route('POST','/api/transport/shipments/:id/depart',{...TRANSPORT,idempotent:true},()=>fail(403,'تأیید خروج سفارش پس از صدور فاکتور فقط توسط نگهبانی انجام می‌شود.'));
route('POST','/api/gate/transport-shipments/:id/depart',{roles:['gate','admin'],idempotent:true},ctx=>transaction(()=>{
 const order=orderFor(ctx.params.id),invoice=order.transportInvoice,handover=order.transportHandovers?.['0'];
 if(order.transportDeparture)return {body:{departure:{at:order.transportDeparture.at,driverName:order.transportDeparture.driverName,vehiclePlate:order.transportDeparture.vehiclePlate}}};
 if(order.status!=='SETTLEMENT_PENDING'||!(handover?.physicalHandoverConfirmed||handover?.signedPaperConfirmed)||!invoice||invoice.status!=='PREPARED')fail(409,'ابتدا تحویل انبار و تهیه فاکتور فروش انجام شود.');
 const now=store.nowIso(),departure={at:now,by:ctx.user.id,driverId:handover.driverId,driverName:handover.driverName,vehicleId:handover.vehicleId,vehiclePlate:handover.vehiclePlate,invoiceNumber:invoice.invoiceNumber};
 order.transportDeparture=departure;order.updatedAt=now;
 store.audit(ctx.user,'TRANSPORT_DEPARTURE','order',order.id,departure,ctx);
 createNotification('sales','TRANSPORT_DEPARTED','order',order.id,`خروج سفارش ${order.orderNo||'—'} ثبت شد؛ روش پرداخت و مرجوعی را در کارتابل فروش ثبت کنید.`);
 return {body:{departure:{at:departure.at,driverName:departure.driverName,vehiclePlate:departure.vehiclePlate}}};
}));
// Sales records payment and optional merchandise returns in one step. Paperwork
// checks and customer-signature acknowledgements are not part of this workflow.
// Outstanding credit and pending cheques remain in the customer debt account;
// a pending cheque is reserved, never treated as collected.
route('POST','/api/sales/transport-invoices/:id/close',{...SALES,idempotent:true},ctx=>transaction(()=>{
 const order=orderFor(ctx.params.id),db=store.get(),invoice=order.transportInvoice,arrival=order.transportReturn,body=ctx.body||{};
 if(order.status!=='SETTLEMENT_PENDING'||!invoice||invoice.status!=='PREPARED'||!order.transportDeparture)fail(409,'ابتدا فاکتور و خروج پخش باید ثبت شوند.');
 if(db.payments.some(p=>p.orderId===order.id))fail(409,'فاکتور این سفارش قبلاً بسته شده است.');
 if(!Array.isArray(body.settlementMethods))fail(400,'روش‌های تسویه را مشخص کنید.');
 const input=body.returns===undefined?[]:body.returns;
 if(!Array.isArray(input)||input.length>invoice.priceLines.length)fail(400,'فهرست مرجوعی نامعتبر است.');
 const map=new Map();for(const r of input){const id=String(r?.itemId||'');if(!id||map.has(id)||!invoice.priceLines.some(l=>l.itemId===id))fail(400,'قلم مرجوعی تکراری یا نامعتبر است.');map.set(id,r);}
 const lines=invoice.priceLines.map(line=>{
  const r=map.get(line.itemId),kg=r?validate.number(r.returnKg,{field:'وزن مرجوعی',min:0,max:Number(line.deliveredKg)}):0;
  if(Math.abs(kg*1000-Math.round(kg*1000))>1e-7)fail(400,'وزن مرجوعی حداکثر سه رقم اعشار دارد.');
  const reason=r?validate.text(r.reason||'',{field:'علت مرجوعی',max:300}):'';
  const returnAmount=Math.round(kg*line.unitPrice);
  return {...line,returnKg:kg,returnAmount,netKg:+(line.deliveredKg-kg).toFixed(3),netAmount:line.amount-returnAmount,reason};
 });
 if(arrival?.outcome==='NOT_DELIVERED'&&lines.some(l=>l.returnKg!==l.deliveredKg))fail(409,'برای سفارش ثبت‌شده به‌عنوان تحویل‌نشده، همه اقلام باید به‌طور کامل مرجوع ثبت شوند.');
 const returnProductValue=lines.reduce((sum,l)=>sum+l.returnAmount,0);
 const allReturned=lines.every(l=>l.returnKg===l.deliveredKg);
 // A complete return cancels the invoice including adjustments. For a partial
 // return the deduction cannot exceed the invoiced amount.
 const deduction=allReturned?invoice.totalAmount:Math.min(returnProductValue,invoice.totalAmount);
 const totalAmount=invoice.totalAmount-deduction;
 const methods=require('../settlement-methods').cleanRows(body.settlementMethods,totalAmount,db);
 const seenChecks=new Set();for(const m of methods.filter(x=>x.type==='CHECK')){const key=`${m.bank}\0${m.checkNumber}`;if(seenChecks.has(key))fail(400,'چک تکراری در تسویه ثبت شده است.');seenChecks.add(key);}
 const outstanding=methods.filter(m=>m.type==='CREDIT'||m.type==='CHECK').reduce((s,m)=>s+m.amount,0);
 const customerId=require('../customer-debts').customerId(db,order);
 if(outstanding&&(!order.debtTrackingEnabled||!customerId||!db.customers.some(c=>c.id===customerId)))fail(409,'برای ثبت معوق یا چک باید پرونده مشتری معتبر باشد.');
 const now=store.nowIso();
 const checks=methods.flatMap((m,index)=>m.type==='CHECK'?[{...m,id:store.uid(),settlementMethodIndex:index,status:'PENDING',createdAt:now,createdBy:ctx.user.id,createdByName:ctx.user.fullName||ctx.user.username}]:[]);
 const debtAccount=outstanding?{customerId,initial:outstanding,receipts:checks}:null;
 const payment={id:store.uid(),orderId:order.id,customerId:order.customerId||null,invoiceNumber:invoice.invoiceNumber,subtotalAmount:invoice.subtotalAmount,discountAmount:invoice.discountAmount,additionsAmount:invoice.additionsAmount,grossAmount:invoice.totalAmount,returnProductValue,returnDeduction:deduction,totalAmount,amountDue:totalAmount,settlementMethods:methods,customerName:invoice.customerName,customerPhone:invoice.customerPhone,signatureData:'',fingerprintRef:'',verificationMode:arrival?.outcome==='DELIVERED'?'PAPER_CUSTOMER_SIGNATURE':arrival?.outcome==='NOT_DELIVERED'?'NOT_DELIVERED':'TRANSPORT_SALES_PAYMENT',verifiedAt:now,settledBy:ctx.user.id,priceLines:lines.map(l=>({itemId:l.itemId,productName:l.productName,deliveredKg:l.netKg,unitPrice:l.unitPrice,amount:l.netAmount,returnKg:l.returnKg})),...(debtAccount?{debtAccount}:{})};
 const returns=lines.filter(l=>l.returnKg>0).map(l=>({id:store.uid(),orderId:order.id,orderNo:order.orderNo||'—',customerName:invoice.customerName,driverName:order.transportDeparture.driverName,driverPlate:order.transportDeparture.vehiclePlate,itemId:l.itemId,productName:l.productName,kg:l.returnKg,reason:l.reason,fullOrder:allReturned,status:'AT_SALES',createdAt:now,deliveredAt:arrival?.outcome==='DELIVERED'?arrival.at:null,salesReferredAt:null,salesReferredBy:'',warehouseReceivedAt:null,warehouseReceivedBy:''}));
 // All validation happens before mutating the SQLite-backed store.
 for(const l of lines){const item=db.orderItems.find(i=>i.id===l.itemId&&i.orderId===order.id);if(item)Object.assign(item,{unitPrice:l.unitPrice,finalAmount:l.netAmount});}
 db.payments.push(payment);for(const r of returns)db.dispatchReturns.push(r);
 order.transportInvoice={...invoice,status:'CLOSED',closedAt:now,closedBy:ctx.user.id,paymentId:payment.id,returnDeduction:deduction,totalAfterReturns:totalAmount};
 Object.assign(order,{status:'CLOSED',updatedAt:now,transportClosedAt:now,transportClosedBy:ctx.user.id});
 store.audit(ctx.user,'TRANSPORT_INVOICE_CLOSED','order',order.id,{invoiceNumber:payment.invoiceNumber,paymentId:payment.id,totalAmount,returnProductValue,returnDeduction:deduction,settlementMethods:methods,returnIds:returns.map(r=>r.id)},ctx);
 if(returns.length)createNotification('sales','DISPATCH_RETURN','order',order.id,`مرجوعی سفارش ${order.orderNo||'—'} نزد واحد فروش ثبت شد.`);
 return {body:{payment,returns}};
}));

function storeService(id,rawRun){
 try{assertEnabled();}catch(e){fail(e.status||503,e.message);}
 const order=store.get().orders.find(o=>o.id===id),run=Number(rawRun);
 if(!order)fail(404,'سفارش یافت نشد.');
 if(order.transportWorkflow!==1||order.deliveryMode!=='DELIVERY'||order.orderType!=='STORE')fail(409,'این مسیر ویژه سرویس فروشگاه است.');
 if(!require('../store-order-kind').allowedRuns(order).includes(run))fail(400,'شماره محموله معتبر نیست.');
 return {order,run,key:String(run)};
}
// The sales review and gate exit are independent, per-service events. Neither
// event records receipt by the store. Both operate on the immutable handover.
route('POST','/api/sales/store-transport/:id/:run/review',{roles:['sales','admin'],idempotent:true},ctx=>transaction(()=>{
 const {order,run,key}=storeService(ctx.params.id,ctx.params.run),hand=order.transportHandovers?.[key];
 const previous=order.transportStoreReviews?.[key];if(previous)return {body:{review:previous}};
 if(order.transportStoreTrips?.[key])fail(409,'خروج این سرویس قبلاً ثبت شده است.');
 if(order.status!=='WAREHOUSE_PREPARING'||!(hand?.physicalHandoverConfirmed||hand?.signedPaperConfirmed)||!hand.document?.lines?.length)fail(409,'ابتدا تحویل فیزیکی این سرویس به راننده در انبار ثبت شود.');
 if(ctx.body?.reviewConfirmed!==true)fail(400,'بررسی سند و محموله این سرویس را تأیید کنید.');
 const now=store.nowIso(),review={run,at:now,by:ctx.user.id,warehouseDocumentNo:hand.document.warehouseDocumentNo,driverId:hand.driverId};
 order.transportStoreReviews={...(order.transportStoreReviews||{}),[key]:review};order.updatedAt=now;
 store.audit(ctx.user,'STORE_TRANSPORT_SALES_REVIEW','order',order.id,review,ctx);
 createNotification('gate','STORE_TRANSPORT_EXIT_READY','order',order.id,`سرویس ${run===1?'اول':'دوم'} سفارش ${order.orderNo||'—'} پس از بررسی فروش منتظر تأیید خروج نگهبانی است.`,{run});
 return {body:{review}};
}));
route('POST','/api/transport/store-shipments/:id/:run/depart',{...TRANSPORT,idempotent:true},()=>fail(403,'ثبت خروج سرویس فروشگاه پس از بررسی فروش فقط توسط نگهبانی انجام می‌شود.'));
route('POST','/api/gate/store-shipments/:id/:run/depart',{roles:['gate','admin'],idempotent:true},ctx=>transaction(()=>{
 const {order,run,key}=storeService(ctx.params.id,ctx.params.run),hand=order.transportHandovers?.[key],review=order.transportStoreReviews?.[key];
 const existing=order.transportStoreTrips?.[key];if(existing)return {body:{service:existing}};
 if(order.status!=='WAREHOUSE_PREPARING'||!(hand?.physicalHandoverConfirmed||hand?.signedPaperConfirmed)||!hand.document?.lines?.length||!review||review.driverId!==hand.driverId||review.warehouseDocumentNo!==hand.document.warehouseDocumentNo)fail(409,'ابتدا تحویل انبار و بررسی همین سرویس توسط فروش ثبت شود.');
 if(ctx.body?.departureConfirmed!==true)fail(400,'خروج واقعی این سرویس را تأیید کنید.');
 const now=store.nowIso(),service={run,status:'IN_TRANSIT',departedAt:now,departedBy:ctx.user.id,driverId:hand.driverId,driverName:hand.driverName,vehicleId:hand.vehicleId,vehicleType:hand.vehicleType,vehiclePlate:hand.vehiclePlate,warehouseDocumentNo:hand.document.warehouseDocumentNo,lines:hand.document.lines};
 order.transportStoreTrips={...(order.transportStoreTrips||{}),[key]:service};order.updatedAt=now;
 store.audit(ctx.user,'STORE_TRANSPORT_DEPARTURE','order',order.id,{run,driverId:hand.driverId,vehicleId:hand.vehicleId,warehouseDocumentNo:service.warehouseDocumentNo},ctx);
 require('../domain').notifyStore(order,'STORE_DELIVERY_UPDATE',`${require('../store-order-kind').isPartial(order)?'محموله سفارش جزئی':`سرویس ${run===1?'اول':'دوم'}`} سفارش ${order.orderNo||'—'} در مسیر فروشگاه است.`,run);
 createNotification('sales','TRANSPORT_DEPARTED','order',order.id,`خروج سرویس ${run===1?'اول':'دوم'} سفارش ${order.orderNo||'—'} توسط نگهبانی تأیید شد.`,{run});
 return {body:{service}};
}));
route('POST','/api/sales/store-transport/:id/:run/return',{...SALES,idempotent:true},ctx=>transaction(()=>{
 const {order,run,key}=storeService(ctx.params.id,ctx.params.run),trip=order.transportStoreTrips?.[key];
 if(!trip)fail(409,'ابتدا خروج این سرویس ثبت شود.');
 if(trip.status==='CLOSED')return {body:{service:trip,orderClosed:order.status==='CLOSED'}};
 if(trip.status!=='RECEIPT_CONFIRMED'||!trip.storeReceiptConfirmedAt)fail(409,'ابتدا فروشگاه دریافت همین سرویس را تأیید کند.');
 if(ctx.body?.documentsReturned!==true)fail(400,'بازگشت مدارک این سرویس به فروش باید تأیید شود.');
 const now=store.nowIso(),service={...trip,status:'CLOSED',documentsReturnedAt:now,documentsReturnedBy:ctx.user.id};
 order.transportStoreTrips={...(order.transportStoreTrips||{}),[key]:service};order.updatedAt=now;
 const closed=require('../store-transport').closeIfReady(store.get(),order,now);
 store.audit(ctx.user,'STORE_TRANSPORT_RETURNED','order',order.id,{run,orderClosed:closed,warehouseDocumentNo:trip.warehouseDocumentNo},ctx);
 return {body:{service,orderClosed:closed}};
}));
