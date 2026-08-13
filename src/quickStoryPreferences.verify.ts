import assert from 'node:assert/strict';
import { quickStoryPreferenceError, quickStorySceneKey, selectedQuickStoryRanges } from './quickStoryPreferences';

const assets = [{ id: 'asset-1', intelligence: { scenes: [
  { id: 'priority', startMs: 1000, endMs: 3000 },
  { id: 'exclude', startMs: 4000, endMs: 6000 },
] } }] as never;
const ranges = selectedQuickStoryRanges(assets, {
  [quickStorySceneKey('asset-1', 'priority')]: 'priority',
  [quickStorySceneKey('asset-1', 'exclude')]: 'exclude',
});

assert.match(quickStoryPreferenceError([{ assetId: 'asset-1', sourceStartMs: 0, sourceDurationMs: 1000 }], ranges) ?? '', /重点保留/);
assert.match(quickStoryPreferenceError([{ assetId: 'asset-1', sourceStartMs: 4500, sourceDurationMs: 500 }], ranges) ?? '', /不要用/);
assert.equal(quickStoryPreferenceError([{ assetId: 'asset-1', sourceStartMs: 1000, sourceDurationMs: 1500 }], ranges), undefined);

console.log('quickStoryPreferences.verify: ok');
