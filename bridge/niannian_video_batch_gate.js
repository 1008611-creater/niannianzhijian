'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const SCHEMA_VERSION = 'niannian.video_batch_gate.v1';
const SPEC_SCHEMA = 'provider_neutral.video_task_spec.v1';
const BATCH_SCHEMA = 'provider_neutral.video_batch_manifest.v1';
const PREFLIGHT_SCHEMA = 'provider_neutral.video_batch_preflight.v1';
const QUOTE_SCHEMA = 'provider_neutral.video_batch_cost_quote.v1';
const CONFIRMATION_SCHEMA = 'provider_neutral.video_batch_confirmation_event.v1';
const FIXTURE_ADAPTER_IDENTITY = 'fixture-provider-neutral-video-v1';
const ACTUAL_VIDEO_REF_ROLES = new Set(['video_first_frame_anchor', 'video_upload_non_first_ref']);
const SUBMISSION_TERMINAL_OR_ACTIVE = new Set(['submitted', 'running', 'completed', 'unknown_after_network_error']);
const SECRET_FIELD = /(^|_)(path|sha|sha256|digest|provider_task_id|receipt|credential|cookie|token|secret|api_key|raw_provider)($|_)/i;

function contractError(code, message, httpStatus = 400) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function opaqueId(prefix, value, length = 24) {
  return prefix + '-' + digest(value).slice(0, length);
}

function iso(now) {
  const value = now instanceof Date ? now : new Date(now === undefined ? Date.now() : now);
  if (!Number.isFinite(value.getTime())) throw contractError('VIDEO_BATCH_TIME_INVALID', '服务器时间无效');
  return value.toISOString();
}

function addMs(now, milliseconds) {
  return new Date(new Date(now).getTime() + milliseconds).toISOString();
}

function assertId(value, field) {
  const result = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/.test(result)) throw contractError('VIDEO_BATCH_ID_INVALID', field + ' 无效');
  return result;
}

function assertDigest(value, field) {
  const result = String(value || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(result)) throw contractError('VIDEO_BATCH_DIGEST_INVALID', field + ' 无效');
  return result;
}

function normalizeMoney(value, field) {
  if (!value || typeof value !== 'object') throw contractError('VIDEO_BATCH_MONEY_INVALID', field + ' 缺失');
  const currency = String(value.currency || '').toUpperCase();
  const minorUnits = Number(value.minor_units);
  if (!/^[A-Z]{3}$/.test(currency) || !Number.isSafeInteger(minorUnits) || minorUnits < 0) {
    throw contractError('VIDEO_BATCH_MONEY_INVALID', field + ' 无效');
  }
  return {currency, minor_units:minorUnits};
}

function normalizeParameters(group) {
  const durationSeconds = Number(group.duration_seconds);
  const aspectRatio = String(group.aspect_ratio || '');
  const resolution = String(group.resolution || '');
  const audioRequirement = String(group.audio_requirement || '');
  const allowedChannelClass = String(group.allowed_channel_class || '');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 60) throw contractError('VIDEO_BATCH_DURATION_INVALID', '视频时长无效');
  if (!/^\d+:\d+$/.test(aspectRatio)) throw contractError('VIDEO_BATCH_ASPECT_RATIO_INVALID', '画面比例无效');
  if (!/^(\d{3,4}p|\d{3,4}x\d{3,4})$/i.test(resolution)) throw contractError('VIDEO_BATCH_RESOLUTION_INVALID', '清晰度无效');
  if (!['required', 'forbidden', 'optional'].includes(audioRequirement)) throw contractError('VIDEO_BATCH_AUDIO_REQUIREMENT_INVALID', '音频要求无效');
  if (!/^[a-z][a-z0-9._-]{2,63}$/.test(allowedChannelClass)) throw contractError('VIDEO_BATCH_CHANNEL_CLASS_INVALID', '渠道类别无效');
  return {duration_seconds:durationSeconds, aspect_ratio:aspectRatio, resolution, audio_requirement:audioRequirement, allowed_channel_class:allowedChannelClass};
}

function normalizeAuthority(input) {
  const required = ['project_revision', 'localization_revision', 'step04_confirmation_revision', 'step05_confirmation_revision'];
  const authority = {};
  for (const field of required) authority[field] = assertId(input?.[field], field);
  return authority;
}

