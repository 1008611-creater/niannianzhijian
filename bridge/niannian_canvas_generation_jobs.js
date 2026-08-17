const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const {normalizeImage2Spec} = require('./niannian_canvas_image2_channels');
const {resolveVideoChannel} = require('./niannian_canvas_video_channels');

const DOLA_ASPECT_RATIOS = new Set(['9:16', '16:9', '1:1', '4:3', '3:4']);

const MODELS = Object.freeze({
  image: Object.freeze({
    id: 'yunwu-gpt-image-2-c',
    label: '云雾 Image2 作图',
    provider: 'yunwu-agent-vault',
    providerSubmitEnabled: false
  }),
  video: Object.freeze({
    id: 'minimax-h3',
    label: 'H3 生视频',
    provider: 'runninghub',
    providerSubmitEnabled: false
  })
});

const PUBLIC_STATUSES = new Set(['awaiting_authorization', 'queued', 'running', 'succeeded', 'failed', 'review']);

function jobError(code, message, httpStatus = 400) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function clean(value, limit = 2000) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
    .slice(0, limit);
}

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
}

function requestHash(input) {
  return crypto.createHash('sha256').update(stableJson(input), 'utf8').digest('hex');
}

function videoProvider(channel) {
  return channel?.id === 'dola-seedance-2-5' ? 'dola-desktop-api' : 'runninghub';
}

function validateIdempotencyKey(value) {
  const key = clean(value, 200);
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw jobError('CANVAS_JOB_IDEMPOTENCY_REQUIRED', '请提供有效的幂等键', 422);
  return key;
}

function publicJob(job, options = {}) {
  const videoChannel = job.nodeType === 'video' ? resolveVideoChannel(job.videoChannel || 'h3') : null;
  const model = videoChannel
    ? {id:videoChannel.model,label:videoChannel.label,provider:videoProvider(videoChannel),providerSubmitEnabled:false}
    : (MODELS[job.nodeType] || MODELS.image);
  const providerSubmitEnabled = options.providerSubmitEnabled === true ? true : model.providerSubmitEnabled;
  return {
    id: job.id,
    projectId: job.projectId,
    projectKind: job.projectKind,
    nodeId: job.nodeId,
    nodeType: job.nodeType,
    model: model.id,
    modelLabel: model.label,
    status: PUBLIC_STATUSES.has(job.status) ? job.status : 'failed',
    providerSubmitEnabled,
    inputAssetIds: Array.isArray(job.inputAssetIds) ? job.inputAssetIds : [],
    outputAssetIds: Array.isArray(job.outputAssetIds) ? job.outputAssetIds : [],
    imageChannel: job.nodeType === 'image' ? (job.imageChannel || 'yunwu-gpt-image-2-c') : null,
    imageChannelLabel: job.nodeType === 'image' ? (job.imageChannelLabel || '云雾 Image2 竖版 4K') : null,
    videoChannel: videoChannel?.id || null,
    videoChannelLabel: videoChannel?.label || null,
    resolution: job.resolution || '2k',
    aspectRatio: job.aspectRatio || '1:1',
    outputSize: job.nodeType === 'image' ? (job.outputSize || null) : null,
    durationSeconds: job.durationSeconds || null,
    accountSlot: videoChannel?.id === 'dola-seedance-2-5' ? (job.accountSlot || 1) : null,
    prompt: job.prompt,
    credit: {
      amount: Number(job.creditAmount || 0),
      state: clean(job.creditState || 'not_reserved', 40)
    },
    error: ['failed','review'].includes(job.status) ? (job.publicError || '任务未完成') : null,
    failureCategory: ['failed','review'].includes(job.status) ? (job.failureCategory || null) : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt || null
  };
}

function dryRunContract(job, options = {}) {
  const videoChannel = job.nodeType === 'video' ? resolveVideoChannel(job.videoChannel || 'h3') : null;
  const model = videoChannel
    ? {id:videoChannel.model,label:videoChannel.label,provider:videoProvider(videoChannel),providerSubmitEnabled:false}
    : (MODELS[job.nodeType] || MODELS.image);
  const providerSubmitEnabled = options.providerSubmitEnabled === true ? true : model.providerSubmitEnabled;
  return {
    schema: 'niannian.canvas_generation_dry_run.v1',
    projectId: job.projectId,
    projectKind: job.projectKind,
    nodeId: job.nodeId,
    nodeType: job.nodeType,
    model: model.id,
    modelLabel: model.label,
    provider: model.provider,
    providerSubmitEnabled,
    spendRequested: false,
    inputAssetCount: job.inputAssetIds.length,
    imageChannel: job.nodeType === 'image' ? (job.imageChannel || 'yunwu-gpt-image-2-c') : null,
    imageChannelLabel: job.nodeType === 'image' ? (job.imageChannelLabel || '云雾 Image2 竖版 4K') : null,
    videoChannel: videoChannel?.id || null,
    videoChannelLabel: videoChannel?.label || null,
    resolution: job.resolution || '2k',
    aspectRatio: job.aspectRatio || '1:1',
    outputSize: job.nodeType === 'image' ? (job.outputSize || null) : null,
    durationSeconds: job.durationSeconds || null,
    accountSlot: videoChannel?.id === 'dola-seedance-2-5' ? (job.accountSlot || 1) : null,
    promptPresent: Boolean(job.prompt),
    requestHash: job.requestHash,
    result: 'awaiting_authorization'
  };
}

