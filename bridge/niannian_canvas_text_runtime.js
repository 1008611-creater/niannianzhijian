'use strict';

const DEFAULT_BASE_URL = 'https://api.asxs.top/v1';
const DEFAULT_COMPLETIONS_PATH = '/chat/completions';

function isOn(value) {
  return String(value || '').trim().toLowerCase() === 'on';
}

function clean(value, limit = 4000) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, limit);
}

function readCanvasTextConfig(env = process.env) {
  const apiKey = clean(env.NIANNIAN_TEXT_API_KEY, 1000);
  const model = clean(env.NIANNIAN_TEXT_MODEL, 200);
  const baseUrl = String(env.NIANNIAN_TEXT_API_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '') || DEFAULT_BASE_URL;
  const completionsPath = '/' + String(env.NIANNIAN_TEXT_COMPLETIONS_PATH || DEFAULT_COMPLETIONS_PATH).trim().replace(/^\/+/, '');
  const baseUrlValid = /^https:\/\//.test(baseUrl);
  const modelConfigured = Boolean(model);
  const credentialConfigured = Boolean(apiKey);
  const submitEnabled = credentialConfigured && modelConfigured && baseUrlValid && isOn(env.NIANNIAN_TEXT_PROVIDER_SUBMIT);
  return Object.freeze({
    provider: 'asxs',
    baseUrl,
    completionsPath,
    model,
    modelConfigured,
    credentialConfigured,
    submitEnabled
  });
}

function publicCanvasTextStatus(env = process.env) {
  const config = readCanvasTextConfig(env);
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    completionsPath: config.completionsPath,
    model: config.model || null,
    modelConfigured: config.modelConfigured,
    credentialConfigured: config.credentialConfigured,
    submitEnabled: config.submitEnabled
  };
}

function runtimeError(code, message, httpStatus = 400) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function extractText(body) {
  const choice = Array.isArray(body?.choices) ? body.choices[0] : null;
  const content = choice?.message?.content;
  if (typeof content === 'string' && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    const joined = content.map(item => typeof item === 'string' ? item : item?.text).filter(Boolean).join('').trim();
    if (joined) return joined;
  }
  if (typeof choice?.text === 'string' && choice.text.trim()) return choice.text.trim();
  if (typeof body?.output_text === 'string' && body.output_text.trim()) return body.output_text.trim();
  return '';
}

function publicProviderResponse(text, model) {
  return {
    choices: [{message: {role: 'assistant', content: text}}],
    model,
    object: 'chat.completion'
  };
}

function createCanvasTextRuntime(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;

  async function submit(input = {}) {
    const startedAt = Date.now();
    const failure = (code, message, httpStatus = 502, metadata = {}) => {
      const error = runtimeError(code, message, httpStatus);
      error.providerHttpStatus = Number.isInteger(metadata.providerHttpStatus) ? metadata.providerHttpStatus : null;
      error.durationMs = Math.max(0, Date.now() - startedAt);
      return error;
    };
    const config = readCanvasTextConfig(env);
    if (!config.submitEnabled) throw runtimeError('CANVAS_TEXT_PROVIDER_NOT_READY', '文本模型尚未完成服务端配置', 409);
    const prompt = clean(input.prompt, 12000);
    if (!prompt) throw runtimeError('CANVAS_TEXT_PROMPT_REQUIRED', '文本节点需要填写提示词', 422);
    const model = clean(input.model || config.model, 200);
    if (!model || model !== config.model) throw runtimeError('CANVAS_TEXT_MODEL_INVALID', '文本模型与服务器配置不匹配', 422);
    const body = {
      model,
      messages: [{role: 'user', content: prompt}],
      stream: false
    };
    let response;
    try {
      response = await fetchImpl(config.baseUrl + config.completionsPath, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + clean(env.NIANNIAN_TEXT_API_KEY, 1000)},
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Number(env.NIANNIAN_TEXT_PROVIDER_TIMEOUT_MS || 120000))
      });
    } catch {
      throw failure('CANVAS_TEXT_PROVIDER_NETWORK', '文本模型暂时无法连接，请稍后重试');
    }
    if (!response.ok) throw failure('CANVAS_TEXT_PROVIDER_FAILED', '文本模型暂时不可用，请稍后重试', 502, {providerHttpStatus: response.status});
    let upstream;
    try { upstream = await response.json(); } catch { throw failure('CANVAS_TEXT_PROVIDER_INVALID_RESPONSE', '文本模型返回了无法读取的结果'); }
    const text = extractText(upstream);
    if (!text) throw failure('CANVAS_TEXT_PROVIDER_EMPTY', '文本模型没有返回可用内容');
    return {model, text, raw: publicProviderResponse(text, model)};
  }

  return {submit, config: readCanvasTextConfig(env)};
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_COMPLETIONS_PATH,
  readCanvasTextConfig,
  publicCanvasTextStatus,
  extractText,
  publicProviderResponse,
  createCanvasTextRuntime
};
