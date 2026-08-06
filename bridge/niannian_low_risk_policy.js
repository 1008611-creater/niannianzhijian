'use strict';

const POLICY_ID = 'niannian_low_risk_analysis_v1';
const ALLOWED_SCOPE = 'step01_evidence_only';
const ALLOWED_SKILLS = Object.freeze(['mx-shortdrama-00-router', 'mx-shortdrama-01-frame-extract']);

function evaluateLowRiskAnalysis(input = {}) {
  const reasons = [];
  const sourceSha256 = String(input.source_sha256 || '');
  const routes = Array.isArray(input.allowed_skill_routes) ? [...new Set(input.allowed_skill_routes.map(String))].sort() : [];
  const expectedRoutes = [...ALLOWED_SKILLS].sort();
  if (!/^[a-f0-9]{64}$/.test(sourceSha256)) reasons.push('source_sha256_invalid');
  if (input.allowed_scope !== ALLOWED_SCOPE) reasons.push('scope_not_low_risk_analysis');
  if (routes.length !== expectedRoutes.length || routes.some((route, index) => route !== expectedRoutes[index])) reasons.push('skill_allowlist_not_exact');
  if (input.provider_submission_requested !== false) reasons.push('provider_submission_not_blocked');
  if (input.package_send_requested !== false) reasons.push('package_send_not_blocked');
  if (input.deploy_requested === true) reasons.push('deploy_requested');
  if (input.account_change_requested === true) reasons.push('account_change_requested');
  if (input.local_image_editing_requested === true) reasons.push('local_image_editing_requested');
  return {
    approved:reasons.length === 0,
    policy_id:POLICY_ID,
    approval_mode:'policy_auto',
    risk_class:reasons.length === 0 ? 'low' : 'manual_review_required',
    reasons
  };
}

function assertLowRiskAnalysis(input) {
  const decision = evaluateLowRiskAnalysis(input);
  if (!decision.approved) throw new Error('low_risk_auto_approval_rejected:' + decision.reasons.join(','));
  return decision;
}

module.exports = { POLICY_ID, ALLOWED_SCOPE, ALLOWED_SKILLS, evaluateLowRiskAnalysis, assertLowRiskAnalysis };
