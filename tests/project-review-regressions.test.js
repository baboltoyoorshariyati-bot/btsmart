'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {DatabaseSync}=require('node:sqlite');
test('review: rejected order edits do not change persisted customer or items; time and idempotency are consistent',{timeout:90000},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bt-review-')),port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),base=`http://127.0.0.1:${port}`;let proc,admin,shop;
 const day=(n=0)=>{const d=new Date();d.setDate(d.getDate()+n);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
 async function req(method,url,body,cookie=admin,key){const res=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,json:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0],replayed:res.headers.get('Idempotent-Replayed')};}
 const snapshot=()=>{const db=new DatabaseSync(path.join(root,'baboltoyoor.db'),{readOnly:true});try{return Object.fromEntries(['orders','order_items','customers','counters'].map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));}finally{db.close();}};
 try{proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,TZ:'Asia/Tehran',HOST:'127.0.0.1',PORT:String(port),DATA_DIR:root,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','inherit']});await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  let r=await req('POST','/api/login',{username:'admin',password:'Initial!2345'},null);admin=r.cookie;assert.equal((await req('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'})).status,200);
  assert.equal((await req('POST','/api/admin/users',{username:'shop1',roleCode:'store',fullName:'shop',position:'shop',storeName:'فروشگاه',password:'Changed!2345',mustChangePassword:false})).status,201);shop=(await req('POST','/api/login',{username:'shop1',password:'Changed!2345'},null)).cookie;
  const lines=[{productId:'p01',requestedQty:10,requestedUnit:'کیلوگرم'}],details={name:'مشتری نمونه',phone:'09120001234',items:lines},long='x'.repeat(1001);
  // ISO UTC dates around midnight belong to different local calendar days.
  const priorDashboard=(await req('GET','/api/dashboard')).json.counts.visitsToday,priorReport=(await req('GET','/api/reports')).json;
  const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const midnight=Date.parse(localDate+'T00:00:00+03:30');const localToday=new Date(midnight+1800000).toISOString(),localYesterday=new Date(midnight-1800000).toISOString();
  const datesDb=new DatabaseSync(path.join(root,'baboltoyoor.db'));try{for(const [id,ts] of [['today',localToday],['yesterday',localYesterday]]){const visit={id:'tz-visit-'+id,createdAt:ts,status:'OPEN'},order={id:'tz-order-'+id,orderNo:'tz-'+id,createdAt:ts,status:'CANCELLED',orderType:'REMOTE'};datesDb.prepare('INSERT INTO visits (id,created_at,status,payload) VALUES (?,?,?,?)').run(visit.id,ts,visit.status,JSON.stringify(visit));datesDb.prepare('INSERT INTO orders (id,created_at,order_no,status,order_type,payload) VALUES (?,?,?,?,?,?)').run(order.id,ts,order.orderNo,order.status,order.orderType,JSON.stringify(order));}}finally{datesDb.close();}
  assert.equal((await req('GET','/api/dashboard')).json.counts.visitsToday,priorDashboard+1,'dashboard must use server local day');const datedReport=(await req('GET','/api/reports')).json;assert.equal(datedReport.gate.today,priorReport.gate.today+1);assert.equal(datedReport.sales.todayOrders,priorReport.sales.todayOrders+1);
  const advanced=(await req('POST','/api/admin/reports/query',{source:'visits',from:localDate,to:localDate})).json;assert.equal(advanced.total,1,'advanced reports filter the local date');

  r=await req('POST','/api/admin/users',{username:'badbranch',roleCode:'store',fullName:'bad',position:'bad',storeName:'bad',branchNo:99,password:'Changed!2345',mustChangePassword:false});assert.equal(r.status,400,'invalid branch must not be an internal error');
  const device=(await req('POST','/api/admin/payment-devices',{title:'پوز',terminalNumber:'100',bank:'بانک',model:'مدل'})).json.device;
  for(const field of ['title','terminalNumber','bank','model']){r=await req('PUT',`/api/admin/payment-devices/${device.id}`,{[field]:'   '});assert.equal(r.status,400,field);const current=(await req('GET','/api/admin/payment-devices')).json.devices.find(d=>d.id===device.id);assert.equal(current[field],device[field],field);}

  for(const [url,body,cookie] of [['/api/store/orders',{...details,notes:long},shop],['/api/orders/remote',{...details,notes:long,scheduledDate:day(2),scheduledAt:day(2)+'T08:00'},admin],['/api/orders/remote',{...details,dispatchPlace:'x'.repeat(201),scheduledDate:day(2),scheduledAt:day(2)+'T08:00'},admin]]){
    const before=snapshot();r=await req('POST',url,body,cookie);assert.equal(r.status,400,JSON.stringify(r.json));assert.deepEqual(snapshot(),before,`rejected ${url} must not mutate data or counters`);
  }
  let made=await req('POST','/api/store/orders',details,shop);assert.equal(made.status,201,JSON.stringify(made.json));const o=made.json.order;
  for(const [url,body,cookie] of [[`/api/store/orders/${o.id}`,{...details,name:'نام تغییر نامعتبر',notes:long,items:[{...lines[0],requestedQty:50}]},shop],[`/api/store/orders/${o.id}/sales-edit`,{notes:long,items:[{...lines[0],requestedQty:40}]},admin]]){
    const before=snapshot();r=await req('PUT',url,body,cookie);assert.equal(r.status,400,JSON.stringify(r.json));assert.deepEqual(snapshot(),before,`rejected ${url} must not mutate customer or items`);
  }
  const badTime={...details,scheduledDate:day(2),scheduledAt:day(0)+'T00:00'};const before=snapshot();r=await req('POST','/api/orders/remote',badTime);assert.equal(r.status,400);assert.deepEqual(snapshot(),before);
  made=await req('POST','/api/orders/remote',{...details,scheduledDate:day(2),scheduledAt:day(2)+'T08:00'});assert.equal(made.status,201);const future=made.json.order;const pre=snapshot();r=await req('PUT',`/api/orders/${future.id}/remote`,{scheduledDate:day(2),scheduledAt:day(0)+'T00:00'});assert.equal(r.status,400);assert.deepEqual(snapshot(),pre);
  const o2=(await req('POST','/api/store/orders',{...details,phone:'09120001235'},shop)).json.order;
  const key='same-key-012345',body={dispatchPlace:'مقصد',note:'یکسان'};r=await req('POST',`/api/store/orders/${o.id}/quick-send`,body,admin,key);assert.equal(r.status,200);r=await req('POST',`/api/store/orders/${o.id}/quick-send`,{note:'یکسان',dispatchPlace:'مقصد'},admin,key);assert.equal(r.replayed,'true');
  r=await req('POST',`/api/store/orders/${o2.id}/quick-send`,body,admin,key);assert.equal(r.status,409,'same key for another order must not return the first response');
  r=await req('POST',`/api/store/orders/${o.id}/quick-send`,{dispatchPlace:'جای دیگر'},admin,key);assert.equal(r.status,409,'same key for different payload must not return a false success');
  assert.equal((await req('GET',`/api/store/orders/${o2.id}`,null,shop)).json.order.status,'STORE_PENDING_SALES');
  await req('POST',`/api/orders/${o.id}/warehouse/accept`,{});await req('POST',`/api/orders/${o.id}/warehouse/start-preparing`,{});
  const item=o.items[0].id;const beforeWeight=snapshot();r=await req('POST',`/api/orders/${o.id}/store-run/weights`,{run:1,items:[{itemId:item,deliveredKg:10},{itemId:item,deliveredKg:10}]});assert.equal(r.status,400,'duplicate item must not double the weight');assert.deepEqual(snapshot(),beforeWeight);
  // Add known legacy/null and two-service data through the live SQLite interface.
  const db=new DatabaseSync(path.join(root,'baboltoyoor.db'));const now=new Date().toISOString();
  try{
    const addOrder=(id,status,orderType,dispatch)=>{const row={id,orderNo:id,createdAt:now,status,orderType};if(dispatch!==undefined)row.dispatch=dispatch;db.prepare('INSERT INTO orders (id,created_at,order_no,status,order_type,payload) VALUES (?,?,?,?,?,?)').run(id,now,id,status,orderType,JSON.stringify(row));};
    addOrder('review-return-regular','RETURNED_TO_SALES','REMOTE');addOrder('review-return-store','RETURNED_TO_SALES','STORE');addOrder('review-null-settlement','SETTLEMENT_PENDING','REMOTE',null);addOrder('review-absent-settlement','SETTLEMENT_PENDING','REMOTE');addOrder('review-dispatch-settlement','SETTLEMENT_PENDING','REMOTE',{status:'ASSIGNED'});addOrder('review-null-settled','SETTLED','REMOTE',null);
    addOrder('review-chart','CLOSED','STORE');const item={id:'review-chart-item',orderId:'review-chart',productId:'p01',itemStatus:'DELIVERED',deliveredKg:100};db.prepare('INSERT INTO order_items (id,order_id,product_id,payload) VALUES (?,?,?,?)').run(item.id,item.orderId,item.productId,JSON.stringify(item));
    for(const [run,kg] of [[1,60],[2,30]]){const p={id:'review-pay-'+run,orderId:'review-chart',deliveryRun:run,verifiedAt:now,totalAmount:0,priceLines:[{itemId:item.id,deliveredKg:kg,amount:null}]};db.prepare('INSERT INTO payments (id,order_id,payload) VALUES (?,?,?)').run(p.id,p.orderId,JSON.stringify(p));}
    const oldPay={id:'review-pay-old',orderId:'review-chart',deliveryRun:1,verifiedAt:new Date(Date.now()-40*86400000).toISOString(),priceLines:[{itemId:item.id,deliveredKg:999}]};db.prepare('INSERT INTO payments (id,order_id,payload) VALUES (?,?,?)').run(oldPay.id,oldPay.orderId,JSON.stringify(oldPay));
    const legacy={id:'review-chart-legacy',orderNo:'legacy',createdAt:now,status:'CLOSED',orderType:'STORE',dispatches:[{run:1,shipmentWeights:{'legacy-item':20},lines:[{itemId:'legacy-item',returnKg:3,shortageKg:2}]}]};db.prepare('INSERT INTO orders (id,created_at,order_no,status,order_type,payload) VALUES (?,?,?,?,?,?)').run(legacy.id,now,legacy.orderNo,legacy.status,legacy.orderType,JSON.stringify(legacy));const oldItem={id:'legacy-item',orderId:legacy.id,productId:'p02',deliveredKg:80,runR1:[{kg:20}],runR2:[{kg:60}]};db.prepare('INSERT INTO order_items (id,order_id,product_id,payload) VALUES (?,?,?,?)').run(oldItem.id,oldItem.orderId,oldItem.productId,JSON.stringify(oldItem));const legacyPay={id:'legacy-payment',orderId:legacy.id,deliveryRun:1,verifiedAt:now};db.prepare('INSERT INTO payments (id,order_id,payload) VALUES (?,?,?)').run(legacyPay.id,legacyPay.orderId,JSON.stringify(legacyPay));

  }finally{db.close();}
  r=await req('GET','/api/workload');assert.equal(r.json.counts.salesFlow,1,'store returns must not increment the regular flow badge');r=await req('GET','/api/dashboard');assert.equal(r.json.counts.pendingSettlement,2,'JSON null and missing dispatch both count');assert.equal(r.json.counts.readyExit,1);
  r=await req('GET','/api/dashboard/products?days=1');const chart=r.json.sales.rows.find(x=>x.productId==='p01');assert.equal(chart.kg,90,'each service must use its own invoice lines');assert.equal(chart.orders,1,'two services belong to one order');const legacyChart=r.json.sales.rows.find(x=>x.productId==='p02');assert.equal(legacyChart.kg,15,'legacy run uses its own recorded weight less returns');

  // Finalizing with one invalid later price must not leave the earlier price changed.
  const priceDb=new DatabaseSync(path.join(root,'baboltoyoor.db'));try{const priced={id:'review-price-order',orderNo:'review-price',createdAt:now,status:'DISPATCHED',orderType:'REMOTE',dispatch:{status:'DELIVERED',lines:[],events:[]}};priceDb.prepare('INSERT INTO orders (id,created_at,order_no,status,order_type,payload) VALUES (?,?,?,?,?,?)').run(priced.id,now,priced.orderNo,priced.status,priced.orderType,JSON.stringify(priced));for(const [id,product] of [['price-1','p01'],['price-2','p02']]){const item={id,orderId:priced.id,productId:product,itemStatus:'DELIVERED',deliveredKg:10,unitPrice:10};priceDb.prepare('INSERT INTO order_items (id,order_id,product_id,payload) VALUES (?,?,?,?)').run(id,priced.id,product,JSON.stringify(item));}}finally{priceDb.close();}
  const beforePrice=snapshot();r=await req('POST','/api/sales/dispatch-deliveries/review-price-order/finalize',{items:[{itemId:'price-1',unitPrice:30},{itemId:'price-2',unitPrice:-1}]});assert.equal(r.status,400);assert.deepEqual(snapshot(),beforePrice,'rejected price edits must not persist');
  r=await req('POST','/api/sales/dispatch-deliveries/review-price-order/finalize',{items:[{itemId:'price-1',unitPrice:30},{itemId:'price-2',unitPrice:0}]});assert.equal(r.status,409);assert.deepEqual(snapshot(),beforePrice,'zero delivered price must not persist earlier edits');
  r=await req('POST','/api/sales/dispatch-deliveries/review-price-order/finalize',{items:[{itemId:'price-1',unitPrice:30},{itemId:'price-2',unitPrice:40}]});assert.equal(r.status,200,JSON.stringify(r.json));
  // Audit date filtering follows the same local day boundaries as the UI.
  const auditDb=new DatabaseSync(path.join(root,'baboltoyoor.db'));try{for(const [id,ts] of [['today',localToday],['yesterday',localYesterday]]){const entry={id:'tz-audit-'+id,seq:id==='today'?100000:100001,createdAt:ts,action:'TZ_TEST',entityType:'test'};auditDb.prepare('INSERT INTO audit (id,created_at,seq,action,entity_type,payload) VALUES (?,?,?,?,?,?)').run(entry.id,ts,entry.seq,entry.action,entry.entityType,JSON.stringify(entry));}}finally{auditDb.close();}
  r=await req('GET',`/api/admin/audit?action=TZ_TEST&from=${localDate}&to=${localDate}`);assert.equal(r.json.total,1);assert.equal(r.json.audit[0].id,'tz-audit-today');assert.equal((await req('GET','/api/admin/audit?from=2026-02-31')).status,400);


 }finally{if(proc&&proc.exitCode===null&&proc.signalCode===null){const stopped=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await stopped;}fs.rmSync(root,{recursive:true,force:true});}
});

test('review: malformed stored password hashes fail closed',()=>{const sec=require('../lib/security');const good=sec.hashPassword('ValidPass123');assert.equal(sec.verifyPassword('ValidPass123',good),true);for(const bad of ['scrypt$x$ab','scrypt$x$'+'z'.repeat(128),'scrypt$x$'+'a'.repeat(127),'scrypt$x$'+'a'.repeat(130),'bad'])assert.equal(sec.verifyPassword('x',bad),false,bad);});

test('review: settlement requires whole rial and a real check date',()=>{
 const {cleanRows}=require('../lib/settlement-methods');
 assert.throws(()=>cleanRows([{type:'CASH',amount:1.5},{type:'CASH',amount:1.5}],3,{}),e=>e.status===400);
 assert.throws(()=>cleanRows([{type:'CHECK',amount:100,bank:'بانک',checkNumber:'123',dueDate:'2026-02-31'}],100,{}),e=>e.status===400);
 assert.equal(cleanRows([{type:'CHECK',amount:100,bank:'بانک',checkNumber:'123',dueDate:'2028-02-29'}],100,{})[0].dueDate,'2028-02-29');
});
