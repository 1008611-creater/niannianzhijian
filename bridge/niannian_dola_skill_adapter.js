'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const channelRegistry = require('./niannian_video_channel_registry');

const CHANNEL_ID = 'dola';
const ADAPTER_IDENTITY = 'dola2api_local_bridge_v1';
const PROFILE = 'windows-dola-bridge-v1';
const TASK_SPECIALISTS = Object.freeze({
  source_video: 'mx-shortdrama-00-router',
  source_script: 'mx-shortdrama-script-only-production',
  confirmed_image_i2v: 'ai-video-firstframe-workflow'
});
const FALSE_EFFECTS = Object.freeze({
  media_provider_network_requested: false,
  media_provider_upload_requested: false,
  media_provider_submit_requested: false,
  spend_requested: false,
  local_image_editing_requested: false,
  real_delivery: false
});

function codeError(code, detail) {
  const error = new Error(code + (detail ? ':' + detail : ''));
  error.code = code;
  return error;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function canonicalSha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function validateDolaPrompt(text) {
  const prompt = String(text || '').trim();
  if (!prompt) throw codeError('DOLA_ROUTE_PROMPT_EMPTY');
  if (/(?:第\s*)?\d+(?:\.\d+)?\s*(?:秒|s\b)|前\s*\d+(?:\.\d+)?\s*秒/i.test(prompt)) throw codeError('DOLA_ROUTE_PROMPT_SECONDS_FORBIDDEN');
  if (/[“”"【】]/.test(prompt)) throw codeError('DOLA_ROUTE_PROMPT_DIALOGUE_QUOTES_FORBIDDEN');
  if (/\[[^\]]+\]/.test(prompt) && !prompt.startsWith('全程使用中国中文普通话对话，')) throw codeError('DOLA_ROUTE_PROMPT_DIALOGUE_PREFIX_REQUIRED');
  return prompt;
}

async function exactPromptEvidence(spec, trustedRoot) {
  const promptPath = String(spec.prompt_path || spec.prompt?.exact_path || '');
  const expectedSha = String(spec.prompt_sha256 || spec.prompt?.sha256 || '');
  if (!path.isAbsolute(promptPath) || !inside(trustedRoot, promptPath) || !/^[a-f0-9]{64}$/.test(expectedSha)) throw codeError('DOLA_ROUTE_PROMPT_EVIDENCE_INVALID');
  const stat = await fsp.lstat(promptPath).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) throw codeError('DOLA_ROUTE_PROMPT_FILE_INVALID');
  const bytes = await fsp.readFile(promptPath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== expectedSha) throw codeError('DOLA_ROUTE_PROMPT_SHA_MISMATCH');
  validateDolaPrompt(bytes.toString('utf8'));
  return {exact_path:path.resolve(promptPath),sha256,bytes:bytes.length};
}

async function exactTaskSpecEvidence(input, trustedRoot) {
  if (!input || !path.isAbsolute(String(input.exact_path || '')) || !/^[a-f0-9]{64}$/.test(String(input.sha256 || '')) || !Number.isInteger(Number(input.bytes)) || Number(input.bytes) < 2) {
    throw codeError('DOLA_ROUTE_TASK_SPEC_EVIDENCE_INVALID');
  }
  if (!trustedRoot || !inside(trustedRoot, input.exact_path)) throw codeError('DOLA_ROUTE_TASK_SPEC_OUTSIDE_JOB');
  const stat = await fsp.lstat(input.exact_path).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size !== Number(input.bytes)) throw codeError('DOLA_ROUTE_TASK_SPEC_FILE_INVALID');
  const bytes = await fsp.readFile(input.exact_path);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== input.sha256) throw codeError('DOLA_ROUTE_TASK_SPEC_SHA_MISMATCH');
  let spec;
  try { spec = JSON.parse(bytes.toString('utf8')); }
  catch { throw codeError('DOLA_ROUTE_TASK_SPEC_JSON_INVALID'); }
  if (spec.submit_allowed !== false || spec.cost_gate?.authorized === true) throw codeError('DOLA_ROUTE_PREPARE_SPEC_AUTHORITY_INVALID');
  const prompt = await exactPromptEvidence(spec, trustedRoot);
  return {exact_path:path.resolve(input.exact_path),sha256,bytes:bytes.length,prompt};
}

