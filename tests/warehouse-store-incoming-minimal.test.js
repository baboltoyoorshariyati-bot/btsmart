'use strict';
/* Warehouse store queues use a responsive table; the full order and item list stays in details. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const ui = read('public/ui2.js');
const list = ui.slice(ui.indexOf('function wh38StoreList(orders,kind)'), ui.indexOf('async function wh38StoreDetails'));
const details = ui.slice(ui.indexOf('async function wh38StoreDetails'), ui.indexOf('async function wh38AcceptFromDetails'));

test('صف‌های فروشگاهی در انبار جدول هشت‌ستونه با دکمهٔ متناسب با مرحله هستند', () => {
  assert.match(list, /class="wh38-store-table wh38-store-\$\{incoming\?'incoming':'preparing'\}"/);
  for (const label of ['فروشگاه / مشتری', 'شماره سفارش', 'نوع سفارش', 'تاریخ ثبت', 'وضعیت', 'محل ارسال', 'اقلام', 'اقدامات']) {
    assert.ok(list.includes(`<th>${label}</th>`), `ستون «${label}» باید نمایش داده شود`);
  }
  assert.match(list, /data-label="فروشگاه \/ مشتری"/);
  assert.match(list, /const created=formatDateTime24\(o\.createdAt\)/);
  assert.match(list, /data-label="تاریخ ثبت"/);
  assert.match(list, /qty\(activeItemsOf\(o\)\.length\)\} قلم/);
  assert.match(list, /data-action="wh38-store-details"/);
  assert.match(list, /data-action="wh38-start"/);
  assert.match(list, /جزئیات آماده‌سازی/);
  assert.doesNotMatch(list, /wh38-items|data-action="wh38-accept"|wh38StoreHeader\(o\)/);
  const css = read('public/compatibility.css');
  assert.match(css, /\.wh38-store-table\{width:100%;table-layout:fixed/);
  assert.match(css, /\.wh38-store-table td::before\{content:attr\(data-label\)/, 'برچسب ستون‌ها در نمایش کارت‌مانند موبایل حفظ شود');
  assert.match(css, /@media\(max-width:480px\)[\s\S]*?\.wh38-store-table tbody tr\{grid-template-columns:minmax\(0,1fr\)/);
});

test('جزئیات، فهرست کامل اقلام را نشان می‌دهد و تأیید در پایان فهرست است', () => {
  assert.match(details, /activeItemsOf\(o\)/);
  assert.match(details, /class="whd23-list whd35-list"/, 'فهرست اقلام در جزئیات نیست');
  assert.match(details, /class="whd23-box whd23-product"/, 'کادر محصول در ردیف جزئیات نیست');
  assert.match(details, /it\.product\?\.name/);
  assert.match(details, /qty\(it\.requestedQty\)/);
  assert.match(details, /o\.customer\?\.name/, 'نام مشتری در جزئیات نیست');
  const listPos = details.indexOf('class="whd23-list');
  const acceptPos = details.indexOf('data-action="wh38-accept-details"');
  assert.ok(listPos >= 0 && acceptPos > listPos, 'دکمهٔ تأیید باید بعد از فهرست اقلام باشد');
  assert.match(details, /تأیید دریافت و ورود به آماده‌سازی/);
  assert.match(details, /o\.status==='WAREHOUSE_PENDING'/, 'تأیید فقط برای سفارشِ در صف ورودی فعال است');
});

test('اقدام‌های جدول به جزئیات و آماده‌سازی هدایت می‌شوند', () => {
  assert.match(ui, /else if\(a==='wh38-store-details'\)\{ wh38StoreDetails\(id\); \}/);
  assert.match(ui, /else if\(a==='wh38-start'\)\{ el\.disabled=true; const r=await api\('\/api\/orders\/'\+id\+'\/warehouse\/start-preparing'/);
  assert.match(ui, /if\(r\.order&&r\.order\.storeRun&&r\.order\.storeRun\.enabled\) sr38Sheet\(r\.order\); else wh38Sheet\(r\.order\);/);
  assert.match(read('public/app.js'), /if\(a==='wh38-accept-details'\)return wh38AcceptFromDetails\(el\.dataset\.id,el\)/);
});

test('تأیید از جزئیات همان مسیر ورود به آماده‌سازی را صدا می‌زند و فهرست تازه می‌شود', () => {
  const accept = ui.slice(ui.indexOf('async function wh38AcceptFromDetails'), ui.indexOf('function wh38List(orders,kind)'));
  assert.match(accept, /api\('\/api\/orders\/'\+id\+'\/warehouse\/accept',\{method:'POST'\}\)/);
  assert.match(accept, /closeModal\(\)/);
  assert.match(accept, /app\.wh38\.phase==='stores'\) wh38Paint\('stores'\)/);
});
