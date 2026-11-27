'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {ensureTransferNumbers,nextTransferNumber}=require('../lib/store-transfer-numbers');
test('legacy transfer labels get stable unique numeric numbers and keep their original and history',()=>{
 const history=[{action:'CREATED',name:'آزمایش',at:'2026-01-01'}];
 const data={counters:{storeTransferNumber:7},storeTransfers:[{id:'b',number:'T-B',createdAt:'2026-01-02',history},{id:'a',number:'T-A',createdAt:'2026-01-01',history},{id:'c',number:'5',createdAt:'2026-01-03'}],idempotency:[{body:{transfer:{id:'a',number:'T-A'}}}]};
 assert.equal(ensureTransferNumbers(data),true);assert.deepEqual(data.storeTransfers.map(t=>[t.number,t.legacyNumber]),[['9','T-B'],['8','T-A'],['5',undefined]]);assert.deepEqual(data.storeTransfers[0].history,history);assert.equal(data.idempotency[0].body.transfer.number,'8');assert.equal(data.idempotency[0].body.transfer.legacyNumber,'T-A');assert.equal(ensureTransferNumbers(data),false);assert.equal(nextTransferNumber(data),'10');
});
test('duplicates and out-of-date counters never reuse an existing number',()=>{
 const data={counters:{storeTransferNumber:0},storeTransfers:[{id:'a',number:'4'},{id:'b',number:'4'},{id:'c',number:'2'}]};ensureTransferNumbers(data);assert.deepEqual(data.storeTransfers.map(t=>t.number),['4','5','2']);assert.equal(data.storeTransfers[1].legacyNumber,'4');assert.equal(nextTransferNumber(data),'6');
});

test('empty data repair does not write a zero counter',()=>{const data={counters:{},storeTransfers:[]};assert.equal(ensureTransferNumbers(data),false);assert.deepEqual(data.counters,{});});
