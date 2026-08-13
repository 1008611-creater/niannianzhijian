export { ROUGH_CUT_TOOL_NAMES, ROUGH_CUT_TOOL_SCHEMAS } from './schemas/rough-cut-tools';

import type { AgentContext } from '../context';
import { makeDraft } from '../../editor/store';
import { ASPECT_PRESETS, defaultTrackId, trackAlias, type MediaAsset, type TransitionType } from '../../editor/types';
import { execRoughCutBgmTool, execRoughCutCaptionsTool, execRoughCutReadyTool, execRoughCutVoiceoverTool } from './rough-cut-voiceover';

type Args = Record<string, unknown>;
type VisualAsset = MediaAsset & { kind: 'video' | 'image' | 'gif' | 'svg' };

interface RoughCutBeat {
  asset: VisualAsset;
  sourceStartMs: number;
  sourceDurationMs: number;
  narration?: string;
}

function isVisualAsset(asset: MediaAsset): asset is VisualAsset {
  return asset.kind === 'video' || asset.kind === 'image' || asset.kind === 'gif' || asset.kind === 'svg';
}

function resolveAsset(assets: readonly MediaAsset[], value: unknown): MediaAsset | undefined | 'ambiguous' {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id) return undefined;
  const exact = assets.find((asset) => asset.id === id);
  if (exact) return exact;
  const matches = assets.filter((asset) => asset.id.startsWith(id));
  return matches.length === 1 ? matches[0] : matches.length > 1 ? 'ambiguous' : undefined;
}

function integer(value: unknown): number | undefined {
  const result = Number(value);
  return Number.isFinite(result) && Number.isInteger(result) ? result : undefined;
}

function parseBeats(value: unknown, assets: readonly MediaAsset[]): { beats?: RoughCutBeat[]; error?: string } {
  if (!Array.isArray(value) || value.length === 0) return { error: 'assemble_rough_cut requires one or more beats' };
  if (value.length > 60) return { error: 'rough cut supports at most 60 beats' };
  const beats: RoughCutBeat[] = [];
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: `beats[${index}] must be an object` };
    const row = raw as Args;
    const asset = resolveAsset(assets, row.assetId);
    if (!asset) return { error: `beats[${index}] has no matching assetId` };
    if (asset === 'ambiguous') return { error: `beats[${index}] assetId is ambiguous; use the full asset id` };
    if (!isVisualAsset(asset)) return { error: `beats[${index}] must reference visual media, not ${asset.kind}` };
    const sourceStartMs = integer(row.sourceStartMs) ?? 0;
    const sourceDurationMs = integer(row.sourceDurationMs);
    const narration = typeof row.narration === 'string' ? row.narration.trim().replace(/\s+/g, ' ').slice(0, 1200) : undefined;
    if (sourceStartMs < 0 || sourceDurationMs === undefined || sourceDurationMs < 250 || sourceDurationMs > 60_000) {
      return { error: `beats[${index}] needs sourceStartMs >= 0 and sourceDurationMs between 250 and 60000` };
    }
    beats.push({ asset, sourceStartMs, sourceDurationMs, ...(narration ? { narration } : {}) });
  }
  return { beats };
}

function transition(value: unknown): TransitionType | null | 'invalid' {
  if (value === undefined || value === null || value === '') return 'cross-dissolve';
  if (value === 'none') return null;
  return value === 'cross-dissolve' || value === 'soft-wipe' || value === 'flash' ? value : 'invalid';
}

