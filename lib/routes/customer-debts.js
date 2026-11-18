'use strict';
const { atomicRoute: route,fail}=require('../http');
const store=require('../store');
const debt=require('../customer-debts');
const ACCESS={roles:['sales','admin']};
function customer(id){const db=store.get();if(!db.customers.some(c=>c.id===id))fail(404,'مشتری پیدا نشد.');return db;}
route('GET','/api/customers/:id/debts',ACCESS,ctx=>({status:200,body:debt.list(customer(ctx.params.id),ctx.params.id)}));
route('POST','/api/customers/:id/debts/:payment/receipts',{...ACCESS,idempotent:true},ctx=>{
 const db=customer(ctx.params.id);const {operationKey,fingerprint,...receipt}=debt.receive(db,ctx.params.id,ctx.params.payment,ctx.body,ctx.user,String(ctx.req.headers['idempotency-key']||''),{ip:ctx.ip,userAgent:ctx.ua});
 return {status:201,body:{receipt,...debt.list(db,ctx.params.id)}};
});
route('POST','/api/customers/:id/debts/:payment/receipts/:receipt/resolve',{...ACCESS,idempotent:true},ctx=>{
 const db=customer(ctx.params.id);const {operationKey,fingerprint,...receipt}=debt.resolve(db,ctx.params.id,ctx.params.payment,ctx.params.receipt,String(ctx.body.status||''),ctx.user,{ip:ctx.ip,userAgent:ctx.ua});
 return {status:200,body:{receipt,...debt.list(db,ctx.params.id)}};
});
