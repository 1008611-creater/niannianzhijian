'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, 'studio', 'assets');
const currentName = fs.readdirSync(assetsDir).find((name) =>
  /^r3f-vendor-4GhrsGNk-r25(?:-[^/]+)?\.js$/.test(name),
);

assert.ok(currentName, 'current R3F vendor asset must exist');
const source = fs.readFileSync(path.join(assetsDir, currentName), 'utf8');

assert.match(source, /V\.parentNode===k&&k\.removeChild\(V\)/);
assert.doesNotMatch(source, /\(\)=>\{k&&k\.removeChild\(V\),_e\.unmount\(\)\}/);
assert.equal(fs.existsSync(path.join(assetsDir, 'r3f-vendor-4GhrsGNk.js')), false);
for (const name of fs.readdirSync(assetsDir)) {
  if (!name.endsWith('.js') || name === currentName) continue;
  const content = fs.readFileSync(path.join(__dirname, 'studio', 'assets', name), 'utf8');
  assert.doesNotMatch(content, /r3f-vendor-4GhrsGNk\.js/);
}

console.log('R3F_PORTAL_CLEANUP_CONTRACT_OK');
