'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const store=require('../lib/store'),feature=require('../lib/pickup-feature');
test('pickup is on without configuration and rollback cannot strand managed orders or visits',()=>{
 const previous=process.env.BT_PICKUP_STAGING,transport=process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW,original=store.get;
 try{
  store.get=()=>({orders:[],visits:[]});delete process.env.BT_PICKUP_STAGING;assert.equal(feature.enabled(),true);
  process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW='0';assert.equal(feature.enabled(),false);delete process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW;
  process.env.BT_PICKUP_STAGING='false';assert.equal(feature.enabled(),false);
  const order={id:'o',orderType:'REMOTE',deliveryMode:'PICKUP',pickupWorkflow:1,status:'WAREHOUSE_PENDING'};
  store.get=()=>({orders:[order],visits:[]});assert.equal(feature.enabled(),true);
  order.status='CANCELLED';order.pickupCancellation={status:'EXIT_APPROVED'};assert.equal(feature.enabled(),true);
  order.pickupCancellation.status='EXITED';assert.equal(feature.enabled(),false);
  store.get=()=>({orders:[],visits:[{id:'v',orderId:'o',status:'PICKUP_PRESENT'}]});assert.equal(feature.enabled(),true);
  store.get=()=>({orders:[{...order,status:'EXITED'}],visits:[]});assert.equal(feature.enabled(),false);
 }finally{store.get=original;if(previous===undefined)delete process.env.BT_PICKUP_STAGING;else process.env.BT_PICKUP_STAGING=previous;if(transport===undefined)delete process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW;else process.env.BT_EXPERIMENTAL_TRANSPORT_WORKFLOW=transport;}
});
