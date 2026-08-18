'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const bundlePath = path.join(__dirname, 'studio', 'assets', 'NomiStudioApp-DDB0IgSO-r28-19b89ec-r6.js');
const source = fs.readFileSync(bundlePath, 'utf8');
assert.match(source, /function fr\(e\)\{if\(e\?\.kind==="asset"\)\{const t=e\.result\?\.type;return t==="video"\|\|t==="image"\?t:null\}/);
assert.match(source, /source_not_referenceable/);
assert.match(source, /unsupported_reference/);
console.log('CANVAS_ASSET_NODE_REFERENCE_CONTRACT_OK');
