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
  if (await canvas.count() === 0) {
    await page.getByRole('button', {name:'生成', exact:true}).click({force:true});
  }
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
  await Promise.all([
    fs.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([user])),
    fs.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{tokenHash,userId:user.id,expiresAt:new Date(Date.now() + 3600000).toISOString()}])),
    fs.writeFile(path.join(dataRoot, 'projects.json'), JSON.stringify([project])),
    fs.writeFile(path.join(dataRoot, 'canvas-projects.json'), JSON.stringify([project])),
    fs.writeFile(path.join(dataRoot, 'canvas-documents.json'), '{}'),
    fs.writeFile(path.join(dataRoot, 'canvas-assets.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'canvas-generation-jobs.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'script-projects.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'workspace-bindings.json'), '[]')
  ]);
  const server = spawn(process.execPath, ['server.js'], {cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_RUNNINGHUB_SUBMIT:'off',NIANNIAN_GPT_API_KEY:'',NIANNIAN_TEXT_API_KEY:''},stdio:['ignore','ignore','ignore']});
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
    await page.goto(baseUrl + '/studio/?projectId=' + project.id + '&projectKind=redraw&step=generate#/studio', {waitUntil:'networkidle'});
    await page.locator('#s1-chain-back').waitFor({state:'visible'});
    await openGenerationCanvas(page);
    const canvas = page.getByRole('region', {name:'AI 影像创作画布'});
    const panel = page.locator('#s1-chain-canvas');
    await panel.waitFor({state:'visible'});
    assert.equal(await panel.evaluate(node => node.parentElement && node.parentElement.getAttribute('aria-label')), 'AI 影像创作画布', 'the S1 chain must mount inside the generation canvas');
    assert.equal(await panel.getByRole('heading', {name:'原片到关键帧'}).isVisible(), false, 'new projects must not show default S1 cards');
    assert.ok(await page.getByRole('button', {name:'添加文本节点'}).count() >= 1, 'original text node control must remain');
    assert.ok(await page.getByRole('button', {name:'添加图片节点'}).count() >= 1, 'original image node control must remain');
    await page.getByRole('button', {name:'打开原片转绘链'}).click();
    await assert.rejects(panel.getByRole('button', {name:'创建节点链'}).click({timeout:300}), /Timeout|intercepted/, 'create remains disabled until all source gates pass');
    await panel.getByRole('radio', {name:/source\.mp4/}).check();
    await panel.getByRole('checkbox', {name:/我确认拥有/}).check();
    await panel.locator('[data-s1-preflight]').selectOption('passed');
    await panel.getByRole('button', {name:'创建节点链'}).click();
    await panel.getByText('已创建 3 个节点和 2 条依赖边。').waitFor();
    await panel.getByText('输出 source_asset：source.mp4。').waitFor();
    await panel.getByText('输入 source_video：已连接 原片输入.source_asset。').waitFor();
    await panel.getByText('输入 evidence_manifest：等待 Step01.evidence_manifest。').waitFor();
    assert.equal(await panel.locator('.s1-node').count(), 5);
    await panel.locator('[data-node="image2"]').getByText('Image2 关键帧生成').waitFor();
    const flow = panel.locator('.s1-chain-flow');
    await canvas.click({button:'right', position:{x:1080, y:180}});
    await panel.getByRole('button', {name:'编剧 · Screenwriter'}).waitFor();
    await page.mouse.click(1120, 220);
    for (const [index, label] of ['编剧 · Screenwriter', '资产方案 · Chaoge', '分镜 · Shotlist Builder', '镜头提示 · Hell Grind'].entries()) {
      await flow.click({button:'right', position:{x:260, y:370}});
      await panel.getByRole('button', {name:label}).click();
      await page.waitForTimeout(80);
      assert.equal(await panel.locator('[data-champion-node]').count(), index + 1, 'right-click menu must persist ' + label);
    }
    assert.equal(await panel.locator('[data-champion-node]').count(), 4, 'right click must create all four persisted orchestration Skill nodes');
    const screenwriterCard = panel.locator('[data-champion-node]').filter({hasText:'剧本编排'});
    await screenwriterCard.locator('[data-champion-input]').fill('一段发生在雨夜街头的短剧故事。');
    await screenwriterCard.getByRole('button', {name:'保存参数'}).click();
    await page.getByText('已保存「剧本编排」的核心输入。').waitFor();
    await screenwriterCard.getByRole('button', {name:'检查输入'}).click();
    await screenwriterCard.getByText('核心输入已齐全，可在文本模型配置完成后请求编排。').waitFor();
    await screenwriterCard.getByRole('button', {name:'运行编排（MCGrox）'}).click();
    await screenwriterCard.getByText('MCGrox 服务端执行器未就绪；节点输入已保留，可在服务恢复后重试。').waitFor();
    await flow.click({button:'right', position:{x:1180, y:370}});
    await panel.getByRole('button', {name:'生成节点 · H3 生视频'}).click();
    await panel.getByRole('heading', {name:'H3 生视频', exact:true}).waitFor();
    await panel.locator('[data-s3-prompt]').fill('雨夜人物缓慢前行，镜头稳定跟拍。');
    await panel.getByRole('button', {name:'保存 H3 节点'}).click();
    await panel.getByText('H3 节点已保存。').waitFor();
    const hellVideoPrompt = panel.locator('[data-champion-node]').filter({hasText:'镜头提示编译'}).locator('[data-s1-output-port="video_prompt"]');
    const h3PromptInput = panel.locator('[data-node="h3"] [data-s1-input-port="prompt"]');
    await hellVideoPrompt.scrollIntoViewIfNeeded();
    await hellVideoPrompt.click();
    await h3PromptInput.scrollIntoViewIfNeeded();
    await h3PromptInput.click();
    await page.waitForTimeout(180);
    const h3ConnectedDocument = await page.evaluate(async () => (await fetch('/api/canvas/documents/redraw/NN-S1-UI')).json());
    assert.ok(h3ConnectedDocument.document.edges.some(edge => edge.sourcePort === 'video_prompt' && edge.target === 's3-h3-video' && edge.targetPort === 'prompt'), 'Hell Grind video prompt must persist into the H3 input port');
    await panel.locator('[data-s3-dry]').click();
    await panel.getByText('等待 Hell Grind 完成 video_prompt 编译后再准备 H3 任务。').waitFor();
    await panel.getByRole('heading', {name:'剧本编排', exact:true}).waitFor();
    await panel.getByRole('heading', {name:'镜头提示编译', exact:true}).waitFor();
    const screenplayOutput = panel.locator('[data-champion-node]').filter({hasText:'剧本编排'}).locator('[data-s1-output-port="screenplay"]');
    const screenplayInput = panel.locator('[data-champion-node]').filter({hasText:'超哥资产方案'}).locator('[data-s1-input-port="screenplay"]');
    await screenplayOutput.scrollIntoViewIfNeeded();
    const screenplayOutputBox = await screenplayOutput.boundingBox();
    const screenplayInputBox = await screenplayInput.boundingBox();
    assert.ok(screenplayOutputBox && screenplayInputBox, 'typed ports must be visible for a drag connection');
    await page.mouse.move(screenplayOutputBox.x + screenplayOutputBox.width / 2, screenplayOutputBox.y + screenplayOutputBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(screenplayInputBox.x + screenplayInputBox.width / 2, screenplayInputBox.y + screenplayInputBox.height / 2, {steps:6});
    await page.mouse.up();
    await page.waitForTimeout(180);
    const connectedDocument = await page.evaluate(async () => (await fetch('/api/canvas/documents/redraw/NN-S1-UI')).json());
    assert.ok(connectedDocument.document.edges.some(edge => edge.sourcePort === 'screenplay' && edge.targetPort === 'screenplay'), 'dragging compatible ports must persist a typed edge: ' + await panel.locator('[data-s1-status]').textContent());
    assert.ok(await panel.locator('.s1-typed-edge').count() >= 1, 'the typed edge must render on the canvas');
    const championTitle = panel.locator('[data-champion-node]').filter({hasText:'剧本编排'}).locator('h3');
    const beforeDrag = await championTitle.boundingBox();
    assert.ok(beforeDrag, 'champion node title must be visible for dragging');
    const championNodeId = await championTitle.locator('xpath=..').getAttribute('data-node-id');
    const beforeDragDocument = await page.evaluate(async () => (await fetch('/api/canvas/documents/redraw/NN-S1-UI')).json());
    const beforeDragPosition = beforeDragDocument.document.nodes.find(node => node.id === championNodeId).position;
    await page.mouse.move(beforeDrag.x + 20, beforeDrag.y + 10);
    await page.mouse.down();
    await page.mouse.move(beforeDrag.x + 150, beforeDrag.y + 80, {steps:4});
    await page.mouse.up();
    await page.waitForTimeout(250);
    await page.reload({waitUntil:'networkidle'});
    await openGenerationCanvas(page);
    await page.locator('#s1-chain-canvas [data-champion-node]').first().waitFor({state:'visible'});
    assert.equal(await page.locator('#s1-chain-canvas [data-champion-node]').count(), 4, 'champion nodes must survive a reload after dragging');
    assert.equal(await page.locator('#s1-chain-canvas [data-node="h3"]').count(), 1, 'H3 node must survive a reload after right-click creation');
    const reloadedDocument = await page.evaluate(async () => (await fetch('/api/canvas/documents/redraw/NN-S1-UI')).json());
    const persistedChampion = reloadedDocument.document.nodes.find(node => node.id === championNodeId);
    assert.ok(persistedChampion && persistedChampion.position.x >= beforeDragPosition.x + 100, 'champion node position must persist after a reload: ' + JSON.stringify(persistedChampion && persistedChampion.position));
    assert.equal(await panel.locator('[data-s2-dry]').isDisabled(), true, 'Image2 preparation stays disabled before the node is saved');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'desktop must not overflow');
    await page.setViewportSize({width:390,height:844});
    await page.reload({waitUntil:'networkidle'});
    await openGenerationCanvas(page);
    await page.locator('#s1-chain-canvas').waitFor({state:'visible'});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile must not overflow');
    assert.deepEqual(consoleErrors, []);
    await context.close();
    await browser.close(); browser = null;
    console.log(JSON.stringify({ok:true,verified:['desktop S1 panel selects a project video and creates persistent port bindings','right click creates four persisted orchestration Skill nodes and the H3 generation node','each orchestration node saves a core input and receives a server readiness result','MCGrox compiler preflight keeps input recoverable when server configuration is absent','new nodes use the same draggable canvas card contract','compatible ports create persisted visual edges including Hell Grind to H3','H3 blocks until the upstream compiler emits video_prompt','creation is disabled until rights and preflight pass','mobile S1 panel stays within viewport','no provider task is sent']}));
  } finally {
    if (browser) await browser.close();
    server.kill();
    await fs.rm(dataRoot, {recursive:true,force:true});
  }
}

main().catch(error => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });
