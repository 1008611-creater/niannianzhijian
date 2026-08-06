'use strict';

const assert = require('assert');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const preflight = require('./bridge/niannian_mac_hq_refresh_preflight');

async function writeJson(filePath, value) {
  await fsp.writeFile(filePath, JSON.stringify(value), 'utf8');
}

(async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'hq-refresh-preflight-'));
  try {
    const gatePath = path.join(root, 'gate.json');
    const exitPath = path.join(root, 'exit.json');
    const statusPath = path.join(root, 'status.json');
    const now = Date.parse('2026-07-18T05:00:00.000Z');
    const gate = {
      schema_version:'niannian_step01_hq_full_gate_receipt_v2', status:'ready', ready:true,
      host:{platform:'darwin', project_root:'/Users/lsb/AI-Brain/niannian-ai-canonical-local'},
      settings_binding:{version:2, profile:'mac-step01-hq-full-evidence-v2'},
      capability_audits:Object.fromEntries(preflight.REQUIRED.map(key => [key, {ready:true, status:'ready'}])),
      checked_at:'2026-07-18T05:00:00.000Z', expires_at:'2026-07-18T06:00:00.000Z',
      media_provider_network_requested:false, provider_upload_requested:false, provider_submit_requested:false,
      spend_requested:false, real_project_media_processed:false, real_delivery:false
    };
    await writeJson(gatePath, gate);
    await writeJson(statusPath, {schema_version:'niannian_runtime_capability_status_v1', capabilities:{'runtime:hq':{status:'missing'}}});
    const reused = await preflight.reuseFresh({gatePath, exitPath, nowMs:now, statusPath});
    assert.equal(reused.reused, true);
    const synced = JSON.parse(await fsp.readFile(statusPath, 'utf8'));
    assert.equal(synced.capabilities['runtime:hq'].status, 'ready');
    const oldTimestampPath = path.join(root, 'old-timestamp.json');
    await writeJson(oldTimestampPath, {...gate, expires_at:'2026-07-18T05:01:00.000Z'});
    assert.equal((await preflight.reuseFresh({gatePath:oldTimestampPath, exitPath:path.join(root, 'unused.json'), nowMs:now, statusPath})).reused, true);
    console.log(JSON.stringify({ok:true, verified:['fresh reuse synchronizes runtime status','old timestamps do not block a hash-bound Step01 gate','time is telemetry rather than an execution lock']}));
  } finally { await fsp.rm(root, {recursive:true, force:true}); }
})().catch(error => { console.error(error); process.exitCode = 1; });
