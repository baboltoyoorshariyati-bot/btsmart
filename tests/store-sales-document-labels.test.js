'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('public/app.js','utf8');
const start=source.indexOf('function storeSalesDocumentButtons(');
const end=source.indexOf('\nfunction storeSalesReviewButtons(',start);
const renderer=source.slice(start,end);

test('دکمه‌های چاپ سند سرویس در کارتابل فروش عنوان کوتاه و روشن دارند',()=>{
 const ctx=vm.createContext({
  app:{user:{roleCode:'sales'}},
  esc:String,
  icon:()=>'<svg></svg>',
  normalizeRole:value=>value,
  storeAvailableRuns:()=>[1,2],
 });
 vm.runInContext(renderer,ctx);
 const html=ctx.storeSalesDocumentButtons({id:'order-1',storeOrderKind:'DAILY',payments:[]},false,true);
 assert.match(html,/چاپ سرویس اول/);
 assert.match(html,/چاپ سرویس دوم/);
 assert.doesNotMatch(html,/چاپ سند سرویس|برای فروش/);
 assert.match(html,/data-run="1"/);
 assert.match(html,/data-run="2"/);
});

test('عنوان چاپ محموله سفارش جزئی به سرویس‌های روزانه تعمیم داده نمی‌شود',()=>{
 const ctx=vm.createContext({
  app:{user:{roleCode:'sales'}},esc:String,icon:()=>'',normalizeRole:value=>value,
  storeAvailableRuns:()=>[1],
 });
 vm.runInContext(renderer,ctx);
 const html=ctx.storeSalesDocumentButtons({id:'partial-1',storeOrderKind:'PARTIAL',payments:[]},false,true);
 assert.match(html,/چاپ سند محموله سفارش جزئی برای فروش/);
});
