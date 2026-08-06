'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const launcher = fs.readFileSync(path.join(__dirname, 'bridge', 'NianNian-Mimo-Session-Bridge.command'), 'utf8');

assert.match(launcher, /with hidden answer/);
assert.match(launcher, /set mimoAccount to text returned of result/);
assert.match(launcher, /set mimoPassword to text returned of result/);
assert.doesNotMatch(launcher, /set username to/);
assert.doesNotMatch(launcher, /default answer "" hidden answer/);
assert.match(launcher, /niannian_mimo_keychain_session\.js" --login-stdin/);
assert.match(launcher, /printf '%s' "\$credentials"/);
assert.match(launcher, /bridge_output="\$\(printf '%s' "\$credentials"/);
assert.match(launcher, /mimo_local_network_failed\) message=/);
assert.match(launcher, /mimo_local_keychain_write_failed\) message=/);
assert.match(launcher, /invalid_credentials\) message=/);
assert.match(launcher, /account_not_found_or_disabled\) message=/);
assert.match(launcher, /rate_limited\) message=/);
assert.match(launcher, /provider_server_error\) message=/);
assert.match(launcher, /contract_changed\) message=/);
assert.match(launcher, /network_failed\) message=/);
assert.match(launcher, /open_official=1/);
assert.match(launcher, /open "https:\/\/ai\.mimo\.fashion"/);
assert.match(launcher, /mimo_keychain_session_bridge_http_class:/);
assert.match(launcher, /mimo_keychain_session_bridge_provider_result:/);
assert.doesNotMatch(launcher, /display dialog "\$bridge_output/);
assert.match(launcher, /没有上传、生成或扣费/);

process.stdout.write(JSON.stringify({
  ok: true,
  verified: [
    'AppleScript hidden-answer grammar is valid',
    'reserved username identifier is not used',
    'credentials stay on the local stdin path',
    'launcher maps only allowlisted provider diagnosis to local copy',
    'launcher states that generation and billing remain disabled'
  ]
}) + '\n');
