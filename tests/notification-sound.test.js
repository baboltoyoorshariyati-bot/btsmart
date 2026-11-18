'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const appCode = fs.readFileSync(path.join(__dirname, '../public/app.js'),'utf8');
const audio = appCode.slice(appCode.indexOf('const NOTIF_REPEAT_MS='), appCode.indexOf('function positionNotifPanel()'));
const notify = appCode.slice(appCode.indexOf('function notifyNewArrivals(d){'), appCode.indexOf("document.addEventListener('pointerdown',onNotifAudioGesture"));
function fixture(state='running') {
  let next=1; const timers=new Map(), oscillators=[], messages=[], storage=new Map();
  class AudioContext {
    constructor(){ this.state=state; this.currentTime=0; this.destination={}; }
    resume(){return Promise.resolve();}
    createOscillator(){const o={frequency:{},connect(){},disconnect(){},start(t){this.started=t},stop(t){this.stopped=t}};oscillators.push(o);return o;}
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  }
  const ctx={app:{user:{id:'u1'}},window:{AudioContext},navigator:{},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
    setTimeout:(fn,delay)=>{const id=next++;timers.set(id,{fn,delay});return id},clearTimeout:id=>timers.delete(id),
    $:()=>null,toast:m=>messages.push(m),faDigits:String,renderNotifPanel(){}};
  vm.createContext(ctx); vm.runInContext(audio+'\n'+notify,ctx);
  return {ctx,timers,oscillators,messages,storage};
}
const settle = async () => { for(let i=0;i<6;i++) await Promise.resolve(); };

test('unread alerts play a long three-strike chime, repeat after 30 seconds and stop when all are read', async () => {
  const f=fixture(); const data={notifications:[{id:'a',isRead:false}],unread:1};
  f.ctx.notifyNewArrivals(data); await settle();
  assert.equal(f.oscillators.length,12); assert.ok(f.oscillators.some(o=>o.stopped>=3));
  assert.equal([...f.timers.values()].filter(t=>t.delay===30000).length,1);
  f.ctx.notifyNewArrivals(data); await settle(); assert.equal(f.oscillators.length,12,'ordinary polling must not replay');
  const [id,timer]=[...f.timers].find(([,t])=>t.delay===30000); f.timers.delete(id); timer.fn(); await settle();
  assert.equal(f.oscillators.length,24); assert.equal([...f.timers.values()].filter(t=>t.delay===30000).length,1);
  f.ctx.notifyNewArrivals({notifications:[{id:'a',isRead:true}],unread:0}); await settle();
  assert.equal([...f.timers.values()].filter(t=>t.delay===30000).length,0); assert.equal(f.ctx.app.notifUnread,0);
});

test('each new alert restarts the reminder while explicit mute and logout stop it', async () => {
  const f=fixture(); f.ctx.notifyNewArrivals({notifications:[],unread:0});
  f.ctx.notifyNewArrivals({notifications:[{id:'a',message:'A',isRead:false}],unread:1}); await settle();
  assert.equal(f.oscillators.length,12); assert.equal(f.messages.length,1);
  f.ctx.notifyNewArrivals({notifications:[{id:'b',message:'B',isRead:false},{id:'a',isRead:false}],unread:2}); await settle();
  assert.equal(f.oscillators.length,24); assert.equal([...f.timers.values()].filter(t=>t.delay===30000).length,1);
  f.storage.set('bt.notifSound','0');f.ctx.stopNotifReminder();f.ctx.notifyNewArrivals({notifications:[{id:'a',isRead:false}],unread:1});await settle();
  assert.equal([...f.timers.values()].filter(t=>t.delay===30000).length,0);assert.equal(f.oscillators.length,24);
  f.storage.set('bt.notifSound','1');f.ctx.startNotifReminder(true);await settle(); assert.equal(f.oscillators.length,36);
  f.ctx.stopNotifReminder();f.ctx.app.user=null;assert.equal([...f.timers.values()].filter(t=>t.delay===30000).length,0);
});

test('blocked audio is reported and can be unlocked by a user gesture', async () => {
  const f=fixture('suspended'); f.ctx.notifyNewArrivals({notifications:[{id:'a',isRead:false}],unread:1}); await settle();
  assert.equal(f.oscillators.length,0);assert.equal(f.ctx.app.notifAudioBlocked,true);assert.equal(f.messages.length,1);
  f.ctx.app.audioCtx.state='running'; f.ctx.onNotifAudioGesture(); await settle();
  assert.equal(f.ctx.app.notifAudioBlocked,false);assert.equal(f.oscillators.length,12);
});

test('an asynchronous audio resume cannot ring after the alert was opened', async () => {
  const f=fixture('suspended'); let resume; f.ctx.app.audioCtx={state:'suspended',resume:()=>new Promise(r=>{resume=r})};
  f.ctx.notifyNewArrivals({notifications:[{id:'a',isRead:false}],unread:1});
  f.ctx.notifyNewArrivals({notifications:[{id:'a',isRead:true}],unread:0});
  f.ctx.app.audioCtx.state='running';resume();await settle(); assert.equal(f.oscillators.length,0);
});
