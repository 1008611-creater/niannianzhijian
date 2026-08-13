import type { AgentContext } from '../context';
import { sourceRevisionOf } from '../../editor/mediaSourceRevision';
import {
  mimoAsrIntelligenceFor,
  ocrIntelligenceFor,
  requestAssetMimoAsr,
  requestAssetOcr,
  requestAssetVideoUnderstanding,
  requestAssetVision,
  videoIntelligenceFor,
  visionIntelligenceFor,
} from '../../media/assetIntelligenceApi';

type Args = Record<string, unknown>;

function sourceTime(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  const millis = safe % 1_000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function assetById(ctx: AgentContext, value: unknown) {
  const query = typeof value === 'string' ? value.trim() : '';
  if (!query) return undefined;
  return ctx.getDoc().assets.find((asset) => asset.id === query || asset.id.startsWith(query));
}

export async function execAssetIntelligenceTool(name: string, args: Args, ctx: AgentContext): Promise<unknown | undefined> {
  if (name !== 'analyze_asset') return undefined;
  if (args.kind !== undefined && args.kind !== 'ocr' && args.kind !== 'vision' && args.kind !== 'video' && args.kind !== 'mimo-asr') {
    return { error: 'analyze_asset supports kind=ocr, kind=vision, kind=video, or kind=mimo-asr' };
  }
  const asset = assetById(ctx, args.assetId);
  if (!asset) return { error: 'analyze_asset requires an existing assetId' };
  if (!asset.src.startsWith('/media/uploads/')) return { error: '本地素材分析仅支持已导入到媒体库的素材' };
  const sourceRevision = sourceRevisionOf(asset);
  const timeMs = typeof args.timeMs === 'number' && Number.isFinite(args.timeMs) && args.timeMs >= 0
    ? Math.round(args.timeMs) : undefined;
  const language = typeof args.language === 'string' && args.language.trim() ? args.language.trim() : undefined;
  const prompt = typeof args.prompt === 'string' && args.prompt.trim() ? args.prompt.trim().slice(0, 600) : undefined;
  try {
    if (args.kind === 'video') {
      if (asset.kind !== 'video' && asset.kind !== 'gif') return { error: '整段视频理解只支持视频素材' };
      const result = await requestAssetVideoUnderstanding(asset, prompt);
      const current = ctx.getDoc().assets.find((item) => item.id === asset.id);
      if (!current || sourceRevisionOf(current) !== sourceRevision) {
        return { stale: true, assetId: asset.id, note: '素材在整段视频理解期间已被替换，结果未写入' };
      }
      const intelligence = videoIntelligenceFor(current, result);
      ctx.commands.editMediaAsset(asset.id, { intelligence });
      // Quick mode must render its story choices from the same source-bound
      // result immediately; the project store still owns durable persistence.
      ctx.onQuickAssetIntelligence?.(asset.id, intelligence);
      const sourceSegments = result.segments.map((segment) => ({
        sourceStartMs: segment.startMs,
        sourceEndMs: segment.endMs,
        sourceRange: `${sourceTime(segment.startMs)}-${sourceTime(segment.endMs)}`,
        label: segment.label,
      }));
      return {
        ok: true, assetId: asset.id, sourceRevision, model: result.model,
        summary: result.summary, segments: sourceSegments, tags: result.tags,
        videoTokens: result.videoTokens,
        note: '整段视频理解已写入素材元数据；sourceRange 是 MM:SS.mmm 源视频坐标，可用于选片规划。',
      };
    }
    if (args.kind === 'vision') {
      const result = await requestAssetVision(asset, { timeMs, prompt });
      const current = ctx.getDoc().assets.find((item) => item.id === asset.id);
      if (!current || sourceRevisionOf(current) !== sourceRevision) {
        return { stale: true, assetId: asset.id, note: '素材在视觉分析期间已被替换，结果未写入' };
      }
      ctx.commands.editMediaAsset(asset.id, { intelligence: visionIntelligenceFor(current, result) });
      return {
        ok: true, assetId: asset.id, sourceRevision, model: result.model,
        tags: result.tags.length, entities: result.entities.length, scenes: result.scenes.length,
        ...(result.sampleTimeMs !== undefined ? { sampleTimeMs: result.sampleTimeMs } : {}),
      };
    }
    if (args.kind === 'mimo-asr') {
      const mimoLanguage = language === 'zh' || language === 'en' ? language : 'auto';
      const result = await requestAssetMimoAsr(asset, mimoLanguage);
      const current = ctx.getDoc().assets.find((item) => item.id === asset.id);
      if (!current || sourceRevisionOf(current) !== sourceRevision) {
        return { stale: true, assetId: asset.id, note: '素材在 MiMo 转写期间已被替换，结果未写入' };
      }
      ctx.commands.editMediaAsset(asset.id, { intelligence: mimoAsrIntelligenceFor(current, result) });
      return {
        ok: true, assetId: asset.id, sourceRevision, model: result.model,
        chars: result.text.length, language: result.language, timing: 'none',
        ...(result.noSpeech ? { noSpeech: true } : {}),
        note: result.noSpeech
          ? '素材没有可转写的音轨或人声；这是预期结果。继续使用真实画面和整段视频理解，不得伪造台词或字幕。'
          : 'MiMo 转写已写入素材文本索引；它没有词级时间戳，不能用于字幕或时间线文本编辑。',
      };
    }
    const result = await requestAssetOcr(asset, { timeMs, language });
    const current = ctx.getDoc().assets.find((item) => item.id === asset.id);
    if (!current || sourceRevisionOf(current) !== sourceRevision) {
      return { stale: true, assetId: asset.id, note: '素材在 OCR 期间已被替换，结果未写入' };
    }
    ctx.commands.editMediaAsset(asset.id, { intelligence: ocrIntelligenceFor(current, result) });
    return {
      ok: true, assetId: asset.id, sourceRevision, chars: result.text.length,
      languageRequested: result.languageRequested, languageUsed: result.languageUsed,
      ...(result.sampleTimeMs !== undefined ? { sampleTimeMs: result.sampleTimeMs } : {}),
      ...(result.warning ? { warning: result.warning } : {}),
    };
  } catch (error) {
    const label = args.kind === 'mimo-asr' ? 'MiMo 转写' : args.kind === 'video' ? '整段视频理解' : args.kind === 'vision' ? '视觉分析' : 'OCR';
    return { error: `${label} failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
