'use strict';

// Windows-side half of the pull relay. It deliberately keeps the website bridge
// token on this machine and exports only a single, hash-verified job contract.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const step01PhaseTransport = require('./niannian_redraw_step01_mac_app_phase_transport');
const artifactBroker = require('./niannian_step01_artifact_broker');
const brokerTransport = require('./niannian_redraw_step01_artifact_broker_transport');

const EXPORT_CONTRACT_FILES = Object.freeze([
  'artifact_ledger.json',
  'assignments.json',
  'checkpoint.json',
  'codex_prompt.md',
  'gate_dashboard.json',
  'gate_dashboard.md',
  'result_manifest.json',
  'route_decision.json',
  'status.json',
  'task.json',
  'transaction_intent.json',
  'worker_report.md'
]);

const RETURN_FILES = Object.freeze([
  'status.json',
  'checkpoint.json',
  'gate_dashboard.json',
  'artifact_ledger.json',
  'result_manifest.json',
  'worker_report.md',
  'employee_dispatch.json',
  'employee_worker_receipt.json',
  'employee_preflight.json'
]);

const STEP01_EVIDENCE_BUNDLE_FILES = Object.freeze([
  'step01_evidence_bundle_manifest.json',
  'step01_evidence_bundle.zip'
]);
const REQUIRED_RETURN_FILES = new Set(RETURN_FILES);
const MAX_RETURN_FILE_BYTES = 5 * 1024 * 1024;
const MAX_STEP01_EVIDENCE_FILES = 100;
const MAX_STEP01_EVIDENCE_FILE_BYTES = 10 * 1024 * 1024;
const MAX_STEP01_EVIDENCE_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_STEP01_EVIDENCE_BUNDLE_BYTES = MAX_STEP01_EVIDENCE_TOTAL_BYTES + (5 * 1024 * 1024);

function now() { return new Date().toISOString(); }

function safeJobId(value) {
  const id = String(value || '').trim();
  if (!/^web_n[ns]-[a-z0-9-]{10,100}$/.test(id)) throw new Error('mac_relay_job_id_invalid');
  return id;
}

function safeStep01PhaseKey(value) {
  const key = String(value || '').trim();
  if (!/^step01phase-[a-f0-9]{64}$/.test(key)) throw new Error('mac_relay_step01_phase_key_invalid');
  return key;
}

function safeSha256(value, code = 'mac_relay_sha_invalid') {
  const sha = String(value || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha)) throw new Error(code);
  return sha;
}

function isInside(parent, candidate) {
  const base = path.resolve(parent);
  const target = path.resolve(candidate);
  return target === base || target.startsWith(base + path.sep);
}

function safeRelative(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0') || normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('mac_relay_relative_path_invalid');
  }
  return normalized;
}

function recoveryLabel() {
  return now().replace(/[^0-9]/g, '').slice(0, 14) + '-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
}

async function archiveDirectory(sourcePath, archiveParent, code) {
  const source = path.resolve(sourcePath);
  const parent = path.resolve(archiveParent);
  const stats = await fsp.lstat(source).catch(() => null);
  if (!stats) return null;
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error(code + '_source_invalid');
  await fsp.mkdir(parent, { recursive:true });
  const destination = path.join(parent, recoveryLabel());
  if (!isInside(parent, destination)) throw new Error(code + '_archive_path_invalid');
  await fsp.rename(source, destination);
  return destination;
}

function relayConfig(overrides = {}) {
  const userHome = os.homedir();
  const runtimeRoot = path.resolve(overrides.runtimeRoot || process.env.NIANNIAN_MAC_RELAY_RUNTIME || path.join(userHome, 'ai-brain-mac-relay-runtime'));
  const exportRoot = path.resolve(overrides.exportRoot || process.env.NIANNIAN_MAC_RELAY_EXPORT_ROOT || path.join(userHome, 'ai-brain-relay'));
  const workspace = path.resolve(overrides.workspace || process.env.NIANNIAN_MAC_RELAY_WORKSPACE || path.join(runtimeRoot, 'workspace'));
  const stateRoot = path.resolve(overrides.stateRoot || path.join(runtimeRoot, 'controller-state'));
  const baseUrl = String(overrides.baseUrl || process.env.NIANNIAN_BASE_URL || 'http://127.0.0.1:4188').replace(/\/$/, '');
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new Error('mac_relay_local_base_url_invalid'); }
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error('mac_relay_base_url_must_be_localhost');
  }
  return {
    runtimeRoot,
    exportRoot,
    workspace,
    stateRoot,
    productionIndex:path.join(workspace, '06_AUTOMATION', 'production_jobs.index.json'),
    baseUrl,
    controllerId:String(overrides.controllerId || process.env.NIANNIAN_CONTROLLER_ID || 'niannian-mac-relay').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80)
  };
}

function configureControllerEnvironment(config) {
  process.env.ZHUANHUI_WORKSPACE = config.workspace;
  process.env.NIANNIAN_PRODUCTION_INDEX = config.productionIndex;
  process.env.NIANNIAN_BRIDGE_STATE_DIR = config.stateRoot;
  process.env.NIANNIAN_BASE_URL = config.baseUrl;
  process.env.NIANNIAN_CONTROLLER_ID = config.controllerId;
}

function loadControllerBridge(config) {
  configureControllerEnvironment(config);
  const bridgePath = path.join(__dirname, 'niannian_controller_bridge.js');
  delete require.cache[require.resolve(bridgePath)];
  return require(bridgePath);
}

async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive:true });
  const temporary = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fsp.rename(temporary, filePath);
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath);
    input.on('data', chunk => { bytes += chunk.length; hash.update(chunk); });
    input.on('error', reject);
    input.on('end', resolve);
  });
  return { bytes, sha256:hash.digest('hex') };
}

async function ensureRegularFile(filePath, code) {
  const stats = await fsp.lstat(filePath).catch(() => null);
  if (!stats || !stats.isFile() || stats.isSymbolicLink()) throw new Error(code);
  return stats;
}

function looksSensitive(text) {
  return [
    /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i,
    /(?:aws_access_key_id|aws_secret_access_key)\s*[:=]/i,
    /\bAKIA[0-9A-Z]{16}\b/,
    /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/i,
    /authorization\s*:\s*bearer\s+[A-Za-z0-9_./+=-]{12,}/i
  ].some(pattern => pattern.test(text));
}

async function assertNoSensitiveText(filePath) {
  if (!/\.(?:json|md)$/i.test(filePath)) return;
  const content = await fsp.readFile(filePath, 'utf8');
  if (looksSensitive(content)) throw new Error('mac_relay_return_sensitive_content_rejected');
}

function isStep01EvidenceBundleFile(relative) {
  return STEP01_EVIDENCE_BUNDLE_FILES.includes(relative);
}

function evidenceBundleEntryLimit(relative) {
  return relative === 'step01_evidence_bundle.zip'
    ? MAX_STEP01_EVIDENCE_BUNDLE_BYTES
    : MAX_RETURN_FILE_BYTES;
}

