'use strict';

const assert = require('assert');
const {main, projectDiagnosis} = require('./tools/diagnose_step01_readiness');
const authority = require('./bridge/niannian_full_source_step01_authority');

const blocked = projectDiagnosis({source:{sha256:authority.SOURCE_SHA256}});
assert.equal(blocked.status, 'blocked');
assert.equal(blocked.earliest_blocker, 'full_frame_evidence');
assert.deepEqual(blocked.authority.gates, {
  transnet: 'PASS',
  full_frame_evidence: 'BLOCKED',
  asr: 'BLOCKED',
  forced_aligner: 'BLOCKED',
  ocr: 'BLOCKED',
  visual_facts: 'BLOCKED',
  authority_promotion: 'BLOCKED'
});

const unmatched = projectDiagnosis({source:{sha256:'0'.repeat(64)}});
assert.equal(unmatched.earliest_blocker, 'SOURCE_NOT_BOUND_TO_FULL_AUTHORITY');

const originalWrite = process.stdout.write;
let output = '';
process.stdout.write = chunk => { output += String(chunk); return true; };
try {
  const result = main([], {});
  assert.equal(result.read_only, true);
  assert.equal(result.provider_requested, false);
  assert.equal(result.spend_requested, false);
  assert.equal(result.credentials_exposed, false);
  assert.equal(result.artifact_broker.ready, false);
  assert.equal(result.artifact_broker.code, 'ARTIFACT_BROKER_NOT_CONFIGURED');
} finally {
  process.stdout.write = originalWrite;
}
assert.match(output, /PROJECT_JSON_REQUIRED/);
process.stdout.write(JSON.stringify({ok:true,verified:['earliest full-source gate','unmatched source binding','read-only broker diagnosis','no provider or credential exposure']}) + '\n');
