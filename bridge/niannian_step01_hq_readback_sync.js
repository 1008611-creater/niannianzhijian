'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const {EXACT_REMOTE_PROJECT, reconcileVerifiedHqReadback, validateReadback} = require('./niannian_step01_hq_readback_reducer');

const root = path.resolve(__dirname, '..');
const dataRoot = path.resolve(process.env.NIANNIAN_CANONICAL_DATA_ROOT || path.join(root, 'data'));
const projectsPath = path.join(dataRoot, 'projects.json');
const jobRoot = path.join(dataRoot, 'jobs', EXACT_REMOTE_PROJECT);
const readbackPath = path.join(jobRoot, 'mac_hq_fixed_readback.json');
const currentRunPath = path.join(jobRoot, 'current_run.json');
const resultPath = path.join(jobRoot, 'step01_orchestrator_result.json');

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function jsonBytes(value) { return Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8'); }
async function readJson(filePath) { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
async function atomicJson(filePath, value) {
  const bytes = jsonBytes(value);
  const temporary = filePath + '.sync-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  await fsp.writeFile(temporary, bytes, {flag:'wx'});
  await fsp.rename(temporary, filePath);
  return {sha256:sha256(bytes), bytes:bytes.length};
}
async function readStdin() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 256 * 1024) throw new Error('step01_hq_readback_stdin_too_large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function assertCurrentBinding(project, task) {
  const run = task.analysis_run;
  if (!project || project.id !== EXACT_REMOTE_PROJECT || !run || project.analysis?.runId !== run.id) throw new Error('step01_hq_readback_current_run_mismatch');
  if (project.source?.sha256 !== run.source_sha256 || Number(project.source?.bytes) !== Number(run.source_bytes) || Number(project.analysis?.sourceRevision) !== Number(run.source_revision)) throw new Error('step01_hq_readback_source_binding_mismatch');
  if (Number(project.analysis?.settingsVersion) !== Number(run.settings_binding?.settings_version) || project.analysis?.authorizationEventId !== task.analysis_authorization?.event_id) throw new Error('step01_hq_readback_authority_binding_mismatch');
}
async function archivePriorResult() {
  const bytes = await fsp.readFile(resultPath).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (!bytes) return null;
  const digest = sha256(bytes);
  const historyPath = path.join(jobRoot, 'step01_orchestrator_history', digest + '.json');
  await fsp.mkdir(path.dirname(historyPath), {recursive:true});
  await fsp.writeFile(historyPath, bytes, {flag:'wx'}).catch(error => {
    if (error.code !== 'EEXIST') throw error;
  });
  return {exact_path:historyPath, sha256:digest, bytes:bytes.length};
}
function currentRunManifest(project, task, readbackEvidence, now) {
  const run = task.analysis_run;
  return {
    schema_version:'niannian_step01_current_run_v1',
    project_id:project.id,
    analysis_run_id:run.id,
    source_sha256:run.source_sha256,
    source_bytes:run.source_bytes,
    source_revision:run.source_revision,
    settings_version:run.settings_binding.settings_version,
    settings_binding:run.settings_binding,
    authorization_event_id:task.analysis_authorization.event_id,
    hq_readback:readbackEvidence,
    updated_at:now
  };
}
function preparedProject(project, task, readbackEvidence, now) {
  const run = task.analysis_run;
  return {
    ...project,
    status:'queued',
    productionStatus:'prepared',
    analysis:{...project.analysis,status:'prepared',runId:run.id,sourceRevision:run.source_revision,sourceSha256:run.source_sha256,settingsVersion:run.settings_binding.settings_version,blocker:null,updatedAt:now},
    runtime:{...(project.runtime || {}),productionStatus:'prepared',currentNode:'Step01',earliestIncompleteNode:'Step01',nextSkill:'mx-shortdrama-01-frame-extract',blocker:null,nextAction:'Mac HQ health readback 已验证；正在准备 fixed Mac Codex Desktop App Step01 phase。',gateState:'step01_hq_readback_ready',hqReadback:readbackEvidence,worker:{status:'preparing',mode:'fixed_mac_app_phase',cliFallbackAllowed:false,relayFallbackAllowed:false,updatedAt:now},checkpointUpdatedAt:now},
    dispatch:{...(project.dispatch || {}),status:'queued',leaseId:null,leaseUntil:null,blocker:null}
  };
}
function samePreparedProjection(project, readbackSha256) {
  return project.analysis?.status === 'prepared'
    && project.runtime?.gateState === 'step01_hq_readback_ready'
    && project.runtime?.hqReadback?.sha256 === readbackSha256
    && project.dispatch?.status === 'queued';
}
async function sync(readback) {
  const [projects, task] = await Promise.all([readJson(projectsPath), readJson(path.join(jobRoot, 'task.json'))]);
  const project = projects.find(item => item.id === EXACT_REMOTE_PROJECT);
  assertCurrentBinding(project, task);
  const validation = validateReadback(readback, {remoteProjectId:EXACT_REMOTE_PROJECT, settingsVersion:task.analysis_run?.settings_binding?.settings_version});
  if (!validation.evaluation.ready) throw new Error('step01_hq_readback_not_ready');
  const readbackEvidence = {sha256:sha256(jsonBytes(readback)), bytes:jsonBytes(readback).length, read_at:readback.read_at, bridge_release:{release_version:readback.bridge_release?.release_version, manifest_sha256:readback.bridge_release?.manifest_sha256}};
  const now = new Date().toISOString();
  const reducerResult = await reconcileVerifiedHqReadback({jobRoot, readback});
  const priorResult = await readJson(resultPath).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  const resultAlreadyReady = priorResult?.status === 'hq_readback_ready' && priorResult?.analysis_run_id === task.analysis_run.id && priorResult?.hq_readback?.sha256 === readbackEvidence.sha256;
  const alreadySynced = reducerResult.status === 'hq_readback_already_reconciled' && samePreparedProjection(project, readbackEvidence.sha256) && resultAlreadyReady;
  if (alreadySynced) return {status:'already_synced', project_id:EXACT_REMOTE_PROJECT, analysis_run_id:task.analysis_run.id, hq_readback_sha256:readbackEvidence.sha256};
  const resultHistory = resultAlreadyReady ? null : await archivePriorResult();
  await atomicJson(readbackPath, readback);
  await atomicJson(currentRunPath, currentRunManifest(project, task, readbackEvidence, now));
  const nextProject = preparedProject(project, task, readbackEvidence, now);
  await atomicJson(projectsPath, projects.map(item => item.id === EXACT_REMOTE_PROJECT ? nextProject : item));
  await atomicJson(resultPath, {schema_version:'niannian_step01_hq_readback_ready_v1',remote_project_id:EXACT_REMOTE_PROJECT,local_job_id:nextProject.analysis.localJobId || nextProject.dispatch.localJobId || null,analysis_run_id:task.analysis_run.id,source_sha256:task.analysis_run.source_sha256,source_bytes:task.analysis_run.source_bytes,settings_version:task.analysis_run.settings_binding.settings_version,authorization_event_id:task.analysis_authorization.event_id,hq_readback:readbackEvidence,prior_result:resultHistory,status:'hq_readback_ready',dispatch_package_created:false,employee_turn_requested:false,cli_fallback_allowed:false,relay_fallback_allowed:false,media_provider_network_requested:false,media_provider_submit_requested:false,spend_requested:false,completed_at:now});
  return {status:'hq_readback_ready_synced', project_id:EXACT_REMOTE_PROJECT, analysis_run_id:task.analysis_run.id, hq_readback_sha256:readbackEvidence.sha256, bridge_release:readbackEvidence.bridge_release, media_provider_submit_requested:false, project_media_processed:false, real_delivery:false};
}

if (require.main === module) {
  readStdin().then(sync).then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
}

module.exports = {assertCurrentBinding, currentRunManifest, preparedProject, samePreparedProjection, sync};
