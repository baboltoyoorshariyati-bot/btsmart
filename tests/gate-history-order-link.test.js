'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const domain=require('../lib/domain'),gateOrderView=require('../lib/gate-order-view');

test('visit history links the newest related order with only gate-safe metadata',async()=>{
 const source=fs.readFileSync('lib/routes/core.js','utf8');
 const start=source.indexOf("route('GET', '/api/visits'");
 const end=source.indexOf('// ---------- گزارش مدیریتی',start);
 assert(start>=0&&end>start);
 const visits=[
  {id:'visit-newest',customerId:'customer-1'},
  {id:'visit-direct',customerId:'customer-2',orderId:'order-not-ready'},
  {id:'visit-no-order',customerId:'customer-3'},
  {id:'visit-pending-exit',customerId:'customer-4'},
 ];
 const orders=[
  {id:'order-old',visitId:'visit-newest',orderNo:'000123',status:'SETTLED',createdAt:'2026-01-01T10:00:00Z'},
  {id:'order-new',visitId:'visit-newest',orderNo:'000124',status:'EXITED',createdAt:'2026-01-02T10:00:00Z',payment:{totalAmount:999},items:[{unitPrice:999}],signatureData:'secret'},
  {id:'order-not-ready',visitId:'visit-direct',orderNo:'000125',status:'WAREHOUSE_PENDING',createdAt:'2026-01-03T10:00:00Z',dispatch:{run:1}},
  {id:'order-pending-exit',visitId:'visit-pending-exit',orderNo:'000126',status:'SETTLED',createdAt:'2026-01-04T10:00:00Z'},
 ];
 const customers=new Map(visits.map(v=>[v.customerId,{name:'Customer '+v.customerId,phone:'09120000000',code:'C-'+v.customerId}]));
 const ctx={
  store:{get:()=>({orders})},
  repo:{repos:{visits:{all:()=>visits.slice()}},lookups:{customerOf:id=>customers.get(id)}},
  roleOf:()=> 'gate',normalizePlate:domain.normalizePlate,
  isGateExitAvailable:require('../lib/gate-exit-availability'),
  route:(method,url,options,handler)=>{ctx.handler=handler;},
 };
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 const rows=(await ctx.handler({query:new URLSearchParams(),user:{}})).body.visits;
 const newest=rows.find(v=>v.id==='visit-newest');
 assert.deepEqual({...newest.order},{id:'order-new',orderNo:'000124',status:'EXITED',gateExitAvailable:true});
 assert.equal(JSON.stringify(newest.order).match(/payment|amount|signature|secret/i),null);
 assert.equal(rows.find(v=>v.id==='visit-direct').order.gateExitAvailable,false);
 const pendingExit=rows.find(v=>v.id==='visit-pending-exit').order;
 assert.deepEqual({...pendingExit},{id:'order-pending-exit',orderNo:'000126',status:'SETTLED',gateExitAvailable:true});
 assert.equal(rows.find(v=>v.id==='visit-no-order').order,null);
 const searched=(await ctx.handler({query:new URLSearchParams({q:'۱۲۴'}),user:{}})).body;
 assert.equal(searched.total,1);assert.equal(searched.visits[0].id,'visit-newest');
});

test('gate history uses four accurate columns and labels those same columns on mobile',()=>{
 const ui=fs.readFileSync('ui-src/ui2/04-gate.js','utf8');
 const css=fs.readFileSync('public/design.css','utf8');
 assert.match(ui,/<th>مشتری<\/th><th>پلاک<\/th><th>شماره سفارش<\/th><th>جزئیات سفارش<\/th>/);
 assert.match(ui,/data-label="شماره سفارش"/);assert.match(ui,/data-label="جزئیات سفارش"/);
 assert.match(css,/\.gt-customer-history-table td:nth-child\(3\)::before\{content:'شماره سفارش'\}/);
 assert.match(css,/\.gt-customer-history-table td:nth-child\(4\)::before\{content:'جزئیات سفارش'\}/);
 assert.match(ui,/canOpen=!!orderId&&!!order\.gateExitAvailable/);
});

test('gate exit history accepts an order id before paging so old visits can open their exit details',()=>{
 const source=fs.readFileSync('lib/routes/orders.js','utf8');
 const start=source.indexOf("route('GET','/api/gate/exit-history'");
 const end=source.indexOf('// ---------- انبار ----------',start);
 assert(start>=0&&end>start);
 const orders=Array.from({length:110},(_,i)=>({
  id:'old-order-'+i,orderNo:String(i).padStart(4,'0'),status:'EXITED',updatedAt:new Date(Date.UTC(2026,0,1,0,i)).toISOString(),
  customer:{name:'Customer '+i,phone:'09120000000'},payment:{totalAmount:999},items:[{id:'item-'+i,itemStatus:'DELIVERED',product:{name:'Product '+i,price:999},deliveredKg:2,unitPrice:999}],
  dispatch:{run:1,gateExitAt:new Date(Date.UTC(2026,0,1,0,i)).toISOString(),driverName:'Driver',signatureData:'private'},
 }));
 const ctx={
  store:{get:()=>({orders})},
  validate:require('../lib/validate'),
  enrichOrder:o=>o,
  require:name=>name==='../gate-order-view'?gateOrderView:name==='../dispatch'?{publicOrder:o=>o}:require(name),
  route:(method,url,options,handler)=>{ctx.handler=handler;},
 };
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 const all=ctx.handler({query:new URLSearchParams(),user:{}}).body.orders;
 assert.equal(all.length,100);assert(!all.some(row=>row.id==='old-order-0'));
 const result=ctx.handler({query:new URLSearchParams({id:'old-order-0'}),user:{}}).body.orders;
 assert.equal(result.length,1);assert.equal(result[0].id,'old-order-0');
 const json=JSON.stringify(result[0]);assert.doesNotMatch(json,/payment|amount|price|signature|private|999/i);
});
