const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const { run: verifyReleaseGate } = require('./verify_canonical_release_gate');

const root = path.resolve(__dirname);
const target = 'https://ai.cauai.fun';
function activeBrandAssetFromIndex(indexHtml) {
  const imageTag = [...indexHtml.matchAll(/<img\b[^>]*>/gi)]
    .map(match => match[0])
    .find(tag => /\bclass=(['"])[^'"]*\bhero-logo\b[^'"]*\1/i.test(tag));
  const src = imageTag?.match(/\bsrc=(['"])([^'"]+)\1/i)?.[2] || '';
  const normalized = src.replace(/^\.?(?:\/|\\)/, '').replace(/\\/g, '/');
  if (!normalized.startsWith('assets/brand/') || normalized.includes('..')) fail('release_stage_active_brand_asset_invalid');
  return normalized;
}

const activeBrandAsset = activeBrandAssetFromIndex(fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
// These are complete, separately built browser surfaces.  Copying only their entry
// modules is unsafe because their hashed dynamic chunks are part of the runtime.
const releaseStaticDirectories = Object.freeze([
  'assets',
  'vendor',
  'studio',
  'director-desk'
]);
const localValidationAllowedFiles = Object.freeze([
  'server.js', 'index.html', 'app.js', 'product.css', 'styles.css',
  'product-system.css', 'hero-oil-paint.css', 'sw.js', 'bridge/niannian_controller_bridge.js'
]);
function recursiveJavaScriptFiles(directory, relativeRoot) {
  return fs.readdirSync(directory, {withFileTypes:true}).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    const relative = relativeRoot + '/' + entry.name;
    if (entry.isDirectory()) return recursiveJavaScriptFiles(absolute, relative);
    return entry.isFile() && entry.name.endsWith('.js') ? [relative] : [];
  });
}

function recursiveFiles(directory, relativeRoot) {
  return fs.readdirSync(directory, {withFileTypes:true}).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    const relative = relativeRoot + '/' + entry.name;
    if (entry.isDirectory()) return recursiveFiles(absolute, relative);
    return entry.isFile() ? [relative] : [];
  });
}

function gitTrackedFiles(relativeRoot, predicate = () => true) {
  const prefix = relativeRoot.replace(/\\/g, '/').replace(/\/$/, '') + '/';
  return childProcess.execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', relativeRoot], {cwd:root, encoding:'utf8'})
    .split(/\r?\n/)
    .filter(relativePath => relativePath.startsWith(prefix) && predicate(relativePath))
    .sort();
}

const runtimeBridgeJavaScriptFiles = gitTrackedFiles('bridge', relativePath => relativePath.endsWith('.js'));
const step02SkillBundleFiles = gitTrackedFiles('runtime/skill-bundles/shortdrama-localization-runtime-1');
const step04AbcdSkillBundleFiles = gitTrackedFiles('runtime/skill-bundles/shortdrama-step04-abcd-runtime-1');
const step02RuntimeContractFiles = gitTrackedFiles('docs/step02-runtime-contract');
const step04DToolTargets = [
  'render_step04_abcd_docx.py',
  'qa_step04_abcd_docx_preview.js',
  'finalize_step04_abcd.py',
].map(name => `tools/${name}`).concat(gitTrackedFiles('tools/vendor'));
const runtimeFiles = [...new Set([
  'server.js',
  'index.html',
  'app.js',
  'mvp-step02-r13.js',
  'mvp-step03-r1.js',
  'mvp-step01-ledger-r1.js',
  'mvp-step01-story-r1.js',
  'mvp-source-truth-r1.js',
  'styles.css',
  'product.css',
  'product-system.css',
  'hero-oil-paint.css',
  'amber-authority.css',
  'director-desk.css',
  'step04-delivery.css',
  'director-desk-host.js',
  'favicon.svg',
  'manifest.webmanifest',
  'sw.js',
  'vendor/gsap-3.13.0.min.js',
  'vendor/gsap-flip-3.13.0.min.js',
  'assets/home/niannian-hero-oil-paint-quiet-v1.png',
  'assets/home/niannian-hero-oil-vortex-loop-v2.mp4',
  'assets/showcase/short-drama-keyart-v1.png',
  'assets/showcase/animation-drama-keyart-v1.png',
  'assets/showcase/redraw-keyart-partial-xuedi-v1.png',
  'assets/brand/niannian-ai-fused-monogram-v6-brand-pink.png',
  activeBrandAsset,
  'package.json',
  'package-lock.json',
  'release_static_sha_gate.js',
  'scripts/probe_step02_mcgrox.js',
  'scripts/recover_step01_frame_evidence.js',
  'scripts/run_step03_worker.js',
  'bridge/niannian_step01_hq_runner.py',
  'bridge/niannian_low_risk_policy.js',
  'bridge/niannian_shot_review.js',
  'docs/shot-review-contract/contract-manifest.json',
  'docs/shot-review-contract/api-contract.md',
  'docs/shot-review-contract/mapping-rules.md',
  'docs/shot-review-contract/schemas/revision-overlay.schema.json',
  'docs/shot-review-contract/schemas/shot-review-model.schema.json',
  'docs/shot-review-contract/schemas/single-shot-reanalysis-input.schema.json',
  'docs/shot-review-contract/schemas/single-shot-reanalysis-output.schema.json',
  'AGENTS.md',
  'bridge/skill_registry.json',
  ...step02SkillBundleFiles,
  ...step04AbcdSkillBundleFiles,
  ...step02RuntimeContractFiles,
  ...step04DToolTargets,
  ...runtimeBridgeJavaScriptFiles
])];

function fail(message) {
  throw new Error(message);
}

function samePath(left, right) {
  return path.resolve(left).replace(/\\/g, '/').toLowerCase() === path.resolve(right).replace(/\\/g, '/').toLowerCase();
}

function isInside(base, candidate) {
  const relative = path.relative(base, candidate);
  return relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function normalizeRelativePath(value, label = 'release_stage_path_invalid') {
  if (typeof value !== 'string' || !value.trim()) fail(label);
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    fail(label);
  }
  return normalized;
}

function gitRevision() {
  try {
    const revision = childProcess.execFileSync('git', ['rev-parse', 'HEAD'], { cwd:root, encoding:'utf8', stdio:['ignore', 'pipe', 'ignore'] }).trim();
    if (!/^[a-f0-9]{40}$/i.test(revision)) fail('release_stage_git_revision_invalid');
    return revision.toLowerCase();
  } catch {
    fail('release_stage_git_revision_unavailable');
  }
}

function gitWorktreeClean() {
  try {
    return childProcess.execFileSync('git', ['status', '--porcelain'], { cwd:root, encoding:'utf8', stdio:['ignore', 'pipe', 'ignore'] }).trim() === '';
  } catch {
    fail('release_stage_git_status_unavailable');
  }
}

function committedSourcePaths() {
  try {
    return new Set(
      childProcess.execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd:root, encoding:'utf8', stdio:['ignore', 'pipe', 'ignore'] })
        .split(/\r?\n/)
        .filter(Boolean)
    );
  } catch {
    fail('release_stage_committed_source_inventory_unavailable');
  }
}

