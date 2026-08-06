'use strict';

const assert = require('assert');
const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const projectId = 'NN-20260715083045-8120F5';
const sourceSha = 'a'.repeat(64);
const nowMs = Date.now();
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function bytes(value) { return Buffer.from(JSON.stringify(value, null, 2) + '\n'); }
async function json(filePath, value) { await fsp.mkdir(path.dirname(filePath), {recursive:true}); await fsp.writeFile(filePath, bytes(value)); }
function receipt(id, value) { const valueBytes = bytes(value); return {receipt_id:id,project_relative_path:'output/mac-employee-training/'+id+'.json',status:'present',sha256:sha(valueBytes),bytes:valueBytes.length,receipt:value}; }
function readback(releaseVersion) {
  const checked = new Date(nowMs - 60 * 1000).toISOString();
  const audits = Object.fromEntries(['credential:mimo_asr','credential:paddle_ocr','runtime:transnetv2','runtime:hq','runtime:forced_aligner'].map(key => [key,{capability:key,ready:true,status:'ready',checked_at:checked,evidence:{method:'synthetic_non_project_health'}}]));
  const gate = {schema_version:'niannian_step01_hq_full_gate_receipt_v2',status:'ready',ready:true,host:{platform:'darwin',project_root:'/Users/lsb/AI-Brain/niannian-ai-canonical-local'},settings_binding:{profile:'mac-step01-hq-full-evidence-v2',version:2},capability_audits:audits,composite:{ok:true},provider_upload_requested:false,provider_submit_requested:false,spend_requested:false,real_project_media_processed:false,real_delivery:false,checked_at:checked,expires_at:new Date(nowMs + 10 * 60 * 1000).toISOString()};
  const promotion = {schema_version:'niannian_step01_hq_full_toolchain_contract_v1',status:'accepted',execution_authority_granted:true,profile:'hq_full',profile_release:'mac-step01-hq-full-evidence-v2',stable_batch_fallback_allowed:false,settings_binding:{version:2,profile:'mac-step01-hq-full-evidence-v2'},acceptance_gates:{fresh_hq_full_gate_receipt:{exact_path:'/Users/lsb/AI-Brain/niannian-ai-canonical-local/output/mac-employee-training/mac-step01-hq-full-gate-receipt.json',sha256:sha(bytes(gate)),bytes:bytes(gate).length,status:'verified',required:true,ready:true}}};
  return {schema_version:'niannian_mac_hq_fixed_readback_v1',status:'complete',project_root_binding:'/Users/lsb/AI-Brain/niannian-ai-canonical-local',read_only:true,fixed_whitelist:true,shell_command_requested:false,media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,project_media_processed:false,bridge_release:{status:'installed_verified',release_version:releaseVersion,manifest_sha256:'b'.repeat(64),rollback_record:true},receipts:[receipt('hq_gate',gate),receipt('hq_composite',{status:'passed'}),receipt('analysis_probe',{status:'passed'}),receipt('hq_promotion',promotion),receipt('hq_exit',{exit_code:0})],read_at:new Date(nowMs).toISOString()};
}
async function main() {
  const dataRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-hq-sync-'));
  process.env.NIANNIAN_CANONICAL_DATA_ROOT = dataRoot;
  const {RELEASE_VERSION} = require('./bridge/niannian_mac_bridge_release');
  const {sync} = require('./bridge/niannian_step01_hq_readback_sync');
  const jobRoot = path.join(dataRoot, 'jobs', projectId);
  const runId = 'analysis-1-0123456789abcdef01234567';
  const authorization = {event_id:'step01-0123456789abcdef01234567',settings_version:2};
  const run = {id:runId,source_sha256:sourceSha,source_bytes:123,source_revision:1,settings_binding:{settings_version:2,effective_requirements_sha256:'c'.repeat(64)}};
  const project = {id:projectId,status:'blocked',source:{sha256:sourceSha,bytes:123},analysis:{status:'blocked_resource',runId,sourceRevision:1,settingsVersion:2,authorizationEventId:authorization.event_id,localJobId:'web_nn-20260715083045-8120f5'},runtime:{productionStatus:'blocked_resource',gateState:'step01_hq_full_blocked_no_dispatch'},dispatch:{status:'blocked',localJobId:'web_nn-20260715083045-8120f5'}};
  try {
    await json(path.join(dataRoot, 'projects.json'), [project]);
    await json(path.join(jobRoot, 'task.json'), {job_id:projectId,analysis_run:run,analysis_authorization:authorization});
    await json(path.join(jobRoot, 'status.json'), {status:'blocked_resource'});
    await json(path.join(jobRoot, 'checkpoint.json'), {status:'blocked_resource'});
    await json(path.join(jobRoot, 'gate_dashboard.json'), {overall_status:'blocked_resource',gates:{Step01:{status:'blocked_resource_hq_refresh_required'}}});
    await json(path.join(jobRoot, 'artifact_ledger.json'), {artifacts:[]});
    await json(path.join(jobRoot, 'step01_orchestrator_result.json'), {remote_project_id:projectId,status:'fixed_app_dispatch_blocked_resource'});
    const fresh = readback(RELEASE_VERSION);
    const first = await sync(fresh);
    assert.equal(first.status, 'hq_readback_ready_synced');
    const projected = JSON.parse(await fsp.readFile(path.join(dataRoot, 'projects.json'), 'utf8'))[0];
    assert.equal(projected.analysis.status, 'prepared');
    assert.equal(projected.runtime.gateState, 'step01_hq_readback_ready');
    assert.equal(projected.dispatch.status, 'queued');
    assert.equal(JSON.parse(await fsp.readFile(path.join(jobRoot, 'current_run.json'), 'utf8')).analysis_run_id, runId);
    assert.equal(JSON.parse(await fsp.readFile(path.join(jobRoot, 'step01_orchestrator_result.json'), 'utf8')).status, 'hq_readback_ready');
    const eventCount = (await fsp.readFile(path.join(jobRoot, 'evidence_events.jsonl'), 'utf8')).trim().split(/\r?\n/).length;
    const second = await sync(fresh);
    assert.equal(second.status, 'already_synced');
    assert.equal((await fsp.readFile(path.join(jobRoot, 'evidence_events.jsonl'), 'utf8')).trim().split(/\r?\n/).length, eventCount);
    const cli = childProcess.spawnSync(process.execPath, [path.join(__dirname, 'bridge', 'niannian_step01_hq_readback_sync.js')], {input:JSON.stringify(fresh),encoding:'utf8',env:{...process.env,NIANNIAN_CANONICAL_DATA_ROOT:dataRoot}});
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(JSON.parse(cli.stdout).status, 'already_synced');
    const invalid = readback(RELEASE_VERSION); invalid.receipts = invalid.receipts.slice(0, 4);
    await assert.rejects(() => sync(invalid), /receipt_set_invalid/);
  } finally {
    await fsp.rm(dataRoot, {recursive:true,force:true});
  }
  process.stdout.write(JSON.stringify({ok:true,verified:['exact current-run/source/settings/authorization binding','fixed readback persisted under job root','old orchestrator blocker archived','prepared canonical projection','idempotent repeat sync','CLI stdin readback sync','invalid readback rejected']}) + '\n');
}
main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
