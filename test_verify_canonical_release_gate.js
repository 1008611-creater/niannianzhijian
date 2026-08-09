const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, verifySharedFileBaseline, protectedSharedFiles, verifyStaticResourceClosure } = require('./verify_canonical_release_gate');

const root = __dirname;
const governanceDocument = JSON.parse(fs.readFileSync(path.join(root, 'PROJECT_MANIFEST.json'), 'utf8'));
const requiredFiles = governanceDocument.release_governance.release_package.required_files;
const currentChangedSharedFiles = protectedSharedFiles.filter(relativePath => {
  const expected = governanceDocument.release_governance.shared_file_handoff_baseline.files[relativePath];
  const current = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relativePath))).digest('hex');
  return current !== expected;
});
// A canonical baseline may be fully aligned with the protected source files.
// Keep package fixtures non-empty while allowing mismatch assertions to be
// skipped when there is no real shared-file change to declare.
const fixtureAllowedChanges = currentChangedSharedFiles.length ? currentChangedSharedFiles : ['sw.js'];
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'niannian-release-governance-'));

function writePackageManifest(name, value) {
  const filePath = path.join(temporaryRoot, name + '.json');
  fs.writeFileSync(filePath, JSON.stringify({ release:{ allowed_files:['sw.js'] }, ...value }), 'utf8');
  return filePath;
}

function createStage(name, files) {
  const stageRoot = path.join(temporaryRoot, name);
  for (const relativePath of files) {
    const destination = path.join(stageRoot, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive:true });
    fs.writeFileSync(destination, relativePath, 'utf8');
  }
  return stageRoot;
}

function stageIntegrity(stageRoot, files) {
  const file_sha256 = {};
  let total_bytes = 0;
  for (const relativePath of files) {
    const content = fs.readFileSync(path.join(stageRoot, relativePath));
    file_sha256[relativePath] = crypto.createHash('sha256').update(content).digest('hex');
    total_bytes += content.length;
  }
  return { file_sha256, total_bytes };
}

function expectFailure(args, expectedMessage) {
  assert.throws(() => run(args), new RegExp(expectedMessage));
}

