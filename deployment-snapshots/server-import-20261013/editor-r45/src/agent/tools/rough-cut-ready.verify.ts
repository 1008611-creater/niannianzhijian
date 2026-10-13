import assert from 'node:assert/strict';
import type { AgentContext } from '../context';
import type { ProjectDoc } from '../../editor/types';
import { sourceRevisionOf } from '../../editor/mediaSourceRevision';
import { execRoughCutReadyTool } from './rough-cut-voiceover';

const voiceAsset = {
  id: 'voice-asset', name: '旁白', kind: 'audio' as const, src: '/media/generated/voice.mp3', durationInFrames: 180,
  props: { generation: { version: 1, kind: 'voice', provider: 'mimo', modelId: 'mimo-v2.5-tts', voiceId: '冰糖', text: '旁白', speed: 1, outputFormat: 'mp3' } },
};
const voiceRevision = sourceRevisionOf(voiceAsset);
const bgmAsset = { id: 'bgm-asset', name: '背景音乐', kind: 'audio' as const, src: '/media/generated/bgm.mp3', durationInFrames: 180, sourceRevision: 'bgm-v1' };
const timeline = {
  id: 'rough', name: '粗剪', order: 0, fps: 30, width: 1080, height: 1920, selectedId: null,
  trackOrder: ['V1', 'A1', 'A2', 'C1'],
  tracks: {
    V1: { kind: 'video' as const }, A1: { kind: 'audio' as const, role: 'anchor' as const }, A2: { kind: 'audio' as const, role: 'follower' as const },
    C1: { kind: 'caption' as const, captions: {
      enabled: true, template: 'tiktok' as const, pacing: 'phrase' as const,
      sourceEntries: [{ id: 'rough_voice_1_voice-item', itemId: 'voice-item', label: '旁白 1', trackOrder: 0 }],
      roughCutVoiceover: { version: 1 as const, kind: 'rough-cut-voiceover' as const, voiceItemIds: ['voice-item'], voiceAssetIds: ['voice-asset'], sourceRevisions: { 'voice-item': voiceRevision } },
    } },
  },
  items: [
    { id: 'visual-1', track: 'V1', startFrame: 0, durationInFrames: 180, kind: 'video' as const, name: '产品展示', src: '/media/uploads/demo.mp4' },
    { id: 'beat-1', track: 'V1', startFrame: 0, durationInFrames: 180, kind: 'video' as const, name: '镜头关系', src: '/media/uploads/demo.mp4', props: { roughCut: { voice: { assetId: 'voice-asset', itemId: 'voice-item' } } } },
    { id: 'voice-item', track: 'A1', startFrame: 0, durationInFrames: 180, kind: 'audio' as const, name: '旁白', src: voiceAsset.src, sourceAssetId: voiceAsset.id, sourceRevision: voiceRevision, transcript: [{ text: '旁白', start: 0, end: 700 }] },
    { id: 'bgm-item', track: 'A2', startFrame: 0, durationInFrames: 180, kind: 'audio' as const, name: '背景音乐', src: bgmAsset.src, sourceAssetId: bgmAsset.id, sourceRevision: 'bgm-v1', props: { roughCutBgm: { version: 1, kind: 'rough-cut-bgm', assetId: 'bgm-asset', sourceRevision: 'bgm-v1', loopIndex: 0 } } },
  ],
};
let current: ProjectDoc = { version: 3, assets: [voiceAsset, bgmAsset], mediaFolders: [], timelines: [timeline], activeTimelineId: timeline.id };
const ctx = {
  getDoc: () => current,
  getState: () => current.timelines[0]!,
  commands: {},
} as unknown as AgentContext;

const ready = await execRoughCutReadyTool('check_rough_cut_ready', {}, ctx) as { ok?: boolean; structuralOnly?: boolean; summary?: { errors: number; warnings: number } };
assert.equal(ready.ok, true);
assert.equal(ready.structuralOnly, true);
assert.deepEqual(ready.summary, { errors: 0, warnings: 0 });

const changed = current.timelines[0]!;
current = { ...current, assets: current.assets.map((asset) => asset.id === 'bgm-asset' ? { ...asset, sourceRevision: 'bgm-v2' } : asset), timelines: [changed] };
const stale = await execRoughCutReadyTool('check_rough_cut_ready', {}, ctx) as { ok?: boolean; issues?: Array<{ code: string }> };
assert.equal(stale.ok, false);
assert.ok(stale.issues?.some((entry) => entry.code === 'rough_cut_bgm_source_stale'));

console.log('rough-cut-ready.verify: ok');
