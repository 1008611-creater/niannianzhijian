'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const activeClient = fs.readFileSync(require.resolve('./mvp-step02-r13.js'), 'utf8');
const server = fs.readFileSync(require.resolve('./server.js'), 'utf8');
const css = fs.readFileSync(require.resolve('./product.css'), 'utf8');
const redrawBody = activeClient.indexOf('function renderRedrawStageBody');
const start = activeClient.indexOf("if (stageId === '01')", redrawBody);
const end = activeClient.indexOf("if (stageId === '02')", start);
assert(start > 0 && end > start, 'current_step01_render_block_missing');
const stage01 = activeClient.slice(start, end);

for (const status of ['infra_failed','blocked_contract','blocked_quality','blocked_authorization']) {
  assert(stage01.includes(status), `missing UI recovery status ${status}`);
  assert(server.includes(status), `missing server recovery status ${status}`);
}
assert.match(stage01, /data-start-step01/);
assert.match(stage01, /原片事实证据包/);
assert.match(activeClient, /function step01ProgressDetails\(project\)/);
assert.match(activeClient, /function refreshActiveRedrawProject\(\{projectId = state\.redrawStudioProjectId, force = false\} = \{\}\)/);
assert.match(activeClient, /hydrateRedrawSourceFacts/);
assert.match(server, /analysis_scope:'source_evidence_only'/);
assert.match(css, /grid-template-areas: 'preview settings'/);
assert.match(css, /grid-template-areas: 'settings' 'preview'/);

process.stdout.write(JSON.stringify({ok:true,verified:[
  'current r13 Step01 retains recovery states and the source-evidence-only boundary',
  'project refresh and source facts hydration remain owned by the active runtime',
  'desktop and narrow layout contracts for the current Step01 surface remain declared'
]}) + '\n');
