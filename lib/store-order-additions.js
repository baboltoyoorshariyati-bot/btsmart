'use strict';
const {fail}=require('./http');
const {isPartial}=require('./store-order-kind');
const activeRequest=order=>(order.storeAdditionRequests||[]).find(r=>['PENDING_SALES','PENDING_WAREHOUSE'].includes(r.status));
function assertOpen(order){
 if(!isPartial(order)||!['SCHEDULED_REMOTE','WAREHOUSE_PENDING','WAREHOUSE_PREPARING'].includes(order.status)||order.warehouseCompletedAt||order.storeRunOps?.finalizedAt||order.storeRunOps?.r1Shipment||order.storeWarehouseDocumentNos?.['1']||order.transportHandovers?.['1'])
  fail(409,'افزودن کالا فقط برای سفارش جزئی تأییدشده و پیش از صدور سند انبار مجاز است.');
}
function assertNoPending(order){if(activeRequest(order))fail(409,'ابتدا درخواست افزودن کالای فروشگاه تعیین تکلیف شود؛ صدور سند یا پایان سفارش تا آن زمان ممکن نیست.');}
module.exports={activeRequest,assertOpen,assertNoPending};
