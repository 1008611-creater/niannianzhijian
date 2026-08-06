'use strict';

// Step01 artifact transport deliberately has no relationship to the SSH
// control relay. Windows signs exact object operations; Mac only consumes a
// short-lived grant and never receives a bucket credential.

const crypto = require('crypto');

const DEFAULT_TTL_SECONDS = 10 * 60;
const MAX_TTL_SECONDS = 15 * 60;
const PROBE_BYTES = Buffer.from('niannian-step01-artifact-broker-probe-v1\n', 'utf8');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
const BROWSER_AUTHORITY_IMPORT_PROTOCOL = 'niannian.step01_authority_import.browser_direct_put.v1';
const BROWSER_AUTHORITY_IMPORT_PROTOCOL_SHA256 = sha256(Buffer.from(BROWSER_AUTHORITY_IMPORT_PROTOCOL, 'utf8'));
function nowIso(nowMs = Date.now()) { return new Date(nowMs).toISOString(); }

function codeError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function exactToken(value, name, pattern) {
  const normalized = String(value || '').trim();
  if (!pattern.test(normalized)) throw codeError('ARTIFACT_BROKER_BINDING_INVALID', 'invalid_' + name);
  return normalized;
}

function exactSha(value, name = 'sha256') {
  return exactToken(value, name, /^[a-f0-9]{64}$/);
}

function safeRelativePath(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0') || /^[A-Za-z]:/.test(normalized) || parts.some(part => !part || part === '.' || part === '..' || !/^[A-Za-z0-9._-]{1,180}$/.test(part))) {
    throw codeError('ARTIFACT_BROKER_OBJECT_KEY_INVALID', 'invalid_relative_path');
  }
  return parts.join('/');
}

function phaseBinding(input = {}) {
  return {
    project_id: exactToken(input.project_id, 'project_id', /^NN-[A-Z0-9-]{10,80}$/),
    analysis_run_id: exactToken(input.analysis_run_id, 'analysis_run_id', /^analysis-[A-Za-z0-9-]{8,100}$/),
    phase_key: exactToken(input.phase_key, 'phase_key', /^step01phase-[a-f0-9]{64}$/),
    package_manifest_sha256: exactSha(input.package_manifest_sha256, 'package_manifest_sha256')
  };
}

function returnBinding(input = {}) {
  return {
    ...phaseBinding(input),
    request_id: exactToken(input.request_id, 'request_id', /^[A-Za-z0-9._-]{8,96}$/)
  };
}

function artifactRole(value) { return exactToken(value, 'artifact_role', /^[A-Za-z0-9._-]{1,180}$/); }

function packagePrefix(input) {
  const binding = phaseBinding(input);
  // Object addresses are the public transport contract. The manifest and
  // request bindings remain mandatory grant claims, but must not create a
  // second address for the same phase artifact.
  return 'phase-packages/' + binding.project_id + '/' + binding.analysis_run_id + '/' + binding.phase_key;
}

function returnPrefix(input) {
  const binding = returnBinding(input);
  return 'returns/' + binding.project_id + '/' + binding.analysis_run_id + '/' + binding.phase_key;
}

function deliveryPrefix(input = {}) {
  const projectId = exactToken(input.project_id, 'project_id', /^NN-[A-Z0-9-]{10,80}$/);
  const analysisRunId = exactToken(input.analysis_run_id, 'analysis_run_id', /^analysis-[A-Za-z0-9-]{8,100}$/);
  return 'delivery/' + projectId + '/' + analysisRunId + '/step01-evidence';
}

function packageObjectKey(input, role, sha) { return packagePrefix(input) + '/' + artifactRole(role) + '/' + exactSha(sha); }
function returnObjectKey(input, role, sha) { return returnPrefix(input) + '/' + artifactRole(role) + '/' + exactSha(sha); }
function deliveryObjectKey(input, sha) { return deliveryPrefix(input) + '/' + exactSha(sha); }

