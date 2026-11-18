'use strict';
// Passphrase comes from the environment, never from command-line arguments or logs.
require('../lib/load-env').loadEnv();
const {encryptDatabase,decryptDatabase}=require('../lib/encrypted-backup');
const [operation,source,destination]=process.argv.slice(2);
(async()=>{
 if(!['encrypt','decrypt'].includes(operation)||!source||!destination)throw Error('Usage: node scripts/encrypted-backup.js encrypt|decrypt source destination');
 const passphrase=process.env.BT_BACKUP_PASSPHRASE;
 const file=await(operation==='encrypt'?encryptDatabase:decryptDatabase)(source,destination,passphrase);
 console.log(JSON.stringify({ok:true,operation,file}));
})().catch(()=>{console.error('Backup operation failed. Check paths, permissions, passphrase and file integrity. No destination was replaced.');process.exitCode=1;});
