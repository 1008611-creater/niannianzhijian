import { makeDraft } from '../../editor/store';
import { captionsOnTrack, type TimelineItem } from '../../editor/types';
import { sourceRevisionOf } from '../../editor/mediaSourceRevision';
import { alignKnownVoiceover } from '../../transcript/qwenForcedAligner';
import type { AgentContext } from '../context';
import type { AgentToolSchema } from '../tool-schema';

type Args = Record<string, unknown>;

export const FORCED_ALIGNER_TOOL_NAMES = new Set(['align_voiceover_captions']);

export const FORCED_ALIGNER_TOOL_SCHEMAS: AgentToolSchema[] = [{
  name: 'align_voiceover_captions',
  description: 'Use local Qwen3-ForcedAligner-0.6B to align each approved known narration text with its matching generated local audio clip, then create a subtitle track from the returned real character/word timestamps. This is NOT ASR and must never be called for unknown speech or with Qwen3-ASR. MiMo ASR remains text-only material understanding. Every voice needs its exact timeline audio item id and its approved text.',
  input_schema: {
    type: 'object',
    properties: {
      voices: {
        type: 'array', minItems: 1, maxItems: 30,
        items: { type: 'object', properties: { itemId: { type: 'string' }, text: { type: 'string' } }, required: ['itemId', 'text'] },
      },
      template: { type: 'string', description: 'Caption template, defaults to tiktok.' },
      pacing: { type: 'string', enum: ['word', 'phrase'], description: 'Display grouping, defaults to phrase; original forced-alignment units remain intact.' },
      trackName: { type: 'string', description: 'New caption track name, defaults to 强制对齐字幕.' },
    }, required: ['voices'],
  },
}];

interface VoiceInput { itemId: string; text: string; }
interface ResolvedVoice extends VoiceInput { item: TimelineItem; sourceRevision: string; }

function resolveVoices(value: unknown, ctx: AgentContext): { voices?: ResolvedVoice[]; error?: string } {
  if (!Array.isArray(value) || !value.length || value.length > 30) return { error: 'voices must contain 1–30 narration audio items' };
  const state = ctx.getState();
  const seen = new Set<string>();
  const voices: ResolvedVoice[] = [];
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: `voices[${index}] must be an object` };
    const row = raw as Record<string, unknown>;
    const itemId = typeof row.itemId === 'string' ? row.itemId.trim() : '';
    const text = typeof row.text === 'string' ? row.text.trim().replace(/\s+/g, ' ') : '';
    const matches = state.items.filter((item) => item.id === itemId || item.id.startsWith(itemId));
    if (matches.length !== 1) return { error: `voices[${index}] itemId must identify exactly one timeline item` };
    const item = matches[0]!;
    if (item.kind !== 'audio' || !item.src?.startsWith('/media/uploads/')) return { error: `voices[${index}] must reference a local generated audio clip` };
    if (!text || text.length > 8_000) return { error: `voices[${index}] text is required and must be at most 8000 characters` };
    if (seen.has(item.id)) return { error: `voices contains duplicate item ${item.id}` };
    seen.add(item.id);
    voices.push({ itemId: item.id, text, item, sourceRevision: sourceRevisionOf({ src: item.src, name: item.name, kind: 'audio', durationInFrames: item.durationInFrames }) });
  }
  return { voices };
}

export async function execForcedAlignerTool(name: string, args: Args, ctx: AgentContext): Promise<unknown> {
  if (name !== 'align_voiceover_captions') return undefined;
  const resolved = resolveVoices(args.voices, ctx);
  if (!resolved.voices) return { error: resolved.error };
  const prepared = resolved.voices;
  const alignments = [] as Awaited<ReturnType<typeof alignKnownVoiceover>>[];
  try {
    for (const voice of prepared) alignments.push(await alignKnownVoiceover(voice.item.src!, voice.text));
  } catch (error) {
    return { error: `Qwen 强制对齐失败，字幕未写入：${error instanceof Error ? error.message : String(error)}` };
  }
  const current = resolveVoices(prepared.map(({ itemId, text }) => ({ itemId, text })), ctx);
  if (!current.voices || current.voices.length !== prepared.length || current.voices.some((voice, index) => voice.sourceRevision !== prepared[index]!.sourceRevision)) {
    return { error: '旁白音频在对齐期间被替换或移动；字幕没有写入，请重新对齐当前音频' };
  }

  const template = args.template === 'plain' || args.template === 'black-bar' || args.template === 'persona' || args.template === 'off-the-wall'
    || args.template === 'the-french-dispatch' || args.template === 'dogme' || args.template === 'boyz-n-the-hood' || args.template === 'bubble-pop'
    || args.template === 'submagic' || args.template === 'story' || args.template === 'bili' || args.template === 'luxe' || args.template === 'noir'
    || args.template === 'atelier' || args.template === 'product' || args.template === 'signal' || args.template === 'studio' || args.template === 'white-card'
    || args.template === 'bold-outline' || args.template === 'deyi-card' || args.template === 'tiktok' || args.template === 'netflix' ? args.template : 'tiktok';
  const pacing = args.pacing === 'word' ? 'word' : 'phrase';
  const draft = makeDraft(ctx.getDoc());
  current.voices.forEach((voice, index) => draft.commands.setItemTranscript(voice.item.id, alignments[index]!.words));
  const state = draft.getState();
  const sourceEntries = current.voices.map((voice, index) => ({ id: `qwen_forced_${index + 1}_${voice.item.id}`, itemId: voice.item.id, label: `旁白 ${index + 1}`, trackOrder: index }));
  const existingTrack = (state.trackOrder ?? []).find((trackId) => state.tracks?.[trackId]?.kind === 'caption' && captionsOnTrack(state, trackId)?.sourceEntries?.every((entry) => entry.id.startsWith('qwen_forced_')));
  if (existingTrack) draft.commands.setCaptions({ ...(captionsOnTrack(state, existingTrack)!), enabled: true, template, pacing, sourceEntries, sourceMode: 'item', words: undefined }, existingTrack);
  else draft.commands.createCaptionTrack({ enabled: true, template, pacing, sourceEntries, sourceMode: 'item' }, { name: typeof args.trackName === 'string' && args.trackName.trim() ? args.trackName.trim().slice(0, 80) : '强制对齐字幕' });
  ctx.commands.applyDoc(draft.getDoc());
  return {
    ok: true, source: 'Qwen3-ForcedAligner-0.6B', granularity: alignments.every((alignment) => alignment.granularity === 'character') ? 'character' : 'word',
    voiceItemIds: current.voices.map((voice) => voice.item.id), timestampCounts: alignments.map((alignment) => alignment.words.length),
    note: '已用已知文案和对应 MiMo 旁白 WAV 的真实对齐时间创建字幕；没有调用 Qwen ASR，也没有生成均分时间戳。',
  };
}
