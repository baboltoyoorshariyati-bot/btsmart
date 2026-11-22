'use strict';
// Experimental consolidated-service lifecycle. Pure transitions only: no HTTP
// routes, notifications, real resource authorisation or legacy status writes.
// The caller must load authoritative resources and run each transition under the
// shared SQLite write lock; this module is not an activation switch.
const crypto=require('node:crypto');
const S=require('./store-stock-service');
const {isDeepStrictEqual}=require('node:util');

function key(value,label){
 if(typeof value!=='string'||!value.trim()||value.length>160)throw new Error(`${label} معتبر نیست.`);
 return value.trim();
}
function guard(service,revision){
 if(!service||!Number.isSafeInteger(revision)||service.revision!==revision)throw new Error('سرویس تغییر کرده است؛ اطلاعات را دوباره بارگذاری کنید.');
}
function event(at,by){return {at:key(at,'زمان'),by:key(by,'ثبت‌کننده')};}
function assign(service,{driver,vehicle,expectedRevision,at,by}){
 guard(service,expectedRevision);
 if(service.status!=='OPEN')throw new Error('پس از تحویل، تغییر راننده مجاز نیست.');
 if(!service.sources.length)throw new Error('سرویس بدون درخواست قابل تخصیص نیست.');
 const stamp=event(at,by);
 if(!driver||driver.isActive===false||!vehicle||vehicle.kind!=='fleet'||vehicle.isActive===false||driver.vehicleId!==vehicle.id)throw new Error('راننده و خودروی فعال و مرتبط لازم است.');
 const assignment={driverId:key(driver.id,'راننده'),driverName:key(driver.fullName,'نام راننده'),driverPhone:String(driver.phone||''),vehicleId:key(vehicle.id,'خودرو'),vehicleType:String(vehicle.vehicleType||''),vehiclePlate:key(vehicle.plate,'پلاک'),assignedAt:stamp.at,assignedBy:stamp.by};
 const next=structuredClone(service),old=next.transport?.assignment;
 if(old&&old.driverId===assignment.driverId&&old.vehicleId===assignment.vehicleId&&isDeepStrictEqual({...old,assignedAt:assignment.assignedAt,assignedBy:assignment.assignedBy},assignment))return next;
 const history=next.transport?.assignmentHistory||[];
 next.transport={stage:'ASSIGNED',assignment,assignmentHistory:old?[...history,{...old,replacedAt:stamp.at,replacedBy:stamp.by}]:history};
 next.revision++;
 return next;
}
function assignmentMatchesResources(assignment,driver,vehicle){
 return !!assignment&&!!driver&&driver.isActive!==false&&!!vehicle&&vehicle.kind==='fleet'&&vehicle.isActive!==false&&driver.id===assignment.driverId&&driver.vehicleId===vehicle.id&&vehicle.id===assignment.vehicleId&&String(driver.fullName||'').trim()===assignment.driverName&&String(driver.phone||'')===assignment.driverPhone&&String(vehicle.vehicleType||'')===assignment.vehicleType&&String(vehicle.plate||'').trim()===assignment.vehiclePlate;
}
function handoverToken(service){
 if(!service||service.status!=='OPEN'||service.transport?.stage!=='ASSIGNED'||!service.transport.assignment)throw new Error('ابتدا راننده و خودرو تعیین شوند.');
 return crypto.createHash('sha256').update(JSON.stringify({id:service.id,branchNo:service.branchNo,revision:service.revision,assignment:service.transport.assignment,orderNos:service.orders.map(o=>o.orderNo),lines:S.serviceLines(service)})).digest('hex');
}
function handover(service,{expectedRevision,at,by,documentNo,handoverToken:token,physicalHandoverConfirmed}){
 guard(service,expectedRevision);
 if(physicalHandoverConfirmed!==true)throw new Error('تحویل فیزیکی به راننده باید تأیید شود.');
 if(typeof token!=='string'||token!==handoverToken(service))throw new Error('پیش‌نمایش سند تغییر کرده است؛ دوباره بررسی کنید.');
 const result=S.handover(service,{expectedRevision,at,by,documentNo,assignment:service.transport.assignment});
 result.transport.stage='HANDED_OVER';
 return result;
}
function after(service,expectedRevision,stage,confirmed,field,at,by){
 guard(service,expectedRevision);
 if(service.status!=='HANDED_OVER'||service.transport?.stage!==stage||!service.handover?.document?.documentNo)throw new Error('سرویس در مرحلهٔ مجاز برای این عملیات نیست.');
 if(confirmed!==true)throw new Error('تأیید صریح عملیات الزامی است.');
 const next=structuredClone(service);next.transport[field]=event(at,by);next.revision++;return next;
}
function review(service,{expectedRevision,at,by,reviewConfirmed}){
 const next=after(service,expectedRevision,'HANDED_OVER',reviewConfirmed,'review',at,by);
 Object.assign(next.transport.review,{documentNo:next.handover.document.documentNo,driverId:next.handover.assignment.driverId});next.transport.stage='REVIEWED';return next;
}
function depart(service,{expectedRevision,at,by,departureConfirmed}){
 const next=after(service,expectedRevision,'REVIEWED',departureConfirmed,'departure',at,by);next.transport.stage='IN_TRANSIT';return next;
}
function receipt(service,{expectedRevision,at,by,receiptConfirmed,branchNo,storeId}){
 // Existing access rules are owner-based, not branch-wide. Until a branch
 // delegation model exists, one account must own every member: accepting any
 // one owner here would let them confirm another owner's orders.
 if(Number(branchNo)!==service?.branchNo||typeof storeId!=='string'||!storeId||!service?.orders?.length||!service.orders.every(o=>o.storeId===storeId))throw new Error('فروشگاه مجاز به تأیید دریافت همهٔ درخواست‌های این سرویس نیست.');
 const next=after(service,expectedRevision,'IN_TRANSIT',receiptConfirmed,'receipt',at,by);
 Object.assign(next.transport.receipt,{branchNo:service.branchNo,storeId});next.transport.stage='RECEIPT_CONFIRMED';return next;
}
function returnDocuments(service,{expectedRevision,at,by,documentsReturned}){
 const next=after(service,expectedRevision,'RECEIPT_CONFIRMED',documentsReturned,'documentsReturn',at,by);next.transport.stage='CLOSED';return next;
}
// Snapshot checking for the optional experimental lifecycle in backups. It
// validates stage/event consistency, but does not replace live authorisation.
function validate(service){
 const t=service.transport;if(t==null)return;
 const stages=['ASSIGNED','HANDED_OVER','REVIEWED','IN_TRANSIT','RECEIPT_CONFIRMED','CLOSED'];
 const i=stages.indexOf(t.stage),a=t.assignment;
 const validKey=v=>typeof v==='string'&&!!v.trim()&&v.length<=160;
 const validAssignment=x=>x&&['driverId','driverName','vehicleId','vehiclePlate','assignedAt','assignedBy'].every(k=>validKey(x[k]));
 if(i<0||!validAssignment(a)||!Array.isArray(t.assignmentHistory)||t.assignmentHistory.some(x=>!validAssignment(x)||!validKey(x.replacedAt)||!validKey(x.replacedBy)))throw new Error('گردش ترابری سرویس تجمیعی پشتیبان ناسازگار است.');
 if((i===0&&service.status!=='OPEN')||(i>0&&(service.status!=='HANDED_OVER'||!isDeepStrictEqual(service.handover?.assignment,a))))throw new Error('تخصیص سرویس تجمیعی پشتیبان ناسازگار است.');
 const fields=[['review',2],['departure',3],['receipt',4],['documentsReturn',5]];
 for(const [name,requiredAt] of fields){const value=t[name];if((i>=requiredAt)!==!!value || (value&&(!validKey(value.at)||!validKey(value.by))))throw new Error('مراحل ترابری سرویس تجمیعی پشتیبان ناسازگار است.');}
 if(t.review&&(t.review.documentNo!==service.handover.document.documentNo||t.review.driverId!==a.driverId))throw new Error('بررسی سند سرویس تجمیعی پشتیبان ناسازگار است.');
 if(t.receipt&&(t.receipt.branchNo!==service.branchNo||!service.orders.length||!service.orders.every(o=>o.storeId===t.receipt.storeId)))throw new Error('دریافت سرویس تجمیعی پشتیبان ناسازگار است.');
}
module.exports={assign,assignmentMatchesResources,handoverToken,handover,review,depart,receipt,returnDocuments,validate};
