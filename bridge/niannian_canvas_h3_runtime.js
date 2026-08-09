const crypto = require('crypto');
const {createRunningHubH3Adapter} = require('./niannian_runninghub_h3_adapter');

function runtimeError(code, message, httpStatus = 409) { const error = new Error(message || code); error.code = code; error.httpStatus = httpStatus; return error; }
function failureCategory(error) {
  const code = String(error?.code || '');
  if (code === 'RUNNINGHUB_NETWORK_UNCERTAIN') return 'network_uncertain';
  if (code === 'CANVAS_H3_BILLING_UNVERIFIED') return 'billing_scope';
  if (code === 'CANVAS_H3_REFERENCE_MISSING' || /^RUNNINGHUB_UPLOAD_/.test(code)) return 'reference_upload';
  if (/^RUNNINGHUB_OUTPUT_/.test(code) || code === 'CANVAS_H3_OUTPUT_MISSING') return 'output_validation';
  if (/^RUNNINGHUB_HTTP_/.test(code) || code === 'RUNNINGHUB_RESPONSE_INVALID' || code === 'RUNNINGHUB_TASK_ID_MISSING') return 'provider_request';
  if (code === 'RUNNINGHUB_CREDENTIAL_NOT_CONFIGURED') return 'provider_configuration';
  return 'provider_failure';
}
function publicFailure(error) {
  if (error?.code === 'RUNNINGHUB_CREDENTIAL_NOT_CONFIGURED') return '视频渠道尚未配置，暂时不能提交。';
  if (error?.code === 'RUNNINGHUB_NETWORK_UNCERTAIN') return '生成请求状态待确认，请稍后查看任务状态。';
  if (error?.code === 'CANVAS_H3_BILLING_UNVERIFIED') return '视频结算信息尚未核验，暂不标记为已交付。';
  if (error?.code === 'CANVAS_H3_REFERENCE_MISSING' || /^RUNNINGHUB_UPLOAD_/.test(String(error?.code || ''))) return '参考素材上传到视频渠道失败，请检查素材后重试。';
  if (/^RUNNINGHUB_HTTP_/.test(String(error?.code || ''))) return '视频渠道拒绝了当前工作流请求，请检查 H3 工作流参数。';
  if (/^RUNNINGHUB_OUTPUT_/.test(String(error?.code || '')) || error?.code === 'CANVAS_H3_OUTPUT_MISSING') return '视频渠道返回的结果无法校验，请稍后重试。';
  return '视频生成暂未完成，请检查输入后重试。';
}

