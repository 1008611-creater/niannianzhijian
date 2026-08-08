'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const assetsRoot = path.join(__dirname, 'studio', 'assets');
const entry = 'index-M-8MrEH2-r26.js';
const app = 'NomiStudioApp-DDB0IgSO-r26.js';

assert.equal(fs.existsSync(path.join(assetsRoot, entry)), true);
assert.equal(fs.existsSync(path.join(assetsRoot, app)), true);
assert.equal(fs.existsSync(path.join(assetsRoot, 'index-M-8MrEH2.js')), false);
assert.equal(fs.existsSync(path.join(assetsRoot, 'NomiStudioApp-DDB0IgSO.js')), false);

const html = fs.readFileSync(path.join(__dirname, 'studio', 'index.html'), 'utf8');
assert.match(html, new RegExp('./assets/' + entry.replace(/[.]/g, '\\.')));
assert.doesNotMatch(html, /index-M-8MrEH2\.js(?:\?|['"])/);

for (const name of fs.readdirSync(assetsRoot)) {
  if (!name.endsWith('.js')) continue;
  const source = fs.readFileSync(path.join(assetsRoot, name), 'utf8');
  assert.doesNotMatch(source, /index-M-8MrEH2\.js/);
  assert.doesNotMatch(source, /NomiStudioApp-DDB0IgSO\.js/);
}

const appSource = fs.readFileSync(path.join(assetsRoot, app), 'utf8');
assert.match(appSource, new RegExp('./' + entry.replace(/[.]/g, '\\.')));
assert.doesNotMatch(appSource, new RegExp(entry.replace(/[.]/g, '\\.') + '\\?'));

console.log('STUDIO_ROOT_MODULE_IDENTITY_CONTRACT_OK');
