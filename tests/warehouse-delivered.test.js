'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../lib/routes/orders.js'),'utf8');
const context={getProduct:id=>({p:{name:'نام فعلی'}}[id])};vm.createContext(context);vm.runInContext(src.slice(src.indexOf('function warehouseDeliveredDocuments('),src.indexOf("route('GET','/api/warehouse/delivered'")),context);
test('legacy warehouse history and audit snapshots remain readable, reopen hides stale weights',()=>{
 const db={customers:[{id:'c',name:'مشتری',phone:'09120000000'}],users:[{id:'w',fullName:'انباردار'}],orders:[
  {id:'old',orderType:'REMOTE',customerId:'c',status:'EXITED',warehouseCompletedAt:'2025-01-01'},
  {id:'audit',orderType:'REMOTE',customerId:'c',status:'SETTLED',warehouseCompletedAt:'2026-01-01',warehouseCompletedBy:'w'},
  {id:'reopen',orderType:'REMOTE',status:'RETURNED_TO_SALES',warehouseCompletedAt:'2026-01-01'},
  {id:'store',orderType:'STORE',status:'SETTLED',warehouseCompletedAt:'2026-01-01'}],
  orderItems:[{id:'i',orderId:'old',productId:'p',warehouseStatus:'DELIVERED',deliveredKg:4,requestedQty:5},{id:'j',orderId:'audit',productId:'p',itemStatus:'CANCELLED',deliveredKg:999}],
  audit:[{entityType:'order',entityId:'audit',action:'WAREHOUSE_FINALIZE',details:{items:[{itemId:'j',status:'DELIVERED',deliveredKg:3}]}},{entityType:'order',entityId:'reopen',action:'WAREHOUSE_FINALIZE',details:{items:[]}},{entityType:'order',entityId:'reopen',action:'REOPEN_WAREHOUSE_PREPARING'}]};
 const before=JSON.stringify(db),result=context.warehouseDeliveredDocuments(db);
 assert.deepEqual(Array.from(result,r=>r.id),['audit','old']);assert.equal(result[0].items[0].deliveredKg,3);assert.equal(result[0].legacy,true);assert.equal(result[1].legacy,true);assert.equal(result[1].items[0].deliveredKg,4);assert.equal(JSON.stringify(db),before);
});

test('remote delivery documents expose current assignment and physical handover metadata',()=>{
 const db={customers:[{id:'c',name:'مشتری',phone:'09120000000'}],users:[],audit:[],orderItems:[
  {id:'a1',orderId:'assigned',productId:'p',warehouseStatus:'DELIVERED',deliveredKg:2},
  {id:'h1',orderId:'handed',productId:'p',warehouseStatus:'DELIVERED',deliveredKg:3}],orders:[
  {id:'assigned',orderType:'REMOTE',deliveryMode:'DELIVERY',transportWorkflow:1,customerId:'c',status:'SETTLEMENT_PENDING',warehouseCompletedAt:'2026-01-02T09:00:00Z',transportAssignments:{'0':{driverName:'راننده تخصیص',driverPhone:'09121111111',vehicleType:'وانت',vehiclePlate:'12ب34567'}}},
  {id:'handed',orderType:'REMOTE',deliveryMode:'DELIVERY',transportWorkflow:1,customerId:'c',status:'SETTLEMENT_PENDING',warehouseCompletedAt:'2026-01-02T09:00:00Z',transportAssignments:{'0':{driverName:'راننده تخصیص',driverPhone:'09121111111',vehicleType:'وانت',vehiclePlate:'12ب34567'}},transportHandovers:{'0':{physicalHandoverConfirmed:true,handedOverAt:'2026-01-02T09:30:00Z',driverName:'راننده تحویل',driverPhone:'09122222222',vehicleType:'کامیون',vehiclePlate:'34ج56789',document:{id:'handed',orderNo:'R2',warehouseDocumentNo:'W2',orderType:'REMOTE',createdAt:'2026-01-02T08:00:00Z',completedAt:'2026-01-02T09:00:00Z',customerName:'مشتری',customerPhone:'09120000000',items:[{itemId:'h1',productName:'محصول',deliveredKg:3,outOfStock:false}]}}}}]};
 const docs=context.warehouseDeliveredDocuments(db),assigned=docs.find(row=>row.id==='assigned'),handed=docs.find(row=>row.id==='handed');
 assert.equal(assigned.driverName,'راننده تخصیص');assert.equal(assigned.driverPhone,'09121111111');assert.equal(assigned.vehicleType,'وانت');assert.equal(assigned.vehiclePlate,'12ب34567');assert.equal(assigned.handedOverToDriver,false);
 assert.equal(handed.driverName,'راننده تحویل');assert.equal(handed.driverPhone,'09122222222');assert.equal(handed.vehicleType,'کامیون');assert.equal(handed.vehiclePlate,'34ج56789');assert.equal(handed.handedOverToDriver,true);assert.equal(handed.handedOverAt,'2026-01-02T09:30:00Z');
});

test('remote delivery warehouse document includes all customer, handover, vehicle and plate fields',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../public/ui2.js'),'utf8');
 const start=ui.indexOf('function whDeliveredDocument(o,print=false)'),end=ui.indexOf('function whCanRegisterHandover()',start);
 const c={esc:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),fa:String,formatDateTime24:value=>value||'—',whDocumentProducts:()=>'<table></table>'};
 vm.createContext(c);vm.runInContext(ui.slice(start,end),c);
 const html=c.whDeliveredDocument({orderType:'REMOTE',orderNo:'R-101',warehouseDocumentNo:'W-101',customerName:'مشتری نمونه',customerPhone:'09120000000',deliveryMode:'DELIVERY',driverName:'راننده نمونه',driverPhone:'09121111111',vehicleType:'وانت',vehiclePlate:'12ب34567',completedAt:'2026-01-02 09:00',handedOverAt:'2026-01-02 09:30',items:[]});
 for(const value of ['مشتری نمونه','09120000000','R-101','W-101','2026-01-02 09:30','راننده نمونه','09121111111','وانت','12ب34567'])assert.ok(html.includes(value),`سند باید مقدار «${value}» را نمایش دهد`);
 for(const label of ['سند:','سفارش:','مشتری:','تماس:','تحویل:','گیرنده:','خودرو:','پلاک:'])assert.ok(html.includes(label),`برچسب فشرده «${label}» باید نمایش داده شود`);
 assert.match(html,/whd-remote-meta/);assert.deepEqual(Array.from(html.matchAll(/class="whd-remote-group whd-remote-([a-z-]+)"/g),match=>match[1]),['customer','recipient','vehicle','order','time']);assert.equal((html.match(/class="whd-remote-pair"/g)||[]).length,9);
});
