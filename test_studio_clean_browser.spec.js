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

  const loadedModuleUrls = await page.evaluate(() => performance.getEntriesByType('resource')
    .map(entry => entry.name)
    .filter(name => /\/studio\/assets\/(index-M-8MrEH2|NomiStudioApp-DDB0IgSO)-.*\.js/.test(name)));
  expect(loadedModuleUrls.some(url => url.includes('r27'))).toBe(false);
  expect(loadedModuleUrls.filter(url => /index-M-8MrEH2-r28-19b89ec\.js/.test(url))).toHaveLength(1);
  expect(loadedModuleUrls.filter(url => /NomiStudioApp-DDB0IgSO-r28-19b89ec\.js/.test(url))).toHaveLength(1);
  expect(failures).toEqual([]);

  await context.close();
});
