'use strict';
// قابلیت «سفارش فروشگاه»: دو سرویس ارسال در یک سفارش واحد (سند نیازمندی v37.4.0)
// تمام مسیرها فقط برای orderType === 'STORE' فعال‌اند و روند سایر سفارش‌ها را تغییر نمی‌دهند.
const { atomicRoute: route, fail } = require('../http');
const store = require('../store');
const validate = require('../validate');
const { getProduct, enrichOrder, createNotification } = require('../domain');
const SR = require('../store-runs');

function findOrder(id) {
  const order = store.get().orders.find((o) => o.id === id);
  if (!order) fail(404, 'سفارش یافت نشد.');
  return order;
}

// قفل ویژگی: فقط سفارش فروشگاه + فقط در مرحلهٔ آماده‌سازی انبار (قوانین ۱۴ و ۱۷ سند)
function guarding(order) {
  if (!SR.isStoreRunOrder(order)) fail(409, 'سرویس اول/دوم فقط برای سفارش فروشگاه فعال است.');
  if (order.status !== 'WAREHOUSE_PREPARING') fail(409, 'عملیات سرویس ارسال فقط در مرحلهٔ آماده‌سازی انبار مجاز است.');
}
function findActiveItem(db, orderId, itemId) {
  const item = db.orderItems.find((i) => i.id === itemId && i.orderId === orderId);
  if (!item || !SR.ACTIVE(item)) fail(404, 'قلم سفارش یافت نشد.');
  return item;
}
function mirrorDelivered(item) { // اشعه وزن واقعی برای گزارش‌ها و فاکتور (قانون ۳/۴ سند)
  item.deliveredKg = SR.runTotalKg(item);
}

// v37.35.0 — پایان خودکار کار انبار: وقتی همهٔ اقلام سفارش تعیین‌تکلیف شدند و دست‌کم یک
// سرویس به فروش ارسال شده است (قلم کاملِ وزن‌شده و در سرویس خودش ارسال‌شده، «تکمیل محصول»
// یا «عدم موجودی» — همان شرط itemBlocksClose)، کار انبار تمام است؛ سفارش همان لحظه از
// فهرست آماده‌سازی خارج و وارد سوابق انبار می‌شود، بدون این‌که انباردار منتظر تعیین راننده،
// تحویل و نهایی‌سازی فروش بماند و بعد جداگانه «پایان عملیات ارسال امروز» را بزند (آن دکمه
// تا پاسخ فروش عمداً 409 می‌داد و سفارشِ تمام‌شدهٔ انبار در آماده‌سازی می‌ماند).
// وضعیت سفارش دست نمی‌خورد: بسته‌شدن نهایی مثل قبل با نهایی‌سازی فروش یا «پایان عملیات» است.
function maybeAutoFinalizeWarehouse(db, order, ctx) {
  if (!SR.isStoreRunOrder(order) || order.status !== 'WAREHOUSE_PREPARING') return false;
  if (order.storeRunOps && order.storeRunOps.finalizedAt) return false;
  const active = db.orderItems.filter((i) => i.orderId === order.id && SR.ACTIVE(i));
  // No-stock orders have no shipment to send; complete them directly so
  // removing the manual day-end button does not strand them in preparation.
  if(active.length && active.every(i=>i.shortageClosed && SR.runTotalKg(i)===0) && !SR.runShipmentOf(order,1) && !SR.runShipmentOf(order,2)){
    const now=store.nowIso();
    for(const item of active)Object.assign(item,{itemStatus:'OUT_OF_STOCK',deliveredKg:0,warehouseStatus:'OUT_OF_STOCK',returnReason:item.shortageClosed.note||'عدم موجودی در انبار'});
    order.storeRunOps={...(order.storeRunOps||{}),finalizedAt:now,finalizedBy:ctx.user.id,finalizedByName:userName(db,ctx.user.id)};
    Object.assign(order,{status:'OUT_OF_STOCK',warehouseCompletedAt:now,warehouseCompletedBy:ctx.user.id,updatedAt:now});
    const label=require('../store-order-kind').isPartial(order)?'جزئی':'روزانه';
    createNotification('sales','WAREHOUSE_DONE','order',order.id,`هیچ‌یک از اقلام سفارش ${label} ${order.orderNo||'—'} موجود نبود.`);
    require('../domain').notifyStore(order,'STORE_ORDER_UPDATE',`اقلام سفارش ${label} ${order.orderNo||'—'} در انبار موجود نبود.`);
    store.audit(ctx.user,require('../store-order-kind').isPartial(order)?'STORE_PARTIAL_OUT_OF_STOCK':'STORE_ORDER_OUT_OF_STOCK','order',order.id,{itemIds:active.map(i=>i.id)},ctx);
    return true;
  }
  if (!SR.runShipmentOf(order, 1) && !SR.runShipmentOf(order, 2)) return false; // وزن‌های ثبت‌شده باید پیش از پایان کار به سرویس مربوط ارسال شوند
  if (!active.length) return false;
  active.forEach(SR.ensureArrays);
  if (active.some((i) => SR.itemBlocksClose(order, i))) return false;
  const now = store.nowIso();
  const rollup = active.map((item) => {
    const totalKg = SR.runTotalKg(item);
    if (totalKg > 0) Object.assign(item, { itemStatus: 'DELIVERED', deliveredKg: totalKg, warehouseStatus: 'DELIVERED' });
    else Object.assign(item, { itemStatus: 'OUT_OF_STOCK', deliveredKg: 0, warehouseStatus: 'OUT_OF_STOCK', returnReason: item.shortageClosed?.note || 'عدم موجودی در انبار' });
    return { itemId: item.id, productId: item.productId, runStatus: SR.itemRunStatus(item), r1Kg: SR.r1Kg(item), r2Kg: SR.r2Kg(item), totalKg, requestedQty: Number(item.requestedQty || 0) };
  });
  order.storeRunOps = { ...(order.storeRunOps || {}), finalizedAt: now, finalizedBy: ctx.user.id, finalizedByName: userName(db, ctx.user.id) };
  Object.assign(order, { warehouseCompletedAt: now, warehouseCompletedBy: ctx.user.id, updatedAt: now });
  createNotification('sales', 'WAREHOUSE_DONE', 'order', order.id, `عملیات ارسال سفارش فروشگاه ${order.orderNo || '—'} پایان یافت؛ سفارش تا نهایی‌شدن تحویل باقی سرویس‌ها باز می‌ماند.`);
  const closed=require('../store-transport').closeIfReady(db,order,now);
  store.audit(ctx.user, 'STORE_RUN_DAY_FINALIZED', 'order', order.id, { items: rollup, overall: SR.buildStoreRunView(order, active).overall, closed, auto: true }, ctx);
  return true;
}
function userName(db, id) { const u = db.users.find((x) => x.id === id); return (u && (u.fullName || u.username)) || ''; }

