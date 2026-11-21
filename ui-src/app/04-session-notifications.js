function showLoginView(message='') {
  $('#appView')?.classList.add('hidden');
  $('#loginView')?.classList.remove('hidden');
  const msg=$('#loginMsg');
  if(msg) msg.textContent=message;
}
function showAppView(){
  $('#loginView')?.classList.add('hidden');
  $('#appView')?.classList.remove('hidden');
}
// A page has a fresh tab id even after reload; pagehide is best effort, lease is the fallback.
const browserTabId = newIdempotencyKey();
let browserPresenceTimer = null;
function browserPresence(){
  if (!app.user) return;
  fetch('/api/session/presence',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({tabId:browserTabId})}).then(async r=>{await r.text();if(r.status===401)handleSessionExpired();}).catch(()=>{});
}
function startBrowserPresence(){browserPresence();if(!browserPresenceTimer)browserPresenceTimer=setInterval(browserPresence,20000);}
window.addEventListener('pagehide',()=>{
  if(app.user) navigator.sendBeacon('/api/session/leave',new Blob([JSON.stringify({tabId:browserTabId})],{type:'application/json'}));
});
window.addEventListener('pageshow',e=>{if(e.persisted&&app.user)browserPresence();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&app.user)browserPresence();});
async function handleLoginSubmit(e){
  e.preventDefault();
  const f=e.currentTarget;
  const msg=$('#loginMsg');
  const btn=f.querySelector('button[type="submit"]');
  const username=String(f.elements.username?.value||'').trim();
  const password=String(f.elements.password?.value||'');
  if(!username||!password){ if(msg) msg.textContent='نام کاربری و رمز عبور را وارد کنید.'; return; }
  if(btn){btn.disabled=true;btn.dataset.originalText=btn.innerHTML;btn.innerHTML='<span>در حال ورود...</span>';}
  try{
    const data=await api('/api/login',{method:'POST',body:JSON.stringify({username,password,browserSession:true})});
    app.user=data.user;
    syncServerTime();
    showAppView();
    if(msg) msg.textContent='';
    await startSession();
    if(!app.user?.mustChangePassword) toast(`خوش آمدید ${app.user.fullName}`);
  }catch(err){
    showLoginView(err.message||'ورود به سامانه انجام نشد.');
    $('#password')?.focus();
  }finally{
    if(btn){btn.disabled=false;btn.innerHTML=btn.dataset.originalText||'ورود به کارتابل';}
  }
}
async function handleLogout(){
  try{await api('/api/logout',{method:'POST',body:'{}'});}catch{}
  resetClientState();
  closeModal();
  showLoginView('');
  const f=$('#loginForm'); if(f){f.reset();}
}
async function goTransportSalesWork(id){
  const order=(await api('/api/orders/'+encodeURIComponent(id))).order;
  if(order?.transportInvoice){
    app.salesDeliveryTab=order.transportReturn?'delivered':order.transportDeparture?'inTransit':'assigned';
    closeModal();
    if(app.page!=='sales'||app.sub.sales!=='delivery')await go('sales','delivery');
    if(app.page==='sales'&&app.sub.sales==='delivery')return openTransportDeliveryWork(id);
    return;
  }
  closeModal();
  await go('sales','settlement');
  const data=await fetchSalesCache(true);
  if(app.page!=='sales'||app.sub.sales!=='settlement')return;
  paintSalesPaneV29('settlement',data);
  return stlOpen(id);
}
async function bootstrap(){
  syncServerTime();
  setInterval(syncServerTime,5*60*1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncServerTime()});
  const loginForm=$('#loginForm');
  loginForm?.addEventListener('submit',handleLoginSubmit);
  $('#showPassword')?.addEventListener('click',()=>{const p=$('#password');if(!p)return;const on=p.type==='text';p.type=on?'password':'text';const b=$('#showPassword');if(b)b.setAttribute('aria-label',on?'نمایش رمز':'پنهان کردن رمز');});
  $('#logoutBtn')?.addEventListener('click',handleLogout);
  document.querySelectorAll('[data-logout]').forEach(b=>b.addEventListener('click',handleLogout));
  $('#bell')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleNotifications();});
  $('#modal')?.addEventListener('click',async e=>{
    if(e.target.id==='modal'){closeModal();return;}
    const el=e.target.closest('[data-action]'); if(!el)return; const a=el.dataset.action;
    if(a==='close-modal')return closeModal();
    if(a==='transport-sales-work'){try{return await goTransportSalesWork(el.dataset.id);}catch(err){toast(err.message||'دریافت اطلاعات سفارش ناموفق بود.');return;}}
    if(a==='print-invoice'){e.stopPropagation();return printInvoice(el.dataset.id,Number(el.dataset.run)||null);}
    if(a==='resubmit-order')return resubmitOrder(el.dataset.id);
    if(a==='edit-returned-order')return openReturnedOrderEditor(el.dataset.id);
    if(a==='returned-add-line')return addReturnedLine();
    if(a==='returned-delete-line')return deleteReturnedLine(Number(el.dataset.index));
    if(a==='pick-return-product')return pickReturnedProduct(Number(el.dataset.index),el.dataset.productId,el.dataset.label);
    if(a==='save-returned-order')return saveReturnedOrder(el.dataset.id);
    if(a==='sales-edit-store-order')return openSalesStoreOrderEdit(el.dataset.id);
    if(a==='store-approve-v25')return openStoreApprovalV25(el.dataset.id);
    if(a==='store-quick-send-v40')return quickSendStoreOrder(el,true);
    if(a==='sales-store-add-line')return addSalesStoreLine();
    if(a==='sales-store-delete-line')return deleteSalesStoreLine(Number(el.dataset.index));
    if(a==='pick-sales-store-product')return pickSalesStoreProduct(Number(el.dataset.index),el.dataset.productId,el.dataset.label);
    if(a==='save-sales-store-order')return saveSalesStoreOrder(el.dataset.id);
    if(a==='wh38-accept-details')return wh38AcceptFromDetails(el.dataset.id,el);
    if(a==='confirm-warehouse')return confirmWarehouse(el.dataset.id);
    if(a==='return-item-sales')return returnSales(el.dataset.id,el.dataset.itemId);
    if(a==='return-sales')return returnSales(el.dataset.id);
    if(a==='invoice')return previewInvoice(el.dataset.id,Number(el.dataset.run)||null);
  });
  document.addEventListener('click',async e=>{
    const adminCartable=e.target.closest('[data-admin-cartable]');
    if(adminCartable){e.preventDefault();const role=adminCartable.dataset.adminCartable;app.adminActiveRole=role;const page=role==='dispatch'?'drivers':role;const first=role==='gate'?'entry':'dashboard';app.sub[page]=first;await go(page,first);return;}
    const adminHome=e.target.closest('[data-admin-home]');
    if(adminHome){e.preventDefault();app.adminActiveRole=null;await go('dashboard');return;}
    const cartableBtn=e.target.closest('[data-cartable]');
    if(cartableBtn){e.preventDefault();const key=cartableBtn.dataset.cartable,p=cartableBtn.dataset.rolePage;app.sub[p]=key;renderNav();if(['sales','warehouse','drivers'].includes(p)&&key==='transport-resources'){await go('transport-resources');return;}if(p==='drivers'&&key==='transport-fleet'){await go('transport-fleet');return;}if(p==='sales'&&key==='customers'){await go('customers');return;}if(p==='warehouse'&&key==='returns'){await go('returns');return;}if(key==='dashboard'||key==='reports'){app.cartableDashView=key;await go(p,key)}else if(p==='gate'&&(key==='dispatch'||key==='dispatch-leaving')){app.gateDispatchTab='leaving';await go('gate','dispatch')}else if(p==='warehouse'){if(key==='history')await go('warehouse','history');else{if(app.wh38)app.wh38.phase=key;await go('warehouse',key)}}else if(p==='drivers'&&(normalizeRole(app.user?.roleCode)==='dispatch'||app.adminActiveRole==='dispatch')){if(key==='dashboard'||key==='reports'){await go('drivers',key)}else{adm.tab=key==='drivers'?'drivers':'dispatch';if(key==='orders')dsp.tab='pending';await go('drivers',key)}}else if(p==='store'&&['delivery','registered','create','partial'].includes(key)){app.storePortalTab=key;await go('store',key)}else await go(p,key);return;}
    const pageBtn=e.target.closest('[data-page]');
    if(pageBtn && !pageBtn.closest('#content')){e.preventDefault();await go(pageBtn.dataset.page);return;}
    const actionEl=e.target.closest('[data-action]');
    if(!actionEl || actionEl.closest('#content'))return;
    const a=actionEl.dataset.action;
    if(a==='close-modal'){closeModal();return;}
    if(a==='print-invoice'){return printInvoice(actionEl.dataset.id,Number(actionEl.dataset.run)||null);}
    if(a==='read-notifications'){return markNotificationsRead();}
    if(a==='open-notification'){return openNotificationTarget(actionEl.dataset.id,actionEl.dataset.type,actionEl.dataset.role,actionEl.dataset.entityType,actionEl.dataset.entityId);}
    if(a==='resubmit-order'){return resubmitOrder(actionEl.dataset.id);}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();$('#notificationPanel')?.classList.add('hidden');}});
  document.addEventListener('click',e=>{
    const panel=$('#notificationPanel'); const bell=$('#bell');
    if(panel && !panel.classList.contains('hidden') && !panel.contains(e.target) && !bell?.contains(e.target)) panel.classList.add('hidden');
  });
  try{
    const me=await api('/api/me');
    app.user=me.user;
    showAppView();
    await startSession();
  }catch{
    showLoginView('');
    $('#username')?.focus();
  }
}

