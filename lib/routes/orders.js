'use strict';
// جریان سفارش: فروشگاه ← تأیید فروش ← سفارش‌های آینده ← انبار ← تسویه ← خروج
const { atomicRoute: route, fail, normalizeRole } = require('../http');
const store = require('../store');
const validate = require('../validate');
const { withPickupOrderLock } = require('../pickup-legacy-guard');
const { CUSTOMER_CONTACT_ONLY, customerIdentity } = require('../customer-identity');
const storeOrderKind = require('../store-order-kind');
const { getProduct, enrichOrder, orderReadIndex, createNotification, notifyStore, notifyTransportReady, activateDueRemoteOrders, today, nowLocalMinute } = require('../domain');
const isGateExitAvailable = require('../gate-exit-availability');

function newDeliveryFields(body,type,deposit){try{return require('../transport-planning').deliveryFields(body,type,deposit);}catch(e){fail(e.status||400,e.message);}}

const ACTIVE = (i) => i.itemStatus !== 'CANCELLED';

// Both draft saves and finalization re-read the order while holding the same SQLite lock.
function withWarehouseWrite(ctx,work){
 const initial=store.get().orders.find(o=>o.id===ctx.params.id);
 if(initial?.orderType==='REMOTE'&&initial.deliveryMode==='PICKUP')return withPickupOrderLock(ctx,work);
 return require('../transport-transaction')(work);
}


function findOrder(id) {
  const order = store.get().orders.find((o) => o.id === id);
  if (!order) fail(404, 'سفارش یافت نشد.');
  return order;
}

// اعتبارسنجی یک قلم سفارش و برگرداندن مقدار نرمال‌شده
function normalizeLine(x, { requireProduct = true } = {}) {
  const product = getProduct(String(x?.productId || ''));
  if (!product || !product.isActive) {
    if (requireProduct || x?.productId) fail(400, 'یکی از محصولات انتخاب‌شده معتبر نیست.');
  }
  return {
    product,
    productId: product?.id,
    requestedQty: validate.number(x?.requestedQty, { field: 'مقدار درخواستی', min: 0.001, max: validate.MAX_QTY }),
    requestedUnit: validate.unit(x?.requestedUnit),
    description: validate.text(x?.description, { field: 'توضیحات قلم', max: 300 }),
  };
}

function newItem(orderId, line) {
  return {
    id: store.uid(), orderId, productId: line.productId, requestedQty: line.requestedQty, requestedUnit: line.requestedUnit,
    description: line.description, deliveredKg: null, unitPrice: null, finalAmount: null, itemStatus: 'PENDING', returnReason: '',
  };
}

function newOrder(fields) {
  // v37.6.0 — سفارش‌های فروشگاه شمارهٔ شش‌رقمی سری شعبه (${40+branchNo} + ۴ رقم) می‌گیرند؛ بقیه همان سری سراسری
  const orderNo = fields.orderType === 'STORE' ? store.nextStoreOrderNumber(fields.branchNo ?? 1) : store.nextOrderNumber();
  return {
    id: store.uid(), orderNo, createdAt: store.nowIso(), updatedAt: store.nowIso(), debtTrackingEnabled: fields.orderType !== 'STORE', ...fields,
  };
}

// v37.3.2 — تاریخ شمسی در متن اعلان‌ها (مقدار ذخیره‌شده همچنان ISO است)
function faDateLabel(iso) {
  try {
    const p = {};
    new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext', { day: 'numeric', month: 'long', year: 'numeric' })
      .formatToParts(new Date(`${iso}T00:00:00`)).forEach((x) => { if (x.type !== 'literal') p[x.type] = x.value; });
    return p.year ? `${p.day} ${p.month} ${p.year}` : iso;
  } catch { return iso; }
}

// ---------- فروشگاه ----------
route('GET','/api/store/scope',{roles:['admin']},()=>{
 const db=store.get(),map=new Map();
 const add=(branchNo,name)=>{if(branchNo!=null&&!map.has(String(branchNo)))map.set(String(branchNo),{branchNo,storeName:require('../store-name').storeDisplayName(name,branchNo)});};
 for(const b of db.storeBranches||[])add(b.branchNo,b.name);
 for(const u of db.users.filter(u=>u.roleCode==='store'))add(u.branchNo,u.storeName);
 for(const o of db.orders.filter(o=>o.orderType==='STORE'))add(o.branchNo,o.storeName);
 return {body:{branches:[...map.values()].sort((a,b)=>Number(a.branchNo)-Number(b.branchNo)),stores:db.users.filter(u=>u.roleCode==='store').map(u=>({id:u.id,branchNo:u.branchNo,storeName:require('../store-name').storeDisplayName(u.storeName,u.branchNo),isActive:u.isActive}))}};
});

route('GET', '/api/store/orders', { roles: ['store'] }, (ctx) => {
  activateDueRemoteOrders();
  const requestedKind=ctx.query.get('kind');
  if(requestedKind&&!['BULK','PARTIAL'].includes(requestedKind))fail(400,'نوع سفارش فروشگاه معتبر نیست.');
  const rows = store.get().orders.filter((o) => o.orderType === 'STORE' && (require('../store-access').admin(ctx.user)?(!ctx.query.get('branchNo')||String(o.branchNo)===ctx.query.get('branchNo')):o.storeId===ctx.user.id) && (!requestedKind||storeOrderKind.kind(o)===requestedKind)).slice().reverse();
  const parsedOffset = Number(ctx.query.get('offset') || 0), parsedLimit = Number(ctx.query.get('limit') || 100);
  if (!Number.isSafeInteger(parsedOffset) || parsedOffset < 0 || !Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100)
    fail(400, 'صفحه‌بندی سفارش‌های فروشگاه معتبر نیست.');
  return { status: 200, body: { orders: rows.slice(parsedOffset, parsedOffset + parsedLimit).map(enrichOrder), total: rows.length, offset: parsedOffset, limit: parsedLimit } };
});

route('POST', '/api/store/orders', { roles: ['store'], idempotent: true }, (ctx) => {
  const db = store.get();
  const b = ctx.body;
  const owner=require('../store-access').admin(ctx.user)?db.users.find(u=>u.id===b.storeId&&u.roleCode==='store'&&u.isActive):ctx.user;
  if(!owner)fail(400,'حساب فروشگاه مقصد را انتخاب کنید.');
  let spec;try{spec=storeOrderKind.normalizeNew(b);}catch(e){fail(e.status||400,e.message);}
  if(spec.storeOrderKind==='PARTIAL'&&process.env.BT_ENABLE_PARTIAL_STORE_ORDER==='0')fail(503,'ثبت سفارش جزئی موقتاً غیرفعال است.');
  if(spec.storeOrderKind==='PARTIAL'&&!require('../transport-planning').enabled())fail(503,'ثبت سفارش جزئی تا فعال‌شدن گردش ترابری ممکن نیست.');
  // New daily orders need no customer. Continue accepting both fields from
  // older clients; existing customer-linked orders must remain intact.
  const hasCustomer=spec.storePurpose==='CUSTOMER'||(spec.storeOrderKind==='BULK'&&(b.name!==undefined||b.phone!==undefined));
  const name = hasCustomer?validate.text(b.name, { field: 'نام مشتری', max: 120, required: true }):'';
  const phone = hasCustomer?validate.phone(b.phone):'';
  validate.items(b.items);
  const lines = b.items.map((x) => normalizeLine(x));
  const notes = validate.text(b.notes, { field: 'یادداشت', max: 1000 });
  const branchNo = require('../order-numbers').checkBranchNo(owner.branchNo ?? 1);
  const customer = !hasCustomer ? null : require('../customers').upsertCustomer(db, { customerId: b.customerId, customerCode: b.customerCode, name, phone }); // validate before changing live data // v37.6.0 — شمارهٔ سفارش فروشگاه از روی شعبهٔ کاربر فروشگاه
  const order = newOrder({
    branchNo, visitId: null, customerId: customer?.id || null, orderType: 'STORE', source: 'STORE_PORTAL', storeId: owner.id, ...spec,
    storeName: String(owner.storeName || owner.fullName || 'فروشگاه').trim(), scheduledDate: null, scheduledAt: null,
    approvalStatus: 'PENDING_SALES', status: 'STORE_PENDING_SALES', notes, createdBy: ctx.user.id,
  });
  db.orders.push(order);
  lines.forEach((l) => db.orderItems.push({ ...newItem(order.id, l), description: l.description }));
  createNotification('sales', 'STORE_ORDER_PENDING', 'order', order.id, `سفارش ${require('../store-name').storeDisplayName(order.storeName,order.branchNo)} ${order.orderNo} برای تایید فروش ثبت شد.`);
  store.audit(ctx.user, 'CREATE_STORE_ORDER', 'order', order.id, { storeId: owner.id, storeName: order.storeName, orderNo: order.orderNo, itemCount: lines.length }, ctx);
  store.save();
  return { status: 201, body: { order: enrichOrder(order) } };
});

route('PUT', '/api/store/orders/:id', { roles: ['store'] }, (ctx) => {
  const db=store.get(), order=db.orders.find(o=>o.id===ctx.params.id);
  if(!order||order.orderType!=='STORE'||!require('../store-access').owns(ctx.user,order))fail(404,'سفارش فروشگاه یافت نشد.');
  if(order.status!=='STORE_PENDING_SALES')fail(409,'ویرایش فقط تا پیش از بررسی فروش مجاز است.');
  const b=ctx.body, partial=storeOrderKind.isPartial(order);
  if(b.storeOrderKind!==undefined&&b.storeOrderKind!==storeOrderKind.kind(order))fail(409,'نوع سفارش قابل تغییر نیست.');
  const purpose=partial?(b.storePurpose??order.storePurpose):null;
  if(partial&&!['CUSTOMER','STOCK'].includes(purpose))fail(400,'هدف سفارش جزئی را انتخاب کنید.');
  const stock=purpose==='STOCK', updateCustomer=purpose==='CUSTOMER'||(!partial&&(b.name!==undefined||b.phone!==undefined));
  const name=updateCustomer?validate.text(b.name,{field:'نام مشتری',max:120,required:true}):'',phone=updateCustomer?validate.phone(b.phone):'';
  validate.items(b.items); const lines=b.items.map(normalizeLine);
  const notes=validate.text(b.notes,{field:'یادداشت',max:1000});
  const customer=updateCustomer?require('../customers').upsertCustomer(db,{customerId:order.customerId,name,phone}):null;
  if(updateCustomer)order.customerId=customer.id;else if(stock)order.customerId=null;
  if(partial)order.storePurpose=purpose;order.notes=notes;order.updatedAt=store.nowIso();
  db.orderItems.filter(i=>i.orderId===order.id).forEach(i=>{i.itemStatus='CANCELLED';i.finalAmount=0;});
  lines.forEach(l=>db.orderItems.push({...newItem(order.id,l),description:l.description}));
  store.audit(ctx.user,'UPDATE_STORE_ORDER','order',order.id,{orderNo:order.orderNo,itemCount:lines.length},ctx);store.save();
  return {status:200,body:{order:enrichOrder(order)}};
});

// v37.20.0 — ویرایش سفارش ورودی فروشگاه در کارتابل فروش (تغییر مقدار/محصول، حذف و اضافهٔ قلم)
// فقط پیش از تأیید فروش مجاز است؛ پس از آن سفارش وارد چرخهٔ زمان‌بندی/انبار شده و قفل می‌شود.
route('PUT', '/api/store/orders/:id/sales-edit', { roles: ['sales'] }, (ctx) => {
  const db = store.get(), order = db.orders.find(o => o.id === ctx.params.id);
  if (!order || order.orderType !== 'STORE') fail(404, 'سفارش فروشگاه یافت نشد.');
  if (order.status !== 'STORE_PENDING_SALES') fail(409, 'ویرایش سفارش فروشگاه در کارتابل فروش فقط پیش از تأیید فروش مجاز است.');
  const b = ctx.body;
  validate.items(b.items);
  const lines = b.items.map((x) => normalizeLine(x));
  const notes = b.notes === undefined ? undefined : validate.text(b.notes, { field: 'یادداشت', max: 1000 });
  const before = db.orderItems.filter((i) => i.orderId === order.id && ACTIVE(i))
    .map((i) => ({ productId: i.productId, requestedQty: i.requestedQty, requestedUnit: i.requestedUnit, description: i.description || '' }));
  db.orderItems.filter((i) => i.orderId === order.id && ACTIVE(i)).forEach((i) => { i.itemStatus = 'CANCELLED'; i.finalAmount = 0; });
  lines.forEach((l) => db.orderItems.push({ ...newItem(order.id, l), description: l.description }));
  if (notes !== undefined) order.notes = notes;
  order.updatedAt = store.nowIso();
  const after = lines.map((l) => ({ productId: l.productId, requestedQty: l.requestedQty, requestedUnit: l.requestedUnit, description: l.description || '' }));
  store.audit(ctx.user, 'SALES_EDIT_STORE_ORDER', 'order', order.id, { orderNo: order.orderNo, storeName: order.storeName, before, after }, ctx);
  store.save();
  return { status: 200, body: { order: enrichOrder(order) } };
});

