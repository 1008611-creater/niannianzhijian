const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {createSmartCutJobService} = require('./bridge/niannian_smart_cut_jobs');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'niannian-smart-cut-'));
  try {
    const service = createSmartCutJobService({filePath: path.join(root, 'jobs.json')});
    const input = {
      ownerId: 'user-1',
      projectId: 'project-1',
      projectKind: 'script',
      nodeId: 'smart-cut-node-1',
      sourceVideoAssetId: 'CAS-0123456789abcdef01234567',
      preset: 'talking_head',
      aspectRatio: '9:16',
      captionStyle: 'bold-outline',
      idempotencyKey: 'smart-cut-verify-0001'
    };
    const first = await service.create(input);
    assert.equal(first.created, true);
    assert.equal(first.job.status, 'preparing');
    assert.equal(service.publicJob(first.job).sourceVideoAssetId, input.sourceVideoAssetId);
    assert.equal(service.dryRunContract(first.job).pipeline.asr, 'mimo-asr');
    assert.equal(service.dryRunContract(first.job).pipeline.alignment, 'Qwen3-ForcedAligner-0.6B');
    const duplicate = await service.create(input);
    assert.equal(duplicate.created, false);
    await assert.rejects(() => service.create({...input, preset: 'short_video'}), (error) => error.code === 'SMART_CUT_IDEMPOTENCY_CONFLICT');
    const updated = await service.updateOwned(input.ownerId, input.projectId, first.job.id, {status: 'ready_for_review', editorProjectId: 'editor-project-1'});
    assert.equal(updated.status, 'ready_for_review');
    assert.equal((await service.getById(first.job.id)).editorProjectId, 'editor-project-1');
    console.log('smart cut job verification passed');
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
