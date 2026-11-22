'use strict';
// Only the explicitly reviewed, all-unavailable legacy finalization is exempt.
module.exports = function recoveredFinalizationOnly(order, event) {
 const lines=event.details?.items;
 return !!order.noGoodsRecovery && order.noGoodsRecovery.finalizeAuditId===event.id && event.details?.warehouseDocumentNo===order.noGoodsRecovery.warehouseDocumentNo && Array.isArray(lines) && lines.length>0 && lines.every(l=>l.status==='OUT_OF_STOCK'&&l.deliveredKg!=null&&Number(l.deliveredKg)===0);
};
