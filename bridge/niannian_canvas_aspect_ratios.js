'use strict';

// Shared canvas aspect-ratio vocabulary. Providers may expose a subset, but
// every node uses the same canonical values and dimensions.
const COMMON_ASPECT_RATIOS = Object.freeze(['9:16', '16:9', '1:1', '4:3', '3:4']);
const IMAGE_4K_SIZES = Object.freeze({
  '9:16': '2160x3840',
  '16:9': '3840x2160',
  '1:1': '3072x3072',
  '4:3': '2880x2160',
  '3:4': '2160x2880'
});
const COMMON_IMAGE_RESOLUTIONS = Object.freeze(['1k', '2k', '4k']);
const IMAGE_SIZES_BY_RESOLUTION = Object.freeze({
  '1k': Object.freeze({'9:16':'768x1365','16:9':'1365x768','1:1':'1024x1024','4:3':'1152x864','3:4':'864x1152'}),
  '2k': Object.freeze({'9:16':'1440x2560','16:9':'2560x1440','1:1':'2048x2048','4:3':'2048x1536','3:4':'1536x2048'}),
  '4k': IMAGE_4K_SIZES
});

// Verified against the protected Yunwu account. The shared vocabulary remains
// available to other providers, but a provider must expose only its proven subset.
const YUNWU_GENERATE_ASPECT_RATIOS = Object.freeze(['9:16']);
const YUNWU_EDIT_ASPECT_RATIOS = Object.freeze(['16:9']);

function outputSizesForRatios(ratios = COMMON_ASPECT_RATIOS) {
  return Object.freeze(Object.fromEntries([...ratios].filter(ratio => IMAGE_4K_SIZES[ratio]).map(ratio => [ratio, IMAGE_4K_SIZES[ratio]])));
}

module.exports = {COMMON_ASPECT_RATIOS, COMMON_IMAGE_RESOLUTIONS, IMAGE_4K_SIZES, IMAGE_SIZES_BY_RESOLUTION, YUNWU_GENERATE_ASPECT_RATIOS, YUNWU_EDIT_ASPECT_RATIOS, outputSizesForRatios};
