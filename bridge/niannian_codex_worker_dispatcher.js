'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const lowRiskPolicy = require('./niannian_low_risk_policy');

const workspace = path.resolve(process.env.ZHUANHUI_WORKSPACE || 'D:/codex-work/zhuanhui');
const directJobsRoot = path.join(workspace, '06_AUTOMATION', 'direct_jobs');
const productionIndexPath = path.resolve(process.env.NIANNIAN_PRODUCTION_INDEX || path.join(workspace, '06_AUTOMATION', 'production_jobs.index.json'));
const dispatcherRoot = path.resolve(process.env.NIANNIAN_CODEX_WORKER_STATE_DIR || __dirname);
const statePath = path.join(dispatcherRoot, 'codex_worker_state.json');
const eventsPath = path.join(dispatcherRoot, 'codex_worker_events.jsonl');
const lockPath = path.join(dispatcherRoot, '.codex-worker-dispatcher.lock');
const watchMode = process.argv.includes('--watch');
const intervalMs = Math.max(15000, Number(process.env.NIANNIAN_CODEX_WORKER_INTERVAL_MS || 30000));
const workerMode = String(process.env.NIANNIAN_CODEX_WORKER_MODE || 'queue').trim().toLowerCase();
const configuredWorkerCommand = String(process.env.NIANNIAN_CODEX_WORKER_COMMAND || '').trim();
const codexCommand = configuredWorkerCommand || defaultCodexCommand();
const commandArgsPrefix = configuredWorkerCommand ? parseJsonArray(process.env.NIANNIAN_CODEX_WORKER_COMMAND_ARGS) : defaultCodexArgsPrefix();
const allowedRoutes = new Set(String(process.env.NIANNIAN_CODEX_WORKER_ROUTER_ALLOWLIST || 'mx-shortdrama-00-router,mx-shortdrama-01-frame-extract,mx-shortdrama-script-only-production').split(',').map(value => value.trim()).filter(Boolean));
const allowedReceiptStatuses = new Set(['running_step01','step01_verified','running_step02','running_step04','running_step05','step02_accepted','step04_accepted','qa_running','running_n01','running_n02','running_n03','running_n04','blocked_resource','blocked_contract','blocked_quality','infra_failed']);

if (!['queue', 'execute'].includes(workerMode)) throw new Error('NIANNIAN_CODEX_WORKER_MODE must be queue or execute');

function now() { return new Date().toISOString(); }

function defaultCodexCommand() {
  return process.platform === 'win32' ? 'powershell.exe' : 'codex';
}

function defaultCodexArgsPrefix() {
  if (process.platform !== 'win32') return [];
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'run_codex_worker.ps1')];
}

function parseJsonArray(value) {
  if (!value) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) throw new Error('NIANNIAN_CODEX_WORKER_COMMAND_ARGS must be a JSON string array');
  return parsed;
}

function safeJobId(value) {
  const id = String(value || '').trim();
  if (!/^web_n[ns]-[a-z0-9-]{10,100}$/.test(id)) throw new Error('worker_job_id_invalid');
  return id;
}

function declaredAllowedSkillRoutes(task) {
  const routes = Array.isArray(task.allowed_skill_routes)
    ? task.allowed_skill_routes.map(value => String(value || '').trim()).filter(Boolean)
    : [];
  if (!routes.length || new Set(routes).size !== routes.length) throw new Error('worker_skill_route_contract_invalid');
  if (!routes.includes(task.required_router)) throw new Error('worker_required_router_missing_from_contract');
  if (routes.some(route => !allowedRoutes.has(route))) throw new Error('worker_skill_route_not_allowlisted');
  return routes;
}

function isInside(parent, candidate) {
  const base = path.resolve(parent);
  const target = path.resolve(candidate);
  return target === base || target.startsWith(base + path.sep);
}

