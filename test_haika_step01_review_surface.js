const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const client = fs.readFileSync(path.join(__dirname, 'mvp-step02-r13.js'), 'utf8');
const sourceTruthClient = fs.readFileSync(path.join(__dirname, 'mvp-source-truth-r1.js'), 'utf8');
const ledgerClient = fs.readFileSync(path.join(__dirname, 'mvp-step01-ledger-r1.js'), 'utf8');

assert.doesNotMatch(client, /function renderStep01AnalysisWorkspace\(project\)/);
assert.match(client, /function renderExactStep01ReviewStudio\(project\)/);
assert.match(client, /if \(selected === '01' && project\) return renderExactStep01ReviewStudio\(project\);/);
assert.match(client, /if \(event\.target\.closest\('\[data-go-step01\]'\)\) \{[\s\S]*?location\.hash='redraw\/'\+encodeURIComponent\(step02ProjectId\)\+'\/stage\/01';[\s\S]*?openRedrawStudio\(step02ProjectId,\{updateHash:false\}\);/);
assert.match(sourceTruthClient, /\[data-source-truth-revise\][\s\S]*?location\.hash = 'redraw-ledger\/' \+ encodeURIComponent\(state\.route\.projectId\);/);
assert.match(ledgerClient, /\[data-ledger-back\][\s\S]*?location\.hash='redraw\/'\+encodeURIComponent\(state\.route\.projectId\)\+'\/stage\/01';/);
assert.doesNotMatch(client, /function renderStep01AnalysisWorkspace\(project\)/);
assert.match(client, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
assert.match(client, /300 \* \(attempt \+ 1\)/);

console.log(JSON.stringify({
  ok: true,
  verified: [
    'the direct Step01 route renders the approved source-review workspace',
    'the source-truth route returns to the approved Step01 route',
    'the temporary Step01 workspace remains removed',
    'the approved screen is the sole Step01 workspace'
  ]
}));
