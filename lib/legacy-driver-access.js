'use strict';
// Keep existing physical shipments actionable without creating or silently
// changing any legacy records. Once a driver's last old shipment is delivered,
// that account cannot be used for operations in the new workflow.
function hasOpenWork(db,driverId){
 if(!driverId)return false;
 const states=new Set(['ASSIGNED','DRIVER_EXIT_REPORTED','IN_TRANSIT']);
 return (db.orders||[]).some(o=>[...(Array.isArray(o.dispatches)?o.dispatches:[]),o.dispatch].some(d=>d&&d.driverId===driverId&&states.has(d.status)));
}
function allowed(user,db){
 return !require('./transport-planning').enabled()||hasOpenWork(db,user?.driverId);
}
module.exports={hasOpenWork,allowed};