/* ---------- نشست، تغییر رمز و خروج امن ---------- */
function resetClientState(){
  if(app.indicatorTimer){clearInterval(app.indicatorTimer);app.indicatorTimer=null}
  if(app.timer){clearInterval(app.timer);app.timer=null}
  stopNotifReminder(); closeNotifPanel();
  app.salesDeliveryTab='assigned'; app.salesDeliveryHistoryOffset=0;
  app.notifRequestSeq=(app.notifRequestSeq||0)+1; app.notifAppliedSeq=app.notifRequestSeq;
  app.user=null; app.features={}; app.notifSnapshot=null; app.notifSeen=null; app.notifUnread=0; app.notifAudioWarningShown=false; app.page='dashboard'; app.workload={}; app.selectedWarehouse=null; app.selectedSettlement=null; app.forcePasswordChange=false;
}
function handleSessionExpired(){
  if(!app.user) return;
  resetClientState();
  closeModal();
  showLoginView('نشست شما منقضی شده است. لطفاً دوباره وارد شوید.');
}
async function startSession(){ startBrowserPresence(); app.notifSeen=null;
  if(app.user?.mustChangePassword){ openPasswordModal(true); return; }
  await refreshShell();
  await go(landing());
}
function openPasswordModal(forced=false){
  app.forcePasswordChange=!!forced;
  const m=$('#modal');
  m.innerHTML=`<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="pwTitle"><div class="modal-head"><strong id="pwTitle">${forced?'تغییر اجباری رمز عبور':'تغییر رمز عبور'}</strong>${forced?'':`<button class="modal-close" data-action="close-modal" aria-label="بستن">${icon('close',18)}</button>`}</div><div class="modal-body"><form id="pwForm" class="auth-form" autocomplete="off">${forced?'<p class="form-hint">برای امنیت حساب، پیش از ادامه باید رمز عبور خود را تغییر دهید.</p>':''}<div class="field"><label for="pwCurrent">رمز عبور فعلی</label><input id="pwCurrent" name="currentPassword" type="password" autocomplete="current-password" required></div><div class="field"><label for="pwNew">رمز عبور جدید</label><input id="pwNew" name="newPassword" type="password" autocomplete="new-password" minlength="8" required></div><div class="field"><label for="pwConfirm">تکرار رمز جدید</label><input id="pwConfirm" name="confirm" type="password" autocomplete="new-password" minlength="8" required></div><p class="form-hint">حداقل ۸ کاراکتر، شامل حرف انگلیسی و عدد.</p><div id="pwMsg" class="form-error" role="alert"></div><button class="btn btn-primary btn-lg btn-full" type="submit">ذخیره رمز جدید</button></form></div></div>`;
  m.classList.add('open');
  setTimeout(()=>$('#pwCurrent')?.focus(),0);
}
document.addEventListener('submit',async e=>{
  if(e.target.id!=='pwForm') return;
  e.preventDefault();
  const f=e.target; const msg=$('#pwMsg'); const btn=f.querySelector('button[type="submit"]');
  const cur=f.elements.currentPassword.value, nw=f.elements.newPassword.value, cf=f.elements.confirm.value;
  if(nw!==cf){ if(msg) msg.textContent='رمز جدید و تکرار آن یکسان نیستند.'; return; }
  if(btn) btn.disabled=true;
  const wasForced=app.forcePasswordChange;
  try{
    const d=await api('/api/account/password',{method:'POST',body:JSON.stringify({currentPassword:cur,newPassword:nw})});
    app.user=d.user; app.forcePasswordChange=false; closeModal();
    if(wasForced){ await startSession(); toast('رمز عبور تغییر کرد. خوش آمدید.'); }
    else toast('رمز عبور با موفقیت تغییر کرد.');
  }catch(err){ if(msg) msg.textContent=err.message; }
  finally{ if(btn) btn.disabled=false; }
});
document.addEventListener('click',e=>{ if(e.target.closest?.('#changePasswordBtn')) openPasswordModal(false); });
/* ---------- اعلان‌ها: پنل زیر زنگوله، ناوبری به کارتابل مربوط، صدا و هشدار ---------- */
const NOTIF_ROUTES={
  NEW_VISIT:{page:'sales',sub:'onsite'},
  PICKUP_ENTRY:{page:'warehouse',sub:'incoming'},
  PICKUP_CANCELLATION_REQUESTED:{page:'sales',sub:'flow'},
  PICKUP_CANCELLATION_APPROVED:{page:'gate',sub:'exit'},
  RETURN_FROM_WAREHOUSE:{page:'sales',sub:'flow'},
  WAREHOUSE_DONE:{page:'sales',sub:'settlement'},
  STORE_ORDER_PENDING:{page:'sales',sub:'stores'},
  STORE_ORDER_QUICK_SENT:{page:'warehouse'},
  STORE_RECEIPT_CONFIRMED:{page:'sales',sub:'delivery'},
  TRANSPORT_ORDER_READY:{page:'drivers',sub:'orders'},
  TRANSPORT_INVOICE_READY:{page:'gate',sub:'dispatch'},
  TRANSPORT_DEPARTED:{page:'sales',sub:'delivery'},
  STORE_ORDER_DUE:{page:'warehouse'},
  REMOTE_ORDER_DUE:{page:'warehouse'},
  NEW_ORDER:{page:'warehouse'},
  NEW_REMOTE_ORDER:{page:'warehouse'},
  REOPEN_PREPARING:{page:'warehouse'},
  DISPATCH_DRIVER_ASSIGNED:{page:'gate',sub:'dispatch'},
  DISPATCH_DRIVER_EXIT_PENDING:{page:'gate',sub:'dispatch'},
  STORE_TRANSPORT_EXIT_READY:{page:'gate',sub:'dispatch'},
  DISPATCH_DELIVERY_PENDING_SALES:{page:'sales',sub:'delivery'},
  SETTLEMENT_DONE:{page:'gate',sub:'exit'},
  STORE_RUN_R1_SENT:{page:'sales',sub:'stores'},
  STORE_RUN_R2_SENT:{page:'sales',sub:'stores'},
  DISPATCH_RETURN:{page:'sales',sub:'delivery'},
  RETURN_TO_WAREHOUSE:{page:'returns'},
  STORE_ORDER_UPDATE:{page:'store',sub:'registered'},
  STORE_DELIVERY_UPDATE:{page:'store',sub:'delivery'},
  DRIVER_ASSIGNMENT:{page:'driver'},
  DRIVER_GATE_EXIT:{page:'driver'},
  ORDER_CLOSED:{page:'gate',sub:'dispatch'}
};
function notifRoute(type,targetRole){
  if(type==='STORE_ORDER_APPROVED') return targetRole==='warehouse'?{page:'warehouse'}:{page:'sales',sub:'stores'};
  if(type==='TRANSPORT_ASSIGNED') return targetRole==='warehouse'?{page:'warehouse'}:{page:'sales',sub:'flow'};
  if(type==='TRANSPORT_WAREHOUSE_HANDOVER') return targetRole==='dispatch'?{page:'drivers',sub:'orders'}:{page:'sales',sub:'settlement'};
  return NOTIF_ROUTES[type]||null;
}
function faDigits(v){return String(v).replace(/[0-9]/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d])}
function notifTimeText(iso){
  try{
    const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
    const p=Object.fromEntries(f.formatToParts(new Date(iso)).map(x=>[x.type,x.value]));
    const [jy,jm,jd]=gregorianToJalali(Number(p.year),Number(p.month),Number(p.day));
    const hh=p.hour==='24'?'00':p.hour;
    return faDigits(`${jy}/${pad2(jm)}/${pad2(jd)} - ${hh}:${p.minute}`);
  }catch{return ''}
}
const NOTIF_REPEAT_MS=30000;
function notifSoundOn(){try{return localStorage.getItem('bt.notifSound')!=='0'}catch{return true}}
function unlockAudio(){
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio) return Promise.resolve(false);
    if(!app.audioCtx || app.audioCtx.state==='closed') app.audioCtx=new Audio();
    const ctx=app.audioCtx;
    if(ctx.state==='running') return Promise.resolve(true);
    return Promise.resolve(ctx.resume()).then(()=>ctx.state==='running',()=>false);
  }catch{return Promise.resolve(false)}
}
function setNotifAudioStatus(blocked){
  app.notifAudioBlocked=blocked;
  const status=$('#notifAudioStatus');
  if(status){status.hidden=!blocked; status.textContent=blocked?'مرورگر اجازهٔ پخش صدا نداده است. روی «آزمایش صدا» بزنید و صدای دستگاه و مجوز سایت را بررسی کنید.':'';}
  const bell=$('#bell'); if(bell) bell.title=blocked?'برای فعال‌سازی صدای اعلان، پنل اعلان‌ها را باز و صدای سایت را فعال کنید.':'اعلان‌های عملیاتی';
}
function stopNotifChime(){
  app.notifSoundSeq=(app.notifSoundSeq||0)+1;
  for(const node of app.notifSoundNodes||[]){try{node.stop()}catch{} try{node.disconnect()}catch{}}
  app.notifSoundNodes=[];
}
async function playNotifChime(){
  if(!notifSoundOn()) return false;
  stopNotifChime(); const seq=app.notifSoundSeq;
  let timeout; const ready=await Promise.race([unlockAudio(),new Promise(resolve=>{timeout=setTimeout(()=>resolve(false),1500)})]);
  clearTimeout(timeout);
  if(seq!==app.notifSoundSeq || !notifSoundOn()) return false;
  const ctx=app.audioCtx;
  if(!ready || !ctx || ctx.state!=='running'){
    setNotifAudioStatus(true);
    if(app.user && !app.notifAudioWarningShown){app.notifAudioWarningShown=true;toast('صدای اعلان مسدود است؛ روی اعلان‌ها و سپس «آزمایش صدا» بزنید و صدای مرورگر و دستگاه را بررسی کنید.');}
    return false;
  }
  setNotifAudioStatus(false);
  const t0=ctx.currentTime;
  try{
    // Three bell strikes with inharmonic partials and a long metallic decay.
    for(const strike of [0,0.75,1.5]) for(const [frequency,level,decay] of [[880,0.30,1.6],[1760,0.14,1.1],[2376,0.08,0.8],[3432,0.04,0.55]]){
      const oscillator=ctx.createOscillator(), gain=ctx.createGain(), at=t0+strike;
      oscillator.type='sine'; oscillator.frequency.value=frequency;
      gain.gain.setValueAtTime(0.0001,at);
      gain.gain.exponentialRampToValueAtTime(level,at+0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001,at+decay);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.onended=()=>{try{oscillator.disconnect();gain.disconnect()}catch{}};
      oscillator.start(at); oscillator.stop(at+decay+0.02);
      app.notifSoundNodes.push(oscillator);
    }
    try{navigator.vibrate&&navigator.vibrate([180,90,180,90,180])}catch{}
    return true;
  }catch{stopNotifChime();setNotifAudioStatus(true);return false}
}
function stopNotifReminder(){
  if(app.notifReminderTimer){clearTimeout(app.notifReminderTimer);app.notifReminderTimer=null}
  stopNotifChime();
}
function startNotifReminder(playNow=true){
  if(app.notifReminderTimer){clearTimeout(app.notifReminderTimer);app.notifReminderTimer=null}
  if(!app.user || !(app.notifUnread>0) || !notifSoundOn()) return;
  if(playNow) void playNotifChime();
  app.notifReminderTimer=setTimeout(()=>{app.notifReminderTimer=null;startNotifReminder(true)},NOTIF_REPEAT_MS);
}
function onNotifAudioGesture(){
  const wasBlocked=app.notifAudioBlocked;
  void unlockAudio().then(ready=>{
    if(ready && wasBlocked && app.notifAudioBlocked && app.user && app.notifUnread>0 && notifSoundOn()){
      setNotifAudioStatus(false); startNotifReminder(true);
    }
  });
}
function positionNotifPanel(){
  const panel=$('#notificationPanel'), bell=$('#bell'); if(!panel||!bell) return;
  const r=bell.getBoundingClientRect();
  const isMobile=window.matchMedia('(max-width: 1024px)').matches;
  const railWidth=isMobile?Math.ceil(document.querySelector('.rail')?.getBoundingClientRect().width||0):0;
  const gutter=12;
  const leftEdge=gutter;
  const rightEdge=Math.max(leftEdge,window.innerWidth-railWidth-gutter);
  const w=Math.max(0,Math.min(420,rightEdge-leftEdge));
  let left=r.right-w; left=Math.max(leftEdge,Math.min(left,rightEdge-w));
  const top=Math.round(r.bottom+10);
  panel.style.width=w+'px'; panel.style.left=left+'px'; panel.style.right='auto';
  panel.style.top=top+'px';
  panel.style.maxHeight=Math.max(140,window.innerHeight-top-12)+'px';
}
function closeNotifPanel(){$('#notificationPanel')?.classList.add('hidden')}
function renderNotifPanel(d){
  const panel=$('#notificationPanel'); const list=d.notifications||[];
  const soundOn=notifSoundOn();
  panel.innerHTML=`<div class="notification-head"><div><strong>اعلان‌های عملیاتی</strong><span>${faDigits(d.unread||0)} اعلان خوانده‌نشده</span></div><div class="notification-tools"><button type="button" class="btn btn-ghost btn-sm" data-action="toggle-notif-sound" aria-pressed="${soundOn}">${soundOn?'صدا: روشن':'صدا: خاموش'}</button><button type="button" class="btn btn-ghost btn-sm" data-action="test-notif-sound">آزمایش صدا</button><button type="button" class="btn btn-ghost btn-sm" data-action="read-notifications" ${d.unread?'':'disabled'}>خواندن همه</button></div></div><div id="notifAudioStatus" class="notice" role="status" ${app.notifAudioBlocked?'':'hidden'}>${app.notifAudioBlocked?'مرورگر اجازهٔ پخش صدا نداده است. روی «آزمایش صدا» بزنید و صدای دستگاه و مجوز سایت را بررسی کنید.':''}</div><div class="notification-list">${list.length?list.map(n=>`<button type="button" class="notification-item ${n.isRead?'':'unread'}" data-action="open-notification" data-id="${esc(n.id)}" data-type="${esc(n.type||'')}" data-role="${esc(n.targetRole||'')}" data-entity-type="${esc(n.entityType||'')}" data-entity-id="${esc(n.entityId||'')}"><span class="notification-dot"></span><span class="notification-body"><strong>${esc(n.message||'اعلان جدید')}</strong><small>${esc(notifTimeText(n.createdAt))}${n.navSection===null?' · وضعیت مورد تغییر کرده است':''}</small></span></button>`).join(''):'<p class="notification-empty">اعلانی برای شما وجود ندارد.</p>'}</div>`;
}
function applyNotifSnapshot(d){
  app.notifSnapshot=d;
  notifyNewArrivals(d);
  const bc=$('#bellCount'); if(bc){bc.textContent=qty(d.unread||0);bc.classList.toggle('hidden',!(d.unread>0));}
  updateSalesDeliveryWorkCount();
  renderNav();
}
async function toggleNotifications(){
  const panel=$('#notificationPanel'); if(!panel) return;
  unlockAudio();
  if(!panel.classList.contains('hidden')){closeNotifPanel();return;}
  try{
    const userId=app.user?.id,seq=app.notifRequestSeq=(app.notifRequestSeq||0)+1;
    const d=await api('/api/notifications');
    if(!app.user||app.user.id!==userId)return;
    if(seq>(app.notifAppliedSeq||0)){app.notifAppliedSeq=seq;applyNotifSnapshot(d);}
    renderNotifPanel(app.notifSnapshot||d);
    positionNotifPanel(); panel.classList.remove('hidden');
  }catch(e){toast(e.message)}
}
async function acknowledgeNotifications(id='', options={}){
  if(Array.isArray(id) && !id.length)return true;
  const userId=app.user?.id;
  if(!userId)return false;
  const prior=app.notifAckQueue||Promise.resolve();let release;
  app.notifAckQueue=new Promise(resolve=>{release=resolve;});
  await prior.catch(()=>{});
  if(!app.user||app.user.id!==userId){release();return false;}
  // باز کردن، زنگ در حال پخش را فوراً متوقف می‌کند؛ یادآور دیگر اعلان‌ها بعداً ادامه می‌یابد.
  stopNotifReminder();
  try{
    const d=await api('/api/notifications/read',{method:'POST',body:JSON.stringify(Array.isArray(id)?{ids:id}:(id?{id}:{}))});
    if(!app.user||app.user.id!==userId)return false;
    // در طول درخواست نیز ممکن است یک تازه‌سازی قدیمی صدا را دوباره فعال کرده باشد.
    stopNotifReminder();
    // همهٔ درخواست‌هایی که پیش از تأیید سرور شروع شده‌اند نامعتبرند.
    app.notifAppliedSeq=app.notifRequestSeq=(app.notifRequestSeq||0)+1;
    app.notifSeen=new Set((d.notifications||[]).map(n=>n.id));
    app.notifUnread=Math.max(0,Number(d.unread)||0);
    app.notifSnapshot=d;
    const bc=$('#bellCount'); if(bc){bc.textContent=qty(d.unread||0);bc.classList.toggle('hidden',!(d.unread>0));}
    if(app.notifUnread) startNotifReminder(false);
    if(options.closePanel!==false)closeNotifPanel();
    renderNav();
    updateSalesDeliveryWorkCount();
    return true;
  }catch(e){if(app.notifUnread)startNotifReminder(false);toast(e.message);return false;}finally{release();}
}
async function markNotificationsRead(id=''){ await acknowledgeNotifications(id); }
// Capture only notices already visible to this account before fetching a detail.
// New arrivals, other roles/sections and another store service remain unread.
function captureEntityNotices(entityType,entityId,run=null){
 const role=normalizeRole(app.user?.roleCode)==='admin'?app.adminActiveRole:normalizeRole(app.user?.roleCode);
 const page=role==='dispatch'?'drivers':role;
 const section=page==='drivers'?'orders':page==='driver'?'dashboard':app.sub?.[page];
 if(!role||!section||app.page!==page||app.notifNavigationDepth)return [];
 const ids=(app.notifSnapshot?.notifications||[]).filter(n=>{
  if(n.isRead||normalizeRole(n.targetRole)!==role||n.navSection!==section||n.entityType!==entityType||n.entityId!==entityId)return false;
  if(run==null)return true;
  const eventRun=n.run??(n.type==='STORE_RUN_R1_SENT'?1:n.type==='STORE_RUN_R2_SENT'?2:null);
  return eventRun!=null && Number(eventRun)===Number(run);
 }).map(n=>n.id);
 Object.defineProperties(ids,{account:{value:app.user?.id},role:{value:role},page:{value:page},section:{value:section}});
 return ids;
}
function finishEntityNotices(ids){
 if(!ids?.length||app.user?.id!==ids.account||app.page!==ids.page)return;
 const role=normalizeRole(app.user?.roleCode)==='admin'?app.adminActiveRole:normalizeRole(app.user?.roleCode);
 const section=ids.page==='drivers'?'orders':ids.page==='driver'?'dashboard':app.sub?.[ids.page];
 if(role!==ids.role||section!==ids.section)return;
 for(let i=0;i<ids.length;i+=5000)void acknowledgeNotifications(ids.slice(i,i+5000),{closePanel:false});
}
function focusNotificationElement(el){
  if(!el)return false;
  const card=el.closest('article,.sr-ship-row,.sd-queue-row')||el;
  card.classList.add('notif-target-highlight');
  card.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>card.classList.remove('notif-target-highlight'),6000);
  return true;
}
async function openNotificationTarget(id,type,role,entityType,entityId){
  const startingAccount=app.user?.id;
  const finish=async ok=>{if(ok && app.user?.id===startingAccount)await acknowledgeNotifications(id);return !!ok;};
  const notice=(app.notifSnapshot?.notifications||[]).find(n=>n.id===id);
  const run=Number(notice?.run)||(type==='STORE_RUN_R1_SENT'?1:type==='STORE_RUN_R2_SENT'?2:0);
  const baseRoute=notifRoute(type,role),route=baseRoute?{...baseRoute}:null, mine=normalizeRole(app.user?.roleCode);
  if(type==='PICKUP_CANCELLATION_REQUESTED'&&route&&notice?.navSection)route.sub=notice.navSection;
  if(!route){toast('مسیر این اعلان قدیمی مشخص نیست.');return;}
  if(mine!=='admin' && mine!==role){toast('این اعلان مربوط به کارتابل دیگری است.');return;}
  if(!entityId||!entityType){await go(route.page,route.sub);toast('شناسهٔ مورد در این اعلان قدیمی موجود نیست.');return;}
  app.notifNavigationDepth=(app.notifNavigationDepth||0)+1;
  try{
    if(entityType==='visit'){
      const visits=(await api('/api/visits?id='+encodeURIComponent(entityId))).visits||[];
      const visit=visits.find(v=>v.id===entityId);
      await go(route.page,route.sub);
      if(!visit||visit.status!=='WAITING_SALES')return toast('این مراجعه دیگر در صف ثبت سفارش نیست.');
      return finish(await openOrder(entityId));
    }
    if(entityType==='return'){
      const sets=await Promise.all(['AT_SALES','AT_WAREHOUSE','RECEIVED'].map(status=>api('/api/returns?status='+status)));
      const ticket=sets.flatMap(x=>x.returns||[]).find(x=>x.id===entityId);
      if(!ticket){await go('returns');return toast('برگهٔ مرجوعی دیگر در دسترس نیست.');}
      dsp.retTab=ticket.status;await go('returns');
      if(!focusNotificationElement(document.querySelector(`[data-return-id="${CSS.escape(entityId)}"]`)))return toast('برگهٔ مرجوعی دیگر در دسترس نیست.');
      return finish(true);
    }
    if(entityType!=='order'){await go(route.page,route.sub);return toast('نوع مورد این اعلان قابل نمایش نیست.');}
    if(route.page==='gate'&&route.sub==='dispatch'){
      const data=await api('/api/gate/dispatch');
      const found=[['leaving',data.leaving]].find(([,rows])=>(rows||[]).some(o=>o.id===entityId));
      if(found)app.gateDispatchTab=found[0];
      await go('gate','dispatch');
      if(!found||!focusNotificationElement(document.querySelector(`[data-order="${CSS.escape(entityId)}"]`)))return toast('این محموله دیگر در صف جاری نگهبانی نیست.');
      if(type==='STORE_TRANSPORT_EXIT_READY'){
        const button=document.querySelector(`[data-gate="store-details"][data-id="${CSS.escape(entityId)}"][data-run="${run}"]`);
        if(!button)return toast('این سرویس دیگر در صف نگهبانی نیست.');await handleGateDispatchAction(button);return finish(true);
      }
      return finish(await dspOrderDetails(entityId,run||null));
    }
    if(route.page==='store'){await go('store',route.sub);return finish(await (run?openStoreDeliveryDetails(entityId,run):openStoreOrderDetails(entityId)));}
    if(route.page==='driver'){await go('driver');return finish(await dspOrderDetails(entityId,run||null));}
    if(route.page==='drivers'){adm.tab='dispatch';await go('drivers','orders');const el=document.querySelector(`[data-tp="details"][data-id="${CSS.escape(entityId)}"]${run?`[data-run="${run}"]`:''}`);if(el){focusNotificationElement(el);el.click();return finish(true);}return toast('این سفارش دیگر در صف جاری ترابری نیست.');}
    if(type==='PICKUP_CANCELLATION_APPROVED'&&route.page==='gate'){
      await go('gate','exit');const el=document.querySelector(`[data-pickup-exit="${CSS.escape(entityId)}"]`);
      if(focusNotificationElement(el))return finish(true);return toast('این خروج دیگر در صف نگهبانی نیست.');
    }
    if(type==='PICKUP_ENTRY'&&route.page==='warehouse'){
      const active=(await fetchPagedList('/api/pickup/active','orders')).orders.find(o=>o.id===entityId);if(!active)return toast('این مراجعه دیگر در جریان نیست.');
      await go('warehouse',active.status==='WAREHOUSE_PREPARING'?'preparing':'incoming');
      const el=document.querySelector(`[data-action="pickup-cancel"][data-id="${CSS.escape(entityId)}"]`);if(focusNotificationElement(el))return finish(true);return toast('این مراجعه دیگر در صف انبار نیست.');
    }
    const order=(await api('/api/orders/'+encodeURIComponent(entityId))).order;
    if(route.page==='warehouse'){
      const phase=order.orderType==='STORE'?'stores':(order.status==='SETTLEMENT_PENDING'&&type==='TRANSPORT_ASSIGNED'?'delivered':order.status==='WAREHOUSE_PREPARING'?'preparing':'incoming');
      if(order.orderType==='STORE')app.wh38.storeTab=order.status==='WAREHOUSE_PREPARING'?'preparing':'incoming';
      await go('warehouse',phase);
      if(order.orderType==='STORE'&&order.status==='WAREHOUSE_PENDING')return finish(await wh38StoreDetails(entityId));
      if(phase==='delivered')return finish(await whDeliveredDetails(entityId));
      return finish(await openOrderDetails(entityId));
    }
    if(route.page==='sales'&&order.orderType==='STORE'&&order.transportWorkflow===1&&type==='STORE_RECEIPT_CONFIRMED'){
      app.salesDeliveryTab='delivered';await go('sales','delivery');return finish(await openOrderDetails(entityId));
    }
    if(route.page==='sales'&&order.orderType==='STORE'){
      // صفحه فروش ممکن است دادهٔ چند ثانیه قبل را در حافظه داشته باشد.
      if(app.salesFetchPromise)await app.salesFetchPromise.catch(()=>{});
      await fetchSalesCache(true);
      app.salesStoreTab=type==='STORE_RUN_R1_SENT'||type==='STORE_RUN_R2_SENT'||order.status==='STORE_PENDING_SALES'?'incoming':order.status==='CLOSED'?'history':'processing';
      await go('sales','stores');
      if(type==='STORE_RUN_R1_SENT'||type==='STORE_RUN_R2_SENT'){
        const run=type==='STORE_RUN_R2_SENT'?'2':'1';
        const el=document.querySelector(`[data-action="sr-ship-open"][data-order="${CSS.escape(entityId)}"][data-run="${run}"]`);
        if(focusNotificationElement(el))return finish(await srSalesOpenShip(entityId,Number(run)));
        return toast('این سرویس دیگر در صف ارسال فروش نیست.');
      }
      return finish(await openOrderDetails(entityId));
    }
    if(route.page==='sales'&&order.transportWorkflow===1&&order.deliveryMode==='DELIVERY'&&order.orderType!=='STORE'&&type==='TRANSPORT_ASSIGNED'&&order.status==='SETTLEMENT_PENDING')return finish(await goTransportSalesWork(entityId));
    if(route.page==='sales'&&order.transportWorkflow===1&&order.orderType!=='STORE'&&type==='TRANSPORT_ASSIGNED'&&order.status==='CLOSED'){app.salesDeliveryTab='history';await go('sales','delivery');return finish(await openOrderDetails(entityId));}
    if(route.page==='sales'&&type==='TRANSPORT_DEPARTED'&&order.transportWorkflow===1){
      app.salesDeliveryTab=order.status==='CLOSED'?'history':order.transportReturn?'delivered':'inTransit';
      await go('sales','delivery');await fetchSalesCache(true);
      const views=app.salesCache?.dispatchDeliveries||{};
      if([...(views.assigned||[]),...(views.inTransit||[]),...(views.pending||[]),...(views.finalized||[])].some(o=>o.id===entityId))return finish(await openSalesDeliveryDetails(entityId,run||undefined));
      return finish(await openOrderDetails(entityId));
    }
    if(route.page==='sales'&&order.transportWorkflow===1&&order.deliveryMode==='DELIVERY'&&order.status==='SETTLEMENT_PENDING'&&['TRANSPORT_WAREHOUSE_HANDOVER','WAREHOUSE_DONE'].includes(type))return finish(await goTransportSalesWork(entityId));
    if(type==='PICKUP_CANCELLATION_REQUESTED'&&route.page==='sales')await fetchSalesCache(true);
    await go(route.page,route.sub);
    if(type==='PICKUP_CANCELLATION_REQUESTED'&&route.page==='sales'){
      const el=document.querySelector(`[data-action="pickup-approve"][data-id="${CSS.escape(entityId)}"]`);if(focusNotificationElement(el))return finish(true);return toast('این انصراف دیگر در انتظار بررسی نیست.');
    }
    if(route.page==='gate'){
      if(order.pickupHandover&&app.features?.pickupStaging){const pickupEl=document.querySelector(`[data-pickup-exit="${CSS.escape(entityId)}"]`);if(focusNotificationElement(pickupEl))return finish(true);return toast('این خروج دیگر در صف نگهبانی نیست.');}
      const el=document.querySelector(`[data-action="open-exit"][data-id="${CSS.escape(entityId)}"]`);
      if(focusNotificationElement(el))return finish(await openExit(entityId,el));
      return toast('این فاکتور دیگر در صف کنترل خروج نیست.');
    }
    return finish(await openOrderDetails(entityId));
  }catch(e){toast('مورد اعلان در دسترس نیست یا وضعیت آن تغییر کرده است: '+e.message);}
  finally{app.notifNavigationDepth--; }
}
function notifyNewArrivals(d){
  const list=d?.notifications||[];
  const fresh=app.notifSeen ? list.filter(n=>!n.isRead && !app.notifSeen.has(n.id)) : [];
  app.notifSeen=new Set(list.map(n=>n.id));
  app.notifUnread=Math.max(0,Number(d?.unread)||0);
  if(!app.notifUnread) stopNotifReminder();
  else if(fresh.length || !app.notifReminderTimer) startNotifReminder(true);
  if(!fresh.length) return;
  const bell=$('#bell');
  if(bell){bell.classList.remove('bell-ring'); void bell.offsetWidth; bell.classList.add('bell-ring');}
  toast(fresh.length===1?`اعلان جدید: ${fresh[0].message}`:`${faDigits(fresh.length)} اعلان جدید دریافت شد`);
  if(!$('#notificationPanel')?.classList.contains('hidden')) renderNotifPanel(d);
}
document.addEventListener('pointerdown',onNotifAudioGesture,{passive:true});
document.addEventListener('keydown',onNotifAudioGesture);
document.addEventListener('click',e=>{
  const t=e.target.closest?.('[data-action="toggle-notif-sound"]');
  if(t){
    const on=!notifSoundOn();
    try{localStorage.setItem('bt.notifSound',on?'1':'0')}catch{}
    if(on){if(app.notifUnread>0) startNotifReminder(true);else void playNotifChime()}
    else {stopNotifReminder();setNotifAudioStatus(false)}
    t.setAttribute('aria-pressed',String(on)); t.textContent=on?'صدا: روشن':'صدا: خاموش';
    return;
  }
  if(e.target.closest?.('[data-action="test-notif-sound"]')){
    if(!notifSoundOn()) return toast('ابتدا صدای اعلان را روشن کنید.');
    void playNotifChime();
  }
});
window.addEventListener('resize',()=>{ if(!$('#notificationPanel')?.classList.contains('hidden')) positionNotifPanel(); });


