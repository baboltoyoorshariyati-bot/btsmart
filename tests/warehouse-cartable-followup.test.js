'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const app=read('public/app.js');
const ui=read('public/ui2.js');

test('تکمیل سفارش حضوری انبار را به سند قابل مشاهده و چاپ هدایت می‌کند و ارسال به فروش را حفظ می‌کند',()=>{
 const finalize=ui.slice(ui.indexOf('async function wh38Finalize(id)'),ui.indexOf('/* ---------------- v37.4.0 — سفارش فروشگاه',ui.indexOf('async function wh38Finalize(id)')));
 assert.match(finalize,/api\('\/api\/orders\/'\+id\+'\/warehouse'/);
 assert.match(finalize,/physicalHandoverConfirmed:hasGoods/);
 assert.match(finalize,/if\(result\.allUnavailable\)/);
 assert.match(finalize,/whPrintDocument\(doc,0,merge\)/);
 assert.match(finalize,/تحویل فیزیکی ثبت شد/);
 assert.match(ui,/data-wh-delivered-print/);
});

test('سوابق انبار از ردیف سفارش به جزئیات سند می‌رسد و جزئیات اقلام کنترل دسترس‌پذیر دارد',()=>{
 assert.match(app,/function whhDocumentDetailsActions\(r\)/);
 assert.match(app,/data-action="wh-history-document"/);
 assert.match(app,/data-action="wh-history-store-document"/);
 assert.match(app,/aria-controls="whhDetails-\$\{esc\(r\.id\)\}"/);
 assert.match(ui,/if\(a==='wh-history-document'\)return whDeliveredDetails\(id\)/);
 assert.match(ui,/if\(a==='wh-history-store-document'\)return whStoreDocumentDetails\(id,Number\(el\.dataset\.run\)\|\|1\)/);
});

test('صف ویرایش کنترل‌شدهٔ انبار از منوی خودش به endpoint موجود وصل است',()=>{
 assert.match(app,/\['document-edits','اصلاح'/);
 assert.match(ui,/data-wh-document-edits-refresh/);
 assert.match(ui,/api\('\/api\/warehouse\/document-edits'\)/);
 assert.match(ui,/data-action="warehouse-document-edit"/);
 assert.match(read('lib/routes/document-edits.js'),/route\('GET', '\/api\/warehouse\/document-edits', \{ roles: \['warehouse', 'admin'\] \}/);
});
