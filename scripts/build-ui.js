'use strict';
// Deterministic, dependency-free composition of ordered legacy source sections.
// Concatenate without wrappers, minification or injected separators: hoisting and
// overrides must remain exactly as in the established classic-script bundles.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ROOT=path.join(__dirname,'..');
function build({root=ROOT,check=false}={}){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'ui-src/manifest.json'),'utf8'));
 if(manifest.version!==1||!Array.isArray(manifest.bundles))throw Error('Invalid UI manifest');
 const seen=new Set(),outputs=new Set(),result=[];
 for(const bundle of manifest.bundles){
  if(!/^public\/(app|ui2)\.js$/.test(bundle.output)||outputs.has(bundle.output)||!Array.isArray(bundle.parts)||!bundle.parts.length)throw Error('Invalid UI output');
  outputs.add(bundle.output);
  const buffers=bundle.parts.map(name=>{
   if(!/^ui-src\/(app|ui2)\/[a-z0-9-]+\.js$/.test(name)||seen.has(name))throw Error('Invalid or duplicate UI source');
   seen.add(name);const file=path.join(root,name);
   if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw Error('UI source must be a regular file');
   const content=fs.readFileSync(file);if(content.includes(Buffer.from('\r')))throw Error('UI source must use LF line endings');
   return content;
  });
  const bytes=Buffer.concat(buffers),target=path.join(root,bundle.output);
  new vm.Script(bytes.toString('utf8'),{filename:bundle.output});
  if(check){if(!fs.existsSync(target)||!fs.readFileSync(target).equals(bytes))throw Error('Stale UI bundle: '+bundle.output);}
  else fs.writeFileSync(target,bytes);
  result.push({output:bundle.output,sections:bundle.parts.length,bytes:bytes.length});
 }
 if(outputs.size!==2)throw Error('Both UI bundles must be declared');
 for(const folder of ['app','ui2'])for(const name of fs.readdirSync(path.join(root,'ui-src',folder))){
  if(name.endsWith('.js')&&!seen.has(`ui-src/${folder}/${name}`))throw Error('Unlisted UI source section: '+name);
 }
 return result;
}
if(require.main===module){try{console.log(JSON.stringify(build({check:process.argv.includes('--check')}),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={build};
