import type { AgentContext } from '../context';
import { makeDraft } from '../../editor/store';
import { captionsOnTrack, type MediaAsset, type TimelineItem } from '../../editor/types';
import type { CaptionPacing, CaptionTemplate } from '../../captions/types';
import { CAPTION_STYLE_BY_ID } from '../../captions/styles';
import { sourceRevisionOf } from '../../editor/mediaSourceRevision';
import { captionLayoutQaIssues, type ExportQaIssue } from '../../export/quality';
import { submitVoice, type SubmitVoiceArgs } from '../../generate/voice';
import { hasOperationalTranscript, type TranscriptWord } from '../../transcript/types';
import { alignKnownVoiceover } from '../../transcript/qwenForcedAligner';

type Args = Record<string, unknown>;
type VoiceProvider = SubmitVoiceArgs['provider'];

interface NarratedBeat {
  item: TimelineItem;
  narration: string;
  roughCut: Record<string, unknown>;
}

interface GeneratedNarration {
  beat: NarratedBeat;
  asset: MediaAsset;
}

interface VoiceLink {
  assetId: string;
  itemId: string;
}

interface CaptionVoice {
  beatItem: TimelineItem;
  asset: MediaAsset;
  item: TimelineItem;
  sourceRevision: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function narratedBeats(items: readonly TimelineItem[]): NarratedBeat[] {
  return items.flatMap((item) => {
    const roughCut = record(item.props?.roughCut);
    const narration = typeof roughCut?.narration === 'string' ? roughCut.narration.trim() : '';
    return narration && roughCut ? [{ item, narration, roughCut }] : [];
  }).sort((a, b) => a.item.startFrame - b.item.startFrame);
}

function provider(value: unknown): VoiceProvider | undefined {
  return value === 'mimo' || value === 'openai-tts' || value === 'elevenlabs' || value === 'doubao' || value === 'minimax'
    ? value : undefined;
}

/**
 * The narrated-short workflow has a product default: MiMo with its built-in
 * Chinese voice. Keep the default scoped to this workflow; generic submit_voice
 * still requires an explicit provider and voice so provider catalogs cannot be
 * mixed accidentally.
 */
function roughCutVoiceSelection(args: Args): { provider?: VoiceProvider; voiceId?: string; error?: string } {
  const requestedProvider = args.provider === undefined ? 'mimo' : provider(args.provider);
  if (!requestedProvider) return { error: 'provider must be mimo, openai-tts, elevenlabs, doubao, or minimax' };
  const requestedVoice = typeof args.voiceId === 'string' ? args.voiceId.trim() : '';
  const voiceId = requestedVoice || (requestedProvider === 'mimo' ? '冰糖' : '');
  if (!voiceId) return { error: 'voiceId is required for the selected provider' };
  return { provider: requestedProvider, voiceId };
}

function voiceLink(value: unknown): VoiceLink | undefined {
  const raw = record(value);
  const assetId = typeof raw?.assetId === 'string' ? raw.assetId : '';
  const itemId = typeof raw?.itemId === 'string' ? raw.itemId : '';
  return assetId && itemId ? { assetId, itemId } : undefined;
}

function validTemplate(value: unknown): CaptionTemplate | undefined {
  return typeof value === 'string' && value in CAPTION_STYLE_BY_ID ? value as CaptionTemplate : undefined;
}

function validPacing(value: unknown): CaptionPacing | undefined {
  return value === 'word' || value === 'phrase' ? value : undefined;
}

function resolveAudioAsset(assets: readonly MediaAsset[], value: unknown): MediaAsset | undefined | 'ambiguous' {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id) return undefined;
  const exact = assets.find((asset) => asset.id === id && asset.kind === 'audio');
  if (exact) return exact;
  const matches = assets.filter((asset) => asset.kind === 'audio' && asset.id.startsWith(id));
  return matches.length === 1 ? matches[0] : matches.length > 1 ? 'ambiguous' : undefined;
}

