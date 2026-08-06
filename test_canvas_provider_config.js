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
  assert.deepEqual(publicStatus, {
    provider: 'runninghub',
    baseUrl: 'https://www.runninghub.cn',
    credentialConfigured: true,
    imageSubmitEnabled: true,
    videoSubmitEnabled: false
  });
  assert.equal(Object.hasOwn(publicStatus, 'apiKey'), false);
  console.log('CANVAS_PROVIDER_CONFIG_CONTRACT_OK');
}

run();
