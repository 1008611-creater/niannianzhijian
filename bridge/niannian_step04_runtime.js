const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function unique(values) {
  return [...new Set(values.filter(value => String(value || '').trim()).map(value => String(value).trim()))];
}

function rejectedPythonPath(value) {
  const normalized = String(value || '').replace(/\\/g, '/').toLowerCase();
  return normalized.includes('/windowsapps/') || normalized.includes('/libreoffice/') || normalized.includes('/program/libreoffice/');
}

function probePython(candidate) {
  if (!candidate || rejectedPythonPath(candidate)) return false;
  const isCmd = /\.(cmd|bat)$/i.test(candidate);
  const result = spawnSync(candidate, ['-c', 'import sys; print(sys.executable)'], {
    encoding: 'utf8',
    windowsHide: true,
    shell: isCmd,
    timeout: 5000
  });
  if (result.error || result.status !== 0) return false;
  const resolved = String(result.stdout || '').trim().split(/\r?\n/).pop() || '';
  return Boolean(resolved) && !rejectedPythonPath(resolved);
}

function commandCandidates(command) {
  if (!command) return [];
  if (path.isAbsolute(command) || command.includes(path.sep) || command.includes('/')) return [command];
  if (process.platform !== 'win32') return [command];
  const result = spawnSync('where.exe', [command], {encoding:'utf8',windowsHide:true,timeout:5000});
  if (result.error || result.status !== 0) return [command];
  return String(result.stdout || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function resolveStep04Python(env = process.env) {
  const candidates = [];
  candidates.push(env.NIANNIAN_STEP04_RENDERER_PYTHON, env.PYTHON);
  if (process.platform === 'win32') {
    candidates.push(
      path.join(env.LOCALAPPDATA || '', 'Python', 'bin', 'python3.cmd'),
      path.join(env.LOCALAPPDATA || '', 'Python', 'bin', 'python.cmd'),
      path.join(env.USERPROFILE || os.homedir(), 'anaconda3', 'python.exe'),
      path.join(env.CONDA_PREFIX || '', 'python.exe'),
      'python3',
      'python',
      'py'
    );
  } else {
    candidates.push('python3', 'python');
  }
  for (const candidate of unique(candidates)) {
    for (const resolvedCandidate of commandCandidates(candidate)) {
      if (probePython(resolvedCandidate)) return resolvedCandidate;
    }
  }
  return null;
}

module.exports = { rejectedPythonPath, probePython, resolveStep04Python };
