'use strict';
/* v37.43.0 — ریسپانسیو کامل سامانه:
   در موبایل (≤۶۴۰px) ستون سمت راست کشویی و مخفی است تا محتوا تمام‌عرض شود؛
   دکمهٔ منو در هدر، پس‌زمینهٔ تیره، دکمهٔ بستن، Esc و انتخاب گزینه آن را می‌بندد.
   در تبلت ریل باریک آیکونی و در دسکتاپ ریل کامل بدون تغییر باقی مانده‌اند. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('public/index.html'), polish=read('public/ui-polish.js'),
      compat=read('public/compatibility.css'), theme=read('public/theme.css');
const mobileBlock=compat.slice(compat.indexOf('@media (max-width:640px)', compat.indexOf('v37.43.0')));

test('app shell carries the drawer controls',()=>{
  assert.match(html,/id="railToggleBtn"[^>]*aria-expanded="false"[^>]*aria-controls="railNav"/);
  assert.match(html,/id="railCloseBtn"/);
  assert.match(html,/id="railBackdrop" class="rail-backdrop" hidden/);
});

test('on phones the rail is an off-canvas drawer and the workspace is full width',()=>{
  assert.ok(mobileBlock.length>200,'بلوک موبایل ۳۷٫۴۲ وجود دارد');
  assert.match(mobileBlock,/#appView \.rail\{[^}]*transform:translateX\(106%\)/);
  assert.match(mobileBlock,/#appView\.rail-open \.rail\{transform:translateX\(0\)/);
  assert.match(mobileBlock,/#appView \.workspace\{margin-right:0!important/);
  // داخل کشو: سربرگ برند و ردیف‌های کامل منو با برچسب خوانا
  assert.match(mobileBlock,/#appView \.rail \.rail-top\{display:flex!important/);
  assert.match(mobileBlock,/#appView \.rail-close-btn\{display:grid!important\}/);
  assert.match(mobileBlock,/#appView \.rail #railNav > button\{flex-direction:row!important/);
  // دکمهٔ منو فقط در همین بازه دیده می‌شود
  assert.match(mobileBlock,/#appView \.rail-toggle-btn\{display:grid!important/);
  assert.match(compat,/#appView \.rail-toggle-btn\{display:none!important/);
  assert.match(compat,/\.rail-backdrop\{position:fixed;inset:0/);
});

test('drawer opens/closes by toggle, backdrop, close button, Esc, nav choice and resize',()=>{
  assert.match(polish,/classList\.toggle\('rail-open', open\)/);
  assert.match(polish,/toggle\.setAttribute\('aria-expanded', String\(open\)\)/);
  assert.match(polish,/backdrop\.addEventListener\('click', \(\) => setOpen\(false\)\)/);
  assert.match(polish,/closeBtn\.addEventListener\('click', \(\) => setOpen\(false\)\)/);
  assert.match(polish,/e\.key === 'Escape'\) setOpen\(false\)/);
  assert.match(polish,/nav\.addEventListener\('click'/);
  assert.match(polish,/window\.innerWidth > 640\) setOpen\(false\)/);
  // هنگام بازبودن کشو، اسکرول صفحه قفل می‌شود
  assert.match(polish,/document\.documentElement\.style\.overflow = open \? 'hidden' : ''/);
});

test('tablet slim rail and desktop full rail are unchanged',()=>{
  assert.match(theme,/@media \(max-width:1024px\)\{\s*:root\{--bt-rail-w:var\(--mobile-rail-width,68px\)\}/);
  assert.match(theme,/#appView \.workspace\{margin-right:var\(--bt-rail-w\)!important/);
});
