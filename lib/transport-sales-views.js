'use strict';
// A sales cartable row is an actual shipment or one store service. It is not
// a legacy driver dispatch and never implies that a customer has signed.
function salesTransportViews(order){
 if(order?.transportWorkflow!==1||order.deliveryMode!=='DELIVERY'||!['WAREHOUSE_PENDING','WAREHOUSE_PREPARING','SETTLEMENT_PENDING','CLOSED'].includes(order.status))return [];
 const store=order.orderType==='STORE',runs=store?require('./store-order-kind').allowedRuns(order):[0],result=[];
 for(const run of runs){
  const key=String(run),assignment=order.transportAssignments?.[key]||null,hand=order.transportHandovers?.[key]||null,trip=store?order.transportStoreTrips?.[key]:null;
  const shipment=store?order.storeRunOps?.[run===1?'r1Shipment':'r2Shipment']:null;
  if(store&&!assignment&&!hand&&!trip&&!shipment)continue;
  const departure=store?trip:order.transportDeparture,returned=store?trip?.status==='RECEIPT_CONFIRMED':!!order.transportReturn,closed=store?trip?.status==='CLOSED':order.status==='CLOSED'&&order.transportInvoice?.status==='CLOSED';
  if(!store&&order.status==='CLOSED'&&!closed)continue;
  const section=closed?'history':returned?'delivered':departure?'inTransit':'assigned';
  const label=closed?(store?'مدارک برگشت؛ سرویس بسته شد':order.transportReturn?.outcome==='NOT_DELIVERED'?'تحویل‌نشده؛ فاکتور بسته شد':order.transportReturn?'مدارک برگشت؛ فاکتور بسته شد':'فاکتور بسته شد'):returned?(store?'دریافت فروشگاه تأیید شد':order.transportReturn?.outcome==='NOT_DELIVERED'?'مدارک برگشت؛ تحویل‌نشده':'تحویل تأیید شد؛ در انتظار بستن فاکتور'):departure?'در مسیر؛ آماده ثبت پرداختی':!assignment?'در انتظار تخصیص ترابری':!hand?'در انتظار تحویل انبار':store?(order.transportStoreReviews?.[key]?'منتظر تأیید خروج نگهبانی':'منتظر بررسی فروش'):!order.transportInvoice?'در انتظار فاکتور فروش':'آماده ثبت خروج';
  const source=hand||assignment||trip||{};
  const at=(store?(trip?.documentsReturnedAt||trip?.storeReceiptConfirmedAt||trip?.departedAt||hand?.handedOverAt||shipment?.sentAt||assignment?.assignedAt):(order.transportInvoice?.closedAt||order.transportReturn?.at||order.transportDeparture?.at||hand?.handedOverAt||assignment?.assignedAt))||order.updatedAt||order.createdAt||'';
  const lines=store?(hand?.document?.lines||trip?.lines||[]):(hand?.document?.items||[]);
  result.push({order,transportService:{run,section,label,driverName:source.driverName||'',driverPhone:source.driverPhone||'',vehicleType:source.vehicleType||'',vehiclePlate:source.vehiclePlate||'',warehouseDocumentNo:hand?.document?.warehouseDocumentNo||trip?.warehouseDocumentNo||'',invoiceNumber:store?'':order.transportInvoice?.invoiceNumber||'',outcome:store?'':order.transportReturn?.outcome||'',lines,at}});
 }
 return result;
}
module.exports={salesTransportViews};
