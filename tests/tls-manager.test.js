'use strict';
const test=require('node:test'),assert=require('node:assert/strict');

test('Windows TLS ACL retains the executing service identity without broad user grants',()=>{
 const {windowsTlsAclScript}=require('../lib/tls-manager');
 const script=windowsTlsAclScript("C:\\private\\tls'quoted");
 assert.match(script,/WindowsIdentity\]::GetCurrent\(\)/);
 assert.match(script,/S-1-5-18/);assert.match(script,/S-1-5-32-544/);
 assert.doesNotMatch(script,/S-1-1-0|S-1-5-32-545/);
 assert.ok(!script.includes("tls'quoted"));
});
