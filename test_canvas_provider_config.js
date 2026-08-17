const assert = require('assert/strict');
const {readCanvasProviderConfig, publicCanvasProviderStatus} = require('./bridge/niannian_canvas_provider_config');

function run() {
  const missing = readCanvasProviderConfig({});
  assert.equal(missing.provider, 'yunwu-agent-vault');
  assert.equal(missing.credentialConfigured, false);
  assert.equal(missing.imageSubmitEnabled, false);
  assert.equal(missing.videoSubmitEnabled, false);
  assert.equal(missing.animateSubmitEnabled, false);
  assert.equal(missing.dolaSubmitEnabled, false);

  const configured = readCanvasProviderConfig({
    AGENT_VAULT_ADDR:'http://127.0.0.1:14321', AGENT_VAULT_VAULT:'niannian-production', AGENT_VAULT_TOKEN:'protected-test-token', HTTPS_PROXY:'http://127.0.0.1:14322', NIANNIAN_CANVAS_YUNWU_SUBMIT:'on',
    NIANNIAN_CANVAS_H3_SUBMIT: 'on',
    NOMI_RUNNINGHUB_H3_API_KEY:'configured-consumer-key-only-in-test',
    NIANNIAN_RUNNINGHUB_ANIMATE_API_KEY:'configured-consumer-key-only-in-test',
    NIANNIAN_CANVAS_ANIMATE_SUBMIT:'on',
    NIANNIAN_DOLA_API_URL:'https://dola.internal.example/',
    NIANNIAN_DOLA_API_KEY:'configured-dola-key-only-in-test',
    NIANNIAN_CANVAS_DOLA_SUBMIT:'on'
  });
  assert.equal(configured.baseUrl, 'https://www.runninghub.cn');
  assert.equal(configured.credentialConfigured, false);
  assert.equal(configured.imageSubmitEnabled, true);
  assert.equal(configured.videoSubmitEnabled, true);
  assert.equal(configured.animateCredentialConfigured, true);
  assert.equal(configured.animateSubmitEnabled, true);
  assert.equal(configured.dolaSubmitEnabled, true);
  assert.equal(configured.dolaApiUrl, 'https://dola.internal.example');

  const noConsumerFallback = readCanvasProviderConfig({
    NIANNIAN_CANVAS_H3_SUBMIT:'on',
    NIANNIAN_CANVAS_ANIMATE_SUBMIT:'on'
  });
  assert.equal(noConsumerFallback.videoSubmitEnabled, false);
  assert.equal(noConsumerFallback.animateSubmitEnabled, false);
  assert.equal(noConsumerFallback.dolaSubmitEnabled, false);

  const publicStatus = publicCanvasProviderStatus({
    AGENT_VAULT_ADDR:'http://127.0.0.1:14321', AGENT_VAULT_VAULT:'niannian-production', AGENT_VAULT_TOKEN:'protected-test-token', HTTPS_PROXY:'http://127.0.0.1:14322', NIANNIAN_CANVAS_YUNWU_SUBMIT:'on',
    NIANNIAN_CANVAS_H3_SUBMIT: 'off'
  });
  assert.equal(publicStatus.provider, 'yunwu-agent-vault');
  assert.equal(publicStatus.baseUrl, 'https://www.runninghub.cn');
  assert.equal(publicStatus.credentialConfigured, false);
  assert.equal(publicStatus.imageSubmitEnabled, true);
  assert.equal(publicStatus.videoSubmitEnabled, false);
  assert.equal(publicStatus.animateSubmitEnabled, false);
  assert.equal(publicStatus.dolaSubmitEnabled, false);
  assert.equal(Object.hasOwn(publicStatus, 'animateCredentialConfigured'), false);
  assert.equal(Object.hasOwn(publicStatus, 'h3CredentialConfigured'), false);
  assert.equal(Object.hasOwn(publicStatus, 'dolaApiUrl'), false);
  assert.equal(Object.hasOwn(publicStatus, 'dolaCredentialConfigured'), false);
  assert.deepEqual(publicStatus.imageChannels.map(channel => [channel.id, channel.submitEnabled, channel.outputSizes]), [
    ['yunwu-gpt-image-2-c', true, {'4k':'2160x3840','4k · 3:4':'2160x2880'}],
    ['yunwu-gpt-image-2-c-edit', true, {'4k':'3840x2160'}]
  ]);
  const yunwu = readCanvasProviderConfig({AGENT_VAULT_ADDR:'http://127.0.0.1:14321',AGENT_VAULT_VAULT:'niannian-production',AGENT_VAULT_TOKEN:'protected-test-token',HTTPS_PROXY:'http://127.0.0.1:14322',NIANNIAN_CANVAS_YUNWU_SUBMIT:'on'});
  assert.equal(yunwu.imageChannelEnabled['yunwu-gpt-image-2-c'], true);
  assert.equal(Object.hasOwn(publicStatus, 'apiKey'), false);
  console.log('CANVAS_PROVIDER_CONFIG_CONTRACT_OK');
}

run();
