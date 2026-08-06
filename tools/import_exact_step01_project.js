'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const EXACT = Object.freeze({
  projectId:'NN-20260715083045-8120F5',
  analysisRunId:'analysis-1-0dc5c5d751592e9fd0656a81',
  sourceSha256:'a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c',
  sourceBytes:145897161,
  evidenceId:'NN-20260715083045-8120F5-EP001'
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--') || !argv[index + 1] || argv[index + 1].startsWith('--')) fail('import_argument_invalid');
    options[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return options;
}

function readJson(filePath, code = 'import_json_invalid') {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { fail(code); }
}

function normalizeRelative(value) {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.split('/').some(part => !part || part === '.' || part === '..')) fail('import_relative_path_invalid');
  return normalized;
}

function normalizeRemoteAbsolute(value) {
  const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (!normalized.startsWith('/') || normalized.endsWith('/') || normalized.split('/').some((part,index) => index > 0 && (!part || part === '.' || part === '..'))) fail('import_remote_path_invalid');
  return normalized;
}

function walkFiles(root, relative = '') {
  return fs.readdirSync(root, {withFileTypes:true}).flatMap(entry => {
    const item = relative ? relative + '/' + entry.name : entry.name;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return walkFiles(absolute, item);
    if (entry.isFile()) return [normalizeRelative(item)];
    fail('import_asset_type_invalid');
  });
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('error', reject);
    input.on('data', chunk => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

async function fileEvidence(filePath) {
  const stats = await fsp.stat(filePath).catch(() => null);
  if (!stats || !stats.isFile()) fail('import_asset_missing');
  return {sha256:await sha256File(filePath),bytes:stats.size};
}

function validateExactProject(project, expected = EXACT) {
  if (!project || project.id !== expected.projectId) fail('import_project_identity_invalid');
  if (project.analysis?.runId !== expected.analysisRunId) fail('import_analysis_run_invalid');
  if (project.source?.sha256 !== expected.sourceSha256 || Number(project.source?.bytes) !== expected.sourceBytes) fail('import_source_binding_invalid');
  if (project.analysis?.sourceSha256 !== expected.sourceSha256 || Number(project.analysis?.sourceBytes) !== expected.sourceBytes) fail('import_analysis_source_binding_invalid');
  if (project.runtime?.referenceEvidenceId !== expected.evidenceId) fail('import_evidence_identity_invalid');
}

async function prepareImport(options, expected = EXACT) {
  const projects = readJson(path.resolve(options.projectStore), 'import_project_store_invalid');
  if (!Array.isArray(projects)) fail('import_project_store_invalid');
  const project = projects.find(item => item.id === expected.projectId);
  validateExactProject(project, expected);
  const sourcePath = path.resolve(options.source);
  const evidenceRoot = path.resolve(options.evidenceRoot);
  const source = await fileEvidence(sourcePath);
  if (source.sha256 !== expected.sourceSha256 || source.bytes !== expected.sourceBytes) fail('import_source_file_mismatch');
  const evidenceFiles = [];
  for (const relativePath of walkFiles(evidenceRoot).sort()) {
    evidenceFiles.push({path:relativePath,...await fileEvidence(path.join(evidenceRoot, ...relativePath.split('/')))});
  }
  if (!evidenceFiles.length) fail('import_evidence_empty');
  const wrapper = readJson(path.join(evidenceRoot, 'step01-evidence-manifest.json'), 'import_evidence_wrapper_invalid');
  if (wrapper.projectId !== expected.projectId || wrapper.analysisRunId !== expected.analysisRunId || wrapper.source?.sha256 !== expected.sourceSha256 || Number(wrapper.source?.bytes) !== expected.sourceBytes || wrapper.status !== 'completed') fail('import_evidence_wrapper_binding_invalid');
  const projectCopy = JSON.parse(JSON.stringify(project));
  projectCopy.ownerId = null;
  projectCopy.source.storedPath = normalizeRemoteAbsolute(options.remoteSource);
  const manifest = {
    schema_version:'niannian_exact_step01_production_import_v1',
    expected:{...expected},
    account_email:String(options.accountEmail || '').trim().toLowerCase(),
    source:{destination:projectCopy.source.storedPath,...source},
    evidence:{destination:normalizeRemoteAbsolute(options.remoteEvidenceRoot),files:evidenceFiles},
    project:projectCopy,
    prepared_at:new Date().toISOString()
  };
  if (!manifest.account_email || !manifest.account_email.includes('@')) fail('import_account_email_invalid');
  const output = path.resolve(options.output);
  await fsp.mkdir(path.dirname(output), {recursive:true});
  await fsp.writeFile(output, JSON.stringify(manifest, null, 2) + '\n', {flag:'wx'});
  return {manifestPath:output,evidenceFiles:evidenceFiles.length,evidenceBytes:evidenceFiles.reduce((sum,item) => sum + item.bytes,0),source};
}

function validateManifest(manifest, expected = EXACT) {
  if (manifest?.schema_version !== 'niannian_exact_step01_production_import_v1') fail('import_manifest_schema_invalid');
  for (const [key,value] of Object.entries(expected)) if (manifest.expected?.[key] !== value) fail('import_manifest_expected_mismatch');
  validateExactProject(manifest.project, expected);
  if (manifest.project.ownerId !== null) fail('import_manifest_owner_must_be_resolved_server_side');
  if (manifest.project.source.storedPath !== manifest.source?.destination || manifest.source.sha256 !== expected.sourceSha256 || Number(manifest.source.bytes) !== expected.sourceBytes) fail('import_manifest_source_invalid');
  if (!Array.isArray(manifest.evidence?.files) || !manifest.evidence.files.length) fail('import_manifest_evidence_invalid');
  const paths = manifest.evidence.files.map(item => normalizeRelative(item.path));
  if (new Set(paths).size !== paths.length || paths.some((item,index) => item !== [...paths].sort()[index])) fail('import_manifest_evidence_paths_invalid');
  for (const item of manifest.evidence.files) if (!/^[a-f0-9]{64}$/.test(String(item.sha256 || '')) || !Number.isSafeInteger(item.bytes) || item.bytes < 0) fail('import_manifest_evidence_item_invalid');
}

async function verifyAssets(manifest, sourcePath = manifest.source.destination, evidenceRoot = manifest.evidence.destination, expected = EXACT) {
  validateManifest(manifest, expected);
  const source = await fileEvidence(sourcePath);
  if (source.sha256 !== manifest.source.sha256 || source.bytes !== manifest.source.bytes) fail('import_source_file_mismatch');
  const actualPaths = walkFiles(evidenceRoot).sort();
  const expectedPaths = manifest.evidence.files.map(item => normalizeRelative(item.path));
  if (actualPaths.length !== expectedPaths.length || actualPaths.some((item,index) => item !== expectedPaths[index])) fail('import_evidence_inventory_mismatch');
  for (const item of manifest.evidence.files) {
    const actual = await fileEvidence(path.join(evidenceRoot, ...normalizeRelative(item.path).split('/')));
    if (actual.sha256 !== item.sha256 || actual.bytes !== item.bytes) fail('import_evidence_file_mismatch:' + item.path);
  }
  return {source,evidenceFiles:actualPaths.length,evidenceBytes:manifest.evidence.files.reduce((sum,item) => sum + item.bytes,0)};
}

async function syncDirectory(directory) {
  let handle;
  try {
    handle = await fsp.open(directory, 'r');
    await handle.sync();
  } catch (error) {
    if (process.platform !== 'win32' || !['EPERM','EINVAL','EBADF'].includes(error.code)) throw error;
  }
  finally { if (handle) await handle.close(); }
}

async function writeJsonAtomic(filePath, value) {
  const directory = path.dirname(filePath);
  const temporary = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  const original = await fsp.stat(filePath).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  let handle;
  try {
    handle = await fsp.open(temporary, 'wx', 0o600);
    await handle.writeFile(Buffer.from(JSON.stringify(value, null, 2) + '\n'));
    if (original) {
      await handle.chmod(original.mode & 0o777);
      if (process.platform !== 'win32') await handle.chown(original.uid, original.gid);
    }
    await handle.sync();
    await handle.close();
    handle = null;
    await fsp.rename(temporary, filePath);
    await syncDirectory(directory);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fsp.rm(temporary, {force:true}).catch(() => {});
    throw error;
  }
}

async function applyImport(options, expected = EXACT) {
  const manifest = readJson(path.resolve(options.manifest), 'import_manifest_invalid');
  validateManifest(manifest, expected);
  await verifyAssets(manifest, options.source || manifest.source.destination, options.evidenceRoot || manifest.evidence.destination, expected);
  const users = readJson(path.resolve(options.users), 'import_users_invalid');
  const projectsPath = path.resolve(options.projects);
  const projects = readJson(projectsPath, 'import_projects_invalid');
  if (!Array.isArray(users) || !Array.isArray(projects)) fail('import_store_shape_invalid');
  const owners = users.filter(user => String(user.email || '').trim().toLowerCase() === manifest.account_email);
  if (owners.length !== 1 || !owners[0].id) fail('import_owner_not_unique');
  const existing = projects.find(item => item.id === expected.projectId);
  if (existing) {
    validateExactProject(existing, expected);
    if (existing.ownerId !== owners[0].id || existing.source.storedPath !== manifest.source.destination) fail('import_existing_project_conflict');
    return {status:'already_imported',projectId:expected.projectId,ownerResolved:true,projectCount:projects.length};
  }
  const backup = path.resolve(options.backup);
  await fsp.mkdir(path.dirname(backup), {recursive:true});
  await fsp.copyFile(projectsPath, backup, fs.constants.COPYFILE_EXCL);
  const backupHandle = await fsp.open(backup, 'r');
  try {
    await backupHandle.sync();
  } catch (error) {
    if (process.platform !== 'win32' || !['EPERM','EINVAL','EBADF'].includes(error.code)) throw error;
  } finally { await backupHandle.close(); }
  const imported = JSON.parse(JSON.stringify(manifest.project));
  imported.ownerId = owners[0].id;
  projects.push(imported);
  await writeJsonAtomic(projectsPath, projects);
  const readback = readJson(projectsPath, 'import_projects_readback_invalid').find(item => item.id === expected.projectId);
  validateExactProject(readback, expected);
  if (readback.ownerId !== owners[0].id || readback.source.storedPath !== manifest.source.destination) fail('import_readback_invalid');
  return {status:'imported',projectId:expected.projectId,ownerResolved:true,projectCount:projects.length,backup};
}

async function main(argv) {
  const [command,...rest] = argv;
  const options = parseArgs(rest);
  if (command === 'prepare') return prepareImport(options);
  if (command === 'verify-assets') {
    const manifest = readJson(path.resolve(options.manifest), 'import_manifest_invalid');
    return verifyAssets(manifest, options.source, options.evidenceRoot);
  }
  if (command === 'apply') return applyImport(options);
  fail('import_command_invalid');
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then(result => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch(error => { process.stderr.write(String(error.code || error.message || error) + '\n'); process.exitCode = 1; });
}

module.exports = {EXACT,normalizeRelative,normalizeRemoteAbsolute,walkFiles,sha256File,validateExactProject,prepareImport,validateManifest,verifyAssets,applyImport,writeJsonAtomic};
