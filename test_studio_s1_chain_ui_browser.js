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

async function openGenerationCanvas(page) {
  const canvas = page.getByRole('region', {name:'AI 影像创作画布'});
  try { await canvas.waitFor({state:'visible',timeout:5000}); return; } catch {}
  const generationButton = page.locator('[data-step="generate"],button').filter({hasText:'生成'}).first();
  await generationButton.waitFor({state:'visible'});
  await generationButton.click({force:true});
  await canvas.waitFor({state:'visible'});
}

async function main() {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-s1-ui-'));
  const port = 28600 + crypto.randomInt(500);
  const baseUrl = 'http://127.0.0.1:' + port;
  const token = crypto.randomBytes(18).toString('hex');
  const user = {id:'USR-S1-UI',email:'s1-ui@example.test',status:'active'};
  const project = {id:'NN-S1-UI',ownerId:user.id,name:'S1 UI',projectKind:'redraw',canvasOnly:true,status:'ready',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),runtime:{}};
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const retiredChampion = {id:'retired-screenwriter',type:'text',kind:'text',status:'draft',skillKey:'screenwriter',skillVersion:'1.0.0',position:{x:120,y:120},data:{title:'剧本编排',skillKey:'screenwriter',status:'draft'}};
  const canvasDocuments = {
    ['redraw:' + project.id]: {projectId:project.id,projectKind:'redraw',ownerId:user.id,revision:1,updatedAt:new Date().toISOString(),document:{nodes:[retiredChampion],edges:[],viewport:{x:0,y:0,zoom:1}}}
  };
  await Promise.all([
    fs.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([user])),
    fs.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{tokenHash,userId:user.id,expiresAt:new Date(Date.now() + 3600000).toISOString()}])),
    fs.writeFile(path.join(dataRoot, 'projects.json'), JSON.stringify([project])),
    fs.writeFile(path.join(dataRoot, 'canvas-projects.json'), JSON.stringify([project])),
    fs.writeFile(path.join(dataRoot, 'canvas-documents.json'), JSON.stringify(canvasDocuments)),
    fs.writeFile(path.join(dataRoot, 'canvas-assets.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'canvas-generation-jobs.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'script-projects.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'workspace-bindings.json'), '[]')
  ]);
  const server = spawn(process.execPath, ['server.js'], {cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_RUNNINGHUB_SUBMIT:'off',NIANNIAN_GPT_API_KEY:'',NIANNIAN_TEXT_API_KEY:''},stdio:['ignore','ignore','ignore']});
  let browser;
  try {
    await waitForHealth(baseUrl);
    browser = await chromium.launch({headless:true});
    const context = await browser.newContext({viewport:{width:1440,height:900}});
    await context.addCookies([{name:'niannian_session',value:token,url:baseUrl}]);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('pageerror', error => consoleErrors.push(error.message));
    await page.goto(baseUrl + '/studio/?projectId=' + project.id + '&projectKind=redraw&step=generate#/studio', {waitUntil:'networkidle'});
    await openGenerationCanvas(page);
    const canvas = page.getByRole('region', {name:'AI 影像创作画布'});
    const panel = page.locator('#s1-chain-canvas');
    await panel.waitFor({state:'visible'});
    assert.equal(await panel.evaluate(node => node.parentElement && node.parentElement.getAttribute('aria-label')), 'AI 影像创作画布');
    assert.equal(await panel.getByRole('heading', {name:'原片到关键帧'}).isVisible(), false, 'new projects must not show retired source-chain cards');
    assert.equal(await panel.locator('[data-node]:not([hidden])').count(), 0, 'retired source-chain cards must stay hidden');
    assert.equal(await panel.locator('[data-champion-node]').count(), 0, 'retired champion cards must never render');
    const persistedDocument = await page.evaluate(async () => (await fetch('/api/canvas/documents/redraw/NN-S1-UI')).json());
    assert.equal(persistedDocument.document.nodes.some(node => node.id === 'retired-screenwriter'), true, 'retired records must remain recoverable even though their UI is removed');
    assert.equal(await page.locator('[aria-label="转绘 Skill 节点"]').count(), 0, 'the retired Skill toolbar must not be injected');
    assert.ok(await page.getByRole('button', {name:'添加文本节点'}).count() >= 1, 'original text node control must remain');
    assert.ok(await page.getByRole('button', {name:'添加图片节点'}).count() >= 1, 'original image node control must remain');
    await canvas.click({button:'right', position:{x:1080,y:400}, force:true});
    await panel.getByRole('button', {name:'文本节点'}).waitFor({state:'visible'});
    assert.equal(await panel.locator('[data-s1-add-skill]').count(), 0, 'right-click must not offer retired Skill nodes');
    assert.equal(await panel.getByText('转绘 Skill 节点', {exact:true}).count(), 0, 'retired Skill grouping must not appear');
    await page.mouse.click(1120,420);
    assert.equal(await panel.getByRole('button', {name:'文本节点'}).isVisible(), false, 'left click on blank canvas must dismiss the native context menu');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'desktop must not overflow');
    await page.setViewportSize({width:390,height:844});
    await page.reload({waitUntil:'networkidle'});
    await openGenerationCanvas(page);
    await panel.waitFor({state:'visible'});
    assert.equal(await panel.locator('[data-champion-node]').count(), 0, 'mobile must not restore retired Skill cards');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile must not overflow');
    assert.deepEqual(consoleErrors, []);
    await context.close();
    await browser.close(); browser = null;
    console.log(JSON.stringify({ok:true,verified:['retired gold and champion Skill cards do not render','right-click preserves original node entries only','blank-canvas left click dismisses the menu','desktop and mobile stay within their viewports','no provider task is sent']}));
  } finally {
    if (browser) await browser.close();
    server.kill();
    await fs.rm(dataRoot, {recursive:true,force:true});
  }
}

main().catch(error => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });
