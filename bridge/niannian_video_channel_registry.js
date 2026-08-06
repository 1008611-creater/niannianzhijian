'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const SCHEMA_VERSION = 'niannian_video_channel_evidence_registry_v1';
const EVIDENCE_LEVELS = Object.freeze([
  'preflight_only',
  'adapter_structural',
  'integrated_submit_download_probe',
  'real_delivery_verified'
]);
const ADAPTER_STATUSES = new Set(['none', 'adapter_structural', 'integrated']);
const ACTION_MODES = new Set(['disabled', 'display_only', 'prepare_only', 'real_submit']);
const ACTIONS = new Set(['display', 'preflight', 'prepare', 'real_submit']);
const FORBIDDEN_CHANNEL_ID = /(^|[-_.])(krill|codex)([-_.]|$)/i;
const SENSITIVE_KEYS = new Set(['credential', 'credentials', 'password', 'secret', 'token', 'cookie', 'authorization', 'httpheaders', 'headers', 'rawproviderbody', 'rawresponse']);
const SENSITIVE_TEXT = /(?:authorization\s*:\s*bearer|bearer\s+[a-z0-9._~+\/-]{8,}|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|cookie)\s*[:=])/i;

function contractError(code, detail) {
  const error = new Error(code + (detail ? ':' + detail : ''));
  error.code = code;
  return error;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertNoSensitiveKeys(value, location = 'registry') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveKeys(item, location + '[' + index + ']'));
    return;
  }
  if (typeof value === 'string') {
    if (SENSITIVE_TEXT.test(value)) throw contractError('video_channel_sensitive_text_forbidden', location);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (SENSITIVE_KEYS.has(normalizedKey)) throw contractError('video_channel_sensitive_field_forbidden', location + '.' + key);
    assertNoSensitiveKeys(child, location + '.' + key);
  }
}

function normalizedChannelId(value) {
  const id = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(id)) throw contractError('video_channel_id_invalid');
  if (FORBIDDEN_CHANNEL_ID.test(id)) throw contractError('video_channel_non_video_provider_rejected', id);
  return id;
}

function deriveVideoChannelEvidenceLevel(record) {
  const flags = isPlainObject(record && record.evidence_flags) ? record.evidence_flags : {};
  const allDelivery = flags.real_submit_verified === true &&
    flags.download_verified === true &&
    flags.media_probe_verified === true &&
    flags.content_qa_verified === true &&
    flags.delivery_verified === true &&
    flags.downstream_consumable === true;
  if (allDelivery) return 'real_delivery_verified';
  const integrated = flags.real_submit_verified === true &&
    flags.download_verified === true &&
    flags.media_probe_verified === true;
  if (integrated) return 'integrated_submit_download_probe';
  if (record && record.website_adapter_status === 'adapter_structural') return 'adapter_structural';
  return 'preflight_only';
}

function validateEvidenceFlags(record) {
  if (!isPlainObject(record.evidence_flags)) throw contractError('video_channel_evidence_flags_missing', record.channel_id);
  const names = [
    'real_submit_verified',
    'download_verified',
    'media_probe_verified',
    'content_qa_verified',
    'delivery_verified',
    'downstream_consumable'
  ];
  for (const name of names) {
    if (typeof record.evidence_flags[name] !== 'boolean') {
      throw contractError('video_channel_evidence_flag_invalid', record.channel_id + '.' + name);
    }
  }
  if (record.evidence_flags.download_verified && !record.evidence_flags.real_submit_verified) {
    throw contractError('video_channel_evidence_sequence_invalid', record.channel_id + '.download_without_submit');
  }
  if (record.evidence_flags.media_probe_verified && !record.evidence_flags.download_verified) {
    throw contractError('video_channel_evidence_sequence_invalid', record.channel_id + '.probe_without_download');
  }
  if (record.evidence_flags.content_qa_verified && !record.evidence_flags.media_probe_verified) {
    throw contractError('video_channel_evidence_sequence_invalid', record.channel_id + '.qa_without_probe');
  }
  if (record.evidence_flags.delivery_verified && !record.evidence_flags.content_qa_verified) {
    throw contractError('video_channel_evidence_sequence_invalid', record.channel_id + '.delivery_without_qa');
  }
  if (record.evidence_flags.downstream_consumable && !record.evidence_flags.delivery_verified) {
    throw contractError('video_channel_evidence_sequence_invalid', record.channel_id + '.consumable_without_delivery');
  }
}

