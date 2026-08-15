'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const bundle = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'BaseGenerationNode-DLwEdORF-r4.js'), 'utf8');

assert(bundle.includes('t==="image"?(c(e),()=>{}):ss(m,()=>c(e))'));
assert(bundle.includes('ns="1600px"'));
process.stdout.write('CANVAS_PERSISTED_IMAGE_PRELOAD_CONTRACT_OK\n');
