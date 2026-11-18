async function fetchPagedList(url,key){
 const rows=[],seen=new Set();let offset=0,total=Infinity;
 while(offset<total){
  const d=await api(url+(url.includes('?')?'&':'?')+'limit=200&offset='+offset);
  const page=Array.isArray(d[key])?d[key]:[];
  for(const row of page){if(!row?.id||!seen.has(row.id)){rows.push(row);if(row?.id)seen.add(row.id);}}
  const count=page.length;total=Number.isFinite(Number(d.total))?Number(d.total):offset+count;
  if(!count)break;
  offset+=count;
 }
 return {[key]:rows,total:rows.length};
}
async function fetchSalesCache(force=false){
  const fresh=!force && app.salesCache && app.salesCache.fetchedAt && (Date.now()-app.salesCache.fetchedAt<5000);
  if(fresh) return app.salesCache;
  if(app.salesFetchPromise){const pending=app.salesFetchPromise;await pending;if(force)return fetchSalesCache(true);return app.salesCache;}
  const revision=app.dataRevision||0;
  const historyOffset=Math.max(0,Number(app.salesDeliveryHistoryOffset)||0);
  app.salesFetchPromise=Promise.all([
    fetchPagedList('/api/orders','orders'),
    fetchPagedList('/api/visits?status=WAITING_SALES','visits'),
    (historyOffset?api('/api/sales/dispatch-deliveries?historyOffset='+historyOffset):api('/api/sales/dispatch-deliveries')).catch(()=>null),
    api('/api/sales/store-run-shipments').catch(()=>null) // v37.5.0 — «اقلام سرویس باید ارسال شوند»
  ]).then(([ordersResp,visitsResp,deliveryResp,shipResp])=>{
    const ships=shipResp?shipResp.shipments||[]:(app.salesCache?.dispatchDeliveries?.storeRunShipments||[]);
    app.salesCache={orders:ordersResp.orders||[],visits:visitsResp.visits||[],dispatchDeliveries:deliveryResp?{active:deliveryResp.active||[],assigned:deliveryResp.assigned||[],inTransit:deliveryResp.inTransit||[],pending:deliveryResp.pending||[],finalized:deliveryResp.finalized||[],finalizedTotal:deliveryResp.finalizedTotal??(deliveryResp.finalized||[]).length,finalizedOffset:deliveryResp.finalizedOffset??0,finalizedLimit:deliveryResp.finalizedLimit??30,storeRunShipments:ships,error:false}:{...(app.salesCache?.dispatchDeliveries||{}),storeRunShipments:ships,error:true},fetchedAt:Date.now()};
    if(revision!==(app.dataRevision||0))app.salesCache.fetchedAt=0;
    return app.salesCache;
  }).finally(()=>{app.salesFetchPromise=null;});
  return app.salesFetchPromise;
}





function salesFlowRowsV27(orders){
  return orders.map((o,idx)=>`<article class="v26-flow-card"><div class="v26-flow-index">${fa(String(idx+1).padStart(2,'0'))}</div><div class="v26-flow-main"><div class="v26-flow-top"><div><div class="v26-order-line-head"><span class="v26-order-code">${esc(fa(o.orderNo||'—'))}</span>${o.orderType==='ONSITE'?'<span class="v26-type onsite">حضوری</span>':salesKindBadge(o)}${o.scheduledAt?`<span class="v26-schedule-chip">${salesOrderDateTime(o)}</span>`:''}</div><h3>${esc(storeAwareOrderName(o))}</h3><p>${esc(storeAwareOrderPhone(o))} <i>•</i> ${esc(o.dispatchPlace||'محل ارسال ثبت نشده')}</p></div><div>${badge(o.status)}</div></div><div class="v26-flow-stats"><div><span>اقلام</span><strong>${qty(activeItemsOf(o).length)}</strong></div><div><span>زمان ثبت</span><strong>${formatDateTime24(o.createdAt)}</strong></div><div><span>آخرین اقدام</span><strong>${formatDateTime24(o.updatedAt||o.createdAt)}</strong></div>${o.scheduledAt?`<div><span>زمان ارسال</span><strong>${salesOrderDateTime(o)}</strong></div>`:''}</div><div class="v26-flow-products">${activeItemsOf(o).map((i,k)=>`<div class="v26-flow-product"><span class="v26-line-no">${fa(String(k+1))}</span><span class="v26-product-name">${esc(i.product?.name||'—')}</span><b>${qty(i.requestedQty)} ${esc(i.requestedUnit||'')}</b><small>${esc(i.description||'بدون توضیح')}</small></div>`).join('')||'<div class="empty">قلم فعالی ندارد.</div>'}</div><div class="v26-flow-actions"><button class="btn btn-secondary" data-action="order-details" data-id="${o.id}">${icon('eye',15)} جزئیات کامل</button>${o.status==='RETURNED_TO_SALES'?`<button class="btn btn-secondary" data-action="edit-returned-order" data-id="${o.id}">${icon('edit',15)} اصلاح سفارش</button><button class="btn btn-primary" data-action="resubmit-order" data-id="${o.id}">${icon('send',15)} ارسال مجدد</button>`:''}</div></div></article>`).join('');
}
function settlementPendingRowsV27(rows){
  return rows.map(o=>`<article class="v26-settlement-row" data-settlement-id="${o.id}" data-action="select-settlement" data-id="${o.id}" role="button" tabindex="0"><span class="v26-settlement-icon">${icon('receipt',20)}</span><span class="v26-settlement-main"><strong>${esc(storeAwareOrderName(o))}</strong><small>${esc(storeAwareOrderPhone(o))} <i>•</i> ${qty(activeItemsOf(o).length)} قلم</small></span><span class="v26-settlement-time"><small>تحویل</small>${formatDateTime24(o.updatedAt||o.createdAt)}</span><span class="badge blue">آماده تسویه</span><span class="settlement-actions-inline"><button type="button" class="btn btn-secondary btn-sm" data-action="select-settlement" data-id="${o.id}">${icon('eye',14)} تسویه</button><button type="button" class="btn btn-secondary btn-sm" data-action="settlement-reopen-prep" data-id="${o.id}">${icon('scale',14)} آماده‌سازی</button></span></article>`).join('')||salesEmptyV25('receipt','صف تسویه خالی است','بعد از تأیید تحویل در انبار، سفارش در این بخش قرار می‌گیرد.');
}
function invoiceRowsV27(rows){
 const records=rows.flatMap(o=>(o.payments?.length?o.payments:[o.payment]).filter(Boolean).map(pay=>({o,pay})));
 if(!records.length)return salesEmptyV25('receipt','فاکتور نهایی‌شده‌ای وجود ندارد','پس از تسویه، فاکتور در این فهرست قرار می‌گیرد.');
 return `<table class="settlement-invoice-table"><thead><tr>${['نام مشتری','شماره تماس','شماره سفارش','شماره فاکتور','مبلغ / نوع سند','وضعیت و تاریخ','عملیات'].map(t=>`<th scope="col">${t}</th>`).join('')}</tr></thead><tbody>${records.map(({o,pay})=>{const run=pay.deliveryRun||null;return `<tr><td data-label="نام مشتری">${esc(storeAwareOrderName(o))}</td><td data-label="شماره تماس">${esc(fa(storeAwareOrderPhone(o)))}</td><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="شماره فاکتور">${esc(fa(pay.invoiceNumber||'—'))}${run?` · سرویس ${fa(run)}`:''}</td><td data-label="مبلغ / نوع سند">${o.orderType==='STORE'?'سند وزنی — بدون مبلغ':money(pay.totalAmount||0)}</td><td data-label="وضعیت و تاریخ">${badge(o.status)}<small>${formatDateTime24(pay.verifiedAt||o.updatedAt||o.createdAt)}</small></td><td data-label="عملیات"><div class="toolbar"><button class="btn btn-secondary btn-sm" data-action="invoice" data-id="${esc(o.id)}" ${run?`data-run="${run}"`:''}>جزئیات</button><button class="btn btn-primary btn-sm" data-action="print-invoice" data-id="${esc(o.id)}" ${run?`data-run="${run}"`:''}>چاپ</button></div></td></tr>`;}).join('')}</tbody></table>`;
}