export async function execRoughCutTool(name: string, args: Args, ctx: AgentContext): Promise<unknown> {
  if (name === 'render_rough_cut_voiceover') return execRoughCutVoiceoverTool(name, args, ctx);
  if (name === 'prepare_rough_cut_captions') return execRoughCutCaptionsTool(name, args, ctx);
  if (name === 'place_rough_cut_bgm') return execRoughCutBgmTool(name, args, ctx);
  if (name === 'check_rough_cut_ready') return execRoughCutReadyTool(name, args, ctx);
  if (name !== 'assemble_rough_cut') return undefined;
  if (ctx.getQuickStoryConfirmed?.() === false) {
    return { error: '请先确认 Agent 的剧情理解，再生成可编辑粗剪。' };
  }
  const parsed = parseBeats(args.beats, ctx.getDoc().assets);
  if (!parsed.beats) return { error: parsed.error };
  const transitionType = transition(args.transition);
  if (transitionType === 'invalid') return { error: 'transition must be none, cross-dissolve, soft-wipe, or flash' };
  const ratio = typeof args.ratio === 'string' ? ASPECT_PRESETS.find((preset) => preset.label === args.ratio) : undefined;
  if (args.ratio !== undefined && !ratio) return { error: `unsupported ratio ${String(args.ratio)}` };
  const nameValue = typeof args.name === 'string' ? args.name.trim().slice(0, 80) : '';
  const transitionDurationMs = integer(args.transitionDurationMs) ?? 250;
  if (transitionDurationMs < 67 || transitionDurationMs > 2000) return { error: 'transitionDurationMs must be between 67 and 2000' };

  const draft = makeDraft(ctx.getDoc());
  const timelineId = draft.commands.createTimeline({
    name: nameValue || '粗剪',
    ...(ratio ? { width: ratio.width, height: ratio.height, fit: 'cover' as const } : {}),
    activate: true,
  });
  const state = draft.getState();
  const track = defaultTrackId(state, 'video');
  if (!track) return { error: 'new rough-cut timeline has no video track' };
  const fps = state.fps;
  let cursor = 0;
  const itemIds: string[] = [];
  for (const [index, beat] of parsed.beats.entries()) {
    const sourceStartFrame = Math.round((beat.sourceStartMs / 1000) * fps);
    const requestedFrames = Math.max(1, Math.round((beat.sourceDurationMs / 1000) * fps));
    const availableFrames = Math.max(1, beat.asset.durationInFrames - sourceStartFrame);
    const durationInFrames = Math.min(requestedFrames, availableFrames);
    const itemId = draft.commands.addMediaItem(beat.asset, { track, startFrame: cursor });
    draft.commands.setItemTiming(itemId, { startFrame: cursor, srcInFrame: sourceStartFrame, durationInFrames });
    draft.commands.updateItemProps(itemId, {
      roughCut: {
        version: 1, beatIndex: index, sourceStartMs: beat.sourceStartMs, sourceDurationMs: beat.sourceDurationMs,
        ...(beat.narration ? { narration: beat.narration } : {}),
      },
    });
    itemIds.push(itemId);
    cursor += durationInFrames;
  }
  if (transitionType) {
    const transitionFrames = Math.max(2, Math.round((transitionDurationMs / 1000) * fps));
    for (const itemId of itemIds.slice(1)) draft.commands.addTransition(itemId, transitionType, transitionFrames);
  }
  const result = draft.getDoc();
  const timeline = result.timelines.find((item) => item.id === timelineId);
  if (!timeline || timeline.items.length !== itemIds.length) return { error: 'rough-cut assembly failed before publication' };
  ctx.commands.applyDoc(result);
  ctx.onRoughCutAssembled?.(result, timelineId);
  return {
    ok: true,
    timeline: { id: timeline.id, name: timeline.name, ratio: `${timeline.width}:${timeline.height}`, track: trackAlias(timeline, track) },
    beats: timeline.items.map((item) => ({
      itemId: item.id, assetId: item.sourceAssetId, sourceRevision: item.sourceRevision,
      startFrame: item.startFrame, durationInFrames: item.durationInFrames, srcInFrame: item.srcInFrame ?? 0,
    })),
    transitions: timeline.transitions?.length ?? 0,
    durationInFrames: cursor,
    note: '已创建独立粗剪序列；原时间线未改动。可继续生成旁白、字幕和配乐。',
  };
}
