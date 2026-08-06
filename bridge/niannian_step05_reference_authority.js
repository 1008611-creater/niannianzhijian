'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REF_TYPES = Object.freeze([
  'support_asset_ref',
  'video_first_frame_anchor',
  'video_upload_non_first_ref'
]);
const VIDEO_TYPES = new Set(['video_first_frame_anchor', 'video_upload_non_first_ref']);
const QA_STATUSES = new Set(['pending', 'checking', 'pass', 'failed', 'low_confidence', 'blocker']);
const USER_ACTION_QA = new Set(['failed', 'low_confidence', 'blocker']);
const PROVIDER_ACTIONS = new Set(['video_task_spec', 'provider_preflight', 'provider_upload', 'provider_submit']);

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function strongEtag(state) { return '"' + sha(stable(state)) + '"'; }
function fail(code, message, httpStatus = 409) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}
function requireText(value, field) {
  const result = text(value);
  if (!result) throw fail('INVALID_REFERENCE_CONTRACT', field + ' is required', 400);
  return result;
}
function requireSha(value, field) {
  const result = requireText(value, field).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(result)) throw fail('INVALID_CONTENT_SHA', field + ' must be SHA-256', 400);
  return result;
}
function actualVideoInput(canonicalType) { return VIDEO_TYPES.has(canonicalType); }
function publicText(value, fallback = '') {
  const result = text(value);
  if (!result) return fallback;
  const unsafe = /(?:[a-z]:\\|\\\\|\/[^\s]*\/|\b[a-f0-9]{64}\b|(?:provider|receipt|task[_ -]?id|prompt|internal|signature|token|x-amz-|[?&](?:sig|signature|token)=))/i;
  return unsafe.test(result) ? fallback : result.slice(0, 240);
}
function safeSourceFact(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const fact = {label:publicText(source.label, '原片来源事实已记录')};
  const description = publicText(source.description);
  if (description) fact.description = description;
  const startSec = Number(source.start_sec);
  if (Number.isFinite(startSec) && startSec >= 0) fact.start_sec = startSec;
  return fact;
}
function publicMediaRoute(projectId, refKey, kind) {
  return '/api/projects/' + encodeURIComponent(projectId) + '/step05/references/' + encodeURIComponent(refKey) + '/' + kind;
}
function exactIdentity(ref) {
  return {
    project_id: ref.project_id,
    authority_revision: ref.authority_revision,
    localization_revision: ref.localization_revision,
    ref_key: ref.ref_key,
    candidate_revision: ref.candidate.candidate_revision,
    content_sha: ref.candidate.content_sha,
    authority_event_id: ref.authority_event_id
  };
}
function sameExact(left, right) {
  return ['project_id','authority_revision','localization_revision','ref_key','candidate_revision','content_sha','authority_event_id']
    .every(key => left && right && left[key] === right[key]);
}

