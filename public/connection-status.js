'use strict';
(function(){
  // Track only failed reads on the current page. Query strings often change on
  // polling; keying by the complete URL leaves a stale warning forever.
  const failures=new Set();let online=navigator.onLine;let generation=0;
  const key=path=>String(path).split('?')[0];
  function paint(){
    let el=document.getElementById('btConnectionState');
    if(!el){el=document.createElement('div');el.id='btConnectionState';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.append(el);}
    el.hidden=online&&failures.size===0;
    el.textContent=!online?'اتصال شبکه قطع است؛ اطلاعات ممکن است قدیمی باشد. تغییرات ذخیره‌نشده خودکار ارسال نمی‌شوند.':'دریافت برخی اطلاعات ناموفق بود؛ اتصال یا وضعیت سرور را بررسی کنید. اطلاعات نمایش‌داده‌شده ممکن است قدیمی باشد.';
  }
  window.btConnection={
    current(){return generation},
    reset(){generation++;failures.clear();paint()},
    success(path,requestGeneration=generation){if(requestGeneration===generation){failures.delete(key(path));paint()}},
    failure(path,requestGeneration=generation){if(requestGeneration===generation){failures.add(key(path));paint()}},
  };
  window.addEventListener('offline',()=>{online=false;paint()});window.addEventListener('online',()=>{online=true;paint()});
})();
