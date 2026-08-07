'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, 'studio', 'assets', 'NomiStudioApp-DDB0IgSO.js'),
  'utf8',
);

// Initial NN-web hydration may render before the active-project ref is set. The
// persistence effect must claim that rendered project instead of returning
// without ever subscribing to canvas persistRevision changes.
assert.match(
  source,
  /if\(h\)return;P\.current!==s\.id&&\(P\.current=s\.id\);const K=N\.bindProjectPersistence/,
);
assert.doesNotMatch(source, /if\(h\|\|P\.current!==s\.id\)return;const K=N\.bindProjectPersistence/);
assert.match(source, /window\.dispatchEvent\(new Event\("nomi-canvas-mutated"\)\)/);
assert.match(source, /window\.addEventListener\("nomi-canvas-mutated",q\)/);
assert.match(source, /N\.persistProject\(s,ir\(\)\)/);

console.log('WEB_CANVAS_PERSISTENCE_BINDING_CONTRACT_OK');
