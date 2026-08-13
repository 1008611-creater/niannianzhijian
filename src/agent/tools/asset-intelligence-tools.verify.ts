import assert from 'node:assert/strict';
import { execAssetIntelligenceTool } from './asset-intelligence-tools';
import type { AgentContext } from '../context';
import type { MediaAsset } from '../../editor/types';

const asset: MediaAsset = {
  id: 'asset-1', name: 'product.png', kind: 'image', src: '/media/uploads/product.png', durationInFrames: 1, sourceRevision: 'rev-1',
};
let current = asset;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response(JSON.stringify({
  text: 'SALE', languageRequested: 'eng', languageUsed: 'eng',
}), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
try {
  const ctx = {
    getDoc: () => ({ assets: [current] }),
    commands: { editMediaAsset: (_id: string, patch: Partial<MediaAsset>) => { current = { ...current, ...patch }; } },
  } as unknown as AgentContext;
  const result = await execAssetIntelligenceTool('analyze_asset', { assetId: 'asset-1', kind: 'ocr', language: 'eng' }, ctx) as {
    ok?: boolean; chars?: number;
  };
  assert.equal(result.ok, true);
  assert.equal(result.chars, 4);
  assert.equal(current.intelligence?.ocrText, 'SALE');
  assert.equal(current.intelligence?.sourceRevision, 'rev-1');
} finally {
  globalThis.fetch = originalFetch;
}

globalThis.fetch = (async () => new Response(JSON.stringify({
  tags: ['商品展示'], entities: [{ kind: 'product', label: '无线耳机', confidence: 0.99 }],
  scenes: [{ label: '产品特写', confidence: 0.8 }], model: 'vision-test',
}), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
try {
  const ctx = {
    getDoc: () => ({ assets: [current] }),
    commands: { editMediaAsset: (_id: string, patch: Partial<MediaAsset>) => { current = { ...current, ...patch }; } },
  } as unknown as AgentContext;
  const result = await execAssetIntelligenceTool('analyze_asset', { assetId: 'asset-1', kind: 'vision' }, ctx) as {
    ok?: boolean; tags?: number; entities?: number;
  };
  assert.equal(result.ok, true);
  assert.equal(result.tags, 1);
  assert.equal(result.entities, 1);
  assert.equal(current.intelligence?.ocrText, 'SALE', 'vision preserves current OCR');
  assert.equal(current.intelligence?.tags?.[0], '商品展示');
} finally {
  globalThis.fetch = originalFetch;
}

globalThis.fetch = (async () => new Response(JSON.stringify({
  text: '这是一段商品口播', model: 'mimo-v2.5-asr', language: 'zh', timing: 'none',
}), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
try {
  const ctx = {
    getDoc: () => ({ assets: [current] }),
    commands: { editMediaAsset: (_id: string, patch: Partial<MediaAsset>) => { current = { ...current, ...patch }; } },
  } as unknown as AgentContext;
  const result = await execAssetIntelligenceTool('analyze_asset', { assetId: 'asset-1', kind: 'mimo-asr', language: 'zh' }, ctx) as {
    ok?: boolean; chars?: number; timing?: string;
  };
  assert.equal(result.ok, true);
  assert.equal(result.chars, 8);
  assert.equal(result.timing, 'none');
  assert.equal(current.intelligence?.ocrText, 'SALE', 'MiMo ASR preserves current OCR');
  assert.equal(current.intelligence?.tags?.[0], '商品展示', 'MiMo ASR preserves visual metadata');
  assert.equal(current.intelligence?.transcriptText, '这是一段商品口播');
  assert.equal(current.intelligence?.modelVersions?.['mimo-asr'], 'mimo-v2.5-asr');
  assert.equal(current.transcript, undefined, 'text-only ASR must not produce timestamped transcript words');
} finally {
  globalThis.fetch = originalFetch;
}

current = { ...current, kind: 'video', name: 'demo.mp4', src: '/media/uploads/demo.mp4', durationInFrames: 180 };
globalThis.fetch = (async () => new Response(JSON.stringify({
  summary: '视频依次显示红绿蓝三种颜色', tags: ['颜色变化'], model: 'gemini-3.5-flash-lite', videoTokens: 378,
  segments: [
    { startMs: 0, endMs: 2_000, label: '红色画面' },
    { startMs: 2_000, endMs: 4_000, label: '绿色画面' },
    { startMs: 4_000, endMs: 6_000, label: '蓝色画面' },
  ],
}), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
try {
  const ctx = {
    getDoc: () => ({ assets: [current] }),
    commands: { editMediaAsset: (_id: string, patch: Partial<MediaAsset>) => { current = { ...current, ...patch }; } },
  } as unknown as AgentContext;
  const result = await execAssetIntelligenceTool('analyze_asset', {
    assetId: 'asset-1', kind: 'video', prompt: '识别颜色变化',
  }, ctx) as { ok?: boolean; videoTokens?: number; segments?: Array<{ sourceRange?: string }> };
  assert.equal(result.ok, true);
  assert.equal(result.videoTokens, 378);
  assert.equal(result.segments?.length, 3);
  assert.equal(result.segments?.[0]?.sourceRange, '00:00.000-00:02.000');
  assert.equal(current.intelligence?.videoSummary, '视频依次显示红绿蓝三种颜色');
  assert.equal(current.intelligence?.scenes?.[1]?.label, '绿色画面');
  assert.equal(current.intelligence?.modelVersions?.['video-vision'], 'gemini-3.5-flash-lite');
  assert.equal(current.intelligence?.ocrText, 'SALE', 'whole-video understanding preserves OCR');
  assert.equal(current.intelligence?.transcriptText, '这是一段商品口播', 'whole-video understanding preserves ASR text');
} finally {
  globalThis.fetch = originalFetch;
}

globalThis.fetch = (async () => new Response(JSON.stringify({
  text: '', model: 'mimo-v2.5-asr', language: 'auto', noSpeech: true, timing: 'none',
}), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
try {
  const ctx = {
    getDoc: () => ({ assets: [current] }),
    commands: { editMediaAsset: (_id: string, patch: Partial<MediaAsset>) => { current = { ...current, ...patch }; } },
  } as unknown as AgentContext;
  const result = await execAssetIntelligenceTool('analyze_asset', { assetId: 'asset-1', kind: 'mimo-asr' }, ctx) as {
    ok?: boolean; chars?: number; noSpeech?: boolean;
  };
  assert.equal(result.ok, true);
  assert.equal(result.chars, 0);
  assert.equal(result.noSpeech, true, 'video without speech is analysis evidence, not a fatal error');
} finally {
  globalThis.fetch = originalFetch;
}
console.log('asset-intelligence-tools.verify: ok');
