'use strict';
// Synthetic benchmark only: always uses a fresh temporary database, never DATA_DIR.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{performance}=require('node:perf_hooks');
const count=Number(process.argv[2]||10000);
if(!Number.isInteger(count)||count<100||count>100000)throw Error('Choose 100 to 100000 synthetic orders');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'bt-order-bench-'));
process.env.DATA_DIR=root;process.env.SQLITE_FILE=path.join(root,'baboltoyoor.db');process.env.ADMIN_INITIAL_PASSWORD='SyntheticBenchmarkOnly123';
const store=require('../lib/store'),{queryOrders}=require('../lib/order-search');
try{
 store.init();const data=store.sql.load();data.customers=Array.from({length:100},(_,i)=>({id:'c'+i,name:'customer '+i,phone:'0912'+i}));
 data.orders=Array.from({length:count},(_,i)=>({id:'o'+i,orderNo:String(i).padStart(8,'0'),customerId:'c'+i%100,status:i%2?'WAREHOUSE_PENDING':'SETTLED',orderType:'ONSITE',createdAt:'2026-11-11T00:00:00Z'}));
 store.sql.save(data);
 const cases=[{name:'sales-page',args:{}},{name:'warehouse-page',args:{role:'warehouse'}},{name:'literal-search',args:{q:'customer 99'}},{name:'history-page',args:{history:true}}];
 const results=cases.map(entry=>{
  queryOrders({...entry.args,limit:25});const times=[];let page;
  for(let i=0;i<30;i++){const start=performance.now();page=queryOrders({...entry.args,limit:25,offset:i%3*25});times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);return{name:entry.name,rows:page.orders.length,total:page.total,p50Ms:+times[14].toFixed(2),p95Ms:+times[28].toFixed(2)};
 });
 console.log(JSON.stringify({synthetic:true,orders:count,iterations:30,results},null,2));
}finally{store.sql.close();fs.rmSync(root,{recursive:true,force:true});}
