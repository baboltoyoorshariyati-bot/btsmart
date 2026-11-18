'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const v=require('../lib/validate');
test('complete Iranian gate plates and explicit pedestrian mode',()=>{
 for(const plate of ['۱۲ ب ۳۴۵ - ۶۷','١٢ب٣٤٥-٦٧','12ب34567'])assert.equal(v.gatePlate(plate),'12ب345'+(plate.includes('-')?'-':'')+'67');
 for(const plate of ['', '1ب34567','12ب3467','12ب3456','12ب345678','12A34567'])assert.throws(()=>v.gatePlate(plate));
 assert.equal(v.gatePlate('',true),'');assert.throws(()=>v.gatePlate('12ب34567',true));
});
test('adjustments preserve simultaneous discount and additions and validate money',()=>{
 assert.deepEqual(v.settlementAmounts(100000,{discountAmount:'۱۰٬۰۰۰',additionsAmount:'٥٬٠٠٠'}),{subtotalAmount:100000,discountAmount:10000,additionsAmount:5000,totalAmount:95000});
 for(const value of [-1,1.5,'abc',Infinity,1e13])assert.throws(()=>v.settlementAmounts(100000,{additionsAmount:value}));
 assert.throws(()=>v.settlementAmounts(100000,{discountAmount:100001}));
 assert.equal(v.settlementAmounts(100000).totalAmount,100000);
});
test('frontend plate formatter refuses partial segments',()=>{
 const s=fs.readFileSync('public/app.js','utf8'),c={en:v.digitsToAscii,fa:String};vm.createContext(c);vm.runInContext(s.slice(s.indexOf('function formatPlate(p)'),s.indexOf('\nfunction parsePlate')),c);
 const plate={a:'12',letter:'ب',c:'345',province:'67'};assert(c.formatPlate(plate));
 for(const [key,value] of [['a','1'],['c','34'],['province','6'],['letter',''],['a','123']])assert.equal(c.formatPlate({...plate,[key]:value}),'');
});
test('invoice prints both entered adjustments rather than their net difference',()=>{
 const s=fs.readFileSync('public/ui2.js','utf8'),c={esc:String,n:Number,fa:String,qty:String,money:String,dt:String,todayText:()=>''};vm.createContext(c);vm.runInContext(s.slice(s.indexOf('function invoiceHtml('),s.indexOf('async function printInvoice(')),c);
 const h=c.invoiceHtml({items:[{finalAmount:100000}],payment:{discountAmount:10000,additionsAmount:5000,totalAmount:95000}});
 assert(h.includes('<span>تخفیفات</span><b>10000</b>'));assert(h.includes('<span>اضافات</span><b>5000</b>'));
});
test('dispatch preserves adjustments through approval, returns and final invoice',()=>{
 const store=require('../lib/store'),dispatch=require('../lib/dispatch');
 const original={get:store.get,save:store.save,audit:store.audit,nextInvoiceNumber:store.nextInvoiceNumber};
 const db={drivers:[{id:'driver',isActive:true,fullName:'راننده'}],products:[{id:'product',name:'مرغ'}],orderItems:[{id:'item',orderId:'order',productId:'product',deliveredKg:10,itemStatus:'DELIVERED'}],payments:[],notifications:[]};
 Object.assign(store,{get:()=>db,save:()=>{},audit:()=>{},nextInvoiceNumber:()=> '000001'});
 try{
  const order={id:'order',status:'SETTLEMENT_PENDING'},user={id:'sales',username:'sales'};
  dispatch.sendToDispatch(user,order,'driver',[{itemId:'item',unitPrice:10000}],{}, {discountAmount:10000,additionsAmount:5000});
  assert.equal(order.dispatch.approvedTotalAmount,95000);
  order.dispatch.lines=[{itemId:'item',deliveredKg:10,grossAmount:100000,returnKg:1}];
  dispatch.applyReturnToInvoice(order);assert.equal(order.dispatch.amountDue,85000);
  order.dispatch.status='DELIVERED';dispatch.salesFinalizeDelivery(user,order,{});
  assert.equal(db.payments[0].discountAmount,10000);assert.equal(db.payments[0].additionsAmount,5000);assert.equal(db.payments[0].totalAmount,85000);
  dispatch.applyReturnToInvoice(order);assert.equal(db.payments[0].totalAmount,85000);
 }finally{Object.assign(store,original)}
});

test('settlement adjustments are compact stacked rows below items in both renderers',()=>{
 const css=fs.readFileSync('public/form-layout.css','utf8');
 assert.match(css,/\.stl-adjustments\{[^}]*flex-direction:column[^}]*width:280px[^}]*max-width:100%/);
 assert.match(css,/\.stl-adjustments input\.stl-input\{[^}]*height:32px/);
 assert.match(fs.readFileSync('public/ui2.js','utf8'),/return window\.BTSettlementRenderers\.form\(o\)/);
 for(const file of ['public/app.js']){
  const source=fs.readFileSync(file,'utf8');
  const start=source.indexOf('function stlFormHtml(o)');
  const form=source.slice(start,source.indexOf('\n}',start));
  assert(form.indexOf('${stlAdjustmentsHtml(o)}')>form.indexOf('stl.items.map(stlRowHtml)'));
  assert(form.includes('class="stl-totals stl-financial-column"'));
  assert(form.includes('class="stl-verification-column"'));
 }
});
