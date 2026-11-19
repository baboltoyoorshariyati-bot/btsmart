'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const app=read('public/app.js'),ui=read('public/ui2.js'),admin=read('public/admin-ui.js');
const fn=(s,name)=>{const a=s.indexOf('function '+name+'(');return s.slice(a,s.indexOf('\n}',a)+2)};
test('only settlement omits transport/customer location fields',()=>{
 const c={esc:String,plateViewHtml:v=>`<span class="iran-plate">${v}</span>`,fa:v=>String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d])};vm.createContext(c);vm.runInContext(fn(app,'orderCustomerFields')+'\n'+fn(app,'orderCustomerStripHtml'),c);
 const o={orderNo:'000123',customer:{name:'مشتری',phone:'0912',vehicleType:'وانت',plate:'12ب34567',district:'محله نمونه'},dispatchPlace:'ارسال نمونه'};
 const full=c.orderCustomerStripHtml(o),short=c.orderCustomerStripHtml(o,true);assert(short.includes('۰۰۰۱۲۳'));assert.equal(o.orderNo,'000123');
 // v1.1.9 — «محله» از مشخصات مشتری حذف شده؛ «محل ارسال» فروش تنها معیار آدرس است.
 for(const label of ['نوع وسیله','پلاک','محل ارسال']){assert(full.includes(`<b>${label}</b>`));assert(!short.includes(`<b>${label}</b>`));}
 assert(!full.includes('<b>محله</b>'));
 for(const label of ['نام مشتری','شماره تماس','شماره سفارش'])assert(short.includes(`<b>${label}</b>`));
});
test('invoice numbers are Persian without display padding, without changing stored data',()=>{
 const c={esc:String,fa:v=>String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]),n:Number,money:String,qty:String,dt:String,todayText:()=>''};vm.createContext(c);vm.runInContext(fn(ui,'invoiceHtml'),c);
 const o={orderNo:'000456',items:[],payment:{invoiceNumber:'000123',totalAmount:0}};
 const html=c.invoiceHtml(o);assert(html.includes('<b>۱۲۳</b>'));assert(html.includes('<b>۴۵۶</b>'));assert(!html.includes('۰۰۰۱۲۳'));assert.equal(o.orderNo,'000456');assert.equal(o.payment.invoiceNumber,'000123');
});
test('transport navigation replaces standalone dispatch and retains driver and records tabs',()=>{
 const c={};vm.createContext(c);vm.runInContext(fn(admin,'adminNavItems'),c);
 const nav=c.adminNavItems();assert(nav.some(x=>x[0]==='drivers'&&x[1]==='ترابری'));assert(!nav.some(x=>x[0]==='dispatch'));
 const renderer=fn(admin,'renderDriversPage');assert(renderer.includes('transportDispatch'));assert(!renderer.includes('به‌زودی'));assert(renderer.includes("if (!canEditDrivers) adm.tab = 'dispatch';")); // v37.40.0 — پخش هم فهرست رانندگان را می‌بیند
 const dsp=read('public/dispatch-ui.js'),paint=fn(dsp,'paintDispatch');assert(!paint.includes("$('#content').innerHTML"));assert(paint.includes('host.onclick = dspDispatchClick'));
 assert(dsp.includes("if($('#transportDispatch')!==host)return"));
});
