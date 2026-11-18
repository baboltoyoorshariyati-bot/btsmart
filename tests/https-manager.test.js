'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const http=require('node:http'),https=require('node:https'),net=require('node:net');
const {TLSManager,normalizeDomain,isLocalAddress,validateCertificate}=require('../lib/tls-manager');
const key=fs.readFileSync(path.join(__dirname,'fixtures/tls/test-key.pem'),'utf8'),cert=fs.readFileSync(path.join(__dirname,'fixtures/tls/test-cert.pem'),'utf8');
const freePort=()=>new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('timeout');};
const fetchText=(url,options={})=>new Promise((resolve,reject)=>{const p=url.startsWith('https:')?https:http;p.get(url,options,res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));}).on('error',reject)});
test('اعتبارسنجی نام دامنه و تشخیص دسترسی داخلی',()=>{
 assert.equal(normalizeDomain('  SHOP.Example.COM  '),'shop.example.com');
 for(const name of ['https://example.com','example.com:443','foo.local','example.com/path','*.example.com','127.0.0.1','-x.com','abc..com','evil.com\nother.com','foo.test'])assert.throws(()=>normalizeDomain(name),undefined,name);
 assert(isLocalAddress('::ffff:192.168.1.12'));assert(isLocalAddress('10.2.3.4'));assert(isLocalAddress('::1'));assert(!isLocalAddress('8.8.8.8'));assert(!isLocalAddress('2001:4860::1'));
 assert.ok(validateCertificate({domain:'example.com',key,cert}));assert.throws(()=>validateCertificate({domain:'wrong.example.com',key,cert}));
});
test('صدور و تعویض ایمن، پاسخ challenge، ماندگاری، HTTPS و بازگشت در خطا',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-tls-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const port=await freePort();let issue=async(domain,email)=>({domain,email,key,cert,accountKey:'test-account'});let failSave=false;
 const m=new TLSManager({dir,host:'127.0.0.1',httpPort:80,httpsPort:port,handler:(_req,res)=>res.end('secure'),issueCertificate:(...args)=>issue(...args),prepareFirewall:()=>{}});
 m.audit=()=>{};t.after(()=>m.close());await m.init(m.handler);
 const plain=http.createServer((req,res)=>m.httpHandler(req,res,(_req,r)=>r.end('local')));await new Promise(r=>plain.listen(0,'127.0.0.1',r));t.after(()=>plain.close());const hp=plain.address().port;
 m.challenge.set('abc_123',{domain:'example.com',value:'abc.key'});
 assert.equal((await fetchText(`http://127.0.0.1:${hp}/.well-known/acme-challenge/abc_123`,{headers:{host:'example.com'}})).text,'abc.key');
 assert.equal((await fetchText(`http://127.0.0.1:${hp}/.well-known/acme-challenge/abc_123`,{headers:{host:'evil.com'}})).status,404);m.challenge.clear();
 assert.throws(()=>m.start('example.com','',false));m.start('example.com','owner@example.com',true);
 assert.throws(()=>m.start('example.com','',true),/حال انجام/);await wait(()=>!m.busy);assert.equal(m.status().job.state,'active');assert.equal(m.status().active.domain,'example.com');
 assert.equal((await fetchText(`https://127.0.0.1:${port}/`,{rejectUnauthorized:false,servername:'example.com'})).text,'secure');
 let r=await fetchText(`http://127.0.0.1:${hp}/test?q=1`,{headers:{host:'example.com'}});assert.equal(r.status,308);assert.equal(r.headers.location,'https://example.com/test?q=1');
 assert.equal((await fetchText(`http://127.0.0.1:${hp}/`,{headers:{host:'127.0.0.1'}})).text,'local');
 const stored=JSON.parse(fs.readFileSync(path.join(dir,'state.json')));assert.equal(stored.domain,'example.com');assert.equal(stored.key,key);assert(!JSON.stringify(m.status()).includes('PRIVATE KEY'));
 if(process.platform!=='win32'){assert.equal(fs.statSync(dir).mode&0o777,0o700);assert.equal(fs.statSync(path.join(dir,'state.json')).mode&0o777,0o600);}
 issue=async()=>{throw Error('failure')};m.start('other.example.com','',true);await wait(()=>!m.busy);assert.equal(m.status().job.state,'error');assert.equal(m.status().active.domain,'example.com');assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'state.json'))).domain,'example.com');
 issue=async(domain,email)=>({domain,email,key,cert,accountKey:'test-account'});const save=m.save.bind(m);m.save=data=>{if(failSave)throw Error('disk');return save(data);};failSave=true;m.start('other.example.com','',true);await wait(()=>!m.busy);assert.equal(m.status().active.domain,'example.com');assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'state.json'))).domain,'example.com');
 failSave=false;m.start('other.example.com','',true);await wait(()=>!m.busy);assert.equal(m.status().active.domain,'other.example.com');
 await new Promise(r=>m.server.close(r));m.server=null;clearInterval(m.timer);
 const restored=new TLSManager({dir,host:'127.0.0.1',httpPort:80,httpsPort:port,handler:m.handler,prepareFirewall:()=>{}});restored.audit=()=>{};t.after(()=>restored.close());await restored.init(m.handler);assert.equal(restored.status().active.domain,'other.example.com');
 assert.equal((await fetchText(`https://127.0.0.1:${port}/`,{rejectUnauthorized:false,servername:'other.example.com'})).text,'secure');
});
test('دسترسی HTTP عمومی پس از فعال‌شدن گواهی به دامنه محدود و به HTTPS هدایت می‌شود',()=>{
 const m=new TLSManager();m.active={domain:'example.com'};const call=(host,ip)=>{let status,headers,body;const res={writeHead(s,h){status=s;headers=h||{}},end(v){body=v}};m.httpHandler({url:'/login',method:'GET',headers:{host},socket:{remoteAddress:ip}},res,()=>{status=200});return {status,headers,body}};
 assert.equal(call('example.com','8.8.8.8').status,308);assert.equal(call('8.8.8.8','8.8.8.8').status,403);assert.equal(call('192.168.1.1','192.168.1.2').status,200);
});