function safeEvidenceArchivePath(value) {
  const relative = safeRelative(value);
  if (!relative.startsWith('evidence/') || relative.split('/').length !== 2) {
    throw new Error('mac_relay_step01_bundle_archive_path_invalid');
  }
  return relative;
}

function safeEvidenceArtifactId(value) {
  const artifactId = String(value || '');
  if (!/^[a-zA-Z0-9._-]{1,160}$/.test(artifactId)) {
    throw new Error('mac_relay_step01_bundle_artifact_id_invalid');
  }
  return artifactId;
}

async function validateStep01EvidenceBundle(root, jobId, expectedSourceSha256, ledger, receipt) {
  const manifestPath = path.join(root, STEP01_EVIDENCE_BUNDLE_FILES[0]);
  const zipPath = path.join(root, STEP01_EVIDENCE_BUNDLE_FILES[1]);
  const bundle = await readJson(manifestPath);
  if (!bundle || bundle.schema_version !== 'niannian_step01_evidence_bundle_v1' ||
      bundle.job_id !== jobId || bundle.source_sha256 !== expectedSourceSha256 ||
      bundle.receipt_dispatch_id !== receipt.dispatch_id || !Array.isArray(bundle.files) ||
      !Number.isInteger(bundle.total_bytes) || bundle.total_bytes < 0 || bundle.total_bytes > MAX_STEP01_EVIDENCE_TOTAL_BYTES) {
    throw new Error('mac_relay_step01_bundle_manifest_invalid');
  }
  if (!Array.isArray(ledger.artifacts)) throw new Error('mac_relay_step01_bundle_ledger_invalid');
  if (!bundle.files.length || bundle.files.length > MAX_STEP01_EVIDENCE_FILES) {
    throw new Error('mac_relay_step01_bundle_file_count_invalid');
  }
  const expectedArtifacts = new Map();
  for (const artifact of ledger.artifacts) {
    if (artifact && artifact.node_id === 'Step01' && artifact.status === 'verified' && artifact.artifact_id !== 'source_video') {
      const id = safeEvidenceArtifactId(artifact.artifact_id);
      if (expectedArtifacts.has(id)) throw new Error('mac_relay_step01_bundle_ledger_artifact_duplicate');
      expectedArtifacts.set(id, artifact);
    }
  }
  const ids = new Set();
  const archivePaths = new Set();
  let totalBytes = 0;
  const byArtifactId = new Map();
  for (const entry of bundle.files) {
    if (!entry || typeof entry !== 'object') throw new Error('mac_relay_step01_bundle_entry_invalid');
    const artifactId = safeEvidenceArtifactId(entry.artifact_id);
    const archivePath = safeEvidenceArchivePath(entry.archive_path);
    if (ids.has(artifactId) || archivePaths.has(archivePath) || !expectedArtifacts.has(artifactId) ||
        !Number.isInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > MAX_STEP01_EVIDENCE_FILE_BYTES ||
        !/^[a-f0-9]{64}$/.test(String(entry.sha256 || ''))) {
      throw new Error('mac_relay_step01_bundle_entry_invalid');
    }
    const ledgerArtifact = expectedArtifacts.get(artifactId);
    if (ledgerArtifact.sha256 !== entry.sha256 || Number(ledgerArtifact.bytes) !== entry.bytes) {
      throw new Error('mac_relay_step01_bundle_ledger_hash_mismatch');
    }
    totalBytes += entry.bytes;
    if (totalBytes > MAX_STEP01_EVIDENCE_TOTAL_BYTES) throw new Error('mac_relay_step01_bundle_size_exceeded');
    ids.add(artifactId);
    archivePaths.add(archivePath);
    byArtifactId.set(artifactId, { ...entry, artifact_id:artifactId, archive_path:archivePath });
  }
  if (totalBytes !== bundle.total_bytes || ids.size !== expectedArtifacts.size ||
      ![...expectedArtifacts.keys()].every(id => ids.has(id)) ||
      ![...ids].some(id => /evidence_manifest/i.test(id)) ||
      ![...ids].some(id => /validation_report/i.test(id))) {
    throw new Error('mac_relay_step01_bundle_contract_incomplete');
  }

  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(await fsp.readFile(zipPath), { createFolders:false, checkCRC32:true });
  const zipFiles = Object.values(zip.files).filter(file => !file.dir);
  if (zipFiles.length !== byArtifactId.size) throw new Error('mac_relay_step01_bundle_zip_entry_count_invalid');
  const seenZipPaths = new Set();
  for (const file of zipFiles) {
    const archivePath = safeEvidenceArchivePath(file.name);
    if (seenZipPaths.has(archivePath) || !archivePaths.has(archivePath)) {
      throw new Error('mac_relay_step01_bundle_zip_path_invalid');
    }
    const entry = [...byArtifactId.values()].find(item => item.archive_path === archivePath);
    const content = await file.async('nodebuffer');
    const digest = crypto.createHash('sha256').update(content).digest('hex');
    if (content.length !== entry.bytes || digest !== entry.sha256) {
      throw new Error('mac_relay_step01_bundle_zip_hash_mismatch');
    }
    seenZipPaths.add(archivePath);
  }
  if (seenZipPaths.size !== archivePaths.size) throw new Error('mac_relay_step01_bundle_zip_contract_incomplete');
  return { manifest:bundle, files:[...byArtifactId.values()] };
}

async function hydrateStep01EvidenceBundle(stagingRoot, jobRoot, bundle) {
  const bundleHash = (await sha256File(path.join(stagingRoot, STEP01_EVIDENCE_BUNDLE_FILES[1]))).sha256;
  const bundleLabel = bundleHash.slice(0, 16);
  const finalRoot = path.join(jobRoot, 'step01_evidence_payload', bundleLabel);
  const extractedRoot = path.join(stagingRoot, 'step01_evidence_payload', bundleLabel);
  if (await fsp.lstat(finalRoot).catch(() => null)) throw new Error('mac_relay_step01_bundle_payload_already_exists');
  await fsp.mkdir(extractedRoot, { recursive:true });
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(await fsp.readFile(path.join(stagingRoot, STEP01_EVIDENCE_BUNDLE_FILES[1])), { createFolders:false, checkCRC32:true });
  const byArtifactId = new Map(bundle.files.map(entry => [entry.artifact_id, entry]));
  for (const entry of bundle.files) {
    const zipEntry = zip.file(entry.archive_path);
    if (!zipEntry || Array.isArray(zipEntry)) throw new Error('mac_relay_step01_bundle_zip_entry_missing');
    const target = path.resolve(extractedRoot, entry.archive_path);
    if (!isInside(extractedRoot, target)) throw new Error('mac_relay_step01_bundle_extract_path_escape');
    const content = await zipEntry.async('nodebuffer');
    const digest = crypto.createHash('sha256').update(content).digest('hex');
    if (content.length !== entry.bytes || digest !== entry.sha256) throw new Error('mac_relay_step01_bundle_extract_hash_mismatch');
    await fsp.mkdir(path.dirname(target), { recursive:true });
    await fsp.writeFile(target, content, { flag:'wx' });
  }
  const ledgerPath = path.join(stagingRoot, 'artifact_ledger.json');
  const ledger = await readJson(ledgerPath);
  if (!ledger || !Array.isArray(ledger.artifacts)) throw new Error('mac_relay_step01_bundle_ledger_invalid');
  ledger.artifacts = ledger.artifacts.map(artifact => {
    const entry = artifact && byArtifactId.get(artifact.artifact_id);
    return entry ? { ...artifact, exact_path:path.join(finalRoot, entry.archive_path) } : artifact;
  });
  await atomicJson(ledgerPath, ledger);
  return { bundleHash, bundleLabel, finalRoot, artifactCount:bundle.files.length };
}

