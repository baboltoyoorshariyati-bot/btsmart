'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const executablePath=process.env.BT_CHROMIUM_PATH;
test('برگه ارسال اصلاح‌شده در چاپ A4 یک‌صفحه‌ای و چندصفحه‌ای بدون سرریز افقی است',{skip:!executablePath,timeout:60000},async()=>{
 const {chromium}=require('playwright-core');
 const src=fs.readFileSync(path.join(__dirname,'../ui-src/ui2/08-transport-invoices.js'),'utf8');
 const ctx=vm.createContext({esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),fa:String,qty:String,money:n=>`${n} ریال`,dt:()=> '۱۴۰۵/۰۹/۰۱ • ۱۰:۳۰'});
 vm.runInContext(src.slice(src.indexOf('function transportShipmentNoteHtml('),src.indexOf('async function transportShipmentNotePrint(')),ctx);
 const css=fs.readFileSync(path.join(__dirname,'../public/design.css'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../public/invoice-compact.css'),'utf8');
 const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:794,height:1123}});await page.emulateMedia({media:'print'});
  for(const count of [1,100]){
   const lines=Array.from({length:count},(_,i)=>({productName:`محصول آزمایشی ${i+1}`,deliveredKg:10,unitPrice:100000,amount:1000000}));
   const order={orderNo:'123456',dispatchPlace:'بابلسر',transportInvoice:{invoiceNumber:'1001',customerName:'مشتری نمونه',customerPhone:'09120000000',createdAt:'2026-11-01',priceLines:lines,totalAmount:1000000*count},transportHandovers:{'0':{driverName:'راننده نمونه',document:{items:[]}}}};
   const html=ctx.transportShipmentNoteHtml(order);
   await page.setContent(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>${css}\n@page{size:A4;margin:12mm}body{margin:0;font-family:Tahoma,sans-serif}</style></head><body>${html}</body></html>`);
   const layout=await page.evaluate(()=>{const root=document.querySelector('.tr-shipment-note'),r=root.getBoundingClientRect(),els=[...root.querySelectorAll('*')];return {left:r.left,right:r.right,width:r.width,bad:els.filter(e=>{const b=e.getBoundingClientRect();return b.left<r.left-1||b.right>r.right+1||e.scrollWidth>e.clientWidth+1}).map(e=>e.outerHTML.slice(0,100)),signature:document.querySelector('.tr-shipment-signature').getBoundingClientRect().left,totals:document.querySelector('.tr-shipment-totals').getBoundingClientRect().left,rows:document.querySelectorAll('.tr-shipment-table tbody tr').length};});
   assert.deepEqual(layout.bad,[],JSON.stringify(layout));assert(layout.signature>layout.totals,'امضا سمت راست مبالغ است');assert.equal(layout.rows,count+1);
   const pdf=await page.pdf({format:'A4',preferCSSPageSize:true,printBackground:true});const pages=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
   assert(count===1?pages===1:pages>1,`rows=${count} pages=${pages}`);
   if(process.env.BT_SHIPMENT_PDF_DIR)fs.writeFileSync(path.join(process.env.BT_SHIPMENT_PDF_DIR,`shipment-${count}.pdf`),pdf);
  }
 }finally{await browser.close();}
});
