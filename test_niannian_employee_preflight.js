'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const preflightModule = require('./bridge/niannian_employee_preflight');
const relay = require('./bridge/niannian_mac_worker_relay');

const jobId = 'web_nn-preflight-1234567890';
const sourceSha256 = 'a'.repeat(64);

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive:true });
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function makeTask(overrides = {}) {
  return {
    job_id:jobId,
    source_video:{exact_path:'/tmp/source.mp4',sha256:sourceSha256},
    runtime_profile:'mac-video-analysis-v1',
    required_router:'mx-shortdrama-00-router',
    allowed_skill_routes:['mx-shortdrama-00-router','mx-shortdrama-01-frame-extract'],
    analysis_authorization:{
      event_id:'step01-1234567890abcdef12345678',
      source_sha256:sourceSha256,
      allowed_scope:'step01_evidence_only'
    },
    ...overrides
  };
}

async function createSkills(homeDir) {
  for (const name of ['mx-shortdrama-00-router','mx-shortdrama-01-frame-extract']) {
    const skillPath = path.join(homeDir, '.codex', 'skills', name, 'SKILL.md');
    await fsp.mkdir(path.dirname(skillPath), { recursive:true });
    await fsp.writeFile(skillPath, '# fixture\n');
  }
}

function successfulProbe(command, args) {
  if (command === 'python3' && args.join(' ').includes('sys.executable')) return Promise.resolve({ok:true,stdout:'/fixture/python3'});
  return Promise.resolve({ok:true,stdout:'/fixture/' + command});
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-employee-preflight-'));
  const sourceRoot = path.resolve(__dirname);
  try {
    const homeDir = path.join(tempRoot, 'home');
    const readyRoot = path.join(tempRoot, 'ready-job');
    await createSkills(homeDir);
    await fsp.mkdir(readyRoot, { recursive:true });
    await writeJson(path.join(readyRoot, 'task.json'), makeTask());
    const ready = await preflightModule.runEmployeePreflight({
      sourceRoot, jobRoot:readyRoot, homeDir, baseEnv:{PATH:'/usr/bin'}, runCommand:successfulProbe
    });
    assert.equal(ready.ready, true);
    assert.equal(ready.classification, null);
    assert.deepEqual(ready.env.PATH.split(path.delimiter).slice(0, 4), [
      path.resolve(homeDir, '.local', 'bin'),
      path.resolve(homeDir, 'AI-Brain', 'runtime', 'step01-python312', 'bin'),
      path.resolve(homeDir, 'AI-Brain', 'runtime', 'step01-python', 'bin'),
      path.resolve(homeDir, 'AI-Brain', 'tools', 'ffmpeg-runtime')
    ]);
    assert.equal(ready.resolved.codex, '/fixture/codex');
    assert.equal(ready.resolved.python3, '/fixture/python3');
    const registry = JSON.parse(await fsp.readFile(path.join(sourceRoot, 'bridge', 'skill_registry.json'), 'utf8'));
    assert.equal(preflightModule.skillExecutionAllowed(registry, 'mx-shortdrama-01-frame-extract', 'source_video', 'analysis', 'mac-video-analysis-v1'), true);
    assert.equal(preflightModule.skillExecutionAllowed(registry, 'mimo-8001-video-channel', 'source_script', 'provider_submit', 'mac-n06-mimo-preflight-v1'), false);

    const missingBinaryRoot = path.join(tempRoot, 'missing-binary-job');
    await fsp.mkdir(missingBinaryRoot, { recursive:true });
    await writeJson(path.join(missingBinaryRoot, 'task.json'), makeTask());
    const missingBinary = await preflightModule.runEmployeePreflight({
      sourceRoot, jobRoot:missingBinaryRoot, homeDir, baseEnv:{PATH:'/usr/bin'},
      runCommand:async (command, args) => command === 'ffmpeg' ? {ok:false,error:'ENOENT'} : successfulProbe(command, args)
    });
    assert.equal(missingBinary.ready, false);
    assert.equal(missingBinary.classification, 'resource');
    assert.deepEqual(missingBinary.missing, ['ffmpeg']);

    const missingModuleRoot = path.join(tempRoot, 'missing-module-job');
    await fsp.mkdir(missingModuleRoot, { recursive:true });
    await writeJson(path.join(missingModuleRoot, 'task.json'), makeTask());
    const missingModule = await preflightModule.runEmployeePreflight({
      sourceRoot, jobRoot:missingModuleRoot, homeDir, baseEnv:{PATH:'/usr/bin'},
      runCommand:async (command, args) => command === 'python3' && args.join(' ').includes('import cv2')
        ? {ok:false,code:1} : successfulProbe(command, args)
    });
    assert.equal(missingModule.ready, false);
    assert.deepEqual(missingModule.missing, ['python_module:cv2']);

    const strictRoot = path.join(tempRoot, 'strict-job');
    await fsp.mkdir(strictRoot, { recursive:true });
    await writeJson(path.join(strictRoot, 'task.json'), makeTask({runtime_profile:'mac-step01-strict-evidence-v1'}));
    const capabilityPath = path.join(homeDir, '.config', 'ai-brain', 'runtime_capability_status.json');
    await writeJson(capabilityPath, {
      schema_version:'niannian_runtime_capability_status_v1',
      capabilities:{
        'credential:mimo_asr':{status:'ready',checked_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),evidence:{method:'credential_health_probe',summary:'Redacted Mimo health check passed.'}},
        'credential:paddle_ocr':{status:'ready',checked_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString(),evidence:{method:'credential_health_probe',summary:'Redacted OCR health check passed.'}},
        'runtime:transnetv2':{status:'ready',checked_at:new Date().toISOString(),evidence:{method:'runtime_self_test',summary:'TransNet runtime self-test passed.'}},
        'runtime:hq':{status:'ready',checked_at:new Date().toISOString(),evidence:{method:'runtime_self_test',summary:'HQ runtime self-test passed.'}},
        'runtime:forced_aligner':{status:'ready',checked_at:new Date().toISOString(),evidence:{method:'runtime_self_test',summary:'Forced aligner runtime self-test passed.'}}
      }
    });
    const strictReady = await preflightModule.runEmployeePreflight({sourceRoot,jobRoot:strictRoot,homeDir,runCommand:successfulProbe});
    assert.equal(strictReady.ready, true);
    const strictStatus = JSON.parse(await fsp.readFile(capabilityPath, 'utf8'));
    strictStatus.capabilities['runtime:hq'].evidence = null;
    await writeJson(capabilityPath, strictStatus);
    const evidenceBlocked = await preflightModule.runEmployeePreflight({sourceRoot,jobRoot:strictRoot,homeDir,runCommand:successfulProbe});
    assert(evidenceBlocked.missing.includes('runtime:hq'));
    strictStatus.capabilities['runtime:hq'].evidence = {method:'runtime_self_test',summary:'HQ runtime self-test passed.'};
    strictStatus.capabilities['runtime:forced_aligner'].status = 'missing';
    await writeJson(capabilityPath, strictStatus);
    const strictBlocked = await preflightModule.runEmployeePreflight({sourceRoot,jobRoot:strictRoot,homeDir,runCommand:successfulProbe});
    assert.equal(strictBlocked.ready, false);
    assert(strictBlocked.missing.includes('runtime:forced_aligner'));
    strictStatus.capabilities['runtime:forced_aligner'] = {status:'ready',checked_at:new Date().toISOString(),evidence:{method:'runtime_self_test',summary:'Forced aligner runtime self-test passed.'}};
    strictStatus.capabilities['credential:mimo_asr'].expires_at = new Date(Date.now()-1000).toISOString();
    await writeJson(capabilityPath, strictStatus);
    const expiredCredential = await preflightModule.runEmployeePreflight({sourceRoot,jobRoot:strictRoot,homeDir,runCommand:successfulProbe});
    assert.equal(expiredCredential.missing.includes('credential:mimo_asr'), false);
    assert.equal(expiredCredential.resolved['capability:credential:mimo_asr'].persistent_credential, true);

    const contractRoot = path.join(tempRoot, 'contract-job');
    await fsp.mkdir(contractRoot, { recursive:true });
    const badTask = makeTask({analysis_authorization:{
      event_id:'step01-1234567890abcdef12345678', source_sha256:'b'.repeat(64), allowed_scope:'step01_evidence_only'
    }});
    await writeJson(path.join(contractRoot, 'task.json'), badTask);
    let contractProbeCount = 0;
    const contract = await preflightModule.runEmployeePreflight({
      sourceRoot, jobRoot:contractRoot, homeDir, runCommand:async () => { contractProbeCount += 1; return {ok:true}; }
    });
    assert.equal(contract.ready, false);
    assert.equal(contract.classification, 'contract');
    assert(contract.contract_issues.includes('authorization_source_sha256_mismatch'));
    assert.equal(contractProbeCount, 0);

    const blockedRoot = path.join(tempRoot, 'blocked-job');
    await fsp.mkdir(blockedRoot, { recursive:true });
    await writeJson(path.join(blockedRoot, 'artifact_ledger.json'), {job_id:jobId,artifacts:[]});
    await writeJson(path.join(blockedRoot, 'gate_dashboard.json'), {job_id:jobId,gates:{}});
    const blocked = await relay.writePreflightBlockedArtifacts(blockedRoot, makeTask(), missingBinary);
    assert.equal(blocked.productionStatus, 'blocked_resource');
    for (const relative of relay.RETURN_FILES) await fsp.access(path.join(blockedRoot, relative));
    const receipt = JSON.parse(await fsp.readFile(path.join(blockedRoot, 'employee_worker_receipt.json'), 'utf8'));
    assert.equal(receipt.production_status, 'blocked_resource');
    assert.equal(receipt.worker_started, false);
    assert.equal(receipt.blocker.retryable, true);
    assert.equal(receipt.blocker.automatic_retry_allowed, false);
    assert.equal(receipt.provider_submission_requested, false);
    assert.equal(receipt.package_send_requested, false);
    const policyTask = makeTask({analysis_authorization:{
      event_id:'step01-1234567890abcdef12345678',source_sha256:sourceSha256,allowed_scope:'step01_evidence_only',
      approval_mode:'policy_auto',approval_policy_id:'niannian_low_risk_analysis_v1',risk_class:'low',auto_approved:true,
      provider_submission_requested:false,package_send_requested:false
    }});
    await relay.writePreflightBlockedArtifacts(blockedRoot, policyTask, missingBinary);
    const policyReceipt = JSON.parse(await fsp.readFile(path.join(blockedRoot, 'employee_worker_receipt.json'), 'utf8'));
    assert.equal(policyReceipt.blocker.automatic_retry_allowed, true);
    const packageRoot = await relay.buildReturnPackage({outgoingRoot:path.join(tempRoot, 'outgoing')}, blockedRoot, {
      manifest:{job_id:jobId,source_sha256:sourceSha256}
    });
    const returnManifest = JSON.parse(await fsp.readFile(path.join(packageRoot, 'return_manifest.json'), 'utf8'));
    assert.equal(returnManifest.files.length, relay.RETURN_FILES.length);
    assert.deepEqual(returnManifest.files.map(item => item.path).sort(), [...relay.RETURN_FILES].sort());

    process.stdout.write(JSON.stringify({ok:true,verified:[
      'ready runtime profile','runtime PATH composition','missing binary classification',
      'missing Python module classification','authorization mismatch contract classification',
      'strict capability registry','missing strict capability classification',
      'persistent analysis credential ignores proof expiry while dispatch still requires a fresh capability receipt',
      'no probes after contract failure','fail-fast typed receipt','nine-file return package with preflight evidence'
    ]}) + '\n');
  } finally {
    await fsp.rm(tempRoot, { recursive:true, force:true });
  }
}

main().catch(error => {
  process.stderr.write(error.stack + '\n');
  process.exitCode = 1;
});
