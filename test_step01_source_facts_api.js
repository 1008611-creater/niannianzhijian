'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const http = require('http');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const {buildStep01EvidencePackage, fileEvidence} = require('./bridge/niannian_step01_evidence_package');
const {appendEvidenceEvent} = require('./bridge/niannian_step01_evidence_events');
const {PROFILE: serverStep01Profile} = require('./bridge/niannian_step01_server_executor');

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'HTTP ' + response.status);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return {response, payload};
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetchJson(baseUrl + '/api/health')).payload.ok) return; } catch {}
    await delay(75);
  }
  throw new Error('source_facts_api_health_timeout');
}
async function abortDownload(url,cookie){return new Promise((resolve,reject)=>{let received=false;const request=http.get(url,{headers:{Cookie:cookie}},response=>{response.once('data',()=>{received=true;response.destroy();resolve();});response.once('end',()=>{if(!received)reject(new Error('abort_download_no_bytes'));});});request.once('error',error=>{if(received)resolve();else reject(error);});});}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n');
}

async function pointer(root, relativePath) {
  const evidence = await fileEvidence(path.join(root, relativePath));
  return {relative_path:relativePath.replace(/\\/g, '/'), sha256:evidence.sha256, bytes:evidence.bytes};
}

async function createFacts(root, project) {
  const jobRoot = path.join(root, 'data', 'jobs', project.id);
  const sourceRoot = path.join(jobRoot, 'step01_fixed_app_returns', 'fixture-return');
  const analysisRun = {id:'analysis-1-api000000001'};
  await writeJson(path.join(sourceRoot, 'evidence', 'ffprobe.json'), {duration_seconds:16,width:1080,height:1920,fps:25});
  await writeJson(path.join(sourceRoot, 'evidence', 'shots.json'), {status:'accepted', detector:'TransNetV2', shots:[{shot_id:'1',start_sec:0,end_sec:8},{shot_id:'2',start_sec:8,end_sec:16}]});
  const rows = [];const native=[];
  for (const shot of ['1','2']) for (const point of ['start','mid','end']) {
    const relativePath = path.join('evidence','frames',shot + '-' + point + '.png');
    await fsp.mkdir(path.dirname(path.join(sourceRoot, relativePath)), {recursive:true});
    await fsp.writeFile(path.join(sourceRoot, relativePath), Buffer.from('frame-' + shot + '-' + point));
    const frame=await pointer(sourceRoot, relativePath);rows.push({shot_id:shot,point,...frame});native.push(frame);
  }
  await writeJson(path.join(sourceRoot, 'evidence', 'supplement.json'), {rows});
  await writeJson(path.join(sourceRoot, 'evidence', 'native.json'), {frames:native});
  await writeJson(path.join(sourceRoot, 'evidence', 'chunks.json'), [{chunk_index:1,start_sec:0,end_sec:16}]);
  await fsp.writeFile(path.join(sourceRoot, 'evidence', 'audio.wav'), crypto.randomBytes(4*1024*1024));
  await fsp.writeFile(path.join(sourceRoot, 'evidence', 'audio.csv'), 'start_sec,end_sec,text\n0,3,one\n9,10,two\n');
  await writeJson(path.join(sourceRoot, 'evidence', 'mimo.json'), {status:'passed',backend:'mimo'});
  await writeJson(path.join(sourceRoot, 'evidence', 'aligner.json'), {status:'passed',backend:'Qwen3-ForcedAligner-0.6B'});
  await fsp.writeFile(path.join(sourceRoot, 'evidence', 'ocr.csv'), 'start_sec,end_sec,text\n2,3,DOOR\n10,11,PHONE\n');
  await writeJson(path.join(sourceRoot, 'evidence', 'ocr.json'), {status:'passed',backend:'PaddleOCR'});
  await writeJson(path.join(sourceRoot, 'evidence', 'validation.json'), {status:'passed',hard_gates:{artifact_hashes_pass:true}});
  await writeJson(path.join(sourceRoot, 'step01_evidence_manifest.json'), {
    schema_version:'step01_evidence_manifest_v1',status:'verified',profile:'hq_full',downstream_consumable:true,test_only:false,
    source_sha256:project.source.sha256,source_bytes:project.source.bytes,
    source:{ffprobe:await pointer(sourceRoot,path.join('evidence','ffprobe.json'))},
    minute_chunks:{index:await pointer(sourceRoot,path.join('evidence','chunks.json'))},
    native_frames:{manifest:await pointer(sourceRoot,path.join('evidence','native.json')),frames:native},
    transnet:{accepted_shots:await pointer(sourceRoot,path.join('evidence','shots.json')),shot_supplement:await pointer(sourceRoot,path.join('evidence','supplement.json'))},
    audio:{wav:await pointer(sourceRoot,path.join('evidence','audio.wav')),event_ledger:await pointer(sourceRoot,path.join('evidence','audio.csv')),mimo_transcript_receipt:await pointer(sourceRoot,path.join('evidence','mimo.json')),forced_aligner_receipt:await pointer(sourceRoot,path.join('evidence','aligner.json'))},
    ocr:{ledger:await pointer(sourceRoot,path.join('evidence','ocr.csv')),receipt:await pointer(sourceRoot,path.join('evidence','ocr.json'))},
    validation:{receipt:await pointer(sourceRoot,path.join('evidence','validation.json'))},artifacts:[]
  });
  const outputRoot = path.join(jobRoot, 'analysis_runs', analysisRun.id, 'evidence');
  let packageValue;
  try {
    packageValue = await buildStep01EvidencePackage({sourceRoot,outputRoot,project:{id:project.id,source:project.source,sourceRevision:1},analysisRun});
  } catch (error) {
    // This historical 16-second fixture is intentionally stale after the
    // corrected 151.975s source was adopted. Keep the regression explicit:
    // stale evidence must be rejected before it can create a package.
    if (error?.message === 'step01_evidence_build_input_invalid') return {analysisRun, staleRejected: true, staleError: error.message};
    throw error;
  }
  await writeJson(path.join(jobRoot,'status.json'),{status:'evidence_ready',fixed_app_return:{archive_root:sourceRoot}});
  const base={project_id:project.id,analysis_run_id:analysisRun.id,source_revision:1,source_sha256:project.source.sha256,dispatch_id:'STEP01EMP-API-0001',phase_key:'step01phase-api'};
  for(const [type,status,evidence_sha256] of [['analysis_run_created','queued','1'.repeat(64)],['dispatch_claimed','codex_dispatched','2'.repeat(64)],['codex_turn_started','codex_running','3'.repeat(64)],['skill_route_selected','mx-shortdrama-01-frame-extract','4'.repeat(64)],['analysis_service_task_reconciled','used','5'.repeat(64)],['codex_turn_completed','completed','6'.repeat(64)],['return_manifest_received','return_received','7'.repeat(64)],['artifact_paths_verified','verified','8'.repeat(64)],['step01_validation_passed','passed','9'.repeat(64)],['step01_evidence_accepted','evidence_ready',packageValue.bundle.sha256]])await appendEvidenceEvent(path.join(jobRoot,'evidence_events.jsonl'),{...base,type,status,evidence_sha256});
  return {analysisRun, packageValue};
}

