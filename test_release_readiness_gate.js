const assert = require('assert');
const http = require('http');
const { probeJson, waitForOriginReadiness } = require('./release_readiness_gate');

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

async function main() {
  let attempts = 0;
  const delayedReadyServer = await listen((request, response) => {
    attempts += 1;
    if (attempts < 3) {
      response.writeHead(502, { 'content-type':'application/json' });
      response.end(JSON.stringify({ ok:false }));
      return;
    }
    response.writeHead(200, { 'content-type':'application/json' });
    response.end(JSON.stringify({ ok:true }));
  });
  const delayedPort = delayedReadyServer.address().port;
  try {
    const result = await waitForOriginReadiness({
      originUrl:`http://127.0.0.1:${delayedPort}/api/health`,
      totalWindowMs:800,
      intervalMs:25,
      connectTimeoutMs:100,
      requestTimeoutMs:150
    });
    assert.equal(result.ok, true);
    assert.equal(result.attempts.length, 3);
    assert.equal(result.attempts[0].statusCode, 502);
    assert.equal(result.attempts[2].statusCode, 200);
  } finally {
    await close(delayedReadyServer);
  }

  const permanentlyUnhealthyServer = await listen((request, response) => {
    response.writeHead(503, { 'content-type':'application/json' });
    response.end(JSON.stringify({ ok:false }));
  });
  const unhealthyPort = permanentlyUnhealthyServer.address().port;
  try {
    await assert.rejects(
      () => waitForOriginReadiness({
        originUrl:`http://127.0.0.1:${unhealthyPort}/api/health`,
        totalWindowMs:160,
        intervalMs:25,
        connectTimeoutMs:50,
        requestTimeoutMs:75
      }),
      error => error.code === 'origin_readiness_window_elapsed' && error.attempts.length >= 2 && error.elapsedMs < 500
    );
  } finally {
    await close(permanentlyUnhealthyServer);
  }

  const hangingServer = await listen(() => {});
  const hangingPort = hangingServer.address().port;
  try {
    const timeoutResult = await probeJson(`http://127.0.0.1:${hangingPort}/api/health`, { connectTimeoutMs:50, requestTimeoutMs:75 });
    assert.equal(timeoutResult.ok, false);
    assert.equal(timeoutResult.error, 'request_timeout');
    assert(timeoutResult.durationMs < 300);
  } finally {
    await close(hangingServer);
  }

  await assert.rejects(
    () => waitForOriginReadiness({
      originUrl:'https://ai.cauai.fun/api/health',
      totalWindowMs:100,
      intervalMs:20,
      connectTimeoutMs:20,
      requestTimeoutMs:50
    }),
    error => error.code === 'origin_host_not_loopback'
  );
  process.stdout.write(JSON.stringify({ ok:true, verified:['initial 502 then health passes', 'permanent non-health fails in bounded window', 'request timeout is enforced', 'public hostname rejected as origin readiness gate'] }) + '\n');
}

main().catch(error => {
  process.stderr.write(String(error.stack || error) + '\n');
  process.exitCode = 1;
});
