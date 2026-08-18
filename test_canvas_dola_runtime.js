'use strict';

const assert = require('assert/strict');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const {createCanvasAssetService} = require('./bridge/niannian_canvas_assets');
const {createCanvasGenerationJobService} = require('./bridge/niannian_canvas_generation_jobs');
const {createCanvasDolaRuntime} = require('./bridge/niannian_canvas_dola_runtime');
const {createDolaDesktopApiAdapter, fieldForAsset} = require('./bridge/niannian_dola_desktop_api_adapter');
const {validateDolaMediaMetadata} = require('./bridge/niannian_dola_media_validation');

async function run() {
  assert.equal(fieldForAsset({kind:'reference_image'}), 'image');
  assert.equal(fieldForAsset({kind:'reference_audio'}), 'audio');
  assert.equal(fieldForAsset({kind:'reference_video'}), 'video');
  assert.throws(() => fieldForAsset({kind:'reference_text'}), error => error.code === 'DOLA_INPUT_TYPE_INVALID');
  assert.throws(() => createDolaDesktopApiAdapter({baseUrl:'http://example.invalid',apiKey:'test'}), error => error.code === 'DOLA_API_URL_INVALID');
  assert.equal(validateDolaMediaMetadata({width:720,height:1280,durationSeconds:30.08,codec:'h264'}, {aspectRatio:'9:16',durationSeconds:30}).durationSeconds, 30.08);
  assert.throws(() => validateDolaMediaMetadata({width:720,height:1280,durationSeconds:27,codec:'h264'}, {aspectRatio:'9:16',durationSeconds:30}), error => error.code === 'DOLA_OUTPUT_DURATION_MISMATCH');

  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-canvas-dola-runtime-'));
  try {
    const assets = createCanvasAssetService({indexPath:path.join(root,'assets.json'),storageRoot:path.join(root,'assets')});
    const jobs = createCanvasGenerationJobService({filePath:path.join(root,'jobs.json')});
    const imageBytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'),Buffer.alloc(1024, 1)]);
    const image = await assets.registerBuffer({ownerId:'USR-DOLA',projectId:'NN-DOLA',projectKind:'redraw',kind:'reference_image',format:'png',originalName:'reference.png',bytes:imageBytes});
    const audio = await assets.registerBuffer({ownerId:'USR-DOLA',projectId:'NN-DOLA',projectKind:'redraw',kind:'reference_audio',format:'mp3',originalName:'voice.mp3',bytes:Buffer.alloc(1024, 7)});
    const video = await assets.registerBuffer({ownerId:'USR-DOLA',projectId:'NN-DOLA',projectKind:'redraw',kind:'reference_video',format:'mp4',originalName:'motion.mp4',bytes:Buffer.concat([Buffer.from('ftyp'),Buffer.alloc(1024, 9)])});
    const prepared = await jobs.create({
      ownerId:'USR-DOLA',projectId:'NN-DOLA',projectKind:'redraw',nodeId:'video-node-dola',nodeType:'video',model:'dola-seedance-2-5',
      prompt:'角色站在雨夜街头，镜头缓慢推进。',inputAssetIds:[image.asset.id,audio.asset.id,video.asset.id],aspectRatio:'9:16',durationSeconds:30,accountSlot:2,idempotencyKey:'dola-runtime-0001'
    });
    assert.equal(prepared.job.videoChannel, 'dola-seedance-2-5');
    assert.equal(prepared.job.accountSlot, 2);
    await assert.rejects(
      () => jobs.create({ownerId:'USR-DOLA',projectId:'NN-DOLA',projectKind:'redraw',nodeId:'video-node-dola-invalid',nodeType:'video',model:'dola-seedance-2-5',prompt:'测试',aspectRatio:'9:16',durationSeconds:15,idempotencyKey:'dola-runtime-0002'}),
      error => error.code === 'CANVAS_DOLA_DURATION_REQUIRED'
    );
    let submitted = null;
    let queryCount = 0;
    const adapter = {
      dryRun: (task, inputs) => {
        assert.equal(task.durationSeconds, undefined);
        assert.equal(task.accountSlot, 2);
        assert.deepEqual(inputs.map(item => item.kind).sort(), ['reference_audio','reference_image','reference_video']);
        return {channel:'dola-seedance-2-5',durationSeconds:30};
      },
      submit: async (task, inputs) => {
        submitted = {task, inputs};
        return {taskId:'dola-task-001',channel:'dola-seedance-2-5',payload:{durationSeconds:30}};
      },
      query: async () => {
        queryCount += 1;
        return queryCount === 1 ? {status:'generating'} : {status:'completed',outputUrl:'https://dola.invalid/v1/jobs/dola-task-001/download'};
      },
      download: async () => ({bytes:Buffer.concat([Buffer.from('ftyp'),Buffer.alloc(2048, 4)]),mime:'video/mp4',format:'mp4'})
    };
    const runtime = createCanvasDolaRuntime({jobService:jobs,assetService:assets,enabled:true,adapter,inspectMedia:async (bytes, expected) => {
      assert.equal(expected.durationSeconds, 30);
      assert.equal(expected.aspectRatio, '9:16');
      return {width:720,height:1280,durationSeconds:30.08,codec:'h264'};
    }, preflightPage:async () => ({ready:true}), preparePage:async options => ({browser:null,page:null,prepared:true,options}), submitPage:async options => ({taskId:'dola-task-001',channel:'dola-seedance-2-5',payload:{durationSeconds:30}})});
    const dryRun = await runtime.dryRun(prepared.job);
    assert.equal(dryRun.durationSeconds, 30);
    const queued = await runtime.submit('USR-DOLA','NN-DOLA',prepared.job.id);
    assert.equal(queued.providerTaskId, 'dola-task-001');
    assert.equal(submitted, null);
    assert.equal((await runtime.reconcile('USR-DOLA','NN-DOLA',prepared.job.id)).status, 'running');
    const completed = await runtime.reconcile('USR-DOLA','NN-DOLA',prepared.job.id);
    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.outputAssetIds.length, 1);
    console.log('CANVAS_DOLA_RUNTIME_CONTRACT_OK');
  } finally {
    await fsp.rm(root,{recursive:true,force:true});
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
