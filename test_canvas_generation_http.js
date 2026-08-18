const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');

const root = __dirname;
const port = 18800 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const dataRoot = path.join(os.tmpdir(), `niannian-canvas-http-${process.pid}-${Date.now()}`);
let child;
let childOutput = '';
let childExit = null;

function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function headers(token, extra = {}) { return {cookie:`niannian_session=${token}`, ...extra}; }

async function seed() {
  await fsp.mkdir(dataRoot, {recursive:true});
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const userA = {id:'USR-CANVAS-A',email:'canvas-a@example.test',status:'active'};
  const userB = {id:'USR-CANVAS-B',email:'canvas-b@example.test',status:'active'};
  const canvasDocuments = {
    'redraw:NN-CANVAS-A': {
      revision:1,
      projectId:'NN-CANVAS-A',
      projectKind:'redraw',
      ownerId:userA.id,
      updatedAt:new Date().toISOString(),
      document:{
        version:1,
        nodes:[
          {id:'image-node-001',type:'image',position:{x:100,y:100},data:{title:'产品主图',prompt:'白色背景产品主视觉',assetIds:['asset-001'],status:'draft'}},
          {id:'video-node-001',type:'video',position:{x:380,y:100},data:{title:'产品视频',prompt:'产品缓慢旋转，镜头轻微推进',assetIds:['asset-001'],aspectRatio:'16:9',durationSeconds:5,status:'draft'}},
          {id:'video-node-default-001',type:'video',position:{x:660,y:100},data:{title:'默认竖屏视频',prompt:'默认竖屏回归',assetIds:['asset-001'],durationSeconds:5,status:'draft'}},
          {id:'video-node-stale-default-001',type:'video',position:{x:940,y:100},data:{title:'旧默认视频',prompt:'旧默认竖屏回归',assetIds:['asset-001'],aspectRatio:'1:1',durationSeconds:5,status:'draft'}}
        ],
        edges:[],
        viewport:{x:0,y:0,zoom:1}
      }
    },
    'nomi:redraw:NN-WEB-A': {
      revision:1,
      projectId:'NN-WEB-A',
      projectKind:'redraw',
      ownerId:userA.id,
      updatedAt:new Date().toISOString(),
      document:{generationCanvas:{nodes:[
        {id:'web-image-node-001',kind:'image',position:{x:100,y:100},data:{title:'网页产品图',prompt:'网页画布节点',status:'draft'}},
        {id:'web-text-node-001',kind:'text',position:{x:100,y:260},prompt:'网页文本节点',data:{title:'网页文案',prompt:'网页文本节点',status:'draft'}}
      ],edges:[]}}
    }
  };
  await Promise.all([
    fsp.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([userA, userB])),
    fsp.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{tokenHash:tokenHash('canvas-token-a'),userId:userA.id,expiresAt:future},{tokenHash:tokenHash('canvas-token-b'),userId:userB.id,expiresAt:future}])),
    fsp.writeFile(path.join(dataRoot, 'projects.json'), JSON.stringify([
      {id:'NN-CANVAS-A',ownerId:userA.id,name:'画布项目 A',status:'draft'},
      {id:'NN-WEB-A',ownerId:userA.id,name:'网页画布项目',status:'draft'}
    ])),
    fsp.writeFile(path.join(dataRoot, 'script-projects.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'canvas-documents.json'), JSON.stringify(canvasDocuments)),
    fsp.writeFile(path.join(dataRoot, 'canvas-generation-jobs.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'workspace-bindings.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'website-idempotency.json'), '[]')
  ]);
}

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try { const response = await fetch(`${baseUrl}/api/health`); if (response.ok) return; }
    catch (error) { lastError = error; }
    if (childExit) throw new Error(`测试服务提前退出: ${childOutput.slice(-2000)}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`测试服务未启动: ${(lastError && lastError.message) || 'unknown'} ${childOutput.slice(-2000)}`);
}

async function request(pathname, options = {}) {
  const response = await fetch(baseUrl + pathname, options);
  const body = await response.json();
  return {response, body};
}

async function uploadReferenceImage() {
  const form = new FormData();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  form.append('asset', new Blob([png], {type:'image/png'}), 'reference.png');
  form.append('kind', 'reference_image');
  const response = await fetch(`${baseUrl}/api/projects/NN-CANVAS-A/assets`, {method:'POST', headers:headers('canvas-token-a'), body:form});
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.match(body.asset.id, /^CAS-[a-f0-9]{24}$/);
  return body.asset.id;
}

async function run() {
  await seed();
  child = spawn(process.execPath, ['server.js'], {cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_TEXT_API_KEY:'',NIANNIAN_TEXT_MODEL:'',NIANNIAN_TEXT_PROVIDER_SUBMIT:'off'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data', chunk => { childOutput += chunk.toString('utf8'); });
  child.stderr.on('data', chunk => { childOutput += chunk.toString('utf8'); });
  child.once('exit', (code, signal) => { childExit = {code, signal}; });
  await waitForServer();
  const referenceAssetId = await uploadReferenceImage();
  const documentRead = await fetch(`${baseUrl}/api/canvas/documents/redraw/NN-CANVAS-A`, {headers:headers('canvas-token-a')});
  assert.equal(documentRead.status, 200);
  const documentSave = await fetch(`${baseUrl}/api/canvas/documents/redraw/NN-CANVAS-A`, {
    method:'PUT',
    headers:headers('canvas-token-a', {'content-type':'application/json', 'if-match':documentRead.headers.get('etag')}),
    body:JSON.stringify({document:{version:1,nodes:[
      {id:'image-node-001',type:'image',data:{title:'产品主图',prompt:'白色背景产品主视觉',assetIds:['asset-001'],status:'draft'}},
      {id:'video-node-001',type:'video',data:{title:'产品视频',prompt:'产品缓慢旋转，镜头轻微推进',assetIds:['asset-001'],status:'draft'}},
      {id:'video-node-default-001',type:'video',data:{title:'默认竖屏视频',prompt:'默认竖屏回归',assetIds:['asset-001'],status:'draft'}},
      {id:'video-node-stale-default-001',type:'video',data:{title:'旧默认视频',prompt:'旧默认竖屏回归',assetIds:['asset-001'],status:'draft'}},
      {id:'skill-node-001',type:'video',skillKey:'runninghub-animate-motion-transfer',
      type:'video',
      skillKey:'runninghub-animate-motion-transfer',
      description:'动作迁移节点',
      inputPorts:[{id:'image_asset',type:'image_asset',required:true},{id:'motion_video',type:'motion_video',required:true}],
      outputPorts:[{id:'video_asset',type:'video_asset'}],
      parameters:{durationSeconds:5,aspectRatio:'9:16'},
      assetRefs:[{assetId:'asset-image-001',projectId:'NN-CANVAS-A',role:'character_reference'},{assetId:'asset-video-001',projectId:'NN-CANVAS-A',role:'motion_source'}],
      status:'ready'
    }],edges:[],viewport:{x:0,y:0,zoom:1}}})
  });
  const savedDocument = await documentSave.json();
  assert.equal(documentSave.status, 200);
  const savedSkillNode = savedDocument.document.nodes.find(node => node.id === 'skill-node-001');
  assert.equal(savedSkillNode.skillKey, 'runninghub-animate-motion-transfer');
  assert.equal(savedSkillNode.data.skillKey, 'runninghub-animate-motion-transfer');
  const invalidSkillSave = await fetch(`${baseUrl}/api/canvas/documents/redraw/NN-CANVAS-A`, {
    method:'PUT',
    headers:headers('canvas-token-a', {'content-type':'application/json', 'if-match':documentSave.headers.get('etag')}),
    body:JSON.stringify({document:{version:1,nodes:[{id:'skill-node-002',type:'video',skillKey:'not-a-real-skill'}],edges:[],viewport:{x:0,y:0,zoom:1}}})
  });
  const invalidSkill = await invalidSkillSave.json();
  assert.equal(invalidSkillSave.status, 422);
  assert.equal(invalidSkill.code, 'CANVAS_SKILL_NODE_UNKNOWN_SKILL');
  const body = {projectKind:'redraw',nodeId:'image-node-001',model:'yunwu-gpt-image-2-c',prompt:'白色背景产品主视觉',inputAssetIds:[referenceAssetId],resolution:'4k',outputSize:'3840x2160',aspectRatio:'16:9'};
  const first = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-job-0001'}),body:JSON.stringify(body)});
  if (first.response.status !== 201) console.error('first canvas job rejected', first.response.status, first.body);
  assert.equal(first.response.status, 201);
  assert.equal(first.body.job.status, 'awaiting_authorization');
  assert.equal(first.body.providerSubmitEnabled, false);
  assert.equal(Object.hasOwn(first.body.job, 'providerTaskId'), false);

  const authorizationMissing = await request(`/api/projects/NN-CANVAS-A/canvas/jobs/${encodeURIComponent(first.body.job.id)}/authorize`, {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','x-niannian-project-kind':'redraw'}),body:JSON.stringify({projectKind:'redraw'})});
  assert.equal(authorizationMissing.response.status, 422);
  assert.equal(authorizationMissing.body.code, 'CANVAS_PROVIDER_AUTHORIZATION_REQUIRED');
  const authorizationDisabled = await request(`/api/projects/NN-CANVAS-A/canvas/jobs/${encodeURIComponent(first.body.job.id)}/authorize`, {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','x-niannian-project-kind':'redraw'}),body:JSON.stringify({projectKind:'redraw',confirmProviderSpend:true})});
  assert.equal(authorizationDisabled.response.status, 409);
  assert.equal(authorizationDisabled.body.code, 'CANVAS_PROVIDER_SUBMIT_DISABLED');

  const repeat = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-job-0001'}),body:JSON.stringify(body)});
  assert.equal(repeat.response.status, 200);
  assert.equal(repeat.body.idempotent, true);
  assert.equal(repeat.body.job.id, first.body.job.id);

  // Retrying a failed, refunded Image2 submission must reach the normal provider
  // gate instead of being rejected as an already-authorized historical job.
  const jobsPath = path.join(dataRoot, 'canvas-generation-jobs.json');
  const failedJobs = JSON.parse(await fsp.readFile(jobsPath, 'utf8'));
  failedJobs[0] = {...failedJobs[0], status:'failed', providerSubmitState:'failed', creditState:'refunded', creditReservationId:'R-REFUNDED', providerTaskId:null};
  await fsp.writeFile(jobsPath, JSON.stringify(failedJobs));
  const retryFailed = await request(`/api/projects/NN-CANVAS-A/canvas/jobs/${encodeURIComponent(first.body.job.id)}/authorize`, {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','x-niannian-project-kind':'redraw'}),body:JSON.stringify({projectKind:'redraw',confirmProviderSpend:true})});
  assert.equal(retryFailed.response.status, 409);
  assert.equal(retryFailed.body.code, 'CANVAS_PROVIDER_SUBMIT_DISABLED');

  const yunwuEdit = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-yunwu-edit-0001'}),body:JSON.stringify({...body, model:'yunwu-gpt-image-2-c-edit',resolution:'4k',outputSize:'3840x2160',aspectRatio:'16:9'})});
  assert.equal(yunwuEdit.response.status, 201);
  assert.equal(yunwuEdit.body.job.imageChannel, 'yunwu-gpt-image-2-c-edit');
  assert.equal(yunwuEdit.body.job.outputSize, '3840x2160');
  const retiredYunfei = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-yunfei-retired-0001'}),body:JSON.stringify({...body, model:'yunfei-gpt-image-2-1k',resolution:'1k',aspectRatio:'1:1'})});
  assert.equal(retiredYunfei.response.status, 422);
  assert.equal(retiredYunfei.body.code, 'CANVAS_JOB_MODEL_INVALID');

  const dryRun = await request(`/api/projects/NN-CANVAS-A/canvas/jobs/${encodeURIComponent(first.body.job.id)}/dry-run`, {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json'}),body:JSON.stringify({projectKind:'redraw'})});
  assert.equal(dryRun.response.status, 200);
  assert.equal(dryRun.body.dryRun.spendRequested, false);
  assert.equal(dryRun.body.dryRun.providerSubmitEnabled, false);

  const h3Body = {projectKind:'redraw',nodeId:'video-node-001',model:'h3',prompt:'产品缓慢旋转，镜头轻微推进',inputAssetIds:[referenceAssetId],aspectRatio:'16:9',durationSeconds:5};
  const h3Job = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-h3-0001'}),body:JSON.stringify(h3Body)});
  assert.equal(h3Job.response.status, 201);
  assert.equal(h3Job.body.job.nodeType, 'video');
  assert.equal(h3Job.body.job.durationSeconds, 5);
  assert.equal(Object.hasOwn(h3Job.body.job, 'providerTaskId'), false);

  const dolaBody = {projectKind:'redraw',nodeId:'video-node-001',model:'dola-seedance-2-5',prompt:'产品缓慢旋转，镜头轻微推进',inputAssetIds:[referenceAssetId],aspectRatio:'9:16',durationSeconds:30,accountSlot:2};
  const dolaJob = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-dola-0001'}),body:JSON.stringify(dolaBody)});
  assert.equal(dolaJob.response.status, 201);
  assert.equal(dolaJob.body.job.model, 'dola-seedance-2-5');
  assert.equal(dolaJob.body.job.durationSeconds, 30);
  assert.equal(dolaJob.body.job.accountSlot, 2);
  const dolaDurationRejected = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-dola-invalid-0001'}),body:JSON.stringify({...dolaBody,durationSeconds:15})});
  assert.equal(dolaDurationRejected.response.status, 422);
  assert.equal(dolaDurationRejected.body.code, 'CANVAS_DOLA_DURATION_REQUIRED');
  const dolaAuthorizationDisabled = await request(`/api/projects/NN-CANVAS-A/canvas/jobs/${encodeURIComponent(dolaJob.body.job.id)}/authorize`, {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','x-niannian-project-kind':'redraw'}),body:JSON.stringify({projectKind:'redraw',confirmProviderSpend:true})});
  assert.equal(dolaAuthorizationDisabled.response.status, 409);
  assert.equal(dolaAuthorizationDisabled.body.code, 'CANVAS_PROVIDER_SUBMIT_DISABLED');

  const animateJob = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-animate-0001'}),body:JSON.stringify({projectKind:'redraw',nodeId:'video-node-001',model:'runninghub-animate-motion-transfer',prompt:'',inputAssetIds:['asset-image-001','asset-video-001'],aspectRatio:'9:16',durationSeconds:5})});
  assert.equal(animateJob.response.status, 201);
  assert.equal(animateJob.body.job.model, 'runninghub-animate-motion-transfer');
  assert.equal(animateJob.body.job.videoChannel, 'animate-transfer');
  assert.equal(animateJob.body.job.videoChannelLabel, '动作迁移（工作流）');
  assert.equal(Object.hasOwn(animateJob.body.job, 'providerTaskId'), false);
  const animateAiAppJob = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-animate-ai-app-0001'}),body:JSON.stringify({projectKind:'redraw',nodeId:'video-node-001',model:'runninghub-animate-ai-app',prompt:'',inputAssetIds:['asset-image-001','asset-video-001'],aspectRatio:'9:16',durationSeconds:5})});
  assert.equal(animateAiAppJob.response.status, 201);
  assert.equal(animateAiAppJob.body.job.model, 'runninghub-animate-ai-app');
  assert.equal(animateAiAppJob.body.job.videoChannel, 'animate-ai-app');
  assert.equal(animateAiAppJob.body.job.videoChannelLabel, '动作迁移（AI 应用）');
  assert.equal(Object.hasOwn(animateAiAppJob.body.job, 'providerTaskId'), false);

  const h3DefaultPortrait = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-h3-default-portrait-0001'}),body:JSON.stringify({projectKind:'redraw',nodeId:'video-node-default-001',model:'h3',prompt:'默认竖屏回归',inputAssetIds:[referenceAssetId],durationSeconds:5})});
  assert.equal(h3DefaultPortrait.response.status, 201);
  assert.equal(h3DefaultPortrait.body.job.aspectRatio, '9:16');
  const h3StaleDefaultPortrait = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-h3-stale-default-0001'}),body:JSON.stringify({projectKind:'redraw',nodeId:'video-node-stale-default-001',model:'h3',prompt:'旧默认竖屏回归',inputAssetIds:[referenceAssetId],durationSeconds:5})});
  assert.equal(h3StaleDefaultPortrait.response.status, 201);
  assert.equal(h3StaleDefaultPortrait.body.job.aspectRatio, '9:16');
  const h3AuthorizationMissing = await request(`/api/projects/NN-CANVAS-A/canvas/jobs/${encodeURIComponent(h3Job.body.job.id)}/authorize`, {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','x-niannian-project-kind':'redraw'}),body:JSON.stringify({projectKind:'redraw'})});
  assert.equal(h3AuthorizationMissing.response.status, 422);
  assert.equal(h3AuthorizationMissing.body.code, 'CANVAS_PROVIDER_AUTHORIZATION_REQUIRED');
  const h3AuthorizationDisabled = await request(`/api/projects/NN-CANVAS-A/canvas/jobs/${encodeURIComponent(h3Job.body.job.id)}/authorize`, {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','x-niannian-project-kind':'redraw'}),body:JSON.stringify({projectKind:'redraw',confirmProviderSpend:true})});
  assert.equal(h3AuthorizationDisabled.response.status, 409);
  assert.equal(h3AuthorizationDisabled.body.code, 'CANVAS_PROVIDER_SUBMIT_DISABLED');

  const webCanvasJob = await request('/api/projects/NN-WEB-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-web-0001'}),body:JSON.stringify({projectKind:'redraw',nodeId:'web-image-node-001',model:'yunwu-gpt-image-2-c',prompt:'网页画布节点',resolution:'4k',aspectRatio:'9:16'})});
  assert.equal(webCanvasJob.response.status, 201);
  assert.equal(webCanvasJob.body.job.nodeId, 'web-image-node-001');
  assert.equal(webCanvasJob.body.job.status, 'awaiting_authorization');

  const webTextJob = await request('/api/projects/NN-WEB-A/text/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-web-text-0001'}),body:JSON.stringify({projectKind:'redraw',nodeId:'web-text-node-001',model:'gpt-luna',prompt:'网页文本节点'})});
  assert.equal(webTextJob.response.status, 409);
  assert.equal(webTextJob.body.code, 'CANVAS_TEXT_PROVIDER_NOT_READY');

  const foreign = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {headers:headers('canvas-token-b',{'x-niannian-project-kind':'redraw'})});
  assert.equal(foreign.response.status, 404);
  assert.equal(foreign.body.code, 'PROJECT_NOT_FOUND');
  console.log('CANVAS_GENERATION_HTTP_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child && !child.killed) child.kill();
  await fsp.rm(dataRoot, {recursive:true,force:true});
});
