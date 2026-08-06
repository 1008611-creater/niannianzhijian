const assert = require('assert/strict');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const {createCanvasAssetService} = require('./bridge/niannian_canvas_assets');

const root = __dirname;
const appPort = 21900 + Math.floor(Math.random() * 300);
const editorPort = 22300 + Math.floor(Math.random() * 300);
const appUrl = `http://127.0.0.1:${appPort}`;
const editorUrl = `http://127.0.0.1:${editorPort}`;
const bridgeSecret = 'test-smart-cut-bridge-secret';
const dataRoot = path.join(os.tmpdir(), `niannian-smart-cut-http-${process.pid}-${Date.now()}`);
const mp4 = Buffer.alloc(128);
mp4.writeUInt32BE(32, 0);
mp4.write('ftyp', 4, 'ascii');
mp4.write('isom', 8, 'ascii');
let app;
let editor;
let output = '';
let imported = null;

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function signature(value) { return crypto.createHmac('sha256', bridgeSecret).update(value).digest('hex'); }
function headers(token, extra = {}) { return {cookie:`niannian_session=${token}`,accept:'application/json',...extra}; }

async function seed() {
  await fsp.mkdir(dataRoot, {recursive:true});
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const userA = {id:'USR-SMART-CUT-A',email:'smart-cut-a@example.test',status:'active'};
  const userB = {id:'USR-SMART-CUT-B',email:'smart-cut-b@example.test',status:'active'};
  const assetService = createCanvasAssetService({
    indexPath:path.join(dataRoot, 'canvas-assets.json'),
    storageRoot:path.join(dataRoot, 'canvas-assets')
  });
  const source = await assetService.registerBuffer({
    ownerId:userA.id, projectId:'NN-SMART-CUT-A', projectKind:'redraw', kind:'reference_video',
    format:'mp4', originalName:'source.mp4', bytes:mp4
  });
  await Promise.all([
    fsp.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([userA,userB])),
    fsp.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{tokenHash:hash('smart-cut-token-a'),userId:userA.id,expiresAt},{tokenHash:hash('smart-cut-token-b'),userId:userB.id,expiresAt}])),
    fsp.writeFile(path.join(dataRoot, 'projects.json'), JSON.stringify([{id:'NN-SMART-CUT-A',ownerId:userA.id,name:'智能剪辑项目',status:'draft'}])),
    fsp.writeFile(path.join(dataRoot, 'script-projects.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'workspace-bindings.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'website-idempotency.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'canvas-generation-jobs.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'canvas-documents.json'), JSON.stringify({
      'nomi:redraw:NN-SMART-CUT-A': {
        schemaVersion:'niannian.nomi-project-document.v1', ownerId:userA.id, projectId:'NN-SMART-CUT-A', projectKind:'redraw', revision:1, updatedAt:new Date().toISOString(),
        document:{generationCanvas:{nodes:[{id:'smart-cut-node',kind:'smart_cut',title:'智能剪辑',position:{x:0,y:0},meta:{smartCut:{sourceVideoAssetId:source.asset.id,preset:'talking_head',aspectRatio:'9:16',captionStyle:'bold-outline'}}}],edges:[]}}
      }
    }))
  ]);
  return source.asset;
}

