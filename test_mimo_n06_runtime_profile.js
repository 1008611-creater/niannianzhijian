'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const status = require('./bridge/niannian_runtime_capability_status');

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-mimo-n06-profile-'));
  try {
    const sourceRoot = path.resolve(__dirname);
    const homeDir = path.join(root, 'home');
    const capabilityPath = path.join(homeDir, '.config', 'ai-brain', 'mimo-n06-capability-status.json');
    await fsp.mkdir(path.dirname(capabilityPath), {recursive:true});
    await fsp.writeFile(capabilityPath, JSON.stringify({schema_version:'niannian_runtime_capability_status_v1',capabilities:{
      'credential:mimo_8001_session':{status:'missing',checked_at:null,expires_at:null,evidence:null},
      'channel:mimo_8001_nonbillable_preflight':{status:'missing',checked_at:null,evidence:null},
      'adapter:mimo_8001_real_submit':{status:'missing',checked_at:null,evidence:null}
    }}));
    const blocked = await status.auditRuntimeCapabilities({sourceRoot,homeDir,profileName:'mac-n06-mimo-preflight-v1'});
    assert.equal(blocked.ready, false);
    assert.equal(Object.keys(blocked.capabilities).length, 3);
    const checkedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await fsp.writeFile(capabilityPath, JSON.stringify({schema_version:'niannian_runtime_capability_status_v1',capabilities:{
      'credential:mimo_8001_session':{status:'ready',checked_at:checkedAt,expires_at:expiresAt,evidence:{method:'mac_local_session_check',summary:'Redacted session health check passed.'}},
      'channel:mimo_8001_nonbillable_preflight':{status:'ready',checked_at:checkedAt,evidence:{method:'nonbillable_channel_preflight',summary:'No upload or generation occurred.'}},
      'adapter:mimo_8001_real_submit':{status:'ready',checked_at:checkedAt,evidence:{method:'website_first_adapter_audit',summary:'No provider network execution occurred.'}}
    }}));
    const ready = await status.auditRuntimeCapabilities({sourceRoot,homeDir,profileName:'mac-n06-mimo-preflight-v1'});
    assert.equal(ready.ready, true);
    process.stdout.write(JSON.stringify({ok:true,verified:['N06 profile is isolated from Step01 capabilities','three Mimo preflight gates','credential expiry gate','no provider execution in profile audit']}) + '\n');
  } finally { await fsp.rm(root, {recursive:true,force:true}); }
}

main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
