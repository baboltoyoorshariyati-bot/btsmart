'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('public/app.js'),ui=read('public/ui2.js'),css=read('public/form-layout.css');
const source=app.slice(app.indexOf('function orderCustomerFields(o){'),app.indexOf("function stlDispatchControls(o,returnControl='')"));
test('warehouse keeps full customer strip and settlement uses the filtered strip',()=>{
 assert.match(ui,/wh38-sheet-head-compact[\s\S]*?\$\{orderCustomerStripHtml\(o\)\}/);
 assert.match(ui,/return window\.BTSettlementRenderers\.form\(o\)/);
 for(const code of [app]){
  const form=code.slice(code.indexOf('function stlFormHtml(o){'),code.indexOf('function stlFormHtml(o){')+6500);
  assert.match(form,/stl-form-head-inline[\s\S]*?\$\{orderCustomerStripHtml\(o,true\)\}/);
  assert.doesNotMatch(form.slice(0,form.indexOf('</header>')),/data-stl="reopen"/);
 }
 assert.match(css,/\.bt-customer-strip \{[\s\S]*?grid-template-columns:repeat\(var\(--customer-fields\),minmax\(140px,1fr\)\)!important/);
 assert.match(css,/\.bt-customer-field \{[\s\S]*?height:38px!important/);
});
test('all available customer details are retained with escaped text and visit fallback',()=>{
 const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
 const c={esc,fa:v=>String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]),plateViewHtml:v=>`<span class="iran-plate">${esc(v)}</span>`};vm.createContext(c);vm.runInContext(source,c);
 const order={orderNo:'000123',dispatchPlace:'مقصد',visit:{vehicleType:'وانت',district:'بابل'},customer:{name:'<script>نام</script>',code:'C-00001',phone:'09123456789',plate:'12 ب 345 - 67',phone2:'09350000000',nationalId:'1234567890',company:'شرکت',address:'نشانی',notes:'یادداشت'}};
 // v1.1.9 — «محله» پروندهٔ مشتری دیگر نمایش داده نمی‌شود؛ فقط «محل ارسال» فروش می‌ماند.
 const fields=c.orderCustomerFields(order);assert.equal(fields.length,12);
 const values=fields.map(f=>f[1]);for(const value of ['000123','09123456789','09350000000','1234567890','شرکت','نشانی','یادداشت','وانت','مقصد'])assert(values.includes(value));assert(!values.includes('بابل'));
 const html=c.orderCustomerStripHtml(order);assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('iran-plate'));
 assert.equal((html.match(/class="bt-customer-field"/g)||[]).length,12);
 assert.equal(c.orderCustomerFields({customer:{},orderNo:'000001'}).length,7);
});
test('return is beside driver, in the same visual and keyboard order, preserving dispatch guard',()=>{
 const dispatch=app.slice(app.indexOf("function stlDispatchControls(o,returnControl='')"),app.indexOf('function stlEmptyHtml()'));
 assert.match(dispatch,/<\/select>\$\{returnControl\}<button[^>]*data-stl="send-dispatch"/);
 assert.match(dispatch,/const returnControl=dispatched\?'':`<button[^>]*data-stl="reopen"/);
 assert.match(css,/\[data-stl="reopen"\] \{grid-column:2!important;grid-row:1!important\}/);
 assert.match(css,/\[data-stl="send-dispatch"\] \{grid-column:3!important;grid-row:1!important\}/);
 assert.match(css,/\[data-stl="submit"\] \{grid-column:4!important;grid-row:1!important\}/);
});
test('preparing headers are unchanged and settlement queue shows customer/order cards',()=>{
 const list=ui.slice(ui.indexOf('function wh38List(orders,kind)'),ui.indexOf('async function wh38Paint(phase)'));
 assert.match(list,/order-compact-row/);assert.match(list,/data-action="wh38-order-details"/);assert.doesNotMatch(list,/class="wh38-meta"/);
 assert.match(list,/wh38-list wh38-incoming-list/);assert.match(list,/data-action="wh38-start"/);
 assert.match(ui,/stl-queue-item-card/);
 assert.match(css,/overflow-x:hidden!important;overflow-y:auto!important/);
});
