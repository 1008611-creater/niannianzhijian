'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const {chromium} = require('playwright');

const root = __dirname;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForHealth(baseUrl) {
  let lastError = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl + '/api/health');
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await pause(75);
  }
  throw lastError || new Error('main_nav_preview_server_unavailable');
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-main-nav-'));
  const port = 26000 + crypto.randomInt(1000);
  const baseUrl = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root,
    env: {...process.env, PORT:String(port), DATA_DIR:path.join(tempRoot, 'data')},
    stdio:['ignore', 'ignore', 'ignore']
  });
  let browser = null;
  try {
    await waitForHealth(baseUrl);
    browser = await chromium.launch({headless:true});

    const page = await browser.newPage({viewport:{width:1280, height:900}});
    await page.goto(baseUrl + '/#workbench', {waitUntil:'domcontentloaded'});
    await page.locator('.workbench-launcher').waitFor({state:'visible'});

    const navLabels = await page.locator('.main-nav .nav-item').allInnerTexts();
    assert.deepEqual(navLabels.map(label => label.trim()), ['首页', '工作台', '导演台', '项目管理', '团队管理', '使用文档'], 'main navigation must keep the confirmed six-item order');

    const workbenchTitles = await page.locator('.workbench-launch-card strong').allInnerTexts();
    assert.deepEqual(workbenchTitles.map(title => title.trim()), ['无限画布', '一键转绘', '一键制剧', '智能剪辑'], 'workbench must use the four confirmed entry names');

    await page.locator('.nav-item[data-view="docs"]').click();
    await page.locator('.docs-view.is-visible').waitFor({state:'visible'});
    assert.equal(await page.locator('.docs-view .docs-card').count(), 6, 'docs first-level surface must explain every main surface');
    assert.equal((await page.locator('.docs-heading h2').innerText()).trim(), '使用文档');

    await page.locator('.nav-item[data-view="team"]').click();
    await page.locator('.team-view.is-visible').waitFor({state:'visible'});
    const teamCardCount = await page.locator('.team-view .team-grid, .team-view .public-access-panel').count();
    assert(teamCardCount >= 1, 'team first-level surface must render a real boundary or login state');

    await page.goto(baseUrl + '/#docs', {waitUntil:'domcontentloaded'});
    await page.locator('.docs-view.is-visible').waitFor({state:'visible'});
    assert.equal((await page.locator('.docs-heading h2').innerText()).trim(), '使用文档', 'docs must be reachable by URL and refreshable');

    const desktopDimensions = await page.evaluate(() => ({scrollWidth:document.documentElement.scrollWidth, viewportWidth:window.innerWidth}));
    assert(desktopDimensions.scrollWidth <= desktopDimensions.viewportWidth, 'desktop docs surface must not overflow horizontally');
    await page.close();

    const mobile = await browser.newPage({viewport:{width:390, height:844}});
    await mobile.goto(baseUrl + '/#docs', {waitUntil:'domcontentloaded'});
    await mobile.locator('.docs-view.is-visible').waitFor({state:'visible'});
    const mobileDimensions = await mobile.evaluate(() => ({scrollWidth:document.documentElement.scrollWidth, viewportWidth:window.innerWidth}));
    assert(mobileDimensions.scrollWidth <= mobileDimensions.viewportWidth, 'mobile docs surface must not overflow horizontally');
    await mobile.close();

    await browser.close();
    browser = null;
    console.log(JSON.stringify({ok:true, verified:['six-item main navigation in confirmed order', 'four workbench entries with 一键制剧', 'docs first-level surface with six explainer cards', 'team first-level surface', 'desktop and mobile docs without overflow']}));
  } finally {
    if (browser) await browser.close();
    server.kill();
    await fs.rm(tempRoot, {recursive:true, force:true});
  }
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
