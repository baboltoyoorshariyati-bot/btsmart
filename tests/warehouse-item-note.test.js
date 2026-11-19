'use strict';
// توضیح انبار برای هر محصول: ثبت در وزن‌کشی انبار و نمایش فقط‌خواندنی برای فروش.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');

test('توضیح انبار کوتاه و تک‌خطی می‌شود و متن نامعتبر رد می‌شود',()=>{
 const note=require('../lib/warehouse-item-note');
 assert.equal(note.normalize(undefined),'');
 assert.equal(note.normalize(null),'');
 assert.equal(note.normalize('   '),'');
 assert.equal(note.normalize('  دو کارتن   نمدار بود \n بی‌شماره '),'دو کارتن نمدار بود بی‌شماره');
 assert.equal(note.normalize('a'.repeat(note.MAX_LENGTH)),'a'.repeat(note.MAX_LENGTH));
 assert.throws(()=>note.normalize('a'.repeat(note.MAX_LENGTH+1)),/۳۰۰|300/);
 assert.throws(()=>note.normalize(42),/توضیح انبار/);
 assert.throws(()=>note.normalize({text:'x'}),/توضیح انبار/);
 const item={id:'i1'};
 assert.equal(note.record(item,'کیسه پاره شد',{id:'u1',fullName:'انباردار'},'2026-01-01T00:00:00.000Z'),'کیسه پاره شد');
 assert.deepEqual(item,{id:'i1',warehouseNote:'کیسه پاره شد',warehouseNoteAt:'2026-01-01T00:00:00.000Z',warehouseNoteBy:'u1',warehouseNoteByName:'انباردار'});
 assert.equal(note.record(item,'',{id:'u1'},'2026-01-02T00:00:00.000Z'),'');
 assert.deepEqual(item,{id:'i1'});
});

