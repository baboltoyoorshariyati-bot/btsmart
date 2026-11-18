'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('پیش‌نویس وزن پایدار است، تحویل محسوب نمی‌شود و با نسخه و مراجعه کنترل می‌شود',{timeout:90000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-draft-')),base=`http://127.0.0.1:${port}`;let proc;
 async function start(){proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});}
 async function stop(){if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}}
 async function call(method,url,body,cookie){const r=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
 async function ok(method,url,body,cookie,status=200){const r=await call(method,url,body,cookie);assert.equal(r.status,status,`${url}: ${JSON.stringify(r.body)}`);return r;}
 try{await start();let admin=(await ok('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin);
 for(const [username,roleCode] of [['warehouse','warehouse'],['sales','sales'],['shop','store']])await ok('POST','/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:'Changed!2345',mustChangePassword:false,...(roleCode==='store'?{storeName:'فروشگاه شعبه 1 حمزه کلا'}:{})},admin,201);
 const login=async u=>(await ok('POST','/api/login',{username:u,password:'Changed!2345'})).cookie;let wh=await login('warehouse'),sales=await login('sales'),shop=await login('shop');
 const d=new Date(),day=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 const order=(await ok('POST','/api/orders/remote',{deliveryDate:day,name:'مشتری',phone:'09121112233',scheduledTime:'00:00',deliveryMode:'PICKUP',items:[{productId:'p01',requestedQty:20,requestedUnit:'کیلوگرم'},{productId:'p02',requestedQty:5,requestedUnit:'کیلوگرم'}]},sales,201)).body.order;
 const url=`/api/orders/${order.id}/warehouse/draft`,a=order.items[0].id,b=order.items[1].id;
 assert.equal((await call('POST',url,{revision:0,items:[]},sales)).status,403);
 assert.equal((await call('POST',url,{revision:0,items:[]},wh)).status,409);
 await ok('POST',`/api/orders/${order.id}/warehouse/accept`,{},wh);await ok('POST',`/api/orders/${order.id}/warehouse/start-preparing`,{},wh);
 assert.equal((await call('POST',url,{revision:0,items:[{itemId:a,weighings:[{grossKg:1,cartKg:2}]}]},wh)).status,400);
 assert.equal((await call('POST',url,{revision:0,items:[{itemId:a,deliveredKg:2},{itemId:a,deliveredKg:3}]},wh)).status,400);
 const payload={revision:0,items:[{itemId:a,weighings:[{grossKg:20,basket18:1,cartKg:2}]},{itemId:b,outOfStock:true}]};let draft=(await ok('POST',url,payload,wh)).body.draft;assert.equal(draft.revision,1);assert.equal(draft.items[0].deliveredKg,16.2);assert.equal(draft.items[0].weighings[0].tareKg,3.8);assert.equal(draft.items[1].outOfStock,true);
 assert.equal((await call('POST',url,payload,wh)).status,409);
 let current=(await ok('GET',`/api/orders/${order.id}`,null,wh)).body.order;assert.equal(current.status,'WAREHOUSE_PREPARING');assert.equal(current.items[0].deliveredKg,null);assert.equal(current.warehouseCompletedAt,undefined);assert.equal(current.pickupHandover,undefined);assert.equal(current.payment,undefined);assert.equal((await call('GET',`/api/warehouse/delivered/${order.id}`,null,wh)).status,404);
 const so=(await ok('POST','/api/store/orders',{name:'فروشگاه',phone:'09121112234',items:[{productId:'p01',requestedQty:20,requestedUnit:'کیلوگرم'}]},shop,201)).body.order;await ok('POST',`/api/store/orders/${so.id}/quick-send`,{},sales);await ok('POST',`/api/orders/${so.id}/warehouse/accept`,{},wh);await ok('POST',`/api/orders/${so.id}/warehouse/start-preparing`,{},wh);
 await ok('POST',`/api/orders/${so.id}/store-run/weights`,{run:1,items:[{itemId:so.items[0].id,weighings:[{grossKg:20,basket25:2,cartKg:1}]}]},wh);
 let storeOrder=(await ok('GET',`/api/orders/${so.id}`,null,wh)).body.order;assert.equal(storeOrder.items[0].runR1.length,1);assert.equal(storeOrder.items[0].runR1[0].kg,14);assert.equal(storeOrder.storeRunOps.r1Shipment,undefined);assert.equal(storeOrder.warehouseCompletedAt,undefined);assert.equal(storeOrder.transportHandovers,undefined);
 await stop();await start();admin=await login('admin');wh=await login('warehouse');sales=await login('sales');
 current=(await ok('GET',`/api/orders/${order.id}`,null,wh)).body.order;assert.deepEqual(current.warehouseWeightDraft,draft);storeOrder=(await ok('GET',`/api/orders/${so.id}`,null,wh)).body.order;assert.equal(storeOrder.items[0].runR1[0].weighings[0].cartKg,1);assert.equal(storeOrder.storeRunOps.r1Shipment,undefined);
 const competitors=await Promise.all([12.5,13].map(kg=>call('POST',url,{revision:1,items:[{itemId:a,deliveredKg:kg},{itemId:b,outOfStock:true}]},wh)));assert.deepEqual(competitors.map(x=>x.status).sort(),[200,409]);draft=competitors.find(x=>x.status===200).body.draft;assert.equal(draft.revision,2);
 let r=await call('POST',`/api/pickup/${order.id}/handover`,{physicalHandoverConfirmed:true,draftRevision:2,items:draft.items},wh);assert.equal(r.status,409);
 await ok('POST',`/api/pickup/${order.id}/entry`,{name:'مشتری',phone:'09121112233',noVehicle:true},admin,201);
 r=await call('POST',`/api/pickup/${order.id}/handover`,{physicalHandoverConfirmed:true,draftRevision:1,items:draft.items},wh);assert.equal(r.status,409);
 assert.equal((await call('POST',`/api/pickup/${order.id}/handover`,{physicalHandoverConfirmed:true,items:draft.items},wh)).status,400);
 // null is an output representation for a manual weight, not an input weighing list.
 const finalItems=draft.items.map(({weighings,...x})=>weighings?{...x,weighings}:x);
 r=await ok('POST',`/api/pickup/${order.id}/handover`,{physicalHandoverConfirmed:true,draftRevision:2,items:finalItems},wh);assert.equal(r.body.handover.document.items[0].deliveredKg,draft.items[0].deliveredKg);assert.equal(r.body.handover.document.items[1].outOfStock,true);
 assert.equal((await call('POST',url,{revision:2,items:[]},wh)).status,409);
 assert.equal((await call('POST',`/api/pickup/${order.id}/handover`,{physicalHandoverConfirmed:true,items:finalItems},wh)).status,409);
 const cancelled=(await ok('POST','/api/orders/remote',{deliveryDate:day,name:'انصراف',phone:'09121112235',scheduledTime:'00:00',deliveryMode:'PICKUP',items:[{productId:'p01',requestedQty:10,requestedUnit:'کیلوگرم'}]},sales,201)).body.order;
 await ok('POST',`/api/orders/${cancelled.id}/warehouse/accept`,{},wh);await ok('POST',`/api/orders/${cancelled.id}/warehouse/start-preparing`,{},wh);await ok('POST',`/api/orders/${cancelled.id}/warehouse/draft`,{revision:0,items:[{itemId:cancelled.items[0].id,deliveredKg:9}]},wh);
 await ok('POST',`/api/pickup/${cancelled.id}/entry`,{name:'انصراف',phone:'09121112235',noVehicle:true},admin,201);await ok('POST',`/api/pickup/${cancelled.id}/cancellation`,{reason:'انصراف',confirmedNoGoods:true},wh);
 assert.equal((await call('POST',`/api/orders/${cancelled.id}/warehouse/draft`,{revision:1,items:[]},wh)).status,409);await ok('POST',`/api/pickup/${cancelled.id}/cancellation-approval`,{},sales);await ok('POST',`/api/pickup/${cancelled.id}/cancellation-exit`,{},admin);
 const returned=(await ok('POST','/api/orders/remote',{deliveryDate:day,name:'اصلاح',phone:'09121112236',scheduledTime:'00:00',deliveryMode:'PICKUP',items:[{productId:'p01',requestedQty:10,requestedUnit:'کیلوگرم'}]},sales,201)).body.order;
 await ok('POST',`/api/orders/${returned.id}/warehouse/accept`,{},wh);await ok('POST',`/api/orders/${returned.id}/warehouse/start-preparing`,{},wh);await ok('POST',`/api/orders/${returned.id}/warehouse/draft`,{revision:0,items:[{itemId:returned.items[0].id,deliveredKg:9}]},wh);
 const returnedOrder=(await ok('POST',`/api/orders/${returned.id}/return-sales`,{reason:'اصلاح اقلام'},wh)).body.order;assert.equal(returnedOrder.warehouseWeightDraft.revision,2);assert.deepEqual(returnedOrder.warehouseWeightDraft.items,[]);

 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
