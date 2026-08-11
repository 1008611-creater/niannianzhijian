const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname);
const manifestPath = path.join(root, 'PROJECT_MANIFEST.json');
const protectedSharedFiles = Object.freeze([
  'server.js',
  'index.html',
  'app.js',
  'product.css',
  'styles.css',
  'product-system.css',
  'hero-oil-paint.css',
  'sw.js',
  'bridge/niannian_controller_bridge.js'
]);

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) fail('release_gate_argument_invalid');
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!key || !value || value.startsWith('--')) fail('release_gate_argument_value_missing');
    options[key] = value;
    index += 1;
  }
  return options;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(label + '_invalid_json');
  }
}

function samePath(left, right) {
  const normalizeComparablePath = value => {
    let candidate = String(value || '').trim().replace(/\\/g, '/');
    // PROJECT_MANIFEST.json is shared across Windows and WSL. Treat a Windows
    // drive path as its WSL mount when this process is running on Linux.
    if (process.platform !== 'win32') {
      const drivePath = candidate.match(/^([A-Za-z]):\/(.*)$/);
      if (drivePath) candidate = `/mnt/${drivePath[1].toLowerCase()}/${drivePath[2]}`;
    }
    return path.resolve(candidate).replace(/\\/g, '/').toLowerCase();
  };
  return normalizeComparablePath(left) === normalizeComparablePath(right);
}

function verifiedGitHubCheckout() {
  if (process.env.CI !== 'true' || process.env.GITHUB_REPOSITORY !== '1008611-creater/niannian-ai') return false;
  try {
    const topLevel = childProcess.execFileSync('git', ['rev-parse', '--show-toplevel'], {cwd:root, encoding:'utf8'}).trim();
    const origin = childProcess.execFileSync('git', ['config', '--get', 'remote.origin.url'], {cwd:root, encoding:'utf8'}).trim();
    const revision = childProcess.execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root, encoding:'utf8'}).trim();
    return samePath(topLevel, root)
      && /github\.com[/:]1008611-creater\/niannian-ai(?:\.git)?$/i.test(origin)
      && /^[a-f0-9]{40}$/i.test(revision);
  } catch {
    return false;
  }
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function normalizeRelativePath(value) {
  if (typeof value !== 'string' || !value.trim()) fail('release_package_file_invalid');
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    fail('release_package_file_path_invalid');
  }
  return normalized;
}

function walkFiles(directory, relative = '') {
  return fs.readdirSync(directory, { withFileTypes:true }).flatMap(entry => {
    const relativePath = relative ? relative + '/' + entry.name : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkFiles(absolutePath, relativePath);
    if (entry.isFile()) return [relativePath];
    fail('release_package_entry_type_invalid:' + relativePath);
  });
}

