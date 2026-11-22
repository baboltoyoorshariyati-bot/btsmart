'use strict';
// v37.3.1 — رگرسیون: انتخاب‌گر تاریخ سفارش روزهای آتی + کارتابل محصولات واحد فروش
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('پاپ‌آپ تاریخ/ساعت با کلیک روی روز یا ماه بسته نمی‌شود (تشخیص کلیک داخل با composedPath)', () => {
  const app = read('public/app.js');
  assert.match(app, /function clickInside\(e, el\)\{[^\n]*composedPath/);
  // هر سه پاپ‌آپ (تقویم، ساعت، تاریخ+ساعت) باید از clickInside استفاده کنند، نه pop.contains(e.target)
  assert.equal((app.match(/if\(clickInside\(e,pop\)\) return;/g) || []).length, 3);
  assert.doesNotMatch(app, /if\(pop\.contains\(e\.target\)\) return;/);
});

test('clickInside برای دکمه‌ای که پس از کلیک از DOM جدا شده هم «داخل» تشخیص می‌دهد', () => {
  const app = read('public/app.js');
  const src = app.match(/function clickInside\(e, el\)\{[^\n]*\}/)[0];
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src, ctx);
  const pop = { contains: () => false }; // دکمه دیگر فرزند pop نیست (innerHTML بازسازی شده)
  const detachedBtn = {};
  const ev = { target: detachedBtn, composedPath: () => [detachedBtn, pop, 'body', 'document'] };
  assert.equal(ctx.clickInside(ev, pop), true);
  const outside = { target: {}, composedPath: () => ['div', 'body', 'document'] };
  assert.equal(ctx.clickInside(outside, pop), false);
});

test('فلش‌های ماه در راست‌به‌چپ: دکمهٔ اول «ماه قبل» و دکمهٔ دوم «ماه بعد» با آیکون قرینه', () => {
  const app = read('public/app.js');
  assert.match(app, /data-dt="prev"[^`]*jalali-cal-title[^`]*data-dt="next" class="is-next"/);
  assert.match(read('public/theme.css'), /\.jalali-cal-nav \.is-next svg\{transform:scaleX\(-1\)\}/);
});