route('POST', '/api/store/orders/:id/confirm-receipt', { roles: ['store'], idempotent: true }, (ctx) => {
  const order=store.get().orders.find(o=>o.id===ctx.params.id);
  if(!order||order.orderType!=='STORE'||!require('../store-access').owns(ctx.user,order))fail(404,'سفارش فروشگاه یافت نشد یا متعلق به این فروشگاه نیست.');
  const runReq=Number(ctx.body?.run)===2?2:(Number(ctx.body?.run)===1?1:0);
  if(order.transportWorkflow===1)return require('../transport-transaction')(()=>{
    // Re-read within the transaction; store ownership and the per-run stage are mandatory.
    const current=store.get().orders.find(o=>o.id===ctx.params.id);
    if(!current||current.orderType!=='STORE'||!require('../store-access').owns(ctx.user,current))fail(404,'سفارش فروشگاه یافت نشد.');
    if(!runReq||!storeOrderKind.allowedRuns(current).includes(runReq))fail(400,'محموله معتبر نیست.');
    const key=String(runReq),trip=current.transportStoreTrips?.[key];
    if(!trip)fail(409,'ابتدا خروج این سرویس ثبت شود.');
    if(['RECEIPT_CONFIRMED','CLOSED'].includes(trip.status))return {body:{order:enrichOrder(current)}};
    if(trip.status!=='IN_TRANSIT')fail(409,'این سرویس در وضعیت قابل تأیید نیست.');
    const now=store.nowIso();
    current.transportStoreTrips={...(current.transportStoreTrips||{}),[key]:{...trip,status:'RECEIPT_CONFIRMED',storeReceiptConfirmedAt:now,storeReceiptConfirmedBy:ctx.user.id}};current.updatedAt=now;
    createNotification('sales','STORE_RECEIPT_CONFIRMED','order',current.id,`فروشگاه دریافت سرویس ${runReq===1?'اول':'دوم'} سفارش ${current.orderNo||'—'} را تأیید کرد.`,{run:runReq});
    store.audit(ctx.user,'STORE_TRANSPORT_RECEIPT_CONFIRMED','order',current.id,{run:runReq,storeId:current.storeId},ctx);
    return {body:{order:enrichOrder(current)}};
  });
  if(runReq){ // v37.5.0 — تأیید دریافت محمولهٔ هر سرویس، جداگانه
    const SR=require('../store-runs');
    if(!SR.isStoreRunOrder(order))fail(409,'این سفارش ارسال سرویسی ندارد.');
    const real=(order.dispatch&&order.dispatch.run===runReq)?order.dispatch:((Array.isArray(order.dispatches)?order.dispatches:[]).find((x)=>x&&x.run===runReq)||null);
    if(!real)fail(404,`محمولهٔ سرویس ${runReq===2?'دوم':'اول'} برای این سفارش یافت نشد.`);
    if(!['DELIVERED','SALES_FINALIZED','CLOSED'].includes(real.status))fail(409,'تأیید دریافت فقط پس از ثبت تحویل این محموله توسط راننده مجاز است.');
    if(!real.storeReceiptConfirmedAt){
      real.storeReceiptConfirmedAt=store.nowIso();real.storeReceiptConfirmedBy=ctx.user.id;order.updatedAt=store.nowIso();
      createNotification('sales','STORE_RECEIPT_CONFIRMED','order',order.id,`${require('../store-name').storeDisplayName(order.storeName,order.branchNo)} دریافت محمولهٔ سرویس ${runReq===2?'دوم':'اول'} سفارش ${order.orderNo} را تأیید کرد.`,{run:runReq});
      store.audit(ctx.user,'STORE_RUN_RECEIPT_CONFIRMED','order',order.id,{orderNo:order.orderNo,storeId:order.storeId,run:runReq,deliveredAt:real.deliveredAt},ctx);
      store.save();
    }
    return {status:200,body:{order:enrichOrder(order)}};
  }
  if(!order.dispatch||!['DELIVERED','SALES_FINALIZED','CLOSED'].includes(order.dispatch.status))fail(409,'تأیید دریافت فقط پس از ثبت تحویل توسط راننده مجاز است.');
  if(!order.storeReceiptConfirmedAt){
    order.storeReceiptConfirmedAt=store.nowIso();order.storeReceiptConfirmedBy=ctx.user.id;order.updatedAt=store.nowIso();
    createNotification('sales','STORE_RECEIPT_CONFIRMED','order',order.id,`${require('../store-name').storeDisplayName(order.storeName,order.branchNo)} دریافت سفارش ${order.orderNo} را تأیید کرد.`);
    store.audit(ctx.user,'STORE_RECEIPT_CONFIRMED','order',order.id,{orderNo:order.orderNo,storeId:order.storeId,deliveredAt:order.dispatch.deliveredAt},ctx);
    store.save();
  }
  return {status:200,body:{order:enrichOrder(order)}};
});

route('GET', '/api/store/orders/:id', { roles: ['store'] }, (ctx) => {
  activateDueRemoteOrders();
  const order = store.get().orders.find((o) => o.id === ctx.params.id);
  if (!order || order.orderType !== 'STORE' || !require('../store-access').owns(ctx.user,order)) fail(404, 'سفارش فروشگاه پیدا نشد یا متعلق به این فروشگاه نیست.');
  return { status: 200, body: { order: enrichOrder(order) } };
});

route('POST', '/api/store/orders/:id/cancel', { roles: ['store'] }, (ctx) => {
  const order = store.get().orders.find((o) => o.id === ctx.params.id);
  if (!order || order.orderType !== 'STORE' || !require('../store-access').owns(ctx.user,order)) fail(404, 'سفارش فروشگاه یافت نشد.');
  if (order.status !== 'STORE_PENDING_SALES') fail(409, 'پس از تایید فروش، لغو سفارش از کارتابل فروشگاه مجاز نیست.');
  const reason = validate.text(ctx.body.reason || 'لغو توسط فروشگاه', { field: 'دلیل لغو', max: 300 });
  order.status = 'CANCELLED'; order.approvalStatus = 'CANCELLED'; order.cancelReason = reason; order.updatedAt = store.nowIso();
  store.get().orderItems.filter((i) => i.orderId === order.id).forEach((i) => { i.itemStatus = 'CANCELLED'; i.finalAmount = 0; });
  store.audit(ctx.user, 'CANCEL_STORE_ORDER', 'order', order.id, { reason }, ctx);
  store.save();
  return { status: 200, body: { order: enrichOrder(order) } };
});

route('POST', '/api/store/orders/:id/quick-send', { roles: ['sales'], idempotent: true }, (ctx) => {
  const db=store.get();
  const order=db.orders.find(o=>o.id===ctx.params.id);
  if(!order||order.orderType!=='STORE')fail(404,'سفارش فروشگاه یافت نشد.');
  if(!['STORE_PENDING_SALES','SCHEDULED_REMOTE'].includes(order.status))fail(409,'ارسال سریع فقط برای سفارش فروشگاهی منتظر تأیید یا زمان‌بندی‌شده مجاز است.');
  if(storeOrderKind.isPartial(order)&&!require('../transport-planning').enabled())fail(503,'گردش ترابری سفارش جزئی فعال نیست.');
  const fromStatus=order.status;
  const at=nowLocalMinute();
  if ((order.transportWorkflow===1 || ctx.body.transportWorkflow===true) && order.status==='SCHEDULED_REMOTE' && order.scheduledAt>at) fail(409,'سفارش زمان‌بندی‌شده تا موعد مقرر فعال نمی‌شود.');
  const dispatchPlace=validate.text(ctx.body.dispatchPlace||order.dispatchPlace||order.storeName,{field:'محل ارسال',max:200});
  const newDelivery=newDeliveryFields(ctx.body,'STORE',null);
  Object.assign(order,{...newDelivery,status:'WAREHOUSE_PENDING',approvalStatus:'APPROVED',scheduledDate:at.slice(0,10),scheduledAt:at,dispatchPlace,approvedBy:ctx.user.id,approvedAt:store.nowIso(),quickSentAt:store.nowIso(),quickSentBy:ctx.user.id,activatedAt:store.nowIso(),updatedAt:store.nowIso()});
  createNotification('warehouse','STORE_ORDER_QUICK_SENT','order',order.id,`سفارش ${require('../store-name').storeDisplayName(order.storeName,order.branchNo)} ${order.orderNo} با ارسال سریع وارد صف انبار شد.`);
  notifyTransportReady(order);
  notifyStore(order,'STORE_ORDER_UPDATE',`سفارش ${order.orderNo} تأیید و به انبار ارسال شد.`);
  store.audit(ctx.user,'QUICK_SEND_STORE_ORDER','order',order.id,{orderNo:order.orderNo,dispatchPlace,scheduledAt:at,fromStatus},ctx);
  store.save();
  return {status:200,body:{order:enrichOrder(order)}};
});

route('POST', '/api/store/orders/:id/approve', { roles: ['sales'], idempotent: true }, (ctx) => {
  const order = store.get().orders.find((o) => o.id === ctx.params.id);
  if (!order || order.orderType !== 'STORE') fail(404, 'سفارش فروشگاه یافت نشد.');
  if (order.status !== 'STORE_PENDING_SALES') fail(409, 'این سفارش قبلاً بررسی شده است.');
  if(storeOrderKind.isPartial(order)&&!require('../transport-planning').enabled())fail(503,'گردش ترابری سفارش جزئی فعال نیست.');
  const scheduledAt = validate.digitsToAscii(ctx.body.scheduledAt || '').trim();
  if (!validate.localDateTime(scheduledAt)) fail(400, 'تاریخ یا ساعت ارسال معتبر نیست؛ ساعت باید ۲۴ ساعته و به شکل 08:30 باشد.');
  if (scheduledAt < nowLocalMinute()) fail(400, 'تاریخ و ساعت ارسال نمی‌تواند قبل از زمان فعلی باشد.');
  const dispatchPlace = validate.text(ctx.body.dispatchPlace || order.storeName, { field: 'محل ارسال', max: 200 });
  const newDelivery=newDeliveryFields(ctx.body,'STORE',null);
  Object.assign(order, {
    ...newDelivery, scheduledDate: scheduledAt.slice(0, 10), scheduledAt, dispatchPlace, approvalStatus: 'APPROVED',
    approvedBy: ctx.user.id, approvedAt: store.nowIso(), updatedAt: store.nowIso(),
  });
  const due = scheduledAt <= nowLocalMinute();
  order.status = due ? 'WAREHOUSE_PENDING' : 'SCHEDULED_REMOTE';
  createNotification(due ? 'warehouse' : 'sales', 'STORE_ORDER_APPROVED', 'order', order.id,
    due ? `سفارش ${require('../store-name').storeDisplayName(order.storeName,order.branchNo)} تایید شد و در صف انبار قرار گرفت.` : `سفارش ${require('../store-name').storeDisplayName(order.storeName,order.branchNo)} تایید و برای ${scheduledAt.replace('T', ' ')} برنامه‌ریزی شد.`);
  if(due)notifyTransportReady(order);
  notifyStore(order,'STORE_ORDER_UPDATE',`سفارش ${order.orderNo} تأیید و زمان ارسال آن تعیین شد.`);
  store.audit(ctx.user, 'APPROVE_STORE_ORDER', 'order', order.id, { scheduledAt, due, dispatchPlace, storeId: order.storeId }, ctx);
  store.save();
  return { status: 200, body: { order: enrichOrder(order) } };
});

// تاریخ تحویل مستقل از زمان ورود به انبار است؛ در داده‌های قدیمی می‌تواند ثبت نشده باشد.
function optionalDeliveryDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') fail(400, 'تاریخ تحویل معتبر نیست.');
  const date = validate.digitsToAscii(value).trim();
  if (!validate.localDateTime(`${date}T12:00`)) fail(400, 'تاریخ تحویل معتبر نیست.');
  return date;
}

// بیعانه دریافت مستقل است و تا صدور فاکتور هرگز به collection پرداخت‌های نهایی اضافه نمی‌شود.
function normalizeDeposit(value, db, user) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) fail(400, 'اطلاعات بیعانه معتبر نیست.');
  const type = String(value.type || '').toUpperCase();
  if (!['CASH', 'POS', 'CARD_TRANSFER'].includes(type)) fail(400, 'روش دریافت بیعانه معتبر نیست.');
  const amount = validate.number(value.amount, { field: 'مبلغ بیعانه', min: 1, max: validate.MAX_MONEY });
  if (!Number.isSafeInteger(amount)) fail(400, 'مبلغ بیعانه باید تعداد صحیح ریال باشد.');
  const [row] = require('../settlement-methods').cleanRows([{...value, type, amount}], amount, db);
  return { ...row, status: 'RECEIVED', receivedAt: store.nowIso(), receivedBy: user.id };
}