// ---------- ثبت وزن واقعی هر سرویس (بند ۶ سند) ----------
route('POST', '/api/orders/:id/store-run/weights', { roles: ['warehouse'], idempotent: true }, (ctx) => {
  const db = store.get();
  const order = findOrder(ctx.params.id);
  guarding(order);
  const run = Number(ctx.body.run) === 2 ? 2 : (Number(ctx.body.run) === 1 ? 1 : null);
  if (!run || !require('../store-order-kind').allowedRuns(order).includes(run)) fail(400, 'شمارهٔ محموله معتبر نیست.');
  if(order.transportWorkflow===1 && order.transportHandovers?.[String(run)]) fail(409,'پس از تحویل فیزیکی، وزن این سرویس قابل تغییر نیست.');
  const updates = Array.isArray(ctx.body.items) ? ctx.body.items : [];
  if (!updates.length || updates.length > 100) fail(400, 'فهرست اقلام نامعتبر است.');
  const sentShip = SR.runShipmentOf(order, run); // v37.33.0 — قفل فقط برای اقلامِ داخل محمولهٔ ارسال‌شده است؛
  // تا وقتی محموله نزد فروش «در انتظار تعیین راننده» (PENDING_SALES) است، وزن اقلام تازهٔ همان سرویس پذیرفته می‌شود
  // و با «ارسال» بعدی به همان محموله افزوده می‌شود. پیش‌تر هر وزنِ بعد از اولین ارسال با ۴۰۹ رد می‌شد و فقط
  // یک پیام گذرا می‌آمد، اما عدد تایپ‌شده روی برگه می‌ماند و انباردار فکر می‌کرد وزن ثبت شده است.
  if (sentShip && sentShip.status !== 'PENDING_SALES') fail(409, `اقلام سرویس ${run === 2 ? 'دوم' : 'اول'} به راننده واگذار شده است؛ ثبت وزن جدید برای این سرویس ممکن نیست.`);
  // اعتبارسنجی کامل پیش از هر تغییر (قانون ۱۸ سند)
  const seenItems = new Set();
  const plan = updates.map((x) => {
    const id = String(x?.itemId || '');
    if (seenItems.has(id)) fail(400, 'یک قلم نمی‌تواند چند بار در درخواست ثبت وزن تکرار شود.');
    seenItems.add(id);
    const item = findActiveItem(db, order.id, String(x?.itemId || ''));
    if (sentShip && (sentShip.itemIds || []).includes(item.id)) fail(409, `قلم «${getProduct(item.productId)?.name || item.productId}» قبلاً در همین سرویس به فروش ارسال شده است؛ وزن آن قفل است.`);
    if (item.shortageClosed || item.runCompleted) fail(409, `قلم «${getProduct(item.productId)?.name || item.productId}» قبلاً نهایی شده است.`);
    if (run === 2 && !item.movedToR2) fail(409, `قلم «${getProduct(item.productId)?.name || item.productId}» ابتدا باید به سرویس دوم منتقل شود.`);
    const weighing = require('../warehouse-weighing').weighingsFor(x?.weighings);
    const kg = weighing ? weighing.netKg : validate.number(x?.deliveredKg, { field: 'وزن واقعی تحویل', min: 0.001, max: validate.MAX_QTY }); // بدون هیچ سقف بر مقدار درخواستی
    return { item, kg, weighings: weighing?.rows || null, note: validate.text(x?.note, { field: 'توضیحات', max: 300 }) };
  });
  const now = store.nowIso();
  for (const p of plan) {
    SR.ensureArrays(p.item);
    const entry = { kg: p.kg, weighings:p.weighings, at: now, by: ctx.user.id, byName: userName(db, ctx.user.id), note: p.note || '' };
    (run === 1 ? p.item.runR1 : p.item.runR2).push(entry); // تاریخچهٔ وزن‌ها پاک شدنی نیست (قانون ۵ سند)
    mirrorDelivered(p.item);
    if(require('../store-order-kind').isPartial(order)) {
      p.item.runCompleted={at:now,by:ctx.user.id,byName:userName(db,ctx.user.id),totalKg:SR.runTotalKg(p.item)};
      store.audit(ctx.user,'STORE_RUN_ITEM_COMPLETED','order_item',p.item.id,{orderId:order.id,orderNo:order.orderNo,totalKg:SR.runTotalKg(p.item),auto:true},ctx);
    }
    store.audit(ctx.user, run === 1 ? 'STORE_RUN_R1_WEIGHT' : 'STORE_RUN_R2_WEIGHT', 'order_item', p.item.id,
      { orderId: order.id, orderNo: order.orderNo, kg: p.kg, weighings:p.weighings, note: p.note, itemTotal: SR.runTotalKg(p.item) }, ctx);
  }
  if (!order.warehousePreparationStartedAt) Object.assign(order, { warehousePreparationStartedAt: now, warehousePreparationStartedBy: ctx.user.id });
  order.storeRunOps = { ...(order.storeRunOps || {}), lastActivityAt: now, lastActivityBy: ctx.user.id };
  order.updatedAt = now;
  maybeAutoFinalizeWarehouse(db, order, ctx);
  store.save();
  return { status: 200, body: { order: enrichOrder(order) } };
});