function createCanvasH3Runtime(options = {}) {
  const jobs = options.jobService;
  const assets = options.assetService;
  const adapter = options.adapter || createRunningHubH3Adapter(options.runningHub || {});
  const enabled = options.enabled === true;
  if (!jobs || !assets) throw new Error('canvas H3 runtime requires job and asset services');

  async function ownedReferences(job) {
    const result = [];
    for (const id of job.inputAssetIds || []) {
      const asset = await assets.getOwned(job.ownerId, job.projectId, id);
      if (!asset || !['reference_image','generated_image'].includes(asset.kind)) throw runtimeError('CANVAS_H3_REFERENCE_MISSING', '项目参考图不存在或无法读取', 422);
      result.push(asset);
    }
    return result;
  }

  function dryRun(job) {
    if (job.nodeType !== 'video') throw runtimeError('CANVAS_H3_NODE_INVALID', '当前任务不是视频任务', 422);
    const count = (job.inputAssetIds || []).length;
    return adapter.dryRun({prompt:job.prompt,aspectRatio:job.aspectRatio || '16:9',durationSeconds:job.durationSeconds || 5}, count);
  }

  async function submit(ownerId, projectId, jobId) {
    if (!enabled) throw runtimeError('CANVAS_PROVIDER_SUBMIT_DISABLED', '视频生成尚未启用，当前任务仅完成准备。');
    const job = await jobs.getOwned(ownerId, projectId, jobId);
    if (!job) throw runtimeError('CANVAS_JOB_NOT_FOUND', '任务不存在', 404);
    if (job.nodeType !== 'video') throw runtimeError('CANVAS_H3_NODE_INVALID', '当前任务不是视频任务', 422);
    if (job.providerTaskId) return job;
    if (job.status !== 'awaiting_authorization') throw runtimeError('CANVAS_JOB_STATE_INVALID', '当前任务不能重复提交', 409);
    const references = await ownedReferences(job);
    await jobs.updateOwned(ownerId, projectId, jobId, {status:'queued',providerSubmitState:'submitting',publicError:null});
    try {
      const submitted = await adapter.submit({prompt:job.prompt,aspectRatio:job.aspectRatio || '16:9',durationSeconds:job.durationSeconds || 5}, references.map(asset => asset.storedPath));
      return await jobs.updateOwned(ownerId, projectId, jobId, {status:'queued',providerSubmitState:'accepted',providerTaskId:submitted.taskId,providerChannel:submitted.channel,providerPayload:submitted.payload,publicError:null});
    } catch (error) {
      const unknown = error?.code === 'RUNNINGHUB_NETWORK_UNCERTAIN';
      return await jobs.updateOwned(ownerId, projectId, jobId, {status:unknown ? 'review' : 'failed',providerSubmitState:unknown ? 'uncertain' : 'failed',failureCategory:failureCategory(error),publicError:publicFailure(error)}).then(() => { throw error; });
    }
  }

  async function reconcile(ownerId, projectId, jobId) {
    const job = await jobs.getOwned(ownerId, projectId, jobId);
    if (!job) throw runtimeError('CANVAS_JOB_NOT_FOUND', '任务不存在', 404);
    if (job.nodeType !== 'video' || !job.providerTaskId || ['succeeded','failed','review'].includes(job.status)) return job;
    try {
      const result = await adapter.query(job.providerTaskId);
      if (result.status === 'generating') return await jobs.updateOwned(ownerId, projectId, jobId, {status:'running',providerSubmitState:'running',publicError:null});
      if (result.status === 'failed') return await jobs.updateOwned(ownerId, projectId, jobId, {status:'failed',providerSubmitState:'failed',failureCategory:'provider_request',publicError:'视频渠道返回任务失败，请检查 H3 工作流参数。'});
      const usage = result.usage || {};
      const coins = Number(usage.consumeCoins);
      const money = usage.consumeMoney;
      if (!Number.isFinite(coins) || coins <= 0 || !(money == null || money === '' || Number(money) === 0)) throw runtimeError('CANVAS_H3_BILLING_UNVERIFIED', '视频结算信息未满足 RH 币合同');
      const outputAssetIds = [];
      for (let index = 0; index < result.videoUrls.length; index += 1) {
        const media = await adapter.download(result.videoUrls[index]);
        const stored = await assets.registerBuffer({ownerId:job.ownerId,projectId:job.projectId,projectKind:job.projectKind,kind:'generated_video',format:media.format,bytes:media.bytes,originalName:`canvas-video-${job.id.slice(-8)}-${index + 1}.${media.format}`});
        outputAssetIds.push(stored.asset.id);
      }
      if (!outputAssetIds.length) throw runtimeError('CANVAS_H3_OUTPUT_MISSING', '视频生成尚未返回结果', 502);
      return await jobs.updateOwned(ownerId, projectId, jobId, {status:'succeeded',providerSubmitState:'completed',outputAssetIds:[...new Set(outputAssetIds)],publicError:null,completedAt:new Date().toISOString()});
    } catch (error) {
      if (error?.code === 'RUNNINGHUB_NETWORK_UNCERTAIN') return await jobs.updateOwned(ownerId, projectId, jobId, {status:'review',providerSubmitState:'uncertain',failureCategory:failureCategory(error),publicError:publicFailure(error)});
      return await jobs.updateOwned(ownerId, projectId, jobId, {status:error?.code === 'CANVAS_H3_BILLING_UNVERIFIED' ? 'review' : 'failed',providerSubmitState:error?.code === 'CANVAS_H3_BILLING_UNVERIFIED' ? 'billing_review' : 'failed',failureCategory:failureCategory(error),publicError:publicFailure(error)});
    }
  }
  return {enabled,dryRun,submit,reconcile};
}

module.exports = {createCanvasH3Runtime, failureCategory, publicFailure};
