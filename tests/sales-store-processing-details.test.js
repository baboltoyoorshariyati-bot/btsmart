'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
function helper(role='sales',features={}){
 const context={app:{user:{roleCode:role},features},esc:v=>String(v??''),icon:()=>'',normalizeRole:x=>x,serverEpoch:()=>Date.parse('2026-11-18T12:00:00Z'),storeAvailableRuns:o=>[1,2].filter(n=>o.storeRunOps?.['r'+n+'Shipment'])};
 vm.createContext(context);vm.runInContext(src.slice(src.indexOf('function storeSalesDocumentButtons('),src.indexOf('async function salesStoreReview('))+src.slice(src.indexOf('function salesStoreProcessingDetailActions('),src.indexOf('async function openOrderDetails(')),context);return context.salesStoreProcessingDetailActions;
}
test('جزئیات در جریان شرایط اصلاح، ارسال مجدد، تحویل و اسناد هر سرویس را حفظ می‌کند',()=>{
 const base={id:'a',storeOrderKind:'DAILY',status:'RETURNED_TO_SALES',dispatch:{status:'DELIVERED',run:2},transportWorkflow:1,deliveryMode:'DELIVERY',transportHandovers:{1:{},2:{}},transportStoreReviews:{2:{}},storeRunOps:{r1Shipment:{sentAt:'2026-11-18T10:00:00Z'}},payments:[{id:'p1',deliveryRun:1}],documentEdits:[]};
 const render=helper('sales',{experimentalTransport:true}),html=render(base);
 for(const action of ['edit-returned-order','resubmit-order','sales-finalize-driver-delivery','sales-store-review','sales-store-document-print','sales-warehouse-edit-request'])assert.match(html,new RegExp(`data-action="${action}"`));
 assert.match(html,/تأیید نهایی تحویل سرویس دوم/);assert.match(html,/data-run="1"/);assert.match(html,/data-run="2" disabled/);assert.equal((html.match(/data-action="sales-store-review"/g)||[]).length,1);
 const pending=render({...base,status:'WAREHOUSE_PENDING',dispatch:null,documentEdits:[{paymentId:'p1',status:'PENDING_WAREHOUSE'}],transportStoreTrips:{1:{status:'RECEIPT_CONFIRMED'}}});
 assert.doesNotMatch(pending,/edit-returned-order|resubmit-order|sales-finalize-driver-delivery|sales-store-review/);assert.match(pending,/در صف انبار/);assert.match(pending,/data-store-transport-return="1"/);
 const locked=render({...base,storeRunOps:{r1Shipment:{sentAt:'2026-11-01T00:00:00Z'}}});assert.match(locked,/disabled title="مهلت ۷۲/);assert.doesNotMatch(helper('admin')( {...base,storeRunOps:{r1Shipment:{sentAt:'2026-11-01T00:00:00Z'}}}),/disabled title="مهلت ۷۲/);
});
