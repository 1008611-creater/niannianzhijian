'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const index = fs.readFileSync(path.join(__dirname, 'studio', 'index.html'), 'utf8');

assert.match(index, /assets\/s1-chain-ui\.js\?v=20260816-canvas-skill-nodes-r1/);
assert.equal(index.includes('owned-canvas-director-import'), false, 'Studio must not load the retired canvas importer');
assert.equal(index.includes('electron'), false, 'Studio must not load the retired Electron canvas path');
console.log(JSON.stringify({ok:true, verified:['Studio loads the current canvas Skill-node adapter','retired canvas import paths remain excluded']}));
