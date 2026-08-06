'use strict';

const AUTHORITY_REVISION = 'mx-shortdrama-redraw-v1.4.1/full-chain-dag-contract';

const NODE_IDS = Object.freeze([
  'S01_EVIDENCE',
  'S02_SOURCE_TIMELINE',
  'S04_LOCALIZATION_COMPILE',
  'S05A_SUPPORT_ASSETS',
  'S05B_FIRST_FRAMES',
  'VIDEO_EXECUTION',
  'FINAL_QA',
  'DELIVERY'
]);

const PUBLIC_STAGES = Object.freeze([
  {key:'source-analysis', label:'原片分析', node_ids:['S01_EVIDENCE']},
  {key:'source-timeline', label:'原片时间轴', node_ids:['S02_SOURCE_TIMELINE']},
  {key:'localization', label:'地区改编', node_ids:['S04_LOCALIZATION_COMPILE']},
  {key:'assets-firstframes', label:'资产与首帧', node_ids:['S05A_SUPPORT_ASSETS','S05B_FIRST_FRAMES']},
  {key:'video', label:'视频生成', node_ids:['VIDEO_EXECUTION']},
  {key:'quality', label:'质量核验', node_ids:['FINAL_QA']},
  {key:'delivery', label:'可交付', node_ids:['DELIVERY']}
]);

const NODE_CONTRACTS = Object.freeze({
  S01_EVIDENCE:{input:['source_authority_bound'],output:['node_contract_complete','artifact_ledger_verified'],next:['S02_SOURCE_TIMELINE']},
  S02_SOURCE_TIMELINE:{input:['S01_EVIDENCE'],output:['accepted','artifact_ledger_verified'],next:['S04_LOCALIZATION_COMPILE']},
  S04_LOCALIZATION_COMPILE:{input:['S02_SOURCE_TIMELINE'],output:['accepted','character_continuity_state_complete','artifact_ledger_verified'],next:['S05A_SUPPORT_ASSETS','S05B_FIRST_FRAMES']},
  S05A_SUPPORT_ASSETS:{input:['S04_LOCALIZATION_COMPILE','dependency_closure'],output:['verified','artifact_ledger_verified'],next:['S05B_FIRST_FRAMES']},
  S05B_FIRST_FRAMES:{input:['S04_LOCALIZATION_COMPILE','declared_S05A_dependencies'],output:['verified','current_confirmation_bound','artifact_ledger_verified'],next:['VIDEO_EXECUTION']},
  VIDEO_EXECUTION:{input:['locked_video_task_spec','confirmed_references','authority_preflight'],output:['provider_downloaded','media_readback_complete'],next:['FINAL_QA']},
  FINAL_QA:{input:['VIDEO_EXECUTION'],output:['media_probe_pass','content_qa_pass','artifact_ledger_verified'],next:['DELIVERY']},
  DELIVERY:{input:['FINAL_QA'],output:['user_path_readback','artifact_ledger_delivered'],next:[]}
});

const LEGACY_DIRECT = Object.freeze({
  STEP01:'S01_EVIDENCE',
  STEP02:'S02_SOURCE_TIMELINE',
  STEP04:'S04_LOCALIZATION_COMPILE'
});

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function upper(value) { return text(value).toUpperCase(); }
function truth(value) { return value === true || ['accepted','verified','completed','passed','pass','delivered'].includes(String(value || '').toLowerCase()); }

function step03Subtype(legacy = {}) {
  const subtype = upper(legacy.subtype || legacy.output_subtype || legacy.canonical_type || legacy.type || legacy.purpose || legacy.artifact_role);
  if (/(LOCALIZATION|COMPILE|PROMPT|CONTINUITY|PLANNING)/.test(subtype)) return 'S04_LOCALIZATION_COMPILE';
  if (/(FIRST.?FRAME|VIDEO_FIRST_FRAME_ANCHOR)/.test(subtype)) return 'S05B_FIRST_FRAMES';
  if (/(SUPPORT|ASSET|CHARACTER|WARDROBE|SCENE|PROP|DOCUMENT|SCREEN)/.test(subtype)) return 'S05A_SUPPORT_ASSETS';
  return null;
}

