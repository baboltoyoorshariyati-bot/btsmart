'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {cleanRows}=require('../lib/settlement-methods');
const devices=[{id:'pos-1',title:'پوز فروشگاه',terminalNumber:'123456',bank:'بانک الف',model:'PAX A920',simNumber:'09120000000',isActive:true},{id:'pos-off',title:'پوز قدیمی',terminalNumber:'000000',bank:'بانک ب',model:'X',isActive:false}];
test('پرداخت ترکیبی با snapshot دستگاه پوز اعتبارسنجی و برای سابقه تثبیت می‌شود',()=>{
 const rows=cleanRows([{type:'POS',amount:'۱٬۲۰۰٬۰۰۰',deviceId:'pos-1',reference:'R-1'},{type:'CHECK',amount:300000,bank:'بانک ج',checkNumber:'98765',dueDate:'2026-11-01'}],1500000,{paymentDevices:devices});
 assert.equal(rows.length,2);assert.equal(rows[0].deviceSnapshot.terminalNumber,'123456');assert.equal(rows[0].reference,'R-1');assert.equal(rows[1].checkStatus,'PENDING');
});
test('انتخاب پوز غیرفعال یا مبلغ نامنطبق رد می‌شود',()=>{
 assert.throws(()=>cleanRows([{type:'POS',amount:100,deviceId:'pos-off'}],100,{paymentDevices:devices}));
 assert.throws(()=>cleanRows([{type:'CASH',amount:90}],100,{paymentDevices:devices}));
});
test('کارت‌به‌کارت شناسه می‌خواهد و معوق نیازمند توضیح نیست',()=>{
 assert.throws(()=>cleanRows([{type:'CARD_TRANSFER',amount:100,bank:'بانک'}],100,{paymentDevices:devices}));
 assert.equal(cleanRows([{type:'CREDIT',amount:100}],100,{paymentDevices:devices})[0].reason,'');
});