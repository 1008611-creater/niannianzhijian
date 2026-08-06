'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const {EXACT_REMOTE_PROJECT, validateReadback} = require('./niannian_step01_hq_readback_reducer');

const RELEASE_SCHEMA = 'niannian_step01_direct_hq_readback_release_v1';
const CURRENT_RUN_SCHEMA = 'niannian_step01_current_run_v1';

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
}

async function assertDirectory(directory, code) {
  const stats = await fsp.lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(code);
  return path.resolve(directory);
}

async function atomicJson(filePath, value) {
  const bytes = jsonBytes(value);
  const temp = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  await fsp.writeFile(temp, bytes, {flag:'wx'});
  await fsp.rename(temp, filePath);
  return {sha256:sha256(bytes), bytes:bytes.length};
}

function assertBinding(task, currentRun, expectedProjectId = EXACT_REMOTE_PROJECT) {
  const run = task && task.analysis_run;
  const authorization = task && task.analysis_authorization;
  const source = task && task.source_video;
  const taskProjectId = task && (task.remote_job_id || task.job_id);
  if (!task || taskProjectId !== expectedProjectId || !run || !authorization || !source) {
    throw new Error('step01_direct_readback_task_binding_missing');
  }
  if (currentRun?.schema_version !== CURRENT_RUN_SCHEMA || currentRun.project_id !== expectedProjectId) {
    throw new Error('step01_direct_readback_current_run_invalid');
  }
  if (run.id !== currentRun.analysis_run_id || run.source_sha256 !== currentRun.source_sha256 || Number(run.source_bytes) !== Number(currentRun.source_bytes) || Number(run.source_revision) !== Number(currentRun.source_revision)) {
    throw new Error('step01_direct_readback_run_binding_mismatch');
  }
  if (source.sha256 !== currentRun.source_sha256 || Number(source.bytes) !== Number(currentRun.source_bytes) || authorization.event_id !== currentRun.authorization_event_id || Number(authorization.settings_version) !== Number(currentRun.settings_version)) {
    throw new Error('step01_direct_readback_authority_binding_mismatch');
  }
  return {run, authorization, source};
}

function makeRelease({directTask, directJobRoot, currentRun, readback, readbackEvidence, now}) {
  const gate = (readback.receipts || []).find(item => item && item.receipt_id === 'hq_gate');
  if (!gate || !/^[a-f0-9]{64}$/.test(String(gate.sha256 || '')) || !Number.isSafeInteger(Number(gate.bytes))) {
    throw new Error('step01_direct_readback_gate_evidence_invalid');
  }
  return {
    schema_version:RELEASE_SCHEMA,
    status:'ready',
    project_id:currentRun.project_id,
    direct_job_id:directTask.job_id,
    direct_job_root:path.resolve(directJobRoot),
    analysis_run_id:currentRun.analysis_run_id,
    source_sha256:currentRun.source_sha256,
    source_bytes:currentRun.source_bytes,
    source_revision:currentRun.source_revision,
    settings_version:currentRun.settings_version,
    authorization_event_id:currentRun.authorization_event_id,
    hq_readback:{
      sha256:readbackEvidence.sha256,
      bytes:readbackEvidence.bytes,
      read_at:readback.read_at,
      bridge_release:currentRun.hq_readback?.bridge_release || null,
      hq_gate:{sha256:gate.sha256, bytes:Number(gate.bytes)}
    },
    side_effects:{
      media_provider_network_requested:false,
      media_provider_submit_requested:false,
      media_provider_upload_requested:false,
      spend_requested:false,
      project_media_processed:false
    },
    committed_at:now
  };
}

function sameRelease(existing, expected) {
  return existing?.schema_version === RELEASE_SCHEMA
    && existing.status === 'ready'
    && existing.project_id === expected.project_id
    && existing.direct_job_id === expected.direct_job_id
    && existing.analysis_run_id === expected.analysis_run_id
    && existing.source_sha256 === expected.source_sha256
    && Number(existing.source_bytes) === Number(expected.source_bytes)
    && Number(existing.source_revision) === Number(expected.source_revision)
    && Number(existing.settings_version) === Number(expected.settings_version)
    && existing.authorization_event_id === expected.authorization_event_id
    && existing.hq_readback?.sha256 === expected.hq_readback.sha256
    && Number(existing.hq_readback?.bytes) === Number(expected.hq_readback.bytes)
    && existing.hq_readback?.hq_gate?.sha256 === expected.hq_readback.hq_gate.sha256
    && Number(existing.hq_readback?.hq_gate?.bytes) === Number(expected.hq_readback.hq_gate.bytes);
}