/* faster global indicator cadence — sales tab switches must never wait for the live badge refresh */
async function refreshIndicators(){
  const userId=app.user?.id; if(!userId) return;
  const seq=app.notifRequestSeq=(app.notifRequestSeq||0)+1;
  const [noti,w]=await Promise.all([api('/api/notifications').catch(()=>null),api('/api/workload').catch(()=>null)]);
  if(!app.user || app.user.id!==userId) return;
  // Workload and unread notifications have different meanings and independent failures.
  if(w && seq>(app.workloadAppliedSeq||0)){app.workloadAppliedSeq=seq;app.workload=w.counts||{};
    $$('[data-badge-key]').forEach(el=>{const n=badgeCount(el.dataset.badgeKey);el.textContent=n?qty(n):'';el.classList.toggle('hidden',n<=0)});

  }
  if(noti && seq>(app.notifAppliedSeq||0)){app.notifAppliedSeq=seq;applyNotifSnapshot(noti);}
  updateSalesDeliveryWorkCount();
  const bell=$('#bellIcon'); if(bell) bell.innerHTML=icon('bell',22);
  renderNav();
}
function updateSalesDeliveryWorkCount(){
  $$('[data-sales-count]').forEach(el=>{const n=navUnread('sales',el.dataset.salesCount);el.textContent=n?qty(n):'';el.classList.toggle('show',n>0)});
}
function navUnread(role,section){
  return (app.notifSnapshot?.notifications||[]).filter(n=>!n.isRead&&normalizeRole(n.targetRole)===role&&(!section||n.navSection===section)).length;
}

/* larger dashboard / navigation icons + restore the previous red right rail */
function renderNav(){
  const r=normalizeRole(app.user?.roleCode),page=r==='dispatch'?'drivers':r;
  // v37.10.0 — هر ورودی: [کلید، عنوان، آیکن موضوعی بخش، کلید شمارنده]؛ آیکن و شمارنده دیگر قاطی نمی‌شوند.
  const entries={
    gate:[['entry','ثبت ورود','entry',null],['waiting','در انتظار اقدام فروش','bell','gateEntry'],['exit','کنترل خروج','exitDoor','gateExit'],['dispatch','پخش','truck','gateDispatchPending'],['history','سوابق مراجعه','history',null],['reports','گزارش‌ها','reports',null]],
    sales:[['dashboard','داشبورد','dashboard',null],['onsite','حضوری','user','salesIntake'],['remote','غیرحضوری','phone','salesRemote'],['flow','درجریان','flow','salesFlow'],['stores','فروشگاه‌ها','store','store'],['settlement','تسویه','receipt','salesSettlement'],['delivery','پخش','truck',null],['future','سفارش‌های روزهای آتی','calendar','salesFuture'],['history','سوابق سفارش و فاکتور','history',null],['customers','مشتریان و معوق','users',null],['products','محصولات','package',null],['reports','گزارش‌ها','reports',null]],
    warehouse:[['dashboard','داشبورد','dashboard',null],['incoming','سفارش‌های ورودی','inbox','warehouseIncomingRegular'],['preparing','تحویل و آماده‌سازی','scale','warehousePreparingRegular'],['delivered','تحویل شده','check',null],['document-edits','درخواست‌های اصلاح سند','edit',null],['stores','فروشگاه‌ها','store','warehouseStores'],['returns','مرجوعی‌ها','receipt',null],['history','سوابق مراجعه','history',null],['reports','گزارش‌ها','reports',null]],
    dispatch:[['dashboard','داشبورد','dashboard',null],['transport-resources','رانندگان و خودروها','driver',null],['transport-fleet','خودروهای پخش','truck',null],['orders','سفارشات','route','dispatchPending'],['reports','گزارشات','reports',null]],
    store:[['dashboard','داشبورد','dashboard',null],['create','سفارشات روزانه','clipboard',null],...(app.features?.partialStoreOrders?[['partial','سفارشات جزئی','clipboard',null]]:[]),['registered','ثبت‌شده','history',null],['delivery','تحویل','truck',null],['reports','گزارشات','reports',null]],
    driver:[['dashboard','کارتابل راننده','driver','driverOpen'],['reports','گزارش‌ها','reports',null]]
  };
  if(r==='admin'){
    if(app.adminActiveRole&&entries[app.adminActiveRole]){
      const role=app.adminActiveRole,railPage=role==='dispatch'?'drivers':role;
      const list=entries[role];
      $('#railNav').innerHTML=`<button type="button" class="cartable-nav-home" data-admin-home><span class="nav-icon">${icon('arrow',18)}</span><span class="nav-label">بازگشت به کارتابل‌ها</span></button><div class="cartable-nav-title">${esc(ROLE[role]||role)}</div>`+list.map(([key,label,ico,badgeKey])=>`<button type="button" class="cartable-nav-item ${(app.sub?.[railPage]||'dashboard')===key?'active':''}" data-cartable="${key}" data-role-page="${railPage}"><span class="nav-icon">${icon(ico,19)}</span><span class="nav-label">${label}</span>${navUnread(role,key)?navBadge(navUnread(role,key)):''}</button>`).join('');return;
    }
    const items=[['dashboard','داشبورد مدیر','dashboard',0],['gate','کارتابل نگهبانی','shield',navUnread('gate')],['sales','کارتابل فروش','sales',navUnread('sales')],['warehouse','کارتابل انبار','warehouse',navUnread('warehouse')],['dispatch','کارتابل ترابری','truck',navUnread('dispatch')],['store','کارتابل فروشگاه','store',navUnread('store')],['reports','گزارش‌ها','reports',0],['customers','مشتریان','users',0],['users','کاربران','user',0],['store-branches','شعب فروشگاه','store',0],['payment-devices','دستگاه‌های پوز','pos',0],['orders-history','سوابق کامل سفارش‌ها','history',0],['activity','سوابق فعالیت','activity',0],['backups','پشتیبان‌گیری و بازیابی','settings',0],['admin','تنظیمات سیستم','settings',0]];
    $('#railNav').innerHTML='<div class="cartable-nav-title admin-root-title">مدیریت سامانه</div>'+items.map(([p,l,i,c])=>p==='gate'||p==='sales'||p==='warehouse'||p==='dispatch'||p==='store'?`<button type="button" class="cartable-nav-item" data-admin-cartable="${p}"><span class="nav-icon">${icon(i,19)}</span><span class="nav-label">${l}</span>${c?navBadge(c):''}</button>`:`<button type="button" class="cartable-nav-item ${app.page===p?'active':''}" data-page="${p}"><span class="nav-icon">${icon(i,19)}</span><span class="nav-label">${l}</span>${c?navBadge(c):''}</button>`).join('');return;
  }
  const list=entries[r]||[['dashboard','داشبورد','dashboard'],['reports','گزارش‌ها','reports']];
  const sub=app.sub?.[page]||'dashboard';
  $('#railNav').innerHTML=`<div class="cartable-nav-title">${esc(ROLE[r]||'کارتابل')}</div>`+list.map(([key,label,ico,badgeKey])=>{
    // The internal legacy dispatch tab may remain selected while another
    // cartable page is open; only the current section selects a rail item.
    const active=sub===key || (key==='delivery'&&sub==='gate-dispatch');
    const count=navUnread(r,key);
    return `<button type="button" class="cartable-nav-item ${active?'active':''}" data-cartable="${key}" data-role-page="${page}"><span class="nav-icon">${icon(ico,19)}</span><span class="nav-label">${label}</span>${count?navBadge(count):''}</button>`;
  }).join('');
}


