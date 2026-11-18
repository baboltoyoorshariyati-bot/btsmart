'use strict';
// v37.6.0 — اجزای UI: سربرگ انبار (دکمهٔ ارسال هر سرویس)، پنل فروش، کارت تحویل هر محموله، فاکتور هر سرویس
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const read=p=>fs.readFileSync(require('node:path').join(__dirname,'..',p),'utf8');
const ui=read('public/ui2.js'),app=read('public/app.js'),css=read('public/compatibility.css');
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fa=v=>String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
function ctx(...fns){const c={esc,fa,qty:fa,money:fa,icon:()=>'',badge:()=>'',dateLabel:s=>s,dt:s=>s,formatDateTime24:v=>v||'—',plateViewHtml:()=>'',activeItemsOf:o=>(o.items||[]),storeAwareOrderName:o=>o?.storeName||o?.customer?.name||'—',storeAwareOrderPhone:o=>'',sdEmpty:()=>'',orderCustomerStripHtml:()=>''};vm.createContext(c);vm.runInContext(app.slice(app.indexOf('function orderSummaryRow('),app.indexOf('\nconst app =')),c);for(const f of fns){const idx=()=>ui.indexOf('function '+f);vm.runInContext(ui.slice(idx(),idx()+ui.slice(idx()).search(/\nfunction |\nasync function |$/)+1),c);}return c;}

test('anbar sheet: دکمهٔ ارسال هر سرویس با شرط آماده‌بودن و تأیید همراه است',()=>{
 const c=ctx('sr38SendBtn');
 const order={id:'o1',storeRunOps:{},id2:1};
 const items=[{itemId:'a',r1Kg:10,r2Kg:0,sentInR1:false,sentInR2:false}];
 const html1=c.sr38SendBtn(order,1,items);
 assert(html1.includes('ارسال سرویس اول به فروش'));assert(!html1.includes('disabled'),'با وزن آماده‌اند');
 const blocked=c.sr38SendBtn(order,2,items);
 assert(blocked.includes('disabled'),'سرویس دوم پیش از اول بلاک است');
 assert(blocked.includes('نخست اقلام سرویس اول'));
 const sent=c.sr38SendBtn({...order,storeRunOps:{r1Shipment:{status:'PENDING_SALES'}}},1,items);
 assert(sent.includes('به فروش ارسال شد'),'پس از ارسال چیپ وضعیت');
 assert(ui.includes('data-action="sr38-send-run"'),'دیسپچر دکمه موجود است');
 assert(ui.includes("sr38Post(id,'send-run',{run,physicalHandoverConfirmed:true})"),'فراخوان مسیر صحیح');
});

test('سرصفحهٔ چیپ‌ها مرحلهٔ تحویل هر سرویس را نشان می‌دهد',()=>{
 const c=ctx('sr38Chips');
 const o={storeRun:{enabled:true,overallLabel:'در حال انجام',r1Status:'DONE',r1StatusLabel:'پایان‌یافته',r2Status:'PENDING',r2StatusLabel:'در انتظار',r1StageLabel:'به فروش ارسال شد (منتظر تعیین راننده)',counts:{total:1,completed:0,remaining:1,short:0},items:[]}};
 const html=c.sr38Chips(o);
 assert(html.includes('به فروش ارسال شد (منتظر تعیین راننده)'),'برچسب مرحلهٔ سرویس اول');
 assert(!html.includes('سرویس دوم ← فروش'),'بدون مرحلهٔ سرویس دوم وقتی نیست');
});

test('پنل فروش: فقط وقتی درخواست ارسال هست؛ کارت خروجی امن و دارای اکشن',()=>{
 const c=ctx('renderStoreRunShipmentsPanel');
 assert.strictEqual(c.renderStoreRunShipmentsPanel([]),'');
 assert.strictEqual(c.renderStoreRunShipmentsPanel(undefined),'');
 const html=c.renderStoreRunShipmentsPanel([{orderId:'o',orderNo:'0001',storeName:'<b>بد',run:2,sentAt:'2026-10-17T08:00',sentByName:'انبار',items:[{itemId:'i',productName:'مرغ<img>',quickCode:'01',deliveredKg:12.5}]}]);
 assert(html.includes('سرویس دوم'));
 assert(html.includes('data-action="sr-ship-open"'));
 assert(html.includes('&lt;b&gt;')||html.includes('&lt;b'),'HTML ایمن');
 assert(!html.includes('<img'));
 assert(css.includes('.sr-ship-panel'),'استایل پنل');
});

