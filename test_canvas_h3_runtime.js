const assert = require('assert/strict');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const {createCanvasAssetService} = require('./bridge/niannian_canvas_assets');
const {createCanvasGenerationJobService} = require('./bridge/niannian_canvas_generation_jobs');
const {createCanvasH3Runtime} = require('./bridge/niannian_canvas_h3_runtime');

async function run() {
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