/* ================================================================
   v29 — Sales desk rebuild: one controller, one root handler
   ---------------------------------------------------------------
   The previous releases accumulated multiple renderSales/bindSalesV25
   declarations plus a self-referencing override. That could throw a
   recursion/handler error and leave the sales desk visually present but
   non-interactive. v29 keeps one persistent shell and one event controller.
   ================================================================ */
app.salesV29 = app.salesV29 || { shellReady:false, panes:{}, bound:false, lastTab:null };

const SALES_TABS_V29 = ['onsite','remote','stores','flow','settlement','delivery','future'];
const SALES_LABELS_V29 = {
  onsite:['حضوری','مشتریان نگهبانی','gate'],
  remote:['غیرحضوری','سفارش‌های تلفنی','phone'],
  stores:['فروشگاه‌ها','تأیید و زمان‌بندی','sales'],
  flow:['در جریان','ارسال‌شده به انبار','truck'],
  settlement:['تسویه','فاکتور و خروج','receipt'],
  delivery:['پخش','پیگیری ارسال و تأیید تحویل','check'],
  future:['سفارش‌های روزهای آتی','برنامه‌ریزی ارسال','calendar']
};

function renderSalesTabsV29(tab){
  const counts=Object.fromEntries(SALES_TABS_V29.map(id=>[id,navUnread('sales',id)]));
  return `<nav class="v26-sales-tabs v30-sales-tabs" aria-label="هفت بخش کارتابل فروش">${SALES_TABS_V29.map((id,i)=>{
    const [label,sub,ico]=SALES_LABELS_V29[id],count=counts[id];
    // IMPORTANT: no data-sub here. Legacy page handlers use data-sub and may route to gate.
    return `<button type="button" class="v26-sales-tab v30-sales-tab ${tab===id?'active':''}" data-sales-tab="${id}"><span class="v26-tab-index">${fa(String(i+1).padStart(2,'0'))}</span><span class="v26-tab-icon">${icon(ico,20)}</span><span class="v26-tab-copy"><strong>${esc(label)}</strong><small>${esc(sub)}</small></span><b class="v26-tab-count ${count>0?'show':''}" data-sales-count="${id}">${count>0?qty(count):''}</b></button>`;
  }).join('')}</nav>`;
}

function salesV29PaneId(tab){return `sales-v29-pane-${tab}`;}
function salesV29Data(){return (app.salesCache && Array.isArray(app.salesCache.orders))?app.salesCache:{orders:[],visits:[],fetchedAt:0};}


function ensureSalesShellV29(){
  const content=$('#content');
  if(!content)return null;
  content.onclick=null;
  const existing=content.querySelector('.v29-sales-shell');
  // The onsite editor also uses .v29-sales-shell, but is NOT the tab workspace.
  // Reuse a shell only when all seven real panes exist; otherwise rebuild it.
  if(existing && SALES_TABS_V29.every(t=>existing.querySelector('#'+salesV29PaneId(t)))){
    app.salesV29.shellReady=true;
    app.salesV29.panes=Object.fromEntries(SALES_TABS_V29.map(t=>[t,content.querySelector('#'+salesV29PaneId(t))]));
    bindSalesRootV29();
    return existing;
  }
  app.salesV29.shellReady=false;
  // The role rail is the single sales navigator. Keep the seven panes, not a second legacy tab bar.
  content.innerHTML=`<div class="v29-sales-shell" role="region" aria-label="کارتابل فروش">${SALES_TABS_V29.map((t,i)=>`<section class="v28-sales-pane ${i===0?'active':''}" id="${salesV29PaneId(t)}" data-tab="${t}" ${i===0?'':'hidden'}></section>`).join('')}</div>`;
  app.salesV29.panes=Object.fromEntries(SALES_TABS_V29.map(t=>[t,content.querySelector('#'+salesV29PaneId(t))]));
  app.salesV29.shellReady=true;
  bindSalesRootV29();
  return content.querySelector('.v29-sales-shell');
}


/* ================================================================
   v33 — future form + warehouse two-stage workbench
   ================================================================ */
