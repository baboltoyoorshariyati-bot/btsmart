'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const group=require('../public/store-document-group');
test('partial print groups exact same names, sums known weights and leaves source intact',()=>{
 const input=[{itemId:'a',productName:'مرغ',deliveredKg:1.2,returnKg:0,shortageKg:null,netKg:1.2},{itemId:'b',productName:' مرغ ',deliveredKg:2.4,returnKg:1,shortageKg:0,netKg:1.4},{itemId:'c',productName:'ران',deliveredKg:3},{itemId:'d',productName:'مرغ',deliveredKg:0.003,returnKg:0,shortageKg:0,netKg:0.003},{itemId:'e',productName:'مرغ',deliveredKg:50,outOfStock:true}];
 const original=structuredClone(input),rows=group(input);assert.equal(rows.length,2);assert.equal(rows[0].deliveredKg,3.603);assert.equal(rows[0].returnKg,1);assert.equal(rows[0].shortageKg,null);assert.equal(rows[0].netKg,2.603);assert.equal(rows[1].productName,'ران');assert.deepEqual(input,original);
});
test('unknown weights remain unknown and unnamed or deleted products are not merged',()=>{
 const rows=group([{productName:'مرغ',deliveredKg:null},{productName:'مرغ',deliveredKg:2},{productName:'کالای حذف‌شده',deliveredKg:4},{productName:'کالای حذف‌شده',deliveredKg:5},{productName:'',deliveredKg:1},{productName:'',deliveredKg:1}]);
 assert.equal(rows.length,5);assert.equal(rows[0].deliveredKg,null);
});

test('legacy and corrected sub-gram values are summed before final formatting',()=>{
 const rows=group([{productName:'مرغ',deliveredKg:1.0004},{productName:'مرغ',deliveredKg:1.0004},{productName:'مرغ',deliveredKg:0.001}]);
 assert.equal(rows[0].deliveredKg,2.0018);assert.equal(new Intl.NumberFormat('en',{maximumFractionDigits:3}).format(rows[0].deliveredKg),'2.002');
});
