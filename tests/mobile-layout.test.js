'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('stylesheet موبایل پس از دو stylesheet اصلی بارگذاری و در allowlist ثبت شده است', () => {
  const html = read('public/index.html');
  const core = html.indexOf('href="/styles.css"');
  const design = html.indexOf('href="/design.css');
  const mobile = html.indexOf('href="/mobile.css"');
  assert.ok(core >= 0 && design > core && mobile > design, 'ترتیب cascade باید styles → design → mobile باشد');
  assert.match(html, /name="viewport"[^>]*viewport-fit=cover/);
  assert.match(read('lib/http.js'), /'\/mobile\.css':\s*\{\s*file:\s*'mobile\.css',\s*type:\s*'text\/css/);
  assert.ok(fs.statSync(path.join(root, 'public/mobile.css')).size > 5000);
});

test('لایهٔ responsive نهایی بعد از تمام سبک‌ها بارگذاری می‌شود و حاشیهٔ کارتابل را حفظ می‌کند', () => {
  const html = read('public/index.html');
  const transport = html.indexOf('href="/transport-resources.css"');
  const responsive = html.indexOf('href="/responsive.css"');
  const css = read('public/responsive.css');
  assert.ok(transport >= 0 && responsive > transport);
  assert.match(read('lib/http.js'), /'\/responsive\.css':\s*\{\s*file:\s*'responsive\.css',\s*type:\s*'text\/css/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /data-cartable-page="gate"\]:has\(\.gt-exit-panel\)[\s\S]*?margin-inline:\s*-12px/);
  assert.match(css, /data-cartable-page="sales"[\s\S]*?sales-v29-pane-settlement[\s\S]*?margin-inline:\s*-12px/);
  assert.match(css, /max-width:\s*min\(100%,\s*calc\(100vw\s*-\s*20px\)\)/);
});

test('لایهٔ responsive breakpoint، safe-area، هدف لمسی و ورودی سازگار با Safari موبایل دارد', () => {
  const css = read('public/mobile.css');
  assert.match(css, /max-width:\s*1024px/);
  assert.match(css, /max-width:\s*768px/);
  assert.match(css, /max-width:\s*620px/);
  assert.match(css, /max-width:\s*420px/);
  assert.match(css, /orientation:\s*landscape/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /--mobile-tap-size:\s*44px/);
  assert.match(css, /font-size:\s*16px\s*!important/);
  assert.match(css, /overflow-x:\s*clip/);
});

test('ناوبری موبایل در یک ستون باریک، با آیکون بالای برچسب‌هاست', () => {
  const css = read('public/mobile.css');
  const html = read('public/index.html');
  assert.match(css, /--mobile-rail-width:\s*calc\(68px \+ env\(safe-area-inset-right, 0px\)\)/);
  assert.match(css, /#appView #railNav\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /#appView #railNav > button\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /margin-right:\s*var\(--mobile-rail-width\)/);
  assert.match(html, /class="notification-label"[^>]*>اعلان‌ها</);
  assert.doesNotMatch(read('public/design.css'), /rail:has\(#railNav/);
});

test('هدر موبایل هم‌تراز است و دکمهٔ اعلان آیکون/برچسب خوانا دارد', () => {
  const css = read('public/mobile.css');
  const html = read('public/index.html');
  const app = read('public/app.js');
  assert.match(css, /\.workspace-header\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.header-actions\s*\{[^}]*flex-flow:\s*row nowrap/);
  assert.match(css, /\.notification-label\s*\{\s*display:\s*none/);
  assert.match(css, /\.header-actions \.notification-label\s*\{[^}]*display:\s*block/);
  assert.match(css, /\.notification-btn \.bell-icon \.svg\s*\{[^}]*stroke-width:\s*2\.5/);
  assert.match(html, /aria-label="اعلان‌های عملیاتی"[^>]*>[\s\S]*?اعلان‌ها/);
  assert.match(app, /function positionNotifPanel\(\)[\s\S]*?const railWidth=isMobile/);
  assert.match(app, /panel\.style\.maxHeight=Math\.max\(140,window\.innerHeight-top-12\)/);
});


test('شناسه‌های نسخهٔ انتشار 37.6.0 هماهنگ هستند', () => {
    assert.match(read('package.json'), /"version":\s*"37\.6\.0"/);
  assert.equal(read('VERSION.txt').trim(), '37.6.0');
  assert.match(read('lib/store.js'), /data\.meta\.version\s*=\s*'37\.6\.0'/);
  assert.match(read('public/ui2.js'), /window\.BT_UI_BUILD\s*=\s*'37\.7\.4'/);
});
