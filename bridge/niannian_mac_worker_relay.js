'use strict';

// macOS-side half of the pull relay. It uses an existing SSH key at runtime,
// never receives the Windows bridge token, and does not start Codex unless
// --execute is supplied explicitly.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { runEmployeePreflight } = require('./niannian_employee_preflight');

const EXPORT_CONTRACT_FILES = Object.freeze([
  'artifact_ledger.json',
  'assignments.json',
  'checkpoint.json',
  'codex_prompt.md',
  'gate_dashboard.json',
  'gate_dashboard.md',
  'result_manifest.json',
  'route_decision.json',
  'status.json',
  'task.json',
  'transaction_intent.json',
  'worker_report.md'
]);

const RETURN_FILES = Object.freeze([
  'status.json',
  'checkpoint.json',
  'gate_dashboard.json',
  'artifact_ledger.json',
  'result_manifest.json',
  'worker_report.md',
  'employee_dispatch.json',
  'employee_worker_receipt.json',
  'employee_preflight.json'
]);

const STEP01_EVIDENCE_BUNDLE_FILES = Object.freeze([
  'step01_evidence_bundle_manifest.json',
  'step01_evidence_bundle.zip'
]);
const MAX_STEP01_EVIDENCE_FILES = 100;
const MAX_STEP01_EVIDENCE_FILE_BYTES = 10 * 1024 * 1024;
const MAX_STEP01_EVIDENCE_TOTAL_BYTES = 50 * 1024 * 1024;

function now() { return new Date().toISOString(); }

function safeJobId(value) {
  const id = String(value || '').trim();
  if (!/^web_n[ns]-[a-z0-9-]{10,100}$/.test(id)) throw new Error('mac_worker_relay_job_id_invalid');
  return id;
}

function isInside(parent, candidate) {
  const base = path.resolve(parent);
  const target = path.resolve(candidate);
  return target === base || target.startsWith(base + path.sep);
}

function safeRelative(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0') || normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('mac_worker_relay_relative_path_invalid');
  }
  return normalized;
}

async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive:true });
  const temporary = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fsp.rename(temporary, filePath);
}

