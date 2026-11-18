'use strict';
// A debt account is attached to the newly issued invoice itself. Old invoices
// deliberately have no account; no assumption is made about off-system payments.
const {fail}=require('./http');
const validate=require('./validate');
const store=require('./store');
const crypto=require('node:crypto');

function customerId(db,order){return order.customerId||db.visits.find(v=>v.id===order.visitId)?.customerId||null;}
function initial(methods){return (methods||[]).filter(m=>m.type==='CREDIT').reduce((n,m)=>n+Number(m.amount),0);}
function newAccount(db,order,methods){
 const amount=initial(methods);
 if(!order.debtTrackingEnabled||!amount)return null;
 const id=customerId(db,order);
 if(!id||!db.customers.some(c=>c.id===id))fail(409,'برای ثبت معوق باید سفارش به پرونده مشتری متصل باشد.');
 return {customerId:id,initial:amount,receipts:[]};
}
function amounts(account){
 if(!account||!Number.isSafeInteger(account.initial)||account.initial<=0||!Array.isArray(account.receipts))fail(409,'اطلاعات حساب معوق نامعتبر است؛ بررسی مدیر لازم است.');
 const receipts=account.receipts;
 if(receipts.some(r=>!r||!Number.isSafeInteger(r.amount)||r.amount<=0||!['CLEARED','PENDING','RETURNED','REVERSED'].includes(r.status)||(['PENDING','RETURNED'].includes(r.status)&&r.type!=='CHECK')))fail(409,'سوابق دریافت نامعتبر است؛ بررسی مدیر لازم است.');
 const paid=receipts.filter(r=>r.status==='CLEARED').reduce((s,r)=>s+r.amount,0);
 const pending=receipts.filter(r=>r.status==='PENDING').reduce((s,r)=>s+r.amount,0);
 if(!Number.isSafeInteger(paid)||!Number.isSafeInteger(pending)||paid+pending>account.initial)fail(409,'مانده حساب معوق نامعتبر است؛ بررسی مدیر لازم است.');
 return {initial:account.initial,paid,pending,balance:account.initial-paid,available:account.initial-paid-pending};
}
function accountFor(db,customer,payment){
 const p=db.payments.find(x=>x.id===payment);
 if(!p||!p.debtAccount||p.debtAccount.customerId!==customer||db.orders.some(o=>o.id===p.orderId&&o.orderType==='STORE'))fail(404,'فاکتور معوق این مشتری پیدا نشد.');
 return p;
}
function list(db,id){
 const orderById=new Map(db.orders.map(o=>[o.id,o]));
 const invoices=db.payments.filter(p=>p.debtAccount?.customerId===id&&orderById.get(p.orderId)?.orderType!=='STORE').map(p=>{
  const order=orderById.get(p.orderId);
  return {paymentId:p.id,invoiceNumber:p.invoiceNumber,orderId:p.orderId,orderNo:order?.orderNo||'',createdAt:p.verifiedAt,...amounts(p.debtAccount),receipts:(p.debtAccount.receipts||[]).map(({operationKey,fingerprint,...r})=>r)};
 }).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 return {invoices,balance:invoices.reduce((s,p)=>s+p.balance,0),pending:invoices.reduce((s,p)=>s+p.pending,0)};
}
function receive(db,customer,payment,body,user,key,ctx={}){
 const p=accountFor(db,customer,payment),a=p.debtAccount;
 key=String(body.operationId||key||'');
 if(!key||!/^[A-Za-z0-9_-]{8,100}$/.test(key))fail(400,'کلید ثبت دریافت لازم است.');
 const type=String(body.type||'').toUpperCase();
 if(!['CASH','POS','CARD_TRANSFER','CHECK'].includes(type))fail(400,'روش دریافت معتبر نیست.');
 const amount=validate.number(body.amount,{field:'مبلغ دریافت',min:1,max:validate.MAX_MONEY});
 if(!Number.isSafeInteger(amount))fail(400,'مبلغ باید ریال صحیح باشد.');
 // Reuse the existing validation and device snapshots, but never allow CREDIT.
 const row=require('./settlement-methods').cleanRows([{...body,type,amount}],amount,db)[0];
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');
 const prev=(a.receipts||[]).find(r=>r.operationKey===key&&r.createdBy===user.id);
 if(prev){if(prev.fingerprint!==fingerprint)fail(409,'این کلید برای دریافت دیگری استفاده شده است.');return prev;}
 const {available}=amounts(a);
 if(amount>available)fail(409,'مبلغ از مانده قابل دریافت پس از کسر چک‌های در انتظار وصول بیشتر است.');
 const receipt={...row,id:store.uid(),status:type==='CHECK'?'PENDING':'CLEARED',createdAt:store.nowIso(),createdBy:user.id,createdByName:user.fullName||user.username,operationKey:key,fingerprint};
 // One write-through update of the invoice row: account and receipt are atomic.
 p.debtAccount={...a,receipts:[...(a.receipts||[]),receipt]};
 store.audit(user,'CUSTOMER_DEBT_RECEIPT','payment',p.id,{customerId:customer,receiptId:receipt.id,type,amount,status:receipt.status},ctx);
 store.save();return receipt;
}
function resolve(db,customer,payment,receiptId,status,user,ctx={}){
 const p=accountFor(db,customer,payment),a=p.debtAccount;
 const receipt=(a.receipts||[]).find(r=>r.id===receiptId);
 if(!receipt)fail(404,'دریافت این فاکتور پیدا نشد.');
 if(!['CLEARED','RETURNED','REVERSED'].includes(status))fail(400,'وضعیت دریافت معتبر نیست.');
 if(status==='REVERSED'&&require('./http').normalizeRole(user.roleCode)!=='admin')fail(403,'ابطال دریافت فقط برای مدیر مجاز است.');
 if(receipt.status===status)return receipt;
 if(status==='REVERSED'){
  if(receipt.status!=='CLEARED')fail(409,'فقط دریافت وصول‌شده قابل ابطال است.');
 }else{
  if(receipt.type!=='CHECK'||receipt.status!=='PENDING')fail(409,'وضعیت این چک قبلاً تعیین شده است.');
  if(status==='CLEARED'&&Number(receipt.amount)>amounts(a).balance)fail(409,'مبلغ چک از مانده فاکتور بیشتر است.');
 }
 const updated=status==='REVERSED'?{...receipt,status,reversedAt:store.nowIso(),reversedBy:user.id,reversedByName:user.fullName||user.username}:{...receipt,status,resolvedAt:store.nowIso(),resolvedBy:user.id,resolvedByName:user.fullName||user.username};
 const nextAccount={...a,receipts:a.receipts.map(r=>r.id===receiptId?updated:r)};
 // Initial invoice cheques have a linked settlement method. Update both in
 // one payment-row write so the printed status cannot remain stale.
 const index=receipt.settlementMethodIndex,method=Number.isInteger(index)?p.settlementMethods?.[index]:null;
 if(method&&method.type==='CHECK'&&method.checkNumber===receipt.checkNumber&&method.bank===receipt.bank&&method.amount===receipt.amount){
  const methods=p.settlementMethods.map((m,i)=>i===index?{...m,checkStatus:status}:m);
  const paymentIndex=db.payments.findIndex(x=>x.id===p.id);
  db.payments[paymentIndex]={...p,debtAccount:nextAccount,settlementMethods:methods};
 } else p.debtAccount=nextAccount;
 store.audit(user,'CUSTOMER_DEBT_RECEIPT_'+status,'payment',p.id,{customerId:customer,receiptId,amount:receipt.amount},ctx);
 store.save();return updated;
}
module.exports={customerId,initial,newAccount,amounts,list,receive,resolve};
