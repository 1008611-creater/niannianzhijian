'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const {imageMime} = require('./niannian_runninghub_image_adapter');

function adapterError(code, message, httpStatus = 502) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function redactMessage(value) {
  return String(value || '').replace(/\b(?:sk|tp)-[A-Za-z0-9_-]{10,}\b/g, '[redacted]').slice(0, 300);
}

function dataItem(value) {
  return Array.isArray(value?.data) ? value.data[0] : null;
}

function createYunfeiImage2Adapter(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const baseUrl = String(options.baseUrl || '').trim().replace(/\/+$/, '');
  const apiPrefix = String(options.apiPrefix || '/v1').trim().replace(/\/+$/, '');
  const apiKey = String(options.apiKey || '').trim();
  const timeoutMs = Math.max(5000, Number(options.timeoutMs || 240000));
  if (!/^https:\/\//.test(baseUrl)) throw adapterError('YUNFEI_PROFILE_INVALID', '云飞地址必须使用 HTTPS', 503);

  function credentials() {
    if (!apiKey) throw adapterError('YUNFEI_CREDENTIAL_NOT_CONFIGURED', '云飞图像渠道尚未配置', 503);
    return apiKey;
  }

  function dryRun(task, referenceFiles = []) {
    if (!referenceFiles.length) throw adapterError('YUNFEI_IMAGE_REFERENCE_REQUIRED', '云飞 Image2 需要至少一张项目参考图', 422);
    if (!/^(1024x1024|2048x1152|3840x2160)$/.test(String(task.output_size || task.outputSize || ''))) {
      throw adapterError('YUNFEI_OUTPUT_SIZE_INVALID', '云飞最终输出尺寸无效', 422);
    }
    return {endpoint: apiPrefix + '/images/edits', payload: {model: 'gpt-image-2', size: task.output_size || task.outputSize, referenceCount: referenceFiles.length}};
  }

  async function submit(task, referenceFiles = []) {
    const spec = dryRun(task, referenceFiles);
    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', String(task.prompt || ''));
    form.append('size', String(task.output_size || task.outputSize));
    form.append('n', '1');
    for (const filePath of referenceFiles) {
      const bytes = await fsp.readFile(filePath);
      form.append('image', new Blob([bytes], {type: imageMime(bytes)}), path.basename(filePath));
    }
    let response;
    try {
      response = await fetchImpl(baseUrl + spec.endpoint, {method: 'POST', headers: {authorization: 'Bearer ' + credentials(), accept: 'application/json'}, body: form, signal: AbortSignal.timeout(timeoutMs)});
    } catch (error) {
      throw adapterError('YUNFEI_NETWORK_UNCERTAIN', '云飞请求状态待确认：' + redactMessage(error.message));
    }
    if (!response.ok) throw adapterError('YUNFEI_HTTP_' + response.status, '云飞图像请求失败 (' + response.status + ')');
    const payload = await response.json().catch(() => { throw adapterError('YUNFEI_RESPONSE_INVALID', '云飞返回格式无效'); });
    const item = dataItem(payload);
    if (!item || (typeof item.b64_json !== 'string' && typeof item.url !== 'string')) {
      throw adapterError('YUNFEI_OUTPUT_MISSING', '云飞未返回图像结果');
    }
    return {taskId: 'inline-' + Date.now(), payload: {endpoint: spec.endpoint, outputSize: task.output_size || task.outputSize, result: item}};
  }

  async function query(taskId, payload) {
    const item = payload?.result;
    if (typeof item?.b64_json === 'string') return {status: 'completed', inlineImages: [item.b64_json], imageUrls: []};
    if (typeof item?.url === 'string' && /^https:\/\//.test(item.url)) return {status: 'completed', inlineImages: [], imageUrls: [item.url]};
    throw adapterError('YUNFEI_OUTPUT_MISSING', '云飞图像结果不可读取');
  }

  async function download(url) {
    let response;
    try { response = await fetchImpl(url, {signal: AbortSignal.timeout(timeoutMs)}); }
    catch (error) { throw adapterError('YUNFEI_DOWNLOAD_FAILED', '云飞图片下载失败：' + redactMessage(error.message)); }
    if (!response.ok) throw adapterError('YUNFEI_DOWNLOAD_HTTP_' + response.status, '云飞图片下载失败 (' + response.status + ')');
    const bytes = Buffer.from(await response.arrayBuffer());
    return {bytes, mime: imageMime(bytes)};
  }

  return {dryRun, submit, query, download, constants: {baseUrl, apiPrefix}};
}

module.exports = {createYunfeiImage2Adapter};
