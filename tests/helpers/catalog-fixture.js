'use strict';
// Historical 90-product example data for tests only; never used by the app.
const rows=require('../fixtures/product-catalog-90.json');
const PRODUCTS_SEED=rows.map(([code,name])=>({id:'p'+String(code).padStart(2,'0'),quickCode:String(code).padStart(2,'0'),name,defaultUnit:'کیلوگرم',isActive:true}));
module.exports={PRODUCTS_SEED};
