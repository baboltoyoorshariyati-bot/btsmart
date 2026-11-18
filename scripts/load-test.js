'use strict';
// Bounded synthetic HTTP load only. No production URL or DATA_DIR is accepted.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {DatabaseSync}=require('node:sqlite'),{startIsolated}=require('../lib/isolated-server'),{seedDatabase}=require('../lib/synthetic-fixture');
async function runLoad({requests=200,concurrency=8,orders=1000}={}){
 for(const[value,min,max]of[[requests,1,5000],[concurrency,1,64],[orders,0,100000]])if(!Number.isInteger(value)||value<min||value>max)throw Error('Invalid load-test bounds');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bt-http-load-')),password=crypto.randomBytes(24).toString('hex');let server;
 try{
  const database=seedDatabase({dataDir:root,orders,password});server=await startIsolated({dataDir:root,database,env:{ADMIN_INITIAL_PASSWORD:password}});
  const login=await fetch(server.base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',password}),signal:AbortSignal.timeout(10000)});
  if(login.status!==200)throw Error('Synthetic login failed');await login.json();
  const cookie=login.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw Error('Synthetic session missing');
  const endpoints=['/api/health','/api/orders?limit=25','/api/orders?limit=25&q=customer%209','/api/sales/history?limit=25'];
  let cursor=0,failures=0;const times=[],statuses={};const start=performance.now();
  await Promise.all(Array.from({length:Math.min(requests,concurrency)},async()=>{
   while(cursor<requests){const index=cursor++,t=performance.now();
    try{const response=await fetch(server.base+endpoints[index%endpoints.length],{headers:{cookie},signal:AbortSignal.timeout(30000)});await response.json();statuses[response.status]=(statuses[response.status]||0)+1;if(response.status!==200)failures++;}
    catch{failures++;statuses.network=(statuses.network||0)+1;}finally{times.push(performance.now()-t);}
   }
  }));
  const duration=performance.now()-start;times.sort((a,b)=>a-b);
  // Concurrent retries of one mutation must all return the same persisted visit.
  const burst=Math.max(2,Math.min(concurrency,20)),key='load-'+crypto.randomBytes(12).toString('hex');
  const replies=await Promise.all(Array.from({length:burst},async()=>{
   const r=await fetch(server.base+'/api/visits',{method:'POST',headers:{cookie,'content-type':'application/json','idempotency-key':key},body:JSON.stringify({name:'Synthetic customer 0',phone:'09120000000',noVehicle:true}),signal:AbortSignal.timeout(30000)});
   const body=await r.json();if(r.status!==201)throw Error('Concurrent write retry failed');return body.visit.id;
  }));
  const db=new DatabaseSync(database,{readOnly:true});let persisted;
  try{persisted=Number(db.prepare('SELECT COUNT(*) AS n FROM visits WHERE id=?').get(replies[0]).n);if(db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('SQLite integrity check failed');}finally{db.close();}
  if(new Set(replies).size!==1||persisted!==1)throw Error('Concurrent idempotency invariant failed');
  return{synthetic:true,requests,concurrency,orders,failures,statuses,durationMs:+duration.toFixed(2),requestsPerSecond:+(requests*1000/duration).toFixed(2),p50Ms:+times[Math.floor((times.length-1)*.5)].toFixed(2),p95Ms:+times[Math.floor((times.length-1)*.95)].toFixed(2),writeRetryBurst:burst,singlePersistedVisit:true};
 }finally{if(server)await server.stop();fs.rmSync(root,{recursive:true,force:true});}
}
if(require.main===module){runLoad({requests:Number(process.argv[2]||200),concurrency:Number(process.argv[3]||8),orders:Number(process.argv[4]||1000)}).then(result=>{console.log(JSON.stringify(result,null,2));if(result.failures)process.exitCode=1;}).catch(()=>{console.error('Synthetic load test failed; no production database was used.');process.exitCode=1;});}
module.exports={runLoad};
