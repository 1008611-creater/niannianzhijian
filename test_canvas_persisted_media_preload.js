'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const bundle = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'BaseGenerationNode-DLwEdORF-r5.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, 'studio', 'index.html'), 'utf8');
const appEntry = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'index-M-8MrEH2-r28-19b89ec-r5.js'), 'utf8');
const appShell = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'NomiStudioApp-DDB0IgSO-r28-19b89ec-r5.js'), 'utf8');
const cacheVersion = '20260816-persisted-image-r5';

assert(bundle.includes('function tn({src:e,priority:t=!1,placeholderClassName:n,className:o,onLoad:a,onError:s,...i}){return e?r.jsx(Dn,{...i,src:e,className:o,onLoad:a,onError:s}):null}'));
assert(bundle.includes('ns="1600px"'));
assert(indexHtml.includes(`index-M-8MrEH2-r28-19b89ec-r5.js?v=${cacheVersion}`));
assert(appEntry.includes(`NomiStudioApp-DDB0IgSO-r28-19b89ec-r5.js?v=${cacheVersion}`));
assert(appShell.includes(`BaseGenerationNode-DLwEdORF-r5.js?v=${cacheVersion}`));
process.stdout.write('CANVAS_PERSISTED_IMAGE_PRELOAD_CONTRACT_OK\n');
