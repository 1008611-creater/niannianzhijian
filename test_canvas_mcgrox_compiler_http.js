'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

const root = __dirname;
const port = 25400 + crypto.randomInt(500);
const baseUrl = 'http://127.0.0.1:' + port;
const dataRoot = path.join(os.tmpdir(), 'niannian-mcgrox-compiler-http-' + process.pid + '-' + Date.now());
const token = 'mcgrox-compiler-http-token';
const user = {id:'USR-MCGROX-COMPILER',email:'mcgrox-compiler@example.test',status:'active',role:'admin',tenantId:'TEN-MCGROX'};
const project = {id:'NN-MCGROX-COMPILER-01',ownerId:user.id,name:'MCGrox compiler chain',projectKind:'redraw',canvasOnly:true,status:'ready',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),runtime:{}};
let server;

function tokenHash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function headers(extra = {}) { return {cookie:'niannian_session=' + token,...extra}; }
function node(id, type, skillKey, parameters = {}) { return {id,type,kind:type,status:'draft',skillKey,position:{x:100,y:100},parameters,data:{title:skillKey,parameters}}; }
function documentFixture() {
  return {version:1,nodes:[
    node('mcgrox-screenwriter','text','screenwriter',{inputs:{story:'发生在雨夜街头的短剧故事。'}}),
    node('mcgrox-assets','character','chaoge-assets-trial'),
    node('mcgrox-shotlist','shot','shotlist-builder'),
    node('mcgrox-hell','shot','hell-grind'),
    node('mcgrox-image','image','image2-storyboard-video'),
    node('mcgrox-video','video','minimaxh3skill')
  ],edges:[
    {id:'mc-edge-1',source:'mcgrox-screenwriter',target:'mcgrox-assets',sourcePort:'screenplay',targetPort:'screenplay',kind:'depends_on'},
    {id:'mc-edge-2',source:'mcgrox-screenwriter',target:'mcgrox-shotlist',sourcePort:'screenplay',targetPort:'screenplay',kind:'depends_on'},
    {id:'mc-edge-3',source:'mcgrox-assets',target:'mcgrox-shotlist',sourcePort:'asset_manifest',targetPort:'asset_manifest',kind:'depends_on'},
    {id:'mc-edge-4',source:'mcgrox-shotlist',target:'mcgrox-hell',sourcePort:'shotlist',targetPort:'shotlist',kind:'depends_on'},
    {id:'mc-edge-5',source:'mcgrox-hell',target:'mcgrox-image',sourcePort:'image_prompt',targetPort:'prompt',kind:'depends_on'},
    {id:'mc-edge-6',source:'mcgrox-hell',target:'mcgrox-video',sourcePort:'video_prompt',targetPort:'prompt',kind:'depends_on'}
  ],viewport:{x:0,y:0,zoom:1}};
}

