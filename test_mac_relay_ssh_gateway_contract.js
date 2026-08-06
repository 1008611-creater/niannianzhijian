'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const release = require('./bridge/niannian_mac_bridge_release');

const gateway = fs.readFileSync(path.join(__dirname, 'bridge', 'mac_relay_ssh_gateway.sh'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, 'bridge', 'Invoke-AiBrainMacRelay.ps1'), 'utf8');
const hqLauncher = fs.readFileSync(path.join(__dirname, 'bridge', 'mac-employee-training', 'Run-NianNian-Step01-HQ-Composite.command'), 'utf8');
assert(hqLauncher.includes('write_exit_receipt()'));
assert((hqLauncher.match(/write_exit_receipt "\$rc"/g) || []).length === 2);
const hqRunner = fs.readFileSync(path.join(__dirname, 'bridge', 'niannian_hq_composite_user_runner.sh'), 'utf8');
const hqGateBuilder = fs.readFileSync(path.join(__dirname, 'bridge', 'mac-employee-training', 'build_step01_hq_full_gate_v2.js'), 'utf8');
const hqPromoter = fs.readFileSync(path.join(__dirname, 'bridge', 'mac-employee-training', 'promote_step01_hq_full_toolchain.js'), 'utf8');
const releasePull = fs.readFileSync(path.join(__dirname, 'bridge', 'pull_mac_bridge_bootstrap.sh'), 'utf8');

function requireSingleMatch(source, pattern, label) {
  const matches = [...source.matchAll(pattern)];
  assert.equal(matches.length, 1, `${label}_must_have_exactly_one_adoption_manifest_path`);
  return matches[0][1];
}

const launcherAdoptionPath = requireSingleMatch(
  hqLauncher,
  /--adoption\s+"\$output\/([^"\r\n]+\/adoption-manifest\.json)"/g,
  'hq_launcher'
);
const gateBuilderAdoptionPath = requireSingleMatch(
  hqGateBuilder,
  /adoptionPath:\s*path\.join\(output,\s*'([^']+)',\s*'adoption-manifest\.json'\)/g,
  'hq_gate_builder'
);
const promoterAdoptionPath = requireSingleMatch(
  hqPromoter,
  /adoption:\s*path\.join\(PROJECT_ROOT,\s*'output',\s*'mac-employee-training',\s*'([^']+)',\s*'adoption-manifest\.json'\)/g,
  'hq_promoter'
);
const normalizedGateBuilderAdoptionPath = `${gateBuilderAdoptionPath}/adoption-manifest.json`;
const normalizedPromoterAdoptionPath = `${promoterAdoptionPath}/adoption-manifest.json`;

