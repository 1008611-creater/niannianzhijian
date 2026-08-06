'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const {evaluateHqGate} = require('./niannian_redraw_step01_mac_app_phase');
const {RELEASE_VERSION, negotiateBridge} = require('./niannian_mac_bridge_release');

const READBACK_SCHEMA = 'niannian_mac_hq_fixed_readback_v1';
const EXACT_REMOTE_PROJECT = 'NN-20260715083045-8120F5';
const REQUIRED_IDS = new Set(['hq_gate', 'hq_composite', 'analysis_probe', 'hq_promotion', 'hq_exit']);
const LEGACY_CONTROLLER_BLOCKER = 'STEP01_CONTROLLER_CREDENTIAL_INVALID';

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function jsonBytes(value) { return Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8'); }
async function readJson(filePath) { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
async function atomicCommit(writes) {
  const staged = [];
  try {
    for (const [filePath, value] of writes) {
      await fsp.mkdir(path.dirname(filePath), {recursive:true});
      const temp = filePath + '.hq-readback-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
      await fsp.writeFile(temp, jsonBytes(value), {flag:'wx'});
      staged.push([temp, filePath]);
    }
    for (const [temp, filePath] of staged) await fsp.rename(temp, filePath);
  } catch (error) {
    await Promise.all(staged.map(([temp]) => fsp.rm(temp, {force:true}).catch(() => {})));
    throw error;
  }
}
function assertReceiptMetadata(value, id) {
  if (!value || value.receipt_id !== id || value.status !== 'present' || !/^[a-f0-9]{64}$/.test(String(value.sha256 || '')) || !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > 256 * 1024 || !value.receipt || typeof value.receipt !== 'object') throw new Error('step01_hq_readback_receipt_invalid:' + id);
  return value;
}
function validateReadback(readback, options = {}) {
  const remoteProjectId = String(options.remoteProjectId || EXACT_REMOTE_PROJECT);
  if (remoteProjectId !== EXACT_REMOTE_PROJECT) throw new Error('step01_hq_readback_exact_project_rejected');
  if (!readback || readback.schema_version !== READBACK_SCHEMA || readback.fixed_whitelist !== true || readback.read_only !== true || readback.project_root_binding !== '/Users/lsb/AI-Brain/niannian-ai-canonical-local') throw new Error('step01_hq_readback_contract_invalid');
  for (const key of ['shell_command_requested','media_provider_network_requested','media_provider_submit_requested','media_provider_upload_requested','spend_requested','project_media_processed']) if (readback[key] !== false) throw new Error('step01_hq_readback_side_effect_invalid:' + key);
  const byId = new Map((Array.isArray(readback.receipts) ? readback.receipts : []).map(item => [item && item.receipt_id, item]));
  if (byId.size !== REQUIRED_IDS.size || [...REQUIRED_IDS].some(id => !byId.has(id))) throw new Error('step01_hq_readback_receipt_set_invalid');
  const receipts = Object.fromEntries([...REQUIRED_IDS].map(id => [id, assertReceiptMetadata(byId.get(id), id)]));
  const evaluation = evaluateHqGate(receipts.hq_gate.receipt, {settingsVersion:Number(options.settingsVersion), settingsProfile:'mac-step01-hq-full-evidence-v2', nowMs:options.nowMs});
  return {receipts, evaluation};
}
function removeLegacyCredentialBlocker(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.filter(item => !(item && typeof item === 'object' && item.code === LEGACY_CONTROLLER_BLOCKER)).map(removeLegacyCredentialBlocker);
  const next = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'blocker' && child && typeof child === 'object' && child.code === LEGACY_CONTROLLER_BLOCKER) continue;
    if (key === 'blocker' && child === LEGACY_CONTROLLER_BLOCKER) continue;
    next[key] = removeLegacyCredentialBlocker(child);
  }
  return next;
}
function readbackPointers(receipts) {
  return Object.fromEntries(Object.entries(receipts).map(([id, item]) => [id, {project_relative_path:item.project_relative_path, sha256:item.sha256, bytes:item.bytes}]));
}
async function reconcileVerifiedHqReadback(options = {}) {
  const jobRoot = path.resolve(String(options.jobRoot || ''));
  const task = await readJson(path.join(jobRoot, 'task.json'));
  const remoteProjectId = task.remote_job_id || task.job_id;
  if (remoteProjectId !== EXACT_REMOTE_PROJECT || task.job_id !== path.basename(jobRoot)) throw new Error('step01_hq_readback_job_binding_invalid');
  const validated = validateReadback(options.readback, {remoteProjectId, settingsVersion:task.analysis_authorization?.settings_version || task.authority_bindings?.settings_version || task.settings_version, nowMs:options.nowMs});
  const bridge = negotiateBridge(options.expectedBridgeRelease || {release_version:RELEASE_VERSION}, options.readback.bridge_release);
  const [status, checkpoint, dashboard, ledger] = await Promise.all(['status.json','checkpoint.json','gate_dashboard.json','artifact_ledger.json'].map(name => readJson(path.join(jobRoot, name))));
  const now = new Date(Number(options.nowMs || Date.now())).toISOString();
  const readbackSha256 = sha256(jsonBytes(options.readback));
  const hq = {read_at:String(options.readback.read_at || now), readback_sha256:readbackSha256, receipts:readbackPointers(validated.receipts), evaluation:validated.evaluation};
  // Health timestamps are telemetry. A valid immutable binding remains usable
  // until a real capability or upstream call proves otherwise.
  const healthRefreshRequired = false;
  const gateReady = validated.evaluation.ready === true && bridge.ready === true;
  const typedBlocker = bridge.ready !== true ? {code:'MAC_BRIDGE_UPDATE_REQUIRED', blocker_class:'maintenance', signature:'mac_bridge_update_required', reason:bridge.reason} : (gateReady ? null : {code:'STEP01_HQ_HEALTH_REFRESH_REQUIRED', blocker_class:'resource', signature:'step01_hq_full_capability_gate_not_ready', issues:validated.evaluation.issues});
  const desiredStatus = gateReady ? 'prepared' : (bridge.ready!==true?'blocked_maintenance':'blocked_resource');
  const desiredStep01Gate = gateReady ? 'ready_for_fixed_app_dispatch' : (bridge.ready!==true?'mac_bridge_update_required':'blocked_resource_hq_refresh_required');
  const desiredLayers = {credential_configured:{mimo_asr:true,paddle_ocr:true},health_refresh_required:healthRefreshRequired,mac_bridge_update_required:bridge.ready!==true,step01_state:gateReady?'ready_for_fixed_app_dispatch':'blocked'};
  const alreadyReconciled = status.status === desiredStatus
    && status.hq_readback?.readback_sha256 === readbackSha256
    && JSON.stringify(status.state_layers || null) === JSON.stringify(desiredLayers)
    && dashboard.overall_status === desiredStatus
    && dashboard.gates?.Step01?.status === desiredStep01Gate
    && dashboard.hq_readback?.readback_sha256 === readbackSha256;
  if (alreadyReconciled) return {status:'hq_readback_already_reconciled', hq_ready:gateReady, hq_readback_sha256:readbackSha256, blocker:typedBlocker, media_provider_submit_requested:false, project_media_processed:false, real_delivery:false};
  const cleanStatus = removeLegacyCredentialBlocker(status);
  const cleanCheckpoint = removeLegacyCredentialBlocker(checkpoint);
  const cleanDashboard = removeLegacyCredentialBlocker(dashboard);
  const cleanLedger = removeLegacyCredentialBlocker(ledger);
  cleanStatus.status = desiredStatus; cleanStatus.current_node = 'Step01'; cleanStatus.earliest_incomplete_node = 'Step01'; cleanStatus.next_skill = 'mx-shortdrama-01-frame-extract'; cleanStatus.blocker = typedBlocker; cleanStatus.next_action = gateReady ? 'HQ health readback is fresh. Resume the exact fixed Mac App Step01 once.' : (bridge.ready!==true?'Install or update the fixed Mac bridge through the current Mac Codex Desktop App task; do not use SSH deployment or re-enter credentials.':'Mac must automatically run the minimal synthetic non-project HQ health refresh; no credential re-entry is requested for stale proof.'); cleanStatus.hq_readback = hq; cleanStatus.state_layers=desiredLayers; cleanStatus.updated_at = now;
  cleanCheckpoint.status = cleanStatus.status; cleanCheckpoint.current_node = 'Step01'; cleanCheckpoint.earliest_incomplete_node = 'Step01'; cleanCheckpoint.blockers = typedBlocker ? [typedBlocker] : []; cleanCheckpoint.next_skill = cleanStatus.next_skill; cleanCheckpoint.next_action = cleanStatus.next_action; cleanCheckpoint.hq_readback = hq; cleanCheckpoint.state_layers=desiredLayers; cleanCheckpoint.updated_at = now;
  cleanDashboard.current_node = 'Step01'; cleanDashboard.earliest_incomplete_node = 'Step01'; cleanDashboard.next_skill = cleanStatus.next_skill; cleanDashboard.overall_status = cleanStatus.status; cleanDashboard.blocker = typedBlocker; cleanDashboard.next_action = cleanStatus.next_action; cleanDashboard.gates = {...cleanDashboard.gates, Step01:{...(cleanDashboard.gates?.Step01 || {}), status:desiredStep01Gate, hq_readback:hq, bridge_release:options.readback.bridge_release||{status:'missing'}}}; cleanDashboard.hq_readback = hq; cleanDashboard.state_layers=desiredLayers; cleanDashboard.updated_at = now;
  const artifact = {artifact_id:'mac_hq_fixed_readback',node_id:'Step01',status:'verified',downstream_consumable_by:['Step01'],schema_version:READBACK_SCHEMA,sha256:readbackSha256,bytes:jsonBytes(options.readback).length,readback:hq};
  cleanLedger.artifacts = (Array.isArray(cleanLedger.artifacts) ? cleanLedger.artifacts : []).filter(item => item.artifact_id !== artifact.artifact_id && item.blocker_code !== LEGACY_CONTROLLER_BLOCKER).concat([artifact]); cleanLedger.hq_readback = hq; cleanLedger.updated_at = now;
  await atomicCommit([[path.join(jobRoot, 'status.json'), cleanStatus], [path.join(jobRoot, 'checkpoint.json'), cleanCheckpoint], [path.join(jobRoot, 'gate_dashboard.json'), cleanDashboard], [path.join(jobRoot, 'artifact_ledger.json'), cleanLedger]]);
  await fsp.appendFile(path.join(jobRoot, 'evidence_events.jsonl'), JSON.stringify({schema_version:'niannian_evidence_event_v1', type:'mac_hq_fixed_readback_reconciled', node_id:'Step01', remote_project_id:remoteProjectId, gate_ready:gateReady, hq_readback_sha256:artifact.sha256, at:now}) + '\n', 'utf8');
  return {status:gateReady ? 'hq_readback_ready_reconciled' : (bridge.ready!==true?'hq_readback_bridge_update_required_reconciled':'hq_readback_refresh_required_reconciled'), hq_ready:gateReady, hq_readback_sha256:artifact.sha256, blocker:typedBlocker, media_provider_submit_requested:false, project_media_processed:false, real_delivery:false};
}

module.exports = {EXACT_REMOTE_PROJECT, LEGACY_CONTROLLER_BLOCKER, READBACK_SCHEMA, atomicCommit, reconcileVerifiedHqReadback, validateReadback};