async function appendEvidenceBundleEvent(jobRoot, jobId, receipt, hydration) {
  const eventPath = path.join(jobRoot, 'evidence_events.jsonl');
  const eventId = 'step01_evidence_bundle_hydrated:' + String(receipt.dispatch_id || 'unknown') + ':' + hydration.bundleLabel;
  const existing = await fsp.readFile(eventPath, 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error));
  if (existing.split(/\r?\n/).filter(Boolean).some(line => {
    try { return JSON.parse(line).event_id === eventId; } catch { return false; }
  })) return false;
  await fsp.appendFile(eventPath, JSON.stringify({
    at:now(), event_id:eventId, type:'step01_evidence_bundle_hydrated', job_id:jobId,
    dispatch_id:receipt.dispatch_id || null, bundle_sha256:hydration.bundleHash,
    artifact_count:hydration.artifactCount
  }) + '\n', 'utf8');
  return true;
}

async function fileManifest(root, relativePaths) {
  const files = [];
  for (const requested of relativePaths) {
    const relativePath = safeRelative(requested);
    const absolutePath = path.resolve(root, relativePath);
    if (!isInside(root, absolutePath)) throw new Error('mac_relay_manifest_path_escape');
    await ensureRegularFile(absolutePath, 'mac_relay_manifest_file_missing');
    const evidence = await sha256File(absolutePath);
    files.push({ path:relativePath, bytes:evidence.bytes, sha256:evidence.sha256 });
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function copyVerifiedFile(source, destination) {
  await ensureRegularFile(source, 'mac_relay_source_file_missing');
  await fsp.mkdir(path.dirname(destination), { recursive:true });
  await fsp.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
}

async function exportN06Assets(task, jobRoot, stagingRoot) {
  const n06 = task && task.n06_real_submit;
  if (!n06) return [];
  if (!Array.isArray(n06.references) || !n06.references.length || n06.references.length > 9) throw new Error('mac_relay_n06_reference_count_invalid');
  const seenKeys = new Set();
  const seenPaths = new Set();
  const assets = [];
  for (const reference of n06.references) {
    const refKey = String(reference && reference.ref_key || '');
    const expectedSha = String(reference && reference.sha256 || '').toLowerCase();
    const source = path.resolve(String(reference && reference.path || ''));
    if (!/^[A-Za-z0-9._-]{1,160}$/.test(refKey) || seenKeys.has(refKey) || !/^[a-f0-9]{64}$/.test(expectedSha) || !isInside(jobRoot, source)) throw new Error('mac_relay_n06_reference_contract_invalid');
    const evidence = await sha256File(source);
    if (evidence.sha256 !== expectedSha) throw new Error('mac_relay_n06_reference_hash_mismatch');
    const relative = safeRelative(path.posix.join('n06', 'references', evidence.sha256 + path.extname(source).toLowerCase()));
    if (seenPaths.has(relative)) throw new Error('mac_relay_n06_reference_path_collision');
    await copyVerifiedFile(source, path.join(stagingRoot, relative));
    seenKeys.add(refKey); seenPaths.add(relative);
    assets.push({ref_key:refKey, path:relative, sha256:evidence.sha256});
  }
  return assets.sort((left, right) => left.ref_key.localeCompare(right.ref_key));
}

function resolveTaskSource(task) {
  if (task && task.source_video && task.source_script) throw new Error('mac_relay_source_contract_ambiguous');
  if (task && task.source_video) return { kind:'source_video', field:'source_video', value:task.source_video };
  if (task && task.source_script) return { kind:'source_script', field:'source_script', value:task.source_script };
  throw new Error('mac_relay_source_contract_missing');
}

async function exportJob(record, config = relayConfig()) {
  const localJobId = safeJobId(record && record.localJobId);
  const jobRoot = path.resolve(String(record && record.root || ''));
  if (!jobRoot || !await fsp.stat(jobRoot).then(stats => stats.isDirectory(), () => false)) throw new Error('mac_relay_job_root_missing');

  const taskPath = path.join(jobRoot, 'task.json');
  const task = await readJson(taskPath);
  if (!task || task.job_id !== localJobId) throw new Error('mac_relay_task_contract_invalid');
  const sourceContract = resolveTaskSource(task);
  const sourcePath = path.resolve(String(sourceContract.value.exact_path || ''));
  if (!isInside(jobRoot, sourcePath)) throw new Error('mac_relay_source_outside_job');
  const expectedSha256 = String(record.sourceSha256 || sourceContract.value.sha256 || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error('mac_relay_source_hash_invalid');
  const sourceEvidence = await sha256File(sourcePath);
  if (sourceEvidence.sha256 !== expectedSha256) throw new Error('mac_relay_source_hash_mismatch');

  const finalRoot = path.join(config.exportRoot, 'jobs', localJobId);
  const stagingRoot = finalRoot + '.incoming-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.rm(stagingRoot, { recursive:true, force:true });
  await archiveDirectory(finalRoot, path.join(config.exportRoot, 'history', localJobId), 'mac_relay_export');
  try {
    for (const relativePath of EXPORT_CONTRACT_FILES) {
      await copyVerifiedFile(path.join(jobRoot, relativePath), path.join(stagingRoot, relativePath));
    }
    const n06Assets = await exportN06Assets(task, jobRoot, stagingRoot);
    const sourceRelativePath = safeRelative(path.posix.join('source', path.basename(sourcePath)));
    await copyVerifiedFile(sourcePath, path.join(stagingRoot, sourceRelativePath));
    await fsp.writeFile(path.join(stagingRoot, 'source.sha256'), sourceEvidence.sha256 + '  ' + sourceRelativePath + '\n', 'utf8');
    const files = await fileManifest(stagingRoot, EXPORT_CONTRACT_FILES.concat([sourceRelativePath, 'source.sha256'], n06Assets.map(asset => asset.path)));
    const manifest = {
      schema_version:'niannian_mac_transport_v1',
      job_id:localJobId,
      remote_job_id:String(record.remoteJobId || task.remote_job_id || ''),
      source_kind:sourceContract.kind,
      source_sha256:sourceEvidence.sha256,
      source_path:sourceRelativePath,
      ...(n06Assets.length ? {n06_assets:n06Assets} : {}),
      files,
      generated_at:now()
    };
    await atomicJson(path.join(stagingRoot, 'transport_manifest.json'), manifest);
    await fsp.mkdir(path.dirname(finalRoot), { recursive:true });
    await fsp.rename(stagingRoot, finalRoot);
    return { jobId:localJobId, exportPath:finalRoot, manifest };
  } catch (error) {
    await fsp.rm(stagingRoot, { recursive:true, force:true });
    throw error;
  }
}

function relayStatePath(config) { return path.join(config.runtimeRoot, 'relay_state.json'); }

async function loadRelayState(config) {
  const state = await readJson(relayStatePath(config), {});
  return {
    schema_version:1,
    pending:state.pending && typeof state.pending === 'object' ? state.pending : null,
    history:Array.isArray(state.history) ? state.history.slice(-20) : []
  };
}

async function saveRelayState(config, state) {
  await atomicJson(relayStatePath(config), { ...state, schema_version:1, updated_at:now() });
}

async function findControllerRecord(bridge, localJobId) {
  const state = await bridge.loadState();
  for (const record of Object.values(state.jobs || {})) {
    if (record && record.localJobId === localJobId) return { state, record };
  }
  throw new Error('mac_relay_controller_record_missing');
}

async function findIndexedScriptRecord(config, handledJobIds, requestedJobId = null) {
  const index = await readJson(config.productionIndex, {jobs:[]});
  const row = (Array.isArray(index.jobs) ? index.jobs : []).find(item =>
    item && item.entrypoint === 'codex_direct' && item.source_entrypoint === 'niannian_ai_web_script' &&
    item.job_id && !handledJobIds.has(item.job_id) && (!requestedJobId || item.job_id === requestedJobId) &&
    ['prepared','queued','running_n01'].includes(item.status)
  );
  if (!row) return null;
  const localJobId = safeJobId(row.job_id);
  const root = path.resolve(String(row.job_dir || ''));
  const task = await readJson(path.join(root, 'task.json'));
  const sourceContract = resolveTaskSource(task);
  if (!sourceContract.value || !/^[a-f0-9]{64}$/.test(String(sourceContract.value.sha256 || ''))) {
    throw new Error('mac_relay_indexed_script_source_contract_invalid');
  }
  return { localJobId, remoteJobId:row.remote_job_id || task.remote_job_id || null, root, sourceSha256:sourceContract.value.sha256 };
}

async function claimExport(config = relayConfig(), requestedJobId = null) {
  const requested = requestedJobId ? safeJobId(requestedJobId) : null;
  const relayState = await loadRelayState(config);
  if (relayState.pending) {
    if (requested && relayState.pending.job_id !== requested) throw new Error('mac_relay_requested_job_conflicts_pending');
    const existingRoot = path.join(config.exportRoot, 'jobs', relayState.pending.job_id);
    const existingManifest = await readJson(path.join(existingRoot, 'transport_manifest.json'));
    if (!existingManifest || existingManifest.job_id !== relayState.pending.job_id) throw new Error('mac_relay_pending_export_missing');
    return { status:'already_exported', jobId:relayState.pending.job_id, exportPath:existingRoot };
  }
  const handledJobIds = new Set(relayState.history.map(entry => entry && entry.job_id).filter(Boolean));
  const indexedScriptRecord = await findIndexedScriptRecord(config, handledJobIds, requested);
  if (indexedScriptRecord) {
    const exported = await exportJob(indexedScriptRecord, config);
    relayState.pending = {
      job_id:exported.jobId,
      remote_job_id:indexedScriptRecord.remoteJobId,
      exported_at:now(),
      source_sha256:exported.manifest.source_sha256
    };
    await saveRelayState(config, relayState);
    return { status:'exported_script_job', jobId:exported.jobId, exportPath:exported.exportPath, sourceSha256:exported.manifest.source_sha256 };
  }
  const bridge = loadControllerBridge(config);
  const token = await bridge.loadToken();
  const state = await bridge.loadState();
  const untrackedRecord = requested
    ? Object.values(state.jobs || {}).find(record => record && record.localJobId === requested && !handledJobIds.has(record.localJobId))
    : Object.values(state.jobs || {}).find(record => record && record.localJobId && !handledJobIds.has(record.localJobId));
  if (untrackedRecord) {
    const exported = await exportJob(untrackedRecord, config);
    relayState.pending = {
      job_id:exported.jobId,
      remote_job_id:untrackedRecord.remoteJobId,
      exported_at:now(),
      source_sha256:exported.manifest.source_sha256
    };
    await saveRelayState(config, relayState);
    return { status:'recovered_export', jobId:exported.jobId, exportPath:exported.exportPath, sourceSha256:exported.manifest.source_sha256 };
  }
  if (requested) throw new Error('mac_relay_requested_job_not_found');
  const result = await bridge.runOnce(token, state);
  if (!result.mirrored) return { status:'idle' };
  const record = state.jobs[result.mirrored.remoteJobId];
  if (!record) throw new Error('mac_relay_mirrored_record_missing');
  const exported = await exportJob(record, config);
  relayState.pending = {
    job_id:exported.jobId,
    remote_job_id:record.remoteJobId,
    exported_at:now(),
    source_sha256:exported.manifest.source_sha256
  };
  await saveRelayState(config, relayState);
  return { status:'exported', jobId:exported.jobId, exportPath:exported.exportPath, sourceSha256:exported.manifest.source_sha256 };
}

function step01PhaseExportRoot(config, jobId, phaseKey) {
  const root = path.resolve(config.exportRoot, 'step01-phases', jobId, phaseKey);
  if (!isInside(path.resolve(config.exportRoot, 'step01-phases'), root)) throw new Error('mac_relay_step01_phase_export_path_invalid');
  return root;
}

function step01PhaseReturnRoot(config, jobId, phaseKey) {
  const root = path.resolve(config.exportRoot, 'step01-phase-returns', jobId, phaseKey);
  if (!isInside(path.resolve(config.exportRoot, 'step01-phase-returns'), root)) throw new Error('mac_relay_step01_phase_return_path_invalid');
  return root;
}

async function currentStep01Phase(config, jobId, expectedPhaseKey, expectedManifestSha256) {
  const bridge = loadControllerBridge(config);
  const {record} = await findControllerRecord(bridge, jobId);
  const directRoot = path.resolve(String(record.root || ''));
  const directJobsRoot = path.resolve(config.workspace, '06_AUTOMATION', 'direct_jobs');
  if (!isInside(directJobsRoot, directRoot)) throw new Error('mac_relay_step01_phase_direct_root_invalid');
  const [task, currentRun, release] = await Promise.all([
    readJson(path.join(directRoot, 'task.json')),
    readJson(path.join(directRoot, 'current_run.json')),
    readJson(path.join(directRoot, 'mac_hq_fixed_readback_release.json'))
  ]);
  if (!task || task.job_id !== jobId || currentRun?.project_id !== 'NN-20260715083045-8120F5' || currentRun.analysis_run_id !== task.analysis_run?.id || currentRun.source_sha256 !== task.source_video?.sha256 || Number(currentRun.source_bytes) !== Number(task.source_video?.bytes) || release?.status !== 'ready' || release.analysis_run_id !== currentRun.analysis_run_id || release.source_sha256 !== currentRun.source_sha256 || release.authorization_event_id !== currentRun.authorization_event_id || release.hq_readback?.sha256 !== currentRun.hq_readback?.sha256) {
    throw new Error('mac_relay_step01_phase_current_binding_invalid');
  }
  const packageRoot = path.resolve(directRoot, 'step01_app_phase_exports', expectedPhaseKey);
  if (!isInside(path.resolve(directRoot, 'step01_app_phase_exports'), packageRoot)) throw new Error('mac_relay_step01_phase_package_path_invalid');
  const verified = await step01PhaseTransport.verifyManifest(packageRoot, 'step01_phase_manifest.json', step01PhaseTransport.EXPORT_MANIFEST_SCHEMA, expectedManifestSha256);
  const dispatch = await readJson(path.join(packageRoot, 'step01_employee_dispatch.json'));
  if (verified.phase.key_id !== expectedPhaseKey || verified.phase.job_id !== jobId || dispatch?.local_job_id !== jobId || dispatch?.remote_project_id !== currentRun.project_id || dispatch?.analysis_run_id !== currentRun.analysis_run_id || dispatch?.source_sha256 !== currentRun.source_sha256 || Number(dispatch?.source_bytes) !== Number(currentRun.source_bytes) || Number(dispatch?.settings_version) !== Number(currentRun.settings_version) || dispatch?.authorization_event_id !== currentRun.authorization_event_id || dispatch?.employee?.thread_id !== '019f6201-c013-7cf3-b155-61d2789085f4') {
    throw new Error('mac_relay_step01_phase_dispatch_binding_invalid');
  }
  return {bridge, record, directRoot, currentRun, release, packageRoot, verified, dispatch};
}

function currentBrokerBinding(current, requestId = null) {
  const binding={project_id:current.currentRun.project_id,analysis_run_id:current.currentRun.analysis_run_id,phase_key:current.verified.phase.key_id,package_manifest_sha256:current.verified.manifestSha256};
  return requestId ? {...binding,request_id:requestId} : binding;
}

function configuredArtifactBroker() {
  const config=artifactBroker.configuredCosBroker(process.env);
  if(config.ready!==true){const error=new Error(config.code||'ARTIFACT_BROKER_NOT_CONFIGURED');error.code=config.code||'ARTIFACT_BROKER_NOT_CONFIGURED';throw error;}
  return config;
}

async function issueStep01PackageGrants(jobId, phaseKey, manifestSha256, config = relayConfig()) {
  const current=await currentStep01Phase(config,jobId,phaseKey,manifestSha256);
  const cos=configuredArtifactBroker();
  const binding=currentBrokerBinding(current);
  const client=artifactBroker.createCosBroker(cos);
  await brokerTransport.publishPackageToBroker({broker:client,binding,package_root:current.packageRoot,issue_package_grant:async input=>artifactBroker.presignCosObject(cos,{operation:'PUT',...input})});
  const manifestEvidence=await step01PhaseTransport.fileEvidence(path.join(current.packageRoot,'step01_phase_manifest.json'));
  const fileGrants=[];
  for(const item of current.verified.manifest.files){
    const relative=step01PhaseTransport.safeRelative(item.relative_path);
    fileGrants.push({...artifactBroker.presignCosObject(cos,{operation:'GET',object_key:brokerTransport.packageKeyForRelative(binding,relative,item.sha256),sha256:item.sha256,bytes:item.bytes,binding}),relative_path:relative});
  }
  return {transport:'cos',binding,manifest_grant:artifactBroker.presignCosObject(cos,{operation:'GET',object_key:brokerTransport.packageKeyForRelative(binding,'step01_phase_manifest.json',manifestEvidence.sha256,'phase-manifest'),sha256:manifestEvidence.sha256,bytes:manifestEvidence.bytes,binding}),file_grants:fileGrants};
}

async function issueStep01ReturnGrant(jobId, phaseKey, manifestSha256, requestId, returnManifestSha256, returnManifestBytes, relativePath, objectSha256, objectBytes, config = relayConfig()) {
  const current=await currentStep01Phase(config,jobId,phaseKey,manifestSha256);
  const cos=configuredArtifactBroker();
  const normalizedRequestId=String(requestId||'');
  if(!/^[A-Za-z0-9._-]{8,96}$/.test(normalizedRequestId))throw new Error('mac_relay_step01_return_grant_request_id_invalid');
  const binding=currentBrokerBinding(current,normalizedRequestId);
  const relative=step01PhaseTransport.safeRelative(relativePath);
  const sha=safeSha256(objectSha256,'mac_relay_step01_return_grant_sha_invalid');
  const bytes=Number(objectBytes);
  if(!Number.isSafeInteger(bytes)||bytes<1||bytes>MAX_STEP01_EVIDENCE_BUNDLE_BYTES)throw new Error('mac_relay_step01_return_grant_bytes_invalid');
  const returnManifestSha=safeSha256(returnManifestSha256,'mac_relay_step01_return_manifest_sha_invalid');
  const returnManifestSize=Number(returnManifestBytes);
  if(!Number.isSafeInteger(returnManifestSize)||returnManifestSize<1||returnManifestSize>MAX_RETURN_FILE_BYTES)throw new Error('mac_relay_step01_return_manifest_bytes_invalid');
  const manifestKey=brokerTransport.returnKeyForRelative(binding,'step01_return_transport_manifest.json',returnManifestSha,'return-manifest');
  if(relative==='step01_return_transport_manifest.json'){
    if(sha!==returnManifestSha||bytes!==returnManifestSize)throw new Error('mac_relay_step01_return_manifest_grant_binding_invalid');
  }
  if(relative!=='step01_return_transport_manifest.json'){
    const client=artifactBroker.createCosBroker(cos);
    let manifestBytes;
    try { manifestBytes=await client.get(artifactBroker.presignCosObject(cos,{operation:'GET',object_key:manifestKey,sha256:returnManifestSha,bytes:returnManifestSize,binding}).url); } catch { throw new Error('mac_relay_step01_return_grant_manifest_not_uploaded'); }
    let manifest;
    try { manifest=JSON.parse(manifestBytes.toString('utf8')); } catch { throw new Error('mac_relay_step01_return_grant_manifest_invalid'); }
    if(manifest?.schema_version!==step01PhaseTransport.RETURN_MANIFEST_SCHEMA||step01PhaseTransport.phaseKey(manifest.phase_key||{}).canonical!==current.verified.phase.canonical||!Array.isArray(manifest.files))throw new Error('mac_relay_step01_return_grant_manifest_invalid');
    const declared=manifest.files.find(item=>item&&item.relative_path===relative&&item.sha256===sha&&Number(item.bytes)===bytes);
    if(!declared)throw new Error('mac_relay_step01_return_grant_file_not_declared');
  }
  return {transport:'cos',grant:artifactBroker.presignCosObject(cos,{operation:'PUT',object_key:brokerTransport.returnKeyForRelative(binding,relative,sha,relative==='step01_return_transport_manifest.json'?'return-manifest':'artifact'),sha256:sha,bytes,binding})};
}

async function claimStep01Phase(jobId, phaseKey, manifestSha256, config = relayConfig()) {
  jobId = safeJobId(jobId); phaseKey = safeStep01PhaseKey(phaseKey); manifestSha256 = safeSha256(manifestSha256, 'mac_relay_step01_phase_manifest_sha_invalid');
  const current = await currentStep01Phase(config, jobId, phaseKey, manifestSha256);
  const finalRoot = step01PhaseExportRoot(config, jobId, phaseKey);
  const existing = await fsp.lstat(finalRoot).catch(() => null);
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) throw new Error('mac_relay_step01_phase_existing_export_invalid');
    const verified = await step01PhaseTransport.verifyManifest(finalRoot, 'step01_phase_manifest.json', step01PhaseTransport.EXPORT_MANIFEST_SCHEMA, manifestSha256, current.verified.phase);
    return {status:'replayed', job_id:jobId, phase_key:phaseKey, manifest_sha256:verified.manifestSha256, export_path:finalRoot};
  }
  const staging = finalRoot + '.incoming-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  try {
    await fsp.mkdir(staging, {recursive:false});
    for (const file of current.verified.manifest.files) {
      const relative = step01PhaseTransport.safeRelative(file.relative_path);
      await copyVerifiedFile(path.join(current.packageRoot, ...relative.split('/')), path.join(staging, ...relative.split('/')));
    }
    await copyVerifiedFile(path.join(current.packageRoot, 'step01_phase_manifest.json'), path.join(staging, 'step01_phase_manifest.json'));
    const verified = await step01PhaseTransport.verifyManifest(staging, 'step01_phase_manifest.json', step01PhaseTransport.EXPORT_MANIFEST_SCHEMA, manifestSha256, current.verified.phase);
    await fsp.mkdir(path.dirname(finalRoot), {recursive:true});
    await fsp.rename(staging, finalRoot);
    return {status:'exported', job_id:jobId, phase_key:phaseKey, manifest_sha256:verified.manifestSha256, export_path:finalRoot};
  } catch (error) {
    await fsp.rm(staging, {recursive:true, force:true});
    throw error;
  }
}