/* ---------- صفحه‌بندی فهرست‌های طولانی مدیریت ---------- */
const PAGE_SIZE={users:12,products:10,audit:15};
function pageItems(key,list){
  app.pager=app.pager||{};
  const size=PAGE_SIZE[key]||10, pages=Math.max(1,Math.ceil(list.length/size));
  const cur=Math.min(Math.max(1,app.pager[key]||1),pages); app.pager[key]=cur;
  return list.slice((cur-1)*size,cur*size);
}
function pagerHtml(key,total){
  const size=PAGE_SIZE[key]||10, pages=Math.max(1,Math.ceil(total/size));
  if(pages<=1) return '';
  const cur=Math.min(Math.max(1,(app.pager||{})[key]||1),pages);
  return `<nav class="pager" aria-label="صفحه‌بندی"><button type="button" class="btn btn-secondary btn-sm" data-pager="${key}" data-to="${cur-1}" ${cur<=1?'disabled':''}>صفحه قبل</button><span>صفحه ${faDigits(cur)} از ${faDigits(pages)} <small>(${faDigits(total)} مورد)</small></span><button type="button" class="btn btn-secondary btn-sm" data-pager="${key}" data-to="${cur+1}" ${cur>=pages?'disabled':''}>صفحه بعد</button></nav>`;
}
document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-pager]'); if(!b||b.disabled) return;
  app.pager=app.pager||{};
  app.pager[b.dataset.pager]=Math.max(1,Number(b.dataset.to)||1);
  const y=window.scrollY;
  renderAdmin().then(()=>window.scrollTo(0,y)).catch(err=>toast(err.message));
});