try {
  const closureStage = path.join(temporaryRoot, 'static-resource-closure');
  fs.mkdirSync(path.join(closureStage, 'studio', 'assets'), { recursive:true });
  fs.writeFileSync(path.join(closureStage, 'studio', 'index.html'), '<script type="module" src="./assets/entry.js"></script><link rel="stylesheet" href="./assets/style.css">', 'utf8');
  fs.writeFileSync(path.join(closureStage, 'studio', 'assets', 'entry.js'), "import('./chunk.js');", 'utf8');
  fs.writeFileSync(path.join(closureStage, 'studio', 'assets', 'chunk.js'), 'export const ready = true;', 'utf8');
  fs.writeFileSync(path.join(closureStage, 'studio', 'assets', 'style.css'), "@font-face{src:url('./font.woff2')}", 'utf8');
  fs.writeFileSync(path.join(closureStage, 'studio', 'assets', 'font.woff2'), 'font', 'utf8');
  const closureFiles = walkFilesForTest(closureStage);
  const closure = verifyStaticResourceClosure(closureStage, closureFiles);
  assert.equal(closure.reference_count, 4);
  const incompleteClosureFiles = closureFiles.filter(file => file !== 'studio/assets/chunk.js');
  assert.throws(() => verifyStaticResourceClosure(closureStage, incompleteClosureFiles), /release_package_static_resource_missing:studio\/assets\/entry\.js->studio\/assets\/chunk\.js/);

  const governance = governanceDocument.release_governance;
  const baselineResult = verifySharedFileBaseline(governance, root, currentChangedSharedFiles);
  assert.match(baselineResult.review_id, /^release-baseline-/);
  assert.equal(baselineResult.attestation, governance.shared_file_handoff_baseline.attestation.path);
  assert.deepEqual(baselineResult.changed_files, currentChangedSharedFiles.slice().sort());
  assert.deepEqual(Object.keys(governance.shared_file_handoff_baseline.files).sort(), protectedSharedFiles.slice().sort());
  const missingProtectedPath = structuredClone(governance);
  delete missingProtectedPath.shared_file_handoff_baseline.files['server.js'];
  assert.throws(() => verifySharedFileBaseline(missingProtectedPath, root, ['sw.js']), /shared_file_baseline_paths_not_exact/);
  const malformedHash = structuredClone(governance);
  malformedHash.shared_file_handoff_baseline.files['server.js'] = '0'.repeat(63);
  assert.throws(() => verifySharedFileBaseline(malformedHash, root, currentChangedSharedFiles), /shared_file_baseline_hash_invalid:server.js/);
  const attestationTamper = structuredClone(governance);
  attestationTamper.shared_file_handoff_baseline.attestation.sha256 = '0'.repeat(64);
  assert.throws(() => verifySharedFileBaseline(attestationTamper, root, currentChangedSharedFiles), /shared_file_attestation_hash_mismatch/);

  const approvedFiles = requiredFiles.concat(['bridge/niannian_low_risk_policy.js']);
  const approvedStage = createStage('approved-stage', approvedFiles);
  const approvedIntegrity = stageIntegrity(approvedStage, approvedFiles);
  const approved = writePackageManifest('approved', {
    release:{ allowed_files:fixtureAllowedChanges },
    source_root: root,
    target: 'https://ai.cauai.fun',
    package_root: approvedStage,
    files: approvedFiles,
    ...approvedIntegrity
  });
  const result = run(['--target', 'https://ai.cauai.fun', '--package-manifest', approved]);
  assert.equal(result.ok, true);
  assert.equal(result.authoritative_source, path.resolve(root));
  assert.equal(result.legacy_base_repo_deployment, 'prohibited');
  assert(
    ['diverged_requires_new_staged_release', 'verified_current_parity']
      .includes(result.production_parity)
  );
  assert.equal(
    result.next_gate,
    result.production_parity === 'diverged_requires_new_staged_release'
      ? 'stage_and_verify_a_new_release_before_deploy'
      : 'remote_release_validation_before_deploy'
  );
  assert.equal(result.release_ready, true);

  const undeclaredSharedChange = writePackageManifest('undeclared-shared-change', {
    release:{ allowed_files:fixtureAllowedChanges.filter(file => file !== 'sw.js') },
    source_root:root,
    target:'https://ai.cauai.fun',
    package_root:approvedStage,
    files:approvedFiles,
    ...approvedIntegrity
  });
  if (currentChangedSharedFiles.includes('sw.js')) {
    expectFailure(['--target', 'https://ai.cauai.fun', '--package-manifest', undeclaredSharedChange], 'shared_file_baseline_mismatch:sw.js');
  }

  if (currentChangedSharedFiles.length) {
    expectFailure(['--target', 'https://ai.cauai.fun'], 'shared_file_baseline_mismatch:' + currentChangedSharedFiles.slice().sort()[0]);
  } else {
    const aligned = run(['--target', 'https://ai.cauai.fun']);
    assert.equal(aligned.release_ready, false);
    assert.deepEqual(aligned.shared_file_baseline_changed_files, []);
  }

  const dataLeakFiles = requiredFiles.concat(['data-local/projects.json']);
  const dataLeakStage = createStage('data-local-leak-stage', dataLeakFiles);
  const localDataLeak = writePackageManifest('data-local-leak', {
    release:{ allowed_files:fixtureAllowedChanges },
    source_root: root,
    target: 'https://ai.cauai.fun',
    package_root: dataLeakStage,
    files: dataLeakFiles,
    ...stageIntegrity(dataLeakStage, dataLeakFiles)
  });
  expectFailure(['--target', 'https://ai.cauai.fun', '--package-manifest', localDataLeak], 'release_package_forbidden_path:data-local');

  const nodeModulesLeakFiles = requiredFiles.concat(['node_modules/mammoth/index.js']);
  const nodeModulesLeakStage = createStage('node-modules-leak-stage', nodeModulesLeakFiles);
  const nodeModulesLeak = writePackageManifest('node-modules-leak', {
    release:{ allowed_files:fixtureAllowedChanges },
    source_root: root,
    target: 'https://ai.cauai.fun',
    package_root: nodeModulesLeakStage,
    files: nodeModulesLeakFiles,
    ...stageIntegrity(nodeModulesLeakStage, nodeModulesLeakFiles)
  });
  expectFailure(['--target', 'https://ai.cauai.fun', '--package-manifest', nodeModulesLeak], 'release_package_forbidden_path:node_modules');

  const legacySource = writePackageManifest('legacy-source', {
    release:{ allowed_files:fixtureAllowedChanges },
    source_root: 'D:\\codex-work\\zhuanhui\\outputs\\niannian-ai-web',
    target: 'https://ai.cauai.fun',
    package_root: approvedStage,
    files: requiredFiles,
    ...stageIntegrity(approvedStage, requiredFiles)
  });
  expectFailure(['--target', 'https://ai.cauai.fun', '--package-manifest', legacySource], 'release_package_source_not_canonical');

  expectFailure(['--target', 'https://sd2.cauai.fun', '--package-manifest', approved], 'release_target_not_allowlisted');

  const staleManifest = writePackageManifest('stale-manifest', {
    release:{ allowed_files:fixtureAllowedChanges },
    source_root: root,
    target: 'https://ai.cauai.fun',
    package_root: approvedStage,
    files: requiredFiles,
    ...stageIntegrity(approvedStage, requiredFiles)
  });
  expectFailure(['--target', 'https://ai.cauai.fun', '--package-manifest', staleManifest], 'release_package_manifest_not_exact');

  process.stdout.write(JSON.stringify({ ok:true, verified:['canonical E source required', 'legacy D source rejected', 'data-local package path rejected', 'ai.cauai.fun only target', 'fixed ten-file shared baseline checked', 'hash-bound review attestation checked', 'missing protected path and malformed hash rejected', 'isolated staging inventory must exactly match manifest'] }) + '\n');
} finally {
  fs.rmSync(temporaryRoot, { recursive:true, force:true });
}

function walkFilesForTest(directory, relative = '') {
  return fs.readdirSync(directory, { withFileTypes:true }).flatMap(entry => {
    const relativePath = relative ? relative + '/' + entry.name : entry.name;
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFilesForTest(absolutePath, relativePath) : [relativePath];
  });
}
