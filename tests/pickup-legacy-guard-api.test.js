'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {DatabaseSync}=require('node:sqlite');
test('legacy pickup endpoints respect active visit and cancellation; locked writes roll back',{timeout:45000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-pickup-legacy-')),base=`http://127.0.0.1:${port}`;
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_PICKUP_STAGING:'false'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  let cookie='';const call=async(method,url,body)=>{const res=await fetch(base+url,{method,headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await res.json();cookie=(res.headers.get('set-cookie')||cookie).split(';')[0];return {status:res.status,data};};
  assert.equal((await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).status,200);
  assert.equal((await call('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'})).status,200);
  assert.equal((await call('GET','/api/pickup/orders?q=مشتری')).status,404,'staged API must be disabled by default');
  const created=await call('POST','/api/orders/remote',{name:'مشتری',phone:'09121112233',deliveryMode:'PICKUP',scheduledTime:'00:00',items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}]});assert.equal(created.status,201,JSON.stringify(created));const o=created.data.order;
  const database=path.join(dir,'baboltoyoor.db');
  const sql=(fn)=>{const db=new DatabaseSync(database);try{fn(db)}finally{db.close();}};
  sql(db=>db.exec("CREATE TRIGGER test_fail_accept BEFORE INSERT ON audit WHEN NEW.action='WAREHOUSE_ACCEPT_ORDER' BEGIN SELECT RAISE(ABORT, 'forced failure'); END"));
  assert.equal((await call('POST',`/api/orders/${o.id}/warehouse/accept`,{})).status,500);
  sql(db=>{assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(o.id).status,'WAREHOUSE_PENDING');db.exec('DROP TRIGGER test_fail_accept');});
  assert.equal((await call('POST',`/api/orders/${o.id}/warehouse/accept`,{})).status,200);
  sql(db=>{
   const visit={id:'pv',orderId:o.id,customerId:o.customerId,status:'PICKUP_PRESENT',recipient:{name:'راننده مشتری',phone:'09121112244'}};
   db.prepare('INSERT INTO visits (id,customer_id,status,payload) VALUES (?,?,?,?)').run(visit.id,visit.customerId,visit.status,JSON.stringify(visit));
   db.prepare("UPDATE orders SET payload=json_set(payload,'$.visitId','pv','$.pickupRecipient',json(?)) WHERE id=?").run(JSON.stringify(visit.recipient),o.id);
  });
  const weights={items:[{itemId:o.items[0].id,deliveredKg:1}]};
  assert.equal((await call('POST',`/api/orders/${o.id}/warehouse`,weights)).status,409,'old finalize must not bypass pickup handover');
  sql(db=>db.prepare("UPDATE orders SET payload=json_set(payload,'$.pickupCancellation',json(?)) WHERE id=?").run(JSON.stringify({status:'PENDING_SALES',visitId:'pv',noGoodsConfirmed:true}),o.id));
  for(const [method,url,body] of [['POST',`/api/orders/${o.id}/warehouse/start-preparing`,{}],['POST',`/api/orders/${o.id}/return-sales`,{}],['POST',`/api/orders/${o.id}/warehouse`,weights],['POST',`/api/orders/${o.id}/cancel-remote`,{}],['POST',`/api/orders/${o.id}/exit`,{}]]){
   const result=await call(method,url,body);assert.equal(result.status,409,`${url} ${JSON.stringify(result)}`);
  }
  sql(db=>{assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(o.id).status,'WAREHOUSE_PREPARING');assert.equal(JSON.parse(db.prepare('SELECT payload FROM order_items WHERE order_id=?').get(o.id).payload).deliveredKg,null);});
 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
