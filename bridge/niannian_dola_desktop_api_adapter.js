'use strict';

const fs = require('fs/promises');
const path = require('path');

const INPUT_FIELD = Object.freeze({
  reference_image: 'image',
  generated_image: 'image',
  reference_audio: 'audio',
  reference_video: 'video',
  generated_video: 'video'
});

function adapterError(code, message, httpStatus = 502) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function cleanBaseUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); }
  catch { throw adapterError('DOLA_API_URL_INVALID', 'Dola 服务地址无效', 500); }
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw adapterError('DOLA_API_URL_INVALID', 'Dola 服务必须使用 HTTPS 或本机地址', 500);
  }
  return url.toString().replace(/\/+$/, '');
}

function responseError(prefix, response, body) {
  const error = adapterError(prefix + '_HTTP_' + response.status, 'Dola 服务未接受当前请求', response.status >= 500 ? 502 : 422);
  error.providerStatus = response.status;
  error.providerCode = typeof body?.detail === 'string' ? body.detail.slice(0, 160) : null;
  return error;
}

async function parseJson(response, prefix) {
  let body;
  try { body = await response.json(); }
  catch { throw adapterError(prefix + '_RESPONSE_INVALID', 'Dola 服务返回了无效响应'); }
  if (!response.ok) throw responseError(prefix, response, body);
  return body;
}

function fieldForAsset(asset) {
  const field = INPUT_FIELD[asset?.kind];
  if (!field) throw adapterError('DOLA_INPUT_TYPE_INVALID', 'Dola 只接受图片、音频或视频素材', 422);
  return field;
}

function outputUrl(baseUrl, value, fallbackPath) {
  try {
    const base = new URL(baseUrl + '/');
    const result = new URL(value || fallbackPath, base);
    if (result.origin !== base.origin) throw new Error('cross-origin output URL');
    return result.toString();
  } catch {
    throw adapterError('DOLA_API_RESPONSE_INVALID', 'Dola 返回了无效的结果地址');
  }
}

function createDolaDesktopApiAdapter(options = {}) {
  const baseUrl = cleanBaseUrl(options.baseUrl);
  const apiKey = String(options.apiKey || '').trim();
  const fetchImpl = options.fetchImpl || global.fetch;
  if (!apiKey) throw adapterError('DOLA_API_KEY_NOT_CONFIGURED', 'Dola 服务密钥尚未配置', 500);
  if (typeof fetchImpl !== 'function') throw adapterError('DOLA_FETCH_UNAVAILABLE', '当前服务不支持调用 Dola', 500);

  function headers(extra = {}) {
    return {'X-API-Key': apiKey, ...extra};
  }

  async function request(url, init, prefix) {
    let response;
    try { response = await fetchImpl(url, init); }
    catch (cause) {
      const error = adapterError(prefix + '_NETWORK_UNCERTAIN', '无法确认 Dola 请求状态');
      error.cause = cause;
      throw error;
    }
    return parseJson(response, prefix);
  }

  async function submit(task, assets) {
    const form = new FormData();
    form.set('prompt', String(task.prompt || ''));
    form.set('submit', 'true');
    form.set('account_slot', String(task.accountSlot || 1));
    form.set('aspect_ratio', String(task.aspectRatio || '9:16'));
    for (const asset of assets || []) {
      const field = fieldForAsset(asset);
      let bytes;
      try { bytes = await fs.readFile(asset.storedPath); }
      catch { throw adapterError('DOLA_INPUT_READ_FAILED', '无法读取画布中的 Dola 素材', 422); }
      const name = path.basename(String(asset.originalName || asset.storedPath || 'asset'));
      form.append(field, new Blob([bytes], {type:asset.mimeType || 'application/octet-stream'}), name);
    }
    const body = await request(baseUrl + '/v1/jobs', {
      method: 'POST', headers: headers({'X-Generation-Authorization':'submit','Idempotency-Key':String(task.idempotencyKey || '')}), body: form
    }, 'DOLA_SUBMIT');
    const taskId = String(body?.job_id || '').trim();
    if (!taskId) throw adapterError('DOLA_TASK_ID_MISSING', 'Dola 未返回任务标识');
    return {taskId, channel:'dola-seedance-2-5', payload:{aspectRatio:String(task.aspectRatio || '9:16'),durationSeconds:30,accountSlot:Number(task.accountSlot || 1),inputCount:(assets || []).length}};
  }

  async function query(taskId) {
    const id = encodeURIComponent(String(taskId || '').trim());
    if (!id) throw adapterError('DOLA_TASK_ID_INVALID', 'Dola 任务标识无效', 422);
    const body = await request(baseUrl + '/v1/jobs/' + id, {method:'GET',headers:headers()}, 'DOLA_QUERY');
    const status = String(body?.status || '').toLowerCase();
    if (['queued','prepared','running'].includes(status)) return {status:'generating',progress:Number(body?.progress || 0)};
    if (status === 'succeeded') return {status:'completed',outputUrl:outputUrl(baseUrl, body?.output_url, '/v1/jobs/' + id + '/download')};
    if (['failed','cancelled'].includes(status)) return {status:'failed',errorCode:body?.error_code || null};
    throw adapterError('DOLA_STATUS_INVALID', 'Dola 返回了未知任务状态');
  }

  async function download(url) {
    let response;
    try { response = await fetchImpl(url, {method:'GET',headers:headers()}); }
    catch { throw adapterError('DOLA_DOWNLOAD_NETWORK_UNCERTAIN', '无法确认 Dola 成片下载状态'); }
    if (!response.ok) throw responseError('DOLA_DOWNLOAD', response, null);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw adapterError('DOLA_OUTPUT_EMPTY', 'Dola 未返回可用视频');
    const type = String(response.headers?.get?.('content-type') || '').toLowerCase();
    return {bytes,mime:type.includes('quicktime') ? 'video/quicktime' : 'video/mp4',format:type.includes('quicktime') ? 'mov' : 'mp4'};
  }

  function dryRun(task, assets) {
    const counts = {image:0,audio:0,video:0};
    for (const asset of assets || []) counts[fieldForAsset(asset)] += 1;
    if (counts.image > 30 || counts.audio > 10 || counts.video > 10) throw adapterError('DOLA_INPUT_LIMIT_EXCEEDED', 'Dola 素材数量超出限制', 422);
    return {channel:'dola-seedance-2-5',durationSeconds:30,aspectRatio:String(task.aspectRatio || '9:16'),accountSlot:Number(task.accountSlot || 1),inputCounts:counts};
  }

  return {submit,query,download,dryRun};
}

module.exports = {createDolaDesktopApiAdapter, cleanBaseUrl, fieldForAsset};
