'use strict';

// The Studio canvas only reads the Nomi generationCanvas document.  Skill
// contracts are kept in the separate durable canvas document too, but this
// bridge projects those contracts into the visible canvas without copying any
// provider payload, media bytes, or signed URLs.

const CHAIN_PREFIX = 'nn-skill-';

function text(value, limit = 1600) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, '').trim().slice(0, limit);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function kindFor(node) {
  const skill = text(node?.skillKey || node?.data?.skillKey, 120);
  if (skill === 'mx-shortdrama-00-router') return 'video';
  if (skill === 'mx-shortdrama-04-character-assets' || skill === 'image2-storyboard-video') return 'image';
  if (skill === 'minimaxh3skill' || skill === 'runninghub-animate-motion-transfer') return 'video';
  if (skill === 'mx-shortdrama-production-harness') return text(node?.kind) === 'smart_cut' ? 'smart_cut' : 'output';
  return 'text';
}

function projectedId(node) {
  return CHAIN_PREFIX + text(node?.id || node?.nodeId, 120);
}

function projectNode(node) {
  const data = node?.data && typeof node.data === 'object' ? node.data : {};
  const parameters = node?.parameters && typeof node.parameters === 'object' ? node.parameters : data.parameters || {};
  const assetRefs = Array.isArray(node?.assetRefs) ? node.assetRefs : Array.isArray(data.assetRefs) ? data.assetRefs : [];
  const inputPorts = Array.isArray(node?.inputPorts) ? node.inputPorts : Array.isArray(data.inputPorts) ? data.inputPorts : [];
  const outputPorts = Array.isArray(node?.outputPorts) ? node.outputPorts : Array.isArray(data.outputPorts) ? data.outputPorts : [];
  const sourceId = text(node?.id || node?.nodeId, 120);
  return {
    id:projectedId(node),
    kind:kindFor(node),
    title:text(data.title || node?.title || node?.description || sourceId, 160) || sourceId,
    prompt:text(data.prompt || data.note || node?.description, 4000),
    position:{x:Number(node?.position?.x) || 120,y:Number(node?.position?.y) || 160},
    categoryId:'shots',
    groupId:text(data.storyboardGroupId || data.groupId || node?.groupId, 120) || undefined,
    shotId:text(data.shotId || node?.shotId, 120) || undefined,
    meta:{
      niannianSkillNode:true,
      sourceNodeId:sourceId,
      skillKey:text(node?.skillKey || data.skillKey, 120),
      skillVersion:text(node?.skillVersion || data.skillVersion || '1.0.0', 40),
      description:text(node?.description || data.description || data.note, 1600),
      inputPorts:clone(inputPorts),
      outputPorts:clone(outputPorts),
      parameters:clone(parameters),
      assetRefs:clone(assetRefs),
      assetIds:clone(Array.isArray(data.assetIds) ? data.assetIds : []),
      inputAssetIds:clone(Array.isArray(data.inputAssetIds) ? data.inputAssetIds : []),
      firstFrameAssetId:text(data.firstFrameAssetId || parameters.firstFrameAssetId, 120) || null,
      taskRef:clone(node?.taskRef || data.taskRef || null),
      status:text(node?.status || data.status || 'draft', 40),
      preview:clone(node?.preview || data.preview || null),
      recovery:clone(node?.recovery || data.recovery || {actions:['retry'],lastAction:null}),
      locked:true
    }
  };
}

function projectEdge(edge) {
  return {
    id:CHAIN_PREFIX + text(edge?.id, 120),
    source:CHAIN_PREFIX + text(edge?.source, 120),
    target:CHAIN_PREFIX + text(edge?.target, 120),
    mode:'reference',
    kind:text(edge?.kind || 'depends_on', 40)
  };
}

function mergeIntoGenerationCanvas(document, skillDocument) {
  const original = document && typeof document === 'object' ? clone(document) : {};
  const generationCanvas = original.generationCanvas && typeof original.generationCanvas === 'object' ? original.generationCanvas : {};
  const skillNodes = Array.isArray(skillDocument?.nodes) ? skillDocument.nodes.filter(node => text(node?.skillKey || node?.data?.skillKey, 120)) : [];
  const skillNodeIds = new Set(skillNodes.map(projectedId));
  const nodes = [
    ...(Array.isArray(generationCanvas.nodes) ? generationCanvas.nodes : []).filter(node => !String(node?.id || '').startsWith(CHAIN_PREFIX)),
    ...skillNodes.map(projectNode)
  ];
  const projectedEdges = (Array.isArray(skillDocument?.edges) ? skillDocument.edges : [])
    .filter(edge => skillNodeIds.has(CHAIN_PREFIX + text(edge?.source, 120)) && skillNodeIds.has(CHAIN_PREFIX + text(edge?.target, 120)))
    .map(projectEdge);
  const edges = [
    ...(Array.isArray(generationCanvas.edges) ? generationCanvas.edges : []).filter(edge => !String(edge?.id || '').startsWith(CHAIN_PREFIX)),
    ...projectedEdges
  ];
  return {...original,generationCanvas:{...generationCanvas,nodes,edges}};
}

module.exports = {CHAIN_PREFIX, kindFor, projectedId, projectNode, mergeIntoGenerationCanvas};
