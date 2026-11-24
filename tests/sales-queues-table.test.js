'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/ui2.js','utf8');
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function setup(){
 const c={esc,fa:String,qty:String,formatDateTime24:v=>v||'—',storeAwareOrderName:o=>o.customer?.name||'—',storeAwareOrderPhone:o=>o.customer?.phone||'—',activeItemsOf:o=>o.items||[],badge:s=>`<span>${esc(s)}</span>`,icon:()=>'',canSalesEditRemote:o=>!!o.editable,salesEmptyV25:(_i,title)=>title,sdEmpty:(_i,title)=>title,sdStatusAccent:()=>'',sdTypeBadge:()=>'<span>تلفنی</span>',pickupSalesActions:()=>'<button data-action="pickup">دریافت</button>',warehouseReturnNoteHtml:o=>`<div class="warehouse-return-note">${esc(o.warehouseReturn.reason)}</div>`,salesOrderDateTime:o=>o.scheduledAt,sr38Chips:()=>'<span>سرویس</span>'};
 vm.createContext(c);
 for(const [start,end] of [['function remotePhoneQueueRowsV40','function renderSalesRemoteV32'],['function salesDraftSavedWeight','function renderSalesFlowV25']]) vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))),c);
 return c;
}
test('صف تلفنی فقط سفارش‌های فعال غیرحضوری را در جدول با عملیات حفظ می‌کند',()=>{
 const c=setup(),orders=[{id:'1',orderType:'REMOTE',status:'WAREHOUSE_PENDING',orderNo:'123',customer:{name:'<مشتری>',phone:'0912'},items:[{}],editable:true},{id:'2',orderType:'STORE',status:'WAREHOUSE_PENDING'},{id:'3',orderType:'REMOTE',status:'CLOSED'}];
 const result=c.remotePhoneQueueRowsV40(orders);assert.equal(result.queue.length,1);assert.match(result.html,/<table class="bt-table phone-queue-table"/);assert.match(result.html,/&lt;مشتری&gt;/);assert.match(result.html,/0912/);assert.match(result.html,/data-action="order-details"/);assert.match(result.html,/data-action="future-edit"/);assert.doesNotMatch(result.html,/data-order="2"|data-order="3"/);
 assert.match(c.remotePhoneQueueRowsV40([]).html,/<td colspan="6">سفارش تلفنی فعالی/);
});
test('جدول در جریان جزئیات و کنش‌های ارجاع و وضعیت خالی را حفظ می‌کند',()=>{
 const c=setup(),order={id:'4',orderNo:'321',status:'RETURNED_TO_SALES',customer:{name:'آزمایش',phone:'0922'},dispatchPlace:'<مقصد>',warehouseReturn:{reason:'<اصلاح>'},scheduledAt:'فردا',items:[{}]};
 const html=c.salesFlowRowsV27([order]);assert.match(html,/<table class="bt-table sd-flow-table"/);assert.match(html,/data-order="4"/);assert.doesNotMatch(html,/data-label="مشخصات"|&lt;مقصد&gt;|&lt;اصلاح&gt;/);for(const action of ['order-details','pickup','edit-returned-order','resubmit-order'])assert.ok(html.includes(`data-action="${action}"`));assert.doesNotMatch(html,/زمان ارسال: فردا/);
 assert.match(c.salesFlowRowsV27([]),/<td colspan="5">سفارشی در جریان نیست/);
});

test('در جریان وضعیت سفارش‌های حضوری و غیرحضوری وزن پیش‌نویس را نمایش نمی‌دهد',()=>{
 const c=setup();
 for(const orderType of ['ONSITE','REMOTE']){
  const order={id:orderType,orderNo:'123',orderType,status:'WAREHOUSE_PREPARING',customer:{name:'مشتری'},items:[{id:'a',product:{name:'کالای تست'}}],warehouseWeightDraft:{items:[{itemId:'a',deliveredKg:7.5}]}};
  const html=c.salesFlowRowsV27([order]);assert.doesNotMatch(html,/۷٫۵|7\.5|ذخیره|کیلوگرم|کالای تست/);
 }
 assert.equal(c.salesDraftSavedWeight({itemStatus:'ACTIVE'},{deliveredKg:7.5}),'7.5 کیلوگرم');
 assert.equal(c.salesDraftSavedWeight({itemStatus:'ACTIVE'},{outOfStock:true,deliveredKg:0}),'عدم موجودی (پیش‌نویس)');
 assert.equal(c.salesDraftSavedWeight({itemStatus:'ACTIVE'},null),'هنوز وزنی ذخیره نشده');
 assert.equal(c.salesDraftSavedWeight({itemStatus:'CANCELLED'},{deliveredKg:10}),'—');
});
