'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');

const projectRoot = __dirname;
const worker = path.join(projectRoot, 'bridge', 'niannian_n05_regeneration_worker.js');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
async function writeJson(filePath, value) { await fsp.mkdir(path.dirname(filePath), {recursive:true}); await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n'); }
function run(jobRoot, extraArgs, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, '--job', jobRoot, ...extraArgs], {cwd:projectRoot, env:{...process.env, ...env}, stdio:['ignore', 'pipe', 'pipe']});
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject); child.on('exit', code => resolve({code, stdout, stderr}));
  });
}
async function fixture(root, sourceSha) {
  const jobId = 'web_ns-regeneration-fixture-12345';
  const runRoot = path.join(root, 'episode_packages', 'EP001', 'step05_asset_execution', 'n05_fixture');
  const candidatePath = path.join(runRoot, 'candidates', 'FF_V001_S001.png');
  const promptPath = path.join(runRoot, 'prompts', 'FF_V001_S001.txt');
  const candidate = Buffer.from('fixture-png-bytes');
  const prompt = '锁定唯一暖灯、暗部和人物站位。';
  await fsp.mkdir(path.dirname(candidatePath), {recursive:true});
  await fsp.mkdir(path.dirname(promptPath), {recursive:true});
  await Promise.all([fsp.writeFile(candidatePath, candidate), fsp.writeFile(promptPath, prompt)]);
  const candidateSha = sourceSha || hash(candidate);
  const manifestPath = path.join(runRoot, 'candidate_review_manifest.json');
  await Promise.all([
    writeJson(path.join(root, 'task.json'), {job_id:jobId}),
    writeJson(path.join(runRoot, 'generation_manifest.json'), {items:[{id:'FF_V001_S001',prompt_path:'prompts/FF_V001_S001.txt'}]}),
    writeJson(manifestPath, {items:[{id:'FF_V001_S001',exact_path:candidatePath,sha256:candidateSha,dimensions:'1024x1536'}]}),
    writeJson(path.join(root, '00_AUTHORITY', 'n05_candidate_regeneration_queue.json'), {items:[{request_id:'repair-001',job_id:jobId,episode_id:'EP001',candidate_id:'FF_V001_S001',source_candidate_sha256:candidateSha,source_candidate_path:candidatePath,source_prompt_sha256:hash(prompt),candidate_manifest_path:manifestPath,reason:'人物右手结构异常，保持光向整图重做。',status:'queued_for_approved_image2_worker'}]})
  ]);
}
async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-n05-regeneration-'));
  try {
    await fixture(root);
    const dryRun = await run(root, ['--dry-run']);
    assert.equal(dryRun.code, 0, dryRun.stderr);
    const plan = JSON.parse(dryRun.stdout.trim());
    assert.equal(plan.status, 'validated_queued_regeneration_request');
    assert.equal(plan.plan.provider, 'krill_image2_edit');
    assert.equal(plan.plan.local_raster_editing_allowed, false);
    assert.equal(plan.provider_submit_requested, false);
    assert.equal(fs.existsSync(path.join(root, '00_AUTHORITY', 'transaction_intent_n05regen_repair-001.json')), false);
    const blockedExecute = await run(root, ['--execute'], {KRILL_API_KEY:''});
    assert.equal(blockedExecute.code, 2, blockedExecute.stderr);
    assert.equal(JSON.parse(blockedExecute.stdout.trim()).status, 'blocked_resource_krill_api_key_missing');
    assert.equal(fs.existsSync(path.join(root, '00_AUTHORITY', 'transaction_intent_n05regen_repair-001.json')), true);
    const blockedQueue = JSON.parse(await fsp.readFile(path.join(root, '00_AUTHORITY', 'n05_candidate_regeneration_queue.json'), 'utf8'));
    assert.equal(blockedQueue.items[0].status, 'blocked_resource_krill_api_key_missing');
    assert.equal(blockedQueue.items[0].result_candidate, undefined);
    const retryPlan = await run(root, ['--dry-run', '--request-id', 'repair-001']);
    assert.equal(retryPlan.code, 0, retryPlan.stderr);
    assert.equal(JSON.parse(retryPlan.stdout.trim()).status, 'validated_queued_regeneration_request');
    const invalidRoot = path.join(root, 'invalid');
    await fixture(invalidRoot, '0'.repeat(64));
    const invalid = await run(invalidRoot, ['--dry-run']);
    assert.notEqual(invalid.code, 0);
    assert.match(invalid.stderr, /candidate_manifest_sha_mismatch|candidate_file_sha_mismatch/);
    const emptyRoot = path.join(root, 'empty');
    await fsp.mkdir(path.join(emptyRoot, '00_AUTHORITY'), {recursive:true});
    await Promise.all([
      writeJson(path.join(emptyRoot, 'task.json'), {job_id:'web_ns-empty-fixture-12345'}),
      writeJson(path.join(emptyRoot, '00_AUTHORITY', 'n05_candidate_regeneration_queue.json'), {items:[]})
    ]);
    const empty = await run(emptyRoot, ['--dry-run']);
    assert.equal(empty.code, 0);
    assert.equal(JSON.parse(empty.stdout.trim()).status, 'no_queued_regeneration_requests');
    const missingQueueRoot = path.join(root, 'missing-queue');
    await fsp.mkdir(missingQueueRoot, {recursive:true});
    await writeJson(path.join(missingQueueRoot, 'task.json'), {job_id:'web_ns-missing-queue-fixture-12345'});
    const missingQueue = await run(missingQueueRoot, ['--dry-run']);
    assert.equal(missingQueue.code, 0);
    assert.equal(JSON.parse(missingQueue.stdout.trim()).status, 'no_queued_regeneration_requests');
    process.stdout.write(JSON.stringify({ok:true,verified:['exact candidate SHA and prompt SHA preflight','empty or absent queue no-op','missing-key typed blocker and explicit request retry','whole-image remote Image2 plan','local-edit and video-submit gates preserved']}) + '\n');
  } finally { await fsp.rm(root, {recursive:true, force:true}); }
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
