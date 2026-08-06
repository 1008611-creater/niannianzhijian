'use strict';

// Private website media delivery is intentionally separate from the Step01
// artifact broker. Browser grants address only verified project media; they
// cannot be used to list, copy, or access Step01 transport packages.

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const DEFAULT_TTL_SECONDS = 300;
const MAX_TTL_SECONDS = 300;

function codeError(code, message = code) { const error = new Error(message); error.code = code; return error; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function hmac(key, value, encoding) { return crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding); }
function awsDate(nowMs) { return new Date(nowMs).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }

function safeToken(value, name, pattern) {
  const normalized = String(value || '').trim();
  if (!pattern.test(normalized)) throw codeError('WEB_MEDIA_DELIVERY_BINDING_INVALID', 'invalid_' + name);
  return normalized;
}

function safeObjectKey(value) {
  const key = String(value || '').replace(/\\/g, '/');
  const parts = key.split('/');
  if (!key || key.startsWith('/') || key.includes('\0') || /^[A-Za-z]:/.test(key) || parts.some(part => !part || part === '.' || part === '..' || !/^[A-Za-z0-9._-]{1,180}$/.test(part))) throw codeError('WEB_MEDIA_DELIVERY_OBJECT_KEY_INVALID');
  return parts.join('/');
}