async function beginStep01PhaseReturn(jobId, phaseKey, returnManifestSha256, config = relayConfig()) {
  jobId = safeJobId(jobId); phaseKey = safeStep01PhaseKey(phaseKey); returnManifestSha256 = safeSha256(returnManifestSha256, 'mac_relay_step01_return_manifest_sha_invalid');
  const exportRoot = step01PhaseExportRoot(config, jobId, phaseKey);
  const exportManifest = await step01PhaseTransport.fileEvidence(path.join(exportRoot, 'step01_phase_manifest.json'));
  const current = await currentStep01Phase(config, jobId, phaseKey, exportManifest.sha256);
  const returnRoot = step01PhaseReturnRoot(config, jobId, phaseKey);
  const existing = await fsp.lstat(returnRoot).catch(() => null);
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) throw new Error('mac_relay_step01_return_existing_invalid');
    const existingManifest = await step01PhaseTransport.fileEvidence(path.join(returnRoot, 'step01_return_transport_manifest.json')).catch(() => null);
    if (existingManifest && existingManifest.sha256 !== returnManifestSha256) throw new Error('mac_relay_step01_return_replay_conflict');
  } else await fsp.mkdir(returnRoot, {recursive:true});
  return {status:'ready_for_manifest', job_id:jobId, phase_key:current.verified.phase.key_id, return_manifest_sha256:returnManifestSha256, upload_path:returnRoot};
}

