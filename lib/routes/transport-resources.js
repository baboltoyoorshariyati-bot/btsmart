'use strict';
// A transport-owned catalog, independent of user accounts. This does not alter
// existing dispatches, settlements, driver users or historical snapshots.
const { atomicRoute: route,fail}=require('../http');
const store=require('../store');
const validate=require('../validate');
const READ={roles:['admin','dispatch','sales','warehouse']};
const WRITE={roles:['admin','dispatch']};
const fleet=db=>(db.vehicles||[]).filter(v=>v.kind==='fleet');
const driverView=d=>({id:d.id,fullName:d.fullName||'',phone:d.phone||'',isActive:d.isActive!==false,vehicleId:d.vehicleId||''});
const vehicleView=v=>({id:v.id,vehicleType:v.vehicleType||'',plate:v.plate||'',isActive:v.isActive!==false});
function activeDispatches(db){
 const open=new Set(['PENDING_ASSIGN','ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT','DELIVERED']);
 return (db.orders||[]).flatMap(o=>[...(Array.isArray(o.dispatches)?o.dispatches:[]),o.dispatch].filter(d=>d&&open.has(d.status)));
}
const activePlans=require('../transport-planning').activeAssignments;
function activeFlag(value,old=true){
 if(value===undefined)return old;
 if(typeof value!=='boolean')fail(400,'وضعیت فعال بودن معتبر نیست.');
 return value;
}
route('GET','/api/transport/resources',READ,()=>{
 const db=store.get();
 return {body:{drivers:(db.drivers||[]).map(driverView),vehicles:fleet(db).map(vehicleView)}};
});
route('POST','/api/transport/drivers',{...WRITE,idempotent:true},ctx=>{
 const db=store.get(),body=ctx.body||{};
 const fullName=validate.text(body.fullName,{field:'نام راننده',max:120,required:true});
 const phone=validate.phone(body.phone,{required:true});
 const driver={id:store.uid(),fullName,phone,vehicleType:'',plate:'',posTerminal:'',posBank:'',isActive:true,createdAt:store.nowIso(),updatedAt:store.nowIso()};
 db.drivers.push(driver);store.audit(ctx.user,'TRANSPORT_DRIVER_CREATED','driver',driver.id,{fullName,phone},ctx);store.save();
 return {status:201,body:{driver:driverView(driver)}};
});
route('PUT','/api/transport/drivers/:id',WRITE,ctx=>{
 const db=store.get(),d=db.drivers.find(x=>x.id===ctx.params.id);if(!d)fail(404,'راننده یافت نشد.');
 // Existing driver accounts own their linked profile until the account-based
 // workflow is retired. Do not bypass its account/resource consistency rules.
 if(db.users.some(u=>u.driverId===d.id&&u.isActive))fail(409,'این راننده به حساب فعال قدیمی متصل است؛ تغییر آن باید از مدیریت کاربران انجام شود.');
 const fullName=validate.text(ctx.body.fullName??d.fullName,{field:'نام راننده',max:120,required:true});
 const phone=validate.phone(ctx.body.phone??d.phone,{required:true}),isActive=activeFlag(ctx.body.isActive,d.isActive!==false);
 if(!isActive&&(activeDispatches(db).some(x=>x.driverId===d.id)||activePlans(db).some(x=>x.driverId===d.id)))fail(409,'راننده مأموریت باز دارد؛ ابتدا آن را تعیین تکلیف کنید.');
 const before=driverView(d);Object.assign(d,{fullName,phone,isActive,updatedAt:store.nowIso()});
 store.audit(ctx.user,'TRANSPORT_DRIVER_UPDATED','driver',d.id,{before,after:driverView(d)},ctx);store.save();return {body:{driver:driverView(d)}};
});
route('POST','/api/transport/vehicles',{...WRITE,idempotent:true},ctx=>{
 const db=store.get(),body=ctx.body||{},vehicleType=validate.text(body.vehicleType,{field:'نوع خودرو',max:60,required:true});
 const plate=validate.driverPlate(body.plate,vehicleType);
 if(fleet(db).some(x=>x.plate===plate))fail(409,'این پلاک قبلاً ثبت شده است.');
 const vehicle={id:store.uid(),kind:'fleet',vehicleType,plate,isActive:true,createdAt:store.nowIso()};
 db.vehicles.push(vehicle);store.audit(ctx.user,'TRANSPORT_VEHICLE_CREATED','vehicle',vehicle.id,{vehicleType,plate},ctx);store.save();return {status:201,body:{vehicle:vehicleView(vehicle)}};
});
route('PUT','/api/transport/vehicles/:id',WRITE,ctx=>{
 const db=store.get(),v=fleet(db).find(x=>x.id===ctx.params.id);if(!v)fail(404,'خودرو یافت نشد.');
 const vehicleType=validate.text(ctx.body.vehicleType??v.vehicleType,{field:'نوع خودرو',max:60,required:true});
 const plate=(vehicleType===v.vehicleType&&(ctx.body.plate===undefined||ctx.body.plate===v.plate))?v.plate:validate.driverPlate(ctx.body.plate??v.plate,vehicleType);
 if(fleet(db).some(x=>x.id!==v.id&&x.plate===plate))fail(409,'این پلاک قبلاً ثبت شده است.');
 const isActive=activeFlag(ctx.body.isActive,v.isActive!==false);
 if(!isActive&&(activeDispatches(db).some(x=>x.vehicleId===v.id||(x.driverPlate&&x.driverPlate===v.plate))||activePlans(db).some(x=>x.vehicleId===v.id)||db.drivers.some(d=>d.vehicleId===v.id&&db.users.some(u=>u.driverId===d.id&&u.roleCode==='driver'&&u.isActive))))fail(409,'خودرو به مأموریت یا حساب راننده فعال متصل است.');
 const before=vehicleView(v);Object.assign(v,{vehicleType,plate,isActive,updatedAt:store.nowIso()});
 // Keep the existing account-linked driver display in sync, without touching
 // archived dispatch snapshots.
 for(const d of db.drivers.filter(x=>x.vehicleId===v.id))Object.assign(d,{vehicleType,plate,updatedAt:store.nowIso()});
 store.audit(ctx.user,'TRANSPORT_VEHICLE_UPDATED','vehicle',v.id,{before,after:vehicleView(v)},ctx);store.save();return {body:{vehicle:vehicleView(v)}};
});

