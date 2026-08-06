'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {atomicWrite} = require('./niannian_step01_keychain_credentials');
const {inspectCapability} = require('./niannian_runtime_capability_status');

const REQUIRED_CAPABILITIES = Object.freeze([
  'credential:mimo_asr',
  'credential:paddle_ocr',
  'runtime:transnetv2',
  'runtime:forced_aligner'
]);

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function inspectContract(skillRoot) {
  const mimoPath = path.join(skillRoot, 'mx-shortdrama-01-frame-extract', 'scripts', 'build_audio_evidence.py');
  const paddlePath = path.join(skillRoot, 'mx-shortdrama-02-source-timeline', 'scripts', 'smart_selective_ocr.py');
  const [mimoBuffer, paddleBuffer] = await Promise.all([fsp.readFile(mimoPath), fsp.readFile(paddlePath)]);
  const mimo = mimoBuffer.toString('utf8');
  const paddle = paddleBuffer.toString('utf8');
  const checks = {
    hq_full_profile:/quality_profile\s*==\s*["']hq_full["']/.test(mimo),
    mimo_model:/DEFAULT_MIMO_MODEL\s*=\s*["']mimo-v2\.5-asr["']/.test(mimo),
    mimo_official_endpoint:mimo.includes('https://api.xiaomimimo.com/v1'),
    mimo_token_plan_endpoint:mimo.includes('https://token-plan-cn.xiaomimimo.com/v1'),
    mimo_chat_completions:mimo.includes('/chat/completions'),
    paddle_job_endpoint:paddle.includes('https://paddleocr.aistudio-app.com/api/v2/ocr/jobs'),
    paddle_pp_ocr_v6:paddle.includes('PP-OCRv6'),
    paddle_vl_1_6:paddle.includes('PaddleOCR-VL-1.6'),
    paddle_bearer_header:/Authorization[^\n]+bearer/.test(paddle)
  };
  return {
    ok:Object.values(checks).every(Boolean),
    checks,
    files:{
      mimo_asr:{path:mimoPath, sha256:sha256(mimoBuffer)},
      paddle_ocr:{path:paddlePath, sha256:sha256(paddleBuffer)}
    }
  };
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
}

function validateCompositeEvidence(evidence, contract, capabilityAudits) {
  if (!evidence || evidence.schema_version !== 'niannian_hq_full_composite_evidence_v1' || evidence.status !== 'passed') {
    return {ok:false, reason:'hq_full_composite_evidence_missing_or_invalid'};
  }
  if (evidence.provider_submit_requested !== false || evidence.provider_upload_requested !== false || evidence.spend_requested !== false) {
    return {ok:false, reason:'hq_full_composite_side_effect_contract_invalid'};
  }
  if (!evidence.contract_sha256 || evidence.contract_sha256.mimo_asr !== contract.files.mimo_asr.sha256 || evidence.contract_sha256.paddle_ocr !== contract.files.paddle_ocr.sha256) {
    return {ok:false, reason:'hq_full_composite_contract_sha_mismatch'};
  }
  if (!REQUIRED_CAPABILITIES.every(capability => capabilityAudits[capability] && capabilityAudits[capability].ready)) {
    return {ok:false, reason:'hq_full_capability_not_ready'};
  }
  if (evidence.real_project_media_processed === true || evidence.test_media_kind !== 'synthetic_non_project_media') {
    return {ok:false, reason:'hq_full_composite_media_contract_invalid'};
  }
  return {ok:true, reason:null};
}

async function evaluateHqFull(options = {}) {
  const nowMs = Number(options.nowMs || Date.now());
  const checkedAt = new Date(nowMs).toISOString();
  const homeDir = path.resolve(options.homeDir || os.homedir());
  const statusPath = path.resolve(options.statusPath || path.join(homeDir, '.config', 'ai-brain', 'runtime_capability_status.json'));
  const receiptPath = path.resolve(options.receiptPath || path.join(homeDir, '.config', 'ai-brain', 'step01-hq-full-gate-receipt.json'));
  const skillRoot = path.resolve(options.skillRoot || path.join(homeDir, '.codex', 'skills'));
  const status = await readJson(statusPath);
  if (status.schema_version !== 'niannian_runtime_capability_status_v1' || !status.capabilities || typeof status.capabilities !== 'object') {
    throw new Error('hq_full_capability_status_contract_invalid');
  }
  const capabilityAudits = Object.fromEntries(REQUIRED_CAPABILITIES.map(capability => [
    capability,
    inspectCapability(capability, status.capabilities[capability], options.maxAgeMinutes || 1440, nowMs)
  ]));
  const contract = await inspectContract(skillRoot);
  let compositeEvidence = null;
  if (options.compositeEvidencePath) {
    try { compositeEvidence = await readJson(path.resolve(options.compositeEvidencePath)); } catch {}
  }
  const composite = validateCompositeEvidence(compositeEvidence, contract, capabilityAudits);
  const ready = contract.ok && composite.ok && Object.values(capabilityAudits).every(item => item.ready);
  status.updated_at = checkedAt;
  status.capabilities['runtime:hq'] = {
    status:ready ? 'ready' : 'missing',
    checked_at:checkedAt,
    evidence:{
      method:'hq_full_composite_gate',
      summary:ready
        ? 'All four prerequisite capabilities and hash-bound synthetic hq_full composite validation passed.'
        : 'hq_full remains blocked; configured credentials without authorized provider health evidence do not count as ready.'
    }
  };
  await atomicWrite(statusPath, status);
  const receipt = {
    schema_version:'niannian_step01_hq_full_gate_receipt_v1',
    status:ready ? 'ready' : 'blocked',
    ready,
    capability_audits:capabilityAudits,
    contract,
    composite,
    provider_network_requested:false,
    provider_submit_requested:false,
    provider_upload_requested:false,
    spend_requested:false,
    real_project_media_processed:false,
    checked_at:checkedAt
  };
  await atomicWrite(receiptPath, receipt);
  return receipt;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const receipt = await evaluateHqFull({
    ...(option(args, '--home-dir') ? {homeDir:option(args, '--home-dir')} : {}),
    ...(option(args, '--status-path') ? {statusPath:option(args, '--status-path')} : {}),
    ...(option(args, '--receipt-path') ? {receiptPath:option(args, '--receipt-path')} : {}),
    ...(option(args, '--skill-root') ? {skillRoot:option(args, '--skill-root')} : {}),
    ...(option(args, '--composite-evidence') ? {compositeEvidencePath:option(args, '--composite-evidence')} : {})
  });
  process.stdout.write(JSON.stringify({ok:true, status:receipt.status, ready:receipt.ready, composite_reason:receipt.composite.reason}) + '\n');
  if (!receipt.ready) process.exitCode = 2;
}

if (require.main === module) main().catch(error => {
  process.stderr.write(String(error.message || error) + '\n');
  process.exitCode = 1;
});

module.exports = {
  REQUIRED_CAPABILITIES,
  evaluateHqFull,
  inspectContract,
  validateCompositeEvidence
};
