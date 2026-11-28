'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/ui2.js','utf8');
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const c={esc,fa:String,qty:String,money:v=>Number(v).toLocaleString('en-US')+' ریال',icon:()=>'',storeAwareOrderName:o=>o.customer?.name||'—',storeAwareOrderPhone:o=>o.customer?.phone||'—',formatDateTime24:v=>v||'—',badge:()=>'',sdTypeBadge:()=>'',activeItemsOf:o=>o.items||[],dateLabel:v=>v||'—',time24:v=>v?.slice(11,16)||'',sdEmpty:()=>''};
vm.createContext(c);const start=source.indexOf('function futureOrderRowsV25(');vm.runInContext(source.slice(start,source.indexOf('function futureFormV38(',start)),c);
test('جدول آتی فقط مبلغ بیعانه و جزئیات را نشان می‌دهد، با مقصد جداگانه و خروجی امن',()=>{
 const base={id:'id<1',orderNo:'123',customer:{name:'<نام>'},dispatchPlace:'<مقصد>',scheduledDate:'2026-01-02',scheduledAt:'2026-01-02T08:30',deliveryDate:'2026-01-03',deposit:{amount:1234567,type:'CARD_TRANSFER',bank:'بانک محرمانه',reference:'ref-secret'}};
 const html=c.futureOrderRowsV25([base]);assert.match(html,/&lt;نام&gt;/);assert.match(html,/&lt;مقصد&gt;/);assert.match(html,/data-id="id&lt;1"/);assert.match(html,/<td data-label="بیعانه">1,234,567 ریال<\/td>/);assert.doesNotMatch(html,/بانک محرمانه|ref-secret|CARD_TRANSFER|future-edit|future-cancel|pickup-date|pickup-approve/);assert.equal((html.match(/<button /g)||[]).length,1);assert.match(html,/<td data-label="تاریخ تحویل">2026-01-03<\/td>/);assert.match(html,/<td data-label="زمان ارسال"><div class="fx-schedule"><span>ورود به انبار:<\/span><span>2026-01-02 08:30<\/span>/);assert.match(c.futureOrderRowsV25([{...base,deliveryDate:null}]),/<td data-label="تاریخ تحویل">ثبت نشده<\/td>/);
 const emptyDeposit=c.futureOrderRowsV25([{...base,deposit:null}]);assert.match(emptyDeposit,/<td data-label="بیعانه">—<\/td>/);assert.match(c.futureOrderRowsV25([]),/colspan="10"/);
});
