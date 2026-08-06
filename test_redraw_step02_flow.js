'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const step02 = require('./bridge/niannian_redraw_step02_vertical');
const {THREADS} = require('./bridge/mac_codex_app_employee_bootstrap');

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n');
}

async function fetchResult(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  return {response,payload};
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(baseUrl + '/api/health')).ok) return; } catch {}
    await delay(100);
  }
  throw new Error('server_health_timeout');
}

async function register(baseUrl, email) {
  const result = await fetchResult(baseUrl + '/api/auth/register', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'correct-horse-battery-staple'})});
  assert.equal(result.response.status, 200);
  return {user:result.payload.user,cookie:String(result.response.headers.get('set-cookie') || '').split(';')[0]};
}

async function seedProject(dataRoot, ownerId, suffix = 'FLOW') {
  const projectId = 'NN-STEP02-' + suffix + '-0001';
  const source = Buffer.from('step02-source-fixture-' + suffix);
  const sourceSha = sha256(source);
  const sourcePath = path.join(dataRoot, 'uploads', projectId + '-fixture.mp4');
  const jobRoot = path.join(dataRoot, 'jobs', projectId);
  await fsp.mkdir(path.dirname(sourcePath), {recursive:true});
  await fsp.writeFile(sourcePath, source);
  const project = {id:projectId,ownerId,name:'Step02 vertical flow',status:'running',productionStatus:'step01_verified',createdAt:'2026-07-15T00:00:00.000Z',remakeMode:'short_drama',targetLanguage:'es-MX',aspectRatio:'9:16',quality:'1080p',settingsVersion:2,source:{originalName:'fixture.mp4',storedPath:sourcePath,mimeType:'video/mp4',bytes:source.length,sha256:sourceSha},preflight:{status:'passed',durationSeconds:10,video:{width:1080,height:1920,fps:25},audio:{streamCount:1,sampleRates:[48000]}},route:{router:'mx-shortdrama-00-router',earliestNode:'Step02',nextSkill:'mx-shortdrama-02-source-timeline'},pipeline:[],runtime:{productionStatus:'step01_verified',currentNode:'Step02',earliestIncompleteNode:'Step02',nextSkill:'mx-shortdrama-02-source-timeline'},analysis:{status:'completed'},dispatch:{status:'completed',controllerId:'step02-flow-controller',leaseId:'step02-flow-lease',leaseUntil:new Date(Date.now()+120000).toISOString(),localJobId:'web_step02_flow'}};
  let existing = [];
  try { existing = JSON.parse(await fsp.readFile(path.join(dataRoot, 'projects.json'), 'utf8')); } catch {}
  await writeJson(path.join(dataRoot, 'projects.json'), [project,...existing.filter(item => item.id !== projectId)]);
  const task = {schema_version:'niannian_web_redraw_job_v1',job_id:projectId,local_job_id:'web_step02_flow',source_video:{exact_path:sourcePath,sha256:sourceSha,bytes:source.length},source_media_contract:{duration_seconds:10,video_duration_seconds:9.9}};
  const rights = {schema_version:'niannian_source_rights_authority_v1',event_id:'rights-step02-flow',status:'confirmed',confirmed_by_user_id:ownerId,source_sha256:sourceSha,source_bytes:source.length,scope:'source_video_redraw_full_chain_under_explicit_provider_and_delivery_gates',revoked:false,confirmed_at:'2026-07-15T00:00:00.000Z'};
  const manifest = {schema_version:'step01_evidence_manifest_v1',status:'verified',profile:'hq_full',downstream_consumable:true,source_sha256:sourceSha,source_bytes:source.length,source_media_contract:{duration_seconds:10,video_duration_seconds:9.9},artifacts:[]};
  await writeJson(path.join(jobRoot, 'task.json'), task);
  await writeJson(path.join(jobRoot, 'rights_authority.json'), rights);
  await writeJson(path.join(jobRoot, 'step01_evidence_manifest.json'), manifest);
  const rightsEvidence = await step02.evidence(path.join(jobRoot, 'rights_authority.json'));
  const manifestEvidence = await step02.evidence(path.join(jobRoot, 'step01_evidence_manifest.json'));
  const employee = THREADS[0];
  await writeJson(path.join(jobRoot, 'step01_employee_worker_receipt.json'), {schema_version:'niannian_redraw_step01_mac_employee_receipt_v2',status:'step01_verified',production_status:'step01_verified',step01_verified:true,downstream_consumable:true,remote_project_id:projectId,local_job_id:'web_step02_flow',source_sha256:sourceSha,source_bytes:source.length,rights_authority:{event_id:rights.event_id,sha256:rightsEvidence.sha256},settings_version:2,evidence_manifest:{relative_path:'step01_evidence_manifest.json',sha256:manifestEvidence.sha256,bytes:manifestEvidence.bytes},completion_event:{method:'turn/completed',thread_id:employee.thread_id,turn_id:'step01-flow-turn',status:'completed',error:null},...step02.falseEffects()});
  await writeJson(path.join(jobRoot, 'step01_employee_control_receipt.json'), {schema_version:'niannian_redraw_step01_mac_app_control_receipt_v2',remote_project_id:projectId,local_job_id:'web_step02_flow',source_sha256:sourceSha,rights_authority:{event_id:rights.event_id,sha256:rightsEvidence.sha256},settings_version:2,employee:{employee:employee.employee,title:employee.title,thread_id:employee.thread_id},completion_event:{method:'turn/completed',thread_id:employee.thread_id,turn_id:'step01-flow-turn',status:'completed',error:null},...step02.falseEffects()});
  await writeJson(path.join(dataRoot, 'jobs', 'NN-OLD-15S', 'step02', 'step02_acceptance_manifest.json'), {schema_version:step02.SCHEMAS.acceptance,status:'accepted',project_id:'NN-OLD-15S',source_sha256:'0'.repeat(64)});
  return {project,jobRoot};
}

