'use strict';
/* فهرست «سفارش‌های در جریان» کارتابل فروش با جدول مشترک ارائه می‌شود؛
   فهرست محصولات روی کارت نمایش داده نمی‌شود و فقط با «جزئیات کامل» دیده می‌شود.
   جلوی هر اطلاعات (شماره سفارش، شماره تماس، محل ارسال، ...) برچسبش نوشته می‌شود. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('public/app.js'), ui=read('public/ui2.js'), compat=read('public/compatibility.css');
const slice=(src,from,to)=>src.slice(src.indexOf(from),src.indexOf(to,src.indexOf(from)));

test('flow table retains actions without displaying the product list',()=>{
  const card=slice(ui,'function sdFlowCard','function salesFlowRowsV27');
  assert.match(card,/<tr class="sd-flow-row/);
  const table=slice(ui,'function salesFlowRowsV27','function renderSalesFlowV25');
  assert.match(table,/class="bt-table sd-flow-table"/);
  // فهرست محصولات روی کارت نیست
  assert.doesNotMatch(card,/sd-flow-items/);
  assert.doesNotMatch(card,/it\.product\?\.name/);
  assert.doesNotMatch(card,/sd-flow-stats/);
  // دکمهٔ جزئیات و کنش‌های سفارش برگشتی حفظ شده‌اند
  assert.match(card,/data-action="order-details"/);
  assert.match(card,/data-action="edit-returned-order"/);
  assert.match(card,/data-action="resubmit-order"/);
  // نشان وضعیت و نوع سفارش همچنان روی کارت است
  assert.match(card,/badge\(o\.status\)/);
  assert.match(card,/sdTypeBadge\(o\)/);
});

test('flow table omits the details column but retains operational actions',()=>{
  const card=slice(ui,'function sdFlowCard','function salesFlowRowsV27');
  for(const label of ['شماره سفارش','تاریخ','قلم'])assert.ok(card.includes(label),label);
  assert.match(card,/data-label="عملیات"/);assert.doesNotMatch(card,/data-label="مشخصات"/);
});

test('compact flow styles and tighter list spacing are in the final stylesheet',()=>{
  assert.match(compat,/v37\.43\.0/);
  assert.match(compat,/#appView \.sd-flow-card\.sd-flow-card-1line\{align-items:center;gap:10px;padding:8px 12px/);
  assert.match(compat,/#appView \.sd-flow-list\{gap:7px!important\}/);
  assert.match(compat,/#appView \.sd-fmeta\{/);
  const pane=slice(ui,'function renderSalesFlowV25','/* ---------- تب ۴: تسویه ---------- */');
  assert.match(pane,/style="padding:10px 14px 12px"/);
});

test('products remain fully visible inside order details',()=>{
  const details=slice(app,'async function openOrderDetails','function renderRemoteOrdersV21');
  assert.match(details,/o\.items/);
  assert.match(details,/product/);
});
