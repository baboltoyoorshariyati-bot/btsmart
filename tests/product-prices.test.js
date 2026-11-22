'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {effectivePrices}=require('../lib/product-prices');
test('effective prices select latest no later than requested date, including zero',()=>{
 const rows=[{id:'future',productId:'a',date:'2099-01-01',price:999},{id:'old',productId:'a',date:'2020-01-01',price:100},{id:'zero',productId:'a',date:'2020-02-01',price:0},{id:'same',productId:'b',date:'2020-01-01',price:2},{id:'same2',productId:'b',date:'2020-01-01',price:3}];
 assert.equal(effectivePrices(rows,'2020-01-31').get('a').price,100);
 assert.equal(effectivePrices(rows,'2020-02-01').get('a').price,0);
 assert.equal(effectivePrices(rows,'2020-02-01').get('b').price,3);
 assert.equal(effectivePrices(rows,'2019-01-01').size,0);
 assert.equal(effectivePrices(rows,'2099-01-01').get('a').price,999);
});
