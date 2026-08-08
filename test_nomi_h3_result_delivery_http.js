const assert = require('assert/strict');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');

const root = __dirname;
const appPort = 21100 + Math.floor(Math.random() * 300);
const providerPort = 21500 + Math.floor(Math.random() * 300);
const appUrl = `http://127.0.0.1:${appPort}`;
const providerUrl = `http://127.0.0.1:${providerPort}`;
const dataRoot = path.join(os.tmpdir(), `niannian-nomi-h3-delivery-${process.pid}-${Date.now()}`);
const mp4 = Buffer.alloc(128);
mp4.writeUInt32BE(32, 0);
mp4.write('ftyp', 4, 'ascii');
mp4.write('isom', 8, 'ascii');
let app;
let provider;
let output = '';
let runCalls = 0;
let queryCalls = 0;
let videoReads = 0;

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function headers(token, extra = {}) { return {cookie:`niannian_session=${token}`,accept:'application/json',...extra}; }
function h3Document(ownerId) {
  return {ownerId,projectId:'NN-H3-DELIVERY-A',projectKind:'redraw',revision:1,updatedAt:new Date().toISOString(),document:{
    workbenchDocument:{contentJson:{type:'doc',content:[]}},timeline:{tracks:[]},
    generationCanvas:{nodes:[{id:'h3-node',kind:'video',title:'H3 视频',position:{x:0,y:0},prompt:'雨夜城市街头',meta:{modelKey:'niannian/minimax-h3',archetype:{id:'minimax-h3',modeId:'t2v'}}}],edges:[]}
  }};
}

async function seed() {
  await fsp.mkdir(dataRoot, {recursive:true});
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const userA = {id:'USR-H3-A',email:'h3-a@example.test',status:'active'};
  const userB = {id:'USR-H3-B',email:'h3-b@example.test',status:'active'};
  await Promise.all([
    fsp.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([userA,userB])),
    fsp.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{tokenHash:hash('h3-token-a'),userId:userA.id,expiresAt},{tokenHash:hash('h3-token-b'),userId:userB.id,expiresAt}])),
    fsp.writeFile(path.join(dataRoot, 'projects.json'), JSON.stringify([{id:'NN-H3-DELIVERY-A',ownerId:userA.id,name:'H3 项目',status:'draft'}])),
    fsp.writeFile(path.join(dataRoot, 'script-projects.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'canvas-documents.json'), JSON.stringify({'nomi:redraw:NN-H3-DELIVERY-A':h3Document(userA.id)})),
    fsp.writeFile(path.join(dataRoot, 'workspace-bindings.json'), JSON.stringify([{
      id:'NN-H3-DELIVERY-A',ownerId:userA.id,name:'H3 项目',redrawProjectIds:['NN-H3-DELIVERY-A'],redrawProjectId:'NN-H3-DELIVERY-A',scriptProjectIds:[],scriptProjectId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
    }])),
    fsp.writeFile(path.join(dataRoot, 'website-idempotency.json'), '[]'),
    fsp.writeFile(path.join(dataRoot, 'canvas-generation-jobs.json'), '[]')
  ]);
}

