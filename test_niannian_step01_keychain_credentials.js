'use strict';

const assert=require('assert');
const {EventEmitter}=require('events');
const fsp=require('fs').promises;
const os=require('os');
const path=require('path');
const credentials=require('./bridge/niannian_step01_keychain_credentials');

async function exists(filePath){return Boolean(await fsp.lstat(filePath).catch(()=>null));}
async function main(){
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-keychain-credentials-')),secret='test-secret-not-a-real-provider-value-123';
  try{
    let capturedArgs=null,capturedStdin=null;
    const spawnImpl=(command,args,options)=>{const child=new EventEmitter();child.stdin={end(payload,callback){capturedArgs=[command,...args];capturedStdin=payload?Buffer.from(payload):Buffer.alloc(0);if(callback)callback();setImmediate(()=>child.emit('exit',0));}};assert.deepEqual(options.stdio,['pipe','ignore','ignore']);return child;};
    await credentials.runSecurity(['add-generic-password','-U','-a','test-account','-s','test-service','-w'],{secret,confirmations:2},{spawnImpl});
    assert.equal(capturedArgs.includes(secret),false);assert.equal(capturedStdin.toString('utf8'),secret+'\n'+secret+'\n');capturedStdin.fill(0);

    const statusPath=path.join(root,'runtime_capability_status.json'),receiptPath=path.join(root,'configure-receipt.json'),calls=[];
    const securityExecutor=async(args,input)=>{calls.push({args:[...args],input});if(args.includes('add-generic-password')){assert.equal(args.includes(secret),false);assert.equal(input.secret,secret);assert.equal(input.confirmations,2);return;}assert(args.includes('find-generic-password'));assert.equal(input,null);};
    const receipt=await credentials.configureCredential('credential:mimo_asr',secret,{statusPath,receiptPath,securityExecutor,nowMs:Date.parse('2026-07-15T08:00:00.000Z')});
    assert.equal(receipt.status,'configured_unverified');assert.equal(receipt.keychain.present,true);assert.equal(receipt.keychain.secret_exported,false);assert.equal(receipt.keychain.secret_in_process_argv,false);assert.equal(receipt.health_verified,false);assert.equal(calls.length,2);
    const configureText=(await fsp.readFile(statusPath,'utf8'))+(await fsp.readFile(receiptPath,'utf8'));assert.equal(configureText.includes(secret),false);const configuredStatus=JSON.parse(await fsp.readFile(statusPath,'utf8'));assert.equal(configuredStatus.capabilities['credential:mimo_asr'].status,'configured_unverified');assert.equal(configuredStatus.capabilities['runtime:hq'].status,'missing');

    const failedStatus=path.join(root,'failed-status.json'),failedReceipt=path.join(root,'failed-receipt.json');
    await assert.rejects(()=>credentials.configureCredential('credential:paddle_ocr',secret,{statusPath:failedStatus,receiptPath:failedReceipt,securityExecutor:async(args)=>{if(args.includes('add-generic-password'))throw new Error('simulated_user_cancel_or_security_failure');}}),/simulated_user_cancel_or_security_failure/);assert.equal(await exists(failedStatus),false);assert.equal(await exists(failedReceipt),false);
    await assert.rejects(()=>credentials.configureCredential('credential:paddle_ocr','short',{statusPath:failedStatus,receiptPath:failedReceipt,securityExecutor:async()=>{throw new Error('must_not_start');}}),/step01_credential_input_invalid/);assert.equal(await exists(failedStatus),false);

    const reconcileStatus=path.join(root,'reconcile-status.json'),reconcileReceipt=path.join(root,'reconcile-receipt.json'),presenceCalls=[];
    await fsp.writeFile(reconcileStatus,JSON.stringify({schema_version:'niannian_runtime_capability_status_v1',capabilities:{'credential:mimo_asr':{status:'ready',evidence:{method:'stale_external_claim'}},'runtime:hq':{status:'ready'}}},null,2)+'\n');
    const reconciled=await credentials.reconcilePresence({statusPath:reconcileStatus,receiptPath:reconcileReceipt,nowMs:Date.parse('2026-07-15T08:05:00.000Z'),securityExecutor:async(args,input)=>{presenceCalls.push(args);assert(args.includes('find-generic-password'));assert.equal(args.includes('-w'),false);assert.equal(input,null);}});
    assert.equal(reconciled.status,'configured_unverified');assert.equal(reconciled.capabilities['credential:mimo_asr'].present,true);assert.equal(reconciled.capabilities['credential:paddle_ocr'].present,true);assert.equal(reconciled.capabilities['credential:mimo_asr'].health_context,'prior_official_models_auth_12_of_12_http_200_no_fee_reported_separately_not_reverified');assert.equal(reconciled.capabilities['credential:paddle_ocr'].health_context,'current_day_token_present_provider_health_unverified_no_job');assert.equal(reconciled.runtime_hq_ready,false);assert.equal(reconciled.secret_read,false);assert.equal(presenceCalls.length,2);
    const reconciledStatus=JSON.parse(await fsp.readFile(reconcileStatus,'utf8'));assert.equal(reconciledStatus.capabilities['credential:mimo_asr'].status,'configured_unverified');assert.equal(reconciledStatus.capabilities['credential:paddle_ocr'].status,'configured_unverified');assert.equal(reconciledStatus.capabilities['runtime:hq'].status,'missing');const reconcileText=(await fsp.readFile(reconcileStatus,'utf8'))+(await fsp.readFile(reconcileReceipt,'utf8'));assert.equal(reconcileText.includes(secret),false);

    const partial=await credentials.reconcilePresence({statusPath:path.join(root,'partial-status.json'),receiptPath:path.join(root,'partial-receipt.json'),securityExecutor:async(args)=>{if(args.includes('paddle-ocr-api-token'))throw new Error('missing');}});assert.equal(partial.status,'missing_credentials');assert.equal(partial.capabilities['credential:mimo_asr'].status,'configured_unverified');assert.equal(partial.capabilities['credential:paddle_ocr'].status,'missing');assert.equal(partial.runtime_hq_ready,false);

    process.stdout.write(JSON.stringify({ok:true,verified:['security add-generic-password receives two stdin confirmations','secret absent from argv, status, receipt and output','presence readback follows successful add','cancel/security failure and invalid input write no status or receipt','reconcile-presence reads exact two Keychain identities without -w','Mimo prior auth context and Paddle unverified context remain distinct','presence only yields configured_unverified and runtime:hq remains missing','no provider network/job/upload/submit/spend/project media']})+'\n');
  }finally{await fsp.rm(root,{recursive:true,force:true});}
}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
