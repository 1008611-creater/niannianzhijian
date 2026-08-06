'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { checkedStaticFiles, verifyPublicCandidateStatic } = require('./verify_public_candidate_static');

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

async function main() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'niannian-public-static-'));
  const packageRoot = path.join(temporaryRoot, 'package');
  const sourceRoot = __dirname;
  try {
    for (const relativePath of checkedStaticFiles(sourceRoot)) {
      const sourcePath = path.join(sourceRoot, relativePath);
      const destination = path.join(packageRoot, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive:true });
      fs.copyFileSync(sourcePath, destination);
    }

    let staleStory = false;
    const server = await listen((request, response) => {
      const relativePath = request.url.split('?')[0].replace(/^\//, '') || 'index.html';
      const filePath = path.join(packageRoot, relativePath);
      if (!fs.existsSync(filePath)) {
        response.writeHead(404).end();
        return;
      }
      let body = fs.readFileSync(filePath);
      if (staleStory && relativePath === 'mvp-step01-story-r1.js') body = Buffer.concat([body, Buffer.from('\n// stale public asset\n')]);
      response.writeHead(200, { 'content-type':'application/octet-stream' });
      response.end(body);
    });
    try {
      const target = `http://127.0.0.1:${server.address().port}`;
      const matched = await verifyPublicCandidateStatic(packageRoot, target, { connectTimeoutMs:100, requestTimeoutMs:300 });
      assert.equal(matched.ok, true);
      assert.equal(matched.checked, checkedStaticFiles(packageRoot).length);
      assert.equal(matched.mismatches.length, 0);

      staleStory = true;
      const stale = await verifyPublicCandidateStatic(packageRoot, target, { connectTimeoutMs:100, requestTimeoutMs:300 });
      assert.equal(stale.ok, false);
      assert.deepEqual(stale.mismatches.map(item => item.file), ['mvp-step01-story-r1.js']);
      assert.notEqual(stale.mismatches[0].actualSha256, stale.mismatches[0].expectedSha256);
    } finally {
      await close(server);
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive:true, force:true });
  }
  process.stdout.write(JSON.stringify({ ok:true, verified:['candidate static set is checked', 'matching public assets pass', 'a stale Step01 authority script fails the gate'] }) + '\n');
}

main().catch(error => {
  process.stderr.write(String(error.stack || error) + '\n');
  process.exitCode = 1;
});
