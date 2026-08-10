'use strict';

const {createRunningHubAnimateAdapter} = require('./niannian_runninghub_animate_adapter');

function runtimeError(code, message, httpStatus = 409) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function failureCategory(error) {
  const code = String(error?.code || '');
  if (code === 'RUNNINGHUB_ANIMATE_SUBMIT_UNCERTAIN') return 'submit_uncertain';
  if (code === 'RUNNINGHUB_ANIMATE_QUERY_RETRY') return 'query_retry';
  if (code === 'CANVAS_ANIMATE_BILLING_UNVERIFIED') return 'billing_scope';
  if (/^RUNNINGHUB_ANIMATE_UPLOAD_/.test(code) || code === 'CANVAS_ANIMATE_INPUT_INVALID') return 'reference_upload';
  if (/^RUNNINGHUB_ANIMATE_OUTPUT_/.test(code) || /^RUNNINGHUB_ANIMATE_DOWNLOAD_/.test(code) || code === 'CANVAS_ANIMATE_OUTPUT_MISSING') return 'output_validation';
  if (code === 'RUNNINGHUB_ANIMATE_CREDENTIAL_NOT_CONFIGURED') return 'provider_configuration';
  return 'provider_request';
}

function publicFailure(error) {
  const category = failureCategory(error);
  if (category === 'submit_uncertain') return '动作迁移提交状态待确认，请稍后查看当前任务。';
  if (category === 'billing_scope') return '动作迁移已完成，但 RH 币结算尚未核验。';
  if (category === 'reference_upload') return '动作迁移素材上传失败，请检查图片和视频后重试。';
  if (category === 'output_validation') return '动作迁移结果无法校验，请稍后重试。';
  if (category === 'provider_configuration') return '动作迁移渠道尚未配置，暂时不能提交。';
  return '动作迁移渠道拒绝了当前请求，请检查素材后重试。';
}

function verifiedConsumerUsage(usage) {
  const coins = Number(usage?.consumeCoins);
  const money = usage?.consumeMoney;
  if (!Number.isFinite(coins) || coins <= 0 || !(money == null || money === '' || Number(money) === 0)) {
    const error = runtimeError('CANVAS_ANIMATE_BILLING_UNVERIFIED', '动作迁移结算未满足 RH 币合同');
    error.usage = {consumeCoins:usage?.consumeCoins ?? null,consumeMoney:usage?.consumeMoney ?? null};
    throw error;
  }
  return {consumeCoins:coins,consumeMoney:money == null || money === '' ? null : Number(money)};
}

