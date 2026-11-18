'use strict';
// The opener renders the same escaped invoice used by the preview and passes it
// through a tab-local sessionStorage snapshot. No invoice data is put in the URL.
(function(){
  const message=document.getElementById('invoice-print-message');
  try{
    const key=window.frameElement?.dataset.printKey || decodeURIComponent(location.hash.slice(1));
    if(!key.startsWith('invoice-print-'))throw Error('اطلاعات فاکتور موجود نیست.');
    const data=JSON.parse(sessionStorage.getItem(key)||'null');
    if(!data || typeof data.html!=='string')throw Error('اطلاعات فاکتور موجود نیست.');
    document.title=String(data.title||'فاکتور');
    document.getElementById('invoice-print-content').innerHTML=data.html;
    message.remove();
    BTPrintDigits.convert(document.getElementById('invoice-print-content'));
    document.title=BTPrintDigits.persian(document.title);
    const script=document.createElement('script');script.src='/print-ready.js';document.body.append(script);
  }catch(e){message.textContent=e.message||'آماده‌سازی فاکتور ناموفق بود.';if(window.frameElement && window.parent.BTPrintFrame)window.parent.BTPrintFrame.fail(window,message.textContent);}
})();