function roughCutDurationInFrames(items: readonly TimelineItem[]): number {
  return Math.max(0, ...items
    .filter((item) => item.kind === 'video' || item.kind === 'image' || item.kind === 'gif' || item.kind === 'svg' || item.kind === 'sequence')
    .map((item) => item.startFrame + item.durationInFrames));
}

export async function execRoughCutBgmTool(name: string, args: Args, ctx: AgentContext): Promise<unknown> {
  if (name !== 'place_rough_cut_bgm') return undefined;
  const asset = resolveAudioAsset(ctx.getDoc().assets, args.assetId);
  if (!asset) return { error: 'assetId must reference a completed project audio asset; submit_music then wait for track_progress success first' };
  if (asset === 'ambiguous') return { error: 'assetId is ambiguous; use the full completed music asset id' };
  if (!asset.src || asset.durationInFrames < 1) return { error: `audio asset ${asset.id} has no playable duration` };
  const duration = roughCutDurationInFrames(ctx.getState().items);
  if (duration < 1) return { error: 'active rough cut has no visual duration to score' };
  const volume = typeof args.volume === 'number' && Number.isFinite(args.volume) ? args.volume : 0.18;
  if (volume < 0 || volume > 1) return { error: 'volume must be between 0 and 1' };

  const draft = makeDraft(ctx.getDoc());
  const state = draft.getState();
  const existingTrack = (state.trackOrder ?? []).find((trackId) => (
    state.tracks?.[trackId]?.kind === 'audio'
    && state.items.some((item) => item.track === trackId && record(item.props?.roughCutBgm)?.kind === 'rough-cut-bgm')
  ));
  const track = existingTrack ?? draft.commands.createTrack('audio', {
    name: typeof args.trackName === 'string' && args.trackName.trim() ? args.trackName.trim().slice(0, 80) : '背景音乐',
    role: 'follower',
  });
  // Only replace BGM that this workflow created; manually added music on the
  // same track remains untouched.
  for (const item of state.items.filter((item) => item.track === track && record(item.props?.roughCutBgm)?.kind === 'rough-cut-bgm')) {
    draft.commands.removeItem(item.id);
  }
  const sourceRevision = sourceRevisionOf(asset);
  const itemIds: string[] = [];
  for (let startFrame = 0, loopIndex = 0; startFrame < duration; loopIndex += 1) {
    const remaining = duration - startFrame;
    const itemId = draft.commands.addMediaItem(asset, { track, startFrame });
    const loopDuration = Math.min(asset.durationInFrames, remaining);
    draft.commands.setItemTiming(itemId, { startFrame, srcInFrame: 0, durationInFrames: loopDuration });
    draft.commands.setItemVolume(itemId, volume);
    draft.commands.updateItemProps(itemId, {
      roughCutBgm: { version: 1, kind: 'rough-cut-bgm', assetId: asset.id, sourceRevision, loopIndex },
    });
    itemIds.push(itemId);
    startFrame += loopDuration;
  }
  ctx.commands.applyDoc(draft.getDoc());
  const anchorTracks = (draft.getState().trackOrder ?? []).filter((trackId) => draft.getState().tracks?.[trackId]?.role === 'anchor');
  return {
    ok: true,
    assetId: asset.id,
    track,
    itemIds,
    loops: itemIds.length,
    durationInFrames: duration,
    volume,
    ducking: anchorTracks.length > 0 ? 'enabled-by-anchor-follower-routing' : 'no-anchor-track-found',
    sourceRevision,
    note: anchorTracks.length
      ? '背景音乐已铺满粗剪，并通过 follower 轨道在旁白 anchor 轨道下自动闪避。'
      : '背景音乐已铺满粗剪；当前没有 anchor 旁白轨道，因此未启用自动闪避。',
  };
}

function issue(code: string, severity: 'error' | 'warning', message: string): ExportQaIssue {
  return { code, severity, message };
}

