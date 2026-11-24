'use strict';
// چاپ سند در یک قاب هم‌مبدأ و نامرئی؛ هیچ برگه یا پنجره‌ای باز نمی‌شود.
(function(global){
  let active=null;
  function notify(message){if(typeof global.toast==='function')global.toast(message);}
  function dispose(job){
    if(!job || active!==job)return;
    clearTimeout(job.timer);
    if(job.key)sessionStorage.removeItem(job.key);
    job.frame?.remove();active=null;
  }
  function finish(job,result){
    if(!job||active!==job)return;
    const callback=job.onFinish;dispose(job);
    if(typeof callback==='function')try{callback(result);}catch(e){console.error(e);}
  }
  function begin(options={}){
    if(active){notify('چاپ قبلی هنوز در حال آماده‌سازی است.');return null;}
    const job={key:options.key||'',frame:null,timer:null,started:false,onFinish:options.onFinish};active=job;
    job.timer=setTimeout(()=>{if(active===job){finish(job,'failed');notify('آماده‌سازی چاپ به پایان نرسید؛ دوباره تلاش کنید.');}},30000);
    return job;
  }
  function mount(job,html,options={}){
    if(active!==job)return;
    const frame=document.createElement('iframe');job.frame=frame;
    frame.title='سند آماده چاپ';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
    frame.style.cssText='position:fixed;left:-10000px;top:0;width:1000px;height:1000px;border:0;opacity:0;pointer-events:none;visibility:visible!important';
    if(options.key)frame.dataset.printKey=options.key;
    if(options.query)frame.dataset.printQuery=options.query;
    frame.srcdoc=html;document.body.appendChild(frame);
  }
  function html(source,options={}){const job=begin(options);if(!job)return false;try{mount(job,source);return true;}catch(e){finish(job,'failed');notify('آماده‌سازی چاپ ناموفق بود.');return false;}}
  async function url(path,options={}){
    const job=begin(options);if(!job){if(options.key)sessionStorage.removeItem(options.key);return;}
    try{
      const response=await fetch(path,{credentials:'same-origin'});
      if(!response.ok)throw Error('دریافت صفحهٔ چاپ ناموفق بود.');
      mount(job,await response.text(),options);
    }catch(e){dispose(job);notify(e.message||'آماده‌سازی چاپ ناموفق بود.');}
  }
  function ready(win){
    const job=active;if(!job||job.frame?.contentWindow!==win||job.started)return;
    job.started=true;clearTimeout(job.timer);
    if(job.key){sessionStorage.removeItem(job.key);job.key='';}
    // Keep the document alive until printing/cancellation has finished. Some
    // browsers return from print() before firing afterprint.
    win.addEventListener('afterprint',()=>setTimeout(()=>finish(job,'finished'),1000),{once:true});
    job.timer=setTimeout(()=>finish(job,'timeout'),120000);
    try{win.focus();win.print();}catch(e){finish(job,'failed');notify('باز کردن گفت‌وگوی چاپ ناموفق بود.');}
  }
  function fail(win,message){const job=active;if(job?.frame?.contentWindow!==win)return;finish(job,'failed');notify(message||'آماده‌سازی چاپ ناموفق بود.');}
  global.BTPrintFrame={html,url,ready,fail};
})(window);
