'use strict';

// Prepare the exact COS import declaration for the already verified Step01
// candidate. This script never reads credentials and never changes authority.
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const importer = require('../bridge/niannian_step01_authority_import');

const DEFAULTS = Object.freeze({
  projectId:'NN-20260715083045-8120F5',
  revisionId:'analysis-20260727-full-evidence-r1',
  sourceSha256:'a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c',
  sourceBytes:145897161,
  frames:254,
  shots:37,
  triadFrames:111,
  sourceRevision:1
});

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = String(argv[i] || '');
    if (!key.startsWith('--')) throw new Error('参数无效');
    if (key === '--validate-only') { out.validateOnly = true; continue; }
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error('参数缺少值');
    out[key.slice(2)] = value;
  }
  return out;
}

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function safePath(value, fallback) { return path.resolve(String(value || fallback)); }
function run(program, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {cwd, windowsHide:true, stdio:['ignore','pipe','pipe']});
    const stdout = []; const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(Buffer.concat(stdout)) : reject(new Error('归档创建失败')));
  });
}

async function validateCandidate(candidateRoot) {
  const artifactRoot = path.join(candidateRoot, 'artifacts');
  const manifest = readJson(path.join(artifactRoot, 'step01_evidence_manifest.json'));
  const index = readJson(path.join(artifactRoot, 'full_evidence_index.json'));
  const project = {id:DEFAULTS.projectId, source:{sha256:DEFAULTS.sourceSha256, bytes:DEFAULTS.sourceBytes}, analysis:{runId:DEFAULTS.revisionId}};
  if (manifest.source?.sha256 !== DEFAULTS.sourceSha256 || Number(manifest.source?.bytes) !== DEFAULTS.sourceBytes) throw new Error('源片身份不一致');
  if (index.analysis_run_id !== DEFAULTS.revisionId || index.index_sha256 !== '38b3cf07f49a5050c7ea9b09994d4f0e2dc609e6c2412e065640ae02cf189d3d') throw new Error('完整证据索引不一致');
  const verified = await importer.verifyEvidence({evidenceRoot:candidateRoot, project, expected:{frames:DEFAULTS.frames, shots:DEFAULTS.shots, triad_frames:DEFAULTS.triadFrames}});
  return {manifest, index:verified.index, counts:verified.counts};
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const candidateRoot = safePath(args.candidate, path.join(__dirname, '..', 'data-local', 'step01-evidence-candidates', DEFAULTS.projectId, DEFAULTS.revisionId));
  const outputDir = safePath(args.output, path.join(os.tmpdir(), 'niannian-step01-import'));
  const archivePath = safePath(args.archive, path.join(outputDir, DEFAULTS.revisionId + '.tar.gz'));
  const declarationPath = safePath(args.declaration, path.join(outputDir, DEFAULTS.revisionId + '.import-declaration.json'));
  const verified = await validateCandidate(candidateRoot);
  if (args.validateOnly) {
    process.stdout.write(JSON.stringify({status:'validated', project_id:DEFAULTS.projectId, revision_id:DEFAULTS.revisionId, counts:verified.counts, full_evidence_index_sha256:verified.index.index_sha256, strict_manifest_sha256:verified.index.evidence_manifest_sha256}) + '\n');
    return;
  }
  await fsp.mkdir(outputDir, {recursive:true});
  await run('tar', ['-czf', archivePath, '-C', candidateRoot, 'artifacts'], candidateRoot);
  const archive = await fsp.readFile(archivePath);
  const declaration = {
    schema_version:'niannian.step01_authority_import_declaration.v1',
    project_id:DEFAULTS.projectId,
    revision_id:DEFAULTS.revisionId,
    source_revision:DEFAULTS.sourceRevision,
    counts:verified.counts,
    strict_manifest_sha256:verified.index.evidence_manifest_sha256,
    full_evidence_index_sha256:verified.index.index_sha256,
    archive_bytes:archive.length,
    archive_sha256:sha256(archive),
    transport:'tencent_cos_artifact_broker',
    authority_change:'none',
    created_at:new Date().toISOString()
  };
  await fsp.writeFile(declarationPath, JSON.stringify(declaration, null, 2) + '\n', {flag:'wx'});
  process.stdout.write(JSON.stringify({status:'prepared', declaration_path:declarationPath, archive_path:archivePath, project_id:DEFAULTS.projectId, revision_id:DEFAULTS.revisionId, counts:verified.counts, archive_bytes:archive.length, archive_sha256:declaration.archive_sha256}) + '\n');
}

if (require.main === module) main().catch(error => { process.stderr.write(String(error.message || error) + '\n'); process.exitCode = 1; });
module.exports = {DEFAULTS, validateCandidate, main};
