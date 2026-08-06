'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const logo = './assets/brand/niannian-ai-authority-gold.svg';
const mvp = fs.readFileSync(path.join(root, 'mvp-step02-r13.js'), 'utf8');
const product = fs.readFileSync(path.join(root, 'product.css'), 'utf8');

assert.ok(fs.statSync(path.join(root, logo)).size > 300, 'current authoritative SVG logo asset must exist');
for (const marker of ['studio-brand-mark', 'redraw-project-brand-mark', 'workbench-workspace-mark']) {
  const index = mvp.indexOf(marker);
  assert.ok(index >= 0, `missing ${marker}`);
  assert.ok(mvp.slice(index, index + 280).includes(logo), `${marker} must use the authoritative logo`);
}
assert.ok(!mvp.includes('studio-brand-mark" aria-hidden="true">N</span>'));
assert.ok(!mvp.includes('redraw-project-brand"><span>N</span>'));
assert.ok(!mvp.includes('workbench-workspace-mark" aria-hidden="true">N</span>'));
assert.ok(product.includes('.brand-logo-image { width: 100%; height: 100%; display: block; object-fit: contain; }'));

process.stdout.write(JSON.stringify({ok:true,verified:[
  'all dynamic production/workbench brand marks use one current authoritative logo asset',
  'legacy N placeholders are absent from brand surfaces',
  'shared logo image sizing preserves the supplied mark without local raster editing'
]}) + '\n');
