'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

async function main() {
  const experience = read('WEBSITE_EXPERIENCE_CONTRACT.md');
  const plan = read('FRONTEND_EXECUTION_PLAN.md');

  // 1. 体验合同：错误相对路径已修复，头部适用范围与四份权威文档链接有效。
  assert.doesNotMatch(experience, /\.\.\/authority\//, 'experience contract must not link outside the repository');
  assert.match(experience, /当前适用范围（2026-08-10）/);
  ['PRODUCT.md', 'DESIGN.md', 'FRONTEND_EXECUTION_PLAN.md', 'authority/NIANNIAN_AI_ENGINEERING_AUTHORITY.md'].forEach(link => {
    assert.equal(fs.existsSync(path.join(root, link)), true, `broken authority link: ${link}`);
    assert.match(experience, new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `experience contract must reference ${link}`);
  });

  // 2. 施工图：阶段总览完整，阶段 0.5 已回写完成，含状态快照与工具门。
  ['0. 前端权威基线', '0.5. 主站导航与工作台四模块', '1. 生成闭环', '2. 素材真相', '3. 项目控制中心', '4. 移动端连续性', '5. 完整转绘短剧验收'].forEach(stage => {
    assert.match(plan, new RegExp(`\\| ${stage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `missing stage row: ${stage}`);
  });
  assert.match(plan, /\| 0\.5\. 主站导航与工作台四模块[^\n]*\| 已完成 \|/);
  assert.match(plan, /## 当前状态快照（2026-08-10）/);
  assert.match(plan, /## GitHub 高星工具门（2026-08-10 实测）/);
  ['playwright', 'shadcn-ui/ui', 'axe-core', 'lighthouse', 'biomejs/biome', 'prettier', 'semantic-release', 'gitleaks', 'OWASP CheatSheetSeries', 'style-dictionary'].forEach(tool => {
    assert.match(plan, new RegExp(tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing tool gate: ${tool}`);
  });
  assert.match(plan, /- 所用工具门、执行命令与输出证据/);
  assert.match(plan, /\| 5 完整转绘短剧验收 \| 以上全部 \+ gitleaks \+ OWASP CheatSheetSeries \|/);

  // 3. 目标图：非空且尺寸符合权威视口（1440x900 桌面 / 390x844 移动）。
  const targetsDir = path.join(root, 'docs', 'frontend-targets');
  assert.equal(fs.existsSync(path.join(targetsDir, 'comparison-20260810.md')), true, 'missing target-image comparison table');
  const targets = [
    ['00-home-desktop.png', '1440x900'],
    ['01-project-hub-desktop.png', '1440x900'],
    ['02-studio-canvas-desktop.png', '1440x900'],
    ['03-generation-inspector-desktop.png', '1440x900'],
    ['04-asset-library-desktop.png', '1440x900'],
    ['05-studio-mobile.png', '390x844'],
    ['06-workbench-desktop.png', '1440x900'],
    ['07-studio-project-library-desktop.png', '1440x900'],
    ['08-director-desk-desktop.png', '1440x900']
  ];
  for (const [name, expected] of targets) {
    const file = path.join(targetsDir, name);
    assert.equal(fs.existsSync(file), true, `missing target image: ${name}`);
    const stat = fs.statSync(file);
    assert.ok(stat.size > 0, `empty target image: ${name}`);
    const meta = await sharp(file).metadata();
    assert.equal(`${meta.width}x${meta.height}`, expected, `target image dimension mismatch for ${name}: expected ${expected}, got ${meta.width}x${meta.height}`);
  }

  process.stdout.write(JSON.stringify({ok: true, verified: [
    'experience contract links resolve inside the repository',
    'execution plan stages, completion status, snapshot and tool gates present',
    'all 9 target images exist with authoritative viewport dimensions'
  ]}) + '\n');
}

main().catch(err => {
  process.stderr.write(String(err && err.message || err) + '\n');
  process.exit(1);
});
