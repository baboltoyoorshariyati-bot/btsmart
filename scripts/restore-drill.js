'use strict';
// Restore rehearsal only: always decrypt/snapshot into a fresh private directory,
// boot a loopback-only server, reconcile data and delete the rehearsal copy.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {DatabaseSync}=require('node:sqlite'),{decryptDatabase}=require('../lib/encrypted-backup'),{startIsolated}=require('../lib/isolated-server'),{inspect}=require('./check-data-integrity');
function metrics(file){
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  const counts={};for(const table of ['users','customers','orders','order_items','payments'])counts[table]=Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
  const signatures={};
  for(const table of ['order_items','payments']){
   const hash=crypto.createHash('sha256');for(const row of db.prepare(`SELECT id,payload FROM ${table} ORDER BY id`).iterate())hash.update(JSON.stringify([row.id,JSON.parse(row.payload)]));signatures[table]=hash.digest('hex');
  }
  return{counts,signatures};
 }finally{db.close();}
}
async function runDrill({source,passphrase}={}){
 if(!source||!fs.existsSync(source))throw Error('Backup file not found');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bt-restore-drill-')),database=path.join(root,'baboltoyoor.db'),started=performance.now();let server;
 try{
  const handle=fs.openSync(source,'r'),header=Buffer.alloc(8);try{fs.readSync(handle,header,0,8,0);}finally{fs.closeSync(handle);}
  const encrypted=header.equals(Buffer.from('BTENC01\n'));
  if(encrypted)await decryptDatabase(source,database,passphrase);
  else{fs.closeSync(fs.openSync(database,'wx',0o600));const db=new DatabaseSync(source,{readOnly:true});try{db.prepare('VACUUM INTO ?').run(database);}finally{db.close();}}
  if(!inspect(database).ok)throw Error('Restore preflight found inconsistent data');
  const before=metrics(database);
  server=await startIsolated({dataDir:root,database});
  const response=await fetch(server.base+'/api/health',{signal:AbortSignal.timeout(10000)}),health=await response.json();
  if(!response.ok||health.service!=='baboltoyoor'||health.status!=='ok')throw Error('Restored application health check failed');
  await server.stop();server=null;
  const after=metrics(database);
  if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Business data changed during startup; review migration before deployment');
  if(!inspect(database).ok)throw Error('Post-start restore integrity check failed');
  return{ok:true,isolated:true,encrypted,release:health.release,counts:after.counts,invoiceAndLineDataUnchanged:true,elapsedMs:+(performance.now()-started).toFixed(2),rpoMeasured:false};
 }finally{if(server)await server.stop();fs.rmSync(root,{recursive:true,force:true});}
}
if(require.main===module){runDrill({source:process.argv[2],passphrase:process.env.BT_BACKUP_PASSPHRASE}).then(result=>console.log(JSON.stringify(result,null,2))).catch(()=>{console.error('Restore rehearsal failed. Check backup integrity, credentials and migration compatibility. Production data was not replaced.');process.exitCode=1;});}
module.exports={runDrill};
