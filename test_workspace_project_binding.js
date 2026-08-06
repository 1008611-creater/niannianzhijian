'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs').promises;
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function call(url, options = {}) {
  const response = await fetch(url, options);
  return {response, payload:await response.json().catch(() => ({}))};
}
async function waitForHealth(base) {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(base + '/api/health')).ok) return; } catch {}
    await wait(100);
  }
  throw new Error('health_timeout');
}
async function register(base, suffix) {
  const result = await call(base + '/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:'workspace-' + suffix + '-' + Date.now() + '@example.com', password:'correct-horse-battery-staple'})});
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  return {user:result.payload.user, cookie:String(result.response.headers.get('set-cookie') || '').split(';')[0]};
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-workspace-binding-'));
  const port = 27000 + crypto.randomInt(500);
  const base = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {cwd:__dirname, env:{...process.env, PORT:String(port), DATA_DIR:path.join(root, 'data'), NIANNIAN_MEDIA_PREFLIGHT:'off'}, stdio:['ignore','ignore','pipe']});
  try {
    await waitForHealth(base);
    const owner = await register(base, 'owner');
    const foreign = await register(base, 'foreign');
    const text = '第一章\n' + '苏晚走出民政局，顾言在雨里等她。'.repeat(30);
    const created = await call(base + '/api/script-projects', {method:'POST', headers:{Cookie:owner.cookie, 'Content-Type':'application/json'}, body:JSON.stringify({name:'父项目短剧', sourceText:text, rightsConfirmed:true})});
    assert.equal(created.response.status, 201, JSON.stringify(created.payload));
    const parentId = created.payload.project.workspaceProjectId;
    assert.equal(parentId, created.payload.project.id);
    const list = await call(base + '/api/workspace-projects', {headers:{Cookie:owner.cookie}});
    assert.equal(list.response.status, 200);
    assert.equal(list.payload.projects.length, 1);
    assert.equal(list.payload.projects[0].id, parentId);
    assert.deepEqual(list.payload.projects[0].tools, {canvas:true, redraw:true, shortDrama:true});
    const overview = await call(base + '/api/workspace-projects/' + encodeURIComponent(parentId) + '/overview', {headers:{Cookie:owner.cookie}});
    assert.equal(overview.response.status, 200);
    assert.equal(overview.payload.project.id, parentId);
    assert.equal(overview.payload.shortDrama.id, created.payload.project.id);
    assert.equal(overview.payload.canvas.source, 'server');
    const deliveries = await call(base + '/api/workspace-projects/' + encodeURIComponent(parentId) + '/deliveries', {headers:{Cookie:owner.cookie}});
    assert.equal(deliveries.response.status, 200);
    assert.equal(deliveries.payload.word.status, 'not_ready');
    assert.equal(JSON.stringify(deliveries.payload).includes('provider_task_id'), false);
    const denied = await call(base + '/api/workspace-projects/' + encodeURIComponent(parentId) + '/overview', {headers:{Cookie:foreign.cookie}});
    assert.equal(denied.response.status, 404);
    process.stdout.write(JSON.stringify({ok:true, verified:['workspace parent persisted for script project','owner-scoped workspace list and overview','server canvas source marker','delivery projection does not claim missing Word or expose provider task identifiers','cross-account workspace denial']}) + '\n');
  } finally {
    server.kill();
    await wait(100);
    if (server.exitCode === null) server.kill('SIGKILL');
    await fs.rm(root, {recursive:true, force:true});
  }
}
main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
