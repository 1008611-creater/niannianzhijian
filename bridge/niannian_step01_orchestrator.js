'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const controller = require('./niannian_controller_bridge');
const lowRiskPolicy = require('./niannian_low_risk_policy');
const step01AppPhase = require('./niannian_redraw_step01_mac_app_phase');
const directReadbackRelease = require('./niannian_step01_direct_readback_release');

const projectRoot = path.resolve(__dirname, '..');
const remoteProjectId = String(process.argv[2] || '').trim();
const resultPath = path.resolve(process.env.NIANNIAN_STEP01_RESULT_PATH || path.join(projectRoot, 'data', 'jobs', remoteProjectId, 'step01_orchestrator_result.json'));
const dryRun = String(process.env.NIANNIAN_STEP01_ORCHESTRATOR_DRY_RUN || 'off').toLowerCase() === 'on';
const legacyCarrierRequested = String(process.env.NIANNIAN_STEP01_MAC_APP_CARRIER || 'off').toLowerCase() === 'on';

function now() {
  return new Date().toISOString();
}

function supportsFixedAppPhaseExecutor(readback) {
  const version = String(readback?.bridge_release?.release_version || '');
  const match = /^(\d{4})\.(\d{2})\.(\d{2})\.(\d+)$/.exec(version);
  if (!match) return false;
  const actual = match.slice(1).map(Number);
  const required = [2026, 7, 18, 30];
  for (let index = 0; index < required.length; index += 1) {
    if (actual[index] > required[index]) return true;
    if (actual[index] < required[index]) return false;
  }
  return true;
}

function validateRemoteProjectId(value) {
  if (!/^NN-[A-Z0-9-]{10,80}$/.test(value)) throw new Error('step01_remote_project_id_invalid');
  return value;
}

async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const temp = filePath + '.tmp-' + process.pid;
  await fsp.writeFile(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fsp.rename(temp, filePath);
}

function validateAutoExecutionPolicy(localTask) {
  const authorization = localTask && localTask.analysis_authorization;
  if (!authorization || authorization.approval_mode !== 'policy_auto' || authorization.approval_policy_id !== lowRiskPolicy.POLICY_ID || authorization.risk_class !== 'low' || authorization.auto_approved !== true) {
    throw new Error('step01_auto_execute_policy_authorization_missing');
  }
  const decision = lowRiskPolicy.assertLowRiskAnalysis({...authorization,allowed_skill_routes:localTask.allowed_skill_routes});
  if (!localTask.constraints || localTask.constraints.provider_submit_requires_authorization !== true || localTask.constraints.package_send_requires_authorization !== true) {
    throw new Error('step01_auto_execute_cost_gates_missing');
  }
  return decision;
}

