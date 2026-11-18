'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('retention is opt-in and preserves manual files, unrelated files and latest valid backup',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-retention-'));process.env.DATA_DIR=path.join(dir,'data');process.env.ADMIN_INITIAL_PASSWORD='BackupTest1234';
 const store=require('../lib/store'),auto=require('../lib/auto-backup'),dest=path.join(dir,'backups');
 try{
 store.init();let state=auto.configure({enabled:true,directory:dest});assert.equal(state.retentionDays,0);assert.equal(state.maxSnapshots,0);
 fs.writeFileSync(path.join(dest,'manual.db'),'keep');fs.writeFileSync(path.join(dest,'other.txt'),'keep');
 assert.throws(()=>auto.configure({enabled:true,directory:dest,maxSnapshots:-1}));
 auto.configure({enabled:true,directory:dest,maxSnapshots:1});
 assert.equal(auto.runDue(Date.now()+auto.HOUR+1000),true);
 assert.equal(fs.readdirSync(dest).filter(n=>n.startsWith('baboltoyor-auto-')).length,1);
 assert.equal(fs.readFileSync(path.join(dest,'manual.db'),'utf8'),'keep');assert(fs.existsSync(path.join(dest,'other.txt')));
 state=auto.read();store.sql.validateSnapshot(path.join(dest,state.lastBackup));
 }finally{store.sql.close();fs.rmSync(dir,{recursive:true,force:true});}
});