async function readJson(filePath, fallback = null) {
  try { return JSON.parse(await fsp.readFile(filePath, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  await new Promise((resolve, reject) => {
    const input = fs.createReadStream(filePath);
    input.on('data', chunk => { bytes += chunk.length; hash.update(chunk); });
    input.on('error', reject);
    input.on('end', resolve);
  });
  return { bytes, sha256:hash.digest('hex') };
}

async function ensureRegularFile(filePath, code) {
  const stats = await fsp.lstat(filePath).catch(() => null);
  if (!stats || !stats.isFile() || stats.isSymbolicLink()) throw new Error(code);
  return stats;
}

async function listFiles(root, relativeRoot = '') {
  const entries = await fsp.readdir(path.join(root, relativeRoot), { withFileTypes:true });
  const output = [];
  for (const entry of entries) {
    const relative = relativeRoot ? path.posix.join(relativeRoot, entry.name) : entry.name;
    if (entry.isDirectory()) output.push(...await listFiles(root, relative));
    else if (entry.isFile()) output.push(relative.replace(/\\/g, '/'));
    else throw new Error('mac_worker_relay_special_file_rejected');
  }
  return output;
}

function relayConfig(overrides = {}) {
  const args = overrides.args || process.argv.slice(2);
  const option = name => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : null;
  };
  const windowsHost = String(overrides.windowsHost || option('--windows-host') || process.env.NIANNIAN_WINDOWS_TAILSCALE_HOST || '').trim();
  const windowsUser = String(overrides.windowsUser || option('--windows-user') || process.env.NIANNIAN_WINDOWS_SSH_USER || '').trim();
  const keyPath = String(overrides.keyPath || option('--key-path') || process.env.NIANNIAN_WINDOWS_SSH_KEY_PATH || '').trim();
  const sourceRoot = path.resolve(overrides.sourceRoot || process.env.NIANNIAN_MAC_RELAY_SOURCE_ROOT || path.join(__dirname, '..'));
  const workspace = path.resolve(overrides.workspace || option('--workspace') || process.env.NIANNIAN_MAC_RELAY_WORKSPACE || path.join(os.homedir(), 'AI-Brain', 'niannian-ai-mac-relay-runtime'));
  const remoteGatewayPath = String(overrides.remoteGatewayPath || option('--gateway-path') || process.env.NIANNIAN_MAC_RELAY_GATEWAY_PATH || 'E:\\codex\\aisp\\aidaihuo\\niannian-ai-canonical-local\\bridge\\niannian_mac_relay_gateway.js').trim();
  const remoteRelayRoot = String(overrides.remoteRelayRoot || option('--remote-relay-root') || process.env.NIANNIAN_MAC_RELAY_REMOTE_ROOT || (windowsUser ? 'C:/Users/' + windowsUser + '/ai-brain-relay' : '')).replace(/\\/g, '/').replace(/\/$/, '');
  const requestedJobId = String(overrides.jobId || option('--job-id') || '').trim();
  const receiptTimeoutMs = Math.max(1000, Number(overrides.receiptTimeoutMs || option('--receipt-timeout-ms') || process.env.NIANNIAN_MAC_RELAY_RECEIPT_TIMEOUT_MS || 15 * 60 * 1000));
  if (!/^[A-Za-z0-9._-]+$/.test(windowsHost)) throw new Error('mac_worker_relay_windows_host_invalid');
  if (!/^[A-Za-z0-9._-]+$/.test(windowsUser)) throw new Error('mac_worker_relay_windows_user_invalid');
  if (!keyPath) throw new Error('mac_worker_relay_key_path_required');
  if (!remoteGatewayPath || !remoteRelayRoot) throw new Error('mac_worker_relay_remote_paths_required');
  if (requestedJobId) safeJobId(requestedJobId);
  return {
    windowsHost,
    windowsUser,
    keyPath:path.resolve(keyPath),
    sourceRoot,
    workspace,
    directJobsRoot:path.join(workspace, '06_AUTOMATION', 'direct_jobs'),
    productionIndex:path.join(workspace, '06_AUTOMATION', 'production_jobs.index.json'),
    workerState:path.join(workspace, 'worker-state'),
    outgoingRoot:path.join(workspace, 'outgoing'),
    remoteGatewayPath,
    remoteRelayRoot,
    requestedJobId,
    receiptTimeoutMs,
    execute:overrides.execute === true || args.includes('--execute')
  };
}

function sshOptions(config) {
  return [
    '-i', config.keyPath,
    '-o', 'BatchMode=yes',
    '-o', 'PasswordAuthentication=no',
    '-o', 'KbdInteractiveAuthentication=no',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=15'
  ];
}

function remoteTarget(config) { return config.windowsUser + '@' + config.windowsHost; }

function powerShellLiteral(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function remoteGatewayCommand(config, command, extra = []) {
  const script = '& node ' + powerShellLiteral(config.remoteGatewayPath) + ' ' + [command].concat(extra).map(powerShellLiteral).join(' ');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ' + encoded;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd:options.cwd, env:options.env || process.env, stdio:['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => reject(new Error('mac_worker_relay_process_start_failed:' + command + ':' + error.message)));
    child.on('exit', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error('mac_worker_relay_process_failed:' + command + ':' + code));
    });
  });
}

function parseGatewayResult(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && parsed.ok === true) return parsed;
    } catch {}
  }
  throw new Error('mac_worker_relay_gateway_result_missing');
}

async function callRemoteGateway(config, command, extra = []) {
  const result = await runProcess('ssh', sshOptions(config).concat([remoteTarget(config), remoteGatewayCommand(config, command, extra)]));
  return parseGatewayResult(result.stdout);
}

function recoveryLabel() {
  return now().replace(/[^0-9]/g, '').slice(0, 14) + '-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
}

async function archiveExistingMacJob(config, targetRoot, localJobId) {
  const jobId = safeJobId(localJobId);
  const source = path.resolve(targetRoot);
  const directRoot = path.resolve(config.directJobsRoot);
  if (!isInside(directRoot, source)) throw new Error('mac_worker_relay_existing_job_path_invalid');
  const stats = await fsp.lstat(source).catch(() => null);
  if (!stats) return null;
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('mac_worker_relay_existing_job_invalid');
  const archiveParent = path.resolve(config.workspace, '06_AUTOMATION', 'attempt_history', jobId);
  if (!isInside(path.resolve(config.workspace), archiveParent)) throw new Error('mac_worker_relay_attempt_history_path_invalid');
  await fsp.mkdir(archiveParent, { recursive:true });
  const archivePath = path.join(archiveParent, recoveryLabel());
  if (!isInside(archiveParent, archivePath)) throw new Error('mac_worker_relay_attempt_archive_path_invalid');
  await fsp.rename(source, archivePath);
  return archivePath;
}

