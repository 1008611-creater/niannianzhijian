'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const step02 = require('./bridge/niannian_redraw_step02_vertical');
const {THREADS} = require('./bridge/mac_codex_app_employee_bootstrap');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n');
}

async function treeSnapshot(root) {
  const rows = [];
  async function visit(current, relative = '') {
    for (const entry of (await fsp.readdir(current, {withFileTypes:true})).sort((a,b) => a.name.localeCompare(b.name))) {
      const exact = path.join(current, entry.name), rel = path.join(relative, entry.name), stats = await fsp.lstat(exact);
      if (entry.isDirectory()) { rows.push({path:rel,type:'dir',mtimeMs:stats.mtimeMs}); await visit(exact, rel); }
      else { const bytes = await fsp.readFile(exact); rows.push({path:rel,type:'file',mtimeMs:stats.mtimeMs,bytes:bytes.length,sha256:sha256(bytes)}); }
    }
  }
  await visit(root);
  return rows;
}

function effects() {
  return step02.falseEffects();
}

async function fixture(root, suffix = 'A') {
  const projectId = 'NN-STEP02-' + suffix + '-0001';
  const ownerId = 'owner-' + suffix;
  const sourceBytes = Buffer.from('source-' + suffix);
  const sourceSha = sha256(sourceBytes);
  const jobRoot = path.join(root, 'jobs', projectId);
  const sourcePath = path.join(root, 'uploads', projectId + '.mp4');
  await fsp.mkdir(path.dirname(sourcePath), {recursive:true});
  await fsp.writeFile(sourcePath, sourceBytes);
  const project = {id:projectId,ownerId,name:'Step02 fixture ' + suffix,source:{storedPath:sourcePath,sha256:sourceSha,bytes:sourceBytes.length,originalName:'fixture.mp4',mimeType:'video/mp4'},settingsVersion:2,preflight:{status:'passed',durationSeconds:10},productionStatus:'step01_verified'};
  const task = {schema_version:'niannian_web_redraw_job_v1',job_id:projectId,local_job_id:'web_' + projectId.toLowerCase(),source_video:{exact_path:sourcePath,sha256:sourceSha,bytes:sourceBytes.length},source_media_contract:{duration_seconds:10,video_duration_seconds:9.9}};
  const rights = {schema_version:'niannian_source_rights_authority_v1',event_id:'rights-' + suffix,status:'confirmed',confirmed_by_user_id:ownerId,source_sha256:sourceSha,source_bytes:sourceBytes.length,scope:'source_video_redraw_full_chain_under_explicit_provider_and_delivery_gates',revoked:false,confirmed_at:'2026-07-15T00:00:00.000Z'};
  const manifest = {schema_version:'step01_evidence_manifest_v1',status:'verified',profile:'hq_full',downstream_consumable:true,source_sha256:sourceSha,source_bytes:sourceBytes.length,source_media_contract:{duration_seconds:10,video_duration_seconds:9.9},artifacts:[]};
  await writeJson(path.join(jobRoot, 'task.json'), task);
  await writeJson(path.join(jobRoot, 'rights_authority.json'), rights);
  await writeJson(path.join(jobRoot, 'step01_evidence_manifest.json'), manifest);
  const rightsEvidence = await step02.evidence(path.join(jobRoot, 'rights_authority.json'));
  const manifestEvidence = await step02.evidence(path.join(jobRoot, 'step01_evidence_manifest.json'));
  const employee = THREADS[0];
  const receipt = {schema_version:'niannian_redraw_step01_mac_employee_receipt_v2',status:'step01_verified',production_status:'step01_verified',step01_verified:true,downstream_consumable:true,remote_project_id:projectId,local_job_id:task.local_job_id,source_sha256:sourceSha,source_bytes:sourceBytes.length,rights_authority:{event_id:rights.event_id,sha256:rightsEvidence.sha256},settings_version:2,evidence_manifest:{relative_path:'step01_evidence_manifest.json',sha256:manifestEvidence.sha256,bytes:manifestEvidence.bytes},completion_event:{method:'turn/completed',thread_id:employee.thread_id,turn_id:'step01-turn-' + suffix,status:'completed',error:null},...effects()};
  const control = {schema_version:'niannian_redraw_step01_mac_app_control_receipt_v2',remote_project_id:projectId,local_job_id:task.local_job_id,source_sha256:sourceSha,rights_authority:{event_id:rights.event_id,sha256:rightsEvidence.sha256},settings_version:2,employee:{employee:employee.employee,title:employee.title,thread_id:employee.thread_id},completion_event:{method:'turn/completed',thread_id:employee.thread_id,turn_id:'step01-turn-' + suffix,status:'completed',error:null},...effects()};
  await writeJson(path.join(jobRoot, 'step01_employee_worker_receipt.json'), receipt);
  await writeJson(path.join(jobRoot, 'step01_employee_control_receipt.json'), control);
  return {project,jobRoot,rights,manifest};
}