function createCanvasGenerationJobService(options = {}) {
  const filePath = path.resolve(options.filePath);
  let writeTail = Promise.resolve();

  async function ensureStore() {
    await fsp.mkdir(path.dirname(filePath), {recursive: true});
    try { await fsp.access(filePath); } catch { await fsp.writeFile(filePath, '[]\n', {flag: 'wx'}); }
  }

  async function readAll() {
    await ensureStore();
    const value = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    return Array.isArray(value) ? value : [];
  }

  async function writeAll(value) {
    await ensureStore();
    const temporary = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
    await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
    try { await fsp.rename(temporary, filePath); }
    catch (error) { await fsp.rm(temporary, {force: true}).catch(() => {}); throw error; }
  }

  async function withWriteLock(operation) {
    const previous = writeTail;
    let release;
    writeTail = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }

  function normalizeInput(input) {
    const nodeType = clean(input.nodeType, 20);
    if (!MODELS[nodeType]) throw jobError('CANVAS_JOB_NODE_TYPE_INVALID', '该节点不是可生成节点', 422);
    const projectId = clean(input.projectId, 160);
    const projectKind = clean(input.projectKind, 20);
    const nodeId = clean(input.nodeId, 80);
    const prompt = clean(input.prompt, 4000);
    const inputAssetIds = [...new Set((Array.isArray(input.inputAssetIds) ? input.inputAssetIds : []).map(item => clean(item, 120)).filter(Boolean))].slice(0, 24);
    const resolution = clean(input.resolution || (nodeType === 'image' ? '4k' : '2k'), 8).toLowerCase();
    const aspectRatio = clean(input.aspectRatio || input.aspect_ratio || (nodeType === 'image' ? '9:16' : '1:1'), 16);
    const durationSeconds = Number(input.durationSeconds || input.duration_seconds || (nodeType === 'video' ? 5 : 0));
    const videoSpec = nodeType === 'video' ? resolveVideoChannel(input.videoChannel || input.model || 'h3') : null;
    const accountSlot = Number(input.accountSlot || input.account_slot || 1);
    if (!projectId || !nodeId) throw jobError('CANVAS_JOB_INPUT_INVALID', '项目和节点不能为空', 422);
    if (!['redraw', 'script'].includes(projectKind)) throw jobError('CANVAS_JOB_PROJECT_KIND_INVALID', '项目类型无效', 422);
    if (!/^\d{1,2}:\d{1,2}$/.test(aspectRatio)) throw jobError('CANVAS_JOB_ASPECT_RATIO_INVALID', '画幅比例无效', 422);
    if (nodeType === 'video' && videoSpec?.id === 'dola-seedance-2-5' && !DOLA_ASPECT_RATIOS.has(aspectRatio)) throw jobError('CANVAS_DOLA_ASPECT_RATIO_UNSUPPORTED', 'Dola Seedance 2.5 不支持该画幅比例', 422);
    if (nodeType === 'video' && videoSpec?.id === 'dola-seedance-2-5' && durationSeconds !== 30) throw jobError('CANVAS_DOLA_DURATION_REQUIRED', 'Dola Seedance 2.5 只支持严格 30 秒视频', 422);
    if (nodeType === 'video' && videoSpec?.id !== 'dola-seedance-2-5' && (!Number.isFinite(durationSeconds) || durationSeconds < 4 || durationSeconds > 15)) throw jobError('CANVAS_JOB_DURATION_INVALID', '视频时长需在 4 到 15 秒之间', 422);
    if (nodeType === 'video' && !videoSpec) throw jobError('CANVAS_JOB_MODEL_INVALID', '视频模型尚未接入', 422);
    if (nodeType === 'video' && videoSpec?.id === 'dola-seedance-2-5' && (!Number.isInteger(accountSlot) || accountSlot < 1 || accountSlot > 99)) throw jobError('CANVAS_DOLA_ACCOUNT_SLOT_INVALID', 'Dola 账号槽位无效', 422);
    if (!prompt && nodeType === 'video' && ['h3','dola-seedance-2-5'].includes(videoSpec?.id)) throw jobError('CANVAS_JOB_PROMPT_REQUIRED', '视频节点需要填写提示词', 422);
    const imageSpec = nodeType === 'image'
      ? normalizeImage2Spec({model: input.imageChannel || input.model, resolution, aspectRatio, outputSize: input.outputSize || input.imageSize})
      : null;
    return {
      projectId, projectKind, nodeId, nodeType, prompt, inputAssetIds,
      resolution: imageSpec?.resolution || resolution,
      aspectRatio: imageSpec?.aspectRatio || aspectRatio,
      imageChannel: imageSpec?.imageChannel || null,
      imageChannelLabel: imageSpec?.imageChannelLabel || null,
      imageProvider: imageSpec?.imageProvider || null,
      outputSize: imageSpec?.outputSize || null,
      videoChannel: videoSpec?.id || null,
      videoChannelLabel: videoSpec?.label || null,
      durationSeconds:nodeType === 'video' ? durationSeconds : null,
      accountSlot:videoSpec?.id === 'dola-seedance-2-5' ? accountSlot : null
    };
  }

  async function create(input) {
    const normalized = normalizeInput(input);
    const requestedIdempotencyKey = validateIdempotencyKey(input.idempotencyKey);
    return withWriteLock(async () => {
      const jobs = await readAll();
      const existing = jobs.find(item => item.ownerId === input.ownerId && item.projectId === normalized.projectId && item.idempotencyKey === requestedIdempotencyKey);
      if (existing) {
        // A provider-confirmed failure is terminal for this attempt. Keep it for
        // auditability and create a new attempt instead of reusing its task id.
        const canCreateReplacement = existing.status === 'failed'
          && existing.providerSubmitState === 'failed';
        if (!canCreateReplacement) {
          const hash = requestHash({...normalized, idempotencyKey:requestedIdempotencyKey});
          if (existing.requestHash !== hash) throw jobError('CANVAS_JOB_IDEMPOTENCY_CONFLICT', '该幂等键已经用于另一项生成请求', 409);
          return {job: existing, created: false};
        }
      }
      const idempotencyKey = existing
        ? requestedIdempotencyKey + '.retry-' + crypto.randomBytes(8).toString('hex')
        : requestedIdempotencyKey;
      const hash = requestHash({...normalized, idempotencyKey});
      const timestamp = new Date().toISOString();
      const job = {
        schemaVersion: 'niannian.canvas_generation_job.v1',
        id: 'CGJ-' + crypto.randomBytes(12).toString('hex'),
        ownerId: clean(input.ownerId, 120),
        tenantId: clean(input.tenantId || input.ownerId, 120),
        projectId: normalized.projectId,
        projectKind: normalized.projectKind,
        nodeId: normalized.nodeId,
        nodeType: normalized.nodeType,
        prompt: normalized.prompt,
        inputAssetIds: normalized.inputAssetIds,
        outputAssetIds: [],
        imageChannel: normalized.imageChannel,
        imageChannelLabel: normalized.imageChannelLabel,
        imageProvider: normalized.imageProvider,
        videoChannel: normalized.videoChannel,
        videoChannelLabel: normalized.videoChannelLabel,
        resolution: normalized.resolution,
        aspectRatio: normalized.aspectRatio,
        outputSize: normalized.outputSize,
        durationSeconds: normalized.durationSeconds,
        accountSlot: normalized.accountSlot,
        idempotencyKey,
        requestHash: hash,
        status: 'awaiting_authorization',
        providerSubmitEnabled: false,
        publicError: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null
      };
      jobs.push(job);
      await writeAll(jobs);
      return {job, created: true};
    });
  }

  async function getOwned(ownerId, projectId, jobId) {
    const jobs = await readAll();
    return jobs.find(item => item.ownerId === ownerId && item.projectId === projectId && item.id === jobId) || null;
  }

  async function listOwned(ownerId, projectId) {
    const jobs = await readAll();
    return jobs.filter(item => item.ownerId === ownerId && item.projectId === projectId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async function listForCommerce(options = {}) {
    const tenantId = clean(options.tenantId, 120);
    const limit = Math.max(1, Math.min(200, Number(options.limit || 50)));
    const jobs = await readAll();
    return jobs
      .filter(item => !tenantId || item.tenantId === tenantId)
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
      .slice(0, limit)
      .map(item => ({
        id:item.id,
        tenantId:item.tenantId,
        ownerId:item.ownerId,
        projectId:item.projectId,
        nodeId:item.nodeId,
        nodeType:item.nodeType,
        model:item.nodeType === 'image' ? item.imageChannel : item.videoChannel,
        status:item.status,
        providerSubmitState:item.providerSubmitState || null,
        providerTaskId:item.providerTaskId || null,
        creditAmount:Number(item.creditAmount || 0),
        creditState:item.creditState || 'not_reserved',
        outputAssetIds:Array.isArray(item.outputAssetIds) ? item.outputAssetIds : [],
        failureCategory:item.failureCategory || null,
        createdAt:item.createdAt,
        updatedAt:item.updatedAt,
        completedAt:item.completedAt || null
      }));
  }

  async function updateOwned(ownerId, projectId, jobId, update) {
    return withWriteLock(async () => {
      const jobs = await readAll();
      const index = jobs.findIndex(item => item.ownerId === ownerId && item.projectId === projectId && item.id === jobId);
      if (index < 0) return null;
      const current = jobs[index];
      const next = {...current, ...update, updatedAt:new Date().toISOString()};
      jobs[index] = next;
      await writeAll(jobs);
      return next;
    });
  }

  return {create, getOwned, listOwned, listForCommerce, updateOwned, publicJob, dryRunContract, models: MODELS, constants: {filePath}};
}

module.exports = {createCanvasGenerationJobService, MODELS, publicJob, dryRunContract, requestHash, DOLA_ASPECT_RATIOS};