async function listen(server, port) { await new Promise(resolve => server.listen(port, '127.0.0.1', resolve)); }
async function waitForApp() {
  for (let retry = 0; retry < 100; retry += 1) {
    try { if ((await fetch(`${appUrl}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`app did not start: ${output.slice(-1200)}`);
}

async function run() {
  await seed();
  provider = http.createServer((request, response) => {
    if (request.url === '/openapi/v2/run/workflow/2084079636237078529' && request.method === 'POST') {
      runCalls += 1;
      response.writeHead(200, {'content-type':'application/json'});
      return response.end(JSON.stringify({data:{taskId:'mock-h3-task'}}));
    }
    if (request.url === '/openapi/v2/query' && request.method === 'POST') {
      queryCalls += 1;
      response.writeHead(200, {'content-type':'application/json'});
      return response.end(JSON.stringify({data:{status:'SUCCESS',resultUrl:`${providerUrl}/result.mp4`,usage:{consumeCoins:12,consumeMoney:0}}}));
    }
    if (request.url === '/result.mp4' && request.method === 'GET') {
      videoReads += 1;
      response.writeHead(200, {'content-type':'video/mp4','content-length':mp4.length});
      return response.end(mp4);
    }
    response.writeHead(404); response.end();
  });
  await listen(provider, providerPort);
  app = spawn(process.execPath, ['server.js'], {cwd:root,env:{...process.env,PORT:String(appPort),DATA_DIR:dataRoot,NIANNIAN_LOCAL_PREVIEW_INSECURE_SESSION:'on',NODE_ENV:'test',NOMI_RUNNINGHUB_H3_BASE_URL:providerUrl,NOMI_RUNNINGHUB_H3_API_KEY:'test-only-key',RUNNINGHUB_API_KEY:'enterprise-key-must-not-be-used'},stdio:['ignore','pipe','pipe']});
  app.stdout.on('data', chunk => { output += chunk.toString('utf8'); });
  app.stderr.on('data', chunk => { output += chunk.toString('utf8'); });
  await waitForApp();

  const grantResponse = await fetch(`${appUrl}/api/studio/spend-grants`, {method:'POST',headers:headers('h3-token-a',{'content-type':'application/json'}),body:JSON.stringify({projectId:'NN-H3-DELIVERY-A',projectKind:'redraw',nodeIds:['h3-node']})});
  const grant = await grantResponse.json();
  assert.equal(grantResponse.status, 201);
  const taskResponse = await fetch(`${appUrl}/api/studio/tasks`, {method:'POST',headers:headers('h3-token-a',{'content-type':'application/json'}),body:JSON.stringify({projectId:'NN-H3-DELIVERY-A',projectKind:'redraw',vendor:'runninghub',request:{kind:'text_to_video',prompt:'雨夜城市街头，人物缓慢回头',extras:{grantId:grant.grantId,nodeId:'h3-node',idempotencyKey:'delivery-idempotency',modelKey:'niannian/minimax-h3',archetypeInput:{}}}})});
  const task = await taskResponse.json();
  assert.equal(taskResponse.status, 202);
  assert.equal(task.result.status, 'queued');
  assert.equal(runCalls, 1);

  const deliveredResponse = await fetch(`${appUrl}/api/studio/tasks/${encodeURIComponent(task.result.id)}?projectId=NN-H3-DELIVERY-A`, {headers:headers('h3-token-a')});
  const delivered = await deliveredResponse.json();
  assert.equal(deliveredResponse.status, 200);
  assert.equal(delivered.result.status, 'succeeded');
  assert.equal(delivered.result.assets.length, 1);
  assert.match(delivered.result.assets[0].url, /^\/api\/projects\/NN-H3-DELIVERY-A\/assets\/CAS-[a-f0-9]{24}\/download$/);
  assert.equal(queryCalls, 1);
  assert.equal(videoReads, 1);
  assert.equal(JSON.stringify(delivered), JSON.stringify(delivered).replace(/mock-h3-task|result\.mp4/g, ''));

  const downloadResponse = await fetch(appUrl + delivered.result.assets[0].url, {headers:headers('h3-token-a')});
  assert.equal(downloadResponse.status, 200);
  assert.deepEqual(Buffer.from(await downloadResponse.arrayBuffer()), mp4);
  const projectDeliveriesResponse = await fetch(`${appUrl}/api/projects/NN-H3-DELIVERY-A/deliveries`, {headers:headers('h3-token-a')});
  const projectDeliveries = await projectDeliveriesResponse.json();
  assert.equal(projectDeliveriesResponse.status, 200, JSON.stringify(projectDeliveries));
  assert.equal(projectDeliveries.status, '已完成');
  assert.equal(projectDeliveries.deliveries.length, 1);
  assert.equal(projectDeliveries.deliveries[0].type, 'video');
  assert.match(projectDeliveries.deliveries[0].openUrl, /^\/api\/projects\/NN-H3-DELIVERY-A\/assets\/CAS-[a-f0-9]{24}\/download$/);
  assert.equal(projectDeliveries.deliveries[0].downloadUrl, projectDeliveries.deliveries[0].openUrl + '?download=1');
  assert.equal(JSON.stringify(projectDeliveries).includes('mock-h3-task'), false);
  assert.equal(JSON.stringify(projectDeliveries).includes('result.mp4'), false);
  const deliveryDownload = await fetch(appUrl + projectDeliveries.deliveries[0].downloadUrl, {headers:headers('h3-token-a')});
  assert.equal(deliveryDownload.status, 200);
  assert.match(String(deliveryDownload.headers.get('content-disposition') || ''), /^attachment;/);
  assert.deepEqual(Buffer.from(await deliveryDownload.arrayBuffer()), mp4);
  const workspaceDeliveriesResponse = await fetch(`${appUrl}/api/workspace-projects/NN-H3-DELIVERY-A/deliveries`, {headers:headers('h3-token-a')});
  const workspaceDeliveries = await workspaceDeliveriesResponse.json();
  assert.equal(workspaceDeliveriesResponse.status, 200, JSON.stringify(workspaceDeliveries));
  assert.equal(workspaceDeliveries.deliveries.length, 1);
  assert.equal(workspaceDeliveries.deliveries[0].assetId, projectDeliveries.deliveries[0].assetId);
  const docs = JSON.parse(await fsp.readFile(path.join(dataRoot, 'canvas-documents.json'), 'utf8'));
  const node = docs['nomi:redraw:NN-H3-DELIVERY-A'].document.generationCanvas.nodes[0];
  assert.equal(node.status, 'success');
  assert.equal(node.result.assetId, delivered.result.assets[0].assetId);
  assert.equal(node.result.url, delivered.result.assets[0].url);
  const tasks = await fsp.readFile(path.join(dataRoot, 'nomi-web-tasks.json'), 'utf8');
  assert.equal(tasks.includes('/result.mp4'), false);
  const repeat = await fetch(`${appUrl}/api/studio/tasks/${encodeURIComponent(task.result.id)}?projectId=NN-H3-DELIVERY-A`, {headers:headers('h3-token-a')});
  assert.equal(repeat.status, 200);
  assert.equal(queryCalls, 1);
  assert.equal(videoReads, 1);
  const foreign = await fetch(`${appUrl}/api/studio/tasks/${encodeURIComponent(task.result.id)}?projectId=NN-H3-DELIVERY-A`, {headers:headers('h3-token-b')});
  assert.equal(foreign.status, 404);
  const foreignProjectDeliveries = await fetch(`${appUrl}/api/projects/NN-H3-DELIVERY-A/deliveries`, {headers:headers('h3-token-b')});
  assert.equal(foreignProjectDeliveries.status, 404);
  const foreignWorkspaceDeliveries = await fetch(`${appUrl}/api/workspace-projects/NN-H3-DELIVERY-A/deliveries`, {headers:headers('h3-token-b')});
  assert.equal(foreignWorkspaceDeliveries.status, 404);
  console.log('NOMI_H3_RESULT_DELIVERY_HTTP_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (app && !app.killed) app.kill();
  if (provider) await new Promise(resolve => provider.close(resolve));
  await fsp.rm(dataRoot, {recursive:true,force:true});
});
