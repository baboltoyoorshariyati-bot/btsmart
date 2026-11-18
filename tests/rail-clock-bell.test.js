'use strict';
// v37.3.3 — رگرسیون: ساعت/تاریخ زیر لوگو در ستون کناری، ستون قرمز هم‌رنگ لوگو، زنگ اعلان داخل کپسول حساب
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('تاریخ و ساعت در ستون کناری، بلافاصله زیر بلوک لوگو است و دیگر در هدر نیست', () => {
  const html = read('public/index.html');
  const rail = html.slice(html.indexOf('<aside class="rail">'), html.indexOf('</aside>'));
  assert.match(rail, /<\/div>\s*<!--[^>]*-->\s*<div class="rail-clock" id="railClock"/);
  assert.ok(rail.indexOf('rail-top') < rail.indexOf('railClock') && rail.indexOf('railClock') < rail.indexOf('railNav'));
  for (const id of ['railTime', 'railWeekday', 'currentDate']) assert.match(rail, new RegExp(`id="${id}"`));
  assert.equal((html.match(/id="currentDate"/g) || []).length, 1);
  assert.doesNotMatch(html, /class="header-date"/);
});

test('ساعت زنده: هر دقیقه سر دقیقه به‌روز می‌شود و فقط یک تایمر ساخته می‌شود', () => {
  const app = read('public/app.js');
  assert.match(app, /function railClockTick\(\)\{/);
  assert.match(app, /function startRailClock\(\)\{\s*railClockTick\(\);\s*if\(app\.clockTimer\) return;/);
  assert.match(app, /60000-\(Date\.now\(\)%60000\)/);
  assert.match(app, /startRailClock\(\);/);
  assert.doesNotMatch(app, /\$\('#currentDate'\)\.textContent=todayText\(\)/);
});

test('زنگ اعلان‌ها داخل کپسول حساب کاربری، قبل از دکمهٔ تغییر رمز', () => {
  const html = read('public/index.html');
  const prof = html.slice(html.indexOf('id="headerProfile"'), html.indexOf('data-logout'));
  assert.ok(prof.includes('id="bell"'), 'bell inside #headerProfile');
  assert.ok(prof.indexOf('id="bell"') < prof.indexOf('id="changePasswordBtn"'));
  assert.equal((html.match(/id="bell"/g) || []).length, 1);
  const css = read('public/theme.css');
  assert.match(css, /#appView \.header-profile \.notification-btn\{[^}]*order:0!important/);
});

test('ستون کناری قرمز هم‌رنگ لوگو با آیتم فعال سفید', () => {
  const css = read('public/theme.css');
  assert.match(css, /--bt-rail-red:#e30613;/);
  assert.match(css, /#appView \.rail\{\s*background:linear-gradient\(180deg,var\(--bt-rail-red\)/);
  assert.match(css, /#appView #railNav > button\[aria-current="page"\]\{\s*background:#fff!important;color:var\(--bt-rail-red-2\)!important/);
  assert.match(css, /@media \(max-width:1024px\)\{\s*\/\*[^*]*\*\/\s*#appView \.rail-clock\{/);
});
