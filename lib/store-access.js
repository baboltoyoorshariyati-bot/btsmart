'use strict';
const admin=user=>user?.roleCode==='admin';
const owns=(user,order)=>admin(user)||order.storeId===user.id;
module.exports={admin,owns};
