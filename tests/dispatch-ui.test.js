'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'public');
const ui = fs.readFileSync(path.join(root, 'ui2.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const dispatch = fs.readFileSync(path.join(root, 'dispatch-ui.js'), 'utf8');
const dispatchServer = fs.readFileSync(path.join(__dirname, '..', 'lib', 'dispatch.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'design.css'), 'utf8');
const mobileCss = fs.readFileSync(path.join(root, 'mobile.css'), 'utf8');
const compatibilityCss = fs.readFileSync(path.join(root, 'compatibility.css'), 'utf8');
const adminUi = fs.readFileSync(path.join(root, 'admin-ui.js'), 'utf8');
const core = fs.readFileSync(path.join(__dirname, '..', 'lib', 'routes', 'core.js'), 'utf8');

test('خروج‌های منتظر تأیید در تب اصلی نگهبانی دیده می‌شوند و فقط پیش از حرکت به نگهبان ارجاع دارند', () => {
  assert.match(app,/gate:\[\['entry','ورود','entry',null\],\['waiting','در انتظار','bell','gateEntry'\],\['exit','خروج','exitDoor','gateExit'\],\['dispatch','پخش','truck','gateDispatchPending'\],\['history','سوابق','history',null\],\['reports','گزارش','reports',null\]\]/);
  const guard=ui.slice(ui.indexOf('function gateDispatchFocusMarkup'),ui.indexOf('async function renderGate(tab)'));assert(guard.includes('در انتظار تأیید خروج'));assert(!guard.includes('در انتظار ثبت خروج راننده'));assert(!guard.includes('در حال ارسال به مشتری'));
  assert.match(ui, /try\{dispatchData=await api\('\/api\/gate\/dispatch'\);?\}/);
  const gateStart=ui.indexOf('async function renderGate(tab){'),gateEnd=ui.indexOf('\nfunction renderGateEntry',gateStart);
  const gateRenderer=ui.slice(gateStart,gateEnd);
  assert.doesNotMatch(gateRenderer,/gateHomeDispatchMarkup\(dispatchData\)/);
  assert.match(gateRenderer,/gateDispatchTabsHtml\(dispatchData,app\.gateDispatchTab,dispatchError\)/);
  assert.match(ui,/role="tablist" aria-label="مراحل پخش"/);
  assert.match(ui, /data-ui-build="37\.3\.18"/);
  assert.match(dispatch, /function startGateDispatchLive\(\)/);
  assert.match(dispatch, /home\.innerHTML = gateHomeDispatchMarkup\(data\)/);
  assert.match(dispatch, /data\.leaving\s*\|\|\s*\[\]/);
  assert.doesNotMatch(dispatch.slice(dispatch.indexOf('function gateHomeDispatchMarkup'), dispatch.indexOf('function gateDispatchMarkup')), /returning|data-gate="close"/);
});

test('فهرست پخش نگهبانی ستون‌های مستقل دارد و کنترل‌های ردیف را حفظ می‌کند', () => {
  const start=ui.indexOf('function gateDispatchTableRow('),end=ui.indexOf('\nfunction gateDispatchFocusMarkup',start);
  assert.ok(start>=0&&end>start);
  const table=ui.slice(start,end);
  for(const label of ['مشتری / فروشگاه','شماره سفارش','تاریخ ثبت','نوع سفارش','سرویس','راننده','پلاک','وضعیت','اقلام','عملیات'])assert(table.includes(label),`missing gate table column: ${label}`);
  for(const action of ['details','store-details','transport-exit','store-exit','exit'])assert(table.includes('data-gate=')&&table.includes(action),`missing ${action} action`);
  assert.match(table,/data-order=/);assert.match(table,/esc\(o\.id\)/);
  assert.match(compatibilityCss,/\.gate-dispatch-table>tbody>\.gate-dispatch-table-row\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(compatibilityCss,/gate-dispatch-table-row>td::before[\s\S]*?content:attr\(data-label\)/);
  assert.doesNotMatch(compatibilityCss,/gate-dispatch-table-wrap[^}]*overflow-x:auto/);
});

test('با جابه‌جایی نگهبانی به فروش، رندر async قدیمی فرم نگهبانی را دوباره نمایش نمی‌دهد', async () => {
  assert.match(app, /pageContent=\$\('#content'\); if\(pageContent\)pageContent\.replaceChildren\(\)/);
  const start=ui.indexOf('async function renderGate(tab){');
  const end=ui.indexOf('\nfunction renderGateEntry',start);
  assert.ok(start>=0&&end>start);
  const gateRenderer=ui.slice(start,end);
  assert.match(gateRenderer,/app\.gateRenderSeq/);
  assert.match(gateRenderer,/app\.page!=='gate'\|\|app\.sub\.gate!==tab\|\|app\.gateRenderSeq!==renderSeq/);
  let releaseVisits;
  const content={innerHTML:'sales screen stays visible',onclick:null};
  const context={
    app:{page:'gate',sub:{}},
    clearInterval(){},
    $(){return content;},
    api(path){
      if(path==='/api/visits')return new Promise(resolve=>{releaseVisits=resolve;});
      return Promise.resolve({awaitingDriver:[],leaving:[],inTransit:[]});
    },
  };
  vm.createContext(context);
  const pending=vm.runInContext(`${gateRenderer}\nrenderGate('entry')`,context);
  context.app.page='sales';
  releaseVisits({visits:[]});
  await pending;
  assert.equal(content.innerHTML,'sales screen stays visible');
});

test('صف نگهبانی هنگام نوشتن در فرم به‌روز می‌شود، بدون پاک‌کردن ورودی‌ها', () => {
  const start = dispatch.indexOf('function startGateDispatchLive()');
  const end = dispatch.indexOf('\nfunction paintGateDispatch(data)', start);
  assert.ok(start >= 0 && end > start);
  const live = dispatch.slice(start, end);
  assert.match(live, /setInterval\(async\s*\(\)\s*=>/);
  assert.doesNotMatch(live, /dspBusy\(/);
  assert.match(live, /updateGateDispatchInCartable\(dispatch\)/);
});

test('اعلان خروج راننده به نگهبانی و اعلان تحویل راننده به تب تأیید فروش هدایت می‌شوند', () => {
  assert.match(app, /DISPATCH_DRIVER_EXIT_PENDING:\{page:'gate',sub:'dispatch'\}/);
  assert.match(app, /DISPATCH_DRIVER_ASSIGNED:\{page:'gate',sub:'dispatch'\}/);
  assert.match(app, /DISPATCH_DELIVERY_PENDING_SALES:\{page:'sales',sub:'delivery'\}/);
});

test('تحویل ثبت‌شده برای تأیید نهایی به صف فروش می‌رود، نه صف نگهبانی', () => {
  assert.match(app, /const SALES_TABS_V29 = \['onsite','remote','stores','flow','settlement','delivery','future'\]/);
  assert.match(app, /api\('\/api\/sales\/dispatch-deliveries'\)/);
  assert.match(ui, /function renderSalesDeliveryV38/);
  assert.match(ui, /data-action="sales-finalize-driver-delivery"/);
  assert.match(dispatch, /تحویل ثبت شد و برای بازبینی و تأیید نهایی به واحد فروش ارسال شد/);
});

test('کارت خروج قبل از حرکت دارای دکمهٔ تأیید نگهبانی است', () => {
  const start = dispatch.indexOf('function gateDispatchCard(');
  const end = dispatch.indexOf('\nfunction gateDispatchMarkup(data)', start);
  assert.ok(start >= 0 && end > start, 'helperهای نمایش کارت وجود داشته باشند');
  const helpers = dispatch.slice(start, end);
  const context = {
    esc: (v) => String(v ?? ''), fa: (v) => String(v), icon: () => '<svg></svg>',
    formatDateTime24: () => '08:33', dspCustomer: (o) => o.customer?.name || '—',
    dspBadge: (status) => `<b>${status}</b>`, qty: String, dspScopedItems: o=>o.items||[],
    dspItems: (o) => (o.items || []).map((i) => `<li>${i.product?.name || '—'}</li>`).join(''),
    dspEvents: () => '<li>event</li>', formatDispatchVehiclePlate: (v) => v || '—',
    plateViewHtml: (v,f,c) => `<div class="iran-plate is-compact"><div class="plate-part"><span>${String(v||f||'')}</span></div></div>`, plateMarkup: (v)=>`<div class="iran-plate"><span>${v}</span></div>`,
    data: { leaving: [{ id: 'order-id', orderNo: 'SO-TEST-0002', customer: { name: 'مشتری آزمایشی' }, dispatch: { status: 'DRIVER_EXIT_REPORTED', driverName: 'راننده آزمایشی', driverPlate: 'AA-1', driverExitAt: '2026-10-11T08:33:00.000Z', events: [] }, items: [{ product: { name: 'محصول آزمایشی' }, deliveredKg: 25 }] }] },
  };
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('function orderSummaryRow('),app.indexOf('\nconst app =')), context);
  vm.runInContext(`${helpers}\nresult=gateHomeDispatchMarkup(data)`, context);
  assert.match(context.result, /SO-TEST-0002/);
  assert.match(context.result, /DRIVER_EXIT_REPORTED/);
  assert.match(context.result, /data-gate="exit"/);
  assert.match(context.result, /تأیید خروج راننده/);
  assert.doesNotMatch(context.result, /data-gate="close"/);
});

test('کارت تحویل در فروش اقلام و دکمهٔ ثبت نهایی را بدون نمایش امضا نشان می‌دهد', () => {
  const start = ui.indexOf('function renderSalesDeliveryCardV38(');
  const end = ui.indexOf('\nfunction renderSalesDeliveryV38', start);
  assert.ok(start >= 0 && end > start, 'renderer کارت فروش وجود داشته باشد');
  const context = {
    esc: (v) => String(v ?? ''), storeAwareOrderName:(o)=>o?.orderType==='STORE'?(o.storeName||'فروشگاه'):(o?.customer?.name||o?.storeName||'—'), storeAwareOrderPhone:(o)=>o?.orderType==='STORE'?'':(o?.customer?.phone||'—'), fa: (v) => String(v), qty: (v) => String(v ?? 0), money: (v) => String(v ?? 0),
    formatDateTime24: () => '۱۰:۰۰', formatDispatchVehiclePlate: (v) => v || '—',
    plateViewHtml: (v,f,c) => `<div class="iran-plate is-compact"><div class="plate-part"><span>${String(v||f||'')}</span></div></div>`, icon: () => '<svg></svg>',
    o: { id: 'order-id', orderNo: 'SO-TEST-0002', customer: { name: 'مشتری آزمایشی', phone: '000' }, payment: { returnDeduction: 123, totalAmount: 456 }, dispatch: { status: 'DELIVERED', driverName: 'راننده آزمایشی', driverPlate: 'AA-1', deliveredAt: '2026-10-11T10:00:00.000Z', settlementType: 'CASH', hasSignature: true, lines: [{ productName: 'محصول آزمایشی', deliveredKg: 50, returnKg: 5, shortageKg: 1, netKg: 44, reason: 'آسیب' }] } },
  };
  vm.createContext(context);
  vm.runInContext(`${ui.slice(start, end)}\nresult=renderSalesDeliveryCardV38(o)`, context);
  assert.match(context.result, /راننده آزمایشی/);
  assert.match(context.result, /محصول آزمایشی/);
  assert.match(context.result, /مرجوع/);
  assert.doesNotMatch(context.result, /مشاهدهٔ امضای مشتری/);
  assert.match(context.result, /data-action="sales-finalize-driver-delivery"/);
  vm.runInContext('finalResult=renderSalesDeliveryCardV38(o,true)', context);
  assert.doesNotMatch(context.finalResult, /data-action="sales-finalize-driver-delivery"/);
});

test('سرصفحه به دو بخش مرتب شده و پروفایل و خروج در سمت چپ گروه ابزارها قرار می‌گیرند', () => {
  assert.match(css, /\.workspace-header\{[\s\S]*?display:grid!important;grid-template-columns:minmax\(0,1fr\) max-content/);
  assert.match(css, /\.header-profile\{order:0;direction:rtl/);
  assert.match(css, /\.header-actions\{[\s\S]*?direction:ltr/);
  assert.match(css, /\.header-actions \.header-status\{order:1/);
});

test('سفارش فروشگاه فقط در تب فروشگاه‌ها و روزهای آتی غیرحضوری فقط برای REMOTE است', () => {
  assert.match(ui, /function remotePhoneQueueRowsV40\(orders\)[\s\S]*?filter\(o=>o&&o\.orderType==='REMOTE'/);
  assert.match(ui, /function renderSalesStoresV41\(orders,deliveries=\{\}\)[\s\S]*?filter\(o=>o&&o\.orderType==='STORE'/);
  assert.match(ui, /renderStoreRunShipmentsPanel/);
  assert.match(app, /function salesFutureOrders\(orders\)\{[\s\S]*?o\.orderType==='REMOTE'&&o\.status==='SCHEDULED_REMOTE'/);
  assert.match(core, /const futureScheduled = count\(\(o\) => o\.orderType === 'REMOTE' && o\.status === 'SCHEDULED_REMOTE' && String\(o\.scheduledDate\|\|''\) >= today\(\)\)/);
  assert.match(core, /const storeScheduled = count\(\(o\) => o\.orderType === 'STORE' && o\.status === 'SCHEDULED_REMOTE'\)/);
  assert.match(css, /\.sd-sales-tabs\{grid-template-columns:repeat\(7,minmax\(0,1fr\)\)\}/);
});

test('پیش از پخش، قیمت فروش الزامی است و محاسبهٔ تحویل، مرجوعی را کسر اما کسری را بی‌اثر می‌کند', () => {
  assert.match(app, /function stlValidateDispatch\(\)/);
  assert.match(app, /قیمت هر کیلو را برای همهٔ اقلام تحویلی وارد کنید/);
  assert.match(dispatchServer, /if \(!d\?\.priceApprovedAt\) fail\(409/);
  assert.match(dispatchServer, /if \(!order\.dispatch\.priceApprovedAt\) fail\(409/);
  assert.match(dispatchServer, /const grossAmount = Math\.round\(delivered \* unitPrice\)/);
  assert.match(dispatchServer, /const returnAmount = Math\.round\(returnKg \* unitPrice\)/);
  assert.match(dispatchServer, /amountDue: Math\.max\(0, grossAmount - returnAmount\)/);
  assert.match(dispatchServer, /dispatch\.returnDeduction = deduction/);
  assert.match(dispatchServer, /مبلغ را تغییر نمی‌دهد/);

  const start = dispatch.indexOf('function dspKg(v)');
  const end = dispatch.indexOf('\nfunction dspParseAmount', start);
  const context = {
    esc: (v) => String(v ?? ''), storeAwareOrderName:(o)=>o?.orderType==='STORE'?(o.storeName||'فروشگاه'):(o?.customer?.name||o?.storeName||'—'), storeAwareOrderPhone:(o)=>o?.orderType==='STORE'?'':(o?.customer?.phone||'—'), fa: (v) => String(v), qty: (v) => String(v ?? 0), money: (v) => `M${v}`,
    o: { dispatch: { priceApprovedAt: '2026-10-12', approvedTotalAmount: 62500, amountDue: 52500, returnDeduction: 10000 }, items: [{ product: { name: 'قلم آزمون' }, deliveredKg: 25, unitPrice: 2500, finalAmount: 62500 }] },
  };
  vm.createContext(context);
  vm.runInContext(`${dispatch.slice(start, end)}\nresult=dspInvoiceMarkup(o)`, context);
  assert.match(context.result, /25 کیلو/);
  assert.match(context.result, /M2500 \/ کیلو/);
  assert.match(context.result, /M62500/);
  assert.match(context.result, /M52500/);
});

test('کارتابل پخش کارت راننده، مشخصات وسیله و گزارش آخرین سفارش را رندر می‌کند', () => {
  const start = dispatch.indexOf('function dspRosterMarkup(');
  const end = dispatch.indexOf('\n/* ---------- کارتابل واحد پخش ---------- */', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    esc: (v) => String(v ?? ''), fa: (v) => String(v ?? ''), formatDateTime24: () => '۱۰:۲۰',
    formatDispatchVehiclePlate: (v) => v === '۱۲ب۳۴۵۶۷' ? '۱۲ ب ۳۴۵ - ۶۷' : (v || '—'),
    plateViewHtml: (v,f,c) => `<div class="iran-plate is-compact"><div class="plate-part"><span>${String(v||f||'')}</span></div></div>`, plateMarkup: (v)=>`<div class="iran-plate"><span>${v}</span></div>`,
    dspBadge: (status) => `<b>${status}</b>`, qty: String, dspScopedItems: o=>o.items||[],
    drivers: [{ id: 'd1', fullName: 'راننده آزمون', vehicleType: 'وانت', plate: '۱۲ب۳۴۵۶۷', activeOrderCount: 1, waitingGateCount: 1, inTransitCount: 0, deliveredTodayCount: 0, liveOrders: [{ customerName: 'مشتری آزمون', orderNo: 'SO-42', status: 'DRIVER_EXIT_REPORTED', updatedAt: '2026-10-12T10:20:00Z' }] }],
  };
  vm.createContext(context);
  vm.runInContext(`${dispatch.slice(start, end)}\nresult=dspRosterMarkup(drivers)`, context);
  assert.match(context.result, /راننده آزمون/);
  assert.match(context.result, /وانت/);
  assert.match(context.result, /iran-plate/);
  assert.match(context.result, /مشتری آزمون/);
  assert.match(context.result, /SO-42/);
  assert.match(css, /\.dsp-roster-grid\{display:grid/);
});

test('نام و شماره تماس در فرم‌های غیرحضوری و روزهای آتی تک‌قاب و هم‌اندازه‌اند', () => {
  assert.match(ui, /sales-remote-customer-grid-v40/);
  assert.match(ui, /future-contact-grid-v40/);
  assert.match(ui, /future-note-v40/);
  const contactFields = ui.match(/class="field(?: future-contact-field-v40)? contact-field-v41"/g) || [];
  assert.equal(contactFields.length, 4, 'نام و تلفن هر دو فرم باید از پوستهٔ یکسان استفاده کنند');
  assert.match(css, /#content \.contact-field-v41 \.input-shell\{[^}]*height:48px;min-height:48px;[^}]*border:1px solid/);
  assert.match(css, /#content \.contact-field-v41 \.input-shell input\{[^}]*border:0!important/);
  assert.match(css, /\.sales-remote-customer-grid-v40\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.fx-grid-2\{display:grid;grid-template-columns:1fr 1fr/);
});

test('دکمهٔ افزودن ردیف دقیقاً پس از ردیف‌های فرم غیرحضوری قرار دارد', () => {
  assert.match(ui,/id="phone-lines" class="op-lines"><\/div>\s*<div class="sales-lines-add-v41"><button[^>]*data-action="phone-add-line"/);
  assert.match(css,/\.sales-lines-add-v41\{display:flex;justify-content:flex-start/);
});

test('توضیحات ردیف در فرم غیرحضوری تک‌خطی و عمودی هم‌تراز است و بریده نمی‌شود', () => {
  assert.match(ui,/data-label="توضیحات"><div class="sd-line-cell cell-desc"><div class="input-shell"><input type="text"/);
  assert.match(ui,/data-op-desc/);
  assert.doesNotMatch(ui,/cell-desc\"><label>توضیحات ردیف<\/label><div class="input-shell"><textarea data-op-desc=/);
  // v37.2.15 — بدون بریدگی: shell flex-center و overflow-visible، input ارتفاع auto با line-height کافی
  assert.match(css,/\.sd-line \.cell-desc>\.input-shell\{[^}]*display:flex[^}]*align-items:center[^}]*overflow:visible/);
  assert.match(css,/\.sd-line \.cell-desc>\.input-shell\{[^}]*height:42px/);
  assert.match(css,/\.sd-line \.cell-desc input\{[^}]*height:auto[^}]*line-height:1\.6/);
  assert.match(mobileCss,/#content \.sd-line \.cell-desc > \.input-shell \{[^}]*height: 46px !important[^}]*display:flex !important[^}]*overflow:visible !important/);
  assert.match(mobileCss,/#content \.sd-line \.cell-desc input \{[^}]*height:auto !important[^}]*font-size: 16px !important[^}]*line-height:1\.5 !important/);
});

test('پلاک خودروی راننده در تمام کارتابل‌های پخش با قالب ثبت پلاک نگهبانی نمایش داده می‌شود', () => {
  const start=app.indexOf('function plateDigits('), end=app.indexOf('function plateMarkup(',start);
  assert.ok(start>=0&&end>start);
  const context={en:(v='')=>String(v).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))),fa:(v='')=>String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d])};
  vm.createContext(context);
  vm.runInContext(`${app.slice(start,end)}\nresult=['12ب345-67','۱۲ ب ۳۴۵ - ۶۷'].map(formatDispatchVehiclePlate)`,context);
  assert.deepEqual(Array.from(context.result),['۱۲ ب ۳۴۵ - ۶۷','۱۲ ب ۳۴۵ - ۶۷']);
  assert.match(dispatch,/plateViewHtml\(d\.plate/);
  assert.match(dispatch,/plateViewHtml\(d\.driverPlate/);
  assert.match(dispatch,/plateViewHtml\(o\.dispatch\.driverPlate/);
  assert.match(ui,/plateViewHtml\(d\.driverPlate/);
  assert.match(adminUi,/plateViewHtml\(r\.driverPlate/);
  assert.match(adminUi,/plateViewHtml\(x\.plate/);
  assert.match(adminUi,/plateEditorHtml\(x\?\.plate/);
  assert.match(adminUi,/plateEditorValue\(e\.target,\{required:true\}\)/);
  assert.match(app,/plateViewHtml\(/);
  assert.match(css,/\.iran-plate\.is-compact/);
  assert.match(css,/\.iran-plate\.is-readonly/);
  assert.match(css,/\.sd-line \.cell-desc input/);
  assert.match(css,/#bell #bellCount\{/);
});

test('کارتابل ترابری ورودی و سفارش‌های دارای راننده را در تب‌های روشن و جدا نشان می‌دهد', () => {
  const start=dispatch.indexOf('function paintDispatch(data)'),end=dispatch.indexOf('\nfunction dspDispatchCard',start);
  assert.ok(start>=0&&end>start);
  const paint=dispatch.slice(start,end);
  assert.match(paint,/\['pending', 'ورودی', 'pending'\]/);
  assert.match(paint,/\['assigned', 'تخصیص‌یافته', 'assigned'\]/);
  assert.match(paint,/\['delivered', 'تحویل‌شده', 'delivered'\]/,'تب تحویل‌های ثبت‌شده هم برای دسترسی به سوابق حفظ می‌شود');
  const route=fs.readFileSync(path.join(__dirname,'..','lib','routes','dispatch.js'),'utf8');
  assert.match(route,/if \(filter === 'pending'\) return s === 'PENDING_ASSIGN'/);
  assert.match(route,/if \(filter === 'assigned'\) return \['ASSIGNED', 'DRIVER_EXIT_REPORTED', 'IN_TRANSIT'\]\.includes\(s\)/);
});
