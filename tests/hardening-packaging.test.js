'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('release archive has a self-consistent manifest despite excluding GitHub tooling',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-package-check-')),root=path.join(__dirname,'..');
 try{
  const script=String.raw`
import hashlib, pathlib, subprocess, sys, zipfile
root, output = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
version = (root / 'RELEASE_VERSION.txt').read_text().strip()
subprocess.run([sys.executable, str(root / 'scripts/arena-release-build.py'), str(output), str(root), '--expected-version', version], check=True)
with zipfile.ZipFile(output / f'BabolToyor-App-{version}.zip') as archive:
    names = set(archive.namelist())
    assert not any(name.startswith('.github/') for name in names)
    manifest = archive.read('SHA256SUMS.txt').decode().splitlines()
    listed = set()
    for line in manifest:
        digest, name = line.split('  ', 1)
        name = name.removeprefix('./')
        assert hashlib.sha256(archive.read(name)).hexdigest() == digest, name
        listed.add(name)
    assert listed == names - {'SHA256SUMS.txt'}
`;
  const result=spawnSync(process.platform==='win32'?'python':'python3',['-c',script,root,path.join(dir,'assets')],{cwd:root,encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stderr);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('installer requires explicit permission to stop IIS and does not accept a TCP-only health check',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../windows-installer/Install-BabolToyor.ps1'),'utf8');
 assert.match(source,/\$NoAutoStopIis -or -not \$AllowStopIis/);
 const health=source.slice(source.indexOf('function Wait-Health'),source.indexOf('function Write-InfoFile'));
 assert.match(health,/api\/health/);assert.match(health,/\$health.service -eq 'baboltoyoor'/);assert.doesNotMatch(health,/if \(Test-Tcp/);
});
