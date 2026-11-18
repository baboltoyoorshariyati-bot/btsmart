'use strict';
const {route,fail}=require('../http');
const {manager}=require('../tls-manager');
const sec=require('../security');
const store=require('../store');
const ADMIN={roles:['admin']};
route('GET','/api/admin/https',ADMIN,async()=>({body:manager.status()}));
route('POST','/api/admin/https',{...ADMIN,idempotent:true},async ctx=>{
  const key='https-settings:'+ctx.user.id;
  const locked=sec.loginLockedFor(ctx.ip,key);
  if(locked)fail(429,'تلاش بیش از حد؛ بعداً دوباره امتحان کنید.');
  if(!sec.verifyPassword(String(ctx.body.password||''),ctx.user.passwordHash)){
    sec.recordLoginFailure(ctx.ip,key);fail(403,'رمز مدیر درست نیست.');
  }
  sec.clearLoginFailures(ctx.ip,key);
  let status;
  try{status=manager.start(ctx.body.domain,ctx.body.email,ctx.body.terms,{id:ctx.user.id,username:ctx.user.username});}
  catch(e){fail(manager.busy?409:400,e.message);}
  store.audit(ctx.user,'TLS_CERTIFICATE_REQUESTED','settings','https',{domain:status.job.domain},ctx);store.save();
  return {status:202,body:status};
});
