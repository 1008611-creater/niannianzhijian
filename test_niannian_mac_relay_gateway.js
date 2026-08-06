'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const gateway = require('./bridge/niannian_mac_relay_gateway');

const jobId = 'web_nn-1234567890';

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive:true });
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function writeFile(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive:true });
  await fsp.writeFile(filePath, value);
}

async function writeReturnManifest(root, sourceSha256, files = gateway.RETURN_FILES) {
  const manifestFiles = [];
  for (const relative of files) {
    const evidence = await gateway.sha256File(path.join(root, relative));
    manifestFiles.push({ path:relative, bytes:evidence.bytes, sha256:evidence.sha256 });
  }
  await writeJson(path.join(root, 'return_manifest.json'), {
    schema_version:'niannian_mac_return_v1',
    job_id:jobId,
    source_sha256:sourceSha256,
    files:manifestFiles
  });
}

function safeDashboard() {
  return {
    job_id:jobId,
    overall_status:'running_step01',
    gates:{
      Step01:{status:'running'},
      provider_submit:{status:'blocked_cost_authorization'},
      package_send:{status:'blocked_controller_authorization'}
    }
  };
}

async function writeSafeReturn(root, sourceSha256) {
  const dispatchId = 'cw-relay-test-001';
  await writeJson(path.join(root, 'status.json'), {job_id:jobId,status:'running_step01',current_node:'Step01'});
  await writeJson(path.join(root, 'checkpoint.json'), {job_id:jobId,status:'running_step01',current_step:'Step01'});
  await writeJson(path.join(root, 'gate_dashboard.json'), safeDashboard());
  await writeJson(path.join(root, 'artifact_ledger.json'), {job_id:jobId,artifacts:[]});
  await writeJson(path.join(root, 'result_manifest.json'), {job_id:jobId,status:'running_step01',packaged:false,transport_success:false,user_visible_acceptance:false,artifacts:[]});
  await writeFile(path.join(root, 'worker_report.md'), '# Worker Report\n\n- Safe Step01 progress only.\n');
  await writeJson(path.join(root, 'employee_dispatch.json'), {job_id:jobId,dispatch_id:dispatchId,status:'handoff'});
  await writeJson(path.join(root, 'employee_worker_receipt.json'), {
    job_id:jobId,
    dispatch_id:dispatchId,
    production_status:'running_step01',
    worker_status:'active',
    provider_submission_requested:false,
    package_send_requested:false
  });
  await writeJson(path.join(root, 'employee_preflight.json'), {
    schema_version:'niannian_employee_preflight_v1',job_id:jobId,ready:true,
    runtime_profile:'mac-step01-strict-evidence-v1',classification:null,contract_issues:[],missing:[],resolved:{},checked_at:new Date().toISOString()
  });
  await writeReturnManifest(root, sourceSha256);
}

async function writeStrictStep01Return(root, sourceSha256, inputRoot) {
  await writeSafeReturn(root, sourceSha256);
  const dispatchId = 'cw-relay-test-001';
  const evidenceManifest = path.join(inputRoot, 'step01_evidence_manifest.json');
  const validationReport = path.join(inputRoot, 'step01_validation_report.json');
  await writeJson(evidenceManifest, {schema_version:'step01_evidence_v1',source_sha256:sourceSha256,frames:[]});
  await writeJson(validationReport, {schema_version:'step01_validation_v1',passed:true});
  const evidenceFiles = [
    {artifact_id:'step01_evidence_manifest',source:evidenceManifest},
    {artifact_id:'step01_validation_report',source:validationReport}
  ];
  const JSZip = require('jszip');
  const zip = new JSZip();
  let totalBytes = 0;
  const bundleFiles = [];
  for (const item of evidenceFiles) {
    const evidence = await gateway.sha256File(item.source);
    const archivePath = 'evidence/' + evidence.sha256 + '.json';
    totalBytes += evidence.bytes;
    zip.file(archivePath, await fsp.readFile(item.source));
    bundleFiles.push({artifact_id:item.artifact_id,archive_path:archivePath,...evidence});
  }
  await writeJson(path.join(root, 'artifact_ledger.json'), {
    job_id:jobId,
    artifacts:bundleFiles.map(item => ({artifact_id:item.artifact_id,node_id:'Step01',status:'verified',exact_path:'C:\\mac\\' + item.artifact_id + '.json',sha256:item.sha256,bytes:item.bytes}))
  });
  await writeJson(path.join(root, 'status.json'), {job_id:jobId,status:'step01_verified',current_node:'Step01'});
  await writeJson(path.join(root, 'checkpoint.json'), {job_id:jobId,status:'step01_verified',current_step:'Step01'});
  await writeJson(path.join(root, 'result_manifest.json'), {job_id:jobId,status:'step01_verified',packaged:false,transport_success:false,user_visible_acceptance:false,artifacts:[]});
  await writeJson(path.join(root, 'employee_worker_receipt.json'), {
    job_id:jobId,dispatch_id:dispatchId,production_status:'step01_verified',worker_status:'completed',provider_submission_requested:false,package_send_requested:false
  });
  await writeJson(path.join(root, 'step01_evidence_bundle_manifest.json'), {
    schema_version:'niannian_step01_evidence_bundle_v1',job_id:jobId,source_sha256:sourceSha256,
    receipt_dispatch_id:dispatchId,files:bundleFiles,total_bytes:totalBytes
  });
  await writeFile(path.join(root, 'step01_evidence_bundle.zip'), await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
  await writeReturnManifest(root, sourceSha256, gateway.RETURN_FILES.concat(gateway.STEP01_EVIDENCE_BUNDLE_FILES));
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || ('HTTP ' + response.status));
  return {response, payload};
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetchJson(baseUrl + '/api/health')).payload.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('gateway_test_server_health_timeout');
}

