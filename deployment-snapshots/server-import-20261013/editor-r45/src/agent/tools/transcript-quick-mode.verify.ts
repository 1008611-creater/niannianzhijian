import assert from 'node:assert/strict';
import { execTranscriptTool, recoverQuickTranscriptionTrack } from './transcript-tools';
import type { TimelineState } from '../../editor/types';

const ctx = {
  getCreativeMode: () => '11111111-1240-4000-8000-000000000004',
} as never;

const blocked = await execTranscriptTool('transcribe_track', { provider: 'assemblyai' }, ctx);
assert.match(String((blocked as { error?: string }).error), /只允许使用 MiMo/);

const regular = {
  getCreativeMode: () => null,
  getState: () => ({ tracks: {}, items: [] }),
} as never;
const allowed = await execTranscriptTool('transcribe_track', { provider: 'assemblyai' }, regular);
assert.doesNotMatch(String((allowed as { error?: string }).error), /只允许使用 MiMo/);

const quickVideoOnly: TimelineState = {
  fps: 30,
  width: 1080,
  height: 1920,
  selectedId: null,
  trackOrder: ['video-main'],
  tracks: { 'video-main': { kind: 'video' } },
  items: [{
    id: 'quick-video', track: 'video-main', kind: 'video', name: 'quick.mp4', src: '/media/quick.mp4',
    startFrame: 0, durationInFrames: 30,
  }],
};
assert.equal(
  recoverQuickTranscriptionTrack(quickVideoOnly, null),
  'video-main',
  'quick video-only rough cuts recover from a guessed A1',
);

console.log('transcript-quick-mode.verify: provider gate passed');