(function(){
  const V33WH=['incoming','preparing'];
  app.whV33=app.whV33||{phase:'incoming',selected:null,timer:null};

  function futureFormV33(orders){
    const future=salesFutureOrders(orders||[]);
    return `<div class="fx41-layout">
      <section class="fx41-main">
        <header class="fx41-head">
          <div><span class="fx41-eyebrow">۰۷ / سفارش‌های روزهای آتی</span><h2>ثبت سفارش برنامه‌ریزی‌شده</h2><p>مشتری و <b>تاریخ و ساعت ورود به کارتابل انبار</b> را در یک کادر واحد مشخص کنید، سپس اقلام را وارد کنید.</p></div>
          <div class="fx41-count"><b>${qty(future.length)}</b><span>برنامه فعال</span></div>
        </header>
        <form id="futureOrderFormV25" class="fx41-form">
          <div class="fx41-card">
            <div class="fx41-card-head"><span class="fx41-ico">${icon('user',17)}</span><h3>اطلاعات مشتری و ارسال</h3></div>
            <div class="fx41-card-body">
              <div class="fx41-grid-2 fx41-customer">
                <div class="field"><label>نام مشتری</label><div class="input-shell"><span>${icon('user',17)}</span><input name="name" required placeholder="نام و نام خانوادگی"></div></div>
                <div class="field"><label>شماره تماس</label><div class="input-shell"><span>${icon('phone',17)}</span><input name="phone" required inputmode="tel" placeholder="۰۹۱۲ ..."></div></div>
                ${jalaliDateTimeInput('تاریخ و ساعت ورود به کارتابل انبار','scheduledDate','scheduledTime',nextDayIso(),'08:00',true)}
                ${jalaliInput('تاریخ تحویل','deliveryDate','',true)}
              </div>
              <div class="field fx41-full"><label>محل ارسال</label><div class="input-shell"><span>${icon('truck',17)}</span><input name="dispatchPlace" required placeholder="آدرس یا محل ارسال"></div></div>
            </div>
          </div>
          <div class="fx41-card">
            <div class="fx41-card-head"><span class="fx41-ico">${icon('receipt',17)}</span><h3>اقلام سفارش</h3></div>
            <div class="fx41-card-body">
              <div class="fx41-lines-head"><span>ردیف</span><span>نام محصول</span><span>مقدار</span><span>واحد</span><span>توضیحات</span><span></span></div>
              <div id="future-lines" class="fx41-lines op-lines"></div>
              <button type="button" class="btn btn-secondary fx41-add" data-action="future-add-line">${icon('plus',16)} افزودن قلم جدید</button>
            </div>
          </div>
          <div class="fx41-card">
            <div class="fx41-card-head"><span class="fx41-ico">${icon('info',17)}</span><h3>یادداشت و توضیحات</h3></div>
            <div class="fx41-card-body">
              <textarea name="notes" maxlength="1000" rows="2" placeholder="هماهنگی، بسته‌بندی، محدودیت تحویل یا نکته مهم..."></textarea>
            </div>
          </div>
          ${depositEntryHtml()}
          <footer class="fx41-foot">
            <button type="submit" class="btn btn-primary btn-lg">${icon('send',17)} ثبت برنامه ارسال</button>
            <button type="reset" class="btn btn-secondary">${icon('refresh',16)} پاک کردن فرم</button>
          </footer>
        </form>
        <section class="fx41-card fx41-list-card"><div class="fx41-card-head"><span class="fx41-ico">${icon('calendar',17)}</span><h3>سفارش‌های ثبت‌شده</h3><span class="fx41-list-count">${qty(future.length)} مورد</span></div><div class="fx41-card-body"><div id="futureOrderListV25" class="v36-future-orders fx41-list-grid">${futureOrderRowsV25(future)}</div></div></section>
      </section>

    </div>`;
  }
  window.renderSalesFutureV25=function(orders){return futureFormV33(orders)};
  window.salesV29RenderPane=function(tab,data){
    if(tab==='onsite') return renderSalesOnsiteV25((data.visits||[]).filter(v=>v.status==='WAITING_SALES'));
    if(tab==='remote') return renderSalesRemoteV32(data.orders||[]);
    if(tab==='stores') return renderSalesStoresV41(data.orders||[], data.dispatchDeliveries||{});
    if(tab==='flow') return renderSalesFlowV25(salesFlowOrders(data.orders||[]));
    if(tab==='settlement') return renderSalesSettlementV25(salesAllInSettlement(data.orders||[]));
    if(tab==='delivery') return renderSalesDeliveryV38(data.dispatchDeliveries||{});
    if(tab==='future') return futureFormV33(data.orders||[]);
    return renderSalesOnsiteV25((data.visits||[]).filter(v=>v.status==='WAITING_SALES'));
  };
  function whTabBar(active){
    const inc=badgeCount('warehouseIncoming'), prep=badgeCount('warehousePreparing');
    return `<div class="v33-wh-tabs"><button type="button" data-wh-tab="incoming" class="${active==='incoming'?'active':''}"><span class="v33-wh-tab-index">۰۱</span><span>${icon('truck',26)}</span><div><b>سفارش‌های ورودی</b><small>بررسی و تأیید ورود به آماده‌سازی</small></div><em>${qty(inc)}</em></button><button type="button" data-wh-tab="preparing" class="${active==='preparing'?'active':''}"><span class="v33-wh-tab-index">۰۲</span><span>${icon('scale',26)}</span><div><b>آماده‌سازی و تحویل</b><small>ثبت وزن نهایی و ارسال به فروش</small></div><em>${qty(prep)}</em></button></div>`;
  }
  function whOrderList(orders,kind){
    if(!orders.length)return `<div class="v33-wh-empty"><div>${icon(kind==='incoming'?'truck':'scale',34)}</div><strong>${kind==='incoming'?'سفارش ورودی جدیدی نیست':'سفارشی در مرحله آماده‌سازی نیست'}</strong><span>${kind==='incoming'?'با ارسال سفارش از فروش، اینجا نمایش داده می‌شود.':'پس از تأیید دریافت سفارش، برای ثبت وزن نهایی اینجا قرار می‌گیرد.'}</div>`;
    return `<div class="v33-wh-order-list">${orders.map((o,i)=>`<article class="v33-wh-order-card ${app.whV33.selected===o.id?'selected':''}"><div class="v33-wh-order-no">${fa(String(i+1).padStart(2,'0'))}</div><div class="v33-wh-order-main"><div class="v33-wh-order-top"><div><span class="v33-code">${esc(fa(o.orderNo||'—'))}</span>${o.orderType==='ONSITE'?'<span class="v33-type">حضوری</span>':salesKindBadge(o)}<h3>${esc(storeAwareOrderName(o))}</h3><p>${esc(storeAwareOrderPhone(o))} <i>•</i> ${esc(o.dispatchPlace||'محل ارسال ثبت نشده')}</p></div>${badge(o.status)}</div><div class="v33-wh-order-meta"><span><b>اقلام</b>${qty(activeItemsOf(o).length)} قلم</span><span><b>ثبت</b>${formatDateTime24(o.createdAt)}</span><span><b>آخرین اقدام</b>${formatDateTime24(o.updatedAt||o.createdAt)}</div><div class="v33-wh-products">${activeItemsOf(o).map((it,k)=>`<div><span>${fa(String(k+1))}</span><strong>${esc(it.product?.name||'—')}</strong><em>${qty(it.requestedQty)} ${esc(it.requestedUnit||'')}</em></div>`).join('')}</div><div class="v33-wh-actions">${kind==='incoming'?`<button type="button" class="btn btn-primary btn-lg" data-action="warehouse-accept-v33" data-id="${o.id}">${icon('check',19)} تأیید دریافت و ورود به آماده‌سازی</button>`:`<button type="button" class="btn btn-primary btn-lg" data-action="warehouse-start-prep-v33" data-id="${o.id}">${icon('scale',19)} شروع آماده‌سازی و ثبت وزن</button>`}</div></div></article>`).join('')}</div>`;
  }
  async function whPaint(phase){const host=$('#warehousePhaseBodyV33');if(!host)return;const status=phase==='incoming'?'WAREHOUSE_PENDING':'WAREHOUSE_PREPARING';try{const orders=(await fetchPagedList('/api/orders?status='+encodeURIComponent(status),'orders')).orders||[];host.innerHTML=whOrderList(orders,phase)}catch(e){host.innerHTML='<div class="v33-wh-error">خطا در دریافت صف انبار.</div>'}}
  function whRenderShell(phase='incoming'){const c=$('#content');if(!c)return;c.onclick=null;app.whV33.phase=V33WH.includes(phase)?phase:'incoming';c.innerHTML=`<section class="v33-warehouse-shell"><div id="warehousePhaseBodyV33" class="v33-wh-phase"></div></section>`;bindWarehouseV33(c);whPaint(app.whV33.phase);if(app.whV33.timer)clearInterval(app.whV33.timer);app.whV33.timer=setInterval(()=>{if(app.page==='warehouse'&&!$('#warehousePhaseBodyV33 .v33-prep-sheet'))whPaint(app.whV33.phase)},7000)}
  function bindWarehouseV33(c){c.onclick=async e=>{const t=e.target.closest('[data-wh-tab]');if(t){e.preventDefault();app.whV33.phase=t.dataset.whTab;whRenderShell(app.whV33.phase);return}const a=e.target.closest('[data-action]');if(!a)return;if(a.dataset.action==='warehouse-accept-v33'){const notices=captureEntityNotices('order',a.dataset.id);a.disabled=true;try{const r=await api('/api/orders/'+a.dataset.id+'/warehouse/accept',{method:'POST'});finishEntityNotices(notices);app.whV33.phase='preparing';app.whV33.selected=r.order?.id||a.dataset.id;toast('سفارش تأیید شد و وارد مرحله آماده‌سازی شد.');await whRenderShell('preparing');await refreshIndicators()}catch(err){toast(err.message);a.disabled=false}return}if(a.dataset.action==='warehouse-open-prep-v33'){try{const d=await api('/api/orders/'+a.dataset.id);openWarehousePrepV33(d.order)}catch(err){toast(err.message)}return}if(a.dataset.action==='warehouse-start-prep-v33'){a.disabled=true;try{const r=await api('/api/orders/'+a.dataset.id+'/warehouse/start-preparing',{method:'POST'});toast('آماده‌سازی سفارش ثبت شد.');openWarehousePrepV33(r.order)}catch(err){toast(err.message);a.disabled=false}return}if(a.dataset.action==='warehouse-finalize-v33'){await finalizeWarehouseV33(a.dataset.id);return}if(a.dataset.action==='warehouse-return-v33'){const reason=prompt('دلیل ارجاع به فروش را وارد کنید:','اصلاح سفارش / اصلاح وزن')||'';if(!reason)return;try{await api('/api/orders/'+a.dataset.id+'/return-sales',{method:'POST',body:JSON.stringify({reason})});toast('سفارش به فروش ارجاع شد.');app.whV33.selected=null;await whPaint('preparing');await refreshIndicators()}catch(err){toast(err.message)}}}}
  function openWarehousePrepV33(o){app.whV33.selected=o.id;const body=$('#warehousePhaseBodyV33');if(!body)return;const items=activeItemsOf(o);body.innerHTML=`<section class="v33-prep-sheet"><div class="v33-prep-head"><div><span class="v33-eyebrow">02 / آماده‌سازی و تحویل</span><h2>${esc(storeAwareOrderName(o))}</h2><p>${esc(storeAwareOrderPhone(o))} <i>•</i> سفارش ${esc(fa(o.orderNo||'—'))}</p></div><div>${badge(o.status)}</div></div><div class="v33-prep-progress"><span class="done">۱ سفارش ورودی</span><i></i><span class="active">۲ آماده‌سازی</span><i></i><span>۳ ارسال به تسویه فروش</span></div><div class="v33-prep-note"><b>ثبت وزن نهایی</b><span>برای هر قلم موجود، وزن واقعی تحویلی را فقط بر حسب کیلوگرم ثبت کنید. اقلام ناموجود را با گزینه «عدم موجودی» مشخص کنید.</span>${o.warehousePreparationStartedAt?`<em class="prep-started-chip">آماده‌سازی شروع شده • ${formatDateTime24(o.warehousePreparationStartedAt)}</em>`:''}</div><div class="v33-prep-items">${items.map((it,k)=>`<article class="v33-prep-item"><div class="v33-prep-num">${fa(String(k+1))}</div><div class="v33-prep-product"><div class="v33-prep-product-title"><strong>${esc(it.product?.name||'—')}</strong></div><div class="v33-request-strip"><span>مقدار درخواستی</span><b>${qty(it.requestedQty)} ${esc(it.requestedUnit||'')}</b></div></div><div class="v33-prep-desc"><span>توضیحات ردیف</span><p>${esc(it.description||'بدون توضیح')}</p></div><div class="v33-weight"><label>وزن نهایی تحویلی</label><div><input type="text" inputmode="decimal" data-v33-weight="${it.id}" placeholder="۰٫۰۰۰"><b>کیلوگرم</b></div></div><label class="v33-oos"><input type="checkbox" data-v33-oos="${it.id}"><span><strong>عدم موجودی</strong><small>این قلم موجود نیست</small></span></label></article>`).join('')}</div><div class="v33-prep-footer"><div><span>جمع وزن نهایی</span><strong id="v33WarehouseTotal">۰ کیلوگرم</strong></div><div class="toolbar"><button type="button" class="btn btn-secondary btn-lg" data-action="warehouse-return-v33" data-id="${o.id}">${icon('arrow',17)} ارجاع به فروش</button><button type="button" class="btn btn-primary btn-lg" data-action="warehouse-finalize-v33" data-id="${o.id}">${icon('send',19)} ثبت وزن نهایی و ارسال به فروش</button></div></div></section>`;$$('#warehousePhaseBodyV33 [data-v33-weight]').forEach(el=>el.addEventListener('input',updateWhTotalV33));$$('#warehousePhaseBodyV33 [data-v33-oos]').forEach(ch=>ch.addEventListener('change',()=>{const w=$(`#warehousePhaseBodyV33 [data-v33-weight="${ch.dataset.v33Oos}"]`);if(w){w.disabled=ch.checked;if(ch.checked)w.value=''}updateWhTotalV33()}));}
  function updateWhTotalV33(){const total=$$('#warehousePhaseBodyV33 [data-v33-weight]').reduce((s,e)=>s+(e.disabled?0:n(e.value)),0);const el=$('#v33WarehouseTotal');if(el)el.textContent=qty(total)+' کیلوگرم'}
  async function finalizeWarehouseV33(id){const items=$$('#warehousePhaseBodyV33 [data-v33-weight]').map(w=>{const out=$(`#warehousePhaseBodyV33 [data-v33-oos="${w.dataset.v33Weight}"]`)?.checked||false;return {itemId:w.dataset.v33Weight,deliveredKg:out?0:n(w.value),outOfStock:out}});if(!items.length)return toast('قلمی برای ثبت وزن وجود ندارد.');if(items.some(x=>!x.outOfStock&&x.deliveredKg<=0))return toast('برای همه اقلام موجود وزن نهایی معتبر وارد کنید.');try{await api('/api/orders/'+id+'/warehouse',{method:'POST',body:JSON.stringify({items})});toast('وزن نهایی ثبت شد و سفارش برای تسویه فروش ارسال شد.');app.whV33.selected=null;app.whV33.phase='preparing';await whPaint('preparing');await refreshIndicators()}catch(e){toast(e.message)}}
  window.renderWarehouse=async function(){if(app.timer){clearInterval(app.timer);app.timer=null}app.page='warehouse';if(app.whV33.timer){clearInterval(app.whV33.timer);app.whV33.timer=null}whRenderShell(app.whV33.phase||'incoming')};
})();