function validateEvidenceReference(reference, channelId) {
  if (!isPlainObject(reference)) throw contractError('video_channel_evidence_reference_invalid', channelId);
  const evidencePath = String(reference.path || '');
  if (!path.isAbsolute(evidencePath)) throw contractError('video_channel_evidence_path_not_absolute', channelId);
  if (/[*?]/.test(evidencePath)) throw contractError('video_channel_evidence_path_pattern_forbidden', channelId);
  if (evidencePath.split(/[\\/]+/).some(part => /^latest$/i.test(part))) {
    throw contractError('video_channel_latest_evidence_forbidden', channelId);
  }
  if (!['json', 'text'].includes(reference.kind)) throw contractError('video_channel_evidence_kind_invalid', channelId);
  if (reference.sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(String(reference.sha256))) {
    throw contractError('video_channel_evidence_sha_invalid', channelId);
  }
  if (reference.kind === 'json' && reference.json_assertions !== undefined && !Array.isArray(reference.json_assertions)) {
    throw contractError('video_channel_json_assertions_invalid', channelId);
  }
  if (reference.kind === 'text' && reference.text_includes !== undefined && !Array.isArray(reference.text_includes)) {
    throw contractError('video_channel_text_assertions_invalid', channelId);
  }
}

function validateVideoChannelRecord(input) {
  if (!isPlainObject(input)) throw contractError('video_channel_record_invalid');
  assertNoSensitiveKeys(input, 'channel');
  const channelId = normalizedChannelId(input.channel_id);
  if (input.provider_domain !== 'media_video_generation' || input.codex_model_provider !== false) {
    throw contractError('video_channel_provider_domain_invalid', channelId);
  }
  if (typeof input.enabled !== 'boolean') throw contractError('video_channel_enabled_invalid', channelId);
  if (!EVIDENCE_LEVELS.includes(input.evidence_level)) throw contractError('video_channel_evidence_level_invalid', channelId);
  if (!ADAPTER_STATUSES.has(input.website_adapter_status)) throw contractError('video_channel_adapter_status_invalid', channelId);
  if (!ACTION_MODES.has(input.website_action_mode)) throw contractError('video_channel_action_mode_invalid', channelId);
  if (!Array.isArray(input.allowed_projects)) throw contractError('video_channel_allowed_projects_invalid', channelId);
  if (!Array.isArray(input.evidence_paths) || input.evidence_paths.length === 0) {
    throw contractError('video_channel_evidence_paths_missing', channelId);
  }
  input.evidence_paths.forEach(reference => validateEvidenceReference(reference, channelId));
  validateEvidenceFlags(input);
  const derived = deriveVideoChannelEvidenceLevel(input);
  if (derived !== input.evidence_level) {
    throw contractError('video_channel_evidence_level_overclaim', channelId + ':' + input.evidence_level + '!=' + derived);
  }
  if (!input.enabled && input.website_action_mode !== 'disabled') {
    throw contractError('video_channel_disabled_action_invalid', channelId);
  }
  if (input.enabled && input.website_action_mode === 'disabled') {
    throw contractError('video_channel_enabled_action_invalid', channelId);
  }
  if (input.website_adapter_status === 'none' && !['display_only', 'disabled'].includes(input.website_action_mode)) {
    throw contractError('video_channel_adapter_none_action_invalid', channelId);
  }
  if (input.website_adapter_status === 'adapter_structural' && input.website_action_mode === 'real_submit') {
    throw contractError('video_channel_structural_adapter_submit_forbidden', channelId);
  }
  if (input.website_action_mode === 'real_submit' && input.website_adapter_status !== 'integrated') {
    throw contractError('video_channel_real_submit_adapter_missing', channelId);
  }
  if (channelId === 'mimo') {
    if (input.adapter_identity !== 'mimo_source_nas_8001_v1' || input.endpoint_identity !== 'http://nas.mimo.fashion:8001' || input.auth_namespace !== 'macos_keychain:ai.niannian.mimo.nas8001.bearer.v1/niannian-mimo-worker') throw contractError('video_channel_mimo_identity_conflict');
    if (input.skill_contract?.name !== 'mimo-8001-video-channel' || !/^[a-f0-9]{64}$/.test(String(input.skill_contract?.sha256 || ''))) throw contractError('video_channel_mimo_skill_contract_invalid');
    if (input.execution_capability_status !== 'prepare_only_fake_transport' || input.capability_expires_at !== null || input.website_action_mode !== 'prepare_only') throw contractError('video_channel_mimo_capability_overclaim');
  }
  if (channelId === 'dola') {
    if (input.adapter_identity !== 'dola2api_local_bridge_v1' || input.endpoint_identity !== 'http://127.0.0.1:9190' || input.auth_namespace !== 'browser_profile:dola2api_instance01') throw contractError('video_channel_dola_identity_conflict');
    if (input.skill_contract?.name !== 'dola-video-channel' || !/^[a-f0-9]{64}$/.test(String(input.skill_contract?.sha256 || ''))) throw contractError('video_channel_dola_skill_contract_invalid');
    if (input.execution_capability_status !== 'live_preflight_prepare_route' || input.capability_expires_at !== null || input.website_action_mode !== 'prepare_only') throw contractError('video_channel_dola_capability_overclaim');
  }
  return input;
}

