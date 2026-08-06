const assert = require('assert');
const runtime = require('./bridge/niannian_step04_runtime');

assert.equal(runtime.rejectedPythonPath('C:/Users/test/AppData/Local/Microsoft/WindowsApps/python.exe'), true);
assert.equal(runtime.rejectedPythonPath('D:/codex-work/tools/LibreOffice/program/python.exe'), true);
assert.equal(runtime.rejectedPythonPath('C:/Users/test/AppData/Local/Python/bin/python3.cmd'), false);
const resolved = runtime.resolveStep04Python({
  NIANNIAN_STEP04_RENDERER_PYTHON: '',
  PYTHON: '',
  LOCALAPPDATA: 'C:/Users/lsb/AppData/Local',
  USERPROFILE: 'C:/Users/lsb',
  CONDA_PREFIX: ''
});
if (process.platform === 'win32') assert.ok(resolved && !runtime.rejectedPythonPath(resolved));
console.log('step04 runtime tests passed', resolved || 'unavailable');
