'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

const root = __dirname;
const port = 24700 + crypto.randomInt(700);
const baseUrl = 'http://127.0.0.1:' + port;
const dataRoot = path.join(os.tmpdir(), 'niannian-champion-skill-nodes-' + process.pid + '-' + Date.now());
const token = 'champion-skill-node-token';
const user = {id:'USR-CHAMPION-SKILLS',email:'champion-skills@example.test',status:'active'};
const project = {id:'NN-CHAMPION-SKILLS-01',ownerId:user.id,name:'Champion Skill Canvas',projectKind:'redraw',canvasOnly:true,status:'ready',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),runtime:{}};
let server;
let output = '';

function tokenHash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function headers(extra = {}) { return {cookie:'niannian_session=' + token,...extra}; }
function node(id, type, skillKey, data = {}) {
  return {id,type,kind:type,status:'draft',skillKey,skillVersion:'1.0.0',position:{x:120,y:120},data:{title:skillKey,status:'draft',...data}};
}
function championDocument() {
  return {
    version:1,
    nodes:[
      node('champion-screenwriter','text','screenwriter'),
      node('champion-assets','character','chaoge-assets-trial'),
      node('champion-shotlist','shot','shotlist-builder'),
      node('champion-hellgrind','shot','hell-grind',{parameters:{compiledOutputs:{image_prompt:'雨夜霓虹街道，电影级关键帧，人物连续性严格保持。',video_prompt:'雨夜霓虹街道，人物缓慢前行，镜头跟拍。'}}}),
      node('champion-image','image','image2-storyboard-video',{prompt:'不能覆盖上游编译提示',imageChannel:'yunwu-gpt-image-2-c',resolution:'4k',aspectRatio:'9:16'}),
      node('champion-video','video','minimaxh3skill',{prompt:'不能覆盖上游编译提示',durationSeconds:5,aspectRatio:'9:16'})
    ],
    edges:[
      {id:'edge-script-assets',source:'champion-screenwriter',target:'champion-assets',sourcePort:'screenplay',targetPort:'screenplay',kind:'depends_on'},
      {id:'edge-script-shotlist',source:'champion-screenwriter',target:'champion-shotlist',sourcePort:'screenplay',targetPort:'screenplay',kind:'depends_on'},
      {id:'edge-assets-shotlist',source:'champion-assets',target:'champion-shotlist',sourcePort:'asset_manifest',targetPort:'asset_manifest',kind:'depends_on'},
      {id:'edge-shotlist-hell',source:'champion-shotlist',target:'champion-hellgrind',sourcePort:'shotlist',targetPort:'shotlist',kind:'depends_on'},
      {id:'edge-hell-image',source:'champion-hellgrind',target:'champion-image',sourcePort:'image_prompt',targetPort:'prompt',kind:'depends_on'},
      {id:'edge-hell-video',source:'champion-hellgrind',target:'champion-video',sourcePort:'video_prompt',targetPort:'prompt',kind:'depends_on'},
      {id:'edge-image-video',source:'champion-image',target:'champion-video',sourcePort:'image_asset',targetPort:'image_asset',kind:'reference'}
    ],
    viewport:{x:0,y:0,zoom:1}
  };
}

async function request(pathname, options = {}) {
  const response = await fetch(baseUrl + pathname, options);
  return {response,body:await response.json()};
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(baseUrl + '/api/health')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('champion_skill_node_server_not_ready:' + output.slice(-800));
}

async function save(document, etag) {
  return request('/api/canvas/documents/redraw/' + project.id, {
    method:'PUT',
    headers:headers({'content-type':'application/json','if-match':etag}),
    body:JSON.stringify({document})
  });
}

