'use strict';
// Run independently from the HTTP service under an OS scheduler. Secrets belong
// in the scheduler account environment, never on the command line or in reports.
require('../lib/load-env').loadEnv();
const config=require('../lib/config'),{runJob}=require('../lib/offsite-backup-job'),{sendAlert}=require('../lib/service-monitor');
const source=process.argv[2],destination=process.argv[3];
if(!source||!destination){console.error('Usage: node scripts/offsite-backup.js DATABASE ABSOLUTE_DESTINATION');process.exitCode=1;}
else runJob({source,dataDir:config.DATA_DIR,destination,passphrase:process.env.BT_BACKUP_PASSPHRASE,keep:Number(process.env.BT_OFFSITE_KEEP||0)}).then(result=>console.log(JSON.stringify(result,null,2))).catch(async()=>{
 console.error('Encrypted offsite backup job failed; check destination availability, permissions, secret and restore compatibility.');
 if(process.env.BT_ALERT_WEBHOOK_URL)try{await sendAlert(process.env.BT_ALERT_WEBHOOK_URL,{token:process.env.BT_ALERT_WEBHOOK_TOKEN});}catch{console.error('Alert delivery failed');}
 process.exitCode=1;
});
