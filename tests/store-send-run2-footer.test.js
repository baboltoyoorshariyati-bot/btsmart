'use strict';
/* v37.33.0 — برگهٔ سرویس فروشگاه (انبار): «ارسال سرویس دوم» در پایان فرم نبود
   (فقط بالای برگه بود و بعد از ارسال سرویس اول، پایان فرم هیچ دکمهٔ ارسالی نداشت)
   و دکمهٔ سرویس دوم پیش از ارسال سرویس اول فعال بود و کلیک روی آن فقط خطا می‌داد. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'public/ui2.js'), 'utf8');

test('پایان فرم برگه هر دو ارسال (سرویس اول و دوم) را دارد', () => {
  const sheet = ui.slice(ui.indexOf('function sr38Sheet(o)'), ui.indexOf('async function sr38Post'));
  const foot = sheet.slice(sheet.indexOf('sr318-foot'));
  assert.match(foot, /\$\{sr38SendBtn\(o,1,sr\.items\)\}/, 'ارسال سرویس اول در پایان فرم نیست');
  assert.match(foot, /\$\{sr38SendBtn\(o,2,sr\.items\)\}/, 'ارسال سرویس دوم در پایان فرم نیست');
  assert.doesNotMatch(foot, /data-action="sr38-finalize"/);
  // بالای برگه هم هر دو می‌مانند
  assert.match(sheet, /sr318-sendline\">[\s\S]*?sr38SendBtn\(o,1,sr\.items\)[\s\S]*?sr38SendBtn\(o,2,sr\.items\)/);
});

test('سرویس دوم پیش از ارسال سرویس اول واقعاً غیرفعال است و عنوان راهنما با وضعیت دکمه یکی است', () => {
  const btn = ui.slice(ui.indexOf('function sr38SendBtn(o,run,view)'), ui.indexOf('function sr38Hist(it)'));
  assert.match(btn, /const blocked=run===2&&!ops\.r1Shipment;/);
  assert.match(btn, /const off=blocked\|\|!ready;/, 'دکمهٔ مسدود باید غیرفعال رندر شود، نه فعالِ خطادهنده');
  assert.match(btn, /\$\{off\?'disabled':''\}/);
  assert.match(btn, /const why=blocked\?'نخست اقلام سرویس اول را به فروش ارسال کنید':\(!ready\?'پس از ثبت وزن این سرویس فعال می‌شود':''\);/, 'عنوان راهنما نباید وقتی دکمه فعال است پیام حالت دیگر را نشان دهد');
  // پس از ارسال هر سرویس، نشان «ارسال شد» جای دکمه می‌آید (از جمله در پایان فرم)
  assert.match(btn, /if\(sh\)\{[\s\S]*?return `<span class="st-run-chip st-run-stage" title="اقلام این سرویس به فروش ارسال شده‌اند">\$\{icon\('check',13\)\} سرویس \$\{label\} به فروش ارسال شد<\/span>`; \}/);
});
