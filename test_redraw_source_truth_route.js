const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const step02Client = fs.readFileSync(path.join(__dirname, 'mvp-step02-r13.js'), 'utf8');
const sourceTruthClient = fs.readFileSync(path.join(__dirname, 'mvp-source-truth-r1.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

assert.match(index, /mvp-source-truth-r1\.js\?v=20260727-step01-authority-r10/);
assert.match(sourceTruthClient, /const match = location\.hash\.match\(\/\^#redraw-source-truth/);
assert.match(sourceTruthClient, /const evidence = await api\(base \+ '\/step01-evidence'\);/);
assert.match(sourceTruthClient, /const ledger = await api\(base \+ '\/step01\/shot-ledger'\);/);
assert.match(sourceTruthClient, /void load\(\);/);
assert.doesNotMatch(step02Client, /sourceTruthRoute/);
assert.doesNotMatch(step02Client, /location\.hash\.startsWith\('#redraw-source-truth\/'\)/);

console.log(JSON.stringify({
  ok: true,
  verified: [
    'source-truth document route is loaded by its dedicated client',
    'evidence and three-frame ledger APIs are read by the document client',
    'Step02 does not overwrite the source-truth route during initial load or hash changes'
  ]
}));
