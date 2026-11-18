'use strict';
// Same-origin capture through a single administrator-configured agent. Never accept a URL from a client.
const {route,fail}=require('../http');
const store=require('../store');
const security=require('../security');
let busy=false;
route('POST','/api/fingerprint/capture',{roles:['sales']},async ctx=>{
  if(require('../customer-identity').CUSTOMER_CONTACT_ONLY) fail(503,'ثبت اثر انگشت موقتاً غیرفعال است.','FINGERPRINT_TEMPORARILY_DISABLED');
  const endpoint=process.env.FINGERPRINT_AGENT_URL || '';
  if(!endpoint)fail(503,'عامل اثرانگشت تنظیم نشده است؛ مسئول فنی باید FINGERPRINT_AGENT_URL را برای حسگر مورد اعتماد تنظیم کند.','FINGERPRINT_NOT_CONFIGURED');
  let url;try{url=new URL(endpoint)}catch{fail(503,'نشانی عامل اثرانگشت معتبر نیست.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)fail(503,'تنظیمات عامل اثرانگشت معتبر نیست.');
  const order=store.get().orders.find(o=>o.id===String(ctx.body.orderId||''));
  if(!order||order.status!=='SETTLEMENT_PENDING'||order.dispatch)fail(409,'سفارش برای احراز اثرانگشت آماده نیست.');
  if(busy)fail(409,'حسگر در حال استفاده است؛ پس از پایان عملیات قبلی دوباره تلاش کنید.','FINGERPRINT_BUSY');
  busy=true;
  try{
    const headers={Accept:'application/json'};
    if(process.env.FINGERPRINT_AGENT_TOKEN)headers.Authorization=`Bearer ${process.env.FINGERPRINT_AGENT_TOKEN}`;
    const method=String(process.env.FINGERPRINT_AGENT_METHOD||'POST').toUpperCase();
    if(!['GET','POST'].includes(method))fail(503,'روش ارتباط با عامل اثرانگشت باید GET یا POST باشد.');
    if(method==='POST')headers['Content-Type']='application/json';
    const response=await fetch(url,{method,headers,...(method==='POST'?{body:JSON.stringify({orderId:order.id,requestId:ctx.requestId})}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('AGENT_RESPONSE');
    const reader=response.body.getReader();let length=0;const chunks=[];
    try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>65536)throw new Error('RESPONSE_TOO_LARGE');chunks.push(Buffer.from(value));}}
    finally{await reader.cancel().catch(()=>{});}
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const reference=typeof data.fingerprintRef==='string'?data.fingerprintRef.trim():'';
    if(!data.ok||!reference||reference.length>250)throw new Error('INVALID_REFERENCE');
    const mock=data.mock===true || /^mock-/i.test(reference);
    if(mock && process.env.FINGERPRINT_ALLOW_MOCK!=='true')fail(502,'عامل آزمایشی برای احراز واقعی مجاز نیست.','FINGERPRINT_MOCK_REJECTED');
    if (!security.getSession(ctx.sid)) fail(401,'نشست پایان یافته است؛ دوباره وارد شوید.','AUTH_REQUIRED');
    if(order.status!=='SETTLEMENT_PENDING'||order.dispatch)fail(409,'وضعیت سفارش هنگام احراز تغییر کرده است؛ فرم را بازخوانی کنید.');
    store.audit(ctx.user,'FINGERPRINT_CAPTURE','order',order.id,{mock},ctx);store.save();
    return {body:{ok:true,fingerprintRef:reference,mock}};
  }catch(err){if(err.status)throw err;fail(502,'ارتباط با عامل اثرانگشت برقرار نشد یا پاسخ آن معتبر نبود؛ اتصال و تنظیمات حسگر را بررسی کنید.','FINGERPRINT_AGENT_ERROR');}
  finally{busy=false;}
});
