'use strict';

// Consumes only explicit website regeneration requests. It never locally edits pixels.
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const {spawn} = require('child_process');

const krillScript = 'C:\\Users\\lsb\\.codex\\skills\\krill-image2\\scripts\\krill_image.py';
const python = 'D:\\codex-work\\tools\\LibreOffice-26.2.3\\program\\python.exe';

function parseArgs(argv) {
  const result = {dryRun:true, execute:false, job:null, requestId:null};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--job') result.job = argv[++index] || null;
    else if (arg === '--request-id') result.requestId = argv[++index] || null;
    else if (arg === '--execute') { result.execute = true; result.dryRun = false; }
    else if (arg === '--dry-run') { result.dryRun = true; result.execute = false; }
    else throw new Error('unknown_argument:' + arg);
  }
  if (!result.job) throw new Error('job_required');
  return result;
}

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function readJson(filePath) { return fsp.readFile(filePath, 'utf8').then(JSON.parse); }
async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}
function assertInside(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(label + '_outside_job_root');
  return candidate;
}
function safeId(value) {
  const result = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!result) throw new Error('unsafe_request_id');
  return result;
}
function nowId() { return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14); }
function candidateRunRoot(candidatePath) { return path.dirname(path.dirname(candidatePath)); }
function parseSize(dimensions) {
  const match = String(dimensions || '').match(/^(1024|1536|2160)x(1024|1536|3840)$/);
  return match ? match[0] : '1024x1536';
}
function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio:['ignore', 'pipe', 'pipe'], env});
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve({stdout, stderr}) : reject(new Error('provider_exit_' + code + ':' + stderr + stdout)));
  });
}

