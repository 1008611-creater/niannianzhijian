const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'https://www.runninghub.cn';
const TEXT_WORKFLOW_ID = '2084079636237078529';
const MULTIMODAL_WORKFLOW_ID = '2085082190681038850';
const IMAGE_NODES = ['4', '19', '20', '21', '25', '27', '29', '31', '33'];
const AUDIO_NODES = ['23', '35', '37'];
const VIDEO_NODES = ['39', '41', '43'];

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

function createNomiRunningHubH3(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  // Nomi H3 使用独立配置，避免网页视频通道的联调或切换影响历史 Image2 适配器。
  const baseUrl = String(options.baseUrl || process.env.NOMI_RUNNINGHUB_H3_BASE_URL || process.env.RUNNINGHUB_BASE_URL || BASE_URL).replace(/\/+$/, '');
  const apiKey = () => {
    const value = String(options.apiKey || process.env.RUNNINGHUB_API_KEY || '').trim();
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
  const targetControls = (prompt, options) => [
    node('6','aspect_ratio', options.aspectRatio || '16:9'),
    node('6','duration_seconds', Number(options.durationSeconds || 5)),
    node('6','width', Number(options.width || 832)),
    node('6','height', Number(options.height || 480)),
    node('7','prompt', prompt)
  ];
  function dryRun(input) {
    const prompt = String(input?.prompt || '').trim();
    if (!prompt) throw taskError('NOMI_H3_PROMPT_REQUIRED', '请填写视频提示词');
    const images = input?.images || [];
    const audio = input?.audio || [];
    const videos = input?.videos || [];
    if (!images.length && !audio.length && !videos.length) {
      return {mode:'t2v',workflowId:TEXT_WORKFLOW_ID,nodeInfoList:[
        node('4','aspect_ratio', input.aspectRatio || '16:9'), node('4','duration_seconds', Number(input.durationSeconds || 5)),
        node('4','width', Number(input.width || 832)), node('4','height', Number(input.height || 480)), node('5','prompt',prompt)
      ]};
    }
    if (images.length !== 9 || audio.length !== 3 || videos.length !== 3) {
      throw taskError('NOMI_H3_COMBINATION_UNVERIFIED', '当前多模态工作流仅验证了 9 图、3 音频、3 视频的完整组合；请补齐素材或改用文生视频。');
    }
    return {mode:'multimodal-9i3a3v',workflowId:MULTIMODAL_WORKFLOW_ID,nodeInfoList:targetControls(prompt,input)};
  }
  async function submit(input) {
    const draft = dryRun(input);
    if (draft.mode === 'multimodal-9i3a3v') {
      const uploadedImages = await Promise.all(input.images.map(upload));
      const uploadedAudio = await Promise.all(input.audio.map(upload));
      const uploadedVideos = await Promise.all(input.videos.map(upload));
      IMAGE_NODES.forEach((id, index) => draft.nodeInfoList.unshift(node(id,'image',uploadedImages[index])));
      AUDIO_NODES.forEach((id, index) => draft.nodeInfoList.unshift(node(id,'audio',uploadedAudio[index])));
      VIDEO_NODES.forEach((id, index) => draft.nodeInfoList.unshift(node(id,'file',uploadedVideos[index])));
    }
    const response = await jsonRequest('/openapi/v2/run/workflow/' + draft.workflowId, {nodeInfoList:draft.nodeInfoList});
    const taskId = pickTaskId(response);
    if (!taskId) throw taskError('RUNNINGHUB_TASK_ID_MISSING', '视频渠道未返回任务标识', 502);
    return {taskId,workflowId:draft.workflowId,mode:draft.mode};
  }
  async function query(taskId) {
    const response = await jsonRequest('/openapi/v2/query', {taskId:String(taskId || '')});
    const urls = collectVideoUrls(response);
    const text = JSON.stringify(response).toUpperCase();
    const status = urls.length ? 'succeeded' : /FAILED|REJECTED|CANCELLED/.test(text) ? 'failed' : 'running';
    return {status,videoUrls:urls};
  }
  return {dryRun,submit,query,constants:{TEXT_WORKFLOW_ID,MULTIMODAL_WORKFLOW_ID,IMAGE_NODES,AUDIO_NODES,VIDEO_NODES}};
}

module.exports = {createNomiRunningHubH3, TEXT_WORKFLOW_ID, MULTIMODAL_WORKFLOW_ID};
