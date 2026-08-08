import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { handleMimoQwenAsr } from './mimo-qwen-asr.ts';

async function request(body: unknown, dependencies: Parameters<typeof handleMimoQwenAsr>[3]) {
  const req = new PassThrough() as PassThrough & { method?: string; headers: Record<string, string> };
  req.method = 'POST'; req.headers = { 'content-type': 'application/json' };
  const chunks: Buffer[] = [];
  const res = {
    destroyed: false, writableEnded: false, statusCode: 200,
    setHeader() {},
    end(value?: string) { if (value) chunks.push(Buffer.from(value)); this.writableEnded = true; },
  };
  req.end(JSON.stringify(body));
  await handleMimoQwenAsr(req as never, res as never, { baseUrl: 'https://example.invalid', apiKey: 'test', model: 'mimo-v2.5-asr' }, dependencies);
  return { status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown> };
}

const ok = await request({ src: '/media/uploads/test.mp4', language: 'zh' }, {
  resolveFile: () => '/tmp/test.mp4',
  transcribe: async () => ({ text: '你好世界', model: 'mimo-v2.5-asr', language: 'zh' }),
  align: async () => ({ model: 'Qwen/Qwen3-ForcedAligner-0.6B-hf', granularity: 'character', words: [{ text: '你', start: 0, end: 100 }, { text: '好', start: 100, end: 220 }] }),
});
assert.equal(ok.status, 200);
assert.equal(ok.body.ok, true);
assert.deepEqual(ok.body.words, [{ text: '你', start: 0, end: 100 }, { text: '好', start: 100, end: 220 }]);
const failed = await request({ src: '/media/uploads/test.mp4' }, {
  resolveFile: () => '/tmp/test.mp4',
  transcribe: async () => ({ text: '你好', model: 'mimo-v2.5-asr', language: 'zh' }),
  align: async () => { throw new Error('Qwen 强制对齐环境未安装'); },
});
assert.equal(failed.status, 502);
assert.equal(failed.body.ok, undefined);
assert.match(String(failed.body.error), /Qwen/);
console.log('mimo-qwen-asr.verify: ok');
