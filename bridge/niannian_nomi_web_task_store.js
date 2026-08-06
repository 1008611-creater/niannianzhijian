const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

function taskError(code, message, httpStatus = 400) {
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

function stringList(value, limit = 24, itemLimit = 160) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => clean(item, itemLimit)).filter(Boolean))].slice(0, limit);
}

function orderedStringList(value, limit = 24, itemLimit = 160) {
  if (!Array.isArray(value)) return [];
  return value.map(item => clean(item, itemLimit)).filter(Boolean).slice(0, limit);
}

function taskId() {
  return 'studio-task-' + crypto.randomBytes(16).toString('hex');
}

function grantId() {
  return 'studio-grant-' + crypto.randomBytes(16).toString('hex');
}

function createNomiWebTaskStore(options = {}) {
  const filePath = path.resolve(options.filePath || 'nomi-web-tasks.json');
  let writeTail = Promise.resolve();

  async function ensureStore() {
    await fsp.mkdir(path.dirname(filePath), {recursive:true});
    try { await fsp.access(filePath); }
    catch { await fsp.writeFile(filePath, JSON.stringify({schemaVersion:'niannian.nomi_web_tasks.v1',grants:[],tasks:[]}, null, 2) + '\n', {flag:'wx'}); }
  }

  async function readState() {
    await ensureStore();
    const parsed = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    return {
      schemaVersion:'niannian.nomi_web_tasks.v1',
      grants:Array.isArray(parsed?.grants) ? parsed.grants : [],
      tasks:Array.isArray(parsed?.tasks) ? parsed.tasks : []
    };
  }

  async function writeState(state) {
    const temporary = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
    await fsp.writeFile(temporary, JSON.stringify(state, null, 2) + '\n', {flag:'wx'});
    try { await fsp.rename(temporary, filePath); }
    catch (error) { await fsp.rm(temporary, {force:true}).catch(() => {}); throw error; }
  }

  async function withWriteLock(operation) {
    const previous = writeTail;
    let release;
    writeTail = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await operation(); }
    finally { release(); }
  }

  function cleanExpiredGrants(state, now) {
    state.grants = state.grants.filter(grant => Number(grant.expiresAtMs) > now || (Array.isArray(grant.usedNodeIds) && grant.usedNodeIds.length > 0));
  }

  async function createGrant(input) {
    const ownerId = clean(input.ownerId, 120);
    const projectId = clean(input.projectId, 160);
    const projectKind = clean(input.projectKind, 20);
    const nodeIds = stringList(input.nodeIds, 100, 160);
    if (!ownerId || !projectId || !['redraw','script'].includes(projectKind) || !nodeIds.length) throw taskError('STUDIO_GRANT_INPUT_INVALID', '生成确认信息无效', 422);
    return withWriteLock(async () => {
      const state = await readState();
      const now = Date.now();
      cleanExpiredGrants(state, now);
      const record = {id:grantId(),ownerId,projectId,projectKind,nodeIds,usedNodeIds:[],createdAt:new Date(now).toISOString(),expiresAtMs:now + 5 * 60 * 1000};
      state.grants.push(record);
      await writeState(state);
      return {id:record.id,expiresAt:record.expiresAtMs};
    });
  }

  async function claimTask(input) {
    const ownerId = clean(input.ownerId, 120);
    const projectId = clean(input.projectId, 160);
    const projectKind = clean(input.projectKind, 20);
    const nodeId = clean(input.nodeId, 160);
    const idempotencyKey = clean(input.idempotencyKey, 200);
    const submitted = input.submitted && typeof input.submitted === 'object' ? input.submitted : {};
    if (!ownerId || !projectId || !['redraw','script'].includes(projectKind) || !nodeId || !idempotencyKey) throw taskError('STUDIO_TASK_INPUT_INVALID', '视频任务信息无效', 422);
    return withWriteLock(async () => {
      const state = await readState();
      const existing = state.tasks.find(task => task.ownerId === ownerId && task.projectId === projectId && task.idempotencyKey === idempotencyKey);
      if (existing) return {created:false,task:existing};
      const now = Date.now();
      cleanExpiredGrants(state, now);
      const grant = state.grants.find(item => item.id === clean(input.grantId, 160));
      if (!grant || grant.ownerId !== ownerId || grant.projectId !== projectId || grant.projectKind !== projectKind || grant.expiresAtMs <= now || !grant.nodeIds.includes(nodeId) || grant.usedNodeIds.includes(nodeId)) {
        throw taskError('STUDIO_SPEND_CONFIRMATION_REQUIRED', '请重新确认本次视频生成', 422);
      }
      grant.usedNodeIds.push(nodeId);
      const task = {
        schemaVersion:'niannian.nomi_web_task.v1',
        id:taskId(), ownerId, projectId, projectKind, nodeId, idempotencyKey,
        status:'submitting',
        mode:clean(submitted.mode, 40),
        modelKey:clean(submitted.modelKey, 160),
        prompt:clean(submitted.prompt, 4000),
        inputAssetIds:{
          images:orderedStringList(submitted.inputAssetIds?.images, 9, 80),
          audio:orderedStringList(submitted.inputAssetIds?.audio, 3, 80),
          videos:orderedStringList(submitted.inputAssetIds?.videos, 3, 80)
        },
        parameters:submitted.parameters && typeof submitted.parameters === 'object' ? submitted.parameters : {},
        workflowId:null, providerTaskId:null, outputAssetIds:[], assets:[], error:null,
        createdAt:new Date(now).toISOString(), updatedAt:new Date(now).toISOString(), submittedAt:null, completedAt:null
      };
      state.tasks.push(task);
      await writeState(state);
      return {created:true,task};
    });
  }

  async function updateOwnedTask(ownerId, projectId, id, patch) {
    const cleanOwner = clean(ownerId, 120);
    const cleanProject = clean(projectId, 160);
    const cleanId = clean(id, 200);
    return withWriteLock(async () => {
      const state = await readState();
      const task = state.tasks.find(item => item.id === cleanId && item.ownerId === cleanOwner && item.projectId === cleanProject);
      if (!task) return null;
      const allowedStatus = new Set(['submitting','queued','running','succeeded','failed','recoverable','needs_input']);
      if (patch.status && allowedStatus.has(patch.status)) task.status = patch.status;
      if (patch.workflowId !== undefined) task.workflowId = clean(patch.workflowId, 100) || null;
      if (patch.providerTaskId !== undefined) task.providerTaskId = clean(patch.providerTaskId, 160) || null;
      if (patch.error !== undefined) task.error = clean(patch.error, 500) || null;
      if (patch.outputAssetIds !== undefined) task.outputAssetIds = stringList(patch.outputAssetIds, 20, 80);
      if (patch.assets !== undefined) {
        task.assets = Array.isArray(patch.assets)
          ? patch.assets.map(asset => ({
            type:clean(asset?.type, 20),
            assetId:clean(asset?.assetId, 80) || null,
            url:clean(asset?.url, 600),
            thumbnailUrl:clean(asset?.thumbnailUrl, 600) || null
          })).filter(asset => asset.type === 'video' && /^\/api\/projects\/[^/]+\/assets\/CAS-[a-f0-9]{24}\/download$/.test(asset.url))
          : [];
      }
      if (patch.submittedAt !== undefined) task.submittedAt = patch.submittedAt;
      if (patch.completedAt !== undefined) task.completedAt = patch.completedAt;
      task.updatedAt = new Date().toISOString();
      await writeState(state);
      return task;
    });
  }

  async function getOwnedTask(ownerId, projectId, id) {
    const state = await readState();
    return state.tasks.find(task => task.id === clean(id, 200) && task.ownerId === clean(ownerId, 120) && task.projectId === clean(projectId, 160)) || null;
  }

  async function listOwnedTasks(ownerId, projectId, projectKind = null) {
    const cleanOwner = clean(ownerId, 120);
    const cleanProject = clean(projectId, 160);
    const cleanKind = projectKind == null ? null : clean(projectKind, 20);
    const state = await readState();
    return state.tasks
      .filter(task => task.ownerId === cleanOwner && task.projectId === cleanProject && (!cleanKind || task.projectKind === cleanKind))
      .sort((left, right) => String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || '')));
  }

  return {createGrant,claimTask,updateOwnedTask,getOwnedTask,listOwnedTasks,constants:{filePath}};
}

module.exports = {createNomiWebTaskStore};