function redactedGrant(grant) {
  return {
    schema_version: 'niannian_step01_artifact_grant_receipt_v1',
    grant_id: grant.grant_id,
    operation: grant.operation,
    object_key: grant.object_key,
    sha256: grant.sha256,
    bytes: grant.bytes,
    project_id: grant.binding.project_id,
    analysis_run_id: grant.binding.analysis_run_id,
    phase_key: grant.binding.phase_key,
    request_id: grant.binding.request_id || null,
    expires_at: grant.expires_at
  };
}

function sanitizeDiagnostic(error, stage) {
  const raw = String(error && (error.code || error.message) || 'ARTIFACT_BROKER_UNKNOWN');
  const redacted = raw
    .replace(/https?:\/\/[^\s"']+/gi, '[redacted-url]')
    .replace(/authorization\s*:\s*bearer\s+[^\s,;]+/gi, '[redacted-secret]')
    .replace(/bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, '[redacted-secret]')
    .replace(/(?:secret|token|password|authorization|signature)=?[^\s,;]+/gi, '[redacted-secret]')
    .slice(0, 240);
  const providerCode=String(error?.provider_code||'');
  return {
    stage:String(stage || 'unknown').slice(0,80),
    code:raw.match(/^[A-Z0-9_]+$/) ? raw : 'ARTIFACT_BROKER_OPERATION_FAILED',
    http_status:Number.isInteger(error?.http_status)?error.http_status:null,
    provider_code:/^[A-Za-z0-9._-]{1,80}$/.test(providerCode)?providerCode:null,
    provider_request_id_sha256:/^[a-f0-9]{64}$/.test(String(error?.provider_request_id_sha256||''))?error.provider_request_id_sha256:null,
    provider_body_sha256:/^[a-f0-9]{64}$/.test(String(error?.provider_body_sha256||''))?error.provider_body_sha256:null,
    provider_body_bytes:Number.isSafeInteger(error?.provider_body_bytes)?error.provider_body_bytes:null,
    diagnostic_sha256:sha256(Buffer.from(redacted, 'utf8')),
    diagnostic_bytes:Buffer.byteLength(redacted, 'utf8'),
    secret_redacted:true
  };
}

function configuredCosBroker(env = process.env, options = {}) {
  const browserAuthorityImport = options?.purpose === 'browser_authority_import';
  const transport = String(env.NIANNIAN_STEP01_ARTIFACT_TRANSPORT || 'cos').trim().toLowerCase();
  if (transport !== 'cos') return {ready:false, code:'ARTIFACT_BROKER_NOT_CONFIGURED', reason:'transport_must_be_cos', transport};
  const value = (primary, fallback) => String(env[primary] || (browserAuthorityImport ? env[fallback] : '') || '').trim();
  const endpoint = value('NIANNIAN_COS_ENDPOINT', 'NIANNIAN_WEB_MEDIA_COS_ENDPOINT');
  const bucket = value('NIANNIAN_COS_BUCKET', 'NIANNIAN_WEB_MEDIA_COS_BUCKET');
  const region = value('NIANNIAN_COS_REGION', 'NIANNIAN_WEB_MEDIA_COS_REGION');
  const secretId = value('NIANNIAN_COS_SECRET_ID', 'NIANNIAN_WEB_MEDIA_COS_SECRET_ID');
  const secretKey = value('NIANNIAN_COS_SECRET_KEY', 'NIANNIAN_WEB_MEDIA_COS_SECRET_KEY');
  if (!endpoint || !bucket || !region || !secretId || !secretKey) return {ready:false, code:'ARTIFACT_BROKER_NOT_CONFIGURED', reason:'cos_configuration_missing', transport:'cos'};
  let parsed;
  try { parsed = new URL(endpoint); } catch { return {ready:false, code:'ARTIFACT_BROKER_NOT_CONFIGURED', reason:'cos_endpoint_invalid', transport:'cos'}; }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') return {ready:false, code:'ARTIFACT_BROKER_NOT_CONFIGURED', reason:'cos_endpoint_invalid', transport:'cos'};
  if (!/^[a-z0-9][a-z0-9-]{2,95}$/.test(bucket) || !/^[a-z0-9-]{3,80}$/.test(region)) return {ready:false, code:'ARTIFACT_BROKER_NOT_CONFIGURED', reason:'cos_bucket_or_region_invalid', transport:'cos'};
  if (browserAuthorityImport) return {ready:true, transport:'cos', endpoint:parsed.toString().replace(/\/$/, ''), bucket, region, secret_id:secretId, secret_key:secretKey, grant_protocol_version:BROWSER_AUTHORITY_IMPORT_PROTOCOL, grant_protocol_readback_sha256:BROWSER_AUTHORITY_IMPORT_PROTOCOL_SHA256};
  const grantProtocolVersion=String(env.NIANNIAN_STEP01_COS_GRANT_PROTOCOL_VERSION||'').trim();
  if(grantProtocolVersion!=='v1')return {ready:false,code:'ARTIFACT_BROKER_NOT_CONFIGURED',reason:'mac_grant_protocol_not_installed',transport:'cos'};
  const grantProtocolReadbackSha=String(env.NIANNIAN_STEP01_COS_GRANT_PROTOCOL_READBACK_SHA256||'').trim().toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(grantProtocolReadbackSha))return {ready:false,code:'ARTIFACT_BROKER_NOT_CONFIGURED',reason:'mac_grant_protocol_readback_missing',transport:'cos'};
  return {ready:true, transport:'cos', endpoint:parsed.toString().replace(/\/$/, ''), bucket, region, secret_id:secretId, secret_key:secretKey, grant_protocol_version:grantProtocolVersion, grant_protocol_readback_sha256:grantProtocolReadbackSha};
}

function brokerReadiness(env = process.env) {
  const config = configuredCosBroker(env);
  return {
    ready:config.ready === true,
    transport:config.transport || 'cos',
    code:config.ready === true ? null : (config.code || 'ARTIFACT_BROKER_NOT_CONFIGURED'),
    reason:config.ready === true ? null : (config.reason || 'cos_configuration_missing'),
    provider:config.ready === true ? 'tencent-cos' : null,
    bucket_configured:config.ready === true,
    credentials_present:config.ready === true,
    endpoint_configured:config.ready === true,
    mac_grant_protocol_ready:config.ready === true,
    mac_grant_protocol_readback_sha256:config.ready === true ? config.grant_protocol_readback_sha256 : null,
    checked_at:nowIso()
  };
}

function hmac(key, value, encoding) { return crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding); }
function awsDate(nowMs) { return new Date(nowMs).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }

