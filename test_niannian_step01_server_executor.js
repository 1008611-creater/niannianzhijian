'use strict';

const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const executor = require('./bridge/niannian_step01_server_executor');
const events = require('./bridge/niannian_step01_evidence_events');
const evidencePackage = require('./bridge/niannian_step01_evidence_package');

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function command(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio:['ignore','pipe','pipe']}); let stderr = '';
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(stderr)));
  });
}

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-step01-server-'));
  try {
    const dataRoot = path.join(root, 'data');
    const projectId = 'NN-20260727000000-ABC123';
    const runId = 'analysis-1-0123456789abcdef01234567';
    const uploadRoot = path.join(dataRoot, 'uploads');
    const jobRoot = path.join(dataRoot, 'jobs', projectId);
    await fsp.mkdir(uploadRoot, {recursive:true});
    await fsp.mkdir(jobRoot, {recursive:true});
    const sourcePath = path.join(uploadRoot, 'fixture.mp4');
    await command(process.env.NIANNIAN_FFMPEG_PATH || 'ffmpeg', ['-y','-f','lavfi','-i','color=c=blue:s=320x568:d=2','-f','lavfi','-i','anullsrc=r=16000:cl=mono','-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',sourcePath]);
    const source = await fsp.readFile(sourcePath);
    const project = {id:projectId,ownerId:'USR-TEST',sourceRevision:1,source:{storage_key:'uploads/fixture.mp4',bytes:source.length,sha256:sha256(source)},analysis:{runId,sourceRevision:1,sourceSha256:sha256(source),runtimeProfile:executor.PROFILE}};
    await fsp.writeFile(path.join(dataRoot, 'projects.json'), JSON.stringify([project], null, 2) + '\n');
    await fsp.writeFile(path.join(jobRoot, 'task.json'), JSON.stringify({runtime_profile:executor.PROFILE,analysis_authorization:{allowed_scope:'step01_evidence_only',allowed_skill_routes:executor.ROUTES}}, null, 2) + '\n');
    await events.appendEvidenceEvent(path.join(jobRoot, 'evidence_events.jsonl'), {type:'analysis_run_created',project_id:projectId,analysis_run_id:runId,source_revision:1,source_sha256:project.source.sha256,status:'queued',evidence_sha256:sha256('run')});
    let submitted = null;
    let requestCount = 0;
    const response = await executor.runProject({
      projectId,
      dataRoot,
      env:{NIANNIAN_STEP01_GPT_API_BASE_URL:'https://example.invalid/v1',NIANNIAN_STEP01_GPT_API_KEY:'test-key',NIANNIAN_STEP01_GPT_MODEL:'gpt-5.6-sol'},
      fetchImpl:async (_url, options) => {
        requestCount += 1;
        submitted = JSON.parse(options.body);
        return {ok:true,status:200,json:async () => ({output_text:JSON.stringify({segments:[{source_segment_id:'S0001',observed_facts:['蓝色画面。'],visible_text:[],uncertainty:['未对音频内容作出判断。']} ]})})};
      }
    });
    assert.equal(response.status, 'evidence_ready');
    assert.equal(response.runtime_profile, executor.PROFILE);
    assert.equal(response.worker.model, 'gpt-5.6-sol');
    assert.equal(requestCount, 1);
    assert.equal(submitted.model, 'gpt-5.6-sol');
    assert.equal(submitted.store, false);
    assert.match(submitted.instructions, /mx-shortdrama-00-router/);
    const outputRoot = path.join(jobRoot, 'analysis_runs', runId, 'evidence');
    const validated = await evidencePackage.validateStep01EvidencePackage({outputRoot,expected:{projectId,analysisRunId:runId,sourceSha256:project.source.sha256,sourceRevision:1}});
    assert.equal(validated.index.quality_profile, executor.PROFILE);
    assert.equal(validated.index.counts.shots, 1);
    const manifest = JSON.parse(await fsp.readFile(path.join(jobRoot, 'analysis_runs', runId, 'server_evidence', 'step01_evidence_manifest.json'), 'utf8'));
    assert.equal(manifest.execution.provider_submission_requested, false);
    assert.equal(manifest.execution.package_send_requested, false);
    assert.equal(manifest.execution.local_image_editing_requested, false);
    const reduced = events.reduceEvidenceEvents(await events.readEvidenceEvents(path.join(jobRoot, 'evidence_events.jsonl')),{projectId,analysisRunId:runId,sourceSha256:project.source.sha256,sourceRevision:1});
    assert.equal(reduced.status, 'evidence_ready');
    assert.equal(reduced.accepted, true);
    const replay = await executor.runProject({
      projectId,
      dataRoot,
      env:{NIANNIAN_STEP01_GPT_API_BASE_URL:'https://example.invalid/v1',NIANNIAN_STEP01_GPT_API_KEY:'test-key',NIANNIAN_STEP01_GPT_MODEL:'gpt-5.6-sol'},
      fetchImpl:async () => { throw new Error('completed run must not request GPT again'); }
    });
    assert.equal(replay.status, 'evidence_ready');
    assert.equal(requestCount, 1);
    process.stdout.write(JSON.stringify({ok:true,verified:['source SHA binding','ffprobe and frame extraction','allowlisted skill instructions','strict GPT JSON','server evidence manifest','hash-verified delivery package','server event reducer','no provider/package/image-edit effects']}) + '\n');
  } finally {
    await fsp.rm(root, {recursive:true,force:true});
  }
}

main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
