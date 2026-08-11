import assert from 'node:assert/strict';
import { execTranscriptTool } from './transcript-tools';

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

console.log('transcript-quick-mode.verify: provider gate passed');
