'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),view=require('../lib/gate-order-view');
test('gate allow-list excludes all financial and signature payloads, including nested item/product fields',()=>{
 const source={id:'o',status:'EXITED',customer:{name:'customer',phone:'09',debt:1000},payment:{totalAmount:999},payments:[{signature:'private'}],deposit:{amount:123},transportInvoice:{totalAmount:456},transportHandovers:{document:{price:123}},items:[{id:'i',product:{name:'product',price:123},deliveredKg:2.75,unitPrice:123,finalAmount:999}],dispatch:{driverName:'driver',status:'IN_TRANSIT',amountDue:999,signatureData:'private',lines:[{unitPrice:123}]}};
 const result=view(source),json=JSON.stringify(result);assert.equal(result.items[0].deliveredKg,2.75);assert.equal(result.customer.name,'customer');assert.equal(result.dispatch.driverName,'driver');assert.doesNotMatch(json,/payment|amount|price|signature|deposit|debt|private|999/i);assert.equal(source.items[0].unitPrice,123);
});
