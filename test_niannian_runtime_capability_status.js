'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const status = require('./bridge/niannian_runtime_capability_status');

const now = Date.now();
const readyCredential = {
  status:'ready',
  checked_at:new Date(now - 60 * 1000).toISOString(),
  expires_at:new Date(now + 60 * 60 * 1000).toISOString(),
  evidence:{method:'credential_health_probe',summary:'Authenticated health endpoint returned a redacted success response.'}
};

assert.equal(status.inspectCapability('credential:mimo_asr', readyCredential, 1440, now).ready, true);
assert.equal(status.inspectCapability('credential:mimo_asr', {...readyCredential, evidence:null}, 1440, now).reason, 'evidence_invalid');
assert.equal(status.inspectCapability('credential:mimo_asr', {...readyCredential, expires_at:new Date(now - 1).toISOString()}, 1440, now).reason, null);
const stalePersistent = status.inspectCapability('credential:mimo_asr', {...readyCredential, checked_at:new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), expires_at:new Date(now - 1).toISOString()}, 1440, now);
assert.equal(stalePersistent.reason, 'health_proof_refresh_required');
assert.equal(stalePersistent.refresh_required, true);
assert.equal(stalePersistent.persistent_credential, true);
assert.equal(status.inspectCapability('credential:mimo_asr', {
  status:'configured_unverified', checked_at:new Date(now).toISOString(),
  evidence:{method:'mac_keychain_presence_only',summary:'Keychain item exists; provider health is not verified.'}
}, 1440, now).reason, 'status_configured_unverified');
assert.equal(status.inspectCapability('runtime:transnetv2', {
  status:'ready', checked_at:new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
  evidence:{method:'runtime_self_test',summary:'Local test passed.'}
}, 1440, now).reason, 'checked_at_stale');
assert.equal(status.safeEvidence({method:'runtime_self_test',summary:'access_token=not-allowed'}), null);
assert.equal(status.inspectCapability('runtime:hq', null, 1440, now).reason, 'status_missing');

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-runtime-capability-'));
  try {
    const profileRoot = path.join(root, 'source');
    const homeDir = path.join(root, 'home');
    await fsp.mkdir(path.join(profileRoot, 'bridge'), {recursive:true});
    await fsp.writeFile(path.join(profileRoot, 'bridge', 'runtime_profiles.json'), JSON.stringify({profiles:{strict:{
      required_capabilities:['runtime:hq'], capability_max_age_minutes:1440,
      capability_status_path:'~/.config/ai-brain/runtime_capability_status.json'
    }}}));
    await fsp.mkdir(path.join(homeDir, '.config', 'ai-brain'), {recursive:true});
    await fsp.writeFile(path.join(homeDir, '.config', 'ai-brain', 'runtime_capability_status.json'), JSON.stringify({
      schema_version:'niannian_runtime_capability_status_v1', capabilities:{
        'runtime:hq':{status:'ready',checked_at:new Date().toISOString(),evidence:{method:'runtime_self_test',summary:'HQ self-test passed.'}}
      }
    }));
    const audit = await status.auditRuntimeCapabilities({sourceRoot:profileRoot,homeDir,profileName:'strict'});
    assert.equal(audit.ready, true);
    assert.equal(audit.capabilities['runtime:hq'].evidence.summary, 'HQ self-test passed.');
  } finally {
    await fsp.rm(root, {recursive:true,force:true});
  }
  process.stdout.write(JSON.stringify({ok:true,verified:[
    'ready capability needs fresh safe evidence',
    'persistent analysis credential ignores proof expiry and requests a synthetic health refresh when stale',
    'configured-only credential is not promoted to ready',
    'stale runtime capability is rejected',
    'credential-like evidence is rejected',
    'missing capability is typed',
    'status audit returns only redacted evidence'
  ]}) + '\n');
}

main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
