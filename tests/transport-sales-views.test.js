'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {salesTransportViews:views}=require('../lib/transport-sales-views');
const base={id:'new',transportWorkflow:1,deliveryMode:'DELIVERY',orderType:'REMOTE',status:'SETTLEMENT_PENDING',updatedAt:'2026-10-01'};
test('مراحل گردش جدید خروج یا عدم تحویل را تحویل مشتری و سوابق معرفی نمی‌کند',()=>{
 assert.equal(views({...base,status:'SCHEDULED_REMOTE'}).length,0);
 assert.equal(views({...base,deliveryMode:'PICKUP'}).length,0);
 assert.equal(views({...base,status:'CLOSED'}).length,0);
 assert.equal(views(base)[0].transportService.section,'assigned');
 const departed={...base,transportDeparture:{at:'2026-10-02'}};
 assert.equal(views(departed)[0].transportService.section,'inTransit');
 for(const outcome of ['DELIVERED','NOT_DELIVERED']){
  const returned={...departed,transportReturn:{at:'2026-10-03',outcome}};
  assert.equal(views(returned)[0].transportService.section,'delivered');
  if(outcome==='NOT_DELIVERED')assert.match(views(returned)[0].transportService.label,/تحویل‌نشده/);
  assert.equal(views({...returned,status:'CLOSED',transportInvoice:{status:'CLOSED',closedAt:'2026-10-04'}})[0].transportService.section,'history');
 }
});
test('فروشگاه سرویس‌های واقعی را مستقل، با تصویر تاریخی و اقلام همان سرویس نشان می‌دهد',()=>{
 const order={...base,orderType:'STORE',status:'WAREHOUSE_PREPARING',transportAssignments:{'1':{driverName:'اول'},'2':{driverName:'دوم'}},transportHandovers:{'1':{driverName:'اول',vehiclePlate:'A',document:{lines:[{productName:'مرغ',deliveredKg:1}]}},'2':{driverName:'دوم',document:{lines:[{productName:'مرغ',deliveredKg:2}]}}},transportStoreTrips:{'1':{status:'CLOSED',documentsReturnedAt:'2026-10-04'},'2':{status:'IN_TRANSIT',departedAt:'2026-10-03'}}};
 const rows=views(order);assert.equal(rows.length,2);assert.equal(rows[0].transportService.section,'history');assert.equal(rows[1].transportService.section,'inTransit');assert.equal(rows[0].transportService.lines[0].deliveredKg,1);assert.equal(rows[1].transportService.lines[0].deliveredKg,2);assert.equal(rows[0].transportService.driverName,'اول');assert.equal(rows[1].transportService.driverName,'دوم');
 assert.equal(views({...base,orderType:'STORE'}).length,0);
});
test('صفحه‌بندی سوابق پس از ترکیب واقعی قدیم و جدید است، بدون تکرار یا حذف',async()=>{
 const orders=[];for(let i=0;i<35;i++){orders.push({id:'old'+i,updatedAt:'2026-01-01',dispatch:{status:'SALES_FINALIZED',salesFinalizedAt:`2026-01-${String(i%28+1).padStart(2,'0')}`}});orders.push({...base,id:'new'+i,status:'CLOSED',transportReturn:{outcome:'NOT_DELIVERED'},transportInvoice:{status:'CLOSED',closedAt:`2026-02-${String(i%28+1).padStart(2,'0')}`}});}
 const routes=[];const mockDispatch={dispatchViews:o=>o.dispatch?[{order:o,dispatch:o.dispatch}]:[],publicOrder:o=>o};
 const routeSource=fs.readFileSync(path.join(__dirname,'../lib/routes/dispatch.js'),'utf8');
 vm.runInNewContext(routeSource,{URLSearchParams,require:p=>p==='../http'?{atomicRoute:(method,url,opts,handler)=>routes.push({method,url,handler})}:p==='../store'?{get:()=>({orders})}:p==='../dispatch'?mockDispatch:p==='../pickup-legacy-guard'?{withPickupOrderLock:(_ctx,work)=>work()}:p==='../transport-sales-views'?{salesTransportViews:views}:p==='../domain'?{enrichOrder:o=>({...o})}:require(p)});
 const route=routes.find(r=>r.method==='GET'&&r.url==='/api/sales/dispatch-deliveries');let all=[];
 for(const offset of [0,30,60]){const res=(await route.handler({query:new URLSearchParams(`historyOffset=${offset}`)})).body;assert.equal(res.finalizedTotal,70);assert.equal(res.finalizedOffset,offset);all.push(...res.finalized.map(x=>x.id));}
 assert.equal(all.length,70);assert.equal(new Set(all).size,70);assert(all.slice(0,30).every(x=>x.startsWith('new')));
});
