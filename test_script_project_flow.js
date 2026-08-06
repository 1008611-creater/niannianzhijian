'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const JSZip = require('jszip');
const {chromium} = require('playwright');
const mammothVersion = require('mammoth/package.json').version;

const projectRoot = __dirname;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || ('HTTP ' + response.status));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return { response, payload };
}

async function writeSyntheticMacReturn(directJobRoot, sourceDispatchPath) {
  const dispatch = JSON.parse(await fsp.readFile(sourceDispatchPath, 'utf8'));
  const returnRoot = path.join(directJobRoot, '06_N06_EXECUTION', dispatch.group_id, 'mac_employee_return');
  await fsp.mkdir(returnRoot, {recursive:true});
  const turnId = 'turn-' + dispatch.dispatch_id.toLowerCase();
  const completedAt = new Date().toISOString();
  const returnedDispatch = {...dispatch,status:'completed_test_only',phase:'employee_turn_completed',lease:{status:'completed',lease_id:turnId,owner_thread_id:dispatch.employee.thread_id,claimed_at:completedAt,completed_at:completedAt}};
  const fakeMedia = Buffer.from('NIANNIAN_MAC_EMPLOYEE_FAKE_MP4_' + dispatch.dispatch_id, 'utf8');
  const ffprobe = {status:'passed_test_stub',width:720,height:1280,duration_sec:11,aspect_ratio:'9:16',codec:'fake-h264',synthetic:true,ffprobe_invoked:false};
  const visualQa = {status:'passed_test_stub',qa_level:'integrated',score:100,synthetic:true,real_delivery:false,reason:'server-flow fixture only'};
  const completionEvent = {method:'turn/completed',turn_id:turnId,status:'completed',error:null,source:'matching_app_server_notification_and_thread_readback'};
  const receipt = {schema_version:'niannian_n06_mac_employee_synthetic_receipt_v1',dispatch_id:dispatch.dispatch_id,transaction_id:dispatch.transaction_id,project_id:dispatch.project_id,job_id:dispatch.job_id,group_id:dispatch.group_id,spec_sha256:dispatch.spec_sha256,authority_spec_sha256:dispatch.spec_sha256,portable_spec_sha256:dispatch.portable_spec_sha256,prompt_sha256:dispatch.prompt_sha256,references:dispatch.references,employee:dispatch.employee,employee_model_channel:{...dispatch.employee_model_channel,requested:true,used:true,media_provider_authority_granted:false,raw_secret_recorded:false},completion_event:completionEvent,status:'test_only_qa_passed',test_only:true,real_delivery:false,fake_provider_task_id:'fake-mac-employee-' + dispatch.dispatch_id.toLowerCase(),download:{relative_path:'fake-download.mp4',sha256:crypto.createHash('sha256').update(fakeMedia).digest('hex'),bytes:fakeMedia.length,synthetic:true},ffprobe,visual_qa:visualQa,media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,package_send_requested:false,registry_promotion_requested:false,deployment_requested:false,production_data_write_requested:false,created_at:completedAt,completed_at:completedAt};
  const control = {schema_version:'niannian_mac_codex_employee_job_dispatch_receipt_v1',dispatch_id:dispatch.dispatch_id,idempotency_key:dispatch.idempotency_key,project_id:dispatch.project_id,job_id:dispatch.job_id,group_id:dispatch.group_id,employee:dispatch.employee,lease:returnedDispatch.lease,employee_model_channel:receipt.employee_model_channel,completion_event:completionEvent,thread_readback:{latest_completed_assistant_turn_id:turnId,latest_turn_status:'completed',latest_turn_error:null},test_only:true,real_delivery:false,media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,deployment_requested:false,created_at:completedAt};
  const projection = {schema_version:'niannian_website_projection_v1',dispatch_id:dispatch.dispatch_id,status:'employee_synthetic_integrated_not_delivered',media_state:'test_only_no_real_mp4',real_delivery:false,v002_gate:'SCRIPT_N06_V001_ONLY'};
  await Promise.all([
    fsp.writeFile(path.join(returnRoot,'fake-download.mp4'),fakeMedia),
    fsp.writeFile(path.join(returnRoot,'employee_dispatch.json'),JSON.stringify(returnedDispatch,null,2)+'\n'),
    fsp.writeFile(path.join(returnRoot,'employee_worker_receipt.json'),JSON.stringify(receipt,null,2)+'\n'),
    fsp.writeFile(path.join(returnRoot,'mac_employee_dispatch_control_receipt.json'),JSON.stringify(control,null,2)+'\n'),
    fsp.writeFile(path.join(returnRoot,'ffprobe.json'),JSON.stringify(ffprobe,null,2)+'\n'),
    fsp.writeFile(path.join(returnRoot,'visual_qa.json'),JSON.stringify(visualQa,null,2)+'\n'),
    fsp.writeFile(path.join(returnRoot,'website_projection.json'),JSON.stringify(projection,null,2)+'\n')
  ]);
  const names = ['employee_dispatch.json','fake-download.mp4','ffprobe.json','visual_qa.json','website_projection.json','employee_worker_receipt.json','mac_employee_dispatch_control_receipt.json'];
  const files = [];
  for (const relativePath of names) {
    const value = await fsp.readFile(path.join(returnRoot, relativePath));
    files.push({relative_path:relativePath,sha256:crypto.createHash('sha256').update(value).digest('hex'),bytes:value.length});
  }
  await fsp.writeFile(path.join(returnRoot,'artifact_manifest.json'),JSON.stringify({schema_version:'niannian_n06_mac_employee_artifact_manifest_v1',dispatch_id:dispatch.dispatch_id,phase:'turn_completed_and_read_back',files,media_provider_network_requested:false,media_provider_submit_requested:false,real_delivery:false},null,2)+'\n');
  return {dispatch,returnRoot,receipt,turnId};
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const result = await fetchJson(baseUrl + '/api/health');
      if (result.payload.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('server_health_timeout');
}

async function createDocxFixture(paragraphs, fillerBytes = 0) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paragraphs.map(text => '<w:p><w:r><w:t>' + text + '</w:t></w:r></w:p>').join('') + '<w:sectPr/></w:body></w:document>');
  if (fillerBytes > 0) zip.file('word/media/upload-resume-filler.bin', crypto.randomBytes(fillerBytes));
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-script-project-'));
  const dataRoot = path.join(tempRoot, 'data');
  const directJobsRoot = path.join(tempRoot, 'direct-jobs');
  const productionIndex = path.join(tempRoot, 'production_jobs.index.json');
  const port = 20000 + crypto.randomInt(1000);
  const baseUrl = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, [path.join(projectRoot, 'server.js')], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataRoot, NIANNIAN_MEDIA_PREFLIGHT: 'off', NIANNIAN_N05_REGENERATION_AUTOSTART:'off', NIANNIAN_N06_FAKE_TRANSPORT:'on', NIANNIAN_DIRECT_JOBS_ROOT:directJobsRoot, NIANNIAN_PRODUCTION_INDEX:productionIndex, SCRIPT_UPLOAD_CHUNK_BYTES:String(256 * 1024), ZHUANHUI_WORKSPACE:tempRoot },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverStderr = '';
  let browser = null;
  server.stderr.on('data', chunk => { serverStderr += chunk; });

  try {
    await waitForHealth(baseUrl);
    const [indexResponse, activeClientResponse, cssResponse] = await Promise.all([
      fetch(baseUrl + '/'),
      fetch(baseUrl + '/mvp-step02-r13.js'),
      fetch(baseUrl + '/product.css')
    ]);
    assert.equal(indexResponse.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal(activeClientResponse.headers.get('cache-control'), 'public, max-age=3600');
    assert.equal(cssResponse.headers.get('cache-control'), 'no-store, max-age=0');
    const email = 'script-project-' + Date.now() + '@example.com';
    const register = await fetchJson(baseUrl + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'correct-horse-battery-staple' })
    });
    const cookie = String(register.response.headers.get('set-cookie') || '').split(';')[0];
    assert(cookie.includes('niannian_session='));

    const projectEvents = await fetch(baseUrl + '/api/events/projects', {headers:{Cookie:cookie}});
    assert.equal(projectEvents.status, 200);
    assert.match(String(projectEvents.headers.get('content-type') || ''), /text\/event-stream/);
    const projectEventReader = projectEvents.body.getReader();
    const readyEvent = Buffer.from((await projectEventReader.read()).value || []).toString('utf8');
    assert.match(readyEvent, /event: ready/);

    // Migration A historically persisted its only project as an object instead
    // of an array. The current list route must keep that owned project visible.
    const singletonProject = {
      id:'NS-LEGACY-SINGLETON',
      ownerId:register.payload.user.id,
      name:'历史单项目兼容回归',
      genre:'都市情感',
      audience:'短剧用户',
      episodeDuration:60,
      aspectRatio:'9:16',
      source:{type:'pasted_text',characters:120,sha256:'a'.repeat(64),extractedTextSha256:'a'.repeat(64)},
      pipeline:[],
      runtime:{currentNode:'N00'},
      gates:{},
      route:{}
    };
    await fsp.writeFile(path.join(dataRoot, 'script-projects.json'), JSON.stringify(singletonProject, null, 2) + '\n');
    const singletonListed = await fetchJson(baseUrl + '/api/script-projects', {headers:{Cookie:cookie}});
    assert.equal(singletonListed.payload.projects.length, 1);
    assert.equal(singletonListed.payload.projects[0].id, singletonProject.id);
    await fsp.writeFile(path.join(dataRoot, 'script-projects.json'), '[]\n');

    let unauthenticated = null;
    try {
      await fetchJson(baseUrl + '/api/script-projects');
    } catch (error) {
      unauthenticated = error;
    }
    assert.equal(unauthenticated && unauthenticated.status, 401);
    const videoChannels = await fetchJson(baseUrl + '/api/video-channels', {headers:{Cookie:cookie}});
    assert.equal(videoChannels.payload.code, 'VIDEO_CHANNEL_REGISTRY_READY');
    assert.equal(videoChannels.payload.evidenceStatus, 'unverified');
    assert.equal(videoChannels.payload.registry.channels.length, 10);
    assert.equal(videoChannels.payload.registry.channels.some(item => item.website_action_mode === 'real_submit'), false);
    assert.equal(videoChannels.payload.registry.channels.find(item => item.channel_id === 'mimo').website_action_mode, 'prepare_only');
    assert.equal(videoChannels.payload.registry.channels.find(item => item.channel_id === 'artflash').website_action_mode, 'display_only');
    assert.equal(videoChannels.payload.registry.channels.find(item => item.channel_id === 'tensor-art').website_action_mode, 'disabled');
    const videoChannelApiText = JSON.stringify(videoChannels.payload).toLowerCase();
    for (const forbidden of ['evidence_paths','credential','cookie','authorization','raw_provider_body','http_headers']) assert.equal(videoChannelApiText.includes(forbidden), false);

    const sourceText = '第一章：苏晚结束婚姻后走出民政局，雨水落在台阶上。顾言撑伞站在她面前，没有问她是否后悔，只说车在路边。苏晚回头看向紧闭的玻璃门，终于把戒指放进掌心。顾言替她拉开车门，城市霓虹映进湿漉漉的车窗。她说，去哪里？他说，去把你失去的东西一件件拿回来。';
    const created = await fetchJson(baseUrl + '/api/script-projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        name: '文本短剧接口验证',
        genre: '都市情感',
        audience: '短剧用户',
        episodeDuration: 60,
        aspectRatio: '9:16',
        sourceText,
        rightsConfirmed: true
      })
    });
    assert.equal(created.response.status, 201);
    const projectUpdateEvent = Buffer.from((await projectEventReader.read()).value || []).toString('utf8');
    assert.match(projectUpdateEvent, /event: project-update/);
    assert.match(projectUpdateEvent, /"revision":[1-9]\d*/);
    assert.match(projectUpdateEvent, /"scriptProjectIds":\["NS-/);
    assert.doesNotMatch(projectUpdateEvent, /"redrawProjectIds":\["NN-/);
    await projectEventReader.cancel();
    const project = created.payload.project;
    assert(project.id.startsWith('NS-'));
    assert.equal(project.route.rootSkill, 'mx-shortdrama-00-router');
    assert.equal(project.route.productionSkill, 'mx-shortdrama-script-only-production');
    assert.equal(project.runtime.currentNode, 'N01');
    assert.equal(project.gates.video_provider, 'blocked');
    assert.equal(project.gates.source_ingest, 'verified');
    assert.equal(project.gates.canon_ledger, 'worker_prepared');
    assert.equal(Object.prototype.hasOwnProperty.call(project.runtime, 'workerJob'), false);
    assert.equal(project.source.type, 'pasted_text');
    assert.equal(project.source.characters, sourceText.length);
    assert.equal(project.ingest.status, 'verified');
    assert.equal(project.ingest.chapterCount, 1);
    assert.equal(project.ingest.paragraphCount, 1);
    assert.equal(project.pipeline[0].status, 'completed');
    assert.equal(project.pipeline[1].status, 'running');
    assert(!Object.prototype.hasOwnProperty.call(project.source, 'storedPath'));

    const storedText = await fsp.readFile(path.join(dataRoot, 'script-sources', project.id + '.txt'), 'utf8');
    assert.equal(storedText, sourceText + '\n');
    const sourceTextSha256 = crypto.createHash('sha256').update(sourceText, 'utf8').digest('hex');
    const textIngestRoot = path.join(dataRoot, 'script-workspaces', project.id, 'source_ingest');
    const textManifest = JSON.parse(await fsp.readFile(path.join(textIngestRoot, 'source_manifest.json'), 'utf8'));
    assert.equal(textManifest.status, 'verified');
    assert.equal(textManifest.extracted_text.sha256, sourceTextSha256);
    assert.equal(await fsp.readFile(path.join(textIngestRoot, 'source_text.txt'), 'utf8'), sourceText + '\n');

    const prepared = await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/adaptation-jobs', {
      method:'POST',
      headers:{Cookie:cookie}
    });
    assert.equal(prepared.payload.code, 'SCRIPT_ADAPTATION_WORKER_PREPARED');
    assert.equal(prepared.payload.job.status, 'already_prepared');
    assert.equal(prepared.payload.project.runtime.currentNode, 'N01');
    assert.equal(Object.prototype.hasOwnProperty.call(prepared.payload.project.runtime, 'workerJob'), false);
    assert(prepared.payload.job.localJobId.startsWith('web_ns-'));
    const directJobRoot = path.join(directJobsRoot, prepared.payload.job.localJobId);
    const task = JSON.parse(await fsp.readFile(path.join(directJobRoot, 'task.json'), 'utf8'));
    const dashboard = JSON.parse(await fsp.readFile(path.join(directJobRoot, 'gate_dashboard.json'), 'utf8'));
    const sourceScript = await fsp.readFile(path.join(directJobRoot, 'source', 'source_text.txt'), 'utf8');
    assert.equal(task.contract, 'niannian_script_only_worker_v1');
    assert.deepEqual(task.allowed_skill_routes, ['mx-shortdrama-00-router','mx-shortdrama-script-only-production']);
    assert.equal(task.source_script.type, 'extracted_novel_text');
    assert.equal(sourceScript, sourceText + '\n');
    assert.equal(task.source_script.sha256, crypto.createHash('sha256').update(sourceScript, 'utf8').digest('hex'));
    assert.equal(dashboard.gates.N01.status, 'ready_for_ai_worker');
    assert.equal(dashboard.gates.provider_submit.status, 'blocked_cost_authorization');
    for (const required of ['transaction_intent.json','status.json','checkpoint.json','gate_dashboard.md','artifact_ledger.json','result_manifest.json','assignments.json','codex_prompt.md','worker_report.md','route_decision.json']) {
      await fsp.access(path.join(directJobRoot, required));
    }
    const index = JSON.parse(await fsp.readFile(productionIndex, 'utf8'));
    const indexRow = index.jobs.find(item => item.job_id === prepared.payload.job.localJobId);
    assert(indexRow);
    assert.equal(indexRow.source_entrypoint, 'niannian_ai_web_script');
    assert.equal(indexRow.source_kind, 'source_script');

    const preparedAgain = await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/adaptation-jobs', {
      method:'POST',
      headers:{Cookie:cookie}
    });
    assert.equal(preparedAgain.payload.job.localJobId, prepared.payload.job.localJobId);
    assert.equal(preparedAgain.payload.job.status, 'already_prepared');

    const n04Status = {
      job_id:prepared.payload.job.localJobId,
      status:'n04_ep001_candidate_review_ready_n05_gated',
      current_node:'N04_EP001_candidate_review_gate',
      earliest_incomplete_node:'N04_EP001_user_visual_review_and_N05_authorization',
      next_skill:'mx-shortdrama-script-only-production',
      blocker:'N05 requires explicit Image2 authorization and later reference confirmation.',
      next_action:'Review the N04 package in the website, then explicitly authorize N05 whole-image candidate generation.'
    };
    const n04Dashboard = {
      job_id:prepared.payload.job.localJobId,
      overall_status:n04Status.status,
      current_node:n04Status.current_node,
      earliest_incomplete_node:n04Status.earliest_incomplete_node,
      next_skill:n04Status.next_skill,
      next_action:n04Status.next_action,
      direction:{status:'candidate_visual_direction_in_N04_review'},
      gates:{
        N00:{status:'completed_verified'},
        N01:{status:'completed_verified'},
        N02:{status:'completed_verified'},
        N03:{status:'completed_verified_pilot'},
        N04:{status:'candidate_review_ready_not_user_visual_accepted'},
        N05:{status:'blocked_explicit_image_generation_authorization_and_reference_confirmation'},
        N06:{status:'blocked_locked_spec_reference_confirmation_quota_cost_and_submit_authorization'},
        provider_submit:{status:'blocked_explicit_authorization'}
      },
      reference_separation_summary:{first_frame_refs:5,active_upload_refs:0,reference_confirmation:'blocked_no_generated_or_confirmed_refs'}
    };
    const n04Ledger = {
      job_id:prepared.payload.job.localJobId,
      artifacts:[
        {artifact_id:'source_script_text',status:'verified'},
        {artifact_id:'n01_canon_ledger_json',status:'verified'},
        {artifact_id:'n02_episode_adaptation_map_json',status:'verified'},
        {artifact_id:'n03_ep001_shot_fact_cards',status:'verified'},
        {artifact_id:'n04_ep001_prompt_package',status:'candidate_review_ready'}
      ]
    };
    await Promise.all([
      fsp.writeFile(path.join(directJobRoot, 'status.json'), JSON.stringify(n04Status, null, 2) + '\n'),
      fsp.writeFile(path.join(directJobRoot, 'checkpoint.json'), JSON.stringify({job_id:prepared.payload.job.localJobId,blockers:[{type:'authorization',blocker_signature:'n05_image2_generation_not_explicitly_authorized'}]}, null, 2) + '\n'),
      fsp.writeFile(path.join(directJobRoot, 'gate_dashboard.json'), JSON.stringify(n04Dashboard, null, 2) + '\n'),
      fsp.writeFile(path.join(directJobRoot, 'artifact_ledger.json'), JSON.stringify(n04Ledger, null, 2) + '\n'),
      fsp.writeFile(path.join(directJobRoot, 'result_manifest.json'), JSON.stringify({job_id:prepared.payload.job.localJobId,status:'PASS_N04_EP001_CANDIDATE_REVIEW_READY_N05_GATED',packaged:false,transport_success:false,user_visible_acceptance:false}, null, 2) + '\n')
    ]);
    const reconciled = await fetchJson(baseUrl + '/api/script-projects', {headers:{Cookie:cookie}});
    const reconciledProject = reconciled.payload.projects.find(item => item.id === project.id);
    assert(reconciledProject);
    assert.equal(reconciledProject.runtime.currentNode, 'N04');
    assert.equal(Object.prototype.hasOwnProperty.call(reconciledProject.runtime, 'currentNodeDetail'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(reconciledProject.runtime, 'sourceIntegrity'), false);
    assert.equal(reconciledProject.runtime.artifactCount, 5);
    assert.equal(reconciledProject.runtime.verifiedArtifactCount, 4);
    assert.equal(reconciledProject.gates.canon_ledger, 'completed_verified');
    assert.equal(reconciledProject.gates.video_provider, 'blocked_explicit_authorization');
    assert.equal(reconciledProject.pipeline[3].id, 'N03');
    assert.equal(reconciledProject.pipeline[3].status, 'completed');
    assert.equal(reconciledProject.pipeline[4].id, 'N04');
    assert.equal(reconciledProject.pipeline[4].status, 'running');
    const explicitReconcile = await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/reconcile', {method:'POST',headers:{Cookie:cookie}});
    assert.equal(explicitReconcile.payload.code, 'SCRIPT_PROJECT_SYNC_COMPLETE');
    assert.equal(explicitReconcile.payload.synchronization.status, 'synchronized');
    assert.equal(explicitReconcile.payload.project.runtime.currentNode, 'N04');

    browser = await chromium.launch({headless:true});
    const studioContext = await browser.newContext();
    await studioContext.addCookies([{name:'niannian_session', value:cookie.slice('niannian_session='.length), domain:'127.0.0.1', path:'/'}]);
    const studioPage = await studioContext.newPage();
    await studioPage.goto(baseUrl + '/#script/' + encodeURIComponent(project.id) + '/stage/02', {waitUntil:'domcontentloaded'});
    const activeStageTwo = studioPage.locator('#scriptStudioContent [data-script-studio-stage="02"][aria-current="step"]');
    await activeStageTwo.first().waitFor({state:'visible'});
    assert.equal(await activeStageTwo.count(), 1);
    const stageOne = studioPage.locator('#scriptStudioContent [data-script-studio-stage="01"]').first();
    await stageOne.focus();
    await studioPage.keyboard.press('Enter');
    await studioPage.waitForFunction(() => location.hash.endsWith('/stage/01') && document.activeElement?.matches?.('[data-script-studio-stage="01"][aria-current="step"]'));
    const stageOneFocus = await studioPage.evaluate(() => ({
      stage:document.activeElement?.getAttribute('data-script-studio-stage') || null,
      current:document.activeElement?.getAttribute('aria-current') || null,
      active:document.activeElement?.outerHTML || null
    }));
    assert.equal(stageOneFocus.stage, '01', stageOneFocus.active);
    assert.equal(stageOneFocus.current, 'step', stageOneFocus.active);
    assert.equal(await studioPage.locator('#scriptStudioContent [data-script-studio-stage="01"][aria-current="step"]').count(), 1);
    const stageTwo = studioPage.locator('#scriptStudioContent [data-script-studio-stage="02"]').first();
    await stageTwo.focus();
    const n04HydrationSettled = studioPage.waitForResponse(response => response.url().includes('/n04-review'));
    await studioPage.keyboard.press('Enter');
    await n04HydrationSettled;
    await studioPage.waitForFunction(() => location.hash.endsWith('/stage/02') && document.activeElement?.matches?.('[data-script-studio-stage="02"][aria-current="step"]'));
    const stageTwoFocus = await studioPage.evaluate(() => ({
      stage:document.activeElement?.getAttribute('data-script-studio-stage') || null,
      current:document.activeElement?.getAttribute('aria-current') || null,
      active:document.activeElement?.outerHTML || null
    }));
    assert.equal(stageTwoFocus.stage, '02', stageTwoFocus.active);
    assert.equal(stageTwoFocus.current, 'step', stageTwoFocus.active);
    await studioContext.close();
    await browser.close();
    browser = null;

    const n04PackagePath = path.join(directJobRoot, 'episode_packages', 'EP001', 'step04_prompt_package');
    await fsp.mkdir(n04PackagePath, {recursive:true});
    const reviewPromptPackage = {
      job_id:prepared.payload.job.localJobId,
      episode_id:'EP001',
      status:'candidate_review_ready_not_video_executable',
      visual_direction:{characters:'完整身份套组',light:'可见主光',light_quality_rule:'无无来源补光'},
      review_required:['角色身份','物理光线','首帧构图','两段式提示词'],
      execution_state:{asset_generation:'not_started'}
    };
    const reviewFirstFramePlan = {
      job_id:prepared.payload.job.localJobId,
      physical_light_contract:'左后方暖灯是唯一人工主光，右侧雨窗只形成弱冷边。',
      frames:[{ref_key:'FF_V001_S001',video_group_id:'V001',start_shot_id:'S001',composition:'女主左前景，男主中后景',character_state:'女主不回头',light_reasoning:'靠灯侧窄暖光，窗侧保持暗',asset_dependencies:['CHAR_A','SCENE_A'],reference_duty:'只负责开场构图',generation_prompt:'9:16 真首帧，无正面补光',user_confirmed:false,upload_eligible:false}]
    };
    const reviewVideoGroups = {
      job_id:prepared.payload.job.localJobId,
      global_physical_light_contract:reviewFirstFramePlan.physical_light_contract,
      groups:[{video_group_id:'V001',duration_sec:11,shots:['S001','S002'],current_shot_fact_card:{camera_and_composition:'缓慢推进',visible_subjects_and_blocking:'双人对峙',hand_action_and_props:'手在身侧',image_center:'控制性要求',continuity:'承接抬眼'},reference_plan:{primary_first_frame_ref_key:'FF_V001_S001',later_required_refs:[],confirmed_refs:[]},channel_prompt_2part:'【上传参考图职责】\n当前无可上传参考图。\n\n【视频提示词正文】\n物理光线正确。'}]
    };
    const reviewPromptPath = path.join(n04PackagePath, 'EP001_step04_prompt_package.json');
    const reviewFirstFramePath = path.join(n04PackagePath, 'first_frame_plan.json');
    const reviewGroupsPath = path.join(n04PackagePath, 'video_groups.json');
    await Promise.all([
      fsp.writeFile(reviewPromptPath, JSON.stringify(reviewPromptPackage, null, 2) + '\n'),
      fsp.writeFile(reviewFirstFramePath, JSON.stringify(reviewFirstFramePlan, null, 2) + '\n'),
      fsp.writeFile(reviewGroupsPath, JSON.stringify(reviewVideoGroups, null, 2) + '\n')
    ]);
    const reviewPromptSha = crypto.createHash('sha256').update(await fsp.readFile(reviewPromptPath)).digest('hex');
    n04Ledger.artifacts = n04Ledger.artifacts.map(item => item.artifact_id === 'n04_ep001_prompt_package' ? {
      artifact_id:'n04_ep001_prompt_package_json',
      node_id:'N04_EP001_pilot_prompt_package',
      exact_path:reviewPromptPath,
      sha256:reviewPromptSha,
      status:'candidate_review_ready',
      downstream_consumable_by:[]
    } : item);
    n04Ledger.artifacts.push(
      {artifact_id:'n04_ep001_video_groups',node_id:'N04_EP001_pilot_prompt_package',exact_path:reviewGroupsPath,sha256:crypto.createHash('sha256').update(await fsp.readFile(reviewGroupsPath)).digest('hex'),status:'candidate_review_ready',downstream_consumable_by:[]},
      {artifact_id:'n04_ep001_first_frame_plan',node_id:'N04_EP001_pilot_prompt_package',exact_path:reviewFirstFramePath,sha256:crypto.createHash('sha256').update(await fsp.readFile(reviewFirstFramePath)).digest('hex'),status:'candidate_review_ready',downstream_consumable_by:[]}
    );
    await fsp.writeFile(path.join(directJobRoot, 'artifact_ledger.json'), JSON.stringify(n04Ledger, null, 2) + '\n');
    const readyReview = await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n04-review', {headers:{Cookie:cookie}});
    assert.equal(readyReview.payload.review.reviewStatus, 'pending_user_visual_review');
    assert.equal(readyReview.payload.review.firstFrames.length, 1);
    assert.equal(readyReview.payload.review.videoGroups.length, 1);
    browser = await chromium.launch({headless:true});
    const mobileStudioContext = await browser.newContext({viewport:{width:390, height:844}});
    await mobileStudioContext.addCookies([{name:'niannian_session', value:cookie.slice('niannian_session='.length), domain:'127.0.0.1', path:'/'}]);
    const mobileStudioPage = await mobileStudioContext.newPage();
    await mobileStudioPage.goto(baseUrl + '/#script/' + encodeURIComponent(project.id) + '/stage/03', {waitUntil:'domcontentloaded'});
    await mobileStudioPage.locator('.script-storyboard-workspace').waitFor({state:'visible'});
    const mobileStoryboard = await mobileStudioPage.evaluate(() => ({
      currentStage:document.querySelector('[data-script-studio-stage][aria-current="step"]')?.getAttribute('data-script-studio-stage') || null,
      scrollWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth,
      hasPrompt:Boolean(document.querySelector('.script-prompt-editor textarea[readonly]')),
      hasReferenceShelf:Boolean(document.querySelector('.script-shot-asset-shelf'))
    }));
    assert.equal(mobileStoryboard.currentStage, '03');
    assert(mobileStoryboard.scrollWidth <= mobileStoryboard.viewportWidth, 'mobile storyboard must not gain horizontal overflow');
    assert.equal(mobileStoryboard.hasPrompt, true);
    assert.equal(mobileStoryboard.hasReferenceShelf, true);
    await mobileStudioContext.close();
    await browser.close();
    browser = null;
    let missingAuthorization = null;
    try {
      await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n04-review/authorize-n05', {
        method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({})
      });
    } catch (error) {
      missingAuthorization = error;
    }
    assert.equal(missingAuthorization?.status, 400);
    assert.equal(missingAuthorization?.payload?.code, 'SCRIPT_N04_AUTHORIZATION_REQUIRED');
    const n05Authorization = await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n04-review/authorize-n05', {
      method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({authorizeN05:true})
    });
    assert.equal(n05Authorization.payload.code, 'SCRIPT_N05_AUTHORIZATION_RECORDED');
    assert.equal(n05Authorization.payload.review.reviewStatus, 'n05_authorized_waiting_execution');
    assert.equal(n05Authorization.payload.project.runtime.currentNode, 'N05');
    assert.equal(n05Authorization.payload.authorization.providerSubmit, false);
    const authorizationRecord = JSON.parse(await fsp.readFile(path.join(directJobRoot, '00_AUTHORITY', 'n04_review_authorization.json'), 'utf8'));
    assert.equal(authorizationRecord.authorization_scope.n05_whole_image_candidate_generation, true);
    assert.equal(authorizationRecord.provider_submit, false);
    const n05Dashboard = JSON.parse(await fsp.readFile(path.join(directJobRoot, 'gate_dashboard.json'), 'utf8'));
    assert.equal(n05Dashboard.current_node, 'N05_EP001_whole_image_candidate_generation');
    assert.equal(n05Dashboard.gates.provider_submit.status, 'blocked_explicit_submit_authorization');

    const n05RunRoot = path.join(directJobRoot, 'episode_packages', 'EP001', 'step05_asset_execution', 'n05_test_run');
    const n05CandidatePath = path.join(n05RunRoot, 'candidates', 'FF_V001_S001.png');
    const n05CandidateManifestPath = path.join(n05RunRoot, 'candidate_review_manifest.json');
    const n05QaPath = path.join(n05RunRoot, 'qa', 'automatic_visual_qa.json');
    const n05CandidateBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlWqKkAAAAASUVORK5CYII=', 'base64');
    await fsp.mkdir(path.dirname(n05CandidatePath), {recursive:true});
    await fsp.mkdir(path.dirname(n05QaPath), {recursive:true});
    await fsp.writeFile(n05CandidatePath, n05CandidateBytes);
    const n05CandidateSha = crypto.createHash('sha256').update(n05CandidateBytes).digest('hex');
    const n05CandidateManifest = {
      schema_version:'niannian_n05_candidate_review_manifest_v1',
      run_id:'n05_test_run',
      job_id:prepared.payload.job.localJobId,
      episode_id:'EP001',
      status:'candidate_review_ready_awaiting_user_confirmation',
      items:[{
        id:'FF_V001_S001',provider:'krill_image2',provider_task_id:null,prompt_sha256:'a'.repeat(64),
        exact_path:n05CandidatePath,sha256:n05CandidateSha,bytes:n05CandidateBytes.length,dimensions:'1024x1536',
        qa_score:91,qa_status:'candidate_pass',user_confirmed:false,upload_eligible:false,
        chinese_reference_duty:'只锁定测试首帧。'
      }]
    };
    const n05Qa = {schema_version:'niannian_n05_automatic_visual_qa_v1',job_id:prepared.payload.job.localJobId,items:[{id:'FF_V001_S001',score:91,status:'candidate_pass'}]};
    await Promise.all([
      fsp.writeFile(n05CandidateManifestPath, JSON.stringify(n05CandidateManifest, null, 2) + '\n'),
      fsp.writeFile(n05QaPath, JSON.stringify(n05Qa, null, 2) + '\n')
    ]);
    n04Ledger.artifacts.push(
      {artifact_id:'n05_ep001_candidate_review_manifest',node_id:'N05_EP001_image2_candidate_execution',exact_path:n05CandidateManifestPath,sha256:crypto.createHash('sha256').update(await fsp.readFile(n05CandidateManifestPath)).digest('hex'),status:'candidate_review_ready_not_user_confirmed',downstream_consumable_by:[]},
      {artifact_id:'n05_ep001_automatic_visual_qa',node_id:'N05_EP001_visual_QA',exact_path:n05QaPath,sha256:crypto.createHash('sha256').update(await fsp.readFile(n05QaPath)).digest('hex'),status:'verified_diagnostic',downstream_consumable_by:[]}
    );
    await fsp.writeFile(path.join(directJobRoot, 'artifact_ledger.json'), JSON.stringify(n04Ledger, null, 2) + '\n');
    const n05Review = await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n04-review', {headers:{Cookie:cookie}});
    assert.equal(n05Review.payload.review.n05Candidates.length, 1);
    assert.equal(n05Review.payload.review.n05Candidates[0].decision, 'pending');
    browser = await chromium.launch({headless:true});
    const assetCatalogContext = await browser.newContext();
    await assetCatalogContext.addCookies([{name:'niannian_session', value:cookie.slice('niannian_session='.length), domain:'127.0.0.1', path:'/'}]);
    const assetCatalogPage = await assetCatalogContext.newPage();
    await assetCatalogPage.goto(baseUrl + '/#workbench/project/' + encodeURIComponent('script:' + project.id) + '/tab/assets', {waitUntil:'domcontentloaded'});
    const workbenchAsset = assetCatalogPage.locator('[data-workbench-asset]');
    await workbenchAsset.waitFor({state:'visible'});
    assert.equal(await workbenchAsset.count(), 1);
    const workbenchViewerOpen = assetCatalogPage.locator('[data-open-workbench-asset-viewer]');
    assert.equal(await workbenchViewerOpen.count(), 1);
    await workbenchViewerOpen.click();
    const assetViewer = assetCatalogPage.locator('#assetViewer');
    await assetViewer.waitFor({state:'visible'});
    assert.equal(await assetViewer.locator('.asset-viewer-image img').count(), 1);
    await assetCatalogPage.keyboard.press('Escape');
    await assetViewer.waitFor({state:'hidden'});
    await assetCatalogContext.close();
    await browser.close();
    browser = null;
    let missingRepairReason = null;
    try {
      await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n05-candidates/FF_V001_S001/decision', {
        method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({decision:'regenerate',sha256:n05CandidateSha,reason:''})
      });
    } catch (error) {
      missingRepairReason = error;
    }
    assert.equal(missingRepairReason?.payload?.code, 'SCRIPT_N05_DECISION_REASON_REQUIRED');
    const queuedRepair = await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n05-candidates/FF_V001_S001/decision', {
      method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({decision:'regenerate',sha256:n05CandidateSha,reason:'人物右手结构异常，请保持原机位和光向整图重做。'})
    });
    assert.equal(queuedRepair.payload.code, 'SCRIPT_N05_REGENERATION_QUEUED');
    assert.equal(queuedRepair.payload.regenerationDispatch.status, 'autostart_disabled');
    assert.equal(queuedRepair.payload.review.n05Candidates[0].decision, 'regenerate');
    assert.equal(queuedRepair.payload.review.n05Candidates[0].uploadEligible, false);
    assert.equal(queuedRepair.payload.review.n05Candidates[0].regenerationRequest.status, 'queued_for_approved_image2_worker');
    assert.equal(queuedRepair.payload.videoSubmitAllowed, false);
    const repairQueue = JSON.parse(await fsp.readFile(path.join(directJobRoot, '00_AUTHORITY', 'n05_candidate_regeneration_queue.json'), 'utf8'));
    assert.equal(repairQueue.items.length, 1);
    assert.equal(repairQueue.items[0].candidate_id, 'FF_V001_S001');
    assert.equal(repairQueue.items[0].whole_image_regeneration_only, true);
    assert.equal(repairQueue.items[0].local_raster_editing_allowed, false);
    assert.equal(repairQueue.provider_submit_requested, false);
    const decisionIntents = (await fsp.readdir(directJobRoot)).filter(name => name.startsWith('transaction_intent_n05dec-'));
    assert.equal(decisionIntents.length, 1);
    const decisionIntent = JSON.parse(await fsp.readFile(path.join(directJobRoot, decisionIntents[0]), 'utf8'));
    assert.equal(decisionIntent.cost_gate, 'decision_record_only_no_provider_submit');
    assert(decisionIntent.allowed_write_paths.includes(path.join(directJobRoot, '00_AUTHORITY', 'n05_candidate_regeneration_queue.json')));

    const blockedN06 = await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n06-review', {headers:{Cookie:cookie}});
    assert.equal(blockedN06.payload.code, 'SCRIPT_N06_REVIEW_READY');
    assert.equal(blockedN06.payload.review.provider, undefined);
    assert.equal(JSON.stringify(blockedN06.payload.review).includes('executionEnabled'), false);
    assert.equal(JSON.stringify(blockedN06.payload.review).includes('provider_task_id'), false);
    assert.equal(blockedN06.payload.review.groups[0].groupId, 'V001');
    assert.equal(blockedN06.payload.review.groups[0].durationSec, 11);
    assert.equal(blockedN06.payload.review.groups[0].aspectRatio, '9:16');
    assert.equal(blockedN06.payload.review.groups[0].qualityDecision, null);
    assert.equal(blockedN06.payload.review.groups[0].canRecordDryRun, false);
    let v002Blocked = null;
    try {
      await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n06-video-groups/V002/generate', {
        method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({confirmGenerate:true,lockedPromptSha256:'x'.repeat(64),qualityDecision:'keep_720p_hard_gate'})
      });
    } catch (error) {
      v002Blocked = error;
    }
    assert.equal(v002Blocked?.payload?.code, 'SCRIPT_N06_V001_ONLY');
    const confirmedForN06 = await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n05-candidates/FF_V001_S001/decision', {
      method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({decision:'confirm',sha256:n05CandidateSha,reason:''})
    });
    assert.equal(confirmedForN06.payload.review.n05Candidates[0].uploadEligible, true);
    const readyN06 = await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n06-review', {headers:{Cookie:cookie}});
    const v001 = readyN06.payload.review.groups.find(item => item.groupId === 'V001');
    assert(v001);
    assert.equal(v001.canRecordDryRun, true);
    assert.equal(v001.references[0].confirmed, true);
    let missingQuality = null;
    try {
      await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n06-video-groups/V001/generate', {
        method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({confirmGenerate:true,qualityDecision:'720p'})
      });
    } catch (error) {
      missingQuality = error;
    }
    assert.equal(missingQuality?.payload?.code, 'SCRIPT_N06_QUALITY_DECISION_REQUIRED');
    const n06Intent = await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n06-video-groups/V001/generate', {
      method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({confirmGenerate:true,qualityDecision:'keep_720p_hard_gate'})
    });
    assert.equal(n06Intent.payload.code, 'SCRIPT_N06_DRY_RUN_INTENT_RECORDED');
    for (const internalField of ['employeeModelChannel','mediaProviderNetworkRequested','mediaProviderSubmitted','providerTaskId','packageSend','registryPromotion']) {
      assert.equal(Object.prototype.hasOwnProperty.call(n06Intent.payload, internalField), false);
    }
    const recordedV001 = n06Intent.payload.review.groups.find(item => item.groupId === 'V001');
    assert.equal(recordedV001.status, 'dry_run_intent_recorded');
    assert.equal(recordedV001.qualityDecision, 'keep_720p_hard_gate');
    assert.equal(recordedV001.receipt.status, 'not_created_provider_disabled');
    assert.equal(recordedV001.qa.status, 'not_started_no_media_downloaded');
    assert.equal(Object.prototype.hasOwnProperty.call(recordedV001, 'lockedPromptSha256'), false);
    const n06State = JSON.parse(await fsp.readFile(path.join(directJobRoot, '00_AUTHORITY', 'n06_video_generation_state.json'), 'utf8'));
    assert.equal(n06State.groups.V001.provider_task_id, null);
    assert.equal(n06State.groups.V001.quality_decision, 'keep_720p_hard_gate');
    assert.equal(n06State.groups.V001.spec_sha256, crypto.createHash('sha256').update(await fsp.readFile(n06State.groups.V001.spec_path)).digest('hex'));
    const n06Adapter = JSON.parse(await fsp.readFile(path.join(directJobRoot, '00_AUTHORITY', 'n06_mimo_adapter_contract.json'), 'utf8'));
    assert.equal(n06Adapter.provider, 'mimo');
    assert.equal(n06Adapter.execution_enabled, false);
    assert.deepEqual(n06Adapter.blocked_operations, ['upload','submit','poll','download']);
    const n06Result = JSON.parse(await fsp.readFile(path.join(directJobRoot, 'result_manifest.json'), 'utf8'));
    assert.equal(n06Result.success, false);
    assert.equal(n06Result.packaged, false);
    assert.equal(n06Result.provider_task_id, null);
    assert.equal(Object.prototype.hasOwnProperty.call(n06Intent.payload.review, 'credits'), false);
    assert.equal(n06Intent.payload.project.runtime.currentNode, 'N06');
    assert.equal(n06Intent.payload.review.groups.find(item => item.groupId === 'V001').blockers.some(item => /dry-run|provider/i.test(item)), false);
    browser = await chromium.launch({headless:true});
    const mobileN06Context = await browser.newContext({viewport:{width:390, height:844}});
    await mobileN06Context.addCookies([{name:'niannian_session', value:cookie.slice('niannian_session='.length), domain:'127.0.0.1', path:'/'}]);
    const mobileN06Page = await mobileN06Context.newPage();
    await mobileN06Page.goto(baseUrl + '/#script/' + encodeURIComponent(project.id) + '/stage/04', {waitUntil:'domcontentloaded'});
    await mobileN06Page.locator('.script-video-editor').waitFor({state:'visible'});
    const mobileN06 = await mobileN06Page.evaluate(() => ({
      currentStage:document.querySelector('[data-script-studio-stage][aria-current="step"]')?.getAttribute('data-script-studio-stage') || null,
      scrollWidth:document.documentElement.scrollWidth,
      viewportWidth:window.innerWidth,
      selectedGroup:document.querySelector('[data-script-video-group].is-active')?.getAttribute('data-script-video-group') || null,
      qualityValue:document.querySelector('[data-n06-quality]')?.value || null,
      mediaPlayerCount:document.querySelectorAll('.script-video-player video').length,
      specActionCount:document.querySelectorAll('[data-n06-generate]').length,
      prepareActionCount:document.querySelectorAll('[data-n06-prepare-real]').length
    }));
    assert.equal(mobileN06.currentStage, '04');
    assert(mobileN06.scrollWidth <= mobileN06.viewportWidth, 'mobile N06 must not gain horizontal overflow');
    assert.equal(mobileN06.selectedGroup, 'V001');
    assert.equal(mobileN06.qualityValue, 'keep_720p_hard_gate');
    assert.equal(mobileN06.mediaPlayerCount, 0);
    assert.equal(mobileN06.specActionCount, 0);
    assert.equal(mobileN06.prepareActionCount, 1);
    await mobileN06Context.close();
    await browser.close();
    browser = null;
    const realSubmitPrepared = await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n06-video-groups/V001/prepare-real-submit', {
      method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({confirmRealSubmit:true,qualityDecision:'keep_720p_hard_gate'})
    });
    assert.equal(realSubmitPrepared.payload.code, 'SCRIPT_N06_REAL_SUBMIT_CANDIDATE_PREPARED');
    for (const internalField of ['mediaProviderNetworkRequested','mediaProviderSubmitted','relayDispatched']) {
      assert.equal(Object.prototype.hasOwnProperty.call(realSubmitPrepared.payload, internalField), false);
    }
    const realTask = JSON.parse(await fsp.readFile(path.join(directJobRoot, 'task.json'), 'utf8'));
    assert.equal(realTask.n06_real_submit.status, 'candidate_prepared_not_dispatched');
    assert.equal(realTask.n06_real_submit.references[0].sha256, n05CandidateSha);
    const realSpec = JSON.parse(await fsp.readFile(realTask.n06_real_submit.spec_path, 'utf8'));
    assert.equal(realSpec.execution_mode, 'real_submit_candidate_v2');
    assert.equal(realSpec.media_provider_submit_requested, false);
    assert.equal(realSpec.references[0].ref_key, 'FF_V001_S001');
    await fsp.writeFile(n05CandidatePath, Buffer.from('tampered-after-n06-spec'));
    let n06ReferenceTamper = null;
    try {
      await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n06-video-groups/V001/dispatch-synthetic', {method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({confirmSyntheticDispatch:true,specSha256:realTask.n06_real_submit.spec_sha256})});
    } catch (error) {
      n06ReferenceTamper = error;
    }
    assert.equal(n06ReferenceTamper?.payload?.code, 'SCRIPT_N06_REFERENCE_REVALIDATION_FAILED');
    await fsp.writeFile(n05CandidatePath, n05CandidateBytes);
    const n06Dispatched = await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n06-video-groups/V001/dispatch-synthetic', {method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({confirmSyntheticDispatch:true,specSha256:realTask.n06_real_submit.spec_sha256})});
    assert.equal(n06Dispatched.payload.code, 'SCRIPT_N06_EMPLOYEE_SYNTHETIC_DISPATCH_PREPARED');
    for (const internalField of ['employeeModelChannel','mediaProviderNetworkRequested','mediaProviderSubmitted']) {
      assert.equal(Object.prototype.hasOwnProperty.call(n06Dispatched.payload, internalField), false);
    }
    assert.equal(n06Dispatched.payload.testOnly, true);
    assert.equal(n06Dispatched.payload.realDelivery, false);
    const dispatchedV001 = n06Dispatched.payload.review.groups.find(item => item.groupId === 'V001');
    assert.equal(dispatchedV001.status, 'employee_dispatch_prepared');
    assert.equal(dispatchedV001.employeeDispatch.testOnly, true);
    assert.equal(Object.prototype.hasOwnProperty.call(dispatchedV001.employeeDispatch, 'threadId'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(dispatchedV001.employeeDispatch, 'mediaProviderSubmitRequested'), false);
    const dispatchPath = JSON.parse(await fsp.readFile(path.join(directJobRoot,'00_AUTHORITY','n06_video_generation_state.json'),'utf8')).groups.V001.employee_dispatch_path;
    const dispatch = JSON.parse(await fsp.readFile(dispatchPath,'utf8'));
    assert.equal(dispatch.spec_sha256, realTask.n06_real_submit.spec_sha256);
    assert.notEqual(dispatch.portable_spec_sha256, dispatch.spec_sha256);
    const portableSpec = JSON.parse(await fsp.readFile(path.join(path.dirname(dispatchPath),'input','video_task_spec.json'),'utf8'));
    assert.equal(portableSpec.authority_spec.sha256, dispatch.spec_sha256);
    assert.equal(portableSpec.references[0].original_authority.sha256, n05CandidateSha);
    assert.equal(portableSpec.references[0].portable_transport.sha256, n05CandidateSha);
    assert.match(portableSpec.references[0].path,/^\/Users\/lsb\/.local\/share\/niannian-ai\/employee-workspaces\//);
    let pendingReturn = null;
    try {
      await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n06-video-groups/V001/reconcile-synthetic', {method:'POST',headers:{Cookie:cookie}});
    } catch (error) { pendingReturn = error; }
    assert.equal(pendingReturn?.payload?.code, 'SCRIPT_N06_EMPLOYEE_RETURN_PENDING');
    const macReturn = await writeSyntheticMacReturn(directJobRoot, dispatchPath);
    const n06Executed = await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n06-video-groups/V001/reconcile-synthetic', {method:'POST',headers:{Cookie:cookie}});
    assert.equal(n06Executed.payload.code, 'SCRIPT_N06_EMPLOYEE_SYNTHETIC_INTEGRATED');
    for (const internalField of ['employeeModelChannel','mediaProviderSubmitted']) {
      assert.equal(Object.prototype.hasOwnProperty.call(n06Executed.payload, internalField), false);
    }
    assert.equal(n06Executed.payload.testOnly, true);
    assert.equal(n06Executed.payload.realDelivery, false);
    assert.equal(n06Executed.payload.v002Unlocked, false);
    const activityAfterTestWorker = await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/activity', {headers:{Cookie:cookie}});
    assert.equal(activityAfterTestWorker.payload.code, 'SCRIPT_PROJECT_ACTIVITY_READY');
    const activityText = JSON.stringify(activityAfterTestWorker.payload.activity.events || []);
    assert.match(activityText, /候选已确认/);
    assert.doesNotMatch(activityText, /视频已通过质量校验|fake-mimo|sha256|provider|worker|thread/i);
    const qaV001 = n06Executed.payload.review.groups.find(item => item.groupId === 'V001');
    assert.equal(qaV001.status, 'employee_synthetic_integrated_qa_passed');
    assert.equal(qaV001.receipt.status, 'test_only_qa_passed');
    assert.equal(qaV001.receipt.testOnly, true);
    assert.equal(Object.prototype.hasOwnProperty.call(qaV001.receipt, 'providerTaskId'), false);
    assert.equal(Object.hasOwn(qaV001.receipt, 'receipt_path'), false);
    assert.equal(qaV001.qa.status, 'test_only_qa_passed');
    assert.equal(qaV001.media.state, 'test_only');
    const fakeMedia = await fetch(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n06-video-groups/V001/media', {headers:{Cookie:cookie}});
    assert.equal(fakeMedia.status, 404);
    const n06Checkpoint = JSON.parse(await fsp.readFile(path.join(directJobRoot, 'checkpoint.json'), 'utf8'));
    assert(n06Checkpoint.completed.includes('N06 Mac App employee exact dispatch completed'));
    assert(n06Checkpoint.completed.includes('N06 fake task poll download ffprobe visual QA returned'));
    const n06ReceiptPath = path.join(macReturn.returnRoot, 'employee_worker_receipt.json');
    const n06Receipt = JSON.parse(await fsp.readFile(n06ReceiptPath, 'utf8'));
    assert.equal(n06Receipt.test_only, true);
    assert.equal(n06Receipt.ffprobe.status, 'passed_test_stub');
    assert.equal(n06Receipt.visual_qa.status, 'passed_test_stub');
    const n06Ledger = JSON.parse(await fsp.readFile(path.join(directJobRoot, 'artifact_ledger.json'), 'utf8'));
    const n06MediaArtifact = n06Ledger.artifacts.find(item => item.artifact_id === 'n06_v001_mac_employee_fake_media');
    assert.equal(n06MediaArtifact.status, 'test_only_qa_passed');
    assert.equal(n06MediaArtifact.sha256, n06Receipt.download.sha256);
    const n06WorkerResult = JSON.parse(await fsp.readFile(path.join(directJobRoot, 'result_manifest.json'), 'utf8'));
    assert.equal(n06WorkerResult.test_only, true);
    assert.equal(n06WorkerResult.real_delivery, false);
    assert.equal(n06WorkerResult.packaged, false);
    assert.equal(n06WorkerResult.transport_success, false);
    let v002StillBlocked = null;
    try {
      await fetchJson(baseUrl + '/api/script-projects/' + encodeURIComponent(project.id) + '/n06-video-groups/V002/execute', {method:'POST',headers:{Cookie:cookie}});
    } catch (error) { v002StillBlocked = error; }
    assert.equal(v002StillBlocked?.payload?.code, 'SCRIPT_N06_V002_UPSTREAM_BLOCKED');
    const productionRows = JSON.parse(await fsp.readFile(productionIndex,'utf8')).jobs;
    const indexedN06 = productionRows.find(item => item.job_id === prepared.payload.job.localJobId);
    assert.equal(indexedN06.execution_phase,'return_reconciled');
    assert.equal(indexedN06.status,'n06_employee_synthetic_integrated');
    assert.equal(indexedN06.media_provider_submit_requested,false);
    browser = await chromium.launch({headless:true});
    const integratedContext = await browser.newContext({viewport:{width:1440,height:900}});
    await integratedContext.addCookies([{name:'niannian_session',value:cookie.slice('niannian_session='.length),domain:'127.0.0.1',path:'/'}]);
    const integratedPage = await integratedContext.newPage();
    const integratedConsoleErrors=[];
    integratedPage.on('console',message=>{if(message.type()==='error')integratedConsoleErrors.push(message.text());});
    await integratedPage.goto(baseUrl + '/#script/' + encodeURIComponent(project.id) + '/stage/04',{waitUntil:'domcontentloaded'});
    await integratedPage.locator('.script-n06-route-contract').waitFor({state:'visible'});
    const integratedUi = await integratedPage.evaluate(() => ({
      routeText:document.querySelector('.script-n06-route-contract')?.textContent || '',
      actionText:document.querySelector('.script-n06-actionbar')?.textContent || '',
      videoCount:document.querySelectorAll('.script-video-player video').length,
      dispatchButtons:document.querySelectorAll('[data-n06-dispatch-synthetic]').length,
      reconcileButtons:document.querySelectorAll('[data-n06-reconcile-synthetic]').length,
      overflow:document.documentElement.scrollWidth > window.innerWidth
    }));
    assert.match(integratedUi.routeText,/生产线程/);
    assert.match(integratedUi.routeText,/当前未调用/);
    assert.match(integratedUi.routeText,/测试回执已回写/);
    assert.match(integratedUi.routeText,/不能解锁后续媒体交付/);
    assert.match(integratedUi.actionText,/测试链路已通过/);
    assert.equal(integratedUi.videoCount,0);
    assert.equal(integratedUi.dispatchButtons,0);
    assert.equal(integratedUi.reconcileButtons,0);
    assert.equal(integratedUi.overflow,false);
    assert.deepEqual(integratedConsoleErrors,[]);
    await integratedContext.close();
    await browser.close();
    browser=null;

    const docxParagraphs = [
      '第一章：程晚在民政局门口收起离婚证，雨水落在台阶上。陆沉撑伞站在她面前，没有问她是否后悔，只说车在路边。',
      '程晚回头看向紧闭的玻璃门，把戒指放进掌心。陆沉替她拉开车门，城市霓虹映进湿漉漉的车窗。',
      '她问去哪里，他说去把你失去的东西一件件拿回来。程晚望着前方，决定先回公司查清那份解约通知。'
    ];
    const resumableDocxBuffer = await createDocxFixture(docxParagraphs, 300 * 1024);
    const resumableDocxSha256 = crypto.createHash('sha256').update(resumableDocxBuffer).digest('hex');
    const resumableInit = await fetchJson(baseUrl + '/api/script-uploads', {
      method:'POST',
      headers:{'Content-Type':'application/json',Cookie:cookie},
      body:JSON.stringify({originalName:'resumable-novel.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',bytes:resumableDocxBuffer.length,sha256:resumableDocxSha256})
    });
    assert.equal(resumableInit.response.status, 201);
    assert.equal(resumableInit.payload.code, 'SCRIPT_UPLOAD_SESSION_CREATED');
    assert.equal(resumableInit.payload.upload.uploadedBytes, 0);
    assert.equal(resumableInit.payload.upload.chunkSize, 256 * 1024);
    const resumableUploadId = resumableInit.payload.upload.id;
    const firstChunk = resumableDocxBuffer.subarray(0, resumableInit.payload.upload.chunkSize);
    const firstChunkSha256 = crypto.createHash('sha256').update(firstChunk).digest('hex');
    const firstChunkAccepted = await fetchJson(baseUrl + '/api/script-uploads/' + encodeURIComponent(resumableUploadId) + '/chunks/0', {
      method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/octet-stream','X-NianNian-Chunk-SHA256':firstChunkSha256},body:firstChunk
    });
    assert.equal(firstChunkAccepted.payload.code, 'SCRIPT_UPLOAD_CHUNK_ACCEPTED');
    assert.equal(firstChunkAccepted.payload.upload.uploadedBytes, firstChunk.length);
    const firstChunkReplay = await fetchJson(baseUrl + '/api/script-uploads/' + encodeURIComponent(resumableUploadId) + '/chunks/0', {
      method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/octet-stream','X-NianNian-Chunk-SHA256':firstChunkSha256},body:firstChunk
    });
    assert.equal(firstChunkReplay.payload.code, 'SCRIPT_UPLOAD_CHUNK_ALREADY_RECORDED');
    assert.equal(firstChunkReplay.payload.idempotent, true);
    let incompleteUpload = null;
    try {
      await fetchJson(baseUrl + '/api/script-uploads/' + encodeURIComponent(resumableUploadId) + '/complete', {method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({sha256:resumableDocxSha256})});
    } catch (error) {
      incompleteUpload = error;
    }
    assert.equal(incompleteUpload?.status, 400);
    assert.equal(incompleteUpload?.payload?.code, 'SCRIPT_UPLOAD_INCOMPLETE');
    const resumed = await fetchJson(baseUrl + '/api/script-uploads', {
      method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({originalName:'resumable-novel.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',bytes:resumableDocxBuffer.length,sha256:resumableDocxSha256})
    });
    assert.equal(resumed.payload.code, 'SCRIPT_UPLOAD_SESSION_REUSED');
    assert.equal(resumed.payload.upload.id, resumableUploadId);
    assert.equal(resumed.payload.upload.uploadedBytes, firstChunk.length);
    const secondChunk = resumableDocxBuffer.subarray(firstChunk.length);
    const secondChunkAccepted = await fetchJson(baseUrl + '/api/script-uploads/' + encodeURIComponent(resumableUploadId) + '/chunks/' + firstChunk.length, {
      method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/octet-stream','X-NianNian-Chunk-SHA256':crypto.createHash('sha256').update(secondChunk).digest('hex')},body:secondChunk
    });
    assert.equal(secondChunkAccepted.payload.upload.uploadedBytes, resumableDocxBuffer.length);
    const verifiedUpload = await fetchJson(baseUrl + '/api/script-uploads/' + encodeURIComponent(resumableUploadId) + '/complete', {
      method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({sha256:resumableDocxSha256})
    });
    assert.equal(verifiedUpload.payload.code, 'SCRIPT_UPLOAD_VERIFIED');
    assert.equal(verifiedUpload.payload.upload.status, 'verified');
    const uploadCompletionReplay = await fetchJson(baseUrl + '/api/script-uploads/' + encodeURIComponent(resumableUploadId) + '/complete', {
      method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({sha256:resumableDocxSha256})
    });
    assert.equal(uploadCompletionReplay.payload.code, 'SCRIPT_UPLOAD_ALREADY_VERIFIED');
    const foreignRegister = await fetchJson(baseUrl + '/api/auth/register', {
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'upload-foreign-' + Date.now() + '@example.com',password:'correct-horse-battery-staple'})
    });
    const foreignCookie = String(foreignRegister.response.headers.get('set-cookie') || '').split(';')[0];
    let foreignUploadRead = null;
    try { await fetchJson(baseUrl + '/api/script-uploads/' + encodeURIComponent(resumableUploadId), {headers:{Cookie:foreignCookie}}); } catch (error) { foreignUploadRead = error; }
    assert.equal(foreignUploadRead?.status, 404);
    const resumableCreated = await fetchJson(baseUrl + '/api/script-projects/from-upload', {
      method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({name:'可恢复上传短剧接口验证',genre:'都市情感',audience:'短剧用户',episodeDuration:60,aspectRatio:'9:16',rightsConfirmed:true,uploadSessionId:resumableUploadId})
    });
    assert.equal(resumableCreated.response.status, 201);
    assert.equal(resumableCreated.payload.code, 'SCRIPT_PROJECT_CREATED_FROM_UPLOAD');
    const resumableProject = resumableCreated.payload.project;
    assert.equal(resumableProject.source.type, 'docx');
    assert.equal(Object.prototype.hasOwnProperty.call(resumableProject.source, 'sha256'), false);
    const consumedUpload = await fetchJson(baseUrl + '/api/script-uploads/' + encodeURIComponent(resumableUploadId), {headers:{Cookie:cookie}});
    assert.equal(consumedUpload.payload.upload.status, 'consumed');
    assert.equal(consumedUpload.payload.upload.projectId, resumableProject.id);
    let consumedProjectRetry = null;
    try {
      await fetchJson(baseUrl + '/api/script-projects/from-upload', {method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({name:'重复创建应阻断',rightsConfirmed:true,uploadSessionId:resumableUploadId})});
    } catch (error) {
      consumedProjectRetry = error;
    }
    assert.equal(consumedProjectRetry?.status, 400);
    assert.equal(consumedProjectRetry?.payload?.code, 'SCRIPT_UPLOAD_ALREADY_CONSUMED');
    const docxBuffer = await createDocxFixture(docxParagraphs);
    const docxForm = new FormData();
    docxForm.set('name', 'Word 短剧接口验证');
    docxForm.set('genre', '都市情感');
    docxForm.set('audience', '短剧用户');
    docxForm.set('episodeDuration', '90');
    docxForm.set('aspectRatio', '9:16');
    docxForm.set('rightsConfirmed', 'on');
    docxForm.set('sourceDocument', new Blob([docxBuffer], {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}), 'synthetic-novel.docx');
    const docxCreated = await fetchJson(baseUrl + '/api/script-projects/docx', {
      method: 'POST',
      headers: { Cookie: cookie },
      body: docxForm
    });
    assert.equal(docxCreated.response.status, 201);
    const docxProject = docxCreated.payload.project;
    assert.equal(docxProject.source.type, 'docx');
    assert.equal(docxProject.source.originalName, 'synthetic-novel.docx');
    assert.equal(Object.prototype.hasOwnProperty.call(docxProject.source, 'sha256'), false);
    assert.equal(docxProject.source.extraction.status, 'verified');
    assert.equal(docxProject.runtime.currentNode, 'N01');
    assert.equal(docxProject.gates.video_provider, 'blocked');
    assert.equal(docxProject.gates.source_ingest, 'verified');
    assert.equal(docxProject.ingest.chapterCount, 1);
    const storedDocx = await fsp.readFile(path.join(dataRoot, 'script-sources', docxProject.id + '.docx'));
    assert.equal(Buffer.compare(storedDocx, docxBuffer), 0);
    const docxIngestRoot = path.join(dataRoot, 'script-workspaces', docxProject.id, 'source_ingest');
    const docxManifest = JSON.parse(await fsp.readFile(path.join(docxIngestRoot, 'source_manifest.json'), 'utf8'));
    assert.equal(docxManifest.source_document.sha256, crypto.createHash('sha256').update(docxBuffer).digest('hex'));
    assert.equal(docxManifest.extracted_text.sha256.length, 64);
    assert.equal(docxManifest.chapter_index.count, 1);

    const invalidForm = new FormData();
    invalidForm.set('name', '损坏 Word 文档');
    invalidForm.set('rightsConfirmed', 'on');
    invalidForm.set('sourceDocument', new Blob([Buffer.from('not-a-docx')], {type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}), 'broken.docx');
    let invalidDocument = null;
    try {
      await fetchJson(baseUrl + '/api/script-projects/docx', {method:'POST', headers:{Cookie:cookie}, body:invalidForm});
    } catch (error) {
      invalidDocument = error;
    }
    assert.equal(invalidDocument && invalidDocument.status, 400);
    assert.equal(invalidDocument.payload.code, 'SCRIPT_DOCUMENT_PARSE_FAILED');
    assert.equal((await fsp.readdir(path.join(dataRoot, 'script-workspaces'))).length, 3);

    const listed = await fetchJson(baseUrl + '/api/script-projects', { headers: { Cookie: cookie } });
    assert.equal(listed.payload.projects.length, 3);
    assert.equal(listed.payload.projects[0].id, docxProject.id);
    assert(listed.payload.projects.some(item => item.id === resumableProject.id));
    assert(listed.payload.projects.some(item => item.id === project.id));
    assert.equal(listed.payload.projects[0].pipeline.length, 8);

    console.log(JSON.stringify({
      ok: true,
      projectId: project.id,
      docxProjectId: docxProject.id,
      verified: ['auth boundary', 'script-project persistence', 'DOCX extraction', 'resumable DOCX upload session', 'chunk hash validation and idempotent retry', 'upload resume and incomplete-upload block', 'owner-scoped upload session', 'verified upload to project handoff', 'source SHA-256', 'N00 to N01 source ingest', 'isolated script-worker contract', 'script source hash', 'production index', 'provider gate', 'job-to-website N04 status reconciliation', 'keyboard stage navigation route and focus retention', 'mobile Stage 03 storyboard layout', 'N04 website review readback', 'workbench candidate catalog and full image viewer', 'stale review rejection', 'N05 website authorization recording without provider submit', 'N05 exact-SHA regeneration queue', 'decision transaction intent', 'N06 Mimo-only dry-run transaction', 'mobile Stage 04 no-media layout', 'N06 quality policy token rejection', 'N06 stale spec rejection', 'V002 receipt and QA lock', 'no provider invocation or task ID', 'N06 website runtime projection', 'local-edit and video-submit gates preserved', 'invalid DOCX cleanup gate']
    }));
  } finally {
    if (browser) await browser.close();
    server.kill();
    await fsp.rm(tempRoot, { recursive: true, force: true });
    if (serverStderr) process.stderr.write(serverStderr);
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
