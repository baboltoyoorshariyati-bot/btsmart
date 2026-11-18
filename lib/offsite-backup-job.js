'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {encryptDatabase}=require('./encrypted-backup'),{runDrill}=require('../scripts/restore-drill');
const PATTERN=/^baboltoyoor-offsite-\d{8}T\d{6}-[a-f0-9]{16}\.bte$/;
function saveState(directory,state){
 const temp=path.join(directory,'.offsite-status-'+crypto.randomBytes(12).toString('hex')+'.tmp');
 try{fs.writeFileSync(temp,JSON.stringify(state),{flag:'wx',mode:0o600});fs.renameSync(temp,path.join(directory,'offsite-backup-status.json'));}finally{try{fs.unlinkSync(temp)}catch{}}
}
async function runJob({source,dataDir,destination,passphrase,keep=0}={}){
 if(!Number.isInteger(keep)||keep<0||keep>100000)throw Error('Invalid offsite retention');
 if(!destination||!path.isAbsolute(destination))throw Error('An absolute existing backup destination is required');
 const dest=fs.realpathSync(destination),data=fs.realpathSync(dataDir);
 if(dest===data||dest.startsWith(data+path.sep))throw Error('Offsite destination must be outside the data directory');
 if(!fs.statSync(dest).isDirectory())throw Error('Backup destination must be a directory');
 const lockFile=path.join(dest,'.baboltoyoor-offsite.lock'),lock=fs.openSync(lockFile,'wx',0o600);
 let state={lastSuccessAt:null,lastFile:null,lastError:null};
 try{
  fs.writeFileSync(lock,String(process.pid));
  try{const prior=JSON.parse(fs.readFileSync(path.join(data,'offsite-backup-status.json'),'utf8'));state={...state,lastSuccessAt:prior.lastSuccessAt||null,lastFile:prior.lastFile||null};}catch{}
  state.lastAttemptAt=new Date().toISOString();
  const disk=fs.statfsSync(dest,{bigint:true}),size=BigInt(fs.statSync(source).size);
  if(disk.bavail*disk.bsize<size+256n*1024n*1024n)throw Error('Insufficient backup destination space');
  const stamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15),name=`baboltoyoor-offsite-${stamp}-${crypto.randomBytes(8).toString('hex')}.bte`,file=path.join(dest,name);
  await encryptDatabase(source,file,passphrase);
  const drill=await runDrill({source:file,passphrase});
  state={...state,lastSuccessAt:new Date().toISOString(),lastFile:name,lastError:null,restoreVerified:true,restoreElapsedMs:drill.elapsedMs};
  // Delete only our old exports, only after the new export passes a restore drill.
  if(keep){
   const rows=fs.readdirSync(dest).filter(n=>PATTERN.test(n)&&n!==name).flatMap(n=>{const file=path.join(dest,n),stat=fs.lstatSync(file);return stat.isFile()&&!stat.isSymbolicLink()?[{file,time:stat.mtimeMs}]:[];}).sort((a,b)=>b.time-a.time||b.file.localeCompare(a.file));
   for(const row of rows.slice(Math.max(0,keep-1)))fs.unlinkSync(row.file);
  }
  saveState(data,state);return{ok:true,restoreVerified:true,file:name,restoreElapsedMs:drill.elapsedMs};
 }catch(error){
  state.lastAttemptAt=state.lastAttemptAt||new Date().toISOString();state.lastError='Encrypted export or restore verification failed';
  try{saveState(data,state);}catch{}
  throw error;
 }finally{fs.closeSync(lock);fs.unlinkSync(lockFile);}
}
module.exports={runJob};
