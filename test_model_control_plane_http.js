'use strict';

const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');

const root = __dirname;
const port = 20800 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
const dataRoot = path.join(os.tmpdir(), `niannian-model-control-http-${process.pid}-${Date.now()}`);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const headers = token => ({cookie:`niannian_session=${token}`});
let child;
let output = '';

async function run() {
  await fs.mkdir(dataRoot, {recursive:true});
  const future = new Date(Date.now() + 3600000).toISOString();
  await Promise.all([
    fs.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([{id:'USR-ADMIN',email:'admin@test',status:'active',role:'admin',tenantId:'tenant-a'},{id:'USR-USER',email:'user@test',status:'active',tenantId:'tenant-a'}])),
    fs.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{userId:'USR-ADMIN',tokenHash:hash('admin-token'),expiresAt:future},{userId:'USR-USER',tokenHash:hash('user-token'),expiresAt:future}])),
    fs.writeFile(path.join(dataRoot, 'projects.json'), '[]'), fs.writeFile(path.join(dataRoot, 'script-projects.json'), '[]'), fs.writeFile(path.join(dataRoot, 'canvas-documents.json'), '{}'), fs.writeFile(path.join(dataRoot, 'canvas-generation-jobs.json'), '[]'), fs.writeFile(path.join(dataRoot, 'workspace-bindings.json'), '[]'), fs.writeFile(path.join(dataRoot, 'website-idempotency.json'), '[]')
  ]);
  child = spawn(process.execPath, ['server.js'], {cwd:root, env:{...process.env, PORT:String(port), DATA_DIR:dataRoot, NIANNIAN_ADMIN_USER_IDS:'USR-ADMIN', AGENT_VAULT_ADDR:'http://127.0.0.1:14321', AGENT_VAULT_VAULT:'test-vault', AGENT_VAULT_TOKEN:'test-token', HTTPS_PROXY:'http://127.0.0.1:14322', NIANNIAN_CANVAS_YUNWU_SUBMIT:'on', NOMI_RUNNINGHUB_H3_API_KEY:'test-h3-key', NIANNIAN_CANVAS_H3_SUBMIT:'on'}, stdio:['ignore','pipe','pipe']});
  child.stdout.on('data', chunk => { output += chunk.toString(); }); child.stderr.on('data', chunk => { output += chunk.toString(); });
  for (let attempt = 0; attempt < 100; attempt += 1) { try { if ((await fetch(`${baseUrl}/api/health`)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  const ordinary = await fetch(`${baseUrl}/api/admin/model-config`, {headers:headers('user-token')});
  assert.equal(ordinary.status, 403);
  const providerStatus = await fetch(`${baseUrl}/api/canvas/provider-status`, {headers:headers('user-token')});
  const publicBody = await providerStatus.json();
  assert.equal(providerStatus.status, 200);
  assert.equal(Object.hasOwn(publicBody.providerStatus, 'baseUrl'), false);
  assert.equal(Object.hasOwn(publicBody.providerStatus, 'credentialConfigured'), false);
  const imageProviderSave = await fetch(`${baseUrl}/api/admin/model-config/provider`, {method:'PUT',headers:{...headers('admin-token'),'content-type':'application/json'},body:JSON.stringify({id:'yunwu-agent-vault',label:'云雾',kind:'image',enabled:true})});
  assert.equal(imageProviderSave.status, 200);
  const modelSave = await fetch(`${baseUrl}/api/admin/model-config/model`, {method:'PUT',headers:{...headers('admin-token'),'content-type':'application/json'},body:JSON.stringify({id:'yunwu-gpt-image-2-c',label:'Image2',kind:'image',providerId:'yunwu-agent-vault',providerLabel:'云雾',tenantId:'tenant-a',enabled:true,priceCredits:10,resolutions:['4k'],aspectRatios:['9:16'],outputSizes:{'4k':'2160x3840'}})});
  assert.equal(modelSave.status, 200);
  const catalogResponse = await fetch(`${baseUrl}/api/canvas/model-catalog`, {headers:headers('user-token')});
  const catalog = await catalogResponse.json();
  assert.equal(catalogResponse.status, 200);
  assert.equal(catalog.catalog.models.some(item => item.id === 'yunwu-gpt-image-2-c'), true);
  assert.equal(JSON.stringify(catalog).includes('yunwu-agent-vault'), false);
  const dolaProviderSave = await fetch(`${baseUrl}/api/admin/model-config/provider`, {method:'PUT',headers:{...headers('admin-token'),'content-type':'application/json'},body:JSON.stringify({id:'dola-desktop-api',label:'Dola',kind:'video',enabled:true})});
  assert.equal(dolaProviderSave.status, 200);
  const dolaSave = await fetch(`${baseUrl}/api/admin/model-config/model`, {method:'PUT',headers:{...headers('admin-token'),'content-type':'application/json'},body:JSON.stringify({id:'dola-seedance-2-5',label:'Dola Seedance 2.5（30秒）',kind:'video',providerId:'dola-desktop-api',providerLabel:'Dola',tenantId:'tenant-a',enabled:true,priceCredits:0,resolutions:['720p'],aspectRatios:['9:16','16:9','1:1','4:3','3:4'],outputSizes:{}})});
  assert.equal(dolaSave.status, 200);
  const dolaCatalogResponse = await fetch(`${baseUrl}/api/canvas/model-catalog`, {headers:headers('user-token')});
  const dolaCatalog = await dolaCatalogResponse.json();
  assert.equal(dolaCatalog.catalog.models.some(item => item.id === 'dola-seedance-2-5'), false);
  assert.equal(JSON.stringify(dolaCatalog).includes('NIANNIAN_DOLA_API_KEY'), false);
  const configuredStatus = await fetch(`${baseUrl}/api/canvas/provider-status`, {headers:headers('user-token')});
  const configuredBody = await configuredStatus.json();
  assert.equal(configuredBody.providerStatus.imageSubmitEnabled, true);
  assert.equal(configuredBody.providerStatus.videoSubmitEnabled, false);
  assert.equal(configuredBody.providerStatus.dolaSubmitEnabled, false);
  assert.equal(configuredBody.providerStatus.imageChannels.some(item => item.id === 'yunwu-gpt-image-2-c'), true);
  console.log('MODEL_CONTROL_PLANE_HTTP_CONTRACT_OK');
}

run().catch(error => { console.error(error, output.slice(-2000)); process.exitCode = 1; }).finally(async () => { if (child && !child.killed) child.kill(); await fs.rm(dataRoot, {recursive:true,force:true}); });
