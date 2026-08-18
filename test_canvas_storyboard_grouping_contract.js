'use strict';

const assert = require('node:assert/strict');
const groups = require('./bridge/niannian_canvas_storyboard_groups');

const now = 1770000000000;
const characterAsset = 'CAS-000000000000000000000019';
const sceneAsset = 'CAS-000000000000000000000001';
const propAsset = 'CAS-000000000000000000000011';
const firstFrameAsset = 'CAS-000000000000000000000021';

const normalized = groups.normalizeGenerationCanvas({
  nodes:[
    {id:'character-asset',kind:'asset',categoryId:'characters',meta:{canvasAssetId:characterAsset}},
    {id:'scene-asset',kind:'asset',categoryId:'scenes',meta:{canvasAssetId:sceneAsset}},
    {id:'prop-asset',kind:'asset',categoryId:'props',meta:{canvasAssetId:propAsset}},
    {id:'legacy-image',kind:'image',categoryId:'characters',groupId:'E01-G2',meta:{inputAssetIds:[characterAsset]}},
    {id:'legacy-video',kind:'video',categoryId:'props',groupId:'E01-G1',meta:{firstFrameAssetId:sceneAsset}},
    {id:'old-runninghub-h3',kind:'video',categoryId:'props',groupId:'E01-G1',title:'H3 生视频',status:'blocked',prompt:'只完成第1组的0.0-5.0秒进门子段',meta:{modelLabel:'H3 生视频',aspectRatio:'16:9',resolution:'2k'}} ,
    {id:'first-frame-image',kind:'image',categoryId:'shots',result:{type:'image',assetId:firstFrameAsset,url:'https://example.invalid/first-frame.webp'}}
  ],
  edges:[{id:'first-frame-edge',source:'first-frame-image',target:'old-runninghub-h3',mode:'reference'}],
  groups:[
    {id:'E01-G1',name:'分镜·E01-G1 进门侵入',categoryId:'shots',nodeIds:[],createdAt:now,updatedAt:now},
    {id:'E01-G2',name:'分镜·E01-G2 汤碗施压',categoryId:'shots',nodeIds:[],createdAt:now,updatedAt:now},
    {id:'characters-root',name:'角色',categoryId:'characters',nodeIds:['character-asset'],createdAt:now,updatedAt:now}
  ]
}, {now});

assert.deepEqual(normalized.groupTaxonomy.topLevel.map(item => item.name), ['分镜','角色','场景','道具','声音']);
assert.deepEqual(normalized.groups.filter(group => group.systemManaged).map(group => group.id).sort(), ['audio','characters','props','scenes','shots']);
assert.equal(normalized.groups.find(group => group.id === 'E01-G1').parentGroupId, 'shots');
assert.equal(normalized.nodes.find(node => node.id === 'character-asset').groupId, 'characters');
assert.equal(normalized.nodes.find(node => node.id === 'scene-asset').groupId, 'scenes');
assert.equal(normalized.nodes.find(node => node.id === 'prop-asset').groupId, 'props');
assert.equal(normalized.nodes.find(node => node.id === 'character-asset').categoryId, 'characters');
assert.equal(normalized.nodes.find(node => node.id === 'scene-asset').categoryId, 'scenes');
assert.equal(normalized.nodes.find(node => node.id === 'prop-asset').categoryId, 'props');
assert.equal(normalized.nodes.find(node => node.id === 'legacy-image').categoryId, 'shots');
assert.equal(normalized.nodes.find(node => node.id === 'legacy-video').categoryId, 'shots');
assert.equal(normalized.nodes.find(node => node.id === 'legacy-image').shotId, 'E01-G2');
assert.equal(normalized.nodes.find(node => node.id === 'legacy-video').shotId, 'E01-G1');
const migratedH3 = normalized.nodes.find(node => node.id === 'old-runninghub-h3');
assert.equal(migratedH3.meta.aspectRatio, '9:16');
assert.equal(migratedH3.meta.aspect_ratio, '9:16');
assert.equal(migratedH3.data.aspectRatio, '9:16');
assert.equal(migratedH3.meta.resolution, '2k');
assert.equal(migratedH3.meta.durationSeconds, 5);
assert.equal(migratedH3.meta.firstFrameAssetId, firstFrameAsset);
assert.equal(migratedH3.status, 'ready');
assert.deepEqual(migratedH3.data.inputAssetIds, [firstFrameAsset]);
assert.deepEqual(normalized.groups.find(group => group.id === 'E01-G1').nodeIds, ['legacy-video', 'old-runninghub-h3', 'first-frame-image']);
assert.deepEqual(normalized.groups.find(group => group.id === 'E01-G1').assetIds, [sceneAsset, firstFrameAsset]);
assert.deepEqual(normalized.groups.find(group => group.id === 'E01-G2').nodeIds, ['legacy-image']);
assert.deepEqual(normalized.groups.find(group => group.id === 'E01-G2').assetIds, [characterAsset]);
assert.deepEqual(normalized.groups.find(group => group.id === 'characters').nodeIds, ['character-asset']);
assert.deepEqual(normalized.groups.find(group => group.id === 'scenes').nodeIds, ['scene-asset']);
assert.deepEqual(normalized.groups.find(group => group.id === 'props').nodeIds, ['prop-asset']);
assert.equal(normalized.nodes.filter(node => node.kind === 'asset').length, 3);

const reloaded = groups.normalizeGenerationCanvas(normalized, {now});
assert.deepEqual(reloaded, normalized);
assert.deepEqual(groups.resolveProjectGenerationDefaults({}), {aspectRatio:'9:16',durationSeconds:5});
assert.deepEqual(groups.resolveProjectGenerationDefaults({metadata:{generationDefaults:{videoAspectRatio:'9:16',videoDurationSeconds:5}}}), {aspectRatio:'9:16',durationSeconds:5});
const fresh = groups.normalizeGenerationCanvas({nodes:[{id:'fresh-image',kind:'image',meta:{inputAssetIds:[characterAsset]}}],edges:[]}, {now});
assert.deepEqual(fresh.groups.filter(group => group.systemManaged).map(group => group.id).sort(), ['audio','characters','props','scenes','shots']);
assert.equal(fresh.groups.find(group => group.id === groups.DEFAULT_STORYBOARD_GROUP_ID).parentGroupId, 'shots');
assert.equal(fresh.nodes[0].groupId, groups.DEFAULT_STORYBOARD_GROUP_ID);

console.log(JSON.stringify({ok:true,verified:[
  'image and video nodes always normalize into storyboard child groups',
  'confirmed character scene and prop assets remain in their source categories',
  'shot id node ids and asset dependencies survive a second normalization',
  'H3 project defaults resolve to vertical five-second segments'
]}));
