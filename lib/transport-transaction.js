'use strict';
const store=require('./store');
// Synchronous work only. The live store writes through; on failure reload it
// from SQLite after rollback so no partial changes survive in the process.
let active=false;
let requestOwned=false;
let stockCheckpoints=null;
let rollbackOnly=null;
function transportTransaction(work){
 if(active) {
  if(requestOwned) return work(); // Join the outer HTTP unit of work; errors propagate to its rollback.
  throw new Error('Nested transaction is not supported.');
 }
 store.sql.run('BEGIN IMMEDIATE');
 active=true;stockCheckpoints=new Map();rollbackOnly=null;
 try{
  // A competing process may have committed after HTTP refresh but before this
  // write lock. Re-read under the lock to avoid stale assignments/invoices.
  // Number repair is done during request refresh, outside this transaction.
  store.reloadFromSql({skipRepair:true});
  // Legacy paths must not independently change an existing stock-service
  // member. Compare under the same write lock and roll back the whole request,
  // including audit and notifications, rather than leaving a partial write.
  const guard=require('./store-stock-legacy-guard'),snapshot=guard.capture(store.sql);
  const result=work();
  if(result && typeof result.then==='function') throw new Error('Transaction work must be synchronous.');
  if(rollbackOnly) throw rollbackOnly;
  guard.assertUnchanged(store.sql,snapshot);
  for(const checkpoint of stockCheckpoints.values())guard.assertUnchanged(store.sql,checkpoint);
  store.sql.run('COMMIT');active=false;require('./sql-repos').clearCache();return result;}
 catch(e){try{store.sql.run('ROLLBACK');}finally{active=false;store.reloadFromSql();}throw require('./store-stock-sql-guard').translate(e);}
 finally{stockCheckpoints=null;rollbackOnly=null;}
}
transportTransaction.request=work=>{
 if(active) throw new Error('Request transaction cannot be nested.');
 requestOwned=true;
 try{return transportTransaction(work);}finally{requestOwned=false;}
};
transportTransaction.isActive=()=>active;
// Internal bridge hooks. The first checkpoint cannot be replaced by a retry.
transportTransaction.checkpointStockMember=orderId=>{
 if(!active||!stockCheckpoints)throw new Error('ثبت محافظ فقط در تراکنش مشترک مجاز است.');
 if(!stockCheckpoints.has(orderId))stockCheckpoints.set(orderId,require('./store-stock-legacy-guard').captureMember(store.sql,orderId));
};
// An experimental repository failure may have partially written SQL. Even if
// a caller catches it, it must not turn the outer request into a commit.
transportTransaction.markRollbackOnly=error=>{
 if(!active)throw new Error('ابطال فقط در تراکنش مشترک مجاز است.');
 rollbackOnly ||= error instanceof Error ? error : new Error('عملیات سرویس تجمیعی ناموفق بود.');
};
module.exports=transportTransaction;
