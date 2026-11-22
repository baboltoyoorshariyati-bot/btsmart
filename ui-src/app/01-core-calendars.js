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

