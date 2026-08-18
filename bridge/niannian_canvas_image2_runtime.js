const crypto = require('crypto');
const {createYunwuAgentVaultImage2Adapter} = require('./niannian_yunwu_agent_vault_image2_adapter');
const {resolveImage2Channel} = require('./niannian_canvas_image2_channels');

function runtimeError(code, message, httpStatus = 409) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function publicFailure(error) {
  if (error?.code === 'YUNWU_AGENT_VAULT_NOT_CONFIGURED') return '云雾图像渠道尚未配置，暂时不能提交。';
  if (error?.code === 'YUNWU_EXECUTOR_NOT_CONFIGURED') return '云雾图像执行器尚未配置，暂时不能提交。';
  if (error?.code === 'YUNWU_NETWORK_UNCERTAIN') return '生成请求状态待确认，请稍后查看任务状态。';
  if (error?.code === 'YUNWU_UPSTREAM_UNAVAILABLE') return '云雾服务暂时不可用，本次额度已退回，请稍后重新提交。';
  return '图像生成暂未完成，请检查输入后重试。';
}

function failureCategory(error) {
  if (error?.code === 'YUNWU_NETWORK_UNCERTAIN') return 'network_uncertain';
  if (error?.code === 'YUNWU_AGENT_VAULT_NOT_CONFIGURED') return 'provider_configuration';
  if (error?.code === 'YUNWU_EXECUTOR_NOT_CONFIGURED') return 'executor_configuration';
  if (error?.code === 'YUNWU_UPSTREAM_UNAVAILABLE') return 'provider_unavailable';
  if (error?.code === 'YUNWU_SUBMISSION_REJECTED') return 'provider_request';
  return 'image_request';
}

function formatForMime(mime) {
  return ({'image/png':'png','image/jpeg':'jpeg','image/webp':'webp'})[String(mime || '').toLowerCase()] || null;
}

