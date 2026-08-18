const assert = require('assert/strict');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const {createCanvasAssetService} = require('./bridge/niannian_canvas_assets');
const {createCanvasGenerationJobService} = require('./bridge/niannian_canvas_generation_jobs');
const {createCanvasH3Runtime, failureCategory, publicFailure} = require('./bridge/niannian_canvas_h3_runtime');
const {createRunningHubH3Adapter, targetDimensions} = require('./bridge/niannian_runninghub_h3_adapter');
const {CHANNELS, chooseChannel} = require('./bridge/niannian_canvas_h3_channels');

async function run() {
  assert.equal(failureCategory(Object.assign(new Error(), {code:'RUNNINGHUB_HTTP_400'})), 'provider_request');
  assert.equal(publicFailure(Object.assign(new Error(), {code:'RUNNINGHUB_HTTP_400'})), '视频渠道拒绝了当前工作流请求，请检查 H3 工作流参数。');
  assert.equal(failureCategory(Object.assign(new Error(), {code:'RUNNINGHUB_UPLOAD_HTTP_413'})), 'reference_upload');
  assert.deepEqual(targetDimensions('9:16'), {width:480, height:832});
  assert.deepEqual(targetDimensions('9:16', 'one-image'), {width:576, height:1024});
  assert.deepEqual(targetDimensions('16:9'), {width:832, height:480});
  assert.equal(chooseChannel(1), 'one-image');
  assert.equal(CHANNELS['one-image'].endpoint, '/openapi/v2/run/workflow/2085388519102570497');
  assert.deepEqual(targetDimensions('1:1'), {width:832, height:832});
  assert.deepEqual(targetDimensions('4:3'), {width:832, height:624});
  assert.deepEqual(targetDimensions('3:4'), {width:624, height:832});
  const h3Adapter = createRunningHubH3Adapter({baseUrl:'https://www.runninghub.cn'});
  const genericOnlyAdapter = createRunningHubH3Adapter({baseUrl:'https://www.runninghub.cn',fetchImpl:async () => { throw new Error('must not reach provider'); }});
  const previousConsumerKey = process.env.NOMI_RUNNINGHUB_H3_API_KEY;
  const previousGenericKey = process.env.RUNNINGHUB_API_KEY;
  delete process.env.NOMI_RUNNINGHUB_H3_API_KEY;
  process.env.RUNNINGHUB_API_KEY = 'enterprise-key-must-not-be-used';
  await assert.rejects(() => genericOnlyAdapter.query('provider-task-001'), error => error?.code === 'RUNNINGHUB_CREDENTIAL_NOT_CONFIGURED');
  if (previousConsumerKey === undefined) delete process.env.NOMI_RUNNINGHUB_H3_API_KEY;
  else process.env.NOMI_RUNNINGHUB_H3_API_KEY = previousConsumerKey;
  if (previousGenericKey === undefined) delete process.env.RUNNINGHUB_API_KEY;
  else process.env.RUNNINGHUB_API_KEY = previousGenericKey;
  const dryRun = h3Adapter.dryRun({prompt:'中文人物自然转身',aspectRatio:'9:16',durationSeconds:5}, 1);
  assert.equal(dryRun.payload.nodeInfoList.some(item => item.fieldName === 'attention_backend'), false);
  assert.deepEqual(
    dryRun.payload.nodeInfoList.filter(item => ['aspect_ratio','width','height','duration_seconds'].includes(item.fieldName)),
    [
      {nodeId:'6',fieldName:'aspect_ratio',fieldValue:'9:16'},
      {nodeId:'6',fieldName:'width',fieldValue:576},
      {nodeId:'6',fieldName:'height',fieldValue:1024},
      {nodeId:'6',fieldName:'duration_seconds',fieldValue:5}
    ]
  );
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-canvas-h3-runtime-'));
  try {
    const referencePath = path.join(root, 'reference.png');
    await fsp.writeFile(referencePath, Buffer.alloc(2048, 1));
    let submittedBody = null;
    const requestAdapter = createRunningHubH3Adapter({
      apiKey:'test-key',
      fetchImpl: async (url, init) => {
        if (String(url).includes('/media/upload/binary')) return {ok:true,json:async () => ({data:{fileName:'uploaded-reference.png'}})};
        submittedBody = JSON.parse(init.body);
        return {ok:true,json:async () => ({taskId:'provider-task-001'})};
      }
    });
    const submittedProviderTask = await requestAdapter.submit({channel:'one-image',aspectRatio:'9:16',durationSeconds:5,prompt:'中文人物自然转身'}, [referencePath]);
    assert.equal(submittedProviderTask.taskId, 'provider-task-001');
    assert.equal(submittedBody.instanceType, 'ultra');
    assert.equal(submittedBody.nodeInfoList.some(item => item.fieldName === 'attention_backend'), false);
    assert.equal(submittedBody.nodeInfoList.find(item => item.fieldName === 'width').fieldValue, 576);
    assert.equal(submittedBody.nodeInfoList.find(item => item.fieldName === 'height').fieldValue, 1024);
    const rejectedAdapter = createRunningHubH3Adapter({
      apiKey:'test-key',
      fetchImpl: async () => ({ok:true,json:async () => ({code:40017,msg:'provider detail must not be persisted'})})
    });
    await assert.rejects(
      () => rejectedAdapter.query('provider-task-001'),
      error => error?.code === 'RUNNINGHUB_PROVIDER_REJECTED' && error.providerCode === '40017'
    );
    const assetService = createCanvasAssetService({indexPath:path.join(root,'assets.json'),storageRoot:path.join(root,'assets')});
    const jobService = createCanvasGenerationJobService({filePath:path.join(root,'jobs.json')});
    const image = await sharp({create:{width:8,height:8,channels:4,background:{r:1,g:2,b:3,alpha:1}}}).png().toBuffer();
    const input = await assetService.registerBuffer({ownerId:'USR-H3',projectId:'NN-H3',projectKind:'redraw',kind:'reference_image',format:'png',originalName:'reference.png',bytes:image});
    const prepared = await jobService.create({ownerId:'USR-H3',projectId:'NN-H3',projectKind:'redraw',nodeId:'video-node-001',nodeType:'video',prompt:'中文人物自然转身，镜头缓慢推进',inputAssetIds:[input.asset.id],aspectRatio:'16:9',durationSeconds:5,idempotencyKey:'runtime-h3-001'});
    let queryCount = 0;
    let submitCount = 0;
    const video = Buffer.concat([Buffer.from('ftyp'),Buffer.alloc(2048, 7)]);
    const adapter = {
      dryRun: (task,count) => { assert.equal(count,1); return {channel:'one-image',endpoint:'/openapi/v2/run/workflow/2085388519102570497',payload:{nodeInfoList:[]}}; },
      submit: async (task,refs) => {
        assert.equal(refs.length,1);
        submitCount += 1;
        await new Promise(resolve => setTimeout(resolve, 20));
        return {taskId:'fake-h3-task-' + submitCount,channel:'one-image',payload:{referenceCount:1}};
      },
      query: async () => { queryCount += 1; return queryCount === 1 ? {status:'generating',videoUrls:[]} : {status:'completed',videoUrls:['https://provider.invalid/video.mp4'],usage:{consumeCoins:12,consumeMoney:null}}; },
      download: async () => ({bytes:video,mime:'video/mp4',format:'mp4'})
    };
    const runtime = createCanvasH3Runtime({jobService,assetService,enabled:true,adapter});
    const concurrent = await jobService.create({ownerId:'USR-H3',projectId:'NN-H3',projectKind:'redraw',nodeId:'video-node-002',nodeType:'video',prompt:'中文人物回头，镜头缓慢推进',inputAssetIds:[input.asset.id],aspectRatio:'16:9',durationSeconds:5,idempotencyKey:'runtime-h3-002'});
    const [firstAuthorization, secondAuthorization] = await Promise.all([
      runtime.submit('USR-H3','NN-H3',concurrent.job.id),
      runtime.submit('USR-H3','NN-H3',concurrent.job.id)
    ]);
    assert.equal(submitCount, 1);
    assert.equal(firstAuthorization.providerTaskId, 'fake-h3-task-1');
    assert.equal(secondAuthorization.providerTaskId, 'fake-h3-task-1');
    const submitted = await runtime.submit('USR-H3','NN-H3',prepared.job.id);
    assert.equal(submitted.status,'queued');
    assert.equal(submitCount, 2);
    const running = await runtime.reconcile('USR-H3','NN-H3',prepared.job.id);
    assert.equal(running.status,'running');
    const completed = await runtime.reconcile('USR-H3','NN-H3',prepared.job.id);
    assert.equal(completed.status,'succeeded');
    assert.equal(completed.outputAssetIds.length,1);
    const output = (await assetService.listOwned('USR-H3','NN-H3','redraw')).find(asset => asset.kind === 'generated_video');
    assert.equal(output.mimeType,'video/mp4');
    const retryable = await jobService.create({ownerId:'USR-H3',projectId:'NN-H3',projectKind:'redraw',nodeId:'video-node-retry',nodeType:'video',prompt:'中文人物再次转身',inputAssetIds:[input.asset.id],aspectRatio:'16:9',durationSeconds:5,idempotencyKey:'runtime-h3-retry'});
    await jobService.updateOwned('USR-H3','NN-H3',retryable.job.id,{status:'failed',providerSubmitState:'failed',providerTaskId:'failed-provider-task'});
    const retryAttempt = await jobService.create({ownerId:'USR-H3',projectId:'NN-H3',projectKind:'redraw',nodeId:'video-node-retry',nodeType:'video',prompt:'中文人物再次转身',inputAssetIds:[input.asset.id],aspectRatio:'16:9',durationSeconds:5,idempotencyKey:'runtime-h3-retry'});
    assert.equal(retryAttempt.created, true);
    assert.notEqual(retryAttempt.job.id, retryable.job.id);
    const retried = await runtime.submit('USR-H3','NN-H3',retryAttempt.job.id);
    assert.equal(retried.providerTaskId,'fake-h3-task-3');
    console.log('CANVAS_H3_RUNTIME_CONTRACT_OK');
  } finally { await fsp.rm(root,{recursive:true,force:true}); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