test('کلاینت ACME بسته‌بندی‌شده با صادرکنندهٔ آزمایشی محلی challenge و CSR را اجرا می‌کند',async t=>{
 const acme=require('../vendor/acme/acme-client.cjs'),originalUrl=acme.directory.letsencrypt.production,originalKey=acme.crypto.createPrivateEcdsaKey;
 t.after(()=>{acme.directory.letsencrypt.production=originalUrl;acme.crypto.createPrivateEcdsaKey=originalKey;});
 acme.crypto.createPrivateEcdsaKey=async()=>Buffer.from(key); // کلید عمومیِ صرفاً آزمایشی
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-acme-fake-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const port=await freePort();const app=(_req,res)=>res.end('app');const m=new TLSManager({dir,host:'127.0.0.1',httpPort:80,httpsPort:port,handler:app,prepareFirewall:()=>{}});m.audit=()=>{};t.after(()=>m.close());await m.init(app);
 const web=http.createServer((req,res)=>m.httpHandler(req,res,app));await new Promise(r=>web.listen(0,'127.0.0.1',r));t.after(()=>web.close());
 let url,seenChallenge=false,seenCsr=false,nonce=0;
 const fake=http.createServer(async(req,res)=>{
  try{
   const chunks=[];for await(const c of req)chunks.push(c);
   const data=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
   const payload=data.payload?JSON.parse(Buffer.from(data.payload,'base64url').toString()):null;
   const headers={'Replay-Nonce':`nonce${++nonce}`,'Content-Type':'application/json'};
   const send=(status,body={},extra={})=>{res.writeHead(status,{...headers,...extra});res.end(JSON.stringify(body));};
   if(req.url==='/directory')return send(200,{newNonce:url+'/nonce',newAccount:url+'/account',newOrder:url+'/new-order'});
   if(req.url==='/nonce'){res.writeHead(200,headers);return res.end();}
   if(req.url==='/account'){assert.equal(payload.termsOfServiceAgreed,true);return send(201,{status:'valid'},{Location:url+'/acct/1'});}
   if(req.url==='/new-order'){assert.deepEqual(payload.identifiers,[{type:'dns',value:'example.com'}]);return send(201,{status:'pending',authorizations:[url+'/auth/1'],finalize:url+'/finalize'},{Location:url+'/order/1'});}
   if(req.url==='/auth/1')return send(200,{identifier:{type:'dns',value:'example.com'},status:'pending',challenges:[{type:'http-01',token:'token123',url:url+'/challenge/1'}]});
   if(req.url==='/challenge/1'){
    if(payload!==null){const r=await fetchText(`http://127.0.0.1:${web.address().port}/.well-known/acme-challenge/token123`,{headers:{host:'example.com'}});assert.equal(r.status,200);assert.match(r.text,/^token123\.[A-Za-z0-9_-]+$/);seenChallenge=true;}
    return send(200,{status:'valid',type:'http-01',url:url+'/challenge/1',token:'token123'});
   }
   if(req.url==='/finalize'){assert.ok(payload.csr);seenCsr=true;return send(200,{status:'valid',certificate:url+'/certificate'});}
   if(req.url==='/certificate'){res.writeHead(200,{'Replay-Nonce':`nonce${++nonce}`,'Content-Type':'application/pem-certificate-chain'});return res.end(cert);}
   send(404,{error:'unexpected '+req.url});
  }catch(e){res.writeHead(500);res.end(e.message);}
 });await new Promise(r=>fake.listen(0,'127.0.0.1',r));t.after(()=>fake.close());url=`http://127.0.0.1:${fake.address().port}`;acme.directory.letsencrypt.production=url+'/directory';
 m.start('example.com','owner@example.com',true);await wait(()=>!m.busy);assert.equal(m.status().job.state,'active',m.status().job.message);assert(seenChallenge);assert(seenCsr);assert.equal(m.challenge.size,0);
});

