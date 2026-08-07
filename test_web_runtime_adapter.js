'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');

(async () => {
const source = fs.readFileSync(require('path').join(__dirname, 'studio/assets/web-runtime-adapter.js'), 'utf8');
assert.match(source, /\/api\/canvas\/provider-status/);
assert.match(source, /\/api\/projects\/.*\/canvas\/jobs/);
assert.match(source, /\/api\/projects\/.*\/text\/jobs/);
assert.match(source, /vendorKey: 'asxs'/);
assert.match(source, /request\.kind === 'chat'/);
assert.match(source, /confirmProviderSpend:\s*true/);
assert.doesNotMatch(source, /RUNNINGHUB_API_KEY|apiKey\s*:/);
assert.match(source, /!isWebOrigin\s*&&\s*existingBridge/);

const calls = [];
const context = {
  window: {location: {search: '?step=generate', hash: '#/studio?projectId=NN-LOCAL-0001'}},
  URLSearchParams,
  URL,
  Set,
  Array,
  String,
  Date,
  Math,
  JSON,
  Promise,
  setTimeout,
  crypto: {randomUUID: () => '00000000-0000-0000-0000-000000000000'},
  fetch: async (pathname) => {
    calls.push(pathname);
    if (pathname === '/api/canvas/provider-status') return {ok:true,json:async() => ({providerStatus:{credentialConfigured:false,imageSubmitEnabled:false,videoSubmitEnabled:false}})};
    throw new Error('unexpected request');
  }
};
vm.runInNewContext(source, context, {filename:'web-runtime-adapter.js'});
assert.ok(context.window.nomiDesktop);
assert.equal(typeof context.window.nomiDesktop.tasks.runTextStream, 'function');
assert.equal(typeof context.window.nomiDesktop.tasks.onTextEvent, 'function');
assert.equal(typeof context.window.nomiDesktop.tasks.cancelTextStream, 'function');
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal((await context.window.nomiDesktop.modelCatalog.listModels({kind:'image'})).length, 0);
const vendors = await context.window.nomiDesktop.modelCatalog.listVendors();
assert.equal(vendors.length, 2);
assert.equal(vendors[0].key, 'runninghub');
assert.equal(vendors[0].hasApiKey, false);
assert.equal(vendors[1].key, 'asxs');
assert.equal(vendors[1].hasApiKey, false);
const health = await context.window.nomiDesktop.modelCatalog.health();
assert.equal(Array.from(health.byKind, (entry) => entry.enabledModels).join(','), '0,0,0');
assert.equal(health.issues[0].code, 'catalog_empty');
assert.ok(calls.length >= 2);
console.log('WEB_RUNTIME_ADAPTER_CONTRACT_OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
