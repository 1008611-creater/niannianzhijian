'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const projectRoot = __dirname;

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function runNode(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {cwd:projectRoot, env:{...process.env, ...env}, stdio:['ignore','pipe','pipe']});
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve({stdout, stderr}) : reject(new Error('script_worker_dispatcher_failed_' + code + ':' + stderr + stdout)));
  });
}

async function waitForFile(filePath) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { await fsp.access(filePath); return; } catch {}
    await delay(50);
  }
  throw new Error('expected_file_timeout:' + filePath);
}

function lastJsonLine(output) {
  const line = String(output || '').trim().split(/\r?\n/).filter(Boolean).pop();
  return JSON.parse(line);
}

async function createScriptJob(jobRoot, jobId, sourceSha256) {
  const sourcePath = path.join(jobRoot, 'source', 'source_text.txt');
  const sourceText = '第一章：顾言在雨夜等苏晚走出民政局。她把戒指放进掌心，决定拿回被夺走的一切。\n';
  await fsp.mkdir(path.dirname(sourcePath), {recursive:true});
  await fsp.writeFile(sourcePath, sourceText, 'utf8');
  const actualSha256 = crypto.createHash('sha256').update(sourceText, 'utf8').digest('hex');
  const sha256 = sourceSha256 || actualSha256;
  const task = {
    schema_version:'niannian_script_only_worker_v1',
    contract:'niannian_script_only_worker_v1',
    job_id:jobId,
    remote_job_id:'NS-TEST',
    required_router:'mx-shortdrama-00-router',
    selected_skill:'mx-shortdrama-script-only-production',
    allowed_skill_routes:['mx-shortdrama-00-router','mx-shortdrama-script-only-production'],
    source_script:{exact_path:sourcePath,sha256,type:'extracted_novel_text'},
    constraints:{provider_submit_requires_authorization:true,package_send_requires_authorization:true}
  };
  const routeDecision = {
    job_id:jobId,
    advisory_only:true,
    required_router:'mx-shortdrama-00-router',
    selected_skill:'mx-shortdrama-script-only-production',
    source_sha256:sha256
  };
  await Promise.all([
    writeJson(path.join(jobRoot, 'task.json'), task),
    writeJson(path.join(jobRoot, 'transaction_intent.json'), {run_id:jobId,cost_gate:'controller_authorization_required'}),
    writeJson(path.join(jobRoot, 'route_decision.json'), routeDecision),
    writeJson(path.join(jobRoot, 'status.json'), {job_id:jobId,status:'queued',current_node:'N01',next_skill:'mx-shortdrama-script-only-production'}),
    writeJson(path.join(jobRoot, 'checkpoint.json'), {job_id:jobId,status:'queued',current_step:'N01'}),
    writeJson(path.join(jobRoot, 'gate_dashboard.json'), {job_id:jobId,gates:{N01:{status:'ready_for_ai_worker'},provider_submit:{status:'blocked_cost_authorization'},package_send:{status:'blocked_controller_authorization'}}}),
    writeJson(path.join(jobRoot, 'artifact_ledger.json'), {job_id:jobId,artifacts:[]})
  ]);
  return {sourcePath, actualSha256};
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-script-worker-'));
  const workspace = path.join(tempRoot, 'workspace');
  const directJobsRoot = path.join(workspace, '06_AUTOMATION', 'direct_jobs');
  const productionIndex = path.join(workspace, '06_AUTOMATION', 'production_jobs.index.json');
  const stateRoot = path.join(tempRoot, 'worker-state');
  const validJobId = 'web_ns-script-fixture-12345';
  const relayJobId = 'web_ns-relay-fixture-12345';
  const invalidJobId = 'web_ns-script-invalid-12345';
  const validJobRoot = path.join(directJobsRoot, validJobId);
  const relayJobRoot = path.join(directJobsRoot, relayJobId);
  const invalidJobRoot = path.join(directJobsRoot, invalidJobId);
  const fakeWorker = path.join(tempRoot, 'fake_script_worker.js');
  try {
    const valid = await createScriptJob(validJobRoot, validJobId);
    await createScriptJob(relayJobRoot, relayJobId);
    await createScriptJob(invalidJobRoot, invalidJobId, '0'.repeat(64));
    await writeJson(productionIndex, {
      schema_version:1,
      index_type:'zhuanhui_production_jobs',
      workspace_root:workspace,
      job_roots:{codex_direct:directJobsRoot},
      jobs:[
        {job_id:validJobId,entrypoint:'codex_direct',source_entrypoint:'niannian_ai_web_script',job_dir:validJobRoot,status:'queued'},
        {job_id:relayJobId,entrypoint:'codex_direct',source_entrypoint:'niannian_ai_mac_relay',job_dir:relayJobRoot,status:'queued'},
        {job_id:invalidJobId,entrypoint:'codex_direct',source_entrypoint:'niannian_ai_web_script',job_dir:invalidJobRoot,status:'queued'}
      ]
    });
    await fsp.writeFile(fakeWorker, [
      "'use strict';",
      "const fs = require('fs');",
      "const path = require('path');",
      "const dispatch = JSON.parse(fs.readFileSync(process.env.NIANNIAN_WORKER_DISPATCH_PATH, 'utf8'));",
      "const root = process.env.NIANNIAN_WORKER_JOB_ROOT;",
      "const statusPath = path.join(root, 'status.json');",
      "const checkpointPath = path.join(root, 'checkpoint.json');",
      "const dashboardPath = path.join(root, 'gate_dashboard.json');",
      "const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));",
      "const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));",
      "const dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));",
      "const updatedAt = new Date().toISOString();",
      "status.status = 'running_n01'; status.current_node = 'N01'; status.next_skill = 'mx-shortdrama-script-only-production'; status.next_action = 'N01 cited canon ledger is being built.'; status.updated_at = updatedAt;",
      "checkpoint.status = 'running_n01'; checkpoint.current_step = 'N01'; checkpoint.next_skill = status.next_skill; checkpoint.next_action = status.next_action; checkpoint.updated_at = updatedAt;",
      "dashboard.overall_status = 'running_n01'; dashboard.current_node = 'N01'; dashboard.next_skill = status.next_skill; dashboard.gates.N01 = {status:'running'}; dashboard.gates.provider_submit = {status:'blocked_cost_authorization'}; dashboard.updated_at = updatedAt;",
      "fs.writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\\n');",
      "fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2) + '\\n');",
      "fs.writeFileSync(dashboardPath, JSON.stringify(dashboard, null, 2) + '\\n');",
      "fs.writeFileSync(process.env.NIANNIAN_WORKER_RECEIPT_PATH, JSON.stringify({job_id:dispatch.job_id,dispatch_id:dispatch.dispatch_id,production_status:'running_n01',worker_status:'active',current_node:'N01',next_skill:status.next_skill,next_action:status.next_action,provider_submission_requested:false,package_send_requested:false,updated_at:updatedAt}, null, 2) + '\\n');",
      "process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'script-worker-test-001'}) + '\\n');"
    ].join('\n'), 'utf8');
    const dispatcher = path.join(projectRoot, 'bridge', 'niannian_codex_worker_dispatcher.js');
    const baseEnv = {
      ZHUANHUI_WORKSPACE:workspace,
      NIANNIAN_PRODUCTION_INDEX:productionIndex,
      NIANNIAN_CODEX_WORKER_STATE_DIR:stateRoot,
      NIANNIAN_CODEX_WORKER_ROUTER_ALLOWLIST:'mx-shortdrama-00-router,mx-shortdrama-script-only-production'
    };
    const queued = await runNode(dispatcher, {...baseEnv,NIANNIAN_CODEX_WORKER_MODE:'queue'});
    const queueResult = lastJsonLine(queued.stdout);
    assert.equal(queueResult.jobs.find(item => item.job_id === validJobId).status, 'queued');
    assert.equal(queueResult.jobs.find(item => item.job_id === relayJobId).status, 'queued');
    const relayDispatch = JSON.parse(await fsp.readFile(path.join(relayJobRoot, 'employee_dispatch.json'), 'utf8'));
    assert.equal(relayDispatch.job_id, relayJobId);
    assert.equal(relayDispatch.mode, 'queue');
    const invalidResult = queueResult.jobs.find(item => item.job_id === invalidJobId);
    assert.equal(invalidResult.status, 'rejected');
    assert.match(invalidResult.blocker, /worker_source_sha256_mismatch/);
    const prompt = await fsp.readFile(path.join(validJobRoot, 'codex_worker_prompt.md'), 'utf8');
    assert.match(prompt, /source_script\.exact_path/);
    assert.doesNotMatch(prompt, /源视频只允许/);
    const indexForExecute = JSON.parse(await fsp.readFile(productionIndex, 'utf8'));
    indexForExecute.jobs = indexForExecute.jobs.filter(item => item.job_id !== relayJobId);
    await writeJson(productionIndex, indexForExecute);
    const executeEnv = {...baseEnv,NIANNIAN_CODEX_WORKER_MODE:'execute',NIANNIAN_CODEX_WORKER_COMMAND:process.execPath,NIANNIAN_CODEX_WORKER_COMMAND_ARGS:JSON.stringify([fakeWorker])};
    await runNode(dispatcher, executeEnv);
    await waitForFile(path.join(validJobRoot, 'employee_worker_receipt.json'));
    await delay(80);
    await runNode(dispatcher, executeEnv);
    const dispatch = JSON.parse(await fsp.readFile(path.join(validJobRoot, 'employee_dispatch.json'), 'utf8'));
    const receipt = JSON.parse(await fsp.readFile(path.join(validJobRoot, 'employee_worker_receipt.json'), 'utf8'));
    const status = JSON.parse(await fsp.readFile(path.join(validJobRoot, 'status.json'), 'utf8'));
    assert.equal(dispatch.status, 'handoff');
    assert.equal(dispatch.thread_id, 'script-worker-test-001');
    assert.equal(receipt.production_status, 'running_n01');
    assert.equal(status.status, 'running_n01');
    assert.equal(valid.actualSha256.length, 64);
    process.stdout.write(JSON.stringify({ok:true,verified:['script source contract','source SHA mismatch rejection','script-only route allowlist','Mac relay source entrypoint queue dispatch','source-aware worker prompt','N01 worker receipt','provider gate preserved']}) + '\n');
  } finally {
    await fsp.rm(tempRoot, {recursive:true,force:true});
  }
}

main().catch(error => {
  process.stderr.write(error.stack + '\n');
  process.exitCode = 1;
});
