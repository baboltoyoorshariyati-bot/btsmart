'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/ui2.js'),'utf8');
const invoiceCss=fs.readFileSync(path.join(__dirname,'../public/invoice-compact.css'),'utf8');
function fragment(start,end){return source.slice(source.indexOf(start),source.indexOf(end));}
const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
test('سند انبار پخش فقط امضای راننده دارد و سند مشتری مستقل می‌ماند',()=>{
 const ctx=vm.createContext({esc:escape,fa:x=>x,qty:x=>x,formatDateTime24:()=> 'تاریخ'});
 vm.runInContext(fragment('function whSealDocument(numbers){','function wh38Sheet(o){'),ctx);vm.runInContext(fragment('function whDocumentTares(line){','async function whDeliveredDetails(id){'),ctx);
 const base={orderNo:'001',warehouseDocumentNo:'W-000001',customerName:'مشتری',customerPhone:'09',items:[]};
 const html=ctx.whDeliveredDocument({...base,deliveryMode:'DELIVERY',driverName:'<راننده>',driverPhone:'0912'});
 assert.doesNotMatch(html,/امضاء مشتری/);assert.match(html,/امضاء راننده پخش هنگام دریافت از انبار/);assert.match(html,/&lt;راننده&gt;/);assert.doesNotMatch(html,/امانت/);
 const sealed=ctx.whDeliveredDocument({...base,sealNumbers:['001','<script>']});assert.match(sealed,/001/);assert.match(sealed,/&lt;script&gt;/);assert.doesNotMatch(sealed,/<script>/);
 const old=ctx.whDeliveredDocument(base);assert.doesNotMatch(old,/شماره پلمپ/);assert.doesNotMatch(old,/راننده/);assert.match(old,/نام و امضاء مشتری/);
});
test('قیمت فاکتور پیش‌ازخروج از فهرست امروز بر اساس محصول همان قلم پیش‌فرض می‌شود',()=>{
 const fa=s=>String(s).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
 const ctx=vm.createContext({stl:{priceMap:{p01:123456}},fa});
 vm.runInContext(fragment('function transportInvoicePriceDefault(', 'function transportSalesInvoicePanel('),ctx);
 const order={items:[{id:'i1',productId:'p01',unitPrice:45000},{id:'i2',productId:'p02',unitPrice:45000}]};
 assert.equal(ctx.transportInvoicePriceDefault(order,{itemId:'i1'}),'۱۲۳٬۴۵۶');
 assert.equal(ctx.transportInvoicePriceDefault(order,{itemId:'i2'}),'۴۵٬۰۰۰');
 ctx.stl.priceMap.p01=0;assert.equal(ctx.transportInvoicePriceDefault(order,{itemId:'i1'}),'','zero current price must not revive an older item price');
});
test('تحویل با تأیید فیزیکی ثبت و سند بلافاصله برای چاپ ارسال می‌شود',async()=>{
 const calls=[];let confirmed=false,fail=false;const ctx=vm.createContext({confirm:()=>confirmed,api:async(...args)=>{calls.push(args);if(fail)throw Error('network');return {handover:{document:{warehouseDocumentNo:'W-1'}}};},closeModal:()=>calls.push('close'),toast:x=>calls.push(x),whPrintDocument:(doc,run)=>calls.push(['print',doc,run]),whDeliveredLoad:async()=>calls.push('regular'),loadWhStoreDocuments:async()=>calls.push('store'),encodeURIComponent,JSON});
 vm.runInContext(fragment('async function whTransportHandover(','function whPrintDocument('),ctx);
 const btn={disabled:false};await ctx.whTransportHandover(btn,'o',0,'token');assert.equal(calls.length,0);assert.equal(btn.disabled,false);
 confirmed=true;await ctx.whTransportHandover(btn,'o',0,'token');assert.equal(btn.disabled,true);assert.equal(calls[0][0],'/api/warehouse/transport-handovers/o');assert.deepEqual(JSON.parse(calls[0][1].body),{run:0,handoverToken:'token',physicalHandoverConfirmed:true});assert(calls.some(x=>Array.isArray(x)&&x[0]==='print'&&x[2]===0));assert(calls.includes('regular'));
 calls.length=0;const btn2={disabled:false};await ctx.whTransportHandover(btn2,'o',2,'token2');assert(calls.includes('store'));assert(calls.some(x=>Array.isArray(x)&&x[0]==='print'&&x[2]===2));
 calls.length=0;fail=true;const btn3={disabled:false};await ctx.whTransportHandover(btn3,'o',0,'token');assert.equal(btn3.disabled,false);assert(!calls.some(x=>Array.isArray(x)&&x[0]==='print'));assert(!calls.includes('close'));
});
test('ثبت تحویل در کارتابل انبار برای مدیر و انبار مجاز است',()=>{
 const ctx=vm.createContext({app:{page:'warehouse',user:{roleCode:'admin'}},normalizeRole:x=>x});vm.runInContext(fragment('function whCanRegisterHandover(){','async function whDeliveredDetails(id){'),ctx);
 assert.equal(ctx.whCanRegisterHandover(),true);ctx.app.user.roleCode='warehouse';assert.equal(ctx.whCanRegisterHandover(),true);ctx.app.user.roleCode='sales';assert.equal(ctx.whCanRegisterHandover(),false);ctx.app.user.roleCode='admin';ctx.app.page='sales';assert.equal(ctx.whCanRegisterHandover(),false);
});
test('فاکتور پخش سربرگ شش‌فیلدی، متن تحویل و محل امضای مشتری را به‌شکل فشرده چاپ می‌کند',()=>{
 const ctx=vm.createContext({esc:escape,fa:x=>x,qty:x=>x,money:x=>String(x),dt:()=> 'تاریخ'});
 vm.runInContext(fragment('function transportDeliverySignatureHtml(', 'async function transportDraftPreview(id){'),ctx);
 const html=ctx.transportDraftInvoiceHtml({orderNo:'123',dispatchPlace:'نشانی <مشتری>'},{invoiceNumber:'456',customerName:'<مشتری>',customerPhone:'09',driverName:'<راننده>',priceLines:[{productName:'<کالا>',deliveredKg:2,unitPrice:1000,amount:2000}],subtotalAmount:2000,discountAmount:300,additionsAmount:50,totalAmount:1750});
 for(const label of ['نام مشتری','شماره تماس','محل ارسال','شماره سفارش','شماره فاکتور','تاریخ'])assert(html.includes(`<span>${label}</span>`),label);
 assert.doesNotMatch(html,/فاکتور فروش/);assert.match(html,/<div class="inv38-distribution-contacts"><div><span>نام مشتری<\/span>[\s\S]*?<\/div><div><span>شماره تماس<\/span>/);
 assert.doesNotMatch(html,/inv38-brand|<img/);assert.match(html,/نشانی &lt;مشتری&gt;/);assert.match(html,/inv38-delivery-signature-line/);assert.match(html,/<span>محل امضا<\/span>/);assert.match(html,/اینجانب <strong>&lt;مشتری&gt;<\/strong> اقلام فوق را صحیح و سالم تحویل گرفته و اقلام تحویلی به صورت امانت تا زمان پرداخت مبلغی ریالی آن نزد اینجانب می‌باشد\./);assert.match(html,/<small>نام مشتری<\/small>/);assert.match(html,/&lt;کالا&gt;/);assert.match(html,/1750/);
});
test('فاکتور بسته‌شده و فاکتور پخش، ارقام مالی و سربرگ و امضای تحویل را درست نشان می‌دهند',()=>{
 const ctx=vm.createContext({esc:escape,fa:x=>x,qty:x=>x,money:x=>String(x),dt:()=> 'تاریخ',n:x=>Number(x||0)});
 const core=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');vm.runInContext(core.slice(core.indexOf('function settlementMethodLabel('),core.indexOf('// Shared compact')),ctx);
 vm.runInContext(fragment('function transportDeliverySignatureHtml(', '// The distribution invoice'),ctx);
 vm.runInContext(fragment('function invoiceHtml(o,paySel){','async function printInvoice(id,run){'),ctx);
 const base={transportWorkflow:1,transportInvoice:{priceLines:[{productName:'کالا',deliveredKg:2,unitPrice:1000,amount:2000}]},transportReturn:{outcome:'NOT_DELIVERED'},items:[]};
 const html=ctx.invoiceHtml(base,{totalAmount:0,discountAmount:300,additionsAmount:50,returnDeduction:1750,settlementMethods:[]});
 assert.match(html,/جمع اقلام<\/span><b>2000/);assert.match(html,/کسر مرجوعی<\/span><b>1750/);assert.doesNotMatch(html,/<span>وضعیت<\/span>/);assert.match(html,/مبلغ پرداختی<\/span><b>0/);assert.doesNotMatch(html,/جزئیات روش پرداخت ثبت نشده/);
 const pending=ctx.invoiceHtml({...base,transportReturn:{outcome:'DELIVERED'}},{totalAmount:1750,discountAmount:300,additionsAmount:50,settlementMethods:[{type:'CHECK',amount:1750,checkStatus:'PENDING'}],debtAccount:{initial:1750,receipts:[{amount:1750,status:'PENDING'}]}});
 const delivery=ctx.invoiceHtml({...base,deliveryMode:'DELIVERY',dispatchPlace:'مقصد <نمونه>',orderNo:'123',customer:{name:'مشتری واقعی',phone:'0912'},transportHandovers:{'0':{driverName:'روح الله گلی'}}},{invoiceNumber:'456',totalAmount:0,settlementMethods:[]});
 for(const label of ['نام مشتری','شماره تماس','محل ارسال','شماره سفارش','شماره فاکتور','تاریخ'])assert(delivery.includes(`<span>${label}</span>`),label);
 assert.doesNotMatch(delivery,/فاکتور فروش/);assert.match(delivery,/<div class="inv38-distribution-contacts"><div><span>نام مشتری<\/span>[\s\S]*?<\/div><div><span>شماره تماس<\/span>/);
 assert.match(delivery,/مقصد &lt;نمونه&gt;/);assert.match(delivery,/inv38-distribution/);assert.doesNotMatch(delivery,/inv38-brand|<img/);assert.match(delivery,/inv38-delivery-signature-line/);assert.match(delivery,/اینجانب <strong>مشتری واقعی<\/strong> اقلام فوق را صحیح و سالم تحویل گرفته و اقلام تحویلی به صورت امانت تا زمان پرداخت مبلغی ریالی آن نزد اینجانب می‌باشد\./);assert.match(delivery,/<strong>مشتری واقعی<\/strong>/);assert.match(delivery,/<small>نام مشتری<\/small>/);
 assert.match(pending,/مبلغ پرداختی<\/span><b>0/);assert.match(pending,/مانده حساب<\/span><b>1750/);
});
test('محاسبه فرم فروش با مرجوعی جزئی و کامل مطابق فاکتور است و وزن نامعتبر رد می‌شود',()=>{
 const ctx=vm.createContext({en:s=>String(s).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))});
 vm.runInContext(fragment('function transportClosureAmount(invoice,rows){','function transportPaymentRowHtml('),ctx);
 const invoice={totalAmount:1750,priceLines:[{deliveredKg:2,unitPrice:1000}]};
 assert.equal(ctx.transportClosureAmount(invoice,['۰']),1750);assert.equal(ctx.transportClosureAmount(invoice,['۰٫۵']),1250);assert.equal(ctx.transportClosureAmount(invoice,['1.9']),0);assert.equal(ctx.transportClosureAmount(invoice,['۲']),0);
 for(const bad of ['','-1','2.001','1.0001','1kg','NaN'])assert.equal(ctx.transportClosureAmount(invoice,[bad]),null,bad);
});
test('فرم پرداخت پخش مدارک و امضای اضافی ندارد و مرجوعی با یک تیک فعال می‌شود',()=>{
 const ctx=vm.createContext({esc:escape,fa:x=>x,qty:x=>x,money:x=>String(x)});
 vm.runInContext(fragment('function transportClosureFormHtml(order){','function transportClosureAmount(invoice,rows){'),ctx);
 const html=ctx.transportClosureFormHtml({transportInvoice:{totalAmount:1750,priceLines:[{itemId:'item',productName:'کالا',deliveredKg:2,unitPrice:1000}]}});
 assert.match(html,/data-ts-returns/);assert.match(html,/مرجوعی دارد/);assert.match(html,/data-ts-add>افزودن روش پرداخت/);
 assert.doesNotMatch(html,/documentsReturned|customerSignatureOnPaper|امضای دستی|تأیید بازگشت مدارک|data-ts-signature|name="documents"/);
 const panel=fragment('function transportSalesInvoicePanel(order,','function transportClosureFormHtml(order){');
 assert.doesNotMatch(panel,/data-ti-preview|چاپ مجدد فاکتور/);assert.match(panel,/data-ti-shipment-print/);
});
test('ثبت پرداختی بدون تأیید مضاعف، با مرجوعی اختیاری یا بدون مرجوعی',async()=>{
 async function submit({returnsEnabled,returnKg,amount}){
  const submitted=[],kg={value:returnKg,addEventListener(){}},reason={value:'مرجوعی اختیاری'},line={dataset:{id:'item'},querySelector:s=>s==='[data-ts-kg]'?kg:reason};
  const amountInput={value:String(amount)},type={value:'CASH'},extra={value:''},error={textContent:''},total={textContent:''},sum={textContent:''},button={disabled:false},toggle={checked:returnsEnabled},fields={hidden:!returnsEnabled};
  const payment={querySelector:s=>({'[data-ts-type]':type,'[data-ts-amount]':amountInput,'[data-ts-device]':extra,'[data-ts-reference]':extra,'[data-ts-bank]':extra,'[data-ts-check]':extra,'[data-ts-due]':extra}[s]||null)};
  const paymentHost={querySelectorAll:()=>[payment]};
  const add={};
  const form={onsubmit:null,querySelectorAll:s=>s==='[data-ts-line]'?[line]:s==='[data-ts-kg]'?[kg]:s==='[data-ts-payrow]'?[payment]:[],querySelector:s=>({'[data-ts-payments]':paymentHost,'[data-ts-total]':total,'[data-ts-sum]':sum,'[data-ts-add]':add,'[data-ts-error]':error,'[type=submit]':button,'[data-ts-returns]':toggle,'[data-ts-return-fields]':fields})[s]||null};
  const ctx=vm.createContext({en:s=>String(s).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)),money:x=>String(x),stl:{devices:[]},app:{salesCache:{fetchedAt:1}},api:async(...args)=>{submitted.push(args);return{};},confirm:()=>{throw Error('نباید تأیید اضافه بخواهد');},toast:()=>{},stlClose:()=>{},renderSales:async()=>{},encodeURIComponent,JSON});
  vm.runInContext(fragment('function transportClosureAmount(invoice,rows){','function invoiceHtml(o,paySel){'),ctx);
  const order={id:'x',transportInvoice:{totalAmount:1750,priceLines:[{itemId:'item',deliveredKg:2,unitPrice:1000}]}};
  ctx.bindTransportClosure({querySelector:s=>s==='[data-ts-close]'?form:null},order);
  await form.onsubmit({preventDefault(){}});
  assert.equal(error.textContent,'');assert.equal(submitted.length,1);assert.equal(submitted[0][0],'/api/sales/transport-invoices/x/close');
  return JSON.parse(submitted[0][1].body);
 }
 assert.deepEqual(await submit({returnsEnabled:false,returnKg:'۰',amount:1750}),{returns:[],settlementMethods:[{type:'CASH',amount:1750,deviceId:'',reference:'',bank:'',checkNumber:'',dueDate:''}]});
 assert.deepEqual(await submit({returnsEnabled:true,returnKg:'۰٫۵',amount:1250}),{returns:[{itemId:'item',returnKg:'0.5',reason:'مرجوعی اختیاری'}],settlementMethods:[{type:'CASH',amount:1250,deviceId:'',reference:'',bank:'',checkNumber:'',dueDate:''}]});
});
test('ورود مبلغ پخش ارقام فارسی، انگلیسی و عربی را بدون پنهان کردن متن نامعتبر می‌پذیرد',()=>{
 const en=s=>String(s).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
 const fa=s=>String(s).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);const ctx=vm.createContext({en,fa});vm.runInContext(fragment('function transportMoneyNumber(value){','function transportPaymentRowHtml('),ctx);
 for(const s of ['1234567','۱٬۲۳۴٬۵۶۷','١,٢٣٤,٥٦٧','1 234 567'])assert.equal(ctx.transportMoneyNumber(s),1234567,s);
 for(const s of ['123x','-3','۱٫۲','9007199254740992',','])assert.equal(ctx.transportMoneyNumber(s),null,s);
 const field={value:'1234567',selectionStart:4,setSelectionRange(a,b){this.caret=[a,b]},setCustomValidity(message){this.validity=message}};ctx.transportFormatMoneyInput(field);assert.equal(field.value,'۱٬۲۳۴٬۵۶۷');assert.deepEqual(field.caret,[5,5]);assert.equal(field.validity,'');field.value='12x3';field.selectionStart=3;ctx.transportFormatMoneyInput(field);assert.equal(field.value,'12x3');assert.match(field.validity,/عدد معتبر/);
});