function salesV29SubmitHandler(e){
  const form=e.target.closest('form');
  if(!form || !$('#content')?.contains(form))return;
  if(form.id==='phoneOrderFormV25'){ e.preventDefault(); return submitPhoneOrderV25(form); }
  if(form.id==='futureOrderFormV25'){ e.preventDefault(); return submitFutureOrderV25(form); }
}
function bindSalesRootV29(){
  const root=$('#content');
  if(!root || root.dataset.salesV29Bound==='1')return;
  root.dataset.salesV29Bound='1';
  root.addEventListener('click',salesV29ClickHandler);
  root.addEventListener('keydown',e=>{const b=e.target.closest('[data-delivery-tab]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const tabs=[...b.closest('[role=tablist]').querySelectorAll('[data-delivery-tab]')];const i=tabs.indexOf(b);const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowLeft'?1:-1)+tabs.length)%tabs.length;e.preventDefault();tabs[next].click();tabs[next].focus();});
  root.addEventListener('change',salesV29ChangeHandler);
  root.addEventListener('submit',salesV29SubmitHandler);
}

async function salesV29ClickHandler(e){
  const content=$('#content');
  if(!content || !content.contains(e.target))return;
  const deliveryTab=e.target.closest('[data-delivery-tab]');
  if(deliveryTab){
    e.preventDefault();app.salesDeliveryTab=deliveryTab.dataset.deliveryTab;
    const pane=deliveryTab.closest('.sales-delivery-pane');
    pane.querySelectorAll('[data-delivery-tab]').forEach(b=>{const active=b===deliveryTab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
    pane.querySelectorAll('[data-delivery-section]').forEach(p=>{p.hidden=p.dataset.deliverySection!==app.salesDeliveryTab;});
    return;
  }
  const storeSubtab=e.target.closest('[data-store-subtab]');
  if(storeSubtab){ e.preventDefault(); e.stopPropagation(); app.salesStoreTab=storeSubtab.dataset.storeSubtab; const storePane=storeSubtab.closest('.sales-store-pane-v43'); if(storePane){ storePane.querySelectorAll('[data-store-subtab]').forEach(b=>{const active=b===storeSubtab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));}); storePane.querySelectorAll('[data-store-section]').forEach(p=>{p.hidden=p.dataset.storeSection!==app.salesStoreTab;}); }
    // Shipments and assignments may have changed at another workstation while
    // this tab was cached. Refresh on entry without changing the selected tab.
    const selected=app.salesStoreTab;
    if(selected==='processing'||selected==='history')void fetchSalesCache(true).then(data=>{if(app.page==='sales'&&app.sub.sales==='stores'&&app.salesStoreTab===selected)paintSalesPaneV29('stores',data);}).catch(()=>{});
    return; }
  const tab=e.target.closest('[data-sales-tab]');
  if(tab){ e.preventDefault(); e.stopPropagation(); return renderSales(tab.dataset.salesTab); }
  const legacySub=e.target.closest('[data-sub^="sales:"]');
  if(legacySub){ e.preventDefault(); e.stopPropagation(); const [,v]=String(legacySub.dataset.sub||'').split(':'); return renderSales(v||'onsite'); }
  const el=e.target.closest('[data-action]');
  if(!el || !content.contains(el))return;
  const a=el.dataset.action;
  try{
    if(a==='open-order')return openOrder(el.dataset.id);
    if(a==='back-order-intake'){app.orderDraft=[];return renderSales('onsite');}
    if(a==='submit-order')return submitOrder(el.dataset.id);
    if(a==='order-details')return openOrderDetails(el.dataset.id);
    if(a==='pickup-date')return pickupChangeDate(el.dataset.id);
    if(a==='pickup-approve')return pickupApprove(el.dataset.id,el);
    if(a==='edit-returned-order')return openReturnedOrderEditor(el.dataset.id);
    if(a==='resubmit-order')return resubmitOrder(el.dataset.id);
    if(a==='transport-sales-work')return goTransportSalesWork(el.dataset.id);
    if(a==='select-settlement')return selectSettlement(el.dataset.id);
    if(a==='back-settlement')return renderSales('settlement');
    if(a==='settlement-reopen-prep')return reopenSettlementToWarehouse(el.dataset.id);
    if(a==='final-settle')return finalSettle(el.dataset.id);
    if(a==='fingerprint-capture')return fingerprintCapture();
    if(a==='clear-signature'){clearSignature();return;}
    if(a==='invoice')return previewInvoice(el.dataset.id,Number(el.dataset.run)||null);
    if(a==='print-invoice')return printInvoice(el.dataset.id,Number(el.dataset.run)||null);
    if(a==='sales-invoice-edit')return salesInvoiceEditOpen(el.dataset.id,el.dataset.paymentId);
    if(a==='sales-warehouse-edit-request')return salesWarehouseEditRequestOpen(el.dataset.id,el.dataset.paymentId);
    if(a==='print-store-service')return printStoreService(el.dataset.id,Number(el.dataset.run));
    if(a==='print-store-return')return printStoreReturns(el.dataset.id);
    if(a==='sales-store-document-print')return printSalesStoreDocument(el.dataset.id,Number(el.dataset.run));
    if(a==='sales-store-review')return salesStoreReview(el.dataset.id,Number(el.dataset.run));
    if(a==='sales-delivery-history-page')return salesDeliveryHistoryPage(el);
    if(a==='sales-delivery-details')return openSalesDeliveryDetails(el.dataset.id,Number(el.dataset.run)||0);
    if(a==='sales-finalize-driver-delivery')return salesFinalizeDeliveryV38(el.dataset.id,el);
    if(a==='sales-view-driver-signature')return salesViewDeliverySignatureV38(el.dataset.id);
    if(a==='sr-ship-open')return srSalesOpenShip(el.dataset.order,Number(el.dataset.run)||1); // v37.5.0


    if(a==='phone-add-line'){
      addPhoneOrderLine(el.closest('#phoneOrderFormV25'));
      return;
    }
    if(a==='future-add-line'){
      app.futureDraft=app.futureDraft||[defaultOrderLine()];
      app.futureDraft.push(defaultOrderLine());
      renderOrderLineArea('future','futureDraft');
      return;
    }
    if(a==='op-remove-line'){
      const draftKey=el.dataset.draftKey;
      const prefix=el.dataset.prefix;
      if(['phoneDraft','futureDraft'].includes(draftKey)){
        const idx=Number(el.dataset.index);
        if(app[draftKey]?.length>1){app[draftKey].splice(idx,1);renderOrderLineArea(prefix,draftKey);}
      }
      return;
    }
    if(a==='op-pick-product'){
      return pickOperationProduct(Number(el.dataset.index),el.dataset.productId,el.dataset.label,el.dataset.quick,el.dataset.prefix,el.dataset.draftKey);
    }
    if(a==='add-line'){
      app.orderDraft=app.orderDraft||[defaultOrderLine()];
      app.orderDraft.push(defaultOrderLine());
      renderOrderLines();
      return;
    }
    if(a==='remove-line'){
      const idx=Number(el.dataset.index);
      if((app.orderDraft||[]).length>1){app.orderDraft.splice(idx,1);renderOrderLines();updateOrderDraftSummary();}
      return;
    }
    if(a==='sales-edit-store-order')return openSalesStoreOrderEdit(el.dataset.id);
    if(a==='store-approve-v25')return openStoreApprovalV25(el.dataset.id);
    if(a==='store-quick-send-v40'){
      if(!confirm(app.features?.experimentalTransport?'سفارش فروشگاهی اکنون به انبار و ترابری ارسال شود؟ سفارش زمان‌دار تا موعد مقرر ارسال نمی‌شود.':'این سفارش فروشگاهی بدون انتظار برای زمان‌بندی، همین حالا به صف انبار ارسال شود؟'))return;
      el.disabled=true;
      try{const result=await api('/api/store/orders/'+encodeURIComponent(el.dataset.id)+'/quick-send',{method:'POST',body:JSON.stringify(app.features?.experimentalTransport?{transportWorkflow:true}:{})});toast(result.order?.status==='WAREHOUSE_PENDING'?(result.order.transportWorkflow===1?'سفارش به انبار و ترابری ارسال شد.':'سفارش با موفقیت به صف انبار ارسال شد.'):'ارسال سریع ثبت شد.');await fetchSalesCache(true);await renderSales('stores');await refreshIndicators();}
      catch(err){el.disabled=false;toast(err.message||'ارسال سریع انجام نشد.');}
      return;
    }
    if(a==='store-order-details-v25')return openOrderDetails(el.dataset.id);
    if(a==='future-edit')return editFutureV25(el.dataset.id);
    if(a==='future-cancel')return cancelFutureV25(el.dataset.id);
    if(a==='deposit-refunded')return markDepositRefunded(el.dataset.id);
  }catch(err){toast(err?.message||'عملیات انجام نشد.');console.error(err);}
}

