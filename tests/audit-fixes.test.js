'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const validate=require('../lib/validate'),{csvCell,streamCsv}=require('../lib/csv'),reports=require('../lib/reports');
test('strict numeric parser rejects altered values and preserves valid localized numbers',()=>{
 for(const value of ['abc','1e3','12abc34','1,23','12.3.4',true,{},'NaN','Infinity',''])assert.throws(()=>validate.number(value,{min:0}));
 assert.equal(validate.number('۱۲٬۳۴۵٫۶',{min:0}),12345.6);
 for(const [raw,want] of [['۱۲٬۳۴۵.۶',12345.6],['١٢٣٤',1234],['1,234.50',1234.5],[0,0],[-12,-12],['0.25',0.25]])assert.equal(validate.number(raw),want);
});
test('driver plates support complete car and motorcycle forms without changing stored legacy records',()=>{
 assert.equal(validate.driverPlate('۱۲ ب ۳۴۵ - ۶۷','وانت'),'12ب345-67');
 assert.equal(validate.driverPlate('۱۲۳ - ۴۵۶۷۸','موتورسیکلت'),'123-45678');
 for(const raw of ['', '1','12ب34-67','12ب345-6','999999999'])assert.throws(()=>validate.driverPlate(raw,'وانت'));
});
test('CSV neutralizes formula text including leading whitespace, preserves real numeric cells and quoting',()=>{
 for(const raw of ['=1+1','+1','-1','@SUM(A1)',' \t=1+1','\ttext','\rtext','\ntext'])assert(csvCell(raw).replace(/^"/,'').startsWith("'"));
 assert.equal(csvCell(-12),'-12');assert.equal(csvCell('شماره ۱۲'),'شماره ۱۲');assert.equal(csvCell('a,"b"'),'"a,""b"""');
});
test('full report export has every row and exactly the same selected columns and filters',async()=>{
 const db={customers:Array.from({length:11001},(_,i)=>({id:String(i),name:i===0?'=1+1':'customer-'+i,phone:'0912',code:String(i).padStart(6,'0')})),visits:[],orders:[]};
 const q={source:'customers',fields:['name','code']},preview=reports.query(db,q),full=reports.query(db,q,{limit:Infinity});
 assert.equal(preview.rows.length,5000);assert.equal(full.rows.length,11001);assert.equal(full.truncated,false);assert.deepEqual(full.columns,preview.columns);
 const rows=[];await streamCsv({destroyed:false,write:s=>(rows.push(s),true)},full);const csv=rows.join('');assert(csv.includes("'=1+1"));assert.equal(csv.trimEnd().split('\r\n').length,11002);
 const filter=reports.query(db,{...q,filters:[{field:'code',op:'equals',value:'010000'}]},{limit:Infinity});assert.equal(filter.total,1);
});
test('environment loader preserves process values, supports quotes/comments and rejects invalid quoting',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-env-'));try{
  const file=path.join(dir,'.env');fs.writeFileSync(file,'PORT=3188\nTOKEN="value#part" # comment\nexport FLAG=true\nPLAIN=abc # comment\n');
  const env={PORT:'9999'};require('../lib/load-env').loadEnv(file,env);assert.deepEqual(env,{PORT:'9999',TOKEN:'value#part',FLAG:'true',PLAIN:'abc'});
  fs.writeFileSync(file,'BAD="not closed');assert.throws(()=>require('../lib/load-env').loadEnv(file,{}));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('cookie renewal is bounded by absolute session lifetime; server rejects idle/absolute expiry',()=>{
 const sec=require('../lib/security'),config=require('../lib/config');const now=Date.now,base=now();let clock=base;Date.now=()=>clock;
 try{
  const sid=sec.createSession('test','127.0.0.1');clock+=1000;const s=sec.getSession(sid);assert(s);
  assert.match(sec.sessionCookie(sid,s),/HttpOnly; SameSite=Strict/);
  clock=base+config.SESSION_MAX_MS-1500;assert.doesNotMatch(sec.sessionCookie(sid,s),/Max-Age|Expires/);
  clock=base+config.SESSION_MAX_MS+1;assert.equal(sec.getSession(sid),null);
  clock=base;const idle=sec.createSession('test','127.0.0.1');clock+=config.SESSION_IDLE_MS+1;assert.equal(sec.getSession(idle),null);
 }finally{Date.now=now}
});
test('print documents load CSP-compliant external script, licensed font and one shared signature pad',()=>{
 const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
 for(const file of ['public/app.js','public/ui2.js','public/admin-ui.js']){const s=read(file);assert.doesNotMatch(s,/<script>window\.onload/);assert.match(s,/\/print-ready\.js/);}
 assert.match(read('lib/security.js'),/script-src 'self'/);assert.doesNotMatch(read('lib/security.js'),/script-src 'self' 'unsafe-inline'/);
 assert(read('public/fonts/OFL.txt').includes('SIL OPEN FONT LICENSE'));
 assert.match(read('public/app.js'),/stl\.signaturePad=btSignaturePad/);assert.match(read('public/dispatch-ui.js'),/dsp\.sig=btSignaturePad/);
 assert.match(read('public/ui2.js'),/return window\.BTSettlementRenderers\.form\(o\)/);
});
test('CSV streaming releases all backpressure listeners on drain and early disconnection',async()=>{
 const {EventEmitter}=require('node:events');
 class Target extends EventEmitter{constructor(close){super();this.closeEarly=close;this.destroyed=false;this.count=0}write(){this.count++;setImmediate(()=>{if(this.closeEarly){this.destroyed=true;this.emit('close')}else this.emit('drain')});return false}}
 for(const close of [false,true]){const out=new Target(close);await streamCsv(out,{columns:[{key:'x',label:'X'}],rows:Array.from({length:11001},(_,i)=>({x:i}))});assert.equal(out.listenerCount('close'),0);assert.equal(out.listenerCount('drain'),0);assert.equal(out.listenerCount('error'),0);assert.equal(out.count,close?1:46)}
});
