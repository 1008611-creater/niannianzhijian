'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const bridge = require('./bridge/niannian_mimo_keychain_session');

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-mimo-keychain-'));
  try {
    const statusFile = path.join(root, 'status.json');
    const receiptPath = path.join(root, 'receipt.json');
    await fsp.writeFile(statusFile, JSON.stringify({schema_version:'niannian_runtime_capability_status_v1',capabilities:{
      'credential:mimo_8001_session':{status:'missing'},'channel:mimo_8001_nonbillable_preflight':{status:'missing'},'adapter:mimo_8001_real_submit':{status:'missing'}
    }}));
    const commands = [];
    const events = [];
    const result = await bridge.establishSession({homeDir:root,statusFile,receiptPath,username:'local-user',password:'local-password',fetchImpl:async (url, init) => {
      assert.equal(url.origin, 'https://ai.mimo.fashion');
      events.push(url.pathname);
      if (url.pathname === '/api/auth/login') return {ok:true,status:200,text:async () => JSON.stringify({code:200,data:{token:'local-test-token'}})};
      assert.equal(url.pathname, '/api/auth/verify');
      assert.equal(init.method, 'GET');
      assert.equal(init.body, undefined);
      return {ok:true,status:200,text:async () => JSON.stringify({code:200,data:[]})};
    },execFileImpl:(command,args,opts,done) => { events.push('keychain'); commands.push({command,args}); done(null,'',''); }});
    assert.equal(result.ok, true);
    assert.equal(result.provider_submit_requested, false);
    assert.equal(commands.length, 1);
    assert.equal(commands[0].command, '/usr/bin/security');
    assert.deepEqual(events, ['/api/auth/login', '/api/auth/verify', 'keychain']);
    const status = JSON.parse(await fsp.readFile(statusFile, 'utf8'));
    assert.equal(status.capabilities['credential:mimo_8001_session'].status, 'ready');
    assert.equal(status.capabilities['channel:mimo_8001_nonbillable_preflight'].status, 'ready');
    assert.equal(status.capabilities['adapter:mimo_8001_real_submit'].status, 'missing');
    const receipt = JSON.parse(await fsp.readFile(receiptPath, 'utf8'));
    assert.equal(receipt.secrets_collected, false);
    assert(!JSON.stringify(receipt).includes('local-test-token'));
    await bridge.recordFailure({homeDir:root,statusFile,receiptPath}, new Error('mimo_local_login_failed'));
    const failureReceipt = JSON.parse(await fsp.readFile(receiptPath, 'utf8'));
    assert.equal(failureReceipt.status, 'failed');
    assert.equal(failureReceipt.failure_code, 'mimo_local_login_failed');
    assert.equal(failureReceipt.http_class, 'other');
    assert.equal(failureReceipt.provider_result, 'contract_changed');
    assert.equal(failureReceipt.secrets_collected, false);
    assert(!JSON.stringify(failureReceipt).includes('local-test-token'));
    const failedStatus = JSON.parse(await fsp.readFile(statusFile, 'utf8'));
    assert.equal(failedStatus.capabilities['credential:mimo_8001_session'].status, 'failed');
    assert.equal(failedStatus.capabilities['channel:mimo_8001_nonbillable_preflight'].status, 'failed');

    const failureCases = [
      {status:401, body:{code:401,msg:'账号或密码错误 raw-private-detail'}, expected:'invalid_credentials', http:'4xx'},
      {status:403, body:{code:403,msg:'账号已停用 raw-private-detail'}, expected:'account_not_found_or_disabled', http:'4xx'},
      {status:429, body:{code:429,msg:'too many requests raw-private-detail'}, expected:'rate_limited', http:'4xx'},
      {status:503, body:{code:503,msg:'upstream unavailable raw-private-detail'}, expected:'provider_server_error', http:'5xx'},
      {status:200, body:{code:0,msg:'unexpected contract raw-private-detail'}, expected:'contract_changed', http:'2xx'}
    ];
    for (const item of failureCases) {
      let caught;
      try {
        await bridge.login('https://ai.mimo.fashion', 'ephemeral-user', 'ephemeral-password', async () => ({ok:item.status >= 200 && item.status < 300,status:item.status,text:async () => JSON.stringify(item.body)}));
      } catch (error) { caught = error; }
      assert(caught);
      const recorded = await bridge.recordFailure({homeDir:root,statusFile,receiptPath}, caught);
      assert.equal(recorded.http_class, item.http);
      assert.equal(recorded.provider_result, item.expected);
      const redacted = await fsp.readFile(receiptPath, 'utf8');
      assert(!redacted.includes('raw-private-detail'));
      assert(!redacted.includes('ephemeral-user'));
      assert(!redacted.includes('ephemeral-password'));
    }
    let networkError;
    try { await bridge.login('https://ai.mimo.fashion', 'ephemeral-user', 'ephemeral-password', async () => { throw new Error('raw network detail'); }); }
    catch (error) { networkError = error; }
    const networkFailure = await bridge.recordFailure({homeDir:root,statusFile,receiptPath}, networkError);
    assert.equal(networkFailure.http_class, 'no_response');
    assert.equal(networkFailure.provider_result, 'network_failed');
    assert(!await fsp.readFile(receiptPath, 'utf8').then(value => value.includes('raw network detail')));
    process.stdout.write(JSON.stringify({ok:true,verified:['local login then GET verify then Keychain only','HTTP class plus allowlisted provider diagnosis','redacted success and failure receipts','no raw response credentials or token in receipt','all six safe provider failure classes','real submit remains blocked']}) + '\n');
  } finally { await fsp.rm(root, {recursive:true,force:true}); }
}
main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