// ---------- دکمهٔ «انتقال به سرویس دوم» برای هر محصول (بند ۷ سند) ----------
route('POST', '/api/orders/:id/store-run/move', { roles: ['warehouse'], idempotent: true }, (ctx) => {
  const db = store.get();
  const order = findOrder(ctx.params.id);
  guarding(order);
  if(require('../store-order-kind').isPartial(order))fail(409,'سفارش جزئی سرویس دوم ندارد.');
  const item = findActiveItem(db, order.id, String(ctx.body.itemId || ''));
  SR.ensureArrays(item);
  if (item.shortageClosed || item.runCompleted) fail(409, 'این قلم قبلاً نهایی شده است.');
  const note = validate.text(ctx.body.note, { field: 'توضیحات انتقال', max: 300 });
  if (!item.movedToR2) { // تکرار تماس = بدون تغییر (ایدempotنت)
    const now = store.nowIso();
    item.movedToR2 = { at: now, by: ctx.user.id, byName: userName(db, ctx.user.id), note: note || '' };
    order.storeRunOps = { ...(order.storeRunOps || {}), lastActivityAt: now, lastActivityBy: ctx.user.id };
    order.updatedAt = now;
    store.audit(ctx.user, 'STORE_RUN_MOVE_R2', 'order_item', item.id, { orderId: order.id, orderNo: order.orderNo, note }, ctx);
    store.save();
  }
  return { status: 200, body: { order: enrichOrder(order) } };
});

// ---------- فروش: کارت «اقلام ارسالی انبار» در بخش تحویل (v37.5.0) ----------
route('GET', '/api/sales/store-run-shipments', { roles: ['sales', 'admin'] }, () => {
  const db = store.get();
  const rows = [];
  for (const o of db.orders) {
    if (!SR.isStoreRunOrder(o) || o.transportWorkflow===1) continue; // Legacy sales assignment must not consume new transport services.
    for (const run of [1, 2]) {
      const sh = SR.runShipmentOf(o, run);
      if (!sh || sh.status !== 'PENDING_SALES') continue;
      const items = db.orderItems
        .filter((i) => i.orderId === o.id && (sh.itemIds || []).includes(i.id))
        .map((i) => {
          // v37.18.0 — کارتابل فروش فقط وزن تحویل همان سرویس را می‌بیند، نه جمع دو سرویس؛
          // برای سرویس دوم «ماندهٔ سرویس دوم» = درخواست کل منهای تحویل سرویس اول است.
          const serviceKg = run === 2 ? SR.r2Kg(i) : SR.r1Kg(i);
          const previousRunKg = run === 2 ? SR.r1Kg(i) : 0;
          const plannedRunKg = run === 2
            ? Math.max(0, Math.round((Number(i.requestedQty || 0) - previousRunKg) * 1000) / 1000)
            : Number(i.requestedQty || 0);
          return {
            itemId: i.id,
            productName: getProduct(i.productId)?.name || 'قلم',
            quickCode: getProduct(i.productId)?.quickCode || '',
            requestedQty: Number(i.requestedQty || 0), requestedUnit: i.requestedUnit || '',
            deliveredKg: serviceKg,
            serviceKg,
            previousRunKg,
            plannedRunKg,
          };
        });
      rows.push({ orderId: o.id, orderNo: o.orderNo || '—', storeName: require('../store-name').storeDisplayName(o.storeName,o.branchNo), run, sentAt: sh.sentAt, sentByName: sh.sentByName || '', items });
    }
  }
  rows.sort((a, b) => String(a.sentAt || '').localeCompare(String(b.sentAt || '')));
  return { status: 200, body: { shipments: rows } };
});

