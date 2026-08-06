'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {runBridge} = require('./bridge/niannian_mac_user_action_bridge');

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-mac-user-action-'));
  const requestsPath = path.join(root, 'requests.json');
  const receiptPath = path.join(root, 'receipt.json');
  const statePath = path.join(root, 'state.json');
  const actionCardPath = path.join(root, 'action.html');
  const markerPath = path.join(root, 'notified.txt');
  const notifierPath = path.join(root, 'notifier.sh');
  try {
    await fsp.writeFile(receiptPath, JSON.stringify({schema_version:'niannian_mac_gui_bridge_receipt_v1', bridge_ready:true, prompt_seen_confirmed_by_user:true, secrets_collected:false, system_wide_remote_control:false}), 'utf8');
    await fsp.writeFile(requestsPath, JSON.stringify({schema_version:'niannian_user_action_request_v1', execution_surface:'codex_cli', requests:[{action_id:'uar-1', capability:'runtime:transnetv2', classification:'contract_gap', official_url:'http://nas.mimo.fashion:8001', purpose:'Runtime adapter is not defined.', observed_status:'missing', observed_reason:'status_missing', retry_action:'Configure the verified runtime.'}]}), 'utf8');
    await fsp.writeFile(notifierPath, '#!/bin/bash\nprintf notified > "$TEST_MARKER"\n', {mode:0o700});
    process.env.TEST_MARKER = markerPath;
    process.env.NIANNIAN_MAC_ACTION_SHELL = 'C:\\Program Files\\Git\\bin\\bash.exe';
    const options = {requestsPath, receiptPath, statePath, actionCardPath, notifierPath};
    const notified = await runBridge(options);
    assert.equal(notified.notified, true);
    assert.equal(await fsp.readFile(markerPath, 'utf8'), 'notified');
    const unchanged = await runBridge(options);
    assert.equal(unchanged.notified, false);
    assert.match(await fsp.readFile(actionCardPath, 'utf8'), /runtime:transnetv2/);
    const actionCard = await fsp.readFile(actionCardPath, 'utf8');
    assert.match(actionCard, /http:\/\/nas\.mimo\.fashion:8001/);
    assert.match(actionCard, /Open official local page/);
    await fsp.writeFile(receiptPath, JSON.stringify({schema_version:'niannian_mac_gui_bridge_receipt_v1', bridge_ready:true, prompt_seen_confirmed_by_user:true, secrets_collected:true, system_wide_remote_control:false}), 'utf8');
    await assert.rejects(() => runBridge(options), /receipt_not_ready/);
    process.stdout.write(JSON.stringify({ok:true, verified:['GUI receipt gate','one-time visible request','unchanged request suppression','local action card','no-secret receipt contract']}) + '\n');
  } finally {
    delete process.env.NIANNIAN_MAC_ACTION_SHELL;
    delete process.env.TEST_MARKER;
    await fsp.rm(root, {recursive:true, force:true});
  }
}

main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
