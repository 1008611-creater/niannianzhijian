'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const step02 = require('./niannian_redraw_step02_vertical');
const transport = require('./niannian_redraw_step02_mac_app_phase_transport');
const {THREADS} = require('./mac_codex_app_employee_bootstrap');

const MAC_ALIAS = 'niannian-mac';
const MAC_INBOX = '/Users/lsb/.local/share/niannian-ai/step02-phase-inbox';
const MAC_WORKER = '/Users/lsb/AI-Brain/niannian-ai-canonical-local/bridge/niannian_redraw_step02_mac_app_phase_worker_launcher.js';
const MAC_NODE = '/Users/lsb/.local/bin/node';

async function readJson(filePath) { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temp = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
  await fsp.rename(temp, filePath);
}
function safeRemotePath(value) {
  const normalized = String(value || '');
  if (!/^\/Users\/lsb\/[A-Za-z0-9._\/-]+$/.test(normalized) || normalized.includes('..')) throw step02.codeError('STEP02_CARRIER_REMOTE_PATH_INVALID');
  return normalized;
}
async function terminateProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') { await new Promise(resolve=>{try{const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.once('error',()=>resolve());killer.once('close',()=>resolve());}catch{resolve();}});try{child.kill();}catch{} }
  else { try { process.kill(-child.pid, 'SIGTERM'); } catch {} try { child.kill('SIGTERM'); } catch {} await new Promise(resolve=>setTimeout(resolve,25)); }
}
function runProcess(command,args,timeoutMs = 30*60*1000,signal = null) {
  return new Promise((resolve,reject) => {
    const env={};for(const name of ['SystemRoot','WINDIR','PATH','PATHEXT','COMSPEC','TEMP','TMP','HOME','USERPROFILE','LANG','LC_ALL'])if(process.env[name]!==undefined)env[name]=process.env[name];
    const child = spawn(command,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],detached:process.platform !== 'win32',env});
    let stdout = '', stderr = '', done = false;
    let terminationError=null;const terminate=async error=>{if(done||terminationError)return;terminationError=error;await terminateProcessTree(child);finish(error);};
    const onAbort=()=>{terminate(step02.codeError('STEP02_CARRIER_CLIENT_DISCONNECTED'));};
    const finish = (error,result) => { if (done) return; done = true; clearTimeout(timer);if(signal)signal.removeEventListener('abort',onAbort); error ? reject(error) : resolve(result); };
    const timer = setTimeout(() => { terminate(step02.codeError('STEP02_CARRIER_TIMEOUT')); }, timeoutMs);
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString('utf8')).slice(-1024*1024); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-1024*1024); });
    child.on('error', () => finish(step02.codeError('STEP02_CARRIER_PROCESS_START_FAILED')));
    child.on('close', code => {if(terminationError)return;code === 0 ? finish(null,{stdout,stderr}) : finish(step02.codeError('STEP02_CARRIER_PROCESS_FAILED', 'STEP02_CARRIER_PROCESS_FAILED:' + command + ':' + code + ':' + stderr.slice(-1200)));});
    if(signal){if(signal.aborted)return onAbort();signal.addEventListener('abort',onAbort,{once:true});}
  });
}
function parseResult(stdout) {
  for (const line of String(stdout || '').split(/\r?\n/).reverse()) { try { const value = JSON.parse(line); if (value?.ok === true) return value; } catch {} }
  throw step02.codeError('STEP02_CARRIER_REMOTE_RESULT_MISSING');
}
async function defaultRemoteExecute({packageRoot,manifestSha256,dispatch,run = runProcess,signal = null}) {
  const execute=(command,args)=>run===runProcess?run(command,args,30*60*1000,signal):run(command,args);
  const remotePackage = safeRemotePath(MAC_INBOX + '/' + dispatch.phase_key + '/package');
  const probe=await execute('ssh',[MAC_ALIAS,'sh','-c','if [ -f "$1/step02_phase_manifest.json" ]; then printf EXISTING; else mkdir -p "$(dirname "$1")"; printf MISSING; fi','step02-carrier',remotePackage]);
  if(String(probe.stdout||'').trim()!=='EXISTING')await execute('scp',['-r',packageRoot,MAC_ALIAS + ':' + remotePackage]);
  const executed = parseResult((await execute('ssh',[MAC_ALIAS,MAC_NODE,MAC_WORKER,'--package',remotePackage,'--manifest-sha',manifestSha256])).stdout);
  if (executed.phase_key !== dispatch.phase_key || executed.dispatch_id !== dispatch.dispatch_id || executed.employee_thread_id !== dispatch.employee.thread_id || executed.test_only !== false || executed.fixture_evidence !== false) throw step02.codeError('STEP02_CARRIER_REMOTE_RESULT_INVALID');
  return {returnRoot:safeRemotePath(executed.workspace),manifestSha256:executed.return_manifest_sha256,remote:true,run:execute};
}
async function pullRemoteReturn({remote,localRoot,run = runProcess}) {
  await fsp.mkdir(localRoot, {recursive:true});
  for (const name of [...transport.RETURN_FILES,'step02_return_manifest.json']) await run('scp',[MAC_ALIAS + ':' + safeRemotePath(remote + '/' + name),path.join(localRoot,name)]);
  return localRoot;
}
function validateDispatch(dispatch, authority) {
  const employee = THREADS.find(item => item.thread_id === dispatch.employee?.thread_id && item.employee === dispatch.employee?.employee && item.title === dispatch.employee?.title);
  if (!employee || dispatch.schema_version !== step02.SCHEMAS.dispatch || dispatch.status !== 'prepared' || dispatch.test_only !== false || dispatch.execution_mode !== 'fixed_existing_mac_app_candidate_only' || dispatch.project_id !== authority.project_id || dispatch.owner_id !== authority.owner_id || dispatch.source_sha256 !== authority.source.sha256 || dispatch.rights_authority_sha256 !== authority.rights_authority.sha256 || dispatch.step01_manifest_sha256 !== authority.step01.manifest.sha256 || !dispatch.owner_action_event_id) throw step02.codeError('STEP02_CARRIER_DISPATCH_INVALID');
  step02.assertFalseEffects(dispatch);
  return employee;
}
async function createTrustedReceipt({importRoot,dispatch,testMode}) {
  const evidenceByName = Object.fromEntries(await Promise.all([...transport.RETURN_FILES,'step02_return_manifest.json'].map(async name => [name,await transport.fileEvidence(path.join(importRoot,name))])));
  const candidate = evidenceByName['step02_source_truth_candidate.json'], receipt = evidenceByName['step02_employee_receipt.json'], control = evidenceByName['step02_control_receipt.json'], audit = evidenceByName['step02_app_server_audit.json'], response = evidenceByName['step02_app_server_response.json'], manifest = evidenceByName['step02_return_manifest.json'];
  const [receiptJson,controlJson,auditJson,responseJson,manifestJson] = await Promise.all(['step02_employee_receipt.json','step02_control_receipt.json','step02_app_server_audit.json','step02_app_server_response.json','step02_return_manifest.json'].map(name => readJson(path.join(importRoot,name))));
  const responseBytes = Buffer.from(String(responseJson.text || ''),'utf8');
  const runtime=auditJson.runtime_governance;
  const manifestPointers=new Map((manifestJson.files||[]).map(item=>[item.relative_path,item]));
  for(const value of [receiptJson,controlJson])if(value.transaction_id!==dispatch.transaction_id||value.dispatch_id!==dispatch.dispatch_id||value.phase_key!==dispatch.phase_key||value.project_id!==dispatch.project_id||value.job_id!==dispatch.job_id||value.source_sha256!==dispatch.source_sha256||value.rights_authority_sha256!==dispatch.rights_authority_sha256||value.step01_manifest_sha256!==dispatch.step01_manifest_sha256||value.upstream_authority_sha256!==dispatch.upstream_authority_sha256||Number(value.settings_version)!==Number(dispatch.settings_version)||value.owner_action_event_id!==dispatch.owner_action_event_id||value.employee?.thread_id!==dispatch.employee.thread_id||value.completion_provenance!=='fixed_mac_app_server_readback_v1'||value.test_only!==false||value.fixture_evidence!==false)throw step02.codeError('STEP02_CARRIER_RETURN_BINDING_INVALID');
  if(manifestJson.schema_version!==step02.SCHEMAS.returnManifest||manifestJson.status!=='candidate_return_ready'||manifestJson.downstream_consumable!==false||manifestJson.test_only!==false||manifestJson.fixture_evidence!==false||manifestJson.transaction_id!==dispatch.transaction_id||manifestJson.dispatch_id!==dispatch.dispatch_id||manifestJson.phase_key!==dispatch.phase_key||manifestJson.project_id!==dispatch.project_id||manifestJson.owner_action_event_id!==dispatch.owner_action_event_id||manifestJson.employee?.thread_id!==dispatch.employee.thread_id||manifestPointers.size!==transport.RETURN_FILES.length)throw step02.codeError('STEP02_CARRIER_RETURN_MANIFEST_INVALID');
  for(const [name,actual] of Object.entries(evidenceByName)){if(name==='step02_return_manifest.json')continue;const pointer=manifestPointers.get(name);if(pointer?.sha256!==actual.sha256||pointer?.bytes!==actual.bytes)throw step02.codeError('STEP02_CARRIER_RETURN_MANIFEST_TAMPERED');}
  if (responseJson.schema_version !== 'niannian_redraw_step02_app_server_response_v1' || responseJson.sha256 !== crypto.createHash('sha256').update(responseBytes).digest('hex') || responseJson.bytes !== responseBytes.length || responseJson.thread_id!==dispatch.employee.thread_id||responseJson.turn_id!==receiptJson.completion_event?.turn_id||receiptJson.schema_version!==step02.SCHEMAS.receipt||receiptJson.status!=='candidate'||receiptJson.downstream_consumable!==false||controlJson.schema_version!==step02.SCHEMAS.control||controlJson.status!=='completed_candidate_only'||receiptJson.candidate?.sha256!==candidate.sha256||receiptJson.candidate?.bytes!==candidate.bytes||receiptJson.app_server_response?.sha256!==responseJson.sha256||receiptJson.app_server_response?.bytes!==responseJson.bytes||controlJson.app_server_sequence?.thread_read_before_start!==true||controlJson.app_server_sequence?.turn_start!==true||controlJson.app_server_sequence?.turn_completed!==true||controlJson.app_server_sequence?.thread_readback!==true||auditJson.schema_version !== step02.SCHEMAS.appAudit || auditJson.status !== 'completed_readback_verified' || auditJson.dispatch_id !== dispatch.dispatch_id || auditJson.phase_key !== dispatch.phase_key || auditJson.employee_thread_id !== dispatch.employee.thread_id || auditJson.completion_event?.turn_id !== receiptJson.completion_event?.turn_id || auditJson.thread_readback?.exact_turn_id!==receiptJson.completion_event?.turn_id || auditJson.thread_readback?.exact_turn_status!=='completed'||auditJson.thread_readback?.exact_turn_error!==null||auditJson.thread_readback?.exact_turn_assistant_message_count!==1||controlJson.completion_event?.turn_id !== receiptJson.completion_event?.turn_id || auditJson.candidate?.sha256 !== candidate.sha256 || auditJson.candidate?.bytes!==candidate.bytes||auditJson.employee_receipt?.sha256 !== receipt.sha256 || auditJson.employee_receipt?.bytes!==receipt.bytes||auditJson.control_receipt?.sha256 !== control.sha256 || auditJson.control_receipt?.bytes!==control.bytes||auditJson.assistant_response?.sha256 !== responseJson.sha256 || auditJson.assistant_response?.bytes !== responseJson.bytes || auditJson.assistant_response?.evidence_sha256 !== response.sha256 || auditJson.assistant_response?.evidence_bytes!==response.bytes||!runtime || runtime.bundle_id!=='niannian-mac-production-skills-v2' || !Array.isArray(runtime.skills) || runtime.skills.length!==2 || auditJson.employee_model_channel?.used!==true || auditJson.employee_model_channel?.network_used!==true || auditJson.employee_model_channel?.media_provider_authority_granted!==false) throw step02.codeError('STEP02_CARRIER_APP_AUDIT_INVALID');
  for(const value of [receiptJson,controlJson,auditJson,manifestJson])step02.assertFalseEffects(value);
  if(!testMode&&runtime.test_only_runtime!==false)throw step02.codeError('STEP02_CARRIER_TEST_RUNTIME_NOT_PRODUCTION');
  const value = {schema_version:step02.SCHEMAS.carrier,status:'windows_return_import_verified',test_only:Boolean(testMode),fixture_evidence:Boolean(testMode),transaction_id:dispatch.transaction_id,dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,project_id:dispatch.project_id,job_id:dispatch.job_id,owner_action_event_id:dispatch.owner_action_event_id,source_sha256:dispatch.source_sha256,rights_authority_sha256:dispatch.rights_authority_sha256,step01_manifest_sha256:dispatch.step01_manifest_sha256,upstream_authority_sha256:dispatch.upstream_authority_sha256,settings_version:dispatch.settings_version,employee_thread_id:dispatch.employee.thread_id,turn_id:receiptJson.completion_event.turn_id,app_server_request:auditJson.turn_start_request,app_server_response:{...auditJson.turn_start_response,assistant_response_sha256:responseJson.sha256,assistant_response_bytes:responseJson.bytes,response_evidence_sha256:response.sha256,response_evidence_bytes:response.bytes},thread_readback:auditJson.thread_readback,runtime_governance:runtime,employee_model_channel:auditJson.employee_model_channel,app_server_audit:{sha256:audit.sha256,bytes:audit.bytes},return_manifest:{sha256:manifest.sha256,bytes:manifest.bytes},candidate:{sha256:candidate.sha256,bytes:candidate.bytes},employee_receipt:{sha256:receipt.sha256,bytes:receipt.bytes},control_receipt:{sha256:control.sha256,bytes:control.bytes},import_atomic:true,windows_independent_hash_readback:true,...step02.falseEffects(),created_at:manifestJson.created_at};
  step02.assertFalseEffects(value);
  const receiptPath=path.join(importRoot,'step02_windows_carrier_receipt.json');if(fs.existsSync(receiptPath)){const existing=await readJson(receiptPath);if(JSON.stringify(existing)!==JSON.stringify(value))throw step02.codeError('STEP02_CARRIER_RECEIPT_REPLAY_CONFLICT');}else await atomicJson(receiptPath,value);
  return {value,evidence:await transport.fileEvidence(receiptPath)};
}
async function validateCarrierCheckpoint(root,dispatch,receiptEvidence){const checkpoint=await readJson(path.join(root,'step02_carrier_checkpoint.json'));if(checkpoint.schema_version!=='niannian_redraw_step02_carrier_checkpoint_v1'||checkpoint.status!=='candidate_return_ready'||checkpoint.dispatch_id!==dispatch.dispatch_id||checkpoint.phase_key!==dispatch.phase_key||checkpoint.project_id!==dispatch.project_id||checkpoint.owner_action_event_id!==dispatch.owner_action_event_id||checkpoint.carrier_receipt?.sha256!==receiptEvidence.sha256||checkpoint.carrier_receipt?.bytes!==receiptEvidence.bytes)throw step02.codeError('STEP02_CARRIER_CHECKPOINT_INVALID');step02.assertFalseEffects(checkpoint);return checkpoint;}
async function recordCarrierBlocker({root,project,jobRoot,dispatch,error,testMode,preserveSuccess=false}){const blocker={schema_version:'niannian_redraw_step02_carrier_blocker_v1',status:'blocked',project_id:project.id,dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,owner_action_event_id:dispatch.owner_action_event_id,code:error.code||'STEP02_CARRIER_INFRASTRUCTURE_FAILED',class:String(error.code||'').includes('INVALID')||String(error.code||'').includes('TAMPER')?'contract':'infrastructure',retryable:!String(error.code||'').includes('TAMPER'),error_message:String(error.message||error).slice(0,1200),test_only:testMode,...step02.falseEffects(),created_at:new Date().toISOString()};await atomicJson(path.join(root,preserveSuccess?'step02_carrier_replay_blocker.json':'step02_carrier_checkpoint.json'),blocker);await step02.markCarrierBlocked({project,jobRoot,dispatchId:dispatch.dispatch_id,ownerActionEventId:dispatch.owner_action_event_id,blocker,now:blocker.created_at}).catch(()=>{});return blocker;}
async function runCarrier(options = {}) {
  const {project,jobRoot} = options;
  if (!project || !jobRoot) throw step02.codeError('STEP02_CARRIER_PROJECT_REQUIRED');
  const testMode = options.testMode === true;
  if (!testMode && String(process.env.NIANNIAN_STEP02_CARRIER_ENABLED || '').toLowerCase() !== 'on') throw step02.codeError('STEP02_CARRIER_PRODUCTION_DISABLED');
  const root = path.join(jobRoot, 'step02');
  const [dispatch,authority] = await Promise.all(['step02_employee_dispatch.json','upstream_authority_snapshot.json'].map(name => readJson(path.join(root,name))));
  validateDispatch(dispatch,authority);
  if (options.ownerId !== project.ownerId || dispatch.owner_id !== project.ownerId || options.ownerActionEventId !== dispatch.owner_action_event_id) throw step02.codeError('STEP02_CARRIER_OWNER_ACTION_REQUIRED');
  const importRoot = path.join(root, 'imported', dispatch.phase_key);
  const existing = await transport.fileEvidence(path.join(importRoot, 'step02_windows_carrier_receipt.json')).catch(() => null);
  if (existing) {
    try{await validateCarrierCheckpoint(root,dispatch,existing);const validated=await createTrustedReceipt({importRoot,dispatch,testMode});if(validated.evidence.sha256!==existing.sha256)throw step02.codeError('STEP02_CARRIER_REPLAY_CONFLICT');return {status:'replayed',receipt:validated.value,evidence:existing,review:await step02.loadReview({project,jobRoot})};}catch(error){await recordCarrierBlocker({root,project,jobRoot,dispatch,error,testMode,preserveSuccess:true});throw error;}
  }
  if(options.carrierAlreadyMarked!==true)await step02.markCarrierRunning({project,jobRoot,dispatchId:dispatch.dispatch_id,ownerActionEventId:dispatch.owner_action_event_id});
  const packageRoot = path.resolve(options.packageRoot || path.join(root,'carrier','exports',dispatch.phase_key));
  let exported;try{exported=await transport.exportWindowsPhase({step02Root:root,packageRoot});}catch(error){await recordCarrierBlocker({root,project,jobRoot,dispatch,error,testMode});throw error;}
  const execute = options.remoteExecute || defaultRemoteExecute;
  let remote;
  let returnSource = null;
  let cleanup = null;
  try {
    if(options.signal?.aborted)throw step02.codeError('STEP02_CARRIER_CLIENT_DISCONNECTED');
    remote = await execute({packageRoot,manifestSha256:exported.evidence.sha256,dispatch,testMode,signal:options.signal});
    returnSource = remote.returnRoot;
    if (remote.remote === true) {
      cleanup = await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-step02-return-'));
      returnSource = await pullRemoteReturn({remote:remote.returnRoot,localRoot:cleanup,run:remote.run || runProcess});
    }
    const returnEvidence = await transport.fileEvidence(path.join(returnSource,'step02_return_manifest.json'));
    if (returnEvidence.sha256 !== remote.manifestSha256) throw step02.codeError('STEP02_CARRIER_RETURN_MANIFEST_SHA_MISMATCH');
    const windowsReturnRoot = path.resolve(options.windowsReturnRoot || path.join(root,'returns',dispatch.phase_key));
    await transport.importMacReturnToWindows({returnRoot:returnSource,expectedManifestSha256:returnEvidence.sha256,windowsReturnRoot});
    const review = await step02.reconcileReturn({project,jobRoot,returnRoot:windowsReturnRoot});
    if(testMode&&!fs.existsSync(importRoot))await transport.importMacReturnToWindows({returnRoot:windowsReturnRoot,expectedManifestSha256:returnEvidence.sha256,windowsReturnRoot:importRoot});
    const trusted = await createTrustedReceipt({importRoot,dispatch,testMode});
    await fsp.copyFile(path.join(importRoot,'step02_windows_carrier_receipt.json'),path.join(windowsReturnRoot,'step02_windows_carrier_receipt.json'));
    await atomicJson(path.join(root,'step02_carrier_checkpoint.json'),{schema_version:'niannian_redraw_step02_carrier_checkpoint_v1',status:'candidate_return_ready',project_id:project.id,transaction_id:dispatch.transaction_id,dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,owner_action_event_id:dispatch.owner_action_event_id,employee_thread_id:dispatch.employee.thread_id,carrier_receipt:trusted.evidence,step04_ready:false,test_only:testMode,...step02.falseEffects(),created_at:trusted.value.created_at});
    return {status:'candidate_return_ready',receipt:trusted.value,evidence:trusted.evidence,review};
  } catch(error) {
    await recordCarrierBlocker({root,project,jobRoot,dispatch,error,testMode});throw error;
  } finally { if (cleanup) await fsp.rm(cleanup,{recursive:true,force:true}); }
}

module.exports = {MAC_ALIAS,MAC_INBOX,MAC_NODE,MAC_WORKER,createTrustedReceipt,defaultRemoteExecute,parseResult,pullRemoteReturn,recordCarrierBlocker,runCarrier,runProcess,safeRemotePath,terminateProcessTree,validateCarrierCheckpoint,validateDispatch};