function createCanvasImage2Runtime(options = {}) {
  const jobs = options.jobService;
  const assets = options.assetService;
  const adapters = {
    'yunwu-agent-vault': options.adapters?.['yunwu-agent-vault'] || createYunwuAgentVaultImage2Adapter(options.yunwu || {})
  };
  const enabled = options.enabled === true;
  if (!jobs || !assets) throw new Error('canvas Image2 runtime requires job and asset services');

  async function ownedReferences(job) {
    const result = [];
    for (const id of job.inputAssetIds || []) {
      const asset = await assets.getOwned(job.ownerId, job.projectId, id);
      if (!asset || asset.kind !== 'reference_image') throw runtimeError('CANVAS_IMAGE2_REFERENCE_MISSING', '项目参考图不存在或无法读取', 422);
      result.push(asset);
    }
    return result;
  }

  function adapterFor(job) {
    const provider = job.imageProvider || resolveImage2Channel(job.imageChannel)?.provider;
    const adapter = adapters[provider] || adapters[job.imageChannel] || null;
    if (!adapter) throw runtimeError('CANVAS_IMAGE2_CHANNEL_NOT_CONFIGURED', '所选图像渠道尚未配置', 503);
    return adapter;
  }

  function taskFor(job) {
    return {
      prompt: job.prompt,
      resolution: job.resolution || '2k',
      aspect_ratio: job.aspectRatio || '1:1',
      output_size: job.outputSize || null,
      image_channel: job.imageChannel || null,
      prompt_sha256: crypto.createHash('sha256').update(job.prompt || '', 'utf8').digest('hex')
    };
  }

  async function dryRun(job) {
    if (job.nodeType !== 'image') throw runtimeError('CANVAS_IMAGE2_NODE_INVALID', '当前任务不是作图任务', 422);
    const references = await ownedReferences(job);
    return adapterFor(job).dryRun(taskFor(job), references.map(asset => asset.storedPath));
  }

  async function submit(ownerId, projectId, jobId) {
    if (!enabled) throw runtimeError('CANVAS_PROVIDER_SUBMIT_DISABLED', '图像生成尚未启用，当前任务仅完成准备。');
    const job = await jobs.getOwned(ownerId, projectId, jobId);
    if (!job) throw runtimeError('CANVAS_JOB_NOT_FOUND', '任务不存在', 404);
    if (job.nodeType !== 'image') throw runtimeError('CANVAS_IMAGE2_NODE_INVALID', '当前任务不是作图任务', 422);
    if (job.providerTaskId) return job;
    const retryableFailure = job.status === 'failed' && !job.providerTaskId && job.providerSubmitState === 'failed';
    if (job.status !== 'awaiting_authorization' && !retryableFailure) throw runtimeError('CANVAS_JOB_STATE_INVALID', '当前任务不能重复提交', 409);
    const references = await ownedReferences(job);
    const adapter = adapterFor(job);
    await jobs.updateOwned(ownerId, projectId, jobId, {status:'queued',providerSubmitState:'submitting',publicError:null});
    try {
      const submitted = await adapter.submit(taskFor(job), references.map(asset => asset.storedPath));
      return await jobs.updateOwned(ownerId, projectId, jobId, {status:'queued',providerSubmitState:'accepted',providerTaskId:submitted.taskId,providerPayload:submitted.payload,publicError:null});
    } catch (error) {
      const unknown = error?.code === 'YUNWU_NETWORK_UNCERTAIN';
      return await jobs.updateOwned(ownerId, projectId, jobId, {
        status:unknown ? 'review' : 'failed',
        providerSubmitState:unknown ? 'uncertain' : 'failed',
        failureCategory:failureCategory(error),
        providerErrorCode:error?.providerCode || null,
        publicError:publicFailure(error)
      }).then(() => { throw error; });
    }
  }

  async function reconcile(ownerId, projectId, jobId) {
    const job = await jobs.getOwned(ownerId, projectId, jobId);
    if (!job) throw runtimeError('CANVAS_JOB_NOT_FOUND', '任务不存在', 404);
    if (job.nodeType !== 'image' || !job.providerTaskId || ['succeeded','failed','review'].includes(job.status)) return job;
    try {
      const adapter = adapterFor(job);
      const result = await adapter.query(job.providerTaskId, job.providerPayload);
      if (result.status === 'generating') return await jobs.updateOwned(ownerId, projectId, jobId, {status:'running',providerSubmitState:'running',publicError:null});
      if (result.status === 'failed') return await jobs.updateOwned(ownerId, projectId, jobId, {status:'failed',providerSubmitState:'failed',publicError:'图像生成失败，请检查输入后重试。'});
      const outputAssetIds = [];
      for (let index = 0; index < (result.inlineImages || []).length; index += 1) {
        const bytes = Buffer.from(result.inlineImages[index], 'base64');
        const format = formatForMime(require('./niannian_runninghub_image_adapter').imageMime(bytes));
        if (!format) throw runtimeError('CANVAS_IMAGE2_OUTPUT_INVALID', '图像输出格式无效', 502);
        const stored = await assets.registerBuffer({ownerId:job.ownerId,projectId:job.projectId,projectKind:job.projectKind,kind:'generated_image',format,bytes,originalName:`canvas-image-${job.id.slice(-8)}-${index + 1}.${format === 'jpeg' ? 'jpg' : format}`});
        outputAssetIds.push(stored.asset.id);
      }
      for (let index = 0; index < result.imageUrls.length; index += 1) {
        const media = await adapter.download(result.imageUrls[index]);
        const format = formatForMime(media.mime);
        if (!format) throw runtimeError('CANVAS_IMAGE2_OUTPUT_INVALID', '图像输出格式无效', 502);
        const stored = await assets.registerBuffer({ownerId:job.ownerId,projectId:job.projectId,projectKind:job.projectKind,kind:'generated_image',format,bytes:media.bytes,originalName:`canvas-image-${job.id.slice(-8)}-${index + 1}.${format === 'jpeg' ? 'jpg' : format}`});
        outputAssetIds.push(stored.asset.id);
      }
      if (!outputAssetIds.length) throw runtimeError('CANVAS_IMAGE2_OUTPUT_MISSING', '图像生成尚未返回结果', 502);
      return await jobs.updateOwned(ownerId, projectId, jobId, {status:'succeeded',providerSubmitState:'completed',outputAssetIds:[...new Set(outputAssetIds)],publicError:null,completedAt:new Date().toISOString()});
    } catch (error) {
      if (error?.code === 'YUNWU_NETWORK_UNCERTAIN') return await jobs.updateOwned(ownerId, projectId, jobId, {status:'review',providerSubmitState:'uncertain',failureCategory:failureCategory(error),providerErrorCode:error?.providerCode || null,publicError:publicFailure(error)});
      return await jobs.updateOwned(ownerId, projectId, jobId, {status:'failed',providerSubmitState:'failed',failureCategory:failureCategory(error),providerErrorCode:error?.providerCode || null,publicError:publicFailure(error)});
    }
  }

  return {enabled,dryRun,submit,reconcile};
}

module.exports = {createCanvasImage2Runtime,formatForMime};
