'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const bridgeRelease = require('./niannian_mac_bridge_release');

const MAX_RECEIPT_BYTES = 256 * 1024;
const FIXED_RECEIPTS = Object.freeze([
  ['hq_gate', 'output/mac-employee-training/mac-step01-hq-full-gate-receipt.json'],
  ['hq_composite', 'output/mac-employee-training/mac-step01-hq-full-composite-evidence.json'],
  ['analysis_probe', 'output/mac-employee-training/mac-step01-analysis-composite-probe-receipt.json'],
  ['hq_promotion', 'output/mac-employee-training/step01-hq-full-toolchain-accepted.json'],
  ['hq_exit', 'output/mac-employee-training/step01-hq-composite-probe-exit.json']
]);
const SECRET_KEY = /(?:secret|token|password|cookie|authorization|api[_-]?key|private[_-]?key|credential)/i;
const RAW_PROVIDER_KEY = /(?:provider.*(?:response|body|payload)|(?:response|body|payload).*provider)/i;

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return Boolean(relative) && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function redact(value, key = '') {
  if (/^credential:(?:mimo_asr|paddle_ocr)$/.test(key) && value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      capability:typeof value.capability === 'string' ? value.capability : key,
      ready:value.ready === true,
      status:typeof value.status === 'string' ? value.status.slice(0,80) : null,
      reason:value.reason === null || typeof value.reason === 'string' ? value.reason : null,
      health_proof_state:typeof value.health_proof_state === 'string' ? value.health_proof_state.slice(0,80) : null,
      refresh_required:value.refresh_required === true,
      checked_at:typeof value.checked_at === 'string' ? value.checked_at : null,
      expires_at:typeof value.expires_at === 'string' ? value.expires_at : null,
      evidence:redact(value.evidence || {}, 'evidence')
    };
  }
  if (SECRET_KEY.test(key) || RAW_PROVIDER_KEY.test(key)) return '[redacted]';
  if (Array.isArray(value)) return value.slice(0, 100).map(item => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 200).map(([childKey, childValue]) => [childKey, redact(childValue, childKey)]));
  }
  if (typeof value === 'string') return value.slice(0, 2000);
  return value;
}
async function readReceipt(projectRoot, receiptId, relativePath) {
  const exactPath = path.resolve(projectRoot, relativePath);
  if (!isInside(projectRoot, exactPath)) throw new Error('hq_readback_fixed_path_invalid');
  let stats;
  try { stats = await fsp.lstat(exactPath); } catch (error) {
    if (error.code === 'ENOENT') return {receipt_id:receiptId, project_relative_path:relativePath, status:'missing'};
    throw error;
  }
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('hq_readback_receipt_file_invalid:' + receiptId);
  if (stats.size < 1 || stats.size > MAX_RECEIPT_BYTES) throw new Error('hq_readback_receipt_size_invalid:' + receiptId);
  const bytes = await fsp.readFile(exactPath);
  let receipt;
  try { receipt = JSON.parse(bytes); } catch { throw new Error('hq_readback_receipt_json_invalid:' + receiptId); }
  return {receipt_id:receiptId, project_relative_path:relativePath, status:'present', sha256:sha256(bytes), bytes:bytes.length, receipt:redact(receipt)};
}
async function readFixedHqReadback(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || path.join(__dirname, '..'));
  const receipts = [];
  for (const [receiptId, relativePath] of FIXED_RECEIPTS) receipts.push(await readReceipt(projectRoot, receiptId, relativePath));
  let installedBridgeRelease;
  try { installedBridgeRelease = await bridgeRelease.readInstalledBridgeRelease({projectRoot}); }
  catch (error) { installedBridgeRelease = {status:'invalid', reason:String(error.message || error).slice(0,160)}; }
  return {
    schema_version:'niannian_mac_hq_fixed_readback_v1',
    status:receipts.every(item => item.status === 'present') ? 'complete' : 'incomplete',
    project_root_binding:'/Users/lsb/AI-Brain/niannian-ai-canonical-local',
    read_only:true,
    fixed_whitelist:true,
    shell_command_requested:false,
    media_provider_network_requested:false,
    media_provider_submit_requested:false,
    media_provider_upload_requested:false,
    spend_requested:false,
    project_media_processed:false,
    bridge_release:installedBridgeRelease,
    receipts,
    read_at:new Date().toISOString()
  };
}
async function main() {
  if (process.argv.length !== 2) throw new Error('hq_readback_does_not_accept_arguments');
  process.stdout.write(JSON.stringify(await readFixedHqReadback()) + '\n');
}
if (require.main === module) main().catch(error => { process.stderr.write(String(error.message || error) + '\n'); process.exitCode = 1; });

module.exports = { FIXED_RECEIPTS, MAX_RECEIPT_BYTES, readFixedHqReadback, readReceipt, redact };