function salesV29ChangeHandler(e){
  /* Kept intentionally lightweight. Per-line controls are bound by the line renderer. */
}

function bindSalesPaneV29(tab){
  const pane=app.salesV29.panes?.[tab];
  if(!pane || pane.dataset.boundV29==='1')return;
  pane.dataset.boundV29='1';
  if(tab==='onsite'){
    const s=pane.querySelector('#salesSearchV25');
    if(s)s.addEventListener('input',()=>{
      clearTimeout(s._salesSearchTimer);
      s._salesSearchTimer=setTimeout(()=>{
        const q=s.value.trim().toLowerCase();
        const visits=(app.salesCache?.visits||[]).filter(v=>v.status==='WAITING_SALES');
        const filtered=!q?visits:visits.filter(v=>[v.customer?.name,v.customer?.phone,v.customer?.plate].some(x=>String(x||'').toLowerCase().includes(q)));
        const list=pane.querySelector('#salesOnsiteListV25'); if(list)list.innerHTML=salesOnsiteRowsV25(filtered);
      },60);
    });
  }
  if(tab==='remote'){
    app.phoneDraft=app.phoneDraft||[defaultOrderLine()];
    renderOrderLineArea('phone','phoneDraft');
    const form=pane.querySelector('#phoneOrderFormV25');
    if(form && !form.dataset.boundV32){
      if(app.features?.pickupStaging)bindJalaliDates(form);
      bindSalesCustomerPicker(form);
      form.dataset.boundV32='1';
    }
  }
  if(tab==='future'){
    app.futureDraft=app.futureDraft||[defaultOrderLine()];
    renderOrderLineArea('future','futureDraft');
    const form=pane.querySelector('#futureOrderFormV25');
    if(form){bindJalaliDates(form);bindTime24(form);bindSalesCustomerPicker(form);}
    void refreshDepositRefunds();
  }
}

