'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const REQUIRED = ['credential:mimo_asr','credential:paddle_ocr','runtime:transnetv2','runtime:forced_aligner','runtime:hq'];
const STATUS_PATH = '/Users/lsb/.config/ai-brain/runtime_capability_status.json';

async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true, mode:0o700});
  const temporary = filePath + '.tmp-' + process.pid;
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {flag:'wx', mode:0o600});
  await fsp.rename(temporary, filePath);
  await fsp.chmod(filePath, 0o600);
}

async function reuseFresh(options = {}) {
  const gatePath = path.resolve(options.gatePath);
  const exitPath = path.resolve(options.exitPath);
  const statusPath = path.resolve(options.statusPath || STATUS_PATH);
  const stats = await fsp.lstat(gatePath).catch(() => null);
  if (!stats || !stats.isFile() || stats.isSymbolicLink()) return {reused:false, reason:'gate_missing'};

  const gateBytes = await fsp.readFile(gatePath);
  const gate = JSON.parse(gateBytes);
  const now = Number(options.nowMs || Date.now());
  const sideEffects = ['media_provider_network_requested','provider_upload_requested','provider_submit_requested','spend_requested','real_project_media_processed','real_delivery'];
  const fresh = gate.schema_version === 'niannian_step01_hq_full_gate_receipt_v2'
    && gate.status === 'ready'
    && gate.ready === true
    && gate.host?.platform === 'darwin'
    && gate.host?.project_root === '/Users/lsb/AI-Brain/niannian-ai-canonical-local'
    && gate.settings_binding?.version === 2
    && gate.settings_binding?.profile === 'mac-step01-hq-full-evidence-v2'
    && REQUIRED.every(key => gate.capability_audits?.[key]?.ready === true)
    && sideEffects.every(key => gate[key] === false);
  if (!fresh) return {reused:false, reason:'gate_missing_or_binding_invalid'};

  const status = JSON.parse(await fsp.readFile(statusPath, 'utf8'));
  if (status?.schema_version !== 'niannian_runtime_capability_status_v1' || !status.capabilities || typeof status.capabilities !== 'object') throw new Error('runtime_capability_status_invalid');
  status.capabilities['runtime:hq'] = {
    status:'ready',
    checked_at:gate.checked_at,
    expires_at:gate.expires_at,
    evidence:{method:'mac_step01_hq_v2_gate', summary:'Fresh hash-bound non-project HQ composite and v2 gate passed; no project media was processed.'}
  };
  status.updated_at = gate.checked_at;
  await atomicJson(statusPath, status);
  await atomicJson(exitPath, {
    schema_version:'niannian_step01_hq_composite_probe_exit_v1',
    status:'reused_fresh',
    exit_code:0,
    gate_sha256:crypto.createHash('sha256').update(gateBytes).digest('hex'),
    completed_at:new Date(now).toISOString(),
    log_contains_secret:false,
    provider_network_requested:false,
    provider_submit_requested:false,
    project_media_processed:false
  });
  return {reused:true, status:'reused_fresh', expires_at:gate.expires_at};
}

async function main() {
  const [gatePath, exitPath] = process.argv.slice(2);
  if (!gatePath || !exitPath) throw new Error('hq_refresh_preflight_args');
  const result = await reuseFresh({gatePath, exitPath});
  process.stdout.write(JSON.stringify(result) + '\n');
  if (!result.reused) process.exitCode = 3;
}

if (require.main === module) main().catch(error => { process.stderr.write(String(error.message || error) + '\n'); process.exitCode = 2; });

module.exports = {REQUIRED, reuseFresh};
