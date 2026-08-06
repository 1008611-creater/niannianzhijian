'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const preflight = require('./bridge/niannian_mimo_n06_preflight');

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-mimo-preflight-'));
  const statusFile = path.join(root, 'mimo-status.json');
  try {
    const original = {schema_version:'niannian_runtime_capability_status_v1',capabilities:{
      'credential:mimo_8001_session':{status:'missing',checked_at:null,evidence:null},
      'channel:mimo_8001_nonbillable_preflight':{status:'missing',checked_at:null,evidence:null},
      'adapter:mimo_8001_real_submit':{status:'missing',checked_at:null,evidence:null}
    }};
    await fsp.writeFile(statusFile, JSON.stringify(original));
    let fetchCount = 0;
    const blocked = await preflight.runMimoN06Preflight({statusFile, env:{}, fetchImpl:async () => { fetchCount += 1; throw new Error('must_not_call'); }});
    assert.equal(blocked.network_called, false);
    assert.equal(fetchCount, 0);
    const ready = await preflight.runMimoN06Preflight({statusFile, env:{NIANNIAN_MIMO_NONBILLABLE_PREFLIGHT:'on',MIMO_TOKEN:'local-only-test-token'}, fetchImpl:async (url, init) => {
      fetchCount += 1;
      assert.equal(url.toString(), 'https://ai.mimo.fashion/api/auth/verify');
      assert.equal(init.method, 'GET');
      assert.equal(init.body, undefined);
      assert.match(init.headers.Authorization, /^Bearer /);
      return {ok:true,status:200,text:async () => JSON.stringify({code:200,data:[]})};
    }});
    assert.equal(ready.ok, true);
    assert.equal(ready.provider_submit_requested, false);
    assert.equal(ready.uploads_requested, false);
    const updated = JSON.parse(await fsp.readFile(statusFile, 'utf8'));
    assert.equal(updated.capabilities['credential:mimo_8001_session'].status, 'ready');
    assert.equal(updated.capabilities['channel:mimo_8001_nonbillable_preflight'].status, 'ready');
    assert.equal(updated.capabilities['adapter:mimo_8001_real_submit'].status, 'missing');
    assert(!JSON.stringify(updated).includes('local-only-test-token'));
    const rejected = await preflight.runMimoN06Preflight({statusFile, env:{NIANNIAN_MIMO_NONBILLABLE_PREFLIGHT:'on',MIMO_TOKEN:'local-only-test-token'}, fetchImpl:async () => ({ok:false,status:401,text:async () => JSON.stringify({code:401,msg:'raw-private-detail'})})});
    assert.equal(rejected.http_class, '4xx');
    assert.equal(rejected.provider_result, 'invalid_credentials');
    assert(!JSON.stringify(await fsp.readFile(statusFile, 'utf8')).includes('raw-private-detail'));
    process.stdout.write(JSON.stringify({ok:true,verified:['network is hard-disabled by default','nonbillable authenticated session verification only','allowlisted redacted failure classification','no task query upload or generation request','no token or raw provider response in status file','real submit adapter stays blocked']}) + '\n');
  } finally { await fsp.rm(root, {recursive:true,force:true}); }
}

main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