async function request(pathname, options = {}) { const response = await fetch(baseUrl + pathname, options); return {response,body:await response.json()}; }
async function waitForServer() { for (let attempt = 0; attempt < 100; attempt += 1) { try { if ((await fetch(baseUrl + '/api/health')).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error('mcgrox_compiler_server_not_ready'); }

async function run() {
  await fs.mkdir(dataRoot, {recursive:true});
  await Promise.all([
    fs.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([user])),
    fs.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{tokenHash:tokenHash(token),userId:user.id,expiresAt:new Date(Date.now() + 3600000).toISOString()}])),
    fs.writeFile(path.join(dataRoot, 'projects.json'), '[]'), fs.writeFile(path.join(dataRoot, 'canvas-projects.json'), JSON.stringify([project])),
    fs.writeFile(path.join(dataRoot, 'canvas-documents.json'), '{}'), fs.writeFile(path.join(dataRoot, 'canvas-assets.json'), '[]'), fs.writeFile(path.join(dataRoot, 'canvas-generation-jobs.json'), '[]'), fs.writeFile(path.join(dataRoot, 'workspace-bindings.json'), '[]'), fs.writeFile(path.join(dataRoot, 'script-projects.json'), '[]')
  ]);
  server = spawn(process.execPath, ['server.js'], {cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_RUNNINGHUB_SUBMIT:'off',NIANNIAN_GPT_API_KEY:'test-only',NIANNIAN_GPT56_MODEL:'gpt-5.6',NIANNIAN_GPT_API_BASE_URL:'https://mcgrox.test',NODE_OPTIONS:'--require=' + path.join(root, 'test_canvas_mcgrox_compiler_fetch_stub.js')},stdio:['ignore','pipe','pipe']});
  await waitForServer();
  await request('/api/admin/model-config/provider', {method:'PUT',headers:headers({'content-type':'application/json'}),body:JSON.stringify({id:'mcgrox-server',label:'MCGrox 编排服务',kind:'text',enabled:true})});
  await request('/api/admin/model-config/model', {method:'PUT',headers:headers({'content-type':'application/json'}),body:JSON.stringify({id:'mcgrox-compiler',label:'MCGrox 编排模型',kind:'text',providerId:'mcgrox-server',providerLabel:'MCGrox',tenantId:'default',enabled:true,priceCredits:1})});
  await request('/api/admin/credits/adjust', {method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({tenantId:user.tenantId,amount:20,reason:'compiler test grant'})});
  let current = await request('/api/canvas/documents/redraw/' + project.id, {headers:headers()});
  let saved = await request('/api/canvas/documents/redraw/' + project.id, {method:'PUT',headers:headers({'content-type':'application/json','if-match':current.response.headers.get('etag')}),body:JSON.stringify({document:documentFixture()})});
  assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
  let etag = saved.response.headers.get('etag');
  for (const nodeId of ['mcgrox-screenwriter','mcgrox-assets','mcgrox-shotlist','mcgrox-hell']) {
    const compiled = await request('/api/projects/' + project.id + '/canvas/skill-nodes/' + nodeId + '/compile', {method:'POST',headers:headers({'content-type':'application/json','if-match':etag,'idempotency-key':'mcgrox-' + nodeId}),body:JSON.stringify({projectKind:'redraw',confirmProviderCall:true})});
    assert.equal(compiled.response.status, 200, JSON.stringify(compiled.body));
    assert.equal(compiled.body.code, 'CANVAS_COMPILER_SUCCEEDED');
    assert.equal(compiled.body.node.taskRef.status, 'succeeded');
    assert.ok(Object.keys(compiled.body.node.parameters.compiledOutputs).length > 0);
    etag = compiled.response.headers.get('etag');
  }
  const image = await request('/api/projects/' + project.id + '/canvas/jobs', {method:'POST',headers:headers({'content-type':'application/json','idempotency-key':'mcgrox-image-job'}),body:JSON.stringify({projectKind:'redraw',nodeId:'mcgrox-image',model:'yunwu-gpt-image-2-c',resolution:'4k',aspectRatio:'9:16'})});
  assert.equal(image.response.status, 201, JSON.stringify(image.body));
  assert.equal(image.body.job.prompt, '电影感雨夜关键帧提示词。');
  assert.equal(image.body.job.status, 'awaiting_authorization');
  const video = await request('/api/projects/' + project.id + '/canvas/jobs', {method:'POST',headers:headers({'content-type':'application/json','idempotency-key':'mcgrox-video-job'}),body:JSON.stringify({projectKind:'redraw',nodeId:'mcgrox-video',model:'h3',durationSeconds:5,aspectRatio:'9:16'})});
  assert.equal(video.response.status, 201, JSON.stringify(video.body));
  assert.equal(video.body.job.prompt, '雨夜人物行走，稳定跟拍的视频提示词。');
  assert.equal(video.body.providerSubmitEnabled, false);
  console.log(JSON.stringify({ok:true,verified:['screenwriter to assets to shotlist to hell-grind compiles through the server-owned MCGrox Responses path','each compiler result persists task status and typed outputs','Hell Grind prompts reach existing Image2 and H3 candidate jobs','no image or video provider submission occurs']}));
}

run().catch(error => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; }).finally(async () => { if (server && !server.killed) server.kill(); await fs.rm(dataRoot, {recursive:true,force:true}); });
