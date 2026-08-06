'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const RELEASE_SCHEMA = 'niannian_mac_bridge_release_v1';
const INSTALL_STATE_SCHEMA = 'niannian_mac_bridge_install_state_v1';
const RELEASE_VERSION = '2026.07.21.64';
const MAX_FILE_BYTES = 512 * 1024;
const MAC_PROJECT_ROOT = '/Users/lsb/AI-Brain/niannian-ai-canonical-local';
const INSTALL_STATE_RELATIVE_PATH = 'output/mac-employee-training/mac-bridge-release-state.json';
const BRIDGE_FILE_ALLOWLIST = Object.freeze([
  'AGENTS.md',
  'bridge/niannian_runtime_capability_status.js',
  'bridge/niannian_mac_user_action_request.js',
  'bridge/niannian_mac_user_action_notify.sh',
  'bridge/niannian_mac_hq_readback.js',
  'bridge/niannian_mac_hq_diagnose.js',
  'bridge/niannian_mac_hq_refresh_preflight.js',
  'bridge/niannian_mac_bridge_release.js',
  'bridge/install_mac_bridge_release.js',
  'bridge/bootstrap_mac_bridge_release.js',
  'bridge/mac_relay_ssh_gateway.sh',
  'bridge/mac_codex_app_fixed_thread_turn.js',
  'bridge/mac_codex_app_employee01_compaction.js',
  'bridge/niannian_step01_keychain_credentials.js',
  'bridge/niannian_employee_model_profiles.js',
  'bridge/NianNian-Employee-Model-Credentials.command',
  'bridge/NianNian-Employee-Model-Profile.command',
  'bridge/mac_codex_app_fixed_thread_readback.js',
  'bridge/niannian_mac_bridge_install_release_runner.js',
  'bridge/pull_mac_bridge_bootstrap.sh',
  'bridge/verify_mac_bridge_release_pull.js',
  'bridge/niannian_hq_composite_user_runner.sh',
  'bridge/install_mac_step01_runtimes.sh',
  'bridge/self_test_mac_forced_aligner.sh',
  'bridge/com.niannian.ai-brain.hq-refresh.plist',
  'bridge/mac_codex_app_employee_bootstrap.js',
  'bridge/repair_mac_krill_env_only_config.js',
  'bridge/mac_skill_bundle_shared_root_contract.js',
  'bridge/niannian_redraw_step01_mac_app_phase.js',
  'bridge/niannian_redraw_step01_mac_app_phase_transport.js',
  'bridge/niannian_redraw_step01_mac_app_dispatcher.js',
  'bridge/niannian_redraw_step01_mac_app_phase_worker.js',
  'bridge/niannian_redraw_step01_mac_app_phase_worker_launcher.js',
  'bridge/niannian_mac_worker_relay.js',
  'bridge/niannian_redraw_step01_fixed_app_phase_executor.js',
  'bridge/niannian_step01_artifact_broker.js',
  'bridge/niannian_redraw_step01_artifact_broker_transport.js',
  'bridge/mac-employee-training/execute_redraw_step01_hq_full.js'
  ,'bridge/mac-employee-training/adopt_step01_skill_bundle_v2.js'
  ,'bridge/mac-employee-training/route_matrix.json'
  ,'bridge/mac-employee-training/step01_hq_full_toolchain_contract.json'
  ,'bridge/mac-employee-training/Run-NianNian-Step01-HQ-Composite.command'
  ,'bridge/mac-employee-training/run_step01_hq_composite_probe.py'
  ,'bridge/mac-employee-training/build_step01_hq_full_gate_v2.js'
  ,'bridge/mac-employee-training/promote_step01_hq_full_toolchain.js'
  ,'bridge/niannian_step01_hq_full_gate_v2.js'
  ,'bridge/mac-employee-training/analysis_service_cost_policy_NN-20260715083045-8120F5.json'
  ,'bridge/mac-employee-training/refresh_analysis_service_cost_authority.py'
]);
const INSTALL_TARGETS=Object.freeze({'bridge/mac_relay_ssh_gateway.sh':'home:.local/bin/ai-brain-mac-relay-gateway.sh','bridge/com.niannian.ai-brain.hq-refresh.plist':'home:Library/LaunchAgents/com.niannian.ai-brain.hq-refresh.plist'});
const SENSITIVE = [/(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|cookie)\s*[:=]\s*["'][A-Za-z0-9_./+=-]{8,}["']/i,/authorization\s*:\s*["']?(?:bearer|basic)\s+[A-Za-z0-9_./+=-]{8,}/i,/^\s*[A-Z][A-Z0-9_]*(?:KEY|TOKEN|PASSWORD|SECRET|COOKIE)\s*=\s*[A-Za-z0-9_./+=-]{8,}\s*$/m,/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i,/\bsk-[A-Za-z0-9_-]{12,}/i];
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function safeRelative(value) { const normalized=String(value||'').replace(/\\/g,'/'); return BRIDGE_FILE_ALLOWLIST.includes(normalized); }
function sensitive(bytes) { return SENSITIVE.some(pattern => pattern.test(bytes.toString('utf8'))); }
async function evidence(root, relative) {
  if (!safeRelative(relative)) throw new Error('mac_bridge_release_path_rejected');
  const exact=path.resolve(root, ...relative.split('/')); const stats=await fsp.lstat(exact);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1 || stats.size > MAX_FILE_BYTES) throw new Error('mac_bridge_release_file_invalid:'+relative);
  const bytes=await fsp.readFile(exact); if (sensitive(bytes)) throw new Error('mac_bridge_release_sensitive_content:'+relative);
  return {path:relative,bytes:bytes.length,sha256:sha256(bytes),content:bytes};
}
async function atomicJson(filePath, value) { await fsp.mkdir(path.dirname(filePath),{recursive:true}); const temp=filePath+'.tmp-'+process.pid+'-'+crypto.randomBytes(3).toString('hex'); await fsp.writeFile(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx'}); await fsp.rename(temp,filePath); }
async function buildReleaseBundle(options={}) {
  const sourceRoot=path.resolve(options.sourceRoot||path.join(__dirname,'..')); const bundleRoot=path.resolve(String(options.bundleRoot||''));
  if (!bundleRoot) throw new Error('mac_bridge_release_bundle_root_required');
  if (options.releaseVersion !== undefined && String(options.releaseVersion) !== RELEASE_VERSION) throw new Error('mac_bridge_release_version_override_rejected');
  const files=[]; for (const relative of BRIDGE_FILE_ALLOWLIST) files.push(await evidence(sourceRoot,relative));
  const manifest={schema_version:RELEASE_SCHEMA,release_version:RELEASE_VERSION,mac_project_root:MAC_PROJECT_ROOT,files:files.map(({content,...row})=>({...row,install_target:INSTALL_TARGETS[row.path]||'project:'+row.path})),sensitive_scan:{status:'passed',patterns:'credential_and_private_key_markers',scanned_files:files.length},install_contract:{bootstrap:'mac_codex_desktop_task_write_authority_required',ordinary_update:'fixed_install_release_relay_allowed',fixed_app_turn:'read_only_audit_only',fixed_turn_lifecycle:'matching_notification_plus_periodic_exact_readback_and_exact_interrupt',employee01_compaction:'fixed_in_place_notification_or_exact_context_compaction_poll_terminal_readback_immutable_receipt',marker_probe_reasoning_effort:'low',production_reasoning_effort:'unchanged',install_release:'fixed_pull_script_only_no_arbitrary_command',forced_ssh_gateway:'user_space_gateway_replacement_only',forced_gateway_target:'~/.local/bin/ai-brain-mac-relay-gateway.sh',sshd_reinstall_required:false,sshd_reinstall_scope:'topology_key_or_listener_policy_change_only',production_admission:'source_bound_attempt_plus_all_five_cas',ttl_or_stale_lease_admission:false,employee_model_route:'codex_native_account_launch_override'},rollback_contract:{record_required:true,previous_state_relative_path:INSTALL_STATE_RELATIVE_PATH,rollback_reason_required:true},provider_network_requested:false,provider_submit_requested:false,project_media_processed:false,real_delivery:false,created_at:new Date().toISOString()};
  await fsp.mkdir(bundleRoot,{recursive:true}); for (const file of files) { const destination=path.join(bundleRoot,...file.path.split('/')); await fsp.mkdir(path.dirname(destination),{recursive:true}); await fsp.writeFile(destination,file.content,{flag:'wx'}); }
  await atomicJson(path.join(bundleRoot,'manifest.json'),manifest); const manifestBytes=await fsp.readFile(path.join(bundleRoot,'manifest.json')); return {...manifest,manifest_sha256:sha256(manifestBytes),manifest_bytes:manifestBytes.length,bundle_root:bundleRoot};
}
async function verifyReleaseBundle(options={}) {
  const bundleRoot=path.resolve(String(options.bundleRoot||'')); const manifestPath=path.join(bundleRoot,'manifest.json'); const stats=await fsp.lstat(manifestPath); if(!stats.isFile()||stats.isSymbolicLink())throw new Error('mac_bridge_release_manifest_invalid'); const bytes=await fsp.readFile(manifestPath); const manifest=JSON.parse(bytes);
  if(manifest.schema_version!==RELEASE_SCHEMA||manifest.mac_project_root!==MAC_PROJECT_ROOT||manifest.release_version!==String(options.releaseVersion||RELEASE_VERSION)||!Array.isArray(manifest.files)||manifest.files.length!==BRIDGE_FILE_ALLOWLIST.length||manifest.sensitive_scan?.status!=='passed'||manifest.install_contract?.install_release!=='fixed_pull_script_only_no_arbitrary_command'||manifest.install_contract?.fixed_turn_lifecycle!=='matching_notification_plus_periodic_exact_readback_and_exact_interrupt'||manifest.install_contract?.employee01_compaction!=='fixed_in_place_notification_or_exact_context_compaction_poll_terminal_readback_immutable_receipt'||manifest.install_contract?.marker_probe_reasoning_effort!=='low'||manifest.install_contract?.production_reasoning_effort!=='unchanged'||manifest.install_contract?.forced_ssh_gateway!=='user_space_gateway_replacement_only'||manifest.install_contract?.forced_gateway_target!=='~/.local/bin/ai-brain-mac-relay-gateway.sh'||manifest.install_contract?.sshd_reinstall_required!==false||manifest.install_contract?.production_admission!=='source_bound_attempt_plus_all_five_cas'||manifest.install_contract?.ttl_or_stale_lease_admission!==false||manifest.install_contract?.employee_model_route!=='codex_native_account_launch_override'||manifest.rollback_contract?.record_required!==true)throw new Error('mac_bridge_release_manifest_contract_invalid');
  const seen=new Set(); for(const row of manifest.files){if(!safeRelative(row.path)||seen.has(row.path)||row.install_target!==(INSTALL_TARGETS[row.path]||'project:'+row.path)||!/^[a-f0-9]{64}$/.test(String(row.sha256||''))||!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>MAX_FILE_BYTES)throw new Error('mac_bridge_release_manifest_file_invalid');seen.add(row.path); const actual=await evidence(bundleRoot,row.path);if(actual.bytes!==row.bytes||actual.sha256!==row.sha256)throw new Error('mac_bridge_release_hash_mismatch:'+row.path);}
  if(seen.size!==BRIDGE_FILE_ALLOWLIST.length)throw new Error('mac_bridge_release_manifest_inventory_invalid'); return {manifest,manifest_sha256:sha256(bytes),manifest_bytes:bytes.length};
}
async function readInstalledBridgeRelease(options={}) {
  const projectRoot=path.resolve(options.projectRoot||path.join(__dirname,'..')); const statePath=path.resolve(projectRoot,INSTALL_STATE_RELATIVE_PATH); const relative=path.relative(projectRoot,statePath); if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('mac_bridge_release_state_path_invalid');
  let stats;try{stats=await fsp.lstat(statePath);}catch(error){if(error.code==='ENOENT')return {status:'missing'};throw error;} if(!stats.isFile()||stats.isSymbolicLink()||stats.size>64*1024)throw new Error('mac_bridge_release_state_invalid'); const value=JSON.parse(await fsp.readFile(statePath,'utf8'));
  if(value.schema_version!==INSTALL_STATE_SCHEMA||value.status!=='installed_verified'||typeof value.release_version!=='string'||!/^[a-f0-9]{64}$/.test(String(value.manifest_sha256||'')))throw new Error('mac_bridge_release_state_contract_invalid'); return {status:'installed_verified',release_version:value.release_version,manifest_sha256:value.manifest_sha256,installed_at:String(value.installed_at||''),rollback_record:Boolean(value.rollback_record)};
}
function negotiateBridge(expected, installed) {
  if(!expected||typeof expected.release_version!=='string')throw new Error('mac_bridge_release_expected_invalid'); if(!installed||installed.status!=='installed_verified')return {ready:false,status:'mac_bridge_update_required',reason:'installed_release_missing'}; if(installed.release_version!==expected.release_version||expected.manifest_sha256&&installed.manifest_sha256!==expected.manifest_sha256)return {ready:false,status:'mac_bridge_update_required',reason:'installed_release_mismatch'}; return {ready:true,status:'ready',reason:null};
}
function supportsFixedInstallRelease(version) { const match=/^(\d{4})\.(\d{2})\.(\d{2})\.(\d+)$/.exec(String(version||''));if(!match)return false;const value=match.slice(1).map(Number),minimum=[2026,7,18,8];for(let index=0;index<value.length;index++){if(value[index]>minimum[index])return true;if(value[index]<minimum[index])return false;}return true; }
function bootstrapPlan(expected, installed) { const negotiation=negotiateBridge(expected,installed),ordinaryUpdateAllowed=installed?.status==='installed_verified'&&supportsFixedInstallRelease(installed.release_version); return {...negotiation,bootstrap_required:!ordinaryUpdateAllowed,ordinary_update_allowed:ordinaryUpdateAllowed,execution_surface:ordinaryUpdateAllowed?'installed_fixed_install_release_relay':'mac_codex_desktop_app_current_task',fixed_app_turn_role:'read_only_ack_or_readback_only',forced_ssh_gateway_deploy_allowed:false}; }
function fixedAppBootstrapAcknowledgement(expected) { return {schema_version:'niannian_mac_bridge_bootstrap_ack_v1',purpose:'mac_bridge_bootstrap_read_only_acknowledgement',read_only:true,network_access:false,expected_release:{release_version:String(expected.release_version),manifest_sha256:String(expected.manifest_sha256||'')||null},instruction:'A current Mac Codex Desktop App task must perform the separately controlled first install. This acknowledgement must not copy files, invoke shell commands, or alter the forced SSH gateway.',mac_desktop_task_required:true,media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,production_write_requested:false,shell_command_requested:false}; }
module.exports={BRIDGE_FILE_ALLOWLIST,INSTALL_TARGETS,INSTALL_STATE_RELATIVE_PATH,INSTALL_STATE_SCHEMA,MAC_PROJECT_ROOT,MAX_FILE_BYTES,RELEASE_SCHEMA,RELEASE_VERSION,buildReleaseBundle,bootstrapPlan,fixedAppBootstrapAcknowledgement,negotiateBridge,readInstalledBridgeRelease,supportsFixedInstallRelease,verifyReleaseBundle};