async function pullTransportPackage(config, localJobId) {
  const jobId = safeJobId(localJobId);
  await fsp.mkdir(config.directJobsRoot, { recursive:true });
  const targetRoot = path.join(config.directJobsRoot, jobId);
  if (!isInside(config.directJobsRoot, targetRoot)) throw new Error('mac_worker_relay_local_job_path_invalid');
  await archiveExistingMacJob(config, targetRoot, jobId);
  const remotePath = config.remoteRelayRoot + '/jobs/' + jobId;
  await runProcess('scp', sshOptions(config).concat(['-r', remoteTarget(config) + ':' + remotePath, config.directJobsRoot]));
  return targetRoot;
}

async function verifyTransportPackage(jobRoot) {
  const root = path.resolve(jobRoot);
  const manifest = await readJson(path.join(root, 'transport_manifest.json'));
  if (!manifest || manifest.schema_version !== 'niannian_mac_transport_v1' || !safeJobId(manifest.job_id) || !Array.isArray(manifest.files)) {
    throw new Error('mac_worker_relay_transport_manifest_invalid');
  }
  const sourcePath = safeRelative(manifest.source_path);
  if (!sourcePath.startsWith('source/')) throw new Error('mac_worker_relay_transport_source_path_invalid');
  if (manifest.source_kind && !['source_video','source_script'].includes(manifest.source_kind)) throw new Error('mac_worker_relay_transport_source_kind_invalid');
  if (!/^[a-f0-9]{64}$/.test(String(manifest.source_sha256 || ''))) throw new Error('mac_worker_relay_transport_source_hash_invalid');
  const n06Assets = Array.isArray(manifest.n06_assets) ? manifest.n06_assets : [];
  if (n06Assets.length > 9) throw new Error('mac_worker_relay_n06_asset_count_invalid');
  const n06AssetIds = new Set();
  const n06AssetPaths = new Set();
  for (const asset of n06Assets) {
    if (!asset || !/^[A-Za-z0-9._-]{1,160}$/.test(String(asset.ref_key || '')) || n06AssetIds.has(asset.ref_key) ||
        !/^[a-f0-9]{64}$/.test(String(asset.sha256 || ''))) throw new Error('mac_worker_relay_n06_asset_contract_invalid');
    const assetPath = safeRelative(asset.path);
    if (!assetPath.startsWith('n06/references/') || n06AssetPaths.has(assetPath)) throw new Error('mac_worker_relay_n06_asset_path_invalid');
    n06AssetIds.add(asset.ref_key); n06AssetPaths.add(assetPath);
  }
  const required = new Set(EXPORT_CONTRACT_FILES.concat([sourcePath, 'source.sha256', ...n06AssetPaths]));
  const seen = new Set();
  for (const entry of manifest.files) {
    if (!entry || typeof entry !== 'object') throw new Error('mac_worker_relay_transport_manifest_entry_invalid');
    const relative = safeRelative(entry.path);
    if (!required.has(relative) || seen.has(relative) || !Number.isInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(String(entry.sha256 || ''))) {
      throw new Error('mac_worker_relay_transport_manifest_entry_invalid');
    }
    const absolute = path.resolve(root, relative);
    if (!isInside(root, absolute)) throw new Error('mac_worker_relay_transport_path_escape');
    await ensureRegularFile(absolute, 'mac_worker_relay_transport_file_missing');
    const evidence = await sha256File(absolute);
    if (evidence.bytes !== entry.bytes || evidence.sha256 !== entry.sha256) throw new Error('mac_worker_relay_transport_hash_mismatch');
    seen.add(relative);
  }
  if (seen.size !== required.size || [...required].some(relative => !seen.has(relative))) throw new Error('mac_worker_relay_transport_required_file_missing');
  const actualFiles = new Set(await listFiles(root));
  const allowedFiles = new Set([...required, 'transport_manifest.json']);
  if (actualFiles.size !== allowedFiles.size || [...actualFiles].some(file => !allowedFiles.has(file))) throw new Error('mac_worker_relay_transport_unexpected_file');
  const sourceEvidence = await sha256File(path.join(root, sourcePath));
  if (sourceEvidence.sha256 !== manifest.source_sha256) throw new Error('mac_worker_relay_transport_source_hash_mismatch');
  const sourceHashFile = await fsp.readFile(path.join(root, 'source.sha256'), 'utf8');
  if (!sourceHashFile.startsWith(manifest.source_sha256 + '  ' + sourcePath)) throw new Error('mac_worker_relay_transport_source_hash_file_mismatch');
  for (const asset of n06Assets) {
    const evidence = await sha256File(path.join(root, safeRelative(asset.path)));
    if (evidence.sha256 !== asset.sha256) throw new Error('mac_worker_relay_n06_asset_hash_mismatch');
  }
  return { manifest, sourcePath, sourceEvidence, sourceKind:manifest.source_kind || null, n06Assets };
}