async function prepareStep01PhaseReturn(jobId, phaseKey, returnManifestSha256, config = relayConfig()) {
  jobId = safeJobId(jobId); phaseKey = safeStep01PhaseKey(phaseKey); returnManifestSha256 = safeSha256(returnManifestSha256, 'mac_relay_step01_return_manifest_sha_invalid');
  const exportRoot = step01PhaseExportRoot(config, jobId, phaseKey);
  const exportManifest = await step01PhaseTransport.fileEvidence(path.join(exportRoot, 'step01_phase_manifest.json'));
  const current = await currentStep01Phase(config, jobId, phaseKey, exportManifest.sha256);
  const returnRoot = step01PhaseReturnRoot(config, jobId, phaseKey);
  const manifestPath = path.join(returnRoot, 'step01_return_transport_manifest.json');
  const evidence = await step01PhaseTransport.fileEvidence(manifestPath);
  if (evidence.sha256 !== returnManifestSha256) throw new Error('mac_relay_step01_return_manifest_sha_mismatch');
  const manifest = await readJson(manifestPath);
  if (manifest?.schema_version !== step01PhaseTransport.RETURN_MANIFEST_SCHEMA || step01PhaseTransport.phaseKey(manifest.phase_key || {}).canonical !== current.verified.phase.canonical || !Array.isArray(manifest.files)) throw new Error('mac_relay_step01_return_manifest_binding_invalid');
  for (const file of manifest.files) {
    const relative = step01PhaseTransport.safeRelative(file.relative_path);
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[a-f0-9]{64}$/.test(String(file.sha256 || ''))) throw new Error('mac_relay_step01_return_manifest_entry_invalid');
    await fsp.mkdir(path.dirname(path.join(returnRoot, ...relative.split('/'))), {recursive:true});
  }
  return {status:'ready_for_files', job_id:jobId, phase_key:phaseKey, return_manifest_sha256:returnManifestSha256, upload_path:returnRoot};
}

