const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const sharp = require('sharp');

const root = __dirname;
const port = 20700 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
const dataRoot = path.join(os.tmpdir(), `niannian-canvas-internal-import-${process.pid}-${Date.now()}`);
let child;
let childOutput = '';
let childExit = null;

function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function headers(token, extra = {}) { return {cookie:`niannian_session=${token}`, ...extra}; }

async function seed() {
  await fsp.mkdir(dataRoot, {recursive:true});
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const user = {id:'USR-INTERNAL-ASSET',email:'internal-asset@example.test',status:'active'};
  await Promise.all([
    fsp.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([user])),
    fsp.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{tokenHash:tokenHash('internal-asset-token'),userId:user.id,expiresAt:future}])),
    fsp.writeFile(path.join(dataRoot, 'projects.json'), JSON.stringify([{id:'NN-INTERNAL-ASSET',ownerId:user.id,name:'服务端导入项目',status:'draft'}])),
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

async function importAsset(image, role = 'character', title = '苏晚棠') {
  const form = new FormData();
  form.append('projectId', 'NN-INTERNAL-ASSET');
  form.append('projectKind', 'redraw');
  form.append('kind', 'reference_image');
  form.append('role', role);
  form.append('titleB64', Buffer.from(title, 'utf8').toString('base64url'));
  form.append('asset', new Blob([image], {type:'image/png'}), 'su-wantang.png');
  const response = await fetch(`${baseUrl}/api/internal/canvas-assets/import`, {method:'POST',body:form});
  return {response,body:await response.json()};
}

async function run() {
  await seed();
  const image = await sharp({create:{width:18,height:10,channels:4,background:{r:20,g:30,b:40,alpha:1}}}).png().toBuffer();
  child = spawn(process.execPath, ['server.js'], {cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_LOCAL_PREVIEW_INSECURE_SESSION:'on'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data', chunk => { childOutput += chunk.toString('utf8'); });
  child.stderr.on('data', chunk => { childOutput += chunk.toString('utf8'); });
  child.once('exit', (code, signal) => { childExit = {code, signal}; });
  await waitForServer();

  const first = await importAsset(image);
  assert.equal(first.response.status, 201);
  assert.equal(first.body.code, 'INTERNAL_CANVAS_ASSET_IMPORTED');
  assert.match(first.body.asset.id, /^CAS-[a-f0-9]{24}$/);
  assert.equal(first.body.node.id, `asset-${first.body.asset.id}`);
  assert.equal(first.body.node.categoryId, 'characters');
  assert.equal(first.body.node.result.assetId, first.body.asset.id);
  assert.equal(first.body.node.result.url, first.body.asset.downloadUrl);

  const replay = await importAsset(image);
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.idempotent, true);
  assert.equal(replay.body.asset.id, first.body.asset.id);
  assert.equal(replay.body.node.id, first.body.node.id);

  const renamed = await importAsset(image, 'character', '苏晚棠-正式资产');
  assert.equal(renamed.response.status, 200);
  assert.equal(renamed.body.asset.id, first.body.asset.id);
  assert.equal(renamed.body.node.title, '苏晚棠-正式资产');

  const recategorized = await importAsset(image, 'scene', '顾家餐厅到玄关连续空间');
  assert.equal(recategorized.response.status, 200);
  assert.equal(recategorized.body.asset.id, first.body.asset.id);
  assert.equal(recategorized.body.node.id, first.body.node.id);
  assert.equal(recategorized.body.node.title, '顾家餐厅到玄关连续空间');
  assert.equal(recategorized.body.node.categoryId, 'scenes');
  assert.equal(recategorized.body.node.meta.assetRole, 'scene');

  const studio = await fetch(`${baseUrl}/api/studio/projects/NN-INTERNAL-ASSET`, {headers:headers('internal-asset-token',{'x-niannian-project-kind':'redraw'})});
  const studioBody = await studio.json();
  assert.equal(studio.status, 200);
  const failedLocalNode = {
    id:'failed-local-drop-001',
    kind:'asset',
    title:'过期的本地素材占位',
    status:'error',
    meta:{source:'local-drop',fileName:'su-wantang.png',uploadStatus:'failed',localOnly:true,persistable:false,retryableImport:true}
  };
  const staleDocument = structuredClone(studioBody.document);
  staleDocument.generationCanvas.nodes.push(failedLocalNode);
  staleDocument.generationCanvas.edges.push({id:'edge-from-failed-local',source:failedLocalNode.id,target:first.body.node.id});
  const staleSave = await fetch(`${baseUrl}/api/studio/projects/NN-INTERNAL-ASSET`, {
    method:'PUT',
    headers:headers('internal-asset-token',{'x-niannian-project-kind':'redraw','content-type':'application/json','if-match':studio.headers.get('etag')}),
    body:JSON.stringify({document:staleDocument})
  });
  const staleSaved = await staleSave.json();
  assert.equal(staleSave.status, 200);
  assert.equal(staleSaved.document.generationCanvas.nodes.some(item => item.id === failedLocalNode.id), true);

  const recoveredStudio = await fetch(`${baseUrl}/api/studio/projects/NN-INTERNAL-ASSET`, {headers:headers('internal-asset-token',{'x-niannian-project-kind':'redraw'})});
  const recoveredBody = await recoveredStudio.json();
  assert.equal(recoveredStudio.status, 200);
  assert.equal(recoveredBody.revision, staleSaved.revision + 1);
  assert.equal(recoveredBody.document.generationCanvas.nodes.some(item => item.id === failedLocalNode.id), false);
  assert.equal(recoveredBody.document.generationCanvas.edges.some(item => item.id === 'edge-from-failed-local'), false);
  const node = recoveredBody.document.generationCanvas.nodes.find(item => item.id === first.body.node.id);
  assert.ok(node);
  assert.equal(node.result.assetId, first.body.asset.id);
  assert.equal(node.title, '顾家餐厅到玄关连续空间');
  assert.equal(node.categoryId, 'scenes');
  assert.equal(node.meta.assetRole, 'scene');

  const assetList = await fetch(`${baseUrl}/api/projects/NN-INTERNAL-ASSET/assets`, {headers:headers('internal-asset-token',{'x-niannian-project-kind':'redraw'})});
  const listed = await assetList.json();
  assert.equal(assetList.status, 200);
  assert.equal(listed.assets.length, 1);

  const invalidImage = await sharp({create:{width:19,height:10,channels:4,background:{r:50,g:60,b:70,alpha:1}}}).png().toBuffer();
  const invalidRole = await importAsset(invalidImage, 'invalid');
  assert.equal(invalidRole.response.status, 422);
  assert.equal(invalidRole.body.code, 'INTERNAL_CANVAS_ASSET_ROLE_INVALID');
  const afterInvalidList = await fetch(`${baseUrl}/api/projects/NN-INTERNAL-ASSET/assets`, {headers:headers('internal-asset-token',{'x-niannian-project-kind':'redraw'})});
  const afterInvalid = await afterInvalidList.json();
  assert.equal(afterInvalid.assets.length, 1);
  console.log('CANVAS_INTERNAL_ASSET_IMPORT_HTTP_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child && !child.killed) child.kill();
  await fsp.rm(dataRoot, {recursive:true,force:true});
});
