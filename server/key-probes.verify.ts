// checks:key-probes pure logic - detection table coverage, override whitelist, status classification,
// MiniMax base_resp post-check, runProbe does not hit the network early exit. There are no real network requests in the whole process.
import assert from 'node:assert/strict';
import { PROBES, classifyStatus, makeGetter, minimaxPostCheck, networkMessage, runProbe } from './key-probes.ts';
import { LLM_PROVIDER_PRESETS } from '../shared/llm-providers.ts';

// 1. One-to-one correspondence with the provider page of settingsSchema (the page key has the same name); the llm page is derived from the preset,
// Synchronize this list when adding other capability pages.
const EXPECTED_PAGES = [
  ...LLM_PROVIDER_PRESETS.map((preset) => `llm/${preset.id}`),
  'image/openai', 'image/gemini', 'image/minimax', 'image/wavespeed', 'image/byteplus',
  'voice/elevenlabs', 'voice/doubao', 'voice/minimax', 'voice/mimo', 'voice/openai-tts', 'voice/inworld', 'voice/fishaudio', 'voice/speechify',
  'analysis/openai-vision', 'transcription/mimo-asr',
  'video/seedance', 'video/kling', 'video/hailuo', 'video/byteplus',
  'music/mureka', 'music/minimax',
  'stock/pexels', 'stock/pixabay', 'stock/unsplash', 'stock/freesound',
  'transcription/assemblyai', 'transcription/openai-asr',
  'sandbox/e2b',
  'web/firecrawl',
  'storage/r2', 'storage/local',
];
for (const page of EXPECTED_PAGES) assert.ok(PROBES[page], `probe missing for ${page}`);
assert.equal(Object.keys(PROBES).length, EXPECTED_PAGES.length, 'PROBES 有清单外的多余页');

// 2. Override whitelist: items outside the whitelist will be discarded, empty values ​​will not be covered, and values ​​will be trimmed.
{
  const get = makeGetter({ ELEVENLABS_API_KEY: '  k1  ', NOT_A_KEY: 'x', LLM_API_KEY: '   ' });
  assert.equal(get('ELEVENLABS_API_KEY'), 'k1');
  assert.equal(get('LLM_API_KEY'), '');   // Blank override does not take effect; keystore is not seeded and has no value
  assert.equal(get('MINIMAX_API_KEY'), '');
}

// 3. Status classification: Authentication / Address / Current Limiting / Others, each has a clear conclusion.
assert.equal(classifyStatus(401, '').ok, false);
assert.match(classifyStatus(401, '').message, /鉴权失败/);
assert.match(classifyStatus(403, '').message, /鉴权失败/);
assert.match(classifyStatus(404, '').message, /Base URL/);
assert.equal(classifyStatus(429, '').ok, true);
assert.match(classifyStatus(429, '').message, /限流/);
{
  const r = classifyStatus(500, 'boom\n  line2\ttail');
  assert.equal(r.ok, false);
  assert.match(r.message, /HTTP 500 · boom line2 tail/); // flatten whitespace
  assert.ok(classifyStatus(500, 'x'.repeat(500)).message.length < 200, '厂商长报错要截断');
}

// 4. MiniMax base_resp:0 = success; non-0 means provider-level failure (HTTP 200 is also considered a failure); non-JSON is released.
assert.equal(minimaxPostCheck(JSON.stringify({ base_resp: { status_code: 0 } })), null);
assert.match(minimaxPostCheck(JSON.stringify({ base_resp: { status_code: 1004, status_msg: 'invalid api key' } })) ?? '', /1004.*鉴权失败/);
assert.match(minimaxPostCheck(JSON.stringify({ base_resp: { status_code: 2049 } })) ?? '', /2049/);
assert.equal(minimaxPostCheck('not json'), null);

