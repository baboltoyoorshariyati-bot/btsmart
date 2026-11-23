'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {DatabaseSync}=require('node:sqlite');

test('final warehouse documents return through an audited edit queue; invoice prices and settlement methods honor the 72-hour manager rule',{timeout:90000},async()=>{
 const port=await new Promise(resolve=>{const server=net.createServer().listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value));});});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-doc-edit-')),base=`http://127.0.0.1:${port}`,password='Changed!2345';
 let proc;
 const start=()=>spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DATA_DIR:dir,ADMIN_INITIAL_PASSWORD:'Initial!2345',BT_PICKUP_STAGING:'false',BT_EXPERIMENTAL_TRANSPORT_WORKFLOW:'0'},stdio:['ignore','pipe','pipe']});
 const ready=()=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('startup timeout')),15000);proc.stdout.on('data',data=>{if(String(data).includes('"listening"')){clearTimeout(timeout);resolve();}});proc.once('exit',code=>reject(Error(`server exited ${code}`)));});
 const stop=async()=>{if(proc&&proc.exitCode===null&&proc.signalCode===null){const done=new Promise(resolve=>proc.once('exit',resolve));proc.kill('SIGTERM');await done;}};
 const call=async(method,url,body,cookie)=>{const response=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{status:response.status,body:await response.json(),cookie:(response.headers.get('set-cookie')||'').split(';')[0]};};
 const ok=async(method,url,body,cookie,status=200)=>{const result=await call(method,url,body,cookie);assert.equal(result.status,status,`${method} ${url}: ${JSON.stringify(result.body)}`);return result.body;};
 async function makeInvoice(sales,warehouse,product='p01',kg=2,settlementMethods=null,depositAmount=0){
  const date=new Date(),day=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const order=(await ok('POST','/api/orders/remote',{name:'مشتری ویرایش سند',phone:'09121112233',dispatchPlace:'بابل',scheduledDate:day,scheduledAt:day+'T00:00',deliveryMode:'PICKUP',...(depositAmount?{deposit:{type:'CASH',amount:depositAmount}}:{}),items:[{productId:product,requestedQty:kg+2,requestedUnit:'کیلوگرم'}]},sales,201)).order;
  await ok('POST',`/api/orders/${order.id}/warehouse/accept`,{},warehouse);
  await ok('POST',`/api/orders/${order.id}/warehouse/start-preparing`,{},warehouse);
  await ok('POST',`/api/orders/${order.id}/warehouse`,{items:[{itemId:order.items[0].id,deliveredKg:kg}]},warehouse);
  await ok('POST',`/api/orders/${order.id}/settle`,{items:[{itemId:order.items[0].id,unitPrice:1000}],discountAmount:0,additionsAmount:0,settlementMethods:settlementMethods||[{type:'CASH',amount:kg*1000-depositAmount}]},sales);
  const expanded=(await ok('GET',`/api/orders/${order.id}`,null,sales)).order;
  return{order:expanded,payment:expanded.payment};
 }
 try{
  proc=start();await ready();
  const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;
  await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:password},admin);
  for(const [username,roleCode,extra] of [['edit-sales','sales',{}],['edit-warehouse','warehouse',{}],['edit-gate','gate',{}],['edit-store','store',{storeName:'فروشگاه شعبه ۱ بابل طیور حمزه کلا',branchNo:1}]])await ok('POST','/api/admin/users',{username,roleCode,fullName:username,position:'آزمون',password,mustChangePassword:false,...extra},admin,201);
  const driverRecord=await ok('POST','/api/drivers',{fullName:'راننده آزمون ویرایش',phone:'09124445555',vehicleType:'وانت',plate:'12ب34567'},admin,201);
  await ok('POST','/api/admin/users',{username:'edit-driver',roleCode:'driver',fullName:'راننده آزمون ویرایش',position:'آزمون',password,mustChangePassword:false,driverId:driverRecord.driver.id},admin,201);
  const sales=(await call('POST','/api/login',{username:'edit-sales',password})).cookie;
  const warehouse=(await call('POST','/api/login',{username:'edit-warehouse',password})).cookie;
  const gate=(await call('POST','/api/login',{username:'edit-gate',password})).cookie;
  const shop=(await call('POST','/api/login',{username:'edit-store',password})).cookie;
  const driver=(await call('POST','/api/login',{username:'edit-driver',password})).cookie;

  const first=await makeInvoice(sales,warehouse);
  const invoiceContext=await ok('GET',`/api/sales/orders/${first.order.id}/invoices/${first.payment.id}/edit`,null,sales);
  assert.equal(invoiceContext.canEdit,true);assert.equal(invoiceContext.lines[0].unitPrice,1000);assert.equal(invoiceContext.payment.settlementMethods[0].amount,2000);
  assert.equal((await call('GET',`/api/sales/orders/${first.order.id}/invoices/${first.payment.id}/edit`,null,warehouse)).status,403,'انبار اجازهٔ ویرایش مالی فاکتور را ندارد');
  assert.equal((await call('PUT',`/api/sales/orders/${first.order.id}/invoices/${first.payment.id}`,{items:[{itemId:first.order.items[0].id,unitPrice:1200}],settlementMethods:[{type:'CASH',amount:2400}]},warehouse)).status,403,'ویرایش قیمت فقط برای فروش یا مدیر است');
  let result=await ok('PUT',`/api/sales/orders/${first.order.id}/invoices/${first.payment.id}`,{items:[{itemId:first.order.items[0].id,unitPrice:1200}],settlementMethods:[{type:'CASH',amount:2400}]},sales);
  assert.equal(result.order.payment.totalAmount,2400);
  assert.equal(result.order.payment.settlementMethods[0].amount,2400);
  assert.equal(result.order.items[0].unitPrice,1200);
  const beforeExit=(await ok('POST',`/api/orders/${first.order.id}/exit`,{checkedItems:[first.order.items[0].id]},gate)).order;
  assert.equal(beforeExit.status,'EXITED');assert(!('payment' in beforeExit));assert(!('payments' in beforeExit));assert(!('unitPrice' in beforeExit.items[0]));const gateRead=(await ok('GET',`/api/orders/${first.order.id}`,null,gate)).order;assert(!('payment' in gateRead));assert(!('finalAmount' in gateRead.items[0]));const exitedAt=beforeExit.exitedAt,warehouseCompletedAt=beforeExit.warehouseCompletedAt;

  const request=await ok('POST',`/api/sales/orders/${first.order.id}/invoices/${first.payment.id}/warehouse-edit`,{reason:'اصلاح وزن و محصول'},sales);
  assert.equal(request.edit.status,'PENDING_WAREHOUSE');
  assert.equal((await ok('GET','/api/warehouse/document-edits',null,warehouse)).requests.length,1);
  assert.equal((await ok('GET','/api/warehouse/delivered',null,warehouse)).total,0,'سند در زمان ارجاع از فهرست نهایی انبار خارج شود');
  const edit=await ok('GET',`/api/warehouse/document-edits/${first.order.id}/${first.payment.id}`,null,warehouse);
  assert.equal(edit.edit.items[0].deliveredKg,2);
  const nextProduct=edit.products.find(row=>row.id==='p02');assert(nextProduct);
  assert.equal((await call('PUT',`/api/warehouse/document-edits/${first.order.id}/${first.payment.id}`,{items:[{itemId:first.order.items[0].id,productId:'p02',deliveredKg:3.5,outOfStock:true}]},warehouse)).status,400,'وضعیت موجودی در اصلاح وزن/محصول تغییر نکند');
  result=await ok('PUT',`/api/warehouse/document-edits/${first.order.id}/${first.payment.id}`,{items:[{itemId:first.order.items[0].id,productId:'p02',deliveredKg:3.5}]},warehouse);
  assert.equal(result.edit.status,'PENDING_SALES_REVIEW');
  assert.equal(result.orderId,first.order.id);
  assert.equal(Object.hasOwn(result,'payment'),false,'انباردار نباید جزئیات مالی فاکتور را دریافت کند');
  let corrected=(await ok('GET',`/api/orders/${first.order.id}`,null,sales)).order;
  assert.equal(corrected.status,'EXITED','اصلاح سند نباید تحویل، تسویه یا خروج را به گردش قبلی برگرداند');
  assert.equal(corrected.exitedAt,exitedAt,'ثبت خروج واقعی حفظ شود');assert.equal(corrected.warehouseCompletedAt,warehouseCompletedAt,'زمان تکمیل انبار حفظ شود');
  assert.equal(corrected.payment.totalAmount,4200);
  assert.equal(corrected.payment.amountDue,4200);
  assert.equal(corrected.payment.settlementMethods[0].amount,2400,'دریافت واقعی پیشین نباید با اصلاح وزن تغییر کند');
  assert.equal(corrected.payment.settlementReviewRequired,true);
  let whDoc=await ok('GET',`/api/warehouse/delivered/${first.order.id}`,null,warehouse);
  assert.equal(whDoc.order.items[0].productId,'p02');assert.equal(whDoc.order.items[0].deliveredKg,3.5);
  assert.equal((await ok('GET','/api/warehouse/document-edits',null,warehouse)).requests.length,0);

  result=await ok('PUT',`/api/sales/orders/${first.order.id}/invoices/${first.payment.id}`,{items:[{itemId:first.order.items[0].id,unitPrice:1200}],settlementMethods:[{type:'CASH',amount:2400}]},sales);
  assert.equal(result.order.payment.documentEditHistory.at(-1).before.settlementMethods[0].amount,2400);
  let debtData=await ok('GET',`/api/customers/${first.order.customerId}/debts`,null,sales);
  assert.equal(debtData.invoices.find(x=>x.paymentId===first.payment.id).balance,1800);
  result=await ok('PUT',`/api/sales/orders/${first.order.id}/invoices/${first.payment.id}`,{items:[{itemId:first.order.items[0].id,unitPrice:1200}],settlementMethods:[{type:'CARD_TRANSFER',amount:5000,bank:'بانک نمونه',reference:'REF-1'}]},sales);
  debtData=await ok('GET',`/api/customers/${first.order.customerId}/debts`,null,sales);
  assert.equal(debtData.invoices.find(x=>x.paymentId===first.payment.id).credit,800,'پرداخت اصلاح‌شدهٔ بیشتر، بستانکاری بسازد');
  assert.equal(result.order.payment.documentEditHistory.at(-1).before.settlementMethods[0].type,'CASH');
  assert.equal(result.order.payment.settlementMethods[0].type,'CARD_TRANSFER');
  result=await ok('PUT',`/api/sales/orders/${first.order.id}/invoices/${first.payment.id}`,{items:[{itemId:first.order.items[0].id,unitPrice:1200}],settlementMethods:[{type:'CASH',amount:2400},{type:'CREDIT',amount:1800,reason:'تفاوت مبلغ پس از اصلاح وزن'}]},sales);
  assert.equal(result.order.payment.settlementReviewRequired,false);
  assert.equal(result.order.payment.settlementMethods[0].type,'CASH');assert.equal(result.order.payment.settlementMethods[0].amount,2400);
  assert.equal(result.order.payment.settlementMethods[1].type,'CREDIT');assert.equal(result.order.payment.settlementMethods[1].amount,1800);
  const events=(await ok('GET',`/api/sales/history/${first.order.id}`,null,sales)).events;
  assert(events.some(event=>event.action==='WAREHOUSE_DOCUMENT_EDITED'));
  assert(events.some(event=>event.action==='SALES_INVOICE_EDITED'));
  assert.equal((await ok('GET',`/api/warehouse/document-edits/history/${first.order.id}/${first.payment.id}`,null,sales)).edits.at(-1).status,'COMPLETED');

  // A sales user cannot edit either document once its 72-hour clock expires;
  // a manager can correct it without changing previously received debt receipts.
  const old=await makeInvoice(sales,warehouse,'p01',1,[{type:'CASH',amount:600},{type:'CREDIT',amount:400}]);
  await ok('POST',`/api/customers/${old.order.customerId}/debts/${old.payment.id}/receipts`,{operationId:'edit-receipt-001',type:'CASH',amount:100},sales,201);
  const raw=new DatabaseSync(path.join(dir,'baboltoyoor.db'));
  const storedPayment=raw.prepare('SELECT payload FROM payments WHERE id=?').get(old.payment.id);
  const oldPayment=JSON.parse(storedPayment.payload);oldPayment.verifiedAt='2020-01-01T00:00:00.000Z';
  raw.prepare('UPDATE payments SET payload=? WHERE id=?').run(JSON.stringify(oldPayment),old.payment.id);
  const storedOrder=raw.prepare('SELECT payload FROM orders WHERE id=?').get(old.order.id);
  const oldOrder=JSON.parse(storedOrder.payload);oldOrder.warehouseCompletedAt='2020-01-01T00:00:00.000Z';
  raw.prepare('UPDATE orders SET payload=? WHERE id=?').run(JSON.stringify(oldOrder),old.order.id);raw.close();
  assert.equal((await ok('GET',`/api/sales/orders/${old.order.id}/invoices/${old.payment.id}/edit`,null,sales)).canEdit,false);
  assert.equal((await ok('GET',`/api/sales/orders/${old.order.id}/invoices/${old.payment.id}/edit`,null,admin)).canEdit,true);
  assert.equal((await call('PUT',`/api/sales/orders/${old.order.id}/invoices/${old.payment.id}`,{items:[{itemId:old.order.items[0].id,unitPrice:1000}],settlementMethods:[{type:'CASH',amount:600},{type:'CREDIT',amount:400}]},sales)).status,403);
  assert.equal((await call('POST',`/api/sales/orders/${old.order.id}/invoices/${old.payment.id}/warehouse-edit`,{reason:'اصلاح دیرهنگام'},sales)).status,403);
  await ok('POST',`/api/sales/orders/${old.order.id}/invoices/${old.payment.id}/warehouse-edit`,{reason:'اصلاح دیرهنگام با تأیید مدیر'},admin);
  assert.equal((await call('PUT',`/api/warehouse/document-edits/${old.order.id}/${old.payment.id}`,{items:[{itemId:old.order.items[0].id,productId:'p01',deliveredKg:1.5}]},warehouse)).status,403);
  result=await ok('PUT',`/api/warehouse/document-edits/${old.order.id}/${old.payment.id}`,{items:[{itemId:old.order.items[0].id,productId:'p01',deliveredKg:1.5}]},admin);
  assert.equal(result.edit.status,'PENDING_SALES_REVIEW');
  let oldCurrent=(await ok('GET',`/api/orders/${old.order.id}`,null,admin)).order;
  assert.equal(oldCurrent.payment.totalAmount,1500);assert.equal(oldCurrent.payment.debtAccount.initial,400);
  assert.deepEqual(oldCurrent.payment.debtAccount.receipts,[{amount:100,status:'CLEARED'}],'رسید واقعی قبلی در اصلاح انبار حفظ شود');
  result=await ok('PUT',`/api/sales/orders/${old.order.id}/invoices/${old.payment.id}`,{items:[{itemId:old.order.items[0].id,unitPrice:1000}],settlementMethods:[{type:'CASH',amount:600},{type:'CREDIT',amount:900,reason:'افزایش مانده پس از بازبینی'}]},admin);
  assert.equal(result.order.payment.documentEditHistory.at(-1).kind,'SALES');
  assert.equal(result.order.payment.debtAccount.initial,900);assert.deepEqual(result.order.payment.debtAccount.receipts,[{amount:100,status:'CLEARED'}]);
  assert.equal((await ok('GET',`/api/warehouse/document-edits/history/${old.order.id}/${old.payment.id}`,null,sales)).edits.at(-1).status,'COMPLETED');

  // A lower corrected invoice may temporarily fall below its received deposit;
  // recording the weight correction must not reject it or issue an automatic refund.
  const depositOverage=await makeInvoice(sales,warehouse,'p01',2,[{type:'CASH',amount:500}],1500);
  await ok('POST',`/api/sales/orders/${depositOverage.order.id}/invoices/${depositOverage.payment.id}/warehouse-edit`,{reason:'کاهش وزن نسبت به بیعانه'},sales);
  result=await ok('PUT',`/api/warehouse/document-edits/${depositOverage.order.id}/${depositOverage.payment.id}`,{items:[{itemId:depositOverage.order.items[0].id,productId:'p01',deliveredKg:0.5}]},warehouse);
  const depositCorrected=(await ok('GET',`/api/orders/${depositOverage.order.id}`,null,sales)).order;
  assert.equal(result.edit.status,'PENDING_SALES_REVIEW');assert.equal(depositCorrected.payment.totalAmount,500);assert.equal(depositCorrected.payment.amountDue,0);assert.equal(depositCorrected.payment.depositExcessAmount,1000);
  assert.equal(depositCorrected.deposit.refundedAmount,undefined,'اصلاح وزن نباید بیعانه را خودکار مسترد کند');assert.equal(depositCorrected.payment.settlementMethods[0].amount,500);
  assert.equal(depositCorrected.payment.documentEditHistory.at(-1).after.totalAmount,500,'پس از اصلاح، نسخهٔ جدید نیز در سابقه ثبت شود');

  result=await ok('PUT',`/api/sales/orders/${depositOverage.order.id}/invoices/${depositOverage.payment.id}`,{items:[{itemId:depositOverage.order.items[0].id,unitPrice:1000}],settlementMethods:[{type:'CASH',amount:500}]},sales);
  debtData=await ok('GET',`/api/customers/${depositOverage.order.customerId}/debts`,null,sales);
  assert.equal(debtData.invoices.find(x=>x.paymentId===depositOverage.payment.id).credit,1500,'اضافه بیعانه و پرداخت قبلی هر دو در بستانکاری محاسبه شوند');
  assert.equal(result.order.deposit.refundedAmount,undefined);

  const historyCase=await makeInvoice(sales,warehouse,'p01',2);
  for(let i=0;i<27;i++) await ok('PUT',`/api/sales/orders/${historyCase.order.id}/invoices/${historyCase.payment.id}`,{items:[{itemId:historyCase.order.items[0].id,unitPrice:1000}],settlementMethods:[{type:'CASH',amount:2000}]},sales);
  const historyData=await ok('GET',`/api/orders/${historyCase.order.id}`,null,sales);assert.equal(historyData.order.payment.documentEditHistory.length,27,'سابقهٔ اصلاحات قبلی نباید با تکرار ویرایش حذف شود');

  const cheque=await makeInvoice(sales,warehouse,'p01',2);
  const chequeUrl=`/api/sales/orders/${cheque.order.id}/invoices/${cheque.payment.id}`;
  const chequeRow={type:'CHECK',amount:1000,bank:'بانک نمونه',checkNumber:'12345',dueDate:'2030-01-01'};
  result=await ok('PUT',chequeUrl,{items:[{itemId:cheque.order.items[0].id,unitPrice:1000}],settlementMethods:[{type:'CASH',amount:1000},chequeRow]},sales);
  debtData=await ok('GET',`/api/customers/${cheque.order.customerId}/debts`,null,sales);
  let chequeDebt=debtData.invoices.find(x=>x.paymentId===cheque.payment.id);
  assert.equal(chequeDebt.balance,1000);assert.equal(chequeDebt.pending,1000);assert.equal(chequeDebt.available,0);
  assert.equal((await call('PUT',chequeUrl,{items:[{itemId:cheque.order.items[0].id,unitPrice:100}],settlementMethods:[{type:'CASH',amount:1000},chequeRow]},sales)).status,409,'چک در انتظار را نباید به بستانکاری تبدیل کرد');
  assert.equal((await call('PUT',chequeUrl,{items:[{itemId:cheque.order.items[0].id,unitPrice:1000}],settlementMethods:[{type:'CASH',amount:2000}]},sales)).status,409,'سوابق چک قابل حذف نیست');
  await ok('POST',`/api/customers/${cheque.order.customerId}/debts/${cheque.payment.id}/receipts/${chequeDebt.receipts[0].id}/resolve`,{status:'CLEARED'},sales);
  debtData=await ok('GET',`/api/customers/${cheque.order.customerId}/debts`,null,sales);chequeDebt=debtData.invoices.find(x=>x.paymentId===cheque.payment.id);assert.equal(chequeDebt.balance,0);assert.equal(chequeDebt.pending,0);
  result=await ok('PUT',chequeUrl,{items:[{itemId:cheque.order.items[0].id,unitPrice:500}],settlementMethods:[{type:'CASH',amount:1000},chequeRow]},sales);
  debtData=await ok('GET',`/api/customers/${cheque.order.customerId}/debts`,null,sales);chequeDebt=debtData.invoices.find(x=>x.paymentId===cheque.payment.id);assert.equal(chequeDebt.credit,1000);assert.equal(chequeDebt.receipts.length,1);
  assert.equal(result.order.payment.settlementMethods[1].checkStatus,'CLEARED');

  const later=await makeInvoice(sales,warehouse,'p01',2);
  const laterUrl=`/api/sales/orders/${later.order.id}/invoices/${later.payment.id}`;
  await ok('PUT',laterUrl,{items:[{itemId:later.order.items[0].id,unitPrice:1500}],settlementMethods:[{type:'CASH',amount:2000}]},sales);
  const newReceipt=await ok('POST',`/api/customers/${later.order.customerId}/debts/${later.payment.id}/receipts`,{operationId:'correction-receipt-01',type:'CASH',amount:700},sales,201);
  await ok('PUT',laterUrl,{items:[{itemId:later.order.items[0].id,unitPrice:1000}],settlementMethods:[{type:'CASH',amount:2000}]},sales);
  debtData=await ok('GET',`/api/customers/${later.order.customerId}/debts`,null,sales);
  let laterDebt=debtData.invoices.find(x=>x.paymentId===later.payment.id);assert.equal(laterDebt.credit,700);assert.equal(laterDebt.receipts.length,1);
  await ok('POST',`/api/customers/${later.order.customerId}/debts/${later.payment.id}/receipts/${newReceipt.receipt.id}/resolve`,{status:'REVERSED'},admin);
  debtData=await ok('GET',`/api/customers/${later.order.customerId}/debts`,null,sales);laterDebt=debtData.invoices.find(x=>x.paymentId===later.payment.id);assert.equal(laterDebt.credit,0);assert.equal(laterDebt.balance,0);

  const orphan=await makeInvoice(sales,warehouse,'p02',2);
  const orphanDb=new DatabaseSync(path.join(dir,'baboltoyoor.db'));
  const rawOrder=JSON.parse(orphanDb.prepare('SELECT payload FROM orders WHERE id=?').get(orphan.order.id).payload);rawOrder.customerId=null;rawOrder.visitId=null;
  orphanDb.prepare('UPDATE orders SET payload=? WHERE id=?').run(JSON.stringify(rawOrder),orphan.order.id);orphanDb.close();
  assert.equal((await call('PUT',`/api/sales/orders/${orphan.order.id}/invoices/${orphan.payment.id}`,{items:[{itemId:orphan.order.items[0].id,unitPrice:1500}],settlementMethods:[{type:'CASH',amount:2000}]},sales)).status,409,'اختلاف مالی بدون پرونده معتبر نباید حذف یا صفر نشان داده شود');

  // A store-service document follows the same referral queue, while retaining
  // its no-settlement/no-invoice nature and per-run corrected snapshot.
  const storeOrder=(await ok('POST','/api/store/orders',{name:'مشتری فروشگاه آزمون',phone:'09123334444',items:[{productId:'p01',requestedQty:10,requestedUnit:'کیلوگرم'}]},shop,201)).order;
  const canonicalStoreName='فروشگاه شعبه 1 حمزه کلا';
  const salesHistory=(await ok('GET',`/api/sales/history?q=${encodeURIComponent(storeOrder.orderNo)}`,null,sales)).orders.find(row=>row.id===storeOrder.id);
  assert.equal(salesHistory?.customerName,canonicalStoreName,'فهرست فروش برای سفارش فروشگاه نام مشتری سفارش را جای نام فروشگاه نشان ندهد');
  await ok('POST',`/api/store/orders/${storeOrder.id}/quick-send`,{},sales);
  await ok('POST',`/api/orders/${storeOrder.id}/warehouse/accept`,{},warehouse);
  await ok('POST',`/api/orders/${storeOrder.id}/warehouse/start-preparing`,{},warehouse);
  await ok('POST',`/api/orders/${storeOrder.id}/store-run/weights`,{run:1,items:[{itemId:storeOrder.items[0].id,deliveredKg:5}]},warehouse);
  await ok('POST',`/api/orders/${storeOrder.id}/store-run/send-run`,{run:1},warehouse);
  const assigned=(await ok('POST',`/api/orders/${storeOrder.id}/send-dispatch`,{driverId:driverRecord.driver.id,run:1},sales)).order;
  assert.equal(assigned.dispatch.run,1);assert.equal((await ok('POST',`/api/driver/orders/${storeOrder.id}/exit`,{},driver)).order.dispatch.status,'DRIVER_EXIT_REPORTED');
  assert.equal((await ok('POST',`/api/gate/dispatch/${storeOrder.id}/exit`,{},gate)).order.dispatch.status,'IN_TRANSIT');
  await ok('POST',`/api/driver/orders/${storeOrder.id}/deliver`,{signatureData:`data:image/png;base64,${'A'.repeat(300)}`,settlementType:'CASH',lines:[{itemId:storeOrder.items[0].id,returnKg:0,shortageKg:0}]},driver);
  await ok('POST',`/api/sales/dispatch-deliveries/${storeOrder.id}/finalize`,{},sales);
  const storeFinal=(await ok('GET',`/api/orders/${storeOrder.id}`,null,sales)).order;
  const storePayment=storeFinal.payments.find(row=>Number(row.deliveryRun)===1);assert(storePayment,'سند سرویس فروشگاه صادر شده باشد');
  await ok('POST',`/api/sales/orders/${storeOrder.id}/invoices/${storePayment.id}/warehouse-edit`,{reason:'اصلاح وزن سرویس فروشگاه'},sales);
  const pendingStoreEdit=(await ok('GET','/api/warehouse/document-edits',null,warehouse)).requests.find(row=>row.orderId===storeOrder.id);
  assert.equal(pendingStoreEdit?.orderType,'STORE');assert.equal(pendingStoreEdit?.customerName,canonicalStoreName,'صف اصلاح سند برای سفارش فروشگاه نام canonical را نشان دهد');
  assert.equal((await ok('GET','/api/warehouse/store-documents',null,warehouse)).documents.some(row=>row.orderId===storeOrder.id&&row.run===1),false,'سند فروشگاه هنگام ارجاع از فهرست چاپ جدا شود');
  const storeEdit=await ok('GET',`/api/warehouse/document-edits/${storeOrder.id}/${storePayment.id}`,null,warehouse);assert.equal(storeEdit.edit.items[0].deliveredKg,5);
  result=await ok('PUT',`/api/warehouse/document-edits/${storeOrder.id}/${storePayment.id}`,{items:[{itemId:storeOrder.items[0].id,productId:'p02',deliveredKg:6}]},warehouse);
  assert.equal(result.edit.status,'COMPLETED');assert.equal(result.warehouseDocument.lines[0].productId,'p02');assert.equal(result.warehouseDocument.lines[0].deliveredKg,6);
  const storeReviewed=(await ok('GET',`/api/orders/${storeOrder.id}`,null,sales)).order;assert.equal(storeReviewed.payment.totalAmount,0);assert.equal(storeReviewed.payment.settlementMethods.length,0,'سند فروشگاه هیچ تسویهٔ مالی ایجاد نکند');
  const storePrint=await ok('GET',`/api/orders/${storeOrder.id}/store-run/print/1`,null,warehouse);
  assert.equal(storePrint.document.lines[0].productId,'p02');assert.equal(storePrint.document.lines[0].deliveredKg,6);
  assert.equal((await ok('GET',`/api/warehouse/document-edits/history/${storeOrder.id}/${storePayment.id}`,null,sales)).edits.at(-1).status,'COMPLETED');
  assert.equal((await ok('GET','/api/admin/audit/verify',null,admin)).ok,true);
  await stop();proc=start();await ready();
  const adminAgain=(await call('POST','/api/login',{username:'admin',password})).cookie;
  debtData=await ok('GET',`/api/customers/${cheque.order.customerId}/debts`,null,adminAgain);
  chequeDebt=debtData.invoices.find(x=>x.paymentId===cheque.payment.id);assert.equal(chequeDebt.credit,1000);assert.equal(chequeDebt.receipts[0].status,'CLEARED');
  debtData=await ok('GET',`/api/customers/${depositOverage.order.customerId}/debts`,null,adminAgain);assert.equal(debtData.invoices.find(x=>x.paymentId===depositOverage.payment.id).credit,1500);

 }finally{
  await stop();fs.rmSync(dir,{recursive:true,force:true});
 }
});