function configuredCosDelivery(env = process.env) {
  const value = (dedicated, generic) => String(env[dedicated] || env[generic] || '').trim();
  const endpoint = value('NIANNIAN_WEB_MEDIA_COS_ENDPOINT', 'NIANNIAN_COS_ENDPOINT');
  const bucket = value('NIANNIAN_WEB_MEDIA_COS_BUCKET', 'NIANNIAN_COS_BUCKET');
  const region = value('NIANNIAN_WEB_MEDIA_COS_REGION', 'NIANNIAN_COS_REGION');
  const secretId = value('NIANNIAN_WEB_MEDIA_COS_SECRET_ID', 'NIANNIAN_COS_SECRET_ID');
  const secretKey = value('NIANNIAN_WEB_MEDIA_COS_SECRET_KEY', 'NIANNIAN_COS_SECRET_KEY');
  if (!endpoint || !bucket || !region || !secretId || !secretKey) return {ready:false, code:'WEB_MEDIA_DELIVERY_NOT_CONFIGURED'};
  let parsed;
  try { parsed = new URL(endpoint); } catch { return {ready:false, code:'WEB_MEDIA_DELIVERY_NOT_CONFIGURED'}; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') return {ready:false, code:'WEB_MEDIA_DELIVERY_NOT_CONFIGURED'};
  if (!/^[a-z0-9][a-z0-9-]{2,95}$/.test(bucket) || !/^[a-z0-9-]{3,80}$/.test(region)) return {ready:false, code:'WEB_MEDIA_DELIVERY_NOT_CONFIGURED'};
  return {ready:true, endpoint:parsed.toString().replace(/\/$/, ''), bucket, region, secret_id:secretId, secret_key:secretKey};
}

function signUrl(config, {method, objectKey, expires = DEFAULT_TTL_SECONDS, nowMs = Date.now(), headers = {}}) {
  if (!config?.ready) throw codeError('WEB_MEDIA_DELIVERY_NOT_CONFIGURED');
  const operation = safeToken(method, 'method', /^(GET|PUT|HEAD)$/);
  const key = safeObjectKey(objectKey);
  const ttl = Math.max(30, Math.min(MAX_TTL_SECONDS, Number(expires) || DEFAULT_TTL_SECONDS));
  const amz = awsDate(nowMs), dateStamp = amz.slice(0, 8);
  const endpoint = new URL(config.endpoint + '/' + key.split('/').map(encodeURIComponent).join('/'));
  const credentialScope = dateStamp + '/' + config.region + '/s3/aws4_request';
  endpoint.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  endpoint.searchParams.set('X-Amz-Credential', config.secret_id + '/' + credentialScope);
  endpoint.searchParams.set('X-Amz-Date', amz);
  endpoint.searchParams.set('X-Amz-Expires', String(ttl));
  const canonicalHeaders = {host:endpoint.host};
  for (const [name, value] of Object.entries(headers)) canonicalHeaders[String(name).toLowerCase()] = String(value).trim().replace(/\s+/g, ' ');
  const signedNames = Object.keys(canonicalHeaders).sort();
  endpoint.searchParams.set('X-Amz-SignedHeaders', signedNames.join(';'));
  const canonicalQuery = [...endpoint.searchParams.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([name,value]) => encodeURIComponent(name) + '=' + encodeURIComponent(value)).join('&');
  const canonicalHeaderText = signedNames.map(name => name + ':' + canonicalHeaders[name] + '\n').join('');
  const canonicalRequest = [operation, endpoint.pathname, canonicalQuery, canonicalHeaderText, signedNames.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amz, credentialScope, sha256(Buffer.from(canonicalRequest, 'utf8'))].join('\n');
  const kDate = hmac('AWS4' + config.secret_key, dateStamp);
  const kRegion = hmac(kDate, config.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  endpoint.searchParams.set('X-Amz-Signature', hmac(kSigning, stringToSign, 'hex'));
  return endpoint.toString();
}

function extensionForMime(mime, localPath) {
  const known = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','video/mp4':'mp4','video/quicktime':'mov'};
  return known[String(mime || '').toLowerCase()] || String(path.extname(localPath || '')).replace(/^\./, '').toLowerCase() || 'bin';
}

async function fileEvidence(filePath) {
  const stats = await fsp.lstat(filePath).catch(() => null);
  if (!stats?.isFile() || stats.isSymbolicLink()) throw codeError('WEB_MEDIA_DELIVERY_SOURCE_INVALID');
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return {sha256:hash.digest('hex'), bytes:stats.size};
}

function objectKeyFor({projectId, category, sha256:contentSha, mime, localPath, revision = 'current'}) {
  const project = safeToken(projectId, 'project_id', /^NN-[A-Z0-9-]{10,80}$/);
  const group = safeToken(category, 'category', /^[a-z0-9-]{2,48}$/);
  const revisionToken = safeToken(revision, 'revision', /^[A-Za-z0-9._-]{1,120}$/);
  const digest = safeToken(contentSha, 'sha256', /^[a-f0-9]{64}$/);
  return 'website-media/' + project + '/' + revisionToken + '/' + group + '/' + digest + '.' + extensionForMime(mime, localPath);
}

function manifestPath(root, projectId) { return path.join(root, 'v1', 'projects', safeToken(projectId, 'project_id', /^NN-[A-Z0-9-]{10,80}$/), 'manifest.json'); }
async function readManifest(root, projectId) { return JSON.parse(await fsp.readFile(manifestPath(root, projectId), 'utf8').catch(error => error.code === 'ENOENT' ? '{"schema_version":"niannian_web_media_manifest_v1","objects":{}}' : Promise.reject(error))); }
async function writeManifest(root, projectId, value) { const target = manifestPath(root, projectId); await fsp.mkdir(path.dirname(target), {recursive:true}); const temp = target + '.tmp-' + process.pid + '-' + Date.now(); await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n', 'utf8'); await fsp.rename(temp, target); }

function mediaIdentity({category, evidence}) { return String(category) + ':' + evidence.sha256 + ':' + evidence.bytes; }

async function migrateFile({root, projectId, category, localPath, mime, revision, config = configuredCosDelivery(), fetchImpl = globalThis.fetch}) {
  if (!config.ready) throw codeError('WEB_MEDIA_DELIVERY_NOT_CONFIGURED');
  if (typeof fetchImpl !== 'function') throw codeError('WEB_MEDIA_DELIVERY_FETCH_UNAVAILABLE');
  const evidence = await fileEvidence(localPath);
  const objectKey = objectKeyFor({projectId, category, sha256:evidence.sha256, mime, localPath, revision});
  const identity = mediaIdentity({category, evidence});
  const manifest = await readManifest(root, projectId);
  const existing = manifest.objects?.[identity];
  if (existing?.object_key === objectKey && existing?.sha256 === evidence.sha256 && Number(existing?.bytes) === evidence.bytes && existing?.mime === mime && existing?.status === 'verified') return existing;
  const putHeaders = {'content-type':mime, 'x-cos-meta-niannian-sha256':evidence.sha256, 'x-cos-meta-niannian-bytes':String(evidence.bytes)};
  const putUrl = signUrl(config, {method:'PUT', objectKey, headers:putHeaders});
  const uploaded = await fetchImpl(putUrl, {method:'PUT', headers:putHeaders, body:fs.createReadStream(localPath), duplex:'half', redirect:'error'}).catch(() => null);
  if (!uploaded?.ok) throw codeError('WEB_MEDIA_DELIVERY_UPLOAD_FAILED');
  const headHeaders = {};
  const headUrl = signUrl(config, {method:'HEAD', objectKey, headers:headHeaders});
  const head = await fetchImpl(headUrl, {method:'HEAD', redirect:'error'}).catch(() => null);
  if (!head?.ok || Number(head.headers.get('content-length')) !== evidence.bytes || String(head.headers.get('content-type') || '').split(';')[0] !== mime) throw codeError('WEB_MEDIA_DELIVERY_READBACK_FAILED');
  const remoteSha = head.headers.get('x-cos-meta-niannian-sha256');
  const remoteBytes = head.headers.get('x-cos-meta-niannian-bytes');
  if (remoteSha || remoteBytes) {
    if (remoteSha !== evidence.sha256 || Number(remoteBytes) !== evidence.bytes) throw codeError('WEB_MEDIA_DELIVERY_READBACK_FAILED');
  } else {
    // Some COS-compatible endpoints omit user metadata on HEAD. Verify the
    // uploaded object itself before accepting it into the browser manifest.
    const getUrl = signUrl(config, {method:'GET', objectKey});
    const get = await fetchImpl(getUrl, {method:'GET', redirect:'error'}).catch(() => null);
    if (!get?.ok || !get.body) throw codeError('WEB_MEDIA_DELIVERY_READBACK_FAILED');
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    for await (const chunk of get.body) { bytes += chunk.length; hash.update(chunk); }
    if (bytes !== evidence.bytes || hash.digest('hex') !== evidence.sha256) throw codeError('WEB_MEDIA_DELIVERY_READBACK_FAILED');
  }
  const record = {object_key:objectKey, sha256:evidence.sha256, bytes:evidence.bytes, mime, category, revision:String(revision || 'current'), status:'verified', verified_at:new Date().toISOString()};
  manifest.schema_version = 'niannian_web_media_manifest_v1'; manifest.project_id = projectId; manifest.objects = {...(manifest.objects || {}), [identity]:record};
  await writeManifest(root, projectId, manifest);
  return record;
}

async function redirectForVerifiedFile({root, projectId, category, localPath, mime, revision, config = configuredCosDelivery()}) {
  if (!config.ready) return null;
  const evidence = await fileEvidence(localPath);
  const manifest = await readManifest(root, projectId);
  const record = manifest.objects?.[mediaIdentity({category, evidence})] || Object.values(manifest.objects || {}).find(item => item && item.status === 'verified' && item.sha256 === evidence.sha256 && Number(item.bytes) === evidence.bytes && item.mime === mime && item.revision === String(revision || 'current'));
  if (!record || record.status !== 'verified' || record.sha256 !== evidence.sha256 || Number(record.bytes) !== evidence.bytes || record.mime !== mime || record.revision !== String(revision || 'current')) return null;
  return {url:signUrl(config, {method:'GET', objectKey:record.object_key}), record};
}

module.exports = {DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS, codeError, configuredCosDelivery, fileEvidence, migrateFile, objectKeyFor, redirectForVerifiedFile, signUrl};
