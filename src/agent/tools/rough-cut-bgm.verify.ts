import assert from 'node:assert/strict';
import type { AgentContext } from '../context';
import type { ProjectDoc } from '../../editor/types';
import { execRoughCutBgmTool } from './rough-cut-voiceover';

const music = { id: 'music-1', name: '轻快背景音乐', kind: 'audio' as const, src: '/media/generated/music.mp3', durationInFrames: 75, sourceRevision: 'music-v1' };
const timeline = {
  id: 'rough', name: '粗剪', order: 0, fps: 30, width: 1080, height: 1920, selectedId: null,
  trackOrder: ['V1', 'A1'], tracks: { V1: { kind: 'video' as const }, A1: { kind: 'audio' as const, role: 'anchor' as const } },
  items: [
    { id: 'visual-1', track: 'V1', startFrame: 0, durationInFrames: 180, kind: 'video' as const, name: '商品展示', src: '/media/uploads/demo.mp4' },
    { id: 'voice-1', track: 'A1', startFrame: 0, durationInFrames: 180, kind: 'audio' as const, name: '旁白', src: '/media/generated/voice.mp3' },
  ],
};
let current: ProjectDoc = { version: 3, assets: [music], mediaFolders: [], timelines: [timeline], activeTimelineId: timeline.id };
const ctx = {
  getDoc: () => current,
  getState: () => current.timelines[0]!,
  commands: { applyDoc: (doc: ProjectDoc) => { current = doc; } },
} as unknown as AgentContext;

const placed = await execRoughCutBgmTool('place_rough_cut_bgm', { assetId: 'music-1' }, ctx) as { ok?: boolean; loops?: number; ducking?: string; itemIds?: string[] };
assert.equal(placed.ok, true);
assert.equal(placed.loops, 3, '75-frame music loops to cover a 180-frame rough cut');
assert.equal(placed.ducking, 'enabled-by-anchor-follower-routing');
const after = current.timelines[0]!;
const musicTrack = (after.trackOrder ?? []).find((id) => after.tracks?.[id]?.role === 'follower');
assert.ok(musicTrack, 'workflow creates a follower music track');
const bgm = after.items.filter((item) => item.track === musicTrack);
assert.deepEqual(bgm.map((item) => ({ start: item.startFrame, duration: item.durationInFrames, volume: item.volume })), [
  { start: 0, duration: 75, volume: 0.18 },
  { start: 75, duration: 75, volume: 0.18 },
  { start: 150, duration: 30, volume: 0.18 },
]);
assert.equal(bgm.every((item) => (item.props?.roughCutBgm as { sourceRevision?: string } | undefined)?.sourceRevision === 'music-v1'), true);

const refreshed = await execRoughCutBgmTool('place_rough_cut_bgm', { assetId: 'music-1', volume: 0.12 }, ctx) as { ok?: boolean; loops?: number };
assert.equal(refreshed.ok, true);
const refreshedState = current.timelines[0]!;
assert.equal(refreshedState.items.filter((item) => item.track === musicTrack).length, 3, 'refresh replaces only its prior generated BGM clips');
assert.equal(refreshedState.items.filter((item) => item.track === musicTrack).every((item) => item.volume === 0.12), true);

const rejected = await execRoughCutBgmTool('place_rough_cut_bgm', { assetId: 'missing' }, ctx) as { error?: string };
assert.match(rejected.error ?? '', /completed project audio asset/);

console.log('rough-cut-bgm.verify: ok');
