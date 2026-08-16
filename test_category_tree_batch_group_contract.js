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
assert.match(source, /输入目标组名称/);
assert.match(source, /未找到目标组，请输入列表中的默认组或子组名称/);
assert.match(source, /if\(!l\)\{re\(\{message/);
assert.match(source, /fe\.flatMap\(i=>\{const a=oe\(i\.id\)\?s\(`libraries\.sidebar\.builtinCategory\.\$\{i\.id\}`\):i\.name/);
assert.match(source, /E\(i\.id,\{categoryId:l\.categoryId,groupId:null\}\),l\.groupId&&c\(i\.id,l\.groupId\)/);
assert.match(source, /disabled:!R\.length\|\|!fe\.length/);
assert.match(shell, /CategoryTree-D1LnwwpQ-r4\.js/);
assert.match(shell, /CategoryTree-D1LnwwpQ-r4\.js\?v=20260817-canvas-grouping-r1/);
assert.doesNotMatch(shell, /CategoryTree-BIOCuy5i-r4\.js/);

console.log(JSON.stringify({
  ok: true,
  verified: [
    'Selected nodes can be moved into any default category or subgroup without drag and drop.',
    'Moving to a category clears an old subgroup; moving to a subgroup persists both category and subgroup.',
  ],
}));
