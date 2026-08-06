'use strict';

const assert = require('node:assert/strict');
const gate = require('./bridge/niannian_full_source_step01_authority');

const source = {
  sha256: gate.SOURCE_SHA256,
  bytes: gate.SOURCE_BYTES,
  frame_count: gate.SOURCE_FRAME_COUNT,
  execution_surface: 'haika'
};

function candidate(overrides = {}) {
  const overridesByKey = {};
  for (const key of Object.keys(gate.HAIKA_ARTIFACTS)) {
    overridesByKey[key] = {
      sha256: key === 'manifest' ? 'a'.repeat(64) : key === 'runtime_receipt' ? 'b'.repeat(64) : 'c'.repeat(64),
      bytes: key === 'manifest' ? 1200 : 900,
      readback_status: 'verified_exact'
    };
  }
  const binding = gate.buildBinding(overridesByKey);
  return {
    schema_version: 'shared_production_authority_candidate_v1',
    source_binding: source,
    shot_inventory: {shot_count: gate.SHOT_COUNT, shot_ids: Array.from({length: gate.SHOT_COUNT}, (_, index) => `S${String(index + 1).padStart(3, '0')}`)},
    haika_transnet_binding: binding,
    ...overrides
  };
}

const valid = gate.validateCandidate(candidate());
assert.equal(valid.valid, true, valid.errors.join('; '));

const wrongSurface = gate.validateCandidate(candidate({source_binding: {...source, execution_surface: 'local_isolated_extractor'}}));
assert.equal(wrongSurface.valid, false);
assert.match(wrongSurface.errors.join('\n'), /execution_surface/);

const wrongInventory = gate.validateCandidate(candidate({shot_inventory: {shot_count: 9, shot_ids: ['S001', 'S002', 'S003', 'S004', 'S005', 'S006', 'S007', 'S008', 'S009']}}));
assert.equal(wrongInventory.valid, false);
assert.match(wrongInventory.errors.join('\n'), /S001-S061/);

const blocked = gate.publicProjection({source});
assert.equal(blocked.status, 'blocked');
assert.equal(blocked.downstream_consumable, false);
assert.equal(blocked.shot_count, 61);
assert.equal(blocked.old_authority_hidden, true);
assert.equal(blocked.gates.transnet, 'PASS');
assert.equal(blocked.gates.asr, 'BLOCKED');
assert.equal(blocked.gate_details.asr.blocker, 'MIMO_ASR_CREDENTIAL_REQUIRED');
assert.equal(blocked.gate_details.full_frame_evidence.blocker, 'STEP01_SERVER_BUNDLE_NOT_VERIFIED');
assert.equal(blocked.provider_submit_allowed, false);

const accepted = gate.publicProjection({source}, {
  status: 'accepted',
  source_sha256: gate.SOURCE_SHA256,
  execution_surface: 'haika',
  gates: Object.fromEntries(gate.REQUIRED_GATES.map(key => [key, 'PASS']))
});
assert.equal(accepted.status, 'accepted');
assert.equal(accepted.downstream_consumable, true);
assert.equal(accepted.blocker, null);

console.log(JSON.stringify({ok: true, checks: [
  'Haika binding requires exact readback artifacts and full frame coverage',
  'local extractor and 9-shot inventory are rejected',
  'new source projection blocks old authority leakage until all Step01 gates pass',
  'accepted projection requires explicit Haika authority and all downstream gates'
]}));