test('پورت ۴۴۳ اشغال یا فایل خراب، نباید برنامهٔ دیگر یا HTTP عمومی را ناخواسته باز کند',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-tls-busy-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());let firewall=0,issue=0;
 const m=new TLSManager({dir,host:'127.0.0.1',httpPort:80,httpsPort:server.address().port,handler:()=>{},prepareFirewall:()=>{firewall++},issueCertificate:async()=>{issue++;return {key,cert}}});m.audit=()=>{};t.after(()=>m.close());await m.init(()=>{});m.start('example.com','',true);await wait(()=>!m.busy);
 assert.equal(m.status().job.state,'error');assert.equal(firewall,0);assert.equal(issue,0);
 fs.writeFileSync(path.join(dir,'state.json'),'invalid');const m2=new TLSManager({dir,host:'127.0.0.1',httpsPort:server.address().port,prepareFirewall:()=>{firewall++}});t.after(()=>m2.close());await m2.init(()=>{});
 let result=0;m2.httpHandler({url:'/',method:'GET',headers:{host:'example.com'},socket:{remoteAddress:'8.8.8.8'}},{writeHead(s){result=s},end(){}},()=>{result=200});assert.equal(result,503);assert.equal(firewall,0);
});

test('تمدید خودکار از همان حساب و دامنه استفاده می‌کند و در خطا گواهی جاری حفظ می‌شود',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-tls-renew-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const port=await freePort();let args;
 const m=new TLSManager({dir,host:'127.0.0.1',httpPort:80,httpsPort:port,handler:(_req,res)=>res.end('ok'),prepareFirewall:()=>{},issueCertificate:async(...a)=>{args=a;return {key,cert,accountKey:'existing-account'};}});m.audit=()=>{};t.after(()=>m.close());await m.init(m.handler);
 m.start('example.com','owner@example.com',true);await wait(()=>!m.busy);
 m.active.expiresAt=new Date(Date.now()+10*86400000).toISOString();await m.renewIfNeeded();await wait(()=>!m.busy);
 assert.deepEqual(args,['example.com','owner@example.com','existing-account']);assert.equal(m.status().job.state,'active');assert.equal(m.status().active.domain,'example.com');
});
