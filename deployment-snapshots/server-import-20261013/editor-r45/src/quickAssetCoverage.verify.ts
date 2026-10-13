import assert from 'node:assert/strict';
import { quickAssetCoverageInstruction } from './quickAssetCoverage';

const single = quickAssetCoverageInstruction([{ id: 'asset-1' }]);
assert.match(single, /可以只引用这个实际 assetId/);
assert.match(single, /不得因只有一个 assetId 而拒绝/);

const multiple = quickAssetCoverageInstruction([{ id: 'asset-1' }, { id: 'asset-2' }]);
assert.match(multiple, /必须覆盖这 2 个实际 assetId/);
assert.match(multiple, /不得遗漏任一段/);

console.log('quickAssetCoverage verification passed');
