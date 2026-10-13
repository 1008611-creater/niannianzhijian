import assert from 'node:assert/strict';
import type { AgentContext } from '../context';
import type { ProjectDoc } from '../../editor/types';
import { captionsOnTrack } from '../../editor/types';
import { sourceRevisionOf } from '../../editor/mediaSourceRevision';
import { execRoughCutCaptionsTool } from './rough-cut-voiceover';

const voiceAsset = {
  id: 'voice-asset', name: '旁白 1', kind: 'audio' as const, src: '/media/uploads/voice.mp3', durationInFrames: 60,
  props: { generation: { version: 1, kind: 'voice', provider: 'mimo', modelId: 'mimo-v2.5-tts', voiceId: '冰糖', text: '真实旁白', speed: 1, outputFormat: 'mp3' } },
};
const voiceRevision = sourceRevisionOf(voiceAsset);
const timeline = {
  id: 'rough', name: '粗剪', order: 0, fps: 30, width: 1080, height: 1920, selectedId: null,
  trackOrder: ['V1', 'A1'], tracks: { V1: { kind: 'video' as const }, A1: { kind: 'audio' as const, role: 'anchor' as const } },
  items: [
    { id: 'beat-1', track: 'V1', startFrame: 30, durationInFrames: 60, kind: 'video' as const, name: '展示', src: '/media/uploads/demo.mp4', props: { roughCut: { version: 1, narration: '真实旁白', voice: { assetId: 'voice-asset', itemId: 'voice-item' } } } },
    { id: 'voice-item', track: 'A1', startFrame: 30, durationInFrames: 60, kind: 'audio' as const, name: '旁白 1', src: voiceAsset.src, sourceAssetId: voiceAsset.id, sourceRevision: voiceRevision },
  ],
};
let current: ProjectDoc = { version: 3, assets: [voiceAsset], mediaFolders: [], timelines: [timeline], activeTimelineId: timeline.id };
const originalFetch = globalThis.fetch;
let alignmentSubmissions = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url === '/api/qwen-forced-aligner/align' && init?.method === 'POST') {
    alignmentSubmissions += 1;
    return Response.json({ ok: true, model: 'Qwen/Qwen3-ForcedAligner-0.6B-hf', granularity: 'character', words: [
      { text: '真', start: 0, end: 320 }, { text: '实', start: 320, end: 520 },
      { text: '旁', start: 520, end: 700 }, { text: '白', start: 700, end: 900 },
    ] });
  }
  return new Response('', { status: 404 });
}) as typeof fetch;

try {
  const ctx = {
    getDoc: () => current,
    getState: () => current.timelines[0]!,
    commands: { applyDoc: (doc: ProjectDoc) => { current = doc; } },
  } as unknown as AgentContext;

  const created = await execRoughCutCaptionsTool('prepare_rough_cut_captions', { template: 'tiktok', pacing: 'phrase' }, ctx) as { ok?: boolean; source?: string; alignedVoiceItemIds?: string[] };
  assert.equal(created.ok, true);
  assert.equal(created.source, 'qwen-forced-alignment');
  assert.deepEqual(created.alignedVoiceItemIds, ['voice-item']);
  assert.equal(alignmentSubmissions, 1, 'approved narration is force-aligned instead of sent to ASR');
  const state = current.timelines[0]!;
  const voice = state.items.find((item) => item.id === 'voice-item');
  assert.deepEqual(voice?.transcript?.map((word) => word.text), ['真', '实', '旁', '白']);
  const captionTrack = (state.trackOrder ?? []).find((id) => state.tracks?.[id]?.kind === 'caption');
  assert.ok(captionTrack, 'creates a separate caption track');
  const captions = captionsOnTrack(state, captionTrack!);
  assert.equal(captions?.roughCutVoiceover?.kind, 'rough-cut-voiceover');
  assert.deepEqual(captions?.roughCutVoiceover?.voiceItemIds, ['voice-item']);
  assert.deepEqual(captions?.sourceEntries?.map((entry) => entry.itemId), ['voice-item']);

  const refreshed = await execRoughCutCaptionsTool('prepare_rough_cut_captions', {}, ctx) as { ok?: boolean; alignedVoiceItemIds?: string[] };
  assert.equal(refreshed.ok, true);
  assert.deepEqual(refreshed.alignedVoiceItemIds, ['voice-item'], 'refresh realigns the retained narration against current audio');
  assert.equal(alignmentSubmissions, 2);
  const refreshedState = current.timelines[0]!;
  assert.equal((refreshedState.trackOrder ?? []).filter((id) => refreshedState.tracks?.[id]?.kind === 'caption').length, 1, 'refresh updates its own caption track');

  current = {
    ...current,
    assets: current.assets.map((asset) => asset.id === 'voice-asset'
      ? { ...asset, props: { generation: { ...(asset.props?.generation as Record<string, unknown>), text: '替换后的音频' } } }
      : asset),
    timelines: [{ ...current.timelines[0]! }],
  };
  const relinked = await execRoughCutCaptionsTool('prepare_rough_cut_captions', {}, ctx) as { error?: string };
  assert.match(relinked.error ?? '', /relinked or changed/);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('rough-cut-captions.verify: ok');
