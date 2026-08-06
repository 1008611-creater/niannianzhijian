const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const STATUSES = new Set([
  'idle',
  'preparing',
  'rough_cutting',
  'ready_for_review',
  'exporting',
  'succeeded',
  'failed'
]);

const PRESETS = new Set(['talking_head', 'explainer', 'short_video']);

function smartCutError(code, message, httpStatus = 400) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function clean(value, limit = 2000) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, limit);
}

function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
}

function requestHash(value) {
  return crypto.createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

function validateIdempotencyKey(value) {
  const key = clean(value, 200);
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) {
    throw smartCutError('SMART_CUT_IDEMPOTENCY_REQUIRED', '请提供有效的幂等键', 422);
  }
  return key;
}

function publicJob(job) {
  return {
    id: job.id,
    projectId: job.projectId,
    projectKind: job.projectKind,
    nodeId: job.nodeId,
    sourceVideoAssetId: job.sourceVideoAssetId,
    scriptAssetId: job.scriptAssetId || null,
    sourceAudioAssetId: job.sourceAudioAssetId || null,
    preset: job.preset,
    aspectRatio: job.aspectRatio,
    captionStyle: job.captionStyle,
    narration: job.narration === true,
    status: STATUSES.has(job.status) ? job.status : 'failed',
    editorProjectId: job.editorProjectId || null,
    finalVideoAssetId: job.finalVideoAssetId || null,
    captionAssetId: job.captionAssetId || null,
    durationSeconds: Number.isFinite(job.durationSeconds) ? job.durationSeconds : null,
    coverAssetId: job.coverAssetId || null,
    error: job.status === 'failed' ? (job.publicError || '智能剪辑未完成') : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt || null
  };
}

function dryRunContract(job) {
  return {
    schema: 'niannian.smart_cut_dry_run.v1',
    jobId: job.id,
    projectId: job.projectId,
    projectKind: job.projectKind,
    nodeId: job.nodeId,
    sourceVideoAssetId: job.sourceVideoAssetId,
    optionalScript: Boolean(job.scriptAssetId || job.scriptText),
    optionalSourceAudio: Boolean(job.sourceAudioAssetId),
    preset: job.preset,
    pipeline: {
      asr: 'mimo-asr',
      alignment: 'Qwen3-ForcedAligner-0.6B',
      roughCut: 'remove_nonsemantic_long_pauses_before_transitions',
      providerSubmitEnabled: false
    },
    requestHash: job.requestHash,
    result: 'prepared_without_provider_execution'
  };
}

