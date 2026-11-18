'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {admin,owns}=require('../lib/store-access');
test('administrator ownership exception never grants another shop access',()=>{
 const order={storeId:'s1'};assert(admin({roleCode:'admin'}));assert(owns({roleCode:'admin',id:'a'},order));assert(owns({roleCode:'store',id:'s1'},order));assert(!owns({roleCode:'store',id:'s2'},order));
});
test('delivery loading reads every page and preserves selected admin branch',async()=>{
 const source=fs.readFileSync(require('node:path').join(__dirname,'../ui-src/ui2/06-store-services.js'),'utf8');
 const calls=[],c={app:{user:{roleCode:'admin'},storeBranchNo:2},encodeURIComponent,api:async url=>{calls.push(url);const offset=Number(new URL(url,'http://test').searchParams.get('offset'));return {total:205,orders:Array.from({length:Math.min(100,205-offset)},(_,i)=>({id:offset+i}))};}};
 vm.createContext(c);vm.runInContext(source.slice(source.indexOf('function storeScopeQuery'),source.indexOf('async function renderStoreRegistered')),c);
 const data=await c.storeAllOrders();assert.equal(data.orders.length,205);assert.equal(calls.length,3);assert(calls.every(url=>url.includes('branchNo=2')));c.app.user.roleCode='store';assert.equal(c.storeScopeQuery(),'');
});
