'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const gateOrderView=require('../lib/gate-order-view');
const isGateExitAvailable=require('../lib/gate-exit-availability');

function registerWarehouseVisitDetailsRoute({orders,visits}){
 const source=fs.readFileSync('lib/routes/orders.js','utf8');
 const start=source.indexOf("route('GET', '/api/warehouse/visit-order-details/:id'");
 const end=source.indexOf("route('GET','/api/gate/exit-history'",start);
 assert(start>=0&&end>start,'warehouse visit details route exists before gate exit history');
 const context={
  store:{get:()=>({orders,visits})},
  fail:(status,message)=>{const error=new Error(message);error.status=status;throw error;},
  findOrder:id=>{const order=orders.find(row=>row.id===id);if(!order)context.fail(404,'سفارش یافت نشد.');return order;},
  enrichOrder:order=>order,
  isGateExitAvailable,
  normalizeRole:role=>String(role||'').toLowerCase(),
  require:name=>{
   if(name==='../warehouse-order-dossier')return require('../lib/warehouse-order-dossier');
   if(name==='../gate-order-view')return gateOrderView;
   if(name==='../dispatch')return{publicOrder:order=>order};
   throw Error('Unexpected require: '+name);
  },
  route:(method,path,options,handler)=>{context.method=method;context.path=path;context.options=options;context.handler=handler;},
 };
 vm.createContext(context);
 vm.runInContext(source.slice(start,end),context);
 return context;
}

const linkedOrder=()=>({
 id:'order-1',visitId:'visit-1',orderNo:'001234',orderType:'REGULAR',status:'SETTLED',
 customer:{name:'مشتری آزمایشی',phone:'09120000001',plate:'12ب34567'},
 items:[{id:'item-1',itemStatus:'DELIVERED',product:{name:'مرغ'},deliveredKg:3.5,unitPrice:2500}],
 payment:{totalAmount:8750,invoiceNumber:'INV-SECRET'},signatureData:'SECRET-SIGNATURE',
});

test('warehouse visit-order details is scoped to linked, gate-ready visits and exposes no financial fields',()=>{
 const order=linkedOrder();
 const route=registerWarehouseVisitDetailsRoute({orders:[order],visits:[{id:'visit-1'}]});
 assert.equal(route.method,'GET');
 assert.equal(route.path,'/api/warehouse/visit-order-details/:id');
 assert.deepEqual([...route.options.roles],['warehouse','admin']);
 const raw=route.handler({params:{id:order.id},user:{roleCode:'warehouse'}});
 const result=JSON.parse(JSON.stringify(raw.body));
 // v37.50.0 — پروندهٔ کامل سفارش (نوع، مشتری، اقلام، مراحل) به‌جای پاسخ حداقلی؛
 // دادهٔ مالی، پرداخت، فاکتور و امضا همچنان بیرون می‌ماند.
 assert.equal(result.order.id,'order-1');
 assert.equal(result.order.orderNo,'001234');
 assert.equal(result.order.orderType,'REGULAR');
 assert.equal(result.order.customer.name,'مشتری آزمایشی');
 assert.deepEqual(result.records,[{serviceRun:null,items:[{id:'item-1',itemStatus:'DELIVERED',product:{name:'مرغ'},deliveredKg:3.5}]}]);
 for(const key of ['order','customer','visit','stages','items','events'])assert.ok(key in result,key);
 assert.doesNotMatch(JSON.stringify(result),/payment|invoice|8750|2500|signature|SECRET/);
});

test('warehouse visit-order details rejects unrelated visits and orders not ready for gate verification',()=>{
 const order=linkedOrder();
 const missingVisit=registerWarehouseVisitDetailsRoute({orders:[order],visits:[]});
 assert.throws(()=>missingVisit.handler({params:{id:order.id},user:{roleCode:'warehouse'}}),{status:404});
 const pendingOrder={...order,status:'WAREHOUSE_PREPARING'};
 const pending=registerWarehouseVisitDetailsRoute({orders:[pendingOrder],visits:[{id:'visit-1'}]});
 assert.throws(()=>pending.handler({params:{id:order.id},user:{roleCode:'warehouse'}}),{status:409});
 // مدیر برای هر سفارشی، حتی بدون مراجعه و پیش از تسویه/خروج، پروندهٔ کامل را می‌گیرد.
 assert.equal(missingVisit.handler({params:{id:order.id},user:{roleCode:'admin'}}).status,200);
 assert.equal(pending.handler({params:{id:order.id},user:{roleCode:'admin'}}).status,200);
});

test('warehouse visit-order details preserves per-service weights from departed store trips',()=>{
 const order={...linkedOrder(),orderType:'STORE',transportStoreTrips:{
  '1':{run:1,departedAt:'2026-11-11T10:00:00Z',lines:[{itemId:'item-1',productName:'مرغ',deliveredKg:2.25,unitPrice:999}]},
  '2':{run:2,departedAt:'',lines:[{itemId:'item-1',productName:'مرغ',deliveredKg:1.25}]},
 }};
 const route=registerWarehouseVisitDetailsRoute({orders:[order],visits:[{id:'visit-1'}]});
 const result=JSON.parse(JSON.stringify(route.handler({params:{id:order.id},user:{roleCode:'warehouse'}}).body));
 assert.deepEqual(result.records,[{serviceRun:1,items:[{id:'item-1',itemStatus:'DELIVERED',product:{name:'مرغ'},deliveredKg:2.25}]}]);
 assert.doesNotMatch(JSON.stringify(result),/unitPrice|999/);
});

test('warehouse history binds its own detail action and calls the warehouse-safe route',()=>{
 const shell=fs.readFileSync('ui-src/app/02-shell-gate.js','utf8');
 const ui=fs.readFileSync('ui-src/ui2/04-gate.js','utf8');
 assert.match(shell,/renderGateHistory\(v\.visits\|\|\[\],true,'warehouse-visit-order-details'\);bindWarehouseVisitHistory\(content\)/);
 assert.match(ui,/data-action="\$\{esc\(detailsAction\)\}"/);
 assert.match(ui,/function bindWarehouseVisitHistory\(/);
 assert.match(ui,/if\(a==='gate-order-history'\)return gateOrderHistory\(el\.dataset\.id\)/);
 assert.match(ui,/api\('\/api\/warehouse\/visit-order-details\/'\+encodeURIComponent\(id\)\)/);
});
