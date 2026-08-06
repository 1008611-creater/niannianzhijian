const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn} = require('child_process');

const root = __dirname;
let port;
let baseUrl;
const dataRoot = path.join(os.tmpdir(), `niannian-nomi-boundary-${process.pid}-${Date.now()}`);
let child;
let output = '';

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function headers(token) { return {cookie:`niannian_session=${token}`,'content-type':'application/json'}; }
function h3Node(id, modelKey = 'niannian/minimax-h3') {
  return {id,kind:'video',title:'H3 视频',position:{x:0,y:0},prompt:'雨夜城市街头',meta:{modelKey,archetype:{id:'minimax-h3',modeId:'t2v'}}};
}

async function seed() {
  await fsp.mkdir(dataRoot, {recursive:true});
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const userA = {id:'USR-NOMI-A',email:'nomi-a@example.test',status:'active'};
  const userB = {id:'USR-NOMI-B',email:'nomi-b@example.test',status:'active'};
  const project = {id:'NN-NOMI-A',ownerId:userA.id,name:'Nomi 项目',status:'draft'};
  const documents = {
    // 历史自建画布数据即使长得像 H3 节点，也绝不能被网页 H3 路径读取。
    'redraw:NN-NOMI-A':{ownerId:userA.id,projectId:project.id,projectKind:'redraw',document:{nodes:[{id:'old-node',type:'video',data:{modelKey:'h3'}}]}},
    'nomi:redraw:NN-NOMI-A':{ownerId:userA.id,projectId:project.id,projectKind:'redraw',revision:1,document:{generationCanvas:{nodes:[h3Node('h3-node'),{...h3Node('not-h3','other/video'),meta:{modelKey:'other/video',archetype:{id:'other-video',modeId:'t2v'}}}]}}}
  };
  await Promise.all([
    fsp.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([userA,userB])),
    fsp.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([
      {tokenHash:hash('nomi-token-a'),userId:userA.id,expiresAt},
      {tokenHash:hash('nomi-token-b'),userId:userB.id,expiresAt}
    ])),
    fsp.writeFile(path.join(dataRoot, 'projects.json'), JSON.stringify([project])),
    fsp.writeFile(path.join(dataRoot, 'script-projects.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'canvas-documents.json'), JSON.stringify(documents)),
    fsp.writeFile(path.join(dataRoot, 'workspace-bindings.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'website-idempotency.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'canvas-generation-jobs.json'), '[]')
  ]);
}

async function reservePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  port = typeof address === 'object' && address ? address.port : 0;
  await new Promise(resolve => probe.close(resolve));
  if (!port) throw new Error('unable to allocate a local test port');
  baseUrl = `http://127.0.0.1:${port}`;
}

async function waitForServer() {
  for (let retry = 0; retry < 100; retry += 1) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start: ${output.slice(-1000)}`);
}

async function grant(token, nodeId) {
  const response = await fetch(`${baseUrl}/api/studio/spend-grants`, {
    method:'POST',headers:headers(token),body:JSON.stringify({projectId:'NN-NOMI-A',projectKind:'redraw',nodeIds:[nodeId]})
  });
  assert.equal(response.status, 201);
  return (await response.json()).grantId;
}

async function submit(token, grantId, nodeId, input = {}) {
  const response = await fetch(`${baseUrl}/api/studio/tasks`, {
    method:'POST',headers:headers(token),body:JSON.stringify({
      projectId:'NN-NOMI-A',projectKind:'redraw',vendor:'runninghub',request:{
        kind:'text_to_video',prompt:'雨夜城市街头，人物缓慢回头',extras:{grantId,nodeId,idempotencyKey:`idem-${nodeId}-${crypto.randomBytes(4).toString('hex')}`,modelKey:'niannian/minimax-h3',archetypeInput:input}
      }
    })
  });
  return {response,body:await response.json()};
}

async function run() {
  await seed();
  await reservePort();
  child = spawn(process.execPath, ['server.js'], {cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_LOCAL_PREVIEW_INSECURE_SESSION:'on'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data', chunk => { output += chunk.toString('utf8'); });
  child.stderr.on('data', chunk => { output += chunk.toString('utf8'); });
  await waitForServer();

  const oldGrant = await grant('nomi-token-a','old-node');
  const old = await submit('nomi-token-a',oldGrant,'old-node');
  assert.equal(old.response.status, 404);
  assert.equal(old.body.code, 'NOMI_GENERATION_NODE_NOT_FOUND');

  const wrongModelGrant = await grant('nomi-token-a','not-h3');
  const wrongModel = await submit('nomi-token-a',wrongModelGrant,'not-h3');
  assert.equal(wrongModel.response.status, 422);
  assert.equal(wrongModel.body.code, 'NOMI_H3_NODE_REQUIRED');

  const invalidAssetGrant = await grant('nomi-token-a','h3-node');
  const invalidAsset = await submit('nomi-token-a',invalidAssetGrant,'h3-node',{reference_image_urls:['https://provider.invalid/not-a-project-asset.png']});
  assert.equal(invalidAsset.response.status, 422);
  assert.equal(invalidAsset.body.code, 'STUDIO_ASSET_REFERENCE_INVALID');

  const foreignGrant = await fetch(`${baseUrl}/api/studio/spend-grants`, {method:'POST',headers:headers('nomi-token-b'),body:JSON.stringify({projectId:'NN-NOMI-A',projectKind:'redraw',nodeIds:['h3-node']})});
  assert.equal(foreignGrant.status, 404);
  console.log('NOMI_H3_DOCUMENT_BOUNDARY_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child && !child.killed) child.kill();
  await fsp.rm(dataRoot, {recursive:true,force:true});
});
