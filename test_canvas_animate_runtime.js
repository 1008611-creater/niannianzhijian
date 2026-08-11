'use strict';

const assert = require('assert/strict');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const {createCanvasAssetService} = require('./bridge/niannian_canvas_assets');
const {createCanvasGenerationJobService} = require('./bridge/niannian_canvas_generation_jobs');
const {createCanvasAnimateRuntime, verifiedConsumerUsage} = require('./bridge/niannian_canvas_animate_runtime');
const {createRunningHubAnimateAdapter, WORKFLOW_ID} = require('./bridge/niannian_runninghub_animate_adapter');

async function run() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-canvas-animate-'));
  try {
    const assets = createCanvasAssetService({indexPath:path.join(root,'assets.json'),storageRoot:path.join(root,'assets')});
    const jobs = createCanvasGenerationJobService({filePath:path.join(root,'jobs.json')});
    const image = await assets.registerBuffer({ownerId:'USR-A',projectId:'NN-A',projectKind:'redraw',kind:'reference_image',format:'png',originalName:'person.png',bytes:Buffer.alloc(2048, 1)});
    const videoBytes = Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(2048, 2)]);
    const video = await assets.registerBuffer({ownerId:'USR-A',projectId:'NN-A',projectKind:'redraw',kind:'reference_video',format:'mp4',originalName:'motion.mp4',bytes:videoBytes});

    const uploadCalls = [];
    const submitBodies = [];
    const providerAdapter = createRunningHubAnimateAdapter({
      apiKey:'test-consumer-key',
      uploadImpl:async ({asset}) => { uploadCalls.push(asset.id); return 'mock/' + asset.id; },
      fetchImpl:async (url, init) => {
        if (String(url).includes('/run/workflow/')) {
          assert.equal(init.headers.authorization, 'Bearer test-consumer-key');
          submitBodies.push(JSON.parse(init.body));
          return {ok:true,json:async () => ({taskId:'provider-animate-001',status:'RUNNING'})};
        }
        if (String(url).endsWith('/openapi/v2/query')) {
          return {ok:true,json:async () => ({taskId:'provider-animate-001',status:'SUCCESS',usage:{consumeCoins:9,consumeMoney:null},results:[{url:'https://provider.invalid/result.mp4',outputType:'mp4'}]})};
        }
        throw new Error('unexpected request');
      }
    });
    const dryRun = providerAdapter.dryRun();
    assert.equal(dryRun.workflowId, WORKFLOW_ID);
    assert.equal(dryRun.payload.instanceType, 'plus');
    assert.equal(dryRun.payload.usePersonalQueue, false);
    assert.deepEqual(dryRun.payload.nodeInfoList.map(item => `${item.nodeId}.${item.fieldName}`), ['299.image','275.video']);
    await providerAdapter.submit({...image.asset,storedPath:(await assets.getOwned('USR-A','NN-A',image.asset.id)).storedPath}, {...video.asset,storedPath:(await assets.getOwned('USR-A','NN-A',video.asset.id)).storedPath});
    await providerAdapter.submit({...image.asset,storedPath:(await assets.getOwned('USR-A','NN-A',image.asset.id)).storedPath}, {...video.asset,storedPath:(await assets.getOwned('USR-A','NN-A',video.asset.id)).storedPath});
    assert.equal(uploadCalls.length, 2, 'provider upload cache reuses both website assets');
    assert.equal(submitBodies.length, 2, 'adapter does not hide explicit caller submissions');
    assert.equal(submitBodies[0].instanceType, 'plus');
    const queried = await providerAdapter.query('provider-animate-001');
    assert.equal(queried.status, 'completed');
    assert.deepEqual(queried.usage, {consumeCoins:9,consumeMoney:null});

    const pendingAdapter = createRunningHubAnimateAdapter({
      apiKey:'test-consumer-key',
      fetchImpl:async () => ({
        ok:true,
        json:async () => ({taskId:'provider-animate-pending',status:'RUNNING',usage:null,results:null})
      })
    });
    const pending = await pendingAdapter.query('provider-animate-pending');
    assert.equal(pending.status, 'generating');
    assert.deepEqual(pending.usage, {consumeCoins:null,consumeMoney:null});

    const prepared = await jobs.create({
      ownerId:'USR-A',projectId:'NN-A',projectKind:'redraw',nodeId:'animate-node',nodeType:'video',
      model:'runninghub-animate-motion-transfer',prompt:'',inputAssetIds:[image.asset.id,video.asset.id],
      aspectRatio:'9:16',durationSeconds:5,idempotencyKey:'animate-job-0001'
    });
    assert.equal(prepared.job.videoChannel, 'animate-transfer');
    assert.equal(jobs.publicJob(prepared.job).model, 'runninghub-animate-motion-transfer');
    let submitCount = 0;
    let queryCount = 0;
    const runtime = createCanvasAnimateRuntime({
      jobService:jobs,assetService:assets,enabled:true,
      adapter:{
        dryRun:() => dryRun,
        submit:async (imageAsset, videoAsset) => {
          assert.equal(imageAsset.kind, 'reference_image');
          assert.equal(videoAsset.kind, 'reference_video');
          submitCount += 1;
          await new Promise(resolve => setTimeout(resolve, 20));
          return {taskId:'provider-runtime-001',payload:{workflowId:WORKFLOW_ID,instanceType:'plus',inputCount:2}};
        },
        query:async () => {
          queryCount += 1;
          if (queryCount === 1) throw Object.assign(new Error('retry'), {code:'RUNNINGHUB_ANIMATE_QUERY_RETRY'});
          return {status:'completed',videoUrls:['https://provider.invalid/result.mp4'],usage:{consumeCoins:'9',consumeMoney:null}};
        },
        download:async () => ({bytes:videoBytes,mime:'video/mp4',format:'mp4'})
      }
    });
    const [first, second] = await Promise.all([
      runtime.submit('USR-A','NN-A',prepared.job.id),
      runtime.submit('USR-A','NN-A',prepared.job.id)
    ]);
    assert.equal(submitCount, 1, 'concurrent authorization submits workflow once');
    assert.equal(first.providerTaskId, 'provider-runtime-001');
    assert.equal(second.providerTaskId, 'provider-runtime-001');
    const retryable = await runtime.reconcile('USR-A','NN-A',prepared.job.id);
    assert.equal(retryable.status, 'running');
    assert.equal(retryable.providerSubmitState, 'query_retry');
    assert.equal(submitCount, 1, 'query failure never resubmits');
    const completed = await runtime.reconcile('USR-A','NN-A',prepared.job.id);
    assert.equal(completed.status, 'succeeded');
    assert.deepEqual(completed.providerUsage, {consumeCoins:9,consumeMoney:null});
    assert.equal(completed.outputAssetIds.length, 1);
    const output = await assets.getOwned('USR-A','NN-A',completed.outputAssetIds[0]);
    assert.equal(output.kind, 'generated_video');
    assert.equal(output.mimeType, 'video/mp4');
    const publicJob = jobs.publicJob(completed, {providerSubmitEnabled:true});
    assert.equal(Object.hasOwn(publicJob, 'providerTaskId'), false);
    assert.equal(Object.hasOwn(publicJob, 'providerUsage'), false);
    assert.deepEqual(verifiedConsumerUsage({consumeCoins:1,consumeMoney:0}), {consumeCoins:1,consumeMoney:0});
    assert.throws(() => verifiedConsumerUsage({consumeCoins:0,consumeMoney:null}), error => error.code === 'CANVAS_ANIMATE_BILLING_UNVERIFIED');
    assert.throws(() => verifiedConsumerUsage({consumeCoins:1,consumeMoney:'0.1'}), error => error.code === 'CANVAS_ANIMATE_BILLING_UNVERIFIED');

    const invalid = await jobs.create({
      ownerId:'USR-A',projectId:'NN-A',projectKind:'redraw',nodeId:'animate-invalid',nodeType:'video',
      model:'animate-transfer',prompt:'',inputAssetIds:[image.asset.id],aspectRatio:'9:16',durationSeconds:5,
      idempotencyKey:'animate-job-invalid'
    });
    await assert.rejects(() => runtime.dryRun(invalid.job), error => error.code === 'CANVAS_ANIMATE_INPUT_INVALID');
    console.log('CANVAS_ANIMATE_RUNTIME_CONTRACT_OK');
  } finally {
    await fsp.rm(root, {recursive:true,force:true});
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
