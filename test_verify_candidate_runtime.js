'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { verifyCandidateRuntime, baseStaticFiles, activeBrandAssetFromPackage } = require('./verify_candidate_runtime');

const stageRoot = process.env.NIANNIAN_CANDIDATE_STAGE;
if (!stageRoot) throw new Error('NIANNIAN_CANDIDATE_STAGE_required');

verifyCandidateRuntime(path.resolve(stageRoot), 'http://127.0.0.1:4199')
  .then(result => {
    assert.equal(result.ok, true);
    assert.equal(activeBrandAssetFromPackage(path.join(path.resolve(stageRoot), 'package')), 'assets/brand/niannian-ai-fused-monogram-v6-brand-pink.png');
    assert.equal(result.static_files, baseStaticFiles.length + 1);
    assert(baseStaticFiles.includes('mvp-step02-r13.js'));
    assert(baseStaticFiles.includes('mvp-step03-r1.js'));
    assert(baseStaticFiles.includes('mvp-step01-ledger-r1.js'));
    assert(baseStaticFiles.includes('mvp-step01-story-r1.js'));
    assert(baseStaticFiles.includes('mvp-source-truth-r1.js'));
    process.stdout.write(JSON.stringify({ ok:true, verified:['isolated candidate health', 'raw static SHA parity', 'active brand asset parity', 'bounded runtime requests'] }) + '\n');
  })
  .catch(error => { process.stderr.write(String(error.message || error) + '\n'); process.exitCode = 1; });
