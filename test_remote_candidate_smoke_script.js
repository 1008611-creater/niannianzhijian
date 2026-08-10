'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const script = fs.readFileSync(path.join(__dirname, 'tools', 'remote_candidate_smoke.sh'), 'utf8');

assert.match(script, /^#!\/usr\/bin\/env bash/m);
assert.match(script, /set -euo pipefail/);
assert.match(script, /mktemp -d \/tmp\/niannian-candidate-data/);
assert.match(script, /NIANNIAN_STEP01_AUTO_EXECUTE=off/);
assert.match(script, /\/opt\/node24\/bin\/node/);
assert.match(script, /candidate_pid/);
assert.match(script, /trap cleanup EXIT/);
assert.match(script, /http:\/\/127\.0\.0\.1:\$\{port\}/);
assert.match(script, /"\$verifier_path" "\$stage_root" "\$origin"/);
assert.match(script, /api\/health/);
assert.match(script, /value\?\.ok!==true/);
assert.match(script, /for attempt in 1 2 3 4 5 6 7 8/);

process.stdout.write(JSON.stringify({ ok:true, verified:['parameterized isolated port', 'temporary data root', 'bounded readiness attempts', 'candidate process cleanup'] }) + '\n');