function salesV29Activate(tab){
  if(!SALES_TABS_V29.includes(tab))tab='onsite';
  const content=$('#content');
  content?.querySelectorAll('[data-sales-tab]').forEach(b=>b.classList.toggle('active',b.dataset.salesTab===tab));
  SALES_TABS_V29.forEach(t=>{
    const p=app.salesV29.panes?.[t]; if(!p)return;
    p.hidden=t!==tab; p.classList.toggle('active',t===tab);
  });
  const pane=app.salesV29.panes?.[tab];
  if(pane){
    if(pane.dataset.renderedV29!=='1'){
      pane.innerHTML=salesV29RenderPane(tab,salesV29Data());
      pane.dataset.renderedV29='1';
      bindSalesPaneV29(tab);
      if(tab==='settlement' && stl.orderId) void stlOpen(stl.orderId);
    }else if(tab==='onsite'){
      pane.querySelector('#salesSearchV25')?.focus({preventScroll:true});
    }
  }
  app.salesV29.lastTab=tab;
}

function paintSalesPaneV29(tab,data){
  const pane=app.salesV29.panes?.[tab]; if(!pane)return;
  if(pane.dataset.renderedV29!=='1'){
    pane.innerHTML=salesV29RenderPane(tab,data);
    pane.dataset.renderedV29='1';
    bindSalesPaneV29(tab);
    return;
  }
  if(tab==='onsite'){
    const list=pane.querySelector('#salesOnsiteListV25'); if(list)list.innerHTML=salesOnsiteRowsV25((data.visits||[]).filter(v=>v.status==='WAITING_SALES'));
  }else if(tab==='remote'){
    /* تلفنی/غیرحضوری فقط؛ صف فروشگاه در تب مستقل stores رندر می‌شود. */
  }else if(tab==='stores'){
    pane.innerHTML=salesV29RenderPane(tab,data);
  }else if(tab==='flow'){
    const list=pane.querySelector('.v26-flow-list'); if(list)list.innerHTML=salesFlowRowsV27(salesFlowOrders(data.orders||[]));
  }else if(tab==='settlement'){
    const all=salesAllInSettlement(data.orders||[]);
    const p=pane.querySelector('.v26-settlement-list'); if(p)p.innerHTML=settlementPendingRowsV27(all.filter(o=>o.status==='SETTLEMENT_PENDING'));
    const i=pane.querySelector('.v26-invoice-list'); if(i)i.innerHTML=invoiceRowsV27(all.filter(o=>['SETTLED','EXITED'].includes(o.status)||((o.payments||[]).length&&!['SETTLEMENT_PENDING','CANCELLED'].includes(o.status))));
  }else if(tab==='delivery'){
    pane.innerHTML=renderSalesDeliveryV38(data.dispatchDeliveries||{});
  }else if(tab==='future'){
    const list=pane.querySelector('#futureOrderListV25'); if(list)list.innerHTML=futureOrderRowsV25(salesFutureOrders(data.orders||[]));
  }
}

function salesRefreshWarning(tab,failed){
  const pane=app.salesV29.panes?.[tab];if(!pane)return;
  let warning=pane.querySelector('[data-sales-refresh-warning]');
  if(!failed){warning?.remove();return;}
  if(!warning){warning=document.createElement('div');warning.dataset.salesRefreshWarning='1';warning.setAttribute('role','alert');warning.className='notice';warning.textContent='دریافت تازهٔ صف فروش ناموفق بود؛ اطلاعات نمایش‌داده‌شده ممکن است قدیمی یا ناقص باشد.';pane.prepend(warning);}
}

