'use strict';
// Workbooks are parsed locally: the server receives only validated product rows.
let productExcelLibrary;
function loadProductExcelLibrary() {
  if (window.ExcelJS) return Promise.resolve();
  if (!productExcelLibrary) productExcelLibrary=new Promise((resolve,reject)=>{
    const script=document.createElement('script'); script.src='/vendor/exceljs-4.4.0.min.js';
    script.onload=resolve; script.onerror=()=>reject(Error('کتابخانه اکسل بارگذاری نشد.'));document.head.appendChild(script);
  }).catch(error=>{productExcelLibrary=null;throw error;});
  return productExcelLibrary;
}
// Reject unusually large ZIP directories before handing the archive to ExcelJS.
function productExcelCheckZip(buffer) {
  const v=new DataView(buffer), len=v.byteLength;
  if (len<22 || v.getUint32(0,true)!==0x04034b50) throw Error('فایل XLSX معتبر نیست.');
  let end=-1;
  for(let i=len-22;i>=Math.max(0,len-65557);i--) if(v.getUint32(i,true)===0x06054b50 && i+22+v.getUint16(i+20,true)===len){end=i;break;}
  if(end<0) throw Error('ساختار فایل اکسل معتبر نیست.');
  const count=v.getUint16(end+10,true), size=v.getUint32(end+12,true), start=v.getUint32(end+16,true);
  if(v.getUint16(end+4,true)!==0||v.getUint16(end+6,true)!==0||v.getUint16(end+8,true)!==count||count>512||start+size!==end) throw Error('ساختار فایل اکسل پشتیبانی نمی‌شود.');
  let p=start,total=0;
  for(let i=0;i<count;i++){
    if(p+46>end||v.getUint32(p,true)!==0x02014b50) throw Error('ساختار فایل اکسل معتبر نیست.');
    const flags=v.getUint16(p+8,true), compressed=v.getUint32(p+20,true), expanded=v.getUint32(p+24,true), local=v.getUint32(p+42,true);
    const next=p+46+v.getUint16(p+28,true)+v.getUint16(p+30,true)+v.getUint16(p+32,true);
    if(flags&1 || compressed===0xffffffff || expanded===0xffffffff || local>=start || next>end) throw Error('فایل رمزدار یا بزرگ پشتیبانی نمی‌شود.');
    total+=expanded; if(total>20*1024*1024 || expanded>10*1024*1024) throw Error('حجم محتوای فایل اکسل بیش از حد مجاز است.');
    p=next;
  }
  if(p!==end) throw Error('ساختار فایل اکسل معتبر نیست.');
}
function productExcelValue(cell, row) {
  const v=cell.value;
  if(v===null || v===undefined) return '';
  if(typeof v==='string'||typeof v==='number') return v;
  throw Error(`در ردیف ${row} فقط متن یا عدد ساده مجاز است؛ فرمول و پیوند پذیرفته نمی‌شوند.`);
}
async function productExcelRead(file) {
  if(!file || !/\.xlsx$/i.test(file.name) || file.size>2*1024*1024) throw Error('یک فایل XLSX با حجم حداکثر ۲ مگابایت انتخاب کنید.');
  const bytes=await file.arrayBuffer(); productExcelCheckZip(bytes);
  await loadProductExcelLibrary();
  const workbook=new ExcelJS.Workbook();
  try { await workbook.xlsx.load(bytes); } catch { throw Error('خواندن فایل اکسل ناموفق بود.'); }
  if(workbook.worksheets.length!==1) throw Error('فایل باید دقیقاً یک برگه داشته باشد.');
  const sheet=workbook.worksheets[0];
  if(sheet.rowCount>101 || sheet.columnCount>3) throw Error('فایل باید فقط سه ستون و حداکثر ۱۰۰ ردیف محصول داشته باشد.');
  const legacyTwoColumns=sheet.columnCount<=2;
  if(String(productExcelValue(sheet.getCell('A1'),1)).trim()!=='کد سریع' || String(productExcelValue(sheet.getCell('B1'),1)).trim()!=='نام محصول' || (!legacyTwoColumns && String(productExcelValue(sheet.getCell('C1'),1)).trim()!=='قیمت')) throw Error('عنوان ستون‌های A، B و C باید «کد سریع»، «نام محصول» و «قیمت» باشد.');
  const rows=[];
  for(let n=2;n<=sheet.rowCount;n++) {
    const code=productExcelValue(sheet.getCell(n,1),n), name=productExcelValue(sheet.getCell(n,2),n), price=productExcelValue(sheet.getCell(n,3),n);
    if(code==='' && name==='' && price==='') throw Error(`ردیف ${n} خالی است؛ ردیف‌های خالی میان محصولات را حذف کنید.`);
    if(typeof name!=='string') throw Error(`نام محصول ردیف ${n} باید متن باشد.`);
    rows.push({quickCode:code,name,price});
  }
  if(!rows.length) throw Error('فایل محصولی برای ورود ندارد.');
  return rows;
}
async function productExcelExport(products, prices) {
  await loadProductExcelLibrary();
  const workbook=new ExcelJS.Workbook(), sheet=workbook.addWorksheet('محصولات', {views:[{rightToLeft:true}]});
  sheet.columns=[{header:'کد سریع',key:'code',width:18},{header:'نام محصول',key:'name',width:45},{header:'قیمت',key:'price',width:22}];
  sheet.getRow(1).font={bold:true};
  for(const p of products) { const row=sheet.addRow([String(p.quickCode),String(p.name),prices[p.id] ?? null]);row.getCell(1).numFmt='@'; }
  const bytes=await workbook.xlsx.writeBuffer();
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download='products.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
