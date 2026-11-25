'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
test('inter-branch transfer preserves physical receipts and revisions; no accounting or orders are created',{timeout:90000},async()=>{
 const port=await new Promise(r=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});}),dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-transfer-')),base=`http://127.0.0.1:${port}`,pass='Changed!2345';
 const proc=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('exit '+c)));});
  const call=async(method,url,body,cookie)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json(),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
  const ok=async(method,url,body,cookie)=>{const r=await call(method,url,body,cookie);assert(r.status>=200&&r.status<300,url+' '+r.status+' '+JSON.stringify(r.data));return r.data;};
  const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:pass},admin);
  const a=(await ok('POST','/api/admin/store-branches',{name:'مبدأ',branchNo:2},admin)).branch,b=(await ok('POST','/api/admin/store-branches',{name:'مقصد',branchNo:3},admin)).branch,c=(await ok('POST','/api/admin/store-branches',{name:'دیگر',branchNo:4},admin)).branch;
  for(const [username,roleCode,extra] of [['sales','sales',{}],['warehouse-user','warehouse',{}],['shop-a','store',{branchId:a.id}],['shop-b','store',{branchId:b.id}],['shop-c','store',{branchId:c.id}]])await ok('POST','/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:pass,mustChangePassword:false,...extra},admin);
  const login=async username=>(await call('POST','/api/login',{username,password:pass})).cookie,sales=await login('sales'),wh=await login('warehouse-user'),source=await login('shop-a'),dest=await login('shop-b'),other=await login('shop-c');
  const input={destinationBranchId:b.id,sendDate:'2026-11-18',items:[{productId:'p01',kg:'۲٫۵',price:'۱٬۰۰۰',unit:'کیلوگرم',description:'توضیح قلم <ویژه>'}],notes:'تست'};
  // A branch appears as a destination only while it has an active linked store account.
  const empty=(await ok('POST','/api/admin/store-branches',{name:'بدون کاربر',branchNo:5},admin)).branch;
  const branchList=async()=> (await ok('GET','/api/store/transfer-branches',null,source)).branches;
  assert(!(await branchList()).some(x=>x.id===empty.id));
  assert.equal((await call('POST','/api/store/transfers',{...input,destinationBranchId:empty.id},source)).status,400);
  const emptyUser=(await ok('POST','/api/admin/users',{username:'new-shop',roleCode:'store',fullName:'فروشگاه جدید',position:'تست',password:pass,mustChangePassword:false,branchId:empty.id},admin)).user;
  assert((await branchList()).some(x=>x.id===empty.id));
  await ok('PUT','/api/admin/users/'+emptyUser.id,{isActive:false},admin);
  assert(!(await branchList()).some(x=>x.id===empty.id));
  assert.equal((await call('POST','/api/store/transfers',{...input,destinationBranchId:empty.id},source)).status,400);

  assert.equal((await call('POST','/api/store/transfers',{...input,destinationBranchId:a.id},source)).status,400);
  assert.equal((await call('POST','/api/store/transfers',{...input,items:[{productId:'p01',kg:1}]},source)).status,400);
  assert.equal((await call('POST','/api/store/transfers',{...input,items:[{productId:'p01',kg:1,price:'۱٬۲۳'}]},source)).status,400);
  assert.equal((await call('POST','/api/store/transfers',{...input,items:[{productId:'p01',kg:1,price:10,description:'x'.repeat(501)}]},source)).status,400);
  assert.equal((await call('POST','/api/store/transfers',{...input,items:[{productId:'p01',kg:1,price:10,unit:'عدد'}]},source)).status,400);
  let t=(await ok('POST','/api/store/transfers',input,source)).transfer;const id=t.id;assert.equal(t.number,'1');assert.equal(t.items[0].amount,2500);assert.equal(t.items[0].price,1000);assert.equal(t.items[0].description,'توضیح قلم <ویژه>');assert.equal(t.history[0].snapshot.items[0].description,'توضیح قلم <ویژه>');
  assert.equal((await ok('GET','/api/store/transfers',null,other)).transfers.length,0);assert.equal((await ok('GET','/api/sales/transfers',null,sales)).transfers.length,0);
  const review=(role,cookie,body)=>call('POST',`/api/${role}/transfers/${id}/review`,body,cookie),approve={decision:'APPROVE',revision:1};
  assert.equal((await review('warehouse',wh,approve)).status,409);assert.equal((await review('store',other,{...approve,physicalReceipt:true})).status,404);assert.equal((await review('store',dest,approve)).status,400);
  {const {DatabaseSync}=require('node:sqlite');const x=new DatabaseSync(path.join(dir,'baboltoyoor.db'));x.exec("CREATE TRIGGER transfer_fail BEFORE INSERT ON audit WHEN NEW.action='STORE_TRANSFER_RECEIVED' BEGIN SELECT RAISE(ABORT,'rollback'); END");x.close();}
  assert.equal((await review('store',dest,{...approve,physicalReceipt:true})).status,500);
  assert.equal((await ok('GET','/api/store/transfers',null,dest)).transfers[0].status,'PENDING_RECEIPT');
  {const {DatabaseSync}=require('node:sqlite');const x=new DatabaseSync(path.join(dir,'baboltoyoor.db'));x.exec('DROP TRIGGER transfer_fail');x.close();}
  t=(await review('store',dest,{...approve,physicalReceipt:true})).data.transfer;assert.equal(t.status,'PENDING_SALES');
  t=(await review('sales',sales,{decision:'RETURN',reason:'مغایرت',revision:1})).data.transfer;assert.equal(t.status,'RETURNED');
  assert.equal((await call('PUT',`/api/store/transfers/${id}`,input,other)).status,404);
  assert.equal((await call('PUT',`/api/store/transfers/${id}`,{...input,revision:1,items:[{productId:'p01',kg:3,price:1100}]},source)).status,409);
  assert.equal((await ok('GET','/api/store/transfers',null,source)).transfers[0].items[0].description,'توضیح قلم <ویژه>');
  t=(await ok('PUT',`/api/store/transfers/${id}`,{...input,revision:1,items:[{productId:'p01',kg:'3',price:'1100',description:'توضیح اصلاحی'}]},source)).transfer;assert.equal(t.revision,2);assert.equal(t.history.find(x=>x.action==='RECEIVED').revision,1);assert.equal(t.history.find(x=>x.action==='REVISED').before.items[0].kg,2.5);assert.equal(t.items[0].description,'توضیح اصلاحی');assert.equal(t.history.find(x=>x.action==='REVISED').before.items[0].description,'توضیح قلم <ویژه>');
  assert.equal((await review('store',dest,{...approve,physicalReceipt:true})).status,409);
  await review('store',dest,{...approve,revision:2,physicalReceipt:true});await review('sales',sales,{...approve,revision:2});t=(await review('warehouse',wh,{...approve,revision:2})).data.transfer;assert.equal(t.status,'COMPLETED');assert.equal((await review('warehouse',wh,{...approve,revision:2})).status,409);
  const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(path.join(dir,'baboltoyoor.db'),{readOnly:true});assert.equal(db.prepare('SELECT count(*) n FROM orders').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM payments').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM store_transfers').get().n,1);db.close();
  const backup=(await ok('POST','/api/admin/backups',{},admin)).name;
  const backupDir=path.join(dir,'backups'),old='baboltoyor-manual-20261118T123456-abcdef123456.db';fs.copyFileSync(path.join(backupDir,backup),path.join(backupDir,old));
  {const oldDb=new DatabaseSync(path.join(backupDir,old));oldDb.exec('DROP TABLE store_transfers');oldDb.close();}
  const legacy='baboltoyor-manual-20261118T123457-abcdef123456.db';fs.copyFileSync(path.join(backupDir,backup),path.join(backupDir,legacy));
  {const legacyDb=new DatabaseSync(path.join(backupDir,legacy));legacyDb.prepare("UPDATE store_transfers SET payload=json_set(payload,'$.number','T-ABC123-DEF') WHERE id=?").run(id);legacyDb.prepare("DELETE FROM counters WHERE key='storeTransferNumber'").run();legacyDb.close();}
  {const x=new DatabaseSync(path.join(dir,'baboltoyoor.db'));x.exec("CREATE TRIGGER transfer_create_fail BEFORE INSERT ON audit WHEN NEW.action='STORE_TRANSFER_CREATED' BEGIN SELECT RAISE(ABORT,'rollback'); END");x.close();}
  assert.equal((await call('POST','/api/store/transfers',input,source)).status,500);
  {const x=new DatabaseSync(path.join(dir,'baboltoyoor.db'));x.exec('DROP TRIGGER transfer_create_fail');x.close();}
  const second=(await ok('POST','/api/store/transfers',input,source)).transfer;assert.notEqual(second.id,id);assert.equal(second.number,'2');
  const parallel=await Promise.all(Array.from({length:5},()=>ok('POST','/api/store/transfers',input,source)));assert.deepEqual(parallel.map(x=>Number(x.transfer.number)).sort((a,b)=>a-b),[3,4,5,6,7]);
  await ok('POST','/api/admin/backups/'+encodeURIComponent(backup)+'/restore',{confirm:'RESTORE',password:pass},admin);
  let admin2=(await call('POST','/api/login',{username:'admin',password:pass})).cookie;
  const restored=(await ok('GET','/api/sales/transfers',null,admin2)).transfers;assert.equal(restored.length,1);assert.equal(restored[0].items[0].description,'توضیح اصلاحی');assert.equal(restored[0].history.find(h=>h.action==='REVISED').before.items[0].description,'توضیح قلم <ویژه>');
  await ok('POST','/api/admin/backups/'+encodeURIComponent(legacy)+'/restore',{confirm:'RESTORE',password:pass},admin2);
  admin2=(await call('POST','/api/login',{username:'admin',password:pass})).cookie;
  const migrated=(await ok('GET','/api/sales/transfers',null,admin2)).transfers[0];assert.equal(migrated.id,id);assert.equal(migrated.number,'1');assert.equal(migrated.legacyNumber,'T-ABC123-DEF');assert.equal(migrated.history.find(h=>h.action==='REVISED').before.items[0].description,'توضیح قلم <ویژه>');
  {const migratedDb=new DatabaseSync(path.join(dir,'baboltoyoor.db'),{readOnly:true});const saved=JSON.parse(migratedDb.prepare('SELECT payload FROM store_transfers WHERE id=?').get(id).payload);assert.equal(saved.number,'1');assert.equal(saved.legacyNumber,'T-ABC123-DEF');migratedDb.close();}
  const sourceAfterRestore=(await call('POST','/api/login',{username:'shop-a',password:pass})).cookie;const afterLegacy=(await ok('POST','/api/store/transfers',input,sourceAfterRestore)).transfer;assert.equal(afterLegacy.number,'2');
  await ok('POST','/api/admin/backups/'+encodeURIComponent(old)+'/restore',{confirm:'RESTORE',password:pass},admin2);
  admin2=(await call('POST','/api/login',{username:'admin',password:pass})).cookie;
  assert.deepEqual((await ok('GET','/api/sales/transfers',null,admin2)).transfers,[]);

 }finally{if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});}
});
