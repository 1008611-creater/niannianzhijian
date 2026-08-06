'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');
const lowRiskPolicy = require('./niannian_low_risk_policy');
const step01Reducer = require('./niannian_step01_state_reducer');

const workspace = path.resolve(process.env.ZHUANHUI_WORKSPACE || 'D:/codex-work/zhuanhui');
const directJobsRoot = path.join(workspace, '06_AUTOMATION', 'direct_jobs');
const productionIndexPath = path.resolve(process.env.NIANNIAN_PRODUCTION_INDEX || path.join(workspace, '06_AUTOMATION', 'production_jobs.index.json'));
const bridgeRoot = path.resolve(process.env.NIANNIAN_BRIDGE_STATE_DIR || __dirname);
const statePath = path.join(bridgeRoot, 'bridge_state.json');
const eventsPath = path.join(bridgeRoot, 'bridge_events.jsonl');
const lockPath = path.join(bridgeRoot, '.controller-bridge.lock');
const secretPath = path.resolve(process.env.NIANNIAN_BRIDGE_TOKEN_FILE || 'C:/Users/lsb/.config/niannian-ai/bridge-token.txt');
const baseUrl = String(process.env.NIANNIAN_BASE_URL || 'https://ai.cauai.fun').replace(/\/$/, '');
const watchMode = process.argv.includes('--watch');
const requestedRemoteJobId = (() => {
  const index = process.argv.indexOf('--remote-job-id');
  return index >= 0 ? String(process.argv[index + 1] || '') : '';
})();
const intervalMs = Math.max(15000, Number(process.env.NIANNIAN_BRIDGE_INTERVAL_MS || 30000));
const controllerId = String(process.env.NIANNIAN_CONTROLLER_ID || ('niannian-' + os.hostname())).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
const allowedStatuses = new Set([
  'received','prepared','preflight','queued','running_step01','step01_verified','running_step02','step02_return_ready',
  'step02_blocked_upstream','step02_blocked_contract','step02_blocked_resource','step02_blocked_quality',
  'running_step04','step04_accepted','running_step05','qa_running','accepted','packaged','sent',
  'user_visible_acceptance','blocked_resource','blocked_contract','blocked_quality','infra_failed','send_failed'
]);

function now() {
  return new Date().toISOString();
}

function safeId(value) {
  const id = String(value || '').trim();
  if (!/^NN-[A-Z0-9-]{10,80}$/.test(id)) throw new Error('invalid_remote_job_id');
  return id;
}

function safeName(value) {
  return String(value || 'source.mp4').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-120);
}

async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive:true });
  const temp = filePath + '.tmp-' + process.pid;
  await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fsp.rename(temp, filePath);
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function isInside(parent, candidate) {
  const base = path.resolve(parent);
  const target = path.resolve(candidate);
  return target === base || target.startsWith(base + path.sep);
}

