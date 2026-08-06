'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.join(__dirname, 'tools', 'remote_activate_step01_release.sh'), 'utf8');
assert(script.includes('set -euo pipefail'));
assert(script.includes('verify-assets'));
assert(script.includes('importer\" apply'));
assert(script.includes('projects.json.before'));
assert(script.includes('projects_uid="$(stat -c %u "$projects_path")"'));
assert(script.includes('test "$(stat -c %a "$projects_path")" = "$projects_mode"'));
assert(script.includes('mv -Tf /opt/niannian-ai.next /opt/niannian-ai'));
assert(script.includes('mv -Tf /var/www/niannian-ai.next /var/www/niannian-ai'));
assert(script.includes('cp "$project_backup" "$projects_path.rollback-tmp"'));
assert(script.includes('if [[ "$source_created" = 1 ]]'));
assert(script.includes('if [[ "$evidence_created" = 1 ]]'));
assert(script.includes('systemctl restart niannian-ai.service'));
assert(script.includes('curl --connect-timeout 3 --max-time 5'));
assert(script.includes('for attempt in $(seq 1 45)'));
for (const forbidden of ['cloudflared','nginx','kidswear','wecom','Step02','Step04','Step05']) assert(!script.includes(forbidden));
process.stdout.write(JSON.stringify({ok:true,verified:['pre-activation asset verification','production project backup','data rollback','two-link rollback','bounded readiness','scope excludes unrelated services']}) + '\n');