// ---------- سفارش‌های آینده (غیرحضوری) ----------
route('POST', '/api/orders/remote', { roles: ['sales'], idempotent: true }, (ctx) => {
  const db = store.get();
  const b = ctx.body;
  const name = validate.text(b.name, { field: 'نام مشتری', max: 120, required: true });
  const phone = validate.phone(b.phone);
  const scheduledDate = validate.digitsToAscii(b.scheduledDate || (b.scheduledAt && String(b.scheduledAt).slice(0,10)) || today()).slice(0, 10);
  const scheduledTime = validate.digitsToAscii(b.scheduledTime || '08:00').slice(0, 5);
  const scheduledAt = validate.digitsToAscii(b.scheduledAt || `${scheduledDate}T${scheduledTime}`);
  const deliveryDate = optionalDeliveryDate(b.deliveryDate);
  const deposit = normalizeDeposit(b.deposit, db, ctx.user);
  if (!validate.localDateTime(scheduledAt)) fail(400, 'تاریخ یا ساعت سفارش معتبر نیست؛ ساعت باید ۲۴ ساعته و به شکل 08:30 باشد.');
  if (scheduledAt.slice(0,10) !== scheduledDate) fail(400, 'تاریخ سفارش با زمان ورود به انبار یکسان نیست.');
  if (scheduledDate < today()) fail(400, 'تاریخ سفارش نمی‌تواند قبل از امروز باشد.');
  validate.items(b.items);
  const lines = b.items.map((x) => normalizeLine(x));
  const notes = validate.text(b.notes, { field: 'یادداشت', max: 1000 });
  const newDelivery=newDeliveryFields(b,'REMOTE',deposit);
  const dispatchPlace = newDelivery.deliveryMode==='PICKUP'?'':validate.text(b.dispatchPlace, { field: 'محل ارسال', max: 200 });
  if(require('../pickup-feature').enabled() && !newDelivery.deliveryMode) fail(503,'با وجود تحویل‌های ناتمام، خاموش کردن گردش ترابری مانع ثبت سفارش غیرحضوری تازه است.');
  if(require('../pickup-feature').enabled() && newDelivery.deliveryMode==='PICKUP' && (!deliveryDate || deliveryDate<today())) fail(400,'تاریخ تحویل معتبر از امروز به بعد الزامی است.');
  // Resolve exact identity before writing: never fall back from a stale id or
  // code to an unrelated phone, and never attach a phone to two profiles.
  const core=require('../customer-core'),phoneKey=v=>validate.digitsToAscii(String(v||'')).replace(/\D/g,'');
  const byPhoneAll=db.customers.filter(c=>phoneKey(c.phone)===phoneKey(phone));
  // شمارهٔ مشترک بین چند پرونده (مثلاً تحویل‌گیرنده‌ای که با همین شماره پروندهٔ مستقل
  // گرفته) مانع ثبت سفارش نیست: پرونده‌ای انتخاب می‌شود که نامش با نام واردشده سازگار است.
  const byPhoneSame=byPhoneAll.filter(c=>core.namesCompatible(name,c.name));
  if(byPhoneAll.length>1&&byPhoneSame.length!==1)fail(409,'این شماره در چند پرونده ثبت شده است؛ ابتدا پرونده‌های تکراری را بررسی کنید.','DUPLICATE_PHONE');
  const byPhone=byPhoneSame[0]?[byPhoneSame[0]]:byPhoneAll;
  const byId=b.customerId?db.customers.find(c=>c.id===b.customerId):null;
  const byCode=b.customerCode?db.customers.find(c=>core.normalizeCode(c.code)===core.normalizeCode(b.customerCode)):null;
  if((b.customerId&&!byId)||(b.customerCode&&!byCode))fail(400,'مشتری انتخاب‌شده پیدا نشد.');
  if(byId&&byCode&&byId.id!==byCode.id)fail(409,'شناسه و کد مشتری با هم مطابقت ندارند.');
  const selected=byId||byCode||byPhone[0];
  if(!byId&&!byCode&&byPhone[0]&&!core.namesCompatible(name,byPhone[0].name))fail(409,'این شماره برای مشتری دیگری ثبت شده است؛ او را از فهرست جستجو انتخاب کنید.','DUPLICATE_PHONE');
  if(selected&&byPhone[0]&&selected.id!==byPhone[0].id)fail(409,'این شماره تماس متعلق به مشتری دیگری است؛ مشتری درست را انتخاب کنید.','DUPLICATE_PHONE');
  const customer = require('../customers').upsertCustomer(db, { customerId: selected?.id, name, phone });
  const due = scheduledAt <= nowLocalMinute();
  const order = newOrder({
    ...newDelivery, ...(require('../pickup-feature').enabled() && newDelivery.deliveryMode === 'PICKUP' ? {pickupWorkflow:1} : {}), visitId: null, customerId: customer.id, orderType: 'REMOTE', source: 'SALES_REMOTE', scheduledDate, scheduledAt, deliveryDate, deposit,
    status: due ? 'WAREHOUSE_PENDING' : 'SCHEDULED_REMOTE', notes,
    dispatchPlace, createdBy: ctx.user.id,
  });
  db.orders.push(order);
  lines.forEach((l) => db.orderItems.push(newItem(order.id, l)));
  if(due) createNotification('warehouse', 'NEW_REMOTE_ORDER', 'order', order.id, due
    ? `سفارش غیرحضوری ${order.orderNo} برای امروز ثبت شد و در صف انبار قرار گرفت.`
    : `سفارش غیرحضوری ${order.orderNo} برای تاریخ ${faDateLabel(scheduledDate)} ثبت شد.`);
  if(due)notifyTransportReady(order);
  store.audit(ctx.user, 'CREATE_REMOTE_ORDER', 'order', order.id, { customerId: customer.id, scheduledDate, scheduledAt, deliveryDate, deposit, orderNo: order.orderNo, itemCount: lines.length }, ctx);
  store.save();
  return { status: 201, body: { order: enrichOrder(order) } };
});

route('PUT', '/api/orders/:id/remote', { roles: ['sales'] }, (ctx) => withPickupOrderLock(ctx, () => {
  const order = store.get().orders.find((o) => o.id === ctx.params.id);
  if (!order || order.orderType !== 'REMOTE') fail(404, 'سفارش غیرحضوری یافت نشد.');
  if (!['SCHEDULED_REMOTE','WAREHOUSE_PENDING'].includes(order.status)||order.warehouseAcceptedAt||order.pickupHandover||Object.keys(order.transportHandovers||{}).length) fail(409, 'ویرایش مستقیم فقط پیش از تأیید انبار مجاز است.');
  const b = ctx.body;
  if(order.status==='WAREHOUSE_PENDING'&&['scheduledAt','scheduledDate','scheduledTime'].some(k=>Object.prototype.hasOwnProperty.call(b,k)))fail(409,'زمان سفارش فعال‌شده قابل تغییر نیست؛ اقلام و توضیحات قابل ویرایش هستند.');
  if (Object.prototype.hasOwnProperty.call(b, 'deposit')) fail(400, 'بیعانه ثبت‌شده از طریق ویرایش زمان سفارش تغییر نمی‌کند.');
  const scheduledDate = validate.digitsToAscii(b.scheduledDate || (b.scheduledAt && String(b.scheduledAt).slice(0,10)) || order.scheduledDate).slice(0, 10);
  const scheduledTime = validate.digitsToAscii(b.scheduledTime || String(order.scheduledAt || '').slice(11, 16) || '08:00').slice(0, 5);
  const scheduledAt = validate.digitsToAscii(b.scheduledAt || `${scheduledDate}T${scheduledTime}`);
  const deliveryDate = Object.prototype.hasOwnProperty.call(b, 'deliveryDate') ? optionalDeliveryDate(b.deliveryDate) : (order.deliveryDate || null);
  if (!validate.localDateTime(scheduledAt)) fail(400, 'تاریخ یا ساعت سفارش معتبر نیست؛ ساعت باید ۲۴ ساعته و به شکل 08:30 باشد.');
  if (scheduledAt.slice(0,10) !== scheduledDate) fail(400, 'تاریخ سفارش با زمان ورود به انبار یکسان نیست.');
  if (order.status==='SCHEDULED_REMOTE' && scheduledDate < today()) fail(400, 'تاریخ سفارش نمی‌تواند قبل از امروز باشد.');
  if(require('../pickup-feature').enabled() && order.deliveryMode==='PICKUP' && (!deliveryDate || deliveryDate<today())) fail(400,'تاریخ تحویل معتبر از امروز به بعد الزامی است.');
  let editedItems;
  if (Object.prototype.hasOwnProperty.call(b,'items')) {
    validate.items(b.items);
    const lines=b.items.map(x=>normalizeLine(x));
    editedItems=lines.map(line=>newItem(order.id,line));
  }
  const before = { items: store.get().orderItems.filter(i=>i.orderId===order.id), scheduledDate: order.scheduledDate, scheduledAt: order.scheduledAt, deliveryDate: order.deliveryDate || null, dispatchPlace: order.dispatchPlace, notes: order.notes };
  Object.assign(order, {
    scheduledDate, scheduledAt, deliveryDate,
    dispatchPlace: validate.text(b.dispatchPlace ?? order.dispatchPlace, { field: 'محل ارسال', max: 200 }),
    notes: validate.text(b.notes ?? order.notes, { field: 'یادداشت', max: 1000 }), updatedAt: store.nowIso(),
  });
  if(editedItems){const db=store.get();db.orderItems=db.orderItems.filter(i=>i.orderId!==order.id);db.orderItems.push(...editedItems);}
  store.audit(ctx.user, 'UPDATE_REMOTE_ORDER', 'order', order.id, { before, after: { items:store.get().orderItems.filter(i=>i.orderId===order.id),scheduledDate, scheduledAt, deliveryDate, dispatchPlace: order.dispatchPlace, notes: order.notes } }, ctx);
  store.save();
  return { status: 200, body: { order: enrichOrder(order) } };
}));

route('POST', '/api/orders/:id/cancel-remote', { roles: ['sales'] }, (ctx) => withPickupOrderLock(ctx, () => {
  const db = store.get();
  const order = findOrder(ctx.params.id);
  if (order.orderType !== 'REMOTE') fail(404, 'سفارش غیرحضوری یافت نشد.');
  if (!['SCHEDULED_REMOTE', 'RETURNED_TO_SALES'].includes(order.status)) fail(409, 'این سفارش در وضعیت قابل لغو نیست.');
  const cancelReason = validate.text(ctx.body.reason || 'لغو توسط فروش', { field: 'دلیل لغو', max: 300 });
  order.status = 'CANCELLED';
  if (order.deposit?.status === 'RECEIVED') order.deposit = { ...order.deposit, status: Number(order.deposit.amount) > Number(order.deposit.refundedAmount || 0) ? 'REFUND_REQUIRED' : 'REFUNDED' };
  order.cancelReason = cancelReason;
  order.updatedAt = store.nowIso();
  db.orderItems.filter((i) => i.orderId === order.id && ACTIVE(i)).forEach((i) => { i.itemStatus = 'CANCELLED'; i.finalAmount = 0; });
  store.audit(ctx.user, 'CANCEL_REMOTE_ORDER', 'order', order.id, { reason: order.cancelReason, deposit: order.deposit || null }, ctx);
  store.save();
  return { status: 200, body: { order: enrichOrder(order) } };
}));

// لغو سفارش وجه را جابه‌جا نمی‌کند؛ فروش پس از استرداد دستی، آن را با ثبت سابقه تأیید می‌کند.
route('GET', '/api/deposit-refunds', { roles: ['sales', 'admin'] }, () => {
  const orders = store.get().orders.filter(o => o.orderType === 'REMOTE' && o.status === 'CANCELLED' && o.deposit?.status === 'REFUND_REQUIRED').map(enrichOrder);
  return { status: 200, body: { orders } };
});
route('POST', '/api/orders/:id/deposit-refund', { roles: ['sales', 'admin'], idempotent: true }, (ctx) => withPickupOrderLock(ctx, () => {
  const order = findOrder(ctx.params.id);
  if (order.orderType !== 'REMOTE' || order.status !== 'CANCELLED' || order.deposit?.status !== 'REFUND_REQUIRED') fail(409, 'این سفارش بیعانه در انتظار استرداد ندارد.');
  const reference = validate.text(ctx.body.reference || '', { field: 'توضیح یا شماره پیگیری استرداد', max: 250, required: true });
  const refundAmount = Number(order.deposit.amount) - Number(order.deposit.refundedAmount || 0);
  const refund = { amount: refundAmount, reference, at: store.nowIso(), by: ctx.user.id };
  order.deposit = { ...order.deposit, status: 'REFUNDED', refundedAmount: Number(order.deposit.amount), refunds: [...(order.deposit.refunds || []), refund], refundReference: reference, refundedAt: refund.at, refundedBy: ctx.user.id };
  order.updatedAt = store.nowIso();
  store.audit(ctx.user, 'DEPOSIT_REFUNDED_MANUALLY', 'order', order.id, { deposit: order.deposit }, ctx);
  store.save();
  return { status: 200, body: { order: enrichOrder(order) } };
}));

// ثبت استرداد اضافه‌پرداخت فقط بعد از انتقال وجه توسط فروش انجام می‌شود.
route('POST', '/api/orders/:id/deposit-partial-refund', { roles: ['sales', 'admin'], idempotent: true }, (ctx) => withPickupOrderLock(ctx, () => {
  const order = findOrder(ctx.params.id);
  if (order.orderType !== 'REMOTE' || order.status !== 'SETTLEMENT_PENDING' || order.dispatch || order.deposit?.status !== 'RECEIVED') fail(409, 'ثبت استرداد بیعانه برای این سفارش مجاز نیست.');
  const alreadyRefunded = Number(order.deposit.refundedAmount || 0);
  if (ctx.body.expectedRefundedAmount !== alreadyRefunded) fail(409, 'اطلاعات استرداد تغییر کرده است؛ سفارش را دوباره باز و بررسی کنید.');
  const remaining = Number(order.deposit.amount) - alreadyRefunded;
  const amount = validate.number(ctx.body.amount, { field: 'مبلغ استرداد', min: 1, max: remaining });
  if (!Number.isSafeInteger(amount)) fail(400, 'مبلغ استرداد باید تعداد صحیح ریال باشد.');
  const reference = validate.text(ctx.body.reference, { field: 'توضیح یا شماره پیگیری استرداد', max: 250, required: true });
  const refund = { amount, reference, at: store.nowIso(), by: ctx.user.id };
  order.deposit = { ...order.deposit, refundedAmount: Number(order.deposit.refundedAmount || 0) + amount, refunds: [...(order.deposit.refunds || []), refund] };
  order.updatedAt = store.nowIso();
  store.audit(ctx.user, 'DEPOSIT_PARTIAL_REFUND_MANUALLY', 'order', order.id, { refund, remaining: remaining - amount }, ctx);
  store.save();
  return { status: 200, body: { order: enrichOrder(order) } };
}));

// ---------- سفارش حضوری ----------
route('POST', '/api/orders', { roles: ['sales'], idempotent: true }, (ctx) => {
  const db = store.get();
  const b = ctx.body;
  const visit = db.visits.find((v) => v.id === String(b.visitId || ''));
  if (!visit) fail(404, 'ورودی یافت نشد.');
  if (visit.status !== 'WAITING_SALES') fail(409, 'این مراجعه دیگر در صف ثبت سفارش فروش نیست.');
  validate.items(b.items);
  const lines = b.items.map((x) => normalizeLine(x));
  const newDelivery=newDeliveryFields(b,'ONSITE',null);
  const order = newOrder({
    ...newDelivery, visitId: visit.id, customerId: visit.customerId, orderType: 'ONSITE', source: 'SALES_COUNTER', scheduledDate: null,
    status: 'WAREHOUSE_PENDING', notes: validate.text(b.notes, { field: 'یادداشت', max: 1000 }), createdBy: ctx.user.id,
  });
  db.orders.push(order);
  lines.forEach((l) => db.orderItems.push(newItem(order.id, l)));
  visit.status = 'ORDERED';
  createNotification('warehouse', 'NEW_ORDER', 'order', order.id, `سفارش جدید ${order.orderNo} برای انبار ارسال شد.`);
  notifyTransportReady(order);
  store.audit(ctx.user, 'CREATE_ORDER', 'order', order.id, { visitId: visit.id, orderNo: order.orderNo, itemCount: lines.length }, ctx);
  store.save();
  return { status: 201, body: { order: enrichOrder(order) } };
});