test('کارت تحویل فروشگاه: هر محموله چیپ سرویس و دکمهٔ تأیید همان محموله را دارد',()=>{
 const c=ctx('st38DeliveredRow','st38DeliveredDetails','st38ViewsOf');
 const base={id:'o',orderNo:'0007',storeName:'فروشگاه تست',items:[],
  dispatch:{status:'SALES_FINALIZED',run:2,deliveredAt:'2026-10-17T10:00',driverName:'راننده',lines:[{productName:'مرغ',deliveredKg:80,unitPrice:7000,grossAmount:560000,returnKg:0,shortageKg:0,netKg:75}],settlementType:'CASH',storeReceiptConfirmedAt:null},
  dispatchRuns:[{status:'SALES_FINALIZED',run:1,deliveredAt:'2026-10-17T08:00',driverName:'راننده۱',lines:[],storeReceiptConfirmedAt:'2026-10-17T09:00'}],
  payment:{invoiceNumber:'I-2'},payments:[{invoiceNumber:'I-1',deliveryRun:1},{invoiceNumber:'I-2',deliveryRun:2}]};
 const views=c.st38ViewsOf(base);
 assert.equal(views.length,2,'دو محموله');
 assert.equal(views[0].payment.invoiceNumber,'I-1','فاکتور سرویس اول');
 assert.equal(views[1].dispatch.run,2);
 const row2=c.st38DeliveredRow(views[1]);assert(row2.includes('data-action="store-delivery-details"'));assert(row2.includes('data-run="2"'));
 const html2=c.st38DeliveredDetails(views[1]);
 assert(html2.includes('محمولهٔ سرویس دوم'));
 assert(html2.includes('class="st38-delivered-card st38-delivered-details"'),'کارت جزئیات کلاس ویژهٔ مودال دارد');
 assert(html2.includes('data-run="2"'),'بدنهٔ تأیید با run ارسال می‌شود');
 assert.match(css,/#modal \.st38-delivered-details>header \.st-run-chip\{margin-inline-start:8px\}/,'شماره سفارش و چیپ سرویس در سربرگ مودال باید از هم فاصله داشته باشند');
 assert.match(css,/#modal \.st38-delivered-details \.st38-delivered-summary\{[^}]*display:flex[^}]*gap:9px 20px/,'جمع وزن و شماره سند داخل مودال باید فاصلهٔ مستقل داشته باشند');
 assert.match(css,/#modal \.st38-delivered-details>footer\{[^}]*display:flex[^}]*gap:12px/,'یادداشت و دکمهٔ پایین جزئیات داخل مودال باید فاصلهٔ مستقل داشته باشند');
 const html1=c.st38DeliveredDetails(views[0]);
 assert(html1.includes('تأیید شما:'),'محمولهٔ تأییدشده مهر می‌خورد');
 assert(!html1.includes('data-action="store-confirm-delivery"'),'دوباره دکمهٔ تأیید ندارد');
});

test('جزئیات تحویل فروشگاه ناخالصی‌های توزین همان سرویس را جایگزین مرجوعی، کسری و علت می‌کند',()=>{
 const c=ctx('st38WeighingDetailsHtml','st38DeliveredDetails');
 const html=c.st38DeliveredDetails({orderType:'STORE',storeOrderKind:'BULK',orderNo:'0007',storeName:'فروشگاه تست',items:[{id:'i1',runR1:[{kg:2.9,at:'2026-10-27T09:00:00Z',weighings:[{grossKg:5,basket18:1,basket25:0,box300:1,box600:0,rackKg:0,cartKg:0,tareKg:2.1,netKg:2.9}]}]}],dispatch:{run:1,status:'DELIVERED',deliveredAt:'2026-10-27T09:00:00Z',driverName:'راننده',lines:[{itemId:'i1',productName:'مرغ',deliveredKg:2.9,returnKg:1,shortageKg:0.5,netKg:1.4,reason:'ثبت قدیمی'}]}});
 assert(html.includes('ناخالصی‌های ثبت‌شده در توزین انبار'));
 assert(html.includes('سبد ۱٫۸ کیلوگرمی'));assert(html.includes('کارتن ۳۰۰ گرمی'));assert(html.includes('کسر کل'));assert(html.includes('ثبت وزن'));
 assert(!html.includes('مرجوعی'));assert(!html.includes('کسری'));assert(!html.includes('علت'));
 const corrected=c.st38WeighingDetailsHtml({runR1:[{weighings:[{grossKg:5,basket18:1,tareKg:1.8,netKg:3.2}]}]},1,{weighings:null,missingWeighings:true});
 assert.equal(corrected,'');assert.doesNotMatch(corrected,/سبد ۱٫۸/,'توزین قدیمی نباید بعد از اصلاح وزن به‌عنوان توزین جدید نمایش داده شود');
});

test('جمع‌بندی محموله‌ها در جزئیات سفارش هر دو سرویس را نشان می‌دهد',()=>{
 const c=ctx('st38RunSummaryHtml');
 assert.strictEqual(c.st38RunSummaryHtml({}),'');
 const html=c.st38RunSummaryHtml({dispatch:{status:'IN_TRANSIT',run:2,driverName:'b'},dispatchRuns:[{status:'SALES_FINALIZED',run:1,driverName:'a',deliveredAt:'2026-10-17T08:00',storeReceiptConfirmedAt:'2026-10-17T09:00'}]});
 assert(html.includes('محمولهٔ سرویس اول'));assert(html.includes('محمولهٔ سرویس دوم'));
 assert(html.includes('تأیید شد'),'مهر تأیید سرویس اول');
 assert(app.includes('${st38RunSummaryHtml(o)}'),'در مودال جزئیات فراخوانی می‌شود');
});

test('فاکتور به‌ازای هر سرویس: priceLines برای اقلام و یک ردیف برای هر فاکتور در مرکز فاکتورها',()=>{
 assert(app.includes('function pickInvoicePayment(o,run)'),'انتخابگر فاکتور سرویس');
 assert(app.includes('data-run="${run}"'),'دکمه‌های مشاهده/چاپ رانندهٔ run را دارد');
 assert(app.includes('priceLines.length?priceLines.map'),'اقلام فاکتور از priceLines');
 const c2={esc,fa,qty:fa,money:fa,n:v=>Number(v)||0,icon:()=>'',badge:()=>'',dt:s=>s,formatDateTime24:v=>v,todayText:()=>'',jalaliText:s=>s,textLength:()=>0};
 vm.createContext(c2);
 const start=app.indexOf('function invoiceHtml(o,paySel)');const end=app.indexOf('\nfunction ',start+10);
 vm.runInContext(app.slice(start,end),c2);
 const o2={payment:{invoiceNumber:'X0'},items:[{product:{name:'قدیم'},deliveredKg:1,unitPrice:1,finalAmount:1,itemStatus:'DELIVERED'}],payments:[]};
 const html=c2.invoiceHtml(o2,{invoiceNumber:'F-77',priceLines:[{productName:'مرغ',deliveredKg:80,unitPrice:7000,amount:560000}],totalAmount:560000,verifiedAt:'2026-10-17'});
 assert(html.includes(fa('F-77')), 'شماره فاکتور همان سرویس');assert(html.includes('مرغ'),'قلم از priceLines');
 assert(!html.includes('قدیم'),'قلم قدیمی نیامد');
});

test('فهرست فاکتورها سفارش چندپردازه را به ردیف‌های جدا می‌شکند',()=>{
 assert(app.includes("orders.flatMap(o=>(o.payments&&o.payments.length>1?o.payments:[o.payment])"),'فلتینگ فاکتورها');
});

 test('delivered store details prefer immutable line weighing snapshot without item history',()=>{
 const c=ctx('st38WeighingDetailsHtml','st38DeliveredDetails');
 const html=c.st38DeliveredDetails({orderType:'STORE',items:[],dispatch:{run:2,status:'DELIVERED',lines:[{itemId:'removed',productName:'مرغ',deliveredKg:3.2,weighings:[{grossKg:5,basket18:1,tareKg:1.8,netKg:3.2}]}]}});
 assert.match(html,/سبد ۱٫۸/);assert.match(html,/کسر کل/);assert.doesNotMatch(html,/جزئیات توزین انبار برای این سرویس در سابقه ثبت نشده/);
 });

test('store delivery separates net and gross; no impurity leaves an empty cell',()=>{
 const c=ctx('st38WeighingDetailsHtml','st38DeliveredDetails');
 const make=(weighings,extra={})=>({orderType:'STORE',items:[],dispatch:{run:1,lines:[{itemId:'i',deliveredKg:8,netKg:6,productName:'مرغ',weighings,...extra}]}});
 let html=c.st38DeliveredDetails(make([{grossKg:10,netKg:8,tareKg:2,rackKg:2}]));
 assert.match(html,/<th>خالص \(کیلوگرم\)<\/th><th>ناخالص \(کیلوگرم\)<\/th>/);
 assert.match(html,/<td>۸<\/td><td>۱۰<\/td>/,'outgoing net must not subtract later returns');
 html=c.st38DeliveredDetails(make([{grossKg:8,netKg:8,tareKg:0}]));
 assert.match(html,/<td>۸<\/td><td>۸<\/td><td><\/td>/);
 assert.equal(c.st38WeighingDetailsHtml(null,1,{weighings:[{grossKg:8,netKg:8,tareKg:0}]}),'');
 assert.equal(c.st38WeighingDetailsHtml({runR1:[{kg:8}]},1),'');
 html=c.st38DeliveredDetails(make(undefined));assert.match(html,/وزن ناخالص در سابقه موجود نیست/);
 const corrected=make([{grossKg:10,tareKg:2,rackKg:2}]);corrected.storeDocumentCorrections={'1':[{itemId:'i',deliveredKg:7,missingWeighings:true}]};
 html=c.st38DeliveredDetails(corrected);assert.match(html,/<td>۷<\/td>/);assert.doesNotMatch(html,/راک:/);
});
