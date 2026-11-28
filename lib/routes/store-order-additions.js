'use strict';
const {atomicRoute:route,fail}=require('../http');
const store=require('../store'),validate=require('../validate');
const {getProduct,enrichOrder,createNotification,notifyStore}=require('../domain');
const {activeRequest,assertOpen,firstSent}=require('../store-order-additions');
const {isPartial}=require('../store-order-kind');
const find=id=>{const order=store.get().orders.find(o=>o.id===id);if(!order||order.orderType!=='STORE')fail(404,'سفارش فروشگاه یافت نشد.');return order;};
const reqFor=(order,id,status)=>{const r=activeRequest(order);if(!r||r.id!==id||r.status!==status)fail(409,'این درخواست دیگر در این مرحله نیست.');return r;};
function plan(db,order,lines){
 const active=db.orderItems.filter(i=>i.orderId===order.id&&i.itemStatus!=='CANCELLED');
 // New bulk requests are independent lines: never rewrite a sent service's
 // request quantities, completion or document, even for the same product.
 if(!isPartial(order)){
  if(active.length+lines.length>100)fail(400,'تعداد اقلام سفارش بیش از حد مجاز است.');
  return lines.map(line=>{const product=db.products.find(p=>p.id===line.productId);if(!product?.isActive)fail(409,'یکی از محصولات درخواست حذف یا غیرفعال شده است؛ محصول را فعال کنید یا درخواست را رد کنید.');return {...line,qty:line.requestedQty,item:null};});
 }
 const merged=new Map();
 for(const line of lines){
  const product=db.products.find(p=>p.id===line.productId);
  if(!product?.isActive)fail(409,'یکی از محصولات درخواست حذف یا غیرفعال شده است؛ محصول را فعال کنید یا درخواست را رد کنید.');
  // A different requested unit is a separate warehouse line; never convert a
  // requested quantity to kilograms. Existing duplicates remain untouched.
  // If several rows have the same product and unit, use the first active row.
  const key=JSON.stringify([line.productId,line.requestedUnit]);
  const item=active.find(i=>i.productId===line.productId&&i.requestedUnit===line.requestedUnit);
  const current=merged.get(key)||{item,productId:line.productId,requestedUnit:line.requestedUnit,description:line.description,qty:0};
  current.qty=Number((current.qty+line.requestedQty).toPrecision(15));
  if(current.qty+(Number(item?.requestedQty)||0)>validate.MAX_QTY)fail(400,'مجموع مقدار محصول بیش از حد مجاز است.');
  merged.set(key,current);
 }
 if(active.length+[...merged.values()].filter(line=>!line.item).length>100)fail(400,'تعداد اقلام سفارش بیش از حد مجاز است.');
 return [...merged.values()];
}
route('POST','/api/store/orders/:id/addition-requests',{roles:['store'],idempotent:true},ctx=>{
 const db=store.get(),order=find(ctx.params.id);if(!require('../store-access').owns(ctx.user,order))fail(404,'سفارش فروشگاه یافت نشد.');assertOpen(order);
 if(activeRequest(order))fail(409,'ابتدا درخواست قبلی تعیین تکلیف شود.');validate.items(ctx.body.items);
 const lines=ctx.body.items.map(x=>{const product=getProduct(String(x?.productId||''));if(!product?.isActive)fail(400,'محصول انتخاب‌شده معتبر نیست.');return {productId:product.id,productName:product.name,requestedQty:validate.number(x.requestedQty,{field:'مقدار درخواستی',min:0.001,max:validate.MAX_QTY}),requestedUnit:validate.unit(x.requestedUnit),description:validate.text(x.description,{field:'توضیحات قلم',max:300})};});
 plan(db,order,lines);const now=store.nowIso(),request={id:store.uid(),status:'PENDING_SALES',items:lines,requestedAt:now,requestedBy:ctx.user.id};
 order.storeAdditionRequests=[...(order.storeAdditionRequests||[]),request];order.updatedAt=now;
 store.audit(ctx.user,'STORE_ADDITION_REQUESTED','order',order.id,{requestId:request.id,items:lines},ctx);
 createNotification('sales','STORE_ADDITION_REQUESTED','order',order.id,`درخواست افزودن کالا به سفارش ${isPartial(order)?'جزئی':'کلی'} ${order.orderNo||'—'} در انتظار تأیید فروش است.`,{requestId:request.id});store.save();return {status:201,body:{request,order:enrichOrder(order)}};
});
route('POST','/api/sales/store-orders/:id/additions/review',{roles:['sales'],idempotent:true},ctx=>{
 const db=store.get(),order=find(ctx.params.id),r=reqFor(order,ctx.body.requestId,'PENDING_SALES');assertOpen(order);
 if(!['APPROVE','REJECT'].includes(ctx.body.decision))fail(400,'نتیجه بررسی معتبر نیست.');
 if(ctx.body.decision==='APPROVE')plan(db,order,r.items);
 const now=store.nowIso();Object.assign(r,{status:ctx.body.decision==='APPROVE'?'PENDING_WAREHOUSE':'REJECTED_SALES',reviewedAt:now,reviewedBy:ctx.user.id});order.updatedAt=now;
 store.audit(ctx.user,'STORE_ADDITION_SALES_REVIEWED','order',order.id,{requestId:r.id,decision:ctx.body.decision,items:r.items},ctx);
 if(r.status==='PENDING_WAREHOUSE')createNotification('warehouse','STORE_ADDITION_APPROVED','order',order.id,`کالاهای اضافهٔ سفارش ${order.orderNo||'—'} پس از تأیید فروش، در انتظار تأیید انبار است.`,{requestId:r.id});
 notifyStore(order,'STORE_ADDITION_UPDATE',`درخواست افزودن کالا به سفارش ${order.orderNo||'—'} ${r.status==='PENDING_WAREHOUSE'?'تأیید فروش شد و منتظر انبار است':'توسط فروش رد شد'}.`);store.save();return {body:{request:r,order:enrichOrder(order)}};
});
route('POST','/api/warehouse/store-orders/:id/additions/review',{roles:['warehouse'],idempotent:true},ctx=>{
 const db=store.get(),order=find(ctx.params.id),r=reqFor(order,ctx.body.requestId,'PENDING_WAREHOUSE');assertOpen(order);
 if(!['WAREHOUSE_PENDING','WAREHOUSE_PREPARING'].includes(order.status))fail(409,'سفارش هنوز به انبار ارسال نشده است.');
 if(!['APPROVE','REJECT'].includes(ctx.body.decision))fail(400,'نتیجه بررسی معتبر نیست.');
 const now=store.nowIso(),changes=[];
 if(ctx.body.decision==='APPROVE')for(const line of plan(db,order,r.items)){
  if(line.item){const i=line.item,before=i.requestedQty;const completion=i.runCompleted||null,shortage=i.shortageClosed||null;i.requestedQty=Number((Number(i.requestedQty)+line.qty).toPrecision(15));delete i.runCompleted;delete i.shortageClosed;changes.push({itemId:i.id,productId:i.productId,requestedUnit:i.requestedUnit,before,added:line.qty,after:i.requestedQty,previousCompletion:completion,previousShortage:shortage});}
  else{const targetRun=!isPartial(order)&&firstSent(order)?2:1;const i={id:store.uid(),orderId:order.id,productId:line.productId,requestedQty:line.qty,requestedUnit:line.requestedUnit,description:line.description,deliveredKg:null,unitPrice:null,finalAmount:null,itemStatus:'PENDING',returnReason:'',...(!isPartial(order)&&targetRun===2?{additionTargetRun:2,movedToR2:{at:now,by:ctx.user.id,note:'محصول افزوده‌شده پس از ارسال سرویس اول'}}:{})};db.orderItems.push(i);changes.push({itemId:i.id,productId:i.productId,requestedUnit:i.requestedUnit,added:line.qty,after:i.requestedQty,...(!isPartial(order)?{run:targetRun}: {})});}
 }
 Object.assign(r,{status:ctx.body.decision==='APPROVE'?'ACCEPTED':'REJECTED_WAREHOUSE',warehouseReviewedAt:now,warehouseReviewedBy:ctx.user.id,changes});order.updatedAt=now;
 store.audit(ctx.user,'STORE_ADDITION_WAREHOUSE_REVIEWED','order',order.id,{requestId:r.id,decision:ctx.body.decision,changes},ctx);
 notifyStore(order,'STORE_ADDITION_UPDATE',`درخواست افزودن کالا به سفارش ${order.orderNo||'—'} ${r.status==='ACCEPTED'?'تأیید انبار و به سفارش افزوده شد':'توسط انبار رد شد'}.`);
 createNotification('sales','STORE_ADDITION_RESULT','order',order.id,`نتیجه بررسی انبار برای کالاهای اضافهٔ سفارش ${order.orderNo||'—'} ثبت شد.`);store.save();return {body:{request:r,order:enrichOrder(order)}};
});
