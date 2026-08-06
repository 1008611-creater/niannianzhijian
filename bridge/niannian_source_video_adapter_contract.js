'use strict';

const REQUIRED_METHODS = Object.freeze(['preflight','stageUploads','readbackInputs','submit','poll','download','probe','visualQa','classifyError','resume']);
const STATES = Object.freeze(['prepared','preflight_passed','uploads_staged','inputs_readback','provider_task_created','polling','downloaded','probe_passed','visual_qa_passed','ledger_verified','projected']);
const BLOCKERS = Object.freeze(['stale_authority','auth','capability','quota','cost_authorization','provider_policy','upload','submit_unknown','provider_failed','poll_timeout','download','media_probe','content_quality','transport']);
const TRANSITIONS = Object.freeze({
  prepared:['preflight_passed'],preflight_passed:['uploads_staged'],uploads_staged:['inputs_readback'],inputs_readback:['provider_task_created'],provider_task_created:['polling'],polling:['polling','downloaded'],downloaded:['probe_passed'],probe_passed:['visual_qa_passed'],visual_qa_passed:['ledger_verified'],ledger_verified:['projected'],projected:[]
});

function contractError(code, detail) { const error = new Error(code + (detail ? ':' + detail : '')); error.code = code; return error; }

function validateAdapter(adapter) {
  if (!adapter || adapter.schema_version !== 'source_video_channel_adapter_v1' || !adapter.channel_id || !adapter.adapter_identity || !adapter.endpoint_identity || !adapter.auth_namespace) throw contractError('SOURCE_VIDEO_ADAPTER_IDENTITY_INVALID');
  for (const method of REQUIRED_METHODS) if (typeof adapter[method] !== 'function') throw contractError('SOURCE_VIDEO_ADAPTER_METHOD_MISSING', method);
  if (/krill|codex/i.test([adapter.channel_id,adapter.adapter_identity,adapter.endpoint_identity,adapter.auth_namespace].join('|'))) throw contractError('SOURCE_VIDEO_EMPLOYEE_MODEL_AS_MEDIA_ADAPTER_FORBIDDEN');
  return adapter;
}

function validateTransition(from, to) {
  if (!STATES.includes(from) || !STATES.includes(to) || !TRANSITIONS[from].includes(to)) throw contractError('SOURCE_VIDEO_EXECUTION_TRANSITION_INVALID', from + '->' + to);
  return true;
}

function typedBlocker(kind, message, retryable = false, detail = null) {
  if (!BLOCKERS.includes(kind)) throw contractError('SOURCE_VIDEO_BLOCKER_KIND_INVALID', kind);
  return {schema_version:'source_video_execution_blocker_v1',kind,message:String(message || kind).slice(0,500),retryable:retryable === true,detail:detail === null ? null : String(detail).slice(0,500)};
}

module.exports = {BLOCKERS,REQUIRED_METHODS,STATES,TRANSITIONS,contractError,typedBlocker,validateAdapter,validateTransition};
