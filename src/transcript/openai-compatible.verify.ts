import assert from 'node:assert/strict';
import { transcribeOpenAiCompatiblePath, transcribePath } from './assemblyai.ts';

const originalFetch = globalThis.fetch;
const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
  return Response.json({ ok: true, text: '你好 世界', words: [
    { text: '你好', start: 0, end: 360 }, { text: '世界', start: 400, end: 820 },
  ] });
}) as typeof fetch;
try {
  const result = await transcribeOpenAiCompatiblePath('/media/uploads/voice.mp3', { languageCode: 'zh' });
  assert.equal(result.text, '你好 世界');
  assert.deepEqual(result.words, [
    { text: '你好', start: 0, end: 360, speaker: null }, { text: '世界', start: 400, end: 820, speaker: null },
  ]);
  const dispatched = await transcribePath('/media/uploads/voice.mp3', undefined, { provider: 'openai-asr', languageCode: 'auto' });
  assert.equal(dispatched.words.length, 2, 'provider dispatch uses the compatible ASR route');
  assert.deepEqual(calls, [
    { url: '/api/openai-asr/transcribe', body: { src: '/media/uploads/voice.mp3', languageCode: 'zh' } },
    { url: '/api/openai-asr/transcribe', body: { src: '/media/uploads/voice.mp3', languageCode: 'auto' } },
  ]);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('openai-compatible.verify: ok');