async function ingestStep01PhaseReturn(jobId, phaseKey, returnManifestSha256, config = relayConfig()) {
  jobId = safeJobId(jobId); phaseKey = safeStep01PhaseKey(phaseKey); returnManifestSha256 = safeSha256(returnManifestSha256, 'mac_relay_step01_return_manifest_sha_invalid');
  const exportRoot = step01PhaseExportRoot(config, jobId, phaseKey);
  const exportManifest = await step01PhaseTransport.fileEvidence(path.join(exportRoot, 'step01_phase_manifest.json'));
  const current = await currentStep01Phase(config, jobId, phaseKey, exportManifest.sha256);
  const returnRoot = step01PhaseReturnRoot(config, jobId, phaseKey);
  const importedRoot = path.join(current.directRoot, 'step01_app_phase_returns', phaseKey);
  const imported = await step01PhaseTransport.importMacReturnToWindows({packageRoot:returnRoot, expectedManifestSha256:returnManifestSha256, expectedPhase:current.verified.phase, windowsReturnRoot:importedRoot});
  return {status:'ingested', job_id:jobId, phase_key:phaseKey, return_manifest_sha256:imported.manifestSha256, windows_return_root:imported.root};
}

async function recoverExport(localJobId, config = relayConfig()) {
  const jobId = safeJobId(localJobId);
  const relayState = await loadRelayState(config);
  if (relayState.pending) throw new Error('mac_relay_recovery_pending_export_exists');

  const bridge = loadControllerBridge(config);
  const token = await bridge.loadToken();
  const state = await bridge.loadState();
  const entry = Object.entries(state.jobs || {}).find(([, record]) => record && record.localJobId === jobId);
  if (!entry) throw new Error('mac_relay_recovery_job_not_tracked');
  const [remoteJobId, previousRecord] = entry;
  const directJobsRoot = path.resolve(config.workspace, '06_AUTOMATION', 'direct_jobs');
  const previousRoot = path.resolve(String(previousRecord.root || ''));
  if (!isInside(directJobsRoot, previousRoot)) throw new Error('mac_relay_recovery_job_root_invalid');
  const archivedAttempt = await archiveDirectory(previousRoot, path.join(config.workspace, '06_AUTOMATION', 'recovery_history', jobId), 'mac_relay_recovery');
  if (!archivedAttempt) throw new Error('mac_relay_recovery_job_root_missing');
  delete state.jobs[remoteJobId];

  const job = await bridge.claim(token, remoteJobId);
  if (!job) throw new Error('mac_relay_recovery_claim_returned_no_job');
  const materialized = await bridge.materializeJob(token, job, job.controller.leaseId);
  if (materialized.localJobId !== jobId) throw new Error('mac_relay_recovery_job_id_mismatch');
  const freshRecord = {
    remoteJobId,
    localJobId:materialized.localJobId,
    root:materialized.root,
    sourcePath:materialized.sourcePath,
    sourceSha256:materialized.sourceSha256,
    completed:materialized.completed,
    leaseId:job.controller.leaseId,
    leaseUntil:job.controller.leaseUntil,
    materializedAt:now()
  };
  state.jobs[remoteJobId] = freshRecord;
  const payload = await bridge.syncRecord(token, freshRecord);
  state.status = 'ok';
  state.last_result = { mirrored:{remoteJobId,localJobId:jobId,status:payload.productionStatus,result:'recovered'}, synced:[], errors:[] };
  await bridge.saveState(state);

  relayState.history = relayState.history.filter(item => item && item.job_id !== jobId);
  const exported = await exportJob(freshRecord, config);
  relayState.pending = {
    job_id:exported.jobId,
    remote_job_id:remoteJobId,
    exported_at:now(),
    source_sha256:exported.manifest.source_sha256,
    recovery_of:archivedAttempt
  };
  await saveRelayState(config, relayState);
  return { status:'recovered_export', jobId:exported.jobId, exportPath:exported.exportPath, sourceSha256:exported.manifest.source_sha256, archivedAttempt };
}

