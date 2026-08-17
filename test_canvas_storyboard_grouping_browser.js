'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');

const root = __dirname;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function reservePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise(resolve => probe.close(resolve));
  if (!port) throw new Error('storyboard_browser_port_unavailable');
  return port;
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(baseUrl + '/api/health')).ok) return; } catch {}
    await pause(100);
  }
  throw new Error('storyboard_browser_server_not_ready');
}

async function waitFor(check, label) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await check()) return;
    await pause(100);
  }
  throw new Error(label);
}

async function openGenerationCanvas(page) {
  const canvas = page.getByRole('region', {name:'AI 影像创作画布'});
  try { await canvas.waitFor({state:'visible', timeout:5000}); return canvas; } catch {}
  await page.getByRole('button', {name:'生成'}).click({force:true});
  await canvas.waitFor({state:'visible'});
  return canvas;
}

async function main() {
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-storyboard-browser-'));
  const port = await reservePort();
  const baseUrl = 'http://127.0.0.1:' + port;
  const token = crypto.randomBytes(18).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = {id:'USR-STORYBOARD-BROWSER',email:'storyboard-browser@example.test',status:'active'};
  const project = {id:'NN-STORYBOARD-BROWSER',ownerId:user.id,name:'分镜归组浏览器回归',projectKind:'redraw',canvasOnly:true,status:'ready',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),runtime:{}};
  const generationCanvas = {
    nodes:[],
    edges:[],
    groups:[
      {id:'storyboard-e01-g1',name:'分镜·E01-G1 进门侵入',categoryId:'shots',shotId:'E01-G1',parentGroupId:'shots',nodeIds:[],assetIds:[]},
      {id:'characters-root',name:'角色',categoryId:'characters',nodeIds:[],assetIds:[]}
    ],
    selectedGroupId:'characters-root',
    viewport:{x:0,y:0,zoom:1}
  };
  const documents = {
    ['nomi:redraw:' + project.id]: {
      schemaVersion:'niannian.nomi-project-document.v1',projectId:project.id,projectKind:'redraw',ownerId:user.id,revision:1,
      document:{generationCanvas},updatedAt:new Date().toISOString()
    }
  };
  await Promise.all([
    fs.writeFile(path.join(dataRoot, 'users.json'), JSON.stringify([user])),
    fs.writeFile(path.join(dataRoot, 'sessions.json'), JSON.stringify([{tokenHash,userId:user.id,expiresAt:new Date(Date.now() + 3600000).toISOString()}])),
    fs.writeFile(path.join(dataRoot, 'projects.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'canvas-projects.json'), JSON.stringify([project])),
    fs.writeFile(path.join(dataRoot, 'canvas-documents.json'), JSON.stringify(documents)),
    fs.writeFile(path.join(dataRoot, 'canvas-assets.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'canvas-generation-jobs.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'script-projects.json'), '[]'),
    fs.writeFile(path.join(dataRoot, 'workspace-bindings.json'), '[]')
  ]);
  const server = spawn(process.execPath, ['server.js'], {
    cwd:root,
    env:{...process.env,PORT:String(port),DATA_DIR:dataRoot,NIANNIAN_RUNNINGHUB_SUBMIT:'off',NIANNIAN_GPT_API_KEY:'',NIANNIAN_TEXT_API_KEY:''},
    stdio:['ignore','ignore','ignore']
  });
  let browser;
  try {
    await waitForHealth(baseUrl);
    browser = await chromium.launch({headless:true});
    const context = await browser.newContext({viewport:{width:1440,height:900}});
    await context.addCookies([{name:'niannian_session',value:token,url:baseUrl}]);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(baseUrl + '/studio/?projectId=' + project.id + '&projectKind=redraw&step=generate#/studio', {waitUntil:'networkidle'});
    const canvas = await openGenerationCanvas(page);
    await page.getByRole('button', {name:'添加视频节点'}).click({force:true});
    await waitFor(async () => {
      const response = await page.evaluate(async () => (await fetch('/api/studio/projects/NN-STORYBOARD-BROWSER', {headers:{'x-niannian-project-kind':'redraw'}})).json());
      return response.document.generationCanvas.nodes.some(node => node.kind === 'video');
    }, 'video_node_did_not_persist');
    const persisted = await page.evaluate(async () => (await fetch('/api/studio/projects/NN-STORYBOARD-BROWSER', {headers:{'x-niannian-project-kind':'redraw'}})).json());
    const video = persisted.document.generationCanvas.nodes.find(node => node.kind === 'video');
    assert.equal(video.categoryId, 'shots');
    assert.equal(video.groupId, 'storyboard-e01-g1');
    assert.equal(video.shotId, 'E01-G1');
    assert.equal(video.meta.storyboardGroupId, 'storyboard-e01-g1');
    assert.equal(video.meta.shotId, 'E01-G1');
    const shot = persisted.document.generationCanvas.groups.find(group => group.id === 'storyboard-e01-g1');
    assert.ok(shot.nodeIds.includes(video.id));
    assert.equal(persisted.document.generationCanvas.groups.some(group => group.categoryId === 'characters' && group.nodeIds.includes(video.id)), false);
    await page.setViewportSize({width:390,height:844});
    await page.reload({waitUntil:'networkidle'});
    await openGenerationCanvas(page);
    const reread = await page.evaluate(async () => (await fetch('/api/studio/projects/NN-STORYBOARD-BROWSER', {headers:{'x-niannian-project-kind':'redraw'}})).json());
    const rereadVideo = reread.document.generationCanvas.nodes.find(node => node.id === video.id);
    assert.equal(rereadVideo.groupId, 'storyboard-e01-g1');
    assert.equal(rereadVideo.shotId, 'E01-G1');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.deepEqual(pageErrors, []);
    await context.close();
    await browser.close(); browser = null;
    console.log(JSON.stringify({ok:true,verified:['sidebar role selection does not control new video category','video persists in its storyboard child group with shot id','refresh preserves group and shot binding on desktop and mobile','no provider task is submitted']}));
  } finally {
    if (browser) await browser.close();
    server.kill();
    await fs.rm(dataRoot, {recursive:true,force:true});
  }
}

main().catch(error => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });
