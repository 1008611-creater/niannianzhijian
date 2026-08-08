import assert from 'node:assert/strict';
import { metadataDocumentsForQuery } from './assetIntelligence';
import { metadataMediaSearchHits, buildMediaSearchResult } from './searchMedia';
import type { MediaAsset } from '../editor/types';

const asset = (sourceRevision: string, intelligenceSourceRevision: string): MediaAsset => ({
  id: 'asset-1', name: '商品视频', kind: 'video', src: '/media/uploads/product.mp4', durationInFrames: 300,
  sourceRevision,
  intelligence: {
    version: 1, sourceRevision: intelligenceSourceRevision, analyzedAt: 1,
    ocrText: '限时优惠', transcriptText: '这是一段商品口播', tags: ['商品展示'],
    entities: [{ kind: 'product', label: '无线耳机', confidence: 0.98, startMs: 1000, endMs: 3000 }],
  },
});

const fresh = asset('rev-current', 'rev-current');
const stale = asset('rev-current', 'rev-old');
assert.equal(metadataDocumentsForQuery('商品展示', [fresh, stale]).length, 1, 'stale intelligence is ignored');
assert.deepEqual(metadataDocumentsForQuery('商品口播', [fresh]).map((document) => document.field), ['transcript'], 'text-only ASR is searchable metadata');
const hits = metadataMediaSearchHits('无线耳机', [fresh]);
assert.deepEqual({ field: hits[0]?.field, start: hits[0]?.sourceStartMs, end: hits[0]?.sourceEndMs },
  { field: 'entity', start: 1000, end: 3000 });
const result = buildMediaSearchResult('无线耳机', [], [], hits, [fresh]);
assert.equal(result.metadata.length, 1);
assert.equal(result.hits[0]?.modality, 'metadata');
console.log('assetIntelligence.verify: ok');