function resolveTaskSource(task) {
  if (task && task.source_video && task.source_script) throw new Error('mac_worker_relay_source_contract_ambiguous');
  if (task && task.source_video) return { kind:'source_video', field:'source_video', value:task.source_video };
  if (task && task.source_script) return { kind:'source_script', field:'source_script', value:task.source_script };
  throw new Error('mac_worker_relay_source_contract_missing');
}

async function materializeMacJob(jobRoot, transport) {
  const root = path.resolve(jobRoot);
  const taskPath = path.join(root, 'task.json');
  const task = await readJson(taskPath);
  if (!task || task.job_id !== transport.manifest.job_id) {
    throw new Error('mac_worker_relay_task_contract_invalid');
  }
  const sourceContract = resolveTaskSource(task);
  if (transport.manifest.source_kind && sourceContract.kind !== transport.manifest.source_kind) throw new Error('mac_worker_relay_transport_source_kind_mismatch');
  if (sourceContract.value.sha256 !== transport.manifest.source_sha256) throw new Error('mac_worker_relay_task_contract_invalid');
  const originalExactPath = String(sourceContract.value.exact_path || '');
  const localSourcePath = path.resolve(root, transport.sourcePath);
  if (!isInside(root, localSourcePath)) throw new Error('mac_worker_relay_local_source_path_invalid');
  const sourceEvidence = await sha256File(localSourcePath);
  if (sourceEvidence.sha256 !== transport.manifest.source_sha256) throw new Error('mac_worker_relay_local_source_hash_mismatch');
  sourceContract.value.exact_path = localSourcePath;
  if (task.n06_real_submit) {
    const n06 = task.n06_real_submit;
    if (!n06 || !Array.isArray(n06.references) || n06.references.length !== transport.n06Assets.length) throw new Error('mac_worker_relay_n06_task_contract_invalid');
    const byRefKey = new Map(transport.n06Assets.map(asset => [asset.ref_key, asset]));
    for (const reference of n06.references) {
      const asset = byRefKey.get(reference.ref_key);
      if (!asset || reference.sha256 !== asset.sha256) throw new Error('mac_worker_relay_n06_task_reference_mismatch');
      const localReferencePath = path.resolve(root, safeRelative(asset.path));
      if (!isInside(root, localReferencePath) || (await sha256File(localReferencePath)).sha256 !== reference.sha256) throw new Error('mac_worker_relay_n06_local_reference_hash_mismatch');
      reference.path = localReferencePath;
    }
  }
  await atomicJson(taskPath, task);
  await atomicJson(path.join(root, 'transport_record.json'), {
    schema_version:'niannian_mac_local_transport_record_v1',
    job_id:transport.manifest.job_id,
    source_kind:sourceContract.kind,
    windows_declared_source_path:originalExactPath,
    mac_local_source_path:localSourcePath,
    source_sha256:sourceEvidence.sha256,
    transport_manifest_sha256:(await sha256File(path.join(root, 'transport_manifest.json'))).sha256,
    materialized_at:now()
  });
  return { jobId:transport.manifest.job_id, localSourcePath, sourceSha256:sourceEvidence.sha256, sourceKind:sourceContract.kind };
}

async function writeProductionIndex(config, jobRoot, transport) {
  const task = await readJson(path.join(jobRoot, 'task.json'));
  const status = await readJson(path.join(jobRoot, 'status.json'), {});
  const index = {
    schema_version:1,
    index_type:'zhuanhui_production_jobs',
    workspace_root:config.workspace,
    job_roots:{codex_direct:config.directJobsRoot},
    jobs:[{
      job_id:transport.manifest.job_id,
      entrypoint:'codex_direct',
      source_entrypoint:'niannian_ai_mac_relay',
      source_kind:transport.manifest.source_kind || null,
      remote_job_id:task.remote_job_id || null,
      job_dir:path.resolve(jobRoot),
      status:status.status || 'prepared',
      raw_status:status.status || 'prepared',
      current_step:status.current_node || 'router',
      blockers:status.blocker ? [status.blocker] : [],
      next_action:status.next_action || null,
      delivery_state:{packaged:false,transport_success:false,user_visible_acceptance:false}
    }],
    updated_at:now()
  };
  await atomicJson(config.productionIndex, index);
  return index;
}

