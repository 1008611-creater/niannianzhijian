'use strict';

const CHANNELS = Object.freeze({
  'yunwu-gpt-image-2-c': Object.freeze({
    id: 'yunwu-gpt-image-2-c',
    provider: 'yunwu-agent-vault',
    label: '云雾 Image2 竖版 4K',
    resolutions: Object.freeze(['4k']),
    aspectRatios: Object.freeze(['9:16']),
    outputSizes: Object.freeze({'4k': '2160x3840'})
  }),
  'yunwu-gpt-image-2-c-edit': Object.freeze({
    id: 'yunwu-gpt-image-2-c-edit',
    provider: 'yunwu-agent-vault',
    label: '云雾 Image2 图改图 4K',
    resolutions: Object.freeze(['4k']),
    aspectRatios: Object.freeze(['16:9']),
    outputSizes: Object.freeze({'4k': '3840x2160'})
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
  return Object.freeze({
    imageChannel: channel.id,
    imageChannelLabel: channel.label,
    imageProvider: channel.provider,
    resolution,
    aspectRatio,
    outputSize: channel.outputSizes[resolution] || null
  });
}

function publicImage2Channel(channel, configured = false) {
  return {
    id: channel.id,
    label: channel.label,
    provider: channel.provider,
    resolutions: [...channel.resolutions],
    aspectRatios: [...channel.aspectRatios],
    outputSizes: {...channel.outputSizes},
    submitEnabled: configured === true
  };
}

module.exports = {CHANNELS, resolveImage2Channel, normalizeImage2Spec, publicImage2Channel};
