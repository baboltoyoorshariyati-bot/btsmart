'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.join(__dirname,'..');
test('competing pickup entries and cancellation versus handover cannot both commit',{timeout:30000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-pickup-race-'));
 const env={...process.env,DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'};
 const init=`const s=require('./lib/store'),{today}=require('./lib/domain'),p=require('./lib/pickup-transaction-service');let db=s.init();const day=today();
 db.customers.push({id:'c',name:'مشتری',phone:'09121112233'});
 for(const id of ['entry','handover']) {db.orders.push({id,orderNo:id,createdAt:new Date().toISOString(),customerId:'c',orderType:'REMOTE',deliveryMode:'PICKUP',status:'WAREHOUSE_PREPARING',deliveryDate:day});db.orderItems.push({id:'i-'+id,orderId:id,productId:'p01',itemStatus:'PENDING',deliveredKg:null,requestedQty:1,requestedUnit:'کیلوگرم'});}
 p.entry('handover',{name:'راننده',phone:'09121112244',noVehicle:true},{user:{id:'g',roleCode:'gate'}});`;
 const prep=spawnSync(process.execPath,['-e',init],{cwd:root,env,encoding:'utf8'});assert.equal(prep.status,0,prep.stderr);
 const code=`const s=require('./lib/store'),p=require('./lib/pickup-transaction-service');s.sql.init();s.reloadFromSql({skipRepair:true});
 process.send({ready:true});process.on('message',op=>{try{if(op==='entry')p.entry('entry',{name:'راننده',phone:'09121112244',noVehicle:true},{user:{id:'g',roleCode:'gate'}});else if(op==='cancel')p.requestCancellation('handover',{reason:'انصراف',confirmedNoGoods:true},{user:{id:'w',roleCode:'warehouse'}});else p.finalizeHandover('handover',{physicalHandoverConfirmed:true,items:[{itemId:'i-handover',deliveredKg:1}]},{user:{id:'w',roleCode:'warehouse'}});process.send({ok:true});}catch(e){process.send({ok:false,status:e.status,message:e.message});}process.disconnect();});`;
 async function compete(a,b){
  const children=[a,b].map(op=>({op,proc:spawn(process.execPath,['-e',code],{cwd:root,env,stdio:['ignore','pipe','pipe','ipc']})}));
  try{
   const ready=children.map(({proc})=>new Promise((resolve,reject)=>{proc.once('message',m=>m.ready?resolve():reject(Error(JSON.stringify(m))));proc.once('error',reject);proc.once('exit',c=>{if(c)reject(Error('worker failed '+c));});}));
   await Promise.all(ready);
   const results=children.map(({proc})=>new Promise((resolve,reject)=>{proc.once('message',resolve);proc.once('error',reject);}));
   children.forEach(({proc,op})=>proc.send(op));return await Promise.all(results);
  }finally{children.forEach(({proc})=>{if(proc.exitCode===null)proc.kill();});}
 }
 try{
  const entries=await compete('entry','entry');assert.equal(entries.filter(x=>x.ok).length,1,JSON.stringify(entries));assert.equal(entries.find(x=>!x.ok).status,409);
  const actions=await compete('cancel','handover');assert.equal(actions.filter(x=>x.ok).length,1,JSON.stringify(actions));assert.equal(actions.find(x=>!x.ok).status,409);
  const inspect=`const s=require('./lib/store');s.sql.init();s.reloadFromSql({skipRepair:true});const db=s.get(),o=db.orders.find(x=>x.id==='handover');console.log(JSON.stringify({entries:db.visits.filter(v=>v.orderId==='entry'&&v.status==='PICKUP_PRESENT').length,entryNotifications:db.notifications.filter(n=>n.type==='PICKUP_ENTRY'&&n.entityId==='entry').length,cancel:o.pickupCancellation?.status||null,hand:!!o.pickupHandover,status:o.status,weight:db.orderItems.find(i=>i.id==='i-handover').deliveredKg,audit:s.verifyAuditChain().ok}));`;
  const result=spawnSync(process.execPath,['-e',inspect],{cwd:root,env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);const state=JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(state.entries,1);assert.equal(state.entryNotifications,1);assert.equal(state.audit,true);
  if(state.cancel){assert.equal(state.cancel,'PENDING_SALES');assert.equal(state.hand,false);assert.equal(state.weight,null);assert.equal(state.status,'WAREHOUSE_PREPARING');}
  else {assert.equal(state.hand,true);assert.equal(state.weight,1);assert.equal(state.status,'SETTLEMENT_PENDING');}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
