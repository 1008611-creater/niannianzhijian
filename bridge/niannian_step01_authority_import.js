'use strict';

// Imports a revision as one exact, broker-addressed archive. The archive is
// unpacked only below the revision root and is revalidated from its native
// evidence files before it can become an authority candidate.
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const {spawn} = require('child_process');
const fullEvidenceIndex = require('./niannian_step01_full_evidence_index');
const authority = require('./niannian_step01_authority_revision');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function fail(code, message, status = 409) { const error = new Error(message || code); error.code = code; error.httpStatus = status; return error; }
function safeName(value) { const text = String(value || ''); if (!/^[A-Za-z0-9._-]{1,160}$/.test(text)) throw fail('STEP01_AUTHORITY_IMPORT_ARCHIVE_INVALID', '证据归档标识无效', 422); return text; }
function safeTarEntry(value) { const entry = String(value || '').replace(/\\/g, '/'); const parts = entry.replace(/\/$/, '').split('/'); return entry && !entry.startsWith('/') && !/^[A-Za-z]:/.test(entry) && !parts.some(part => !part || part === '.' || part === '..'); }
function inside(root, target) { const relative = path.relative(root, target); return relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative); }
async function readJson(filePath) { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
async function command(program, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(program, args, {cwd:options.cwd, windowsHide:true, stdio:['ignore','pipe','pipe']});
    const stdout = []; const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk)); child.stderr.on('data', chunk => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(Buffer.concat(stdout)) : reject(fail('STEP01_AUTHORITY_IMPORT_ARCHIVE_INVALID', '证据归档无法读取')));
  });
}
async function assertNoLinks(root) {
  const entries = await fsp.readdir(root, {withFileTypes:true});
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw fail('STEP01_AUTHORITY_IMPORT_PATH_INVALID', '证据归档包含不允许的链接');
    if (entry.isDirectory()) await assertNoLinks(target);
  }
}
async function unpackArchive({archivePath, destination}) {
  const listed = (await command('tar', ['-tzf', archivePath])).toString('utf8').split(/\r?\n/).filter(Boolean);
  if (!listed.length || listed.some(entry => !safeTarEntry(entry) || !entry.startsWith('artifacts/'))) throw fail('STEP01_AUTHORITY_IMPORT_ARCHIVE_INVALID', '证据归档路径无效');
  await fsp.mkdir(destination, {recursive:true});
  await command('tar', ['-xzf', archivePath, '--no-same-owner', '--no-same-permissions', '-C', destination]);
  await assertNoLinks(destination);
}
async function verifyEvidence({evidenceRoot, project, expected}) {
  const artifactRoot = path.join(evidenceRoot, 'artifacts');
  const manifest = await readJson(path.join(artifactRoot, 'step01_evidence_manifest.json'));
  if (manifest.schema !== 'niannian.step01_evidence_manifest.v1' || manifest.status !== 'verified' || manifest.downstream_consumable !== true || manifest.source?.sha256 !== project.source?.sha256 || Number(manifest.source?.bytes) !== Number(project.source?.bytes)) throw fail('STEP01_AUTHORITY_IMPORT_EVIDENCE_INVALID', '证据清单与当前原片不一致');
  const index = await fullEvidenceIndex.readVerified({evidenceRoot, project});
  const shots = await readJson(path.join(artifactRoot, 'transnet_shots', 'EP001_transnet_shots.json'));
  const triads = await readJson(path.join(artifactRoot, 'shotlevel_start_mid_end_manifest.json'));
  if (!Array.isArray(shots) || !Array.isArray(triads) || !shots.length || triads.length !== shots.length * 3) throw fail('STEP01_AUTHORITY_IMPORT_EVIDENCE_INVALID', '镜头或三帧校对包不完整');
  const observed = {frames:index.frames.length, shots:shots.length, triad_frames:triads.length};
  if (expected && (Number(expected.frames) !== observed.frames || Number(expected.shots) !== observed.shots || Number(expected.triad_frames) !== observed.triad_frames)) throw fail('STEP01_AUTHORITY_IMPORT_COUNTS_MISMATCH', '证据计数与导入声明不一致');
  return {index, manifest, counts:observed};
}
async function writeWebEvidenceWrapper({evidenceRoot, project, revisionId, verified}) {
  const wrapperPath = path.join(evidenceRoot, 'step01-evidence-manifest.json');
  const wrapper = {
    schema_version:'niannian.step01_evidence_wrapper.v1',
    status:'completed',
    projectId:project.id,
    analysisRunId:revisionId,
    source:{sha256:project.source.sha256, bytes:Number(project.source.bytes)},
    strictEvidence:{counts:{transnet_shots:verified.counts.shots, shot_triad_rows:verified.counts.triad_frames, native_pngs:verified.counts.frames}},
    createdAt:new Date().toISOString()
  };
  await fsp.writeFile(wrapperPath, JSON.stringify(wrapper, null, 2) + '\n', {flag:'wx'});
  return wrapper;
}
async function importArchive({root, project, revisionId, archive, expected}) {
  const revisionRoot = authority.revisionRoot(root, project.id, revisionId);
  const archiveName = safeName(archive?.filename || 'evidence.tar.gz');
  const body = Buffer.from(archive?.body || []);
  if (!body.length || body.length !== Number(archive?.bytes) || sha256(body) !== String(archive?.sha256 || '')) throw fail('STEP01_AUTHORITY_IMPORT_ARCHIVE_INVALID', '证据归档完整性校验失败', 422);
  const staging = revisionRoot + '.staging-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  const archivePath = path.join(staging, archiveName);
  try {
    await fsp.mkdir(staging, {recursive:true});
    await fsp.writeFile(archivePath, body, {flag:'wx'});
    const evidenceRoot = path.join(staging, 'evidence');
    await unpackArchive({archivePath, destination:evidenceRoot});
    const verified = await verifyEvidence({evidenceRoot, project, expected});
    await writeWebEvidenceWrapper({evidenceRoot, project, revisionId, verified});
    const target = authority.revisionRoot(root, project.id, revisionId);
    if (!inside(authority.projectRoot(root, project.id), target)) throw fail('STEP01_AUTHORITY_IMPORT_PATH_INVALID', '证据 revision 路径无效');
    const existing = await fsp.stat(target).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (existing) throw fail('STEP01_AUTHORITY_IMPORT_EXISTS', '该证据 revision 已存在');
    await fsp.mkdir(path.dirname(target), {recursive:true});
    await fsp.rename(staging, target);
    return {evidence_root:path.join(target, 'evidence'), index:verified.index, manifest:verified.manifest, counts:verified.counts};
  } catch (error) {
    await fsp.rm(staging, {recursive:true,force:true}).catch(() => {});
    throw error;
  }
}

module.exports = {sha256, verifyEvidence, writeWebEvidenceWrapper, importArchive, unpackArchive};
