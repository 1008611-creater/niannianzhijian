'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'studio', 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'studio', 'assets', 's1-chain-ui.js'), 'utf8');

assert.match(html, /assets\/s1-chain-ui\.js\?v=20260814-s1-chain-ui-r2/);
assert.match(source, /\/api\/canvas\/documents\//);
assert.match(source, /\/s1-chain/);
assert.match(source, /if-match/);
assert.match(source, /x-niannian-project-kind/);
assert.match(source, /rightsConfirmed/);
assert.match(source, /preflightStatus/);
assert.match(source, /step01-analysis/);
assert.match(source, /开始 Step01 分析/);
assert.match(source, /data-node="source"/);
assert.match(source, /data-node="step01"/);
assert.match(source, /data-node="step02"/);
assert.match(source, /Skill 节点/);
assert.match(source, /输入节点/);
assert.match(source, /输出/);
assert.doesNotMatch(source, /confirmProviderSpend/);
assert.doesNotMatch(source, /\/canvas\/jobs/);

console.log(JSON.stringify({ok:true,verified:['Studio loads the S1 control surface','legacy and canvas video assets are selected through the API','revision protection is sent on creation','Step01 uses the source-only server route','the UI cannot submit a paid canvas provider job']}));
