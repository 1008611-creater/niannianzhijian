'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, 'studio', 'assets', 'BaseGenerationNode-DLwEdORF-r5.js'), 'utf8');

assert.match(source, /e==="shot-frame"&&\(t\.result\?\.type==="image"&&t\.result\?\.url\?r\.jsx\("img"/);
assert.match(source, /generation-canvas-v2-node__media-loading/);

console.log('CANVAS_SHOT_FRAME_PREVIEW_CONTRACT_OK');
