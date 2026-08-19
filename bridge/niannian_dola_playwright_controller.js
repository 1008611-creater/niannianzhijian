'use strict';

const { chromium } = require('playwright');

const DEFAULT_CDP = 'http://127.0.0.1:9230';

function controllerError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

async function connect(endpoint = process.env.NIANNIAN_DOLA_CDP_ENDPOINT || DEFAULT_CDP) {
  const proxyKeys = ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'];
  const previous = Object.fromEntries(proxyKeys.map(key => [key, process.env[key]]));
  try {
    for (const key of proxyKeys) delete process.env[key];
    process.env.NO_PROXY = '127.0.0.1,localhost,::1';
    process.env.no_proxy = process.env.NO_PROXY;
    return await chromium.connectOverCDP(endpoint);
  } catch { throw controllerError('DOLA_PLAYWRIGHT_CONNECT_FAILED', '无法连接 Dola 浏览器会话'); }
  finally {
    for (const key of proxyKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

async function videoPage(browser) {
  const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes('dola.com'));
  if (!page) throw controllerError('DOLA_PLAYWRIGHT_PAGE_MISSING', '未找到 Dola 页面');
  const initialText = await page.locator('body').innerText().catch(() => '');
  const alreadyVideoComposer = /视频生成|Seedance 2\.5 使用 30 秒|\b30s\b/.test(initialText);
  if (!page.url().includes('/chat/create-video') && !alreadyVideoComposer) {
    await page.goto('https://www.dola.com/chat/create-video', {waitUntil:'domcontentloaded'}).catch(error => {
      if (!page.url().includes('dola.com')) throw error;
    });
  }
  const currentText = await page.locator('body').innerText().catch(() => '');
  if (currentText.includes('受区域限制') || currentText.includes('无法使用 Dola')) {
    throw controllerError('DOLA_REGION_RESTRICTED', 'Dola 当前会话受区域限制，无法进入视频创作页');
  }
  const videoTab = page.getByText('视频', {exact:true}).first();
  const videoSelected = await videoTab.getAttribute('aria-selected').catch(() => null);
  if (videoSelected !== 'true') {
    if (await videoTab.count()) await videoTab.click();
    await page.waitForTimeout(800);
  }
  try {
    const seedanceLabel = page.getByText('Seedance 2.5 使用 30 秒', {exact:false}).first();
    const pageText = await page.locator('body').innerText().catch(() => '');
    if (!pageText.includes('Seedance 2.5 使用 30 秒')) await seedanceLabel.waitFor({state:'visible', timeout:30000});
    const editor = page.locator('[contenteditable=true]').first();
    if (await editor.count() && !(await editor.isVisible().catch(() => false))) {
      await editor.waitFor({state:'visible', timeout:10000});
    }
  } catch {
    throw controllerError('DOLA_PLAYWRIGHT_PAGE_NOT_READY', 'Dola 视频页面尚未完成加载');
  }
  return page;
}

async function ensureDurationAndRatio(page, options = {}) {
  const modelButton = page.locator('button').filter({hasText:/^模型/}).first();
  if (await modelButton.count() && !(await modelButton.innerText()).includes('2.5')) {
    await modelButton.click();
    const model = page.getByText('Dreamina Seedance 2.5', {exact:false}).first();
    if (!await model.count()) throw controllerError('DOLA_PLAYWRIGHT_MODEL_MISSING', '未找到 Dreamina Seedance 2.5 模型');
    await model.click();
  }
  const anyDuration = page.locator('button[data-input-engine-actionbar-control-key="video-duration"], button').filter({hasText:/^\s*(?:\d+s|\d+ 秒)\s*$/}).first();
  if (!await anyDuration.count()) throw controllerError('DOLA_PLAYWRIGHT_DURATION_MISSING', '未找到时长控件');
  if ((await anyDuration.innerText()).trim() !== '30s') {
    await anyDuration.click();
    await page.waitForTimeout(500);
    const thirtyOptions = page.getByText(/30s|30 秒/, {exact:false});
    let thirty = null;
    for (let i = await thirtyOptions.count() - 1; i >= 0; i -= 1) {
      if (await thirtyOptions.nth(i).isVisible().catch(() => false)) { thirty = thirtyOptions.nth(i); break; }
    }
    if (!thirty) throw controllerError('DOLA_PLAYWRIGHT_DURATION_MISSING', '未找到 30s 时长选项');
    await thirty.click();
  }
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
  const fileInputs = page.locator('input[type=file].intl-material-file, input[type=file][accept*="video/mp4"]');
  const groups = { image:[], video:[], audio:[] };
  for (const asset of assets) {
    const kind = String(asset.kind || '').toLowerCase();
    const target = kind.includes('audio') ? 'audio' : kind.includes('video') ? 'video' : 'image';
    groups[target].push(asset.path || asset.storedPath || asset);
  }
  if (await fileInputs.count() && Object.values(groups).some(list => list.length)) {
    await fileInputs.first().setInputFiles([...groups.image, ...groups.video, ...groups.audio]);
    await page.waitForTimeout(300);
  }
  return {browser, page, prepared:true, pageUrl:page.url(), body:await body(), counts:Object.fromEntries(Object.entries(groups).map(([kind,list]) => [kind,list.length]))};
}

async function submit(options = {}) {
  const browser = options.browser || await connect(options.endpoint);
  const page = options.page || await videoPage(browser);
  await ensureDurationAndRatio(page, options);
  const send = page.locator('#flow-end-msg-send, button[type=submit], button[data-testid*="send" i], [role=button][aria-label*="发送"], [role=button][aria-label*="生成"]').first();
  if (!await send.count()) throw controllerError('DOLA_PLAYWRIGHT_SUBMIT_CONTROL_MISSING', '未找到 Dola 视频生成按钮');
  if (await send.isDisabled()) throw controllerError('DOLA_PLAYWRIGHT_SUBMIT_DISABLED', 'Dola 视频生成按钮当前不可用');
  const quotaPattern = /本次使用[\s\S]{0,120}(?:额度|视频生成额度)|将消耗[\s\S]{0,80}(?:额度|视频生成额度)/;
  const waitForQuota = async (timeout = 8000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const text = await page.locator('body').innerText().catch(() => '');
      if (quotaPattern.test(text)) return true;
      await page.waitForTimeout(500);
    }
    return false;
  };
  await send.click();
  let quotaConfirmed = await waitForQuota();
  let retried = false;
  if (!quotaConfirmed) {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (/不可用生成模型|无法直接生成|模型.*不支持/.test(bodyText)) {
      await send.waitFor({state:'visible', timeout:15000}).catch(() => {});
      if (!(await send.isDisabled().catch(() => true))) {
        await send.click();
        retried = true;
        quotaConfirmed = await waitForQuota(10000);
      }
    }
  }
  return {browser, page, submitted:true, pageUrl:page.url(), quotaConfirmed, retried};
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