function candidate(project, dispatch, overrides = {}) {
  return {
    schema_version:step02.SCHEMAS.candidate,
    status:'candidate',
    downstream_consumable:false,
    test_only:false,
    transaction_id:dispatch.transaction_id,
    dispatch_id:dispatch.dispatch_id,
    phase_key:dispatch.phase_key,
    project_id:project.id,
    job_id:dispatch.job_id,
    source_sha256:dispatch.source_sha256,
    rights_authority_sha256:dispatch.rights_authority_sha256,
    step01_manifest_sha256:dispatch.step01_manifest_sha256,
    settings_version:dispatch.settings_version,
    source_media_contract:{duration_seconds:10,visual_duration_seconds:9.9,trailing_audio_only_seconds:0.1},
    sourceRows:[
      {shot_id:'S001',source_start_sec:0,source_end_sec:4.8,story_beat:'开场',visual_composition:'竖屏中景，一名角色站在画面左侧，桌面与手机位于前景。',blocking_movement:'角色面向画面右侧站立，右手靠近桌面手机，未越过中轴。',dialogue_ids:['D001']},
      {shot_id:'S002',source_start_sec:4.8,source_end_sec:9.9,story_beat:'回应',visual_composition:'反打近景，第二名角色位于画面右侧，背景门框形成纵向层次。',blocking_movement:'第二名角色朝左侧说话，第一名角色仅以前景肩部入画。',dialogue_ids:[]}
    ],
    dialogueBindings:[{dialogue_id:'D001',source_start_sec:0.4,source_end_sec:2.2,onset_shot:'S001',best_evidence_shot:'S001',source_speaker:'角色甲',source_text:'你终于来了。',evidence_basis:['qwen3_forced_aligner','dense_subtitle_frames','onscreen_mouth'],speaker_attribution_status:'onscreen_mouth'}],
    visualFactCards:[{fact_id:'VF001',shots:['S001'],fact:'手机平放在桌面前景，屏幕朝上。'}],
    textEvidence:[],
    assetCandidates:[{asset_id:'A001',type:'character',first_seen_shot:'S001',visual_identity:'深色上衣、短发角色甲'}],
    hardSceneCandidates:[],
    rejectedEvidence:[{evidence_id:'R001',reason:'ambient_noise',source_start_sec:9.9,source_end_sec:10}],
    blockers:[],
    ...effects(),
    ...overrides
  };
}

