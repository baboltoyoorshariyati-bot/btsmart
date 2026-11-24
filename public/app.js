const WEIGHBRIDGE_CARTABLE_ENABLED=false; // غیرفعال تا اصلاح کامل فرم توزین
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
function storeDisplayName(value,branchNo){
 const normalized=String(value||'').normalize('NFKC').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\u200e\u200f]/g,' ').replace(/[‐‑‒–—-]/g,' ').replace(/\s+/g,' ').trim();
 let rest=normalized.replace(/^(?:فروشگاه\s+)+/,'').trim();const match=rest.match(/^شعبه(?:\s+([0-9]+))?(?:\s+|$)/),parsed=Number(branchNo??match?.[1]??''),number=Number.isInteger(parsed)&&parsed>0?parsed:null;
 if(match)rest=rest.slice(match[0].length).trim();const place=rest.replace(/^بابل\s+طیور\s+/,'').trim();
 if(place==='حمزه کلا'&&(number===null||number===1))return 'فروشگاه شعبه 1 حمزه کلا';
 return ['فروشگاه',number?'شعبه '+number:'',rest].filter(Boolean).join(' ');
}
function storeAwareOrderName(o){return o?.orderType==='STORE'?storeDisplayName(o.storeName||'فروشگاه',o.branchNo):(o?.customer?.name||o?.storeName||'—')}
function storeAwareOrderPhone(o){return o?.orderType==='STORE'?'':(o?.customer?.phone||'—')}
function settlementMethodLabel(method){
 const m=method||{},type=String(m.type||'').toUpperCase(),labels={CASH:'نقدی',POS:'پوز',CARD_TRANSFER:'کارت‌به‌کارت',CHECK:'چک',CREDIT:'معوق'};
 return type==='POS'?['پوز',m.deviceSnapshot?.bank,m.deviceSnapshot?.terminalNumber].filter(Boolean).join(' '):(labels[type]||type||'نامشخص');
}
function canSalesEditRemote(o){return o?.orderType==='REMOTE'&&['SCHEDULED_REMOTE','WAREHOUSE_PENDING'].includes(o.status)&&!o.warehouseAcceptedAt&&!o.pickupHandover&&!Object.keys(o.transportHandovers||{}).length;}
// Shared compact order row. Callers supply only trusted markup for status and actions;
// customer data and labels are escaped here. A store service remains a separate row.
function orderSummaryRow(o,opts={}){
 const cell=(content,cls='')=>`<span class="order-summary-cell ${cls}">${content}</span>`;
 const name=opts.name??storeAwareOrderName(o),number=opts.orderNo??o.orderNo??'—',date=opts.createdAt??o.createdAt;
 const identity=`<strong>${esc(name||'—')}</strong>${opts.identityDetail?`<small>${esc(opts.identityDetail)}</small>`:''}`;
 const extras=(opts.extras||[]).filter(x=>x&&x.html).map(x=>cell(x.html,x.className||'')).join('');
 const itemCount=opts.itemCount===undefined?'':cell(`${qty(opts.itemCount)} قلم`,'order-summary-count');
 const status=opts.statusHtml?cell(opts.statusHtml,'order-summary-status'):'';
 const actions=opts.actionsHtml?cell(opts.actionsHtml,'order-summary-actions'):'';
 const contents=cell(identity,'order-summary-identity')+cell(`شماره سفارش ${esc(fa(number))}`,'order-code')+cell(`تاریخ ${esc(formatDateTime24(date))}`,'order-summary-date')+status+itemCount+extras+actions;
 const classes=`order-summary-row ${opts.className||''}`;
 if(opts.selectable)return `<button type="button" class="${classes}" data-stl="select" data-id="${esc(o.id)}">${contents}</button>`;
 return `<article class="${classes}" data-order="${esc(o.id)}">${contents}</article>`;
}

const app = {
  salesStoreTab: 'incoming',
  salesDeliveryTab: 'assigned',
  salesDeliveryHistoryOffset: 0,
  user: null,
  page: 'dashboard',
  sub: { gate:'entry', sales:'dashboard', warehouse:'dashboard', drivers:'dashboard', store:'dashboard' },
  timer: null,
  warehouseOpenId: null,
  orderDraft: [],
  returnEdit: null,
  settleDraft: null,
  customerMatches: [],
  selectedSettlement: null,
  settlementFingerprintRef: '',
  settlementNoFingerprintAllowed: true,
  selectedWarehouse: null,
  workload: {},
  indicatorTimer: null,
  plate: {a:'',letter:'ب',c:'',province:''}
};

const ICONS = {
  dashboard:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  gate:'<path d="M4 18V9l8-5 8 5v9"/><path d="M7 18v-5h10v5"/><path d="M3 18h18"/>',
  sales:'<path d="M5 5h14l-1.5 8.5H7L5 5Z"/><path d="M8 9h8M10 17h.01M16 17h.01"/><circle cx="10" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/>',
  warehouse:'<path d="m3 9 9-5 9 5"/><path d="M4 9h16v10H4z"/><path d="M8 19v-6h8v6"/>',
  store:'<path d="M4 7 5.5 3h13L20 7"/><path d="M4 7h16v14H4z"/><path d="M10 21v-7h4v7"/>', // v37.6.0
  reports:'<path d="M5 19V10M12 19V5M19 19v-7"/><path d="M3 19h18"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.8 1.8 0 0 0 .3 2l.1.1-1.8 1.8-.1-.1a1.8 1.8 0 0 0-2-.3 1.8 1.8 0 0 0-1.1 1.7V21h-2.5v-.2a1.8 1.8 0 0 0-1.1-1.7 1.8 1.8 0 0 0-2 .3l-.1.1-1.8-1.8.1-.1a1.8 1.8 0 0 0 .3-2A1.8 1.8 0 0 0 6 14.5H5.8V12H6a1.8 1.8 0 0 0 1.7-1.1 1.8 1.8 0 0 0-.3-2l-.1-.1 1.8-1.8.1.1a1.8 1.8 0 0 0 2 .3A1.8 1.8 0 0 0 12.5 6v-.2H15V6a1.8 1.8 0 0 0 1.1 1.7 1.8 1.8 0 0 0 2-.3l.1-.1L20 9.1l-.1.1a1.8 1.8 0 0 0-.3 2 1.8 1.8 0 0 0 .2 0Z"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.3 3.5-6 8-6s7.2 1.7 8 6"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M2.5 20c.6-3.4 2.8-5 6.5-5"/><circle cx="17" cy="9" r="2.5"/><path d="M14 15c2.8.1 5.3 1.6 6 5"/>',
  lock:'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 6.5-3 7-3 9h18c0-2-3-2.5-3-9Z"/><path d="M10 21h4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
  phone:'<path d="M7 4h3l1.2 4-2 1.3a13 13 0 0 0 5.5 5.5L16 13l4 1.2v3c0 1.1-.9 2-2 2C10.3 19.2 4.8 13.7 4.8 6c0-1.1.9-2 2.2-2Z"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  send:'<path d="m3 11 18-8-8 18-2-7-8-3Z"/><path d="m11 14 4-4"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  edit:'<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.5 6.5 3 3"/>',
  receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  scale:'<path d="M12 3v18M5 7h14M7 7 4 12h6L7 7Zm10 0-3 5h6l-3-5Z"/>',
  truck:'<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  fingerprint:'<path d="M7 10a5 5 0 0 1 10 0v2M5 12v-2a7 7 0 0 1 14 0v3M9 12v-2a3 3 0 0 1 6 0v2M8 15c.3 2.3-.2 4-1.6 5.5M12 14v6M16 14c0 2-.2 3.8.9 5.5"/>',
  logout:'<path d="M13 5h7v14h-7"/><path d="M17 12H5"/><path d="m9 8-4 4 4 4"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 8h.01"/>',
  refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  // v37.10.0 — آیکن‌های موضوعی نوار کناری و کارت‌های داشبورد (بر اساس موضوع هر بخش)
  entry:'<path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/><path d="M3 12h11"/><path d="m10.5 7.5 4.5 4.5-4.5 4.5"/>',
  exitDoor:'<path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5"/><path d="M21 12H10"/><path d="m14.5 7.5-4.5 4.5 4.5 4.5"/>',
  history:'<path d="M4.5 6.8A8.5 8.5 0 1 1 3.6 15"/><path d="M3.5 3.8v5h5"/><path d="M12 7.5V12l3.2 2"/>',
  inbox:'<path d="M4.5 13 6.2 5h11.6l1.7 8"/><path d="M4.5 13h4.7l1.3 2.2h3L14.8 13h4.7v5.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1Z"/>',
  package:'<path d="m12 3 8 4.3v9.4L12 21l-8-4.3V7.3Z"/><path d="m4.3 7.5 7.7 4.2 7.7-4.2"/><path d="M12 11.7V21"/><path d="m8 5.2 7.7 4.2"/>',
  pos:'<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7"/><path d="M8.6 11.6h.01M12 11.6h.01M15.4 11.6h.01M8.6 15h.01M12 15h.01M15.4 15h.01M8.6 18.4h.01M12 18.4h.01M15.4 18.4h.01"/>',
  shield:'<path d="M12 3 5 5.7v5.5c0 4.4 2.9 7.6 7 9.3 4.1-1.7 7-4.9 7-9.3V5.7Z"/><path d="m9 11.6 2.2 2.2 4.3-4.6"/>',
  driver:'<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="2.6"/><path d="M12 14.6V20M9.8 10.3 4.2 9.2M14.2 10.3l5.6-1.1"/>',
  route:'<circle cx="6" cy="19" r="2.4"/><circle cx="18" cy="5" r="2.4"/><path d="M8.4 19H15a3 3 0 0 0 0-6h-6a3 3 0 0 1 0-6h.9"/>',
  flow:'<path d="M4 7.5h10.5"/><path d="m11.5 4 3.5 3.5L11.5 11"/><path d="M20 16.5H9.5"/><path d="m12.5 13-3.5 3.5 3.5 3.5"/>',
  activity:'<path d="M3.5 12h3.6l2.3-6.2 4 12.4 2.4-6.2h4.7"/>',
  clipboard:'<rect x="6" y="4.8" width="12" height="16.2" rx="2"/><path d="M9.2 4.8A2.8 2.8 0 0 1 12 3a2.8 2.8 0 0 1 2.8 1.8"/><path d="M9.5 12h5M9.5 15.8h5"/>'
};
const ROLE={admin:'مدیر سیستم',gate:'نگهبانی',sales:'فروش',warehouse:'انبار',store:'فروشگاه',dispatch:'واحد پخش',driver:'راننده'};
const STATUS={STORE_PENDING_SALES:['در انتظار تایید فروش','orange'],SCHEDULED_REMOTE:['برنامه‌ریزی‌شده','purple'],WAITING_SALES:['در انتظار فروش','orange'],PICKUP_PRESENT:['حاضر برای تحویل','purple'],ORDERED:['ثبت سفارش شد','blue'],CANCELLED_EXIT_PENDING:['لغو؛ در انتظار خروج بدون کالا','orange'],WAREHOUSE_PENDING:['در صف انبار','orange'],WAREHOUSE_PREPARING:['در حال آماده‌سازی','purple'],SETTLEMENT_PENDING:['آماده تسویه','blue'],CANCEL_RETURN_PENDING:['انصراف؛ در انتظار تأیید انبار','orange'],SETTLED:['آماده خروج','green'],EXITED:['خروج ثبت شد','green'],OUT_OF_STOCK:['عدم موجودی','red'],RETURNED_TO_SALES:['برگشت به فروش','orange'],CANCELLED:['انصراف','gray'],DELIVERED:['تحویل کامل','green'],PENDING:['در انتظار','gray']};

function icon(name,size=20){return `<svg class="svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]||ICONS.info}</svg>`}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function money(v){return new Intl.NumberFormat('fa-IR').format(Math.round(Number(v||0)))+' ریال'}
function qty(v){return new Intl.NumberFormat('fa-IR',{maximumFractionDigits:3}).format(Number(v||0))}
function n(v){const s=String(v??'').replace(/[۰-۹٠-٩]/g,d=>({'۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'})[d]);return Number(s.replace(/[^0-9.\-]/g,''))||0}
function formatPriceInput(v){const raw=String(v??'').replace(/[^0-9]/g,'');if(!raw)return '';const clean=raw.replace(/^0+(?=\d)/,'');return Number(clean||0).toLocaleString('fa-IR')}
function formatRial(v){ const s=en(String(v||'')).replace(/[^0-9]/g,''); if(!s) return ''; return new Intl.NumberFormat('fa-IR').format(Number(s)); }
function parseRial(v){ return Number(en(String(v||'')).replace(/[^0-9]/g,'')||0); }
function bindRialInputs(root=document){
  $$('[data-rial], input[name="price"][type="text"]', root).forEach(inp=>{
    if(inp.dataset.rialBound) return; inp.dataset.rialBound='1';
    const sync=()=>{
      const start=inp.selectionStart, beforeLen=inp.value.length;
      const num=parseRial(inp.value);
      inp.value = num ? formatRial(num) : '';
      const afterLen=inp.value.length;
      const delta=afterLen-beforeLen;
      try{ const pos=(start||0)+delta; inp.setSelectionRange(pos,pos); }catch{}
    };
    inp.addEventListener('input', sync);
    inp.addEventListener('blur', ()=>{ const n=parseRial(inp.value); inp.value = n ? formatRial(n) : ''; });
    if(inp.value) inp.value = formatRial(parseRial(inp.value));
  });
}

/* v37.3.1 — تشخیص کلیک داخل پاپ‌آپ. پاپ‌آپ‌ها هنگام کلیک روی روز/ماه innerHTML خود را بازسازی
   می‌کنند؛ دکمهٔ کلیک‌شده از DOM جدا می‌شود و pop.contains(e.target) نادرست «بیرون» تشخیص می‌داد
   و پاپ‌آپ بسته می‌شد. composedPath مسیر لحظهٔ کلیک را نگه می‌دارد. */
function clickInside(e, el){ if(!el) return false; try{ const path=e.composedPath?e.composedPath():null; if(path&&path.length) return path.includes(el); }catch(_){} return el.contains(e.target); }
function pad2(v){return String(v).padStart(2,'0')}
/* v37.43.0 — ساعت و تاریخ سامانه از سرور می‌آید، نه از ساعت دستگاه کاربر؛ اختلاف ساعت
   سرور با دستگاه یک‌بار سنجیده می‌شود و همهٔ نمایش‌ها و پیش‌فرض‌های «امروز» با ساعت سرور
   کار می‌کنند تا ساعت اشتباه یک دستگاه باعث تداخل نشود. */
let serverTimeOffsetMs=0, serverTzOffsetMin=null, serverTimeSynced=false;
function serverEpoch(){return Date.now()+serverTimeOffsetMs}
function serverNow(){const e=serverEpoch();if(serverTzOffsetMin==null)return new Date(e);return new Date(e+(serverTzOffsetMin-(-new Date(e).getTimezoneOffset()))*60000)}
async function syncServerTime(){try{const t0=Date.now();const r=await fetch('/api/server-time',{cache:'no-store'});if(!r.ok)return;const j=await r.json();const t1=Date.now();if(!j||!Number.isFinite(j.epochMs))return;serverTimeOffsetMs=j.epochMs-Math.round((t0+t1)/2);if(Number.isFinite(j.tzOffsetMinutes))serverTzOffsetMin=j.tzOffsetMinutes;serverTimeSynced=true;railClockTick();}catch(_){/* آفلاین: موقتاً ساعت دستگاه */}}
function today(){const d=serverNow();return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`}
/* v37.3 — قالب یکدست تاریخ شمسی (ICU مرورگرها ترتیب و جداکنندهٔ ناهماهنگ «۱۴۰۵ مهر ۲۱, سه‌شنبه» تولید می‌کند) */
function faDateParts(d,opts){const o={};try{new Intl.DateTimeFormat('fa-IR-u-ca-persian-nu-arabext',opts).formatToParts(d).forEach(p=>{if(p.type!=='literal')o[p.type]=p.value})}catch(e){}return o}
function todayText(){const p=faDateParts(serverNow(),{weekday:'long',day:'numeric',month:'long',year:'numeric'});return [p.weekday,p.day,p.month,p.year].filter(Boolean).join(' ')}
/* v37.3.3 — ساعت و تاریخ ستون کناری (زیر لوگو). هر دقیقه دقیقاً سر دقیقه به‌روز می‌شود. */
function railClockTick(){
  const d=serverNow();
  const p=faDateParts(d,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const t=document.getElementById('railTime'); if(t) t.textContent=fa(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
  const w=document.getElementById('railWeekday'); if(w) w.textContent=p.weekday||'';
  const c=document.getElementById('currentDate');
  if(c){ if(p.day&&p.month&&p.year) c.innerHTML=`<span class="rc-dm">${esc(p.day+' '+p.month)}</span> <span class="rc-y">${esc(p.year)}</span>`; else c.textContent=todayText(); }
}
function startRailClock(){
  railClockTick();
  if(app.clockTimer) return;
  const next=()=>{ railClockTick(); app.clockTimer=setTimeout(next, 60000-(Date.now()%60000)+30); };
  app.clockTimer=setTimeout(next, 60000-(Date.now()%60000)+30);
}
function toAsciiDigits(v=''){return String(v).replace(/[۰-۹٠-٩]/g,d=>{const a='۰۱۲۳۴۵۶۷۸۹',b='٠١٢٣٤٥٦٧٨٩';const i=a.indexOf(d);return i>-1?String(i):String(Math.max(0,b.indexOf(d)));})}
function div(a,b){return Math.floor(a/b)}
function gregorianToJalali(gy,gm,gd){
  let gYear=gy-1600,gMonth=gm-1,gDay=gd-1; const gDayNo=365*gYear+div(gYear+3,4)-div(gYear+99,100)+div(gYear+399,400);
  const gmd=[31,28,31,30,31,30,31,31,30,31,30,31]; let dayNo=gDayNo; for(let i=0;i<gMonth;i++) dayNo+=gmd[i]; if(gMonth>1 && ((gy%4===0&&gy%100!==0)||(gy%400===0))) dayNo++; dayNo+=gDay;
  let jDayNo=dayNo-79; const jNp=div(jDayNo,12053); jDayNo%=12053; let jy=979+33*jNp+4*div(jDayNo,1461); jDayNo%=1461; if(jDayNo>=366){jy+=div(jDayNo-1,365);jDayNo=(jDayNo-1)%365;} let jm=jDayNo<186?1+div(jDayNo,31):7+div(jDayNo-186,30); let jd=1+(jDayNo<186?jDayNo%31:(jDayNo-186)%30); return [jy,jm,jd];
}
function jalaliToGregorian(jy,jm,jd){
  const jy2=jy-979,jm2=jm-1,jd2=jd-1; let jDayNo=365*jy2+div(jy2,33)*8+div((jy2%33)+3,4); for(let i=0;i<jm2;i++) jDayNo+=i<6?31:30; jDayNo+=jd2; let gDayNo=jDayNo+79; let gy=1600+400*div(gDayNo,146097); gDayNo%=146097; let leap=true; if(gDayNo>=36525){gDayNo--; gy+=100*div(gDayNo,36524); gDayNo%=36524; if(gDayNo>=365)gDayNo++; else leap=false;} gy+=4*div(gDayNo,1461); gDayNo%=1461; if(gDayNo>=366){leap=false;gDayNo--;gy+=div(gDayNo,365);gDayNo%=365;} let gm=0; const gdms=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31]; while(gDayNo>=gdms[gm])gDayNo-=gdms[gm++]; return [gy,gm+1,gDayNo+1];
}
function isoToJalali(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||'')))return '';const [y,m,d]=String(v).split('-').map(Number);const [jy,jm,jd]=gregorianToJalali(y,m,d);return `${jy}/${pad2(jm)}/${pad2(jd)}`}
function jalaliToIso(v){const s=toAsciiDigits(String(v||'')).trim().replace(/[.\-\\]/g,'/'); const m=s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/); if(!m)return ''; const jy=Number(m[1]),jm=Number(m[2]),jd=Number(m[3]); if(jm<1||jm>12||jd<1||jd>31)return ''; const [gy,gm,gd]=jalaliToGregorian(jy,jm,jd); const back=gregorianToJalali(gy,gm,gd); if(back[0]!==jy||back[1]!==jm||back[2]!==jd)return ''; return `${gy}-${pad2(gm)}-${pad2(gd)}`}
function normalizeJalaliText(v){return toAsciiDigits(v).replace(/[^0-9\/]/g,'').slice(0,10).replace(/(\d{4})(\d)/,'$1/$2').replace(/(\d{4}\/\d{2})(\d)/,'$1/$2')}
function bindJalaliDates(root=document){
  $$('.jalali-date-input',root).forEach(input=>{
    const target=input.dataset.target; const hidden=target?root.querySelector(`[name=\"${target}\"]`):null;
    if(!hidden)return;
    const sync=()=>{input.value=normalizeJalaliText(input.value); const iso=jalaliToIso(input.value); hidden.value=iso; input.classList.toggle('invalid',!!input.value&&!iso)};
    input.addEventListener('input',sync); input.addEventListener('blur',sync); sync();
    const todayBtn=root.querySelector(`[data-date-today=\"${target}\"]`); if(todayBtn)todayBtn.addEventListener('click',()=>{input.value=isoToJalali(today());sync();input.focus();});
  });
}
function jalaliInput(label,target,isoValue=today(),required=true){const j=isoToJalali(isoValue);return `<div class=\"field jalali-field\"><label>${esc(label)}</label><div class=\"input-shell op-input jalali-shell\"><span>${icon('calendar',17)}</span><input class=\"jalali-date-input\" aria-label=\"${esc(label)}\" data-target=\"${esc(target)}\" value=\"${esc(j)}\" placeholder=\"۱۴۰۵/۰۷/۱۴\" inputmode=\"numeric\" autocomplete=\"off\" ${required?'required':''}><button type=\"button\" class=\"date-today-btn\" data-date-today=\"${esc(target)}\">امروز</button></div><input type=\"hidden\" name=\"${esc(target)}\" value=\"${esc(isoValue)}\" ${required?'required':''}></div>`}

/* ---------- تقویم جلالی تعاملی و انتخاب‌گر ساعت ---------- */
const JALALI_MONTHS=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const JALALI_WEEKDAYS=['ش','ی','د','س','چ','پ','ج'];
function isJalaliLeap(jy){
  const [gy1,gm1,gd1]=jalaliToGregorian(jy,1,1);
  const [gy2,gm2,gd2]=jalaliToGregorian(jy+1,1,1);
  const d1=new Date(gy1,gm1-1,gd1), d2=new Date(gy2,gm2-1,gd2);
  return Math.round((d2-d1)/86400000)===366;
}
function jalaliMonthLen(jy,jm){
  if(jm<=6) return 31;
  if(jm<=11) return 30;
  return isJalaliLeap(jy)?30:29;
}
function jalaliWeekday(jy,jm,jd){
  const [gy,gm,gd]=jalaliToGregorian(jy,jm,jd);
  const d=new Date(gy,gm-1,gd);
  return (d.getDay()+1)%7; // 0=شنبه
}
function getJalaliToday(){
  const now=serverNow(); return gregorianToJalali(now.getFullYear(), now.getMonth()+1, now.getDate());
}
let _jalaliCalState=null;
function ensureJalaliCalendar(){
  let el=document.getElementById('jalaliCalendarPopover');
  if(el) return el;
  el=document.createElement('div'); el.id='jalaliCalendarPopover'; el.className='jalali-calendar-popover';
  el.style.display='none'; document.body.appendChild(el);
  // close on outside click
  document.addEventListener('click', (e)=>{
    const pop=document.getElementById('jalaliCalendarPopover');
    if(!pop || pop.style.display==='none') return;
    if(clickInside(e,pop)) return;
    if(e.target.closest('.jalali-date-input') || e.target.closest('.date-today-btn') || e.target.closest('.jalali-calendar-popover')) return;
    closeJalaliCalendar();
  });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeJalaliCalendar(); });
  return el;
}
function closeJalaliCalendar(){
  const el=document.getElementById('jalaliCalendarPopover');
  if(el) el.style.display='none';
  _jalaliCalState=null;
}
function renderJalaliCalendar(jy,jm,selectedIso){
  const todayJ=getJalaliToday();
  const monthLen=jalaliMonthLen(jy,jm);
  const firstWD=jalaliWeekday(jy,jm,1);
  const monthName=JALALI_MONTHS[jm-1]||'';
  let selectedJ=null;
  if(selectedIso && /^\d{4}-\d{2}-\d{2}$/.test(selectedIso)){
    const [sy,sm,sd]=selectedIso.split('-').map(Number);
    const [sj,smj,sdj]=gregorianToJalali(sy,sm,sd);
    selectedJ=[sj,smj,sdj];
  }
  let h=`<div class="jalali-cal-head">`;
  h+=`<div class="jalali-cal-nav"><button type="button" data-cal="prev" aria-label="ماه قبل">${icon('arrow',16)}</button></div>`;
  h+=`<div class="jalali-cal-title">${esc(monthName)} ${fa(jy)}</div>`;
  h+=`<div class="jalali-cal-nav"><button type="button" data-cal="next" class="is-next" aria-label="ماه بعد">${icon('arrow',16)}</button></div></div>`;
  // weekdays header - note icon arrow rotated? we swap prev/next for RTL
  h+=`<div class="jalali-cal-weekdays">`+JALALI_WEEKDAYS.map((w,i)=>`<span class="${i===6?'is-fri':''}">${w}</span>`).join('')+`</div>`;
  h+=`<div class="jalali-cal-grid">`;
  for(let i=0;i<firstWD;i++){
    h+=`<span class="jalali-cal-day is-other" style="visibility:hidden"></span>`;
  }
  for(let d=1; d<=monthLen; d++){
    const wd=jalaliWeekday(jy,jm,d);
    const [gy,gm,gd]=jalaliToGregorian(jy,jm,d);
    const iso=`${gy}-${pad2(gm)}-${pad2(gd)}`;
    const isToday=(jy===todayJ[0] && jm===todayJ[1] && d===todayJ[2]);
    const isSelected=selectedJ && selectedJ[0]===jy && selectedJ[1]===jm && selectedJ[2]===d;
    const isFri=(wd===6);
    h+=`<button type="button" class="jalali-cal-day ${isToday?'is-today':''} ${isSelected?'is-selected':''} ${isFri?'is-fri':''}" data-iso="${esc(iso)}" data-jalali="${jy}/${pad2(jm)}/${pad2(d)}">${fa(d)}</button>`;
  }
  // trailing to fill row? add blanks to complete 42 cells for consistent height
  const total=firstWD+monthLen;
  const rem=(7 - (total%7))%7;
  for(let i=0;i<rem;i++) h+=`<span class="jalali-cal-day is-other" style="visibility:hidden"></span>`;
  h+=`</div>`;
  h+=`<div class="jalali-cal-foot"><button type="button" class="jalali-today-btn" data-cal="today">امروز (${fa(isoToJalali(today()))})</button><button type="button" class="btn btn-secondary btn-sm" data-cal="close">بستن</button></div>`;
  return h;
}
function positionPopover(pop, anchor){
  const rect=anchor.getBoundingClientRect();
  const vw=window.innerWidth, vh=window.innerHeight;
  const pw=pop.offsetWidth||320, ph=pop.offsetHeight||360;
  let top=rect.bottom+8, left=rect.left;
  // keep inside viewport horizontally (RTL: anchor left may be near right)
  if(left+pw > vw-12) left=vw - pw -12;
  if(left<12) left=12;
  if(top+ph > vh-12){
    top=rect.top - ph -8;
    if(top<12) top=12;
  }
  pop.style.top=top+ 'px';
  pop.style.left=left+'px';
}
function openJalaliCalendar(input){
  if(!input) return;
  const target=input.dataset.target;
  const hidden=target?(input.closest('form')?.querySelector(`[name="${CSS.escape(target)}"]`) || document.querySelector(`[name="${CSS.escape(target)}"]`)):null;
  // fallback hidden near input
  const hidden2=hidden || input.closest('.jalali-field')?.querySelector('input[type="hidden"]');
  const hiddenInput=hidden||hidden2;
  let iso=(hiddenInput?.value||'').trim();
  // if no iso, try parse input value
  if(!iso && input.value){
    const parsed=jalaliToIso(input.value);
    if(parsed) iso=parsed;
  }
  let jy,jm;
  if(iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)){
    const [gy,gm,gd]=iso.split('-').map(Number);
    const j=gregorianToJalali(gy,gm,gd);
    jy=j[0]; jm=j[1];
  } else {
    const t=getJalaliToday();
    jy=t[0]; jm=t[1];
  }
  _jalaliCalState={jy,jm,input,hiddenInput,selectedIso:iso};
  const pop=ensureJalaliCalendar();
  pop.innerHTML=renderJalaliCalendar(jy,jm,iso);
  pop.style.display='block';
  pop.classList.add('show');
  // measure after render for positioning
  requestAnimationFrame(()=>positionPopover(pop, input));
  // رویدادها via delegation (کلیک روز یا ناوبری ماه)
  pop.onclick=(e)=>{
    const t=e.target.closest('[data-cal]');
    if(t){
      const cmd=t.dataset.cal;
      if(cmd==='prev'){
        let njm=_jalaliCalState.jm-1, njy=_jalaliCalState.jy;
        if(njm<1){ njm=12; njy--; }
        _jalaliCalState.jy=njy; _jalaliCalState.jm=njm;
        pop.innerHTML=renderJalaliCalendar(njy,njm,_jalaliCalState.selectedIso);
        // re-position
        positionPopover(pop, input);
      } else if(cmd==='next'){
        let njm=_jalaliCalState.jm+1, njy=_jalaliCalState.jy;
        if(njm>12){ njm=1; njy++; }
        _jalaliCalState.jy=njy; _jalaliCalState.jm=njm;
        pop.innerHTML=renderJalaliCalendar(njy,njm,_jalaliCalState.selectedIso);
        positionPopover(pop, input);
      } else if(cmd==='today'){
        const tt=getJalaliToday();
        const [gy,gm,gd]=jalaliToGregorian(tt[0],tt[1],tt[2]);
        const isoToday=`${gy}-${pad2(gm)}-${pad2(gd)}`;
        selectJalaliDate(isoToday, `${tt[0]}/${pad2(tt[1])}/${pad2(tt[2])}`);
      } else if(cmd==='close'){
        closeJalaliCalendar();
      }
      return;
    }
    const day=e.target.closest('.jalali-cal-day[data-iso]');
    if(day){
      selectJalaliDate(day.dataset.iso, day.dataset.jalali);
    }
  };
}
function selectJalaliDate(iso, jalaliStr){
  if(!_jalaliCalState) return;
  const {input, hiddenInput}=_jalaliCalState;
  const jFormatted=jalaliStr.includes('/')? jalaliStr : isoToJalali(iso);
  input.value=jFormatted;
  input.classList.remove('invalid');
  if(hiddenInput) hiddenInput.value=iso;
  // trigger sync events for validation
  input.dispatchEvent(new Event('input', {bubbles:true}));
  input.dispatchEvent(new Event('change', {bubbles:true}));
  if(hiddenInput) hiddenInput.dispatchEvent(new Event('change', {bubbles:true}));
  closeJalaliCalendar();
  // auto-focus time picker if exists in same form (future orders requirement)
  const form=input.closest('form');
  if(form && input.dataset.target!=='deliveryDate'){
    const timeInput=form.querySelector('.time24-input');
    if(timeInput){
      // small delay to let calendar close animation
      setTimeout(()=>openTimePicker(timeInput), 120);
    }
  }
}
// Time picker
let _timePickerState=null;
function ensureTimePicker(){
  let el=document.getElementById('timePickerPopover');
  if(el) return el;
  el=document.createElement('div'); el.id='timePickerPopover'; el.className='time-picker-popover';
  el.style.display='none'; document.body.appendChild(el);
  document.addEventListener('click', (e)=>{
    const pop=document.getElementById('timePickerPopover');
    if(!pop || pop.style.display==='none') return;
    if(clickInside(e,pop)) return;
    if(e.target.closest('.time24-input')) return;
    closeTimePicker();
  });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeTimePicker(); });
  return el;
}
function closeTimePicker(){
  const el=document.getElementById('timePickerPopover');
  if(el) el.style.display='none';
  _timePickerState=null;
}
function renderTimePicker(hour, minute){
  let h=`<div class="time-picker-head"><h4>انتخاب ساعت</h4><span class="tp-now">اکنون: ${fa(now24())}</div>`;
  h+=`<div class="time-picker-display"><b dir="ltr">${pad2(hour)}:${pad2(minute)}</b><span>۲۴ ساعته</span></div>`;
  h+=`<div class="time-picker-grid">`;
  h+=`<div class="time-picker-section"><label>ساعت (۰۰ تا ۲۳)</label><div class="time-picker-hours">`;
  for(let i=0;i<24;i++){
    h+=`<button type="button" data-hour="${i}" class="${i===hour?'is-selected':''}">${fa(i)}</button>`;
  }
  h+=`</div></div>`;
  h+=`<div class="time-picker-section"><label>دقیقه</label><div class="time-picker-mins">`;
  const mins=[0,5,10,15,20,25,30,35,40,45,50,55];
  for(let m of mins){
    h+=`<button type="button" data-minute="${m}" class="${m===minute?'is-selected':''}">${pad2(m)}</button>`;
  }
  h+=`</div></div></div>`;
  h+=`<div class="time-picker-actions"><button type="button" class="btn btn-secondary btn-sm" data-tp="close">انصراف</button><button type="button" class="btn btn-primary btn-sm" data-tp="confirm">تأیید ساعت</button></div>`;
  return h;
}
function openTimePicker(input){
  if(!input) return;
  const raw=normalizeTime24(input.value);
  let hour=8, minute=0;
  const m=raw.match(/^(\d{1,2}):(\d{2})$/);
  if(m){ hour=Math.min(23, Math.max(0, Number(m[1]))); minute=Math.min(59, Math.max(0, Number(m[2]))); }
  _timePickerState={input, hour, minute};
  const pop=ensureTimePicker();
  pop.innerHTML=renderTimePicker(hour, minute);
  pop.style.display='block'; pop.classList.add('show');
  requestAnimationFrame(()=>positionPopover(pop, input));
  pop.onclick=(e)=>{
    const hb=e.target.closest('[data-hour]');
    if(hb){
      const h=Number(hb.dataset.hour);
      _timePickerState.hour=h;
      // به‌جای re-render کامل، فقط نمایش و انتخاب را به‌روز می‌کنیم تا delegation حفظ شود
      const disp=pop.querySelector('.time-picker-display b');
      if(disp) disp.textContent=`${pad2(h)}:${pad2(_timePickerState.minute)}`;
      pop.querySelectorAll('[data-hour]').forEach(b=>b.classList.toggle('is-selected', Number(b.dataset.hour)===h));
      return;
    }
    const mb=e.target.closest('[data-minute]');
    if(mb){
      const mi=Number(mb.dataset.minute);
      _timePickerState.minute=mi;
      pop.querySelectorAll('[data-minute]').forEach(b=>b.classList.toggle('is-selected', Number(b.dataset.minute)===mi));
      const disp=pop.querySelector('.time-picker-display b');
      if(disp) disp.textContent=`${pad2(_timePickerState.hour)}:${pad2(mi)}`;
      return;
    }
    const tp=e.target.closest('[data-tp]');
    if(tp){
      const cmd=tp.dataset.tp;
      if(cmd==='close') closeTimePicker();
      if(cmd==='confirm'){
        const val=`${pad2(_timePickerState.hour)}:${pad2(_timePickerState.minute)}`;
        input.value=val;
        input.classList.remove('invalid');
        input.dispatchEvent(new Event('input', {bubbles:true}));
        input.dispatchEvent(new Event('change', {bubbles:true}));
        closeTimePicker();
      }
    }
  };
  // Also allow direct typing sync: if user types, update picker display
  input.addEventListener('input', function onIn(){
    const r=normalizeTime24(input.value);
    const mm=r.match(/^(\d{1,2}):(\d{2})$/);
    if(mm){
      const h=Math.min(23,Math.max(0,Number(mm[1]))), mi=Math.min(59,Math.max(0,Number(mm[2])));
      _timePickerState.hour=h; _timePickerState.minute=mi;
      const disp=pop.querySelector('.time-picker-display b');
      if(disp) disp.textContent=`${pad2(h)}:${pad2(mi)}`;
      pop.querySelectorAll('[data-hour]').forEach(b=>b.classList.toggle('is-selected', Number(b.dataset.hour)===h));
      // minute may not be in 5-step list, but highlight nearest? keep as is
    }
  }, {once:true});
}
function bindJalaliCalendar(root=document){
  // delegated via document for dynamic content, but also ensure inputs have pointer
  // No per-element binding needed; global document click handles it
}
function bindTimePicker(root=document){
// delegated
}
// Global delegated openers
document.addEventListener('click', (e)=>{
  const jInput=e.target.closest('.jalali-date-input');
  if(jInput){
    // don't open if clicking today button
    if(e.target.closest('[data-date-today]')) return;
    e.preventDefault();
    openJalaliCalendar(jInput);
    return;
  }
  const tInput=e.target.closest('.time24-input');
  if(tInput){
    e.preventDefault();
    openTimePicker(tInput);
  }
});
document.addEventListener('focusin', (e)=>{
  if(e.target.classList.contains('jalali-date-input')){
    // optional: open on focus after short delay for typing
    // we keep click only to avoid annoying typing
  }
});


function jalaliDateTimeInput(label, dateTarget, timeTarget, isoDate, timeVal, required=true){
  const j=isoToJalali(isoDate||today());
  const t=time24(timeVal)==='—'?'08:00':time24(timeVal);
  const display = j ? `${fa(j)} • ${fa(t)}` : '';
  // نمایش ترکیبی با یک کادر واحد — دو hidden برای سازگاری با API
  return `<div class="field jalali-datetime-field" style="grid-column:1/-1"><label>${esc(label)} <span class="subtle" style="font-size:11px;color:var(--brand);font-weight:900">زمان ورود به کارتابل انبار</span></label><div class="input-shell op-input jalali-datetime-shell" data-datetime="${esc(dateTarget)}|${esc(timeTarget)}" tabindex="0" role="button" aria-label="${esc(label)}"><span>${icon('calendar',17)}</span><span class="datetime-display" style="flex:1;text-align:right;font-size:13.5px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${display ? esc(display) : '<span style="color:var(--muted-2);font-weight:600">انتخاب تاریخ و ساعت</span>'}</span><span style="color:var(--muted)">${icon('arrow',14)}</span><input type="hidden" name="${esc(dateTarget)}" value="${esc(isoDate||'')}"><input type="hidden" name="${esc(timeTarget)}" value="${esc(t)}"></div><small class="field-hint">یک کادر واحد — با یک کلیک تاریخ و ساعت را انتخاب کنید</small></div>`;
}
/* ---------- پاپ‌آپ ترکیبی تاریخ+ساعت (یک کادر واحد) ---------- */
let _dateTimeState=null;
function ensureDateTimePopover(){
  let el=document.getElementById('dateTimePopover');
  if(el) return el;
  el=document.createElement('div'); el.id='dateTimePopover'; el.className='jalali-calendar-popover datetime-popover';
  el.style.display='none'; el.style.width='360px'; document.body.appendChild(el);
  document.addEventListener('click', (e)=>{
    const pop=document.getElementById('dateTimePopover');
    if(!pop || pop.style.display==='none') return;
    if(clickInside(e,pop)) return;
    if(e.target.closest('.jalali-datetime-shell')) return;
    closeDateTimePopover();
  });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDateTimePopover(); });
  return el;
}
function closeDateTimePopover(){
  const el=document.getElementById('dateTimePopover');
  if(el) el.style.display='none';
  _dateTimeState=null;
}
function renderDateTimePopover(jy,jm,hour,minute,selectedIso){
  const todayJ=getJalaliToday();
  const monthLen=jalaliMonthLen(jy,jm);
  const firstWD=jalaliWeekday(jy,jm,1);
  const monthName=JALALI_MONTHS[jm-1]||'';
  let selectedJ=null;
  if(selectedIso && /^\d{4}-\d{2}-\d{2}$/.test(selectedIso)){
    const [sy,sm,sd]=selectedIso.split('-').map(Number);
    const [sj,smj,sdj]=gregorianToJalali(sy,sm,sd);
    selectedJ=[sj,smj,sdj];
  }
  let h=`<div class="datetime-popover-inner"><div class="dt-body"><div class="dt-cal">`;
  h+=`<div class="jalali-cal-head"><div class="jalali-cal-nav"><button type="button" data-dt="prev" aria-label="ماه قبل">${icon('arrow',16)}</button></div><div class="jalali-cal-title">${esc(monthName)} ${fa(jy)}</div><div class="jalali-cal-nav"><button type="button" data-dt="next" class="is-next" aria-label="ماه بعد">${icon('arrow',16)}</button></div></div>`;
  h+=`<div class="jalali-cal-weekdays">`+JALALI_WEEKDAYS.map((w,i)=>`<span class="${i===6?'is-fri':''}">${w}</span>`).join('')+`</div>`;
  h+=`<div class="jalali-cal-grid">`;
  for(let i=0;i<firstWD;i++) h+=`<span class="jalali-cal-day is-other" style="visibility:hidden"></span>`;
  for(let d=1; d<=monthLen; d++){
    const wd=jalaliWeekday(jy,jm,d);
    const [gy,gm,gd]=jalaliToGregorian(jy,jm,d);
    const iso=`${gy}-${pad2(gm)}-${pad2(gd)}`;
    const isToday=(jy===todayJ[0] && jm===todayJ[1] && d===todayJ[2]);
    const isSelected=selectedJ && selectedJ[0]===jy && selectedJ[1]===jm && selectedJ[2]===d;
    h+=`<button type="button" class="jalali-cal-day ${isToday?'is-today':''} ${isSelected?'is-selected':''} ${wd===6?'is-fri':''}" data-iso="${esc(iso)}" data-jalali="${jy}/${pad2(jm)}/${pad2(d)}">${fa(d)}</button>`;
  }
  const total=firstWD+monthLen;
  const rem=(7 - (total%7))%7;
  for(let i=0;i<rem;i++) h+=`<span class="jalali-cal-day is-other" style="visibility:hidden"></span>`;
  h+=`</div>`;
  h+=`</div><div class="dt-time">`;
  h+=`<div class="datetime-time-section" style="margin-top:14px;padding-top:14px;border-top:1px dashed var(--line)">`;
  h+=`<div class="time-picker-display" style="padding:8px 10px;margin-bottom:10px;background:var(--panel-2);border:1px solid var(--line);border-radius:12px;display:flex;align-items:center;justify-content:center;gap:8px"><b dir="ltr" style="font-size:22px;font-weight:1000;color:var(--brand);letter-spacing:.04em">${pad2(hour)}:${pad2(minute)}</b><span style="font-size:11px;color:var(--muted)">۲۴ ساعته — زمان ورود به انبار</span></div>`;
  h+=`<div class="analog-tabs" style="display:flex;gap:6px;margin-bottom:10px"><button type="button" data-clock-tab="hour" class="analog-tab is-active">ساعت</button><button type="button" data-clock-tab="minute" class="analog-tab">دقیقه</button></div>`;
  h+=`<div class="analog-clock-wrap" data-clock-wrap="hour"><div class="analog-clock" data-face="hour" style="--size:220px">`;
  h+=`<div class="analog-clock-face"></div><div class="analog-hand hour-hand" style="--deg:${(hour%12)*30 + (minute/60)*30}deg"></div><div class="analog-hand minute-hand" style="--deg:${minute*6}deg;opacity:.45"></div><div class="analog-center"></div>`;
  for(let i=0;i<12;i++){
    const val=i;
    const angle=(i*30)-90;
    const isSel = (hour===val);
    h+=`<button type="button" class="analog-number is-outer ${isSel?'is-selected':''}" data-hour="${val}" style="--angle:${angle}deg"><span>${fa(val)}</span></button>`;
  }
  for(let i=12;i<24;i++){
    const angle=((i-12)*30)-90;
    const isSel = (hour===i);
    h+=`<button type="button" class="analog-number is-inner ${isSel?'is-selected':''}" data-hour="${i}" style="--angle:${angle}deg"><span>${fa(i)}</span></button>`;
  }
  h+=`</div></div>`;
  h+=`<div class="analog-clock-wrap is-hidden" data-clock-wrap="minute"><div class="analog-clock" data-face="minute" style="--size:220px">`;
  h+=`<div class="analog-clock-face"></div><div class="analog-hand minute-hand" style="--deg:${minute*6}deg"></div><div class="analog-center"></div>`;
  const mins=[0,5,10,15,20,25,30,35,40,45,50,55];
  for(let idx=0; idx<mins.length; idx++){
    const m=mins[idx];
    const angle=(idx*30)-90;
    const isSel = (minute===m);
    h+=`<button type="button" class="analog-number ${isSel?'is-selected':''}" data-minute="${m}" style="--angle:${angle}deg"><span>${pad2(m)}</span></button>`;
  }
  h+=`</div></div>`;
  h+=`</div>`;
  h+=`</div></div>`;
  h+=`<div class="datetime-actions" style="display:flex;gap:8px;margin-top:12px"><button type="button" class="btn btn-secondary btn-sm" data-dt="cancel" style="flex:1">انصراف</button><button type="button" class="btn btn-primary btn-sm" data-dt="confirm" style="flex:1.4">تأیید تاریخ و ساعت</button></div>`;
  h+=`<div style="text-align:center;margin-top:8px"><button type="button" class="jalali-today-btn" data-dt="today" style="font-size:11px">امروز (${fa(isoToJalali(today()))} • ${fa(now24())})</button></div>`;
  h+=`</div>`;
  return h;
}
function openDateTimePicker(anchor){
  if(!anchor) return;
  const raw=anchor.dataset.datetime||'';
  const [dateTarget, timeTarget]=raw.split('|');
  const form=anchor.closest('form');
  const dateHidden=form ? form.querySelector(`[name="${CSS.escape(dateTarget)}"]`) : anchor.querySelector(`[name="${CSS.escape(dateTarget)}"]`);
  const timeHidden=form ? form.querySelector(`[name="${CSS.escape(timeTarget)}"]`) : anchor.querySelector(`[name="${CSS.escape(timeTarget)}"]`);
  // fallback: hidden inside anchor itself (as in new template, hidden inside shell)
  const dh=dateHidden || anchor.querySelector(`[name="${dateTarget}"]`);
  const th=timeHidden || anchor.querySelector(`[name="${timeTarget}"]`);
  if(!dh || !th) return;
  let iso=(dh.value||'').trim();
  let tm=(th.value||'08:00').trim();
  if(!iso){
    // try parse from display if needed
    iso=today();
  }
  let jy,jm;
  if(/^\d{4}-\d{2}-\d{2}$/.test(iso)){
    const [gy,gm,gd]=iso.split('-').map(Number);
    const j=gregorianToJalali(gy,gm,gd);
    jy=j[0]; jm=j[1];
  } else {
    const t=getJalaliToday(); jy=t[0]; jm=t[1]; iso=today();
  }
  let hour=8, minute=0;
  const m=normalizeTime24(tm).match(/^(\d{1,2}):(\d{2})$/);
  if(m){ hour=Math.min(23,Math.max(0,Number(m[1]))); minute=Math.min(59,Math.max(0,Number(m[2]))); }
  _dateTimeState={jy,jm,hour,minute, anchor, dateHidden:dh, timeHidden:th, selectedIso:iso};
  const pop=ensureDateTimePopover();
  pop.innerHTML=renderDateTimePopover(jy,jm,hour,minute,iso);
  pop.style.display='block'; pop.classList.add('show');
  requestAnimationFrame(()=>positionPopover(pop, anchor));
  pop.onclick=(e)=>{
    const tab=e.target.closest('[data-clock-tab]');
    if(tab){
      const mode=tab.dataset.clockTab;
      pop.querySelectorAll('[data-clock-tab]').forEach(b=>b.classList.toggle('is-active', b===tab));
      pop.querySelectorAll('[data-clock-wrap]').forEach(w=>w.classList.toggle('is-hidden', w.dataset.clockWrap!==mode));
      return;
    }
    const dtBtn=e.target.closest('[data-dt]');
    if(dtBtn){
      const cmd=dtBtn.dataset.dt;
      if(cmd==='prev'){
        let njm=_dateTimeState.jm-1, njy=_dateTimeState.jy;
        if(njm<1){ njm=12; njy--; }
        _dateTimeState.jy=njy; _dateTimeState.jm=njm;
        pop.innerHTML=renderDateTimePopover(njy,njm,_dateTimeState.hour,_dateTimeState.minute,_dateTimeState.selectedIso);
        positionPopover(pop, anchor);
        return;
      }
      if(cmd==='next'){
        let njm=_dateTimeState.jm+1, njy=_dateTimeState.jy;
        if(njm>12){ njm=1; njy++; }
        _dateTimeState.jy=njy; _dateTimeState.jm=njm;
        pop.innerHTML=renderDateTimePopover(njy,njm,_dateTimeState.hour,_dateTimeState.minute,_dateTimeState.selectedIso);
        positionPopover(pop, anchor);
        return;
      }
      if(cmd==='today'){
        const tt=getJalaliToday();
        const [gy,gm,gd]=jalaliToGregorian(tt[0],tt[1],tt[2]);
        const isoToday=`${gy}-${pad2(gm)}-${pad2(gd)}`;
        _dateTimeState.jy=tt[0]; _dateTimeState.jm=tt[1]; _dateTimeState.selectedIso=isoToday;
        pop.innerHTML=renderDateTimePopover(tt[0],tt[1],_dateTimeState.hour,_dateTimeState.minute,isoToday);
        positionPopover(pop, anchor);
        return;
      }
      if(cmd==='cancel'){ closeDateTimePopover(); return; }
      if(cmd==='confirm'){
        const jy=_dateTimeState.jy, jm=_dateTimeState.jm;
        // find selected day: if user clicked a day, selectedIso already updated; otherwise keep previous
        const iso=_dateTimeState.selectedIso;
        const tm=`${pad2(_dateTimeState.hour)}:${pad2(_dateTimeState.minute)}`;
        // update hiddens
        _dateTimeState.dateHidden.value=iso;
        _dateTimeState.timeHidden.value=tm;
        // update display
        const jStr=isoToJalali(iso);
        const disp=anchor.querySelector('.datetime-display');
        if(disp) disp.textContent=`${fa(jStr)} • ${fa(tm)}`;
        // also update the shell's hidden inputs inside if they are inside anchor
        anchor.dispatchEvent(new Event('change',{bubbles:true}));
        _dateTimeState.dateHidden.dispatchEvent(new Event('change',{bubbles:true}));
        _dateTimeState.timeHidden.dispatchEvent(new Event('change',{bubbles:true}));
        closeDateTimePopover();
        return;
      }
    }
    const day=e.target.closest('.jalali-cal-day[data-iso]');
    if(day){
      const iso=day.dataset.iso;
      _dateTimeState.selectedIso=iso;
      // re-render to show selected state
      pop.innerHTML=renderDateTimePopover(_dateTimeState.jy,_dateTimeState.jm,_dateTimeState.hour,_dateTimeState.minute,iso);
      positionPopover(pop, anchor);
      return;
    }
    const hb=e.target.closest('[data-hour]');
    if(hb){
      const h=Number(hb.dataset.hour);
      _dateTimeState.hour=h;
      pop.querySelectorAll('[data-hour]').forEach(b=>b.classList.toggle('is-selected', Number(b.dataset.hour)===h));
      const disp=pop.querySelector('.time-picker-display b');
      if(disp) disp.textContent=`${pad2(h)}:${pad2(_dateTimeState.minute)}`;
      const hand=pop.querySelector('.hour-hand');
      if(hand) hand.style.setProperty('--deg', `${(h%12)*30 + (_dateTimeState.minute/60)*30}deg`);
      const mHand=pop.querySelector('[data-face="hour"] .minute-hand');
      if(mHand) mHand.style.setProperty('--deg', `${_dateTimeState.minute*6}deg`);
      const minuteTab=pop.querySelector('[data-clock-tab="minute"]');
      if(minuteTab){ minuteTab.click(); }
      return;
    }
    const mb=e.target.closest('[data-minute]');
    if(mb){
      const mi=Number(mb.dataset.minute);
      _dateTimeState.minute=mi;
      pop.querySelectorAll('[data-minute]').forEach(b=>b.classList.toggle('is-selected', Number(b.dataset.minute)===mi));
      const disp=pop.querySelector('.time-picker-display b');
      if(disp) disp.textContent=`${pad2(_dateTimeState.hour)}:${pad2(mi)}`;
      const mHands=pop.querySelectorAll('.minute-hand');
      mHands.forEach(h=>h.style.setProperty('--deg', `${mi*6}deg`));
      const hHand=pop.querySelector('.hour-hand');
      if(hHand) hHand.style.setProperty('--deg', `${(_dateTimeState.hour%12)*30 + (mi/60)*30}deg`);
      return;
    }
  };
}
// delegate for datetime shell
document.addEventListener('click', (e)=>{
  const dtShell=e.target.closest('.jalali-datetime-shell');
  if(dtShell){
    e.preventDefault();
    openDateTimePicker(dtShell);
  }
});

function initials(name=''){const p=String(name).trim().split(/\s+/).filter(Boolean);return (p[0]?.[0]||'ب')+(p[1]?.[0]||'')}
function normalizeRole(r){return ['gate','gate_entry','gate_exit'].includes(r)?'gate':(['sales','sales_order','sales_settlement'].includes(r)?'sales':r)}
function can(role){const r=normalizeRole(app.user?.roleCode);return r==='admin'||r===role}
function badge(s){const x=STATUS[s]||[s,'gray'];return `<span class="badge ${x[1]}">${x[0]}</span>`}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2800)}
const WRITE_KEYS=new Map();
const WRITES_IN_FLIGHT=new Set();
// کلید Idempotency با getRandomValues ساخته می‌شود تا در HTTP داخلی (غیر localhost) هم کار کند
function newIdempotencyKey(){const b=crypto.getRandomValues(new Uint8Array(16));return Array.from(b,x=>x.toString(16).padStart(2,'0')).join('')}
async function api(path,opts={}){
  const method=String(opts.method||'GET').toUpperCase();
  const headers={'Content-Type':'application/json',...(opts.headers||{})};
  const mutating=method!=='GET'&&method!=='HEAD';
  const connectionGeneration=window.btConnection?.current?.();
  const sig=mutating?`${method} ${path} ${opts.body||''}`:'';
  if(mutating){
    if(WRITES_IN_FLIGHT.has(sig)) throw new Error('این عملیات در حال انجام است. لطفاً منتظر پاسخ سامانه بمانید.');
    if(!WRITE_KEYS.has(sig)) WRITE_KEYS.set(sig,newIdempotencyKey());
    headers['Idempotency-Key']=WRITE_KEYS.get(sig);
    WRITES_IN_FLIGHT.add(sig);
  }
  let res,data={};
  try{
    res=await fetch(path,{...opts,method,headers,credentials:'same-origin'});
    data=await res.json().catch(()=>({}));
  }catch(_){
    if(!mutating) window.btConnection?.failure(path,connectionGeneration);
    // قطع ارتباط: کلید نگه داشته می‌شود تا تلاش مجدد همان عملیات را تکرار نکند
    if(mutating) WRITES_IN_FLIGHT.delete(sig);
    throw new Error('ارتباط با سرور داخلی برقرار نشد. اتصال شبکه را بررسی کنید و دوباره تلاش کنید؛ عملیات دوبار ثبت نمی‌شود.');
  }
  if(!mutating){if(res.status<500)window.btConnection?.success(path,connectionGeneration);else window.btConnection?.failure(path,connectionGeneration);}
  if(mutating){WRITES_IN_FLIGHT.delete(sig);WRITE_KEYS.delete(sig);}
  if(!res.ok){
    if(res.status===401&&path!=='/api/login') handleSessionExpired();
    else if(data.code==='PASSWORD_CHANGE_REQUIRED'&&!app.forcePasswordChange) openPasswordModal(true);
    const err=new Error(data.error||'خطا در ارتباط با سامانه');
    err.status=res.status; err.code=data.code;
    throw err;
  }
  if(mutating){app.dataRevision=(app.dataRevision||0)+1;if(app.salesCache)app.salesCache.fetchedAt=0;}
  return data;
}
function openModal(title,body){const m=$('#modal');m.innerHTML=`<div class="modal-card"><div class="modal-head"><strong>${esc(title)}</strong><button class="modal-close" data-action="close-modal">${icon('close',18)}</button></div><div class="modal-body">${body}</div></div>`;m.classList.add('open')}
function closeModal(){if(app.forcePasswordChange)return;$('#modal').classList.remove('open');$('#modal').innerHTML=''}

function badgeCount(key){return Number(app.workload?.[key]||0)}
function navBadge(n){return n>0?`<span class="nav-badge">${qty(n)}</span>`:''}
function setHeader(kicker,title,subtitle){$('#headerKicker').textContent=kicker;$('#pageTitle').textContent=title;$('#pageSubtitle').textContent=subtitle||''}
function landing(){const r=normalizeRole(app.user?.roleCode);return r==='admin'?'dashboard':r}

async function refreshShell(){
  const me=await api('/api/me');app.user=me.user;app.features=me.features||{};
  const roleLabel=ROLE[normalizeRole(app.user.roleCode)]||app.user.roleCode;
  $('#appView')?.setAttribute('data-role',normalizeRole(app.user.roleCode));
  const roleText=(app.user.position && app.user.position.trim()!==roleLabel) ? `${app.user.position} • ${roleLabel}` : roleLabel;
  const headerUser=$('#headerUser'); if(headerUser) headerUser.textContent=app.user.fullName||'';
  const headerRole=$('#headerRole'); if(headerRole) headerRole.textContent=roleText;
  const headerAvatar=$('#headerAvatar'); if(headerAvatar) headerAvatar.textContent=(app.user.fullName||'؟').trim().charAt(0);
  startRailClock();
  await refreshIndicators(); if(!app.indicatorTimer) app.indicatorTimer=setInterval(refreshIndicators,6000); renderNav();
}

async function go(page,sub){
  if(app.timer){clearInterval(app.timer);app.timer=null}
  const r=normalizeRole(app.user?.roleCode);const own=r==='admin'?page:(r==='dispatch'?'drivers':r);
  if(page==='dispatch'){page='drivers';adm.tab='dispatch';}
  // کارتابل باسکول فعلاً غیرفعال است؛ تا زمان اصلاح، هیچ صفحه‌ای از آن باز نمی‌شود
  if(page==='scale'&&!WEIGHBRIDGE_CARTABLE_ENABLED){ page = r==='admin' ? 'dashboard' : (r==='gate' ? 'gate' : own); }
  const scaleOk=WEIGHBRIDGE_CARTABLE_ENABLED&&page==='scale'&&(r==='gate'||r==='admin');
  const customersOk=page==='customers'&&['gate','sales'].includes(r);
  const productsOk=page==='products'&&r==='sales'; // v37.3.1 — کارتابل محصولات (قیمت + ویرایش) برای فروش
  const transportResourcesOk=(page==='transport-resources'&&['dispatch','sales','warehouse'].includes(r))||(page==='transport-fleet'&&r==='dispatch');
  const dispatchExtraOk=(page==='returns'&&['sales','warehouse'].includes(r))||(page==='gate-dispatch'&&r==='gate');
  if(r!=='admin'&&page!==own&&!scaleOk&&!customersOk&&!productsOk&&!dispatchExtraOk&&!transportResourcesOk){toast('این حساب فقط به کارتابل واحد خود دسترسی دارد.');page=own}
  window.btConnection?.reset?.();
  app.page=page; if(sub)app.sub[page]=sub;
  const appView=$('#appView'); if(appView)appView.setAttribute('data-cartable-page',page);
  // صفحهٔ قبلی را پیش از درخواست‌های async پاک کن تا فرم نقش قبلی باقی نماند.
  const pageContent=$('#content'); if(pageContent)pageContent.replaceChildren();
  renderNav();
  try{
    if(page==='dashboard'){setHeader('مرکز کنترل','داشبورد مدیریتی','نمای کامل وضعیت عملیات و جریان مشتریان');await renderDashboard()}
    else if(page==='gate'){if(['dashboard','reports'].includes(app.sub.gate)){setHeader('نگهبانی',app.sub.gate==='reports'?'گزارش‌های نگهبانی':'داشبورد نگهبانی','نمای خلاصه کارتابل نگهبانی');await renderRoleCartableDashboard('gate',app.sub.gate);return}setHeader('نگهبانی','کارتابل نگهبانی','ورود مشتری، سوابق مراجعه و کنترل خروج در یک فضای عملیاتی');await renderGate(app.sub.gate||'entry')}
    else if(page==='sales'){if(app.sub.sales==='products'){setHeader('فروش','محصولات و قیمت‌ها','جستجو و به‌روزرسانی قیمت روز محصولات');await renderProductsPage();return}if(app.sub.sales==='history'){setHeader('فروش','سوابق سفارش و فاکتور','جستجو و پیگیری گردش سفارش‌ها');await renderSalesHistory();return}if(['dashboard','reports'].includes(app.sub.sales)){setHeader('فروش',app.sub.sales==='reports'?'گزارش‌های فروش':'داشبورد فروش','نمای خلاصه کارتابل فروش');await renderRoleCartableDashboard('sales',app.sub.sales);return}setHeader('فروش','کارتابل فروش','شش بخش عملیاتی، از ثبت سفارش تا بازبینی نهایی پخش');await renderSales(app.sub.sales==='intake'?'onsite':(app.sub.sales||'onsite'))}
    else if(page==='warehouse'){if(['dashboard','reports'].includes(app.sub.warehouse)){setHeader('انبار',app.sub.warehouse==='reports'?'گزارش‌های انبار':'داشبورد انبار','نمای خلاصه کارتابل انبار');await renderRoleCartableDashboard('warehouse',app.sub.warehouse);return}if(app.sub.warehouse==='history'){setHeader('انبار','سوابق مراجعه','سوابق مراجعه و وضعیت مشتریان ثبت‌شده');const v=await api('/api/visits');const content=$('#content');content.innerHTML=renderGateHistory(v.visits||[],true,'warehouse-visit-order-details');bindWarehouseVisitHistory(content);return}if(app.wh38)app.wh38.phase=['incoming','preparing','delivered','document-edits','stores'].includes(app.sub.warehouse)?app.sub.warehouse:'incoming';setHeader('انبار',app.sub.warehouse==='document-edits'?'درخواست‌های اصلاح سند':'کارتابل انبار',app.sub.warehouse==='document-edits'?'اصلاح سند فقط از مسیر ارجاع فروش و صف کنترل‌شده انجام می‌شود.':'صف سفارش‌ها، آماده‌سازی و پیگیری فروشگاه‌ها');await renderWarehouse()}
    else if(page==='store'){if(['dashboard','reports'].includes(app.sub.store)){setHeader('فروشگاه',app.sub.store==='reports'?'گزارش‌های فروشگاه':'داشبورد فروشگاه','خلاصه وضعیت سفارش‌ها');await renderRoleCartableDashboard('store',app.sub.store);return}setHeader('فروشگاه','کارتابل فروشگاه','ثبت سفارش و پیگیری تایید فروش تا زمان ورود به انبار');await renderStorePortal()}
    else if(page==='scale'){setHeader('باسکول','کارتابل باسکول','ثبت ورود و خروج وسیله‌ها، محاسبه خالص بار و ثبت کالا');await renderScale()}
    else if(page==='customers'){setHeader('مشتریان','پرونده مشتریان','کد مشتری، اطلاعات کامل و سوابق مراجعه و سفارش');await renderCustomers()}
    else if(page==='dispatch'){if(r!=='admin'&&r!=='dispatch')return go(own);setHeader('پخش','کارتابل واحد پخش','مشاهده سفارش‌ها؛ تخصیص راننده از کارتابل فروش و پیگیری تحویل');await renderDispatchPage(true)}
    else if(page==='driver'){if(r!=='admin'&&r!=='driver')return go(own);if(app.sub.driver==='reports'){setHeader('راننده','گزارش‌های راننده','گزارش ارسال‌های اختصاصی شما');await renderReportsPage('driver');return}setHeader('راننده','کارتابل راننده','سفارش‌های تخصیص‌یافته و ثبت تحویل');await renderDriverPage()}
    else if(page==='gate-dispatch'){if(r!=='admin'&&r!=='gate')return go(own);setHeader('نگهبانی','خروج ارسالی','ابتدا خروج اعلام‌شده توسط راننده را تأیید کنید؛ پس از تحویل مقصد، خروج نهایی را ثبت کنید');await renderGateDispatchPage()}
    else if(page==='returns'){if(r!=='admin'&&r!=='sales'&&r!=='warehouse')return go(own);setHeader('مرجوعی','برگه‌های مرجوعی','مرجوعی‌های راننده: فروش ارجاع می‌دهد و انبار دریافت می‌کند');await renderReturnsPage()}
    else if(page==='users'){if(r!=='admin')return go(own);setHeader('مدیریت','مدیریت کاربران','افزودن، ویرایش و غیرفعال‌سازی حساب‌های کاربری');await renderUsersPage()}
    else if(page==='transport-resources'){setHeader('ترابری','رانندگان و خودروها','مشخصات رانندگان و خودروهای ترابری');await renderTransportResources()}
    else if(page==='transport-fleet'){if(!['admin','dispatch'].includes(r))return go(own);setHeader('ترابری','خودروهای پخش','خودرو و دستگاه پوز در اختیار رانندگان');await renderTransportFleet()}
    else if(page==='transport-vehicles'||page==='store-branches'){if(r!=='admin')return go(own);setHeader('مدیریت',page==='transport-vehicles'?'خودروهای ترابری':'شعب فروشگاه','تعریف مستقل برای انتخاب در حساب کاربری');await renderResourcePage(page==='transport-vehicles'?'vehicle':'branch')}
    else if(page==='payment-devices'){if(r!=='admin')return go(own);setHeader('مدیریت','دستگاه‌های پوز','تعریف و مدیریت دستگاه‌های فعال برای فرم‌های تسویه');await renderPaymentDevicesPage()}
    else if(page==='drivers'){if(!['admin','dispatch'].includes(r))return go(own);if((r==='dispatch'||app.adminActiveRole==='dispatch')&&['dashboard','reports'].includes(app.sub.drivers)){setHeader('ترابری',app.sub.drivers==='reports'?'گزارشات ترابری':'داشبورد ترابری','خلاصه وضعیت ترابری');await renderRoleCartableDashboard('dispatch',app.sub.drivers);return}setHeader('عملیات','ترابری','رانندگان، سوابق سفارش‌ها و پخش');await renderDriversPage()}
    else if(page==='products'){if(r==='sales'){setHeader('فروش','کارتابل محصولات','ثبت و ویرایش محصولات و تعیین قیمت روز');await renderProductsPage();}else{if(r!=='admin')return go(own);setHeader('مدیریت','محصولات و قیمت‌ها','ثبت، ویرایش، حذف محصول و تعیین قیمت روز');await renderProductsPage()}}
    else if(page==='orders-history'){if(r!=='admin')return go(own);setHeader('مدیریت','سوابق کامل سفارش‌ها','پروندهٔ کامل هر سفارش از ثبت تا پایان کار، با کاربر هر مرحله');await renderAdminOrdersHistory()}
    else if(page==='activity'){if(r!=='admin')return go(own);setHeader('مدیریت','تاریخچه فعالیت‌ها','ردیابی کامل عملیات کاربران با زمان، IP و جزئیات');await renderActivityPage()}
    else if(page==='backups'){if(r!=='admin')return go(own);setHeader('مدیریت','پشتیبان‌گیری و بازیابی','ساخت، دریافت و بازیابی نسخه‌های پشتیبان');await renderBackupsPage()}
    else if(page==='reports'){if(r!=='admin')return go(own);setHeader('مدیریت','گزارش‌های پیشرفته','گزارش از همه بخش‌های سامانه با انتخاب ستون و فیلتر، خروجی Excel و PDF');await renderReportsPage()}
    else if(page==='admin'){if(r!=='admin')return go(own);setHeader('مدیریت','مدیریت سیستم','کاتالوگ کالا، قیمت روز، حساب‌های کاربری و ردپای فعالیت‌ها');await renderAdmin()}
  }catch(e){toast(e.message)}
}

function dashboardKpi(label,value,hint,ico){return `<div class="card kpi"><div><div class="label">${label}</div><div class="value">${qty(value)}</div><div class="hint">${hint}</div></div><div class="kpi-icon">${icon(ico,20)}</div></div>`}

/* ---------- Gate ---------- */
async function renderGate(tab){
  app.sub.gate=tab;const visits=(await api('/api/visits')).visits||[];let html=`<div class="unit-tabs unit-tabs-counted">${[['entry','ثبت ورود',null],['waiting','در انتظار اقدام فروش','gateEntry'],['history','سوابق مراجعه',null],['exit','کنترل خروج','gateExit']].map(([id,label,key])=>`<button class="${tab===id?'active':''}" data-sub="gate:${id}">${label}${key?`<span class="tab-count ${badgeCount(key)<=0?'hidden':''}" data-badge-key="${key}">${badgeCount(key)?qty(badgeCount(key)):''}</span>`:''}</button>`).join('')}</div>`;
  if(tab==='entry')html+=renderGateEntry();
  else if(tab==='waiting')html+=renderGateWaitingLegacy(visits.filter(v=>v.status==='WAITING_SALES'));
  else if(tab==='history')html+=renderGateHistory(visits);
  else html+=renderGateExit((await api('/api/orders?status=SETTLED')).orders||[]);
  $('#content').innerHTML=html;bindGate(tab);if(tab==='entry')bindPlate();
}
function renderGateEntry(){return `<section class="card workspace-card"><div class="panel-head"><div><span class="eyebrow">ENTRY DESK</span><h2>ثبت ورود مشتری</h2><p>اطلاعات مشتری و وسیله را یک‌بار ثبت کنید؛ دفعات بعد سوابق پلاک قابل انتخاب است.</p></div><span class="pill">ورود مستقیم به صف فروش</span></div>
  <form id="gateForm" class="section-space">
    <div class="form-grid"><div class="field"><label>نام و نام خانوادگی</label><div class="input-shell"><span data-field-icon="user"></span><input name="name" required placeholder="نام مشتری"></div></div><div class="field"><label>شماره تماس</label><div class="input-shell"><span data-field-icon="user"></span><input name="phone" required inputmode="tel" placeholder="۰۹۱۲ ..."></div></div></div>
    <div class="section-space"><div class="plate-wrap"><div class="plate-label"><div><strong>پلاک وسیله نقلیه</strong><div class="plate-preview">فرمت استاندارد پلاک ایران</div></div><label class="pill"><input type="checkbox" id="noVehicle" style="accent-color:var(--brand)"> بدون وسیله</label></div><div id="plateBox"></div><div id="plateSuggest" class="suggestions"></div></div></div>
    <div class="form-grid section-space"><div class="field"><label>نوع وسیله</label><div class="input-shell"><select name="vehicleType"><option>خودرو</option><option>موتورسیکلت</option><option>وانت</option><option>بدون وسیله</option></select></div></div><div class="field"><label>هدف مراجعه</label><div class="input-shell"><input name="purpose" placeholder="خرید، دریافت سفارش یا توضیح کوتاه"></div></div></div>
    <div class="sticky-actions"><span class="subtle">پس از ثبت، اعلان فوری برای کارتابل فروش ارسال می‌شود.</span><button class="btn btn-primary btn-lg" type="submit">ثبت ورود و ارسال به فروش ${icon('arrow',17)}</button></div>
    <div id="gateMsg" class="form-error"></div>
  </form></section>`}
function renderGateWaitingLegacy(queue){return `<section class="card card-pad"><div class="panel-head"><div><span class="eyebrow">WAITING SALES</span><h2>در انتظار اقدام فروش</h2><p>ورودی‌هایی که نگهبانی ثبت کرده و فروش هنوز برایشان سفارش ثبت نکرده است.</p></div><span class="count-chip">${qty(queue.length)}</span></div><div class="queue-list section-space">${queue.map(x=>`<div class="queue-item"><div class="queue-main"><div class="queue-avatar">${esc(initials(x.customer?.name||''))}</div><div class="queue-copy"><strong>${esc(x.customer?.name||'—')}</strong><span>${plateViewHtml(x.customer?.plate, 'بدون پلاک', true)} • ${esc(x.customer?.phone||'')}</span></div></div>${badge(x.status)}</div>`).join('')||'<div class="empty">صف فعالی وجود ندارد.</div>'}</div></section>`}
function renderGateHistory(visits){return `<section class="card card-pad"><div class="panel-head"><div><span class="eyebrow">VISIT HISTORY</span><h2>سوابق مراجعه</h2><p>آخرین ورودهای ثبت‌شده و وضعیت هر مراجعه</p></div></div><div class="table-wrap section-space"><table class="table"><thead><tr><th>مشتری</th><th>پلاک</th><th>محله</th><th>هدف</th><th>وضعیت</th><th>زمان</th></tr></thead><tbody>${visits.map(v=>`<tr><td><strong>${esc(v.customer?.name||'—')}</strong><div class="subtle">${esc(v.customer?.phone||'')}</div></td><td>${plateViewHtml(v.customer?.plate, 'بدون پلاک', true)}</td><td>${esc(v.district||'—')}</td><td>${esc(v.purpose||'—')}</td><td>${badge(v.status)}</td><td>${dt(v.createdAt)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">سابقه‌ای ثبت نشده است.</td></tr>'}</tbody></table></div></section>`}
function renderGateExit(orders){return `<section class="card card-pad"><div class="panel-head"><div><span class="eyebrow">EXIT CONTROL</span><h2>فاکتورهای آماده خروج</h2><p>فقط فاکتورهای تسویه‌شده در این کارتابل قابل کنترل هستند.</p></div><span class="pill"><span class="status-dot"></span> کنترل واحد نگهبانی</span></div><div class="table-wrap section-space"><table class="table"><thead><tr><th>مشتری</th><th>پلاک</th><th>فاکتور</th><th>مبلغ</th><th>زمان</th><th>عملیات</th></tr></thead><tbody>${orders.map(o=>`<tr><td><strong>${esc(storeAwareOrderName(o))}</strong><div class="subtle">${esc(storeAwareOrderPhone(o))}</div></td><td>${plateViewHtml(o.customer?.plate, 'بدون پلاک', true)}</td><td><b style="color:var(--brand)">${esc(fa(o.payment?.invoiceNumber||'—'))}</b></td><td>${money(o.payment?.totalAmount)}</td><td>${dt(o.payment?.verifiedAt)}</td><td><div class="toolbar"><button class="btn btn-secondary btn-sm" data-action="invoice" data-id="${o.id}">${icon('eye',15)} فاکتور</button><button class="btn btn-success btn-sm" data-action="open-exit" data-id="${o.id}">${icon('check',15)} کنترل خروج</button></div></td></tr>`).join('')||'<tr><td colspan="6" class="empty">فاکتور آماده خروج وجود ندارد.</td></tr>'}</tbody></table></div><div id="exitEditor" class="section-space"></div></section>`}
function bindGate(tab){
  $('#content').onclick=async e=>{const b=e.target.closest('[data-sub]');if(b){const [k,v]=b.dataset.sub.split(':');app.sub[k]=v;await renderGate(v);return}const action=e.target.closest('[data-action]')?.dataset.action;if(action==='invoice')return previewInvoice(e.target.closest('[data-action]').dataset.id,Number(e.target.closest('[data-action]').dataset.run)||null);if(action==='open-exit')return openExit(e.target.closest('[data-action]').dataset.id);if(action==='confirm-exit')return confirmExit(e.target.closest('[data-action]').dataset.id)};
  const f=$('#gateForm');if(f)f.addEventListener('submit',submitGate)
  const nv=$('#noVehicle');if(nv)nv.addEventListener('change',()=>{const box=$('#plateBox');if(box)box.hidden=nv.checked;});
  if($('#plateBox'))$('#plateBox').innerHTML=plateEditorHtml('',f?.elements.vehicleType?.value||'');
}
async function submitGate(e){e.preventDefault();const f=e.target;const data=Object.fromEntries(new FormData(f));data.noVehicle=!!$('#noVehicle')?.checked;
try{data.plate=data.noVehicle?'':plateEditorValue(f,{required:true});}catch(err){$('#gateMsg').textContent=err.message;return;}
if(!data.name||!data.phone){$('#gateMsg').textContent=app.pickupSelected&&!document.querySelector('[data-pickup-other]')?.checked?'مشخصات صاحب سفارش ناقص است؛ فروش ابتدا آن را اصلاح کند.':'نام و شماره تماس را وارد کنید.';return;}try{const pickup=app.features?.pickupStaging&&app.pickupSelected;if(pickup)data.recipientIsBuyer=!document.querySelector('[data-pickup-other]')?.checked;if(pickup)await api('/api/pickup/'+encodeURIComponent(pickup.id)+'/entry',{method:'POST',body:JSON.stringify(data)});else await api('/api/visits',{method:'POST',body:JSON.stringify(data)});toast(pickup?'ورود تحویل‌گیرنده ثبت شد و به انبار اطلاع داده شد.':'ورود مشتری ثبت شد و به فروش ارسال شد.');app.pickupSelected=null;app.plate={a:'',letter:'ب',c:'',province:''};app.customerMatches=[];await renderGate('entry');const nameInput=$('#gateForm [name="name"]');if(nameInput)nameInput.focus();}catch(err){$('#gateMsg').textContent=err.message}}
/* v37.3.4 — پایانه پوز راننده همراه با نام بانک؛ شماره تماس قابل کلیک */
const BT_POS_BANKS=['بانک ملت','بانک ملی','بانک صادرات','بانک تجارت','بانک سپه','بانک کشاورزی','بانک مسکن','بانک رفاه','بانک پاسارگاد','بانک سامان','بانک پارسیان','بانک اقتصاد نوین','بانک شهر','بانک آینده','بانک دی','بانک سینا','بانک کارآفرین','بانک توسعه تعاون','پست بانک','بانک رسالت','بانک قرض‌الحسنه مهر ایران','بانک سرمایه','بانک خاورمیانه','بانک ایران زمین','بانک گردشگری'];
function driverPosText(d){ const t=String(d?.posTerminal||'').trim(), b=String(d?.posBank||'').trim(); if(!t&&!b) return '—'; return t&&b?`${t} — ${b}`:(t||b); }
function driverPosHtml(d){ const t=String(d?.posTerminal||'').trim(), b=String(d?.posBank||'').trim(); if(!t&&!b) return '<span class="drv-pos is-empty">—</span>';
  return `<span class="drv-pos">${t?`<span class="drv-pos-term" dir="ltr">${esc(t)}</span>`:''}${b?`<span class="drv-pos-bank">${esc(b)}</span>`:''}</span>`; }
function driverPhoneHtml(phone){ const p=String(phone||'').trim(); return p?`<a class="drv-phone" href="tel:${esc(p)}" dir="ltr">${esc(fa(p))}</a>`:'<span class="drv-phone is-empty">ثبت نشده</span>'; }
function fa(v=''){return String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d])}
function en(v=''){return String(v).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))}
function plateDigits(v,len){return fa(en(v).replace(/\D/g,'').slice(0,len))}
function formatPlate(p){const a=en(p.a||''),c=en(p.c||''),pr=en(p.province||''),l=p.letter||'';return /^\d{2}$/.test(a)&&/^\d{3}$/.test(c)&&/^\d{2}$/.test(pr)&&/^[بپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی]$/.test(l)?`${fa(a)} ${l} ${fa(c)} - ${fa(pr)}`:''}
function parsePlate(s=''){
  const t=en(String(s)).replace(/\s/g,'').replace(/[–—]/g,'-');
  const m=t.match(/^(\d{2})([بپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی])(\d{3})-?(\d{2})$/);
  return m?{a:m[1],letter:m[2],c:m[3],province:m[4]}:{a:'',letter:'ب',c:'',province:''};
}
function formatDispatchVehiclePlate(value,fallback='—'){
  const raw=String(value??'').trim();
  if(!raw)return fallback;
  const formatted=formatPlate(parsePlate(raw));
  if(formatted)return formatted;
  return fa(en(raw).replace(/\s*-\s*/g,' - ').replace(/\s+/g,' '))||fallback;
}
function plateViewHtml(value, fallback='بدون پلاک', compact=false){
  const raw=String(value??'').trim();
  if(!raw) return `<span class="plate-text" style="color:var(--muted);font-size:12px;font-weight:700">${esc(fallback)}</span>`;
  const t=en(raw).replace(/\s/g,'').replace(/[–—]/g,'-');
  const motorcycle=t.match(/^(\d{3})-?(\d{5})$/);
  const p=parsePlate(raw), valid=!!formatPlate(p);
  const cls=compact?'iran-plate is-readonly is-compact':'iran-plate is-readonly';
  const blue='<div class="blue-strip"><span>IR<br>ایران</span></div>';
  if(motorcycle)return `<div class="${cls} is-motor" dir="ltr" aria-label="پلاک موتورسیکلت ${esc(raw)}">${blue}<div class="plate-part motor-top"><span>${esc(fa(motorcycle[1]))}</span></div><div class="plate-part motor-bottom"><span>${esc(fa(motorcycle[2]))}</span></div></div>`;
  // Never fabricate a letter or truncate unrecognised historical plates.
  if(!valid)return `<span class="iran-plate-legacy" dir="auto" title="پلاک قدیمی؛ قالب آن قابل تشخیص نیست">${esc(raw)}</span>`;
  return `<div class="${cls}" style="display:inline-grid;vertical-align:middle" dir="ltr" aria-label="پلاک ${esc(formatPlate(p))}">${blue}<div class="plate-part"><span>${esc(fa(p.a))}</span></div><div class="plate-part"><span>${esc(p.letter)}</span></div><div class="plate-part"><span>${esc(fa(p.c))}</span></div><div class="plate-part plate-code"><span>${esc(fa(p.province))}</span></div></div>`;
}
// Reusable segmented input. Its hidden value is sent only after validation;
// unrecognised legacy values remain intact until the user deliberately edits them.
function plateEditorHtml(value='',vehicleType='',name='plate'){
  const raw=String(value??''), p=parsePlate(raw), car=!!formatPlate(p);
  const motor=en(raw).replace(/\s/g,'').match(/^(\d{3})-?(\d{5})$/);
  const isMotor=/موتور/.test(String(vehicleType));
  const letters=['ب','پ','ت','ث','ج','چ','ح','خ','د','ذ','ر','ز','ژ','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ک','گ','ل','م','ن','و','ه','ی'];
  const noCar=isMotor?' hidden':'', noMotor=isMotor?'':' hidden';
  return `<div data-plate-editor data-dirty="0" data-motor="${isMotor?'1':'0'}" data-original="${esc(raw)}"><input type="hidden" name="${esc(name)}" value="${esc(raw)}" data-plate-value><div class="iran-plate plate-editor${isMotor?' is-motor':''}" dir="ltr"><div class="blue-strip"><span>IR<br>ایران</span></div><div class="plate-part" data-car${noCar}><input data-plate-a maxlength="2" inputmode="numeric" autocomplete="off" aria-label="دو رقم اول پلاک" placeholder="۱۲" value="${car?esc(fa(p.a)):''}"></div><div class="plate-part plate-letter-part" data-car${noCar}><select data-plate-letter aria-label="حرف پلاک"><option value="">—</option>${letters.map(l=>`<option value="${l}" ${car&&l===p.letter?'selected':''}>${l}</option>`).join('')}</select></div><div class="plate-part" data-car${noCar}><input data-plate-c maxlength="3" inputmode="numeric" autocomplete="off" aria-label="سه رقم پلاک" placeholder="۳۴۵" value="${car?esc(fa(p.c)):''}"></div><div class="plate-part plate-code" data-car${noCar}><input data-plate-province maxlength="2" inputmode="numeric" autocomplete="off" aria-label="کد استان" placeholder="۶۷" value="${car?esc(fa(p.province)):''}"></div><div class="plate-part motor-top" data-motor${noMotor}><input data-motor-a maxlength="3" inputmode="numeric" autocomplete="off" aria-label="سه رقم بالای پلاک موتور" value="${motor?esc(fa(motor[1])):''}" placeholder="۱۲۳"></div><div class="plate-part motor-bottom" data-motor${noMotor}><input data-motor-b maxlength="5" inputmode="numeric" autocomplete="off" aria-label="پنج رقم پایین پلاک موتور" value="${motor?esc(fa(motor[2])):''}" placeholder="۴۵۶۷۸"></div></div>${raw&&(!car&&!motor||(isMotor&&!motor)||(!isMotor&&!car))?`<small class="plate-legacy-note">پلاک قبلی با قالب استاندارد قابل تشخیص نیست و بدون تغییر حفظ می‌شود: ${esc(raw)}. برای اصلاح، بخش‌های پلاک را تکمیل کنید.</small>`:''}</div>`;
}
function bindPlateEditor(form, vehicleTypeControl){
  const root=form.querySelector('[data-plate-editor]');if(!root||root.dataset.bound==='1')return;root.dataset.bound='1';
  const select=vehicleTypeControl||form.querySelector('[name="vehicleType"]');
  const syncMode=()=>{const motor=/موتور/.test(String(select?.value||''));if(root.dataset.motor===(motor?'1':'0'))return;root.dataset.motor=motor?'1':'0';root.dataset.dirty='1';root.querySelector('.iran-plate').classList.toggle('is-motor',motor);root.querySelectorAll('[data-car]').forEach(x=>x.hidden=motor);root.querySelectorAll('[data-motor]').forEach(x=>x.hidden=!motor);};
  if(select){if(select._plateSync){select.removeEventListener('change',select._plateSync);select.removeEventListener('input',select._plateSync);}select._plateSync=syncMode;select.addEventListener('change',syncMode);select.addEventListener('input',syncMode);}
  root.addEventListener('input',e=>{if(e.target.matches('input:not([type="hidden"])'))e.target.value=plateDigits(e.target.value,Number(e.target.maxLength)||5);root.dataset.dirty='1';});
  root.addEventListener('change',()=>{root.dataset.dirty='1';});
}
function plateEditorValue(form,{required=false}={}){
  const root=form.querySelector('[data-plate-editor]');if(!root)return '';
  const original=root.dataset.original||'';
  if(root.dataset.dirty!=='1'&&original)return original;
  const val=s=>root.querySelector(s)?.value||'';
  let result='',hasDigits=false;
  if(root.dataset.motor==='1'){
    const a=en(val('[data-motor-a]')),b=en(val('[data-motor-b]'));hasDigits=!!(a||b);
    if(/^\d{3}$/.test(a)&&/^\d{5}$/.test(b))result=`${a}-${b}`;
  }else{
    const p={a:val('[data-plate-a]'),letter:val('[data-plate-letter]'),c:val('[data-plate-c]'),province:val('[data-plate-province]')};
    hasDigits=!!(p.a||p.c||p.province);result=formatPlate(p);
  }
  if(!hasDigits&&!required)return '';
  if(!result)throw new Error(root.dataset.motor==='1'?'پلاک موتورسیکلت را با سه رقم بالا و پنج رقم پایین کامل وارد کنید.':'پلاک را کامل وارد کنید: دو رقم، حرف، سه رقم و کد دو رقمی استان.');
  return result;
}
function plateMarkup(p){const letters=['ب','پ','ت','ث','ج','چ','ح','خ','د','ذ','ر','ز','ژ','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ک','گ','ل','م','ن','و','ه','ی'];return `<div class="iran-plate"><div class="blue-strip"><span>IR<br>ایران</span></div><div class="plate-part"><input class="plate-a" maxlength="2" inputmode="numeric" value="${esc(p.a||'')}" placeholder="۱۲"></div><div class="plate-part"><select class="plate-letter">${letters.map(l=>`<option ${l===(p.letter||'ب')?'selected':''}>${l}</option>`).join('')}</select></div><div class="plate-part"><input class="plate-c" maxlength="3" inputmode="numeric" value="${esc(p.c||'')}" placeholder="۳۴۵"></div><div class="plate-part plate-code"><input class="plate-province" maxlength="2" inputmode="numeric" value="${esc(p.province||'')}" placeholder="۶۷"></div></div><div class="plate-preview">${formatPlate(p)||'نمونه: ۱۲ ب ۳۴۵ - ۶۷'}</div>`}
function bindPlate(){const box=$('#plateBox'),form=$('#gateForm');if(!box||!form)return;bindPlateEditor(form);box.oninput=box.onchange=()=>debouncePlateSearch();}
// A shared plate cannot identify a customer; use the explicit customer search instead.
function debouncePlateSearch(){if($('#plateSuggest'))$('#plateSuggest').innerHTML='';}
async function searchCustomers(raw){if(!raw||app.pickupSelected)return $('#plateSuggest').innerHTML='';try{const q=raw||'';const d=await api('/api/customers/search?q='+encodeURIComponent(q));if(app.pickupSelected||!$('#plateSuggest'))return;app.customerMatches=d.customers||[];$('#plateSuggest').innerHTML=app.customerMatches.length?app.customerMatches.slice(0,5).map((c,i)=>`<button type="button" class="suggestion" data-action="pick-customer" data-index="${i}"><main><b>${esc(c.name)}</b><span>${plateViewHtml(c.plate, '—', true)} • ${esc(c.phone||'')}</span></main><span>${icon('arrow',16)}</span></button>`).join(''):''}catch{}}
function pickCustomer(i){const c=app.customerMatches[i];if(!c)return;const f=$('#gateForm');if(!f)return;f.elements.name.value=c.name||'';f.elements.phone.value=c.phone||'';f.elements.vehicleType.value=c.vehicleType||'خودرو';$('#plateBox').innerHTML=plateEditorHtml(c.plate||'',f.elements.vehicleType.value);$('#plateSuggest').innerHTML='';bindPlate();toast('سوابق مشتری بازیابی شد.')}
async function openExit(id){try{const d=await api('/api/orders/'+id);const o=d.order;$('#exitEditor').innerHTML=`<div class="card card-pad" style="border-color:#e7b6bc"><div class="panel-head"><div><span class="eyebrow">FINAL CHECK</span><h2>کنترل خروج — ${esc(fa(o.payment?.invoiceNumber||o.orderNo||'—'))}</h2><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px"><span>${esc(storeAwareOrderName(o))}</span>${plateViewHtml(o.customer?.plate, 'بدون پلاک', true)}</div></div><div class="toolbar"><button class="btn btn-secondary btn-sm" data-action="invoice" data-id="${id}">${icon('receipt',15)} فاکتور</button></div></div><div class="section-space" style="display:grid;gap:8px">${o.items.filter(i=>i.itemStatus!=='CANCELLED').map(i=>`<label class="queue-item"><span><input type="checkbox" data-exit-item="${i.id}" checked style="margin-left:8px;accent-color:var(--brand)"><strong>${esc(i.product?.name||'—')}</strong><span style="display:block;color:var(--muted);font-size:12px;margin-top:2px">${qty(i.deliveredKg)} کیلوگرم • ${money(i.finalAmount)}</span></span>${badge(i.itemStatus)}</label>`).join('')}</div><div class="sticky-actions"><span class="subtle">همه اقلام فاکتور را با بار واقعی تطبیق دهید.</span><button class="btn btn-success" data-action="confirm-exit" data-id="${id}">${icon('check',17)} ثبت خروج نهایی</button></div></div>`}catch(e){toast(e.message)}}
/* v37.34.0 — تأیید خروج نگهبانی: بازخورد درون‌برگه‌ای و وضعیت «در حال ثبت»،
   تا کلیک روی «ثبت خروج نهایی» در هیچ شرایطی (شبکهٔ کند/قلم بدون تیک) بی‌واکنش به نظر نرسد. */
async function confirmExit(id){
  const boxes=$$('[data-exit-item]');
  const checked=boxes.filter(x=>x.checked).map(x=>x.dataset.exitItem);
  const msg=$('#exitMsg');
  const showErr=(t)=>{if(msg){msg.textContent=t;msg.hidden=false;}toast(t);};
  boxes.forEach(x=>{const row=x.closest('.gt-check');if(row)row.classList.toggle('gt-check-missing',!x.checked);});
  if(checked.length!==boxes.length){
    showErr('ابتدا همهٔ اقلام بار را کنترل و تیک بزنید؛ ردیف‌های بدون تیک با کادر قرمز مشخص شدند.');
    const first=boxes.find(x=>!x.checked); if(first)first.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  const btn=document.querySelector('[data-action="confirm-exit"]');
  if(btn){if(btn.disabled)return;btn.disabled=true;btn.dataset.exitLabel=btn.innerHTML;btn.innerHTML='در حال ثبت خروج…';btn.setAttribute('aria-busy','true');}
  if(msg){msg.hidden=true;msg.textContent='';}
  try{
    await api('/api/orders/'+id+'/exit',{method:'POST',body:JSON.stringify({checkedItems:checked})});
    toast('خروج نهایی ثبت شد.');
    await renderGate('exit');
  }catch(e){
    if(btn&&document.contains(btn)){btn.disabled=false;btn.innerHTML=btn.dataset.exitLabel||btn.innerHTML;btn.removeAttribute('aria-busy');}
    showErr(e.message||'ثبت خروج انجام نشد؛ دوباره تلاش کنید.');
  }
}

/* ---------- Sales ---------- */
async function refreshSalesTab(tab){
  const role=normalizeRole(app.user?.roleCode);
  if(role!=='sales' && role!=='admin') return;
  try{
    if(app.page!=='sales' || app.sub.sales!==tab) return;
    if(tab==='intake'){
      const visits=(await api('/api/visits')).visits||[];
      const list=$('#salesVisitList');
      if(list && !$('#orderEntryPage')) list.innerHTML=salesVisitRows(visits.filter(v=>v.status==='WAITING_SALES'));
    } else if(tab==='orders'){
      const orders=(await api('/api/orders')).orders||[];
      const body=$('.sales-orders-body');
      if(body) body.innerHTML=renderSalesOrdersBody(orders.filter(o=>['WAREHOUSE_PENDING','RETURNED_TO_SALES'].includes(o.status)));
    } else if(tab==='settlement'){
      const orders=(await api('/api/orders')).orders||[];
      const active=orders.filter(o=>o.status==='SETTLEMENT_PENDING');
      const wrap=$('.settlement-queue-list');
      if(wrap) wrap.innerHTML=active.map(o=>`<button class=\"settlement-queue-row\" data-action=\"select-settlement\" data-id=\"${o.id}\"><div class=\"sq-leading\"><span class=\"sq-number\">${esc(fa(o.orderNo||'—'))}</span><div><strong>${esc(storeAwareOrderName(o))}</strong><span>${plateViewHtml(o.customer?.plate, 'بدون پلاک', true)} • ${esc(storeAwareOrderPhone(o))}</div></div><div class=\"sq-middle\"><span>${qty(o.items.filter(i=>i.itemStatus!=='CANCELLED').length)} قلم</span><span>تحویل ${dt(o.updatedAt||o.createdAt)}</div><div class=\"sq-action\"><span class=\"badge blue\">آماده تسویه</span>${icon('arrow',18)}</div></button>`).join('')||'<div class=\"empty\">سفارشی برای تسویه وجود ندارد.</div>';
    }
    await refreshIndicators();
  }catch{}
}
function htmlToElement(html){const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild||document.createElement('div')}
function renderSalesIntake(visits){return `<div class="workspace-grid"><section class="card workspace-card"><div class="panel-head"><div><span class="eyebrow">SALES INTAKE</span><h2>مراجعه‌کنندگان منتظر ثبت سفارش</h2><p>برای هر مراجعه‌کننده، سفارش در یک فرم مستقل و واضح ثبت می‌شود.</p></div><div class="toolbar"><span class="count-chip">${qty(visits.length)}</div></div><div class="field section-space"><div class="input-shell"><span>${icon('search',17)}</span><input id="salesSearch" placeholder="جستجوی نام، تلفن یا پلاک"></div></div><div id="salesVisitList" class="queue-list section-space">${salesVisitRows(visits)}</div></section></div>`}
function salesVisitRows(visits){return visits.map(v=>`<button class="queue-item" data-action="open-order" data-id="${v.id}"><div class="queue-main"><div class="queue-avatar">${esc(initials(v.customer?.name||''))}</div><div class="queue-copy"><strong>${esc(v.customer?.name||'—')}</strong><span>${plateViewHtml(v.customer?.plate, 'بدون پلاک', true)} • ${esc(v.customer?.phone||'')}</div></div><div class="queue-actions"><span class="subtle">ورود به فرم سفارش</span>${icon('arrow',16)}</div></button>`).join('')||'<div class="empty">مراجعه‌کننده منتظر سفارش وجود ندارد.</div>'}
// یک جست‌وجوی مستقل برای هر ردیف؛ پاسخ قدیمی نباید انتخاب جدید را بازنویسی کند.
const productSearchStates=new WeakMap();
function productPickerInfo(inp){
  if(inp.dataset.productSearch!==undefined){const i=inp.dataset.productSearch;return {box:$(`[data-suggest-for="${i}"]`),row:app.orderDraft?.[i]};}
  if(inp.dataset.opProductSearch!==undefined){const value=inp.dataset.opProductSearch,cut=value.lastIndexOf('-'),prefix=value.slice(0,cut),i=value.slice(cut+1);const key=({phone:'phoneDraft',remote:'remoteDraft',future:'futureDraft',store:'storeDraft',storeedit:'storeEditDraft',storeaddition:'storeAdditionDraft',sales:'orderDraft',onsite:'orderDraft'})[prefix];return {box:$(`[data-op-suggest="${value}"]`),row:app[key]?.[i]};}
  if(inp.dataset.returnProductSearch!==undefined){const i=inp.dataset.returnProductSearch;return {box:$(`[data-return-suggest="${i}"]`),row:app.returnEdit?.items?.[i]};}
  if(inp.dataset.ssProductSearch!==undefined){const i=inp.dataset.ssProductSearch;return {box:$(`[data-ss-suggest="${i}"]`),row:app.salesStoreEdit?.items?.[i]};}
  return null;
}
function searchProductOptions(inp,box,q,render){
  if(!inp||!box)return;let state=productSearchStates.get(inp)||{seq:0};clearTimeout(state.timer);state.seq++;const seq=state.seq;state.active=-1;state.pending=!!q.trim();state.chooseWhenReady=false;productSearchStates.set(inp,state);box.innerHTML='';inp.setAttribute('role','combobox');inp.setAttribute('aria-expanded','false');
  if(!q.trim())return;
  state.timer=setTimeout(async()=>{try{
    const d=await api('/api/products/search?q='+encodeURIComponent(q.trim()));
    if(state.seq!==seq||!inp.isConnected||inp.value!==q)return;
    box.innerHTML=(d.products||[]).map(render).join('')||'<div class="empty compact-empty">محصولی با این عبارت پیدا نشد.</div>';state.pending=false;inp.setAttribute('aria-expanded',String(!!box.querySelector('button')));
    if(state.chooseWhenReady&&document.activeElement===inp){const first=box.querySelector('button');if(first)first.click();else toast('محصولی پیدا نشد.');}
  }catch(e){if(state.seq===seq){box.innerHTML='';state.pending=false;if(state.chooseWhenReady)toast('خطا در جست‌وجوی محصول.');}}},180);
}
document.addEventListener('input',e=>{
  const inp=e.target;if(!inp?.dataset)return;const info=productPickerInfo(inp);if(!info)return;
  if(info.row){info.row.productId='';info.row.productLabel=inp.value;info.row.quickCode='';if(inp.dataset.productSearch!==undefined)updateOrderDraftSummary();else if(inp.dataset.opProductSearch!==undefined){const prefix=inp.dataset.opProductSearch.split('-')[0],key=({phone:'phoneDraft',remote:'remoteDraft',future:'futureDraft',store:'storeDraft'})[prefix];if(key)updateOpSummary(key,`${prefix}-summary`);}}
  const marker=inp.closest('.cell-product,.product-box')?.querySelector('.sd-picked-inline,.sd-picked,.v26-product-picked');if(marker){marker.textContent='هنوز محصول انتخاب نشده است';marker.classList.add('none');}
},true);
document.addEventListener('keydown',e=>{
  if(e.isComposing)return;const inp=e.target;if(!inp?.dataset)return;const info=productPickerInfo(inp);if(!info)return;
  const state=productSearchStates.get(inp),options=Array.from(info.box?.querySelectorAll('button')||[]);
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    if(!options.length)return;e.preventDefault();e.stopImmediatePropagation();const delta=e.key==='ArrowDown'?1:-1;
    state.active=state.active<0?(delta>0?0:options.length-1):(state.active+delta+options.length)%options.length;
    options.forEach((x,i)=>{x.classList.toggle('keyboard-active',i===state.active);x.setAttribute('aria-selected',String(i===state.active));});options[state.active].scrollIntoView?.({block:'nearest'});return;
  }
  if(e.key==='Escape'&&info.box){info.box.innerHTML='';inp.setAttribute('aria-expanded','false');if(state){state.seq++;state.pending=false;}return;}
  if(e.key==='Enter'&&(options.length||(!info.row?.productId&&inp.value.trim()))){
    e.preventDefault();e.stopImmediatePropagation();if(options.length)options[state?.active>=0?state.active:0].click();else if(state?.pending)state.chooseWhenReady=true;else toast('ابتدا محصولی از فهرست انتخاب کنید.');
  }
},true);
function productSearch(i,q){
  const inp=$(`[data-product-search="${i}"]`),box=$(`[data-suggest-for="${i}"]`);
  searchProductOptions(inp,box,q,p=>`<button type="button" class="product-option" data-action="pick-product" data-index="${i}" data-product-id="${esc(p.id)}" data-label="${esc(p.name)}" data-quick="${esc(p.quickCode)}"><span><b>${esc(p.name)}</b><span>${esc(p.quickCode)} • واحد پایه ${esc(p.defaultUnit)}</span></span>${icon('check',15)}</button>`);
}
function pickProduct(i,id,label,quick){const p=app.orderDraft[i];if(!p)return;p.productId=id;p.productLabel=label;p.quickCode=quick||'';const list=$(`[data-suggest-for="${i}"]`);if(list)list.innerHTML='';renderOrderLines();updateOrderDraftSummary();const qtyInput=$(`#orderLines [data-qty="${i}"]`);if(qtyInput){qtyInput.focus();qtyInput.select?.();}toast('محصول انتخاب شد.')}
function renderSalesOrders(orders){return `<section class="card card-pad sales-orders-container"><div class="panel-head"><div><span class="eyebrow">ORDER CONTROL</span><h2>سفارش‌های در جریان</h2><p>جزئیات کامل سفارش، وضعیت انبار و سفارش‌های برگشتی به فروش در این بخش قابل مشاهده است.</p></div><span class="pill"><span class="status-dot"></span> بروزرسانی زنده</span></div><div class="table-wrap section-space"><table class="table"><thead><tr><th>سفارش</th><th>مشتری</th><th>اقلام</th><th>وضعیت</th><th>زمان</th><th>عملیات</th></tr></thead><tbody class="sales-orders-body">${renderSalesOrdersBody(orders)}</tbody></table></div></section>`}
function renderSalesOrdersBody(orders){return orders.map(o=>`<tr><td><b style="color:var(--brand)">${esc(fa(o.orderNo||'—'))}</b></td><td><strong>${esc(storeAwareOrderName(o))}</strong><div class="subtle">${esc(storeAwareOrderPhone(o))}</div></td><td>${qty(o.items.filter(i=>i.itemStatus!=='CANCELLED').length)} قلم<div class="subtle">${qty(o.items.reduce((s,i)=>s+n(i.requestedQty),0))} واحد درخواستی</div></td><td>${badge(o.status)}</td><td>${dt(o.updatedAt||o.createdAt)}</td><td><div class="toolbar"><button class="btn btn-secondary btn-sm" data-action="order-details" data-id="${o.id}">${icon('eye',15)} جزئیات</button>${o.status==='RETURNED_TO_SALES'?`<button class="btn btn-secondary btn-sm" data-action="edit-returned-order" data-id="${o.id}">${icon('edit',15)} اصلاح سفارش</button><button class="btn btn-primary btn-sm" data-action="resubmit-order" data-id="${o.id}">${icon('arrow',15)} ارسال مجدد به انبار</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="6" class="empty">سفارشی در جریان نیست.</td></tr>'}
// The return message is separate from customer notes and survives line edits.
function warehouseReturnNoteHtml(o){
  const note=o?.status==='RETURNED_TO_SALES'&&o.warehouseReturn;
  if(!note?.reason)return '';
  const item=note.itemId?(o.items||[]).find(i=>i.id===note.itemId):null;
  return `<div class="warehouse-return-note"><b>پیام ارجاع به فروش${item?` — ${esc(item.product?.name||'قلم سفارش')}`:''}</b><span>${esc(note.reason)}</span></div>`;
}
async function openReturnedOrderEditor(id){
  try{
    const d=await api('/api/orders/'+id); const o=d.order;
    if(o.status!=='RETURNED_TO_SALES') return toast('این سفارش در وضعیت قابل اصلاح نیست.');
    app.returnEdit={orderId:id,orderType:o.orderType,deletedIds:[],items:(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').map(i=>({id:i.id,productId:i.productId,productLabel:i.product?.name||'',requestedQty:i.requestedQty,requestedUnit:i.requestedUnit,description:i.description||''}))};
    renderReturnedOrderEditor(o);
  }catch(e){toast(e.message)}
}
function renderReturnedOrderEditor(o){
  const items=app.returnEdit?.items||[];
  openModal('اصلاح سفارش برگشتی به فروش',`<div class="returned-editor"><div class="returned-editor-head"><div><span class="eyebrow">ORDER CORRECTION</span><h2>اصلاح سفارش ${esc(fa(o.orderNo||'—'))}</h2><p>${esc(storeAwareOrderName(o))} • ${esc(storeAwareOrderPhone(o))}</p></div><span class="badge orange">برگشتی از انبار</span></div>${warehouseReturnNoteHtml(o)}<div class="returned-editor-note">در این بخش می‌توانید محصول، مقدار، واحد و توضیحات هر ردیف را ویرایش کنید، ردیف جدید اضافه کنید یا ردیف موجود را حذف کنید. همه تغییرات با نام کاربر در سوابق فعالیت ثبت می‌شود.</div><div id="returnedEditLines" class="returned-edit-lines"></div><div class="returned-editor-bottom"><button class="btn btn-secondary btn-lg" data-action="returned-add-line">${icon('plus',17)} افزودن ردیف</button><span class="subtle">تعداد ردیف فعال: ${qty(items.length)}</div><div class="modal-actions"><button class="btn btn-secondary" data-action="close-modal">انصراف</button><button class="btn btn-primary btn-lg" data-action="save-returned-order" data-id="${esc(o.id)}">ذخیره اصلاحات</button></div></div>`);
  const modalCard=$('.modal-card'); if(modalCard) modalCard.classList.add('returned-modal-card');
  renderReturnedEditLines(o);
}
function renderReturnedEditLines(o){
  const box=$('#returnedEditLines'); if(!box)return;
  const items=app.returnEdit?.items||[];
  box.innerHTML=items.map((x,i)=>`<div class="returned-edit-row bt-product-row-v35 bt-returned-order-row-v35" data-edit-row="${i}"><div class="returned-edit-index">${fa(String(i+1))}</div><div class="order-field"><label>محصول</label><div class="input-shell input-xl"><span>${icon('search',16)}</span><input value="${esc(x.productLabel||'')}" data-return-product-search="${i}" placeholder="نام یا کد سریع" autocomplete="off"></div><div class="product-suggest" data-return-suggest="${i}"></div></div><div class="order-field"><label>مقدار درخواستی</label><div class="input-shell input-xl quantity-shell"><input data-return-qty="${i}" inputmode="decimal" type="number" min="0" step="0.001" value="${esc(x.requestedQty)}"></div></div><div class="order-field"><label>واحد</label><div class="input-shell input-xl"><select data-return-unit="${i}"><option ${x.requestedUnit==='کیلوگرم'?'selected':''}>کیلوگرم</option><option ${x.requestedUnit==='بسته'?'selected':''}>بسته</option><option ${x.requestedUnit==='عدد'?'selected':''}>عدد</option><option ${x.requestedUnit==='کارتن'?'selected':''}>کارتن</option></select></div></div><div class="order-field return-description-field"><label>توضیحات</label><div class="input-shell input-xl"><textarea data-return-description="${i}" rows="2" placeholder="توضیحات این ردیف...">${esc(x.description||'')}</textarea></div></div><button class="btn btn-ghost btn-sm returned-delete-btn" data-action="returned-delete-line" data-index="${i}" aria-label="حذف ردیف">${icon('trash',16)} حذف</button></div>`).join('') || '<div class="empty">قلمی برای اصلاح باقی نمانده است.</div>';
  $$('#returnedEditLines [data-return-product-search]').forEach(inp=>inp.addEventListener('input',()=>returnedProductSearch(Number(inp.dataset.returnProductSearch),inp.value)));
  $$('#returnedEditLines [data-return-qty]').forEach(inp=>inp.addEventListener('input',()=>{app.returnEdit.items[Number(inp.dataset.returnQty)].requestedQty=inp.value;}));
  $$('#returnedEditLines [data-return-unit]').forEach(sel=>sel.addEventListener('change',()=>{app.returnEdit.items[Number(sel.dataset.returnUnit)].requestedUnit=sel.value;}));
  $$('#returnedEditLines [data-return-description]').forEach(inp=>inp.addEventListener('input',()=>{app.returnEdit.items[Number(inp.dataset.returnDescription)].description=inp.value;}));
}
function returnedProductSearch(i,q){
  searchProductOptions($(`[data-return-product-search="${i}"]`),$(`[data-return-suggest="${i}"]`),q,p=>`<button type="button" class="product-option" data-action="pick-return-product" data-index="${i}" data-product-id="${esc(p.id)}" data-label="${esc(p.name)}"><span><b>${esc(p.name)}</b><span>${esc(p.defaultUnit)}</span></span>${icon('check',15)}</button>`);
}
function pickReturnedProduct(i,id,label){if(!app.returnEdit?.items?.[i])return;app.returnEdit.items[i].productId=id;app.returnEdit.items[i].productLabel=label;const inp=$(`[data-return-product-search="${i}"]`);if(inp)inp.value=label;const box=$(`[data-return-suggest="${i}"]`);if(box)box.innerHTML='';$(`[data-return-qty="${i}"]`)?.focus();}
function addReturnedLine(){app.returnEdit.items.push({id:null,productId:'',productLabel:'',requestedQty:'',requestedUnit:'کیلوگرم',description:''});const d={customer:{name:'',phone:''}};renderReturnedEditLines(d);toast('ردیف جدید اضافه شد.');}
async function deleteReturnedLine(i){const x=app.returnEdit?.items?.[i];if(!x)return;if(app.returnEdit.items.length<=1)return toast('حداقل یک قلم باید در سفارش باقی بماند.');if(x.id)app.returnEdit.deletedIds.push(x.id);app.returnEdit.items.splice(i,1);renderReturnedEditLines({});toast('ردیف برای حذف علامت‌گذاری شد؛ با ذخیره اصلاحات نهایی می‌شود.');}
function renderSettlement(orders){return `<section class="card card-pad settlement-queue-shell"><div class="settlement-queue-head"><div><span class="eyebrow">FINANCE DESK</span><h2>مرکز تسویه فروش</h2><p>هر سفارش در این مرحله با یک فرم مستقل و رسمی مشابه فاکتور تسویه می‌شود.</p></div><div class="settlement-queue-summary"><strong>${qty(orders.length)}</strong><span>سفارش آماده تسویه</span></div></div><div class="settlement-queue-list section-space">${orders.map(o=>`<button class="settlement-queue-row" data-action="select-settlement" data-id="${o.id}"><div class="sq-leading"><span class="sq-number">${esc(fa(o.orderNo||'—'))}</span><div><strong>${esc(storeAwareOrderName(o))}</strong><span>${plateViewHtml(o.customer?.plate, 'بدون پلاک', true)} • ${esc(storeAwareOrderPhone(o))}</div></div><div class="sq-middle"><span>${qty(o.items.filter(i=>i.itemStatus!=='CANCELLED').length)} قلم</span><span>تحویل ${dt(o.updatedAt||o.createdAt)}</div><div class="sq-action"><span class="badge blue">آماده تسویه</span>${icon('arrow',18)}</div></button>`).join('')||'<div class="empty">سفارشی برای تسویه وجود ندارد.</div>'}</div></section>`}
async function reopenSettlementToWarehouse(id){
  if(!confirm('این سفارش برای بررسی مجدد و آماده‌سازی دوباره به انبار ارجاع شود؟'))return;
  try{
    const r=await api('/api/orders/'+id+'/warehouse/reopen-preparing',{method:'POST',body:'{}'});
    toast('سفارش به مرحله آماده‌سازی انبار برگشت داده شد.');
    app.selectedSettlement=null;
    await renderSales('flow');
  }catch(e){toast(e.message)}
}
async function selectSettlement(id){
  try{
    const [d,priceData]=await Promise.all([api('/api/orders/'+id),api('/api/prices')]);
    const prices=priceData.prices||[]; const priceMap=Object.fromEntries(prices.map(x=>[x.productId,x.price]));
    app.selectedSettlement=id; app.settlementFingerprintRef=''; app.settlementNoFingerprintAllowed=true;
    app.settleDraft=(d.order.items||[]).map(i=>({...i,unitPrice:i.unitPrice||priceMap[i.productId]||0,cancelled:i.itemStatus==='CANCELLED'}));
    renderSettlementForm(d.order);
  }catch(e){toast(e.message)}
}
function totalSettlement(){return (app.settleDraft||[]).reduce((s,i)=>s+(i.cancelled?0:n(i.deliveredKg)*n(i.unitPrice)),0)}
function updateSettlementTotal(){(app.settleDraft||[]).forEach((i,idx)=>{const el=$(`[data-amount="${idx}"]`);if(el)el.textContent=money(i.cancelled?0:n(i.deliveredKg)*n(i.unitPrice))});const sub=$('#settleSubtotal');if(sub)sub.textContent=money(totalSettlement());const t=$('#settleTotal');if(t)t.textContent=money(totalSettlement())}
function bindSettlementFields(){
  $$('[data-price]').forEach(x=>{
    x.addEventListener('focus',()=>{if(n(x.value)===0){x.value='';}});
    x.addEventListener('input',()=>{
      const idx=Number(x.dataset.price);const numeric=n(x.value);
      app.settleDraft[idx].unitPrice=numeric;
      x.value=formatPriceInput(numeric);
      try{x.setSelectionRange(x.value.length,x.value.length)}catch{}
      updateSettlementTotal();
    });
    x.addEventListener('blur',()=>{x.value=formatPriceInput(app.settleDraft[Number(x.dataset.price)].unitPrice)});
  });
  $$('[data-cancel]').forEach(x=>x.addEventListener('change',()=>{app.settleDraft[Number(x.dataset.cancel)].cancelled=x.checked;updateSettlementTotal()}));
  $('#allowNoFingerprint')?.addEventListener('change',e=>{app.settlementNoFingerprintAllowed=e.target.checked;updateVerificationUI()});
}
function bindSettlementCanvas(){const c=$('#signatureCanvas');if(!c)return;const ctx=c.getContext('2d');const scale=Math.max(1,window.devicePixelRatio||1);const rect=c.getBoundingClientRect();c.width=Math.max(1,rect.width*scale);c.height=Math.max(1,rect.height*scale);ctx.scale(scale,scale);ctx.lineWidth=2.3;ctx.lineCap='round';ctx.strokeStyle='#1d222a';let down=false,last=null,strokes=0;const pos=e=>{const r=c.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};c.addEventListener('pointerdown',e=>{e.preventDefault();down=true;strokes++;last=pos(e);c.setPointerCapture?.(e.pointerId)});c.addEventListener('pointermove',e=>{if(!down)return;e.preventDefault();const p=pos(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;app.signature.has=true});c.addEventListener('pointerup',e=>{down=false;c.releasePointerCapture?.(e.pointerId)});c.addEventListener('pointercancel',()=>down=false);c.style.touchAction='none';app.signature={canvas:c,has:false}}
function updateVerificationUI(){
  const status=$('#fingerStatusBadge'), text=$('#fingerStatusText'), result=$('#fingerResult'), summary=$('#verificationSummary');
  const hasFp=!!app.settlementFingerprintRef;
  if(hasFp){ if(status){status.className='verify-badge success';status.textContent='احراز شد'} if(text)text.textContent='اثر انگشت با موفقیت ثبت شده است.'; if(result)result.textContent='مرجع احراز ثبت شد و در فاکتور نمایش داده می‌شود.'; if(summary)summary.textContent='اثر انگشت ثبت شد • آماده تایید'}
  else if(app.settlementNoFingerprintAllowed){if(status){status.className='verify-badge allowed';status.textContent='بدون اثر انگشت'}if(text)text.textContent='این تسویه با مجوز بدون اثر انگشت انجام می‌شود.';if(result)result.textContent='تسویه دستی فعال است.';if(summary)summary.textContent='امضا + مجوز بدون اثر انگشت'}
  else {if(status){status.className='verify-badge pending';status.textContent='نیازمند اثر انگشت'}if(text)text.textContent='برای نهایی‌سازی، احراز اثر انگشت لازم است.';if(result)result.textContent='اثر انگشت ثبت نشده است.';if(summary)summary.textContent='منتظر احراز اثر انگشت'}
}
async function fingerprintCapture(){toast('ثبت اثر انگشت موقتاً غیرفعال است.');}
function clearSignature(){const c=$('#signatureCanvas');const ctx=c?.getContext('2d');if(c&&ctx){ctx.clearRect(0,0,c.width,c.height);app.signature.has=false}updateVerificationUI()}
function renderInvoices(orders){return `<section class="card card-pad"><div class="panel-head"><div><span class="eyebrow">INVOICE CENTER</span><h2>فاکتورهای صادرشده</h2><p>نمایش، چاپ و پیگیری فاکتورهای نهایی</p></div><span class="pill">${qty(orders.length)} فاکتور</span></div><div class="table-wrap section-space"><table class="table"><thead><tr><th>شماره فاکتور</th><th>مشتری</th><th>پلاک</th><th>مبلغ</th><th>اطلاعات</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>${orders.flatMap(o=>(o.payments&&o.payments.length>1?o.payments:[o.payment]).filter(Boolean).map(pay=>{const run=pay.deliveryRun||null;return `<tr><td><b style="color:var(--brand)">${esc(fa(pay.invoiceNumber||'—'))}${run?` <span class="st-run-chip st-run-r${run}">سرویس ${run===2?'دوم':'اول'}</span>`:''}</b></td><td>${esc(storeAwareOrderName(o))}</td><td>${plateViewHtml(o.customer?.plate, 'بدون پلاک', true)}</td><td>${o.orderType==='STORE'?'سند وزنی — بدون مبلغ':money(pay.totalAmount)}</td><td>${verificationBadges(pay)}</td><td>${badge(o.status)}</td><td><div class="toolbar"><button class="btn btn-secondary btn-sm" data-action="invoice" data-id="${o.id}"${run?` data-run="${run}"`:''}>${icon('eye',15)} مشاهده</button><button class="btn btn-primary btn-sm" data-action="print-invoice" data-id="${o.id}"${run?` data-run="${run}"`:''}>${icon('receipt',15)} چاپ</button></div></td></tr>`})).join('')||'<tr><td colspan="7" class="empty">فاکتور نهایی ندارید.</td></tr>'}</tbody></table></div></section>`}
function verificationBadges(p){return p ? '<span class="mini-verify">اطلاعات مشتری</span>' : '—';}
function bindSales(tab){$('#content').onclick=async e=>{const sub=e.target.closest('[data-sub]');if(sub){const [k,v]=sub.dataset.sub.split(':');app.sub[k]=v;await renderSales(v);return}const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;if(a==='open-order')return openOrder(el.dataset.id);if(a==='back-order-intake'){app.orderDraft=[];return renderSales('onsite');}if(a==='order-details')return openOrderDetails(el.dataset.id);if(a==='edit-returned-order')return openReturnedOrderEditor(el.dataset.id);if(a==='resubmit-order')return resubmitOrder(el.dataset.id);if(a==='add-line'){app.orderDraft.push({productId:'',requestedQty:'',requestedUnit:'کیلوگرم',description:''});renderOrderLines();return}if(a==='remove-line'){app.orderDraft.splice(Number(el.dataset.index),1);if(!app.orderDraft.length)app.orderDraft=[{productId:'',requestedQty:'',requestedUnit:'کیلوگرم',description:''}];renderOrderLines();return}if(a==='pick-product'){return pickProduct(Number(el.dataset.index),el.dataset.productId,el.dataset.label)}if(a==='submit-order')return submitOrder(el.dataset.id);if(a==='select-settlement')return selectSettlement(el.dataset.id);if(a==='back-settlement')return renderSales('settlement');if(a==='final-settle')return finalSettle(el.dataset.id);if(a==='fingerprint-capture')return fingerprintCapture();if(a==='clear-signature'){clearSignature();return}if(a==='invoice')return previewInvoice(el.dataset.id,Number(el.dataset.run)||null);if(a==='print-invoice')return printInvoice(el.dataset.id,Number(el.dataset.run)||null)};
  const search=$('#salesSearch');if(search)search.addEventListener('input',async()=>{const q=search.value.trim().toLowerCase();const visits=(await api('/api/visits')).visits||[];const filtered=visits.filter(v=>v.status==='WAITING_SALES' && [v.customer?.name,v.customer?.phone,v.customer?.plate].some(x=>String(x||'').toLowerCase().includes(q)));$('#salesVisitList').innerHTML=salesVisitRows(filtered)});
}

/* ---------- Warehouse ---------- */
function warehouseRows(orders){return orders.map(o=>`<button class="warehouse-item ${app.selectedWarehouse===o.id?'selected':''}" data-action="open-warehouse" data-id="${o.id}"><div class="warehouse-top"><strong>${esc(storeAwareOrderName(o))}</strong>${badge(o.status)}</div><div class="warehouse-meta">${plateViewHtml(o.customer?.plate, 'بدون پلاک', true)} • ${qty(o.items.filter(i=>i.itemStatus!=='CANCELLED').length)} قلم • ${dt(o.createdAt)}</div></button>`).join('')||'<div class="empty">سفارش جدیدی در صف انبار نیست.</div>'}
async function fetchWarehouseLive(){try{const orders=(await api('/api/orders?status=WAREHOUSE_PENDING')).orders||[];const list=$('#warehouseList');if(!list)return;list.innerHTML=warehouseRows(orders);if(app.selectedWarehouse&&!orders.find(o=>o.id===app.selectedWarehouse)){app.selectedWarehouse=null;$('#warehouseEditor').innerHTML='<div class="empty"><strong style="display:block;color:var(--ink-2);font-size:19px">صف انبار به‌روز شد</strong><span>این سفارش دیگر در صف انبار نیست.</span></div>'}}catch(e){} }
function renderWarehouseEditor(o){
  const activeItems=(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED');
  const rows=activeItems.map((i,k)=>`<article class="warehouse-delivery-card" data-warehouse-item-card="${i.id}"><div class="warehouse-delivery-index">${fa(String(k+1))}</div><div class="warehouse-delivery-product"><div><strong>${esc(i.product?.name||'—')}</strong><div class="warehouse-request-box"><span>درخواست مشتری</span><b>${qty(i.requestedQty)} ${esc(i.requestedUnit)}</b></div></div><div class="warehouse-delivery-desc"><span>توضیحات ردیف</span><p>${esc(i.description||'بدون توضیحات')}</p></div><div class="warehouse-delivery-inputs"><div class="delivery-input-block"><label>وزن تحویلی نهایی</label><div class="weight-input-large"><input type="number" min="0" step="0.001" data-weight="${i.id}" placeholder="0.000"><span>کیلوگرم</span></div></div><label class="oos-toggle-card"><input type="checkbox" data-oos="${i.id}"><span><b>عدم موجودی</b><small>این قلم موجود نیست</small></span></label></div><div class="warehouse-delivery-row-actions"><button class="btn btn-ghost btn-sm" data-action="return-item-sales" data-id="${o.id}" data-item-id="${i.id}">${icon('arrow',14)} ارجاع این ردیف به فروش</button></div></article>`).join('');
  openModal('فرم تحویل سفارش انبار',`<div class="warehouse-delivery-modal"><div class="warehouse-modal-head"><div><span class="eyebrow">WAREHOUSE DELIVERY FORM</span><h2>ثبت تحویل سفارش ${esc(fa(o.orderNo||'—'))}</h2><p>${esc(storeAwareOrderName(o))} • ${esc(storeAwareOrderPhone(o))}</p></div><div class="warehouse-modal-head-stats"><span class="pill">${qty(activeItems.length)} قلم</span><span class="badge orange">در انتظار اقدام انبار</span></div></div><div class="warehouse-modal-note">برای هر قلم یکی از دو حالت را انتخاب کنید: وزن تحویلی را به کیلوگرم ثبت کنید یا گزینه «عدم موجودی» را فعال کنید. توضیحات سفارش نیز در کنار هر قلم قابل مشاهده است.</div><div class="warehouse-delivery-list">${rows||'<div class="empty">قلم فعالی برای تحویل وجود ندارد.</div>'}</div><div class="warehouse-modal-footer"><div class="warehouse-modal-summary"><span>جمع وزن ثبت‌شده</span><strong id="warehouseTotalKg">۰ کیلوگرم</strong></div><div class="toolbar"><button class="btn btn-secondary btn-lg" data-action="close-modal">لغو</button><button class="btn btn-primary btn-lg" data-action="confirm-warehouse" data-id="${esc(o.id)}">${icon('check',17)} ثبت تحویل و ارسال به تسویه</button></div></div></div>`);
  const modalCard=$('.modal-card'); if(modalCard) modalCard.classList.add('warehouse-modal-card');
  bindWarehouseModal();
}
function bindWarehouseModal(){
  $$('#modal [data-weight]').forEach(inp=>inp.addEventListener('input',updateWarehouseModalTotal));
  $$('#modal [data-oos]').forEach(ch=>ch.addEventListener('change',()=>{const id=ch.dataset.oos;const inp=$(`#modal [data-weight="${id}"]`);if(inp){inp.disabled=ch.checked;if(ch.checked)inp.value='';}updateWarehouseModalTotal();}));
}
function updateWarehouseModalTotal(){const total=$$('#modal [data-weight]').reduce((s,e)=>s+(e.disabled?0:n(e.value)),0);const el=$('#warehouseTotalKg');if(el)el.textContent=qty(total)+' کیلوگرم';}
function bindWarehouse(){$('#content').onclick=async e=>{const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;if(a==='open-warehouse')return openWarehouse(el.dataset.id);if(a==='confirm-warehouse')return confirmWarehouse(el.dataset.id);if(a==='return-sales')return returnSales(el.dataset.id);if(a==='return-item-sales')return returnSales(el.dataset.id,el.dataset.itemId)}}
async function confirmWarehouse(id){const items=[];for(const w of $$('#modal [data-weight]')){const itemId=w.dataset.weight;const oos=$(`#modal [data-oos="${itemId}"]`)?.checked||false;items.push({itemId,deliveredKg:oos?0:n(w.value),outOfStock:oos})}if(items.some(i=>!i.outOfStock&&i.deliveredKg<=0))return toast('برای همه اقلام موجود، وزن تحویلی معتبر وارد کنید.');try{await api('/api/orders/'+id+'/warehouse',{method:'POST',body:JSON.stringify({items})});toast('تحویل ثبت شد و سفارش برای تسویه ارسال شد.');app.selectedWarehouse=null;await renderWarehouse()}catch(e){toast(e.message)}}

/* ---------- Reports ---------- */
function reportCard(label,value,hint,ico,isText=false){return `<div class="card report-card"><div class="kpi-icon">${icon(ico,19)}</div><h3>${label}</h3><div class="value" style="font-size:${isText?'20':'28'}px">${isText?value:qty(value)}</div><small>${hint}</small></div>`}
const AUDIT_LABELS={LOGIN:'ورود به سامانه',LOGIN_FAILED:'تلاش ناموفق ورود',PASSWORD_CHANGED:'تغییر رمز عبور',CREATE_VISIT:'ثبت ورود مشتری',CREATE_ORDER:'ثبت سفارش',CREATE_STORE_ORDER:'ثبت سفارش فروشگاه',APPROVE_STORE_ORDER:'تأیید سفارش فروشگاه',SALES_EDIT_STORE_ORDER:'ویرایش سفارش فروشگاه توسط فروش',CANCEL_STORE_ORDER:'لغو سفارش فروشگاه',CREATE_REMOTE_ORDER:'ثبت سفارش غیرحضوری',UPDATE_REMOTE_ORDER:'ویرایش سفارش غیرحضوری',CANCEL_REMOTE_ORDER:'لغو سفارش غیرحضوری',ACTIVATE_REMOTE_ORDER:'فعال‌سازی سفارش زمان‌بندی‌شده',ADD_ORDER_ITEM:'افزودن قلم سفارش',UPDATE_ORDER_ITEM:'ویرایش قلم سفارش',DELETE_ORDER_ITEM:'حذف قلم سفارش',SAVE_RETURNED_ORDER_EDIT:'ذخیره اصلاح سفارش برگشتی',WAREHOUSE_ACCEPT_ORDER:'تأیید تحویل انبار',WAREHOUSE_START_PREPARING:'شروع آماده‌سازی انبار',WAREHOUSE_FINALIZE:'ثبت وزن نهایی انبار',REOPEN_WAREHOUSE_PREPARING:'بازگشایی آماده‌سازی انبار',RETURN_TO_SALES:'ارجاع سفارش به فروش',RESUBMIT_TO_WAREHOUSE:'ارسال مجدد به انبار',FINAL_SETTLEMENT:'تسویه نهایی و صدور فاکتور',FINAL_EXIT:'تأیید خروج عادی',SEND_TO_DISPATCH:'ارسال سفارش به پخش',DISPATCH_ASSIGN:'تخصیص راننده',DISPATCH_DRIVER_EXIT:'ثبت خروج توسط راننده',DISPATCH_GATE_EXIT:'تأیید خروج پیش از حرکت توسط نگهبانی',DISPATCH_DELIVERED:'ثبت تحویل توسط راننده',DISPATCH_SALES_FINALIZE:'تأیید نهایی تحویل توسط فروش',DISPATCH_FINAL_EXIT:'خروج نهایی تاریخی',USER_CREATED:'ایجاد کاربر',USER_UPDATED:'ویرایش کاربر',USER_ROLE_CHANGED:'تغییر نقش کاربر',USER_DEACTIVATED:'غیرفعال‌سازی کاربر',PRODUCT_CREATED:'ایجاد محصول',UPDATE_PRODUCT:'ویرایش محصول',SET_PRICE:'ثبت قیمت محصول',PRICE_GROUP_CREATED:'ایجاد گروه قیمت',PRICE_GROUP_RENAMED:'تغییر نام گروه قیمت',PRICE_GROUP_DELETED:'حذف گروه قیمت',PRICE_GROUP_ADJUSTED:'تغییر گروهی قیمت‌ها'};
function auditLabel(a){return AUDIT_LABELS[a]||a||'—'}
function auditDetails(x){const d=x.details||{};const parts=[];if(d.orderId)parts.push('سفارش '+String(d.orderId).slice(0,8).toUpperCase());if(d.itemCount!=null)parts.push('تعداد قلم '+d.itemCount);if(d.requestedQty!=null)parts.push('مقدار '+qty(d.requestedQty)+' '+(d.requestedUnit||''));if(d.reason)parts.push('دلیل: '+d.reason);if(d.invoiceNumber)parts.push('فاکتور '+d.invoiceNumber);return parts.join(' • ')||'ثبت شد'}

/* ---------- Admin ---------- */
const ADMIN_SETTINGS_TABS=[['https','دامنه و HTTPS'],['users','کاربران و سمت‌ها'],['products','محصولات'],['audit','ردپای فعالیت‌ها']];
function adminSettingsTabsHtml(){
  return `<nav class="settings-tabs" role="tablist" aria-label="بخش‌های تنظیمات سیستم">${ADMIN_SETTINGS_TABS.map(([id,label])=>`<button type="button" role="tab" id="settings-tab-${id}" aria-controls="settings-panel-${id}" data-settings-tab="${id}">${label}</button>`).join('')}</nav>`;
}
function initAdminSettingsTabs(){
  const root=$('#content'),tabs=[...root.querySelectorAll('[data-settings-tab]')];
  const select=(id,focus=false)=>{
    if(!ADMIN_SETTINGS_TABS.some(([key])=>key===id))id=ADMIN_SETTINGS_TABS[0][0];
    app.adminSettingsTab=id;
    tabs.forEach(tab=>{const selected=tab.dataset.settingsTab===id;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;const panel=document.getElementById(tab.getAttribute('aria-controls'));if(panel)panel.hidden=!selected;if(selected&&focus)tab.focus();});
  };
  tabs.forEach((tab,i)=>{
    tab.addEventListener('click',()=>select(tab.dataset.settingsTab));
    tab.addEventListener('keydown',e=>{let next;if(e.key==='ArrowLeft')next=(i+1)%tabs.length;else if(e.key==='ArrowRight')next=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;e.preventDefault();select(tabs[next].dataset.settingsTab,true);});
  });
  select(app.adminSettingsTab);
}
async function renderAdmin(){
  const [u,a]=await Promise.all([api('/api/admin/users'),api('/api/admin/audit')]);
  if(app.page!=='admin')return;
  const users=u.users||[];
  $('#content').innerHTML=`
  ${adminSettingsTabsHtml()}
  <div class="settings-panel" id="settings-panel-https" role="tabpanel" aria-labelledby="settings-tab-https" tabindex="0">
  <section class="card card-pad section-space tls-settings" id="tlsSettings">
    <div class="panel-head"><div><span class="eyebrow">DOMAIN &amp; HTTPS</span><h2>دامنه و گواهی HTTPS</h2><p>اتصال یک دامنهٔ عمومی و دریافت و تمدید خودکار گواهی رایگان Let’s Encrypt</p></div></div>
    <div class="notice">پیش از شروع، در پنل دامنه رکورد DNS را به IP عمومی این سرور وصل کنید و پورت‌های ۸۰ و ۴۴۳ را از اینترنت تا سرور باز و هدایت کنید. دامنهٔ داخلی، IP و wildcard پشتیبانی نمی‌شوند. باز کردن سامانه روی اینترنت آن را در دسترس عموم قرار می‌دهد؛ رمزهای قوی و محدودیت‌های شبکه را بررسی کنید.</div>
    <div id="tlsStatus" class="tls-status" role="status" aria-live="polite">در حال دریافت وضعیت…</div>
    <form id="tlsSettingsForm" class="form-grid section-space" autocomplete="off">
      <div class="field"><label for="tlsDomain">نام دامنه</label><div class="input-shell"><input id="tlsDomain" name="domain" dir="ltr" placeholder="example.com" required maxlength="253" spellcheck="false"></div><small>بدون https://، پورت یا مسیر</small></div>
      <div class="field"><label for="tlsEmail">ایمیل اطلاع‌رسانی تمدید (اختیاری)</label><div class="input-shell"><input id="tlsEmail" name="email" type="email" dir="ltr" maxlength="254" placeholder="admin@example.com"></div></div>
      <div class="field"><label for="tlsPassword">تأیید رمز مدیر</label><div class="input-shell"><input id="tlsPassword" name="password" type="password" required autocomplete="current-password"></div></div>
      <label class="adm-check"><input type="checkbox" name="terms" required> شرایط <a href="https://letsencrypt.org/repository/" target="_blank" rel="noopener noreferrer">Let’s Encrypt</a> را می‌پذیرم و اتصال عمومی سامانه به اینترنت را تأیید می‌کنم.</label>
      <div class="sticky-actions" style="grid-column:1/-1"><span class="subtle">گواهی خودکار نگهداری می‌شود. دسترسی HTTP با IP داخلی برای سازگاری باقی می‌ماند و رمزگذاری‌شده نیست.</span><button class="btn btn-primary" type="submit">دریافت و فعال‌سازی HTTPS</button></div>
    </form>
  </section>
  </div>
  <div class="settings-panel" id="settings-panel-users" role="tabpanel" aria-labelledby="settings-tab-users" tabindex="0">
    <section class="card admin-form">
      <div class="panel-head"><div><span class="eyebrow">USER DIRECTORY</span><h2>ایجاد حساب کاربری</h2><p>برای هر شخص، نام کامل، سمت سازمانی و سطح دسترسی را مشخص کنید.</p></div><span class="pill">${qty(users.filter(x=>x.isActive).length)} حساب فعال</span></div>
      <p>ساخت و ویرایش حساب‌ها از بخش «کاربران» انجام می‌شود.</p><button class="btn btn-primary" type="button" data-action="manage-users">مدیریت کاربران</button><form id="userForm" class="form-grid section-space" style="display:none">
        <div class="field"><label>نام کاربری</label><div class="input-shell"><input name="username" required autocomplete="off"></div></div>
        <div class="field"><label>نام و نام خانوادگی</label><div class="input-shell"><input name="fullName" required></div></div>
        <div class="field"><label>سمت سازمانی</label><div class="input-shell"><input name="position" required placeholder="مثلاً مسئول فروش، نگهبان، مدیر انبار"></div></div>
        <div class="field store-name-field"><label>نام فروشگاه <span class="subtle">(برای نقش فروشگاه)</span></label><div class="input-shell"><input name="storeName" placeholder="مثلاً فروشگاه مرکزی" autocomplete="organization"></div><small class="field-hint">برای نقش «فروشگاه» این مقدار الزامی است.</small></div>
        <div class="field"><label>سطح دسترسی</label><div class="input-shell"><select name="roleCode"><option value="gate">نگهبانی</option><option value="sales">فروش</option><option value="warehouse">انبار</option><option value="store">فروشگاه</option><option value="dispatch">واحد پخش</option><option value="admin">مدیر سیستم</option></select></div></div>
        <div class="field" data-legacy-driver-field style="display:none"><label>شماره تماس راننده *</label><div class="input-shell"><input name="drvPhone" inputmode="tel" dir="ltr" placeholder="۰۹۱۲ ۰۰۰ ۰۰۰۰"></div></div>
        <div class="field" data-legacy-driver-field style="display:none"><label>نوع خودرو *</label><div class="input-shell"><input name="drvVehicleType" list="drvVehicleTypes" placeholder="مثلاً وانت"></div><datalist id="drvVehicleTypes"><option value="وانت"></option><option value="کامیون"></option><option value="کامیونت"></option><option value="موتورسیکلت"></option><option value="پژو"></option></datalist></div>
        <div class="field" data-legacy-driver-field style="display:none"><label>پلاک خودرو *</label>${plateEditorHtml('','','drvPlate')}</div>
        <div class="field" data-legacy-driver-field style="display:none"><label>پایانه پوز</label><div class="input-shell"><input name="drvPosTerminal" dir="ltr" placeholder="POS-01"></div></div>
        <div class="field" data-legacy-driver-field style="display:none"><label>نام بانک پوز</label><div class="input-shell"><input name="drvPosBank" list="drvPosBanks" placeholder="مثلاً بانک ملت"></div><datalist id="drvPosBanks">${BT_POS_BANKS.map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist><small class="field-hint">راننده با همین مشخصات ساخته می‌شود و در کارتابل ترابری دیده می‌شود.</small></div>
        <div class="field"><label>رمز اولیه</label><div class="input-shell"><input name="password" type="password" required autocomplete="new-password"></div></div>
        <div class="sticky-actions" style="grid-column:1/-1"><span class="subtle">سطح دسترسی مشخص می‌کند کاربر کدام کارتابل را ببیند.</span><button class="btn btn-primary" type="submit">${icon('plus',15)} ایجاد حساب</button></div>
      </form>
    </section>
  <section class="card card-pad section-space">
    <div class="panel-head"><div><span class="eyebrow">USER MANAGEMENT</span><h2>مدیریت کاربران و سمت‌ها</h2><p>فهرست کامل حساب‌ها؛ ویرایش مشخصات، تغییر دسترسی و غیرفعال‌سازی از همین صفحه.</p></div><div class="toolbar"><span class="pill">${qty(users.length)} حساب ثبت‌شده</span></div></div>
    <div class="user-directory bt-table-wrap"><table class="bt-table settings-users-table"><caption class="bt-caption">مدیریت کاربران و سمت‌ها</caption><thead><tr><th>نام</th><th>نام کاربری</th><th>سمت و دسترسی</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>
      ${pageItems('users',users).map(x=>`<tr><td data-label="نام">${esc(x.fullName)}</td><td data-label="نام کاربری"><b dir="ltr">${esc(x.username)}</b></td><td data-label="سمت و دسترسی">${esc(x.position||'—')} • ${esc(ROLE[normalizeRole(x.roleCode)]||x.roleCode)}${x.storeName?`<br>فروشگاه: ${esc(x.storeName)}`:''}</td><td data-label="وضعیت">${x.isActive?'<span class="badge green">فعال</span>':'<span class="badge gray">غیرفعال</span>'}</td><td data-label="عملیات"><div class="bt-actions"><button class="btn btn-secondary btn-sm" data-action="edit-user" data-id="${esc(x.id)}">${icon('edit',14)} ویرایش</button>${x.id===app.user?.id?'<span class="subtle">حساب فعلی</span>':x.isActive?`<button class="btn btn-danger btn-sm" data-action="delete-user" data-id="${esc(x.id)}">${icon('trash',14)} حذف</button>`:'<span class="subtle">حذف/غیرفعال شده</span>'}</div></td></tr>`).join('')||'<tr><td colspan="5" class="empty">کاربری ثبت نشده است.</td></tr>'}
    </tbody></table></div>${pagerHtml('users',users.length)}
  </section>
  </div>
  <div class="settings-panel" id="settings-panel-products" role="tabpanel" aria-labelledby="settings-tab-products" tabindex="0">
    <div id="settings-products-content"></div>
  </div>
  <div class="settings-panel" id="settings-panel-audit" role="tabpanel" aria-labelledby="settings-tab-audit" tabindex="0">
  <div class="admin-grid section-space"><section class="card card-pad"><div class="panel-head"><div><span class="eyebrow">AUDIT TRAIL</span><h2>ردپای فعالیت‌ها</h2></div></div><div class="table-wrap bt-table-wrap section-space"><table class="bt-table audit-table"><caption class="bt-caption">ردپای فعالیت‌ها</caption><thead><tr><th>زمان</th><th>کاربر</th><th>عملیات</th><th>موجودیت</th></tr></thead><tbody>${pageItems('audit',a.audit).map(x=>`<tr><td data-label="زمان">${dt(x.createdAt)}</td><td data-label="کاربر"><strong>${esc(x.username||'—')}</strong></td><td data-label="عملیات"><b>${esc(auditLabel(x.action))}</b><div class="subtle">${esc(auditDetails(x))}</div></td><td data-label="موجودیت">${esc(x.entityType||'—')}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">لاگی وجود ندارد.</td></tr>'}</tbody></table></div>${pagerHtml('audit',a.audit.length)}</section></div>
  </div>`;
  bindAdmin(); bindJalaliDates($('#content')); bindRialInputs($('#content'));
  enhanceAdminCollapsible();
  initAdminSettingsTabs();
  startTlsSettings();
  await renderProductsPage();
}
function showTlsStatus(data){
  const el=$('#tlsStatus');if(!el)return;
  const active=data.active;
  el.innerHTML=active?`<div class="tls-current"><span class="badge ${active.valid?'green':'orange'}">${active.valid?'HTTPS فعال':'گواهی منقضی شده'}</span> دامنه: <b dir="ltr">${esc(active.domain)}</b> · اعتبار تا ${esc(formatDateTime24(active.expiresAt))} · <a href="https://${esc(active.domain)}/" target="_blank" rel="noopener noreferrer">بازکردن سامانه با HTTPS</a></div>`:'<div>هنوز گواهی فعالی تنظیم نشده است.</div>';
  if(data.job?.message)el.innerHTML+=`<div class="${data.job.state==='error'?'form-error':'subtle'}">${esc(data.job.message)}</div>`;
  const form=$('#tlsSettingsForm');if(form){const btn=form.querySelector('button[type=submit]');if(btn)btn.disabled=!!app.tlsSubmitPending||data.job?.state==='working';
    if(!form.dataset.initialized&&active){form.elements.domain.value=active.domain;form.elements.email.value=active.email||'';form.dataset.initialized='1';}}
}
function startTlsSettings(){
  if(app.tlsStatusTimer)clearInterval(app.tlsStatusTimer);
  const refresh=async()=>{if(app.page!=='admin'||!$('#tlsSettings')){clearInterval(app.tlsStatusTimer);app.tlsStatusTimer=null;return;}
    const seq=app.tlsUiSeq=(app.tlsUiSeq||0)+1;
    try{const data=await api('/api/admin/https');if(seq===app.tlsUiSeq)showTlsStatus(data);}catch(e){const el=$('#tlsStatus');if(el&&seq===app.tlsUiSeq)el.textContent='دریافت وضعیت HTTPS ناموفق بود: '+e.message;}};
  $('#tlsSettingsForm')?.addEventListener('submit',async e=>{
    e.preventDefault();const form=e.target;const b={domain:form.elements.domain.value,email:form.elements.email.value,password:form.elements.password.value,terms:form.elements.terms.checked};
    if(!confirm('سامانه از اینترنت عمومی قابل دسترسی خواهد بود. دامنه و هدایت پورت‌ها را بررسی کرده‌اید؟'))return;
    const btn=form.querySelector('button[type=submit]');btn.disabled=true;app.tlsSubmitPending=true;app.tlsUiSeq=(app.tlsUiSeq||0)+1;
    try{const data=await api('/api/admin/https',{method:'POST',body:JSON.stringify(b)});app.tlsUiSeq++;app.tlsSubmitPending=false;form.elements.password.value='';showTlsStatus(data);toast('درخواست گواهی ثبت شد. وضعیت را در همین بخش پیگیری کنید.');}
    catch(err){app.tlsSubmitPending=false;toast(err.message);btn.disabled=false;}
  });
  void refresh();app.tlsStatusTimer=setInterval(refresh,3000);
}
function bindAdmin(){
  $('#content').onclick=async e=>{
    const el=e.target.closest('[data-action]'); const a=el?.dataset.action;
    if(a==='edit-product')return openProductEdit(el.dataset.id);
    if(a==='manage-users'||a==='edit-user')return go('users');
    if(a==='delete-user')return deleteUser(el.dataset.id);
  };
  // v37.38.0 — انتخاب نقش «راننده» فیلد رانندهٔ متصل را نشان می‌دهد و بدون انتخاب آن خطا می‌دهد
  const uf=$('#userForm');
  if(uf){bindPlateEditor(uf,uf.elements.drvVehicleType);const rsel=uf.elements.roleCode;
    const usync=()=>{uf.querySelectorAll('[data-legacy-driver-field]').forEach(f=>{f.style.display=rsel.value==='driver'?'':'none';});};
    rsel?.addEventListener('change',usync); usync();}
  $('#userForm')?.addEventListener('submit',async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));b.roleCode=normalizeRole(b.roleCode);b.username=String(b.username||'').trim();b.fullName=String(b.fullName||'').trim();b.position=String(b.position||'').trim();b.storeName=String(b.storeName||'').trim();if(b.roleCode==='driver'){try{b.drvPlate=plateEditorValue(e.target,{required:true});}catch(err){return toast(err.message);}}if(b.roleCode==='store'&&!b.storeName)return toast('برای کاربر فروشگاه، نام فروشگاه را وارد کنید.');if(b.roleCode==='driver'&&!(String(b.drvPhone||'').trim()&&String(b.drvVehicleType||'').trim()&&String(b.drvPlate||'').trim()))return toast('برای نقش راننده، شماره تماس، نوع خودرو و پلاک را کامل وارد کنید؛ راننده با همین مشخصات ساخته می‌شود.');try{await api('/api/admin/users',{method:'POST',body:JSON.stringify(b)});toast('حساب کاربری با موفقیت ساخته شد.');await renderAdmin()}catch(err){toast(err.message)}});
  bindRialInputs($('#content'));
}
async function openUserEdit(id){
  const d=await api('/api/admin/users'); const u=(d.users||[]).find(x=>String(x.id)===String(id)); if(!u){toast('حساب کاربری موردنظر پیدا نشد؛ فهرست کاربران را تازه‌سازی کنید.');return;}
  // v37.38.0 — فرم ویرایش قدیمی فقط ۴ نقش داشت و ویرایش کاربر فروش/پخش/راننده نقش او را خاموش عوض می‌کرد؛ حالا هر ۷ نقش + رانندهٔ متصل
  const drList=await api('/api/drivers').then(r=>r.drivers||[]).catch(()=>[]);
  const myDrv=drList.find(x=>x.id===u.driverId);
  openModal('ویرایش حساب کاربری',`<form id="userEditForm"><div class="form-grid"><div class="field"><label>نام کاربری</label><div class="input-shell"><input name="username" value="${esc(u.username)}" required></div></div><div class="field"><label>نام و نام خانوادگی</label><div class="input-shell"><input name="fullName" value="${esc(u.fullName)}" required></div></div><div class="field"><label>سمت سازمانی</label><div class="input-shell"><input name="position" value="${esc(u.position||'')}" required placeholder="سمت شخص"></div></div><div class="field"><label>نام فروشگاه <span class="subtle">(برای نقش فروشگاه)</span></label><div class="input-shell"><input name="storeName" value="${esc(u.storeName||'')}" placeholder="مثلاً فروشگاه مرکزی"></div></div><div class="field"><label>سطح دسترسی</label><div class="input-shell"><select name="roleCode">${Object.entries(ROLE).filter(([v])=>v!=='driver'||normalizeRole(u.roleCode)==='driver').map(([v,t])=>`<option value="${v}" ${normalizeRole(u.roleCode)===v?'selected':''}>${t}</option>`).join('')}</select></div></div><div class="field" data-user-edit-driver style="display:${normalizeRole(u.roleCode)==='driver'?'':'none'}"><label>شماره تماس راننده *</label><div class="input-shell"><input name="drvPhone" inputmode="tel" dir="ltr" value="${esc(myDrv?.phone||'')}"></div></div><div class="field" data-user-edit-driver style="display:${normalizeRole(u.roleCode)==='driver'?'':'none'}"><label>نوع خودرو *</label><div class="input-shell"><input name="drvVehicleType" value="${esc(myDrv?.vehicleType||'')}"></div></div><div class="field" data-user-edit-driver style="display:${normalizeRole(u.roleCode)==='driver'?'':'none'}"><label>پلاک خودرو *</label>${plateEditorHtml(myDrv?.plate||'',myDrv?.vehicleType||'','drvPlate')}</div><div class="field" data-user-edit-driver style="display:${normalizeRole(u.roleCode)==='driver'?'':'none'}"><label>پایانه پوز / نام بانک</label><div class="input-shell"><input name="drvPosTerminal" dir="ltr" value="${esc(myDrv?.posTerminal||'')}"></div><div class="input-shell"><input name="drvPosBank" value="${esc(myDrv?.posBank||'')}"></div><small class="field-hint">این مشخصات روی رکورد راننده در کارتابل ترابری به‌روز می‌شود.</small></div><input type="hidden" name="driverId" value="${esc(u.driverId||'')}"><div class="field"><label>رمز جدید <span class="subtle">(اختیاری)</span></label><div class="input-shell"><input name="password" type="password" placeholder="در صورت نیاز تغییر دهید"></div></div><div class="field"><label>وضعیت حساب</label><div class="input-shell"><select name="isActive"><option value="true" ${u.isActive?'selected':''}>فعال</option><option value="false" ${!u.isActive?'selected':''}>غیرفعال</option></select></div></div></div><div class="sticky-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">انصراف</button><button class="btn btn-primary">ذخیره تغییرات</button></div></form>`);
  const uef=$('#userEditForm');
  bindPlateEditor(uef,uef.elements.drvVehicleType);
  const ursel=uef.elements.roleCode;
  ursel.addEventListener('change',()=>{uef.querySelectorAll('[data-user-edit-driver]').forEach(f=>{f.style.display=ursel.value==='driver'?'':'none';});});
  uef.addEventListener('submit',async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));b.isActive=b.isActive==='true';if(!b.password)delete b.password;if(b.roleCode==='driver'){try{b.drvPlate=plateEditorValue(uef,{required:true});}catch(err){return toast(err.message);}}if(b.roleCode==='driver'&&!(String(b.drvPhone||'').trim()&&String(b.drvVehicleType||'').trim()&&String(b.drvPlate||'').trim()))return toast('برای نقش راننده، شماره تماس، نوع خودرو و پلاک را کامل وارد کنید.');try{await api('/api/admin/users/'+id,{method:'PUT',body:JSON.stringify(b)});closeModal();toast('حساب کاربری ویرایش شد.');await renderAdmin()}catch(err){toast(err.message)}})
}
async function deleteUser(id){
  const d=await api('/api/admin/users'); const u=(d.users||[]).find(x=>String(x.id)===String(id)); if(!u){toast('حساب کاربری موردنظر پیدا نشد.');return;}
  if(!confirm(`حساب «${u.fullName}» با سمت «${u.position||'—'}» غیرفعال و از دسترس خارج شود؟`))return;
  try{await api('/api/admin/users/'+id,{method:'DELETE'});toast('حساب کاربری از دسترس خارج شد.');await renderAdmin()}catch(err){toast(err.message)}
}

/* ---------- Invoice ---------- */
function pickInvoicePayment(o,run){ if(run){ const hit=(o.payments||[]).find(p=>(p.deliveryRun||null)===run); return hit||null; } return o.payment||null; } // v37.17.0 — سند سرویس دیگر هرگز جای سند این سرویس نمایش داده نمی‌شود
async function previewInvoice(id,run){try{const d=await api('/api/orders/'+id);const pay=pickInvoicePayment(d.order,run);if(run&&!pay)return toast('سند این سرویس هنوز صادر نشده است.');openModal('پیش‌نمایش فاکتور'+(run?` — سرویس ${run===2?'دوم':'اول'}`:''),invoiceHtml(d.order,pay)+`<div class="toolbar" style="justify-content:flex-end;margin-top:15px"><button class="btn btn-secondary" data-action="close-modal">بستن</button><button class="btn btn-primary" data-action="print-invoice" data-id="${id}"${run?` data-run="${run}"`:''}>${icon('receipt',16)} چاپ فاکتور</button></div>`);BTPrintDigits.convert(document.querySelector('#modal .inv38-sheet'))}catch(e){toast(e.message)}}
async function openInvoicePrint(id,run){
  const key='invoice-print-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  try{
    const d=await api('/api/orders/'+encodeURIComponent(id));
    const pay=pickInvoicePayment(d.order,run);
    if(run&&!pay)return toast('سند این سرویس هنوز صادر نشده است.');
    sessionStorage.setItem(key,JSON.stringify({title:(d.order?.orderType==='STORE'?'سند تحویل وزنی':'فاکتور')+' '+fa(pay?.invoiceNumber||''),html:invoiceHtml(d.order,pay)}));
    await BTPrintFrame.url('/invoice-print.html',{key});
  }catch(e){sessionStorage.removeItem(key);toast(e.message)}
}
async function printInvoice(id,run){return openInvoicePrint(id,run)}
/* v37.17.0 — سطرهای سند هر سرویس فقط از دادهٔ همان سرویس ساخته می‌شوند.
   وزن کل قلم (مجموع سرویس اول و دوم) هرگز نباید در سند یک سرویس نمایش داده شود. */
function storeRunInvoiceLines(o,p){
  const priceLines=Array.isArray(p?.priceLines)?p.priceLines:[];
  if(priceLines.length) return priceLines.map(x=>({productName:x.productName,deliveredKg:Number(x.deliveredKg??0)}));
  const items=(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED');
  const run=p?.deliveryRun||null;
  if(run===1||run===2){
    const key=run===1?'runR1':'runR2';
    const lines=items.map(i=>({productName:i.product?.name,deliveredKg:(Array.isArray(i[key])?i[key]:[]).reduce((sum,e)=>sum+Number(e.kg||0),0)})).filter(x=>x.deliveredKg>0);
    if(lines.length) return lines;
    const ds=[...(Array.isArray(o.dispatchRuns)?o.dispatchRuns:[]),...(o.dispatch?[o.dispatch]:[])].find(d=>d&&d.run===run);
    if(ds&&ds.shipmentWeights) return items.filter(i=>Number(ds.shipmentWeights[i.id]||0)>0).map(i=>({productName:i.product?.name,deliveredKg:Number(ds.shipmentWeights[i.id]||0)}));
    return [];
  }
  return items.map(i=>({productName:i.product?.name,deliveredKg:i.deliveredKg}));
}
function invoiceHtml(o,paySel){
  const p=paySel||o.payment||{}; // v37.5.0 — هر سرویس سفارش فروشگاه فاکتور خودش را دارد (payment.priceLines)
  const pickupDoc=o.pickupHandover?.document;
  const signatureContact=pickupDoc?.recipient?esc(pickupDoc.recipient.name||'—')+' – '+esc(pickupDoc.recipient.phone||'—'):esc((p.customerName ?? o.customer?.name) || '—')+' – '+esc((p.customerPhone ?? o.customer?.phone) || '—');
  const priceLines=Array.isArray(p.priceLines)?p.priceLines:[];
  const items=priceLines.length?priceLines.map(x=>({product:{name:x.productName},deliveredKg:x.deliveredKg,unitPrice:x.unitPrice,finalAmount:x.amount})):(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED');
  const storeDoc = o.orderType === 'STORE'; // v37.6.0 — سند تحویل وزنی فروشگاه: هیچ مبلغی نمایش داده نمی‌شود
  if (storeDoc) {
    const run=p.deliveryRun||null;
    const lines=storeRunInvoiceLines(o,p); // v37.17.0 — فقط اقلام و وزن همان سرویس
    const totalKg=lines.reduce((sum,x)=>sum+Number(x.deliveredKg??0),0);
    return `<div class="inv38-sheet inv38-compact">
  <div class="inv38-head"><div class="inv38-brand"><img src="/logo.png" alt="بابل طیور"><div><b>بابل طیور</b><span>سند تحویل وزنی فروشگاه</span></div></div>
    <div class="inv38-meta"><div><span>شماره سند</span><b>${esc(fa(p.invoiceNumber||'—'))}</b></div><div><span>تاریخ ثبت</span><b>${esc(dt(p.verifiedAt||o.createdAt))}</b></div><div><span>شماره سفارش</span><b>${esc(fa(o.orderNo||'—'))}${run?` · سرویس ${run===2?'دوم':'اول'}`:''}</b></div></div></div>
  <div class="inv38-rule"></div>
  <div class="inv38-cust"><div><span>فروشگاه</span><b>${esc(o.storeName||'—')}</b></div><div><span>محل تحویل</span><b>${esc(o.dispatchPlace||'—')}</b></div><div><span>وضعیت</span><b>سند وزنی — بدون مبلغ</b></div></div>
  <div class="inv38-table-scroll" role="region" tabindex="0"><table class="inv38-table"><thead><tr><th>#</th><th>محصول</th><th>وزن تحویلی</th></tr></thead><tbody>${lines.map((i,k)=>`<tr><td>${fa(String(k+1))}</td><td><b>${esc(i.productName||'—')}</b></td><td>${qty(i.deliveredKg)} کیلوگرم</td></tr>`).join('')}</tbody></table></div>
  <div class="inv38-bottom"><div class="inv38-total"><div class="inv38-total-box"><div><span>جمع وزن محموله</span><b>${qty(totalKg)} کیلوگرم</b></div><div class="grand"><span>نوع سند</span><b>خارج از مسیر پرداخت</b></div><div style="margin-top:6px"><small>این سند صرفاً وزن تحویل‌شده را اعلام می‌کند و ارزش ریالی ندارد.</small></div></div></div>
  <div class="inv38-verify"><div class="inv38-verify-box"><div class="inv38-verify-grid"><div class="inv38-vitem"><span>امضاء</span><strong>${signatureContact}</strong></div></div></div></div></div>
  </div>`;
  }
  const subtotal=items.reduce((sum,i)=>sum+n(i.finalAmount),0);
  const returns=Math.max(0,n(p.returnDeduction||0));
  const difference=n(p.totalAmount)-subtotal+returns;
  const discount=p.discountAmount != null ? n(p.discountAmount) : Math.max(0,-difference);
  const additions=p.additionsAmount != null ? n(p.additionsAmount) : Math.max(0,difference);
  const customerNameRaw=String((pickupDoc?.customerName ?? p.customerName ?? o.customer?.name)||'').trim();const customerPhoneRaw=String((pickupDoc?.customerPhone ?? p.customerPhone ?? o.customer?.phone)||'').trim();
  const customerName=esc(customerNameRaw||'—');const customerPhone=esc(customerPhoneRaw||'—');
  const recipientCandidate=o.pickupHandover?.document?.recipient||null;
  const contactNameKey=value=>String(value||'').normalize('NFKC').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\u200e\u200f]/g,' ').replace(/\s+/g,' ').trim().toLocaleLowerCase();
  const contactPhoneKey=value=>String(value||'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g,'');
  const customerNameKey=contactNameKey(customerNameRaw);
  const sameRecipientName=!!recipientCandidate&&!!customerNameKey&&contactNameKey(recipientCandidate.name)===customerNameKey;
  const sameRecipientPhone=!!recipientCandidate&&contactPhoneKey(recipientCandidate.phone)===contactPhoneKey(customerPhoneRaw);
  const recipient=sameRecipientName&&sameRecipientPhone?null:recipientCandidate;
  const recipientHeaderMeta=recipient?`<div><span>نام مشتری</span><b>${customerName}</b></div><div><span>شماره</span><b class="inv38-phone" dir="ltr">${customerPhone}</b></div><div><span>تحویل گیرنده</span><b>${esc(recipient.name||'—')}</b></div><div><span>شماره</span><b class="inv38-phone" dir="ltr">${esc(fa(recipient.phone||'—'))}</b></div><div><span>سفارش</span><b>${esc(fa(String(o.orderNo||'—').replace(/^0+(?=\d)/,'')))}</b></div><div><span>فاکتور</span><b>${esc(fa(String(p.invoiceNumber||'—').replace(/^0+(?=\d)/,'')))}</b></div><div><span>تاریخ</span><b>${esc(dt(p.verifiedAt||o.createdAt))}</b></div>`:'';
  const invoiceHeaderMeta=recipient?recipientHeaderMeta:`<div><span>شماره فاکتور</span><b>${esc(fa(p.invoiceNumber||'—'))}</b></div><div><span>تاریخ تسویه</span><b>${esc(dt(p.verifiedAt||o.createdAt))}</b></div><div><span>شماره سفارش</span><b>${esc(fa(o.orderNo||'—'))}</b></div>`;
  const settleLabels=Object.assign(Object.create(null),{CASH:'نقدی',POS:'پوز',CARD_TRANSFER:'کارت‌به‌کارت',CHECK:'چک',CREDIT:'معوق'});
  const methods=Array.isArray(p.settlementMethods)?p.settlementMethods:[];
  const amountKnown=v=>(typeof v==='number'||typeof v==='string')&&String(v).trim()!==''&&Number.isSafeInteger(Number(v))&&Number(v)>=0;
  const methodsComplete=methods.length>0&&methods.every(m=>m&&settleLabels[String(m.type||'').toUpperCase()]&&amountKnown(m.amount));
  const types=[...new Set(methods.map(m=>String(m?.type||'').toUpperCase()).filter(Boolean))];
  const due=amountKnown(p.amountDue)?Number(p.amountDue):(!p.deposit&&(p.depositAmount==null||Number(p.depositAmount)===0)&&amountKnown(p.totalAmount)?Number(p.totalAmount):null);
  const depositOnly=Array.isArray(p.settlementMethods)&&methods.length===0&&due===0&&Number(p.depositAmount)>0;
  const settlementKind=types.length>1?'ترکیبی':types.length===1?(settleLabels[types[0]]||'نامشخص'):(depositOnly?'از محل بیعانه':(settleLabels[p.settlementType]||'ثبت نشده'));
  const credit=methodsComplete?methods.reduce((sum,m)=>sum+(String(m.type).toUpperCase()==='CREDIT'?Number(m.amount):0),0):(depositOnly?0:null);
  const account=p.debtAccount;
  const paid=account&&Array.isArray(account.receipts)&&account.receipts.every(r=>r&&amountKnown(r.amount)&&['CLEARED','PENDING','RETURNED','REVERSED'].includes(r.status))?account.receipts.filter(r=>r.status==='CLEARED').reduce((sum,r)=>sum+Number(r.amount),0):null;
  const adjustment=account&&Object.hasOwn(account,'adjustment')&&Number.isSafeInteger(account.adjustment)?account.adjustment:0;
  const current=account&&amountKnown(account.initial)&&paid!==null&&(Object.hasOwn(account,'adjustment')?Number.isSafeInteger(account.adjustment):paid<=Number(account.initial))?Number(account.initial)+adjustment-paid:null;
  const recordedSum=methodsComplete?methods.reduce((sum,m)=>sum+Number(m.amount),0):null;
  const paymentRows=methods.map(m=>{
    m=m||{};const type=String(m.type||'').toUpperCase();
    const details=[m.deviceSnapshot?.title?`دستگاه ${m.deviceSnapshot.title}`:'',m.deviceSnapshot?.bank?`بانک ${m.deviceSnapshot.bank}`:'',m.bank?`بانک ${m.bank}`:'',m.reference?`پیگیری ${m.reference}`:'',m.checkNumber?`شماره چک ${m.checkNumber}`:'',m.dueDate?`سررسید ${m.dueDate}`:'',type==='CHECK'&&m.checkStatus==='PENDING'?'در انتظار وصول':'',type!=='CREDIT'&&m.reason?`علت ${m.reason}`:''].filter(Boolean).join(' • ');
    return `<div class="inv38-payment-row"><div><span>${esc(settlementMethodLabel(m))}</span>${details?`<small>${esc(details)}</small>`:''}</div><b>${amountKnown(m.amount)?money(m.amount):'نامشخص'}</b></div>`;
  }).join('');
  const paymentBox=`<section class="inv38-payment-box" aria-label="روش‌های تسویه"><h3>روش‌های تسویه</h3><div class="inv38-payment-row"><span>نوع تسویه</span><b>${esc(settlementKind)}</b></div>${due!==null?`<div class="inv38-payment-row"><span>قابل تسویه</span><b>${money(due)}</b></div>`:''}${paymentRows||`<div class="inv38-payment-empty">${depositOnly?'تمام مبلغ از بیعانه لحاظ‌شده تأمین شده است.':'جزئیات روش پرداخت ثبت نشده است.'}</div>`}<div class="inv38-payment-row inv38-payment-balance"><span>${account?(current<0?'بستانکار':'مانده معوق'):'معوق'}</span><b>${account?(current===null?'نامشخص':money(Math.abs(current))):(credit===null?'نامشخص':money(credit))}</b></div>${recordedSum!==null&&due!==null&&recordedSum!==due&&!Object.hasOwn(account||{},'adjustment')?'<small class="inv38-payment-note">جمع روش‌های ثبت‌شده با مبلغ قابل تسویه یکسان نیست؛ بررسی لازم است.</small>':''}</section>`;
  return `<div class="inv38-sheet inv38-compact${recipient?' inv38-pickup-recipient':''}">
  <div class="inv38-head${recipient?' inv38-pickup-header':''}">
    ${recipient?'':`<div class="inv38-sales-title">فاکتور فروش و تحویل</div>`}
    <div class="inv38-meta${recipient?' inv38-pickup-recipient-meta':''}">${invoiceHeaderMeta}</div>
  </div>
  <div class="inv38-rule"></div>
  ${recipient?'':`<div class="inv38-cust"><div><span>مشتری</span><b>${customerName}</b></div><div><span>شماره تماس</span><b class="inv38-phone" dir="ltr">${customerPhone}</b></div><div><span>وضعیت</span><b>تسویه نهایی و آماده خروج</b></div></div>`}
  <p class="inv38-scroll-hint">برای مشاهده همه ستون‌های اقلام، جدول را افقی پیمایش کنید.</p><div class="inv38-table-scroll" role="region" aria-label="اقلام فاکتور؛ برای مشاهده همه ستون‌ها افقی پیمایش کنید" tabindex="0"><table class="inv38-table"><thead><tr><th>#</th><th>محصول</th><th>وزن تحویلی</th><th>فی</th><th>مبلغ</th></tr></thead><tbody>${items.map((i,k)=>`<tr><td>${fa(String(k+1))}</td><td><b>${esc(i.product?.name||'—')}</b></td><td>${qty(i.deliveredKg)} کیلوگرم</td><td>${money(i.unitPrice)}</td><td>${money(i.finalAmount)}</td></tr>`).join('')}</tbody></table></div>
  <div class="inv38-bottom inv38-with-payments"><div class="inv38-total"><div class="inv38-total-box"><div><span>جمع اقلام</span><b>${money(subtotal)}</b></div><div><span>تخفیفات</span><b>${money(discount)}</b></div><div><span>اضافات</span><b>${money(additions)}</b></div>${returns?`<div><span>کسر مرجوعی</span><b>${money(returns)}</b></div>`:''}${p.deposit?`<div><span>بیعانه دریافت‌شده (${esc(settleLabels[p.deposit?.type]||'')})${p.deposit?.reference?` • پیگیری ${esc(p.deposit.reference)}`:''}</span><b>${money(p.deposit.amount)}</b></div>${p.deposit.refundedAmount?`<div><span>استرداد دستی بیعانه</span><b>${money(p.deposit.refundedAmount)}</b></div><div><span>بیعانه لحاظ‌شده</span><b>${money(p.depositAmount)}</b></div>`:''}<div><span>مانده پس از کسر بیعانه (پیش از تسویه)</span><b>${amountKnown(p.amountDue)?money(p.amountDue):'نامشخص'}</b></div>`:''}<div class="grand"><span>مبلغ نهایی</span><b>${money(p.totalAmount)}</b></div></div></div>
  ${paymentBox}
  <div class="inv38-verify">
    <div class="inv38-verify-box"><div class="inv38-verify-grid"><div class="inv38-vitem"><span>${recipient?'امضاء تحویل‌گیرنده':'امضاء'}</span><strong>${signatureContact}</strong></div></div></div>
  </div>
  </div>
  </div>`;
}
function printCss(){return `*{box-sizing:border-box}body{margin:0;padding:18px;font-family:"B Yekan","B Yekan+","BYekan",Tahoma,Arial,sans-serif;color:#1d222a;background:#fff}.print-sheet{max-width:900px;margin:auto}.print-head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #b40f23;padding-bottom:14px}.print-brand{display:flex;align-items:center;gap:10px}.print-brand img{width:58px;height:58px;object-fit:contain}.print-brand b{font-size:21px}.print-brand span,.print-brand small{display:block;color:#777;font-size:10px}.print-meta{text-align:left;font-size:10px;color:#777;line-height:2}.print-customer{display:grid;grid-template-columns:1.2fr 1fr 1.1fr;gap:10px;margin-top:14px}.print-box{border:1px solid #ddd;border-radius:10px;padding:10px}.print-box span{display:block;color:#777;font-size:9px}.print-box b{display:block;margin-top:3px;font-size:12px}.print-table{width:100%;border-collapse:collapse;margin-top:14px}.print-table th,.print-table td{border:1px solid #ddd;padding:8px 7px;font-size:10px}.print-table th{background:#f5f5f6}.print-table td small{display:block;color:#777;margin-top:2px}.print-total{display:flex;justify-content:flex-end;margin-top:14px}.print-total-box{width:300px;border:1px solid #ddd;border-radius:10px;padding:10px}.print-total-box div{display:flex;justify-content:space-between;padding:4px 0;font-size:10px}.print-total-box .grand{border-top:1px solid #ddd;margin-top:4px;padding-top:8px;font-size:14px;font-weight:1000}.invoice-bottom{display:grid;grid-template-columns:1.25fr 1fr;gap:18px;align-items:end;margin-top:22px;direction:ltr}.invoice-bottom>*{direction:rtl}.invoice-verification-bottom{border:1px solid #d8dce0;border-radius:12px;padding:11px;background:#fafbfc}.invoice-verify-title{font-size:12px;font-weight:1000;margin-bottom:8px}.invoice-verify-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.invoice-verify-box{border:1px solid #ddd;border-radius:9px;background:#fff;padding:8px;min-height:72px}.invoice-verify-box>span{display:block;font-size:9px;color:#777}.invoice-verify-box>strong{display:block;margin-top:4px;font-size:10px}.invoice-verify-box .ok{color:#168149}.invoice-verify-box .manual{color:#ad7110}.invoice-verify-box .bad{color:#b40f23}.invoice-verify-box small{display:block;color:#777;margin-top:5px;font-size:7px}.invoice-signature{display:block;max-width:150px;max-height:44px;margin:5px auto 0}.invoice-customer-under{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:5px 8px;margin-top:9px;align-items:center}.invoice-customer-under span{font-size:8px;color:#777}.invoice-customer-under b{font-size:10px}.invoice-sales-sign{border-top:1px solid #bbb;min-height:92px;padding-top:8px;font-size:9px;color:#777}.invoice-sales-sign span{display:block;font-size:11px;font-weight:1000;color:#555}.invoice-sales-sign div{height:32px}.invoice-sales-sign small{font-size:8px;color:#999}@media print{body{padding:0}.print-sheet{max-width:none}.invoice-bottom{break-inside:avoid}.print-table{break-inside:auto}.print-table tr{break-inside:avoid;break-after:auto}}`}

/* ---------- Application Bootstrap / Login ---------- */
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
// Each page has a fresh tab id; pagehide is best effort and reloads receive a short grace.
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
  // Do not tell the user they have logged out when the server did not confirm
  // revocation. They can retry; closing a disconnected browser falls back to
  // the server-side heartbeat timeout.
  try{await api('/api/logout',{method:'POST',body:'{}'});}
  catch{toast('خروج در سرور تأیید نشد؛ اتصال را بررسی کنید و دوباره تلاش کنید.');return;}
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
    if(a==='resubmit-order'){e.stopPropagation();return resubmitOrder(el.dataset.id);}
    if(a==='edit-returned-order')return openReturnedOrderEditor(el.dataset.id);
    if(a==='returned-add-line')return addReturnedLine();
    if(a==='returned-delete-line')return deleteReturnedLine(Number(el.dataset.index));
    if(a==='pick-return-product')return pickReturnedProduct(Number(el.dataset.index),el.dataset.productId,el.dataset.label);
    if(a==='save-returned-order')return saveReturnedOrder(el.dataset.id);
    if(a==='sales-edit-store-order')return openSalesStoreOrderEdit(el.dataset.id);
    if(a==='store-approve-v25')return openStoreApprovalV25(el.dataset.id);
    if(a==='store-quick-send-v40')return quickSendStoreOrder(el,true);
    if(a==='sales-warehouse-edit-request')return salesWarehouseEditRequestOpen(el.dataset.id,el.dataset.paymentId);
    if(a==='sales-store-document-print')return printSalesStoreDocument(el.dataset.id,Number(el.dataset.run));
    if(a==='sales-store-review')return salesStoreReview(el.dataset.id,Number(el.dataset.run));
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
  ONSITE_CANCELLATION_EXIT:{page:'gate',sub:'exit'},
  ONSITE_ORDER_CANCELLED:{page:'warehouse',sub:'incoming'},
  PICKUP_ENTRY:{page:'warehouse',sub:'incoming'},
  PICKUP_CANCELLATION_REQUESTED:{page:'sales',sub:'flow'},
  PICKUP_CANCELLATION_APPROVED:{page:'gate',sub:'exit'},
  RETURN_FROM_WAREHOUSE:{page:'sales',sub:'flow'},
  WAREHOUSE_DONE:{page:'sales',sub:'settlement'},
  STORE_ORDER_PENDING:{page:'sales',sub:'stores'},
  STORE_ADDITION_REQUESTED:{page:'sales',sub:'stores'},
  STORE_ADDITION_RESULT:{page:'sales',sub:'stores'},
  STORE_ADDITION_APPROVED:{page:'warehouse',sub:'stores'},
  STORE_ADDITION_UPDATE:{page:'store',sub:'registered'},
  STORE_CANCELLATION_REQUESTED:{page:'sales',sub:'stores'},
  STORE_CANCELLATION_REVIEWED:{page:'store',sub:'registered'},
  SETTLEMENT_CANCELLATION_REQUESTED:{page:'warehouse',sub:'incoming'},
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
    if(type==='ONSITE_ORDER_CANCELLED'&&route.page==='warehouse'){await go('warehouse','incoming');toast('سفارش لغوشده از صف انبار حذف شده است.');return finish(true);}
    if(type==='ONSITE_CANCELLATION_EXIT'&&entityType==='visit'){
      await go('gate','exit');const el=document.querySelector(`[data-cancelled-visit="${CSS.escape(entityId)}"]`);
      if(focusNotificationElement(el))return finish(true);return toast('این خروج دیگر در صف نگهبانی نیست.');
    }
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
    if(type==='SETTLEMENT_CANCELLATION_REQUESTED'&&route.page==='warehouse'){
      await go('warehouse','incoming');await wh38Paint('incoming');const el=document.querySelector(`[data-return-order="${CSS.escape(entityId)}"]`);
      if(focusNotificationElement(el))return finish(true);return toast('این درخواست دیگر در صف انبار نیست.');
    }
    const order=(await api('/api/orders/'+encodeURIComponent(entityId))).order;
    if(route.page==='warehouse'){
      const phase=order.orderType==='STORE'?'stores':(order.status==='SETTLEMENT_PENDING'&&type==='TRANSPORT_ASSIGNED'?'delivered':order.status==='WAREHOUSE_PREPARING'?'preparing':'incoming');
      if(order.orderType==='STORE')app.wh38.storeTab=order.status==='WAREHOUSE_PREPARING'?'preparing':'incoming';
      await go('warehouse',phase);
      if(type==='STORE_ADDITION_APPROVED'){const el=document.querySelector(`[data-store-addition-warehouse="${CSS.escape(entityId)}"]`);if(el&&el.dataset.request===notice?.requestId&&focusNotificationElement(el))return finish(true);return toast('درخواست افزودن کالا در این مرحله نیست.');}
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
      app.salesStoreTab=type==='STORE_ADDITION_REQUESTED'||type==='STORE_RUN_R1_SENT'||type==='STORE_RUN_R2_SENT'||order.status==='STORE_PENDING_SALES'?'incoming':order.status==='CLOSED'?'history':'processing';
      await go('sales','stores');
      if(type==='STORE_ADDITION_REQUESTED'){const el=document.querySelector(`[data-store-addition-sales="${CSS.escape(entityId)}"]`);if(el&&el.dataset.request===notice?.requestId&&focusNotificationElement(el))return finish(true);return toast('این درخواست دیگر در انتظار فروش نیست.');}
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
  $$(['storeedit','storeaddition'].includes(prefix)?'#modal [data-op-product-search]':'#content [data-op-product-search]').filter(el=>el.dataset.opProductSearch.startsWith(prefix+'-')).forEach(inp=>{
    inp.addEventListener('input',()=>{
      const idx=Number(inp.dataset.opProductSearch.split('-').pop());
      operationProductSearch(idx, inp.value, prefix, draftKey);
    });
  });
  $$(['storeedit','storeaddition'].includes(prefix)?'#modal [data-op-qty]':'#content [data-op-qty]').filter(el=>el.dataset.opQty.startsWith(prefix+'-')).forEach(inp=>inp.addEventListener('input',()=>{
    const idx=Number(inp.dataset.opQty.split('-').pop()); app[draftKey][idx].requestedQty=inp.value; updateOpSummary(draftKey, `${prefix}-summary`);
  }));
  $$(['storeedit','storeaddition'].includes(prefix)?'#modal [data-op-unit]':'#content [data-op-unit]').filter(el=>el.dataset.opUnit.startsWith(prefix+'-')).forEach(inp=>inp.addEventListener('change',()=>{
    const idx=Number(inp.dataset.opUnit.split('-').pop()); app[draftKey][idx].requestedUnit=inp.value; updateOpSummary(draftKey, `${prefix}-summary`);
  }));
  $$(['storeedit','storeaddition'].includes(prefix)?'#modal [data-op-desc]':'#content [data-op-desc]').filter(el=>el.dataset.opDesc.startsWith(prefix+'-')).forEach(inp=>inp.addEventListener('input',()=>{
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
function operationProductSearch(i,q,prefix,draftKey){
  searchProductOptions($(`[data-op-product-search="${prefix}-${i}"]`),$(`[data-op-suggest="${prefix}-${i}"]`),q,p=>`<button type="button" class="op-product-option" data-action="op-pick-product" data-prefix="${esc(prefix)}" data-draft-key="${esc(draftKey)}" data-index="${i}" data-product-id="${esc(p.id)}" data-label="${esc(p.name)}" data-quick="${esc(p.quickCode)}"><span><b>${esc(p.name)}</b><small>کد سریع ${esc(p.quickCode)} • ${esc(p.defaultUnit)}</small></span>${icon('check',16)}</button>`);
}
function pickOperationProduct(i,id,label,quick,prefix,draftKey){
  const row=app[draftKey]?.[i]; if(!row)return;
  row.productId=id; row.productLabel=label; row.quickCode=quick;
  const inp=$(`[data-op-product-search="${prefix}-${i}"]`); if(inp)inp.value=label;
  const box=$(`[data-op-suggest="${prefix}-${i}"]`); if(box)box.innerHTML='';
  renderOrderLineArea(prefix,draftKey);
  const qtyInput=$(`[data-op-qty="${prefix}-${i}"]`);if(qtyInput){qtyInput.focus();qtyInput.select?.();}
  toast('محصول انتخاب شد.');
}
function renderOrderLineArea(prefix,draftKey){
  const box=prefix==='storeedit'?$('#store-edit-lines'):prefix==='storeaddition'?$('#store-addition-lines'):$(`#${prefix}-lines`); if(!box)return;
  box.innerHTML=renderDraftLinesTable(app[draftKey].map((x,i)=>renderProductPickerLine(x,i,prefix)));
  bindOperationLines(prefix,draftKey); updateOpSummary(draftKey,`${prefix}-summary`);
}
function updateOpSummary(draftKey,elementId){
  const box=$(`#${elementId}`); if(!box)return;
  const rows=(app[draftKey]||[]).filter(x=>x.productId&&n(x.requestedQty)>0);
  const totalQty=rows.reduce((s,x)=>s+n(x.requestedQty),0);
  box.innerHTML=`<div class="mini-stat"><span>اقلام معتبر</span><strong>${qty(rows.length)}</strong></div><div class="mini-stat"><span>مجموع مقدار درخواستی</span><strong>${qty(totalQty)}</strong></div><div class="summary-lines">${rows.map(x=>`<div><span class="summary-product"><span class="code-pill">${esc(x.quickCode||'')}</span>${esc(x.productLabel)}</span><b>${qty(x.requestedQty)} ${esc(x.requestedUnit)}</b></div>`).join('')||'<div class="empty compact-empty">هنوز قلمی برای سفارش ثبت نشده است.</div>'}</div>`;
}

/* unified navigation */

/* dashboard */
function metricCard(label,value,hint,ico){return `<article class="metric-card"><div class="metric-icon">${icon(ico,22)}</div><div><span>${esc(label)}</span><strong>${qty(value)}</strong><small>${esc(hint)}</small></div></article>`}

/* sales tabs and operational intake */
function renderSalesTabs(tab){
  const map={intake:'onsite',orders:'flow',stores:'stores',remote:'remote',settlement:'settlement',invoices:'settlement'};
  tab=map[tab]||tab;
  const counts={onsite:badgeCount('salesIntake'),remote:badgeCount('salesRemote'),stores:badgeCount('store')+badgeCount('storeScheduled'),flow:badgeCount('salesFlow'),settlement:badgeCount('salesSettlement'),future:badgeCount('salesFuture')};
  const items=[['onsite','حضوری','مشتریان نگهبانی','gate'],['remote','غیرحضوری','سفارش‌های تلفنی','phone'],['stores','فروشگاه‌ها','تأیید و زمان‌بندی','sales'],['flow','در جریان','ارسال‌شده به انبار','truck'],['settlement','تسویه','فاکتور و خروج','receipt'],['future','سفارش‌های روزهای آتی','برنامه‌ریزی ارسال','calendar']];
  return `<nav class="v30-legacy-sales-tabs" aria-label="شش بخش کارتابل فروش">${items.map(([id,label,sub,ico],i)=>`<button type="button" class="v26-sales-tab v30-sales-tab ${tab===id?'active':''}" data-sales-tab="${id}"><span class="v26-tab-index">${fa(String(i+1).padStart(2,'0'))}</span><span class="v26-tab-icon">${icon(ico,20)}</span><span class="v26-tab-copy"><strong>${esc(label)}</strong><small>${esc(sub)}</small></span><b class="v26-tab-count ${counts[id]>0?'show':''}">${counts[id]>0?qty(counts[id]):''}</b></button>`).join('')}</nav>`;
}

function activateSalesView(){setHeader('فروش','کارتابل فروش','ثبت سفارش، سفارش‌های در جریان، سفارش غیرحضوری، تسویه و فاکتور');}
function renderSalesIntakeV21(visits){
  return `<div class="sales-workspace v21-workspace"><section class="op-panel intake-panel"><div class="op-panel-head"><div><span class="eyebrow">COUNTER QUEUE</span><h2>مراجعه‌کنندگان آماده ثبت سفارش</h2><p>مشتری را انتخاب کنید تا فرم سفارش مستقل باز شود.</p></div><div class="queue-total"><strong>${qty(visits.length)}</strong><span>منتظر اقدام</span></div></div><div class="search-bar-v21"><span>${icon('search',18)}</span><input id="salesSearchV21" placeholder="جستجوی نام، شماره تماس یا پلاک"></div><div id="salesVisitListV21" class="customer-queue-v21">${visits.map(v=>`<button class="customer-row-v21" data-action="open-order" data-id="${v.id}"><span class="customer-avatar-v21">${esc(initials(v.customer?.name||''))}</span><span class="customer-row-main"><b>${esc(v.customer?.name||'—')}</b><small>${esc(v.customer?.phone||'—')} • ${plateViewHtml(v.customer?.plate, 'بدون پلاک', true)}</small></span><span class="customer-row-time">${dt(v.createdAt)}</span><span class="row-arrow">${icon('arrow',18)}</span></button>`).join('')||'<div class="empty">مراجع‌کننده‌ای در صف نیست.</div>'}</div></section><aside class="op-sidecard"><div class="sidecard-top"><span class="eyebrow">QUICK VIEW</span><span class="live-pulse"><i></i> زنده</span></div><h3>فرآیند فروش</h3><div class="quick-flow-v21">${[['۱','ورود مشتری','تکمیل شده'],['۲','ثبت سفارش','این مرحله'],['۳','ارسال به انبار','بعد از تایید']].map((x,i)=>`<div class="quick-flow-item ${i===1?'active':''}"><span>${x[0]}</span><div><b>${x[1]}</b><small>${x[2]}</small></div></div>`).join('')}</div></aside></div>`;
}
function renderSalesOrdersV21(orders){
  return `<section class="op-panel v21-orders-panel"><div class="op-panel-head"><div><span class="eyebrow">ORDER PIPELINE</span><h2>سفارش‌های در جریان</h2><p>نمای کامل سفارش تا قبل از تسویه، همراه با نوع سفارش و آخرین وضعیت.</p></div><div class="panel-head-actions"><span class="live-pulse"><i></i> زنده</span></div></div><div class="order-board-v21">${orders.map(o=>`<article class="order-card-v21"><div class="order-card-top"><div><span class="order-code">${esc(fa(o.orderNo||'—'))}</span>${orderKindBadge(o)}${o.scheduledDate?`<span class="date-chip">${dateLabel(o.scheduledDate)} • ${esc((o.scheduledAt||'').slice(11,16)||'—')}</span>`:''}</div>${badge(o.status)}</div><div class="order-customer-v21"><div class="customer-avatar-v21">${esc(initials(storeAwareOrderName(o)))}</div><div><b>${esc(storeAwareOrderName(o))}</b><small>${esc(storeAwareOrderPhone(o))}</small></div></div><div class="order-card-meta"><span><b>${qty((o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').length)}</b> قلم</span><span>ثبت: ${dt(o.createdAt)}</span><span>آخرین اقدام: ${dt(o.updatedAt||o.createdAt)}</div><div class="order-preview-lines">${(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').slice(0,3).map(i=>`<div><span>${esc(i.product?.name||'')}</span><b>${qty(i.requestedQty)} ${esc(i.requestedUnit)}</b></div>`).join('')}${(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').length>3?`<small>+ ${qty((o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').length-3)} قلم دیگر</small>`:''}</div><div class="order-card-actions"><button class="btn btn-secondary" data-action="order-details" data-id="${o.id}">${icon('eye',15)} جزئیات کامل</button>${o.status==='RETURNED_TO_SALES'?`<button class="btn btn-secondary" data-action="edit-returned-order" data-id="${o.id}">${icon('edit',15)} اصلاح سفارش</button><button class="btn btn-primary" data-action="resubmit-order" data-id="${o.id}">${icon('send',15)} ارسال مجدد به انبار</button>`:''}</div></article>`).join('')||'<div class="empty">سفارش در جریان برای نمایش وجود ندارد.</div>'}</div></section>`;
}

function renderStoreApprovalV22(orders){return `<section class="store-approval-v22 op-panel"><div class="op-panel-head"><div><span class="eyebrow">STORE APPROVAL DESK</span><h2>سفارش‌های فروشگاه</h2><p>سفارش را بررسی کنید؛ <strong>تاریخ و ساعت ارسال فقط توسط واحد فروش</strong> تعیین می‌شود.</p></div><span class="queue-total"><strong>${qty(orders.length)}</strong><span>در انتظار بررسی</span></span></div><div class="store-approval-list-v22">${orders.map(o=>`<article class="store-approval-card-v22"><div class="store-approval-top"><div><span class="order-code">${esc(fa(o.orderNo||'—'))}</span><span class="type-chip remote">فروشگاه</span></div><span class="date-chip muted">${o.scheduledDate?`${dateLabel(o.scheduledDate)} • ${esc((o.scheduledAt||'').slice(11,16)||'—')}`:'زمان ارسال تعیین نشده'}</div><div class="store-approval-customer"><div class="customer-avatar-v21">${esc(initials(o.storeName||''))}</div><div><b>${esc(o.storeName||'فروشگاه')}</b></div></div><div class="store-approval-items">${(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').map(i=>`<div><span>${esc(i.product?.name||'')}</span><b>${qty(i.requestedQty)} ${esc(i.requestedUnit)}</b></div>`).join('')}</div><div class="store-approval-foot"><span>یادداشت: ${esc(o.notes||'بدون یادداشت')}</span><div class="toolbar"><button class="btn btn-secondary" data-action="store-order-details" data-id="${o.id}">${icon('eye',15)} جزئیات</button><button class="btn btn-primary" data-action="approve-store-order" data-id="${o.id}">${icon('calendar',15)} بررسی و تعیین زمان</button></div></div></article>`).join('')||'<div class="empty">سفارش فروشگاهی در انتظار بررسی وجود ندارد.</div>'}</div></section>`}


function bindSalesV21(tab){
  $('#content').onclick=async e=>{
    const sub=e.target.closest('[data-sub]'); if(sub){const [k,v]=sub.dataset.sub.split(':');app.sub[k]=v;await renderSales(v);return;}
    const el=e.target.closest('[data-action]'); if(!el)return; const a=el.dataset.action;
    if(a==='open-order')return openOrder(el.dataset.id);
    if(a==='back-order-intake'){app.orderDraft=[];return renderSales('onsite');}
    if(a==='order-details')return openOrderDetails(el.dataset.id);
    if(a==='pickup-date')return pickupChangeDate(el.dataset.id);
    if(a==='pickup-approve')return pickupApprove(el.dataset.id,el);
    if(a==='edit-returned-order')return openReturnedOrderEditor(el.dataset.id);
    if(a==='resubmit-order')return resubmitOrder(el.dataset.id);
    if(a==='op-pick-product')return pickOperationProduct(Number(el.dataset.index),el.dataset.productId,el.dataset.label,el.dataset.quick,el.dataset.prefix,el.dataset.draftKey);
    if(a==='op-remove-line'){const key=el.dataset.draftKey||'orderDraft'; const i=Number(el.dataset.index); if(app[key]?.length>1){app[key].splice(i,1);renderOrderLineArea(el.dataset.prefix,key)} return;}
    if(a==='submit-order')return submitOrder(el.dataset.id);
    if(a==='remote-add-line'){app.remoteDraft.push(defaultOrderLine());renderOrderLineArea('remote','remoteDraft');return;}
    if(a==='select-settlement')return selectSettlement(el.dataset.id);
    if(a==='back-settlement')return renderSales('settlement');
    if(a==='final-settle')return finalSettle(el.dataset.id);
    if(a==='fingerprint-capture')return fingerprintCapture();
    if(a==='clear-signature'){clearSignature();return}
    if(a==='invoice'||a==='print-invoice')return a==='invoice'?previewInvoice(el.dataset.id,Number(el.dataset.run)||null):printInvoice(el.dataset.id,Number(el.dataset.run)||null);
    if(a==='cancel-remote')return cancelRemoteOrder(el.dataset.id);
    if(a==='edit-remote')return editRemoteOrder(el.dataset.id);
  };
  const search=$('#salesSearchV21'); if(search) search.addEventListener('input',async()=>{const q=search.value.trim().toLowerCase();const visits=(await api('/api/visits')).visits||[];const filtered=visits.filter(v=>v.status==='WAITING_SALES' && [v.customer?.name,v.customer?.phone,v.customer?.plate].some(x=>String(x||'').toLowerCase().includes(q)));$('#salesVisitListV21').innerHTML=filtered.map(v=>`<button class="customer-row-v21" data-action="open-order" data-id="${v.id}"><span class="customer-avatar-v21">${esc(initials(v.customer?.name||''))}</span><span class="customer-row-main"><b>${esc(v.customer?.name||'—')}</b><small>${esc(v.customer?.phone||'—')} • ${plateViewHtml(v.customer?.plate, 'بدون پلاک', true)}</small></span><span class="customer-row-time">${dt(v.createdAt)}</span><span class="row-arrow">${icon('arrow',18)}</span></button>`).join('')||'<div class="empty">موردی پیدا نشد.</div>';});
}
async function refreshSalesV21(tab){
  try{
    if(app.page!=='sales' || app.sub.sales!==tab)return;
    if(tab==='intake'){const visits=(await api('/api/visits')).visits||[];const l=$('#salesVisitListV21');if(l)l.innerHTML=visits.filter(v=>v.status==='WAITING_SALES').map(v=>`<button class="customer-row-v21" data-action="open-order" data-id="${v.id}"><span class="customer-avatar-v21">${esc(initials(v.customer?.name||''))}</span><span class="customer-row-main"><b>${esc(v.customer?.name||'—')}</b><small>${esc(v.customer?.phone||'—')} • ${plateViewHtml(v.customer?.plate, 'بدون پلاک', true)}</small></span><span class="customer-row-time">${dt(v.createdAt)}</span><span class="row-arrow">${icon('arrow',18)}</span></button>`).join('')||'<div class="empty">مراجع‌کننده‌ای در صف نیست.</div>';}
    else if(tab==='orders'){const orders=(await api('/api/orders')).orders||[];const panel=$('.v21-orders-panel');if(panel){const replacement=htmlToElement(renderSalesOrdersV21(orders.filter(o=>['WAREHOUSE_PENDING','RETURNED_TO_SALES'].includes(o.status))));panel.replaceWith(replacement);}}
    else if(tab==='stores'){const orders=(await api('/api/orders')).orders||[];const panel=$('.store-approval-v22');if(panel){const replacement=htmlToElement(renderStoreApprovalV22(orders.filter(o=>o.orderType==='STORE'&&o.status==='STORE_PENDING_SALES')));panel.replaceWith(replacement);}}
    else if(tab==='remote'){const orders=(await api('/api/orders')).orders||[];const l=$('#remoteOrderList');if(l)l.innerHTML=remoteOrderRows(orders.filter(o=>o.orderType==='REMOTE'&&['SCHEDULED_REMOTE','WAREHOUSE_PENDING','RETURNED_TO_SALES'].includes(o.status)));}
    await refreshIndicators();
  }catch{}
}

/* independent order entry */

/* remote order handlers */
async function editRemoteOrder(id){return editFutureV25(id);}
async function cancelRemoteOrder(id){if(!confirm('این سفارش غیرحضوری لغو شود؟'))return;try{await api('/api/orders/'+id+'/cancel-remote',{method:'POST',body:JSON.stringify({reason:'لغو توسط فروش'})});toast('سفارش غیرحضوری لغو شد.');await renderSales('remote')}catch(e){toast(e.message)}}


// چاپ فقط وزن همان محمولهٔ ارسال‌شده؛ سند تسویه یا تأیید دریافت نیست.
function storeServicePrintButtons(id,runs,kind){
  const available=new Set(runs||[]);
  return `<div class="store-service-print">${(kind==='PARTIAL'?[1]:[1,2]).map(run=>`<button type="button" class="btn btn-secondary btn-sm" data-action="print-store-service" data-id="${esc(id)}" data-run="${run}" ${available.has(run)?'':'disabled title="سرویس هنوز ارسال نشده است"'}>${icon('receipt',14)} ${kind==='PARTIAL'?'چاپ محموله سفارش جزئی':'چاپ سرویس '+(run===1?'اول':'دوم')}</button>`).join('')}</div>`;
}
// Separate sales copy of the warehouse handover document; it does not record handover.
function storeSalesDocumentButtons(o,compact=false,includePrint=true){
 const sent=new Set(storeAvailableRuns(o)),payments=Array.isArray(o.payments)?o.payments:[],role=normalizeRole(app.user?.roleCode),runs=o.storeOrderKind==='PARTIAL'?[1]:[1,2];
 const editState=run=>{const payment=payments.find(row=>Number(row.deliveryRun)===run);return payment?{payment,edit:(o.documentEdits||[]).slice().reverse().find(row=>row.paymentId===payment.id)}:null;};
 const editActions=runs.map(run=>{
  const state=editState(run);if(!state||!sent.has(run))return '';
  if(state.edit?.status==='PENDING_WAREHOUSE')return `<span class="badge orange">اصلاح سرویس ${run===2?'دوم':'اول'} در صف انبار</span>`;
  const {payment}=state,shipment=run===1?o.storeRunOps?.r1Shipment:o.storeRunOps?.r2Shipment,base=shipment?.sentAt||payment.verifiedAt||payment.createdAt||'',stamp=Date.parse(base),expires=Number.isFinite(stamp)?stamp+72*60*60*1000:NaN,locked=role!=='admin'&&(!Number.isFinite(expires)||serverEpoch()>expires);
  return `<button type="button" class="btn btn-ghost btn-sm" data-action="sales-warehouse-edit-request" data-id="${esc(o.id)}" data-payment-id="${esc(payment.id)}" ${locked?'disabled title="مهلت ۷۲ ساعته گذشته یا زمان سند ثبت نشده است؛ فقط مدیر مجاز است"':''}>${icon('scale',14)} ${locked?'فقط مدیر: اصلاح وزن':'ارجاع اصلاح وزن/محصول'} · سرویس ${run===2?'دوم':'اول'}</button>`;
 }).join('');
 const printActions=includePrint?runs.map(run=>{
  const state=editState(run);if(state?.edit?.status==='PENDING_WAREHOUSE')return '';
  return `<button type="button" class="btn btn-secondary btn-sm" data-action="sales-store-document-print" data-id="${esc(o.id)}" data-run="${run}" ${sent.has(run)?'':'disabled title="این سرویس هنوز ارسال نشده است"'}>${icon('receipt',14)} ${o.storeOrderKind==='PARTIAL'?(compact?'سند جزئی':'چاپ سند محموله سفارش جزئی برای فروش'):`چاپ سرویس ${run===1?'اول':'دوم'}`}</button>`;
 }).join(''):'';
 const actions=printActions+editActions;
 return actions?`<div class="store-service-print">${actions}</div>`:'';
}
function storeSalesReviewButtons(o){
 if(o.transportWorkflow!==1)return '';
 return (o.storeOrderKind==='PARTIAL'?[1]:[1,2]).map(run=>{
  const key=String(run),hand=o.transportHandovers?.[key];
  return hand&&!o.transportStoreReviews?.[key]&&!o.transportStoreTrips?.[key]?`<button type="button" class="btn btn-primary btn-sm" data-action="sales-store-review" data-id="${esc(o.id)}" data-run="${run}">بررسی و تأیید ${o.storeOrderKind==='PARTIAL'?'محموله':`سرویس ${run===1?'اول':'دوم'}`}</button>`:'';
 }).join('');
}
async function salesStoreReview(id,run){
 try{
  const {document:doc}=await api('/api/sales/store-documents/'+encodeURIComponent(id)+'/'+run);
  if(!doc.handedOverToDriver)return toast('ابتدا انبار تحویل فیزیکی به راننده را ثبت کند.');
  openModal('بررسی فروش پیش از خروج',whStoreDocument(doc)+`<p>پس از بررسی سند و محموله، تأیید فروش را ثبت کنید. تأیید خروج فیزیکی بر عهده نگهبانی است.</p><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button><button type="button" class="btn btn-primary" data-confirm-store-review>تأیید بررسی و ارسال به نگهبانی</button></div>`);
  $('#modal [data-confirm-store-review]').onclick=async e=>{if(!confirm('سند، وزن و راننده همین سرویس را بررسی و تأیید می‌کنید؟'))return;const b=e.currentTarget;b.disabled=true;try{await api('/api/sales/store-transport/'+encodeURIComponent(id)+'/'+run+'/review',{method:'POST',body:JSON.stringify({reviewConfirmed:true})});closeModal();toast('بررسی فروش ثبت شد؛ سرویس منتظر تأیید خروج نگهبانی است.');if(app.salesCache)app.salesCache.fetchedAt=0;await renderSales('stores');await refreshIndicators();}catch(err){b.disabled=false;toast(err.message);}};
 }catch(e){toast(e.message);}
}
async function printSalesStoreDocument(id,run){
 try{const {document:doc}=await api('/api/sales/store-documents/'+encodeURIComponent(id)+'/'+run);whPrintDocument(doc,run);}catch(e){toast(e.message);}
}
function storeAvailableRuns(o){return [1,2].filter(run=>{const sh=run===1?o?.storeRunOps?.r1Shipment:o?.storeRunOps?.r2Shipment;return sh?.itemIds?.length||Object.keys(sh?.weights||{}).length||[...(o?.dispatchRuns||[]),...(o?.dispatches||[]),o?.dispatch].some(d=>Number(d?.run)===run&&(d?.shipmentItemIds?.length||Object.keys(d?.shipmentWeights||{}).length))||(o?.payments||[]).some(p=>Number(p.deliveryRun)===run&&p.priceLines?.length);});}
function printStoreService(id,run){
  return BTPrintFrame.url('/store-service-print.html',{query:new URLSearchParams({id,run}).toString()});
}
async function printStoreReturns(id){
  try{
    const {order,returns}=await api('/api/orders/'+encodeURIComponent(id)+'/returns');
    if(!Array.isArray(returns)||!returns.length)throw Error('برای این سفارش کالای مرجوعی ثبت نشده است.');
    const rows=returns.map((item,index)=>`<tr><td>${fa(index+1)}</td><td>${esc(item.productName||'—')}</td><td>${qty(item.kg)}</td><td>${esc(item.reason||'بدون توضیح')}</td><td>${esc(item.driverName||'—')}</td><td dir="ltr">${esc(fa(item.driverPlate||'—'))}</td><td>${esc(formatDateTime24(item.deliveredAt||item.createdAt))}</td></tr>`).join('');
    const total=returns.reduce((sum,item)=>sum+Number(item.kg||0),0);
    const title=`چاپ مرجوعی سفارش ${fa(order.orderNo||'—')}`;
    return BTPrintFrame.html(BTPrintDigits.documentHtml(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><title>${esc(title)}</title><style>
      @page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#202a33;font:11px/1.8 Vazirmatn,Tahoma,sans-serif}.return-sheet{max-width:186mm;margin:0 auto}.return-head{display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:2px solid #9f1c32;padding-bottom:10px}.return-brand{display:flex;align-items:center;gap:9px}.return-brand img{width:42px;height:42px;object-fit:contain}.return-brand b,.return-brand span{display:block}.return-brand b{font-size:17px;color:#8b182b}.return-brand span{font-size:9px;color:#586672}.return-title{text-align:left}.return-title h1{font-size:16px;margin:0}.return-title small{color:#586672}.return-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:12px 0}.return-meta>div{border:1px solid #d7dee4;border-radius:4px;padding:5px 8px;min-width:0}.return-meta span,.return-meta b{display:block;overflow-wrap:anywhere}.return-meta span{font-size:8px;color:#65727d}.return-meta b{font-size:10px}.return-table{width:100%;border-collapse:collapse;table-layout:fixed}.return-table th,.return-table td{border:1px solid #cbd3da;padding:6px 4px;text-align:center;vertical-align:top;overflow-wrap:anywhere}.return-table th{background:#edf1f4;font-size:9px}.return-table td:nth-child(2),.return-table td:nth-child(4){text-align:right}.return-table tfoot td{font-weight:700;background:#f5f7f8}.return-signatures{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin-top:28px;break-inside:avoid}.return-signatures div{min-height:48px;border-top:1px solid #7d8992;padding-top:5px;text-align:center;font-size:9px}.return-table tr{break-inside:avoid;page-break-inside:avoid}@media print{.return-sheet{max-width:none}.return-head,.return-meta{break-inside:avoid}}
      </style></head><body><main class="return-sheet"><header class="return-head"><div class="return-brand"><img src="/logo.png" alt=""><div><b>بابل طیور</b><span>واحد فروش و پیگیری مرجوعی کالا</span></div></div><div class="return-title"><h1>برگهٔ مرجوعی کالا</h1><small>چاپ سوابق ثبت‌شدهٔ مرجوعی</small></div></header><section class="return-meta"><div><span>شماره سفارش</span><b>${esc(fa(order.orderNo||'—'))}</b></div><div><span>فروشگاه</span><b>${esc(storeAwareOrderName(order))}</b></div><div><span>مقصد ارسال</span><b>${esc(order.dispatchPlace||'—')}</b></div></section><table class="return-table"><thead><tr><th>ردیف</th><th>کالا</th><th>وزن مرجوعی (کیلوگرم)</th><th>علت مرجوعی</th><th>راننده</th><th>پلاک</th><th>زمان ثبت مرجوعی</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">جمع وزن مرجوعی</td><td>${qty(total)}</td><td colspan="4">کیلوگرم</td></tr></tfoot></table><footer class="return-signatures"><div>نام و امضای تحویل‌دهنده</div><div>نام و امضای دریافت‌کننده</div></footer></main><script src="/print-ready.js"><\\/script></body></html>`));
  }catch(e){toast(e.message);return false;}
}
function storeOrderDispatches(o){return [...(Array.isArray(o?.dispatches)?o.dispatches:[]),...(o?.dispatch?[o.dispatch]:[])].filter((d,i,a)=>a.findIndex(x=>x.id===d.id&&x.run===d.run)===i)}
function isStoreDeliveryComplete(o){if(o?.storeReceiptConfirmedAt)return true;const ds=storeOrderDispatches(o);return ds.length>0&&ds.every(d=>!!d.storeReceiptConfirmedAt)}
function isStoreDeliveryInProgress(o){if(o?.orderType!=='STORE'||['STORE_PENDING_SALES','CANCELLED'].includes(o.status))return false;const hasDelivery=storeOrderDispatches(o).length>0||!!o?.storeRunOps?.r1Shipment||!!o?.storeRunOps?.r2Shipment;return hasDelivery&&!isStoreDeliveryComplete(o)}

/* v22 — store portal: store -> sales approval -> scheduled warehouse */
async function renderStorePortal(){
  if(app.timer){clearInterval(app.timer);app.timer=null}
  const d=await api('/api/store/orders'); const allStoreOrders=d.orders||[];const storeDeliveryView=app.sub.store==='delivery';app.storeDeliveryTab=app.storeDeliveryTab||'inProgress';let orders=allStoreOrders;if(storeDeliveryView){const delivered=allStoreOrders.filter(isStoreDeliveryComplete);const active=allStoreOrders.filter(isStoreDeliveryInProgress);orders=app.storeDeliveryTab==='delivered'?delivered:active;}
  $('#content').innerHTML=`<div class="store-portal-v22"><section class="store-hero-v22"><div><span class="eyebrow">BABOLTOYOOR STORE PORTAL</span><h2>کارتابل فروشگاه</h2><p>ثبت سفارش توسط فروشگاه، بررسی توسط واحد فروش و ورود به انبار پس از تعیین زمان ارسال.</p></div><div class="store-hero-badge"><span>${esc(app.user.storeName||app.user.fullName||'فروشگاه')}</span><small>دسترسی اختصاصی فروشگاه</small></div></section><div class="store-layout-v22"><section class="store-create-v22 op-panel"><div class="op-panel-head"><div><span class="eyebrow">NEW STORE ORDER</span><h2>ثبت سفارش جدید</h2><p>فروشگاه فقط سفارش و اقلام را ثبت می‌کند؛ تاریخ و ساعت ارسال بعداً توسط واحد فروش تعیین می‌شود.</p></div></div><form id="storeOrderForm"><div class="store-customer-grid"><div class="field"><label>نام مشتری</label><div class="input-shell op-input"><span>${icon('user',17)}</span><input name="name" required placeholder="نام و نام خانوادگی مشتری"></div></div><div class="field"><label>شماره تماس</label><div class="input-shell op-input"><span>${icon('user',17)}</span><input name="phone" required inputmode="tel" placeholder="۰۹۱۲ ..."></div></div><div class="store-schedule-lock"><div class="lock-icon">${icon('lock',17)}</div><div><strong>زمان ارسال</strong><span>توسط واحد فروش تعیین می‌شود</span></div></div></div><div class="store-section-title"><div><h3>اقلام سفارش</h3><span>محصول، مقدار، واحد و توضیح هر ردیف</span></div></div><div id="store-lines" class="op-lines"></div><div class="op-add-row"><button type="button" class="btn btn-secondary btn-lg" data-action="store-add-line">${icon('plus',17)} افزودن ردیف</button><span>واحدهای مجاز: کیلوگرم، بسته، عدد، کارتن</span></div><div class="store-notes"><div class="field"><label>یادداشت سفارش</label><div class="input-shell op-input op-textarea"><textarea name="notes" rows="2" maxlength="1000" placeholder="توضیحات برای فروش یا انبار..."></textarea></div></div></div><div class="store-submit-v22"><div><strong>ارسال برای تایید فروش</strong><small>فروشگاه مستقیماً به انبار دسترسی ندارد.</small></div><button class="btn btn-primary btn-lg" type="submit">${icon('send',18)} ثبت سفارش</button></div></form></section><aside class="store-list-v22 op-panel"><div class="op-panel-head compact"><div><span class="eyebrow">STORE ORDERS</span><h2>سوابق سفارش‌های فروشگاه</h2><p>وضعیت بررسی فروش، زمان تعیین‌شده توسط فروش و ورود به انبار</p></div><span class="queue-total"><strong>${qty(orders.length)}</strong><span>سفارش</span></span></div>${storeDeliveryView?`<nav class="store-delivery-tabs" aria-label="وضعیت تحویل"><button type="button" class="${app.storeDeliveryTab==='inProgress'?'active':''}" data-action="store-delivery-tab" data-tab="inProgress">در حال تحویل <b>${qty(allStoreOrders.filter(isStoreDeliveryInProgress).length)}</b></button><button type="button" class="${app.storeDeliveryTab==='delivered'?'active':''}" data-action="store-delivery-tab" data-tab="delivered">تحویل شده <b>${qty(allStoreOrders.filter(isStoreDeliveryComplete).length)}</b></button></nav>`:''}<div id="storeOrderList" class="store-order-list-v22">${storeOrderRowsV22(orders)}</div></aside></div></div>`;
  if(storeDeliveryView){$('.store-create-v22')?.remove();$('.store-list-v22')?.classList.add('store-delivery-view');const title=$('.store-list-v22 h2');if(title)title.textContent='تحویل و وضعیت سفارش‌ها';}else{app.storeDraft=[defaultOrderLine()]; renderOrderLineArea('store','storeDraft');}
  $('#content').onclick=async e=>{const el=e.target.closest('[data-action]'); if(!el)return; const a=el.dataset.action; if(a==='store-delivery-tab'){app.storeDeliveryTab=el.dataset.tab==='delivered'?'delivered':'inProgress';await renderStorePortal();return;} if(a==='store-add-line'){app.storeDraft.push(defaultOrderLine());renderOrderLineArea('store','storeDraft');} else if(a==='op-remove-line'&&el.dataset.prefix==='store'){const i=Number(el.dataset.index);if(app.storeDraft.length>1){app.storeDraft.splice(i,1);renderOrderLineArea('store','storeDraft')}} else if(a==='op-pick-product'&&el.dataset.prefix==='store'){pickOperationProduct(Number(el.dataset.index),el.dataset.productId,el.dataset.label,el.dataset.quick,'store','storeDraft')} else if(a==='store-order-details'){return openStoreOrderDetails(el.dataset.id)} else if(a==='edit-store-order'){return openStoreOrderEdit(el.dataset.id)} else if(a==='cancel-store-order'){if(confirm('این سفارش لغو شود؟')){try{await api('/api/store/orders/'+el.dataset.id+'/cancel',{method:'POST',body:JSON.stringify({reason:'لغو توسط فروشگاه'})});toast('سفارش لغو شد.');await renderStorePortal()}catch(err){toast(err.message)}}}};
  $('#content').addEventListener('submit',async e=>{if(e.target.id!=='storeOrderEditForm')return;e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const items=app.storeEditDraft.filter(x=>x.productId&&n(x.requestedQty)>0).map(x=>({productId:x.productId,requestedQty:n(x.requestedQty),requestedUnit:x.requestedUnit,description:String(x.description||'').trim()}));if(!items.length)return toast('حداقل یک محصول معتبر وارد کنید.');try{await api('/api/store/orders/'+e.target.dataset.id,{method:'PUT',body:JSON.stringify({...f,items})});toast('سفارش ویرایش شد.');closeModal();await renderStorePortal()}catch(err){toast(err.message)}});
  $('#storeOrderForm')?.addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const items=app.storeDraft.filter(x=>x.productId&&n(x.requestedQty)>0).map(x=>({productId:x.productId,requestedQty:n(x.requestedQty),requestedUnit:x.requestedUnit,description:String(x.description||'').trim()}));if(!items.length)return toast('حداقل یک محصول معتبر وارد کنید.');try{await api('/api/store/orders',{method:'POST',body:JSON.stringify({...f,items})});toast('سفارش برای تایید واحد فروش ارسال شد. زمان ارسال بعداً توسط فروش تعیین می‌شود.');await renderStorePortal()}catch(err){toast(err.message)}});
  app.timer=setInterval(async()=>{try{let x=(await api('/api/store/orders')).orders||[];if(app.sub.store==='delivery')x=app.storeDeliveryTab==='delivered'?x.filter(isStoreDeliveryComplete):x.filter(isStoreDeliveryInProgress);const el=$('#storeOrderList');if(el)el.innerHTML=storeOrderRowsV22(x)}catch{}},3500);
}
// Requested rows are shown independently from measured weights. The latter
// belong to the physical order item and cannot be split reliably by request.
function storeRequestRowsHtml(rows){
 if(!Array.isArray(rows)||!rows.length)return '';
 const counts=new Map();for(const r of rows){const name=String(r.productName||'').trim().normalize('NFC');if(name&&name!=='—'&&name!=='کالای حذف‌شده')counts.set(name,(counts.get(name)||0)+1);}
 const body=rows.map((r,i)=>{const name=String(r.productName||'').trim().normalize('NFC'),count=counts.get(name)||1;return `<tr><td data-label="ردیف">${fa(i+1)}</td><td data-label="محصول">${esc(r.productName||'—')}${count>1?` <small>(${qty(count)} ردیف هم‌نام)</small>`:''}</td><td data-label="مقدار درخواستی">${r.requestedQty==null?'نامشخص':qty(r.requestedQty)+' '+esc(r.requestedUnit||'')}</td><td data-label="منبع">${r.source==='ADDITION'?'درخواست افزوده‌شده':'سفارش اولیه'}</td></tr>`;}).join('');
 return `<section class="store-request-detail" data-store-request-rows><h3>ریز ردیف‌های ثبت‌شده</h3><p>ردیف‌های اولیه و افزوده‌شده جدا نمایش داده می‌شوند؛ وزن اندازه‌گیری‌شده به هر ردیف درخواست جداگانه نسبت داده نمی‌شود.</p><div class="bt-table-wrap"><table class="bt-table"><thead><tr><th>ردیف</th><th>محصول</th><th>مقدار درخواستی</th><th>منبع</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
}
async function openStoreOrderDetails(id){
 const notices=captureEntityNotices('order',id);
 try{
  const {order:o}=await api('/api/store/orders/'+encodeURIComponent(id));
  const active=(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED');
  const progress=new Map((o.storeRun?.items||[]).map(v=>[v.itemId,v]));
  const salesStatus=o.status==='CANCELLED'?'لغو شده':o.approvalStatus==='APPROVED'?'تأیید شده':'در انتظار تأیید فروش';
  openModal('جزئیات سفارش فروشگاه',`<div class="store-detail-modal">
    <div class="detail-modal-hero"><div><span class="eyebrow">STORE ORDER</span><h2>${esc(fa(o.orderNo||'—'))}</h2><p>${esc(storeAwareOrderName(o))} · ${o.storeOrderKind==='PARTIAL'?'سفارش جزئی':'سفارش روزانه'}${o.storeOrderKind==='PARTIAL'?(o.storePurpose==='STOCK'?' · تأمین تکمیلی':' · مشتری: '+esc(o.customer?.name||'—')):''}</p></div>${badge(o.status)}</div>
    <div class="detail-modal-grid"><div><span>تاریخ ارسال به انبار</span><b>${o.scheduledDate||o.scheduledAt?dateLabel(o.scheduledDate||String(o.scheduledAt).slice(0,10)):'توسط فروش تعیین نشده'}</b></div><div><span>ساعت ارسال به انبار</span><b>${o.scheduledAt?esc((o.scheduledAt||'').slice(11,16)):'تعیین نشده'}</b></div><div><span>وضعیت تأیید فروش</span><b>${esc(salesStatus)}</b></div>${o.dispatchPlace?`<div><span>مقصد</span><b>${esc(o.dispatchPlace)}</b></div>`:''}</div>
    ${o.notes?`<div class="store-detail-note"><b>یادداشت سفارش</b><p>${esc(o.notes)}</p></div>`:''}
    ${o.status==='RETURNED_TO_SALES'&&o.warehouseReturn?.reason?`<div class="store-detail-note"><b>علت ارجاع به فروش</b><p>${esc(o.warehouseReturn.reason)}</p></div>`:''}
    ${o.status==='CANCELLED'&&o.cancelReason?`<div class="store-detail-note"><b>علت لغو</b><p>${esc(o.cancelReason)}</p></div>`:''}
    ${(o.storeCancellationRequests||[]).map(r=>`<div class="store-detail-note"><b>درخواست لغو: ${r.status==='PENDING'?'در انتظار بررسی فروش':'بررسی‌شده'}</b><p>${esc(r.reason)}</p>${r.resolution?`<p>نتیجه بررسی: ${esc(r.resolution)}</p>`:''}</div>`).join('')}
    ${o.storeOrderKind!=='PARTIAL'&&o.storeRun?.enabled&&!['STORE_PENDING_SALES','CANCELLED'].includes(o.status)?`<div class="st-run-letterhead"><div class="st-run-chips"><span class="st-run-chip st-run-r1">سرویس اول: ${esc(o.storeRun.r1StageLabel||'هنوز به فروش ارسال نشده')}</span><span class="st-run-chip st-run-r2">سرویس دوم: ${esc(o.storeRun.r2StageLabel||'هنوز به فروش ارسال نشده')}</span></div></div>`:''}
    ${st38RunSummaryHtml(o)}
    <h3 class="store-detail-items-title">اقلام سفارش</h3><div class="detail-item-list">${active.map(it=>{const v=progress.get(it.id),show=v&&!['STORE_PENDING_SALES','CANCELLED'].includes(o.status);return `<div class="detail-item-row"><div><strong>${esc(it.product?.name||'—')}</strong><small>${esc(it.description||'بدون توضیح')}</small>${show?`<small>${o.storeOrderKind==='PARTIAL'?`وزن ثبت‌شده: ${qty(v.totalKg||0)} کیلوگرم${v.shortageClosed?' · کسری / عدم موجودی':''}`:`${esc(v.runStatus==='IN_SHIPPING'?'وزن‌کشی ثبت شده':(v.runStatusLabel||SR38_STATUS_LABEL[v.runStatus]||'در انتظار'))} · وزن ثبت‌شده: سرویس اول ${qty(v.r1Kg||0)} و سرویس دوم ${qty(v.r2Kg||0)} کیلوگرم · جمع ${qty(v.totalKg||0)} کیلوگرم${v.shortageKg?` · کسری ${qty(v.shortageKg)} کیلوگرم`:''}`}</small>`:''}</div><b>${qty(it.requestedQty)} ${esc(it.requestedUnit||'')}</b></div>`;}).join('')||'<div class="empty">قلم فعالی برای این سفارش وجود ندارد.</div>'}</div>
    ${storeRequestRowsHtml(o.storeRequestRows)}
    <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button>${o.status!=='CANCELLED'&&!(o.storeCancellationRequests||[]).some(r=>r.status==='PENDING')?`<button type="button" class="btn btn-secondary" data-store-cancel-request>${o.status==='STORE_PENDING_SALES'?'لغو سفارش':'درخواست لغو برای بررسی فروش'}</button>`:''}</div></div>`);
  const cancelButton=$('#modal [data-store-cancel-request]');
  if(cancelButton)cancelButton.onclick=async()=>{
   const reason=prompt('دلیل لغو یا درخواست لغو را وارد کنید:');if(!reason?.trim())return;
   const direct=o.status==='STORE_PENDING_SALES';
   if(!confirm(direct?'سفارش مستقیماً لغو شود؟':'درخواست برای بررسی فروش ثبت شود؟ این کار سفارش را خودکار لغو یا عملیات تحویل را متوقف نمی‌کند.'))return;
   cancelButton.disabled=true;try{await api('/api/store/orders/'+encodeURIComponent(id)+(direct?'/cancel':'/cancellation-request'),{method:'POST',body:JSON.stringify({reason:reason.trim()})});toast(direct?'سفارش لغو شد.':'درخواست به فروش ارجاع شد.');await renderStorePortal();await openStoreOrderDetails(id);}catch(e){cancelButton.disabled=false;toast(e.message);}
  };
  finishEntityNotices(notices);return true;
 }catch(e){toast(e.message);return false;}
}
async function openStoreOrderEdit(id){try{const o=(await api('/api/store/orders/'+id)).order;if(o.status!=='STORE_PENDING_SALES')return toast('ویرایش فقط پیش از بررسی فروش امکان‌پذیر است.');app.storeEditDraft=(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').map(i=>({productId:i.productId,productLabel:i.product?.name||'',quickCode:i.product?.quickCode||'',requestedQty:String(i.requestedQty),requestedUnit:i.requestedUnit||'کیلوگرم',description:i.description||''}));openModal('ویرایش سفارش فروشگاه',`<form id="storeOrderEditForm" data-id="${esc(id)}">${o.storeOrderKind!=='PARTIAL'?'':o.storePurpose==='STOCK'?'<p>تأمین تکمیلی فروشگاه</p>':`<div class="field"><label>نام مشتری</label><input name="name" required value="${esc(o.customer?.name||'')}"></div><div class="field"><label>شماره تماس (اختیاری)</label><input name="phone" inputmode="tel" value="${esc(o.customer?.phone||'')}"></div>`}<div id="store-edit-lines" class="op-lines"></div><button type="button" class="btn btn-secondary" id="storeEditAdd">افزودن ردیف</button><label>یادداشت سفارش<textarea name="notes">${esc(o.notes||'')}</textarea></label><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">انصراف</button><button class="btn btn-primary">ذخیره تغییرات</button></div></form>`);const paint=()=>{const b=$('#store-edit-lines');if(b){b.innerHTML=renderDraftLinesTable(app.storeEditDraft.map((x,i)=>renderProductPickerLine(x,i,'storeedit')));bindOperationLines('storeedit','storeEditDraft')}};paint();$('#storeEditAdd').onclick=()=>{app.storeEditDraft.push(defaultOrderLine());paint()};$('#storeOrderEditForm').addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));const items=app.storeEditDraft.filter(x=>x.productId&&n(x.requestedQty)>0).map(x=>({productId:x.productId,requestedQty:n(x.requestedQty),requestedUnit:x.requestedUnit,description:String(x.description||'').trim()}));if(!items.length)return toast('حداقل یک محصول معتبر وارد کنید.');const button=e.submitter;if(button)button.disabled=true;try{await api('/api/store/orders/'+encodeURIComponent(e.currentTarget.dataset.id),{method:'PUT',body:JSON.stringify({...f,items})});closeModal();toast('سفارش ویرایش شد.');if(app.page==='store')await renderStorePortal()}catch(err){if(button)button.disabled=false;toast(err.message)}});$('#storeOrderEditForm').addEventListener('click',e=>{const pick=e.target.closest('[data-action=op-pick-product]');if(pick){pickOperationProduct(+pick.dataset.index,pick.dataset.productId,pick.dataset.label,pick.dataset.quick,'storeedit','storeEditDraft');return}const remove=e.target.closest('[data-action=op-remove-line]');if(remove){app.storeEditDraft.splice(+remove.dataset.index,1);if(!app.storeEditDraft.length)app.storeEditDraft.push(defaultOrderLine());paint()}});}catch(e){toast(e.message)}}
function storeOrderRowsV22(orders){return orders.map(o=>`<article class="store-order-row-v22"><div class="store-row-head"><div><span class="order-code">${esc(fa(o.orderNo||'—'))}</span><span class="date-chip">${o.scheduledDate?`${dateLabel(o.scheduledDate)} • ${esc((o.scheduledAt||'').slice(11,16)||'—')}`:'زمان ارسال پس از بررسی فروش'}</div>${badge(o.status)}</div><div class="store-row-customer"><b>${esc(storeAwareOrderName(o))}</b><span>${esc(storeAwareOrderPhone(o))}</span></div><div class="store-row-items">${(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').map(i=>`<div><span>${esc(i.product?.name||'')}</span><b>${qty(i.requestedQty)} ${esc(i.requestedUnit)}</b></div>`).join('')}</div><div class="store-row-foot"><span>ارسال: <b>${o.scheduledAt?`${dateLabel(o.scheduledDate)} • ${esc((o.scheduledAt||'').slice(11,16))}`:'توسط فروش تعیین می‌شود'}</b></span><span>ثبت: ${dt(o.createdAt)}</span><button class="btn btn-secondary btn-sm" data-action="store-order-details" data-id="${o.id}">${icon('eye',14)} جزئیات</button>${o.status==='STORE_PENDING_SALES'?`<button class="btn btn-secondary btn-sm" data-action="edit-store-order" data-id="${o.id}">${icon('edit',14)} ویرایش سفارش</button><button class="btn btn-ghost btn-sm" data-action="cancel-store-order" data-id="${o.id}">${icon('trash',14)} لغو</button>`:''}</div></article>`).join('')||'<div class="empty">هنوز سفارشی ثبت نشده است.</div>'}
/* warehouse workbench — no modal */
async function renderWarehouse(){
  if(app.timer){clearInterval(app.timer);app.timer=null}
  const whTab=app.sub.warehouse||'incoming';const whStatus=whTab==='preparing'?'WAREHOUSE_PREPARING':'WAREHOUSE_PENDING';let orders=(await fetchPagedList('/api/orders?status='+whStatus,'orders')).orders||[];if(whTab==='stores'){orders=(await fetchPagedList('/api/orders','orders')).orders||[];orders=orders.filter(o=>o.orderType==='STORE'&&['WAREHOUSE_PENDING','WAREHOUSE_PREPARING'].includes(o.status));}if(whTab==='history'){return renderWarehouseHistory();}
  $('#content').innerHTML=`<div class="warehouse-v21"><aside class="warehouse-queue-panel"><div class="queue-panel-head"><div><span class="eyebrow">WAREHOUSE QUEUE</span><h2>صف سفارش‌ها</h2><p>به‌صورت خودکار بروزرسانی می‌شود.</p></div><span class="queue-total"><strong>${qty(orders.length)}</strong><span>منتظر اقدام</span></span></div><div id="warehouseQueueV21">${warehouseQueueRowsV21(orders)}</div></aside><main class="warehouse-workbench"><div id="warehouseEditor" class="warehouse-editor-v21"><div class="workbench-empty"><div class="empty-icon">${icon('scale',28)}</div><h3>یک سفارش را انتخاب کنید</h3><p>فرم تحویل کامل سفارش در همین صفحه باز می‌شود.</p></div></div></main></div>`;
  bindWarehouseV21(); app.timer=setInterval(fetchWarehouseLiveV21,2500);
}
function warehouseQueueRowsV21(orders){return orders.map(o=>`<button class="warehouse-queue-row ${app.selectedWarehouse===o.id?'selected':''}" data-action="open-warehouse" data-id="${o.id}"><span class="warehouse-queue-avatar">${esc(initials(storeAwareOrderName(o)))}</span><span class="warehouse-queue-main"><b>${esc(storeAwareOrderName(o))}</b><small>${orderKindLabel(o)}${o.scheduledDate?' • '+dateLabel(o.scheduledDate):''}</small></span><span class="warehouse-queue-time">${dt(o.updatedAt||o.createdAt)}</span>${icon('arrow',17)}</button>`).join('')||'<div class="empty">صف انبار خالی است.</div>'}
async function fetchWarehouseLiveV21(){try{const orders=(await api('/api/orders?status=WAREHOUSE_PENDING')).orders||[];const q=$('#warehouseQueueV21');if(q)q.innerHTML=warehouseQueueRowsV21(orders);if(app.selectedWarehouse&&!orders.find(o=>o.id===app.selectedWarehouse)){app.selectedWarehouse=null;const ed=$('#warehouseEditor');if(ed)ed.innerHTML='<div class="workbench-empty"><div class="empty-icon">'+icon('check',28)+'</div><h3>صف انبار به‌روز شد</h3><p>سفارش انتخاب‌شده از صف خارج شده است.</p></div>';}}catch{}}
function bindWarehouseV21(){$('#content').onclick=async e=>{const el=e.target.closest('[data-action]');if(!el)return;const a=el.dataset.action;if(a==='open-warehouse')return openWarehouse(el.dataset.id);if(a==='confirm-warehouse')return confirmWarehouseV21(el.dataset.id);if(a==='return-item-sales')return returnSales(el.dataset.id,el.dataset.itemId);if(a==='return-sales')return returnSales(el.dataset.id)};}
async function openWarehouse(id){try{app.selectedWarehouse=id;const d=await api('/api/orders/'+id);renderWarehouseEditorV21(d.order)}catch(e){toast(e.message)}}
function renderWarehouseEditorV21(o){
  const items=(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED');
  const totalReq=items.reduce((s,i)=>s+n(i.requestedQty),0);
  $('#warehouseEditor').innerHTML=`<section class="warehouse-sheet-v21"><div class="warehouse-sheet-head"><div><button class="back-link" data-action="return-sales" data-id="" style="display:none"></button><span class="eyebrow">DELIVERY WORKBENCH</span><h2>${esc(storeAwareOrderName(o))}</h2><p>${esc(storeAwareOrderPhone(o))} <span class="dot-sep">•</span> سفارش <b>${esc(fa(o.orderNo||'—'))}</b> ${orderKindBadge(o)}${o.scheduledDate?`<span class="date-chip">ورود به انبار ${esc(dateLabel(o.scheduledDate))}</span>`:''}${o.deliveryDate?`<span class="date-chip">تاریخ تحویل ${esc(dateLabel(o.deliveryDate))}</span>`:''}</p></div><div class="warehouse-head-status"><span class="live-pulse"><i></i> در حال کار</span>${badge(o.status)}</div></div><div class="warehouse-progress"><span class="done">ورود</span><i></i><span class="done">فروش</span><i></i><span class="active">انبار</span><i></i><span>تسویه</span><i></i><span>خروج</span></div><div class="warehouse-note-v21">برای هر قلم وزن واقعی تحویلی را فقط به کیلوگرم وارد کنید. در صورت نبود کالا، «عدم موجودی» را فعال کنید؛ این قلم با وزن صفر برای تسویه ثبت می‌شود.</div><div class="warehouse-items-v21">${items.map((i,k)=>warehouseItemCardV21(o,i,k)).join('')}</div><div class="warehouse-bottom-bar"><div><span>جمع وزن تحویلی</span><strong id="warehouseTotalKgV21">۰ کیلوگرم</strong><small>مقدار درخواستی: ${qty(totalReq)} واحد</small></div><div class="toolbar"><button class="btn btn-secondary btn-lg" data-action="return-sales" data-id="${o.id}">${icon('arrow',17)} ارجاع کل سفارش به فروش</button><button class="btn btn-primary btn-lg" data-action="confirm-warehouse" data-id="${o.id}">${icon('check',18)} ثبت تحویل و ارسال به تسویه</button></div></div></section>`;
  $$('#warehouseEditor [data-weight]').forEach(i=>i.addEventListener('input',updateWarehouseTotalV21));
  $$('#warehouseEditor [data-oos]').forEach(c=>c.addEventListener('change',()=>{const id=c.dataset.oos;const w=$(`#warehouseEditor [data-weight="${id}"]`);if(w){w.disabled=c.checked;if(c.checked)w.value='';}updateWarehouseTotalV21()}));
  updateWarehouseTotalV21();
}
function warehouseItemCardV21(o,i,k){return `<article class="warehouse-item-card-v21"><div class="item-index-v21">${fa(String(k+1))}</div><div class="item-product-v21"><div class="product-title-row"><div><strong>${esc(i.product?.name||'—')}</strong></div>${badge(i.itemStatus)}</div><div class="request-strip"><span>درخواست مشتری</span><b>${qty(i.requestedQty)} ${esc(i.requestedUnit)}</b></div></div><div class="item-description-v21"><span>توضیحات ردیف</span><p>${esc(i.description||'بدون توضیحات')}</p></div><div class="delivery-entry-v21"><label>وزن تحویلی نهایی</label><div class="weight-editor-v21"><input data-weight="${i.id}" type="text" inputmode="decimal" placeholder="۰٫۰۰۰"><span>کیلوگرم</span></div><label class="oos-check-v21"><input data-oos="${i.id}" type="checkbox"><span><b>عدم موجودی</b><small>این قلم موجود نیست</small></span></label></div><div class="item-actions-v21"><button class="btn btn-ghost btn-sm" data-action="return-item-sales" data-id="${o.id}" data-item-id="${i.id}">${icon('arrow',14)} ارجاع این ردیف به فروش</button></div></article>`}
function updateWarehouseTotalV21(){const total=$$('#warehouseEditor [data-weight]').reduce((s,e)=>s+(e.disabled?0:n(e.value)),0);const el=$('#warehouseTotalKgV21');if(el)el.textContent=qty(total)+' کیلوگرم';}
async function confirmWarehouseV21(id){const items=$$('#warehouseEditor [data-weight]').map(w=>{const oos=$(`#warehouseEditor [data-oos="${w.dataset.weight}"]`)?.checked||false;return {itemId:w.dataset.weight,deliveredKg:oos?0:n(w.value),outOfStock:oos}});if(!items.length)return toast('قلمی برای ثبت تحویل وجود ندارد.');if(items.some(x=>!x.outOfStock&&x.deliveredKg<=0))return toast('برای همه اقلام موجود، وزن تحویلی را وارد کنید.');try{await api('/api/orders/'+id+'/warehouse',{method:'POST',body:JSON.stringify({items})});toast('تحویل ثبت شد و سفارش برای تسویه ارسال شد.');app.selectedWarehouse=null;await renderWarehouse();}catch(e){toast(e.message)}}
async function returnSales(id,itemId=''){const reason=prompt('دلیل ارجاع به فروش را وارد کنید:','اصلاح سفارش / اصلاح وزن')||'';if(!reason)return;try{await api('/api/orders/'+id+'/return-sales',{method:'POST',body:JSON.stringify({itemId,reason})});toast('ارجاع به فروش ثبت شد.');app.selectedWarehouse=null;await renderWarehouse()}catch(e){toast(e.message)}}

/* reports — same design language + remote scheduling */
async function renderReports(){
  const d=await api('/api/reports'); const districts=d.gate.byDistrict||[]; const max=Math.max(1,...districts.map(x=>x.count)); const remote=d.remote||{};
  $('#content').innerHTML=`<div class="reports-v21"><section class="report-hero"><div><span class="eyebrow">MANAGEMENT INSIGHTS</span><h2>مرکز گزارش‌گیری</h2><p>عملکرد عملیاتی، سفارش‌های آینده و وضعیت مالی در یک نمای یکپارچه.</p></div><button class="btn btn-primary" data-action="print-page">${icon('receipt',17)} چاپ گزارش</button></section><div class="report-kpis-v21">${reportMetric('ورودی امروز',d.gate.today,'نگهبانی','gate')}${reportMetric('سفارش‌های امروز',d.sales.todayOrders,'فروش','sales')}${reportMetric('تحویل‌شده',d.warehouse.deliveredOrders,'انبار','warehouse')}${reportMetric('درآمد ثبت‌شده',moneyCompact(d.finance.revenue),'مالی','receipt',true)}${reportMetric('غیرحضوری برنامه‌ریزی‌شده',remote.scheduled||0,'آینده','calendar')}</div><div class="report-grid-v21"><section class="report-panel"><div class="section-head"><div><span class="eyebrow">REMOTE SCHEDULE</span><h3>تقویم سفارش‌های غیرحضوری</h3><p>تعداد سفارش‌های برنامه‌ریزی‌شده به تفکیک تاریخ</p></div></div><div class="date-bars">${(remote.byDate||[]).filter(x=>x.date!=='بدون تاریخ').slice(0,12).map(x=>`<div class="date-bar-row"><span>${dateLabel(x.date)}</span><div class="date-track"><div style="width:${Math.max(8,Math.round(x.count/Math.max(1,...(remote.byDate||[]).map(i=>i.count))*100))}%"></div></div><b>${qty(x.count)}</b></div>`).join('')||'<div class="empty">سفارش غیرحضوری برنامه‌ریزی‌شده‌ای ثبت نشده است.</div>'}</div></section><section class="report-panel"><div class="section-head"><div><span class="eyebrow">PROCESS STATUS</span><h3>وضعیت صف‌ها</h3><p>تصویر فعلی عملیات</p></div></div><div class="process-report-grid"><div><strong>${qty(d.sales.pendingWarehouse)}</strong><span>صف انبار</span></div><div><strong>${qty(d.sales.pendingSettlement)}</strong><span>آماده تسویه</span></div><div><strong>${qty(d.finance.readyExit)}</strong><span>آماده خروج</span></div><div><strong>${qty(remote.dueToday||0)}</strong><span>غیرحضوری امروز</span></div></div></section></div><div class="report-grid-v21"><section class="report-panel"><div class="section-head"><div><span class="eyebrow">VISIT DISTRIBUTION</span><h3>ورودی بر اساس محله</h3></div></div><div class="date-bars">${districts.map(x=>`<div class="date-bar-row"><span>${esc(x.district)}</span><div class="date-track"><div style="width:${Math.max(8,Math.round(x.count/max*100))}%"></div></div><b>${qty(x.count)}</b></div>`).join('')||'<div class="empty">داده‌ای برای نمایش نیست.</div>'}</div></section><section class="report-panel remote-highlight"><div><span class="eyebrow">REMOTE ORDERS</span><h3>سفارش‌های غیرحضوری</h3><p>کل ثبت‌شده: <strong>${qty(remote.total||0)}</strong></p></div><div class="remote-highlight-number">${qty(remote.scheduled||0)}</div><span>در انتظار تاریخ تحویل</span></section></div></div>`;
}
function reportMetric(label,val,hint,ico,text=false){return `<article class="report-metric-v21"><span class="metric-icon">${icon(ico,20)}</span><div><small>${esc(label)}</small><strong>${text?val:qty(val)}</strong><span>${esc(hint)}</span></div></article>`}

/* replace legacy warehouse/sales tab timers if referenced */


/* v21 interaction bridge: actions that live outside module-specific binders */
document.addEventListener('click',async e=>{
  const pageBtn=e.target.closest('[data-page]');
  if(pageBtn && pageBtn.closest('#content')){e.preventDefault(); const p=pageBtn.dataset.page; if(p) await go(p); return;}
  const actionEl=e.target.closest('[data-action]');
  if(!actionEl) return;
  if(actionEl.dataset.action==='print-page'){
    try{
      const d=await api('/api/reports');
      const remote=d.remote||{};
      BTPrintFrame.html(BTPrintDigits.documentHtml(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><title>گزارش مدیریتی بابل طیور</title><style>body{font-family:"B Yekan",Tahoma,sans-serif;color:#1b2027;padding:28px}h1{font-size:24px}h2{font-size:17px;border-bottom:1px solid #ddd;padding-bottom:8px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.box{border:1px solid #ddd;border-radius:12px;padding:12px}.box strong{display:block;font-size:22px;color:#b3132a;margin-top:5px}table{width:100%;border-collapse:collapse;margin-top:15px}th,td{border:1px solid #ddd;padding:8px;font-size:11px;text-align:right}@media print{body{padding:0}}</style></head><body><h1>گزارش مدیریتی بابل طیور</h1><p>${esc(todayText())}</p><div class="grid"><div class="box">ورودی امروز<strong>${qty(d.gate?.today||0)}</strong></div><div class="box">سفارش امروز<strong>${qty(d.sales?.todayOrders||0)}</strong></div><div class="box">درآمد<strong>${esc(money(d.finance?.revenue||0))}</strong></div><div class="box">غیرحضوری آینده<strong>${qty(remote.scheduled||0)}</strong></div></div><h2>برنامه سفارش‌های غیرحضوری</h2><table><thead><tr><th>تاریخ</th><th>تعداد سفارش</th></tr></thead><tbody>${(remote.byDate||[]).map(x=>`<tr><td>${dateLabel(x.date)}</td><td>${qty(x.count)}</td></tr>`).join('')}</tbody></table><script src="/print-ready.js"><\/script></body></html>`));
    }catch(err){toast(err.message)}
  }
});
// v21 final UI refinements
function transportOrderServiceHtml(o,canReturn){
 if(o.transportWorkflow!==1||o.deliveryMode!=='DELIVERY')return '';
 const runs=o.orderType==='STORE'?(o.storeOrderKind==='PARTIAL'?[1]:[1,2]):[0];
 return `<section class="section-space"><h3>برنامه ترابری</h3>${runs.map(run=>{const key=String(run),a=o.transportAssignments?.[key],hand=o.transportHandovers?.[key],trip=o.transportStoreTrips?.[key],status=trip?.status==='CLOSED'?'مدارک به فروش بازگشت':trip?.status==='RECEIPT_CONFIRMED'?'دریافت فروشگاه تأیید شد':trip?.status==='IN_TRANSIT'?'در مسیر':o.transportStoreReviews?.[key]?'منتظر تأیید خروج نگهبانی':hand?'منتظر بررسی فروش':'در انتظار تحویل انبار';return `<div class="transport-plan-detail-row"><b>${o.storeOrderKind==='PARTIAL'?'محموله سفارش جزئی':run?`سرویس ${run===1?'اول':'دوم'}`:'سفارش مشتری'}</b><span>راننده: ${esc(a?.driverName||'تعیین نشده')}</span><span>تماس: ${esc(fa(a?.driverPhone||'—'))}</span><span>خودرو: ${esc(a?.vehicleType||'—')} ${esc(fa(a?.vehiclePlate||''))}</span>${run?`<span>${esc(status)}</span>`:''}${run&&hand&&!o.transportStoreReviews?.[key]&&!trip&&canReturn&&app.features?.experimentalTransport?`<button type="button" class="btn btn-primary btn-sm" data-store-review-detail="${run}">بررسی سند و تأیید فروش</button>`:''}${run&&trip?.status==='RECEIPT_CONFIRMED'&&canReturn&&app.features?.experimentalTransport?`<button type="button" class="btn btn-primary btn-sm" data-store-transport-return="${run}">ثبت بازگشت مدارک همین سرویس</button>`:''}</div>`;}).join('')}</section>`;
}
function salesStoreProcessingDetailActions(o){
  const id=esc(o.id);
  const returned=o.status==='RETURNED_TO_SALES'?`<button type="button" class="btn btn-secondary" data-action="edit-returned-order" data-id="${id}">${icon('edit',16)} اصلاح سفارش</button><button type="button" class="btn btn-primary" data-action="resubmit-order" data-id="${id}">${icon('send',16)} ارسال مجدد به انبار</button>`:'';
  const finalize=o.dispatch?.status==='DELIVERED'?`<button type="button" class="btn btn-primary" data-action="sales-finalize-driver-delivery" data-id="${id}">${icon('check',16)} تأیید نهایی تحویل${o.dispatch.run?` سرویس ${o.dispatch.run===2?'دوم':'اول'}`:''}</button>`:'';
  const returns=o.transportWorkflow===1&&o.deliveryMode==='DELIVERY'&&app.features?.experimentalTransport?(o.storeOrderKind==='PARTIAL'?[1]:[1,2]).filter(run=>o.transportStoreTrips?.[String(run)]?.status==='RECEIPT_CONFIRMED').map(run=>`<button type="button" class="btn btn-primary btn-sm" data-store-transport-return="${run}">ثبت بازگشت مدارک ${o.storeOrderKind==='PARTIAL'?'محموله':'سرویس '+(run===1?'اول':'دوم')}</button>`).join(''):'';
  return returned+finalize+storeSalesReviewButtons(o)+storeSalesDocumentButtons(o,false,true)+returns;
}
async function openOrderDetails(id,options={}){
  const notices=captureEntityNotices('order',id);
  try{
    const d=await api('/api/orders/'+id); const o=d.order||{}; const items=o.items||[];
    const activeItems=items.filter(i=>i.itemStatus!=='CANCELLED');
    const storeProcessing=options.storeProcessing&&app.page==='sales'&&can('sales')&&o.orderType==='STORE'&&['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','RETURNED_TO_SALES'].includes(o.status);
    const totalRequested=activeItems.reduce((s,i)=>s+n(i.requestedQty),0);
    const totalDelivered=activeItems.reduce((s,i)=>s+n(i.deliveredKg||0),0);
    // v37.35.0 — وزن هر سرویس ستون جدا در همان فهرست اقلام است؛ «خلاصهٔ» چیپی بالای فرم حذف شد
    // تا اطلاعات سفارش دو تکه نباشد. پیش از شروع وزن‌کشی انبار (مثلاً ورودی فروش) ستونی نمی‌آید
    // و فقط فهرست محصول دیده می‌شود.
    const runView={};((o.storeRun&&o.storeRun.items)||[]).forEach(v=>{runView[v.itemId]=v});
    const showRunCols=o.storeOrderKind!=='PARTIAL'&&!!(o.storeRun&&o.storeRun.enabled)&&(!!o.storeRun.finalizedAt||Object.values(runView).some(v=>n(v.r1Kg)>0||n(v.r2Kg)>0));
    openModal('جزئیات کامل سفارش',`<div class="order-details-modal v21-detail-modal">
      <div class="order-detail-head">
        <div><span class="eyebrow">ORDER DETAIL</span><h2>${esc(fa(o.orderNo||'—'))}</h2><p>${esc(storeAwareOrderName(o))} • ${esc(storeAwareOrderPhone(o))}</p></div>
        <div class="detail-status-stack">${orderKindBadge(o)}${o.scheduledDate?`<span class="date-chip">ورود به انبار ${esc(dateLabel(o.scheduledDate))}</span>`:''}${o.deliveryDate?`<span class="date-chip">تاریخ تحویل ${esc(dateLabel(o.deliveryDate))}</span>`:''}${badge(o.status)}</div>
      </div>
      <div class="detail-grid detail-grid-6">
        <div><span>نوع سفارش</span><b>${orderKindLabel(o)}</b></div>
        <div><span>زمان ثبت</span><b>${dt(o.createdAt)}</b></div>
        <div><span>آخرین اقدام</span><b>${dt(o.updatedAt||o.createdAt)}</b></div>
        <div><span>تعداد اقلام</span><b>${qty(activeItems.length)} قلم</b></div>
        <div><span>مقدار درخواستی</span><b>${qty(totalRequested)}</b></div>
        <div><span>وزن تحویلی</span><b>${qty(totalDelivered)} کیلوگرم</b></div>
        <div><span>محل ارسال</span><b>${esc(o.dispatchPlace||'—')}</b></div>
      </div>
      ${o.transportWorkflow===1?`<p><b>روش تحویل:</b> ${o.deliveryMode==='DELIVERY'?'ارسال توسط پخش':'تحویل در انبار'}</p>`:''}
      ${depositSummaryHtml(o.deposit)}
      ${transportOrderServiceHtml(o,can('sales')&&!storeProcessing)}
      ${warehouseReturnNoteHtml(o)}
      ${app.page==='sales'&&o.orderType==='STORE'?(o.storeCancellationRequests||[]).map(r=>`<div class="detail-note"><div><b>درخواست لغو فروشگاه: ${r.status==='PENDING'?'در انتظار بررسی':'بررسی‌شده'}</b><p>${esc(r.reason)}</p>${r.resolution?`<p>نتیجه: ${esc(r.resolution)}</p>`:''}${r.status==='PENDING'?`<button type="button" class="btn btn-secondary" data-store-cancel-review="${esc(r.id)}">ثبت نتیجه بررسی</button>`:''}</div></div>`).join(''):''}
      ${o.notes?`<div class="detail-note"><span>${icon('info',16)}</span><div><b>یادداشت سفارش</b><p>${esc(o.notes)}</p></div></div>`:''}
      ${app.page==='sales'&&!storeProcessing&&['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','RETURNED_TO_SALES'].includes(o.status)?`<section class="sales-live-weights" data-sales-live-order="${esc(o.id)}"><h3>وزن‌های ذخیره‌شدهٔ انبار</h3><p data-live-weight-status>بر اساس آخرین وزن ذخیره‌شدهٔ انبار؛ پیش‌نویس تحویل نهایی نیست.</p><div data-live-weight-rows>${salesLiveWeightsHtml(o)}</div></section>`:''}
      <div class="table-wrap section-space" ${storeProcessing?`data-sales-live-order="${esc(o.id)}" data-sales-store-live="true"`:""}>${storeProcessing?'<p data-live-weight-status>جمع وزن ذخیره‌شدهٔ سرویس‌ها؛ به معنی تحویل نهایی نیست.</p>':''}<table class="table v21-detail-table"><thead><tr><th>#</th><th>محصول</th><th>مقدار درخواستی</th><th>واحد</th><th>توضیحات</th>${showRunCols?'<th>وزن سرویس اول</th><th>وزن سرویس دوم</th>':''}${storeProcessing?'<th>ذخیره‌شده</th>':''}<th>وزن تحویلی</th><th>وضعیت</th></tr></thead><tbody>${items.map((i,k)=>`<tr class="${i.itemStatus==='CANCELLED'?'row-cancelled':''}"><td>${fa(String(k+1))}</td><td><strong>${esc(i.product?.name||'—')}</strong></td><td>${qty(i.requestedQty)}</td><td>${esc(i.requestedUnit||'—')}</td><td>${esc(i.description||'—')}</td>${showRunCols?`<td data-store-run1-item="${esc(i.id)}">${runView[i.id]&&n(runView[i.id].r1Kg)>0?qty(runView[i.id].r1Kg)+' کیلوگرم':'—'}</td><td data-store-run2-item="${esc(i.id)}">${runView[i.id]&&n(runView[i.id].r2Kg)>0?qty(runView[i.id].r2Kg)+' کیلوگرم':'—'}</td>`:''}${storeProcessing?`<td data-store-saved-item="${esc(i.id)}">${salesStoreSavedWeight(i,runView[i.id])}</td>`:''}<td>${i.deliveredKg==null?'—':qty(i.deliveredKg)+' کیلوگرم'}</td><td>${badge(i.itemStatus)}</td></tr>`).join('')}</tbody></table></div>
      <div class="sticky-actions"><span class="subtle">تمام تغییرات و ارجاع‌ها در سوابق مدیریتی ثبت می‌شوند.</span><div class="toolbar"><button class="btn btn-secondary" data-action="close-modal">بستن</button>${app.page==='warehouse'&&o.status==='WAREHOUSE_PENDING'?`<button class="btn btn-primary" data-wh-accept-order>تأیید دریافت و ورود به آماده‌سازی</button>`:''}${app.page==='warehouse'&&o.status==='WAREHOUSE_PREPARING'?`<button class="btn btn-primary" data-wh-start-order>شروع آماده‌سازی</button>`:''}${app.page==='warehouse'&&app.features?.pickupStaging&&o.visit?.status==='PICKUP_PRESENT'&&!o.pickupCancellation?`<button class="btn btn-secondary" data-wh-pickup-cancel>ثبت انصراف بدون تحویل</button>`:''}${o.status==='RETURNED_TO_SALES'&&!storeProcessing?`<button class="btn btn-secondary" data-action="edit-returned-order" data-id="${o.id}">${icon('edit',16)} اصلاح سفارش</button><button class="btn btn-primary" data-action="resubmit-order" data-id="${o.id}">${icon('send',16)} ارسال مجدد به انبار</button>`:''}${storeProcessing?salesStoreProcessingDetailActions(o):''}${app.page==='sales'&&can('sales')&&o.orderType==='STORE'&&o.status==='STORE_PENDING_SALES'?`<button class="btn btn-secondary" data-action="sales-edit-store-order" data-id="${esc(o.id)}">${icon('edit',16)} ویرایش سفارش</button><button class="btn btn-secondary" data-action="store-approve-v25" data-id="${esc(o.id)}">${icon('calendar',16)} ارسال با زمان‌بندی</button><button class="btn btn-primary" data-action="store-quick-send-v40" data-id="${esc(o.id)}">${icon('send',16)} ارسال سریع</button>`:''}</div></div>
    </div>`)
    const reviewCancel=$('#modal [data-store-cancel-review]');if(reviewCancel)reviewCancel.onclick=async()=>{
      const resolution=prompt('نتیجه بررسی، اقدامات انجام‌شده یا اقدامات لازم را بنویسید. این ثبت، سفارش یا اسناد را خودکار لغو نمی‌کند:');if(!resolution?.trim())return;
      if(!confirm('نتیجه بررسی به فروشگاه اطلاع داده شود؟'))return;reviewCancel.disabled=true;
      try{await api('/api/sales/store-cancellation-requests/'+encodeURIComponent(o.id)+'/review',{method:'POST',body:JSON.stringify({requestId:reviewCancel.dataset.storeCancelReview,resolution:resolution.trim()})});toast('نتیجه بررسی ثبت شد؛ وضعیت سفارش تغییر نکرد.');if(app.salesCache)app.salesCache.fetchedAt=0;await fetchSalesCache(true);await renderSales('stores');await openOrderDetails(o.id);await refreshIndicators();}catch(e){reviewCancel.disabled=false;toast(e.message);}
    };
    const accept=$('#modal [data-wh-accept-order]');if(accept)accept.onclick=async()=>{accept.disabled=true;try{await api('/api/orders/'+encodeURIComponent(o.id)+'/warehouse/accept',{method:'POST'});await wh38Shell('incoming');closeModal();await refreshIndicators();}catch(e){accept.disabled=false;toast(e.message);}};
    // v1.1.11 — عملیات ثانویهٔ انبار از جدول به صفحهٔ جزئیات منتقل شد (جدول تک‌دکمه‌ای: فقط «جزئیات سفارش»)
    const whStart=$('#modal [data-wh-start-order]');if(whStart)whStart.onclick=async()=>{whStart.disabled=true;try{const r=await api('/api/orders/'+encodeURIComponent(o.id)+'/warehouse/start-preparing',{method:'POST',body:'{}'});toast('آماده‌سازی سفارش ثبت شد.');closeModal();if(r.order&&r.order.storeRun&&r.order.storeRun.enabled)sr38Sheet(r.order);else wh38Sheet(r.order);}catch(e){whStart.disabled=false;toast(e.message);}};
    const whCancel=$('#modal [data-wh-pickup-cancel]');if(whCancel)whCancel.onclick=async()=>{const reason=prompt('دلیل انصراف را وارد کنید:');if(!reason?.trim())return;if(!confirm('آیا انبار تأیید می‌کند هیچ کالایی به این مراجعه تحویل نشده است؟'))return;whCancel.disabled=true;try{await api('/api/pickup/'+encodeURIComponent(o.id)+'/cancellation',{method:'POST',body:JSON.stringify({reason,confirmedNoGoods:true})});toast('عدم تحویل ثبت شد و در انتظار تأیید فروش است.');closeModal();await refreshIndicators();wh38Shell(app.wh38.phase);}catch(e){whCancel.disabled=false;toast(e.message);}};
    document.querySelectorAll('#modal [data-store-review-detail]').forEach(button=>{button.onclick=()=>salesStoreReview(o.id,Number(button.dataset.storeReviewDetail));});
    document.querySelectorAll('#modal [data-store-transport-return]').forEach(button=>{button.onclick=async()=>{const run=Number(button.dataset.storeTransportReturn);if(!confirm(`آیا مدارک سرویس ${run===1?'اول':'دوم'} پس از دریافت فروشگاه به فروش بازگشته است؟`))return;button.disabled=true;try{const result=await api('/api/sales/store-transport/'+encodeURIComponent(o.id)+'/'+run+'/return',{method:'POST',body:JSON.stringify({documentsReturned:true})});toast(result.orderClosed?'مدارک ثبت شد و سفارش فروشگاه بسته شد.':'بازگشت مدارک این سرویس ثبت شد.');if(app.salesCache)app.salesCache.fetchedAt=0;if(app.page==='sales'&&app.sub.sales==='delivery'){const data=await fetchSalesCache(true);paintSalesPaneV29('delivery',data);}else if(app.page==='sales')await renderSales('stores');await openOrderDetails(o.id,{storeProcessing:!!storeProcessing});}catch(err){button.disabled=false;toast(err.message);}};});
    finishEntityNotices(notices);return true;
  }catch(e){toast(e.message);return false;}
}


function renderRemoteOrdersV21(orders){
  const future=orders.filter(o=>o.status==='SCHEDULED_REMOTE').length;
  const due=orders.filter(o=>o.status!=='SCHEDULED_REMOTE').length;
  return `<div class="remote-workspace remote-workspace-v21">
    <section class="remote-create op-panel">
      <div class="op-panel-head">
        <div><span class="eyebrow">REMOTE ORDER DESK</span><h2>ثبت سفارش غیرحضوری</h2><p>برای مشتریان تلفنی یا هماهنگ‌شده، سفارش را امروز یا برای تاریخ آینده ثبت کنید.</p></div>
        <div class="remote-kpi-mini"><span>برنامه‌ریزی‌شده</span><strong>${qty(future)}</strong><small>تا زمان سررسید در صف جداگانه باقی می‌مانند</small></div>
      </div>
      <form id="remoteOrderForm" class="remote-form">
        <div class="remote-customer-grid">
          <div class="field"><label>نام مشتری</label><div class="input-shell op-input"><span>${icon('user',17)}</span><input name="name" required placeholder="نام و نام خانوادگی"></div></div>
          <div class="field"><label>شماره تماس</label><div class="input-shell op-input"><span>${icon('phone',17)}</span><input name="phone" required inputmode="tel" placeholder="۰۹۱۲ ..."></div></div>
          ${jalaliInput('تاریخ ورود به انبار','scheduledDate',today(),true)}
          <div class="field remote-notes"><label>یادداشت کلی سفارش</label><div class="input-shell op-input op-textarea"><textarea name="notes" rows="2" maxlength="1000" placeholder="زمان مراجعه، هماهنگی مشتری یا نکات مهم سفارش..."></textarea></div></div>
        </div>
        <div class="remote-items-head"><div><span class="eyebrow">ORDER LINES</span><h3>اقلام سفارش</h3><p>هر ردیف محصول، مقدار، واحد و توضیحات اختصاصی خودش را دارد.</p></div></div>
        <div id="remote-lines" class="op-lines"></div>
        <div class="op-add-row"><button type="button" class="btn btn-secondary btn-lg" data-action="remote-add-line">${icon('plus',17)} افزودن ردیف جدید</button><span>واحدهای مجاز: کیلوگرم، بسته، عدد، کارتن</span></div>
        <div class="remote-submit-bar"><div><strong>ثبت و برنامه‌ریزی سفارش</strong><small>سفارش امروز مستقیماً وارد صف انبار می‌شود؛ سفارش آینده در فهرست برنامه‌ریزی می‌ماند و در تاریخ تعیین‌شده فعال می‌شود.</small></div><button class="btn btn-primary btn-lg" type="submit">${icon('send',18)} ثبت سفارش غیرحضوری</button></div>
      </form>
    </section>
    <aside class="remote-list op-panel">
      <div class="op-panel-head compact"><div><span class="eyebrow">PLANNED & DUE</span><h2>سفارش‌های غیرحضوری</h2><p>پیگیری، مشاهده جزئیات و ویرایش سفارش‌های آینده</p></div><span class="queue-total"><strong>${qty(orders.length)}</strong><span>سفارش فعال</span></span></div>
      <div class="remote-filter-bar"><div class="search-bar-v21"><span>${icon('search',17)}</span><input id="remoteSearchV21" placeholder="جستجوی نام مشتری یا شماره تماس"></div><div class="input-shell op-input remote-filter-date"><span>${icon('calendar',16)}</span><input id="remoteDateV21" class="jalali-date-filter" placeholder="جستجوی تاریخ ۱۴۰۵/۰۷/۱۴" inputmode="numeric" autocomplete="off"></div></div>
      <div id="remoteOrderList" class="remote-list-rows">${remoteOrderRows(orders)}</div>
    </aside>
  </div>`;
}

function remoteOrderRows(orders){
  return orders.map(o=>`<article class="remote-row-v21">
    <div class="remote-row-top"><div><span class="order-code">${esc(fa(o.orderNo||'—'))}</span>${orderKindBadge(o)}${o.scheduledDate?`<span class="date-chip">${dateLabel(o.scheduledDate)} • ${esc((o.scheduledAt||'').slice(11,16)||'—')}</span>`:''}</div>${badge(o.status)}</div>
    <div class="remote-row-main"><div class="customer-avatar-v21 small">${esc(initials(storeAwareOrderName(o)))}</div><div><b>${esc(storeAwareOrderName(o))}</b><small>${esc(storeAwareOrderPhone(o))}</small></div></div>
    <div class="remote-row-items">${(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').slice(0,2).map(i=>`<div><span>${esc(i.product?.name||'—')}</span><b>${qty(i.requestedQty)} ${esc(i.requestedUnit||'')}</b></div>`).join('')}${(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').length>2?`<small>+ ${qty((o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').length-2)} قلم دیگر</small>`:''}</div>
    <div class="remote-row-foot"><span>${qty((o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').length)} قلم</span><span>ثبت ${dt(o.createdAt)}</span><div class="toolbar"><button class="btn btn-ghost btn-sm" data-action="order-details" data-id="${o.id}">${icon('eye',14)} جزئیات</button>${o.status==='SCHEDULED_REMOTE'?`<button class="btn btn-ghost btn-sm" data-action="edit-remote" data-id="${o.id}">${icon('edit',14)} ویرایش</button><button class="btn btn-ghost btn-sm danger-text" data-action="cancel-remote" data-id="${o.id}">${icon('trash',14)} لغو</button>`:''}</div></div>
  </article>`).join('')||'<div class="empty">سفارش غیرحضوری فعالی ثبت نشده است.</div>';
}

// Improve remote live filtering while preserving the existing refresh loop.
function bindRemoteV21(){
  $('#content').onclick=async e=>{
    const sub=e.target.closest('[data-sub]'); if(sub){const [k,v]=sub.dataset.sub.split(':');await renderSales(v);return;}
    const ael=e.target.closest('[data-action]'); if(!ael)return; const a=ael.dataset.action;
    if(a==='remote-add-line'){app.remoteDraft.push(defaultOrderLine());renderOrderLineArea('remote','remoteDraft');return;}
    if(a==='op-remove-line' && ael.dataset.prefix==='remote'){const i=Number(ael.dataset.index);if(app.remoteDraft.length>1){app.remoteDraft.splice(i,1);renderOrderLineArea('remote','remoteDraft')}return;}
    if(a==='op-pick-product'&&ael.dataset.prefix==='remote'){pickOperationProduct(Number(ael.dataset.index),ael.dataset.productId,ael.dataset.label,ael.dataset.quick,'remote','remoteDraft');return;}
    if(a==='edit-remote')return editRemoteOrder(ael.dataset.id);
    if(a==='cancel-remote')return cancelRemoteOrder(ael.dataset.id);
    if(a==='order-details')return openOrderDetails(ael.dataset.id);
  };
  app.remoteDraft=[defaultOrderLine()]; renderOrderLineArea('remote','remoteDraft');
  bindJalaliDates($('#remoteOrderForm'));
  const form=$('#remoteOrderForm');
  if(form)form.addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));const items=app.remoteDraft.filter(x=>x.productId&&n(x.requestedQty)>0).map(x=>({productId:x.productId,requestedQty:n(x.requestedQty),requestedUnit:x.requestedUnit,description:String(x.description||'').trim()}));if(!items.length)return toast('حداقل یک محصول معتبر وارد کنید.');try{const d=await api('/api/orders/remote',{method:'POST',body:JSON.stringify({...f,items})});toast(d.order?.status==='WAREHOUSE_PENDING'?'سفارش امروز ثبت و در صف انبار قرار گرفت.':'سفارش غیرحضوری برای تاریخ آینده برنامه‌ریزی شد.');e.target.reset();e.target.elements.scheduledDate.value=today();e.target.elements.scheduledTime.value='08:00';app.remoteDraft=[defaultOrderLine()];renderOrderLineArea('remote','remoteDraft');await renderSales('remote')}catch(err){toast(err.message)}});
  const search=$('#remoteSearchV21');
  const date=$('#remoteDateV21');
  if(date)date.addEventListener('input',()=>{date.value=normalizeJalaliText(date.value)});
  const apply=async()=>{const q=(search?.value||'').trim().toLowerCase();const day=jalaliToIso(date?.value||'');const orders=(await api('/api/orders')).orders||[];const filtered=orders.filter(o=>o.orderType==='REMOTE'&&['SCHEDULED_REMOTE','WAREHOUSE_PENDING','RETURNED_TO_SALES'].includes(o.status)&&(!q||[o.customer?.name,o.customer?.phone].some(x=>String(x||'').toLowerCase().includes(q)))&&(!day||o.scheduledDate===day));const l=$('#remoteOrderList');if(l)l.innerHTML=remoteOrderRows(filtered)};
  search?.addEventListener('input',apply); date?.addEventListener('input',()=>{date.value=normalizeJalaliText(date.value)}); date?.addEventListener('blur',apply);
}

/* =========================================================
   v25 — SALES DESK REDESIGN
   Five workspaces: حضوری / غیرحضوری / در جریان / تسویه / روزهای آتی
   Persian dates + strict 24-hour time across the sales UI.
   ========================================================= */
function time24(v){
  if(!v) return '—';
  const m=String(v).match(/(?:T|\s)(\d{1,2}):(\d{2})/);
  if(m)return `${String(Number(m[1])).padStart(2,'0')}:${m[2]}`;
  const s=String(v).match(/^(\d{1,2}):(\d{2})$/);
  return s?`${String(Number(s[1])).padStart(2,'0')}:${s[2]}`:'—';
}
function now24(){const d=serverNow();return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function time24Input(name,value='08:00',required=true,label='ساعت ارسال'){
  const val=time24(value)==='—'?'08:00':time24(value);
  return `<div class="field time24-field"><label>${esc(label)}</label><div class="input-shell op-input time24-shell"><span>${icon('clock',17)}</span><input class="time24-input" name="${esc(name)}" value="${esc(val)}" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="08:30" pattern="(?:[01]\\d|2[0-3]):[0-5]\\d" ${required?'required':''} aria-label="ساعت به صورت 24 ساعته"></div><small class="field-hint">فرمت ۲۴ ساعته: 00:00 تا 23:59</small></div>`;
}
function normalizeTime24(v){
  const s=toAsciiDigits(String(v||'')).replace(/[^0-9:]/g,'').slice(0,5);
  let x=s;
  if(/^\d{3,4}$/.test(x))x=x.slice(0,-2)+':'+x.slice(-2);
  if(/^\d{1,2}:\d{0,2}$/.test(x)){
    const [h,m]=x.split(':'); x=`${h.padStart(2,'0')}:${(m||'').padEnd(2,'0')}`.slice(0,5);
  }
  return x;
}
function bindTime24(root=document){
  $$('.time24-input',root).forEach(input=>{
    const sync=()=>{
      const raw=normalizeTime24(input.value);
      input.value=raw;
      const ok=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw);
      input.classList.toggle('invalid',!!raw&&!ok);
      input.setCustomValidity(ok?'':'ساعت را به صورت 24 ساعته مانند 08:30 وارد کنید.');
    };
    input.addEventListener('input',sync); input.addEventListener('blur',sync); sync();
  });
}
function formatDateTime24(v){
  if(!v)return '—';
  const d=new Date(v);
  if(Number.isNaN(d.getTime())) return String(v);
  const p=faDateParts(d,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  if(!p.year) return String(v);
  return `${p.year}/${p.month}/${p.day} • ${p.hour}:${p.minute}`;
}
// Override global date-time rendering so every visible time is 24-hour.
function dt(v){return v?formatDateTime24(v):'—'}
function salesOrderDateTime(o){return o?.scheduledAt?`${dateLabel(o.scheduledDate)} • ${time24(o.scheduledAt)}`:'—'}
function salesKindLabel(o){return o?.orderType==='STORE'?'فروشگاه':'تلفنی'}
function salesKindBadge(o){return o?.orderType==='STORE'?'<span class="sales-type-badge store">فروشگاه</span>':'<span class="sales-type-badge phone">تلفنی</span>'}
function activeItemsOf(o){return (o?.items||[]).filter(i=>i.itemStatus!=='CANCELLED')}
function salesFlowOrders(orders){return orders.filter(o=>o.orderType!=='STORE'&&['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','RETURNED_TO_SALES'].includes(o.status)).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))} // v37.6.0 — متفرقات فروشگاه در تب مستقل
function salesFutureOrders(orders){
  const todayIso=today();
  return orders.filter(o=>o.orderType==='REMOTE'&&o.status==='SCHEDULED_REMOTE'&&String(o.scheduledDate||'')>=todayIso).sort((a,b)=>String(a.scheduledAt||'').localeCompare(String(b.scheduledAt||'')));
}
// این مجموعه برای صف و سوابق تسویه مصرف می‌شود؛ رندر هر بخش سفارش پخش باز را جداگانه پالایش می‌کند.
function salesAllInSettlement(orders){return orders.filter(o=>o.orderType!=='STORE'&&((['SETTLEMENT_PENDING','SETTLED','EXITED'].includes(o.status)&&!['DELIVERED','SALES_FINALIZED','CLOSED'].includes(o.dispatch?.status))||((o.payments||[]).length>0&&!['SETTLEMENT_PENDING','SETTLED','EXITED'].includes(o.status)))).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))} // v37.6.0 // v37.5.0 — فاکتورهای هر سرویس سفارش فروشگاه بسته‌شده هم دیده می‌شوند


function salesEmptyV25(name,title,subtitle){return `<div class="sales-empty-v25"><div>${icon(name,28)}</div><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></div>`}
function salesSectionTitle(kicker,title,subtitle,count=''){
  return `<div class="sales-section-title-v25"><div><span class="eyebrow">${esc(kicker)}</span><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>${count!==''?`<div class="sales-section-count"><strong>${qty(count)}</strong><span>مورد</span></div>`:''}</div>`;
}




function nextDayIso(){const d=serverNow();d.setDate(d.getDate()+1);return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`}
function futureOrderRowsV25(orders){
  const rows=(orders||[]).map(o=>{
    const typeBadge=o.orderType==='STORE'?salesKindBadge(o):'<span class="sales-type-badge phone">تلفنی</span>';
    const actions=`<button class="btn btn-secondary btn-sm" data-action="order-details" data-id="${o.id}">${icon('eye',14)} جزئیات</button>`+
      (o.orderType==='REMOTE'?`<button class="btn btn-ghost btn-sm" data-action="future-edit" data-id="${o.id}">${icon('edit',14)} ویرایش زمان</button><button class="btn btn-ghost btn-sm danger-text" data-action="future-cancel" data-id="${o.id}">${icon('trash',14)} لغو</button>`:'');
    return `<article class="fx41-row">
      <div class="fx41-row-top">
        <div class="fx41-row-date"><small>ورود به انبار</small><strong>${esc(dateLabel(o.scheduledDate))}</strong><b>${esc(fa(time24(o.scheduledAt)))}</b></div>
        <div class="fx41-row-info"><div class="fx41-row-badges"><span class="order-code">${esc(fa(o.orderNo||'—'))}</span>${typeBadge}</div><h3>${esc(storeAwareOrderName(o))}</h3><p>${esc(storeAwareOrderPhone(o))}</p></div>
        <div class="fx41-row-status">${badge(o.status)}</div>
      </div>
      <div class="fx41-row-meta"><span><b>تاریخ تحویل</b>${o.deliveryDate?esc(dateLabel(o.deliveryDate)):'ثبت نشده'}</span><span><b>مقصد</b>${esc(o.dispatchPlace||'ثبت نشده')}</span><span><b>اقلام</b>${qty(activeItemsOf(o).length)} قلم</span><span><b>ثبت</b>${formatDateTime24(o.createdAt)}</div>
      <div class="fx41-row-actions">${actions}</div>
    </article>`;
  }).join('');
  return rows||salesEmptyV25('calendar','سفارشی برای روزهای آینده برنامه‌ریزی نشده است','سفارش‌های آینده پس از ثبت در این تقویم قرار می‌گیرند.');
}

// A selected record stays linked while its name or phone is edited.
function salesCustomerPickerHtml(prefix){
 const id=prefix+'CustomerSearch';
 return `<div class="sales-customer-picker"><label for="${id}">جستجوی مشتری ثبت‌شده</label><div class="sales-customer-search-row"><div class="sales-customer-search-field"><input id="${id}" type="search" autocomplete="off" maxlength="80" placeholder="نام، شماره تماس یا کد مشتری" aria-controls="${id}Results" aria-expanded="false"><div id="${id}Results" class="sales-customer-results" aria-live="polite"></div></div><button type="button" class="btn btn-secondary btn-sm" data-sales-customer-clear hidden>انتخاب مشتری دیگر</button></div><input type="hidden" name="customerId"><small data-sales-customer-selection>برای مشتری جدید، نام و شماره تماس را وارد کنید.</small></div>`;
}
function syncSalesDispatchPlace(form){
 const mode=form.querySelector('[data-delivery-mode]'),field=form.querySelector('[data-sales-dispatch-place]');if(!field)return;
 const show=!mode||mode.value==='DELIVERY';field.hidden=!show;
 const input=field.querySelector('[name=dispatchPlace]');if(input){input.disabled=!show;input.required=show&&form.id==='futureOrderFormV25';}
}
function bindSalesCustomerPicker(form){
 if(!form||form.dataset.customerPickerBound)return;form.dataset.customerPickerBound='1';
 const input=form.querySelector('.sales-customer-picker input[type=search]'),host=form.querySelector('.sales-customer-results'),id=form.querySelector('[name=customerId]'),notice=form.querySelector('[data-sales-customer-selection]'),clear=form.querySelector('[data-sales-customer-clear]');
 if(!input||!host||!id)return;let seq=0,timer=null,rows=[];
 function clearResults(){host.replaceChildren();input.setAttribute('aria-expanded','false');}
 function clearSelection(){id.value='';clear.hidden=true;notice.textContent='برای مشتری جدید، نام و شماره تماس را وارد کنید.';}
 input.addEventListener('input',()=>{if(id.value){form.querySelector('[name=name]').value='';form.querySelector('[name=phone]').value='';}clearSelection();clearTimeout(timer);const q=input.value.trim(),request=++seq;clearResults();if(!q)return;timer=setTimeout(async()=>{try{const d=await api('/api/customers/search?q='+encodeURIComponent(q));if(request!==seq||!input.isConnected)return;rows=d.customers||[];host.innerHTML=rows.length?rows.map((c,i)=>`<button type="button" data-sales-customer-index="${i}"><b>${esc(c.name||'—')}</b><span>${esc(fa(c.phone||'—'))} · کد ${esc(fa(c.code||'—'))}</span></button>`).join(''):'<p>مشتری یافت نشد؛ می‌توانید مشتری جدید ثبت کنید.</p>';input.setAttribute('aria-expanded',String(rows.length>0));}catch(e){if(request===seq)host.textContent='جستجوی مشتری ناموفق بود؛ دوباره تلاش کنید.';}},200);});
 host.addEventListener('click',e=>{const button=e.target.closest('[data-sales-customer-index]');if(!button)return;const c=rows[Number(button.dataset.salesCustomerIndex)];if(!c)return;++seq;id.value=c.id;form.querySelector('[name=name]').value=c.name||'';form.querySelector('[name=phone]').value=c.phone||'';input.value=c.name||'';notice.textContent='مشتری انتخاب شد: '+(c.name||'')+' · کد '+(c.code||'—')+'؛ تغییر نام یا تماس، پرونده همین مشتری را به‌روزرسانی می‌کند.';clear.hidden=false;clearResults();});
 clear.addEventListener('click',()=>{++seq;clearTimeout(timer);clearSelection();clearResults();input.value='';form.querySelector('[name=name]').value='';form.querySelector('[name=phone]').value='';input.focus();});
 input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){const first=host.querySelector('button');if(first){e.preventDefault();first.focus();}}else if(e.key==='Enter'){e.preventDefault();host.querySelector('button')?.click();}else if(e.key==='Escape'){++seq;clearResults();}});
 form.addEventListener('reset',()=>{++seq;clearTimeout(timer);setTimeout(()=>{clearSelection();clearResults();syncSalesDispatchPlace(form);},0);});
 const mode=form.querySelector('[data-delivery-mode]');mode?.addEventListener('change',()=>syncSalesDispatchPlace(form));syncSalesDispatchPlace(form);
}

// بیعانه صرفاً هنگام ثبت سفارش دریافت می‌شود؛ اطلاعات آن پس از ثبت قابل حذف پنهانی نیست.
// A delivery choice is mandatory in the default workflow. The explicitly
// disabled compatibility mode keeps the old forms available for emergencies.
function deliveryModeInputHtml(prefix){
 const id="delivery-mode-"+String(prefix||"order");
 return `<div class="field transport-delivery-choice"><label for="${esc(id)}">روش تحویل سفارش</label><div class="input-shell"><select id="${esc(id)}" name="deliveryMode" data-delivery-mode required><option value="">روش تحویل را انتخاب کنید</option><option value="DELIVERY">ارسال توسط پخش</option><option value="PICKUP">تحویل در انبار</option></select></div><small>سفارش بیعانه‌دار فقط تحویل در انبار است.</small></div>`;
}
function readDeliveryMode(root,deposit){
 if(!app.features?.experimentalTransport)return {};
 const mode=root?.querySelector('[data-delivery-mode]')?.value||'';
 if(!['DELIVERY','PICKUP'].includes(mode))throw Error('روش تحویل سفارش را انتخاب کنید.');
 if(mode==='DELIVERY'&&deposit)throw Error('سفارش دارای بیعانه قابل ارسال توسط پخش نیست؛ تحویل در انبار را انتخاب کنید.');
 return {transportWorkflow:true,deliveryMode:mode};
}
function depositEntryHtml(){
 return `<section class="deposit-entry"><button type="button" class="btn btn-secondary deposit-toggle" data-deposit-toggle aria-pressed="false">＋ ثبت بیعانه</button><span class="deposit-hint">در صورت دریافت بیعانه فعال کنید؛ سفارش بیعانه‌دار به پخش ارسال نمی‌شود.</span>
 <div class="deposit-fields" data-deposit-fields hidden><label>مبلغ بیعانه (ریال)<input class="adm-input" data-deposit-amount inputmode="numeric" autocomplete="off" placeholder="مبلغ دریافتی"></label><label>نوع پرداخت<select class="adm-select" data-deposit-type><option value="CASH">نقدی</option><option value="POS">پوز</option><option value="CARD_TRANSFER">کارت‌به‌کارت</option></select></label><label data-deposit-pos hidden>دستگاه فعال<select class="adm-select" data-deposit-device><option value="">انتخاب دستگاه</option></select></label><label data-deposit-bank-wrap hidden>بانک / حساب مقصد<input class="adm-input" data-deposit-bank maxlength="100"></label><label data-deposit-reference-wrap hidden>شماره پیگیری<input class="adm-input" data-deposit-reference maxlength="100" placeholder="شناسه تراکنش"></label></div></section>`;
}
function readOrderDeposit(form){
 const box=form.querySelector('[data-deposit-fields]');if(!box||box.hidden)return null;
 const amount=stlPayParse(box.querySelector('[data-deposit-amount]').value),type=box.querySelector('[data-deposit-type]').value;
 if(!Number.isSafeInteger(amount)||amount<=0||amount>1e12)throw Error('مبلغ بیعانه معتبر را به ریال وارد کنید.');
 const deposit={amount,type,deviceId:box.querySelector('[data-deposit-device]').value,bank:box.querySelector('[data-deposit-bank]').value.trim(),reference:box.querySelector('[data-deposit-reference]').value.trim()};
 if(type==='POS'&&!deposit.deviceId)throw Error('دستگاه پوز فعال را انتخاب کنید.');
 if(type==='CARD_TRANSFER'&&(!deposit.bank||!deposit.reference))throw Error('بانک مقصد و شماره پیگیری کارت‌به‌کارت را وارد کنید.');
 return deposit;
}
function depositSummaryHtml(d){
 if(!d)return '';const labels={CASH:'نقدی',POS:'پوز',CARD_TRANSFER:'کارت‌به‌کارت'};
 const info=[labels[d.type]||d.type,d.deviceSnapshot?`${d.deviceSnapshot.title} / ${d.deviceSnapshot.bank}`:'',d.bank||'',d.reference?`پیگیری ${d.reference}`:''].filter(Boolean).map(esc).join(' • ');
 return `<div class="deposit-summary"><b>بیعانه: ${money(d.amount)}</b><span>${info}</span>${d.refundedAmount?`<span>استرداد دستی ثبت‌شده: ${money(d.refundedAmount)}</span>`:''}${d.status==='REFUND_REQUIRED'?`<strong>استرداد دستی در انتظار پیگیری: ${money(Number(d.amount)-Number(d.refundedAmount||0))}</strong>`:d.status==='REFUNDED'?'<strong>استرداد دستی ثبت شد</strong>':''}</div>`;
}
document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-deposit-toggle]');if(!button)return;
 const entry=button.closest('.deposit-entry'),fields=entry.querySelector('[data-deposit-fields]');fields.hidden=!fields.hidden;
 button.setAttribute('aria-pressed',String(!fields.hidden));button.textContent=fields.hidden?'＋ ثبت بیعانه':'✓ بیعانه فعال است';
});
document.addEventListener('change',async e=>{
 if(!e.target.matches('[data-deposit-type]'))return;
 const box=e.target.closest('[data-deposit-fields]'),type=e.target.value;
 box.querySelector('[data-deposit-pos]').hidden=type!=='POS';box.querySelector('[data-deposit-bank-wrap]').hidden=type!=='CARD_TRANSFER';box.querySelector('[data-deposit-reference-wrap]').hidden=!['POS','CARD_TRANSFER'].includes(type);
 if(type==='POS'){
   const select=box.querySelector('[data-deposit-device]');const previous=select.value;select.disabled=true;
   try{const {devices=[]}=await api('/api/payment-devices');select.innerHTML='<option value="">انتخاب دستگاه</option>'+devices.map(d=>`<option value="${esc(d.id)}">${esc(d.title)} • ${esc(d.bank)} • پایانه ${esc(d.terminalNumber)}</option>`).join('');select.value=previous;}
   catch(err){toast('دریافت دستگاه‌های پوز انجام نشد؛ دوباره نوع پرداخت را انتخاب کنید.');}finally{select.disabled=false;}
 }
});
document.addEventListener('input',e=>{if(e.target.matches('[data-deposit-amount]'))stlFormatPriceInput(e.target);});
document.addEventListener('reset',e=>{if(e.target.querySelector?.('[data-deposit-fields]'))setTimeout(()=>{const entry=e.target.querySelector('.deposit-entry');if(!entry)return;entry.querySelector('[data-deposit-fields]').hidden=true;const b=entry.querySelector('[data-deposit-toggle]');b.setAttribute('aria-pressed','false');b.textContent='＋ ثبت بیعانه';entry.querySelector('[data-deposit-pos]').hidden=true;entry.querySelector('[data-deposit-bank-wrap]').hidden=true;entry.querySelector('[data-deposit-reference-wrap]').hidden=true;},0);});
function refundRowsHtml(rows){return (rows||[]).map(o=>`<article class="deposit-refund-row"><div><b>${esc(storeAwareOrderName(o))} • سفارش ${esc(fa(o.orderNo||'—'))}</b>${depositSummaryHtml(o.deposit)}</div><button type="button" class="btn btn-secondary btn-sm" data-action="deposit-refunded" data-id="${esc(o.id)}">ثبت استرداد دستی</button></article>`).join('')||'<p class="subtle">استرداد در انتظاری وجود ندارد.</p>';}
async function refreshDepositRefunds(){const host=document.getElementById('depositRefundList');if(!host)return;try{const d=await api('/api/deposit-refunds');if(host.isConnected)host.innerHTML=refundRowsHtml(d.orders);}catch(e){host.textContent='دریافت فهرست استرداد ناموفق بود؛ صفحه را تازه‌سازی کنید.';}}
async function markDepositRefunded(id){const reference=prompt('پس از استرداد واقعی وجه، شماره پیگیری یا توضیح استرداد دستی را وارد کنید:');if(reference===null)return;if(!reference.trim())return toast('شماره پیگیری یا توضیح استرداد الزامی است.');try{await api('/api/orders/'+encodeURIComponent(id)+'/deposit-refund',{method:'POST',body:JSON.stringify({reference})});toast('استرداد دستی ثبت شد.');await refreshDepositRefunds();}catch(e){toast(e.message);}}

async function submitPhoneOrderV25(form){
  const rows=app.phoneDraft||[];
  const incomplete=rows.findIndex(x=>(x.productId || String(x.productLabel||'').trim() || String(x.requestedQty??'').trim() || String(x.description||'').trim()) && (!x.productId || !(n(x.requestedQty)>0)));
  if(incomplete>=0){
    const field=rows[incomplete].productId?'op-qty':'op-product-search';
    form.querySelector(`[data-${field}="phone-${incomplete}"]`)?.focus();
    return toast('محصول و مقدار معتبر ردیف '+fa(String(incomplete+1))+' را تکمیل کنید یا آن را حذف کنید.');
  }
  const items=rows.filter(x=>x.productId&&n(x.requestedQty)>0).map(x=>({productId:x.productId,requestedQty:n(x.requestedQty),requestedUnit:x.requestedUnit,description:String(x.description||'').trim()}));
  if(!items.length)return toast('حداقل یک محصول معتبر برای سفارش تلفنی وارد کنید.');
  const f=Object.fromEntries(new FormData(form));
  try{
    const deposit=readOrderDeposit(form);
    const d=await api('/api/orders/remote',{method:'POST',body:JSON.stringify({name:f.name,phone:f.phone,customerId:f.customerId||undefined,notes:f.notes||'',dispatchPlace:f.dispatchPlace||'',scheduledDate:today(),scheduledTime:'00:00',...(app.features?.pickupStaging?{deliveryDate:f.deliveryDate}:{}),deposit,items,...(app.features?.experimentalTransport?readDeliveryMode(form,deposit):{})})});
    toast(d.order?.status==='WAREHOUSE_PENDING'?(d.order.deliveryMode==='DELIVERY'?'سفارش تلفنی به انبار و ترابری ارسال شد.':'سفارش تلفنی به انبار ارسال شد.'):'سفارش تلفنی ثبت شد.');
    form.reset(); app.phoneDraft=[defaultOrderLine()]; renderOrderLineArea('phone','phoneDraft'); await renderSales('remote');
  }catch(e){toast(e.message)}
}
async function submitFutureOrderV25(form){
  const f=Object.fromEntries(new FormData(form));
  const iso=f.scheduledDate||'';
  if(!iso || iso<today())return toast('تاریخ ارسال نمی‌تواند قبل از امروز باشد.');
  const tm=normalizeTime24(f.scheduledTime||'');
  if(!f.deliveryDate)return toast('تاریخ تحویل شمسی معتبر را انتخاب کنید.');
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(tm))return toast('ساعت ارسال باید با فرمت 24 ساعته مانند 08:30 باشد.');
  if((!app.features?.experimentalTransport||f.deliveryMode==='DELIVERY')&&!String(f.dispatchPlace||'').trim())return toast('محل ارسال را وارد کنید.');
  const items=(app.futureDraft||[]).filter(x=>x.productId&&n(x.requestedQty)>0).map(x=>({productId:x.productId,requestedQty:n(x.requestedQty),requestedUnit:x.requestedUnit,description:String(x.description||'').trim()}));
  if(!items.length)return toast('حداقل یک محصول معتبر برای سفارش آینده وارد کنید.');
  try{
    const deposit=readOrderDeposit(form);
    const d=await api('/api/orders/remote',{method:'POST',body:JSON.stringify({...f,scheduledTime:tm,scheduledAt:`${iso}T${tm}`,deposit,items,...(app.features?.experimentalTransport?readDeliveryMode(form,deposit):{})})});
    toast(d.order?.status==='SCHEDULED_REMOTE'?'سفارش برای تاریخ و ساعت انتخاب‌شده برنامه‌ریزی شد.':'سفارش در صف انبار قرار گرفت.');
    form.reset(); const dateInp=form.querySelector('.jalali-date-input[data-target=scheduledDate]'); if(dateInp){dateInp.value=isoToJalali(iso); dateInp.dispatchEvent(new Event('input',{bubbles:true}));}
    const t=form.querySelector('.time24-input'); if(t)t.value='08:00'; app.futureDraft=[defaultOrderLine()]; renderOrderLineArea('future','futureDraft'); await renderSales('future');
  }catch(e){toast(e.message)}
}
async function openStoreApprovalV25(id){
  try{
    const d=await api('/api/orders/'+id); const o=d.order;
    if(!o||o.orderType!=='STORE'||o.status!=='STORE_PENDING_SALES')return toast('این سفارش دیگر در صف تأیید فروش نیست.');
    openModal('بررسی سفارش فروشگاه و تعیین زمان ارسال',`<form id="storeApprovalFormV25" class="schedule-approval-form"><div class="schedule-approval-hero"><div><span class="eyebrow">STORE APPROVAL</span><h2>${esc(o.storeName||'فروشگاه')}</h2><p>${esc(storeAwareOrderName(o))} • ${esc(storeAwareOrderPhone(o))} • ${esc(fa(o.orderNo||'—'))}</p></div><span class="badge orange">نیازمند تأیید</span></div><div class="schedule-approval-notice">فروشگاه فقط سفارش را ثبت می‌کند. <strong>تاریخ، ساعت ۲۴ ساعته و محل ارسال در این فرم توسط واحد فروش تعیین می‌شود.</strong></div><div class="store-approval-fields-v25">${jalaliInput('تاریخ ارسال','scheduledDate',o.scheduledDate||today(),true)}${time24Input('scheduledTime',time24(o.scheduledAt)||'08:00',true)}<div class="field"><label>محل ارسال</label><div class="input-shell op-input"><span>${icon('truck',17)}</span><input name="dispatchPlace" required value="${esc(o.dispatchPlace||o.storeName||'')}" placeholder="محل ارسال"></div></div></div><div class="store-approval-summary-v25"><span>اقلام <b>${qty(activeItemsOf(o).length)}</b></span><span>ثبت <b>${formatDateTime24(o.createdAt)}</b></span></div><div class="modal-actions"><button class="btn btn-secondary" type="button" data-action="close-modal">انصراف</button><button class="btn btn-primary btn-lg" type="submit">${icon('check',17)} تأیید و ثبت زمان ارسال</button></div></form>`);
    bindJalaliDates($('#storeApprovalFormV25')); bindTime24($('#storeApprovalFormV25'));
    $('#storeApprovalFormV25')?.addEventListener('submit',async e=>{
      e.preventDefault(); if(!e.target.reportValidity())return;
      const f=Object.fromEntries(new FormData(e.target)); const tm=normalizeTime24(f.scheduledTime); if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(tm))return toast('ساعت نامعتبر است.');
      if(!f.scheduledDate)return toast('تاریخ شمسی معتبر وارد کنید.');
      try{const r=await api('/api/store/orders/'+id+'/approve',{method:'POST',body:JSON.stringify({scheduledAt:`${f.scheduledDate}T${tm}`,dispatchPlace:f.dispatchPlace,...(app.features?.experimentalTransport?{transportWorkflow:true}:{})})});closeModal();toast(r.order?.status==='WAREHOUSE_PENDING'?(r.order.transportWorkflow===1?'سفارش تأیید و به انبار و ترابری ارسال شد.':'سفارش تأیید و به صف انبار ارسال شد.'):'سفارش تأیید و برای زمان تعیین‌شده برنامه‌ریزی شد.');await fetchSalesCache(true);await renderSales('stores');await refreshIndicators();}catch(err){toast(err.message)}
    });
  }catch(e){toast(e.message)}
}
async function editFutureV25(id){
 try{
  const o=(await api('/api/orders/'+encodeURIComponent(id))).order;
  if(!canSalesEditRemote(o))return toast('ویرایش مستقیم فقط پیش از تأیید انبار مجاز است.');
  const products=(await api('/api/products')).products.filter(p=>p.isActive!==false);
  const showMode=app.features?.experimentalTransport&&o.transportWorkflow===1&&['PICKUP','DELIVERY'].includes(o.deliveryMode);
  const modeLocked=!!(o.dispatch||o.visitId||o.pickupRecipient||o.pickupCancellation||o.transportInvoice||o.transportDeparture||Object.keys(o.transportAssignments||{}).length||Object.keys(o.transportHandovers||{}).length);
  const modeField=showMode?`<label>روش تحویل سفارش<select name="deliveryMode" data-re-delivery-mode ${modeLocked?'disabled':''}><option value="DELIVERY" ${o.deliveryMode==='DELIVERY'?'selected':''} ${o.deposit?'disabled':''}>ارسال توسط پخش</option><option value="PICKUP" ${o.deliveryMode==='PICKUP'?'selected':''} ${!app.features?.pickupStaging&&o.deliveryMode!=='PICKUP'?'disabled':''}>تحویل در انبار</option></select><small>${modeLocked?'تغییر روش پس از تخصیص پخش یا ثبت مراجعه مجاز نیست.':o.deposit?'سفارش بیعانه‌دار فقط تحویل در انبار است.':'تغییر روش پیش از تأیید انبار و تخصیص پخش امکان‌پذیر است.'}</small></label>`:'';
  const line=x=>`<tr data-remote-edit-line><td><select data-re-product required aria-label="محصول">${products.map(p=>`<option value="${esc(p.id)}" ${p.id===x.productId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></td><td><input data-re-qty aria-label="مقدار" required inputmode="decimal" value="${esc(x.requestedQty??'')}"></td><td><select data-re-unit aria-label="واحد">${['کیلوگرم','بسته','عدد','کارتن'].map(u=>`<option ${u===x.requestedUnit?'selected':''}>${u}</option>`).join('')}</select></td><td><input data-re-desc aria-label="توضیح" maxlength="300" value="${esc(x.description||'')}"></td><td><button type="button" data-re-remove class="btn btn-secondary">حذف</button></td></tr>`;
  openModal('ویرایش سفارش پیش از تأیید انبار',`<form id="remoteFullEdit"><p>${esc(storeAwareOrderName(o))} — ${esc(fa(o.orderNo))}</p><div class="form-grid">${o.status==='SCHEDULED_REMOTE'?jalaliDateTimeInput('ورود به انبار','scheduledDate','scheduledTime',o.scheduledDate,time24(o.scheduledAt)||'08:00',true):''}${modeField}${jalaliInput('تاریخ تحویل','deliveryDate',o.deliveryDate||'',o.deliveryMode==='PICKUP')}<label>محل ارسال<input name="dispatchPlace" value="${esc(o.dispatchPlace||'')}" ${o.deliveryMode==='PICKUP'?'readonly':''}></label><label>یادداشت<input name="notes" maxlength="1000" value="${esc(o.notes||'')}"></label></div><div class="table-wrap"><table class="table remote-edit-table"><thead><tr><th>محصول</th><th>مقدار</th><th>واحد</th><th>توضیح</th><th>عملیات</th></tr></thead><tbody>${(o.items||[]).filter(x=>x.itemStatus!=='CANCELLED').map(line).join('')}</tbody></table></div><button type="button" class="btn btn-secondary" data-re-add>افزودن قلم</button><p data-re-error role="alert"></p><div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">انصراف</button><button type="submit" class="btn btn-primary">ذخیره سفارش</button></div></form>`);
  const form=$('#remoteFullEdit');bindJalaliDates(form);bindTime24(form);
  const modeInput=form.querySelector('[data-re-delivery-mode]'),place=form.elements.dispatchPlace,dateInput=form.querySelector('.jalali-date-input[data-target="deliveryDate"]');
  let placeDraft=place.value, lastMode=o.deliveryMode;
  function syncRemoteDelivery(){
   const mode=modeInput?.value||o.deliveryMode, pickup=mode==='PICKUP';
   if(pickup && lastMode!=='PICKUP'){placeDraft=place.value;place.value='';}
   else if(!pickup && lastMode==='PICKUP') place.value=placeDraft;
   place.readOnly=pickup;place.required=mode==='DELIVERY'&&mode!==o.deliveryMode;
   if(dateInput)dateInput.required=pickup;
   lastMode=mode;
  }
  modeInput?.addEventListener('change',syncRemoteDelivery);syncRemoteDelivery();
  form.querySelector('[data-re-add]').onclick=()=>form.querySelector('tbody').insertAdjacentHTML('beforeend',line({requestedUnit:'کیلوگرم'}));
  form.addEventListener('click',e=>{if(e.target.closest('[data-re-remove]'))e.target.closest('tr').remove();});
  form.onsubmit=async e=>{e.preventDefault();const error=form.querySelector('[data-re-error]'),button=form.querySelector('[type=submit]');error.textContent='';try{
   const body=Object.fromEntries(new FormData(form));
   if(modeInput)body.expectedDeliveryMode=o.deliveryMode;
   body.items=[...form.querySelectorAll('[data-remote-edit-line]')].map(r=>({productId:r.querySelector('[data-re-product]').value,requestedQty:toAsciiDigits(r.querySelector('[data-re-qty]').value).replace('٫','.'),requestedUnit:r.querySelector('[data-re-unit]').value,description:r.querySelector('[data-re-desc]').value}));
   if(!body.items.length)throw Error('حداقل یک قلم لازم است.');
   if(body.scheduledTime){body.scheduledTime=normalizeTime24(body.scheduledTime);body.scheduledAt=body.scheduledDate+'T'+body.scheduledTime;}
   button.disabled=true;await api('/api/orders/'+encodeURIComponent(id)+'/remote',{method:'PUT',body:JSON.stringify(body)});closeModal();await fetchSalesCache(true);await renderSales(app.sub.sales);await refreshIndicators();toast('سفارش بدون ارجاع به انبار ویرایش شد.');
  }catch(err){error.textContent=err.message;button.disabled=false;}};
 }catch(e){toast(e.message);}
}
async function cancelFutureV25(id){const order=(app.salesCache?.orders||[]).find(o=>o.id===id);if(!confirm(order?.deposit?'سفارش لغو شود؟ بیعانه به‌صورت خودکار بازگردانده نمی‌شود و باید دستی استرداد و ثبت شود.':'این سفارش آینده لغو شود؟'))return;try{const result=await api('/api/orders/'+id+'/cancel-remote',{method:'POST',body:JSON.stringify({reason:'لغو توسط فروش'})});toast(result.order?.deposit?'سفارش لغو شد؛ استرداد دستی بیعانه را پیگیری کنید.':'سفارش آینده لغو شد.');await renderSales('future');await refreshDepositRefunds();}catch(e){toast(e.message)}}



// Clean, stable refresh strategy: rebuild the active sales pane only when it is not being edited.

// Keep settlement inside the five-tab sales desk while retaining the existing signature/fingerprint engine.
// v37.0.5: the old settlement wrapper (which called itself and caused "Maximum call stack") was removed; see the v37.0.4 settlement block below.

// Return to the five-part sales desk after final settlement, not the removed invoice tab.
async function finalSettle(id){
  try{
    const d=await api('/api/orders/'+id+'/settle',{method:'POST',body:JSON.stringify({items:(app.settleDraft||[]).map(i=>({itemId:i.id,unitPrice:n(i.unitPrice),cancelled:!!i.cancelled}))})});
    toast(`تسویه نهایی شد؛ فاکتور ${d.order?.payment?.invoiceNumber||''} صادر شد.`);app.selectedSettlement=null;app.settlementFingerprintRef='';await renderSales('settlement');
  }catch(e){toast(e.message)}
}

/* v25 final workflow guards */
const _legacySubmitOrderV25=submitOrder;
async function submitOrder(visitId){
  if(app.onsiteSubmitting)return;
  const items=(app.orderDraft||[]).filter(x=>x.productId&&n(x.requestedQty)>0).map(x=>({productId:x.productId,requestedQty:n(x.requestedQty),requestedUnit:x.requestedUnit,description:String(x.description||'').trim()}));
  if(!items.length)return toast('حداقل یک محصول با مقدار معتبر وارد کنید.');
  const buttons=$$('#content [data-action="submit-order"]').filter(b=>b.dataset.id===visitId);
  app.onsiteSubmitting=true;buttons.forEach(b=>b.disabled=true);
  try{
    await api('/api/orders',{method:'POST',body:JSON.stringify({visitId,items,...(app.features?.experimentalTransport?readDeliveryMode(document.querySelector('#content'),null):{})})});
    toast('سفارش ثبت و برای انبار ارسال شد.');
    app.orderDraft=[];
    // Clear the editor immediately and remove the submitted visitor from the cached queue.
    if(app.salesCache){app.salesCache.visits=(app.salesCache.visits||[]).filter(v=>v.id!==visitId);app.salesCache.fetchedAt=0;}
    if(app.page==='sales')renderSales('onsite');
    // Wait out any earlier read, then fetch a post-submission snapshot (no stale queue).
    const pending=app.salesFetchPromise;
    void Promise.resolve(pending).catch(()=>{}).then(()=>fetchSalesCache(true)).then(data=>{
      if(app.page==='sales'&&app.sub.sales==='onsite')paintSalesPaneV29('onsite',data);
    }).catch(()=>{});
  }catch(e){toast(e.message)}
  finally{app.onsiteSubmitting=false;buttons.forEach(b=>b.disabled=false);}
}
const _legacyResubmitOrderV25=resubmitOrder;
async function resubmitOrder(id){try{const result=await api('/api/orders/'+id+'/resubmit-sales',{method:'POST',body:'{}'});toast('سفارش دوباره به صف انبار ارسال شد.');closeModal();if(app.salesCache)app.salesCache.fetchedAt=0;const isStore=result.order?.orderType==='STORE';if(isStore)app.salesStoreTab='processing';await renderSales(isStore?'stores':'flow')}catch(e){toast(e.message)}}
const _legacySaveReturnedOrderV25=saveReturnedOrder;
async function saveReturnedOrder(id){
  const items=(app.returnEdit?.items||[]).filter(i=>i.itemStatus!=='CANCELLED');
  if(!items.length)return toast('حداقل یک قلم معتبر لازم است.');
  if(items.some(item=>!item.productId||n(item.requestedQty)<=0))return toast('برای همه ردیف‌ها محصول و مقدار معتبر وارد کنید.');
  try{
    const payload={items:items.map(item=>({id:item.id||null,productId:item.productId,requestedQty:n(item.requestedQty),requestedUnit:item.requestedUnit,description:String(item.description||'').trim()}))};
    await api('/api/orders/'+id+'/returned-edit',{method:'PUT',body:JSON.stringify(payload)});
    toast('اصلاحات سفارش ثبت شد و در سوابق فعالیت ذخیره گردید.');
    const isStore=app.returnEdit?.orderType==='STORE'; closeModal(); app.returnEdit=null; if(app.salesCache)app.salesCache.fetchedAt=0; if(isStore)app.salesStoreTab='processing'; await renderSales(isStore?'stores':'flow');
  }catch(e){toast(e.message)}
}

/* ---------- v37.20.0 — ویرایش سفارش ورودی فروشگاه در کارتابل فروش ---------- */
async function openSalesStoreOrderEdit(id){
  try{
    const d=await api('/api/orders/'+id); const o=d.order;
    if(!o||o.orderType!=='STORE') return toast('این سفارش از نوع فروشگاهی نیست.');
    if(o.status!=='STORE_PENDING_SALES') return toast('ویرایش سفارش فروشگاه فقط پیش از تأیید فروش امکان‌پذیر است.');
    app.salesStoreEdit={orderId:id,items:(o.items||[]).filter(i=>i.itemStatus!=='CANCELLED').map(i=>({id:i.id,productId:i.productId,productLabel:i.product?.name||'',requestedQty:i.requestedQty,requestedUnit:i.requestedUnit,description:i.description||''}))};
    renderSalesStoreEditor(o);
  }catch(e){toast(e.message)}
}
function renderSalesStoreEditor(o){
  const items=app.salesStoreEdit?.items||[];
  openModal('ویرایش سفارش ورودی فروشگاه',`<div class="returned-editor"><div class="returned-editor-head"><div><span class="eyebrow">STORE ORDER EDIT</span><h2>ویرایش سفارش ${esc(fa(o.orderNo||'—'))}</h2><p>${esc(o.storeName||'فروشگاه')}</p></div><span class="badge orange">در انتظار تأیید فروش</span></div><div class="returned-editor-note">پیش از تأیید فروش می‌توانید محصول، مقدار، واحد و توضیحات هر ردیف را تغییر دهید، ردیف جدید اضافه کنید یا ردیف موجود را حذف کنید. همه تغییرات با نام کاربر در سوابق فعالیت ثبت می‌شود.</div><div id="salesStoreEditLines" class="returned-edit-lines"></div><div class="returned-editor-bottom"><button class="btn btn-secondary btn-lg" data-action="sales-store-add-line">${icon('plus',17)} افزودن ردیف</button><span class="subtle">تعداد ردیف فعال: ${qty(items.length)}</span></div><div class="field section-space"><label>یادداشت سفارش</label><div class="input-shell op-input op-textarea"><textarea id="salesStoreEditNotes" rows="2" maxlength="1000" placeholder="یادداشت سفارش">${esc(o.notes||'')}</textarea></div></div><div class="modal-actions"><button class="btn btn-secondary" data-action="close-modal">انصراف</button><button class="btn btn-primary btn-lg" data-action="save-sales-store-order" data-id="${esc(o.id)}">ذخیره تغییرات</button></div></div>`);
  const modalCard=$('.modal-card'); if(modalCard) modalCard.classList.add('returned-modal-card');
  renderSalesStoreEditLines();
}
function renderSalesStoreEditLines(){
  const box=$('#salesStoreEditLines'); if(!box)return;
  const items=app.salesStoreEdit?.items||[];
  box.innerHTML=items.map((x,i)=>`<div class="returned-edit-row bt-product-row-v35 bt-returned-order-row-v35" data-edit-row="${i}"><div class="returned-edit-index">${fa(String(i+1))}</div><div class="order-field"><label>محصول</label><div class="input-shell input-xl"><span>${icon('search',16)}</span><input value="${esc(x.productLabel||'')}" data-ss-product-search="${i}" placeholder="نام یا کد سریع" autocomplete="off"></div><div class="product-suggest" data-ss-suggest="${i}"></div></div><div class="order-field"><label>مقدار درخواستی</label><div class="input-shell input-xl quantity-shell"><input data-ss-qty="${i}" inputmode="decimal" type="number" min="0" step="0.001" value="${esc(x.requestedQty)}"></div></div><div class="order-field"><label>واحد</label><div class="input-shell input-xl"><select data-ss-unit="${i}"><option ${x.requestedUnit==='کیلوگرم'?'selected':''}>کیلوگرم</option><option ${x.requestedUnit==='بسته'?'selected':''}>بسته</option><option ${x.requestedUnit==='عدد'?'selected':''}>عدد</option><option ${x.requestedUnit==='کارتن'?'selected':''}>کارتن</option></select></div></div><div class="order-field return-description-field"><label>توضیحات</label><div class="input-shell input-xl"><textarea data-ss-description="${i}" rows="2" placeholder="توضیحات این ردیف...">${esc(x.description||'')}</textarea></div></div><button type="button" class="btn btn-ghost btn-sm returned-delete-btn" data-action="sales-store-delete-line" data-index="${i}" aria-label="حذف ردیف">${icon('trash',16)} حذف</button></div>`).join('') || '<div class="empty">قلمی در این سفارش باقی نمانده است.</div>';
  $$('#salesStoreEditLines [data-ss-product-search]').forEach(inp=>inp.addEventListener('input',()=>salesStoreProductSearch(Number(inp.dataset.ssProductSearch),inp.value)));
  $$('#salesStoreEditLines [data-ss-qty]').forEach(inp=>inp.addEventListener('input',()=>{app.salesStoreEdit.items[Number(inp.dataset.ssQty)].requestedQty=inp.value;}));
  $$('#salesStoreEditLines [data-ss-unit]').forEach(sel=>sel.addEventListener('change',()=>{app.salesStoreEdit.items[Number(sel.dataset.ssUnit)].requestedUnit=sel.value;}));
  $$('#salesStoreEditLines [data-ss-description]').forEach(inp=>inp.addEventListener('input',()=>{app.salesStoreEdit.items[Number(inp.dataset.ssDescription)].description=inp.value;}));
}
function salesStoreProductSearch(i,q){
  searchProductOptions($(`[data-ss-product-search="${i}"]`),$(`[data-ss-suggest="${i}"]`),q,p=>`<button type="button" class="product-option" data-action="pick-sales-store-product" data-index="${i}" data-product-id="${esc(p.id)}" data-label="${esc(p.name)}"><span><b>${esc(p.name)}</b><span>${esc(p.defaultUnit)}</span></span>${icon('check',15)}</button>`);
}
function pickSalesStoreProduct(i,id,label){if(!app.salesStoreEdit?.items?.[i])return;app.salesStoreEdit.items[i].productId=id;app.salesStoreEdit.items[i].productLabel=label;const inp=$(`[data-ss-product-search="${i}"]`);if(inp)inp.value=label;const box=$(`[data-ss-suggest="${i}"]`);if(box)box.innerHTML='';$(`[data-ss-qty="${i}"]`)?.focus();}
function addSalesStoreLine(){if(!app.salesStoreEdit)return;app.salesStoreEdit.items.push({id:null,productId:'',productLabel:'',requestedQty:'',requestedUnit:'کیلوگرم',description:''});renderSalesStoreEditLines();toast('ردیف جدید اضافه شد.');}
function deleteSalesStoreLine(i){const items=app.salesStoreEdit?.items;if(!items||!items[i])return;if(items.length<=1)return toast('حداقل یک قلم باید در سفارش باقی بماند.');items.splice(i,1);renderSalesStoreEditLines();toast('ردیف حذف شد؛ با ذخیره تغییرات نهایی می‌شود.');}
async function saveSalesStoreOrder(id){
  const items=(app.salesStoreEdit?.items||[]);
  if(!items.length)return toast('حداقل یک قلم معتبر لازم است.');
  if(items.some(item=>!item.productId||n(item.requestedQty)<=0))return toast('برای همه ردیف‌ها محصول و مقدار معتبر وارد کنید.');
  try{
    const payload={items:items.map(item=>({productId:item.productId,requestedQty:n(item.requestedQty),requestedUnit:item.requestedUnit,description:String(item.description||'').trim()})),notes:String($('#salesStoreEditNotes')?.value||'').trim()};
    await api('/api/store/orders/'+id+'/sales-edit',{method:'PUT',body:JSON.stringify(payload)});
    toast('تغییرات سفارش فروشگاه ثبت شد و در سوابق فعالیت ذخیره گردید.');
    closeModal(); app.salesStoreEdit=null; await renderSales('stores'); await refreshIndicators();
  }catch(e){toast(e.message)}
}

/* ================================================================
   v26 — Complete visual redesign / dashboard + sales desk + forms
   ================================================================ */
/* ---------- v37.11.0 — آمار زندهٔ سفارشات ورودی امروز در داشبورد انبار ---------- */
function whDashUnitsPlain(units){const parts=Object.entries(units||{}).filter(([,v])=>Number(v)>0).map(([u,v])=>`${qty(v)} ${u}`);return parts.length?parts.join(' • '):'—'}
function whDashUnitsText(units){return esc(whDashUnitsPlain(units))}
function whDashProductKey(p,i){return String(p.productId||`${p.productName||'product'}-${i}`)}
function whDashProductLabelHtml(p){return `${p.quickCode?`<span class="code-pill">${esc(p.quickCode)}</span>`:''}${esc(p.productName||'—')}`}
function whDashProductRowHtml(p,i,kind){
  const key=`${kind}:${whDashProductKey(p,i)}`;
  const values=kind==='orders'?[p.productName,p.quickCode,whDashUnitsPlain(p.units),Number(p.orders||0),Number(p.lines||0)]:[p.productName,p.quickCode,Number(p.deliveredKg||0),Number(p.orders||0),Number(p.outOfStock||0)];
  const signature=esc(JSON.stringify(values));
  const product=kind==='orders'?`<button type="button" class="wh-dash-product-link" data-wh-dash-product data-cartable="incoming" data-role-page="warehouse">${whDashProductLabelHtml(p)}</button>`:`<span class="wh-dash-product-name" data-wh-dash-product>${whDashProductLabelHtml(p)}</span>`;
  const cells=kind==='orders'
    ?`<td class="wh-dash-rank-cell">${fa(i+1)}</td><td>${product}</td><td>${whDashUnitsText(p.units)}</td><td>${qty(p.orders||0)}</td><td>${qty(p.lines||0)}</td>`
    :`<td class="wh-dash-rank-cell">${fa(i+1)}</td><td>${product}</td><td>${qty(p.deliveredKg||0)} کیلوگرم</td><td>${qty(p.orders||0)}</td><td>${p.outOfStock?qty(p.outOfStock):'—'}</td>`;
  return `<tr data-wh-dash-key="${esc(key)}" data-wh-dash-signature="${signature}">${cells}</tr>`;
}
function whDashProductRowsHtml(products,kind){
  if(!products.length)return `<tr class="wh-dash-empty-row"><td colspan="5">${kind==='orders'?'امروز هنوز سفارشی وارد انبار نشده است.':'امروز هنوز محصولی به‌عنوان تحویل‌شده ثبت نشده است.'}</td></tr>`;
  return products.map((p,i)=>whDashProductRowHtml(p,i,kind)).join('');
}
function whDashProductTableHtml(products,kind,live=false){
  const orders=kind==='orders',bodyData=live?(orders?' data-wh-dash-orders':' data-wh-dash-delivered'):'';
  return `<div class="wh-dash-table-wrap"><table class="wh-dash-table"><thead><tr><th>#</th><th>محصول</th><th>${orders?'مقدار سفارش':'وزن تحویلی'}</th><th>تعداد سفارش</th><th>${orders?'ردیف کالا':'ناموجود'}</th></tr></thead><tbody${bodyData}>${whDashProductRowsHtml(products,kind)}</tbody></table></div>`;
}
function whDashLiveBodyHtml(s){
  if(!s)return `<div class="wh-dash-empty" data-wh-dash-load-error>دریافت آمار زنده در این لحظه ممکن نشد؛ چند ثانیه دیگر خودکار دوباره تلاش می‌شود.</div>`;
  const t=s.totals||{},prods=Array.isArray(s.byProduct)?s.byProduct:[],top=prods.slice(0,10);
  const delivered=Array.isArray(s.deliveredByProduct)?s.deliveredByProduct:[],dt=s.deliveredTotals||{};
  const updated=serverNow().toLocaleTimeString('fa-IR');
  return `<div class="wh-dash-content" data-wh-dash-layout>
    <div class="wh-dash-totals">
      <div class="wh-dash-total"><span>سفارش‌های ورودی امروز</span><b data-wh-dash-value="orders">${qty(t.orders||0)}</b></div>
      <div class="wh-dash-total"><span>ردیف کالا</span><b data-wh-dash-value="items">${qty(t.items||0)}</b></div>
      <div class="wh-dash-total"><span>محصول متمایز</span><b data-wh-dash-value="products">${qty(t.products||0)}</b></div>
      <div class="wh-dash-total is-wide"><span>مجموع مقدار سفارش</span><b data-wh-dash-units>${whDashUnitsText(t.units)}</b></div>
    </div>
    <div class="wh-dash-status">
      <span class="wh-dash-chip is-pending">در صف انبار: <b data-wh-dash-value="pending">${qty(t.pending||0)}</b></span>
      <span class="wh-dash-chip is-preparing">در حال آماده‌سازی: <b data-wh-dash-value="preparing">${qty(t.preparing||0)}</b></span>
      <span class="wh-dash-chip is-done">انجام‌شده: <b data-wh-dash-value="done">${qty(t.done||0)}</b></span>
      <span class="wh-dash-updated">آخرین به‌روزرسانی: <b data-wh-dash-updated>${esc(updated)}</b></span>
      <span class="wh-dash-refresh-error" data-wh-dash-refresh-error hidden>به‌روزرسانی تازه دریافت نشد؛ آمار قبلی حفظ شده است.</span>
    </div>
    <div class="wh-dash-tables">
      <section class="wh-dash-table-card" aria-label="سفارش‌های امروز به تفکیک محصول">
        <header class="wh-dash-table-heading"><div><h4>سفارش‌های امروز به تفکیک محصول</h4><p>۱۰ محصول پرفروش در این نما؛ کلیک روی نام محصول، صف سفارش‌های ورودی را باز می‌کند.</p></div><span data-wh-dash-order-count>${qty(prods.length)} محصول</span></header>
        ${whDashProductTableHtml(top,'orders',true)}
        <button type="button" class="wh-dash-all-products" data-wh-dash-all-orders ${prods.length>10?'':'hidden'}>مشاهدهٔ همهٔ ${qty(prods.length)} محصول</button>
      </section>
      <section class="wh-dash-table-card wh-dash-delivered-card" aria-label="محصولات تحویل‌شدهٔ امروز">
        <header class="wh-dash-table-heading"><div><h4>محصولات تحویل‌شدهٔ امروز</h4><p>مقدار نهایی ثبت‌شده در انبار، به تفکیک محصول</p></div><span data-wh-dash-delivered-count>${qty(dt.products||delivered.length)} محصول</span></header>
        ${whDashProductTableHtml(delivered,'delivered',true)}
        <div class="wh-dash-delivered-total">جمع وزن تحویلی: <b data-wh-dash-delivered-total>${qty(dt.deliveredKg||0)} کیلوگرم</b> <span>در <b data-wh-dash-delivered-orders>${qty(dt.orders||0)}</b> سفارش</span></div>
      </section>
    </div>
  </div>`;
}
function whDashUpdateRows(tbody,products,kind){
  if(!tbody)return;
  const current=new Map([...tbody.querySelectorAll('tr[data-wh-dash-key]')].map(row=>[row.dataset.whDashKey,row]));
  const wanted=(products||[]).map((p,i)=>{
    const key=`${kind}:${whDashProductKey(p,i)}`;
    let row=current.get(key);
    if(!row){const template=document.createElement('template');template.innerHTML=whDashProductRowHtml(p,i,kind);row=template.content.firstElementChild;}
    const values=kind==='orders'?[p.productName,p.quickCode,whDashUnitsPlain(p.units),Number(p.orders||0),Number(p.lines||0)]:[p.productName,p.quickCode,Number(p.deliveredKg||0),Number(p.orders||0),Number(p.outOfStock||0)];
    const signature=JSON.stringify(values);
    if(row.dataset.whDashSignature!==signature){
      row.querySelector('[data-wh-dash-product]').innerHTML=whDashProductLabelHtml(p);
      if(kind==='orders'){
        row.children[2].textContent=whDashUnitsPlain(p.units);row.children[3].textContent=qty(p.orders||0);row.children[4].textContent=qty(p.lines||0);
      }else{
        row.children[2].textContent=qty(p.deliveredKg||0)+' کیلوگرم';row.children[3].textContent=qty(p.orders||0);row.children[4].textContent=p.outOfStock?qty(p.outOfStock):'—';
      }
      row.dataset.whDashSignature=signature;
    }
    row.dataset.whDashKey=key;row.children[0].textContent=fa(i+1);current.delete(key);return row;
  });
  let empty=null;
  if(!wanted.length){const template=document.createElement('template');template.innerHTML=whDashProductRowsHtml([],kind);empty=template.content.firstElementChild;}
  const ordered=empty?[empty]:wanted;
  let cursor=tbody.firstElementChild;
  for(const row of ordered){if(row!==cursor)tbody.insertBefore(row,cursor);cursor=row.nextElementSibling;}
  while(cursor){const next=cursor.nextElementSibling;cursor.remove();cursor=next;}
}
function whDashApplyData(host,s){
  if(!host)return;
  if(!s){const warning=host.querySelector('[data-wh-dash-refresh-error]');if(warning)warning.hidden=false;else if(!host.querySelector('[data-wh-dash-load-error]'))host.innerHTML=whDashLiveBodyHtml(null);return;}
  app.whDashData=s;
  if(!host.querySelector('[data-wh-dash-layout]')){host.innerHTML=whDashLiveBodyHtml(s);return;}
  const t=s.totals||{},prods=Array.isArray(s.byProduct)?s.byProduct:[],delivered=Array.isArray(s.deliveredByProduct)?s.deliveredByProduct:[],dt=s.deliveredTotals||{};
  for(const key of ['orders','items','products','pending','preparing','done']){const el=host.querySelector(`[data-wh-dash-value="${key}"]`);if(el)el.textContent=qty(t[key]||0);}
  const units=host.querySelector('[data-wh-dash-units]');if(units)units.innerHTML=whDashUnitsText(t.units);
  const updated=host.querySelector('[data-wh-dash-updated]');if(updated)updated.textContent=serverNow().toLocaleTimeString('fa-IR');
  const orderCount=host.querySelector('[data-wh-dash-order-count]');if(orderCount)orderCount.textContent=qty(prods.length)+' محصول';
  const deliveredCount=host.querySelector('[data-wh-dash-delivered-count]');if(deliveredCount)deliveredCount.textContent=qty(dt.products||delivered.length)+' محصول';
  const deliveredTotal=host.querySelector('[data-wh-dash-delivered-total]');if(deliveredTotal)deliveredTotal.textContent=qty(dt.deliveredKg||0)+' کیلوگرم';
  const all=host.querySelector('[data-wh-dash-all-orders]');if(all){all.hidden=prods.length<=10;all.textContent='مشاهدهٔ همهٔ '+qty(prods.length)+' محصول';}
  whDashUpdateRows(host.querySelector('[data-wh-dash-orders]'),prods.slice(0,10),'orders');
  whDashUpdateRows(host.querySelector('[data-wh-dash-delivered]'),delivered,'delivered');
  const deliveredOrders=host.querySelector('[data-wh-dash-delivered-orders]');if(deliveredOrders)deliveredOrders.textContent=qty(dt.orders||0);
  const warning=host.querySelector('[data-wh-dash-refresh-error]');if(warning)warning.hidden=true;
}
function whDashLiveHtml(s){
  if(s)app.whDashData=s;
  return `<section class="wh-dash-live tone-red" aria-label="آمار زندهٔ سفارش‌های انبار"><div class="wh-dash-head"><span class="wh-dash-ico">${icon('package',22)}</span><div class="wh-dash-title"><h3>سفارش‌های انبار امروز</h3><p>سفارش‌های ورودی به تفکیک محصول و محصولاتی که امروز در انبار تحویل‌شده ثبت شده‌اند؛ جدول‌ها بدون خالی‌شدن ناگهانی به‌روز می‌شوند.</p></div><span class="role-dash-live"><i></i> زنده</span><button type="button" class="btn btn-primary btn-sm" data-cartable="incoming" data-role-page="warehouse">مشاهدهٔ سفارش‌های ورودی ←</button></div><div id="whDashLiveBody">${whDashLiveBodyHtml(s)}</div></section>`;
}
function openWhDashAllOrders(){
  const products=app.whDashData?.byProduct||[];
  if(products.length<=10)return;
  openModal('همهٔ محصولات سفارش‌های ورودی امروز',`<div class="wh-dash-all-modal"><p>همهٔ ${qty(products.length)} محصولِ مرتب‌شده بر اساس مقدار سفارش.</p>${whDashProductTableHtml(products,'orders')}</div>`);
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-wh-dash-all-orders]');if(b){e.preventDefault();openWhDashAllOrders();}});
async function refreshWhDashToday(){
  const host=$('#whDashLiveBody');if(!host||app.whDashRefreshBusy)return;
  app.whDashRefreshBusy=true;
  try{const s=await api('/api/warehouse/today-stats');if(host.isConnected)whDashApplyData(host,s);}catch{if(host.isConnected)whDashApplyData(host,null);}finally{app.whDashRefreshBusy=false;}
}

function salesHistoryRow(o){
 return `<tr data-order="${esc(o.id)}"><td data-label="مشتری">${esc(o.customerName||'—')}</td><td data-label="شماره سفارش">${esc(fa(o.orderNo||'—'))}</td><td data-label="تاریخ ثبت">${esc(formatDateTime24(o.createdAt))}</td><td data-label="وضعیت">${badge(o.status)}</td><td data-label="شماره تماس">${esc(o.phone||'—')}</td><td data-label="فاکتورها">${qty(o.invoiceCount||0)} فاکتور</td><td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-secondary btn-sm" data-sales-history-id="${esc(o.id)}">جزئیات و رویدادها</button></td></tr>`;
}
function salesHistoryTable(rows){
 if(!rows.length)return '';
 return `<div class="bt-table-wrap"><table class="bt-table sales-history-table"><caption class="bt-caption">سوابق سفارش و فاکتور</caption><thead><tr><th scope="col">مشتری</th><th scope="col">شماره سفارش</th><th scope="col">تاریخ ثبت</th><th scope="col">وضعیت</th><th scope="col">شماره تماس</th><th scope="col">فاکتورها</th><th scope="col">عملیات</th></tr></thead><tbody>${rows.map(salesHistoryRow).join('')}</tbody></table></div>`;
}

async function refreshSalesOverview(){
 const host=$('[data-dash-role="sales"]');if(!host)return;
 const results=await Promise.allSettled([api('/api/sales/daily-products'),api('/api/workload')]);if(!host.isConnected)return;
 if(results[1].status==='fulfilled'){
  const work=results[1].value,keys=['salesIntake','salesRemote','salesFlow','store','salesSettlement','salesFuture'],counts=keys.map(k=>Number(work.counts?.[k]||0)),max=Math.max(1,...counts);
  host.querySelectorAll('[data-cartable].role-dash-card').forEach((card,i)=>{const number=card.querySelector(':scope > strong'),bar=card.querySelector('.role-dash-bar i');if(number)number.textContent=qty(counts[i]);if(bar)bar.style.width=Math.max(6,Math.round(counts[i]*100/max))+'%';});
 }
 for(const card of host.querySelectorAll('[data-sales-daily]')){
  const number=card.querySelector('strong');if(results[0].status!=='fulfilled'){number.textContent='خطا در دریافت';continue;}
  const d=results[0].value;number.textContent=card.dataset.salesDaily==='sales'?money(d.sales.total):qty(d.orders.kg)+' کیلوگرم';
 }
}
async function openSalesDaily(kind){
 try{
  const d=await api('/api/sales/daily-products');
  if(kind==='sales'){
   const s=d.sales;
   openModal('فروش روز به تفکیک محصولات',`<div class="sales-daily-detail"><p>مجموع نهایی فاکتورهای تسویه یا بسته‌شده در روز محلی سرور، نه وصول نقدی. سفارش لغوشده و فاکتور پخشِ صرفاً آماده حذف شده‌اند.</p><div class="sales-daily-total"><span>جمع فاکتورها</span><b>${money(s.total)}</b></div><p>مبالغ محصولات از ریز فاکتور و پیش از تعدیلات کلی فاکتور هستند.</p>${s.rows.map(r=>`<div class="sales-daily-row"><span>${esc(r.productName)}</span><b>${money(r.amount)}</b></div>`).join('')||'<p>ریز محصولی موجود نیست.</p>'}<div class="sales-daily-row"><span>تخفیف، اضافات، مرجوعی و سایر اختلاف‌ها</span><b>${money(s.adjustments)}</b></div><div class="sales-daily-row"><span>فاکتورهای فاقد ریز قابل انتساب</span><b>${money(s.unallocated)}</b></div></div>`);
  }else{
   const o=d.orders,units=u=>Object.entries(u).map(([unit,n])=>`${qty(n)} ${esc(unit)}`).join('، ');
   openModal('سفارش روز به تفکیک محصولات',`<div class="sales-daily-detail"><p>اقلام فعال سفارش‌های ثبت‌شده امروز بر اساس تاریخ محلی سرور؛ به‌جز سفارش لغوشده. مقادیر مطابق وضعیت فعلی سفارش‌اند و سابقه تغییرات نیستند.</p><div class="sales-daily-total"><span>جمع وزن سفارش‌های کیلویی</span><b>${qty(o.kg)} کیلوگرم</b></div><p>واحدهای بسته، عدد و کارتن به وزن تبدیل نمی‌شوند و جداگانه نمایش داده شده‌اند.</p>${o.rows.map(r=>`<div class="sales-daily-row"><span>${esc(r.productName)}</span><b>${units(r.units)}</b></div>`).join('')||'<p>سفارشی برای امروز وجود ندارد.</p>'}</div>`);
  }
 }catch(e){toast('خطا در دریافت آمار روز: '+e.message)}
}
document.addEventListener('click',e=>{const card=e.target.closest('[data-sales-daily]');if(card){e.preventDefault();void openSalesDaily(card.dataset.salesDaily);}});
const SALES_EVENT_LABELS={CREATE_VISIT:'ثبت مراجعه اولیه',CREATE_ORDER:'ثبت سفارش حضوری',CREATE_REMOTE_ORDER:'ثبت سفارش غیرحضوری',CREATE_STORE_ORDER:'ثبت سفارش فروشگاه',UPDATE_STORE_ORDER:'ویرایش سفارش فروشگاه',SALES_EDIT_STORE_ORDER:'اصلاح سفارش فروشگاه',APPROVE_STORE_ORDER:'تأیید سفارش فروشگاه',QUICK_SEND_STORE_ORDER:'ارسال سریع سفارش فروشگاه',UPDATE_REMOTE_ORDER:'ویرایش برنامه سفارش',CANCEL_REMOTE_ORDER:'لغو سفارش',CANCEL_STORE_ORDER:'لغو سفارش فروشگاه',ACTIVATE_REMOTE_ORDER:'ارسال زمان‌بندی‌شده به انبار',WAREHOUSE_ACCEPT_ORDER:'دریافت در انبار',WAREHOUSE_START_PREPARING:'شروع آماده‌سازی',WAREHOUSE_DRAFT_SAVED:'ذخیره پیش‌نویس وزن',WAREHOUSE_FINALIZE:'ثبت وزن نهایی انبار',WAREHOUSE_DOCUMENT_EDITED:'اصلاح سند انبار',WAREHOUSE_DOCUMENT_EDIT_REQUESTED:'درخواست اصلاح سند انبار',RETURN_TO_SALES:'ارجاع به فروش',REOPEN_WAREHOUSE_PREPARING:'بازگشایی آماده‌سازی',ADD_ORDER_ITEM:'افزودن قلم',UPDATE_ORDER_ITEM:'ویرایش قلم',DELETE_ORDER_ITEM:'حذف قلم',SAVE_RETURNED_ORDER_EDIT:'ثبت اصلاح سفارش',RESUBMIT_TO_WAREHOUSE:'ارسال مجدد به انبار',FINAL_SETTLEMENT:'تسویه و صدور فاکتور',FINAL_EXIT:'ثبت خروج',DEPOSIT_REFUNDED_MANUALLY:'ثبت استرداد بیعانه',DEPOSIT_PARTIAL_REFUND_MANUALLY:'ثبت استرداد بخشی از بیعانه',SEND_TO_DISPATCH:'ارسال به پخش',TRANSPORT_PLAN_ASSIGNED:'تخصیص خودرو و راننده',TRANSPORT_WAREHOUSE_HANDOVER:'تحویل به راننده از انبار',TRANSPORT_INVOICE_PREPARED:'آماده‌سازی سند پخش',TRANSPORT_DEPARTURE:'ثبت خروج محموله',TRANSPORT_INVOICE_CLOSED:'بستن سند پخش',DISPATCH_ASSIGN:'تخصیص راننده',DISPATCH_DRIVER_EXIT:'ثبت خروج راننده',DISPATCH_GATE_EXIT:'تأیید خروج راننده',DISPATCH_DELIVERED:'ثبت تحویل راننده',DISPATCH_SALES_FINALIZE:'تأیید تحویل و صدور فاکتور',DISPATCH_PRICE_APPROVE:'تأیید قیمت پخش',DISPATCH_PRICE_ADJUST:'اصلاح قیمت پخش',RETURN_REFERRED_TO_WAREHOUSE:'ارجاع مرجوعی به انبار',RETURN_RECEIVED:'دریافت مرجوعی',STORE_RUN_R1_WEIGHT:'ثبت وزن سرویس اول',STORE_RUN_R2_WEIGHT:'ثبت وزن سرویس دوم',STORE_RUN_R1_SEND:'ارسال سرویس اول',STORE_RUN_R2_SEND:'ارسال سرویس دوم',STORE_RUN_R1_SEND_APPEND:'ارسال تکمیلی سرویس اول',STORE_RUN_R2_SEND_APPEND:'ارسال تکمیلی سرویس دوم',STORE_RUN_R1_DISPATCHED:'تخصیص سرویس اول',STORE_RUN_R2_DISPATCHED:'تخصیص سرویس دوم',STORE_RUN_MOVE_R2:'انتقال به سرویس دوم',STORE_RUN_DAY_FINALIZED:'پایان عملیات روز فروشگاه',STORE_RUN_OUT_OF_STOCK:'ثبت عدم موجودی',STORE_RUN_ITEM_COMPLETED:'تکمیل قلم فروشگاه',STORE_RUN_RECEIPT_CONFIRMED:'تأیید دریافت فروشگاه',PICKUP_ENTRY:'ثبت ورود تحویل‌گیرنده',PICKUP_PHYSICAL_HANDOVER:'تحویل فیزیکی سفارش',PICKUP_GOODS_EXIT:'ثبت خروج کالا'};
function salesHistoryValue(value){if(value==null||value==='')return '—';if(typeof value==='object')return JSON.stringify(value);return String(value);}
function salesHistoryEventHtml(event){
 const actor=event.actor?.name||event.username||'سامانه',details=event.details||{},hasDetails=Object.keys(details).length>0;
 return `<li><b>${esc(SALES_EVENT_LABELS[event.action]||event.action||'اقدام ثبت‌شده')}</b><small>${esc(formatDateTime24(event.createdAt))} · ثبت‌کننده: ${esc(actor)}${event.seq?` · ردیف ${fa(event.seq)}`:''}</small>${event.entityType?`<small>موجودیت: ${esc(event.entityType)}${event.entityId?` · ${esc(String(event.entityId))}`:''}</small>`:''}${hasDetails?`<details class="sales-history-event-details"><summary>مشاهدهٔ جزئیات کامل این اقدام</summary><pre dir="ltr">${esc(JSON.stringify(details,null,2))}</pre></details>`:''}</li>`;
}
function salesHistoryOrderItems(items){
 return `<div class="table-wrap"><table class="table sales-history-items"><thead><tr><th>کالا</th><th>مقدار درخواستی</th><th>وضعیت انبار</th><th>وزن نهایی</th></tr></thead><tbody>${(items||[]).map(item=>{
  const runs=[...(item.runR1||[]).map(row=>({...row,service:'سرویس اول'})),...(item.runR2||[]).map(row=>({...row,service:'سرویس دوم'}))];
  const weightLog=runs.length?`<details class="sales-history-event-details"><summary>سوابق وزن‌کشی و کاربران</summary>${runs.map(row=>`<p>${row.service}: ${qty(row.kg)} کیلوگرم · ${esc(formatDateTime24(row.at))} · ${esc(row.byName||row.by||'ثبت‌کننده نامشخص')}</p>${row.weighings?`<pre dir="ltr">${esc(JSON.stringify(row.weighings,null,2))}</pre>`:''}`).join('')}</details>`:'';
  const whNote=String(item.warehouseNote||'').trim();
  return `<tr><td><b>${esc(item.productName||'—')}</b>${item.description?`<small>${esc(item.description)}</small>`:''}${whNote?`<small class="stl-warehouse-note" title="توضیح انبار${item.warehouseNoteByName?` — ${esc(item.warehouseNoteByName)}`:''}">${icon('clipboard',12)} <b>توضیح انبار:</b> ${esc(whNote)}</small>`:''}</td><td>${qty(item.requestedQty)} ${esc(item.requestedUnit||'')}</td><td>${esc(item.warehouseStatus||item.itemStatus||'—')}</td><td>${item.deliveredKg==null?'—':`${qty(item.deliveredKg)} کیلوگرم`}${weightLog}</td></tr>`;
 }).join('')||'<tr><td colspan="4">ریز اقلام در دسترس نیست.</td></tr>'}</tbody></table></div>`;
}
async function openSalesHistory(id){
 try{
  const isManager=normalizeRole(app.user?.roleCode)==='admin';
  const path=isManager?'/api/admin/orders/'+encodeURIComponent(id)+'/history':'/api/sales/history/'+encodeURIComponent(id);
  const d=await api(path),o=d.order||{},customer=o.customer||{};
  const typeLabels={ONSITE:'حضوری',REMOTE:'غیرحضوری',STORE:'فروشگاهی'};
  const profileFields=[['کد مشتری',customer.code],['مشتری',customer.name||o.customerName],['تلفن',customer.phone||o.phone],['تلفن دوم',customer.phone2],['کد ملی',customer.nationalId],['شرکت / واحد',customer.company],['پلاک',customer.plate],['وسیله',customer.vehicleType],['نوع خودرو',customer.carType],['محله',customer.district],['نشانی',customer.address],['یادداشت',customer.notes]];
  const customerHtml=customer.name||customer.phone?`<section><h3>اطلاعات مشتری</h3><div class="sales-history-info-grid">${profileFields.filter(([,value])=>value).map(([label,value])=>`<div><small>${label}</small><b>${esc(label==='تلفن'||label==='تلفن دوم'||label==='کد ملی'||label==='کد مشتری'?fa(value):value)}</b></div>`).join('')||'<p class="subtle">اطلاعات کامل مشتری ثبت نشده است.</p>'}</div></section>`:'';
  const type=esc(o.orderTypeLabel||typeLabels[o.orderType]||o.orderType||'—');
  // v37.50.0 — پروندهٔ کامل: نوع و وضعیت اولیه، کاربر هر مرحله و وضعیت ترابری هم اضافه شد.
  const orderFields=[['نوع سفارش',type],['وضعیت فعلی',esc(o.status||'—')],['وضعیت هنگام ثبت',esc(o.statusAtCreation||'')],['تاریخ ثبت',esc(formatDateTime24(o.createdAt))],['ثبت‌کننده',esc(o.createdBy?.name||o.createdBy?.username||'—')],['آخرین تغییر',esc(formatDateTime24(o.updatedAt))],['فروشگاه',esc(o.storeName||'')],['زمان برنامه‌ریزی',esc(formatDateTime24(o.scheduledAt||o.scheduledDate))],['تاریخ تحویل',esc(formatDateTime24(o.deliveryDate))],['محل ارسال',esc(o.dispatchPlace||'')],['روش تحویل',esc(o.deliveryMode==='DELIVERY'?'ارسال با پخش':o.deliveryMode==='PICKUP'?'تحویل در انبار':'')],['شماره سند انبار',esc(fa(o.warehouseDocumentNo||''))],['دریافت در انبار',esc(formatDateTime24(o.warehouseAcceptedAt))],['دریافت‌کنندهٔ انبار',esc(o.warehouseAcceptedBy?.name||'')],['شروع آماده‌سازی',esc(formatDateTime24(o.warehousePreparationStartedAt))],['شروع‌کننده',esc(o.warehousePreparationStartedBy?.name||'')],['ثبت وزن نهایی',esc(formatDateTime24(o.warehouseCompletedAt))],['ثبت‌کنندهٔ وزن نهایی',esc(o.warehouseCompletedBy?.name||'')],['پایان کار',esc(formatDateTime24(o.completedAt))],['یادداشت سفارش',esc(o.notes||'')]];
  const orderHtml=`<section><h3>مشخصات سفارش</h3><div class="sales-history-info-grid">${orderFields.filter(([,value])=>value&&value!=='—').map(([label,value])=>`<div><small>${label}</small><b>${value}</b></div>`).join('')}</div></section>`;
  const invoices=(o.invoices||[]).map(payment=>`<div class="sales-history-row"><div><b>${esc(payment.number||'—')}</b><small>${esc(formatDateTime24(payment.verifiedAt))} · ${money(payment.total)}</small></div><button type="button" class="btn btn-secondary btn-sm" data-action="invoice" data-id="${esc(o.id)}" data-run="${Number(payment.run)||0}">نمایش فاکتور</button></div>`).join('')||'<p class="subtle">فاکتوری صادر نشده است.</p>';
  const visit=o.visit?`<section><h3>مراجعهٔ مرتبط</h3><p>${esc(formatDateTime24(o.visit.createdAt))} · ثبت‌کننده: ${esc(o.visit.createdBy?.name||'—')} · ${esc(o.visit.purpose||'')}</p></section>`:'';
  const items=isManager?`<section><h3>اقلام سفارش و وزن‌ها</h3>${salesHistoryOrderItems(d.items)}</section>`:'';
  // v37.50.0 — مسیر ترابری: راننده و خودروی هر سرویس و کاربر تخصیص‌دهنده.
  const transportRows=Object.values(o.transportAssignments||{});
  const transport=isManager&&transportRows.length?`<section><h3>ارسال و ترابری</h3><div class="sales-history-info-grid">${transportRows.map(a=>`<div><small>${a.run?`سرویس ${fa(a.run===1?'اول':'دوم')}`:'سفارش مشتری'}</small><b>${esc(a.driverName||'—')}${a.vehiclePlate?` • ${esc(fa(a.vehiclePlate))}`:''}<br><span class="subtle">تخصیص: ${esc(formatDateTime24(a.assignedAt))}${a.assignedBy?.name?` · ${esc(a.assignedBy.name)}`:''}</span></b></div>`).join('')}</div></section>`:'';
  const events=(d.events||[]).map(salesHistoryEventHtml).join('')||'<li>رویداد ثبت‌شده‌ای برای این سفارش موجود نیست.</li>';
  openModal(`سوابق سفارش ${fa(o.orderNo||'—')}`,`<div class="sales-history-detail"><div class="sales-history-summary"><b>${esc(o.customerName||customer.name||o.storeName||'—')}</b><span>${badge(o.status)}</span><span>نوع سفارش: ${type}</span><span>شماره سفارش: ${esc(fa(o.orderNo||'—'))}</span></div>${orderHtml}${customerHtml}${visit}${items}${transport}<section><h3>فاکتورها</h3>${invoices}</section><section><h3>مسیر کامل سفارش و کاربران ثبت‌کننده</h3><p class="subtle">رویدادها به ترتیب ثبت در سامانه نمایش داده می‌شوند. برای هر مرحله، جزئیات ممیزی و ثبت‌کننده قابل مشاهده است؛ سوابق قدیمی ممکن است اطلاعاتی نداشته باشند.</p><ol class="sales-history-timeline">${events}</ol></section></div>`);
 }catch(e){toast(e.message)}
}
async function renderSalesHistory(q='',offset=0){
 const root=$('#content');root.onclick=null;root.innerHTML='<div class="empty">در حال دریافت سوابق…</div>';
 try{const d=await api('/api/sales/history?limit=25&offset='+offset+'&q='+encodeURIComponent(q));if(app.page!=='sales'||app.sub.sales!=='history')return;root.innerHTML=`<section class="sales-history-panel"><div class="sales-live-head"><div><h2>سوابق سفارش و فاکتور</h2><p>همهٔ سفارش‌های ثبت‌شده، وضعیت فعلی، فاکتورها و گردش ثبت‌شده</p></div><span class="badge blue">${qty(d.total)} سفارش</span></div><form id="salesHistorySearch" class="sales-history-search"><input name="q" value="${esc(q)}" placeholder="نام مشتری، تلفن، شماره سفارش یا فاکتور" aria-label="جستجو در سوابق"><button class="btn btn-primary" type="submit">جستجو</button></form><div class="sales-history-list">${salesHistoryTable(d.orders)||'<div class="empty">سابقه‌ای یافت نشد.</div>'}</div><div class="sales-history-pages"><button class="btn btn-secondary" data-history-offset="${Math.max(0,offset-25)}" ${offset===0?'disabled':''}>صفحه قبل</button><span>${qty(offset+1)}–${qty(Math.min(d.total,offset+25))} از ${qty(d.total)}</span><button class="btn btn-secondary" data-history-offset="${offset+25}" ${offset+25>=d.total?'disabled':''}>صفحه بعد</button></div></section>`;$('#salesHistorySearch').onsubmit=e=>{e.preventDefault();renderSalesHistory(e.currentTarget.elements.q.value.trim(),0)};root.onclick=e=>{const p=e.target.closest('[data-history-offset]');if(p)renderSalesHistory(q,Number(p.dataset.historyOffset));};}catch(e){root.innerHTML=`<div class="empty">خطا در دریافت سوابق: ${esc(e.message)}</div>`;}
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-sales-history-id]');if(b){e.preventDefault();openSalesHistory(b.dataset.salesHistoryId);}});

async function renderRoleCartableDashboard(role,view='dashboard'){
  if (view === 'reports') return renderReportsPage(role);
  const names={gate:'نگهبانی',sales:'فروش',warehouse:'انبار',dispatch:'ترابری',store:'فروشگاه'};let w={...(app.workload||{})};
  if(role==='dispatch'){
    try{const [resources,plans,work]=await Promise.all([api('/api/transport/resources'),api('/api/transport/plans'),api('/api/workload')]);w.activeDrivers=(resources.drivers||[]).filter(d=>d.isActive).length;w.dispatchIncoming=Number(work.counts?.dispatchPending||0);w.dispatchPlanned=(plans.orders||[]).length;}catch{}
  }
  if(role==='store'){
    try{const rows=(await api('/api/store/orders')).orders||[],views=rows.flatMap(o=>st38ViewsOf(o));w.store=rows.filter(o=>o.status==='STORE_PENDING_SALES').length;w.storeDelivery=views.filter(v=>v.dispatch&&['ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT'].includes(v.dispatch.status)).length;w.storeDelivered=views.filter(v=>v.dispatch&&['DELIVERED','SALES_FINALIZED','CLOSED'].includes(v.dispatch.status)).length;}catch{}
  }
  // v37.11.0 — آمار سفارشات ورودی امروز فقط برای داشبورد انبار گرفته می‌شود.
  let whToday=null;
  if(role==='warehouse'&&view==='dashboard'){
    try{whToday=await api('/api/warehouse/today-stats');}catch{}
  }
  // v37.10.0 — کارت‌ها: [برچسب، مقدار، مقصد، آیکن موضوعی، رنگ لهجه]؛ داده‌ها و مقصدها بدون تغییر.
  const sets={
    gate:[['در انتظار فروش',w.gateEntry||0,'waiting','user','red'],['آماده خروج',w.gateExit||0,'exit','exitDoor','green'],['پخش',w.gateDispatchPending||0,'dispatch-leaving','truck','blue'],['سوابق مراجعه',w.visitsTotal||0,'history','history','purple']],
    sales:[['ورودی حضوری',w.salesIntake||0,'onsite','user','red'],['سفارش غیرحضوری',w.salesRemote||0,'remote','phone','blue'],['در جریان',w.salesFlow||0,'flow','flow','orange'],['فروشگاه‌ها',w.store||0,'stores','store','purple'],['آماده تسویه',w.salesSettlement||0,'settlement','receipt','green'],['روزهای آتی',w.salesFuture||0,'future','calendar','teal']],
    warehouse:[['سفارش‌های ورودی',w.warehouseIncoming||0,'incoming','inbox','red'],['تحویل و آماده‌سازی',w.warehousePreparing||0,'preparing','scale','orange'],['فروشگاه‌ها',w.warehouseStores||0,'stores','store','purple'],['سوابق مراجعه',w.visitsTotal||0,'history','history','blue']],
    dispatch:[['رانندگان فعال',w.activeDrivers||0,'transport-resources','driver','blue'],['اقدام‌های ترابری',w.dispatchIncoming||0,'orders','inbox','red'],['سفارش‌های در برنامه',w.dispatchPlanned||0,'orders','route','orange']],
    store:[['در انتظار بررسی',w.store||0,'registered','clipboard','red'],['در حال تحویل',w.storeDelivery||0,'delivery','truck','orange'],['تحویل‌شده',w.storeDelivered||0,'delivery','check','green']]
  };
  const cards=sets[role]||[];
  const roleIcons={gate:'shield',sales:'sales',warehouse:'warehouse',dispatch:'truck',store:'store'};
  const rolePage=role==='dispatch'?'drivers':role;
  const dashHeading=(title,desc,ico)=>`<div class="role-dash-heading"><span class="role-dash-hero-ico">${icon(ico,24)}</span><div class="role-dash-heading-text"><span class="eyebrow">${esc(names[role]||'کارتابل')} / ${view==='reports'?'REPORTS':'OVERVIEW'}</span><h2>${title}</h2><p>${desc}</p></div><span class="role-dash-live"><i></i> به‌روزرسانی زنده</span></div>`;
  const dashMax=Math.max(1,...cards.map(([,value])=>Number(value)||0));
  $('#content').innerHTML=`<section class="role-dash" data-dash-role="${role}">${role==='sales'?'':dashHeading(`داشبورد ${esc(names[role]||'کارتابل')}`,'خلاصهٔ وضعیت جاری و دسترسی سریع به بخش‌های اصلی کارتابل',roleIcons[role]||'dashboard')}<div class="role-dash-grid">${cards.map(([label,value,target,ico,tone],i)=>{const pct=Math.max(Number(value)>0?10:0,Math.round((Number(value)||0)/dashMax*100));return `<button class="role-dash-card tone-${tone||'red'}" style="--d:${i*70}ms" data-cartable="${target}" data-role-page="${rolePage}"><span class="role-dash-top"><span class="role-dash-ico">${icon(ico||'info',22)}</span><span class="role-dash-num">۰${i+1}</span></span><span class="role-dash-label">${esc(label)}</span><strong>${qty(value)}</strong><span class="role-dash-bar" aria-hidden="true"><i style="width:${pct}%"></i></span><small>مشاهدهٔ ${esc(label)} ←</small></button>`}).join('')}${role==='sales'?`<button type="button" class="role-dash-card tone-green" data-sales-daily="sales"><span class="role-dash-top"><span class="role-dash-ico">${icon('receipt',22)}</span></span><span class="role-dash-label">فروش روز</span><strong>در حال دریافت…</strong><small>تفکیک محصولات ←</small></button><button type="button" class="role-dash-card tone-blue" data-sales-daily="orders"><span class="role-dash-top"><span class="role-dash-ico">${icon('package',22)}</span></span><span class="role-dash-label">سفارش روز</span><strong>در حال دریافت…</strong><small>تفکیک محصولات ←</small></button>`:''}</div>${role==='warehouse'?whDashLiveHtml(whToday):''}${role==='sales'?'':`<div class="role-dash-foot"><span class="role-dash-foot-live"><i></i> به‌روزرسانی خودکار وضعیت کارتابل فعال است</span><b>${esc(todayText())}</b></div>`}</section>`;
  if(role==='sales'){ await refreshSalesOverview(); if(app.page==='sales'&&app.sub.sales==='dashboard') app.timer=setInterval(refreshSalesOverview,6000); }
  // v37.11.0 — تازه‌سازی زندهٔ آمار سفارشات امروز تا وقتی داشبورد انبار باز است (هر ۵ ثانیه).
  if(role==='warehouse'){
    if(app.timer)clearInterval(app.timer);
    app.timer=setInterval(()=>{if(!$('#whDashLiveBody')){clearInterval(app.timer);app.timer=null;return}refreshWhDashToday();},5000);
  }
}

async function renderDashboard(){
  const d=await api('/api/dashboard'); const c=d.counts||{};
  $('#content').innerHTML=`
  <div class="v26-dashboard">
    <section class="v26-dashboard-hero">
      <div class="v26-hero-copy">
        <span class="eyebrow">BABOLTOYOOR / CONTROL CENTER</span>
        <h2>مرکز کنترل عملیات</h2>
        <p>نمای لحظه‌ای از ورود مشتری، فروش، انبار، تسویه و خروج؛ با تمرکز روی اقدام بعدی هر واحد.</p>
        <div class="v26-hero-actions"><button class="btn btn-primary" data-page="reports">${icon('reports',17)} گزارش مدیریتی</button><button class="btn btn-secondary" data-page="admin">${icon('settings',17)} تنظیمات</button></div>
      </div>
      <div class="v26-hero-date"><span>امروز</span><strong>${esc(todayText())}</strong><small>ساعت سیستم ${esc(formatDateTime24(serverNow()).split(' • ').pop()||'—')}</small></div>
    </section>
    <section class="v26-kpi-grid">
      ${v26Kpi('ورودی امروز',c.visitsToday||0,'مراجعه ثبت‌شده در نگهبانی','gate','red')}
      ${v26Kpi('منتظر فروش',c.waitingSales||0,'مشتری آماده ثبت سفارش','sales','blue')}
      ${v26Kpi('در صف انبار',c.pendingWarehouse||0,'سفارش آماده اقدام انبار','warehouse','orange')}
      ${v26Kpi('آماده خروج',c.readyExit||0,'فاکتور نهایی و آماده کنترل','check','green')}
      ${v26Kpi('برنامه آینده',c.remoteScheduled||0,'سفارش‌های زمان‌بندی‌شده','calendar','purple')}
    </section>
    <div class="v26-dashboard-grid">
      <section class="v26-board v26-process-board">
        <div class="v26-board-head"><div><span class="eyebrow">LIVE PROCESS</span><h3>جریان عملیات</h3><p>هر مرحله فقط یک اقدام روشن برای واحد مسئول دارد.</p></div><span class="v26-live"><i></i> به‌روزرسانی خودکار</span></div>
        <div class="v26-process-track">${[['gate','ورود','نگهبانی','مراجعه'],['sales','فروش','فروش','سفارش'],['warehouse','انبار','انبار','تحویل'],['receipt','تسویه','فروش','فاکتور'],['check','خروج','نگهبانی','تأیید خروج']].map((x,i)=>`<div class="v26-process-item"><span class="v26-process-number">۰${i+1}</span><div class="v26-process-icon">${icon(x[0],20)}</div><div><strong>${x[1]}</strong><small>${x[3]} توسط ${x[2]}</small></div></div>`).join('<span class="v26-process-line"></span>')}</div>
      </section>
      <section class="v26-board v26-recent-board">
        <div class="v26-board-head"><div><span class="eyebrow">RECENT ACTIVITY</span><h3>آخرین فعالیت‌ها</h3></div><button class="btn btn-ghost btn-sm" data-page="orders-history">مشاهده همه</button></div>
        <div class="v26-activity-list">${(d.recent||[]).map(o=>`<button type="button" class="v26-activity-row" data-sales-history-id="${esc(o.id)}" title="مشاهدهٔ پروندهٔ کامل سفارش"><span class="v26-activity-icon">${icon(o.orderType==='REMOTE'||o.orderType==='STORE'?'calendar':'receipt',16)}</span><div><strong>${esc(storeAwareOrderName(o))}</strong><small>${orderKindLabel(o)} <i>•</i> ${badge(o.status)}</small></div><time>${formatDateTime24(o.createdAt)}</time></button>`).join('')||salesEmptyV25('receipt','فعالیتی ثبت نشده است','با ثبت اولین مراجعه یا سفارش، رویدادها در اینجا دیده می‌شوند.')}</div>
      </section>
    </div>
  </div>`;
}
function v26Kpi(label,value,hint,ico,tone){return `<article class="v26-kpi v26-kpi-${tone}"><span class="v26-kpi-icon">${icon(ico,21)}</span><div><span>${esc(label)}</span><strong>${qty(value)}</strong><small>${esc(hint)}</small></div></article>`}


function renderSalesOnsiteV25(visits){
  return `<section class="v26-sales-pane">
    <section class="v26-panel">
      ${salesSectionTitle('01 / ONSITE','مشتریان حضوری','فقط مراجعانی که نگهبانی ثبت کرده و برای فروش ارسال شده‌اند.',visits.length)}
      <div class="v26-toolbar"><label class="v26-search"><span>${icon('search',18)}</span><input id="salesSearchV25" placeholder="نام، شماره تماس یا پلاک را جستجو کنید"></label><span class="v26-live"><i></i> زنده</span></div>
      <div id="salesOnsiteListV25" class="v26-list">${salesOnsiteRowsV25(visits)}</div>
    </section>
  </section>`;
}
function salesOnsiteRowsV25(visits){return visits.map(v=>`<button class="v26-customer-row" data-action="open-order" data-id="${v.id}"><span class="v26-customer-avatar">${esc(initials(v.customer?.name||''))}</span><span class="v26-customer-main"><strong>${esc(v.customer?.name||'—')}</strong><small>${esc(v.customer?.phone||'—')} <i>•</i> ${plateViewHtml(v.customer?.plate, 'بدون پلاک', true)}</small></span><span class="v26-customer-time">${formatDateTime24(v.createdAt)}</span><span class="v26-customer-action">ثبت سفارش ${icon('arrow',16)}</span></button>`).join('')||salesEmptyV25('user','صف حضوری خالی است','مراجعه جدید پس از ثبت نگهبانی در این فهرست قرار می‌گیرد.');}


function renderSalesFlowV25(orders){
  return `<section class="v26-sales-pane"><section class="v26-panel v26-flow-panel">
    ${salesSectionTitle('03 / IN PROGRESS','سفارش‌های در جریان','تمام سفارش‌هایی که به انبار ارسال شده‌اند در یک فهرست کامل و مرتب دیده می‌شوند.',orders.length)}
    <div class="v26-flow-toolbar"><span class="v26-live"><i></i> مرتب‌سازی بر اساس آخرین اقدام</span><span class="v26-legend"><i class="orange"></i> در صف انبار <i class="gray"></i> برگشت به فروش</span></div>
    <div class="v26-flow-list">${orders.map((o,idx)=>`<article class="v26-flow-card"><div class="v26-flow-index">${fa(String(idx+1).padStart(2,'0'))}</div><div class="v26-flow-main"><div class="v26-flow-top"><div><div class="v26-order-line-head"><span class="v26-order-code">${esc(fa(o.orderNo||'—'))}</span>${o.orderType==='ONSITE'?'<span class="v26-type onsite">حضوری</span>':salesKindBadge(o)}${o.scheduledAt?`<span class="v26-schedule-chip">${salesOrderDateTime(o)}</span>`:''}</div><h3>${esc(storeAwareOrderName(o))}</h3><p>${esc(storeAwareOrderPhone(o))} <i>•</i> ${esc(o.dispatchPlace||'محل ارسال ثبت نشده')}</p></div><div>${badge(o.status)}</div></div>
      <div class="v26-flow-stats"><div><span>اقلام</span><strong>${qty(activeItemsOf(o).length)}</strong></div><div><span>زمان ثبت</span><strong>${formatDateTime24(o.createdAt)}</strong></div><div><span>آخرین اقدام</span><strong>${formatDateTime24(o.updatedAt||o.createdAt)}</strong></div>${o.scheduledAt?`<div><span>زمان ارسال</span><strong>${salesOrderDateTime(o)}</strong></div>`:''}</div>
      <div class="v26-flow-products">${activeItemsOf(o).map((i,k)=>`<div class="v26-flow-product"><span class="v26-line-no">${fa(String(k+1))}</span><span class="v26-product-name">${esc(i.product?.name||'—')}</span><b>${qty(i.requestedQty)} ${esc(i.requestedUnit||'')}</b><small>${esc(i.description||'بدون توضیح')}</small></div>`).join('')||'<div class="empty">قلم فعالی ندارد.</div>'}</div>
      <div class="v26-flow-actions"><button class="btn btn-secondary" data-action="order-details" data-id="${o.id}">${icon('eye',15)} جزئیات کامل</button>${o.status==='RETURNED_TO_SALES'?`<button class="btn btn-secondary" data-action="edit-returned-order" data-id="${o.id}">${icon('edit',15)} اصلاح سفارش</button><button class="btn btn-primary" data-action="resubmit-order" data-id="${o.id}">${icon('send',15)} ارسال مجدد</button>`:''}</div>
    </div></article>`).join('')||salesEmptyV25('truck','سفارشی در جریان نیست','هر سفارشی که به انبار ارسال شود در این فهرست قرار می‌گیرد.')}</div>
  </section></section>`;
}

function renderSalesSettlementV25(orders){
  const pending=orders.filter(o=>o.status==='SETTLEMENT_PENDING'); const finalized=orders.filter(o=>['SETTLED','EXITED'].includes(o.status)||((o.payments||[]).length&&!['SETTLEMENT_PENDING','CANCELLED'].includes(o.status))); // v37.5.0 — سفارش‌های فروشگاهِ بسته‌شده با فاکتور سرویس
  return `<section class="v26-sales-pane"><div class="v26-settlement-layout"><section class="v26-panel">${salesSectionTitle('04 / SETTLEMENT','تسویه سفارش‌ها','قیمت‌گذاری، ثبت تسویه و صدور فاکتور در این بخش انجام می‌شود.',pending.length)}<div class="v26-settlement-list">${pending.map(o=>`<button class="v26-settlement-row" data-action="select-settlement" data-id="${o.id}"><span class="v26-settlement-icon">${icon('receipt',18)}</span><span class="v26-settlement-main"><strong>${esc(storeAwareOrderName(o))}</strong><small>${esc(storeAwareOrderPhone(o))} <i>•</i> ${qty(activeItemsOf(o).length)} قلم</small></span><span class="v26-settlement-time"><small>تحویل</small>${formatDateTime24(o.updatedAt||o.createdAt)}</span><span class="badge blue">آماده تسویه</span><span class="toolbar inline"><button type="button" class="btn btn-secondary btn-sm" data-action="settlement-reopen-prep" data-id="${o.id}">${icon('scale',14)} ارجاع به آماده‌سازی</button>${icon('arrow',17)}</span></button>`).join('')||salesEmptyV25('receipt','صف تسویه خالی است','بعد از تأیید تحویل در انبار، سفارش در این بخش قرار می‌گیرد.')}</div></section>
  <section class="v26-panel">${salesSectionTitle('INVOICE & EXIT','فاکتور و تأییدیه خروج','فاکتورهای نهایی و وضعیت ارسال تأیید خروج برای نگهبانی.',finalized.length)}<div class="v26-invoice-list">${invoiceRowsV27(finalized)}</div></section></div></section>`;
}


function renderProductPickerLine(x,i,prefix='sales'){
  const idx=String(i);
  if(prefix==='future') return renderFutureLineRow(x,i);
  return `<article class="v26-product-line op-line" data-line="${idx}">
    <span class="v26-product-index">${fa(String(i+1).padStart(2,'0'))}</span>
    <div class="v26-product-line-main">
      <div class="field op-product-field"><label>محصول <small>نام یا کد سریع دو رقمی</small></label><div class="input-shell v26-input"><span>${icon('search',17)}</span><input data-op-product-search="${prefix}-${idx}" aria-label="محصول ردیف ${fa(String(i+1))}" value="${esc(x.productLabel||'')}" placeholder="مثلاً 01 یا مرغ بسته‌بندی" autocomplete="off"></div><div class="product-suggest" data-op-suggest="${prefix}-${idx}"></div><div class="v26-product-picked">${x.productId?`<span>انتخاب شد</span>`:'هنوز محصول انتخاب نشده است'}</div></div>
      <div class="field"><label>مقدار درخواستی <small>عدد / وزن</small></label><div class="input-shell v26-input quantity-shell"><input data-op-qty="${prefix}-${idx}" aria-label="مقدار ردیف ${fa(String(i+1))}" inputmode="decimal" value="${esc(x.requestedQty||'')}" placeholder="۰٫۰۰۰"></div></div>
      <div class="field"><label>واحد</label><div class="input-shell v26-input"><select data-op-unit="${prefix}-${idx}" aria-label="واحد ردیف ${fa(String(i+1))}"><option ${x.requestedUnit==='کیلوگرم'?'selected':''}>کیلوگرم</option><option ${x.requestedUnit==='بسته'?'selected':''}>بسته</option><option ${x.requestedUnit==='عدد'?'selected':''}>عدد</option><option ${x.requestedUnit==='کارتن'?'selected':''}>کارتن</option></select></div></div>
      <div class="field op-desc"><label>توضیحات ردیف <small>برای انبار و تحویل</small></label><div class="input-shell v26-input v26-textarea"><textarea data-op-desc="${prefix}-${idx}" aria-label="توضیح ردیف ${fa(String(i+1))}" rows="2" maxlength="500" placeholder="توضیح بسته‌بندی، نحوه تحویل یا نکته مشتری...">${esc(x.description||'')}</textarea></div></div>
    </div>
    <button type="button" class="v26-delete-line" data-action="op-remove-line" data-prefix="${prefix}" data-draft-key="${({remote:'remoteDraft',phone:'phoneDraft',future:'futureDraft',store:'storeDraft',storeedit:'storeEditDraft',sales:'orderDraft',onsite:'orderDraft'})[prefix]||'orderDraft'}" data-index="${idx}" title="حذف ردیف">${icon('trash',16)}</button>
  </article>`;
}

async function openOrder(visitId){
  try{
    const visits=(await api('/api/visits')).visits||[]; const v=visits.find(x=>x.id===visitId); if(!v)return;
    app.orderDraft=[defaultOrderLine()];
    $('#content').innerHTML=renderSalesTabsV29('onsite')+`<section id="orderEntryPage" class="v26-order-entry"><section class="v26-form-banner"><div class="v26-banner-main"><button class="btn btn-secondary" data-action="back-order-intake">${icon('arrow',16)} بازگشت به ورودی‌ها</button><div><span class="eyebrow">ONSITE ORDER / NEW</span><h2>ثبت سفارش مشتری حضوری</h2><p>سفارش را با ردیف‌های استاندارد و اطلاعات کامل ثبت کنید.</p></div></div><div class="v26-banner-actions"><span class="badge orange">در انتظار ثبت سفارش</span><button class="btn btn-primary btn-lg" data-action="submit-order" data-id="${visitId}">${icon('send',18)} ثبت و ارسال به انبار</button></div></section>
    <section class="v26-customer-card"><span class="v26-customer-avatar large">${esc(initials(v.customer?.name||''))}</span><div class="v26-customer-identity"><span>مشتری</span><strong>${esc(v.customer?.name||'—')}</strong><small>${esc(v.customer?.phone||'—')} <i>•</i> ${plateViewHtml(v.customer?.plate, 'بدون پلاک', true)} <i>•</i> ورود ${formatDateTime24(v.createdAt)}</small></div><div class="v26-order-stage"><span class="done">۱ مشتری</span><i></i><span class="active">۲ سفارش</span><i></i><span>۳ انبار</span></div></section>
    <div class="v26-order-layout"><section class="v26-panel v26-form-panel"><div class="v26-items-head"><div><span class="eyebrow">ORDER ITEMS</span><h3>اقلام سفارش</h3><p>هر ردیف یک واحد اطلاعاتی کامل و مستقل است.</p></div><span class="v26-helper">کیلوگرم / بسته / عدد / کارتن</span></div><div id="orderLines" class="v26-product-lines"></div><div class="v26-add-line-row"><button class="btn btn-secondary btn-lg" data-action="add-line">${icon('plus',17)} افزودن ردیف محصول</button><span>برای حذف یک ردیف از آیکن سطل زباله استفاده کنید.</span></div></section></div></section>`;
    renderOrderLines(); updateOrderDraftSummary();
  }catch(e){toast(e.message)}
}
function renderOrderLines(){
  const box=$('#orderLines'); if(!box)return;
  box.innerHTML=app.orderDraft.map((x,i)=>`<article class="v26-product-line order-line" data-line="${i}"><span class="v26-product-index">${fa(String(i+1).padStart(2,'0'))}</span><div class="v26-product-line-main"><div class="field product-box"><label>محصول <small>نام یا کد سریع دو رقمی</small></label><div class="input-shell v26-input"><span>${icon('search',17)}</span><input data-product-search="${i}" value="${esc(x.productLabel||'')}" placeholder="مثلاً 01 یا مرغ بسته‌بندی" autocomplete="off"></div><div class="product-suggest" data-suggest-for="${i}"></div><div class="v26-product-picked">${x.productId?`<span>انتخاب شد</span>`:'هنوز محصول انتخاب نشده است'}</div></div><div class="field"><label>مقدار درخواستی</label><div class="input-shell v26-input"><input data-qty="${i}" inputmode="decimal" value="${esc(x.requestedQty||'')}" placeholder="۰٫۰۰۰"></div></div><div class="field"><label>واحد درخواست</label><div class="input-shell v26-input"><select data-unit="${i}"><option ${x.requestedUnit==='کیلوگرم'?'selected':''}>کیلوگرم</option><option ${x.requestedUnit==='بسته'?'selected':''}>بسته</option><option ${x.requestedUnit==='عدد'?'selected':''}>عدد</option><option ${x.requestedUnit==='کارتن'?'selected':''}>کارتن</select></div></div><div class="field order-description-field"><label>توضیحات ردیف</label><div class="input-shell v26-input v26-textarea"><textarea data-description="${i}" rows="2" maxlength="500" placeholder="توضیح برای انبار یا نحوه بسته‌بندی...">${esc(x.description||'')}</textarea></div></div></div><button class="v26-delete-line" data-action="remove-line" data-index="${i}" aria-label="حذف ردیف">${icon('trash',16)}</button></article>`).join('');
  $$('#orderLines [data-product-search]').forEach(inp=>inp.addEventListener('input',()=>productSearch(inp.dataset.productSearch,inp.value)));
  $$('#orderLines [data-qty]').forEach(inp=>inp.addEventListener('input',()=>{app.orderDraft[Number(inp.dataset.qty)].requestedQty=inp.value;updateOrderDraftSummary()}));
  $$('#orderLines [data-unit]').forEach(sel=>sel.addEventListener('change',()=>{app.orderDraft[Number(sel.dataset.unit)].requestedUnit=sel.value;updateOrderDraftSummary()}));
  $$('#orderLines [data-description]').forEach(inp=>inp.addEventListener('input',()=>{app.orderDraft[Number(inp.dataset.description)].description=inp.value;}));
}
function updateOrderDraftSummary(){const box=$('#orderDraftSummary');if(!box)return;const valid=(app.orderDraft||[]).filter(x=>x.productId&&n(x.requestedQty)>0);const total=valid.reduce((s,x)=>s+n(x.requestedQty),0);box.innerHTML=`<div class="v26-summary-stat"><span>قلم معتبر</span><strong>${qty(valid.length)}</strong></div><div class="v26-summary-stat"><span>مجموع مقدار</span><strong>${qty(total)}</strong></div><div class="v26-summary-list">${valid.map(x=>`<div><span>${esc(x.productLabel||'')}</span><strong>${qty(x.requestedQty)} ${esc(x.requestedUnit||'')}</strong></div>`).join('')||'<div class="empty">هنوز قلم معتبری ثبت نشده است.</div>'}</div>`}

/* ================================================================
   v27 performance patch — instant sales desk navigation / lighter live refresh
   ================================================================ */
app.salesCache = app.salesCache || {orders:[], visits:[], dispatchDeliveries:{active:[],pending:[],finalized:[],finalizedTotal:0}, fetchedAt:0};
app.salesFetchPromise = null;

// Read all pages rather than comparing a complete workload with only the first 100 rows.
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
  const body=rows.map(o=>{
    const name=storeAwareOrderName(o),number=fa(o.orderNo||'—');
    const description=`${name}، شماره سفارش ${number}، تاریخ ${formatDateTime24(o.createdAt)}، ${qty(activeItemsOf(o).length)} قلم، آماده تسویه`;
    return `<tr class="stl-queue-row" data-settlement-id="${esc(o.id)}" data-action="select-settlement" data-id="${esc(o.id)}" title="${esc(description)}" aria-label="${esc(description)}">
      <td data-label="نام مشتری"><span class="bt-cell-main">${esc(name)}</span><span class="bt-cell-sub">${esc(storeAwareOrderPhone(o))}</span></td>
      <td data-label="شماره سفارش"><bdi>${esc(number)}</bdi></td>
      <td data-label="تاریخ">${formatDateTime24(o.createdAt)}</td>
      <td data-label="اقلام">${qty(activeItemsOf(o).length)} قلم</td>
      <td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-primary btn-sm" data-action="select-settlement" data-id="${esc(o.id)}">${icon('eye',14)} تسویه</button><button type="button" class="btn btn-secondary btn-sm" data-action="settlement-reopen-prep" data-id="${esc(o.id)}">${icon('scale',14)} آماده‌سازی</button></td>
    </tr>`;
  }).join('');
  return `<div class="bt-table-wrap"><table class="bt-table stl-queue-table"><thead><tr><th>نام مشتری</th><th>شماره سفارش</th><th>تاریخ</th><th>اقلام</th><th>عملیات</th></tr></thead><tbody>${body||`<tr><td colspan="5">${salesEmptyV25('receipt','صف تسویه خالی است','بعد از تأیید تحویل در انبار، سفارش در این بخش قرار می‌گیرد.')}</td></tr>`}</tbody></table></div>`;
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
    gate:[['entry','ورود','entry',null],['waiting','در انتظار','bell','gateEntry'],['exit','خروج','exitDoor','gateExit'],['dispatch','پخش','truck','gateDispatchPending'],['history','سوابق','history',null],['reports','گزارش','reports',null]],
    sales:[['dashboard','داشبورد','dashboard',null],['onsite','حضوری','user','salesIntake'],['remote','غیرحضوری','phone','salesRemote'],['stores','فروشگاه','store','store'],['settlement','تسویه','receipt','salesSettlement'],['delivery','پخش','truck',null],['flow','درجریان','flow','salesFlow'],['future','سفارش آتی','calendar','salesFuture'],['history','سوابق','history',null],['customers','مشتریان','users',null],['products','محصولات','package',null],['reports','گزارش','reports',null]],
    warehouse:[['dashboard','داشبورد','dashboard',null],['incoming','ورودی','inbox','warehouseIncomingRegular'],['preparing','تحویل','scale','warehousePreparingRegular'],['stores','فروشگاه','store','warehouseStores'],['document-edits','اصلاح','edit',null],['returns','مرجوعی','receipt',null],['history','سوابق','history',null],['reports','گزارش','reports',null]],
    dispatch:[['dashboard','داشبورد','dashboard',null],['transport-resources','رانندگان و خودروها','driver',null],['transport-fleet','خودروهای پخش','truck',null],['orders','سفارشات','route','dispatchPending'],['reports','گزارشات','reports',null]],
    store:[['dashboard','داشبورد','dashboard',null],['create','سفارش کلی','clipboard',null],...(app.features?.partialStoreOrders?[['partial','سفارشات جزئی','clipboard',null]]:[]),['registered','ثبت‌شده','history',null],['delivery','تحویل','truck',null],['reports','گزارشات','reports',null]],
    driver:[['dashboard','کارتابل راننده','driver','driverOpen'],['reports','گزارش‌ها','reports',null]]
  };
  if(r==='admin'){
    if(app.adminActiveRole&&entries[app.adminActiveRole]){
      const role=app.adminActiveRole,railPage=role==='dispatch'?'drivers':role;
      const list=entries[role];
      const selected=key=>(app.sub?.[railPage]||'dashboard')===key||(role==='warehouse'&&key==='preparing'&&app.sub?.warehouse==='delivered');
      $('#railNav').innerHTML=`<button type="button" class="cartable-nav-home" data-admin-home><span class="nav-icon">${icon('arrow',18)}</span><span class="nav-label">بازگشت به کارتابل‌ها</span></button><div class="cartable-nav-title">${esc(ROLE[role]||role)}</div>`+list.map(([key,label,ico,badgeKey])=>`<button type="button" class="cartable-nav-item ${selected(key)?'active':''}" data-cartable="${key}" data-role-page="${railPage}"><span class="nav-icon">${icon(ico,19)}</span><span class="nav-label">${label}</span>${((count)=>count?navBadge(count):'')(navUnread(role,key)+(role==='warehouse'&&key==='preparing'?navUnread(role,'delivered'):0))}</button>`).join('');return;
    }
    const items=[['dashboard','داشبورد مدیر','dashboard',0],['gate','کارتابل نگهبانی','shield',navUnread('gate')],['sales','کارتابل فروش','sales',navUnread('sales')],['warehouse','کارتابل انبار','warehouse',navUnread('warehouse')],['dispatch','کارتابل ترابری','truck',navUnread('dispatch')],['store','کارتابل فروشگاه','store',navUnread('store')],['reports','گزارش‌ها','reports',0],['customers','مشتریان','users',0],['users','کاربران','user',0],['store-branches','شعب فروشگاه','store',0],['payment-devices','دستگاه‌های پوز','pos',0],['orders-history','سوابق کامل سفارش‌ها','history',0],['activity','سوابق فعالیت','activity',0],['backups','پشتیبان‌گیری و بازیابی','settings',0],['admin','تنظیمات سیستم','settings',0]];
    $('#railNav').innerHTML='<div class="cartable-nav-title admin-root-title">مدیریت سامانه</div>'+items.map(([p,l,i,c])=>p==='gate'||p==='sales'||p==='warehouse'||p==='dispatch'||p==='store'?`<button type="button" class="cartable-nav-item" data-admin-cartable="${p}"><span class="nav-icon">${icon(i,19)}</span><span class="nav-label">${l}</span>${c?navBadge(c):''}</button>`:`<button type="button" class="cartable-nav-item ${app.page===p?'active':''}" data-page="${p}"><span class="nav-icon">${icon(i,19)}</span><span class="nav-label">${l}</span>${c?navBadge(c):''}</button>`).join('');return;
  }
  const list=entries[r]||[['dashboard','داشبورد','dashboard'],['reports','گزارش‌ها','reports']];
  const sub=app.sub?.[page]||'dashboard';
  $('#railNav').innerHTML=`<div class="cartable-nav-title">${esc(ROLE[r]||'کارتابل')}</div>`+list.map(([key,label,ico,badgeKey])=>{
    // The internal legacy dispatch tab may remain selected while another
    // cartable page is open; only the current section selects a rail item.
    const active=sub===key || (r==='warehouse'&&key==='preparing'&&sub==='delivered');
    const count=navUnread(r,key)+(r==='warehouse'&&key==='preparing'?navUnread(r,'delivered'):0);
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

async function quickSendStoreOrder(button,fromDetails=false){
  if(button.disabled)return;
  if(!confirm(app.features?.experimentalTransport?'سفارش فروشگاهی اکنون به انبار و ترابری ارسال شود؟ سفارش زمان‌دار تا موعد مقرر ارسال نمی‌شود.':'این سفارش فروشگاهی بدون انتظار برای زمان‌بندی، همین حالا به صف انبار ارسال شود؟'))return;
  button.disabled=true;
  try{
    const result=await api('/api/store/orders/'+encodeURIComponent(button.dataset.id)+'/quick-send',{method:'POST',body:JSON.stringify(app.features?.experimentalTransport?{transportWorkflow:true}:{})});
    if(fromDetails)closeModal();
    toast(result.order?.status==='WAREHOUSE_PENDING'?(result.order.transportWorkflow===1?'سفارش به انبار و ترابری ارسال شد.':'سفارش با موفقیت به صف انبار ارسال شد.'):'ارسال سریع ثبت شد.');
    await fetchSalesCache(true);await renderSales('stores');await refreshIndicators();
  }catch(err){button.disabled=false;toast(err.message||'ارسال سریع انجام نشد.');}
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
    if(a==='cancel-onsite')return cancelOnsiteVisit(el.dataset.id,el);
    if(a==='open-order')return openOrder(el.dataset.id);
    if(a==='back-order-intake'){app.orderDraft=[];return renderSales('onsite');}
    if(a==='submit-order')return submitOrder(el.dataset.id);
    if(a==='order-details')return openOrderDetails(el.dataset.id);
    if(a==='pickup-date')return pickupChangeDate(el.dataset.id);
    if(a==='pickup-approve')return pickupApprove(el.dataset.id,el);
    if(a==='edit-returned-order')return openReturnedOrderEditor(el.dataset.id);
    if(a==='resubmit-order')return resubmitOrder(el.dataset.id);
    if(a==='transport-sales-work')return goTransportSalesWork(el.dataset.id);
    if(a==='recover-no-goods'){
      if(!confirm('آیا اسناد و وضعیت سفارش را بررسی کرده‌اید و تأیید می‌کنید هیچ کالایی تحویل نشده است؟ سفارش برای تعیین تکلیف به فروش برمی‌گردد؛ بیعانه خودکار مسترد نمی‌شود.'))return;
      el.disabled=true;
      try{await api('/api/orders/'+encodeURIComponent(el.dataset.id)+'/recover-no-goods',{method:'POST',body:JSON.stringify({confirmedNoGoods:true})});toast('سفارش برای تعیین تکلیف به جریان فروش برگشت.');await fetchSalesCache(true);await renderSales('settlement');await refreshIndicators();}
      catch(err){el.disabled=false;toast(err.message);}
      return;
    }
    if(a==='select-settlement')return selectSettlement(el.dataset.id);
    if(a==='back-settlement')return renderSales('settlement');
    if(a==='settlement-reopen-prep')return reopenSettlementToWarehouse(el.dataset.id);
    if(a==='final-settle')return finalSettle(el.dataset.id);
    if(a==='fingerprint-capture')return fingerprintCapture();
    if(a==='clear-signature'){clearSignature();return;}
    if(a==='invoice')return previewInvoice(el.dataset.id,Number(el.dataset.run)||null);
    if(a==='print-invoice')return printInvoice(el.dataset.id,Number(el.dataset.run)||null);
    if(a==='transport-invoice-open')return selectSettlement(el.dataset.id); // v37.6.1 — ردیف فاکتور صادرشدهٔ پخش
    if(a==='transport-shipment-print')return transportShipmentNotePrint(el.dataset.id); // v37.6.1
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
    if(a==='store-addition-open')return openStoreAdditionReview(el.dataset.id,el.dataset.request,'sales');
    if(a==='sales-edit-store-order')return openSalesStoreOrderEdit(el.dataset.id);
    if(a==='store-approve-v25')return openStoreApprovalV25(el.dataset.id);
    if(a==='store-quick-send-v40')return quickSendStoreOrder(el);
    if(a==='store-order-details-v25')return openOrderDetails(el.dataset.id,{storeProcessing:el.closest('[data-store-section]')?.dataset.storeSection==='processing'});
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
    const p=pane.querySelector('.v26-settlement-list'); if(p)p.innerHTML=settlementPendingRowsV27(salesSettlementPendingOrders(all));
    const noGoods=pane.querySelector('.sales-no-goods-list'); if(noGoods)noGoods.innerHTML=salesNoGoodsRows(all);
    const i=pane.querySelector('.v26-invoice-list'); if(i)i.innerHTML=invoiceRowsV27(salesSettlementIssuedOrders(all));
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
      if(app.page==='sales'&&app.sub.sales===tab){paintSalesPaneV29(tab,data);salesRefreshWarning(tab,false);refreshSalesLiveWeightModal(data);}
    }catch{if(app.page==='sales'&&app.sub.sales===tab){salesRefreshWarning(tab,true);refreshSalesLiveWeightModal(null,true);}}
  },8000);
}

function renderSales(tab='onsite'){
  if(!SALES_TABS_V29.includes(tab))tab='onsite';
  app.sub.sales=tab;
  if(app.page==='sales')renderNav();
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

async function cancelOnsiteVisit(id,button){
 const reason=prompt('دلیل لغو مراجعه یا سفارش را وارد کنید:');
 if(reason===null)return;
 if(!reason.trim())return toast('دلیل لغو الزامی است.');
 if(!confirm('آیا مطمئن هستید هیچ کالایی به مشتری تحویل نشده است؟ مراجعه برای ثبت خروج بدون کالا به نگهبانی ارجاع می‌شود.'))return;
 if(button.disabled)return;button.disabled=true;
 try{await api('/api/visits/'+encodeURIComponent(id)+'/cancel-onsite',{method:'POST',body:JSON.stringify({reason:reason.trim(),confirmedNoGoods:true})});toast('لغو ثبت شد؛ مشتری برای خروج بدون کالا به نگهبانی مراجعه کند.');app.orderDraft=[];await fetchSalesCache(true);await renderSales(app.sub.sales);}
 catch(e){toast(e.message);}finally{button.disabled=false;}
}
function stlReset(){ app.stl = {previousBalance:null,orderId:null, order:null, items:[], prices:[], priceMap:Object.create(null), drivers:[], devices:[], discountAmount:0, additionsAmount:0, sig:false, fp:'', manual:false, busy:false, dispatchBusy:false, paymentRows:[{type:'CASH',amount:''}]}; Object.assign(stl, app.stl); app.selectedSettlement=null; }
function stlPrice(v){ return Number(en(String(v ?? '')).replace(/[^0-9]/g,'')) || 0; }
function stlFmtPrice(v){ return v ? new Intl.NumberFormat('fa-IR').format(v) : ''; }
function stlFormatPriceInput(input){
  const raw=input.value, caret=input.selectionStart ?? raw.length;
  const digitsBefore=en(raw.slice(0,caret)).replace(/[^0-9]/g,'').length;
  const digits=en(raw).replace(/[^0-9]/g,'');
  input.value=digits ? stlFmtPrice(stlPrice(digits)) || '۰' : '';
  let position=0,count=0;
  while(position<input.value.length && count<digitsBefore){
    if(/[0-9]/.test(en(input.value[position]))) count++;
    position++;
  }
  input.setSelectionRange(position,position);
}
function stlActive(it){ return !it.voided && !it.skip; }
// اقلام ناموجود انبار در فاکتور و فرم تسویه نمایش داده نمی‌شوند (قیمتی هم ندارند).
function stlBilledItems(){ return stl.items.filter(it=>!it.outOfStock); }
function stlSubtotal(){ return stl.items.filter(stlActive).reduce((s,i)=>s+Math.round(i.delivered*i.price),0); }
function stlTotal(){ return stlSubtotal()-Number(stl.discountAmount||0)+Number(stl.additionsAmount||0); }
function stlDeposit(){return stl.order?.deposit?.status==='RECEIVED'?Number(stl.order.deposit.amount||0)-Number(stl.order.deposit.refundedAmount||0):0;}
function stlDue(){return stlTotal()-stlDeposit();}
function stlAdjustmentsHtml(o){
 const locked=o.dispatch?.priceApprovedAt?'disabled':'';
 return `<div class="stl-adjustments stl-money-summary"><div class="stl-summary-line"><span>جمع اقلام</span><b id="stlSubtotalAmount">${money(stlSubtotal())}</b></div><label>تخفیفات (ریال)<input class="stl-input" type="text" inputmode="numeric" data-stl-adjust="discountAmount" value="${esc(stlFmtPrice(stl.discountAmount))}" ${locked} placeholder="۰"></label><label>اضافات (ریال)<input class="stl-input" type="text" inputmode="numeric" data-stl-adjust="additionsAmount" value="${esc(stlFmtPrice(stl.additionsAmount))}" ${locked} placeholder="۰"></label><div class="stl-summary-line stl-summary-grand"><span>مبلغ نهایی فاکتور</span><b id="stlTotalAmount">${money(stlTotal())}</b></div>${stlDeposit()?`<div class="stl-summary-line"><span>بیعانه پس از استرداد</span><b id="stlDepositAmount">${money(stlDeposit())}</b></div><div class="stl-summary-line"><span>مانده قابل دریافت</span><b id="stlDueAmount">${money(stlDue())}</b></div><div class="deposit-excess" id="stlDepositExcess" hidden><span>بیعانه بیش از مبلغ فاکتور است؛ ابتدا اضافه‌پرداخت را دستی برگردانید.</span><button type="button" class="btn btn-secondary btn-sm" data-stl="refund-deposit-excess">ثبت استرداد دستی اضافه‌پرداخت</button></div>`:''}</div>`;
}
function stlKg(){ return stl.items.filter(stlActive).reduce((s,i)=>s+i.delivered,0); }
function stlItemsOf(o, prices){
  const map = Object.fromEntries((prices||[]).map(x=>[x.productId, Number(x.price)]));
  return (o.items||[]).map(i=>{
    const status = i.itemStatus || 'PENDING';
    const voided = status === 'CANCELLED';
    const delivered = Number(i.deliveredKg || 0);
    const hasListedPrice=Object.hasOwn(map,i.productId);
    const listedPrice = Number(map[i.productId] ?? 0);
    const savedPrice = Number(i.unitPrice || 0);
    // An explicitly registered zero is not a missing price: do not silently
    // revive a stale item price. Sales must enter a positive settlement price.
    const price = hasListedPrice ? listedPrice : (savedPrice > 0 ? savedPrice : 0);
    return { id:i.id, productId:i.productId, name:i.product?.name || i.productId || 'کالا', status, voided, skip:false, delivered, outOfStock: !voided && (status === 'OUT_OF_STOCK' || delivered <= 0), price, warehouseNote: String(i.warehouseNote||''), warehouseNoteByName: String(i.warehouseNoteByName||'') };
  });
}
// A compact, read-only row of all available customer details (shared by warehouse/sales).
function orderCustomerFields(o){
  const c=o.customer||{},v=o.visit||{};
  const plate=typeof formatDispatchVehiclePlate==='function'?formatDispatchVehiclePlate(c.plate,'بدون پلاک'):(c.plate||'بدون پلاک');
  const fields=[['نام مشتری',c.name||o.storeName||'—'],['کد مشتری',c.code||'—'],['شماره تماس',c.phone||'—'],['پلاک',plate],['نوع وسیله',c.vehicleType||v.vehicleType||'—'],['محل ارسال',o.dispatchPlace||'—'],['شماره سفارش',o.orderNo||'—']];
  for(const [label,value] of [['شماره دوم',c.phone2],['کد ملی',c.nationalId],['شرکت / واحد',c.company],['نشانی مشتری',c.address],['یادداشت مشتری',c.notes]]){
    if(value&&String(value).trim())fields.push([label,value]);
  }
  return fields;
}
function orderCustomerStripHtml(o,settlement=false,labels=null){
  let fields=orderCustomerFields(o).map(([label,value])=>[label,label==='شماره سفارش'?fa(value):value]).filter(([label])=>!settlement||!['نوع وسیله','پلاک','محل ارسال'].includes(label));
  if(labels)fields=labels.flatMap(label=>fields.filter(field=>field[0]===label));
  return `<div class="bt-customer-strip-scroll" role="region" aria-label="مشخصات مشتری" tabindex="0"><div class="bt-customer-strip" style="--customer-fields:${fields.length}">${fields.map(([label,value])=>`<div class="bt-customer-field" tabindex="0" title="${esc(label)}: ${esc(value)}" aria-label="${esc(label)}: ${esc(value)}"><b>${esc(label)}</b><span>${label==='پلاک'?plateViewHtml(o.customer?.plate,'بدون پلاک',true):esc(value)}</span></div>`).join('')}</div></div>`;
}
function stlDispatchControls(o,returnControl=''){
  if(o.transportWorkflow===1&&o.deliveryMode==='PICKUP')return `<div class="stl-dispatch-control">${returnControl}<span>تحویل در انبار؛ ارسال به پخش مجاز نیست.</span></div>`;
  if(o.deposit)return `<div class="stl-dispatch-control deposit-dispatch-block">${returnControl}<span class="deposit-dispatch-message">سفارش بیعانه‌دار به پخش ارسال نمی‌شود.</span></div>`;
  const d=o.dispatch||null;
  if(d && !['PENDING_ASSIGN','ASSIGNED'].includes(d.status)) return `<span class="badge blue">${esc(dispatchStatusLabel(d.status))}</span>`;
  const drivers=Array.isArray(stl.drivers)?stl.drivers:[];
  const options=drivers.map(x=>`<option value="${esc(x.id)}" ${x.id===d?.driverId?'selected':''}>${esc(x.fullName)} — ${esc(formatDispatchVehiclePlate(x.plate,'بدون پلاک'))}</option>`).join('');
  const actionLabel=d?.priceApprovedAt?'تغییر راننده':'تأیید قیمت و ارسال';
  const hint=drivers.length?'':'<small class="stl-dispatch-hint">رانندهٔ فعالی پیدا نشد؛ ابتدا راننده را در مدیریت فعال کنید.</small>';
  return `<div class="stl-dispatch-control"><select class="adm-select" data-stl-driver aria-label="انتخاب راننده برای سفارش"><option value="">انتخاب راننده فعال…</option>${options}</select>${returnControl}<button type="button" class="btn btn-primary btn-sm" data-stl="send-dispatch">${icon('send',14)} ${actionLabel}</button><span data-stl-plate>${plateViewHtml(drivers.find(x=>x.id===d?.driverId)?.plate,'—',true)}</span>${hint}</div>`;
}
// Shared by the live UI layer and the fallback settlement renderer.
function stlFooterHtml(o){
  const dispatched=!!o.dispatch;
  const returnControl=dispatched?'':`<button type="button" class="btn btn-secondary" data-stl="reopen">${icon('scale',15)} برگشت به انبار</button>`;
  const canCancel=!dispatched&&o.deliveryMode!=='DELIVERY'&&!!o.visitId&&(o.orderType==='ONSITE'||(o.orderType==='REMOTE'&&o.deliveryMode==='PICKUP'));
  return `<footer class="stl-actions stl-actions-bottom"><div class="stl-footer-scroll"><div class="stl-primary-actions">
    ${stlDispatchControls(o,returnControl)}
    ${canCancel?'<button type="button" class="btn btn-secondary" data-stl="cancel-purchase">انصراف از خرید و ارجاع به انبار</button>':''}
    ${dispatched?'':`<button type="button" class="stl-submit" id="stlSubmitBtn" data-stl="submit">${icon('receipt',18)} تأیید و صدور فاکتور</button>`}
  </div></div>${dispatched?`<div class="stl-dispatch-lock"><b>مرحلهٔ بعد</b><span>تأیید خروج راننده توسط نگهبان؛ سپس ثبت تحویل و بازبینی نهایی فروش در تب پخش.</span></div>`:''}</footer>`;
}
function stlEmptyHtml(){ return `<div class="stl-empty"><div class="stl-empty-ico">${icon('receipt',24)}</div><b>یک سفارش از فهرست انتخاب کنید</b><span>بعد از انتخاب، اقلام، قیمت‌ها و ثبت تسویه در این بخش انجام می‌شود.</span></div>`; }
// v37.6.1 — همان مرزِ لایهٔ زنده (ui2) در رندر پشتیبان هم رعایت می‌شود: با چاپ برگهٔ ارسال،
// فاکتور صادرشده است و سفارش از صف تسویه به فهرست فاکتورهای صادرشده می‌رود.
function salesTransportInvoiceIssued(o){const inv=o&&o.transportInvoice;return !!inv&&(inv.status==='CLOSED'||!!inv.printedAt);}
function salesNoGoodsLegacy(o){const items=(o?.items||[]).filter(i=>i.itemStatus!=='CANCELLED');return o?.status==='SETTLEMENT_PENDING'&&!o.transportInvoice&&items.length>0&&items.every(i=>i.itemStatus==='OUT_OF_STOCK'&&i.warehouseStatus==='OUT_OF_STOCK'&&i.deliveredKg!=null&&Number(i.deliveredKg)===0);}
function salesSettlementPendingOrders(orders){return (orders||[]).filter(o=>o.status==='SETTLEMENT_PENDING'&&!salesTransportInvoiceIssued(o)&&!salesNoGoodsLegacy(o));}
function salesNoGoodsRows(orders){const rows=(orders||[]).filter(salesNoGoodsLegacy);return rows.length?`<section class="sd-panel"><h3>سفارش‌های قدیمی بدون کالای تحویلی — نیازمند بررسی</h3><p>این سفارش‌ها قابل تسویه نیستند. پس از بررسی کالا و اسناد، آنها را برای تعیین تکلیف به فروش برگردانید.</p><div class="bt-table-wrap"><table class="bt-table"><thead><tr><th>مشتری</th><th>شماره سفارش</th><th>عملیات</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${esc(storeAwareOrderName(o))}</td><td>${esc(fa(o.orderNo||'—'))}</td><td><button type="button" class="btn btn-secondary btn-sm" data-action="recover-no-goods" data-id="${esc(o.id)}">بررسی و بازگشت به فروش</button></td></tr>`).join('')}</tbody></table></div></section>`:'';}
function salesSettlementIssuedOrders(orders){return (orders||[]).filter(o=>['SETTLED','EXITED'].includes(o.status)||((o.payments||[]).length&&!['SETTLEMENT_PENDING','CANCELLED'].includes(o.status)&&!o.payment?.archived)||salesTransportInvoiceIssued(o));}
function renderSalesSettlementV25(orders){
  const pending = salesSettlementPendingOrders(orders);
  const finalized = salesSettlementIssuedOrders(orders); // v37.5.0 — فاکتور هر سرویس هم در فهرست است
  return `<section class="v26-sales-pane stl-pane">
    <div class="stl-layout">
      <aside class="stl-queue"><div class="stl-block-head"><span class="stl-eyebrow">04 / SETTLEMENT</span><h2>سفارش‌های آماده تسویه</h2></div><div class="v26-settlement-list stl-queue-list">${settlementPendingRowsV27(pending)}</div></aside>
      <section class="stl-main" id="stlMain">${stl.orderId ? '' : stlEmptyHtml()}</section>
    </div>
    <div class="sales-no-goods-list">${salesNoGoodsRows(orders)}</div>
    <section class="stl-done"><div class="stl-block-head"><span class="stl-eyebrow">INVOICE & EXIT</span><h2>فاکتورهای صادرشده</h2></div><div class="v26-invoice-list">${invoiceRowsV27(finalized)}</div></section>
  </section>`;
}
function settlementPendingRowsV27(rows){
  const body=rows.map(o=>{
    const name=storeAwareOrderName(o),number=fa(o.orderNo||'—');
    const description=`${name}، شماره سفارش ${number}، تاریخ ${formatDateTime24(o.createdAt)}، ${qty(activeItemsOf(o).length)} قلم، آماده تسویه`;
    return `<tr class="stl-queue-row ${stl.orderId===o.id?'active':''}" data-action="select-settlement" data-id="${esc(o.id)}" title="${esc(description)}" aria-label="${esc(description)}">
      <td data-label="نام مشتری"><span class="bt-cell-main">${esc(name)}</span></td>
      <td data-label="شماره سفارش"><bdi>${esc(number)}</bdi></td>
      <td data-label="تاریخ">${formatDateTime24(o.createdAt)}</td>
      <td data-label="اقلام">${qty(activeItemsOf(o).length)} قلم</td>
      <td data-label="عملیات" class="bt-col-actions"><button type="button" class="btn btn-primary btn-sm" data-stl="select" data-action="select-settlement" data-id="${esc(o.id)}">تسویه</button></td>
    </tr>`;
  }).join('');
  return `<div class="bt-table-wrap"><table class="bt-table stl-queue-table"><thead><tr><th>نام مشتری</th><th>شماره سفارش</th><th>تاریخ</th><th>اقلام</th><th>عملیات</th></tr></thead><tbody>${body||'<tr><td colspan="5"><div class="stl-q-empty">سفارشی در انتظار تسویه نیست.</div></td></tr>'}</tbody></table></div>`;
}
function stlRowHtml(it){
  const priceLocked = !!stl.order?.dispatch?.priceApprovedAt;
  const dis = (it.voided || it.skip || it.outOfStock || priceLocked) ? 'disabled' : '';
  const note = it.voided ? 'لغو شده در انبار' : (it.outOfStock ? 'ناموجود در انبار' : (priceLocked ? 'قیمت توسط فروش تأیید شده' : ''));
  const needs = stlActive(it) && it.delivered > 0 && !(it.price > 0);
  return `<div class="stl-row ${it.voided?'is-void':''} ${it.skip?'is-skip':''} ${needs?'needs-price':''}" data-stl-row="${esc(it.id)}">
    <div class="stl-cell stl-cell-name"><b>${esc(it.name)}</b>${note?`<small>${esc(note)}</small>`:''}${it.warehouseNote?`<small class="stl-warehouse-note" title="توضیح انبار${it.warehouseNoteByName?` — ${esc(it.warehouseNoteByName)}`:''}">${icon('clipboard',12)} <b>توضیح انبار:</b> ${esc(it.warehouseNote)}</small>`:''}</div>
    <div class="stl-cell"><span class="stl-label">تحویلی</span><span class="stl-kg">${qty(it.delivered)} کیلوگرم</span></div>
    <div class="stl-cell"><span class="stl-label">قیمت هر کیلو (ریال)</span><input class="stl-input" type="text" inputmode="numeric" autocomplete="off" data-stl-price="${esc(it.id)}" value="${esc(stlFmtPrice(it.price))}" ${dis} placeholder="${it.outOfStock?'—':'۰'}"></div>
    <div class="stl-cell"><span class="stl-label">مبلغ</span><b class="stl-amount" data-stl-amount="${esc(it.id)}">${money(stlActive(it)?Math.round(it.delivered*it.price):0)}</b></div>
    <div class="stl-cell stl-cell-cancel"><label class="stl-check"><input type="checkbox" data-stl-cancel="${esc(it.id)}" ${it.skip?'checked':''} ${(it.voided||priceLocked)?'disabled':''}> لغو قلم</label></div>
  </div>`;
}
function stlPaymentRowsHtml(){
  const devices=stl.devices||[];
  return `<div class="stl-payments" id="stlPayments"><div class="stl-payment-row" data-payrow><label class="stl-pay-field"><span>روش دریافت</span><select class="adm-select" data-paytype><option value="CASH">نقدی</option><option value="POS">پوز</option><option value="CARD_TRANSFER">کارت‌به‌کارت</option><option value="CHECK">چک</option><option value="CREDIT">معوق</option></select></label><label class="stl-pay-field"><span>مبلغ (ریال)</span><input class="adm-input stl-pay-amount" data-payamount inputmode="numeric" placeholder="مثلاً ۲٬۵۰۰٬۰۰۰"></label><div class="stl-pay-detail" data-paydetail></div><button type="button" class="btn btn-secondary btn-sm" data-payremove aria-label="حذف روش پرداخت">حذف</button></div></div><button type="button" class="btn btn-secondary btn-sm" data-payadd>＋ افزودن روش پرداخت</button><div class="stl-pay-totals"><span>قابل تسویه: <b id="stlPayExpected">${money(Math.max(0,stlDue()))}</b></span><span>جمع ثبت‌شده: <b id="stlPaySum">۰</b></span><strong>مانده: <b id="stlPayBalance">${money(Math.max(0,stlDue()))}</b></strong></div>`;
}
/* v37.40.0 — مبلغ پیش‌فرض روش‌های تسویه: ردیف اول کل مبلغ فاکتور را می‌گیرد؛
   با افزودن تراکنش تازه یا ویرایش مبلغ یک ردیف، ماندهٔ فاکتور به‌صورت خودکار
   در ردیف‌های «خودکار» بعدی می‌نشیند تا جمع دقیقاً برابر مبلغ فاکتور شود. */
function stlPayParse(v){return Number(en(String(v ?? '')).replace(/[^0-9]/g,'')) || 0;}
function stlPayFmt(v){return v ? Number(v).toLocaleString('fa-IR') : '';}
function stlPayRows(){return [...document.querySelectorAll('#stlPayments [data-payrow]')];}
function stlPayBalance(exceptRow){const paid=stlPayRows().filter(r=>r!==exceptRow).reduce((s,r)=>s+stlPayParse(r.querySelector('[data-payamount]')?.value),0);return Math.max(0,stlDue()-paid);}
function stlPayAutoFill(row){const input=row?.querySelector('[data-payamount]');if(!input)return;row.dataset.autopay='1';input.value=stlPayFmt(stlPayBalance(row));}
function stlRefreshAutoPayments(){stlPayRows().forEach(r=>{if(r.dataset.autopay==='1')stlPayAutoFill(r);});stlPayUpdate();}
function stlPayUpdate(){const rows=stlPayRows(),sum=rows.reduce((n,r)=>n+stlPayParse(r.querySelector('[data-payamount]')?.value),0),expected=Math.max(0,stlDue());const a=document.getElementById('stlPaySum'),b=document.getElementById('stlPayExpected'),c=document.getElementById('stlPayBalance');if(a)a.textContent=money(sum);if(b)b.textContent=money(expected);if(c)c.textContent=money(expected-sum);}
function stlBindPayments(){
 const host=document.getElementById('stlPayments');if(!host)return;
 const devices=stl.devices||[];
 const makeDetail=(row)=>{const type=row.querySelector('[data-paytype]').value,box=row.querySelector('[data-paydetail]');let h='';
  if(type==='POS')h=`<label>دستگاه فعال<select class="adm-select" data-device><option value="">انتخاب دستگاه</option>${devices.map(d=>`<option value="${esc(d.id)}">${esc(d.bank)} ${esc(d.terminalNumber)}</option>`).join('')}</select></label><label>شماره پیگیری<input class="adm-input" data-reference placeholder="اختیاری"></label>`;
  if(type==='CARD_TRANSFER')h='<label>بانک / حساب مقصد<input class="adm-input" data-bank placeholder="بانک یا حساب مقصد"></label><label>شناسه پیگیری<input class="adm-input" data-reference placeholder="شناسه تراکنش"></label>';
  if(type==='CHECK')h='<label>بانک<input class="adm-input" data-bank placeholder="نام بانک"></label><label>شماره چک<input class="adm-input" data-check placeholder="شماره چک"></label><label>سررسید<input class="adm-input" data-due type="date"></label>';
  box.innerHTML=h;box.hidden=!h;};
 const upd=stlPayUpdate;
 const bindRow=(r)=>{if(r.dataset.bound)return;r.dataset.bound='1';makeDetail(r);const amt=r.querySelector('[data-payamount]');r.querySelector('[data-paytype]').onchange=()=>{makeDetail(r);stlPayAutoFill(r);upd();};amt.oninput=e=>{r.dataset.autopay='';const v=stlPayParse(e.target.value);e.target.value=stlPayFmt(v);stlRefreshAutoPayments();upd();};r.querySelector('[data-payremove]').onclick=()=>{if(host.querySelectorAll('[data-payrow]').length<=1)return toast('حداقل یک روش تسویه لازم است.');r.remove();stlRefreshAutoPayments();upd();};if(!amt.value.trim())stlPayAutoFill(r);};
 host.querySelectorAll('[data-payrow]').forEach(bindRow);
 const add=document.querySelector('[data-payadd]');if(add)add.onclick=()=>{const tpl=host.querySelector('[data-payrow]').cloneNode(true);delete tpl.dataset.bound;delete tpl.dataset.autopay;tpl.querySelector('[data-payamount]').value='';tpl.querySelector('[data-paytype]').value='CASH';tpl.querySelector('[data-paydetail]').innerHTML='';tpl.querySelector('[data-paydetail]').hidden=true;host.appendChild(tpl);bindRow(tpl);stlPayAutoFill(tpl);upd();const inp=tpl.querySelector('[data-payamount]');if(inp){inp.focus();inp.select?.();}};upd();
}
function stlCollectPayments(){const rows=[...document.querySelectorAll('#stlPayments [data-payrow]')];if(stlDue()===0 && rows.every(r=>!stlPayParse(r.querySelector('[data-payamount]')?.value)))return [];return rows.map(r=>{const value=s=>r.querySelector(`[data-${s}]`)?.value||'';const amount=Number(value('payamount').replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٬,\s]/g,''))||0;return {type:value('paytype'),amount,deviceId:value('device'),reference:value('reference'),bank:value('bank'),checkNumber:value('check'),dueDate:value('due'),reason:value('reason')};});}
function stlFormHtml(o){
  const dispatchStarted=!!o.dispatch;
  const priceApproved=!!o.dispatch?.priceApprovedAt;
  const approvedBanner=priceApproved
    ? `<div class="stl-approved-banner"><strong>قیمت‌ها توسط فروش تأیید شد</strong><span>تأیید ${esc(formatDateTime24(o.dispatch.priceApprovedAt))} • ${esc(o.dispatch.priceApprovedBy||'فروش')}</span><b>جمع مبلغ برای راننده: ${money(o.dispatch.approvedTotalAmount||stlTotal())}</b></div>`
    : o.deposit?`<div class="stl-approval-prompt">سفارش بیعانه دارد؛ تسویه در فروش انجام می‌شود و ارسال به پخش امکان‌پذیر نیست.</div>${depositSummaryHtml(o.deposit)}`:`<div class="stl-approval-prompt">برای ارسال به پخش، قیمت هر کیلو برای تمام اقلام تحویلی را بررسی کنید؛ سفارش تا زمان تأیید فروش برای راننده قابل مشاهده نیست.</div>`;
  return `<section class="stl-card">
    <header class="stl-form-head stl-form-head-inline">
      <span class="stl-inline-title">${dispatchStarted?'قیمت‌گذاری و پخش':'فرم تسویه'}</span>${orderCustomerStripHtml(o,true)}
      <button type="button" class="btn btn-secondary btn-sm" data-stl="close">${icon('close',14)} بستن</button>
    </header>
    <div class="stl-section">
      ${approvedBanner}
      <div class="stl-section-head"><h3>${icon('scale',17)} اقلام و قیمت‌گذاری</h3><span class="stl-hint-inline">${priceApproved?'قیمت تأییدشده برای راننده قفل شده است.':'قیمت واحد را بر اساس هر کیلوگرم وارد و پیش از ارسال بازبینی کنید.'}</span></div>
      <div class="stl-table">${stlBilledItems().length?`<div class="stl-grid-head"><span>قلم</span><span>وزن تحویلی</span><span>قیمت هر کیلو</span><span>مبلغ</span><span>لغو</span></div>`:''}${stlBilledItems().map(stlRowHtml).join('') || '<div class="stl-q-empty">قلم تحویل‌شده‌ای برای این سفارش ثبت نشده است.</div>'}</div>
      <div class="stl-weight-summary">جمع وزن تحویلی: <b id="stlTotalKg">${qty(stlKg())} کیلوگرم</b></div>
    </div>
    <div class="stl-invoice-bottom"><div class="stl-totals stl-financial-column">${stlAdjustmentsHtml(o)}</div><div class="stl-verification-column">
    ${dispatchStarted?`<div class="stl-dispatch-lock"><b>سفارش به پخش واگذار شده است.</b><span>از این فرم برای صدور فاکتور یا برگشت به انبار استفاده نمی‌شود. راننده مبلغ و وزن را می‌بیند؛ پس از تحویل، بازبینی نهایی در تب «پخش» انجام می‌شود.</span></div>`:`<div class="stl-section"><div class="stl-section-head"><h3>اطلاعات مشتری</h3></div><div>${esc(o.customer?.name||'—')} – ${esc(o.customer?.phone||'—')}</div></div>`}
    </div></div>
    ${dispatchStarted?'':`<div class="stl-section stl-payment-section"><div class="stl-section-head"><h3>${icon('receipt',17)} روش‌های تسویه</h3><span class="stl-hint-inline">پرداخت ترکیبی مجاز است؛ جمع مبالغ باید با مانده پس از کسر بیعانه برابر باشد.</span></div>${stlPaymentRowsHtml()}</div>`}
    <div id="stlErrors" class="stl-errors" hidden style="margin-top:8px"></div>
    ${stlFooterHtml(o)}
  </section>`;
}
window.BTSettlementRenderers={row:stlRowHtml,form:stlFormHtml};
async function salesPriorBalance(order){
 const id=order.customerId||order.visit?.customerId;
 if(!id||order.orderType==='STORE')return {unavailable:true};
 try{return await api('/api/customers/'+encodeURIComponent(id)+'/debts');}catch(_){return {error:true};}
}
function salesPriorBalanceHtml(data){
 if(!data||data.error)return '<section class="stl-prior-balance" role="status">ماندهٔ قبلی دریافت نشد؛ برای بررسی دوباره فرم را باز کنید.</section>';
 if(data.unavailable)return '<section class="stl-prior-balance" role="status">پروندهٔ مالی مشتری برای نمایش ماندهٔ قبلی در دسترس نیست.</section>';
 return `<section class="stl-prior-balance" data-prior-balance><b>ماندهٔ قبلی مشتری</b><span>بدهکار از قبل: ${money(data.balance||0)}</span><span>بستانکار از قبل: ${money(data.credit||0)}</span><small>فقط حساب‌های ثبت‌شده در سامانه نمایش داده می‌شوند؛ سوابق قدیمی ممکن است ثبت نشده باشند. این مانده در مبلغ فاکتور اعمال نشده است.</small></section>`;
}
function stlPaintForm(){
  const host = $('#stlMain'); if(!host || !stl.order) return;
  if(stl.order.transportWorkflow===1&&stl.order.deliveryMode==='DELIVERY'&&typeof transportSalesInvoicePanel==='function'){transportSalesInvoicePanel(stl.order);host.insertAdjacentHTML('beforeend',salesPriorBalanceHtml(stl.previousBalance));return;}
  host.innerHTML = stlFormHtml(stl.order)+salesPriorBalanceHtml(stl.previousBalance);
  const driverSelect=host.querySelector('[data-stl-driver]');if(driverSelect)driverSelect.addEventListener('change',()=>{host.querySelector('[data-stl-plate]').innerHTML=plateViewHtml(stl.drivers.find(x=>x.id===driverSelect.value)?.plate,'—',true);});
  stlRecalc(); stlBindPayments();
}
function stlRecalc(){
  stlBilledItems().forEach(it=>{
    const amt = document.querySelector(`[data-stl-amount="${CSS.escape(it.id)}"]`);
    if(amt) amt.textContent = money(stlActive(it)?Math.round(it.delivered*it.price):0);
    const row = document.querySelector(`[data-stl-row="${CSS.escape(it.id)}"]`);
    if(row){
      row.classList.toggle('is-skip', !!it.skip);
      row.classList.toggle('needs-price', stlActive(it) && it.delivered>0 && !(it.price>0));
    }
    const cancel=document.querySelector(`[data-stl-cancel="${CSS.escape(it.id)}"]`); if(cancel)cancel.disabled=!!(it.voided||stl.order?.dispatch?.priceApprovedAt);
    const inp = document.querySelector(`[data-stl-price="${CSS.escape(it.id)}"]`);
    if(inp) inp.disabled = !!(it.voided || it.skip || it.outOfStock || stl.order?.dispatch?.priceApprovedAt);
  });
  const sub=document.getElementById('stlSubtotalAmount'); if(sub) sub.textContent=money(stlSubtotal());
  const kg=document.getElementById('stlTotalKg'); if(kg) kg.textContent = qty(stlKg())+' کیلوگرم';
  const tot=document.getElementById('stlTotalAmount'); if(tot) tot.textContent = money(stlTotal());
  const due=document.getElementById('stlDueAmount');if(due)due.textContent=money(stlDue());
  const dep=document.getElementById('stlDepositAmount');if(dep)dep.textContent=money(stlDeposit());
  const excess=document.getElementById('stlDepositExcess');if(excess)excess.hidden=!(stlDue()<0&&stlTotal()>0);
  stlRefreshAutoPayments();
}
function stlUpdateSigState(){
  const el=document.getElementById('stlSigState'); if(!el) return;
  el.textContent = stl.sig ? 'امضا ثبت شد' : 'امضای مشتری را روی کادر بکشید';
  el.classList.toggle('ok', !!stl.sig);
}
function stlUpdateFpState(){
  const el=document.getElementById('stlFpState'); if(!el) return;
  if(stl.fp){ el.textContent='اثر انگشت احراز شد.'; el.className='stl-state ok'; }
  else if(stl.manual){ el.textContent='تسویه بدون اثر انگشت (با مجوز دستی).'; el.className='stl-state warn'; }
  else { el.textContent='احراز اثر انگشت یا فعال‌کردن تسویه دستی الزامی است.'; el.className='stl-state'; }
}
function stlBindSig(){
  stl.signaturePad?.dispose();
  const c=document.getElementById('stlSig'); if(!c)return;
  stl.signaturePad=btSignaturePad(c,ink=>{stl.sig=ink;stlUpdateSigState();});
}
function stlClearSig(){ stl.signaturePad?.clear(); stl.sig=false; stlUpdateSigState();
}
let stlOpenSequence=0;
async function stlOpen(id){
  const notices=captureEntityNotices('order',id);
  const host=$('#stlMain'); if(!host || !id)return;
  const seq=++stlOpenSequence;
  const current=()=>seq===stlOpenSequence && host.isConnected && $('#stlMain')===host;
  host.innerHTML='<div class="stl-empty" role="status">در حال دریافت اطلاعات سفارش…</div>';
  try{
    const d=await api('/api/orders/'+encodeURIComponent(id));
    if(!current())return;
    const o=d.order;
    if(!o || o.status!=='SETTLEMENT_PENDING'){
      stlReset();host.innerHTML=stlEmptyHtml();toast('این سفارش دیگر در مرحله تسویه نیست.');
      if(app.page==='sales'&&app.sub.sales==='settlement')await renderSales('settlement');
      return;
    }
    const transport=o.transportWorkflow===1&&o.deliveryMode==='DELIVERY'&&o.orderType!=='STORE';
    let prices=[],drivers=[],devices=[],devicesError=false;
    if(transport){
      // The dispatch invoice is priced from today's product list. Keep that
      // lookup best-effort so a temporary price-list outage does not hide the
      // handover or prevent staff from entering a price manually.
      try{prices=(await api('/api/prices')).prices||[];}catch(_){}
      // POS devices are only needed when the documents have returned.
      if(o.transportReturn){
        try{devices=(await api('/api/payment-devices')).devices||[];}catch(_){devicesError=true;}
      }
    }else{
      const [p,driverData,deviceData]=await Promise.all([api('/api/prices'),api('/api/dispatch/drivers'),api('/api/payment-devices')]);
      prices=p.prices||[];drivers=driverData.drivers||[];devices=deviceData.devices||[];
    }
    const previousBalance=await salesPriorBalance(o);
    if(!current())return;
    Object.assign(stl, {previousBalance,orderId:id, order:o, items:stlItemsOf(o,prices), prices, priceMap:Object.fromEntries(prices.map(x=>[x.productId,Number(x.price)])), drivers, devices, devicesError, paymentRows:[{type:'CASH',amount:''}], discountAmount:0, additionsAmount:0, sig:false, fp:'', manual:false, busy:false});
    stl.discountAmount=Number(o.payment?.discountAmount ?? o.dispatch?.discountAmount ?? 0);
    stl.additionsAmount=Number(o.payment?.additionsAmount ?? o.dispatch?.additionsAmount ?? 0);
    app.selectedSettlement=id;
    document.querySelectorAll('.stl-queue-item').forEach(b=>b.classList.toggle('active', b.dataset.id===id));
    stlPaintForm();
    finishEntityNotices(notices);return true;
  }catch(e){
    if(!current())return;
    host.innerHTML=`<div class="stl-load-error" role="alert"><b>فرم سفارش باز نشد.</b><span>${esc(e.message||'خطا در دریافت اطلاعات سفارش')}</span><button type="button" class="btn btn-secondary btn-sm" data-stl="retry" data-id="${esc(id)}">تلاش دوباره</button></div>`;
    toast(e.message||'خطا در دریافت اطلاعات سفارش');
  }
}

function stlClose(){ stlOpenSequence++; stl.signaturePad?.dispose(); stlReset(); const host=$('#stlMain'); if(host) host.innerHTML=stlEmptyHtml(); document.querySelectorAll('.stl-queue-item.active').forEach(b=>b.classList.remove('active')); }
function stlValidateDispatch(){
  const errs=[];
  const active=stl.items.filter(stlActive);
  if(!active.some(i=>i.delivered>0)) errs.push('حداقل یک قلم تحویلی برای ارسال به پخش لازم است.');
  const noPrice=active.filter(i=>i.delivered>0&&!(i.price>0)).map(i=>i.name);
  if(noPrice.length) errs.push('قیمت هر کیلو را برای همهٔ اقلام تحویلی وارد کنید: '+noPrice.join('، ')+'.');
  if(stl.order?.deposit) errs.push('سفارش دارای بیعانه به پخش ارسال نمی‌شود.');
  if(stlTotal()<=0) errs.push('جمع مبلغ سفارش باید بیشتر از صفر باشد.');
  return errs;
}
function stlValidate(){
  const errs=[];
  const act=stl.items.filter(stlActive);
  if(!act.length) errs.push('هیچ قلم فعالی برای تسویه باقی نمانده است.');
  if(!act.some(i=>i.delivered>0)) errs.push('هیچ قلم تحویلی با وزن معتبر وجود ندارد.');
  const noPrice=act.filter(i=>i.delivered>0 && !(i.price>0)).map(i=>i.name);
  if(noPrice.length) errs.push('قیمت هر کیلو را برای این اقلام وارد کنید: '+noPrice.join('، ')+'.');
  if(!Number.isSafeInteger(stlTotal())||stlTotal()<=0||stlTotal()>1e12) errs.push('مبلغ نهایی پس از تخفیف و اضافات معتبر نیست.');
  const payments=stlCollectPayments();
  if(stlDue()<0) errs.push('بیعانه از مبلغ نهایی بیشتر است؛ ابتدا اضافه‌پرداخت را دستی تعیین تکلیف کنید.');
  if((stlDue()>0&&!payments.length)||payments.some(p=>!p.type||p.amount<=0)) errs.push('برای هر روش تسویه، روش و مبلغ معتبر وارد کنید.');
  const paid=payments.reduce((s,p)=>s+p.amount,0);
  if(paid!==Math.max(0,stlDue())) errs.push('جمع روش‌های تسویه باید دقیقاً برابر مانده پس از کسر بیعانه باشد.');
  if(payments.some(p=>p.type==='POS'&&!p.deviceId)) errs.push('برای هر پرداخت پوز، دستگاه فعال انتخاب کنید.');
  if(payments.some(p=>p.type==='CARD_TRANSFER'&&(!p.bank||!p.reference))) errs.push('برای کارت‌به‌کارت، بانک مقصد و شناسه پیگیری را وارد کنید.');
  if(payments.some(p=>p.type==='CHECK'&&(!p.bank||!p.checkNumber||!p.dueDate))) errs.push('برای چک، بانک، شماره چک و تاریخ سررسید را وارد کنید.');
  return errs;
}
function stlShowErrors(list){
  const box=document.getElementById('stlErrors'); if(!box) return;
  if(!list.length){ box.hidden=true; box.innerHTML=''; return; }
  box.hidden=false; box.innerHTML='<b>برای تسویه:</b><ul>'+list.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>';
  box.scrollIntoView({block:'nearest'});
}
async function stlRefundExcess(){
 const id=stl.orderId, amount=-stlDue();if(!id||amount<=0||stlTotal()<=0||stl.refundBusy)return;
 if(!confirm(`آیا ${money(amount)} اضافه‌پرداخت را واقعاً به مشتری بازگردانده‌اید؟ این دکمه انتقال وجه انجام نمی‌دهد.`))return;
 const reference=prompt('شماره پیگیری یا توضیح استرداد دستی را وارد کنید:');if(reference===null)return;if(!reference.trim())return toast('شماره پیگیری یا توضیح استرداد الزامی است.');
 stl.refundBusy=true;try{const result=await api('/api/orders/'+encodeURIComponent(id)+'/deposit-partial-refund',{method:'POST',body:JSON.stringify({amount,reference,expectedRefundedAmount:Number(stl.order.deposit.refundedAmount||0)})});if(stl.orderId!==id)return;stl.order=result.order;const summary=document.querySelector('#stlMain .deposit-summary');if(summary)summary.outerHTML=depositSummaryHtml(stl.order.deposit);stlRecalc();stlShowErrors([]);toast('استرداد دستی ثبت شد.');}catch(e){toast(e.message);}finally{stl.refundBusy=false;}
}
async function stlSubmit(){
  if(!stl.orderId || stl.busy) return;
  const errs=stlValidate(); stlShowErrors(errs); if(errs.length) return;
  const items=stlBilledItems().map(it=>({ itemId:it.id, unitPrice: (it.voided||it.skip)?0:Number(it.price||0), cancelled: !!(it.voided||it.skip) }));
  const btn=document.getElementById('stlSubmitBtn'); stl.busy=true; if(btn){ btn.disabled=true; btn.textContent='در حال صدور فاکتور...'; }
  try{
    const d=await api('/api/orders/'+stl.orderId+'/settle',{method:'POST',body:JSON.stringify({items,discountAmount:stl.discountAmount,additionsAmount:stl.additionsAmount,settlementMethods:stlCollectPayments()})});
    const no=d.order?.payment?.invoiceNumber||'';
    toast(`تسویه نهایی شد؛ فاکتور ${no} صادر شد.`);
    const doneId=d.order?.id;
    stlClose();
    await renderSales('settlement');
    if(doneId) previewInvoice(doneId);
  }catch(e){
    stl.busy=false; if(btn){ btn.disabled=false; btn.textContent='تایید و صدور فاکتور'; }
    stlShowErrors([e.message]);
  }
}
async function stlCapture(){
  const id=stl.orderId;if(!id||stl.captureBusy)return;
  stl.captureBusy=true; const el=document.getElementById('stlFpState');
  const button=document.querySelector('[data-stl="fp"]');if(button)button.disabled=true;
  if(el){el.textContent='در حال دریافت احراز از حسگر مورد اعتماد سمت سرور…';el.className='stl-state';}
  try{
    const d=await api('/api/fingerprint/capture',{method:'POST',body:JSON.stringify({orderId:id})});
    if(stl.orderId!==id)return;
    stl.fp=d.fingerprintRef;stl.manual=false;stlUpdateFpState();
    toast(d.mock?'توجه: احراز آزمایشی ثبت شد؛ برای محیط واقعی معتبر نیست.':'احراز اثر انگشت با موفقیت ثبت شد.');
  }catch(err){
    if(stl.orderId!==id)return;
    stl.fp='';if(el&&el.isConnected){el.textContent=err.message;el.className='stl-state warn';}toast(err.message);
  }finally{
    stl.captureBusy=false;if(button?.isConnected)button.disabled=false;
    if(stl.orderId===id){const m=document.querySelector('[data-stl-manual]');if(m)m.checked=stl.manual;}
  }
}
// Overrides for the older names (last definition wins). None of these recurse.
function renderSettlementForm(o){ if(!o || stl.orderId!==o.id) return; stlPaintForm(); }
async function stlRequestCancellation(button){
 const id=stl.orderId;if(!id||button.disabled)return;
 const reason=prompt('دلیل انصراف مشتری را وارد کنید:');if(!reason?.trim())return;
 if(!confirm('درخواست به انبار ارجاع شود؟ لغو و خروج بدون کالا فقط پس از بررسی و تأیید انبار انجام می‌شود.'))return;
 button.disabled=true;
 try{await api('/api/orders/'+encodeURIComponent(id)+'/settlement-cancellation',{method:'POST',body:JSON.stringify({reason:reason.trim()})});stlClose();toast('درخواست انصراف به انبار ارجاع شد؛ تأیید بازگشت کالا لازم است.');if(app.salesCache)app.salesCache.fetchedAt=0;await fetchSalesCache(true);await renderSales('settlement');await refreshIndicators();}
 catch(e){button.disabled=false;toast(e.message);}
}
function selectSettlement(id){ return stlOpen(id); }
function finalSettle(id){ if(id && stl.orderId!==id) return stlOpen(id); return stlSubmit(); }
if(!window.__stlBoundV374){
  window.__stlBoundV374=true;
  document.addEventListener('click', e=>{
    const t=e.target.closest && e.target.closest('[data-stl]'); if(!t) return;
    const a=t.dataset.stl;
    if(a==='select'&&t.dataset.action==='select-settlement')return;
    if(a==='select'||a==='retry') return stlOpen(t.dataset.id);
    if(a==='close') return stlClose();
    if(a==='send-dispatch') return sendToDispatch(stl.orderId, ()=>stlOpen(stl.orderId));
    if(a==='sig-clear') return stlClearSig();
    if(a==='fp') return stlCapture();
    if(a==='reopen'){ if(stl.orderId) return reopenSettlementToWarehouse(stl.orderId); return; }
    if(a==='cancel-purchase') return stlRequestCancellation(t);
    if(a==='refund-deposit-excess') return stlRefundExcess();
    if(a==='submit') return stlSubmit();
  });
  document.addEventListener('input', e=>{
    const t=e.target;
    if(t.matches?.('[data-stl-adjust]')){stlFormatPriceInput(t);stl[t.dataset.stlAdjust]=stlPrice(t.value);stlRecalc();stlShowErrors([]);return;}
    if(!t.matches || !t.matches('[data-stl-price]')) return;
    const it=stl.items.find(x=>x.id===t.dataset.stlPrice); if(!it) return;
    stlFormatPriceInput(t); it.price=stlPrice(t.value); stlRecalc(); stlShowErrors([]);
  });
  document.addEventListener('focusout', e=>{
    const t=e.target; if(!t.matches || !t.matches('[data-stl-price]')) return;
    const it=stl.items.find(x=>x.id===t.dataset.stlPrice); if(it) t.value=stlFmtPrice(it.price);
  });
  document.addEventListener('change', e=>{
    const t=e.target; if(!t.matches) return;
    if(t.matches('[data-stl-cancel]')){ if(stl.order?.dispatch?.priceApprovedAt){t.checked=false;t.disabled=true;return;} const it=stl.items.find(x=>x.id===t.dataset.stlCancel); if(it){ it.skip=t.checked; stlRecalc(); stlShowErrors([]); } return; }
    if(t.matches('[data-stl-manual]')){ stl.manual=t.checked; if(stl.manual) stl.fp=''; stlUpdateFpState(); stlShowErrors([]); }
  });
}

/* ================================================================
   v37.0.6 — کارتابل باسکول (ورود/خروج وسیله، وزن خالص، کالا)
   - وزن زنده از عامل سریال (PU 850) یا شبیه‌ساز می‌آید؛ بخش زنده فقط اعداد را به‌روز می‌کند و فرم را پاک نمی‌کند
   - تشخیص خودکار: اولین وزن «ورود»، وزن دوم «خروج»؛ سنگین‌تر بار و سبک‌تر خالی است (بدون آستانه)
   ================================================================ */
app.sc = app.sc || { state:null, sig:'', busy:false };
const SC_UNITS = ['کیلوگرم','بسته','عدد','کارتن'];
function scState(v){ return v?.status==='IN_PROGRESS'?'باز':v?.status==='DONE'?'تکمیل':v?.status==='CANCELLED'?'لغو':'—'; }
function scRenderShell(){
  const c=$('#content'); if(!c) return;
  const r=normalizeRole(app.user?.roleCode);
  c.innerHTML=`<section class="sc2">
    <div class="sc2-bar">
      <div><span class="eyebrow">WEIGHBRIDGE CONSOLE</span><h2>کنسول باسکول</h2></div>
      <div class="sc2-bar-meta"><span id="scLinkChip" class="sc2-link">در انتظار دستگاه</span></div>
    </div>
    <div class="sc2-main">
      <section class="sc2-scale card" id="scLiveCard">
        <div class="sc2-scale-head"><span>وزن زنده</span><span id="scStable" class="badge">در انتظار دستگاه</span></div>
        <div class="sc2-readout"><b id="scWeight" class="sc2-number">—</b><span>کیلوگرم</span></div>
        <div class="sc2-scale-foot"><small id="scAge"></small><small>خط آخر: <span id="scRaw">—</span></small></div>
        <ol class="sc2-steps" aria-label="مراحل وزن‌کشی">
          <li id="scStep1" class="sc2-step"><span>۱</span><div><b>وزن ورود</b><small>وسیله‌ی تازه</small></div></li>
          <li id="scStep2" class="sc2-step"><span>۲</span><div><b>وزن خروج</b><small>محاسبه‌ی خالص</small></div></li>
        </ol>
      </section>
      <section class="sc2-op card">
        <div class="sc2-op-head"><div><span class="eyebrow">OPERATION</span><h3>ثبت وزن وسیله</h3></div><span id="scPhase" class="sc-phase entry">ورود (وزن اول)</span></div>
        <label class="sc2-field"><span>انتخاب پلاک ثبت‌شده یا داخل باسکول</span><select id="scExistingPlate"><option value="">ورود پلاک جدید</option></select></label>
        <input type="hidden" id="scPlate"><div id="scSelectedPreview"></div><small id="scPlateNotice" role="status"></small>
        <div id="scManualWrap"><label class="sc2-field"><span>نوع پلاک جدید</span><select id="scManualType"><option>خودرو</option><option>موتورسیکلت</option></select></label><div id="scManualEditor">${plateEditorHtml()}</div></div>
        <div id="scOpenHint" class="sc2-hint"></div>
        <div class="sc2-field"><span>کالا <small>(برای ورود)</small></span><input id="scTileSearch" class="sc2-tile-search" placeholder="جستجوی کالا (نام یا کد)" autocomplete="off"><div id="scTiles" class="sc2-tiles"></div><select id="scProduct" hidden></select></div>
        <label class="sc2-field" id="scCustomerWrap"><span>نام مشتری یا طرف حساب <small>(اختیاری، برای ورود)</small></span><input id="scCustomer" maxlength="120" placeholder="نام مشتری یا طرف حساب" autocomplete="off"></label>
        <button type="button" class="sc2-weigh" data-sc="weigh" id="scWeighBtn" disabled>ثبت وزن</button>
        <div id="scMsg" class="sc-msg" hidden></div>
      </section>
      <aside class="sc2-side">
        <section class="card sc2-ticket" id="scTicket"><div class="sc2-ticket-head"><span class="eyebrow">TICKET</span><h3>پیش‌نمایش فیش</h3></div><div id="scTicketBody" class="sc2-ticket-body"><p class="sc2-empty-line">پلاکی را انتخاب کنید تا وزن ورود و خالص زنده نمایش داده شود.</p></div></section>
        <section class="card sc2-panel"><div class="sc2-panel-head"><h3>داخل باسکول</h3><span id="scOpenCount" class="count-chip">۰</span></div><div id="scOpen"></div></section>
      </aside>
    </div>
    <section class="card sc2-panel sc2-done"><div class="sc2-panel-head"><h3>آخرین وزن‌کشی‌های تکمیل‌شده</h3></div><div id="scDone"></div></section>
    <details class="card sc2-admin">
      <summary><span>افزودن وسیله و کالا</span><small>${r==='admin'?'وسیله، کالا و شبیه‌ساز':'وسیله'}</small></summary>
      <div class="sc2-admin-grid">
        <div class="sc2-admin-block"><h4>ثبت وسیله جدید</h4>
          <label class="sc2-field"><span>نوع پلاک</span><select id="scNewType"><option>خودرو</option><option>موتورسیکلت</option></select></label><div id="scNewEditor">${plateEditorHtml()}</div>
          <label class="sc2-field"><span>نام راننده</span><input id="scNewDriver" placeholder="اختیاری"></label>
          <button type="button" class="sc-secondary" data-sc="add-vehicle">افزودن وسیله</button></div>
        ${r==='admin'?`<div class="sc2-admin-block"><h4>افزودن کالا به کاتالوگ</h4>
          <label class="sc2-field"><span>کد سریع (دو رقمی)</span><input id="scPCode" inputmode="numeric" maxlength="2"></label>
          <label class="sc2-field"><span>نام کالا</span><input id="scPName"></label>
          <label class="sc2-field"><span>واحد پایه</span><select id="scPUnit">${SC_UNITS.map(u=>`<option>${u}</option>`).join('')}</select></label>
          <button type="button" class="sc-secondary" data-sc="add-product">افزودن کالا</button></div>`:''}
      </div>
    </details>
    ${r==='admin'?`<details class="card sc2-admin" id="scTcDetails"><summary><span>تنظیم چاپ فیش</span><small>اندازه کاغذ، ستون‌ها، ردیف‌ها و محل فیلدها</small></summary><div id="scTcBody" class="sc2-tc-body"><p class="sc2-empty-line">برای دیدن تنظیمات باز کنید.</p></div></details>`:''}
    <div id="scSim"></div>
  </section>`;
}
function scSetMsg(text,kind){ const m=$('#scMsg'); if(!m) return; m.hidden=!text; m.textContent=text||''; m.className='sc-msg '+(kind||''); }
function scLiveUpdate(L,settings){
  const w=$('#scWeight'); if(!w) return;
  const chip=$('#scLinkChip'); if(chip){ chip.textContent = !L.updatedAt?'در انتظار دستگاه':!L.fresh?'قطع ارتباط':'دستگاه متصل'; chip.className='sc2-link '+(L.updatedAt&&L.fresh?'on':'off'); }
  w.textContent = L.weight==null ? 'بدون داده' : qty(L.weight);
  w.classList.toggle('sc-nodata', L.weight==null);
  const b=$('#scStable'); if(b){ const ok=L.fresh&&L.stable; b.textContent= !L.updatedAt?'در انتظار دستگاه':!L.fresh?'قطع ارتباط / قدیمی':L.stable?'پایدار':'ناپایدار'; b.className='badge '+(ok?'green':'orange'); }
  const a=$('#scAge'); if(a) a.textContent = L.updatedAt?('آخرین به‌روزرسانی: '+formatDateTime24(L.updatedAt)):'';
  const raw=$('#scRaw'); if(raw) raw.textContent = L.source?L.source:'—';
}
function scListOpen(open){
  return open.length? `<div class="sc-list">${open.map(t=>`<article class="sc-item"><div>${plateViewHtml(t.plate, '—', true)}<small>${esc(t.productName||'—')} • ${esc(t.driverName||'')}</small></div><div class="sc-item-w"><small>ورود</small><b>${qty(t.firstWeight)} کیلو</b><small>${formatDateTime24(t.firstAt)}</small></div><button type="button" class="sc-ghost" data-sc="cancel" data-id="${esc(t.id)}">لغو</button></article>`).join('')}</div>` : '<div class="sc-empty">وسیله‌ای داخل باسکول نیست.</div>';
}
function scListDone(done){
  return done.length? `<div class="sc-list">${done.map(t=>`<article class="sc-item"><div>${plateViewHtml(t.plate, '—', true)}<small>${esc(t.productName||'—')} • ${formatDateTime24(t.closedAt)}</small></div><div class="sc-item-w"><small>خالص</small><b>${qty(t.netKg)} کیلو</b><small>بار ${qty(t.loadedKg)} • خالی ${qty(t.emptyKg)}</small></div><button type="button" class="sc-ghost" data-sc="print" data-id="${esc(t.id)}">چاپ فیش</button></article>`).join('')}</div>` : '<div class="sc-empty">هنوز وزن‌کشی تکمیل‌شده‌ای نیست.</div>';
}
function scFillSelects(st){
  const sig=JSON.stringify([st.vehicles.map(v=>v.plate+v.driverName),st.open.map(t=>t.plate),st.products.map(p=>p.id+p.name)]);
  if(sig===app.sc.sig) return; app.sc.sig=sig;
  const existing=$('#scExistingPlate');if(existing){const keep=existing.value;const choices=[...new Set([...st.open.map(t=>t.plate),...st.vehicles.map(v=>v.plate)].filter(Boolean))];existing.innerHTML='<option value="">ورود پلاک جدید</option>'+choices.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('');existing.value=choices.includes(keep)?keep:'';if(keep&&!existing.value)scSyncPlate();}
  const sel=$('#scProduct'); const keep=sel?sel.value:'';
  if(sel) sel.innerHTML='<option value="">— انتخاب کالا —</option>'+st.products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  if(sel && keep) sel.value=keep;
  const tiles=$('#scTiles');
  if(tiles) tiles.innerHTML=st.products.length? st.products.map(p=>`<button type="button" class="sc2-tile" data-sc="pick" data-id="${esc(p.id)}" aria-pressed="false"><b>${esc(p.name)}</b></button>`).join('') : '<div class="sc2-empty-line">کالایی ثبت نشده است. مدیر می‌تواند از بخش «افزودن وسیله و کالا» کالا اضافه کند.</div>';
  scMarkTile();
}
function scMarkTile(){
  const v=$('#scProduct')?.value||'';
  document.querySelectorAll('.sc2-tile').forEach(t=>{ const on=t.dataset.id===v; t.classList.toggle('on',on); t.setAttribute('aria-pressed',on?'true':'false'); });
}
function scPhaseHint(st){
  const L=st.live;
  const plate=en($('#scPlate')?.value||'').trim();
  const open=plate? st.open.find(t=>t.plate===plate):null;
  const isOpen=!!open;
  const ph=$('#scPhase'); const hint=$('#scOpenHint'); const pr=$('#scProduct');
  if(ph){ ph.textContent = isOpen?'خروج (وزن دوم)':'ورود (وزن اول)'; ph.className='sc-phase '+(isOpen?'exit':'entry'); }
  if(pr) pr.disabled=isOpen;
  const cu=$('#scCustomer'); if(cu) cu.disabled=isOpen;
  document.querySelectorAll('.sc2-tile').forEach(t=>{ t.disabled=isOpen; });
  if(hint) hint.textContent = !plate ? 'پلاک را وارد کنید؛ اگر وسیله داخل باسکول باشد، خروج خودکار انتخاب می‌شود.' : isOpen ? 'این وسیله داخل باسکول است؛ با ثبت این وزن، خروج و وزن خالص محاسبه می‌شود.' : 'اولین وزن ورود است؛ کالا را انتخاب کنید. با وزن دوم، سنگین‌تر بار و سبک‌تر خالی تشخیص داده می‌شود.';
  const s1=$('#scStep1'), s2=$('#scStep2');
  if(s1&&s2){ s1.classList.toggle('active',!isOpen); s1.classList.toggle('done',isOpen); s2.classList.toggle('active',isOpen); }
  const btn=$('#scWeighBtn');
  if(btn){
    const ready=!!(L.fresh&&L.stable&&L.weight>=st.settings.minStableKg);
    btn.disabled = !(ready && plate && (isOpen || productIdSelected()) && !app.sc.busy);
    btn.textContent = isOpen ? 'ثبت وزن خروج' : 'ثبت وزن ورود';
    btn.classList.toggle('ready',ready);
  }
  scTicket(st, open, plate);
}
function productIdSelected(){ return !!($('#scProduct')?.value); }
function scTicket(st, open, plate){
  const body=$('#scTicketBody'); if(!body) return;
  const L=st.live; const s=st.settings;
  if(!plate){ body.innerHTML='<p class="sc2-empty-line">پلاکی را انتخاب کنید تا وزن ورود و خالص زنده نمایش داده شود.</p>'; return; }
  if(!open){
    body.innerHTML=`<dl class="sc2-dl"><div><dt>پلاک</dt><dd>${plateViewHtml(plate, '—', true)}</dd></div><div><dt>وضعیت</dt><dd>ورود جدید</dd></div><div><dt>وزن فعلی</dt><dd>${L.weight==null?'—':qty(L.weight)+' کیلو'}</dd></div></dl><p class="sc2-empty-line">با ثبت این وزن، فیش ورود صادر می‌شود.</p>`;
    return;
  }
  const live=L.weight; const diff=live==null?null:Math.abs(live-open.firstWeight);
  const net = diff!=null && diff>=s.minDiffKg ? diff : null;
  body.innerHTML=`<dl class="sc2-dl"><div><dt>کالا</dt><dd>${esc(open.productName||'—')}</dd></div><div><dt>وزن ورود</dt><dd>${qty(open.firstWeight)} کیلو</dd></div><div><dt>وزن فعلی</dt><dd>${live==null?'—':qty(live)+' کیلو'}</dd></div></dl>
    <div class="sc2-net"><span>خالص پیش‌بینی‌شده</span><b>${net==null?'—':qty(net)+' کیلو'}</b></div>
    <p class="sc2-empty-line">${net==null?'وزن دوم هنوز اختلاف کافی ندارد.':'با ثبت وزن خروج، خالص نهایی ذخیره می‌شود.'}</p>`;
}
async function scRefresh(){
  if(!$('#scLiveCard')) return;
  try{
    const st=await api('/api/weighbridge/state'); app.sc.state=st;
    scLiveUpdate(st.live,st.settings);
    scFillSelects(st);
    const oc=$('#scOpen'); if(oc) oc.innerHTML=scListOpen(st.open);
    const oc2=$('#scOpenCount'); if(oc2) oc2.textContent=qty(st.open.length);
    const dn=$('#scDone'); if(dn) dn.innerHTML=scListDone(st.done);
    scPhaseHint(st);
    const sim=$('#scSim'); if(sim && st.simulator && !sim.dataset.ready){ sim.dataset.ready='1'; sim.innerHTML=`<section class="card sc-panel"><div class="sc-panel-head"><h2>شبیه‌ساز دستگاه (آزمایشی)</h2></div><div class="sc-grid"><label class="sc-field"><span>وزن (کیلوگرم)</span><input id="scSimW" inputmode="numeric" value="12000"></label></div><div class="sc-actions"><button type="button" class="sc-secondary" data-sc="sim" data-stable="1">ارسال وزن پایدار</button><button type="button" class="sc-ghost" data-sc="sim" data-stable="0">ارسال وزن ناپایدار</button></div></section>`; }
  }catch(e){ /* قطع موقت شبکه: پیام نمایش داده نمی‌شود تا فرم مزاحم نشود */ }
}
function scBindPlateEditors(){
  const manual=$('#scManualEditor'),fresh=$('#scNewEditor');
  if(manual)bindPlateEditor(manual,$('#scManualType'));
  if(fresh)bindPlateEditor(fresh,$('#scNewType'));
}
function scSyncPlate(){
  const selected=$('#scExistingPlate')?.value||'',manual=$('#scManualEditor');
  let value=selected;
  let duplicate=false;
  if(!selected&&manual){try{value=plateEditorValue(manual,{required:true});const key=x=>en(x||'').replace(/[\s-]/g,'');duplicate=[...(app.sc.state?.open||[]),...(app.sc.state?.vehicles||[])].some(x=>key(x.plate)===key(value));if(duplicate)value='';}catch{value='';}}
  const notice=$('#scPlateNotice');if(notice)notice.textContent=duplicate?'این پلاک قبلاً ثبت شده است؛ برای حفظ سوابق، آن را از فهرست پلاک‌های ثبت‌شده انتخاب کنید.':'';
  const field=$('#scPlate');if(field)field.value=value;
  const wrap=$('#scManualWrap');if(wrap)wrap.hidden=!!selected;
  const preview=$('#scSelectedPreview');if(preview)preview.innerHTML=selected?plateViewHtml(selected,'—',true):'';
}
async function renderScale(){
  if(app.timer){clearInterval(app.timer);app.timer=null}
  app.sc.sig=''; scRenderShell(); scBindPlateEditors(); await scRefresh();
  app.timer=setInterval(scRefresh,1500);
}
// ---- فیش باسکول (چاپ) ----
// فیلدها طبق قالب شیت: شماره باسکول، ساعت ورود، تاریخ، پلاک، وزن پر، ساعت خروج، وزن خالی، خالص، نام راننده، نام مشتری.
// کالا عمداً روی فیش چاپ نمی‌شود.
function scFaDate(v){ if(!v) return '—'; const d=new Date(v); if(Number.isNaN(d.getTime())) return '—'; return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit'}).format(d); }
function scFaTime(v){ if(!v) return '—'; const d=new Date(v); if(Number.isNaN(d.getTime())) return '—'; return new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d); }
async function scPrintTicket(trip, st, cfg){
  if(!cfg){
    try{ cfg = app.sc.ticket || (await api('/api/weighbridge/ticket-settings')).settings; app.sc.ticket = cfg; }
    catch(e){ scSetMsg('تنظیمات چاپ فیش خوانده نشد.','err'); return; }
  }
  let area=document.getElementById('scPrintArea');
  if(!area){ area=document.createElement('div'); area.id='scPrintArea'; area.setAttribute('aria-hidden','true'); document.body.appendChild(area); }
  const fd=v=>String(v??'').replace(/[0-9]/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
  const kg=v=>v==null?'—':qty(v)+' کیلوگرم';
  const vals={
    scale: fd(st?.scaleNo||'۱'),
    entryTime: scFaTime(trip.firstAt), date: scFaDate(trip.firstAt),
    plate: fd(trip.plate||'—'), loaded: kg(trip.loadedKg),
    exitTime: scFaTime(trip.closedAt), empty: kg(trip.emptyKg),
    driver: trip.driverName||'—', net: kg(trip.netKg), customer: trip.customerName||'—',
  };
  const cells=cfg.fields.filter(f=>f.show).map(f=>`<div class="pt-cell" style="grid-column:${f.col};grid-row:${f.row}"><small>${esc(f.label)}</small><b>${f.key==='plate'?plateViewHtml(trip.plate,'—',true):esc(vals[f.key]??'—')}</b></div>`).join('');
  area.innerHTML=`<div class="pt-ticket" dir="rtl" style="grid-template-columns:${cfg.colsMm.map(v=>v+'mm').join(' ')};grid-template-rows:${cfg.rowsMm.map(v=>v+'mm').join(' ')};font-size:${cfg.fontPt}pt"><div class="pt-title" style="grid-column:1 / span 6;grid-row:1">${esc(cfg.title)}</div>${cells}</div>`;
  BTPrintDigits.convert(area);
  let pg=document.getElementById('scPageStyle');
  if(!pg){ pg=document.createElement('style'); pg.id='scPageStyle'; document.head.appendChild(pg); }
  const paper={A5L:'A5 landscape',A5P:'A5 portrait',A4L:'A4 landscape',A4P:'A4 portrait'}[cfg.paper]||'A5 landscape';
  pg.textContent=`@page{size:${paper};margin:${cfg.marginMm}mm}`;
  window.print();
}

// ---- تنظیم چاپ فیش (فقط مدیر) ----
const SC_TC_PAPERS=[['A5L','A5 افقی'],['A5P','A5 عمودی'],['A4L','A4 افقی'],['A4P','A4 عمودی']];
const SC_TC_COLS=['A','B','C','D','E','F'];
function scTcHtml(s){
  const sel=(n,opts,val)=>`<select name="${n}">${opts.map(([v,t])=>`<option value="${v}" ${String(v)===String(val)?'selected':''}>${t}</option>`).join('')}</select>`;
  const colOpts=SC_TC_COLS.map((c,i)=>[i+1,c]);
  const rowOpts=Array.from({length:7},(_,i)=>[i+1,String(i+1)]);
  return `<form id="scTcForm" class="sc2-tc" novalidate>
    <div class="sc2-tc-grid">
      <label class="sc2-field"><span>عنوان فیش</span><input name="title" maxlength="80" value="${esc(s.title)}"></label>
      <label class="sc2-field"><span>اندازه کاغذ</span>${sel('paper',SC_TC_PAPERS,s.paper)}</label>
      <label class="sc2-field"><span>حاشیه (میلی‌متر)</span><input name="marginMm" type="number" min="0" max="25" step="1" value="${s.marginMm}"></label>
      <label class="sc2-field"><span>اندازه قلم (پوینت)</span><input name="fontPt" type="number" min="6" max="16" step="0.5" value="${s.fontPt}"></label>
    </div>
    <h4 class="sc2-tc-h">عرض ستون‌ها (میلی‌متر) — ستون A سمت راست است</h4>
    <div class="sc2-tc-grid sc2-tc-six">${SC_TC_COLS.map((c,i)=>`<label class="sc2-field"><span>ستون ${c}</span><input name="w${i}" type="number" min="10" max="120" step="1" value="${s.colsMm[i]}"></label>`).join('')}</div>
    <h4 class="sc2-tc-h">ارتفاع ردیف‌ها (میلی‌متر)</h4>
    <div class="sc2-tc-grid sc2-tc-seven">${s.rowsMm.map((v,i)=>`<label class="sc2-field"><span>ردیف ${i+1}</span><input name="h${i}" type="number" min="3" max="40" step="1" value="${v}"></label>`).join('')}</div>
    <h4 class="sc2-tc-h">فیلدها: برچسب، نمایش و محل (ستون و ردیف)</h4>
    <div class="sc2-tc-fields">${s.fields.map((f,i)=>`<div class="sc2-tc-field">
      <label class="sc2-check"><input type="checkbox" name="show${i}" ${f.show?'checked':''}><span>نمایش</span></label>
      <label class="sc2-field"><span>برچسب</span><input name="label${i}" maxlength="40" value="${esc(f.label)}"></label>
      <label class="sc2-field"><span>ستون</span>${sel('fcol'+i,colOpts,f.col)}</label>
      <label class="sc2-field"><span>ردیف</span>${sel('frow'+i,rowOpts,f.row)}</label>
    </div>`).join('')}</div>
    <div id="scTcMsg" class="sc-msg" hidden></div>
    <div class="sc-actions">
      <button type="button" class="sc-secondary" data-sc="tc-save">ذخیره تنظیمات</button>
      <button type="button" class="sc-ghost" data-sc="tc-preview">چاپ آزمایشی</button>
      <button type="button" class="sc-ghost" data-sc="tc-reset">بازگشت به پیش‌فرض</button>
    </div>
    <p class="sc2-hint">دو فیلد نمایش‌داده‌شده نمی‌توانند در یک خانه باشند. تنظیمات ذخیره‌شده برای همه‌ی دستگاه‌ها و کاربران باسکول اعمال می‌شود.</p>
  </form>`;
}
function scTcMsgSet(text,kind){ const m=$('#scTcMsg'); if(!m) return; m.hidden=!text; m.textContent=text||''; m.className='sc-msg '+(kind||''); }
async function scTcLoad(){
  const body=$('#scTcBody'); if(!body) return;
  try{ const cfg=(await api('/api/weighbridge/ticket-settings')).settings; app.sc.ticket=cfg; body.innerHTML=scTcHtml(cfg); }
  catch(e){ body.innerHTML=`<p class="sc2-empty-line">${esc(e.message)}</p>`; }
}
function scTcRead(){
  const f=$('#scTcForm'); const g=n=>f.elements[n].value;
  const base=app.sc.ticket;
  return {
    title:g('title'), paper:g('paper'), marginMm:Number(g('marginMm')), fontPt:Number(g('fontPt')),
    colsMm:[0,1,2,3,4,5].map(i=>Number(g('w'+i))),
    rowsMm:[0,1,2,3,4,5,6].map(i=>Number(g('h'+i))),
    fields:base.fields.map((x,i)=>({key:x.key,label:g('label'+i),show:f.elements['show'+i].checked,col:Number(g('fcol'+i)),row:Number(g('frow'+i))})),
  };
}
function scSampleTrip(){ const now=new Date().toISOString(); return {plate:'12ب345-67',driverName:'علی تست',customerName:'شرکت نمونه',firstAt:now,closedAt:now,loadedKg:32000,emptyKg:12000,netKg:20000}; }
async function scWeigh(){
  if(app.sc.busy) return;
  const plate=en($('#scPlate')?.value||'').trim(); const productId=$('#scProduct')?.value||'';
  if(!plate) return scSetMsg('پلاک وسیله را وارد کنید.','err');
  const st=app.sc.state; const isOpen=!!st?.open.some(t=>t.plate===plate);
  if(!isOpen && !productId) return scSetMsg('برای ورود وسیله، کالا را انتخاب کنید.','err');
  const btn=$('#scWeighBtn'); app.sc.busy=true; if(btn) btn.disabled=true;
  try{
    const customerName=isOpen?undefined:(($('#scCustomer')?.value||'').trim()||undefined);
    const r=await api('/api/weighbridge/weigh',{method:'POST',body:JSON.stringify({plate,productId:isOpen?undefined:productId,customerName})});
    if(r.phase==='ENTRY') scSetMsg(`وزن اول ثبت شد: ${qty(r.trip.firstWeight)} کیلوگرم. با وزن دوم (خروج)، بار و خالی و خالص مشخص می‌شود.`,'ok');
    else scSetMsg(`خروج ثبت شد. خالص بار: ${qty(r.trip.netKg)} کیلوگرم.`,'ok');
    if(isOpen){$('#scExistingPlate').value='';$('#scManualEditor').innerHTML=plateEditorHtml();$('#scManualType').value='خودرو';scBindPlateEditors();scSyncPlate();} else { const cu=$('#scCustomer'); if(cu) cu.value=''; }
    await scRefresh();
  }catch(e){ scSetMsg(e.message,'err') }
  finally{ app.sc.busy=false; if(btn) btn.disabled=false; }
}
if(!window.__scBound){
  window.__scBound=true;
  document.addEventListener('click', async e=>{
    const t=e.target.closest && e.target.closest('[data-sc]'); if(!t) return;
    const a=t.dataset.sc;
    if(a==='weigh') return scWeigh();
    if(a==='print'){ const trip=(app.sc.state?.done||[]).find(x=>x.id===t.dataset.id); if(trip) scPrintTicket(trip, app.sc.state).catch(()=>{}); else scSetMsg('فیش این وزن‌کشی پیدا نشد.','err'); return; }
    if(a==='tc-save'){ try{ const r=await api('/api/weighbridge/ticket-settings',{method:'PUT',body:JSON.stringify({settings:scTcRead()})}); app.sc.ticket=r.settings; scTcMsgSet('تنظیمات چاپ فیش ذخیره شد.','ok'); }catch(err){ scTcMsgSet(err.message,'err') } return; }
    if(a==='tc-preview'){ let cfg; try{ cfg=scTcRead(); }catch(err){ return scTcMsgSet(err.message,'err'); } if(cfg.colsMm.concat(cfg.rowsMm,[cfg.marginMm,cfg.fontPt]).some(v=>!Number.isFinite(v))) return scTcMsgSet('یکی از مقادیر عددی نامعتبر است.','err'); scPrintTicket(scSampleTrip(), app.sc.state, cfg).catch(()=>{}); return; }
    if(a==='tc-reset'){ if(!confirm('تنظیمات چاپ فیش به پیش‌فرض برگردد؟')) return; try{ const r=await api('/api/weighbridge/ticket-settings',{method:'PUT',body:JSON.stringify({settings:{}})}); app.sc.ticket=r.settings; $('#scTcBody').innerHTML=scTcHtml(r.settings); scTcMsgSet('تنظیمات به پیش‌فرض برگشت.','ok'); }catch(err){ scTcMsgSet(err.message,'err') } return; }
    if(a==='pick'){ const sel=$('#scProduct'); if(sel && !t.disabled){ sel.value=t.dataset.id; scMarkTile(); scRefresh(); } return; }
    if(a==='add-vehicle'){
      let plate;try{plate=en(plateEditorValue($('#scNewEditor'),{required:true})).trim();}catch(err){return scSetMsg(err.message,'err');} const key=x=>en(x||'').replace(/[\s-]/g,'');if((app.sc.state?.vehicles||[]).some(x=>key(x.plate)===key(plate)))return scSetMsg('این پلاک قبلاً ثبت شده است؛ آن را از فهرست انتخاب کنید.','err'); const driverName=$('#scNewDriver')?.value.trim()||'';
      try{ await api('/api/weighbridge/vehicles',{method:'POST',body:JSON.stringify({plate,driverName})}); $('#scNewEditor').innerHTML=plateEditorHtml();$('#scNewType').value='خودرو';scBindPlateEditors();$('#scNewDriver').value=''; scSetMsg('وسیله ثبت شد.','ok'); app.sc.sig=''; await scRefresh(); }catch(err){ scSetMsg(err.message,'err') }
      return;
    }
    if(a==='add-product'){
      const quickCode=$('#scPCode')?.value.trim(); const name=$('#scPName')?.value.trim(); const defaultUnit=$('#scPUnit')?.value||'کیلوگرم';
      try{ await api('/api/admin/products',{method:'POST',body:JSON.stringify({quickCode,name,defaultUnit})}); $('#scPCode').value=''; $('#scPName').value=''; scSetMsg('کالا به کاتالوگ اضافه شد.','ok'); app.sc.sig=''; await scRefresh(); }catch(err){ scSetMsg(err.message,'err') }
      return;
    }
    if(a==='cancel'){
      const reason=prompt('دلیل لغو این وزن‌کشی؟'); if(!reason) return;
      try{ await api('/api/weighbridge/trips/'+t.dataset.id+'/cancel',{method:'POST',body:JSON.stringify({reason})}); scSetMsg('وزن‌کشی لغو شد.','ok'); await scRefresh(); }catch(err){ scSetMsg(err.message,'err') }
      return;
    }
    if(a==='sim'){
      const weight=Number(en($('#scSimW')?.value||'0')); const stable=t.dataset.stable==='1';
      try{ await api('/api/weighbridge/simulate',{method:'POST',body:JSON.stringify({weight,stable})}); await scRefresh(); }catch(err){ scSetMsg(err.message,'err') }
      return;
    }
  });
  document.addEventListener('input', e=>{
    if(e.target?.closest('#scManualEditor')){scSyncPlate();scRefresh();}
    if(e.target && e.target.id==='scTileSearch'){ const q=en(e.target.value||'').trim().toLowerCase(); document.querySelectorAll('.sc2-tile').forEach(t=>{ t.hidden = !!q && !t.textContent.toLowerCase().includes(q); }); }
  });
  document.addEventListener('change', e=>{ if(e.target?.id==='scExistingPlate'||e.target?.id==='scManualType'||e.target?.closest('#scManualEditor')){scSyncPlate();scRefresh();} if(e.target && e.target.id==='scProduct') { scMarkTile(); scRefresh(); } });
  document.addEventListener('toggle', e=>{ if(e.target && e.target.id==='scTcDetails' && e.target.open) scTcLoad(); }, true);
}

/* ================================================================
   v37.3.4 — کارتابل انبار: سربرگ «سوابق و گزارش»
   سفارش‌هایی که وزن نهایی‌شان در انبار ثبت شده + ارجاع‌های انبار به فروش،
   با بازهٔ تاریخ شمسی، جستجو، خلاصهٔ کالاها و گزارش قابل چاپ.
   ================================================================ */
app.whHist = app.whHist || { range:'today', from:'', to:'', q:'', result:'', data:null, seq:0 };
function whhKey(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function whhRange(kind){
  const t=serverNow(); const back=(n)=>{ const d=new Date(t); d.setDate(d.getDate()-n); return whhKey(d); };
  if(kind==='yesterday') return [back(1),back(1)];
  if(kind==='week') return [back(6),whhKey(t)];
  if(kind==='month') return [back(29),whhKey(t)];
  return [whhKey(t),whhKey(t)];
}
function whhRangeText(from,to){ return from===to?dateLabel(from):`${dateLabel(from)} تا ${dateLabel(to)}`; }
function whhTime(iso){ try{ const d=new Date(iso); return fa(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`); }catch{ return '—'; } }
function whhItemsHtml(items,isStore,orderId,allowReopen){
  // v37.36.0 — برای سفارش فروشگاه، وزن هر سرویس ستون خودش را دارد (همان دادهٔ جزئیات فروش)
  const svc=!!isStore&&(items||[]).some(i=>i.r1Kg!=null||i.r2Kg!=null);
  return `<div class="table-wrap"><table class="whh-table whh-items"><thead><tr><th>کالا</th><th>درخواستی</th>${svc?'<th>وزن سرویس اول</th><th>وزن سرویس دوم</th>':''}<th>وزن تحویلی</th><th>وضعیت</th></tr></thead><tbody>${items.map(i=>`<tr class="${i.outOfStock?'is-oos':''}"><td data-label="کالا">${esc(i.productName)}</td><td data-label="درخواستی">${qty(i.requestedQty)} ${esc(i.requestedUnit||'')}</td>${svc?`<td data-label="وزن سرویس اول">${i.outOfStock||!(Number(i.r1Kg)>0)?'—':qty(i.r1Kg)+' کیلوگرم'}</td><td data-label="وزن سرویس دوم">${i.outOfStock||!(Number(i.r2Kg)>0)?'—':qty(i.r2Kg)+' کیلوگرم'}</td>`:''}<td data-label="وزن تحویلی">${i.outOfStock?'—':qty(i.deliveredKg)+' کیلوگرم'}</td><td data-label="وضعیت">${i.outOfStock?'<span class="badge red">ناموجود</span>':'<span class="badge green">تحویل شد</span>'}${allowReopen&&i.reopenBlocked?' <span>بازگشت از صفر ممکن نیست؛ وزن ارسال شده یا سفارش بسته است.</span>':''}${allowReopen&&i.reopenRun?` <button type="button" class="btn btn-secondary btn-sm" data-action="sr38-reopen-history" data-id="${esc(orderId)}" data-item="${esc(i.itemId)}">بازگشت به وزن‌کشی${i.reopenRun===2?' سرویس دوم':''}</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
}
function whhDocumentDetailsActions(r){
  if(r.orderType==='STORE')return (r.printRuns||[]).map(run=>`<button type="button" class="btn btn-secondary btn-sm" data-action="wh-history-store-document" data-id="${esc(r.id)}" data-run="${run}">${icon('eye',14)} جزئیات سرویس ${run===2?'دوم':'اول'}</button>`).join('');
  if(['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','RETURNED_TO_SALES'].includes(r.status))return '';
  return `<button type="button" class="btn btn-secondary btn-sm" data-action="wh-history-document" data-id="${esc(r.id)}">${icon('eye',14)} جزئیات</button>`;
}
const WHH_EVENT_LABELS={CREATE_VISIT:'ثبت مراجعه',CREATE_ORDER:'ثبت سفارش حضوری',CREATE_REMOTE_ORDER:'ثبت سفارش غیرحضوری',CREATE_STORE_ORDER:'ثبت سفارش فروشگاه',UPDATE_STORE_ORDER:'ویرایش سفارش فروشگاه',SALES_EDIT_STORE_ORDER:'اصلاح سفارش فروشگاه توسط فروش',APPROVE_STORE_ORDER:'تأیید فروشگاه',QUICK_SEND_STORE_ORDER:'ارسال سریع به انبار',WAREHOUSE_ACCEPT_ORDER:'دریافت سفارش در انبار',WAREHOUSE_START_PREPARING:'شروع آماده‌سازی',WAREHOUSE_DRAFT_SAVED:'ذخیرهٔ پیش‌نویس وزن',WAREHOUSE_FINALIZE:'ثبت وزن نهایی انبار',WAREHOUSE_DOCUMENT_EDITED:'اصلاح سند انبار',WAREHOUSE_DOCUMENT_EDIT_REQUESTED:'درخواست اصلاح سند',REOPEN_WAREHOUSE_PREPARING:'بازگشایی آماده‌سازی',RETURN_TO_SALES:'ارجاع به فروش',RESUBMIT_TO_WAREHOUSE:'ارسال مجدد به انبار',WAREHOUSE_PHYSICAL_HANDOVER:'تحویل فیزیکی از انبار',TRANSPORT_WAREHOUSE_HANDOVER:'تحویل به راننده',TRANSPORT_PLAN_ASSIGNED:'تخصیص راننده',STORE_RUN_R1_WEIGHT:'ثبت وزن سرویس اول',STORE_RUN_R2_WEIGHT:'ثبت وزن سرویس دوم',STORE_RUN_R1_SEND:'ارسال سرویس اول',STORE_RUN_R2_SEND:'ارسال سرویس دوم',STORE_RUN_MOVE_R2:'انتقال قلم به سرویس دوم',STORE_RUN_ITEM_COMPLETED:'تکمیل قلم فروشگاه',STORE_RUN_OUT_OF_STOCK:'ثبت عدم موجودی',STORE_RUN_DAY_FINALIZED:'پایان عملیات انبار فروشگاه',STORE_ORDER_OUT_OF_STOCK:'ثبت ناموجودی سفارش فروشگاه',STORE_PARTIAL_OUT_OF_STOCK:'ثبت ناموجودی سفارش جزئی'};
function whhActorName(user){return user?.name||user?.username||'ثبت‌کنندهٔ نامشخص';}
function whhOrderEventDetailsHtml(event){
  const details=event.details||{};
  if(!Object.keys(details).length)return '';
  return `<details class="whh-event-details"><summary>جزئیات ثبت‌شده</summary><pre dir="ltr">${esc(JSON.stringify(details,null,2))}</pre></details>`;
}
function whhHistoryItemsHtml(items){
  const rows=(items||[]).map(item=>{
    const status=item.outOfStock?'ناموجود':(item.status==='DELIVERED'?'تحویل‌شده':item.status||'—');
    const logs=[...(item.runR1||[]).map(entry=>({...entry,runLabel:'سرویس اول'})),...(item.runR2||[]).map(entry=>({...entry,runLabel:'سرویس دوم'}))];
    const weighing=item.weighings?`<details class="whh-event-details"><summary>جزئیات توزین</summary><pre dir="ltr">${esc(JSON.stringify(item.weighings,null,2))}</pre></details>`:'';
    const runHistory=logs.map(entry=>`<div class="whh-weight-log"><b>${entry.runLabel}</b><span>${qty(entry.kg)} کیلوگرم</span><small>${esc(formatDateTime24(entry.at))} · ${esc(whhActorName(entry.user))}</small>${entry.note?`<small>${esc(entry.note)}</small>`:''}${entry.weighings?`<pre dir="ltr">${esc(JSON.stringify(entry.weighings,null,2))}</pre>`:''}</div>`).join('');
    return `<tr><td>${esc(item.productName||'—')}</td><td>${qty(item.requestedQty)} ${esc(item.requestedUnit||'')}</td><td>${item.outOfStock?'—':`${qty(item.deliveredKg)} کیلوگرم`}</td><td>${esc(status)}${item.description?`<small class="whh-item-description">${esc(item.description)}</small>`:''}${weighing}${runHistory?`<details class="whh-event-details"><summary>سوابق وزن‌کشی و ثبت‌کننده</summary>${runHistory}</details>`:''}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="whh-table whh-order-items"><thead><tr><th>کالا</th><th>مقدار درخواستی</th><th>وزن نهایی</th><th>وضعیت و ریز توزین</th></tr></thead><tbody>${rows||'<tr><td colspan="4">قلمی در سفارش ثبت نشده است.</td></tr>'}</tbody></table></div>`;
}
async function openWarehouseHistoryOrder(id){
  try{
    const data=await api('/api/warehouse/history/'+encodeURIComponent(id));
    const o=data.order||{},c=data.customer||{},visit=data.visit||{};
    const typeLabels={ONSITE:'حضوری',REMOTE:'غیرحضوری',STORE:'فروشگاهی'};
    const detailCell=(label,value)=>`<div class="whh-detail-cell"><small>${label}</small><b>${value||'—'}</b></div>`;
    const customerFields=[
      ['کد مشتری',c.code],['نام و نام خانوادگی',c.name],['شماره تماس',c.phone],['شماره تماس دوم',c.phone2],['کد ملی',c.nationalId],
      ['شرکت / واحد',c.company],['پلاک',c.plate],['نوع وسیله',c.vehicleType],['نوع خودرو',c.carType],['نشانی',c.address],['یادداشت مشتری',c.notes],
    ].map(([label,value])=>detailCell(label,esc(label.includes('تماس')||label==='کد ملی'||label==='کد مشتری'?fa(value||''):value||'—'))).join('');
    const orderFields=[
      detailCell('نوع سفارش',esc(typeLabels[o.orderType]||o.orderType||'—')),
      detailCell('وضعیت فعلی',badge(o.status)),
      detailCell('شماره سفارش',esc(fa(o.orderNo||'—'))),
      detailCell('شماره سند انبار',esc(fa(o.warehouseDocumentNo||'—'))),
      detailCell('فروشگاه',esc(o.storeName||'—')),
      detailCell('تاریخ و ساعت ثبت سفارش',esc(formatDateTime24(o.createdAt))),
      detailCell('زمان تحویل برنامه‌ریزی‌شده',esc(formatDateTime24(o.scheduledAt||o.deliveryDate||o.scheduledDate))),
      detailCell('محل ارسال',esc(o.dispatchPlace||'—')),
      detailCell('یادداشت سفارش',esc(o.notes||'—')),
      detailCell('ثبت مراجعه',esc(formatDateTime24(visit.createdAt))),
    ].join('');
    const stages=(data.stages||[]).map(stage=>`<li><b>${esc(stage.label)}</b><small>${esc(formatDateTime24(stage.at))} · ثبت‌کننده: ${esc(whhActorName(stage.user))}</small></li>`).join('')||'<li>مرحلهٔ ثبت‌شده‌ای در دسترس نیست.</li>';
    const events=(data.events||[]).map(event=>`<li><div class="whh-event-head"><b>${esc(WHH_EVENT_LABELS[event.action]||event.action||'اقدام')}</b><small>${esc(formatDateTime24(event.createdAt))} · ثبت‌کننده: ${esc(whhActorName(event.user))}</small></div>${whhOrderEventDetailsHtml(event)}</li>`).join('')||'<li>رویداد ممیزی برای این سفارش موجود نیست.</li>';
    openModal(`جزئیات سفارش ${fa(o.orderNo||'')}`,`<div class="whh-order-detail">
      <section><h3>مشخصات سفارش</h3><div class="whh-detail-grid">${orderFields}</div><p class="whh-detail-actor"><b>ثبت‌کنندهٔ سفارش:</b> ${esc(whhActorName(o.createdBy))}</p></section>
      <section><h3>اطلاعات کامل مشتری</h3><div class="whh-detail-grid">${customerFields}</div></section>
      ${visit.id?`<section><h3>اطلاعات مراجعهٔ مرتبط</h3><div class="whh-detail-grid">${detailCell('هدف مراجعه',esc(visit.purpose||'—'))}${detailCell('پلاک ثبت‌شده در مراجعه',esc(visit.plate||'—'))}${detailCell('نوع وسیله',esc(visit.vehicleType||'—'))}${detailCell('محل ارسال',esc(o.dispatchPlace||'—'))}<p class="whh-detail-actor"><b>ثبت‌کنندهٔ مراجعه:</b> ${esc(whhActorName(visit.createdBy))}</p></div></section>`:''}
      <section><h3>اقلام و وزن‌کشی</h3>${whhHistoryItemsHtml(data.items||[])}</section>
      <section><h3>مراحل سفارش</h3><ol class="whh-order-timeline">${stages}</ol></section>
      <section><h3>همهٔ رویدادهای ثبت‌شده</h3><ol class="whh-order-events">${events}</ol></section>
      <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="close-modal">بستن</button></div>
    </div>`);
  }catch(err){toast(err.message);}
}
function whhBody(d,opts){
  const s=d.summary||{};
  const kpis=[['receipt','تحویل به فروش',qty(s.orders||0),''],['scale','وزن کل تحویلی',qty(s.deliveredKg||0),'کیلوگرم'],['warehouse','اقلام ثبت‌شده',qty(s.itemCount||0),'قلم'],['info','اقلام ناموجود',qty(s.outOfStock||0),'قلم'],['arrow','ارجاع به فروش',qty(s.returned||0),'مورد']]
    .map(([ic,l,v,u],k)=>`<div class="whh-kpi ${k===3&&s.outOfStock?'is-warn':''}"><span class="whh-kpi-ico">${icon(ic,18)}</span><div><small>${l}</small><b>${v}${u?` <em>${u}</em>`:''}</b></div></div>`).join('');
  // v1.1.13 — سوابق انبار با سیستم جدول مشترک bt-table؛ اقلام هر سفارش در ردیف
  // بازشوندهٔ بلافاصله زیر همان ردیف نمایش داده می‌شود (بدون کارت‌های چندخطی).
  const recs=(d.rows||[]).map(r=>{
    const actions=[
      `<button type="button" class="btn btn-secondary btn-sm" data-whh-order-details data-id="${esc(r.id)}">${icon('eye',14)} جزئیات سفارش</button>`,
      r.orderType==='STORE'?storeServicePrintButtons(r.id,r.printRuns||[],r.storeOrderKind):'',
      whhDocumentDetailsActions(r),
      `<button type="button" class="btn btn-secondary btn-sm" data-whh-detail aria-expanded="false" aria-controls="whhDetails-${esc(r.id)}">نمایش اقلام</button>`
    ].filter(Boolean).join('');
    return `<tr data-order="${esc(r.id)}">
      <td data-label="تاریخ و ساعت"><span class="bt-cell-main">${esc(dateLabel(r.day))}</span><span class="bt-cell-sub">${whhTime(r.completedAt)}</span></td>
      <td data-label="شماره سفارش"><span class="bt-cell-main order-code">${esc(fa(r.orderNo||'—'))}</span></td>
      <td data-label="نام مشتری"><span class="bt-cell-main" title="${esc(r.customerName||'—')}">${esc(r.customerName||'—')}</span></td>
      <td data-label="وزن تحویلی"><span class="bt-cell-main">${qty(r.deliveredKg)} <small>کیلوگرم</small></span>${r.outOfStock?`<span class="bt-cell-sub">ناموجود: ${qty(r.outOfStock)} قلم</span>`:''}</td>
      <td data-label="ثبت‌کننده"><span class="bt-cell-main">${esc(r.completedBy||'—')}</span></td>
      <td data-label="عملیات" class="bt-col-actions"><div class="bt-actions">${actions}</div></td>
    </tr>
    <tr class="bt-expand-row" hidden><td colspan="6"><div class="whh-details" id="whhDetails-${esc(r.id)}">${whhItemsHtml(r.items,r.orderType==='STORE',r.id,opts?.allowReopen)}</div></td></tr>`;
  }).join('');
  const list=recs?`<div class="bt-table-wrap"><table class="bt-table whh-orders-table">
    <caption class="bt-caption">سوابق سفارش‌های انبار</caption>
    <thead><tr><th scope="col">تاریخ و ساعت</th><th scope="col">شماره سفارش</th><th scope="col">نام مشتری</th><th scope="col">وزن تحویلی</th><th scope="col">ثبت‌کننده</th><th scope="col" class="bt-col-actions">عملیات</th></tr></thead>
    <tbody>${recs}</tbody>
  </table></div>`:sdEmpty('receipt','سابقه‌ای در این بازه نیست','بازهٔ تاریخ را تغییر دهید یا عبارت جستجو را پاک کنید.');
  const prod=(s.byProduct||[]).map(p=>`<tr><td data-label="کالا">${esc(p.productName)}</td><td data-label="سفارش">${qty(p.orders)}</td><td data-label="وزن (کیلوگرم)">${qty(p.deliveredKg)}</td><td data-label="ناموجود">${p.outOfStock?`<b class="danger-text">${qty(p.outOfStock)}</b>`:'—'}</td></tr>`).join('');
  const rets=(d.returns||[]).map(x=>`<li><div><span class="order-code">${esc(fa(x.orderNo))}</span><b>${esc(x.customerName)}</b></div><p>${esc(x.reason||'بدون توضیح')}</p><small>${esc(formatDateTime24(x.at))} • ${esc(x.by)}</small></li>`).join('');
  return `<div class="whh-kpis">${kpis}</div>
    <div class="whh-grid">
      <section class="sd-panel whh-orders"><div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico">${icon('receipt',20)}</span><div><h2>${esc(opts&&opts.title||'سوابق سفارش‌های انبار')}</h2><p>${whhRangeText(d.from,d.to)} — ${esc(opts&&opts.sub||'سفارش‌هایی که وزن نهایی‌شان ثبت و به تسویهٔ فروش ارسال شده است.')}</p></div></div><div class="sd-count"><strong>${qty(s.orders||0)}</strong><span>سفارش</span></div></div>
        <div class="whh-table-host">${list}</div></section>
      <aside class="whh-side">
        <section class="sd-panel"><div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico">${icon('scale',19)}</span><div><h2>خلاصهٔ کالاها</h2><p>جمع وزن تحویلی هر کالا در این بازه</p></div></div></div>
          ${prod?`<div class="table-wrap"><table class="whh-table whh-prod"><thead><tr><th>کالا</th><th>سفارش</th><th>وزن (کیلو)</th><th>ناموجود</th></tr></thead><tbody>${prod}</tbody></table></div>`:'<p class="whh-none">کالایی در این بازه ثبت نشده است.</p>'}</section>
        <section class="sd-panel"><div class="sd-head"><div class="sd-head-main"><span class="sd-head-ico">${icon('arrow',19)}</span><div><h2>ارجاع‌ها به فروش</h2><p>سفارش‌هایی که انبار برای اصلاح برگرداند</p></div></div><div class="sd-count"><strong>${qty(s.returned||0)}</strong><span>مورد</span></div></div>
          ${rets?`<ul class="whh-returns">${rets}</ul>`:'<p class="whh-none">در این بازه ارجاعی ثبت نشده است.</p>'}</section>
      </aside>
    </div>`;
}
async function renderWarehouseHistory(){
  const host=$('#wh38Body')||$('#content'); if(!host) return;
  const st=app.whHist;
  if(!st.from||!st.to){ [st.from,st.to]=whhRange(st.range||'today'); }
  const ranges=[['today','امروز'],['yesterday','دیروز'],['week','۷ روز اخیر'],['month','۳۰ روز اخیر']];
  host.innerHTML=`<section class="whh">
    <div class="sd-panel whh-toolbar">
      <div class="whh-ranges" role="group" aria-label="بازهٔ سریع">${ranges.map(([k,l])=>`<button type="button" class="whh-range ${st.range===k?'active':''}" data-action="wh-history-range" data-range="${k}">${l}</button>`).join('')}</div>
      <label class="adm-date">از<input type="date" id="whhFrom" value="${esc(st.from)}"></label>
      <label class="adm-date">تا<input type="date" id="whhTo" value="${esc(st.to)}"></label>
      <select class="adm-select" id="whhResult" aria-label="نوع سفارش"><option value="">همهٔ سفارش‌ها</option><option value="oos" ${st.result==='oos'?'selected':''}>فقط دارای قلم ناموجود</option></select>
      <div class="input-shell whh-search"><span>${icon('search',16)}</span><input id="whhQ" type="search" placeholder="سفارش، مشتری یا کالا" value="${esc(st.q)}"></div>
      <button type="button" class="btn btn-primary whh-print" data-action="wh-history-print">${icon('receipt',16)} چاپ گزارش</button>
    </div>
    <div id="whhBody"><div class="whh-loading">در حال دریافت سوابق…</div></div>
  </section>`;
  const reload=()=>loadWarehouseHistory();
  $('#whhFrom').addEventListener('change',e=>{ st.from=e.target.value||st.from; st.range=''; markWhhRange(); reload(); });
  $('#whhTo').addEventListener('change',e=>{ st.to=e.target.value||st.to; st.range=''; markWhhRange(); reload(); });
  $('#whhResult').addEventListener('change',e=>{ st.result=e.target.value; reload(); });
  let tq=null; $('#whhQ').addEventListener('input',e=>{ st.q=e.target.value; clearTimeout(tq); tq=setTimeout(reload,300); });
  host.querySelector('.whh').addEventListener('click',e=>{
    const el=e.target.closest('[data-action]'); if(!el) return;
    if(el.dataset.action==='wh-history-range'){ st.range=el.dataset.range; [st.from,st.to]=whhRange(st.range); renderWarehouseHistory(); }
    else if(el.dataset.action==='wh-history-print'){ printWarehouseHistory(); }
  });
  await loadWarehouseHistory();
}
function markWhhRange(){ $$('.whh-range').forEach(b=>b.classList.toggle('active',b.dataset.range===app.whHist.range)); }
async function loadWarehouseHistory(){
  const st=app.whHist; const seq=++st.seq;
  const params=new URLSearchParams({from:st.from,to:st.to}); if(st.q.trim()) params.set('q',st.q.trim()); if(st.result) params.set('result',st.result);
  try{
    const d=await api('/api/warehouse/history?'+params.toString());
    if(seq!==st.seq) return;
    st.data=d; st.from=d.from; st.to=d.to;
    const b=$('#whhBody'); if(b) b.innerHTML=whhBody(d);
  }catch(err){ const b=$('#whhBody'); if(b) b.innerHTML=`<div class="empty">خطا در دریافت سوابق انبار: ${esc(err.message)}</div>`; }
}
document.addEventListener('click',e=>{const orderButton=e.target.closest('[data-whh-order-details]');if(orderButton){e.preventDefault();openWarehouseHistoryOrder(orderButton.dataset.id);return;}const b=e.target.closest('[data-whh-detail]');if(!b)return;const row=b.closest('tr');const expand=row&&row.nextElementSibling;if(!expand||!expand.classList.contains('bt-expand-row'))return;const opening=expand.hidden;expand.hidden=!opening;b.setAttribute('aria-expanded',String(opening));});

function printWarehouseHistory(){
  const d=app.whHist.data; if(!d) return toast('ابتدا سوابق بارگذاری شود.');
  const s=d.summary||{};
  const rows=(d.rows||[]).map((r,k)=>`<tr><td>${fa(k+1)}</td><td>${dateLabel(r.day)} ${whhTime(r.completedAt)}</td><td dir="ltr">${esc(fa(r.orderNo))}</td><td>${esc(r.customerName)}</td><td>${r.items.map(i=>`${esc(i.productName)}: ${i.outOfStock?'<b class="oos">ناموجود</b>':qty(i.deliveredKg)+' کیلو'}`).join('<br>')}</td><td>${qty(r.deliveredKg)}</td><td>${esc(r.completedBy)}</td></tr>`).join('')||'<tr><td colspan="7" class="none">سابقه‌ای در این بازه نیست.</td></tr>';
  const prod=(s.byProduct||[]).map(p=>`<tr><td>${esc(p.productName)}</td><td>${qty(p.orders)}</td><td>${qty(p.deliveredKg)}</td><td>${p.outOfStock?qty(p.outOfStock):'—'}</td></tr>`).join('');
  const rets=(d.returns||[]).map(x=>`<tr><td dir="ltr">${esc(fa(x.orderNo))}</td><td>${esc(x.customerName)}</td><td>${esc(x.reason||'—')}</td><td>${esc(formatDateTime24(x.at))}</td><td>${esc(x.by)}</td></tr>`).join('');
  BTPrintFrame.html(BTPrintDigits.documentHtml(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><title>گزارش انبار ${esc(whhRangeText(d.from,d.to).replace(/<[^>]+>/g,''))}</title><style>
    *{box-sizing:border-box}body{font-family:"B Yekan","Vazirmatn",Tahoma,sans-serif;color:#1b2027;padding:26px;margin:0}
    header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #e30613;padding-bottom:12px;margin-bottom:16px}
    header h1{font-size:21px;margin:0}header p{margin:4px 0 0;color:#555;font-size:12px}header img{width:54px;height:54px;object-fit:contain}
    .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px}.box{border:1px solid #ddd;border-radius:10px;padding:9px 10px;font-size:11px;color:#555}.box strong{display:block;font-size:19px;color:#b40f23;margin-top:3px}
    h2{font-size:14px;margin:18px 0 6px;border-right:4px solid #e30613;padding-right:8px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #d8d8d8;padding:6px 7px;font-size:11px;text-align:right;vertical-align:top}th{background:#f4f4f4}
    .oos{color:#b4232d}.none{text-align:center;color:#777}footer{margin-top:22px;font-size:10px;color:#777;display:flex;justify-content:space-between}
    @media print{body{padding:0}tr{page-break-inside:avoid}}</style></head><body>
    <header><div><h1>گزارش سوابق انبار — بابل طیور</h1><p>بازه: ${whhRangeText(d.from,d.to)}${app.whHist.q?` • جستجو: «${esc(app.whHist.q)}»`:''}${app.whHist.result==='oos'?' • فقط سفارش‌های دارای قلم ناموجود':''}</p></div><img src="/logo.png" alt=""></header>
    <div class="grid"><div class="box">سفارش تحویل‌شده<strong>${qty(s.orders||0)}</strong></div><div class="box">وزن کل (کیلوگرم)<strong>${qty(s.deliveredKg||0)}</strong></div><div class="box">اقلام ثبت‌شده<strong>${qty(s.itemCount||0)}</strong></div><div class="box">اقلام ناموجود<strong>${qty(s.outOfStock||0)}</strong></div><div class="box">ارجاع به فروش<strong>${qty(s.returned||0)}</strong></div></div>
    <h2>سفارش‌ها</h2><table><thead><tr><th>#</th><th>زمان ثبت وزن</th><th>سفارش</th><th>مشتری</th><th>اقلام و وزن تحویلی</th><th>جمع (کیلو)</th><th>ثبت‌کننده</th></tr></thead><tbody>${rows}</tbody></table>
    ${prod?`<h2>خلاصهٔ کالاها</h2><table><thead><tr><th>کالا</th><th>تعداد سفارش</th><th>وزن تحویلی (کیلو)</th><th>ناموجود</th></tr></thead><tbody>${prod}</tbody></table>`:''}
    ${rets?`<h2>ارجاع‌ها به فروش</h2><table><thead><tr><th>سفارش</th><th>مشتری</th><th>دلیل</th><th>زمان</th><th>کاربر</th></tr></thead><tbody>${rets}</tbody></table>`:''}
    <footer><span>تهیه‌کننده: ${esc(app.user?.fullName||app.user?.username||'')}</span><span>تاریخ چاپ: ${esc(todayText())} ${whhTime(new Date(serverEpoch()).toISOString())}</span></footer>
    <script src="/print-ready.js"><\/script></body></html>`));
}
