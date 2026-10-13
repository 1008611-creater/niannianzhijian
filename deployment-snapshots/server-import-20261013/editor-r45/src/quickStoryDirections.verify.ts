import assert from 'node:assert/strict';
import { quickStoryDirectionError, quickStoryDirections } from './quickStoryDirections';

const directions = quickStoryDirections([{ id: 'one', name: 'one.mp4', kind: 'video', src: '/media/one.mp4', durationInFrames: 300, intelligence: {
  version: 1, sourceRevision: 'test', analyzedAt: 1, scenes: [
    { id: 'start', startMs: 0, endMs: 1000, label: '误会发生' },
    { id: 'hook', startMs: 2000, endMs: 3000, label: '当场对峙' },
    { id: 'end', startMs: 4000, endMs: 5000, label: '转身离开' },
  ],
} }]);

assert.equal(directions.length, 3);
assert.match(directions[1]!.description, /当场对峙/);
assert.match(quickStoryDirectionError([{ assetId: 'one', sourceStartMs: 0, sourceDurationMs: 500 }], directions[1]) ?? '', /从指定剧情段开始/);
assert.equal(quickStoryDirectionError([{ assetId: 'one', sourceStartMs: 2000, sourceDurationMs: 500 }], directions[1]), undefined);
assert.match(quickStoryDirectionError([{ assetId: 'one', sourceStartMs: 0, sourceDurationMs: 500 }], directions[2]) ?? '', /指定剧情段收尾/);
assert.equal(quickStoryDirectionError([{ assetId: 'one', sourceStartMs: 4000, sourceDurationMs: 500 }], directions[2]), undefined);

console.log('quickStoryDirections.verify: ok');