function validateReference(input, project) {
  const canonicalType = requireText(input.canonical_type, 'canonical_type');
  if (!REF_TYPES.includes(canonicalType)) throw fail('INVALID_REFERENCE_TYPE', 'unsupported canonical_type', 400);
  const ref = {
    project_id: requireText(input.project_id || project.project_id, 'project_id'),
    ref_key: requireText(input.ref_key, 'ref_key'),
    canonical_type: canonicalType,
    actual_video_input: actualVideoInput(canonicalType),
    required: input.required === true,
    authority_revision: requireText(input.authority_revision || project.authority_revision, 'authority_revision'),
    localization_revision: requireText(input.localization_revision || project.localization_revision, 'localization_revision'),
    authority_event_id: requireText(input.authority_event_id, 'authority_event_id'),
    authority_source: requireText(input.authority_source, 'authority_source'),
    reference_role_cn: requireText(input.reference_role_cn, 'reference_role_cn'),
    video_group: text(input.video_group),
    purpose_cn: requireText(input.purpose_cn, 'purpose_cn'),
    source_fact_projection: clone(input.source_fact_projection || {}),
    related_support_ref_keys: Array.isArray(input.related_support_ref_keys) ? [...new Set(input.related_support_ref_keys.map(text).filter(Boolean))] : [],
    locked_prompt_lineage: clone(input.locked_prompt_lineage || {}),
    dependencies: Array.isArray(input.dependencies) ? clone(input.dependencies) : [],
    readback: clone(input.readback || {}),
    qa: clone(input.qa || {status:'pending', problem_cn:'', actions:[]}),
    candidate: clone(input.candidate || {}),
    confirmation: null,
    rejection: null,
    current: true
  };
  requireText(ref.candidate.candidate_revision, 'candidate.candidate_revision');
  ref.candidate.content_sha = requireSha(ref.candidate.content_sha, 'candidate.content_sha');
  if (ref.canonical_type === 'support_asset_ref') {
    for (const [field, value] of [['locked_prompt_lineage',ref.locked_prompt_lineage],['readback',ref.readback]]) {
      if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) throw fail('INVALID_STEP05A_LINEAGE', field + ' is required', 400);
    }
    if (!Array.isArray(ref.dependencies)) throw fail('INVALID_STEP05A_LINEAGE', 'dependencies is required', 400);
  }
  const qaStatus = text(ref.qa.status) || 'pending';
  if (!QA_STATUSES.has(qaStatus)) throw fail('INVALID_QA_STATUS', 'unsupported qa status', 400);
  ref.qa.status = qaStatus;
  ref.qa.problem_cn = text(ref.qa.problem_cn);
  ref.qa.actions = Array.isArray(ref.qa.actions) ? ref.qa.actions.filter(action => ['reroll','remove','return_upstream'].includes(action)) : [];
  if (USER_ACTION_QA.has(qaStatus) && (!/[\u3400-\u9fff]/.test(ref.qa.problem_cn) || !ref.qa.actions.length)) {
    throw fail('QA_ACTION_REQUIRED', '异常质量检查必须提供中文问题和处理动作', 400);
  }
  if (qaStatus === 'pass') ref.qa.actions = [];
  return ref;
}

