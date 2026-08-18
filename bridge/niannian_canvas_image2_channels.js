'use strict';

const {COMMON_ASPECT_RATIOS, outputSizesForRatios} = require('./niannian_canvas_aspect_ratios');

const CHANNELS = Object.freeze({
  'yunwu-gpt-image-2-c': Object.freeze({
    id: 'yunwu-gpt-image-2-c',
    provider: 'yunwu-agent-vault',
    label: '云雾 Image2 4K',
    resolutions: Object.freeze(['4k']),
    aspectRatios: COMMON_ASPECT_RATIOS,
    outputSizes: Object.freeze({'4k': '2160x3840'}),
    outputSizesByAspectRatio: Object.freeze({
      '4k': outputSizesForRatios()
    })
  }),
  'yunwu-gpt-image-2-c-edit': Object.freeze({
    id: 'yunwu-gpt-image-2-c-edit',
    provider: 'yunwu-agent-vault',
    label: '云雾 Image2 图改图 4K',
    resolutions: Object.freeze(['4k']),
    aspectRatios: COMMON_ASPECT_RATIOS,
    outputSizes: Object.freeze({'4k': '3840x2160'}),
    outputSizesByAspectRatio: Object.freeze({'4k': outputSizesForRatios()})
  })
});

function channelError(code, message, httpStatus = 422) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function clean(value, limit = 80) {
  return String(value == null ? '' : value).trim().slice(0, limit);
}

function resolveImage2Channel(value) {
  const id = clean(value) || 'yunwu-gpt-image-2-c';
  return CHANNELS[id] || null;
}

function normalizeImage2Spec(input = {}) {
  const channel = resolveImage2Channel(input.imageChannel || input.model || input.channel);
  if (!channel) throw channelError('CANVAS_IMAGE2_CHANNEL_INVALID', '请选择已接入的 Image2 作图渠道');
  const resolution = clean(input.resolution || '4k', 8).toLowerCase();
  const aspectRatio = clean(input.aspectRatio || input.aspect_ratio || (channel.id === 'yunwu-gpt-image-2-c-edit' ? '16:9' : '9:16'), 16);
  if (!channel.resolutions.includes(resolution)) {
    throw channelError('CANVAS_IMAGE2_RESOLUTION_UNSUPPORTED', `${channel.label}不支持 ${resolution.toUpperCase()} 输出`);
  }
  if (!channel.aspectRatios.includes(aspectRatio)) {
    throw channelError('CANVAS_IMAGE2_ASPECT_RATIO_UNSUPPORTED', `${channel.label}不支持 ${aspectRatio} 比例`);
  }
  const outputSize = clean(input.outputSize || input.imageSize, 32);
  const expectedOutputSize = expectedOutputSizeFor(channel, resolution, aspectRatio);
  if (outputSize && outputSize !== expectedOutputSize) {
    throw channelError('CANVAS_IMAGE2_OUTPUT_SIZE_UNSUPPORTED', `${channel.label}不支持 ${outputSize} 输出尺寸`);
  }
  return Object.freeze({
    imageChannel: channel.id,
    imageChannelLabel: channel.label,
    imageProvider: channel.provider,
    resolution,
    aspectRatio,
    outputSize: expectedOutputSize
  });
}

function publicImage2Channel(channel, configured = false) {
  const outputSizes = {...channel.outputSizes};
  for (const [resolution, ratios] of Object.entries(channel.outputSizesByAspectRatio || {})) {
    for (const [ratio, size] of Object.entries(ratios || {})) {
      outputSizes[`${resolution} · ${ratio}`] = size;
    }
  }
  return {
    id: channel.id,
    label: channel.label,
    provider: channel.provider,
    resolutions: [...channel.resolutions],
    aspectRatios: [...channel.aspectRatios],
    outputSizes,
    outputSizesByAspectRatio: JSON.parse(JSON.stringify(channel.outputSizesByAspectRatio || {})),
    submitEnabled: configured === true
  };
}

function expectedOutputSizeFor(channel, resolution, aspectRatio) {
  return channel.outputSizesByAspectRatio?.[resolution]?.[aspectRatio]
    || channel.outputSizes[resolution]
    || null;
}

module.exports = {CHANNELS, resolveImage2Channel, normalizeImage2Spec, publicImage2Channel, expectedOutputSizeFor};
