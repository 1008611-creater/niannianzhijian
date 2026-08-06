'use strict';

const assert = require('assert');
const policy = require('./bridge/niannian_low_risk_policy');
const orchestrator = require('./bridge/niannian_step01_orchestrator');

const safe = {
  source_sha256:'a'.repeat(64),
  allowed_scope:'step01_evidence_only',
  allowed_skill_routes:['mx-shortdrama-00-router','mx-shortdrama-01-frame-extract'],
  provider_submission_requested:false,
  package_send_requested:false,
  deploy_requested:false,
  account_change_requested:false,
  local_image_editing_requested:false
};

const approved = policy.evaluateLowRiskAnalysis(safe);
assert.equal(approved.approved, true);
assert.equal(approved.policy_id, 'niannian_low_risk_analysis_v1');
assert.equal(approved.risk_class, 'low');

for (const [field, value, reason] of [
  ['provider_submission_requested', true, 'provider_submission_not_blocked'],
  ['package_send_requested', true, 'package_send_not_blocked'],
  ['deploy_requested', true, 'deploy_requested'],
  ['account_change_requested', true, 'account_change_requested'],
  ['local_image_editing_requested', true, 'local_image_editing_requested']
]) {
  const decision = policy.evaluateLowRiskAnalysis({...safe,[field]:value});
  assert.equal(decision.approved, false);
  assert(decision.reasons.includes(reason));
}
assert.equal(policy.evaluateLowRiskAnalysis({...safe,allowed_scope:'provider_generation'}).approved, false);
assert.equal(policy.evaluateLowRiskAnalysis({...safe,allowed_skill_routes:[...safe.allowed_skill_routes,'ai-video-channel-router']}).approved, false);
assert.throws(() => policy.assertLowRiskAnalysis({...safe,provider_submission_requested:true}), /low_risk_auto_approval_rejected/);

const safeTask = {
  allowed_skill_routes:safe.allowed_skill_routes,
  analysis_authorization:{...safe,approval_mode:'policy_auto',approval_policy_id:policy.POLICY_ID,risk_class:'low',auto_approved:true},
  constraints:{provider_submit_requires_authorization:true,package_send_requires_authorization:true}
};
assert.equal(orchestrator.validateAutoExecutionPolicy(safeTask).approved, true);
assert.throws(() => orchestrator.validateAutoExecutionPolicy({...safeTask,analysis_authorization:{...safeTask.analysis_authorization,provider_submission_requested:true}}), /low_risk_auto_approval_rejected/);
assert.throws(() => orchestrator.validateAutoExecutionPolicy({...safeTask,constraints:{provider_submit_requires_authorization:false,package_send_requires_authorization:true}}), /step01_auto_execute_cost_gates_missing/);

process.stdout.write(JSON.stringify({ok:true,verified:['safe Step01 auto approval','provider rejection','package/send rejection','deployment rejection','account-change rejection','local-image-editing rejection','scope rejection','exact skill allowlist','orchestrator pre-execute policy gate','orchestrator cost gates']}) + '\n');
