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
          aspectRatios: ['1:1']
        }]
      }
    };
    await page.route('**/api/canvas/model-catalog', route => route.fulfill({json: catalog}));
    await page.goto(baseUrl + '/studio/index.html', {waitUntil: 'domcontentloaded'});
    const result = await page.evaluate(async () => {
      const fallback = await import('/studio/assets/modelCatalogWebFallback-r4.js');
      return {
        models: await fallback.webCatalogModels('image'),
        health: await fallback.webCatalogHealth(),
        vendors: await fallback.webCatalogVendors()
      };
    });
    assert.deepEqual(result.models.map(model => model.modelKey), ['yunwu-image-4k']);
    assert.equal(result.models[0].pricing.cost, 4);
    assert.equal(result.health.byKind.find(item => item.kind === 'image').enabledModels, 1);
    assert.deepEqual(result.vendors, [{key: 'yunwu-image', name: '云雾', enabled: true, authType: 'none', hasApiKey: true}]);
    console.log('MODEL_CATALOG_WEB_FALLBACK_BROWSER_OK');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch(error => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });
