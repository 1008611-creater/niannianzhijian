'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const {imageMime} = require('./niannian_runninghub_image_adapter');

const DEFAULT_WINDOWS_SCRIPT = 'C:\\Users\\lsb\\.codex\\skills\\image2-skill\\scripts\\image2_channel.py';
const DEFAULT_WINDOWS_PYTHON = 'C:\\Users\\lsb\\anaconda3\\python.exe';
const DEFAULT_SCRIPT = process.platform === 'win32'
  ? DEFAULT_WINDOWS_SCRIPT
  : path.join(__dirname, 'niannian_yunwu_image2_channel.py');
const DEFAULT_PYTHON = process.platform === 'win32' ? DEFAULT_WINDOWS_PYTHON : 'python3';
const EDIT_CHANNEL = 'yunwu-gpt-image-2-c-edit';
const EDIT_OUTPUT_SIZE = '3840x2160';
const GENERATE_OUTPUT_SIZES = Object.freeze({'9:16':'2160x3840','3:4':'2160x2880'});

function adapterError(code, message, httpStatus = 502) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function safeReceiptDiagnostic(receiptPath) {
  return fsp.readFile(receiptPath, 'utf8').then(text => {
    const receipt = JSON.parse(text);
    const status = String(receipt?.status || '').trim();
    const errorType = String(receipt?.error_type || '').trim();
    const httpStatus = Number(receipt?.http_status);
    return {
      status:/^[a-z_]{1,80}$/.test(status) ? status : null,
      errorType:/^[A-Za-z][A-Za-z0-9_.-]{0,80}$/.test(errorType) ? errorType : null,
      httpStatus:Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? httpStatus : null
    };
  }).catch(() => ({status:null,errorType:null,httpStatus:null}));
}

function vaultReady(env) {
  return ['AGENT_VAULT_ADDR', 'AGENT_VAULT_VAULT', 'AGENT_VAULT_TOKEN'].every(name => String(env[name] || '').trim())
    && String(env.HTTPS_PROXY || env.https_proxy || '').trim();
}

function protectedProxyEnv(env) {
  const proxy = String(env.HTTPS_PROXY || env.https_proxy || '').trim();
  const token = String(env.AGENT_VAULT_TOKEN || '').trim();
  const vault = String(env.AGENT_VAULT_VAULT || '').trim();
  if (!proxy || !token || !vault) return env;
  let url;
  try { url = new URL(proxy); } catch { return env; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return env;
  url.username = token;
  url.password = vault;
  // The authenticated proxy address exists only in the child process. It is
  // never persisted, returned, or written to diagnostics.
  const authenticatedProxy = url.toString();
  return {
    ...env,
    HTTPS_PROXY:authenticatedProxy,
    HTTP_PROXY:authenticatedProxy,
    https_proxy:authenticatedProxy,
    http_proxy:authenticatedProxy
  };
}

function execute(file, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {env, shell:false, windowsHide:true, stdio:['ignore', 'pipe', 'pipe']});
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', code => resolve({code, stderr:stderr.slice(0, 300)}));
  });
}

