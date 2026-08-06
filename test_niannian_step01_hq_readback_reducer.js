'use strict';

const assert = require('assert');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {reconcileVerifiedHqReadback, validateReadback} = require('./bridge/niannian_step01_hq_readback_reducer');
const {RELEASE_VERSION} = require('./bridge/niannian_mac_bridge_release');

const nowMs = Date.parse('2026-07-17T00:00:00.000Z');
function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
async function json(filePath, value) { await fsp.mkdir(path.dirname(filePath), {recursive:true}); await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n'); }
function receipt(id, value) { const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n'); return {receipt_id:id,project_relative_path:'output/mac-employee-training/'+id+'.json',status:'present',sha256:sha(bytes),bytes:bytes.length,receipt:value}; }
function readback(ready = true) {
  const checked = new Date(nowMs - 60 * 1000).toISOString();
  const audits = Object.fromEntries(['credential:mimo_asr','credential:paddle_ocr','runtime:transnetv2','runtime:hq','runtime:forced_aligner'].map(key => [key,{capability:key,ready,status:'ready',checked_at:checked,evidence:{method:'synthetic_non_project_health',summary:'redacted success'}}]));
  const gate = {schema_version:'niannian_step01_hq_full_gate_receipt_v2',status:ready?'ready':'blocked',ready,host:{platform:'darwin',project_root:'/Users/lsb/AI-Brain/niannian-ai-canonical-local'},settings_binding:{profile:'mac-step01-hq-full-evidence-v2',version:2},capability_audits:audits,composite:{ok:ready},provider_upload_requested:false,provider_submit_requested:false,spend_requested:false,real_project_media_processed:false,real_delivery:false,checked_at:checked,expires_at:new Date(nowMs + 10 * 60 * 1000).toISOString()};
  return {schema_version:'niannian_mac_hq_fixed_readback_v1',status:'complete',project_root_binding:'/Users/lsb/AI-Brain/niannian-ai-canonical-local',read_only:true,fixed_whitelist:true,shell_command_requested:false,media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,project_media_processed:false,bridge_release:{status:'installed_verified',release_version:RELEASE_VERSION,manifest_sha256:'a'.repeat(64),rollback_record:true},receipts:[receipt('hq_gate',gate),receipt('hq_composite',{status:'passed'}),receipt('analysis_probe',{status:'passed'}),receipt('hq_promotion',{status:'accepted'}),receipt('hq_exit',{exit_code:0})],read_at:new Date(nowMs).toISOString()};
}
async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-hq-readback-'));
  try {
    const job = path.join(root, 'NN-20260715083045-8120F5');
    await json(path.join(job, 'task.json'), {job_id:'NN-20260715083045-8120F5',settings_version:2});
    await json(path.join(job, 'status.json'), {status:'queued',blocker:{code:'STEP01_CONTROLLER_CREDENTIAL_INVALID'}});
    await json(path.join(job, 'checkpoint.json'), {status:'queued',blockers:[{code:'STEP01_CONTROLLER_CREDENTIAL_INVALID'}]});
    await json(path.join(job, 'gate_dashboard.json'), {gates:{Step01:{status:'queued'}},blocker:{code:'STEP01_CONTROLLER_CREDENTIAL_INVALID'}});
    await json(path.join(job, 'artifact_ledger.json'), {artifacts:[{artifact_id:'obsolete',blocker_code:'STEP01_CONTROLLER_CREDENTIAL_INVALID'}]});
    const result = await reconcileVerifiedHqReadback({jobRoot:job,readback:readback(true),nowMs});
    assert.equal(result.status, 'hq_readback_ready_reconciled');
    const expired=readback(true);const expiredGate=expired.receipts.find(item=>item.receipt_id==='hq_gate').receipt;expiredGate.checked_at='2026-07-01T00:00:00.000Z';expiredGate.expires_at='2026-07-01T00:01:00.000Z';for(const audit of Object.values(expiredGate.capability_audits)){audit.checked_at='2026-07-01T00:00:00.000Z';audit.expires_at='2026-07-01T00:01:00.000Z';}assert.equal(validateReadback(expired,{settingsVersion:2,nowMs}).evaluation.ready,true);
    for (const name of ['status.json','checkpoint.json','gate_dashboard.json','artifact_ledger.json']) assert.equal((await fsp.readFile(path.join(job, name), 'utf8')).includes('STEP01_CONTROLLER_CREDENTIAL_INVALID'), false);
    assert.equal((await JSON.parse(await fsp.readFile(path.join(job, 'status.json'), 'utf8'))).status, 'prepared');
    assert((await fsp.readFile(path.join(job, 'evidence_events.jsonl'), 'utf8')).includes('mac_hq_fixed_readback_reconciled'));
    const eventCount = (await fsp.readFile(path.join(job, 'evidence_events.jsonl'), 'utf8')).trim().split(/\r?\n/).length;
    const idempotent = await reconcileVerifiedHqReadback({jobRoot:job,readback:readback(true),nowMs});
    assert.equal(idempotent.status, 'hq_readback_already_reconciled');
    assert.equal((await fsp.readFile(path.join(job, 'evidence_events.jsonl'), 'utf8')).trim().split(/\r?\n/).length, eventCount);
    const invalid = readback(true); invalid.receipts[0].sha256 = '0'.repeat(64); invalid.receipts = invalid.receipts.slice(0, 4);
    await assert.rejects(() => reconcileVerifiedHqReadback({jobRoot:job,readback:invalid,nowMs}), /receipt_set_invalid/);
    assert.equal(validateReadback(readback(false), {settingsVersion:2,nowMs}).evaluation.ready, false);
    const outdated=readback(true);outdated.bridge_release.release_version='old';const maintenance=await reconcileVerifiedHqReadback({jobRoot:job,readback:outdated,nowMs});assert.equal(maintenance.status,'hq_readback_bridge_update_required_reconciled');const maintenanceStatus=JSON.parse(await fsp.readFile(path.join(job,'status.json'),'utf8'));assert.equal(maintenanceStatus.blocker.code,'MAC_BRIDGE_UPDATE_REQUIRED');assert.equal(maintenanceStatus.state_layers.mac_bridge_update_required,true);
  } finally { await fsp.rm(root, {recursive:true,force:true}); }
  process.stdout.write(JSON.stringify({ok:true,verified:['exact-job readback binding','legacy credential blocker removal','five-projection reconciliation event','invalid readback rejected before writes','expired HQ timestamps remain telemetry when bindings and capabilities are valid']}) + '\n');
}
main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
