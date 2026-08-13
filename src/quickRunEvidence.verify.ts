import assert from 'node:assert/strict';
import type { TimelineItem } from './editor/types';
import { isCompleteQuickRoughCut, roughCutSourceCount } from './quickRunEvidence';

const item = (id: string, sourceAssetId?: string) => ({ id, sourceAssetId }) as TimelineItem;

assert.equal(roughCutSourceCount([item('a', 'source-1'), item('b', 'source-1')]), 1);
assert.equal(isCompleteQuickRoughCut([item('a', 'source-1')], 2), false, 'multi-clip recipes need multiple real sources');
assert.equal(isCompleteQuickRoughCut([item('a', 'source-1'), item('b', 'source-2')], 2), true);
assert.equal(isCompleteQuickRoughCut([item('a', 'source-1')], 1), true, 'one-clip recipes remain supported');

console.log('quickRunEvidence.verify: ok');
