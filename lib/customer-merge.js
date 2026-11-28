'use strict';
const crypto=require('node:crypto');
const {fail}=require('./http');
const core=require('./customer-core');
const links=require('./customer-links');
const debt=require('./customer-debts');

// Only manually selected customer groups with a shared normalized phone can be
// merged. The source profile remains intact as a historical identity; no
// order, visit, invoice, receipt, or accounting record is rewritten.
function candidates(db,id){
 const root=links.rootId(db,id),primary=(db.customers||[]).find(c=>c.id===root&&!c.mergedInto);
 if(!primary)fail(404,'مشتری پیدا نشد.');
 const ids=new Set(links.members(db,root).flatMap(c=>[core.phoneKey(c.phone),core.phoneKey(c.phone2)]).filter(Boolean));
 const resolve=links.resolver(db),matches=new Set();
 for(const c of db.customers||[])if([c.phone,c.phone2].some(p=>ids.has(core.phoneKey(p)))){const other=resolve(c.id);if(other!==root)matches.add(other);}
 return (db.customers||[]).filter(c=>!c.mergedInto&&matches.has(c.id)).map(c=>({id:c.id,code:c.code,name:c.name,phone:c.phone,phone2:c.phone2||''}));
}
function group(db,id){
 const ids=links.memberIds(db,id),profiles=links.members(db,id),visits=db.visits.filter(v=>ids.has(v.customerId));
 const visitIds=new Set(visits.map(v=>v.id));
 const orders=db.orders.filter(o=>ids.has(o.customerId)||(!o.customerId&&visitIds.has(o.visitId)));
 const orderIds=new Set(orders.map(o=>o.id));
 const payments=db.payments.filter(p=>ids.has(p.customerId)||ids.has(p.debtAccount?.customerId)||orderIds.has(p.orderId));
 return {profiles,visits,orders,payments};
}
function view(db,id,g){
 const profile=g.profiles.find(c=>c.id===id),ledger=debt.list(db,id);
 return {id,code:profile.code,name:profile.name,phone:profile.phone,phone2:profile.phone2||'',nationalId:profile.nationalId||'',profiles:g.profiles.map(c=>({id:c.id,code:c.code,name:c.name,phone:c.phone,phone2:c.phone2||'',nationalId:c.nationalId||'',company:c.company||'',district:c.district||'',address:c.address||'',plate:c.plate||'',vehicleType:c.vehicleType||'',notes:c.notes||''})),visitCount:g.visits.length,orderCount:g.orders.length,invoiceCount:g.payments.length,balance:ledger.balance,credit:ledger.credit,pending:ledger.pending,
 visits:g.visits.map(v=>({id:v.id,createdAt:v.createdAt,status:v.status,purpose:v.purpose,district:v.district})),
 orders:g.orders.map(o=>({id:o.id,orderNo:o.orderNo,createdAt:o.createdAt,orderType:o.orderType,status:o.status})),
 payments:g.payments.map(p=>({id:p.id,orderId:p.orderId,invoiceNumber:p.invoiceNumber,verifiedAt:p.verifiedAt,totalAmount:p.totalAmount,settlementMethods:p.settlementMethods})),
 debts:ledger.invoices};
}
function preview(db,primaryId,secondaryId){
 if(typeof primaryId!=='string'||typeof secondaryId!=='string'||!primaryId||!secondaryId||primaryId===secondaryId)fail(400,'دو پرونده متفاوت را انتخاب کنید.');
 const primary=db.customers.find(c=>c.id===primaryId&&!c.mergedInto),secondary=db.customers.find(c=>c.id===secondaryId&&!c.mergedInto);
 if(!primary||!secondary)fail(409,'یکی از پرونده‌ها دیگر پروندهٔ اصلی نیست؛ دوباره بررسی کنید.');
 if(!candidates(db,primaryId).some(c=>c.id===secondaryId))fail(409,'برای ادغام، دو پرونده باید شماره تماس مشترک داشته باشند.');
 const a=group(db,primaryId),b=group(db,secondaryId);
 const nationalIds=new Set([...a.profiles,...b.profiles].map(c=>require('./validate').digitsToAscii(String(c.nationalId||'')).replace(/\s+/g,'')).filter(Boolean));
 if(nationalIds.size>1)fail(409,'کد ملی پرونده‌ها متفاوت است؛ برای جلوگیری از ادغام اشخاص متفاوت، ابتدا مشخصات بررسی شود.');
 const revision=crypto.createHash('sha256').update(JSON.stringify({primaryId,secondaryId,a,b})).digest('hex');
 return {primary:view(db,primaryId,a),secondary:view(db,secondaryId,b),revision};
}
module.exports={candidates,preview};