class Step05ReferenceAuthority {
  constructor(options = {}) {
    this.stateFile = path.resolve(requireText(options.stateFile, 'stateFile'));
    this.now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
    this.state = fs.existsSync(this.stateFile) ? JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) : null;
  }

  initialize(input) {
    if (this.state) return this.snapshot();
    const deliveryTarget = text(input.delivery_target) || 'FIRST_REAL_VIDEO_PLAYABLE';
    const executionScope = clone(input.execution_scope || {});
    if (deliveryTarget !== 'FIRST_REAL_VIDEO_PLAYABLE' || executionScope.mode !== 'minimal_first_video' || !Array.isArray(executionScope.video_group_ids) || executionScope.video_group_ids.length !== 1) {
      throw fail('INVALID_EXECUTION_SCOPE', 'minimal first-video execution scope is required', 400);
    }
    const project = {
      project_id: requireText(input.project_id, 'project_id'),
      authority_revision: requireText(input.authority_revision, 'authority_revision'),
      localization_revision: requireText(input.localization_revision, 'localization_revision'),
      delivery_target: deliveryTarget,
      execution_scope: executionScope
    };
    const refs = (input.references || []).map(item => validateReference(item, project));
    if (!refs.length) throw fail('REFERENCES_REQUIRED', 'references are required', 400);
    if (new Set(refs.map(ref => ref.ref_key)).size !== refs.length) throw fail('DUPLICATE_CURRENT_REF_KEY', 'only one current authority is allowed per ref_key', 400);
    const allowedVideoGroups = new Set(executionScope.video_group_ids);
    for (const ref of refs.filter(item => item.actual_video_input)) {
      if (!allowedVideoGroups.has(ref.video_group)) throw fail('VIDEO_REFERENCE_OUT_OF_SCOPE', '实际视频参考必须属于当前最小视频组', 400);
    }
    this.state = {schema_version:'1.0.0', project, refs, history:[], events:[], idempotency:{}, updated_at:this.now()};
    this.persist();
    return this.snapshot();
  }

  persist() {
    fs.mkdirSync(path.dirname(this.stateFile), {recursive:true});
    const temp = this.stateFile + '.' + process.pid + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2) + '\n', {encoding:'utf8', mode:0o600});
    fs.renameSync(temp, this.stateFile);
  }

  ensureState() { if (!this.state) throw fail('STATE_NOT_INITIALIZED', 'state is not initialized', 409); }
  snapshot() { this.ensureState(); return {etag:strongEtag(this.state), state:clone(this.state)}; }
  etag() { this.ensureState(); return strongEtag(this.state); }
  assertMatch(ifMatch) {
    if (!text(ifMatch)) throw fail('IF_MATCH_REQUIRED', 'If-Match is required', 428);
    if (ifMatch !== this.etag()) throw fail('ETAG_MISMATCH', 'state has changed', 412);
  }
  current(refKey) {
    this.ensureState();
    const ref = this.state.refs.find(item => item.ref_key === refKey && item.current === true);
    if (!ref) throw fail('CURRENT_REFERENCE_NOT_FOUND', 'current reference not found', 404);
    return ref;
  }
  commit(event) {
    this.state.events.push(event);
    this.state.updated_at = this.now();
    this.persist();
    return this.snapshot();
  }

  recordSupportQa({ifMatch, ref_key, status, confidence = null, problem_cn = '', actions = []}) {
    this.assertMatch(ifMatch);
    const ref = this.current(ref_key);
    if (ref.canonical_type !== 'support_asset_ref') throw fail('QA_SUPPORT_ONLY', 'automatic QA is support asset only', 409);
    if (!QA_STATUSES.has(status)) throw fail('INVALID_QA_STATUS', 'unsupported qa status', 400);
    const cleanProblem = text(problem_cn);
    const cleanActions = Array.isArray(actions) ? actions.filter(action => ['reroll','remove','return_upstream'].includes(action)) : [];
    if (USER_ACTION_QA.has(status) && (!/[\u3400-\u9fff]/.test(cleanProblem) || !cleanActions.length)) throw fail('QA_ACTION_REQUIRED', '异常质量检查必须提供中文问题和处理动作', 400);
    ref.qa = {status, confidence, problem_cn:cleanProblem, actions:status === 'pass' ? [] : cleanActions, checked_at:this.now()};
    return this.commit({event_type:'support_qa_recorded', ref_key, status, occurred_at:this.now()});
  }

  registerStep04Authority({ifMatch, reference}) {
    this.assertMatch(ifMatch);
    if (reference.authority_source !== 'step04_explicit_registration') throw fail('STEP04_REGISTRATION_REQUIRED', 'explicit Step04 registration is required', 409);
    const prior = this.current(reference.ref_key);
    const next = validateReference(reference, this.state.project);
    if (next.actual_video_input && !this.state.project.execution_scope.video_group_ids.includes(next.video_group)) throw fail('VIDEO_REFERENCE_OUT_OF_SCOPE', '实际视频参考必须属于当前最小视频组', 400);
    if (prior.canonical_type === 'support_asset_ref' && next.canonical_type !== 'video_upload_non_first_ref') {
      throw fail('INVALID_SUPPORT_PROMOTION', 'support assets may only be re-registered as a non-first video reference', 409);
    }
    if (prior.canonical_type === 'support_asset_ref' && next.authority_revision === prior.authority_revision) {
      throw fail('NEW_AUTHORITY_REVISION_REQUIRED', 'a new authority revision is required', 409);
    }
    prior.current = false;
    if (prior.confirmation) prior.confirmation.valid = false;
    this.state.history.push(clone(prior));
    this.state.refs = this.state.refs.filter(item => item !== prior);
    this.state.refs.push(next);
    if (this.state.project.authority_revision !== next.authority_revision) {
      this.state.project.authority_revision = next.authority_revision;
      for (const ref of this.state.refs) {
        if (ref.confirmation && ref.confirmation.authority_revision !== next.authority_revision) ref.confirmation.valid = false;
      }
    }
    return this.commit({event_type:'step04_authority_registered', ref_key:next.ref_key, authority_event_id:next.authority_event_id, occurred_at:this.now()});
  }

  batchConfirm({ifMatch, idempotency_key, items, confirmed_at}) {
    this.ensureState();
    if (!text(ifMatch)) throw fail('IF_MATCH_REQUIRED', 'If-Match is required', 428);
    const key = requireText(idempotency_key, 'idempotency_key');
    const requestHash = sha(stable({items}));
    const replay = this.state.idempotency[key];
    if (replay) {
      if (replay.request_hash !== requestHash) throw fail('IDEMPOTENCY_CONFLICT', 'idempotency payload differs', 409);
      return {...clone(replay.result), idempotent:true};
    }
    this.assertMatch(ifMatch);
    if (!Array.isArray(items) || !items.length) throw fail('CONFIRM_ITEMS_REQUIRED', 'confirmation items are required', 400);
    const pendingRequired = this.state.refs.filter(ref => ref.current && ref.required && ref.actual_video_input)
      .filter(ref => ref.qa.status !== 'pass' || ref.rejection || !ref.confirmation || ref.confirmation.valid !== true || !sameExact(ref.confirmation, exactIdentity(ref)) || ref.authority_revision !== this.state.project.authority_revision || ref.localization_revision !== this.state.project.localization_revision);
    if (items.length !== pendingRequired.length || new Set(items.map(item => item.ref_key)).size !== items.length || items.some(item => !pendingRequired.some(ref => ref.ref_key === item.ref_key))) {
      throw fail('BATCH_CONFIRM_INCOMPLETE', 'all currently pending video references must be included exactly once', 409);
    }
    const refs = items.map(item => {
      const ref = this.current(item.ref_key);
      if (!ref.actual_video_input || !ref.required || ref.qa.status !== 'pass' || ref.rejection || !sameExact(item, exactIdentity(ref))) {
        throw fail('BATCH_CONFIRM_STALE_OR_INVALID', 'confirmation item is stale or invalid', 409);
      }
      return ref;
    });
    const batchId = 'confirm-' + sha(key + ':' + requestHash).slice(0, 24);
    const when = requireText(confirmed_at, 'confirmed_at');
    for (const ref of refs) ref.confirmation = {...exactIdentity(ref), batch_id:batchId, confirmed_at:when, valid:true};
    this.state.events.push({event_type:'batch_confirmed', batch_id:batchId, ref_keys:refs.map(ref => ref.ref_key), confirmed_at:when});
    this.state.updated_at = this.now();
    const result = {ok:true, idempotent:false, batch_id:batchId, confirmed_count:refs.length};
    this.state.idempotency[key] = {request_hash:requestHash, result};
    this.persist();
    return clone(result);
  }

  reject({ifMatch, ref_key, issue_category, note = ''}) {
    this.assertMatch(ifMatch);
    const ref = this.current(ref_key);
    if (!ref.actual_video_input) throw fail('REJECT_VIDEO_ONLY', 'user rejection applies to video references', 409);
    ref.rejection = {issue_category:requireText(issue_category, 'issue_category'), note:text(note), rejected_at:this.now()};
    if (ref.confirmation) ref.confirmation.valid = false;
    return this.commit({event_type:'reference_rejected', ref_key, issue_category, occurred_at:this.now()});
  }

  reroll({ifMatch, ref_key, candidate_revision, content_sha, authority_event_id, public_candidate_url = ''}) {
    this.assertMatch(ifMatch);
    const ref = this.current(ref_key);
    const nextRevision = requireText(candidate_revision, 'candidate_revision');
    const nextSha = requireSha(content_sha, 'content_sha');
    if (nextRevision === ref.candidate.candidate_revision || nextSha === ref.candidate.content_sha) throw fail('REROLL_MUST_CHANGE_EXACT_CANDIDATE', 'reroll must change revision and content', 409);
    this.state.history.push({...clone(ref), current:false});
    ref.candidate = {candidate_revision:nextRevision, content_sha:nextSha, public_candidate_url:text(public_candidate_url)};
    ref.authority_event_id = requireText(authority_event_id, 'authority_event_id');
    ref.confirmation = null;
    ref.rejection = null;
    return this.commit({event_type:'candidate_rerolled', ref_key, candidate_revision:nextRevision, occurred_at:this.now()});
  }

  requestAction({ifMatch, ref_key, action, note = ''}) {
    this.assertMatch(ifMatch);
    const ref = this.current(ref_key);
    const allowed = ref.actual_video_input ? new Set(['reroll']) : new Set(['reroll','remove','return_upstream']);
    if (!allowed.has(action)) throw fail('REFERENCE_ACTION_INVALID', '当前素材不支持此处理动作', 400);
    if (action === 'remove') {
      ref.current = false;
      if (ref.confirmation) ref.confirmation.valid = false;
      this.state.history.push(clone(ref));
      this.state.refs = this.state.refs.filter(item => item !== ref);
    } else {
      ref.action_request = {action, note:text(note), requested_at:this.now()};
    }
    return this.commit({event_type:'reference_action_requested', ref_key, action, occurred_at:this.now()});
  }

  gateStatus() {
    this.ensureState();
    const required = this.state.refs.filter(ref => ref.current && ref.required && ref.actual_video_input);
    const pending = required.filter(ref => ref.qa.status !== 'pass' || ref.rejection || !ref.confirmation || ref.confirmation.valid !== true || !sameExact(ref.confirmation, exactIdentity(ref)) || ref.authority_revision !== this.state.project.authority_revision || ref.localization_revision !== this.state.project.localization_revision);
    return {video_task_spec_locked:required.length > 0 && pending.length === 0, required_count:required.length, confirmed_count:required.length-pending.length, pending_ref_keys:pending.map(ref => ref.ref_key)};
  }

  assertDownstreamAllowed(action) {
    if (!PROVIDER_ACTIONS.has(action)) throw fail('UNKNOWN_GATE_ACTION', 'unknown gate action', 400);
    const gate = this.gateStatus();
    if (!gate.video_task_spec_locked) throw fail('VIDEO_REFERENCES_NOT_CONFIRMED', '请先确认本批全部视频参考图', 409);
    return gate;
  }

  userProjection() {
    this.ensureState();
    const support = this.state.refs.filter(ref => ref.current && ref.canonical_type === 'support_asset_ref');
    const checked = support.filter(ref => ref.qa.status === 'pass');
    const needsAction = support.filter(ref => USER_ACTION_QA.has(ref.qa.status));
    const video = this.state.refs.filter(ref => ref.current && ref.actual_video_input);
    const gate = this.gateStatus();
    const supportCard = ref => ({ref_key:ref.ref_key, title:publicText(ref.purpose_cn, '支撑素材'), status:ref.qa.status === 'pass' ? '系统已检查' : '需要您处理', problem_cn:publicText(ref.qa.problem_cn), actions:clone(ref.qa.actions)});
    const videoCard = ref => ({
      ref_key:ref.ref_key,
      canonical_type:ref.canonical_type,
      source_fact:safeSourceFact(ref.source_fact_projection),
      candidate_url:publicMediaRoute(ref.project_id, ref.ref_key, 'candidate'),
      video_group:ref.video_group,
      purpose:publicText(ref.purpose_cn, '视频参考图'),
      reference_duty:publicText(ref.reference_role_cn, '用于保持视频画面一致'),
      related_support_assets:ref.related_support_ref_keys.map(key => support.find(item => item.ref_key === key)).filter(Boolean).map(item => ({ref_key:item.ref_key,title:publicText(item.purpose_cn, '关联支撑素材')})),
      decision:ref.rejection ? '不通过' : ref.confirmation && ref.confirmation.valid ? '通过' : '待确认',
      issue_category:ref.rejection ? ref.rejection.issue_category : '',
      note:ref.rejection ? ref.rejection.note : ''
    });
    return {
      status: gate.video_task_spec_locked ? '视频参考图已确认' : needsAction.length ? '需要您处理' : video.length ? '等待确认视频参考图' : support.some(ref => ['pending','checking'].includes(ref.qa.status)) ? '系统正在检查' : '正在生成素材',
      counts:{system_checked:checked.length, needs_action:needsAction.length, video_reference_total:video.length, video_reference_pending:gate.pending_ref_keys.length},
      support_assets:{system_checked:checked.map(supportCard), needs_action:needsAction.map(supportCard)},
      video_reference_cards:video.map(videoCard),
      video_references_confirmed:gate.video_task_spec_locked
    };
  }
}

module.exports = {REF_TYPES, VIDEO_TYPES, QA_STATUSES, Step05ReferenceAuthority, actualVideoInput, exactIdentity, sameExact, strongEtag};