function step05Subtype(legacy = {}) {
  const subtype = upper(legacy.subtype || legacy.output_subtype || legacy.canonical_type || legacy.type || legacy.purpose || legacy.artifact_role || legacy.status);
  if (/(DELIVER)/.test(subtype)) return 'DELIVERY';
  if (/(FINAL.?QA|CONTENT.?QA|MEDIA.?PROBE|LEDGER.?VERIFIED)/.test(subtype)) return 'FINAL_QA';
  if (/(VIDEO|PROVIDER|DOWNLOAD)/.test(subtype) && !/(FIRST.?FRAME)/.test(subtype)) return 'VIDEO_EXECUTION';
  if (/(FIRST.?FRAME|VIDEO_FIRST_FRAME_ANCHOR)/.test(subtype)) return 'S05B_FIRST_FRAMES';
  if (/(SUPPORT|ASSET|CHARACTER|WARDROBE|SCENE|PROP|DOCUMENT|SCREEN)/.test(subtype)) return 'S05A_SUPPORT_ASSETS';
  return null;
}

function resolveNodeId(legacy = {}, persisted = null) {
  const persistedId = upper(persisted?.canonical_node_id || legacy.canonical_node_id);
  if (NODE_IDS.includes(persistedId)) return persistedId;
  const legacyName = upper(legacy.legacy_step_name || legacy.step_name || legacy.step || legacy.currentNode || legacy.earliestIncompleteNode || legacy.node_id);
  const match = legacyName.match(/STEP0?([0-5])/);
  if (!match) return null;
  const step = 'STEP0' + match[1];
  if (LEGACY_DIRECT[step]) return LEGACY_DIRECT[step];
  if (step === 'STEP03') return step03Subtype(legacy);
  if (step === 'STEP05') return step05Subtype(legacy);
  return null;
}

function normalizeContract(value, required) {
  const contract = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const checks = Object.fromEntries(required.map(key => [key, truth(contract[key] ?? contract.checks?.[key])]));
  return {required:[...required], checks, satisfied:required.every(key => checks[key] === true)};
}

function stageForNode(nodeId) {
  return PUBLIC_STAGES.find(stage => stage.node_ids.includes(nodeId)) || PUBLIC_STAGES[0];
}

function blockedTrace({legacyName,nodeId,authorityRevision,inputContract,outputContract,reason}) {
  return {
    legacy_step_name:legacyName || null,
    canonical_node_id:nodeId || null,
    authority_revision:authorityRevision || null,
    input_contract:inputContract,
    output_contract:outputContract,
    downstream_gate:{eligible:false,next_node_ids:nodeId ? [...NODE_CONTRACTS[nodeId].next] : [],reason},
    resolution_status:'blocked',
    public_stage:stageForNode(nodeId).key
  };
}