function normalizeReference(reference, authority) {
  const role = String(reference?.role || '');
  const authorityClass = String(reference?.authority_class || '');
  const status = String(reference?.status || '');
  if (!ACTUAL_VIDEO_REF_ROLES.has(role)) throw contractError('VIDEO_BATCH_REFERENCE_ROLE_REJECTED', '仅允许已确认的视频实际参考图');
  if (authorityClass !== 'authoritative' || status !== 'confirmed' || reference.actual_video_input !== true) {
    throw contractError('VIDEO_BATCH_REFERENCE_NOT_AUTHORITATIVE', '存在未确认或非权威视频参考图');
  }
  if (reference.stale === true || reference.rejected === true || reference.support_only === true) {
    throw contractError('VIDEO_BATCH_REFERENCE_STALE_OR_REJECTED', '存在已过期、已拒绝或仅支撑用途的参考图');
  }
  const confirmationRevision = assertId(reference.confirmation_revision, 'reference.confirmation_revision');
  if (confirmationRevision !== authority.step05_confirmation_revision) {
    throw contractError('VIDEO_BATCH_REFERENCE_CONFIRMATION_MISMATCH', '参考图确认版本已变化');
  }
  return {
    ref_key:assertId(reference.ref_key, 'reference.ref_key'),
    role,
    authority_class:'authoritative',
    status:'confirmed',
    actual_video_input:true,
    confirmation_revision:confirmationRevision,
    authority_event_id:assertId(reference.authority_event_id, 'reference.authority_event_id'),
    confirmed_digest:assertDigest(reference.confirmed_digest, 'reference.confirmed_digest')
  };
}

function normalizeGroup(projectId, group, authority) {
  const groupId = assertId(group.group_id, 'group_id');
  const prompt = {
    revision:assertId(group.prompt?.revision, 'prompt.revision'),
    locked_digest:assertDigest(group.prompt?.locked_digest, 'prompt.locked_digest'),
    status:String(group.prompt?.status || '')
  };
  if (prompt.status !== 'locked') throw contractError('VIDEO_BATCH_PROMPT_NOT_LOCKED', '视频提示词尚未锁定');
  const references = (Array.isArray(group.references) ? group.references : []).map(item => normalizeReference(item, authority));
  if (!references.length) throw contractError('VIDEO_BATCH_REFERENCE_MISSING', '缺少已确认的视频实际参考图');
  const seen = new Set();
  for (const reference of references) {
    if (seen.has(reference.ref_key)) throw contractError('VIDEO_BATCH_REFERENCE_DUPLICATE', '视频参考图重复');
    seen.add(reference.ref_key);
  }
  const parameters = normalizeParameters(group);
  const source = {
    project_id:projectId,
    video_group_id:groupId,
    authority,
    prompt,
    references,
    parameters,
    dependency_group_ids:Array.isArray(group.dependency_group_ids) ? [...new Set(group.dependency_group_ids.map(item=>assertId(item,'dependency_group_id')))].sort() : [],
    output_requirements:Array.isArray(group.output_requirements) ? group.output_requirements.map(String).sort() : [],
    qa_requirements:Array.isArray(group.qa_requirements) ? group.qa_requirements.map(String).sort() : []
  };
  if (!source.output_requirements.length || !source.qa_requirements.length) {
    throw contractError('VIDEO_BATCH_OUTPUT_QA_REQUIREMENTS_MISSING', '输出或质量要求不完整');
  }
  const specDigest = digest(source);
  return {
    schema_version:SPEC_SCHEMA,
    spec_id:opaqueId('vts', {project_id:projectId, group_id:groupId, spec_digest:specDigest}),
    spec_digest:specDigest,
    status:'locked',
    ...source
  };
}

function taskParameters(specs) {
  return specs.map(spec => ({spec_id:spec.spec_id, ...spec.parameters}));
}

function buildSpecsAndBatch({projectId, input, revision, now, preflightRevision, quoteRevision, quoteExpiresAt}) {
  const authority = normalizeAuthority(input.authority);
  const groups = Array.isArray(input.groups) ? input.groups : [];
  if (!groups.length) throw contractError('VIDEO_BATCH_GROUPS_MISSING', '没有可生成的视频任务');
  const specs = groups.map(group => normalizeGroup(projectId, group, authority));
  const ids = new Set(specs.map(spec => spec.spec_id));
  if (ids.size !== specs.length) throw contractError('VIDEO_BATCH_SPEC_DUPLICATE', '视频任务重复');
  const groupIds=new Set(specs.map(spec=>spec.video_group_id));
  for(const spec of specs){if(spec.dependency_group_ids.includes(spec.video_group_id)||spec.dependency_group_ids.some(id=>!groupIds.has(id)))throw contractError('VIDEO_BATCH_DEPENDENCY_INVALID','视频任务依赖关系无效');}
  const body = {
    project_id:projectId,
    batch_revision:revision,
    authority,
    specs:specs.map(spec => ({spec_id:spec.spec_id, spec_digest:spec.spec_digest})),
    task_count:specs.length,
    total_duration_seconds:specs.reduce((sum, spec) => sum + spec.parameters.duration_seconds, 0),
    parameters:taskParameters(specs),
    preflight_revision:preflightRevision,
    cost_quote_revision:quoteRevision,
    expires_at:quoteExpiresAt
  };
  const batchDigest = digest(body);
  return {specs, batch:{schema_version:BATCH_SCHEMA,batch_id:opaqueId('batch', {project_id:projectId,batch_digest:batchDigest}),batch_digest:batchDigest,status:'locked',locked_at:iso(now),...body}};
}

