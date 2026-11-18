'use strict';
const fs=require('node:fs'),path=require('node:path');
async function checkService({url,dataDir,fetchImpl=fetch,now=Date.now(),offsiteMaxAgeMs=null}){
 const response=await fetchImpl(url,{signal:AbortSignal.timeout(10000),redirect:'error'});
 if(!response.ok)throw Error(`Health HTTP ${response.status}`);
 const health=await response.json();if(health.service!=='baboltoyoor'||health.status!=='ok')throw Error('Unexpected health response');
 const stateFile=path.join(dataDir,'auto-backup.json');
 if(fs.existsSync(stateFile)){
  const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
  if(state.enabled){
   if(state.lastError)throw Error('Automatic backup reports a failure');
   const age=now-Date.parse(state.lastSuccessAt);
   if(!Number.isFinite(age)||age< -60000||age>2*60*60*1000)throw Error('No recent successful automatic backup');
   if(!state.lastBackup||path.basename(state.lastBackup)!==state.lastBackup||!fs.existsSync(path.join(state.directory,state.lastBackup)))throw Error('Latest automatic backup is missing');
  }
 }
 if(offsiteMaxAgeMs!==null){
  if(!Number.isFinite(offsiteMaxAgeMs)||offsiteMaxAgeMs<60000)throw Error('Invalid offsite monitoring interval');
  const state=JSON.parse(fs.readFileSync(path.join(dataDir,'offsite-backup-status.json'),'utf8'));
  const age=now-Date.parse(state.lastSuccessAt);
  if(state.lastError||state.restoreVerified!==true||!Number.isFinite(age)||age< -60000||age>offsiteMaxAgeMs)throw Error('No recent verified encrypted offsite backup');
 }
 return {ok:true,release:health.release,checkedAt:new Date(now).toISOString()};
}
async function sendAlert(url,{token='',fetchImpl=fetch}={}){
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('Alert webhook must use HTTPS without URL credentials');
 const response=await fetchImpl(parsed.href,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({service:'baboltoyoor',ok:false,message:'Service or automatic backup check failed',checkedAt:new Date().toISOString()})});
 if(!response.ok)throw Error('Alert delivery failed');
}
module.exports={checkService,sendAlert};
