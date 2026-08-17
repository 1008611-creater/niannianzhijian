'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'legacy-canvas-groups-migration-r1.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, 'studio', 'index.html'), 'utf8');

assert.match(script, /tapcanvas-open-workbench-project-v1:/);
assert.match(script, /Object\.values\(groups\)/);
assert.match(script, /canvas\.selectedNodeIds = selectedNodeIds/);
assert.match(index, /legacy-canvas-groups-migration-r1\.js/);

console.log('LEGACY_CANVAS_GROUPS_MIGRATION_CONTRACT_OK');
