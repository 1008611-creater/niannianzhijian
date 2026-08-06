'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const SENSITIVE = /(?:password|token|cookie|authorization|private[ _-]?key)\s*[:=]/i;
const SESSION_CAPABILITY = 'credential:mimo_8001_session';
const CHANNEL_CAPABILITY = 'channel:mimo_8001_nonbillable_preflight';

async function readJson(filePath) { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temporary = filePath + '.tmp-' + process.pid;
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fsp.rename(temporary, filePath);
}
function validateReceipt(receipt) {
  if (!receipt || receipt.schema_version !== 'niannian_mimo_browser_preflight_receipt_v1') throw new Error('mimo_browser_preflight_receipt_schema_invalid');
  if (receipt.status !== 'passed' || receipt.browser_page_opened !== true || receipt.same_origin_request_attempted !== true || receipt.same_origin_request_succeeded !== true) throw new Error('mimo_browser_preflight_not_passed');
  if (receipt.provider_submit_requested !== false || receipt.uploads_requested !== false || receipt.downloads_requested !== false || receipt.secrets_collected !== false) throw new Error('mimo_browser_preflight_side_effect_contract_invalid');
  const summary = String(receipt.summary || '').replace(/[\r\n]+/g, ' ').trim();
  if (!summary || summary.length > 260 || SENSITIVE.test(summary)) throw new Error('mimo_browser_preflight_summary_invalid');
  const checkedAt = new Date(receipt.updated_at || '').getTime();
  if (!Number.isFinite(checkedAt) || checkedAt <= 0) throw new Error('mimo_browser_preflight_timestamp_invalid');
  return {summary, checkedAt:new Date(checkedAt).toISOString()};
}
async function importBrowserPreflight(options) {
  const receipt = await readJson(path.resolve(options.receiptPath));
  const verified = validateReceipt(receipt);
  const statusPath = path.resolve(options.statusPath);
  const status = await readJson(statusPath);
  if (status.schema_version !== 'niannian_runtime_capability_status_v1' || !status.capabilities || typeof status.capabilities !== 'object') throw new Error('mimo_capability_status_contract_invalid');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const evidence = {method:'browser_same_origin_nonbillable_preflight',summary:verified.summary};
  status.capabilities[SESSION_CAPABILITY] = {status:'ready',checked_at:verified.checkedAt,expires_at:expiresAt,evidence};
  status.capabilities[CHANNEL_CAPABILITY] = {status:'ready',checked_at:verified.checkedAt,expires_at:expiresAt,evidence};
  status.updated_at = new Date().toISOString();
  await atomicJson(statusPath, status);
  return {ok:true,session_ready:true,channel_preflight_ready:true,provider_submit_requested:false,uploads_requested:false,downloads_requested:false};
}
function option(args, name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; }
async function main() {
  const args = process.argv.slice(2);
  const receiptPath = option(args, '--receipt');
  const statusPath = option(args, '--status-file');
  if (!receiptPath || !statusPath) throw new Error('usage: --receipt <browser-preflight-receipt.json> --status-file <mimo-n06-capability-status.json>');
  process.stdout.write(JSON.stringify(await importBrowserPreflight({receiptPath,statusPath})) + '\n');
}
if (require.main === module) main().catch(error => { process.stderr.write('mimo_browser_preflight_import_failed:' + String(error.message || error) + '\n'); process.exitCode = 1; });

module.exports = {importBrowserPreflight, validateReceipt};
