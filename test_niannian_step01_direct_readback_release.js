'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const projectId = 'NN-20260715083045-8120F5';
const directJobId = 'web_nn-20260715083045-8120f5';
const runId = 'analysis-1-0123456789abcdef01234567';
const sourceSha = 'a'.repeat(64);
const authorizationId = 'step01-0123456789abcdef01234567';
const nowMs = Date.now();

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function bytes(value) { return Buffer.from(JSON.stringify(value, null, 2) + '\n'); }
async function writeJson(filePath, value) { await fsp.mkdir(path.dirname(filePath), {recursive:true}); await fsp.writeFile(filePath, bytes(value)); }
function receipt(id, value) { const valueBytes = bytes(value); return {receipt_id:id,project_relative_path:'output/mac-employee-training/'+id+'.json',status:'present',sha256:sha(valueBytes),bytes:valueBytes.length,receipt:value}; }

function readback() {
  const checked = new Date(nowMs - 60000).toISOString();
  const audits = Object.fromEntries(['credential:mimo_asr','credential:paddle_ocr','runtime:transnetv2','runtime:hq','runtime:forced_aligner'].map(key => [key,{capability:key,ready:true,status:'ready',checked_at:checked,evidence:{method:'synthetic_non_project_health'}}]));
  const gate = {schema_version:'niannian_step01_hq_full_gate_receipt_v2',status:'ready',ready:true,host:{platform:'darwin',project_root:'/Users/lsb/AI-Brain/niannian-ai-canonical-local'},settings_binding:{profile:'mac-step01-hq-full-evidence-v2',version:2},capability_audits:audits,composite:{ok:true},provider_upload_requested:false,provider_submit_requested:false,spend_requested:false,real_project_media_processed:false,real_delivery:false,checked_at:checked,expires_at:new Date(nowMs + 10 * 60 * 1000).toISOString()};
  const promotion = {schema_version:'niannian_step01_hq_full_toolchain_contract_v1',status:'accepted',execution_authority_granted:true,profile:'hq_full',profile_release:'mac-step01-hq-full-evidence-v2',stable_batch_fallback_allowed:false,settings_binding:{version:2,profile:'mac-step01-hq-full-evidence-v2'},acceptance_gates:{fresh_hq_full_gate_receipt:{exact_path:'/Users/lsb/AI-Brain/niannian-ai-canonical-local/output/mac-employee-training/mac-step01-hq-full-gate-receipt.json',sha256:sha(bytes(gate)),bytes:bytes(gate).length,status:'verified',required:true,ready:true}}};
  return {schema_version:'niannian_mac_hq_fixed_readback_v1',status:'complete',project_root_binding:'/Users/lsb/AI-Brain/niannian-ai-canonical-local',read_only:true,fixed_whitelist:true,shell_command_requested:false,media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,project_media_processed:false,bridge_release:{status:'installed_verified',release_version:'2026.07.18.26',manifest_sha256:'b'.repeat(64),rollback_record:true},receipts:[receipt('hq_gate',gate),receipt('hq_composite',{status:'passed'}),receipt('analysis_probe',{status:'passed'}),receipt('hq_promotion',promotion),receipt('hq_exit',{exit_code:0})],read_at:new Date(nowMs).toISOString()};
}

function task(jobId) {
  return {
    job_id:jobId,
    remote_job_id:projectId,
    source_video:{sha256:sourceSha,bytes:123},
    analysis_run:{id:runId,source_sha256:sourceSha,source_bytes:123,source_revision:1},
    analysis_authorization:{event_id:authorizationId,source_sha256:sourceSha,settings_version:2}
  };
}

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-direct-readback-release-'));
  const canonicalJobRoot = path.join(root, 'canonical');
  const directJobRoot = path.join(root, 'direct');
  const fixed = readback();
  const fixedBytes = bytes(fixed);
  const currentRun = {schema_version:'niannian_step01_current_run_v1',project_id:projectId,analysis_run_id:runId,source_sha256:sourceSha,source_bytes:123,source_revision:1,settings_version:2,authorization_event_id:authorizationId,hq_readback:{sha256:sha(fixedBytes),bytes:fixedBytes.length,bridge_release:fixed.bridge_release}};
  try {
    await Promise.all([
      writeJson(path.join(canonicalJobRoot, 'task.json'), task(projectId)),
      writeJson(path.join(canonicalJobRoot, 'current_run.json'), currentRun),
      writeJson(path.join(directJobRoot, 'task.json'), task(directJobId))
    ]);
    await fsp.writeFile(path.join(canonicalJobRoot, 'mac_hq_fixed_readback.json'), fixedBytes);
    const release = require('./bridge/niannian_step01_direct_readback_release');
    const first = await release.syncCanonicalReadbackToDirect({canonicalJobRoot,directJobRoot,now:'2026-07-18T12:00:00.000Z'});
    assert.equal(first.status, 'synced');
    assert.equal(first.release.analysis_run_id, runId);
    assert.equal(first.release.authorization_event_id, authorizationId);
    assert.equal(first.release.hq_readback.sha256, sha(fixedBytes));
    assert.equal(first.release.hq_readback.hq_gate.sha256, fixed.receipts[0].sha256);
    assert.deepEqual(await fsp.readFile(path.join(directJobRoot, 'mac_hq_fixed_readback.json')), fixedBytes);
    assert.equal((await release.readVerifiedDirectRelease({directJobRoot})).release.status, 'ready');
    const second = await release.syncCanonicalReadbackToDirect({canonicalJobRoot,directJobRoot,now:'2026-07-18T12:01:00.000Z'});
    assert.equal(second.status, 'already_synced');
    const tamperedReadback = {...fixed, evidence_test_marker:'tampered-but-schema-valid'};
    await fsp.writeFile(path.join(directJobRoot, 'mac_hq_fixed_readback.json'), bytes(tamperedReadback));
    await assert.rejects(() => release.readVerifiedDirectRelease({directJobRoot}), /step01_direct_readback_release_mismatch/);
    await fsp.writeFile(path.join(directJobRoot, 'mac_hq_fixed_readback.json'), fixedBytes);
    const invalidTask = task(directJobId);
    invalidTask.analysis_authorization.event_id = 'step01-ffffffffffffffffffffffff';
    await writeJson(path.join(directJobRoot, 'task.json'), invalidTask);
    await assert.rejects(() => release.syncCanonicalReadbackToDirect({canonicalJobRoot,directJobRoot}), /authority_binding_mismatch/);
  } finally {
    await fsp.rm(root, {recursive:true,force:true});
  }
  process.stdout.write(JSON.stringify({ok:true,verified:['canonical/direct run source settings authorization binding','fixed readback SHA and HQ gate binding','commit-marker release and idempotent resync','tampered direct readback rejected','mismatched direct authorization rejected']}) + '\n');
}

main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
