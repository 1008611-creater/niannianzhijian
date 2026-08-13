'use strict';

const assert = require('node:assert/strict');
const {normalizeSkillNode, validateDocumentSkillNodes} = require('./bridge/niannian_canvas_skill_nodes');

const base = {
  id: 'animate-node-001',
  type: 'video',
  skillKey: 'runninghub-animate-motion-transfer',
  skillVersion: '1.0.0',
  description: '把原片动作迁移到已采用角色图',
  inputPorts: [
    {id: 'image_asset', type: 'image_asset', required: true},
    {id: 'motion_video', type: 'motion_video', required: true}
  ],
  outputPorts: [{id: 'video_asset', type: 'video_asset'}],
  parameters: {durationSeconds: 5, aspectRatio: '9:16'},
  assetRefs: [
    {assetId: 'asset-image-001', projectId: 'NN-TEST-A', role: 'character_reference'},
    {assetId: 'asset-video-001', projectId: 'NN-TEST-A', role: 'motion_source'}
  ],
  taskRef: {id: 'task-001', idempotencyKey: 'idem-001', status: 'queued'},
  status: 'queued',
  preview: {type: 'video', assetId: 'asset-video-001', width: 720, height: 1280, durationSeconds: 5},
  recovery: {actions: ['retry', 'reconcile_task']}
};

const normalized = normalizeSkillNode(base, {projectId: 'NN-TEST-A'});
assert.equal(normalized.nodeId, 'animate-node-001');
assert.equal(normalized.skillKey, 'runninghub-animate-motion-transfer');
assert.equal(normalized.assetRefs.length, 2);
assert.deepEqual(normalized.recovery.actions, ['retry', 'reconcile_task']);

const legacy = normalizeSkillNode({id: 'legacy-image-001', type: 'image', data: {assetIds: ['asset-legacy'], prompt: '测试'}}, {projectId: 'NN-TEST-A'});
assert.equal(legacy.skillKey, 'image2-storyboard-video');
assert.equal(legacy.legacyAdapted, true);
assert.equal(legacy.assetRefs[0].assetId, 'asset-legacy');

assert.throws(
  () => normalizeSkillNode({...base, skillKey: 'unknown-skill'}, {projectId: 'NN-TEST-A'}),
  error => error.code === 'CANVAS_SKILL_NODE_UNKNOWN_SKILL',
);
assert.throws(
  () => normalizeSkillNode({...base, inputPorts: [{id: 'bad id', type: 'image_asset'}]}, {projectId: 'NN-TEST-A'}),
  error => error.code === 'CANVAS_SKILL_NODE_PORTS_INVALID',
);
assert.throws(
  () => normalizeSkillNode({...base, assetRefs: [{assetId: 'asset-foreign', projectId: 'NN-OTHER'}]}, {projectId: 'NN-TEST-A'}),
  error => error.code === 'CANVAS_SKILL_NODE_CROSS_PROJECT_ASSET',
);
assert.throws(
  () => normalizeSkillNode({...base, parameters: {apiKey: 'not-persisted'}}, {projectId: 'NN-TEST-A'}),
  error => error.code === 'CANVAS_SKILL_NODE_SENSITIVE_FIELD',
);
assert.throws(
  () => normalizeSkillNode({...base, status: 'pretend_done'}, {projectId: 'NN-TEST-A'}),
  error => error.code === 'CANVAS_SKILL_NODE_STATUS_INVALID',
);

const documentNodes = validateDocumentSkillNodes({nodes: [base, {id: 'legacy-text-001', type: 'text', data: {prompt: '测试'}}]}, 'NN-TEST-A');
assert.equal(documentNodes.length, 2);
assert.equal(documentNodes[1].skillKey, 'niannian-text-generation');

console.log('CANVAS_SKILL_NODE_CONTRACT_OK');
