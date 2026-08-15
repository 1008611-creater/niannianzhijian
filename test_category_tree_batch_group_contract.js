'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, 'studio', 'assets', 'CategoryTree-D1LnwwpQ-r4.js'),
  'utf8',
);
const shell = fs.readFileSync(
  path.join(__dirname, 'studio', 'assets', 'WorkbenchShell-Cifm3Y6A-r4.js'),
  'utf8',
);

assert.match(source, /批量归组/);
assert.match(source, /已选择 \$\{e\.length\} 个节点/);
assert.match(source, /输入目标批次名称/);
assert.match(source, /B\(i\.id\),E\(i\.id,\{categoryId:l\.id\}\)/);
assert.match(source, /disabled:!R\.length\|\|!fe\.some\(e=>!e\.isBuiltin\)/);
assert.match(shell, /CategoryTree-D1LnwwpQ-r4\.js/);
assert.doesNotMatch(shell, /CategoryTree-BIOCuy5i-r4\.js/);

console.log(JSON.stringify({
  ok: true,
  verified: [
    'Selected nodes can be moved into an existing batch category without drag and drop.',
    'The action remains unavailable until a batch category and selected nodes exist.',
  ],
}));
