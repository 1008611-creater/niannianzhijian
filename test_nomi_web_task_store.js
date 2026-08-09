const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {createNomiWebTaskStore} = require('./bridge/niannian_nomi_web_task_store');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'niannian-nomi-web-task-store-'));
const filePath = path.join(root, 'nomi-web-tasks.json');

async function expectCode(operation, code) {
  await assert.rejects(operation, error => error && error.code === code);
}

async function run() {
  const first = createNomiWebTaskStore({filePath});
  const grant = await first.createGrant({ownerId:'USR-A',projectId:'NN-A',projectKind:'redraw',nodeIds:['node-h3','node-second']});
  const created = await first.claimTask({
    ownerId:'USR-A',projectId:'NN-A',projectKind:'redraw',grantId:grant.id,nodeId:'node-h3',idempotencyKey:'same-click',
    submitted:{mode:'multimodal-reference',modelKey:'niannian/minimax-h3',prompt:'雨夜街头',inputAssetIds:{images:['CAS-image-9','CAS-image-1'],audio:['CAS-audio-3','CAS-audio-1'],videos:['CAS-video-3','CAS-video-1']},parameters:{aspectRatio:'16:9'}}
  });
  assert.equal(created.created, true);
  assert.equal(created.task.status, 'submitting');
  assert.deepEqual(created.task.inputAssetIds.images, ['CAS-image-9','CAS-image-1']);
  assert.deepEqual(created.task.inputAssetIds.audio, ['CAS-audio-3','CAS-audio-1']);
  assert.deepEqual(created.task.inputAssetIds.videos, ['CAS-video-3','CAS-video-1']);

  const idempotent = await first.claimTask({
    ownerId:'USR-A',projectId:'NN-A',projectKind:'redraw',grantId:grant.id,nodeId:'node-h3',idempotencyKey:'same-click',submitted:{}
  });
  assert.equal(idempotent.created, false);
  assert.equal(idempotent.task.id, created.task.id);

  await expectCode(() => first.claimTask({
    ownerId:'USR-A',projectId:'NN-A',projectKind:'redraw',grantId:grant.id,nodeId:'node-h3',idempotencyKey:'new-click',submitted:{}
  }), 'STUDIO_SPEND_CONFIRMATION_REQUIRED');

  const updated = await first.updateOwnedTask('USR-A','NN-A',created.task.id,{status:'queued',workflowId:'2085082190681038850',providerTaskId:'internal-provider-id',providerErrorCode:'WORKFLOW_DENIED'});
  assert.equal(updated.status, 'queued');
  assert.equal(updated.workflowId, '2085082190681038850');
  assert.equal(updated.providerTaskId, 'internal-provider-id');
  assert.equal(updated.providerErrorCode, 'WORKFLOW_DENIED');
  assert.equal(await first.getOwnedTask('USR-B','NN-A',created.task.id), null);
  assert.equal(await first.getOwnedTask('USR-A','NN-B',created.task.id), null);

  // 重建服务实例模拟服务重启：同一幂等键仍回读同一持久化任务，不会新建第二单。
  const restarted = createNomiWebTaskStore({filePath});
  const restored = await restarted.getOwnedTask('USR-A','NN-A',created.task.id);
  assert.equal(restored.id, created.task.id);
  assert.equal(restored.status, 'queued');
  assert.equal(restored.providerErrorCode, 'WORKFLOW_DENIED');
  const replay = await restarted.claimTask({
    ownerId:'USR-A',projectId:'NN-A',projectKind:'redraw',grantId:'missing-grant',nodeId:'node-h3',idempotencyKey:'same-click',submitted:{}
  });
  assert.equal(replay.created, false);
  assert.equal(replay.task.id, created.task.id);

  const second = await restarted.claimTask({
    ownerId:'USR-A',projectId:'NN-A',projectKind:'redraw',grantId:grant.id,nodeId:'node-second',idempotencyKey:'second-click',submitted:{inputAssetIds:{images:[],audio:[],videos:[]}}
  });
  assert.equal(second.created, true);
  console.log('NOMI_WEB_TASK_STORE_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  fs.rmSync(root, {recursive:true,force:true});
});
