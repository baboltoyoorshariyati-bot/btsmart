'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),fa=require('../public/audit-fa'),reports=require('../lib/reports');

test('cancellation audit details are readable without changing the original record',()=>{
 const details={visitId:'5acc144a',reason:'اضافه کردن',warehouseDocumentNo:'W-000076',returnedItems:['item-1','item-2'],confirmedNoGoods:true,depositStatus:null};
 const original=JSON.stringify(details),result=fa.text(details,{itemNames:{'item-1':'مرغ'}});
 assert.match(fa.label('SETTLEMENT_CANCELLATION_REQUESTED'),/درخواست انصراف/);
 assert.match(fa.label('SETTLEMENT_CANCELLATION_CONFIRMED'),/تأیید انبار/);
 assert.match(fa.label('PICKUP_CANCELLATION_EXIT'),/خروج.*انصراف/);
 for(const value of ['شناسه مراجعه','علت : اضافه کردن','شماره سند انبار : W-000076','نام محصول در نمای فعلی سفارش: مرغ','شناسه قلم: item-2','تأیید نبود کالا نزد مراجعه‌کننده : بله','وضعیت بیعانه : ثبت نشده'])assert(result.includes(value),value);
 assert.equal(JSON.stringify(details),original);
 assert.equal(fa.scalar(false,'confirmedNoGoods'),'خیر');assert.equal(fa.scalar(0,'amount'),'۰ ریال');assert.equal(fa.scalar('OUT_OF_STOCK','status'),'ناموجود');
 assert.match(fa.label('FUTURE_EVENT'),/عملیات ثبت‌شده.*FUTURE_EVENT/);assert.match(fa.text({unfamiliarField:'value'}),/کلید: unfamiliarField/);
});

test('all literal persisted action names have explicit Persian descriptions',()=>{
 function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(path.join(dir,x.name)):x.name.endsWith('.js')?[path.join(dir,x.name)]:[]);}
 const missing=[];
 for(const file of files(path.join(__dirname,'..','lib'))){const source=fs.readFileSync(file,'utf8');for(const re of [/(?:store\.audit\(|(?<!\.)\baudit\()\s*(?:ctx\.user|user|actor|actor\|\|null|null|this\.user)\s*,\s*['"]([A-Z][A-Z0-9_]+)['"](?!\s*\+)/g,/audit\(ctx,\s*['"]([A-Z][A-Z0-9_]+)['"]/g])for(const m of source.matchAll(re))if(!Object.hasOwn(fa.actions,m[1]))missing.push(`${m[1]}: ${file}`);}
 assert.deepEqual(missing,[]);
 for(const code of ['CUSTOMER_DEBT_RECEIPT_CLEARED','CUSTOMER_DEBT_RECEIPT_RETURNED','CUSTOMER_DEBT_RECEIPT_REVERSED','STORE_RUN_R1_WEIGHT','STORE_RUN_R2_WEIGHT','STORE_RUN_R1_SEND','STORE_RUN_R2_SEND','STORE_PARTIAL_OUT_OF_STOCK','STORE_ORDER_OUT_OF_STOCK'])assert(Object.hasOwn(fa.actions,code),code);
});

test('activity reports default to Persian and accept both Persian and old technical filters',()=>{
 const db={audit:[{action:'SETTLEMENT_CANCELLATION_REQUESTED',entityType:'order',details:{reason:'اضافه کردن',warehouseDocumentNo:'W-000076'}}]};
 for(const value of ['درخواست انصراف','SETTLEMENT_CANCELLATION_REQUESTED']){
  const r=reports.query(db,{source:'activity',filters:[{field:'action',op:'contains',value}]});assert.equal(r.total,1);assert.match(r.rows[0].action,/درخواست انصراف/);assert.match(r.rows[0].details,/علت : اضافه کردن/);assert(!('detailsRaw' in r.rows[0]));
 }
 const raw=reports.query(db,{source:'activity',fields:['actionCode','entityTypeCode','detailsRaw']});assert.equal(raw.rows[0].actionCode,'SETTLEMENT_CANCELLATION_REQUESTED');assert.match(raw.rows[0].detailsRaw,/warehouseDocumentNo/);
});


test('report status and order type are Persian while both old and Persian filters work',()=>{
 const db={customers:[],visits:[],orders:[{id:'o',orderNo:'123',orderType:'REMOTE',status:'WAREHOUSE_PREPARING'}],orderItems:[],payments:[],products:[]};
 for(const value of ['WAREHOUSE_PREPARING','در حال آماده‌سازی انبار']){
  const r=reports.query(db,{source:'orders',fields:['status','orderType'],filters:[{field:'status',op:'equals',value}]});assert.equal(r.total,1);assert.equal(r.rows[0].status,'در حال آماده‌سازی انبار');assert.equal(r.rows[0].orderType,'غیرحضوری');
 }
 assert.equal(db.orders[0].status,'WAREHOUSE_PREPARING');
});