async function hasCurrentCanonicalReadback(canonicalJobRoot) {
  try {
    await Promise.all([
      fsp.access(path.join(canonicalJobRoot, 'task.json'), fs.constants.R_OK),
      fsp.access(path.join(canonicalJobRoot, 'current_run.json'), fs.constants.R_OK),
      fsp.access(path.join(canonicalJobRoot, 'mac_hq_fixed_readback.json'), fs.constants.R_OK)
    ]);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function main() {
  validateRemoteProjectId(remoteProjectId);
  await atomicJson(resultPath, {schema_version:1,remote_project_id:remoteProjectId,status:'preparing',started_at:now(),provider_submission_requested:false,package_send_requested:false});
  const state = await controller.loadState();
  const canonicalJobRoot = path.join(projectRoot, 'data', 'jobs', remoteProjectId);
  let record = state.jobs && state.jobs[remoteProjectId];
  let prepared = null;
  let directReadback = null;
  const canonicalReadbackReady = await hasCurrentCanonicalReadback(canonicalJobRoot);
  if (record && record.root && canonicalReadbackReady) {
    const synced = await directReadbackRelease.syncCanonicalReadbackToDirect({canonicalJobRoot, directJobRoot:record.root});
    directReadback = synced.readback;
    prepared = {status:'current_readback_released_to_direct',direct_release_status:synced.status};
  } else {
    const token = await controller.loadToken();
    prepared = await controller.runOnce(token, state, remoteProjectId);
    record = state.jobs && state.jobs[remoteProjectId];
    if (record && record.root && await hasCurrentCanonicalReadback(canonicalJobRoot)) {
      const synced = await directReadbackRelease.syncCanonicalReadbackToDirect({canonicalJobRoot, directJobRoot:record.root});
      directReadback = synced.readback;
      prepared.direct_release_status = synced.status;
    }
  }
  if (!record || !/^web_nn-[a-z0-9-]{10,100}$/.test(String(record.localJobId || ''))) throw new Error('step01_local_job_not_materialized');

  if (dryRun) {
    await atomicJson(resultPath, {
      schema_version:1,
      remote_project_id:remoteProjectId,
      local_job_id:record.localJobId,
      status:'prepared_dry_run',
      controller_result:prepared,
      provider_submission_requested:false,
      package_send_requested:false,
      completed_at:now()
    });
    return;
  }
  const localTask = JSON.parse(await fsp.readFile(path.join(record.root, 'task.json'), 'utf8'));
  validateAutoExecutionPolicy(localTask);
  const fixedHqReadback = directReadback || await fsp.readFile(path.join(record.root, 'mac_hq_fixed_readback.json'), 'utf8').then(JSON.parse).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  const preparedPhase = await step01AppPhase.prepareStep01Phase({jobRoot:record.root, fixedHqReadback});
  if (preparedPhase.status === 'blocked_resource') {
    await atomicJson(resultPath, {
      schema_version:'niannian_step01_fixed_app_orchestrator_v1',
      remote_project_id:remoteProjectId,
      local_job_id:record.localJobId,
      status:'fixed_app_dispatch_blocked_resource',
      production_status:'blocked_resource_hq_full',
      blocker:preparedPhase.blocker,
      dispatch_package_created:false,
      employee_turn_requested:false,
      cli_fallback_allowed:false,
      relay_fallback_allowed:false,
      provider_submission_requested:false,
      media_provider_network_requested:false,
      package_send_requested:false,
      completed_at:now()
    });
    return;
  }
  if (preparedPhase.blocked === true) {
    await atomicJson(resultPath, {
      schema_version:'niannian_step01_fixed_app_orchestrator_v2',
      remote_project_id:remoteProjectId,
      local_job_id:record.localJobId,
      status:'fixed_app_dispatch_' + preparedPhase.status,
      production_status:preparedPhase.blocker?.status || preparedPhase.status,
      blocker:preparedPhase.blocker,
      dispatch_package_created:false,
      employee_turn_requested:false,
      cli_fallback_allowed:false,
      relay_fallback_allowed:false,
      analysis_service_network_requested:preparedPhase.status === 'blocked_authorization',
      provider_submission_requested:false,
      media_provider_network_requested:false,
      package_send_requested:false,
      completed_at:now()
    });
    return;
  }
  if (legacyCarrierRequested) {
    await atomicJson(resultPath, {
      schema_version:'niannian_step01_fixed_app_orchestrator_v2',
      remote_project_id:remoteProjectId,
      local_job_id:record.localJobId,
      status:'fixed_app_dispatch_blocked_contract',
      production_status:'blocked_contract',
      blocker:{code:'STEP01_LEGACY_CARRIER_UNSAFE_TRANSPORT_REJECTED',reason:'The retired carrier uses ordinary SSH/Terminal transport and cannot start a protected Step01 App phase.'},
      dispatch_package_created:true,
      employee_turn_requested:false,
      cli_fallback_allowed:false,
      relay_fallback_allowed:false,
      provider_submission_requested:false,
      media_provider_network_requested:false,
      package_send_requested:false,
      completed_at:now()
    });
    return;
  }
  await atomicJson(resultPath, {
    schema_version:'niannian_step01_fixed_app_orchestrator_v1',
    remote_project_id:remoteProjectId,
    local_job_id:record.localJobId,
    status:'fixed_app_dispatch_prepared',
    production_status:'step01_fixed_app_dispatch_prepared_not_executed',
    phase_key:preparedPhase.phase.key_id,
    dispatch_package_root:preparedPhase.root,
    dispatch_manifest_sha256:preparedPhase.manifest_sha256,
    employee_thread_id:preparedPhase.dispatch?.employee?.thread_id || preparedPhase.manifest?.employee_thread_id,
    cli_fallback_allowed:false,
    relay_fallback_allowed:false,
    employee_model_channel:{requested:false,used:false},
    blocker:supportsFixedAppPhaseExecutor(fixedHqReadback)
      ? 'STEP01_FIXED_APP_PHASE_EXECUTOR_READY_FOR_DISPATCH'
      : 'STEP01_FIXED_APP_PHASE_EXECUTOR_NOT_INSTALLED',
    provider_submission_requested:false,
    media_provider_network_requested:false,
    package_send_requested:false,
    completed_at:now()
  });
}

if (require.main === module) {
  main().catch(async error => {
    await atomicJson(resultPath, {
      schema_version:1,
      remote_project_id:remoteProjectId,
      status:'failed',
      blocker:String(error.message || 'step01_orchestrator_failed').slice(0, 1000),
      blocker_code:String(error.code || '').slice(0, 120) || null,
      controller_http_status:Number.isInteger(error.status) ? error.status : null,
      blocker_class:error.code === 'CONTROLLER_AUTH_REQUIRED' || String(error.message || '').includes('bridge_token_missing_or_short')
        ? 'infrastructure_failure'
        : String(error.message || '').includes('fixed_app') ? 'infrastructure_failure' : 'pipeline_runtime_packaging_gap',
      provider_submission_requested:false,
      package_send_requested:false,
      failed_at:now()
    }).catch(() => {});
    process.stderr.write('step01_orchestrator_failed: ' + String(error.message || error) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { hasCurrentCanonicalReadback, supportsFixedAppPhaseExecutor, validateAutoExecutionPolicy };
