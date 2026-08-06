'use strict';

// Mac-local N06 adapter. Provider credentials never leave this process or macOS Keychain.
const {execFile} = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const BASE_URL = 'https://ai.mimo.fashion';
const KEYCHAIN_SERVICE = 'ai.niannian.mimo.session.v1';
const KEYCHAIN_ACCOUNT = 'niannian-mimo-worker';
const QUALITY_TOKENS = new Set(['keep_720p_hard_gate', 'accept_mimo_uncommitted_resolution']);

function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function crc32Hex(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}
function safeTaskId(value) { const id = String(value || ''); if (!/^[A-Za-z0-9._-]{4,200}$/.test(id)) throw new Error('mimo_n06_provider_task_id_invalid'); return id; }
function safeSpec(spec) {
  if (!spec || spec.provider !== 'mimo' || spec.execution_mode !== 'real_submit_v1') throw new Error('mimo_n06_real_spec_required');
  if (!/^[A-Za-z0-9._-]{8,200}$/.test(String(spec.transaction_id || ''))) throw new Error('mimo_n06_transaction_id_invalid');
  if (Number(spec.duration_sec) !== 11 || spec.aspect_ratio !== '9:16') throw new Error('mimo_n06_duration_or_ratio_invalid');
  if (!QUALITY_TOKENS.has(String(spec.quality_decision_token || ''))) throw new Error('mimo_n06_quality_policy_invalid');
  if (!spec.prompt || typeof spec.prompt.text !== 'string' || !/^[a-f0-9]{64}$/.test(String(spec.prompt.sha256 || '')) || sha256(Buffer.from(spec.prompt.text, 'utf8')) !== spec.prompt.sha256) throw new Error('mimo_n06_prompt_hash_invalid');
  if (!Array.isArray(spec.references) || !spec.references.length || spec.references.length > 9) throw new Error('mimo_n06_reference_count_invalid');
  for (const reference of spec.references) {
    if (!reference || reference.uploadEligible !== true || !reference.path || !/^[a-f0-9]{64}$/.test(String(reference.sha256 || ''))) throw new Error('mimo_n06_reference_contract_invalid');
  }
  return spec;
}
async function run(command, args, options = {}) {
  const runner = options.execFileImpl || execFile;
  return new Promise((resolve, reject) => runner(command, args, {maxBuffer:2 * 1024 * 1024}, (error, stdout, stderr) => error ? reject(error) : resolve({stdout, stderr})));
}
async function getKeychainToken(options = {}) {
  const service = options.service || KEYCHAIN_SERVICE;
  const account = options.account || KEYCHAIN_ACCOUNT;
  const result = await run('/usr/bin/security', ['find-generic-password', '-a', account, '-s', service, '-w'], options);
  const token = String(result.stdout || '').trim();
  if (!token) throw new Error('mimo_n06_keychain_session_missing');
  return token;
}
async function readCapabilityStatus(statusPath) {
  const status = JSON.parse(await fsp.readFile(statusPath, 'utf8'));
  for (const key of ['credential:mimo_8001_session', 'channel:mimo_8001_nonbillable_preflight']) {
    const value = status?.capabilities?.[key];
    if (value?.status !== 'ready' || !value.expires_at || Date.parse(value.expires_at) <= Date.now()) throw new Error('mimo_n06_capability_not_ready');
  }
  return status;
}
async function requestJson(fetchImpl, url, init) {
  const response = await fetchImpl(url, init);
  const raw = await response.text();
  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { /* provider body is never persisted */ }
  if (!response.ok || (payload.code !== undefined && payload.code !== 0 && payload.code !== 200)) throw new Error('mimo_n06_provider_http_' + response.status);
  return payload.data || {};
}
async function uploadReference(spec, reference, token, options) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const baseUrl = options.baseUrl || BASE_URL;
  const bytes = await fsp.readFile(reference.path);
  if (sha256(bytes) !== reference.sha256) throw new Error('mimo_n06_reference_sha_mismatch');
  const applied = await requestJson(fetchImpl, new URL('/api/video/upload-apply', baseUrl), {method:'POST', headers:{Authorization:'Bearer ' + token, 'Content-Type':'application/json'}, body:JSON.stringify({fileName:path.basename(reference.path), fileSize:bytes.length})});
  if (!applied.uploadUrl || !applied.sessionKey || !applied.storeUri || !applied.fileType) throw new Error('mimo_n06_upload_apply_contract_invalid');
  const uploadHeaders = {...(applied.uploadHeaders || {})};
  if (!Object.keys(uploadHeaders).some(key => key.toLowerCase() === 'content-crc32')) uploadHeaders['content-crc32'] = crc32Hex(bytes);
  const transfer = await fetchImpl(applied.uploadUrl, {method:'POST', headers:uploadHeaders, body:bytes});
  if (!transfer.ok) throw new Error('mimo_n06_object_upload_failed');
  const committed = await requestJson(fetchImpl, new URL('/api/video/upload-commit', baseUrl), {method:'POST', headers:{Authorization:'Bearer ' + token, 'Content-Type':'application/json'}, body:JSON.stringify({fileType:applied.fileType, sessionKey:applied.sessionKey, storeUri:applied.storeUri, ...(applied.vid ? {vid:applied.vid} : {})})});
  if (!committed.imageUri || !committed.imageUrl) throw new Error('mimo_n06_upload_commit_contract_invalid');
  return {imageUri:committed.imageUri, imageUrl:committed.imageUrl, reference_sha256:reference.sha256, duty:String(reference.duty || '')};
}
async function ffprobe(filePath, options = {}) {
  const result = await run(options.ffprobePath || 'ffprobe', ['-v','error','-show_entries','stream=codec_type,width,height:format=duration','-of','json',filePath], options);
  let parsed;
  try { parsed = JSON.parse(result.stdout); } catch { throw new Error('mimo_n06_ffprobe_parse_failed'); }
  const video = (parsed.streams || []).find(stream => stream.codec_type === 'video') || {};
  return {status:'passed', width:Number(video.width || 0), height:Number(video.height || 0), duration_sec:Number(parsed.format?.duration || 0)};
}
function verifyMedia(probe, qualityToken) {
  if (!probe.width || !probe.height || Math.abs((probe.width / probe.height) - (9 / 16)) > 0.02 || Math.abs(probe.duration_sec - 11) > 1.5) throw new Error('mimo_n06_media_contract_failed');
  if (qualityToken === 'keep_720p_hard_gate' && (probe.width !== 720 || probe.height !== 1280)) throw new Error('mimo_n06_720p_quality_gate_failed');
  return probe;
}
async function runExecution(spec, options = {}) {
  safeSpec(spec);
  if (options.execute !== true || String(options.env?.NIANNIAN_N06_REAL_MIMO_EXECUTION || '').toLowerCase() !== 'on' || options.confirmTransaction !== spec.transaction_id) {
    return {ok:true, mode:'plan_only', network_called:false, provider_submit_requested:false, uploads_requested:false, downloads_requested:false, reason:'explicit_real_execution_gate_required'};
  }
  const statusPath = options.statusPath || path.join(os.homedir(), '.config', 'ai-brain', 'mimo-n06-capability-status.json');
  await readCapabilityStatus(statusPath);
  const token = options.getToken ? await options.getToken() : await getKeychainToken(options);
  const fetchImpl = options.fetchImpl || global.fetch;
  const baseUrl = options.baseUrl || BASE_URL;
  await requestJson(fetchImpl, new URL('/api/auth/verify', baseUrl), {method:'GET', headers:{Authorization:'Bearer ' + token}});
  const images = [];
  for (const reference of spec.references) images.push(await uploadReference(spec, reference, token, {...options, fetchImpl, baseUrl}));
  const generated = await requestJson(fetchImpl, new URL('/api/video/generate', baseUrl), {method:'POST', headers:{Authorization:'Bearer ' + token, 'Content-Type':'application/json'}, body:JSON.stringify({prompt:spec.prompt.text, duration:11, aspectRatio:'9:16', images:images.map(item => ({imageUri:item.imageUri, imageUrl:item.imageUrl}))})});
  const providerTaskId = safeTaskId(generated.id || generated.taskId);
  let task = null;
  const attempts = Number(options.maxPollAttempts || 90);
  for (let index = 0; index < attempts; index += 1) {
    const result = await requestJson(fetchImpl, new URL('/api/video/batch-status', baseUrl), {method:'POST', headers:{Authorization:'Bearer ' + token, 'Content-Type':'application/json'}, body:JSON.stringify({taskIds:[providerTaskId]})});
    task = Array.isArray(result) ? result.find(item => item.taskId === providerTaskId) : null;
    if (task?.status === 1) break;
    if (task?.status === 40) throw new Error('mimo_n06_provider_task_failed');
    if (index + 1 < attempts && options.wait) await options.wait(Number(options.pollIntervalMs || 10000));
  }
  if (!task?.videoUrl) throw new Error('mimo_n06_provider_poll_timeout');
  const media = await fetchImpl(task.videoUrl, {method:'GET'});
  if (!media.ok) throw new Error('mimo_n06_download_failed');
  const output = Buffer.from(await media.arrayBuffer());
  if (!output.length) throw new Error('mimo_n06_download_empty');
  const outputRoot = path.resolve(options.outputRoot || path.join(process.cwd(), '06_N06_EXECUTION', spec.group_id));
  await fsp.mkdir(outputRoot, {recursive:true});
  const outputPath = path.join(outputRoot, providerTaskId + '.mp4');
  await fsp.writeFile(outputPath, output, {flag:'wx'});
  const probe = verifyMedia(await ffprobe(outputPath, options), spec.quality_decision_token);
  const visualQa = options.visualQa ? await options.visualQa({filePath:outputPath, spec, probe}) : {status:'pending_human_visual_qa'};
  const artifact = {exact_path:outputPath, sha256:sha256(output), bytes:output.length};
  return {ok:visualQa.status === 'passed', mode:'real_provider_execution', provider:'mimo', provider_task_id:providerTaskId, uploaded_reference_count:images.length, provider_submit_requested:true, uploads_requested:true, downloads_requested:true, artifact, ffprobe:probe, visual_qa:visualQa, status:visualQa.status === 'passed' ? 'qa_passed' : 'blocked_quality_review'};
}

function option(args, name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; }
async function main() {
  const args = process.argv.slice(2);
  const specPath = option(args, '--spec');
  if (!specPath) throw new Error('usage: --spec <n06-real-submit-spec.json> [--execute --confirm-transaction <id> --output-root <path>]');
  const spec = JSON.parse(await fsp.readFile(path.resolve(specPath), 'utf8'));
  const result = await runExecution(spec, {
    execute:args.includes('--execute'),
    confirmTransaction:option(args, '--confirm-transaction'),
    outputRoot:option(args, '--output-root') || undefined,
    env:process.env
  });
  process.stdout.write(JSON.stringify(result) + '\n');
}
if (require.main === module) main().catch(error => { process.stderr.write('mimo_n06_execution_adapter_failed:' + String(error.message || error) + '\n'); process.exitCode = 1; });

module.exports = {BASE_URL, KEYCHAIN_ACCOUNT, KEYCHAIN_SERVICE, QUALITY_TOKENS, crc32Hex, ffprobe, getKeychainToken, readCapabilityStatus, runExecution, safeSpec, verifyMedia};
