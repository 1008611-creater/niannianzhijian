'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const {THREADS} = require('./mac_codex_app_employee_bootstrap');

const EFFECTS = Object.freeze([
  'media_provider_network_requested',
  'media_provider_submit_requested',
  'media_provider_upload_requested',
  'spend_requested',
  'package_send_requested',
  'registry_promotion_requested',
  'deployment_requested',
  'local_image_editing_requested',
  'real_delivery'
]);

const DOWNSTREAM_STEP02_STATUSES = new Set([
  'step02_accepted',
  'running_step04',
  'step04_accepted',
  'running_step05',
  'qa_running',
  'accepted',
  'packaged',
  'sent',
  'user_visible_acceptance'
]);

const SCHEMAS = Object.freeze({
  transaction:'niannian_redraw_step02_transaction_v1',
  authority:'niannian_redraw_step02_upstream_authority_v1',
  node:'niannian_redraw_step02_node_contract_v1',
  dispatch:'niannian_redraw_step02_mac_employee_dispatch_v1',
  candidate:'niannian_redraw_step02_source_truth_candidate_v1',
  receipt:'niannian_redraw_step02_employee_receipt_v1',
  control:'niannian_redraw_step02_control_receipt_v1',
  appAudit:'niannian_redraw_step02_app_server_audit_v1',
  carrier:'niannian_redraw_step02_windows_carrier_receipt_v1',
  returnManifest:'niannian_redraw_step02_return_manifest_v1',
  acceptance:'niannian_redraw_step02_acceptance_manifest_v1',
  reducer:'niannian_redraw_step02_reducer_receipt_v1',
  event:'niannian_evidence_event_v1'
});

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const stableId = (...parts) => 'step02-' + sha256(parts.join('|')).slice(0, 32);

function codeError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertFalseEffects(value, code = 'STEP02_SIDE_EFFECT_CONTRACT_INVALID') {
  for (const key of EFFECTS) if (value?.[key] !== false) throw codeError(code, code + ':' + key);
}

function falseEffects() {
  return Object.fromEntries(EFFECTS.map(key => [key, false]));
}

function inside(root, candidate) {
  const base = path.resolve(root);
  const target = path.resolve(candidate);
  return target === base || target.startsWith(base + path.sep);
}

function safeRelative(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('..') || /^[a-zA-Z]:/.test(normalized)) throw codeError('STEP02_RELATIVE_PATH_INVALID');
  return normalized;
}

async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temp = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n');
  await fsp.rename(temp, filePath);
}

async function readJson(filePath) {
  let bytes;
  try { bytes = await fsp.readFile(filePath); }
  catch (error) { if (error.code === 'ENOENT') throw codeError('STEP02_EVIDENCE_MISSING', filePath); throw error; }
  try { return JSON.parse(bytes); }
  catch { throw codeError('STEP02_EVIDENCE_JSON_INVALID', filePath); }
}

async function evidence(filePath) {
  const exactPath = path.resolve(filePath);
  const stats = await fsp.lstat(exactPath).catch(error => { if (error.code === 'ENOENT') throw codeError('STEP02_EVIDENCE_MISSING', exactPath); throw error; });
  if (stats.isSymbolicLink() || !stats.isFile()) throw codeError('STEP02_EVIDENCE_NOT_REGULAR', exactPath);
  const bytes = await fsp.readFile(exactPath);
  return {exact_path:exactPath,sha256:sha256(bytes),bytes:bytes.length,json:JSON.parse(bytes)};
}

async function binaryEvidence(filePath) {
  const exactPath = path.resolve(filePath);
  const stats = await fsp.lstat(exactPath).catch(error => { if (error.code === 'ENOENT') throw codeError('STEP02_SOURCE_FILE_MISSING', exactPath); throw error; });
  if (stats.isSymbolicLink() || !stats.isFile()) throw codeError('STEP02_SOURCE_FILE_NOT_REGULAR', exactPath);
  const bytes = await fsp.readFile(exactPath);
  return {exact_path:exactPath,sha256:sha256(bytes),bytes:bytes.length};
}

