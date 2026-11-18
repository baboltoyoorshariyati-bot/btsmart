'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-resources-'));
const password='Ab1!'+crypto.randomBytes(8).toString('hex'), initial='Cd2!'+crypto.randomBytes(8).toString('hex');
const base='http://127.0.0.1:5489';let proc,admin,driver,branch,vehicle,device,oldBackup,legacyCookie;
async function start(){proc=spawn(process.execPath,[path.join(__dirname,'../server.js')],{env:{...process.env,PORT:'5489',HOST:'127.0.0.1',DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:initial},stdio:['ignore','pipe','pipe']});await new Promise((ok,fail)=>{const t=setTimeout(()=>fail(new Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);ok()}});proc.stderr.on('data',d=>process.stderr.write(d));proc.once('exit',c=>{clearTimeout(t);fail(new Error('exit '+c))});});}
async function stop(){if(proc&&!proc.killed){const p=proc;p.kill('SIGTERM');await new Promise(r=>p.once('exit',r));}}
before(start);after(async()=>{await stop();fs.rmSync(dir,{recursive:true,force:true})});
async function call(method,p,body,cookie=admin){const res=await fetch(base+p,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,json:await res.json(),cookie:(res.headers.get('set-cookie')||'').split(';')[0]};}
async function login(user,pass){return (await call('POST','/api/login',{username:user,password:pass},null)).cookie}
const mk=(username,roleCode,extra={})=>call('POST','/api/admin/users',{username,roleCode,fullName:'تست',position:'تست',password,mustChangePassword:false,...extra});
test('create legacy data and an old-format backup',async()=>{
  const boot=await login('admin',initial);assert.equal((await call('POST','/api/account/password',{currentPassword:initial,newPassword:password},boot)).status,200);admin=boot;
  const legacy=await mk('legacy-shop','store',{storeName:'قدیمی',branchNo:7});assert.equal(legacy.status,201,JSON.stringify(legacy.json));
  const backup=await call('POST','/api/admin/backups',{});assert.equal(backup.status,201);oldBackup=backup.json.name;
  const db=new DatabaseSync(path.join(dir,'backups',oldBackup));db.exec('DROP TABLE store_branches');db.close();
});
test('independent catalogs, selections, permissions and no orphan records on error',async()=>{
  let r=await call('POST','/api/admin/transport-vehicles',{vehicleType:'وانت',plate:'12ب34567'});assert.equal(r.status,201,JSON.stringify(r.json));vehicle=r.json.vehicle;
  r=await call('POST','/api/admin/payment-devices',{title:'دستگاه ۱',terminalNumber:'1234',bank:'ملت',model:'X',connection:'wired'});assert.equal(r.status,201,JSON.stringify(r.json));device=r.json.device;
  r=await call('POST','/api/admin/store-branches',{name:'شعبه مرکزی',branchNo:7});assert.equal(r.status,201,JSON.stringify(r.json));branch=r.json.branch;
  const hamzeh=await call('POST','/api/admin/store-branches',{name:'فروشگاه شعبه 1 بابل طیور حمزه کلا',branchNo:1});assert.equal(hamzeh.status,201,JSON.stringify(hamzeh.json));assert.equal(hamzeh.json.branch.name,'فروشگاه شعبه 1 حمزه کلا');
  assert.equal((await call('GET','/api/admin/store-branches')).json.branches.find(x=>x.branchNo===1).name,'فروشگاه شعبه 1 حمزه کلا');
  assert.equal((await call('GET','/api/store/scope')).json.branches.find(x=>x.branchNo===1).storeName,'فروشگاه شعبه 1 حمزه کلا');
  assert.equal((await call('POST','/api/admin/store-branches',{name:'دیگر',branchNo:7})).status,409);
  assert.equal((await call('POST','/api/admin/transport-vehicles',{vehicleType:'وانت',plate:'12ب34567'})).status,409);
  assert.equal((await mk('invalid','driver',{drvPhone:'09121234567',vehicleId:vehicle.id,paymentDeviceId:'invalid'})).status,400);
  assert.equal((await call('GET','/api/drivers')).json.drivers.length,0);
  r=await mk('driver-new','driver',{drvPhone:'09121234567',vehicleId:vehicle.id,paymentDeviceId:device.id});assert.equal(r.status,201,JSON.stringify(r.json));driver=r.json.user;
  let d=(await call('GET','/api/drivers')).json.drivers[0];assert.equal(d.id,driver.driverId);assert.equal(d.vehicleId,vehicle.id);assert.equal(d.paymentDeviceId,device.id);assert.equal(d.posTerminal,'1234');
  r=await mk('store-new','store',{branchId:branch.id,storeName:'رد شود',branchNo:1});assert.equal(r.status,201,JSON.stringify(r.json));assert.equal(r.json.user.branchNo,7);assert.equal(r.json.user.storeName,'فروشگاه شعبه 7 مرکزی');assert.equal(r.json.user.storeNameRaw,branch.name);assert.equal(r.json.user.branchId,branch.id);
  assert.equal((await mk('invalid-shop','store',{branchId:'invalid'})).status,400);
  assert.equal((await call('PUT','/api/admin/store-branches/'+branch.id,{branchNo:8})).status,409);
  assert.equal((await call('PUT','/api/admin/store-branches/'+branch.id,{isActive:false})).status,409);
  assert.equal((await call('PUT','/api/admin/transport-vehicles/'+vehicle.id,{isActive:false})).status,409);
  assert.equal((await call('PUT','/api/admin/payment-devices/'+device.id,{isActive:false})).status,409);
  assert.equal((await call('PUT','/api/drivers/'+driver.driverId,{plate:'11ب11111'})).status,409);
  assert.equal((await call('PUT','/api/transport/drivers/'+driver.driverId,{fullName:'تغییر مغایر'})).status,409, 'حساب رانندهٔ قدیمی از مسیر ترابری ناسازگار نمی‌شود');
  assert.equal((await call('DELETE','/api/drivers/'+driver.driverId,{})).status,409);
  const dc=await login('driver-new',password);assert.equal((await call('POST','/api/admin/store-branches',{name:'x',branchNo:8},dc)).status,403);
});
test('legacy orders and account isolation remain intact when selecting the same branch',async()=>{
  const users=(await call('GET','/api/admin/users')).json.users;const legacy=users.find(u=>u.username==='legacy-shop');
  legacyCookie=await login('legacy-shop',password);const newCookie=await login('store-new',password);
  const body={name:'مشتری',phone:'09120000000',items:[{productId:'p01',requestedQty:1,requestedUnit:'کیلوگرم'}]};
  const first=await call('POST','/api/store/orders',body,legacyCookie);assert.equal(first.status,201,JSON.stringify(first.json));assert.match(first.json.order.orderNo,/^B47/);
  const second=await call('POST','/api/store/orders',body,newCookie);assert.equal(second.status,201,JSON.stringify(second.json));assert.notEqual(second.json.order.orderNo,first.json.order.orderNo);
  assert.equal((await call('PUT','/api/admin/users/'+legacy.id,{branchId:branch.id})).status,200);
  const legacyOrders=(await call('GET','/api/store/orders',null,legacyCookie)).json.orders;const newOrders=(await call('GET','/api/store/orders',null,newCookie)).json.orders;
  assert.deepEqual(legacyOrders.map(x=>x.id),[first.json.order.id]);assert.deepEqual(newOrders.map(x=>x.id),[second.json.order.id]);
  assert.equal(legacyOrders[0].storeName,'فروشگاه شعبه 7 قدیمی');
  const other=await call('POST','/api/admin/store-branches',{name:'شعبه ۸',branchNo:8});assert.equal(other.status,201);
  assert.equal((await call('PUT','/api/admin/users/'+legacy.id,{branchId:other.json.branch.id})).status,409);
  assert.equal((await call('GET','/api/admin/users')).json.users.find(u=>u.id===legacy.id).branchNo,7);
  assert.equal((await call('PUT','/api/admin/users/'+legacy.id,{branchId:other.json.branch.id,confirmBranchChange:true})).status,200);
  const third=await call('POST','/api/store/orders',body,legacyCookie);assert.equal(third.status,201);assert.match(third.json.order.orderNo,/^B48/);
  assert.equal((await call('PUT','/api/admin/users/'+legacy.id,{branchId:branch.id,confirmBranchChange:true})).status,200);
  const again=(await call('GET','/api/store/orders',null,legacyCookie)).json.orders;
  assert.equal(again.find(x=>x.id===first.json.order.id).orderNo,first.json.order.orderNo);
});
test('updates synchronize current driver while validation failures do not mutate SQLite',async()=>{
  assert.equal((await call('PUT','/api/admin/transport-vehicles/'+vehicle.id,{vehicleType:'کامیونت',plate:'22ج45678'})).status,200);
  assert.equal((await call('PUT','/api/admin/payment-devices/'+device.id,{bank:'ملی'})).status,200);
  const before=(await call('GET','/api/drivers')).json.drivers[0];assert.equal(before.vehicleType,'کامیونت');assert.equal(before.posBank,'ملی');
  const bad=await call('PUT','/api/admin/users/'+driver.id,{driverId:driver.driverId,drvPhone:'09120000003',vehicleId:vehicle.id,paymentDeviceId:device.id,fullName:'نباید تغییر کند',password:'x'});assert.equal(bad.status,400);
  const after=(await call('GET','/api/drivers')).json.drivers[0];assert.deepEqual(after,before);
  const user=(await call('GET','/api/admin/users')).json.users.find(u=>u.id===driver.id);assert.equal(user.fullName,'تست');
  assert.equal((await call('PUT','/api/admin/store-branches/'+branch.id,{name:'مرکزی تازه'})).status,200);
  const users=(await call('GET','/api/admin/users')).json.users;assert.equal(users.find(u=>u.username==='store-new').storeName,'فروشگاه شعبه 7 مرکزی تازه');assert.equal(users.find(u=>u.username==='legacy-shop').storeName,'فروشگاه شعبه 7 مرکزی تازه');
  const oldOrders=(await call('GET','/api/store/orders',null,legacyCookie)).json.orders;assert.ok(oldOrders.some(o=>o.storeName==='فروشگاه شعبه 7 قدیمی' && o.orderNo.startsWith('B47')));
});
test('catalog survives restart and pre-update backup restores safely',async()=>{
  await stop();await start();admin=await login('admin',password);
  assert.equal((await call('GET','/api/admin/store-branches')).json.branches[0].name,'مرکزی تازه');
  assert.equal((await call('GET','/api/admin/transport-vehicles')).json.vehicles[0].id,vehicle.id);
  const r=await call('POST','/api/admin/backups/'+oldBackup+'/restore',{confirm:'RESTORE',password});assert.equal(r.status,200,JSON.stringify(r.json));
  admin=await login('admin',password);assert.deepEqual((await call('GET','/api/admin/store-branches')).json.branches,[]);
  const users=(await call('GET','/api/admin/users')).json.users;assert.equal(users.find(u=>u.username==='legacy-shop').branchNo,7);assert.equal(users.some(u=>u.username==='store-new'),false);
});
test('ویرایش خودروی قدیمی بدون دستکاری پلاک ناشناخته و اصلاح آگاهانه',async()=>{
  let r=await call('POST','/api/admin/transport-vehicles',{vehicleType:'وانت',plate:'31ن654-21'});assert.equal(r.status,201,JSON.stringify(r.json));
  const id=r.json.vehicle.id, db=new DatabaseSync(path.join(dir,'baboltoyoor.db'));
  const payload=JSON.parse(db.prepare('SELECT payload FROM vehicles WHERE id=?').get(id).payload);
  payload.plate='پلاک قدیمی';db.prepare('UPDATE vehicles SET plate=?, payload=? WHERE id=?').run(payload.plate,JSON.stringify(payload),id);db.close();
  r=await call('PUT','/api/admin/transport-vehicles/'+id,{vehicleType:'وانت',plate:'پلاک قدیمی',isActive:true});
  assert.equal(r.status,200,JSON.stringify(r.json));assert.equal(r.json.vehicle.plate,'پلاک قدیمی');
  r=await call('PUT','/api/admin/transport-vehicles/'+id,{vehicleType:'کامیون',plate:'پلاک قدیمی'});assert.equal(r.status,400);
  r=await call('PUT','/api/admin/transport-vehicles/'+id,{vehicleType:'وانت',plate:'11ج222-33'});assert.equal(r.status,200);assert.equal(r.json.vehicle.plate,'11ج222-33');
});
