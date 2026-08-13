import assert from 'node:assert/strict';
import { chooseTesseractLanguages, parseTesseractLanguages, runLocalOcr, runVideoUnderstanding, runVisionAnalysis, parseVideoUnderstanding, parseVisionAnalysis } from './asset-intelligence.ts';

const tesseractPath = process.env.TESSERACT_PATH
  || (process.platform === 'win32' ? 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe' : 'tesseract');
const intelligenceOptions = {
  tesseractPath, tessdataDir: '',
  visionBaseUrl: 'https://vision.example/v1/', visionApiKey: 'never-echo-this', visionModel: 'vision-test',
  videoBaseUrl: 'https://video.example/v1beta', videoApiKey: 'never-echo-video-key', videoModel: 'gemini-3.5-flash-lite',
};

const sampledOptions = {
  ...intelligenceOptions,
  videoBaseUrl: 'https://api3.wlai.vip',
  videoApiKey: 'never-echo-sampled-video-key',
};

assert.deepEqual(parseTesseractLanguages('List of available languages (2):\neng\nosd\n'), ['eng', 'osd']);
assert.deepEqual(chooseTesseractLanguages('eng+chi_sim', ['eng', 'osd']), {
  used: 'eng', warning: '本机未安装语言包：chi_sim',
});
assert.deepEqual(chooseTesseractLanguages('chi_sim', ['eng']), {
  used: 'eng', warning: '请求的语言包不可用，已回退至 eng',
});

const result = await runLocalOcr('public/openchatcut-icon.png', {
  tesseractPath, tessdataDir: '',
}, 'eng');
assert.equal(result.languageUsed, 'eng');
assert.equal(typeof result.text, 'string');

assert.deepEqual(parseVisionAnalysis('```json\n{"tags":["商品展示","商品展示"],"entities":[{"kind":"product","label":"无线耳机","confidence":0.92}],"scenes":[{"label":"室内桌面","confidence":0.8}]}\n```'), {
  tags: ['商品展示'],
  entities: [{ kind: 'product', label: '无线耳机', confidence: 0.92 }],
  scenes: [{ label: '室内桌面', confidence: 0.8 }],
});
assert.throws(() => parseVisionAnalysis('not json'), /有效 JSON/);
assert.deepEqual(parseVideoUnderstanding(JSON.stringify({
  summary: '三段颜色测试', tags: ['测试'], segments: [
    { startMs: 0, endMs: 2_000, label: '红色画面' },
    { startMs: 2_000, endMs: 4_000, label: '绿色画面' },
  ],
})), {
  summary: '三段颜色测试', tags: ['测试'], segments: [
    { startMs: 0, endMs: 2_000, label: '红色画面' },
    { startMs: 2_000, endMs: 4_000, label: '绿色画面' },
  ],
});

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
  const vision = await runVisionAnalysis('public/openchatcut-icon.png', intelligenceOptions);
  assert.equal(requestUrl, 'https://vision.example/v1/chat/completions');
  assert.equal(requestHeaders?.get('authorization'), 'Bearer never-echo-this');
  assert.equal(requestBody?.model, 'vision-test');
  assert.equal(vision.tags[0], '商品展示');
  assert.equal(vision.entities[0]?.label, '耳机');
  assert.ok(JSON.stringify(vision).indexOf('never-echo-this') === -1, 'result never echoes API key');
} finally {
  globalThis.fetch = originalFetch;
}

globalThis.fetch = (async (input, init) => {
  requestUrl = String(input);
  requestHeaders = new Headers(init?.headers);
  requestBody = JSON.parse(String(init?.body));
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      summary: '颜色依次变化', tags: ['颜色测试'], segments: [
        { startMs: 0, endMs: 2_000, label: '红色' }, { startMs: 2_000, endMs: 4_000, label: '绿色' },
      ],
    }) }] } }],
    usageMetadata: { promptTokensDetails: [{ modality: 'TEXT', tokenCount: 20 }, { modality: 'VIDEO', tokenCount: 378 }] },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;
try {
  const video = await runVideoUnderstanding('public/openchatcut-icon.png', intelligenceOptions, '按颜色切分');
  assert.equal(requestUrl, 'https://video.example/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.equal(requestHeaders?.get('x-goog-api-key'), 'never-echo-video-key');
  assert.equal(video.videoTokens, 378);
  assert.equal(video.segments[0]?.label, '红色');
  assert.ok(JSON.stringify(requestBody).includes('inlineData'));
  assert.ok(JSON.stringify(video).indexOf('never-echo-video-key') === -1, 'video result never echoes API key');
} finally {
  globalThis.fetch = originalFetch;
}

assert.equal(sampledOptions.videoBaseUrl, 'https://api3.wlai.vip');
assert.equal(sampledOptions.videoModel, 'gemini-3.5-flash-lite');
console.log('asset-intelligence.verify: ok');
