'use strict';

// The canvas is intentionally permissive for historical nodes, but any node
// that opts into the Skill contract is validated strictly at the persistence
// boundary. This keeps old projects readable while preventing new nodes from
// silently claiming capabilities they do not have.

const NODE_ID_RE = /^[A-Za-z0-9_-]{4,120}$/;
const PORT_ID_RE = /^[A-Za-z][A-Za-z0-9_-]{1,63}$/;
const STATUS = new Set(['draft', 'blocked', 'ready', 'queued', 'running', 'needs_review', 'succeeded', 'failed', 'review']);
const KINDS = new Set(['intent', 'source_input', 'analysis', 'timeline', 'adaptation', 'character', 'scene', 'shot', 'reference', 'image', 'video', 'smart_cut', 'director', 'delivery', 'note', 'text', 'skill']);

const SKILLS = Object.freeze({
  'mx-shortdrama-00-router': {version: '1.0.0', kinds: ['intent', 'source_input', 'skill'], inputs: ['source_video', 'rights_declaration'], outputs: ['source_asset', 'preflight_report']},
  'mx-shortdrama-01-frame-extract': {version: '1.0.0', kinds: ['analysis', 'skill'], inputs: ['source_video'], outputs: ['evidence_manifest', 'shot_frames']},
  'mx-shortdrama-02-source-timeline': {version: '1.0.0', kinds: ['timeline', 'skill'], inputs: ['evidence_manifest'], outputs: ['accepted_timeline']},
  'mx-shortdrama-03-mexico-localize': {version: '1.0.0', kinds: ['adaptation', 'skill'], inputs: ['accepted_timeline'], outputs: ['adaptation_candidate']},
  'mx-shortdrama-04-character-assets': {version: '1.0.0', kinds: ['character', 'scene', 'reference', 'skill'], inputs: ['accepted_timeline'], outputs: ['reference_asset']},
  'image2-storyboard-video': {version: '1.0.0', kinds: ['image', 'reference', 'skill'], inputs: ['prompt', 'reference_asset'], outputs: ['image_asset']},
  'minimaxh3skill': {version: '1.0.0', kinds: ['video', 'skill'], inputs: ['image_asset', 'prompt'], outputs: ['video_asset']},
  'runninghub-animate-motion-transfer': {version: '1.0.0', kinds: ['video', 'skill'], inputs: ['image_asset', 'motion_video'], outputs: ['video_asset']},
  'mx-shortdrama-production-harness': {version: '1.0.0', kinds: ['director', 'delivery', 'smart_cut', 'skill'], inputs: ['project_assets'], outputs: ['editor_session', 'delivery_asset']},
  'niannian-text-generation': {version: '1.0.0', kinds: ['text', 'note', 'skill'], inputs: ['prompt'], outputs: ['text_result']}
});

const SAFE_KEY_RE = /(?:api.?key|token|secret|password|cookie|authorization|signed.?url|signature|provider.?task|raw.?response|data.?url|private.?key)/i;
const SAFE_VALUE_RE = /(?:^data:[^,]+,|\bsk-[A-Za-z0-9]|-----BEGIN |[?&](?:sig|signature|token|expires)=)/i;

function text(value, limit = 2000) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, limit);
}

function contractError(code, message, details = {}) {
  return Object.assign(new Error(message), {code, httpStatus: 422, details});
}

function assertSafe(value, path = 'node', seen = new Set()) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (SAFE_VALUE_RE.test(value)) throw contractError('CANVAS_SKILL_NODE_SENSITIVE_FIELD', `Skill 节点包含禁止持久化的敏感值（${path}）`);
    return;
  }
  if (typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (SAFE_KEY_RE.test(key)) throw contractError('CANVAS_SKILL_NODE_SENSITIVE_FIELD', `Skill 节点包含禁止持久化的字段（${path}.${key}）`);
    assertSafe(child, `${path}.${key}`, seen);
  }
}

function defaultPorts(skillKey) {
  const spec = SKILLS[skillKey];
  return {
    inputPorts: spec.inputs.map((id, index) => ({id, type: id, required: index === 0})),
    outputPorts: spec.outputs.map(id => ({id, type: id, required: false}))
  };
}