const staticAssetExtension = /\.(?:avif|css|gif|ico|jpe?g|js|json|mjs|mp4|png|svg|ttf|webm|webmanifest|woff2?)(?:[?#].*)?$/i;

function localStaticReference(value, sourceRelativePath) {
  const reference = String(value || '').trim();
  if (!reference || reference.startsWith('#') || /^(?:data|https?|mailto|tel):/i.test(reference)) return null;
  const withoutQuery = reference.split(/[?#]/, 1)[0];
  if (!staticAssetExtension.test(reference)) return null;
  const resolved = withoutQuery.startsWith('/')
    ? withoutQuery.slice(1)
    : path.posix.normalize(path.posix.join(path.posix.dirname(sourceRelativePath), withoutQuery));
  return normalizeRelativePath(resolved);
}

function staticReferences(relativePath, content) {
  const references = [];
  if (/\.html?$/i.test(relativePath)) {
    for (const match of content.matchAll(/\b(?:src|href|poster)=(['"])(.*?)\1/gi)) references.push(match[2]);
  }
  if (/\.css$/i.test(relativePath)) {
    for (const match of content.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) references.push(match[2]);
  }
  if (/\.(?:m?js)$/i.test(relativePath)) {
    for (const match of content.matchAll(/(?:\bimport\s*(?:\([^)]*?['"]|[^'"()]*?\bfrom\s*['"])|\bexport\s+[^'"()]*?\bfrom\s*['"])([^'"]+)['"]/g)) references.push(match[1]);
  }
  return references.map(reference => localStaticReference(reference, relativePath)).filter(Boolean);
}

function verifyStaticResourceClosure(packageRoot, files) {
  const available = new Set(files.map(normalizeRelativePath));
  const entrypoints = files.filter(file => /\.html?$/i.test(file)).sort();
  const visited = new Set();
  const pending = entrypoints.slice();
  let referenceCount = 0;
  const missingOptionalCssAssets = [];
  while (pending.length) {
    const relativePath = pending.pop();
    if (visited.has(relativePath)) continue;
    visited.add(relativePath);
    const filePath = path.join(packageRoot, relativePath);
    const content = fs.readFileSync(filePath, 'utf8');
    for (const target of staticReferences(relativePath, content)) {
      referenceCount += 1;
      if (!available.has(target)) {
        // A CSS image/font URL cannot prevent the JavaScript application from
        // starting. Keep it visible as a package finding, while missing HTML
        // entry assets and JavaScript chunks remain hard failures.
        if (/\.css$/i.test(relativePath)) {
          missingOptionalCssAssets.push({ source:relativePath, target });
          continue;
        }
        fail('release_package_static_resource_missing:' + relativePath + '->' + target);
      }
      if (/\.(?:css|m?js|html?)$/i.test(target)) pending.push(target);
    }
  }
  return { entrypoints, checked_files:visited.size, reference_count:referenceCount, missing_optional_css_assets:missingOptionalCssAssets };
}

function exactSortedPaths(values, label) {
  if (!Array.isArray(values)) fail(label + '_missing');
  const normalized = values.map(normalizeRelativePath).sort();
  if (new Set(normalized).size !== normalized.length) fail(label + '_duplicate');
  return normalized;
}

function verifySharedFileBaseline(governance, sourceRoot = root, allowedChanges = []) {
  const baseline = governance.shared_file_handoff_baseline;
  if (!baseline || baseline.schema_version !== 'niannian_shared_file_handoff_baseline_v2') fail('shared_file_baseline_contract_invalid');
  if (!/^release-baseline-[a-z0-9-]+$/.test(String(baseline.review_id || ''))) fail('shared_file_baseline_review_id_invalid');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(String(baseline.captured_at || ''))) fail('shared_file_baseline_captured_at_invalid');

  const expectedPaths = protectedSharedFiles.slice().sort();
  const baselineFiles = baseline.files;
  if (!baselineFiles || typeof baselineFiles !== 'object' || Array.isArray(baselineFiles)) fail('shared_file_baseline_missing');
  const actualPaths = exactSortedPaths(Object.keys(baselineFiles), 'shared_file_baseline_paths');
  if (actualPaths.length !== expectedPaths.length || actualPaths.some((item, index) => item !== expectedPaths[index])) fail('shared_file_baseline_paths_not_exact');

  const allowed = new Set((Array.isArray(allowedChanges) ? allowedChanges : []).map(value => normalizeRelativePath(value)));
  const changedFiles = [];
  for (const relativePath of actualPaths) {
    const expectedHash = String(baselineFiles[relativePath] || '');
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) fail('shared_file_baseline_hash_invalid:' + relativePath);
    const filePath = path.resolve(sourceRoot, relativePath);
    const relativeToRoot = path.relative(sourceRoot, filePath);
    if (!relativeToRoot || relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) fail('shared_file_baseline_path_invalid');
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) fail('shared_file_baseline_missing:' + relativePath);
    if (sha256(filePath) !== expectedHash) {
      if (!allowed.has(relativePath)) fail('shared_file_baseline_mismatch:' + relativePath);
      changedFiles.push(relativePath);
    }
  }

  const attestationPath = path.resolve(sourceRoot, normalizeRelativePath(baseline.attestation?.path));
  const relativeAttestationPath = path.relative(sourceRoot, attestationPath);
  if (!relativeAttestationPath || relativeAttestationPath.startsWith('..') || path.isAbsolute(relativeAttestationPath)) fail('shared_file_attestation_path_invalid');
  const attestationHash = String(baseline.attestation?.sha256 || '');
  if (!/^[a-f0-9]{64}$/.test(attestationHash)) fail('shared_file_attestation_hash_invalid');
  if (!fs.existsSync(attestationPath) || !fs.statSync(attestationPath).isFile()) fail('shared_file_attestation_missing');
  if (sha256(attestationPath) !== attestationHash) fail('shared_file_attestation_hash_mismatch');

  const attestation = readJson(attestationPath, 'shared_file_attestation');
  if (attestation.schema_version !== 'niannian_shared_file_handoff_attestation_v1') fail('shared_file_attestation_contract_invalid');
  if (attestation.review_id !== baseline.review_id || attestation.reviewed_at !== baseline.captured_at) fail('shared_file_attestation_identity_mismatch');
  const attestationSourceMatches = samePath(attestation.authoritative_source_path, sourceRoot)
    || (samePath(sourceRoot, root) && verifiedGitHubCheckout());
  if (!attestationSourceMatches) fail('shared_file_attestation_source_mismatch');
  const attestationPaths = exactSortedPaths(Object.keys(attestation.files || {}), 'shared_file_attestation_paths');
  if (attestationPaths.length !== expectedPaths.length || attestationPaths.some((item, index) => item !== expectedPaths[index])) fail('shared_file_attestation_paths_not_exact');
  if (actualPaths.some(relativePath => attestation.files[relativePath] !== baselineFiles[relativePath])) fail('shared_file_attestation_files_mismatch');
  if (!Array.isArray(attestation.evidence) || attestation.evidence.length < 1) fail('shared_file_attestation_evidence_missing');
  const evidenceCoverage = new Set();
  for (const evidence of attestation.evidence) {
    if (!evidence || typeof evidence !== 'object' || !Array.isArray(evidence.covers) || !evidence.covers.length) fail('shared_file_attestation_evidence_invalid');
    for (const coveredPath of evidence.covers.map(normalizeRelativePath)) {
      if (!expectedPaths.includes(coveredPath)) fail('shared_file_attestation_evidence_scope_invalid:' + coveredPath);
      evidenceCoverage.add(coveredPath);
    }
    const evidencePath = path.resolve(sourceRoot, normalizeRelativePath(evidence.path));
    const relativeEvidencePath = path.relative(sourceRoot, evidencePath);
    if (!relativeEvidencePath || relativeEvidencePath.startsWith('..') || path.isAbsolute(relativeEvidencePath)) fail('shared_file_attestation_evidence_path_invalid');
    if (!fs.existsSync(evidencePath) || !fs.statSync(evidencePath).isFile()) fail('shared_file_attestation_evidence_missing:' + evidence.path);
    if (!/^[a-f0-9]{64}$/.test(String(evidence.sha256 || '')) || sha256(evidencePath) !== evidence.sha256) fail('shared_file_attestation_evidence_hash_mismatch:' + evidence.path);
  }
  if (evidenceCoverage.size !== expectedPaths.length || expectedPaths.some(relativePath => !evidenceCoverage.has(relativePath))) fail('shared_file_attestation_evidence_coverage_incomplete');
  return { review_id:baseline.review_id, attestation:path.relative(sourceRoot, attestationPath).replace(/\\/g, '/'), changed_files:changedFiles };
}

function candidateAllowedFiles(packageManifestPath) {
  if (!packageManifestPath) return [];
  const release = readJson(path.resolve(packageManifestPath), 'release_package_manifest').release;
  if (!release) return [];
  if (!Array.isArray(release.allowed_files) || !release.allowed_files.length) fail('release_candidate_allowed_files_missing');
  return exactSortedPaths(release.allowed_files, 'release_candidate_allowed_files');
}

function verifyPackageManifest(packageManifestPath, governance, target) {
  const packageManifest = readJson(path.resolve(packageManifestPath), 'release_package_manifest');
  if (!samePath(packageManifest.source_root, root)) fail('release_package_source_not_canonical');
  if (packageManifest.target !== target) fail('release_package_target_mismatch');
  if (typeof packageManifest.package_root !== 'string' || !packageManifest.package_root.trim()) fail('release_package_root_missing');
  const packageRoot = path.resolve(packageManifest.package_root);
  if (!fs.existsSync(packageRoot) || !fs.statSync(packageRoot).isDirectory()) fail('release_package_root_missing');
  if (samePath(packageRoot, root)) fail('release_package_root_must_be_isolated');
  if (!Array.isArray(packageManifest.files)) fail('release_package_files_missing');

  const files = packageManifest.files.map(normalizeRelativePath).sort();
  const uniqueFiles = new Set(files);
  if (uniqueFiles.size !== files.length) fail('release_package_files_duplicate');

  const stagedFiles = walkFiles(packageRoot).map(normalizeRelativePath).sort();
  if (stagedFiles.length !== files.length || stagedFiles.some((file, index) => file !== files[index])) fail('release_package_manifest_not_exact');
  if (!packageManifest.file_sha256 || typeof packageManifest.file_sha256 !== 'object') fail('release_package_hashes_missing');
  if (!Number.isSafeInteger(packageManifest.total_bytes) || packageManifest.total_bytes < 0) fail('release_package_total_bytes_invalid');
  const hashKeys = Object.keys(packageManifest.file_sha256).map(normalizeRelativePath).sort();
  if (hashKeys.length !== files.length || hashKeys.some((file, index) => file !== files[index])) fail('release_package_hashes_not_exact');
  let totalBytes = 0;
  for (const relativePath of files) {
    const stagedPath = path.join(packageRoot, relativePath);
    const expectedHash = String(packageManifest.file_sha256[relativePath] || '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expectedHash) || sha256(stagedPath) !== expectedHash) fail('release_package_hash_mismatch:' + relativePath);
    totalBytes += fs.statSync(stagedPath).size;
  }
  if (totalBytes !== packageManifest.total_bytes) fail('release_package_total_bytes_mismatch');

  for (const forbidden of governance.release_package.forbidden_path_prefixes) {
    const prefix = normalizeRelativePath(forbidden);
    if (files.some(file => file === prefix || file.startsWith(prefix + '/'))) fail('release_package_forbidden_path:' + prefix);
  }
  for (const required of governance.release_package.required_files) {
    if (!uniqueFiles.has(normalizeRelativePath(required))) fail('release_package_required_file_missing:' + required);
  }
  return { file_count: files.length, package_root:packageRoot, static_resource_closure:verifyStaticResourceClosure(packageRoot, files) };
}

function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.target) fail('release_gate_target_required');

  const manifest = readJson(manifestPath, 'project_manifest');
  const governance = manifest.release_governance;
  if (!governance || governance.schema_version !== 'niannian_release_governance_v1') fail('release_governance_contract_missing');
  const canonicalLocalRoot = samePath(manifest.source_of_truth?.path, root) && samePath(governance.authoritative_source_path, root);
  if (!canonicalLocalRoot && !verifiedGitHubCheckout()) fail('authoritative_source_not_canonical');
  if (manifest.source_of_truth?.source_mode !== 'canonical_release_source') fail('authoritative_source_mode_invalid');
  if (manifest.source_of_truth?.legacy_base_repo?.deployment_policy !== 'prohibited' || governance.legacy_source_deployment !== 'prohibited') fail('legacy_source_deployment_not_prohibited');
  if (!Array.isArray(governance.target_allowlist) || governance.target_allowlist.length !== 1 || governance.target_allowlist[0] !== options.target) fail('release_target_not_allowlisted');

  const allowedChanges = candidateAllowedFiles(options['package-manifest']);
  const baselineResult = verifySharedFileBaseline(governance, root, allowedChanges);
  const packageResult = options['package-manifest']
    ? verifyPackageManifest(options['package-manifest'], governance, options.target)
    : null;
  const productionParity = governance.current_production_release?.parity_with_current_canonical;
  if (productionParity !== 'diverged_requires_new_staged_release' && productionParity !== 'verified_current_parity') fail('production_parity_status_invalid');

  return {
    ok: true,
    target: options.target,
    authoritative_source: root,
    package_manifest: options['package-manifest'] ? path.resolve(options['package-manifest']) : null,
    package_file_count: packageResult?.file_count || 0,
    static_resource_closure: packageResult?.static_resource_closure || null,
    release_ready: Boolean(packageResult),
    shared_file_baseline: 'verified',
    shared_file_baseline_changed_files: baselineResult.changed_files,
    shared_file_baseline_review_id: baselineResult.review_id,
    shared_file_attestation: baselineResult.attestation,
    legacy_base_repo_deployment: 'prohibited',
    production_parity: productionParity,
    next_gate: !packageResult
      ? 'materialize_an_isolated_staging_directory_and_verify_its_exact_manifest'
      : productionParity === 'diverged_requires_new_staged_release'
      ? 'stage_and_verify_a_new_release_before_deploy'
      : 'remote_release_validation_before_deploy'
  };
}

if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(run()) + '\n');
  } catch (error) {
    process.stderr.write(String(error.message || error) + '\n');
    process.exitCode = 1;
  }
}

module.exports = { run, verifiedGitHubCheckout, verifySharedFileBaseline, protectedSharedFiles, verifyStaticResourceClosure, staticReferences, localStaticReference, candidateAllowedFiles };
