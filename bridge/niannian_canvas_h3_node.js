'use strict';

// H3 follows the same canvas-node contract as Image2. Persisting this node is
// intentionally separate from creating or authorizing a provider job.
const H3_NODE_ID = 's3-h3-video';
const PORTS = Object.freeze({
  inputPorts: Object.freeze([
    {id:'prompt', type:'prompt', required:true},
    {id:'image_asset', type:'image_asset', required:true, multiple:true}
  ]),
  outputPorts: Object.freeze([{id:'video_asset', type:'video_asset', required:false}])
});

function clean(value, limit = 2000) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, '').trim().slice(0, limit);
}

function ids(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => clean(value, 120))
    .filter(value => /^[A-Za-z0-9_.:-]{2,120}$/.test(value)))].slice(0, 9);
}

function resolution(value) {
  const normalized = clean(value, 16).toLowerCase();
  return ['1k', '2k', '4k'].includes(normalized) ? normalized : '2k';
}

function createH3Node({projectId, referenceAssetIds = [], existingNode = null} = {}) {
  const assetIds = ids(referenceAssetIds);
  const prior = existingNode && typeof existingNode === 'object' ? existingNode : {};
  const priorData = prior.data && typeof prior.data === 'object' ? prior.data : {};
  const prompt = clean(priorData.prompt || prior.prompt, 4000);
  const aspectRatio = ['9:16', '16:9', '1:1', '4:3', '3:4'].includes(clean(priorData.aspectRatio || prior.aspectRatio || '9:16', 16))
    ? clean(priorData.aspectRatio || prior.aspectRatio || '9:16', 16)
    : '9:16';
  const outputResolution = resolution(priorData.resolution || prior.resolution);
  const durationSeconds = Math.max(4, Math.min(15, Number(priorData.durationSeconds || prior.durationSeconds || 5)));
  const firstFrameAssetId = assetIds[0] || null;
  const parameters = {model:'minimax-h3', aspectRatio, resolution:outputResolution, durationSeconds, firstFrameAssetId, providerSubmitRequested:false, gateState:'awaiting_user_authorization'};
  const assetRefs = assetIds.map((assetId, index) => ({assetId, projectId, role:index === 0 ? 'first_frame' : 'reference_asset'}));
  const status = prompt && firstFrameAssetId ? 'ready' : 'blocked';
  const description = '使用已编译的视频提示词和项目内关键帧生成视频；保存、任务、授权、轮询和资产回库均通过念念服务端。';
  return {
    id:H3_NODE_ID,
    type:'video',
    kind:'video',
    skillKey:'minimaxh3skill',
    skillVersion:'1.0.0',
    description,
    inputPorts:PORTS.inputPorts,
    outputPorts:PORTS.outputPorts,
    parameters,
    assetRefs,
    status,
    preview:prior.preview || null,
    recovery:{actions:['repair_input','reselect_asset','retry','reconcile_task'],lastAction:null},
    position:prior.position || {x:1320,y:500},
    data:{
      title:'H3 生视频',
      note:'输入视频提示词和关键帧参考，先建立安全候选，再由用户授权生成。',
      prompt,
      assetIds,
      inputAssetIds:assetIds,
      firstFrameAssetId,
      model:'minimax-h3',
      modelKey:'minimax-h3',
      modelAlias:'minimax-h3',
      aspectRatio,
      resolution:outputResolution,
      durationSeconds,
      status,
      skillKey:'minimaxh3skill',
      skillVersion:'1.0.0',
      description,
      inputPorts:PORTS.inputPorts,
      outputPorts:PORTS.outputPorts,
      parameters,
      assetRefs,
      preview:prior.preview || null,
      recovery:{actions:['repair_input','reselect_asset','retry','reconcile_task'],lastAction:null}
    }
  };
}

module.exports = {H3_NODE_ID, PORTS, createH3Node, ids, resolution};
