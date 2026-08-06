const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const source = fs.readFileSync(path.join(root, 'mvp-step02-r13.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'product.css'), 'utf8');
const launcherStart = source.indexOf('  function renderWorkbenchLauncher()');
const launcherEnd = source.indexOf('  function animateWorkbenchEntry()', launcherStart);

assert(launcherStart >= 0 && launcherEnd > launcherStart, 'workbench launcher renderer is missing');
assert.strictEqual((source.match(/function renderWorkbenchLauncher\(\)/g) || []).length, 1, 'workbench launcher must have one source of truth');

const launcherRenderer = source.slice(launcherStart, launcherEnd);

[
  'aria-label="选择创作方式"',
  "const canvasHref = '/studio/#/studio'",
  'data-open-redraw-intake',
  'data-open-script-drama-wizard',
  '无限画布',
  '一键转绘',
  '一键短剧',
  '智能剪辑',
  'https://edit.cauai.fun/'
].forEach(token => assert(launcherRenderer.includes(token), `missing workbench launcher contract: ${token}`));

[
  'renderWorkbenchDeck',
  '项目工作台',
  '当前任务',
  '项目与历史',
  '质量门',
  '演示中的下一步'
].forEach(token => assert(!launcherRenderer.includes(token), `workbench launcher must not contain dashboard content: ${token}`));

assert(source.includes('workbenchContent.innerHTML = renderWorkbenchLauncher();'), 'workbench must use the launcher for every session state');
['.workbench-launcher', '.workbench-launch-card', 'aspect-ratio: 1', '@media (max-width: 760px)'].forEach(token => {
  assert(css.includes(token), `missing responsive launcher style: ${token}`);
});
console.log('workbench launcher contract verified');
