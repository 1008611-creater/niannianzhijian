'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');

(async () => {
const source = fs.readFileSync(require('path').join(__dirname, 'studio/assets/web-runtime-adapter-r4.js'), 'utf8');
const studioIndex = fs.readFileSync(require('path').join(__dirname, 'studio/index.html'), 'utf8');
assert.match(studioIndex, /web-runtime-adapter-r4\.js\?v=20260811-image2-channels-r1/);
assert.match(source, /\/api\/canvas\/provider-status/);
assert.match(source, /\/api\/projects\/.*\/canvas\/jobs/);
assert.match(source, /\/api\/projects\/.*\/text\/jobs/);
assert.match(source, /vendorKey: 'asxs'/);
assert.match(source, /request\.kind === 'chat'/);
assert.match(source, /confirmProviderSpend:\s*true/);
assert.match(source, /aspectRatio: video\s*\n\s*\? \(extras\.aspectRatio && extras\.aspectRatio !== '1:1' \? extras\.aspectRatio : '9:16'\)/);
assert.doesNotMatch(source, /RUNNINGHUB_API_KEY|apiKey\s*:/);
assert.match(source, /!isWebOrigin\s*&&\s*existingBridge/);

const calls = [];
const requestBodies = [];
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
  fetch: async (pathname, options = {}) => {
    calls.push(pathname);
    if (pathname === '/api/canvas/provider-status') return {ok:true,json:async() => ({providerStatus:{
      credentialConfigured:false,
      imageSubmitEnabled:true,
      videoSubmitEnabled:false,
      imageChannels:[
        {id:'yunfei-gpt-image-2-1k',label:'云飞 Image2 1K',provider:'yunfei-1k',resolutions:['1k'],aspectRatios:['1:1'],outputSizes:{'1k':'1024x1024'},submitEnabled:true},
        {id:'yunfei-gpt-image-2-hd',label:'云飞 Image2 高清',provider:'yunfei-hd',resolutions:['2k','4k'],aspectRatios:['16:9'],outputSizes:{'2k':'2048x1152','4k':'3840x2160'},submitEnabled:true}
      ]
    }})};
    if (pathname.endsWith('/canvas/jobs')) {
      requestBodies.push(JSON.parse(options.body));
      return {ok:true,json:async() => ({job:{id:'CGJ-test',nodeType:'video',status:'awaiting_authorization',outputAssetIds:[]}})};
    }
    if (pathname.endsWith('/canvas/jobs/CGJ-test/authorize')) {
      requestBodies.push(JSON.parse(options.body));
      return {ok:true,json:async() => ({job:{id:'CGJ-test',nodeType:'video',status:'running',outputAssetIds:[]}})};
    }
    throw new Error('unexpected request');
  }
};
vm.runInNewContext(source, context, {filename:'web-runtime-adapter.js'});
assert.ok(context.window.nomiDesktop);
assert.equal(typeof context.window.nomiDesktop.tasks.runTextStream, 'function');
assert.equal(typeof context.window.nomiDesktop.tasks.onTextEvent, 'function');
assert.equal(typeof context.window.nomiDesktop.tasks.cancelTextStream, 'function');
await new Promise((resolve) => setTimeout(resolve, 10));
const imageModels = await context.window.nomiDesktop.modelCatalog.listModels({kind:'image'});
assert.deepEqual(Array.from(imageModels, (model) => [model.modelKey, model.meta.outputSizes]), [
  ['yunfei-gpt-image-2-1k', {'1k':'1024x1024'}],
  ['yunfei-gpt-image-2-hd', {'2k':'2048x1152','4k':'3840x2160'}]
]);
const vendors = await context.window.nomiDesktop.modelCatalog.listVendors();
assert.equal(vendors.length, 4);
assert.equal(vendors[0].key, 'runninghub');
assert.equal(vendors[0].hasApiKey, false);
assert.equal(vendors[1].key, 'asxs');
assert.equal(vendors[1].hasApiKey, false);
assert.equal(vendors[2].key, 'yunfei-1k');
assert.equal(vendors[3].key, 'yunfei-hd');
const health = await context.window.nomiDesktop.modelCatalog.health();
assert.equal(Array.from(health.byKind, (entry) => entry.enabledModels).join(','), '0,1,0');
assert.equal(health.issues.length, 0);
assert.ok(calls.length >= 2);
const task = await context.window.nomiDesktop.tasks.run({request:{kind:'image_to_video',prompt:'portrait regression',extras:{nodeId:'video-node-1',referenceImages:['CAS-123'],aspectRatio:'1:1',durationSeconds:5}}});
assert.equal(task.id, 'CGJ-test');
assert.equal(requestBodies[0].aspectRatio, '9:16');
assert.equal(requestBodies[0].durationSeconds, 5);
assert.equal(requestBodies[1].confirmProviderSpend, true);
const imageTask = await context.window.nomiDesktop.tasks.run({request:{kind:'image_edit',prompt:'1K 节点回归',extras:{nodeId:'image-node-1',modelKey:'yunfei-gpt-image-2-1k',resolution:'1k',aspectRatio:'1:1'}}});
assert.equal(imageTask.id, 'CGJ-test');
assert.equal(requestBodies[2].model, 'yunfei-gpt-image-2-1k');
assert.equal(requestBodies[2].resolution, '1k');
assert.equal(requestBodies[2].aspectRatio, '1:1');
console.log('WEB_RUNTIME_ADAPTER_CONTRACT_OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
