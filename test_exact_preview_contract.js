'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const server = fs.readFileSync('server.js', 'utf8');
const stageBuilder = fs.readFileSync('build_canonical_release_stage.js', 'utf8');
const remote = fs.readFileSync('tools/remote_start_exact_preview.sh', 'utf8');
const deploy = fs.readFileSync('tools/deploy_exact_preview.ps1', 'utf8');
const build = fs.readFileSync('scripts/build_ci_candidate.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/quality.yml', 'utf8');

assert.match(server, /release:releaseIdentity/);
assert.match(stageBuilder, /gitTrackedFiles/);
assert.doesNotMatch(stageBuilder, /path\.resolve\(root, '\.\.', 'tools'\)/);
assert.match(remote, /\/opt\/niannian-ai-previews/);
assert.match(remote, /\/var\/lib\/niannian-ai-previews/);
assert.match(remote, /NIANNIAN_RELEASE_SHA=/);
assert.match(remote, /NIANNIAN_PREVIEW=1/);
assert.match(remote, /export PATH="\/opt\/node24\/bin:/);
assert.doesNotMatch(remote, /\/var\/lib\/niannian-ai(?:\s|$)/m);
assert.doesNotMatch(remote, /systemctl (?:restart|stop|disable --now) niannian-ai\.service/);
assert.doesNotMatch(remote, /EnvironmentFile=.*\/etc\/niannian-ai/);
assert.match(deploy, /git -C \$repoRoot diff --quiet HEAD --/);
assert.match(deploy, /verify_exact_preview\.js/);
assert.match(build, /git', \['diff', '--quiet', 'HEAD', '--'\]/);
for (const command of ['npm run test:quality-gate', 'npm run typecheck', 'npm run lint', 'npm run build']) {
  assert(workflow.includes(command), `missing technical gate command: ${command}`);
}

process.stdout.write(JSON.stringify({ok:true, verified:['isolated preview roots', 'exact SHA identity', 'no production service or environment reuse', 'four-part CI gate']}) + '\n');
