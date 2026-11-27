'use strict';
const {atomicRoute:route,fail}=require('../http');
const store=require('../store'),validate=require('../validate');
const {getProduct,enrichOrder,createNotification}=require('../domain');
const additions=require('../customer-order-additions');
const find=id=>{const o=store.get().orders.find(x=>x.id===id);if(!o||!['ONSITE','REMOTE'].includes(o.orderType))fail(404,'سفارش مشتری یافت نشد.');return o;};
route('POST','/api/sales/customer-orders/:id/additions',{roles:['sales'],idempotent:true},ctx=>{
 const order=find(ctx.params.id),db=store.get();additions.assertOpen(order);additions.assertNoPending(order);validate.items(ctx.body.items);
 if(db.orderItems.filter(i=>i.orderId===order.id&&i.itemStatus!=='CANCELLED').length+ctx.body.items.length>100)fail(400,'تعداد اقلام سفارش بیش از حد مجاز است.');
 const lines=ctx.body.items.map(x=>{const product=getProduct(String(x?.productId||''));if(!product?.isActive)fail(400,'محصول انتخاب‌شده معتبر نیست.');return {productId:product.id,productName:product.name,requestedQty:validate.number(x.requestedQty,{field:'مقدار درخواستی',min:0.001,max:validate.MAX_QTY}),requestedUnit:validate.unit(x.requestedUnit),description:validate.text(x.description,{field:'توضیحات قلم',max:300})};});
 const now=store.nowIso(),request={id:store.uid(),status:'PENDING_WAREHOUSE',items:lines,requestedAt:now,requestedBy:ctx.user.id};
 order.customerAdditionRequests=[...(order.customerAdditionRequests||[]),request];order.updatedAt=now;
 store.audit(ctx.user,'CUSTOMER_ADDITION_REQUESTED','order',order.id,{requestId:request.id,items:lines},ctx);
 createNotification('warehouse','CUSTOMER_ADDITION_REQUESTED','order',order.id,`درخواست افزودن کالا به سفارش ${order.orderNo||'—'} در انتظار بررسی انبار است.`,{requestId:request.id});store.save();return {status:201,body:{request,order:enrichOrder(order)}};
});
route('POST','/api/warehouse/customer-orders/:id/additions/review',{roles:['warehouse'],idempotent:true},ctx=>{
 const order=find(ctx.params.id),db=store.get();additions.assertOpen(order);const request=additions.pending(order);
 if(!request||request.id!==ctx.body.requestId)fail(409,'این درخواست دیگر در انتظار بررسی نیست.');
 if(!['APPROVE','REJECT'].includes(ctx.body.decision))fail(400,'نتیجه بررسی معتبر نیست.');
 const changes=[];
 if(ctx.body.decision==='APPROVE'){
  if(db.orderItems.filter(i=>i.orderId===order.id&&i.itemStatus!=='CANCELLED').length+request.items.length>100)fail(409,'تعداد اقلام سفارش بیش از حد مجاز است.');
  for(const line of request.items){const product=getProduct(line.productId);if(!product?.isActive||product.name!==line.productName)fail(409,'محصول درخواست تغییر کرده یا غیرفعال شده است؛ درخواست را رد کنید و پس از بررسی دوباره ثبت کنید.');}
  for(const line of request.items){const item={id:store.uid(),orderId:order.id,productId:line.productId,requestedQty:line.requestedQty,requestedUnit:line.requestedUnit,description:line.description,deliveredKg:null,unitPrice:null,finalAmount:null,itemStatus:'PENDING',returnReason:''};db.orderItems.push(item);changes.push({itemId:item.id,...line});}
  // Preserve saved weights but invalidate any open editor's revision.
  if(order.warehouseWeightDraft)order.warehouseWeightDraft={...order.warehouseWeightDraft,revision:require('../warehouse-weight-draft').revision(order)+1};
 }
 const now=store.nowIso();Object.assign(request,{status:ctx.body.decision==='APPROVE'?'ACCEPTED':'REJECTED_WAREHOUSE',warehouseReviewedAt:now,warehouseReviewedBy:ctx.user.id,changes});order.updatedAt=now;
 store.audit(ctx.user,'CUSTOMER_ADDITION_REVIEWED','order',order.id,{requestId:request.id,decision:ctx.body.decision,changes},ctx);
 createNotification('sales','CUSTOMER_ADDITION_RESULT','order',order.id,`درخواست افزودن کالای سفارش ${order.orderNo||'—'} ${request.status==='ACCEPTED'?'تأیید و اضافه شد':'توسط انبار رد شد'}.`,{requestId:request.id});store.save();return {body:{request,order:enrichOrder(order)}};
});