// فهرست سفارش‌ها با جستجو و صفحه‌بندی در Backend
route('GET', '/api/orders', { roles: ['admin', 'gate', 'sales', 'warehouse'] }, (ctx) => {
  activateDueRemoteOrders();
  const db = store.get();
  const role = normalizeRole(ctx.user.roleCode);
  const status = ctx.query.get('status');
  const q = String(ctx.query.get('q') || '').trim().toLowerCase().slice(0, 80);
  const {queryOrders,pagination} = require('../order-search');
  const {limit,offset} = pagination(ctx.query);
  const page = queryOrders({role,status,q,limit,offset});
  const total = page.total, selected = page.orders;
  const readIndex = orderReadIndex(selected);
  const legacyReturns = new Map();
  if (selected.some(o => o.status === 'RETURNED_TO_SALES' && !o.warehouseReturn)) {
    for (const e of db.audit) if (e.action === 'RETURN_TO_SALES' && e.entityType === 'order' && e.details?.reason) legacyReturns.set(e.entityId, e);
  }
  return { status: 200, body: { orders: selected.map(o => role==='gate'?require('../gate-order-view')(enrichOrder(o,legacyReturns,readIndex)):enrichOrder(o, legacyReturns, readIndex)), total, limit, offset } };
});

route('GET', '/api/orders/:id', { roles: ['admin', 'gate', 'sales', 'warehouse', 'driver'] }, (ctx) => {
  const order = findOrder(ctx.params.id);
  const role = normalizeRole(ctx.user.roleCode);
  // v37.27.0 — راننده فقط جزئیات محموله‌ای را می‌بیند که به خودش واگذار شده است؛
  // پاسخ محدود به همان سرویس است (بدون پرداخت‌ها، بدون خدمه‌برهای دیگر، بدون دادهٔ امضا).
  if (role === 'driver') {
    const dispatchLib = require('../dispatch');
    if (!ctx.user.driverId) fail(403, 'این حساب به هیچ راننده‌ای متصل نیست.', 'FORBIDDEN');
    const views = dispatchLib.dispatchViews(order).filter((v) => v.dispatch && v.dispatch.driverId === ctx.user.driverId);
    if (!views.length) fail(403, 'این سفارش در فهرست تحویل شما نیست.', 'FORBIDDEN');
    const runQ = Number(ctx.query.get('run')) || null;
    const view = views.find((v) => (v.dispatch.run || null) === runQ)
      || views.find((v) => dispatchLib.OPEN_STATUSES.includes(v.dispatch.status))
      || views[views.length - 1];
    const scoped = dispatchLib.publicOrder({ ...order, dispatch: view.dispatch });
    const { payments, payment, visit, dispatchRuns, storeRun, ...rest } = scoped; // eslint-disable-line no-unused-vars
    rest.storeRunOps = order.storeRunOps || {};
    return { status: 200, body: { order: rest } };
  }
  if (role === 'gate' && (!['SETTLED', 'EXITED'].includes(order.status) || order.dispatch)) fail(403, 'این سفارش از گردش پخش خارج شده و به کارتابل نگهبانی ارجاع نمی‌شود.', 'FORBIDDEN');
  if (role === 'warehouse' && !['WAREHOUSE_PENDING', 'WAREHOUSE_PREPARING'].includes(order.status)) fail(403, 'دسترسی برای این نقش مجاز نیست.', 'FORBIDDEN');
  return { status: 200, body: { order: role==='gate'?require('../gate-order-view')(enrichOrder(order)):enrichOrder(order) } };
});

route('GET', '/api/warehouse/visit-order-details/:id', { roles: ['warehouse', 'admin'] }, (ctx) => {
  const order = findOrder(ctx.params.id);
  const db = store.get();
  const linkedVisit = (db.visits || []).some(visit => visit.orderId === order.id || visit.id === order.visitId);
  const linkedOrderId = (order.visitId && (db.visits || []).some(visit => visit.id === order.visitId)) || !!linkedVisit;
  // v37.50.0 — مدیر برای هر سفارشی (حتی بدون مراجعه یا پیش از خروج) پروندهٔ کامل را می‌گیرد؛
  // دامنهٔ محدود قبلی فقط برای نقش انبار حفظ شده است.
  if (normalizeRole(ctx.user.roleCode) !== 'admin') {
    if (!linkedOrderId) fail(404, 'سفارش به سابقهٔ مراجعه پیوند نخورده است.');
    if (!isGateExitAvailable(order)) fail(409, 'جزئیات سفارش پس از تسویه یا ثبت خروج در دسترس است.');
  }

  const trips = Object.values(order.transportStoreTrips || {}).filter(trip => !!trip?.departedAt);
  const view = require('../gate-order-view')(
    order.dispatch ? require('../dispatch').publicOrder(order) : enrichOrder(order)
  );
  let records;
  if (trips.length) {
    records = trips.map(trip => ({
      serviceRun: trip.run || null,
      items: (trip.lines || []).map(line => ({
        id: line.itemId || '',
        itemStatus: 'DELIVERED',
        product: { name: line.productName || '—' },
        deliveredKg: line.deliveredKg,
      })),
    }));
  } else {
    const documentItems = order.pickupHandover?.document?.items;
    const items = documentItems
      ? documentItems.map(line => ({
        id: line.itemId || '',
        itemStatus: line.outOfStock ? 'OUT_OF_STOCK' : 'DELIVERED',
        product: { name: line.productName || '—' },
        deliveredKg: line.deliveredKg,
      }))
      : (view.items || []).map(item => ({
        id: item.id || '',
        itemStatus: item.itemStatus,
        product: { name: item.product?.name || '—' },
        deliveredKg: item.deliveredKg,
      }));
    records = [{ serviceRun: view.dispatch?.run || null, items }];
  }

  // v37.50.0 — خروجی قبلی فقط شماره/نوع سفارش و نام مشتری را می‌داد و هیچ‌جا
  // در UI نمایش داده نمی‌شد؛ اکنون پروندهٔ کامل بدون دادهٔ مالی برمی‌گردد.
  const dossier = require('../warehouse-order-dossier')(store.get(), order);
  return {
    status: 200,
    body: {
      order: {
        ...dossier.order,
        id: view.id || order.id,
        orderNo: view.orderNo || '—',
        orderType: view.orderType,
        storeName: view.storeName || null,
        customer: { ...dossier.customer, name: view.customer?.name || dossier.customer.name || '' },
      },
      customer: dossier.customer,
      visit: dossier.visit,
      stages: dossier.stages,
      items: dossier.items,
      events: dossier.events,
      records,
    },
  };
});

route('GET','/api/gate/exit-history',{roles:['gate','admin']},ctx=>{
 const db=store.get(),q=validate.digitsToAscii(String(ctx.query.get('q')||'').trim().toLowerCase()).slice(0,80),id=String(ctx.query.get('id')||'').trim().slice(0,160);
 const rows=db.orders.flatMap(o=>{
   const trips=Object.values(o.transportStoreTrips||{}).filter(t=>t.departedAt);
   if(trips.length)return trips.map(t=>({...require('../gate-order-view')(enrichOrder(o)),id:o.id+':'+t.run,exitedAt:t.departedAt,serviceRun:t.run,items:(t.lines||[]).map(l=>({id:l.itemId,product:{name:l.productName},deliveredKg:l.deliveredKg,itemStatus:'DELIVERED'}))}));
   if(o.status!=='EXITED'&&!o.dispatch?.gateExitAt&&!o.dispatch?.gateFinalExitAt&&!o.transportDeparture)return [];
   const view=require('../gate-order-view')(o.dispatch?require('../dispatch').publicOrder(o):enrichOrder(o));
   const doc=o.pickupHandover?.document;
   if(doc)view.items=(doc.items||[]).map(l=>({id:l.itemId,product:{name:l.productName},deliveredKg:l.deliveredKg,itemStatus:l.outOfStock?'OUT_OF_STOCK':'DELIVERED'}));
   return [view];
 }).filter(o=>(!id||o.id===id||String(o.id||'').startsWith(id+':'))&&(!q||[o.orderNo,o.customer?.name,o.customer?.phone].some(x=>validate.digitsToAscii(String(x||'').toLowerCase()).includes(q)))).sort((a,b)=>String(b.exitedAt||b.dispatch?.gateExitAt||b.updatedAt||'').localeCompare(String(a.exitedAt||a.dispatch?.gateExitAt||a.updatedAt||''))).slice(0,100);
 return {body:{orders:rows}};
});

// ---------- انبار ----------
route('POST', '/api/orders/:id/warehouse/accept', { roles: ['warehouse'], idempotent: true }, (ctx) => withPickupOrderLock(ctx, () => {
  const order = findOrder(ctx.params.id);
  if (order.status !== 'WAREHOUSE_PENDING') fail(409, 'این سفارش در بخش سفارش‌های ورودی نیست.');
  const now = store.nowIso();
  Object.assign(order, { status: 'WAREHOUSE_PREPARING', warehouseAcceptedAt: now, warehouseAcceptedBy: ctx.user.id, warehousePreparationStartedAt: null, warehousePreparationStartedBy: null, updatedAt: now });
  notifyStore(order,'STORE_ORDER_UPDATE',`سفارش ${order.orderNo} در انبار دریافت شد.`);
  store.audit(ctx.user, 'WAREHOUSE_ACCEPT_ORDER', 'order', order.id, { from: 'WAREHOUSE_PENDING', to: 'WAREHOUSE_PREPARING' }, ctx);
  store.save();
  return { status: 200, body: { order: enrichOrder(order) } };
}));

route('POST', '/api/orders/:id/warehouse/start-preparing', { roles: ['warehouse'] }, (ctx) => withPickupOrderLock(ctx, () => {
  const order = findOrder(ctx.params.id);
  if (order.status !== 'WAREHOUSE_PREPARING') fail(409, 'این سفارش ابتدا باید توسط انبار تأیید و وارد آماده‌سازی شود.');
  if (!order.warehousePreparationStartedAt) {
    Object.assign(order, { warehousePreparationStartedAt: store.nowIso(), warehousePreparationStartedBy: ctx.user.id, updatedAt: store.nowIso() });
    notifyStore(order,'STORE_ORDER_UPDATE',`آماده‌سازی سفارش ${order.orderNo} آغاز شد.`);
    store.audit(ctx.user, 'WAREHOUSE_START_PREPARING', 'order', order.id, {}, ctx);
    store.save();
  }
  return { status: 200, body: { order: enrichOrder(order) } };
}));

route('POST', '/api/orders/:id/warehouse/reopen-preparing', { roles: ['sales'] }, (ctx) => withPickupOrderLock(ctx, () => {
  const db = store.get();
  const order = findOrder(ctx.params.id);
  if (order.status !== 'SETTLEMENT_PENDING') fail(409, 'فقط سفارش آماده تسویه می‌تواند به آماده‌سازی انبار برگردد.');
  if (order.dispatch || (order.transportWorkflow===1 && order.transportHandovers?.['0'])) fail(409, 'پس از واگذاری به پخش، بازگشت از این مسیر ممکن نیست.');
  db.orderItems.filter((i) => i.orderId === order.id && ACTIVE(i)).forEach((i) => Object.assign(i, { itemStatus: 'PENDING', deliveredKg: null, unitPrice: null, finalAmount: null, warehouseStatus: null }));
  if (order.storeRunOps?.finalizedAt) order.storeRunOps = { ...order.storeRunOps, finalizedAt: null, finalizedBy: null, finalizedByName: null }; // v37.35.0 — بازگشت به آماده‌سازی یعنی کار انبار دوباره باز است
  Object.assign(order, { status: 'WAREHOUSE_PREPARING', warehouseReopenedAt: store.nowIso(), warehouseReopenedBy: ctx.user.id, warehousePreparationStartedAt: null, warehousePreparationStartedBy: null, updatedAt: store.nowIso() });
  createNotification('warehouse', 'REOPEN_PREPARING', 'order', order.id, `سفارش ${order.orderNo || '—'} برای بررسی مجدد و آماده‌سازی به انبار برگشت داده شد.`);
  store.audit(ctx.user, 'REOPEN_WAREHOUSE_PREPARING', 'order', order.id, { from: 'SETTLEMENT_PENDING', to: 'WAREHOUSE_PREPARING' }, ctx);
  store.save();
  return { status: 200, body: { order: enrichOrder(order) } };
}));

// Save a replaceable preparation draft without creating delivery, a document or a settlement.
route('POST', '/api/orders/:id/warehouse/draft', { roles: ['warehouse'], idempotent: true }, (ctx) => withWarehouseWrite(ctx, () => {
  const db=store.get(),order=findOrder(ctx.params.id),now=store.nowIso();
  const draft=require('../warehouse-weight-draft').prepare(order,db.orderItems,ctx.body,ctx.user,now);
  order.warehouseWeightDraft=draft;order.updatedAt=now;
  store.audit(ctx.user,'WAREHOUSE_DRAFT_SAVED','order',order.id,{revision:draft.revision,items:draft.items},ctx);
  store.save();return {status:200,body:{draft}};
}));

