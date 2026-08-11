'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');

(async () => {
const source = fs.readFileSync(require('path').join(__dirname, 'studio/assets/web-runtime-adapter-r4.js'), 'utf8');
const studioIndex = fs.readFileSync(require('path').join(__dirname, 'studio/index.html'), 'utf8');
assert.match(studioIndex, /web-runtime-adapter-r4\.js\?v=20260811-animate-dual-r1/);
assert.match(source, /\/api\/canvas\/provider-status/);
assert.match(source, /\/api\/projects\/.*\/canvas\/jobs/);
assert.match(source, /\/api\/projects\/.*\/text\/jobs/);
assert.match(source, /vendorKey: 'asxs'/);
assert.match(source, /request\.kind === 'chat'/);
assert.match(source, /confirmProviderSpend:\s*true/);
assert.match(source, /aspectRatio: video\s*\n\s*\? \(extras\.aspectRatio && extras\.aspectRatio !== '1:1' \? extras\.aspectRatio : '9:16'\)/);
assert.doesNotMatch(source, /RUNNINGHUB_API_KEY|apiKey\s*:/);
assert.match(source, /!isWebOrigin\s*&&\s*existingBridge/);
assert.match(source, /runninghub-animate-motion-transfer/);
assert.match(source, /runninghub-animate-ai-app/);
assert.match(source, /archetype:\s*\{id: 'happyhorse', modeId: 'edit'\}/);

const calls = [];
const requestBodies = [];
const uploadRequests = [];
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
  Blob,
  FormData,
  Uint8Array,
  setTimeout,
  crypto: {randomUUID: () => '00000000-0000-0000-0000-000000000000'},
  fetch: async (pathname, options = {}) => {
    calls.push(pathname);
    if (pathname === '/api/canvas/provider-status') return {ok:true,json:async() => ({providerStatus:{
      credentialConfigured:false,
      imageSubmitEnabled:true,
      videoSubmitEnabled:false,
      animateSubmitEnabled:true,
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
    if (pathname.endsWith('/assets') && options.method === 'POST') {
      uploadRequests.push({pathname, options});
      return {ok:true,json:async() => ({asset:{id:'CAS-1234567890abcdef12345678',downloadUrl:'/api/projects/NN-LOCAL-0001/assets/CAS-1234567890abcdef12345678/download'}})};
    }
    if (pathname.endsWith('/assets')) return {ok:true,json:async() => ({assets:[
      {id:'CAS-111111111111111111111111',kind:'reference_image',originalName:'reference.png',mimeType:'image/png',createdAt:'2026-08-11T00:00:00.000Z',updatedAt:'2026-08-11T00:00:00.000Z',downloadUrl:'/api/projects/NN-LOCAL-0001/assets/CAS-111111111111111111111111/download'},
      {id:'CAS-222222222222222222222222',kind:'generated_video',originalName:'result.mp4',mimeType:'video/mp4',createdAt:'2026-08-11T00:01:00.000Z',updatedAt:'2026-08-11T00:01:00.000Z',downloadUrl:'/api/projects/NN-LOCAL-0001/assets/CAS-222222222222222222222222/download'},
      {id:'CAS-333333333333333333333333',kind:'reference_audio',originalName:'voice.mp3',mimeType:'audio/mpeg',createdAt:'2026-08-11T00:02:00.000Z',updatedAt:'2026-08-11T00:02:00.000Z',downloadUrl:'/api/projects/NN-LOCAL-0001/assets/CAS-333333333333333333333333/download'}
    ]})};
    throw new Error('unexpected request');
  }
};
vm.runInNewContext(source, context, {filename:'web-runtime-adapter.js'});
assert.ok(context.window.nomiDesktop);
assert.equal(typeof context.window.nomiDesktop.tasks.runTextStream, 'function');
assert.equal(typeof context.window.nomiDesktop.tasks.onTextEvent, 'function');
assert.equal(typeof context.window.nomiDesktop.tasks.cancelTextStream, 'function');
assert.equal(typeof context.window.nomiDesktop.assets.importFile, 'function');
assert.equal(typeof context.window.nomiDesktop.assets.list, 'function');
assert.deepEqual(Array.from(context.window.nomiDesktop.projects.list(), (project) => project.id), ['NN-LOCAL-0001']);
const imported = await context.window.nomiDesktop.assets.importFile({projectId:'NN-LOCAL-0001',fileName:'reference.png',contentType:'image/png',bytes:new Uint8Array([137,80,78,71])});
assert.equal(imported.id, 'CAS-1234567890abcdef12345678');
assert.equal(imported.data.url, '/api/projects/NN-LOCAL-0001/assets/CAS-1234567890abcdef12345678/download');
assert.equal(uploadRequests.length, 1);
assert.equal(uploadRequests[0].options.method, 'POST');
assert.equal(uploadRequests[0].options.headers['x-niannian-project-kind'], 'redraw');
assert.ok(uploadRequests[0].options.body instanceof FormData);
assert.equal(uploadRequests[0].options.body.get('referenceImage').name, 'reference.png');
const listed = await context.window.nomiDesktop.assets.list({projectId:'NN-LOCAL-0001'});
assert.equal(listed.cursor, null);
assert.deepEqual(Array.from(listed.items, (asset) => [asset.id, asset.projectId, asset.name, asset.data.mediaType, asset.data.relativePath, asset.data.url]), [
  ['CAS-111111111111111111111111', 'NN-LOCAL-0001', 'reference.png', 'image', 'project-assets/CAS-111111111111111111111111', '/api/projects/NN-LOCAL-0001/assets/CAS-111111111111111111111111/download'],
  ['CAS-222222222222222222222222', 'NN-LOCAL-0001', 'result.mp4', 'video', 'project-assets/CAS-222222222222222222222222', '/api/projects/NN-LOCAL-0001/assets/CAS-222222222222222222222222/download'],
  ['CAS-333333333333333333333333', 'NN-LOCAL-0001', 'voice.mp3', 'audio', 'project-assets/CAS-333333333333333333333333', '/api/projects/NN-LOCAL-0001/assets/CAS-333333333333333333333333/download']
]);
await new Promise((resolve) => setTimeout(resolve, 10));
const imageModels = await context.window.nomiDesktop.modelCatalog.listModels({kind:'image'});
assert.deepEqual(Array.from(imageModels, (model) => [model.modelKey, model.meta.outputSizes]), [
  ['yunfei-gpt-image-2-1k', {'1k':'1024x1024'}],
  ['yunfei-gpt-image-2-hd', {'2k':'2048x1152','4k':'3840x2160'}]
]);
const videoModels = await context.window.nomiDesktop.modelCatalog.listModels({kind:'video'});
assert.deepEqual(Array.from(videoModels, (model) => [model.modelKey, model.meta.archetype && model.meta.archetype.id, model.meta.archetype && model.meta.archetype.modeId]), [
  ['runninghub-animate-motion-transfer', 'happyhorse', 'edit'],
  ['runninghub-animate-ai-app', 'happyhorse', 'edit']
]);
const vendors = await context.window.nomiDesktop.modelCatalog.listVendors();
assert.equal(vendors.length, 4);
assert.equal(vendors[0].key, 'runninghub');
assert.equal(vendors[0].hasApiKey, true);
assert.equal(vendors[1].key, 'asxs');
assert.equal(vendors[1].hasApiKey, false);
assert.equal(vendors[2].key, 'yunfei-1k');
assert.equal(vendors[3].key, 'yunfei-hd');
const health = await context.window.nomiDesktop.modelCatalog.health();
assert.equal(Array.from(health.byKind, (entry) => entry.enabledModels).join(','), '0,1,1');
assert.equal(health.issues.length, 0);
assert.ok(calls.length >= 2);
const task = await context.window.nomiDesktop.tasks.run({request:{kind:'image_to_video',prompt:'portrait regression',extras:{nodeId:'video-node-1',referenceImages:['CAS-123'],aspectRatio:'1:1',durationSeconds:5}}});
assert.equal(task.id, 'CGJ-test');
assert.equal(requestBodies[0].model, 'h3');
assert.deepEqual(requestBodies[0].inputAssetIds, ['CAS-123']);
assert.equal(requestBodies[0].aspectRatio, '9:16');
assert.equal(requestBodies[0].durationSeconds, 5);
assert.equal(requestBodies[1].confirmProviderSpend, true);
const animateTask = await context.window.nomiDesktop.tasks.run({request:{kind:'image_to_video',prompt:'',extras:{nodeId:'animate-node-1',modelKey:'runninghub-animate-motion-transfer',referenceImages:['/api/projects/NN-LOCAL-0001/assets/CAS-image-001/download'],referenceVideos:['/api/projects/NN-LOCAL-0001/assets/CAS-video-001/download'],aspectRatio:'9:16',durationSeconds:5}}});
assert.equal(animateTask.id, 'CGJ-test');
assert.equal(requestBodies[2].model, 'runninghub-animate-motion-transfer');
assert.deepEqual(requestBodies[2].inputAssetIds, ['CAS-image-001', 'CAS-video-001']);
assert.equal(requestBodies[3].confirmProviderSpend, true);
const animateFromArchetype = await context.window.nomiDesktop.tasks.run({request:{kind:'image_to_video',prompt:'动作迁移',extras:{nodeId:'animate-node-2',modelAlias:'runninghub-animate-motion-transfer',archetypeInput:{reference_image:'CAS-image-002',video_url:'CAS-video-002'}}}});
assert.equal(animateFromArchetype.id, 'CGJ-test');
assert.deepEqual(requestBodies[4].inputAssetIds, ['CAS-image-002', 'CAS-video-002']);
const animateAiApp = await context.window.nomiDesktop.tasks.run({request:{kind:'image_to_video',prompt:'',extras:{nodeId:'animate-node-3',modelKey:'runninghub-animate-ai-app',referenceImages:['CAS-image-003'],referenceVideos:['CAS-video-003']}}});
assert.equal(animateAiApp.id, 'CGJ-test');
assert.equal(requestBodies[6].model, 'runninghub-animate-ai-app');
assert.deepEqual(requestBodies[6].inputAssetIds, ['CAS-image-003', 'CAS-video-003']);
const imageTask = await context.window.nomiDesktop.tasks.run({request:{kind:'image_edit',prompt:'1K 节点回归',extras:{nodeId:'image-node-1',modelKey:'yunfei-gpt-image-2-1k',resolution:'1k',aspectRatio:'1:1'}}});
assert.equal(imageTask.id, 'CGJ-test');
assert.equal(requestBodies[8].model, 'yunfei-gpt-image-2-1k');
assert.equal(requestBodies[8].resolution, '1k');
assert.equal(requestBodies[8].aspectRatio, '1:1');
console.log('WEB_RUNTIME_ADAPTER_CONTRACT_OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
