'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const assetPath = 'assets/brand/niannian-ai-mark-transparent.svg';
const svg = fs.readFileSync(path.join(root, assetPath), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(svg, /<svg[^>]+viewBox="0 0 96 96"/);
assert.match(svg, /stroke="#fff"/);
assert.match(svg, /stroke="#ff2f7d"/);
assert.doesNotMatch(svg, /<(?:rect|image)\b/i, 'transparent mark cannot contain a background or embedded bitmap');
assert.doesNotMatch(svg, /(?:background|fill)="(?:#000|black)"/i, 'transparent mark cannot contain a black background');
assert.match(index, /rel="icon" href="\.\/assets\/brand\/niannian-ai-mark-transparent\.svg" type="image\/svg\+xml"/);
assert.equal((index.match(/src="\.\/assets\/brand\/niannian-ai-mark-transparent\.svg"/g) || []).length, 1);
assert.doesNotMatch(index, /class="brand(?:-monogram)?"/, 'top-left navigation logo must remain removed');

console.log(JSON.stringify({
  ok: true,
  asset: assetPath,
  verified: ['vector-only mark', 'transparent background', 'header and hero bindings', 'SVG favicon']
}));
