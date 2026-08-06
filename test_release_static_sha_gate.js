const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const { verifyStaticSha256, verifyPublicHtmlSha256 } = require('./release_static_sha_gate');

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

async function main() {
  const body = Buffer.from('<!doctype html>\n<html>tailing newline matters</html>\n', 'utf8');
  const expected = crypto.createHash('sha256').update(body).digest('hex');
  const newlineStripped = crypto.createHash('sha256').update(body.subarray(0, body.length - 1)).digest('hex');
  assert.notEqual(expected, newlineStripped);

  const server = await listen((request, response) => {
    response.writeHead(200, { 'content-type':'text/html' });
    response.end(body);
  });
  const port = server.address().port;
  try {
    const passed = await verifyStaticSha256(`http://127.0.0.1:${port}/`, expected, {
      connectTimeoutMs:100,
      requestTimeoutMs:150,
      maxBytes:1024
    });
    assert.deepEqual(passed, { ok:true, statusCode:200, bytes:body.length, sha256:expected, error:null });

    const failed = await verifyStaticSha256(`http://127.0.0.1:${port}/`, newlineStripped, {
      connectTimeoutMs:100,
      requestTimeoutMs:150,
      maxBytes:1024
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.sha256, expected);

    const beacon = `<script defer src="https://static.cloudflareinsights.com/beacon.min.js/v4513226cdae34746b4dedf0b4dfa099e1781791509496" integrity="sha512-ZE9pZaUXND66v380QUtch/5sE9tPFh2zg45pR2PB0CVkCtOREv2AJKkSidISWkysEuQ0EH8faUU5du78bx87UQ==" data-cf-beacon='{"version":"2024.11.0","r":1}' crossorigin="anonymous"></script>`;
    const publicBody = Buffer.from('<!doctype html>\n<body>approved page\n  ' + beacon + '\n</body>\n', 'utf8');
    const publicExpected = crypto.createHash('sha256').update(Buffer.from('<!doctype html>\n<body>approved page\n  </body>\n', 'utf8')).digest('hex');
    const publicServer = await listen((request, response) => {
      response.writeHead(200, { 'content-type':'text/html' });
      response.end(publicBody);
    });
    try {
      const normalized = await verifyPublicHtmlSha256(`http://127.0.0.1:${publicServer.address().port}/`, publicExpected, {
        connectTimeoutMs:100,
        requestTimeoutMs:150,
        maxBytes:1024
      });
      assert.equal(normalized.ok, true);
      assert.equal(normalized.normalization, 'cloudflare_standard_beacon_before_body');
      assert.equal(normalized.normalizedSha256, publicExpected);
      assert.notEqual(normalized.sha256, publicExpected);
    } finally {
      await close(publicServer);
    }
  } finally {
    await close(server);
  }
  process.stdout.write(JSON.stringify({ ok:true, verified:['raw response SHA retains trailing newline', 'newline-stripped SHA is rejected', 'only the documented Cloudflare telemetry beacon is normalized'] }) + '\n');
}

main().catch(error => {
  process.stderr.write(String(error.stack || error) + '\n');
  process.exitCode = 1;
});