function createFixtureAdapter(overrides = {}) {
  const base = {
    identity:FIXTURE_ADAPTER_IDENTITY,
    login_status:'available',
    permission_status:'available',
    secret_config_status:'configured',
    quota_minor_units:100000,
    currency:'CNY',
    per_second_minor_units:20,
    per_task_minor_units:50,
    quote_ceiling_padding_minor_units:100,
    estimated_wait_seconds_per_task:45,
    supported_durations_seconds:[4,5,6,8,10,12,15],
    supported_aspect_ratios:['9:16','16:9','1:1'],
    supported_resolutions:['720p','1080p'],
    audio_requirements:['required','forbidden','optional'],
    allowed_channel_classes:['multimodal-video-standard'],
    output_contract_status:'available'
  };
  const config = {...base, ...overrides};
  const adapterRevision = digest({identity:config.identity,login_status:config.login_status,permission_status:config.permission_status,secret_config_status:config.secret_config_status,quota_minor_units:config.quota_minor_units,currency:config.currency,per_second_minor_units:config.per_second_minor_units,per_task_minor_units:config.per_task_minor_units,quote_ceiling_padding_minor_units:config.quote_ceiling_padding_minor_units,estimated_wait_seconds_per_task:config.estimated_wait_seconds_per_task,supported_durations_seconds:config.supported_durations_seconds,supported_aspect_ratios:config.supported_aspect_ratios,supported_resolutions:config.supported_resolutions,audio_requirements:config.audio_requirements,allowed_channel_classes:config.allowed_channel_classes,output_contract_status:config.output_contract_status});
  const sideEffects = {network:0,login:0,secret_read:0,upload:0,submit:0,cost:0};
  return {
    identity:config.identity,
    revision:adapterRevision,
    config,
    sideEffects,
    preflight({batch, specs, revision, now}) {
      const checks = [];
      const add = (id, passed, blockerType, message) => checks.push({id,status:passed?'pass':'fail',blocker_type:passed?null:blockerType,message:passed?'已通过':message});
      add('input_complete', specs.length === batch.task_count, 'user_confirmation', '视频任务输入不完整');
      add('prompt_reference_authority', specs.every(spec => spec.status === 'locked' && spec.references.every(ref => ref.status === 'confirmed')), 'user_confirmation', '提示词或参考图尚未确认');
      add('login', config.login_status === 'available', 'login', '需要完成登录');
      add('secret_config', config.secret_config_status === 'configured', 'secret_config', '需要配置访问 Key');
      add('permission', config.permission_status === 'available', 'permission', '当前账号缺少生成权限');
      add('duration', specs.every(spec => config.supported_durations_seconds.includes(spec.parameters.duration_seconds)), 'provider_policy', '当前能力不支持该视频时长');
      add('aspect_ratio', specs.every(spec => config.supported_aspect_ratios.includes(spec.parameters.aspect_ratio)), 'provider_policy', '当前能力不支持该画面比例');
      add('resolution', specs.every(spec => config.supported_resolutions.includes(spec.parameters.resolution)), 'provider_policy', '当前能力不支持该清晰度');
      add('audio', specs.every(spec => config.audio_requirements.includes(spec.parameters.audio_requirement)), 'provider_policy', '当前能力不支持该音频要求');
      add('channel_class', specs.every(spec => config.allowed_channel_classes.includes(spec.parameters.allowed_channel_class)), 'provider_policy', '当前任务渠道类别不可用');
      add('output_contract', config.output_contract_status === 'available', 'permission', '输出位置尚未准备好');
      const estimated = specs.reduce((sum, spec) => sum + Math.ceil(spec.parameters.duration_seconds * config.per_second_minor_units) + config.per_task_minor_units, 0);
      add('quota', config.quota_minor_units >= estimated, 'cost_authorization', '当前额度不足，需要重新生成较小批次');
      const failed = checks.find(check => check.status === 'fail') || null;
      return {
        schema_version:PREFLIGHT_SCHEMA,
        revision,
        status:failed ? 'blocked' : 'pass',
        checks,
        earliest_blocker:failed,
        fixture_adapter_identity:config.identity,
        nonbillable:true,
        external_effects:{...sideEffects},
        submit_allowed:false,
        estimated_cost:{currency:config.currency,minor_units:estimated},
        estimated_wait_seconds:batch.task_count * config.estimated_wait_seconds_per_task,
        checked_at:iso(now)
      };
    },
    quote({preflight, revision, now, ttlMs = 30 * 60 * 1000}) {
      const estimated = normalizeMoney(preflight.estimated_cost, 'estimated_cost');
      return {
        schema_version:QUOTE_SCHEMA,
        revision,
        source_identity:config.identity,
        estimated_cost:estimated,
        max_cost:{currency:estimated.currency,minor_units:estimated.minor_units + config.quote_ceiling_padding_minor_units},
        created_at:iso(now),
        expires_at:addMs(now, ttlMs),
        status:preflight.status === 'pass' ? 'current' : 'blocked'
      };
    }
  };
}

