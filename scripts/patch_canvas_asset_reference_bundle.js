'use strict';

const fs = require('node:fs');
const path = require('node:path');

const bundlePath = path.resolve(__dirname, '..', 'studio', 'assets', 'NomiStudioApp-DDB0IgSO-r28-19b89ec-r6.js');
const before = 'function fr(e){const t=$t(e.kind);return t==="video"?"video":t==="image"?"image":vn(e.kind).providesImageReference?e.result?.type==="video"?"video":"image":null}';
const after = 'function fr(e){if(e?.kind==="asset"){const t=e.result?.type;return t==="video"||t==="image"?t:null}const t=$t(e.kind);return t==="video"?"video":t==="image"?"image":vn(e.kind).providesImageReference?e.result?.type==="video"?"video":"image":null}';
const source = fs.readFileSync(bundlePath, 'utf8');
if (source.includes(after)) process.exit(0);
if (!source.includes(before)) throw new Error('CANVAS_ASSET_REFERENCE_RESOLVER_NOT_FOUND');
fs.writeFileSync(bundlePath, source.replace(before, after), 'utf8');
