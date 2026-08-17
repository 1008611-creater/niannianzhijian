const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const net = require('net');
const {spawn} = require('child_process');
const sharp = require('sharp');

const root = __dirname;
let port;
let baseUrl;
const dataRoot = path.join(os.tmpdir(), `niannian-canvas-assets-${process.pid}-${Date.now()}`);
let child;
let childOutput = '';
let childExit = null;

function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function headers(token, extra = {}) { return {cookie:`niannian_session=${token}`, ...extra}; }

async function allocateTestPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

async function seed() {
  await fsp.mkdir(dataRoot, {recursive:true});
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const userA = {id:'USR-ASSET-A',email:'asset-a@example.test',status:'active'};
  const userB = {id:'USR-ASSET-B',email:'asset-b@example.test',status:'active'};
  await Promise.all([
    fsp.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([userA, userB])),
    fsp.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{tokenHash:tokenHash('asset-token-a'),userId:userA.id,expiresAt:future},{tokenHash:tokenHash('asset-token-b'),userId:userB.id,expiresAt:future}])),
    fsp.writeFile(path.join(dataRoot, 'projects.json'), JSON.stringify([{id:'NN-ASSET-A',ownerId:userA.id,name:'素材项目 A',status:'draft'},{id:'NN-ASSET-B',ownerId:userA.id,name:'素材项目 B',status:'draft'}])),
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

