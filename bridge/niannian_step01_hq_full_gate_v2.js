'use strict';

const crypto = require('crypto');
const fsp = require('fs').promises;
const path = require('path');
const { atomicWrite } = require('./niannian_step01_keychain_credentials');
const { inspectCapability } = require('./niannian_runtime_capability_status');

const REQUIRED = Object.freeze([
  'credential:mimo_asr',
  'credential:paddle_ocr',
  'runtime:transnetv2',
  'runtime:forced_aligner',
]);
const HQ_HEALTH_WINDOW_MINUTES = 55;

const sha = value => crypto.createHash('sha256').update(value).digest('hex');

async function ev(filePath) {
  const exact = path.resolve(filePath);
  const stat = await fsp.lstat(exact);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('hq_v2_evidence_not_regular');
  const bytes = await fsp.readFile(exact);
  return { exact_path: exact, sha256: sha(bytes), bytes: bytes.length, json: JSON.parse(bytes) };
}

function same(actual, expected) {
  return typeof actual === 'string' && actual === expected;
}

function sideFalse(value) {
  return value.provider_upload_requested === false
    && value.provider_submit_requested === false
    && value.spend_requested === false
    && value.real_project_media_processed === false;
}

function inside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return Boolean(relative) && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function validateHistoricalAdoption(candidate, installEvidence, parityEvidence, adoption, entrySha) {
  return same(candidate.bundle_v2?.manifest?.sha256, installEvidence.json.manifest_sha256)
    && same(parityEvidence.json.manifest_sha256, installEvidence.json.manifest_sha256)
    && same(adoption.bindings?.bundle_manifest_sha256, installEvidence.json.manifest_sha256)
    && same(adoption.bindings?.install_receipt_sha256, installEvidence.sha256)
    && same(adoption.bindings?.parity_receipt_sha256, parityEvidence.sha256)
    && same(adoption.bindings?.entrypoint_sha256, entrySha);
}

