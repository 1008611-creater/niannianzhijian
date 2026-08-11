'use strict';

const fs = require('fs');
const fsp = fs.promises;
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const {findTaskId, statusOf} = require('./niannian_runninghub_h3_adapter');

const WORKFLOW_ID = '2083071192579264514';
const ENDPOINT = '/openapi/v2/run/workflow/' + WORKFLOW_ID;
const INSTANCE_TYPE = 'plus';
const INPUTS = Object.freeze({image:Object.freeze({nodeId:'299',fieldName:'image'}),video:Object.freeze({nodeId:'275',fieldName:'video'})});

function adapterError(code, message, httpStatus = 502) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function providerError(value) {
  const code = value && typeof value === 'object' ? (value.errorCode ?? value.code) : null;
  const message = value && typeof value === 'object' ? String(value.errorMessage ?? value.message ?? '').trim().toLowerCase() : '';
  if (code == null || ['', '0', 'success', 'ok'].includes(String(code).toLowerCase()) || ['success', 'ok'].includes(message)) return null;
  const error = adapterError('RUNNINGHUB_PROVIDER_REJECTED', 'RunningHub 拒绝了动作迁移请求');
  error.providerCode = String(code).replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 64) || 'unknown';
  return error;
}

function safeUsage(value) {
  const usage = value?.usage && typeof value.usage === 'object' ? value.usage : {};
  return {
    consumeCoins: usage.consumeCoins ?? null,
    consumeMoney: usage.consumeMoney ?? null
  };
}