// ---------- «اقلام سرویس اول باید ارسال شوند»: ارسال دسته‌ای اقلام وزن‌شدهٔ یک سرویس به فروش (v37.5.0) ----------
route('POST', '/api/orders/:id/store-run/send-run', { roles: ['warehouse'], idempotent: true }, (ctx) => {
  const db = store.get();
  const order = findOrder(ctx.params.id);
  guarding(order);
  require('../store-order-additions').assertNoPending(order);
  const run = Number(ctx.body.run) === 2 ? 2 : (Number(ctx.body.run) === 1 ? 1 : null);
  if (!run || !require('../store-order-kind').allowedRuns(order).includes(run)) fail(400, 'شمارهٔ محموله معتبر نیست.');
  if(order.transportWorkflow===1 && order.transportHandovers?.[String(run)]) {if(ctx.body.physicalHandoverConfirmed===true)return {body:{order:enrichOrder(order)}};fail(409,'پس از تحویل فیزیکی، اقلام این سرویس قابل تغییر نیست.');}
  if(order.transportWorkflow===1&&ctx.body.physicalHandoverConfirmed===true)require('../store-send-handover').validateAssignment(order,run);
  // HTTP atomicRoute owns the transaction: shipment, document and handover commit together.
  const finish=()=>{
    require('../store-send-handover').record(db,order,run,ctx,{store,getProduct,createNotification});
    store.save();
    return {status:200,body:{order:enrichOrder(order)}};
  };
  const ops = order.storeRunOps || {};
  const key = run === 1 ? 'r1Shipment' : 'r2Shipment';
  const existing = ops[key] || null;
  if (existing && existing.status !== 'PENDING_SALES') { // محموله از فروش گذشته است — تکرار تماس = بی‌اثر (ایدempotنت)
    return finish();
  }
  if (run === 2 && !existing && !ops.r1Shipment) fail(409, 'اقلام سرویس دوم فقط پس از ارسال سرویس اول به فروش ارسال می‌شوند.');
  const items = db.orderItems.filter((i) => i.orderId === order.id && SR.ACTIVE(i));
  items.forEach(SR.ensureArrays);
  const runKg = (i) => (run === 1 ? SR.r1Kg(i) : SR.r2Kg(i));
  const sentFlag = (i) => (run === 1 ? i.sentRun1 : i.sentRun2);
  const pick = items.filter((i) => runKg(i) > 0 && !sentFlag(i));
  if(require('../store-order-kind').isPartial(order)&&items.some(i=>!i.runCompleted&&!i.shortageClosed))fail(409,'پیش از ارسال، همه اقلام را تکمیل یا عدم موجودی ثبت کنید.');
  if(pick.length && order.transportWorkflow===1 && !require('../store-order-kind').isPartial(order) && !order.transportAssignments?.[String(run)]?.driverId) fail(409,'پیش از ارسال، رانندهٔ همین سرویس را در ترابری تعیین کنید.');
  const label = run === 2 ? 'دوم' : 'اول';
  if (existing) { // v37.33.0 — ارسال تکمیلی: اقلام تازهٔ وزن‌شده به همان محمولهٔ در انتظار فروش افزوده می‌شوند
    if (!pick.length) { // تکرار تماس بدون قلم تازه = بی‌اثر (ایدempotنت)
      return finish();
    }
    const now = store.nowIso();
    const who = userName(db, ctx.user.id);
    for (const i of pick) {
      const flag = { at: now, by: ctx.user.id, byName: who };
      if (run === 1) i.sentRun1 = flag; else i.sentRun2 = flag;
    }
    existing.itemIds = [...(existing.itemIds || []), ...pick.map((i) => i.id)];
    existing.weights = { ...(existing.weights || {}), ...Object.fromEntries(pick.map((i) => [i.id, runKg(i)])) };
    existing.appendedAt = now;
    existing.appendedCount = Number(existing.appendedCount || 0) + 1;
    order.storeRunOps = { ...ops, [key]: existing, lastActivityAt: now, lastActivityBy: ctx.user.id };
    if (!order.warehousePreparationStartedAt) Object.assign(order, { warehousePreparationStartedAt: now, warehousePreparationStartedBy: ctx.user.id });
    order.updatedAt = now;
    createNotification('sales', run === 1 ? 'STORE_RUN_R1_SENT' : 'STORE_RUN_R2_SENT', 'order', order.id,
      `${pick.length} قلم تازهٔ سرویس ${label} سفارش فروشگاه ${order.orderNo || '—'} (بابل طیور) به محمولهٔ نزد فروش افزوده شد؛ برای آن‌ها نیز راننده تعیین کنید.`,{run});
    store.audit(ctx.user, run === 1 ? 'STORE_RUN_R1_SEND_APPEND' : 'STORE_RUN_R2_SEND_APPEND', 'order', order.id,
      { orderNo: order.orderNo, run, itemIds: pick.map((i) => i.id), count: pick.length }, ctx);
    maybeAutoFinalizeWarehouse(db, order, ctx);
    return finish();
  }
  if (!pick.length) fail(409, `هیچ قلم وزن‌شدهٔ ارسال‌نشده‌ای برای سرویس ${label} وجود ندارد؛ ابتدا وزن واقعی ثبت کنید.`);
  require('../warehouse-document-numbers').assignStoreWarehouseDocumentNumber(db,order,run);
  const now = store.nowIso();
  const who = userName(db, ctx.user.id);
  for (const i of pick) {
    const flag = { at: now, by: ctx.user.id, byName: who };
    if (run === 1) i.sentRun1 = flag; else i.sentRun2 = flag;
  }
  order.storeRunOps = {
    ...ops,
    [key]: { run, itemIds: pick.map((i) => i.id), weights: Object.fromEntries(pick.map((i) => [i.id, runKg(i)])), sentAt: now, sentBy: ctx.user.id, sentByName: who, status: 'PENDING_SALES' },
    lastActivityAt: now, lastActivityBy: ctx.user.id,
  };
  if (!order.warehousePreparationStartedAt) Object.assign(order, { warehousePreparationStartedAt: now, warehousePreparationStartedBy: ctx.user.id });
  order.updatedAt = now;
  createNotification('sales', run === 1 ? 'STORE_RUN_R1_SENT' : 'STORE_RUN_R2_SENT', 'order', order.id,
    ctx.body.physicalHandoverConfirmed===true?`ارسال و تحویل سرویس ${label} سفارش ${order.orderNo||'—'} به راننده ثبت شد؛ سند را بررسی کنید.`:`اقلام سرویس ${label} سفارش فروشگاه ${order.orderNo || '—'} (بابل طیور، ${pick.length} قلم) به فروش ارسال شد؛ قیمت را تأیید و راننده تعیین کنید.`,{run});
  store.audit(ctx.user, run === 1 ? 'STORE_RUN_R1_SEND' : 'STORE_RUN_R2_SEND', 'order', order.id,
    { orderNo: order.orderNo, run, itemIds: pick.map((i) => i.id), count: pick.length }, ctx);
  maybeAutoFinalizeWarehouse(db, order, ctx);
  return finish();
});