function validateRegistry(registry) {
  if (!isPlainObject(registry) || registry.schema_version !== SCHEMA_VERSION) {
    throw contractError('video_channel_registry_schema_invalid');
  }
  assertNoSensitiveKeys(registry);
  if (!Array.isArray(registry.channels) || registry.channels.length === 0) {
    throw contractError('video_channel_registry_empty');
  }
  if (JSON.stringify(registry.evidence_level_order) !== JSON.stringify(EVIDENCE_LEVELS)) {
    throw contractError('video_channel_evidence_order_invalid');
  }
  const seen = new Set();
  for (const channel of registry.channels) {
    validateVideoChannelRecord(channel);
    const id = normalizedChannelId(channel.channel_id);
    if (seen.has(id)) throw contractError('video_channel_duplicate', id);
    seen.add(id);
  }
  return registry;
}

function jsonPointerGet(value, pointer) {
  if (pointer === '') return value;
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) return undefined;
  return pointer.slice(1).split('/').reduce((current, segment) => {
    if (current === undefined || current === null) return undefined;
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    return Object.prototype.hasOwnProperty.call(Object(current), key) ? current[key] : undefined;
  }, value);
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function verifyEvidenceReference(reference) {
  let stat;
  try {
    stat = await fsp.stat(reference.path);
  } catch (error) {
    if (error.code === 'ENOENT') throw contractError('video_channel_evidence_missing', reference.path);
    throw contractError('video_channel_evidence_unreadable', reference.path);
  }
  if (!stat.isFile()) throw contractError('video_channel_evidence_not_file', reference.path);
  const actualSha = await sha256File(reference.path);
  if (reference.sha256 && actualSha.toLowerCase() !== String(reference.sha256).toLowerCase()) {
    throw contractError('video_channel_evidence_sha_mismatch', reference.path);
  }
  const raw = await fsp.readFile(reference.path, 'utf8');
  if (reference.kind === 'json') {
    let parsed;
    try { parsed = JSON.parse(raw); } catch { throw contractError('video_channel_evidence_json_invalid', reference.path); }
    for (const assertion of reference.json_assertions || []) {
      if (!isPlainObject(assertion) || typeof assertion.pointer !== 'string' || !Object.prototype.hasOwnProperty.call(assertion, 'equals')) {
        throw contractError('video_channel_json_assertion_contract_invalid', reference.path);
      }
      const actual = jsonPointerGet(parsed, assertion.pointer);
      if (JSON.stringify(actual) !== JSON.stringify(assertion.equals)) {
        throw contractError('video_channel_json_assertion_failed', reference.path + ':' + assertion.pointer);
      }
    }
  } else {
    for (const expected of reference.text_includes || []) {
      if (typeof expected !== 'string' || !expected || !raw.includes(expected)) {
        throw contractError('video_channel_text_assertion_failed', reference.path);
      }
    }
  }
  return {role:String(reference.role || ''), verified:true, sha256:actualSha};
}

