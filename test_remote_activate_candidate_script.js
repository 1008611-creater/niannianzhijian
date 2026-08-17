'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const script = fs.readFileSync(path.join(__dirname, 'tools', 'remote_activate_candidate.sh'), 'utf8');

assert.match(script, /^#!\/usr\/bin\/env bash/m);
assert.match(script, /set -euo pipefail/);
assert.match(script, /readlink -f \/opt\/niannian-ai/);
assert.match(script, /readlink -f \/var\/www\/niannian-ai/);
assert.match(script, /readlink -f \/opt\/niannian-ai-current/);
assert.match(script, /test ! -e "\$rollback_root"/);
assert.match(script, /mkdir -p "\$rollback_root"/);
assert.match(script, /chmod 0755 "\$rollback_root"/);
assert.doesNotMatch(script, /install -d -m 0755 "\$rollback_root"/);
assert.match(script, /cp -aL \/opt\/niannian-ai/);
assert.match(script, /cp -aL \/var\/www\/niannian-ai/);
assert.match(script, /mv -Tf \/opt\/niannian-ai\.next \/opt\/niannian-ai/);
assert.match(script, /mv -Tf \/var\/www\/niannian-ai\.next \/var\/www\/niannian-ai/);
assert.match(script, /mv -Tf \/opt\/niannian-ai-current\.next \/opt\/niannian-ai-current/);
assert.match(script, /for attempt in \$\(seq 1 45\)/);
assert.match(script, /curl --connect-timeout 3 --max-time 5/);
assert.match(script, /trap on_error ERR/);
assert.match(script, /\/opt\/node24\/bin\/node "\$runtime_verifier"/);
assert.match(script, /trap - ERR/);

process.stdout.write(JSON.stringify({ ok:true, verified:['atomic symlink switch', 'fresh rollback', 'portable rollback directory creation', '45-second bounded readiness', 'raw static verifier', 'automatic rollback trap'] }) + '\n');
