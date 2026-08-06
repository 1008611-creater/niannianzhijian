'use strict';

const gate = require('./niannian_video_batch_gate');

const CURRENT_ROUTE = /^\/api\/projects\/([^/]+)\/video-batches\/current(?:\/confirm)?$/;

function sendJson(response, status, value, headers = {}) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  response.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Content-Length':body.length,'Cache-Control':'no-store, max-age=0','Pragma':'no-cache','X-Content-Type-Options':'nosniff',...headers});
  response.end(body);
}

async function readJson(request, maxBytes = 32 * 1024) {
  const chunks=[]; let bytes=0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw gate.contractError('VIDEO_BATCH_BODY_TOO_LARGE','确认内容过大',413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw gate.contractError('VIDEO_BATCH_BODY_INVALID','确认内容格式无效',400); }
}

function publicError(error) {
  const known = new Set([
    'VIDEO_BATCH_NOT_FOUND','VIDEO_BATCH_OWNER_DENIED','VIDEO_BATCH_IDEMPOTENCY_KEY_REQUIRED','VIDEO_BATCH_IDEMPOTENCY_CONFLICT',
    'VIDEO_BATCH_IF_MATCH_FAILED','VIDEO_BATCH_CONFIRMATION_NOT_READY','VIDEO_BATCH_QUOTE_EXPIRED','VIDEO_BATCH_CONFIRMATION_IDENTITY_INVALID',
    'VIDEO_BATCH_COST_CAP_INVALID','VIDEO_BATCH_BODY_TOO_LARGE','VIDEO_BATCH_BODY_INVALID'
  ]);
  const recognized=known.has(error?.code);
  return {code:recognized?error.code:'VIDEO_BATCH_REQUEST_FAILED',message:recognized?String(error.message).slice(0,160):'视频方案暂不可用，请稍后重试'};
}

function createHttpHandler({service, authenticate, resolveProject, ensurePlan, now = () => Date.now()} = {}) {
  if (!service || typeof authenticate !== 'function' || typeof resolveProject !== 'function') throw gate.contractError('VIDEO_BATCH_HTTP_DEPENDENCY_MISSING','视频批次接口依赖不完整');
  return async function handleVideoBatchRequest(request, response, pathname) {
    const match=String(pathname||'').match(CURRENT_ROUTE);
    if (!match) return false;
    try {
      const user=await authenticate(request);
      const projectId=decodeURIComponent(match[1]);
      const project=await resolveProject(projectId,user);
      if (!project || project.ownerId !== user.id) throw gate.contractError('VIDEO_BATCH_NOT_FOUND','未找到当前视频方案',404);
      const isConfirm=String(pathname).endsWith('/confirm');
      if (request.method === 'GET' && !isConfirm) {
        if (typeof ensurePlan === 'function') await ensurePlan({project,user,service,now:now()});
        const result=await service.getCurrent({projectId:project.id,ownerId:user.id,now:now()});
        sendJson(response,200,{code:'VIDEO_BATCH_PLAN_READY',...result.projection},{ETag:result.etag});
        return true;
      }
      if (request.method === 'POST' && isConfirm) {
        if (typeof ensurePlan === 'function') await ensurePlan({project,user,service,now:now()});
        const body=await readJson(request);
        const result=await service.confirm({projectId:project.id,ownerId:user.id,ifMatch:request.headers['if-match'],idempotencyKey:request.headers['idempotency-key'],body,now:now()});
        sendJson(response,200,{code:'VIDEO_BATCH_CONFIRMATION_RECORDED',...result.projection},{ETag:result.etag});
        return true;
      }
      sendJson(response,405,{code:'METHOD_NOT_ALLOWED',message:'该操作不可用'},{Allow:isConfirm?'POST':'GET'});
      return true;
    } catch (error) {
      const safe=publicError(error);
      sendJson(response,Number(error?.httpStatus)||500,safe);
      return true;
    }
  };
}

module.exports={CURRENT_ROUTE,createHttpHandler,publicError,readJson,sendJson};
