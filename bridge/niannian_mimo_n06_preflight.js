'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const STATUS_SCHEMA = 'niannian_runtime_capability_status_v1';
const BASE_URL = 'https://ai.mimo.fashion';
const SESSION_CAPABILITY = 'credential:mimo_8001_session';
const CHANNEL_CAPABILITY = 'channel:mimo_8001_nonbillable_preflight';

function now() { return new Date().toISOString(); }
function isNetworkEnabled(env = process.env) { return String(env.NIANNIAN_MIMO_NONBILLABLE_PREFLIGHT || '').toLowerCase() === 'on'; }
function safeSummary(value) { return String(value || '').replace(/[\r\n]+/g, ' ').replace(/(?:bearer\s+|token\s*[:=]\s*)[^\s]+/ig, '[redacted]').trim().slice(0, 260); }
async function readStatus(filePath) {
  const parsed = JSON.parse(await fsp.readFile(filePath, 'utf8'));
  if (!parsed || parsed.schema_version !== STATUS_SCHEMA || !parsed.capabilities || typeof parsed.capabilities !== 'object') throw new Error('mimo_n06_capability_status_contract_invalid');
  return parsed;
}
async function writeStatus(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temporary = filePath + '.tmp-' + process.pid;
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fsp.rename(temporary, filePath);
}
function capability(status, evidence) {
  return {status, checked_at:now(), ...(status === 'ready' ? {expires_at:new Date(Date.now() + 60 * 60 * 1000).toISOString()} : {}), evidence};
}
function redactedResult(statusFile, reason) {
  return {ok:true, network_called:false, status_file:statusFile, provider_submit_requested:false, uploads_requested:false, reason};
}
function classifyFailure(response) {
  if (response.status === 401 || response.status === 403) return {http_class:'4xx', provider_result:'invalid_credentials'};
  if (response.status === 429) return {http_class:'4xx', provider_result:'rate_limited'};
  if (response.status >= 500) return {http_class:'5xx', provider_result:'provider_server_error'};
  if (response.status >= 400) return {http_class:'4xx', provider_result:'contract_changed'};
  if (response.status >= 200 && response.status < 300) return {http_class:'2xx', provider_result:'contract_changed'};
  return {http_class:'other', provider_result:'contract_changed'};
}
async function runMimoN06Preflight(options = {}) {
  const statusFile = path.resolve(options.statusFile);
  const env = options.env || process.env;
  if (!isNetworkEnabled(env)) return redactedResult(statusFile, 'network_disabled_by_policy');
  const token = String(env.MIMO_TOKEN || '');
  if (!token) return redactedResult(statusFile, 'mac_local_session_not_available');
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('mimo_n06_fetch_unavailable');
  const response = await fetchImpl(new URL('/api/auth/verify', options.baseUrl || BASE_URL), {
    method:'GET', headers:{Authorization:'Bearer ' + token}
  });
  const raw = await response.text();
  let payload;
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = {}; }
  const status = await readStatus(statusFile);
  const summary = response.ok ? 'Authenticated nonbillable session verification responded.' : 'Nonbillable session verification returned HTTP ' + response.status + '.';
  const evidence = {method:'mimo_nonbillable_auth_verify', summary:safeSummary(summary)};
  status.updated_at = now();
  if (response.ok && (payload.code === undefined || payload.code === 0 || payload.code === 200)) {
    status.capabilities[SESSION_CAPABILITY] = capability('ready', evidence);
    status.capabilities[CHANNEL_CAPABILITY] = capability('ready', evidence);
    await writeStatus(statusFile, status);
    return {ok:true, network_called:true, status_file:statusFile, provider_submit_requested:false, uploads_requested:false, session_ready:true, channel_preflight_ready:true};
  }
  if (response.status === 401 || response.status === 403) status.capabilities[SESSION_CAPABILITY] = capability('failed', evidence);
  status.capabilities[CHANNEL_CAPABILITY] = capability('failed', evidence);
  await writeStatus(statusFile, status);
  return {ok:false, network_called:true, status_file:statusFile, provider_submit_requested:false, uploads_requested:false, reason:'nonbillable_preflight_http_failed', ...classifyFailure(response)};
}
function option(args, name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; }
async function main() {
  const statusFile = option(process.argv.slice(2), '--status-file');
  if (!statusFile) throw new Error('usage: --status-file <mimo-n06-capability-status.json>');
  process.stdout.write(JSON.stringify(await runMimoN06Preflight({statusFile})) + '\n');
}
if (require.main === module) main().catch(error => { process.stderr.write('mimo_n06_preflight_failed:' + String(error.message || error) + '\n'); process.exitCode = 1; });

module.exports = {BASE_URL, CHANNEL_CAPABILITY, SESSION_CAPABILITY, classifyFailure, isNetworkEnabled, runMimoN06Preflight, safeSummary};
