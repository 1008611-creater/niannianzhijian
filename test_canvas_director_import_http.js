const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const sharp = require('sharp');

const root = __dirname;
const port = 20300 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
const dataRoot = path.join(os.tmpdir(), `niannian-canvas-director-${process.pid}-${Date.now()}`);
let child;
let childOutput = '';
let childExit = null;

function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function headers(token, extra = {}) { return {cookie:`niannian_session=${token}`, ...extra}; }

async function seed() {
  await fsp.mkdir(dataRoot, {recursive:true});
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const userA = {id:'USR-DIRECTOR-A',email:'director-a@example.test',status:'active'};
  const userB = {id:'USR-DIRECTOR-B',email:'director-b@example.test',status:'active'};
  await Promise.all([
    fsp.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([userA, userB])),
    fsp.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{tokenHash:tokenHash('director-token-a'),userId:userA.id,expiresAt:future},{tokenHash:tokenHash('director-token-b'),userId:userB.id,expiresAt:future}])),
    fsp.writeFile(path.join(dataRoot, 'projects.json'), JSON.stringify([{id:'NN-DIRECTOR-A',ownerId:userA.id,name:'导演项目 A',status:'draft'},{id:'NN-DIRECTOR-B',ownerId:userA.id,name:'导演项目 B',status:'draft'}])),
    fsp.writeFile(path.join(dataRoot, 'script-projects.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'canvas-documents.json'), '{}'),
    fsp.writeFile(path.join(dataRoot, 'canvas-generation-jobs.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'workspace-bindings.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'website-idempotency.json'), '[]')
  ]);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return; } catch {}
    if (childExit) throw new Error(`测试服务提前退出: ${childOutput.slice(-2000)}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`测试服务未启动: ${childOutput.slice(-2000)}`);
}

async function requestImport(token, projectId, body) {
  const response = await fetch(`${baseUrl}/api/projects/${projectId}/canvas/director-import`, {method:'POST',headers:headers(token,{'content-type':'application/json','x-niannian-project-kind':'redraw'}),body:JSON.stringify(body)});
  return {response,body:await response.json()};
}

async function run() {
  await seed();
  const image = await sharp({create:{width:18,height:10,channels:4,background:{r:20,g:30,b:40,alpha:1}}}).png().toBuffer();
  const request = {projectKind:'redraw',captures:[{fileName:'director-capture.png',dataUrl:`data:image/png;base64,${image.toString('base64')}`}],directorPlan:{narrativePurpose:'主角决定离开',audienceFocus:'角色停顿与出口',blockingPlan:'从门口走到窗口'}};
  child = spawn(process.execPath, ['server.js'], {cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_LOCAL_PREVIEW_INSECURE_SESSION:'on'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data', chunk => { childOutput += chunk.toString('utf8'); });
  child.stderr.on('data', chunk => { childOutput += chunk.toString('utf8'); });
  child.once('exit', (code, signal) => { childExit = {code, signal}; });
  await waitForServer();

  const first = await requestImport('director-token-a', 'NN-DIRECTOR-A', request);
  assert.equal(first.response.status, 201);
  assert.equal(first.body.code, 'DIRECTOR_CAPTURES_IMPORTED');
  assert.equal(first.body.imports.length, 1);
  assert.equal(first.body.imports[0].node.type, 'director');
  assert.equal(first.body.imports[0].node.data.directorPlan.narrativePurpose, '主角决定离开');
  assert.match(first.body.imports[0].asset.id, /^CAS-[a-f0-9]{24}$/);
  assert.equal(Object.hasOwn(first.body.imports[0].asset, 'sha256'), false);

  const replay = await requestImport('director-token-a', 'NN-DIRECTOR-A', request);
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.idempotent, true);
  assert.equal(replay.body.imports[0].node.id, first.body.imports[0].node.id);

  const directorRead = await fetch(`${baseUrl}/api/canvas/director-desk/redraw/NN-DIRECTOR-A`, {headers:headers('director-token-a')});
  const directorInitial = await directorRead.json();
  assert.equal(directorRead.status, 200);
  assert.equal(directorInitial.revision, 0);
  const directorSave = await fetch(`${baseUrl}/api/canvas/director-desk/redraw/NN-DIRECTOR-A`, {
    method:'PUT',
    headers:headers('director-token-a',{'content-type':'application/json','if-match':directorRead.headers.get('etag')}),
    body:JSON.stringify({document:{objects:[{id:'object-1',kind:'character'}],cameras:[{id:'camera-1',captures:[{id:'capture-1',dataUrl:'data:image/png;base64,not-persisted'}]}],bindings:{}}})
  });
  const directorSaved = await directorSave.json();
  assert.equal(directorSave.status, 200);
  assert.equal(directorSaved.revision, 1);
  assert.equal(JSON.stringify(directorSaved.document).includes('data:image'), false);

  const captureForm = new FormData();
  captureForm.append('capture', new Blob([image], {type:'image/png'}), 'director-api-capture.png');
  captureForm.append('cameraId', 'camera-1');
  const captureSave = await fetch(`${baseUrl}/api/canvas/director-desk/redraw/NN-DIRECTOR-A/captures`, {method:'POST',headers:headers('director-token-a',{'if-match':directorSave.headers.get('etag')}),body:captureForm});
  const captured = await captureSave.json();
  assert.equal(captureSave.status, 200);
  assert.equal(captured.revision, 1);
  assert.equal(captured.asset.previewUrl, captured.asset.downloadUrl);
  assert.equal(Object.hasOwn(captured.asset, 'sha256'), false);

  const bindingSave = await fetch(`${baseUrl}/api/canvas/director-desk/redraw/NN-DIRECTOR-A/bindings/storyboard`, {method:'POST',headers:headers('director-token-a',{'content-type':'application/json'}),body:JSON.stringify({id:'storyboard-1',title:'镜头方案'})});
  const binding = await bindingSave.json();
  assert.equal(bindingSave.status, 200);
  assert.equal(binding.binding.id, 'storyboard-1');

  const documentResponse = await fetch(`${baseUrl}/api/canvas/documents/redraw/NN-DIRECTOR-A`, {headers:headers('director-token-a')});
  const documentBody = await documentResponse.json();
  assert.equal(documentResponse.status, 200);
  assert.equal(documentBody.document.nodes.length, 1);
  assert.equal(JSON.stringify(documentBody.document).includes('data:image'), false);
  assert.deepEqual(documentBody.document.nodes[0].data.assetIds, [first.body.imports[0].asset.id]);

  const downloadResponse = await fetch(baseUrl + first.body.imports[0].asset.downloadUrl, {headers:headers('director-token-a')});
  assert.equal(downloadResponse.status, 200);
  assert.deepEqual(Buffer.from(await downloadResponse.arrayBuffer()), image);

  const foreign = await requestImport('director-token-b', 'NN-DIRECTOR-A', request);
  assert.equal(foreign.response.status, 404);
  const foreignDirectorRead = await fetch(`${baseUrl}/api/canvas/director-desk/redraw/NN-DIRECTOR-A`, {headers:headers('director-token-b')});
  assert.equal(foreignDirectorRead.status, 404);
  const crossProject = await requestImport('director-token-a', 'NN-DIRECTOR-B', request);
  assert.equal(crossProject.response.status, 201);
  assert.notEqual(crossProject.body.imports[0].asset.id, first.body.imports[0].asset.id);
  console.log('CANVAS_DIRECTOR_IMPORT_HTTP_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child && !child.killed) child.kill();
  await fsp.rm(dataRoot, {recursive:true,force:true});
});
