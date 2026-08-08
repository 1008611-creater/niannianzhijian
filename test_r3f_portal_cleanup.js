'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, 'studio', 'assets', 'r3f-vendor-4GhrsGNk-r25.js'),
  'utf8',
);

assert.match(source, /V\.parentNode===k&&k\.removeChild\(V\)/);
assert.doesNotMatch(source, /\(\)=>\{k&&k\.removeChild\(V\),_e\.unmount\(\)\}/);
assert.equal(fs.existsSync(path.join(__dirname, 'studio', 'assets', 'r3f-vendor-4GhrsGNk.js')), false);
for (const name of fs.readdirSync(path.join(__dirname, 'studio', 'assets'))) {
  if (!name.endsWith('.js') || name === 'r3f-vendor-4GhrsGNk-r25.js') continue;
  const content = fs.readFileSync(path.join(__dirname, 'studio', 'assets', name), 'utf8');
  assert.doesNotMatch(content, /r3f-vendor-4GhrsGNk\.js/);
}

console.log('R3F_PORTAL_CLEANUP_CONTRACT_OK');
