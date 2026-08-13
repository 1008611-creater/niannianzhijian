'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fsp = require('node:fs').promises;
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

const root = __dirname;
const port = 20500 + Math.floor(Math.random() * 400);
const dataRoot = path.join(os.tmpdir(), `niannian-canvas-s1-${process.pid}-${Date.now()}`);
const token = 'canvas-s1-token';
const user = {id:'USR-CANVAS-S1',email:'canvas-s1@example.test',status:'active'};
const project = {id:'NN-S1-CANVAS-01',ownerId:user.id,name:'S1 chain test',projectKind:'redraw',canvasOnly:true,status:'ready',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),runtime:{},source:{originalName:'source.mp4',mimeType:'video/mp4',bytes:123,sha256:'source-sha'}};
let child;
let output = '';

function tokenHash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function headers(extra = {}) { return {cookie:`niannian_session=${token}`,...extra}; }
async function request(pathname, options = {}) { const response = await fetch(`http://127.0.0.1:${port}${pathname}`, options); return {response,body:await response.json()}; }

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('test_server_not_ready:' + output.slice(-500));
}

async function run() {
  await fsp.mkdir(dataRoot, {recursive:true});
  await Promise.all([
    fsp.writeFile(path.join(dataRoot,'users.json'), JSON.stringify([user])),
    fsp.writeFile(path.join(dataRoot,'sessions.json'), JSON.stringify([{tokenHash:tokenHash(token),userId:user.id,expiresAt:new Date(Date.now()+3600000).toISOString()}])),
    fsp.writeFile(path.join(dataRoot,'projects.json'), '[]'),
    fsp.writeFile(path.join(dataRoot,'canvas-projects.json'), JSON.stringify([project])),
    fsp.writeFile(path.join(dataRoot,'canvas-documents.json'), '{}'),
    fsp.writeFile(path.join(dataRoot,'canvas-assets.json'), '[]'),
    fsp.writeFile(path.join(dataRoot,'canvas-generation-jobs.json'), '[]'),
    fsp.writeFile(path.join(dataRoot,'workspace-bindings.json'), '[]'),
    fsp.writeFile(path.join(dataRoot,'script-projects.json'), '[]')
  ]);
  child = spawn(process.execPath, ['server.js'], {cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_TEXT_API_KEY:'',NIANNIAN_TEXT_MODEL:'',NIANNIAN_TEXT_PROVIDER_SUBMIT:'off'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  await waitForServer();
  const initial = await request('/api/canvas/documents/redraw/' + project.id, {headers:headers()});
  assert.equal(initial.response.status, 200);
  const assets = await request('/api/projects/' + project.id + '/assets', {headers:headers({'x-niannian-project-kind':'redraw'})});
  assert.equal(assets.response.status, 200);
  assert.equal(assets.body.assets[0].id, 'legacy-source:' + project.id);
  const built = await request('/api/canvas/documents/redraw/' + project.id + '/s1-chain', {method:'POST',headers:headers({'content-type':'application/json','if-match':initial.response.headers.get('etag')||'"canvas-rev-0"'}),body:JSON.stringify({sourceAssetIds:['legacy-source:' + project.id],rightsConfirmed:true,preflightStatus:'passed'})});
  assert.equal(built.response.status, 201, JSON.stringify(built.body));
  assert.deepEqual(built.body.chain.nodeIds, ['s1-source-input','s1-step01-analysis','s1-step02-timeline']);
  assert.equal(built.body.chain.sourceReady, true);
  assert.equal(built.body.document.nodes.length, 3);
  assert.deepEqual(built.body.document.edges.map(item => [item.source,item.target]), [['s1-source-input','s1-step01-analysis'],['s1-step01-analysis','s1-step02-timeline']]);
  const step01 = built.body.document.nodes.find(item => item.id === 's1-step01-analysis');
  assert.equal(step01.status, 'blocked');
  assert.equal(step01.data.status, 'blocked');
  assert.equal(step01.data.parameters.blocker, 'STEP01_FULL_SOURCE_AUTHORITY_PENDING');
  const reloaded = await request('/api/canvas/documents/redraw/' + project.id, {headers:headers()});
  assert.equal(reloaded.body.document.nodes.find(item => item.id === 's1-step02-timeline').status, 'blocked');
  const stale = await request('/api/canvas/documents/redraw/' + project.id + '/s1-chain', {method:'POST',headers:headers({'content-type':'application/json','if-match':'"canvas-rev-0"'}),body:'{}'});
  assert.equal(stale.response.status, 412);
  console.log(JSON.stringify({ok:true,verified:['legacy project source is exposed as a read-only canvas asset','S1 source/Step01/Step02 chain accepts the source','explicit Step01 authority block','revision conflict protection','no provider submission']}));
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (child && !child.killed) child.kill(); await fsp.rm(dataRoot,{recursive:true,force:true}); });