function normalizePorts(value, direction, fallback) {
  if (value == null) return fallback;
  if (!Array.isArray(value)) throw contractError('CANVAS_SKILL_NODE_PORTS_INVALID', `${direction} 必须是数组`);
  return value.slice(0, 32).map((port, index) => {
    if (!port || typeof port !== 'object' || Array.isArray(port)) throw contractError('CANVAS_SKILL_NODE_PORTS_INVALID', `${direction}[${index}] 不是对象`);
    const id = text(port.id || port.name, 64);
    const type = text(port.type || port.valueType, 80);
    if (!PORT_ID_RE.test(id) || !type) throw contractError('CANVAS_SKILL_NODE_PORTS_INVALID', `${direction}[${index}] 的 id/type 无效`);
    return {id, type, required: port.required === true, multiple: port.multiple === true};
  });
}

function normalizeAssetRefs(value, projectId, fallbackIds = []) {
  const source = value == null ? fallbackIds.map(assetId => ({assetId, role: 'input'})) : value;
  if (!Array.isArray(source)) throw contractError('CANVAS_SKILL_NODE_ASSETS_INVALID', 'assetRefs 必须是数组');
  return source.slice(0, 48).map((item, index) => {
    const ref = typeof item === 'string' ? {assetId: item} : item;
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) throw contractError('CANVAS_SKILL_NODE_ASSETS_INVALID', `assetRefs[${index}] 无效`);
    const assetId = text(ref.assetId || ref.id, 120);
    if (!assetId || !/^[A-Za-z0-9_.:-]{2,120}$/.test(assetId)) throw contractError('CANVAS_SKILL_NODE_ASSETS_INVALID', `assetRefs[${index}] 缺少合法 assetId`);
    const refProjectId = text(ref.projectId, 120);
    if (refProjectId && refProjectId !== projectId) throw contractError('CANVAS_SKILL_NODE_CROSS_PROJECT_ASSET', `素材 ${assetId} 不属于当前项目`);
    return {assetId, role: text(ref.role, 80) || 'input', version: text(ref.version, 80) || null};
  });
}

function normalizeTaskRef(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw contractError('CANVAS_SKILL_NODE_TASK_INVALID', 'taskRef 必须是对象');
  const id = text(value.id || value.taskId, 160);
  if (id && !/^[A-Za-z0-9_.:-]{2,160}$/.test(id)) throw contractError('CANVAS_SKILL_NODE_TASK_INVALID', 'taskRef.id 无效');
  return {id: id || null, idempotencyKey: text(value.idempotencyKey, 160) || null, status: text(value.status, 40) || null};
}

function normalizePreview(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw contractError('CANVAS_SKILL_NODE_PREVIEW_INVALID', 'preview 必须是对象');
  const type = text(value.type, 20);
  if (!['image', 'video', 'frames', 'text'].includes(type)) throw contractError('CANVAS_SKILL_NODE_PREVIEW_INVALID', 'preview.type 无效');
  return {type, assetId: text(value.assetId, 120) || null, width: Number.isFinite(Number(value.width)) ? Math.max(0, Math.min(100000, Number(value.width))) : null, height: Number.isFinite(Number(value.height)) ? Math.max(0, Math.min(100000, Number(value.height))) : null, durationSeconds: Number.isFinite(Number(value.durationSeconds)) ? Math.max(0, Math.min(100000, Number(value.durationSeconds))) : null, createdAt: text(value.createdAt, 80) || null};
}

function normalizeRecovery(value) {
  if (value == null) return {actions: ['retry'], lastAction: null};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw contractError('CANVAS_SKILL_NODE_RECOVERY_INVALID', 'recovery 必须是对象');
  const actions = Array.isArray(value.actions) ? [...new Set(value.actions.map(item => text(item, 40)).filter(item => ['retry', 'repair_input', 'reselect_asset', 'reconcile_task', 'rollback'].includes(item)))] : [];
  return {actions, lastAction: text(value.lastAction, 40) || null};
}

