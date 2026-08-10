const assert = require('assert/strict');
const {readCanvasProviderConfig, publicCanvasProviderStatus} = require('./bridge/niannian_canvas_provider_config');

function run() {
  const missing = readCanvasProviderConfig({});
  assert.equal(missing.provider, 'runninghub');
  assert.equal(missing.credentialConfigured, false);
  assert.equal(missing.imageSubmitEnabled, false);
  assert.equal(missing.videoSubmitEnabled, false);

  const configured = readCanvasProviderConfig({
    RUNNINGHUB_API_KEY: 'configured-only-in-test',
    RUNNINGHUB_BASE_URL: 'https://www.runninghub.cn/',
    NIANNIAN_CANVAS_PROVIDER_SUBMIT: 'on',
    NIANNIAN_CANVAS_H3_SUBMIT: 'on'
  });
  assert.equal(configured.baseUrl, 'https://www.runninghub.cn');
  assert.equal(configured.credentialConfigured, true);
  assert.equal(configured.imageSubmitEnabled, true);
  assert.equal(configured.videoSubmitEnabled, true);

  const publicStatus = publicCanvasProviderStatus({
    RUNNINGHUB_API_KEY: 'configured-only-in-test',
    RUNNINGHUB_BASE_URL: 'https://www.runninghub.cn',
    NIANNIAN_CANVAS_PROVIDER_SUBMIT: 'on',
    NIANNIAN_CANVAS_H3_SUBMIT: 'off'
  });
  assert.equal(publicStatus.provider, 'runninghub');
  assert.equal(publicStatus.baseUrl, 'https://www.runninghub.cn');
  assert.equal(publicStatus.credentialConfigured, true);
  assert.equal(publicStatus.imageSubmitEnabled, true);
  assert.equal(publicStatus.videoSubmitEnabled, false);
  assert.deepEqual(publicStatus.imageChannels.map(channel => [channel.id, channel.submitEnabled, channel.outputSizes]), [
    ['runninghub-gpt-image-2', true, {}],
    ['yunfei-gpt-image-2-1k', false, {'1k':'1024x1024'}],
    ['yunfei-gpt-image-2-hd', false, {'2k':'2048x1152','4k':'3840x2160'}]
  ]);
  const yunfei = readCanvasProviderConfig({
    YUNFEI_IMAGE2_1K_API_KEY:'configured-only-in-test',
    NIANNIAN_CANVAS_YUNFEI_1K_SUBMIT:'on',
    YUNFEI_IMAGE2_HD_API_KEY:'configured-only-in-test',
    NIANNIAN_CANVAS_YUNFEI_HD_SUBMIT:'on'
  });
  assert.equal(yunfei.imageSubmitEnabled, true);
  assert.equal(yunfei.imageChannelEnabled['yunfei-gpt-image-2-1k'], true);
  assert.equal(yunfei.imageChannelEnabled['yunfei-gpt-image-2-hd'], true);
  assert.equal(Object.hasOwn(publicStatus, 'apiKey'), false);
  console.log('CANVAS_PROVIDER_CONFIG_CONTRACT_OK');
}

run();
