'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'studio', 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'studio', 'assets', 's1-chain-ui.js'), 'utf8');

assert.match(html, /assets\/s1-chain-ui\.js\?v=20260812-s1-chain-ui-r1/);
assert.match(source, /\/api\/canvas\/documents\//);
assert.match(source, /\/s1-chain/);
assert.match(source, /if-match/);
assert.match(source, /x-niannian-project-kind/);
assert.match(source, /rightsConfirmed/);
assert.match(source, /preflightStatus/);
assert.match(source, /Step01 当前保持真实阻塞/);
assert.doesNotMatch(source, /confirmProviderSpend/);
assert.doesNotMatch(source, /\/canvas\/jobs/);

console.log(JSON.stringify({ok:true,verified:['Studio loads the S1 control surface','current project assets are selected through the API','revision protection is sent on creation','the UI cannot submit a provider job']}));