// 5. Network layer failure copy: clearly "does not mean Key error", and timeout is worded separately.
assert.match(networkMessage(new TypeError('fetch failed')), /网络不可达[\s\S]*不代表 Key 错误/);
assert.match(networkMessage(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })), /超时/);

// 6. runProbe exits early: Unknown page / Key is not configured and does not connect to the network (keystore is empty, synchronization will return).
{
  const unknown = await runProbe('nope/vendor', {});
  assert.equal(unknown.ok, false);
  assert.match(unknown.message, /暂不支持/);
  const unconfigured = await runProbe('voice/elevenlabs', {});
  assert.equal(unconfigured.ok, false);
  assert.match(unconfigured.message, /尚未填写 API Key/);
  // Doubao requires both keys: only the App ID is still unconfigured
  const half = await runProbe('voice/doubao', { DOUBAO_TTS_APP_ID: 'a' });
  assert.match(half.message, /尚未填写 API Key/);
  const openaiUnconfigured = await runProbe('voice/openai-tts', {});
  assert.match(openaiUnconfigured.message, /尚未填写 API Key/);
  const visionUnconfigured = await runProbe('analysis/openai-vision', {});
  assert.match(visionUnconfigured.message, /尚未填写 API Key/);
  const asrUnconfigured = await runProbe('transcription/openai-asr', {});
  assert.match(asrUnconfigured.message, /尚未填写 API Key/);
}

// 7. OpenAI must verify the operation endpoint after /models; a catalog-only 200
// must not report an Agent-ready configuration. Responses and Chat Completions
// both use the configured model, while response bodies remain out of the result.
{
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: string }> = [];
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
      if (url.endsWith('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'gpt-test' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: 'invalid api key secret-response' } }), { status: 401 });
    };
    const rejected = await runProbe('llm/openai', {
      LLM_OPENAI_API_KEY: 'probe-secret',
      LLM_OPENAI_BASE_URL: 'https://relay.test/v1',
      LLM_OPENAI_MODEL: 'gpt-test',
      LLM_OPENAI_API_MODE: 'chat',
    });
    assert.equal(rejected.ok, false);
    assert.match(rejected.message, /模型列表可用，但对话接口不可用/);
    assert.match(rejected.message, /HTTP 401/);
    assert.doesNotMatch(rejected.message, /secret-response|probe-secret/);
    assert.ok(requests.some((request) => request.url.endsWith('/chat/completions')));

    requests.length = 0;
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, body: typeof init?.body === 'string' ? init.body : '' });
      return url.endsWith('/models')
        ? new Response(JSON.stringify({ data: [{ id: 'gpt-test' }] }), { status: 200 })
        : new Response(JSON.stringify({ id: 'resp-test', output: [] }), { status: 200 });
    };
    const accepted = await runProbe('llm/openai', {
      LLM_OPENAI_API_KEY: 'probe-secret',
      LLM_OPENAI_BASE_URL: 'https://relay.test/v1',
      LLM_OPENAI_MODEL: 'gpt-test',
      LLM_OPENAI_API_MODE: 'responses',
    });
    assert.equal(accepted.ok, true);
    assert.match(accepted.message, /连接成功/);
    assert.ok(requests.some((request) => request.url.endsWith('/responses')));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 8. Local storage directory probe: empty group needs = can be tested if not filled in (not set = default directory); the relative path is configured
// Level failure (postCheck copy, no HTTP prefix); success copy goes to okText. Neither case touched the plate.
{
  const unset = await runProbe('storage/local', {});
  assert.equal(unset.ok, true);
  assert.match(unset.message, /默认目录 .*public[/\\]media[/\\]uploads/); // The copy has a machine-related absolute path and only anchors the tail section.
  const relative = await runProbe('storage/local', { MEDIA_DIR: 'relative/path' });
  assert.equal(relative.ok, false);
  assert.match(relative.message, /绝对路径/);
  assert.doesNotMatch(relative.message, /HTTP/);
}

console.log('key-probes.verify OK');
