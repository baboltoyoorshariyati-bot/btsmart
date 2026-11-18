'use strict';
// Test/operations tooling only. Always bind loopback and use a DB inside an
// explicit temporary data directory. Never fall back to the app's DATA_DIR.
const {spawn}=require('node:child_process'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.join(__dirname,'..');
async function startIsolated({dataDir,database,env={}}){
 dataDir=path.resolve(dataDir);database=path.resolve(database);
 if(!database.startsWith(dataDir+path.sep))throw Error('Isolated database must be inside the isolated data directory');
 const child=spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,...env,HOST:'127.0.0.1',PORT:'0',DATA_DIR:dataDir,SQLITE_FILE:database,ADMIN_INITIAL_PASSWORD:env.ADMIN_INITIAL_PASSWORD||crypto.randomBytes(24).toString('hex')},stdio:['ignore','pipe','pipe']});
 child.stderr.resume();
 let ended=false;const exit=new Promise(resolve=>child.once('close',()=>{ended=true;resolve();}));
 async function stop(){
  if(ended)return;
  child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),7000);timer.unref();
  try{await exit;}finally{clearTimeout(timer);}
 }
 try{
  const port=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{cleanup();reject(Error('Isolated server startup timed out'));},30000);let pending='';
   const cleanup=()=>{clearTimeout(timer);child.stdout.off('data',read);child.off('exit',failed);child.off('error',error);};
   const error=()=>{cleanup();reject(Error('Isolated server could not start'));};
   const failed=()=>{cleanup();reject(Error('Isolated server exited during startup'));};
   const read=chunk=>{
    pending+=chunk.toString();let newline;
    while((newline=pending.indexOf('\n'))!==-1){const line=pending.slice(0,newline);pending=pending.slice(newline+1);
     try{const record=JSON.parse(line);if(record.service==='server'&&record.message==='listening'&&Number.isInteger(record.port)&&record.port>0){cleanup();resolve(record.port);}}catch{}
    }
    if(pending.length>65536)pending='';
   };
   child.stdout.on('data',read);child.once('exit',failed);child.once('error',error);
  });
  // Drain stderr but do not leak restored data or initial credentials into reports.
  child.stdout.resume();return{base:`http://127.0.0.1:${port}`,stop};
 }catch(error){await stop();throw error;}
}
module.exports={startIsolated};
