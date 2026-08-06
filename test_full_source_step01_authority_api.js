'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');

async function waitForServer(child) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server timeout')), 15000);
    child.stdout.on('data', chunk => {
      if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(); }
    });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('server exited ' + code)); });
  });
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await new Promise(resolve => child.once('exit', resolve));
}

(async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-full-source-api-'));
  const port = 21000 + Math.floor(Math.random() * 800);
  const base = `http://127.0.0.1:${port}`;
  let child;
  try {
    child = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      env: {...process.env, DATA_DIR: dataDir, PORT: String(port), NIANNIAN_MEDIA_PREFLIGHT: 'off'},
      stdio: ['ignore', 'pipe', 'pipe']
    });
    await waitForServer(child);
    const register = await fetch(base + '/api/auth/register', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: `full-source-${Date.now()}@example.com`, password: 'test-password-123'})
    });
    assert.equal(register.status, 200);
    const user = (await register.json()).user;
    const cookie = register.headers.get('set-cookie').split(';')[0];
    const project = {
      id: 'NN-20260727052447-62C34D', ownerId: user.id, name: 'full source gate fixture', status: 'running',
      productionStatus: 'running', createdAt: new Date().toISOString(), remakeMode: 'redraw', targetLanguage: 'en-US',
      source: {originalName: 'source.mp4', mimeType: 'video/mp4', bytes: 14955804, sha256: 'd7713a2f0a09be3fc1d9ab1257805585d181bc23732f058a903e3443311f16bd'},
      analysis: {status: 'completed', runId: 'legacy-9-shot'},
      runtime: {productionStatus: 'completed', currentNode: 'Step02', nextAction: 'old 9-shot data', artifactCount: 9, verifiedArtifactCount: 9}
    };
    await fs.writeFile(path.join(dataDir, 'projects.json'), JSON.stringify([project], null, 2) + '\n');

    const projectResponse = await fetch(base + '/api/projects/' + encodeURIComponent(project.id), {headers: {Cookie: cookie}});
    assert.equal(projectResponse.status, 200);
    const projected = (await projectResponse.json()).project;
    assert.equal(projected.step01Authority.status, 'blocked');
    assert.equal(projected.step01Authority.shot_count, 61);
    assert.equal(projected.step01Authority.old_authority_hidden, true);
    assert.equal(projected.runtime.productionStatus, 'blocked_full_source_authority');
    assert.equal(projected.runtime.currentNode, 'Step01');
    assert.equal(projected.runtime.blocker, 'STEP01_FULL_SOURCE_AUTHORITY_PENDING');
    assert.equal(typeof projected.runtime.nextAction, 'string');

    const evidenceResponse = await fetch(base + '/api/projects/' + encodeURIComponent(project.id) + '/step01-evidence', {headers: {Cookie: cookie}});
    assert.equal(evidenceResponse.status, 409);
    const blocked = await evidenceResponse.json();
    assert.equal(blocked.code, 'STEP01_FULL_SOURCE_AUTHORITY_PENDING');
    assert.equal(blocked.step01Authority.shot_count, 61);
    assert.equal(blocked.oldAuthorityHidden, true);

    console.log(JSON.stringify({ok: true, checks: [
      'GET project returns the full-source blocker projection instead of legacy runtime state',
      'GET Step01 evidence refuses to return stale 9-shot data',
      'public API exposes only 61-shot non-consumable authority state'
    ]}));
  } finally {
    await stop(child);
    await fs.rm(dataDir, {recursive: true, force: true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
