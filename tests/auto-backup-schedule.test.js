'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('hourly schedule does not run early, retains all snapshots and retries failures',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bt-auto-schedule-'));process.env.DATA_DIR=path.join(root,'data');process.env.ADMIN_INITIAL_PASSWORD='Initial!2345';
 const store=require('../lib/store'),auto=require('../lib/auto-backup');
 try{
  store.init();const dest=path.join(root,'destination'),now=Date.now();let s=auto.configure({enabled:true,directory:dest},now);assert.equal(s.lastError,null);assert.ok(s.lastBackup);
  assert.equal(auto.runDue(now+auto.HOUR-1),false);assert.equal(fs.readdirSync(dest).length,1);
  assert.equal(auto.runDue(now+auto.HOUR),true);assert.equal(fs.readdirSync(dest).length,2);
  fs.renameSync(dest,dest+'-offline');assert.equal(auto.runDue(now+2*auto.HOUR),false);s=auto.read();assert.match(s.lastError,/پشتیبان خودکار/);assert.equal(Date.parse(s.nextRunAt),now+2*auto.HOUR+auto.RETRY);
  fs.renameSync(dest+'-offline',dest);assert.equal(auto.runDue(now+2*auto.HOUR+auto.RETRY-1),false);assert.equal(auto.runDue(now+2*auto.HOUR+auto.RETRY),true);assert.equal(fs.readdirSync(dest).length,3);assert.equal(auto.read().lastError,null);
  auto.configure({enabled:false,directory:dest},now);assert.equal(auto.runDue(now+100*auto.HOUR),false);assert.equal(fs.readdirSync(dest).length,3);
 } finally{store.sql.close();fs.rmSync(root,{recursive:true,force:true});}
});
