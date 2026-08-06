'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 'niannian.localization_project_confirmation.v1';
const STORE_VERSION = 'niannian.localization_confirmation_store.v1';
const STRONG_ETAG = /^"[a-f0-9]{64}"$/;
const DOWNSTREAM_TARGETS = new Set([
  'S05A_SUPPORT_ASSETS',
  'S05B_FIRST_FRAMES',
  'video_task_spec',
  'provider_submit',
]);

class LocalizationConfirmationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'LocalizationConfirmationError';
    this.status = status;
    this.code = code;
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    if (value[key] !== undefined) out[key] = stable(value[key]);
    return out;
  }, {});
}

function strongEtag(candidate) {
  const semantic = {
    project_id: candidate.project_id,
    authority_revision: candidate.authority_revision,
    acceptance_identity: candidate.acceptance_identity,
    localization_revision: candidate.localization_revision,
    region_label: candidate.region_label,
    language_label: candidate.language_label,
    content: candidate.content,
  };
  return `"${crypto.createHash('sha256').update(JSON.stringify(stable(semantic))).digest('hex')}"`;
}

function assertAcceptedStep02(projectId, acceptedStep02) {
  if (!acceptedStep02 || typeof acceptedStep02 !== 'object') {
    throw new LocalizationConfirmationError(409, 'accepted_step02_required', '原片时间轴尚未确认');
  }
  const valid = acceptedStep02.project_id === projectId
    && typeof acceptedStep02.authority_revision === 'string'
    && acceptedStep02.authority_revision.length > 0
    && typeof acceptedStep02.acceptance_identity === 'string'
    && acceptedStep02.acceptance_identity.length > 0
    && acceptedStep02.accepted === true
    && acceptedStep02.artifact_ledger_verified === true
    && acceptedStep02.stale !== true
    && acceptedStep02.superseded !== true;
  if (!valid) {
    throw new LocalizationConfirmationError(409, 'accepted_step02_invalid', '原片时间轴尚未确认');
  }
  return acceptedStep02;
}

