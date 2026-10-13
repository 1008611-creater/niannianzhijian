import type { TranscriptWord } from './types';

export interface KnownVoiceoverAlignment {
  model: string;
  granularity: 'character' | 'word';
  words: TranscriptWord[];
}

/**
 * Align approved narration to its own generated audio. This is intentionally
 * separate from ASR: callers must provide the exact known text.
 */
export async function alignKnownVoiceover(src: string, text: string): Promise<KnownVoiceoverAlignment> {
  const response = await fetch('/api/qwen-forced-aligner/align', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src, text }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body !== 'object' || Array.isArray(body)) {
    const error = body && typeof body === 'object' && !Array.isArray(body) && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error : `Qwen 强制对齐请求失败（HTTP ${response.status}）`;
    throw new Error(error);
  }
  const result = body as { ok?: unknown; model?: unknown; granularity?: unknown; words?: unknown; error?: unknown };
  if (result.ok !== true || !Array.isArray(result.words)) throw new Error(typeof result.error === 'string' ? result.error : 'Qwen 强制对齐返回无效');
  const words = result.words.flatMap((entry): TranscriptWord[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const word = entry as { text?: unknown; start?: unknown; end?: unknown };
    const textValue = typeof word.text === 'string' ? word.text.trim() : '';
    const start = Number(word.start); const end = Number(word.end);
    return textValue && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start
      ? [{ text: textValue, start: Math.round(start), end: Math.round(end) }] : [];
  });
  if (!words.length) throw new Error('Qwen 强制对齐没有返回可用时间戳');
  return {
    model: typeof result.model === 'string' ? result.model : 'Qwen/Qwen3-ForcedAligner-0.6B-hf',
    granularity: result.granularity === 'word' ? 'word' : 'character', words,
  };
}
