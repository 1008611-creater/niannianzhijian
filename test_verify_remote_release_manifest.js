'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildStage } = require('./build_canonical_release_stage');
const { verifyStage, requiredStaticFiles } = require('./verify_remote_release_manifest');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'niannian-remote-manifest-'));
const candidateRoot = path.join(temporaryRoot, 'candidate');

try {
  const candidate = buildStage(candidateRoot);
  const verified = verifyStage(candidateRoot);
  assert.equal(verified.ok, true);
  assert.equal(verified.file_count, candidate.file_count);
  assert.equal(verified.total_bytes, candidate.total_bytes);
  for (const file of requiredStaticFiles) assert(fs.existsSync(path.join(candidate.stage_root, file)));
  assert(fs.existsSync(path.join(candidate.stage_root, 'assets/home/niannian-hero-oil-paint-quiet-v1.png')));
  assert(fs.existsSync(path.join(candidate.stage_root, 'assets/brand/niannian-ai-fused-monogram-v6-brand-pink.png')));
  fs.appendFileSync(path.join(candidate.stage_root, 'product-system.css'), '\n/* tampered */\n');
  assert.throws(() => verifyStage(candidateRoot), /remote_release_manifest_hash_mismatch:product-system\.css/);
  process.stdout.write(JSON.stringify({ ok:true, verified:['remote manifest inventory', 'all SHA-256 values', 'static dependency completeness', 'tamper rejection'] }) + '\n');
} finally {
  fs.rmSync(temporaryRoot, { recursive:true, force:true });
}
