'use strict';

const step02Runtime = require('./niannian_step02_runtime');

const RESPONSE_MODEL = 'gpt-5.6';
const MAX_PORT_VALUE = 8000;

function text(value, limit = 4000) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, limit);
}

function compilerError(code, message, httpStatus = 400) {
  return Object.assign(new Error(message), {code, httpStatus});
}

function configuredStatus(env = process.env) {
  const baseUrl = text(env.NIANNIAN_GPT_API_BASE_URL || 'https://www.mcgrox.top', 500).replace(/\/+$/, '');
  const model = text(env.NIANNIAN_GPT56_MODEL || RESPONSE_MODEL, 160);
  return {
    provider: 'mcgrox',
    wireApi: 'responses',
    model: model || null,
    baseUrl,
    credentialConfigured: Boolean(text(env.NIANNIAN_GPT_API_KEY, 1000)),
    modelConfigured: Boolean(model),
    submitEnabled: Boolean(model) && /^https:\/\//.test(baseUrl) && Boolean(text(env.NIANNIAN_GPT_API_KEY, 1000))
  };
}

function extractResponseText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) return response.output_text.trim();
  const output = Array.isArray(response?.output) ? response.output : [];
  const pieces = [];
  for (const item of output) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === 'string') pieces.push(content.text);
      else if (typeof content?.output_text === 'string') pieces.push(content.output_text);
    }
  }
  return pieces.join('\n').trim();
}

function schemaFor(outputPorts) {
  const properties = {};
  for (const port of outputPorts) properties[port.id] = {type:'string',minLength:1,maxLength:MAX_PORT_VALUE};
  return {type:'object',additionalProperties:false,required:outputPorts.map(port => port.id),properties};
}

function validateOutputs(value, outputPorts) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw compilerError('CANVAS_COMPILER_SCHEMA_INVALID', '编排模型没有返回有效 JSON', 502);
  const expected = outputPorts.map(port => port.id).sort();
  const received = Object.keys(value).sort();
  if (expected.join('|') !== received.join('|')) throw compilerError('CANVAS_COMPILER_SCHEMA_INVALID', '编排模型输出端口不完整', 502);
  const outputs = {};
  for (const port of outputPorts) {
    if (typeof value[port.id] !== 'string' || !text(value[port.id], MAX_PORT_VALUE)) throw compilerError('CANVAS_COMPILER_SCHEMA_INVALID', '编排模型输出不能为空', 502);
    outputs[port.id] = text(value[port.id], MAX_PORT_VALUE);
  }
  return outputs;
}

function createCanvasMcgroxCompiler(options = {}) {
  const env = options.env || process.env;
  const responsesClient = options.responsesClient || step02Runtime.createResponsesClient(options.fetchImpl);

  async function compile({skillKey, skillVersion, description, inputs, outputPorts}) {
    const status = configuredStatus(env);
    if (!status.submitEnabled) throw compilerError('CANVAS_COMPILER_NOT_READY', 'MCGrox 服务端文本执行器尚未配置完成', 409);
    if (!skillKey || !Array.isArray(outputPorts) || !outputPorts.length) throw compilerError('CANVAS_COMPILER_CONTRACT_INVALID', '编排节点合同无效', 422);
    const outputsSchema = schemaFor(outputPorts);
    const body = {
      model: status.model,
      store: false,
      instructions: [
        '你是念念 AI 画布中的编排 Skill 编译器。',
        '只根据输入编排内容；不得声称已生成图片、视频或上传资产。',
        '必须仅返回符合 JSON Schema 的对象，不调用工具，不附加解释。',
        '输出将被后续念念画布 Image2/H3 服务器任务使用。'
      ].join('\n'),
      input: JSON.stringify({skill_key:skillKey,skill_version:skillVersion,description:text(description, 1600),inputs}),
      text:{format:{type:'json_schema',name:'niannian_canvas_' + String(skillKey).replace(/[^A-Za-z0-9_]/g, '_') + '_v1',strict:true,schema:outputsSchema}}
    };
    let response;
    try { response = await responsesClient.call(body); }
    catch (error) {
      if (error?.code) throw error;
      throw compilerError('CANVAS_COMPILER_PROVIDER_FAILED', 'MCGrox 编排请求失败，可稍后重试', 502);
    }
    const raw = extractResponseText(response);
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { throw compilerError('CANVAS_COMPILER_SCHEMA_INVALID', 'MCGrox 未返回可读取的编排 JSON', 502); }
    return {model:status.model, outputs:validateOutputs(parsed, outputPorts)};
  }

  return {compile, status:configuredStatus(env)};
}

module.exports = {RESPONSE_MODEL, configuredStatus, extractResponseText, schemaFor, validateOutputs, createCanvasMcgroxCompiler};
