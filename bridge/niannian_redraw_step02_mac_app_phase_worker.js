'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const {THREADS} = require('./mac_codex_app_employee_bootstrap');
const {fileEvidence,finalizeMacReturn,importDispatchToMac} = require('./niannian_redraw_step02_mac_app_phase_transport');
const dispatcher = require('./niannian_redraw_step02_mac_app_dispatcher');
const step02 = require('./niannian_redraw_step02_vertical');

const MAC_PROJECT = '/Users/lsb/AI-Brain/niannian-ai-canonical-local';
const WORKSPACE_ROOT = '/Users/lsb/.local/share/niannian-ai/step02-employee-workspaces';

async function readJson(filePath) { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
function validateEnvelope(dispatch, workspaceRoot = WORKSPACE_ROOT) {
  const employee = THREADS.find(item => item.thread_id === dispatch.employee?.thread_id && item.employee === dispatch.employee?.employee && item.title === dispatch.employee?.title);
  const workspace = path.resolve(workspaceRoot, dispatch.phase_key);
  if (!employee || dispatch.employee?.project_root !== MAC_PROJECT || dispatch.schema_version !== step02.SCHEMAS.dispatch || dispatch.execution_mode !== 'fixed_existing_mac_app_candidate_only' || dispatch.test_only !== false || dispatch.owner_id === undefined || !dispatch.owner_action_event_id || !workspace.startsWith(path.resolve(workspaceRoot) + path.sep)) throw step02.codeError('STEP02_MAC_WORKER_ENVELOPE_INVALID');
  step02.assertFalseEffects(dispatch);
  return {employee,workspace};
}
async function executeImportedPhase(options = {}) {
  const packageRoot = path.resolve(String(options.packageRoot || ''));
  const expectedManifestSha256 = String(options.expectedManifestSha256 || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedManifestSha256)) throw step02.codeError('STEP02_MAC_WORKER_MANIFEST_SHA_INVALID');
  const exportedDispatch = await readJson(path.join(packageRoot, 'step02_employee_dispatch.json'));
  const {employee,workspace} = validateEnvelope(exportedDispatch, options.workspaceRoot || WORKSPACE_ROOT);
  const imported = await importDispatchToMac({packageRoot,expectedManifestSha256,workspacePath:workspace});
  const existingReturn = await fileEvidence(path.join(workspace, 'step02_return_manifest.json')).catch(() => null);
  let result;
  if (existingReturn) result = {replay:true};
  else result = await (options.dispatcher || dispatcher.run)({dispatchPath:path.join(workspace, 'step02_employee_dispatch.json'),workspace,leaseRoot:options.leaseRoot,...(options.client?{client:options.client}:{}),...(options.timeoutMs?{timeoutMs:options.timeoutMs}:{}),...(options.afterTurnStarted?{afterTurnStarted:options.afterTurnStarted}:{})});
  const finalized = await finalizeMacReturn({workspacePath:workspace});
  return {ok:true,status:'candidate_return_ready',project_id:exportedDispatch.project_id,transaction_id:exportedDispatch.transaction_id,dispatch_id:exportedDispatch.dispatch_id,phase_key:exportedDispatch.phase_key,owner_action_event_id:exportedDispatch.owner_action_event_id,employee_thread_id:employee.thread_id,turn_id:(result.audit || await readJson(path.join(workspace, 'step02_app_server_audit.json'))).completion_event.turn_id,workspace,import_status:imported.status,return_manifest_sha256:finalized.evidence.sha256,test_only:false,fixture_evidence:false,...step02.falseEffects()};
}

module.exports = {MAC_PROJECT,WORKSPACE_ROOT,executeImportedPhase,validateEnvelope};
