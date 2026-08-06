const assert = require('assert');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = __dirname;
const port = 4199;
const dataDir = path.join(os.tmpdir(), 'niannian-canonical-test-' + process.pid);

function request(method, pathname, {body = null, cookie = ''} = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      hostname:'127.0.0.1',
      port,
      path:pathname,
      method,
      headers:{
        ...(payload ? {'Content-Type':'application/json','Content-Length':payload.length} : {}),
        ...(cookie ? {Cookie:cookie} : {})
      }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({status:response.statusCode, headers:response.headers, body:Buffer.concat(chunks)}));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    try {
      const res = await request('GET', '/api/health');
      if (res.status === 200) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('server did not start');
}

(async () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd:root,
    env:{
      ...process.env,
      PORT:String(port),
      DATA_DIR:dataDir,
      NIANNIAN_EXACT_STEP01_EVIDENCE_ROOT:path.join(root, 'data-local', 'step01-evidence', 'NN-20260715083045-8120F5', 'EP001'),
      NIANNIAN_LOCAL_PREVIEW_INSECURE_SESSION:'on'
    },
    stdio:['ignore', 'pipe', 'pipe'],
    windowsHide:true
  });
  try {
    await waitForServer();
    const email = 'step01-evidence-' + process.pid + '@local.test';
    const register = await request('POST', '/api/auth/register', {body:{email, password:'TestPass123!', name:'Step01 Tester'}});
    assert.strictEqual(register.status, 200, register.body.toString('utf8'));
    const cookie = String(register.headers['set-cookie'] || '').split(';')[0];
    assert.ok(cookie.includes('niannian_session='));

    const evidenceRes = await request('GET', '/api/reference-evidence/NN-20260715083045-8120F5-EP001', {cookie});
    assert.strictEqual(evidenceRes.status, 200, evidenceRes.body.toString('utf8'));
    const payload = JSON.parse(evidenceRes.body.toString('utf8'));
    assert.strictEqual(payload.evidence.id, 'NN-20260715083045-8120F5-EP001');
    assert.strictEqual(payload.evidence.projectId, 'NN-20260715083045-8120F5');
    assert.strictEqual(payload.evidence.analysisRunId, 'analysis-1-0dc5c5d751592e9fd0656a81');
    assert.strictEqual(payload.evidence.status, 'verified');
    assert.strictEqual(payload.evidence.source.sha256, 'a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c');
    assert.strictEqual(payload.evidence.source.bytes, 145897161);
    assert.strictEqual(payload.evidence.counts.transnetShots, 37);
    assert.strictEqual(payload.evidence.counts.shotSupplements, 111);
    assert.strictEqual(payload.evidence.counts.dialogueSegments, 13);
    assert.strictEqual(payload.evidence.counts.ocrStates, 34);
    assert.strictEqual(payload.evidence.counts.previewableShots, 37);
    assert.strictEqual(payload.evidence.shots.length, 37);
    assert.ok(payload.evidence.shots.every(shot => shot.frames.start && shot.frames.mid && shot.frames.end));
    assert.ok(!JSON.stringify(payload).includes(String(root)));
    assert.ok(!JSON.stringify(payload).includes('/home/hermes/'));

    const frameUrl = payload.evidence.shots[0].frames.start.url;
    const frameRes = await request('GET', frameUrl, {cookie});
    assert.strictEqual(frameRes.status, 200);
    assert.strictEqual(frameRes.headers['content-type'], 'image/png');
    assert.ok(frameRes.body.length > 100000);

    console.log('test_exact_step01_reference_evidence passed');
  } finally {
    child.kill();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