async function listen(server, port) { await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve)); }
async function waitForApp() {
  for (let retry = 0; retry < 100; retry += 1) {
    try { if ((await fetch(`${appUrl}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start: ${output.slice(-1200)}`);
}

async function run() {
  const source = await seed();
  editor = http.createServer(async (request, response) => {
    if (request.url === '/api/niannian-smart-cut/import' && request.method === 'POST') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const raw = Buffer.concat(chunks);
      assert.equal(request.headers['x-niannian-smart-cut-signature'], signature(raw));
      imported = JSON.parse(raw.toString('utf8'));
      const sourceResponse = await fetch(imported.source.url);
      assert.equal(sourceResponse.status, 200);
      assert.deepEqual(Buffer.from(await sourceResponse.arrayBuffer()), mp4);
      response.writeHead(201, {'content-type':'application/json'});
      return response.end(JSON.stringify({ok:true,editorProjectId:'editor-project-smart-cut',roughCutDurationSeconds:3.2}));
    }
    if (request.url === '/media/uploads/smart-cut-final.mp4' && request.method === 'GET') {
      response.writeHead(200, {'content-type':'video/mp4','content-length':String(mp4.length)});
      return response.end(mp4);
    }
    response.writeHead(404); response.end();
  });
  await listen(editor, editorPort);
  app = spawn(process.execPath, ['server.js'], {
    cwd:root,
    env:{...process.env,PORT:String(appPort),DATA_DIR:dataRoot,NODE_ENV:'test',NIANNIAN_LOCAL_PREVIEW_INSECURE_SESSION:'on',NIANNIAN_SMART_CUT_BRIDGE_SECRET:bridgeSecret,NIANNIAN_SMART_CUT_EDITOR_URL:editorUrl,NIANNIAN_PUBLIC_BASE_URL:appUrl},
    stdio:['ignore','pipe','pipe']
  });
  app.stdout.on('data', (chunk) => { output += chunk.toString('utf8'); });
  app.stderr.on('data', (chunk) => { output += chunk.toString('utf8'); });
  await waitForApp();

  const endpoint = `${appUrl}/api/projects/NN-SMART-CUT-A/smart-cut/jobs`;
  const preparedResponse = await fetch(endpoint, {method:'POST',headers:headers('smart-cut-token-a',{'content-type':'application/json','x-niannian-project-kind':'redraw','idempotency-key':'smart-cut-http-0001'}),body:JSON.stringify({nodeId:'smart-cut-node',execute:true})});
  const prepared = await preparedResponse.json();
  assert.equal(preparedResponse.status, 201, JSON.stringify(prepared));
  assert.equal(prepared.job.status, 'ready_for_review');
  assert.equal(prepared.job.editorProjectId, 'editor-project-smart-cut');
  assert.equal(prepared.dryRun.pipeline.asr, 'mimo-asr');
  assert.equal(prepared.dryRun.pipeline.alignment, 'Qwen3-ForcedAligner-0.6B');
  assert.equal(imported.source.assetId, source.id);

  const jobId = prepared.job.id;
  const sessionResponse = await fetch(`${appUrl}/api/projects/NN-SMART-CUT-A/smart-cut/sessions`, {method:'POST',headers:headers('smart-cut-token-a',{'content-type':'application/json','x-niannian-project-kind':'redraw'}),body:JSON.stringify({jobId})});
  const session = await sessionResponse.json();
  assert.equal(sessionResponse.status, 200, JSON.stringify(session));
  assert.match(session.editorUrl, new RegExp(`^${editorUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/#/editor/editor-project-smart-cut\\?niannianSmartCutSession=`));

  const callbackBody = JSON.stringify({output:{url:`${editorUrl}/media/uploads/smart-cut-final.mp4`,originalName:'smart-cut-final.mp4',durationSeconds:3.2}});
  const rejected = await fetch(`${appUrl}/api/internal/smart-cut/jobs/${jobId}/complete`, {method:'POST',headers:{'content-type':'application/json','x-niannian-smart-cut-signature':'0'.repeat(64)},body:callbackBody});
  assert.equal(rejected.status, 401);
  const completedResponse = await fetch(`${appUrl}/api/internal/smart-cut/jobs/${jobId}/complete`, {method:'POST',headers:{'content-type':'application/json','x-niannian-smart-cut-signature':signature(callbackBody)},body:callbackBody});
  const completed = await completedResponse.json();
  assert.equal(completedResponse.status, 201, JSON.stringify(completed));
  assert.equal(completed.job.status, 'succeeded');
  assert.match(completed.asset.id, /^CAS-[a-f0-9]{24}$/);
  const download = await fetch(`${appUrl}${completed.asset.downloadUrl}`, {headers:headers('smart-cut-token-a')});
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), mp4);

  const docs = JSON.parse(await fsp.readFile(path.join(dataRoot, 'canvas-documents.json'), 'utf8'));
  const node = docs['nomi:redraw:NN-SMART-CUT-A'].document.generationCanvas.nodes[0];
  assert.equal(node.meta.smartCut.smartCutJobId, jobId);
  assert.equal(node.meta.smartCut.finalVideoAssetId, completed.asset.id);
  assert.equal(node.status, 'success');
  assert.equal(node.result.assetId, completed.asset.id);

  const foreign = await fetch(`${endpoint}/${jobId}`, {headers:headers('smart-cut-token-b',{'x-niannian-project-kind':'redraw'})});
  assert.equal(foreign.status, 404);
  console.log('SMART_CUT_HTTP_CONTRACT_OK');
}

run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (app && !app.killed) app.kill();
  if (editor) await new Promise((resolve) => editor.close(resolve));
  await fsp.rm(dataRoot, {recursive:true,force:true});
});
