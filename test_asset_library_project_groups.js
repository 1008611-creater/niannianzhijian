const assert = require('node:assert/strict');
const fs = require('node:fs');

const bundlePath = 'studio/assets/AssetLibraryPanel-BHyPOGab-r4.js';
const bundle = fs.readFileSync(bundlePath, 'utf8');

assert.match(bundle, /function Xt\(currentProjectId\)/);
assert.match(bundle, /projects:u/);
assert.match(bundle, /projectFilter\?M\.filter\(a=>a\.origin\?\.projectId===projectFilter\):M/);
assert.match(bundle, /children:"分组"/);
assert.match(bundle, /children:"全部项目"/);
assert.match(bundle, /aria-label":"按画布分组"/);
assert.match(bundle, /setProjectFilter\(e\|\|""\)/);
assert.match(bundle, /Promise\.all\(remaining\.map/);
assert.match(bundle, /loading:"lazy",decoding:"async"/);
assert.match(bundle, /"data-asset-project-filter":"true"/);

console.log('asset library project grouping contract: PASS');