async function run() {
  port = await allocateTestPort();
  baseUrl = `http://127.0.0.1:${port}`;
  await seed();
  const image = await sharp({create:{width:12,height:8,channels:4,background:{r:20,g:30,b:40,alpha:1}}}).png().toBuffer();
  child = spawn(process.execPath, ['server.js'], {cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_LOCAL_PREVIEW_INSECURE_SESSION:'on'},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data', chunk => { childOutput += chunk.toString('utf8'); });
  child.stderr.on('data', chunk => { childOutput += chunk.toString('utf8'); });
  child.once('exit', (code, signal) => { childExit = {code, signal}; });
  await waitForServer();
  const form = new FormData();
  form.append('referenceImage', new Blob([image], {type:'image/png'}), 'reference.png');
  const firstResponse = await fetch(`${baseUrl}/api/projects/NN-ASSET-A/assets`, {method:'POST',headers:headers('asset-token-a',{'x-niannian-project-kind':'redraw'}),body:form});
  const first = await firstResponse.json();
  assert.equal(firstResponse.status, 201);
  assert.match(first.asset.id, /^CAS-[a-f0-9]{24}$/);
  assert.equal(first.asset.projectId, 'NN-ASSET-A');
  assert.equal(first.asset.mimeType, 'image/png');
  assert.equal(first.asset.downloadUrl, `/api/projects/NN-ASSET-A/assets/${first.asset.id}/download`);
  assert.equal(first.asset.thumbnailUrl, `/api/projects/NN-ASSET-A/assets/${first.asset.id}/thumbnail`);

  const repeatForm = new FormData();
  repeatForm.append('referenceImage', new Blob([image], {type:'image/png'}), 'same.png');
  const repeatResponse = await fetch(`${baseUrl}/api/projects/NN-ASSET-A/assets`, {method:'POST',headers:headers('asset-token-a',{'x-niannian-project-kind':'redraw'}),body:repeatForm});
  const repeat = await repeatResponse.json();
  assert.equal(repeatResponse.status, 200);
  assert.equal(repeat.idempotent, true);
  assert.equal(repeat.asset.id, first.asset.id);

  const audio = Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00niannian-audio-reference');
  const audioForm = new FormData();
  audioForm.append('kind', 'reference_audio');
  audioForm.append('asset', new Blob([audio], {type:'audio/mpeg'}), 'voice.mp3');
  const audioResponse = await fetch(`${baseUrl}/api/projects/NN-ASSET-A/assets`, {method:'POST',headers:headers('asset-token-a',{'x-niannian-project-kind':'redraw'}),body:audioForm});
  const audioAsset = await audioResponse.json();
  assert.equal(audioResponse.status, 201);
  assert.equal(audioAsset.asset.kind, 'reference_audio');
  assert.equal(audioAsset.asset.mimeType, 'audio/mpeg');

  const video = Buffer.alloc(32);
  video.writeUInt32BE(32, 0);
  video.write('ftyp', 4, 'ascii');
  video.write('isom', 8, 'ascii');
  const videoForm = new FormData();
  videoForm.append('kind', 'reference_video');
  videoForm.append('asset', new Blob([video], {type:'video/mp4'}), 'reference.mp4');
  const videoResponse = await fetch(`${baseUrl}/api/projects/NN-ASSET-A/assets`, {method:'POST',headers:headers('asset-token-a',{'x-niannian-project-kind':'redraw'}),body:videoForm});
  const videoAsset = await videoResponse.json();
  assert.equal(videoResponse.status, 201);
  assert.equal(videoAsset.asset.kind, 'reference_video');
  assert.equal(videoAsset.asset.mimeType, 'video/mp4');

  const mismatchForm = new FormData();
  mismatchForm.append('kind', 'reference_audio');
  mismatchForm.append('asset', new Blob([video], {type:'audio/mpeg'}), 'not-audio.mp3');
  const mismatchResponse = await fetch(`${baseUrl}/api/projects/NN-ASSET-A/assets`, {method:'POST',headers:headers('asset-token-a',{'x-niannian-project-kind':'redraw'}),body:mismatchForm});
  const mismatch = await mismatchResponse.json();
  assert.equal(mismatchResponse.status, 415);
  assert.equal(mismatch.code, 'CANVAS_ASSET_CONTENT_INVALID');

  const listResponse = await fetch(`${baseUrl}/api/projects/NN-ASSET-A/assets`, {headers:headers('asset-token-a',{'x-niannian-project-kind':'redraw'})});
  const list = await listResponse.json();
  assert.equal(listResponse.status, 200);
  assert.equal(list.assets.length, 3);

  const localDocumentResponse = await fetch(`${baseUrl}/api/studio/projects/NN-ASSET-A`, {
    method:'PUT',
    headers:headers('asset-token-a', {'content-type':'application/json','x-niannian-project-kind':'redraw'}),
    body:JSON.stringify({document:{generationCanvas:{nodes:[{id:'local-node',kind:'asset',result:{type:'image',url:'data:image/png;base64,AAAA'}}],edges:[]}}})
  });
  const localDocument = await localDocumentResponse.json();
  assert.equal(localDocumentResponse.status, 422);
  assert.equal(localDocument.code, 'NOMI_LOCAL_MEDIA_NOT_PERSISTABLE');

  const downloadResponse = await fetch(baseUrl + first.asset.downloadUrl, {headers:headers('asset-token-a')});
  const download = Buffer.from(await downloadResponse.arrayBuffer());
  assert.equal(downloadResponse.status, 200);
  assert.equal(downloadResponse.headers.get('content-type'), 'image/png');
  assert.deepEqual(download, image);

  const thumbnailResponse = await fetch(baseUrl + first.asset.thumbnailUrl, {headers:headers('asset-token-a')});
  const thumbnail = Buffer.from(await thumbnailResponse.arrayBuffer());
  assert.equal(thumbnailResponse.status, 200);
  assert.equal(thumbnailResponse.headers.get('content-type'), 'image/webp');
  assert.match(thumbnailResponse.headers.get('cache-control'), /private, max-age=604800/);
  const thumbnailMetadata = await sharp(thumbnail).metadata();
  assert.equal(thumbnailMetadata.format, 'webp');
  assert.ok(thumbnailMetadata.width <= 320 && thumbnailMetadata.height <= 180);

  const videoThumbnailResponse = await fetch(baseUrl + videoAsset.asset.thumbnailUrl, {headers:headers('asset-token-a')});
  const videoThumbnail = await videoThumbnailResponse.text();
  assert.equal(videoThumbnailResponse.status, 200);
  assert.match(videoThumbnailResponse.headers.get('content-type'), /^image\/svg\+xml/);
  assert.match(videoThumbnail, /视频素材/);

  const foreignResponse = await fetch(baseUrl + first.asset.downloadUrl, {headers:headers('asset-token-b')});
  assert.equal(foreignResponse.status, 404);
  const crossProjectResponse = await fetch(`${baseUrl}/api/projects/NN-ASSET-B/assets/${first.asset.id}/download`, {headers:headers('asset-token-a')});
  assert.equal(crossProjectResponse.status, 404);
  const foreignThumbnailResponse = await fetch(baseUrl + first.asset.thumbnailUrl, {headers:headers('asset-token-b')});
  assert.equal(foreignThumbnailResponse.status, 404);
  const crossProjectThumbnailResponse = await fetch(`${baseUrl}/api/projects/NN-ASSET-B/assets/${first.asset.id}/thumbnail`, {headers:headers('asset-token-a')});
  assert.equal(crossProjectThumbnailResponse.status, 404);
  console.log('CANVAS_ASSETS_HTTP_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child && !child.killed) child.kill();
  await fsp.rm(dataRoot, {recursive:true,force:true});
});