function buildDispatcherEnvironment(config, mode, baseEnv = process.env, codexBinDir = null) {
  const workerEnv = { ...baseEnv };
  delete workerEnv.NIANNIAN_CODEX_WORKER_COMMAND;
  delete workerEnv.NIANNIAN_CODEX_WORKER_COMMAND_ARGS;
  const pathKey = Object.keys(workerEnv).find(key => key.toLowerCase() === 'path') || 'PATH';
  const existingPath = String(workerEnv[pathKey] || '');
  const requiredCodexBin = path.resolve(codexBinDir || workerEnv.NIANNIAN_CODEX_BIN_DIR || path.join(os.homedir(), '.local', 'bin'));
  const pathEntries = existingPath.split(path.delimiter).filter(Boolean);
  if (!pathEntries.some(entry => path.resolve(entry) === requiredCodexBin)) pathEntries.unshift(requiredCodexBin);
  workerEnv[pathKey] = pathEntries.join(path.delimiter);
  workerEnv.ZHUANHUI_WORKSPACE = config.workspace;
  workerEnv.NIANNIAN_PRODUCTION_INDEX = config.productionIndex;
  workerEnv.NIANNIAN_CODEX_WORKER_STATE_DIR = config.workerState;
  workerEnv.NIANNIAN_CODEX_WORKER_MODE = mode;
  workerEnv.NIANNIAN_CODEX_WORKER_ROUTER_ALLOWLIST = 'mx-shortdrama-00-router,mx-shortdrama-01-frame-extract,mx-shortdrama-script-only-production';
  return workerEnv;
}

async function runDispatcher(config, mode, runtimeEnv = process.env) {
  if (mode === 'execute' && !config.execute) throw new Error('mac_worker_relay_execute_requires_flag');
  const dispatcher = path.join(config.sourceRoot, 'bridge', 'niannian_codex_worker_dispatcher.js');
  await ensureRegularFile(dispatcher, 'mac_worker_relay_dispatcher_missing');
  return runProcess(process.execPath, [dispatcher], {
    cwd:config.sourceRoot,
    env:buildDispatcherEnvironment(config, mode, runtimeEnv)
  });
}

function selectRuntimeProfile(task) {
  if (task && task.runtime_profile) return task.runtime_profile;
  return task && task.source_video ? 'mac-step01-strict-evidence-v1' : null;
}

