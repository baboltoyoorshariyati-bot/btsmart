'use strict';
// Presentation only: never translate attributes, URLs, scripts, styles or stored data.
(function(global){
  const persian=value=>String(value??'').replace(/[0-9٠-٩]/g,c=>'۰۱۲۳۴۵۶۷۸۹'[c>='٠'?c.charCodeAt(0)-0x660:c.charCodeAt(0)-0x30]);
  const excluded=new Set(['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','OPTION']);
  function convert(root,save){
    const doc=root.ownerDocument||root;
    const walker=doc.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let node;while((node=walker.nextNode())){
      let parent=node.parentElement,skip=false;
      while(parent){if(excluded.has(parent.tagName)){skip=true;break;}if(parent===root)break;parent=parent.parentElement;}
      if(skip)continue;
      const translated=persian(node.nodeValue);
      if(translated!==node.nodeValue){if(save)save.push([node,node.nodeValue,translated]);node.nodeValue=translated;}
    }
  }
  function documentHtml(html){
    const doc=new DOMParser().parseFromString(html,'text/html');
    convert(doc.documentElement);
    return '<!doctype html>'+doc.documentElement.outerHTML;
  }
  // Main application printing is temporary: restore all values and text after print.
  let originals=null,controls=[];
  function beforePrint(){
    if(originals)return;originals=[];controls=[];
    convert(document.body,originals);
    for(const el of document.querySelectorAll('input, textarea, select')){
      if(el.type==='hidden'||el.type==='password'||el.type==='file'||el.type==='checkbox'||el.type==='radio')continue;
      if(!el.getClientRects().length)continue;
      const value=el.tagName==='SELECT'?(el.selectedOptions[0]?.textContent||''):el.value;
      if(!/[0-9٠-٩]/.test(value))continue;
      const span=document.createElement('span');span.className='bt-print-value';span.textContent=persian(value);
      const display=el.style.getPropertyValue('display'),priority=el.style.getPropertyPriority('display');
      el.before(span);el.style.setProperty('display','none','important');controls.push([el,span,display,priority]);
    }
  }
  function afterPrint(){
    if(!originals)return;
    for(const [node,text,translated] of originals)if(node.nodeValue===translated)node.nodeValue=text;
    for(const [el,span,display,priority] of controls){span.remove();if(display)el.style.setProperty('display',display,priority);else el.style.removeProperty('display');}
    originals=null;controls=[];
  }
  global.BTPrintDigits={persian,convert,documentHtml,beforePrint,afterPrint};
  global.addEventListener('beforeprint',beforePrint);global.addEventListener('afterprint',afterPrint);
})(window);