assert(gateway.includes('"ai-brain-relay status")'));
assert(gateway.includes('"ai-brain-relay prepare "*)'));
assert(gateway.includes('"ai-brain-relay execute-once "*)'));
assert(gateway.includes('"ai-brain-relay app-turn "*)'));
assert(gateway.includes('"ai-brain-relay app-readback "*)'));
assert(gateway.includes('"ai-brain-relay install-release "*)'));
assert(gateway.includes('"ai-brain-relay step01-phase-execute "*)'));
assert(gateway.includes('"ai-brain-relay hq-composite")'));
assert(gateway.includes('"ai-brain-relay hq-readback")'));
assert(gateway.includes('"ai-brain-relay hq-diagnose")'));
assert(gateway.includes('"ai-brain-relay model-channel-audit")'));
assert(gateway.includes('"ai-brain-relay model-channel-repair")'));
assert(gateway.includes('repair_mac_krill_env_only_config.js --audit'));
assert(gateway.includes('repair_mac_krill_env_only_config.js'));
assert(gateway.includes('niannian_mac_hq_readback.js'));
assert(gateway.includes('com.niannian.ai-brain.hq-refresh.plist'));
assert(gateway.includes('mac_relay_gateway_hq_refresh_agent_symlink_rejected'));
assert(gateway.includes('/bin/launchctl kickstart -k "$service"'));
assert(!gateway.includes('open -a Terminal'));
assert(!gateway.includes('/bin/bash "$launcher"'));
assert(gateway.includes('step01-hq-composite-probe-exit.json'));
assert(gateway.includes('mac_relay_gateway_hq_composite_exit_receipt_missing'));
assert(gateway.includes('mac_codex_app_fixed_thread_turn.js'));
assert(gateway.includes('mac_codex_app_fixed_thread_readback.js'));
assert(gateway.includes('niannian_redraw_step01_fixed_app_phase_executor.js'));
assert(gateway.includes('mac_relay_gateway_step01_phase_execute_arg_count_rejected'));
assert(gateway.includes('^step01phase-[a-f0-9]{64}$'));
assert(gateway.includes('019f6201-c013-7cf3-b155-61d2789085f4|019f6201-cb91-7cf0-819e-696eeabd9e78|019f6201-d5e8-7083-884d-c714eb1a78b0|019f6201-dff9-7f63-94d8-7f9020b3c223|019f6201-ea1b-7e22-9dd0-a3b851b15b69'));
assert(gateway.includes('niannian_runtime_capability_status.js'));
assert(gateway.includes('capability_audit'));
assert(gateway.includes('capability_exit'));
assert(gateway.includes('[[ "$capability_report" != \\{*\\} ]]'));
assert(gateway.includes('"state_mutated":false'));
assert.equal(gateway.includes('niannian_mac_user_action_request.js'), false);
assert.equal(gateway.includes('user_action_request_written'), false);
assert.equal(gateway.includes('prepared_no_worker_started'), false);
assert(gateway.includes('niannian_mac_worker_relay.js \\\n    --job-id "$job_id"'));
assert(gateway.includes('niannian_mac_worker_relay.js \\\n    --execute \\\n    --job-id "$job_id"'));
assert(!gateway.includes('bash -c "$SSH_ORIGINAL_COMMAND"'));
assert.equal((releasePull.match(/"\/Users\/lsb\/\.local\/bin\/node"/g)||[]).length,2);
assert(!/(^|\n)node\s/.test(releasePull));
assert(client.includes("ValidateSet('Status', 'Prepare', 'ExecuteOnce', 'AppTurn', 'AppReadback', 'InstallRelease', 'Step01PhaseExecute', 'HqComposite', 'HqReadback', 'HqDiagnose', 'ModelChannelAudit', 'ModelChannelRepair', 'ModelChannelRollback')"));
assert(client.includes("$remoteCommand = 'ai-brain-relay hq-composite'"));
assert(client.includes("$remoteCommand = 'ai-brain-relay hq-readback'"));
assert(client.includes("throw 'ai_brain_mac_relay_hq_composite_does_not_accept_arguments'"));
assert(client.includes("throw 'ai_brain_mac_relay_hq_readback_does_not_accept_arguments'"));
assert(client.includes("throw 'ai_brain_mac_relay_hq_diagnose_does_not_accept_arguments'"));
assert(client.includes("throw 'ai_brain_mac_relay_model_channel_audit_does_not_accept_arguments'"));
assert(client.includes("throw 'ai_brain_mac_relay_model_channel_repair_does_not_accept_arguments'"));
assert(client.includes("$verb = if ($Action -eq 'Prepare') { 'prepare' } else { 'execute-once' }"));
assert(client.includes('$allowedThreadIds = @('));
assert(client.includes('ai-brain-relay app-turn $RequestId $FixedThreadId $sha $encoded'));
assert(client.includes('ai-brain-relay app-readback $RequestId $FixedThreadId'));
assert(client.includes('ai-brain-relay install-release $RequestId $ReleaseVersion $ManifestSha256 $ArchiveSha256'));
assert(client.includes('ai-brain-relay step01-phase-execute $RequestId $JobId $PhaseKey $ManifestSha256'));
assert(client.includes("throw 'ai_brain_mac_relay_step01_phase_execute_job_id_rejected'"));
assert(client.includes("throw 'ai_brain_mac_relay_step01_phase_execute_phase_key_rejected'"));
assert(client.includes("throw 'ai_brain_mac_relay_install_request_id_rejected'"));
assert(client.includes("throw 'ai_brain_mac_relay_install_version_rejected'"));
assert(client.includes("throw 'ai_brain_mac_relay_install_manifest_sha_rejected'"));
assert(client.includes("throw 'ai_brain_mac_relay_install_archive_sha_rejected'"));
assert.match(launcherAdoptionPath, /^v\d+\.\d+\.\d+-adoption(?:-r\d+)?\/adoption-manifest\.json$/);
assert.equal(launcherAdoptionPath, normalizedGateBuilderAdoptionPath);
assert.equal(launcherAdoptionPath, normalizedPromoterAdoptionPath);
for (const source of [hqLauncher, hqGateBuilder, hqPromoter]) {
  assert.equal(source.includes('v2-adoption'), false);
}
assert(hqLauncher.includes('build_step01_hq_full_gate_v2.js'));
assert(hqRunner.includes('exec /bin/bash /Users/lsb/AI-Brain/niannian-ai-canonical-local/bridge/mac-employee-training/Run-NianNian-Step01-HQ-Composite.command'));
assert(hqLauncher.includes('promote_step01_hq_full_toolchain.js'));
assert(hqLauncher.includes('niannian_mac_hq_refresh_preflight.js'));
assert(hqLauncher.includes('refresh_analysis_service_cost_authority.py'));
assert(release.BRIDGE_FILE_ALLOWLIST.includes('bridge/mac-employee-training/Run-NianNian-Step01-HQ-Composite.command'));
assert(hqLauncher.indexOf('niannian_mac_hq_refresh_preflight.js') < hqLauncher.indexOf('refresh_analysis_service_cost_authority.py'));
assert(hqLauncher.indexOf('refresh_analysis_service_cost_authority.py') < hqLauncher.indexOf('run_step01_hq_composite_probe.py'));
assert(hqLauncher.indexOf('install_mac_step01_runtimes.sh') < hqLauncher.indexOf('refresh_analysis_service_cost_authority.py'));
assert(hqLauncher.indexOf('self_test_mac_forced_aligner.sh') < hqLauncher.indexOf('refresh_analysis_service_cost_authority.py'));
assert(hqGateBuilder.includes("settingsProfile: 'mac-step01-hq-full-evidence-v2'"));

