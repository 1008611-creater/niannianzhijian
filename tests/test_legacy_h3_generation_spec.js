'use strict';

const assert = require('assert');
const {normalizeGenerationCanvas, normalizeLegacyH3Node} = require('../bridge/niannian_canvas_storyboard_groups');

const legacy = {
  id:'shot-5',
  kind:'video',
  type:'video',
  skillKey:'minimaxh3skill',
  title:'镜头 5',
  data:{prompt:'只完成第1组的0.0-5.0秒进门子段'}
};

const normalized = normalizeLegacyH3Node({...legacy});
assert.equal(normalized.meta.modelKey, 'minimax-h3');
assert.equal(normalized.meta.aspectRatio, '9:16');
assert.equal(normalized.meta.resolution, '2k');
assert.equal(normalized.meta.durationSeconds, 5);
assert.equal(normalized.data.aspectRatio, '9:16');
assert.equal(normalized.parameters.resolution, '2k');

const explicit = normalizeLegacyH3Node({
  ...legacy,
  meta:{modelKey:'minimax-h3', aspectRatio:'16:9', resolution:'4k', durationSeconds:8}
});
assert.equal(explicit.meta.aspectRatio, '16:9');
assert.equal(explicit.meta.resolution, '4k');
assert.equal(explicit.meta.durationSeconds, 8);

const canvas = normalizeGenerationCanvas({nodes:[legacy],groups:[]});
assert.equal(canvas.nodes[0].meta.aspectRatio, '9:16');
assert.equal(canvas.nodes[0].groupId, 'storyboard-unassigned');

console.log('legacy H3 generation spec compatibility: ok');
