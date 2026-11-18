'use strict';
// Independent transport assets and store branches; old backups without the new table remain restorable.
const { atomicRoute: route, fail } = require('../http');
const store = require('../store');
const validate = require('../validate');
const { checkBranchNo } = require('../order-numbers');
const { storeDisplayName, HAMZEH_KOLA_NAME } = require('../store-name');
const ADMIN = { roles:['admin'] };
const branches = db => Array.isArray(db.storeBranches) ? db.storeBranches : [];
const branchView = branch => {const displayName=storeDisplayName(branch.name,branch.branchNo);return {...branch,name:displayName===HAMZEH_KOLA_NAME?displayName:branch.name};};
const fleet = db => (db.vehicles || []).filter(v => v.kind === 'fleet');
function number(v) { try { return checkBranchNo(v); } catch (e) { fail(400,e.message); } }
function assignedDriver(db, id) { return db.drivers.find(d => d.vehicleId === id && db.users.some(u => u.driverId === d.id && u.roleCode === 'driver' && u.isActive)); }
route('GET','/api/admin/transport-vehicles',ADMIN,()=>({body:{vehicles:fleet(store.get())}}));
route('POST','/api/admin/transport-vehicles',{...ADMIN,idempotent:true},ctx=>{
  const db=store.get(), b=ctx.body;
  const vehicleType=validate.text(b.vehicleType,{field:'نوع خودرو',max:60,required:true});
  const plate=validate.driverPlate(b.plate,vehicleType);
  if(fleet(db).some(v=>v.plate===plate)) fail(409,'این پلاک قبلاً در فهرست خودروها ثبت شده است.');
  const vehicle={id:store.uid(),kind:'fleet',vehicleType,plate,isActive:true,createdAt:store.nowIso()};
  db.vehicles.push(vehicle); store.audit(ctx.user,'TRANSPORT_VEHICLE_CREATED','vehicle',vehicle.id,{plate,vehicleType},ctx);store.save();
  return {status:201,body:{vehicle}};
});
route('PUT','/api/admin/transport-vehicles/:id',ADMIN,ctx=>{
  const db=store.get(), v=fleet(db).find(x=>x.id===ctx.params.id);if(!v)fail(404,'خودرو پیدا نشد.');
  const b=ctx.body, vehicleType=validate.text(b.vehicleType??v.vehicleType,{field:'نوع خودرو',max:60,required:true});
  // Keep historical values byte-for-byte when neither type nor plate is changed.
  const plate=(vehicleType===v.vehicleType && (b.plate===undefined || b.plate===v.plate)) ? v.plate : validate.driverPlate(b.plate??v.plate,vehicleType);
  if(fleet(db).some(x=>x.id!==v.id&&x.plate===plate))fail(409,'این پلاک قبلاً ثبت شده است.');
  const isActive=b.isActive===undefined?v.isActive:!!b.isActive;
  if(!isActive&&require('../transport-planning').activeAssignments(db).some(a=>a.vehicleId===v.id))fail(409,'خودرو مأموریت باز دارد؛ ابتدا آن را تعیین تکلیف کنید.');
  if(!isActive&&assignedDriver(db,v.id))fail(409,'خودرو به حساب رانندهٔ فعال متصل است؛ ابتدا تخصیص آن را تغییر دهید.');
  Object.assign(v,{vehicleType,plate,isActive,updatedAt:store.nowIso()});
  for(const d of db.drivers.filter(x=>x.vehicleId===v.id)) Object.assign(d,{vehicleType,plate,updatedAt:store.nowIso()});
  store.audit(ctx.user,'TRANSPORT_VEHICLE_UPDATED','vehicle',v.id,{vehicleType,plate,isActive},ctx);store.save();return {body:{vehicle:v}};
});
route('GET','/api/admin/store-branches',ADMIN,()=>({body:{branches:branches(store.get()).map(branchView)}}));
route('POST','/api/admin/store-branches',{...ADMIN,idempotent:true},ctx=>{
  const db=store.get(),name=validate.text(ctx.body.name,{field:'نام شعبه',max:120,required:true}),branchNo=number(ctx.body.branchNo);
  if(branches(db).some(b=>b.branchNo===branchNo)) fail(409,'این شمارهٔ شعبه قبلاً ثبت شده است.');
  const branch={id:store.uid(),name,branchNo,isActive:true,createdAt:store.nowIso()};
  if(!Array.isArray(db.storeBranches))db.storeBranches=[];
  db.storeBranches.push(branch);store.audit(ctx.user,'STORE_BRANCH_CREATED','store_branch',branch.id,{name,branchNo},ctx);store.save();return {status:201,body:{branch:branchView(branch)}};
});
route('PUT','/api/admin/store-branches/:id',ADMIN,ctx=>{
  const db=store.get(),branch=branches(db).find(b=>b.id===ctx.params.id);if(!branch)fail(404,'شعبه پیدا نشد.');
  const name=validate.text(ctx.body.name??branch.name,{field:'نام شعبه',max:120,required:true}), branchNo=number(ctx.body.branchNo??branch.branchNo);
  if(branches(db).some(b=>b.id!==branch.id&&b.branchNo===branchNo))fail(409,'این شمارهٔ شعبه قبلاً ثبت شده است.');
  const linked=db.users.filter(u=>u.branchId===branch.id&&u.roleCode==='store');
  if(linked.length&&branchNo!==branch.branchNo)fail(409,'شمارهٔ شعبهٔ متصل به حساب قابل تغییر نیست؛ شعبهٔ جدید بسازید.');
  const isActive=ctx.body.isActive===undefined?branch.isActive:!!ctx.body.isActive;
  if(!isActive&&linked.some(u=>u.isActive))fail(409,'شعبه به حساب فعال متصل است؛ ابتدا تخصیص حساب را تغییر دهید.');
  Object.assign(branch,{name,branchNo,isActive,updatedAt:store.nowIso()});
  for(const user of linked) user.storeName=name;
  store.audit(ctx.user,'STORE_BRANCH_UPDATED','store_branch',branch.id,{name,branchNo,isActive},ctx);store.save();return {body:{branch:branchView(branch)}};
});
module.exports={branches,fleet};
