'use strict';
// Read-only preflight. Never initializes, migrates or repairs the production database.
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path');
function inspect(file){
 if(!fs.existsSync(file))throw Error('Database file not found');
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  const findings=[];
  const check=db.prepare('PRAGMA quick_check').all();
  if(check.some(r=>Object.values(r)[0]!=='ok'))findings.push({kind:'sqlite-integrity',count:check.length});
  const rows=table=>db.prepare(`SELECT payload FROM ${table}`).all().map(r=>JSON.parse(r.payload));
  const orders=rows('orders'),items=rows('order_items'),payments=rows('payments'),users=rows('users'),customers=rows('customers'),products=rows('products');
  const references=[['items-without-order',items,'orderId',orders],['items-without-product',items,'productId',products],['payments-without-order',payments,'orderId',orders]];
  for(const [kind,children,key,parents]of references){const ids=new Set(parents.map(r=>r.id)),count=children.filter(r=>!ids.has(r[key])).length;if(count)findings.push({kind,count});}
  const customerIds=new Set(customers.map(r=>r.id));const missingCustomer=orders.filter(o=>o.customerId&&!customerIds.has(o.customerId)).length;
  if(missingCustomer)findings.push({kind:'orders-with-missing-customer',count:missingCustomer});
  const names=new Set();let duplicates=0;for(const user of users){const name=String(user.username||'').toLowerCase();if(names.has(name))duplicates++;names.add(name);}
  if(duplicates)findings.push({kind:'duplicate-usernames',count:duplicates});
  const orderIds=new Set(items.map(i=>i.orderId));const empty=orders.filter(o=>o.status!=='CANCELLED'&&!orderIds.has(o.id)).length;
  if(empty)findings.push({kind:'non-cancelled-orders-without-items',count:empty});
  return{ok:findings.length===0,findings};
 }finally{db.close();}
}
if(require.main===module){
 try{
  require('../lib/load-env').loadEnv();const config=require('../lib/config');
  const file=process.argv[2]||config.SQLITE_FILE||path.join(config.DATA_DIR,'baboltoyoor.db');
  const result=inspect(file);console.log(JSON.stringify(result,null,2));process.exitCode=result.ok?0:1;
 }catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={inspect};
