'use strict';

const { chromium } = require('playwright');

const DEFAULT_CDP = 'http://127.0.0.1:9229';

function controllerError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

async function connect(endpoint = process.env.NIANNIAN_DOLA_CDP_ENDPOINT || DEFAULT_CDP) {
  try { return await chromium.connectOverCDP(endpoint); }
  catch { throw controllerError('DOLA_PLAYWRIGHT_CONNECT_FAILED', '无法连接 Dola 浏览器会话'); }
}

async function videoPage(browser) {
  const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes('dola.com'));
  if (!page) throw controllerError('DOLA_PLAYWRIGHT_PAGE_MISSING', '未找到 Dola 页面');
  if (!page.url().includes('/chat/create-video')) await page.goto('https://www.dola.com/chat/create-video', {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(500);
  return page;
}

async function preflight(options = {}) {
  const browser = await connect(options.endpoint);
  const page = await videoPage(browser);
  return {
    ready: true,
    pageUrl: page.url(),
    fileInputs: await page.locator('input[type=file]').count(),
    editableAreas: await page.locator('[contenteditable=true]').count(),
    seedance25: (await page.locator('body').innerText()).includes('Seedance 2.5 使用 30 秒'),
    browser
  };
}

async function prepare(options = {}) {
  const browser = await connect(options.endpoint);
  const page = await videoPage(browser);
  const body = () => page.locator('body').innerText();
  const editable = page.locator('[contenteditable=true]').first();
  if (options.prompt && await editable.count()) await editable.fill(String(options.prompt));
  const duration = page.getByText('Seedance 2.5 使用 30 秒', {exact:false}).first();
  if (await duration.count()) await duration.click();
  if (options.aspectRatio) {
    const ratio = page.getByText(String(options.aspectRatio), {exact:true}).first();
    if (await ratio.count()) await ratio.click();
  }
  const assets = Array.isArray(options.assets) ? options.assets.filter(Boolean) : [];
  const fileInputs = page.locator('input[type=file]');
  const groups = { image:[], video:[], audio:[] };
  for (const asset of assets) {
    const kind = String(asset.kind || '').toLowerCase();
    const target = kind.includes('audio') ? 'audio' : kind.includes('video') ? 'video' : 'image';
    groups[target].push(asset.path || asset.storedPath || asset);
  }
  if (await fileInputs.count()) {
    const inputCount = await fileInputs.count();
    const assignments = [groups.image, groups.video, groups.audio];
    for (let i = 0; i < Math.min(inputCount, assignments.length); i++) {
      if (assignments[i].length) await fileInputs.nth(i).setInputFiles(assignments[i]);
    }
  }
  return {browser, page, prepared:true, pageUrl:page.url(), body:await body()};
}

module.exports = { DEFAULT_CDP, connect, videoPage, preflight, prepare };