// ---------- نهایی‌کردن ارسال یک محصول به‌صورت تکمیل‌شده (بند ۹ قاعدهٔ ۲) ----------
route('POST', '/api/orders/:id/store-run/complete', { roles: ['warehouse'], idempotent: true }, (ctx) => {
  const db = store.get();
  const order = findOrder(ctx.params.id);
  guarding(order);
  const item = findActiveItem(db, order.id, String(ctx.body.itemId || ''));
  SR.ensureArrays(item);
  if (item.shortageClosed) fail(409, 'قلمی که با «عدم موجودی» بسته شده قابل تکمیل نیست.');
  if (!SR.runTotalKg(item)) fail(409, 'ابتدا باید دست‌کم یک وزن واقعی برای این قلم ثبت شود.');
  if (!item.runCompleted) {
    const now = store.nowIso();
    item.runCompleted = { at: now, by: ctx.user.id, byName: userName(db, ctx.user.id), totalKg: SR.runTotalKg(item) };
    order.storeRunOps = { ...(order.storeRunOps || {}), lastActivityAt: now, lastActivityBy: ctx.user.id };
    order.updatedAt = now;
    store.audit(ctx.user, 'STORE_RUN_ITEM_COMPLETED', 'order_item', item.id, { orderId: order.id, orderNo: order.orderNo, totalKg: SR.runTotalKg(item) }, ctx);
    maybeAutoFinalizeWarehouse(db, order, ctx);
    store.save();
  }
  return { status: 200, body: { order: enrichOrder(order) } };
});

// Void unsent weighings atomically and keep them separately for audit/history.
// A sent weight is never removed or changed.
route('POST', '/api/orders/:id/store-run/reopen-item', { roles: ['warehouse'], idempotent: true }, ctx => require('../transport-transaction')(() => {
  const db=store.get(),order=findOrder(ctx.params.id);guarding(order);
  const item=findActiveItem(db,order.id,String(ctx.body.itemId||''));
  const run=SR.completionReopenRun(order,item);
  if(!run)fail(409,'بازگشت از ابتدا ممکن نیست؛ وزن این قلم ارسال شده، سرویس قابل استفاده بسته است یا سفارش پایان یافته است.');
  const now=store.nowIso(),completed=item.runCompleted,wasFinalized=!!order.storeRunOps?.finalizedAt;
  const voided={at:now,by:ctx.user.id,byName:userName(db,ctx.user.id),runR1:JSON.parse(JSON.stringify(item.runR1||[])),runR2:JSON.parse(JSON.stringify(item.runR2||[])),completed};
  item.voidedRunWeighings=[...(item.voidedRunWeighings||[]),voided];
  item.runR1=[];item.runR2=[];item.deliveredKg=0;item.runCompleted=null;
  item.movedToR2=run===2?{at:now,by:ctx.user.id,byName:userName(db,ctx.user.id),note:'وزن‌کشی مجدد از صفر؛ سرویس اول بسته است'}:null;
  if(wasFinalized){
    item.itemStatus='PENDING';item.warehouseStatus=null;item.returnReason='';
    order.storeRunOps={...order.storeRunOps,finalizedAt:null,finalizedBy:null,finalizedByName:null};
    order.warehouseCompletedAt=null;order.warehouseCompletedBy=null;
    createNotification('sales','WAREHOUSE_REOPENED','order',order.id,`قلمی از سفارش فروشگاه ${order.orderNo||'—'} برای ادامه وزن‌کشی به انبار بازگشت.`);
    require('../domain').notifyStore(order,'STORE_ORDER_UPDATE',`آماده‌سازی سفارش ${order.orderNo||'—'} برای ادامه وزن‌کشی باز شد.`);
  }
  order.storeRunOps={...(order.storeRunOps||{}),lastActivityAt:now,lastActivityBy:ctx.user.id};order.updatedAt=now;
  store.audit(ctx.user,'STORE_RUN_ITEM_REOPENED','order_item',item.id,{orderId:order.id,orderNo:order.orderNo,run,wasFinalized,completed,voided},ctx);
  store.save();return {body:{order:enrichOrder(order),run}};
}));

// ---------- ثبت «عدم موجودی» — وضعیت مستقل از ثبت وزن (بند ۸ سند) ----------
route('POST', '/api/orders/:id/store-run/out-of-stock', { roles: ['warehouse'], idempotent: true }, (ctx) => {
  const db = store.get();
  const order = findOrder(ctx.params.id);
  guarding(order);
  require('../store-order-additions').assertNoPending(order);
  const item = findActiveItem(db, order.id, String(ctx.body.itemId || ''));
  SR.ensureArrays(item);
  if (item.runCompleted) fail(409, 'قلم تکمیل‌شده دیگر در چرخه انبار نیست.');
  const note = validate.text(ctx.body.note, { field: 'توضیح عدم موجودی', max: 300 });
  if (!item.shortageClosed) {
    const now = store.nowIso();
    item.shortageClosed = { at: now, by: ctx.user.id, byName: userName(db, ctx.user.id), note: note || '', sentKg: SR.runTotalKg(item) };
    order.storeRunOps = { ...(order.storeRunOps || {}), lastActivityAt: now, lastActivityBy: ctx.user.id };
    order.updatedAt = now;
    store.audit(ctx.user, 'STORE_RUN_OUT_OF_STOCK', 'order_item', item.id, { orderId: order.id, orderNo: order.orderNo, note, sentKg: SR.runTotalKg(item) }, ctx);
    maybeAutoFinalizeWarehouse(db, order, ctx);
    store.save();
  }
  return { status: 200, body: { order: enrichOrder(order) } };
});