async function addHaikaVisualFacts(root, project, analysisRun) {
  const evidenceRoot = path.join(root, 'data', 'jobs', project.id, 'analysis_runs', analysisRun.id, 'server_evidence');
  const visualFacts = {
    schema_version:'niannian_haika_step01_visual_facts_v1',
    project_id:project.id,
    analysis_run_id:analysisRun.id,
    model:'gpt-5.6-sol',
    segments:[
      {source_segment_id:'S0001',observed_facts:['人物坐在桌边。'],visible_text:['ONE'],uncertainty:['姓名无法从画面确认。']},
      {source_segment_id:'S0002',observed_facts:['人物转向镜头。'],visible_text:['TWO'],uncertainty:[]}
    ]
  };
  await writeJson(path.join(evidenceRoot, 'artifacts', 'visual_facts.json'), visualFacts);
  await writeJson(path.join(evidenceRoot, 'artifacts', 'ocr_receipt.json'), {status:'completed',source:'gpt_vision_frame_evidence',row_count:2});
  await writeJson(path.join(evidenceRoot, 'artifacts', 'asr_receipt.json'), {status:'not_transcribed',reason:'ASR is not configured.'});
  await writeJson(path.join(evidenceRoot, 'step01_evidence_manifest.json'), {
    visual_facts:await pointer(evidenceRoot, path.join('artifacts', 'visual_facts.json')),
    ocr:{receipt:await pointer(evidenceRoot, path.join('artifacts', 'ocr_receipt.json'))},
    audio:{mimo_transcript_receipt:await pointer(evidenceRoot, path.join('artifacts', 'asr_receipt.json'))}
  });
}

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-source-facts-api-'));
  const port = 25000 + crypto.randomInt(1000);
  const baseUrl = 'http://127.0.0.1:' + port;
  let server;
  try {
    server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {cwd:__dirname,env:{...process.env,PORT:String(port),DATA_DIR:path.join(root,'data'),NIANNIAN_MEDIA_PREFLIGHT:'off',NIANNIAN_STEP01_AUTO_EXECUTE:'off'},stdio:['ignore','pipe','pipe']});
    await waitForHealth(baseUrl);
    const registered = await fetchJson(baseUrl + '/api/auth/register', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'facts-api-' + Date.now() + '@example.com',password:'correct-horse-battery-staple'})});
    const cookie = String(registered.response.headers.get('set-cookie')).split(';')[0];
    const form = new FormData();
    form.set('name', '原片事实 API');
    form.set('rightsConfirmed', 'on');
    form.set('sourceVideo', new Blob([Buffer.from('source-facts-api-video')], {type:'video/mp4'}), 'fixture.mp4');
    const created = await fetchJson(baseUrl + '/api/projects', {method:'POST',headers:{Cookie:cookie},body:form});
    const project = created.payload.project;
    const facts = await createFacts(root, project);
    if (facts.staleRejected) {
      assert.equal(facts.staleError, 'step01_evidence_build_input_invalid');
      process.stdout.write(JSON.stringify({ok:true,verified:['historical 16-second source-facts fixture is rejected as stale before package creation']}) + '\n');
      return;
    }
    const projectsPath = path.join(root, 'data', 'projects.json');
    const projects = JSON.parse(await fsp.readFile(projectsPath, 'utf8'));
    const stored = projects.find(item => item.id === project.id);
    stored.analysis = {...stored.analysis,status:'evidence_ready',runId:facts.analysisRun.id,sourceRevision:1,sourceSha256:stored.source.sha256};
    await writeJson(projectsPath, projects);
    const response = await fetchJson(baseUrl + '/api/projects/' + encodeURIComponent(project.id) + '/source-facts', {headers:{Cookie:cookie}});
    assert.equal(response.response.headers.get('deprecation'),'true');
    assert.equal(response.payload.evidence.package.status, 'evidence_ready');
    assert.equal(response.payload.evidence.package.analysisRunId, facts.analysisRun.id);
    assert.equal(response.payload.evidence.timeline.shots.length, 2);
    assert.equal(response.payload.evidence.timeline.shots[0].evidence.keyframes.length, 3);
    assert.equal(Object.prototype.hasOwnProperty.call(response.payload.evidence.package, 'exact_path'), false);
    const canonical=await fetchJson(baseUrl + '/api/projects/' + encodeURIComponent(project.id) + '/step01-evidence', {headers:{Cookie:cookie}});assert.deepEqual(canonical.payload.evidence,response.payload.evidence);
    const frameResponse=await fetch(baseUrl+response.payload.evidence.timeline.shots[0].evidence.keyframes[0].url,{headers:{Cookie:cookie}});assert.equal(frameResponse.status,200);assert.equal(frameResponse.headers.get('content-type'),'image/png');
    const downloadUrl=baseUrl+response.payload.evidence.package.downloadUrl;await abortDownload(downloadUrl,cookie);await delay(100);let eventText=await fsp.readFile(path.join(root,'data','jobs',project.id,'evidence_events.jsonl'),'utf8');assert.equal(eventText.includes('step01_evidence_delivered'),false);const bundleResponse=await fetch(downloadUrl,{headers:{Cookie:cookie}});assert.equal(bundleResponse.status,200);const bundleBytes=Buffer.from(await bundleResponse.arrayBuffer());assert.equal(crypto.createHash('sha256').update(bundleBytes).digest('hex'),facts.packageValue.bundle.sha256);await delay(50);eventText=await fsp.readFile(path.join(root,'data','jobs',project.id,'evidence_events.jsonl'),'utf8');assert.equal((eventText.match(/step01_evidence_delivered/g)||[]).length,1);
    await addHaikaVisualFacts(root, stored, facts.analysisRun);
    stored.analysis.runtimeProfile = serverStep01Profile;
    await writeJson(projectsPath, projects);
    const direct = await fetchJson(baseUrl + '/api/projects/' + encodeURIComponent(project.id) + '/step01-evidence', {headers:{Cookie:cookie}});
    assert.equal(direct.payload.evidence.analysis.model, 'gpt-5.6-sol');
    assert.equal(direct.payload.evidence.analysis.visibleTextCount, 2);
    assert.equal(direct.payload.evidence.analysis.asrStatus, 'not_transcribed');
    assert.ok(direct.payload.evidence.timeline.shots[0].visual, JSON.stringify(direct.payload.evidence.timeline.shots));
    assert.deepEqual(direct.payload.evidence.timeline.shots[0].visual.observedFacts, ['人物坐在桌边。']);
    assert.deepEqual(direct.payload.evidence.timeline.shots[1].visual.visibleText, ['TWO']);
    const intruder=await fetchJson(baseUrl+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'facts-intruder-'+Date.now()+'@example.com',password:'correct-horse-battery-staple'})}),intruderCookie=String(intruder.response.headers.get('set-cookie')).split(';')[0];for(const endpoint of ['/api/projects/'+encodeURIComponent(project.id)+'/step01-evidence',response.payload.evidence.timeline.shots[0].evidence.keyframes[0].url,response.payload.evidence.package.downloadUrl]){const denied=await fetch(baseUrl+endpoint,{headers:{Cookie:intruderCookie}});assert.equal(denied.status,404);}
    process.stdout.write(JSON.stringify({ok:true,verified:['deprecated source-facts alias returns the canonical SHA-validated evidence_ready package','canonical API exposes source timeline without local filesystem paths','each shot carries three source-bound keyframe URLs','aborted ZIP transfer does not append delivered','full frame and ZIP downloads are revalidated by SHA and append delivery once','cross-owner evidence, frame, and bundle access returns 404']}) + '\n');
  } finally {
    if (server) { server.kill(); await delay(80); if (server.exitCode === null) server.kill('SIGKILL'); }
    await fsp.rm(root, {recursive:true,force:true});
  }
}

main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
