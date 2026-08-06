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

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-controller-flow-'));
  const dataRoot = path.join(tempRoot, 'data');
  const workspace = path.join(tempRoot, 'workspace');
  const stateRoot = path.join(tempRoot, 'bridge-state');
  const productionIndex = path.join(workspace, '06_AUTOMATION', 'production_jobs.index.json');
  const port = 19000 + crypto.randomInt(1000);
  const baseUrl = 'http://127.0.0.1:' + port;
  const bridgeToken = crypto.randomBytes(48).toString('hex');
  const bridgeTokenHash = crypto.createHash('sha256').update(bridgeToken).digest('hex');
  await writeJson(productionIndex, {
    schema_version:1,
    index_type:'zhuanhui_production_jobs',
    updated_at:new Date().toISOString(),
    workspace_root:workspace,
    job_roots:{codex_direct:path.join(workspace, '06_AUTOMATION', 'direct_jobs')},
    jobs:[]
  });

  const server = spawn(process.execPath, [path.join(projectRoot, 'server.js')], {
    cwd:projectRoot,
    env:{
      ...process.env,
      PORT:String(port),
      DATA_DIR:dataRoot,
      BRIDGE_TOKEN_HASH:bridgeTokenHash,
      BRIDGE_LEASE_MS:'120000',
      NIANNIAN_MEDIA_PREFLIGHT:'off'
    },
    stdio:['ignore','pipe','pipe']
  });
  let serverStderr = '';
  server.stderr.on('data', chunk => { serverStderr += chunk; });

  try {
    await waitForHealth(baseUrl);
    const email = 'controller-test-' + Date.now() + '@example.com';
    const register = await fetchJson(baseUrl + '/api/auth/register', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password:'correct-horse-battery-staple'})
    });
    const cookie = String(register.response.headers.get('set-cookie') || '').split(';')[0];
    assert(cookie.includes('niannian_session='));

    const form = new FormData();
    form.set('name', '控制器状态回写测试');
    form.set('rightsConfirmed', 'on');
    form.set('sourceVideo', new Blob([Buffer.from('deterministic-video-fixture')], {type:'video/mp4'}), 'fixture.mp4');
    const created = await fetchJson(baseUrl + '/api/projects', {
      method:'POST',
      headers:{Cookie:cookie},
      body:form
    });
    const remoteId = created.payload.project.id;
    assert.equal(created.payload.project.runtime.productionStatus, 'queued');

    let unauthorized = null;
    try {
      await fetchJson(baseUrl + '/api/controller/jobs/claim', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({controllerId:'test-controller'})
      });
    } catch (error) {
      unauthorized = error;
    }
    assert.equal(unauthorized && unauthorized.status, 401);

    const bridgeEnv = {
      ZHUANHUI_WORKSPACE:workspace,
      NIANNIAN_PRODUCTION_INDEX:productionIndex,
      NIANNIAN_BRIDGE_STATE_DIR:stateRoot,
      NIANNIAN_BRIDGE_TOKEN:bridgeToken,
      NIANNIAN_BASE_URL:baseUrl,
      NIANNIAN_CONTROLLER_ID:'test-controller'
    };
    const bridgeScript = path.join(projectRoot, 'bridge', 'niannian_controller_bridge.js');
    await runNode(bridgeScript, bridgeEnv);

    const state = JSON.parse(await fsp.readFile(path.join(stateRoot, 'bridge_state.json'), 'utf8'));
    const record = state.jobs[remoteId];
    assert(record);
    const localRoot = record.root;
    for (const required of ['task.json','rights_authority.json','status.json','checkpoint.json','result_manifest.json','artifact_ledger.json','gate_dashboard.json','gate_dashboard.md','worker_report.md','transaction_intent.json']) {
      await fsp.access(path.join(localRoot, required));
    }
    const task = JSON.parse(await fsp.readFile(path.join(localRoot, 'task.json'), 'utf8'));
    assert.equal(task.required_router, 'mx-shortdrama-00-router');
    assert.equal(task.runtime_profile, 'mac-step01-strict-evidence-v1');
    assert.match(task.rights_authority.sha256,/^[a-f0-9]{64}$/);
    assert.equal(task.authority_bindings.rights_authority_sha256,task.rights_authority.sha256);
    assert.equal(task.constraints.provider_submit_requires_authorization, true);
    const index = JSON.parse(await fsp.readFile(productionIndex, 'utf8'));
    assert(index.jobs.some(item => item.job_id === record.localJobId && item.source_entrypoint === 'niannian_ai_web'));

    let projects = await fetchJson(baseUrl + '/api/projects', {headers:{Cookie:cookie}});
    let project = projects.payload.projects.find(item => item.id === remoteId);
    assert.equal(project.dispatch.status, 'mirrored');
    assert.equal(project.runtime.productionStatus, 'prepared');
    assert.equal(project.runtime.verifiedArtifactCount, 2);
    assert.equal(project.dispatch.leaseId, undefined);

    let directStep01Completion = null;
    try {
      await fetchJson(baseUrl + '/api/controller/jobs/' + encodeURIComponent(remoteId) + '/status', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          Authorization:'Bearer ' + bridgeToken,
          'X-NianNian-Controller-Id':'test-controller',
          'X-NianNian-Lease-Id':record.leaseId
        },
        body:JSON.stringify({
          controllerId:'test-controller',
          leaseId:record.leaseId,
          productionStatus:'step01_verified',
          currentNode:'Step01',
          earliestIncompleteNode:'Step02'
        })
      });
    } catch (error) {
      directStep01Completion = error;
    }
    assert.equal(directStep01Completion && directStep01Completion.status, 409);
    assert.equal(directStep01Completion && directStep01Completion.payload.code, 'STEP01_REDUCER_FACTS_PACKAGE_REQUIRED');

    await writeJson(path.join(localRoot, 'status.json'), {
      job_id:record.localJobId,status:'blocked_resource',current_node:'Step01',
      blocker:{class:'resource',code:'strict_runtime_missing',retryable:true},next_action:'restore strict runtime',updated_at:new Date().toISOString()
    });
    await writeJson(path.join(localRoot, 'employee_dispatch.json'), {
      job_id:record.localJobId,dispatch_id:'cw-stale-running',status:'running',worker_status:'starting',mode:'execute',updated_at:new Date().toISOString()
    });
    await writeJson(path.join(localRoot, 'employee_worker_receipt.json'), {
      job_id:record.localJobId,dispatch_id:'cw-stale-running',production_status:'blocked_resource',worker_status:'blocked',
      provider_submission_requested:false,package_send_requested:false,written_at:new Date().toISOString()
    });
    await runNode(bridgeScript, bridgeEnv);
    projects = await fetchJson(baseUrl + '/api/projects', {headers:{Cookie:cookie}});
    project = projects.payload.projects.find(item => item.id === remoteId);
    assert.equal(project.runtime.productionStatus, 'blocked_resource');
    assert.equal(project.runtime.worker.status, 'blocked');
    assert.equal(project.runtime.step01.tiers.strict.status, 'blocked');
    assert.equal(project.analysis.status, 'blocked_resource');
    await fsp.unlink(path.join(localRoot, 'employee_worker_receipt.json'));
    await fsp.unlink(path.join(localRoot, 'employee_dispatch.json'));

    const updatedAt = new Date().toISOString();
    await writeJson(path.join(localRoot, 'status.json'), {
      job_id:record.localJobId,
      status:'running_step02',
      current_node:'Step02',
      earliest_incomplete_node:'Step02',
      next_skill:'mx-shortdrama-02-source-timeline',
      blocker:null,
      next_action:'继续构建源片事实账本',
      updated_at:updatedAt
    });
    await writeJson(path.join(localRoot, 'checkpoint.json'), {
      job_id:record.localJobId,
      status:'running_step02',
      current_step:'Step02',
      completed:['Step01 verified'],
      blockers:[],
      next_skill:'mx-shortdrama-02-source-timeline',
      next_action:'继续构建源片事实账本',
      updated_at:updatedAt
    });
    await writeJson(path.join(localRoot, 'gate_dashboard.json'), {
      job_id:record.localJobId,
      overall_status:'running_step02',
      current_node:'Step02',
      earliest_incomplete_node:'Step02',
      next_skill:'mx-shortdrama-02-source-timeline',
      gates:{
        Step01:{status:'verified'},
        Step02:{status:'running'},
        Step04:{status:'blocked_upstream'},
        Step05:{status:'blocked_upstream'},
        provider_submit:{status:'blocked_cost_authorization'}
      },
      blocker:null,
      next_action:'继续构建源片事实账本',
      updated_at:updatedAt
    });
    const ledger = JSON.parse(await fsp.readFile(path.join(localRoot, 'artifact_ledger.json'), 'utf8'));
    ledger.artifacts.push({
      artifact_id:'step01_evidence',
      node_id:'Step01',
      exact_path:path.join(localRoot, 'deliverables', 'step01_evidence.json'),
      sha256:'0'.repeat(64),
      status:'verified'
    });
    await writeJson(path.join(localRoot, 'artifact_ledger.json'), ledger);

    await runNode(bridgeScript, bridgeEnv);
    projects = await fetchJson(baseUrl + '/api/projects', {headers:{Cookie:cookie}});
    project = projects.payload.projects.find(item => item.id === remoteId);
    assert.equal(project.runtime.productionStatus, 'running_step02');
    assert.equal(project.runtime.earliestIncompleteNode, 'Step02');
    assert.equal(project.runtime.nextSkill, 'mx-shortdrama-02-source-timeline');
    assert.equal(project.runtime.artifactCount, 3);
    assert.equal(project.runtime.verifiedArtifactCount, 3);
    assert.equal(project.pipeline.find(item => item.id === 'Step01').status, 'completed');
    assert.equal(project.pipeline.find(item => item.id === 'Step02').status, 'running');
    assert(project.runtime.lastHeartbeat);

    await writeJson(path.join(localRoot, 'status.json'), {
      job_id:record.localJobId,
      status:'completed',
      current_node:'qa',
      earliest_incomplete_node:'Step05',
      next_skill:'mx-shortdrama-05-asset-images',
      blocker:null,
      next_action:'等待正式 QA 与用户可见验收',
      updated_at:new Date().toISOString()
    });
    const bridgeModule = require('./bridge/niannian_controller_bridge');
    assert.throws(() => bridgeModule.normalizeStatus('completed'), /CONTROLLER_GENERIC_COMPLETED_REQUIRES_TYPED_STATUS/);
    await runNode(bridgeScript, bridgeEnv);
    projects = await fetchJson(baseUrl + '/api/projects', {headers:{Cookie:cookie}});
    project = projects.payload.projects.find(item => item.id === remoteId);
    assert.notEqual(project.runtime.productionStatus, 'qa_running');
    assert.notEqual(project.runtime.productionStatus, 'step02_accepted');
    await writeJson(path.join(localRoot, 'status.json'), {
      job_id:record.localJobId,
      status:'step02_return_ready',
      current_node:'Step02',
      earliest_incomplete_node:'Step02',
      next_skill:'mx-shortdrama-02-source-timeline',
      blocker:null,
      next_action:'等待 server-side Step02 reducer 验证 candidate return',
      updated_at:new Date().toISOString()
    });
    await runNode(bridgeScript, bridgeEnv);
    projects = await fetchJson(baseUrl + '/api/projects', {headers:{Cookie:cookie}});
    project = projects.payload.projects.find(item => item.id === remoteId);
    assert.equal(project.runtime.productionStatus, 'step02_return_ready');
    assert.notEqual(project.runtime.productionStatus, 'step02_accepted');

    process.stdout.write(JSON.stringify({
      ok:true,
      remoteId,
      localJobId:record.localJobId,
      verified:['auth','claim lease','source hash','durable job contract','production index','receipt reducer overrides stale dispatch','three-tier Step01 projection','Step01 completion requires the verified source-facts reducer','status writeback','pipeline projection','heartbeat','generic completed cannot map to qa_running or Step02 accepted','typed step02 return-ready allowed without acceptance']
    }) + '\n');
  } finally {
    server.kill();
    await delay(100);
    if (server.exitCode === null) server.kill('SIGKILL');
    await fsp.rm(tempRoot, { recursive:true, force:true });
    if (serverStderr) process.stderr.write(serverStderr);
  }
}

main().catch(error => {
  process.stderr.write(error.stack + '\n');
  process.exitCode = 1;
});
