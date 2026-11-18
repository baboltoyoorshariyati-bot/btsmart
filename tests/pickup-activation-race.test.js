'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('due activation reloads under lock and never resurrects an approved cancellation',{timeout:30000},async()=>{
 const root=path.join(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-pickup-due-')),env={...process.env,DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'};
 const prep=`const s=require('./lib/store'),p=require('./lib/pickup-transaction-service'),{today}=require('./lib/domain');const db=s.init();db.customers.push({id:'c',name:'مالک',phone:'09121112233'});db.orders.push({id:'o',orderNo:'00001',customerId:'c',orderType:'REMOTE',deliveryMode:'PICKUP',status:'SCHEDULED_REMOTE',scheduledAt:today()+'T00:00',deliveryDate:today()});db.orderItems.push({id:'i',orderId:'o',productId:'p01',itemStatus:'PENDING',deliveredKg:null});p.entry('o',{name:'راننده',phone:'09121112244',noVehicle:true},{user:{id:'g',roleCode:'gate'}});`;
 try{
  const initialized=spawnSync(process.execPath,['-e',prep],{cwd:root,env,encoding:'utf8'});assert.equal(initialized.status,0,initialized.stderr);
  const worker=spawn(process.execPath,['-e',`const s=require('./lib/store'),d=require('./lib/domain');s.sql.init();s.reloadFromSql({skipRepair:true});process.send('ready');process.on('message',()=>{try{d.activateDueRemoteOrders();process.send({ok:true,status:s.get().orders.find(x=>x.id==='o').status});}catch(e){process.send({ok:false,error:e.message});}process.disconnect();});`],{cwd:root,env,stdio:['ignore','pipe','pipe','ipc']});
  try{
   await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('exit',code=>reject(Error('worker exit '+code)));});
   const cancelled=spawnSync(process.execPath,['-e',`const s=require('./lib/store'),p=require('./lib/pickup-transaction-service');s.sql.init();s.reloadFromSql({skipRepair:true});p.requestCancellation('o',{reason:'انصراف',confirmedNoGoods:true},{user:{id:'w',roleCode:'warehouse'}});p.approveCancellation('o',{user:{id:'s',roleCode:'sales'}});`],{cwd:root,env,encoding:'utf8'});assert.equal(cancelled.status,0,cancelled.stderr);
   const result=new Promise(resolve=>worker.once('message',resolve));worker.send('activate');assert.deepEqual(await result,{ok:true,status:'CANCELLED'});
   const check=spawnSync(process.execPath,['-e',`const s=require('./lib/store');s.sql.init();s.reloadFromSql({skipRepair:true});const d=s.get();console.log(JSON.stringify({status:d.orders.find(o=>o.id==='o').status,activations:d.audit.filter(x=>x.action==='ACTIVATE_REMOTE_ORDER'&&x.entityId==='o').length}));`],{cwd:root,env,encoding:'utf8'});assert.equal(check.status,0,check.stderr);assert.deepEqual(JSON.parse(check.stdout.trim().split('\n').at(-1)),{status:'CANCELLED',activations:0});
  }finally{if(worker.exitCode===null)worker.kill();}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
