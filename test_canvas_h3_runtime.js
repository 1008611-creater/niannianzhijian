const assert = require('assert/strict');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const {createCanvasAssetService} = require('./bridge/niannian_canvas_assets');
const {createCanvasGenerationJobService} = require('./bridge/niannian_canvas_generation_jobs');
const {createCanvasH3Runtime, failureCategory, publicFailure} = require('./bridge/niannian_canvas_h3_runtime');
const {createRunningHubH3Adapter, targetDimensions} = require('./bridge/niannian_runninghub_h3_adapter');

async function run() {
  assert.equal(failureCategory(Object.assign(new Error(), {code:'RUNNINGHUB_HTTP_400'})), 'provider_request');
  assert.equal(publicFailure(Object.assign(new Error(), {code:'RUNNINGHUB_HTTP_400'})), '视频渠道拒绝了当前工作流请求，请检查 H3 工作流参数。');
  assert.equal(failureCategory(Object.assign(new Error(), {code:'RUNNINGHUB_UPLOAD_HTTP_413'})), 'reference_upload');
  assert.deepEqual(targetDimensions('9:16'), {width:480, height:832});
  assert.deepEqual(targetDimensions('16:9'), {width:832, height:480});
  assert.throws(
    () => targetDimensions('1:1'),
    error => error?.code === 'RUNNINGHUB_TARGET_DIMENSION_UNSUPPORTED'
  );
  const h3Adapter = createRunningHubH3Adapter({baseUrl:'https://www.runninghub.cn'});
  const dryRun = h3Adapter.dryRun({prompt:'中文人物自然转身',aspectRatio:'9:16',durationSeconds:5}, 1);
  assert.deepEqual(
    dryRun.payload.nodeInfoList.filter(item => ['aspect_ratio','width','height','duration_seconds'].includes(item.fieldName)),
    [
      {nodeId:'6',fieldName:'aspect_ratio',fieldValue:'9:16'},
      {nodeId:'6',fieldName:'width',fieldValue:480},
      {nodeId:'6',fieldName:'height',fieldValue:832},
      {nodeId:'6',fieldName:'duration_seconds',fieldValue:5}
    ]
  );
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-canvas-h3-runtime-'));
  try {
    const assetService = createCanvasAssetService({indexPath:path.join(root,'assets.json'),storageRoot:path.join(root,'assets')});
    const jobService = createCanvasGenerationJobService({filePath:path.join(root,'jobs.json')});
    const image = await sharp({create:{width:8,height:8,channels:4,background:{r:1,g:2,b:3,alpha:1}}}).png().toBuffer();
    const input = await assetService.registerBuffer({ownerId:'USR-H3',projectId:'NN-H3',projectKind:'redraw',kind:'reference_image',format:'png',originalName:'reference.png',bytes:image});
    const prepared = await jobService.create({ownerId:'USR-H3',projectId:'NN-H3',projectKind:'redraw',nodeId:'video-node-001',nodeType:'video',prompt:'中文人物自然转身，镜头缓慢推进',inputAssetIds:[input.asset.id],aspectRatio:'16:9',durationSeconds:5,idempotencyKey:'runtime-h3-001'});
    let queryCount = 0;
    const video = Buffer.concat([Buffer.from('ftyp'),Buffer.alloc(2048, 7)]);
    const adapter = {
      dryRun: (task,count) => { assert.equal(count,1); return {channel:'last-frame',endpoint:'/openapi/v2/run/workflow/2084071981670035457',payload:{nodeInfoList:[]}}; },
      submit: async (task,refs) => { assert.equal(refs.length,1); return {taskId:'fake-h3-task-001',channel:'last-frame',payload:{referenceCount:1}}; },
      query: async () => { queryCount += 1; return queryCount === 1 ? {status:'generating',videoUrls:[]} : {status:'completed',videoUrls:['https://provider.invalid/video.mp4'],usage:{consumeCoins:12,consumeMoney:null}}; },
      download: async () => ({bytes:video,mime:'video/mp4',format:'mp4'})
    };
    const runtime = createCanvasH3Runtime({jobService,assetService,enabled:true,adapter});
    const submitted = await runtime.submit('USR-H3','NN-H3',prepared.job.id);
    assert.equal(submitted.status,'queued');
    const running = await runtime.reconcile('USR-H3','NN-H3',prepared.job.id);
    assert.equal(running.status,'running');
    const completed = await runtime.reconcile('USR-H3','NN-H3',prepared.job.id);
    assert.equal(completed.status,'succeeded');
    assert.equal(completed.outputAssetIds.length,1);
    const output = (await assetService.listOwned('USR-H3','NN-H3','redraw')).find(asset => asset.kind === 'generated_video');
    assert.equal(output.mimeType,'video/mp4');
    console.log('CANVAS_H3_RUNTIME_CONTRACT_OK');
  } finally { await fsp.rm(root,{recursive:true,force:true}); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
