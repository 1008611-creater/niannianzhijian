import assert from 'node:assert/strict';
import { execSearchMedia } from './media-search';
import type { AgentContext } from '../context';

const result = await execSearchMedia({ query: '无线耳机', modalities: ['metadata'] }, {
  getDoc: () => ({
    activeTimelineId: 'timeline-1',
    assets: [{
      id: 'asset-1', name: '商品展示', kind: 'video', src: '/media/uploads/product.mp4', durationInFrames: 300,
      sourceRevision: 'rev-1',
      intelligence: {
        version: 1, sourceRevision: 'rev-1', analyzedAt: 1,
        entities: [{ kind: 'product', label: '无线耳机', startMs: 1000, endMs: 3000 }],
      },
    }],
  }),
} as unknown as AgentContext) as { metadata?: Array<{ text?: string; sourceStartMs?: number; sourceEndMs?: number }> };

assert.deepEqual(result.metadata, [{
  modality: 'metadata', assetId: 'asset-1', sourceRevision: 'rev-1', sourceStartMs: 1000, sourceEndMs: 3000,
  score: 1, text: '无线耳机', field: 'entity',
}]);
console.log('media-search.verify: ok');
