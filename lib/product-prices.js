'use strict';
// Effective prices are the latest record on or before the requested local day.
// Future-dated prices never leak into today's settlement or printout.
function effectivePrices(priceList,day){
 const latest=new Map();
 for(const row of priceList||[]){
  if(!row.productId||typeof row.date!=='string'||row.date>day)continue;
  const old=latest.get(row.productId);
  if(!old||row.date>=old.date)latest.set(row.productId,row);
 }
 return latest;
}
module.exports={effectivePrices};