function inferSkillKey(node, data) {
  const model = text(data.modelKey || data.model || data.videoChannel, 200).toLowerCase();
  if (model.includes('animate')) return 'runninghub-animate-motion-transfer';
  if (model.includes('h3') || model.includes('minimax')) return 'minimaxh3skill';
  if (node.type === 'image' || node.type === 'reference') return 'image2-storyboard-video';
  if (node.type === 'text' || node.type === 'note') return 'niannian-text-generation';
  if (node.type === 'director' || node.type === 'delivery' || node.type === 'smart_cut') return 'mx-shortdrama-production-harness';
  if (node.type === 'analysis') return 'mx-shortdrama-01-frame-extract';
  if (node.type === 'timeline') return 'mx-shortdrama-02-source-timeline';
  if (node.type === 'adaptation') return 'mx-shortdrama-03-mexico-localize';
  if (node.type === 'character' || node.type === 'scene') return 'mx-shortdrama-04-character-assets';
  return node.type === 'video' ? 'minimaxh3skill' : 'mx-shortdrama-00-router';
}

function normalizeSkillNode(node, {projectId, index = 0} = {}) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  const data = node.data && typeof node.data === 'object' && !Array.isArray(node.data) ? node.data : {};
  const explicit = Boolean(node.skillKey || data.skillKey || node.skillVersion || data.skillVersion || node.nodeId || node.kind === 'skill' || data.skill);
  const nodeId = text(node.nodeId || node.id, 120);
  const kind = text(node.kind || node.type, 40) || 'skill';
  const skillKey = text(node.skillKey || data.skillKey || data.skill?.key, 120) || inferSkillKey(node, data);
  if (!SKILLS[skillKey]) {
    if (!explicit) return null;
    throw contractError('CANVAS_SKILL_NODE_UNKNOWN_SKILL', `未知 Skill：${skillKey}`);
  }
  if (!NODE_ID_RE.test(nodeId)) {
    if (!explicit) return null;
    throw contractError('CANVAS_SKILL_NODE_ID_INVALID', `Skill 节点 nodeId 无效：${nodeId || index}`);
  }
  if (!KINDS.has(kind) || !SKILLS[skillKey].kinds.includes(kind)) {
    if (!explicit) return null;
    throw contractError('CANVAS_SKILL_NODE_KIND_INVALID', `Skill ${skillKey} 不支持节点 kind：${kind}`);
  }
  assertSafe(node, `nodes[${index}]`);
  const ports = defaultPorts(skillKey);
  const status = text(node.status || data.status, 40) || 'draft';
  if (!STATUS.has(status)) throw contractError('CANVAS_SKILL_NODE_STATUS_INVALID', `Skill 节点状态无效：${status}`);
  const parameters = node.parameters || data.parameters || data.params || {};
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw contractError('CANVAS_SKILL_NODE_PARAMETERS_INVALID', 'parameters 必须是对象');
  assertSafe(parameters, `nodes[${index}].parameters`);
  return {
    nodeId,
    kind,
    skillKey,
    skillVersion: text(node.skillVersion || data.skillVersion, 40) || SKILLS[skillKey].version,
    description: text(node.description || data.description || data.note || data.title || kind, 1600),
    inputPorts: normalizePorts(node.inputPorts || data.inputPorts, 'inputPorts', ports.inputPorts),
    outputPorts: normalizePorts(node.outputPorts || data.outputPorts, 'outputPorts', ports.outputPorts),
    parameters,
    assetRefs: normalizeAssetRefs(node.assetRefs || data.assetRefs, projectId, [...new Set([...(Array.isArray(data.assetIds) ? data.assetIds : []), ...(Array.isArray(data.inputAssetIds) ? data.inputAssetIds : [])].map(value => text(value, 120)).filter(Boolean))]),
    taskRef: normalizeTaskRef(node.taskRef || data.taskRef),
    status,
    preview: normalizePreview(node.preview || data.preview),
    recovery: normalizeRecovery(node.recovery || data.recovery),
    legacyAdapted: !explicit
  };
}

function validateDocumentSkillNodes(document, projectId) {
  const nodes = Array.isArray(document?.nodes) ? document.nodes : [];
  return nodes.map((node, index) => normalizeSkillNode(node, {projectId, index})).filter(Boolean);
}

module.exports = {SKILLS, STATUS, normalizeSkillNode, validateDocumentSkillNodes, contractError};
