'use strict';
/* v37.33.0 — بهینه‌سازی کامل تبلت و موبایل برای کادرها و فیلدها */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('public/index.html'),css=read('public/theme.css');

test('mobile fields use 16px font (no iOS auto-zoom) with compact exceptions',()=>{
  assert.match(css,/@media \(max-width:768px\)\{\s*\/\* فونت ۱۶px فیلدها/);
  assert.match(css,/#modal select,#modal textarea,#loginView input\{font-size:16px!important\}/);
  // استثناها: ردیف قلم فشرده، قیمت، وزن و پلاک
  assert.match(css,/\.sd-line-compact \.input-shell input,[^{]*\{font-size:13px!important\}/);
  assert.match(css,/\.adm-price input\{font-size:14px!important\}/);
  assert.match(css,/\.wh38-weight input\{font-size:19px!important\}/);
  assert.match(css,/\.iran-plate input,[^{]*\{font-size:inherit!important\}/);
});

test('form grids collapse and touch targets grow on small screens',()=>{
  assert.match(css,/#appView \.form-grid,#appView \.form-grid-3,#appView \.gt-grid2,\s*#modal \.form-grid,#modal \.cust-form-grid\{grid-template-columns:minmax\(0,1fr\)!important;gap:12px!important\}/);
  assert.match(css,/@media \(max-width:1024px\)\{\s*#appView \.form-grid-3\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important\}/);
  assert.match(css,/#appView \.btn,#modal \.btn\{min-height:46px!important\}/);
  assert.match(css,/#appView \.btn-sm,#modal \.btn-sm\{min-height:40px!important/);
  assert.match(css,/@media \(pointer:coarse\)\{\s*#appView \.sd-tab,#appView \.wh38-tab/);
});

test('modals, submit bars and cards fit small viewports safely',()=>{
  assert.match(css,/\.modal-root\{padding:10px!important\}/);
  assert.match(css,/#modal \.modal-card\{max-height:94vh!important;max-height:94dvh!important;border-radius:18px!important\}/);
  assert.match(css,/#appView \.sd-submit-bar\{flex-direction:column!important;align-items:stretch!important;text-align:center;gap:10px!important\}/);
  assert.match(css,/#appView \.sticky-actions\{flex-direction:column!important;align-items:stretch!important;gap:10px!important\}/);
  assert.match(css,/#modal \.cust-form-actions \.btn\{width:100%!important\}/);
  assert.match(css,/@media \(max-width:560px\)\{\s*#appView \.workspace\{padding:0 10px!important\}/);
  assert.match(css,/@media \(max-height:500px\) and \(orientation:landscape\)\{/);
  // ارتفاع پویا (dvh) و اسکرول لمسی جدول‌ها
  assert.match(css,/#appView \.workspace\{min-height:100vh;min-height:100dvh\}/);
  assert.match(css,/-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain/);
});

test('updated assets are cache-busted for the current bundle',()=>{
  assert.match(html,/theme\.css\?v=37\.48\.0/);
  assert.match(html,/compatibility\.css\?v=37\.50\.0/);
  assert.match(html,/app\.js\?v=37\.50\.0/);
  assert.match(html,/dispatch-ui\.js\?v=37\.50\.0/);
});
