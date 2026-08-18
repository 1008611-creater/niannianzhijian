const assert = require('node:assert/strict');
const fs = require('node:fs');

const bundlePath = 'studio/assets/AssetLibraryPanel-BHyPOGab-r4.js';
const bundle = fs.readFileSync(bundlePath, 'utf8');

assert.match(bundle, /function Xt\(currentProjectId\)/);
assert.match(bundle, /projects:u/);
assert.match(bundle, /d\.assets\.listAll\?await d\.assets\.listAll\(\{projectId:currentProjectId\}\):null/);
assert.match(bundle, /projectFilter\?M\.filter\(a=>a\.origin\?\.projectId===projectFilter\):M/);
assert.match(bundle, /children:"分组"/);
assert.match(bundle, /children:"全部项目"/);
assert.match(bundle, /aria-label":"按画布分组"/);
assert.match(bundle, /setProjectFilter\(e\|\|""\)/);
assert.match(bundle, /Promise\.all\(remaining\.map/);
assert.match(bundle, /loading:"lazy",decoding:"async"/);
assert.match(bundle, /"data-asset-project-filter":"true"/);
assert.match(bundle, /asset-library-project-filter-trigger/);
assert.match(bundle, /asset-library-project-filter-menu/);
assert.match(bundle, /assetId:String\(e\.id\|\|""\)\.trim\(\)\|\|void 0/);
assert.match(bundle, /thumbUrl:n\|\|void 0/);
assert.match(bundle, /thumbnailUrl=="string"/);
assert.match(bundle, /se=c\.useMemo\(\(\)=>Re\(M\.filter\(a=>a\.origin\?\.projectId===e\)\),\[M,e\]\)/);
assert.match(bundle, /CrossProjectReuse=c\.useCallback/);
assert.match(bundle, /引用到当前项目/);
assert.doesNotMatch(bundle, /onDragStartAsset:B\?Ae:Se/);

const adapter = fs.readFileSync('studio/assets/web-runtime-adapter-r4.js', 'utf8');
assert.match(adapter, /async function referenceProjectAsset/);
assert.match(adapter, /\/assets\/references/);
assert.match(adapter, /async function listAllProjectAssets/);
assert.match(adapter, /\/assets\/catalog/);
assert.match(adapter, /assets: \{importFile: importProjectAsset, list: listProjectAssets, listAll: listAllProjectAssets, reference: referenceProjectAsset/);

console.log('asset library project grouping contract: PASS');
