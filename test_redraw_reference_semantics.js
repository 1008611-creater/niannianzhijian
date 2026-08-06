'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const activeClient = fs.readFileSync(path.join(root, 'mvp-step02-r13.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const publicSurface = [activeClient, index, fs.readFileSync(path.join(root, 'server.js'), 'utf8')].join('\n');

assert.match(activeClient, /关键资产与场景/);
assert.match(activeClient, /原片事实证据包/);
assert.match(activeClient, /data-start-step01/);
assert.doesNotMatch(publicSurface, /替换主体，复刻原视频/);
assert.doesNotMatch(publicSurface, /(?:服装图|商品图|LDXP)/i);
assert.doesNotMatch(publicSurface, /1\s*积分\s*=\s*[¥￥]?\s*0\.1(?:0)?/i);

process.stdout.write(JSON.stringify({ok:true,verified:[
  'current redraw entry remains source-evidence and project based',
  'the public redraw surface does not promise direct copying or expose retired billing labels',
  'current r13 runtime replaces the retired client for redraw contract checks'
]}) + '\n');
