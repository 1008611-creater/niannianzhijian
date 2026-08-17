'use strict';

const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const {createModelControlPlane} = require('./bridge/niannian_model_control_plane');

const root = __dirname;
const port = 21700 + Math.floor(Math.random() * 400);
const baseUrl = `http://127.0.0.1:${port}`;
const dataRoot = path.join(os.tmpdir(), `niannian-commerce-billing-${process.pid}-${Date.now()}`);
const tokenHash = value => crypto.createHash('sha256').update(value).digest('hex');
const headers = (token, extra = {}) => ({cookie:`niannian_session=${token}`, ...extra});
let child;
let output = '';

async function jsonRequest(pathname, options = {}) {
  const response = await fetch(baseUrl + pathname, options);
  return {response, body:await response.json()};
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(baseUrl + '/api/health')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start: ${output.slice(-1600)}`);
}

async function run() {
  await fs.mkdir(dataRoot, {recursive:true});
  const future = new Date(Date.now() + 3600000).toISOString();
  const admin = {id:'USR-ADMIN', email:'admin@test', status:'active', role:'admin', tenantId:'TEN-ADMIN'};
  const user = {id:'USR-USER', email:'user@test', status:'active', tenantId:'TEN-USER'};
  await Promise.all([
    fs.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([admin, user])),
    fs.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{userId:admin.id, tokenHash:tokenHash('admin-token'), expiresAt:future}, {userId:user.id, tokenHash:tokenHash('user-token'), expiresAt:future}])),
    fs.writeFile(path.join(dataRoot, 'projects.json'), JSON.stringify([{id:'NN-COMMERCE-1', ownerId:user.id, name:'商业账本测试', status:'draft'}])),
    fs.writeFile(path.join(dataRoot, 'script-projects.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'canvas-documents.json'), JSON.stringify({'redraw:NN-COMMERCE-1':{revision:1,projectId:'NN-COMMERCE-1',projectKind:'redraw',ownerId:user.id,document:{version:1,nodes:[{id:'image-1',type:'image',data:{title:'图像',prompt:'测试图像',status:'draft'}}],edges:[],viewport:{x:0,y:0,zoom:1}}}})),
    ...['canvas-generation-jobs.json','workspace-bindings.json','website-idempotency.json'].map(name => fs.writeFile(path.join(dataRoot, name), '[]'))
  ]);

  const plane = createModelControlPlane({configPath:path.join(dataRoot, 'model-control-config.json'), ledgerPath:path.join(dataRoot, 'credit-ledger.json')});
  await plane.upsertProvider(admin, {id:'yunwu-agent-vault', label:'云雾', kind:'image', enabled:true});
  await plane.upsertModel(admin, {id:'yunwu-gpt-image-2-c', label:'云雾图像', kind:'image', providerId:'yunwu-agent-vault', providerLabel:'云雾', tenantId:'TEN-USER', enabled:true, priceCredits:10, resolutions:['4k'], aspectRatios:['9:16'], outputSizes:{'4k':'2160x3840'}});
  await plane.creditAdmin(admin, {tenantId:user.tenantId, userId:user.id, amount:25, reason:'test_grant'});

  child = spawn(process.execPath, ['server.js'], {cwd:root, env:{...process.env, PORT:String(port), DATA_DIR:dataRoot, NIANNIAN_ADMIN_USER_IDS:admin.id, AGENT_VAULT_ADDR:'http://127.0.0.1:14321', AGENT_VAULT_VAULT:'test-vault', AGENT_VAULT_TOKEN:'test-token', HTTPS_PROXY:'http://127.0.0.1:14322', NIANNIAN_CANVAS_YUNWU_SUBMIT:'on', NIANNIAN_CANVAS_H3_SUBMIT:'off'}, stdio:['ignore','pipe','pipe']});
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  await waitForServer();

  const account = await jsonRequest('/api/commerce/account', {headers:headers('user-token')});
  assert.equal(account.response.status, 200);
  assert.equal(account.body.account.tenantId, user.tenantId);
  assert.equal(account.body.account.balance, 25);
  assert.equal(account.body.catalog.models.some(item => item.id === 'yunwu-gpt-image-2-c'), true);
  assert.equal(JSON.stringify(account.body).includes('agent-vault://'), false);

  const prepared = await jsonRequest('/api/projects/NN-COMMERCE-1/canvas/jobs', {
    method:'POST', headers:headers('user-token', {'content-type':'application/json','idempotency-key':'commerce-billing-0001'}),
    body:JSON.stringify({projectKind:'redraw',nodeId:'image-1',model:'yunwu-gpt-image-2-c',prompt:'测试图像',resolution:'4k',aspectRatio:'9:16',outputSize:'2160x3840'})
  });
  assert.equal(prepared.response.status, 201);
  const reservation = await plane.reserveCredits({tenantId:user.tenantId, userId:user.id, jobId:prepared.body.job.id, idempotencyKey:prepared.body.job.id + ':reserve', amount:10});
  assert.equal(await plane.accountBalance(user.tenantId, user.id), 15);
  const jobsPath = path.join(dataRoot, 'canvas-generation-jobs.json');
  const jobs = JSON.parse(await fs.readFile(jobsPath, 'utf8'));
  const job = jobs.find(item => item.id === prepared.body.job.id);
  Object.assign(job, {status:'failed', providerSubmitState:'failed', creditReservationId:reservation.reservationId, creditAmount:10, creditState:'reserved', failureCategory:'provider_request'});
  await fs.writeFile(jobsPath, JSON.stringify(jobs));

  const failed = await jsonRequest(`/api/projects/NN-COMMERCE-1/canvas/jobs/${encodeURIComponent(job.id)}`, {headers:headers('user-token', {'x-niannian-project-kind':'redraw'})});
  assert.equal(failed.response.status, 200);
  assert.equal(failed.body.job.credit.state, 'refunded');
  assert.equal(await plane.accountBalance(user.tenantId, user.id), 25);
  const failedAgain = await jsonRequest(`/api/projects/NN-COMMERCE-1/canvas/jobs/${encodeURIComponent(job.id)}`, {headers:headers('user-token', {'x-niannian-project-kind':'redraw'})});
  assert.equal(failedAgain.response.status, 200);
  assert.equal(await plane.accountBalance(user.tenantId, user.id), 25);
  const audit = await plane.auditCredits(admin, {tenantId:user.tenantId});
  assert.equal(audit.entries.filter(entry => entry.reservationId === reservation.reservationId && entry.type === 'refund').length, 1);

  const userAdmin = await fetch(baseUrl + '/api/admin/commerce/summary', {headers:headers('user-token')});
  assert.equal(userAdmin.status, 403);
  const summary = await jsonRequest('/api/admin/commerce/summary', {headers:headers('admin-token')});
  assert.equal(summary.response.status, 200);
  assert.equal(summary.body.jobs.some(item => item.id === job.id && item.creditState === 'refunded'), true);
  assert.equal(JSON.stringify(summary.body).includes('agent-vault://'), false);
  assert.equal(JSON.stringify(summary.body).includes('测试图像'), false);
  console.log('COMMERCE_BILLING_RECOVERY_HTTP_CONTRACT_OK');
}

run().catch(error => { console.error(error, output.slice(-2000)); process.exitCode = 1; }).finally(async () => {
  if (child && !child.killed) child.kill();
  await fs.rm(dataRoot, {recursive:true, force:true});
});
