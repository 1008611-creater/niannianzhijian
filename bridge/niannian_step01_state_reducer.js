'use strict';

const VERIFIED = new Set(['verified','accepted','completed','delivered']);

function artifactMap(ledger) {
  return new Map((Array.isArray(ledger && ledger.artifacts) ? ledger.artifacts : []).map(item => [String(item.artifact_id || ''), item]));
}

function hasArtifact(artifacts, matcher, statuses = null) {
  for (const [id, item] of artifacts) {
    if (matcher.test(id) && (!statuses || statuses.has(String(item.status || '')))) return true;
  }
  return false;
}

function eventSet(events) {
  return new Set((Array.isArray(events) ? events : []).map(event => String(event.type || '')));
}

function reduceStep01State(input = {}) {
  const status = input.status || {};
  const receipt = input.receipt || null;
  const dispatch = input.dispatch || null;
  const artifacts = artifactMap(input.ledger || {});
  const events = eventSet(input.events);
  const productionStatus = String(receipt && receipt.production_status || status.status || 'prepared');
  const blocker = status.blocker || receipt && receipt.blocker || null;
  const sourceVerified = hasArtifact(artifacts, /^source_video$/, VERIFIED);
  const partialManifest = hasArtifact(artifacts, /step01.*(?:partial_)?evidence_manifest/i);
  const validationReport = hasArtifact(artifacts, /step01.*validation_report/i);
  const audioEvidence = hasArtifact(artifacts, /step01.*audio/i);
  const asrVerified = hasArtifact(artifacts, /(?:asr|speech).*?(?:timeline|evidence|result)/i, VERIFIED);
  const ocrVerified = hasArtifact(artifacts, /ocr.*?(?:evidence|result|timeline)/i, VERIFIED);
  const boundaryVerified = hasArtifact(artifacts, /(?:transnet|shot_boundary).*?(?:evidence|result|timeline)/i, VERIFIED);
  const strictManifestVerified = hasArtifact(artifacts, /step01.*evidence_manifest/i, VERIFIED);
  const validationVerified = hasArtifact(artifacts, /step01.*validation_report/i, VERIFIED);
  const receiptObserved = events.has('worker_receipt_observed');
  const pathsVerified = events.has('artifact_paths_verified');
  const strictPass = productionStatus === 'step01_verified' && receiptObserved && pathsVerified && strictManifestVerified && validationVerified;

  const basicStatus = strictPass || sourceVerified && (partialManifest || validationReport || productionStatus === 'running_step01') ? 'completed' : sourceVerified ? 'ready' : 'blocked';
  const enhancedStatus = strictPass || asrVerified && ocrVerified && boundaryVerified ? 'completed' : audioEvidence || validationReport ? 'partial' : productionStatus === 'blocked_resource' ? 'blocked' : 'pending';
  const strictStatus = strictPass ? 'completed' : productionStatus === 'blocked_resource' || productionStatus === 'blocked_contract' || productionStatus === 'blocked_quality' ? 'blocked' : productionStatus === 'running_step01' ? 'running' : 'pending';
  const worker = receipt ? {
    dispatchId:String(receipt.dispatch_id || dispatch && dispatch.dispatch_id || '') || null,
    threadId:String(dispatch && (dispatch.thread_id || dispatch.employee && dispatch.employee.thread_id) || '') || null,
    status:receipt.worker_status === 'blocked' ? 'blocked' : productionStatus === 'step01_verified' ? 'completed' : ['handoff','waiting_cost_authorization'].includes(String(dispatch && dispatch.status || '')) ? String(dispatch.status) : String(receipt.worker_status || 'completed'),
    router:String(dispatch && dispatch.required_router || '') || null,
    mode:String(dispatch && (dispatch.mode || dispatch.execution_mode) || 'execute'),
    updatedAt:String(receipt.written_at || receipt.updated_at || status.updated_at || '') || null,
    blocker:blocker ? (typeof blocker === 'string' ? blocker : JSON.stringify(blocker)) : null
  } : dispatch ? {
    dispatchId:String(dispatch.dispatch_id || '') || null,
    threadId:String(dispatch.thread_id || '') || null,
    status:String(dispatch.status || 'queued'),
    router:String(dispatch.required_router || '') || null,
    mode:String(dispatch.mode || 'queue'),
    updatedAt:String(dispatch.updated_at || '') || null,
    blocker:dispatch.blocker ? String(dispatch.blocker) : null
  } : null;

  return {
    schema_version:'niannian_step01_projection_v1',
    production_status:productionStatus,
    event_log_present:Array.isArray(input.events),
    strict_pass_reproducible:strictPass,
    tiers:{
      basic:{status:basicStatus,label:'基础证据'},
      enhanced:{status:enhancedStatus,label:'增强分析'},
      strict:{status:strictStatus,label:'严格验证'}
    },
    worker,
    blocker,
    next_action:String(status.next_action || receipt && receipt.next_action || ''),
    step02_unlocked:strictPass
  };
}

function evaluateAutoRecovery(input = {}) {
  const receipt = input.receipt || {};
  const preflight = input.preflight || {};
  const priorAttempts = Math.max(0, Number(input.prior_attempts || 0));
  const blocker = input.blocker || {};
  const reasons = [];
  if (receipt.production_status !== 'blocked_resource') reasons.push('receipt_not_blocked_resource');
  if (blocker.retryable !== true) reasons.push('blocker_not_retryable');
  if (preflight.ready !== true) reasons.push('runtime_profile_not_ready');
  if (preflight.runtime_profile !== 'mac-step01-strict-evidence-v1') reasons.push('strict_runtime_profile_not_verified');
  if (!String(blocker.resume_event || '')) reasons.push('resume_event_missing');
  if (priorAttempts >= 1) reasons.push('automatic_recovery_limit_reached');
  if (input.active_worker === true) reasons.push('active_worker_exists');
  if (input.source_sha_match !== true) reasons.push('source_sha_mismatch');
  if (input.policy_approved !== true) reasons.push('policy_not_approved');
  return {allowed:reasons.length === 0,reasons,max_attempts:1};
}

module.exports = { reduceStep01State, evaluateAutoRecovery };
