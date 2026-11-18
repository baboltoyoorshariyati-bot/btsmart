'use strict';
// Versioned authenticated envelope: magic(8), salt(16), IV(12), ciphertext, GCM tag(16).
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {pipeline}=require('node:stream/promises'),{promisify}=require('node:util');
const {DatabaseSync}=require('node:sqlite');
const MAGIC=Buffer.from('BTENC01\n'),HEADER=36,TAG=16;
async function keyFor(passphrase,salt){
  if(typeof passphrase!=='string'||passphrase.length<16||passphrase.length>1024)throw Error('Backup passphrase must contain 16 to 1024 characters');
  return promisify(crypto.scrypt)(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
}
function validate(file){
 const db=new DatabaseSync(file,{readOnly:true});
 try{db.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON;');
  const rows=db.prepare('PRAGMA quick_check').all();
  if(rows.length!==1||Object.values(rows[0])[0]!=='ok')throw Error('Invalid SQLite backup');
  if(db.prepare("SELECT value FROM schema_info WHERE key='version'").get()?.value!=='1')throw Error('Unsupported backup schema');
 }finally{db.close();}
}
async function publish(output,work){
 output=path.resolve(output);if(fs.existsSync(output))throw Error('Refusing to overwrite destination');
 const partial=path.join(path.dirname(output),'.bt-encrypted-'+crypto.randomBytes(16).toString('hex')+'.partial');
 try{await work(partial);fs.linkSync(partial,output);}finally{try{fs.unlinkSync(partial)}catch{}}
 return output;
}
async function encryptDatabase(source,output,passphrase){
 if(!fs.existsSync(source))throw Error('Database not found');
 const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=await keyFor(passphrase,salt);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bt-private-backup-'));
 try{
  const snapshot=path.join(temp,'snapshot.db');fs.closeSync(fs.openSync(snapshot,'wx',0o600));
  const db=new DatabaseSync(source,{readOnly:true});
  try{db.prepare('VACUUM INTO ?').run(snapshot);}finally{db.close();}
  validate(snapshot);
  return await publish(output,async partial=>{
   const header=Buffer.concat([MAGIC,salt,iv]),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(header);
   fs.writeFileSync(partial,header,{flag:'wx',mode:0o600});
   await pipeline(fs.createReadStream(snapshot),cipher,fs.createWriteStream(partial,{flags:'a',mode:0o600}));
   fs.appendFileSync(partial,cipher.getAuthTag());
  });
 }finally{key.fill(0);fs.rmSync(temp,{recursive:true,force:true});}
}
async function decryptDatabase(source,output,passphrase){
 const size=fs.statSync(source).size;if(size<HEADER+TAG)throw Error('Invalid encrypted backup');
 const handle=fs.openSync(source,'r'),header=Buffer.alloc(HEADER),tag=Buffer.alloc(TAG);
 try{fs.readSync(handle,header,0,HEADER,0);fs.readSync(handle,tag,0,TAG,size-TAG);}finally{fs.closeSync(handle);}
 if(!header.subarray(0,8).equals(MAGIC))throw Error('Unsupported encrypted backup');
 const key=await keyFor(passphrase,header.subarray(8,24));
 try{return await publish(output,async partial=>{
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,header.subarray(24,36));decipher.setAAD(header);decipher.setAuthTag(tag);
  await pipeline(fs.createReadStream(source,{start:HEADER,end:size-TAG-1}),decipher,fs.createWriteStream(partial,{flags:'wx',mode:0o600}));
  validate(partial);
 });}finally{key.fill(0);}
}
module.exports={encryptDatabase,decryptDatabase};
