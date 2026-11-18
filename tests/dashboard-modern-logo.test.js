'use strict';
/* v37.10.0 — داشبورد مدرن همهٔ واحدها، آیکن موضوعی ریل و پک رسمی لوگو */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('public/app.js'), ui=read('public/ui2.js'), css=read('public/theme.css'), html=read('public/index.html'), http=read('lib/http.js');

test('browser tab and mobile icons come from the official logo pack',()=>{
  assert.match(html,/rel="icon" href="\/favicon\.ico" sizes="any"/);
  assert.match(html,/sizes="32x32" href="\/favicon-32x32\.png"/);
  assert.match(html,/sizes="16x16" href="\/favicon-16x16\.png"/);
  assert.match(html,/rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png"/);
  assert.match(html,/rel="manifest" href="\/site\.webmanifest"/);
  for(const f of ['favicon.ico','favicon-16x16.png','favicon-32x32.png','apple-touch-icon.png','android-chrome-192x192.png','android-chrome-512x512.png','logo-with-text.png'])
    assert.ok(fs.statSync(path.join(root,'public',f)).size>500,`${f} must exist and be non-trivial`);
  const manifest=JSON.parse(read('public/site.webmanifest'));
  assert.equal(manifest.theme_color,'#b40f23');
  assert.deepEqual(manifest.icons.map(i=>i.sizes),['192x192','512x512']);
  for(const route of ['/favicon.ico','/favicon-32x32.png','/apple-touch-icon.png','/site.webmanifest','/logo-with-text.png'])
    assert.ok(http.includes(`'${route}':`),`static allowlist must serve ${route}`);
});

test('the served brand logo is the new pack icon everywhere',()=>{
  const served=fs.readFileSync(path.join(root,'assets/logo.png'));
  const mirror=fs.readFileSync(path.join(root,'public/logo.png'));
  assert.ok(served.equals(mirror),'assets/logo.png and public/logo.png must stay identical');
  assert.ok(served.length>100000 && served.length<600000,'new 512px pack icon replaces the old heavy logo');
  assert.match(ui,/db38-logo db38-logo-img"><img src="\/logo\.png"/);
});

test('every rail section carries a thematic icon separate from its badge key',()=>{
  for(const name of ['entry','exitDoor','history','inbox','package','pos','shield','driver','route','flow','activity','clipboard'])
    assert.match(app,new RegExp(`\\n  ${name}:'<`),`ICONS.${name} must be defined`);
  // نگهبانی
  assert.match(app,/\['waiting','در انتظار اقدام فروش','bell','gateEntry'\]/);
  assert.match(app,/\['exit','کنترل خروج','exitDoor','gateExit'\]/);
  assert.match(app,/\['dispatch','پخش','truck','gateDispatchPending'\]/);
  assert.match(app,/\['history','سوابق مراجعه','history',null\]/);
  // فروش
  assert.match(app,/\['onsite','حضوری','user','salesIntake'\]/);
  assert.match(app,/\['remote','غیرحضوری','phone','salesRemote'\]/);
  assert.match(app,/\['flow','درجریان','flow','salesFlow'\]/);
  assert.match(app,/\['settlement','تسویه','receipt','salesSettlement'\]/);
  assert.match(app,/\['future','سفارش‌های روزهای آتی','calendar','salesFuture'\]/);
  // انبار
  assert.match(app,/\['incoming','سفارش‌های ورودی','inbox','warehouseIncomingRegular'\]/);
  assert.match(app,/\['preparing','تحویل و آماده‌سازی','scale','warehousePreparingRegular'\]/);
  assert.match(app,/\['stores','فروشگاه‌ها','store','warehouseStores'\]/);
  // ترابری و فروشگاه
  assert.match(app,/\['transport-resources','رانندگان و خودروها','driver',null\]/);assert.doesNotMatch(app,/\['drivers','رانندگان','driver',null\]/);
  assert.match(app,/\['orders','سفارشات','route','dispatchPending'\]/);
  assert.match(app,/\['create','سفارشات روزانه','clipboard',null\]/);
  assert.match(app,/\['partial','سفارشات جزئی','clipboard',null\]/);
  assert.match(app,/\['delivery','تحویل','truck',null\]/);
  // ریشهٔ مدیریت
  assert.match(app,/\['gate','کارتابل نگهبانی','shield'/);
  assert.match(app,/\['store','کارتابل فروشگاه','store'/);
  assert.match(app,/\['customers','مشتریان','users',0\]/);
  assert.match(app,/\['products','محصولات','package',null\]/); // در کارتابل فروش؛ صفحهٔ مدیر در تنظیمات است
  assert.match(app,/\['users','کاربران','user',0\]/);
  assert.match(app,/\['payment-devices','دستگاه‌های پوز','pos',0\]/);
  assert.match(app,/\['activity','سوابق فعالیت','activity',0\]/);
  // ورودی‌های قدیمی که آیکن و شمارنده را قاطی می‌کردند نباید برگردند
  assert.doesNotMatch(app,/\['incoming','سفارش‌های ورودی','warehouse'\]/);
  assert.doesNotMatch(app,/\['delivery','تحویل','storeDelivery'\]/);
});

test('unit dashboards render soft icon cards with a relative progress bar',()=>{
  assert.match(app,/role-dash-hero-ico/);
  assert.match(app,/role-dash-live/);
  assert.match(app,/role-dash-bar/);
  assert.match(app,/dashMax=Math\.max\(1,\.\.\.cards/);
  assert.match(app,/'ورودی حضوری',w\.salesIntake\|\|0,'onsite','user','red'/);
  assert.match(app,/'سفارش‌های ورودی',w\.warehouseIncoming\|\|0,'incoming','inbox','red'/);
  assert.match(app,/'رانندگان فعال',w\.activeDrivers\|\|0,'transport-resources','driver','blue'/);
  assert.match(app,/'در انتظار بررسی',w\.store\|\|0,'registered','clipboard','red'/);
});

test('management dashboard is branded and lively without data changes',()=>{
  assert.match(ui,/mg38-accent/);
  assert.match(ui,/db38-live/);
  assert.match(css,/@keyframes btDashIn/);
  assert.match(css,/@keyframes btBarGrow/);
  assert.match(css,/\.db38-hero\{[^}]*linear-gradient\(130deg,#d92337/);
  assert.match(css,/\.role-dash-card\{[^}]*border-radius:20px/);
  assert.match(css,/\.role-dash-bar i\{/);
  assert.match(css,/prefers-reduced-motion:reduce\)\{[^}]*btDashIn|prefers-reduced-motion/);
  assert.match(html,/app\.js\?v=37\.50\.0/);
  assert.match(html,/ui2\.js\?v=37\.50\.0/);
  assert.match(html,/theme\.css\?v=37\.48\.0/);
});
