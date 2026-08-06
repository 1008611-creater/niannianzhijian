const http = require('http');
const https = require('https');

function fail(message) {
  const error = new Error(message);
  error.code = message;
  throw error;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(label + '_invalid');
  return value;
}

function loopbackOrigin(urlText) {
  const url = new URL(urlText);
  if (!['127.0.0.1', '::1', 'localhost'].includes(url.hostname)) fail('origin_host_not_loopback');
  return url;
}

function probeJson(urlText, options) {
  const connectTimeoutMs = positiveInteger(options.connectTimeoutMs, 'connect_timeout_ms');
  const requestTimeoutMs = positiveInteger(options.requestTimeoutMs, 'request_timeout_ms');
  const url = new URL(urlText);
  const client = url.protocol === 'https:' ? https : url.protocol === 'http:' ? http : null;
  if (!client) fail('probe_protocol_invalid');

  return new Promise(resolve => {
    const startedAt = Date.now();
    let settled = false;
    let connectTimer = null;
    let requestTimer = null;
    const finish = result => {
      if (settled) return;
      settled = true;
      if (connectTimer) clearTimeout(connectTimer);
      if (requestTimer) clearTimeout(requestTimer);
      resolve({ ...result, durationMs:Date.now() - startedAt });
    };
    const request = client.request(url, { method:'GET', headers:{ accept:'application/json' } }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) request.destroy(Object.assign(new Error('response_too_large'), { code:'response_too_large' }));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(body); } catch {}
        finish({ ok:response.statusCode === 200 && json?.ok === true, statusCode:response.statusCode || 0, json, error:null });
      });
    });
    connectTimer = setTimeout(() => request.destroy(Object.assign(new Error('connect_timeout'), { code:'connect_timeout' })), connectTimeoutMs);
    requestTimer = setTimeout(() => request.destroy(Object.assign(new Error('request_timeout'), { code:'request_timeout' })), requestTimeoutMs);
    request.on('socket', socket => {
      if (!socket.connecting) clearTimeout(connectTimer);
      else socket.once('connect', () => clearTimeout(connectTimer));
    });
    request.on('error', error => finish({ ok:false, statusCode:0, json:null, error:error.code || 'request_error' }));
    request.end();
  });
}

async function waitForOriginReadiness(options) {
  const originUrl = loopbackOrigin(options.originUrl);
  const totalWindowMs = positiveInteger(options.totalWindowMs, 'total_window_ms');
  const intervalMs = positiveInteger(options.intervalMs, 'interval_ms');
  const connectTimeoutMs = positiveInteger(options.connectTimeoutMs, 'connect_timeout_ms');
  const requestTimeoutMs = positiveInteger(options.requestTimeoutMs, 'request_timeout_ms');
  if (connectTimeoutMs > requestTimeoutMs || requestTimeoutMs > totalWindowMs) fail('readiness_timeout_contract_invalid');

  const sleep = options.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const probe = options.probe || probeJson;
  const startedAt = Date.now();
  const deadline = startedAt + totalWindowMs;
  const attempts = [];
  while (Date.now() < deadline) {
    const remainingMs = deadline - Date.now();
    const result = await probe(originUrl.toString(), {
      connectTimeoutMs:Math.min(connectTimeoutMs, remainingMs),
      requestTimeoutMs:Math.min(requestTimeoutMs, remainingMs)
    });
    attempts.push({ statusCode:result.statusCode, error:result.error, durationMs:result.durationMs });
    if (result.ok) return { ok:true, originUrl:originUrl.toString(), attempts, elapsedMs:Date.now() - startedAt };
    const pauseMs = Math.min(intervalMs, Math.max(0, deadline - Date.now()));
    if (pauseMs > 0) await sleep(pauseMs);
  }
  const error = new Error('origin_readiness_window_elapsed');
  error.code = 'origin_readiness_window_elapsed';
  error.attempts = attempts;
  error.elapsedMs = Date.now() - startedAt;
  throw error;
}

module.exports = { probeJson, waitForOriginReadiness };