function defaultRequestJson(url, options = {}) {
  return fetch(url, {...options, signal:options.signal || AbortSignal.timeout(5000), headers:{accept:'application/json', ...(options.headers || {})}}).then(async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw codeError('DOLA_BRIDGE_HTTP_ERROR', response.status);
    return body;
  });
}

function validateBridgeBaseUrl(value) {
  const url = new URL(String(value || 'http://127.0.0.1:9190'));
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw codeError('DOLA_BRIDGE_ENDPOINT_INVALID');
  }
  return url.origin;
}

function validateCapability(value) {
  if (!value || value.schema_version !== 'dola2api_capabilities_v1' || value.adapter_identity !== ADAPTER_IDENTITY) throw codeError('DOLA_BRIDGE_CAPABILITY_CONTRACT_INVALID');
  if (value.ready !== true || value.proxy_configured !== true || value.region_restricted !== false || value.cdp_available !== true || Number(value.extension_count) < 2 || value.login_state !== 'authenticated') {
    const blocker = value.region_restricted === true ? 'region_restricted' : value.login_state !== 'authenticated' ? 'interactive_login_required' : 'bridge_not_ready';
    throw codeError('DOLA_BRIDGE_PREFLIGHT_BLOCKED', blocker);
  }
  if (value.provider_submit_enabled !== false || value.provider_upload_enabled !== false || value.spend_enabled !== false) throw codeError('DOLA_BRIDGE_CAPABILITY_OVERCLAIM');
  return {
    schema_version: value.schema_version,
    adapter_identity: value.adapter_identity,
    ready: true,
    proxy_configured: true,
    region_restricted: false,
    cdp_available: true,
    extension_count: Number(value.extension_count),
    login_state: 'authenticated',
    allowed_actions: ['preflight', 'prepare_route'],
    provider_submit_enabled: false,
    provider_upload_enabled: false,
    spend_enabled: false
  };
}

function validateSkillChain(skillRegistry, taskKind, specialist) {
  const skills = skillRegistry?.skills;
  const chain = ['ai-video-production-router', specialist, 'prompt-skill-router', 'ai-video-channel-router', 'dola-video-channel'];
  if (!skills || chain.some(name => !skills[name])) throw codeError('DOLA_SKILL_ROUTE_NOT_REGISTERED');
  for (const name of chain) {
    const compatible = (skills[name].compatibility || []).some(row => Array.isArray(row.task_kinds) && row.task_kinds.includes(taskKind));
    if (!compatible) throw codeError('DOLA_SKILL_ROUTE_INCOMPATIBLE', name + ':' + taskKind);
  }
  return chain;
}

