'use strict';
// This suite exercises records and accounts from the retired delivery workflow.
process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';
/* v37.33.0 — کارت «سفارشات ورودی امروز» در داشبورد انبار: آمار زندهٔ سمت سرور + نمایش داشبورد */
const {test, before, after}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const root=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const ADMIN_PASS='Ta1!'+require('crypto').randomBytes(8).toString('hex');
const PASS='Tw4!'+require('crypto').randomBytes(8).toString('hex');
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-wh-today-'));
const port=7181;
const BASE=`http://127.0.0.1:${port}`;
let proc;

before(async()=>{
  proc=spawn(process.execPath,[path.join(root,'server.js')],{
    env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dataDir,ADMIN_INITIAL_PASSWORD:ADMIN_PASS,LOGIN_MAX_ATTEMPTS:'50'},
    stdio:['ignore','pipe','pipe'],
  });
  await new Promise((resolve,reject)=>{
    const t=setTimeout(()=>reject(new Error('server did not start')),15000);
    proc.stdout.on('data',(d)=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve()}});
    proc.stderr.on('data',(d)=>process.stderr.write(d));
    proc.on('exit',(c)=>{clearTimeout(t);reject(new Error(`server exited ${c}`))});
  });
});
after(()=>{if(proc)proc.kill('SIGTERM');fs.rmSync(dataDir,{recursive:true,force:true})});

async function call(method,p,{cookie,body}={}){
  const h={};
  if(cookie)h.Cookie=cookie;
  if(method!=='GET')h['Idempotency-Key']='k'+require('crypto').randomBytes(8).toString('hex');
  if(body!==undefined)h['Content-Type']='application/json';
  const res=await fetch(BASE+p,{method,headers:h,body:body!==undefined?JSON.stringify(body):undefined});
  let json=null;try{json=JSON.parse(await res.text())}catch{/* not json */}
  return {status:res.status,json};
}
const login=(u,p,ip)=>fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':ip},body:JSON.stringify({username:u,password:p})})
  .then((r)=>((r.headers.get('set-cookie')||'').match(/sid=([^;]+)/)||[])[0]||null);
