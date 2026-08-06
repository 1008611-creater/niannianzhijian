'use strict';

const assert = require('assert');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const {evaluateHqFull, inspectContract} = require('./bridge/niannian_step01_hq_full_gate');

function readyCredential(now) {
  return {
    status:'ready',
    checked_at:new Date(now - 1000).toISOString(),
    expires_at:new Date(now + 3600000).toISOString(),
    evidence:{method:'authorized_provider_health_probe',summary:'Redacted provider credential health passed.'}
  };
}

function readyRuntime(now, method) {
  return {
    status:'ready',
    checked_at:new Date(now - 1000).toISOString(),
    evidence:{method,summary:'Local model-level self-test passed.'}
  };
}

async function makeSkills(root) {
  const mimoPath = path.join(root, 'mx-shortdrama-01-frame-extract', 'scripts', 'build_audio_evidence.py');
  const paddlePath = path.join(root, 'mx-shortdrama-02-source-timeline', 'scripts', 'smart_selective_ocr.py');
  await fsp.mkdir(path.dirname(mimoPath), {recursive:true});
  await fsp.mkdir(path.dirname(paddlePath), {recursive:true});
  await fsp.writeFile(mimoPath, [
    'DEFAULT_MIMO_MODEL = "mimo-v2.5-asr"',
    'MIMO_OFFICIAL_API_BASE = "https://api.xiaomimimo.com/v1"',
    'MIMO_TOKEN_PLAN_CN_API_BASE = "https://token-plan-cn.xiaomimimo.com/v1"',
    'if args.quality_profile == "hq_full": pass',
    'path = api_base + "/chat/completions"'
  ].join('\n'));
  await fsp.writeFile(paddlePath, [
    'PADDLE_JOB_URL = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs"',
    'models = ["PP-OCRv6", "PaddleOCR-VL-1.6"]',
    'headers = {"Authorization": f"bearer {token}"}'
  ].join('\n'));
}

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-hq-full-gate-'));
  const skillRoot = path.join(root, 'skills');
  const statusPath = path.join(root, 'status.json');
  const receiptPath = path.join(root, 'receipt.json');
  const evidencePath = path.join(root, 'composite.json');
  const now = Date.parse('2026-07-15T01:00:00Z');
  try {
    await makeSkills(skillRoot);
    const contract = await inspectContract(skillRoot);
    assert.equal(contract.ok, true);
    await fsp.writeFile(statusPath, JSON.stringify({schema_version:'niannian_runtime_capability_status_v1',capabilities:{
      'credential:mimo_asr':{status:'configured_unverified',checked_at:new Date(now).toISOString(),evidence:{method:'mac_keychain_presence_only',summary:'Keychain item exists.'}},
      'credential:paddle_ocr':{status:'configured_unverified',checked_at:new Date(now).toISOString(),evidence:{method:'mac_keychain_presence_only',summary:'Keychain item exists.'}},
      'runtime:transnetv2':readyRuntime(now, 'mac_local_runtime_model_self_test'),
      'runtime:forced_aligner':readyRuntime(now, 'mac_local_qwen3_forced_aligner_synthetic_audio_self_test')
    }}));
    const blocked = await evaluateHqFull({statusPath,receiptPath,skillRoot,nowMs:now});
    assert.equal(blocked.ready, false);
    assert.equal(blocked.composite.reason, 'hq_full_composite_evidence_missing_or_invalid');
    let status = JSON.parse(await fsp.readFile(statusPath, 'utf8'));
    assert.equal(status.capabilities['runtime:hq'].status, 'missing');

    status.capabilities['credential:mimo_asr'] = readyCredential(now);
    status.capabilities['credential:paddle_ocr'] = readyCredential(now);
    await fsp.writeFile(statusPath, JSON.stringify(status));
    await fsp.writeFile(evidencePath, JSON.stringify({
      schema_version:'niannian_hq_full_composite_evidence_v1',
      status:'passed',
      contract_sha256:{mimo_asr:contract.files.mimo_asr.sha256,paddle_ocr:contract.files.paddle_ocr.sha256},
      test_media_kind:'synthetic_non_project_media',
      real_project_media_processed:false,
      provider_submit_requested:false,
      provider_upload_requested:false,
      spend_requested:false
    }));
    const passed = await evaluateHqFull({statusPath,receiptPath,skillRoot,compositeEvidencePath:evidencePath,nowMs:now});
    assert.equal(passed.ready, true);
    assert.equal(passed.contract.ok, true);
    assert.equal(passed.provider_network_requested, false);
    assert.equal(passed.real_project_media_processed, false);
    status = JSON.parse(await fsp.readFile(statusPath, 'utf8'));
    assert.equal(status.capabilities['runtime:hq'].status, 'ready');
    process.stdout.write(JSON.stringify({ok:true,verified:[
      'Mimo and Paddle Skill entrypoint contracts are hash-bound',
      'configured_unverified credentials cannot unlock hq_full',
      'all prerequisite capabilities must be fresh and ready',
      'synthetic composite evidence must bind both script SHAs',
      'gate runner performs no provider request or project-media processing'
    ]}) + '\n');
  } finally {
    await fsp.rm(root, {recursive:true,force:true});
  }
}

main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