// ثبت وزن نهایی: همه اقلام فعال باید وزن (یا وضعیت ناموجود) داشته باشند
route('POST', '/api/orders/:id/warehouse', { roles: ['warehouse'], idempotent: true }, (ctx) => withWarehouseWrite(ctx, () => {
  const db = store.get();
  const order = findOrder(ctx.params.id);
  if (order.status !== 'WAREHOUSE_PREPARING') fail(409, 'این سفارش ابتدا باید توسط انبار تأیید و وارد آماده‌سازی شود.');
  if (order.orderType === 'STORE') fail(409, 'سفارش فروشگاه فقط با عملیات سرویس اول/دوم و «پایان عملیات ارسال امروز» نهایی می‌شود.'); // v37.4.0
  require('../warehouse-weight-draft').checkRevision(order,ctx.body.draftRevision,!!order.warehouseWeightDraft);
  const updates = Array.isArray(ctx.body.items) ? ctx.body.items : [];
  const active = db.orderItems.filter((i) => i.orderId === order.id && ACTIVE(i));
  const byId = new Map(updates.map((x) => [String(x?.itemId), x]));
  const plan = active.map((item) => {
    const x = byId.get(item.id);
    if (!x) fail(400, `وزن قلم «${getProduct(item.productId)?.name || item.productId}» ثبت نشده است.`);
    const note = require('../warehouse-item-note').normalize(x.note);
    if (x.outOfStock) return { item, status: 'OUT_OF_STOCK', kg: 0, note };
    const weighing = require('../warehouse-weighing').weighingsFor(x.weighings);
    const kg = weighing ? weighing.netKg : validate.number(x.deliveredKg, { field: 'وزن تحویلی', min: 0.001, max: validate.MAX_QTY });
    return { item, status: 'DELIVERED', kg, weighings: weighing?.rows || null, note };
  });
  if (!plan.length) fail(409, 'هیچ قلم فعالی برای ثبت وزن وجود ندارد.');
  const confirmed=ctx.body.physicalHandoverConfirmed===true;
  const hasGoods=plan.some(p=>p.kg>0);
  const assignment=order.transportAssignments?.['0'];
  if(confirmed&&hasGoods&&order.deliveryMode==='DELIVERY'&&(!assignment?.driverId||!assignment?.driverName||!assignment?.vehicleId||!assignment?.vehiclePlate))fail(409,'ابتدا راننده و خودرو را برای تحویل فیزیکی تعیین کنید.');
  const documentNo = require('../warehouse-document-numbers').assignWarehouseDocumentNumber(db, order);
  const now = store.nowIso();
  for (const p of plan) { Object.assign(p.item, { itemStatus: p.status, deliveredKg: p.kg, returnReason: '', warehouseStatus: p.status, warehouseWeighings: p.weighings || null }); require('../warehouse-item-note').record(p.item, p.note, ctx.user, now); } // v37.3.5: نتیجهٔ انبار حتی اگر فروش بعداً قلم را لغو کند حفظ می‌شود
  Object.assign(order, { status: 'SETTLEMENT_PENDING', warehouseCompletedAt: now, warehouseCompletedBy: ctx.user.id, warehouseWeightDraft:null, updatedAt: now });
  createNotification('sales', 'WAREHOUSE_DONE', 'order', order.id, `وزن نهایی سفارش ${order.orderNo || '—'} ثبت شد و برای تسویه فروش ارسال شد.`);
  store.audit(ctx.user, 'WAREHOUSE_FINALIZE', 'order', order.id, { warehouseDocumentNo: documentNo, items: plan.map((p) => ({ itemId: p.item.id, status: p.status, deliveredKg: p.kg, weighings: p.weighings || null, productName: getProduct(p.item.productId)?.name || '—', requestedQty: p.item.requestedQty, requestedUnit: p.item.requestedUnit, description: p.item.description || '', note: p.note })) }, ctx);
  let handover=null;
  if(confirmed&&hasGoods){
    const doc=warehouseDeliveredDocuments(db).find(d=>d.id===order.id);
    if(!doc)fail(409,'سند تحویل انبار آماده نیست.');
    handover={run:0,handedOverAt:now,handedOverBy:ctx.user.id,physicalHandoverConfirmed:true,signedPaperConfirmed:false,document:JSON.parse(JSON.stringify(doc))};
    if(order.deliveryMode==='DELIVERY'){
      Object.assign(handover,{driverId:assignment.driverId,driverName:assignment.driverName,driverPhone:assignment.driverPhone,vehicleId:assignment.vehicleId,vehicleType:assignment.vehicleType,vehiclePlate:assignment.vehiclePlate});
      order.transportHandovers={...(order.transportHandovers||{}),'0':handover};
      createNotification('dispatch','TRANSPORT_WAREHOUSE_HANDOVER','order',order.id,`تحویل فیزیکی سفارش ${order.orderNo||'—'} به راننده در انبار ثبت شد.`);
      store.audit(ctx.user,'TRANSPORT_WAREHOUSE_HANDOVER','order',order.id,{run:0,warehouseDocumentNo:documentNo,physicalHandoverConfirmed:true,driverId:assignment.driverId},ctx);
    }else{order.warehouseHandover=handover;store.audit(ctx.user,'WAREHOUSE_PHYSICAL_HANDOVER','order',order.id,{warehouseDocumentNo:documentNo,physicalHandoverConfirmed:true},ctx);}
  }
  store.save();
  return { status: 200, body: { order: enrichOrder(order),handover } };
}));

// Read-only warehouse documents. Weight and stock result come from the latest
// finalization audit, not from subsequent sales edits or payment information.
function warehouseDeliveredDocuments(db, { includePendingEdits = false } = {}) {
  const lastEvent = new Map();
  for (const e of db.audit) if (e.entityType === 'order' && ['WAREHOUSE_FINALIZE','WAREHOUSE_DOCUMENT_EDITED','REOPEN_WAREHOUSE_PREPARING'].includes(e.action)) lastEvent.set(e.entityId, e);
  const itemsByOrder = new Map();
  for (const item of db.orderItems) { const a=itemsByOrder.get(item.orderId)||[]; a.push(item); itemsByOrder.set(item.orderId,a); }
  const customers=new Map(db.customers.map(c=>[c.id,c])), users=new Map(db.users.map(u=>[u.id,u]));
  const documents=[];
  for (const o of db.orders) {
    if (o.orderType === 'STORE' || !o.warehouseCompletedAt) continue;
    if (!includePendingEdits && (o.documentEdits || []).some(edit => edit.status === 'PENDING_WAREHOUSE')) continue;
    const event=lastEvent.get(o.id);
    if (event?.action === 'REOPEN_WAREHOUSE_PREPARING' || ['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','RETURNED_TO_SALES'].includes(o.status)) continue;
    const originals=itemsByOrder.get(o.id)||[], byId=new Map(originals.map(i=>[i.id,i]));
    const recorded=['WAREHOUSE_FINALIZE','WAREHOUSE_DOCUMENT_EDITED'].includes(event?.action) && Array.isArray(event.details?.items) ? event.details.items : null;
    const items=(recorded || originals.filter(i=>['DELIVERED','OUT_OF_STOCK'].includes(i.warehouseStatus||i.itemStatus)).map(i=>({itemId:i.id,status:i.warehouseStatus||i.itemStatus,deliveredKg:i.deliveredKg}))).map(r=>{
      const i=byId.get(r.itemId)||{};
      return { itemId:r.itemId, productId:r.productId || i.productId || '', productName:r.productName || getProduct(i.productId)?.name || '—', requestedQty:r.requestedQty ?? i.requestedQty ?? null, requestedUnit:r.requestedUnit ?? i.requestedUnit ?? '', description:r.description ?? i.description ?? '', deliveredKg:Number(r.deliveredKg || 0), weighings:r.weighings || null, outOfStock:r.status==='OUT_OF_STOCK' || (i.warehouseStatus||i.itemStatus)==='OUT_OF_STOCK' };
    }).filter(line=>!line.outOfStock); // قلم ناموجود در سند انبار نمی‌آید
    const c=customers.get(o.customerId), u=users.get(o.warehouseCompletedBy || event?.userId);
    // قلم ناموجود در سند انبار نمایش داده نمی‌شود؛ سند ذخیره‌شده هم هنگام خواندن پالایش می‌شود.
    const enrichSavedDocument=saved=>({...saved,items:(saved.items||[]).map(line=>{const item=byId.get(line.itemId);return {...line,itemId:line.itemId||item?.id||'',productId:line.productId||item?.productId||''};}).filter(line=>!line.outOfStock)});
    if(o.pickupHandover?.document){documents.push({...enrichSavedDocument(o.pickupHandover.document),status:o.status});continue;}
    const handover=o.transportHandovers?.['0'],assignment=o.transportAssignments?.['0']||{};
    if(o.transportWorkflow===1 && handover?.document){
      const saved=enrichSavedDocument(handover.document);
      documents.push({...saved,deliveryMode:'DELIVERY',handedOverToDriver:true,
        handedOverAt:saved.handedOverAt||handover.handedOverAt||null,
        driverName:saved.driverName||handover.driverName||'',driverPhone:saved.driverPhone||handover.driverPhone||'',
        vehicleType:saved.vehicleType||handover.vehicleType||'',vehiclePlate:saved.vehiclePlate||handover.vehiclePlate||''});
      continue;
    }
    const transport=o.deliveryMode==='DELIVERY' ? {
      deliveryMode:'DELIVERY',handedOverToDriver:!!handover?.physicalHandoverConfirmed,handedOverAt:handover?.handedOverAt||null,
      driverName:handover?.driverName||assignment.driverName||o.driverName||'',
      driverPhone:handover?.driverPhone||assignment.driverPhone||o.driverPhone||'',
      vehicleType:handover?.vehicleType||assignment.vehicleType||'',vehiclePlate:handover?.vehiclePlate||assignment.vehiclePlate||'',
    } : {};
    documents.push({...transport,id:o.id,warehouseDocumentNo:o.warehouseDocumentNo||'',orderNo:o.orderNo||'—',orderType:o.orderType||'',status:o.status,createdAt:o.createdAt,completedAt:o.warehouseCompletedAt,completedBy:u?.fullName||u?.username||event?.username||'—',customerName:c?.name||'—',customerPhone:c?.phone||'',dispatchPlace:o.dispatchPlace||'',deliveryDate:o.deliveryDate||null,notes:o.notes||'',items,deliveredKg:+items.reduce((sum,i)=>sum+i.deliveredKg,0).toFixed(3),legacy:!recorded || recorded.some(r=>!Object.hasOwn(r,'productName'))});
  }
  return documents.sort((a,b)=>String(b.completedAt||'').localeCompare(String(a.completedAt||'')) || String(a.id).localeCompare(String(b.id)));
}
route('GET','/api/warehouse/delivered',{roles:['admin','warehouse']},ctx=>{
  const q=validate.digitsToAscii(String(ctx.query.get('q')||'')).trim().toLowerCase().slice(0,80);
  const offset=Math.max(0,Number.parseInt(ctx.query.get('offset'),10)||0), limit=50;
  const rows=warehouseDeliveredDocuments(store.get()).filter(o=>!q||[o.warehouseDocumentNo,o.orderNo,o.customerName,o.customerPhone,...o.items.map(i=>i.productName)].some(v=>String(v||'').toLowerCase().includes(q)));
  return {status:200,body:{orders:rows.slice(offset,offset+limit).map(({items,notes,...o})=>({...o,itemCount:items.length})),total:rows.length,offset,limit}};
});
route('GET','/api/warehouse/delivered/:id',{roles:['admin','warehouse']},ctx=>{
  const order=warehouseDeliveredDocuments(store.get()).find(o=>o.id===ctx.params.id);
  if(!order) fail(404,'سند انبار یافت نشد یا سفارش برای آماده‌سازی مجدد باز شده است.');
  if(order.deliveryMode==='DELIVERY'&&!order.driverName)fail(409,'ابتدا ترابری راننده و خودرو را تعیین کند.');
  const source=store.get().orders.find(o=>o.id===order.id);
  const token=order.deliveryMode==='DELIVERY'&&!source.transportHandovers?.['0']?require('../transport-planning').handoverToken(source,0,order):null;
  return {status:200,body:{order:token?{...order,handoverToken:token}:order}};
});


// This records physical handover, never customer delivery, payment, or a
// signature. The printed document must still be signed by the driver on paper.
// Older clients may also explicitly attest to an existing paper signature.
route('POST','/api/warehouse/transport-handovers/:id',{roles:['warehouse'],idempotent:true},ctx=>require('../transport-transaction')(()=>{
  const db=store.get(), order=findOrder(ctx.params.id), run=Number(ctx.body?.run??0);
  try{require('../transport-planning').assertEnabled();}catch(e){fail(e.status||503,e.message);}
  if(order.transportWorkflow!==1 || order.deliveryMode!=='DELIVERY')fail(409,'این سفارش در گردش جدید پخش نیست.');
  if(order.orderType==='STORE' ? !storeOrderKind.allowedRuns(order).includes(run) : run!==0)fail(400,'شماره سرویس معتبر نیست.');
  const key=String(run), previous=order.transportHandovers?.[key];
  if(previous)return {body:{handover:previous}};
  if(!['WAREHOUSE_PREPARING','SETTLEMENT_PENDING'].includes(order.status))fail(409,'سفارش در وضعیت قابل تحویل نیست.');
  if(ctx.body?.physicalHandoverConfirmed!==true && ctx.body?.signedPaperConfirmed!==true)fail(400,'تحویل فیزیکی کالا به راننده را تأیید کنید.');
  const assigned=order.transportAssignments?.[key];
  if(!assigned?.driverId||!assigned?.driverName||!assigned?.vehicleId||!assigned?.vehiclePlate)fail(409,'ابتدا راننده و خودرو توسط ترابری تعیین شوند.');
  const doc=order.orderType==='STORE' ? require('../store-run-print').warehouseServiceDocument(db,order,run,getProduct) : warehouseDeliveredDocuments(db).find(d=>d.id===order.id);
  if(!doc||!(order.orderType==='STORE'?doc.lines?.length:doc.items?.some(i=>!i.outOfStock&&i.deliveredKg>0)))fail(409,'ابتدا اقلام و وزن نهایی این سرویس در انبار ثبت شود.');
  const expected=require('../transport-planning').handoverToken(order,run,doc);
  if(ctx.body?.handoverToken!==expected)fail(409,'سند یا تخصیص تغییر کرده است؛ سند را دوباره بررسی و چاپ کنید.');
  const now=store.nowIso();
  const handover={run,driverId:assigned.driverId,driverName:assigned.driverName,driverPhone:assigned.driverPhone,vehicleId:assigned.vehicleId,vehicleType:assigned.vehicleType,vehiclePlate:assigned.vehiclePlate,handedOverAt:now,handedOverBy:ctx.user.id,physicalHandoverConfirmed:true,signedPaperConfirmed:ctx.body?.signedPaperConfirmed===true,document:JSON.parse(JSON.stringify(doc))};
  order.transportHandovers={...(order.transportHandovers||{}),[key]:handover};order.updatedAt=now;
  store.audit(ctx.user,'TRANSPORT_WAREHOUSE_HANDOVER','order',order.id,{run,driverId:assigned.driverId,driverName:assigned.driverName,vehicleId:assigned.vehicleId,vehiclePlate:assigned.vehiclePlate,warehouseDocumentNo:doc.warehouseDocumentNo,physicalHandoverConfirmed:true,signedPaperConfirmed:ctx.body?.signedPaperConfirmed===true},ctx);
  createNotification('sales','TRANSPORT_WAREHOUSE_HANDOVER','order',order.id,`تحویل فیزیکی سفارش ${order.orderNo||'—'} به راننده در انبار ثبت شد.`,{run});
  createNotification('dispatch','TRANSPORT_WAREHOUSE_HANDOVER','order',order.id,`تحویل فیزیکی ${run?`سرویس ${run===1?'اول':'دوم'} `:''}سفارش ${order.orderNo||'—'} به راننده در انبار ثبت شد.`,{run});
  return {body:{handover}};
}));

