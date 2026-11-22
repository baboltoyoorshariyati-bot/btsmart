'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {PRODUCTS_SEED}=require('./helpers/catalog-fixture');
test('fresh catalog stays empty; upgrades preserve 63, 80, 90 and custom products without changes across restart',()=>{
 for(const count of [0,63,80,90]) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-catalog-preserve-'));
  try{
   const run=(code)=>{const r=spawnSync(process.execPath,['-e',code],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_TEST_EMPTY_CATALOG:'1'},encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout.split('RESULT:')[1].trim());};
   if(count) {
    const products=PRODUCTS_SEED.slice(0,count).map((p,i)=>({...p,name:'نام سفارشی '+i,isActive:i!==1,defaultUnit:i===2?'عدد':'کیلوگرم'}));
    const legacy={meta:{schemaVersion:2,productCatalogVersion:'2026-10-05-catalog-63'},users:[],products,orders:[],orderItems:[],priceList:[],audit:[]};
    fs.writeFileSync(path.join(dir,'db.json'),JSON.stringify(legacy));
   }
   const code="const s=require('./lib/store');s.init();console.log('RESULT:'+JSON.stringify(s.get().products));";
   const first=run(code),second=run(code);
   assert.equal(first.length,count);assert.deepEqual(second,first);
   if(count) {assert.equal(first[0].name,'نام سفارشی 0');assert.equal(first[1].isActive,false);assert.equal(first[2].defaultUnit,'عدد');}
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
});

test('existing SQLite catalogs and linked historical records survive upgrade and restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-catalog-sqlite-'));
 try {
  const run=(code)=>{const r=spawnSync(process.execPath,['-e',code],{cwd:path.join(__dirname,'..'),env:{...process.env,DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_TEST_EMPTY_CATALOG:'1'},encoding:'utf8'});assert.equal(r.status,0,r.stderr+'\n'+r.stdout);return JSON.parse(r.stdout.split('RESULT:')[1].trim());};
  const initial=run(`const s=require('./lib/store'),d=s.init();d.meta.productCatalogVersion='2026-10-05-catalog-63';d.products.push(...${JSON.stringify(PRODUCTS_SEED.slice(0,63))});d.products[0].name='نام ویرایش شده';d.products[1].isActive=false;d.priceList.push({id:'price',productId:'p01',price:123});d.orderItems.push({id:'line',orderId:'old-order',productId:'p01'});s.save();console.log('RESULT:'+JSON.stringify({products:d.products,prices:d.priceList,items:d.orderItems}));`);
  const check=run(`const s=require('./lib/store'),d=s.init();console.log('RESULT:'+JSON.stringify({products:d.products,prices:d.priceList,items:d.orderItems}));`);
  assert.deepEqual(check,initial);assert.equal(check.products.length,63);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
