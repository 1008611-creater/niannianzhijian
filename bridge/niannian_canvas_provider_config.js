'use strict';

const DEFAULT_BASE_URL = 'https://www.runninghub.cn';
const DEFAULT_YUNFEI_BASE_URL = 'https://img.yunfei.best';
const {CHANNELS, publicImage2Channel} = require('./niannian_canvas_image2_channels');

function isOn(value) {
  return String(value || '').trim().toLowerCase() === 'on';
}

function isConfigured(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function readCanvasProviderConfig(env = process.env) {
  const provider = 'runninghub';
  const credentialConfigured = isConfigured(env.RUNNINGHUB_API_KEY);
  const baseUrl = String(env.RUNNINGHUB_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '') || DEFAULT_BASE_URL;
  const baseUrlValid = /^https:\/\//.test(baseUrl);
  const imageSubmitEnabled = credentialConfigured && baseUrlValid && isOn(env.NIANNIAN_CANVAS_PROVIDER_SUBMIT);
  const yunfei1kBaseUrl = String(env.YUNFEI_IMAGE2_1K_BASE_URL || DEFAULT_YUNFEI_BASE_URL).trim().replace(/\/+$/, '') || DEFAULT_YUNFEI_BASE_URL;
  const yunfeiHdBaseUrl = String(env.YUNFEI_IMAGE2_HD_BASE_URL || DEFAULT_YUNFEI_BASE_URL).trim().replace(/\/+$/, '') || DEFAULT_YUNFEI_BASE_URL;
  const yunfei1kSubmitEnabled = isConfigured(env.YUNFEI_IMAGE2_1K_API_KEY) && /^https:\/\//.test(yunfei1kBaseUrl) && isOn(env.NIANNIAN_CANVAS_YUNFEI_1K_SUBMIT);
  const yunfeiHdSubmitEnabled = isConfigured(env.YUNFEI_IMAGE2_HD_API_KEY) && /^https:\/\//.test(yunfeiHdBaseUrl) && isOn(env.NIANNIAN_CANVAS_YUNFEI_HD_SUBMIT);
  const imageChannelEnabled = Object.freeze({
    [CHANNELS['runninghub-gpt-image-2'].id]: imageSubmitEnabled,
    [CHANNELS['yunfei-gpt-image-2-1k'].id]: yunfei1kSubmitEnabled,
    [CHANNELS['yunfei-gpt-image-2-hd'].id]: yunfeiHdSubmitEnabled
  });
  const videoSubmitEnabled = credentialConfigured && baseUrlValid && isOn(env.NIANNIAN_CANVAS_H3_SUBMIT);
  const animateCredentialConfigured = isConfigured(env.NIANNIAN_RUNNINGHUB_ANIMATE_API_KEY);
  const animateSubmitEnabled = animateCredentialConfigured && baseUrlValid && isOn(env.NIANNIAN_CANVAS_ANIMATE_SUBMIT);
  return Object.freeze({
    provider,
    baseUrl,
    baseUrlValid,
    credentialConfigured,
    imageSubmitEnabled: Object.values(imageChannelEnabled).some(Boolean),
    runningHubImageSubmitEnabled: imageSubmitEnabled,
    imageChannelEnabled,
    imageChannels: Object.freeze(Object.values(CHANNELS).map(channel => publicImage2Channel(channel, imageChannelEnabled[channel.id]))),
    yunfei1kBaseUrl,
    yunfeiHdBaseUrl,
    yunfei1kSubmitEnabled,
    yunfeiHdSubmitEnabled,
    videoSubmitEnabled,
    animateCredentialConfigured,
    animateSubmitEnabled
  });
}

function publicCanvasProviderStatus(env = process.env) {
  const config = readCanvasProviderConfig(env);
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    credentialConfigured: config.credentialConfigured,
    imageSubmitEnabled: config.imageSubmitEnabled,
    imageChannels: config.imageChannels,
    videoSubmitEnabled: config.videoSubmitEnabled,
    animateSubmitEnabled: config.animateSubmitEnabled
  };
}

module.exports = {DEFAULT_BASE_URL, DEFAULT_YUNFEI_BASE_URL, readCanvasProviderConfig, publicCanvasProviderStatus};
