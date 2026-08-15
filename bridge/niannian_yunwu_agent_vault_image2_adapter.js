'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const {imageMime} = require('./niannian_runninghub_image_adapter');

const DEFAULT_SCRIPT = 'C:\\Users\\lsb\\.codex\\skills\\image2-skill\\scripts\\image2_channel.py';
const DEFAULT_PYTHON = 'C:\\Users\\lsb\\anaconda3\\python.exe';

function adapterError(code, message, httpStatus = 502) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function vaultReady(env) {
  return ['AGENT_VAULT_ADDR', 'AGENT_VAULT_VAULT', 'AGENT_VAULT_TOKEN'].every(name => String(env[name] || '').trim())
    && String(env.HTTPS_PROXY || env.https_proxy || '').trim();
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

  function dryRun(task, referenceFiles = []) {
    if (referenceFiles.length) throw adapterError('YUNWU_IMAGE_REFERENCE_UNSUPPORTED', '云雾 Image2 当前只支持文生图，不能使用参考图', 422);
    if (String(task.output_size || task.outputSize || '') !== '2160x3840') throw adapterError('YUNWU_OUTPUT_SIZE_INVALID', '云雾 Image2 当前只支持竖版 2160x3840 输出', 422);
    if (!vaultReady(env)) throw adapterError('YUNWU_AGENT_VAULT_NOT_CONFIGURED', '云雾受保护代理会话尚未配置', 503);
    return {endpoint:'/v1/images/generations', payload:{model:'gpt-image-2-c', size:'2160x3840', referenceCount:0, credentialMode:'agent_vault_proxy'}};
  }

  async function cleanup(paths) { await Promise.all(paths.map(file => fsp.rm(file, {force:true}).catch(() => {}))); }

  async function submit(task, referenceFiles = []) {
    dryRun(task, referenceFiles);
    const id = crypto.randomUUID();
    await fsp.mkdir(tempRoot, {recursive:true});
    const promptPath = path.join(tempRoot, `${id}.prompt.txt`);
    const outputPath = path.join(tempRoot, `${id}.png`);
    const receiptPath = path.join(tempRoot, `${id}.receipt.json`);
    await fsp.writeFile(promptPath, String(task.prompt || ''), 'utf8');
    let result;
    try {
      result = await run(pythonPath, [scriptPath, '--channel', 'yunwu', '--prompt-file', promptPath, '--model', 'gpt-image-2-c', '--size', '2160x3840', '--asset-id', `canvas-${id}`, '--submit', '--output', outputPath, '--receipt', receiptPath], env);
    } catch {
      await cleanup([promptPath, outputPath, receiptPath]);
      throw adapterError('YUNWU_NETWORK_UNCERTAIN', '云雾请求状态待确认');
    }
    await fsp.rm(promptPath, {force:true});
    if (result.code === 0) return {taskId:`local-${id}`, payload:{outputPath, receiptPath}};
    await cleanup([outputPath, receiptPath]);
    if (result.code === 2) throw adapterError('YUNWU_AGENT_VAULT_NOT_CONFIGURED', '云雾受保护代理会话尚未配置', 503);
    if (result.code === 5) throw adapterError('YUNWU_NETWORK_UNCERTAIN', '云雾请求状态待确认');
    throw adapterError('YUNWU_SUBMISSION_REJECTED', '云雾图像请求未通过');
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

  return {dryRun, submit, query, constants:{endpoint:'https://yunwu.ai/v1/images/generations', model:'gpt-image-2-c', outputSize:'2160x3840'}};
}

module.exports = {createYunwuAgentVaultImage2Adapter, vaultReady};
