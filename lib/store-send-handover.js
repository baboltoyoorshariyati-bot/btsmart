'use strict';
const {fail}=require('./http');
function validateAssignment(order,run){
 const a=order.transportAssignments?.[String(run)];
 if(!a?.driverId||!a.driverName||!a.vehicleId||!a.vehiclePlate)fail(409,'پیش از ارسال و تحویل، راننده و خودروی همین سرویس را در ترابری تعیین کنید.');
 return a;
}
function record(db,order,run,ctx,{store,getProduct,createNotification}){
 if(order.transportWorkflow!==1||ctx.body.physicalHandoverConfirmed!==true)return;
 if(order.transportHandovers?.[String(run)])return;
 const a=validateAssignment(order,run),doc=require('./store-run-print').warehouseServiceDocument(db,order,run,getProduct);
 if(!doc?.lines?.length)fail(409,'ابتدا وزن اقلام سرویس را ثبت کنید.');
 const now=store.nowIso(),handover={run,driverId:a.driverId,driverName:a.driverName,driverPhone:a.driverPhone,vehicleId:a.vehicleId,vehicleType:a.vehicleType,vehiclePlate:a.vehiclePlate,handedOverAt:now,handedOverBy:ctx.user.id,physicalHandoverConfirmed:true,signedPaperConfirmed:false,document:JSON.parse(JSON.stringify(doc))};
 order.transportHandovers={...(order.transportHandovers||{}),[String(run)]:handover};
 store.audit(ctx.user,'TRANSPORT_WAREHOUSE_HANDOVER','order',order.id,{run,driverId:a.driverId,vehicleId:a.vehicleId,warehouseDocumentNo:doc.warehouseDocumentNo,sealNumbers:doc.sealNumbers||[],physicalHandoverConfirmed:true,source:'STORE_SEND'},ctx);
 for(const role of ['sales','dispatch'])createNotification(role,'TRANSPORT_WAREHOUSE_HANDOVER','order',order.id,`ارسال و تحویل فیزیکی سرویس سفارش ${order.orderNo||'—'} به راننده ثبت شد.`,{run});
}
module.exports={validateAssignment,record};
