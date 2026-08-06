const crypto = require('crypto');
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

function expectedSha256(value) {
  if (!/^[a-f0-9]{64}$/i.test(String(value || ''))) fail('expected_sha256_invalid');
  return String(value).toLowerCase();
}

function fetchStaticResponse(urlText, options) {
  const connectTimeoutMs = positiveInteger(options.connectTimeoutMs, 'connect_timeout_ms');
  const requestTimeoutMs = positiveInteger(options.requestTimeoutMs, 'request_timeout_ms');
  const maxBytes = positiveInteger(options.maxBytes, 'max_bytes');
  const url = new URL(urlText);
  const client = url.protocol === 'https:' ? https : url.protocol === 'http:' ? http : null;
  if (!client) fail('static_probe_protocol_invalid');

  return new Promise(resolve => {
    let settled = false;
    let connectTimer = null;
    let requestTimer = null;
    const finish = result => {
      if (settled) return;
      settled = true;
      if (connectTimer) clearTimeout(connectTimer);
      if (requestTimer) clearTimeout(requestTimer);
      resolve(result);
    };
    const request = client.request(url, { method:'GET' }, response => {
      let bytes = 0;
      const chunks = [];
      response.on('error', error => finish({ ok:false, statusCode:response.statusCode || 0, bytes, body:null, error:error.code || 'response_error' }));
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          request.destroy(Object.assign(new Error('static_response_too_large'), { code:'static_response_too_large' }));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => finish({
        ok:response.statusCode === 200,
        statusCode:response.statusCode || 0,
        bytes,
        body:Buffer.concat(chunks),
        error:null
      }));
    });
    connectTimer = setTimeout(() => request.destroy(Object.assign(new Error('connect_timeout'), { code:'connect_timeout' })), connectTimeoutMs);
    requestTimer = setTimeout(() => request.destroy(Object.assign(new Error('request_timeout'), { code:'request_timeout' })), requestTimeoutMs);
    request.on('socket', socket => {
      if (!socket.connecting) clearTimeout(connectTimer);
      else socket.once('connect', () => clearTimeout(connectTimer));
    });
    request.on('error', error => finish({ ok:false, statusCode:0, bytes:0, body:null, error:error.code || 'request_error' }));
    request.end();
  });
}

async function fetchStaticSha256(urlText, options) {
  const response = await fetchStaticResponse(urlText, options);
  return {
    ok:response.ok,
    statusCode:response.statusCode,
    bytes:response.bytes,
    sha256:response.body ? crypto.createHash('sha256').update(response.body).digest('hex') : null,
    error:response.error
  };
}

async function verifyStaticSha256(urlText, expected, options) {
  const result = await fetchStaticSha256(urlText, options);
  return { ...result, ok:result.ok && result.sha256 === expectedSha256(expected) };
}

function removeKnownCloudflareBeacon(body) {
  if (!Buffer.isBuffer(body)) return null;
  const html = body.toString('utf8');
  if (!body.equals(Buffer.from(html, 'utf8'))) return null;

  // Cloudflare replaces the original body-tag indentation while inserting this one standard telemetry beacon.
  const beacon = /\n([ \t]*)<script defer src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js\/v[a-z0-9]+" integrity="sha512-[A-Za-z0-9+/]+={0,2}" data-cf-beacon='(?:[^'\\]|\\.)*' crossorigin="anonymous"><\/script>\n[ \t]*<\/body>/g;
  const matches = [...html.matchAll(beacon)];
  if (matches.length !== 1) return null;
  return Buffer.from(html.replace(beacon, (_, indentation) => '\n' + indentation + '</body>'), 'utf8');
}

async function verifyPublicHtmlSha256(urlText, expected, options) {
  const response = await fetchStaticResponse(urlText, options);
  const rawSha256 = response.body ? crypto.createHash('sha256').update(response.body).digest('hex') : null;
  const expectedHash = expectedSha256(expected);
  if (!response.ok || !response.body) {
    return { ok:false, statusCode:response.statusCode, bytes:response.bytes, sha256:rawSha256, normalizedSha256:null, normalization:null, error:response.error };
  }
  if (rawSha256 === expectedHash) {
    return { ok:true, statusCode:response.statusCode, bytes:response.bytes, sha256:rawSha256, normalizedSha256:rawSha256, normalization:null, error:null };
  }
  const normalized = removeKnownCloudflareBeacon(response.body);
  const normalizedSha256 = normalized ? crypto.createHash('sha256').update(normalized).digest('hex') : null;
  return {
    ok:normalizedSha256 === expectedHash,
    statusCode:response.statusCode,
    bytes:response.bytes,
    sha256:rawSha256,
    normalizedSha256,
    normalization:normalized ? 'cloudflare_standard_beacon_before_body' : null,
    error:null
  };
}

module.exports = { fetchStaticSha256, verifyStaticSha256, verifyPublicHtmlSha256, removeKnownCloudflareBeacon };