function createCanvasAnimateRuntime(options = {}) {
  const jobs = options.jobService;
  const assets = options.assetService;
  const adapter = options.adapter || createRunningHubAnimateAdapter(options.runningHub || {});
  const enabled = options.enabled === true;
  const submissionsInFlight = new Map();
  if (!jobs || !assets) throw new Error('canvas Animate runtime requires job and asset services');

  async function ownedInputs(job) {
    if (!Array.isArray(job.inputAssetIds) || job.inputAssetIds.length !== 2) throw runtimeError('CANVAS_ANIMATE_INPUT_INVALID', '动作迁移需要一张图片和一个视频', 422);
    const resolved = [];
    for (const assetId of job.inputAssetIds) {
      const asset = await assets.getOwned(job.ownerId, job.projectId, assetId);
      if (!asset) throw runtimeError('CANVAS_ANIMATE_INPUT_INVALID', '动作迁移素材不存在或不属于当前项目', 422);
      resolved.push(asset);
    }
    const images = resolved.filter(asset => ['reference_image','generated_image'].includes(asset.kind));
    const videos = resolved.filter(asset => ['reference_video','generated_video'].includes(asset.kind));
    if (images.length !== 1 || videos.length !== 1) throw runtimeError('CANVAS_ANIMATE_INPUT_INVALID', '动作迁移需要一张图片和一个视频', 422);
    return {image:images[0],video:videos[0]};
  }

  async function dryRun(job) {
    if (job.nodeType !== 'video' || job.videoChannel !== 'animate-transfer') throw runtimeError('CANVAS_ANIMATE_JOB_INVALID', '当前任务不是动作迁移任务', 422);
    await ownedInputs(job);
    return adapter.dryRun();
  }

  async function submitOnce(ownerId, projectId, jobId) {
    if (!enabled) throw runtimeError('CANVAS_PROVIDER_SUBMIT_DISABLED', '动作迁移尚未启用，当前任务仅完成准备。');
    const job = await jobs.getOwned(ownerId, projectId, jobId);
    if (!job) throw runtimeError('CANVAS_JOB_NOT_FOUND', '任务不存在', 404);
    if (job.nodeType !== 'video' || job.videoChannel !== 'animate-transfer') throw runtimeError('CANVAS_ANIMATE_JOB_INVALID', '当前任务不是动作迁移任务', 422);
    if (job.providerTaskId) return job;
    if (job.status !== 'awaiting_authorization') throw runtimeError('CANVAS_JOB_STATE_INVALID', '当前任务不能重复提交', 409);
    const input = await ownedInputs(job);
    await jobs.updateOwned(ownerId, projectId, jobId, {status:'queued',providerSubmitState:'submitting',publicError:null});
    try {
      const submitted = await adapter.submit(input.image, input.video);
      return await jobs.updateOwned(ownerId, projectId, jobId, {
        status:'queued',providerSubmitState:'accepted',providerTaskId:submitted.taskId,
        providerChannel:'animate-transfer',providerPayload:submitted.payload,publicError:null
      });
    } catch (error) {
      const uncertain = error?.code === 'RUNNINGHUB_ANIMATE_SUBMIT_UNCERTAIN';
      await jobs.updateOwned(ownerId, projectId, jobId, {
        status:uncertain ? 'review' : 'failed',providerSubmitState:uncertain ? 'uncertain' : 'failed',
        failureCategory:failureCategory(error),providerErrorCode:error.providerCode || null,publicError:publicFailure(error)
      });
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
    if (job.nodeType !== 'video' || job.videoChannel !== 'animate-transfer' || !job.providerTaskId || ['succeeded','failed','review'].includes(job.status)) return job;
    try {
      const result = await adapter.query(job.providerTaskId);
      if (result.status === 'generating') return await jobs.updateOwned(ownerId, projectId, jobId, {status:'running',providerSubmitState:'running',publicError:null});
      if (result.status === 'failed') return await jobs.updateOwned(ownerId, projectId, jobId, {status:'failed',providerSubmitState:'failed',failureCategory:'provider_request',publicError:'动作迁移任务失败，请检查素材后重试。'});
      const usage = verifiedConsumerUsage(result.usage);
      const url = result.videoUrls?.[0];
      if (!url) throw runtimeError('CANVAS_ANIMATE_OUTPUT_MISSING', '动作迁移尚未返回视频结果', 502);
      const media = await adapter.download(url);
      const stored = await assets.registerBuffer({
        ownerId:job.ownerId,projectId:job.projectId,projectKind:job.projectKind,
        kind:'generated_video',format:media.format,bytes:media.bytes,
        originalName:`animate-${job.id.slice(-8)}.${media.format}`
      });
      return await jobs.updateOwned(ownerId, projectId, jobId, {
        status:'succeeded',providerSubmitState:'completed',outputAssetIds:[stored.asset.id],
        providerUsage:usage,publicError:null,completedAt:new Date().toISOString()
      });
    } catch (error) {
      if (error?.code === 'RUNNINGHUB_ANIMATE_QUERY_RETRY') {
        return await jobs.updateOwned(ownerId, projectId, jobId, {status:'running',providerSubmitState:'query_retry',failureCategory:'query_retry',publicError:null});
      }
      const billingReview = error?.code === 'CANVAS_ANIMATE_BILLING_UNVERIFIED';
      return await jobs.updateOwned(ownerId, projectId, jobId, {
        status:billingReview ? 'review' : 'failed',providerSubmitState:billingReview ? 'billing_review' : 'failed',
        providerUsage:billingReview ? error.usage : job.providerUsage,
        failureCategory:failureCategory(error),publicError:publicFailure(error)
      });
    }
  }

  return {enabled,dryRun,submit,reconcile};
}

module.exports = {createCanvasAnimateRuntime, failureCategory, publicFailure, verifiedConsumerUsage};
