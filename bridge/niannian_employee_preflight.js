'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const lowRiskPolicy = require('./niannian_low_risk_policy');
const capabilityStatus = require('./niannian_runtime_capability_status');

function now() { return new Date().toISOString(); }

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
}

async function readJsonOptional(filePath) {
  try { return await readJson(filePath); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function expandHome(value, homeDir) {
  const raw = String(value || '');
  return raw === '~' ? homeDir : raw.startsWith('~/') ? path.join(homeDir, raw.slice(2)) : raw;
}

function buildRuntimeEnvironment(profile, baseEnv = process.env, homeDir = os.homedir()) {
  const env = { ...baseEnv };
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
  const existing = String(env[pathKey] || '').split(path.delimiter).filter(Boolean);
  const candidates = (profile.path_candidates || []).map(value => path.resolve(expandHome(value, homeDir)));
  const seen = new Set();
  env[pathKey] = candidates.concat(existing).filter(entry => {
    const key = path.resolve(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(path.delimiter);
  return env;
}

function runCommand(command, args, options = {}) {
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = spawn(command, args, { cwd:options.cwd, env:options.env, stdio:['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.on('error', error => finish({ ok:false, code:null, stdout:'', error:error.code || error.message }));
    child.on('exit', code => finish({ ok:code === 0, code, stdout:stdout.trim(), error:null }));
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ ok:false, code:null, stdout:stdout.trim(), error:'TIMEOUT' });
    }, Math.max(1000, Number(options.timeoutMs || 5000)));
    timer.unref();
  });
}

function commandProbeArgs(command) {
  return command === 'codex' ? ['--version'] : ['-version'];
}

async function resolveExecutable(command, env) {
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
  for (const directory of String(env[pathKey] || '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, command);
    const usable = await fsp.access(candidate, fs.constants.X_OK).then(() => true, () => false);
    if (usable) return path.resolve(candidate);
  }
  return null;
}

function taskSource(task) {
  if (task && task.source_video && !task.source_script) return { kind:'source_video', value:task.source_video };
  if (task && task.source_script && !task.source_video) return { kind:'source_script', value:task.source_script };
  return null;
}

function skillExecutionAllowed(registry, skillName, taskKind, phase, profileName) {
  const skill = registry && registry.skills && registry.skills[skillName];
  if (!skill || !Array.isArray(skill.compatibility)) return false;
  return skill.compatibility.some(rule => rule && rule.execution_enabled === true
    && Array.isArray(rule.task_kinds) && rule.task_kinds.includes(taskKind)
    && Array.isArray(rule.phases) && rule.phases.includes(phase)
    && Array.isArray(rule.profiles) && rule.profiles.includes(profileName));
}

function validateTaskContract(task, profileName, profile) {
  const source = taskSource(task);
  const issues = [];
  if (!task || !task.job_id) issues.push('job_id_missing');
  if (!source) issues.push('source_contract_invalid');
  if (source && !(profile.task_kinds || []).includes(source.kind)) issues.push('runtime_profile_task_kind_mismatch');
  if (task && task.runtime_profile && task.runtime_profile !== profileName) issues.push('runtime_profile_mismatch');
  if (source && !/^[a-f0-9]{64}$/.test(String(source.value.sha256 || ''))) issues.push('source_sha256_invalid');
  if (source && task && task.analysis_authorization) {
    const authorization = task.analysis_authorization;
    if (!authorization.event_id) issues.push('authorization_event_id_missing');
    if (authorization.source_sha256 !== source.value.sha256) issues.push('authorization_source_sha256_mismatch');
    if (source.kind === 'source_video' && authorization.allowed_scope !== 'step01_evidence_only') issues.push('authorization_scope_invalid');
    if (authorization.approval_mode === 'policy_auto') {
      const decision = lowRiskPolicy.evaluateLowRiskAnalysis({...authorization,allowed_skill_routes:task.allowed_skill_routes});
      if (!decision.approved || authorization.approval_policy_id !== lowRiskPolicy.POLICY_ID || authorization.risk_class !== 'low' || authorization.auto_approved !== true) issues.push('policy_auto_approval_invalid');
    }
  } else if (source && source.kind === 'source_video') {
    issues.push('analysis_authorization_missing');
  }
  const allowed = new Set(Array.isArray(task && task.allowed_skill_routes) ? task.allowed_skill_routes : []);
  for (const skill of profile.required_skills || []) if (!allowed.has(skill)) issues.push('required_skill_not_authorized:' + skill);
  return issues;
}

async function isWritableDirectory(directory) {
  const marker = path.join(directory, '.employee-preflight-' + process.pid + '-' + Date.now());
  try {
    await fsp.mkdir(directory, { recursive:true });
    await fsp.writeFile(marker, 'preflight\n', { flag:'wx' });
    await fsp.unlink(marker);
    return true;
  } catch {
    await fsp.unlink(marker).catch(() => {});
    return false;
  }
}

async function runEmployeePreflight(options) {
  const sourceRoot = path.resolve(options.sourceRoot);
  const jobRoot = path.resolve(options.jobRoot);
  const homeDir = path.resolve(options.homeDir || os.homedir());
  const task = options.task || await readJson(path.join(jobRoot, 'task.json'));
  const profileName = options.runtimeProfile || task.runtime_profile || (task.source_video ? 'mac-step01-strict-evidence-v1' : 'mac-video-analysis-v1');
  const profiles = await readJson(options.profilesPath || path.join(sourceRoot, 'bridge', 'runtime_profiles.json'));
  const registry = await readJson(options.registryPath || path.join(sourceRoot, 'bridge', 'skill_registry.json'));
  const profile = profiles.profiles && profiles.profiles[profileName];
  if (!profile) throw new Error('employee_preflight_runtime_profile_unknown');
  const contractIssues = validateTaskContract(task, profileName, profile);
  const runtimeEnv = buildRuntimeEnvironment(profile, options.baseEnv || process.env, homeDir);
  const probe = options.runCommand || runCommand;
  const resolved = {};
  const missing = [];

  if (contractIssues.length === 0) {
    const binaryResults = await Promise.all((profile.required_binaries || []).map(async command => {
      const result = await probe(command, commandProbeArgs(command), { cwd:jobRoot, env:runtimeEnv });
      return { command, result };
    }));
    for (const { command, result } of binaryResults) {
      if (result.ok) resolved[command] = await resolveExecutable(command, runtimeEnv) || String(result.stdout || command).split(/\r?\n/)[0].slice(0, 240);
      else missing.push(command);
    }
    const python = profile.python_command || 'python3';
    const pythonResult = await probe(python, ['-c', 'import sys; print(sys.executable)'], { cwd:jobRoot, env:runtimeEnv });
    if (pythonResult.ok) resolved[python] = String(pythonResult.stdout || python).split(/\r?\n/)[0].slice(0, 240);
    else missing.push(python);
    if (pythonResult.ok) {
      const moduleResults = await Promise.all((profile.required_python_modules || []).map(async moduleName => {
        const result = await probe(python, ['-c', 'import ' + moduleName], { cwd:jobRoot, env:runtimeEnv });
        return { moduleName, result };
      }));
      for (const { moduleName, result } of moduleResults) if (!result.ok) missing.push('python_module:' + moduleName);
    }
    for (const skillName of profile.required_skills || []) {
      const skillPath = path.join(homeDir, '.codex', 'skills', skillName, 'SKILL.md');
      const present = await fsp.lstat(skillPath).then(stats => stats.isFile() && !stats.isSymbolicLink(), () => false);
      const sourceKind = taskSource(task)?.kind;
      const phase = profile.execution_phase || 'analysis';
      if (!skillExecutionAllowed(registry, skillName, sourceKind, phase, profileName) || !present) missing.push('skill:' + skillName);
    }
    const requiredCapabilities = Array.isArray(profile.required_capabilities) ? profile.required_capabilities : [];
    if (requiredCapabilities.length) {
      const capabilityPath = path.resolve(expandHome(profile.capability_status_path || '~/.config/ai-brain/runtime_capability_status.json', homeDir));
      const observedCapabilities = await capabilityStatus.readCapabilityStatus(capabilityPath);
      const capabilities = observedCapabilities.capabilities;
      resolved.capability_status_path = capabilityPath;
      if (observedCapabilities.issue) resolved.capability_status_issue = observedCapabilities.issue;
      const maxAgeMinutes = Math.max(1, Number(profile.capability_max_age_minutes || 1440));
      for (const capability of requiredCapabilities) {
        const inspection = capabilityStatus.inspectCapability(capability, capabilities[capability], maxAgeMinutes);
        resolved['capability:' + capability] = inspection;
        if (!inspection.ready) missing.push(capability);
      }
    }
    if (!await isWritableDirectory(jobRoot)) missing.push('job_workspace_writable');
  }

  const classification = contractIssues.length ? 'contract' : missing.length ? 'resource' : null;
  const result = {
    schema_version:'niannian_employee_preflight_v1',
    job_id:task && task.job_id || null,
    ready:classification === null,
    runtime_profile:profileName,
    classification,
    contract_issues:contractIssues,
    missing,
    resolved,
    checked_at:now()
  };
  await fsp.writeFile(path.join(jobRoot, 'employee_preflight.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
  return { ...result, env:runtimeEnv };
}

function cliOption(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const jobRoot = cliOption(args, '--job-root');
  if (!jobRoot) throw new Error('employee_preflight_job_root_required');
  const sourceRoot = path.resolve(cliOption(args, '--source-root') || path.join(__dirname, '..'));
  const runtimeProfile = cliOption(args, '--runtime-profile');
  const result = await runEmployeePreflight({ sourceRoot, jobRoot:path.resolve(jobRoot), ...(runtimeProfile ? {runtimeProfile} : {}) });
  const { env, ...safeResult } = result;
  process.stdout.write(JSON.stringify(safeResult) + '\n');
  if (!safeResult.ready) process.exitCode = 2;
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write('employee_preflight_failed: ' + error.message + '\n');
    process.exitCode = 1;
  });
}

module.exports = { buildRuntimeEnvironment, skillExecutionAllowed, validateTaskContract, runEmployeePreflight };
