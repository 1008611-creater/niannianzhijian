const fs = require('fs').promises;
const path = require('path');
const {CHANNELS} = require('./niannian_canvas_h3_channels');

function adapterError(code, message, httpStatus = 502) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function redact(value) { return String(value || '').replace(/(authorization|cookie|api[_-]?key|token|secret)\s*[:=]\s*\S+/ig, '$1=[redacted]').slice(0, 500); }
function findTaskId(value) {
  if (value && typeof value === 'object') {
    for (const key of ['taskId','task_id','id']) if (value[key] != null && ['string','number'].includes(typeof value[key])) return String(value[key]);
    for (const item of Object.values(value)) { const found = findTaskId(item); if (found) return found; }
  } else if (Array.isArray(value)) for (const item of value) { const found = findTaskId(item); if (found) return found; }
  return null;
}
function findUrls(value, output = []) {
  if (typeof value === 'string' && /^https?:\/\//.test(value)) output.push(value);
  else if (Array.isArray(value)) for (const item of value) findUrls(item, output);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) findUrls(item, output);
  return [...new Set(output)];
}
function findUsage(value) {
  if (value && typeof value === 'object') {
    if (value.usage && typeof value.usage === 'object') return value.usage;
    for (const item of Object.values(value)) { const usage = findUsage(item); if (usage) return usage; }
  } else if (Array.isArray(value)) for (const item of value) { const usage = findUsage(item); if (usage) return usage; }
  return null;
}
function statusOf(value) {
  const raw = value?.status || value?.taskStatus || value?.data?.status || value?.data?.taskStatus || '';
  const status = String(raw).toLowerCase();
  if (['failed','failure','fail','error','rejected','cancelled','canceled'].includes(status)) return 'failed';
  if (['success','succeeded','completed','complete','finished'].includes(status)) return 'completed';
  return 'generating';
}

function targetDimensions(aspectRatio, channel = '') {
  const normalized = String(aspectRatio || '16:9').trim();
  if (normalized === '9:16') return channel === 'one-image' ? {width:576, height:1024} : {width:480, height:832};
  if (normalized === '16:9') return {width:832, height:480};
  throw adapterError('RUNNINGHUB_TARGET_DIMENSION_UNSUPPORTED', '当前 H3 画幅没有经过验证', 422);
}

