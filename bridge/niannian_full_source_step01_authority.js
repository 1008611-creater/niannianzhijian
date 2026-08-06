'use strict';

// Full-source authority gate for the corrected 151.975s source.  This module
// intentionally stays independent from the legacy 254/37/111 pilot authority:
// a new source is blocked until every Haika Step01 capability is accepted.

const SOURCE_SHA256 = 'd7713a2f0a09be3fc1d9ab1257805585d181bc23732f058a903e3443311f16bd';
const SOURCE_BYTES = 14955804;
const SOURCE_DURATION_SECONDS = 151.975011;
const SOURCE_FRAME_COUNT = 4559;
const SHOT_COUNT = 61;

const HAIKA_ARTIFACTS = Object.freeze({
  manifest: Object.freeze({
    path: '/srv/niannian-data/artifacts/NN-20260727052447-62C34D/step01-transnet-training-v2/artifact_manifest.json',
    readback_status: 'pending_exact_readback'
  }),
  runtime_receipt: Object.freeze({
    path: '/srv/niannian-data/artifacts/NN-20260727052447-62C34D/step01-transnet-training-v2/runtime_receipt.json',
    readback_status: 'pending_exact_readback'
  }),
  shot_boundaries: Object.freeze({
    path: '/srv/niannian-data/artifacts/NN-20260727052447-62C34D/step01-transnet-training-v2/shot_boundaries.json',
    readback_status: 'pending_exact_readback'
  })
});

const REQUIRED_GATES = Object.freeze([
  'transnet',
  'full_frame_evidence',
  'asr',
  'forced_aligner',
  'ocr',
  'visual_facts',
  'authority_promotion'
]);

const GATE_BLOCKERS = Object.freeze({
  full_frame_evidence: 'STEP01_SERVER_BUNDLE_NOT_VERIFIED',
  asr: 'MIMO_ASR_CREDENTIAL_REQUIRED',
  forced_aligner: 'ASR_READBACK_REQUIRED',
  ocr: 'PADDLE_OCR_READBACK_REQUIRED',
  visual_facts: 'GEMINI_VISUAL_FACTS_READBACK_REQUIRED',
  authority_promotion: 'STEP01_ACCEPTANCE_GATES_INCOMPLETE'
});

function sequenceShotIds(ids) {
  return Array.isArray(ids)
    && ids.length === SHOT_COUNT
    && ids.every((id, index) => id === `S${String(index + 1).padStart(3, '0')}`);
}

function exactHaikaArtifact(value, key) {
  const expected = HAIKA_ARTIFACTS[key];
  return Boolean(value && value.path === expected.path
    && value.execution_surface === 'haika'
    && value.readback_status === 'verified_exact'
    && /^[a-f0-9]{64}$/.test(String(value.sha256 || ''))
    && Number.isSafeInteger(value.bytes) && value.bytes > 0);
}

function normalizeGate(value) {
  if (value === true || value === 'PASS' || value === 'accepted') return 'PASS';
  if (value === 'RUNNING' || value === 'running') return 'RUNNING';
  return 'BLOCKED';
}

function sourceMatches(projectOrSource) {
  const source = projectOrSource?.source || projectOrSource || {};
  return String(source.sha256 || '').toLowerCase() === SOURCE_SHA256;
}

function buildBinding(overrides = {}) {
  const artifacts = {};
  for (const key of Object.keys(HAIKA_ARTIFACTS)) artifacts[key] = {
    ...HAIKA_ARTIFACTS[key],
    execution_surface: 'haika',
    ...(overrides[key] || {})
  };
  return {
    schema_version: 'niannian_step01_haika_transnet_binding_v1',
    execution_surface: 'haika',
    host_alias: 'haika-niannian',
    source_sha256: SOURCE_SHA256,
    source_bytes: SOURCE_BYTES,
    source_frame_count: SOURCE_FRAME_COUNT,
    detector: 'transnetv2-pytorch@1.0.5',
    threshold: 0.5,
    shot_count: SHOT_COUNT,
    frame_coverage: {observed: SOURCE_FRAME_COUNT, expected: SOURCE_FRAME_COUNT, pass: true},
    idempotency: {second_call: 'reused_verified', pass: true},
    artifacts
  };
}