async function run() {
  await fs.mkdir(dataRoot, {recursive:true});
  await Promise.all([
    fs.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([user])),
    fs.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{tokenHash:tokenHash(token),userId:user.id,expiresAt:new Date(Date.now() + 3600000).toISOString()}])),
    fs.writeFile(path.join(dataRoot, 'projects.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'canvas-projects.json'), JSON.stringify([project])),
    fs.writeFile(path.join(dataRoot, 'canvas-documents.json'), '{}'),
    fs.writeFile(path.join(dataRoot, 'canvas-assets.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'canvas-generation-jobs.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'workspace-bindings.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'script-projects.json'), '[]')
  ]);
  server = spawn(process.execPath, ['server.js'], {cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_TEXT_API_KEY:'',NIANNIAN_TEXT_MODEL:'',NIANNIAN_TEXT_PROVIDER_SUBMIT:'off',NIANNIAN_RUNNINGHUB_SUBMIT:'off'},stdio:['ignore','pipe','pipe']});
  server.stdout.on('data', chunk => { output += chunk.toString(); });
  server.stderr.on('data', chunk => { output += chunk.toString(); });
  await waitForServer();

  const initial = await request('/api/canvas/documents/redraw/' + project.id, {headers:headers()});
  assert.equal(initial.response.status, 200);
  const saved = await save(championDocument(), initial.response.headers.get('etag'));
  assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
  let etag = saved.response.headers.get('etag');
  const screenwriterBlocked = await request('/api/projects/' + project.id + '/canvas/skill-nodes/champion-screenwriter/readiness?projectKind=redraw', {headers:headers()});
  assert.equal(screenwriterBlocked.response.status, 200, JSON.stringify(screenwriterBlocked.body));
  assert.equal(screenwriterBlocked.body.readiness.ready, false);
  assert.deepEqual(screenwriterBlocked.body.readiness.blockers, [{portId:'story',type:'story',reason:'input_required'}]);
  const withStory = saved.body.document;
  const screenwriter = withStory.nodes.find(item => item.id === 'champion-screenwriter');
  screenwriter.parameters = {...screenwriter.parameters, inputs:{story:'一段发生在雨夜街头的短剧故事。'}};
  screenwriter.data.parameters = screenwriter.parameters;
  const storySaved = await save(withStory, etag);
  assert.equal(storySaved.response.status, 200, JSON.stringify(storySaved.body));
  etag = storySaved.response.headers.get('etag');
  const screenwriterReady = await request('/api/projects/' + project.id + '/canvas/skill-nodes/champion-screenwriter/readiness?projectKind=redraw', {headers:headers()});
  assert.equal(screenwriterReady.response.status, 200, JSON.stringify(screenwriterReady.body));
  assert.equal(screenwriterReady.body.readiness.ready, true);
  const compilerDryRun = await request('/api/projects/' + project.id + '/canvas/skill-nodes/champion-screenwriter/compile', {method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({projectKind:'redraw'})});
  assert.equal(compilerDryRun.response.status, 200, JSON.stringify(compilerDryRun.body));
  assert.equal(compilerDryRun.body.code, 'CANVAS_COMPILER_DRY_RUN_READY');
  assert.equal(compilerDryRun.body.spendRequested, false);
  assert.deepEqual(compilerDryRun.body.inputPorts, ['story']);
  const skillNodes = saved.body.document.nodes.filter(item => ['screenwriter','chaoge-assets-trial','shotlist-builder','hell-grind'].includes(item.skillKey));
  assert.equal(skillNodes.length, 4);
  for (const item of skillNodes) {
    assert.equal(item.executionMode, 'orchestration');
    assert.equal(item.data.executionMode, 'orchestration');
    assert.equal(item.skillVersion, item.data.skillVersion);
    assert.ok(item.inputPorts.length > 0 && item.outputPorts.length > 0);
  }
  assert.deepEqual(saved.body.document.edges.find(item => item.id === 'edge-hell-image'), {id:'edge-hell-image',source:'champion-hellgrind',target:'champion-image',kind:'depends_on',sourcePort:'image_prompt',targetPort:'prompt'});
  const reload = await request('/api/canvas/documents/redraw/' + project.id, {headers:headers()});
  assert.equal(reload.response.status, 200);
  assert.equal(reload.body.document.nodes.find(item => item.skillKey === 'hell-grind').parameters.compiledOutputs.video_prompt, '雨夜霓虹街道，人物缓慢前行，镜头跟拍。');
  etag = reload.response.headers.get('etag');
  const moved = await request('/api/canvas/documents/redraw/' + project.id + '/skill-node-layout', {method:'POST',headers:headers({'content-type':'application/json','if-match':etag}),body:JSON.stringify({positions:{'champion-hellgrind':{x:960,y:420}}})});
  assert.equal(moved.response.status, 200, JSON.stringify(moved.body));
  assert.deepEqual(moved.body.document.nodes.find(item => item.id === 'champion-hellgrind').position, {x:960,y:420});
  etag = moved.response.headers.get('etag');

  const h3Node = await request('/api/canvas/documents/redraw/' + project.id + '/s3-h3', {method:'POST',headers:headers({'content-type':'application/json','if-match':etag}),body:JSON.stringify({prompt:'雨夜人物缓慢前行，镜头稳定跟拍。',aspectRatio:'9:16',durationSeconds:5})});
  assert.equal(h3Node.response.status, 201, JSON.stringify(h3Node.body));
  assert.equal(h3Node.body.code, 'CANVAS_S3_H3_NODE_READY');
  assert.equal(h3Node.body.node.skillKey, 'minimaxh3skill');
  assert.deepEqual(h3Node.body.node.inputPorts.map(port => port.id), ['prompt','image_asset']);
  assert.deepEqual(h3Node.body.node.outputPorts.map(port => port.id), ['video_asset']);
  etag = h3Node.response.headers.get('etag');
  const h3NodeJob = await request('/api/projects/' + project.id + '/canvas/jobs', {method:'POST',headers:headers({'content-type':'application/json','idempotency-key':'champion-s3-h3-job-0001'}),body:JSON.stringify({projectKind:'redraw',nodeId:'s3-h3-video',model:'h3',durationSeconds:5,aspectRatio:'9:16'})});
  assert.equal(h3NodeJob.response.status, 201, JSON.stringify(h3NodeJob.body));
  assert.equal(h3NodeJob.body.job.status, 'awaiting_authorization');
  assert.equal(h3NodeJob.body.providerSubmitEnabled, false);

  const imageJob = await request('/api/projects/' + project.id + '/canvas/jobs', {method:'POST',headers:headers({'content-type':'application/json','idempotency-key':'champion-image-job-0001'}),body:JSON.stringify({projectKind:'redraw',nodeId:'champion-image',model:'yunwu-gpt-image-2-c',resolution:'4k',aspectRatio:'9:16'})});
  assert.equal(imageJob.response.status, 201, JSON.stringify(imageJob.body));
  assert.equal(imageJob.body.job.status, 'awaiting_authorization');
  assert.equal(imageJob.body.job.prompt, '雨夜霓虹街道，电影级关键帧，人物连续性严格保持。');
  assert.equal(imageJob.body.providerSubmitEnabled, false);
  assert.equal(imageJob.body.spendRequested, false);
  assert.equal(Object.hasOwn(imageJob.body.job, 'providerTaskId'), false);
  const imageDryRun = await request('/api/projects/' + project.id + '/canvas/jobs/' + imageJob.body.job.id + '/dry-run', {method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify({projectKind:'redraw'})});
  assert.equal(imageDryRun.response.status, 200);
  assert.equal(imageDryRun.body.dryRun.spendRequested, false);
  assert.equal(imageDryRun.body.dryRun.providerSubmitEnabled, false);

  const videoJob = await request('/api/projects/' + project.id + '/canvas/jobs', {method:'POST',headers:headers({'content-type':'application/json','idempotency-key':'champion-video-job-0001'}),body:JSON.stringify({projectKind:'redraw',nodeId:'champion-video',model:'h3',durationSeconds:5,aspectRatio:'9:16'})});
  assert.equal(videoJob.response.status, 201, JSON.stringify(videoJob.body));
  assert.equal(videoJob.body.job.prompt, '雨夜霓虹街道，人物缓慢前行，镜头跟拍。');
  assert.equal(videoJob.body.job.status, 'awaiting_authorization');
  assert.equal(videoJob.body.providerSubmitEnabled, false);
  const compilerJob = await request('/api/projects/' + project.id + '/canvas/jobs', {method:'POST',headers:headers({'content-type':'application/json','idempotency-key':'champion-compiler-job-0001'}),body:JSON.stringify({projectKind:'redraw',nodeId:'champion-hellgrind'})});
  assert.equal(compilerJob.response.status, 422);
  assert.equal(compilerJob.body.code, 'CANVAS_NODE_NOT_GENERATABLE');

  const invalidUnknown = championDocument();
  invalidUnknown.nodes.push(node('champion-unknown','skill','not-a-real-skill'));
  let invalid = await save(invalidUnknown, etag);
  assert.equal(invalid.response.status, 422);
  assert.equal(invalid.body.code, 'CANVAS_SKILL_NODE_UNKNOWN_SKILL');
  const invalidPort = championDocument();
  invalidPort.nodes[3].inputPorts = [{id:'not-a-real-port',type:'prompt'}];
  invalid = await save(invalidPort, etag);
  assert.equal(invalid.response.status, 422);
  assert.equal(invalid.body.code, 'CANVAS_SKILL_NODE_PORTS_INVALID');
  const invalidConnection = championDocument();
  invalidConnection.edges[0] = {id:'edge-invalid-type',source:'champion-screenwriter',target:'champion-assets',sourcePort:'story_bible',targetPort:'screenplay',kind:'depends_on'};
  invalid = await save(invalidConnection, etag);
  assert.equal(invalid.response.status, 422);
  assert.equal(invalid.body.code, 'CANVAS_SKILL_CONNECTION_TYPE_MISMATCH');
  const crossProject = championDocument();
  crossProject.nodes[0].assetRefs = [{assetId:'CAS-FOREIGN-001',projectId:'OTHER-PROJECT',role:'source'}];
  invalid = await save(crossProject, etag);
  assert.equal(invalid.response.status, 422);
  assert.equal(invalid.body.code, 'CANVAS_SKILL_NODE_CROSS_PROJECT_ASSET');
  const sensitive = championDocument();
  sensitive.nodes[0].parameters = {apiKey:'must-not-persist'};
  invalid = await save(sensitive, etag);
  assert.equal(invalid.response.status, 422);
  assert.equal(invalid.body.code, 'CANVAS_SKILL_NODE_SENSITIVE_FIELD');
  console.log(JSON.stringify({ok:true,verified:['four typed orchestration Skill nodes persist and reload','all persisted Skill nodes use the existing layout-save path','H3 uses the same persisted node and server-job contract as Image2','typed ports reject unknown/mismatched/cross-project/sensitive data','Hell Grind prompt reaches existing Image2/H3 server job preparation','compiler nodes cannot submit provider jobs','dry-run keeps provider submission and spend disabled']}));
}

run().catch(error => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; }).finally(async () => {
  if (server && !server.killed) server.kill();
  await fs.rm(dataRoot, {recursive:true,force:true});
});
