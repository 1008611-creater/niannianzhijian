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

function outputSizesForRatios(ratios = COMMON_ASPECT_RATIOS) {
  return Object.freeze(Object.fromEntries([...ratios].filter(ratio => IMAGE_4K_SIZES[ratio]).map(ratio => [ratio, IMAGE_4K_SIZES[ratio]])));
}

module.exports = {COMMON_ASPECT_RATIOS, IMAGE_4K_SIZES, outputSizesForRatios};