function createYunwuAgentVaultImage2Adapter(options = {}) {
  const env = options.env || process.env;
  const pythonPath = String(options.pythonPath || DEFAULT_PYTHON);
  const scriptPath = String(options.scriptPath || DEFAULT_SCRIPT);
  const tempRoot = String(options.tempRoot || path.join(os.tmpdir(), 'niannian-canvas-yunwu'));
  const run = options.run || execute;

  function validate(task, referenceFiles = []) {
    const isEdit = referenceFiles.length > 0;
    if (isEdit && (referenceFiles.length > 16 || task.image_channel !== EDIT_CHANNEL)) throw adapterError('YUNWU_IMAGE_REFERENCE_INVALID', '云雾图改图需要一至十六张参考图和图改图通道', 422);
    if (!isEdit && referenceFiles.length) throw adapterError('YUNWU_IMAGE_REFERENCE_INVALID', '云雾图改图参考图无效', 422);
    const aspectRatio = String(task.aspect_ratio || task.aspectRatio || (isEdit ? '16:9' : '9:16')).trim();
    const expectedSize = isEdit ? EDIT_OUTPUT_SIZE : GENERATE_OUTPUT_SIZES[aspectRatio];
    if (!expectedSize) throw adapterError('YUNWU_ASPECT_RATIO_INVALID', `云雾 Image2 不支持 ${aspectRatio} 比例`, 422);
    if (String(task.output_size || task.outputSize || '') !== expectedSize) throw adapterError('YUNWU_OUTPUT_SIZE_INVALID', `云雾 Image2 当前只支持 ${expectedSize} 输出`, 422);
    if (!vaultReady(env)) throw adapterError('YUNWU_AGENT_VAULT_NOT_CONFIGURED', '云雾受保护代理会话尚未配置', 503);
    return {endpoint:isEdit ? '/v1/images/edits' : '/v1/images/generations', payload:{model:'gpt-image-2-c', size:expectedSize, referenceCount:referenceFiles.length, operation:isEdit ? 'edit' : 'generate', credentialMode:'agent_vault_proxy'}};
  }

  async function cleanup(paths) { await Promise.all(paths.map(file => fsp.rm(file, {force:true}).catch(() => {}))); }

  function executionFailure(error) {
    if (error?.code === 'ENOENT') return adapterError('YUNWU_EXECUTOR_NOT_CONFIGURED', '云雾执行器尚未配置', 503);
    return adapterError('YUNWU_NETWORK_UNCERTAIN', '云雾请求状态待确认');
  }

async function executionExitFailure(result, receiptPath) {
  const code = Number(result?.code);
  const diagnostic = await safeReceiptDiagnostic(receiptPath);
  if (code === 2) return adapterError('YUNWU_AGENT_VAULT_NOT_CONFIGURED', '云雾受保护代理会话尚未配置', 503);
  if ([126, 127].includes(code)) return adapterError('YUNWU_EXECUTOR_NOT_CONFIGURED', '云雾执行器尚未配置', 503);
  if (code === 5) {
    const error = adapterError('YUNWU_NETWORK_UNCERTAIN', '云雾请求状态待确认');
    error.providerCode = diagnostic.errorType ? `uncertain:${diagnostic.errorType}` : 'uncertain';
    return error;
  }
  if (diagnostic.httpStatus >= 500 && diagnostic.httpStatus <= 599) {
    const error = adapterError('YUNWU_UPSTREAM_UNAVAILABLE', '云雾服务暂时不可用', 503);
    error.providerCode = `http:${diagnostic.httpStatus}`;
    return error;
  }
  const error = adapterError('YUNWU_SUBMISSION_REJECTED', '云雾图像请求未通过');
  error.providerCode = diagnostic.httpStatus ? `http:${diagnostic.httpStatus}` : (diagnostic.status || 'rejected');
  return error;
}

  async function dryRun(task, referenceFiles = []) {
    const preflight = validate(task, referenceFiles);
    const id = crypto.randomUUID();
    await fsp.mkdir(tempRoot, {recursive:true});
    const promptPath = path.join(tempRoot, `${id}.prompt.txt`);
    const receiptPath = path.join(tempRoot, `${id}.receipt.json`);
    await fsp.writeFile(promptPath, String(task.prompt || ''), 'utf8');
    try {
      const args = [scriptPath, '--channel', 'yunwu', '--operation', preflight.payload.operation, '--prompt-file', promptPath, '--model', 'gpt-image-2-c', '--size', preflight.payload.size, '--asset-id', `canvas-${id}`, '--dry-run', '--receipt', receiptPath];
      for (const referenceFile of referenceFiles) args.push('--reference-image', referenceFile);
      const result = await run(pythonPath, args, protectedProxyEnv(env));
      if (result.code !== 0) throw await executionExitFailure(result, receiptPath);
      return preflight;
    } catch (error) {
      if (error?.code?.startsWith('YUNWU_')) throw error;
      throw executionFailure(error);
    } finally {
      await cleanup([promptPath, receiptPath]);
    }
  }

  async function submit(task, referenceFiles = []) {
    const preflight = await dryRun(task, referenceFiles);
    const id = crypto.randomUUID();
    await fsp.mkdir(tempRoot, {recursive:true});
    const promptPath = path.join(tempRoot, `${id}.prompt.txt`);
    const outputPath = path.join(tempRoot, `${id}.png`);
    const receiptPath = path.join(tempRoot, `${id}.receipt.json`);
    await fsp.writeFile(promptPath, String(task.prompt || ''), 'utf8');
    let result;
    try {
      const args = [scriptPath, '--channel', 'yunwu', '--operation', preflight.payload.operation, '--prompt-file', promptPath, '--model', 'gpt-image-2-c', '--size', preflight.payload.size, '--asset-id', `canvas-${id}`, '--submit', '--output', outputPath, '--receipt', receiptPath];
      for (const referenceFile of referenceFiles) args.push('--reference-image', referenceFile);
      result = await run(pythonPath, args, protectedProxyEnv(env));
    } catch (error) {
      await cleanup([promptPath, outputPath, receiptPath]);
      throw executionFailure(error);
    }
    await fsp.rm(promptPath, {force:true});
    if (result.code === 0) return {taskId:`local-${id}`, payload:{outputPath, receiptPath}};
    const failure = await executionExitFailure(result, receiptPath);
    await cleanup([outputPath, receiptPath]);
    throw failure;
  }

  async function query(taskId, payload) {
    const outputPath = String(payload?.outputPath || '');
    const receiptPath = String(payload?.receiptPath || '');
    if (!outputPath || !receiptPath) throw adapterError('YUNWU_OUTPUT_MISSING', '云雾图像结果不可读取');
    try {
      const bytes = await fsp.readFile(outputPath);
      imageMime(bytes);
      return {status:'completed', inlineImages:[bytes.toString('base64')], imageUrls:[]};
    } finally {
      await cleanup([outputPath, receiptPath]);
    }
  }

  return {dryRun, submit, query, constants:{generateEndpoint:'https://yunwu.ai/v1/images/generations', editEndpoint:'https://yunwu.ai/v1/images/edits', model:'gpt-image-2-c', generateOutputSizes:GENERATE_OUTPUT_SIZES, editOutputSize:EDIT_OUTPUT_SIZE}};
}

module.exports = {createYunwuAgentVaultImage2Adapter, vaultReady, protectedProxyEnv, DEFAULT_PYTHON, DEFAULT_SCRIPT};