function createRunningHubH3Adapter(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const baseUrl = String(options.baseUrl || process.env.RUNNINGHUB_BASE_URL || 'https://www.runninghub.cn').replace(/\/+$/, '');
  const timeoutMs = Math.max(5000, Number(options.timeoutMs || process.env.RUNNINGHUB_REQUEST_TIMEOUT_MS || 120000));
  if (!/^https:\/\//.test(baseUrl)) throw adapterError('RUNNINGHUB_PROFILE_INVALID', 'RunningHub 地址必须使用 HTTPS', 503);
  function key() { const value = String(options.apiKey || process.env.RUNNINGHUB_API_KEY || '').trim(); if (!value) throw adapterError('RUNNINGHUB_CREDENTIAL_NOT_CONFIGURED', 'RunningHub 服务器凭据未配置', 503); return value; }
  async function jsonRequest(endpoint, payload) {
    let response;
    try { response = await fetchImpl(baseUrl + endpoint, {method:'POST',headers:{authorization:'Bearer ' + key(),'content-type':'application/json',accept:'application/json','user-agent':'niannian-canvas-h3/1.0'},body:JSON.stringify(payload),signal:AbortSignal.timeout(timeoutMs)}); }
    catch (error) { throw adapterError('RUNNINGHUB_NETWORK_UNCERTAIN', 'RunningHub 网络状态不确定：' + redact(error.message)); }
    if (!response.ok) throw adapterError('RUNNINGHUB_HTTP_' + response.status, 'RunningHub 请求失败');
    return response.json().catch(() => { throw adapterError('RUNNINGHUB_RESPONSE_INVALID', 'RunningHub 返回格式无效'); });
  }
  async function upload(filePath) {
    const bytes = await fs.readFile(filePath);
    const form = new FormData();
    form.append('file', new Blob([bytes]), path.basename(filePath));
    let response;
    try { response = await fetchImpl(baseUrl + '/openapi/v2/media/upload/binary', {method:'POST',headers:{authorization:'Bearer ' + key(),accept:'application/json','user-agent':'niannian-canvas-h3/1.0'},body:form,signal:AbortSignal.timeout(timeoutMs)}); }
    catch (error) { throw adapterError('RUNNINGHUB_UPLOAD_NETWORK_FAILED', 'RunningHub 素材上传失败：' + redact(error.message)); }
    if (!response.ok) throw adapterError('RUNNINGHUB_UPLOAD_HTTP_' + response.status, 'RunningHub 素材上传失败');
    const value = await response.json().catch(() => null);
    const data = value?.data || {};
    const fileName = data.fileName || data.fileUrl || data.url;
    if (typeof fileName !== 'string' || !fileName) throw adapterError('RUNNINGHUB_UPLOAD_NAME_MISSING', 'RunningHub 未返回素材引用');
    return fileName;
  }
  function dryRun(task, referenceCount) {
    const channel = task.channel || Object.keys(CHANNELS).find(name => CHANNELS[name].referenceNodes.length === Number(referenceCount)) || 'text';
    const spec = CHANNELS[channel];
    if (!spec) throw adapterError('CANVAS_H3_CHANNEL_INVALID', 'H3 通道无效', 422);
    const aspectRatio = task.aspectRatio || '16:9';
    const dimensions = targetDimensions(aspectRatio, channel);
    const items = [];
    if (spec.referenceNodes.length && Number(referenceCount) !== spec.referenceNodes.length) throw adapterError('CANVAS_H3_REFERENCE_COUNT_INVALID', 'H3 参考图数量与通道不匹配', 422);
    spec.referenceNodes.forEach((nodeId, index) => items.push({nodeId,fieldName:'image',fieldValue:`DRY_RUN_UPLOAD:reference-${index + 1}`}));
    items.push({nodeId:spec.controlNode,fieldName:'aspect_ratio',fieldValue:aspectRatio});
    items.push({nodeId:spec.controlNode,fieldName:'width',fieldValue:dimensions.width});
    items.push({nodeId:spec.controlNode,fieldName:'height',fieldValue:dimensions.height});
    items.push({nodeId:spec.controlNode,fieldName:'duration_seconds',fieldValue:Number(task.durationSeconds || 5)});
    items.push({nodeId:spec.promptNode,fieldName:'prompt',fieldValue:task.prompt || ''});
    return {channel,endpoint:spec.endpoint,payload:{nodeInfoList:items}};
  }
  async function submit(task, referenceFiles = []) {
    const spec = dryRun(task, referenceFiles.length);
    const uploaded = [];
    for (const file of referenceFiles) uploaded.push(await upload(file));
    const items = spec.payload.nodeInfoList.map(item => ({...item}));
    let imageIndex = 0;
    for (const item of items) if (item.fieldName === 'image') item.fieldValue = uploaded[imageIndex++];
    const response = await jsonRequest(spec.endpoint, {instanceType:'ultra',nodeInfoList:items});
    const taskId = findTaskId(response);
    if (!taskId) throw adapterError('RUNNINGHUB_TASK_ID_MISSING', 'RunningHub 未返回视频任务标识');
    return {taskId,channel:spec.channel,payload:{referenceCount:uploaded.length}};
  }
  async function query(taskId) {
    if (!/^[A-Za-z0-9._:-]{3,160}$/.test(String(taskId || ''))) throw adapterError('RUNNINGHUB_TASK_ID_INVALID', '视频任务标识无效', 422);
    const response = await jsonRequest('/openapi/v2/query', {taskId:String(taskId)});
    const urls = findUrls(response);
    return {status:urls.length ? 'completed' : statusOf(response),videoUrls:urls.filter(url => !/\.json(?:\?|$)/i.test(url)),usage:findUsage(response)};
  }
  async function download(url) {
    if (typeof url !== 'string' || !/^https:\/\//.test(url)) throw adapterError('RUNNINGHUB_OUTPUT_URL_INVALID', '视频输出地址无效');
    let response;
    try { response = await fetchImpl(url, {headers:{'user-agent':'niannian-canvas-h3/1.0'},signal:AbortSignal.timeout(timeoutMs)}); }
    catch (error) { throw adapterError('RUNNINGHUB_DOWNLOAD_FAILED', '视频下载失败：' + redact(error.message)); }
    if (!response.ok) throw adapterError('RUNNINGHUB_DOWNLOAD_HTTP_' + response.status, '视频下载失败');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1024 || bytes.subarray(0, 100).toString('utf8').trimStart().startsWith('<')) throw adapterError('RUNNINGHUB_OUTPUT_MEDIA_INVALID', '视频输出内容无效');
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const format = contentType === 'video/webm' || bytes.subarray(0, 4).toString('ascii') === 'RIFF' ? 'webm' : 'mp4';
    return {bytes,mime:format === 'webm' ? 'video/webm' : 'video/mp4',format};
  }
  return {dryRun,submit,query,download,channels:CHANNELS};
}

module.exports = {createRunningHubH3Adapter,findTaskId,findUrls,statusOf,findUsage,targetDimensions};
