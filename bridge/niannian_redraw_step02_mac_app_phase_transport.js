'use strict';

// Filesystem-only carrier boundary for Step02. It never starts Codex, opens a
// provider, reads credentials, or selects an employee. It verifies exact
// manifest-bound bytes and atomically promotes one dispatch/return phase.

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const step02 = require('./niannian_redraw_step02_vertical');

const EXPORT_SCHEMA = 'niannian_redraw_step02_mac_phase_export_v1';
const RETURN_SCHEMA = step02.SCHEMAS.returnManifest;
const CANONICAL_ROOT = path.resolve(__dirname, '..');
const GOVERNANCE_SOURCES = Object.freeze({
  install:path.join(CANONICAL_ROOT,'output','mac-employee-training','mac-skill-bundle-v2-install-receipt.json'),
  parity:path.join(CANONICAL_ROOT,'output','mac-employee-training','mac-skill-bundle-v2-parity-receipt.json'),
  adoption:path.join(CANONICAL_ROOT,'output','mac-employee-training','v2-adoption','adoption-manifest.json'),
  route_matrix:path.join(CANONICAL_ROOT,'bridge','mac-employee-training','route_matrix.json')
});
const EXPORT_FILES = Object.freeze([
  'transaction_intent.json',
  'upstream_authority_snapshot.json',
  'step02_employee_dispatch.json',
  'upstream/step01_evidence_manifest.json',
  'upstream/step01_employee_receipt.json',
  'upstream/step01_control_receipt.json',
  'step02_portable_evidence_index.json',
  'governance/mac_v2_install_receipt.json',
  'governance/mac_v2_parity_receipt.json',
  'governance/five_employee_adoption_manifest.json',
  'governance/route_matrix.json',
  'step02_runtime_governance.json'
]);
const RETURN_FILES = Object.freeze([
  'step02_source_truth_candidate.json',
  'step02_employee_receipt.json',
  'step02_control_receipt.json',
  'step02_app_server_audit.json',
  'step02_app_server_response.json'
]);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function safeRelative(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.split('/').some(part => !part || part === '.' || part === '..')) throw step02.codeError('STEP02_TRANSPORT_RELATIVE_PATH_INVALID');
  return normalized;
}
function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temp = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
  await fsp.rename(temp, filePath);
}
async function readJson(filePath) { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
async function regular(filePath) {
  const stats = await fsp.lstat(filePath).catch(() => null);
  if (!stats || !stats.isFile() || stats.isSymbolicLink()) throw step02.codeError('STEP02_TRANSPORT_FILE_NOT_REGULAR');
}
async function assertNoSymlinkChain(root, target) {
  const base = path.resolve(root), exact = path.resolve(target);
  if (!inside(base, exact)) throw step02.codeError('STEP02_TRANSPORT_PATH_ESCAPE');
  let cursor = base;
  const baseStats = await fsp.lstat(base).catch(() => null);
  if (!baseStats || !baseStats.isDirectory() || baseStats.isSymbolicLink()) throw step02.codeError('STEP02_TRANSPORT_ROOT_INVALID');
  for (const part of path.relative(base, exact).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    const stats = await fsp.lstat(cursor).catch(() => null);
    if (!stats) throw step02.codeError('STEP02_TRANSPORT_FILE_NOT_REGULAR');
    if (stats.isSymbolicLink()) throw step02.codeError('STEP02_TRANSPORT_SYMLINK_REJECTED');
  }
}
async function fileEvidence(filePath) {
  await regular(filePath);
  const bytes = await fsp.readFile(filePath);
  return {sha256:sha256(bytes),bytes:bytes.length};
}
async function copyRegular(source, destination) {
  await regular(source);
  await fsp.mkdir(path.dirname(destination), {recursive:true});
  await fsp.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
}
async function rows(root, names) {
  const result = [], seen = new Set();
  for (const raw of names) {
    const relative = safeRelative(raw);
    if (seen.has(relative)) throw step02.codeError('STEP02_TRANSPORT_DUPLICATE_PATH');
    seen.add(relative);
    const exact = path.join(root, relative);
    await assertNoSymlinkChain(root, exact);
    result.push({relative_path:relative,...await fileEvidence(exact)});
  }
  return result.sort((a,b) => a.relative_path.localeCompare(b.relative_path));
}
function artifactRole(relative) {
  const value = relative.toLowerCase();
  if (value.includes('ffprobe')) return 'source_ffprobe';
  if (value.includes('minute')) return 'minute_chunks';
  if (value.endsWith('.png') && (value.includes('native') || value.includes('frame'))) return 'native_frame';
  if (value.includes('transnet') && !value.includes('supplement')) return 'accepted_transnet_shots';
  if (value.includes('supplement')) return 'transnet_start_mid_end_supplement';
  if (value.endsWith('.wav')) return 'source_audio_wav';
  if (value.includes('audio') && (value.includes('event') || value.includes('ledger'))) return 'audio_event_ledger';
  if (value.includes('mimo')) return 'mimo_transcript';
  if (value.includes('align')) return 'forced_aligner';
  if (value.includes('ocr') || value.includes('paddle')) return 'paddle_ocr';
  if (value.includes('validation')) return 'strict_validation';
  return 'step01_declared_evidence';
}
async function step01EvidenceClosure(authority, staging) {
  const manifestPath = path.resolve(authority.step01.manifest.exact_path);
  const root = path.dirname(manifestPath);
  await regular(manifestPath);
  const manifestEvidence = await fileEvidence(manifestPath);
  if (manifestEvidence.sha256 !== authority.step01.manifest.sha256 || manifestEvidence.bytes !== authority.step01.manifest.bytes) throw step02.codeError('STEP02_TRANSPORT_STEP01_MANIFEST_BINDING_INVALID');
  const manifest = await readJson(manifestPath);
  if (manifest.schema_version !== 'step01_evidence_manifest_v1' || manifest.status !== 'verified' || manifest.downstream_consumable !== true || !Array.isArray(manifest.artifacts) || !manifest.artifacts.length) throw step02.codeError('STEP02_TRANSPORT_STEP01_CLOSURE_INVALID');
  const entries = [], exactSeen = new Set(), foldSeen = new Set();
  for (const declared of manifest.artifacts) {
    const original = safeRelative(declared.relative_path);
    const folded = original.toLowerCase();
    if (exactSeen.has(original)) throw step02.codeError('STEP02_TRANSPORT_STEP01_DUPLICATE_ARTIFACT');
    if (foldSeen.has(folded)) throw step02.codeError('STEP02_TRANSPORT_STEP01_CASEFOLD_COLLISION');
    exactSeen.add(original); foldSeen.add(folded);
    const source = path.resolve(root, original);
    if (!inside(root, source)) throw step02.codeError('STEP02_TRANSPORT_STEP01_ARTIFACT_ESCAPE');
    await assertNoSymlinkChain(root, source);
    const actual = await fileEvidence(source);
    if (actual.sha256 !== declared.sha256 || actual.bytes !== declared.bytes) throw step02.codeError('STEP02_TRANSPORT_STEP01_ARTIFACT_TAMPERED');
    const packageRelative = safeRelative('upstream/evidence/' + original);
    await copyRegular(source, path.join(staging, packageRelative));
    entries.push({original_relative_path:original,package_relative_path:packageRelative,sha256:actual.sha256,bytes:actual.bytes,role:artifactRole(original)});
  }
  const roles = new Set(entries.map(item => item.role));
  for (const required of ['source_ffprobe','minute_chunks','native_frame','accepted_transnet_shots','transnet_start_mid_end_supplement','source_audio_wav','audio_event_ledger','mimo_transcript','forced_aligner','paddle_ocr','strict_validation']) if (!roles.has(required)) throw step02.codeError('STEP02_TRANSPORT_STEP01_REQUIRED_ROLE_MISSING:' + required);
  const index = {schema_version:'niannian_redraw_step02_portable_evidence_index_v1',status:'verified',project_id:authority.project_id,transaction_id:authority.transaction_id,source_sha256:authority.source.sha256,step01_manifest_sha256:manifestEvidence.sha256,artifact_count:entries.length,entries:entries.sort((a,b) => a.original_relative_path.localeCompare(b.original_relative_path)),test_only:false,fixture_evidence:false,...step02.falseEffects(),created_at:authority.created_at||'1970-01-01T00:00:00.000Z'};
  await atomicJson(path.join(staging, 'step02_portable_evidence_index.json'), index);
  return index;
}
async function runtimeGovernanceClosure(staging) {
  const destinations={install:'governance/mac_v2_install_receipt.json',parity:'governance/mac_v2_parity_receipt.json',adoption:'governance/five_employee_adoption_manifest.json',route_matrix:'governance/route_matrix.json'};
  for(const [key,source] of Object.entries(GOVERNANCE_SOURCES))await copyRegular(source,path.join(staging,destinations[key]));
  const [install,parity,adoption,route]=await Promise.all(Object.values(destinations).map(name=>readJson(path.join(staging,name))));
  const evidenceByKey=Object.fromEntries(await Promise.all(Object.entries(destinations).map(async([key,name])=>[key,await fileEvidence(path.join(staging,name))])));
  const allowed=['.system','ai-brain-closeout','niannian-mac-production','post-coding-review'];
  if(install.schema_version!=='niannian_mac_skill_bundle_install_receipt_v2'||install.status!=='installed_verified'||install.bundle_id!=='niannian-mac-production-skills-v2'||install.managed_skills!==13||install.managed_file_count!==127||install.unmanaged_preserved!==true||JSON.stringify(install.allowed_unmanaged_top_level)!==JSON.stringify(allowed))throw step02.codeError('STEP02_TRANSPORT_V2_INSTALL_INVALID');
  if(parity.schema_version!=='niannian_mac_skill_bundle_parity_receipt_v2'||parity.status!=='exact_parity_verified'||parity.bundle_id!==install.bundle_id||parity.manifest_sha256!==install.manifest_sha256||parity.managed_skills!==13||parity.managed_file_count!==127||parity.unmanaged_preserved!==true||JSON.stringify(parity.allowed_unmanaged_top_level)!==JSON.stringify(allowed))throw step02.codeError('STEP02_TRANSPORT_V2_PARITY_INVALID');
  if(adoption.schema_version!=='niannian_mac_employee_v2_adoption_manifest_v1'||adoption.status!=='verified'||Number(adoption.completed)!==5||adoption.required_count!==5||adoption.bindings?.install_receipt_sha256!==evidenceByKey.install.sha256||adoption.bindings?.parity_receipt_sha256!==evidenceByKey.parity.sha256||adoption.employee_model_channel?.channel_id!=='krill_codex_custom_provider_v1'||adoption.employee_model_channel?.used!==true||adoption.employee_model_channel?.network_used!==true||adoption.employee_model_channel?.media_provider_authority_granted!==false)throw step02.codeError('STEP02_TRANSPORT_ADOPTION_INVALID');
  if(route.schema_version!=='niannian_mac_employee_route_matrix_v1'||route.employee_model_channel?.channel_id!=='krill_codex_custom_provider_v1'||route.employee_model_channel?.media_provider_authority_granted!==false)throw step02.codeError('STEP02_TRANSPORT_ROUTE_MATRIX_INVALID');
  const installed=new Map(install.installed_files.map(item=>[item.path,item]));
  const skillPaths=['skills/mx-shortdrama-00-router/SKILL.md','skills/mx-shortdrama-02-source-timeline/SKILL.md'];
  const skills=skillPaths.map(relative=>{const item=installed.get(relative);if(!item||!item.sha256||!item.bytes)throw step02.codeError('STEP02_TRANSPORT_REQUIRED_SKILL_MISSING');return {relative_path:relative.replace(/^skills\//,''),mac_exact_path:'/Users/lsb/.codex/skills/'+relative.replace(/^skills\//,''),sha256:item.sha256,bytes:item.bytes};});
  const governance={schema_version:'niannian_redraw_step02_runtime_governance_v1',status:'verified',bundle_id:install.bundle_id,bundle_manifest_sha256:install.manifest_sha256,source_snapshot_sha256:install.source_snapshot_sha256,managed_skills:13,managed_file_count:127,allowed_unmanaged_top_level:allowed,unmanaged_preserved:true,receipts:{install:{relative_path:destinations.install,...evidenceByKey.install},parity:{relative_path:destinations.parity,...evidenceByKey.parity},adoption:{relative_path:destinations.adoption,...evidenceByKey.adoption},route_matrix:{relative_path:destinations.route_matrix,...evidenceByKey.route_matrix}},skills,employee_model_channel:{channel_id:'krill_codex_custom_provider_v1',used:true,network_used:true,media_provider_authority_granted:false},media_provider_authority_granted:false,test_only:false,fixture_evidence:false,...step02.falseEffects(),created_at:adoption.created_at};
  await atomicJson(path.join(staging,'step02_runtime_governance.json'),governance);return governance;
}
async function verifyManifest(root, name, expectedSha, schema, required, expectedStatus = 'verified') {
  const manifestPath = path.join(root, safeRelative(name));
  await assertNoSymlinkChain(root, manifestPath);
  const manifestEvidence = await fileEvidence(manifestPath);
  if (expectedSha && manifestEvidence.sha256 !== expectedSha) throw step02.codeError('STEP02_TRANSPORT_MANIFEST_SHA_MISMATCH');
  const manifest = await readJson(manifestPath);
  if (manifest.schema_version !== schema || manifest.status !== expectedStatus || !Array.isArray(manifest.files)) throw step02.codeError('STEP02_TRANSPORT_MANIFEST_INVALID');
  const expectedNames = required ? [...required].sort() : manifest.files.map(item => safeRelative(item.relative_path)).sort();
  const actualNames = manifest.files.map(item => safeRelative(item.relative_path)).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) throw step02.codeError('STEP02_TRANSPORT_MANIFEST_INVENTORY_INVALID');
  const actualRows = await rows(root, actualNames);
  for (let index = 0; index < actualRows.length; index += 1) if (actualRows[index].sha256 !== [...manifest.files].sort((a,b) => a.relative_path.localeCompare(b.relative_path))[index].sha256 || actualRows[index].bytes !== [...manifest.files].sort((a,b) => a.relative_path.localeCompare(b.relative_path))[index].bytes) throw step02.codeError('STEP02_TRANSPORT_FILE_TAMPERED');
  step02.assertFalseEffects(manifest);
  if (schema === EXPORT_SCHEMA) {
    for (const requiredName of EXPORT_FILES) if (!actualNames.includes(requiredName)) throw step02.codeError('STEP02_TRANSPORT_EXPORT_BASE_FILE_MISSING');
    const index = await readJson(path.join(root, 'step02_portable_evidence_index.json'));
    if (index.schema_version !== 'niannian_redraw_step02_portable_evidence_index_v1' || index.status !== 'verified' || index.project_id !== manifest.project_id || index.step01_manifest_sha256 !== manifest.step01_manifest_sha256 || !Array.isArray(index.entries) || index.entries.length !== index.artifact_count) throw step02.codeError('STEP02_TRANSPORT_EVIDENCE_INDEX_INVALID');
    for (const item of index.entries) {
      if (!actualNames.includes(safeRelative(item.package_relative_path))) throw step02.codeError('STEP02_TRANSPORT_EVIDENCE_INDEX_FILE_MISSING');
      const actual = await fileEvidence(path.join(root, item.package_relative_path));
      if (actual.sha256 !== item.sha256 || actual.bytes !== item.bytes) throw step02.codeError('STEP02_TRANSPORT_EVIDENCE_INDEX_TAMPERED');
    }
  }
  return {manifest,evidence:manifestEvidence};
}
async function exportWindowsPhase({step02Root,packageRoot}) {
  const sourceRoot = path.resolve(step02Root), destination = path.resolve(packageRoot);
  const [transaction,authority,dispatch] = await Promise.all(['transaction_intent.json','upstream_authority_snapshot.json','step02_employee_dispatch.json'].map(name => readJson(path.join(sourceRoot, name))));
  const authorityEvidence = await fileEvidence(path.join(sourceRoot, 'upstream_authority_snapshot.json'));
  if (transaction.schema_version !== step02.SCHEMAS.transaction || dispatch.schema_version !== step02.SCHEMAS.dispatch || dispatch.project_id !== authority.project_id || dispatch.transaction_id !== transaction.transaction_id || dispatch.upstream_authority_sha256 !== authorityEvidence.sha256 || dispatch.owner_id !== authority.owner_id || !dispatch.owner_action_event_id) throw step02.codeError('STEP02_TRANSPORT_EXPORT_BINDING_INVALID');
  step02.assertFalseEffects(transaction); step02.assertFalseEffects(authority); step02.assertFalseEffects(dispatch);
  const staging = destination + '.staging-' + crypto.randomBytes(4).toString('hex');
  await fsp.rm(staging, {recursive:true,force:true});
  await fsp.mkdir(staging, {recursive:true});
  try {
    for (const name of ['transaction_intent.json','upstream_authority_snapshot.json','step02_employee_dispatch.json']) await copyRegular(path.join(sourceRoot, name), path.join(staging, name));
    await copyRegular(authority.step01.manifest.exact_path, path.join(staging, 'upstream/step01_evidence_manifest.json'));
    await copyRegular(authority.step01.receipt.exact_path, path.join(staging, 'upstream/step01_employee_receipt.json'));
    await copyRegular(authority.step01.control.exact_path, path.join(staging, 'upstream/step01_control_receipt.json'));
    const index = await step01EvidenceClosure(authority, staging);
    await runtimeGovernanceClosure(staging);
    const inventory = [...EXPORT_FILES,...index.entries.map(item => item.package_relative_path)];
    const files = await rows(staging, inventory);
    const manifest = {schema_version:EXPORT_SCHEMA,status:'verified',test_only:false,fixture_evidence:false,transaction_id:dispatch.transaction_id,dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,project_id:dispatch.project_id,job_id:dispatch.job_id,owner_id:dispatch.owner_id,owner_action_event_id:dispatch.owner_action_event_id,employee_thread_id:dispatch.employee.thread_id,source_sha256:dispatch.source_sha256,rights_authority_sha256:dispatch.rights_authority_sha256,step01_manifest_sha256:dispatch.step01_manifest_sha256,upstream_authority_sha256:dispatch.upstream_authority_sha256,settings_version:dispatch.settings_version,files,...step02.falseEffects(),created_at:dispatch.prepared_at || authority.created_at};
    await atomicJson(path.join(staging, 'step02_phase_manifest.json'), manifest);
    if (fs.existsSync(destination)) {
      const next = await fileEvidence(path.join(staging, 'step02_phase_manifest.json'));
      const prior = await verifyManifest(destination,'step02_phase_manifest.json',next.sha256,EXPORT_SCHEMA,null);
      if (prior.evidence.sha256 !== next.sha256) throw step02.codeError('STEP02_TRANSPORT_EXPORT_REPLAY_CONFLICT');
      await fsp.rm(staging, {recursive:true,force:true});
    } else await fsp.rename(staging, destination);
    return {packageRoot:destination,manifest:await readJson(path.join(destination, 'step02_phase_manifest.json')),evidence:await fileEvidence(path.join(destination, 'step02_phase_manifest.json'))};
  } catch (error) { await fsp.rm(staging, {recursive:true,force:true}); throw error; }
}
async function importDispatchToMac({packageRoot,expectedManifestSha256,workspacePath}) {
  const source = path.resolve(packageRoot), destination = path.resolve(workspacePath);
  const verified = await verifyManifest(source, 'step02_phase_manifest.json', expectedManifestSha256, EXPORT_SCHEMA, null);
  if (fs.existsSync(destination)) {
    const existing = await verifyManifest(destination,'step02_phase_manifest.json',verified.evidence.sha256,EXPORT_SCHEMA,null).catch(() => null);
    if (!existing || existing.evidence.sha256 !== verified.evidence.sha256) throw step02.codeError('STEP02_TRANSPORT_MAC_REPLAY_CONFLICT');
    return {status:'replayed',workspace:destination,...verified};
  }
  const staging = destination + '.staging-' + crypto.randomBytes(4).toString('hex');
  await fsp.mkdir(staging, {recursive:true});
  try {
    for (const item of verified.manifest.files) await copyRegular(path.join(source, item.relative_path), path.join(staging, item.relative_path));
    await copyRegular(path.join(source, 'step02_phase_manifest.json'), path.join(staging, 'step02_phase_manifest.json'));
    await fsp.mkdir(path.dirname(destination), {recursive:true});
    await fsp.rename(staging, destination);
    return {status:'imported',workspace:destination,...verified};
  } catch (error) { await fsp.rm(staging, {recursive:true,force:true}); throw error; }
}
async function finalizeMacReturn({workspacePath}) {
  const root = path.resolve(workspacePath);
  const [dispatch,authority] = await Promise.all([readJson(path.join(root, 'step02_employee_dispatch.json')),readJson(path.join(root, 'upstream_authority_snapshot.json'))]);
  const authorityEvidence = await fileEvidence(path.join(root, 'upstream_authority_snapshot.json'));
  if (dispatch.upstream_authority_sha256 !== authorityEvidence.sha256 || dispatch.project_id !== authority.project_id) throw step02.codeError('STEP02_TRANSPORT_RETURN_AUTHORITY_INVALID');
  const files = await rows(root, RETURN_FILES);
  const [candidate,receipt,control,audit] = await Promise.all(RETURN_FILES.map(name => readJson(path.join(root, name))));
  if (candidate.test_only !== false || candidate.fixture_evidence !== false || receipt.completion_provenance !== 'fixed_mac_app_server_readback_v1' || control.completion_provenance !== 'fixed_mac_app_server_readback_v1' || audit.schema_version !== step02.SCHEMAS.appAudit || audit.employee_thread_id !== dispatch.employee.thread_id) throw step02.codeError('STEP02_TRANSPORT_RETURN_PROVENANCE_INVALID');
  const manifest = {schema_version:RETURN_SCHEMA,status:'candidate_return_ready',downstream_consumable:false,test_only:false,fixture_evidence:false,completion_provenance:'fixed_mac_app_server_readback_v1',transaction_id:dispatch.transaction_id,dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,project_id:dispatch.project_id,job_id:dispatch.job_id,owner_action_event_id:dispatch.owner_action_event_id,source_sha256:dispatch.source_sha256,rights_authority_sha256:dispatch.rights_authority_sha256,step01_manifest_sha256:dispatch.step01_manifest_sha256,upstream_authority_sha256:dispatch.upstream_authority_sha256,settings_version:dispatch.settings_version,employee:dispatch.employee,files,...step02.falseEffects(),created_at:new Date().toISOString()};
  const manifestPath = path.join(root, 'step02_return_manifest.json');
  if (fs.existsSync(manifestPath)) {
    const prior = await readJson(manifestPath);
    if (prior.dispatch_id !== manifest.dispatch_id || prior.phase_key !== manifest.phase_key) throw step02.codeError('STEP02_TRANSPORT_RETURN_REPLAY_CONFLICT');
  } else await atomicJson(manifestPath, manifest);
  return {manifest:await readJson(manifestPath),evidence:await fileEvidence(manifestPath)};
}
async function importMacReturnToWindows({returnRoot,expectedManifestSha256,windowsReturnRoot}) {
  const source = path.resolve(returnRoot), destination = path.resolve(windowsReturnRoot);
  const verified = await verifyManifest(source, 'step02_return_manifest.json', expectedManifestSha256, RETURN_SCHEMA, RETURN_FILES, 'candidate_return_ready');
  if (fs.existsSync(destination)) {
    const existing = await verifyManifest(destination,'step02_return_manifest.json',verified.evidence.sha256,RETURN_SCHEMA,RETURN_FILES,'candidate_return_ready').catch(() => null);
    if (!existing || existing.evidence.sha256 !== verified.evidence.sha256) throw step02.codeError('STEP02_TRANSPORT_WINDOWS_REPLAY_CONFLICT');
    return {status:'replayed',returnRoot:destination,...verified};
  }
  const staging = destination + '.staging-' + crypto.randomBytes(4).toString('hex');
  await fsp.mkdir(staging, {recursive:true});
  try {
    for (const item of verified.manifest.files) await copyRegular(path.join(source, item.relative_path), path.join(staging, item.relative_path));
    await copyRegular(path.join(source, 'step02_return_manifest.json'), path.join(staging, 'step02_return_manifest.json'));
    await fsp.mkdir(path.dirname(destination), {recursive:true});
    await fsp.rename(staging, destination);
    return {status:'imported',returnRoot:destination,...verified};
  } catch (error) { await fsp.rm(staging, {recursive:true,force:true}); throw error; }
}

module.exports = {CANONICAL_ROOT,EXPORT_FILES,EXPORT_SCHEMA,GOVERNANCE_SOURCES,RETURN_FILES,RETURN_SCHEMA,artifactRole,exportWindowsPhase,fileEvidence,finalizeMacReturn,importDispatchToMac,importMacReturnToWindows,runtimeGovernanceClosure,safeRelative,step01EvidenceClosure,verifyManifest};