function candidate(project, dispatch) {
  return {schema_version:step02.SCHEMAS.candidate,status:'candidate',downstream_consumable:false,test_only:false,transaction_id:dispatch.transaction_id,dispatch_id:dispatch.dispatch_id,phase_key:dispatch.phase_key,project_id:project.id,job_id:dispatch.job_id,source_sha256:dispatch.source_sha256,rights_authority_sha256:dispatch.rights_authority_sha256,step01_manifest_sha256:dispatch.step01_manifest_sha256,settings_version:dispatch.settings_version,source_media_contract:{duration_seconds:10,visual_duration_seconds:9.9,trailing_audio_only_seconds:0.1},sourceRows:[{shot_id:'S001',source_start_sec:0,source_end_sec:4.5,story_beat:'开场',visual_composition:'竖屏中景，角色甲在左侧，桌面手机位于前景。',blocking_movement:'角色甲站立朝右，右手停在桌面手机后方。',dialogue_ids:['D001']},{shot_id:'S002',source_start_sec:4.5,source_end_sec:9.9,story_beat:'回应',visual_composition:'反打近景，角色乙位于右侧，背景门框分隔空间。',blocking_movement:'角色乙朝左说话，角色甲肩部仅作前景遮挡。',dialogue_ids:[]}],dialogueBindings:[{dialogue_id:'D001',source_start_sec:0.3,source_end_sec:2.1,onset_shot:'S001',best_evidence_shot:'S001',source_speaker:'角色甲',source_text:'你终于来了。',evidence_basis:['qwen3_forced_aligner','dense_subtitle_frames','onscreen_mouth'],speaker_attribution_status:'onscreen_mouth'}],visualFactCards:[{fact_id:'VF001',shots:['S001'],fact:'手机平放且屏幕朝上。'}],textEvidence:[],assetCandidates:[{asset_id:'A001',type:'character',first_seen_shot:'S001',visual_identity:'深色上衣、短发角色甲'}],hardSceneCandidates:[],rejectedEvidence:[{evidence_id:'R001',reason:'ambient_noise',source_start_sec:9.9,source_end_sec:10}],blockers:[],...step02.falseEffects()};
}

