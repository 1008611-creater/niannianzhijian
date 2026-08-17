'use strict';

const assert = require('node:assert/strict');
const groups = require('./bridge/niannian_canvas_storyboard_groups');

const now = 1770000000000;
const characterAsset = 'CAS-000000000000000000000019';
const sceneAsset = 'CAS-000000000000000000000001';
const propAsset = 'CAS-000000000000000000000011';

const normalized = groups.normalizeGenerationCanvas({
  nodes:[
    {id:'character-asset',kind:'asset',categoryId:'characters',meta:{canvasAssetId:characterAsset}},
    {id:'scene-asset',kind:'asset',categoryId:'scenes',meta:{canvasAssetId:sceneAsset}},
    {id:'prop-asset',kind:'asset',categoryId:'props',meta:{canvasAssetId:propAsset}},
    {id:'legacy-image',kind:'image',categoryId:'characters',groupId:'E01-G2',meta:{inputAssetIds:[characterAsset]}},
    {id:'legacy-video',kind:'video',categoryId:'props',groupId:'E01-G1',meta:{firstFrameAssetId:sceneAsset}}
  ],
  edges:[],
  groups:[
    {id:'E01-G1',name:'分镜·E01-G1 进门侵入',categoryId:'shots',nodeIds:[],createdAt:now,updatedAt:now},
    {id:'E01-G2',name:'分镜·E01-G2 汤碗施压',categoryId:'shots',nodeIds:[],createdAt:now,updatedAt:now},
    {id:'characters-root',name:'角色',categoryId:'characters',nodeIds:['character-asset'],createdAt:now,updatedAt:now}
  ]
}, {now});

assert.deepEqual(normalized.groupTaxonomy.topLevel.map(item => item.name), ['分镜','角色','场景','道具','声音']);
assert.equal(normalized.nodes.find(node => node.id === 'character-asset').categoryId, 'characters');
assert.equal(normalized.nodes.find(node => node.id === 'scene-asset').categoryId, 'scenes');
assert.equal(normalized.nodes.find(node => node.id === 'prop-asset').categoryId, 'props');
assert.equal(normalized.nodes.find(node => node.id === 'legacy-image').categoryId, 'shots');
assert.equal(normalized.nodes.find(node => node.id === 'legacy-video').categoryId, 'shots');
assert.equal(normalized.nodes.find(node => node.id === 'legacy-image').shotId, 'E01-G2');
assert.equal(normalized.nodes.find(node => node.id === 'legacy-video').shotId, 'E01-G1');
assert.deepEqual(normalized.groups.find(group => group.id === 'E01-G1').nodeIds, ['legacy-video']);
assert.deepEqual(normalized.groups.find(group => group.id === 'E01-G1').assetIds, [sceneAsset]);
assert.deepEqual(normalized.groups.find(group => group.id === 'E01-G2').nodeIds, ['legacy-image']);
assert.deepEqual(normalized.groups.find(group => group.id === 'E01-G2').assetIds, [characterAsset]);
assert.equal(normalized.nodes.filter(node => node.kind === 'asset').length, 3);

const reloaded = groups.normalizeGenerationCanvas(normalized, {now});
assert.deepEqual(reloaded, normalized);
assert.deepEqual(groups.resolveProjectGenerationDefaults({}), {aspectRatio:'9:16',durationSeconds:5});
assert.deepEqual(groups.resolveProjectGenerationDefaults({metadata:{generationDefaults:{videoAspectRatio:'9:16',videoDurationSeconds:5}}}), {aspectRatio:'9:16',durationSeconds:5});

console.log(JSON.stringify({ok:true,verified:[
  'image and video nodes always normalize into storyboard child groups',
  'confirmed character scene and prop assets remain in their source categories',
  'shot id node ids and asset dependencies survive a second normalization',
  'H3 project defaults resolve to vertical five-second segments'
]}));
