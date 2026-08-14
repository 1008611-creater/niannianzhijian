'use strict';

// S1 canvas chain: source intake -> Step01 evidence -> Step02 timeline.
// This module only creates inspectable nodes; it never starts a provider task.

const SOURCE_NODE_ID = 's1-source-input';
const STEP01_NODE_ID = 's1-step01-analysis';
const STEP02_NODE_ID = 's1-step02-timeline';
const CHAIN_NODE_IDS = Object.freeze([SOURCE_NODE_ID, STEP01_NODE_ID, STEP02_NODE_ID]);
const LEGACY_SOURCE_ASSET_PREFIX = 'legacy-source:';

const PORTS = Object.freeze({
  source: {inputPorts:[{id:'source_video',type:'source_video',required:true},{id:'rights_declaration',type:'rights_declaration',required:true}],outputPorts:[{id:'source_asset',type:'source_asset'},{id:'preflight_report',type:'preflight_report'}]},
  step01: {inputPorts:[{id:'source_video',type:'source_video',required:true}],outputPorts:[{id:'evidence_manifest',type:'evidence_manifest'},{id:'shot_frames',type:'shot_frames'}]},
  step02: {inputPorts:[{id:'evidence_manifest',type:'evidence_manifest',required:true}],outputPorts:[{id:'accepted_timeline',type:'accepted_timeline'}]}
});

function text(value, limit = 200) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, '').trim().slice(0, limit);
}

function uniqueIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => text(value, 120)).filter(value => /^[A-Za-z0-9_.:-]{2,120}$/.test(value)))].slice(0, 8);
}

function legacySourceAssetId(projectId) { return LEGACY_SOURCE_ASSET_PREFIX + text(projectId, 120); }
function isLegacySourceAssetId(assetId, projectId) { return text(assetId, 160) === legacySourceAssetId(projectId); }

function edge(id, source, target) { return {id, source, target, kind:'depends_on'}; }

function portBinding(portId, sourceNodeId, sourcePortId, state, assetIds = []) {
  return {portId, sourceNodeId, sourcePortId, state, assetIds:[...assetIds]};
}

function replaceBinding(bindings, next) {
  const current = Array.isArray(bindings) ? bindings.filter(item => item && typeof item === 'object').map(item => ({...item})) : [];
  const index = current.findIndex(item => item.portId === next.portId);
  if (index >= 0) current[index] = {...current[index], ...next};
  else current.push(next);
  return current;
}

function ensureBinding(bindings, next) {
  const current = Array.isArray(bindings) ? bindings.filter(item => item && typeof item === 'object').map(item => ({...item})) : [];
  return current.some(item => item.portId === next.portId) ? current : [...current, next];
}

// Early S1 documents stored selected assets but predate explicit port bindings.
// Reconcile at the persistence boundary so an existing project keeps its source
// connection after reload without pretending Step01 evidence already exists.
function reconcileChainNodes(nodes, projectId) {
  if (!Array.isArray(nodes)) return [];
  const byId = new Map(nodes.filter(node => node && CHAIN_NODE_IDS.includes(node.id)).map(node => [node.id, node]));
  const source = byId.get(SOURCE_NODE_ID);
  if (!source) return nodes;
  const sourceParams = source.parameters && typeof source.parameters === 'object' ? source.parameters : {};
  const sourceData = source.data && typeof source.data === 'object' ? source.data : {};
  const assets = uniqueIds([
    ...(Array.isArray(sourceData.assetIds) ? sourceData.assetIds : []),
    ...(Array.isArray(source.assetRefs) ? source.assetRefs.map(item => item && item.assetId) : [])
  ]);
  const preflight = text(sourceParams.preflightStatus, 40) === 'passed' ? 'passed' : null;
  const sourceReady = assets.length > 0 && sourceParams.rightsConfirmed === true && preflight === 'passed';
  const sourceBindings = replaceBinding(
    replaceBinding(sourceParams.outputBindings, {portId:'source_asset', state:sourceReady ? 'ready' : 'draft', assetIds:assets}),
    {portId:'preflight_report', state:preflight === 'passed' ? 'ready' : 'draft', assetIds:[]}
  );
  const sourceAssetRefs = assets.map(assetId => ({assetId, projectId, role:'source_video'}));
  const sourceNext = {
    ...source,
    status:sourceReady ? 'ready' : 'draft',
    assetRefs:sourceAssetRefs,
    parameters:{...sourceParams, rightsConfirmed:sourceParams.rightsConfirmed === true, preflightStatus:preflight, gateState:sourceReady ? 'source_ready' : 'source_input_incomplete', outputBindings:sourceBindings},
    data:{...sourceData, assetIds:assets, status:sourceReady ? 'ready' : 'draft', assetRefs:sourceAssetRefs, parameters:{...sourceParams, rightsConfirmed:sourceParams.rightsConfirmed === true, preflightStatus:preflight, gateState:sourceReady ? 'source_ready' : 'source_input_incomplete', outputBindings:sourceBindings}}
  };
  byId.set(SOURCE_NODE_ID, sourceNext);

  const step01 = byId.get(STEP01_NODE_ID);
  if (step01) {
    const params = step01.parameters && typeof step01.parameters === 'object' ? step01.parameters : {};
    const data = step01.data && typeof step01.data === 'object' ? step01.data : {};
    const inputBindings = replaceBinding(params.inputBindings, portBinding('source_video', SOURCE_NODE_ID, 'source_asset', sourceReady ? 'ready' : 'blocked', assets));
    const outputBindings = ensureBinding(ensureBinding(params.outputBindings, {portId:'evidence_manifest', state:'blocked', assetIds:[]}), {portId:'shot_frames', state:'blocked', assetIds:[]});
    const nextParams = {...params, inputBindings, outputBindings};
    byId.set(STEP01_NODE_ID, {...step01, parameters:nextParams, data:{...data, inputAssetIds:assets, status:step01.status, parameters:nextParams}});
  }

  const step01Output = byId.get(STEP01_NODE_ID)?.parameters?.outputBindings?.find(item => item && item.portId === 'evidence_manifest');
  const evidenceReady = step01Output && step01Output.state === 'ready';
  const step02 = byId.get(STEP02_NODE_ID);
  if (step02) {
    const params = step02.parameters && typeof step02.parameters === 'object' ? step02.parameters : {};
    const data = step02.data && typeof step02.data === 'object' ? step02.data : {};
    const inputBindings = replaceBinding(params.inputBindings, portBinding('evidence_manifest', STEP01_NODE_ID, 'evidence_manifest', evidenceReady ? 'ready' : 'blocked'));
    const outputBindings = ensureBinding(params.outputBindings, {portId:'accepted_timeline', state:'blocked', assetIds:[]});
    const nextParams = {...params, inputBindings, outputBindings};
    byId.set(STEP02_NODE_ID, {...step02, parameters:nextParams, data:{...data, status:step02.status, parameters:nextParams}});
  }
  return nodes.map(node => byId.get(node?.id) || node);
}