async function appendEventOnce(eventsPath, event) {
  const normalized = {...event,schema_version:SCHEMAS.event};
  if (!normalized.event_id) throw codeError('STEP02_EVENT_ID_REQUIRED');
  await fsp.mkdir(path.dirname(eventsPath), {recursive:true});
  let existing = [];
  try { existing = (await fsp.readFile(eventsPath, 'utf8')).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const prior = existing.find(item => item.event_id === normalized.event_id);
  if (prior) {
    if (JSON.stringify(prior) !== JSON.stringify(normalized)) throw codeError('STEP02_EVENT_ID_COLLISION');
    return {appended:false,event:prior};
  }
  await fsp.appendFile(eventsPath, JSON.stringify(normalized) + '\n');
  return {appended:true,event:normalized};
}

async function readEvents(eventsPath) {
  try { return (await fsp.readFile(eventsPath, 'utf8')).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

function statusRequiresStep02Acceptance(status) {
  return DOWNSTREAM_STEP02_STATUSES.has(String(status || '').trim());
}

function sourceContract(project, task, step01Manifest) {
  const duration = Number(step01Manifest.source_media_contract?.duration_seconds || task.source_media_contract?.duration_seconds || project.preflight?.durationSeconds);
  const visualDuration = Number(step01Manifest.source_media_contract?.video_duration_seconds || task.source_media_contract?.video_duration_seconds || duration);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(visualDuration) || visualDuration <= 0 || visualDuration > duration + 0.001) throw codeError('STEP02_SOURCE_DURATION_CONTRACT_INVALID');
  return {duration_seconds:duration,visual_duration_seconds:visualDuration,trailing_audio_only_seconds:Number(Math.max(0, duration - visualDuration).toFixed(3))};
}

async function validateUpstream(project, jobRoot) {
  if (!project?.id || !project?.source?.sha256 || !project?.source?.bytes || !project?.ownerId) throw codeError('STEP02_PROJECT_IDENTITY_INVALID');
  const paths = {
    task:path.join(jobRoot, 'task.json'),
    rights:path.join(jobRoot, 'rights_authority.json'),
    manifest:path.join(jobRoot, 'step01_evidence_manifest.json'),
    receipt:path.join(jobRoot, 'step01_employee_worker_receipt.json'),
    control:path.join(jobRoot, 'step01_employee_control_receipt.json')
  };
  const [taskEvidence, rightsEvidence, manifestEvidence, receiptEvidence, controlEvidence,sourceEvidence] = await Promise.all([...Object.values(paths).map(evidence),binaryEvidence(project.source.storedPath)]);
  const task = taskEvidence.json;
  const rights = rightsEvidence.json;
  const manifest = manifestEvidence.json;
  const receipt = receiptEvidence.json;
  const control = controlEvidence.json;
  const taskSource = task.source_video || task.source || {};
  if (sourceEvidence.sha256 !== project.source.sha256 || sourceEvidence.bytes !== Number(project.source.bytes)) throw codeError('STEP02_SOURCE_FILE_BINDING_INVALID');
  if (String(task.job_id || task.remote_job_id || '') !== project.id || taskSource.sha256 !== project.source.sha256 || Number(taskSource.bytes) !== Number(project.source.bytes)) throw codeError('STEP02_TASK_SOURCE_BINDING_INVALID');
  if (rights.schema_version !== 'niannian_source_rights_authority_v1' || rights.status !== 'confirmed' || rights.revoked !== false || rights.confirmed_by_user_id !== project.ownerId || rights.source_sha256 !== project.source.sha256 || Number(rights.source_bytes) !== Number(project.source.bytes)) throw codeError('STEP02_RIGHTS_AUTHORITY_INVALID');
  if (manifest.schema_version !== 'step01_evidence_manifest_v1' || manifest.status !== 'verified' || manifest.downstream_consumable !== true || manifest.source_sha256 !== project.source.sha256 || Number(manifest.source_bytes) !== Number(project.source.bytes)) throw codeError('STEP02_STEP01_MANIFEST_INVALID');
  if (receipt.schema_version !== 'niannian_redraw_step01_mac_employee_receipt_v2' || receipt.step01_verified !== true || receipt.downstream_consumable !== true || receipt.remote_project_id !== project.id || receipt.source_sha256 !== project.source.sha256 || receipt.evidence_manifest?.sha256 !== manifestEvidence.sha256 || receipt.rights_authority?.event_id !== rights.event_id || receipt.rights_authority?.sha256 !== rightsEvidence.sha256 || Number(receipt.settings_version) !== Number(project.settingsVersion)) throw codeError('STEP02_STEP01_RECEIPT_INVALID');
  if (control.schema_version !== 'niannian_redraw_step01_mac_app_control_receipt_v2' || control.remote_project_id !== project.id || control.source_sha256 !== project.source.sha256 || control.completion_event?.status !== 'completed' || control.completion_event?.error !== null || control.employee?.thread_id !== receipt.completion_event?.thread_id && receipt.completion_event?.thread_id) throw codeError('STEP02_STEP01_CONTROL_INVALID');
  for (const item of [receipt, control]) assertFalseEffects(item, 'STEP02_STEP01_SIDE_EFFECT_BINDING_INVALID');
  return {
    project_id:project.id,
    job_id:String(task.local_job_id || task.job_id || project.id),
    owner_id:project.ownerId,
    source:{sha256:project.source.sha256,bytes:Number(project.source.bytes)},
    rights:{event_id:rights.event_id,sha256:rightsEvidence.sha256,scope:rights.scope,status:rights.status,revoked:false},
    settings_version:Number(project.settingsVersion),
    step01:{manifest:manifestEvidence,receipt:receiptEvidence,control:controlEvidence},
    source_media_contract:sourceContract(project, task, manifest),
    task:taskEvidence
  };
}

function step02Root(jobRoot) {
  return path.join(jobRoot, 'step02');
}

async function prepareStep02({project,jobRoot,now = new Date().toISOString()}) {
  const upstream = await validateUpstream(project, jobRoot);
  const root = step02Root(jobRoot);
  const transactionId = stableId(project.id, upstream.source.sha256, upstream.rights.sha256, upstream.step01.manifest.sha256, String(upstream.settings_version));
  const transactionPath = path.join(root, 'transaction_intent.json');
  if (fs.existsSync(transactionPath)) {
    const prior = await readJson(transactionPath);
    if (prior.transaction_id !== transactionId || prior.bindings?.step01_manifest_sha256 !== upstream.step01.manifest.sha256 || prior.bindings?.rights_authority_sha256 !== upstream.rights.sha256) throw codeError('STEP02_TRANSACTION_BINDING_DRIFT');
    return loadReview({project,jobRoot});
  }
  await fsp.mkdir(root, {recursive:true});
  const authority = {schema_version:SCHEMAS.authority,status:'verified',transaction_id:transactionId,project_id:project.id,job_id:upstream.job_id,owner_id:project.ownerId,source:upstream.source,rights_authority:upstream.rights,settings_version:upstream.settings_version,step01:{manifest:{exact_path:upstream.step01.manifest.exact_path,sha256:upstream.step01.manifest.sha256,bytes:upstream.step01.manifest.bytes},receipt:{exact_path:upstream.step01.receipt.exact_path,sha256:upstream.step01.receipt.sha256,bytes:upstream.step01.receipt.bytes},control:{exact_path:upstream.step01.control.exact_path,sha256:upstream.step01.control.sha256,bytes:upstream.step01.control.bytes}},source_media_contract:upstream.source_media_contract,...falseEffects(),created_at:now};
  const authorityPath = path.join(root, 'upstream_authority_snapshot.json');
  await atomicJson(authorityPath, authority);
  const authorityEvidence = await evidence(authorityPath);
  const transaction = {schema_version:SCHEMAS.transaction,status:'prepared',test_only:false,transaction_id:transactionId,project_id:project.id,job_id:upstream.job_id,owner_id:project.ownerId,node_id:'step02_source_truth',authoritative_inputs:['upstream_authority_snapshot.json'],expected_outputs:['step02_employee_dispatch.json','step02_source_truth_candidate.json','step02_employee_receipt.json','step02_control_receipt.json','step02_return_manifest.json','step02_acceptance_manifest.json','step02_reducer_receipt.json','evidence_events.jsonl','artifact_ledger.json','checkpoint.json','gate_dashboard.json'],allowed_write_paths:[root],cost_gate:'no_media_provider_or_spend',promote_policy:'server_reducer_acceptance_only',bindings:{source_sha256:upstream.source.sha256,rights_authority_sha256:upstream.rights.sha256,step01_manifest_sha256:upstream.step01.manifest.sha256,upstream_authority_sha256:authorityEvidence.sha256,settings_version:upstream.settings_version},...falseEffects(),created_at:now};
  const node = {schema_version:SCHEMAS.node,node_id:'step02_source_truth',status:'prepared',transaction_id:transactionId,authoritative_inputs:transaction.authoritative_inputs,expected_outputs:transaction.expected_outputs,exact_paths_and_sha256:{upstream_authority_snapshot:{exact_path:authorityPath,sha256:authorityEvidence.sha256}},blocker:null,next_action:'Prepare fixed existing Mac App candidate-only dispatch.',checkpoint:'checkpoint.json',allowed_parallelism:'single_project_single_step02_transaction',promotion_condition:'server reducer validates candidate and writes exact acceptance manifest',step04_ready:false,...falseEffects()};
  await atomicJson(transactionPath, transaction);
  await atomicJson(path.join(root, 'step02_node_contract.json'), node);
  const event = {event_id:stableId(transactionId, 'prepared'),type:'step02_prepared',node_id:'Step02',transaction_id:transactionId,project_id:project.id,source_sha256:upstream.source.sha256,step01_manifest_sha256:upstream.step01.manifest.sha256,authority_sha256:authorityEvidence.sha256,at:now};
  await appendEventOnce(path.join(root, 'evidence_events.jsonl'), event);
  await reduceStep02({project,jobRoot});
  return loadReview({project,jobRoot});
}

async function prepareDispatch({project,jobRoot,ownerId,ownerActionEventId,now = new Date().toISOString()}) {
  const root = step02Root(jobRoot);
  if (ownerId !== project.ownerId) throw codeError('STEP02_OWNER_SCOPE_INVALID');
  const freshUpstream = await validateUpstream(project, jobRoot);
  const transaction = await readJson(path.join(root, 'transaction_intent.json'));
  const authorityEvidence = await evidence(path.join(root, 'upstream_authority_snapshot.json'));
  if (transaction.schema_version !== SCHEMAS.transaction || transaction.status !== 'prepared' || transaction.project_id !== project.id || transaction.bindings?.upstream_authority_sha256 !== authorityEvidence.sha256 || transaction.bindings?.step01_manifest_sha256 !== freshUpstream.step01.manifest.sha256 || transaction.bindings?.rights_authority_sha256 !== freshUpstream.rights.sha256) throw codeError('STEP02_TRANSACTION_INVALID');
  const dispatchPath = path.join(root, 'step02_employee_dispatch.json');
  const expectedOwnerActionEventId = stableId(transaction.transaction_id, project.ownerId, 'website_owner_step02_dispatch');
  if (ownerActionEventId !== undefined && ownerActionEventId !== expectedOwnerActionEventId) throw codeError('STEP02_OWNER_ACTION_EVENT_INVALID');
  if (fs.existsSync(dispatchPath)) {
    const prior = await evidence(dispatchPath);
    if (prior.json.schema_version !== SCHEMAS.dispatch || prior.json.project_id !== project.id || prior.json.transaction_id !== transaction.transaction_id || prior.json.source_sha256 !== transaction.bindings.source_sha256 || prior.json.step01_manifest_sha256 !== transaction.bindings.step01_manifest_sha256 || prior.json.owner_action_event_id !== expectedOwnerActionEventId || !THREADS.some(item => item.thread_id === prior.json.employee?.thread_id)) throw codeError('STEP02_EXISTING_DISPATCH_INVALID');
    assertFalseEffects(prior.json);
    return {dispatch:prior.json,evidence:prior};
  }
  const employee = THREADS[parseInt(sha256(transaction.transaction_id).slice(0, 8), 16) % THREADS.length];
  const dispatchId = stableId(transaction.transaction_id, employee.thread_id, 'dispatch');
  const phaseKey = stableId(project.id, transaction.transaction_id, dispatchId, transaction.bindings.step01_manifest_sha256);
  const allowedWritePaths = ['step02_source_truth_candidate.json','step02_employee_receipt.json','step02_control_receipt.json','step02_app_server_audit.json','step02_app_server_response.json','step02_return_manifest.json'];
  const dispatch = {schema_version:SCHEMAS.dispatch,status:'prepared',test_only:false,execution_mode:'fixed_existing_mac_app_candidate_only',transaction_id:transaction.transaction_id,dispatch_id:dispatchId,phase_key:phaseKey,project_id:project.id,job_id:transaction.job_id,owner_id:project.ownerId,owner_action_event_id:expectedOwnerActionEventId,source_sha256:transaction.bindings.source_sha256,rights_authority_sha256:transaction.bindings.rights_authority_sha256,step01_manifest_sha256:transaction.bindings.step01_manifest_sha256,upstream_authority_sha256:authorityEvidence.sha256,settings_version:transaction.bindings.settings_version,employee:{employee:employee.employee,title:employee.title,thread_id:employee.thread_id,project_root:'/Users/lsb/AI-Brain/niannian-ai-canonical-local'},transport:{fixed_app_required:true,thread_read_before_start:true,active_turn_reject:true,cli_fallback_allowed:false,ephemeral_thread_allowed:false,legacy_latest_lookup_allowed:false},allowed_write_paths:allowedWritePaths,expected_outputs:['step02_source_truth_candidate.json','step02_employee_receipt.json','step02_control_receipt.json','step02_app_server_audit.json','step02_return_manifest.json','step02_windows_carrier_receipt.json'],candidate_contract:{status:'candidate',downstream_consumable:false,required_sections:['sourceRows','dialogueBindings','visualFactCards','textEvidence','assetCandidates','hardSceneCandidates','rejectedEvidence','blockers']},...falseEffects(),prepared_at:now};
  assertFalseEffects(dispatch);
  await atomicJson(dispatchPath, dispatch);
  await appendEventOnce(path.join(root, 'evidence_events.jsonl'), {event_id:stableId(transaction.transaction_id, 'dispatch', dispatchId),type:'step02_dispatch_prepared',node_id:'Step02',transaction_id:transaction.transaction_id,project_id:project.id,dispatch_id:dispatchId,phase_key:phaseKey,employee_thread_id:employee.thread_id,at:now});
  await reduceStep02({project,jobRoot});
  return {dispatch,evidence:await evidence(dispatchPath)};
}

async function markCarrierRunning({project,jobRoot,dispatchId,ownerActionEventId,now = new Date().toISOString()}) {
  const root = step02Root(jobRoot);
  const dispatch = await readJson(path.join(root, 'step02_employee_dispatch.json'));
  if (dispatch.project_id !== project.id || dispatch.dispatch_id !== dispatchId || dispatch.owner_action_event_id !== ownerActionEventId) throw codeError('STEP02_CARRIER_DISPATCH_BINDING_INVALID');
  await validateUpstream(project, jobRoot);
  await appendEventOnce(path.join(root, 'evidence_events.jsonl'), {event_id:stableId(dispatch.transaction_id, 'carrier-running', dispatch.dispatch_id),type:'step02_carrier_running',node_id:'Step02',transaction_id:dispatch.transaction_id,project_id:project.id,dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,owner_action_event_id:dispatch.owner_action_event_id,employee_thread_id:dispatch.employee.thread_id,at:now});
  await reduceStep02({project,jobRoot});
  return loadReview({project,jobRoot});
}
async function markCarrierBlocked({project,jobRoot,dispatchId,ownerActionEventId,blocker,now = new Date().toISOString()}) {
  const root=step02Root(jobRoot),dispatch=await readJson(path.join(root,'step02_employee_dispatch.json'));
  if(dispatch.project_id!==project.id||dispatch.dispatch_id!==dispatchId||dispatch.owner_action_event_id!==ownerActionEventId||!blocker?.code)throw codeError('STEP02_CARRIER_BLOCKER_BINDING_INVALID');
  await appendEventOnce(path.join(root,'evidence_events.jsonl'),{event_id:stableId(dispatch.transaction_id,'carrier-blocked',dispatch.dispatch_id,blocker.code),type:'step02_carrier_blocked',node_id:'Step02',transaction_id:dispatch.transaction_id,project_id:project.id,dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,owner_action_event_id:dispatch.owner_action_event_id,blocker:{code:blocker.code,class:blocker.class||'infrastructure',retryable:blocker.retryable!==false},at:now});
  await reduceStep02({project,jobRoot});return loadReview({project,jobRoot});
}

function validateCandidate(candidate, authority, {accepted = false} = {}) {
  if (candidate.schema_version !== SCHEMAS.candidate || candidate.status !== 'candidate' || candidate.downstream_consumable !== false || typeof candidate.test_only !== 'boolean' || candidate.project_id !== authority.project_id || candidate.source_sha256 !== authority.source.sha256 || candidate.step01_manifest_sha256 !== authority.step01.manifest.sha256 || candidate.rights_authority_sha256 !== authority.rights_authority.sha256 || Number(candidate.settings_version) !== Number(authority.settings_version)) throw codeError('STEP02_CANDIDATE_BINDING_INVALID');
  assertFalseEffects(candidate);
  const required = ['sourceRows','dialogueBindings','visualFactCards','textEvidence','assetCandidates','hardSceneCandidates','rejectedEvidence','blockers'];
  for (const key of required) if (!Array.isArray(candidate[key])) throw codeError('STEP02_CANDIDATE_SECTION_MISSING', key);
  if (!candidate.sourceRows.length) throw codeError('STEP02_SOURCE_ROWS_EMPTY');
  const forbidden = /(speaker_unknown|未知|待确认|见原片|按原片|抽帧图|native frame|以抽帧为准)/i;
  const shots = new Set();
  for (const row of candidate.sourceRows) {
    if (!row.shot_id || shots.has(row.shot_id) || !Number.isFinite(Number(row.source_start_sec)) || !Number.isFinite(Number(row.source_end_sec)) || Number(row.source_start_sec) < 0 || Number(row.source_end_sec) <= Number(row.source_start_sec) || Number(row.source_end_sec) > authority.source_media_contract.visual_duration_seconds + 0.001 || !String(row.visual_composition || '').trim() || !String(row.blocking_movement || '').trim() || forbidden.test(JSON.stringify(row))) throw codeError('STEP02_SOURCE_ROW_INVALID', String(row.shot_id || 'missing'));
    shots.add(row.shot_id);
  }
  const dialogueIds = new Set();
  for (const line of candidate.dialogueBindings) {
    if (!line.dialogue_id || dialogueIds.has(line.dialogue_id) || !shots.has(line.onset_shot) || !shots.has(line.best_evidence_shot) || !String(line.source_speaker || '').trim() || !String(line.source_text || '').trim() || forbidden.test(JSON.stringify(line)) || !Number.isFinite(Number(line.source_start_sec)) || !Number.isFinite(Number(line.source_end_sec)) || Number(line.source_start_sec) < 0 || Number(line.source_end_sec) <= Number(line.source_start_sec) || Number(line.source_end_sec) > authority.source_media_contract.duration_seconds + 0.001 || !Array.isArray(line.evidence_basis) || !line.evidence_basis.length || !['onscreen_mouth','offscreen_voice','phone_voice','subtitle_only','asr_only','background_voice'].includes(line.speaker_attribution_status)) throw codeError('STEP02_DIALOGUE_BINDING_INVALID', String(line.dialogue_id || 'missing'));
    dialogueIds.add(line.dialogue_id);
  }
  if (accepted && candidate.blockers.length) throw codeError('STEP02_CANDIDATE_BLOCKERS_PRESENT');
  return true;
}

function candidateSemanticSha(candidate) {
  const consumed = {sourceRows:candidate.sourceRows,dialogueBindings:candidate.dialogueBindings,visualFactCards:candidate.visualFactCards,textEvidence:candidate.textEvidence,assetCandidates:candidate.assetCandidates,hardSceneCandidates:candidate.hardSceneCandidates,rejectedEvidence:candidate.rejectedEvidence,source_media_contract:candidate.source_media_contract};
  return sha256(Buffer.from(JSON.stringify(consumed)));
}

async function writeReturnPackage({project,jobRoot,candidate,turnId,now,testOnly,fixtureEvidence,completionProvenance}) {
  const root = step02Root(jobRoot);
  const dispatchEvidence = await evidence(path.join(root, 'step02_employee_dispatch.json'));
  const authorityEvidence = await evidence(path.join(root, 'upstream_authority_snapshot.json'));
  const dispatch = dispatchEvidence.json;
  const authority = authorityEvidence.json;
  const boundCandidate = {...candidate,test_only:testOnly,fixture_evidence:fixtureEvidence};
  validateCandidate(boundCandidate, authority);
  if (boundCandidate.transaction_id !== dispatch.transaction_id || boundCandidate.dispatch_id !== dispatch.dispatch_id || boundCandidate.phase_key !== dispatch.phase_key) throw codeError('STEP02_CANDIDATE_DISPATCH_BINDING_INVALID');
  const returnRoot = path.join(root, 'returns', dispatch.phase_key);
  await fsp.mkdir(returnRoot, {recursive:true});
  await atomicJson(path.join(returnRoot, 'step02_source_truth_candidate.json'), boundCandidate);
  const candidateEvidence = await evidence(path.join(returnRoot, 'step02_source_truth_candidate.json'));
  const completion = {method:'turn/completed',thread_id:dispatch.employee.thread_id,turn_id:turnId,status:'completed',error:null};
  const receipt = {schema_version:SCHEMAS.receipt,status:'candidate',downstream_consumable:false,transaction_id:dispatch.transaction_id,dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,project_id:project.id,job_id:dispatch.job_id,source_sha256:dispatch.source_sha256,rights_authority_sha256:dispatch.rights_authority_sha256,step01_manifest_sha256:dispatch.step01_manifest_sha256,upstream_authority_sha256:dispatch.upstream_authority_sha256,settings_version:dispatch.settings_version,employee:dispatch.employee,completion_event:completion,completion_provenance:completionProvenance,candidate:{relative_path:'step02_source_truth_candidate.json',sha256:candidateEvidence.sha256,bytes:candidateEvidence.bytes},test_only:testOnly,fixture_evidence:fixtureEvidence,...falseEffects(),created_at:now};
  const control = {schema_version:SCHEMAS.control,status:'completed_candidate_only',transaction_id:dispatch.transaction_id,dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,project_id:project.id,job_id:dispatch.job_id,source_sha256:dispatch.source_sha256,rights_authority_sha256:dispatch.rights_authority_sha256,step01_manifest_sha256:dispatch.step01_manifest_sha256,upstream_authority_sha256:dispatch.upstream_authority_sha256,settings_version:dispatch.settings_version,employee:dispatch.employee,completion_event:completion,completion_provenance:completionProvenance,app_server_sequence:{thread_read_before_start:false,turn_start:false,turn_completed:true,thread_readback:false},cli_fallback_used:false,ephemeral_thread_used:false,provider_used:false,test_only:testOnly,fixture_evidence:fixtureEvidence,...falseEffects(),created_at:now};
  await atomicJson(path.join(returnRoot, 'step02_employee_receipt.json'), receipt);
  await atomicJson(path.join(returnRoot, 'step02_control_receipt.json'), control);
  const pointers = [];
  for (const relativePath of ['step02_source_truth_candidate.json','step02_employee_receipt.json','step02_control_receipt.json']) {
    const item = await evidence(path.join(returnRoot, relativePath));
    pointers.push({relative_path:relativePath,sha256:item.sha256,bytes:item.bytes});
  }
  const manifest = {schema_version:SCHEMAS.returnManifest,status:'candidate_return_ready',transaction_id:dispatch.transaction_id,dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,project_id:project.id,job_id:dispatch.job_id,source_sha256:dispatch.source_sha256,rights_authority_sha256:dispatch.rights_authority_sha256,step01_manifest_sha256:dispatch.step01_manifest_sha256,upstream_authority_sha256:dispatch.upstream_authority_sha256,settings_version:dispatch.settings_version,employee:dispatch.employee,completion_provenance:completionProvenance,files:pointers,downstream_consumable:false,test_only:testOnly,fixture_evidence:fixtureEvidence,...falseEffects(),created_at:now};
  await atomicJson(path.join(returnRoot, 'step02_return_manifest.json'), manifest);
  return {returnRoot,manifest,evidence:await evidence(path.join(returnRoot, 'step02_return_manifest.json'))};
}

async function writeFakeReturn({project,jobRoot,candidate,turnId = 'fake-step02-turn',now = new Date().toISOString()}) {
  if (process.env.NIANNIAN_STEP02_FAKE_TRANSPORT !== 'on') throw codeError('STEP02_FAKE_TRANSPORT_DISABLED');
  return writeReturnPackage({project,jobRoot,candidate,turnId,now,testOnly:true,fixtureEvidence:true,completionProvenance:'fake_transport'});
}

async function writeSignedFixtureReturn({project,jobRoot,candidate,turnId = 'signed-fixed-app-fixture-turn',now = new Date().toISOString()}) {
  if (process.env.NIANNIAN_STEP02_SIGNED_FIXTURE !== 'on') throw codeError('STEP02_SIGNED_FIXTURE_DISABLED');
  return writeReturnPackage({project,jobRoot,candidate,turnId,now,testOnly:false,fixtureEvidence:true,completionProvenance:'signed_fixture'});
}

async function reconcileReturn({project,jobRoot,returnRoot,now = new Date().toISOString()}) {
  const root = step02Root(jobRoot);
  const freshUpstream = await validateUpstream(project, jobRoot);
  if (!inside(root, returnRoot)) throw codeError('STEP02_RETURN_ROOT_OUTSIDE_TRANSACTION');
  const dispatchEvidence = await evidence(path.join(root, 'step02_employee_dispatch.json'));
  const authorityEvidence = await evidence(path.join(root, 'upstream_authority_snapshot.json'));
  const manifestEvidence = await evidence(path.join(returnRoot, 'step02_return_manifest.json'));
  const dispatch = dispatchEvidence.json;
  const authority = authorityEvidence.json;
  const manifest = manifestEvidence.json;
  if (manifest.schema_version !== SCHEMAS.returnManifest || manifest.status !== 'candidate_return_ready' || manifest.downstream_consumable !== false || manifest.project_id !== project.id || manifest.transaction_id !== dispatch.transaction_id || manifest.dispatch_id !== dispatch.dispatch_id || manifest.phase_key !== dispatch.phase_key || manifest.source_sha256 !== dispatch.source_sha256 || manifest.rights_authority_sha256 !== dispatch.rights_authority_sha256 || manifest.rights_authority_sha256 !== freshUpstream.rights.sha256 || manifest.step01_manifest_sha256 !== dispatch.step01_manifest_sha256 || manifest.step01_manifest_sha256 !== freshUpstream.step01.manifest.sha256 || manifest.upstream_authority_sha256 !== authorityEvidence.sha256 || Number(manifest.settings_version) !== Number(dispatch.settings_version) || manifest.employee?.thread_id !== dispatch.employee.thread_id || !Array.isArray(manifest.files) || ![3,5].includes(manifest.files.length)) throw codeError('STEP02_RETURN_MANIFEST_INVALID');
  assertFalseEffects(manifest);
  const files = new Map();
  for (const pointer of manifest.files) {
    const relative = safeRelative(pointer.relative_path);
    const item = await evidence(path.join(returnRoot, relative));
    if (item.sha256 !== pointer.sha256 || item.bytes !== pointer.bytes) throw codeError('STEP02_RETURN_FILE_TAMPERED', relative);
    files.set(relative, item);
  }
  const candidate = files.get('step02_source_truth_candidate.json')?.json;
  const receipt = files.get('step02_employee_receipt.json')?.json;
  const control = files.get('step02_control_receipt.json')?.json;
  const appAudit = files.get('step02_app_server_audit.json')?.json;
  const appResponse = files.get('step02_app_server_response.json')?.json;
  validateCandidate(candidate, authority);
  if (receipt?.schema_version !== SCHEMAS.receipt || receipt.status !== 'candidate' || receipt.downstream_consumable !== false || receipt.project_id !== project.id || receipt.dispatch_id !== dispatch.dispatch_id || receipt.phase_key !== dispatch.phase_key || receipt.candidate?.sha256 !== files.get('step02_source_truth_candidate.json').sha256 || receipt.completion_event?.status !== 'completed' || receipt.completion_event?.error !== null || receipt.employee?.thread_id !== dispatch.employee.thread_id) throw codeError('STEP02_EMPLOYEE_RECEIPT_INVALID');
  if (control?.schema_version !== SCHEMAS.control || control.status !== 'completed_candidate_only' || control.project_id !== project.id || control.dispatch_id !== dispatch.dispatch_id || control.phase_key !== dispatch.phase_key || control.completion_event?.turn_id !== receipt.completion_event.turn_id || control.completion_event?.status !== 'completed' || control.cli_fallback_used !== false || control.ephemeral_thread_used !== false || control.provider_used !== false) throw codeError('STEP02_CONTROL_RECEIPT_INVALID');
  assertFalseEffects(receipt); assertFalseEffects(control);
  if (manifest.completion_provenance === 'fixed_mac_app_server_readback_v1') {
    const auditEvidence = files.get('step02_app_server_audit.json');
    const responseEvidence = files.get('step02_app_server_response.json');
    const responseBytes = Buffer.from(String(appResponse?.text || ''), 'utf8');
    if (!auditEvidence || !responseEvidence || appResponse?.schema_version !== 'niannian_redraw_step02_app_server_response_v1' || appResponse.sha256 !== sha256(responseBytes) || appResponse.bytes !== responseBytes.length || appAudit?.schema_version !== SCHEMAS.appAudit || appAudit.status !== 'completed_readback_verified' || appAudit.project_id !== project.id || appAudit.dispatch_id !== dispatch.dispatch_id || appAudit.phase_key !== dispatch.phase_key || appAudit.employee_thread_id !== dispatch.employee.thread_id || appAudit.completion_event?.turn_id !== receipt.completion_event.turn_id || appAudit.thread_readback?.exact_turn_id !== receipt.completion_event.turn_id || appAudit.thread_readback?.exact_turn_status!=='completed' || appAudit.thread_readback?.exact_turn_error!==null || appAudit.thread_readback?.exact_turn_assistant_message_count!==1 || appAudit.assistant_response?.sha256 !== appResponse.sha256 || appAudit.assistant_response?.bytes !== appResponse.bytes || appAudit.assistant_response?.evidence_sha256 !== responseEvidence.sha256) throw codeError('STEP02_APP_AUDIT_INVALID');
    assertFalseEffects(appAudit);
  }
  const importRoot = path.join(root, 'imported', dispatch.phase_key);
  if (!fs.existsSync(importRoot)) {
    const staging = importRoot + '.staging-' + crypto.randomBytes(4).toString('hex');
    await fsp.mkdir(staging, {recursive:true});
    try {
      for (const pointer of manifest.files) await fsp.copyFile(path.join(returnRoot, safeRelative(pointer.relative_path)), path.join(staging, safeRelative(pointer.relative_path)));
      await fsp.copyFile(path.join(returnRoot, 'step02_return_manifest.json'), path.join(staging, 'step02_return_manifest.json'));
      await fsp.mkdir(path.dirname(importRoot), {recursive:true});
      await fsp.rename(staging, importRoot);
    } catch (error) { await fsp.rm(staging, {recursive:true,force:true}); throw error; }
  }
  const importedManifest = await evidence(path.join(importRoot, 'step02_return_manifest.json'));
  if (importedManifest.sha256 !== manifestEvidence.sha256) throw codeError('STEP02_IMPORTED_MANIFEST_MISMATCH');
  await appendEventOnce(path.join(root, 'evidence_events.jsonl'), {event_id:stableId(dispatch.transaction_id, 'return', manifestEvidence.sha256),type:'step02_return_reconciled',node_id:'Step02',transaction_id:dispatch.transaction_id,project_id:project.id,dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,return_manifest_sha256:manifestEvidence.sha256,candidate_sha256:files.get('step02_source_truth_candidate.json').sha256,employee_receipt_sha256:files.get('step02_employee_receipt.json').sha256,control_receipt_sha256:files.get('step02_control_receipt.json').sha256,at:now});
  await reduceStep02({project,jobRoot});
  return loadReview({project,jobRoot});
}

async function inspectAcceptanceCandidate({project,jobRoot}) {
  const root = step02Root(jobRoot);
  const transaction = await readJson(path.join(root, 'transaction_intent.json'));
  const dispatch = await readJson(path.join(root, 'step02_employee_dispatch.json'));
  const authority = await readJson(path.join(root, 'upstream_authority_snapshot.json'));
  const importRoot = path.join(root, 'imported', dispatch.phase_key);
  const [candidateEvidence,receiptEvidence,controlEvidence,returnEvidence] = await Promise.all(['step02_source_truth_candidate.json','step02_employee_receipt.json','step02_control_receipt.json','step02_return_manifest.json'].map(name => evidence(path.join(importRoot, name))));
  validateCandidate(candidateEvidence.json, authority, {accepted:true});
  const testOnly = [transaction,dispatch,candidateEvidence.json,receiptEvidence.json,controlEvidence.json,returnEvidence.json].some(item => item.test_only !== false);
  const fixtureEvidence = [candidateEvidence.json,receiptEvidence.json,controlEvidence.json,returnEvidence.json].some(item => item.fixture_evidence === true);
  return {status:testOnly?'test_only_non_promotable':fixtureEvidence?'fixture_valid_non_promotable':'promotable',promotable:!testOnly&&!fixtureEvidence,test_only:testOnly,fixture_evidence:fixtureEvidence,project_id:project.id,transaction_id:transaction.transaction_id,dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,candidate_sha256:candidateEvidence.sha256,candidate_semantic_sha256:candidateSemanticSha(candidateEvidence.json),employee_receipt_sha256:receiptEvidence.sha256,control_receipt_sha256:controlEvidence.sha256,return_manifest_sha256:returnEvidence.sha256,...falseEffects()};
}

async function acceptCandidate({project,jobRoot,ownerId,decision = 'accept',now = new Date().toISOString(),crashAfterEvents = false}) {
  if (ownerId !== project.ownerId) throw codeError('STEP02_OWNER_SCOPE_INVALID');
  if (decision !== 'accept') throw codeError('STEP02_ACCEPT_DECISION_REQUIRED');
  const freshUpstream = await validateUpstream(project, jobRoot);
  const root = step02Root(jobRoot);
  const transaction = await readJson(path.join(root, 'transaction_intent.json'));
  const authorityEvidence = await evidence(path.join(root, 'upstream_authority_snapshot.json'));
  const authority = authorityEvidence.json;
  const dispatch = await readJson(path.join(root, 'step02_employee_dispatch.json'));
  const importRoot = path.join(root, 'imported', dispatch.phase_key);
  const [candidateEvidence,receiptEvidence,controlEvidence,returnEvidence] = await Promise.all(['step02_source_truth_candidate.json','step02_employee_receipt.json','step02_control_receipt.json','step02_return_manifest.json'].map(name => evidence(path.join(importRoot, name))));
  validateCandidate(candidateEvidence.json, authority, {accepted:true});
  if (authority.rights_authority.sha256 !== freshUpstream.rights.sha256 || authority.step01.manifest.sha256 !== freshUpstream.step01.manifest.sha256 || authority.source.sha256 !== freshUpstream.source.sha256 || Number(authority.settings_version) !== Number(freshUpstream.settings_version)) throw codeError('STEP02_UPSTREAM_AUTHORITY_STALE');
  const receipt = receiptEvidence.json, control = controlEvidence.json, returnManifest = returnEvidence.json;
  if (receipt.schema_version !== SCHEMAS.receipt || receipt.status !== 'candidate' || receipt.downstream_consumable !== false || receipt.project_id !== project.id || receipt.transaction_id !== transaction.transaction_id || receipt.dispatch_id !== dispatch.dispatch_id || receipt.phase_key !== dispatch.phase_key || receipt.source_sha256 !== freshUpstream.source.sha256 || receipt.rights_authority_sha256 !== freshUpstream.rights.sha256 || receipt.step01_manifest_sha256 !== freshUpstream.step01.manifest.sha256 || receipt.candidate?.sha256 !== candidateEvidence.sha256 || receipt.completion_event?.status !== 'completed' || receipt.completion_event?.error !== null || receipt.employee?.thread_id !== dispatch.employee.thread_id) throw codeError('STEP02_ACCEPT_RECEIPT_INVALID');
  if (control.schema_version !== SCHEMAS.control || control.status !== 'completed_candidate_only' || control.project_id !== project.id || control.transaction_id !== transaction.transaction_id || control.dispatch_id !== dispatch.dispatch_id || control.phase_key !== dispatch.phase_key || control.source_sha256 !== freshUpstream.source.sha256 || control.rights_authority_sha256 !== freshUpstream.rights.sha256 || control.step01_manifest_sha256 !== freshUpstream.step01.manifest.sha256 || control.completion_event?.turn_id !== receipt.completion_event.turn_id || control.completion_event?.status !== 'completed' || control.completion_event?.error !== null || control.employee?.thread_id !== dispatch.employee.thread_id || control.cli_fallback_used !== false || control.ephemeral_thread_used !== false || control.provider_used !== false) throw codeError('STEP02_ACCEPT_CONTROL_INVALID');
  const pointerMap = new Map((returnManifest.files || []).map(item => [item.relative_path,item]));
  if (returnManifest.schema_version !== SCHEMAS.returnManifest || returnManifest.status !== 'candidate_return_ready' || returnManifest.downstream_consumable !== false || returnManifest.project_id !== project.id || returnManifest.transaction_id !== transaction.transaction_id || returnManifest.dispatch_id !== dispatch.dispatch_id || returnManifest.phase_key !== dispatch.phase_key || returnManifest.source_sha256 !== freshUpstream.source.sha256 || returnManifest.rights_authority_sha256 !== freshUpstream.rights.sha256 || returnManifest.step01_manifest_sha256 !== freshUpstream.step01.manifest.sha256 || pointerMap.get('step02_source_truth_candidate.json')?.sha256 !== candidateEvidence.sha256 || pointerMap.get('step02_employee_receipt.json')?.sha256 !== receiptEvidence.sha256 || pointerMap.get('step02_control_receipt.json')?.sha256 !== controlEvidence.sha256) throw codeError('STEP02_ACCEPT_RETURN_MANIFEST_INVALID');
  if (transaction.test_only !== false || dispatch.test_only !== false || candidateEvidence.json.test_only !== false || receiptEvidence.json.test_only !== false || controlEvidence.json.test_only !== false || returnEvidence.json.test_only !== false) throw codeError('STEP02_TEST_ONLY_CANDIDATE_NOT_ACCEPTABLE');
  if (candidateEvidence.json.fixture_evidence === true || receiptEvidence.json.fixture_evidence === true || controlEvidence.json.fixture_evidence === true || returnEvidence.json.fixture_evidence === true) throw codeError('STEP02_FIXTURE_CANDIDATE_NOT_ACCEPTABLE');
  const [auditEvidence,carrierEvidence] = await Promise.all([evidence(path.join(importRoot, 'step02_app_server_audit.json')),evidence(path.join(importRoot, 'step02_windows_carrier_receipt.json'))]);
  const audit = auditEvidence.json, carrier = carrierEvidence.json;
  if (receiptEvidence.json.completion_provenance !== 'fixed_mac_app_server_readback_v1' || controlEvidence.json.completion_provenance !== 'fixed_mac_app_server_readback_v1' || returnEvidence.json.completion_provenance !== 'fixed_mac_app_server_readback_v1' || controlEvidence.json.app_server_sequence?.thread_read_before_start !== true || controlEvidence.json.app_server_sequence?.turn_start !== true || controlEvidence.json.app_server_sequence?.turn_completed !== true || controlEvidence.json.app_server_sequence?.thread_readback !== true) throw codeError('STEP02_APP_COMPLETION_PROVENANCE_INVALID');
  if (audit.schema_version !== SCHEMAS.appAudit || audit.status !== 'completed_readback_verified' || audit.project_id !== project.id || audit.dispatch_id !== dispatch.dispatch_id || audit.phase_key !== dispatch.phase_key || audit.employee_thread_id !== dispatch.employee.thread_id || audit.completion_event?.turn_id !== receiptEvidence.json.completion_event.turn_id || audit.thread_readback?.exact_turn_id !== receiptEvidence.json.completion_event.turn_id || audit.thread_readback?.exact_turn_status!=='completed' || audit.thread_readback?.exact_turn_error!==null || audit.thread_readback?.exact_turn_assistant_message_count!==1 || audit.candidate?.sha256 !== candidateEvidence.sha256 || audit.employee_receipt?.sha256 !== receiptEvidence.sha256 || audit.control_receipt?.sha256 !== controlEvidence.sha256 || audit.runtime_governance?.bundle_id!=='niannian-mac-production-skills-v2' || audit.runtime_governance?.test_only_runtime!==false || !Array.isArray(audit.runtime_governance?.skills) || audit.runtime_governance.skills.length!==2 || audit.employee_model_channel?.used!==true || audit.employee_model_channel?.network_used!==true || audit.employee_model_channel?.media_provider_authority_granted!==false) throw codeError('STEP02_APP_AUDIT_INVALID');
  if (carrier.schema_version !== SCHEMAS.carrier || carrier.status !== 'windows_return_import_verified' || carrier.test_only !== false || carrier.fixture_evidence !== false || carrier.project_id !== project.id || carrier.transaction_id !== transaction.transaction_id || carrier.dispatch_id !== dispatch.dispatch_id || carrier.phase_key !== dispatch.phase_key || carrier.owner_action_event_id !== dispatch.owner_action_event_id || carrier.employee_thread_id !== dispatch.employee.thread_id || carrier.turn_id !== receiptEvidence.json.completion_event.turn_id || carrier.app_server_audit?.sha256 !== auditEvidence.sha256 || carrier.return_manifest?.sha256 !== returnEvidence.sha256 || carrier.candidate?.sha256 !== candidateEvidence.sha256 || carrier.employee_receipt?.sha256 !== receiptEvidence.sha256 || carrier.control_receipt?.sha256 !== controlEvidence.sha256 || carrier.source_sha256 !== freshUpstream.source.sha256 || carrier.rights_authority_sha256 !== freshUpstream.rights.sha256 || carrier.step01_manifest_sha256 !== freshUpstream.step01.manifest.sha256 || carrier.runtime_governance?.governance_sha256!==audit.runtime_governance.governance_sha256 || carrier.employee_model_channel?.used!==true || carrier.employee_model_channel?.media_provider_authority_granted!==false) throw codeError('STEP02_WINDOWS_CARRIER_RECEIPT_INVALID');
  for (const value of [audit,carrier]) assertFalseEffects(value);
  const semanticSha = candidateSemanticSha(candidateEvidence.json);
  const acceptancePath = path.join(root, 'step02_acceptance_manifest.json');
  let acceptance;
  if (fs.existsSync(acceptancePath)) {
    acceptance = await readJson(acceptancePath);
  } else {
    acceptance = {schema_version:SCHEMAS.acceptance,status:'accepted',downstream_consumable:true,test_only:false,fixture_evidence:false,transaction_id:transaction.transaction_id,project_id:project.id,job_id:transaction.job_id,owner_id:ownerId,source_sha256:authority.source.sha256,source_bytes:authority.source.bytes,rights_authority_sha256:authority.rights_authority.sha256,step01_manifest_sha256:authority.step01.manifest.sha256,upstream_authority_sha256:authorityEvidence.sha256,settings_version:authority.settings_version,dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,owner_action_event_id:dispatch.owner_action_event_id,employee_thread_id:dispatch.employee.thread_id,turn_id:controlEvidence.json.completion_event.turn_id,return_manifest_sha256:returnEvidence.sha256,app_server_audit_sha256:auditEvidence.sha256,windows_carrier_receipt_sha256:carrierEvidence.sha256,candidate:{exact_path:candidateEvidence.exact_path,sha256:candidateEvidence.sha256,bytes:candidateEvidence.bytes,semantic_sha256:semanticSha},employee_receipt_sha256:receiptEvidence.sha256,control_receipt_sha256:controlEvidence.sha256,accepted_sections:{sourceRows:candidateEvidence.json.sourceRows.length,dialogueBindings:candidateEvidence.json.dialogueBindings.length,visualFactCards:candidateEvidence.json.visualFactCards.length,textEvidence:candidateEvidence.json.textEvidence.length,assetCandidates:candidateEvidence.json.assetCandidates.length,hardSceneCandidates:candidateEvidence.json.hardSceneCandidates.length,rejectedEvidence:candidateEvidence.json.rejectedEvidence.length},step04_ready:true,step04_authority:{required_acceptance_sha256:'self'},...falseEffects(),accepted_at:now};
    await atomicJson(acceptancePath, acceptance);
  }
  const acceptanceEvidence = await evidence(acceptancePath);
  if (acceptance.schema_version !== SCHEMAS.acceptance || acceptance.status !== 'accepted' || acceptance.downstream_consumable !== true || acceptance.project_id !== project.id || acceptance.owner_id !== project.ownerId || acceptance.source_sha256 !== project.source.sha256 || acceptance.step01_manifest_sha256 !== authority.step01.manifest.sha256 || acceptance.upstream_authority_sha256 !== authorityEvidence.sha256 || acceptance.candidate?.sha256 !== candidateEvidence.sha256 || acceptance.candidate?.semantic_sha256 !== semanticSha || acceptance.step04_ready !== true) throw codeError('STEP02_ACCEPTANCE_MANIFEST_INVALID');
  assertFalseEffects(acceptance);
  const eventsPath = path.join(root, 'evidence_events.jsonl');
  await appendEventOnce(eventsPath, {event_id:stableId(transaction.transaction_id, 'validator', acceptanceEvidence.sha256),type:'step02_validator_passed',node_id:'Step02',transaction_id:transaction.transaction_id,project_id:project.id,source_sha256:project.source.sha256,step01_manifest_sha256:authority.step01.manifest.sha256,candidate_sha256:candidateEvidence.sha256,candidate_semantic_sha256:semanticSha,acceptance_manifest_sha256:acceptanceEvidence.sha256,at:acceptance.accepted_at});
  await appendEventOnce(eventsPath, {event_id:stableId(transaction.transaction_id, 'paths', acceptanceEvidence.sha256),type:'artifact_paths_verified',node_id:'Step02',transaction_id:transaction.transaction_id,project_id:project.id,acceptance_manifest_sha256:acceptanceEvidence.sha256,paths:[candidateEvidence.exact_path,receiptEvidence.exact_path,controlEvidence.exact_path,returnEvidence.exact_path,acceptanceEvidence.exact_path],at:acceptance.accepted_at});
  await appendEventOnce(eventsPath, {event_id:stableId(transaction.transaction_id, 'accepted', acceptanceEvidence.sha256),type:'step02_accepted',node_id:'Step02',transaction_id:transaction.transaction_id,project_id:project.id,acceptance_manifest_sha256:acceptanceEvidence.sha256,candidate_semantic_sha256:semanticSha,step04_ready:true,at:acceptance.accepted_at});
  if (crashAfterEvents) throw codeError('STEP02_SYNTHETIC_CRASH_AFTER_EVENTS');
  await reduceStep02({project,jobRoot});
  return loadReview({project,jobRoot});
}

async function reduceStep02({project,jobRoot}) {
  const root = step02Root(jobRoot);
  const events = await readEvents(path.join(root, 'evidence_events.jsonl'));
  if (!events.length) throw codeError('STEP02_NO_EVENT_LOG');
  const prepared = events.find(item => item.type === 'step02_prepared' && item.project_id === project.id);
  if (!prepared) throw codeError('STEP02_PREPARED_EVENT_MISSING');
  const dispatch = events.find(item => item.type === 'step02_dispatch_prepared');
  const carrierRunning = events.find(item => item.type === 'step02_carrier_running');
  const carrierBlocked = [...events].reverse().find(item => item.type === 'step02_carrier_blocked');
  const returned = events.find(item => item.type === 'step02_return_reconciled');
  const acceptedEvent = events.find(item => item.type === 'step02_accepted');
  let status = dispatch ? 'dispatch_prepared' : 'prepared';
  if (carrierRunning) status = 'carrier_running';
  if (carrierBlocked) status = carrierBlocked.blocker?.class==='contract'?'step02_blocked_contract':'step02_blocked_resource';
  if (returned) status = 'candidate_return_ready';
  if (acceptedEvent) status = 'step02_accepted';
  let acceptanceEvidence = null;
  if (acceptedEvent) {
    acceptanceEvidence = await evidence(path.join(root, 'step02_acceptance_manifest.json'));
    if (acceptanceEvidence.sha256 !== acceptedEvent.acceptance_manifest_sha256 || acceptanceEvidence.json.status !== 'accepted' || acceptanceEvidence.json.project_id !== project.id) throw codeError('STEP02_REDUCER_ACCEPTANCE_EVIDENCE_INVALID');
  }
  const latestAt = events[events.length - 1].at;
  const reducer = {schema_version:SCHEMAS.reducer,status,project_id:project.id,transaction_id:prepared.transaction_id,event_count:events.length,event_ids:events.map(item => item.event_id),candidate_return_ready:Boolean(returned),accepted:Boolean(acceptedEvent),acceptance_manifest_sha256:acceptanceEvidence?.sha256 || null,step04_ready:Boolean(acceptedEvent),replay_reproducible:true,...falseEffects(),reduced_at:latestAt};
  const reducerPath = path.join(root, 'step02_reducer_receipt.json');
  await atomicJson(reducerPath, reducer);
  const reducerEvidence = await evidence(reducerPath);
  const checkpoint = {schema_version:1,project_id:project.id,transaction_id:prepared.transaction_id,status,current_node:acceptedEvent?'Step04':'Step02',earliest_incomplete_node:acceptedEvent?'Step04':'Step02',completed:acceptedEvent?['Step02 source truth accepted by server reducer']:returned?['Step02 candidate return reconciled']:[],blockers:[],next_skill:acceptedEvent?'mx-shortdrama-04-asset-prompts':'mx-shortdrama-02-source-timeline',next_action:acceptedEvent?'Step04 may consume only the exact Step02 acceptance SHA.':'Review and accept the exact Step02 candidate; employee result is not downstream consumable.',updated_at:latestAt};
  const dashboard = {schema_version:'niannian_redraw_step02_gate_v1',project_id:project.id,transaction_id:prepared.transaction_id,overall_status:status,current_node:checkpoint.current_node,gates:{Step01:{status:'verified',manifest_sha256:prepared.step01_manifest_sha256},Step02:{status:acceptedEvent?'accepted':returned?'candidate_review':'running',acceptance_manifest_sha256:acceptanceEvidence?.sha256 || null},Step04:{status:acceptedEvent?'ready':'blocked_upstream',required_step02_acceptance_sha256:acceptanceEvidence?.sha256 || null},Step05:{status:'blocked_upstream'},media_provider_submit:{status:'blocked_no_authority'},package_send:{status:'blocked'}},updated_at:latestAt};
  const artifacts = [];
  if (returned) artifacts.push({artifact_id:'step02_candidate',node_id:'step02_source_truth',exact_path:path.join(root, 'imported', returned.phase_key, 'step02_source_truth_candidate.json'),sha256:returned.candidate_sha256,status:'candidate',downstream_consumable_by:[]});
  if (acceptanceEvidence) artifacts.push({artifact_id:'step02_acceptance_manifest',node_id:'step02_source_truth',exact_path:acceptanceEvidence.exact_path,sha256:acceptanceEvidence.sha256,bytes:acceptanceEvidence.bytes,status:'verified',downstream_consumable_by:['Step04']});
  const ledger = {schema_version:'artifact_ledger_v1',project_id:project.id,transaction_id:prepared.transaction_id,artifacts,updated_at:latestAt};
  await Promise.all([atomicJson(path.join(root, 'checkpoint.json'), checkpoint),atomicJson(path.join(root, 'gate_dashboard.json'), dashboard),atomicJson(path.join(root, 'artifact_ledger.json'), ledger)]);
  return {reducer,...reducerEvidence};
}

async function verifyAcceptedForProject({project,jobRoot}) {
  const root = step02Root(jobRoot);
  const freshUpstream = await validateUpstream(project, jobRoot);
  const [acceptanceEvidence,reducerEvidence,ledgerEvidence,authorityEvidence] = await Promise.all(['step02_acceptance_manifest.json','step02_reducer_receipt.json','artifact_ledger.json','upstream_authority_snapshot.json'].map(name => evidence(path.join(root, name))));
  const acceptance = acceptanceEvidence.json;
  const reducer = reducerEvidence.json;
  const ledger = ledgerEvidence.json;
  const authority = authorityEvidence.json;
  if (acceptance.schema_version !== SCHEMAS.acceptance || acceptance.status !== 'accepted' || acceptance.downstream_consumable !== true || acceptance.test_only !== false || acceptance.fixture_evidence === true || acceptance.project_id !== project.id || acceptance.owner_id !== project.ownerId || acceptance.source_sha256 !== freshUpstream.source.sha256 || Number(acceptance.source_bytes) !== Number(freshUpstream.source.bytes) || acceptance.rights_authority_sha256 !== freshUpstream.rights.sha256 || acceptance.rights_authority_sha256 !== authority.rights_authority.sha256 || acceptance.step01_manifest_sha256 !== freshUpstream.step01.manifest.sha256 || acceptance.step01_manifest_sha256 !== authority.step01.manifest.sha256 || acceptance.upstream_authority_sha256 !== authorityEvidence.sha256 || Number(acceptance.settings_version) !== Number(freshUpstream.settings_version) || acceptance.step04_ready !== true) throw codeError('STEP02_REDUCER_ACCEPTANCE_REQUIRED');
  assertFalseEffects(acceptance, 'STEP02_REDUCER_ACCEPTANCE_REQUIRED');
  if (reducer.schema_version !== SCHEMAS.reducer || reducer.status !== 'step02_accepted' || reducer.accepted !== true || reducer.step04_ready !== true || reducer.acceptance_manifest_sha256 !== acceptanceEvidence.sha256 || reducer.project_id !== project.id) throw codeError('STEP02_REDUCER_ACCEPTANCE_REQUIRED');
  const artifact = ledger.artifacts?.find(item => item.artifact_id === 'step02_acceptance_manifest');
  if (!artifact || artifact.status !== 'verified' || artifact.sha256 !== acceptanceEvidence.sha256 || !artifact.downstream_consumable_by?.includes('Step04')) throw codeError('STEP02_REDUCER_ACCEPTANCE_REQUIRED');
  const events = await readEvents(path.join(root, 'evidence_events.jsonl'));
  const event = events.find(item => item.type === 'step02_accepted' && item.acceptance_manifest_sha256 === acceptanceEvidence.sha256 && item.project_id === project.id);
  if (!event) throw codeError('STEP02_REDUCER_ACCEPTANCE_REQUIRED');
  return {acceptance,evidence:acceptanceEvidence,reducer,ledger};
}

async function loadReview({project,jobRoot}) {
  const root = step02Root(jobRoot);
  const optional = async name => { try { return await evidence(path.join(root, name)); } catch (error) { if (error.code === 'STEP02_EVIDENCE_MISSING') return null; throw error; } };
  const [transaction,authority,dispatch,reducer,candidate,acceptance] = await Promise.all([
    optional('transaction_intent.json'),optional('upstream_authority_snapshot.json'),optional('step02_employee_dispatch.json'),optional('step02_reducer_receipt.json'),
    (async () => { if (!fs.existsSync(path.join(root, 'step02_employee_dispatch.json'))) return null; const current = await readJson(path.join(root, 'step02_employee_dispatch.json')); return optional(path.join('imported', current.phase_key, 'step02_source_truth_candidate.json')); })(),
    optional('step02_acceptance_manifest.json')
  ]);
  return {status:reducer?.json?.status || transaction?.json?.status || 'not_prepared',project_id:project.id,transaction:transaction?.json || null,authority:authority?{sha256:authority.sha256,source:authority.json.source,rights_authority:authority.json.rights_authority,step01:authority.json.step01,settings_version:authority.json.settings_version,source_media_contract:authority.json.source_media_contract}:null,dispatch:dispatch?.json || null,candidate:candidate?.json || null,acceptance:acceptance?{...acceptance.json,sha256:acceptance.sha256,bytes:acceptance.bytes}:null,reducer:reducer?.json || null,step04_ready:reducer?.json?.step04_ready === true,...falseEffects()};
}

module.exports = {DOWNSTREAM_STEP02_STATUSES,EFFECTS,SCHEMAS,acceptCandidate,appendEventOnce,assertFalseEffects,binaryEvidence,candidateSemanticSha,codeError,evidence,falseEffects,inspectAcceptanceCandidate,loadReview,markCarrierBlocked,markCarrierRunning,prepareDispatch,prepareStep02,reconcileReturn,reduceStep02,safeRelative,statusRequiresStep02Acceptance,stableId,validateCandidate,validateUpstream,verifyAcceptedForProject,writeFakeReturn,writeSignedFixtureReturn};
