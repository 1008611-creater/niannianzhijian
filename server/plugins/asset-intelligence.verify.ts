import assert from 'node:assert/strict';
import { chooseTesseractLanguages, parseTesseractLanguages, runLocalOcr, runVisionAnalysis, parseVisionAnalysis } from './asset-intelligence.ts';

assert.deepEqual(parseTesseractLanguages('List of available languages (2):\neng\nosd\n'), ['eng', 'osd']);
assert.deepEqual(chooseTesseractLanguages('eng+chi_sim', ['eng', 'osd']), {
  used: 'eng', warning: '本机未安装语言包：chi_sim',
});
assert.deepEqual(chooseTesseractLanguages('chi_sim', ['eng']), {
  used: 'eng', warning: '请求的语言包不可用，已回退至 eng',
});

const result = await runLocalOcr('public/openchatcut-icon.png', {
  tesseractPath: 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe', tessdataDir: '',
}, 'eng');
assert.equal(result.languageUsed, 'eng');
assert.equal(typeof result.text, 'string');

assert.deepEqual(parseVisionAnalysis('```json\n{"tags":["商品展示","商品展示"],"entities":[{"kind":"product","label":"无线耳机","confidence":0.92}],"scenes":[{"label":"室内桌面","confidence":0.8}]}\n```'), {
  tags: ['商品展示'],
  entities: [{ kind: 'product', label: '无线耳机', confidence: 0.92 }],
  scenes: [{ label: '室内桌面', confidence: 0.8 }],
});
assert.throws(() => parseVisionAnalysis('not json'), /有效 JSON/);

const originalFetch = globalThis.fetch;
let requestUrl = '';
let requestHeaders: Headers | undefined;
let requestBody: Record<string, unknown> | undefined;
globalThis.fetch = (async (input, init) => {
  requestUrl = String(input);
  requestHeaders = new Headers(init?.headers);
  requestBody = JSON.parse(String(init?.body));
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
    tags: ['商品展示'], entities: [{ kind: 'product', label: '耳机', confidence: 0.9 }], scenes: [{ label: '产品特写' }],
  }) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;
try {
  const vision = await runVisionAnalysis('public/openchatcut-icon.png', {
    tesseractPath: 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe', tessdataDir: '',
    visionBaseUrl: 'https://vision.example/v1/', visionApiKey: 'never-echo-this', visionModel: 'vision-test',
  });
  assert.equal(requestUrl, 'https://vision.example/v1/chat/completions');
  assert.equal(requestHeaders?.get('authorization'), 'Bearer never-echo-this');
  assert.equal(requestBody?.model, 'vision-test');
  assert.equal(vision.tags[0], '商品展示');
  assert.equal(vision.entities[0]?.label, '耳机');
  assert.ok(JSON.stringify(vision).indexOf('never-echo-this') === -1, 'result never echoes API key');
} finally {
  globalThis.fetch = originalFetch;
}
console.log('asset-intelligence.verify: ok');
