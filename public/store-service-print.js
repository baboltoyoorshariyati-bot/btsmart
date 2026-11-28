'use strict';
(async function(){
  const params=new URLSearchParams(window.frameElement?.dataset.printQuery || location.search),id=params.get('id'),run=Number(params.get('run'));
  const message=document.getElementById('service-message');
  const set=(id,value)=>{document.getElementById(id).textContent=value||'—';};
  const qty=v=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:3}).format(Number(v||0));
  const fa=v=>String(v).replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[d]);
  const date=v=>{if(!v)return '—';const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);const parts=Object.fromEntries(new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(x=>[x.type,x.value]));return `${parts.year}/${parts.month}/${parts.day} • ${parts.hour}:${parts.minute}`;};
  try{
    if(!id || ![1,2].includes(run)) throw Error('شناسهٔ سفارش یا شمارهٔ سرویس معتبر نیست.');
    const response=await fetch('/api/orders/'+encodeURIComponent(id)+'/store-run/print/'+run,{credentials:'same-origin'});
    const data=await response.json();if(!response.ok)throw Error(data.error||'دریافت اطلاعات سرویس ناموفق بود.');
    const d=data.document,partial=d.storeOrderKind==='PARTIAL',label=partial?'سفارش جزئی':run===2?'دوم':'اول';document.title=partial?'برگه وزنی سفارش جزئی':'برگه سرویس '+label;
    if(partial)document.querySelector('#service-run').previousElementSibling.textContent='نوع سفارش';
    set('service-heading',partial?'برگه وزنی سفارش جزئی':'برگه وزنی سرویس '+label);set('service-order',fa(d.orderNo||'—'));set('service-store',d.storeName);set('service-sent',date(d.sentAt));set('service-destination',d.dispatchPlace);set('service-run',label);
    if(Array.isArray(d.sealNumbers)&&d.sealNumbers.length){const seals=document.getElementById('service-seals');seals.textContent='شماره پلمپ: '+d.sealNumbers.map(fa).join('، ');seals.hidden=false;}
    const tbody=document.querySelector('.service-table tbody');
    const lines=groupStorePrintLines(d.lines);
    for(const [i,x] of lines.entries()){
      const tr=document.createElement('tr');
      for(const value of [fa(i+1),x.productName||'—',...['deliveredKg','returnKg','shortageKg','netKg'].map(key=>x[key]==null?'—':qty(x[key]))]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
      tbody.append(tr);
    }
    set('service-total',lines.some(x=>x.deliveredKg==null)?'نامشخص':qty(lines.reduce((sum,x)=>sum+Number(x.deliveredKg||0),0))+' کیلوگرم');
    BTPrintDigits.convert(document.querySelector('.service-sheet'));
    document.title=BTPrintDigits.persian(document.title);
    message.hidden=true;document.querySelector('.service-sheet').hidden=false;
    if(document.fonts?.ready)await document.fonts.ready;
    await Promise.all([...document.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});})));
    if(window.frameElement && window.parent.BTPrintFrame){window.parent.BTPrintFrame.ready(window);return;}
    document.querySelector('.service-tools').hidden=false;
    document.getElementById('service-print-button').addEventListener('click',()=>window.print());
    requestAnimationFrame(()=>requestAnimationFrame(()=>window.print()));
  }catch(e){message.textContent=e.message||'دریافت اطلاعات سرویس ناموفق بود.';if(window.frameElement && window.parent.BTPrintFrame)window.parent.BTPrintFrame.fail(window,message.textContent);}
})();