// ---------- v37.3.4 — سوابق و گزارش انبار ----------
// سفارش‌هایی که وزن نهایی‌شان در انبار ثبت شده (warehouseCompletedAt) و ارجاع‌های انبار به فروش، در یک بازهٔ تاریخ محلی
function whLocalDay(iso) {
  const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const WH_DAY = /^\d{4}-\d{2}-\d{2}$/;

// ---------- v37.11.0 — آمار زندهٔ سفارشات ورودی امروز (داشبورد انبار) ----------
// «ورودی امروز» یعنی سفارشی که امروز وارد صف انبار شده است (زمان فعال‌شدن سفارش زمان‌بندی‌شده
// یا زمان ایجاد سفارش فوری)، در هر وضعیتی که الان باشد؛ حتی اگر آماده‌سازی/تحویل آن تمام شده باشد.
// فقط سفارش‌های لغوشده شمرده نمی‌شوند. مقادیر هر محصول به تفکیک واحد سفارش جمع می‌شود.
const WH_ENTERED_STATUSES = ['WAREHOUSE_PENDING', 'WAREHOUSE_PREPARING', 'SETTLEMENT_PENDING', 'SETTLED', 'EXITED', 'RETURNED_TO_SALES', 'DELIVERED', 'CLOSED', 'OUT_OF_STOCK'];
route('GET', '/api/warehouse/today-stats', { roles: ['admin', 'warehouse'] }, () => {
  activateDueRemoteOrders();
  const db = store.get();
  const day = today();
  const r3 = (n) => +Number(n || 0).toFixed(3);
  const totals = { orders: 0, items: 0, products: 0, pending: 0, preparing: 0, done: 0, units: {} };
  const byProd = new Map();
  for (const o of db.orders) {
    if (o.status === 'CANCELLED' || !WH_ENTERED_STATUSES.includes(o.status)) continue;
    if (whLocalDay(o.activatedAt || o.createdAt) !== day) continue;
    totals.orders += 1;
    if (o.status === 'WAREHOUSE_PENDING') totals.pending += 1;
    else if (o.status === 'WAREHOUSE_PREPARING') totals.preparing += 1;
    else totals.done += 1;
    const seen = new Set();
    for (const it of db.orderItems) {
      if (it.orderId !== o.id || it.itemStatus === 'CANCELLED') continue;
      totals.items += 1;
      const u = it.requestedUnit || 'کیلوگرم';
      const q = Number(it.requestedQty || 0);
      totals.units[u] = r3((totals.units[u] || 0) + q);
      let b = byProd.get(it.productId);
      if (!b) { const pr = getProduct(it.productId); b = { productId: it.productId, productName: pr?.name || 'کالای حذف‌شده', quickCode: pr?.quickCode || '', orders: 0, lines: 0, units: {} }; byProd.set(it.productId, b); }
      b.lines += 1; b.units[u] = r3((b.units[u] || 0) + q);
      if (!seen.has(it.productId)) { b.orders += 1; seen.add(it.productId); }
    }
  }
  totals.products = byProd.size;
  const kgOf = (b) => Number(b.units['کیلوگرم'] || 0);
  const byProduct = [...byProd.values()].sort((a, b) => kgOf(b) - kgOf(a) || b.orders - a.orders || a.productName.localeCompare(b.productName, 'fa'));

  // مستقل از سفارش‌های ورودی، محصولاتی را هم جمع می‌کنیم که امروز در انبار
  // وزن نهایی‌شان ثبت شده است؛ مبنا همان وضعیت ثبت‌شدهٔ انبار است، نه تغییرات فروش.
  const deliveredByProd = new Map();
  const deliveredTotals = { orders: 0, items: 0, products: 0, deliveredKg: 0, outOfStock: 0 };
  for (const o of db.orders) {
    if (!o.warehouseCompletedAt || whLocalDay(o.warehouseCompletedAt) !== day) continue;
    deliveredTotals.orders += 1;
    const seen = new Set();
    for (const it of db.orderItems) {
      if (it.orderId !== o.id) continue;
      const status = it.warehouseStatus || it.itemStatus;
      if (!['DELIVERED', 'OUT_OF_STOCK'].includes(status)) continue;
      deliveredTotals.items += 1;
      const kg = status === 'DELIVERED' ? Number(it.deliveredKg || 0) : 0;
      deliveredTotals.deliveredKg = r3(deliveredTotals.deliveredKg + kg);
      if (status === 'OUT_OF_STOCK') deliveredTotals.outOfStock += 1;
      let row = deliveredByProd.get(it.productId);
      if (!row) {
        const pr = getProduct(it.productId);
        row = { productId: it.productId, productName: pr?.name || 'کالای حذف‌شده', quickCode: pr?.quickCode || '', orders: 0, lines: 0, deliveredKg: 0, outOfStock: 0 };
        deliveredByProd.set(it.productId, row);
      }
      row.lines += 1;
      row.deliveredKg = r3(row.deliveredKg + kg);
      if (status === 'OUT_OF_STOCK') row.outOfStock += 1;
      if (!seen.has(it.productId)) { row.orders += 1; seen.add(it.productId); }
    }
  }
  const deliveredByProduct = [...deliveredByProd.values()].sort((a, b) => b.deliveredKg - a.deliveredKg || b.orders - a.orders || a.productName.localeCompare(b.productName, 'fa'));
  deliveredTotals.products = deliveredByProduct.length;
  return { status: 200, body: { date: day, totals, byProduct, deliveredTotals, deliveredByProduct } };
});
route('GET', '/api/warehouse/history', { roles: ['admin', 'warehouse'] }, (ctx) => {
  const db = store.get();
  let from = String(ctx.query.get('from') || ''); let to = String(ctx.query.get('to') || '');
  if (!WH_DAY.test(to)) to = today();
  if (!WH_DAY.test(from)) from = to;
  if (from > to) [from, to] = [to, from];
  const q = String(ctx.query.get('q') || '').trim().toLowerCase().slice(0, 80);
  const onlyOos = ctx.query.get('result') === 'oos';
  const onlyType = String(ctx.query.get('orderType') || '').toUpperCase(); // v37.36.0 — سربرگ «سوابق و گزارشات» فروشگاه‌های انبار فقط سفارش‌های فروشگاهی را می‌خواهد
  const SRH = require('../store-runs');
  const userName = (id) => { const u = db.users.find((x) => x.id === id); return u ? (u.fullName || u.username) : ''; };
  const finalizer = new Map();
  for (const e of db.audit) if (e.action === 'WAREHOUSE_FINALIZE' && e.entityId) finalizer.set(e.entityId, e.userId);
  const rows = [];
  for (const o of db.orders) {
    if (!o.warehouseCompletedAt) continue;
    if (onlyType && String(o.orderType || '') !== onlyType) continue;
    const day = whLocalDay(o.warehouseCompletedAt);
    if (day < from || day > to) continue;
    const c = db.customers.find((x) => x.id === o.customerId);
    const items = db.orderItems
      .filter((i) => i.orderId === o.id && ['DELIVERED', 'OUT_OF_STOCK'].includes(i.warehouseStatus || i.itemStatus))
      .map((i) => { const pr = getProduct(i.productId); return {
        itemId: i.id, reopenRun: o.orderType==='STORE' ? require('../store-runs').completionReopenRun(o,i) : null, reopenBlocked: o.orderType==='STORE' && !!i.runCompleted && !require('../store-runs').completionReopenRun(o,i),
        productId: i.productId, productName: pr?.name || '—', quickCode: pr?.quickCode || '',
        requestedQty: i.requestedQty, requestedUnit: i.requestedUnit, deliveredKg: Number(i.deliveredKg || 0),
        outOfStock: (i.warehouseStatus || i.itemStatus) === 'OUT_OF_STOCK', description: i.description || '',
        r1Kg: o.orderType === 'STORE' ? SRH.r1Kg(i) : null, r2Kg: o.orderType === 'STORE' ? SRH.r2Kg(i) : null }; });
    const customerName = o.orderType === 'STORE' ? require('../store-name').storeDisplayName(o.storeName,o.branchNo) : (c?.name || o.storeName || '—');
    if (q && ![o.orderNo, customerName, c?.phone, o.dispatchPlace].some((v) => String(v || '').toLowerCase().includes(q))
      && !items.some((i) => `${i.productName} ${i.quickCode}`.toLowerCase().includes(q))) continue;
    const oos = items.filter((i) => i.outOfStock).length;
    if (onlyOos && !oos) continue;
    rows.push({
      id: o.id, orderNo: o.orderNo || '—', orderType: o.orderType || '', storeOrderKind: o.orderType==='STORE'?storeOrderKind.kind(o):null, status: o.status, day,
      customerName, customerPhone: o.orderType === 'STORE' ? '' : (c?.phone || ''), dispatchPlace: o.dispatchPlace || '', deliveryDate: o.deliveryDate || null,
      createdAt: o.createdAt, acceptedAt: o.warehouseAcceptedAt || null, completedAt: o.warehouseCompletedAt,
      completedBy: userName(o.warehouseCompletedBy || finalizer.get(o.id)) || '—',
      printRuns: o.orderType === 'STORE' ? [1,2].filter(run => require('../store-run-print').serviceDocument(db,o,run,getProduct)) : [],
      items, itemCount: items.length, outOfStock: oos,
      deliveredKg: +items.reduce((s, i) => s + i.deliveredKg, 0).toFixed(3),
    });
  }
  rows.sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
  const itemCount = rows.reduce((s, r) => s + r.itemCount, 0);
  const outOfStock = rows.reduce((s, r) => s + r.outOfStock, 0);
  const deliveredKg = +rows.reduce((s, r) => s + r.deliveredKg, 0).toFixed(3);
  const prod = new Map();
  for (const r of rows) for (const i of r.items) {
    const k = i.productId || i.productName;
    const x = prod.get(k) || { productName: i.productName, quickCode: i.quickCode, orders: 0, deliveredKg: 0, outOfStock: 0 };
    x.orders += 1; x.deliveredKg = +(x.deliveredKg + i.deliveredKg).toFixed(3); if (i.outOfStock) x.outOfStock += 1;
    prod.set(k, x);
  }
  const byProduct = [...prod.values()].sort((a, b) => b.deliveredKg - a.deliveredKg);
  // ارجاع‌های انبار به فروش در همین بازه (از تاریخچهٔ ممیزی؛ فقط اقدام کاربران انبار)
  const whUsers = new Set(db.users.filter((u) => normalizeRole(u.roleCode) === 'warehouse').map((u) => u.id));
  const returns = db.audit.filter((e) => e.action === 'RETURN_TO_SALES' && whUsers.has(e.userId))
    .filter((e) => { const d = whLocalDay(e.createdAt); return d >= from && d <= to; })
    .filter((e) => { if (!onlyType) return true; const o = db.orders.find((x) => x.id === e.entityId); return !!o && String(o.orderType || '') === onlyType; })
    .map((e) => { const o = db.orders.find((x) => x.id === e.entityId); const c = o && db.customers.find((x) => x.id === o.customerId);
      return { orderId: e.entityId, orderNo: o?.orderNo || '—', customerName: o?.orderType === 'STORE' ? require('../store-name').storeDisplayName(o.storeName,o.branchNo) : (c?.name || o?.storeName || '—'),
        reason: e.details?.reason || '', at: e.createdAt, by: userName(e.userId) || e.username || '—' }; })
    .reverse();
  return {
    status: 200,
    body: {
      from, to, rows, returns,
      summary: { orders: rows.length, itemCount, outOfStock, deliveredKg, returned: returns.length, byProduct },
    },
  };
});

route('GET', '/api/warehouse/history/:id', { roles: ['admin', 'warehouse'] }, (ctx) => {
  const db = store.get();
  const order = findOrder(ctx.params.id);
  if (!order.warehouseCompletedAt) fail(404, 'سفارش در سوابق انبار پیدا نشد.');

  const users = new Map(db.users.map((user) => [user.id, user]));
  const actor = (id, fallback = '') => {
    if (!id) return fallback ? { name: fallback, username: fallback } : null;
    const user = users.get(id);
    return { id, name: user?.fullName || user?.username || fallback || '—', username: user?.username || fallback || '' };
  };
  const visit = db.visits.find((row) => row.id === order.visitId) || null;
  const customer = db.customers.find((row) => row.id === (order.customerId || visit?.customerId)) || null;
  const itemRows = db.orderItems.filter((item) => item.orderId === order.id);
  const itemIds = new Set(itemRows.map((item) => item.id));
  const createEvent = db.audit.find((event) => event.entityType === 'order' && event.entityId === order.id
    && ['CREATE_ORDER', 'CREATE_REMOTE_ORDER', 'CREATE_STORE_ORDER'].includes(event.action));
  const visitEvent = visit && db.audit.find((event) => event.entityType === 'visit' && event.entityId === visit.id && event.action === 'CREATE_VISIT');

  const warehouseActions = new Set([
    'CREATE_VISIT', 'CREATE_ORDER', 'CREATE_REMOTE_ORDER', 'CREATE_STORE_ORDER', 'UPDATE_STORE_ORDER',
    'SALES_EDIT_STORE_ORDER', 'APPROVE_STORE_ORDER', 'QUICK_SEND_STORE_ORDER', 'WAREHOUSE_ACCEPT_ORDER',
    'WAREHOUSE_START_PREPARING', 'WAREHOUSE_DRAFT_SAVED', 'WAREHOUSE_FINALIZE', 'WAREHOUSE_DOCUMENT_EDITED',
    'WAREHOUSE_DOCUMENT_EDIT_REQUESTED', 'REOPEN_WAREHOUSE_PREPARING', 'RETURN_TO_SALES', 'RESUBMIT_TO_WAREHOUSE',
    'WAREHOUSE_PHYSICAL_HANDOVER', 'TRANSPORT_WAREHOUSE_HANDOVER', 'TRANSPORT_PLAN_ASSIGNED',
  ]);
  const relatedEvents = db.audit.filter((event) => {
    const orderEvent = event.entityType === 'order' && event.entityId === order.id;
    const itemEvent = event.entityType === 'order_item'
      && (event.details?.orderId === order.id || itemIds.has(event.entityId));
    const visitRegistration = !!visit && event.entityType === 'visit' && event.entityId === visit.id;
    const isWarehouseAction = warehouseActions.has(event.action) || String(event.action || '').startsWith('STORE_RUN_')
      || ['STORE_ORDER_OUT_OF_STOCK', 'STORE_PARTIAL_OUT_OF_STOCK'].includes(event.action);
    return isWarehouseAction && (orderEvent || itemEvent || visitRegistration);
  }).sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0)).map((event) => ({
    seq: event.seq || 0,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    createdAt: event.createdAt,
    user: actor(event.userId, event.username || ''),
    details: event.details || {},
  }));

  const eventFor = (actions) => [...relatedEvents].reverse().find((event) => actions.includes(event.action));
  const stage = (key, label, at, userId, actions) => {
    const event = eventFor(actions);
    return {
      key, label,
      at: at || event?.createdAt || null,
      user: actor(userId) || event?.user || null,
    };
  };
  const stages = [
    stage('registered', 'ثبت سفارش', order.createdAt, order.createdBy, ['CREATE_ORDER', 'CREATE_REMOTE_ORDER', 'CREATE_STORE_ORDER']),
    ...(visit ? [stage('visit', 'ثبت مراجعهٔ اولیه', visit.createdAt, visit.createdBy, ['CREATE_VISIT'])] : []),
    stage('warehouseAccepted', 'دریافت سفارش در انبار', order.warehouseAcceptedAt, order.warehouseAcceptedBy, ['WAREHOUSE_ACCEPT_ORDER']),
    stage('preparationStarted', 'شروع آماده‌سازی / وزن‌کشی', order.warehousePreparationStartedAt, order.warehousePreparationStartedBy, ['WAREHOUSE_START_PREPARING', 'STORE_RUN_R1_WEIGHT', 'STORE_RUN_R2_WEIGHT']),
    stage('warehouseCompleted', 'ثبت وزن نهایی انبار', order.warehouseCompletedAt, order.warehouseCompletedBy || order.storeRunOps?.finalizedBy, ['WAREHOUSE_FINALIZE', 'WAREHOUSE_DOCUMENT_EDITED', 'STORE_RUN_DAY_FINALIZED', 'STORE_ORDER_OUT_OF_STOCK', 'STORE_PARTIAL_OUT_OF_STOCK']),
  ].filter((entry) => entry.at || entry.user);

  const snapshots = new Map();
  for (const event of db.audit) {
    if (event.entityType !== 'order' || event.entityId !== order.id
      || !['WAREHOUSE_FINALIZE', 'WAREHOUSE_DOCUMENT_EDITED'].includes(event.action)
      || !Array.isArray(event.details?.items)) continue;
    for (const line of event.details.items) if (line.itemId) snapshots.set(line.itemId, line);
  }
  const products = new Map(db.products.map((product) => [product.id, product]));
  const items = itemRows.map((item) => {
    const snapshot = snapshots.get(item.id) || {};
    const runEntries = (rows) => (Array.isArray(rows) ? rows : []).map((entry) => ({
      kg: Number(entry.kg || 0), at: entry.at || null, user: actor(entry.by, entry.byName || ''),
      note: entry.note || '', weighings: entry.weighings || null,
    }));
    return {
      id: item.id,
      productName: snapshot.productName || products.get(item.productId)?.name || '—',
      requestedQty: snapshot.requestedQty ?? item.requestedQty ?? null,
      requestedUnit: snapshot.requestedUnit ?? item.requestedUnit ?? '',
      description: snapshot.description ?? item.description ?? '',
      status: snapshot.status || item.warehouseStatus || item.itemStatus || '',
      deliveredKg: Number(snapshot.deliveredKg ?? item.deliveredKg ?? 0),
      outOfStock: (snapshot.status || item.warehouseStatus || item.itemStatus) === 'OUT_OF_STOCK',
      weighings: snapshot.weighings || item.warehouseWeighings || null,
      runR1: runEntries(item.runR1),
      runR2: runEntries(item.runR2),
    };
  });

  const profile = customer ? Object.fromEntries([
    'id', 'code', 'name', 'phone', 'phone2', 'nationalId', 'company', 'district', 'address',
    'plate', 'vehicleType', 'carType', 'notes', 'createdAt', 'lastVisitAt',
  ].map((key) => [key, customer[key] ?? ''])) : {
    name: order.customerName || '', phone: order.customerPhone || '', plate: '', vehicleType: '',
    phone2: '', nationalId: '', company: '', district: '', address: '', carType: '', notes: '',
  };
  const storeName = order.orderType === 'STORE'
    ? require('../store-name').storeDisplayName(order.storeName, order.branchNo)
    : (order.storeName || '');
  return {
    status: 200,
    body: {
      order: {
        id: order.id, orderNo: order.orderNo || '—', orderType: order.orderType || '', status: order.status || '',
        source: order.source || '', storeName, branchNo: order.branchNo ?? null, storeOrderKind: order.storeOrderKind || '',
        storePurpose: order.storePurpose || '', deliveryMode: order.deliveryMode || '', createdAt: order.createdAt || null,
        createdBy: actor(order.createdBy) || (createEvent && actor(createEvent.userId, createEvent.username || '')) || null,
        updatedAt: order.updatedAt || null, scheduledAt: order.scheduledAt || null,
        scheduledDate: order.scheduledDate || null, deliveryDate: order.deliveryDate || null,
        dispatchPlace: order.dispatchPlace || '', notes: order.notes || '',
        warehouseDocumentNo: order.warehouseDocumentNo || '',
      },
      customer: profile,
      visit: visit ? {
        id: visit.id, status: visit.status || '', purpose: visit.purpose || '', district: visit.district || '',
        plate: visit.plate || '', vehicleType: visit.vehicleType || '', carType: visit.carType || '',
        createdAt: visit.createdAt || null, createdBy: actor(visit.createdBy) || (visitEvent && actor(visitEvent.userId, visitEvent.username || '')) || null,
      } : null,
      stages,
      items,
      events: relatedEvents,
    },
  };
});

