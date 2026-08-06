'use strict';

const crypto=require('crypto');
const fs=require('fs');
const fsp=fs.promises;
const os=require('os');
const path=require('path');
const {AppServerClient,CODEX_PATH,PROJECT_ROOT,THREADS,hasActiveTurn,safeErrorSummary,summarizeThread}=require('./mac_codex_app_employee_bootstrap');
const {activeProfile}=require('./niannian_employee_model_profiles');

const REQUEST_SCHEMA='niannian_mac_fixed_thread_app_turn_request_v1';
const RECEIPT_SCHEMA='niannian_mac_fixed_thread_app_turn_receipt_v1';
const MAX_ENVELOPE_BYTES=64*1024;
const MARKER_PROBE_TIMEOUT_MS=120000;
const READ_ONLY_AUDIT_TIMEOUT_MS=900000;
const LIFECYCLE_POLL_MS=1000;
const INTERRUPT_GRACE_MS=30000;
const RECEIPT_ROOT=path.join(os.homedir(),'.local','share','niannian-ai','mac-app-turn-receipts');
const SECRET_PATTERNS=Object.freeze([
  /sk-[A-Za-z0-9_-]{12,}/i,
  /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|cookie|authorization)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}/i,
  /bearer\s+[A-Za-z0-9_./+=-]{8,}/i,
  /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i
]);

