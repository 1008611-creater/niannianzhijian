'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');

const root = __dirname;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(baseUrl + '/api/health')).ok) return; } catch {}
    await pause(100);
  }
  throw new Error('commerce_admin_server_not_ready');
}

async function main() {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-commerce-browser-'));
  const port = 29500 + crypto.randomInt(300);
  const baseUrl = 'http://127.0.0.1:' + port;
  const token = crypto.randomBytes(18).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const screenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-commerce-shots-'));
  await Promise.all([
    fs.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([{id:'USR-ADMIN',email:'admin@example.test',status:'active',role:'admin',tenantId:'TEN-ADMIN'}])),
    fs.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{userId:'USR-ADMIN',tokenHash,expiresAt:new Date(Date.now() + 3600000).toISOString()}])),
    ...['projects.json','script-projects.json','canvas-documents.json','canvas-generation-jobs.json','workspace-bindings.json','website-idempotency.json'].map(name => fs.writeFile(path.join(dataRoot, name), name === 'canvas-documents.json' ? '{}' : '[]'))
  ]);
  const server = spawn(process.execPath, ['server.js'], {cwd:root, env:{...process.env, PORT:String(port), DATA_DIR:dataRoot, NIANNIAN_ADMIN_USER_IDS:'USR-ADMIN', AGENT_VAULT_ADDR:'http://127.0.0.1:14321', AGENT_VAULT_VAULT:'test-vault', AGENT_VAULT_TOKEN:'test-token', HTTPS_PROXY:'http://127.0.0.1:14322', NIANNIAN_CANVAS_YUNWU_SUBMIT:'on', NOMI_RUNNINGHUB_H3_API_KEY:'test-h3-key', NIANNIAN_CANVAS_H3_SUBMIT:'on'}, stdio:['ignore','ignore','ignore']});
  let browser;
  try {
    await waitForHealth(baseUrl);
    browser = await chromium.launch({headless:true});
    const context = await browser.newContext({viewport:{width:1440,height:900}});
    await context.addCookies([{name:'niannian_session',value:token,url:baseUrl}]);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(baseUrl + '/admin/commerce/', {waitUntil:'networkidle'});
    await page.getByRole('heading', {name:'商业运营台'}).waitFor({state:'visible'});
    await page.getByRole('heading', {name:'用户可用模型'}).waitFor({state:'visible'});
    await page.getByText('服务器配置已读取').waitFor({state:'visible'});
    assert.equal(await page.locator('body').innerText().then(text => text.includes('agent-vault://')), false);
    const price = page.locator('.model-row').filter({hasText:'云雾 Image2 竖版 4K'}).getByRole('spinbutton');
    await price.fill('19');
    await page.locator('.model-row').filter({hasText:'云雾 Image2 竖版 4K'}).getByRole('button', {name:'保存'}).click();
    await page.getByText('模型目录已保存，用户下次读取画布目录时生效').waitFor({state:'visible'});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    const desktopShot = path.join(screenshotDir, 'commerce-desktop.png');
    await page.screenshot({path:desktopShot, fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.reload({waitUntil:'networkidle'});
    await page.getByRole('heading', {name:'商业运营台'}).waitFor({state:'visible'});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    const mobileShot = path.join(screenshotDir, 'commerce-mobile.png');
    await page.screenshot({path:mobileShot, fullPage:true});
    assert.deepEqual(pageErrors, []);
    await context.close();
    await browser.close(); browser = null;
    console.log(JSON.stringify({ok:true,desktopShot,mobileShot,verified:['管理员可读取运营台','模型价格可保存','页面不显示保险库引用','桌面与移动端无横向溢出','未提交供应商生成']}));
  } finally {
    if (browser) await browser.close();
    server.kill();
    await fs.rm(dataRoot, {recursive:true,force:true});
  }
}

main().catch(error => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });
