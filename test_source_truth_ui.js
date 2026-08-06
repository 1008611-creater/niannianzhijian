const assert = require('node:assert/strict');
const fs = require('node:fs');

const shell = fs.readFileSync(require.resolve('./index.html'), 'utf8');
const core = fs.readFileSync(require.resolve('./mvp-step02-r13.js'), 'utf8');
const worker = fs.readFileSync(require.resolve('./sw.js'), 'utf8');

assert.doesNotMatch(shell, /mvp-source-truth-r1\.js/);
assert.doesNotMatch(worker, /mvp-source-truth-r1\.js/);
assert.match(shell, /mvp-step02-r13\.js\?v=20260727-step01-authority-r9/);
assert.match(worker, /mvp-step02-r13\.js\?v=20260727-step01-authority-r9/);
assert.match(core, /function renderExactStep01ReviewStudio\(project\)/);
assert.match(core, /if \(selected === '01' && project\) return renderExactStep01ReviewStudio\(project\);/);
assert.match(core, /location\.hash = 'redraw\/' \+ encodeURIComponent\(project\.id\) \+ '\/stage\/01';/);

process.stdout.write(JSON.stringify({
  ok:true,
  route:'redraw/:projectId/stage/01',
  verified:'approved source-review workspace is the only loaded Step01 UI',
  cache_version:'20260727-step01-authority-r9'
}) + '\n');
