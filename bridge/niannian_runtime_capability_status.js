'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');

const ALLOWED_STATUSES = new Set(['ready', 'configured_unverified', 'missing', 'expired', 'failed', 'unknown']);
const PERSISTENT_ANALYSIS_CREDENTIALS = new Set(['credential:mimo_asr', 'credential:paddle_ocr']);

function hasSensitiveText(value) {
  const text = String(value || '');
  return [
    /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i,
    /\bAKIA[0-9A-Z]{16}\b/,
    /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]/i,
    /authorization\s*:\s*bearer\s+/i
  ].some(pattern => pattern.test(text));
}

function safeEvidence(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const method = String(value.method || '').trim();
  const summary = String(value.summary || '').trim();
  if (!method || method.length > 120 || !summary || summary.length > 320) return null;
  if (hasSensitiveText(method) || hasSensitiveText(summary)) return null;
  return { method, summary };
}

function validTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function inspectCapability(capability, entry, maxAgeMinutes, currentTime = Date.now()) {
  const status = String(entry && entry.status || 'missing');
  const checkedAt = validTimestamp(entry && entry.checked_at);
  const expiresAt = validTimestamp(entry && entry.expires_at);
  const evidence = safeEvidence(entry && entry.evidence);
  const maximumAge = Math.max(1, Number(maxAgeMinutes || 1440)) * 60 * 1000;
  const capabilityId = String(capability || '');
  const credential = capabilityId.startsWith('credential:');
  const persistentCredential = PERSISTENT_ANALYSIS_CREDENTIALS.has(capabilityId);
  let reason = null;
  if (!ALLOWED_STATUSES.has(status)) reason = 'status_invalid';
  else if (status !== 'ready') reason = 'status_' + status;
  else if (!checkedAt) reason = 'checked_at_invalid';
  else if (currentTime - checkedAt > maximumAge) reason = persistentCredential ? 'health_proof_refresh_required' : 'checked_at_stale';
  else if (!evidence) reason = 'evidence_invalid';
  // Mimo ASR and Paddle OCR credentials are persistent Mac-local configuration.
  // Their proof may age, but a proof TTL never changes credential state.
  else if (credential && !persistentCredential && (!expiresAt || expiresAt <= currentTime)) reason = 'credential_expired';
  return {
    capability:capabilityId,
    ready:reason === null,
    status,
    reason,
    persistent_credential:persistentCredential,
    health_proof_state:reason === 'health_proof_refresh_required' ? 'refresh_required' : (reason === null ? 'fresh' : 'unavailable'),
    refresh_required:reason === 'health_proof_refresh_required',
    checked_at:checkedAt ? new Date(checkedAt).toISOString() : null,
    expires_at:expiresAt ? new Date(expiresAt).toISOString() : null,
    evidence
  };
}

async function readCapabilityStatus(filePath) {
  try {
    const value = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    if (!value || value.schema_version !== 'niannian_runtime_capability_status_v1' || !value.capabilities || typeof value.capabilities !== 'object') {
      return { capabilities:{}, issue:'capability_status_contract_invalid' };
    }
    return { capabilities:value.capabilities, issue:null };
  } catch (error) {
    if (error.code === 'ENOENT') return { capabilities:{}, issue:'capability_status_missing' };
    return { capabilities:{}, issue:'capability_status_unreadable' };
  }
}

function expandHome(value, homeDir) {
  const raw = String(value || '');
  return raw === '~' ? homeDir : raw.startsWith('~/') ? path.join(homeDir, raw.slice(2)) : raw;
}

async function auditRuntimeCapabilities(options = {}) {
  const sourceRoot = path.resolve(options.sourceRoot || path.join(__dirname, '..'));
  const homeDir = path.resolve(options.homeDir || os.homedir());
  const profiles = JSON.parse(await fsp.readFile(options.profilesPath || path.join(sourceRoot, 'bridge', 'runtime_profiles.json'), 'utf8'));
  const profileName = String(options.profileName || 'mac-step01-strict-evidence-v1');
  const profile = profiles.profiles && profiles.profiles[profileName];
  if (!profile) throw new Error('runtime_capability_profile_unknown');
  const capabilityPath = path.resolve(expandHome(profile.capability_status_path || '~/.config/ai-brain/runtime_capability_status.json', homeDir));
  const observed = await readCapabilityStatus(capabilityPath);
  const maxAgeMinutes = Math.max(1, Number(profile.capability_max_age_minutes || 1440));
  const capabilities = {};
  for (const capability of profile.required_capabilities || []) {
    capabilities[capability] = inspectCapability(capability, observed.capabilities[capability], maxAgeMinutes);
  }
  return {
    schema_version:'niannian_runtime_capability_audit_v1',
    profile:profileName,
    capability_status_path:capabilityPath,
    ready:Object.values(capabilities).every(entry => entry.ready),
    issue:observed.issue,
    capabilities,
    checked_at:new Date().toISOString()
  };
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const result = await auditRuntimeCapabilities({
    ...(option(args, '--source-root') ? {sourceRoot:option(args, '--source-root')} : {}),
    ...(option(args, '--home-dir') ? {homeDir:option(args, '--home-dir')} : {}),
    ...(option(args, '--profile') ? {profileName:option(args, '--profile')} : {})
  });
  process.stdout.write(JSON.stringify(result) + '\n');
  if (!result.ready) process.exitCode = 2;
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write('runtime_capability_audit_failed:' + String(error.message || error) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { ALLOWED_STATUSES, PERSISTENT_ANALYSIS_CREDENTIALS, hasSensitiveText, safeEvidence, inspectCapability, readCapabilityStatus, auditRuntimeCapabilities };
