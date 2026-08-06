'use strict';

const crypto = require('crypto');
const broker = require('./niannian_step01_artifact_broker');

const SESSION_SCHEMA = 'niannian_step01_artifact_broker_session_v1';
const RETURN_MANIFEST_SCHEMA = 'niannian_redraw_step01_mac_phase_return_v1';
const MAX_SESSION_MS = 15 * 60 * 1000;

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function codeError(code) { const error = new Error(code); error.code = code; return error; }
function nowIso(now = Date.now()) { return new Date(now).toISOString(); }
function exactBytes(value) { const bytes = Number(value); if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 2 * 1024 * 1024 * 1024) throw codeError('ARTIFACT_BROKER_RETURN_MANIFEST_INVALID'); return bytes; }

function manifestFiles(manifest) {
  if (!manifest || manifest.schema_version !== RETURN_MANIFEST_SCHEMA || !Array.isArray(manifest.files) || !manifest.files.length) throw codeError('ARTIFACT_BROKER_RETURN_MANIFEST_INVALID');
  const seen = new Set();
  return manifest.files.map(file => {
    const relativePath = broker.safeRelativePath(file.relative_path);
    const sha = broker.exactSha(file.sha256);
    const bytes = exactBytes(file.bytes);
    if (seen.has(relativePath)) throw codeError('ARTIFACT_BROKER_RETURN_MANIFEST_INVALID');
    seen.add(relativePath);
    // Keep the role identical to the transport module's deterministic object
    // address. The path itself never becomes a bucket key segment.
    const role = 'artifact-' + sha256(Buffer.from(relativePath, 'utf8')).slice(0, 24);
    return {relative_path:relativePath,role,sha256:sha,bytes};
  });
}

function createSessionStore(options = {}) {
  const sessions = new Map();
  const now = options.now || (() => Date.now());
  const ttlMs = Math.max(30 * 1000, Math.min(MAX_SESSION_MS, Number(options.ttl_ms || MAX_SESSION_MS)));
  const random = options.randomBytes || crypto.randomBytes;
  const brokerFactory = options.brokerFactory;
  if (typeof brokerFactory !== 'function') throw codeError('ARTIFACT_BROKER_NOT_CONFIGURED');

  function create(input = {}) {
    const binding = broker.phaseBinding(input.binding);
    const requestId = String(input.request_id || '');
    if (!/^[A-Za-z0-9._-]{8,96}$/.test(requestId)) throw codeError('ARTIFACT_BROKER_BINDING_INVALID');
    const sessionId = 'broker-' + random(16).toString('hex');
    const token = random(32).toString('base64url');
    const createdAt = now();
    const session = {schema_version:SESSION_SCHEMA,session_id:sessionId,request_id:requestId,token_sha256:sha256(token),binding,created_at:nowIso(createdAt),expires_at:nowIso(createdAt + ttlMs),package_grants:Array.isArray(input.package_grants) ? input.package_grants.map(broker.redactedGrant) : [],return_manifest:null,return_manifest_grant:null,return_grants:[]};
    sessions.set(sessionId, session);
    return {session:{...session},token};
  }

  function authorize(sessionId, token) {
    const session = sessions.get(String(sessionId));
    if (!session || Date.parse(session.expires_at) <= now()) throw codeError('ARTIFACT_BROKER_SESSION_REJECTED');
    const received = Buffer.from(sha256(String(token || '')), 'hex');
    const expected = Buffer.from(session.token_sha256, 'hex');
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) throw codeError('ARTIFACT_BROKER_SESSION_REJECTED');
    return session;
  }

  async function submitReturnManifest(sessionId, token, manifest, manifestBytes) {
    const session = authorize(sessionId, token);
    if (session.return_manifest) throw codeError('ARTIFACT_BROKER_RETURN_REPLAY_REJECTED');
    const phase = broker.phaseBinding(manifest.phase_key || {});
    if (phase.project_id !== session.binding.project_id || phase.analysis_run_id !== session.binding.analysis_run_id || phase.phase_key !== session.binding.phase_key || phase.package_manifest_sha256 !== session.binding.package_manifest_sha256) throw codeError('ARTIFACT_BROKER_RETURN_MANIFEST_INVALID');
    const bytes = Buffer.from(manifestBytes || JSON.stringify(manifest));
    const manifestSha = sha256(bytes);
    const files = manifestFiles(manifest);
    const returnBinding = {...session.binding,request_id:session.request_id};
    const cos = brokerFactory();
    const manifestKey = broker.returnObjectKey(returnBinding, 'return-manifest', manifestSha);
    const manifestGrant = cos.issue({operation:'PUT',object_key:manifestKey,sha256:manifestSha,bytes:bytes.length,binding:returnBinding});
    const grants = files.map(file => cos.issue({operation:'PUT',object_key:broker.returnObjectKey(returnBinding,file.role,file.sha256),sha256:file.sha256,bytes:file.bytes,binding:returnBinding}));
    session.return_manifest = {sha256:manifestSha,bytes:bytes.length,object_key:manifestKey,files,return_binding:returnBinding};
    session.return_manifest_grant = broker.redactedGrant(manifestGrant);
    session.return_grants = grants.map(broker.redactedGrant);
    return {
      return_manifest:{sha256:manifestSha,bytes:bytes.length,object_key:manifestKey,grant:{operation:manifestGrant.operation,object_key:manifestGrant.object_key,sha256:manifestGrant.sha256,bytes:manifestGrant.bytes,url:manifestGrant.url,expires_at:manifestGrant.expires_at,binding:manifestGrant.binding}},
      grants:grants.map(grant => ({relative_path:session.return_manifest.files.find(file => file.sha256 === grant.sha256 && broker.returnObjectKey(returnBinding,file.role,file.sha256) === grant.object_key).relative_path,role:session.return_manifest.files.find(file => file.sha256 === grant.sha256 && broker.returnObjectKey(returnBinding,file.role,file.sha256) === grant.object_key).role,object_key:grant.object_key,sha256:grant.sha256,bytes:grant.bytes,url:grant.url,expires_at:grant.expires_at,binding:grant.binding}))
    };
  }

  function receipt(sessionId) {
    const session = sessions.get(String(sessionId));
    if (!session) throw codeError('ARTIFACT_BROKER_SESSION_REJECTED');
    return {...session,token_sha256:undefined};
  }

  return {authorize,create,receipt,submitReturnManifest};
}

module.exports = {MAX_SESSION_MS,RETURN_MANIFEST_SCHEMA,SESSION_SCHEMA,createSessionStore,manifestFiles};
