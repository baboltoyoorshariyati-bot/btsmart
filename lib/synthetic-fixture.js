'use strict';
// Generate synthetic data in a separate process so no live store/config can leak in.
const {spawnSync}=require('node:child_process'),path=require('node:path');
function seedDatabase({dataDir,orders=1000,password}){
 if(!Number.isInteger(orders)||orders<0||orders>100000)throw Error('Invalid synthetic order count');
 const database=path.join(dataDir,'baboltoyoor.db');
 const code=`const s=require('./lib/store');s.init();const d=s.sql.load();d.users[0].mustChangePassword=false;
 d.customers=Array.from({length:100},(_,i)=>({id:'c'+i,name:'Synthetic customer '+i,phone:'0912'+String(i).padStart(7,'0'),code:String(i+1).padStart(5,'0')}));
 d.visits=[{id:'v-fixture',customerId:'c0',createdAt:'2026-11-11T00:00:00Z',status:'PRESENT'}];
 d.orders=Array.from({length:Number(process.env.BT_FIXTURE_ORDERS)},(_,i)=>({id:'o'+i,orderNo:String(i+1).padStart(6,'0'),customerId:'c'+i%100,visitId:'v-fixture',orderType:'REMOTE',deliveryMode:'PICKUP',transportWorkflow:1,status:i%2?'WAREHOUSE_PENDING':'WAREHOUSE_PREPARING',createdAt:'2026-11-11T00:00:00Z'}));
 d.orderItems=d.orders.map(o=>({id:'i-'+o.id,orderId:o.id,productId:d.products[0].id,itemStatus:'PENDING',requestedQty:1,requestedUnit:'کیلوگرم'}));s.sql.save(d);s.sql.close();`;
 const result=spawnSync(process.execPath,['-e',code],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dataDir,SQLITE_FILE:database,ADMIN_INITIAL_PASSWORD:password,BT_FIXTURE_ORDERS:String(orders)},encoding:'utf8',timeout:120000});
 if(result.status!==0)throw Error('Synthetic fixture creation failed');
 return database;
}
module.exports={seedDatabase};
