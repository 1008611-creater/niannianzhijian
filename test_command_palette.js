'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');

const root = __dirname;

function delay(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl + '/api/health');
      if (response.ok && (await response.json()).ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error('command_palette_server_health_timeout');
}

async function register(baseUrl) {
  const response = await fetch(baseUrl + '/api/auth/register', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:'command-palette-' + Date.now() + '@example.com', password:'correct-horse-battery-staple'})
  });
  const payload = await response.json();
  assert([200, 201].includes(response.status), 'expected temporary owner registration: ' + JSON.stringify(payload));
  const match = /^niannian_session=([^;]+)/.exec(String(response.headers.get('set-cookie') || ''));
  assert(match, 'expected temporary session cookie');
  return match[1];
}

async function createScriptProject(baseUrl, cookie) {
  const response = await fetch(baseUrl + '/api/script-projects', {
    method:'POST',
    headers:{'Content-Type':'application/json', Cookie:'niannian_session=' + cookie},
    body:JSON.stringify({
      name:'命令面板测试项目', genre:'都市情感', audience:'制作审核用户', episodeDuration:60, aspectRatio:'9:16', rightsConfirmed:true,
      sourceText:'雨夜的民政局外，顾言把伞递给苏晚。她没有马上接过，只把戒指收进掌心，问他接下来准备去哪里。顾言说先吃一碗热面，等雨停后再把彼此没有说完的话说清楚。玻璃门倒映着走散的人群，城市的灯光落在积水里，苏晚第一次决定不再回头。她抬起头，听见雨声渐渐轻下来，也看见自己终于把生活重新握在手里。'
    })
  });
  const payload = await response.json();
  assert.equal(response.status, 201, 'expected temporary script project creation: ' + JSON.stringify(payload));
  return payload.project;
}

async function main() {
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-command-palette-'));
  const port = 25000 + crypto.randomInt(1000);
  const baseUrl = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd:root,
    env:{...process.env, PORT:String(port), DATA_DIR:path.join(tempRoot, 'data'), NIANNIAN_LOCAL_PREVIEW_INSECURE_SESSION:'on', NIANNIAN_MEDIA_PREFLIGHT:'off', NIANNIAN_N05_REGENERATION_AUTOSTART:'off', ZHUANHUI_WORKSPACE:tempRoot},
    stdio:['ignore', 'ignore', 'ignore']
  });
  let browser = null;
  try {
    await waitForHealth(baseUrl);
    const session = await register(baseUrl);
    const project = await createScriptProject(baseUrl, session);
    browser = await chromium.launch({headless:true});
    const context = await browser.newContext();
    await context.addCookies([{name:'niannian_session', value:session, domain:'127.0.0.1', path:'/'}]);
    const page = await context.newPage();
    await page.goto(baseUrl + '/#home', {waitUntil:'domcontentloaded'});

    const accountButton = page.locator('#accountButton');
    await accountButton.waitFor({state:'visible'});
    await page.waitForFunction(() => document.querySelector('#accountButton')?.classList.contains('is-authenticated'));
    await accountButton.click();
    await page.locator('#accountMenu').waitFor({state:'visible'});
    assert.equal(await accountButton.getAttribute('aria-expanded'), 'true', 'authenticated account control should open its menu instead of logging out');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#accountMenu').evaluate(element => element.hidden), true, 'escape should close the account menu');

    await page.keyboard.press('Control+K');
    await page.locator('#commandPalette').waitFor({state:'visible'});
    assert.equal(await page.locator('#commandPaletteInput').evaluate(element => document.activeElement === element), true, 'command palette input should receive focus');
    await page.locator('#commandPaletteInput').fill('工作台');
    const workbenchCommand = page.locator('[data-command-palette-item="view:workbench"]');
    await workbenchCommand.waitFor({state:'visible'});
    await workbenchCommand.click();
    await page.waitForFunction(() => location.hash === '#workbench');
    assert.equal(await page.locator('#commandPalette').evaluate(element => element.hidden), true, 'palette should close after navigation');

    await page.keyboard.press('Control+K');
    await page.locator('#commandPaletteInput').fill('命令面板测试项目');
    const projectCommand = page.locator('[data-command-palette-item="script:' + project.id + '"]');
    await projectCommand.waitFor({state:'visible'});
    await projectCommand.click();
    await page.waitForFunction(projectId => location.hash.startsWith('#script/' + projectId), project.id);

    await page.keyboard.press('Control+K');
    await page.locator('#commandPalette').waitFor({state:'visible'});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#commandPalette').evaluate(element => element.hidden), true, 'escape should close the palette');

    const mobileContext = await browser.newContext({viewport:{width:390, height:844}});
    await mobileContext.addCookies([{name:'niannian_session', value:session, domain:'127.0.0.1', path:'/'}]);
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(baseUrl + '/#home', {waitUntil:'domcontentloaded'});
    await mobilePage.keyboard.press('Control+K');
    await mobilePage.locator('#commandPalette').waitFor({state:'visible'});
    const dimensions = await mobilePage.evaluate(() => ({scrollWidth:document.documentElement.scrollWidth, viewportWidth:window.innerWidth}));
    assert(dimensions.scrollWidth <= dimensions.viewportWidth, 'command palette must not add mobile horizontal overflow');
    await mobileContext.close();
    await context.close();
    await browser.close();
    browser = null;
    process.stdout.write(JSON.stringify({ok:true, verified:['authenticated account menu without automatic logout', 'global command palette trigger', 'focus-safe opening', 'page navigation', 'project search and studio route', 'escape close', 'mobile no horizontal overflow']}) + '\n');
  } finally {
    if (browser) await browser.close();
    server.kill();
    await fsp.rm(tempRoot, {recursive:true, force:true});
  }
}

main().catch(error => {
  process.stderr.write((error.stack || error.message || String(error)) + '\n');
  process.exitCode = 1;
});