function humanActionFor({projectId, ownerRef, batch, preflight, quote, now}) {
  const blocker = preflight.earliest_blocker;
  const actionType = blocker?.blocker_type || 'cost_authorization';
  const blockerId = blocker ? opaqueId('blocker', {batch:batch.batch_digest,check:blocker.id}) : opaqueId('blocker', {batch:batch.batch_digest,quote:quote.revision});
  const taskId = opaqueId('video-batch-task', {project_id:projectId,batch:batch.batch_digest});
  const actionId = opaqueId('action', {task_id:taskId,node_id:'VIDEO_EXECUTION',blocker_id:blockerId,action_type:actionType});
  const labels = {
    cost_authorization:'确认生成本批视频', login:'完成视频服务登录', secret_config:'配置视频服务访问 Key',
    permission:'开通视频生成权限', provider_policy:'处理当前能力限制', user_confirmation:'确认视频输入'
  };
  return {
    action_id:actionId,
    task_id:taskId,
    owner_ref:ownerRef,
    node_id:'VIDEO_EXECUTION',
    blocker_id:blockerId,
    action_type:actionType,
    title:labels[actionType] || '完成当前操作',
    user_message:blocker?.message || '请确认本批视频数量、参数与费用上限。',
    safe_entry_id:'current_video_batch_plan',
    impact:'完成后将恢复同一批次，不会自动提交或扣费。',
    resume_event:'video_batch_gate_reconcile',
    expires_at:quote.expires_at,
    status:'awaiting_user',
    created_at:iso(now),
    supersedes:null,
    superseded_by:null,
    batch_id:batch.batch_id
  };
}

function activeAction(state) {
  return (state.actions || []).find(action => action.status === 'awaiting_user' && action.batch_id === state.current_batch_id) || null;
}

function authorizationMatches(state, now = Date.now()) {
  const auth = state.authorization;
  const batch = state.batch;
  const quote = state.quote;
  if (!auth || auth.status !== 'current' || !batch || !quote || state.preflight?.status !== 'pass' || quote.status !== 'current') return false;
  if (Date.parse(auth.expires_at) <= new Date(now).getTime() || Date.parse(quote.expires_at) <= new Date(now).getTime()) return false;
  if (auth.batch_digest !== batch.batch_digest || auth.batch_revision !== batch.batch_revision || auth.quote_revision !== quote.revision) return false;
  if (auth.adapter_identity !== state.adapter_identity || auth.adapter_revision !== state.adapter_revision) return false;
  if (auth.task_count !== batch.task_count || auth.total_duration_seconds !== batch.total_duration_seconds) return false;
  if (auth.spec_identity_digest !== digest(batch.specs) || auth.parameters_digest !== digest(batch.parameters) || auth.authority_digest !== digest(batch.authority)) return false;
  if (auth.confirmed_max_cost.currency !== quote.estimated_cost.currency || auth.confirmed_max_cost.minor_units < quote.estimated_cost.minor_units) return false;
  return true;
}

function deriveSubmissionIdentity(state, now = Date.now()) {
  if (!authorizationMatches(state, now)) return null;
  const body = {batch_digest:state.batch.batch_digest,spec_identity_digest:digest(state.batch.specs),channel_adapter_identity:state.adapter_identity,authorization_event_id:state.authorization.event_id,authorization_event_digest:state.authorization.event_digest};
  return {identity:opaqueId('submission', body, 40), ...body};
}

function strongEtag(state) {
  return '"video-batch-' + digest({revision:state.revision,current_batch_id:state.current_batch_id,batch_digest:state.batch?.batch_digest||null,preflight:state.preflight?.revision||null,quote:state.quote?.revision||null,authorization:state.authorization?.event_digest||null,authorization_status:state.authorization?.status||null,submission:state.submission?.status||null,actions:(state.actions||[]).map(item=>[item.action_id,item.status])}).slice(0,32) + '"';
}

function assertStrongIfMatch(ifMatch, expected) {
  if (!ifMatch || /^W\//i.test(String(ifMatch)) || String(ifMatch) !== expected) {
    throw contractError('VIDEO_BATCH_IF_MATCH_FAILED', '方案已更新，请刷新后重新确认', 412);
  }
}

function safePublicObject(value, location = 'response') {
  if (Array.isArray(value)) return value.map((item, index) => safePublicObject(item, location + '[' + index + ']'));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_FIELD.test(key)) throw contractError('VIDEO_BATCH_PUBLIC_FIELD_FORBIDDEN', location + '.' + key);
    result[key] = safePublicObject(child, location + '.' + key);
  }
  return result;
}

function displayState(state, now = Date.now()) {
  if (!state.batch) return state.blocker ? '准备中' : '暂无可生成的视频';
  if (state.authorization?.status === 'stale_input') return '输入已变化需重确认';
  if (state.authorization?.status === 'expired' || Date.parse(state.quote.expires_at) <= new Date(now).getTime()) return '授权已过期';
  if (state.preflight.status !== 'pass') return '准备中';
  if (!authorizationMatches(state, now)) return '等待你确认';
  return '等待提交/处理中';
}

function publicProjection(state, now = Date.now()) {
  const batch = state.batch;
  const quote = state.quote;
  const action = activeAction(state);
  const ratios = batch ? [...new Set(batch.parameters.map(item => item.aspect_ratio))] : [];
  const resolutions = batch ? [...new Set(batch.parameters.map(item => item.resolution))] : [];
  const checkLabels = {input_complete:'素材完整',prompt_reference_authority:'提示词与参考图已确认',login:'登录可用',secret_config:'访问配置可用',permission:'生成权限可用',duration:'视频时长可用',aspect_ratio:'画面比例可用',resolution:'清晰度可用',audio:'音频要求可用',channel_class:'生成能力可用',output_contract:'输出位置可用',quota:'额度可用'};
  const projection = {
    schema_version:'niannian.video_batch_public.v1',
    project_id:state.project_id,
    state:displayState(state, now),
    stages:['视频参考图已确认','生成方案','免费预检','确认生成本批视频','等待提交/处理中'],
    plan:batch ? {batch_id:batch.batch_id,task_count:batch.task_count,total_duration_seconds:batch.total_duration_seconds,aspect_ratio:ratios.join('、'),resolution:resolutions.join('、'),estimated_wait_seconds:state.preflight.estimated_wait_seconds} : null,
    preflight:state.preflight ? {status:state.preflight.status,nonbillable:true,checks:state.preflight.checks.map(check=>({label:checkLabels[check.id]||'准备项',status:check.status,message:check.message})),submit_allowed:false} : null,
    quote:quote ? {revision:quote.revision,currency:quote.estimated_cost.currency,estimated_cost_minor_units:quote.estimated_cost.minor_units,max_cost_minor_units:quote.max_cost.minor_units,expires_at:quote.expires_at,status:quote.status} : null,
    authorization:state.authorization ? {status:state.authorization.status,confirmed_max_cost_minor_units:state.authorization.confirmed_max_cost.minor_units,confirmed_at:state.authorization.confirmed_at,expires_at:state.authorization.expires_at} : {status:'missing'},
    submit_allowed:authorizationMatches(state, now),
    earliest_issue:state.preflight?.earliest_blocker?.message || (action ? action.user_message : null),
    action:action ? {action_id:action.action_id,type:action.action_type,title:action.title,message:action.user_message,impact:action.impact,expires_at:action.expires_at,status:action.status} : null,
    real_provider_submit:false,
    real_delivery:false
  };
  return safePublicObject(projection);
}

async function atomicJson(target, value) {
  await fsp.mkdir(path.dirname(target), {recursive:true});
  const temp = target + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n', {encoding:'utf8',flag:'wx'});
  await fsp.rename(temp, target);
}