async function prepareReturn(localJobId, config = relayConfig()) {
  const jobId = safeJobId(localJobId);
  const relayState = await loadRelayState(config);
  if (!relayState.pending || relayState.pending.job_id !== jobId) throw new Error('mac_relay_return_job_not_pending');
  const returnRoot = path.join(config.exportRoot, 'returns', jobId);
  await fsp.rm(returnRoot, { recursive:true, force:true });
  await fsp.mkdir(returnRoot, { recursive:true });
  return { status:'ready_for_return', jobId, returnPath:returnRoot };
}

async function listFiles(root, relativeRoot = '') {
  const entries = await fsp.readdir(path.join(root, relativeRoot), { withFileTypes:true });
  const output = [];
  for (const entry of entries) {
    const relative = relativeRoot ? path.posix.join(relativeRoot, entry.name) : entry.name;
    if (entry.isDirectory()) {
      output.push(...await listFiles(root, relative));
    } else if (entry.isFile()) {
      output.push(relative.replace(/\\/g, '/'));
    } else {
      throw new Error('mac_relay_return_special_file_rejected');
    }
  }
  return output;
}

function readBlockedGate(value) {
  const status = typeof value === 'string' ? value : value && value.status;
  return String(status || '').startsWith('blocked');
}

async function validateReturnPackage(returnRoot, localJobId, expectedSourceSha256) {
  const jobId = safeJobId(localJobId);
  const root = path.resolve(returnRoot);
  const manifest = await readJson(path.join(root, 'return_manifest.json'));
  if (!manifest || manifest.schema_version !== 'niannian_mac_return_v1' || manifest.job_id !== jobId || !Array.isArray(manifest.files)) {
    throw new Error('mac_relay_return_manifest_invalid');
  }
  if (expectedSourceSha256 && manifest.source_sha256 !== expectedSourceSha256) throw new Error('mac_relay_return_source_hash_mismatch');
  const seen = new Set();
  for (const entry of manifest.files) {
    if (!entry || typeof entry !== 'object') throw new Error('mac_relay_return_manifest_entry_invalid');
    const relative = safeRelative(entry.path);
    if ((!RETURN_FILES.includes(relative) && !isStep01EvidenceBundleFile(relative)) || seen.has(relative)) throw new Error('mac_relay_return_path_not_allowed');
    if (!Number.isInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > evidenceBundleEntryLimit(relative) || !/^[a-f0-9]{64}$/.test(String(entry.sha256 || ''))) {
      throw new Error('mac_relay_return_manifest_entry_invalid');
    }
    const absolute = path.resolve(root, relative);
    if (!isInside(root, absolute)) throw new Error('mac_relay_return_path_escape');
    await ensureRegularFile(absolute, 'mac_relay_return_file_missing');
    const evidence = await sha256File(absolute);
    if (evidence.bytes !== entry.bytes || evidence.sha256 !== entry.sha256) throw new Error('mac_relay_return_hash_mismatch');
    await assertNoSensitiveText(absolute);
    seen.add(relative);
  }
  for (const required of REQUIRED_RETURN_FILES) {
    if (!seen.has(required)) throw new Error('mac_relay_return_required_file_missing');
  }
  const actualFiles = new Set(await listFiles(root));
  const expectedFiles = new Set([...seen, 'return_manifest.json']);
  if (actualFiles.size !== expectedFiles.size || [...actualFiles].some(file => !expectedFiles.has(file))) throw new Error('mac_relay_return_unexpected_file');

  const [status, checkpoint, dashboard, ledger, result, dispatch, receipt, preflight] = await Promise.all([
    readJson(path.join(root, 'status.json')),
    readJson(path.join(root, 'checkpoint.json')),
    readJson(path.join(root, 'gate_dashboard.json')),
    readJson(path.join(root, 'artifact_ledger.json')),
    readJson(path.join(root, 'result_manifest.json')),
    readJson(path.join(root, 'employee_dispatch.json')),
    readJson(path.join(root, 'employee_worker_receipt.json')),
    readJson(path.join(root, 'employee_preflight.json'))
  ]);
  if (![status, checkpoint, dashboard, ledger, result, dispatch, receipt, preflight].every(Boolean)) throw new Error('mac_relay_return_json_invalid');
  if ([status, checkpoint, dashboard, ledger, result, dispatch, receipt, preflight].some(value => value.job_id !== jobId)) throw new Error('mac_relay_return_job_id_mismatch');
  if (typeof preflight.ready !== 'boolean' || !/^mac-[a-z0-9-]{5,80}$/.test(String(preflight.runtime_profile || ''))) throw new Error('mac_relay_return_preflight_invalid');
  if (receipt.dispatch_id !== dispatch.dispatch_id || receipt.production_status !== status.status) throw new Error('mac_relay_return_receipt_mismatch');
  if (receipt.provider_submission_requested !== false || receipt.package_send_requested !== false) throw new Error('mac_relay_return_cost_request_rejected');
  if (!readBlockedGate(dashboard.gates && dashboard.gates.provider_submit) || !readBlockedGate(dashboard.gates && dashboard.gates.package_send)) {
    throw new Error('mac_relay_return_cost_gate_open');
  }
  if (result.packaged === true || result.transport_success === true || result.user_visible_acceptance === true) {
    throw new Error('mac_relay_return_delivery_state_rejected');
  }
  const strictSuccess = receipt.production_status === 'step01_verified';
  const bundleFilesPresent = STEP01_EVIDENCE_BUNDLE_FILES.every(file => seen.has(file));
  if (strictSuccess && !bundleFilesPresent) throw new Error('mac_relay_step01_bundle_required');
  if (!strictSuccess && STEP01_EVIDENCE_BUNDLE_FILES.some(file => seen.has(file))) {
    throw new Error('mac_relay_step01_bundle_not_permitted');
  }
  const bundle = strictSuccess
    ? await validateStep01EvidenceBundle(root, jobId, expectedSourceSha256 || manifest.source_sha256, ledger, receipt)
    : null;
  return { manifest, status, checkpoint, dashboard, ledger, result, dispatch, receipt, preflight, bundle, files:[...seen].sort() };
}