/** A structural preflight only. Pixel/audio-sample QA remains verify_export after rendering. */
export async function execRoughCutReadyTool(name: string, _args: Args, ctx: AgentContext): Promise<unknown> {
  if (name !== 'check_rough_cut_ready') return undefined;
  const state = ctx.getState();
  const doc = ctx.getDoc();
  const durationInFrames = roughCutDurationInFrames(state.items);
  const issues: ExportQaIssue[] = [...captionLayoutQaIssues(state)];
  if (!durationInFrames) issues.push(issue('no_visual_timeline', 'error', 'The active timeline has no visual duration.'));

  const offline = ctx.getOfflineMediaSrcs?.() ?? new Set<string>();
  for (const item of state.items.filter((item) => item.kind === 'audio' || item.kind === 'video' || item.kind === 'image' || item.kind === 'gif' || item.kind === 'svg')) {
    if (!item.src) {
      issues.push(issue('missing_media_source', 'error', `Timeline item ${item.id} has no source URL.`));
      continue;
    }
    if (offline.has(item.src)) issues.push(issue('offline_media_source', 'error', `Timeline item ${item.id} is unavailable on this machine.`));
    if (item.sourceAssetId && !doc.assets.some((asset) => asset.id === item.sourceAssetId)) {
      issues.push(issue('missing_media_asset', 'warning', `Timeline item ${item.id} refers to a removed media-pool asset; its embedded source is retained but should be relinked before delivery.`));
    }
  }

  const voices = captionVoices(ctx);
  if (!voices.voices) {
    issues.push(issue('rough_cut_voice_missing', 'warning', voices.error ?? 'No rough-cut voiceover was found.'));
  } else {
    const voiceIds = voices.voices.map(({ item }) => item.id);
    const stale = voices.voices.filter(({ item }) => item.transcriptStale === true);
    if (stale.length) issues.push(issue('rough_cut_voice_transcript_stale', 'error', `Voice transcript is stale for ${stale.map(({ item }) => item.id).join(', ')}.`));
    const captionTrack = (state.trackOrder ?? []).find((trackId) => captionsOnTrack(state, trackId)?.roughCutVoiceover?.kind === 'rough-cut-voiceover');
    const captions = captionTrack ? captionsOnTrack(state, captionTrack) : undefined;
    if (!captions?.enabled) {
      issues.push(issue('rough_cut_captions_missing', 'warning', 'No enabled provenance-bound rough-cut caption track was found.'));
    } else {
      const boundIds = captions.roughCutVoiceover?.voiceItemIds ?? [];
      if (boundIds.length !== voiceIds.length || boundIds.some((id, index) => id !== voiceIds[index])) {
        issues.push(issue('rough_cut_caption_sources_mismatch', 'error', 'Caption provenance no longer matches the current rough-cut voiceover items.'));
      }
      const sourceItemIds = captions.sourceEntries?.map((entry) => entry.itemId) ?? [];
      if (sourceItemIds.length !== voiceIds.length || sourceItemIds.some((id, index) => id !== voiceIds[index])) {
        issues.push(issue('rough_cut_caption_entries_mismatch', 'error', 'Caption source entries no longer match the current rough-cut voiceover items.'));
      }
      for (const { item } of voices.voices) {
        if (!hasOperationalTranscript(item)) issues.push(issue('rough_cut_caption_transcript_missing', 'error', `Caption source ${item.id} has no current word-level transcript.`));
      }
    }
  }

  const bgmItems = state.items.filter((item) => record(item.props?.roughCutBgm)?.kind === 'rough-cut-bgm');
  if (!bgmItems.length) {
    issues.push(issue('rough_cut_bgm_missing', 'warning', 'No workflow BGM bed is placed on the active rough cut.'));
  } else {
    const spans = bgmItems
      .map((item) => ({ start: item.startFrame, end: item.startFrame + item.durationInFrames, item }))
      .sort((left, right) => left.start - right.start);
    let coveredTo = 0;
    for (const span of spans) {
      const metadata = record(span.item.props?.roughCutBgm);
      const assetId = typeof metadata?.assetId === 'string' ? metadata.assetId : '';
      const asset = doc.assets.find((candidate) => candidate.id === assetId);
      if (!asset || asset.kind !== 'audio' || span.item.sourceRevision !== sourceRevisionOf(asset)) {
        issues.push(issue('rough_cut_bgm_source_stale', 'error', `BGM item ${span.item.id} no longer matches its recorded audio source.`));
      }
      if (span.start > coveredTo) issues.push(issue('rough_cut_bgm_gap', 'warning', `BGM has an uncovered gap before frame ${span.start}.`));
      coveredTo = Math.max(coveredTo, span.end);
    }
    if (coveredTo < durationInFrames) issues.push(issue('rough_cut_bgm_ends_early', 'warning', 'BGM ends before the visual rough cut.'));
  }

  const errors = issues.filter((entry) => entry.severity === 'error').length;
  return {
    ok: errors === 0,
    structuralOnly: true,
    durationInFrames,
    durationSeconds: Number((durationInFrames / Math.max(1, state.fps)).toFixed(3)),
    issues,
    summary: { errors, warnings: issues.length - errors },
    next: errors
      ? 'Fix the reported source/provenance errors, then rerun check_rough_cut_ready.'
      : 'Structural preflight passed. Inspect composed frames with view_timeline_frames; when the user requests a file, submit_render_job and run verify_export after completion.',
  };
}

