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
  throw new Error('s1_ui_server_not_ready');
}

async function main() {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-s1-ui-'));
  const port = 28600 + crypto.randomInt(500);
  const baseUrl = 'http://127.0.0.1:' + port;
  const token = crypto.randomBytes(18).toString('hex');
  const user = {id:'USR-S1-UI',email:'s1-ui@example.test',status:'active'};
  const project = {id:'NN-S1-UI',ownerId:user.id,name:'S1 UI',projectKind:'redraw',canvasOnly:true,status:'ready',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),runtime:{}};
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await Promise.all([
    fs.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([user])),
    fs.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{tokenHash,userId:user.id,expiresAt:new Date(Date.now() + 3600000).toISOString()}])),
    fs.writeFile(path.join(dataRoot, 'projects.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'canvas-projects.json'), JSON.stringify([project])),
    fs.writeFile(path.join(dataRoot, 'canvas-documents.json'), '{}'),
    fs.writeFile(path.join(dataRoot, 'canvas-assets.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'canvas-generation-jobs.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'script-projects.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'workspace-bindings.json'), '[]')
  ]);
  const server = spawn(process.execPath, ['server.js'], {cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_RUNNINGHUB_SUBMIT:'off'},stdio:['ignore','ignore','ignore']});
  let browser;
  try {
    await waitForHealth(baseUrl);
    const mp4 = Buffer.alloc(32); mp4.writeUInt32BE(32, 0); mp4.write('ftyp', 4, 'ascii'); mp4.write('isom', 8, 'ascii');
    const form = new FormData(); form.append('kind', 'reference_video'); form.append('asset', new Blob([mp4], {type:'video/mp4'}), 'source.mp4');
    const upload = await fetch(baseUrl + '/api/projects/' + project.id + '/assets', {method:'POST',headers:{cookie:'niannian_session=' + token,'x-niannian-project-kind':'redraw'},body:form});
    assert.equal(upload.status, 201, 'test source video must upload');
    browser = await chromium.launch({headless:true});
    const context = await browser.newContext({viewport:{width:1440,height:900}});
    await context.addCookies([{name:'niannian_session',value:token,url:baseUrl}]);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    await page.goto(baseUrl + '/studio/?projectId=' + project.id + '&projectKind=redraw#/studio', {waitUntil:'networkidle'});
    const panel = page.locator('#s1-chain-canvas');
    await panel.waitFor({state:'visible'});
    await assert.rejects(panel.getByRole('button', {name:'创建节点链'}).click({timeout:300}), /Timeout|intercepted/, 'create remains disabled until all source gates pass');
    await panel.getByRole('checkbox', {name:/source\.mp4/}).check();
    await panel.getByRole('checkbox', {name:/我确认拥有/}).check();
    await panel.locator('[data-s1-preflight]').selectOption('passed');
    await panel.getByRole('button', {name:'创建节点链'}).click();
    await panel.getByText('已创建 3 个节点和 2 条依赖边。').waitFor();
    assert.equal(await panel.locator('.s1-node').count(), 4);
    await panel.locator('[data-node="image2"]').getByText('Image2 关键帧生成').waitFor();
    assert.equal(await panel.locator('[data-s2-dry]').isDisabled(), true, 'Image2 preparation stays disabled before the node is saved');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'desktop must not overflow');
    await page.setViewportSize({width:390,height:844});
    await page.reload({waitUntil:'networkidle'});
    await page.locator('#s1-chain-canvas').waitFor({state:'visible'});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile must not overflow');
    assert.deepEqual(consoleErrors, []);
    await context.close();
    await browser.close(); browser = null;
    console.log(JSON.stringify({ok:true,verified:['desktop S1 panel selects a project video and creates the chain','creation is disabled until rights and preflight pass','mobile S1 panel stays within viewport','no provider task is sent']}));
  } finally {
    if (browser) await browser.close();
    server.kill();
    await fs.rm(dataRoot, {recursive:true,force:true});
  }
}

main().catch(error => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });
