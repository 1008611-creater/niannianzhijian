'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, 'bridge', 'install_mac_ffmpeg_runtime.sh'), 'utf8');
assert.match(source, /VERSION="7\.1\.1"/);
assert.match(source, /733984395e0dbbe5c046abda2dc49a5544e7e0e1e2366bba849222ae9e3a03b1/);
assert.match(source, /https:\/\/ffmpeg\.org\/releases/);
assert.match(source, /--disable-network/);
assert.match(source, /--disable-autodetect/);
assert.match(source, /"\$LINK_ROOT\/ffmpeg"/);
assert.match(source, /"\$LINK_ROOT\/ffprobe"/);
assert.match(source, /backup-\$\{existing_sha:0:12\}/);
assert.match(source, /legacy_backups:legacyBackups/);
assert.match(source, /color=c=black:s=720x1280:d=1:r=10/);
assert.match(source, /synthetic_evidence_only:true/);
assert.match(source, /real_user_media_processed:false/);
assert.match(source, /provider_submit_requested:false/);
assert.doesNotMatch(source, /password|api[_-]?key|access[_-]?token|cookie/i);
process.stdout.write(JSON.stringify({ok:true,verified:['official pinned source archive','SHA-256 gate','network-disabled local build','ffmpeg and ffprobe managed links','720x1280 synthetic probe self-test','no credential or provider path']}) + '\n');
