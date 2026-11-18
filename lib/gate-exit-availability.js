'use strict';

// A linked visit exposes order details only after the order is ready for gate verification.
module.exports = function gateExitAvailable(order) {
  return !!order && (
    (order.status === 'SETTLED' && !order.dispatch)
    || order.status === 'EXITED'
    || !!order.dispatch?.gateExitAt
    || !!order.dispatch?.gateFinalExitAt
    || !!order.transportDeparture
    || Object.values(order.transportStoreTrips || {}).some(trip => !!trip?.departedAt)
  );
};