function createService({root, adapter = createFixtureAdapter()} = {}) {
  if (!path.isAbsolute(String(root || ''))) throw contractError('VIDEO_BATCH_STORE_ROOT_INVALID', '批次存储目录无效');
  const statePath = projectId => path.join(root, assertId(projectId, 'project_id'), 'state.json');
  const locks = new Map();
  async function exclusive(projectId, work) {
    const key = assertId(projectId, 'project_id');
    const prior = locks.get(key) || Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    const queued = prior.then(() => current);
    locks.set(key, queued);
    await prior;
    try { return await work(); } finally { release(); if (locks.get(key) === queued) locks.delete(key); }
  }
  async function load(projectId) {
    try { return JSON.parse(await fsp.readFile(statePath(projectId), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async function save(state) { await atomicJson(statePath(state.project_id), state); return state; }

  async function lockAndPreflight({projectId, ownerId, ownerRef = null, input, now = Date.now(), quoteTtlMs = 30 * 60 * 1000}) {
    return exclusive(projectId, async () => {
      projectId = assertId(projectId, 'project_id'); ownerId = assertId(ownerId, 'owner_id');
      ownerRef = ownerRef || 'codex-thread:' + ownerId;
      if (!/^codex-thread:[A-Za-z0-9][A-Za-z0-9._:-]{1,160}$/.test(ownerRef)) throw contractError('VIDEO_BATCH_OWNER_REF_INVALID','任务负责人绑定无效');
      const existing = await load(projectId);
      if (existing && existing.owner_id !== ownerId) throw contractError('VIDEO_BATCH_OWNER_DENIED', '无权访问该项目', 404);
      const inputDigest = digest(input);
      const sameInput = existing?.input_digest === inputDigest
        && existing.batch
        && existing.adapter_identity === adapter.identity
        && existing.adapter_revision === adapter.revision;
      const quoteStillCurrent = ['current','blocked'].includes(existing?.quote?.status)
        && Date.parse(existing.quote.expires_at) > new Date(now).getTime();
      if (sameInput && quoteStillCurrent) return packageResult(existing, now);
      const revision = Number(existing?.revision || 0) + 1;
      const preflightRevision = 'preflight-r' + revision;
      const quoteRevision = 'quote-r' + revision;
      const quoteExpiresAt = addMs(now, quoteTtlMs);
      let built;
      try { built = buildSpecsAndBatch({projectId,input,revision,now,preflightRevision,quoteRevision,quoteExpiresAt}); }
      catch (error) {
        const failed = {schema_version:SCHEMA_VERSION,project_id:projectId,owner_id:ownerId,revision,input_digest:inputDigest,current_batch_id:null,specs:[],batch:null,preflight:null,quote:null,authorization:existing?.authorization?{...existing.authorization,status:'stale_input'}:null,submission:existing?.submission||null,actions:existing?.actions||[],idempotency:existing?.idempotency||{},history:existing?.history||[],blocker:{code:error.code||'VIDEO_BATCH_INPUT_INVALID',message:error.message},adapter_identity:adapter.identity,adapter_revision:adapter.revision,external_effects:{...adapter.sideEffects},updated_at:iso(now)};
        await save(failed); throw error;
      }
      const preflight = adapter.preflight({batch:built.batch,specs:built.specs,revision:preflightRevision,now});
      const quote = adapter.quote({preflight,revision:quoteRevision,now,ttlMs:quoteTtlMs});
      if (quote.expires_at !== built.batch.expires_at) {
        built = buildSpecsAndBatch({projectId,input,revision,now,preflightRevision,quoteRevision,quoteExpiresAt:quote.expires_at});
      }
      const history = existing ? [...(existing.history||[]),{revision:existing.revision,batch:existing.batch,authorization:existing.authorization,submission:existing.submission,archived_at:iso(now)}] : [];
      const actions = (existing?.actions||[]).map(action => action.status === 'awaiting_user' ? {...action,status:'cancelled',superseded_by:'pending'} : action);
      const priorAuthorization = existing?.authorization
        ? {...existing.authorization,status:sameInput?'expired':'stale_input'}
        : null;
      const state = {schema_version:SCHEMA_VERSION,project_id:projectId,owner_id:ownerId,owner_ref:ownerRef,revision,input_digest:inputDigest,current_batch_id:built.batch.batch_id,specs:built.specs,batch:built.batch,preflight,quote,authorization:priorAuthorization,submission:null,actions,idempotency:existing?.idempotency||{},history,blocker:preflight.earliest_blocker,adapter_identity:adapter.identity,adapter_revision:adapter.revision,external_effects:{...adapter.sideEffects},updated_at:iso(now)};
      const action = humanActionFor({projectId,ownerRef,batch:state.batch,preflight,quote,now});
      for (const prior of state.actions) if (prior.status === 'cancelled' && prior.superseded_by === 'pending') prior.superseded_by = action.action_id;
      state.actions.push(action);
      await save(state);
      return packageResult(state, now);
    });
  }

  function packageResult(state, now) { return {state,projection:publicProjection(state,now),etag:strongEtag(state)}; }

  async function getCurrent({projectId, ownerId, now = Date.now()}) {
    return exclusive(projectId, async () => {
      const state = await load(projectId);
      if (!state || state.owner_id !== ownerId) throw contractError('VIDEO_BATCH_NOT_FOUND', '未找到当前视频方案', 404);
      let changed = false;
      if (state.authorization?.status === 'current' && Date.parse(state.authorization.expires_at) <= new Date(now).getTime()) { state.authorization.status='expired'; changed=true; }
      if (state.quote && Date.parse(state.quote.expires_at) <= new Date(now).getTime() && state.quote.status === 'current') { state.quote.status='expired'; changed=true; }
      if (changed) { state.revision += 1; state.updated_at=iso(now); await save(state); }
      return packageResult(state, now);
    });
  }

  async function confirm({projectId, ownerId, ifMatch, idempotencyKey, body, now = Date.now()}) {
    return exclusive(projectId, async () => {
      const state = await load(projectId);
      if (!state || state.owner_id !== ownerId) throw contractError('VIDEO_BATCH_NOT_FOUND', '未找到当前视频方案', 404);
      const key = String(idempotencyKey || '').trim();
      if (!key) throw contractError('VIDEO_BATCH_IDEMPOTENCY_KEY_REQUIRED', '缺少 Idempotency-Key', 400);
      const requestIdentity = digest({project_id:projectId,batch_id:state.batch?.batch_id,quote_revision:body?.quote_revision,confirmed_max_cost:body?.confirmed_max_cost,confirm_generate:body?.confirm_generate});
      const prior = state.idempotency[key];
      if (prior) {
        if (prior.request_identity !== requestIdentity) throw contractError('VIDEO_BATCH_IDEMPOTENCY_CONFLICT', '相同确认键对应了不同内容', 409);
        return packageResult(state, now);
      }
      assertStrongIfMatch(ifMatch, strongEtag(state));
      if (!state.batch || state.preflight?.status !== 'pass' || state.quote?.status !== 'current') throw contractError('VIDEO_BATCH_CONFIRMATION_NOT_READY', '免费预检尚未通过', 409);
      if (Date.parse(state.quote.expires_at) <= new Date(now).getTime()) throw contractError('VIDEO_BATCH_QUOTE_EXPIRED', '费用方案已过期，请刷新', 409);
      if (body?.confirm_generate !== true || String(body?.quote_revision||'') !== state.quote.revision) throw contractError('VIDEO_BATCH_CONFIRMATION_IDENTITY_INVALID', '确认内容与当前方案不一致', 409);
      const maximum = normalizeMoney(body.confirmed_max_cost, 'confirmed_max_cost');
      if (maximum.currency !== state.quote.estimated_cost.currency || maximum.minor_units < state.quote.estimated_cost.minor_units || maximum.minor_units > state.quote.max_cost.minor_units) throw contractError('VIDEO_BATCH_COST_CAP_INVALID', '费用上限不满足当前方案', 409);
      const eventBody = {schema_version:CONFIRMATION_SCHEMA,project_id:projectId,owner_id:ownerId,batch_revision:state.batch.batch_revision,batch_digest:state.batch.batch_digest,specs:state.batch.specs,spec_identity_digest:digest(state.batch.specs),task_count:state.batch.task_count,total_duration_seconds:state.batch.total_duration_seconds,parameters_digest:digest(state.batch.parameters),quote_revision:state.quote.revision,quote_expires_at:state.quote.expires_at,confirmed_max_cost:maximum,authority_revisions:state.batch.authority,authority_digest:digest(state.batch.authority),adapter_identity:state.adapter_identity,adapter_revision:state.adapter_revision,confirmed_at:iso(now),expires_at:state.quote.expires_at};
      const eventDigest = digest(eventBody);
      const authorization = {...eventBody,event_id:opaqueId('confirm', {event_digest:eventDigest,idempotency_key:key}, 32),event_digest:eventDigest,status:'current'};
      state.authorization = authorization;
      const action = activeAction(state); if (action) { action.status='resumed'; action.completed_at=iso(now); }
      state.idempotency[key] = {request_identity:requestIdentity,event_id:authorization.event_id,event_digest:eventDigest,recorded_at:iso(now)};
      state.revision += 1; state.updated_at=iso(now); state.blocker=null;
      state.submission = {schema_version:'provider_neutral.submission_reconcile.v1',...deriveSubmissionIdentity(state, now),status:'authorized_not_submitted',provider_task_id:null,receipt:null,submit_invocation_count:0,reconcile_required:false,updated_at:iso(now)};
      await save(state);
      return packageResult(state, now);
    });
  }

  async function rebatchForQuota({projectId, ownerId, affordableSpecIds, now = Date.now(), quoteTtlMs}) {
    const current = await getCurrent({projectId,ownerId,now});
    const ids = new Set((affordableSpecIds||[]).map(String));
    if (!ids.size || ids.size >= current.state.specs.length) throw contractError('VIDEO_BATCH_REBATCH_SCOPE_INVALID', '较小批次必须显式减少任务数量');
    const selected=current.state.specs.filter(spec => ids.has(spec.spec_id));
    const selectedGroupIds=new Set(selected.map(spec=>spec.video_group_id));
    const groups = selected.map(spec => ({group_id:spec.video_group_id,prompt:spec.prompt,references:spec.references,duration_seconds:spec.parameters.duration_seconds,aspect_ratio:spec.parameters.aspect_ratio,resolution:spec.parameters.resolution,audio_requirement:spec.parameters.audio_requirement,allowed_channel_class:spec.parameters.allowed_channel_class,dependency_group_ids:spec.dependency_group_ids.filter(id=>selectedGroupIds.has(id)),output_requirements:spec.output_requirements,qa_requirements:spec.qa_requirements}));
    if (groups.length !== ids.size) throw contractError('VIDEO_BATCH_REBATCH_SPEC_UNKNOWN', '较小批次包含未知任务');
    return lockAndPreflight({projectId,ownerId,ownerRef:current.state.owner_ref,input:{authority:current.state.batch.authority,groups},now,quoteTtlMs});
  }

  async function recordSubmissionStatus({projectId, ownerId, status, taskStates = [], now = Date.now()}) {
    return exclusive(projectId, async () => {
      const state = await load(projectId);
      if (!state || state.owner_id !== ownerId) throw contractError('VIDEO_BATCH_NOT_FOUND', '未找到当前视频方案', 404);
      if (!state.submission?.identity) throw contractError('VIDEO_BATCH_SUBMISSION_IDENTITY_MISSING', '尚未形成提交身份', 409);
      if (!['authorized_not_submitted','submitted','running','completed','unknown_after_network_error','failed'].includes(status)) throw contractError('VIDEO_BATCH_SUBMISSION_STATUS_INVALID', '提交状态无效');
      state.submission = {...state.submission,status,task_states:taskStates,reconcile_required:SUBMISSION_TERMINAL_OR_ACTIVE.has(status),submit_invocation_count:0,updated_at:iso(now)};
      state.revision += 1; state.updated_at=iso(now); await save(state); return packageResult(state, now);
    });
  }

  async function submissionDecision({projectId, ownerId, now = Date.now()}) {
    const {state} = await getCurrent({projectId,ownerId,now});
    const status = state.submission?.status || 'not_authorized';
    const reconcileRequired = SUBMISSION_TERMINAL_OR_ACTIVE.has(status);
    const taskStates=state.submission?.task_states||[];
    const statusBySpec=new Map(taskStates.map(item=>[item.spec_id,item.status]));
    const affected=new Set(taskStates.filter(item=>item.status==='failed').map(item=>item.spec_id));
    let changed=true;
    while(changed){changed=false;for(const spec of state.specs){if(affected.has(spec.spec_id)||['running','completed'].includes(statusBySpec.get(spec.spec_id)))continue;const upstream=state.specs.filter(item=>affected.has(item.spec_id)).map(item=>item.video_group_id);if(spec.dependency_group_ids.some(groupId=>upstream.includes(groupId))){affected.add(spec.spec_id);changed=true;}}}
    return {submission_identity:state.submission?.identity||null,status,reconcile_required:reconcileRequired,resubmit_allowed:status==='authorized_not_submitted'&&!reconcileRequired&&authorizationMatches(state,now),submit_invocation_count:0,affected_dependency_closure:[...affected]};
  }

  return {lockAndPreflight,getCurrent,confirm,rebatchForQuota,recordSubmissionStatus,submissionDecision,load};
}

module.exports = {ACTUAL_VIDEO_REF_ROLES,BATCH_SCHEMA,CONFIRMATION_SCHEMA,FIXTURE_ADAPTER_IDENTITY,PREFLIGHT_SCHEMA,QUOTE_SCHEMA,SCHEMA_VERSION,SPEC_SCHEMA,authorizationMatches,buildSpecsAndBatch,contractError,createFixtureAdapter,createService,deriveSubmissionIdentity,digest,displayState,normalizeMoney,publicProjection,safePublicObject,stableJson,strongEtag};
