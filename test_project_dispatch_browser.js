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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(baseUrl + '/api/health')).ok) return;
    } catch {}
    await pause(75);
  }
  throw new Error('project_dispatch_preview_server_unavailable');
}

async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-project-dispatch-'));
  const dataRoot = path.join(tempRoot, 'data');
  const port = 27000 + crypto.randomInt(1000);
  const baseUrl = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root,
    env: {...process.env, PORT:String(port), DATA_DIR:dataRoot},
    stdio:['ignore', 'ignore', 'ignore']
  });
  let browser;
  try {
    await waitForHealth(baseUrl);
    const register = await fetch(baseUrl + '/api/auth/register', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({email:'dispatch-' + crypto.randomBytes(6).toString('hex') + '@example.test', password:'dispatch-test-password'})
    });
    assert.equal(register.status, 200, 'test user registration must succeed');
    const user = (await register.json()).user;
    const cookie = (typeof register.headers.getSetCookie === 'function' ? register.headers.getSetCookie()[0] : register.headers.get('set-cookie')).split(';')[0];
    const now = new Date().toISOString();
    await writeJson(path.join(dataRoot, 'projects.json'), [{
      id:'RDR-dispatch-running', name:'雪地来信', ownerId:user.id, createdAt:now, updatedAt:now,
      status:'running', runtime:{productionStatus:'running', currentNode:'step02', nextAction:'等待镜头任务回读'},
      pipeline:[{status:'completed'}, {status:'running'}, {status:'pending'}]
    }]);
    await writeJson(path.join(dataRoot, 'script-projects.json'), [{
      id:'SD-dispatch-attention', name:'长安异闻录 EP01', ownerId:user.id, createdAt:now, updatedAt:now,
      source:{type:'pasted_text', characters:240, extractedTextSha256:'a'.repeat(64)}, pipeline:[], gates:{}, route:{},
      status:'queued', runtime:{productionStatus:'queued', currentNode:'N02', earliestIncompleteNode:'N02', nextAction:'确认角色与视觉方向'}
    }, {
      id:'SD-dispatch-delivered', name:'纸鸢奇谈', ownerId:user.id, createdAt:now, updatedAt:now,
      source:{type:'pasted_text', characters:240, extractedTextSha256:'b'.repeat(64)}, pipeline:[], gates:{}, route:{},
      status:'completed', runtime:{productionStatus:'completed', currentNode:'N07', nextAction:'预览或继续编辑'}
    }]);

    browser = await chromium.launch({headless:true});
    const context = await browser.newContext({viewport:{width:1440, height:900}});
    await context.addCookies([{name:'niannian_session', value:cookie.split('=').slice(1).join('='), domain:'127.0.0.1', path:'/'}]);
    const page = await context.newPage();
    await page.goto(baseUrl + '/#projects', {waitUntil:'domcontentloaded'});
    await page.locator('.project-dispatch-focus').waitFor({state:'visible'});
    assert.ok(await page.locator('.project-dispatch-focus.is-row-waiting').count(), 'the focus project must retain the real status tone');
    assert.equal((await page.locator('.pdf-project h3').innerText()).trim(), '长安异闻录 EP01', 'the priority project must come from real queued project state');
    assert.equal(await page.locator('.project-dispatch-lane').count(), 2, 'the non-priority projects must be grouped into production lanes');
    assert.match(await page.locator('.project-dispatch').innerText(), /确认角色与视觉方向/, 'the focus panel must surface the project next action');
    assert.deepEqual(await page.locator('.project-count-strip [data-count-filter]').allTextContents(), ['所有项目3', '制作中1', '待处理1', '已交付1']);
    const desktopSize = await page.evaluate(() => ({scrollWidth:document.documentElement.scrollWidth, viewportWidth:window.innerWidth}));
    assert.ok(desktopSize.scrollWidth <= desktopSize.viewportWidth, 'desktop dispatch board must not overflow horizontally');

    await page.locator('#projectSearch').fill('雪地');
    assert.equal(await page.locator('.project-dispatch-focus').count(), 1, 'search must preserve a focused project view');
    assert.match(await page.locator('.project-dispatch-focus').innerText(), /雪地来信/, 'search must use real project identity');
    await page.locator('#projectSearch').fill('');
    await page.setViewportSize({width:390, height:844});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.project-dispatch-focus').waitFor({state:'visible'});
    const mobileSize = await page.evaluate(() => ({scrollWidth:document.documentElement.scrollWidth, viewportWidth:window.innerWidth}));
    assert.ok(mobileSize.scrollWidth <= mobileSize.viewportWidth, 'mobile dispatch board must not overflow horizontally');
    assert.ok(await page.locator('.pdf-action').isVisible(), 'mobile dispatch board must retain the primary continue action');
    await context.close();
    await browser.close();
    browser = null;
    console.log(JSON.stringify({ok:true, verified:[
      'real authenticated project data renders as a priority project and production lanes',
      'search keeps the correct real project as the continue path',
      'desktop 1440px and mobile 390px dispatch layouts do not overflow',
      'mobile retains the continue action'
    ]}));
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
