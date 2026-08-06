'use strict';

const fs = require('fs');
const path = require('path');
const { baseStaticFiles, activeBrandAssetFromPackage } = require('./verify_candidate_runtime');
const { verifyStaticSha256, verifyPublicHtmlSha256 } = require('./release_static_sha_gate');
const { run: verifyReleaseGate } = require('./verify_canonical_release_gate');

const DEFAULT_OPTIONS = Object.freeze({
  connectTimeoutMs: 3000,
  requestTimeoutMs: 5000,
  maxBytes: 16 * 1024 * 1024
});

function sha256File(filePath) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error('public_candidate_static_argument_invalid');
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!key || !value || value.startsWith('--')) throw new Error('public_candidate_static_argument_value_missing');
    options[key] = value;
    index += 1;
  }
  return options;
}

function checkedStaticFiles(packageRoot) {
  const files = [...baseStaticFiles, activeBrandAssetFromPackage(packageRoot)];
  return [...new Set(files)];
}

async function verifyPublicCandidateStatic(packageRoot, target, options = {}) {
  const resolvedPackageRoot = path.resolve(packageRoot);
  const origin = new URL(target).origin;
  const requestOptions = { ...DEFAULT_OPTIONS, ...options };
  const checks = [];

  for (const relativePath of checkedStaticFiles(resolvedPackageRoot)) {
    const expectedSha256 = sha256File(path.join(resolvedPackageRoot, relativePath));
    const url = new URL('/' + relativePath, origin).toString();
    const result = relativePath === 'index.html'
      ? await verifyPublicHtmlSha256(url, expectedSha256, requestOptions)
      : await verifyStaticSha256(url, expectedSha256, requestOptions);
    checks.push({
      file: relativePath,
      ok: result.ok,
      statusCode: result.statusCode,
      bytes: result.bytes,
      expectedSha256,
      actualSha256: result.sha256,
      normalization: result.normalization || null,
      error: result.error || null
    });
  }

  const mismatches = checks.filter(check => !check.ok);
  return {
    ok: mismatches.length === 0,
    target: origin,
    checked: checks.length,
    mismatches,
    checks
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.stage) throw new Error('public_candidate_static_stage_required');
  const stageRoot = path.resolve(options.stage);
  const manifestPath = path.join(stageRoot, 'release-package-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const target = String(options.target || manifest.target || '');
  if (target !== 'https://ai.cauai.fun') throw new Error('public_candidate_static_target_not_allowlisted');

  verifyReleaseGate(['--target', target, '--package-manifest', manifestPath]);
  const result = await verifyPublicCandidateStatic(path.join(stageRoot, 'package'), target);
  process.stdout.write(JSON.stringify(result) + '\n');
  if (!result.ok) process.exitCode = 1;
  return result;
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(String(error.message || error) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { checkedStaticFiles, verifyPublicCandidateStatic };
