'use strict';
// Display only: historical store names remain untouched in saved orders/users.
const HAMZEH_KOLA_NAME='فروشگاه شعبه 1 حمزه کلا';
function asciiDigits(value){
 return String(value).replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}
function normalizedWords(value){
 return asciiDigits(String(value||'').normalize('NFKC'))
  .replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/[\u200c\u200e\u200f]/g,' ')
  .replace(/[‐‑‒–—-]/g,' ').replace(/\s+/g,' ').trim();
}
function storeDisplayName(value, branchNo) {
 const raw=normalizedWords(value);
 let rest=raw.replace(/^(?:فروشگاه\s+)+/,'').trim();
 const match=rest.match(/^شعبه(?:\s+([0-9]+))?(?:\s+|$)/);
 const branchValue=branchNo??match?.[1]??'';
 const parsed=Number(asciiDigits(branchValue));
 const number=Number.isInteger(parsed)&&parsed>0?parsed:null;
 if(match)rest=rest.slice(match[0].length).trim();
 // Older records used both “حمزه کلا” and “بابل طیور حمزه کلا” for branch 1.
 const place=rest.replace(/^بابل\s+طیور\s+/,'').trim();
 if(place==='حمزه کلا'&&(number===null||number===1))return HAMZEH_KOLA_NAME;
 return ['فروشگاه',number?'شعبه '+number:'',rest].filter(Boolean).join(' ');
}
module.exports={storeDisplayName,HAMZEH_KOLA_NAME};
