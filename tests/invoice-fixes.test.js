'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {ensureInvoiceNumbers,nextInvoiceNumber}=require('../lib/invoice-numbers');
test('invoice migration preserves legacy labels, IDs, audit and unique six digit sequence',()=>{
 const db={payments:[{id:'a',invoiceNumber:'BT-20250101-0001'},{id:'b',invoiceNumber:'000042'},{id:'c',invoiceNumber:'000042'}],counters:{},audit:[{invoiceNumber:'BT-20250101-0001'}]};
 const audit=JSON.stringify(db.audit);assert.equal(ensureInvoiceNumbers(db),2);
 assert.equal(db.payments[0].legacyInvoiceNumber,'BT-20250101-0001');assert.equal(db.payments[0].id,'a');assert.equal(db.payments[1].invoiceNumber,'000042');
 assert.equal(new Set(db.payments.map(p=>p.invoiceNumber)).size,3);assert.equal(ensureInvoiceNumbers(db),0);assert.equal(nextInvoiceNumber(db),'000045');assert.equal(JSON.stringify(db.audit),audit);
 db.counters.invoiceNumber=999999;assert.throws(()=>nextInvoiceNumber(db),/ظرفیت/);
});
test('live price grouping supports Persian/Arabic digits and caret editing',()=>{
 const s=fs.readFileSync('public/app.js','utf8'),c={Intl};vm.createContext(c);
 vm.runInContext(s.match(/function en\(v=''\)\{[^\n]+/)[0],c);
 vm.runInContext(s.slice(s.indexOf('function stlPrice('),s.indexOf('function stlActive(')),c);
 for(const [value,pos,expected] of [['1234567',7,'۱٬۲۳۴٬۵۶۷'],['١٢٣٤',4,'۱٬۲۳۴'],['۱۲۳۴',2,'۱٬۲۳۴'],['',0,'']]){
  const input={value,selectionStart:pos,setSelectionRange(a,b){this.caret=a;assert.equal(a,b)}};
  c.stlFormatPriceInput(input);assert.equal(input.value,expected);assert(input.caret<=input.value.length);
 }
});
test('invoice adjustment rows reconcile subtotal, returns and final amount',()=>{
 const s=fs.readFileSync('public/ui2.js','utf8');const c={esc:String,n:Number,fa:String,qty:String,money:String,dt:String,todayText:()=>''};vm.createContext(c);vm.runInContext(s.slice(s.indexOf('function invoiceHtml('),s.indexOf('async function printInvoice(')),c);
 for(const [total,returns,label,value] of [[90,0,'تخفیفات',10],[110,0,'اضافات',10],[80,20,'کسر مرجوعی',20]]){
  const h=c.invoiceHtml({items:[{finalAmount:100}],payment:{totalAmount:total,returnDeduction:returns}});
  assert(h.includes(`<span>${label}</span><b>${value}</b>`));assert(h.indexOf('جمع اقلام')<h.indexOf('تخفیفات'));assert(h.indexOf('اضافات')<h.indexOf('مبلغ نهایی'));
 }
});
