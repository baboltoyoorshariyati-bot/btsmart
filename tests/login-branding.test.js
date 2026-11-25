'use strict';
/* v37.33.0 — صفحهٔ ورود با طرح گرافیکی لوگوِ بنر داشبورد */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('public/index.html'),css=read('public/theme.css'),design=read('public/design.css');

test('login page carries the dashboard-hero brand treatment',()=>{
  // ساختار: لوگوی رسمی + نام سازمان + نشان سامانه
  assert.match(html,/login-logo-badge"><img src="\/logo\.png" alt="بابل طیور"/);
  assert.match(html,/login-org">کشتارگاه صنعتی بابل طیور</);
  assert.match(html,/class="login-tag"><i><\/i> سامانه یکپارچهٔ عملیات/);
  // همان دستور گرافیکی بنر داشبورد: گرادیان قرمز + هاله‌های روشن
  assert.match(css,/#loginView\.login-page:not\(\.hidden\)\{[^}]*linear-gradient\(150deg,#d92337 0%,var\(--bt-brand\) 52%,var\(--bt-brand-700\) 100%\)/);
  assert.match(css,/#loginView\.login-page:not\(\.hidden\)\{[^}]*radial-gradient\(900px 520px at 88% -12%/);
  assert.match(css,/#loginView::before\{[^}]*border:56px solid rgba\(255,255,255,\.055\)/,'حلقهٔ تزئینی بزرگ بنر');
  // واترمارک لوگو و قاب سفید دایره‌ای لوگو با هالهٔ ضربان‌دار
  assert.match(css,/#loginView::after\{[^}]*background:url\("\/logo\.png"\) center\/contain no-repeat/);
  assert.match(css,/#loginView\.login-page \.login-stage \.login-logo-badge\{[^}]*background:#fff!important/);
  assert.match(css,/#loginView\.login-page \.login-stage \.login-logo-badge\{[^}]*animation:loginHalo/);
});

test('login form sits on a glass panel without changing the form contract',()=>{
  assert.match(css,/#loginView \.login-card\{[^}]*backdrop-filter:blur\(14px\)/);
  assert.match(css,/#loginView \.login-card\{[^}]*border-radius:24px!important/);
  assert.match(css,/@keyframes loginRise/);
  assert.match(css,/#loginView \.login-tag\{[^}]*border-radius:999px/);
  // شناسه‌ها و ساختار فرم ورود دست‌نخورده است
  for(const id of ['id="loginForm"','id="username"','id="password"','id="showPassword"','id="loginMsg"'])
    assert.ok(html.includes(id),id);
  assert.match(css,/prefers-reduced-motion:reduce\)\{[^}]*#loginView \.login-hero/);
  assert.match(html,/app\.js\?v=37\.50\.0/);
  assert.match(html,/theme\.css\?v=37\.48\.1/);
});

test('decorative layers never intercept clicks or cover the form',()=>{
  assert.match(css,/#loginView::before\{[^}]*pointer-events:none/);
  assert.match(css,/#loginView::after\{[^}]*pointer-events:none/);
  assert.match(css,/#loginView \.login-stage\{position:relative;z-index:1\}/);
  // در نمایش موبایل کوتاه (landscape) نشان لوگو کوچک می‌شود
  assert.match(css,/@media \(max-width:1024px\) and \(orientation:landscape\) and \(max-height:500px\)\{[^}]*login-logo-badge\{width:64px/);
});
