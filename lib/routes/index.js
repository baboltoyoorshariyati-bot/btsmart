'use strict';
// ثبت همه مسیرها (ترتیب مهم نیست؛ Router بر اساس الگو و متد تطبیق می‌دهد)
require('./auth');
require('./core');
require('./orders');
require('./store-order-additions');
require('./customer-order-additions');
require('./settlement-cancellations');
require('./store-cancellation-requests');
require('./document-edits');
require('./admin');
require('./product-price-groups');
require('./resources');
require('./transport-resources');
require('./transport-plans');
require('./transport-shipments');
require('./customers');
require('./customer-debts');
require('./admin-ext');
require('./dispatch');
require('./store-runs');
require('./store-stock-consolidation');
require('./weighbridge');

require('./fingerprint');

require('./unit-reports');
require('./backups');

require('./tls');
require('./sales-history');

require('./pickup');