// ---------- پایان عملیات ارسال روز (بند ۱۰ سند) ----------
route('POST', '/api/orders/:id/store-run/finalize-day', { roles: ['warehouse'], idempotent: true }, (ctx) => {
  const db = store.get();
  const order = findOrder(ctx.params.id);
  guarding(order);
  require('../store-order-additions').assertNoPending(order);
  if(order.transportWorkflow===1)fail(409,'پایان این سفارش باید از گردش جدید سرویس‌های فروشگاه انجام شود.');
  // v37.35.0 — کار انبار قبلاً خودکار پایان یافته (finalizedAt) و حالا همهٔ تحویل‌ها هم نزد
  // فروش نهایی‌اند: «پایان عملیات» سفارش را می‌بندد و موفق برمی‌گردد. اگر هنوز چیزی نزد فروش
  // معلق باشد از این میان‌بر رد می‌شویم تا درهای معمول پایین همان پاسخ‌های قبلی را بدهند.
  if (order.storeRunOps?.finalizedAt) {
    const act0 = db.orderItems.filter((i) => i.orderId === order.id && SR.ACTIVE(i));
    if (act0.length && SR.orderFullyClosed(order, act0)) {
      Object.assign(order, { status: 'CLOSED', updatedAt: store.nowIso() });
      store.save();
      return { status: 200, body: { order: enrichOrder(order) } };
    }
  }
  const active = db.orderItems.filter((i) => i.orderId === order.id && SR.ACTIVE(i));
  if (!active.length) fail(409, 'هیچ قلم فعالی در این سفارش وجود ندارد.');
  active.forEach(SR.ensureArrays);
  // v37.33.0 — فقط اقلامی که واقعاً جلوی بسته‌شدن را می‌گیرند «تصمیم» می‌خواهند؛ قلم کاملِ ارسال‌شده نه.
  const shipmentFlow = !!(SR.runShipmentOf(order, 1) || SR.runShipmentOf(order, 2));
  // در مسیر قدیمیِ بدون ارسال، تصمیم ثبت‌شده همچنان معتبر است.
  const unresolved = active.filter((i) => shipmentFlow ? SR.itemBlocksClose(order, i) : !(i.runCompleted || i.shortageClosed) && SR.itemBlocksClose(order, i));
  const decisions = Array.isArray(ctx.body.decisions) ? ctx.body.decisions : [];
  // قانون ۸ سند: هیچ ردیف حل‌نشده‌ای بدون تصمیم مشخص بسته نمی‌شود — اعتبارسنجی کامل پیش از تغییر
  const byId = new Map();
  for (const d of decisions) {
    const id = String(d?.itemId || '');
    if (byId.has(id)) fail(400, 'تصمیم تکراری برای یک قلم ارسال شده است.');
    byId.set(id, d);
  }
  const plan = unresolved.map((item) => {
    const d = byId.get(item.id);
    const name = getProduct(item.productId)?.name || item.productId;
    if (!d) fail(400, `قلم «${name}» هنوز تعیین‌تکلیف نشده است؛ برای آن «تکمیل‌شده» یا «عدم موجودی» انتخاب کنید.`);
    const action = d.action === 'complete' || d.action === 'out_of_stock' ? d.action : null;
    if (!action) fail(400, `تصمیم قلم «${name}» نامعتبر است.`);
    const note = validate.text(d.note, { field: 'توضیح', max: 300 });
    if (action === 'complete' && !SR.runTotalKg(item)) fail(409, `قلم «${name}» وزن واقعی ندارد و قابل تکمیل نیست؛ «عدم موجودی» را انتخاب کنید.`);
    return { item, action, note };
  });
  if (SR.runShipmentOf(order, 1) || SR.runShipmentOf(order, 2)) { // v37.5.0 — در جریان «ارسال سرویس به فروش» (پیش از هر تغییر)
    // هر قلم وزن‌شده باید در چارچوب یک «ارسال به فروش» قرار گرفته باشد (هیچ کالای ارسال‌نشده‌ای نمی‌ماند)
    const unsent = active.filter((i) => (SR.r1Kg(i) > 0 && !i.sentRun1) || (SR.r2Kg(i) > 0 && !i.sentRun2)); // هر وزن باید در چارچوب ارسالِ سرویس خودش باشد
    if (unsent.length) {
      const names = unsent.map((i) => `«${getProduct(i.productId)?.name || i.productId}»`).join('، ');
      fail(400, `این اقلام وزن شده اما هنوز با دکمهٔ «ارسال سرویس… به فروش» ارسال نشده‌اند: ${names} — ابتدا آن‌ها را به فروش ارسال کنید.`);
    }
    // پایان روز فقط وقتی که درخواست‌های ارسال را فروش پاسخ داده است (تعیین راننده/نهایی)
    for (const run of [1, 2]) {
      const sh = SR.runShipmentOf(order, run);
      if (sh && sh.status === 'PENDING_SALES') {
        fail(409, `اقلام سرویس ${run === 2 ? 'دوم' : 'اول'} نزد فروش معلق است؛ ابتدا فروش باید قیمت را تأیید کرده و راننده تعیین کند.`);
      }
    }
    // تحویل همهٔ سرویس‌ها باید نهایی فروش شده باشد (راننده تحویل ثبت کرده یا فروش نهایی کرده)
    for (const run of [1, 2]) {
      const sh = SR.runShipmentOf(order, run);
      if (sh) {
        const d = SR.runDispatchOf(order, run);
        if (!d || !SR.RUN_DISPATCH_FINAL.includes(d.status)) {
          fail(409, `تحویل سرویس ${run === 2 ? 'دوم' : 'اول'} هنوز توسط فروش نهایی نشده است.`);
        }
      }
    }
  }
  const now = store.nowIso();
  for (const p of plan) { // تصمیم‌های ارائه‌شده اعمال می‌شوند
    if (p.action === 'complete') p.item.runCompleted = { at: now, by: ctx.user.id, byName: userName(db, ctx.user.id), totalKg: SR.runTotalKg(p.item) };
    else p.item.shortageClosed = { at: now, by: ctx.user.id, byName: userName(db, ctx.user.id), note: p.note || '', sentKg: SR.runTotalKg(p.item) };
  }
  const rollup = active.map((item) => {
    const st = SR.itemRunStatus(item);
    const totalKg = SR.runTotalKg(item);
    // همسان‌سازی با چرخه اصلی سامانه: تسویه/پخش/تحویل راننده/تأیید فروشگاه — بدون هیچ تغییر در آن‌ها
    if (totalKg > 0) Object.assign(item, { itemStatus: 'DELIVERED', deliveredKg: totalKg, warehouseStatus: 'DELIVERED' });
    else Object.assign(item, { itemStatus: 'OUT_OF_STOCK', deliveredKg: 0, warehouseStatus: 'OUT_OF_STOCK', returnReason: item.shortageClosed?.note || 'عدم موجودی در انبار' });
    return { itemId: item.id, productId: item.productId, runStatus: st, r1Kg: SR.r1Kg(item), r2Kg: SR.r2Kg(item), totalKg, requestedQty: Number(item.requestedQty || 0) };
  });
  order.storeRunOps = { ...(order.storeRunOps || {}), finalizedAt: now, finalizedBy: ctx.user.id, finalizedByName: userName(db, ctx.user.id) };
  const hasShipments = !!(SR.runShipmentOf(order, 1) || SR.runShipmentOf(order, 2));
  if (hasShipments) { // v37.5.0 — چرخهٔ تسویه برای سفارش‌های دارای ارسال سرویس، «به‌ازای هر ارسال» انجام شده است
    if (SR.orderFullyClosed(order, active)) {
      Object.assign(order, { status: 'CLOSED', warehouseCompletedAt: now, warehouseCompletedBy: ctx.user.id, updatedAt: now });
      createNotification('sales', 'WAREHOUSE_DONE', 'order', order.id, `عملیات ارسال سفارش فروشگاه ${order.orderNo || '—'} پایان یافت و سفارش با نهایی‌شدن همهٔ سرویس‌ها بسته شد.`);
    } else {
      Object.assign(order, { warehouseCompletedAt: now, warehouseCompletedBy: ctx.user.id, updatedAt: now });
      createNotification('sales', 'WAREHOUSE_DONE', 'order', order.id, `عملیات ارسال سفارش فروشگاه ${order.orderNo || '—'} پایان یافت؛ سفارش تا نهایی‌شدن تحویل باقی سرویس‌ها باز می‌ماند.`);
    }
  } else { // مسیر قدیمی بدون ارسال سرویس (سازگاری): تسویهٔ معمول اداری
    Object.assign(order, { status: 'SETTLEMENT_PENDING', warehouseCompletedAt: now, warehouseCompletedBy: ctx.user.id, updatedAt: now });
    createNotification('sales', 'WAREHOUSE_DONE', 'order', order.id, `عملیات ارسال سفارش فروشگاه ${order.orderNo || '—'} پایان یافت و برای تسویه فروش ارسال شد.`);
  }
  store.audit(ctx.user, 'STORE_RUN_DAY_FINALIZED', 'order', order.id, { items: rollup, overall: SR.buildStoreRunView(order, active).overall, closed: order.status === 'CLOSED' }, ctx);
  store.save();
  return { status: 200, body: { order: enrichOrder(order) } };
});

