'use strict';
const store=require('./store');
// Synchronous work only. The live store writes through; on failure reload it
// from SQLite after rollback so no partial changes survive in the process.
let active=false;
let requestOwned=false;
function transportTransaction(work){
 if(active) {
  if(requestOwned) return work(); // Join the outer HTTP unit of work; errors propagate to its rollback.
  throw new Error('Nested transaction is not supported.');
 }
 store.sql.run('BEGIN IMMEDIATE');
 active=true;
 try{
  // A competing process may have committed after HTTP refresh but before this
  // write lock. Re-read under the lock to avoid stale assignments/invoices.
  // Number repair is done during request refresh, outside this transaction.
  store.reloadFromSql({skipRepair:true});
  const result=work();
  if(result && typeof result.then==='function') throw new Error('Transaction work must be synchronous.');
  store.sql.run('COMMIT');active=false;require('./sql-repos').clearCache();return result;}
 catch(e){try{store.sql.run('ROLLBACK');}finally{active=false;store.reloadFromSql();}throw e;}
}
transportTransaction.request=work=>{
 if(active) throw new Error('Request transaction cannot be nested.');
 requestOwned=true;
 try{return transportTransaction(work);}finally{requestOwned=false;}
};
transportTransaction.isActive=()=>active;
module.exports=transportTransaction;
