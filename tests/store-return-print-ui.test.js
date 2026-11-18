'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'public/ui2.js'),'utf8');
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');

test('سوابق فروشگاه دکمهٔ چاپ مرجوعی را فقط با پرچم مرجوعی واقعی می‌سازد و چاپ سرویس را حذف می‌کند',()=>{
 const start=ui.indexOf('function renderSalesStoresV41'),end=ui.indexOf('/* ---------- تب ۳:',start),view=ui.slice(start,end);
 assert(start>=0&&end>start);
 assert.match(view,/kind==='history'\?storeReturnPrintButton\(o\)/);
 assert.match(view,/storeSalesDocumentButtons\(o,kind==='history',kind!=='history'\)/);
 assert.doesNotMatch(view,/storeServicePrintButtons\(o\.id,[^)]*,[^)]*,true\)/);
 const fnStart=ui.indexOf('function storeReturnPrintButton('),fnEnd=ui.indexOf('\nfunction renderSalesStoresV41',fnStart);
 assert(fnStart>=0&&fnEnd>fnStart);
 const context={esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),icon:()=>'<svg></svg>'};vm.createContext(context);vm.runInContext(ui.slice(fnStart,fnEnd),context);
 assert.equal(context.storeReturnPrintButton({id:'none',hasReturnedGoods:false}),'');
 assert.equal(context.storeReturnPrintButton({id:'missing'}),'');
 const button=context.storeReturnPrintButton({id:'returned',hasReturnedGoods:true});
 assert.match(button,/data-action="print-store-return"/);assert.match(button,/چاپ مرجوعی/);assert.equal((button.match(/چاپ مرجوعی/g)||[]).length,1);
 assert.match(app,/if\(a==='print-store-return'\)return printStoreReturns\(el\.dataset\.id\)/);
 const docStart=app.indexOf('function storeSalesDocumentButtons('),docEnd=app.indexOf('\nfunction storeSalesReviewButtons',docStart);
 assert(docStart>=0&&docEnd>docStart);
 const helper={storeAvailableRuns:()=>[1,2],normalizeRole:()=> 'admin',serverEpoch:()=>Date.now(),app:{user:{roleCode:'admin'}},esc:value=>String(value??''),icon:()=>''};
 vm.createContext(helper);vm.runInContext(app.slice(docStart,docEnd),helper);
 const retained=helper.storeSalesDocumentButtons({id:'history',storeOrderKind:'DAILY',payments:[{id:'p1',deliveryRun:1,verifiedAt:'2026-11-10T10:00:00Z'},{id:'p2',deliveryRun:2,verifiedAt:'2026-11-10T10:00:00Z'}],storeRunOps:{r1Shipment:{sentAt:'2026-11-10T10:00:00Z'},r2Shipment:{sentAt:'2026-11-10T10:00:00Z'}}},true,false);
 assert.doesNotMatch(retained,/sales-store-document-print|چاپ/);
 assert.match(retained,/sales-warehouse-edit-request/);
});

test('نمای سفارش فروشگاه، وجود مرجوعی را از برگه‌های مثبت ثبت‌شده تشخیص می‌دهد',()=>{
 const store=require('../lib/store'),domain=require('../lib/domain'),originalGet=store.get;
 const orders=[{id:'none',orderType:'STORE',storeName:'فروشگاه'},{id:'zero',orderType:'STORE',storeName:'فروشگاه'},{id:'returned',orderType:'STORE',storeName:'فروشگاه'}];
 const db={visits:[],customers:[],products:[],payments:[],orderItems:[],audit:[],dispatchReturns:[{id:'zero-ticket',orderId:'zero',kg:0},{id:'return-ticket',orderId:'returned',kg:0.25}]};
 store.get=()=>db;
 try{
  const index=domain.orderReadIndex(orders);
  assert.equal(domain.enrichOrder(orders[0],undefined,index).hasReturnedGoods,false);
  assert.equal(domain.enrichOrder(orders[1],undefined,index).hasReturnedGoods,false);
  assert.equal(domain.enrichOrder(orders[2],undefined,index).hasReturnedGoods,true);
  assert.deepEqual(domain.enrichOrder(orders[2]),domain.enrichOrder(orders[2],undefined,index));
 }finally{store.get=originalGet;}
});

test('چاپ مرجوعی از برگه‌های واقعی سفارش می‌سازد و متن را قبل از درج در سند escape می‌کند',async()=>{
 const start=app.indexOf('async function printStoreReturns('),end=app.indexOf('\nfunction storeOrderDispatches',start);
 assert(start>=0&&end>start);
 let captured='',requested='',toasts=[];
 const context={
  api:async url=>{requested=url;return{order:{id:'r1',orderType:'STORE',orderNo:'<1>',storeName:'فروشگاه',dispatchPlace:'شهر'},returns:[{productName:'<کالا>',kg:2.5,reason:'علت <نامعتبر>',driverName:'راننده',driverPlate:'12ب34567',deliveredAt:'2026-11-10T10:00:00Z'}]};},
  BTPrintDigits:{documentHtml:html=>html},BTPrintFrame:{html:html=>{captured=html;return 'printed';}},
  esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  fa:value=>String(value),qty:value=>String(value),formatDateTime24:value=>String(value),storeAwareOrderName:order=>order.storeName,
  toast:message=>toasts.push(message),encodeURIComponent,
 };
 vm.createContext(context);vm.runInContext(app.slice(start,end)+';this.printStoreReturns=printStoreReturns;',context);
 assert.equal(await context.printStoreReturns('r1'),'printed');
 assert.equal(requested,'/api/orders/r1/returns');assert.match(captured,/برگهٔ مرجوعی کالا/);assert.match(captured,/جمع وزن مرجوعی/);assert.match(captured,/راننده/);assert.match(captured,/2\.5/);assert.match(captured,/&lt;کالا&gt;/);assert.match(captured,/علت &lt;نامعتبر&gt;/);assert.doesNotMatch(captured,/<کالا>|علت <نامعتبر>/);assert.equal(toasts.length,0);
});