function copyCommittedFile(relativePath, destinationPath) {
  const normalized = normalizeRelativePath(relativePath, 'release_stage_committed_source_path_invalid');
  let content;
  try {
    content = childProcess.execFileSync('git', ['show', `HEAD:${normalized}`], { cwd:root, encoding:null, stdio:['ignore', 'pipe', 'ignore'] });
  } catch {
    fail('release_stage_committed_source_file_unavailable:' + normalized);
  }
  fs.mkdirSync(path.dirname(destinationPath), { recursive:true });
  fs.writeFileSync(destinationPath, content, { flag:'wx' });
}

function normalizeCandidateContract(candidate = {}) {
  const releaseId = String(candidate.release_id || 'local-validation-stage').trim();
  const parentReleaseId = String(candidate.parent_release_id || 'online-baseline-unset').trim();
  const scope = String(candidate.scope || 'local package integrity validation only').trim();
  if (!/^[a-z0-9][a-z0-9-]{2,127}$/i.test(releaseId)) fail('release_stage_release_id_invalid');
  if (!/^[a-z0-9][a-z0-9-]{2,127}$/i.test(parentReleaseId)) fail('release_stage_parent_release_id_invalid');
  if (!scope || scope.length > 500) fail('release_stage_scope_invalid');
  const allowedFiles = Array.isArray(candidate.allowed_files) && candidate.allowed_files.length
    ? candidate.allowed_files.map(value => normalizeRelativePath(value, 'release_stage_allowed_file_invalid')).sort()
    : localValidationAllowedFiles.slice();
  if (new Set(allowedFiles).size !== allowedFiles.length) fail('release_stage_allowed_files_duplicate');
  return { release_id:releaseId, parent_release_id:parentReleaseId, scope, allowed_files:allowedFiles };
}

