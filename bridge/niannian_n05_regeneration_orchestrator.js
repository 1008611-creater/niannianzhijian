'use strict';

// One job-specific process consumes only explicit N05 regeneration queue entries.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const {spawn} = require('child_process');

const workerPath = process.env.NIANNIAN_N05_REGENERATION_WORKER_PATH || path.join(__dirname, 'niannian_n05_regeneration_worker.js');

function parseArgs(argv) {
  const result = {job:null, requestId:null, dryRun:false};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--job') result.job = argv[++index] || null;
    else if (arg === '--request-id') result.requestId = argv[++index] || null;
    else if (arg === '--dry-run') result.dryRun = true;
    else throw new Error('unknown_argument:' + arg);
  }
  if (!result.job) throw new Error('job_required');
  return result;
}

async function readJson(filePath, fallback = null) {
  try { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
  catch (error) { if (error && error.code === 'ENOENT') return fallback; throw error; }
}
async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temp = filePath + '.tmp-' + process.pid;
  await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fsp.rename(temp, filePath);
}
function now() { return new Date().toISOString(); }
function safeRequestId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{3,160}$/.test(id)) throw new Error('request_id_invalid');
  return id;
}
function queuedItems(queue) {
  return (queue?.items || []).filter(item => item && item.status === 'queued_for_approved_image2_worker');
}
function runWorker(jobRoot, requestId, dryRun) {
  const args = [workerPath, '--job', jobRoot, '--request-id', requestId, dryRun ? '--dry-run' : '--execute'];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {cwd:path.resolve(__dirname, '..'), windowsHide:true, stdio:['ignore', 'pipe', 'pipe'], env:process.env});
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString('utf8')).slice(-65536); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-65536); });
    child.on('error', reject);
    child.on('exit', code => resolve({code, stdout:stdout.trim(), stderr:stderr.trim()}));
  });
}
async function acquireLock(lockPath) {
  await fsp.mkdir(path.dirname(lockPath), {recursive:true});
  try { return await fsp.open(lockPath, 'wx'); }
  catch (error) { if (error && error.code === 'EEXIST') return null; throw error; }
}
async function releaseLock(lock, lockPath) {
  if (lock) await lock.close().catch(() => {});
  await fsp.rm(lockPath, {force:true}).catch(() => {});
}
function resultStatus(queue, requestId) {
  const item = (queue?.items || []).find(entry => entry && entry.request_id === requestId);
  return item ? String(item.status || '') : 'request_missing_after_worker';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobRoot = path.resolve(args.job);
  const task = await readJson(path.join(jobRoot, 'task.json'));
  if (!String(task?.job_id || '').startsWith('web_ns-')) throw new Error('script_only_job_required');
  const authorityRoot = path.join(jobRoot, '00_AUTHORITY');
  const queuePath = path.join(authorityRoot, 'n05_candidate_regeneration_queue.json');
  const resultPath = path.join(authorityRoot, 'n05_regeneration_orchestrator_result.json');
  const lockPath = path.join(authorityRoot, 'n05_regeneration_orchestrator.lock');
  const lock = await acquireLock(lockPath);
  if (!lock) {
    process.stdout.write(JSON.stringify({ok:true, status:'already_running', job_id:task.job_id, provider_submit_requested:false, video_submit_requested:false}) + '\n');
    return;
  }
  try {
    const initialQueue = await readJson(queuePath, {items:[]});
    const requestedId = args.requestId ? safeRequestId(args.requestId) : null;
    const initial = requestedId ? queuedItems(initialQueue).filter(item => item.request_id === requestedId) : queuedItems(initialQueue);
    if (!initial.length) {
      process.stdout.write(JSON.stringify({ok:true, job_id:task.job_id, status:'idle_no_queued_regeneration_request', provider_submit_requested:false, video_submit_requested:false, package_send_requested:false}) + '\n');
      return;
    }
    const requestedIds = requestedId ? [requestedId] : initial.map(item => item.request_id);
    const attempts = [];
    for (const requestId of requestedIds) {
      const currentQueue = await readJson(queuePath, {items:[]});
      if (!queuedItems(currentQueue).some(item => item.request_id === requestId)) continue;
      const execution = await runWorker(jobRoot, requestId, args.dryRun);
      const afterQueue = await readJson(queuePath, {items:[]});
      attempts.push({request_id:requestId, exit_code:execution.code, queue_status:resultStatus(afterQueue, requestId), stdout:execution.stdout.slice(-1000), stderr:execution.stderr.slice(-1000)});
      if (args.dryRun) break;
    }
    const result = {
      schema_version:'niannian_n05_regeneration_orchestrator_result_v1',
      job_id:task.job_id,
      status:args.dryRun ? 'dry_run_complete' : 'queue_consumption_complete',
      mode:args.dryRun ? 'dry_run' : 'execute',
      attempts,
      provider_submit_requested:false,
      video_submit_requested:false,
      package_send_requested:false,
      registry_promotion_requested:false,
      updated_at:now()
    };
    await writeJson(resultPath, result);
    process.stdout.write(JSON.stringify({ok:true, status:result.status, job_id:task.job_id, attempts:attempts.map(item => ({request_id:item.request_id,exit_code:item.exit_code,queue_status:item.queue_status})), provider_submit_requested:false, video_submit_requested:false}) + '\n');
  } finally {
    await releaseLock(lock, lockPath);
  }
}

main().catch(error => {
  process.stderr.write('n05_regeneration_orchestrator_failed:' + String(error.message || error) + '\n');
  process.exitCode = 1;
});
