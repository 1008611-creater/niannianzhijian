'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const projectRoot = __dirname;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd:options.cwd || projectRoot, windowsHide:true, stdio:['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(command + '_failed_' + code + ': ' + stderr)));
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || ('HTTP ' + response.status));
    error.status = response.status;
    throw error;
  }
  return { response, payload };
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const result = await fetchJson(baseUrl + '/api/health');
      if (result.payload.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('server_health_timeout');
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-media-preflight-'));
  const dataRoot = path.join(tempRoot, 'data');
  const sourcePath = path.join(tempRoot, 'fixture.mp4');
  const port = 20000 + crypto.randomInt(1000);
  const baseUrl = 'http://127.0.0.1:' + port;
  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  const ffprobePath = process.env.NIANNIAN_FFPROBE_PATH || 'ffprobe';
  const bridgeToken = crypto.randomBytes(48).toString('hex');
  const bridgeTokenHash = crypto.createHash('sha256').update(bridgeToken).digest('hex');
  let server;
  let serverStderr = '';

  try {
    await run(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=24', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=44100', '-t', '16', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', sourcePath]);
    const serverEnv = {
      ...process.env,
      PORT:String(port),
      DATA_DIR:dataRoot,
      NIANNIAN_MEDIA_PREFLIGHT:'on',
      NIANNIAN_FFPROBE_PATH:ffprobePath,
      NIANNIAN_MEDIA_PREFLIGHT_TIMEOUT_MS:'10000',
      BRIDGE_TOKEN_HASH:bridgeTokenHash
    };
    server = spawn(process.execPath, [path.join(projectRoot, 'server.js')], { cwd:projectRoot, env:serverEnv, stdio:['ignore', 'pipe', 'pipe'] });
    server.stderr.on('data', chunk => { serverStderr += chunk; });
    await waitForHealth(baseUrl);

    const email = 'preflight-test-' + Date.now() + '@example.com';
    const register = await fetchJson(baseUrl + '/api/auth/register', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email,password:'correct-horse-battery-staple'})
    });
    const cookie = String(register.response.headers.get('set-cookie') || '').split(';')[0];
    const shortNameForm = new FormData();
    shortNameForm.set('name', '1');
    shortNameForm.set('rightsConfirmed', 'on');
    shortNameForm.set('sourceVideo', new Blob([await fsp.readFile(sourcePath)], {type:'video/mp4'}), 'fixture.mp4');
    const shortNameRejected = await fetch(baseUrl + '/api/projects', { method:'POST', headers:{Cookie:cookie}, body:shortNameForm });
    const shortNamePayload = await shortNameRejected.json();
    assert.equal(shortNameRejected.status, 400);
    assert.equal(shortNamePayload.code, 'PROJECT_NAME_TOO_SHORT');
    assert.equal(shortNamePayload.error, '项目名称至少需要 2 个字符');
    const form = new FormData();
    form.set('name', '本机预检测试');
    form.set('rightsConfirmed', 'on');
    form.set('sourceVideo', new Blob([await fsp.readFile(sourcePath)], {type:'video/mp4'}), 'fixture.mp4');
    const created = await fetchJson(baseUrl + '/api/projects', { method:'POST', headers:{Cookie:cookie}, body:form });
    const project = created.payload.project;
    assert.equal(project.status, 'queued');
    assert.equal(project.runtime.productionStatus, 'preflight');
    assert.equal(project.preflight.status, 'passed');
    assert.equal(project.preflight.video.width, 320);
    assert.equal(project.preflight.video.height, 180);
    assert(project.preflight.durationSeconds >= 15);
    assert.equal(project.preflight.audio.streamCount, 1);
    assert.equal(project.runtime.verifiedArtifactCount, 3);
    assert.equal(project.pipeline.find(item => item.id === 'Step01').status, 'pending');
    assert.equal(project.runtime.gates.source_preflight.status, 'verified');
    assert.equal(project.analysis.status, 'awaiting_user_start');
    assert.equal(project.dispatch.status, 'awaiting_user_start');

    const jobRoot = path.join(dataRoot, 'jobs', project.id);
    const [mediaProbe, ledger, dashboard, checkpoint] = await Promise.all([
      fsp.readFile(path.join(jobRoot, 'media_probe.json'), 'utf8').then(JSON.parse),
      fsp.readFile(path.join(jobRoot, 'artifact_ledger.json'), 'utf8').then(JSON.parse),
      fsp.readFile(path.join(jobRoot, 'gate_dashboard.json'), 'utf8').then(JSON.parse),
      fsp.readFile(path.join(jobRoot, 'checkpoint.json'), 'utf8').then(JSON.parse)
    ]);
    assert.equal(mediaProbe.status, 'passed');
    assert(ledger.artifacts.some(item => item.artifact_id === 'source_media_probe' && item.status === 'verified'));
    assert.equal(dashboard.gates.source_preflight.status, 'verified');
    assert.equal(dashboard.gates.Step01.status, 'awaiting_user_start');
    assert.equal(checkpoint.earliest_incomplete_node, 'Step01');

    let validReplayRejected = null;
    try {
      await fetchJson(baseUrl + '/api/projects/' + encodeURIComponent(project.id) + '/preflight', { method:'POST', headers:{Cookie:cookie} });
    } catch (error) {
      validReplayRejected = error;
    }
    assert.equal(validReplayRejected && validReplayRejected.status, 409);

    const invalidForm = new FormData();
    invalidForm.set('name', '无效视频预检测试');
    invalidForm.set('rightsConfirmed', 'on');
    invalidForm.set('sourceVideo', new Blob([Buffer.from('not-a-video')], {type:'video/mp4'}), 'broken.mp4');
    const invalidCreated = await fetchJson(baseUrl + '/api/projects', { method:'POST', headers:{Cookie:cookie}, body:invalidForm });
    const invalidProject = invalidCreated.payload.project;
    assert.equal(invalidProject.status, 'blocked');
    assert.equal(invalidProject.preflight.status, 'failed');
    assert.equal(invalidProject.runtime.gateState, 'source_preflight_failed');
    assert.equal(invalidProject.pipeline.find(item => item.id === 'Step01').status, 'blocked');
    let invalidClaimRejected = null;
    try {
      await fetchJson(baseUrl + '/api/controller/jobs/' + encodeURIComponent(invalidProject.id) + '/claim', {
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer ' + bridgeToken},
        body:JSON.stringify({controllerId:'preflight-test-controller'})
      });
    } catch (error) {
      invalidClaimRejected = error;
    }
    assert.equal(invalidClaimRejected && invalidClaimRejected.status, 409);
    const invalidReplay = await fetchJson(baseUrl + '/api/projects/' + encodeURIComponent(invalidProject.id) + '/preflight', { method:'POST', headers:{Cookie:cookie} });
    assert.equal(invalidReplay.payload.project.preflight.status, 'failed');

    const replacementForm = new FormData();
    replacementForm.set('rightsConfirmed', 'on');
    replacementForm.set('sourceVideo', new Blob([await fsp.readFile(sourcePath)], {type:'video/mp4'}), 'replacement.mp4');
    const replaced = await fetchJson(baseUrl + '/api/projects/' + encodeURIComponent(invalidProject.id) + '/source', { method:'POST', headers:{Cookie:cookie}, body:replacementForm });
    assert.equal(replaced.payload.project.status, 'queued');
    assert.equal(replaced.payload.project.preflight.status, 'passed');
    assert.equal(replaced.payload.project.source.originalName, 'replacement.mp4');
    assert.equal(replaced.payload.project.runtime.gateState, 'awaiting_step01_user_start');
    assert.equal(replaced.payload.project.dispatch.status, 'awaiting_user_start');
    const replacementJobRoot = path.join(dataRoot, 'jobs', invalidProject.id);
    const replacementTask = await fsp.readFile(path.join(replacementJobRoot, 'task.json'), 'utf8').then(JSON.parse);
    const replacementProbe = await fsp.readFile(path.join(replacementJobRoot, 'media_probe.json'), 'utf8').then(JSON.parse);
    assert.equal(replacementTask.source_video.originalName, 'replacement.mp4');
    assert.equal(replacementProbe.status, 'passed');

    let replacementRejected = null;
    try {
      await fetchJson(baseUrl + '/api/projects/' + encodeURIComponent(invalidProject.id) + '/source', { method:'POST', headers:{Cookie:cookie}, body:replacementForm });
    } catch (error) {
      replacementRejected = error;
    }
    assert.equal(replacementRejected && replacementRejected.status, 409);

    process.stdout.write(JSON.stringify({ok:true,verified:['valid video upload','local ffprobe media preflight','durable media_probe','artifact ledger','quality gate','recheck only after failure','invalid video blocked before Step01','controller rejects invalid source','failed-source replacement','replacement contract reset','replacement locked after preflight success']}) + '\n');
  } finally {
    if (server) {
      server.kill();
      await delay(100);
      if (server.exitCode === null) server.kill('SIGKILL');
    }
    await fsp.rm(tempRoot, {recursive:true, force:true});
    if (serverStderr) process.stderr.write(serverStderr);
  }
}

main().catch(error => {
  process.stderr.write(error.stack + '\n');
  process.exitCode = 1;
});
