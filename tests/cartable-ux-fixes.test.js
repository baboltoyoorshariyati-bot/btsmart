'use strict';
// v1.1.9 — اصلاح‌های کارتابل انبار/ترابری:
//  ۱) فقط «محل ارسال» (تعیین‌شدهٔ فروش) نمایش داده می‌شود، نه «محله».
//  ۲) قلم «عدم موجودی» از سند انبار و فاکتور تسویه حذف می‌شود.
//  ۴) هر شماره فقط برای یک پروندهٔ مشتری است؛ تحویل‌گیرنده نقش جداگانه دارد.
//  ۵) کادر «توضیحات برای فروش» چندخطی است. ۶) دو تب کارتابل ترابری افقی و مستقل‌اند.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const net=require('node:net');
const os=require('node:os');

const root=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('شمارهٔ تکراری پروندهٔ مستقل نمی‌سازد و سوابق مشتریان جدا می‌ماند',{timeout:90000},async()=>{
 const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-cartable-')),base=`http://127.0.0.1:${port}`,password='Changed!2345';
 const proc=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_PICKUP_STAGING:'false',BT_EXPERIMENTAL_TRANSPORT_WORKFLOW:'0'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(t);resolve();}});proc.once('exit',c=>reject(Error('server exited '+c)));});
  const call=async(method,url,body,cookie)=>{const r=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,body:await r.json().catch(()=>({})),cookie:(r.headers.get('set-cookie')||'').split(';')[0]};};
  const ok=async(method,url,body,cookie,status=200)=>{const r=await call(method,url,body,cookie);assert.equal(r.status,status,`${method} ${url}: ${JSON.stringify(r.body)}`);return r.body;};
  const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;
  await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:password},admin);
  for(const [username,roleCode] of [['ux-sales','sales'],['ux-warehouse','warehouse'],['ux-gate','gate']])await ok('POST','/api/admin/users',{username,roleCode,fullName:username,position:'آزمون',password,mustChangePassword:false},admin,201);
  const sales=(await call('POST','/api/login',{username:'ux-sales',password})).cookie;
  const warehouse=(await call('POST','/api/login',{username:'ux-warehouse',password})).cookie;
  const gate=(await call('POST','/api/login',{username:'ux-gate',password})).cookie;
  const today=new Date(),day=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const orderFor=(name,phone)=>ok('POST','/api/orders/remote',{name,phone,dispatchPlace:'بلوار طالب آملی، نبش کوچه ۱۲',scheduledDate:day,scheduledAt:`${day}T00:00`,deliveryMode:'PICKUP',items:[{productId:'p01',requestedQty:5,requestedUnit:'کیلوگرم'}]},sales,201);

  // صاحب سفارش قبلی پرونده‌ای با شمارهٔ مشترک دارد.
  const buyerOrder=(await orderFor('علی رضایی','09121110001')).order;
  const buyerId=buyerOrder.customerId;
  assert(buyerId);
  const before=(await ok('GET','/api/customers?q=09121110001',null,gate)).customers;
  assert.equal(before.length,1,'یک پرونده برای شمارهٔ صاحب سفارش');

  // یک شماره نمی‌تواند برای دو پرونده به کار رود؛ حتی با نام متفاوت.
  const duplicate=await call('POST','/api/customers',{name:'حسن رضایی',phone:'09121110001',vehicleType:'وانت'},gate);
  assert.equal(duplicate.status,409);assert.equal(duplicate.body.code,'DUPLICATE_PHONE');
  const recipient=(await ok('POST','/api/customers',{name:'حسن رضایی',phone:'09121110003',vehicleType:'وانت'},gate,201)).customer;
  assert.notEqual(recipient.id,buyerId);
  assert.equal((await ok('GET',`/api/customers/${recipient.id}`,null,gate)).orders.length,0);
  assert.equal((await ok('GET',`/api/customers/${buyerId}`,null,gate)).customer.name,'علی رضایی');
  const recipientOrder=(await orderFor('حسن رضایی','09121110003')).order;
  assert.equal(recipientOrder.customerId,recipient.id);
  const secondBuyerOrder=(await orderFor('علی رضایی','09121110001')).order;
  assert.equal(secondBuyerOrder.customerId,buyerId);

  // قلم «عدم موجودی» در سند انبار و فاکتور تسویه نمی‌آید.
  const docOrder=(await ok('POST','/api/orders/remote',{name:'مشتری ناموجود',phone:'09121110002',dispatchPlace:'خیابان مدرس',scheduledDate:day,scheduledAt:`${day}T00:00`,deliveryMode:'PICKUP',items:[{productId:'p01',requestedQty:5,requestedUnit:'کیلوگرم'},{productId:'p02',requestedQty:2,requestedUnit:'کیلوگرم'}]},sales,201)).order;
  await ok('POST',`/api/orders/${docOrder.id}/warehouse/accept`,{},warehouse);
  await ok('POST',`/api/orders/${docOrder.id}/warehouse/start-preparing`,{},warehouse);
  const [delivered,missing]=docOrder.items;
  await ok('POST',`/api/orders/${docOrder.id}/warehouse`,{items:[{itemId:delivered.id,deliveredKg:4.5,note:'تحویل کامل'},{itemId:missing.id,outOfStock:true,note:'موجود نیست'}]},warehouse);
  const whDoc=(await ok('GET',`/api/warehouse/delivered/${docOrder.id}`,null,warehouse)).order;
  assert.equal(whDoc.items.length,1,'قلم ناموجود در سند انبار نمی‌آید');
  assert.equal(whDoc.items[0].itemId,delivered.id);
  assert.equal(whDoc.deliveredKg,4.5);
  assert.equal(whDoc.dispatchPlace,'خیابان مدرس','سند انبار محل ارسال فروش را نشان می‌دهد');
  assert(!whDoc.items.some(i=>i.itemId===missing.id));
  const pending=(await ok('GET',`/api/orders/${docOrder.id}`,null,sales)).order;
  const missingItem=pending.items.find(i=>i.id===missing.id);
  assert.equal(missingItem.itemStatus,'OUT_OF_STOCK');assert.equal(missingItem.deliveredKg,0);assert(!missingItem.unitPrice);

  // تسویه فقط برای قلم موجود انجام می‌شود و مبلغ فاکتور شامل قلم ناموجود نیست.
  const settled=(await ok('POST',`/api/orders/${docOrder.id}/settle`,{items:[{itemId:delivered.id,unitPrice:1000},{itemId:missing.id,unitPrice:999}],discountAmount:0,additionsAmount:0,settlementMethods:[{type:'CASH',amount:4500}]},sales)).order;
  assert.equal(settled.status,'SETTLED');
  assert.equal(settled.payment.totalAmount,4500,'قلم ناموجود در مبلغ فاکتور حساب نمی‌شود');
  const settledMissing=settled.items.find(i=>i.id===missing.id);
  assert.equal(settledMissing.itemStatus,'OUT_OF_STOCK');
  assert.equal(Number(settledMissing.unitPrice||0),0);assert.equal(Number(settledMissing.finalAmount||0),0);
  const settledDelivered=settled.items.find(i=>i.id===delivered.id);
  assert.equal(settledDelivered.unitPrice,1000);assert.equal(settledDelivered.finalAmount,4500);
  // فاکتور چاپی/سند تحویل هم همین یک قلم را دارد.
  const invoice=(await ok('GET',`/api/sales/orders/${docOrder.id}/invoices/${settled.payment.id}/edit`,null,sales));
  assert.equal(invoice.lines.length,1,'فاکتور فقط قلم تحویل‌شده را دارد');
  assert.equal(invoice.lines[0].itemId,delivered.id);
 }finally{proc.kill('SIGTERM');}
});

