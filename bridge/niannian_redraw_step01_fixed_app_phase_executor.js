'use strict';

// Mac-side, fixed-contract executor for one SHA-bound Step01 phase. It is
// invoked only by the Mac forced-command gateway; Windows never supplies a
// command, a path, or an App prompt through this surface.

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const transport = require('./niannian_redraw_step01_mac_app_phase_transport');
const {executeImportedPhase} = require('./niannian_redraw_step01_mac_app_phase_worker');
const relay = require('./niannian_mac_worker_relay');
const brokerTransport = require('./niannian_redraw_step01_artifact_broker_transport');
const artifactBroker = require('./niannian_step01_artifact_broker');

const RECEIPT_SCHEMA = 'niannian_step01_fixed_app_phase_executor_receipt_v1';
const RECEIPT_ROOT = path.join(os.homedir(), '.local', 'share', 'niannian-ai', 'fixed-app-phase-executor-receipts');
const INBOX_ROOT = path.join(os.homedir(), '.local', 'share', 'niannian-ai', 'step01-phase-inbox');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function jsonBytes(value) { return Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8'); }
function assertRequestId(value) { const text = String(value || ''); if (!/^[A-Za-z0-9._-]{8,96}$/.test(text)) throw new Error('step01_fixed_executor_request_id_invalid'); return text; }
function assertJobId(value) { const text = String(value || ''); if (!/^web_nn-[a-z0-9-]{10,100}$/.test(text)) throw new Error('step01_fixed_executor_job_id_invalid'); return text; }
function assertPhaseKey(value) { const text = String(value || ''); if (!/^step01phase-[a-f0-9]{64}$/.test(text)) throw new Error('step01_fixed_executor_phase_key_invalid'); return text; }
function assertSha(value) { const text = String(value || '').toLowerCase(); if (!/^[a-f0-9]{64}$/.test(text)) throw new Error('step01_fixed_executor_sha_invalid'); return text; }
function codeError(code) { const error=new Error(code); error.code=code; return error; }
function falseEffects(value) {
  for (const key of ['media_provider_network_requested', 'media_provider_submit_requested', 'media_provider_upload_requested', 'spend_requested', 'package_send_requested', 'registry_promotion_requested', 'deployment_requested', 'local_image_editing_requested', 'shell_command_requested']) {
    if (value?.[key] !== false) throw new Error('step01_fixed_executor_side_effect_invalid:' + key);
  }
}
function inside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return Boolean(relative) && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true, mode:0o700});
  const bytes = jsonBytes(value);
  const temporary = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(temporary, bytes, {flag:'wx', mode:0o600});
  await fsp.rename(temporary, filePath);
  await fsp.chmod(filePath, 0o600).catch(() => {});
  return {sha256:sha256(bytes), bytes:bytes.length};
}
async function readJsonIfExists(filePath) {
  try { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function remotePhaseRoot(config, jobId, phaseKey) {
  return config.remoteRelayRoot + '/step01-phases/' + jobId + '/' + phaseKey;
}
function remoteReturnRoot(config, jobId, phaseKey) {
  return config.remoteRelayRoot + '/step01-phase-returns/' + jobId + '/' + phaseKey;
}
async function copyPackageFromWindows(options) {
  const {config, jobId, phaseKey, manifestSha256} = options;
  const inboxRoot = path.resolve(options.inboxRoot || INBOX_ROOT);
  const packageRoot = path.join(inboxRoot, phaseKey);
  if (!inside(inboxRoot, packageRoot)) throw new Error('step01_fixed_executor_inbox_path_invalid');
  const existing = await fsp.lstat(packageRoot).catch(() => null);
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) throw new Error('step01_fixed_executor_inbox_existing_invalid');
    const verified = await transport.verifyManifest(packageRoot, 'step01_phase_manifest.json', transport.EXPORT_MANIFEST_SCHEMA, manifestSha256);
    if (verified.phase.key_id !== phaseKey || verified.phase.job_id !== jobId) throw new Error('step01_fixed_executor_inbox_existing_binding_invalid');
    return {status:'replayed', packageRoot, verified};
  }
  const claimed = await relay.callRemoteGateway(config, 'claim-step01-phase', [jobId, phaseKey, manifestSha256]);
  if (claimed.job_id !== jobId || claimed.phase_key !== phaseKey || claimed.manifest_sha256 !== manifestSha256) throw new Error('step01_fixed_executor_remote_export_binding_invalid');
  await fsp.mkdir(inboxRoot, {recursive:true, mode:0o700});
  const stagingParent = path.join(inboxRoot, '.' + phaseKey + '.incoming-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
  await fsp.mkdir(stagingParent, {recursive:false, mode:0o700});
  const remoteRoot = remotePhaseRoot(config, jobId, phaseKey);
  try {
    await relay.runProcess('scp', relay.sshOptions(config).concat(['-r', relay.remoteTarget(config) + ':' + remoteRoot + '/.', stagingParent]));
    const verified = await transport.verifyManifest(stagingParent, 'step01_phase_manifest.json', transport.EXPORT_MANIFEST_SCHEMA, manifestSha256);
    if (verified.phase.key_id !== phaseKey || verified.phase.job_id !== jobId) throw new Error('step01_fixed_executor_remote_package_binding_invalid');
    await fsp.rename(stagingParent, packageRoot);
    return {status:'pulled', packageRoot, verified};
  } catch (error) {
    await fsp.rm(stagingParent, {recursive:true, force:true});
    throw error;
  }
}

function artifactTransportMode(options = {}) {
  const mode=String(options.artifactTransportMode||process.env.NIANNIAN_STEP01_ARTIFACT_TRANSPORT||'cos').trim().toLowerCase();
  if(!['cos','legacy_ssh'].includes(mode))throw codeError('ARTIFACT_BROKER_NOT_CONFIGURED');
  if(mode==='legacy_ssh'&&options.allowLegacySshTransport!==true)throw codeError('ARTIFACT_BROKER_NOT_CONFIGURED');
  return mode;
}

async function copyPackageFromBroker(options) {
  const session=options.brokerSession;
  if(!session||!session.broker||!session.binding||!session.manifest_grant||!Array.isArray(session.file_grants))throw codeError('ARTIFACT_BROKER_NOT_CONFIGURED');
  if(session.binding.phase_key!==options.phaseKey||session.binding.package_manifest_sha256!==options.manifestSha256)throw codeError('ARTIFACT_PACKAGE_GRANT_FAILED');
  const pulled=await brokerTransport.pullPackageToInbox({broker:session.broker,binding:session.binding,manifest_grant:session.manifest_grant,file_grants:session.file_grants,inbox_root:options.inboxRoot});
  if(pulled.verified.phase.key_id!==options.phaseKey||pulled.verified.phase.local_job_id!==options.jobId)throw codeError('ARTIFACT_PACKAGE_SHA_MISMATCH');
  return {status:pulled.status,packageRoot:pulled.package_root,verified:pulled.verified};
}

async function createBrokerSessionFromGateway(options) {
  const config=options.config||relay.relayConfig(options.relayConfig||{});
  const response=await relay.callRemoteGateway(config,'step01-artifact-package-grants',[options.jobId,options.phaseKey,options.manifestSha256]);
  const binding=response?.binding;
  if(response?.transport!=='cos'||!binding||binding.phase_key!==options.phaseKey||binding.package_manifest_sha256!==options.manifestSha256||!response.manifest_grant||!Array.isArray(response.file_grants))throw codeError('ARTIFACT_PACKAGE_GRANT_FAILED');
  const session={config,broker:artifactBroker.createGrantHttpClient(),binding,manifest_grant:response.manifest_grant,file_grants:response.file_grants};
  session.issue_return_grant=async input=>{
    const result=await relay.callRemoteGateway(config,'step01-artifact-return-grant',[options.jobId,options.phaseKey,options.manifestSha256,input.binding.request_id,input.return_manifest_sha256,String(input.return_manifest_bytes),input.relative_path,input.sha256,String(input.bytes)]);
    if(result?.transport!=='cos'||!result.grant)throw codeError('ARTIFACT_RETURN_UPLOAD_FAILED');
    return result.grant;
  };
  return session;
}
async function pushReturnToWindows(options) {
  const {config, jobId, phaseKey, workspace} = options;
  const returnEvidence = await transport.fileEvidence(path.join(workspace, 'step01_return_transport_manifest.json'));
  const verified = await transport.verifyManifest(workspace, 'step01_return_transport_manifest.json', transport.RETURN_MANIFEST_SCHEMA, returnEvidence.sha256);
  if (verified.phase.key_id !== phaseKey || verified.phase.job_id !== jobId) throw new Error('step01_fixed_executor_return_phase_binding_invalid');
  const begin = await relay.callRemoteGateway(config, 'begin-step01-phase-return', [jobId, phaseKey, returnEvidence.sha256]);
  if (begin.job_id !== jobId || begin.phase_key !== phaseKey || begin.return_manifest_sha256 !== returnEvidence.sha256) throw new Error('step01_fixed_executor_return_begin_binding_invalid');
  const remoteRoot = remoteReturnRoot(config, jobId, phaseKey);
  await relay.runProcess('scp', relay.sshOptions(config).concat([path.join(workspace, 'step01_return_transport_manifest.json'), relay.remoteTarget(config) + ':' + remoteRoot + '/step01_return_transport_manifest.json']));
  const prepared = await relay.callRemoteGateway(config, 'prepare-step01-phase-return', [jobId, phaseKey, returnEvidence.sha256]);
  if (prepared.job_id !== jobId || prepared.phase_key !== phaseKey || prepared.return_manifest_sha256 !== returnEvidence.sha256) throw new Error('step01_fixed_executor_return_prepare_binding_invalid');
  for (const file of verified.manifest.files) {
    const relative = transport.safeRelative(file.relative_path);
    await relay.runProcess('scp', relay.sshOptions(config).concat([path.join(workspace, ...relative.split('/')), relay.remoteTarget(config) + ':' + remoteRoot + '/' + relative]));
  }
  const ingested = await relay.callRemoteGateway(config, 'ingest-step01-phase-return', [jobId, phaseKey, returnEvidence.sha256]);
  if (ingested.job_id !== jobId || ingested.phase_key !== phaseKey || ingested.return_manifest_sha256 !== returnEvidence.sha256) throw new Error('step01_fixed_executor_return_ingest_binding_invalid');
  return {return_manifest_sha256:returnEvidence.sha256, return_manifest_bytes:returnEvidence.bytes, ingested};
}

async function pushReturnToBroker(options) {
  const session=options.brokerSession;
  if(!session||!session.broker||!session.binding||typeof session.submit_return_manifest!=='function')throw codeError('ARTIFACT_RETURN_UPLOAD_FAILED');
  const binding={...session.binding,request_id:options.requestId};
  if(binding.phase_key!==options.phaseKey)throw codeError('ARTIFACT_RETURN_UPLOAD_FAILED');
  const manifestPath=path.join(options.workspace,'step01_return_transport_manifest.json');
  const manifestEvidence=await transport.fileEvidence(manifestPath).catch(()=>{throw codeError('ARTIFACT_RETURN_MANIFEST_INVALID');});
  const verified=await transport.verifyManifest(options.workspace,'step01_return_transport_manifest.json',transport.RETURN_MANIFEST_SCHEMA,manifestEvidence.sha256,options.phase).catch(()=>{throw codeError('ARTIFACT_RETURN_MANIFEST_INVALID');});
  const issued=await session.submit_return_manifest(await fsp.readFile(manifestPath),manifestEvidence);
  if(!issued||!issued.return_manifest?.grant||!Array.isArray(issued.grants)||issued.return_manifest.sha256!==manifestEvidence.sha256||Number(issued.return_manifest.bytes)!==Number(manifestEvidence.bytes))throw codeError('ARTIFACT_RETURN_UPLOAD_FAILED');
  const grants=new Map([['step01_return_transport_manifest.json',issued.return_manifest.grant],...issued.grants.map(grant=>[grant.relative_path,grant])]);
  if(grants.size!==verified.manifest.files.length+1)throw codeError('ARTIFACT_RETURN_UPLOAD_FAILED');
  const uploaded=await brokerTransport.uploadReturnToBroker({broker:session.broker,binding,expected_phase:options.phase,workspace_path:options.workspace,issue_return_grant:async input=>{
    const grant=grants.get(input.relative_path);
    if(!grant)throw codeError('ARTIFACT_RETURN_UPLOAD_FAILED');
    return grant;
  }});
  return {return_manifest_sha256:uploaded.return_manifest_sha256,return_manifest_bytes:uploaded.return_manifest_bytes,uploaded};
}

function brokerEnvelope(value, expected = {}) {
  if(!value||value.schema_version!=='niannian_step01_mac_broker_envelope_v1'||value.project_id!=='NN-20260715083045-8120F5'||!/^analysis-[A-Za-z0-9-]{8,100}$/.test(String(value.analysis_run_id||''))||(expected.analysisRunId&&value.analysis_run_id!==expected.analysisRunId)||value.phase_key!==expected.phaseKey||value.manifest_sha256!==expected.manifestSha256||!Array.isArray(value.package_grants)||!value.return_session)throw codeError('ARTIFACT_BROKER_SESSION_MISSING');
  const endpoint=String(value.return_session.endpoint||'');
  if(!/^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[^?#]*)?$/.test(endpoint)||!/^broker-[a-f0-9]{32}$/.test(String(value.return_session.session_id||''))||!/^[A-Za-z0-9_-]{32,128}$/.test(String(value.return_session.token||'')))throw codeError('ARTIFACT_BROKER_SESSION_MISSING');
  const binding={project_id:value.project_id,analysis_run_id:value.analysis_run_id,phase_key:value.phase_key,package_manifest_sha256:value.manifest_sha256};
  const manifestGrant=value.package_grants.find(grant=>grant.relative_path==='step01_phase_manifest.json');
  const fileGrants=value.package_grants.filter(grant=>grant.relative_path!=='step01_phase_manifest.json');
  if(!manifestGrant||!fileGrants.length)throw codeError('ARTIFACT_PACKAGE_GRANT_FAILED');
  const broker=artifactBroker.createGrantHttpClient();
  const submit_return_manifest=async (rawManifest, evidence) => {
    const target=new URL('sessions/'+encodeURIComponent(value.return_session.session_id)+'/return-manifest',endpoint.endsWith('/')?endpoint:endpoint+'/').toString();
    let response;
    try{response=await fetch(target,{method:'POST',headers:{'Authorization':'Bearer '+value.return_session.token,'Content-Type':'application/json'},body:JSON.stringify({return_manifest_base64:Buffer.from(rawManifest).toString('base64'),sha256:evidence.sha256,bytes:evidence.bytes}),redirect:'error'});}catch{throw codeError('ARTIFACT_RETURN_UPLOAD_FAILED');}
    if(!response?.ok)throw codeError('ARTIFACT_RETURN_UPLOAD_FAILED');
    let payload;try{payload=await response.json();}catch{throw codeError('ARTIFACT_RETURN_UPLOAD_FAILED');}
    return payload;
  };
  return {broker,binding,manifest_grant:manifestGrant,file_grants:fileGrants,submit_return_manifest};
}

async function readBrokerEnvelopeFromStdin(expected) {
  const chunks=[];let total=0;
  for await(const chunk of process.stdin){total+=chunk.length;if(total>512*1024)throw codeError('ARTIFACT_BROKER_SESSION_MISSING');chunks.push(chunk);}
  let parsed;try{parsed=JSON.parse(Buffer.concat(chunks,total).toString('utf8'));}catch{throw codeError('ARTIFACT_BROKER_SESSION_MISSING');}
  return brokerEnvelope(parsed,expected);
}
async function execute(options = {}) {
  const requestId = assertRequestId(options.requestId);
  const jobId = assertJobId(options.jobId);
  const phaseKey = assertPhaseKey(options.phaseKey);
  const manifestSha256 = assertSha(options.manifestSha256);
  const receiptPath = path.resolve(options.receiptPath || path.join(RECEIPT_ROOT, requestId + '.json'));
  const existing = await readJsonIfExists(receiptPath);
  if (existing) {
    if (existing.schema_version !== RECEIPT_SCHEMA || existing.request_id !== requestId || existing.job_id !== jobId || existing.phase_key !== phaseKey || existing.manifest_sha256 !== manifestSha256) throw new Error('step01_fixed_executor_replay_conflict');
    return {status:'replayed', receipt:existing, receipt_path:receiptPath};
  }
  const mode=artifactTransportMode(options);
  const config = mode==='legacy_ssh' ? (options.config || relay.relayConfig(options.relayConfig || {})) : null;
  // COS production work receives its short-lived session from the Windows
  // dispatcher over the fixed control channel. Mac must never open a reverse
  // SSH control connection to Windows to obtain grants.
  const brokerSession=mode==='cos' ? options.brokerSession : null;
  if(mode==='cos'&&!brokerSession)throw codeError('ARTIFACT_BROKER_SESSION_MISSING');
  const pulled = mode==='cos'
    ? await copyPackageFromBroker({brokerSession,jobId,phaseKey,manifestSha256,inboxRoot:options.inboxRoot})
    : await copyPackageFromWindows({config,jobId,phaseKey,manifestSha256,inboxRoot:options.inboxRoot});
  const phase = pulled.verified.phase;
  const execution = await executeImportedPhase({packageRoot:pulled.packageRoot, expectedManifestSha256:manifestSha256, ...(options.workerOptions || {})});
  if (execution.phase_key !== phase.key_id || execution.dispatch_id !== phase.dispatch_id || execution.employee_thread_id !== '019f6201-c013-7cf3-b155-61d2789085f4') throw new Error('step01_fixed_executor_worker_result_binding_invalid');
  falseEffects(execution);
  const returned = mode==='cos'
    ? await pushReturnToBroker({brokerSession,requestId,phase:phaseKey ? pulled.verified.phase : null,jobId,phaseKey,workspace:execution.workspace})
    : await pushReturnToWindows({config,jobId,phaseKey,workspace:execution.workspace});
  const receipt = {
    schema_version:RECEIPT_SCHEMA,
    status:execution.step01_verified === true ? 'completed_returned' : 'blocked_returned',
    request_id:requestId,
    job_id:jobId,
    phase_key:phaseKey,
    manifest_sha256:manifestSha256,
    employee_thread_id:execution.employee_thread_id,
    completion_event:execution.completion_event,
    return_manifest_sha256:returned.return_manifest_sha256,
    return_manifest_bytes:returned.return_manifest_bytes,
    windows_return_root:mode==='legacy_ssh' ? (returned.ingested.windows_return_root || null) : null,
    artifact_transport:{mode,legacy_scp_fallback_allowed:false,return_manifest_sha256:returned.return_manifest_sha256,return_manifest_bytes:returned.return_manifest_bytes},
    analysis_service_network_requested:true,
    analysis_service_network_used:execution.analysis_service_network_used === true,
    step01_verified:execution.step01_verified === true,
    media_provider_network_requested:false,
    media_provider_submit_requested:false,
    media_provider_upload_requested:false,
    spend_requested:false,
    package_send_requested:false,
    registry_promotion_requested:false,
    deployment_requested:false,
    local_image_editing_requested:false,
    shell_command_requested:false,
    real_delivery:false,
    completed_at:new Date().toISOString()
  };
  const evidence = await atomicJson(receiptPath, receipt);
  return {status:receipt.status, receipt:{...receipt, receipt_sha256:evidence.sha256, receipt_bytes:evidence.bytes}, receipt_path:receiptPath};
}
function option(args, name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; }
async function main() {
  const args = process.argv.slice(2);
  const requestId=args[0],jobId=args[1],phaseKey=args[2],manifestSha256=args[3];
  const session=option(args,'--broker-envelope-stdin')==='1'?await readBrokerEnvelopeFromStdin({analysisRunId:option(args,'--analysis-run-id'),phaseKey,manifestSha256}):null;
  const result = await execute({requestId, jobId, phaseKey, manifestSha256, brokerSession:session, receiptPath:option(args, '--receipt') || undefined});
  const receipt = result.receipt;
  process.stdout.write(JSON.stringify({ok:true, status:result.status, request_id:receipt.request_id, job_id:receipt.job_id, phase_key:receipt.phase_key, manifest_sha256:receipt.manifest_sha256, employee_thread_id:receipt.employee_thread_id, completion_event:receipt.completion_event, return_manifest_sha256:receipt.return_manifest_sha256, return_manifest_bytes:receipt.return_manifest_bytes, windows_return_root:receipt.windows_return_root, artifact_transport:receipt.artifact_transport||null, step01_verified:receipt.step01_verified, analysis_service_network_requested:true, analysis_service_network_used:receipt.analysis_service_network_used, media_provider_network_requested:false, media_provider_submit_requested:false, spend_requested:false, real_delivery:false, receipt_path:result.receipt_path, receipt_sha256:receipt.receipt_sha256 || sha256(jsonBytes(receipt)), receipt_bytes:receipt.receipt_bytes || jsonBytes(receipt).length}) + '\n');
}
if (require.main === module) main().catch(error => { process.stderr.write(JSON.stringify({ok:false, error:String(error.message || error)}) + '\n'); process.exitCode = 1; });

module.exports = {RECEIPT_SCHEMA,artifactTransportMode,brokerEnvelope,copyPackageFromBroker,copyPackageFromWindows,createBrokerSessionFromGateway,execute,pushReturnToBroker,pushReturnToWindows,readBrokerEnvelopeFromStdin};
