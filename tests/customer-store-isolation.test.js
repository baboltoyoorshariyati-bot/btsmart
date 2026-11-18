'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {summarize,customerOrders}=require('../lib/customers');const debt=require('../lib/customer-debts');
test('store orders never contribute to customer summary or debt, without altering records',()=>{
 const c={id:'c',lastVisitAt:'2026-11-01'},db={orders:[{id:'normal',customerId:'c',orderType:'REMOTE',createdAt:'2026-01-01'},{id:'shop',customerId:'c',orderType:'STORE',createdAt:'2026-10-01'}],visits:[],payments:[{id:'np',orderId:'normal',debtAccount:{customerId:'c',initial:20,receipts:[]}},{id:'sp',orderId:'shop',debtAccount:{customerId:'c',initial:100,receipts:[]}}]};const before=JSON.stringify(db);
 assert.equal(summarize(db,c).orderCount,1);assert.equal(summarize(db,c).lastActivityAt,'2026-01-01');assert.deepEqual(customerOrders(db,'c').map(o=>o.id),['normal']);assert.equal(debt.list(db,'c').balance,20);assert.deepEqual(debt.list(db,'c').invoices.map(i=>i.paymentId),['np']);assert.equal(JSON.stringify(db),before);
 db.orders.splice(0,1);assert.equal(summarize(db,c).lastActivityAt,null);assert.equal(summarize(db,c).orderCount,0);
});
