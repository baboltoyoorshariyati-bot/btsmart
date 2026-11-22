'use strict';
// Fail-closed compatibility guard while consolidated membership is experimental.
// Called with the live connection under BEGIN IMMEDIATE. It protects existing
// member orders and their items against legacy transaction handlers, including
// additions, deletions and changes to SQL columns as well as JSON payloads.
// Active services additionally depend on product identities and names: compare
// only those fields, not unrelated catalog attributes. Closed transport has no
// further transitions, so its immutable document no longer locks the catalog.
// The live bridge also checkpoints each new member immediately after joining.
// Independent connections, non-transactional code and direct repository calls
// that bypass the bridge are outside this guard; it is not activation.
const schema=require('./store-stock-service-schema');

function rowsFor(sql,ids){
 const result={members:[],orders:[],items:[]};
 // Bound parameters stay under SQLite's conservative variable limit.
 for(let i=0;i<ids.length;i+=500){
  const part=ids.slice(i,i+500),marks=part.map(()=>'?').join(',');
  result.members.push(...sql.all(`SELECT order_id, service_id FROM stock_service_draft_members WHERE order_id IN (${marks}) ORDER BY order_id`,part));
  result.orders.push(...sql.all(`SELECT * FROM orders WHERE id IN (${marks}) ORDER BY id`,part));
  result.items.push(...sql.all(`SELECT * FROM order_items WHERE order_id IN (${marks}) ORDER BY id`,part));
 }
 return JSON.stringify(result);
}
function productNames(sql,ids){
 const products=[];
 for(let i=0;i<ids.length;i+=500){
  const part=ids.slice(i,i+500),marks=part.map(()=>'?').join(',');
  // Read both indexed column and canonical payload; a direct SQL write to
  // either must not leave the two representations inconsistent.
  for(const row of sql.all(`SELECT id, name, payload FROM products WHERE id IN (${marks}) ORDER BY id`,part)) {
   const payload=JSON.parse(row.payload);
   products.push({id:row.id,columnName:row.name,payloadId:payload.id,payloadName:payload.name});
  }
 }
 return JSON.stringify(products);
}
function capture(sql){
 const tables=new Set(sql.all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('stock_service_drafts','stock_service_draft_members')").map(x=>x.name));
 if(!schema.present(tables))return null;
 const ids=sql.all('SELECT order_id FROM stock_service_draft_members ORDER BY order_id').map(r=>r.order_id);
 if(!ids.length)return null;
 const productIds=new Set();
 for(const row of sql.all('SELECT payload FROM stock_service_drafts')) {
  const service=JSON.parse(row.payload);
  if(service.transport?.stage==='CLOSED')continue;
  if(!Array.isArray(service.sources))throw new Error('اقلام سرویس تجمیعی ناسازگار است.');
  for(const source of service.sources){
   if(typeof source.productId!=='string'||!source.productId)throw new Error('محصول سرویس تجمیعی ناسازگار است.');
   productIds.add(source.productId);
  }
 }
 const products=[...productIds].sort();
 return {ids,before:rowsFor(sql,ids),products,productBefore:productNames(sql,products)};
}
// Capture only the newly joined order, so joining a batch does not repeatedly
// copy every pre-existing member. The first checkpoint remains authoritative.
function captureMember(sql,orderId){
 const links=sql.all('SELECT m.service_id, s.payload FROM stock_service_draft_members m JOIN stock_service_drafts s ON s.id=m.service_id WHERE m.order_id=?',[orderId]);
 if(links.length!==1)throw new Error('عضویت جدید سرویس تجمیعی یافت نشد.');
 const service=JSON.parse(links[0].payload);
 if(service.status!=='OPEN'||!Array.isArray(service.orders)||!service.orders.some(o=>o.orderId===orderId)||!Array.isArray(service.sources))throw new Error('عضویت جدید سرویس تجمیعی ناسازگار است.');
 const sources=service.sources.filter(s=>s.orderId===orderId);
 if(!sources.length||sources.some(s=>typeof s.productId!=='string'||!s.productId))throw new Error('اقلام عضویت جدید سرویس تجمیعی ناسازگار است.');
 const ids=[orderId],products=[...new Set(sources.map(s=>s.productId))].sort();
 return {ids,before:rowsFor(sql,ids),products,productBefore:productNames(sql,products)};
}
function assertUnchanged(sql,snapshot){
 if(snapshot&&snapshot.before!==rowsFor(sql,snapshot.ids)) {
  const {ApiError}=require('./http');
  throw new ApiError(409,'سفارش عضو سرویس تجمیعی است؛ عملیات مستقل روی آن مجاز نیست.','STOCK_SERVICE_MEMBER_LOCKED');
 }
 if(snapshot&&snapshot.productBefore!==productNames(sql,snapshot.products)){
  const {ApiError}=require('./http');
  throw new ApiError(409,'نام کالای سرویس تجمیعی فعال قابل تغییر یا حذف نیست.','STOCK_SERVICE_PRODUCT_LOCKED');
 }
}
module.exports={capture,captureMember,assertUnchanged};