async function ingestReturn(localJobId, config = relayConfig()) {
  const jobId = safeJobId(localJobId);
  const relayState = await loadRelayState(config);
  if (!relayState.pending || relayState.pending.job_id !== jobId) throw new Error('mac_relay_return_job_not_pending');
  const returnRoot = path.join(config.exportRoot, 'returns', jobId);
  const validated = await validateReturnPackage(returnRoot, jobId, relayState.pending.source_sha256);
  const bridge = loadControllerBridge(config);
  const { state, record } = await findControllerRecord(bridge, jobId);
  if (String(record.sourceSha256 || '').toLowerCase() !== relayState.pending.source_sha256) throw new Error('mac_relay_controller_source_hash_mismatch');
  const jobRoot = path.resolve(record.root);
  const stagingRoot = path.join(jobRoot, '.mac-relay-return-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
  await fsp.mkdir(stagingRoot, { recursive:true });
  let hydration = null;
  try {
    for (const relative of validated.files) {
      await copyVerifiedFile(path.join(returnRoot, relative), path.join(stagingRoot, relative));
    }
    if (validated.bundle) hydration = await hydrateStep01EvidenceBundle(stagingRoot, jobRoot, validated.bundle);
    for (const relative of validated.files) {
      await fsp.rename(path.join(stagingRoot, relative), path.join(jobRoot, relative));
    }
    if (hydration) {
      const stagedPayload = path.join(stagingRoot, 'step01_evidence_payload', hydration.bundleLabel);
      const finalPayload = path.join(jobRoot, 'step01_evidence_payload', hydration.bundleLabel);
      await fsp.mkdir(path.dirname(finalPayload), { recursive:true });
      await fsp.rename(stagedPayload, finalPayload);
    }
  } finally {
    await fsp.rm(stagingRoot, { recursive:true, force:true });
  }

  if (hydration) await appendEvidenceBundleEvent(jobRoot, jobId, validated.receipt, hydration);
  const token = await bridge.loadToken();
  await bridge.syncRecord(token, record);
  await bridge.saveState(state);
  relayState.history.push({ job_id:jobId, remote_job_id:record.remoteJobId, ingested_at:now(), status:validated.status.status });
  relayState.pending = null;
  await saveRelayState(config, relayState);
  return { status:'ingested', jobId, productionStatus:validated.status.status, ...(hydration ? { step01EvidenceBundle:true } : {}) };
}

async function acquireLock(config) {
  const lockPath = path.join(config.runtimeRoot, '.mac-relay-gateway.lock');
  await fsp.mkdir(config.runtimeRoot, { recursive:true });
  try {
    return { path:lockPath, handle:await fsp.open(lockPath, 'wx') };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error('mac_relay_gateway_already_running');
  }
}

async function releaseLock(lock) {
  if (!lock) return;
  await lock.handle.close().catch(() => {});
  await fsp.unlink(lock.path).catch(() => {});
}

async function main() {
  const command = process.argv[2];
  const config = relayConfig();
  let lock;
  try {
    lock = await acquireLock(config);
    let result;
    if (command === 'claim-export') result = await claimExport(config, process.argv[3] || null);
    else if (command === 'recover-export') result = await recoverExport(process.argv[3], config);
    else if (command === 'prepare-return') result = await prepareReturn(process.argv[3], config);
    else if (command === 'ingest-return') result = await ingestReturn(process.argv[3], config);
    else if (command === 'claim-step01-phase') result = await claimStep01Phase(process.argv[3], process.argv[4], process.argv[5], config);
    else if (command === 'begin-step01-phase-return') result = await beginStep01PhaseReturn(process.argv[3], process.argv[4], process.argv[5], config);
    else if (command === 'prepare-step01-phase-return') result = await prepareStep01PhaseReturn(process.argv[3], process.argv[4], process.argv[5], config);
    else if (command === 'ingest-step01-phase-return') result = await ingestStep01PhaseReturn(process.argv[3], process.argv[4], process.argv[5], config);
    else if (command === 'step01-artifact-package-grants') result = await issueStep01PackageGrants(process.argv[3], process.argv[4], process.argv[5], config);
    else if (command === 'step01-artifact-return-grant') result = await issueStep01ReturnGrant(process.argv[3], process.argv[4], process.argv[5], process.argv[6], process.argv[7], process.argv[8], process.argv[9], process.argv[10], process.argv[11], config);
    else throw new Error('usage: niannian_mac_relay_gateway.js <claim-export|recover-export|prepare-return|ingest-return|claim-step01-phase|begin-step01-phase-return|prepare-step01-phase-return|ingest-step01-phase-return|step01-artifact-package-grants|step01-artifact-return-grant> [args]');
    process.stdout.write(JSON.stringify({ ok:true, ...result }) + '\n');
  } finally {
    await releaseLock(lock);
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write('mac_relay_gateway_failed: ' + error.message + '\n');
    process.exitCode = 1;
  });
}

module.exports = {
  EXPORT_CONTRACT_FILES,
  RETURN_FILES,
  STEP01_EVIDENCE_BUNDLE_FILES,
  safeJobId,
  safeStep01PhaseKey,
  relayConfig,
  sha256File,
  fileManifest,
  validateStep01EvidenceBundle,
  hydrateStep01EvidenceBundle,
  appendEvidenceBundleEvent,
  exportJob,
  exportN06Assets,
  validateReturnPackage,
  currentStep01Phase,
  currentBrokerBinding,
  issueStep01PackageGrants,
  issueStep01ReturnGrant,
  claimStep01Phase,
  beginStep01PhaseReturn,
  prepareStep01PhaseReturn,
  ingestStep01PhaseReturn,
  claimExport,
  recoverExport,
  prepareReturn,
  ingestReturn
};
