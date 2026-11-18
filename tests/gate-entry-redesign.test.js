'use strict';
/* v37.33.0 — منوی مستقل «در انتظار اقدام فروش» + بازطراحی فشردهٔ فرم ثبت ورود نگهبانی */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('public/index.html'),css=read('public/theme.css'),
      app=read('public/app.js'),ui=read('public/ui2.js'),dispatch=read('public/dispatch-ui.js');

const entrySrc=()=>ui.slice(ui.indexOf('function renderGateEntry()'),ui.indexOf('function renderGateWaiting'));

test('waiting-for-sales is an independent rail menu with the queue badge',()=>{
  assert.match(app,/\['entry','ثبت ورود','entry',null\],\['waiting','در انتظار اقدام فروش','bell','gateEntry'\]/);
  // کارت داشبورد نگهبانی هم به منوی تازه می‌رود، نه فرم ثبت ورود
  assert.match(app,/\['در انتظار فروش',w\.gateEntry\|\|0,'waiting','user','red'\]/);
  // renderGate شاخهٔ waiting دارد و صف کامل را می‌سازد
  assert.match(ui,/else if\(tab==='waiting'\)html\+=renderGateWaiting\(visits\.filter\(v=>v\.status==='WAITING_SALES'\)\)/);
  assert.match(ui,/function renderGateWaiting\(queue\)\{\s*return `<section class="sd-panel" id="gateWaitingPanel">/);
  assert.match(ui,/id="gateWaitingRows"/);
  // به‌روزرسانی زنده روی همان منوی مستقل سوار است، نه فرم ورود
  assert.match(dispatch,/if\(tab==='waiting'\)\{\s*const queue=\(rows\.visits\|\|\[\]\)\.filter\(v=>v\.status==='WAITING_SALES'\);/);
});

test('entry form no longer carries the waiting column or the district field',()=>{
  const src=entrySrc();
  assert.doesNotMatch(src,/id="gateWaitingPanel"|<aside/);
  assert.doesNotMatch(src,/name="district"|محله/);
  // فیلدهای نگه‌داشته‌شده دقیقاً یک بار هستند
  for(const name of ['customerCode','name','phone','vehicleType','purpose'])
    assert.equal((src.match(new RegExp(`name="${name}"`,'g'))||[]).length,1,`field ${name}`);
  assert.match(src,/id="gateForm"/);
  assert.match(src,/id="plateBox"/);
  // ثبت فرم district نمی‌فرستد
  const submit=app.slice(app.indexOf('async function submitGate'),app.indexOf('/* v37.3.4',app.indexOf('async function submitGate')));
  assert.doesNotMatch(submit,/district/);
  // v37.40.0 — پس از ثبت موفق، فرم کاملاً خالی می‌شود و اطلاعات مشتری قبلی باقی نمی‌ماند
  assert.match(submit,/app\.plate=\{a:'',letter:'ب',c:'',province:''\}/);
  assert.match(submit,/app\.customerMatches=\[\]/);
  assert.match(submit,/await renderGate\('entry'\)/);
  assert.doesNotMatch(submit,/restoreGateForm/);
  assert.doesNotMatch(app,/function restoreGateForm/);
});

test('compact horizontal layout and 3D plate styles are in place',()=>{
  const src=entrySrc();
  // چیدمان فشرده: مشتری سه‌ستونه و پلاک کنار فیلدهای وسیله
  assert.match(src,/class="gt-entry-cust"/);
  assert.match(src,/class="gt-entry-vehicle"/);
  assert.match(src,/class="gt-entry-vehicle-fields"/);
  assert.match(css,/#appView \.gt-entry-cust\{display:grid;grid-template-columns:1\.15fr 1fr 1fr;gap:12px/);
  assert.match(css,/#appView \.gt-entry-vehicle\{display:grid;grid-template-columns:minmax\(300px,360px\) minmax\(0,1fr\);gap:16px/);
  assert.match(css,/#appView \.gt-waiting-list\{\s*display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  // پلاک سه‌بعدی: عمق، لبهٔ فلزی و پرسپکتیو ملایم با حالت hover و تمرکز
  assert.match(css,/#appView \.iran-plate\{\s*border:2px solid #1e2a38!important;border-radius:16px!important/);
  assert.match(css,/0 4px 0 #aeb9c6!important/);
  assert.match(css,/transform:perspective\(700px\) rotateX\(1\.6deg\)/);
  assert.match(css,/#appView \.iran-plate:focus-within\{\s*border-color:var\(--bt-brand\)!important/);
  assert.match(css,/@media \(prefers-reduced-motion:reduce\)\{\s*#appView \.iran-plate\{transform:none!important/);
});

test('updated assets are cache-busted for the current bundle',()=>{
  assert.match(html,/theme\.css\?v=37\.48\.0/);
  assert.match(html,/app\.js\?v=37\.50\.0/);
  assert.match(html,/ui2\.js\?v=37\.50\.0/);
  assert.match(html,/dispatch-ui\.js\?v=37\.50\.0/);
});
