'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const sec=require('../lib/security');
test('asynchronous password verifier preserves the scrypt format and does not block timers',async()=>{
 const hash=sec.hashPassword('TestPassword123');let yielded=false;setImmediate(()=>{yielded=true});
 assert.equal(await sec.verifyPasswordAsync('TestPassword123',hash),true);assert.equal(yielded,true);
 assert.equal(await sec.verifyPasswordAsync('wrong',hash),false);assert.equal(await sec.verifyPasswordAsync('wrong','invalid'),false);
});
test('IP quota covers rotating usernames and successful logins; quotas expire',()=>{
 const now=Date.now();for(let i=0;i<60;i++)assert.equal(sec.reserveLoginAttempt('ip-probe',now),0);
 assert(sec.reserveLoginAttempt('ip-probe',now)>0);assert.equal(sec.reserveLoginAttempt('other-ip',now),0);
 assert.equal(sec.reserveLoginAttempt('ip-probe',now+60001),0);
});
test('expired login failures are pruned without requiring another attempt for the same username',()=>{
 const original=Date.now,now=original();let clock=now;Date.now=()=>clock;
 try{for(let i=0;i<5;i++)sec.recordLoginFailure('prune-ip','user');assert(sec.loginLockedFor('prune-ip','user')>0);
 clock+=16*60*1000;sec.pruneLoginAttempts();assert.equal(sec.loginLockedFor('prune-ip','user'),0);
 }finally{Date.now=original;}
});
test('fatal unhandled errors exit nonzero so the supervisor can restart the service',()=>{
 const {spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-fatal-'));
 try{const result=spawnSync(process.execPath,['-e',"require('./server');setTimeout(()=>{throw Error('fatal-probe')},200)"],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir,PORT:'0',HOST:'127.0.0.1',ADMIN_INITIAL_PASSWORD:'FatalTest1234'},encoding:'utf8',timeout:10000});
 assert.equal(result.status,1,result.stderr);assert.match(result.stderr,/fatal-probe/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
