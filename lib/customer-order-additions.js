'use strict';
const {fail}=require('./http');
const pending=order=>(order.customerAdditionRequests||[]).find(r=>r.status==='PENDING_WAREHOUSE');
function assertOpen(order){
 if(!['ONSITE','REMOTE'].includes(order.orderType)||!['WAREHOUSE_PENDING','WAREHOUSE_PREPARING'].includes(order.status)||order.warehouseCompletedAt||order.warehouseDocumentNo||order.warehouseHandover||order.pickupHandover||order.pickupCancellation||order.transportHandovers?.['0']||order.transportInvoice||order.payment||order.dispatch)
  fail(409,'افزودن کالا فقط پیش از ثبت نهایی و تحویل سفارش در انبار مجاز است.');
}
function assertNoPending(order){if(pending(order))fail(409,'ابتدا درخواست افزودن کالا توسط انبار تأیید یا رد شود.');}
module.exports={pending,assertOpen,assertNoPending};
