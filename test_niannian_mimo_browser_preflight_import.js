'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const importer = require('./bridge/niannian_mimo_browser_preflight_import');

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-mimo-browser-import-'));
  try {
    const receiptPath = path.join(root, 'receipt.json');
    const statusPath = path.join(root, 'status.json');
    await fsp.writeFile(statusPath, JSON.stringify({schema_version:'niannian_runtime_capability_status_v1',capabilities:{
      'credential:mimo_8001_session':{status:'missing'},'channel:mimo_8001_nonbillable_preflight':{status:'missing'},'adapter:mimo_8001_real_submit':{status:'missing'}
    }}));
    const receipt = {schema_version:'niannian_mimo_browser_preflight_receipt_v1',status:'passed',browser_page_opened:true,same_origin_request_attempted:true,same_origin_request_succeeded:true,provider_submit_requested:false,uploads_requested:false,downloads_requested:false,secrets_collected:false,summary:'Authenticated same-origin empty task-status contract returned success.',updated_at:new Date().toISOString()};
    await fsp.writeFile(receiptPath, JSON.stringify(receipt));
    const result = await importer.importBrowserPreflight({receiptPath,statusPath});
    assert.equal(result.ok, true);
    assert.equal(result.provider_submit_requested, false);
    const status = JSON.parse(await fsp.readFile(statusPath, 'utf8'));
    assert.equal(status.capabilities['credential:mimo_8001_session'].status, 'ready');
    assert.equal(status.capabilities['channel:mimo_8001_nonbillable_preflight'].status, 'ready');
    assert.equal(status.capabilities['adapter:mimo_8001_real_submit'].status, 'missing');
    receipt.provider_submit_requested = true;
    await fsp.writeFile(receiptPath, JSON.stringify(receipt));
    await assert.rejects(() => importer.importBrowserPreflight({receiptPath,statusPath}), /side_effect_contract_invalid/);
    process.stdout.write(JSON.stringify({ok:true,verified:['same-origin browser receipt import','no provider side effects accepted','session and channel only become ready','real submit adapter remains blocked']}) + '\n');
  } finally { await fsp.rm(root, {recursive:true,force:true}); }
}
main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
