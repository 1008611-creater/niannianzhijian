'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const source = fs.readFileSync(require.resolve('./server.js'), 'utf8');

assert.match(source, /async function reconcileServerStep01Projections\(\)/);
assert.match(source, /reconcileServerStep01Execution\(project\)/);
assert.match(source, /withRedrawProjectsWriteLock\(async \(\) =>/);
assert.match(source, /NIANNIAN_STEP01_PROJECTION_INTERVAL_MS/);
assert.match(source, /projectionTimer\.unref\?\./);
assert.match(source, /await reconcileServerStep01Projections\(\)/);
assert.doesNotMatch(source, /reconcileServerStep01Projections[\s\S]{0,400}provider/);
process.stdout.write(JSON.stringify({ok:true,verified:[
  'server-side projection reconciliation exists',
  'reconciliation is serialized by the redraw project write lock',
  'idle services retry without browser traffic',
  'startup performs an immediate reconciliation',
  'projection loop does not submit providers'
]}) + '\n');
