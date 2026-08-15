'use strict';

const DEFAULT_BASE_URL = 'https://www.runninghub.cn';
const {CHANNELS, publicImage2Channel} = require('./niannian_canvas_image2_channels');

function isOn(value) {
  return String(value || '').trim().toLowerCase() === 'on';
}

function isConfigured(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function readCanvasProviderConfig(env = process.env) {
  const provider = 'yunwu-agent-vault';
  const credentialConfigured = isConfigured(env.RUNNINGHUB_API_KEY);
  const baseUrl = String(env.RUNNINGHUB_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '') || DEFAULT_BASE_URL;
  const baseUrlValid = /^https:\/\//.test(baseUrl);
  const yunwuSubmitEnabled = isConfigured(env.AGENT_VAULT_ADDR) && isConfigured(env.AGENT_VAULT_VAULT) && isConfigured(env.AGENT_VAULT_TOKEN) && isConfigured(env.HTTPS_PROXY || env.https_proxy) && isOn(env.NIANNIAN_CANVAS_YUNWU_SUBMIT);
  const imageChannelEnabled = Object.freeze({
    [CHANNELS['yunwu-gpt-image-2-c'].id]: yunwuSubmitEnabled,
    [CHANNELS['yunwu-gpt-image-2-c-edit'].id]: yunwuSubmitEnabled
  });
  // H3 is billed against a consumer account and must never inherit the general
  // RunningHub key used by other canvas providers.
  const h3CredentialConfigured = isConfigured(env.NOMI_RUNNINGHUB_H3_API_KEY);
  const videoSubmitEnabled = h3CredentialConfigured && baseUrlValid && isOn(env.NIANNIAN_CANVAS_H3_SUBMIT);
  const animateCredentialConfigured = isConfigured(env.NIANNIAN_RUNNINGHUB_ANIMATE_API_KEY);
  const animateSubmitEnabled = animateCredentialConfigured && baseUrlValid && isOn(env.NIANNIAN_CANVAS_ANIMATE_SUBMIT);
  return Object.freeze({
    provider,
    baseUrl,
    baseUrlValid,
    credentialConfigured,
    imageSubmitEnabled: yunwuSubmitEnabled,
    imageChannelEnabled,
    imageChannels: Object.freeze(Object.values(CHANNELS).map(channel => publicImage2Channel(channel, imageChannelEnabled[channel.id]))),
    yunwuSubmitEnabled,
    h3CredentialConfigured,
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

module.exports = {DEFAULT_BASE_URL, readCanvasProviderConfig, publicCanvasProviderStatus};