// COS exposes an S3-compatible API. This signer is intentionally limited to
// one exact object key and GET/PUT. It never signs List/Delete/Copy requests.
function presignCosObject(config, input = {}) {
  if (!config || config.ready !== true) throw codeError('ARTIFACT_BROKER_NOT_CONFIGURED');
  const operation = exactToken(input.operation, 'operation', /^(GET|PUT)$/);
  const objectKey = safeRelativePath(input.object_key);
  const binding = input.binding && input.binding.request_id ? returnBinding(input.binding) : phaseBinding(input.binding);
  const sha = exactSha(input.sha256, 'object_sha256');
  const expectedPrefix = binding.request_id ? returnPrefix(binding) + '/' : packagePrefix(binding) + '/';
  if (!objectKey.startsWith(expectedPrefix) || !objectKey.endsWith('/' + sha)) throw codeError('ARTIFACT_BROKER_OBJECT_KEY_INVALID', 'object_key_outside_binding');
  const bytes = Number(input.bytes);
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 2 * 1024 * 1024 * 1024) throw codeError('ARTIFACT_BROKER_BINDING_INVALID', 'invalid_object_bytes');
  const expires = Math.max(30, Math.min(MAX_TTL_SECONDS, Number(input.ttl_seconds || DEFAULT_TTL_SECONDS)));
  const nowMs = Number(input.now_ms || Date.now());
  const amz = awsDate(nowMs);
  const dateStamp = amz.slice(0, 8);
  const endpoint = new URL(config.endpoint + '/' + objectKey.split('/').map(encodeURIComponent).join('/'));
  const credentialScope = dateStamp + '/' + config.region + '/s3/aws4_request';
  endpoint.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  endpoint.searchParams.set('X-Amz-Credential', config.secret_id + '/' + credentialScope);
  endpoint.searchParams.set('X-Amz-Date', amz);
  endpoint.searchParams.set('X-Amz-Expires', String(expires));
  endpoint.searchParams.set('X-Amz-SignedHeaders', 'host');
  endpoint.searchParams.set('x-niannian-sha256', sha);
  endpoint.searchParams.set('x-niannian-bytes', String(bytes));
  const canonicalQuery = [...endpoint.searchParams.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([key,value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&');
  const canonicalRequest = [operation, endpoint.pathname, canonicalQuery, 'host:' + endpoint.host + '\n', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amz, credentialScope, sha256(Buffer.from(canonicalRequest, 'utf8'))].join('\n');
  const kDate = hmac('AWS4' + config.secret_key, dateStamp);
  const kRegion = hmac(kDate, config.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  endpoint.searchParams.set('X-Amz-Signature', hmac(kSigning, stringToSign, 'hex'));
  const grantId = 'grant-' + sha256(Buffer.from([operation, objectKey, sha, String(bytes), amz].join('|'), 'utf8')).slice(0, 32);
  return {grant_id:grantId, operation, object_key:objectKey, sha256:sha, bytes, binding, expires_at:nowIso(nowMs + expires * 1000), url:endpoint.toString()};
}

async function transferWithRetries(operation, options = {}) {
  const attempts = Math.max(1, Math.min(3, Number(options.attempts || 3)));
  const execute = options.execute;
  if (typeof execute !== 'function') throw codeError('ARTIFACT_BROKER_OPERATION_FAILED', 'transfer_execute_missing');
  let failure;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await execute(attempt);
      return Buffer.isBuffer(result) ? result : (result && typeof result === 'object' ? {...result, attempt} : result);
    }
    catch (error) { failure = error; if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 50 * attempt)); }
  }
  failure.attempts = attempts;
  throw failure;
}

