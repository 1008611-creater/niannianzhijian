const assert = require('assert/strict');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const {createNomiRunningHubH3, readImageWorkflowCatalog, targetFor, verifyConsumerUsage} = require('./bridge/niannian_nomi_runninghub_h3');
const {validateH3MediaMetadata} = require('./bridge/niannian_h3_media_validation');

function image(index) { return {id:`CAS-${String(index).padStart(24, '0')}`,storedPath:`C:/test/${index}.png`,mimeType:'image/png',originalName:`${index}.png`}; }

async function run() {
  const catalog = {5:{workflowId:'2085000000000000001',endpointPath:'/openapi/v2/run/ai-app/2085000000000000001',imageNodes:['4','19','20','21','23'],targetNode:'6',promptNode:'7'}};
  const h3 = createNomiRunningHubH3({imageWorkflows:catalog});
  const draft = h3.dryRun({prompt:'五张资产图共同锁定人物、场景和道具',aspectRatio:'9:16',durationSeconds:10,images:[1,2,3,4,5].map(image),audio:[],videos:[]});
  assert.equal(draft.mode, 'image-5');
  assert.equal(draft.workflowId, catalog[5].workflowId);
  assert.deepEqual(draft.nodeInfoList.filter(item => item.fieldName === 'image').map(item => item.nodeId), catalog[5].imageNodes);
  assert.equal(draft.endpointPath, catalog[5].endpointPath);
  assert.deepEqual(draft.target, {aspectRatio:'9:16',durationSeconds:10,width:480,height:832});
  assert.throws(() => h3.dryRun({prompt:'x',images:[1,2,3,4].map(image),audio:[],videos:[]}), error => error?.code === 'NOMI_H3_IMAGE_WORKFLOW_UNPUBLISHED');
  assert.throws(() => h3.dryRun({prompt:'x',images:Array.from({length:10}, (_, index) => image(index)),audio:[],videos:[]}), error => error?.code === 'NOMI_H3_IMAGE_REFERENCE_LIMIT');
  assert.throws(() => readImageWorkflowCatalog({5:{workflowId:'2085000000000000001',imageNodes:['4','19','20','21','23'],targetNode:'6',promptNode:'7'}}), error => error?.code === 'NOMI_H3_IMAGE_WORKFLOW_CONFIG_INVALID');
  assert.deepEqual(Object.keys(readImageWorkflowCatalog(catalog)), ['5']);
  assert.deepEqual(targetFor({aspectRatio:'16:9',durationSeconds:5}), {aspectRatio:'16:9',durationSeconds:5,width:832,height:480});
  assert.deepEqual(targetFor({aspectRatio:'9:16',durationSeconds:5,images:[image(1)]}), {aspectRatio:'9:16',durationSeconds:5,width:576,height:1024});
  assert.deepEqual(targetFor({aspectRatio:'9:16',durationSeconds:5,width:480,height:832,images:[image(1)]}), {aspectRatio:'9:16',durationSeconds:5,width:576,height:1024});
  assert.deepEqual(targetFor({aspectRatio:'9:16',durationSeconds:5,images:[image(1),image(2)]}), {aspectRatio:'9:16',durationSeconds:5,width:480,height:832});
  assert.throws(() => targetFor({aspectRatio:'9:16',width:832,height:480}), error => error?.code === 'NOMI_H3_TARGET_DIMENSION_MISMATCH');
  assert.throws(() => targetFor({durationSeconds:3}), error => error?.code === 'NOMI_H3_DURATION_OUT_OF_RANGE');
  assert.deepEqual(verifyConsumerUsage({consumeCoins:12,consumeMoney:0}), {consumeCoins:12,consumeMoney:0});
  assert.throws(() => verifyConsumerUsage({consumeCoins:12,consumeMoney:1}), error => error?.code === 'NOMI_H3_BILLING_UNVERIFIED');
  assert.throws(() => verifyConsumerUsage({consumeCoins:0,consumeMoney:0}), error => error?.code === 'NOMI_H3_BILLING_UNVERIFIED');
  assert.equal(validateH3MediaMetadata({width:480,height:832,durationSeconds:10.125}, draft.target).width, 480);
  assert.throws(() => validateH3MediaMetadata({width:832,height:480,durationSeconds:10}, draft.target), error => error?.code === 'H3_TARGET_DIMENSION_MISMATCH');
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nomi-h3-contract-'));
  try {
    const assets = await Promise.all([1,2,3,4,5].map(async index => {
      const storedPath = path.join(tempRoot, `${index}.png`);
      await fs.writeFile(storedPath, `image-${index}`);
      return {...image(index),storedPath};
    }));
    let uploads = 0;
    let submittedPayload = null;
    const submitted = createNomiRunningHubH3({apiKey:'consumer-test-key',imageWorkflows:catalog,fetchImpl:async (url, init) => {
      if (String(url).endsWith('/openapi/v2/media/upload/binary')) return {ok:true,json:async () => ({data:{fileName:`uploaded-${++uploads}.png`}})};
      if (String(url).endsWith(catalog[5].endpointPath)) {
        submittedPayload = JSON.parse(init.body);
        return {ok:true,json:async () => ({data:{taskId:'consumer-task-5'}})};
      }
      throw new Error(`unexpected request ${url}`);
    }});
    const receipt = await submitted.submit({prompt:'五张图顺序测试',aspectRatio:'9:16',durationSeconds:10,images:assets,audio:[],videos:[]});
    assert.equal(receipt.taskId, 'consumer-task-5');
    assert.equal(uploads, 5);
    assert.equal(submittedPayload.instanceType, 'ultra');
    assert.deepEqual(submittedPayload.nodeInfoList.filter(item => item.fieldName === 'image').map(item => [item.nodeId,item.fieldValue]), [['4','uploaded-1.png'],['19','uploaded-2.png'],['20','uploaded-3.png'],['21','uploaded-4.png'],['23','uploaded-5.png']]);
  } finally {
    await fs.rm(tempRoot, {recursive:true,force:true});
  }
  const rejected = createNomiRunningHubH3({apiKey:'consumer-test-key',fetchImpl:async () => ({ok:true,json:async () => ({code:'WORKFLOW_DENIED',errorMessage:'private provider detail must not escape'})})});
  await assert.rejects(() => rejected.submit({prompt:'结构化拒绝测试',images:[],audio:[],videos:[]}), error => error?.code === 'RUNNINGHUB_PROVIDER_REJECTED' && error?.providerCode === 'WORKFLOW_DENIED' && !String(error?.message).includes('private'));
  const originalConsumerKey = process.env.NOMI_RUNNINGHUB_H3_API_KEY;
  const originalGenericKey = process.env.RUNNINGHUB_API_KEY;
  try {
    delete process.env.NOMI_RUNNINGHUB_H3_API_KEY;
    process.env.RUNNINGHUB_API_KEY = 'enterprise-key-must-not-be-used';
    let requestMade = false;
    const isolated = createNomiRunningHubH3({fetchImpl:async () => { requestMade = true; throw new Error('request must not be made'); }});
    await assert.rejects(() => isolated.submit({prompt:'消费级凭据隔离测试',images:[],audio:[],videos:[]}), error => error?.code === 'RUNNINGHUB_CREDENTIAL_NOT_CONFIGURED');
    assert.equal(requestMade, false);
  } finally {
    if (originalConsumerKey === undefined) delete process.env.NOMI_RUNNINGHUB_H3_API_KEY;
    else process.env.NOMI_RUNNINGHUB_H3_API_KEY = originalConsumerKey;
    if (originalGenericKey === undefined) delete process.env.RUNNINGHUB_API_KEY;
    else process.env.RUNNINGHUB_API_KEY = originalGenericKey;
  }
  console.log('NOMI_H3_MULTI_REFERENCE_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
