'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {reduceStep01OrchestratorFailure,reduceStep01OrchestratorFailureDataRoot} = require('./bridge/niannian_step01_orchestrator_failure_reducer');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
async function writeJson(filePath, value) { await fsp.mkdir(path.dirname(filePath), {recursive:true}); await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n'); }
function pipelineForStatus(status, gates) { return ['Step01','Step02','Step04','Step05'].map((id,index) => ({id,status:index === 0 ? 'blocked' : 'blocked',gate:gates[id].status})); }
function project(id = 'NN-TEST-REDUCER-001') {
  return {id,status:'queued',productionStatus:'prepared',source:{sha256:'a'.repeat(64),bytes:1},analysis:{status:'queued'},runtime:{gates:{}},dispatch:{status:'claimed',leaseId:'lease',leaseUntil:'2099-01-01T00:00:00.000Z'}};
}
function receipt(projectId, overrides = {}) {
  return {schema_version:1,remote_project_id:projectId,status:'failed',blocker:"step01_carrier_terminal_worker_failed:1:ENOENT: no such file or directory, mkdir '/Users/lsb/.local/share/niannian-ai/step01-phase-leases/a'\nstep01_worker_child_failed:1\n",blocker_class:'pipeline_runtime_packaging_gap',provider_submission_requested:false,package_send_requested:false,failed_at:'2026-07-15T12:05:52.858Z',...overrides};
}
async function stage(dataRoot, item = project(), result = receipt(item.id)) {
  const jobRoot = path.join(dataRoot, 'jobs', item.id);
  await writeJson(path.join(jobRoot,'step01_orchestrator_result.json'), result);
  await writeJson(path.join(jobRoot,'artifact_ledger.json'), {schema_version:'artifact_ledger_v1',job_id:item.id,artifacts:[{artifact_id:'source_video',status:'verified'}]});
  await writeJson(path.join(jobRoot,'status.json'), {status:'queued'});
  await writeJson(path.join(jobRoot,'checkpoint.json'), {status:'queued'});
  await writeJson(path.join(jobRoot,'gate_dashboard.json'), {gates:{Step01:{status:'queued'}}});
  await writeJson(path.join(jobRoot,'result_manifest.json'), {status:'queued'});
  return jobRoot;
}
async function main() {
  const dataRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-step01-failure-reducer-'));
  try {
    const item = project();
    const jobRoot = await stage(dataRoot, item);
    const first = await reduceStep01OrchestratorFailure({dataRoot,project:item,pipelineForStatus});
    assert.equal(first.changed, true);
    assert.equal(first.blocker_code, 'STEP01_MAC_PHASE_LEASE_DIRECTORY_MISSING');
    assert.equal(item.status, 'blocked');
    assert.equal(item.productionStatus, 'infra_failed');
    assert.equal(item.analysis.status, 'infra_failed');
    assert.equal(item.dispatch.status, 'blocked');
    assert.equal(item.dispatch.leaseUntil, null);
    for (const name of ['status.json','checkpoint.json','gate_dashboard.json','result_manifest.json','artifact_ledger.json']) {
      const document = JSON.parse(await fsp.readFile(path.join(jobRoot,name),'utf8'));
      if (name === 'gate_dashboard.json') assert.equal(document.gates.Step01.status, 'infra_failed');
      else if (name === 'artifact_ledger.json') assert(document.artifacts.some(item => item.artifact_id === 'step01_orchestrator_failure_receipt' && item.status === 'blocked'));
      else assert.equal(document.status, 'infra_failed');
    }
    const ledger = JSON.parse(await fsp.readFile(path.join(jobRoot,'artifact_ledger.json'),'utf8'));
    assert.equal(ledger.artifacts.filter(item => item.artifact_id === 'step01_orchestrator_failure_receipt').length, 1);
    const second = await reduceStep01OrchestratorFailure({dataRoot,project:item,pipelineForStatus});
    assert.equal(second.changed, false);
    const events = (await fsp.readFile(path.join(jobRoot,'job_events.jsonl'),'utf8')).trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(events.filter(event => event.type === 'step01_orchestrator_failure_observed').length, 1);
    const original = JSON.parse(await fsp.readFile(path.join(jobRoot,'step01_orchestrator_result.json'),'utf8'));
    original.blocker += 'tampered';
    await writeJson(path.join(jobRoot,'step01_orchestrator_result.json'), original);
    await assert.rejects(() => reduceStep01OrchestratorFailure({dataRoot,project:item,pipelineForStatus}), /STEP01_REDUCER_RESULT_RECEIPT_TAMPERED_AFTER_REDUCTION/);

    const controllerRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-step01-controller-failure-'));
    try {
      const controllerProject = project('NN-TEST-CONTROLLER-AUTH');
      const controllerJob = await stage(controllerRoot, controllerProject, receipt(controllerProject.id));
      await reduceStep01OrchestratorFailure({dataRoot:controllerRoot,project:controllerProject,pipelineForStatus});
      await writeJson(path.join(controllerJob,'step01_orchestrator_result.json'), receipt(controllerProject.id,{
        blocker:'控制器凭据无效',
        blocker_code:'CONTROLLER_AUTH_REQUIRED',
        controller_http_status:401,
        blocker_class:'infrastructure_failure',
        failed_at:'2026-07-16T09:03:21.161Z'
      }));
      controllerProject.status='queued';
      controllerProject.productionStatus='queued';
      controllerProject.analysis={status:'queued'};
      const latest = await reduceStep01OrchestratorFailure({dataRoot:controllerRoot,project:controllerProject,pipelineForStatus});
      assert.equal(latest.blocker_code,'STEP01_CONTROLLER_CREDENTIAL_INVALID');
      assert.equal(controllerProject.status,'blocked');
      assert.equal(controllerProject.productionStatus,'infra_failed');
      assert.equal(controllerProject.runtime.blocker,'STEP01_CONTROLLER_CREDENTIAL_INVALID');
      assert.equal(controllerProject.runtime.gateState,'step01_controller_auth_failed');
      const latestStatus=JSON.parse(await fsp.readFile(path.join(controllerJob,'status.json'),'utf8'));
      assert.equal(latestStatus.blocker.code,'STEP01_CONTROLLER_CREDENTIAL_INVALID');
      const latestEvents=(await fsp.readFile(path.join(controllerJob,'job_events.jsonl'),'utf8')).trim().split(/\r?\n/).map(JSON.parse);
      assert.equal(latestEvents.filter(event=>event.type==='step01_orchestrator_failure_observed').length,2);
      const replay=await reduceStep01OrchestratorFailure({dataRoot:controllerRoot,project:controllerProject,pipelineForStatus});
      assert.equal(replay.changed,false);
      const replayEvents=(await fsp.readFile(path.join(controllerJob,'job_events.jsonl'),'utf8')).trim().split(/\r?\n/).map(JSON.parse);
      assert.equal(replayEvents.length,latestEvents.length);

      const missingProject=project('NN-TEST-CONTROLLER-MISSING');
      await stage(controllerRoot,missingProject,receipt(missingProject.id,{
        blocker:'bridge_token_missing_or_short',
        blocker_class:'infrastructure_failure',
        failed_at:'2026-07-16T09:04:00.000Z'
      }));
      const missing=await reduceStep01OrchestratorFailure({dataRoot:controllerRoot,project:missingProject,pipelineForStatus});
      assert.equal(missing.blocker_code,'STEP01_CONTROLLER_CREDENTIAL_MISSING');
      await writeJson(path.join(controllerRoot,'projects.json'),[missingProject]);
      missingProject.status='queued';
      missingProject.productionStatus='queued';
      missingProject.analysis={status:'queued'};
      await writeJson(path.join(controllerRoot,'projects.json'),[missingProject]);
      const dataRootReplay=await reduceStep01OrchestratorFailureDataRoot({dataRoot:controllerRoot,projectId:missingProject.id,pipelineForStatus});
      assert.equal(dataRootReplay.changed,false);
      const persistedProjects=JSON.parse(await fsp.readFile(path.join(controllerRoot,'projects.json'),'utf8'));
      assert.equal(persistedProjects[0].runtime.blocker,'STEP01_CONTROLLER_CREDENTIAL_MISSING');
    } finally { await fsp.rm(controllerRoot,{recursive:true,force:true}); }

    async function rejects(label, result, ledger) {
      const isolated = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-step01-failure-negative-'));
      try {
        const negativeProject = project('NN-TEST-' + sha256(label).slice(0,8).toUpperCase());
        const negativeRoot = await stage(isolated, negativeProject, {...result,remote_project_id:result.remote_project_id === item.id ? negativeProject.id : result.remote_project_id});
        if (ledger) await writeJson(path.join(negativeRoot,'artifact_ledger.json'), ledger);
        await assert.rejects(() => reduceStep01OrchestratorFailure({dataRoot:isolated,project:negativeProject,pipelineForStatus}), new RegExp(label));
      } finally { await fsp.rm(isolated, {recursive:true,force:true}); }
    }
    await rejects('PROJECT_MISMATCH', receipt('foreign'));
    await rejects('SIDE_EFFECT_FLAG_INVALID', receipt(item.id,{provider_submission_requested:true}));
    await rejects('VERIFIED_EVIDENCE_ALREADY_PRESENT', receipt(item.id), {schema_version:'artifact_ledger_v1',artifacts:[{artifact_id:'step01_evidence_manifest',status:'verified'}]});
    const tamperRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-step01-failure-tamper-'));
    try {
      const tamperProject = project('NN-TEST-TAMPER');
      const tamperJob = await stage(tamperRoot,tamperProject,receipt(tamperProject.id));
      await fsp.writeFile(path.join(tamperJob,'step01_orchestrator_result.json'), '{not-json');
      await assert.rejects(() => reduceStep01OrchestratorFailure({dataRoot:tamperRoot,project:tamperProject,pipelineForStatus}));
    } finally { await fsp.rm(tamperRoot,{recursive:true,force:true}); }
    process.stdout.write(JSON.stringify({ok:true,verified:['regular exact terminal receipt validation','events-first stable failure event','idempotent replay no duplicate event or ledger artifact','latest controller credential failure supersedes older lease blocker','controller missing and invalid typed blockers','all job-local projections regenerated','website project runtime projection coherent','foreign receipt/provider side effect/verified Step01 evidence/tampered receipt fail closed','no provider/network/media side effect']}) + '\n');
  } finally { await fsp.rm(dataRoot, {recursive:true,force:true}); }
}
main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
