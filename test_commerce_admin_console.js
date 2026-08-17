'use strict';

const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');

const root = __dirname;
const port = 21300 + Math.floor(Math.random() * 500);
const baseUrl = `http://127.0.0.1:${port}`;
const dataRoot = path.join(os.tmpdir(), `niannian-commerce-console-${process.pid}-${Date.now()}`);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const headers = token => ({cookie:`niannian_session=${token}`});
let child;

async function fetchJson(pathname, options) {
  const response = await fetch(baseUrl + pathname, options);
  return {response, body:await response.json()};
}

async function run() {
  await fs.mkdir(dataRoot, {recursive:true});
  const future = new Date(Date.now() + 3600000).toISOString();
  await Promise.all([
    fs.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([{id:'USR-ADMIN',email:'admin@test',status:'active',role:'admin',tenantId:'TEN-A'},{id:'USR-USER',email:'user@test',status:'active',tenantId:'TEN-A'}])),
    fs.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{userId:'USR-ADMIN',tokenHash:hash('admin-token'),expiresAt:future},{userId:'USR-USER',tokenHash:hash('user-token'),expiresAt:future}])),
    ...['projects.json','script-projects.json','canvas-documents.json','canvas-generation-jobs.json','workspace-bindings.json','website-idempotency.json'].map(name => fs.writeFile(path.join(dataRoot, name), name === 'canvas-documents.json' ? '{}' : '[]'))
  ]);
  child = spawn(process.execPath, ['server.js'], {cwd:root, env:{...process.env, PORT:String(port), DATA_DIR:dataRoot, NIANNIAN_ADMIN_USER_IDS:'USR-ADMIN', AGENT_VAULT_ADDR:'http://127.0.0.1:14321', AGENT_VAULT_VAULT:'test-vault', AGENT_VAULT_TOKEN:'test-token', HTTPS_PROXY:'http://127.0.0.1:14322', NIANNIAN_CANVAS_YUNWU_SUBMIT:'on', NOMI_RUNNINGHUB_H3_API_KEY:'test-h3-key', NIANNIAN_CANVAS_H3_SUBMIT:'on'}, stdio:'ignore'});
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(baseUrl + '/api/health')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const visitorPage = await fetch(baseUrl + '/admin/commerce/');
  assert.equal(visitorPage.status, 401);
  const userPage = await fetch(baseUrl + '/admin/commerce/', {headers:headers('user-token')});
  assert.equal(userPage.status, 403);
  const adminPage = await fetch(baseUrl + '/admin/commerce/', {headers:headers('admin-token')});
  assert.equal(adminPage.status, 200);
  assert.match(await adminPage.text(), /商业运营台/);
  const userSummary = await fetch(baseUrl + '/api/admin/commerce/summary', {headers:headers('user-token')});
  assert.equal(userSummary.status, 403);
  const initial = await fetchJson('/api/admin/commerce/summary', {headers:headers('admin-token')});
  assert.equal(initial.response.status, 200);
  assert.equal(JSON.stringify(initial.body).includes('agent-vault://'), false);
  assert.equal(JSON.stringify(initial.body).includes('test-h3-key'), false);
  const imageProvider = initial.body.providers.find(item => item.id === 'yunwu-agent-vault');
  assert.equal(imageProvider.credentialConfigured, true);
  const providerOn = await fetchJson('/api/admin/model-config/provider', {method:'PUT',headers:{...headers('admin-token'),'content-type':'application/json'},body:JSON.stringify({id:'yunwu-agent-vault',label:'云雾',kind:'image',enabled:true})});
  assert.equal(providerOn.response.status, 200);
  const saved = await fetchJson('/api/admin/model-config/model', {method:'PUT',headers:{...headers('admin-token'),'content-type':'application/json'},body:JSON.stringify({id:'yunwu-gpt-image-2-c',label:'云雾 Image2 竖版 4K',kind:'image',providerId:'yunwu-agent-vault',providerLabel:'云雾',tenantId:'default',enabled:true,priceCredits:17,resolutions:['4k'],aspectRatios:['9:16'],outputSizes:{'4k':'2160x3840'}})});
  assert.equal(saved.response.status, 200);
  const catalog = await fetchJson('/api/canvas/model-catalog', {headers:headers('user-token')});
  const publicModel = catalog.body.catalog.models.find(item => item.id === 'yunwu-gpt-image-2-c');
  assert.equal(publicModel.priceCredits, 17);
  assert.equal(JSON.stringify(catalog.body).includes('agent-vault://'), false);
  const providerOff = await fetchJson('/api/admin/model-config/provider', {method:'PUT',headers:{...headers('admin-token'),'content-type':'application/json'},body:JSON.stringify({id:'yunwu-agent-vault',label:'云雾',kind:'image',enabled:false})});
  assert.equal(providerOff.response.status, 200);
  const suppressedCatalog = await fetchJson('/api/canvas/model-catalog', {headers:headers('user-token')});
  assert.equal(suppressedCatalog.body.catalog.models.some(item => item.id === 'yunwu-gpt-image-2-c'), false);
  console.log('COMMERCE_ADMIN_CONSOLE_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (child && !child.killed) child.kill(); await fs.rm(dataRoot, {recursive:true,force:true}); });
