'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const index = fs.readFileSync(path.join(__dirname, 'studio', 'index.html'), 'utf8');

assert.equal(index.includes('s1-chain-ui.js'), false, 'Studio must not load the legacy S1 overlay');
console.log(JSON.stringify({ok:true, verified:['Studio excludes the legacy S1 overlay entrypoint']}));
