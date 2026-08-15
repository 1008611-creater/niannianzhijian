'use strict';

const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const sharp = require('sharp');

const root = __dirname;
const port = 20400 + Math.floor(Math.random() * 400);
const baseUrl = `http://127.0.0.1:${port}`;
const dataRoot = path.join(os.tmpdir(), `niannian-project-metadata-${process.pid}-${Date.now()}`);
let child;
let childOutput = '';

function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function auth(token, extra = {}) { return {cookie:`niannian_session=${token}`,...extra}; }

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`测试服务未启动: ${childOutput.slice(-1600)}`);
}

async function seed() {
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await fsp.mkdir(dataRoot, {recursive:true});
  await Promise.all([
    fsp.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([{id:'USR-META-A',email:'meta-a@example.test',status:'active'},{id:'USR-META-B',email:'meta-b@example.test',status:'active'}])),
    fsp.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{tokenHash:tokenHash('meta-token-a'),userId:'USR-META-A',expiresAt:future},{tokenHash:tokenHash('meta-token-b'),userId:'USR-META-B',expiresAt:future}])),
    fsp.writeFile(path.join(dataRoot, 'projects.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'script-projects.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'canvas-projects.json'), JSON.stringify([
      {id:'NN-web-meta-a',ownerId:'USR-META-A',canvasOnly:true,name:'未命名项目',projectKind:'redraw',status:'ready',createdAt:now,updatedAt:now},
      {id:'NN-web-meta-b',ownerId:'USR-META-A',canvasOnly:true,name:'另一个项目',projectKind:'redraw',status:'ready',createdAt:now,updatedAt:now}
    ])),
    fsp.writeFile(path.join(dataRoot, 'canvas-documents.json'), '{}'),
    fsp.writeFile(path.join(dataRoot, 'canvas-assets.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'canvas-generation-jobs.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'workspace-bindings.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'website-idempotency.json'), '[]')
  ]);
}

async function run() {
  await seed();
  child = spawn(process.execPath, ['server.js'], {cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_LOCAL_PREVIEW_INSECURE_SESSION:'on'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data', chunk => { childOutput += chunk.toString('utf8'); });
  child.stderr.on('data', chunk => { childOutput += chunk.toString('utf8'); });
  await waitForServer();

  const renamedResponse = await fetch(`${baseUrl}/api/studio/projects/NN-web-meta-a`, {method:'PATCH',headers:auth('meta-token-a',{'content-type':'application/json'}),body:JSON.stringify({name:'雨夜重逢',coverMode:'auto'})});
  const renamed = await renamedResponse.json();
  assert.equal(renamedResponse.status, 200);
  assert.equal(renamed.project.name, '雨夜重逢');
  assert.equal(renamed.project.cover.mode, 'auto');

  const image = await sharp({create:{width:24,height:14,channels:4,background:{r:41,g:52,b:62,alpha:1}}}).png().toBuffer();
  const form = new FormData();
  form.append('referenceImage', new Blob([image], {type:'image/png'}), 'cover.png');
  const uploadResponse = await fetch(`${baseUrl}/api/projects/NN-web-meta-a/assets`, {method:'POST',headers:auth('meta-token-a',{'x-niannian-project-kind':'redraw'}),body:form});
  const uploaded = await uploadResponse.json();
  assert.equal(uploadResponse.status, 201);

  const coverResponse = await fetch(`${baseUrl}/api/studio/projects/NN-web-meta-a`, {method:'PATCH',headers:auth('meta-token-a',{'content-type':'application/json'}),body:JSON.stringify({coverMode:'custom',coverAssetId:uploaded.asset.id})});
  const covered = await coverResponse.json();
  assert.equal(coverResponse.status, 200);
  assert.equal(covered.project.cover.assetId, uploaded.asset.id);
  assert.equal(covered.project.cover.imageUrl, uploaded.asset.downloadUrl);

  const readResponse = await fetch(`${baseUrl}/api/studio/projects/NN-web-meta-a`, {headers:auth('meta-token-a')});
  const read = await readResponse.json();
  assert.equal(readResponse.status, 200);
  assert.equal(read.project.name, '雨夜重逢');
  assert.equal(read.project.cover.assetId, uploaded.asset.id);

  const crossProjectResponse = await fetch(`${baseUrl}/api/studio/projects/NN-web-meta-b`, {method:'PATCH',headers:auth('meta-token-a',{'content-type':'application/json'}),body:JSON.stringify({coverMode:'custom',coverAssetId:uploaded.asset.id})});
  const crossProject = await crossProjectResponse.json();
  assert.equal(crossProjectResponse.status, 422);
  assert.equal(crossProject.code, 'STUDIO_PROJECT_COVER_ASSET_INVALID');

  const foreignResponse = await fetch(`${baseUrl}/api/studio/projects/NN-web-meta-a`, {method:'PATCH',headers:auth('meta-token-b',{'content-type':'application/json'}),body:JSON.stringify({name:'不应成功'})});
  assert.equal(foreignResponse.status, 404);
  console.log('STUDIO_PROJECT_METADATA_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child && !child.killed) child.kill();
  await fsp.rm(dataRoot, {recursive:true,force:true});
});
