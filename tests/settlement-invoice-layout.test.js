'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('public/app.js'),ui=read('public/ui2.js'),css=read('public/invoice-compact.css'),tableCss=read('public/compatibility.css');
test('settlement footer is shared and contains driver, send and invoice in RTL DOM order',()=>{
 const footer=app.slice(app.indexOf('function stlFooterHtml(o)'),app.indexOf('function stlEmptyHtml()'));
 assert(footer.indexOf('${stlDispatchControls(o,returnControl)}')<footer.indexOf('data-stl="submit"'));
 assert.match(footer,/dispatched\?'':`<button/); // No onsite invoice when dispatched.
 assert.match(ui,/return window\.BTSettlementRenderers\.form\(o\)/);
 for(const source of [app]){
  const form=source.slice(source.indexOf('function stlFormHtml(o){'),source.indexOf('function stlFormHtml(o){')+6500);
  assert.match(form,/\$\{stlFooterHtml\(o\)\}/);
  const header=form.slice(0,form.indexOf('</header>'));
  assert.doesNotMatch(header,/stlDispatchControls\(o\)/);
 }
 const layout=read('public/compatibility.css');
 assert.match(layout,/min-width:0!important;width:100%;grid-template-columns:repeat\(2/);
 assert.match(layout,/@container stl \(max-width:520px\)/);
 assert.match(layout,/grid-column:auto!important;grid-row:auto!important/);
 assert.match(layout,/@container stl \(min-width:850px\)/);
});
test('settlement invoice table gives operations more room and keeps desktop button labels unwrapped',()=>{
 assert.match(tableCss,/:is\(th,td\):nth-child\(6\)\{width:24%\}/);
 assert.match(tableCss,/:is\(th,td\):nth-child\(7\)\{width:25%\}/);
 assert.match(tableCss,/@media\(max-width:900px\)[\s\S]*?:is\(th,td\):nth-child\(6\)\{width:29%\}[\s\S]*?:is\(th,td\):nth-child\(7\)\{width:25%\}/);
 assert.match(tableCss,/@media\(min-width:601px\)[\s\S]*?grid-template-columns:repeat\(auto-fit,minmax\(108px,1fr\)\)/);
 assert.match(tableCss,/toolbar \.btn\{width:100%;max-width:100%;min-width:0!important;flex:none!important;white-space:nowrap!important/);
});
test('pickup invoice header keeps each label and value on one horizontal line',()=>{
 assert.match(css,/inv38-pickup-recipient-meta>div\{display:flex;flex-direction:row/);
 assert.match(css,/inv38-pickup-recipient-meta span\{flex:0 0 auto;[^}]*white-space:nowrap/);
 assert.match(css,/inv38-pickup-recipient-meta b\{display:inline-block;[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
});
test('compact invoice preview and print share a served stylesheet; no sales approval block',()=>{
 const invoice=ui.slice(ui.indexOf('function invoiceHtml(o,paySel){'),ui.indexOf('async function printInvoice(id,run)'));
 assert.match(invoice,/inv38-sheet inv38-compact/);
 assert.doesNotMatch(invoice,/inv38-sales-sign|تأیید واحد فروش|inv38-cust-under/);
  assert.match(invoice,/شماره سفارش[\s\S]*?o\.orderNo/);
  assert.doesNotMatch(invoice,/کد سریع|quickCode/,'کد سریع محصول نباید در پیش‌نمایش یا چاپ فاکتور باشد');
 assert.match(read('public/index.html'),/href="\/invoice-compact\.css\?v=37\.3\.22"/);
 assert.match(read('public/invoice-print.html'),/href="\/invoice-compact\.css\?v=37\.3\.22"/);
 assert.match(ui.slice(ui.indexOf('async function printInvoice(id,run)')),/openInvoicePrint/);
 assert.match(read('lib/http.js'),/'\/invoice-compact\.css': \{ file: 'invoice-compact\.css'/);
 assert.match(css,/\.inv38-bottom \{[\s\S]*?direction:rtl/);
 assert.match(css,/@media print/);
});
for(const [name,text,end] of [['app',app,'function printCss()'],['ui',ui,'async function printInvoice(id,run)']]) test(`${name}: both invoices show escaped customer contact at the former signature position`,()=>{
 const source=text.slice(text.indexOf('function invoiceHtml(o,paySel){'),text.indexOf(end,text.indexOf('function invoiceHtml(o,paySel){')));
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
 const c={esc:escape,n:Number,fa:String,qty:String,money:String,dt:String,todayText:()=> 'today',storeRunInvoiceLines:()=>[{productName:'مرغ فروشگاه',deliveredKg:5}]};
 vm.createContext(c);vm.runInContext(source,c);
 const base={id:'uuid-internal',orderNo:'000456',customer:{name:'جدید',phone:'0999'},items:[{product:{name:'مرغ'},deliveredKg:12,unitPrice:20,finalAmount:240},{product:{name:'لغوشده'},itemStatus:'CANCELLED',finalAmount:999}],payment:{totalAmount:240,customerName:'<مشتری>',customerPhone:'0912',signatureData:'data:image/png;base64,signature',fingerprintRef:'ref-123',verificationMode:'FINGERPRINT'}};
 for(const o of [base,{...base,orderType:'STORE',storeName:'فروشگاه'}]){
  const html=c.invoiceHtml(o);assert.match(html,/<div class="inv38-verify">[\s\S]*?<span>امضاء<\/span><strong>&lt;مشتری&gt; – 0912<\/strong>/);
  assert(!html.includes('signature'));assert(!html.includes('ref-123'));assert(!html.includes('اثر انگشت'));assert(!html.includes('تأیید مشتری'));
  assert(html.includes(name==='ui'&&o.orderType!=='STORE'?'<b>456</b>':'000456'));assert(!html.includes('uuid-internal'));assert(!html.includes('inv38-foot'));assert(!html.includes('تاریخ صدور'));
 }
 const legacy=c.invoiceHtml({...base,payment:{totalAmount:240}});assert(legacy.includes('جدید – 0999'));
 const missing=c.invoiceHtml({...base,customer:null,payment:{totalAmount:240,customerName:'',customerPhone:''}});assert(missing.includes('— – —'));
});
