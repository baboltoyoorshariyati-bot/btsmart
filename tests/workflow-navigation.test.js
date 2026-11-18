'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const appSource=read('public/app.js'),ui=read('public/ui2.js');
const submitSource=appSource.slice(appSource.indexOf('async function submitOrder(visitId){'),appSource.indexOf('const _legacyResubmitOrderV25'));
function harness(api){
 const rendered=[],messages=[];
 const draft=[{productId:'p01',requestedQty:'12.5',requestedUnit:'کیلوگرم',description:'توضیح'}];
 const button={dataset:{id:'visit-one'},disabled:false};
 const c={app:{page:'sales',sub:{sales:'onsite'},orderDraft:draft,salesCache:{visits:[{id:'visit-one'},{id:'visit-two'}],fetchedAt:1}},
 n:Number,$$:()=>[button],api,toast:m=>messages.push(m),renderSales:t=>rendered.push(t),
 fetchSalesCache:async()=>({visits:[{id:'visit-two'}]}),paintSalesPaneV29(){}};
 vm.createContext(c);vm.runInContext(submitSource,c);
 return{c,draft,button,rendered,messages};
}
test('sales shell is reused only when all seven real panes exist; Back resets draft',()=>{
 const shell=appSource.slice(appSource.indexOf('function ensureSalesShellV29()'),appSource.indexOf('function salesV29SubmitHandler'));
 assert.match(shell,/existing && SALES_TABS_V29\.every\(t=>existing\.querySelector\('#'\+salesV29PaneId\(t\)\)\)/);
 assert.match(shell,/content\.innerHTML=.*SALES_TABS_V29\.map/);
 assert.match(appSource,/if\(a==='back-order-intake'\)\{app\.orderDraft=\[\];return renderSales\('onsite'\);\}/);
});
test('successful onsite submit clears draft and cached visitor and returns to onsite intake',async()=>{
 const calls=[];const h=harness(async(url,options)=>{calls.push({url,...options});return{}});
 await h.c.submitOrder('visit-one');
 assert.equal(calls.length,1);assert.equal(JSON.parse(calls[0].body).items[0].requestedQty,12.5);
 assert.equal(h.c.app.orderDraft.length,0);assert.deepEqual(h.rendered,['onsite']);
 assert.equal(h.c.app.salesCache.visits.length,1);assert.equal(h.c.app.salesCache.visits[0].id,'visit-two');
 assert.equal(h.c.app.onsiteSubmitting,false);assert.equal(h.button.disabled,false);
});
test('failed onsite submit preserves draft and re-enables submission',async()=>{
 const h=harness(async()=>{throw new Error('test failure')});await h.c.submitOrder('visit-one');
 assert.equal(h.c.app.orderDraft,h.draft);assert.equal(h.c.app.orderDraft[0].requestedQty,'12.5');
 assert.equal(h.rendered.length,0);assert.equal(h.button.disabled,false);assert.equal(h.c.app.onsiteSubmitting,false);
 assert(h.messages.includes('test failure'));
});
test('repeated submit during a pending request produces one POST',async()=>{
 let resolve;let calls=0;const pending=new Promise(r=>resolve=r);
 const h=harness(async()=>{calls++;return pending});
 const first=h.c.submitOrder('visit-one');await h.c.submitOrder('visit-one');
 assert.equal(calls,1);assert.equal(h.button.disabled,true);
 resolve({});await first;assert.equal(calls,1);assert.equal(h.button.disabled,false);
});
test('warehouse acceptance refreshes incoming rather than automatically navigating to preparing',()=>{
 const branch=ui.slice(ui.indexOf("if(a==='wh38-accept')"),ui.indexOf("else if(a==='wh38-start')"));
 assert.match(branch,/warehouse\/accept/);
 assert.match(branch,/await refreshIndicators\(\)/);
 assert.match(branch,/app\.page==='warehouse'&&app\.wh38\.phase==='incoming'\)wh38Shell\('incoming'\)/);
 assert.doesNotMatch(branch,/wh38Shell\('preparing'\)/);
});
