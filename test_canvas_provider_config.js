const assert = require('assert/strict');
const {readCanvasProviderConfig, publicCanvasProviderStatus} = require('./bridge/niannian_canvas_provider_config');

function run() {
  const missing = readCanvasProviderConfig({});
  assert.equal(missing.provider, 'runninghub');
  assert.equal(missing.credentialConfigured, false);
  assert.equal(missing.imageSubmitEnabled, false);
  assert.equal(missing.videoSubmitEnabled, false);
  assert.equal(missing.animateSubmitEnabled, false);

  const configured = readCanvasProviderConfig({
    RUNNINGHUB_API_KEY: 'configured-only-in-test',
    RUNNINGHUB_BASE_URL: 'https://www.runninghub.cn/',
    NIANNIAN_CANVAS_PROVIDER_SUBMIT: 'on',
    NIANNIAN_CANVAS_H3_SUBMIT: 'on',
    NIANNIAN_RUNNINGHUB_ANIMATE_API_KEY:'configured-consumer-key-only-in-test',
    NIANNIAN_CANVAS_ANIMATE_SUBMIT:'on'
  });
  assert.equal(configured.baseUrl, 'https://www.runninghub.cn');
  assert.equal(configured.credentialConfigured, true);
  assert.equal(configured.imageSubmitEnabled, true);
  assert.equal(configured.videoSubmitEnabled, true);
  assert.equal(configured.animateCredentialConfigured, true);
  assert.equal(configured.animateSubmitEnabled, true);

  const noConsumerFallback = readCanvasProviderConfig({
    RUNNINGHUB_API_KEY:'enterprise-key-only-in-test',
    NIANNIAN_CANVAS_ANIMATE_SUBMIT:'on'
  });
  assert.equal(noConsumerFallback.animateSubmitEnabled, false);

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
  assert.equal(publicStatus.animateSubmitEnabled, false);
  assert.equal(Object.hasOwn(publicStatus, 'animateCredentialConfigured'), false);
  assert.deepEqual(publicStatus.imageChannels.map(channel => [channel.id, channel.submitEnabled, channel.outputSizes]), [
    ['runninghub-gpt-image-2', true, {}],
    ['yunfei-gpt-image-2-1k', false, {'1k':'1024x1024'}],
    ['yunfei-gpt-image-2-hd', false, {'2k':'2048x1152','4k':'3840x2160'}],
    ['yunwu-gpt-image-2-c', false, {'4k':'2160x3840'}]
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
  const yunwu = readCanvasProviderConfig({AGENT_VAULT_ADDR:'http://127.0.0.1:14321',AGENT_VAULT_VAULT:'niannian-production',AGENT_VAULT_TOKEN:'protected-test-token',HTTPS_PROXY:'http://127.0.0.1:14322',NIANNIAN_CANVAS_YUNWU_SUBMIT:'on'});
  assert.equal(yunwu.imageChannelEnabled['yunwu-gpt-image-2-c'], true);
  assert.equal(Object.hasOwn(publicStatus, 'apiKey'), false);
  console.log('CANVAS_PROVIDER_CONFIG_CONTRACT_OK');
}

run();
