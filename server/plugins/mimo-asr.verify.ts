import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isNoSpeechTranscript, parseMimoAsrResponse, runMimoAsr } from './mimo-asr.ts';

assert.equal(parseMimoAsrResponse({ choices: [{ message: { content: '  你好\n世界  ' } }] }), '你好 世界');
assert.equal(parseMimoAsrResponse({ choices: [{ message: { content: [{ type: 'text', text: '你好' }, { type: 'text', text: '世界' }] } }] }), '你好 世界');
assert.equal(parseMimoAsrResponse({ choices: [{ message: { content: '', audio: { transcript: '你好 世界' } } }] }), '你好 世界');
assert.throws(() => parseMimoAsrResponse({ choices: [] }), /no transcript text/);
assert.equal(isNoSpeechTranscript('（无语音内容）'), true);
assert.equal(isNoSpeechTranscript('你好，欢迎来到直播间'), false);
assert.throws(() => parseMimoAsrResponse({ choices: [{ message: { content: '（无语音内容）' } }] }), /no spoken content/);

const directory = await mkdtemp(join(tmpdir(), 'openchatcut-mimo-asr-'));
const file = join(directory, 'voice.mp3');
await writeFile(file, Buffer.from('pretend audio'));
try {
  let request: { url: string; init?: RequestInit } | undefined;
  const result = await runMimoAsr(file, {
    baseUrl: 'https://api.xiaomimimo.com/v1/', apiKey: 'server-only-secret', model: 'mimo-v2.5',
  }, 'zh', (async (url, init) => {
    request = { url: String(url), init };
    return Response.json({ choices: [{ message: { content: '你好 世界' } }] });
  }) as typeof fetch);
  assert.deepEqual(result, { text: '你好 世界', model: 'mimo-v2.5', language: 'zh' });
  assert.equal(request?.url, 'https://api.xiaomimimo.com/v1/chat/completions');
  assert.deepEqual(request?.init?.headers, { 'Content-Type': 'application/json', 'api-key': 'server-only-secret' });
  const body = JSON.parse(String(request?.init?.body)) as Record<string, any>;
  assert.equal(body.model, 'mimo-v2.5');
  assert.equal('asr_options' in body, false);
  assert.equal(body.messages[0].content[0].type, 'input_audio');
  assert.ok(body.messages[0].content[0].input_audio.data.startsWith('data:audio/mpeg;base64,'));
  assert.equal(body.messages[0].content[1].type, 'text');
  assert.match(body.messages[0].content[1].text, /转写/);
  assert.equal('words' in result, false, 'MiMo ASR must never fabricate timestamped words');
  assert.equal(JSON.stringify(result).includes('server-only-secret'), false, 'the server key never enters the result');
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('mimo-asr.verify: ok');
