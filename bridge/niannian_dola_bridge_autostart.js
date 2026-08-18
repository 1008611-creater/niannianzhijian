'use strict';

const { spawn } = require('node:child_process');

const DEFAULT_HEALTH_URL = 'http://127.0.0.1:9190/api/v1/capabilities';
const DEFAULT_WINDOWS_COMMAND = 'E:\\8.15V3版本\\国际-客户便携版\\国际豆包-客户便携版\\国际豆包.exe';
const DEFAULT_DEBUG_PORT = 9229;

function error(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

async function healthy(fetchImpl = global.fetch, healthUrl = process.env.NIANNIAN_DOLA_BRIDGE_HEALTH_URL || DEFAULT_HEALTH_URL) {
  try {
    const response = await fetchImpl(healthUrl, { method: 'GET', signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

function configuredCommand() {
  const command = String(process.env.NIANNIAN_DOLA_BRIDGE_COMMAND || (process.platform === 'win32' ? DEFAULT_WINDOWS_COMMAND : '')).trim();
  if (!command) throw error('DOLA_BRIDGE_AUTOSTART_NOT_CONFIGURED', 'Dola 桥接启动命令尚未配置');
  return command;
}

function configuredLaunch() {
  const executable = String(process.env.NIANNIAN_DOLA_EXECUTABLE || DEFAULT_WINDOWS_COMMAND).trim();
  const port = Number(process.env.NIANNIAN_DOLA_DEBUG_PORT || DEFAULT_DEBUG_PORT);
  if (!executable || !Number.isInteger(port) || port < 1024 || port > 65535) throw error('DOLA_BRIDGE_LAUNCH_CONFIG_INVALID', 'Dola 启动配置无效');
  return { executable, args: ['--remote-debugging-port=' + port], port };
}

function start(command = configuredCommand(), spawnImpl = spawn) {
  const child = spawnImpl(command, [], {
    cwd: process.env.NIANNIAN_DOLA_BRIDGE_CWD || process.cwd(),
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
    shell: true
  });
  child.unref();
  return { started: true };
}

function startDesktop(options = {}, spawnImpl = spawn) {
  const launch = options.executable ? options : configuredLaunch();
  const child = spawnImpl(launch.executable, launch.args || ['--remote-debugging-port=' + launch.port], {
    cwd: process.env.NIANNIAN_DOLA_BRIDGE_CWD || process.cwd(),
    detached: true,
    windowsHide: true,
    stdio: 'ignore'
  });
  child.unref();
  return { started: true, port: launch.port };
}

async function ensureRunning(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const healthUrl = options.healthUrl || process.env.NIANNIAN_DOLA_BRIDGE_HEALTH_URL || DEFAULT_HEALTH_URL;
  if (await healthy(fetchImpl, healthUrl)) return { status: 'already_running' };
  start(options.command || configuredCommand(), options.spawnImpl);
  const deadline = Date.now() + Number(options.timeoutMs || 8000);
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 250));
    if (await healthy(fetchImpl, healthUrl)) return { status: 'started' };
  }
  throw error('DOLA_BRIDGE_AUTOSTART_TIMEOUT', 'Dola 桥接服务启动超时');
}

module.exports = { DEFAULT_HEALTH_URL, DEFAULT_WINDOWS_COMMAND, DEFAULT_DEBUG_PORT, healthy, configuredCommand, configuredLaunch, start, startDesktop, ensureRunning };