test('فروش، منوی کناری را طبق ترتیب درخواستی نمایش می‌دهد و مسیر محصولات همچنان مجاز است', () => {
  const ui = read('public/ui2.js');
  const app = read('public/app.js');
  assert.match(app, /sales:\[\['dashboard','داشبورد','dashboard',null\],\['onsite','حضوری','user','salesIntake'\],\['remote','غیرحضوری','phone','salesRemote'\],\['stores','فروشگاه','store','store'\],\['settlement','تسویه','receipt','salesSettlement'\],\['flow','درجریان'/);
  assert.doesNotMatch(ui,/function renderNav\(/);
  assert.match(app, /const productsOk=page==='products'&&r==='sales';/);
  assert.match(app, /!customersOk&&!productsOk&&/);
  assert.match(app, /if\(r==='sales'\)\{setHeader\('فروش','کارتابل محصولات','ثبت و ویرایش محصولات و تعیین قیمت روز'\);await renderProductsPage\(\);\}/);
});

test('فروش: ثبت، تعیین قیمت و ویرایش دارد؛ حذف فقط برای مدیر است', () => {
  const adm = read('public/admin-ui.js');
  assert.match(adm, /function admIsCatalogAdmin\(\)/);
  assert.match(adm, /<button class="btn btn-primary" type="button" data-adm="prod-new">/);
  assert.match(adm, /\$\{admIsCatalogAdmin\(\) \? `<button class="btn btn-secondary btn-sm" type="button" data-adm="prod-delete"/);
  // قیمت و ویرایش برای هر دو نقش
  assert.match(adm, /data-adm="prod-price"/);
  assert.match(adm, /data-adm="prod-edit"/);
  assert.match(adm, /if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); saveProductPrice/);
});

test('سرور: فروش محصول ثبت و ویرایش می‌کند؛ حذف محصول فقط با مدیر است', () => {
  const core = read('lib/routes/core.js');
  const admin = read('lib/routes/admin.js');
  const ext = read('lib/routes/admin-ext.js');
  assert.match(admin, /const CATALOG_EDIT = \{ roles: \['admin', 'sales'\] \};/);
  assert.match(admin, /route\('GET', '\/api\/admin\/products', CATALOG_EDIT,/);
  assert.match(admin, /route\('PUT', '\/api\/admin\/products\/:id', CATALOG_EDIT,/);
  assert.match(core, /route\('POST', '\/api\/admin\/prices', \{ roles: \['admin', 'sales'\], idempotent: true \}/);
  // ثبت برای فروش هم مجاز است؛ حذف فقط مدیر
  assert.match(admin, /route\('POST', '\/api\/admin\/products', \{ \.\.\.CATALOG_EDIT, idempotent: true \}/);
  assert.match(ext, /route\('DELETE', '\/api\/admin\/products\/:id', ADMIN,/);
  // سایر مسیرهای مدیریتی دست نخورده
  assert.match(admin, /route\('GET', '\/api\/admin\/audit', ADMIN,/);
});

test('تاریخ امروز صفحهٔ محصولات محلی است (نه UTC با toISOString)', () => {
  const adm = read('public/admin-ui.js');
  assert.match(adm, /const admToday = \(\) => \(typeof today === 'function' \? today\(\)/);
});

test('v37.3.2 — فرم روزهای آتی: زمان ورود (کوتاه) و محل ارسال در یک ردیف، بدون متن‌های تکراری', () => {
  const ui = read('public/ui2.js');
  const css = read('public/theme.css');
  const form = ui.slice(ui.indexOf('function futureFormV38'), ui.indexOf('window.renderSalesFutureV25'));
  // تاریخ تحویل فقط تاریخ است و جدا از زمان ورود به انبار در همان شبکه قرار می‌گیرد.
  assert.match(form, /jalaliInput\('تاریخ تحویل','deliveryDate','',true\)/);
  assert.match(read('public/compatibility.css'), /#futureOrderFormV25 \.fx-top-grid>\.jalali-field\{grid-column:span 6!important\}/);
  // ترتیب: نام، تلفن، زمان ورود، تاریخ تحویل و محل ارسال
  assert.match(form, /fx-top-grid">[\s\S]*name="name"[\s\S]*name="phone"[\s\S]*jalaliDateTimeInput\('زمان ورود به کارتابل انبار'[\s\S]*fx-addr-field[\s\S]*name="dispatchPlace"[\s\S]*<\/div>\s*<div class="sd-lines-head fx-lines-head">/);
  assert.doesNotMatch(form, /fx-full" style="grid-column:1\/-1"/);  // آدرس دیگر تمام‌عرض نیست
  assert.match(form, /<textarea name="notes" maxlength="1000" rows="1"/);
  assert.match(css, /#futureOrderFormV25 \.fx-top-grid\{display:grid!important;grid-template-columns:repeat\(12,minmax\(0,1fr\)\)!important/);
  assert.match(css, /#futureOrderFormV25 \.fx-top-grid>\.jalali-datetime-field\{grid-column:span 5!important\}/);
  assert.match(css, /#futureOrderFormV25 \.fx-top-grid>\.fx-addr-field\{grid-column:span 7!important\}/);
  assert.match(css, /#futureOrderFormV25 \.jalali-datetime-field \.field-hint\{display:none!important\}/);
  assert.doesNotMatch(form, /id="future-summary"/);
  // شناسه‌ها و اکشن‌های ثبت و اقلام حفظ شده‌اند؛ خلاصهٔ تکراری حذف شد
  for (const id of ['id="futureOrderFormV25"', 'id="future-lines"', 'data-action="future-add-line"', 'type="submit"', 'type="reset"']) assert.ok(form.includes(id), id);
});

test('v37.3.2 — متن اعلان سفارش آینده تاریخ شمسی دارد', () => {
  const orders = read('lib/routes/orders.js');
  assert.match(orders, /برای تاریخ \$\{faDateLabel\(scheduledDate\)\} ثبت شد/);
  const src = orders.slice(orders.indexOf('function faDateLabel'), orders.indexOf('// ---------- فروشگاه ----------'));
  const ctx = {}; vm.createContext(ctx); vm.runInContext(src, ctx);
  assert.equal(ctx.faDateLabel('2026-10-29'), '۷ آبان ۱۴۰۵');
  assert.equal(ctx.faDateLabel('bad'), 'bad');
});
