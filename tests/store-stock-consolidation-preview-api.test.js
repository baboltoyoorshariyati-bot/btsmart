'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');

test('پیش‌نمایش تجمیع فقط خواندنی و محدود به سفارش‌های تأییدشدهٔ یک شعبه است', {timeout: 90000}, async () => {
  const port = await new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-stock-preview-')), base = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, ['server.js'], { cwd:path.join(__dirname,'..'), env:{...process.env, HOST:'127.0.0.1', PORT:String(port), DATA_DIR:dir, ADMIN_INITIAL_PASSWORD:'Initial!2345'}, stdio:['ignore','pipe','pipe'] });
  try {
    await new Promise((resolve,reject) => { const timer=setTimeout(()=>reject(Error('startup timeout')),15000); proc.stdout.on('data',d=>{if(String(d).includes('"listening"')){clearTimeout(timer);resolve();}}); proc.once('exit',code=>reject(Error('server exited '+code))); });
    const call = async (method,url,body,cookie) => { const response=await fetch(base+url,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}); return {status:response.status,body:await response.json(),cookie:(response.headers.get('set-cookie')||'').split(';')[0]}; };
    const ok = async (method,url,body,cookie) => {const r=await call(method,url,body,cookie); assert.ok(r.status>=200&&r.status<300,`${url}: ${r.status} ${JSON.stringify(r.body)}`); return r.body;};
    const admin=(await call('POST','/api/login',{username:'admin',password:'Initial!2345'})).cookie;
    await ok('POST','/api/account/password',{currentPassword:'Initial!2345',newPassword:'Changed!2345'},admin);
    for(const [username,roleCode,extra] of [['sale1','sales',{}],['wh1','warehouse',{}],['shop1','store',{storeName:'شعبه یک'}],['shop2','store',{storeName:'شعبه دو',branchNo:2}]]) await ok('POST','/api/admin/users',{username,roleCode,fullName:username,position:'تست',password:'Changed!2345',mustChangePassword:false,...extra},admin);
    const login=async username=>(await call('POST','/api/login',{username,password:'Changed!2345'})).cookie;
    const sales=await login('sale1'), wh=await login('wh1'), shop=await login('shop1'), other=await login('shop2');
    const create=async (cookie, qty, unit='کیلوگرم', purpose='STOCK') => (await ok('POST','/api/store/orders',{storeOrderKind:'PARTIAL',storePurpose:purpose,...(purpose==='CUSTOMER'?{name:'مشتری',phone:'09121112234'}:{}),items:[{productId:'p01',requestedQty:qty,requestedUnit:unit}]},cookie)).order;
    const a=await create(shop,50), b=await create(shop,30), c=await create(shop,10,'عدد'), future=await create(shop,20), customer=await create(shop,10,'عدد','CUSTOMER'), different=await create(other,10);
    const previewUrl=ids=>'/api/store-stock-consolidation/preview?orders='+ids.map(encodeURIComponent).join(',');
    assert.equal((await call('GET',previewUrl([a.id,b.id]),null,sales)).status,409,'unapproved orders must not be included');
    for (const order of [a,b,c,customer,different]) await ok('POST',`/api/store/orders/${order.id}/quick-send`,{},sales);
    assert.equal((await call('GET',previewUrl([a.id,customer.id]),null,wh)).status,409);
    assert.equal((await call('GET',previewUrl([a.id,different.id]),null,wh)).status,409);
    assert.equal((await call('GET',previewUrl([a.id,future.id]),null,wh)).status,409);
    assert.equal((await call('GET',previewUrl([a.id,b.id]),null,shop)).status,403);
    assert.equal((await call('GET',previewUrl([a.id,a.id]),null,sales)).status,400);
    const branchUrl='/api/store-stock-consolidation/branches/1/preview';
    assert.equal((await call('GET',branchUrl,null,shop)).status,403);
    assert.equal((await call('GET','/api/store-stock-consolidation/branches/0/preview',null,wh)).status,400);
    assert.equal((await call('GET','/api/store-stock-consolidation/branches/60/preview',null,wh)).status,400);
    assert.deepEqual((await ok('GET','/api/store-stock-consolidation/branches/3/preview',null,wh)).preview,{branchNo:3,orderIds:[],products:[]});
    const branchPreview=await ok('GET',branchUrl,null,wh);
    assert.equal(branchPreview.readOnly,true);assert.deepEqual(new Set(branchPreview.preview.orderIds),new Set([a.id,b.id,c.id]));
    assert.deepEqual(branchPreview.preview.products[0].amounts,[{unit:'کیلوگرم',quantity:'80'},{unit:'عدد',quantity:'10'}]);
    assert.deepEqual((await ok('GET','/api/store-stock-consolidation/branches/2/preview',null,sales)).preview.orderIds,[different.id]);
    await ok('POST',`/api/orders/${a.id}/warehouse/accept`,{},wh);
    await ok('POST',`/api/orders/${a.id}/store-run/weights`,{run:1,items:[{itemId:a.items[0].id,deliveredKg:50}]},wh);
    const beforeA=(await ok('GET',`/api/orders/${a.id}`,null,sales)).order;
    const beforeB=(await ok('GET',`/api/orders/${b.id}`,null,sales)).order;
    const data=await ok('GET',previewUrl([a.id,b.id,c.id]),null,wh);
    assert.equal(data.readOnly,true); assert.equal(data.preview.products.length,1);
    assert.deepEqual(data.preview.products[0].amounts,[{unit:'کیلوگرم',quantity:'80'},{unit:'عدد',quantity:'10'}]);
    assert.equal(data.preview.products[0].weightKg,50);
    assert.equal((await ok('GET',branchUrl,null,wh)).preview.products[0].weightKg,50);
    assert.deepEqual(data.preview.products[0].sources.map(s=>s.orderId),[a.id,b.id,c.id]);
    assert.deepEqual((await ok('GET',`/api/orders/${a.id}`,null,sales)).order,beforeA);
    assert.deepEqual((await ok('GET',`/api/orders/${b.id}`,null,sales)).order,beforeB);
    await ok('POST',`/api/orders/${b.id}/warehouse/accept`,{},wh);
    await ok('POST',`/api/orders/${b.id}/store-run/weights`,{run:1,items:[{itemId:b.items[0].id,deliveredKg:30}]},wh);
    assert.equal((await ok('GET',previewUrl([a.id,b.id,c.id]),null,wh)).preview.products[0].weightKg,80);
    const driver=(await ok('POST','/api/transport/drivers',{fullName:'راننده تست',phone:'09121112235'},admin)).driver;
    const vehicle=(await ok('POST','/api/transport/vehicles',{vehicleType:'وانت',plate:'12ب34567'},admin)).vehicle;
    await ok('PUT',`/api/transport/drivers/${driver.id}/resources`,{vehicleId:vehicle.id,paymentDeviceId:''},admin);
    await ok('POST',`/api/transport/plans/${a.id}/assign`,{run:1,driverId:driver.id,vehicleId:vehicle.id},admin);
    await ok('POST',`/api/orders/${a.id}/store-run/send-run`,{run:1,physicalHandoverConfirmed:true},wh);
    assert.equal((await call('GET',previewUrl([a.id,b.id]),null,wh)).status,409,'a delivered source cannot be previewed as open');
    assert.deepEqual(new Set((await ok('GET',branchUrl,null,wh)).preview.orderIds),new Set([b.id,c.id]));
    // A large branch must be rejected rather than showing an incomplete sum.
    const {DatabaseSync}=require('node:sqlite'),sql=new DatabaseSync(path.join(dir,'baboltoyoor.db'));
    try{
      sql.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
      const insert=sql.prepare('INSERT INTO orders(id,order_no,status,order_type,approval_status,payload) VALUES(?,?,?,?,?,?)');
      for(let n=0;n<101;n++){const id='large-'+n,o={id,orderNo:'L'+n,branchNo:4,orderType:'STORE',storeOrderKind:'PARTIAL',storePurpose:'STOCK',customerId:null,transportWorkflow:1,deliveryMode:'DELIVERY',status:'WAREHOUSE_PENDING',approvalStatus:'APPROVED'};insert.run(id,o.orderNo,o.status,o.orderType,o.approvalStatus,JSON.stringify(o));}
      sql.exec('COMMIT');
    } finally {sql.close();}
    const large=await call('GET','/api/store-stock-consolidation/branches/4/preview',null,wh);
    assert.equal(large.status,409);assert.match(JSON.stringify(large.body),/ناقص/);
  } finally {
    if(proc.exitCode===null&&proc.signalCode===null){const done=new Promise(resolve=>proc.once('exit',resolve));proc.kill('SIGTERM');await done;}
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