async function readEvidenceEvents(jobRoot) {
  const filePath = path.join(jobRoot, 'evidence_events.jsonl');
  try {
    return (await fsp.readFile(filePath, 'utf8')).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function appendJobEvidenceEvent(jobRoot, event) {
  const filePath = path.join(jobRoot, 'evidence_events.jsonl');
  const existing = await readEvidenceEvents(jobRoot) || [];
  if (event.event_id && existing.some(item => item.event_id === event.event_id)) return false;
  await fsp.appendFile(filePath, JSON.stringify({at:now(),...event}) + '\n', 'utf8');
  return true;
}

async function recordReceiptEvidence(record) {
  const receipt = await readJson(path.join(record.root, 'employee_worker_receipt.json'), null);
  if (!receipt) return;
  const receiptEventId = ['receipt',receipt.dispatch_id,receipt.production_status,receipt.written_at || receipt.updated_at || 'undated'].join(':');
  await appendJobEvidenceEvent(record.root, {
    event_id:receiptEventId,
    type:'worker_receipt_observed',
    job_id:record.localJobId,
    dispatch_id:receipt.dispatch_id || null,
    production_status:receipt.production_status || null,
    provider_submission_requested:receipt.provider_submission_requested === true,
    package_send_requested:receipt.package_send_requested === true
  });
  const ledger = await readJson(path.join(record.root, 'artifact_ledger.json'), {artifacts:[]});
  const verified = (Array.isArray(ledger.artifacts) ? ledger.artifacts : []).filter(item => ['verified','accepted','completed','delivered'].includes(item.status));
  const paths = [];
  for (const item of verified) {
    const exactPath = String(item.exact_path || '');
    if (!exactPath || !isInside(record.root, exactPath)) return;
    const stats = await fsp.lstat(exactPath).catch(() => null);
    if (!stats || !stats.isFile() || stats.isSymbolicLink()) return;
    paths.push(exactPath);
  }
  if (verified.length && paths.length === verified.length) {
    await appendJobEvidenceEvent(record.root, {
      event_id:'artifact_paths:' + String(receipt.dispatch_id || 'unknown'),
      type:'artifact_paths_verified',
      job_id:record.localJobId,
      dispatch_id:receipt.dispatch_id || null,
      artifact_count:paths.length
    });
  }
}

async function appendEvent(type, detail = {}) {
  await fsp.mkdir(bridgeRoot, { recursive:true });
  await fsp.appendFile(eventsPath, JSON.stringify({ at:now(), type, ...detail }) + '\n', 'utf8');
}

async function loadState() {
  const state = await readJson(statePath, {});
  const jobs = state.jobs && typeof state.jobs === 'object' ? state.jobs : {};
  return {
    ...state,
    schema_version:1,
    controller_id:controllerId,
    jobs,
    last_remote_job_id:state.last_remote_job_id && jobs[state.last_remote_job_id] ? state.last_remote_job_id : null
  };
}

async function saveState(state) {
  await atomicJson(statePath, { ...state, schema_version:1, controller_id:controllerId, updated_at:now() });
}

async function loadToken() {
  let token = String(process.env.NIANNIAN_BRIDGE_TOKEN || '').trim();
  if (!token) {
    try { token = String(await fsp.readFile(secretPath, 'utf8')).trim(); }
    catch (error) {
      if (error && error.code === 'ENOENT') throw new Error('bridge_token_missing_or_short');
      throw error;
    }
  }
  if (token.length < 32) throw new Error('bridge_token_missing_or_short');
  return token;
}

async function api(token, route, options = {}) {
  const headers = {
    Authorization:'Bearer ' + token,
    'X-NianNian-Controller-Id':controllerId,
    ...(options.headers || {})
  };
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(baseUrl + route, { ...options, headers });
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const error = new Error(typeof body === 'string' ? body : body.error || 'controller_api_failed');
    error.status = response.status;
    error.code = body && body.code;
    error.body = body;
    throw error;
  }
  return body;
}

async function acquireLock() {
  await fsp.mkdir(bridgeRoot, { recursive:true });
  try {
    const handle = await fsp.open(lockPath, 'wx');
    await handle.writeFile(JSON.stringify({ pid:process.pid, controller_id:controllerId, created_at:now() }) + '\n');
    return handle;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const stats = await fsp.stat(lockPath).catch(() => null);
    if (stats && Date.now() - stats.mtimeMs > Math.max(intervalMs * 3, 10 * 60 * 1000)) {
      await fsp.unlink(lockPath).catch(() => {});
      return acquireLock();
    }
    throw new Error('bridge_instance_already_running');
  }
}

async function releaseLock(handle) {
  await handle.close().catch(() => {});
  await fsp.unlink(lockPath).catch(() => {});
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  await pipeline(
    fs.createReadStream(filePath),
    new Transform({
      transform(chunk, encoding, callback) {
        bytes += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      }
    }),
    new Transform({
      transform(chunk, encoding, callback) {
        callback();
      }
    })
  );
  return { bytes, sha256:hash.digest('hex') };
}

async function downloadSource(token, job, leaseId, targetPath) {
  const response = await fetch(baseUrl + job.source.downloadUrl, {
    headers:{
      Authorization:'Bearer ' + token,
      'X-NianNian-Controller-Id':controllerId,
      'X-NianNian-Lease-Id':leaseId
    }
  });
  if (!response.ok || !response.body) throw new Error('source_download_failed_' + response.status);
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const meter = new Transform({
    transform(chunk, encoding, callback) {
      bytes += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(targetPath, { flags:'wx' }));
  return { bytes, sha256:hash.digest('hex') };
}

async function downloadRightsAuthority(token, job, leaseId) {
  const receipt=job.rightsAuthorityReceipt;
  if(!receipt||!receipt.downloadUrl||!/^[a-f0-9]{64}$/.test(String(receipt.sha256||''))||!Number.isSafeInteger(Number(receipt.bytes)))throw new Error('rights_authority_receipt_missing');
  const response=await fetch(baseUrl+receipt.downloadUrl,{headers:{Authorization:'Bearer '+token,'X-NianNian-Controller-Id':controllerId,'X-NianNian-Lease-Id':leaseId}});
  if(!response.ok)throw new Error('rights_authority_download_failed_'+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  if(sha256!==receipt.sha256||bytes.length!==Number(receipt.bytes))throw new Error('rights_authority_download_sha256_mismatch');
  let rights;try{rights=JSON.parse(bytes.toString('utf8'));}catch{throw new Error('rights_authority_download_json_invalid');}
  const projected=job.rightsAuthority;
  if(!projected||rights.schema_version!=='niannian_source_rights_authority_v1'||rights.event_id!==projected.event_id||rights.event_id!==receipt.event_id||rights.status!=='confirmed'||rights.revoked!==false)throw new Error('rights_authority_status_invalid');
  if(rights.confirmed_by_user_id!==job.authorityOwnerId||rights.source_sha256!==job.source?.sha256||Number(rights.source_bytes)!==Number(job.source?.bytes))throw new Error('rights_authority_identity_mismatch');
  if(rights.scope!=='source_video_redraw_full_chain_under_explicit_provider_and_delivery_gates'||rights.declaration!=='user_confirmed_rights_to_use_and_adapt_uploaded_source')throw new Error('rights_authority_scope_invalid');
  if(JSON.stringify(rights)!==JSON.stringify(projected))throw new Error('rights_authority_projection_mismatch');
  return {rights,bytes,sha256,byteLength:bytes.length};
}

function defaultProductionIndex() {
  return {
    schema_version:1,
    index_type:'zhuanhui_production_jobs',
    updated_at:now(),
    workspace_root:workspace,
    job_roots:{
      codex_direct:directJobsRoot,
      hermes_clawbot:path.join(workspace, '06_AUTOMATION', 'clawbot_jobs')
    },
    jobs:[]
  };
}

async function updateProductionIndex(record, statusPayload) {
  const index = await readJson(productionIndexPath, defaultProductionIndex());
  if (!Array.isArray(index.jobs)) index.jobs = [];
  const timestamp = now();
  let row = index.jobs.find(item => item.job_id === record.localJobId);
  const next = {
    job_id:record.localJobId,
    entrypoint:'codex_direct',
    source_entrypoint:'niannian_ai_web',
    remote_job_id:record.remoteJobId,
    job_dir:record.root,
    series_id:'web_redraw',
    episode_id:'WEB001',
    episodes:['WEB001'],
    batch_id:record.localJobId,
    status:statusPayload.productionStatus,
    raw_status:statusPayload.productionStatus,
    current_step:statusPayload.currentNode,
    blockers:statusPayload.blocker ? [statusPayload.blocker] : [],
    completed:record.completed || ['website project received','source video sha256 verified','job contract mirrored','mx-shortdrama-00-router selected'],
    next_action:statusPayload.nextAction,
    worker:statusPayload.worker || null,
    deliverables_count:statusPayload.artifactCount,
    deliverables:[],
    delivery_state:{packaged:false,transport_success:false,user_visible_acceptance:false},
    updated_at:timestamp
  };
  if (row) Object.assign(row, next);
  else index.jobs.unshift(next);
  index.updated_at = timestamp;
  await atomicJson(productionIndexPath, index);
}

function gateDashboard(job, localJobId, sourcePath, sourceSha, rightsEvidence) {
  return {
    schema_version:'niannian_controller_intake_v1',
    job_id:localJobId,
    remote_job_id:job.id,
    production_scope:'fullchain_from_source_video',
    current_node:'router',
    earliest_incomplete_node:'Step01',
    next_skill:'mx-shortdrama-01-frame-extract',
    source_video:{ exact_path:sourcePath, sha256:sourceSha, status:'verified' },
    rights_authority:{event_id:rightsEvidence.rights.event_id,sha256:rightsEvidence.sha256,status:'verified',revoked:false},
    parallelizable_items:[],
    gates:{
      Step01:{status:'ready',next_skill:'mx-shortdrama-01-frame-extract',authorization_event_id:job.analysis && job.analysis.authorizationEventId || null},
      Step02:{status:'blocked_upstream'},
      Step04:{status:'blocked_upstream'},
      Step05:{status:'blocked_upstream'},
      provider_submit:{status:'blocked_cost_authorization'},
      package_send:{status:'blocked_controller_authorization'}
    },
    blocker:null,
    next_action:'Production controller must assign one formal full-chain employee thread, then run mx-shortdrama-00-router from Step01.',
    updated_at:now()
  };
}

function authorityIdentity(job, rightsEvidence) {
  return {
    remote_project_id:safeId(job.id),source_sha256:String(job.source?.sha256||''),source_bytes:Number(job.source?.bytes),
    rights_authority_event_id:String(rightsEvidence.rights.event_id),rights_authority_sha256:String(rightsEvidence.sha256),rights_authority_bytes:Number(rightsEvidence.byteLength),rights_authority_scope:String(rightsEvidence.rights.scope),
    step01_authorization_event_id:String(job.analysis?.authorizationEventId||''),settings_version:Number(job.analysis?.settingsVersion||job.settingsVersion||1),
    analysis_network_event_id:String(job.analysis?.analysisServiceNetworkAuthorityEventId||job.analysis?.analysisServiceNetworkAuthority?.event_id||''),
    media_contract:{width:Number(job.preflight?.video?.width)||null,height:Number(job.preflight?.video?.height)||null,duration_seconds:Number(job.preflight?.durationSeconds)||null,fps:Number(job.preflight?.video?.fps)||null,audio_stream_count:Number(job.preflight?.audio?.streamCount)||0,audio_sample_rate:Number(job.preflight?.audio?.sampleRates?.[0])||null},
    media_provider_authority_granted:false
  };
}

function sameAuthorityIdentity(actual,expected){return JSON.stringify(actual)===JSON.stringify(expected);}

function immutableAuthorityIdentity(identity) {
  const value = identity || {};
  return {
    remote_project_id:value.remote_project_id,
    source_sha256:value.source_sha256,
    source_bytes:Number(value.source_bytes),
    rights_authority_event_id:value.rights_authority_event_id,
    rights_authority_sha256:value.rights_authority_sha256,
    rights_authority_bytes:Number(value.rights_authority_bytes),
    rights_authority_scope:value.rights_authority_scope,
    settings_version:Number(value.settings_version),
    media_contract:value.media_contract,
    media_provider_authority_granted:value.media_provider_authority_granted
  };
}

async function rebindExistingRecoveryAuthority(finalRoot, remoteId, expectedSha, expectedIdentity, analysisAuthorization, job, rightsEvidence) {
  const task = await readJson(path.join(finalRoot, 'task.json'));
  if (!task || task.remote_job_id !== remoteId) throw new Error('existing_job_id_collision');
  const sourcePath = task.source_video && task.source_video.exact_path;
  if (!sourcePath) throw new Error('existing_job_source_path_missing');
  const evidence = await sha256File(sourcePath);
  if (evidence.sha256 !== expectedSha || Number(task.source_video?.bytes) !== Number(expectedIdentity.source_bytes)) throw new Error('existing_source_sha256_mismatch');
  if (!sameAuthorityIdentity(immutableAuthorityIdentity(task.authority_bindings), immutableAuthorityIdentity(expectedIdentity))) throw new Error('existing_job_immutable_authority_identity_mismatch');
  const localRightsPath = path.join(finalRoot, 'rights_authority.json');
  const localRights = await sha256File(localRightsPath);
  if (localRights.sha256 !== expectedIdentity.rights_authority_sha256 || localRights.bytes !== Number(expectedIdentity.rights_authority_bytes)) throw new Error('existing_rights_authority_sha256_mismatch');
  const remoteRecoveryStatus = String(job.analysis?.status || '');
  if (!analysisAuthorization || !['queued','infra_failed','blocked_contract','blocked_resource','blocked_quality','blocked_authorization','blocked_transport'].includes(remoteRecoveryStatus)) throw new Error('existing_job_recovery_authorization_missing');
  const localStatus = await readJson(path.join(finalRoot, 'status.json'), {});
  const priorRebind = await readJson(path.join(finalRoot, 'step01_recovery_authority_rebind_receipt.json'), null);
  const recoveryStatuses = ['infra_failed','blocked_contract','blocked_resource','blocked_quality','blocked_authorization','blocked_transport'];
  const remoteRecoveryFromStatus = String(job.analysis?.recoveryFromStatus || '');
  const resumablePartialRebind = localStatus.status === 'prepared' && recoveryStatuses.includes(remoteRecoveryFromStatus) && priorRebind?.status === 'rebound' && priorRebind.step01_authorization_event_id === expectedIdentity.step01_authorization_event_id && priorRebind.analysis_network_event_id === expectedIdentity.analysis_network_event_id;
  const firstPreparedRecovery = localStatus.status === 'prepared' && recoveryStatuses.includes(remoteRecoveryFromStatus);
  if (!recoveryStatuses.includes(String(localStatus.status || '')) && !firstPreparedRecovery && !resumablePartialRebind) throw new Error('existing_job_recovery_status_not_blocked');
  const ledger = await readJson(path.join(finalRoot, 'artifact_ledger.json'), {artifacts:[]});
  if ((Array.isArray(ledger.artifacts) ? ledger.artifacts : []).some(item => item.artifact_id === 'step01_evidence_manifest' && ['verified','accepted','completed','delivered'].includes(String(item.status || '')))) throw new Error('existing_job_recovery_step01_already_verified');

  const timestamp = now();
  const updatedTask = {
    ...task,
    authority_bindings:expectedIdentity,
    analysis_run:{schema_version:'niannian_step01_source_analysis_run_v1',id:String(job.analysis?.runId||''),source_revision:Number(job.analysis?.sourceRevision||job.sourceRevision||0),source_sha256:String(job.analysis?.sourceSha256||job.source?.sha256||''),source_bytes:Number(job.source?.bytes||0)},
    request:{name:job.name,analysis_scope:'source_evidence_only',required_evidence:['media_probe','native_frames','shots','asr','audio_alignment','ocr']},
    analysis_authorization:analysisAuthorization,
    analysis_service_network_authority:analysisAuthorization.analysis_service_network_authority,
    updated_at:timestamp
  };
  delete updatedTask.production_settings;
  const dashboard = gateDashboard(job, task.job_id, sourcePath, evidence.sha256, rightsEvidence);
  const routeDecision = {
    ...(await readJson(path.join(finalRoot, 'route_decision.json'), {})),
    schema_version:'niannian_route_request_v1',
    authority_class:'advisory_request',
    required_router:'mx-shortdrama-00-router',
    selected_skill:null,
    source_sha256:evidence.sha256,
    authorization_event_id:analysisAuthorization.event_id,
    generated_at:timestamp
  };
  const checkpoint = {
    ...(await readJson(path.join(finalRoot, 'checkpoint.json'), {})),
    status:'prepared',
    current_step:'step00_router_ready_waiting_formal_employee_dispatch',
    blockers:[],
    next_skill:'mx-shortdrama-01-frame-extract',
    next_action:dashboard.next_action,
    authorization_event_id:analysisAuthorization.event_id,
    updated_at:timestamp
  };
  const status = {
    job_id:task.job_id,
    status:'prepared',
    current_node:'router',
    earliest_incomplete_node:'Step01',
    next_skill:'mx-shortdrama-01-frame-extract',
    blocker:null,
    next_action:dashboard.next_action,
    authorization_event_id:analysisAuthorization.event_id,
    updated_at:timestamp
  };
  const resultManifest = {
    ...(await readJson(path.join(finalRoot, 'result_manifest.json'), {})),
    job_id:task.job_id,
    remote_job_id:remoteId,
    status:'prepared',
    success:false,
    packaged:false,
    transport_success:false,
    user_visible_acceptance:false,
    artifacts:Array.isArray(ledger.artifacts) ? ledger.artifacts : [],
    updated_at:timestamp
  };
  const receipt = {
    schema_version:'niannian_step01_recovery_authority_rebind_receipt_v1',
    status:'rebound',
    remote_project_id:remoteId,
    local_job_id:task.job_id,
    source_sha256:evidence.sha256,
    rights_authority_sha256:expectedIdentity.rights_authority_sha256,
    prior_step01_authorization_event_id:String(task.authority_bindings?.step01_authorization_event_id || ''),
    step01_authorization_event_id:expectedIdentity.step01_authorization_event_id,
    prior_analysis_network_event_id:String(task.authority_bindings?.analysis_network_event_id || ''),
    analysis_network_event_id:expectedIdentity.analysis_network_event_id,
    provider_submission_requested:false,
    package_send_requested:false,
    rebound_at:timestamp
  };
  await Promise.all([
    atomicJson(path.join(finalRoot, 'task.json'), updatedTask),
    atomicJson(path.join(finalRoot, 'step01_authorization.json'), analysisAuthorization),
    atomicJson(path.join(finalRoot, 'route_decision.json'), routeDecision),
    atomicJson(path.join(finalRoot, 'status.json'), status),
    atomicJson(path.join(finalRoot, 'checkpoint.json'), checkpoint),
    atomicJson(path.join(finalRoot, 'gate_dashboard.json'), dashboard),
    atomicJson(path.join(finalRoot, 'result_manifest.json'), resultManifest)
  ]);
  await atomicJson(path.join(finalRoot, 'step01_recovery_authority_rebind_receipt.json'), receipt);
  await appendJobEvidenceEvent(finalRoot, {
    event_id:'step01_authority_rebound:' + expectedIdentity.step01_authorization_event_id,
    type:'step01_recovery_authority_rebound',
    job_id:task.job_id,
    source_sha256:evidence.sha256,
    step01_authorization_event_id:expectedIdentity.step01_authorization_event_id,
    analysis_network_event_id:expectedIdentity.analysis_network_event_id,
    provider_submission_requested:false,
    package_send_requested:false
  });
  return {task:updatedTask,sourcePath,evidence,receipt};
}

async function verifyExistingJob(finalRoot, remoteId, expectedSha, expectedIdentity) {
  const task = await readJson(path.join(finalRoot, 'task.json'));
  if (!task) {
    const error = new Error('existing_job_not_found');
    error.code = 'ENOENT';
    throw error;
  }
  if (task.remote_job_id !== remoteId) throw new Error('existing_job_id_collision');
  const sourcePath = task.source_video && task.source_video.exact_path;
  if (!sourcePath) throw new Error('existing_job_source_path_missing');
  const evidence = await sha256File(sourcePath);
  if (expectedSha && evidence.sha256 !== expectedSha) throw new Error('existing_source_sha256_mismatch');
  if(Number(task.source_video?.bytes)!==Number(expectedIdentity.source_bytes)||!sameAuthorityIdentity(task.authority_bindings,expectedIdentity))throw new Error('existing_job_authority_identity_mismatch');
  const authorizationFile = await readJson(path.join(finalRoot, 'step01_authorization.json'), null);
  if (task.analysis_authorization && (!authorizationFile || !sameAuthorityIdentity(authorizationFile, task.analysis_authorization))) throw new Error('existing_job_authority_file_mismatch');
  const localRightsPath=path.join(finalRoot,'rights_authority.json');const localRights=await sha256File(localRightsPath);
  if(localRights.sha256!==expectedIdentity.rights_authority_sha256||localRights.bytes!==Number(expectedIdentity.rights_authority_bytes))throw new Error('existing_rights_authority_sha256_mismatch');
  return { task, sourcePath, evidence };
}

async function materializeJob(token, job, leaseId) {
  const remoteId = safeId(job.id);
  const rightsEvidence=await downloadRightsAuthority(token,job,leaseId);
  const expectedAuthorityIdentity=authorityIdentity(job,rightsEvidence);
  const analysisAuthorization = job.analysis && job.analysis.authorizationEventId ? {
    event_id:String(job.analysis.authorizationEventId),
    source_sha256:String(job.analysis.sourceSha256 || ''),
    settings_version:Number(job.analysis.settingsVersion || 1),
    rights_authority:{event_id:String(job.analysis.rightsAuthorityEventId||''),sha256:String(job.analysis.rightsAuthoritySha256||'')},
    allowed_scope:'step01_evidence_only',
    allowed_skill_routes:['mx-shortdrama-00-router','mx-shortdrama-01-frame-extract'],
    analysis_service_network_authority:job.analysis.analysisServiceNetworkAuthority || null,
    provider_submission_requested:false,
    package_send_requested:false,
    approval_mode:String(job.analysis.approvalMode || (job.analysis.autoExecuteRequested ? 'policy_auto' : 'user_explicit')),
    approval_policy_id:String(job.analysis.approvalPolicyId || (job.analysis.autoExecuteRequested ? lowRiskPolicy.POLICY_ID : '')) || null,
    risk_class:String(job.analysis.riskClass || (job.analysis.autoExecuteRequested ? 'low' : 'user_approved')),
    auto_approved:job.analysis.autoApproved === true || job.analysis.autoExecuteRequested === true
  } : null;
  if (analysisAuthorization && analysisAuthorization.source_sha256 !== job.source.sha256) throw new Error('step01_authorization_source_sha256_mismatch');
  if(analysisAuthorization&&(analysisAuthorization.rights_authority.event_id!==rightsEvidence.rights.event_id||analysisAuthorization.rights_authority.sha256!==rightsEvidence.sha256))throw new Error('step01_authorization_rights_authority_mismatch');
  if (job.analysis && job.analysis.status === 'queued' && !analysisAuthorization) throw new Error('step01_authorization_missing');
  if (analysisAuthorization) {
    const networkAuthority = analysisAuthorization.analysis_service_network_authority;
    const services = new Set((networkAuthority && networkAuthority.allowed_services || []).map(item => String(item.service_id || item)));
    if (!networkAuthority || networkAuthority.schema_version !== 'niannian_step01_analysis_service_network_authority_v1' || networkAuthority.status !== 'authorized' || networkAuthority.authorization_event_id !== analysisAuthorization.event_id || networkAuthority.source_sha256 !== analysisAuthorization.source_sha256 || networkAuthority.settings_version !== analysisAuthorization.settings_version || !services.has('mimo_asr') || !services.has('paddle_ocr') || networkAuthority.media_provider_authority_granted !== false || networkAuthority.media_provider_submit_requested !== false || networkAuthority.spend_requested !== false) {
      throw new Error('step01_analysis_service_network_authority_invalid');
    }
  }
  if (analysisAuthorization && analysisAuthorization.approval_mode === 'policy_auto') {
    lowRiskPolicy.assertLowRiskAnalysis(analysisAuthorization);
    if (analysisAuthorization.approval_policy_id !== lowRiskPolicy.POLICY_ID || analysisAuthorization.risk_class !== 'low' || analysisAuthorization.auto_approved !== true) {
      throw new Error('step01_policy_authorization_invalid');
    }
  }
  const localJobId = 'web_' + remoteId.toLowerCase();
  const finalRoot = path.join(directJobsRoot, localJobId);
  const incomingRoot = path.join(directJobsRoot, '.' + localJobId + '.incoming-' + process.pid);

  try {
    const existing = await verifyExistingJob(finalRoot, remoteId, job.source.sha256,expectedAuthorityIdentity);
    const record = {
      remoteJobId:remoteId,
      localJobId,
      root:finalRoot,
      sourcePath:existing.sourcePath,
      sourceSha256:existing.evidence.sha256,
      completed:['website project received','existing mirrored job verified','source video sha256 verified','mx-shortdrama-00-router selected']
    };
    await updateProductionIndex(record, await localStatusPayload(record));
    return { status:'already_mirrored', ...record };
  } catch (error) {
    if (['existing_job_authority_identity_mismatch','existing_job_authority_file_mismatch'].includes(error.message)) {
      const rebound = await rebindExistingRecoveryAuthority(finalRoot, remoteId, job.source.sha256, expectedAuthorityIdentity, analysisAuthorization, job, rightsEvidence);
      const record = {
        remoteJobId:remoteId,
        localJobId,
        root:finalRoot,
        sourcePath:rebound.sourcePath,
        sourceSha256:rebound.evidence.sha256,
        completed:['website project received','existing mirrored job verified','recovery authority rebound','source video sha256 verified','mx-shortdrama-00-router selected']
      };
      await updateProductionIndex(record, await localStatusPayload(record));
      return {status:'authority_rebound',...record};
    }
    if (error.code !== 'ENOENT') throw error;
  }

  await fsp.rm(incomingRoot, { recursive:true, force:true });
  await fsp.mkdir(path.join(incomingRoot, 'source'), { recursive:true });
  await fsp.mkdir(path.join(incomingRoot, 'deliverables'), { recursive:true });
  const extension = path.extname(safeName(job.source.originalName || 'source.mp4')) || '.mp4';
  const incomingSourcePath = path.join(incomingRoot, 'source', 'source' + extension.toLowerCase());
  const downloaded = await downloadSource(token, job, leaseId, incomingSourcePath);
  if (job.source.sha256 && downloaded.sha256 !== job.source.sha256) {
    throw new Error('source_sha256_mismatch expected=' + job.source.sha256 + ' actual=' + downloaded.sha256);
  }

  const finalSourcePath = path.join(finalRoot, 'source', path.basename(incomingSourcePath));
  const timestamp = now();
  const transactionIntent = {
    run_id:localJobId,
    owner_thread:'unassigned_formal_fullchain_employee',
    node_id:'step00_router',
    allowed_write_paths:[finalRoot],
    expected_outputs:['route_decision.json','checkpoint.json','worker_report.md','result_manifest.json','artifact_ledger.json','gate_dashboard.json','step01_employee_dispatch.json','step01_employee_worker_receipt.json','step01_employee_control_receipt.json','step01_return_transport_manifest.json'],
    cost_gate:'controller_authorization_required',
    promote_policy:'verified_only'
  };
  const allowedSkillRoutes = ['mx-shortdrama-00-router','mx-shortdrama-01-frame-extract'];
  const task = {
    schema_version:'niannian_web_redraw_job_v1',
    job_id:localJobId,
    remote_job_id:remoteId,
    created_at:job.createdAt,
    mirrored_at:timestamp,
    entrypoint:'niannian_web_bridge',
    required_router:'mx-shortdrama-00-router',
    runtime_profile:'mac-step01-strict-evidence-v1',
    authority_bindings:expectedAuthorityIdentity,
    allowed_skill_routes:allowedSkillRoutes,
    source_video:{
      exact_path:finalSourcePath,
      original_name:job.source.originalName,
      mime_type:job.source.mimeType,
      bytes:downloaded.bytes,
      sha256:downloaded.sha256,
      verification_status:'verified',
      media_contract:{
        width:Number(job.preflight?.video?.width)||null,
        height:Number(job.preflight?.video?.height)||null,
        duration_seconds:Number(job.preflight?.durationSeconds)||null,
        fps:Number(job.preflight?.video?.fps)||null,
        audio_stream_count:Number(job.preflight?.audio?.streamCount)||0,
        audio_sample_rate:Number(job.preflight?.audio?.sampleRates?.[0])||null,
        ffprobe_status:String(job.preflight?.status||'')
      }
    },
    analysis_run:{
      schema_version:'niannian_step01_source_analysis_run_v1',
      id:String(job.analysis?.runId || ''),
      source_revision:Number(job.analysis?.sourceRevision || job.sourceRevision || 0),
      source_sha256:String(job.analysis?.sourceSha256 || job.source?.sha256 || ''),
      source_bytes:Number(job.source?.bytes || 0)
    },
    rights_authority:{event_id:rightsEvidence.rights.event_id,exact_path:path.join(finalRoot,'rights_authority.json'),sha256:rightsEvidence.sha256,bytes:rightsEvidence.byteLength,status:'confirmed',confirmed_by_user_id:rightsEvidence.rights.confirmed_by_user_id,source_sha256:rightsEvidence.rights.source_sha256,source_bytes:rightsEvidence.rights.source_bytes,scope:rightsEvidence.rights.scope,confirmed_at:rightsEvidence.rights.confirmed_at,revoked:false},
    request:{
      name:job.name,
      analysis_scope:'source_evidence_only',
      required_evidence:['media_probe','native_frames','shots','asr','audio_alignment','ocr']
    },
    analysis_authorization:analysisAuthorization,
    analysis_service_network_authority:analysisAuthorization && analysisAuthorization.analysis_service_network_authority,
    route:job.route,
    transaction_intent:transactionIntent,
    constraints:{
      local_image_editing:false,
      codex_worker_requires_route_allowlist:true,
      step01_requires_user_authorization:Boolean(analysisAuthorization && analysisAuthorization.approval_mode !== 'policy_auto'),
      step01_requires_policy_authorization:Boolean(analysisAuthorization && analysisAuthorization.approval_mode === 'policy_auto'),
      provider_submit_requires_authorization:true,
      package_send_requires_authorization:true,
      accepted_registry_promotion_requires_qa:true
    }
  };
  const dashboard = gateDashboard(job, localJobId, finalSourcePath, downloaded.sha256,rightsEvidence);
  const ledger = {
    schema_version:'artifact_ledger_v1',
    job_id:localJobId,
    artifacts:[{
      artifact_id:'source_video',
      node_id:'source_intake',
      exact_path:finalSourcePath,
      sha256:downloaded.sha256,
      bytes:downloaded.bytes,
      status:'verified',
      downstream_consumable_by:['Step01']
    },{artifact_id:'source_rights_authority',node_id:'source_intake',exact_path:path.join(finalRoot,'rights_authority.json'),sha256:rightsEvidence.sha256,bytes:rightsEvidence.byteLength,status:'verified',downstream_consumable_by:['Step01','fixed_app_phase']}],
    updated_at:timestamp
  };
  const status = {
    job_id:localJobId,
    status:'prepared',
    current_node:'router',
    earliest_incomplete_node:'Step01',
    next_skill:'mx-shortdrama-01-frame-extract',
    blocker:null,
    next_action:dashboard.next_action,
    updated_at:timestamp
  };
  const routeDecision = {
    schema_version:'niannian_route_request_v1',
    job_id:localJobId,
    mode:'shadow',
    advisory_only:true,
    authority_class:'advisory_request',
    required_router:'mx-shortdrama-00-router',
    allowed_skill_routes:allowedSkillRoutes,
    earliest_incomplete_node:'Step01',
    selected_skill:null,
    source_sha256:downloaded.sha256,
    rights_authority_event_id:rightsEvidence.rights.event_id,
    rights_authority_sha256:rightsEvidence.sha256,
    authorization_event_id:analysisAuthorization && analysisAuthorization.event_id || null,
    provider_submit:'blocked_cost_authorization',
    package_send:'blocked_controller_authorization',
    generated_at:timestamp
  };
  const checkpoint = {
    schema_version:1,
    job_id:localJobId,
    status:'prepared',
    current_step:'step00_router_ready_waiting_formal_employee_dispatch',
    completed:['remote job claimed','rights authority downloaded and sha256 verified','source downloaded','source sha256 verified','job contract materialized'],
    blockers:[],
    next_skill:'mx-shortdrama-01-frame-extract',
    next_action:dashboard.next_action,
    updated_at:timestamp
  };
  const resultManifest = {
    job_id:localJobId,
    remote_job_id:remoteId,
    status:'prepared',
    success:false,
    packaged:false,
    transport_success:false,
    user_visible_acceptance:false,
    artifacts:[...ledger.artifacts],
    updated_at:timestamp
  };

  await Promise.all([
    fsp.writeFile(path.join(incomingRoot,'rights_authority.json'),rightsEvidence.bytes,{flag:'wx'}),
    atomicJson(path.join(incomingRoot, 'transaction_intent.json'), transactionIntent),
    atomicJson(path.join(incomingRoot, 'task.json'), task),
    atomicJson(path.join(incomingRoot, 'route_decision.json'), routeDecision),
    atomicJson(path.join(incomingRoot, 'status.json'), status),
    atomicJson(path.join(incomingRoot, 'checkpoint.json'), checkpoint),
    atomicJson(path.join(incomingRoot, 'result_manifest.json'), resultManifest),
    atomicJson(path.join(incomingRoot, 'gate_dashboard.json'), dashboard),
    atomicJson(path.join(incomingRoot, 'artifact_ledger.json'), ledger),
    atomicJson(path.join(incomingRoot, 'assignments.json'), {
      job_id:localJobId,
      controller:'unassigned',
      fullchain_employee:'unassigned',
      dispatch_status:'awaiting_formal_controller'
    }),
    fsp.writeFile(path.join(incomingRoot, 'gate_dashboard.md'), '# 质量门\n\n- 当前节点：router\n- 最早未完成节点：Step01\n- 下一技能：mx-shortdrama-01-frame-extract\n- Provider submit：授权阻塞\n- 下一动作：由 production controller 指派正式全链路员工线程。\n', 'utf8'),
    fsp.writeFile(path.join(incomingRoot, 'conversation_log.md'), '# Conversation Log\n\n- ' + timestamp + ' Website job mirrored into local controller intake.\n', 'utf8'),
    fsp.writeFile(path.join(incomingRoot, 'codex_prompt.md'), '# 念念 AI 转绘派单\n\n先使用 mx-shortdrama-00-router，读取 gate_dashboard、artifact_ledger、task、checkpoint 和 exact source path，从 Step01 开始。生产、修复、QA、Step05 和交付必须由正式员工线程或 System A controller 拥有；未授权时不得提交 provider、package/send 或提升 accepted registry。\n', 'utf8'),
    fsp.writeFile(path.join(incomingRoot, 'worker_report.md'), '# Worker Report\n\n- Status: PREPARED\n- Source video: verified\n- Earliest incomplete node: Step01\n- Owner: unassigned formal full-chain employee\n- Next action: controller dispatch.\n', 'utf8')
  ]);

  await fsp.rename(incomingRoot, finalRoot);
  const record = {
    remoteJobId:remoteId,
    localJobId,
    root:finalRoot,
    sourcePath:finalSourcePath,
    sourceSha256:downloaded.sha256,
    completed:['website project received','source video sha256 verified','job contract mirrored','mx-shortdrama-00-router selected']
  };
  await updateProductionIndex(record, await localStatusPayload(record));
  return { status:'mirrored', ...record };
}

function normalizeStatus(value, blocker) {
  const status = String(value || '').trim();
  if (status === 'step02_accepted') throw new Error('STEP02_REDUCER_ACCEPTANCE_REQUIRED');
  if (allowedStatuses.has(status)) return status;
  if (status === 'running') return 'running_step01';
  if (status === 'completed') throw new Error('CONTROLLER_GENERIC_COMPLETED_REQUIRES_TYPED_STATUS');
  if (status === 'blocked') return blocker ? 'blocked_contract' : 'blocked_contract';
  return 'prepared';
}

function firstBlocker(status, checkpoint, dashboard) {
  if (status && status.blocker) return typeof status.blocker === 'string' ? status.blocker : JSON.stringify(status.blocker);
  if (dashboard && dashboard.blocker) return typeof dashboard.blocker === 'string' ? dashboard.blocker : JSON.stringify(dashboard.blocker);
  const blockers = checkpoint && (checkpoint.blockers || checkpoint.blocker);
  if (Array.isArray(blockers) && blockers.length) return typeof blockers[0] === 'string' ? blockers[0] : JSON.stringify(blockers[0]);
  if (typeof blockers === 'string' && blockers) return blockers;
  return null;
}

async function localStatusPayload(record) {
  const [status, checkpoint, dashboard, ledger, workerDispatch, workerReceipt, employeePreflight, task, evidenceEvents] = await Promise.all([
    readJson(path.join(record.root, 'status.json'), {}),
    readJson(path.join(record.root, 'checkpoint.json'), {}),
    readJson(path.join(record.root, 'gate_dashboard.json'), {}),
    readJson(path.join(record.root, 'artifact_ledger.json'), {artifacts:[]}),
    readJson(path.join(record.root, 'step01_employee_dispatch.json'), null).then(value => value || readJson(path.join(record.root, 'employee_dispatch.json'), null)),
    readJson(path.join(record.root, 'step01_employee_worker_receipt.json'), null).then(value => value || readJson(path.join(record.root, 'employee_worker_receipt.json'), null)),
    readJson(path.join(record.root, 'employee_preflight.json'), null),
    readJson(path.join(record.root, 'task.json'), {}),
    readEvidenceEvents(record.root)
  ]);
  const artifacts = Array.isArray(ledger.artifacts) ? ledger.artifacts : [];
  const projection = step01Reducer.reduceStep01State({status,checkpoint,dashboard,ledger,dispatch:workerDispatch,receipt:workerReceipt,events:evidenceEvents});
  const blockerValue = projection.blocker || firstBlocker(status, checkpoint, dashboard);
  const blocker = blockerValue ? (typeof blockerValue === 'string' ? blockerValue : JSON.stringify(blockerValue)) : null;
  const productionStatus = normalizeStatus(projection.production_status || status.status || checkpoint.status || dashboard.overall_status, blocker);
  let policyApproved = false;
  try {
    const authorization = task.analysis_authorization || {};
    policyApproved = lowRiskPolicy.assertLowRiskAnalysis({...authorization,allowed_skill_routes:task.allowed_skill_routes}).approved === true;
  } catch {}
  const automaticRecoveryAttempts = (evidenceEvents || []).filter(event => event.type === 'automatic_recovery_started').length;
  const autoRecovery = step01Reducer.evaluateAutoRecovery({
    receipt:workerReceipt,
    blocker:projection.blocker && typeof projection.blocker === 'object' ? projection.blocker : status.blocker || {},
    preflight:employeePreflight,
    prior_attempts:automaticRecoveryAttempts,
    active_worker:Boolean(workerDispatch && ['queued','running'].includes(workerDispatch.status) && !workerReceipt),
    source_sha_match:Boolean(task.source_video && task.source_video.sha256 === record.sourceSha256),
    policy_approved:policyApproved
  });
  return {
    controllerId,
    leaseId:record.leaseId,
    localJobId:record.localJobId,
    productionStatus,
    currentNode:status.current_node || status.current_step || checkpoint.current_step || dashboard.current_node || dashboard.current_step || 'controller',
    earliestIncompleteNode:status.earliest_incomplete_node || checkpoint.earliest_incomplete_node || dashboard.earliest_incomplete_node || null,
    nextSkill:status.next_skill || checkpoint.next_skill || dashboard.next_skill || null,
    blocker,
    nextAction:status.next_action || checkpoint.next_action || dashboard.next_action || '等待控制器更新下一动作',
    artifactCount:artifacts.length,
    verifiedArtifactCount:artifacts.filter(item => ['verified','delivered'].includes(item.status)).length,
    gateState:dashboard.overall_status || productionStatus,
    gates:dashboard.gates || {},
    worker:projection.worker || {dispatchId:null,threadId:null,status:'idle',router:null,mode:'queue',updatedAt:status.updated_at || checkpoint.updated_at || null,blocker:null},
    step01:projection,
    strictRuntime:employeePreflight ? {ready:employeePreflight.ready === true,runtimeProfile:String(employeePreflight.runtime_profile || ''),missing:Array.isArray(employeePreflight.missing) ? employeePreflight.missing.slice(0,30).map(String) : [],checkedAt:String(employeePreflight.checked_at || '') || null} : null,
    autoRecovery,
    checkpointUpdatedAt:checkpoint.updated_at || status.updated_at || dashboard.updated_at || now()
  };
}

async function claim(token, remoteId = null) {
  const route = remoteId
    ? '/api/controller/jobs/' + encodeURIComponent(remoteId) + '/claim'
    : '/api/controller/jobs/claim';
  const payload = await api(token, route, {
    method:'POST',
    body:JSON.stringify({controllerId})
  });
  return payload && payload.job;
}

async function ensureLease(token, record) {
  const leaseUntil = new Date(record.leaseUntil || 0).getTime();
  if (record.leaseId && leaseUntil > Date.now() + 30000) return record;
  const job = await claim(token, record.remoteJobId);
  if (!job) throw new Error('controller_reclaim_returned_no_job');
  record.leaseId = job.controller.leaseId;
  record.leaseUntil = job.controller.leaseUntil;
  return record;
}

async function syncRecord(token, record) {
  await ensureLease(token, record);
  await recordReceiptEvidence(record);
  const payload = await localStatusPayload(record);
  payload.leaseId = record.leaseId;
  const result = await api(token, '/api/controller/jobs/' + encodeURIComponent(record.remoteJobId) + '/status', {
    method:'POST',
    headers:{'X-NianNian-Lease-Id':record.leaseId},
    body:JSON.stringify(payload)
  });
  record.leaseUntil = result.leaseUntil;
  record.lastStatus = payload.productionStatus;
  record.lastSyncedAt = now();
  record.lastBlocker = payload.blocker;
  await updateProductionIndex(record, payload);
  return payload;
}

async function runOnce(token, state, exactRemoteJobId = '') {
  const synced = [];
  const errors = [];
  for (const record of Object.values(state.jobs)) {
    try {
      const payload = await syncRecord(token, record);
      synced.push({remoteJobId:record.remoteJobId,status:payload.productionStatus});
    } catch (error) {
      record.lastError = error.message;
      record.lastErrorAt = now();
      errors.push({remoteJobId:record.remoteJobId,error:error.message});
      await appendEvent('status_sync_error', {remote_job_id:record.remoteJobId, blocker:error.message});
    }
  }

  const job = await claim(token, exactRemoteJobId || null);
  let mirrored = null;
  if (job) {
    const result = await materializeJob(token, job, job.controller.leaseId);
    const record = {
      ...(state.jobs[job.id] || {}),
      remoteJobId:job.id,
      localJobId:result.localJobId,
      root:result.root,
      sourcePath:result.sourcePath,
      sourceSha256:result.sourceSha256,
      completed:result.completed,
      leaseId:job.controller.leaseId,
      leaseUntil:job.controller.leaseUntil,
      materializedAt:state.jobs[job.id]?.materializedAt || now()
    };
    state.jobs[job.id] = record;
    const payload = await syncRecord(token, record);
    mirrored = {remoteJobId:job.id,localJobId:record.localJobId,status:payload.productionStatus,result:result.status};
    await appendEvent('job_mirrored', {
      remote_job_id:job.id,
      local_job_id:record.localJobId,
      result:result.status
    });
  }

  state.status = errors.length ? 'degraded' : mirrored || synced.length ? 'ok' : 'idle';
  state.last_result = {mirrored,synced,errors};
  await saveState(state);
  return state.last_result;
}

async function main() {
  const token = await loadToken();
  if (requestedRemoteJobId) safeId(requestedRemoteJobId);
  do {
    let lock;
    try {
      lock = await acquireLock();
      const state = await loadState();
      const result = await runOnce(token, state, requestedRemoteJobId);
      process.stdout.write(JSON.stringify({status:'ok',controllerId,...result,at:now()}) + '\n');
    } catch (error) {
      const state = await loadState().catch(() => ({jobs:{}}));
      state.status = 'blocked';
      state.blocker = error.message;
      state.blocker_class = error.status ? 'external_resource_failure' : 'infrastructure_failure';
      state.next_action = error.code === 'CONTROLLER_LEASE_EXPIRED' ? 'Reclaim the controller lease and retry.' : 'Inspect bridge state and controller API availability.';
      await saveState(state).catch(() => {});
      await appendEvent('bridge_error', {
        blocker:error.message,
        blocker_class:state.blocker_class,
        retryable:!String(error.message).includes('sha256_mismatch')
      }).catch(() => {});
      if (!watchMode) throw error;
    } finally {
      if (lock) await releaseLock(lock);
    }
    if (watchMode) await new Promise(resolve => setTimeout(resolve, intervalMs));
  } while (watchMode);
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write('bridge_failed: ' + error.message + '\n');
    process.exitCode = 1;
  });
}

module.exports = {
  authorityIdentity,
  loadToken,
  loadState,
  saveState,
  claim,
  materializeJob,
  runOnce,
  syncRecord,
  localStatusPayload,
  normalizeStatus,
  immutableAuthorityIdentity,
  rebindExistingRecoveryAuthority,
  updateProductionIndex,
  verifyExistingJob
};
