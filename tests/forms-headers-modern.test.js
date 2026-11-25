'use strict';
/* v37.33.0 — فرم‌ها و سربرگ‌های مدرن و شیک در سراسر سامانه */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('public/index.html'),css=read('public/theme.css');

test('page and card headers wear the brand glass/gradient treatment',()=>{
  // توکن‌های مشترک با بنر داشبورد و صفحهٔ ورود
  assert.match(css,/--fm-brand-grad:linear-gradient\(135deg,#cf1d33 0%,var\(--bt-brand\) 55%,var\(--bt-brand-700\) 100%\)/);
  assert.match(css,/--fm-head-bg:linear-gradient\(180deg,#ffffff 0%,#fdf3f4 100%\)/);
  // سربرگ اصلی: شیشه‌ای با خط لهجهٔ گرادیانی و نوار کنار عنوان
  assert.match(css,/#appView \.workspace-header::after\{[^}]*linear-gradient\(90deg,transparent,rgba\(180,15,35,\.55\)/);
  assert.match(css,/#appView \.header-main::before\{[^}]*background:var\(--fm-brand-grad\)/);
  assert.match(css,/#appView \.header-avatar\{background:var\(--fm-brand-grad\)!important/);
  // سربرگ کارت و مودال: پس‌زمینهٔ گرادیانی ملایم + نوار لهجه + آیکن گرادیانی
  assert.match(css,/#appView \.sd-head\{\s*position:relative;background:var\(--fm-head-bg\)!important/);
  assert.match(css,/#appView \.sd-head::before\{[^}]*background:var\(--fm-brand-grad\)/);
  assert.match(css,/#appView \.sd-head-ico\{\s*background:var\(--fm-brand-grad\)!important/);
  assert.match(css,/#modal \.modal-head,#modal \.modal-header\{\s*position:relative;background:var\(--fm-head-bg\)!important/);
  // سربرگ جدول هم‌خانوادهٔ برند
  assert.match(css,/#appView \.table th,#appView \.adm-table thead th\{\s*background:linear-gradient\(180deg,#fdf3f4,#fbe9ec\)!important/);
  // تب فعال: آیکن گرادیانی مثل داشبورد
  assert.match(css,/#appView \.sd-tab\.active \.sd-tab-ico,[^}]*background:var\(--fm-brand-grad\)!important/);
});

test('all form controls share the modern soft style',()=>{
  // قاب ورودی: گوشهٔ نرم، سایهٔ داخلی و حلقهٔ تمرکز برند
  assert.match(css,/#appView \.input-shell,#modal \.input-shell,#loginView \.input-shell\{\s*min-height:48px;border:1\.5px solid var\(--bt-line-2\)!important;border-radius:14px!important/);
  assert.match(css,/#appView \.input-shell:focus-within,#modal \.input-shell:focus-within,#loginView \.input-shell:focus-within\{\s*border-color:var\(--bt-brand\)!important/);
  assert.match(css,/box-shadow:var\(--fm-ring\),0 8px 18px -10px rgba\(180,15,35,\.45\)!important/);
  // ورودی‌های بدون قاب در فرم‌ها و مودال‌ها + فلش انتخاب‌گر برند
  assert.match(css,/#appView #content input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)[^{]*\{\s*border:1\.5px solid var\(--bt-line-2\);border-radius:12px/);
  assert.match(css,/#appView #content select:not\(\[multiple\]\)[\s\S]*?background-image:url\("data:image\/svg\+xml,%3Csvg xmlns='http:\/\/www\.w3\.org\/2000\/svg'/);
  assert.match(css,/stroke='%23b40f23'/);
  assert.match(css,/#appView #content textarea,#modal textarea\{\s*border:1\.5px solid var\(--bt-line-2\);border-radius:14px/);
  // برچسب‌ها نقطهٔ گرادیانی برند دارند و چک‌باکس لهجهٔ برند می‌گیرد
  assert.match(css,/#appView \.field > label:not\(\.adm-check\):not\(\.gt-switch\)::before/);
  assert.match(css,/accent-color:var\(--bt-brand\);cursor:pointer/);
  assert.match(css,/#appView \.adm-check:has\(> input:checked\),#modal \.adm-check:has\(> input:checked\)/);
  // خطای فرم به‌صورت قرص هشدار و فیلد نامعتبر قرمز می‌شود
  assert.match(css,/#appView \.form-error:not\(:empty\),#modal \.form-error:not\(:empty\)\{\s*background:var\(--bt-red-bg\)/);
  assert.match(css,/input\[aria-invalid="true"\]/);
});

test('compact/special controls keep their contract (plate, price, weight)',()=>{
  // پلاک ایران بدون قاب جداگانه می‌ماند
  assert.match(css,/#appView #content \.iran-plate input,#appView #content \.iran-plate select[^{]*\{\s*border:0!important;border-radius:0!important/);
  // وزن انبار و قیمت مدیریت فشرده می‌مانند
  assert.match(css,/#appView #content \.wh38-weight input\{border:0!important/);
  assert.match(css,/#appView \.adm-price input\{min-height:36px!important\}/);
  // داخل قاب، ورودی همچنان بدون پس‌زمینه/قاب است (قرارداد form-layout)
  assert.match(css,/#appView #content \.input-shell > input,#appView #content \.input-shell > select,#appView #content \.input-shell > textarea,[^}]*background-image:none!important/);
});

test('buttons, item rows and sticky action bars are modernized',()=>{
  assert.match(css,/#appView \.btn-primary,#modal \.btn-primary,\.login-card \.btn-primary\{\s*background:linear-gradient\(135deg,#cd1a2e 0%,var\(--bt-brand\) 55%,var\(--bt-brand-700\) 100%\)!important/);
  // برقِ hover روی دکمهٔ اصلی
  assert.match(css,/#appView \.btn-primary::after,[^{]*\{\s*content:"";position:absolute;inset:0;pointer-events:none/);
  assert.match(css,/transform:translateX\(130%\);transition:transform \.55s ease/);
  assert.match(css,/#appView \.btn:hover:not\(:disabled\),#modal \.btn:hover:not\(:disabled\)\{transform:translateY\(-1px\)!important\}/);
  // ردیف قلم سفارش: شمارهٔ گرادیانی و hover نرم؛ فیلدست نگهبانی قاب برند
  assert.match(css,/#appView \.sd-line-no\{\s*background:var\(--fm-brand-grad\)!important/);
  assert.match(css,/#appView \.gt-fieldset\{\s*border:1px solid var\(--bt-brand-100\)!important;border-radius:18px!important/);
  assert.match(css,/#appView \.sd-submit-bar\{\s*border:1px solid var\(--bt-brand-100\)!important;border-radius:16px!important/);
  // دسترس‌پذیری و چاپ
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)\{\s*#appView \.btn,#modal \.btn/);
  assert.match(css,/@media print\{\s*#appView \.table th/);
});

test('updated assets are cache-busted for the current bundle',()=>{
  assert.match(html,/theme\.css\?v=37\.48\.1/);
  assert.match(html,/compatibility\.css\?v=37\.50\.0/);
  assert.match(html,/app\.js\?v=37\.50\.0/);
});