function createMemoryBroker(options = {}) {
  const grants = new Map();
  const objects = new Map();
  const now = options.now || (() => Date.now());
  function issue(input) {
    const operation = exactToken(input.operation, 'operation', /^(GET|PUT)$/);
    const binding = input.binding && input.binding.request_id ? returnBinding(input.binding) : phaseBinding(input.binding);
    const key = safeRelativePath(input.object_key);
    const prefix = binding.request_id ? returnPrefix(binding) + '/' : packagePrefix(binding) + '/';
    if (!key.startsWith(prefix) || !key.endsWith('/' + exactSha(input.sha256))) throw codeError('ARTIFACT_BROKER_OBJECT_KEY_INVALID');
    const bytes = Number(input.bytes);
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw codeError('ARTIFACT_BROKER_BINDING_INVALID');
    const grant = {grant_id:'grant-'+crypto.randomBytes(16).toString('hex'),operation,object_key:key,sha256:exactSha(input.sha256),bytes,binding,expires_at:nowIso(now() + Math.max(30, Math.min(MAX_TTL_SECONDS, Number(input.ttl_seconds || DEFAULT_TTL_SECONDS))) * 1000),url:'memory://artifact/' + crypto.randomBytes(16).toString('hex')};
    grants.set(grant.url, grant);
    return grant;
  }
  function requireGrant(url, operation) {
    const grant = grants.get(String(url));
    if (!grant || grant.operation !== operation || Date.parse(grant.expires_at) < now()) throw codeError('ARTIFACT_BROKER_GRANT_REJECTED');
    return grant;
  }
  return {
    kind:'memory-cos-compatible',
    issue,
    receipt: redactedGrant,
    async put(url, value) {
      const grant = requireGrant(url, 'PUT');
      const body = Buffer.from(value);
      if (body.length !== grant.bytes || sha256(body) !== grant.sha256) throw codeError('ARTIFACT_RETURN_UPLOAD_FAILED', 'upload_hash_or_bytes_mismatch');
      if (objects.has(grant.object_key)) throw codeError('ARTIFACT_RETURN_UPLOAD_FAILED', 'object_already_exists');
      objects.set(grant.object_key, body);
      return {object_key:grant.object_key,sha256:grant.sha256,bytes:grant.bytes};
    },
    async get(url) {
      const grant = requireGrant(url, 'GET');
      const body = objects.get(grant.object_key);
      if (!body) throw codeError('ARTIFACT_PACKAGE_DOWNLOAD_FAILED', 'object_missing');
      if (body.length !== grant.bytes || sha256(body) !== grant.sha256) throw codeError('ARTIFACT_PACKAGE_SHA_MISMATCH');
      return Buffer.from(body);
    },
    has(key) { return objects.has(key); }
  };
}

