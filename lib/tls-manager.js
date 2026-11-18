'use strict';
// Single-domain Let's Encrypt HTTP-01 manager. Private keys live outside the application bundle.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const https = require('node:https');
const tls = require('node:tls');
const crypto = require('node:crypto');
const { domainToASCII } = require('node:url');
const { execFileSync } = require('node:child_process');
const config = require('./config');
const log = require('./logger');

function normalizeDomain(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw || raw.length > 253 || /[^a-z0-9.\-]/.test(raw)) throw Error('فقط نام دامنهٔ کامل انگلیسی را بدون https، مسیر، پورت یا ستاره وارد کنید.');
  const domain = domainToASCII(raw);
  const labels = domain.split('.');
  if (net.isIP(domain) || labels.length < 2 || labels.some(x => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x)) || !/[a-z]/.test(labels.at(-1)) || labels.at(-1).length < 2 || ['local','localhost','internal','test','invalid','example'].includes(labels.at(-1))) throw Error('یک دامنهٔ عمومی معتبر وارد کنید؛ IP و دامنهٔ داخلی قابل صدور نیستند.');
  return domain;
}
function normalizeEmail(input) {
  const email = String(input || '').trim();
  if (email && (email.length > 254 || !/^[a-zA-Z0-9.!#$%&'*+\-/=?^_`{|}~]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,63}$/.test(email))) throw Error('ایمیل اطلاع‌رسانی معتبر نیست.');
  return email;
}
function isLocalAddress(address) {
  let a = String(address || '').toLowerCase().split('%')[0];
  if (a.startsWith('::ffff:')) a = a.slice(7);
  if (a === '::1' || a === '127.0.0.1') return true;
  if (net.isIPv4(a)) { const p = a.split('.').map(Number); return p[0] === 10 || p[0] === 127 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 169 && p[1] === 254); }
  return net.isIPv6(a) && (/^f[cd]/.test(a) || /^fe[89ab]/.test(a));
}
function validateCertificate(data, allowExpired=false) {
  const cert = new crypto.X509Certificate(data.cert);
  if (!cert.checkHost(data.domain) || (!allowExpired && Date.parse(cert.validTo) <= Date.now()) || Date.parse(cert.validFrom) > Date.now()) throw Error('گواهی برای این دامنه معتبر نیست یا منقضی شده است.');
  const publicCert = cert.publicKey.export({type:'spki',format:'der'});
  const publicKey = crypto.createPublicKey(data.key).export({type:'spki',format:'der'});
  if (!publicCert.equals(publicKey)) throw Error('کلید خصوصی با گواهی مطابقت ندارد.');
  tls.createSecureContext({ key: data.key, cert: data.cert, minVersion: 'TLSv1.2' });
  return new Date(cert.validTo).toISOString();
}
function windowsTlsAclScript(directory) {
  const encodedPath=Buffer.from(directory,'utf16le').toString('base64');
  return `$ErrorActionPreference='Stop'; $p=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedPath}')); $a=New-Object System.Security.AccessControl.DirectorySecurity; $a.SetAccessRuleProtection($true,$false); $current=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; foreach($sid in @('S-1-5-18','S-1-5-32-544',$current)) { $i=New-Object System.Security.Principal.SecurityIdentifier($sid); $r=New-Object System.Security.AccessControl.FileSystemAccessRule($i,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $a.AddAccessRule($r) }; Set-Acl -LiteralPath $p -AclObject $a`;
}
class TLSManager {
  constructor(opts={}) {
    this.dir = opts.dir || path.join(config.DATA_DIR, 'tls');
    this.httpPort = opts.httpPort ?? config.PORT;
    this.httpsPort = opts.httpsPort ?? 443;
    this.host = opts.host || config.HOST;
    this.handler = opts.handler || null;
    this.issueCertificate = opts.issueCertificate || this.issueWithAcme.bind(this);
    this.secureDirectory = opts.secureDirectory || this.protectDirectory.bind(this);
    this.prepareFirewall = opts.prepareFirewall || this.openFirewall.bind(this);
    this.externalFirewall = opts.externalFirewall ?? config.TLS_FIREWALL_MANAGED_EXTERNALLY;
    this.active = null; this.configured = false; this.server = null; this.challenge = new Map(); this.busy = false;
    this.job = {state:'idle', message:''};
  }
  protectDirectory() {
    fs.mkdirSync(this.dir, {recursive:true,mode:0o700});
    const stat=fs.lstatSync(this.dir); if(!stat.isDirectory()||stat.isSymbolicLink()) throw Error('پوشهٔ امن گواهی معتبر نیست.');
    if(process.platform==='win32') {
      // Replace, rather than inherit, the directory DACL. SID values work on non-English Windows too.
      const script=windowsTlsAclScript(this.dir);
      try { execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{stdio:'ignore',timeout:15000,windowsHide:true}); }
      catch { throw Error('محافظت از پوشهٔ کلید خصوصی ممکن نشد؛ نصب‌کننده را با دسترسی مدیر اجرا کنید.'); }
    } else fs.chmodSync(this.dir,0o700);
  }
  openFirewall() {
    if(this.externalFirewall)return false;
    if(process.platform!=='win32')return false;
    // Named, application-owned rule; create only after our HTTPS listener owns port 443.
    const script="$ErrorActionPreference='Stop'; $r=Get-NetFirewallRule -Name 'BabolToyor-HTTPS-443' -ErrorAction SilentlyContinue; if ($r) { $r | Set-NetFirewallRule -Direction Inbound -Action Allow -Enabled True -Profile Any; $r | Get-NetFirewallPortFilter | Set-NetFirewallPortFilter -Protocol TCP -LocalPort 443; Write-Output 'EXISTS' } else { New-NetFirewallRule -Name 'BabolToyor-HTTPS-443' -DisplayName 'BabolToyor HTTPS' -Direction Inbound -Action Allow -Enabled True -Protocol TCP -LocalPort 443 -Profile Any | Out-Null; Write-Output 'CREATED' }";
    try { return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',timeout:15000,windowsHide:true}).includes('CREATED'); }
    catch { throw Error('باز کردن پورت ۴۴۳ در فایروال ویندوز ممکن نشد.'); }
  }
  removeFirewall() {
    if(this.externalFirewall)return;
    if(process.platform!=='win32')return;
    const script="Get-NetFirewallRule -Name 'BabolToyor-HTTPS-443' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue";
    try{execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{stdio:'ignore',timeout:10000,windowsHide:true})}catch{}
  }
  async issueWithAcme(domain,email,accountKey) {
    const acme=require('../vendor/acme/acme-client.cjs');
    acme.axios.defaults.timeout=30000;
    accountKey=accountKey||String(await acme.crypto.createPrivateEcdsaKey());
    const client=new acme.Client({directoryUrl:acme.directory.letsencrypt.production,accountKey});
    const key=await acme.crypto.createPrivateEcdsaKey();
    const [,csr]=await acme.crypto.createCsr({commonName:domain},key);
    const cert=await client.auto({csr,email:email||undefined,termsOfServiceAgreed:true,challengePriority:['http-01'],skipChallengeVerification:true,
      challengeCreateFn:async(authz,challenge,keyAuthorization)=>{
        if(authz.identifier.value!==domain || challenge.type!=='http-01' || !/^[A-Za-z0-9_-]{1,256}$/.test(challenge.token))throw Error('چالش دریافتی نامعتبر است.');
        this.challenge.set(challenge.token,{domain,value:keyAuthorization});
      },
      challengeRemoveFn:async(_authz,challenge)=>{this.challenge.delete(challenge.token);},
    });
    return {domain,email,accountKey,key:String(key),cert:String(cert)};
  }
  async bind(data) {
    if(this.server){this.server.setSecureContext({key:data.key,cert:data.cert,minVersion:'TLSv1.2'});return;}
    const server=https.createServer({key:data.key,cert:data.cert,minVersion:'TLSv1.2'},this.handler);
    server.requestTimeout=30000;server.headersTimeout=15000;server.keepAliveTimeout=5000;
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(this.httpsPort,this.host,()=>{server.removeListener('error',reject);resolve();});});
    server.on('error',e=>log.error('tls','https listener error',{code:e.code||'unknown'}));
    this.server=server;
  }
  save(data) {
    const filename=path.join(this.dir,'state.json');
    const tmp=path.join(this.dir,`.state-${crypto.randomBytes(12).toString('hex')}.tmp`);
    try { fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600,flag:'wx'}); fs.renameSync(tmp,filename); }
    finally { try{fs.unlinkSync(tmp)}catch{} }
  }
  async init(handler) {
    this.handler=handler;
    try {
      const file=path.join(this.dir,'state.json');
      if(fs.existsSync(file)) {
        this.configured=true;
        this.secureDirectory();
        if(fs.lstatSync(file).isSymbolicLink())throw Error('فایل گواهی معتبر نیست.');
        const state=JSON.parse(fs.readFileSync(file,'utf8'));
        state.domain=normalizeDomain(state.domain);state.expiresAt=validateCertificate(state,true);
        await this.bind(state);try{this.prepareFirewall();}catch(e){this.server.close();this.server=null;throw e;}this.active=state;
      }
    }catch(e){this.job={state:'error',message:'راه‌اندازی HTTPS انجام نشد: '+e.message};log.error('tls','initialization failed',{error:e.message});}
    this.timer=setInterval(()=>this.renewIfNeeded(),12*60*60*1000);this.timer.unref();
    if(this.active)setImmediate(()=>this.renewIfNeeded());
  }
  async renewIfNeeded(){if(!this.active||this.busy)return;if(Date.parse(this.active.expiresAt)-Date.now()>30*86400000)return;try{this.start(this.active.domain,this.active.email,true);}catch(e){this.job={state:'error',message:'تمدید خودکار آغاز نشد: '+e.message};log.warn('tls','renewal could not start',{error:e.message});}}
  status() {return {active:this.active?{domain:this.active.domain,expiresAt:this.active.expiresAt,email:this.active.email||'',valid:Date.parse(this.active.expiresAt)>Date.now()}:null,job:{...this.job},httpsPort:this.httpsPort,httpPort:this.httpPort};}
  start(domain,email,terms,actor) {
    if(this.busy)throw Error('صدور یا تمدید گواهی در حال انجام است.');
    if(terms!==true)throw Error('برای دریافت گواهی، پذیرش شرایط Let’s Encrypt الزامی است.');
    domain=normalizeDomain(domain);email=normalizeEmail(email);
    if(this.httpPort!==80)throw Error('صدور خودکار HTTP-01 نیاز دارد سامانه روی پورت ۸۰ گوش دهد.');
    this.busy=true;this.job={state:'working',domain,message:'در حال بررسی مالکیت دامنه و دریافت گواهی؛ ممکن است چند دقیقه طول بکشد.'};
    void this.run(domain,email,actor);return this.status();
  }
  async run(domain,email,actor) {
    const wasBound=!!this.server; let reservation=null,changedContext=false,createdFirewall=false;
    try {
      this.secureDirectory();
      // Reserve 443 throughout issuance. Never open a firewall for an unrelated listener.
      if(!wasBound){reservation=net.createServer(socket=>socket.destroy());await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(this.httpsPort,this.host,()=>{reservation.removeListener('error',reject);resolve();});});}
      const data=await this.issueCertificate(domain,email,this.active?.accountKey);
      data.domain=domain;data.email=email;data.expiresAt=validateCertificate(data);
      if(reservation){await new Promise(r=>reservation.close(r));reservation=null;}
      await this.bind(data);changedContext=true;
      createdFirewall=!!this.prepareFirewall();
      this.save(data);
      this.active=data;this.configured=true;this.job={state:'active',domain,message:'گواهی فعال شد و تمدید آن خودکار بررسی می‌شود.'};
      this.audit(actor,'TLS_CERTIFICATE_ACTIVATED',{domain,expiresAt:data.expiresAt});
    }catch(e){
      if(reservation){try{reservation.close()}catch{}}
      if(changedContext){if(wasBound&&this.active)this.server.setSecureContext({key:this.active.key,cert:this.active.cert,minVersion:'TLSv1.2'});else if(this.server){this.server.close();this.server=null;}}
      if(createdFirewall)this.removeFirewall();
      const message=e.code==='EADDRINUSE'?'پورت ۴۴۳ در اختیار برنامهٔ دیگری است.':e.message;
      this.job={state:'error',domain,message:'صدور یا فعال‌سازی انجام نشد. DNS، دسترسی اینترنتی پورت‌های ۸۰ و ۴۴۳ و اتصال سرور به اینترنت را بررسی کنید. '+String(message||'خطای ارتباط').slice(0,300)};
      log.warn('tls','certificate issuance failed',{domain,code:e.code||'ISSUE_FAILED'});this.audit(actor,'TLS_CERTIFICATE_FAILED',{domain,code:e.code||'ISSUE_FAILED'});
    }finally{this.challenge.clear();this.busy=false;}
  }
  audit(actor,action,details){try{const store=require('./store');store.audit(actor||null,action,'settings','https',details);store.save();}catch(e){log.warn('tls','audit failed',{error:e.message});}}
  httpHandler(req,res,next) {
    let pathname; try{pathname=new URL(req.url,'http://localhost').pathname;}catch{return next(req,res);}
    const match=pathname.match(/^\/\.well-known\/acme-challenge\/([A-Za-z0-9_-]{1,256})$/);
    if(match){const c=this.challenge.get(match[1]); const host=String(req.headers.host||'').toLowerCase().replace(/:80$/,'');
      if(req.method==='GET'&&c&&host===c.domain){res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});return res.end(c.value);}
      res.writeHead(404,{'Cache-Control':'no-store'});return res.end();}
    if(this.configured && !this.active && !isLocalAddress(req.socket.remoteAddress)){res.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});return res.end('HTTPS unavailable');}
    if(this.active){
      const host=String(req.headers.host||'').toLowerCase().replace(/:80$/,'');
      if(host===this.active.domain){res.writeHead(308,{Location:`https://${this.active.domain}${req.url.startsWith('/')&&!req.url.startsWith('//')?req.url:'/'}`,'Cache-Control':'no-store'});return res.end();}
      if(!isLocalAddress(req.socket.remoteAddress)){res.writeHead(403,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});return res.end('HTTPS required');}
    }
    return next(req,res);
  }
  close(){if(this.timer)clearInterval(this.timer);if(this.server)this.server.close();}
}
const manager=new TLSManager();
module.exports={manager,TLSManager,normalizeDomain,normalizeEmail,isLocalAddress,validateCertificate,windowsTlsAclScript};
