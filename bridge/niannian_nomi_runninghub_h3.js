const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'https://www.runninghub.cn';
const TEXT_WORKFLOW_ID = '2084079636237078529';
const MULTIMODAL_WORKFLOW_ID = '2085082190681038850';
const IMAGE_NODES = ['4', '19', '20', '21', '25', '27', '29', '31', '33'];
const AUDIO_NODES = ['23', '35', '37'];
const VIDEO_NODES = ['39', '41', '43'];
const MAX_IMAGE_REFERENCES = 9;

function taskError(code, message, httpStatus = 422) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function pickTaskId(value) {
  const candidates = [value?.taskId, value?.data?.taskId, value?.data?.id, value?.id];
  return candidates.map(item => String(item || '').trim()).find(item => /^[A-Za-z0-9._:-]{3,160}$/.test(item)) || null;
}

function collectVideoUrls(value, output = []) {
  const testLocalVideo = process.env.NODE_ENV === 'test' && /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//i.test(String(value || ''));
  if (typeof value === 'string' && (/^https:\/\//.test(value) || testLocalVideo) && /\.(mp4|webm)(?:\?|$)/i.test(value)) output.push(value);
  else if (Array.isArray(value)) value.forEach(item => collectVideoUrls(item, output));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectVideoUrls(item, output));
  return [...new Set(output)];
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function targetFor(input = {}) {
  const aspectRatio = String(input.aspectRatio || '16:9').trim();
  const defaults = { '9:16':{width:480, height:832}, '1:1':{width:720, height:720}, '16:9':{width:832, height:480} }[aspectRatio];
  if (!defaults) throw taskError('NOMI_H3_TARGET_DIMENSION_MISMATCH', 'H3 仅支持 16:9、9:16 或 1:1 画幅');
  const target = {aspectRatio,durationSeconds:positiveInteger(input.durationSeconds, 5),width:positiveInteger(input.width, defaults.width),height:positiveInteger(input.height, defaults.height)};
  if (target.durationSeconds < 4 || target.durationSeconds > 15) throw taskError('NOMI_H3_DURATION_OUT_OF_RANGE', 'H3 时长必须在 4 到 15 秒之间');
  if (Math.abs(target.width / target.height - defaults.width / defaults.height) > 0.04) throw taskError('NOMI_H3_TARGET_DIMENSION_MISMATCH', 'H3 画幅与宽高设置不一致');
  return target;
}

function readImageWorkflowCatalog(value) {
  if (!value) return Object.freeze({});
  let parsed;
  try { parsed = typeof value === 'string' ? JSON.parse(value) : value; }
  catch { throw taskError('NOMI_H3_IMAGE_WORKFLOW_CONFIG_INVALID', 'H3 多图工作流配置无效', 503); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw taskError('NOMI_H3_IMAGE_WORKFLOW_CONFIG_INVALID', 'H3 多图工作流配置无效', 503);
  const catalog = {};
  for (const [countKey, raw] of Object.entries(parsed)) {
    const count = Number(countKey);
    if (!Number.isInteger(count) || count < 1 || count > MAX_IMAGE_REFERENCES || !raw || typeof raw !== 'object' || Array.isArray(raw)) throw taskError('NOMI_H3_IMAGE_WORKFLOW_CONFIG_INVALID', 'H3 多图工作流配置无效', 503);
    const workflowId = String(raw.workflowId || '').trim();
    const endpointPath = String(raw.endpointPath || '').trim();
    const imageNodes = Array.isArray(raw.imageNodes) ? raw.imageNodes.map(item => String(item || '').trim()).filter(Boolean) : [];
    const targetNode = String(raw.targetNode || '').trim();
    const promptNode = String(raw.promptNode || '').trim();
    const expectedEndpoint = /^\/openapi\/v2\/run\/(?:workflow|ai-app)\/(\d{10,30})$/.exec(endpointPath);
    if (!/^\d{10,30}$/.test(workflowId) || !expectedEndpoint || expectedEndpoint[1] !== workflowId || imageNodes.length !== count || new Set(imageNodes).size !== count || !imageNodes.every(item => /^\d{1,8}$/.test(item)) || !/^\d{1,8}$/.test(targetNode) || !/^\d{1,8}$/.test(promptNode)) throw taskError('NOMI_H3_IMAGE_WORKFLOW_CONFIG_INVALID', 'H3 多图工作流配置无效', 503);
    catalog[count] = Object.freeze({workflowId,endpointPath,imageNodes:Object.freeze(imageNodes),targetNode,promptNode});
  }
  return Object.freeze(catalog);
}

function createNomiRunningHubH3(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  // Nomi H3 使用独立配置，避免网页视频通道的联调或切换影响历史 Image2 适配器。
  const baseUrl = String(options.baseUrl || process.env.NOMI_RUNNINGHUB_H3_BASE_URL || process.env.RUNNINGHUB_BASE_URL || BASE_URL).replace(/\/+$/, '');
  const imageWorkflowCatalog = readImageWorkflowCatalog(options.imageWorkflows ?? process.env.NOMI_RUNNINGHUB_H3_IMAGE_WORKFLOWS);
  const apiKey = () => {
    const value = String(options.apiKey || process.env.NOMI_RUNNINGHUB_H3_API_KEY || '').trim();
    if (!value) throw taskError('RUNNINGHUB_CREDENTIAL_NOT_CONFIGURED', '视频渠道尚未配置', 503);
    return value;
  };
  const jsonRequest = async (endpoint, payload) => {
    const response = await fetchImpl(baseUrl + endpoint, {
      method: 'POST',
      headers: {authorization:'Bearer ' + apiKey(), 'content-type':'application/json', accept:'application/json'},
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000)
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) throw taskError('RUNNINGHUB_REQUEST_FAILED', '视频渠道请求失败', 502);
    return result;
  };
  const upload = async (asset) => {
    const bytes = await fs.readFile(asset.storedPath);
    const form = new FormData();
    form.append('file', new Blob([bytes], {type:asset.mimeType || 'application/octet-stream'}), path.basename(asset.originalName || asset.storedPath));
    const response = await fetchImpl(baseUrl + '/openapi/v2/media/upload/binary', {
      method:'POST', headers:{authorization:'Bearer ' + apiKey(),accept:'application/json'}, body:form, signal:AbortSignal.timeout(120000)
    });
    const result = await response.json().catch(() => null);
    const name = result?.data?.fileName || result?.data?.fileUrl || result?.data?.url;
    if (!response.ok || !name) throw taskError('RUNNINGHUB_ASSET_UPLOAD_FAILED', '视频参考素材上传失败', 502);
    return String(name);
  };
  const node = (nodeId, fieldName, fieldValue) => ({nodeId,fieldName,fieldValue});
  const targetControls = (prompt, target, targetNode = '6', promptNode = '7') => [
    node(targetNode,'aspect_ratio', target.aspectRatio),
    node(targetNode,'duration_seconds', target.durationSeconds),
    node(targetNode,'width', target.width),
    node(targetNode,'height', target.height),
    node(promptNode,'prompt', prompt)
  ];
  function dryRun(input) {
    const prompt = String(input?.prompt || '').trim();
    if (!prompt) throw taskError('NOMI_H3_PROMPT_REQUIRED', '请填写视频提示词');
    const images = input?.images || [];
    const audio = input?.audio || [];
    const videos = input?.videos || [];
    const target = targetFor(input);
    if (!images.length && !audio.length && !videos.length) {
      return {mode:'t2v',workflowId:TEXT_WORKFLOW_ID,endpointPath:'/openapi/v2/run/workflow/' + TEXT_WORKFLOW_ID,nodeInfoList:[
        node('4','aspect_ratio', target.aspectRatio), node('4','duration_seconds', target.durationSeconds),
        node('4','width', target.width), node('4','height', target.height), node('5','prompt',prompt)
      ],target};
    }
    if (images.length && !audio.length && !videos.length) {
      if (images.length > MAX_IMAGE_REFERENCES) throw taskError('NOMI_H3_IMAGE_REFERENCE_LIMIT', 'H3 最多支持九张项目图片参考');
      const workflow = imageWorkflowCatalog[images.length];
      if (!workflow) throw taskError('NOMI_H3_IMAGE_WORKFLOW_UNPUBLISHED', '当前图片数量对应的 H3 工作流尚未发布', 409);
      return {mode:`image-${images.length}`,workflowId:workflow.workflowId,endpointPath:workflow.endpointPath,nodeInfoList:[...workflow.imageNodes.map((nodeId, index) => node(nodeId, 'image', `DRY_RUN_IMAGE_${index + 1}`)),...targetControls(prompt,target,workflow.targetNode,workflow.promptNode)],target};
    }
    if (images.length !== 9 || audio.length !== 3 || videos.length !== 3) {
      throw taskError('NOMI_H3_COMBINATION_UNVERIFIED', '当前多模态工作流仅验证了 9 图、3 音频、3 视频的完整组合；请补齐素材或改用文生视频。');
    }
    return {mode:'multimodal-9i3a3v',workflowId:MULTIMODAL_WORKFLOW_ID,endpointPath:'/openapi/v2/run/workflow/' + MULTIMODAL_WORKFLOW_ID,nodeInfoList:targetControls(prompt,target),target};
  }
  async function submit(input) {
    const draft = dryRun(input);
    if (draft.mode.startsWith('image-')) {
      const uploadedImages = [];
      for (const image of input.images) uploadedImages.push(await upload(image));
      draft.nodeInfoList.forEach(item => { if (item.fieldName === 'image') item.fieldValue = uploadedImages.shift(); });
    } else if (draft.mode === 'multimodal-9i3a3v') {
      const uploadedImages = await Promise.all(input.images.map(upload));
      const uploadedAudio = await Promise.all(input.audio.map(upload));
      const uploadedVideos = await Promise.all(input.videos.map(upload));
      IMAGE_NODES.forEach((id, index) => draft.nodeInfoList.unshift(node(id,'image',uploadedImages[index])));
      AUDIO_NODES.forEach((id, index) => draft.nodeInfoList.unshift(node(id,'audio',uploadedAudio[index])));
      VIDEO_NODES.forEach((id, index) => draft.nodeInfoList.unshift(node(id,'file',uploadedVideos[index])));
    }
    const response = await jsonRequest(draft.endpointPath, {nodeInfoList:draft.nodeInfoList,instanceType:'ultra'});
    const taskId = pickTaskId(response);
    if (!taskId) throw taskError('RUNNINGHUB_TASK_ID_MISSING', '视频渠道未返回任务标识', 502);
    return {taskId,workflowId:draft.workflowId,mode:draft.mode,target:draft.target};
  }
  async function query(taskId) {
    const response = await jsonRequest('/openapi/v2/query', {taskId:String(taskId || '')});
    const urls = collectVideoUrls(response);
    const text = JSON.stringify(response).toUpperCase();
    const status = urls.length ? 'succeeded' : /FAILED|REJECTED|CANCELLED/.test(text) ? 'failed' : 'running';
    return {status,videoUrls:urls,usage:collectUsage(response)};
  }
  return {dryRun,submit,query,constants:{TEXT_WORKFLOW_ID,MULTIMODAL_WORKFLOW_ID,IMAGE_NODES,AUDIO_NODES,VIDEO_NODES,MAX_IMAGE_REFERENCES,imageWorkflowCounts:Object.keys(imageWorkflowCatalog).map(Number).sort((a,b) => a - b)}};
}

function collectUsage(value) {
  if (!value || typeof value !== 'object') return null;
  if (!Array.isArray(value) && value.usage && typeof value.usage === 'object' && !Array.isArray(value.usage)) return value.usage;
  for (const child of Object.values(value)) {
    const usage = collectUsage(child);
    if (usage) return usage;
  }
  return null;
}

function verifyConsumerUsage(usage) {
  const coins = Number(usage?.consumeCoins);
  const money = usage?.consumeMoney;
  const moneyValue = money === undefined || money === null || money === '' ? 0 : Number(money);
  if (!Number.isFinite(coins) || coins <= 0 || !Number.isFinite(moneyValue) || moneyValue !== 0) throw taskError('NOMI_H3_BILLING_UNVERIFIED', 'H3 结算未确认使用消费级币种', 502);
  return {consumeCoins:coins,consumeMoney:moneyValue};
}

module.exports = {createNomiRunningHubH3, readImageWorkflowCatalog, targetFor, collectUsage, verifyConsumerUsage, TEXT_WORKFLOW_ID, MULTIMODAL_WORKFLOW_ID, MAX_IMAGE_REFERENCES};