async function syncCanonicalReadbackToDirect({canonicalJobRoot, directJobRoot, now = new Date().toISOString()}) {
  canonicalJobRoot = await assertDirectory(canonicalJobRoot, 'step01_direct_readback_canonical_root_invalid');
  directJobRoot = await assertDirectory(directJobRoot, 'step01_direct_readback_direct_root_invalid');
  const [canonicalTask, currentRun, rawReadback, directTask] = await Promise.all([
    readJson(path.join(canonicalJobRoot, 'task.json')),
    readJson(path.join(canonicalJobRoot, 'current_run.json')),
    fsp.readFile(path.join(canonicalJobRoot, 'mac_hq_fixed_readback.json')),
    readJson(path.join(directJobRoot, 'task.json'))
  ]);
  const readback = JSON.parse(rawReadback.toString('utf8'));
  assertBinding(canonicalTask, currentRun);
  assertBinding(directTask, currentRun);
  const validation = validateReadback(readback, {remoteProjectId:EXACT_REMOTE_PROJECT, settingsVersion:currentRun.settings_version});
  if (!validation.evaluation.ready) throw new Error('step01_direct_readback_not_ready');
  const readbackEvidence = {sha256:sha256(rawReadback), bytes:rawReadback.length};
  if (currentRun.hq_readback?.sha256 !== readbackEvidence.sha256 || Number(currentRun.hq_readback?.bytes) !== readbackEvidence.bytes) {
    throw new Error('step01_direct_readback_current_pointer_mismatch');
  }
  const release = makeRelease({directTask, directJobRoot, currentRun, readback, readbackEvidence, now});
  const releasePath = path.join(directJobRoot, 'mac_hq_fixed_readback_release.json');
  const existing = await readJson(releasePath).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (sameRelease(existing, release)) {
    return {status:'already_synced', release:existing, readback};
  }
  const historyPath = path.join(directJobRoot, 'mac_hq_fixed_readback_release_history', readbackEvidence.sha256 + '.json');
  await fsp.mkdir(path.dirname(historyPath), {recursive:true});
  await fsp.writeFile(historyPath, jsonBytes(release), {flag:'wx'}).catch(error => {
    if (error.code !== 'EEXIST') throw error;
  });
  await atomicJson(path.join(directJobRoot, 'mac_hq_fixed_readback.json'), readback);
  await atomicJson(path.join(directJobRoot, 'current_run.json'), currentRun);
  await atomicJson(releasePath, release);
  return {status:'synced', release, readback};
}

async function readVerifiedDirectRelease({directJobRoot}) {
  directJobRoot = await assertDirectory(directJobRoot, 'step01_direct_readback_direct_root_invalid');
  const releasePath = path.join(directJobRoot, 'mac_hq_fixed_readback_release.json');
  const [release, directTask, currentRun, rawReadback] = await Promise.all([
    readJson(releasePath),
    readJson(path.join(directJobRoot, 'task.json')),
    readJson(path.join(directJobRoot, 'current_run.json')),
    fsp.readFile(path.join(directJobRoot, 'mac_hq_fixed_readback.json'))
  ]);
  assertBinding(directTask, currentRun);
  const readback = JSON.parse(rawReadback.toString('utf8'));
  const validation = validateReadback(readback, {remoteProjectId:EXACT_REMOTE_PROJECT, settingsVersion:currentRun.settings_version});
  if (!validation.evaluation.ready) throw new Error('step01_direct_readback_not_ready');
  const expected = makeRelease({directTask, directJobRoot, currentRun, readback, readbackEvidence:{sha256:sha256(rawReadback), bytes:rawReadback.length}, now:release.committed_at});
  if (!sameRelease(release, expected)) throw new Error('step01_direct_readback_release_mismatch');
  return {release, readback};
}

module.exports = {CURRENT_RUN_SCHEMA, RELEASE_SCHEMA, assertBinding, readVerifiedDirectRelease, sameRelease, syncCanonicalReadbackToDirect};