function assertIfMatch(ifMatch) {
  if (ifMatch === undefined || ifMatch === null || ifMatch === '') {
    throw new LocalizationConfirmationError(428, 'if_match_required', '请重新读取当前改编版本');
  }
  if (ifMatch === '*' || /^W\//i.test(ifMatch) || !STRONG_ETAG.test(ifMatch)) {
    throw new LocalizationConfirmationError(412, 'if_match_invalid', '改编草稿版本已变化，请重新读取');
  }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function providerTaskContract(task) {
  if (!task || typeof task !== 'object' || !String(task.task_id || '').trim()) {
    throw new LocalizationConfirmationError(400, 'provider_task_contract_invalid', '生成任务合同无效');
  }
  return stable({
    task_id:String(task.task_id),
    transaction_key:task.transaction_key || null,
    type:task.type || null,
    item_id:task.item_id || null,
    purpose:task.purpose || null,
    prompt_sha256:task.prompt_sha256 || null,
    references:task.references || [],
    provider:task.provider || null,
    aspect_ratio:task.aspect_ratio || null,
    resolution:task.resolution || null,
    attempt:task.attempt ?? null,
  });
}

function providerTaskDigest(task) {
  return crypto.createHash('sha256').update(JSON.stringify(providerTaskContract(task))).digest('hex');
}

function publicProjection(candidate, resolution) {
  const content = candidate && candidate.content && typeof candidate.content === 'object' ? candidate.content : {};
  const characterMappings = Array.isArray(content.character_mappings) ? content.character_mappings.map((item) => ({
    source_identity: item.source_identity,
    localized_identity: item.localized_identity,
    story_function: item.story_function,
  })) : [];
  const qa = content.qa_summary && typeof content.qa_summary === 'object' ? {
    status_label: content.qa_summary.status_label,
    findings: clone(content.qa_summary.findings || []),
    suggestions: clone(content.qa_summary.suggestions || []),
  } : null;
  const shots = Array.isArray(content.shots) ? content.shots.map((shot) => ({
    shot_label: shot.shot_label,
    time_range: shot.time_range,
    source_mapping_label: shot.source_mapping_label,
    localized_people: shot.localized_people,
    localized_setting: shot.localized_setting,
    action: shot.action,
    target_dialogue: shot.target_dialogue,
    chinese_back_translation: shot.chinese_back_translation,
    expression_intent: shot.expression_intent,
    cultural_replacements: shot.cultural_replacements,
    continuity_requirements: shot.continuity_requirements,
    duration_fit_label: shot.duration_fit_label,
    structure_change_label: shot.structure_change_label,
    manual_notes: shot.manual_notes,
    review_label: shot.review_label,
  })) : [];
  return {
    region_label: candidate ? candidate.region_label : undefined,
    language_label: candidate ? candidate.language_label : undefined,
    adaptation_summary: content.adaptation_summary,
    character_mappings: characterMappings,
    localization_principles: clone(content.localization_principles || []),
    continuity_rules: clone(content.continuity_rules || []),
    causality_notes: clone(content.causality_notes || []),
    shots,
    qa_summary: qa,
    workflow_state: candidate ? '核对改编草稿' : '选择地区',
    confirmation_state: resolution.public_state,
    confirmed_at: resolution.current ? resolution.confirmation.confirmed_at : undefined,
    is_stale: resolution.stale,
    stale_reason: resolution.stale_reason,
    primary_action_label: resolution.current ? '前往资产与首帧' : '确认当前改编',
    can_confirm: Boolean(candidate && resolution.candidate_binding_current && !resolution.current),
    can_enter_assets_frames: resolution.current,
    loading: false,
    error_message: resolution.error_message,
    retryable: resolution.retryable,
  };
}

function createLocalizationConfirmationStore({ filePath, namespace = 'fixture/test_only', now = () => new Date().toISOString() }) {
  if (!filePath) throw new Error('filePath is required');

  function emptyState() {
    return { schema_version: STORE_VERSION, namespace, projects: {} };
  }

  function read() {
    if (!fs.existsSync(filePath)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed.schema_version !== STORE_VERSION || parsed.namespace !== namespace) {
      throw new LocalizationConfirmationError(409, 'namespace_mismatch', '项目状态暂不可用');
    }
    return parsed;
  }

  function write(state) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temp = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temp, filePath);
  }

  function projectOf(state, projectId, create = false) {
    if (!state.projects[projectId] && create) {
      state.projects[projectId] = { project_id: projectId, revision_counter: 0, candidate: null, confirmation_events: [], history: [], provider_task_authorizations: {} };
    }
    return state.projects[projectId] || null;
  }

  function bindingMatches(candidate, s02) {
    return Boolean(candidate
      && candidate.project_id === s02.project_id
      && candidate.authority_revision === s02.authority_revision
      && candidate.acceptance_identity === s02.acceptance_identity);
  }

  function resolve(state, projectId, s02) {
    const project = projectOf(state, projectId);
    const candidate = project && project.candidate;
    const candidateBindingCurrent = bindingMatches(candidate, s02);
    const currentEtag = candidate ? strongEtag(candidate) : null;
    const confirmation = project && project.confirmation_events.length
      ? project.confirmation_events[project.confirmation_events.length - 1]
      : null;
    const current = Boolean(candidateBindingCurrent && confirmation
      && confirmation.project_id === projectId
      && confirmation.authority_revision === s02.authority_revision
      && confirmation.localization_revision === candidate.localization_revision
      && confirmation.confirmed_localization_etag === currentEtag);
    const stale = Boolean(confirmation && !current);
    let staleReason;
    if (stale && !candidateBindingCurrent) staleReason = '原片时间轴或项目依据已更新';
    else if (stale) staleReason = '改编草稿已修改';
    return {
      resolved: current,
      blocked: !current,
      current,
      stale,
      stale_reason: staleReason,
      public_state: current ? '已确认' : stale ? '已失效' : candidate ? '可确认' : '未生成',
      candidate_binding_current: candidateBindingCurrent,
      candidate,
      confirmation: current ? confirmation : null,
      historical_confirmation: confirmation,
      current_etag: currentEtag,
      error_message: candidateBindingCurrent ? undefined : candidate ? '项目依据已更新，请重新生成地区改编稿' : undefined,
      retryable: Boolean(candidate && !candidateBindingCurrent),
    };
  }

  function createCandidate({ projectId, acceptedStep02, authorityRevision, localizationRevision, regionLabel, languageLabel, content }) {
    const s02 = assertAcceptedStep02(projectId, acceptedStep02);
    if (authorityRevision !== s02.authority_revision) {
      throw new LocalizationConfirmationError(409, 'authority_revision_mismatch', '项目依据已更新');
    }
    const state = read();
    const project = projectOf(state, projectId, true);
    project.revision_counter += 1;
    const revision = localizationRevision || `loc-${project.revision_counter}`;
    if (typeof revision !== 'string' || !revision) throw new LocalizationConfirmationError(400, 'localization_revision_required', '改编版本无效');
    if (project.history.some((item) => item.localization_revision === revision)) {
      throw new LocalizationConfirmationError(409, 'localization_revision_reused', '改编版本已存在');
    }
    project.candidate = {
      project_id: projectId,
      authority_revision: s02.authority_revision,
      acceptance_identity: s02.acceptance_identity,
      localization_revision: revision,
      region_label: regionLabel,
      language_label: languageLabel,
      content: clone(content || {}),
      created_at: now(),
    };
    project.history.push(clone(project.candidate));
    write(state);
    return getStatus({ projectId, acceptedStep02: s02 });
  }

  function mutateCandidate({ projectId, acceptedStep02, ifMatch, mutation, localizationRevision }) {
    const s02 = assertAcceptedStep02(projectId, acceptedStep02);
    assertIfMatch(ifMatch);
    const state = read();
    const project = projectOf(state, projectId);
    const resolution = resolve(state, projectId, s02);
    if (!project || !resolution.candidate_binding_current || resolution.current_etag !== ifMatch) {
      throw new LocalizationConfirmationError(412, 'etag_stale', '改编草稿版本已变化，请重新读取');
    }
    const next = clone(project.candidate);
    mutation(next);
    const beforeSemantic = strongEtag(next);
    const sameSemantic = beforeSemantic === resolution.current_etag;
    if (sameSemantic) return getStatus({ projectId, acceptedStep02: s02 });
    project.revision_counter += 1;
    next.localization_revision = localizationRevision || `loc-${project.revision_counter}`;
    next.created_at = now();
    project.candidate = next;
    project.history.push(clone(next));
    write(state);
    return getStatus({ projectId, acceptedStep02: s02 });
  }

  function confirm({ projectId, acceptedStep02, ifMatch, actorId, canEdit = true }) {
    const s02 = assertAcceptedStep02(projectId, acceptedStep02);
    assertIfMatch(ifMatch);
    if (!canEdit || !actorId) throw new LocalizationConfirmationError(403, 'confirmation_forbidden', '您无权确认当前改编');
    const state = read();
    const project = projectOf(state, projectId);
    const resolution = resolve(state, projectId, s02);
    if (!project || !resolution.candidate_binding_current || resolution.current_etag !== ifMatch) {
      throw new LocalizationConfirmationError(412, 'etag_stale', '改编草稿版本已变化，请重新读取');
    }
    if (resolution.current) return { idempotent: true, etag: resolution.current_etag, confirmation: clone(resolution.confirmation), public: publicProjection(project.candidate, resolution) };
    const event = {
      schema_version: SCHEMA_VERSION,
      project_id: projectId,
      authority_revision: s02.authority_revision,
      localization_revision: project.candidate.localization_revision,
      confirmed_localization_etag: resolution.current_etag,
      candidate_etag: resolution.current_etag,
      confirmed_at: now(),
      confirmed_by: actorId,
    };
    project.confirmation_events.push(event);
    write(state);
    const current = resolve(state, projectId, s02);
    return { idempotent: false, etag: current.current_etag, confirmation: clone(event), public: publicProjection(project.candidate, current) };
  }

  function getStatus({ projectId, acceptedStep02 }) {
    const s02 = assertAcceptedStep02(projectId, acceptedStep02);
    const state = read();
    const resolution = resolve(state, projectId, s02);
    return { etag: resolution.current_etag, internal: clone(resolution), public: publicProjection(resolution.candidate, resolution) };
  }

  function reconcile(args) {
    return getStatus(args);
  }

  function requireDownstream({ projectId, acceptedStep02, target, consumerNamespace = namespace }) {
    const s02 = assertAcceptedStep02(projectId, acceptedStep02);
    if (!DOWNSTREAM_TARGETS.has(target)) throw new LocalizationConfirmationError(400, 'downstream_target_invalid', '下游类型无效');
    if (consumerNamespace !== namespace || (namespace === 'fixture/test_only' && consumerNamespace !== 'fixture/test_only')) {
      throw new LocalizationConfirmationError(409, 'namespace_mismatch', '项目状态暂不可用');
    }
    const state = read();
    const resolution = resolve(state, projectId, s02);
    if (!resolution.current) {
      throw new LocalizationConfirmationError(409, 'localization_confirmation_required', resolution.stale_reason || '请先确认当前地区改编稿');
    }
    return {
      localization_confirmation_passed: true,
      target,
      confirmation_ref: {
        project_id: projectId,
        authority_revision: s02.authority_revision,
        localization_revision: resolution.candidate.localization_revision,
        confirmed_localization_etag: resolution.current_etag,
      },
      next_gate_required: true,
    };
  }

  function authorizeProviderTasks({projectId,acceptedStep02,localizationRevision,tasks,taskIds}) {
    const passed=requireDownstream({projectId,acceptedStep02,target:'provider_submit',consumerNamespace:namespace});
    if (passed.confirmation_ref.localization_revision !== localizationRevision) throw new LocalizationConfirmationError(409,'localization_revision_conflict','地区改编稿版本不匹配');
    const contracts=[];
    for(const task of Array.isArray(tasks)?tasks:[])contracts.push(providerTaskContract(task));
    for(const taskId of Array.isArray(taskIds)?taskIds:[])contracts.push(providerTaskContract({task_id:String(taskId)}));
    const unique=[...new Map(contracts.map(contract=>[contract.task_id,contract])).values()];
    if (!unique.length) return {authorized:0,reused:0,stale_skipped:0};
    const state=read(),project=projectOf(state,projectId);
    project.provider_task_authorizations=project.provider_task_authorizations||{};
    let authorized=0,reused=0,staleSkipped=0;
    for (const contract of unique) {
      const taskId=contract.task_id,digest=providerTaskDigest(contract),existing=project.provider_task_authorizations[taskId];
      if(existing){
        const same=existing.localization_revision===passed.confirmation_ref.localization_revision&&existing.confirmed_localization_etag===passed.confirmation_ref.confirmed_localization_etag&&existing.authority_revision===passed.confirmation_ref.authority_revision&&existing.task_input_digest===digest;
        if(same)reused+=1;else staleSkipped+=1;
        continue;
      }
      project.provider_task_authorizations[taskId]={task_id:taskId,task_input_digest:digest,...passed.confirmation_ref,authorized_at:now()};
      authorized+=1;
    }
    write(state);
    return {authorized,reused,stale_skipped:staleSkipped};
  }

  function requireProviderTask({projectId,acceptedStep02,taskId,task}) {
    const passed=requireDownstream({projectId,acceptedStep02,target:'provider_submit',consumerNamespace:namespace}),state=read(),project=projectOf(state,projectId),authorization=project?.provider_task_authorizations?.[taskId];
    if (!authorization || authorization.localization_revision !== passed.confirmation_ref.localization_revision || authorization.confirmed_localization_etag !== passed.confirmation_ref.confirmed_localization_etag || authorization.authority_revision !== passed.confirmation_ref.authority_revision) throw new LocalizationConfirmationError(409,'provider_task_localization_authority_required','当前任务缺少有效的地区改编确认绑定');
    if(task&&authorization.task_input_digest!==providerTaskDigest(task))throw new LocalizationConfirmationError(409,'provider_task_input_binding_mismatch','生成任务内容与地区改编确认不匹配');
    return {allowed:true,confirmation_ref:passed.confirmation_ref,task_id:taskId};
  }

  function setLegacyProjection({ projectId, legacy }) {
    const state = read();
    const project = projectOf(state, projectId, true);
    project.legacy_projection = clone(legacy || {});
    write(state);
  }

  function invalidate({ projectId, reason = '地区改编内容已修改' }) {
    const state = read();
    const project = projectOf(state, projectId);
    if (!project || !project.candidate) throw new LocalizationConfirmationError(409, 'localization_candidate_required', '请先生成地区改编稿');
    const latest=project.confirmation_events.at(-1),currentEtag=strongEtag(project.candidate);
    if(!latest||latest.localization_revision!==project.candidate.localization_revision||latest.confirmed_localization_etag!==currentEtag)return {invalidated:false};
    project.revision_counter += 1;
    project.candidate = {
      ...project.candidate,
      localization_revision:`loc-${project.revision_counter}`,
      content:{...project.candidate.content,invalidation:{reason:String(reason).slice(0,500),at:now()}},
      created_at:now(),
    };
    project.history.push(clone(project.candidate));
    write(state);
    return { invalidated:true };
  }

  return { createCandidate, mutateCandidate, confirm, getStatus, reconcile, requireDownstream, authorizeProviderTasks, requireProviderTask, setLegacyProjection, invalidate, _read: read };
}

function createLocalizationConfirmationService({ root, now } = {}) {
  const store = createLocalizationConfirmationStore({
    filePath:path.join(path.resolve(root || path.join(process.cwd(), 'data', 'localization-confirmation')), 'store.json'),
    namespace:'production',
    now,
  });
  const normalizeAccepted = (acceptedStep02, projectId, authorityRevision) => ({
    ...acceptedStep02,
    project_id:acceptedStep02?.project_id || acceptedStep02?.authority_binding?.project_id || projectId,
    authority_revision:acceptedStep02?.authority_revision || acceptedStep02?.authority_binding?.authority_revision || authorityRevision,
    acceptance_identity:acceptedStep02?.acceptance_identity || acceptedStep02?.acceptance_sha256 || acceptedStep02?.authority_binding?.acceptance_identity,
    accepted:acceptedStep02?.accepted === true || acceptedStep02?.status === 'accepted',
    artifact_ledger_verified:acceptedStep02?.artifact_ledger_verified === true || acceptedStep02?.downstream_consumable === true,
  });
  const compatibilityStatus = status => ({
    schema_version:SCHEMA_VERSION,
    stage:status.public.workflow_state,
    candidate:status.internal.candidate ? {
      status:'candidate',
      target_region:{code:status.internal.candidate.region_label,label:status.public.language_label || status.public.region_label},
      localization_revision:status.internal.candidate.localization_revision,
      projection:status.internal.candidate.content._legacy_projection,
      created_at:status.internal.candidate.created_at,
      updated_at:status.internal.candidate.created_at,
    } : null,
    confirmation:{status:status.internal.current?'confirmed':status.internal.stale?'stale':'not_confirmed',confirmed_at:status.public.confirmed_at || status.internal.historical_confirmation?.confirmed_at || null},
    downstream_ready:status.internal.current,
    etag:status.etag,
    public:status.public,
  });
  function contentFromProjection(projection = {}) {
    return {
      adaptation_summary:projection.story_outline_zh,
      character_mappings:(projection.character_relationship_adaptations || []).map(row=>({source_identity:row.source_name,localized_identity:row.localized_name,story_function:row.relationship})),
      localization_principles:projection.replacements?.cultural_context || [],
      continuity_rules:projection.confirmation_items || [],
      causality_notes:[projection.story_outline_zh].filter(Boolean),
      shots:(projection.localized_key_dialogue || []).map((row,index)=>({shot_label:'关键对白 '+(index+1),localized_people:row.speaker,target_dialogue:row.localized_text,chinese_back_translation:row.source_text,cultural_replacements:[],continuity_requirements:[]})),
      qa_summary:{status_label:'待项目确认',findings:projection.confirmation_items || [],suggestions:[]},
      _legacy_projection:clone(projection),
    };
  }
  return {
    async createCandidate({projectId,authorityRevision,acceptedStep02,targetRegion,projection,idempotencyKey}) {
      const binding=normalizeAccepted(acceptedStep02,projectId,authorityRevision);
      const localizationRevision='loc-'+crypto.createHash('sha256').update(JSON.stringify(stable({projectId,authorityRevision,targetRegion,projection,idempotencyKey}))).digest('hex').slice(0,24);
      try {
        const status=store.createCandidate({projectId,acceptedStep02:binding,authorityRevision,localizationRevision,regionLabel:targetRegion?.code,languageLabel:targetRegion?.label,content:contentFromProjection(projection)});
        return {candidate:compatibilityStatus(status).candidate,confirmation:compatibilityStatus(status).confirmation,etag:status.etag,idempotent:false};
      } catch (error) {
        if (error.code !== 'localization_revision_reused') throw error;
        const status=store.getStatus({projectId,acceptedStep02:binding});
        if (status.internal.candidate?.localization_revision !== localizationRevision) throw error;
        return {candidate:compatibilityStatus(status).candidate,confirmation:compatibilityStatus(status).confirmation,etag:status.etag,idempotent:true};
      }
    },
    async confirm({projectId,authorityRevision,acceptedStep02,localizationRevision,ifMatch,actor}) {
      const binding=normalizeAccepted(acceptedStep02,projectId,authorityRevision),status=store.getStatus({projectId,acceptedStep02:binding});
      if (status.internal.candidate?.localization_revision !== localizationRevision) throw new LocalizationConfirmationError(409,'localization_revision_conflict','地区改编稿已更新，请重新读取');
      const result=store.confirm({projectId,acceptedStep02:binding,ifMatch,actorId:actor,canEdit:true});
      return {confirmation:{status:'confirmed',confirmed_at:result.confirmation.confirmed_at},etag:result.etag,idempotent:result.idempotent,event_id:result.confirmation.confirmed_localization_etag};
    },
    async getStatus({projectId,authorityRevision,acceptedStep02}) { return compatibilityStatus(store.getStatus({projectId,acceptedStep02:normalizeAccepted(acceptedStep02,projectId,authorityRevision)})); },
    async reconcileAuthority({projectId,authorityRevision,acceptedStep02}) { return compatibilityStatus(store.reconcile({projectId,acceptedStep02:normalizeAccepted(acceptedStep02,projectId,authorityRevision)})); },
    async invalidateForChange({projectId,reason}) { return store.invalidate({projectId,reason}); },
    async requireDownstream({projectId,authorityRevision,acceptedStep02,localizationRevision,consumer,legacyState}) {
      const binding=normalizeAccepted(acceptedStep02,projectId,authorityRevision),status=store.getStatus({projectId,acceptedStep02:binding});
      if (status.internal.candidate?.localization_revision !== localizationRevision) throw new LocalizationConfirmationError(409,'localization_revision_conflict','地区改编稿版本不匹配');
      const target={video_task_spec_locked:'video_task_spec',PROVIDER_PREFLIGHT:'provider_submit'}[consumer] || consumer;
      const result=store.requireDownstream({projectId,acceptedStep02:binding,target,consumerNamespace:'production'});
      return {...result,legacy_projection_ignored:Boolean(legacyState)};
    },
    async authorizeProviderTasks({projectId,authorityRevision,acceptedStep02,localizationRevision,tasks,taskIds}) {
      return store.authorizeProviderTasks({projectId,acceptedStep02:normalizeAccepted(acceptedStep02,projectId,authorityRevision),localizationRevision,tasks,taskIds});
    },
    async requireProviderTask({projectId,authorityRevision,acceptedStep02,taskId,task}) {
      return store.requireProviderTask({projectId,acceptedStep02:normalizeAccepted(acceptedStep02,projectId,authorityRevision),taskId,task});
    },
  };
}

module.exports = {
  LocalizationConfirmationError,
  createLocalizationConfirmationStore,
  createLocalizationConfirmationService,
  strongEtag,
};
