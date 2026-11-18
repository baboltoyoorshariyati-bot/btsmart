'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('public/app.js','utf8');
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const c=vm.createContext({esc});
vm.runInContext(src.slice(src.indexOf("function fa(v='')"),src.indexOf('function plateMarkup(p)')),c);
function form(values={},original='',motor=false,dirty='1') {
  const root={dataset:{original,dirty,motor:motor?'1':'0'},querySelector:s=>({value:values[s]||''})};
  return {querySelector:s=>s==='[data-plate-editor]'?root:null};
}
test('پلاک خودرو در بخش‌های صحیح و با حرف واقعی نمایش داده می‌شود',()=>{
 const html=c.plateViewHtml('۱۲ ج ۳۴۵ - ۶۷','—',true);
 for(const x of ['iran-plate','<span>۱۲</span>','<span>ج</span>','<span>۳۴۵</span>','<span>۶۷</span>'])assert(html.includes(x));
 assert.equal(c.formatDispatchVehiclePlate('12ج345-67'),'۱۲ ج ۳۴۵ - ۶۷');
 assert.match(c.plateEditorHtml('12ج345-67','وانت'),/<option value="ج" selected>/);
 assert.match(c.plateEditorHtml('','وانت'),/<option value="">—<\/option>/);
});
test('موتورسیکلت و مقادیر قدیمی بدون حدس یا ساخت حرف نمایش داده می‌شوند',()=>{
 const motor=c.plateViewHtml('۱۲۳-۴۵۶۷۸','—',true);
 assert.match(motor,/is-motor/);assert.match(motor,/<span>۱۲۳<\/span>/);assert.match(motor,/<span>۴۵۶۷۸<\/span>/);assert.doesNotMatch(motor,/<span>ب<\/span>/);
 for(const raw of ['1234567','AA-1','x12ب345-67y','<svg onload=1>']) {
  const h=c.plateViewHtml(raw);assert.match(h,/iran-plate-legacy/);assert(!h.includes('<svg'));assert(!h.includes('<span>ب</span>'));
  assert.equal(c.plateEditorValue(form({},raw,false,'0'),{required:true}),raw);
 }
 assert.match(c.plateEditorHtml('<bad>','وانت'),/&lt;bad&gt;/);
 assert(!c.plateViewHtml('','ندارد').includes('iran-plate'));
});
test('ثبت خودرو به اجزای کامل و انتخاب حرف نیاز دارد و اصلاح آگاهانه است',()=>{
 const a={'[data-plate-a]':'12','[data-plate-letter]':'ج','[data-plate-c]':'345','[data-plate-province]':'67'};
 assert.equal(c.plateEditorValue(form(a),{required:true}),'۱۲ ج ۳۴۵ - ۶۷');
 assert.throws(()=>c.plateEditorValue(form({...a,'[data-plate-letter]':''}),{required:true}));
 assert.throws(()=>c.plateEditorValue(form({...a,'[data-plate-c]':'34'}),{required:true}));
 assert.equal(c.plateEditorValue(form(),{required:false}),'');
 assert.throws(()=>c.plateEditorValue(form(),{required:true}));
 assert.equal(c.plateEditorValue(form(a,'پلاک قدیمی',false,'1'),{required:true}),'۱۲ ج ۳۴۵ - ۶۷');
});
test('ثبت موتورسیکلت سه رقم بالا و پنج رقم پایین می‌خواهد',()=>{
 const values={'[data-motor-a]':'۱۲۳','[data-motor-b]':'۴۵۶۷۸'};
 assert.equal(c.plateEditorValue(form(values,'',true),{required:true}),'123-45678');
 assert.throws(()=>c.plateEditorValue(form({...values,'[data-motor-b]':'4567'},'',true),{required:true}));
});
test('رابط فعال نگهبانی و انتخاب سابقه از ورودی مشترک استفاده می‌کند',()=>{
 const ui=fs.readFileSync('public/ui2.js','utf8'),customers=fs.readFileSync('public/customers-ui.js','utf8');
 const bind=ui.slice(ui.indexOf('function bindGate(tab)'),ui.indexOf('/* پلاک ایران'));
 assert.match(bind,/plateEditorHtml\(/);assert.doesNotMatch(bind,/plateMarkup\(app\.plate\)/);
 assert.match(customers,/plateEditorHtml\(c\.plate/);assert.match(customers,/delete body\.plate/);
});
test('باسکول غیرفعال می‌ماند و انتخاب سوابق قبلی مقدار دقیق پلاک را نگه می‌دارد',()=>{
 assert.match(src,/WEIGHBRIDGE_CARTABLE_ENABLED=false/);
 assert.match(src,/st\.open\.map\(t=>t\.plate\)/);assert.match(src,/let value=selected/);
 assert.match(src,/این پلاک قبلاً ثبت شده است؛ برای حفظ سوابق/);
});
test('قواعد نهایی فرم، حرف پلاک را با فاصلهٔ داخلی کم و موتور را در دو ردیف نشان می‌دهند',()=>{
 const css=fs.readFileSync('public/compatibility.css','utf8'),admin=fs.readFileSync('public/admin-ui.js','utf8');
 assert.match(css,/\.iran-plate\.plate-editor select[\s\S]*?padding:0 2px!important/);
 assert.match(css,/#plateBox \.iran-plate\.is-motor\{[\s\S]*?grid-template-columns:34px minmax\(0,1fr\)!important;grid-template-rows:minmax\(0,1fr\) minmax\(0,1fr\)!important/);
 assert.match(css,/\.is-motor \.blue-strip\{grid-column:1!important;grid-row:1!important/);
 assert.match(css,/\.is-motor \.motor-bottom\{grid-column:1 \/ span 2!important;grid-row:2!important/);
 assert.match(css,/#modal \.cust-form \.cust-field:not\(\.adm-check\)\{[\s\S]*?display:grid!important/);
 assert.match(admin,/\.iran-plate\.is-motor \.motor-bottom\{grid-column:1 \/ span 2;grid-row:2/);
});
