const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const {chromium} = require('playwright');

const root = __dirname;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(baseUrl + '/api/health')).ok) return;
    } catch {}
    await pause(75);
  }
  throw new Error('preview_server_unavailable');
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-smart-cut-launcher-'));
  const port = 25000 + crypto.randomInt(1000);
  const baseUrl = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root,
    env: {...process.env, PORT: String(port), DATA_DIR: path.join(tempRoot, 'data')},
    stdio: ['ignore', 'ignore', 'ignore']
  });
  let browser;
  try {
    await waitForHealth(baseUrl);
    browser = await chromium.launch({headless: true});
    const desktop = await browser.newPage({viewport: {width: 1280, height: 900}});
    await desktop.goto(baseUrl + '/#workbench', {waitUntil: 'domcontentloaded'});
    await desktop.locator('.workbench-launcher').waitFor({state: 'visible'});
    assert.equal(await desktop.locator('.workbench-launch-card').count(), 4);
    assert.equal(await desktop.locator('a[href="https://edit.cauai.fun/"]').innerText().then(text => text.includes('智能剪辑')), true);
    const desktopState = await desktop.evaluate(() => ({
      columns: getComputedStyle(document.querySelector('.workbench-launcher')).gridTemplateColumns,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth
    }));
    assert.equal(desktopState.columns.split(' ').length, 4);
    assert(desktopState.scrollWidth <= desktopState.viewportWidth);
    await desktop.close();

    const mobile = await browser.newPage({viewport: {width: 390, height: 844}});
    await mobile.goto(baseUrl + '/#workbench', {waitUntil: 'domcontentloaded'});
    await mobile.locator('.workbench-launcher').waitFor({state: 'visible'});
    const mobileState = await mobile.evaluate(() => ({
      cards: document.querySelectorAll('.workbench-launch-card').length,
      columns: getComputedStyle(document.querySelector('.workbench-launcher')).gridTemplateColumns,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth
    }));
    assert.equal(mobileState.cards, 4);
    assert.equal(mobileState.columns.split(' ').length, 1);
    assert(mobileState.scrollWidth <= mobileState.viewportWidth);
    await mobile.close();
    console.log(JSON.stringify({ok: true, verified: ['four workbench cards', 'smart-cut editor href', 'desktop four-column layout', 'mobile single-column layout without overflow']}));
  } finally {
    if (browser) await browser.close();
    server.kill();
    await fs.rm(tempRoot, {recursive: true, force: true});
  }
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