test('کارتابل‌ها فقط «محل ارسال» را نشان می‌دهند، کادر توضیحات چندخطی و تب‌های ترابری افقی‌اند',()=>{
 const app=read('public/app.js'),ui2=read('public/ui2.js'),css=read('public/compatibility.css'),core=require('../lib/customer-core');
 // ۱) «محله» در ردیف‌های سفارش/کارتابل حذف شده و «محل ارسال» از فیلد فروش می‌آید.
 assert.match(app,/detail-grid detail-grid-6[\s\S]{0,900}?<span>محل ارسال<\/span><b>\$\{esc\(o\.dispatchPlace\|\|'—'\)\}/);
 assert.doesNotMatch(ui2,/cell\('محله'/);
 assert.doesNotMatch(app,/detailCell\('محله'/);
 assert.doesNotMatch(css,/wh38-cell[^{]*محله/);
 assert.match(ui2,/const place=String\(o\.dispatchPlace\|\|''\)\.trim\(\)/);
 assert.match(ui2,/محل ارسال: \$\{place\}/);
 // ۳) برگهٔ ارسال پخش همان بدنهٔ فاکتور تحویل را دارد.
 for(const label of ['قیمت هر کیلو','مبلغ','جمع اقلام','تخفیفات','اضافات','مبلغ فاکتور'])assert(ui2.includes(label),label);
 // ۵) کادر توضیحات برای فروش textarea چندخطی است.
 assert.match(ui2,/<textarea id="wh38-note-\$\{esc\(it\.id\)\}" rows="2" maxlength="300"[^>]*data-wh38-note=/);
 assert.match(css,/\.wh38-note-box textarea[^{]*\{[^}]*min-height:52px/);
 assert.match(css,/\.wh38-note-box textarea[^{]*\{[^}]*resize:vertical/);
 // ۶) سه تب کارتابل ترابری کنار هم و افقی‌اند، نه روی هم.
 const tabStart=css.indexOf('#transportPlans .tp-plan-tabs'),tabEnd=css.indexOf('/* جزئیات ترابری');
 assert(tabStart>0&&tabEnd>tabStart,'بلوک تب‌های کارتابل ترابری پیدا شود');
 const tabs=css.slice(tabStart,tabEnd);
 assert.match(tabs,/#transportPlans \.tp-plan-tabs\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
 assert.match(tabs,/#transportPlans \.tp-plan-tabs\{[^}]*grid-auto-flow:column/);
 assert.match(tabs,/@media\(max-width:700px\)\{[^@]*#transportPlans \.tp-plan-tabs\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/,'تب‌ها در صفحهٔ باریک هم سه ستونی می‌مانند');
 assert.doesNotMatch(tabs,/grid-template-columns:minmax\(0,1fr\)/,'تب‌ها تک‌ستونی نمی‌شوند');
 assert.doesNotMatch(tabs,/grid-template-columns:repeat\(1,/,'تب‌ها تک‌ستونی نمی‌شوند');
 // ۴) نامهٔ سازگاری نام: ی/ك عربی، نیم‌فاصله و پسوند نام، همان شخص حساب می‌شود.
 assert.equal(core.namesCompatible('علي رضائي','علی رضایی'),true);
 assert.equal(core.namesCompatible('محمد','محمد احمدی'),true);
 assert.equal(core.namesCompatible('حسن','حسین'),false);
 const db={customers:[{id:'1',code:'00001',name:'علی رضایی',phone:'09121110001',plate:'12ب345-67'}]};
 assert.equal(core.findExisting(db,{phone:'09121110001',name:'حسن رضایی'}).id,'1');
 assert.equal(core.findExisting(db,{phone:'09121110001',name:'علی رضایی'}).id,'1');
 assert.equal(core.findExisting(db,{plate:'12ب345-67',name:'حسن رضایی'}),null);
});
