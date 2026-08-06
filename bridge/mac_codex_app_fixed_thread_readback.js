'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {AppServerClient,CODEX_PATH,PROJECT_ROOT,THREADS,hasActiveTurn,summarizeThread} = require('./mac_codex_app_employee_bootstrap');

const RECEIPT_SCHEMA = 'niannian_mac_fixed_thread_readback_receipt_v1';
const RECEIPT_ROOT = path.join(os.homedir(), '.local', 'share', 'niannian-ai', 'mac-app-readback-receipts');
const COMPACTION_RECEIPT_PATH = require('./mac_codex_app_employee01_compaction').RECEIPT_PATH;

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function jsonBytes(value) { return Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8'); }
function assertRequestId(value) { const result = String(value || ''); if (!/^[A-Za-z0-9._-]{8,96}$/.test(result)) throw new Error('mac_fixed_readback_request_id_invalid'); return result; }
function fixedThread(threadId) { const fixed = THREADS.find(item => item.thread_id === String(threadId || '')); if (!fixed) throw new Error('mac_fixed_readback_thread_id_rejected'); return fixed; }
async function readJson(filePath) { try { return JSON.parse(await fsp.readFile(filePath, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function atomicReceipt(receiptPath, receipt) {
  await fsp.mkdir(path.dirname(receiptPath), {recursive:true,mode:0o700});
  const bytes = jsonBytes(receipt);
  const temporary = receiptPath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(temporary, bytes, {flag:'wx',mode:0o600});
  await fsp.rename(temporary, receiptPath);
  try { await fsp.chmod(receiptPath, 0o600); } catch {}
  return {sha256:sha256(bytes), bytes:bytes.length};
}
function compactThread(summary, fixed) {
  if (summary.thread_id !== fixed.thread_id || summary.title !== fixed.title || summary.cwd !== PROJECT_ROOT) {
    throw new Error('mac_fixed_readback_thread_identity_mismatch:' + fixed.employee);
  }
  const response = String(summary.latest_assistant_text || '');
  return {
    employee:fixed.employee,
    thread_id:fixed.thread_id,
    title:fixed.title,
    cwd:PROJECT_ROOT,
    status_type:String(summary.status?.type || ''),
    active:hasActiveTurn(summary),
    turns:Number(summary.turns || 0),
    latest_turn_id:summary.latest_turn_id || null,
    latest_turn_status:typeof summary.latest_turn_status === 'string' ? summary.latest_turn_status : null,
    latest_turn_error_present:summary.latest_turn_error !== null,
    latest_completed_assistant_turn_id:summary.latest_completed_assistant_turn_id || null,
    latest_assistant_response_sha256:sha256(Buffer.from(response, 'utf8')),
    latest_assistant_response_bytes:Buffer.byteLength(response, 'utf8')
  };
}
async function compactionSummary(filePath) {
  let stats;try{stats=await fsp.lstat(filePath);}catch(error){if(error.code==='ENOENT')return {status:'missing'};throw error;}
  if(!stats.isFile()||stats.isSymbolicLink()||stats.size<1||stats.size>64*1024)throw new Error('mac_fixed_readback_compaction_receipt_invalid');
  const bytes=await fsp.readFile(filePath),value=JSON.parse(bytes);
  if(value.schema_version!=='niannian_mac_employee01_compaction_receipt_v1'||value.thread_id!==THREADS[0].thread_id||!['completed_verified','failed'].includes(value.status))throw new Error('mac_fixed_readback_compaction_receipt_contract_invalid');
  const error=value.error||null,code=String(error?.code||'');
  return {status:value.status,contract_id:String(value.contract_id||''),thread_id:value.thread_id,compacted_event:value.compacted_event?{method:value.compacted_event.method||null,turn_id:value.compacted_event.turn_id||null}:null,terminal_readback:value.terminal_readback?{turn_id:value.terminal_readback.turn_id||null,status:value.terminal_readback.status||null,error_present:value.terminal_readback.error!==null}:null,error:error?{code:/^[A-Za-z][A-Za-z0-9_.:-]{0,120}$/.test(code)?code:'unknown_error',message_sha256:String(error.message_sha256||''),message_bytes:Number(error.message_bytes||0),secret_redacted:error.secret_redacted===true}:null,receipt_sha256:sha256(bytes),receipt_bytes:bytes.length,created_at:String(value.created_at||''),raw_error_returned:false};
}
async function runAppReadback(options = {}) {
  const requestId = assertRequestId(options.requestId);
  const selected = fixedThread(options.threadId);
  const receiptPath = path.resolve(options.receiptPath || path.join(RECEIPT_ROOT, requestId + '.json'));
  const existing = await readJson(receiptPath);
  if (existing) {
    if (existing.schema_version !== RECEIPT_SCHEMA || existing.request_id !== requestId || existing.target_thread_id !== selected.thread_id) throw new Error('mac_fixed_readback_replay_conflict');
    return {status:'replayed', receipt:existing, receipt_path:receiptPath};
  }
  const client = options.client || new AppServerClient(options.codexPath || CODEX_PATH, options.transport || 'stdio');
  const ownsClient = !options.client;
  try {
    if (ownsClient) await client.start();
    const rows = [];
    for (const fixed of THREADS) {
      const thread = (await client.request('thread/read', {threadId:fixed.thread_id,includeTurns:true})).thread;
      rows.push(compactThread(summarizeThread(thread), fixed));
    }
    const target = rows.find(item => item.thread_id === selected.thread_id);
    const compaction = selected.employee === '01' ? await compactionSummary(path.resolve(options.compactionReceiptPath || COMPACTION_RECEIPT_PATH)) : null;
    const receipt = {
      schema_version:RECEIPT_SCHEMA,
      status:'readback_verified',
      request_id:requestId,
      target_thread_id:selected.thread_id,
      target_employee:selected.employee,
      project_root:PROJECT_ROOT,
      all_fixed_threads_read:true,
      all_fixed_threads_idle:rows.every(item => item.active === false),
      target,
      employee01_compaction:compaction,
      threads:rows,
      app_server_operation:'thread/read_only',
      turn_start_requested:false,
      media_provider_network_requested:false,
      media_provider_submit_requested:false,
      media_provider_upload_requested:false,
      spend_requested:false,
      package_send_requested:false,
      deployment_requested:false,
      local_image_editing_requested:false,
      production_write_requested:false,
      shell_command_requested:false,
      created_at:new Date().toISOString()
    };
    const evidence = await atomicReceipt(receiptPath, receipt);
    return {status:'readback_verified', receipt:{...receipt,receipt_sha256:evidence.sha256,receipt_bytes:evidence.bytes}, receipt_path:receiptPath};
  } finally {
    if (ownsClient) client.close();
  }
}

async function main() {
  const [requestId, threadId] = process.argv.slice(2);
  const result = await runAppReadback({requestId,threadId});
  const receipt = result.receipt;
  process.stdout.write(JSON.stringify({ok:true,status:result.status,request_id:requestId,target_thread_id:threadId,receipt_path:result.receipt_path,receipt_sha256:receipt.receipt_sha256 || sha256(jsonBytes(receipt)),receipt_bytes:receipt.receipt_bytes || jsonBytes(receipt).length,all_fixed_threads_idle:receipt.all_fixed_threads_idle,target:receipt.target,employee01_compaction:receipt.employee01_compaction,side_effects:{turn_start_requested:false,media_provider_network_requested:false,media_provider_submit_requested:false,spend_requested:false,shell_command_requested:false}}) + '\n');
}

if (require.main === module) main().catch(error => { process.stderr.write(JSON.stringify({ok:false,error:String(error.message || error).slice(0,500)}) + '\n'); process.exitCode = 1; });

module.exports = {COMPACTION_RECEIPT_PATH,RECEIPT_ROOT,RECEIPT_SCHEMA,compactThread,compactionSummary,runAppReadback};
