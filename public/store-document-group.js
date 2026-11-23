'use strict';
// Print-only aggregation. Keep source lines and snapshots unchanged; a missing
// value makes that measure unknown rather than inventing part of a total.
(function(root){
 function group(lines){
  const rows=[],byName=new Map(),fields=['deliveredKg','returnKg','shortageKg','netKg'];
  for(const line of Array.isArray(lines)?lines:[]){
   if(!line||line.outOfStock)continue;
   const name=String(line.productName||'').trim().normalize('NFC');
   const canGroup=name&&name!=='—'&&name!=='کالای حذف‌شده'&&name!=='کالا';
   let target=canGroup?byName.get(name):null;
   if(!target){target={...line};rows.push(target);if(canGroup)byName.set(name,target);continue;}
   for(const key of fields){
    const a=target[key],b=line[key];
    if(a==null||b==null||!Number.isFinite(Number(a))||!Number.isFinite(Number(b))||Number(a)<0||Number(b)<0)target[key]=null;
    // Corrections and legacy weights may contain fractions of a gram. Sum
    // first; the print formatter rounds the final value, not each source row.
    else target[key]=Number((Number(a)+Number(b)).toPrecision(15));
   }
  }
  return rows;
 }
 if(typeof module!=='undefined'&&module.exports)module.exports=group;
 if(root)root.groupStorePrintLines=group;
})(typeof window!=='undefined'?window:null);
