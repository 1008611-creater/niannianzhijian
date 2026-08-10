'use strict';

const assert = require('assert/strict');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const {createYunfeiImage2Adapter} = require('./bridge/niannian_yunfei_image2_adapter');

async function run() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-yunfei-image2-'));
  try {
    const referencePath = path.join(root, 'reference.png');
    const output = await sharp({create:{width:16,height:16,channels:4,background:{r:10,g:20,b:30,alpha:1}}}).png().toBuffer();
    await fsp.writeFile(referencePath, output);
    const calls = [];
    const adapter = createYunfeiImage2Adapter({
      baseUrl:'https://img.yunfei.best',
      apiKey:'configured-only-in-test',
      fetchImpl:async (url, options) => {
        calls.push({url, options});
        return {ok:true,json:async () => ({data:[{b64_json:output.toString('base64')} ]})};
      }
    });
    const dryRun = adapter.dryRun({output_size:'3840x2160'}, [referencePath]);
    assert.equal(dryRun.endpoint, '/v1/images/edits');
    assert.throws(() => adapter.dryRun({output_size:'3840x2160'}, []), error => error.code === 'YUNFEI_IMAGE_REFERENCE_REQUIRED');
    const submitted = await adapter.submit({prompt:'高清重绘',output_size:'3840x2160'}, [referencePath]);
    assert.equal(calls[0].url, 'https://img.yunfei.best/v1/images/edits');
    assert.equal(calls[0].options.headers.authorization, 'Bearer configured-only-in-test');
    assert.equal(await calls[0].options.body.get('model'), 'gpt-image-2');
    assert.equal(await calls[0].options.body.get('size'), '3840x2160');
    const result = await adapter.query(submitted.taskId, submitted.payload);
    assert.equal(result.status, 'completed');
    assert.equal(result.inlineImages.length, 1);
    console.log('YUNFEI_IMAGE2_ADAPTER_CONTRACT_OK');
  } finally {
    await fsp.rm(root, {recursive:true, force:true});
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
