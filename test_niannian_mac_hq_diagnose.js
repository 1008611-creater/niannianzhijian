'use strict';

const assert = require('assert');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const diagnose = require('./bridge/niannian_mac_hq_diagnose');

(async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'hq-diagnose-'));
  try {
    await fsp.writeFile(path.join(root, 'step01-hq-composite-probe-exit.json'), JSON.stringify({ exit_code: 1 }));
    await fsp.writeFile(path.join(root, 'analysis-service-cost-authority-NN-20260715083045-8120F5.json'), JSON.stringify({
      schema_version: 'authority', status: 'authorized', event_id: 'event', project_id: 'NN-20260715083045-8120F5',
      source_sha256: 'a'.repeat(64), settings_version: 2, expires_at: '2026-07-18T06:00:00Z',
      allowed_services: ['paddle_ocr', 'mimo_asr'], allowed_purposes: ['synthetic_capability_validation'],
      media_generation_provider_authority_granted: false, video_generation_authority_granted: false,
      image_generation_authority_granted: false, dubbing_authority_granted: false,
      delivery_authority_granted: false, policy_evidence: { sha256: 'b'.repeat(64) },
    }));
    await fsp.writeFile(path.join(root, 'step01-hq-composite-probe-run.log'), 'Traceback: analysis_cost_authority_scope_invalid\nsecret=should-not-escape');
    const result = await diagnose.diagnose({ outputRoot: root });
    assert.equal(result.typed_error, 'analysis_cost_authority_scope_invalid');
    assert.equal(result.authority.event_id, 'event');
    assert.equal(result.authority.scope_false, true);
    assert.equal(result.logs.length, 1);
    assert.equal(result.logs[0].name, 'step01-hq-composite-probe-run.log');
    assert.equal(result.exit_receipt.exit_code, 1);
    assert.equal(JSON.stringify(result).includes('should-not-escape'), false);
    assert.equal(result.provider_network_requested, false);
    assert.equal(result.schema_version, 'niannian_mac_hq_diagnose_v4');
    assert.equal(result.diagnostic_fingerprint.raw_text_returned, false);
    assert.equal(result.diagnostic_fingerprint.terminal_line_bytes > 0, true);
    const fingerprint = diagnose.diagnosticFingerprint('Traceback\n  File "probe.py", line 1, in run_paddle\nrequests.exceptions.ReadTimeout: HTTPSConnectionPool secret-value timed out');
    assert.deepEqual(fingerprint.stages, ['run_paddle']);
    assert.deepEqual(fingerprint.exception_types, ['ReadTimeout']);
    assert.equal(JSON.stringify(fingerprint).includes('secret-value'), false);
    const lines = diagnose.lineFingerprints('first secret line\nsecond secret line');
    assert.equal(lines.length, 2);
    assert.equal(JSON.stringify(lines).includes('secret'), false);
    assert.equal(lines[0].sha256.length, 64);
    assert.equal(lines[0].token_fingerprints.length > 0, true);
    assert.equal(JSON.stringify(lines[0].token_fingerprints).includes('secret'), false);
    const httpFingerprint = diagnose.diagnosticFingerprint('in run_mimo HTTPError: 503 Server Error for url: hidden');
    assert.deepEqual(httpFingerprint.http_statuses, [503]);
    assert.equal(diagnose.typedError('unknown traceback'), 'hq_composite_opaque_failure');
    assert.equal(diagnose.typedError('in run_mimo response.raise_for_status() HTTPError: 401 Client Error'), 'hq_composite_mimo_auth_rejected');
    assert.equal(diagnose.typedError('in run_paddle requests.exceptions.ReadTimeout: timed out'), 'hq_composite_paddle_network_failed');
    assert.equal(diagnose.typedError('in run_mimo response.raise_for_status() HTTPError: 503'), 'hq_composite_mimo_upstream_failed');
    assert.equal(diagnose.typedError('Error: step01_hq_promotion_candidate_invalid'), 'step01_hq_promotion_candidate_invalid');
    assert.equal(diagnose.typedError('Error: step01_hq_capability_sync_gate_not_ready'), 'step01_hq_capability_sync_gate_not_ready');
    assert.equal(diagnose.typedError('Error: step01_hq_gate_v2_failed'), 'step01_hq_gate_v2_failed');
    assert.equal(diagnose.typedError('Error: v2_adoption_candidate_binding_invalid'), 'v2_adoption_candidate_binding_invalid');
    console.log(JSON.stringify({ ok: true, verified: ['fixed HQ log paths', 'allowlisted authority only', 'provider auth/rate/network/upstream classification', 'no log text output', 'fixed side-effect false'] }));
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