function createDolaSkillAdapter(options = {}) {
  const bridgeBaseUrl = validateBridgeBaseUrl(options.bridgeBaseUrl || process.env.NIANNIAN_DOLA_BRIDGE_URL || 'http://127.0.0.1:9190');
  const requestJson = options.requestJson || defaultRequestJson;
  const registryPath = options.registryPath || path.join(__dirname, 'video_channel_evidence_registry.json');
  const skillRegistryPath = options.skillRegistryPath || path.join(__dirname, 'skill_registry.json');
  const verifyEvidence = options.verifyEvidence !== false;

  async function bridgePreflight() {
    const result = await requestJson(bridgeBaseUrl + '/api/v1/capabilities', {method:'GET'});
    return validateCapability(result);
  }

  async function route({action, projectId, taskKind, projectPolicy, transaction, specialistSkill, taskSpec, trustedRoot}) {
    if (!['preflight', 'prepare', 'real_submit'].includes(action)) throw codeError('DOLA_ROUTE_ACTION_INVALID');
    if (!TASK_SPECIALISTS[taskKind]) throw codeError('DOLA_ROUTE_TASK_KIND_INVALID');
    const specialist = specialistSkill || TASK_SPECIALISTS[taskKind];
    if (specialist !== TASK_SPECIALISTS[taskKind]) throw codeError('DOLA_ROUTE_SPECIALIST_INVALID');
    const registry = await channelRegistry.loadVideoChannelEvidenceRegistry(registryPath, {verifyEvidence:false});
    const record = registry.channels.find(item => item.channel_id === CHANNEL_ID);
    if (!record) throw codeError('DOLA_CHANNEL_REGISTRY_ENTRY_MISSING');
    if (verifyEvidence) {
      record.evidence_verification = [];
      for (const reference of record.evidence_paths) record.evidence_verification.push(await channelRegistry.verifyEvidenceReference(reference));
    }
    const context = {projectId, projectPolicy, transaction};
    const decision = channelRegistry.evaluateActionAllowed(record, action, context);
    if (!decision.allowed) throw codeError('DOLA_ROUTE_GATE_BLOCKED', decision.reason);
    const skillRegistry = JSON.parse(await fsp.readFile(skillRegistryPath, 'utf8'));
    const skillChain = validateSkillChain(skillRegistry, taskKind, specialist);
    const capability = await bridgePreflight();
    const specEvidence = action === 'prepare' ? await exactTaskSpecEvidence(taskSpec, trustedRoot) : null;
    const identity = {project_id:projectId,task_kind:taskKind,action,channel_id:CHANNEL_ID,adapter_identity:ADAPTER_IDENTITY,skill_chain:skillChain,task_spec:specEvidence,transaction_id:transaction?.id || null};
    const routeId = 'dola-route-' + canonicalSha(identity).slice(0, 32);
    const routeDecision = {
      schema_version:'niannian_dola_skill_route_decision_v1',
      route_id:routeId,
      status:action === 'prepare' ? 'prepare_dispatch_ready' : 'preflight_passed',
      project_id:projectId,
      task_kind:taskKind,
      profile:PROFILE,
      channel_id:CHANNEL_ID,
      adapter_identity:ADAPTER_IDENTITY,
      ordered_skill_chain:skillChain,
      task_spec:specEvidence,
      capability,
      submit_allowed:false,
      cost_authorized:false,
      ...FALSE_EFFECTS
    };
    if (action !== 'prepare') return {route_decision:routeDecision, dispatch_envelope:null};
    const envelope = {
      schema_version:'typed_dispatch_envelope_v1',
      dispatch_id:'dispatch-' + canonicalSha({route_id:routeId,task_spec_sha256:specEvidence.sha256}).slice(0, 32),
      status:'prepared',
      dispatch_to:'target_system_controller',
      target_controller:'niannian_video_controller',
      requested_capability:'channel:dola_prepare',
      route_decision_id:routeId,
      project_id:projectId,
      channel_id:CHANNEL_ID,
      adapter_identity:ADAPTER_IDENTITY,
      task_spec:specEvidence,
      transaction_id:transaction.id,
      constraints:{submit_allowed:false,cost_authorized:false,interactive_verification_handoff:'novnc',local_image_editing_allowed:false},
      ...FALSE_EFFECTS
    };
    return {route_decision:routeDecision, dispatch_envelope:envelope};
  }

  return {adapter_identity:ADAPTER_IDENTITY,bridge_base_url:bridgeBaseUrl,bridgePreflight,route};
}

module.exports = {ADAPTER_IDENTITY,CHANNEL_ID,FALSE_EFFECTS,PROFILE,TASK_SPECIALISTS,canonicalSha,createDolaSkillAdapter,validateCapability,validateDolaPrompt};
