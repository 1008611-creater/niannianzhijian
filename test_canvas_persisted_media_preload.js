'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const bundle = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'BaseGenerationNode-DLwEdORF-r4.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, 'studio', 'index.html'), 'utf8');
const appEntry = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'index-M-8MrEH2-r28-19b89ec-r4.js'), 'utf8');
const appShell = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'NomiStudioApp-DDB0IgSO-r28-19b89ec-r4.js'), 'utf8');
const cacheVersion = '20260816-persisted-image-r2';

assert(bundle.includes('t==="image"?(c(e),()=>{}):m?ss(m,()=>c(e)):void 0'));
assert(!bundle.includes('&&m)return t==="image"'));
assert(bundle.includes('ns="1600px"'));
assert(indexHtml.includes(`index-M-8MrEH2-r28-19b89ec-r4.js?v=${cacheVersion}`));
assert(appEntry.includes(`NomiStudioApp-DDB0IgSO-r28-19b89ec-r4.js?v=${cacheVersion}`));
assert(appShell.includes(`BaseGenerationNode-DLwEdORF-r4.js?v=${cacheVersion}`));
process.stdout.write('CANVAS_PERSISTED_IMAGE_PRELOAD_CONTRACT_OK\n');