async function writePreflightBlockedArtifacts(jobRoot, task, preflight) {
  const jobId = safeJobId(task.job_id);
  const productionStatus = preflight.classification === 'contract' ? 'blocked_contract' : 'blocked_resource';
  const dispatchId = 'preflight-' + crypto.randomBytes(10).toString('hex');
  const blocker = {
    code:preflight.classification === 'contract' ? 'employee_runtime_contract_preflight_failed' : 'employee_runtime_preflight_failed',
    class:preflight.classification,
    runtime_profile:preflight.runtime_profile,
    missing:preflight.missing,
    contract_issues:preflight.contract_issues,
    retryable:preflight.classification === 'resource',
    automatic_retry_allowed:preflight.classification === 'resource' && task.analysis_authorization && task.analysis_authorization.approval_mode === 'policy_auto',
    resume_event:preflight.classification === 'contract' ? 'employee_runtime_contract_corrected' : 'employee_runtime_profile_ready'
  };
  const updatedAt = now();
  const { env:ignoredEnvironment, ...safePreflight } = preflight;
  const nextAction = preflight.classification === 'contract'
    ? 'Correct the exact job authorization/runtime contract before any recovery.'
    : 'Complete the Mac employee runtime profile; the low-risk recovery gate will evaluate one exact retry.';
  const existingLedger = await readJson(path.join(jobRoot, 'artifact_ledger.json'), { job_id:jobId, artifacts:[] });
  const existingDashboard = await readJson(path.join(jobRoot, 'gate_dashboard.json'), { job_id:jobId, gates:{} });
  const gates = { ...(existingDashboard.gates || {}) };
  gates.provider_submit = { status:'blocked_cost_authorization' };
  gates.package_send = { status:'blocked_controller_authorization' };
  gates.employee_preflight = { status:productionStatus, blocker };
  await Promise.all([
    atomicJson(path.join(jobRoot, 'status.json'), {
      job_id:jobId, status:productionStatus, current_node:'employee_runtime_preflight',
      next_skill:task.required_router || null, next_action:nextAction, blocker, updated_at:updatedAt
    }),
    atomicJson(path.join(jobRoot, 'checkpoint.json'), {
      job_id:jobId, status:productionStatus, current_step:'employee_runtime_preflight',
      next_skill:task.required_router || null, next_action:nextAction, blocker, updated_at:updatedAt
    }),
    atomicJson(path.join(jobRoot, 'gate_dashboard.json'), {
      ...existingDashboard, job_id:jobId, overall_status:productionStatus,
      current_node:'employee_runtime_preflight', gates, next_action:nextAction, updated_at:updatedAt
    }),
    atomicJson(path.join(jobRoot, 'artifact_ledger.json'), {
      ...existingLedger, job_id:jobId, artifacts:Array.isArray(existingLedger.artifacts) ? existingLedger.artifacts : [], updated_at:updatedAt
    }),
    atomicJson(path.join(jobRoot, 'result_manifest.json'), {
      job_id:jobId, status:productionStatus, success:false, artifacts:[],
      blocker, packaged:false, transport_success:false, user_visible_acceptance:false, updated_at:updatedAt
    }),
    atomicJson(path.join(jobRoot, 'employee_dispatch.json'), {
      schema_version:1, job_id:jobId, dispatch_id:dispatchId, mode:'preflight', status:'blocked',
      worker_status:'not_started', process_id:null, thread_id:null,
      runtime_profile:preflight.runtime_profile,
      authorization_event_id:task.analysis_authorization && task.analysis_authorization.event_id || null,
      created_at:updatedAt, updated_at:updatedAt
    }),
    atomicJson(path.join(jobRoot, 'employee_worker_receipt.json'), {
      schema_version:1, job_id:jobId, dispatch_id:dispatchId, production_status:productionStatus,
      worker_status:'blocked', current_node:'employee_runtime_preflight', next_skill:task.required_router || null,
      next_action:nextAction, blocker, provider_submission_requested:false, package_send_requested:false,
      worker_started:false, updated_at:updatedAt
    }),
    atomicJson(path.join(jobRoot, 'employee_preflight.json'), safePreflight),
    fsp.writeFile(path.join(jobRoot, 'worker_report.md'), [
      '# Worker Report', '', '- Worker started: no', '- Status: `' + productionStatus + '`',
      '- Runtime profile: `' + preflight.runtime_profile + '`',
      '- Next action: ' + nextAction, '- Provider submission requested: false',
      '- Package/send requested: false', ''
    ].join('\n'), 'utf8')
  ]);
  return { productionStatus, blocker };
}

async function waitForReceipt(jobRoot, timeoutMs) {
  const receiptPath = path.join(jobRoot, 'employee_worker_receipt.json');
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const receipt = await readJson(receiptPath);
    if (receipt) return receipt;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('mac_worker_relay_receipt_timeout');
}

function looksSensitive(text) {
  return [
    /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i,
    /(?:aws_access_key_id|aws_secret_access_key)\s*[:=]/i,
    /\bAKIA[0-9A-Z]{16}\b/,
    /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/i,
    /authorization\s*:\s*bearer\s+[A-Za-z0-9_./+=-]{12,}/i
  ].some(pattern => pattern.test(text));
}

function step01EvidenceBundleRequired(receipt) {
  return receipt && receipt.production_status === 'step01_verified';
}

