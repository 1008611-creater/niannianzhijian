'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, 'studio', 'assets', 'NomiStudioApp-DDB0IgSO-r28-19b89ec-r6.js'),
  'utf8',
);
const baseNodeSource = fs.readFileSync(
  path.join(__dirname, 'studio', 'assets', 'BaseGenerationNode-DLwEdORF-r6.js'),
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
assert.doesNotMatch(source, /window\.addEventListener\("nomi-canvas-mutated",q\)/);
assert.doesNotMatch(source, /N\.persistProject\(s,ir\(\)\)/);
assert.match(source, /function by\(e\).*?for\(;n&&e\.isActive\(\);\)/s);
assert.match(
  source,
  /async function fv\(e,t\).*?await Promise\.all\(l\.map\(async\(\{node:E,file:C,kind:b\}\)=>\{await hl\(E\.id,C,b,\{uploadFile:a,recoverFile:s,probeVideoDuration:o\}\)\|\|\(S\+=1\)\}\)\);G\.getState\(\)\.commitPersistedChange\(\);return\{created:l,/s,
);
assert.match(baseNodeSource, /uploadStatus:"uploaded",localOnly:!1\}\)\}\),r\(\)\}\)/);
assert.match(baseNodeSource, /P!==t&&\(i\(e,\{title:P\}\),x\(\)\)/);
assert.match(source, /platform!==\"web\"&&n===\"image\"/);
// Reference connections may start from a text-to-image target; the connection
// validator must allow an available alternate image-edit mode to take over.
assert.match(source, /some\(s=>i\.has\(s\)&&Od\[s\]\.includes\(r\)\)\|\|!!jh\(e,t,n\)/);
assert.match(source, /uploadStatus:c\?\"local-only\":\"failed\"/);
assert.match(source, /retryableImport:!c/);

console.log('WEB_CANVAS_PERSISTENCE_BINDING_CONTRACT_OK');