async function build(options = {}) {
  const now = Number(options.nowMs || Date.now());
  const checked = new Date(now).toISOString();
  const expires = new Date(now + HQ_HEALTH_WINDOW_MINUTES * 60 * 1000).toISOString();
  const projectRoot = path.resolve(options.projectRoot);
  const candidate = await ev(options.candidatePath);
  const install = await ev(options.installPath);
  const parity = await ev(options.parityPath);
  const adoption = await ev(options.adoptionPath);
  const status = (await ev(options.statusPath)).json;
  const compositeEvidence = await ev(options.compositePath);
  const composite = compositeEvidence.json;
  const c = candidate.json;
  const i = install.json;
  const p = parity.json;
  const a = adoption.json;

  if (options.platform !== 'darwin') throw new Error('hq_v2_host_invalid');
  if (c.status !== 'blocked_install_pending' || c.execution_authority_granted !== false
    || i.status !== 'installed_verified' || p.status !== 'exact_parity_verified'
    || a.status !== 'verified' || a.completed !== 5) throw new Error('hq_v2_upstream_invalid');

  const entryPath = path.resolve(c.entrypoint.exact_path);
  const entryBytes = await fsp.readFile(entryPath);
  const entrySha = sha(entryBytes);
  if (entrySha !== c.entrypoint.sha256) throw new Error('hq_v2_entrypoint_invalid');
  if (!validateHistoricalAdoption(c, install, parity, a, entrySha)) throw new Error('hq_v2_upstream_binding_invalid');

  const bindings = {
    toolchain_candidate_sha256: candidate.sha256,
    bundle_manifest_sha256: i.manifest_sha256,
    install_receipt_sha256: install.sha256,
    parity_receipt_sha256: parity.sha256,
    adoption_manifest_sha256: adoption.sha256,
    entrypoint_sha256: entrySha,
  };

  const audits = {};
  for (const key of REQUIRED) audits[key] = inspectCapability(key, status.capabilities?.[key], HQ_HEALTH_WINDOW_MINUTES, now);
  let probeOk = false;
  try {
    const pointer = composite.analysis_probe_receipt || {};
    if (!inside(projectRoot, pointer.exact_path)) throw new Error('probe_path');
    const probeEvidence = await ev(pointer.exact_path);
    const probe = probeEvidence.json;
    const probeChecked = Date.parse(String(probe.checked_at || ''));
    probeOk = probeEvidence.sha256 === pointer.sha256
      && probeEvidence.bytes === Number(pointer.bytes)
      && probe.schema_version === 'niannian_step01_analysis_service_composite_probe_receipt_v1'
      && probe.status === 'passed'
      && probe.test_media_kind === 'synthetic_non_project_media'
      && probe.analysis_service_spend_authorized === true
      && probe.analysis_service_network_requested === true
      && probe.analysis_service_network_used === true
      && probe.analysis_service_requests_created === 2
      && probe.analysis_service_jobs_created === 1
      && probe.mimo_asr?.status === 'passed'
      && probe.mimo_asr?.provider_request_created === true
      && probe.mimo_asr?.provider_job_created === false
      && probe.paddle_ocr?.status === 'passed'
      && probe.paddle_ocr?.provider_job_created === true
      && probe.secret_output === false
      && probe.secret_persisted === false
      && probe.secret_in_argv === false
      && sideFalse(probe)
      && Object.entries(bindings).every(([key, value]) => probe.bindings?.[key] === value)
      && Number.isFinite(probeChecked)
      && now - probeChecked <= HQ_HEALTH_WINDOW_MINUTES * 60 * 1000
      && probeChecked <= now + 60000;
  } catch {
    probeOk = false;
  }

  const compositeChecked = Date.parse(String(composite.checked_at || ''));
  const compositeOk = composite.schema_version === 'niannian_hq_full_composite_evidence_v2'
    && composite.status === 'passed'
    && composite.test_media_kind === 'synthetic_non_project_media'
    && composite.analysis_service_spend_authorized === true
    && composite.analysis_service_network_requested === true
    && composite.analysis_service_network_used === true
    && composite.analysis_service_requests_created === 2
    && composite.analysis_service_jobs_created === 1
    && probeOk
    && sideFalse(composite)
    && Object.entries(bindings).every(([key, value]) => composite.bindings?.[key] === value)
    && Number.isFinite(compositeChecked)
    && now - compositeChecked <= HQ_HEALTH_WINDOW_MINUTES * 60 * 1000
    && compositeChecked <= now + 60000
    && REQUIRED.every(key => audits[key].ready);

  audits['runtime:hq'] = {
    capability: 'runtime:hq',
    ready: compositeOk,
    status: compositeOk ? 'ready' : 'blocked',
    reason: compositeOk ? null : 'hq_composite_or_prerequisite_invalid',
    checked_at: checked,
    expires_at: expires,
    evidence: {
      method: 'hash_bound_synthetic_non_project_media_composite',
      summary: compositeOk ? 'Fresh source-only Step01 runtime gate passed for the 55 minute execution-start window.' : 'HQ remains blocked; no project media was processed.',
    },
  };
  const ready = REQUIRED.every(key => audits[key].ready) && audits['runtime:hq'].ready;
  const receipt = {
    schema_version: 'niannian_step01_hq_full_gate_receipt_v2',
    status: ready ? 'ready' : 'blocked',
    ready,
    host: { platform: 'darwin', project_root: projectRoot },
    settings_binding: { version: Number(options.settingsVersion), profile: String(options.settingsProfile) },
    capability_audits: audits,
    bindings,
    adoption_binding_policy: 'historical_bundle_install_parity_entrypoint; candidate_metadata_drift_auto_repair',
    composite: {
      ok: compositeOk,
      status: composite.status,
      test_media_kind: composite.test_media_kind,
      evidence: { exact_path: compositeEvidence.exact_path, sha256: compositeEvidence.sha256, bytes: compositeEvidence.bytes },
      analysis_probe_receipt: composite.analysis_probe_receipt,
    },
    provider_network_requested: false,
    provider_upload_requested: false,
    provider_submit_requested: false,
    spend_requested: false,
    real_project_media_processed: false,
    real_delivery: false,
    checked_at: checked,
    expires_at: expires,
  };
  if (!Number.isInteger(receipt.settings_binding.version) || !receipt.settings_binding.profile) throw new Error('hq_v2_settings_invalid');
  await atomicWrite(path.resolve(options.receiptPath), receipt);
  return receipt;
}

module.exports = { HQ_HEALTH_WINDOW_MINUTES, REQUIRED, build };
