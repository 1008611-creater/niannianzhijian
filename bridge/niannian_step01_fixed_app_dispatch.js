'use strict';

const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {reconcileStep01Return} = require('./niannian_redraw_step01_return_reducer');
const {readVerifiedDirectRelease} = require('./niannian_step01_direct_readback_release');
const phaseTransport = require('./niannian_redraw_step01_mac_app_phase_transport');
const artifactBroker = require('./niannian_step01_artifact_broker');
const brokerTransport = require('./niannian_redraw_step01_artifact_broker_transport');
const {appendEvidenceEvent} = require('./niannian_step01_evidence_events');

const PROJECT_ID = 'NN-20260715083045-8120F5';
const EMPLOYEE_01 = '019f6201-c013-7cf3-b155-61d2789085f4';
const CALLER = 'C:\\Users\\lsb\\.local\\bin\\Invoke-AiBrainMacRelay.ps1';

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function jsonBytes(value) { return Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8'); }
async function readJson(filePath) { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
async function atomicJson(filePath, value) { const bytes=jsonBytes(value), temporary=filePath+'.tmp-'+process.pid+'-'+crypto.randomBytes(4).toString('hex'); await fsp.mkdir(path.dirname(filePath),{recursive:true}); await fsp.writeFile(temporary,bytes,{flag:'wx'}); await fsp.rename(temporary,filePath); return {sha256:sha256(bytes),bytes:bytes.length}; }
function inside(parent, candidate) { const relative=path.relative(path.resolve(parent),path.resolve(candidate)); return Boolean(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative); }
function exactSha(value, code) { const text=String(value||'').toLowerCase(); if(!/^[a-f0-9]{64}$/.test(text)) throw new Error(code); return text; }
function exactPhase(value) { const text=String(value||''); if(!/^step01phase-[a-f0-9]{64}$/.test(text)) throw new Error('step01_fixed_dispatch_phase_key_invalid'); return text; }
function parseRelay(stdout) { for(const line of String(stdout||'').split(/\r?\n/).reverse()){try{const parsed=JSON.parse(line);if(parsed?.ok===true)return parsed;}catch{}} throw new Error('step01_fixed_dispatch_relay_response_invalid'); }
async function writeTransientEnvelope(envelope) {
  const bytes=Buffer.from(JSON.stringify(envelope), 'utf8');
  if(bytes.length<1||bytes.length>512*1024)throw artifactBroker.codeError('ARTIFACT_BROKER_SESSION_MISSING');
  const filePath=path.join(os.tmpdir(),'niannian-step01-broker-'+process.pid+'-'+crypto.randomBytes(12).toString('hex')+'.json');
  await fsp.writeFile(filePath,bytes,{flag:'wx',mode:0o600});
  return filePath;
}
async function invokeGateway(request, spawnProcess=childProcess.spawn) {
  if(!request.brokerEnvelope)throw artifactBroker.codeError('ARTIFACT_BROKER_SESSION_MISSING');
  const envelopePath=await writeTransientEnvelope(request.brokerEnvelope);
  const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',request.caller||CALLER,'-Action','Step01PhaseExecute','-RequestId',request.requestId,'-JobId',request.jobId,'-PhaseKey',request.phaseKey,'-ManifestSha256',request.manifestSha256,'-ArtifactBrokerEnvelopeFile',envelopePath];
  return new Promise((resolve,reject) => {
    let child;
    try { child=spawnProcess('powershell.exe',args,{windowsHide:true,shell:false}); }
    catch(error) { reject(new Error('step01_fixed_dispatch_gateway_failed:'+String(error?.message||error))); return; }
    let stdout='',stderr='',settled=false;
    const timeoutMs=Math.max(10 * 1000,Math.min(30 * 60 * 1000,Number(request.timeoutMs||15 * 60 * 1000)));
    const finish=(error,value) => { if(settled)return;settled=true;clearTimeout(timer);fsp.rm(envelopePath,{force:true}).catch(()=>{});error?reject(error):resolve(value); };
    child.stdout?.setEncoding?.('utf8');child.stderr?.setEncoding?.('utf8');
    child.stdout?.on('data',chunk => { stdout+=String(chunk); if(Buffer.byteLength(stdout,'utf8')>1024*1024) finish(new Error('step01_fixed_dispatch_gateway_stdout_too_large')); });
    child.stderr?.on('data',chunk => { stderr+=String(chunk); if(Buffer.byteLength(stderr,'utf8')>1024*1024) finish(new Error('step01_fixed_dispatch_gateway_stderr_too_large')); });
    const timer=setTimeout(()=>{try{child.kill();}catch{}const error=new Error('MAC_CONTROL_GATEWAY_UNREACHABLE');error.code='MAC_CONTROL_GATEWAY_UNREACHABLE';finish(error);},timeoutMs);
    child.once('error',error => { const failure=new Error('MAC_CONTROL_GATEWAY_UNREACHABLE');failure.code='MAC_CONTROL_GATEWAY_UNREACHABLE';failure.cause=error;finish(failure); });
    child.once('close',code => { if(code!==0) { const failure=new Error('MAC_CONTROL_GATEWAY_UNREACHABLE');failure.code='MAC_CONTROL_GATEWAY_UNREACHABLE';failure.stderr=stderr;failure.exitCode=code;return finish(failure); } try { finish(null,parseRelay(stdout)); } catch(error) { error.code=error.code||'MAC_CONTROL_GATEWAY_UNREACHABLE';finish(error); } });
  });
}

async function buildBrokerSession(current, requestId, options = {}) {
  const config=options.brokerConfig||artifactBroker.configuredCosBroker(options.env||process.env);
  if(config.ready!==true)throw artifactBroker.codeError('ARTIFACT_BROKER_NOT_CONFIGURED');
  const sessionStore=options.artifactSessionStore;
  const endpoint=String(options.brokerSessionEndpoint||process.env.NIANNIAN_STEP01_ARTIFACT_BROKER_SESSION_ENDPOINT||'').trim();
  if(!sessionStore||typeof sessionStore.create!=='function'||!/^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[^?#]*)?$/.test(endpoint))throw artifactBroker.codeError('ARTIFACT_BROKER_SESSION_NOT_CONFIGURED');
  const binding={project_id:PROJECT_ID,analysis_run_id:current.run.analysis_run_id,phase_key:current.phaseKey,package_manifest_sha256:current.manifestSha256};
  const cos=options.cosBroker||artifactBroker.createCosBroker(config,options.fetchImpl);
  const published=await brokerTransport.publishPackageToBroker({broker:cos,binding,package_root:path.join(current.directJobRoot,'step01_app_phase_exports',current.phaseKey),issue_package_grant:async input=>artifactBroker.presignCosObject(config,{operation:'PUT',...input})});
  const manifestPath=path.join(current.directJobRoot,'step01_app_phase_exports',current.phaseKey,'step01_phase_manifest.json');
  const manifestEvidence=await phaseTransport.fileEvidence(manifestPath);
  const rows=[{relative_path:'step01_phase_manifest.json',sha256:manifestEvidence.sha256,bytes:manifestEvidence.bytes,kind:'phase-manifest'},...current.manifest.manifest.files.map(file=>({...file,kind:'artifact'}))];
  const grants=rows.map(row=>({relative_path:row.relative_path,role:brokerTransport.artifactRoleForRelative(row.relative_path,row.kind),...artifactBroker.presignCosObject(config,{operation:'GET',object_key:brokerTransport.packageKeyForRelative(binding,row.relative_path,row.sha256,row.kind),sha256:row.sha256,bytes:row.bytes,binding})}));
  const created=sessionStore.create({binding,request_id:requestId,package_grants:grants});
  const envelope={schema_version:'niannian_step01_mac_broker_envelope_v1',project_id:binding.project_id,analysis_run_id:binding.analysis_run_id,phase_key:binding.phase_key,manifest_sha256:binding.package_manifest_sha256,package_grants:grants,return_session:{endpoint,session_id:created.session.session_id,token:created.token}};
  return {binding,published,session:created.session,envelope};
}
async function loadCurrent(options={}) {
  const canonicalJobRoot=path.resolve(String(options.canonicalJobRoot||''));
  const directJobRoot=path.resolve(String(options.directJobRoot||''));
  const [run,result,task,directTask,release]=await Promise.all([readJson(path.join(canonicalJobRoot,'current_run.json')),readJson(path.join(canonicalJobRoot,'step01_orchestrator_result.json')),readJson(path.join(canonicalJobRoot,'task.json')),readJson(path.join(directJobRoot,'task.json')),readVerifiedDirectRelease({directJobRoot})]);
  const canonicalProjectId=task.remote_job_id||task.job_id;
  const directProjectId=directTask.remote_job_id||directTask.job_id;
  if(run.project_id!==PROJECT_ID||canonicalProjectId!==PROJECT_ID||directProjectId!==PROJECT_ID||task.analysis_run?.id!==run.analysis_run_id||directTask.analysis_run?.id!==run.analysis_run_id||result.status!=='fixed_app_dispatch_prepared'||result.employee_thread_id!==EMPLOYEE_01||result.blocker!=='STEP01_FIXED_APP_PHASE_EXECUTOR_READY_FOR_DISPATCH')throw new Error('step01_fixed_dispatch_current_state_invalid');
  const phaseKey=exactPhase(result.phase_key), manifestSha256=exactSha(result.dispatch_manifest_sha256,'step01_fixed_dispatch_manifest_sha_invalid');
  const packageRoot=path.resolve(directJobRoot,'step01_app_phase_exports',phaseKey);
  if(!inside(path.resolve(directJobRoot,'step01_app_phase_exports'),packageRoot))throw new Error('step01_fixed_dispatch_package_root_invalid');
  const manifest=await phaseTransport.verifyManifest(packageRoot,'step01_phase_manifest.json',phaseTransport.EXPORT_MANIFEST_SCHEMA,manifestSha256);
  const dispatch=await readJson(path.join(packageRoot,'step01_employee_dispatch.json'));
  if(manifest.phase.key_id!==phaseKey||dispatch.local_job_id!==directTask.job_id||dispatch.remote_project_id!==PROJECT_ID||dispatch.analysis_run_id!==run.analysis_run_id||dispatch.source_sha256!==run.source_sha256||Number(dispatch.source_bytes)!==Number(run.source_bytes)||dispatch.authorization_event_id!==run.authorization_event_id||Number(dispatch.settings_version)!==Number(run.settings_version)||dispatch.employee?.thread_id!==EMPLOYEE_01||release.release.hq_readback?.sha256!==run.hq_readback?.sha256)throw new Error('step01_fixed_dispatch_binding_invalid');
  return {canonicalJobRoot,directJobRoot,run,result,phaseKey,manifestSha256,manifest,dispatch};
}
function dispatchStartResult(current, requestId, startedAt = new Date().toISOString(), brokerState = null) {
  return {schema_version:'niannian_step01_fixed_app_orchestrator_v2',remote_project_id:PROJECT_ID,local_job_id:current.dispatch.local_job_id,status:'fixed_app_dispatch_started',production_status:'step01_fixed_app_dispatch_started',phase_key:current.phaseKey,dispatch_manifest_sha256:current.manifestSha256,employee_thread_id:EMPLOYEE_01,request_id:requestId,artifact_transport:{mode:'cos',broker:brokerState||null,legacy_scp_fallback_allowed:false},cli_fallback_allowed:false,relay_fallback_allowed:false,employee_model_channel:{requested:true,used:false},provider_submission_requested:false,media_provider_network_requested:false,package_send_requested:false,spend_requested:false,started_at:startedAt};
}

async function prepareDispatch(options={}) {
  const current=await (options.loadCurrent||loadCurrent)(options);
  const brokerState=options.brokerState||artifactBroker.brokerReadiness(options.env||process.env);
  if(options.requireArtifactBroker===true&&brokerState.ready!==true){const error=artifactBroker.codeError('ARTIFACT_BROKER_NOT_CONFIGURED');error.brokerState=brokerState;throw error;}
  const requestId=String(options.requestId||('step01-phase-dispatch-'+sha256([current.run.analysis_run_id,current.phaseKey,current.manifestSha256].join('|')).slice(0,32)));
  if(!/^[A-Za-z0-9._-]{8,96}$/.test(requestId))throw new Error('step01_fixed_dispatch_request_id_invalid');
  const brokerSession=options.requireArtifactBroker===true
    ? await (options.buildBrokerSession||buildBrokerSession)(current,requestId,options)
    : null;
  const start={...dispatchStartResult(current,requestId,options.startedAt,brokerState),artifact_transport:{...dispatchStartResult(current,requestId,options.startedAt,brokerState).artifact_transport,package_published:brokerSession?{package_manifest_sha256:current.manifestSha256,object_count:brokerSession.published.objects.length,objects:brokerSession.published.objects}:null}};
  await (options.writeResult||atomicJson)(path.join(current.canonicalJobRoot,'step01_orchestrator_result.json'),start);
  if(brokerSession)await appendEvidenceEvent(path.join(current.canonicalJobRoot,'evidence_events.jsonl'),{type:'package_published',project_id:PROJECT_ID,analysis_run_id:current.run.analysis_run_id,source_revision:Number(current.run.source_revision),source_sha256:current.run.source_sha256,dispatch_id:current.manifest.phase.dispatch_id,phase_key:current.phaseKey,status:'package_published',evidence_sha256:current.manifestSha256});
  return {current,requestId,start,brokerState,brokerSession};
}

function classifiedDispatchFailure(error){
  const raw=String(error?.code||error?.message||'STEP01_FIXED_APP_DISPATCH_FAILED');
  if(/^ARTIFACT_/.test(raw))return raw;
  if(raw.includes('mac_worker_relay_process_failed:ssh')||raw.includes('step01_fixed_executor'))return 'ARTIFACT_PACKAGE_DOWNLOAD_FAILED';
  if(raw.includes('MAC_CODEX_APP_TURN_FAILED'))return 'MAC_CODEX_APP_TURN_FAILED';
  if(raw.includes('remote_receipt')||raw.includes('return_root'))return 'ARTIFACT_RETURN_EVIDENCE_INVALID';
  if(raw.includes('return_manifest'))return 'ARTIFACT_RETURN_MANIFEST_INVALID';
  if(raw.includes('return')||raw.includes('reconcile'))return 'ARTIFACT_RETURN_EVIDENCE_INVALID';
  return 'MAC_CONTROL_GATEWAY_UNREACHABLE';
}

async function importBrokerReturn(current, prepared, remote, options = {}) {
  const transport=remote?.artifact_transport;
  if(!transport||transport.mode!=='cos')throw artifactBroker.codeError('ARTIFACT_RETURN_MANIFEST_INVALID');
  const config=options.brokerConfig||artifactBroker.configuredCosBroker(options.env||process.env);
  if(config.ready!==true)throw artifactBroker.codeError('ARTIFACT_BROKER_NOT_CONFIGURED');
  const returnManifestSha=exactSha(remote.return_manifest_sha256,'ARTIFACT_RETURN_MANIFEST_INVALID');
  const returnManifestBytes=Number(transport.return_manifest_bytes);
  if(!Number.isSafeInteger(returnManifestBytes)||returnManifestBytes<1)throw artifactBroker.codeError('ARTIFACT_RETURN_MANIFEST_INVALID');
  const binding={project_id:PROJECT_ID,analysis_run_id:current.run.analysis_run_id,phase_key:current.phaseKey,package_manifest_sha256:current.manifestSha256,request_id:prepared.requestId};
  const manifestKey=brokerTransport.returnKeyForRelative(binding,'step01_return_transport_manifest.json',returnManifestSha,'return-manifest');
  const manifestGrant=artifactBroker.presignCosObject(config,{operation:'GET',object_key:manifestKey,sha256:returnManifestSha,bytes:returnManifestBytes,binding});
  const client=options.brokerClient||artifactBroker.createGrantHttpClient(options.fetchImpl);
  const returnRoot=path.resolve(String(remote.windows_return_root||path.join(current.directJobRoot,'step01_app_phase_returns',current.phaseKey)));
  if(!inside(path.resolve(current.directJobRoot,'step01_app_phase_returns'),returnRoot))throw artifactBroker.codeError('ARTIFACT_RETURN_EVIDENCE_INVALID');
  const staging=returnRoot+'.broker-'+process.pid+'-'+crypto.randomBytes(4).toString('hex');
  return brokerTransport.importReturnFromBroker({broker:client,binding,expected_phase:current.manifest.phase,manifest_grant:manifestGrant,issue_get_grant:async input=>artifactBroker.presignCosObject(config,{operation:'GET',...input}),staging_root:staging,windows_return_root:returnRoot,import_return:options.importReturn});
}

async function writeBlockedResult(prepared, error, options={}) {
  const current=prepared.current;
  const result={...dispatchStartResult(current,prepared.requestId,prepared.start.started_at,prepared.brokerState||null),status:'fixed_app_step01_blocked',production_status:'blocked_transport',blocker:{code:classifiedDispatchFailure(error),diagnostic:artifactBroker.sanitizeDiagnostic(error,'fixed_app_dispatch')},completed_at:new Date().toISOString()};
  await (options.writeResult||atomicJson)(path.join(current.canonicalJobRoot,'step01_orchestrator_result.json'),result);
  return result;
}

async function executePrepared(prepared, options={}) {
  const current=prepared?.current;
  if(!current||!prepared?.requestId)throw new Error('step01_fixed_dispatch_prepared_state_invalid');
  try {
    const remote=await (options.invokeGateway||invokeGateway)({requestId:prepared.requestId,jobId:current.dispatch.local_job_id,phaseKey:current.phaseKey,manifestSha256:current.manifestSha256,brokerEnvelope:prepared.brokerSession?.envelope,caller:options.caller,timeoutMs:options.timeoutMs},options.spawnProcess);
    if(remote.job_id!==current.dispatch.local_job_id||remote.phase_key!==current.phaseKey||remote.manifest_sha256!==current.manifestSha256||remote.employee_thread_id!==EMPLOYEE_01||remote.completion_event?.method!=='turn/completed'||remote.completion_event?.status!=='completed'||remote.completion_event?.error!==null||!remote.return_manifest_sha256||remote.media_provider_network_requested!==false||remote.media_provider_submit_requested!==false||remote.spend_requested!==false||remote.real_delivery!==false)throw new Error('step01_fixed_dispatch_remote_receipt_invalid');
    const brokerImported=remote.artifact_transport?.mode==='cos'
      ? await (options.importBrokerReturn||importBrokerReturn)(current,prepared,remote,options)
      : null;
    if(remote.artifact_transport?.mode==='cos')await appendEvidenceEvent(path.join(current.canonicalJobRoot,'evidence_events.jsonl'),{type:'return_uploaded',project_id:PROJECT_ID,analysis_run_id:current.run.analysis_run_id,source_revision:Number(current.run.source_revision),source_sha256:current.run.source_sha256,dispatch_id:current.manifest.phase.dispatch_id,phase_key:current.phaseKey,status:'return_uploaded',evidence_sha256:remote.return_manifest_sha256});
    const returnRoot=path.resolve(String(brokerImported?.windows_return_root||remote.windows_return_root||path.join(current.directJobRoot,'step01_app_phase_returns',current.phaseKey)));
    if(!inside(path.resolve(current.directJobRoot,'step01_app_phase_returns'),returnRoot))throw new Error('step01_fixed_dispatch_return_root_invalid');
    const reduced=await (options.reconcile||reconcileStep01Return)({jobRoot:current.directJobRoot,canonicalJobRoot:current.canonicalJobRoot,returnRoot,expectedManifestSha256:remote.return_manifest_sha256,expectedPhase:current.manifest.phase});
    const result={schema_version:'niannian_step01_fixed_app_orchestrator_v2',remote_project_id:PROJECT_ID,local_job_id:current.dispatch.local_job_id,status:reduced.step01_verified===true?'fixed_app_step01_verified':'fixed_app_step01_blocked',production_status:reduced.step01_verified===true?'step01_evidence_ready':'blocked_contract',phase_key:current.phaseKey,dispatch_manifest_sha256:current.manifestSha256,employee_thread_id:EMPLOYEE_01,request_id:prepared.requestId,completion_event:remote.completion_event,return_manifest_sha256:remote.return_manifest_sha256,reconciliation_status:reduced.status,cli_fallback_allowed:false,relay_fallback_allowed:false,analysis_service_network_requested:true,analysis_service_network_used:remote.analysis_service_network_used===true,provider_submission_requested:false,media_provider_network_requested:false,package_send_requested:false,spend_requested:false,completed_at:new Date().toISOString()};
    await (options.writeResult||atomicJson)(path.join(current.canonicalJobRoot,'step01_orchestrator_result.json'),result);
    return {status:result.status,result,reduced};
  } catch(error) {
    await writeBlockedResult(prepared,error,options).catch(()=>{});
    throw error;
  }
}

async function dispatch(options={}) { return executePrepared(await prepareDispatch(options),options); }
module.exports={PROJECT_ID,EMPLOYEE_01,buildBrokerSession,classifiedDispatchFailure,dispatch,dispatchStartResult,executePrepared,importBrokerReturn,invokeGateway,loadCurrent,parseRelay,prepareDispatch,writeBlockedResult};
