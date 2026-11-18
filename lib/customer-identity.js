'use strict';
// Temporary operational mode: biometric/signature capture is suspended, not erased.
const CUSTOMER_CONTACT_ONLY = true;
function customerIdentity(db, order) {
  const visit = (db.visits || []).find(v => v.id === order.visitId);
  const customer = (db.customers || []).find(c => c.id === (order.customerId || visit?.customerId));
  return { customerName: String(customer?.name || '').trim(), customerPhone: String(customer?.phone || '').trim() };
}
module.exports = { CUSTOMER_CONTACT_ONLY, customerIdentity };
