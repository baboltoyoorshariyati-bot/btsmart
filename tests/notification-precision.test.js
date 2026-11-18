'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('public/app.js','utf8');
const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
test('snapshot captures only the viewed role, section, entity and store service',()=>{
 const c={app:{user:{id:'sales1',roleCode:'sales'},page:'sales',sub:{sales:'stores'},notifSnapshot:{notifications:[
  {id:'a',targetRole:'sales',navSection:'stores',entityType:'order',entityId:'o',run:1},
  {id:'b',targetRole:'sales',navSection:'stores',entityType:'order',entityId:'o',run:2},
  {id:'old',targetRole:'sales',navSection:'stores',entityType:'order',entityId:'o',type:'STORE_RUN_R1_SENT'},
  {id:'ambiguous',targetRole:'sales',navSection:'stores',entityType:'order',entityId:'o'},
  {id:'other',targetRole:'warehouse',navSection:'stores',entityType:'order',entityId:'o'},
  {id:'wrong-order',targetRole:'sales',navSection:'stores',entityType:'order',entityId:'q'},
  {id:'done',targetRole:'sales',navSection:'stores',entityType:'order',entityId:'o',run:1,isRead:true}] }},normalizeRole:x=>x};
 vm.createContext(c);vm.runInContext(slice('function captureEntityNotices(', 'function focusNotificationElement('),c);
 const snap=c.captureEntityNotices('order','o',1);assert.deepEqual(Array.from(snap),['a','old']);
 c.app.notifSnapshot.notifications.push({id:'new',targetRole:'sales',navSection:'stores',entityType:'order',entityId:'o',run:1});assert.deepEqual(Array.from(snap),['a','old'],'new arrivals are not part of earlier snapshot');
 const sent=[];c.acknowledgeNotifications=async ids=>sent.push(Array.from(ids));
 c.app.user.id='sales2';c.finishEntityNotices(snap);assert.equal(sent.length,0,'account switched while details were loading');
 c.app.user.id='sales1';c.app.sub.sales='delivery';c.finishEntityNotices(snap);assert.equal(sent.length,0,'section changed while details were loading');
 c.app.sub.sales='stores';c.finishEntityNotices(snap);assert.deepEqual(sent,[['a','old']]);
 c.app.page='warehouse';assert.deepEqual(Array.from(c.captureEntityNotices('order','o',1)),[]);
 c.app.user.roleCode='admin';c.app.page='sales';c.app.adminActiveRole='sales';assert.deepEqual(Array.from(c.captureEntityNotices('order','o',2)),['b']);
});
test('notification navigation acknowledges only after a successful detail opens',async()=>{
 const actions=[],c={app:{user:{roleCode:'sales'},notifSnapshot:{notifications:[]}},normalizeRole:x=>x,notifRoute:()=>({page:'sales',sub:'flow'}),api:async()=>({order:{orderType:'REMOTE'}}),go:async()=>actions.push('go'),openOrderDetails:async()=>{actions.push('open');return c.ok},acknowledgeNotifications:async id=>actions.push('read:'+id),toast:()=>{},CSS:{escape:x=>x}};
 vm.createContext(c);vm.runInContext(slice('async function openNotificationTarget(', 'function notifyNewArrivals('),c);
 c.ok=false;await c.openNotificationTarget('n','T','sales','order','o');assert.deepEqual(actions,['go','open']);
 actions.length=0;c.ok=true;await c.openNotificationTarget('n','T','sales','order','o');assert.deepEqual(actions,['go','open','read:n']);
 actions.length=0;c.app.user.id='first';c.openOrderDetails=async()=>{actions.push('open');c.app.user.id='second';return true;};await c.openNotificationTarget('n','T','sales','order','o');assert.deepEqual(actions,['go','open'],'account switch must not read for the new account');
 actions.length=0;c.api=async()=>{throw Error('offline')};await c.openNotificationTarget('n','T','sales','order','o');assert.deepEqual(actions,[]);
});
test('paged lists fetch beyond 200 and reject failures rather than showing an empty queue',async()=>{
 const calls=[],c={api:async url=>{calls.push(url);const offset=Number(new URL('http://localhost'+url).searchParams.get('offset'));return {orders:Array.from({length:Math.min(200,405-offset)},(_,i)=>({id:String(offset+i)})),total:405}},URL,Set,Number};
 vm.createContext(c);vm.runInContext(slice('async function fetchPagedList(', 'async function fetchSalesCache('),c);
 const result=await c.fetchPagedList('/api/orders?status=WAREHOUSE_PENDING','orders');assert.equal(result.orders.length,405);assert.equal(calls.length,3);assert.equal(result.orders[404].id,'404');
 c.api=async()=>{throw Error('offline')};await assert.rejects(c.fetchPagedList('/api/visits','visits'),/offline/);
});
test('parallel acknowledgements are serialized and old polling responses are invalidated',async()=>{
 const pending=[],c={app:{user:{id:'u'},notifRequestSeq:5},api:(url,opts)=>new Promise(resolve=>pending.push({url,body:JSON.parse(opts.body),resolve})),stopNotifReminder(){},startNotifReminder(){},$:()=>null,renderNav(){},updateSalesDeliveryWorkCount(){},closeNotifPanel(){},toast(){},qty:String,Set,Promise};
 vm.createContext(c);vm.runInContext(slice('async function acknowledgeNotifications(', 'async function markNotificationsRead('),c);
 const a=c.acknowledgeNotifications(['a'],{closePanel:false}),b=c.acknowledgeNotifications(['b'],{closePanel:false});
 await new Promise(r=>setImmediate(r));assert.equal(pending.length,1);assert.deepEqual(pending[0].body,{ids:['a']});
 pending[0].resolve({notifications:[{id:'b',isRead:false}],unread:1});assert.equal(await a,true);await new Promise(r=>setImmediate(r));assert.equal(pending.length,2);assert.deepEqual(pending[1].body,{ids:['b']});
 pending[1].resolve({notifications:[{id:'b',isRead:true}],unread:0});assert.equal(await b,true);assert.equal(c.app.notifUnread,0);assert.equal(c.app.notifAppliedSeq,7);
});
