'use strict';

// Local-only bridge between the canvas runtime and the user's authenticated
// Dola desktop session. It deliberately exposes no credentials or CDP details.
const http = require('http');
const crypto = require('crypto');
const controller = require('./niannian_dola_playwright_controller');
const {withDolaPromptPrefix} = require('./niannian_dola_desktop_api_adapter');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 9190;

function bridgeError(code, message, status = 400) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = status;
  return error;
}

function json(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {'content-type':'application/json; charset=utf-8','content-length':body.length,'cache-control':'no-store','access-control-allow-origin':'https://ai.cauai.fun','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'});
  response.end(body);
}

async function readJson(request, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limit) throw bridgeError('DOLA_BRIDGE_REQUEST_TOO_LARGE', '桥接请求过大', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw bridgeError('DOLA_BRIDGE_REQUEST_INVALID', '桥接请求格式无效', 422); }
}

function clean(value, limit = 4000) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, '').trim().slice(0, limit);
}

function assertLocalRequest(request) {
  const address = request.socket.remoteAddress;
  if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address)) throw bridgeError('DOLA_BRIDGE_LOCAL_ONLY', 'Dola 桥接只接受本机请求', 403);
}

function createDolaPlaywrightApiServer(options = {}) {
  const jobs = new Map();
  const control = options.controller || controller;
  const now = options.now || (() => new Date().toISOString());

  async function capabilities() {
    const check = await control.preflight();
    try {
      return {
        schema_version:'dola2api_capabilities_v2',
        adapter_identity:'dola2api_local_bridge_v1',
        ready:check.ready === true,
        cdp_available:true,
        login_state:'authenticated',
        seedance_2_5_available:check.seedance25 === true,
        file_inputs:Number(check.fileInputs || 0),
        editable_areas:Number(check.editableAreas || 0),
        provider_submit_enabled:true,
        provider_upload_enabled:true,
        spend_enabled:true
      };
    } finally { await check.browser?.close?.().catch(() => {}); }
  }

  async function submit(body) {
    if (body.confirmProviderSpend !== true) throw bridgeError('DOLA_BRIDGE_AUTHORIZATION_REQUIRED', '请确认本次 Dola 生成', 422);
    const prompt = clean(body.prompt);
    const aspectRatio = clean(body.aspectRatio || '9:16', 16);
    const durationSeconds = Number(body.durationSeconds || 30);
    const assets = Array.isArray(body.assets) ? body.assets.slice(0, 50) : [];
    if (!prompt) throw bridgeError('DOLA_BRIDGE_PROMPT_REQUIRED', 'Dola 提示词不能为空', 422);
    if (!['9:16','16:9','1:1','4:3','3:4'].includes(aspectRatio)) throw bridgeError('DOLA_BRIDGE_ASPECT_RATIO_INVALID', 'Dola 画幅比例无效', 422);
    if (durationSeconds !== 30) throw bridgeError('DOLA_BRIDGE_DURATION_REQUIRED', 'Dola 只支持严格 30 秒视频', 422);
    for (const asset of assets) {
      if (!asset || !['reference_image','generated_image','reference_audio','reference_video','generated_video'].includes(clean(asset.kind, 40)) || !clean(asset.path, 1200)) {
        throw bridgeError('DOLA_BRIDGE_ASSET_INVALID', 'Dola 素材无效', 422);
      }
    }
    const preparedAssets = [];
    for (const asset of assets) {
      const source = clean(asset.path, 1200);
      if (/^https:\/\//i.test(source)) {
        const response = await fetch(source, {credentials:'omit', signal:AbortSignal.timeout(30000)}).catch(() => null);
        if (!response?.ok) throw bridgeError('DOLA_BRIDGE_ASSET_DOWNLOAD_FAILED', '无法读取画布素材', 422);
        const bytes = Buffer.from(await response.arrayBuffer());
        const extension = String(asset.kind).includes('audio') ? '.mp3' : String(asset.kind).includes('video') ? '.mp4' : '.png';
        const file = require('path').join(require('os').tmpdir(), 'niannian-dola-' + crypto.randomBytes(8).toString('hex') + extension);
        await require('fs').promises.writeFile(file, bytes, {flag:'wx'});
        preparedAssets.push({...asset, path:file});
      } else preparedAssets.push(asset);
    }
    const prepared = await control.prepare({prompt:withDolaPromptPrefix(prompt), aspectRatio, assets:preparedAssets});
    try {
      const submitted = await control.submit({browser:prepared.browser,page:prepared.page,prompt:withDolaPromptPrefix(prompt),aspectRatio});
      const id = 'DOLA-' + crypto.randomBytes(12).toString('hex');
      const record = {id,status:'queued',submittedAt:now(),updatedAt:now(),pageUrl:submitted.pageUrl || prepared.pageUrl,aspectRatio,durationSeconds:30,inputCounts:prepared.counts || {image:0,audio:0,video:0}};
      jobs.set(id, record);
      return record;
    } finally {
      await prepared.browser?.close?.().catch(() => {});
      for (const asset of preparedAssets) if (asset.path && asset.path.includes('niannian-dola-')) await require('fs').promises.rm(asset.path, {force:true}).catch(() => {});
    }
  }

  async function handler(request, response) {
    try {
      assertLocalRequest(request);
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'OPTIONS') { response.writeHead(204, {'access-control-allow-origin':'https://ai.cauai.fun','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'}); return response.end(); }
      if (request.method === 'GET' && url.pathname === '/api/v1/capabilities') return json(response, 200, await capabilities());
      if (request.method === 'POST' && url.pathname === '/v1/jobs') return json(response, 202, {job_id:(await submit(await readJson(request))).id,status:'queued'});
      const match = /^\/v1\/jobs\/(DOLA-[a-f0-9]{24})$/.exec(url.pathname);
      if (request.method === 'GET' && match) {
        const job = jobs.get(match[1]);
        if (!job) return json(response, 404, {code:'DOLA_BRIDGE_JOB_NOT_FOUND',error:'Dola 任务不存在'});
        return json(response, 200, {job_id:job.id,status:job.status,submitted_at:job.submittedAt,updated_at:job.updatedAt,aspect_ratio:job.aspectRatio,duration_seconds:job.durationSeconds});
      }
      return json(response, 404, {code:'DOLA_BRIDGE_ROUTE_NOT_FOUND',error:'接口不存在'});
    } catch (error) {
      return json(response, error.httpStatus || 502, {code:error.code || 'DOLA_BRIDGE_FAILED',error:error.message || 'Dola 本机桥接失败'});
    }
  }

  return {handler, capabilities, submit, jobs, listen(port = DEFAULT_PORT, host = DEFAULT_HOST) {
    const server = http.createServer(handler);
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => resolve(server));
    });
  }};
}

if (require.main === module) {
  createDolaPlaywrightApiServer().listen(Number(process.env.NIANNIAN_DOLA_BRIDGE_PORT || DEFAULT_PORT)).then(() => {
    process.stdout.write('Dola local bridge listening on 127.0.0.1:' + (process.env.NIANNIAN_DOLA_BRIDGE_PORT || DEFAULT_PORT) + '\n');
  }).catch(error => { process.stderr.write((error.code || 'DOLA_BRIDGE_START_FAILED') + ': ' + error.message + '\n'); process.exitCode = 1; });
}

module.exports = {DEFAULT_HOST, DEFAULT_PORT, createDolaPlaywrightApiServer, bridgeError};
