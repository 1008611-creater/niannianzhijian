'use strict';

const {execFile} = require('child_process');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const preflight = require('./niannian_mimo_n06_preflight');

const DEFAULT_SERVICE = 'ai.niannian.mimo.session.v1';
const DEFAULT_ACCOUNT = 'niannian-mimo-worker';
const DEFAULT_BASE = 'https://ai.mimo.fashion';
const PROVIDER_RESULTS = new Set(['invalid_credentials','account_not_found_or_disabled','rate_limited','provider_server_error','contract_changed','network_failed']);

function run(command, args, options = {}) {
  const runner = options.execFileImpl || execFile;
  return new Promise((resolve, reject) => runner(command, args, {maxBuffer:1024 * 1024}, (error, stdout, stderr) => error ? reject(error) : resolve({stdout,stderr})));
}
function httpClass(status) {
  const value = Number(status);
  if (!Number.isFinite(value) || value <= 0) return 'no_response';
  if (value >= 200 && value < 300) return '2xx';
  if (value >= 400 && value < 500) return '4xx';
  if (value >= 500 && value < 600) return '5xx';
  return 'other';
}
function classifyProviderResult(status, payload) {
  const message = String(payload && (payload.msg || payload.message || payload.error) || '').toLowerCase().slice(0, 300);
  if (Number(status) === 429 || /rate|too many|频繁|稍后再试|请求过多/.test(message)) return 'rate_limited';
  if (Number(status) >= 500) return 'provider_server_error';
  if (/not found|not exist|disabled|suspend|locked|frozen|用户不存在|账号不存在|账户不存在|禁用|停用|冻结|封禁/.test(message)) return 'account_not_found_or_disabled';
  if (/invalid|incorrect|credential|wrong|密码错误|账号或密码|用户名或密码|登录信息/.test(message) || [401, 403].includes(Number(status))) return 'invalid_credentials';
  return 'contract_changed';
}
function loginFailure(status, payload) {
  const error = new Error('mimo_local_login_failed');
  error.mimoDiagnostic = {http_class:httpClass(status), provider_result:classifyProviderResult(status, payload)};
  return error;
}
async function login(baseUrl, username, password, fetchImpl = global.fetch) {
  if (!username || !password) throw new Error('mimo_local_login_input_missing');
  let response;
  try {
    response = await fetchImpl(new URL('/api/auth/login', baseUrl), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
  } catch {
    const error = new Error('mimo_local_network_failed');
    error.mimoDiagnostic = {http_class:'no_response', provider_result:'network_failed'};
    throw error;
  }
  const body = await response.text();
  let parsed;
  try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = {}; }
  const token = parsed?.data?.token;
  if (!response.ok || parsed?.code !== 200 || !token || typeof token !== 'string') throw loginFailure(response.status, parsed);
  return token;
}
async function storeToken(service, account, token, options = {}) {
  await run('/usr/bin/security', ['add-generic-password','-a',account,'-s',service,'-w',token,'-U'], options);
}
async function writeReceipt(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temporary = filePath + '.tmp-' + process.pid;
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fsp.rename(temporary, filePath);
}
function failureCode(error) {
  const message = String(error && (error.message || error) || '');
  if (message === 'mimo_local_login_input_missing') return message;
  if (message === 'mimo_local_login_failed') return message;
  if (message === 'mimo_local_network_failed') return message;
  if (message === 'mimo_local_nonbillable_preflight_failed') return message;
  if (message === 'mimo_n06_fetch_unavailable') return message;
  if (/fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|ECONNRESET/i.test(message)) return 'mimo_local_network_failed';
  if (/\/usr\/bin\/security|add-generic-password/i.test(message)) return 'mimo_local_keychain_write_failed';
  if (/mimo_n06_/i.test(message)) return 'mimo_local_nonbillable_preflight_failed';
  return 'mimo_local_session_bridge_failed';
}
function failureDiagnostic(error, code = failureCode(error)) {
  const diagnostic = error && error.mimoDiagnostic && typeof error.mimoDiagnostic === 'object' ? error.mimoDiagnostic : {};
  const providerResult = PROVIDER_RESULTS.has(diagnostic.provider_result)
    ? diagnostic.provider_result
    : (code === 'mimo_local_network_failed' ? 'network_failed' : code === 'mimo_local_login_failed' ? 'contract_changed' : 'contract_changed');
  const allowedHttpClasses = new Set(['no_response','2xx','4xx','5xx','other']);
  return {
    http_class:allowedHttpClasses.has(diagnostic.http_class) ? diagnostic.http_class : (providerResult === 'network_failed' ? 'no_response' : 'other'),
    provider_result:providerResult
  };
}
async function recordFailure(options = {}, error) {
  const homeDir = path.resolve(options.homeDir || os.homedir());
  const statusFile = path.resolve(options.statusFile || path.join(homeDir, '.config', 'ai-brain', 'mimo-n06-capability-status.json'));
  const receiptPath = path.resolve(options.receiptPath || path.join(homeDir, '.config', 'ai-brain', 'mimo-keychain-session-bridge-receipt.json'));
  const code = failureCode(error);
  const diagnosis = failureDiagnostic(error, code);
  try {
    const status = JSON.parse(await fsp.readFile(statusFile, 'utf8'));
    status.updated_at = new Date().toISOString();
    if (status.capabilities && status.capabilities['credential:mimo_8001_session']) {
      status.capabilities['credential:mimo_8001_session'] = {
        status: 'failed',
        checked_at: status.updated_at,
        evidence: {method:'mac_local_session_bridge', summary:'Mac-local session bridge failed with ' + code + '. No credential or session value is recorded.'}
      };
      if (status.capabilities['channel:mimo_8001_nonbillable_preflight']) {
        status.capabilities['channel:mimo_8001_nonbillable_preflight'] = {
          status:'failed',
          checked_at:status.updated_at,
          evidence:{method:'mac_local_session_bridge', summary:'Mac-local nonbillable session check failed with ' + diagnosis.provider_result + '. No credential, provider body, or session value is recorded.'}
        };
      }
      await writeReceipt(statusFile, status);
    }
  } catch {
    // The redacted receipt below remains useful even if a pre-existing status file is malformed.
  }
  await writeReceipt(receiptPath, {
    schema_version:'niannian_mimo_keychain_session_bridge_receipt_v1',
    status:'failed',
    failure_code:code,
    http_class:diagnosis.http_class,
    provider_result:diagnosis.provider_result,
    provider_submit_requested:false,
    uploads_requested:false,
    downloads_requested:false,
    secrets_collected:false,
    updated_at:new Date().toISOString()
  });
  return {failure_code:code, http_class:diagnosis.http_class, provider_result:diagnosis.provider_result, receiptPath};
}
async function establishSession(options = {}) {
  const homeDir = path.resolve(options.homeDir || os.homedir());
  const service = options.service || DEFAULT_SERVICE;
  const account = options.account || DEFAULT_ACCOUNT;
  const baseUrl = options.baseUrl || DEFAULT_BASE;
  const statusFile = path.resolve(options.statusFile || path.join(homeDir, '.config', 'ai-brain', 'mimo-n06-capability-status.json'));
  const receiptPath = path.resolve(options.receiptPath || path.join(homeDir, '.config', 'ai-brain', 'mimo-keychain-session-bridge-receipt.json'));
  const token = await login(baseUrl, options.username, options.password, options.fetchImpl);
  const result = await preflight.runMimoN06Preflight({statusFile,baseUrl,fetchImpl:options.fetchImpl,env:{NIANNIAN_MIMO_NONBILLABLE_PREFLIGHT:'on',MIMO_TOKEN:token}});
  if (!result.ok) {
    const error = new Error('mimo_local_nonbillable_preflight_failed');
    error.mimoDiagnostic = {http_class:result.http_class || 'other', provider_result:result.provider_result || 'contract_changed'};
    throw error;
  }
  await storeToken(service, account, token, options);
  await writeReceipt(receiptPath, {schema_version:'niannian_mimo_keychain_session_bridge_receipt_v1',status:result.ok ? 'nonbillable_preflight_passed' : 'nonbillable_preflight_failed',keychain_service:service,keychain_account:account,provider_submit_requested:false,uploads_requested:false,downloads_requested:false,secrets_collected:false,updated_at:new Date().toISOString()});
  return {ok:result.ok,session_stored_in_keychain:true,provider_submit_requested:false,uploads_requested:false,downloads_requested:false,receiptPath};
}
async function main() {
  if (!process.argv.includes('--login-stdin')) throw new Error('usage: --login-stdin');
  const input = await new Promise(resolve => { let value=''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => { value += chunk; }); process.stdin.on('end', () => resolve(value)); });
  const [username, ...passwordParts] = input.split(/\r?\n/);
  const password = passwordParts.join('\n').replace(/\r?\n$/, '');
  try {
    const result = await establishSession({username:String(username || '').trim(),password});
    process.stdout.write(JSON.stringify({ok:result.ok,session_stored_in_keychain:true,provider_submit_requested:false,uploads_requested:false,downloads_requested:false}) + '\n');
  } catch (error) {
    const failure = await recordFailure({}, error);
    process.stderr.write('mimo_keychain_session_bridge_failed:' + failure.failure_code + '\n');
    process.stderr.write('mimo_keychain_session_bridge_http_class:' + failure.http_class + '\n');
    process.stderr.write('mimo_keychain_session_bridge_provider_result:' + failure.provider_result + '\n');
    process.exitCode = 1;
  }
}
if (require.main === module) main().catch(async error => {
  const failure = await recordFailure({}, error);
  process.stderr.write('mimo_keychain_session_bridge_failed:' + failure.failure_code + '\n');
  process.stderr.write('mimo_keychain_session_bridge_http_class:' + failure.http_class + '\n');
  process.stderr.write('mimo_keychain_session_bridge_provider_result:' + failure.provider_result + '\n');
  process.exitCode = 1;
});

module.exports = {DEFAULT_ACCOUNT, DEFAULT_BASE, DEFAULT_SERVICE, PROVIDER_RESULTS, classifyProviderResult, establishSession, failureCode, failureDiagnostic, httpClass, login, recordFailure, storeToken};
