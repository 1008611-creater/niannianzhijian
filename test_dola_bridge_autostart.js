'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ensureRunning } = require('./bridge/niannian_dola_bridge_autostart');

function response(ok) { return { ok }; }

(async () => {
  assert.equal(fs.existsSync(path.join(__dirname, 'bridge', 'Start-NianNianDolaBridge.ps1')), true);
  assert.equal(fs.existsSync(path.join(__dirname, 'bridge', 'Install-NianNianDolaStartup.ps1')), true);
  let calls = 0;
  const already = await ensureRunning({ fetchImpl: async () => response(true), spawnImpl: () => { throw new Error('must not spawn'); } });
  assert.equal(already.status, 'already_running');

  let spawned = 0;
  calls = 0;
  const started = await ensureRunning({
    command: 'dola-bridge',
    timeoutMs: 1000,
    fetchImpl: async () => response(++calls > 1),
    spawnImpl: () => { spawned += 1; return { unref() {} }; }
  });
  assert.equal(started.status, 'started');
  assert.equal(spawned, 1);

  await assert.rejects(
    () => ensureRunning({ command: '', fetchImpl: async () => response(false), timeoutMs: 1, spawnImpl: () => ({ unref() {} }) }),
    error => ['DOLA_BRIDGE_AUTOSTART_NOT_CONFIGURED', 'DOLA_BRIDGE_AUTOSTART_TIMEOUT'].includes(error.code)
  );
  console.log('DOLA_BRIDGE_AUTOSTART_OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
