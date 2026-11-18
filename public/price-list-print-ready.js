'use strict';
// Fit the entire selected list onto the A4 printable area after fonts load.
(async function(){
 try{
  if(document.readyState!=='complete')await new Promise(resolve=>window.addEventListener('load',resolve,{once:true}));
  if(document.fonts?.ready)await document.fonts.ready;
  const sheet=document.querySelector('.pl-sheet'),content=document.querySelector('.pl-content');
  if(!sheet||!content)throw Error('لیست قیمت آماده نشد.');
  const probe=document.createElement('div');probe.style.cssText='position:absolute;width:1mm;height:1mm;visibility:hidden';document.body.append(probe);
  const mm=probe.getBoundingClientRect().height;probe.remove();
  const height=content.getBoundingClientRect().height,available=277*mm-4;
  if(!Number.isFinite(height)||height<=0||!Number.isFinite(available)||available<=0)throw Error('اندازه صفحه چاپ معتبر نیست.');
  // CSS zoom affects layout (unlike transform), so the browser paginates the
  // scaled rows correctly. Widen the unzoomed content to retain A4 width.
  const apply=scale=>{content.style.zoom=String(scale);content.style.width=`${190/scale}mm`;return content.getBoundingClientRect().height;};
  let scale=1;
  if(apply(1)>available){
   let lo=0.01,hi=1;
   for(let n=0;n<18;n++){const mid=(lo+hi)/2;if(apply(mid)<=available)lo=mid;else hi=mid;}
   scale=lo*0.995;apply(scale);
  }
  const finalHeight=content.getBoundingClientRect().height;
  if(finalHeight>available+0.5)throw Error('لیست در یک صفحه جا نشد؛ تعداد اقلام را کمتر کنید.');
  sheet.style.height=`${finalHeight}px`;
  document.documentElement.dataset.pricePrintScale=String(scale);
  if(window.frameElement&&window.parent.BTPrintFrame){window.parent.BTPrintFrame.ready(window);return;}
  window.print();
 }catch(e){if(window.frameElement&&window.parent.BTPrintFrame)window.parent.BTPrintFrame.fail(window,e.message||'آماده‌سازی چاپ ناموفق بود.');}
})();
