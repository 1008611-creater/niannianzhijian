'use strict';

const DEFAULT_BASE_URL = 'https://www.runninghub.cn';

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
  const videoSubmitEnabled = credentialConfigured && baseUrlValid && isOn(env.NIANNIAN_CANVAS_H3_SUBMIT);
  return Object.freeze({
    provider,
    baseUrl,
    baseUrlValid,
    credentialConfigured,
    imageSubmitEnabled,
    videoSubmitEnabled
  });
}

function publicCanvasProviderStatus(env = process.env) {
  const config = readCanvasProviderConfig(env);
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    credentialConfigured: config.credentialConfigured,
    imageSubmitEnabled: config.imageSubmitEnabled,
    videoSubmitEnabled: config.videoSubmitEnabled
  };
}

module.exports = {DEFAULT_BASE_URL, readCanvasProviderConfig, publicCanvasProviderStatus};
