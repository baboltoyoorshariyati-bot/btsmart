'use strict';
// Experimental bridge for an existing transportTransaction only. It does not
// initialise tables, expose routes, authorise users or update the legacy
// transport workflow. Do not enable the feature until those paths are guarded.
const store=require('./store');
const transaction=require('./transport-transaction');
const repository=require('./store-stock-service-repository');

function guarded(work) {
  if (!transaction.isActive()) throw new Error('عملیات سرویس فقط در تراکنش مشترک مجاز است.');
  try { return work(); }
  catch (error) { transaction.markRollbackOnly(error); throw error; }
}
function joinApprovedLocked(orderId,options) {
  return guarded(()=>{
    const service=repository.joinApprovedLocked(store.sql.init(),orderId,options);
    // Capture after approval and membership, but before control returns to the
    // caller. Later legacy writes, including ones in this transaction, fail.
    transaction.checkpointStockMember(orderId);
    return service;
  });
}
function transitionLocked(id,method,options) {
  return guarded(()=>{
    if (!['weigh','unavailable','assign','review','depart','receipt','returnDocuments'].includes(method)) throw new Error('عملیات سرویس ناشناخته است.');
    return repository.transitionLocked(store.sql.init(),id,method,options);
  });
}
function handoverAssignedLocked(id,options) {
  return guarded(()=>repository.handoverAssignedWithNumberLocked(store.sql.init(),id,options,{
    writeCounter(value) { store.get().counters.warehouseDocumentNumber=value; },
  }));
}
function handoverLocked(id,options) {
  // transportTransaction reloads the live store under the SQLite write lock.
  // Update the live counter proxy, not only SQL, so a later save() cannot
  // restore a stale in-memory value. Audit and notifications can be written by
  // the caller in the same transaction and are rolled back together on error.
  return guarded(()=>repository.handoverWithNumberLocked(store.sql.init(),id,options,{
    writeCounter(value) { store.get().counters.warehouseDocumentNumber=value; },
  }));
}
module.exports={joinApprovedLocked,transitionLocked,handoverAssignedLocked,handoverLocked};
