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
async function register(base, label) {
  const result = await call(base + '/api/auth/register', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:'delivery-' + label + '-' + Date.now() + '@example.com', password:'correct-horse-battery-staple'})
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.payload));
  return {cookie:String(result.response.headers.get('set-cookie') || '').split(';')[0]};
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-workspace-delivery-'));
  const port = 27500 + crypto.randomInt(400);
  const base = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    cwd:__dirname,
    env:{...process.env, PORT:String(port), DATA_DIR:path.join(root, 'data'), NIANNIAN_MEDIA_PREFLIGHT:'off'},
    stdio:['ignore','ignore','pipe']
  });
  try {
    await waitForHealth(base);
    const owner = await register(base, 'owner');
    const stranger = await register(base, 'stranger');
    const sourceText = '第一章\n' + '苏晚走出民政局，顾言在雨里等她。'.repeat(30);
    const body = {name:'幂等短剧', sourceText, rightsConfirmed:true};
    const key = 'script-submit-' + crypto.randomBytes(12).toString('hex');
    const created = await call(base + '/api/script-projects', {method:'POST', headers:{Cookie:owner.cookie, 'Content-Type':'application/json', 'Idempotency-Key':key}, body:JSON.stringify(body)});
    assert.equal(created.response.status, 201, JSON.stringify(created.payload));
    const project = created.payload.project;
    assert.equal(project.source.integrity, 'verified');
    assert.equal(JSON.stringify(project).includes('sha256'), false);
    assert.equal(JSON.stringify(project).includes('localJobId'), false);
    const replay = await call(base + '/api/script-projects', {method:'POST', headers:{Cookie:owner.cookie, 'Content-Type':'application/json', 'Idempotency-Key':key}, body:JSON.stringify(body)});
    assert.equal(replay.response.status, 200, JSON.stringify(replay.payload));
    assert.equal(replay.payload.project.id, project.id);
    assert.equal(replay.payload.idempotent, true);
    const conflict = await call(base + '/api/script-projects', {method:'POST', headers:{Cookie:owner.cookie, 'Content-Type':'application/json', 'Idempotency-Key':key}, body:JSON.stringify({...body, name:'不同项目'})});
    assert.equal(conflict.response.status, 409, JSON.stringify(conflict.payload));
    assert.equal(conflict.payload.code, 'IDEMPOTENCY_KEY_CONFLICT');
    const deliveries = await call(base + '/api/workspace-projects/' + encodeURIComponent(project.workspaceProjectId) + '/deliveries', {headers:{Cookie:owner.cookie}});
    assert.equal(deliveries.response.status, 200, JSON.stringify(deliveries.payload));
    assert.equal(deliveries.payload.word.status, 'not_ready');
    assert.equal(deliveries.payload.word.openUrl, null);
    assert.deepEqual(deliveries.payload.deliveries, []);
    const deniedOverview = await call(base + '/api/workspace-projects/' + encodeURIComponent(project.workspaceProjectId) + '/overview', {headers:{Cookie:stranger.cookie}});
    const deniedWord = await call(base + '/api/workspace-projects/' + encodeURIComponent(project.workspaceProjectId) + '/deliveries/word', {headers:{Cookie:stranger.cookie}});
    assert.equal(deniedOverview.response.status, 404);
    assert.equal(deniedWord.response.status, 404);
    const redrawKey = 'redraw-submit-' + crypto.randomBytes(12).toString('hex');
    const redrawRequest = () => {
      const form = new FormData();
      form.set('name', '视频转绘');
      form.set('rightsConfirmed', 'on');
      form.set('sourceVideo', new Blob(['minimal MP4 container fixture'], {type:'video/mp4'}), 'source.mp4');
      return form;
    };
    const redrawCreated = await call(base + '/api/projects', {method:'POST', headers:{Cookie:owner.cookie, 'Idempotency-Key':redrawKey}, body:redrawRequest()});
    assert.equal(redrawCreated.response.status, 201, JSON.stringify(redrawCreated.payload));
    const redrawReplay = await call(base + '/api/projects', {method:'POST', headers:{Cookie:owner.cookie, 'Idempotency-Key':redrawKey}, body:redrawRequest()});
    assert.equal(redrawReplay.response.status, 200, JSON.stringify(redrawReplay.payload));
    assert.equal(redrawReplay.payload.project.id, redrawCreated.payload.project.id);
    assert.equal(redrawReplay.payload.idempotent, true);
    process.stdout.write(JSON.stringify({ok:true, verified:['script submission idempotency reuse and conflict','public project projection hides source hashes and worker identifiers','missing receipt is not projected as a Word delivery','workspace overview and Word route deny another account']}) + '\n');
  } finally {
    server.kill();
    await wait(100);
    if (server.exitCode === null) server.kill('SIGKILL');
    await fs.rm(root, {recursive:true, force:true});
  }
}
main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