async function loadVideoChannelEvidenceRegistry(filePath = path.join(__dirname, 'video_channel_evidence_registry.json'), options = {}) {
  let registry;
  try { registry = JSON.parse(await fsp.readFile(filePath, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') throw contractError('video_channel_registry_missing', filePath);
    throw contractError('video_channel_registry_unreadable', filePath);
  }
  validateRegistry(registry);
  if (options.verifyEvidence === false) return registry;
  for (const channel of registry.channels) {
    channel.evidence_verification = [];
    for (const reference of channel.evidence_paths) {
      channel.evidence_verification.push(await verifyEvidenceReference(reference));
    }
  }
  return registry;
}

function projectAllowsChannel(record, context) {
  const projectId = String(context && context.projectId || '');
  if (!projectId) return false;
  if (!record.allowed_projects.includes('*') && !record.allowed_projects.includes(projectId)) return false;
  const policy = context && context.projectPolicy;
  return isPlainObject(policy) && Array.isArray(policy.allowed_channels) && policy.allowed_channels.includes(record.channel_id);
}

function exactTransactionConfirmed(record, context) {
  const transaction = context && context.transaction;
  if (!isPlainObject(transaction)) return false;
  return typeof transaction.id === 'string' && transaction.id.length >= 8 &&
    transaction.id === transaction.confirmed_id &&
    transaction.channel_id === record.channel_id &&
    transaction.project_id === context.projectId &&
    transaction.status === 'confirmed';
}

function currentQuotaCostAuthorized(context, now) {
  const quota = context && context.quotaCost;
  if (!isPlainObject(quota) || quota.authorized !== true || quota.sufficient !== true) return false;
  const checkedAt = Date.parse(quota.checked_at || '');
  const expiresAt = Date.parse(quota.expires_at || '');
  if (!Number.isFinite(checkedAt) || !Number.isFinite(expiresAt) || checkedAt > now || expiresAt <= now) return false;
  const estimate = Number(quota.estimated_cost);
  const maximum = Number(quota.max_authorized_cost);
  return Number.isFinite(estimate) && estimate >= 0 && Number.isFinite(maximum) && maximum >= estimate;
}

function evaluateActionAllowed(record, action, context = {}) {
  try { validateVideoChannelRecord(record); }
  catch (error) { return {allowed:false, reason:error.code || 'record_invalid'}; }
  if (!ACTIONS.has(action)) return {allowed:false, reason:'action_unknown'};
  if (!record.enabled || record.website_action_mode === 'disabled') return {allowed:false, reason:'channel_disabled'};
  if (!projectAllowsChannel(record, context)) return {allowed:false, reason:'project_policy_denied'};
  const policy = context.projectPolicy;
  if (!Array.isArray(policy.allowed_actions) || !policy.allowed_actions.includes(action)) {
    return {allowed:false, reason:'project_action_denied'};
  }
  if (action === 'display') return {allowed:true, reason:null};
  if (action === 'preflight') {
    if (record.website_action_mode === 'display_only' || policy.nonbillable_preflight_enabled !== true) {
      return {allowed:false, reason:'website_preflight_not_integrated'};
    }
    return {allowed:true, reason:null};
  }
  if (!exactTransactionConfirmed(record, context)) return {allowed:false, reason:'exact_transaction_missing'};
  if (action === 'prepare') {
    if (!['adapter_structural', 'integrated'].includes(record.website_adapter_status) ||
        !['prepare_only', 'real_submit'].includes(record.website_action_mode) ||
        policy.prepare_enabled !== true) {
      return {allowed:false, reason:'website_prepare_not_integrated'};
    }
    return {allowed:true, reason:null};
  }
  if (record.website_adapter_status !== 'integrated' || record.website_action_mode !== 'real_submit') {
    return {allowed:false, reason:'website_real_submit_not_integrated'};
  }
  if (policy.provider_submit_enabled !== true || context.providerSubmitEnabled !== true) {
    return {allowed:false, reason:'provider_submit_disabled'};
  }
  if (!currentQuotaCostAuthorized(context, Number(context.now || Date.now()))) {
    return {allowed:false, reason:'quota_cost_gate_failed'};
  }
  return {allowed:true, reason:null};
}

function isActionAllowed(record, action, context = {}) {
  return evaluateActionAllowed(record, action, context).allowed;
}

function apiSafeProjection(registry) {
  validateRegistry(registry);
  return {
    schema_version:registry.schema_version,
    reviewed_at:registry.reviewed_at || null,
    channels:registry.channels.map(record => ({
      channel_id:record.channel_id,
      display_name:record.display_name,
      provider_domain:record.provider_domain,
      codex_model_provider:false,
      enabled:record.enabled,
      disabled_scope:record.disabled_scope || null,
      evidence_level:record.evidence_level,
      evidence_status:record.evidence_status,
      evidence_verified:Array.isArray(record.evidence_verification) && record.evidence_verification.every(item => item.verified === true),
      evidence_count:record.evidence_paths.length,
      evidence_flags:{...record.evidence_flags},
      website_adapter_status:record.website_adapter_status,
      website_action_mode:record.website_action_mode,
      adapter_identity:record.adapter_identity || null,
      endpoint_identity:record.endpoint_identity || null,
      auth_namespace:record.auth_namespace || null,
      skill_contract_sha256:record.skill_contract?.sha256 || null,
      execution_capability_status:record.execution_capability_status || null,
      capability_expires_at:record.capability_expires_at || null,
      cost_gate_required:record.cost_gate_required === true,
      blockers:Array.isArray(record.blockers) ? [...record.blockers] : [],
      known_limits:Array.isArray(record.known_limits) ? [...record.known_limits] : []
    }))
  };
}

module.exports = {
  SCHEMA_VERSION,
  EVIDENCE_LEVELS,
  validateVideoChannelRecord,
  validateRegistry,
  deriveVideoChannelEvidenceLevel,
  verifyEvidenceReference,
  loadVideoChannelEvidenceRegistry,
  evaluateActionAllowed,
  isActionAllowed,
  apiSafeProjection,
  jsonPointerGet
};