async function buildStep01EvidenceBundle(jobRoot, transport) {
  const receipt = await readJson(path.join(jobRoot, 'employee_worker_receipt.json'));
  if (!step01EvidenceBundleRequired(receipt)) return [];
  const ledger = await readJson(path.join(jobRoot, 'artifact_ledger.json'), {artifacts:[]});
  const candidates = (Array.isArray(ledger.artifacts) ? ledger.artifacts : []).filter(item =>
    item && item.node_id === 'Step01' && item.status === 'verified' && item.artifact_id !== 'source_video'
  );
  if (!candidates.length || candidates.length > MAX_STEP01_EVIDENCE_FILES) throw new Error('mac_worker_relay_step01_bundle_artifact_count_invalid');
  const root = path.resolve(jobRoot);
  const seenIds = new Set();
  const seenArchivePaths = new Set();
  let totalBytes = 0;
  const files = [];
  const JSZip = require('jszip');
  const zip = new JSZip();
  for (const artifact of candidates) {
    const artifactId = String(artifact.artifact_id || '');
    if (!/^[a-zA-Z0-9._-]{1,160}$/.test(artifactId) || seenIds.has(artifactId)) throw new Error('mac_worker_relay_step01_bundle_artifact_id_invalid');
    const source = path.resolve(String(artifact.exact_path || ''));
    if (!isInside(root, source)) throw new Error('mac_worker_relay_step01_bundle_path_outside_job');
    const stats = await ensureRegularFile(source, 'mac_worker_relay_step01_bundle_file_missing');
    if (stats.size > MAX_STEP01_EVIDENCE_FILE_BYTES || totalBytes + stats.size > MAX_STEP01_EVIDENCE_TOTAL_BYTES) throw new Error('mac_worker_relay_step01_bundle_size_exceeded');
    if (/\.(?:json|md|txt|csv|srt|vtt)$/i.test(source) && looksSensitive(await fsp.readFile(source, 'utf8'))) throw new Error('mac_worker_relay_step01_bundle_sensitive_content_rejected');
    const evidence = await sha256File(source);
    if (artifact.sha256 !== evidence.sha256 || Number(artifact.bytes) !== evidence.bytes) throw new Error('mac_worker_relay_step01_bundle_ledger_hash_mismatch');
    const archivePath = 'evidence/' + evidence.sha256 + path.extname(source).toLowerCase();
    if (seenArchivePaths.has(archivePath)) throw new Error('mac_worker_relay_step01_bundle_archive_collision');
    zip.file(archivePath, await fsp.readFile(source), {binary:true,createFolders:false});
    seenIds.add(artifactId);
    seenArchivePaths.add(archivePath);
    totalBytes += evidence.bytes;
    files.push({artifact_id:artifactId,archive_path:archivePath,bytes:evidence.bytes,sha256:evidence.sha256});
  }
  if (!files.some(item => /evidence_manifest/i.test(item.artifact_id)) || !files.some(item => /validation_report/i.test(item.artifact_id))) {
    throw new Error('mac_worker_relay_step01_bundle_required_artifacts_missing');
  }
  const manifest = {
    schema_version:'niannian_step01_evidence_bundle_v1',
    job_id:transport.manifest.job_id,
    source_sha256:transport.manifest.source_sha256,
    receipt_dispatch_id:receipt.dispatch_id,
    files:files.sort((left, right) => left.artifact_id.localeCompare(right.artifact_id)),
    total_bytes:totalBytes,
    generated_at:now()
  };
  await atomicJson(path.join(root, STEP01_EVIDENCE_BUNDLE_FILES[0]), manifest);
  await fsp.writeFile(path.join(root, STEP01_EVIDENCE_BUNDLE_FILES[1]), await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}}));
  return [...STEP01_EVIDENCE_BUNDLE_FILES];
}

async function buildReturnPackage(config, jobRoot, transport) {
  const jobId = transport.manifest.job_id;
  const outgoing = path.join(config.outgoingRoot, jobId);
  const staging = outgoing + '.incoming-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.rm(staging, { recursive:true, force:true });
  await fsp.rm(outgoing, { recursive:true, force:true });
  try {
    const extraFiles = await buildStep01EvidenceBundle(jobRoot, transport);
    const returnFiles = RETURN_FILES.concat(extraFiles);
    for (const relative of returnFiles) {
      const source = path.join(jobRoot, relative);
      await ensureRegularFile(source, 'mac_worker_relay_return_file_missing');
      if (/\.(?:json|md)$/i.test(relative) && looksSensitive(await fsp.readFile(source, 'utf8'))) {
        throw new Error('mac_worker_relay_return_sensitive_content_rejected');
      }
      await fsp.mkdir(path.dirname(path.join(staging, relative)), { recursive:true });
      await fsp.copyFile(source, path.join(staging, relative), fs.constants.COPYFILE_EXCL);
    }
    const files = [];
    for (const relative of returnFiles) {
      const evidence = await sha256File(path.join(staging, relative));
      files.push({ path:relative, bytes:evidence.bytes, sha256:evidence.sha256 });
    }
    await atomicJson(path.join(staging, 'return_manifest.json'), {
      schema_version:'niannian_mac_return_v1',
      job_id:jobId,
      source_sha256:transport.manifest.source_sha256,
      files:files.sort((left, right) => left.path.localeCompare(right.path)),
      generated_at:now()
    });
    await fsp.mkdir(path.dirname(outgoing), { recursive:true });
    await fsp.rename(staging, outgoing);
    return outgoing;
  } catch (error) {
    await fsp.rm(staging, { recursive:true, force:true });
    throw error;
  }
}

