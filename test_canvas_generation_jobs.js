const assert = require('assert/strict');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {createCanvasGenerationJobService} = require('./bridge/niannian_canvas_generation_jobs');

async function run() {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-canvas-jobs-'));
  try {
    const service = createCanvasGenerationJobService({filePath:path.join(directory, 'jobs.json')});
    const request = {
      ownerId:'USR-A', projectId:'NN-PROJECT-A', projectKind:'redraw', nodeId:'image-node-001', nodeType:'image',
      prompt:'商品主视觉，白色背景', inputAssetIds:['asset-001'], idempotencyKey:'canvas-job-0001'
    };
    const first = await service.create(request);
    assert.equal(first.created, true);
    assert.equal(first.job.status, 'awaiting_authorization');
    assert.equal(first.job.providerSubmitEnabled, false);
    assert.equal(first.job.imageChannel, 'runninghub-gpt-image-2');
    assert.equal(first.job.outputSize, null);

    const yunfei1k = await service.create({...request, model:'yunfei-gpt-image-2-1k', resolution:'1k', aspectRatio:'1:1', idempotencyKey:'canvas-job-yunfei-1k'});
    assert.equal(yunfei1k.job.imageChannel, 'yunfei-gpt-image-2-1k');
    assert.equal(yunfei1k.job.outputSize, '1024x1024');
    const yunfei4k = await service.create({...request, model:'yunfei-gpt-image-2-hd', resolution:'4k', aspectRatio:'16:9', idempotencyKey:'canvas-job-yunfei-4k'});
    assert.equal(yunfei4k.job.imageChannel, 'yunfei-gpt-image-2-hd');
    assert.equal(yunfei4k.job.outputSize, '3840x2160');
    const yunwu4k = await service.create({...request, model:'yunwu-gpt-image-2-c', resolution:'4k', aspectRatio:'9:16', idempotencyKey:'canvas-job-yunwu-4k'});
    assert.equal(yunwu4k.job.imageChannel, 'yunwu-gpt-image-2-c');
    assert.equal(yunwu4k.job.aspectRatio, '9:16');
    assert.equal(yunwu4k.job.outputSize, '2160x3840');
    const yunwuEdit = await service.create({...request, model:'yunwu-gpt-image-2-c-edit', resolution:'4k', aspectRatio:'16:9', idempotencyKey:'canvas-job-yunwu-edit'});
    assert.equal(yunwuEdit.job.imageChannel, 'yunwu-gpt-image-2-c-edit');
    assert.equal(yunwuEdit.job.outputSize, '3840x2160');
    await assert.rejects(
      () => service.create({...request, model:'yunfei-gpt-image-2-1k', resolution:'2k', aspectRatio:'1:1', idempotencyKey:'canvas-job-yunfei-invalid'}),
      error => error.code === 'CANVAS_IMAGE2_RESOLUTION_UNSUPPORTED'
    );

    const animate = await service.create({
      ownerId:'USR-A',projectId:'NN-PROJECT-A',projectKind:'redraw',nodeId:'video-node-animate',nodeType:'video',
      model:'runninghub-animate-motion-transfer',prompt:'',inputAssetIds:['image-001','video-001'],
      aspectRatio:'9:16',durationSeconds:5,idempotencyKey:'canvas-job-animate-0001'
    });
    assert.equal(animate.job.videoChannel, 'animate-transfer');
    assert.equal(service.publicJob(animate.job).model, 'runninghub-animate-motion-transfer');
    assert.equal(service.publicJob(animate.job).videoChannelLabel, '动作迁移（工作流）');
    const animateAiApp = await service.create({
      ownerId:'USR-A',projectId:'NN-PROJECT-A',projectKind:'redraw',nodeId:'video-node-animate-ai-app',nodeType:'video',
      model:'runninghub-animate-ai-app',prompt:'',inputAssetIds:['image-001','video-001'],
      aspectRatio:'9:16',durationSeconds:5,idempotencyKey:'canvas-job-animate-ai-app-0001'
    });
    assert.equal(animateAiApp.job.videoChannel, 'animate-ai-app');
    assert.equal(service.publicJob(animateAiApp.job).model, 'runninghub-animate-ai-app');
    assert.equal(service.publicJob(animateAiApp.job).videoChannelLabel, '动作迁移（AI 应用）');

    const repeat = await service.create(request);
    assert.equal(repeat.created, false);
    assert.equal(repeat.job.id, first.job.id);

    await assert.rejects(
      () => service.create({...request, prompt:'另一项请求'}),
      error => error.code === 'CANVAS_JOB_IDEMPOTENCY_CONFLICT'
    );
    await service.updateOwned('USR-A', 'NN-PROJECT-A', first.job.id, {status:'review', providerSubmitState:'uncertain'});
    const replacement = await service.create(request);
    assert.equal(replacement.created, true);
    assert.notEqual(replacement.job.id, first.job.id);
    assert.match(replacement.job.idempotencyKey, /^canvas-job-0001\.retry-/);
    assert.equal((await service.listOwned('USR-A', 'NN-PROJECT-A')).length, 8);
    assert.equal((await service.listOwned('USR-B', 'NN-PROJECT-A')).length, 0);
    assert.equal(await service.getOwned('USR-B', 'NN-PROJECT-A', first.job.id), null);

    const publicJob = service.publicJob(first.job);
    assert.equal(publicJob.providerSubmitEnabled, false);
    assert.equal(Object.hasOwn(publicJob, 'idempotencyKey'), false);
    assert.equal(Object.hasOwn(publicJob, 'requestHash'), false);
    const dryRun = service.dryRunContract(first.job);
    assert.equal(dryRun.model, 'runninghub-image2-image');
    assert.equal(dryRun.spendRequested, false);
    assert.equal(dryRun.providerSubmitEnabled, false);
    assert.equal(dryRun.imageChannel, 'runninghub-gpt-image-2');
    console.log('CANVAS_GENERATION_JOBS_CONTRACT_OK');
  } finally {
    await fsp.rm(directory, {recursive:true, force:true});
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