// Operational equipment assignments are separate from the per-order transport plan.
// Existing order and handover snapshots are never rewritten.
route('GET','/api/transport/fleet-assignments',WRITE,()=>{
 const db=store.get();
 const vehicles=fleet(db),devices=db.paymentDevices||[];
 return {body:{drivers:(db.drivers||[]).map(d=>({...driverView(d),vehicleId:d.vehicleId||'',paymentDeviceId:d.paymentDeviceId||'',vehicle:vehicles.find(v=>v.id===d.vehicleId)?vehicleView(vehicles.find(v=>v.id===d.vehicleId)):null,device:devices.find(x=>x.id===d.paymentDeviceId)?deviceView(devices.find(x=>x.id===d.paymentDeviceId)):null,legacyVehicle:d.vehicleId?'':(d.vehicleType||''),legacyPlate:d.vehicleId?'':(d.plate||''),legacyTerminal:d.paymentDeviceId?'':(d.posTerminal||''),legacyBank:d.paymentDeviceId?'':(d.posBank||'')})),vehicles:vehicles.filter(v=>v.isActive!==false).map(vehicleView),devices:devices.filter(d=>d.isActive!==false).map(deviceView)}};
});
function deviceView(d){return {id:d.id,title:d.title||'',terminalNumber:d.terminalNumber||'',bank:d.bank||'',model:d.model||'',connection:d.connection||'',isActive:d.isActive!==false};}
route('PUT','/api/transport/drivers/:id/resources',WRITE,ctx=>require('../transport-transaction')(()=>{
 const db=store.get(),d=db.drivers.find(x=>x.id===ctx.params.id);if(!d)fail(404,'راننده یافت نشد.');
 const body=ctx.body||{};
 if(typeof body.vehicleId!=='string'||typeof body.paymentDeviceId!=='string')fail(400,'انتخاب خودرو و دستگاه پوز معتبر نیست.');
 const vehicleId=body.vehicleId.trim(),paymentDeviceId=body.paymentDeviceId.trim();
 const v=vehicleId?fleet(db).find(x=>x.id===vehicleId):null,p=paymentDeviceId?(db.paymentDevices||[]).find(x=>x.id===paymentDeviceId):null;
 if(vehicleId&&(!v||(v.isActive===false&&vehicleId!==d.vehicleId)))fail(400,'خودروی فعال و معتبر انتخاب کنید.');
 if(paymentDeviceId&&(!p||(p.isActive===false&&paymentDeviceId!==d.paymentDeviceId)))fail(400,'دستگاه پوز فعال و معتبر انتخاب کنید.');
 if((!vehicleId||!paymentDeviceId)&&db.users.some(u=>u.driverId===d.id&&u.roleCode==='driver'&&u.isActive))fail(409,'برای حساب فعال راننده، خودرو و پوز هر دو باید انتخاب شوند.');
 const before={vehicleId:d.vehicleId||'',paymentDeviceId:d.paymentDeviceId||'',vehicleType:d.vehicleType||'',plate:d.plate||'',posTerminal:d.posTerminal||'',posBank:d.posBank||''};
 // Empty selections do not erase legacy free-text data that never had a catalog ID.
 const vehicleFields=v?{vehicleType:v.vehicleType,plate:v.plate}:before.vehicleId?{vehicleType:'',plate:''}:{};
 const deviceFields=p?{posTerminal:p.terminalNumber,posBank:p.bank}:before.paymentDeviceId?{posTerminal:'',posBank:''}:{};
 Object.assign(d,{vehicleId:vehicleId||null,paymentDeviceId:paymentDeviceId||null,...vehicleFields,...deviceFields,updatedAt:store.nowIso()});
 store.audit(ctx.user,'TRANSPORT_DRIVER_RESOURCES_ASSIGNED','driver',d.id,{before,after:{vehicleId,paymentDeviceId,vehicleType:d.vehicleType,plate:d.plate,posTerminal:d.posTerminal,posBank:d.posBank}},ctx);store.save();
 return {body:{driver:driverView(d)}};
}));