async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive:true });
  const temporaryPath = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(temporaryPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fsp.rename(temporaryPath, filePath);
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function appendEvent(type, detail) {
  await fsp.mkdir(dispatcherRoot, { recursive:true });
  await fsp.appendFile(eventsPath, JSON.stringify({ at:now(), type, ...detail }) + '\n', 'utf8');
}

async function loadState() {
  const state = await readJson(statePath, {});
  return { schema_version:1, worker_mode:workerMode, jobs:state.jobs && typeof state.jobs === 'object' ? state.jobs : {} };
}

async function saveState(state) {
  await atomicJson(statePath, { ...state, schema_version:1, worker_mode:workerMode, updated_at:now() });
}

async function acquireLock() {
  await fsp.mkdir(dispatcherRoot, { recursive:true });
  try {
    const handle = await fsp.open(lockPath, 'wx');
    await handle.writeFile(JSON.stringify({ pid:process.pid, created_at:now() }) + '\n');
    return handle;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const stats = await fsp.stat(lockPath).catch(() => null);
    if (stats && Date.now() - stats.mtimeMs > Math.max(intervalMs * 3, 10 * 60 * 1000)) {
      await fsp.unlink(lockPath).catch(() => {});
      return acquireLock();
    }
    throw new Error('codex_worker_dispatcher_already_running');
  }
}

async function releaseLock(handle) {
  await handle.close().catch(() => {});
  await fsp.unlink(lockPath).catch(() => {});
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

function resolveTaskSource(task) {
  if (task && task.source_video && task.source_script) throw new Error('worker_source_contract_ambiguous');
  if (task && task.source_video) {
    return { kind:'source_video', label:'源视频', field:'source_video', value:task.source_video };
  }
  if (task && task.source_script) {
    return { kind:'source_script', label:'源文本', field:'source_script', value:task.source_script };
  }
  throw new Error('worker_source_contract_missing');
}

function defaultIndex() {
  return { schema_version:1, index_type:'zhuanhui_production_jobs', workspace_root:workspace, job_roots:{codex_direct:directJobsRoot}, jobs:[] };
}

function dispatchPaths(jobRoot) {
  return {
    dispatch:path.join(jobRoot, 'employee_dispatch.json'),
    prompt:path.join(jobRoot, 'codex_worker_prompt.md'),
    receipt:path.join(jobRoot, 'employee_worker_receipt.json'),
    finalMessage:path.join(jobRoot, 'codex_worker_final_message.md'),
    arguments:path.join(jobRoot, 'codex_worker_args.json'),
    stdout:path.join(jobRoot, 'logs', 'codex-worker.stdout.jsonl'),
    stderr:path.join(jobRoot, 'logs', 'codex-worker.stderr.log')
  };
}

function workerSummary(dispatch) {
  if (!dispatch || typeof dispatch !== 'object') return null;
  return {
    dispatchId:String(dispatch.dispatch_id || '').slice(0, 120) || null,
    threadId:String(dispatch.thread_id || '').slice(0, 160) || null,
    status:String(dispatch.status || 'queued').slice(0, 80),
    router:String(dispatch.required_router || '').slice(0, 120) || null,
    mode:String(dispatch.mode || 'queue').slice(0, 30),
    updatedAt:String(dispatch.updated_at || '').slice(0, 80) || null,
    blocker:String(dispatch.blocker || '').slice(0, 500) || null
  };
}

async function validateJob(indexRow) {
  const localJobId = safeJobId(indexRow.job_id);
  const jobRoot = path.resolve(indexRow.job_dir || '');
  if (!isInside(directJobsRoot, jobRoot)) throw new Error('worker_job_root_outside_direct_jobs');
  const [task, transactionIntent, dashboard, status, checkpoint, routeDecision] = await Promise.all([
    readJson(path.join(jobRoot, 'task.json')),
    readJson(path.join(jobRoot, 'transaction_intent.json')),
    readJson(path.join(jobRoot, 'gate_dashboard.json')),
    readJson(path.join(jobRoot, 'status.json')),
    readJson(path.join(jobRoot, 'checkpoint.json')),
    readJson(path.join(jobRoot, 'route_decision.json'))
  ]);
  if (!task || !transactionIntent || !dashboard || !status || !checkpoint || !routeDecision) throw new Error('worker_contract_artifact_missing');
  if (task.job_id !== localJobId) throw new Error('worker_task_job_id_mismatch');
  const allowedSkillRoutes = declaredAllowedSkillRoutes(task);
  const sourceContract = resolveTaskSource(task);
  const source = sourceContract.value || {};
  if (routeDecision.job_id !== localJobId || routeDecision.required_router !== task.required_router || routeDecision.source_sha256 !== source.sha256) throw new Error('worker_route_decision_mismatch');
  if (!routeDecision.advisory_only || !allowedSkillRoutes.includes(routeDecision.selected_skill)) throw new Error('worker_route_decision_invalid');
  if (!task.constraints || task.constraints.provider_submit_requires_authorization !== true || task.constraints.package_send_requires_authorization !== true) throw new Error('worker_cost_constraints_missing');
  if (task.constraints.step01_requires_user_authorization === true) {
    const authorization = task.analysis_authorization;
    if (!authorization || !/^step01-[a-f0-9]{24}$/.test(String(authorization.event_id || ''))) throw new Error('worker_step01_authorization_missing');
    if (authorization.source_sha256 !== source.sha256 || authorization.allowed_scope !== 'step01_evidence_only') throw new Error('worker_step01_authorization_mismatch');
  }
  if (task.constraints.step01_requires_policy_authorization === true) {
    const authorization = task.analysis_authorization;
    if (!authorization || !/^step01-[a-f0-9]{24}$/.test(String(authorization.event_id || ''))) throw new Error('worker_step01_policy_authorization_missing');
    if (authorization.source_sha256 !== source.sha256 || authorization.approval_mode !== 'policy_auto' || authorization.approval_policy_id !== lowRiskPolicy.POLICY_ID || authorization.risk_class !== 'low' || authorization.auto_approved !== true) {
      throw new Error('worker_step01_policy_authorization_mismatch');
    }
    lowRiskPolicy.assertLowRiskAnalysis({...authorization,allowed_skill_routes:allowedSkillRoutes});
  }
  if (transactionIntent.cost_gate !== 'controller_authorization_required') throw new Error('worker_cost_gate_invalid');
  if (!source.exact_path || !source.sha256 || !isInside(jobRoot, source.exact_path)) throw new Error('worker_source_contract_invalid');
  const evidence = await sha256File(source.exact_path);
  if (evidence.sha256 !== source.sha256) throw new Error('worker_source_sha256_mismatch');
  const providerGate = dashboard.gates && dashboard.gates.provider_submit;
  const providerGateStatus = typeof providerGate === 'string' ? providerGate : providerGate && providerGate.status;
  if (!String(providerGateStatus || '').startsWith('blocked')) throw new Error('worker_provider_gate_must_remain_blocked');
  if (!['prepared','preflight','queued','running_step01','running_step02','running_step04','running_step05','running_n01','running_n02','running_n03','running_n04'].includes(status.status)) throw new Error('worker_status_not_dispatchable');
  return { localJobId, jobRoot, task, transactionIntent, dashboard, status, checkpoint, routeDecision, source:{...evidence, kind:sourceContract.kind, label:sourceContract.label, field:sourceContract.field}, allowedSkillRoutes };
}

function buildPrompt(job, dispatch, paths) {
  const sourceInstruction = job.source.kind === 'source_script'
    ? '源文本只允许使用 `task.json` 中的 `source_script.exact_path`；不得伪造源视频 Step01/Step02 观察事实，也不得从 job 根目录外读取客户素材。'
    : '源视频只允许使用 `task.json` 中的 `source_video.exact_path`；不得猜测、替换或从 job 根目录外读取客户素材。';
  return [
    '# 念念 AI Codex 员工派单',
    '',
    '你是一个独立的 Codex 员工线程，只负责这个 `job_id`。',
    '必须先读取：`task.json`、`transaction_intent.json`、`status.json`、`checkpoint.json`、`gate_dashboard.json`、`artifact_ledger.json`。',
    sourceInstruction,
    '必须从 `required_router` 开始，并只调用该任务允许的 Skill 路由。`route_decision.json` 是控制器写入的 advisory 路由决定；不得在任务目录外搜索或补造它。',
    '不得提交任何图像/视频 provider，不得打包、发送或提升 accepted registry。provider_submit、package_send 和用户可见验收均保持授权阻塞。',
    '不得用本地像素编辑制造生产图片、首帧或候选图。',
    '不要把“计划”写成“完成”。只有已经写入并验证的产物才可在 artifact ledger 标记 verified。',
    '',
    '完成本次可安全执行的工作后，必须写入 `employee_worker_receipt.json`，字段包括：',
    '- `job_id`: `' + job.localJobId + '`',
    '- `dispatch_id`: `' + dispatch.dispatch_id + '`',
    '- `production_status`: 与更新后的 `status.json.status` 一致',
    '- 若当前只能安全阻塞，`production_status` 必须使用有类型的 `blocked_contract`、`blocked_resource`、`blocked_quality` 或 `infra_failed`；禁止写泛化的 `blocked`',
    '- `worker_status`: `active`、`waiting_cost_authorization` 或 `blocked`',
    '- `current_node`、`next_skill`、`next_action`',
    '- `provider_submission_requested`: false',
    '- `package_send_requested`: false',
    '',
    '任务目录：`' + job.jobRoot.replace(/\\/g, '/') + '`',
    '路由：`' + job.task.required_router + '`',
    '允许 Skill：`' + job.allowedSkillRoutes.join('`, `') + '`',
    job.source.label + ' SHA-256：`' + job.source.sha256 + '`',
    'Step01 授权事件：`' + String(job.task.analysis_authorization && job.task.analysis_authorization.event_id || 'legacy_fixture_only') + '`',
    '回执路径：`' + paths.receipt.replace(/\\/g, '/') + '`'
  ].join('\n') + '\n';
}

function findThreadId(value, depth) {
  if (depth > 5 || !value) return null;
  if (typeof value === 'object') {
    const direct = value.thread_id || value.threadId || value.session_id || value.sessionId;
    if (typeof direct === 'string' && direct.length >= 4 && direct.length <= 200) return direct;
    for (const child of Object.values(value)) {
      const found = findThreadId(child, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function readThreadId(stdoutPath) {
  const content = await fsp.readFile(stdoutPath, 'utf8').catch(() => '');
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const found = findThreadId(JSON.parse(line), 0);
      if (found) return found;
    } catch {}
  }
  return null;
}

function isRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function blockJob(jobRoot, code) {
  const [status, checkpoint, dashboard] = await Promise.all([
    readJson(path.join(jobRoot, 'status.json'), {}),
    readJson(path.join(jobRoot, 'checkpoint.json'), {}),
    readJson(path.join(jobRoot, 'gate_dashboard.json'), {})
  ]);
  const updatedAt = now();
  const blocker = 'CODEX_WORKER_' + code;
  const nextAction = 'Codex 员工派单未形成可验证回执，任务已停止。请检查员工派单、任务合同和 worker 日志。';
  status.status = 'blocked_contract';
  status.current_node = status.current_node || 'router';
  status.blocker = blocker;
  status.next_action = nextAction;
  status.updated_at = updatedAt;
  checkpoint.status = 'blocked_contract';
  checkpoint.blockers = [blocker];
  checkpoint.next_action = nextAction;
  checkpoint.updated_at = updatedAt;
  dashboard.blocker = blocker;
  dashboard.next_action = nextAction;
  dashboard.overall_status = 'blocked_contract';
  dashboard.updated_at = updatedAt;
  await Promise.all([
    atomicJson(path.join(jobRoot, 'status.json'), status),
    atomicJson(path.join(jobRoot, 'checkpoint.json'), checkpoint),
    atomicJson(path.join(jobRoot, 'gate_dashboard.json'), dashboard)
  ]);
}

async function validateReceipt(job, dispatch, paths) {
  const receipt = await readJson(paths.receipt);
  if (!receipt) throw new Error('RECEIPT_MISSING');
  if (receipt.job_id !== job.localJobId || receipt.dispatch_id !== dispatch.dispatch_id) throw new Error('RECEIPT_ID_MISMATCH');
  if (!allowedReceiptStatuses.has(receipt.production_status)) throw new Error('RECEIPT_STATUS_INVALID');
  if (receipt.provider_submission_requested === true || receipt.package_send_requested === true) throw new Error('RECEIPT_COST_POLICY_VIOLATION');
  const [status, dashboard] = await Promise.all([
    readJson(path.join(job.jobRoot, 'status.json')),
    readJson(path.join(job.jobRoot, 'gate_dashboard.json'))
  ]);
  if (!status || status.status !== receipt.production_status) throw new Error('RECEIPT_STATUS_NOT_MIRRORED');
  const providerGate = dashboard && dashboard.gates && dashboard.gates.provider_submit;
  const providerGateStatus = typeof providerGate === 'string' ? providerGate : providerGate && providerGate.status;
  if (!String(providerGateStatus || '').startsWith('blocked')) throw new Error('RECEIPT_PROVIDER_GATE_OPEN');
  return receipt;
}

async function writeDispatch(job, existing) {
  const paths = dispatchPaths(job.jobRoot);
  const dispatch = existing || {
    schema_version:'niannian_codex_worker_dispatch_v1',
    job_id:job.localJobId,
    remote_job_id:job.task.remote_job_id || null,
    dispatch_id:'cw-' + crypto.randomBytes(12).toString('hex'),
    required_router:job.task.required_router,
    allowed_skill_routes:job.allowedSkillRoutes,
    source_sha256:job.source.sha256,
    authorization_event_id:job.task.analysis_authorization && job.task.analysis_authorization.event_id || null,
    mode:workerMode,
    status:'queued',
    thread_id:null,
    process_id:null,
    worker_status:'queued',
    blocker:null,
    created_at:now()
  };
  if (dispatch.status === 'queued') dispatch.mode = workerMode;
  dispatch.updated_at = now();
  await fsp.mkdir(path.dirname(paths.stdout), { recursive:true });
  await fsp.writeFile(paths.prompt, buildPrompt(job, dispatch, paths), 'utf8');
  await atomicJson(paths.dispatch, dispatch);
  return { dispatch, paths };
}

async function launchWorker(job, dispatch, paths) {
  const prompt = await fsp.readFile(paths.prompt, 'utf8');
  const codexArguments = [
    '-a', 'never', 'exec', '--ephemeral', '--json', '--output-last-message', paths.finalMessage,
    '--sandbox', 'workspace-write', '--skip-git-repo-check',
    '-C', job.jobRoot, prompt
  ];
  // PowerShell parses hyphen-prefixed values as its own script parameters. Pass the
  // audited argv file path so the Windows wrapper can forward it exactly.
  await atomicJson(paths.arguments, codexArguments);
  const argumentsForCodex = process.platform === 'win32' && !configuredWorkerCommand
    ? commandArgsPrefix.concat(['-CodexArgsPath', paths.arguments])
    : commandArgsPrefix.concat(codexArguments);
  const stdoutStream = fs.createWriteStream(paths.stdout, { flags:'a' });
  const stderrStream = fs.createWriteStream(paths.stderr, { flags:'a' });
  let child;
  try {
    child = spawn(codexCommand, argumentsForCodex, {
      cwd:job.jobRoot,
      windowsHide:true,
      stdio:['ignore', 'pipe', 'pipe'],
      env:{
        ...process.env,
        NIANNIAN_WORKER_JOB_ROOT:job.jobRoot,
        NIANNIAN_WORKER_DISPATCH_PATH:paths.dispatch,
        NIANNIAN_WORKER_RECEIPT_PATH:paths.receipt,
        NIANNIAN_WORKER_PROMPT_PATH:paths.prompt,
        NIANNIAN_WORKER_FINAL_MESSAGE_PATH:paths.finalMessage,
        NIANNIAN_WORKER_ALLOWED_ROUTER:job.task.required_router,
        NIANNIAN_WORKER_ALLOWED_ROUTES:job.allowedSkillRoutes.join(',')
      }
    });
    child.stdout.pipe(stdoutStream);
    child.stderr.pipe(stderrStream);
    child.once('error', error => {
      appendEvent('worker_process_error', {
        job_id:job.localJobId,
        dispatch_id:dispatch.dispatch_id,
        blocker:error.message
      }).catch(() => {});
    });
    child.once('close', () => {
      stdoutStream.end();
      stderrStream.end();
    });
  } catch (error) {
    stdoutStream.end();
    stderrStream.end();
    throw error;
  }
  dispatch.status = 'running';
  dispatch.worker_status = 'starting';
  dispatch.process_id = child.pid;
  dispatch.started_at = now();
  dispatch.updated_at = now();
  await atomicJson(paths.dispatch, dispatch);
  return dispatch;
}

async function reconcileDispatch(job, dispatch, paths) {
  const receipt = await readJson(paths.receipt);
  if (['handoff','waiting_cost_authorization'].includes(dispatch.status)) return dispatch;
  if (dispatch.status === 'blocked' && (!receipt || dispatch.blocker !== 'RECEIPT_MISSING')) return dispatch;
  if (receipt) {
    try {
      const validated = await validateReceipt(job, dispatch, paths);
      dispatch.thread_id = dispatch.thread_id || await readThreadId(paths.stdout);
      dispatch.status = validated.worker_status === 'waiting_cost_authorization' ? 'waiting_cost_authorization' : 'handoff';
      dispatch.worker_status = String(validated.worker_status || 'active').slice(0, 80);
      dispatch.current_node = String(validated.current_node || '').slice(0, 160) || null;
      dispatch.next_skill = String(validated.next_skill || '').slice(0, 160) || null;
      dispatch.next_action = String(validated.next_action || '').slice(0, 500) || null;
      dispatch.process_id = null;
      dispatch.completed_at = now();
      dispatch.updated_at = now();
      await atomicJson(paths.dispatch, dispatch);
      await appendEvent('worker_receipt_verified', { job_id:job.localJobId, dispatch_id:dispatch.dispatch_id, thread_id:dispatch.thread_id, status:dispatch.status });
      return dispatch;
    } catch (error) {
      dispatch.status = 'blocked';
      dispatch.worker_status = 'blocked';
      dispatch.blocker = error.message;
      dispatch.updated_at = now();
      dispatch.process_id = null;
      await atomicJson(paths.dispatch, dispatch);
      await blockJob(job.jobRoot, error.message);
      await appendEvent('worker_receipt_rejected', { job_id:job.localJobId, dispatch_id:dispatch.dispatch_id, blocker:error.message });
      return dispatch;
    }
  }
  if (dispatch.status === 'blocked') return dispatch;
  if (dispatch.status === 'running' && !isRunning(dispatch.process_id)) {
    dispatch.status = 'blocked';
    dispatch.worker_status = 'blocked';
    dispatch.blocker = 'RECEIPT_MISSING';
    dispatch.updated_at = now();
    dispatch.process_id = null;
    await atomicJson(paths.dispatch, dispatch);
    await blockJob(job.jobRoot, 'RECEIPT_MISSING');
    await appendEvent('worker_receipt_missing', { job_id:job.localJobId, dispatch_id:dispatch.dispatch_id });
  }
  return dispatch;
}

async function dispatchJob(indexRow, state) {
  let job;
  try {
    job = await validateJob(indexRow);
  } catch (error) {
    await appendEvent('job_rejected', { job_id:indexRow.job_id, blocker:error.message });
    return { job_id:indexRow.job_id, status:'rejected', blocker:error.message };
  }
  const paths = dispatchPaths(job.jobRoot);
  const existing = await readJson(paths.dispatch);
  const written = await writeDispatch(job, existing);
  let dispatch = await reconcileDispatch(job, written.dispatch, written.paths);
  if (dispatch.status === 'queued' && workerMode === 'execute') {
    dispatch = await launchWorker(job, dispatch, written.paths);
    await appendEvent('worker_started', { job_id:job.localJobId, dispatch_id:dispatch.dispatch_id, process_id:dispatch.process_id });
  }
  state.jobs[job.localJobId] = { dispatch_id:dispatch.dispatch_id, status:dispatch.status, thread_id:dispatch.thread_id || null, updated_at:dispatch.updated_at };
  return { job_id:job.localJobId, status:dispatch.status, thread_id:dispatch.thread_id || null, worker:workerSummary(dispatch) };
}

async function runOnce() {
  const state = await loadState();
  const index = await readJson(productionIndexPath, defaultIndex());
  const jobs = Array.isArray(index.jobs) ? index.jobs : [];
  const results = [];
  for (const row of jobs) {
    if (row.entrypoint !== 'codex_direct' || !['niannian_ai_web','niannian_ai_web_script','niannian_ai_mac_relay'].includes(row.source_entrypoint)) continue;
    results.push(await dispatchJob(row, state));
  }
  await saveState(state);
  return { worker_mode:workerMode, jobs:results };
}

async function main() {
  do {
    let lock;
    try {
      lock = await acquireLock();
      const result = await runOnce();
      process.stdout.write(JSON.stringify({ status:'ok', at:now(), ...result }) + '\n');
    } catch (error) {
      await appendEvent('dispatcher_error', { blocker:error.message }).catch(() => {});
      if (!watchMode) throw error;
    } finally {
      if (lock) await releaseLock(lock);
    }
    if (watchMode) await new Promise(resolve => setTimeout(resolve, intervalMs));
  } while (watchMode);
}

main().catch(error => {
  process.stderr.write('codex_worker_dispatcher_failed: ' + error.message + '\n');
  process.exitCode = 1;
});
