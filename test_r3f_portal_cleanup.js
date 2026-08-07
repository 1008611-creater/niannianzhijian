'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, 'studio', 'assets', 'r3f-vendor-4GhrsGNk.js'),
  'utf8',
);

assert.match(source, /V\.parentNode===k&&k\.removeChild\(V\)/);
assert.doesNotMatch(source, /\(\)=>\{k&&k\.removeChild\(V\),_e\.unmount\(\)\}/);

console.log('R3F_PORTAL_CLEANUP_CONTRACT_OK');