function isWithinStaticDirectory(relativePath) {
  return releaseStaticDirectories.some(directory => relativePath === directory || relativePath.startsWith(directory + '/'));
}

function copyFile(sourcePath, destinationPath) {
  const stat = fs.lstatSync(sourcePath);
  if (!stat.isFile()) fail('release_stage_source_file_invalid:' + sourcePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive:true });
  fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
}

function copyDirectory(sourcePath, destinationPath) {
  const stat = fs.lstatSync(sourcePath);
  if (!stat.isDirectory()) fail('release_stage_dependency_directory_invalid:' + sourcePath);
  fs.mkdirSync(destinationPath, { recursive:true });
  for (const entry of fs.readdirSync(sourcePath, { withFileTypes:true })) {
    const sourceChild = path.join(sourcePath, entry.name);
    const destinationChild = path.join(destinationPath, entry.name);
    if (entry.isDirectory()) copyDirectory(sourceChild, destinationChild);
    else if (entry.isFile()) copyFile(sourceChild, destinationChild);
    else fail('release_stage_dependency_entry_invalid:' + sourceChild);
  }
}

function walkFiles(directory, relative = '') {
  return fs.readdirSync(directory, { withFileTypes:true }).flatMap(entry => {
    const relativePath = relative ? relative + '/' + entry.name : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkFiles(absolutePath, relativePath);
    if (entry.isFile()) return [relativePath];
    fail('release_stage_output_entry_invalid:' + relativePath);
  });
}

function stageManifest(stageRoot) {
  const files = walkFiles(stageRoot).sort();
  const file_sha256 = {};
  let total_bytes = 0;
  for (const relativePath of files) {
    const filePath = path.join(stageRoot, relativePath);
    file_sha256[relativePath] = sha256(filePath);
    total_bytes += fs.statSync(filePath).size;
  }
  return { files, file_sha256, total_bytes };
}

