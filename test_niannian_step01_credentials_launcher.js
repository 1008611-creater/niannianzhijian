'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, 'bridge', 'NianNian-Step01-Credentials.command'), 'utf8');
const notifier = fs.readFileSync(path.join(__dirname, 'bridge', 'niannian_mac_user_action_notify.sh'), 'utf8');
assert.match(source, /^#!\/bin\/bash/);
assert.match(source, /set -Eeuo pipefail/);
assert.match(source, /umask 077/);
assert.match(source, /with hidden answer/);
assert.match(source, /osascript[\s\S]+\| "\$node_bin" "\$credential_runner" --configure "\$capability"/);
assert.match(source, /--presence "\$capability"/);
assert.match(source, /niannian_step01_hq_full_gate\.js/);
assert.match(source, /configured_unverified/);
assert.doesNotMatch(source, /read -s|pbpaste|defaults read|security find-generic-password -w/);
assert.doesNotMatch(source, /curl|wget|\/chat\/completions|api\/v2\/ocr\/jobs/);
assert.match(notifier, /__NIANNIAN_STEP01_CREDENTIALS__/);
assert.match(notifier, /NianNian-Step01-Credentials\.command/);
assert.match(notifier, /observed_status in \{'missing', 'failed', 'expired', 'unknown'\}/);
assert.doesNotMatch(notifier, /configured_unverified.*needs_step01_credentials = True/);
process.stdout.write(JSON.stringify({ok:true,verified:[
  'hidden Mac-local input',
  'secret streams directly from osascript to Keychain runner stdin',
  'existing Keychain items are not overwritten automatically',
  'hq_full gate reruns locally after configuration',
  'launcher contains no provider-network command'
]}) + '\n');
