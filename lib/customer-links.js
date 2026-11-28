'use strict';
// Merged profiles remain historical identities. Their orders, visits and
// financial records keep their original customer IDs and snapshots untouched.
function resolver(db){
 const byId=new Map((db.customers||[]).map(c=>[c.id,c]));
 return id=>{const original=String(id||'');if(!original)return original;let current=original;const seen=new Set();
  while(byId.get(current)?.mergedInto){if(seen.has(current))return original;seen.add(current);const next=byId.get(current).mergedInto;if(!byId.has(next))return original;current=next;}
  return current;
 };
}
function rootId(db,id){return resolver(db)(id);}
function members(db,id){const root=resolver(db),key=root(id);return (db.customers||[]).filter(c=>root(c.id)===key);}
function memberIds(db,id){const ids=new Set(members(db,id).map(c=>c.id));if(!ids.size&&id)ids.add(id);return ids;}
module.exports={rootId,members,memberIds,resolver};
