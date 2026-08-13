import { sourceRevisionOf } from '../editor/mediaSourceRevision';
import type { AssetIntelligence, MediaAsset } from '../editor/types';

export interface AssetOcrResponse {
  text?: unknown;
  languageRequested?: unknown;
  languageUsed?: unknown;
  sampleTimeMs?: unknown;
  warning?: unknown;
  error?: unknown;
}

export interface AssetOcrOptions {
  timeMs?: number;
  language?: string;
}

export interface AssetOcrResult {
  text: string;
  languageRequested: string;
  languageUsed: string;
  sampleTimeMs?: number;
  warning?: string;
}

export interface AssetVisionEntity {
  kind: 'product' | 'person' | 'brand' | 'scene' | 'text';
  label: string;
  confidence?: number;
}

export interface AssetVisionScene {
  label: string;
  confidence?: number;
}

export interface AssetVisionOptions {
  timeMs?: number;
  prompt?: string;
}

export interface AssetVisionResult {
  tags: string[];
  entities: AssetVisionEntity[];
  scenes: AssetVisionScene[];
  model: string;
  sampleTimeMs?: number;
}

export interface AssetVideoUnderstandingResult {
  summary: string;
  tags: string[];
  segments: Array<{ startMs: number; endMs: number; label: string }>;
  model: string;
  videoTokens: number;
}

export interface AssetMimoAsrResult {
  text: string;
  language: 'auto' | 'zh' | 'en';
  model: string;
  noSpeech?: true;
}

export async function requestAssetOcr(asset: MediaAsset, options: AssetOcrOptions = {}): Promise<AssetOcrResult> {
  const response = await fetch('/api/asset-intelligence/ocr', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src: asset.src, timeMs: options.timeMs, language: options.language }),
  });
  const body = await response.json().catch(() => ({})) as AssetOcrResponse;
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `OCR failed (${response.status})`);
  return {
    text: typeof body.text === 'string' ? body.text : '',
    languageRequested: typeof body.languageRequested === 'string' ? body.languageRequested : '',
    languageUsed: typeof body.languageUsed === 'string' ? body.languageUsed : '',
    ...(typeof body.sampleTimeMs === 'number' && Number.isFinite(body.sampleTimeMs) ? { sampleTimeMs: body.sampleTimeMs } : {}),
    ...(typeof body.warning === 'string' ? { warning: body.warning } : {}),
  };
}

/** MiMo ASR is deliberately persisted as search text only; it has no word timing contract. */
export async function requestAssetMimoAsr(asset: MediaAsset, language: 'auto' | 'zh' | 'en' = 'auto'): Promise<AssetMimoAsrResult> {
  const response = await fetch('/api/mimo-asr/transcribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src: asset.src, language }),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `MiMo ASR failed (${response.status})`);
  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, 200_000) : '';
  const noSpeech = body.noSpeech === true;
  if (!text && !noSpeech) throw new Error('MiMo ASR returned no transcript text');
  return {
    text,
    language: body.language === 'zh' || body.language === 'en' ? body.language : 'auto',
    model: typeof body.model === 'string' && body.model.trim() ? body.model.trim().slice(0, 160) : 'mimo-v2.5-asr',
    ...(noSpeech ? { noSpeech: true as const } : {}),
  };
}

function labels(value: unknown, maximum: number): string[] {
  const seen = new Set<string>();
  return (Array.isArray(value) ? value : []).flatMap((item) => {
    if (typeof item !== 'string') return [];
    const label = item.replace(/\s+/g, ' ').trim().slice(0, 120);
    const key = label.toLocaleLowerCase();
    if (!label || seen.has(key)) return [];
    seen.add(key);
    return [label];
  }).slice(0, maximum);
}

function confidence(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : undefined;
}

export async function requestAssetVision(asset: MediaAsset, options: AssetVisionOptions = {}): Promise<AssetVisionResult> {
  const response = await fetch('/api/asset-intelligence/vision', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src: asset.src, timeMs: options.timeMs, prompt: options.prompt }),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `Vision analysis failed (${response.status})`);
  const entities = (Array.isArray(body.entities) ? body.entities : []).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const kind = typeof row.kind === 'string' && ['product', 'person', 'brand', 'scene', 'text'].includes(row.kind)
      ? row.kind as AssetVisionEntity['kind'] : undefined;
    const label = labels([row.label], 1)[0];
    return kind && label ? [{ kind, label, ...(confidence(row.confidence) !== undefined ? { confidence: confidence(row.confidence) } : {}) }] : [];
  }).slice(0, 32);
  const scenes = (Array.isArray(body.scenes) ? body.scenes : []).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const label = labels([row.label], 1)[0];
    return label ? [{ label, ...(confidence(row.confidence) !== undefined ? { confidence: confidence(row.confidence) } : {}) }] : [];
  }).slice(0, 16);
  return {
    tags: labels(body.tags, 32), entities, scenes,
    model: typeof body.model === 'string' ? body.model.trim().slice(0, 160) : 'unknown',
    ...(typeof body.sampleTimeMs === 'number' && Number.isFinite(body.sampleTimeMs) ? { sampleTimeMs: body.sampleTimeMs } : {}),
  };
}