/** Resolve every visual beat to its generated voice item and source bytes. */
function captionVoices(ctx: AgentContext): { voices?: CaptionVoice[]; error?: string } {
  const state = ctx.getState();
  const assets = ctx.getDoc().assets;
  const seen = new Set<string>();
  const voices: CaptionVoice[] = [];
  for (const beatItem of state.items.filter((item) => record(item.props?.roughCut)?.voice)) {
    const link = voiceLink(record(beatItem.props?.roughCut)?.voice);
    if (!link) return { error: `rough-cut beat ${beatItem.id} has an invalid voice link; render its narration again` };
    const asset = assets.find((candidate) => candidate.id === link.assetId);
    const item = state.items.find((candidate) => candidate.id === link.itemId);
    if (!asset || asset.kind !== 'audio' || !item || item.kind !== 'audio' || !item.src) {
      return { error: `rough-cut beat ${beatItem.id} references a missing voice asset or audio item; render its narration again` };
    }
    if (item.sourceAssetId !== asset.id) {
      return { error: `voice item ${item.id} no longer matches its recorded voice asset; do not bind captions until it is restored` };
    }
    const generation = record(asset.props?.generation);
    if (generation?.kind !== 'voice') {
      return { error: `voice asset ${asset.id} has no voice-generation provenance; do not bind captions to an unverified source` };
    }
    const sourceRevision = sourceRevisionOf(asset);
    if (item.sourceRevision !== sourceRevision) {
      return { error: `voice item ${item.id} was relinked or changed after generation; re-render or re-transcribe it before captions` };
    }
    if (!seen.has(item.id)) {
      seen.add(item.id);
      voices.push({ beatItem, asset, item, sourceRevision });
    }
  }
  return voices.length ? { voices: voices.sort((a, b) => a.item.startFrame - b.item.startFrame) } : {
    error: 'active timeline has no rendered rough-cut voiceover; call render_rough_cut_voiceover first',
  };
}