test('توضیح انبار در پیش‌نویس وزن ذخیره و پس از نهایی‌شدن برای فروش خواندنی است',{timeout:120000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-wh-note-')),base=`http://127.0.0.1:${port}`;let proc;
 async function start(){proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});}
 async function stop(){if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}}
 async function call(method,url,body,cookie){const r=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};}
 async function ok(method,url,body,cookie,status=200){const r=await call(method,url,body,cookie);assert.equal(r.status,status,`${url}: ${JSON.stringify(r.body)}`);return r;}
 try{
  await start();
  let admin=(await ok('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;
  await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin);
  for(const [username,roleCode] of [['warehouse','warehouse'],['sales','sales']])await ok('POST','/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:'Changed!2345',mustChangePassword:false},admin,201);
  const login=async u=>(await ok('POST','/api/login',{username:u,password:'Changed!2345'})).cookie;
  const wh=await login('warehouse'),sales=await login('sales');
  const d=new Date(),day=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const order=(await ok('POST','/api/orders/remote',{deliveryDate:day,name:'مشتری',phone:'09121112233',scheduledTime:'00:00',deliveryMode:'PICKUP',items:[{productId:'p01',requestedQty:20,requestedUnit:'کیلوگرم'},{productId:'p02',requestedQty:5,requestedUnit:'کیلوگرم'}]},sales,201)).body.order;
  const a=order.items[0].id,b=order.items[1].id,draftUrl=`/api/orders/${order.id}/warehouse/draft`;
  await ok('POST',`/api/orders/${order.id}/warehouse/accept`,{},wh);
  await ok('POST',`/api/orders/${order.id}/warehouse/start-preparing`,{},wh);
  // فروش نمی‌تواند توضیح انبار بنویسد.
  assert.equal((await call('POST',draftUrl,{revision:0,items:[{itemId:a,deliveredKg:15,note:'دستبرد فروش'}]},sales)).status,403);
  // توضیح بیش از حد بلند رد می‌شود و در پیش‌نویس ذخیره نمی‌شود.
  assert.equal((await call('POST',draftUrl,{revision:0,items:[{itemId:a,deliveredKg:15,note:'x'.repeat(301)}]},wh)).status,400);
  // پیش‌نویس توضیح هر قلم را نگه می‌دارد (شامل قلم ناموجود).
  const draft=(await ok('POST',draftUrl,{revision:0,items:[{itemId:a,deliveredKg:15,note:'  ۲ کارتن  نمدار بود '},{itemId:b,outOfStock:true,note:'موجودی تمام شد'}]},wh)).body.draft;
  assert.equal(draft.items[0].note,'۲ کارتن نمدار بود');
  assert.equal(draft.items[1].note,'موجودی تمام شد');
  const reopened=(await ok('GET',`/api/orders/${order.id}`,null,wh)).body.order;
  assert.equal(reopened.warehouseWeightDraft.items[0].note,'۲ کارتن نمدار بود');
  // تا پیش از نهایی‌شدن، قلم هنوز توضیح نهایی ندارد.
  assert.equal(reopened.items[0].warehouseNote,undefined);
  // نهایی‌سازی: توضیح روی قلم می‌نشیند و برای فروش قابل خواندن است.
  await ok('POST',`/api/pickup/${order.id}/entry`,{name:'مشتری',phone:'09121112233',noVehicle:true},admin,201);
  // null weighings is an output representation of a manual weight, not valid input.
  const finalItems=draft.items.map(({weighings,...x})=>weighings?{...x,weighings}:x);
  const handover=(await ok('POST',`/api/pickup/${order.id}/handover`,{physicalHandoverConfirmed:true,draftRevision:draft.revision,items:finalItems},wh)).body;
  assert.equal(handover.handover.document.items[0].deliveredKg,15);
  // پس از نهایی‌شدن، نقش انبار به این سفارش دسترسی ندارد؛ مدیر و فروش توضیح را می‌خوانند.
  assert.equal((await call('GET',`/api/orders/${order.id}`,null,wh)).status,403);
  const fromWarehouse=(await ok('GET',`/api/orders/${order.id}`,null,admin)).body.order;
  assert.equal(fromWarehouse.items[0].warehouseNote,'۲ کارتن نمدار بود');
  assert.equal(fromWarehouse.items[0].warehouseNoteByName,'warehouse');
  assert.equal(fromWarehouse.items[1].warehouseNote,'موجودی تمام شد');
  const fromSales=(await ok('GET',`/api/orders/${order.id}`,null,sales)).body.order;
  assert.equal(fromSales.items[0].warehouseNote,'۲ کارتن نمدار بود');
  assert.equal(fromSales.items[1].warehouseNote,'موجودی تمام شد');
  // فرم تسویه همان توضیح را می‌گیرد و پس از ثبت قیمت هم تغییر نمی‌کند.
  await ok('POST',`/api/orders/${order.id}/settle`,{items:[{itemId:a,unitPrice:1000},{itemId:b,unitPrice:0}],signatureData:'data:image/png;base64,'+'A'.repeat(300),noFingerprintAllowed:true},sales);
  const settled=(await ok('GET',`/api/orders/${order.id}`,null,sales)).body.order;
  assert.equal(settled.items[0].warehouseNote,'۲ کارتن نمدار بود');
  assert.equal(settled.items[0].warehouseStatus,'DELIVERED');
 }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});

test('فرم وزن‌کشی انبار برای هر محصول ورودی توضیح و فرم تسویه نمایش فقط‌خواندنی دارد',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const warehouse=fs.readFileSync(path.join(__dirname,'../public/ui2.js'),'utf8');
 const settlement=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/compatibility.css'),'utf8');
 assert.match(warehouse,/data-wh38-note="\$\{it\.id\}"/);
 assert.match(warehouse,/توضیح انبار برای فروش/);
 assert.match(warehouse,/note:noteOf\(w\.dataset\.wh38Weight\)/);
 assert.match(warehouse,/if\(row&&typeof row\.note==='string'\)el\.value=row\.note/);
 assert.match(settlement,/warehouseNote: String\(i\.warehouseNote\|\|''\)/);
 assert.match(settlement,/class="stl-warehouse-note"/);
 assert.doesNotMatch(settlement,/data-stl-note|contenteditable/);
 assert.match(css,/#appView #content \.wh38-note-cell \{[\s\S]*?grid-column:1\/-1!important/);
 assert.match(css,/#appView #content \.stl-row \.stl-warehouse-note \{/);
});
