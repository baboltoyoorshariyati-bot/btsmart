'use strict';
// SQL read models for the canonical, unrestricted store only. Scoped report
// objects MUST use their existing builders: SQL must never bypass unit access.
const sql=require('./sqlite-store');
const {storeDisplayName}=require('./store-name');
const parse=value=>value?JSON.parse(value):{};
const storeName=o=>o.orderType==='STORE'?storeDisplayName(o.storeName,o.branchNo):(o.storeName||'');
function supported(source){return ['orders','orderItems','payments'].includes(source);}
function canonical(db){
 if(!sql.isReady())return false;
 try{return db===require('./store').get();}catch{return false;}
}
function build(source){
 if(source==='orders')return sql.all(`SELECT o.payload AS o,c.payload AS c,p.payload AS p,COALESCE(i.n,0) AS n
 FROM orders o LEFT JOIN customers c ON c.id=o.customer_id
 LEFT JOIN payments p ON p.rowid=(SELECT rowid FROM payments WHERE order_id=o.id ORDER BY rowid LIMIT 1)
 LEFT JOIN (SELECT order_id,COUNT(*) AS n FROM order_items GROUP BY order_id) i ON i.order_id=o.id ORDER BY o.rowid`).map(row=>{
  const o=parse(row.o),c=parse(row.c),p=parse(row.p);
  return {createdAt:o.createdAt||'',orderNo:o.orderNo||'',orderType:o.orderType||'',status:o.status||'',scheduledAt:o.scheduledAt||'',customerCode:c.code||'',customerName:c.name||'',customerPhone:c.phone||'',storeName:storeName(o),itemCount:Number(row.n),invoiceNumber:p.invoiceNumber||'',totalAmount:Number(p.totalAmount||0)};
 });
 if(source==='orderItems')return sql.all(`SELECT i.payload AS i,o.payload AS o,c.payload AS c,p.payload AS p
 FROM order_items i LEFT JOIN orders o ON o.id=i.order_id LEFT JOIN customers c ON c.id=o.customer_id
 LEFT JOIN products p ON p.id=i.product_id ORDER BY i.rowid`).map(row=>{
  const i=parse(row.i),o=parse(row.o),c=parse(row.c),p=parse(row.p);
  return {createdAt:o.createdAt||'',orderNo:o.orderNo||'',customerName:c.name||'',productName:i.productName||p.name||'',requestedQty:Number(i.requestedQty||0),unit:i.unit||p.defaultUnit||'',itemStatus:i.itemStatus||''};
 });
 if(source==='payments')return sql.all(`SELECT p.payload AS p,o.payload AS o,c.payload AS c
 FROM payments p LEFT JOIN orders o ON o.id=p.order_id
 LEFT JOIN customers c ON c.id=COALESCE(NULLIF(json_extract(o.payload,'$.customerId'),''),json_extract(p.payload,'$.customerId')) ORDER BY p.rowid`).map(row=>{
  const p=parse(row.p),o=parse(row.o),c=parse(row.c);
  return {verifiedAt:p.verifiedAt||p.createdAt||'',invoiceNumber:p.invoiceNumber||'',orderNo:o.orderNo||'',customerCode:c.code||'',customerName:c.name||'',totalAmount:Number(p.totalAmount||0)};
 });
 throw Error('Unsupported SQL report source');
}
module.exports={supported,canonical,build};