// چاپ برگهٔ وزنی یک سرویس برای فروش و انبار، حتی پس از بسته‌شدن سفارش.
route('GET','/api/orders/:id/store-run/print/:run',{roles:['admin','sales','warehouse']},ctx=>{
  const order=findOrder(ctx.params.id),run=Number(ctx.params.run);
  if(![1,2].includes(run))fail(400,'شمارهٔ سرویس معتبر نیست.');
  const payment=store.get().payments.find(p=>p.orderId===order.id&&Number(p.deliveryRun)===run);
  if(payment&&(order.documentEdits||[]).some(edit=>edit.paymentId===payment.id&&edit.status==='PENDING_WAREHOUSE'))fail(404,'سند این سرویس برای اصلاح به انبار ارجاع شده است.');
  const document=require('../store-run-print').serviceDocument(store.get(),order,run,getProduct);
  if(!document)fail(404,'برگهٔ این سرویس هنوز ارسال یا ثبت نشده است.');
  return {body:{document}};
});

// Sales gets the same per-service handover snapshot, but no handover token or
// weighing breakdown; printing is read-only and cannot register delivery.
route('GET','/api/sales/store-documents/:id/:run',{roles:['admin','sales']},ctx=>{
  const run=Number(ctx.params.run);if(![1,2].includes(run))fail(400,'شمارهٔ سرویس معتبر نیست.');
  const order=findOrder(ctx.params.id);
  if(order.orderType!=='STORE'||!require('../store-order-kind').allowedRuns(order).includes(run))fail(404,'سند این سرویس یافت نشد.');
  const payment=store.get().payments.find(p=>p.orderId===order.id&&Number(p.deliveryRun)===run);
  if(payment&&(order.documentEdits||[]).some(edit=>edit.paymentId===payment.id&&edit.status==='PENDING_WAREHOUSE'))fail(404,'سند این سرویس برای اصلاح به انبار ارجاع شده است.');
  const doc=require('../store-run-print').warehouseServiceDocument(store.get(),order,run,getProduct);
  if(!doc)fail(404,'سند این سرویس هنوز ارسال نشده است.');
  if(!String(doc.driverName||'').trim())fail(409,doc.driverStatus==='PENDING'?'چاپ سند پس از تعیین رانندهٔ این سرویس امکان‌پذیر است.':'نام راننده در سوابق این سرویس موجود نیست؛ سند قابل چاپ نیست.');
  const {storeOrderKind,customerName,orderId,orderNo,warehouseDocumentNo,storeName,createdAt,sentAt,driverName,handedOverToDriver}=doc;
  const lines=(doc.lines||[]).map(({productName,requestedQty,requestedUnit,deliveredKg,outOfStock})=>({productName,requestedQty:requestedQty??null,requestedUnit:requestedUnit||'',deliveredKg,...(outOfStock?{outOfStock:true}:{})}));
  const requestRows=Array.isArray(doc.requestRows)?doc.requestRows.map(({productName,requestedQty,requestedUnit,source})=>({productName,requestedQty:requestedQty??null,requestedUnit:requestedUnit||'',source})):undefined;
  return {body:{document:{storeOrderKind,customerName,orderId,orderNo,warehouseDocumentNo,storeName,createdAt,sentAt,driverName,handedOverToDriver,run,lines,...(requestRows?{requestRows}:{})}}};
});

