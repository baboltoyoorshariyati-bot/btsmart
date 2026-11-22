'use strict';
const {atomicRoute:route,fail}=require('../http');
const store=require('../store'),validate=require('../validate');
const {today}=require('../domain');
const {effectivePrices}=require('../product-prices');
const {createHash}=require('node:crypto');
const ROLES={roles:['sales','admin']};
const groups=db=>Array.isArray(db.meta.priceGroups)?db.meta.priceGroups:[];
const norm=s=>String(s).normalize('NFKC').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/\s+/g,' ').trim().toLocaleLowerCase('fa');
function checkedName(db,value,except){
 if(typeof value!=='string')fail(400,'نام گروه معتبر نیست.');
 const name=validate.text(value,{field:'نام گروه',max:80,required:true}).normalize('NFKC').replace(/\s+/g,' ');
 if(norm(name)===norm('بدون گروه')||groups(db).some(g=>g.id!==except&&norm(g.name)===norm(name)))fail(409,'نام گروه تکراری یا رزروشده است.');
 return name;
}
function checkedGroup(db,id){
 if(id===null||id==='')return null;
 if(typeof id!=='string'||!groups(db).some(g=>g.id===id))fail(400,'گروه محصول معتبر نیست.');
 return id;
}
route('GET','/api/admin/price-groups',ROLES,()=>({body:{groups:groups(store.get())}}));
route('POST','/api/admin/price-groups',{...ROLES,idempotent:true},ctx=>{
 const db=store.get(),name=checkedName(db,ctx.body.name);
 if(groups(db).length>=100)fail(400,'حداکثر ۱۰۰ گروه مجاز است.');
 const group={id:store.uid(),name,createdAt:store.nowIso(),createdBy:ctx.user.id};db.meta.priceGroups=[...groups(db),group];
 store.audit(ctx.user,'PRICE_GROUP_CREATED','price_group',group.id,{name},ctx);store.save();return {status:201,body:{group}};
});
route('PUT','/api/admin/price-groups/:id',ROLES,ctx=>{
 const db=store.get(),group=groups(db).find(g=>g.id===ctx.params.id);if(!group)fail(404,'گروه یافت نشد.');
 const name=checkedName(db,ctx.body.name,group.id);db.meta.priceGroups=groups(db).map(g=>g.id===group.id?{...g,name}:g);
 store.audit(ctx.user,'PRICE_GROUP_RENAMED','price_group',group.id,{before:group.name,after:name},ctx);store.save();return {body:{ok:true}};
});
route('DELETE','/api/admin/price-groups/:id',ROLES,ctx=>{
 const db=store.get(),group=groups(db).find(g=>g.id===ctx.params.id);if(!group)fail(404,'گروه یافت نشد.');
 if(db.products.some(p=>p.priceGroupId===group.id))fail(409,'ابتدا محصولات این گروه را به گروه دیگری یا بدون گروه منتقل کنید.');
 db.meta.priceGroups=groups(db).filter(g=>g.id!==group.id);store.audit(ctx.user,'PRICE_GROUP_DELETED','price_group',group.id,{name:group.name},ctx);store.save();return {body:{ok:true}};
});
function plan(db,id,body){
 const group=groups(db).find(g=>g.id===id);if(!group)fail(404,'گروه یافت نشد.');
 if(!['increase','decrease'].includes(body.direction)||!['percent','fixed'].includes(body.mode))fail(400,'نوع افزایش یا کاهش را انتخاب کنید.');
 const amount=validate.number(body.amount,{field:'مقدار تغییر',min:0.01,max:body.mode==='percent'?1000:validate.MAX_MONEY});
 if(body.mode==='fixed'&&!Number.isSafeInteger(amount))fail(400,'مقدار ریالی باید عدد صحیح باشد.');
 if(body.mode==='percent'&&Math.abs(amount*100-Math.round(amount*100))>1e-7)fail(400,'درصد حداکثر دو رقم اعشار دارد.');
 if(body.direction==='decrease'&&body.mode==='percent'&&amount>100)fail(400,'کاهش درصدی نمی‌تواند بیش از ۱۰۰ درصد باشد.');
 const day=today(),prices=effectivePrices(db.priceList,day),sign=body.direction==='increase'?1:-1;
 const products=db.products.filter(p=>p.isActive&&p.priceGroupId===group.id).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 if(!products.length)fail(409,'این گروه محصول فعال ندارد.');
 const rows=products.map(p=>{
  const price=prices.get(p.id),before=price?Number(price.price):null;
  const raw=before===null?null:(body.mode==='fixed'?before+sign*amount:before*(1+sign*amount/100));
  const after=raw===null?null:Math.round(raw);
  const error=before===null?'قیمت ثبت نشده است.':!Number.isFinite(before)||before<0||!Number.isFinite(raw)||raw<0||!Number.isSafeInteger(after)||after>validate.MAX_MONEY?'قیمت حاصل نامعتبر است.':'';
  return {productId:p.id,name:p.name,quickCode:p.quickCode,before,after,error,sourceId:price?.id||null,sourceDate:price?.date||null};
 });
 const token=createHash('sha256').update(JSON.stringify({day,group:{id:group.id,name:group.name},direction:body.direction,mode:body.mode,amount,rows})).digest('hex');
 return {day,group:{id:group.id,name:group.name},direction:body.direction,mode:body.mode,amount,rows,token,canApply:rows.every(r=>!r.error)};
}
route('POST','/api/admin/price-groups/:id/preview',ROLES,ctx=>({body:plan(store.get(),ctx.params.id,ctx.body)}));
route('POST','/api/admin/price-groups/:id/apply',{...ROLES,idempotent:true},ctx=>{
 const db=store.get(),p=plan(db,ctx.params.id,ctx.body);
 if(typeof ctx.body.token!=='string'||ctx.body.token!==p.token)fail(409,'قیمت‌ها یا اعضای گروه تغییر کرده‌اند؛ پیش‌نمایش را دوباره بررسی کنید.');
 if(!p.canApply)fail(409,'ابتدا قیمت همهٔ محصولات گروه و مقدار تغییر را اصلاح کنید.');
 const ids=new Set(p.rows.map(r=>r.productId));
 db.priceList=db.priceList.filter(x=>!(ids.has(x.productId)&&x.date===p.day));
 for(const row of p.rows)db.priceList.push({id:store.uid(),productId:row.productId,price:row.after,date:p.day});
 store.audit(ctx.user,'PRICE_GROUP_ADJUSTED','price_group',p.group.id,{groupName:p.group.name,date:p.day,direction:p.direction,mode:p.mode,amount:p.amount,items:p.rows.map(r=>({productId:r.productId,name:r.name,before:r.before,after:r.after,sourceDate:r.sourceDate}))},ctx);
 store.save();return {body:{count:p.rows.length,date:p.day}};
});
module.exports={checkedGroup};