test('نام صاحب سفارش در اقرار تحویل تکرار نمی‌شود و نام‌ها بدون پرانتز بولد و زیرخط‌دار هستند',()=>{
 const ctx=vm.createContext({esc:escape,fa:x=>x,qty:x=>x,formatDateTime24:()=>''});vm.runInContext(fragment('function whSealDocument(numbers){','function wh38Sheet(o){'),ctx);vm.runInContext(fragment('function whDocumentTares(line){','async function whDeliveredDetails(id){'),ctx);
 const base={deliveryMode:'PICKUP',customerName:'مالک',customerPhone:'0912',recipient:{name:'مالک',phone:'0912'},items:[]};
 const declaration=ctx.whDeliveredDocument(base,true).match(/class="whd-declaration">(.*?)<\/p>/)[1];assert.equal((declaration.match(/مالک/g)||[]).length,1);assert.match(declaration,/<strong style="text-decoration:underline/);assert.doesNotMatch(declaration,/[()]/);
 const otherHtml=ctx.whDeliveredDocument({...base,orderType:'REMOTE',recipient:{name:'نماینده',phone:'0913'}},true),other=otherHtml.match(/class="whd-declaration">(.*?)<\/p>/)[1];assert.match(other,/نماینده/);assert.doesNotMatch(other,/مالک/);assert.match(otherHtml,/مالک/);assert.match(other,/اقلام فوق را صحیح و سالم تحویل گرفته و اقلام تحویلی به صورت امانت تا زمان پرداخت مبلغی ریالی آن نزد اینجانب می‌باشد/);
});

test('فاکتور پخش، متن تحویل را تمام‌عرض نگه می‌دارد و امضا نسبت به تسویه و جمع عریض‌تر است',()=>{
 assert.match(invoiceCss,/\.inv38-compact\.inv38-distribution \.inv38-with-payments\{grid-template-columns:minmax\(0,1\.4fr\) minmax\(0,1fr\) minmax\(0,1fr\)\}/);
 assert.match(invoiceCss,/\.inv38-compact \.inv38-delivery-signature\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
 assert.match(invoiceCss,/\.inv38-compact \.inv38-delivery-declaration\{grid-column:1\/\-1;width:100%;[^}]*text-align:right/);
 assert.match(invoiceCss,/\.inv38-compact\.inv38-distribution \.inv38-distribution-meta>\.inv38-distribution-contacts\{[^}]*grid-template-columns:minmax\(0,1\.25fr\) minmax\(0,1fr\)/);
 assert.match(invoiceCss,/\.inv38-compact\.inv38-distribution \.inv38-distribution-meta>\.inv38-distribution-contacts\{[^}]*grid-column:1\/\-1/);
});
test('برگه ارسال از قالب تأییدشده و بدون اطلاعات حذف‌شده استفاده می‌کند',()=>{
 const ctx=vm.createContext({esc:escape,fa:x=>x,qty:x=>x,money:x=>String(x),dt:()=>'۱۴۰۳/۰۱/۰۱ • ۱۰:۰۰'});
 vm.runInContext(fragment('function transportShipmentNoteHtml(','async function transportShipmentNotePrint('),ctx);
 const order={orderNo:'123',dispatchPlace:'مقصد <نمونه>',transportInvoice:{invoiceNumber:'456',customerName:'<مشتری>',customerPhone:'0912',createdAt:'2024-01-01',priceLines:[{productName:'کالا',deliveredKg:2,unitPrice:1000,amount:2000}],discountAmount:0,additionsAmount:0,totalAmount:2000},transportHandovers:{'0':{driverName:'<راننده>',vehicleType:'کامیون',vehiclePlate:'۱۱ب۲۲۲',document:{warehouseDocumentNo:'W-9',items:[]}}}};
 const note=ctx.transportShipmentNoteHtml(order);
 for(const label of ['نام مشتری','شماره تماس','شماره سفارش','شماره فاکتور','راننده تحویل','محل تحویل','تاریخ','محصول','وزن ارسالی','قیمت هر کیلو','مبلغ','جمع اقلام','تخفیفات','اضافات','مبلغ فاکتور','جمع وزن ارسالی','محل امضا'])assert(note.includes(label),label);
 for(const removed of ['برگه ارسال پخش','همراه محموله','خودرو و پلاک','سند انبار','W-9','نام مشتری</small>','۱۰:۰۰'])assert(!note.includes(removed),removed);
 assert.match(note,/اینجانب <strong>&lt;مشتری&gt;<\/strong> اقلام فوق را صحیح و سالم تحویل گرفته و اقلام تحویلی به صورت امانت تا زمان پرداخت مبلغی ریالی آن نزد اینجانب می‌باشد\./);assert.doesNotMatch(note,/تأیید می‌کنم اقلام فوق توسط راننده/);assert.match(note,/&lt;مشتری&gt;/);assert.match(note,/&lt;راننده&gt;/);assert.match(note,/مقصد &lt;نمونه&gt;/);
 assert.match(note,/tr-shipment-bottom"><div class="tr-shipment-signature"/);assert.match(note,/1000/);assert.match(note,/2000/);
});
