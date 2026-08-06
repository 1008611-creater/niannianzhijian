'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const projectRoot = __dirname;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive:true });
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || ('HTTP ' + response.status));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return {response,payload};
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const result = await fetchJson(baseUrl + '/api/health');
      if (result.payload.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('server_health_timeout');
}

function runNode(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd:projectRoot,
      env:{...process.env,...env},
      stdio:['ignore','pipe','pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) return resolve({stdout,stderr});
      reject(new Error('child_failed_' + code + ': ' + stderr + stdout));
    });
  });
}

async function waitForFile(filePath) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const exists = await fsp.access(filePath).then(() => true, () => false);
    if (exists) return;
    await delay(100);
  }
  throw new Error('file_timeout_' + filePath);
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-codex-worker-'));
  const dataRoot = path.join(tempRoot, 'data');
  const workspace = path.join(tempRoot, 'workspace');
  const controllerState = path.join(tempRoot, 'controller-state');
  const workerState = path.join(tempRoot, 'worker-state');
  const productionIndex = path.join(workspace, '06_AUTOMATION', 'production_jobs.index.json');
  const port = 21000 + crypto.randomInt(1000);
  const baseUrl = 'http://127.0.0.1:' + port;
  const bridgeToken = crypto.randomBytes(48).toString('hex');
  const bridgeTokenHash = crypto.createHash('sha256').update(bridgeToken).digest('hex');
  const fakeCodexPath = path.join(tempRoot, 'fake_codex_worker.js');
  await writeJson(productionIndex, {
    schema_version:1,
    index_type:'zhuanhui_production_jobs',
    updated_at:new Date().toISOString(),
    workspace_root:workspace,
    job_roots:{codex_direct:path.join(workspace, '06_AUTOMATION', 'direct_jobs')},
    jobs:[]
  });
  await fsp.writeFile(fakeCodexPath, [
    "'use strict';",
    "const fs = require('fs');",
    "const path = require('path');",
    "const dispatch = JSON.parse(fs.readFileSync(process.env.NIANNIAN_WORKER_DISPATCH_PATH, 'utf8'));",
    "const statusPath = path.join(process.env.NIANNIAN_WORKER_JOB_ROOT, 'status.json');",
    "const checkpointPath = path.join(process.env.NIANNIAN_WORKER_JOB_ROOT, 'checkpoint.json');",
    "const dashboardPath = path.join(process.env.NIANNIAN_WORKER_JOB_ROOT, 'gate_dashboard.json');",
    "const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));",
    "const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));",
    "const dashboard = JSON.parse(fs.readFileSync(dashboardPath, 'utf8'));",
    "const updatedAt = new Date().toISOString();",
    "status.status = 'running_step01'; status.current_node = 'Step01'; status.next_skill = 'mx-shortdrama-01-frame-extract'; status.next_action = 'Codex worker verified the task contract and started Step01 evidence work.'; status.updated_at = updatedAt;",
    "checkpoint.status = 'running_step01'; checkpoint.current_step = 'Step01'; checkpoint.next_skill = 'mx-shortdrama-01-frame-extract'; checkpoint.next_action = status.next_action; checkpoint.updated_at = updatedAt;",
    "dashboard.overall_status = 'running_step01'; dashboard.current_node = 'Step01'; dashboard.next_skill = 'mx-shortdrama-01-frame-extract'; dashboard.gates.Step01 = {status:'running'}; dashboard.gates.provider_submit = {status:'blocked_cost_authorization'}; dashboard.next_action = status.next_action; dashboard.updated_at = updatedAt;",
    "fs.writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\\n');",
    "fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2) + '\\n');",
    "fs.writeFileSync(dashboardPath, JSON.stringify(dashboard, null, 2) + '\\n');",
    "fs.writeFileSync(process.env.NIANNIAN_WORKER_RECEIPT_PATH, JSON.stringify({schema_version:1,job_id:dispatch.job_id,dispatch_id:dispatch.dispatch_id,production_status:'running_step01',worker_status:'active',current_node:'Step01',next_skill:'mx-shortdrama-01-frame-extract',next_action:status.next_action,provider_submission_requested:false,package_send_requested:false,updated_at:updatedAt}, null, 2) + '\\n');",
    "fs.writeFileSync(process.env.NIANNIAN_WORKER_FINAL_MESSAGE_PATH, 'Fake Codex worker completed safe Step01 intake.\\n');",
    "process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'thread-worker-test-001'}) + '\\n');"
  ].join('\n'), 'utf8');

  const server = spawn(process.execPath, [path.join(projectRoot, 'server.js')], {
    cwd:projectRoot,
    env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,BRIDGE_TOKEN_HASH:bridgeTokenHash,BRIDGE_LEASE_MS:'120000',NIANNIAN_MEDIA_PREFLIGHT:'off'},
    stdio:['ignore','pipe','pipe']
  });
  let serverStderr = '';
  server.stderr.on('data', chunk => { serverStderr += chunk; });

  try {
    await waitForHealth(baseUrl);
    const email = 'worker-test-' + Date.now() + '@example.com';
    const register = await fetchJson(baseUrl + '/api/auth/register', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'correct-horse-battery-staple'})});
    const cookie = String(register.response.headers.get('set-cookie') || '').split(';')[0];
    const form = new FormData();
    form.set('name', 'Codex 员工派单测试');
    form.set('rightsConfirmed', 'on');
    form.set('sourceVideo', new Blob([Buffer.from('worker-fixture')], {type:'video/mp4'}), 'fixture.mp4');
    const created = await fetchJson(baseUrl + '/api/projects', {method:'POST',headers:{Cookie:cookie},body:form});
    const remoteId = created.payload.project.id;

    const bridgeEnv = {
      ZHUANHUI_WORKSPACE:workspace,
      NIANNIAN_PRODUCTION_INDEX:productionIndex,
      NIANNIAN_BRIDGE_STATE_DIR:controllerState,
      NIANNIAN_BRIDGE_TOKEN:bridgeToken,
      NIANNIAN_BASE_URL:baseUrl,
      NIANNIAN_CONTROLLER_ID:'worker-test-controller'
    };
    await runNode(path.join(projectRoot, 'bridge', 'niannian_controller_bridge.js'), bridgeEnv);
    const bridgeState = JSON.parse(await fsp.readFile(path.join(controllerState, 'bridge_state.json'), 'utf8'));
    const record = bridgeState.jobs[remoteId];
    assert(record);
    const jobRoot = record.root;
    const initialTask = JSON.parse(await fsp.readFile(path.join(jobRoot, 'task.json'), 'utf8'));
    assert.equal(initialTask.constraints.codex_worker_requires_route_allowlist, true);
    assert.deepEqual(initialTask.allowed_skill_routes, ['mx-shortdrama-00-router','mx-shortdrama-01-frame-extract']);
    const routeDecision = JSON.parse(await fsp.readFile(path.join(jobRoot, 'route_decision.json'), 'utf8'));
    assert.equal(routeDecision.selected_skill, 'mx-shortdrama-01-frame-extract');
    assert.equal(routeDecision.provider_submit, 'blocked_cost_authorization');

    const queueDispatcherEnv = {
      ZHUANHUI_WORKSPACE:workspace,
      NIANNIAN_PRODUCTION_INDEX:productionIndex,
      NIANNIAN_CODEX_WORKER_STATE_DIR:workerState,
      NIANNIAN_CODEX_WORKER_MODE:'queue'
    };
    const dispatcherScript = path.join(projectRoot, 'bridge', 'niannian_codex_worker_dispatcher.js');
    await runNode(dispatcherScript, queueDispatcherEnv);
    const queuedDispatch = JSON.parse(await fsp.readFile(path.join(jobRoot, 'employee_dispatch.json'), 'utf8'));
    const queuedPrompt = await fsp.readFile(path.join(jobRoot, 'codex_worker_prompt.md'), 'utf8');
    assert.equal(queuedDispatch.status, 'queued');
    assert.equal(queuedDispatch.mode, 'queue');
    assert.match(queuedPrompt, /禁止写泛化的 `blocked`/);

    const dispatcherEnv = {
      ZHUANHUI_WORKSPACE:workspace,
      NIANNIAN_PRODUCTION_INDEX:productionIndex,
      NIANNIAN_CODEX_WORKER_STATE_DIR:workerState,
      NIANNIAN_CODEX_WORKER_MODE:'execute',
      NIANNIAN_CODEX_WORKER_COMMAND:process.execPath,
      NIANNIAN_CODEX_WORKER_COMMAND_ARGS:JSON.stringify([fakeCodexPath])
    };
    await runNode(dispatcherScript, dispatcherEnv);
    await waitForFile(path.join(jobRoot, 'employee_worker_receipt.json'));
    await delay(200);
    await runNode(dispatcherScript, dispatcherEnv);

    const dispatch = JSON.parse(await fsp.readFile(path.join(jobRoot, 'employee_dispatch.json'), 'utf8'));
    const receipt = JSON.parse(await fsp.readFile(path.join(jobRoot, 'employee_worker_receipt.json'), 'utf8'));
    assert.equal(dispatch.status, 'handoff');
    assert.equal(dispatch.mode, 'execute');
    assert.equal(dispatch.thread_id, 'thread-worker-test-001');
    assert.equal(receipt.production_status, 'running_step01');
    assert.equal(receipt.provider_submission_requested, false);
    const status = JSON.parse(await fsp.readFile(path.join(jobRoot, 'status.json'), 'utf8'));
    const dashboard = JSON.parse(await fsp.readFile(path.join(jobRoot, 'gate_dashboard.json'), 'utf8'));
    assert.equal(status.status, 'running_step01');
    assert.equal(dashboard.gates.provider_submit.status, 'blocked_cost_authorization');

    // A PowerShell wrapper can exit before its Codex child flushes the receipt.
    // Recover only the explicit missing-receipt state after the normal receipt checks pass.
    await writeJson(path.join(jobRoot, 'employee_dispatch.json'), {...dispatch,status:'blocked',worker_status:'blocked',blocker:'RECEIPT_MISSING'});
    await runNode(dispatcherScript, dispatcherEnv);
    const recoveredDispatch = JSON.parse(await fsp.readFile(path.join(jobRoot, 'employee_dispatch.json'), 'utf8'));
    assert.equal(recoveredDispatch.status, 'handoff');
    assert.equal(recoveredDispatch.blocker, 'RECEIPT_MISSING');

    await runNode(path.join(projectRoot, 'bridge', 'niannian_controller_bridge.js'), bridgeEnv);
    const projects = await fetchJson(baseUrl + '/api/projects', {headers:{Cookie:cookie}});
    const project = projects.payload.projects.find(item => item.id === remoteId);
    assert.equal(project.runtime.productionStatus, 'running_step01');
    assert.equal(project.runtime.worker.status, 'handoff');
    assert.equal(project.runtime.worker.threadId, 'thread-worker-test-001');
    assert.equal(project.runtime.gates.provider_submit.status, 'blocked_cost_authorization');

    process.stdout.write(JSON.stringify({ok:true,remoteId,localJobId:record.localJobId,verified:['website project contract','controller materialization','route decision contract','router allowlist','typed blocked receipt guidance','queue-to-execute mode promotion','isolated worker process','thread id capture','worker receipt validation','provider authorization gate','website worker status writeback']}) + '\n');
  } finally {
    server.kill();
    await delay(100);
    if (server.exitCode === null) server.kill('SIGKILL');
    await fsp.rm(tempRoot, {recursive:true,force:true});
    if (serverStderr) process.stderr.write(serverStderr);
  }
}

main().catch(error => {
  process.stderr.write(error.stack + '\n');
  process.exitCode = 1;
});
