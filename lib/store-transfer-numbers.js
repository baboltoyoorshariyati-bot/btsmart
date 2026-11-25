'use strict';
// Public document numbers are monotonic decimal strings. UUIDs and immutable
// audit/notification text remain untouched; old labels are retained on records.
const valid = value => /^[1-9]\d*$/.test(String(value || '')) && Number.isSafeInteger(Number(value));
function ensureTransferNumbers(data) {
 const transfers=data.storeTransfers||[],used=new Set(),pending=[];
 let high=Number(data.counters?.storeTransferNumber)||0,changed=false;
 if(!Number.isSafeInteger(high)||high<0) throw Error('شمارنده حواله جابجایی معتبر نیست.');
 for(const t of transfers){
  const number=String(t.number||'');
  if(valid(number)&&!used.has(number)){used.add(number);high=Math.max(high,Number(number));}
  else pending.push(t);
 }
 pending.sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))||String(a.id||'').localeCompare(String(b.id||'')));
 if(!Number.isSafeInteger(high+pending.length))throw Error('ظرفیت شماره حواله جابجایی تمام شده است.');
 for(const t of pending){
  if(t.number&&!t.legacyNumber)t.legacyNumber=String(t.number);
  t.number=String(++high);used.add(t.number);changed=true;
 }
 data.counters||={};
 if((high>0||Object.hasOwn(data.counters,'storeTransferNumber'))&&data.counters.storeTransferNumber!==high){data.counters.storeTransferNumber=high;changed=true;}
 // Cached idempotent replies must not return the pre-migration number.
 const byId=new Map(transfers.map(t=>[t.id,t]));
 for(const cached of data.idempotency||[]){
  const t=cached.body?.transfer,current=t&&byId.get(t.id);
  if(current&&t.number!==current.number){t.number=current.number;if(current.legacyNumber)t.legacyNumber=current.legacyNumber;changed=true;}
 }
 return changed;
}
function nextTransferNumber(data){
 const current=Number(data.counters?.storeTransferNumber)||0;
 let next=current+1;
 const used=new Set((data.storeTransfers||[]).map(t=>String(t.number||'')));
 while(Number.isSafeInteger(next)&&used.has(String(next)))next++;
 if(!Number.isSafeInteger(next)||next<=0)throw Error('ظرفیت شماره حواله جابجایی تمام شده است.');
 data.counters||={};data.counters.storeTransferNumber=next;
 return String(next);
}
module.exports={ensureTransferNumbers,nextTransferNumber};