function validateCandidate(candidate) {
  const errors = [];
  const source = candidate?.source_binding || {};
  if (candidate?.schema_version !== 'shared_production_authority_candidate_v1') errors.push('candidate.schema_version');
  if (String(source.sha256 || '').toLowerCase() !== SOURCE_SHA256) errors.push('source_binding.sha256');
  if (Number(source.bytes) !== SOURCE_BYTES) errors.push('source_binding.bytes');
  if (Number(source.frame_count) !== SOURCE_FRAME_COUNT) errors.push('source_binding.frame_count');
  if (source.execution_surface !== 'haika') errors.push('source_binding.execution_surface: haika required');
  const inventory = candidate?.shot_inventory || {};
  if (Number(inventory.shot_count) !== SHOT_COUNT || !sequenceShotIds(inventory.shot_ids)) errors.push('shot_inventory: exact S001-S061 required');
  const haika = candidate?.haika_transnet_binding;
  if (!haika || haika.execution_surface !== 'haika') errors.push('haika_transnet_binding: required');
  for (const key of Object.keys(HAIKA_ARTIFACTS)) if (!exactHaikaArtifact(haika?.artifacts?.[key], key)) errors.push(`haika_transnet_binding.artifacts.${key}: exact readback required`);
  if (haika?.frame_coverage?.pass !== true || haika?.frame_coverage?.observed !== SOURCE_FRAME_COUNT) errors.push('haika_transnet_binding.frame_coverage');
  if (haika?.idempotency?.pass !== true || haika?.idempotency?.second_call !== 'reused_verified') errors.push('haika_transnet_binding.idempotency');
  return {valid: errors.length === 0, errors};
}

function gateState(project, accepted = null) {
  const explicit = accepted || project?.full_source_step01_authority || project?.analysis?.fullSourceStep01Authority || {};
  const raw = explicit.gates || {};
  const gates = Object.fromEntries(REQUIRED_GATES.map(key => [key, normalizeGate(raw[key]) ]));
  const acceptedAuthority = explicit.status === 'accepted' && REQUIRED_GATES.every(key => gates[key] === 'PASS')
    && explicit.source_sha256 === SOURCE_SHA256
    && explicit.execution_surface === 'haika';
  if (!acceptedAuthority) {
    gates.transnet = normalizeGate(explicit.transnet_status || raw.transnet || 'PASS');
    if (gates.transnet !== 'PASS') gates.transnet = 'BLOCKED';
  }
  return {accepted: acceptedAuthority, gates};
}

function publicProjection(project, accepted = null) {
  const state = gateState(project, accepted);
  if (!sourceMatches(project)) return null;
  const blocker = state.accepted ? null : {
    code: 'STEP01_FULL_SOURCE_AUTHORITY_PENDING',
    message: '新源片的 Haika Step01 权威链尚未完成；旧 9 镜头证据不会被读取。',
    source_sha256: SOURCE_SHA256,
    resume_after: REQUIRED_GATES.filter(key => state.gates[key] !== 'PASS')[0] || 'authority_promotion'
  };
  return {
    schema_version: 'niannian_step01_full_source_projection_v1',
    source_sha256: SOURCE_SHA256,
    source_bytes: SOURCE_BYTES,
    duration_seconds: SOURCE_DURATION_SECONDS,
    shot_count: SHOT_COUNT,
    shot_ids: Array.from({length: SHOT_COUNT}, (_, index) => `S${String(index + 1).padStart(3, '0')}`),
    execution_surface: 'haika',
    status: state.accepted ? 'accepted' : 'blocked',
    downstream_consumable: state.accepted,
    gates: state.gates,
    gate_details: Object.fromEntries(REQUIRED_GATES.map(key => [key, {
      status: state.gates[key],
      blocker: state.gates[key] === 'PASS' ? null : (GATE_BLOCKERS[key] || 'UPSTREAM_GATE_REQUIRED')
    }])),
    blocker,
    old_authority_hidden: true,
    provider_submit_allowed: false,
    haika_transnet: buildBinding()
  };
}

function guard(project, accepted = null) {
  const projection = publicProjection(project, accepted);
  return projection && projection.status !== 'accepted' ? projection : null;
}

module.exports = {
  SOURCE_SHA256,
  SOURCE_BYTES,
  SOURCE_DURATION_SECONDS,
  SOURCE_FRAME_COUNT,
  SHOT_COUNT,
  HAIKA_ARTIFACTS,
  REQUIRED_GATES,
  GATE_BLOCKERS,
  buildBinding,
  sourceMatches,
  validateCandidate,
  gateState,
  publicProjection,
  guard
};
