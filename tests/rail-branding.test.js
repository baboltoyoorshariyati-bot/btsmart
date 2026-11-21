'use strict';
/* v37.33.0 — نوار قرمز سمت راست با طرح گرافیکی صفحهٔ ورود/بنر داشبورد */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('public/index.html'),css=read('public/theme.css'),app=read('public/app.js');

test('rail wears the login/dashboard hero brand treatment',()=>{
  // گرادیان قرمز برند + دو هالهٔ روشن + بافت مورب روی خود ستون
  assert.match(css,/#appView \.rail\{\s*background:\s*radial-gradient\(560px 300px at 88% -10%,rgba\(255,255,255,\.20\),transparent 62%\),\s*radial-gradient\(430px 320px at 4% 110%,rgba\(255,120,130,\.30\),transparent 60%\),\s*repeating-linear-gradient\(135deg/);
  assert.match(css,/linear-gradient\(165deg,#d92337 0%,var\(--bt-brand\) 52%,var\(--bt-brand-700\) 100%\)!important/);
  // حلقهٔ تزئینی بزرگ و واترمارک لوگو، بدون گرفتن کلیک
  assert.match(css,/#appView \.rail::before\{[^}]*border:48px solid rgba\(255,255,255,\.06\)/);
  assert.match(css,/#appView \.rail::after\{[^}]*background:url\("\/logo\.png"\) center\/contain no-repeat/);
  assert.match(css,/#appView \.rail::after\{[^}]*pointer-events:none/);
  // لوگوی رسمی در قاب سفید دایره‌ای با هالهٔ نور ضربان‌دار + زیرعنوان سامانه
  assert.match(html,/rail-logo logo-frame"><img src="\/logo\.png" alt="بابل طیور"/);
  assert.match(css,/#appView \.rail \.rail-logo\.logo-frame\{[^}]*background:#fff!important/);
  assert.match(css,/#appView \.rail \.rail-logo\.logo-frame\{[^}]*animation:railLogoHalo/);
  assert.match(css,/#appView \.rail-brand::after\{[^}]*content:"سامانه یکپارچهٔ عملیات"/);
});

test('clock and menu items turn glassy while nav contract stays intact',()=>{
  assert.match(css,/#appView \.rail-clock\{[^}]*background:linear-gradient\(160deg,rgba\(255,255,255,\.16\),rgba\(255,255,255,\.06\)\)!important/);
  assert.match(css,/#appView \.rail-clock\{[^}]*backdrop-filter:blur\(8px\)/);
  assert.match(css,/#appView #railNav > button:hover\{[^}]*background:linear-gradient\(160deg,rgba\(255,255,255,\.17\)/);
  assert.match(css,/#appView #railNav > button\.active,[^}]*background:linear-gradient\(165deg,#ffffff 0%,#fff1f2 100%\)!important/);
  assert.match(css,/#appView #railNav \.cartable-nav-home\{[^}]*border:1px solid rgba\(255,255,255,\.24\)!important/);
  // قرارداد ناوبری: همان رندرر یکتا با آیکن موضوعی و شمارنده
  assert.match(app,/function renderNav\(\)/);
  assert.match(app,/\['incoming','ورودی','inbox','warehouseIncomingRegular'\]/);
  assert.match(css,/prefers-reduced-motion:reduce\)\{[^}]*rail-logo\.logo-frame\{animation:none/);
  assert.match(html,/app\.js\?v=37\.50\.0/);
  assert.match(html,/theme\.css\?v=37\.48\.0/);
});

test('narrow rail scales the decorations down instead of breaking layout',()=>{
  assert.match(css,/@media \(max-width:1024px\)\{\s*#appView \.rail::before\{width:200px;height:200px;border-width:32px/);
  assert.match(css,/@media \(max-width:1024px\)\{[\s\S]*?#appView \.rail::after\{width:150px/);
  assert.match(css,/@media \(max-width:1024px\)\{[\s\S]*?#appView \.rail-clock\{backdrop-filter:none/);
});