// Warehouse-only service handover documents, including pending and old shipments.
route('GET','/api/warehouse/store-documents',{roles:['admin','warehouse']},ctx=>{
  const db=store.get(),q=validate.digitsToAscii(String(ctx.query.get('q')||'')).trim().toLowerCase().slice(0,80);
  const offset=Math.max(0,Number.parseInt(ctx.query.get('offset'),10)||0),limit=50;
  const {warehouseServiceDocument}=require('../store-run-print');
  const rows=[],byOrder=new Map(),paymentsByOrder=new Map();
  for(const item of db.orderItems){if(!byOrder.has(item.orderId))byOrder.set(item.orderId,[]);byOrder.get(item.orderId).push(item);}
  for(const payment of db.payments){if(!paymentsByOrder.has(payment.orderId))paymentsByOrder.set(payment.orderId,[]);paymentsByOrder.get(payment.orderId).push(payment);}
  for(const order of db.orders){
    if(order.orderType!=='STORE')continue;
    for(const run of [1,2]){
      const payment=(paymentsByOrder.get(order.id)||[]).find(row=>Number(row.deliveryRun)===run);
      if(payment&&(order.documentEdits||[]).some(edit=>edit.paymentId===payment.id&&edit.status==='PENDING_WAREHOUSE'))continue;
      const doc=warehouseServiceDocument({orderItems:byOrder.get(order.id)||[],payments:paymentsByOrder.get(order.id)||[],customers:db.customers},order,run,getProduct);if(!doc)continue;
      if(q&&![doc.warehouseDocumentNo,doc.orderNo,doc.storeName,doc.driverName,...doc.lines.map(x=>x.productName)].some(v=>String(v||'').toLowerCase().includes(q)))continue;
      const {lines,...summary}=doc;rows.push({...summary,itemCount:lines.length});
    }
  }
  rows.sort((a,b)=>String(b.sentAt||'').localeCompare(String(a.sentAt||''))||String(a.orderId).localeCompare(String(b.orderId))||a.run-b.run);
  return {body:{documents:rows.slice(offset,offset+limit),total:rows.length,offset,limit}};
});
route('GET','/api/warehouse/store-documents/:id/:run',{roles:['admin','warehouse']},ctx=>{
  const run=Number(ctx.params.run);if(![1,2].includes(run))fail(400,'شمارهٔ سرویس معتبر نیست.');
  const order=findOrder(ctx.params.id);
  const payment=store.get().payments.find(row=>row.orderId===order.id&&Number(row.deliveryRun)===run);
  if(payment&&(order.documentEdits||[]).some(edit=>edit.paymentId===payment.id&&edit.status==='PENDING_WAREHOUSE'))fail(404,'سند این سرویس برای اصلاح به انبار ارجاع شده است.');
  const doc=require('../store-run-print').warehouseServiceDocument(store.get(),order,run,getProduct);
  if(!doc)fail(404,'سند این سرویس یافت نشد.');
  if(!doc.driverName)fail(409,doc.driverStatus==='PENDING'?'چاپ سند پس از تعیین رانندهٔ این سرویس امکان‌پذیر است.':'نام راننده در سوابق این سرویس موجود نیست؛ سند قابل چاپ نیست.');
  const token=order.transportWorkflow===1&&!order.transportHandovers?.[String(run)]?require('../transport-planning').handoverToken(order,run,doc):null;
  return {body:{document:token?{...doc,handoverToken:token}:doc}};
});
