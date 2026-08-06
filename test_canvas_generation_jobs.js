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

    const repeat = await service.create(request);
    assert.equal(repeat.created, false);
    assert.equal(repeat.job.id, first.job.id);

    await assert.rejects(
      () => service.create({...request, prompt:'另一项请求'}),
      error => error.code === 'CANVAS_JOB_IDEMPOTENCY_CONFLICT'
    );
    assert.equal((await service.listOwned('USR-A', 'NN-PROJECT-A')).length, 1);
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
    console.log('CANVAS_GENERATION_JOBS_CONTRACT_OK');
  } finally {
    await fsp.rm(directory, {recursive:true, force:true});
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
