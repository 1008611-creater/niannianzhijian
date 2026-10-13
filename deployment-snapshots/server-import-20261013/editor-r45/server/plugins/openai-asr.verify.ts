import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleOpenAiAsr, parseOpenAiAsrResponse } from './openai-asr.ts';

assert.deepEqual(parseOpenAiAsrResponse({ text: '你好 世界', words: [
  { word: '你好', start: 0, end: 0.4 }, { word: '世界', start: 0.45, end: 0.8 },
] }), { text: '你好 世界', words: [{ text: '你好', start: 0, end: 400 }, { text: '世界', start: 450, end: 800 }] });
assert.throws(() => parseOpenAiAsrResponse({ text: '只有文本' }), /no word timestamps/);

function request(body: unknown): IncomingMessage {
  return Object.assign(Readable.from([JSON.stringify(body)]), {
    method: 'POST', headers: { 'content-type': 'application/json' },
  }) as unknown as IncomingMessage;
}

function response(): { raw: ServerResponse; read: () => { status: number; body: Record<string, unknown> } } {
  let status = 0;
  let body = '';
  const raw = {
    destroyed: false, writableEnded: false,
    set statusCode(value: number) { status = value; }, get statusCode() { return status; },
    setHeader: () => undefined,
    end(value: unknown) { body = String(value ?? ''); this.writableEnded = true; },
  } as unknown as ServerResponse;
  return { raw, read: () => ({ status, body: JSON.parse(body) as Record<string, unknown> }) };
}

const directory = await mkdtemp(join(tmpdir(), 'openchatcut-openai-asr-'));
const file = join(directory, 'voice.mp3');
await writeFile(file, Buffer.from('pretend audio'));
try {
  let submitted = 0;
  const out = response();
  await handleOpenAiAsr(request({ src: '/media/uploads/voice.mp3', languageCode: 'zh' }), out.raw, {
    baseUrl: 'https://asr.example/v1', apiKey: 'server-only-secret', model: 'whisper-1',
  }, {
    resolveFile: (name) => name === 'voice.mp3' ? file : null,
    fetchUpstream: (async (url, init) => {
      submitted += 1;
      assert.equal(url, 'https://asr.example/v1/audio/transcriptions');
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer server-only-secret');
      const form = init?.body as FormData;
      assert.equal(form.get('model'), 'whisper-1');
      assert.equal(form.get('language'), 'zh');
      assert.equal(form.get('response_format'), 'verbose_json');
      assert.equal(form.get('timestamp_granularities[]'), 'word');
      const media = form.get('file') as Blob;
      assert.equal((await media.arrayBuffer()).byteLength, Buffer.byteLength('pretend audio'));
      return Response.json({ text: '你好', words: [{ word: '你好', start: 0, end: 0.5 }] });
    }) as typeof fetch,
  });
  const success = out.read();
  assert.equal(success.status, 200);
  assert.deepEqual(success.body.words, [{ text: '你好', start: 0, end: 500 }]);
  assert.equal(JSON.stringify(success.body).includes('server-only-secret'), false, 'the server key never enters a browser response');
  assert.equal(submitted, 1);

  const rejected = response();
  await handleOpenAiAsr(request({ src: 'https://remote.example/voice.mp3' }), rejected.raw, {
    baseUrl: 'https://asr.example/v1', apiKey: 'server-only-secret', model: 'whisper-1',
  }, { fetchUpstream: (async () => { throw new Error('must not call upstream'); }) as typeof fetch });
  assert.equal(rejected.read().status, 400);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('openai-asr.verify: ok');
