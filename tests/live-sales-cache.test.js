'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'../ui-src/app',n),'utf8');
test('successful writes invalidate cached cartables; reads and failed writes do not',async()=>{
 const source=read('02-shell-gate.js'),c={app:{salesCache:{fetchedAt:123}},window:{},WRITES_IN_FLIGHT:new Set(),WRITE_KEYS:new Map(),newIdempotencyKey:()=> 'key',fetch:async()=>({ok:true,status:200,json:async()=>({ok:true})})};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('async function api('),source.indexOf('function openModal(')),c);
 await c.api('/api/orders');assert.equal(c.app.salesCache.fetchedAt,123);
 await c.api('/api/store/orders/o/approve',{method:'POST',body:'{}'});assert.equal(c.app.salesCache.fetchedAt,0);assert.equal(c.app.dataRevision,1);
 c.app.salesCache.fetchedAt=456;c.fetch=async()=>({ok:false,status:409,json:async()=>({error:'blocked'})});await assert.rejects(c.api('/api/orders/o',{method:'PUT',body:'{}'}));assert.equal(c.app.salesCache.fetchedAt,456);
});
test('forced refresh waits for an older in-flight read then obtains post-write data',async()=>{
 let release,calls=0;
 const first=new Promise(r=>{release=r;}),c={app:{},fetchPagedList:async(url,key)=>{if(key==='orders'){calls++;if(calls===1)await first;return {orders:[{id:calls===1?'old':'new'}]};}return {visits:[]};},api:async()=>({})};
 vm.createContext(c);const source=read('08-sales-cache-navigation.js');vm.runInContext(source.slice(source.indexOf('async function fetchSalesCache'),source.indexOf('function salesFlowRows')),c);
 const pending=c.fetchSalesCache(true);c.app.dataRevision=1;const fresh=c.fetchSalesCache(true);release();await pending;const data=await fresh;assert.equal(data.orders[0].id,'new');assert.equal(calls,2);assert(data.fetchedAt>0);
});
