'use strict';

const {COMMON_ASPECT_RATIOS, COMMON_IMAGE_RESOLUTIONS, YUNWU_GENERATE_ASPECT_RATIOS, YUNWU_EDIT_ASPECT_RATIOS, outputSizesForRatios} = require('./niannian_canvas_aspect_ratios');

const CHANNELS = Object.freeze({
  'yunwu-gpt-image-2-c': Object.freeze({
    id: 'yunwu-gpt-image-2-c',
    provider: 'yunwu-agent-vault',
    label: '云雾 Image2 4K',
    resolutions: Object.freeze(['4k']),
    aspectRatios: YUNWU_GENERATE_ASPECT_RATIOS,
    outputSizes: Object.freeze({'4k': '2160x3840'}),
    outputSizesByAspectRatio: Object.freeze({
      '4k': outputSizesForRatios(YUNWU_GENERATE_ASPECT_RATIOS)
    })
  }),
  'yunwu-gpt-image-2-c-edit': Object.freeze({
    id: 'yunwu-gpt-image-2-c-edit',
    provider: 'yunwu-agent-vault',
    label: '云雾 Image2 图改图 4K',
    resolutions: Object.freeze(['4k']),
    aspectRatios: YUNWU_EDIT_ASPECT_RATIOS,
    outputSizes: Object.freeze({'4k': '3840x2160'}),
    outputSizesByAspectRatio: Object.freeze({'4k': outputSizesForRatios(YUNWU_EDIT_ASPECT_RATIOS)})
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
  const requestedChannel = resolveImage2Channel(input.imageChannel || input.model || input.channel);
  const referenceCount = Math.max(0, Number(input.referenceCount || input.inputAssetCount || 0) || 0);
  const legacyEditRequested = requestedChannel?.id === 'yunwu-gpt-image-2-c-edit';
  const channel = legacyEditRequested || referenceCount > 0
    ? CHANNELS['yunwu-gpt-image-2-c-edit']
    : CHANNELS['yunwu-gpt-image-2-c'];
  if (!requestedChannel) throw channelError('CANVAS_IMAGE2_CHANNEL_INVALID', '请选择已接入的 Image2 作图渠道');
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
    generationMode: channel.id === 'yunwu-gpt-image-2-c-edit' ? 'reference-image-edit' : 'text-to-image',
    referenceCount,
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

function publicUnifiedImage2Channel(configured = false) {
  const generate = CHANNELS['yunwu-gpt-image-2-c'];
  const edit = CHANNELS['yunwu-gpt-image-2-c-edit'];
  const outputSizesByAspectRatio = {
    '4k': {
      ...outputSizesForRatios(generate.aspectRatios),
      ...outputSizesForRatios(edit.aspectRatios)
    }
  };
  const outputSizes = {'4k': generate.outputSizes['4k']};
  for (const [ratio, size] of Object.entries(outputSizesByAspectRatio['4k'])) outputSizes[`4k · ${ratio}`] = size;
  return {
    id: generate.id,
    label: '云雾 Image2',
    provider: generate.provider,
    resolutions: ['4k'],
    aspectRatios: [...new Set([...generate.aspectRatios, ...edit.aspectRatios])],
    outputSizes,
    outputSizesByAspectRatio,
    submitEnabled: configured === true,
    supportsTextToImage: true,
    supportsImageToImage: true,
    supportsReferenceImages: true,
    defaultAspectRatio: '9:16',
    defaultImageSize: outputSizesByAspectRatio['4k']['9:16'],
    catalogAspectRatios: COMMON_ASPECT_RATIOS.map(value => ({value, label: value + (generate.aspectRatios.includes(value) || edit.aspectRatios.includes(value) ? '' : '（待验证）'), available: generate.aspectRatios.includes(value) || edit.aspectRatios.includes(value)})),
    catalogResolutions: COMMON_IMAGE_RESOLUTIONS.map(value => ({value, label:value.toUpperCase() + (value === '4k' ? '' : '（待验证）'), available: value === '4k'})),
    modes: [
      {id: 'text-to-image', label: '文生图', referenceRequired: false, aspectRatios: [...generate.aspectRatios], outputSizesByAspectRatio: JSON.parse(JSON.stringify(generate.outputSizesByAspectRatio)), priceCredits: 10},
      {id: 'reference-image-edit', label: '添加参考图', referenceRequired: true, aspectRatios: [...edit.aspectRatios], outputSizesByAspectRatio: JSON.parse(JSON.stringify(edit.outputSizesByAspectRatio)), priceCredits: 12}
    ],
    priceCredits: 10,
    priceCreditsByMode: {'text-to-image': 10, 'reference-image-edit': 12}
  };
}

function expectedOutputSizeFor(channel, resolution, aspectRatio) {
  return channel.outputSizesByAspectRatio?.[resolution]?.[aspectRatio]
    || channel.outputSizes[resolution]
    || null;
}

module.exports = {CHANNELS, resolveImage2Channel, normalizeImage2Spec, publicImage2Channel, publicUnifiedImage2Channel, expectedOutputSizeFor};
