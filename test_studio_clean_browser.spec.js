'use strict';

const {test, expect} = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

let server;
let dataDir;
let baseUrl;
let serverOutput = '';
let sessionToken;

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(baseUrl + '/api/health');
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Studio test server did not start: ${lastError?.message || 'health check failed'}\n${serverOutput.slice(-2000)}`);
}

test.beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-studio-e2e-'));
  const port = 21000 + Math.floor(Math.random() * 1000);
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(port),
      NIANNIAN_TEXT_API_KEY: 'test-ready-text-provider-key',
      NIANNIAN_TEXT_MODEL: 'gpt-5.6-luna',
      NIANNIAN_TEXT_PROVIDER_SUBMIT: 'on',
      NIANNIAN_RUNNINGHUB_SUBMIT: 'off'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', chunk => { serverOutput += chunk.toString('utf8'); });
  server.stderr.on('data', chunk => { serverOutput += chunk.toString('utf8'); });
  await waitForServer();
  const registration = await fetch(baseUrl + '/api/auth/register', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({email: 'studio-e2e@example.test', password: 'test-password-123'})
  });
  expect(registration.ok).toBe(true);
  sessionToken = registration.headers.get('set-cookie').split(';')[0].split('=')[1];
});

test.afterAll(async () => {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise(resolve => server.once('exit', resolve));
  }
  if (dataDir) await fs.rm(dataDir, {recursive: true, force: true});
});

test('Studio loads from a clean browser with one canonical module graph', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  await context.addCookies([{name: 'niannian_session', value: sessionToken, url: baseUrl}]);
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') failures.push(message.text());
  });

  const response = await page.goto(baseUrl + '/studio/', {waitUntil: 'networkidle'});
  expect(response?.ok()).toBe(true);
  await expect(page.locator('#root')).not.toBeEmpty();
  const skipIntro = page.getByRole('button', {name: /跳过/});
  if (await skipIntro.isVisible({timeout: 2000}).catch(() => false)) await skipIntro.click();
  const newProject = page.getByRole('button', {name: /新建空白项目/});
  await expect(newProject).toBeVisible();
  await newProject.click();
  await expect(page.getByRole('banner', {name: '念念 AI 工作台'})).toBeVisible();
  await expect(page.getByRole('button', {name: /未命名项目/})).toBeVisible();
  await page.getByRole('button', {name: '生成'}).click();
  await page.getByRole('button', {name: '念念 AI 生成'}).click();
  await expect(page.getByText('AI 助手入口加载失败')).toHaveCount(0);
  await expect(page.getByRole('complementary', {name: '生成区 AI 侧栏'})).toBeVisible();

  const loadedModuleUrls = await page.evaluate(() => performance.getEntriesByType('resource')
    .map(entry => entry.name)
    .filter(name => /\/studio\/assets\/(index-M-8MrEH2|NomiStudioApp-DDB0IgSO)-.*\.js/.test(name)));
  expect(loadedModuleUrls.some(url => url.includes('r27'))).toBe(false);
  expect(loadedModuleUrls.filter(url => /index-M-8MrEH2-r28-19b89ec-r4\.js/.test(url))).toHaveLength(1);
  expect(loadedModuleUrls.filter(url => /NomiStudioApp-DDB0IgSO-r28-19b89ec-r4\.js/.test(url))).toHaveLength(1);
  expect(failures).toEqual([]);

  await context.close();
});

test('Studio project library reads a ready server text model', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  await context.addCookies([{name: 'niannian_session', value: sessionToken, url: baseUrl}]);
  const page = await context.newPage();

  await page.goto(baseUrl + '/studio/', {waitUntil: 'networkidle'});
  await expect(page.getByRole('button', {name: /新建空白项目/})).toBeVisible();
  await expect(page.locator('[data-model-banner]')).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => window.nomiDesktop?.modelCatalog
    ?.listModels({kind: 'text'})
    .some(model => model.modelKey === 'gpt-5.6-luna') === true)).toBe(true);

  await context.close();
});

test('Studio project library keeps text readiness readable on mobile', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 390, height: 844}});
  await context.addCookies([{name: 'niannian_session', value: sessionToken, url: baseUrl}]);
  const page = await context.newPage();

  await page.goto(baseUrl + '/studio/', {waitUntil: 'networkidle'});
  await expect(page.getByRole('button', {name: /新建空白项目/})).toBeVisible();
  await expect(page.locator('[data-model-banner]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await context.close();
});

test('Project library renders only the workbench back control', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  await context.addCookies([{name: 'niannian_session', value: sessionToken, url: baseUrl}]);
  const page = await context.newPage();

  await page.goto(baseUrl + '/studio/#/studio', {waitUntil: 'networkidle'});
  await expect(page.locator('#s1-library-workbench-back')).toBeVisible();
  await expect(page.locator('#s1-chain-back')).toHaveCount(0);

  await context.close();
});

test('Canvas node save survives a refresh without a false concurrent-edit warning', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  await context.addCookies([{name: 'niannian_session', value: sessionToken, url: baseUrl}]);
  const page = await context.newPage();
  const canvasSaveStatuses = [];
  const failures = [];

  page.on('response', response => {
    const request = response.request();
    if (request.method() === 'PUT' && /\/api\/projects\/[^/]+\/canvas$/.test(new URL(response.url()).pathname)) {
      canvasSaveStatuses.push(response.status());
    }
  });
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') failures.push(message.text());
  });

  await page.goto(baseUrl + '/studio/', {waitUntil: 'networkidle'});
  await page.getByRole('button', {name: /新建空白项目/}).click();
  await page.getByRole('button', {name: '生成'}).click();
  await page.getByRole('button', {name: '添加文本节点'}).click();
  await expect(page.getByLabel('拖动文本节点')).toBeVisible();
  await page.waitForTimeout(800);

  await expect(page.getByText('画布已在其他页面更新，请先重新载入。')).toHaveCount(0);
  expect(canvasSaveStatuses).not.toContain(409);

  await page.reload({waitUntil: 'networkidle'});
  await expect(page.getByLabel('拖动文本节点')).toBeVisible();
  await expect(page.getByText('画布已在其他页面更新，请先重新载入。')).toHaveCount(0);
  expect(failures).toEqual([]);

  await context.close();
});

test('Project library renames a project and persists a custom cover', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  await context.addCookies([{name: 'niannian_session', value: sessionToken, url: baseUrl}]);
  const page = await context.newPage();

  await page.goto(baseUrl + '/studio/', {waitUntil: 'networkidle'});
  await page.getByRole('button', {name: /新建空白项目/}).click();
  await page.waitForTimeout(500);
  const projectId = await page.evaluate(() => window.nomiDesktop.projects.list()[0]?.id || null);
  expect(projectId).toMatch(/^NN-/);

  await page.goto(baseUrl + '/studio/', {waitUntil: 'networkidle'});
  const card = page.locator('[data-project-card=true]').first();
  await expect(card).toBeVisible();
  await card.locator('[data-project-edit]').click();
  await expect(page.getByRole('heading', {name: '编辑项目'})).toBeVisible();
  await page.locator('input[name=projectName]').fill('验收项目封面');
  await page.getByRole('radio', {name: '自定义封面'}).check();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  await page.locator('input[name=coverFile]').setInputFiles({name: 'cover.png', mimeType: 'image/png', buffer: png});
  await page.getByRole('button', {name: '保存'}).click();

  await expect(page.locator('[data-project-card=true]').filter({hasText: '验收项目封面'})).toHaveCount(1);
  await expect(page.locator('[data-project-card=true]').filter({hasText: '验收项目封面'}).locator('img')).toHaveAttribute('src', new RegExp('/api/projects/' + projectId + '/assets/'));
  await page.reload({waitUntil: 'networkidle'});
  const refreshed = page.locator('[data-project-card=true]').filter({hasText: '验收项目封面'});
  await expect(refreshed).toHaveCount(1);
  await expect(refreshed.locator('img')).toHaveAttribute('src', new RegExp('/api/projects/' + projectId + '/assets/'));

  await context.close();
});

test('Project route gate prevents the library flash while the canvas hydrates', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  await context.addCookies([{name: 'niannian_session', value: sessionToken, url: baseUrl}]);
  const page = await context.newPage();

  await page.goto(baseUrl + '/studio/', {waitUntil: 'networkidle'});
  await page.getByRole('button', {name: /新建空白项目/}).click();
  await page.waitForTimeout(500);
  const projectId = await page.evaluate(() => window.nomiDesktop.projects.list()[0]?.id || null);
  expect(projectId).toMatch(/^NN-/);

  await page.goto(baseUrl + '/studio/#/studio?projectId=' + encodeURIComponent(projectId), {waitUntil: 'commit'});
  expect(await page.evaluate(() => document.documentElement.classList.contains('nomi-project-route-pending'))).toBe(true);
  await expect(page.locator('.nomi-studio-app')).toBeVisible({timeout: 15000});
  expect(await page.locator('.nomi-library-page').count()).toBe(0);

  await context.close();
});
