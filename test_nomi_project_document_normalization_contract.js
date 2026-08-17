'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

assert.match(source, /if \(!Array\.isArray\(canvas\.groups\)\) canvas\.groups = \[\];/);
assert.match(source, /if \(canvas\.selectedNodeIds !== undefined && !Array\.isArray\(canvas\.selectedNodeIds\)\) canvas\.selectedNodeIds = \[\];/);

console.log('NOMI_PROJECT_DOCUMENT_NORMALIZATION_CONTRACT_OK');
