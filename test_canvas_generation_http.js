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

async function run() {
  await seed();
  child = spawn(process.execPath, ['server.js'], {cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_TEXT_API_KEY:'',NIANNIAN_TEXT_MODEL:'',NIANNIAN_TEXT_PROVIDER_SUBMIT:'off'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data', chunk => { childOutput += chunk.toString('utf8'); });
  child.stderr.on('data', chunk => { childOutput += chunk.toString('utf8'); });
  child.once('exit', (code, signal) => { childExit = {code, signal}; });
  await waitForServer();
  const body = {projectKind:'redraw',nodeId:'image-node-001',model:'image2',prompt:'白色背景产品主视觉',inputAssetIds:['asset-001']};
  const first = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-job-0001'}),body:JSON.stringify(body)});
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

  const yunfeiHd = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-yunfei-hd-0001'}),body:JSON.stringify({...body, model:'yunfei-gpt-image-2-hd',resolution:'4k',aspectRatio:'16:9'})});
  assert.equal(yunfeiHd.response.status, 201);
  assert.equal(yunfeiHd.body.job.imageChannel, 'yunfei-gpt-image-2-hd');
  assert.equal(yunfeiHd.body.job.outputSize, '3840x2160');
  const invalidYunfei1k = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-yunfei-1k-invalid-0001'}),body:JSON.stringify({...body, model:'yunfei-gpt-image-2-1k',resolution:'2k',aspectRatio:'1:1'})});
  assert.equal(invalidYunfei1k.response.status, 422);
  assert.equal(invalidYunfei1k.body.code, 'CANVAS_IMAGE2_RESOLUTION_UNSUPPORTED');

  const dryRun = await request(`/api/projects/NN-CANVAS-A/canvas/jobs/${encodeURIComponent(first.body.job.id)}/dry-run`, {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json'}),body:JSON.stringify({projectKind:'redraw'})});
  assert.equal(dryRun.response.status, 200);
  assert.equal(dryRun.body.dryRun.spendRequested, false);
  assert.equal(dryRun.body.dryRun.providerSubmitEnabled, false);

  const h3Body = {projectKind:'redraw',nodeId:'video-node-001',model:'h3',prompt:'产品缓慢旋转，镜头轻微推进',inputAssetIds:['asset-001'],aspectRatio:'16:9',durationSeconds:5};
  const h3Job = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-h3-0001'}),body:JSON.stringify(h3Body)});
  assert.equal(h3Job.response.status, 201);
  assert.equal(h3Job.body.job.nodeType, 'video');
  assert.equal(h3Job.body.job.durationSeconds, 5);
  assert.equal(Object.hasOwn(h3Job.body.job, 'providerTaskId'), false);

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

  const h3DefaultPortrait = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-h3-default-portrait-0001'}),body:JSON.stringify({projectKind:'redraw',nodeId:'video-node-default-001',model:'h3',prompt:'默认竖屏回归',inputAssetIds:['asset-001'],durationSeconds:5})});
  assert.equal(h3DefaultPortrait.response.status, 201);
  assert.equal(h3DefaultPortrait.body.job.aspectRatio, '9:16');
  const h3StaleDefaultPortrait = await request('/api/projects/NN-CANVAS-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-h3-stale-default-0001'}),body:JSON.stringify({projectKind:'redraw',nodeId:'video-node-stale-default-001',model:'h3',prompt:'旧默认竖屏回归',inputAssetIds:['asset-001'],durationSeconds:5})});
  assert.equal(h3StaleDefaultPortrait.response.status, 201);
  assert.equal(h3StaleDefaultPortrait.body.job.aspectRatio, '9:16');
  const h3AuthorizationMissing = await request(`/api/projects/NN-CANVAS-A/canvas/jobs/${encodeURIComponent(h3Job.body.job.id)}/authorize`, {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','x-niannian-project-kind':'redraw'}),body:JSON.stringify({projectKind:'redraw'})});
  assert.equal(h3AuthorizationMissing.response.status, 422);
  assert.equal(h3AuthorizationMissing.body.code, 'CANVAS_PROVIDER_AUTHORIZATION_REQUIRED');
  const h3AuthorizationDisabled = await request(`/api/projects/NN-CANVAS-A/canvas/jobs/${encodeURIComponent(h3Job.body.job.id)}/authorize`, {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','x-niannian-project-kind':'redraw'}),body:JSON.stringify({projectKind:'redraw',confirmProviderSpend:true})});
  assert.equal(h3AuthorizationDisabled.response.status, 409);
  assert.equal(h3AuthorizationDisabled.body.code, 'CANVAS_PROVIDER_SUBMIT_DISABLED');

  const webCanvasJob = await request('/api/projects/NN-WEB-A/canvas/jobs', {method:'POST',headers:headers('canvas-token-a',{'content-type':'application/json','idempotency-key':'canvas-http-web-0001'}),body:JSON.stringify({projectKind:'redraw',nodeId:'web-image-node-001',model:'image2',prompt:'网页画布节点'})});
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