export async function execRoughCutCaptionsTool(name: string, args: Args, ctx: AgentContext): Promise<unknown> {
  if (name !== 'prepare_rough_cut_captions') return undefined;
  const resolved = captionVoices(ctx);
  if (!resolved.voices) return { error: resolved.error };
  const template = validTemplate(args.template) ?? 'tiktok';
  const pacing = validPacing(args.pacing) ?? 'phrase';
  // Each rendered rough-cut beat retains the approved narration text. Align it
  // directly to its generated WAV instead of invoking ASR or inventing timing.
  const aligned = new Map<string, TranscriptWord[]>();
  try {
    for (const { beatItem, item } of resolved.voices) {
      const narration = typeof record(beatItem.props?.roughCut)?.narration === 'string'
        ? String(record(beatItem.props?.roughCut)?.narration).trim() : '';
      if (!narration) throw new Error(`rough-cut beat ${beatItem.id} has no approved narration text`);
      const result = await alignKnownVoiceover(item.src!, narration);
      if (!result.words.length) throw new Error(`forced aligner returned no timestamps for ${item.name}`);
      aligned.set(item.id, result.words);
    }
  } catch (error) {
    return {
      error: `voice forced alignment failed before caption publication: ${error instanceof Error ? error.message : String(error)}`,
      alignedVoiceItemIds: [...aligned.keys()],
    };
  }

  // ASR can take long enough for a relink/re-render to happen. Re-resolve from
  // the live project before writing its results, never attaching old timing to
  // replacement audio bytes.
  const current = captionVoices(ctx);
  if (!current.voices
    || current.voices.length !== resolved.voices.length
    || current.voices.some((voice, index) => (
      voice.item.id !== resolved.voices![index]!.item.id
      || voice.sourceRevision !== resolved.voices![index]!.sourceRevision
    ))) {
    return { error: 'a voice source changed while forced alignment was running; timestamps were not bound to the timeline' };
  }

  const draft = makeDraft(ctx.getDoc());
  for (const [itemId, words] of aligned) draft.commands.setItemTranscript(itemId, words);
  const state = draft.getState();
  const sourceEntries = current.voices.map(({ item }, index) => ({
    id: `rough_voice_${index + 1}_${item.id}`,
    itemId: item.id,
    label: `旁白 ${index + 1}`,
    trackOrder: index,
  }));
  const provenance = {
    version: 1 as const,
    kind: 'rough-cut-voiceover' as const,
    voiceItemIds: current.voices.map(({ item }) => item.id),
    voiceAssetIds: current.voices.map(({ asset }) => asset.id),
    sourceRevisions: Object.fromEntries(current.voices.map(({ item, sourceRevision }) => [item.id, sourceRevision])),
  };
  const existingTrack = (state.trackOrder ?? []).find((trackId) => {
    const captions = captionsOnTrack(state, trackId);
    return state.tracks?.[trackId]?.kind === 'caption' && captions?.roughCutVoiceover?.kind === 'rough-cut-voiceover';
  });
  if (existingTrack) {
    draft.commands.setCaptions({
      ...(captionsOnTrack(state, existingTrack)!), enabled: true, template, pacing,
      sourceItemId: null, sources: undefined, sourceEntries, sourceMode: 'item', words: undefined,
      roughCutVoiceover: provenance,
    }, existingTrack);
  } else {
    draft.commands.createCaptionTrack({
      enabled: true, template, pacing, sourceEntries, sourceMode: 'item', roughCutVoiceover: provenance,
    }, { name: typeof args.trackName === 'string' && args.trackName.trim() ? args.trackName.trim().slice(0, 80) : '旁白字幕' });
  }
  ctx.commands.applyDoc(draft.getDoc());
  return {
    ok: true,
    captionTrack: existingTrack ?? 'created',
    voiceItemIds: provenance.voiceItemIds,
    alignedVoiceItemIds: [...aligned.keys()],
    source: 'qwen-forced-alignment',
    note: '字幕轨已绑定 Qwen 强制对齐的真实旁白时间戳；每段字幕会随各自旁白片段的时间线位置播放。',
  };
}