async function runCandidate(root, suffix = 'A') {
  const current = await fixture(root, suffix);
  const prepared = await step02.prepareStep02(current);
  assert.equal(prepared.status, 'prepared');
  const dispatched = await step02.prepareDispatch({...current,ownerId:current.project.ownerId});
  assert.equal(dispatched.dispatch.execution_mode, 'fixed_existing_mac_app_candidate_only');
  assert(THREADS.some(item => item.thread_id === dispatched.dispatch.employee.thread_id));
  assert.equal(dispatched.dispatch.transport.cli_fallback_allowed, false);
  assert.equal(dispatched.dispatch.transport.ephemeral_thread_allowed, false);
  const output = candidate(current.project, dispatched.dispatch);
  const fakeReturn = await step02.writeSignedFixtureReturn({...current,candidate:output});
  const reconciled = await step02.reconcileReturn({...current,returnRoot:fakeReturn.returnRoot});
  assert.equal(reconciled.status, 'candidate_return_ready');
  assert.equal(reconciled.step04_ready, false);
  assert.equal(reconciled.candidate.downstream_consumable, false);
  const inspection = await step02.inspectAcceptanceCandidate(current);
  assert.equal(inspection.status, 'fixture_valid_non_promotable');
  assert.equal(inspection.promotable, false);
  const treeBefore = await treeSnapshot(path.join(current.jobRoot, 'step02'));
  await assert.rejects(() => step02.acceptCandidate({...current,ownerId:current.project.ownerId}), error => error.code === 'STEP02_FIXTURE_CANDIDATE_NOT_ACCEPTABLE');
  assert.deepEqual(await treeSnapshot(path.join(current.jobRoot, 'step02')), treeBefore);
  const eventsBefore = await fsp.readFile(path.join(current.jobRoot, 'step02', 'evidence_events.jsonl'), 'utf8');
  await fsp.rm(path.join(current.jobRoot, 'step02', 'step02_reducer_receipt.json'), {force:true});
  await fsp.rm(path.join(current.jobRoot, 'step02', 'checkpoint.json'), {force:true});
  await fsp.rm(path.join(current.jobRoot, 'step02', 'gate_dashboard.json'), {force:true});
  await fsp.rm(path.join(current.jobRoot, 'step02', 'artifact_ledger.json'), {force:true});
  await step02.reduceStep02(current);
  const eventsAfter = await fsp.readFile(path.join(current.jobRoot, 'step02', 'evidence_events.jsonl'), 'utf8');
  assert.equal(eventsAfter, eventsBefore);
  const replayed = await step02.loadReview(current);
  assert.equal(replayed.status, 'candidate_return_ready');
  assert.equal(replayed.step04_ready, false);
  return {...current,dispatch:dispatched.dispatch};
}

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-step02-vertical-'));
  const previousFake = process.env.NIANNIAN_STEP02_FAKE_TRANSPORT;
  const previousSigned = process.env.NIANNIAN_STEP02_SIGNED_FIXTURE;
  process.env.NIANNIAN_STEP02_FAKE_TRANSPORT = 'on';
  process.env.NIANNIAN_STEP02_SIGNED_FIXTURE = 'on';
  try {
    const passed = await runCandidate(root, 'A');
    await runCandidate(root, 'B');
    assert(step02.statusRequiresStep02Acceptance('step02_accepted'));
    assert(step02.statusRequiresStep02Acceptance('running_step04'));
    assert(step02.statusRequiresStep02Acceptance('sent'));
    assert(!step02.statusRequiresStep02Acceptance('step02_return_ready'));

    await assert.rejects(() => step02.acceptCandidate({...passed,ownerId:'foreign-owner'}), error => error.code === 'STEP02_OWNER_SCOPE_INVALID');
    await assert.rejects(() => step02.verifyAcceptedForProject(passed), error => error.code === 'STEP02_EVIDENCE_MISSING');

    const foreign = await fixture(root, 'C');
    await step02.prepareStep02(foreign);
    await assert.rejects(() => step02.verifyAcceptedForProject(foreign), error => error.code === 'STEP02_EVIDENCE_MISSING');

    const blocked = await fixture(root, 'D');
    await step02.prepareStep02(blocked);
    const blockedDispatch = (await step02.prepareDispatch({...blocked,ownerId:blocked.project.ownerId})).dispatch;
    const invalid = candidate(blocked.project, blockedDispatch, {sourceRows:[{shot_id:'S001',source_start_sec:0,source_end_sec:9.95,story_beat:'bad',visual_composition:'画面',blocking_movement:'站位',dialogue_ids:[]}]});
    await assert.rejects(() => step02.writeFakeReturn({...blocked,candidate:invalid}), error => error.code === 'STEP02_SOURCE_ROW_INVALID');

    const fakeOnly = await fixture(root, 'E');
    await step02.prepareStep02(fakeOnly);
    const fakeDispatch = (await step02.prepareDispatch({...fakeOnly,ownerId:fakeOnly.project.ownerId})).dispatch;
    const fakeReturn = await step02.writeFakeReturn({...fakeOnly,candidate:candidate(fakeOnly.project, fakeDispatch)});
    await step02.reconcileReturn({...fakeOnly,returnRoot:fakeReturn.returnRoot});
    const fakeTreeBefore = await treeSnapshot(path.join(fakeOnly.jobRoot, 'step02'));
    await assert.rejects(() => step02.acceptCandidate({...fakeOnly,ownerId:fakeOnly.project.ownerId}), error => error.code === 'STEP02_TEST_ONLY_CANDIDATE_NOT_ACCEPTABLE');
    assert.deepEqual(await treeSnapshot(path.join(fakeOnly.jobRoot, 'step02')), fakeTreeBefore);
    await assert.rejects(() => step02.verifyAcceptedForProject(fakeOnly), error => error.code === 'STEP02_EVIDENCE_MISSING');

    const sourceTamper = await fixture(root, 'F');
    await step02.prepareStep02(sourceTamper);
    await fsp.appendFile(sourceTamper.project.source.storedPath, 'tamper');
    await assert.rejects(() => step02.prepareDispatch({...sourceTamper,ownerId:sourceTamper.project.ownerId}), error => error.code === 'STEP02_SOURCE_FILE_BINDING_INVALID');

    const revoked = await fixture(root, 'G');
    await step02.prepareStep02(revoked);
    const revokedDispatch = (await step02.prepareDispatch({...revoked,ownerId:revoked.project.ownerId})).dispatch;
    const revokedReturn = await step02.writeSignedFixtureReturn({...revoked,candidate:candidate(revoked.project,revokedDispatch)});
    await step02.reconcileReturn({...revoked,returnRoot:revokedReturn.returnRoot});
    const revokedRightsPath = path.join(revoked.jobRoot, 'rights_authority.json');
    const revokedRights = JSON.parse(await fsp.readFile(revokedRightsPath, 'utf8'));
    revokedRights.revoked = true;
    await writeJson(revokedRightsPath, revokedRights);
    const revokedTreeBefore = await treeSnapshot(path.join(revoked.jobRoot, 'step02'));
    await assert.rejects(() => step02.acceptCandidate({...revoked,ownerId:revoked.project.ownerId}), error => error.code === 'STEP02_RIGHTS_AUTHORITY_INVALID');
    assert.deepEqual(await treeSnapshot(path.join(revoked.jobRoot, 'step02')), revokedTreeBefore);

    process.stdout.write(JSON.stringify({ok:true,verified:['exact project/source/rights/settings/Step01 authority snapshot and fresh reread','source file tamper and rights revocation fail before dispatch/accept','fixed existing App employee dispatch contract; CLI/ephemeral/latest forbidden','candidate-only receipt and atomic return import','clean sourceRows/dialogueBindings contract and visual-duration boundary','events-first stable-id candidate projection rebuild','signed fixture structurally valid but non-promotable','fake/test-only and fixture acceptance typed rejection with disk zero mutation','owner/foreign/missing acceptance blocked','media provider/spend/local edit all false','no real Mac turn claimed']}) + '\n');
  } finally {
    if (previousFake === undefined) delete process.env.NIANNIAN_STEP02_FAKE_TRANSPORT;
    else process.env.NIANNIAN_STEP02_FAKE_TRANSPORT = previousFake;
    if (previousSigned === undefined) delete process.env.NIANNIAN_STEP02_SIGNED_FIXTURE;
    else process.env.NIANNIAN_STEP02_SIGNED_FIXTURE = previousSigned;
    await fsp.rm(root, {recursive:true,force:true});
  }
}

main().catch(error => {
  process.stderr.write(String(error.stack || error) + '\n');
  process.exitCode = 1;
});