function runNode(script, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script].concat(args), {cwd:__dirname,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve({stdout,stderr}) : reject(new Error('gateway_cli_failed_' + code + ': ' + stderr + stdout)));
  });
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-mac-relay-gateway-'));
  try {
    const jobRoot = path.join(tempRoot, 'job');
    const sourcePath = path.join(jobRoot, 'source', 'source.mp4');
    await writeFile(sourcePath, Buffer.from('deterministic-relay-source'));
    const source = await gateway.sha256File(sourcePath);
    const task = {
      job_id:jobId,
      remote_job_id:'NN-RELAY-1234567890',
      source_video:{exact_path:sourcePath,sha256:source.sha256},
      constraints:{provider_submit_requires_authorization:true,package_send_requires_authorization:true}
    };
    const files = {
      'artifact_ledger.json':{job_id:jobId,artifacts:[]},
      'assignments.json':{job_id:jobId},
      'checkpoint.json':{job_id:jobId,status:'prepared'},
      'gate_dashboard.json':{job_id:jobId,gates:{provider_submit:{status:'blocked_cost_authorization'},package_send:{status:'blocked_controller_authorization'}}},
      'result_manifest.json':{job_id:jobId,status:'prepared',packaged:false,transport_success:false,user_visible_acceptance:false},
      'route_decision.json':{job_id:jobId},
      'status.json':{job_id:jobId,status:'prepared'},
      'task.json':task,
      'transaction_intent.json':{job_id:jobId,cost_gate:'controller_authorization_required'}
    };
    for (const [relative, value] of Object.entries(files)) await writeJson(path.join(jobRoot, relative), value);
    await writeFile(path.join(jobRoot, 'codex_prompt.md'), '# Relay contract\n');
    await writeFile(path.join(jobRoot, 'gate_dashboard.md'), '# Gates\n');
    await writeFile(path.join(jobRoot, 'worker_report.md'), '# Worker Report\n');

    const config = gateway.relayConfig({
      runtimeRoot:path.join(tempRoot, 'runtime'),
      exportRoot:path.join(tempRoot, 'relay'),
      workspace:path.join(tempRoot, 'workspace'),
      stateRoot:path.join(tempRoot, 'state'),
      baseUrl:'http://127.0.0.1:4188'
    });
    const exported = await gateway.exportJob({localJobId:jobId,remoteJobId:task.remote_job_id,root:jobRoot,sourceSha256:source.sha256}, config);
    assert.equal(exported.manifest.source_sha256, source.sha256);
    assert.equal(exported.manifest.files.length, gateway.EXPORT_CONTRACT_FILES.length + 2);
    assert.equal((await gateway.sha256File(path.join(exported.exportPath, 'source', 'source.mp4'))).sha256, source.sha256);
    await fsp.access(path.join(exported.exportPath, 'transport_manifest.json'));

    const scriptJobId = 'web_ns-script-gateway-12345';
    const scriptJobRoot = path.join(tempRoot, 'script-job');
    const scriptSourcePath = path.join(scriptJobRoot, 'source', 'source_text.txt');
    await writeFile(scriptSourcePath, '第一章：苏晚在雨夜离开民政局，顾言撑伞等她。\n');
    const scriptSource = await gateway.sha256File(scriptSourcePath);
    const scriptTask = {
      job_id:scriptJobId,
      remote_job_id:'NS-RELAY-SCRIPT-1234567890',
      source_script:{exact_path:scriptSourcePath,sha256:scriptSource.sha256,type:'extracted_novel_text'},
      constraints:{provider_submit_requires_authorization:true,package_send_requires_authorization:true}
    };
    const scriptFiles = {
      'artifact_ledger.json':{job_id:scriptJobId,artifacts:[]},
      'assignments.json':{job_id:scriptJobId},
      'checkpoint.json':{job_id:scriptJobId,status:'queued'},
      'gate_dashboard.json':{job_id:scriptJobId,gates:{provider_submit:{status:'blocked_cost_authorization'},package_send:{status:'blocked_controller_authorization'}}},
      'result_manifest.json':{job_id:scriptJobId,status:'queued',packaged:false,transport_success:false,user_visible_acceptance:false},
      'route_decision.json':{job_id:scriptJobId},
      'status.json':{job_id:scriptJobId,status:'queued'},
      'task.json':scriptTask,
      'transaction_intent.json':{job_id:scriptJobId,cost_gate:'controller_authorization_required'}
    };
    for (const [relative, value] of Object.entries(scriptFiles)) await writeJson(path.join(scriptJobRoot, relative), value);
    await writeFile(path.join(scriptJobRoot, 'codex_prompt.md'), '# Script relay contract\n');
    await writeFile(path.join(scriptJobRoot, 'gate_dashboard.md'), '# Gates\n');
    await writeFile(path.join(scriptJobRoot, 'worker_report.md'), '# Worker Report\n');
    const scriptExported = await gateway.exportJob({localJobId:scriptJobId,remoteJobId:scriptTask.remote_job_id,root:scriptJobRoot,sourceSha256:scriptSource.sha256}, config);
    assert.equal(scriptExported.manifest.source_kind, 'source_script');
    assert.equal(scriptExported.manifest.source_path, 'source/source_text.txt');
    assert.equal((await gateway.sha256File(path.join(scriptExported.exportPath, 'source', 'source_text.txt'))).sha256, scriptSource.sha256);

    const returnRoot = path.join(tempRoot, 'return');
    await writeSafeReturn(returnRoot, source.sha256);
    const valid = await gateway.validateReturnPackage(returnRoot, jobId, source.sha256);
    assert.equal(valid.receipt.provider_submission_requested, false);
    assert.equal(valid.status.status, 'running_step01');

    const strictReturnRoot = path.join(tempRoot, 'strict-return');
    const strictInputRoot = path.join(tempRoot, 'strict-input');
    await writeStrictStep01Return(strictReturnRoot, source.sha256, strictInputRoot);
    const strictValid = await gateway.validateReturnPackage(strictReturnRoot, jobId, source.sha256);
    assert.equal(strictValid.bundle.files.length, 2);
    const strictStagingRoot = path.join(tempRoot, 'strict-staging');
    const strictWindowsJobRoot = path.join(tempRoot, 'strict-windows-job');
    for (const relative of strictValid.files) {
      const target = path.join(strictStagingRoot, relative);
      await fsp.mkdir(path.dirname(target), {recursive:true});
      await fsp.copyFile(path.join(strictReturnRoot, relative), target);
    }
    const hydration = await gateway.hydrateStep01EvidenceBundle(strictStagingRoot, strictWindowsJobRoot, strictValid.bundle);
    const hydratedLedger = JSON.parse(await fsp.readFile(path.join(strictStagingRoot, 'artifact_ledger.json'), 'utf8'));
    assert.equal(hydratedLedger.artifacts.every(item => item.exact_path.startsWith(hydration.finalRoot)), true);
    for (const artifact of hydratedLedger.artifacts) await fsp.access(path.join(strictStagingRoot, 'step01_evidence_payload', hydration.bundleLabel, 'evidence', artifact.sha256 + '.json'));
    await fsp.mkdir(strictWindowsJobRoot, {recursive:true});
    await gateway.appendEvidenceBundleEvent(strictWindowsJobRoot, jobId, strictValid.receipt, hydration);
    const hydrationEvents = await fsp.readFile(path.join(strictWindowsJobRoot, 'evidence_events.jsonl'), 'utf8');
    assert.match(hydrationEvents, /step01_evidence_bundle_hydrated/);

    await fsp.rm(path.join(strictReturnRoot, 'step01_evidence_bundle.zip'));
    await writeReturnManifest(strictReturnRoot, source.sha256, gateway.RETURN_FILES.concat(['step01_evidence_bundle_manifest.json']));
    await assert.rejects(() => gateway.validateReturnPackage(strictReturnRoot, jobId, source.sha256), /step01_bundle_required/);

    await writeSafeReturn(strictReturnRoot, source.sha256);
    await writeFile(path.join(strictReturnRoot, 'step01_evidence_bundle.zip'), 'forbidden-non-success-bundle');
    await writeJson(path.join(strictReturnRoot, 'step01_evidence_bundle_manifest.json'), {job_id:jobId});
    await writeReturnManifest(strictReturnRoot, source.sha256, gateway.RETURN_FILES.concat(gateway.STEP01_EVIDENCE_BUNDLE_FILES));
    await assert.rejects(() => gateway.validateReturnPackage(strictReturnRoot, jobId, source.sha256), /step01_bundle_not_permitted/);

    const manifestPath = path.join(returnRoot, 'return_manifest.json');
    const malformed = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
    malformed.files[0].path = '../status.json';
    await writeJson(manifestPath, malformed);
    await assert.rejects(() => gateway.validateReturnPackage(returnRoot, jobId, source.sha256), /path_invalid|path_not_allowed/);

    await writeSafeReturn(returnRoot, source.sha256);
    const receiptPath = path.join(returnRoot, 'employee_worker_receipt.json');
    const receipt = JSON.parse(await fsp.readFile(receiptPath, 'utf8'));
    receipt.provider_submission_requested = true;
    await writeJson(receiptPath, receipt);
    await writeReturnManifest(returnRoot, source.sha256);
    await assert.rejects(() => gateway.validateReturnPackage(returnRoot, jobId, source.sha256), /cost_request_rejected/);

    await writeSafeReturn(returnRoot, source.sha256);
    await writeFile(path.join(returnRoot, 'source.mp4'), 'forbidden-return-source');
    await assert.rejects(() => gateway.validateReturnPackage(returnRoot, jobId, source.sha256), /unexpected_file/);

    // Exercise the actual Windows gateway entrypoint against an isolated local
    // website. It claims and exports a fixture without contacting a provider.
    const dataRoot = path.join(tempRoot, 'gateway-data');
    const localRuntime = path.join(tempRoot, 'gateway-runtime');
    const localExport = path.join(tempRoot, 'gateway-export');
    const port = 23000 + crypto.randomInt(1000);
    const baseUrl = 'http://127.0.0.1:' + port;
    const bridgeToken = crypto.randomBytes(48).toString('hex');
    const bridgeTokenHash = crypto.createHash('sha256').update(bridgeToken).digest('hex');
    const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      cwd:__dirname,
      env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,BRIDGE_TOKEN_HASH:bridgeTokenHash,BRIDGE_LEASE_MS:'120000',NIANNIAN_MEDIA_PREFLIGHT:'off'},
      stdio:['ignore','pipe','pipe']
    });
    try {
      await waitForHealth(baseUrl);
      const register = await fetchJson(baseUrl + '/api/auth/register', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'relay-gateway-' + Date.now() + '@example.com',password:'correct-horse-battery-staple'})});
      const cookie = String(register.response.headers.get('set-cookie') || '').split(';')[0];
      const form = new FormData();
      form.set('name', 'Mac relay local gateway test');
      form.set('rightsConfirmed', 'on');
      form.set('sourceVideo', new Blob([Buffer.from('gateway-relay-fixture')], {type:'video/mp4'}), 'fixture.mp4');
      await fetchJson(baseUrl + '/api/projects', {method:'POST',headers:{Cookie:cookie},body:form});
      const command = await runNode(path.join(__dirname, 'bridge', 'niannian_mac_relay_gateway.js'), ['claim-export'], {
        NIANNIAN_MAC_RELAY_RUNTIME:localRuntime,
        NIANNIAN_MAC_RELAY_EXPORT_ROOT:localExport,
        NIANNIAN_BASE_URL:baseUrl,
        NIANNIAN_BRIDGE_TOKEN:bridgeToken,
        NIANNIAN_CONTROLLER_ID:'relay-gateway-test'
      });
      const result = JSON.parse(command.stdout.trim());
      assert.equal(result.status, 'exported');
      await fsp.access(path.join(localExport, 'jobs', result.jobId, 'transport_manifest.json'));

      // A Windows-triggered execution must select one exact job ID; it must
      // never fall back to exporting a different queued controller record.
      const selectedExport = path.join(tempRoot, 'gateway-export-selected');
      await fsp.rm(path.join(localRuntime, 'relay_state.json'), {force:true});
      const selected = await runNode(path.join(__dirname, 'bridge', 'niannian_mac_relay_gateway.js'), ['claim-export', result.jobId], {
        NIANNIAN_MAC_RELAY_RUNTIME:localRuntime,
        NIANNIAN_MAC_RELAY_EXPORT_ROOT:selectedExport,
        NIANNIAN_BASE_URL:baseUrl,
        NIANNIAN_BRIDGE_TOKEN:bridgeToken,
        NIANNIAN_CONTROLLER_ID:'relay-gateway-test'
      });
      const selectedResult = JSON.parse(selected.stdout.trim());
      assert.equal(selectedResult.jobId, result.jobId);
      await fsp.access(path.join(selectedExport, 'jobs', result.jobId, 'transport_manifest.json'));

      // A typed contract recovery archives the old controller attempt and old
      // export instead of deleting evidence, then creates a fresh prepared
      // export for the exact same job ID without starting a worker.
      const staleJobRoot = path.join(localRuntime, 'workspace', '06_AUTOMATION', 'direct_jobs', result.jobId);
      const staleStatus = JSON.parse(await fsp.readFile(path.join(staleJobRoot, 'status.json'), 'utf8'));
      await writeJson(path.join(staleJobRoot, 'status.json'), {...staleStatus,status:'blocked_contract',blocker:'CODEX_WORKER_RECEIPT_MISSING'});
      await writeJson(path.join(localRuntime, 'relay_state.json'), {
        schema_version:1,
        pending:null,
        history:[{job_id:result.jobId,remote_job_id:'relay-test',status:'blocked'}]
      });
      const recovered = await runNode(path.join(__dirname, 'bridge', 'niannian_mac_relay_gateway.js'), ['recover-export', result.jobId], {
        NIANNIAN_MAC_RELAY_RUNTIME:localRuntime,
        NIANNIAN_MAC_RELAY_EXPORT_ROOT:localExport,
        NIANNIAN_BASE_URL:baseUrl,
        NIANNIAN_BRIDGE_TOKEN:bridgeToken,
        NIANNIAN_CONTROLLER_ID:'relay-gateway-test'
      });
      const recoveredResult = JSON.parse(recovered.stdout.trim());
      assert.equal(recoveredResult.status, 'recovered_export');
      assert.equal(recoveredResult.jobId, result.jobId);
      await fsp.access(path.join(recoveredResult.archivedAttempt, 'status.json'));
      const recoveredStatus = JSON.parse(await fsp.readFile(path.join(staleJobRoot, 'status.json'), 'utf8'));
      assert.equal(recoveredStatus.status, 'prepared');
      await fsp.access(path.join(localExport, 'history', result.jobId));
      const afterRecoveryClaim = await runNode(path.join(__dirname, 'bridge', 'niannian_mac_relay_gateway.js'), ['claim-export', result.jobId], {
        NIANNIAN_MAC_RELAY_RUNTIME:localRuntime,
        NIANNIAN_MAC_RELAY_EXPORT_ROOT:localExport,
        NIANNIAN_BASE_URL:baseUrl,
        NIANNIAN_BRIDGE_TOKEN:bridgeToken,
        NIANNIAN_CONTROLLER_ID:'relay-gateway-test'
      });
      assert.equal(JSON.parse(afterRecoveryClaim.stdout.trim()).status, 'already_exported');

      await fsp.rm(path.join(localRuntime, 'relay_state.json'), {force:true});
      await assert.rejects(() => runNode(path.join(__dirname, 'bridge', 'niannian_mac_relay_gateway.js'), ['claim-export', 'web_nn-no-such-job-12345'], {
        NIANNIAN_MAC_RELAY_RUNTIME:localRuntime,
        NIANNIAN_MAC_RELAY_EXPORT_ROOT:path.join(tempRoot, 'gateway-export-missing'),
        NIANNIAN_BASE_URL:baseUrl,
        NIANNIAN_BRIDGE_TOKEN:bridgeToken,
        NIANNIAN_CONTROLLER_ID:'relay-gateway-test'
      }), /mac_relay_requested_job_not_found/);
    } finally {
      server.kill();
      await delay(100);
      if (server.exitCode === null) server.kill('SIGKILL');
    }

    process.stdout.write(JSON.stringify({ok:true,verified:['job export allowlist','video and script source export','transport source hash','return hash manifest','strict Step01 bundle validation','strict bundle hydration to Windows-local paths','strict bundle hydration event','missing strict bundle rejection','non-success bundle rejection','path traversal rejection','provider request rejection','unexpected source rejection','local controller claim-export CLI','exact requested job claim','prior attempt archival','typed recovery export','requested missing job rejection']}) + '\n');
  } finally {
    await fsp.rm(tempRoot, { recursive:true, force:true });
  }
}

main().catch(error => {
  process.stderr.write(error.stack + '\n');
  process.exitCode = 1;
});
