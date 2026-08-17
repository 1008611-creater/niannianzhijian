'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'legacy-canvas-groups-migration-r1.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, 'studio', 'index.html'), 'utf8');

assert.match(script, /tapcanvas-open-workbench-project-v1:/);
assert.match(script, /Object\.values\(groups\)/);
assert.match(script, /canvas\.selectedNodeIds = selectedNodeIds/);
assert.match(script, /fetch\('\/api\/projects\/' \+ encodeURIComponent\(projectId\) \+ '\/canvas'/);
assert.match(script, /remote\?\.canvas\?\.document\?\.generationCanvas/);
assert.match(script, /hashQuery/);
assert.match(script, /localCanvas\.nodes\.length === 0/);
assert.match(script, /remoteCanvas\.nodes\.length === 0/);
assert.match(script, /remoteNode\?\.status !== 'success'/);
assert.match(script, /localNode\.result = remoteNode\.result/);
assert.match(script, /migrate\(\)\.finally\(startStudio\)/);
assert.match(index, /legacy-canvas-groups-migration-r1\.js/);
assert.doesNotMatch(index, /<script type="module" crossorigin src="\.\/assets\/index-M-8MrEH2-r28-19b89ec-r6\.js/);

console.log('LEGACY_CANVAS_GROUPS_MIGRATION_CONTRACT_OK');