function videoUrls(value) {
  const results = Array.isArray(value?.results) ? value.results : [];
  return [...new Set(results
    .filter(item => item && typeof item.url === 'string' && (!item.outputType || /^(mp4|mov|webm)$/i.test(String(item.outputType))))
    .map(item => item.url)
    .filter(url => /^https?:\/\//.test(url)))];
}

function createRunningHubAnimateAdapter(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const baseUrl = String(options.baseUrl || process.env.RUNNINGHUB_BASE_URL || 'https://www.runninghub.cn').replace(/\/+$/, '');
  const timeoutMs = Math.max(5000, Number(options.timeoutMs || process.env.RUNNINGHUB_REQUEST_TIMEOUT_MS || 600000));
  const uploadCacheTtlMs = Math.min(23 * 60 * 60 * 1000, Math.max(60 * 1000, Number(options.uploadCacheTtlMs || 23 * 60 * 60 * 1000)));
  const uploadCache = new Map();
  const uploadImpl = options.uploadImpl || uploadHttp1;
  const agent = new https.Agent({keepAlive:true,maxSockets:4});
  if (!/^https:\/\//.test(baseUrl)) throw adapterError('RUNNINGHUB_PROFILE_INVALID', 'RunningHub 地址必须使用 HTTPS', 503);

  function key() {
    const value = String(options.apiKey || process.env.NIANNIAN_RUNNINGHUB_ANIMATE_API_KEY || '').trim();
    if (!value) throw adapterError('RUNNINGHUB_ANIMATE_CREDENTIAL_NOT_CONFIGURED', '动作迁移消费级凭据未配置', 503);
    return value;
  }

  async function jsonRequest(endpoint, payload, mode) {
    let response;
    try {
      response = await fetchImpl(baseUrl + endpoint, {
        method:'POST',
        headers:{authorization:'Bearer ' + key(),'content-type':'application/json',accept:'application/json','user-agent':'niannian-runninghub-animate/1.0'},
        body:JSON.stringify(payload),
        signal:AbortSignal.timeout(timeoutMs)
      });
    } catch {
      throw adapterError(mode === 'submit' ? 'RUNNINGHUB_ANIMATE_SUBMIT_UNCERTAIN' : 'RUNNINGHUB_ANIMATE_QUERY_RETRY', mode === 'submit' ? '动作迁移提交状态待确认' : '动作迁移查询暂时失败');
    }
    if (!response.ok) throw adapterError('RUNNINGHUB_ANIMATE_HTTP_' + response.status, 'RunningHub 动作迁移请求失败');
    const value = await response.json().catch(() => { throw adapterError('RUNNINGHUB_ANIMATE_RESPONSE_INVALID', 'RunningHub 返回格式无效'); });
    const rejected = providerError(value);
    if (rejected) throw rejected;
    return value;
  }

  async function upload(asset) {
    const cacheKey = [asset.sha256, asset.bytes, asset.mimeType].join(':');
    const cached = uploadCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.reference;
    const reference = await uploadImpl({
      baseUrl,
      apiKey:key(),
      asset,
      timeoutMs,
      agent
    });
    if (typeof reference !== 'string' || !reference) throw adapterError('RUNNINGHUB_ANIMATE_UPLOAD_REFERENCE_MISSING', 'RunningHub 未返回动作迁移素材引用');
    uploadCache.set(cacheKey, {reference,expiresAt:Date.now() + uploadCacheTtlMs});
    return reference;
  }

  function dryRun() {
    return {
      channel:'animate-transfer',
      workflowId:WORKFLOW_ID,
      endpoint:ENDPOINT,
      payload:{
        addMetadata:false,
        nodeInfoList:[
          {...INPUTS.image,fieldValue:'DRY_RUN_UPLOAD:image'},
          {...INPUTS.video,fieldValue:'DRY_RUN_UPLOAD:video'}
        ],
        instanceType:INSTANCE_TYPE,
        usePersonalQueue:false
      }
    };
  }

  async function submit(imageAsset, videoAsset) {
    const [imageReference, videoReference] = await Promise.all([upload(imageAsset), upload(videoAsset)]);
    const payload = dryRun().payload;
    payload.nodeInfoList = [
      {...INPUTS.image,fieldValue:imageReference},
      {...INPUTS.video,fieldValue:videoReference}
    ];
    const response = await jsonRequest(ENDPOINT, payload, 'submit');
    const taskId = findTaskId(response);
    if (!taskId) throw adapterError('RUNNINGHUB_ANIMATE_TASK_ID_MISSING', 'RunningHub 未返回动作迁移任务标识');
    return {taskId,channel:'animate-transfer',payload:{workflowId:WORKFLOW_ID,instanceType:INSTANCE_TYPE,inputCount:2}};
  }

  async function query(taskId) {
    if (!/^[A-Za-z0-9._:-]{3,160}$/.test(String(taskId || ''))) throw adapterError('RUNNINGHUB_ANIMATE_TASK_ID_INVALID', '动作迁移任务标识无效', 422);
    const response = await jsonRequest('/openapi/v2/query', {taskId:String(taskId)}, 'query');
    const urls = videoUrls(response);
    return {status:urls.length ? 'completed' : statusOf(response),videoUrls:urls,usage:safeUsage(response)};
  }

  async function download(url) {
    if (typeof url !== 'string' || !/^https:\/\//.test(url)) throw adapterError('RUNNINGHUB_ANIMATE_OUTPUT_URL_INVALID', '动作迁移输出地址无效');
    let response;
    try { response = await fetchImpl(url, {headers:{'user-agent':'niannian-runninghub-animate/1.0'},signal:AbortSignal.timeout(timeoutMs)}); }
    catch { throw adapterError('RUNNINGHUB_ANIMATE_DOWNLOAD_FAILED', '动作迁移结果下载失败'); }
    if (!response.ok) throw adapterError('RUNNINGHUB_ANIMATE_DOWNLOAD_HTTP_' + response.status, '动作迁移结果下载失败');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 1024 || bytes.subarray(0, 100).toString('utf8').trimStart().startsWith('<')) throw adapterError('RUNNINGHUB_ANIMATE_OUTPUT_MEDIA_INVALID', '动作迁移结果内容无效');
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const format = contentType === 'video/webm' || bytes.subarray(0, 4).toString('ascii') === 'RIFF' ? 'webm' : 'mp4';
    return {bytes,mime:format === 'webm' ? 'video/webm' : 'video/mp4',format};
  }

  return {dryRun,submit,query,download,constants:{workflowId:WORKFLOW_ID,endpoint:ENDPOINT,instanceType:INSTANCE_TYPE,inputs:INPUTS}};
}

async function uploadHttp1({baseUrl, apiKey, asset, timeoutMs, agent}) {
  const filePath = path.resolve(asset.storedPath);
  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size !== Number(asset.bytes)) throw adapterError('RUNNINGHUB_ANIMATE_UPLOAD_SOURCE_INVALID', '动作迁移素材文件无效', 422);
  const boundary = '----niannian-' + crypto.randomBytes(12).toString('hex');
  const filename = path.basename(filePath).replace(/[^A-Za-z0-9._-]/g, '_') || 'asset.bin';
  const prefix = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${asset.mimeType}\r\n\r\n`);
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const target = new URL(baseUrl + '/openapi/v2/media/upload/binary');
  const value = await new Promise((resolve, reject) => {
    const request = https.request(target, {
      method:'POST',agent,ALPNProtocols:['http/1.1'],
      headers:{authorization:'Bearer ' + apiKey,accept:'application/json','user-agent':'niannian-runninghub-animate/1.0','content-type':'multipart/form-data; boundary=' + boundary,'content-length':prefix.length + stat.size + suffix.length}
    }, response => {
      const chunks = [];
      let total = 0;
      response.on('data', chunk => {
        total += chunk.length;
        if (total > 1024 * 1024) request.destroy(adapterError('RUNNINGHUB_ANIMATE_UPLOAD_RESPONSE_TOO_LARGE', 'RunningHub 上传响应过大'));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(adapterError('RUNNINGHUB_ANIMATE_UPLOAD_HTTP_' + response.statusCode, 'RunningHub 动作迁移素材上传失败'));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(adapterError('RUNNINGHUB_ANIMATE_UPLOAD_RESPONSE_INVALID', 'RunningHub 上传响应格式无效')); }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(adapterError('RUNNINGHUB_ANIMATE_UPLOAD_TIMEOUT', 'RunningHub 动作迁移素材上传超时')));
    request.on('error', error => reject(error?.code?.startsWith('RUNNINGHUB_') ? error : adapterError('RUNNINGHUB_ANIMATE_UPLOAD_NETWORK_FAILED', 'RunningHub 动作迁移素材上传失败')));
    request.write(prefix);
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => request.destroy(adapterError('RUNNINGHUB_ANIMATE_UPLOAD_SOURCE_INVALID', '动作迁移素材无法读取')));
    stream.on('end', () => request.end(suffix));
    stream.pipe(request, {end:false});
  });
  const rejected = providerError(value);
  if (rejected) throw rejected;
  const reference = value?.data?.download_url || value?.data?.fileName || value?.data?.url;
  if (typeof reference !== 'string' || !reference) throw adapterError('RUNNINGHUB_ANIMATE_UPLOAD_REFERENCE_MISSING', 'RunningHub 未返回动作迁移素材引用');
  return reference;
}

module.exports = {createRunningHubAnimateAdapter, uploadHttp1, safeUsage, videoUrls, WORKFLOW_ID, INSTANCE_TYPE, INPUTS};