window.addEventListener('DOMContentLoaded',bootstrap);
/* v21 — modern operational UX and remote-order workflow */

function moneyCompact(v){
  const x=Math.round(Number(v||0));
  if(x>=1_000_000_000) return qty(x/1_000_000_000)+' میلیارد ریال';
  if(x>=1_000_000) return qty(x/1_000_000)+' میلیون ریال';
  if(x>=1_000) return qty(x/1_000)+' هزار ریال';
  return money(x);
}
function orderKindLabel(o){return o?.orderType==='STORE'?(o.storeOrderKind==='PARTIAL'?'سفارش جزئی فروشگاه':'سفارش روزانه فروشگاه'):o?.orderType==='REMOTE'?'غیرحضوری':'حضوری'}
function orderKindBadge(o){if(o?.orderType==='STORE')return `<span class="type-chip remote">${orderKindLabel(o)}</span>`;return o?.orderType==='REMOTE'?'<span class="type-chip remote">غیرحضوری</span>':'<span class="type-chip onsite">حضوری</span>'}
function dateLabel(v){ if(!v) return '—'; const parts=String(v).split('-'); if(parts.length!==3)return esc(v); const d=new Date(`${v}T00:00:00`); const p=faDateParts(d,{day:'numeric',month:'long',year:'numeric'}); return [p.day,p.month,p.year].filter(Boolean).join(' '); }
function defaultOrderLine(){return {productId:'',productLabel:'',quickCode:'',requestedQty:'',requestedUnit:'کیلوگرم',description:''}}
function bindOperationLines(prefix, draftKey){
  $$(prefix==='storeedit'?'#modal [data-op-product-search]':'#content [data-op-product-search]').filter(el=>el.dataset.opProductSearch.startsWith(prefix+'-')).forEach(inp=>{
    inp.addEventListener('input',()=>{
      const idx=Number(inp.dataset.opProductSearch.split('-').pop());
      operationProductSearch(idx, inp.value, prefix, draftKey);
    });
  });
  $$(prefix==='storeedit'?'#modal [data-op-qty]':'#content [data-op-qty]').filter(el=>el.dataset.opQty.startsWith(prefix+'-')).forEach(inp=>inp.addEventListener('input',()=>{
    const idx=Number(inp.dataset.opQty.split('-').pop()); app[draftKey][idx].requestedQty=inp.value; updateOpSummary(draftKey, `${prefix}-summary`);
  }));
  $$(prefix==='storeedit'?'#modal [data-op-unit]':'#content [data-op-unit]').filter(el=>el.dataset.opUnit.startsWith(prefix+'-')).forEach(inp=>inp.addEventListener('change',()=>{
    const idx=Number(inp.dataset.opUnit.split('-').pop()); app[draftKey][idx].requestedUnit=inp.value; updateOpSummary(draftKey, `${prefix}-summary`);
  }));
  $$(prefix==='storeedit'?'#modal [data-op-desc]':'#content [data-op-desc]').filter(el=>el.dataset.opDesc.startsWith(prefix+'-')).forEach(inp=>inp.addEventListener('input',()=>{
    const idx=Number(inp.dataset.opDesc.split('-').pop()); app[draftKey][idx].description=inp.value;
  }));
}
// یک مسیر مشترک برای دکمه و میانبر؛ داده‌های ردیف‌های پیشین حفظ می‌شوند.
function addPhoneOrderLine(form, focusProduct = false){
  const rows = app.phoneDraft || (app.phoneDraft = [defaultOrderLine()]);
  if (rows.length >= 100) { toast('حداکثر ۱۰۰ قلم در هر سفارش مجاز است.'); return; }
  const index = rows.length;
  rows.push(defaultOrderLine());
  renderOrderLineArea('phone','phoneDraft');
  if (focusProduct) {
    const next = form?.querySelector(`[data-op-product-search="phone-${index}"]`);
    if (next) { next.focus(); next.scrollIntoView?.({block:'nearest'}); }
  }
}
// در سفارش تلفنی Enter سفارش را ثبت نمی‌کند؛ Insert همچنان قلم تازه می‌افزاید.
document.addEventListener('keydown', e => {
  if (e.isComposing || !(e.target instanceof Element)) return;
  const input = e.target, form = input.closest('#phoneOrderFormV25');
  if (!form) return;
  if (e.key === 'Enter') {
    if (input.tagName === 'TEXTAREA') return;
    if (input.tagName === 'BUTTON' && input.type !== 'submit') return;
    if (['INPUT', 'SELECT', 'BUTTON'].includes(input.tagName)) e.preventDefault();
    return;
  }
  // Insert فیزیکی، Insert صفحه‌کلید عددی با Num Lock خاموش و مرورگرهای قدیمی؛
  // عدد صفر با Num Lock روشن و میانبرهای کپی/چسباندن نباید تغییر کنند.
  const isInsert = e.key === 'Insert' || e.code === 'Insert' || (e.keyCode === 45 && e.key !== '0');
  if (!isInsert || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || input.tagName === 'TEXTAREA') return;
  e.preventDefault();
  if (!e.repeat) addPhoneOrderLine(form, true);
}, true);
// v37.6.0 — ناوبری Enter در فرم سفارش فروشگاه: محصول → مقدار → واحد → توضیح → ردیف جدید
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
  const t = e.target;
  if (!t || !(t instanceof Element)) return;
  const form = t.closest('#storeOrderForm'); if (!form) return;
  const parts = t.dataset.opProductSearch != null ? 'product' : t.dataset.opQty != null ? 'qty' : t.dataset.opUnit != null ? 'unit' : t.dataset.opDesc != null ? 'desc' : null;
  if (!parts) return;
  e.preventDefault();
  if (e.repeat) return;
  const raw = t.dataset.opProductSearch || t.dataset.opQty || t.dataset.opUnit || t.dataset.opDesc;
  const idx = Number(String(raw).split('-').pop());
  const focusRow = (rowIdx, sel) => {
    const el = [...form.querySelectorAll(sel)].find((x) => (x.dataset.opProductSearch || x.dataset.opQty || x.dataset.opUnit || x.dataset.opDesc) === `store-${rowIdx}`);
    if (el) { el.focus(); el.select?.(); el.scrollIntoView?.({ block: 'nearest' }); }
    return el;
  };
  if (parts === 'product') {
    const box = form.querySelector(`[data-op-suggest="store-${idx}"], [data-suggest-for="store-${idx}"]`);
    const first = box?.querySelector('.op-product-option, .product-option, button:not([disabled])');
    if (first && !t.dataset.opProductPicked) first.click();
    if (!(app.storeDraft || [])[idx]?.productId) return toast('ابتدا محصولی از فهرست انتخاب کنید.');
    setTimeout(() => focusRow(idx, '[data-op-qty]'), 60);
  } else if (parts === 'qty') { focusRow(idx, '[data-op-unit]'); }
  else if (parts === 'unit') { focusRow(idx, '[data-op-desc]'); }
  else if (parts === 'desc') {
    if (focusRow(idx + 1, '[data-op-product-search]')) return;
    document.querySelector('[data-action="store-add-line"]')?.click();
    setTimeout(() => focusRow(idx + 1, '[data-op-product-search]'), 80);
  }
});
// v37.40.0 — ناوبری Enter در فرم سفارش حضوری فروش (مانند کارتابل فروشگاه):
// محصول ← مقدار ← واحد ← توضیحات ← افزودن قلم و تمرکز روی محصول ردیف تازه
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
  const t = e.target;
  if (!t || !(t instanceof Element)) return;
  const lines = t.closest('#orderLines'); if (!lines) return;
  const field = t.dataset.productSearch != null ? 'product'
    : t.dataset.qty != null ? 'qty'
    : t.dataset.unit != null ? 'unit'
    : t.dataset.description != null ? 'desc' : null;
  if (!field) return;
  e.preventDefault();
  if (e.repeat) return;
  const idx = String(t.dataset.productSearch ?? t.dataset.qty ?? t.dataset.unit ?? t.dataset.description);
  const rowKey = (x) => String(x.dataset.productSearch ?? x.dataset.qty ?? x.dataset.unit ?? x.dataset.description);
  const focusField = (sel, rowIdx) => {
    const el = [...lines.querySelectorAll(sel)].find((x) => rowKey(x) === String(rowIdx));
    if (el) { el.focus(); el.select?.(); el.scrollIntoView?.({ block: 'nearest' }); }
    return el;
  };
  if (field === 'product') {
    const box = lines.querySelector(`[data-suggest-for="${idx}"]`);
    const first = box?.querySelector('.product-option:not([disabled])');
    const row = (app.orderDraft || [])[Number(idx)];
    if (first && !(row && row.productId)) first.click();
    if (!(app.orderDraft || [])[Number(idx)]?.productId) return toast('ابتدا محصولی از فهرست انتخاب کنید.');
    // فوکوس تأخیری فقط شبکهٔ اطمینان است؛ اگر کاربر تا آن لحظه جلو رفته باشد دست نمی‌خورد
    setTimeout(() => { const a = document.activeElement; if (!a || a === document.body || a.dataset?.productSearch === idx) focusField('[data-qty]', idx); }, first ? 90 : 10);
  } else if (field === 'qty') { focusField('[data-unit]', idx); }
  else if (field === 'unit') { focusField('[data-description]', idx); }
  else if (field === 'desc') {
    if (focusField('[data-product-search]', Number(idx) + 1)) return;
    document.querySelector('[data-action="add-line"]')?.click();
    setTimeout(() => {
      const a = document.activeElement;
      if (a && a !== document.body && a.dataset?.productSearch == null) return;
      const inputs = lines.querySelectorAll('[data-product-search]');
      const last = inputs[inputs.length - 1];
      if (last) { last.focus(); last.scrollIntoView?.({ block: 'nearest' }); }
    }, 90);
  }
});
// ناوبری مشترک ردیف‌ها در غیرحضوری، آتی و فرم‌های ویرایش سفارش.
// انتخاب پیشنهادها در handler جست‌وجوی محصول در فاز capture انجام می‌شود.
document.addEventListener('keydown', e => {
  if(e.key!=='Enter' || e.isComposing || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || !(e.target instanceof Element))return;
  const t=e.target, ds=t.dataset;
  let root, index, field, attrs, button, row;
  const op=ds.opProductSearch ?? ds.opQty ?? ds.opUnit ?? ds.opDesc;
  if(op!=null){
    const m=String(op).match(/^(phone|future|storeedit)-(\d+)$/);if(!m)return;
    const prefix=m[1];index=Number(m[2]);
    const config={phone:['#phoneOrderFormV25','phoneDraft','[data-action="phone-add-line"]'],future:['#futureOrderFormV25','futureDraft','[data-action="future-add-line"]'],storeedit:['#storeOrderEditForm','storeEditDraft','#storeEditAdd']}[prefix];
    root=t.closest(config[0]);if(!root)return;
    field=ds.opProductSearch!=null?'product':ds.opQty!=null?'qty':ds.opUnit!=null?'unit':'desc';
    attrs={product:'data-op-product-search',qty:'data-op-qty',unit:'data-op-unit',desc:'data-op-desc',value:i=>`${prefix}-${i}`};
    button=root.querySelector(config[2]);row=app[config[1]]?.[index];
  }else{
    const returned=t.closest('#returnedEditLines'), store=t.closest('#salesStoreEditLines');
    if(!returned&&!store)return;
    root=returned||store;const p=returned?'return':'ss';
    const vals=returned?[ds.returnProductSearch,ds.returnQty,ds.returnUnit,ds.returnDescription]:[ds.ssProductSearch,ds.ssQty,ds.ssUnit,ds.ssDescription];
    const k=vals.findIndex(v=>v!=null);if(k<0)return;
    field=['product','qty','unit','desc'][k];index=Number(vals[k]);
    attrs={product:`data-${p}-product-search`,qty:`data-${p}-qty`,unit:`data-${p}-unit`,desc:`data-${p}-description`,value:i=>String(i)};
    button=root.closest('.returned-editor')?.querySelector(returned?'[data-action="returned-add-line"]':'[data-action="sales-store-add-line"]');
    row=returned?app.returnEdit?.items?.[index]:app.salesStoreEdit?.items?.[index];
  }
  if(!Number.isInteger(index)||!row)return;
  e.preventDefault();if(e.repeat)return;
  const focus=(name,i)=>{const el=root.querySelector(`[${attrs[name]}="${attrs.value(i)}"]`);if(el){el.focus();if(name!=='unit')el.select?.();el.scrollIntoView?.({block:'nearest'});}return el;};
  if(field==='product'){
    if(row.productId)focus('qty',index);else toast('ابتدا محصولی از فهرست انتخاب کنید.');
  }else if(field==='qty')focus('unit',index);
  else if(field==='unit')focus('desc',index);
  else if(!focus('product',index+1)){
    if(!button)return;
    button.click();
    // همهٔ دکمه‌های افزودن از همان مسیر معمول فرم و اعتبارسنجی آن استفاده می‌کنند.
    focus('product',index+1);
  }
});