function buildStage(candidateRoot, candidate = {}) {
  const resolvedCandidateRoot = path.resolve(candidateRoot);
  if (samePath(resolvedCandidateRoot, root) || isInside(root, resolvedCandidateRoot) || isInside(resolvedCandidateRoot, root)) {
    fail('release_stage_output_must_be_isolated_workspace_sibling');
  }
  if (fs.existsSync(resolvedCandidateRoot)) fail('release_stage_output_already_exists');

  const stageRoot = path.join(resolvedCandidateRoot, 'package');
  const packageManifestPath = path.join(resolvedCandidateRoot, 'release-package-manifest.json');
  const candidateSummaryPath = path.join(resolvedCandidateRoot, 'release-candidate-summary.json');
  const candidateContract = normalizeCandidateContract(candidate);
  const committedPaths = committedSourcePaths();
  fs.mkdirSync(stageRoot, { recursive:true });

  for (const relativePath of runtimeFiles.filter(relativePath => !isWithinStaticDirectory(relativePath))) {
    if (!committedPaths.has(relativePath)) fail('release_stage_untracked_runtime_dependency:' + relativePath);
    copyCommittedFile(relativePath, path.join(stageRoot, relativePath));
  }
  for (const relativeDirectory of releaseStaticDirectories) {
    for (const relativePath of gitTrackedFiles(relativeDirectory)) {
      copyCommittedFile(relativePath, path.join(stageRoot, relativePath));
    }
  }
  const inventory = stageManifest(stageRoot);
  const packageManifest = {
    schema_version: 'niannian_release_package_manifest_v2',
    release: {
      ...candidateContract,
      source_git_revision: gitRevision(),
      materialization: 'local_candidate_only_not_deployed'
    },
    source_root: root,
    target,
    package_root: stageRoot,
    files: inventory.files,
    file_sha256: inventory.file_sha256,
    total_bytes: inventory.total_bytes,
    // Native dependencies must be materialized on the Linux deployment host
    // from this lockfile.  A Windows node_modules tree is not a portable release input.
    dependency_source: 'materialize deployment-host node_modules from package-lock.json after lockfile hash parity check',
    included_static_directories: releaseStaticDirectories,
    excluded_by_construction: ['node_modules', 'data-local', 'data', 'output', 'outputs', 'logs', '.local', 'mature-web', 'deploy', 'verification_frontend', '.env*', 'release-governance-archive'],
    generated_at: new Date().toISOString()
  };
  fs.writeFileSync(packageManifestPath, JSON.stringify(packageManifest, null, 2) + '\n', { encoding:'utf8', flag:'wx' });

  const verification = verifyReleaseGate(['--target', target, '--package-manifest', packageManifestPath]);
  if (!verification.release_ready) fail('release_stage_gate_not_ready');

  const projectManifest = JSON.parse(fs.readFileSync(path.join(root, 'PROJECT_MANIFEST.json'), 'utf8'));
  const productionRelease = projectManifest.release_governance.current_production_release;
  const summary = {
    schema_version: 'niannian_release_candidate_v1',
    target,
    source_root: root,
    release: packageManifest.release,
    stage_root: stageRoot,
    package_manifest: packageManifestPath,
    file_count: inventory.files.length,
    total_bytes: inventory.total_bytes,
    gate: verification,
    deployed_release_id: productionRelease.release_id,
    production_parity: productionRelease.parity_with_current_canonical,
    production_impact: 'Current canonical differs from the deployed immutable release. This candidate is local-only and has not been uploaded or activated.',
    next_gate: 'separate production deployment authorization for remote staging, verification, activation, and public readback'
  };
  fs.writeFileSync(candidateSummaryPath, JSON.stringify(summary, null, 2) + '\n', { encoding:'utf8', flag:'wx' });
  return summary;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || !value || value.startsWith('--')) fail('release_stage_argument_invalid');
    values[key.slice(2)] = value;
  }
  if (!values.output) fail('release_stage_output_required');
  const hasCandidateIdentity = values['release-id'] || values['parent-release'] || values.scope || values['allowed-file'];
  if (hasCandidateIdentity && (!values['release-id'] || !values['parent-release'] || !values.scope || !values['allowed-file'])) {
    fail('release_stage_candidate_contract_incomplete');
  }
  return {
    output:values.output,
    candidate: hasCandidateIdentity ? {
      release_id:values['release-id'],
      parent_release_id:values['parent-release'],
      scope:values.scope,
      allowed_files:values['allowed-file'].split(',').filter(Boolean)
    } : {}
  };
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    process.stdout.write(JSON.stringify(buildStage(options.output, options.candidate)) + '\n');
  } catch (error) {
    process.stderr.write(String(error.message || error) + '\n');
    process.exitCode = 1;
  }
}

module.exports = { buildStage, runtimeFiles, releaseStaticDirectories, activeBrandAssetFromIndex, recursiveJavaScriptFiles, recursiveFiles, normalizeCandidateContract, parseArgs, gitWorktreeClean, committedSourcePaths, copyCommittedFile };