function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
function jsonBytes(value){return Buffer.from(JSON.stringify(value,null,2)+'\n','utf8');}
function notificationSummary(message){
  const params=message&&message.params||{},turn=params.turn||{};
  const rawStatus=turn.status??params.status??null;
  return {method:message&&message.method||null,param_keys:Object.keys(params).sort(),thread_id:params.threadId||params.thread_id||null,turn_keys:Object.keys(turn).sort(),turn_id:turn.id||null,turn_status:normalizeTurnStatus(rawStatus),turn_status_shape:rawStatus&&typeof rawStatus==='object'?Object.keys(rawStatus).sort():typeof rawStatus,turn_error:(turn.error??params.error??null)?safeErrorSummary(turn.error??params.error):null};
}
function normalizeTurnStatus(value){if(typeof value==='string')return value;if(!value||typeof value!=='object')return null;if(typeof value.type==='string')return value.type;if(typeof value.status==='string')return value.status;for(const key of ['completed','failed','cancelled','interrupted','inProgress','pending'])if(Object.prototype.hasOwnProperty.call(value,key))return key;return null;}
function normalizeCompletionNotification(message,threadId,turnId){
  const summary=notificationSummary(message),params=message&&message.params||{},turn=params.turn||{};
  if(summary.method!=='turn/completed'||summary.thread_id!==threadId||summary.turn_id!==turnId)throw new Error('mac_fixed_turn_completion_notification_mismatch');
  const statusValue=turn.status??params.status,status=normalizeTurnStatus(statusValue), error=turn.error??params.error??null;
  if(status!=='completed'||error!==null)throw new Error('mac_fixed_turn_completion_notification_not_clean:status='+String(status||'unknown')+':shape='+(statusValue&&typeof statusValue==='object'?Object.keys(statusValue).sort().join(','):typeof statusValue));
  return {method:'turn/completed',turn_id:turnId,status:'completed',error:null,notification_shape:summary};
}
const TERMINAL_TURN_STATUSES=new Set(['completed','failed','cancelled','interrupted']);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function markerProbe(envelope){const prompt=String(envelope?.prompt||'').trim();return prompt==='NIANNIAN_NATIVE_ACCOUNT_PROBE_OK'||(prompt.includes('native-account 只读鉴权探针')&&/只回复[：:]\s*NIANNIAN_NATIVE_ACCOUNT_PROBE_OK\s*$/.test(prompt));}
function compactionRecoveryProbe(envelope){const prompt=String(envelope?.prompt||'').trim();return prompt.includes('Employee 01')&&prompt.includes('native-account 只读鉴权探针')&&/只回复[：:]\s*NIANNIAN_NATIVE_ACCOUNT_PROBE_OK\s*$/.test(prompt);}
async function exactTurnReadback(client,threadId,turnId){
  const thread=(await client.request('thread/read',{threadId,includeTurns:true})).thread;
  const summary=summarizeThread(thread),turn=Array.isArray(thread?.turns)?thread.turns.find(item=>String(item?.id||'')===turnId):null;
  return {summary,turn:turn||null,status:normalizeTurnStatus(turn?.status)||null,error:turn?.error??null};
}
function lifecycleError(code,lifecycle){const error=new Error(code);error.lifecycle=lifecycle;return error;}
async function monitorExactTurnLifecycle(client,threadId,turnId,options={}){
  const timeoutMs=Number(options.timeoutMs||READ_ONLY_AUDIT_TIMEOUT_MS),pollMs=Number(options.pollMs||LIFECYCLE_POLL_MS),interruptGraceMs=Number(options.interruptGraceMs||INTERRUPT_GRACE_MS),notificationGraceMs=Number(options.notificationGraceMs||5000),startedAt=Date.now();
  let completionNotification=null,notificationFailure=null,polls=0,lastReadback=null,completedSeenAt=null;
  const onNotification=message=>{if(message?.method==='turn/completed'&&message.params?.threadId===threadId&&message.params?.turn?.id===turnId){try{completionNotification=normalizeCompletionNotification(message,threadId,turnId);}catch(error){error.notification_summary=notificationSummary(message);notificationFailure=error;}}};
  if(typeof client.on==='function')client.on('notification',onNotification);
  try{
    while(Date.now()-startedAt<timeoutMs){
      if(notificationFailure)throw notificationFailure;
      lastReadback=await exactTurnReadback(client,threadId,turnId);polls+=1;
      if(lastReadback.turn&&TERMINAL_TURN_STATUSES.has(lastReadback.status)){
        if(lastReadback.status!=='completed'||lastReadback.error!==null)throw lifecycleError('mac_fixed_turn_terminal_not_clean',{stage:'terminal_readback',polls,status:lastReadback.status,error_present:lastReadback.error!==null,interrupted_by_runner:false});
        if(completionNotification)return {completion:completionNotification,readback:lastReadback,monitor:{polls,timeout_ms:timeoutMs,poll_ms:pollMs,interrupt_requested:false,source:'matching_notification_and_periodic_exact_readback'}};
        if(completedSeenAt===null)completedSeenAt=Date.now();
        if(Date.now()-completedSeenAt>=notificationGraceMs)throw lifecycleError('mac_fixed_turn_completion_notification_missing',{stage:'completed_readback_without_notification',polls,status:lastReadback.status,interrupted_by_runner:false});
      }
      await delay(pollMs);
    }
    lastReadback=await exactTurnReadback(client,threadId,turnId);polls+=1;
    if(lastReadback.turn&&lastReadback.status==='completed'&&lastReadback.error===null&&completionNotification)return {completion:completionNotification,readback:lastReadback,monitor:{polls,timeout_ms:timeoutMs,poll_ms:pollMs,interrupt_requested:false,source:'matching_notification_and_periodic_exact_readback'}};
    if(!lastReadback.turn||lastReadback.status!=='inProgress')throw lifecycleError('mac_fixed_turn_completion_timeout_without_interruptable_exact_turn',{stage:'timeout_readback',polls,status:lastReadback.status,exact_turn_present:Boolean(lastReadback.turn),interrupted_by_runner:false});
    await client.request('turn/interrupt',{threadId,turnId});
    const interruptStarted=Date.now();
    while(Date.now()-interruptStarted<interruptGraceMs){
      lastReadback=await exactTurnReadback(client,threadId,turnId);polls+=1;
      if(lastReadback.turn&&TERMINAL_TURN_STATUSES.has(lastReadback.status))throw lifecycleError('mac_fixed_turn_completion_timeout_interrupted',{stage:'terminal_after_exact_interrupt',polls,status:lastReadback.status,exact_turn_present:true,interrupt_requested:true,interrupt_thread_id:threadId,interrupt_turn_id:turnId,interrupted_by_runner:lastReadback.status==='interrupted'});
      await delay(pollMs);
    }
    throw lifecycleError('mac_fixed_turn_interrupt_terminal_readback_timeout',{stage:'interrupt_grace_timeout',polls,status:lastReadback?.status||null,exact_turn_present:Boolean(lastReadback?.turn),interrupt_requested:true,interrupt_thread_id:threadId,interrupt_turn_id:turnId,interrupted_by_runner:false});
  }finally{if(typeof client.off==='function')client.off('notification',onNotification);}
}
function assertRequestId(value){const normalized=String(value||'');if(!/^[A-Za-z0-9._-]{8,96}$/.test(normalized))throw new Error('mac_fixed_turn_request_id_invalid');return normalized;}
function assertSha(value){const normalized=String(value||'').toLowerCase();if(!/^[a-f0-9]{64}$/.test(normalized))throw new Error('mac_fixed_turn_sha_invalid');return normalized;}
function fixedThread(threadId){const fixed=THREADS.find(item=>item.thread_id===String(threadId||''));if(!fixed)throw new Error('mac_fixed_turn_thread_id_rejected');return fixed;}
function decodeBase64Url(value){
  const text=String(value||'');if(!/^[A-Za-z0-9_-]+$/.test(text))throw new Error('mac_fixed_turn_base64url_invalid');
  const padded=text+'='.repeat((4-text.length%4)%4);const bytes=Buffer.from(padded.replace(/-/g,'+').replace(/_/g,'/'),'base64');
  if(bytes.length<=0||bytes.length>MAX_ENVELOPE_BYTES)throw new Error('mac_fixed_turn_envelope_size_invalid');
  return bytes;
}
function rejectSecrets(text){if(SECRET_PATTERNS.some(pattern=>pattern.test(text)))throw new Error('mac_fixed_turn_secret_like_content_rejected');}
function falseEffects(value){for(const key of ['media_provider_network_requested','media_provider_submit_requested','media_provider_upload_requested','spend_requested','package_send_requested','registry_promotion_requested','deployment_requested','local_image_editing_requested','production_write_requested','shell_command_requested'])if(value?.[key]!==false)throw new Error('mac_fixed_turn_side_effect_rejected:'+key);}
function ensureEmployeeModelRuntime(){const profile=activeProfile();if(profile.credential_mode!=='native_account'||profile.config_provider_id!=='openai'||profile.process_env_keys.length)throw new Error('mac_fixed_turn_native_account_route_required');return {source:'codex_home_account_session',launch_mode:'native_account',provider_config_id:'openai',env_key_names:[],raw_auth_read:false,raw_auth_recorded:false};}
const ensureKrillEnv=ensureEmployeeModelRuntime;
function parseEnvelope(bytes,expectedRequestId,expectedThreadId,expectedSha){
  if(sha256(bytes)!==expectedSha)throw new Error('mac_fixed_turn_envelope_sha_mismatch');
  const raw=bytes.toString('utf8');rejectSecrets(raw);
  let envelope;try{envelope=JSON.parse(raw);}catch{throw new Error('mac_fixed_turn_envelope_json_invalid');}
  if(envelope?.schema_version!==REQUEST_SCHEMA)throw new Error('mac_fixed_turn_schema_invalid');
  if(envelope.request_id!==expectedRequestId||envelope.thread_id!==expectedThreadId)throw new Error('mac_fixed_turn_envelope_binding_mismatch');
  if(envelope.project_root!==PROJECT_ROOT)throw new Error('mac_fixed_turn_project_root_mismatch');
  if(envelope.read_only!==true||envelope.network_access!==false)throw new Error('mac_fixed_turn_readonly_contract_invalid');
  if(typeof envelope.prompt!=='string'||!envelope.prompt.trim()||Buffer.byteLength(envelope.prompt,'utf8')>32000)throw new Error('mac_fixed_turn_prompt_invalid');
  falseEffects(envelope);
  rejectSecrets(envelope.prompt);
  return envelope;
}
async function atomicReceipt(receiptPath,receipt){
  await fsp.mkdir(path.dirname(receiptPath),{recursive:true,mode:0o700});
  const bytes=jsonBytes(receipt),tmp=receiptPath+'.tmp-'+process.pid+'-'+crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(tmp,bytes,{flag:'wx',mode:0o600});await fsp.rename(tmp,receiptPath);try{await fsp.chmod(receiptPath,0o600);}catch{}
  return {sha256:sha256(bytes),bytes:bytes.length};
}
async function readReceipt(receiptPath){try{return JSON.parse(await fsp.readFile(receiptPath,'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function appendAttemptEvent(filePath,event){await fsp.mkdir(path.dirname(filePath),{recursive:true,mode:0o700});const bytes=Buffer.from(JSON.stringify(event)+'\n','utf8');const handle=await fsp.open(filePath,'a',0o600);try{await handle.write(bytes);await handle.sync();}finally{await handle.close();}return {sha256:sha256(bytes),bytes:bytes.length};}
function summarizeForIdentity(summary,fixed,allowNotLoaded=false){
  const type=String(summary.status?.type||'');
  if(allowNotLoaded&&type==='notLoaded')return;
  if(summary.thread_id!==fixed.thread_id||summary.title!==fixed.title||summary.cwd!==PROJECT_ROOT)throw new Error('mac_fixed_turn_thread_identity_mismatch:'+fixed.employee);
}
function stableCas(before,after,selectedId){
  if(before.length!==THREADS.length||after.length!==THREADS.length)throw new Error('mac_fixed_turn_all_threads_read_incomplete');
  for(let index=0;index<THREADS.length;index+=1){
    const first=before[index],second=after[index],fixed=THREADS[index];
    if(first.thread_id!==second.thread_id)throw new Error('mac_fixed_turn_thread_order_changed');
    if(first.thread_id===selectedId&&String(first.status?.type||'')==='notLoaded')continue;
    if(first.turns!==second.turns||first.latest_turn_id!==second.latest_turn_id||first.latest_completed_assistant_turn_id!==second.latest_completed_assistant_turn_id||String(first.status?.type||'')!==String(second.status?.type||''))throw new Error('mac_fixed_turn_thread_cas_changed:'+fixed.employee);
  }
}
async function readAll(client,{allowSelectedNotLoaded=null}={}){
  const rows=[];
  for(const fixed of THREADS){
    const summary=summarizeThread((await client.request('thread/read',{threadId:fixed.thread_id,includeTurns:true})).thread);
    summarizeForIdentity(summary,fixed,allowSelectedNotLoaded===fixed.thread_id);
    if(hasActiveTurn(summary))throw new Error('mac_fixed_turn_active_thread:'+fixed.employee);
    rows.push(summary);
  }
  return rows;
}
async function runAppTurn(options={}){
  const requestId=assertRequestId(options.requestId);const fixed=fixedThread(options.threadId);const expectedSha=assertSha(options.envelopeSha256);const envelopeBytes=options.envelopeBytes||decodeBase64Url(options.envelopeBase64Url);const envelope=parseEnvelope(envelopeBytes,requestId,fixed.thread_id,expectedSha);
  const receiptPath=path.resolve(options.receiptPath||path.join(RECEIPT_ROOT,requestId+'.json'));const existing=await readReceipt(receiptPath);
  if(existing){if(existing.schema_version!==RECEIPT_SCHEMA||existing.request_id!==requestId||existing.thread_id!==fixed.thread_id||existing.envelope_sha256!==expectedSha)throw new Error('mac_fixed_turn_replay_conflict');return {status:existing.status==='failed'?'replayed_failed':'replayed',receipt:existing,receipt_path:receiptPath};}
  const profile=activeProfile();const client=options.client||new AppServerClient(options.codexPath||CODEX_PATH,options.transport||profile.app_server_transport,profile);const ownsClient=!options.client;let startedTurn=null,completionNotification=null,lifecycle=null,preTurnCompaction=null,employeeModelEnv=null;const attemptPath=path.resolve(options.attemptPath||receiptPath+'.attempts.jsonl');const isMarkerProbe=markerProbe(envelope);const lifecycleTimeoutMs=Number(options.timeoutMs||(isMarkerProbe?MARKER_PROBE_TIMEOUT_MS:READ_ONLY_AUDIT_TIMEOUT_MS));
  try{
    employeeModelEnv=ensureEmployeeModelRuntime();
    await appendAttemptEvent(attemptPath,{schema_version:'niannian_mac_fixed_thread_attempt_event_v1',event_type:'dispatch_claimed',request_id:requestId,thread_id:fixed.thread_id,envelope_sha256:expectedSha,attempt_id:requestId,created_at:new Date().toISOString()});
    if(ownsClient)await client.start();
    const auth=await require('./mac_codex_app_employee_bootstrap').inspectNativeAccountRuntime(client,profile);
    if(compactionRecoveryProbe(envelope)&&fixed.thread_id==='019f6201-c013-7cf3-b155-61d2789085f4')preTurnCompaction=await require('./mac_codex_app_employee01_compaction').runEmployee01Compaction({client,auth,receiptPath:options.compactionReceiptPath,timeoutMs:options.compactionTimeoutMs,terminalTimeoutMs:options.compactionTerminalTimeoutMs,pollMs:options.compactionPollMs});
    const before=await readAll(client,{allowSelectedNotLoaded:fixed.thread_id});
    const selectedBefore=before.find(item=>item.thread_id===fixed.thread_id);
    await client.request('thread/resume',{threadId:fixed.thread_id,cwd:PROJECT_ROOT,approvalPolicy:'never',excludeTurns:true,modelProvider:auth.provider_config_id,model:auth.default_model});
    const second=await readAll(client);
    stableCas(before,second,fixed.thread_id);
    const started=await client.request('turn/start',{threadId:fixed.thread_id,cwd:PROJECT_ROOT,approvalPolicy:'never',sandboxPolicy:{type:'readOnly',networkAccess:false},model:auth.default_model,...(isMarkerProbe?{effort:'low'}:{}),input:[{type:'text',text:envelope.prompt,text_elements:[]}]});
    startedTurn=started.turn;
    lifecycle=await monitorExactTurnLifecycle(client,fixed.thread_id,startedTurn.id,{timeoutMs:lifecycleTimeoutMs,pollMs:Number(options.pollMs||LIFECYCLE_POLL_MS),interruptGraceMs:Number(options.interruptGraceMs||INTERRUPT_GRACE_MS),notificationGraceMs:Number(options.notificationGraceMs||5000)});completionNotification=lifecycle.completion;
    const readback=lifecycle.readback.summary;
    summarizeForIdentity(readback,fixed,false);
    const completion={...completionNotification,source:'exact_notification_and_thread_readback'};
    if(readback.latest_turn_id!==completion.turn_id||readback.latest_turn_status!=='completed'||readback.latest_turn_error!==null)throw new Error('mac_fixed_turn_readback_mismatch');
    const responseText=String(readback.latest_assistant_text||'');rejectSecrets(responseText);if(isMarkerProbe&&responseText.trim()!=='NIANNIAN_NATIVE_ACCOUNT_PROBE_OK')throw new Error('mac_fixed_turn_marker_response_mismatch');
    const receipt={schema_version:RECEIPT_SCHEMA,status:'completed_verified',request_id:requestId,thread_id:fixed.thread_id,employee:fixed.employee,title:fixed.title,project_root:PROJECT_ROOT,envelope_sha256:expectedSha,envelope_bytes:envelopeBytes.length,purpose:String(envelope.purpose||'read_only_fixed_thread_turn').slice(0,200),employee_model_channel:{channel_id:'codex_native_account_v1',...auth,env_key_names:employeeModelEnv.env_key_names,raw_auth_read:false,raw_auth_recorded:false,media_provider_authority_granted:false},pre_turn_compaction:preTurnCompaction?{status:preTurnCompaction.status,contract_id:preTurnCompaction.receipt.contract_id,thread_id:preTurnCompaction.receipt.thread_id,receipt_sha256:preTurnCompaction.receipt.receipt_sha256||null,receipt_bytes:preTurnCompaction.receipt.receipt_bytes||null}:null,turn_start:{method:'turn/start',turn_id:String(startedTurn.id||''),sandbox_policy:{type:'readOnly',networkAccess:false},reasoning_effort:isMarkerProbe?'low':null,timeout_class:isMarkerProbe?'marker_probe':'read_only_audit',timeout_ms:lifecycleTimeoutMs},lifecycle_monitor:lifecycle.monitor,marker_probe:{requested:isMarkerProbe,verified:isMarkerProbe,response_marker_sha256:isMarkerProbe?sha256(Buffer.from('NIANNIAN_NATIVE_ACCOUNT_PROBE_OK','utf8')):null},completion_event:completion,thread_readback:{latest_completed_assistant_turn_id:readback.latest_completed_assistant_turn_id,latest_turn_id:readback.latest_turn_id,latest_turn_status:readback.latest_turn_status,turns:readback.turns,response_sha256:sha256(Buffer.from(responseText,'utf8')),response_bytes:Buffer.byteLength(responseText,'utf8')},media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,package_send_requested:false,registry_promotion_requested:false,deployment_requested:false,local_image_editing_requested:false,production_write_requested:false,shell_command_requested:false,created_at:new Date().toISOString()};
    const receiptEvidence=await atomicReceipt(receiptPath,receipt);
    await appendAttemptEvent(attemptPath,{schema_version:'niannian_mac_fixed_thread_attempt_event_v1',event_type:'codex_turn_completed',request_id:requestId,thread_id:fixed.thread_id,envelope_sha256:expectedSha,attempt_id:requestId,turn_id:completion.turn_id,receipt_sha256:receiptEvidence.sha256,created_at:receipt.created_at});
    return {status:'completed_verified',receipt:{...receipt,receipt_sha256:receiptEvidence.sha256,receipt_bytes:receiptEvidence.bytes},receipt_path:receiptPath};
  }catch(error){
    let failureReadback=null;try{failureReadback=summarizeThread((await client.request('thread/read',{threadId:fixed.thread_id,includeTurns:true})).thread);if(failureReadback.latest_assistant_text)failureReadback.latest_assistant_text_sha256=sha256(Buffer.from(failureReadback.latest_assistant_text,'utf8'));delete failureReadback.latest_assistant_text;}catch{}
    const failed={schema_version:RECEIPT_SCHEMA,status:'failed',request_id:requestId,thread_id:fixed.thread_id,employee:fixed.employee,title:fixed.title,project_root:PROJECT_ROOT,envelope_sha256:expectedSha,envelope_bytes:envelopeBytes.length,employee_model_channel:{channel_id:'codex_native_account_v1',launch_mode:'native_account',provider_config_id:'openai',credential_source:'codex_home_account_session',env_key_names:[],raw_auth_read:false,raw_auth_recorded:false,media_provider_authority_granted:false},pre_turn_compaction:preTurnCompaction?{status:preTurnCompaction.status,contract_id:preTurnCompaction.receipt.contract_id,thread_id:preTurnCompaction.receipt.thread_id,receipt_sha256:preTurnCompaction.receipt.receipt_sha256||null,receipt_bytes:preTurnCompaction.receipt.receipt_bytes||null}:(error.compaction_receipt?{status:error.compaction_receipt.status,contract_id:error.compaction_receipt.contract_id,thread_id:error.compaction_receipt.thread_id,receipt_sha256:error.compaction_receipt.receipt_sha256||null,receipt_bytes:error.compaction_receipt.receipt_bytes||null}:null),turn_start:startedTurn?{method:'turn/start',turn_id:String(startedTurn.id||''),sandbox_policy:{type:'readOnly',networkAccess:false},reasoning_effort:isMarkerProbe?'low':null,timeout_class:isMarkerProbe?'marker_probe':'read_only_audit',timeout_ms:lifecycleTimeoutMs}:null,lifecycle_monitor:error.lifecycle||lifecycle?.monitor||null,error:{...safeErrorSummary(error),notification_summary:error.notification_summary||completionNotification?.notification_shape||null},failure_readback:failureReadback?{latest_turn_id:failureReadback.latest_turn_id,latest_turn_status:failureReadback.latest_turn_status,latest_turn_error:failureReadback.latest_turn_error,latest_completed_assistant_turn_id:failureReadback.latest_completed_assistant_turn_id,turns:failureReadback.turns,latest_assistant_text_sha256:failureReadback.latest_assistant_text_sha256||null}:null,secret_redacted:true,media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,package_send_requested:false,registry_promotion_requested:false,deployment_requested:false,local_image_editing_requested:false,production_write_requested:false,shell_command_requested:false,created_at:new Date().toISOString()};
    await atomicReceipt(receiptPath,failed).catch(()=>{});
    await appendAttemptEvent(attemptPath,{schema_version:'niannian_mac_fixed_thread_attempt_event_v1',event_type:'codex_turn_failed',request_id:requestId,thread_id:fixed.thread_id,envelope_sha256:expectedSha,attempt_id:requestId,turn_id:startedTurn?.id||null,error_code:String(error.message||error).slice(0,160),created_at:failed.created_at}).catch(()=>{});
    throw error;
  }finally{if(ownsClient)client.close();}
}

function option(args,name){const index=args.indexOf(name);return index>=0?args[index+1]:null;}
async function main(){
  const args=process.argv.slice(2);const requestId=args[0],threadId=args[1],envelopeSha256=args[2],envelopeBase64Url=args[3];
  if(!requestId||!threadId||!envelopeSha256||!envelopeBase64Url)throw new Error('usage: <request-id> <fixed-thread-id> <sha256> <base64url-envelope>');
  const explicitTimeout=option(args,'--timeout-ms');const result=await runAppTurn({requestId,threadId,envelopeSha256,envelopeBase64Url,receiptPath:option(args,'--receipt')||undefined,...(explicitTimeout?{timeoutMs:Number(explicitTimeout)}:{})});
  const receipt=result.receipt;
  const replayFailed=result.status==='replayed_failed';
  process.stdout.write(JSON.stringify({ok:!replayFailed,status:result.status,receipt_status:receipt.status||null,request_id:requestId,thread_id:threadId,receipt_path:result.receipt_path,receipt_sha256:receipt.receipt_sha256||sha256(jsonBytes(receipt)),receipt_bytes:receipt.receipt_bytes||Buffer.byteLength(JSON.stringify(receipt,null,2)+'\n','utf8'),turn_start:receipt.turn_start||null,completion_event:receipt.completion_event||null,thread_readback:receipt.thread_readback||null,error:replayFailed?receipt.error||null:null,failure_readback:replayFailed?receipt.failure_readback||null:null})+'\n');
  if(replayFailed)process.exitCode=2;
}
if(require.main===module)main().catch(error=>{process.stderr.write(JSON.stringify({ok:false,error:String(error.message||error),notification_summary:error.notification_summary||null})+'\n');process.exitCode=1;});

module.exports={INTERRUPT_GRACE_MS,LIFECYCLE_POLL_MS,MARKER_PROBE_TIMEOUT_MS,MAX_ENVELOPE_BYTES,READ_ONLY_AUDIT_TIMEOUT_MS,RECEIPT_SCHEMA,REQUEST_SCHEMA,appendAttemptEvent,compactionRecoveryProbe,decodeBase64Url,ensureEmployeeModelRuntime,ensureKrillEnv,exactTurnReadback,markerProbe,monitorExactTurnLifecycle,normalizeTurnStatus,notificationSummary,parseEnvelope,runAppTurn,sha256};
