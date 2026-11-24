'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('changed application and document assets have refreshed cache keys on both page shells',()=>{
 const index=read('public/index.html');
 for(const [asset,version] of [['app.js','37.50.0.16'],['product-excel.js','2'],['admin-ui.js','37.50.0.4'],['ui2.js','37.50.0.3.13'],['invoice-compact.css','37.3.23'],['design.css','37.48.2'],['bt-table.css','5'],['warehouse-document.css','37.50.0'],['compatibility.css','37.50.0.5']])
  assert.ok(index.includes(`/${asset}?v=${version}`),`${asset} must use the refreshed cache key`);
 const invoice=read('public/invoice-print.html');
 assert.match(invoice,/href="\/design\.css\?v=37\.48\.2"/);
 assert.match(invoice,/href="\/invoice-compact\.css\?v=37\.3\.23"/,'updated invoice stylesheet uses its refreshed key');
 assert.match(read('lib/http.js'),/Cache-Control': entry\.file\.endsWith\('\.png'\) \? 'public, max-age=86400' : 'no-cache'/,'non-image static files must still revalidate even with a stable URL');
});

test('print frames load the current warehouse document stylesheet key as well',()=>{
 // قالب چاپ داخل iframe جدا از صفحهٔ اصلی بارگذاری می‌شود؛ کلید کهنه همان‌جا
 // باعث می‌شد تغییر اندازهٔ متن سربرگ سند چاپی دیده نشود.
 const ui2=read('public/ui2.js');
 assert.match(ui2,/warehouse-document\.css\?v=37\.50\.0/);
 assert.doesNotMatch(ui2,/warehouse-document\.css\?v=37\.49\.1/);
});