function createSmartCutJobService(options = {}) {
  const filePath = path.resolve(options.filePath);
  let writeTail = Promise.resolve();

  async function ensureStore() {
    await fsp.mkdir(path.dirname(filePath), {recursive: true});
    try { await fsp.access(filePath); }
    catch { await fsp.writeFile(filePath, '[]\n', {flag: 'wx'}); }
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
    writeTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }

  function normalizeInput(input) {
    const projectId = clean(input.projectId, 160);
    const projectKind = clean(input.projectKind, 20);
    const nodeId = clean(input.nodeId, 120);
    const sourceVideoAssetId = clean(input.sourceVideoAssetId, 120);
    const scriptAssetId = clean(input.scriptAssetId, 120) || null;
    const sourceAudioAssetId = clean(input.sourceAudioAssetId, 120) || null;
    const scriptText = clean(input.scriptText, 12000) || null;
    const preset = clean(input.preset || 'talking_head', 40).toLowerCase();
    const aspectRatio = clean(input.aspectRatio || '9:16', 16);
    const captionStyle = clean(input.captionStyle || 'bold-outline', 80);
    const narration = input.narration === true;
    if (!projectId || !nodeId || !sourceVideoAssetId) {
      throw smartCutError('SMART_CUT_INPUT_REQUIRED', '项目、智能剪辑节点和主视频素材不能为空', 422);
    }
    if (!['redraw', 'script'].includes(projectKind)) {
      throw smartCutError('SMART_CUT_PROJECT_KIND_INVALID', '项目类型无效', 422);
    }
    if (!/^CAS-[a-f0-9]{24}$/.test(sourceVideoAssetId)) {
      throw smartCutError('SMART_CUT_SOURCE_VIDEO_INVALID', '主视频必须是当前项目内的正式视频素材', 422);
    }
    if (scriptAssetId && !/^CAS-[a-f0-9]{24}$/.test(scriptAssetId)) {
      throw smartCutError('SMART_CUT_SCRIPT_ASSET_INVALID', '文案素材标识无效', 422);
    }
    if (sourceAudioAssetId && !/^CAS-[a-f0-9]{24}$/.test(sourceAudioAssetId)) {
      throw smartCutError('SMART_CUT_AUDIO_ASSET_INVALID', '声音素材标识无效', 422);
    }
    if (!PRESETS.has(preset)) throw smartCutError('SMART_CUT_PRESET_INVALID', '剪辑预设无效', 422);
    if (!/^\d{1,2}:\d{1,2}$/.test(aspectRatio)) throw smartCutError('SMART_CUT_ASPECT_RATIO_INVALID', '画幅比例无效', 422);
    return {projectId, projectKind, nodeId, sourceVideoAssetId, scriptAssetId, sourceAudioAssetId, scriptText, preset, aspectRatio, captionStyle, narration};
  }

  async function create(input) {
    const normalized = normalizeInput(input);
    const ownerId = clean(input.ownerId, 120);
    if (!ownerId) throw smartCutError('SMART_CUT_OWNER_REQUIRED', '智能剪辑任务缺少用户归属', 422);
    const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
    const hash = requestHash({...normalized, idempotencyKey});
    return withWriteLock(async () => {
      const jobs = await readAll();
      const existing = jobs.find((item) => item.ownerId === ownerId && item.projectId === normalized.projectId && item.nodeId === normalized.nodeId && item.idempotencyKey === idempotencyKey);
      if (existing) {
        if (existing.requestHash !== hash) throw smartCutError('SMART_CUT_IDEMPOTENCY_CONFLICT', '该幂等键已经用于另一项智能剪辑请求', 409);
        return {job: existing, created: false};
      }
      const timestamp = new Date().toISOString();
      const job = {
        schemaVersion: 'niannian.smart_cut_job.v1',
        id: 'SCJ-' + crypto.randomBytes(12).toString('hex'),
        ownerId,
        ...normalized,
        editorProjectId: null,
        finalVideoAssetId: null,
        captionAssetId: null,
        coverAssetId: null,
        durationSeconds: null,
        idempotencyKey,
        requestHash: hash,
        status: 'preparing',
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
    return jobs.find((item) => item.ownerId === ownerId && item.projectId === projectId && item.id === jobId) || null;
  }

  async function getById(jobId) {
    const id = clean(jobId, 120);
    if (!/^SCJ-[a-f0-9]{24}$/.test(id)) return null;
    const jobs = await readAll();
    return jobs.find((item) => item.id === id) || null;
  }

  async function listOwned(ownerId, projectId) {
    const jobs = await readAll();
    return jobs.filter((item) => item.ownerId === ownerId && item.projectId === projectId)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  }

  async function updateOwned(ownerId, projectId, jobId, patch) {
    return withWriteLock(async () => {
      const jobs = await readAll();
      const index = jobs.findIndex((item) => item.ownerId === ownerId && item.projectId === projectId && item.id === jobId);
      if (index < 0) return null;
      const current = jobs[index];
      const status = patch.status === undefined ? current.status : clean(patch.status, 40);
      if (!STATUSES.has(status)) throw smartCutError('SMART_CUT_STATUS_INVALID', '智能剪辑任务状态无效', 422);
      const next = {...current, ...patch, status, updatedAt: new Date().toISOString()};
      if (status === 'succeeded' && !next.completedAt) next.completedAt = next.updatedAt;
      jobs[index] = next;
      await writeAll(jobs);
      return next;
    });
  }

  return {create, getOwned, getById, listOwned, updateOwned, publicJob, dryRunContract, statuses: STATUSES, constants: {filePath}};
}

module.exports = {createSmartCutJobService, publicJob, dryRunContract, requestHash};
