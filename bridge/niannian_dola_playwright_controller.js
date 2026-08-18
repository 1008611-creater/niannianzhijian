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
  try {
    await page.locator('[contenteditable=true]').first().waitFor({state:'visible', timeout:15000});
    await page.getByText('Seedance 2.5 使用 30 秒', {exact:false}).first().waitFor({state:'visible', timeout:15000});
  } catch {
    throw controllerError('DOLA_PLAYWRIGHT_PAGE_NOT_READY', 'Dola 视频页面尚未完成加载');
  }
  return page;
}

async function ensureDurationAndRatio(page, options = {}) {
  const duration = page.getByText('Seedance 2.5 使用 30 秒', {exact:false}).first();
  if (await duration.count()) await duration.click();
  if (options.aspectRatio) {
    const ratioButton = page.getByText('比例', {exact:true}).first();
    if (await ratioButton.count()) await ratioButton.click();
    const ratio = page.getByText(String(options.aspectRatio), {exact:true}).first();
    if (await ratio.count()) await ratio.click();
  }
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
  await ensureDurationAndRatio(page, options);
  const assets = Array.isArray(options.assets) ? options.assets.filter(Boolean) : [];
  const fileInputs = page.locator('input[type=file][accept*="video/mp4"]');
  const groups = { image:[], video:[], audio:[] };
  for (const asset of assets) {
    const kind = String(asset.kind || '').toLowerCase();
    const target = kind.includes('audio') ? 'audio' : kind.includes('video') ? 'video' : 'image';
    groups[target].push(asset.path || asset.storedPath || asset);
  }
  if (await fileInputs.count() && Object.values(groups).some(list => list.length)) {
    await fileInputs.first().setInputFiles([...groups.image, ...groups.video, ...groups.audio]);
  }
  return {browser, page, prepared:true, pageUrl:page.url(), body:await body(), counts:Object.fromEntries(Object.entries(groups).map(([kind,list]) => [kind,list.length]))};
}

async function submit(options = {}) {
  const browser = options.browser || await connect(options.endpoint);
  const page = options.page || await videoPage(browser);
  await ensureDurationAndRatio(page, options);
  const send = page.locator('button[type=submit], button[data-testid*="send" i], [role=button][aria-label*="发送"], [role=button][aria-label*="生成"]').first();
  if (!await send.count()) throw controllerError('DOLA_PLAYWRIGHT_SUBMIT_CONTROL_MISSING', '未找到 Dola 视频生成按钮');
  if (await send.isDisabled()) throw controllerError('DOLA_PLAYWRIGHT_SUBMIT_DISABLED', 'Dola 视频生成按钮当前不可用');
  await send.click();
  return {browser, page, submitted:true, pageUrl:page.url()};
}

async function inspectJob(options = {}) {
  const page = options.page || (options.browser && (await videoPage(options.browser)));
  if (!page) throw controllerError('DOLA_PLAYWRIGHT_PAGE_MISSING', '未找到 Dola 页面');
  const text = await page.locator('body').innerText();
  const videos = await page.locator('video').evaluateAll(nodes => nodes.map(node => ({src: node.currentSrc || node.src || '', readyState: node.readyState, duration: Number(node.duration || 0)})));
  const links = await page.locator('a').evaluateAll(nodes => nodes.map(node => ({href: node.href || '', text: (node.textContent || '').trim()})).filter(item => item.href));
  const outputUrl = videos.find(item => item.src)?.src || links.find(item => /\.mp4(?:$|[?#])/i.test(item.href))?.href || '';
  const lower = text.toLowerCase();
  const failed = /失败|错误|failed|error/.test(text) && !outputUrl;
  const completed = Boolean(outputUrl) || /已完成|完成|下载|done|completed/.test(lower);
  return {pageUrl: page.url(), text: text.slice(-12000), videos, links, outputUrl, status: failed ? 'failed' : completed ? 'completed' : 'running'};
}

module.exports = { DEFAULT_CDP, connect, videoPage, preflight, prepare, submit, inspectJob, ensureDurationAndRatio };