function startSalesLiveTimerV29(){
  if(app.timer){clearInterval(app.timer);app.timer=null;}
  app.timer=setInterval(async()=>{
    if(app.page!=='sales')return;
    try{
      const tab=app.sub.sales;
      const data=await fetchSalesCache(true);
      if(app.page==='sales'&&app.sub.sales===tab){paintSalesPaneV29(tab,data);salesRefreshWarning(tab,false);}
    }catch{if(app.page==='sales'&&app.sub.sales===tab)salesRefreshWarning(tab,true);}
  },8000);
}

function renderSales(tab='onsite'){
  if(!SALES_TABS_V29.includes(tab))tab='onsite';
  app.sub.sales=tab;
  const content=$('#content');
  if(content)content.onclick=null;
  activateSalesView();
  const shell=ensureSalesShellV29();
  if(!shell)return;
  salesV29Activate(tab);
  startSalesLiveTimerV29();
  const fresh=app.salesCache?.fetchedAt && (Date.now()-app.salesCache.fetchedAt<3500);
  if(!fresh||tab==='delivery'){
    void fetchSalesCache(true).then(data=>{
      app.salesCache=data;
      if(app.page==='sales' && app.sub.sales===tab){paintSalesPaneV29(tab,data);salesRefreshWarning(tab,false);}
    }).catch(()=>{if(app.page==='sales'&&app.sub.sales===tab)salesRefreshWarning(tab,true);});
  }else{
    paintSalesPaneV29(tab,app.salesCache);
  }
}

/* v40: collapsible admin sections (generic enhancer; UI preference only in localStorage) */
function enhanceAdminCollapsible(){
  const root=$('#content'); if(!root) return;
  let saved={}; try{saved=JSON.parse(localStorage.getItem('adminCollapsed')||'{}')}catch(_){saved={}}
  root.querySelectorAll('section.card').forEach((sec,i)=>{
    const head=sec.querySelector(':scope > .panel-head');
    if(!head||sec.dataset.collapsible==='1') return;
    const key=(head.querySelector('.eyebrow')?.textContent||'section')+'|'+(head.querySelector('h2')?.textContent||String(i));
    const body=document.createElement('div'); body.className='coll-body';
    while(head.nextSibling) body.appendChild(head.nextSibling);
    sec.appendChild(body); sec.dataset.collapsible='1';
    const btn=document.createElement('button'); btn.type='button'; btn.className='coll-toggle';
    head.appendChild(btn);
    const apply=c=>{sec.classList.toggle('is-collapsed',c); btn.setAttribute('aria-expanded',String(!c)); btn.textContent=c?'باز کردن':'بستن'};
    apply(!!saved[key]);
    btn.addEventListener('click',()=>{
      const c=!sec.classList.contains('is-collapsed'); apply(c);
      let s={}; try{s=JSON.parse(localStorage.getItem('adminCollapsed')||'{}')}catch(_){s={}}
      s[key]=c; localStorage.setItem('adminCollapsed',JSON.stringify(s));
    });
  });
}

/* v41g: compact table-style order line for the future-order tab */
function renderFutureLineRow(x,i){
  const idx=String(i), prefix='future';
  const units=['کیلوگرم','بسته','عدد','کارتن'].map(u=>`<option ${x.requestedUnit===u?'selected':''}>${u}</option>`).join('');
  return `<article class="fx41-line op-line" data-line="${idx}">
    <span class="fx41-line-no">${fa(String(i+1).padStart(2,'0'))}</span>
    <div class="fx41-cell fx41-cell-product">
      <div class="input-shell fx41-input"><span>${icon('search',15)}</span><input data-op-product-search="${prefix}-${idx}" aria-label="محصول ردیف ${fa(String(i+1))}" value="${esc(x.productLabel||'')}" placeholder="جستجوی محصول (نام یا کد)" autocomplete="off"></div>
      <div class="product-suggest" data-op-suggest="${prefix}-${idx}"></div>
      <div class="v26-product-picked fx41-picked">${x.productId?`<span>انتخاب شد</span>`:''}</div>
    </div>
    <div class="fx41-cell"><div class="input-shell fx41-input"><input data-op-qty="${prefix}-${idx}" aria-label="مقدار ردیف ${fa(String(i+1))}" inputmode="decimal" value="${esc(x.requestedQty||'')}" placeholder="۰"></div></div>
    <div class="fx41-cell"><div class="input-shell fx41-input"><select data-op-unit="${prefix}-${idx}" aria-label="واحد ردیف ${fa(String(i+1))}">${units}</select></div></div>
    <div class="fx41-cell"><div class="input-shell fx41-input"><input data-op-desc="${prefix}-${idx}" aria-label="توضیح ردیف ${fa(String(i+1))}" value="${esc(x.description||'')}" maxlength="500" placeholder="توضیحات محصول..."></div></div>
    <button type="button" class="fx41-del" data-action="op-remove-line" data-prefix="future" data-draft-key="futureDraft" data-index="${idx}" title="حذف ردیف" aria-label="حذف ردیف">${icon('trash',15)}</button>
  </article>`;
}
// reset button: restore the draft lines and date/time defaults
document.addEventListener('reset',e=>{
  if(e.target?.id!=='futureOrderFormV25')return;
  setTimeout(()=>{app.futureDraft=[defaultOrderLine()];renderOrderLineArea('future','futureDraft');bindJalaliDates(e.target);},0);
});

/* v41n: product pick for walk-in / remote order lines does not depend on the page-level #content handler */
document.addEventListener('click',e=>{
  const el=e.target&&e.target.closest?e.target.closest('[data-action="pick-product"]'):null;
  if(!el)return;
  e.preventDefault();
  pickProduct(Number(el.dataset.index),el.dataset.productId,el.dataset.label,el.dataset.quick);
});

/* v37.40.0 — پس از ثبت موفق ورود، فرم نگهبانی کاملاً خالی می‌شود تا اطلاعات مشتری
   قبلی در فرم باقی نماند (تصمیم کاربر؛ رفتار قبلی v37.0.3 حذف شد).
   پاک‌سازی در submitGate انجام می‌شود: رندر تازهٔ تب ورود + پلاک خالی. */

/* ================================================================
   v37.0.4 — تسویه (فروش ۰۴) بازطراحی‌شده
   - فرم تسویه در ستون راست؛ فهرست در ستون چپ (به‌روزرسانی زنده فقط فهرست را عوض می‌کند و فرم باز را پاک نمی‌کند)
   - قیمت هر کیلو برای هر قلم تحویلی الزامی است؛ روش‌های پرداخت قبل از ارسال بررسی می‌شوند
   - تعریف‌های قبلی این بخش (از جمله بازگشت بی‌پایان renderSettlementForm) جایگزین شده‌اند
   ================================================================ */
app.stl = app.stl || {orderId:null, order:null, items:[], drivers:[], devices:[], discountAmount:0, additionsAmount:0, sig:false, fp:'', manual:false, busy:false, dispatchBusy:false, paymentRows:[{type:'CASH',amount:''}]};
const stl = app.stl;