function createGrantHttpClient(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw codeError('ARTIFACT_BROKER_NOT_CONFIGURED', 'fetch_unavailable');
  async function request(url, init, failureCode) {
    let response;
    try { response = await fetchImpl(url, init); }
    catch (error) { const failure=codeError(failureCode); failure.cause=error; throw failure; }
    if (!response) throw codeError(failureCode);
    const body=Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
      const failure=codeError(failureCode);
      const providerCode=(body.toString('utf8').match(/<Code>([A-Za-z0-9._-]{1,80})<\/Code>/)||[])[1]||'';
      const requestId=String(response.headers?.get?.('x-cos-request-id')||'');
      failure.http_status=Number(response.status);
      failure.provider_code=providerCode;
      failure.provider_request_id_sha256=requestId?sha256(Buffer.from(requestId,'utf8')):null;
      failure.provider_body_sha256=sha256(body);
      failure.provider_body_bytes=body.length;
      throw failure;
    }
    return body;
  }
  return {
    async get(url) { return request(url, {method:'GET',redirect:'error'}, 'ARTIFACT_PACKAGE_DOWNLOAD_FAILED'); },
    async put(url, value) { await request(url, {method:'PUT',body:Buffer.from(value),redirect:'error'}, 'ARTIFACT_RETURN_UPLOAD_FAILED'); return {uploaded:true}; }
  };
}

function createCosBroker(config, fetchImpl = globalThis.fetch) {
  if (!config || config.ready !== true) throw codeError('ARTIFACT_BROKER_NOT_CONFIGURED');
  const http=createGrantHttpClient(fetchImpl);
  return {
    kind:'tencent-cos-s3-compatible',
    issue(input) { return presignCosObject(config,input); },
    get:url=>http.get(url),
    put:(url,value)=>http.put(url,value),
    receipt:redactedGrant
  };
}

