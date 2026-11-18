'use strict';
// External same-origin script: works with script-src 'self', without unsafe-inline.
(async function () {
  if(document.readyState!=='complete')await new Promise(resolve=>window.addEventListener('load',resolve,{once:true}));
  if(document.fonts?.ready)await document.fonts.ready;
  await Promise.all([...document.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});})));
  if(window.frameElement && window.parent.BTPrintFrame){window.parent.BTPrintFrame.ready(window);return;}
  const tools=document.createElement('div');tools.className='bt-print-tools';
  const button=document.createElement('button');button.type='button';button.textContent='چاپ / ذخیره PDF';button.addEventListener('click',()=>window.print());
  tools.append(button);document.body.prepend(tools);
  const style=document.createElement('style');style.textContent='.bt-print-tools{display:flex;justify-content:center;padding:12px}.bt-print-tools button{font:inherit;padding:8px 20px;cursor:pointer}@media print{.bt-print-tools{display:none!important}}';document.head.append(style);
  // One automatic attempt, plus a persistent manual button if browser policy suppresses it.
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.print()));
})();
