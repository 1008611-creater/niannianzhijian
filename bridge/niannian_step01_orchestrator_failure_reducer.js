'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function jsonBytes(value) { return Buffer.from(JSON.stringify(value, null, 2) + '\n'); }
function assert(condition, code) { if (!condition) { const error = new Error(code); error.code = code; throw error; } }
async function readJson(filePath, fallback = null) {
  try { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function readRegularBytes(filePath) {
  const stats = await fsp.lstat(filePath);
  assert(stats.isFile() && !stats.isSymbolicLink(), 'STEP01_ORCHESTRATOR_RESULT_NOT_REGULAR');
  return fsp.readFile(filePath);
}
async function writeJsonAtomic(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temp = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  await fsp.writeFile(temp, jsonBytes(value), {flag:'wx'});
  await fsp.rename(temp, filePath);
}
function failureDetails(result) {
  assert(result && result.schema_version === 1, 'STEP01_ORCHESTRATOR_RESULT_SCHEMA_INVALID');
  assert(result.status === 'failed', 'STEP01_ORCHESTRATOR_RESULT_NOT_FAILED');
  assert(result.provider_submission_requested === false && result.package_send_requested === false, 'STEP01_ORCHESTRATOR_RESULT_SIDE_EFFECT_FLAG_INVALID');
  assert(Number.isFinite(Date.parse(result.failed_at)), 'STEP01_ORCHESTRATOR_RESULT_FAILED_AT_INVALID');
  const blocker = String(result.blocker || '');
  const controllerCredentialInvalid = result.blocker_code === 'CONTROLLER_AUTH_REQUIRED' || blocker === '控制器凭据无效';
  const controllerCredentialMissing = blocker.includes('bridge_token_missing_or_short');
  if (controllerCredentialInvalid || controllerCredentialMissing) {
    assert(result.blocker_class === 'infrastructure_failure' || result.blocker_class === 'pipeline_runtime_packaging_gap', 'STEP01_ORCHESTRATOR_RESULT_BLOCKER_CLASS_INVALID');
    return {
      code:controllerCredentialMissing ? 'STEP01_CONTROLLER_CREDENTIAL_MISSING' : 'STEP01_CONTROLLER_CREDENTIAL_INVALID',
      blocker_class:'infrastructure_failure',
      resume_event:'controller_credential_hash_and_token_source_reverified',
      next_action:'修复 4188 controller hash 与受保护 token 文件的绑定，验证认证链后再恢复同一项目；不得绕过 controller。'
    };
  }
  assert(result.blocker_class === 'pipeline_runtime_packaging_gap', 'STEP01_ORCHESTRATOR_RESULT_BLOCKER_CLASS_INVALID');
  assert(/step01-phase-leases/.test(blocker) && /ENOENT/.test(blocker), 'STEP01_ORCHESTRATOR_RESULT_BLOCKER_UNRECOGNIZED');
  return {
    code:'STEP01_MAC_PHASE_LEASE_DIRECTORY_MISSING',
    blocker_class:'pipeline_runtime_packaging_gap',
    resume_event:'mac_phase_lease_directory_and_hq_preconditions_reverified',
    next_action:'修复 fixed Mac App Step01 phase lease 目录后，重新验证 HQ 前置条件，再以同一 exact source/rights 新授权恢复；不得降级到 CLI 或 relay。'
  };
}
function defaultPipeline(status, gates) {
  const completed = status === 'step01_verified' ? 1 : 0;
  return ['Step01','Step02','Step04','Step05'].map((id,index) => ({id,status:index < completed ? 'completed' : index === 0 ? 'blocked' : 'blocked'}));
}
async function reduceStep01OrchestratorFailure({dataRoot, project, pipelineForStatus = defaultPipeline}) {
  assert(project && /^[A-Z0-9-]+$/.test(String(project.id || '')), 'STEP01_REDUCER_PROJECT_INVALID');
  const jobDir = path.join(path.resolve(dataRoot), 'jobs', project.id);
  const resultPath = path.join(jobDir, 'step01_orchestrator_result.json');
  const resultBytes = await readRegularBytes(resultPath);
  const resultSha256 = sha256(resultBytes);
  const result = JSON.parse(resultBytes.toString('utf8'));
  assert(result.remote_project_id === project.id, 'STEP01_ORCHESTRATOR_RESULT_PROJECT_MISMATCH');
  assert(project.source && /^[a-f0-9]{64}$/.test(String(project.source.sha256 || '')), 'STEP01_REDUCER_SOURCE_INVALID');
  const details = failureDetails(result);
  const resultBytesLength = resultBytes.length;
  const eventId = 'step01-orchestrator-failure-' + sha256(Buffer.from([project.id,resultSha256,details.code].join('|'))).slice(0,32);
  const eventsPath = path.join(jobDir, 'job_events.jsonl');
  const previousEvents = await fsp.readFile(eventsPath, 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error));
  const eventLines = previousEvents.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const sameFailureTimeEvents = eventLines.filter(event => event.type === 'step01_orchestrator_failure_observed' && event.job_id === project.id && event.at === String(result.failed_at));
  assert(sameFailureTimeEvents.every(event => event.result_receipt && event.result_receipt.sha256 === resultSha256 && event.result_receipt.bytes === resultBytesLength), 'STEP01_REDUCER_RESULT_RECEIPT_TAMPERED_AFTER_REDUCTION');
  const existing = eventLines.find(event => event.event_id === eventId);
  assert(!existing || (existing.result_receipt && existing.result_receipt.sha256 === resultSha256 && existing.result_receipt.bytes === resultBytesLength), 'STEP01_REDUCER_EVENT_ID_COLLISION');
  const ledgerPath = path.join(jobDir, 'artifact_ledger.json');
  const ledger = await readJson(ledgerPath, {schema_version:'artifact_ledger_v1',job_id:project.id,artifacts:[]});
  assert(!ledger.artifacts.some(item => item.artifact_id === 'step01_evidence_manifest' && ['verified','accepted','completed','delivered'].includes(String(item.status || ''))), 'STEP01_REDUCER_VERIFIED_EVIDENCE_ALREADY_PRESENT');
  const now = String(result.failed_at);
  const blockerArtifact = {
    artifact_id:'step01_orchestrator_failure_receipt',
    node_id:'Step01',
    exact_path:resultPath,
    sha256:resultSha256,
    bytes:resultBytesLength,
    status:'blocked',
    downstream_consumable_by:[],
    blocker_code:details.code,
    blocker_class:details.blocker_class
  };
  if (!existing) {
    const event = {
      at:now,
      event_id:eventId,
      type:'step01_orchestrator_failure_observed',
      job_id:project.id,
      source_sha256:project.source.sha256,
      result_receipt:{exact_path:resultPath,sha256:resultSha256,bytes:resultBytesLength},
      blocker_code:details.code,
      blocker_class:details.blocker_class,
      resume_event:details.resume_event,
      provider_submission_requested:false,
      media_provider_network_requested:false,
      media_provider_submit_requested:false,
      package_send_requested:false,
      spend_requested:false
    };
    await fsp.mkdir(jobDir, {recursive:true});
    await fsp.appendFile(eventsPath, JSON.stringify(event) + '\n', 'utf8');
  }
  ledger.artifacts = Array.isArray(ledger.artifacts) ? ledger.artifacts.filter(item => item.artifact_id !== blockerArtifact.artifact_id) : [];
  ledger.artifacts.push(blockerArtifact);
  ledger.updated_at = now;
  const status = {job_id:project.id,status:'infra_failed',current_node:'Step01',earliest_incomplete_node:'Step01',next_skill:'mx-shortdrama-01-frame-extract',blocker:{code:details.code,blocker_class:details.blocker_class,result_receipt_sha256:resultSha256},next_action:details.next_action,resume_event:details.resume_event,updated_at:now};
  const checkpoint = {schema_version:1,job_id:project.id,status:'infra_failed',current_node:'Step01',earliest_incomplete_node:'Step01',completed:['source rights authority bound to user and source SHA','source video sha256 verified','source media probe verified'],blockers:[{code:details.code,blocker_class:details.blocker_class,result_receipt_sha256:resultSha256,resume_event:details.resume_event}],next_skill:'mx-shortdrama-01-frame-extract',next_action:details.next_action,resume_event:details.resume_event,updated_at:now};
  const dashboard = await readJson(path.join(jobDir, 'gate_dashboard.json'), {schema_version:'niannian_web_preflight_v1',job_id:project.id,gates:{}});
  dashboard.current_node = 'Step01';
  dashboard.earliest_incomplete_node = 'Step01';
  dashboard.next_skill = 'mx-shortdrama-01-frame-extract';
  dashboard.gates = {...(dashboard.gates || {}),Step01:{status:'infra_failed',blocker_code:details.code,result_receipt_sha256:resultSha256},Step02:{status:'blocked_upstream'},Step04:{status:'blocked_upstream'},Step05:{status:'blocked_upstream'},provider_submit:{status:'blocked_no_authority'},package_send:{status:'blocked_controller_authorization'}};
  dashboard.blocker = {code:details.code,blocker_class:details.blocker_class,resume_event:details.resume_event};
  dashboard.next_action = details.next_action;
  dashboard.updated_at = now;
  const resultManifest = {job_id:project.id,status:'infra_failed',success:false,packaged:false,transport_success:false,user_visible_acceptance:false,artifacts:ledger.artifacts,blocker:{code:details.code,blocker_class:details.blocker_class,result_receipt_sha256:resultSha256},updated_at:now};
  await Promise.all([
    writeJsonAtomic(ledgerPath, ledger),
    writeJsonAtomic(path.join(jobDir, 'status.json'), status),
    writeJsonAtomic(path.join(jobDir, 'checkpoint.json'), checkpoint),
    writeJsonAtomic(path.join(jobDir, 'gate_dashboard.json'), dashboard),
    writeJsonAtomic(path.join(jobDir, 'result_manifest.json'), resultManifest)
  ]);
  const blocker = String(result.blocker).slice(0,1000);
  project.status = 'blocked';
  project.productionStatus = 'infra_failed';
  project.analysis = {...(project.analysis || {}),status:'infra_failed',blocker,blockerClass:details.blocker_class,updatedAt:now};
  project.pipeline = pipelineForStatus('infra_failed', dashboard.gates);
  project.runtime = {...(project.runtime || {}),productionStatus:'infra_failed',currentNode:'Step01',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker:details.code,nextAction:details.next_action,gateState:details.code.startsWith('STEP01_CONTROLLER_') ? 'step01_controller_auth_failed' : 'step01_orchestrator_failed',gates:dashboard.gates,worker:{...(project.runtime?.worker || {}),status:'blocked',blocker:details.code,updatedAt:now},checkpointUpdatedAt:now};
  project.dispatch = {...(project.dispatch || {}),status:'blocked',blocker:details.code,leaseUntil:null};
  return {changed:!existing,event_id:eventId,result_sha256:resultSha256,result_bytes:resultBytesLength,blocker_code:details.code,project};
}

async function reduceStep01OrchestratorFailureDataRoot({dataRoot, projectId, pipelineForStatus = defaultPipeline}) {
  const resolvedDataRoot=path.resolve(dataRoot);
  assert(/^[A-Z0-9-]+$/.test(String(projectId || '')), 'STEP01_REDUCER_PROJECT_INVALID');
  const projectsPath=path.join(resolvedDataRoot,'projects.json');
  const projects=await readJson(projectsPath,null);
  assert(Array.isArray(projects), 'STEP01_REDUCER_PROJECTS_INVALID');
  const project=projects.find(item=>item && item.id===projectId);
  assert(project, 'STEP01_REDUCER_PROJECT_NOT_FOUND');
  const reduced=await reduceStep01OrchestratorFailure({dataRoot:resolvedDataRoot,project,pipelineForStatus});
  await writeJsonAtomic(projectsPath,projects);
  return reduced;
}

if (require.main === module) {
  const dataRoot=process.argv[2],projectId=process.argv[3];
  reduceStep01OrchestratorFailureDataRoot({dataRoot,projectId}).then(result=>{
    process.stdout.write(JSON.stringify({ok:true,changed:result.changed,project_id:projectId,blocker_code:result.blocker_code,result_sha256:result.result_sha256,result_bytes:result.result_bytes})+'\n');
  }).catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
}

module.exports = {reduceStep01OrchestratorFailure,reduceStep01OrchestratorFailureDataRoot};
