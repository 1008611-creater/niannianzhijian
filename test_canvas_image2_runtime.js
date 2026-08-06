const assert = require('assert/strict');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const {createCanvasAssetService} = require('./bridge/niannian_canvas_assets');
const {createCanvasGenerationJobService} = require('./bridge/niannian_canvas_generation_jobs');
const {createCanvasImage2Runtime} = require('./bridge/niannian_canvas_image2_runtime');

async function run() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-canvas-image2-runtime-'));
  try {
    const assetService = createCanvasAssetService({indexPath:path.join(root,'assets.json'),storageRoot:path.join(root,'assets')});
    const jobService = createCanvasGenerationJobService({filePath:path.join(root,'jobs.json')});
    const input = await assetService.registerBuffer({ownerId:'USR-RUNTIME',projectId:'NN-RUNTIME',projectKind:'redraw',kind:'reference_image',format:'png',originalName:'reference.png',bytes:await sharp({create:{width:8,height:8,channels:4,background:{r:1,g:2,b:3,alpha:1}}}).png().toBuffer()});
    const prepared = await jobService.create({ownerId:'USR-RUNTIME',projectId:'NN-RUNTIME',projectKind:'redraw',nodeId:'image-node-001',nodeType:'image',prompt:'中文产品主视觉',inputAssetIds:[input.asset.id],resolution:'2k',aspectRatio:'1:1',idempotencyKey:'runtime-image2-001'});
    const disabled = createCanvasImage2Runtime({jobService,assetService,enabled:false,adapter:{}});
    await assert.rejects(() => disabled.submit('USR-RUNTIME','NN-RUNTIME',prepared.job.id), error => error.code === 'CANVAS_PROVIDER_SUBMIT_DISABLED');
    let queryCount = 0;
    const output = await sharp({create:{width:16,height:12,channels:4,background:{r:9,g:8,b:7,alpha:1}}}).png().toBuffer();
    const adapter = {
      dryRun: task => ({endpoint:'test://image2',payload:{prompt:task.prompt,resolution:task.resolution}}),
      submit: async (task, references) => { assert.equal(task.resolution,'2k'); assert.equal(references.length,1); return {taskId:'fake-rh-task-001',payload:{referenceCount:1}}; },
      query: async taskId => { assert.equal(taskId,'fake-rh-task-001'); queryCount += 1; return queryCount === 1 ? {status:'generating',imageUrls:[]} : {status:'completed',imageUrls:['https://provider.invalid/result.png']}; },
      download: async url => { assert.equal(url,'https://provider.invalid/result.png'); return {bytes:output,mime:'image/png'}; }
    };
    const runtime = createCanvasImage2Runtime({jobService,assetService,enabled:true,adapter});
    const submitted = await runtime.submit('USR-RUNTIME','NN-RUNTIME',prepared.job.id);
    assert.equal(submitted.status,'queued');
    assert.equal(submitted.providerTaskId,'fake-rh-task-001');
    const running = await runtime.reconcile('USR-RUNTIME','NN-RUNTIME',prepared.job.id);
    assert.equal(running.status,'running');
    const completed = await runtime.reconcile('USR-RUNTIME','NN-RUNTIME',prepared.job.id);
    assert.equal(completed.status,'succeeded');
    assert.equal(completed.outputAssetIds.length,1);
    assert.equal((await assetService.listOwned('USR-RUNTIME','NN-RUNTIME','redraw')).length,2);
    assert.equal(jobService.publicJob(completed).providerTaskId, undefined);
    console.log('CANVAS_IMAGE2_RUNTIME_CONTRACT_OK');
  } finally { await fsp.rm(root,{recursive:true,force:true}); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