route('POST', '/api/orders/:id/return-sales', { roles: ['warehouse', 'sales'] }, (ctx) => withWarehouseWrite(ctx, () => {
  const db = store.get();
  const order = findOrder(ctx.params.id);
  if (!['WAREHOUSE_PENDING', 'WAREHOUSE_PREPARING', 'RETURNED_TO_SALES'].includes(order.status)) fail(409, 'این سفارش در وضعیت قابل ارجاع به فروش نیست.');
  if(order.transportWorkflow===1 && Object.keys(order.transportHandovers||{}).length)fail(409,'پس از تحویل فیزیکی یک سرویس، ارجاع یکجای سفارش مجاز نیست.');
  const reason = validate.text(ctx.body.reason || 'نیاز به اصلاح', { field: 'دلیل ارجاع', max: 300 });
  if(order.warehouseWeightDraft)order.warehouseWeightDraft={revision:require('../warehouse-weight-draft').revision(order)+1,items:[],savedAt:store.nowIso(),savedBy:ctx.user.id};
  order.status = 'RETURNED_TO_SALES'; order.updatedAt = store.nowIso();
  order.warehouseReturn = { reason, at: order.updatedAt, itemId: ctx.body.itemId ? String(ctx.body.itemId) : null };
  // v37.35.0 — ارجاع به فروش یعنی کار انبار دوباره باز شده است؛ نشان «پایان کار انبار» پاک
  // می‌شود تا سفارش پس از ارسال مجدد بتواند به فهرست آماده‌سازی برگردد (سوابق وزنی حفظ می‌شود).
  if (order.storeRunOps?.finalizedAt) order.storeRunOps = { ...order.storeRunOps, finalizedAt: null, finalizedBy: null, finalizedByName: null };
  const itemId = ctx.body.itemId ? String(ctx.body.itemId) : null;
  if (itemId) {
    const item = db.orderItems.find((i) => i.id === itemId && i.orderId === order.id);
    if (item) Object.assign(item, { itemStatus: 'RETURNED_TO_SALES', returnReason: reason });
  } else {
    db.orderItems.filter((i) => i.orderId === order.id && ACTIVE(i)).forEach((i) => Object.assign(i, { itemStatus: 'RETURNED_TO_SALES', returnReason: reason }));
  }
  createNotification('sales', 'RETURN_FROM_WAREHOUSE', 'order', order.id, `سفارش ${order.orderNo || '—'} برای اصلاح به فروش برگشت خورد.`);
  notifyStore(order,'STORE_ORDER_UPDATE',`سفارش ${order.orderNo} برای اصلاح به فروش ارجاع شد.`);
  store.audit(ctx.user, 'RETURN_TO_SALES', 'order', order.id, { itemId, reason }, ctx);
  store.save();
  return { status: 200, body: { order: enrichOrder(order) } };
}));

// ---------- اصلاح سفارش برگشتی (فروش) ----------
route('PUT', '/api/orders/:id/returned-edit', { roles: ['sales'] }, (ctx) => withPickupOrderLock(ctx, () => {
  const db = store.get();
  const order = findOrder(ctx.params.id);
  if (order.status !== 'RETURNED_TO_SALES') fail(409, 'اصلاح یکجای سفارش فقط برای سفارش برگشتی به فروش مجاز است.');
  const incoming = Array.isArray(ctx.body.items) ? ctx.body.items : [];
  if (!incoming.length) fail(400, 'حداقل یک قلم فعال باید در سفارش باقی بماند.');
  if (incoming.length > 100) fail(400, 'تعداد اقلام بیش از حد مجاز است.');
  const activeExisting = db.orderItems.filter((i) => i.orderId === order.id && ACTIVE(i));
  const existingById = new Map(activeExisting.map((i) => [i.id, i]));
  const isStoreRun = order.orderType === 'STORE'; // v37.4.0 — قانون ۱۱ سند فروشگاه
  const seen = new Set();
  const normalized = incoming.map((x) => {
    if (x?.id && (!existingById.has(String(x.id)) || seen.has(String(x.id)))) fail(400, 'یکی از اقلام سفارش معتبر نیست.');
    if (isStoreRun && !x?.id) fail(409, 'افزودن محصول جدید پس از ارسال سفارش فروشگاه به انبار مجاز نیست؛ برای محصول جدید سفارش جداگانه ثبت کنید.');
    if (x?.id) seen.add(String(x.id));
    const l = normalizeLine(x);
    return { id: x?.id ? String(x.id) : null, ...l };
  });
  const deleted = activeExisting.filter((i) => !seen.has(i.id));
  if (isStoreRun) for (const item of deleted) {
    if (require('../store-runs').hasRunActivity(item)) fail(409, 'این قلم دارای سوابق ارسال در سرویس‌هاست و قابل حذف نیست.');
  }
  for (const item of deleted) {
    const before = { productId: item.productId, requestedQty: item.requestedQty, requestedUnit: item.requestedUnit, description: item.description || '', itemStatus: item.itemStatus };
    Object.assign(item, { itemStatus: 'CANCELLED', deletedAt: store.nowIso(), deletedBy: ctx.user.id, returnReason: 'حذف توسط فروش هنگام اصلاح سفارش', deliveredKg: null, unitPrice: null, finalAmount: 0 });
    store.audit(ctx.user, 'DELETE_ORDER_ITEM', 'order_item', item.id, { orderId: order.id, before }, ctx);
  }
  for (const x of normalized) {
    if (x.id) {
      const item = existingById.get(x.id);
      const before = { productId: item.productId, requestedQty: item.requestedQty, requestedUnit: item.requestedUnit, description: item.description || '' };
      const changed = before.productId !== x.productId || Number(before.requestedQty) !== x.requestedQty || before.requestedUnit !== x.requestedUnit || before.description !== x.description;
      if (isStoreRun) Object.assign(item, { productId: x.productId, requestedQty: x.requestedQty, requestedUnit: x.requestedUnit, description: x.description, itemStatus: 'PENDING', returnReason: changed ? 'ویرایش شد' : item.returnReason }); // سوابق سرویس‌ها حفظ می‌شود
      else Object.assign(item, { productId: x.productId, requestedQty: x.requestedQty, requestedUnit: x.requestedUnit, description: x.description, deliveredKg: null, unitPrice: null, finalAmount: null, itemStatus: 'PENDING', returnReason: changed ? 'ویرایش شد' : item.returnReason });
      if (changed) store.audit(ctx.user, 'UPDATE_ORDER_ITEM', 'order_item', item.id, { orderId: order.id, before, after: { productId: x.productId, requestedQty: x.requestedQty, requestedUnit: x.requestedUnit, description: x.description } }, ctx);
    } else {
      const item = newItem(order.id, x);
      db.orderItems.push(item);
      store.audit(ctx.user, 'ADD_ORDER_ITEM', 'order_item', item.id, { orderId: order.id, productId: x.productId, requestedQty: x.requestedQty, requestedUnit: x.requestedUnit }, ctx);
    }
  }
  order.updatedAt = store.nowIso();
  store.audit(ctx.user, 'SAVE_RETURNED_ORDER_EDIT', 'order', order.id, { activeItems: normalized.length, deletedItems: deleted.length }, ctx);
  store.save();
  return { status: 200, body: { order: enrichOrder(order) } };
}));

route('POST', '/api/orders/:id/items', { roles: ['sales'] }, (ctx) => withPickupOrderLock(ctx, () => {
  const order = findOrder(ctx.params.id);
  if (order.status !== 'RETURNED_TO_SALES') fail(409, 'افزودن قلم فقط برای سفارش برگشتی به فروش مجاز است.');
  if (order.orderType === 'STORE') fail(409, 'افزودن محصول جدید پس از ارسال سفارش فروشگاه به انبار مجاز نیست؛ برای محصول جدید سفارش جداگانه ثبت کنید.'); // v37.4.0 — قانون ۱۱
  const l = normalizeLine(ctx.body);
  const item = newItem(order.id, l);
  store.get().orderItems.push(item);
  order.updatedAt = store.nowIso();
  store.audit(ctx.user, 'ADD_ORDER_ITEM', 'order_item', item.id, { orderId: order.id, productId: l.productId, requestedQty: l.requestedQty, requestedUnit: l.requestedUnit }, ctx);
  store.save();
  return { status: 201, body: { item: { ...item, product: l.product }, order: enrichOrder(order) } };
}));

