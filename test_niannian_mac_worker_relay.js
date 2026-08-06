'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const worker = require('./bridge/niannian_mac_worker_relay');
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

async function writeTransportManifest(root, manifestJobId, sourceSha256, sourcePath = 'source/source.mp4', sourceKind = null, n06Assets = []) {
  const files = [];
  for (const relative of worker.EXPORT_CONTRACT_FILES.concat([sourcePath, 'source.sha256'], n06Assets.map(asset => asset.path))) {
    const evidence = await worker.sha256File(path.join(root, relative));
    files.push({path:relative,bytes:evidence.bytes,sha256:evidence.sha256});
  }
  await writeJson(path.join(root, 'transport_manifest.json'), {
    schema_version:'niannian_mac_transport_v1',
    job_id:manifestJobId,
    source_sha256:sourceSha256,
    source_path:sourcePath,
    ...(sourceKind ? {source_kind:sourceKind} : {}),
    ...(n06Assets.length ? {n06_assets:n06Assets} : {}),
    files
  });
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-mac-worker-relay-'));
  try {
    const priorJobRoot = path.join(tempRoot, 'workspace', '06_AUTOMATION', 'direct_jobs', jobId);
    await writeFile(path.join(priorJobRoot, 'employee_worker_receipt.json'), 'legacy receipt evidence');
    const archivedPriorJob = await worker.archiveExistingMacJob({
      workspace:path.join(tempRoot, 'workspace'),
      directJobsRoot:path.join(tempRoot, 'workspace', '06_AUTOMATION', 'direct_jobs')
    }, priorJobRoot, jobId);
    assert(archivedPriorJob);
    await fsp.access(path.join(archivedPriorJob, 'employee_worker_receipt.json'));
    assert.equal(await fsp.stat(priorJobRoot).then(() => true, () => false), false);

    const requestedConfig = worker.relayConfig({ args:[
      '--windows-host', '100.125.247.33',
      '--windows-user', 'lsb',
      '--key-path', '/tmp/relay-key',
      '--job-id', jobId
    ] });
    assert.equal(requestedConfig.requestedJobId, jobId);
    assert.throws(() => worker.relayConfig({ args:[
      '--windows-host', '100.125.247.33',
      '--windows-user', 'lsb',
      '--key-path', '/tmp/relay-key',
      '--job-id', 'not-a-niannian-job'
    ] }), /mac_worker_relay_job_id_invalid/);

    const dispatcherEnv = worker.buildDispatcherEnvironment({
      workspace:'/tmp/relay-workspace',
      productionIndex:'/tmp/relay-workspace/06_AUTOMATION/production_jobs.index.json',
      workerState:'/tmp/relay-workspace/worker-state'
    }, 'execute', {
      PATH:'/usr/bin:/bin',
      NIANNIAN_CODEX_WORKER_COMMAND:'/tmp/fake-codex',
      NIANNIAN_CODEX_WORKER_COMMAND_ARGS:'["--fake"]'
    }, '/Users/lsb/.local/bin');
    assert.equal(dispatcherEnv.PATH.split(path.delimiter)[0], path.resolve('/Users/lsb/.local/bin'));
    assert.equal(dispatcherEnv.PATH.includes('/usr/bin'), true);
    assert.equal(dispatcherEnv.NIANNIAN_CODEX_WORKER_COMMAND, undefined);
    assert.equal(dispatcherEnv.NIANNIAN_CODEX_WORKER_COMMAND_ARGS, undefined);
    assert.equal(dispatcherEnv.NIANNIAN_CODEX_WORKER_MODE, 'execute');

    const jobRoot = path.join(tempRoot, 'job');
    const sourcePath = path.join(jobRoot, 'source', 'source.mp4');
    await writeFile(sourcePath, Buffer.from('mac-relay-source-fixture'));
    const source = await worker.sha256File(sourcePath);
    const task = {
      job_id:jobId,
      remote_job_id:'NN-RELAY-1234567890',
      source_video:{exact_path:'C:\\Windows\\relay\\source.mp4',sha256:source.sha256,original_name:'source.mp4'},
      constraints:{provider_submit_requires_authorization:true,package_send_requires_authorization:true,step01_requires_user_authorization:true},
      analysis_authorization:{event_id:'step01-1234567890abcdef12345678',source_sha256:source.sha256,settings_version:1,allowed_scope:'step01_evidence_only'},
      allowed_skill_routes:['mx-shortdrama-00-router','mx-shortdrama-01-frame-extract'],
      required_router:'mx-shortdrama-00-router'
    };
    const jsonFiles = {
      'artifact_ledger.json':{job_id:jobId,artifacts:[]},
      'assignments.json':{job_id:jobId},
      'checkpoint.json':{job_id:jobId,status:'prepared'},
      'gate_dashboard.json':{job_id:jobId,gates:{provider_submit:{status:'blocked_cost_authorization'},package_send:{status:'blocked_controller_authorization'}}},
      'result_manifest.json':{job_id:jobId,status:'prepared',packaged:false,transport_success:false,user_visible_acceptance:false},
      'route_decision.json':{job_id:jobId,selected_skill:'mx-shortdrama-01-frame-extract'},
      'status.json':{job_id:jobId,status:'prepared'},
      'task.json':task,
      'transaction_intent.json':{job_id:jobId,cost_gate:'controller_authorization_required'}
    };
    for (const [relative, value] of Object.entries(jsonFiles)) await writeJson(path.join(jobRoot, relative), value);
    await writeFile(path.join(jobRoot, 'codex_prompt.md'), '# Relay contract\n');
    await writeFile(path.join(jobRoot, 'gate_dashboard.md'), '# Gates\n');
    await writeFile(path.join(jobRoot, 'worker_report.md'), '# Worker Report\n');
    await writeFile(path.join(jobRoot, 'source.sha256'), source.sha256 + '  source/source.mp4\n');
    await writeTransportManifest(jobRoot, jobId, source.sha256);

    const originalTask = JSON.parse(await fsp.readFile(path.join(jobRoot, 'task.json'), 'utf8'));
    const transport = await worker.verifyTransportPackage(jobRoot);
    assert.equal(transport.sourceEvidence.sha256, source.sha256);
    const materialized = await worker.materializeMacJob(jobRoot, transport);
    assert.equal(materialized.sourceSha256, source.sha256);
    const rewrittenTask = JSON.parse(await fsp.readFile(path.join(jobRoot, 'task.json'), 'utf8'));
    assert.equal(rewrittenTask.source_video.exact_path, sourcePath);
    assert.equal(rewrittenTask.analysis_authorization.event_id, 'step01-1234567890abcdef12345678');
    assert.equal(rewrittenTask.analysis_authorization.source_sha256, source.sha256);
    assert.equal(rewrittenTask.analysis_authorization.allowed_scope, 'step01_evidence_only');
    const expected = JSON.parse(JSON.stringify(originalTask));
    expected.source_video.exact_path = sourcePath;
    assert.deepEqual(rewrittenTask, expected);
    const record = JSON.parse(await fsp.readFile(path.join(jobRoot, 'transport_record.json'), 'utf8'));
    assert.equal(record.windows_declared_source_path, originalTask.source_video.exact_path);

    const strictEvidenceManifest = path.join(jobRoot, 'evidence', 'step01_evidence_manifest.json');
    const strictValidationReport = path.join(jobRoot, 'evidence', 'step01_validation_report.json');
    await writeJson(strictEvidenceManifest, {schema_version:'step01_evidence_v1',source_sha256:source.sha256,frames:[]});
    await writeJson(strictValidationReport, {schema_version:'step01_validation_v1',passed:true});
    const strictManifestEvidence = await worker.sha256File(strictEvidenceManifest);
    const strictReportEvidence = await worker.sha256File(strictValidationReport);
    await writeJson(path.join(jobRoot, 'artifact_ledger.json'), {job_id:jobId,artifacts:[
      {artifact_id:'step01_evidence_manifest',node_id:'Step01',status:'verified',exact_path:strictEvidenceManifest,...strictManifestEvidence},
      {artifact_id:'step01_validation_report',node_id:'Step01',status:'verified',exact_path:strictValidationReport,...strictReportEvidence}
    ]});
    await writeJson(path.join(jobRoot, 'employee_worker_receipt.json'), {job_id:jobId,dispatch_id:'cw-relay-test-001',production_status:'step01_verified'});
    const bundleFiles = await worker.buildStep01EvidenceBundle(jobRoot, transport);
    assert.deepEqual(bundleFiles, worker.STEP01_EVIDENCE_BUNDLE_FILES);
    const bundleManifest = JSON.parse(await fsp.readFile(path.join(jobRoot, 'step01_evidence_bundle_manifest.json'), 'utf8'));
    assert.equal(bundleManifest.files.length, 2);
    await fsp.access(path.join(jobRoot, 'step01_evidence_bundle.zip'));
    await writeJson(path.join(jobRoot, 'artifact_ledger.json'), {job_id:jobId,artifacts:[
      {artifact_id:'step01_evidence_manifest',node_id:'Step01',status:'verified',exact_path:strictEvidenceManifest,sha256:'0'.repeat(64),bytes:strictManifestEvidence.bytes},
      {artifact_id:'step01_validation_report',node_id:'Step01',status:'verified',exact_path:strictValidationReport,...strictReportEvidence}
    ]});
    await assert.rejects(() => worker.buildStep01EvidenceBundle(jobRoot, transport), /ledger_hash_mismatch/);

    const scriptJobId = 'web_ns-script-relay-12345';
    const scriptRoot = path.join(tempRoot, 'script-job');
    const scriptSourcePath = path.join(scriptRoot, 'source', 'source_text.txt');
    await writeFile(scriptSourcePath, '第一章：苏晚走出民政局，顾言在雨夜等她。\n');
    const scriptSource = await worker.sha256File(scriptSourcePath);
    const n06ReferencePath = path.join(scriptRoot, 'n06', 'references', 'confirmed-frame.png');
    await writeFile(n06ReferencePath, Buffer.from('confirmed-n06-reference'));
    const n06Reference = await worker.sha256File(n06ReferencePath);
    const n06Assets = [{ref_key:'FF_V001_S001',path:'n06/references/confirmed-frame.png',sha256:n06Reference.sha256}];
    const scriptTask = {
      job_id:scriptJobId,
      remote_job_id:'NS-RELAY-1234567890',
      source_script:{exact_path:'C:\\Windows\\relay\\source_text.txt',sha256:scriptSource.sha256,type:'extracted_novel_text'},
      n06_real_submit:{transaction_id:'N06INT-RELAY-0001',references:[{ref_key:'FF_V001_S001',path:'C:\\Windows\\relay\\confirmed-frame.png',sha256:n06Reference.sha256}]},
      constraints:{provider_submit_requires_authorization:true,package_send_requires_authorization:true},
      allowed_skill_routes:['mx-shortdrama-00-router','mx-shortdrama-script-only-production'],
      required_router:'mx-shortdrama-00-router'
    };
    const scriptJsonFiles = {
      'artifact_ledger.json':{job_id:scriptJobId,artifacts:[]},
      'assignments.json':{job_id:scriptJobId},
      'checkpoint.json':{job_id:scriptJobId,status:'prepared'},
      'gate_dashboard.json':{job_id:scriptJobId,gates:{provider_submit:{status:'blocked_cost_authorization'},package_send:{status:'blocked_controller_authorization'}}},
      'result_manifest.json':{job_id:scriptJobId,status:'prepared',packaged:false,transport_success:false,user_visible_acceptance:false},
      'route_decision.json':{job_id:scriptJobId,selected_skill:'mx-shortdrama-script-only-production'},
      'status.json':{job_id:scriptJobId,status:'queued'},
      'task.json':scriptTask,
      'transaction_intent.json':{job_id:scriptJobId,cost_gate:'controller_authorization_required'}
    };
    const n06ExportRoot = path.join(tempRoot, 'n06-export');
    const exportTask = JSON.parse(JSON.stringify(scriptTask));
    exportTask.n06_real_submit.references[0].path = n06ReferencePath;
    const exportedN06Assets = await gateway.exportN06Assets(exportTask, scriptRoot, n06ExportRoot);
    assert.equal(exportedN06Assets[0].ref_key, n06Assets[0].ref_key);
    assert.equal(exportedN06Assets[0].sha256, n06Assets[0].sha256);
    assert.match(exportedN06Assets[0].path, /^n06\/references\/[a-f0-9]{64}\.png$/);
    await fsp.access(path.join(n06ExportRoot, exportedN06Assets[0].path));
    for (const [relative, value] of Object.entries(scriptJsonFiles)) await writeJson(path.join(scriptRoot, relative), value);
    await writeFile(path.join(scriptRoot, 'codex_prompt.md'), '# Script relay contract\n');
    await writeFile(path.join(scriptRoot, 'gate_dashboard.md'), '# Gates\n');
    await writeFile(path.join(scriptRoot, 'worker_report.md'), '# Worker Report\n');
    await writeFile(path.join(scriptRoot, 'source.sha256'), scriptSource.sha256 + '  source/source_text.txt\n');
    await writeTransportManifest(scriptRoot, scriptJobId, scriptSource.sha256, 'source/source_text.txt', 'source_script', n06Assets);
    const scriptTransport = await worker.verifyTransportPackage(scriptRoot);
    assert.equal(scriptTransport.sourceKind, 'source_script');
    const scriptMaterialized = await worker.materializeMacJob(scriptRoot, scriptTransport);
    const rewrittenScriptTask = JSON.parse(await fsp.readFile(path.join(scriptRoot, 'task.json'), 'utf8'));
    assert.equal(scriptMaterialized.sourceKind, 'source_script');
    assert.equal(rewrittenScriptTask.source_script.exact_path, scriptSourcePath);
    assert.equal(rewrittenScriptTask.source_script.sha256, scriptSource.sha256);
    assert.equal(rewrittenScriptTask.source_video, undefined);
    assert.equal(rewrittenScriptTask.n06_real_submit.references[0].path, n06ReferencePath);
    assert.equal(rewrittenScriptTask.n06_real_submit.references[0].sha256, n06Reference.sha256);

    await fsp.unlink(path.join(jobRoot, 'transport_record.json'));
    await writeFile(sourcePath, 'corrupted-source');
    await assert.rejects(() => worker.verifyTransportPackage(jobRoot), /transport_hash_mismatch|transport_source_hash_mismatch/);

    process.stdout.write(JSON.stringify({ok:true,verified:['requested job-id validation','prior Mac attempt archival','dispatcher Codex PATH injection','worker command override removal','Step01 authorization preservation','transport manifest verification','source sha256 verification','video path rewrite only','script path rewrite only','strict Step01 evidence bundle creation','strict bundle ledger hash rejection','transport provenance record','tampered source rejection']}) + '\n');
  } finally {
    await fsp.rm(tempRoot, { recursive:true, force:true });
  }
}

main().catch(error => {
  process.stderr.write(error.stack + '\n');
  process.exitCode = 1;
});