function resolveCanonicalState(input = {}) {
  const legacy = input.legacy && typeof input.legacy === 'object' ? input.legacy : {};
  const persisted = input.persisted && typeof input.persisted === 'object' ? input.persisted : null;
  const legacyName = text(legacy.legacy_step_name || legacy.step_name || legacy.step || legacy.currentNode || legacy.earliestIncompleteNode || legacy.node_id) || null;
  const nodeId = resolveNodeId(legacy, persisted);
  const authorityRevision = text(persisted?.authority_revision || input.authority_revision || legacy.authority_revision) || null;
  const currentAuthorityRevision = text(input.current_authority_revision) || authorityRevision;
  if (!nodeId) return blockedTrace({legacyName,nodeId:null,authorityRevision,inputContract:{required:[],checks:{},satisfied:false},outputContract:{required:[],checks:{},satisfied:false},reason:'canonical_subtype_required'});
  const definition = NODE_CONTRACTS[nodeId];
  const inputContract = normalizeContract(persisted?.input_contract || input.input_contract || legacy.input_contract, definition.input);
  const outputContract = normalizeContract(persisted?.output_contract || input.output_contract || legacy.output_contract, definition.output);
  if (!authorityRevision || !currentAuthorityRevision) return blockedTrace({legacyName,nodeId,authorityRevision,inputContract,outputContract,reason:'authority_revision_required'});
  if (authorityRevision !== currentAuthorityRevision) return blockedTrace({legacyName,nodeId,authorityRevision,inputContract,outputContract,reason:'authority_revision_mismatch'});
  if (!inputContract.satisfied) return blockedTrace({legacyName,nodeId,authorityRevision,inputContract,outputContract,reason:'input_contract_incomplete'});
  if (!outputContract.satisfied) return blockedTrace({legacyName,nodeId,authorityRevision,inputContract,outputContract,reason:'output_contract_incomplete'});
  return {
    legacy_step_name:legacyName,
    canonical_node_id:nodeId,
    authority_revision:authorityRevision,
    input_contract:inputContract,
    output_contract:outputContract,
    downstream_gate:{eligible:true,next_node_ids:[...definition.next],reason:null},
    resolution_status:'resolved',
    public_stage:stageForNode(nodeId).key
  };
}

function publicProjection(trace) {
  const projectedNode = trace?.downstream_gate?.eligible === true && trace.downstream_gate.next_node_ids?.length
    ? trace.downstream_gate.next_node_ids[0]
    : trace?.canonical_node_id;
  const stage = stageForNode(projectedNode);
  return {
    stage_key:stage.key,
    stage_label:stage.label,
    stage_index:PUBLIC_STAGES.findIndex(item => item.key === stage.key) + 1,
    stage_count:PUBLIC_STAGES.length,
    gate:trace?.downstream_gate?.eligible === true ? 'ready' : 'blocked',
    status:trace?.resolution_status === 'resolved' ? '已验证' : '等待前置条件',
    stages:PUBLIC_STAGES.map((item,index)=>({key:item.key,label:item.label,index:index+1}))
  };
}

function legacyProjectTrace(project = {}, overrides = {}) {
  const legacy = {
    legacy_step_name:project.runtime?.currentNode || project.route?.earliestNode || null,
    currentNode:project.runtime?.currentNode,
    earliestIncompleteNode:project.runtime?.earliestIncompleteNode,
    subtype:project.runtime?.canonicalSubtype || project.runtime?.outputSubtype || null,
    status:project.productionStatus || project.runtime?.productionStatus || null
  };
  return resolveCanonicalState({
    legacy,
    persisted:project.canonical,
    authority_revision:overrides.authority_revision,
    current_authority_revision:overrides.current_authority_revision,
    input_contract:overrides.input_contract,
    output_contract:overrides.output_contract
  });
}

function assertDownstreamGate(trace, expectedNextNode, currentAuthorityRevision) {
  if (!trace || trace.resolution_status !== 'resolved' || trace.downstream_gate?.eligible !== true) {
    const error = new Error('CANONICAL_CONTRACT_BLOCKED'); error.code='CANONICAL_CONTRACT_BLOCKED'; error.httpStatus=409; throw error;
  }
  if (trace.authority_revision !== currentAuthorityRevision) {
    const error = new Error('CANONICAL_AUTHORITY_MISMATCH'); error.code='CANONICAL_AUTHORITY_MISMATCH'; error.httpStatus=409; throw error;
  }
  if (expectedNextNode && !trace.downstream_gate.next_node_ids.includes(expectedNextNode)) {
    const error = new Error('CANONICAL_DOWNSTREAM_NOT_DECLARED'); error.code='CANONICAL_DOWNSTREAM_NOT_DECLARED'; error.httpStatus=409; throw error;
  }
  return true;
}

module.exports = {AUTHORITY_REVISION,NODE_IDS,NODE_CONTRACTS,PUBLIC_STAGES,resolveNodeId,resolveCanonicalState,legacyProjectTrace,publicProjection,assertDownstreamGate,stageForNode};