export async function requestAssetVideoUnderstanding(
  asset: MediaAsset,
  prompt?: string,
): Promise<AssetVideoUnderstandingResult> {
  const response = await fetch('/api/asset-intelligence/video', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src: asset.src, prompt }),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `Video understanding failed (${response.status})`);
  const segments = (Array.isArray(body.segments) ? body.segments : []).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const startMs = Math.max(0, Math.round(Number(row.startMs)));
    const endMs = Math.max(startMs + 1, Math.round(Number(row.endMs)));
    const label = labels([row.label], 1)[0];
    return Number.isFinite(startMs) && Number.isFinite(endMs) && label ? [{ startMs, endMs, label }] : [];
  }).slice(0, 120);
  const summary = typeof body.summary === 'string' ? body.summary.replace(/\s+/g, ' ').trim().slice(0, 4_000) : '';
  if (!summary || !segments.length) throw new Error('Video understanding returned no usable timeline');
  return {
    summary,
    tags: labels(body.tags, 48),
    segments,
    model: typeof body.model === 'string' && body.model.trim() ? body.model.trim().slice(0, 160) : 'unknown',
    videoTokens: Math.max(0, Math.round(Number(body.videoTokens) || 0)),
  };
}

function currentIntelligence(asset: MediaAsset): AssetIntelligence | undefined {
  const intelligence = asset.intelligence;
  return intelligence?.version === 1 && intelligence.sourceRevision === sourceRevisionOf(asset) ? intelligence : undefined;
}

function assetDurationMs(asset: MediaAsset): number {
  return Math.max(1, Math.round((asset.durationInFrames / 30) * 1000));
}

export function ocrIntelligenceFor(asset: MediaAsset, result: AssetOcrResult, now = Date.now()): AssetIntelligence {
  const existing = currentIntelligence(asset);
  return {
    ...existing,
    version: 1,
    sourceRevision: sourceRevisionOf(asset),
    analyzedAt: now,
    modelVersions: { ...existing?.modelVersions, ocr: `tesseract:${result.languageUsed || 'unknown'}` },
    ocrText: result.text,
  };
}

export function mimoAsrIntelligenceFor(asset: MediaAsset, result: AssetMimoAsrResult, now = Date.now()): AssetIntelligence {
  const existing = currentIntelligence(asset);
  return {
    ...existing,
    version: 1,
    sourceRevision: sourceRevisionOf(asset),
    analyzedAt: now,
    modelVersions: { ...existing?.modelVersions, 'mimo-asr': result.model },
    transcriptText: result.text,
  };
}

export function visionIntelligenceFor(asset: MediaAsset, result: AssetVisionResult, now = Date.now()): AssetIntelligence {
  const existing = currentIntelligence(asset);
  const startMs = Math.max(0, Math.round(result.sampleTimeMs ?? 0));
  const endMs = Math.max(startMs + 1, Math.min(assetDurationMs(asset), startMs + 1));
  return {
    ...existing,
    version: 1,
    sourceRevision: sourceRevisionOf(asset),
    analyzedAt: now,
    modelVersions: { ...existing?.modelVersions, vision: result.model || 'unknown' },
    tags: result.tags,
    entities: result.entities.map((entity) => ({ ...entity, startMs, endMs })),
    scenes: result.scenes.map((scene, index) => ({
      id: `vision-${startMs}-${index}`, startMs, endMs, label: scene.label, ...(scene.confidence !== undefined ? { confidence: scene.confidence } : {}),
    })),
  };
}

export function videoIntelligenceFor(
  asset: MediaAsset,
  result: AssetVideoUnderstandingResult,
  now = Date.now(),
): AssetIntelligence {
  const existing = currentIntelligence(asset);
  const durationMs = assetDurationMs(asset);
  return {
    ...existing,
    version: 1,
    sourceRevision: sourceRevisionOf(asset),
    analyzedAt: now,
    modelVersions: { ...existing?.modelVersions, 'video-vision': result.model || 'unknown' },
    videoSummary: result.summary,
    tags: labels([...(existing?.tags ?? []), ...result.tags], 48),
    scenes: result.segments.map((segment, index) => {
      const startMs = Math.min(durationMs - 1, Math.max(0, segment.startMs));
      const endMs = Math.min(durationMs, Math.max(startMs + 1, segment.endMs));
      return { id: `video-vision-${startMs}-${index}`, startMs, endMs, label: segment.label };
    }),
  };
}