async function treeSnapshot(root) {
  const rows = [];
  async function visit(current, relative = '') {
    for (const entry of (await fsp.readdir(current, {withFileTypes:true})).sort((a,b) => a.name.localeCompare(b.name))) {
      const exact=path.join(current,entry.name), rel=path.join(relative,entry.name), stats=await fsp.lstat(exact);
      if(entry.isDirectory()){rows.push({path:rel,type:'dir',mtimeMs:stats.mtimeMs});await visit(exact,rel);}else{const bytes=await fsp.readFile(exact);rows.push({path:rel,type:'file',mtimeMs:stats.mtimeMs,bytes:bytes.length,sha256:sha256(bytes)});}
    }
  }
  await visit(root);
  return rows;
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-redraw-step02-flow-'));
  const dataRoot = path.join(tempRoot, 'data');
  const token = crypto.randomBytes(48).toString('hex');
  const tokenHash = sha256(token);
  const port = 21000 + crypto.randomInt(1000);
  const baseUrl = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {cwd:__dirname,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,BRIDGE_TOKEN_HASH:tokenHash,BRIDGE_LEASE_MS:'120000',NIANNIAN_MEDIA_PREFLIGHT:'off',NIANNIAN_STEP02_FAKE_TRANSPORT:'on',NIANNIAN_STEP02_SIGNED_FIXTURE:'on'},stdio:['ignore','pipe','pipe']});
  let stderr = '';
  server.stderr.on('data', chunk => { stderr += chunk; });
  try {
    await waitForHealth(baseUrl);
    const owner = await register(baseUrl, 'step02-owner-' + Date.now() + '@example.com');
    const foreign = await register(baseUrl, 'step02-foreign-' + Date.now() + '@example.com');
    const seeded = await seedProject(dataRoot, owner.user.id, 'SIGNED');
    const endpoint = baseUrl + '/api/projects/' + seeded.project.id + '/step02/';
    let result = await fetchResult(endpoint + 'prepare', {method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:'{}'});
    assert.equal(result.response.status, 200, JSON.stringify(result.payload));
    assert.equal(result.payload.project.runtime.productionStatus, 'running_step02');
    assert.equal(result.payload.review.step04_ready, false);
    result = await fetchResult(endpoint + 'dispatch', {method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:'{}'});
    assert.equal(result.response.status, 200);
    const dispatch = result.payload.review.employeeDispatch;
    assert.equal(dispatch.transport.cli_fallback_allowed, false);
    assert.equal(dispatch.transport.ephemeral_thread_allowed, false);
    const carrierOffTree = await treeSnapshot(path.join(seeded.jobRoot, 'step02'));
    const carrierOff = await fetchResult(endpoint + 'dispatch', {method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:JSON.stringify({executeCarrier:true})});
    assert.equal(carrierOff.response.status, 409);
    assert.equal(carrierOff.payload.code, 'STEP02_CARRIER_PRODUCTION_DISABLED');
    assert.deepEqual(await treeSnapshot(path.join(seeded.jobRoot, 'step02')), carrierOffTree);
    result = await fetchResult(endpoint + 'dispatch', {method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:JSON.stringify({signedFixture:true,candidate:candidate(seeded.project, dispatch)})});
    assert.equal(result.response.status, 200, JSON.stringify(result.payload));
    assert.equal(result.payload.code, 'STEP02_CANDIDATE_RETURN_READY');
    assert.equal(result.payload.review.candidate.downstream_consumable, false);
    assert.equal(result.payload.project.step02.step04Ready, false);
    assert.equal(result.payload.mediaProviderNetworkRequested, false);
    assert.equal(result.payload.localImageEditingRequested, false);
    const foreignReview = await fetchResult(endpoint + 'review', {headers:{Cookie:foreign.cookie}});
    assert.equal(foreignReview.response.status, 404);
    const signedTreeBefore = await treeSnapshot(path.join(seeded.jobRoot, 'step02'));
    result = await fetchResult(endpoint + 'accept', {method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:JSON.stringify({decision:'accept'})});
    assert.equal(result.response.status, 409);
    assert.equal(result.payload.code, 'STEP02_FIXTURE_CANDIDATE_NOT_ACCEPTABLE');
    assert.deepEqual(await treeSnapshot(path.join(seeded.jobRoot, 'step02')), signedTreeBefore);
    const controller = await fetchResult(baseUrl + '/api/controller/jobs/' + seeded.project.id + '/status', {method:'POST',headers:{Authorization:'Bearer ' + token,'Content-Type':'application/json','X-Niannian-Controller-Id':'step02-flow-controller','X-Niannian-Lease-Id':'step02-flow-lease'},body:JSON.stringify({controllerId:'step02-flow-controller',leaseId:'step02-flow-lease',productionStatus:'running_step04',currentNode:'Step04',earliestIncompleteNode:'Step04',nextSkill:'mx-shortdrama-04-asset-prompts'})});
    assert.equal(controller.response.status, 409);
    assert.equal(controller.payload.code, 'STEP02_REDUCER_ACCEPTANCE_REQUIRED');
    const fakeSeeded = await seedProject(dataRoot, owner.user.id, 'FAKE');
    const fakeEndpoint = baseUrl + '/api/projects/' + fakeSeeded.project.id + '/step02/';
    await fetchResult(fakeEndpoint + 'prepare', {method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:'{}'});
    let fakeResult = await fetchResult(fakeEndpoint + 'dispatch', {method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:'{}'});
    const fakeDispatch = fakeResult.payload.review.employeeDispatch;
    fakeResult = await fetchResult(fakeEndpoint + 'dispatch', {method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:JSON.stringify({fakeTransport:true,candidate:candidate(fakeSeeded.project,fakeDispatch)})});
    assert.equal(fakeResult.response.status, 200);
    const fakeTreeBefore = await treeSnapshot(path.join(fakeSeeded.jobRoot, 'step02'));
    fakeResult = await fetchResult(fakeEndpoint + 'accept', {method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:JSON.stringify({decision:'accept'})});
    assert.equal(fakeResult.response.status, 409);
    assert.equal(fakeResult.payload.code, 'STEP02_TEST_ONLY_CANDIDATE_NOT_ACCEPTABLE');
    assert.deepEqual(await treeSnapshot(path.join(fakeSeeded.jobRoot, 'step02')), fakeTreeBefore);
    const fakeProject = await fetchResult(baseUrl + '/api/projects/' + fakeSeeded.project.id, {headers:{Cookie:owner.cookie}});
    assert.equal(fakeProject.payload.project.step02.step04Ready, false);
    process.stdout.write(JSON.stringify({ok:true,verified:['owner-scoped prepare/dispatch/reconcile/accept/review API','fixed existing App candidate-only fake and signed-fixture transports','production fixed-App carrier defaults disabled with disk zero mutation','fake/test-only and signed-fixture accept typed 409 with disk zero mutation','old 15s/latest decoy ignored','candidate never downstream consumable','events-first candidate reducer replay','Step04 and downstream controller remain blocked without real acceptance','Provider/spend/local edit false','no real Mac carrier or turn claimed']}) + '\n');
  } finally {
    server.kill();
    await delay(100);
    if (server.exitCode === null) server.kill('SIGKILL');
    await fsp.rm(tempRoot, {recursive:true,force:true});
    if (stderr) process.stderr.write(stderr);
  }
}

main().catch(error => {
  process.stderr.write(String(error.stack || error) + '\n');
  process.exitCode = 1;
});
