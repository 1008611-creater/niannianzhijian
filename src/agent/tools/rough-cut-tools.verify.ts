import assert from 'node:assert/strict';
import type { AgentContext } from '../context';
import type { ProjectDoc } from '../../editor/types';
import { execRoughCutTool } from './rough-cut-tools';

const source = {
  id: 'asset-demo', name: 'demo.mp4', kind: 'video' as const, src: '/media/uploads/demo.mp4',
  durationInFrames: 300, sourceRevision: 'source-rev-1', width: 1920, height: 1080,
};
const original = {
  id: 'timeline-original', name: '原始时间线', order: 0, fps: 30, width: 1920, height: 1080,
  selectedId: null, trackOrder: ['V1'], tracks: { V1: { kind: 'video' as const } }, items: [],
};
let current: ProjectDoc = {
  version: 3, assets: [source], mediaFolders: [], timelines: [original], activeTimelineId: original.id,
};
const ctx = {
  getDoc: () => current,
  getState: () => current.timelines.find((timeline) => timeline.id === current.activeTimelineId)!,
  commands: { applyDoc: (doc: ProjectDoc) => { current = doc; } },
} as unknown as AgentContext;

const result = await execRoughCutTool('assemble_rough_cut', {
  name: '耳机粗剪', ratio: '9:16', transition: 'cross-dissolve', transitionDurationMs: 250,
  beats: [
    { assetId: 'asset-demo', sourceStartMs: 0, sourceDurationMs: 2000 },
    { assetId: 'asset-demo', sourceStartMs: 3000, sourceDurationMs: 1500 },
  ],
}, ctx) as { ok?: boolean; transitions?: number; timeline?: { id: string; name: string } };

assert.equal(result.ok, true);
assert.equal(result.timeline?.name, '耳机粗剪');
assert.equal(result.transitions, 1);
assert.equal(current.timelines.length, 2, 'rough cut is a separate sequence');
assert.equal(current.timelines[0]?.items.length, 0, 'original sequence is untouched');
const rough = current.timelines.find((timeline) => timeline.id === result.timeline?.id)!;
assert.equal(rough.width, 1080);
assert.equal(rough.height, 1920);
assert.deepEqual(rough.items.map((item) => ({ start: item.startFrame, duration: item.durationInFrames, source: item.srcInFrame })), [
  { start: 0, duration: 60, source: 0 },
  { start: 60, duration: 45, source: 90 },
]);
assert.equal(rough.items.every((item) => item.sourceRevision === 'source-rev-1'), true);
assert.equal(rough.transitions?.[0]?.type, 'cross-dissolve');

const rejected = await execRoughCutTool('assemble_rough_cut', {
  beats: [{ assetId: 'missing', sourceDurationMs: 1000 }],
}, ctx) as { error?: string };
assert.match(rejected.error ?? '', /no matching assetId/);
assert.equal(current.timelines.length, 2, 'invalid assembly makes no mutation');

console.log('rough-cut-tools.verify: ok');