route('PUT', '/api/orders/:id/items/:itemId', { roles: ['sales'] }, (ctx) => withPickupOrderLock(ctx, () => {
  const order = findOrder(ctx.params.id);
  if (order.status !== 'RETURNED_TO_SALES') fail(409, 'ویرایش قلم فقط برای سفارش برگشتی به فروش مجاز است.');
  const item = store.get().orderItems.find((i) => i.id === ctx.params.itemId && i.orderId === order.id);
  if (!item || !ACTIVE(item)) fail(404, 'قلم سفارش یافت نشد.');
  const b = ctx.body;
  const l = normalizeLine({ productId: b.productId ?? item.productId, requestedQty: b.requestedQty ?? item.requestedQty, requestedUnit: b.requestedUnit ?? item.requestedUnit, description: b.description ?? item.description });
  const before = { productId: item.productId, requestedQty: item.requestedQty, requestedUnit: item.requestedUnit, description: item.description || '' };
  if (order.orderType === 'STORE') Object.assign(item, { productId: l.productId, requestedQty: l.requestedQty, requestedUnit: l.requestedUnit, description: l.description, itemStatus: 'PENDING', returnReason: 'ویرایش شد' }); // v37.4.0 — سوابق سرویس‌ها حفظ می‌شود
  else Object.assign(item, { productId: l.productId, requestedQty: l.requestedQty, requestedUnit: l.requestedUnit, description: l.description, deliveredKg: null, unitPrice: null, finalAmount: null, itemStatus: 'PENDING', returnReason: 'ویرایش شد' });
  order.updatedAt = store.nowIso();
  store.audit(ctx.user, 'UPDATE_ORDER_ITEM', 'order_item', item.id, { orderId: order.id, before, after: { productId: l.productId, quickCode: l.product.quickCode, requestedQty: l.requestedQty, requestedUnit: l.requestedUnit, description: l.description } }, ctx);
  store.save();
  return { status: 200, body: { item: { ...item, product: l.product }, order: enrichOrder(order) } };
}));

route('DELETE', '/api/orders/:id/items/:itemId', { roles: ['sales'] }, (ctx) => withPickupOrderLock(ctx, () => {
  const db = store.get();
  const order = findOrder(ctx.params.id);
  if (order.status !== 'RETURNED_TO_SALES') fail(409, 'حذف قلم فقط برای سفارش برگشتی به فروش مجاز است.');
  const item = db.orderItems.find((i) => i.id === ctx.params.itemId && i.orderId === order.id && ACTIVE(i));
  if (!item) fail(404, 'قلم سفارش یافت نشد.');
  if (db.orderItems.filter((i) => i.orderId === order.id && ACTIVE(i)).length <= 1) fail(400, 'حداقل یک قلم فعال باید در سفارش باقی بماند.');
  if (order.orderType === 'STORE' && require('../store-runs').hasRunActivity(item)) fail(409, 'این قلم دارای سوابق ارسال در سرویس‌هاست و قابل حذف نیست.'); // v37.4.0 — قانون ۹
  const before = { productId: item.productId, requestedQty: item.requestedQty, requestedUnit: item.requestedUnit, itemStatus: item.itemStatus };
  Object.assign(item, { itemStatus: 'CANCELLED', deletedAt: store.nowIso(), deletedBy: ctx.user.id, returnReason: 'حذف توسط فروش هنگام اصلاح سفارش', deliveredKg: null, unitPrice: null, finalAmount: 0 });
  order.updatedAt = store.nowIso();
  store.audit(ctx.user, 'DELETE_ORDER_ITEM', 'order_item', item.id, { orderId: order.id, before }, ctx);
  store.save();
  return { status: 200, body: { ok: true, order: enrichOrder(order) } };
}));

route('POST', '/api/orders/:id/resubmit-sales', { roles: ['sales'], idempotent: true }, (ctx) => withPickupOrderLock(ctx, () => {
  const db = store.get();
  const order = findOrder(ctx.params.id);
  if (order.status !== 'RETURNED_TO_SALES') fail(409, 'این سفارش در وضعیت ارسال مجدد به انبار نیست.');
  const active = db.orderItems.filter((i) => i.orderId === order.id && ACTIVE(i));
  if (!active.length) fail(400, 'حداقل یک قلم فعال برای ارسال به انبار لازم است.');
  active.forEach((i) => Object.assign(i, order.orderType === 'STORE'
    ? { itemStatus: 'PENDING', returnReason: '' } // v37.4.0 — سناریوی ششم سند: وزن‌های سرویس اول بعد از ارجاع حفظ می‌شوند
    : { itemStatus: 'PENDING', returnReason: '', deliveredKg: null }));
  Object.assign(order, { status: 'WAREHOUSE_PENDING', updatedAt: store.nowIso(), warehouseReturn: null });
  createNotification('warehouse', 'NEW_ORDER', 'order', order.id, `سفارش برگشتی ${order.orderNo || '—'} پس از بررسی فروش دوباره به انبار ارسال شد.`);
  store.audit(ctx.user, 'RESUBMIT_TO_WAREHOUSE', 'order', order.id, {}, ctx);
  store.save();
  return { status: 200, body: { order: enrichOrder(order) } };
}));

// ---------- تسویه ----------
route('POST', '/api/orders/:id/settle', { roles: ['sales'], idempotent: true }, (ctx) => withPickupOrderLock(ctx, () => {
  const db = store.get();
  const order = findOrder(ctx.params.id);
  if(order.transportWorkflow===1&&order.deliveryMode==='DELIVERY')fail(409,'تسویه سفارش پخش باید پس از بازگشت مدارک در گردش جدید انجام شود.');
  // v37.17.0 — سفارش فروشگاهی که وارد چرخهٔ سرویس‌ها شده، تسویهٔ یکجای کل سفارش ندارد؛
  // سند هر سرویس فقط از نهایی‌کردن تحویل همان سرویس صادر می‌شود تا اقلام دو سرویس هرگز در یک فاکتور جمع نشوند.
  if (order.orderType === 'STORE') {
    const SR = require('../store-runs');
    const hasRunFlow = !!(SR.runShipmentOf(order, 1) || SR.runShipmentOf(order, 2))
      || db.payments.some((pay) => pay.orderId === order.id && (pay.deliveryRun || null) !== null);
    if (hasRunFlow) fail(409, 'فاکتور سفارش فروشگاه برای هر سرویس جداگانه صادر می‌شود؛ تسویهٔ یکجای همهٔ اقلام ممکن نیست. تحویل هر سرویس را جداگانه نهایی کنید.');
  }
  if (order.status !== 'SETTLEMENT_PENDING') fail(409, 'این سفارش هنوز آماده تسویه نیست.');
  if (order.dispatch) fail(409, 'این سفارش به پخش واگذار شده است؛ تسویهٔ آن در فرم تحویل راننده ثبت می‌شود.');
  const b = ctx.body;
  const signatureData = CUSTOMER_CONTACT_ONLY ? '' : validate.signature(b.signatureData);
  const fingerprintRef = CUSTOMER_CONTACT_ONLY ? '' : validate.text(b.fingerprintRef, { field: 'شناسه اثرانگشت', max: 250 });
  const noFingerprintAllowed = CUSTOMER_CONTACT_ONLY ? false : !!b.noFingerprintAllowed;
  if (!CUSTOMER_CONTACT_ONLY && !fingerprintRef && !noFingerprintAllowed) fail(400, 'احراز اثرانگشت الزامی است مگر اینکه گزینه «بدون اثر انگشت مجاز است» فعال باشد.');
  const identity = customerIdentity(db, order);

  // اعتبارسنجی کامل قبل از هر تغییر (اتمیک)
  const active = db.orderItems.filter((i) => i.orderId === order.id && ACTIVE(i));
  const incoming = new Map((Array.isArray(b.items) ? b.items : []).map((x) => [String(x?.itemId), x]));
  const plan = [];
  // قلم «ناموجود» انبار در فاکتور نمی‌آید، پس قیمت هم از فروش خواسته نمی‌شود و
  // وضعیت انبار آن (OUT_OF_STOCK) دست‌نخورده می‌ماند.
  const OOS = (i) => i.warehouseStatus === 'OUT_OF_STOCK' || i.itemStatus === 'OUT_OF_STOCK' || Number(i.deliveredKg || 0) <= 0;
  for (const item of db.orderItems.filter((i) => i.orderId === order.id)) {
    const x = incoming.get(item.id);
    if (!ACTIVE(item)) { plan.push({ item, cancelled: true }); continue; }
    if (OOS(item)) { plan.push({ item, outOfStock: true }); continue; }
    if (!x) fail(400, 'قیمت همه اقلام سفارش باید ثبت شود.');
    if (x.cancelled) { plan.push({ item, cancelled: true }); continue; }
    const unitPrice = validate.number(x.unitPrice, { field: 'قیمت واحد', min: 0, max: validate.MAX_MONEY });
    const delivered = Number(item.deliveredKg || 0);
    if (delivered > 0 && unitPrice <= 0) fail(400, `قیمت واحد قلم «${getProduct(item.productId)?.name || ''}» باید بیشتر از صفر باشد.`);
    plan.push({ item, unitPrice, amount: Math.round(delivered * unitPrice) });
  }
  const subtotal = plan.reduce((s, p) => s + (p.amount || 0), 0);
  const amounts = validate.settlementAmounts(subtotal,b);
  const total = amounts.totalAmount;
  if (total <= 0) fail(400, 'مبلغ فاکتور صفر است؛ حداقل یک قلم تحویلی با قیمت لازم است.');
  // سازگاری با کلاینت‌های نسخهٔ قبلی؛ رابط جدید همیشه آرایهٔ روش‌ها را ارسال می‌کند.
  const deposit = order.deposit?.status === 'RECEIVED' ? order.deposit : null;
  const depositAmount = deposit ? Number(deposit.amount) - Number(deposit.refundedAmount || 0) : 0;
  if (depositAmount > total) fail(400, 'بیعانه از مبلغ نهایی بیشتر است؛ ابتدا اضافه‌پرداخت را به‌صورت دستی تعیین تکلیف کنید.');
  const amountDue = total - depositAmount;
  if (deposit && !Array.isArray(b.settlementMethods)) fail(400, 'روش‌های دریافت مانده با در نظر گرفتن بیعانه باید مشخص شود.');
  const settlementMethods = Array.isArray(b.settlementMethods) ? require('../settlement-methods').cleanRows(b.settlementMethods, amountDue, db) : [{ type: 'CASH', amount: total, note: 'ثبت از کلاینت قدیمی' }];
  if (total > validate.MAX_MONEY) fail(400, 'مبلغ فاکتور بیش از حد مجاز است.');
  const debtAccount = require('../customer-debts').newAccount(db, order, settlementMethods);

  for (const p of plan) {
    if (p.cancelled) Object.assign(p.item, { itemStatus: 'CANCELLED', finalAmount: 0, unitPrice: 0 });
    else if (p.outOfStock) Object.assign(p.item, { unitPrice: 0, finalAmount: 0, deliveredKg: 0 });
    else Object.assign(p.item, { unitPrice: p.unitPrice, finalAmount: p.amount });
  }
  const verificationMode = CUSTOMER_CONTACT_ONLY ? 'CUSTOMER_CONTACT' : (fingerprintRef ? 'FINGERPRINT' : 'MANUAL_NO_FINGERPRINT');
  const invoiceNumber = store.nextInvoiceNumber();
  const payment = {
    id: store.uid(), orderId: order.id, customerId: order.customerId || null, invoiceNumber, ...amounts, grossAmount: total, totalAmount: total,
    deposit: deposit ? { ...deposit } : null, depositAmount, amountDue,
    ...(debtAccount ? {debtAccount} : {}),
    ...identity, signatureData, fingerprintRef, noFingerprintAllowed, verificationMode, settlementMethods, verifiedAt: store.nowIso(), settledBy: ctx.user.id,
  };
  db.payments.push(payment);
  if (order.dispatch) require('../dispatch').applyReturnToInvoice(order);
  Object.assign(order, { status: 'SETTLED', updatedAt: store.nowIso() });
  createNotification('gate', 'SETTLEMENT_DONE', 'order', order.id, `فاکتور ${invoiceNumber} تسویه شد؛ کنترل خروج انجام شود.`);
  store.audit(ctx.user, 'FINAL_SETTLEMENT', 'order', order.id, { total, ...amounts, depositAmount, amountDue, invoiceNumber, verificationMode, noFingerprintAllowed, fingerprint: !!fingerprintRef, settlementMethods }, ctx);
  store.save();
  return { status: 200, body: { order: enrichOrder(order) } };
}));

module.exports = { warehouseDeliveredDocuments };

// ---------- خروج نگهبان ----------
route('POST', '/api/orders/:id/exit', { roles: ['gate'], idempotent: true }, (ctx) => withPickupOrderLock(ctx, () => {
  const db = store.get();
  const order = findOrder(ctx.params.id);
  if (order.dispatch) fail(409, 'این سفارش از مسیر «خروج ارسالی» پخش خارج می‌شود.');
  if (order.status !== 'SETTLED') fail(409, 'این سفارش هنوز تایید تسویه نشده است.');
  const checked = Array.isArray(ctx.body.checkedItems) ? ctx.body.checkedItems.map((x) => String(x).slice(0, 80)).slice(0, 200) : [];
  order.status = 'EXITED'; order.exitedAt = store.nowIso(); order.updatedAt = store.nowIso();
  const visit = db.visits.find((v) => v.id === order.visitId);
  if (visit) visit.status = 'EXITED';
  store.audit(ctx.user, 'FINAL_EXIT', 'order', order.id, { checkedItems: checked }, ctx);
  store.save();
  return { status: 200, body: { order: require('../gate-order-view')(enrichOrder(order)) } };
}));
