'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');

const root = __dirname;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(baseUrl + '/api/health')).ok) return; } catch {}
    await pause(100);
  }
  throw new Error('model_catalog_fallback_server_not_ready');
}

async function main() {
  const studioIndex = require('node:fs').readFileSync(root + '/studio/index.html', 'utf8');
  assert.match(studioIndex, /web-runtime-adapter-r4\.js\?v=20260817-generation-spec-r1/);
  const assetsDir = root + '/studio/assets';
  const cacheUsers = require('node:fs').readdirSync(assetsDir).filter(name => name.endsWith('.js')).map(name => require('node:fs').readFileSync(assetsDir + '/' + name, 'utf8')).filter(source => source.includes('modelCatalogCache-C1hWiSJp-r4.js?v=20260817-generation-spec-r1')).join('\n');
  assert.match(cacheUsers, /NomiStudioApp|useDedupedModelSelect|Generation|Creation|Canvas|applyCanvasToolCall/);
  const port = 29200 + crypto.randomInt(500);
  const baseUrl = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {...process.env, PORT: String(port), NIANNIAN_RUNNINGHUB_SUBMIT: 'off'},
    stdio: ['ignore', 'ignore', 'ignore']
  });
  let browser;
  try {
    await waitForHealth(baseUrl);
    browser = await chromium.launch({headless: true});
    const page = await browser.newPage();
    const catalog = {
      catalog: {
        models: [{
          id: 'yunwu-image-4k',
          alias: 'yunwu-image-4k',
          label: '云雾 4K',
          kind: 'image',
          providerKey: 'yunwu-image',
          providerLabel: '云雾',
          enabled: true,
          priceCredits: 4,
          resolutions: ['4096x4096'],
          aspectRatios: ['1:1'],
          outputSizes: {'4096x4096': '4096x4096'}
        }, {
          id: 'minimax-h3',
          alias: 'minimax-h3',
          label: 'H3 生视频',
          kind: 'video',
          providerKey: 'runninghub-consumer',
          providerLabel: 'RunningHub',
          enabled: true,
          priceCredits: 20,
          resolutions: ['2k'],
          aspectRatios: ['9:16', '16:9', '1:1']
        }, {
          id: 'dola-seedance-2-5',
          alias: 'dola-seedance-2-5',
          label: 'Dola Seedance 2.5（30秒）',
          kind: 'video',
          providerKey: 'dola-desktop-api',
          providerLabel: 'Dola',
          enabled: true,
          priceCredits: 0,
          resolutions: ['720p'],
          aspectRatios: ['9:16', '16:9', '1:1', '4:3', '3:4']
        }]
      }
    };
    await page.route('**/api/canvas/model-catalog', route => route.fulfill({json: catalog}));
    await page.goto(baseUrl + '/studio/index.html', {waitUntil: 'domcontentloaded'});
    const result = await page.evaluate(async () => {
      const fallback = await import('/studio/assets/modelCatalogWebFallback-r4.js');
      return {
        models: await fallback.webCatalogModels('image'),
        videoModels: await fallback.webCatalogModels('video'),
        health: await fallback.webCatalogHealth(),
        vendors: await fallback.webCatalogVendors()
      };
    });
    assert.deepEqual(result.models.map(model => model.modelKey), ['yunwu-image-4k']);
    assert.equal(result.models[0].pricing.cost, 4);
    assert.deepEqual(result.models[0].meta.imageOptions.aspectRatioOptions, [{value: '1:1', label: '1:1'}]);
    assert.deepEqual(result.models[0].meta.imageOptions.imageSizeOptions, [{value: '4096x4096', label: '4096x4096（4096X4096）'}]);
    assert.deepEqual(result.models[0].meta.imageOptions.resolutionOptions, [{value: '4096x4096', label: '4096X4096'}]);
    assert.deepEqual(result.videoModels[0].meta.videoOptions.sizeOptions, [
      {value: '9:16', label: '9:16'},
      {value: '16:9', label: '16:9'},
      {value: '1:1', label: '1:1'}
    ]);
    assert.deepEqual(result.videoModels[0].meta.videoOptions.resolutionOptions, [{value: '2k', label: '2K'}]);
    assert.deepEqual(result.videoModels[1].meta.videoOptions.sizeOptions, [
      {value: '9:16', label: '9:16'},
      {value: '16:9', label: '16:9'},
      {value: '1:1', label: '1:1'},
      {value: '4:3', label: '4:3'},
      {value: '3:4', label: '3:4'}
    ]);
    assert.deepEqual(result.videoModels[1].meta.videoOptions.resolutionOptions, [{value: '720p', label: '720P'}]);
    assert.equal(result.health.byKind.find(item => item.kind === 'image').enabledModels, 1);
    assert.deepEqual(result.vendors, [
      {key: 'yunwu-image', name: '云雾', enabled: true, authType: 'none', hasApiKey: true},
      {key: 'runninghub-consumer', name: 'RunningHub', enabled: true, authType: 'none', hasApiKey: true},
      {key: 'dola-desktop-api', name: 'Dola', enabled: true, authType: 'none', hasApiKey: true}
    ]);
    console.log('MODEL_CATALOG_WEB_FALLBACK_BROWSER_OK');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch(error => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });
