'use strict';
const {fail}=require('./http');
const {isPartial}=require('./store-order-kind');
const activeRequest=order=>(order.storeAdditionRequests||[]).find(r=>['PENDING_SALES','PENDING_WAREHOUSE'].includes(r.status));
function canAdd(order){
 if(order?.orderType!=='STORE'||!['SCHEDULED_REMOTE','WAREHOUSE_PENDING','WAREHOUSE_PREPARING'].includes(order.status)||order.warehouseCompletedAt||order.storeRunOps?.finalizedAt)return false;
 if(isPartial(order))return !order.storeRunOps?.r1Shipment&&!order.storeWarehouseDocumentNos?.['1']&&!order.transportHandovers?.['1'];
 // Reopening for a warehouse correction must not permit a new addition.
 // Once service two has a shipment/document or handover, its contents are frozen.
 return !order.storeAdditionClosedAt&&!order.storeRunOps?.r2Shipment&&!order.storeWarehouseDocumentNos?.['2']&&!order.transportHandovers?.['2']&&!order.transportStoreTrips?.['2'];
}
function assertOpen(order){
 if(!canAdd(order))fail(409,isPartial(order)?'افزودن کالا فقط برای سفارش جزئی تأییدشده و پیش از صدور سند انبار مجاز است.':'افزودن محصول فقط تا پیش از پایان کار انبار و صدور یا ارسال سرویس دوم مجاز است.');
}
function firstSent(order){return !!(order.storeRunOps?.r1Shipment||order.storeWarehouseDocumentNos?.['1']||order.transportHandovers?.['1']||order.transportStoreTrips?.['1']);}
function assertNoPending(order){if(activeRequest(order))fail(409,'ابتدا درخواست افزودن کالای فروشگاه تعیین تکلیف شود؛ صدور سند یا پایان سفارش تا آن زمان ممکن نیست.');}
module.exports={activeRequest,canAdd,assertOpen,assertNoPending,firstSent};
