'use strict';

const {test, expect} = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

let server;
let dataDir;
let baseUrl;

test.beforeAll(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-grouping-e2e-'));
  const port = 22000 + Math.floor(Math.random() * 500);
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: {...process.env, DATA_DIR: dataDir, PORT: String(port), NIANNIAN_TEXT_API_KEY: 'test-ready-text-provider-key', NIANNIAN_TEXT_MODEL: 'gpt-5.6-luna'},
    stdio: ['ignore', 'pipe', 'pipe']
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(baseUrl + '/api/health')).ok) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
});

test.afterAll(async () => {
  if (server && server.exitCode === null) server.kill();
  if (dataDir) await fs.rm(dataDir, {recursive: true, force: true});
});

test('batch grouping can target a default category subgroup and persists it', async ({browser}) => {
  const registration = await fetch(baseUrl + '/api/auth/register', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({email: `grouping-${Date.now()}@example.test`, password: 'test-password-123'})
  });
  expect(registration.ok).toBe(true);
  const session = registration.headers.get('set-cookie').split(';')[0].split('=')[1];
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  await context.addCookies([{name: 'niannian_session', value: session, url: baseUrl}]);
  const page = await context.newPage();
  await page.goto(baseUrl + '/studio/', {waitUntil: 'networkidle'});
  await page.getByRole('button', {name: /新建空白项目/}).click();
  await page.getByRole('button', {name: '生成', exact: true}).click();
  await page.getByRole('button', {name: '念念 AI 生成'}).click();
  await page.getByRole('button', {name: '分组', exact: true}).click();
  await page.getByText('新建画面', {exact: false}).first().click();

  const cast = page.locator('button[data-category-id="cast"]');
  await cast.click({button: 'right'});
  await page.getByRole('menuitem', {name: '新建子组', exact: true}).click();
  await page.getByRole('textbox', {name: '子组名称'}).fill('测试子组');
  await page.getByRole('textbox', {name: '子组名称'}).press('Enter');

  await page.locator('button[data-node-id]').first().click();
  await page.getByRole('button', {name: /批量归组/}).click();
  const prompt = page.getByRole('dialog').getByRole('textbox');
  await prompt.fill('角色/测试子组');
  await prompt.press('Enter');
  await expect(page.getByText('测试子组', {exact: true}).first()).toBeVisible();
  await expect(page.getByText('测试子组', {exact: true}).locator('..').getByText('1', {exact: true})).toBeVisible();
  await page.reload({waitUntil: 'networkidle'});
  await page.getByRole('button', {name: '分组', exact: true}).click();
  await page.locator('button[data-category-id="cast"]').click();
  await expect(page.getByText('测试子组', {exact: true}).first()).toBeVisible();

  await page.locator('button[data-node-id]').first().click();
  await page.getByRole('button', {name: /批量归组/}).click();
  const defaultPrompt = page.getByRole('dialog').getByRole('textbox');
  await defaultPrompt.fill('场景');
  await defaultPrompt.press('Enter');
  await expect(page.locator('button[data-category-id="scene"]')).toContainText('1');

  await context.close();
});