async function publishExactArtifacts(broker, binding, artifacts, options = {}) {
  if (!broker || typeof broker.issue !== 'function' || typeof broker.put !== 'function') throw codeError('ARTIFACT_BROKER_NOT_CONFIGURED');
  if (!Array.isArray(artifacts) || !artifacts.length) throw codeError('ARTIFACT_BROKER_BINDING_INVALID', 'artifact_list_required');
  const operation = exactToken(options.operation || 'PUT', 'operation', /^PUT$/);
  const returnArtifacts = options.return_artifacts === true;
  const normalizedBinding = returnArtifacts ? returnBinding(binding) : phaseBinding(binding);
  const seen = new Set();
  const published = [];
  for (const item of artifacts) {
    const role = artifactRole(item?.role);
    const body = Buffer.from(item?.body || []);
    const evidence = {sha256:exactSha(item?.sha256 || sha256(body)),bytes:Number(item?.bytes ?? body.length)};
    if (body.length !== evidence.bytes || sha256(body) !== evidence.sha256) throw codeError('ARTIFACT_BROKER_BINDING_INVALID', 'artifact_body_evidence_mismatch');
    const objectKey = returnArtifacts ? returnObjectKey(normalizedBinding, role, evidence.sha256) : packageObjectKey(normalizedBinding, role, evidence.sha256);
    if (seen.has(objectKey)) throw codeError('ARTIFACT_BROKER_BINDING_INVALID', 'duplicate_artifact_object');
    seen.add(objectKey);
    const grant = broker.issue({operation,object_key:objectKey,sha256:evidence.sha256,bytes:evidence.bytes,binding:normalizedBinding,ttl_seconds:options.ttl_seconds});
    await transferWithRetries('artifact_publish',{attempts:options.attempts || 3,execute:() => broker.put(grant.url,body)});
    published.push({role,object_key:objectKey,sha256:evidence.sha256,bytes:evidence.bytes,grant:broker.receipt(grant)});
  }
  return {schema_version:'niannian_step01_artifact_publication_v1',binding:normalizedBinding,operation,published_at:nowIso(),artifacts:published};
}

async function runSyntheticProbe(broker, binding, options = {}) {
  if (!broker || typeof broker.issue !== 'function' || typeof broker.put !== 'function' || typeof broker.get !== 'function') throw codeError('ARTIFACT_BROKER_NOT_CONFIGURED');
  const probeBinding = {...phaseBinding(binding), request_id:exactToken(options.request_id || ('probe-' + crypto.randomBytes(12).toString('hex')), 'request_id', /^[A-Za-z0-9._-]{8,96}$/)};
  const sha = sha256(PROBE_BYTES);
  const objectKey = returnObjectKey(probeBinding, 'synthetic-probe', sha);
  const putGrant = broker.issue({operation:'PUT',object_key:objectKey,sha256:sha,bytes:PROBE_BYTES.length,binding:probeBinding,ttl_seconds:60});
  await transferWithRetries('probe_upload',{attempts:2,execute:() => broker.put(putGrant.url, PROBE_BYTES)});
  const getGrant = broker.issue({operation:'GET',object_key:objectKey,sha256:sha,bytes:PROBE_BYTES.length,binding:probeBinding,ttl_seconds:60});
  const received = await transferWithRetries('probe_download',{attempts:2,execute:() => broker.get(getGrant.url)});
  if (!Buffer.isBuffer(received) || received.length !== PROBE_BYTES.length || sha256(received) !== sha) throw codeError('ARTIFACT_PACKAGE_SHA_MISMATCH');
  return {schema_version:'niannian_step01_artifact_broker_probe_v1',status:'ready',read_only_project_media:true,provider_requested:false,project_media_processed:false,request_id:probeBinding.request_id,object_key:objectKey,sha256:sha,bytes:PROBE_BYTES.length,put_grant:redactedGrant(putGrant),get_grant:redactedGrant(getGrant),checked_at:nowIso()};
}

module.exports = {BROWSER_AUTHORITY_IMPORT_PROTOCOL,BROWSER_AUTHORITY_IMPORT_PROTOCOL_SHA256,DEFAULT_TTL_SECONDS,MAX_TTL_SECONDS,PROBE_BYTES,artifactRole,brokerReadiness,codeError,configuredCosBroker,createCosBroker,createGrantHttpClient,createMemoryBroker,deliveryObjectKey,deliveryPrefix,exactSha,packageObjectKey,packagePrefix,phaseBinding,presignCosObject,publishExactArtifacts,redactedGrant,returnBinding,returnObjectKey,returnPrefix,runSyntheticProbe,safeRelativePath,sanitizeDiagnostic,sha256,transferWithRetries};
