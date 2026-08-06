'use strict';

// Phase-aware, filesystem-only transport primitives for the N06 Mac App
// employee synthetic vertical. This module deliberately does not start a turn,
// open a network connection, invoke SSH, or call a media provider.

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const DISPATCH_SCHEMA = 'niannian_n06_mac_employee_dispatch_v1';
const EXPORT_MANIFEST_SCHEMA = 'niannian_n06_mac_app_phase_export_v1';
const RETURN_MANIFEST_SCHEMA = 'niannian_n06_mac_app_phase_return_v1';
const ARTIFACT_MANIFEST_SCHEMA = 'niannian_n06_mac_employee_artifact_manifest_v1';
const LEASE_SCHEMA = 'niannian_n06_mac_app_phase_lease_v1';
const REQUIRED_FINAL_RETURN_FILES = Object.freeze([
  'employee_dispatch.json',
  'employee_worker_receipt.json',
  'mac_employee_dispatch_control_receipt.json',
  'fake-download.mp4',
  'ffprobe.json',
  'visual_qa.json',
  'website_projection.json'
]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function nowIso(nowMs = Date.now()) {
  return new Date(nowMs).toISOString();
}

function assertSha(value, code) {
  const normalized = String(value || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error(code);
  return normalized;
}

function assertToken(value, code, pattern = /^[A-Za-z0-9._-]{1,200}$/) {
  const normalized = String(value || '').trim();
  if (!pattern.test(normalized)) throw new Error(code);
  return normalized;
}

function safeRelative(value, code = 'phase_transport_relative_path_invalid') {
  const normalized = String(value || '').replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0') || /^[A-Za-z]:/.test(normalized) || parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(code);
  }
  return parts.join('/');
}

function isInside(parent, candidate, allowRoot = false) {
  const base = path.resolve(parent);
  const target = path.resolve(candidate);
  const relative = path.relative(base, target);
  if (!relative) return allowRoot;
  return !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}

function phaseKey(value) {
  const phase = {
    job_id:assertToken(value && value.job_id, 'phase_transport_job_id_invalid', /^web_n[ns]-[a-z0-9-]{10,120}$/),
    group_id:assertToken(value && value.group_id, 'phase_transport_group_id_invalid', /^V\d{3}$/),
    transaction_id:assertToken(value && value.transaction_id, 'phase_transport_transaction_id_invalid', /^[A-Za-z0-9._-]{8,200}$/),
    spec_sha256:assertSha(value && value.spec_sha256, 'phase_transport_spec_sha256_invalid'),
    dispatch_id:assertToken(value && value.dispatch_id, 'phase_transport_dispatch_id_invalid', /^[A-Za-z0-9._-]{8,200}$/)
  };
  const canonical = [phase.job_id, phase.group_id, phase.transaction_id, phase.spec_sha256, phase.dispatch_id].join('|');
  const keyId = 'n06phase-' + sha256(Buffer.from(canonical, 'utf8'));
  if (value && value.key_id !== undefined && String(value.key_id) !== keyId) throw new Error('phase_transport_key_id_mismatch');
  return {...phase, canonical, key_id:keyId};
}

function phaseFromDispatch(dispatch) {
  if (!dispatch || dispatch.schema_version !== DISPATCH_SCHEMA || dispatch.execution_mode !== 'synthetic_fake_transport_only' || dispatch.test_only !== true || dispatch.real_delivery !== false) {
    throw new Error('phase_transport_dispatch_contract_invalid');
  }
  return phaseKey(dispatch);
}

function samePhase(left, right) {
  return phaseKey(left).canonical === phaseKey(right).canonical;
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
}

async function readJsonIfExists(filePath) {
  try { return await readJson(filePath); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temporary = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(temporary, jsonBytes(value), {flag:'wx'});
  await fsp.rename(temporary, filePath);
}

async function regularFile(filePath, code = 'phase_transport_file_missing') {
  const stats = await fsp.lstat(filePath).catch(() => null);
  if (!stats || !stats.isFile() || stats.isSymbolicLink()) throw new Error(code);
  return stats;
}

async function assertNoSymlinkPath(rootPath, targetPath, code = 'phase_transport_symlink_path_rejected') {
  const root = path.resolve(rootPath);
  const target = path.resolve(targetPath);
  if (!isInside(root, target)) throw new Error(code);
  const rootStats = await fsp.lstat(root).catch(() => null);
  if (!rootStats || !rootStats.isDirectory() || rootStats.isSymbolicLink()) throw new Error(code);
  const parts = path.relative(root, target).split(path.sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    const stats = await fsp.lstat(current).catch(() => null);
    if (!stats) throw new Error(code);
    if (stats.isSymbolicLink()) throw new Error(code);
  }
}

async function fileEvidence(filePath) {
  await regularFile(filePath);
  const bytes = await fsp.readFile(filePath);
  return {sha256:sha256(bytes), bytes:bytes.length};
}

async function copyExact(source, destination) {
  await regularFile(source);
  await fsp.mkdir(path.dirname(destination), {recursive:true});
  await fsp.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
}

function manifestPayload(schemaVersion, phase, files, extra = {}) {
  return {
    schema_version:schemaVersion,
    phase_key:{job_id:phase.job_id,group_id:phase.group_id,transaction_id:phase.transaction_id,spec_sha256:phase.spec_sha256,dispatch_id:phase.dispatch_id,key_id:phase.key_id},
    files:[...files].sort((left, right) => left.relative_path.localeCompare(right.relative_path)),
    ...extra
  };
}

async function evidenceRows(root, relativePaths) {
  const rows = [];
  const seen = new Set();
  for (const item of relativePaths) {
    const relative = safeRelative(item);
    if (seen.has(relative)) throw new Error('phase_transport_manifest_duplicate_path');
    seen.add(relative);
    const absolute = path.resolve(root, relative);
    if (!isInside(root, absolute)) throw new Error('phase_transport_manifest_path_escape');
    await assertNoSymlinkPath(root, absolute);
    const evidence = await fileEvidence(absolute);
    rows.push({relative_path:relative,sha256:evidence.sha256,bytes:evidence.bytes});
  }
  return rows.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
}

async function verifyManifest(packageRoot, manifestName, expectedSchema, expectedManifestSha256, expectedPhase = null, requiredPaths = null) {
  const root = path.resolve(packageRoot);
  const manifestPath = path.join(root, safeRelative(manifestName));
  const manifestEvidence = await fileEvidence(manifestPath);
  if (expectedManifestSha256 && manifestEvidence.sha256 !== assertSha(expectedManifestSha256, 'phase_transport_expected_manifest_sha_invalid')) {
    throw new Error('phase_transport_manifest_sha_mismatch');
  }
  const manifest = await readJson(manifestPath);
  if (!manifest || manifest.schema_version !== expectedSchema || !Array.isArray(manifest.files)) throw new Error('phase_transport_manifest_contract_invalid');
  const actualPhase = phaseKey(manifest.phase_key || {});
  if (expectedPhase && actualPhase.canonical !== phaseKey(expectedPhase).canonical) throw new Error('phase_transport_phase_key_mismatch');
  const seen = new Set();
  for (const item of manifest.files) {
    const relative = safeRelative(item && item.relative_path, 'phase_transport_manifest_path_invalid');
    if (seen.has(relative)) throw new Error('phase_transport_manifest_duplicate_path');
    seen.add(relative);
    if (!Number.isSafeInteger(item.bytes) || item.bytes < 0) throw new Error('phase_transport_manifest_bytes_invalid');
    const expectedSha = assertSha(item.sha256, 'phase_transport_manifest_file_sha_invalid');
    const absolute = path.resolve(root, relative);
    if (!isInside(root, absolute)) throw new Error('phase_transport_manifest_path_escape');
    await assertNoSymlinkPath(root, absolute);
    const evidence = await fileEvidence(absolute);
    if (evidence.sha256 !== expectedSha || evidence.bytes !== item.bytes) throw new Error('phase_transport_manifest_file_mismatch:' + relative);
  }
  if (requiredPaths) {
    const required = new Set(requiredPaths.map(item => safeRelative(item)));
    if (seen.size !== required.size || [...required].some(item => !seen.has(item))) throw new Error('phase_transport_manifest_file_set_invalid');
  }
  return {manifest,manifestPath,manifestSha256:manifestEvidence.sha256,phase:actualPhase};
}

async function promoteStaging(stagingRoot, finalRoot, manifestName, expectedManifestSha256, expectedPhase) {
  const final = path.resolve(finalRoot);
  const existing = await fsp.lstat(final).catch(() => null);
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) throw new Error('phase_transport_promote_target_invalid');
    const verified = await verifyManifest(final, manifestName, manifestName === 'transport_manifest.json' ? EXPORT_MANIFEST_SCHEMA : RETURN_MANIFEST_SCHEMA, expectedManifestSha256, expectedPhase);
    await fsp.rm(stagingRoot, {recursive:true,force:true});
    return {status:'replayed',root:final,...verified};
  }
  await fsp.mkdir(path.dirname(final), {recursive:true});
  try {
    await fsp.rename(stagingRoot, final);
  } catch (error) {
    if (error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY') throw error;
    return promoteStaging(stagingRoot, final, manifestName, expectedManifestSha256, expectedPhase);
  }
  const verified = await verifyManifest(final, manifestName, manifestName === 'transport_manifest.json' ? EXPORT_MANIFEST_SCHEMA : RETURN_MANIFEST_SCHEMA, expectedManifestSha256, expectedPhase);
  return {status:'promoted',root:final,...verified};
}

function portableSpec(authoritySpec, dispatch) {
  const byIdentity = new Map((dispatch.references || []).map(item => [String(item.ref_key) + '|' + String(item.sha256).toLowerCase(), item]));
  if (!Array.isArray(authoritySpec.references) || authoritySpec.references.length !== byIdentity.size || !byIdentity.size) {
    throw new Error('phase_transport_reference_count_mismatch');
  }
  const references = authoritySpec.references.map(reference => {
    const refKey = String(reference.ref_key || reference.refKey || '');
    const referenceSha = assertSha(reference.sha256, 'phase_transport_reference_sha_invalid');
    const transport = byIdentity.get(refKey + '|' + referenceSha);
    if (!transport) throw new Error('phase_transport_reference_binding_mismatch');
    const relativePath = safeRelative(transport.relative_path, 'phase_transport_reference_path_invalid');
    return {
      ...reference,
      path:relativePath,
      relative_path:relativePath,
      ref_key:refKey,
      sha256:referenceSha,
      uploadEligible:true
    };
  });
  return {
    ...authoritySpec,
    references,
    authority_spec_sha256:assertSha(dispatch.spec_sha256, 'phase_transport_authority_spec_sha_invalid'),
    path_semantics:'dispatch_workspace_relative'
  };
}

function validateCurrentPortableSpec(spec, dispatch, phase) {
  if (!spec || spec.transaction_id !== phase.transaction_id || spec.prompt?.sha256 !== dispatch.prompt_sha256 || spec.execution_mode !== 'real_submit_candidate_v2') {
    throw new Error('phase_transport_portable_spec_binding_mismatch');
  }
  if (assertSha(spec.authority_spec?.sha256, 'phase_transport_portable_authority_sha_missing') !== phase.spec_sha256) {
    throw new Error('phase_transport_portable_authority_sha_mismatch');
  }
  const expectedReferences = new Map((dispatch.references || []).map(item => [String(item.ref_key) + '|' + assertSha(item.sha256, 'phase_transport_reference_sha_invalid'), item]));
  if (!Array.isArray(spec.references) || spec.references.length !== expectedReferences.size || !expectedReferences.size) throw new Error('phase_transport_reference_count_mismatch');
  const workspace = String(dispatch.employee?.workspace || '').replace(/\\/g, '/').replace(/\/$/, '');
  for (const reference of spec.references) {
    const refKey = String(reference.ref_key || reference.refKey || '');
    const referenceSha = assertSha(reference.sha256, 'phase_transport_reference_sha_invalid');
    const expected = expectedReferences.get(refKey + '|' + referenceSha);
    if (!expected) throw new Error('phase_transport_reference_binding_mismatch');
    const expectedRelative = safeRelative(expected.relative_path, 'phase_transport_reference_path_invalid');
    const declaredRelative = safeRelative(reference.portable_transport?.relative_path, 'phase_transport_portable_reference_path_missing');
    if (declaredRelative !== expectedRelative || assertSha(reference.portable_transport?.sha256, 'phase_transport_portable_reference_sha_missing') !== referenceSha || assertSha(reference.original_authority?.sha256, 'phase_transport_original_reference_sha_missing') !== referenceSha) {
      throw new Error('phase_transport_portable_reference_binding_mismatch');
    }
    const portablePath = String(reference.path || '').replace(/\\/g, '/');
    if (portablePath !== expectedRelative && (!workspace || portablePath !== workspace + '/' + expectedRelative)) throw new Error('phase_transport_portable_reference_path_mismatch');
  }
  return spec;
}

async function exportWindowsDispatch(options = {}) {
  const dispatchPath = path.resolve(String(options.dispatchPath || ''));
  await regularFile(dispatchPath, 'phase_transport_dispatch_missing');
  const sourceRoot = path.dirname(dispatchPath);
  const dispatch = await readJson(dispatchPath);
  const phase = phaseFromDispatch(dispatch);
  const authoritySpecRelative = safeRelative(dispatch.portable_spec_relative_path, 'phase_transport_spec_path_invalid');
  const authoritySpecPath = path.resolve(sourceRoot, authoritySpecRelative);
  if (!isInside(sourceRoot, authoritySpecPath)) throw new Error('phase_transport_spec_path_escape');
  await assertNoSymlinkPath(sourceRoot, authoritySpecPath);
  const sourceSpecEvidence = await fileEvidence(authoritySpecPath);
  const declaredPortableSha256 = dispatch.portable_spec_sha256 === undefined
    ? null
    : assertSha(dispatch.portable_spec_sha256, 'phase_transport_portable_spec_sha_invalid');
  let sourceSpec;
  let exportedSpec;
  let exportedSpecBytes;
  let portableSpecSha256;
  let specTransportMode;
  if (declaredPortableSha256) {
    if (sourceSpecEvidence.sha256 !== declaredPortableSha256) throw new Error('phase_transport_stale_portable_spec');
    sourceSpec = await readJson(authoritySpecPath);
    exportedSpec = validateCurrentPortableSpec(sourceSpec, dispatch, phase);
    exportedSpecBytes = await fsp.readFile(authoritySpecPath);
    portableSpecSha256 = declaredPortableSha256;
    specTransportMode = 'server_portable_spec_exact';
  } else {
    sourceSpec = await readJson(authoritySpecPath);
    if (sourceSpec.authority_spec !== undefined) throw new Error('phase_transport_ambiguous_legacy_spec');
    if (sourceSpecEvidence.sha256 !== phase.spec_sha256) throw new Error('phase_transport_stale_authority_spec');
    if (sourceSpec.transaction_id !== phase.transaction_id || sourceSpec.prompt?.sha256 !== dispatch.prompt_sha256 || sourceSpec.execution_mode !== 'real_submit_candidate_v2') throw new Error('phase_transport_authority_spec_binding_mismatch');
    exportedSpec = portableSpec(sourceSpec, dispatch);
    exportedSpecBytes = jsonBytes(exportedSpec);
    portableSpecSha256 = sha256(exportedSpecBytes);
    specTransportMode = 'legacy_authority_spec_rewritten';
  }

  const exportRoot = path.resolve(String(options.exportRoot || ''));
  if (!exportRoot) throw new Error('phase_transport_export_root_required');
  await fsp.mkdir(exportRoot, {recursive:true});
  const finalRoot = path.join(exportRoot, phase.key_id);
  const stagingRoot = path.join(exportRoot, '.' + phase.key_id + '.incoming-' + process.pid + '-' + crypto.randomBytes(4).toString('hex'));
  await fsp.mkdir(stagingRoot, {recursive:false});
  try {
    const exportedDispatch = {
      ...dispatch,
      authority_spec_sha256:phase.spec_sha256,
      portable_spec_sha256:portableSpecSha256,
      portable_spec_relative_path:'input/video_task_spec.json',
      phase_key:{job_id:phase.job_id,group_id:phase.group_id,transaction_id:phase.transaction_id,spec_sha256:phase.spec_sha256,dispatch_id:phase.dispatch_id,key_id:phase.key_id}
    };
    await fsp.mkdir(path.join(stagingRoot, 'input'), {recursive:true});
    await fsp.writeFile(path.join(stagingRoot, 'employee_dispatch.json'), jsonBytes(exportedDispatch), {flag:'wx'});
    await fsp.writeFile(path.join(stagingRoot, 'input', 'video_task_spec.json'), exportedSpecBytes, {flag:'wx'});
    const relativePaths = ['employee_dispatch.json','input/video_task_spec.json'];
    for (const reference of dispatch.references || []) {
      const relative = safeRelative(reference.relative_path, 'phase_transport_reference_path_invalid');
      const source = path.resolve(sourceRoot, relative);
      if (!isInside(sourceRoot, source)) throw new Error('phase_transport_reference_path_escape');
      await assertNoSymlinkPath(sourceRoot, source);
      const evidence = await fileEvidence(source);
      if (evidence.sha256 !== assertSha(reference.sha256, 'phase_transport_reference_sha_invalid')) throw new Error('phase_transport_reference_sha_mismatch');
      await copyExact(source, path.join(stagingRoot, relative));
      relativePaths.push(relative);
    }
    const files = await evidenceRows(stagingRoot, relativePaths);
    const manifest = manifestPayload(EXPORT_MANIFEST_SCHEMA, phase, files, {
      authority_spec_sha256:phase.spec_sha256,
      portable_spec_sha256:portableSpecSha256,
      spec_transport_mode:specTransportMode,
      generated_at:String(dispatch.prepared_at || nowIso(options.nowMs))
    });
    await fsp.writeFile(path.join(stagingRoot, 'transport_manifest.json'), jsonBytes(manifest), {flag:'wx'});
    const manifestSha256 = (await fileEvidence(path.join(stagingRoot, 'transport_manifest.json'))).sha256;
    return await promoteStaging(stagingRoot, finalRoot, 'transport_manifest.json', manifestSha256, phase);
  } catch (error) {
    await fsp.rm(stagingRoot, {recursive:true,force:true});
    throw error;
  }
}

async function importDispatchToMac(options = {}) {
  const packageRoot = path.resolve(String(options.packageRoot || ''));
  const verified = await verifyManifest(packageRoot, 'transport_manifest.json', EXPORT_MANIFEST_SCHEMA, options.expectedManifestSha256, options.expectedPhase);
  const workspace = path.resolve(String(options.workspacePath || ''));
  if (!workspace) throw new Error('phase_transport_workspace_required');
  const staging = workspace + '.incoming-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.mkdir(path.dirname(workspace), {recursive:true});
  await fsp.mkdir(staging, {recursive:false});
  try {
    for (const item of verified.manifest.files) {
      const relative = safeRelative(item.relative_path);
      await copyExact(path.join(packageRoot, relative), path.join(staging, relative));
    }
    await copyExact(path.join(packageRoot, 'transport_manifest.json'), path.join(staging, 'transport_manifest.json'));
    return await promoteStaging(staging, workspace, 'transport_manifest.json', verified.manifestSha256, verified.phase);
  } catch (error) {
    await fsp.rm(staging, {recursive:true,force:true});
    throw error;
  }
}

async function finalizeMacReturn(options = {}) {
  const workspace = path.resolve(String(options.workspacePath || ''));
  const dispatch = await readJson(path.join(workspace, 'employee_dispatch.json'));
  const phase = phaseFromDispatch(dispatch);
  const receipt = await readJson(path.join(workspace, 'employee_worker_receipt.json'));
  const control = await readJson(path.join(workspace, 'mac_employee_dispatch_control_receipt.json'));
  if (dispatch.phase !== 'employee_turn_completed' || dispatch.status !== 'completed_test_only' || dispatch.lease?.status !== 'completed' || dispatch.lease?.lease_id !== receipt.completion_event?.turn_id || dispatch.lease?.owner_thread_id !== dispatch.employee?.thread_id || control.idempotency_key !== dispatch.idempotency_key) {
    throw new Error('phase_transport_final_phase_lease_invalid');
  }
  if (receipt.dispatch_id !== phase.dispatch_id || control.dispatch_id !== phase.dispatch_id || receipt.transaction_id !== phase.transaction_id || receipt.spec_sha256 !== phase.spec_sha256) {
    throw new Error('phase_transport_final_receipt_binding_mismatch');
  }
  if (receipt.completion_event?.method !== 'turn/completed' || receipt.completion_event?.status !== 'completed' || receipt.completion_event?.error !== null || control.completion_event?.turn_id !== receipt.completion_event.turn_id || control.completion_event?.status !== 'completed') {
    throw new Error('phase_transport_final_completion_missing');
  }
  if (receipt.test_only !== true || receipt.real_delivery !== false || receipt.media_provider_network_requested !== false || receipt.media_provider_submit_requested !== false || receipt.media_provider_upload_requested !== false) {
    throw new Error('phase_transport_final_side_effect_contract_invalid');
  }
  for (const relative of REQUIRED_FINAL_RETURN_FILES) await regularFile(path.join(workspace, relative), 'phase_transport_final_file_missing:' + relative);
  const finalRows = await evidenceRows(workspace, REQUIRED_FINAL_RETURN_FILES);
  const finalizedAt = String(receipt.completed_at || control.created_at || nowIso(options.nowMs));
  const artifactManifest = {
    schema_version:ARTIFACT_MANIFEST_SCHEMA,
    dispatch_id:phase.dispatch_id,
    phase:'turn_completed_and_read_back',
    phase_key:{job_id:phase.job_id,group_id:phase.group_id,transaction_id:phase.transaction_id,spec_sha256:phase.spec_sha256,dispatch_id:phase.dispatch_id,key_id:phase.key_id},
    completion_turn_id:receipt.completion_event.turn_id,
    files:finalRows,
    media_provider_network_requested:false,
    media_provider_submit_requested:false,
    real_delivery:false,
    finalized_at:finalizedAt
  };
  await atomicJson(path.join(workspace, 'artifact_manifest.json'), artifactManifest);
  const returnFiles = ['artifact_manifest.json', ...REQUIRED_FINAL_RETURN_FILES];
  const transportRows = await evidenceRows(workspace, returnFiles);
  const returnManifest = manifestPayload(RETURN_MANIFEST_SCHEMA, phase, transportRows, {
    artifact_manifest_sha256:(await fileEvidence(path.join(workspace, 'artifact_manifest.json'))).sha256,
    completion_turn_id:receipt.completion_event.turn_id,
    finalized_at:finalizedAt,
    test_only:true,
    real_delivery:false,
    media_provider_network_requested:false,
    media_provider_submit_requested:false
  });
  await atomicJson(path.join(workspace, 'return_transport_manifest.json'), returnManifest);
  const manifestSha256 = (await fileEvidence(path.join(workspace, 'return_transport_manifest.json'))).sha256;
  return {status:'finalized',workspace,phase,manifest:returnManifest,manifestSha256};
}

async function importMacReturnToWindows(options = {}) {
  const packageRoot = path.resolve(String(options.packageRoot || ''));
  const required = ['artifact_manifest.json', ...REQUIRED_FINAL_RETURN_FILES];
  const verified = await verifyManifest(packageRoot, 'return_transport_manifest.json', RETURN_MANIFEST_SCHEMA, options.expectedManifestSha256, options.expectedPhase, required);
  const artifact = await readJson(path.join(packageRoot, 'artifact_manifest.json'));
  if (artifact.schema_version !== ARTIFACT_MANIFEST_SCHEMA || artifact.dispatch_id !== verified.phase.dispatch_id || !Array.isArray(artifact.files)) throw new Error('phase_transport_artifact_manifest_invalid');
  const artifactRequired = new Set(REQUIRED_FINAL_RETURN_FILES);
  const artifactPaths = artifact.files.map(item => safeRelative(item.relative_path));
  if (artifactPaths.length !== artifactRequired.size || new Set(artifactPaths).size !== artifactRequired.size || artifactPaths.some(item => !artifactRequired.has(item)) || [...artifactRequired].some(item => !artifactPaths.includes(item))) throw new Error('phase_transport_artifact_manifest_file_set_invalid');
  for (const item of artifact.files) {
    const relative = safeRelative(item.relative_path);
    const evidence = await fileEvidence(path.join(packageRoot, relative));
    if (evidence.sha256 !== assertSha(item.sha256, 'phase_transport_artifact_sha_invalid') || evidence.bytes !== item.bytes) throw new Error('phase_transport_artifact_file_mismatch:' + relative);
  }
  const finalRoot = path.resolve(String(options.windowsReturnRoot || ''));
  const staging = finalRoot + '.incoming-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.mkdir(path.dirname(finalRoot), {recursive:true});
  await fsp.mkdir(staging, {recursive:false});
  try {
    for (const item of verified.manifest.files) {
      const relative = safeRelative(item.relative_path);
      await copyExact(path.join(packageRoot, relative), path.join(staging, relative));
    }
    await copyExact(path.join(packageRoot, 'return_transport_manifest.json'), path.join(staging, 'return_transport_manifest.json'));
    return await promoteStaging(staging, finalRoot, 'return_transport_manifest.json', verified.manifestSha256, verified.phase);
  } catch (error) {
    await fsp.rm(staging, {recursive:true,force:true});
    throw error;
  }
}

function leaseRecordPath(leasePath) {
  return path.join(path.resolve(leasePath), 'lease.json');
}

async function acquireLease(options = {}) {
  const leasePath = path.resolve(String(options.leasePath || ''));
  const phase = phaseKey(options.phase || {});
  const ownerId = assertToken(options.ownerId, 'phase_lease_owner_invalid');
  const ttlMs = Math.max(1000, Math.min(24 * 60 * 60 * 1000, Number(options.ttlMs || 5 * 60 * 1000)));
  const nowMs = Number(options.nowMs === undefined ? Date.now() : options.nowMs);
  const record = {schema_version:LEASE_SCHEMA,phase_key:{job_id:phase.job_id,group_id:phase.group_id,transaction_id:phase.transaction_id,spec_sha256:phase.spec_sha256,dispatch_id:phase.dispatch_id,key_id:phase.key_id},owner_id:ownerId,dispatch_id:phase.dispatch_id,acquired_at:nowIso(nowMs),expires_at:nowIso(nowMs + ttlMs)};
  try {
    await fsp.mkdir(leasePath, {recursive:false});
    await atomicJson(leaseRecordPath(leasePath), record);
    return {status:'acquired',leasePath,lease:record};
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const existing = await readJsonIfExists(leaseRecordPath(leasePath));
  if (!existing) throw new Error('phase_lease_incomplete');
  const existingPhase = phaseKey(existing.phase_key || {});
  if (Date.parse(existing.expires_at) > nowMs) {
    if (existing.owner_id === ownerId && existingPhase.canonical === phase.canonical && existing.dispatch_id === phase.dispatch_id) return {status:'replayed',leasePath,lease:existing};
    throw new Error('phase_lease_conflict');
  }
  const expiredPath = leasePath + '.expired-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  try { await fsp.rename(leasePath, expiredPath); }
  catch (error) { if (error.code === 'ENOENT' || error.code === 'EEXIST') return acquireLease(options); throw error; }
  await fsp.rm(expiredPath, {recursive:true,force:true});
  return acquireLease(options);
}

async function renewLease(options = {}) {
  const leasePath = path.resolve(String(options.leasePath || ''));
  const phase = phaseKey(options.phase || {});
  const ownerId = assertToken(options.ownerId, 'phase_lease_owner_invalid');
  const nowMs = Number(options.nowMs === undefined ? Date.now() : options.nowMs);
  const ttlMs = Math.max(1000, Math.min(24 * 60 * 60 * 1000, Number(options.ttlMs || 5 * 60 * 1000)));
  const existing = await readJson(leaseRecordPath(leasePath));
  if (existing.owner_id !== ownerId || existing.dispatch_id !== phase.dispatch_id || phaseKey(existing.phase_key || {}).canonical !== phase.canonical) throw new Error('phase_lease_owner_or_phase_mismatch');
  if (Date.parse(existing.expires_at) <= nowMs) throw new Error('phase_lease_expired');
  const updated = {...existing,renewed_at:nowIso(nowMs),expires_at:nowIso(nowMs + ttlMs)};
  await atomicJson(leaseRecordPath(leasePath), updated);
  return {status:'renewed',leasePath,lease:updated};
}

async function releaseLease(options = {}) {
  const leasePath = path.resolve(String(options.leasePath || ''));
  const phase = phaseKey(options.phase || {});
  const ownerId = assertToken(options.ownerId, 'phase_lease_owner_invalid');
  const existing = await readJson(leaseRecordPath(leasePath));
  if (existing.owner_id !== ownerId || existing.dispatch_id !== phase.dispatch_id || phaseKey(existing.phase_key || {}).canonical !== phase.canonical) throw new Error('phase_lease_owner_or_phase_mismatch');
  const releasedPath = leasePath + '.released-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.rename(leasePath, releasedPath);
  await fsp.rm(releasedPath, {recursive:true,force:true});
  return {status:'released',leasePath,phase_key:phase.key_id};
}

module.exports = {
  ARTIFACT_MANIFEST_SCHEMA,
  DISPATCH_SCHEMA,
  EXPORT_MANIFEST_SCHEMA,
  LEASE_SCHEMA,
  REQUIRED_FINAL_RETURN_FILES,
  RETURN_MANIFEST_SCHEMA,
  acquireLease,
  exportWindowsDispatch,
  fileEvidence,
  finalizeMacReturn,
  importDispatchToMac,
  importMacReturnToWindows,
  isInside,
  phaseKey,
  releaseLease,
  renewLease,
  safeRelative,
  samePhase,
  verifyManifest
};
