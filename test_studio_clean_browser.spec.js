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
  throw new Error(`Studio test server did not start: ${lastError?.message || serverOutput.slice(-1000)}`);
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
      NIANNIAN_TEXT_API_KEY: '',
      NIANNIAN_TEXT_PROVIDER_SUBMIT: 'off',
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
