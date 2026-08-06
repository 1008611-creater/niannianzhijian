'use strict';

const crypto = require('crypto');

function fail(code, message, httpStatus = 409) {
  const error = new Error(message);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(stable(value)).digest('hex');
}

function requiredText(value, field) {
  const result = String(value || '').trim();
  if (!result) throw fail('VIDEO_BATCH_INPUT_LINEAGE_MISSING', field + ' 缺失');
  return result;
}

function buildVideoBatchInput({project, step05Context, step03Plan, step04Registry, defaults = {}} = {}) {
  if (!project || !step05Context?.service || !step03Plan || !step04Registry) {
    throw fail('VIDEO_BATCH_INPUT_DEPENDENCY_MISSING', '视频批次权威输入不完整');
  }
  step05Context.service.assertDownstreamAllowed('video_task_spec');
  const state = step05Context.service.snapshot().state;
  const scope = state.project?.execution_scope;
  if (scope?.mode !== 'minimal_first_video' || stable(scope.video_group_ids) !== stable(['V01'])) {
    throw fail('VIDEO_BATCH_EXECUTION_SCOPE_INVALID', '当前仅允许锁定第一条最小验证视频');
  }
  if (step04Registry.project_id !== project.id || step04Registry.authority_revision !== step05Context.authorityRevision || step04Registry.localization_revision !== step05Context.localizationRevision) {
    throw fail('VIDEO_BATCH_STEP04_REGISTRY_STALE', '视频参考职责已更新');
  }
  const refs = state.refs.filter(ref => ref.current && ref.required && ref.actual_video_input && ref.video_group === 'V01');
  if (!refs.length || refs.some(ref => ref.qa?.status !== 'pass' || ref.rejection || ref.confirmation?.valid !== true)) {
    throw fail('VIDEO_BATCH_REFERENCE_GATE_BLOCKED', '视频参考图尚未全部确认');
  }
  const confirmationBatches = [...new Set(refs.map(ref => requiredText(ref.confirmation?.batch_id, 'reference confirmation batch')))];
  if (confirmationBatches.length !== 1) throw fail('VIDEO_BATCH_REFERENCE_CONFIRMATION_SPLIT', '视频参考图未在同一批次确认');
  for (const ref of refs) {
    if (!ref.locked_prompt_lineage?.prompt_revision || !ref.locked_prompt_lineage?.prompt_sha) {
      throw fail('VIDEO_BATCH_PROMPT_LINEAGE_MISSING', '视频提示词权威版本缺失');
    }
  }
  const groups = Array.isArray(step03Plan.groups) ? step03Plan.groups : [];
  const firstGroup = groups[0];
  if (!firstGroup) throw fail('VIDEO_BATCH_V01_GROUP_MISSING', '第一条视频分组尚未准备好');
  const duration = Number(firstGroup.duration_sec);
  if (!Number.isFinite(duration) || duration <= 0) throw fail('VIDEO_BATCH_V01_DURATION_INVALID', '第一条视频时长无效');
  const promptLineage = refs.map(ref => ({
    ref_key:ref.ref_key,
    prompt_revision:ref.locked_prompt_lineage.prompt_revision,
    prompt_sha:ref.locked_prompt_lineage.prompt_sha,
    authority_event_id:ref.authority_event_id,
    candidate_revision:ref.candidate?.candidate_revision,
    content_sha:ref.candidate?.content_sha
  })).sort((left,right) => left.ref_key.localeCompare(right.ref_key));
  const promptRevision = 'video-prompt-' + digest({
    plan_id:step03Plan.plan_id,
    group_revision:firstGroup.revision || 1,
    step04_registry_revision:step04Registry.step04_registry_revision,
    prompt_revisions:promptLineage.map(item => item.prompt_revision)
  }).slice(0,24);
  const promptDigest = digest({
    schema_version:'niannian.video_prompt_lineage.v1',
    group:{group_id:'V01',source_group_id:firstGroup.group_id,start_sec:firstGroup.start_sec,end_sec:firstGroup.end_sec,duration_sec:duration,action_summary:firstGroup.action_summary || '',dialogue_bindings:firstGroup.dialogue_bindings || []},
    references:promptLineage
  });
  return {
    authority:{
      project_revision:requiredText(step05Context.authorityRevision, 'project authority revision'),
      localization_revision:requiredText(step05Context.localizationRevision, 'localization revision'),
      step04_confirmation_revision:requiredText(step04Registry.step04_registry_revision, 'step04 registry revision'),
      step05_confirmation_revision:confirmationBatches[0]
    },
    groups:[{
      group_id:'V01',
      prompt:{revision:promptRevision,locked_digest:promptDigest,status:'locked'},
      references:refs.map(ref => ({
        ref_key:ref.ref_key,
        role:ref.canonical_type,
        authority_class:'authoritative',
        status:'confirmed',
        actual_video_input:true,
        confirmation_revision:ref.confirmation.batch_id,
        authority_event_id:ref.authority_event_id,
        confirmed_digest:ref.candidate.content_sha
      })).sort((left,right) => left.ref_key.localeCompare(right.ref_key)),
      duration_seconds:duration,
      aspect_ratio:defaults.aspect_ratio || '9:16',
      resolution:defaults.resolution || '720p',
      audio_requirement:defaults.audio_requirement || ((firstGroup.dialogue_bindings || []).length ? 'required' : 'optional'),
      allowed_channel_class:defaults.allowed_channel_class || 'multimodal-video-standard',
      dependency_group_ids:[],
      output_requirements:['durable_events','job_local_mp4'],
      qa_requirements:['artifact_ledger','content_qa','media_probe']
    }]
  };
}

module.exports = {buildVideoBatchInput,digest,stable};
