import assert from 'node:assert/strict';
import type { AgentContext } from '../context';
import type { ProjectDoc } from '../../editor/types';
import { execRoughCutVoiceoverTool } from './rough-cut-voiceover';

const timeline = {
  id: 'rough', name: '粗剪', order: 0, fps: 30, width: 1080, height: 1920, selectedId: null,
  trackOrder: ['V1'], tracks: { V1: { kind: 'video' as const } },
  items: [{
    id: 'beat-1', track: 'V1', startFrame: 12, durationInFrames: 90, kind: 'video' as const,
    name: '产品展示', src: '/media/uploads/demo.mp4', sourceAssetId: 'asset-demo', sourceRevision: 'rev-1',
    props: { roughCut: { version: 1, narration: '这是第一段旁白。' } },
  }],
};
let current: ProjectDoc = {
  version: 3,
  assets: [{ id: 'asset-demo', name: 'demo.mp4', kind: 'video', src: '/media/uploads/demo.mp4', durationInFrames: 300, sourceRevision: 'rev-1' }],
  mediaFolders: [], timelines: [timeline], activeTimelineId: timeline.id,
};
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response(JSON.stringify({ path: '/media/generated/voice.mp3', durationSeconds: 1.5 }), {
  status: 200, headers: { 'Content-Type': 'application/json' },
})) as typeof fetch;
try {
  const ctx = {
    getDoc: () => current,
    getState: () => current.timelines[0]!,
    commands: { applyDoc: (doc: ProjectDoc) => { current = doc; } },
  } as unknown as AgentContext;
  const result = await execRoughCutVoiceoverTool('render_rough_cut_voiceover', {
    provider: 'mimo', voiceId: 'voice-test', modelId: 'mimo-v2.5-tts', speed: 1,
  }, ctx) as { ok?: boolean; placed?: Array<{ startFrame: number; durationInFrames: number }>; };
  assert.equal(result.ok, true);
  assert.deepEqual(result.placed?.map(({ startFrame, durationInFrames }) => ({ startFrame, durationInFrames })), [{ startFrame: 12, durationInFrames: 45 }]);
  const next = current.timelines[0]!;
  const voice = next.items.find((item) => item.kind === 'audio');
  assert.equal(voice?.startFrame, 12);
  assert.equal(current.assets.some((asset) => asset.kind === 'audio' && asset.props?.generation), true, 'voice asset records generation provenance');
  const rough = next.items.find((item) => item.id === 'beat-1')?.props?.roughCut as { voice?: { assetId?: string } };
  assert.ok(rough.voice?.assetId, 'beat keeps voice asset relation');

  current = {
    version: 3,
    assets: [{ id: 'asset-demo', name: 'demo.mp4', kind: 'video', src: '/media/uploads/demo.mp4', durationInFrames: 300, sourceRevision: 'rev-1' }],
    mediaFolders: [], timelines: [{
      ...timeline,
      id: 'too-short',
      items: [{ ...timeline.items[0]!, durationInFrames: 30 }],
    }], activeTimelineId: 'too-short',
  };
  const overflowing = await execRoughCutVoiceoverTool('render_rough_cut_voiceover', {
    provider: 'mimo', voiceId: 'voice-test', modelId: 'mimo-v2.5-tts', speed: 1,
  }, ctx) as { error?: string; overflowing?: Array<{ voiceDurationInFrames: number }> };
  assert.match(overflowing.error ?? '', /exceeds its matching visual beat/);
  assert.equal(overflowing.overflowing?.[0]?.voiceDurationInFrames, 45);
  assert.equal(current.timelines[0]?.items.some((item) => item.kind === 'audio'), false, 'overflowing narration never mutates the timeline');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('rough-cut-voiceover.verify: ok');
