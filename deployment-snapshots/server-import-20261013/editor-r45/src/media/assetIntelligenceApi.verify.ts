import assert from 'node:assert/strict';
import { mimoAsrIntelligenceFor, ocrIntelligenceFor, visionIntelligenceFor } from './assetIntelligenceApi';

const intelligence = ocrIntelligenceFor({
  id: 'asset-1', name: 'frame.png', kind: 'image', src: '/media/uploads/frame.png', durationInFrames: 1, sourceRevision: 'rev-1',
}, { text: 'SALE', languageRequested: 'eng+chi_sim', languageUsed: 'eng' }, 123);
assert.deepEqual(intelligence, {
  version: 1, sourceRevision: 'rev-1', analyzedAt: 123,
  modelVersions: { ocr: 'tesseract:eng' }, ocrText: 'SALE',
});

const visual = visionIntelligenceFor({
  id: 'asset-1', name: 'frame.png', kind: 'image', src: '/media/uploads/frame.png', durationInFrames: 30, sourceRevision: 'rev-1',
  intelligence,
}, {
  tags: ['商品展示'], entities: [{ kind: 'product', label: '无线耳机', confidence: 0.98 }],
  scenes: [{ label: '桌面特写', confidence: 0.8 }], model: 'vision-test',
}, 456);
assert.deepEqual(visual, {
  version: 1, sourceRevision: 'rev-1', analyzedAt: 456,
  modelVersions: { ocr: 'tesseract:eng', vision: 'vision-test' }, ocrText: 'SALE', tags: ['商品展示'],
  entities: [{ kind: 'product', label: '无线耳机', confidence: 0.98, startMs: 0, endMs: 1 }],
  scenes: [{ id: 'vision-0-0', startMs: 0, endMs: 1, label: '桌面特写', confidence: 0.8 }],
});

const transcript = mimoAsrIntelligenceFor({
  id: 'asset-1', name: 'frame.png', kind: 'image', src: '/media/uploads/frame.png', durationInFrames: 30, sourceRevision: 'rev-1',
  intelligence: visual,
}, { text: '这是一段商品口播', language: 'zh', model: 'mimo-v2.5-asr' }, 789);
assert.deepEqual(transcript, {
  ...visual, analyzedAt: 789,
  modelVersions: { ocr: 'tesseract:eng', vision: 'vision-test', 'mimo-asr': 'mimo-v2.5-asr' },
  transcriptText: '这是一段商品口播',
});
console.log('assetIntelligenceApi.verify: ok');
