'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const executablePath=process.env.BT_CHROMIUM_PATH;
test('متن تحویل مشتری در فاکتورها و برگه ارسال به‌طور کامل روی A4 چاپ می‌شود',{skip:!executablePath,timeout:45000},async()=>{
 const app=fs.readFileSync('public/app.js','utf8'),ui=fs.readFileSync('public/ui2.js','utf8'),css=fs.readFileSync('public/design.css','utf8')+'\n'+fs.readFileSync('public/invoice-compact.css','utf8');
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ctx=vm.createContext({esc,n:Number,fa:String,qty:String,money:x=>String(x)+' ریال',dt:()=> '۱۴۰۵/۰۹/۰۱ • ۱۰:۳۰'});
 for(const [src,a,b] of [[app,'function settlementMethodLabel(', '// Shared compact'],[ui,'function transportDeliverySignatureHtml(', 'async function transportDraftPreview('],[ui,'function transportShipmentNoteHtml(', 'async function transportShipmentNotePrint('],[ui,'function invoiceHtml(o,paySel){','async function printInvoice(']])vm.runInContext(src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a))),ctx);
 const pay={invoiceNumber:'123456',totalAmount:2000,settlementMethods:[{type:'CASH',amount:2000}]},items=[{id:'item',product:{name:'محصول'},deliveredKg:2,unitPrice:1000,finalAmount:2000}];
 const base={orderNo:'123',customer:{name:'صاحب سفارش',phone:'09121112233'},items,payment:pay};
 const pickup={...base,orderType:'REMOTE',deliveryMode:'PICKUP',pickupHandover:{document:{customerName:'صاحب سفارش',customerPhone:'09121112233',recipient:{name:'نماینده تحویل',phone:'09121112234'},items:[]}}};
 const inv={invoiceNumber:'123456',customerName:'مشتری پخش',customerPhone:'09121112233',priceLines:[{productName:'محصول',deliveredKg:2,unitPrice:1000,amount:2000}],totalAmount:2000};
 const values=[{html:ctx.invoiceHtml(pickup),name:'نماینده تحویل'},{html:ctx.invoiceHtml(base),name:'صاحب سفارش'},{html:ctx.transportDraftInvoiceHtml({orderNo:'123',dispatchPlace:'بابل'},inv),name:'مشتری پخش'},{html:ctx.transportShipmentNoteHtml({orderNo:'123',transportInvoice:inv,transportHandovers:{'0':{driverName:'راننده',document:{items:[]}}}}),name:'مشتری پخش'}];
 const browser=await require('playwright-core').chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{const page=await browser.newPage({viewport:{width:794,height:1123}});await page.emulateMedia({media:'print'});
  for(const {html,name} of values){await page.setContent(`<!doctype html><html dir="rtl"><head><style>${css}\n@page{size:A4;margin:12mm}body{margin:0;font-family:Tahoma,sans-serif}</style></head><body>${html}</body></html>`);
   const declaration=page.locator('.inv38-delivery-declaration, .tr-shipment-signature p');assert.equal(await declaration.count(),1);
   assert.equal((await declaration.innerText()).replace(/\s+/g,' ').trim(),`اینجانب ${name} اقلام فوق را صحیح و سالم تحویل گرفته و اقلام تحویلی به صورت امانت تا زمان پرداخت مبلغی ریالی آن نزد اینجانب می‌باشد.`);
   const m=await declaration.evaluate(el=>{const r=el.getBoundingClientRect();return {scroll:el.scrollWidth,client:el.clientWidth,left:r.left,right:r.right,viewport:innerWidth};});assert(m.scroll<=m.client+1&&m.left>=0&&m.right<=m.viewport,JSON.stringify(m));
   const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true});assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,1);
  }
 }finally{await browser.close();}
});
