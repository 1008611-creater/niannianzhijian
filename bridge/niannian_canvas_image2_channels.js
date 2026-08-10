'use strict';

const CHANNELS = Object.freeze({
  'runninghub-gpt-image-2': Object.freeze({
    id: 'runninghub-gpt-image-2',
    provider: 'runninghub',
    label: 'RunningHub Image2',
    resolutions: Object.freeze(['1k', '2k', '4k']),
    aspectRatios: Object.freeze(['1:1', '3:2', '2:3', '3:4', '4:3', '16:9', '9:16']),
    outputSizes: Object.freeze({})
  }),
  'yunfei-gpt-image-2-1k': Object.freeze({
    id: 'yunfei-gpt-image-2-1k',
    provider: 'yunfei-1k',
    label: '云飞 Image2 1K',
    resolutions: Object.freeze(['1k']),
    aspectRatios: Object.freeze(['1:1']),
    outputSizes: Object.freeze({'1k': '1024x1024'})
  }),
  'yunfei-gpt-image-2-hd': Object.freeze({
    id: 'yunfei-gpt-image-2-hd',
    provider: 'yunfei-hd',
    label: '云飞 Image2 高清',
    resolutions: Object.freeze(['2k', '4k']),
    aspectRatios: Object.freeze(['16:9']),
    outputSizes: Object.freeze({'2k': '2048x1152', '4k': '3840x2160'})
  })
});

const LEGACY_CHANNELS = Object.freeze({
  image2: 'runninghub-gpt-image-2',
  'runninghub-image2-image': 'runninghub-gpt-image-2',
  'runninghub-image2': 'runninghub-gpt-image-2'
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
  const id = LEGACY_CHANNELS[clean(value)] || clean(value) || 'runninghub-gpt-image-2';
  return CHANNELS[id] || null;
}

function normalizeImage2Spec(input = {}) {
  const channel = resolveImage2Channel(input.imageChannel || input.model || input.channel);
  if (!channel) throw channelError('CANVAS_IMAGE2_CHANNEL_INVALID', '请选择已接入的 Image2 作图渠道');
  const resolution = clean(input.resolution || '2k', 8).toLowerCase();
  const aspectRatio = clean(input.aspectRatio || input.aspect_ratio || '1:1', 16);
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
