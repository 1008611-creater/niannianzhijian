'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, 'studio/assets/web-runtime-adapter-r4.js'), 'utf8');
  let active = 0;
  let maxActive = 0;
  let attempts = 0;
  const context = {
    window: {location: {search: '', hash: '#/studio?projectId=NN-UPLOAD-0001'}},
    URLSearchParams,
    URL,
    Set,
    Array,
    String,
    Date,
    Math,
    JSON,
    Promise,
    Blob,
    FormData,
    Uint8Array,
    setTimeout,
    crypto: {randomUUID: () => '00000000-0000-0000-0000-000000000000'},
    fetch: async (pathname) => {
      assert.match(pathname, /\/api\/projects\/NN-UPLOAD-0001\/assets$/);
      active += 1;
      maxActive = Math.max(maxActive, active);
      attempts += 1;
      const requestAttempt = attempts;
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      if (requestAttempt === 1) {
        return {ok: false, status: 503, json: async () => ({code: 'TEMPORARY_FAILURE', error: '暂时不可用'})};
      }
      return {ok: true, json: async () => ({asset: {
        id: `CAS-${String(attempts).padStart(24, '0')}`,
        downloadUrl: `/api/projects/NN-UPLOAD-0001/assets/CAS-${String(attempts).padStart(24, '0')}/download`
      }})};
    }
  };
  vm.runInNewContext(source, context, {filename: 'web-runtime-adapter.js'});
  const imports = await Promise.all(Array.from({length: 6}, (_, index) => context.window.nomiDesktop.assets.importFile({
    projectId: 'NN-UPLOAD-0001',
    fileName: `reference-${index}.png`,
    contentType: 'image/png',
    bytes: new Uint8Array([137, 80, 78, 71])
  })));
  assert.equal(imports.length, 6);
  assert.ok(attempts >= 7, `expected one transient retry, got ${attempts} attempts`);
  assert.ok(maxActive <= 2, `expected at most two uploads in flight, got ${maxActive}`);
  assert.ok(imports.every((item) => /^CAS-/.test(item.id)));
  console.log('WEB_RUNTIME_ADAPTER_UPLOAD_RESILIENCE_OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
