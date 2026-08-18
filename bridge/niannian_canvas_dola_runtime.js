'use strict';

const {createDolaDesktopApiAdapter} = require('./niannian_dola_desktop_api_adapter');
let dolaPlaywrightController;
function playwrightController() {
  if (!dolaPlaywrightController) dolaPlaywrightController = require('./niannian_dola_playwright_controller');
  return dolaPlaywrightController;
}
const {withDolaPromptPrefix} = require('./niannian_dola_desktop_api_adapter');
const {isDolaVideoChannel} = require('./niannian_canvas_video_channels');
const {inspectDolaMedia} = require('./niannian_dola_media_validation');

function runtimeError(code, message, httpStatus = 409) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function failureCategory(error) {
  const code = String(error?.code || '');
  if (code.includes('NETWORK_UNCERTAIN')) return 'network_uncertain';
  if (/^DOLA_INPUT_|^DOLA_API_URL/.test(code)) return 'reference_upload';
  if (/^DOLA_DOWNLOAD_|^DOLA_OUTPUT_/.test(code)) return 'output_validation';
  if (code === 'DOLA_API_KEY_NOT_CONFIGURED') return 'provider_configuration';
  return 'provider_request';
}

function publicFailure(error) {
  const category = failureCategory(error);
  if (category === 'network_uncertain') return 'Dola 提交状态待确认，请稍后查看当前任务。';
  if (category === 'reference_upload') return 'Dola 素材读取或上传失败，请检查图片、音频和视频素材。';
  if (category === 'output_validation') return 'Dola 返回的成片无法读取，请稍后重试。';
  if (category === 'provider_configuration') return 'Dola 渠道尚未完成服务器配置，当前任务仅完成准备。';
  return 'Dola 未接受当前视频请求，请检查提示词和素材后重试。';
}

function createCanvasDolaRuntime(options = {}) {
  const jobs = options.jobService;
  const assets = options.assetService;
  const enabled = options.enabled === true;
  const playwrightMode = options.playwrightMode === true;
  const adapter = options.adapter || (!playwrightMode && enabled ? createDolaDesktopApiAdapter(options.dola || {}) : null);
  const preflightPage = options.preflightPage || (playwrightMode ? (...args) => playwrightController().preflight(...args) : null);
  const preparePage = options.preparePage || (playwrightMode ? (...args) => playwrightController().prepare(...args) : null);
  const submitPage = options.submitPage || (playwrightMode ? (...args) => playwrightController().submit(...args) : null);
  const inspectMedia = options.inspectMedia || inspectDolaMedia;
  const submissionsInFlight = new Map();
  if (!jobs || !assets) throw new Error('canvas Dola runtime requires job and asset services');

  async function ownedInputs(job) {
    const owned = [];
    for (const assetId of job.inputAssetIds || []) {
      const asset = await assets.getOwned(job.ownerId, job.projectId, assetId);
      if (!asset || !['reference_image','generated_image','reference_audio','reference_video','generated_video'].includes(asset.kind)) {
        throw runtimeError('DOLA_INPUT_MISSING', 'Dola 素材不存在、不属于当前项目或类型不受支持', 422);
      }
      owned.push(asset);
    }
    return owned;
  }

  function assertDolaJob(job) {
    if (job.nodeType !== 'video' || !isDolaVideoChannel(job.videoChannel)) throw runtimeError('CANVAS_DOLA_JOB_INVALID', '当前任务不是 Dola 视频任务', 422);
    if (job.durationSeconds !== 30) throw runtimeError('CANVAS_DOLA_DURATION_REQUIRED', 'Dola 任务必须严格为 30 秒', 422);
  }

  async function dryRun(job) {
    assertDolaJob(job);
    if (!adapter && !playwrightMode) throw runtimeError('CANVAS_PROVIDER_SUBMIT_DISABLED', 'Dola 视频生成尚未启用，当前任务仅完成准备。');
    if (playwrightMode) {
      const inputs = await ownedInputs(job);
      const counts = {image:0,audio:0,video:0};
      for (const asset of inputs) counts[String(asset.kind).includes('audio') ? 'audio' : String(asset.kind).includes('video') ? 'video' : 'image'] += 1;
      if (counts.image > 30 || counts.audio > 10 || counts.video > 10) throw runtimeError('DOLA_INPUT_LIMIT_EXCEEDED', 'Dola 素材数量超出限制', 422);
      return {channel:'dola-seedance-2-5',durationSeconds:30,aspectRatio:job.aspectRatio,accountSlot:job.accountSlot,inputCounts:counts};
    }
    return adapter.dryRun({prompt:job.prompt,aspectRatio:job.aspectRatio,accountSlot:job.accountSlot}, await ownedInputs(job));
  }

  async function submitOnce(ownerId, projectId, jobId) {
    if (!enabled) throw runtimeError('CANVAS_PROVIDER_SUBMIT_DISABLED', 'Dola 视频生成尚未启用，当前任务仅完成准备。');
    try { if (!preflightPage) throw runtimeError('DOLA_PLAYWRIGHT_NOT_CONFIGURED', 'Dola 页面连接尚未配置'); const check = await preflightPage(); if (!check.ready) throw new Error('Dola 页面未就绪'); }
    catch (error) { throw runtimeError(error.code || 'DOLA_PLAYWRIGHT_NOT_READY', error.message || 'Dola 页面未就绪'); }
    const job = await jobs.getOwned(ownerId, projectId, jobId);
    if (!job) throw runtimeError('CANVAS_JOB_NOT_FOUND', '任务不存在', 404);
    assertDolaJob(job);
    if (job.providerTaskId) return job;
    const retryable = job.status === 'failed' && !job.providerTaskId && job.providerSubmitState === 'failed';
    if (job.status !== 'awaiting_authorization' && !retryable) throw runtimeError('CANVAS_JOB_STATE_INVALID', '当前任务不能重复提交', 409);
    const input = await ownedInputs(job);
    const preparedPage = await preparePage({
      prompt:withDolaPromptPrefix(job.prompt),
      aspectRatio:job.aspectRatio,
      accountSlot:job.accountSlot,
      assets:input.map(asset => ({kind:asset.kind,path:asset.storedPath,storedPath:asset.storedPath}))
    });
    await jobs.updateOwned(ownerId, projectId, jobId, {status:'queued',providerSubmitState:'submitting',publicError:null});
    try {
      const submitted = submitPage
        ? await submitPage({browser:preparedPage.browser,page:preparedPage.page,prompt:withDolaPromptPrefix(job.prompt),aspectRatio:job.aspectRatio,accountSlot:job.accountSlot,idempotencyKey:job.id})
        : await adapter.submit({prompt:withDolaPromptPrefix(job.prompt),aspectRatio:job.aspectRatio,accountSlot:job.accountSlot,idempotencyKey:job.id}, input);
      const providerTaskId = String(submitted.taskId || submitted.pageUrl || job.id);
      return await jobs.updateOwned(ownerId, projectId, jobId, {status:'queued',providerSubmitState:'accepted',providerTaskId:providerTaskId,providerChannel:submitted.channel || 'dola-seedance-2-5',providerPayload:submitted.payload || {pageUrl:submitted.pageUrl || null},publicError:null});
    } catch (error) {
      const uncertain = String(error?.code || '').includes('NETWORK_UNCERTAIN');
      await jobs.updateOwned(ownerId, projectId, jobId, {status:uncertain ? 'review' : 'failed',providerSubmitState:uncertain ? 'uncertain' : 'failed',failureCategory:failureCategory(error),publicError:publicFailure(error)});
      throw error;
    }
  }

  function submit(ownerId, projectId, jobId) {
    const key = [ownerId,projectId,jobId].join(':');
    if (submissionsInFlight.has(key)) return submissionsInFlight.get(key);
    const pending = submitOnce(ownerId, projectId, jobId);
    submissionsInFlight.set(key, pending);
    void pending.finally(() => submissionsInFlight.delete(key)).catch(() => {});
    return pending;
  }

  async function reconcile(ownerId, projectId, jobId) {
    const job = await jobs.getOwned(ownerId, projectId, jobId);
    if (!job) throw runtimeError('CANVAS_JOB_NOT_FOUND', '任务不存在', 404);
    if (job.nodeType !== 'video' || !isDolaVideoChannel(job.videoChannel) || !job.providerTaskId || ['succeeded','failed','review'].includes(job.status)) return job;
    try {
      if (playwrightMode) return job;
      const result = await adapter.query(job.providerTaskId);
      if (result.status === 'generating') return await jobs.updateOwned(ownerId, projectId, jobId, {status:'running',providerSubmitState:'running',publicError:null});
      if (result.status === 'failed') return await jobs.updateOwned(ownerId, projectId, jobId, {status:'failed',providerSubmitState:'failed',failureCategory:'provider_request',publicError:'Dola 视频任务失败，请检查提示词和素材后重试。'});
      const media = await adapter.download(result.outputUrl);
      const mediaMetadata = await inspectMedia(media.bytes, {aspectRatio:job.aspectRatio,durationSeconds:30}, {extension:media.format});
      const stored = await assets.registerBuffer({ownerId:job.ownerId,projectId:job.projectId,projectKind:job.projectKind,kind:'generated_video',format:media.format,bytes:media.bytes,originalName:`dola-seedance-${job.id.slice(-8)}.${media.format}`});
      return await jobs.updateOwned(ownerId, projectId, jobId, {status:'succeeded',providerSubmitState:'completed',outputAssetIds:[stored.asset.id],providerMedia:mediaMetadata,publicError:null,completedAt:new Date().toISOString()});
    } catch (error) {
      const uncertain = String(error?.code || '').includes('NETWORK_UNCERTAIN');
      return await jobs.updateOwned(ownerId, projectId, jobId, {status:uncertain ? 'review' : 'failed',providerSubmitState:uncertain ? 'uncertain' : 'failed',failureCategory:failureCategory(error),publicError:publicFailure(error)});
    }
  }

  return {enabled,dryRun,submit,reconcile};
}

module.exports = {createCanvasDolaRuntime, failureCategory, publicFailure};