async function pushReturnPackage(config, localJobId, packageRoot) {
  const jobId = safeJobId(localJobId);
  const remotePath = config.remoteRelayRoot + '/returns/' + jobId + '/';
  const manifest = await readJson(path.join(packageRoot, 'return_manifest.json'));
  if (!manifest || !Array.isArray(manifest.files)) throw new Error('mac_worker_relay_return_manifest_invalid');
  const localFiles = manifest.files.map(entry => path.join(packageRoot, safeRelative(entry.path))).concat([path.join(packageRoot, 'return_manifest.json')]);
  await callRemoteGateway(config, 'prepare-return', [jobId]);
  await runProcess('scp', sshOptions(config).concat(localFiles, [remoteTarget(config) + ':' + remotePath]));
  return callRemoteGateway(config, 'ingest-return', [jobId]);
}

async function assertKeyPath(config) {
  await ensureRegularFile(config.keyPath, 'mac_worker_relay_key_file_missing');
}

async function main() {
  const config = relayConfig();
  await assertKeyPath(config);
  const claimed = await callRemoteGateway(config, 'claim-export', config.requestedJobId ? [config.requestedJobId] : []);
  if (claimed.status === 'idle') {
    process.stdout.write(JSON.stringify({ ok:true, status:'idle' }) + '\n');
    return;
  }
  const jobId = safeJobId(claimed.jobId);
  if (config.requestedJobId && jobId !== config.requestedJobId) throw new Error('mac_worker_relay_requested_job_mismatch');
  const jobRoot = await pullTransportPackage(config, jobId);
  const transport = await verifyTransportPackage(jobRoot);
  await materializeMacJob(jobRoot, transport);
  await writeProductionIndex(config, jobRoot, transport);
  if (!config.execute) {
    await runDispatcher(config, 'queue');
    process.stdout.write(JSON.stringify({ ok:true, status:'prepared_no_worker_started', jobId, next_action:'Run again with --execute only after authorizing an isolated Codex worker session.' }) + '\n');
    return;
  }
  const task = await readJson(path.join(jobRoot, 'task.json'));
  const runtimeProfile = selectRuntimeProfile(task);
  let runtimeEnv = process.env;
  if (runtimeProfile) {
    const preflight = await runEmployeePreflight({ sourceRoot:config.sourceRoot, jobRoot, task, runtimeProfile });
    runtimeEnv = preflight.env;
    if (!preflight.ready) {
      const blocked = await writePreflightBlockedArtifacts(jobRoot, task, preflight);
      const packageRoot = await buildReturnPackage(config, jobRoot, transport);
      const result = await pushReturnPackage(config, jobId, packageRoot);
      process.stdout.write(JSON.stringify({ ok:true, status:result.status, jobId, productionStatus:blocked.productionStatus, workerStarted:false }) + '\n');
      return;
    }
  }
  await runDispatcher(config, 'queue', runtimeEnv);
  await runDispatcher(config, 'execute', runtimeEnv);
  await waitForReceipt(jobRoot, config.receiptTimeoutMs);
  await runDispatcher(config, 'execute', runtimeEnv);
  const packageRoot = await buildReturnPackage(config, jobRoot, transport);
  const result = await pushReturnPackage(config, jobId, packageRoot);
  process.stdout.write(JSON.stringify({ ok:true, status:result.status, jobId, productionStatus:result.productionStatus }) + '\n');
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write('mac_worker_relay_failed: ' + error.message + '\n');
    process.exitCode = 1;
  });
}

module.exports = {
  EXPORT_CONTRACT_FILES,
  RETURN_FILES,
  safeJobId,
  sha256File,
  verifyTransportPackage,
  materializeMacJob,
  writeProductionIndex,
  STEP01_EVIDENCE_BUNDLE_FILES,
  buildReturnPackage,
  relayConfig,
  sshOptions,
  remoteTarget,
  runProcess,
  callRemoteGateway,
  archiveExistingMacJob,
  buildDispatcherEnvironment,
  selectRuntimeProfile,
  writePreflightBlockedArtifacts,
  buildStep01EvidenceBundle
};
