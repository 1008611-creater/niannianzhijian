'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const {AppServerClient,CODEX_PATH,PROJECT_ROOT,THREADS,assertCompletedTurn,hasActiveTurn,summarizeThread} = require('./mac_codex_app_employee_bootstrap');
const step02 = require('./niannian_redraw_step02_vertical');

const MAC_PROJECT = '/Users/lsb/AI-Brain/niannian-ai-canonical-local';
const AUDIT_SCHEMA = 'niannian_redraw_step02_app_server_audit_v1';
const JOURNAL_SCHEMA = 'niannian_redraw_step02_app_turn_journal_v1';
const LEASE_SCHEMA = 'niannian_redraw_step02_app_turn_lease_v1';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

async function readJson(filePath) { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temp = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
  await fsp.rename(temp, filePath);
}
async function fileEvidence(filePath) {
  const stats = await fsp.lstat(filePath).catch(() => null);
  if (!stats || !stats.isFile() || stats.isSymbolicLink()) throw step02.codeError('STEP02_APP_EVIDENCE_NOT_REGULAR');
  const bytes = await fsp.readFile(filePath);
  return {exact_path:path.resolve(filePath),sha256:sha256(bytes),bytes:bytes.length};
}
function employeeForDispatch(dispatch) {
  const employee = THREADS.find(item => item.thread_id === dispatch.employee?.thread_id && item.employee === dispatch.employee?.employee && item.title === dispatch.employee?.title);
  if (!employee || dispatch.employee?.project_root !== MAC_PROJECT) throw step02.codeError('STEP02_APP_FIXED_EMPLOYEE_INVALID');
  return employee;
}
function validateDispatch(dispatch, authority) {
  const allowed = ['step02_source_truth_candidate.json','step02_employee_receipt.json','step02_control_receipt.json','step02_app_server_audit.json','step02_app_server_response.json','step02_return_manifest.json'];
  if (dispatch.schema_version !== step02.SCHEMAS.dispatch || dispatch.status !== 'prepared' || dispatch.test_only !== false || dispatch.execution_mode !== 'fixed_existing_mac_app_candidate_only' || dispatch.project_id !== authority.project_id || dispatch.owner_id !== authority.owner_id || dispatch.source_sha256 !== authority.source.sha256 || dispatch.rights_authority_sha256 !== authority.rights_authority.sha256 || dispatch.step01_manifest_sha256 !== authority.step01.manifest.sha256 || dispatch.upstream_authority_sha256 !== authority.sha256 || Number(dispatch.settings_version) !== Number(authority.settings_version) || dispatch.transport?.fixed_app_required !== true || dispatch.transport?.thread_read_before_start !== true || dispatch.transport?.active_turn_reject !== true || dispatch.transport?.cli_fallback_allowed !== false || dispatch.transport?.ephemeral_thread_allowed !== false || dispatch.transport?.legacy_latest_lookup_allowed !== false || !dispatch.owner_action_event_id || JSON.stringify(dispatch.allowed_write_paths) !== JSON.stringify(allowed)) throw step02.codeError('STEP02_APP_DISPATCH_INVALID');
  step02.assertFalseEffects(dispatch);
  return employeeForDispatch(dispatch);
}
function exactJsonResponse(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(raw); } catch { throw step02.codeError('STEP02_APP_CANDIDATE_RESPONSE_JSON_INVALID'); }
}
function prompt(dispatch, authority) {
  const allowed = Array.isArray(dispatch.allowed_write_paths) ? dispatch.allowed_write_paths : [];
  return [
    '你是固定 Mac Codex Desktop App Step02 员工。此回合只返回 source truth candidate JSON，不写文件、不调用命令行。',
    `project_id=${dispatch.project_id}`,
    `job_id=${dispatch.job_id}`,
    `transaction_id=${dispatch.transaction_id}`,
    `dispatch_id=${dispatch.dispatch_id}`,
    `phase_key=${dispatch.phase_key}`,
    `source_sha256=${dispatch.source_sha256}`,
    `source_bytes=${authority.source.bytes}`,
    `rights_authority_sha256=${dispatch.rights_authority_sha256}`,
    `step01_manifest_sha256=${dispatch.step01_manifest_sha256}`,
    `settings_version=${dispatch.settings_version}`,
    'route=mx-shortdrama-00-router -> mx-shortdrama-02-source-timeline',
    'employee_model_channel=krill_codex_custom_provider_v1; used=true; media_provider_authority_granted=false',
    'portable_step01_evidence_index=step02_portable_evidence_index.json',
    `allowed_write_paths=${JSON.stringify(allowed)}`,
    '只消费 dispatch 指向的 exact portable Step01 evidence；禁止 old/latest/15秒项目、CLI、ephemeral thread、SSH employee、Provider、上传、提交、费用、package/send、部署、本地修图。',
    '输出必须是单个 JSON 对象：schema niannian_redraw_step02_source_truth_candidate_v1，status=candidate，downstream_consumable=false，test_only=false，fixture_evidence=false；包含 sourceRows/dialogueBindings/visualFactCards/textEvidence/assetCandidates/hardSceneCandidates/rejectedEvidence/blockers 与全部 false side effects。',
    '任何说话人、原文、时间、视觉事实无法解决时写入 blockers；不得使用 speaker_unknown/未知/待确认/按原片/见原片等 placeholder，不得自行宣称 accepted 或 Step04 ready。'
  ].join('\n');
}
async function validateRuntimeGovernance(workspace, options = {}) {
  const governancePath=path.join(workspace,'step02_runtime_governance.json'),governance=await readJson(governancePath),governanceEvidence=await fileEvidence(governancePath);
  if(governance.schema_version!=='niannian_redraw_step02_runtime_governance_v1'||governance.status!=='verified'||governance.bundle_id!=='niannian-mac-production-skills-v2'||governance.managed_skills!==13||governance.managed_file_count!==127||governance.unmanaged_preserved!==true||governance.employee_model_channel?.channel_id!=='krill_codex_custom_provider_v1'||governance.employee_model_channel?.used!==true||governance.employee_model_channel?.network_used!==true||governance.employee_model_channel?.media_provider_authority_granted!==false||!Array.isArray(governance.skills)||governance.skills.length!==2)throw step02.codeError('STEP02_APP_RUNTIME_GOVERNANCE_INVALID');
  const receiptRows={};for(const [key,item] of Object.entries(governance.receipts||{})){const relative=step02.safeRelative(item.relative_path),actual=await fileEvidence(path.join(workspace,relative));if(actual.sha256!==item.sha256||actual.bytes!==item.bytes)throw step02.codeError('STEP02_APP_RUNTIME_RECEIPT_TAMPERED');receiptRows[key]={...actual,relative_path:relative};}
  const [install,parity,adoption]=await Promise.all(['install','parity','adoption'].map(key=>readJson(path.join(workspace,receiptRows[key].relative_path))));
  if(install.schema_version!=='niannian_mac_skill_bundle_install_receipt_v2'||install.status!=='installed_verified'||parity.schema_version!=='niannian_mac_skill_bundle_parity_receipt_v2'||parity.status!=='exact_parity_verified'||adoption.schema_version!=='niannian_mac_employee_v2_adoption_manifest_v1'||adoption.status!=='verified'||adoption.bindings?.install_receipt_sha256!==receiptRows.install.sha256||adoption.bindings?.parity_receipt_sha256!==receiptRows.parity.sha256||adoption.employee_model_channel?.used!==true||adoption.employee_model_channel?.network_used!==true||adoption.employee_model_channel?.media_provider_authority_granted!==false)throw step02.codeError('STEP02_APP_RUNTIME_RECEIPT_BINDING_INVALID');
  const defaultRoot='/Users/lsb/.codex/skills',testMode=options.testMode===true;let skillRoot=defaultRoot;
  if(options.skillRoot){if(!testMode)throw step02.codeError('STEP02_APP_RUNTIME_ROOT_OVERRIDE_FORBIDDEN');skillRoot=path.resolve(options.skillRoot);}
  const skills=[];for(const item of governance.skills){const relative=step02.safeRelative(item.relative_path),expectedMac=defaultRoot+'/'+relative;if(item.mac_exact_path!==expectedMac)throw step02.codeError('STEP02_APP_RUNTIME_SKILL_PATH_INVALID');const actual=await fileEvidence(path.join(skillRoot,...relative.split('/')));if(actual.sha256!==item.sha256||actual.bytes!==item.bytes)throw step02.codeError('STEP02_APP_RUNTIME_SKILL_TAMPERED');skills.push({relative_path:relative,mac_exact_path:expectedMac,sha256:actual.sha256,bytes:actual.bytes});}
  return {schema_version:governance.schema_version,governance_sha256:governanceEvidence.sha256,governance_bytes:governanceEvidence.bytes,bundle_id:governance.bundle_id,bundle_manifest_sha256:governance.bundle_manifest_sha256,install_receipt_sha256:receiptRows.install.sha256,parity_receipt_sha256:receiptRows.parity.sha256,adoption_manifest_sha256:receiptRows.adoption.sha256,skills,employee_model_channel:{channel_id:'krill_codex_custom_provider_v1',used:true,network_used:true,media_provider_authority_granted:false},test_only_runtime:skillRoot!==defaultRoot};
}
async function validatePortableEvidence(workspace, dispatch) {
  const indexPath = path.join(workspace, 'step02_portable_evidence_index.json');
  const index = await readJson(indexPath);
  if (index.schema_version !== 'niannian_redraw_step02_portable_evidence_index_v1' || index.status !== 'verified' || index.project_id !== dispatch.project_id || index.transaction_id !== dispatch.transaction_id || index.source_sha256 !== dispatch.source_sha256 || index.step01_manifest_sha256 !== dispatch.step01_manifest_sha256 || !Array.isArray(index.entries) || !index.entries.length || index.entries.length !== index.artifact_count) throw step02.codeError('STEP02_APP_PORTABLE_EVIDENCE_INDEX_INVALID');
  const seen = new Set(), folded = new Set(), roles = new Set();
  for (const item of index.entries) {
    const relative = step02.safeRelative(item.package_relative_path);
    if (!relative.startsWith('upstream/evidence/') || seen.has(relative) || folded.has(relative.toLowerCase())) throw step02.codeError('STEP02_APP_PORTABLE_EVIDENCE_INDEX_INVALID');
    seen.add(relative); folded.add(relative.toLowerCase()); roles.add(item.role);
    const actual = await fileEvidence(path.join(workspace, relative));
    if (actual.sha256 !== item.sha256 || actual.bytes !== item.bytes) throw step02.codeError('STEP02_APP_PORTABLE_EVIDENCE_TAMPERED');
  }
  for (const required of ['source_ffprobe','minute_chunks','native_frame','accepted_transnet_shots','transnet_start_mid_end_supplement','source_audio_wav','audio_event_ledger','mimo_transcript','forced_aligner','paddle_ocr','strict_validation']) if (!roles.has(required)) throw step02.codeError('STEP02_APP_PORTABLE_EVIDENCE_ROLE_MISSING');
  return {index,evidence:await fileEvidence(indexPath)};
}
async function readAllThreads(client) {
  const rows = [];
  for (const employee of THREADS) {
    const thread = (await client.request('thread/read', {threadId:employee.thread_id,includeTurns:true})).thread;
    const summary = summarizeThread(thread);
    if (summary.thread_id !== employee.thread_id || summary.cwd !== PROJECT_ROOT || summary.title !== employee.title) throw step02.codeError('STEP02_APP_THREAD_IDENTITY_INVALID:' + employee.employee);
    rows.push({employee,summary,thread});
  }
  return rows;
}
function auditThread(summary, employee) {
  return {employee:employee.employee,thread_id:employee.thread_id,title:employee.title,cwd:summary.cwd,status:summary.status,turn_count:Number(summary.turns || 0),latest_completed_assistant_turn_id:summary.latest_completed_assistant_turn_id || null,latest_turn_status:summary.latest_turn_status || null,latest_turn_error:summary.latest_turn_error || null,active:hasActiveTurn(summary)};
}
function threadCasFingerprint(row){const s=row.summary;return JSON.stringify({thread_id:s.thread_id,title:s.title,cwd:s.cwd,status:s.status,turns:s.turns,latest_turn_id:s.latest_turn_id,latest_turn_status:s.latest_turn_status,latest_turn_error:s.latest_turn_error,active:hasActiveTurn(s)});}
function assertAllThreadCas(beforeRows,secondRows){if(beforeRows.length!==THREADS.length||secondRows.length!==THREADS.length)throw step02.codeError('STEP02_APP_THREAD_CAS_INVALID');for(let index=0;index<THREADS.length;index+=1)if(beforeRows[index].employee.thread_id!==secondRows[index].employee.thread_id||threadCasFingerprint(beforeRows[index])!==threadCasFingerprint(secondRows[index]))throw step02.codeError('STEP02_APP_THREAD_STATE_CHANGED_BEFORE_START');return true;}
function exactTurnState(thread,turnId){const turns=Array.isArray(thread?.turns)?thread.turns:[],matches=turns.filter(turn=>String(turn?.id||'')===String(turnId));if(matches.length!==1)return {state:'missing_or_ambiguous',turn:null,text:null};const turn=matches[0],messages=Array.isArray(turn.items)?turn.items.filter(item=>item?.type==='agentMessage'&&String(item.text||'').trim()).map(item=>String(item.text)):[];if(turn.status==='completed'&&turn.error)return {state:'completed_error',turn,text:null};if(turn.status==='completed'&&messages.length!==1)return {state:'completed_missing_unique_assistant',turn,text:null};if(turn.status==='completed')return {state:'completed_clean',turn,text:messages[0]};if(['active','running','inProgress','inprogress','pending'].includes(String(turn.status)))return {state:'active',turn,text:null};return {state:'terminal_unaccepted',turn,text:null};}
async function acquireLease(leasePath, dispatch) {
  const now = Date.now(), ttlMs = 20 * 60 * 1000;
  const parent=path.dirname(leasePath),base=path.basename(leasePath);await fsp.mkdir(parent,{recursive:true});
  const existingStats=await fsp.lstat(leasePath).catch(()=>null);
  if(existingStats){
    if(!existingStats.isDirectory()||existingStats.isSymbolicLink())throw step02.codeError('STEP02_APP_EMPLOYEE_LEASE_CONFLICT');
    const record=await readJson(path.join(leasePath,'lease.json')).catch(()=>null);
    if(!record){const entries=await fsp.readdir(leasePath);if(entries.length===0){await fsp.rmdir(leasePath);return acquireLease(leasePath,dispatch);}throw step02.codeError('STEP02_APP_EMPLOYEE_LEASE_CONFLICT');}
    if(record.schema_version!==LEASE_SCHEMA||record.dispatch_id!==dispatch.dispatch_id||record.phase_key!==dispatch.phase_key||record.transaction_id!==dispatch.transaction_id||record.employee_thread_id!==dispatch.employee.thread_id){if(Date.parse(record.expires_at||'')<=now)throw step02.codeError('STEP02_APP_STALE_LEASE_UNKNOWN_TURN');throw step02.codeError('STEP02_APP_EMPLOYEE_LEASE_CONFLICT');}
    return {replay:true,record};
  }
  const staging=path.join(parent,base+'.claim-'+process.pid+'-'+crypto.randomBytes(4).toString('hex'));
  const record={schema_version:LEASE_SCHEMA,status:'claimed',dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,transaction_id:dispatch.transaction_id,employee_thread_id:dispatch.employee.thread_id,claimed_at:new Date(now).toISOString(),renewed_at:new Date(now).toISOString(),expires_at:new Date(now+ttlMs).toISOString(),ttl_ms:ttlMs};
  await fsp.mkdir(staging,{recursive:false});
  try{await atomicJson(path.join(staging,'lease.json'),record);await fsp.rename(staging,leasePath);return {replay:false,record};}
  catch(error){await fsp.rm(staging,{recursive:true,force:true});if(error.code==='EEXIST'||error.code==='ENOTEMPTY'||error.code==='EPERM')return acquireLease(leasePath,dispatch);throw error;}
}
async function cleanupValidatedReplayLease(leasePath,dispatch){const stats=await fsp.lstat(leasePath).catch(()=>null);if(!stats)return false;if(!stats.isDirectory()||stats.isSymbolicLink())throw step02.codeError('STEP02_APP_REPLAY_LEASE_INVALID');const record=await readJson(path.join(leasePath,'lease.json')).catch(()=>null);if(!record){const entries=await fsp.readdir(leasePath);if(entries.length===0){await fsp.rmdir(leasePath);return true;}throw step02.codeError('STEP02_APP_REPLAY_LEASE_INVALID');}if(record.schema_version!==LEASE_SCHEMA||record.dispatch_id!==dispatch.dispatch_id||record.phase_key!==dispatch.phase_key||record.employee_thread_id!==dispatch.employee.thread_id)throw step02.codeError('STEP02_APP_REPLAY_LEASE_CONFLICT');await fsp.rm(leasePath,{recursive:true,force:true});return true;}
async function renewLease(leasePath, dispatch, ttlMs = 20*60*1000) {
  const record = await readJson(path.join(leasePath,'lease.json'));
  if (record.schema_version !== LEASE_SCHEMA || record.dispatch_id !== dispatch.dispatch_id || record.phase_key !== dispatch.phase_key || record.employee_thread_id !== dispatch.employee.thread_id) throw step02.codeError('STEP02_APP_LEASE_RENEWAL_INVALID');
  const now=Date.now(), next={...record,status:'claimed',renewed_at:new Date(now).toISOString(),expires_at:new Date(now+ttlMs).toISOString(),ttl_ms:ttlMs};
  await atomicJson(path.join(leasePath,'lease.json'),next);return next;
}
async function validateReplay(files, dispatch, authority, workspace, options = {}) {
  try {
    validateDispatch(dispatch, authority);
    await validatePortableEvidence(workspace, dispatch);const runtime=await validateRuntimeGovernance(workspace,options);
    const [audit,control,receipt,candidate,response,journal] = await Promise.all([files.audit,files.control,files.receipt,files.candidate,files.response,files.journal].map(readJson));
    const [auditEvidence,controlEvidence,receiptEvidence,candidateEvidence,responseEvidence] = await Promise.all([files.audit,files.control,files.receipt,files.candidate,files.response].map(fileEvidence));
    const responseBytes = Buffer.from(String(response.text || ''), 'utf8');
    const startRequest = {threadId:dispatch.employee.thread_id,cwd:PROJECT_ROOT,approvalPolicy:'never',sandboxPolicy:{type:'readOnly',networkAccess:false},input:[{type:'text',text:prompt(dispatch,authority),text_elements:[]}]};
    step02.validateCandidate(candidate, authority);
    for(const value of [receipt,control])if(value.transaction_id!==dispatch.transaction_id||value.dispatch_id!==dispatch.dispatch_id||value.phase_key!==dispatch.phase_key||value.project_id!==dispatch.project_id||value.job_id!==dispatch.job_id||value.source_sha256!==dispatch.source_sha256||value.rights_authority_sha256!==dispatch.rights_authority_sha256||value.step01_manifest_sha256!==dispatch.step01_manifest_sha256||value.upstream_authority_sha256!==dispatch.upstream_authority_sha256||Number(value.settings_version)!==Number(dispatch.settings_version)||value.owner_action_event_id!==dispatch.owner_action_event_id||value.employee?.thread_id!==dispatch.employee.thread_id||value.employee?.employee!==dispatch.employee.employee||value.employee?.title!==dispatch.employee.title||value.completion_provenance!=='fixed_mac_app_server_readback_v1'||value.test_only!==false||value.fixture_evidence!==false)throw step02.codeError('STEP02_APP_REPLAY_INVALID');
    if (response.schema_version !== 'niannian_redraw_step02_app_server_response_v1' || response.sha256 !== sha256(responseBytes) || response.bytes !== responseBytes.length || response.thread_id!==dispatch.employee.thread_id || response.turn_id!==audit.completion_event?.turn_id || exactJsonResponse(response.text).dispatch_id !== dispatch.dispatch_id || receipt.schema_version !== step02.SCHEMAS.receipt || receipt.status!=='candidate'||receipt.downstream_consumable!==false||control.schema_version !== step02.SCHEMAS.control || control.status!=='completed_candidate_only'||audit.schema_version !== AUDIT_SCHEMA || audit.status !== 'completed_readback_verified' || audit.dispatch_id !== dispatch.dispatch_id || audit.phase_key !== dispatch.phase_key || audit.project_id !== dispatch.project_id || audit.owner_action_event_id !== dispatch.owner_action_event_id || audit.employee_thread_id !== dispatch.employee.thread_id || audit.turn_start_request?.sha256 !== sha256(Buffer.from(JSON.stringify(startRequest))) || audit.turn_start_request?.bytes !== Buffer.byteLength(JSON.stringify(startRequest)) || audit.turn_start_response?.turn_id !== audit.completion_event?.turn_id || audit.thread_readback?.exact_turn_id !== audit.completion_event?.turn_id || audit.thread_readback?.exact_turn_status !== 'completed' || audit.thread_readback?.exact_turn_error !== null || audit.thread_readback?.exact_turn_assistant_message_count!==1 || control.completion_event?.turn_id !== audit.completion_event.turn_id || receipt.completion_event?.turn_id !== audit.completion_event.turn_id || control.completion_event?.status!=='completed'||control.completion_event?.error!==null||receipt.completion_event?.status!=='completed'||receipt.completion_event?.error!==null||receipt.candidate?.sha256 !== candidateEvidence.sha256 || receipt.candidate?.bytes !== candidateEvidence.bytes || receipt.app_server_response?.sha256 !== response.sha256 || receipt.app_server_response?.bytes !== response.bytes || audit.candidate?.sha256 !== candidateEvidence.sha256 || audit.candidate?.bytes !== candidateEvidence.bytes || audit.employee_receipt?.sha256 !== receiptEvidence.sha256 || audit.employee_receipt?.bytes !== receiptEvidence.bytes || audit.control_receipt?.sha256 !== controlEvidence.sha256 || audit.control_receipt?.bytes !== controlEvidence.bytes || audit.assistant_response?.sha256 !== response.sha256 || audit.assistant_response?.bytes !== response.bytes || audit.assistant_response?.evidence_sha256 !== responseEvidence.sha256 || audit.assistant_response?.evidence_bytes !== responseEvidence.bytes || audit.runtime_governance?.governance_sha256!==runtime.governance_sha256||audit.runtime_governance?.install_receipt_sha256!==runtime.install_receipt_sha256||audit.runtime_governance?.parity_receipt_sha256!==runtime.parity_receipt_sha256||audit.runtime_governance?.adoption_manifest_sha256!==runtime.adoption_manifest_sha256||JSON.stringify(audit.runtime_governance?.skills)!==JSON.stringify(runtime.skills)||control.employee_model_channel?.used!==true||control.employee_model_channel?.network_used!==true||control.employee_model_channel?.media_provider_authority_granted!==false||control.app_server_sequence?.thread_read_before_start !== true || control.app_server_sequence?.turn_start !== true || control.app_server_sequence?.turn_completed !== true || control.app_server_sequence?.thread_readback !== true || candidate.test_only !== false || candidate.fixture_evidence !== false) throw step02.codeError('STEP02_APP_REPLAY_INVALID');
    if(journal.schema_version!==JOURNAL_SCHEMA||journal.status!=='completed_artifacts_bound'||journal.dispatch_id!==dispatch.dispatch_id||journal.phase_key!==dispatch.phase_key||journal.turn_id!==audit.completion_event.turn_id||journal.artifacts?.candidate?.sha256!==candidateEvidence.sha256||journal.artifacts?.response?.sha256!==responseEvidence.sha256||journal.artifacts?.employee_receipt?.sha256!==receiptEvidence.sha256||journal.artifacts?.control_receipt?.sha256!==controlEvidence.sha256||journal.artifacts?.app_server_audit?.sha256!==auditEvidence.sha256)throw step02.codeError('STEP02_APP_REPLAY_INVALID');
    step02.assertFalseEffects(audit); step02.assertFalseEffects(control); step02.assertFalseEffects(receipt); step02.assertFalseEffects(candidate);
    return {audit,control,receipt,candidate,replay:true};
  } catch (error) { if (error.code === 'STEP02_APP_REPLAY_INVALID') throw error; throw step02.codeError('STEP02_APP_REPLAY_INVALID', error.message); }
}
async function run(options = {}) {
  const dispatchPath = path.resolve(String(options.dispatchPath || ''));
  const workspace = path.resolve(options.workspace || path.dirname(dispatchPath));
  const authorityPath = path.join(workspace, 'upstream_authority_snapshot.json');
  const dispatch = await readJson(dispatchPath);
  const authority = await readJson(authorityPath);
  const authorityEvidence = await fileEvidence(authorityPath);
  authority.sha256 = authorityEvidence.sha256;
  const employee = validateDispatch(dispatch, authority);
  await validatePortableEvidence(workspace, dispatch);const runtimeGovernance=await validateRuntimeGovernance(workspace,{testMode:options.testMode===true,skillRoot:options.skillRoot});
  const files = {candidate:path.join(workspace, 'step02_source_truth_candidate.json'),receipt:path.join(workspace, 'step02_employee_receipt.json'),control:path.join(workspace, 'step02_control_receipt.json'),audit:path.join(workspace, 'step02_app_server_audit.json'),response:path.join(workspace, 'step02_app_server_response.json'),journal:path.join(workspace, 'step02_app_turn_journal.json')};
  const leaseRoot = path.resolve(options.leaseRoot || path.join(path.dirname(workspace), '.step02-employee-leases'));
  await fsp.mkdir(leaseRoot, {recursive:true});
  const leasePath = path.join(leaseRoot, employee.thread_id);
  if ([files.candidate,files.receipt,files.control,files.audit,files.response].every(file => fs.existsSync(file))) {const replay=await validateReplay(files,dispatch,authority,workspace,{testMode:options.testMode===true,skillRoot:options.skillRoot});await cleanupValidatedReplayLease(leasePath,dispatch);return replay;}
  const lease = await acquireLease(leasePath, dispatch);
  const client = options.client || new AppServerClient(options.codexPath || CODEX_PATH, options.transport || 'stdio');
  const ownsClient = !options.client;
  let startedTurn = false;
  let turnMayExist = false;
  let success = false;
  let heartbeat = null;
  try {
    if (ownsClient) await client.start();
    const beforeRows = await readAllThreads(client);
    const selectedBefore = beforeRows.find(row => row.employee.thread_id === employee.thread_id);
    let journal = await readJson(files.journal).catch(() => null);
    let ownRecoveryTurn = journal?.schema_version === JOURNAL_SCHEMA && journal.dispatch_id === dispatch.dispatch_id && journal.phase_key === dispatch.phase_key && journal.employee_thread_id === employee.thread_id ? journal.turn_id || null : null;
    if (journal && !ownRecoveryTurn) {
      const baseline=journal.selected_preflight;
      if (!baseline || !Number.isInteger(baseline.turn_count)) throw step02.codeError('STEP02_APP_START_INTENT_RECOVERY_INVALID');
      const delta=Number(selectedBefore.summary.turns)-baseline.turn_count;
      if (delta===1 && selectedBefore.summary.latest_turn_id && selectedBefore.summary.latest_turn_id!==baseline.latest_turn_id) {
        ownRecoveryTurn=selectedBefore.summary.latest_turn_id;turnMayExist=true;
        journal={...journal,status:'turn_id_recovered_from_exact_thread_delta',turn_id:ownRecoveryTurn,turn_start_response:{turn_id:ownRecoveryTurn},recovered_at:new Date().toISOString()};await atomicJson(files.journal,journal);
      } else if (delta!==0) {turnMayExist=true;throw step02.codeError('STEP02_APP_UNKNOWN_TURN_AFTER_START_INTENT');}
    }
    if (ownRecoveryTurn) turnMayExist=true;
    const activeRows = beforeRows.filter(row => hasActiveTurn(row.summary));
    if (activeRows.length && !(activeRows.length === 1 && activeRows[0].employee.thread_id === employee.thread_id && ownRecoveryTurn)) throw step02.codeError('STEP02_APP_ACTIVE_TURN_PRESENT');
    const promptText = prompt(dispatch, authority);
    const startRequest = {threadId:employee.thread_id,cwd:PROJECT_ROOT,approvalPolicy:'never',sandboxPolicy:{type:'readOnly',networkAccess:false},input:[{type:'text',text:promptText,text_elements:[]}]};
    let turnId = ownRecoveryTurn;
    let startResponse = journal?.turn_start_response || null;
    if (!turnId) {
      journal = {schema_version:JOURNAL_SCHEMA,status:'start_intent_durable',dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,transaction_id:dispatch.transaction_id,project_id:dispatch.project_id,employee_thread_id:employee.thread_id,all_threads_read_before_start:true,thread_preflight:beforeRows.map(row => auditThread(row.summary,row.employee)),selected_preflight:{turn_count:Number(selectedBefore.summary.turns),latest_turn_id:selectedBefore.summary.latest_turn_id || null},turn_start_request_sha256:sha256(Buffer.from(JSON.stringify(startRequest))),turn_id:null,created_at:new Date().toISOString()};
      await atomicJson(files.journal, journal);
      const secondRows=await readAllThreads(client);assertAllThreadCas(beforeRows,secondRows);journal={...journal,second_all_threads_read_before_start:true,second_thread_preflight:secondRows.map(row=>auditThread(row.summary,row.employee)),cas_verified_at:new Date().toISOString()};await atomicJson(files.journal,journal);
      if (selectedBefore.summary.status?.type === 'notLoaded') await client.request('thread/resume', {threadId:employee.thread_id,cwd:PROJECT_ROOT,approvalPolicy:'never',excludeTurns:true});
      startResponse = await client.request('turn/start', startRequest);
      turnId = String(startResponse?.turn?.id || '');
      if (!turnId) throw step02.codeError('STEP02_APP_TURN_START_RESPONSE_INVALID');
      startedTurn = true;
      turnMayExist = true;
      if (typeof options.afterTurnAcceptedBeforeJournal === 'function') await options.afterTurnAcceptedBeforeJournal({turnId,startResponse,journal});
      journal = {...journal,status:'turn_started',turn_id:turnId,turn_start_response:{turn_id:turnId},updated_at:new Date().toISOString()};
      await atomicJson(files.journal, journal);
    }
    const renew=options.renewLease||renewLease;await renew(leasePath,dispatch,Number(options.leaseTtlMs||20*60*1000));
    let heartbeatReject,heartbeatFailure=null;const heartbeatFailed=new Promise((resolve,reject)=>{heartbeatReject=reject;});heartbeatFailed.catch(()=>{});
    heartbeat=setInterval(()=>{renew(leasePath,dispatch,Number(options.leaseTtlMs||20*60*1000)).catch(error=>{if(heartbeatFailure)return;heartbeatFailure=step02.codeError('STEP02_APP_LEASE_RENEWAL_FAILED',String(error.message||error));heartbeatReject(heartbeatFailure);});},Math.max(20,Number(options.leaseHeartbeatMs||15000)));
    if (startedTurn && typeof options.afterTurnStarted === 'function') await options.afterTurnStarted({turnId,journal});
    const preexistingTarget=ownRecoveryTurn?exactTurnState(selectedBefore.thread,ownRecoveryTurn):{state:'missing_or_ambiguous'};
    if(preexistingTarget.state==='completed_error')throw step02.codeError('STEP02_APP_TARGET_TURN_COMPLETED_ERROR');
    if(preexistingTarget.state==='completed_missing_unique_assistant')throw step02.codeError('STEP02_APP_TARGET_TURN_ASSISTANT_MISSING');
    if(ownRecoveryTurn&&!['completed_clean','active'].includes(preexistingTarget.state))throw step02.codeError('STEP02_APP_TARGET_TURN_NOT_PROVEN');
    const completion=preexistingTarget.state==='completed_clean'?{method:'turn/completed',turn_id:ownRecoveryTurn,status:'completed',error:null}:assertCompletedTurn(await Promise.race([client.waitForTurn(employee.thread_id,turnId,options.timeoutMs||15*60*1000),heartbeatFailed]));
    if(heartbeatFailure)throw heartbeatFailure;
    const afterThread=(await client.request('thread/read',{threadId:employee.thread_id,includeTurns:true})).thread,after=summarizeThread(afterThread),exactTarget=exactTurnState(afterThread,completion.turn_id);
    if(after.cwd!==PROJECT_ROOT||after.title!==employee.title||exactTarget.state!=='completed_clean')throw step02.codeError('STEP02_APP_THREAD_READBACK_MISMATCH');
    const responseText=exactTarget.text;
    const candidate = exactJsonResponse(responseText);
    if (candidate.transaction_id !== dispatch.transaction_id || candidate.dispatch_id !== dispatch.dispatch_id || candidate.phase_key !== dispatch.phase_key || candidate.project_id !== dispatch.project_id || candidate.job_id !== dispatch.job_id || candidate.source_sha256 !== dispatch.source_sha256 || candidate.rights_authority_sha256 !== dispatch.rights_authority_sha256 || candidate.step01_manifest_sha256 !== dispatch.step01_manifest_sha256 || Number(candidate.settings_version) !== Number(dispatch.settings_version) || candidate.test_only !== false || candidate.fixture_evidence !== false) throw step02.codeError('STEP02_APP_CANDIDATE_BINDING_INVALID');
    step02.validateCandidate(candidate, authority);
    await atomicJson(files.candidate, candidate);
    const candidateEvidence = await fileEvidence(files.candidate);
    const responseBytes = Buffer.from(String(responseText || ''), 'utf8');
    const response = {schema_version:'niannian_redraw_step02_app_server_response_v1',thread_id:employee.thread_id,turn_id:completion.turn_id,sha256:sha256(responseBytes),bytes:responseBytes.length,text:String(responseText || '')};
    await atomicJson(files.response, response);
    const responseEvidence = await fileEvidence(files.response);
    const completionEvent = {method:'turn/completed',thread_id:employee.thread_id,turn_id:completion.turn_id,status:'completed',error:null};
    const employeeModelChannel={channel_id:'krill_codex_custom_provider_v1',used:true,network_used:true,media_provider_authority_granted:false};
    const common = {transaction_id:dispatch.transaction_id,dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,project_id:dispatch.project_id,job_id:dispatch.job_id,source_sha256:dispatch.source_sha256,rights_authority_sha256:dispatch.rights_authority_sha256,step01_manifest_sha256:dispatch.step01_manifest_sha256,upstream_authority_sha256:dispatch.upstream_authority_sha256,settings_version:dispatch.settings_version,owner_action_event_id:dispatch.owner_action_event_id,employee:{...employee,project_root:MAC_PROJECT},employee_model_channel:employeeModelChannel,completion_event:completionEvent,completion_provenance:'fixed_mac_app_server_readback_v1',test_only:false,fixture_evidence:false,...step02.falseEffects()};
    const receipt = {schema_version:step02.SCHEMAS.receipt,status:'candidate',downstream_consumable:false,...common,candidate:{relative_path:'step02_source_truth_candidate.json',sha256:candidateEvidence.sha256,bytes:candidateEvidence.bytes},app_server_response:{sha256:sha256(responseBytes),bytes:responseBytes.length},created_at:new Date().toISOString()};
    const control = {schema_version:step02.SCHEMAS.control,status:'completed_candidate_only',...common,app_server_sequence:{thread_read_before_start:true,turn_start:true,turn_completed:true,thread_readback:true},cli_fallback_used:false,ephemeral_thread_used:false,ssh_employee_used:false,provider_used:false,created_at:receipt.created_at};
    await atomicJson(files.receipt, receipt);
    await atomicJson(files.control, control);
    const receiptEvidence = await fileEvidence(files.receipt), controlEvidence = await fileEvidence(files.control);
    const audit = {schema_version:AUDIT_SCHEMA,status:'completed_readback_verified',dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,transaction_id:dispatch.transaction_id,project_id:dispatch.project_id,owner_action_event_id:dispatch.owner_action_event_id,employee_thread_id:employee.thread_id,employee_model_channel:employeeModelChannel,all_threads_read_before_start:true,second_all_threads_read_before_start:journal.second_all_threads_read_before_start===true,thread_preflight:beforeRows.map(row => auditThread(row.summary,row.employee)),second_thread_preflight:journal.second_thread_preflight||null,turn_start_request:{method:'turn/start',sha256:sha256(Buffer.from(JSON.stringify(startRequest))),bytes:Buffer.byteLength(JSON.stringify(startRequest)),cwd:PROJECT_ROOT,sandbox_policy:'readOnly',network_access:false},turn_start_response:{turn_id:turnId},completion_event:completionEvent,thread_readback:{method:'thread/read',thread_id:employee.thread_id,exact_turn_id:completion.turn_id,exact_turn_status:exactTarget.turn.status,exact_turn_error:exactTarget.turn.error||null,exact_turn_assistant_message_count:1,latest_completed_assistant_turn_id:after.latest_completed_assistant_turn_id,latest_turn_status:after.latest_turn_status,latest_turn_error:after.latest_turn_error || null},assistant_response:{sha256:sha256(responseBytes),bytes:responseBytes.length,evidence_sha256:responseEvidence.sha256,evidence_bytes:responseEvidence.bytes},candidate:{sha256:candidateEvidence.sha256,bytes:candidateEvidence.bytes},employee_receipt:{sha256:receiptEvidence.sha256,bytes:receiptEvidence.bytes},control_receipt:{sha256:controlEvidence.sha256,bytes:controlEvidence.bytes},runtime_governance:runtimeGovernance,recovered_existing_turn:Boolean(ownRecoveryTurn),test_only:false,fixture_evidence:false,...step02.falseEffects(),completed_at:receipt.created_at};
    await atomicJson(files.audit, audit);
    const auditEvidence=await fileEvidence(files.audit);journal={...journal,status:'completed_artifacts_bound',turn_id:completion.turn_id,artifacts:{candidate:candidateEvidence,response:responseEvidence,employee_receipt:receiptEvidence,control_receipt:controlEvidence,app_server_audit:auditEvidence},completed_at:receipt.created_at};await atomicJson(files.journal,journal);
    success = true;
    return {audit,control,receipt,candidate,replay:false};
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (ownsClient) client.close();
    if (success || !turnMayExist) await fsp.rm(leasePath, {recursive:true,force:true});
  }
}

module.exports = {AUDIT_SCHEMA,JOURNAL_SCHEMA,LEASE_SCHEMA,MAC_PROJECT,acquireLease,exactJsonResponse,prompt,readAllThreads,renewLease,run,validateDispatch,validatePortableEvidence,validateReplay,validateRuntimeGovernance};
