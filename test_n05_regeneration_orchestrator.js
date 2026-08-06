'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');

const projectRoot = __dirname;
const orchestrator = path.join(projectRoot, 'bridge', 'niannian_n05_regeneration_orchestrator.js');

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}
function run(jobRoot, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [orchestrator, '--job', jobRoot, ...args], {cwd:projectRoot, env:{...process.env, ...env}, stdio:['ignore', 'pipe', 'pipe']});
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => resolve({code, stdout, stderr}));
  });
}
async function createJob(root, requestId) {
  await Promise.all([
    writeJson(path.join(root, 'task.json'), {job_id:'web_ns-orchestrator-fixture-12345'}),
    writeJson(path.join(root, '00_AUTHORITY', 'n05_candidate_regeneration_queue.json'), {
      schema_version:'niannian_n05_candidate_regeneration_queue_v1',
      items:[{request_id:requestId, candidate_id:'FF_V001_S001', status:'queued_for_approved_image2_worker'}]
    })
  ]);
}
async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-n05-orchestrator-'));
  try {
    const fakeWorker = path.join(tempRoot, 'fake_worker.js');
    await fsp.writeFile(fakeWorker, [
      "'use strict';",
      "const fs = require('fs');",
      "const path = require('path');",
      "const args = process.argv.slice(2);",
      "const value = name => args[args.indexOf(name) + 1];",
      "const job = value('--job'); const requestId = value('--request-id');",
      "const queuePath = path.join(job, '00_AUTHORITY', 'n05_candidate_regeneration_queue.json');",
      "if (args.includes('--dry-run')) { process.stdout.write(JSON.stringify({ok:true,status:'validated_queued_regeneration_request'}) + '\\n'); process.exit(0); }",
      "const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));",
      "const item = queue.items.find(entry => entry.request_id === requestId);",
      "item.status = 'generated_pending_independent_visual_qa'; item.result_candidate = {sha256:'f'.repeat(64), upload_eligible:false};",
      "fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\\n');",
      "process.stdout.write(JSON.stringify({ok:true,status:item.status,provider_submit_requested:false}) + '\\n');"
    ].join('\n'), 'utf8');
    const environment = {NIANNIAN_N05_REGENERATION_WORKER_PATH:fakeWorker};
    const idleRoot = path.join(tempRoot, 'idle');
    await fsp.mkdir(idleRoot, {recursive:true});
    await writeJson(path.join(idleRoot, 'task.json'), {job_id:'web_ns-orchestrator-idle-12345'});
    const idle = await run(idleRoot, ['--dry-run'], environment);
    assert.equal(idle.code, 0, idle.stderr);
    assert.equal(JSON.parse(idle.stdout.trim()).status, 'idle_no_queued_regeneration_request');
    assert.equal(fs.existsSync(path.join(idleRoot, '00_AUTHORITY', 'n05_regeneration_orchestrator_result.json')), false);
    const dryRoot = path.join(tempRoot, 'dry');
    await createJob(dryRoot, 'repair-dry-001');
    const dry = await run(dryRoot, ['--request-id', 'repair-dry-001', '--dry-run'], environment);
    assert.equal(dry.code, 0, dry.stderr);
    assert.equal(JSON.parse(dry.stdout.trim()).status, 'dry_run_complete');
    const dryQueue = JSON.parse(await fsp.readFile(path.join(dryRoot, '00_AUTHORITY', 'n05_candidate_regeneration_queue.json'), 'utf8'));
    assert.equal(dryQueue.items[0].status, 'queued_for_approved_image2_worker');
    const executionRoot = path.join(tempRoot, 'execute');
    await createJob(executionRoot, 'repair-execute-001');
    const execution = await run(executionRoot, ['--request-id', 'repair-execute-001'], environment);
    assert.equal(execution.code, 0, execution.stderr);
    const executionResult = JSON.parse(execution.stdout.trim());
    assert.equal(executionResult.status, 'queue_consumption_complete');
    assert.equal(executionResult.attempts[0].queue_status, 'generated_pending_independent_visual_qa');
    const queue = JSON.parse(await fsp.readFile(path.join(executionRoot, '00_AUTHORITY', 'n05_candidate_regeneration_queue.json'), 'utf8'));
    assert.equal(queue.items[0].status, 'generated_pending_independent_visual_qa');
    const result = JSON.parse(await fsp.readFile(path.join(executionRoot, '00_AUTHORITY', 'n05_regeneration_orchestrator_result.json'), 'utf8'));
    assert.equal(result.video_submit_requested, false);
    assert.equal(result.package_send_requested, false);
    assert.equal(fs.existsSync(path.join(executionRoot, '00_AUTHORITY', 'n05_regeneration_orchestrator.lock')), false);
    process.stdout.write(JSON.stringify({ok:true,verified:['empty queue read-only no-op', 'dry-run dispatch', 'exact request auto-dispatch', 'queue readback', 'lock cleanup', 'video and delivery gates preserved']}) + '\n');
  } finally { await fsp.rm(tempRoot, {recursive:true, force:true}); }
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
