'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('جستجوی سوابق پیش از محدودکردن ۱۰۰ نتیجه اعمال می‌شود و ارقام فارسی یکسان هستند',async()=>{
 const source=fs.readFileSync('lib/routes/core.js','utf8');const start=source.indexOf("route('GET', '/api/visits'");const end=source.indexOf('// ---------- گزارش مدیریتی',start);const history=Array.from({length:130},(_,i)=>({id:String(i),customerId:String(i),plate:i===0?'12ب345-67':'',status:'WAITING_SALES'}));
 const ctx={store:{get:()=>({})},repo:{repos:{visits:{all:()=>history.slice()}},lookups:{customerOf:id=>({name:id==='0'?'مشتری قدیمی':'مشتری جدید',phone:'09120000000'})}},roleOf:()=> 'gate',normalizePlate:require('../lib/domain').normalizePlate,isGateExitAvailable:require('../lib/gate-exit-availability'),route:(m,u,o,h)=>ctx.handler=h};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
 let result=(await ctx.handler({query:new URLSearchParams(),user:{}})).body;assert.equal(result.visits.length,100);assert(!result.visits.some(v=>v.id==='0'));
 result=(await ctx.handler({query:new URLSearchParams({q:'۱۲ب۳۴۵'}),user:{}})).body;assert.equal(result.total,1);assert.equal(result.visits[0].id,'0');
 result=(await ctx.handler({query:new URLSearchParams({q:'مشتری قدیمی'}),user:{}})).body;assert.equal(result.visits[0].id,'0');
});