export async function execRoughCutVoiceoverTool(name: string, args: Args, ctx: AgentContext): Promise<unknown> {
  if (name !== 'render_rough_cut_voiceover') return undefined;
  const selection = roughCutVoiceSelection(args);
  if (selection.error) return { error: selection.error };
  const selectedProvider = selection.provider!;
  const voiceId = selection.voiceId!;
  const speed = typeof args.speed === 'number' && Number.isFinite(args.speed) ? args.speed : undefined;
  if (speed !== undefined && (speed < 0.5 || speed > 2)) return { error: 'speed must be between 0.5 and 2' };
  const state = ctx.getState();
  const beats = narratedBeats(state.items);
  if (!beats.length) return { error: 'active timeline has no rough-cut narration; provide beats[].narration to assemble_rough_cut first' };

  const generated: GeneratedNarration[] = [];
  try {
    for (const [index, beat] of beats.entries()) {
      const asset = await submitVoice({
        provider: selectedProvider, voiceId, text: beat.narration,
        ...(typeof args.modelId === 'string' && args.modelId.trim() ? { modelId: args.modelId.trim() } : {}),
        ...(speed !== undefined ? { speed } : {}),
        ...(typeof args.outputFormat === 'string' && args.outputFormat.trim() ? { outputFormat: args.outputFormat.trim() } : {}),
        name: `旁白 ${index + 1}`,
      }, state);
      generated.push({ beat, asset });
    }
  } catch (error) {
    return { error: `voiceover generation failed before timeline publication: ${error instanceof Error ? error.message : String(error)}`, generated: 0 };
  }

  // A visual-driven rough cut must not let narration spill into the next beat.
  // The provider duration is authoritative; an estimate is not enough to place
  // a voice clip safely. Nothing has been written to the timeline at this point.
  const overflowing = generated.flatMap(({ beat, asset }, index) => {
    const visualDuration = beat.item.durationInFrames;
    return asset.durationInFrames > visualDuration ? [{
      index: index + 1,
      beatItemId: beat.item.id,
      visualDurationInFrames: visualDuration,
      voiceDurationInFrames: asset.durationInFrames,
      visualDurationSeconds: Number((visualDuration / Math.max(1, state.fps)).toFixed(2)),
      voiceDurationSeconds: Number((asset.durationInFrames / Math.max(1, state.fps)).toFixed(2)),
      narration: beat.narration,
    }] : [];
  });
  if (overflowing.length) {
    return {
      error: 'voiceover duration exceeds its matching visual beat; no narration was added to the timeline',
      overflowing,
      next: 'Shorten or split the listed narration, or explicitly extend the matching visual beat, then render again.',
    };
  }

  const draft = makeDraft(ctx.getDoc());
  const audioTrack = draft.commands.createTrack('audio', {
    name: typeof args.trackName === 'string' && args.trackName.trim() ? args.trackName.trim().slice(0, 80) : '旁白',
    role: 'anchor',
  });
  const placed: Array<{ beatItemId: string; voiceAssetId: string; voiceItemId: string; startFrame: number; durationInFrames: number }> = [];
  for (const { beat, asset } of generated) {
    draft.commands.addAsset(asset);
    const voiceItemId = draft.commands.addMediaItem(asset, { track: audioTrack, startFrame: beat.item.startFrame });
    draft.commands.updateItemProps(beat.item.id, {
      roughCut: {
        ...beat.roughCut,
        voice: { assetId: asset.id, itemId: voiceItemId, provider: selectedProvider, modelId: args.modelId ?? null, voiceId },
      },
    });
    placed.push({ beatItemId: beat.item.id, voiceAssetId: asset.id, voiceItemId, startFrame: beat.item.startFrame, durationInFrames: asset.durationInFrames });
  }
  ctx.commands.applyDoc(draft.getDoc());
  return {
    ok: true, provider: selectedProvider, voiceId, audioTrack,
    placed,
    next: '旁白已按当前画面分段放置。接着调用 prepare_rough_cut_captions；它会用 Qwen 强制对齐生成真实时间戳字幕。',
  };
}
