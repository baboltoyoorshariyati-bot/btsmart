'use strict';
// Independent inter-branch documents: never mutate inventory, orders or payments.
const {atomicRoute:route,fail}=require('../http');
const store=require('../store'),v=require('../validate');
const {createNotification}=require('../domain');
const {storeDisplayName}=require('../store-name');
const arr=()=>store.get().storeTransfers;
function branchFor(user,db=store.get()){
 if(user?.roleCode!=='store')return null;
 if(user.branchId)return (db.storeBranches||[]).find(b=>b.id===user.branchId)||null;
 // Older accounts can be mapped only by an unambiguous, explicitly recorded branch number.
 if(user.branchNo==null||user.branchNo==='')return null;
 const matches=(db.storeBranches||[]).filter(b=>String(b.branchNo)===String(user.branchNo));
 return matches.length===1?matches[0]:null;
}
const name=b=>storeDisplayName(b.name,b.branchNo);
function usersOf(branch,db=store.get()){return db.users.filter(u=>u.isActive&&u.roleCode==='store'&&branchFor(u,db)?.id===branch.id);}
function currentBranch(user){const b=branchFor(user);if(!b||!b.isActive)fail(409,'حساب شما به شعبه فعال و مشخص متصل نیست؛ با مدیر سامانه تماس بگیرید.');return b;}
function notifyBranch(branchId,type,t,message){
 const db=store.get(),b=(db.storeBranches||[]).find(x=>x.id===branchId);
 if(b)for(const u of usersOf(b,db))createNotification('store',type,'store_transfer',t.id,message,{targetUserId:u.id});
}
function get(id){const x=arr().find(t=>t.id===id);if(!x)fail(404,'حواله جابجایی یافت نشد.');return x;}
function actor(user){return {userId:user.id,name:user.fullName||user.username||'کاربر',at:store.nowIso()};}
function history(t,action,user,extra={}){t.history=[...(t.history||[]),{action,...actor(user),revision:t.revision,...extra}];}
function audit(ctx,t,action,extra={}){store.audit(ctx.user,action,'store_transfer',t.id,{number:t.number,revision:t.revision,...extra},ctx);}
function date(value){const x=v.digitsToAscii(String(value||''));if(!/^\d{4}-\d{2}-\d{2}$/.test(x)||!v.localDateTime(x+'T12:00'))fail(400,'تاریخ ارسال معتبر نیست.');return x;}
function lines(input){
 v.items(input);let sum=0;
 return input.map(x=>{
  const product=store.get().products.find(p=>p.id===String(x?.productId||'')&&p.isActive);if(!product)fail(400,'محصول انتخاب‌شده معتبر یا فعال نیست.');
  if(x.unit!==undefined&&x.unit!=='کیلوگرم')fail(400,'واحد جابجایی فقط کیلوگرم است.');
  const kg=v.number(x.kg,{field:'مقدار کیلوگرم',min:0.001,max:v.MAX_QTY});
  if(Math.abs(kg*1000-Math.round(kg*1000))>1e-7)fail(400,'مقدار حداکثر سه رقم اعشار دارد.');
  const price=v.number(x.price,{field:'فی دستی به ریال',min:0,max:v.MAX_MONEY});if(!Number.isSafeInteger(price))fail(400,'فی باید عدد صحیح به ریال باشد.');
  if(kg*price>v.MAX_MONEY)fail(400,'مبلغ قلم بیش از حد مجاز است.');
  const amount=Math.floor((Math.round(kg*1000)*price+500)/1000);if(!Number.isSafeInteger(amount)||amount>v.MAX_MONEY)fail(400,'مبلغ قلم بیش از حد مجاز است.');sum+=amount;if(sum>v.MAX_MONEY)fail(400,'جمع حواله بیش از حد مجاز است.');
  return {productId:product.id,productName:product.name,kg,unit:'کیلوگرم',price,amount};
 });
}
function payload(b){return {sendDate:date(b.sendDate),items:lines(b.items),notes:v.text(b.notes,{field:'توضیحات',max:1000})};}
function visible(t,role,user){
 if(role==='store'){const b=currentBranch(user);return t.sourceBranchId===b.id||t.destinationBranchId===b.id;}
 if(role==='sales')return (t.history||[]).some(h=>h.action==='RECEIVED');
 return (t.history||[]).some(h=>h.action==='SALES_APPROVED');
}
for(const role of ['store','sales','warehouse'])route('GET',`/api/${role}/transfers`,{roles:[role]},ctx=>{
 if(role==='store'&&ctx.user.roleCode==='admin')return {body:{transfers:arr().slice().reverse()}};
 return {body:{transfers:arr().filter(t=>visible(t,role,ctx.user)).slice().reverse()}};
});
route('GET','/api/store/transfer-branches',{roles:['store']},ctx=>{
 const db=store.get();let source=null;
 if(ctx.user.roleCode!=='admin')source=currentBranch(ctx.user);
 return {body:{source:source?{id:source.id,name:name(source)}:null,branches:(db.storeBranches||[]).filter(b=>b.isActive&&usersOf(b,db).length).map(b=>({id:b.id,name:name(b),branchNo:b.branchNo}))}};
});
route('POST','/api/store/transfers',{roles:['store'],idempotent:true},ctx=>{
 const db=store.get(),source=ctx.user.roleCode==='admin'?(db.storeBranches||[]).find(b=>b.id===ctx.body.sourceBranchId&&b.isActive):currentBranch(ctx.user);
 if(!source||!usersOf(source,db).length)fail(400,'فروشگاه فرستنده معتبر و دارای حساب فعال را انتخاب کنید.');
 const dest=(db.storeBranches||[]).find(b=>b.id===ctx.body.destinationBranchId&&b.isActive);
 if(!dest||dest.id===source.id||!usersOf(dest,db).length)fail(400,'فروشگاه مقصد فعال و متفاوت از مبدأ را انتخاب کنید.');
 const p=payload(ctx.body),now=store.nowIso();let id,number;do{id=store.uid();number='T-'+id.slice(0,8).toUpperCase()+'-'+id.slice(9,13).toUpperCase();}while(db.storeTransfers.some(x=>x.number===number));
 const t={id,number,sourceBranchId:source.id,sourceName:name(source),destinationBranchId:dest.id,destinationName:name(dest),...p,status:'PENDING_RECEIPT',revision:1,createdAt:now,updatedAt:now,createdBy:ctx.user.id,history:[]};
 history(t,'CREATED',ctx.user,{snapshot:p});db.storeTransfers.push(t);audit(ctx,t,'STORE_TRANSFER_CREATED',{source:t.sourceName,destination:t.destinationName,items:t.items});notifyBranch(dest.id,'STORE_TRANSFER_RECEIPT',t,`حواله ${number} از ${t.sourceName} در انتظار بررسی دریافت فیزیکی است.`);store.save();return {status:201,body:{transfer:t}};
});
route('PUT','/api/store/transfers/:id',{roles:['store'],idempotent:true},ctx=>{
 const t=get(ctx.params.id),branch=ctx.user.roleCode==='admin'?null:currentBranch(ctx.user);
 if(branch&&branch.id!==t.sourceBranchId)fail(404,'حواله یافت نشد.');
 if(t.status!=='RETURNED')fail(409,'فقط حواله بازگشتی قابل اصلاح است.');
 if(Number(ctx.body.revision)!==t.revision)fail(409,'نسخه حواله تغییر کرده؛ ابتدا جزئیات را دوباره بررسی کنید.');
 const p=payload(ctx.body),before={sendDate:t.sendDate,items:t.items,notes:t.notes};
 t.revision+=1;Object.assign(t,p,{status:'PENDING_RECEIPT',updatedAt:store.nowIso()});history(t,'REVISED',ctx.user,{before,after:p});audit(ctx,t,'STORE_TRANSFER_REVISED',{before,after:p});notifyBranch(t.destinationBranchId,'STORE_TRANSFER_RECEIPT',t,`حواله اصلاح‌شده ${t.number} برای بررسی دریافت فیزیکی ارسال شد.`);store.save();return {body:{transfer:t}};
});
for(const [role,expected,approve,next,approvedEvent] of [['store','PENDING_RECEIPT','RECEIVED','PENDING_SALES','STORE_TRANSFER_RECEIVED'],['sales','PENDING_SALES','SALES_APPROVED','PENDING_WAREHOUSE','STORE_TRANSFER_SALES_APPROVED'],['warehouse','PENDING_WAREHOUSE','WAREHOUSE_APPROVED','COMPLETED','STORE_TRANSFER_WAREHOUSE_APPROVED']]){
 route('POST',`/api/${role}/transfers/:id/review`,{roles:[role],idempotent:true},ctx=>{
  const t=get(ctx.params.id);
  if(role==='store'&&ctx.user.roleCode!=='admin'&&currentBranch(ctx.user).id!==t.destinationBranchId)fail(404,'حواله یافت نشد.');
  if(t.status!==expected)fail(409,'حواله دیگر در این مرحله نیست.');
  if(Number(ctx.body.revision)!==t.revision)fail(409,'نسخه حواله تغییر کرده؛ جزئیات جدید را بررسی کنید.');
  if(!['APPROVE','RETURN'].includes(ctx.body.decision))fail(400,'نتیجه بررسی معتبر نیست.');
  const reason=ctx.body.decision==='RETURN'?v.text(ctx.body.reason,{field:'دلیل بازگشت',max:500,required:true}):'';
  if(ctx.body.decision==='APPROVE'&&role==='store'&&ctx.body.physicalReceipt!==true)fail(400,'تأیید دریافت فیزیکی الزامی است.');
  const event=ctx.body.decision==='APPROVE'?approve:'RETURNED';
  t.status=ctx.body.decision==='APPROVE'?next:'RETURNED';t.updatedAt=store.nowIso();history(t,event,ctx.user,reason?{reason,fromRole:role}:{fromRole:role});audit(ctx,t,ctx.body.decision==='APPROVE'?approvedEvent:'STORE_TRANSFER_RETURNED',{reason,fromRole:role});
  if(t.status==='RETURNED')notifyBranch(t.sourceBranchId,'STORE_TRANSFER_RETURNED',t,`حواله ${t.number} برای اصلاح برگشت خورد: ${reason}`);
  else if(t.status==='PENDING_SALES')createNotification('sales','STORE_TRANSFER_RECEIVED','store_transfer',t.id,`دریافت فیزیکی حواله ${t.number} تأیید شد؛ بررسی فروش لازم است.`);
  else if(t.status==='PENDING_WAREHOUSE')createNotification('warehouse','STORE_TRANSFER_SALES_APPROVED','store_transfer',t.id,`حواله ${t.number} در انتظار تأیید انبار است.`);
  else {notifyBranch(t.sourceBranchId,'STORE_TRANSFER_COMPLETED',t,`حواله ${t.number} توسط انبار تأیید شد.`);notifyBranch(t.destinationBranchId,'STORE_TRANSFER_COMPLETED',t,`حواله ${t.number} توسط انبار تأیید شد.`);createNotification('sales','STORE_TRANSFER_COMPLETED','store_transfer',t.id,`حواله ${t.number} تأیید انبار شد و قابل چاپ است.`);}
  store.save();return {body:{transfer:t}};
 });
}
