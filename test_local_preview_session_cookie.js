const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const root = __dirname;

function request(port, method, pathname, body, cookie) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const request = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers: {
        ...(payload ? {'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(payload)} : {}),
        ...(cookie ? {Cookie:cookie} : {})
      }
    }, response => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { raw += chunk; });
      response.on('end', () => resolve({status:response.statusCode, headers:response.headers, body:JSON.parse(raw || '{}')}));
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function startServer(port, dataDir, localPreview) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        DATA_DIR: dataDir,
        NIANNIAN_LOCAL_PREVIEW_INSECURE_SESSION: localPreview ? 'on' : 'off'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const fail = error => {
      child.kill();
      reject(error);
    };
    child.once('error', fail);
    child.stderr.on('data', chunk => { output += chunk; });
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('NianNian AI listening')) resolve(child);
    });
    child.once('exit', code => {
      if (!output.includes('NianNian AI listening')) reject(new Error('preview server exited before startup: ' + code));
    });
  });
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise(resolve => {
    child.once('exit', resolve);
    child.kill();
  });
}

async function exerciseCookieContract(localPreview) {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-cookie-'));
  const port = 46000 + Math.floor(Math.random() * 1000);
  let child;
  try {
    child = await startServer(port, tempRoot, localPreview);
    const register = await request(port, 'POST', '/api/auth/register', {
      email: 'preview-' + Date.now() + '@example.test',
      password: 'test-password-123'
    });
    assert.equal(register.status, 200);
    const setCookie = Array.isArray(register.headers['set-cookie']) ? register.headers['set-cookie'][0] : register.headers['set-cookie'];
    assert(setCookie && setCookie.includes('HttpOnly') && setCookie.includes('SameSite=Lax'));
    assert.equal(setCookie.includes('Secure'), !localPreview);
    const session = await request(port, 'GET', '/api/auth/session', null, setCookie.split(';')[0]);
    assert.equal(session.status, 200);
    assert(session.body.user && session.body.user.email === register.body.user.email);
  } finally {
    await stopServer(child);
    await fsp.rm(tempRoot, {recursive:true, force:true});
  }
}

(async () => {
  await exerciseCookieContract(true);
  await exerciseCookieContract(false);
  process.stdout.write(JSON.stringify({
    ok:true,
    verified:[
      'local preview login sets a non-Secure HttpOnly session cookie that survives /api/auth/session',
      'the default production contract continues to set Secure on the HttpOnly session cookie'
    ]
  }) + '\n');
})().catch(error => {
  process.stderr.write((error.stack || error.message) + '\n');
  process.exitCode = 1;
});