process.stdout.write(JSON.stringify({ok:true,verified:[
  'forced gateway exposes status prepare execute-once fixed-thread app-turn fixed-script install-release plus exact HQ composite and fixed-receipt readback verbs only',
  'prepare omits execute flag',
  'execute-once retains execute flag',
  'app-turn is restricted to five fixed task IDs and base64url envelope',
  'install-release is restricted to exact request, version, manifest SHA, and archive SHA',
  'fixed Step01 executor is restricted to an exact request, job, phase key, and manifest SHA',
  'Windows client builds app-turn only from local UTF-8 prompt/envelope files',
  'Windows client cannot construct arbitrary remote shell',
  'fixed release pull uses the absolute installed Mac Node path under forced-command PATH',
  'status returns a redacted capability audit',
  'not-ready audit JSON is not collapsed into unavailable',
  'HQ diagnosis exposes only a fixed no-argument redacted evidence surface',
  'model channel audit and repair are fixed no-argument actions with no arbitrary shell surface',
  'HQ launcher, gate builder, and promoter use one matching versioned adoption manifest',
  'stale-proof HQ refresh runs without opening Terminal',
  'fresh HQ gate is reused before authority refresh or synthetic service calls',
  'expired short authority is refreshed from exact D-022 policy before synthetic service calls',
  'legacy unversioned v2 adoption manifest is rejected'
]}) + '\n');
