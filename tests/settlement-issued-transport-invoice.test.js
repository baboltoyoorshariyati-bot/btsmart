'use strict';
// v37.6.1 — رگرسیون: بعد از چاپ برگهٔ ارسال، سفارش پخش باید از «آماده تسویه» بیرون برود
// و در «فاکتورهای صادرشده» دیده شود؛ پیش از این در هیچ‌کدام از دو فهرست نبود.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/ui2.js'),'utf8');
function fragment(start,end){return source.slice(source.indexOf(start),source.indexOf(end));}
function context(){
 const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 return vm.createContext({
  esc,fa:x=>String(x),money:x=>String(x)+' ریال',icon:()=>'<svg></svg>',
  storeAwareOrderName:o=>o.customer?.name||'',storeAwareOrderPhone:o=>o.customer?.phone||'',
  formatDateTime24:()=> '۱۴۰۵/۰۸/۲۸ • ۰۶:۳۰',sdEmpty:()=>'<div class="empty"></div>',
  app:{user:{roleCode:'sales'}},normalizeRole:x=>x,serverEpoch:()=>0,
 });
}
function load(ctx){vm.runInContext(fragment('function salesTransportInvoiceIssued(','function renderSalesSettlementV25('),ctx);}
const order=(extra={})=>({id:'o1',status:'SETTLEMENT_PENDING',orderNo:'000001',customer:{name:'مشتری',phone:'0912'},transportWorkflow:1,deliveryMode:'DELIVERY',payments:[],...extra});
test('فاکتور پخش با ثبت و بدون نیاز به چاپ از صف تسویه منتقل می‌شود',()=>{
 const ctx=context();load(ctx);
 const prepared=order({transportInvoice:{invoiceNumber:'000123',status:'PREPARED',totalAmount:3000,createdAt:'2026-01-01T00:00:00Z'}});
 assert.equal(ctx.salesTransportInvoiceIssued(prepared),true);
 assert.deepEqual([...ctx.salesSettlementPendingOrders([prepared])].map(o=>o.id),[]);
 assert.deepEqual([...ctx.salesSettlementIssuedOrders([prepared])].map(o=>o.id),[]);
});
test('چاپ برگهٔ ارسال سفارش پخش باز را به تسویه بازنمی‌گرداند',()=>{
 const ctx=context();load(ctx);
 const printed=order({transportInvoice:{invoiceNumber:'000123',status:'PREPARED',totalAmount:3000,printedAt:'2026-01-01T10:00:00Z'}});
 assert.equal(ctx.salesTransportInvoiceIssued(printed),true);
 assert.deepEqual([...ctx.salesSettlementPendingOrders([printed,order({id:'o2'})])].map(o=>o.id),['o2']);
 assert.deepEqual([...ctx.salesSettlementIssuedOrders([printed,order({id:'o2'})])].map(o=>o.id),[]);
});
test('سفارش بسته‌شدهٔ پخش و فاکتور تسویهٔ عادی هم در فهرست صادرشده‌ها می‌مانند',()=>{
 const ctx=context();load(ctx);
 const closed=order({status:'CLOSED',transportInvoice:{invoiceNumber:'000124',status:'CLOSED',totalAmount:1000,closedAt:'2026-01-02T10:00:00Z'}});
 const legacy=order({id:'o3',status:'SETTLED',transportWorkflow:0,payments:[{id:'p1',invoiceNumber:'000125',totalAmount:500,verifiedAt:'2026-01-01T09:00:00Z'}]});
 assert.deepEqual([...ctx.salesSettlementIssuedOrders([closed,legacy])].map(o=>o.id),['o1','o3']);
});
test('ردیف فاکتور صادرشدهٔ پخش شماره فاکتور، مبلغ و اقدام‌های چاپ را نشان می‌دهد',()=>{
 const ctx=context();load(ctx);
 vm.runInContext(fragment('function transportIssuedInvoiceRow(','function invoiceRowsV27('),ctx);
 const html=ctx.transportIssuedInvoiceRow(order({transportInvoice:{invoiceNumber:'000123',status:'PREPARED',totalAmount:3000,printedAt:'2026-01-01T10:00:00Z'}}));
 assert.match(html,/000123/);assert.match(html,/3000 ریال/);
 assert.match(html,/data-action="transport-shipment-print" data-id="o1"/);
 assert.match(html,/data-action="transport-invoice-open" data-id="o1"/);
 assert.match(html,/در انتظار خروج/);
 assert.doesNotMatch(html,/undefined/);
});
