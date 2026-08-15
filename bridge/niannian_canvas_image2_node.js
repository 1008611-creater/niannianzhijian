'use strict';

// S2 Image2 node contract. This only persists a canvas node; provider work is
// created later through the normal generation-job authorization gate.
const IMAGE2_NODE_ID = 's2-image2-keyframe';
const PORTS = Object.freeze({
  inputPorts: Object.freeze([
    {id:'prompt', type:'prompt', required:true},
    {id:'reference_asset', type:'reference_asset', required:false, multiple:true}
  ]),
  outputPorts: Object.freeze([{id:'image_asset', type:'image_asset', required:false}])
});

function clean(value, limit = 2000) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, '').trim().slice(0, limit);
}

function ids(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => clean(value, 120))
    .filter(value => /^[A-Za-z0-9_.:-]{2,120}$/.test(value)))].slice(0, 24);
}

function createImage2Node({projectId, referenceAssetIds = [], existingNode = null} = {}) {
  const assetIds = ids(referenceAssetIds);
  const prior = existingNode && typeof existingNode === 'object' ? existingNode : {};
  const priorData = prior.data && typeof prior.data === 'object' ? prior.data : {};
  const imageChannel = clean(priorData.imageChannel || prior.imageChannel || 'yunwu-gpt-image-2-c', 80);
  const resolution = clean(priorData.resolution || prior.resolution || '4k', 8).toLowerCase();
  const aspectRatio = clean(priorData.aspectRatio || prior.aspectRatio || '9:16', 16);
  const prompt = clean(priorData.prompt || prior.prompt, 4000);
  const parameters = {imageChannel, resolution, aspectRatio, outputSize: clean(priorData.outputSize || prior.outputSize, 32) || null, providerSubmitRequested:false, gateState:'awaiting_user_authorization'};
  const assetRefs = assetIds.map(assetId => ({assetId, projectId, role:'reference_asset'}));
  return {
    id: IMAGE2_NODE_ID,
    type: 'image',
    kind: 'image',
    skillKey: 'image2-storyboard-video',
    skillVersion: '1.0.0',
    description: '使用提示词和角色/场景参考资产生成关键帧图片；先校验规格，再由用户授权调用 Image2。',
    inputPorts: PORTS.inputPorts,
    outputPorts: PORTS.outputPorts,
    parameters,
    assetRefs,
    status: assetIds.length || prompt ? 'ready' : 'draft',
    preview: prior.preview || null,
    recovery: {actions:['repair_input','reselect_asset','retry','reconcile_task'], lastAction:null},
    position: prior.position || {x:120, y:500},
    data: {
      title:'Image2 关键帧生成',
      note:'输入提示词和参考资产，选择渠道、比例与输出尺寸。',
      prompt,
      assetIds,
      inputAssetIds:assetIds,
      imageChannel,
      resolution,
      aspectRatio,
      outputSize:parameters.outputSize,
      status:assetIds.length || prompt ? 'ready' : 'draft',
      skillKey:'image2-storyboard-video',
      skillVersion:'1.0.0',
      description:'使用提示词和角色/场景参考资产生成关键帧图片；先校验规格，再由用户授权调用 Image2。',
      inputPorts:PORTS.inputPorts,
      outputPorts:PORTS.outputPorts,
      parameters,
      assetRefs,
      preview:prior.preview || null,
      recovery:{actions:['repair_input','reselect_asset','retry','reconcile_task'],lastAction:null}
    }
  };
}

module.exports = {IMAGE2_NODE_ID, PORTS, createImage2Node, ids};
