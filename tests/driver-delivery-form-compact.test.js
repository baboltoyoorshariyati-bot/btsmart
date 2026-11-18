'use strict';
/* v37.33.0 — فرم تحویل راننده: مرجوعی/کسری/علت داخل همان فهرست «اقلام تحویلی» است
   (در ردیف همان محصول)، نه بخش جدای پایین فرم. نسخهٔ ۳۷.۲۸ آن‌ها را در ردیف‌های جدا
   ولی همچنان در بخشی جدا گذاشته بود؛ کاربر صریحاً فهرست یکپارچه خواست. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const dsp = read('public/dispatch-ui.js');
const compat = read('public/compatibility.css');
const form = dsp.slice(dsp.indexOf('async function openDeliveryForm'), dsp.indexOf('function dspBindSignature'));

test('مرجوعی، کسری و علت ستون‌های همان جدول اقلام تحویلی‌اند', () => {
  assert.match(form, /dsp-deliver-table/, 'جدول یکپارچهٔ اقلام تحویلی نیست');
  assert.match(form, /<th>مرجوعی \(کیلو\)<\/th><th>کسری \(کیلو\)<\/th><th>علت مرجوعی یا کسری<\/th>/, 'ستون‌های مرجوعی/کسری/علت در سربرگ فهرست نیست');
  assert.match(form, /<tr data-line="\$\{esc\(i\.id\)\}">[\s\S]*?data-f="returnKg" data-id="\$\{esc\(i\.id\)\}"/, 'کادر مرجوعی باید در ردیف همان محصول باشد');
  assert.match(form, /data-f="shortageKg"/);
  assert.match(form, /data-f="reason"/);
  assert.match(form, /data-return-deduction="\$\{esc\(i\.id\)\}"/, 'کسر از فاکتور هر قلم باید در سلول مبلغ همان ردیف بماند');
  // بخش جدای پایین فرم دیگر وجود ندارد
  assert.doesNotMatch(form, /dsp-line-compact/, 'ردیف‌های جدای قبلی نباید باشند');
  assert.doesNotMatch(form, /<h4>مرجوعی و کسری وزن<\/h4>/, 'بخش جدای «مرجوعی و کسری وزن» نباید باشد');
  assert.doesNotMatch(form, /dspInvoiceMarkup\(o\)|dspQtyInvoiceMarkup\(o\)/, 'فهرست نمایشی جدا نباید در فرم تحویل باشد');
  // مرجوعی کلی کنار همان فهرست است و پنهان/نمایان‌شدن فهرست با همان شناسه کار می‌کند
  assert.match(form, /id="dspFull"/);
  assert.match(form, /<div id="dspLines">/, 'پوشش فهرست برای مرجوعی کلی باید بماند');
  assert.match(form, /itemsTable/, 'بدنهٔ فرم باید همان جدول یکپارچه را بنشاند');
});

test('کادرهای داخل فهرست هم‌اندازه‌اند و علت مرجوعی کلی فقط هنگام نیاز دیده می‌شود', () => {
  const block = compat.slice(compat.indexOf('v37.33.0'));
  assert.match(block, /\.dsp-deliver-table td input\{height:28px!important/, 'ارتفاع کادرهای فهرست باید یکسان و کوتاه باشد');
  assert.match(block, /\.dsp-deliver-table td input\{[^}]*width:70px/, 'کادرهای کیلویی باید هم‌عرض باشند');
  assert.match(block, /input\[data-f="reason"\]\{width:100%/, 'کادر علت باید پهنای سلول خودش را بگیرد');
  assert.match(block, /\.dsp-deliver-table-wrap\{overflow-x:auto\}/, 'در صفحهٔ باریک فهرست پیمایش افقی منظم دارد');
  assert.ok(compat.indexOf('#dspFullReasonWrap[hidden]{display:none!important}') !== -1, 'علت مرجوعی کلی نباید وقتی لازم نیست دیده شود');
  // منطق خواندن و ارسال فیلدها دست نخورده است
  assert.match(form, /lines: items\.map\(\(i\) => \(\{[\s\S]*?returnKg: fullReturn \? 0 : field\('returnKg', i\.id\)/, 'ارسال مرجوعی/کسری نباید تغییر کرده باشد');
});