const localDay=()=>{const d=new Date();const p=(n)=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`};

test('UI: داشبورد انبار بخش سفارشات ورودی امروز را زنده و کلیک‌پذیر نشان می‌دهد',()=>{
  const app=read('public/app.js'),css=read('public/theme.css'),html=read('public/index.html');
  assert.match(app,/api\('\/api\/warehouse\/today-stats'\)/);
  assert.match(app,/whDashLiveHtml\(whToday\)/);
  assert.match(app,/سفارشات ورودی امروز/);
  assert.match(app,/refreshWhDashToday/);
  assert.match(app,/if\(!host\.isConnected\)\{clearInterval\(timer\)/,'داشبورد پس از خروج از صفحه دیگر تازه‌سازی نشود');
  assert.match(app,/data-cartable="incoming" data-role-page="warehouse"/);
  assert.match(css,/\.wh-dash-live\{/);
  assert.match(css,/\.wh-dash-prod\{/);
  assert.match(css,/#modal \.wh-dash-table\{/, 'جدول همهٔ محصولات در مودال نیز سبک ثابت دارد');
  assert.match(html,/app\.js\?v=37\.50\.0/);
  assert.match(html,/theme\.css\?v=37\.48\.1/);
});

test('API: آمار امروز انبار — ورودی امروز با هر وضعیت نهایی، به تفکیک محصول و واحد؛ لغوشده‌ها حذف',async()=>{
  let admin=await login('admin',ADMIN_PASS,'10.9.0.1');
  assert.equal((await call('POST','/api/account/password',{cookie:admin,body:{currentPassword:ADMIN_PASS,newPassword:PASS}})).status,200);
  const mk=(username,roleCode)=>call('POST','/api/admin/users',{cookie:admin,body:{username,fullName:username,position:'تست',roleCode,password:PASS,mustChangePassword:false}});
  assert.equal((await mk('wht1','warehouse')).status,201);
  assert.equal((await mk('salest1','sales')).status,201);
  const wh=await login('wht1',PASS,'10.9.0.3');
  const sales=await login('salest1',PASS,'10.9.0.4');

  // حالت خالی و دسترسی‌ها
  const empty=await call('GET','/api/warehouse/today-stats',{cookie:wh});
  assert.equal(empty.status,200);
  assert.equal(empty.json.date,localDay());
  assert.deepEqual([empty.json.totals.orders,empty.json.totals.items,empty.json.totals.products],[0,0,0]);
  assert.deepEqual(empty.json.byProduct,[]);
  assert.deepEqual(empty.json.deliveredTotals,{orders:0,items:0,products:0,deliveredKg:0,outOfStock:0});
  assert.deepEqual(empty.json.deliveredByProduct,[]);
  assert.equal((await call('GET','/api/warehouse/today-stats',{cookie:sales})).status,403);
  assert.equal((await call('GET','/api/warehouse/today-stats')).status,401);

  const products=(await call('GET','/api/products',{cookie:sales})).json.products.filter((p)=>p.isActive);
  const [p1,p2]=products;
  const mkOrder=async(name,phone,items)=>(await call('POST','/api/orders/remote',{cookie:sales,body:{
    name,phone,scheduledDate:localDay(),scheduledTime:'00:00',dispatchPlace:'بابل',
    items:items.map(([productId,requestedQty,requestedUnit])=>({productId,requestedQty,requestedUnit:requestedUnit||'کیلوگرم'}))}})).json.order;
  const o1=await mkOrder('مشتری یک','09110000021',[[p1.id,100],[p2.id,20]]);
  const o2=await mkOrder('مشتری دو','09110000022',[[p1.id,50],[p2.id,3,'عدد']]);
  const o3=await mkOrder('مشتری سه','09110000023',[[p2.id,10]]);
  assert.ok(o1&&o2&&o3,'orders must be created');

  // o1 کاملاً آماده‌سازی و نهایی می‌شود؛ باز هم در آمار امروز می‌ماند (انجام‌شده)
  assert.equal((await call('POST',`/api/orders/${o1.id}/warehouse/accept`,{cookie:wh,body:{}})).status,200);
  const full=(await call('GET',`/api/orders/${o1.id}`,{cookie:wh})).json.order;
  const fin=await call('POST',`/api/orders/${o1.id}/warehouse`,{cookie:wh,body:{items:full.items.map((i,index)=>index===1?{itemId:i.id,outOfStock:true}:{itemId:i.id,deliveredKg:90,outOfStock:false})}});
  assert.equal(fin.status,200,JSON.stringify(fin.json));
  // o3 به فروش ارجاع و بعد لغو می‌شود؛ نباید در آمار بماند
  assert.equal((await call('POST',`/api/orders/${o3.id}/return-sales`,{cookie:wh,body:{reason:'اصلاح سفارش'}})).status,200);
  assert.equal((await call('POST',`/api/orders/${o3.id}/cancel-remote`,{cookie:sales,body:{reason:'لغو'}})).status,200);

  const r=await call('GET','/api/warehouse/today-stats',{cookie:wh});
  assert.equal(r.status,200,JSON.stringify(r.json));
  const {totals,byProduct}=r.json;
  assert.equal(totals.orders,2,'دو سفارش ورودی امروز (لغوشده شمرده نمی‌شود)');
  assert.equal(totals.pending,1);
  assert.equal(totals.preparing,0);
  assert.equal(totals.done,1);
  assert.equal(totals.items,4);
  assert.equal(totals.products,2);
  assert.equal(totals.units['کیلوگرم'],170,'مجموع کیلوگرم درخواستی امروز');
  assert.equal(totals.units['عدد'],3,'واحدهای غیرکیلویی جدا جمع می‌شوند');
  const r1=byProduct.find((x)=>x.productId===p1.id), r2=byProduct.find((x)=>x.productId===p2.id);
  assert.equal(byProduct[0].productId,p1.id,'مرتب‌سازی بر اساس کیلوگرم نزولی');
  assert.deepEqual([r1.orders,r1.lines,r1.units['کیلوگرم']],[2,2,150]);
  assert.deepEqual([r2.orders,r2.lines,r2.units['کیلوگرم'],r2.units['عدد']],[2,2,20,3]);
  const {deliveredTotals,deliveredByProduct}=r.json;
  assert.deepEqual([deliveredTotals.orders,deliveredTotals.items,deliveredTotals.products,deliveredTotals.deliveredKg,deliveredTotals.outOfStock],[1,2,2,90,1]);
  const delivered1=deliveredByProduct.find((x)=>x.productId===p1.id),delivered2=deliveredByProduct.find((x)=>x.productId===p2.id);
  assert.deepEqual([delivered1.orders,delivered1.lines,delivered1.deliveredKg,delivered1.outOfStock],[1,1,90,0]);
  assert.deepEqual([delivered2.orders,delivered2.lines,delivered2.deliveredKg,delivered2.outOfStock],[1,1,0,1]);
  // مدیر هم می‌تواند ببیند (کارتابل انبار نزد مدیر)
  assert.equal((await call('GET','/api/warehouse/today-stats',{cookie:admin})).status,200);
});
