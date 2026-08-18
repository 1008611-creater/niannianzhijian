'use strict';

const DEFAULT_BASE_URL = 'https://www.runninghub.cn';
const {CHANNELS, publicUnifiedImage2Channel} = require('./niannian_canvas_image2_channels');

function isOn(value) {
  return String(value || '').trim().toLowerCase() === 'on';
}

function isConfigured(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDolaApiUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '::1'].includes(url.hostname));
  } catch {
    return false;
  }
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
  const dolaApiUrl = String(env.NIANNIAN_DOLA_API_URL || '').trim().replace(/\/+$/, '');
  const dolaCredentialConfigured = isConfigured(env.NIANNIAN_DOLA_API_KEY);
  const dolaApiUrlValid = isDolaApiUrl(dolaApiUrl);
  const dolaSubmitEnabled = dolaCredentialConfigured && dolaApiUrlValid && isOn(env.NIANNIAN_CANVAS_DOLA_SUBMIT);
  return Object.freeze({
    provider,
    baseUrl,
    baseUrlValid,
    credentialConfigured,
    imageSubmitEnabled: yunwuSubmitEnabled,
    imageChannelEnabled,
    // The edit route remains an internal adapter detail. The browser receives
    // one Image2 model with a reference-image mode and shared controls.
    imageChannels: Object.freeze([publicUnifiedImage2Channel(yunwuSubmitEnabled)]),
    yunwuSubmitEnabled,
    h3CredentialConfigured,
    videoSubmitEnabled,
    animateCredentialConfigured,
    animateSubmitEnabled,
    dolaApiUrl,
    dolaApiUrlValid,
    dolaCredentialConfigured,
    dolaSubmitEnabled
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
    animateSubmitEnabled: config.animateSubmitEnabled,
    dolaSubmitEnabled: config.dolaSubmitEnabled
  };
}

// The browser-facing catalog deliberately contains capabilities and pricing only.
// Provider addresses, credential presence, and submit switches belong to the
// administrator control plane and must never be used as a user configuration API.
function publicCanvasModelCatalog(env = process.env) {
  const config = readCanvasProviderConfig(env);
  return {
    schemaVersion: 'niannian.canvas_model_catalog.v1',
    models: [
      ...config.imageChannels.map(channel => ({
        id: channel.id,
        label: channel.label,
        kind: 'image',
        providerLabel: '云雾',
        enabled: channel.submitEnabled === true,
        resolutions: channel.resolutions,
        aspectRatios: channel.aspectRatios,
        outputSizes: channel.outputSizes,
        outputSizesByAspectRatio: channel.outputSizesByAspectRatio || {},
        imageOptions: {
          aspectRatioOptions: channel.catalogAspectRatios || channel.aspectRatios.map(value => ({value, label: value})),
          imageSizeOptions: channel.catalogImageSizeOptions || Object.entries(channel.outputSizesByAspectRatio?.['4k'] || {}).map(([ratio, value]) => ({value, label: `${value}（${ratio}）`, aspectRatio: ratio})),
          resolutionOptions: channel.catalogResolutions || channel.resolutions.map(value => ({value, label: value.toUpperCase()})),
          defaultAspectRatio: channel.defaultAspectRatio,
          defaultImageSize: channel.defaultImageSize,
          defaultResolution: channel.resolutions[0],
          supportsReferenceImages: channel.supportsReferenceImages === true,
          supportsTextToImage: channel.supportsTextToImage === true,
          supportsImageToImage: channel.supportsImageToImage === true,
          modes: channel.modes || [],
          controls: [
            {key: 'aspect_ratio', label: '比例', binding: 'aspectRatio', optionSource: 'aspectRatioOptions'},
            {key: 'outputSize', label: '大小', binding: 'imageSize', optionSource: 'imageSizeOptions'},
            {key: 'resolution', label: '清晰度', binding: 'resolution', optionSource: 'resolutionOptions'}
          ]
        },
        supportsReferenceImages: channel.supportsReferenceImages === true,
        supportsTextToImage: channel.supportsTextToImage === true,
        supportsImageToImage: channel.supportsImageToImage === true,
        priceCredits: channel.priceCredits,
        priceCreditsByMode: channel.priceCreditsByMode || {}
      })),
      {
        id: 'minimax-h3',
        label: 'H3 生视频',
        kind: 'video',
        providerLabel: 'RunningHub',
        enabled: config.videoSubmitEnabled === true,
        resolutions: ['2k'],
        aspectRatios: ['9:16', '16:9', '1:1', '4:3', '3:4'],
        outputSizes: {},
        priceCredits: 20
      },
      {
        id: 'dola-seedance-2-5',
        label: 'Dola Seedance 2.5（30秒）',
        kind: 'video',
        providerLabel: 'Dola',
        enabled: config.dolaSubmitEnabled === true,
        resolutions: ['720p'],
        aspectRatios: ['9:16', '16:9', '1:1', '4:3', '3:4'],
        outputSizes: {},
        priceCredits: 0
      }
    ]
  };
}

module.exports = {DEFAULT_BASE_URL, readCanvasProviderConfig, publicCanvasProviderStatus, publicCanvasModelCatalog, isDolaApiUrl};
