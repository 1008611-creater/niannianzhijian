'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

function jobError(code, message, httpStatus = 400) {
  const error = new Error(message || code);
  error.code = code;
  error.httpStatus = httpStatus;
  return error;
}

function clean(value, limit = 4000) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, limit);
}

function createCanvasTextJobService(options = {}) {
  const filePath = path.resolve(options.filePath);
  let writeTail = Promise.resolve();

  async function ensureStore() {
    await fsp.mkdir(path.dirname(filePath), {recursive:true});
    try { await fsp.access(filePath); } catch { await fsp.writeFile(filePath, '[]\n', {flag:'wx'}); }
  }

  async function readAll() {
    await ensureStore();
    const value = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    return Array.isArray(value) ? value : [];
  }

  async function writeAll(value) {
    await ensureStore();
    const temporary = filePath + '.tmp-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
    await fsp.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
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

  function publicJob(job) {
    return {
      id: job.id,
      projectId: job.projectId,
      projectKind: job.projectKind,
      nodeId: job.nodeId,
      kind: 'chat',
      model: job.model,
      status: ['succeeded','failed','recoverable'].includes(job.status) ? job.status : 'running',
      text: job.text || null,
      raw: job.text ? {choices:[{message:{role:'assistant',content:job.text}}],model:job.model,object:'chat.completion'} : null,
      error: job.error || null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt || null
    };
  }

  async function create(input = {}) {
    const ownerId = clean(input.ownerId, 120);
    const projectId = clean(input.projectId, 160);
    const projectKind = clean(input.projectKind, 20);
    const nodeId = clean(input.nodeId, 160);
    const model = clean(input.model, 200);
    const prompt = clean(input.prompt, 12000);
    const idempotencyKey = clean(input.idempotencyKey, 200);
    if (!ownerId || !projectId || !['redraw','script'].includes(projectKind) || !nodeId || !model || !prompt || !idempotencyKey) throw jobError('CANVAS_TEXT_JOB_INPUT_INVALID', '文本任务信息无效', 422);
    return withWriteLock(async () => {
      const jobs = await readAll();
      const existing = jobs.find(job => job.ownerId === ownerId && job.projectId === projectId && job.idempotencyKey === idempotencyKey);
      if (existing) return {created:false, job:existing};
      const now = new Date().toISOString();
      const job = {schemaVersion:'niannian.canvas_text_job.v1',id:'CTJ-' + crypto.randomBytes(12).toString('hex'),ownerId,projectId,projectKind,nodeId,model,prompt,idempotencyKey,status:'running',text:null,error:null,createdAt:now,updatedAt:now,completedAt:null};
      jobs.push(job);
      await writeAll(jobs);
      return {created:true, job};
    });
  }

  async function getOwned(ownerId, projectId, id) {
    const jobs = await readAll();
    return jobs.find(job => job.ownerId === clean(ownerId, 120) && job.projectId === clean(projectId, 160) && job.id === clean(id, 200)) || null;
  }

  async function updateOwned(ownerId, projectId, id, patch = {}) {
    return withWriteLock(async () => {
      const jobs = await readAll();
      const index = jobs.findIndex(job => job.ownerId === clean(ownerId, 120) && job.projectId === clean(projectId, 160) && job.id === clean(id, 200));
      if (index < 0) return null;
      const job = jobs[index];
      if (['succeeded','failed','recoverable'].includes(patch.status)) job.status = patch.status;
      if (patch.text !== undefined) job.text = clean(patch.text, 24000) || null;
      if (patch.error !== undefined) job.error = clean(patch.error, 500) || null;
      if (patch.completedAt !== undefined) job.completedAt = patch.completedAt || null;
      job.updatedAt = new Date().toISOString();
      await writeAll(jobs);
      return job;
    });
  }

  return {create, getOwned, updateOwned, publicJob, constants:{filePath}};
}

module.exports = {createCanvasTextJobService};