async function inspectRequest(jobRoot, request) {
  const manifestPath = assertInside(jobRoot, path.resolve(request.candidate_manifest_path), 'candidate_manifest');
  const manifest = await readJson(manifestPath);
  const candidate = (manifest.items || []).find(item => String(item.id) === String(request.candidate_id));
  if (!candidate) throw new Error('candidate_missing_from_manifest:' + request.candidate_id);
  if (candidate.sha256 !== request.source_candidate_sha256) throw new Error('candidate_manifest_sha_mismatch');
  const candidatePath = assertInside(jobRoot, path.resolve(candidate.exact_path), 'candidate');
  const candidateBytes = await fsp.readFile(candidatePath);
  if (sha256(candidateBytes) !== request.source_candidate_sha256) throw new Error('candidate_file_sha_mismatch');
  const runRoot = candidateRunRoot(candidatePath);
  const generation = await readJson(path.join(runRoot, 'generation_manifest.json'));
  const generationItem = (generation.items || []).find(item => String(item.id) === String(request.candidate_id));
  if (!generationItem) throw new Error('candidate_missing_from_generation_manifest');
  const promptPath = assertInside(jobRoot, path.resolve(runRoot, generationItem.prompt_path), 'source_prompt');
  const prompt = await fsp.readFile(promptPath, 'utf8');
  if (sha256(prompt) !== request.source_prompt_sha256) throw new Error('source_prompt_sha_mismatch');
  return {candidate, candidatePath, manifestPath, prompt, promptPath, size:parseSize(candidate.dimensions)};
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobRoot = path.resolve(args.job);
  const task = await readJson(path.join(jobRoot, 'task.json'));
  if (!String(task.job_id || '').startsWith('web_ns-')) throw new Error('script_only_job_required');
  const queuePath = path.join(jobRoot, '00_AUTHORITY', 'n05_candidate_regeneration_queue.json');
  let queue;
  try { queue = await readJson(queuePath); }
  catch (error) {
    if (error && error.code === 'ENOENT') queue = {schema_version:'niannian_n05_candidate_regeneration_queue_v1', job_id:task.job_id, items:[]};
    else throw error;
  }
  const eligible = (queue.items || []).filter(item => item && (
    item.status === 'queued_for_approved_image2_worker' ||
    (args.requestId && item.status === 'blocked_resource_krill_api_key_missing')
  ));
  const selected = args.requestId ? eligible.filter(item => item.request_id === args.requestId) : eligible;
  if (selected.length === 0) {
    process.stdout.write(JSON.stringify({ok:true,mode:args.execute ? 'execute' : 'dry_run',job_id:task.job_id,status:'no_queued_regeneration_requests',provider_submit_requested:false}) + '\n');
    return;
  }
  if (selected.length !== 1) throw new Error('exactly_one_queued_request_required');
  const request = selected[0];
  const inspected = await inspectRequest(jobRoot, request);
  const plan = {
    job_id:task.job_id,
    request_id:request.request_id,
    candidate_id:request.candidate_id,
    source_candidate_sha256:request.source_candidate_sha256,
    source_prompt_sha256:request.source_prompt_sha256,
    source_candidate_path:inspected.candidatePath,
    source_prompt_path:inspected.promptPath,
    provider:'krill_image2_edit',
    whole_image_regeneration_only:true,
    local_raster_editing_allowed:false,
    video_submit_allowed:false,
    package_send_allowed:false,
    registry_promotion_allowed:false
  };
  if (args.dryRun) {
    process.stdout.write(JSON.stringify({ok:true,mode:'dry_run',status:'validated_queued_regeneration_request',plan,provider_submit_requested:false}) + '\n');
    return;
  }
  const requestId = safeId(request.request_id);
  const timestamp = nowId();
  const executionRoot = path.join(jobRoot, 'episode_packages', request.episode_id, 'step05_asset_execution', 'regeneration', requestId + '_' + timestamp);
  const outputPath = path.join(executionRoot, 'candidates', request.candidate_id + '.png');
  const intentPath = path.join(jobRoot, '00_AUTHORITY', 'transaction_intent_n05regen_' + requestId + '.json');
  const intent = {
    run_id:'n05_regeneration_' + requestId + '_' + timestamp,
    owner_thread:'niannian_n05_regeneration_worker',
    node_id:'N05_EP001_candidate_regeneration_execute',
    allowed_write_paths:[executionRoot, queuePath, intentPath],
    expected_outputs:[outputPath, path.join(executionRoot, 'regeneration_receipt.json')],
    cost_gate:'user_requested_exact_sha_regeneration_only',
    promote_policy:'candidate_only_pending_independent_qa_and_user_confirmation',
    forbidden_actions:['local_raster_editing', 'video_provider_submit', 'package_send', 'accepted_registry_promotion']
  };
  await writeJson(intentPath, intent);
  request.status = 'running_krill_image2_whole_image_regeneration';
  request.execution_intent_path = intentPath;
  request.started_at = new Date().toISOString();
  await writeJson(queuePath, {...queue, items:queue.items, updated_at:request.started_at});
  if (!process.env.KRILL_API_KEY) {
    request.status = 'blocked_resource_krill_api_key_missing';
    request.next_action = 'Set KRILL_API_KEY only in the worker environment, then rerun this exact request ID.';
    await writeJson(queuePath, {...queue, items:queue.items, updated_at:new Date().toISOString()});
    process.stdout.write(JSON.stringify({ok:false,mode:'execute',status:request.status,plan,provider_submit_requested:false}) + '\n');
    process.exitCode = 2;
    return;
  }
  await fsp.mkdir(path.dirname(outputPath), {recursive:true});
  const regenerationPrompt = inspected.prompt + '\n\n【本次整图重做要求】\n' + request.reason + '\n保留已锁定的人物身份、镜头构图、可见光源方向与关键道具关系；仅通过远程 Image2 整图重做解决问题，不得加入文字、水印、海报排版或额外人物。';
  try {
    await run(python, [krillScript, 'edit', '--image', inspected.candidatePath, '--prompt', regenerationPrompt, '--output', outputPath, '--size', inspected.size, '--quality', 'high'], process.env);
    const bytes = await fsp.readFile(outputPath);
    if (!bytes.length) throw new Error('provider_output_empty');
    const receipt = {
      schema_version:'niannian_n05_regeneration_receipt_v1',
      request_id:request.request_id,
      candidate_id:request.candidate_id,
      provider:'krill_image2_edit',
      output_path:outputPath,
      sha256:sha256(bytes),
      bytes:bytes.length,
      automatic_visual_qa:'pending_independent_review',
      upload_eligible:false,
      video_submit_allowed:false,
      package_send_allowed:false,
      registry_promotion_allowed:false,
      completed_at:new Date().toISOString()
    };
    await writeJson(path.join(executionRoot, 'regeneration_receipt.json'), receipt);
    request.status = 'generated_pending_independent_visual_qa';
    request.result_candidate = receipt;
    request.next_action = 'Run independent visual QA, then expose the new exact SHA as a fresh user-review candidate.';
    await writeJson(queuePath, {...queue, items:queue.items, updated_at:receipt.completed_at});
    process.stdout.write(JSON.stringify({ok:true,mode:'execute',status:request.status,plan,provider_submit_requested:false}) + '\n');
  } catch (error) {
    request.status = 'failed_krill_image2_whole_image_regeneration';
    request.failure = String(error.message || error).slice(0, 1000);
    request.next_action = 'Inspect the provider failure without exposing credentials; retry this exact request or use the approved RunningHub fallback worker.';
    await writeJson(queuePath, {...queue, items:queue.items, updated_at:new Date().toISOString()});
    throw error;
  }
}

main().catch(error => {
  process.stderr.write((error && error.stack) ? error.stack + '\n' : String(error) + '\n');
  process.exitCode = 1;
});
