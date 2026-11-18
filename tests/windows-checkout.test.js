'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
test('Windows-style Git checkout preserves installer payload and source contracts', {skip:!fs.existsSync(path.join(root,'.git'))},()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bt-checkout-'));
 try{
  const env={...process.env,GIT_INDEX_FILE:path.join(temp,'index')};
  const git=args=>{const r=spawnSync('git',args,{cwd:root,env,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);};
  // Temporary index only: never stage or alter the user's working index.
  git(['read-tree','HEAD']);git(['add','--all']);
  const prefix=path.join(temp,'checkout').replace(/\\/g,'/')+'/';fs.mkdirSync(prefix);
  git(['-c','core.autocrlf=true','checkout-index','--all','--prefix='+prefix]);
  const source=fs.readFileSync(path.join(prefix,'windows-installer/Install-BabolToyor.ps1'));
  assert.equal(source.includes(Buffer.from('\r\n')),false,'PowerShell payload source must remain LF even on Windows');
  const result=spawnSync(process.execPath,['--test','tests/windows-installer.test.js','tests/release-version.test.js'],{cwd:prefix,encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('least-privileged service identity is explicit, uses a well-known SID and limited run level',()=>{
 const source=fs.readFileSync(path.join(root,'windows-installer/Install-BabolToyor.ps1'),'utf8');
 assert.match(source,/ValidateSet\('SYSTEM','LOCAL SERVICE'\)/);
 assert.match(source,/-UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited/);
 assert.match(source,/function Grant-ServiceAccess/);
 assert.match(source,/\$DataDir,'Modify'/);assert.match(source,/\$InstallDir,'ReadAndExecute'/);
 assert(source.indexOf('\n  Grant-ServiceAccess\n')<source.indexOf('\n  Register-AutoStart\n'));
});
