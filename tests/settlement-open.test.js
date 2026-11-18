'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const code=app.slice(app.indexOf('let stlOpenSequence=0;'),app.indexOf('\nfunction stlClose()',app.indexOf('let stlOpenSequence=0;')));
const itemsCode=app.slice(app.indexOf('function stlItemsOf(o, prices){'),app.indexOf('\n}',app.indexOf('function stlItemsOf(o, prices){'))+2);
function harness(api){
 const host={innerHTML:'',isConnected:true},painted=[],messages=[];
 const c={captureEntityNotices:()=>[],finishEntityNotices:()=>{},api,stl:{},app:{page:'sales',sub:{sales:'settlement'}},$:()=>host,document:{querySelectorAll:()=>[]},stlPaintForm:()=>painted.push(c.stl.orderId),stlEmptyHtml:()=>'<p>empty</p>',stlReset:()=>{},renderSales:()=>{},toast:m=>messages.push(m),esc:s=>String(s).replace(/[<>&"]/g,x=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[x]))};
 vm.createContext(c);vm.runInContext(itemsCode,c);vm.runInContext(code,c);return {c,host,painted,messages};
}
const order=(id,extra={})=>({id,status:'SETTLEMENT_PENDING',orderType:'REMOTE',transportWorkflow:1,deliveryMode:'DELIVERY',items:[],...extra});
test('فرم پخش قیمت فهرست امروز را به‌صورت best-effort می‌گیرد و به فهرست راننده قدیمی وابسته نیست',async()=>{
 const calls=[],h=harness(async url=>{calls.push(url);if(url==='/api/orders/a')return {order:order('a')};throw Error('درخواست غیرضروری '+url)});
 await h.c.stlOpen('a');assert.deepEqual(calls,['/api/orders/a','/api/prices']);assert.deepEqual(h.painted,['a']);
});
test('قیمت جاری فهرست محصول روی قیمت خالی یا صفر قلم تسویه اعمال می‌شود و قیمت معتبر ثبت‌شده پشتیبان می‌ماند',async()=>{
 const h=harness(async url=>{
  if(url==='/api/orders/priced')return {order:order('priced',{items:[
   {id:'i1',productId:'p01',unitPrice:0,deliveredKg:2,product:{name:'مرغ'}},
   {id:'i2',productId:'p02',unitPrice:null,deliveredKg:1,product:{name:'تخم‌مرغ'}},
   {id:'i3',productId:'p03',unitPrice:45000,deliveredKg:1,product:{name:'خوراک'}}
  ]})};
  if(url==='/api/prices')return {prices:[{productId:'p01',price:123456},{productId:'p02',price:78000},{productId:'p03',price:99000}]};
  throw Error('درخواست غیرمنتظره '+url);
 });
 await h.c.stlOpen('priced');
 assert.deepEqual(h.c.stl.items.map(item=>item.price),[123456,78000,99000]);
 assert.equal(h.c.stl.priceMap.p01,123456);
});
test('خطای پوز تسویه پخش را مسدود نمی‌کند اما در وضعیت فرم ثبت می‌شود',async()=>{
 const h=harness(async url=>{if(url==='/api/orders/a')return {order:order('a',{transportReturn:{outcome:'DELIVERED'}})};throw Error('دستگاه در دسترس نیست')});
 await h.c.stlOpen('a');assert.equal(h.c.stl.devicesError,true);assert.equal(h.c.stl.devices.length,0);assert.deepEqual(h.painted,['a']);
});
test('خطای دریافت سفارش در همان کادر با امکان تلاش مجدد نمایان می‌ماند',async()=>{
 const h=harness(async()=>{throw Error('مشکل <شبکه>')});await h.c.stlOpen('a');
 assert.match(h.host.innerHTML,/role="alert"/);assert.match(h.host.innerHTML,/مشکل &lt;شبکه&gt;/);assert.match(h.host.innerHTML,/data-stl="retry"/);assert.equal(h.painted.length,0);
});
test('انتخاب سریع سفارش بعدی یا ترک صفحه مانع درج پاسخ قدیمی می‌شود',async()=>{
 let finishA;const h=harness(async url=>url==='/api/orders/a'?await new Promise(r=>{finishA=r}):{order:order('b')});
 const a=h.c.stlOpen('a');await h.c.stlOpen('b');finishA({order:order('a')});await a;assert.deepEqual(h.painted,['b']);
 let finishC;h.c.api=async()=>await new Promise(r=>{finishC=r});const c=h.c.stlOpen('c');h.host.isConnected=false;finishC({order:order('c')});await c;assert.deepEqual(h.painted,['b']);
});