function createChain({projectId, sourceAssetIds = [], rightsConfirmed = false, preflightStatus = null, existingNodes = []} = {}) {
  const assets = uniqueIds(sourceAssetIds);
  const preflight = text(preflightStatus, 40) === 'passed' ? 'passed' : null;
  const sourceReady = assets.length > 0 && rightsConfirmed === true && preflight === 'passed';
  const priorById = new Map((Array.isArray(existingNodes) ? existingNodes : []).filter(node => node && CHAIN_NODE_IDS.includes(node.id)).map(node => [node.id, node]));
  const position = (id, fallback) => priorById.get(id)?.position || fallback;
  const sourceNode = {
    id:SOURCE_NODE_ID,
    type:'source_input',
    kind:'source_input',
    skillKey:'mx-shortdrama-00-router',
    description:'上传有权使用的原片，完成权利声明与媒体预检后进入 Step01。',
    inputPorts:PORTS.source.inputPorts,
    outputPorts:PORTS.source.outputPorts,
    parameters:{rightsConfirmed:rightsConfirmed === true, preflightStatus:preflight, gateState:sourceReady ? 'source_ready' : 'source_input_incomplete',outputBindings:[
      {portId:'source_asset',state:sourceReady ? 'ready' : 'draft',assetIds:assets},
      {portId:'preflight_report',state:preflight === 'passed' ? 'ready' : 'draft',assetIds:[]}
    ]},
    assetRefs:assets.map(assetId => ({assetId, projectId, role:'source_video'})),
    status:sourceReady ? 'ready' : 'draft',
    recovery:{actions:['repair_input','reselect_asset'],lastAction:null},
    position:position(SOURCE_NODE_ID, {x:120,y:160}),
    data:{title:'原片输入与权利确认',note:'先上传原片并完成权利确认、媒体预检。',assetIds:assets,inputAssetIds:[],status:sourceReady ? 'ready' : 'draft',skillKey:'mx-shortdrama-00-router',description:'上传有权使用的原片，完成权利声明与媒体预检后进入 Step01。',inputPorts:PORTS.source.inputPorts,outputPorts:PORTS.source.outputPorts,parameters:{rightsConfirmed:rightsConfirmed === true,preflightStatus:preflight,gateState:sourceReady ? 'source_ready' : 'source_input_incomplete',outputBindings:[{portId:'source_asset',state:sourceReady ? 'ready' : 'draft',assetIds:assets},{portId:'preflight_report',state:preflight === 'passed' ? 'ready' : 'draft',assetIds:[]}]},assetRefs:assets.map(assetId => ({assetId,projectId,role:'source_video'})),recovery:{actions:['repair_input','reselect_asset'],lastAction:null}}
  };
  const step01Node = {
    id:STEP01_NODE_ID,
    type:'analysis',
    kind:'analysis',
    skillKey:'mx-shortdrama-01-frame-extract',
    description:'提取原片镜头、关键帧、对白、OCR 与证据清单；没有完整服务器证据时保持阻塞。',
    inputPorts:PORTS.step01.inputPorts,
    outputPorts:PORTS.step01.outputPorts,
    parameters:{profile:'hq_full',providerSubmitRequested:false,gateState:sourceReady ? 'step01_full_source_authority_blocked' : 'source_input_incomplete',blocker:sourceReady ? 'STEP01_FULL_SOURCE_AUTHORITY_PENDING' : 'SOURCE_INPUT_INCOMPLETE',inputBindings:[portBinding('source_video',SOURCE_NODE_ID,'source_asset',sourceReady ? 'ready' : 'blocked',assets)],outputBindings:[{portId:'evidence_manifest',state:'blocked',assetIds:[]},{portId:'shot_frames',state:'blocked',assetIds:[]}]},
    status:'blocked',
    recovery:{actions:['repair_input','reconcile_task'],lastAction:null},
    position:position(STEP01_NODE_ID, {x:480,y:160}),
    data:{title:'Step01 源片分析',note:sourceReady ? '等待 Haika hq_full 完整证据链，不读取旧证据。' : '先完成原片输入、权利确认和媒体预检。',assetIds:[],inputAssetIds:assets,status:'blocked',skillKey:'mx-shortdrama-01-frame-extract',description:'提取原片镜头、关键帧、对白、OCR 与证据清单；没有完整服务器证据时保持阻塞。',inputPorts:PORTS.step01.inputPorts,outputPorts:PORTS.step01.outputPorts,parameters:{profile:'hq_full',providerSubmitRequested:false,gateState:sourceReady ? 'step01_full_source_authority_blocked' : 'source_input_incomplete',blocker:sourceReady ? 'STEP01_FULL_SOURCE_AUTHORITY_PENDING' : 'SOURCE_INPUT_INCOMPLETE',inputBindings:[portBinding('source_video',SOURCE_NODE_ID,'source_asset',sourceReady ? 'ready' : 'blocked',assets)],outputBindings:[{portId:'evidence_manifest',state:'blocked',assetIds:[]},{portId:'shot_frames',state:'blocked',assetIds:[]}]},recovery:{actions:['repair_input','reconcile_task'],lastAction:null}}
  };
  const step02Node = {
    id:STEP02_NODE_ID,
    type:'timeline',
    kind:'timeline',
    skillKey:'mx-shortdrama-02-source-timeline',
    description:'只消费已验证的 Step01 证据，生成可确认的源片事实时间线。',
    inputPorts:PORTS.step02.inputPorts,
    outputPorts:PORTS.step02.outputPorts,
    parameters:{gateState:'step01_evidence_required',blocker:'STEP01_EVIDENCE_REQUIRED',inputBindings:[portBinding('evidence_manifest',STEP01_NODE_ID,'evidence_manifest','blocked')],outputBindings:[{portId:'accepted_timeline',state:'blocked',assetIds:[]}]},
    status:'blocked',
    recovery:{actions:['reconcile_task','rollback'],lastAction:null},
    position:position(STEP02_NODE_ID, {x:840,y:160}),
    data:{title:'Step02 源片时间线',note:'Step01 通过后自动解锁；不使用旧镜头或目录扫描。',assetIds:[],inputAssetIds:[],status:'blocked',skillKey:'mx-shortdrama-02-source-timeline',description:'只消费已验证的 Step01 证据，生成可确认的源片事实时间线。',inputPorts:PORTS.step02.inputPorts,outputPorts:PORTS.step02.outputPorts,parameters:{gateState:'step01_evidence_required',blocker:'STEP01_EVIDENCE_REQUIRED',inputBindings:[portBinding('evidence_manifest',STEP01_NODE_ID,'evidence_manifest','blocked')],outputBindings:[{portId:'accepted_timeline',state:'blocked',assetIds:[]}]},recovery:{actions:['reconcile_task','rollback'],lastAction:null}}
  };
  return {nodes:[sourceNode, step01Node, step02Node],edges:[edge('s1-edge-source-step01', SOURCE_NODE_ID, STEP01_NODE_ID),edge('s1-edge-step01-step02', STEP01_NODE_ID, STEP02_NODE_ID)],sourceReady};
}

function mergeChain(document, chain) {
  const current = document && typeof document === 'object' ? document : {};
  const existingNodes = Array.isArray(current.nodes) ? current.nodes : [];
  const existingEdges = Array.isArray(current.edges) ? current.edges : [];
  const chainIds = new Set(CHAIN_NODE_IDS);
  const chainEdgeIds = new Set(chain.edges.map(item => item.id));
  return {
    ...current,
    nodes:[...existingNodes.filter(node => !chainIds.has(node?.id)), ...chain.nodes],
    edges:[...existingEdges.filter(item => !chainEdgeIds.has(item?.id) && !chainIds.has(item?.source) && !chainIds.has(item?.target)), ...chain.edges]
  };
}

module.exports = {CHAIN_NODE_IDS,SOURCE_NODE_ID,STEP01_NODE_ID,STEP02_NODE_ID,LEGACY_SOURCE_ASSET_PREFIX,PORTS,createChain,mergeChain,reconcileChainNodes,uniqueIds,legacySourceAssetId,isLegacySourceAssetId,portBinding};
