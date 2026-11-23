'use strict';
// Parameterized SQL pagination. Return only a page, not every persisted order.
const sql = require('./sqlite-store');
function pagination(query, max = 200, fallback = 100) {
  const number = (key, value) => { const n=Number(query.get(key));return Number.isFinite(n)?Math.floor(n):value; };
  return {limit:Math.min(max,Math.max(1,number('limit',fallback)||fallback)),offset:Math.max(0,number('offset',0))};
}
function queryOrders({role,status,q='',limit=100,offset=0,history=false}) {
  const where=[],params=[];
  if (role==='gate') where.push("o.status IN ('SETTLED','EXITED') AND COALESCE(json_extract(o.payload,'$.dispatch'),0)=0");
  else if (role==='warehouse') where.push("o.status IN ('WAREHOUSE_PENDING','WAREHOUSE_PREPARING')");
  if(status){where.push('o.status = ?');params.push(status);}
  if(q){
    const fields=history?["o.order_no","COALESCE(NULLIF(c.name,''),NULLIF(json_extract(o.payload,'$.storeName'),''),'—')","c.phone"]:
      ['o.order_no',"json_extract(o.payload,'$.storeName')",'c.name','c.phone',"json_extract(c.payload,'$.plate')"];
    // Store contacts are stored on the order, not in the customer table.
    fields.push("json_extract(o.payload,'$.customerName')", "json_extract(o.payload,'$.customerPhone')");
    const matches=fields.map(field=>{params.push(q);return `instr(bt_lower(${field}), ?) > 0`;});
    if(history){matches.push('EXISTS (SELECT 1 FROM payments p WHERE p.order_id=o.id AND instr(bt_lower(p.invoice_number), ?) > 0)');params.push(q);}
    where.push('('+matches.join(' OR ')+')');
  }
  const joins=history?'LEFT JOIN visits v ON v.id=json_extract(o.payload,\'$.visitId\') LEFT JOIN customers c ON c.id=COALESCE(NULLIF(o.customer_id,\'\'),v.customer_id)':'LEFT JOIN customers c ON c.id=o.customer_id';
  // An edited historical store order may retain its old link, but its new contact supersedes it.
  const effectiveJoins = joins.replace('LEFT JOIN customers c ON c.id=', "LEFT JOIN customers c ON NOT (o.order_type='STORE' AND json_type(o.payload,'$.customerName') IS NOT NULL) AND c.id=");
  const from=`FROM orders o ${effectiveJoins} ${where.length?'WHERE '+where.join(' AND '):''}`;
  const total=Number(sql.get(`SELECT COUNT(*) AS n ${from}`,params).n);
  const order=history?'o.created_at DESC, o.rowid ASC':'o.rowid DESC';
  const orders=sql.all(`SELECT o.payload ${from} ORDER BY ${order} LIMIT ? OFFSET ?`,[...params,limit,offset]).map(row=>JSON.parse(row.payload));
  return {orders,total,limit,offset};
}
module.exports={queryOrders,pagination};
